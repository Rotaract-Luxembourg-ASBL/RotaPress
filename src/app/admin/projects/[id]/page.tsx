import type { Metadata } from "next";
import { ProjectEditor } from "@/features/projects/ui/project-editor";
import { services } from "@/composition/services";
import { appearanceOf } from "@/features/cms/appearance";

export const metadata: Metadata = { title: "Edit project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await services.cms.publicSite("en");
  return <ProjectEditor id={id} appearance={appearanceOf(site)} />;
}
