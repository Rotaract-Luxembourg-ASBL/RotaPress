import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { cmsLocaleSchema, isSitePart } from "@/features/cms/cms_schemas";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { EventPublicDetails } from "@/features/events/ui/event-public-details";
import { DomainError } from "@/core/authorization/AuthorizationService";

export const dynamic = "force-dynamic";
export default async function DraftPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    locale?: string;
    appearance?: string;
    snapshot?: string;
  }>;
}) {
  const actor = await getActor(await headers());
  if (!actor) redirect("/sign-in?next=/admin");
  const locale = cmsLocaleSchema.parse((await searchParams).locale ?? "en");
  const snapshot = (await searchParams).snapshot;
  let unsaved;
  try {
    unsaved = snapshot
      ? await services.previews.read(actor, (await params).id, locale, snapshot)
      : null;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return (
      <main className="panel">
        <h1>Preview unavailable</h1>
        <p>{error.message}</p>
      </main>
    );
  }
  const page =
    unsaved?.page ??
    (await services.cms.preview(actor, (await params).id, locale));
  const [club, site] = await Promise.all([
    services.organization.publicIdentity(),
    (await searchParams).appearance === "draft"
      ? services.cms.previewSite(actor, locale)
      : services.cms.publicSite(locale),
  ]);
  if (isSitePart(page.kind)) {
    const home = await services.cms.publicHome(locale);
    const contextPage = home.page ?? {
      ...page,
      kind: "page" as const,
      title: "Page content",
      data: { root: { props: {} }, content: [] },
      sections: {},
    };
    return (
      <CmsPublicPage
        page={contextPage}
        site={{ ...site, [page.kind]: page.data }}
        club={club}
        preview
        previewLabel={`Private shared ${page.kind} preview. Publishing applies to every ${locale.toUpperCase()} page. These changes are not published.`}
      />
    );
  }
  const detail = await services.cms.detail(actor, page.id, locale);
  const currentEvent = detail.event
    ? await services.events.detail(actor, detail.event.id)
    : null;
  const event = unsaved?.event ?? currentEvent;
  return (
    <CmsPublicPage
      page={page}
      site={site}
      club={club}
      eventId={detail.event?.id}
      eventDetails={event ?? undefined}
      preview
      previewLabel={
        event
          ? `Private event preview: ${event.title}. ${snapshot ? "Unsaved changes" : "Saved draft"}; publication remains unchanged.`
          : snapshot
            ? "Private preview of unsaved changes. Nothing has been saved or published."
            : undefined
      }
      beforeContent={
        event ? (
          <EventPublicDetails
            event={event}
            cancelled={currentEvent?.cancelled}
            locale={locale}
            pageData={page.data}
          />
        ) : undefined
      }
    />
  );
}
