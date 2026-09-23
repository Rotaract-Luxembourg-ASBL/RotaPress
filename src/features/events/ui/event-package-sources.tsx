"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PackageSource } from "../package_schemas";
import type { PackageMutation } from "./event-packages-panel";

function SourceForm({
  source,
  disabled,
  mutate,
  onDirty,
}: {
  source: PackageSource;
  disabled: boolean;
  mutate: PackageMutation;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [label, setLabel] = useState(source.label);
  const [enabled, setEnabled] = useState(source.enabled);
  const dirty = label !== source.label || enabled !== source.enabled;
  useEffect(() => {
    onDirty(source.id, dirty);
    return () => onDirty(source.id, false);
  }, [source.id, dirty, onDirty]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !window.confirm(
        `${enabled ? "Enable" : "Disable"} external source “${label}”?\n\n${source.url}\n\nDisabling hides its checkout links immediately. Enabling makes published package checkout links available when event registration permits them.`,
      )
    )
      return;
    await mutate(
      `/sources/${source.id}`,
      {
        expectedVersion: source.version,
        label,
        enabled,
        confirmed: true,
      },
      "External source updated.",
    );
  }
  return (
    <form
      className="event-package-source"
      aria-label={`Source ${source.label}`}
      onSubmit={(event) => void save(event)}
    >
      <fieldset className="form-stack event-fieldset" disabled={disabled}>
        <label>
          Source label
          <input
            required
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Source URL
          <input type="url" readOnly value={source.url} />
        </label>
        <label className="event-package-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled source
        </label>
        <button
          type="submit"
          className="button button-outline"
          disabled={label === source.label && enabled === source.enabled}
        >
          Save source
        </button>
      </fieldset>
    </form>
  );
}

export function EventPackageSources({
  sources,
  disabled,
  canPublish,
  mutate,
  onDirty,
}: {
  sources: PackageSource[];
  disabled: boolean;
  canPublish: boolean;
  mutate: PackageMutation;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const dirty = Boolean(label || url);
  useEffect(() => {
    onDirty("new-source", dirty);
    return () => onDirty("new-source", false);
  }, [dirty, onDirty]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutate(
      "/sources",
      { label, url },
      "External source added. Packages are published separately.",
    );
    if (result) {
      setLabel("");
      setUrl("");
    }
  }
  return (
    <section
      className="panel event-package-sources"
      aria-label="External checkout sources"
    >
      <h3>External checkout sources</h3>
      <p>
        Add the Luma destinations guests can use. Several packages may use one
        source. A saved URL is fixed; add another source when the destination
        changes.
      </p>
      <p className="field-help">
        Links are supplied by your event team. Saving a link does not verify its
        tickets, prices or purchases.
      </p>
      <div className="event-package-source-list">
        {sources.map((source) => (
          <SourceForm
            key={`${source.id}:${source.version}`}
            source={source}
            disabled={disabled || !canPublish}
            mutate={mutate}
            onDirty={onDirty}
          />
        ))}
      </div>
      <form
        className="form-stack"
        aria-label="Add external source"
        onSubmit={(event) => void create(event)}
      >
        <fieldset className="form-stack event-fieldset" disabled={disabled}>
          <legend>Add a source</legend>
          <label>
            New source label
            <input
              required
              maxLength={120}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label>
            Luma checkout URL
            <input
              type="url"
              required
              placeholder="https://luma.com/your-event"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button type="submit" className="button button-outline">
            Add external source
          </button>
        </fieldset>
      </form>
    </section>
  );
}
