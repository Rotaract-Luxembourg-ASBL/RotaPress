import "server-only";
import { and, eq } from "drizzle-orm";
import { clubEvent } from "../../../db/schema/events";
import {
  AuthorizationService,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { CmsService } from "../cms/CmsService";
import type { FormService } from "../forms/FormService";
import type { EventService } from "./EventService";
import type { EventModuleService } from "./EventModuleService";
import type { RegistrationService } from "./RegistrationService";
import { eventFieldsSchema } from "./event_schemas";
import { eventModules, type EventModuleKey } from "./event_modules";
import { eventPageEditorHref } from "./event_routes";
import { EventPrizeReader } from "./EventPrizeReader";
import type {
  EventParticipationPlacement,
  EventReadiness,
} from "./event_readiness";

/** One scoped snapshot of configuration and actual saved/public placement, without private records. */
export class EventReadinessService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly cms: CmsService,
    private readonly forms: FormService,
    private readonly registrations: RegistrationService,
    private readonly externalRegistration?: {
      readiness(
        actor: TrustedActor,
        eventId: string,
        executor: DatabaseExecutor,
      ): Promise<{
        enabled: boolean;
        published: boolean;
      }>;
    },
  ) {}

  async read(actor: TrustedActor, id: string): Promise<EventReadiness> {
    return this.db.transaction((tx) => this.snapshot(actor, id, tx), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }

  private async snapshot(
    actor: TrustedActor,
    id: string,
    executor: DatabaseExecutor,
  ): Promise<EventReadiness> {
    const event = await this.events.detail(actor, id, executor);
    const { organizationId } = await this.authorization.approved(
      actor,
      executor,
    );
    const [row] = await executor
      .select({ published: clubEvent.published })
      .from(clubEvent)
      .where(
        and(eq(clubEvent.id, id), eq(clubEvent.organizationId, organizationId)),
      );
    const published = row.published
      ? eventFieldsSchema.parse(row.published)
      : null;
    const states = await this.modules.readiness(organizationId, id, executor);
    const pages = await this.cms.eventParticipation(actor, id, executor);
    const forms = await this.forms.eventReadiness(actor, id, executor);
    const registration = await this.registrations.readiness(
      actor,
      id,
      executor,
    );
    const enquiryForms = forms.filter((form) => form.kind === "event");
    const publishedForms = enquiryForms.filter((form) => form.published);
    const formPublished = forms.some(
      (form) =>
        form.id === registration.formId &&
        form.kind === "registration" &&
        form.published,
    );
    const websitePages = pages.filter((page) => page.moduleKey === "website");
    const websitePublished = websitePages.some((page) => page.pagePublished);
    const prizes = await new EventPrizeReader().published(
      organizationId,
      id,
      executor,
    );
    const eventReasons: string[] = [];
    if (event.archived)
      eventReasons.push(
        "This event is archived. Copy it to prepare another event.",
      );
    if (!published) eventReasons.push("Publish the event details.");
    const publicReasons = [...eventReasons];
    if (published?.visibility === "private")
      publicReasons.push(
        "This event is private. Only event staff can open it.",
      );

    const featureReasons = (key: EventModuleKey) => {
      const reasons = [
        ...states.find((module) => module.key === key)!.reasons,
        ...(key === "portal" ? eventReasons : publicReasons),
      ];
      if (["forms", "registration", "portal"].includes(key) && event.cancelled)
        reasons.push("This event is cancelled; participation is closed.");
      if (key === "website" && !websitePublished)
        reasons.push("Publish the event's main page.");
      if (key === "prizes") {
        if (!prizes.length) reasons.push("Add and publish a prize in Prizes.");
        if (
          !websitePages.some(
            (page) => page.pagePublished && page.published.prizes,
          )
        )
          reasons.push(
            "Add a visible Published prizes section and publish the event page.",
          );
      }
      return [...new Set(reasons)];
    };
    const formReasons = featureReasons("forms");
    if (!publishedForms.length)
      formReasons.push("Create and publish an event enquiry form.");
    // Forms is also a dependency of native booking. Enquiry forms are optional.
    const formModuleReasons =
      registration.authority === "native" && formPublished
        ? featureReasons("forms")
        : formReasons;
    const registrationReasons = featureReasons("registration");
    if (registration.authority === "none")
      registrationReasons.push(
        "Choose and save a registration form or a registration provider.",
      );
    if (registration.authority === "native" && !formPublished)
      registrationReasons.push(
        "Choose and publish this event's registration form.",
      );
    if (registration.authority === "luma") {
      const external = await this.externalRegistration?.readiness(
        actor,
        id,
        executor,
      );
      if (!external?.enabled)
        registrationReasons.push("Enable Luma in club Integrations.");
      if (!external?.published)
        registrationReasons.push(
          "Publish this event's Luma registration link.",
        );
    }
    // A native closed/full card remains visible; booking availability is separate.
    // External links disappear when unpublished/closed at their provider gate.
    const registrationVisible =
      registrationReasons.length === 0 &&
      (registration.authority === "native" || registration.open);
    if (registration.authority !== "none" && !registration.open)
      registrationReasons.push("Open registration to accept new bookings.");
    if (registration.authority === "native" && registration.full)
      registrationReasons.push("Registration has reached its capacity.");

    const websiteAvailable =
      publicReasons.length === 0 &&
      states.some((module) => module.key === "website" && module.available);
    const placement = (
      kind: "form" | "registration",
      available: boolean,
    ): EventParticipationPlacement => {
      const matches = (value: (typeof pages)[number]["draft"]) =>
        kind === "registration"
          ? value.registration
          : value.formIds.some((formId) =>
              enquiryForms.some((form) => form.id === formId),
            );
      const projected = websitePages.map((page) => ({
        id: page.id,
        locale: page.locale,
        moduleKey: "website" as const,
        draft: matches(page.draft),
        published: matches(page.published),
        live:
          available &&
          websiteAvailable &&
          page.pagePublished &&
          (kind === "registration"
            ? page.published.registration
            : page.published.formIds.some((formId) =>
                publishedForms.some((form) => form.id === formId),
              )),
        editorHref:
          !event.archived &&
          !event.cancelled &&
          event.capabilities.includes("events.edit")
            ? eventPageEditorHref(id, page.id, page.locale)
            : null,
        publicHref:
          websiteAvailable && page.pagePublished
            ? `/events/${event.slug}/${page.locale}/website`
            : null,
      }));
      return {
        draft: projected.some((page) => page.draft),
        published: projected.some((page) => page.published),
        live: projected.some((page) => page.live),
        pages: projected,
      };
    };
    const formsReady = {
      publishedCount: publishedForms.length,
      available: formReasons.length === 0,
      reasons: formReasons,
      placement: placement("form", formReasons.length === 0),
    };
    const registrationReady = {
      ...registration,
      formPublished,
      available: registrationReasons.length === 0,
      reasons: registrationReasons,
      placement: placement("registration", registrationVisible),
    };
    return {
      eventId: id,
      eventPublished: published !== null,
      publishedVisibility: published?.visibility ?? null,
      archived: event.archived,
      cancelled: event.cancelled,
      modules: states.map((module) => {
        const reasons =
          module.key === "forms"
            ? formModuleReasons
            : module.key === "registration"
              ? registrationReasons
              : featureReasons(module.key);
        if (
          ["gallery", "sponsors"].includes(module.key) &&
          !pages.some(
            (page) => page.moduleKey === module.key && page.pagePublished,
          )
        )
          reasons.push(
            `Publish a ${eventModules[module.key].label.toLowerCase()} page.`,
          );
        return { ...module, available: reasons.length === 0, reasons };
      }),
      forms: formsReady,
      registration: registrationReady,
    };
  }
}
