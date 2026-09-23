import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/core/auth/actor";
import { DomainError } from "@/core/authorization/AuthorizationService";
import { services } from "@/composition/services";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { kits, kitIdSchema } from "@/features/cms/kits/catalogue";
import { cmsLocaleSchema } from "@/features/cms/cms_schemas";
import { TemplateContactPreview } from "@/features/cms/ui/template-contact-preview";

export const dynamic = "force-dynamic";
export default async function WebsitePreview({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string;
    recipe?: string;
    locale?: string;
    pageId?: string;
  }>;
}) {
  const actor = await getActor(await headers());
  if (!actor) redirect("/sign-in?next=/admin/website");
  const query = await searchParams;
  const locale = cmsLocaleSchema.parse(query.locale ?? "en");
  const template = query.template ? kitIdSchema.parse(query.template) : null;
  let preview;
  try {
    preview = template
      ? await services.websiteSetup.previewTemplate(actor, {
          kitId: template,
          locale,
          recipe: query.recipe ?? "home",
        })
      : await services.websiteSetup.preview(actor, {
          locale,
          ...(query.pageId ? { pageId: query.pageId } : {}),
        });
  } catch (cause) {
    if (!(cause instanceof DomainError)) throw cause;
    return (
      <main className="content-width standalone-state">
        <h1>Preview unavailable</h1>
        <p>{cause.message}</p>
        <Link href="/admin/website">Back to Website</Link>
      </main>
    );
  }
  const identity = await services.organization.publicIdentity();
  return (
    <>
      <div className="kit-preview-tools">
        <Link
          href={
            "/admin/website?tab=" +
            (template ? "templates" : "overview") +
            "&locale=" +
            locale
          }
        >
          ← Back to Website
        </Link>
        <strong>
          {template
            ? kits[template].name + " · Template preview"
            : "Your website · Saved draft preview"}
        </strong>
        {!template && (
          <Link
            href={"/admin/website/" + preview.page.id + "?locale=" + locale}
          >
            Edit this page
          </Link>
        )}
      </div>
      <TemplateContactPreview formId={preview.contactFormPreviewId}>
        <CmsPublicPage
          page={preview.page}
          site={preview.site}
          club={identity}
          preview
          previewCards={preview.cards}
          previewLabel={
            template
              ? "Template example. Nothing has been added to your website."
              : "Private website preview. Visitors still see the published website."
          }
        />
      </TemplateContactPreview>
    </>
  );
}
