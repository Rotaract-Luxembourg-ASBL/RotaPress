"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, request } from "@/ui/api";
import type { CmsDetail, RevisionDto } from "@/features/cms/cms_schemas";
import type { EventDraft } from "../event_schemas";
import { defaultEventDesign } from "../event_design";

export function useEventPageDocument(
  initial: CmsDetail,
  onEventSaved?: (event: EventDraft) => void,
) {
  const [detail, setDetail] = useState(initial);
  const [draft, setDraft] = useState<RevisionDto>(() => ({
    ...initial.draft,
    data: {
      ...initial.draft.data,
      root: {
        props: {
          ...initial.draft.data.root.props,
          eventLayout: "standalone",
          eventDesign:
            initial.draft.data.root.props.eventDesign ?? defaultEventDesign,
        },
      },
    },
  }));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `/api/admin/cms/content/${detail.id}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(detail.draft);
  const readOnly = detail.archived || Boolean(detail.event?.readOnlyReason);
  const payload = {
    locale: detail.locale,
    expectedRevisionId: detail.draft.id,
    title: draft.title,
    slug: draft.slug,
    description: draft.description,
    socialImageId: draft.socialImageId,
    data: draft.data,
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: RevisionDto) {
    setDraft(next);
    setMessage("");
  }

  async function commit(publish: boolean) {
    if (inFlight.current || readOnly) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const reviewedEvent =
        publish && detail.event
          ? await request<EventDraft>(`/api/admin/events/${detail.event.id}`)
          : null;
      if (
        reviewedEvent &&
        !window.confirm(
          [
            "Publish this event and page?",
            reviewedEvent.title,
            new Date(reviewedEvent.startsAt).toLocaleString(detail.locale, {
              timeZone: reviewedEvent.timezone,
            }),
            `Venue: ${reviewedEvent.venue || "Not set"}`,
            `Visibility: ${reviewedEvent.visibility}`,
            reviewedEvent.description,
            `Page: ${draft.title} (${detail.locale.toUpperCase()})`,
            "Your current page changes and these saved event details will become visible to guests. Other page drafts stay private.",
          ].join("\n\n"),
        )
      )
        return;
      let saved = detail;
      if (dirty) {
        saved = await request<CmsDetail>(`${base}/save`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setDetail(saved);
        setDraft(saved.draft);
      }
      if (reviewedEvent && saved.event) {
        const event = await request<EventDraft>(
          `/api/admin/events/${saved.event.id}/publication`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedVersion: reviewedEvent.version,
              operation: "publish",
              confirmed: true,
              pages: [
                {
                  id: saved.id,
                  locale: saved.locale,
                  expectedRevisionId: saved.draft.id,
                },
              ],
            }),
          },
        );
        const published = await request<CmsDetail>(
          `${base}?locale=${saved.locale}`,
        );
        setDetail(published);
        setDraft(published.draft);
        onEventSaved?.(event);
        setMessage("Published. Guests now see this event and page.");
      } else {
        setMessage("Draft saved. Your public page has not changed.");
      }
      window.dispatchEvent(new Event("event-pages-updated"));
    } catch (cause) {
      setError(`${errorMessage(cause)} Your entered content is still here.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    detail,
    draft,
    change,
    dirty,
    readOnly,
    busy,
    error,
    message,
    payload,
    base,
    save: () => commit(false),
    publish: () => commit(true),
    canLeave: () =>
      !dirty || window.confirm("Leave without saving your page changes?"),
  };
}
