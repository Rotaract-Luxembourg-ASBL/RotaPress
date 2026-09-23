"use client";
import { useState } from "react";
import type { EventDraft } from "../event_schemas";
import type { CmsLocale } from "../../cms/cms_schemas";
import { request, useResource, errorMessage } from "@/ui/api";
import { Notice, Loading } from "@/ui/primitives";
import { useCurrentUser } from "@/ui/admin-shell";

type PageRevision = { id: string; locale: CmsLocale; revisionId: string };
type History = {
  revisions: {
    id: string;
    title: string;
    version: number;
    action: string;
    createdAt: string;
    pages: PageRevision[];
  }[];
  pages: PageRevision[];
  featured: { id: string; title: string } | null;
};
export function EventEditorialPanel({
  event,
  disabled,
  onSaved,
}: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
}) {
  const { capabilities } = useCurrentUser();
  const { data, error, refresh } = useResource<History>(
    `/api/admin/events/${event.id}/history`,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  async function mutate(path: string, body: object) {
    setBusy(true);
    setProblem("");
    setMessage("");
    try {
      onSaved(
        await request<EventDraft>(`/api/admin/events/${event.id}/${path}`, {
          method: "POST",
          body: JSON.stringify({
            ...body,
            expectedVersion: event.version,
            confirmed: true,
          }),
        }),
      );
      setMessage(
        path === "restore"
          ? "Restored as new drafts. Publication and operational records are unchanged."
          : "Featured event selection updated.",
      );
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const locked = disabled || busy || event.archived || event.cancelled;
  return (
    <section className="panel form-stack" aria-label="Event editorial history">
      <div>
        <p className="eyebrow">Editorial history</p>
        <h2>Revisions and homepage selection</h2>
      </div>
      {(error || problem) && <Notice>{problem || error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      {!data ? (
        <Loading />
      ) : (
        <>
          {capabilities.includes("events.manage") && (
            <div className="form-stack">
              <h3>Featured event</h3>
              <p>
                {data.featured
                  ? `Selected: ${data.featured.title}`
                  : "No featured event selected."}
              </p>
              <p className="field-help">
                The homepage’s Published events block can show the featured
                event. Only a public, published event with Website enabled is
                eligible. Other events stay published.
              </p>
              <div>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={locked || !event.published}
                  onClick={() => {
                    if (
                      window.confirm(
                        event.featured
                          ? "Remove this homepage selection? The event stays published."
                          : `Feature this event${data.featured ? ` instead of ${data.featured.title}` : ""}? Other events stay published.`,
                      )
                    )
                      void mutate("featured", {
                        featured: !event.featured,
                        expectedFeaturedId: data.featured?.id ?? null,
                      });
                  }}
                >
                  {event.featured
                    ? "Remove featured selection"
                    : "Feature on homepage"}
                </button>
              </div>
            </div>
          )}
          <p className="field-help">
            Restoring copies event details and the recorded CMS pages into new
            drafts. Later pages, navigation, features, bookings and guests are
            retained. Publication is a separate action.
          </p>
          <div className="event-revision-list">
            {data.revisions.map((revision) => (
              <article key={revision.id}>
                <div>
                  <strong>{revision.title}</strong>
                  <p className="field-help">
                    {revision.action} · Version {revision.version} ·{" "}
                    {new Date(revision.createdAt).toLocaleString()} ·{" "}
                    {revision.pages.length} recorded pages
                  </p>
                </div>
                {event.capabilities.includes("events.edit") && (
                  <button
                    type="button"
                    className="button button-outline button-small"
                    disabled={locked}
                    onClick={() => {
                      const pages = revision.pages.map((page) => {
                        const current = data.pages.find(
                          (item) =>
                            item.id === page.id && item.locale === page.locale,
                        );
                        return {
                          id: page.id,
                          locale: page.locale,
                          expectedRevisionId: current?.revisionId,
                        };
                      });
                      if (pages.some((page) => !page.expectedRevisionId)) {
                        setProblem(
                        "A recorded page is archived or unavailable. This revision cannot be restored as a whole; current drafts were not changed.",
                        );
                        return;
                      }
                      if (
                        window.confirm(
                          `Restore ${revision.title} and ${revision.pages.length} recorded page drafts? The public event will not change.`,
                        )
                      )
                        void mutate("restore", {
                          revisionId: revision.id,
                          pages,
                        });
                    }}
                  >
                    Restore as draft
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
