"use client";
import type { KitId } from "@/features/cms/kits/catalogue";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CmsDetail, CmsLocale } from "@/features/cms/cms_schemas";
import { errorMessage, request } from "./api";
import { Notice } from "./primitives";
import { Dialog } from "./dialog";
import { PageCollectionWorkspace } from "@/features/cms/ui/page-collection-workspace";
import { TemplatePicker } from "@/features/cms/kits/ui/template-picker";
import { collectionEditorHref } from "./collection-return";

function NewContent({
  kind,
  locale,
  kitId,
  canLeave,
  onClose,
}: {
  kind: "page" | "section";
  locale: CmsLocale;
  kitId?: KitId;
  canLeave: () => boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [customUrl, setCustomUrl] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState(locale);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLeave()) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setProblem(undefined);
    try {
      const result = await request<CmsDetail>("/api/admin/cms/content", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: fields.get("title"),
          ...(customUrl ? { slug: fields.get("slug") } : {}),
          locale: fields.get("locale"),
          templateId: fields.get("templateId") ?? "blank",
        }),
      });
      router.push(
        collectionEditorHref(
          `/admin/website/${result.id}?locale=${result.locale}`,
          "/admin/website",
        ),
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={kind === "page" ? "New page" : "New reusable section"}
      onClose={onClose}
      canClose={() =>
        !busy && (!dirty || window.confirm("Discard this unsaved content?"))
      }
    >
      <form
        className="form-stack"
        onSubmit={create}
        onChange={() => setDirty(true)}
        aria-busy={busy}
      >
        {problem && <Notice>{problem}</Notice>}
        <label>
          Title
          <input name="title" required maxLength={160} disabled={busy} />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={customUrl}
            disabled={busy}
            onChange={(event) => setCustomUrl(event.target.checked)}
          />
          Choose a custom page address
        </label>
        {customUrl ? (
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={100}
              placeholder="about-us"
              disabled={busy}
            />
            <span className="field-help">
              Lowercase letters, numbers and hyphens.
            </span>
          </label>
        ) : (
          <p className="field-help">
            A readable address is created from your title. You can change it
            later.
          </p>
        )}
        <label>
          Language
          <select
            name="locale"
            value={selectedLocale}
            onChange={(event) =>
              setSelectedLocale(event.target.value as CmsLocale)
            }
            disabled={busy}
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="lb">Luxembourgish</option>
          </select>
        </label>
        <p className="field-help">
          Opens in the editor as a private draft. Translations are written
          separately.
        </p>
        {kind === "page" && (
          <TemplatePicker
            disabled={busy}
            kitId={kitId}
            locale={selectedLocale}
          />
        )}
        <button className="button button-accent" disabled={busy}>
          {busy ? "Creating…" : "Create draft"}
        </button>
        <span className="small muted" role="status">
          {busy ? "Creating your draft…" : ""}
        </span>
      </form>
    </Dialog>
  );
}

export function WebsiteContentList({
  kind,
  locale,
  kitId,
  canLeave,
}: {
  kind: "page" | "section";
  locale: CmsLocale;
  kitId?: KitId;
  canLeave: () => boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageCollectionWorkspace
        kind={kind}
        locale={locale}
        create={() => setCreating(true)}
        canLeave={canLeave}
      />
      {creating && (
        <NewContent
          kind={kind}
          locale={locale}
          kitId={kitId}
          canLeave={canLeave}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
