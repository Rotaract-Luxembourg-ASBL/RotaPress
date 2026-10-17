"use client";
import { useState } from "react";
import { useResource } from "@/ui/api";
import { CollectionPagination } from "@/ui/collection-pagination";
import { Loading, Notice } from "@/ui/primitives";
import type { EventCollection } from "../event_collection";

export function EventCopyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; title: string }>();
  const { data, error, refresh } = useResource<EventCollection>(
    `/api/admin/events?${new URLSearchParams({ status: "active", pageSize: "10", page: String(page), search })}`,
  );
  return (
    <div className="form-stack">
      <label>
        Find an event to copy
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
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
      {selected && <p role="status">Selected: {selected.title}</p>}
      <fieldset className="editor-fieldset form-stack">
        <legend>Copy source</legend>
        {data?.events.map((event) => (
          <label className="checkbox-label" key={event.id}>
            <input
              type="radio"
              name="event-copy-source"
              checked={value === event.id}
              onChange={() => {
                setSelected(event);
                onChange(event.id);
              }}
            />
            {event.title}
          </label>
        ))}
        {data?.total === 0 && <p>No events match this search.</p>}
      </fieldset>
      {data && (
        <CollectionPagination {...data} noun="events" onPage={setPage} />
      )}
    </div>
  );
}
