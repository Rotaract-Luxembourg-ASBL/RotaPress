import "server-only";
import { AlbumReader } from "../media/AlbumReader";
import {
  DomainError,
  type DatabaseExecutor,
} from "@/core/authorization/AuthorizationService";
import { flattenBlocks, type Block, type CmsData } from "./cms_schemas";

export function contentAlbums(data: CmsData): string[] {
  return [
    ...new Set(
      flattenBlocks(data.content).flatMap((block) =>
        block.type === "Gallery" && block.props.albumId
          ? [block.props.albumId]
          : [],
      ),
    ),
  ];
}

/** Resolve links once per projection; published pages never receive draft album data. */
export async function resolveAlbumGalleries(
  data: CmsData,
  organizationId: string,
  reader: AlbumReader,
  executor: DatabaseExecutor,
  requirePublic: boolean,
): Promise<CmsData> {
  const albums = new Map(
    (
      await reader.publishedMany(organizationId, contentAlbums(data), executor)
    ).map((album) => [album.id, album] as const),
  );
  function replace(block: Block): Block {
    if (block.type === "Gallery" && block.props.albumId) {
      const album = albums.get(block.props.albumId);
      if (!album && requirePublic)
        throw new DomainError(
          "ALBUM_NOT_PUBLISHED",
          "A linked album is unavailable.",
          404,
        );
      return {
        ...block,
        props: {
          ...block.props,
          albumId: undefined,
          items: album?.items ?? [],
          ...(album
            ? {
                columns: album.columns,
                aspectRatio: album.aspectRatio,
                layout: album.layout,
                fit: album.fit,
                lightbox: album.lightbox,
              }
            : {}),
        },
      };
    }
    if (block.type === "Columns" || block.type === "SiteRow")
      return {
        ...block,
        props: {
          ...block.props,
          left: block.props.left.map(replace),
          right: block.props.right.map(replace),
          ...(block.type === "SiteRow"
            ? { center: block.props.center.map(replace) }
            : {}),
        },
      } as Block;
    return block;
  }
  return { ...data, content: data.content.map(replace) };
}
