import type { Metadata } from "next";
import { MediaLibrary } from "@/ui/media-library";

export const metadata: Metadata = { title: "Media library" };

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string | string[] }>;
}) {
  const { asset } = await searchParams;
  return (
    <MediaLibrary requestedId={typeof asset === "string" ? asset : undefined} />
  );
}
