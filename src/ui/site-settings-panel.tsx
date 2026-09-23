"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  CmsDetail,
  CmsLocale,
  CmsSummary,
  SiteDraft,
  SiteSettings,
} from "@/features/cms/cms_schemas";
import { errorMessage, request } from "./api";
import { Notice } from "./primitives";
import { WebsiteMenuSettings } from "./website-menu-settings";
import { WebsitePartsSettings } from "./website-parts-settings";
import { WebsiteAppearanceSettings } from "./website-appearance-settings";
import { WebsiteSeoSettings } from "./website-seo-settings";

export type WebsiteSettingsPanel = "menus" | "parts" | "appearance" | "seo";

export function WebsiteSettings({
  site,
  items,
  locale,
  panel,
  onSaved,
  onDirtyChange,
}: {
  site: SiteDraft;
  items: CmsSummary[];
  locale: CmsLocale;
  panel: WebsiteSettingsPanel;
  onSaved: (site: SiteDraft) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState(site);
  const [settings, setSettings] = useState(site.draft);
  const [addedParts, setAddedParts] = useState<CmsSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved.draft);
  // Parent refreshes after reviewed publication or template selection. Never
  // replace entered settings with a newer server snapshot while they are dirty.
  if (site.version > saved.version && !dirty && !busy) {
    setSaved(site);
    setSettings(site.draft);
    setMessage(undefined);
    setError(undefined);
  }
  useEffect(() => onDirtyChange(dirty || busy), [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const allItems = [
    ...items,
    ...addedParts.filter(
      (part) =>
        !items.some(
          (item) => item.id === part.id && item.locale === part.locale,
        ),
    ),
  ];
  const referenced = new Set([
    settings.homePageId,
    settings.eventsPageId,
    ...settings.navigation.flatMap((item) =>
      "pageId" in item ? [item.pageId] : [],
    ),
  ]);
  const pages = allItems.filter(
    (item) =>
      item.kind === "page" &&
      item.locale === locale &&
      (referenced.has(item.id) || (!item.archived && !item.demonstration)),
  );
  function change(next: SiteSettings) {
    setSettings(next);
    setMessage(undefined);
  }
  function canLeave() {
    return (
      !busy &&
      (!dirty || window.confirm("Leave without saving your website settings?"))
    );
  }
  async function save(action: "save" | "restore" = "save") {
    if (inFlight.current || (action === "restore" && dirty)) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await request<SiteDraft>(
        action === "save"
          ? "/api/admin/cms/site"
          : "/api/admin/cms/site/restore-appearance",
        {
          method: action === "save" ? "PATCH" : "POST",
          body: JSON.stringify({
            locale,
            expectedVersion: saved.version,
            ...(action === "save" ? { settings } : {}),
          }),
        },
      );
      setSaved(next);
      setSettings(next.draft);
      onSaved(next);
      setMessage(
        action === "save"
          ? "Website settings saved. Publish the website when ready."
          : "Previous appearance restored to draft. Review and publish the website when ready.",
      );
    } catch (cause) {
      setError(`${errorMessage(cause)} Your entered settings are preserved.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function createPart(kind: "header" | "footer") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const original = allItems.find(
        (item) =>
          item.kind === kind &&
          !item.archived &&
          !item.kitId &&
          !item.demonstration &&
          item.locale !== locale,
      );
      const result = await request<CmsDetail>(
        original
          ? `/api/admin/cms/content/${original.id}/locale`
          : "/api/admin/cms/content",
        {
          method: "POST",
          body: JSON.stringify({
            ...(original ? {} : { kind }),
            locale,
            title: `Site ${kind}`,
            slug: `site-${kind}`,
          }),
        },
      );
      setAddedParts((current) => [
        ...current,
        {
          id: result.id,
          kind: result.kind,
          locale: result.locale,
          title: result.draft.title,
          slug: result.draft.slug,
          draftRevisionId: result.draft.id,
          publishedRevisionId: result.publishedRevisionId,
          archived: result.archived,
          updatedAt: result.draft.createdAt,
          isHomepage: false,
        },
      ]);
      setSettings((current) => ({ ...current, [`${kind}Id`]: result.id }));
      setMessage(
        `Created the ${kind} draft. Save settings to keep this selection, then edit its content.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }
  return (
    <form
      className="website-settings"
      onSubmit={submit}
      aria-busy={busy}
      data-dirty={dirty}
    >
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <fieldset className="website-settings-fieldset" disabled={busy}>
        {panel === "seo" && (
          <WebsiteSeoSettings value={settings} onChange={change} />
        )}
        {panel === "menus" && (
          <WebsiteMenuSettings
            value={settings}
            pages={pages}
            onChange={change}
          />
        )}
        {panel === "parts" && (
          <WebsitePartsSettings
            value={settings}
            items={allItems}
            locale={locale}
            onChange={change}
            onCreate={(kind) => void createPart(kind)}
            canLeave={canLeave}
          />
        )}
        {panel === "appearance" && (
          <WebsiteAppearanceSettings
            value={settings}
            onChange={change}
            canRestore={!dirty && !busy && Boolean(saved.previousAppearance)}
            onRestore={() => void save("restore")}
            canLeave={canLeave}
            locale={locale}
            dirty={dirty}
          />
        )}
      </fieldset>
      <div className="website-settings-save">
        <span className="small muted" role="status">
          {busy
            ? "Saving website settings…"
            : dirty
              ? "Unsaved settings"
              : `Saved version ${saved.version}`}
        </span>
        <button
          type="submit"
          className="button button-accent"
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
