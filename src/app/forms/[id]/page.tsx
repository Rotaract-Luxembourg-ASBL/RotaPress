import type { Metadata } from "next";
import { PublicForm } from "@/features/forms/ui/public-form";
import { PublishedSiteShell } from "@/ui/published-site-shell";

export const metadata: Metadata = {
  title: "Club form",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PublishedSiteShell>
      <main id="main-content" className="content-width forms-public-page">
        <div className="panel">
          <PublicForm formId={id} headingLevel={1} />
        </div>
      </main>
    </PublishedSiteShell>
  );
}
