import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Navigation & theme" };

export default function SiteSettingsPage() {
  redirect("/admin/website?tab=menus");
}
