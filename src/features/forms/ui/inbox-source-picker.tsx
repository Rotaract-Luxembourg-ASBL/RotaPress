"use client";

import { useState, type FormEvent } from "react";
import type { InboxFormPage } from "../inbox_schemas";
import { Notice } from "@/ui/primitives";
import { useInboxPage } from "./use-inbox-page";

export function InboxSourcePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const sources = useInboxPage<InboxFormPage>(
    `/api/admin/inbox/forms?q=${encodeURIComponent(query)}&page=${page}&pageSize=25`,
  );
  const selected = useInboxPage<InboxFormPage>(
    value
      ? `/api/admin/inbox/forms?id=${encodeURIComponent(value)}&pageSize=1`
      : null,
  );
  const current = selected.data?.forms.find((form) => form.id === value);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(String(new FormData(event.currentTarget).get("q") ?? ""));
    setPage(1);
  }
  return (
    <div className="inbox-source-picker">
      <label>
        Source form
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!sources.data && !sources.error}
        >
          <option value="">All forms</option>
          {value && !sources.data?.forms.some((form) => form.id === value) && (
            <option value={value}>{current?.title ?? "Selected form"}</option>
          )}
          {sources.data?.forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.title}
              {form.eventTitle ? ` · ${form.eventTitle}` : ""}
              {form.archived ? " · archived" : ""}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <p className="field-help">
          Responses for {current?.title ?? "the selected form"}
        </p>
      )}
      <details>
        <summary>Find another form</summary>
        <form onSubmit={search} className="inbox-source-search">
          <label>
            Search source forms
            <input
              name="q"
              type="search"
              maxLength={160}
              defaultValue={query}
              placeholder="Form or event title"
            />
          </label>
          <button type="submit" className="button button-outline button-small">
            Find forms
          </button>
        </form>
        {sources.data && (
          <p className="field-help" role="status">
            {sources.data.total} matching forms · Page {sources.data.page} of{" "}
            {Math.max(1, Math.ceil(sources.data.total / sources.data.pageSize))}
          </p>
        )}
        {sources.data && sources.data.total > sources.data.pageSize && (
          <div className="forms-actions">
            <button
              type="button"
              className="button button-outline button-small"
              disabled={sources.data.page <= 1}
              onClick={() => setPage(sources.data!.page - 1)}
            >
              Previous forms
            </button>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={
                sources.data.page * sources.data.pageSize >= sources.data.total
              }
              onClick={() => setPage(sources.data!.page + 1)}
            >
              Next forms
            </button>
          </div>
        )}
      </details>
      {(sources.error || selected.error) && (
        <Notice>
          {sources.error || selected.error}{" "}
          <button
            type="button"
            className="inline-button"
            onClick={() => {
              sources.refresh();
              selected.refresh();
            }}
          >
            Retry source forms
          </button>
        </Notice>
      )}
    </div>
  );
}
