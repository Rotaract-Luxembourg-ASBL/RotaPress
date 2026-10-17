"use client";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { cmsLocaleSchema, type CmsLocale } from "@/features/cms/cms_schemas";
import type { PageCollection } from "@/features/cms/cms_workspace_schemas";
import { Dialog } from "@/ui/dialog";
import { useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { CollectionPagination } from "@/ui/collection-pagination";

export function FormPlacement({
  formId,
  disabled,
}: {
  formId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button button-outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Add to a website page
      </button>
      {open && <PlacementPicker formId={formId} close={() => setOpen(false)} />}
    </>
  );
}

function PlacementPicker({
  formId,
  close,
}: {
  formId: string;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<CmsLocale>("en");
  const [page, setPage] = useState(1);
  const search = useDeferredValue(query);
  const params = new URLSearchParams({
    locale,
    page: String(page),
    pageSize: "10",
    search,
    collection: "website",
  });
  const { data, error, refresh } = useResource<PageCollection>(
    `/api/admin/cms/pages?${params}`,
  );
  return (
    <Dialog title="Add form to a page" onClose={close}>
      <div className="form-stack">
        <p>
          Choose a page, then insert the form in its editor. You can move the
          block, save a draft and publish when ready.
        </p>
        <label>
          Find a page
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Page language
          <select
            value={locale}
            onChange={(event) => {
              setLocale(cmsLocaleSchema.parse(event.target.value));
              setPage(1);
            }}
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="lb">Luxembourgish</option>
          </select>
        </label>
        {error && (
          <Notice>
            {error}{" "}
            <button type="button" className="inline-button" onClick={refresh}>
              Try again
            </button>
          </Notice>
        )}
        {!data && !error && <Loading />}
        {data?.items.map((page) => (
          <Link
            key={`${page.id}:${page.locale}`}
            className="settings-destination"
            href={`/admin/website/${page.id}?locale=${page.locale}&insertForm=${formId}`}
          >
            <strong>{page.title}</strong>
            <span>
              {page.locale.toUpperCase()} ·{" "}
              {page.publishedRevisionId ? "Published page" : "Draft page"}
            </span>
          </Link>
        ))}
        {data && !data.items.length && (
          <p>
            No matching website pages.{" "}
            <Link href="/admin/website?tab=pages">
              Create a page in Website
            </Link>
            .
          </p>
        )}
        {data && (
          <CollectionPagination {...data} onPage={setPage} noun="pages" />
        )}
        <p className="field-help">
          This opens the editor. Nothing is inserted, saved or published until
          you choose the corresponding action.
        </p>
      </div>
    </Dialog>
  );
}
