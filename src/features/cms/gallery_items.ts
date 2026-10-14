import type { Block } from "./cms_schemas";

export type GalleryItem = Extract<
  Block,
  { type: "Gallery" }
>["props"]["items"][number];
export const MAX_GALLERY_IMAGES = 30;
