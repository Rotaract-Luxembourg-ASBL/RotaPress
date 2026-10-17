"use client";
import type { CustomField } from "@puckeditor/core";
import { useState } from "react";
import { useResource, request, errorMessage } from "@/ui/api";
import { useRequestResource } from "@/ui/request-resource";
import type {
  AlbumCollection,
  AlbumData,
  AlbumDetail,
} from "@/features/media/album_schemas";
import { useEditorPuck } from "./editor-blocks";
import { GalleryBlock, type BlockProps } from "./block-renderers";
import { useAlbumPreviewRefresh } from "./album-preview-context";

export function independentAlbumPlacement(source: AlbumData) {
  return {
    albumId: undefined,
    items: source.items,
    columns: source.columns,
    aspectRatio: source.aspectRatio,
    layout: source.layout,
    fit: source.fit,
    lightbox: source.lightbox,
  };
}

export function GalleryAlbumField({
  value,
  onChange,
  readOnly,
  onCopy,
  onRefreshPreview,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  readOnly?: boolean;
  onCopy: (source: AlbumData) => void;
  onRefreshPreview: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, refresh } = useResource<AlbumCollection>(
    `/api/admin/media/albums?search=${encodeURIComponent(search)}&page=${page}&pageSize=24`,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function copy() {
    if (!value) return;
    setBusy(true);
    setProblem("");
    try {
      const album = await request<AlbumDetail>(
        `/api/admin/media/albums/${value}`,
      );
      onCopy(album.published ?? album.draft);
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <label>
        Find an album
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          disabled={readOnly || busy}
        />
      </label>
      <label>
        Gallery source
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || undefined)}
          disabled={readOnly || busy}
        >
          <option value="">Independent gallery</option>
          {value && !data?.albums.some((album) => album.id === value) && (
            <option value={value}>Selected linked album</option>
          )}
          {data?.albums.map((album) => (
            <option key={album.id} value={album.id}>
              {album.title}
              {album.publishedRevisionId ? "" : " — draft"}
            </option>
          ))}
        </select>
      </label>
      {(problem || error) && (
        <p role="alert">
          {problem || error}{" "}
          <button type="button" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {data && data.total > data.pageSize && (
        <div className="form-actions">
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}
          >
            Previous
          </button>
          <span>
            {data.page} / {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            type="button"
            disabled={data.page * data.pageSize >= data.total}
            onClick={() => setPage(data.page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {value && (
        <>
          <p className="field-help">
            This gallery follows the album's published images and layout.
            Publishing album changes updates every linked placement. Independent
            image fields below are ignored while linked.
          </p>
          <a
            href={`/admin/media/albums?album=${encodeURIComponent(value)}`}
            target="_blank"
            rel="noreferrer"
          >
            Manage album
          </a>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={onRefreshPreview}
            disabled={busy}
          >
            Refresh album preview
          </button>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => void copy()}
            disabled={readOnly || busy}
          >
            {busy ? "Copying…" : "Convert to independent copy"}
          </button>
        </>
      )}
    </div>
  );
}

function PuckGalleryAlbumField(
  props: Pick<
    Parameters<typeof GalleryAlbumField>[0],
    "value" | "onChange" | "readOnly"
  >,
) {
  const selected = useEditorPuck((state) => state.selectedItem);
  const selector = useEditorPuck((state) => state.appState.ui.itemSelector);
  const dispatch = useEditorPuck((state) => state.dispatch);
  const preview = useAlbumPreviewRefresh(props.value);
  return (
    <GalleryAlbumField
      {...props}
      onRefreshPreview={preview.refresh}
      onCopy={(source) => {
        if (selected?.type !== "Gallery" || !selector) return;
        dispatch({
          type: "replace",
          destinationIndex: selector.index,
          destinationZone: selector.zone ?? "root:default-zone",
          data: {
            ...selected,
            props: { ...selected.props, ...independentAlbumPlacement(source) },
          },
        });
      }}
    />
  );
}
export const galleryAlbumField: CustomField<string | undefined> = {
  type: "custom",
  label: "Album connection",
  render: (props) => <PuckGalleryAlbumField {...props} />,
};

export function GalleryEditorPreview(props: BlockProps<"Gallery">) {
  const preview = useAlbumPreviewRefresh(props.albumId);
  if (!props.albumId) return <GalleryBlock {...props} />;
  return (
    <LinkedGalleryPreview
      key={preview.version}
      {...props}
      albumId={props.albumId}
    />
  );
}

function LinkedGalleryPreview(
  props: BlockProps<"Gallery"> & { albumId: string },
) {
  const { data, error, loading } = useRequestResource<AlbumDetail>(
    `/api/admin/media/albums/${props.albumId}`,
  );
  if (error)
    return (
      <section className="cms-block" aria-label="Linked album preview">
        <p role="alert">{error}</p>
        <p>
          Select this gallery and choose Refresh album preview in its settings.
        </p>
      </section>
    );
  if (loading || !data?.published)
    return (
      <section className="cms-block">
        <p>
          {!loading && data
            ? "Publish this album to preview its linked gallery."
            : "Loading linked album…"}
        </p>
      </section>
    );
  return <GalleryBlock {...props} {...data.published} />;
}
