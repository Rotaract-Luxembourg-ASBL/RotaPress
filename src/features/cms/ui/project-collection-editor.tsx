"use client";
import type { Config } from "@puckeditor/core";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource } from "@/ui/api";
import { ProjectCards } from "@/features/projects/ui/project-public";
import type { PublicProject } from "@/features/projects/project_schemas";
import type { PuckBlocks } from "./puck-config";
import { useRefreshOnFocus } from "./event-editor-scope";
import { ConnectedSource, ConnectionError } from "./connected-source";

function ProjectCollectionSource() {
  const { features, capabilities } = useCurrentUser();
  return (
    <ConnectedSource
      name="Projects"
      icon="outline"
      enabled={features.projects}
      status="Automatic collection"
      description="This block follows published project stories. Change the progress filter below; edit stories and publish their updates in Projects. Private drafts and archived projects stay hidden."
      href={capabilities.includes("cms.edit") ? "/admin/projects" : undefined}
      action="Open Projects"
    />
  );
}

function ProjectCollectionPreview(props: PuckBlocks["ProjectCollection"]) {
  const { features } = useCurrentUser();
  const { data, error, refresh } = useResource<{ items: PublicProject[] }>(
    features.projects ? "/api/projects" : null,
  );
  useRefreshOnFocus(refresh);
  const items = (data?.items ?? [])
    .filter(
      (project) => props.status === "all" || project.status === props.status,
    )
    .slice(0, props.limit);
  return (
    <section className="cms-block project-collection">
      <header className="project-collection-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      {!features.projects ? (
        <p>
          Projects is disabled in Integrations. This section keeps its settings.
        </p>
      ) : error ? (
        <ConnectionError error={error} onRetry={refresh} />
      ) : !data ? (
        <p>Loading published projects…</p>
      ) : items.length ? (
        <ProjectCards items={items} preview />
      ) : (
        <p>
          Published projects will appear here automatically. Private drafts stay
          hidden.
        </p>
      )}
      <p className="field-help">
        Manage the stories in Projects. This section stays up to date with their
        published versions.
      </p>
    </section>
  );
}

export const projectCollectionConfig: Config<PuckBlocks>["components"]["ProjectCollection"] =
  {
    label: "Projects",
    fields: {
      version: {
        type: "custom",
        label: "Connected projects",
        render: () => <ProjectCollectionSource />,
      },
      title: { type: "text", label: "Heading" },
      introduction: { type: "textarea", label: "Introduction" },
      status: {
        type: "select",
        label: "Show projects",
        options: [
          { value: "all", label: "All published projects" },
          { value: "planned", label: "Planned" },
          { value: "ongoing", label: "In progress" },
          { value: "completed", label: "Completed" },
        ],
      },
      limit: { type: "number", label: "Maximum projects", min: 1, max: 24 },
    },
    defaultProps: {
      version: 1,
      title: "Our impact",
      introduction: "",
      status: "all",
      limit: 6,
    },
    render: (props) => <ProjectCollectionPreview {...props} />,
  };
