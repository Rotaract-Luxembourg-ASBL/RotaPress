import type { Metadata } from "next";
import { MediaAlbums } from "@/ui/media-albums";
export const metadata: Metadata = { title: "Photo albums" };
export default function AlbumsPage() {
  return <MediaAlbums />;
}
