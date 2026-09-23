"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { PackageWorkspace } from "../package_schemas";
import { EventPackageForm } from "./event-package-form";
import { EventPackageSources } from "./event-package-sources";

export type PackageMutation = (
  path: string,
  body: unknown,
  message: string,
) => Promise<PackageWorkspace | undefined>;

function PackageManager({
  eventId,
  initial,
  disabled,
  active,
  onDirtyChange,
}: {
  eventId: string;
  initial: PackageWorkspace;
  disabled: boolean;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.packages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [packageDirty, setPackageDirty] = useState(false);
  const [sourceDirty, setSourceDirty] = useState<Record<string, boolean>>({});
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dirty = packageDirty || Object.values(sourceDirty).some(Boolean);
  const dirtyRef = useRef(dirty);
  const loading = useRef(false);
  const mutating = useRef(false);
  const reportSourceDirty = useCallback((id: string, value: boolean) => {
    setSourceDirty((current) =>
      current[id] === value ? current : { ...current, [id]: value },
    );
  }, []);
  useEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const reload = useCallback(
    async (discard = false) => {
      if (loading.current || mutating.current || (dirtyRef.current && !discard))
        return;
      loading.current = true;
      setBusy(true);
      setError("");
      try {
        const updated = await request<PackageWorkspace>(
          `/api/admin/events/${eventId}/packages`,
        );
        if (dirtyRef.current && !discard) return;
        setWorkspace(updated);
        setRefreshVersion((current) => current + 1);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        loading.current = false;
        setBusy(false);
      }
    },
    [eventId],
  );
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      void reload();
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active, reload]);
  const selected = workspace.packages.find((item) => item.id === selectedId);
  function select(id: string) {
    if (id === selectedId) return;
    if (packageDirty && !window.confirm("Discard the unsaved package changes?"))
      return;
    setSelectedId(id);
  }
  const mutate: PackageMutation = async (path, body, success) => {
    mutating.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await request<PackageWorkspace>(
        `/api/admin/events/${eventId}/packages${path}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setWorkspace(updated);
      setMessage(success);
      return updated;
    } catch (cause) {
      setError(errorMessage(cause));
      return undefined;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      className="event-packages-workspace"
      aria-label="Event packages"
      aria-busy={busy}
    >
      <p>
        Publish local offers with optional prices and links to Luma checkout.
        Add <strong>Published packages</strong> in the{" "}
        <Link
          className="text-link"
          href={`/admin/events/${eventId}?tab=website`}
        >
          event page editor
        </Link>{" "}
        to display them.
      </p>
      {!workspace.checkoutAvailable && (
        <Notice kind="info">
          External checkout is unavailable. Enable Luma and Registration, then
          publish and open this event's Luma registration in Registration &amp;
          forms. Reload packages after changing those settings. Package
          descriptions can be prepared and published independently.
        </Notice>
      )}
      <button
        type="button"
        className="inline-button"
        disabled={busy}
        onClick={() => {
          if (
            dirty &&
            !window.confirm(
              "Reload packages and discard unsaved package or source changes?",
            )
          )
            return;
          void reload(true);
        }}
      >
        Reload packages
      </button>
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <div className="event-packages-editing">
        <aside className="panel event-package-list" aria-label="Saved packages">
          <h3>Packages</h3>
          {workspace.packages.length ? (
            workspace.packages.map((item) => (
              <button
                type="button"
                className="event-package-choice"
                key={item.id}
                aria-current={item.id === selectedId ? "true" : undefined}
                disabled={busy}
                onClick={() => select(item.id)}
                aria-label={`Edit package ${item.draft.title}`}
              >
                <strong>{item.draft.title}</strong>
                <span>
                  {item.published
                    ? "Published offer + saved draft"
                    : "Private draft"}
                </span>
              </button>
            ))
          ) : (
            <p>
              No packages yet. Start with one offer and publish it when ready.
            </p>
          )}
          {workspace.canEdit && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy || disabled}
              onClick={() => select("")}
            >
              New package
            </button>
          )}
        </aside>
        <EventPackageForm
          key={`${selected?.id ?? "new"}:${selected?.version ?? 0}:${refreshVersion}`}
          record={selected}
          workspace={workspace}
          disabled={disabled || busy}
          mutate={mutate}
          onSelected={setSelectedId}
          onDirty={setPackageDirty}
        />
      </div>
      <EventPackageSources
        key={refreshVersion}
        sources={workspace.sources}
        disabled={disabled || busy || !workspace.canEdit}
        canPublish={workspace.canPublish}
        mutate={mutate}
        onDirty={reportSourceDirty}
      />
    </section>
  );
}

export function EventPackagesPanel({
  eventId,
  disabled,
  active,
  onDirtyChange,
}: {
  eventId: string;
  disabled: boolean;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { data, error, refresh } = useResource<PackageWorkspace>(
    `/api/admin/events/${eventId}/packages`,
  );
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button type="button" className="inline-button" onClick={refresh}>
          Try again
        </button>
      </Notice>
    );
  return data ? (
    <PackageManager
      eventId={eventId}
      initial={data}
      disabled={disabled}
      active={active}
      onDirtyChange={onDirtyChange}
    />
  ) : (
    <Loading />
  );
}
