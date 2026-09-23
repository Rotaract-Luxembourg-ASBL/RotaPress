"use client";

import Link from "next/link";
import { useResource } from "@/ui/api";
import type { PackageWorkspace } from "@/features/events/package_schemas";
import { EventPackageCards } from "@/features/events/ui/event-package-cards";
import { useEditorEvent, useRefreshOnFocus } from "./event-editor-scope";

/** Preview only the scoped event's published offers, with checkout disabled. */
export function EventPackagesPreview({
  title,
  eventId,
}: {
  title: string;
  eventId?: string;
}) {
  const context = useEditorEvent();
  const id = eventId ?? context?.id;
  const workspace = useResource<PackageWorkspace>(
    id ? `/api/admin/events/${id}/packages` : null,
  );
  useRefreshOnFocus(workspace.refresh);
  const items =
    workspace.data?.packages.flatMap((item) =>
      item.published ? [item.published] : [],
    ) ?? [];
  items.sort((left, right) => left.position - right.position);
  return (
    <section
      className="cms-block event-packages-block"
      aria-label="Published packages preview"
    >
      {title && <h2>{title}</h2>}
      {items.length ? (
        <EventPackageCards items={items} preview />
      ) : (
        <p>
          No packages are published yet. Prepare your offers in Packages, then
          publish them separately.
        </p>
      )}
      <p className="field-help">
        Published package preview. Checkout is disabled here. Unpublished
        package drafts stay private.
      </p>
      {workspace.error && <p className="field-help">{workspace.error}</p>}
      {id && (
        <Link
          className="text-link"
          href={`/admin/events/${id}?tab=packages`}
          target="_blank"
        >
          Manage packages ↗
        </Link>
      )}
    </section>
  );
}
