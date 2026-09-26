import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { takePreviewDocument } from "@/integrations/automation/preview_snapshot";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { EventPublicDetails } from "@/features/events/ui/event-public-details";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Private visual preview",
};

/** Receives only an immutable scoped snapshot, with no staff cookies or API keys. */
export default async function AutomationPreviewDocument() {
  const snapshot = takePreviewDocument(await headers());
  if (!snapshot) notFound();
  const { page, site, club, event } = snapshot;
  return (
    <div data-automation-preview-revision={page.revisionId}>
      <CmsPublicPage
        page={page}
        site={site}
        club={club}
        preview
        previewLabel=""
        eventId={event?.id}
        eventDetails={event?.fields}
        beforeContent={
          event ? (
            <EventPublicDetails
              event={event.fields}
              cancelled={event.cancelled}
              locale={page.locale}
              pageData={page.data}
            />
          ) : undefined
        }
      />
    </div>
  );
}
