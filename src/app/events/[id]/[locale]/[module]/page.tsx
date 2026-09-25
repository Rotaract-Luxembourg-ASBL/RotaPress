import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { EventPublicDetails } from "@/features/events/ui/event-public-details";
import { PublicFormContent } from "@/features/forms/ui/public-form";
import { DomainError } from "@/core/authorization/AuthorizationService";
import Link from "next/link";
import { LumaRegistrationCard } from "@/integrations/luma/ui/luma-registration-card";
import { config } from "@/core/config";
import { publicMetadata } from "@/features/cms/public_metadata";

export const dynamic = "force-dynamic";
// Keep private/unlisted event URLs out of search engines as well as public lists.
type EventPageProps = {
  params: Promise<{ id: string; locale: string; module: string }>;
};
export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { id, locale, module } = await params;
  // Crawler metadata never uses an authenticated projection of a private event.
  const result = await services.eventWebsite.publicPage(
    id,
    locale,
    ["forms", "registration"].includes(module) ? "website" : module,
  );
  if (!result || result.event.visibility !== "public")
    return { robots: { index: false, follow: false }, title: "Event" };
  const title = result.page.title;
  const description = result.page.description || result.event.description;
  const url = `${config.APP_URL}/events/${result.slug}/${locale}/${module}`;
  const images = result.page.socialImageId
    ? [
        `${config.APP_URL}/media/${result.page.socialImageId}?v=${result.page.revisionId}`,
      ]
    : [];
  const metadata = publicMetadata({
    clubName: (await services.organization.publicIdentity())?.name,
    title,
    description,
    canonical: url,
    origin: config.APP_URL,
    socialImageId: result.page.socialImageId,
    site: await services.cms.publicSite(result.page.locale),
  });
  return images.length
    ? {
        ...metadata,
        openGraph: { ...metadata.openGraph, images },
        twitter: { ...metadata.twitter, images },
      }
    : metadata;
}
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; module: string }>;
}) {
  const { id, locale, module } = await params;
  const actor = await getActor(await headers());
  const result = await services.eventWebsite.publicPage(
    id,
    locale,
    ["forms", "registration"].includes(module) ? "website" : module,
    actor,
  );
  if (!result) notFound();
  const load = async () => {
    try {
      if (result.cancelled) return { forms: null, registration: null };
      return {
        forms:
          module === "forms"
            ? await services.forms.publicEventForms(actor, result.eventId)
            : null,
        registration:
          module === "registration" && !result.lumaUrl
            ? await services.registrations.publicForm(actor, result.eventId)
            : null,
      };
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) notFound();
      throw error;
    }
  };
  const { forms, registration } = await load();
  const participation =
    module === "registration" && result.lumaUrl ? (
      <LumaRegistrationCard url={result.lumaUrl} />
    ) : forms ? (
      <>
        <h1>Event forms</h1>
        {forms.length ? (
          forms.map((form) => (
            <section className="panel" key={form.id}>
              <PublicFormContent form={form} />
            </section>
          ))
        ) : (
          <p>No forms are published.</p>
        )}
      </>
    ) : registration ? (
      <section className="panel">
        {(!registration.open || registration.full) && (
          <h1>Event registration</h1>
        )}
        {!registration.open ? (
          <p>Registration is closed.</p>
        ) : registration.full ? (
          <p>This event is full.</p>
        ) : (
          <PublicFormContent form={registration.form} headingLevel={1} />
        )}
        <p>
          <Link href="/registrations" className="text-link">
            My registrations
          </Link>
        </p>
      </section>
    ) : null;
  const [club, site] = await Promise.all([
    services.organization.publicIdentity(),
    services.cms.publicSite(locale),
  ]);
  return (
    <CmsPublicPage
      eventId={result.eventId}
      eventDetails={result.event}
      eventShareUrl={
        result.event.visibility !== "private"
          ? `${config.APP_URL}/events/${result.slug}/${result.page.locale}/${module}`
          : undefined
      }
      club={club}
      site={site}
      page={
        participation
          ? {
              ...result.page,
              data: { root: result.page.data.root, content: [] },
            }
          : result.page
      }
      showTitle={!participation}
      beforeContent={
        <>
          <EventPublicDetails
            event={result.event}
            cancelled={result.cancelled}
            locale={locale}
            navigation={result.navigation}
            current={module}
            pageData={participation ? undefined : result.page.data}
          />
          {participation}
        </>
      }
    />
  );
}
