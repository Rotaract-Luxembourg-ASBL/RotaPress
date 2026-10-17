import { flattenBlocks, type CmsData } from "./cms_schemas";
import type { MediaAssetDto } from "../media/media_schemas";
import { templateImage } from "./kits/template_images";

/** Enforce the semantic file type as well as ownership at every draft boundary. */
export function contentAssetKinds(
  data: CmsData,
  socialImageId: string | null = null,
) {
  const references: { id: string; kind: MediaAssetDto["kind"] }[] = [];
  const add = (
    id: string | undefined,
    kind: MediaAssetDto["kind"] = "image",
  ) => {
    if (id && !templateImage(id)) references.push({ id, kind });
  };
  if (socialImageId) add(socialImageId);
  for (const block of flattenBlocks(data.content)) {
    if (block.type === "Video") add(block.props.posterAssetId);
    if ("assetId" in block.props)
      add(
        block.props.assetId,
        block.type === "File"
          ? "document"
          : block.type === "Audio"
            ? "audio"
            : block.type === "Video"
              ? "video"
              : "image",
      );
    if (
      "items" in block.props &&
      !(block.type === "Gallery" && block.props.albumId)
    )
      for (const item of block.props.items)
        if ("assetId" in item && typeof item.assetId === "string")
          add(item.assetId);
  }
  return references;
}
