import "server-only";

import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { DomainError } from "@/core/authorization/AuthorizationService";
import { EventPrizeGallery } from "@/features/events/ui/event-prize-gallery";

export async function EventPrizesBlock({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  const items = await services.eventPrizes
    .published(await getActor(await headers()), eventId)
    .catch((error: unknown) => {
      if (error instanceof DomainError && error.status === 404) return [];
      throw error;
    });
  if (!items.length) return null;
  return (
    <section
      className="cms-block event-prizes-block"
      aria-label="Published prizes"
    >
      {title && <h2>{title}</h2>}
      <EventPrizeGallery items={items} />
    </section>
  );
}
