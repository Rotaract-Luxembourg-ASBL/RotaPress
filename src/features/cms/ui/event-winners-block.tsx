"use client";
import Link from "next/link";
import { useResource } from "@/ui/api";
import { useEditorEvent, useRefreshOnFocus } from "./event-editor-scope";
import type { PublicWinner } from "@/features/events/draw_schemas";
import { EventWinnerList } from "@/features/events/ui/event-winner-list";

export function EventWinnersPreview({
  title,
  eventId,
}: {
  title: string;
  eventId?: string;
}) {
  const context = useEditorEvent();
  const id = eventId ?? context?.id;
  const { data, error, refresh } = useResource<PublicWinner[]>(
    id ? `/api/admin/events/${id}/draws/published` : null,
  );
  useRefreshOnFocus(refresh);
  return (
    <div>
      <EventWinnerList title={title} items={data ?? []} />
      {!data?.length && (
        <p>
          No demonstration winners are public yet. Run a draw and review its
          public names in Prizes.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {id && (
        <Link
          className="text-link"
          href={`/admin/events/${id}?tab=prizes&prizeView=draws`}
          target="_blank"
        >
          Review draws &amp; winners
        </Link>
      )}
    </div>
  );
}
