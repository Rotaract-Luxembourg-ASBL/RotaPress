import "server-only";
import { eventPageTemplate } from "./event_page_template";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { clubEvent } from "../../../db/schema/events";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import {
  CmsEventCopyService,
  type EventPageCopy,
} from "../cms/CmsEventCopyService";
import {
  FormEventCopyService,
  type EventFormCopy,
} from "../forms/FormEventCopyService";
import { starterDefinition } from "../forms/form_schemas";
import type { MediaService } from "../media/MediaService";
import { EventService } from "./EventService";
import { EventModuleService } from "./EventModuleService";
import { RegistrationService } from "./RegistrationService";
import {
  EventPackageCopyService,
  type PackageCopy,
} from "./EventPackageCopyService";
import { EventPrizeCopyService, type PrizeCopy } from "./EventPrizeCopyService";
import {
  eventPageModuleKeySchema,
  eventModules,
  type EventModuleState,
} from "./event_modules";
import {
  eventPresets,
  eventTemplateInputSchema,
  eventTemplateCreateSchema,
  presetModules,
  type EventTemplateSelection,
  type EventTemplateReview,
} from "./event_templates";

type Snapshot = {
  source: string;
  sourceVersion: number;
  modules: EventModuleState[];
  pages: EventPageCopy[];
  forms: EventFormCopy[];
  packages: PackageCopy[];
  prizes: PrizeCopy[];
  registration: {
    authority: "none" | "native";
    capacity: number | null;
    sourceFormId: string | null;
  };
};

/** Atomic composition of existing event, CMS, form and registration services. */
export class EventTemplateService {
  private readonly audit = new AuditRepository();
  private readonly packages = new EventPackageCopyService();
  private readonly prizes: EventPrizeCopyService;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly cms: CmsEventCopyService,
    private readonly forms: FormEventCopyService,
    private readonly registrations: RegistrationService,
    media: MediaService,
  ) {
    this.prizes = new EventPrizeCopyService(media);
  }

  private async snapshot(
    actor: TrustedActor,
    organizationId: string,
    selection: EventTemplateSelection,
    tx: Transaction,
  ): Promise<Snapshot> {
    if (selection.kind === "copy") {
      const source = await this.events.detail(actor, selection.id, tx);
      this.events.requireCapability(source, "events.edit");
      return {
        source: source.title,
        sourceVersion: source.version,
        modules: await this.modules.states(organizationId, source.id, tx),
        pages: await this.cms.snapshot(organizationId, source.id, tx),
        forms: await this.forms.snapshot(organizationId, source.id, tx),
        packages: await this.packages.snapshot(organizationId, source.id, tx),
        prizes: await this.prizes.snapshot(organizationId, source.id, tx),
        registration: await this.registrations.templateSnapshot(
          organizationId,
          source.id,
          tx,
        ),
      };
    }
    const preset = eventPresets[selection.id];
    const modules = presetModules(selection.id, selection.selectedModules);
    const formsEnabled = modules.some(
      (module) => module.key === "forms" && module.state === "enabled",
    );
    const registrationEnabled = modules.some(
      (module) => module.key === "registration" && module.state === "enabled",
    );
    const pages: EventPageCopy[] = modules
      .filter(
        (m) =>
          m.state === "enabled" &&
          eventPageModuleKeySchema.safeParse(m.key).success,
      )
      .map((m) => {
        const moduleKey = eventPageModuleKeySchema.parse(m.key);
        const data = eventPageTemplate(moduleKey);
        if (moduleKey === "website") {
          if (registrationEnabled)
            data.content.splice(data.content.length - 1, 0, {
              type: "EventRegistration",
              props: { id: "event-registration", version: 1 },
            });
          else if (formsEnabled)
            data.content.splice(data.content.length - 1, 0, {
              type: "Form",
              props: {
                id: "event-enquiry",
                version: 1,
                formId: "preset-form",
              },
            });
        }
        return {
          sourceId: m.key,
          revisionId: "preset-v4",
          moduleKey,
          locale: "en",
          archived: false,
          draft: {
            title: eventModules[m.key].label,
            slug: m.key,
            description: "",
            socialImageId: null,
            data,
          },
        };
      });
    const forms: EventFormCopy[] = !formsEnabled
      ? []
      : [
          {
            sourceId: "preset-form",
            revision: 1,
            kind: registrationEnabled ? "registration" : "event",
            archived: false,
            definition: starterDefinition(
              registrationEnabled ? "registration" : "event",
              registrationEnabled
                ? "Free registration"
                : selection.id === "fundraiser"
                  ? "Fundraiser enquiry"
                  : "Event enquiry",
            ),
          },
        ];
    return {
      source: preset.label,
      sourceVersion: 4,
      modules,
      pages,
      forms,
      packages: [],
      prizes: [],
      registration: {
        authority: registrationEnabled ? "native" : "none",
        capacity: null,
        sourceFormId: registrationEnabled ? "preset-form" : null,
      },
    };
  }

  private token(actor: TrustedActor, input: unknown, snapshot: Snapshot) {
    return createHash("sha256")
      .update(JSON.stringify({ actor: actor.userId, input, snapshot }))
      .digest("hex");
  }

  async preview(
    actor: TrustedActor,
    input: unknown,
  ): Promise<EventTemplateReview> {
    const parsed = eventTemplateInputSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "events.create",
        tx,
      );
      const snapshot = await this.snapshot(
        actor,
        organizationId,
        parsed.template,
        tx,
      );
      return {
        token: this.token(actor, parsed, snapshot),
        source: snapshot.source,
        modules: snapshot.modules,
        pages: snapshot.pages.map((p) => ({
          title: p.draft.title,
          locale: p.locale,
          archived: p.archived,
        })),
        forms: snapshot.forms.map((f) => ({
          title: f.definition.title,
          kind: f.kind,
          archived: f.archived,
        })),
        packages: snapshot.packages.map((p) => ({ title: p.draft.title })),
        prizes: snapshot.prizes.map((p) => ({ title: p.draft.title })),
        registration: {
          authority: snapshot.registration.authority,
          capacity: snapshot.registration.capacity,
        },
      };
    });
  }

  async create(actor: TrustedActor, input: unknown) {
    const values = eventTemplateCreateSchema.parse(input);
    const parsed = eventTemplateInputSchema.parse({
      event: values.event,
      template: values.template,
    });
    const id = await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "events.create",
        tx,
      );
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ parsed, token: values.reviewToken }))
        .digest("hex");
      const [existing] = await tx
        .select({ id: clubEvent.id, token: clubEvent.creationReviewToken })
        .from(clubEvent)
        .where(
          and(
            eq(clubEvent.organizationId, organizationId),
            eq(clubEvent.createdBy, actor.userId),
            eq(clubEvent.creationRequestId, values.requestId),
          ),
        );
      if (existing) {
        if (existing.token !== fingerprint)
          throw new DomainError(
            "EVENT_CREATION_REPLAY_CONFLICT",
            "This creation request was already used for different event details.",
            409,
          );
        return existing.id;
      }
      const snapshot = await this.snapshot(
        actor,
        organizationId,
        parsed.template,
        tx,
      );
      if (this.token(actor, parsed, snapshot) !== values.reviewToken)
        throw new DomainError(
          "EVENT_TEMPLATE_REVIEW_CHANGED",
          "The event details, source content or feature configuration changed. Review this starting copy again.",
          409,
        );
      const id = await this.events.createDraft(actor, parsed.event, tx);
      await tx
        .update(clubEvent)
        .set({
          creationRequestId: values.requestId,
          creationReviewToken: fingerprint,
        })
        .where(eq(clubEvent.id, id));
      await this.modules.initializeDraft(
        organizationId,
        id,
        snapshot.modules,
        tx,
      );
      const formIds = await this.forms.createDrafts(
        organizationId,
        id,
        snapshot.forms,
        tx,
      );
      await this.cms.createDrafts(
        actor,
        organizationId,
        id,
        snapshot.pages,
        tx,
        formIds,
      );
      await this.registrations.initializeCopy(
        organizationId,
        id,
        snapshot.registration,
        formIds,
        tx,
      );
      await this.packages.createDrafts(
        organizationId,
        id,
        snapshot.packages,
        tx,
      );
      await this.prizes.createDrafts(organizationId, id, snapshot.prizes, tx);
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.template_created",
        targetId: id,
      });
      return id;
    });
    return this.events.detail(actor, id);
  }
}
