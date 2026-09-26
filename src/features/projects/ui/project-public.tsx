import { CmsImage, SafeLink } from "@/features/cms/ui/block-renderers";
import type { PublicProject } from "../project_schemas";

export const projectStatusLabels = {
  planned: "Planned",
  ongoing: "In progress",
  completed: "Completed",
};

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ProjectCards({
  items,
  preview = false,
}: {
  items: PublicProject[];
  preview?: boolean;
}) {
  return (
    <div className="cms-card-grid project-cards">
      {items.map((project) => (
        <article className="cms-card project-card" key={project.id}>
          {project.coverImageId && (
            <CmsImage
              id={project.coverImageId}
              alt={project.coverAlt ?? ""}
              className="project-card-cover"
            />
          )}
          <div className="project-card-copy">
            <span
              className={`project-progress project-progress-${project.status}`}
            >
              {projectStatusLabels[project.status]}
            </span>
            <h3>
              {preview ? (
                project.title
              ) : (
                <a href={`/projects/${project.slug}`}>{project.title}</a>
              )}
            </h3>
            {project.location && (
              <p className="project-location">{project.location}</p>
            )}
            <p>{project.summary}</p>
            {preview ? (
              <span className="text-link">Explore project →</span>
            ) : (
              <a className="text-link" href={`/projects/${project.slug}`}>
                Explore project →
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Draft previews and public pages share this renderer; strings never become HTML. */
export function ProjectStory({
  project,
  preview = false,
}: {
  project: PublicProject;
  preview?: boolean;
}) {
  return (
    <article className="project-story">
      <header className="project-story-heading">
        <span className={`project-progress project-progress-${project.status}`}>
          {projectStatusLabels[project.status]}
        </span>
        <h1>{project.title || "Untitled project"}</h1>
        {project.summary && <p className="project-lead">{project.summary}</p>}
        {(project.location || project.startDate || project.endDate) && (
          <dl className="project-facts">
            {project.location && (
              <div>
                <dt>Where</dt>
                <dd>{project.location}</dd>
              </div>
            )}
            {project.startDate && (
              <div>
                <dt>{project.status === "planned" ? "Starts" : "Started"}</dt>
                <dd>
                  <time dateTime={project.startDate}>
                    {dateLabel(project.startDate)}
                  </time>
                </dd>
              </div>
            )}
            {project.endDate && (
              <div>
                <dt>{project.status === "completed" ? "Finished" : "Until"}</dt>
                <dd>
                  <time dateTime={project.endDate}>
                    {dateLabel(project.endDate)}
                  </time>
                </dd>
              </div>
            )}
          </dl>
        )}
      </header>
      {project.coverImageId && (
        <CmsImage
          id={project.coverImageId}
          alt={project.coverAlt ?? ""}
          className="project-story-cover"
        />
      )}
      {project.story && (
        <section className="project-story-section">
          <h2>About this project</h2>
          <p className="project-prose">{project.story}</p>
        </section>
      )}
      {project.outcomes && (
        <section className="project-story-section project-outcomes">
          <h2>What we achieved</h2>
          <p className="project-prose">{project.outcomes}</p>
        </section>
      )}
      {project.linkUrl && project.linkLabel && (
        <p className="project-story-section">
          {preview ? (
            <span className="button button-accent">{project.linkLabel}</span>
          ) : (
            <SafeLink href={project.linkUrl} className="button button-accent">
              {project.linkLabel}
            </SafeLink>
          )}
        </p>
      )}
    </article>
  );
}
