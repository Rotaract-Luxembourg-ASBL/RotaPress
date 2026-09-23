import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eventPageEditorHref } from "@/features/events/event_routes";

export const metadata: Metadata = { title: "Event page editor" };

export default async function EventLandingPageEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pageId: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { id, pageId } = await params;
  const { locale = "en" } = await searchParams;
  redirect(eventPageEditorHref(id, pageId, locale));
}
