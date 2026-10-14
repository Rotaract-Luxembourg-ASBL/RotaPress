import "server-only";
import { mediaMetadataRevision } from "./media_automation";
import type { AdminMediaAssetDto, MediaAssetDto } from "./media_schemas";

export function adminMediaAssetDto(asset: MediaAssetDto): AdminMediaAssetDto {
  return { ...asset, metadataRevision: mediaMetadataRevision(asset) };
}
