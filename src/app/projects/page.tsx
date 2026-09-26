import { notFound } from "next/navigation";
import Link from "next/link";
import { services } from "@/composition/services";
import { config } from "@/core/config";
import { publicMetadata } from "@/features/cms/public_metadata";
import { PublicSiteShell } from "@/ui/public-site-shell";
import {
  ProjectCards,
  projectStatusLabels,
} from "@/features/projects/ui/project-public";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const [site, club] = await Promise.all([
    services.cms.publicSite("en"),
    services.organization.publicIdentity(),
  ]);
  return publicMetadata({
    site,
    clubName: club?.name,
    title: "Our projects",
    description:
      "Volunteer actions, community initiatives and the difference we make together.",
    canonical: `${config.APP_URL}/projects`,
    origin: config.APP_URL,
  });
}

export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; q?: string | string[] }>;
}) {
  if (!(await services.authorization.features.installed()).projects) notFound();
  const query = await searchParams;
  const status =
    (Array.isArray(query.status) ? query.status[0] : query.status) ?? "all";
  if (!["all", "planned", "ongoing", "completed"].includes(status)) notFound();
  const search = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? "")
    .slice(0, 160)
    .trim();
  const [projects, site, club] = await Promise.all([
    services.projectReader.publicList(),
    services.cms.publicSite("en"),
    services.organization.publicIdentity(),
  ]);
  const items = projects.filter(
    (project) =>
      (status === "all" || project.status === status) &&
      `${project.title} ${project.summary} ${project.location}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <PublicSiteShell site={site} club={club} locale="en">
      <main
        id="main-content"
        className="content-width cms-content project-directory"
      >
        <header className="project-directory-heading">
          <p className="cms-eyebrow">Our impact</p>
          <h1>Our projects</h1>
          <p>
            Volunteer actions, community initiatives and the difference we make
            together.
          </p>
        </header>
        {projects.length > 0 && (
          <form className="project-directory-filters" action="/projects">
            <label>
              Search projects
              <input
                type="search"
                name="q"
                defaultValue={search}
                maxLength={160}
                placeholder="Search by name or place"
              />
            </label>
            <label>
              Progress
              <select name="status" defaultValue={status}>
                <option value="all">All projects</option>
                {Object.entries(projectStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-outline" type="submit">
              Show projects
            </button>
          </form>
        )}
        {items.length ? (
          <>
            <ProjectCards items={items} />
            <p className="project-result-count">
              {items.length} {items.length === 1 ? "project" : "projects"}
            </p>
          </>
        ) : (
          <section className="project-empty">
            <h2>
              {projects.length
                ? "No projects match your search"
                : "Our next chapter starts here"}
            </h2>
            <p>
              {projects.length
                ? "Try another name, place or progress filter."
                : "We will share our projects and volunteer stories here as they are published."}
            </p>
            {projects.length > 0 && (
              <Link href="/projects" className="text-link">
                Show all projects
              </Link>
            )}
          </section>
        )}
      </main>
    </PublicSiteShell>
  );
}
