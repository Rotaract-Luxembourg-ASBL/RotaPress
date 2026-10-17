"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type {
  AlbumCollection,
  AlbumDetail,
} from "@/features/media/album_schemas";
import { useRequestResource } from "./request-resource";
import { useCollectionLocation } from "./collection-location";
import { Loading, Notice, PageHeading } from "./primitives";
import { Icon } from "./icon";
import { MediaAlbumEditor } from "./media-album-editor";
import { useCollectionReturn } from "./collection-return";

export function MediaAlbums() {
  const returnTo = useCollectionReturn("/admin/media");
  const { params, change, page } = useCollectionLocation();
  const search = params.get("search") ?? "";
  const albumId = params.get("album");
  const [creating, setCreating] = useState(false);
  const collection = useRequestResource<AlbumCollection>(
    `/api/admin/media/albums?${new URLSearchParams({ search, page: String(page) })}`,
  );
  function close() {
    setCreating(false);
    change({ album: undefined }, false);
  }
  return (
    <>
      <PageHeading
        title="Photo albums"
        description="Create reusable galleries. Publish an album to update its linked pages together."
      >
        <Link href={returnTo} className="button button-outline">
          Media library
        </Link>
        <button
          className="button button-accent"
          onClick={() => {
            change({ album: undefined }, false);
            setCreating(true);
          }}
        >
          <Icon name="plus" /> Create album
        </button>
      </PageHeading>
      <section className="card media-albums-library" aria-label="Photo albums">
        <label className="media-albums-search">
          Search albums
          <input
            type="search"
            value={search}
            placeholder="Find an album…"
            onChange={(event) => {
              change({ search: event.target.value });
            }}
          />
        </label>
        {collection.error && (
          <Notice>
            {collection.error}
            <button className="inline-button" onClick={collection.refresh}>
              Try again
            </button>
          </Notice>
        )}
        {collection.error ? null : !collection.data ? (
          <Loading />
        ) : collection.data?.albums.length ? (
          <>
            <p className="field-help" role="status">
              {collection.data.total} albums
            </p>
            <div className="media-albums-grid">
              {collection.data.albums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  className="media-album-card"
                  disabled={collection.loading}
                  onClick={() => change({ album: album.id }, false)}
                  aria-label={`Edit album ${album.title}`}
                >
                  <div className="media-album-cover">
                    {album.coverAssetId ? (
                      <Image
                        src={`/media/${album.coverAssetId}?variant=thumbnail`}
                        alt=""
                        width={480}
                        height={320}
                        unoptimized
                      />
                    ) : (
                      <Icon name="image" />
                    )}
                  </div>
                  <div className="media-album-card-body">
                    <strong>{album.title}</strong>
                    <span>{album.imageCount} photographs</span>
                    <span
                      className={`media-badge media-badge-${album.publishedRevisionId ? "public" : "private"}`}
                    >
                      {!album.publishedRevisionId
                        ? "Draft"
                        : album.publishedRevisionId === album.draftRevisionId
                          ? "Published"
                          : "Unpublished changes"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="media-pagination">
              <button
                className="button button-outline button-small"
                disabled={collection.loading || collection.data.page <= 1}
                onClick={() =>
                  change({ page: collection.data!.page - 1 }, false)
                }
              >
                Previous
              </button>
              <span>
                Page {collection.data.page} of{" "}
                {Math.max(
                  1,
                  Math.ceil(collection.data.total / collection.data.pageSize),
                )}
              </span>
              <button
                className="button button-outline button-small"
                disabled={
                  collection.loading ||
                  collection.data.page * collection.data.pageSize >=
                    collection.data.total
                }
                onClick={() =>
                  change({ page: collection.data!.page + 1 }, false)
                }
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="media-empty">
            <h3>
              {search
                ? "No albums match your search"
                : "Your first photo album starts here"}
            </h3>
            <p>
              {search
                ? "Try a different title."
                : "Arrange photographs once and reuse the album across your website."}
            </p>
          </div>
        )}
      </section>
      {creating ? (
        <MediaAlbumEditor onClose={close} onChanged={collection.refresh} />
      ) : albumId ? (
        <SelectedAlbum
          key={albumId}
          id={albumId}
          onClose={close}
          onChanged={collection.refresh}
        />
      ) : null}
    </>
  );
}

function SelectedAlbum({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, error, refresh } = useRequestResource<AlbumDetail>(
    `/api/admin/media/albums/${encodeURIComponent(id)}`,
  );
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button className="inline-button" onClick={refresh}>
          Try again
        </button>{" "}
        <button className="inline-button" onClick={onClose}>
          Back to albums
        </button>
      </Notice>
    );
  if (!data) return <Loading />;
  return (
    <MediaAlbumEditor initial={data} onClose={onClose} onChanged={onChanged} />
  );
}
