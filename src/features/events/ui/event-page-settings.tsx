"use client";
import Link from "next/link";
import type { RevisionDto } from "@/features/cms/cms_schemas";
import { MediaPicker } from "@/ui/media-picker";
import { useCurrentUser } from "@/ui/admin-shell";

export function EventPageSettings({
  draft,
  change,
  pageId,
  locale,
  event,
}: {
  draft: RevisionDto;
  change: (value: RevisionDto) => void;
  pageId: string;
  locale: string;
  event: { id: string; slug: string };
}) {
  const { capabilities } = useCurrentUser();
  const address = `/events/${event.slug}/${locale}/website`;
  return (
    <section className="event-page-panel">
      <header>
        <h2>Page settings</h2>
        <p>
          How your event appears in search results and when someone shares its
          link.
        </p>
      </header>
      <section
        className="event-page-address form-stack"
        aria-label="Event address"
      >
        <h3>Where people find this event</h3>
        <p>
          Public events appear in the{" "}
          <Link href="/events" target="_blank">
            events list
          </Link>{" "}
          after publication. Share the standalone page directly, or add an
          Events section to your club website.
        </p>
        <label>
          Standalone event address
          <input readOnly value={address} onFocus={(e) => e.target.select()} />
        </label>
        <p className="field-help">
          Unlisted events can be shared by link. Private events still require
          authorized access.
        </p>
        {capabilities.includes("ownership.manage") ? (
          <Link
            className="text-link"
            target="_blank"
            href={`/admin/settings?tab=domains&event=${event.id}`}
          >
            Set up an event subdomain ↗
          </Link>
        ) : (
          <p className="field-help">
            Your club owner can prepare an event subdomain in Settings →
            Domains.
          </p>
        )}
      </section>
      <div className="event-section-fields">
        <label>
          Page title
          <input
            value={draft.title}
            onChange={(e) => change({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          Page description
          <textarea
            rows={3}
            value={draft.description}
            onChange={(e) => change({ ...draft, description: e.target.value })}
          />
        </label>
        <section className="event-sharing-image" aria-label="Sharing image">
          <h3>Sharing image</h3>
          <MediaPicker
            value={draft.socialImageId ?? ""}
            onChange={(id) => change({ ...draft, socialImageId: id || null })}
          />
          <p className="field-help">
            Used for event cards and shared links after publication.
          </p>
        </section>
      </div>
      <Link
        className="button button-outline"
        target="_blank"
        href={`/admin/website/${pageId}/preview?locale=${locale}`}
      >
        Preview saved draft
      </Link>
      <p className="field-help">
        The live preview shows current input. This link opens the last draft you
        saved.
      </p>
    </section>
  );
}
