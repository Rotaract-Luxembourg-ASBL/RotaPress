import "server-only";
import type { services } from "@/composition/services";
import { DomainError } from "@/core/DomainError";
import { contentAssets } from "@/features/cms/cms_validation";
import {
  emptyCmsData,
  isSitePart,
  flattenBlocks,
} from "@/features/cms/cms_schemas";
import { eventFields } from "@/features/events/event_schemas";
import type { AutomationPrincipal } from "./AutomationAccess";
import { PreviewBrowser } from "./preview_browser";
import { fetchPreviewDocument, previewOrigin } from "./preview_assets";
import {
  claimPreviewRenderer,
  issuePreviewDocument,
  type PreviewDocument,
} from "./preview_snapshot";
import {
  previewInput,
  type PreviewInput,
  type PreviewOutput,
} from "./preview_schemas";

type Dependencies = {
  cms: Pick<typeof services.cms, "detail" | "preview" | "publicSite">;
  events: Pick<typeof services.events, "detail">;
  organization: Pick<typeof services.organization, "publicIdentity">;
  media: Pick<typeof services.media, "read">;
  authorization: Pick<typeof services.authorization, "require">;
  limiter: Pick<typeof services.limiter, "consume">;
};

function requireGrants(principal: AutomationPrincipal) {
  if (
    !principal.scopes.includes("website:read") ||
    !principal.scopes.includes("website:preview")
  )
    throw new DomainError(
      "AUTOMATION_SCOPE_DENIED",
      "This connection needs website reading and visual preview grants.",
      403,
    );
}

/** Produces ephemeral private pixels from one saved revision, never from a supplied URL. */
export class WebsitePreviewService {
  constructor(
    private readonly services: Dependencies,
    private readonly browser: Pick<
      PreviewBrowser,
      "capture"
    > = new PreviewBrowser(),
    private readonly documentFetcher = fetchPreviewDocument,
  ) {}

  async capture(
    principal: AutomationPrincipal,
    raw: unknown,
    reauthorize: () => Promise<AutomationPrincipal>,
  ): Promise<PreviewOutput> {
    const input = previewInput.parse(raw);
    requireGrants(principal);
    await this.services.authorization.require(principal.actor, "cms.edit");
    await this.services.limiter.consume(
      "automation-preview",
      principal.keyId,
      8,
    );
    const release = claimPreviewRenderer();
    let revoke: (() => void) | undefined;
    try {
      const snapshot = await this.load(principal, input);
      const contents = [
        snapshot.page.data,
        ...Object.values(snapshot.page.sections),
        snapshot.site.header,
        snapshot.site.footer,
      ].filter((data) => data !== null);
      const referenced = new Set(
        contents.flatMap((data) => contentAssets(data)),
      );
      for (const profile of Object.values(snapshot.page.partners ?? {}))
        if (profile.logoId) referenced.add(profile.logoId);
      if (snapshot.site.branding?.logoId)
        referenced.add(snapshot.site.branding.logoId);
      const warnings = new Set<string>([
        "Saved draft with published site appearance and shared sections. Interactive controls and custom code are inactive.",
      ]);
      const blocks = contents.flatMap((data) => flattenBlocks(data.content));
      if (
        blocks.some((block) =>
          [
            "Form",
            "Calendar",
            "EventRegistration",
            "EventPackages",
            "EventPrizes",
            "EventWinners",
            "CustomCode",
          ].includes(block.type),
        )
      )
        warnings.add(
          "Interactive and custom-code blocks show their native preview placeholders; review their working state in administration.",
        );
      const privateMedia = principal.scopes.includes("media:inspect");
      let privateUsed = false;
      const ticket = issuePreviewDocument(snapshot);
      revoke = ticket.revoke;
      const origin = previewOrigin();
      const document = await this.documentFetcher(origin, ticket.token);
      const capture = await this.browser.capture({
        origin,
        document,
        input,
        asset: async (id) => {
          try {
            const image = await this.services.media.read(
              privateMedia && referenced.has(id) ? principal.actor : null,
              id,
            );
            if (image.visibility === "private") privateUsed = true;
            return image;
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            warnings.add(
              "Some media could not be displayed. Private media requires the media:inspect grant and current media permission.",
            );
            return null;
          }
        },
      });
      const current = await reauthorize();
      requireGrants(current);
      if (
        current.organizationId !== principal.organizationId ||
        current.actor.userId !== principal.actor.userId ||
        current.keyId !== principal.keyId
      )
        throw new DomainError(
          "AUTOMATION_ACCESS_CHANGED",
          "The connection changed while previewing. Reconnect and try again.",
          403,
        );
      if (privateUsed) {
        if (!current.scopes.includes("media:inspect"))
          throw new DomainError(
            "AUTOMATION_SCOPE_DENIED",
            "The private media inspection grant is no longer available.",
            403,
          );
        await this.services.authorization.require(
          current.actor,
          "media.manage",
        );
      }
      const latest = await this.services.cms.detail(
        current.actor,
        input.id,
        input.locale,
      );
      if (latest.draft.id !== input.expectedRevisionId) this.conflict();
      if (snapshot.event) {
        const latestEvent = await this.services.events.detail(
          current.actor,
          snapshot.event.id,
        );
        if (latestEvent.version !== snapshot.event.version) this.conflict();
      }
      return {
        id: input.id,
        locale: input.locale,
        revisionId: input.expectedRevisionId,
        device: input.device,
        ...capture,
        warnings: [...warnings, ...capture.warnings],
        appearance: "published",
        capturedAt: new Date().toISOString(),
        reviewUrl: `/admin/website/${input.id}/preview?locale=${input.locale}`,
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "PREVIEW_UNAVAILABLE",
        "Visual preview could not complete. Check the installed Chromium runtime and try again.",
        503,
      );
    } finally {
      revoke?.();
      release();
    }
  }

  private async load(
    principal: AutomationPrincipal,
    input: PreviewInput,
  ): Promise<PreviewDocument> {
    const { actor } = principal;
    const detail = await this.services.cms.detail(
      actor,
      input.id,
      input.locale,
    );
    if (detail.draft.id !== input.expectedRevisionId) this.conflict();
    const page = await this.services.cms.preview(actor, input.id, input.locale);
    if (page.revisionId !== input.expectedRevisionId) this.conflict();
    const [club, site] = await Promise.all([
      this.services.organization.publicIdentity(),
      this.services.cms.publicSite(input.locale),
    ]);
    const event = detail.event
      ? await this.services.events.detail(actor, detail.event.id)
      : null;
    return {
      page: isSitePart(page.kind)
        ? {
            ...page,
            kind: "page",
            title: "Shared part preview",
            data: emptyCmsData,
            sections: {},
          }
        : page,
      site: isSitePart(page.kind) ? { ...site, [page.kind]: page.data } : site,
      club,
      event: event
        ? {
            id: event.id,
            version: event.version,
            cancelled: event.cancelled,
            fields: eventFields(event),
          }
        : null,
    };
  }

  private conflict(): never {
    throw new DomainError(
      "REVISION_CONFLICT",
      "The saved page or event changed. Read the latest draft before requesting another preview.",
      409,
    );
  }
}
