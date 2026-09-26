import { notFound } from "next/navigation";
import Link from "next/link";
import { services } from "@/composition/services";
import { config } from "@/core/config";
import { publicMetadata } from "@/features/cms/public_metadata";
import { ProjectStory } from "@/features/projects/ui/project-public";
import { PublicSiteShell } from "@/ui/public-site-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const project = await services.projectReader.publicBySlug(
    (await params).slug,
  );
  if (!project) return {};
  const [site, club] = await Promise.all([
    services.cms.publicSite("en"),
    services.organization.publicIdentity(),
  ]);
  return publicMetadata({
    site,
    clubName: club?.name,
    title: project.title,
    description: project.summary,
    socialImageId: project.coverImageId,
    canonical: `${config.APP_URL}/projects/${project.slug}`,
    origin: config.APP_URL,
  });
}

export default async function Project({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const project = await services.projectReader.publicBySlug(
    (await params).slug,
  );
  if (!project) notFound();
  const [site, club] = await Promise.all([
    services.cms.publicSite("en"),
    services.organization.publicIdentity(),
  ]);
  return (
    <PublicSiteShell site={site} club={club} locale="en">
      <main
        id="main-content"
        className="content-width cms-content project-detail"
      >
        <Link href="/projects" className="text-link project-back">
          ← All projects
        </Link>
        <ProjectStory project={project} />
      </main>
    </PublicSiteShell>
  );
}
