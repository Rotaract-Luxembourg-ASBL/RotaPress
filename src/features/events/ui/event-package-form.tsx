"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Notice } from "@/ui/primitives";
import type { PackageDraft, PackageWorkspace } from "../package_schemas";
import { EventPackageCards, packagePrice } from "./event-package-cards";
import type { PackageMutation } from "./event-packages-panel";

type SavedPackage = PackageWorkspace["packages"][number];
const emptyDraft: PackageDraft = {
  title: "",
  description: "",
  priceMinor: 0,
  currency: "EUR",
  showPrice: false,
  checkoutEnabled: false,
  position: 0,
};

export function EventPackageForm({
  record,
  workspace,
  disabled,
  mutate,
  onSelected,
  onDirty,
}: {
  record?: SavedPackage;
  workspace: PackageWorkspace;
  disabled: boolean;
  mutate: PackageMutation;
  onSelected: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(record?.draft ?? emptyDraft);
  const [amount, setAmount] = useState(
    ((record?.draft.priceMinor ?? 0) / 100).toFixed(2),
  );
  const [sourceId, setSourceId] = useState(record?.sourceId ?? "");
  const [problem, setProblem] = useState("");
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(record?.draft ?? emptyDraft) ||
    sourceId !== (record?.sourceId ?? "") ||
    amount !== ((record?.draft.priceMinor ?? 0) / 100).toFixed(2);
  const source = workspace.sources.find((item) => item.id === sourceId);
  const locked = disabled || !workspace.canEdit;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = <Key extends keyof PackageDraft>(
    key: Key,
    value: PackageDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setProblem("");
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setProblem("Enter a price with up to two decimal places.");
      return;
    }
    const [major, minor = ""] = amount.split(".");
    const priceMinor = Number(major) * 100 + Number(minor.padEnd(2, "0"));
    if (!Number.isSafeInteger(priceMinor) || priceMinor > 100_000_000) {
      setProblem("Enter a price up to 1,000,000.00.");
      return;
    }
    const result = await mutate(
      "",
      {
        ...(record ? { id: record.id } : {}),
        expectedVersion: record?.version ?? 0,
        sourceId: sourceId || null,
        draft: { ...draft, priceMinor },
      },
      "Package draft saved. The published offer has not changed.",
    );
    const saved = result?.packages.find((item) =>
      record
        ? item.id === record.id
        : !workspace.packages.some((old) => old.id === item.id),
    );
    if (saved) onSelected(saved.id);
  }
  async function publish(operation: "publish" | "unpublish") {
    if (!record) return;
    const summary =
      operation === "unpublish"
        ? `Remove “${record.published?.title ?? record.draft.title}” from the public package list? The saved draft and history will remain.`
        : `Publish “${record.draft.title}”?\n\n${record.draft.showPrice ? packagePrice(record.draft.priceMinor, record.draft.currency) : "No price displayed"}\n${record.draft.checkoutEnabled ? `External checkout: ${source?.url ?? "No source selected"}` : "No checkout link"}\n\nThe package will appear wherever Published packages is on this event's published page. External purchases do not grant local guest access.`;
    if (!window.confirm(summary)) return;
    await mutate(
      `/${record.id}/publication`,
      {
        expectedVersion: record.version,
        operation,
        confirmed: true,
        ...(operation === "publish" && record.draft.checkoutEnabled && source
          ? { expectedSourceVersion: source.version }
          : {}),
      },
      operation === "publish"
        ? "Package published."
        : "Package removed from the public list. Its draft is retained.",
    );
  }
  return (
    <section className="panel event-package-editor" aria-label="Package editor">
      <header>
        <h3>{record ? "Edit package" : "New package"}</h3>
        <p>Save a private draft, then review publication separately.</p>
      </header>
      {problem && <Notice>{problem}</Notice>}
      <form className="form-stack" onSubmit={(event) => void save(event)}>
        <fieldset className="form-stack event-fieldset" disabled={locked}>
          <label>
            Package title
            <input
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label>
            Package description
            <textarea
              rows={3}
              maxLength={2000}
              value={draft.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <div className="event-package-fields">
            <label>
              Price
              <input
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                value={draft.currency}
                onChange={(e) =>
                  change("currency", e.target.value as PackageDraft["currency"])
                }
              >
                {["EUR", "USD", "GBP", "CHF"].map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="event-package-toggle">
            <input
              type="checkbox"
              checked={draft.showPrice}
              onChange={(e) => change("showPrice", e.target.checked)}
            />
            Display this price publicly
          </label>
          <label>
            External checkout source
            <select
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                if (!e.target.value) change("checkoutEnabled", false);
              }}
            >
              <option value="">No external source</option>
              {workspace.sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.enabled ? "" : " (disabled)"}
                </option>
              ))}
            </select>
          </label>
          <label className="event-package-toggle">
            <input
              type="checkbox"
              checked={draft.checkoutEnabled}
              onChange={(e) => change("checkoutEnabled", e.target.checked)}
              disabled={!source?.enabled || !workspace.checkoutAvailable}
            />
            Enable external checkout
          </label>
          <p className="field-help">
            Checkout opens the chosen Luma destination. Set its tickets and
            final price on Luma. Local display prices do not configure a Luma
            ticket.
          </p>
          <label>
            Display order
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={draft.position}
              onChange={(e) => change("position", Number(e.target.value))}
            />
          </label>
          <button
            type="submit"
            className="button button-accent"
            disabled={!dirty}
          >
            {record ? "Save package draft" : "Create package draft"}
          </button>
        </fieldset>
      </form>
      {record && workspace.canPublish && (
        <div className="event-inline-actions">
          <button
            type="button"
            className="button button-accent"
            disabled={
              disabled ||
              dirty ||
              (record.draft.checkoutEnabled &&
                (!workspace.checkoutAvailable || !source?.enabled))
            }
            onClick={() => void publish("publish")}
          >
            Publish package
          </button>
          {record.published && (
            <button
              type="button"
              className="button button-outline"
              disabled={disabled || dirty}
              onClick={() => void publish("unpublish")}
            >
              Remove from public list
            </button>
          )}
        </div>
      )}
      {dirty && record && (
        <p className="field-help">Save the draft before publishing it.</p>
      )}
      {record?.published && (
        <div className="event-package-published">
          <h4>Published offer</h4>
          <EventPackageCards items={[record.published]} preview />
        </div>
      )}
    </section>
  );
}
