import "server-only";
import Link from "next/link";
import { services } from "@/composition/services";
import { ProjectCards } from "@/features/projects/ui/project-public";
import type { BlockProps } from "./block-renderers";

export async function PublicProjectCollection(
  props: BlockProps<"ProjectCollection">,
) {
  const items = (await services.projectReader.publicList())
    .filter(
      (project) => props.status === "all" || project.status === props.status,
    )
    .slice(0, props.limit);
  if (!items.length) return null;
  return (
    <section className="cms-block project-collection">
      <header className="project-collection-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      <ProjectCards items={items} />
      <p className="cms-events-more">
        <Link href="/projects" className="text-link">
          Explore all projects →
        </Link>
      </p>
    </section>
  );
}
