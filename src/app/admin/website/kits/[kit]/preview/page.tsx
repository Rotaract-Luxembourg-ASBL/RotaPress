import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { kits } from "@/features/cms/kits/catalogue";

export const dynamic = "force-dynamic";
export default async function KitPreview({
  params,
  searchParams,
}: {
  params: Promise<{ kit: string }>;
  searchParams: Promise<{
    recipe?: string;
    namespace?: string;
    locale?: string;
  }>;
}) {
  const actor = await getActor(await headers());
  if (!actor) redirect("/sign-in?next=/admin/website/kits");
  const query = await searchParams;
  const preview = await services.kits.preview(actor, {
    kitId: (await params).kit,
    namespace: query.namespace,
    recipe: query.recipe ?? "home",
    locale: query.locale ?? "en",
  });
  const identity = await services.organization.publicIdentity();
  return (
    <>
      <div className="kit-preview-tools">
        <Link href="/admin/website/kits">← Website kits</Link>
        <strong>
          {kits[preview.kitId].name} · Private saved draft preview
        </strong>
        <Link
          href={`/admin/website/${preview.page.id}?locale=${preview.page.locale}`}
        >
          Edit this page in the CMS
        </Link>
        {preview.sharedParts.map((kind) => (
          <Link
            key={kind}
            href={`/admin/website/kits/${preview.kitId}/preview?namespace=${preview.namespace}&recipe=${kind}&locale=${preview.page.locale}`}
          >
            Preview shared {kind}
          </Link>
        ))}
      </div>
      <CmsPublicPage
        page={
          preview.page.kind === "page"
            ? preview.page
            : {
                ...preview.page,
                title: "Shared site part preview",
                data: { root: preview.page.data.root, content: [] },
              }
        }
        site={preview.site}
        club={
          identity && preview.demonstration
            ? {
                ...identity,
                name: `Example ${kits[preview.kitId].family} Club`,
              }
            : identity
        }
        preview
        previewCards={preview.cards}
        previewEvents={preview.previewEvents}
        previewLabel=""
        beforeContent={
          query.recipe?.startsWith("event-detail") && preview.previewEvents ? (
            <aside className="notice notice-info">
              Illustrative event ·{" "}
              {query.recipe === "event-detail-2" ? "8 June" : "18 May"} 2030 ·
              Example community garden. Preview only; registration is
              unavailable.
            </aside>
          ) : undefined
        }
      />
    </>
  );
}
