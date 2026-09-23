"use client";
import Link from "next/link";
import { useState } from "react";
import type { CmsSummary } from "@/features/cms/cms_schemas";
import { Dialog } from "@/ui/dialog";
import { useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";

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
  const { data, error } = useResource<{ items: CmsSummary[] }>(
    "/api/admin/cms/content",
  );
  const [query, setQuery] = useState("");
  const pages =
    data?.items.filter(
      (item) =>
        item.kind === "page" &&
        !item.archived &&
        !item.moduleKey &&
        item.title.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
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
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {error && <Notice>{error}</Notice>}
        {!data && !error && <Loading />}
        {pages.map((page) => (
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
        {data && !pages.length && (
          <p>
            No matching website pages.{" "}
            <Link href="/admin/website?tab=pages">
              Create a page in Website
            </Link>
            .
          </p>
        )}
        <p className="field-help">
          This opens the editor. Nothing is inserted, saved or published until
          you choose the corresponding action.
        </p>
      </div>
    </Dialog>
  );
}
