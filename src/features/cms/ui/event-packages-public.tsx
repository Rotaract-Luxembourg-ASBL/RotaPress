import "server-only";

import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { DomainError } from "@/core/authorization/AuthorizationService";
import { EventPackageCards } from "@/features/events/ui/event-package-cards";

export async function EventPackagesBlock({
  eventId,
  title,
  locale,
}: {
  eventId: string;
  title: string;
  locale: string;
}) {
  const items = await services.eventPackages
    .published(await getActor(await headers()), eventId)
    .catch((error: unknown) => {
      if (error instanceof DomainError && error.status === 404) return [];
      throw error;
    });
  if (!items.length) return null;
  return (
    <section
      className="cms-block event-packages-block"
      aria-label="Published packages"
    >
      {title && <h2>{title}</h2>}
      <EventPackageCards items={items} locale={locale} />
    </section>
  );
}
