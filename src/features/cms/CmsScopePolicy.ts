import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { calendar } from "../../../db/schema/calendar";
import { PartnerReader } from "../partners/PartnerReader";
import { contentPartners } from "./cms_validation";
import { cmsContent } from "../../../db/schema/cms";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../events/EventService";
import { EventModuleService } from "../events/EventModuleService";
import {
  eventBlockTypes,
  type EventPageModuleKey,
} from "../events/event_modules";
import { CmsRepository } from "./CmsRepository";
import { contentAssets } from "./cms_validation";
import { MediaService } from "../media/MediaService";
import { flattenBlocks, type CmsData } from "./cms_schemas";
import { eventOnlyBlockTypes } from "../events/event_content";
import { visibleEventContent } from "../events/event_design";

type Content = typeof cmsContent.$inferSelect;
export class CmsScopePolicy {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly repository: CmsRepository,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly media: MediaService,
  ) {}

  async read(
    actor: TrustedActor,
    id: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const scope = await this.authorization.approved(actor, executor);
    const content = await this.repository.content(
      scope.organizationId,
      id,
      executor,
    );
    if (content?.eventId)
      await this.events.detail(actor, content.eventId, executor);
    else await this.authorization.require(actor, "cms.edit", executor);
    return scope;
  }

  async lock(
    actor: TrustedActor,
    id: string,
    capability: "cms.edit" | "cms.publish",
    tx: Transaction,
  ) {
    const scope = await this.read(actor, id, tx);
    const content = await this.repository.content(scope.organizationId, id, tx);
    if (!content?.eventId)
      return this.authorization.lock(actor, capability, tx);
    const { event } = await this.events.lockEvent(actor, content.eventId, tx);
    this.events.requireCapability(
      event,
      capability === "cms.publish" ? "events.publish" : "events.edit",
    );
    this.events.requireActive(event);
    if (event.archived)
      throw new DomainError(
        "EVENT_ARCHIVED",
        "Archived events are read-only.",
        409,
      );
    await this.modules.requireEnabled(
      scope.organizationId,
      event.id,
      content.moduleKey!,
      tx,
    );
    return scope;
  }

  async create(
    actor: TrustedActor,
    eventId: string,
    key: EventPageModuleKey,
    tx: Transaction,
  ) {
    const { organizationId, event } = await this.events.lockEvent(
      actor,
      eventId,
      tx,
    );
    this.events.requireCapability(event, "events.edit");
    this.events.requireActive(event);
    if (event.archived)
      throw new DomainError(
        "EVENT_ARCHIVED",
        "Archived events are read-only.",
        409,
      );
    await this.modules.requireEnabled(organizationId, eventId, key, tx);
    return { organizationId };
  }

  async context(actor: TrustedActor, content: Content) {
    if (!content.eventId) return undefined;
    const event = await this.events.detail(actor, content.eventId);
    let readOnlyReason = event.cancelled
      ? "This event is cancelled."
      : event.archived
        ? "This event is archived."
        : "";
    if (!event.capabilities.includes("events.edit"))
      readOnlyReason = "Your event role can view this page but cannot edit it.";
    try {
      await this.modules.requireEnabled(
        content.organizationId,
        event.id,
        content.moduleKey!,
      );
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      readOnlyReason =
        "This feature is disabled or suspended. Its content and revisions are retained.";
    }
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      moduleKey: content.moduleKey!,
      canPublish: event.capabilities.includes("events.publish"),
      readOnlyReason,
    };
  }

  async validate(
    content: Pick<Content, "eventId" | "moduleKey" | "organizationId">,
    data: CmsData,
    socialImageId: string | null,
    executor: DatabaseExecutor,
  ) {
    const calendarIds = [
      ...new Set(
        flattenBlocks(data.content).flatMap((b) =>
          b.type === "Calendar" ? b.props.calendarIds : [],
        ),
      ),
    ];
    if (calendarIds.length) {
      const owned = await executor
        .select({ id: calendar.id })
        .from(calendar)
        .where(
          and(
            eq(calendar.organizationId, content.organizationId),
            inArray(calendar.id, calendarIds),
          ),
        );
      if (owned.length !== calendarIds.length)
        throw new DomainError(
          "CALENDAR_SCOPE",
          "Choose calendars belonging to this club.",
          422,
        );
    }
    if (!content.eventId) {
      if (
        data.root.props.eventLayout === "standalone" ||
        data.root.props.eventDesign !== undefined ||
        data.root.props.eventHiddenSections !== undefined ||
        flattenBlocks(data.content).some((block) =>
          eventOnlyBlockTypes.some((type) => type === block.type),
        )
      )
        throw new DomainError(
          "EVENT_SCOPE_REQUIRED",
          "Event designs, hidden sections, standalone layouts and event-only sections belong on an event page.",
          422,
        );
      return;
    }
    await new PartnerReader().assertReferences(
      content.organizationId,
      contentPartners(data),
      true,
      executor,
    );
    const allowed = eventBlockTypes[content.moduleKey!];
    const unsupported = data.content.filter(
      (block) => !allowed.includes(block.type),
    );
    if (unsupported.length)
      throw new DomainError(
        "EVENT_BLOCK_UNSUPPORTED",
        `This feature does not support: ${[...new Set(unsupported.map((block) => block.type))].join(", ")}. Content was not changed.`,
        422,
      );
    // Scoped event editors may select public club assets; private club media stays private.
    await this.media.assertPublicAssets(
      content.organizationId,
      contentAssets(data, socialImageId),
      executor,
    );
  }

  /** Saved disabled blocks remain editable; new publication reviews active features. */
  async validatePublication(content: Content, data: CmsData, tx: Transaction) {
    if (
      flattenBlocks(visibleEventContent(data).content).some(
        (b) => b.type === "Calendar",
      )
    )
      await this.authorization.features.require(
        content.organizationId,
        "calendar",
        tx,
      );
    if (
      content.eventId &&
      flattenBlocks(visibleEventContent(data).content).some(
        (block) =>
          block.type === "EventPrizes" || block.type === "EventWinners",
      )
    )
      await this.modules.requireEnabled(
        content.organizationId,
        content.eventId,
        "prizes",
        tx,
      );
  }
}
