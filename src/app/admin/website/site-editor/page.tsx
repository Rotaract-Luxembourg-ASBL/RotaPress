import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Site editor" };

export default function SiteEditorPage() {
  redirect("/admin/website?tab=parts");
}
