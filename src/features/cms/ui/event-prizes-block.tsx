"use client";

import Link from "next/link";
import { useResource } from "@/ui/api";
import type { PrizeWorkspace } from "@/features/events/prize_schemas";
import { EventPrizeGallery } from "@/features/events/ui/event-prize-gallery";
import { useEditorEvent, useRefreshOnFocus } from "./event-editor-scope";

export function EventPrizesPreview({
  title,
  eventId,
}: {
  title: string;
  eventId?: string;
}) {
  const context = useEditorEvent();
  const id = eventId ?? context?.id;
  const workspace = useResource<PrizeWorkspace>(
    id ? `/api/admin/events/${id}/prizes` : null,
  );
  useRefreshOnFocus(workspace.refresh);
  const items =
    workspace.data?.items.flatMap((item) =>
      item.published ? [item.published] : [],
    ) ?? [];
  items.sort((left, right) => left.position - right.position);
  return (
    <section
      className="cms-block event-prizes-block"
      aria-label="Published prizes preview"
    >
      {title && <h2>{title}</h2>}
      {items.length ? (
        <EventPrizeGallery items={items} />
      ) : (
        <p>
          No prizes are published yet. Prepare prizes in the event workspace,
          then publish them separately.
        </p>
      )}
      <p className="field-help">
        Preview of published prizes. Private prize drafts do not appear here.
      </p>
      {workspace.error && <p className="field-help">{workspace.error}</p>}
      {id && (
        <Link
          className="text-link"
          href={`/admin/events/${id}?tab=prizes`}
          target="_blank"
        >
          Manage prizes
        </Link>
      )}
    </section>
  );
}
