import type { Metadata } from "next";
import { CmsEditor } from "@/features/cms/ui/editor";

export const metadata: Metadata = { title: "Page editor" };

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { id } = await params;
  const { locale = "en" } = await searchParams;
  return <CmsEditor id={id} locale={locale} />;
}
