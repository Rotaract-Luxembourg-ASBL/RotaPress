import "server-only";
import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { EventWinnerList } from "@/features/events/ui/event-winner-list";

export async function EventWinnersBlock({
  title,
  eventId,
}: {
  title: string;
  eventId: string;
}) {
  const items = await services.eventDraws.published(
    await getActor(await headers()),
    eventId,
  );
  return items.length ? <EventWinnerList title={title} items={items} /> : null;
}
