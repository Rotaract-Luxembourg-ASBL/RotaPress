"use client";
import { useState } from "react";
import { request, useResource, errorMessage } from "@/ui/api";
import { Notice, Loading } from "@/ui/primitives";
import { Dialog } from "@/ui/dialog";
import type { EventDraft } from "@/features/events/event_schemas";
import type { LumaLinkDto } from "../luma_schemas";
import { LumaRegistrationCard } from "./luma-registration-card";

export function EventLumaPanel({
  event,
  disabled,
  registrationEnabled,
}: {
  event: EventDraft;
  disabled: boolean;
  registrationEnabled: boolean;
}) {
  const resource = useResource<LumaLinkDto>(
    `/api/admin/events/${event.id}/luma`,
  );
  if (!resource.data && !resource.error) return null;
  if (resource.data && !resource.data.enabled) {
    if (!resource.data.draftUrl && !resource.data.publishedUrl) return null;
    return (
      <section
        aria-label="Luma registration link"
        className="event-retained-integration"
      >
        <details>
          <summary>Saved Luma link (disabled)</summary>
          <div className="panel form-stack">
            <p>
              Luma is disabled for this club. The saved link is retained and is
              not offered to visitors.
            </p>
            <LinkEditor
              key={resource.data.version}
              value={resource.data}
              event={event}
              disabled={true}
              registrationEnabled={false}
              onSaved={resource.refresh}
            />
          </div>
        </details>
      </section>
    );
  }
  if (resource.data?.authority === "native" && !resource.data.draftUrl)
    return null;
  return (
    <section className="panel form-stack" aria-label="Luma registration link">
      <div>
        <p className="eyebrow">External registration</p>
        <h2>Luma registration link</h2>
        <p>
          Prepare a link to your event on Luma. Saving a draft leaves the public
          website unchanged.
        </p>
      </div>
      {resource.error && <Notice>{resource.error}</Notice>}
      {resource.data ? (
        <LinkEditor
          key={resource.data.version}
          value={resource.data}
          event={event}
          disabled={disabled}
          registrationEnabled={registrationEnabled}
          onSaved={resource.refresh}
        />
      ) : (
        !resource.error && <Loading />
      )}
    </section>
  );
}

function LinkEditor({
  value,
  event,
  disabled,
  registrationEnabled,
  onSaved,
}: {
  value: LumaLinkDto;
  event: EventDraft;
  disabled: boolean;
  registrationEnabled: boolean;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(value.draftUrl),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState<{
    value: LumaLinkDto;
    operation: "publish" | "unpublish";
  }>();
  const [preview, setPreview] = useState(false),
    [phone, setPhone] = useState(false);
  const [problem, setProblem] = useState<string>();
  const locked = disabled || busy || event.archived || event.cancelled;
  const dirty = url !== value.draftUrl;
  async function publicationReview(operation: "publish" | "unpublish") {
    setBusy(true);
    setProblem(undefined);
    setConfirmed(false);
    try {
      const current = await request<LumaLinkDto>(
        `/api/admin/events/${event.id}/luma`,
      );
      if (current.version !== value.version)
        throw new Error(
          "The saved link changed. Reload it before reviewing publication.",
        );
      setReview({ value: current, operation });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!value.enabled && (
        <Notice kind="info">
          Luma link mode is disabled for the club. An administrator can allow it
          in Integrations. Drafts are retained.
        </Notice>
      )}
      <p className="status-badge">
        {value.published ? "Link published" : "Link not published"}
      </p>
      {value.publishedUrl && (
        <p className="field-help" style={{ overflowWrap: "anywhere" }}>
          Selected destination: {value.publishedUrl}
        </p>
      )}
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setProblem(undefined);
          try {
            await request(`/api/admin/events/${event.id}/luma`, {
              method: "POST",
              body: JSON.stringify({ expectedVersion: value.version, url }),
            });
            onSaved();
          } catch (cause) {
            setProblem(errorMessage(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Luma event URL
          <input
            type="url"
            required
            maxLength={260}
            placeholder="https://luma.com/your-event"
            value={url}
            disabled={locked}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <p className="field-help">
          Use the event's link on luma.com or lu.ma, without query parameters.
          This checks its format; verify the destination in Luma before
          publishing.
        </p>
        <div className="form-actions">
          <button className="button button-outline" disabled={locked || !dirty}>
            Save Luma link draft
          </button>
          {value.publishedUrl && url !== value.publishedUrl && (
            <button
              type="button"
              className="inline-button"
              disabled={locked}
              onClick={() => setUrl(value.publishedUrl!)}
            >
              Restore selected destination
            </button>
          )}
        </div>
      </form>
      <p>
        Enable Website and Registration, then publish this link and the event's
        pages/details. Luma owns registrations for this event; native
        registration history prevents switching. Once selected, replacing the
        provider event requires a separate migration decision.
      </p>
      {problem && (
        <Notice>
          {problem}{" "}
          <button className="inline-button" disabled={busy} onClick={onSaved}>
            Reload saved link
          </button>
        </Notice>
      )}
      <div className="form-actions">
        <button
          className="button button-outline"
          disabled={!value.draftUrl || dirty || busy}
          onClick={() => setPreview(true)}
        >
          Preview saved Luma link
        </button>
        {event.capabilities.includes("events.publish") && (
          <>
            <button
              className="button button-accent"
              disabled={
                locked ||
                dirty ||
                !value.draftUrl ||
                !value.enabled ||
                !registrationEnabled
              }
              onClick={() => void publicationReview("publish")}
            >
              Review Luma link publication
            </button>
            {value.published && (
              <button
                className="button button-outline"
                disabled={disabled || busy}
                onClick={() => void publicationReview("unpublish")}
              >
                Unpublish Luma link
              </button>
            )}
          </>
        )}
      </div>
      {preview && (
        <Dialog
          title="Saved Luma link preview"
          onClose={() => setPreview(false)}
        >
          <div className="form-stack">
            <p>
              Authorized draft preview. This does not publish or contact Luma.
            </p>
            <div>
              <button
                className="button button-outline"
                aria-pressed={phone}
                onClick={() => setPhone(!phone)}
              >
                {phone ? "Desktop preview" : "Phone preview"}
              </button>
            </div>
            <div style={{ maxWidth: phone ? 320 : undefined }}>
              <LumaRegistrationCard url={value.draftUrl} preview />
            </div>
          </div>
        </Dialog>
      )}
      {review && (
        <Dialog
          title={
            review.operation === "publish"
              ? "Review Luma link publication"
              : "Review Luma link removal"
          }
          onClose={() => setReview(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p style={{ overflowWrap: "anywhere" }}>
              {review.operation === "publish"
                ? review.value.draftUrl
                : review.value.publishedUrl}
            </p>
            <p>
              {review.operation === "publish"
                ? "Select Luma as this event's registration authority and publish this saved destination. Visitors will leave this website to register. Provider bookings, payments and cancellations are managed in Luma."
                : "Remove the registration link from this website immediately. Luma bookings are unchanged; contact Luma separately to close provider registration."}
            </p>
            <p>
              No guest data is imported, and no provider request is sent.
              Existing pages, forms and shared site appearance are preserved.
            </p>
            {problem && <Notice>{problem}</Notice>}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={busy}
              />
              I confirm this change to the event's Luma registration link.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={async () => {
                setBusy(true);
                setProblem(undefined);
                try {
                  await request(
                    `/api/admin/events/${event.id}/luma/publication`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        expectedVersion: review.value.version,
                        expectedRegistrationVersion:
                          review.value.registrationVersion,
                        operation: review.operation,
                        confirmed: true,
                      }),
                    },
                  );
                  setReview(undefined);
                  onSaved();
                  window.dispatchEvent(new Event("event-registration-updated"));
                } catch (cause) {
                  setProblem(errorMessage(cause));
                  setConfirmed(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm Luma link change
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
