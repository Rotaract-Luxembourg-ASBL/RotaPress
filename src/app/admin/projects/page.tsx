import type { Metadata } from "next";
import { ProjectsPanel } from "@/features/projects/ui/projects-panel";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ProjectsPanel />;
}
