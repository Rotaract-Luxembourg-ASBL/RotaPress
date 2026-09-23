"use client";
import { useState } from "react";
import type { EventTemplateReview } from "../event_templates";
import { eventModules } from "../event_modules";

export function EventTemplateReviewPanel({
  review,
  busy,
  onBack,
  onConfirm,
}: {
  review: EventTemplateReview;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="form-stack">
      <h2>Review event setup</h2>
      <p>
        Starting from <strong>{review.source}</strong>. This creates a new
        private event with editable draft copies.
      </p>
      <h3>Event features</h3>
      <ul>
        {review.modules.map((item) => (
          <li key={item.key}>
            {eventModules[item.key].label}:{" "}
            {item.state === "enabled" ? "will be enabled" : item.state}
          </li>
        ))}
      </ul>
      <h3>Pages and forms</h3>
      <ul>
        {review.pages.map((p, i) => (
          <li key={`page-${i}`}>
            {p.title} · {p.locale.toUpperCase()} ·{" "}
            {p.archived ? "archived draft" : "draft page"}
          </li>
        ))}
        {review.forms.map((f, i) => (
          <li key={`form-${i}`}>
            {f.title} ·{" "}
            {f.kind === "registration" ? "registration form" : "enquiry form"} ·{" "}
            {f.archived ? "archived" : "draft"}
          </li>
        ))}
      </ul>
      {review.packages.length > 0 && (
        <>
          <h3>Package drafts</h3>
          <ul>
            {review.packages.map((item, index) => (
              <li key={index}>{item.title}</li>
            ))}
          </ul>
          <p>
            Copied as drafts; booking sources and checkout publication must be
            configured again.
          </p>
        </>
      )}
      {review.prizes.length > 0 && (
        <>
          <h3>Prize drafts</h3>
          <ul>
            {review.prizes.map((item, index) => (
              <li key={index}>{item.title}</li>
            ))}
          </ul>
          <p>
            Copied as private drafts. Review images and donor profiles, then
            publish each prize separately.
          </p>
        </>
      )}
      <p>
        Registration:{" "}
        {review.registration.authority === "native"
          ? `native free registration, closed${review.registration.capacity ? `, capacity ${review.registration.capacity}` : ", no capacity limit"}`
          : "no registration authority"}
        .
      </p>
      <p>
        Publish pages and forms when ready. Review the event wording and links
        in the dedicated event page editor. New pages have their own appearance
        without the club website header or footer. Copied pages retain their
        saved design.
      </p>
      {review.forms.length > 0 && (
        <p>
          New preset setups place the selected enquiry form or registration
          section in the event page draft. Publish the questions before opening
          registration or publishing an enquiry form.
        </p>
      )}
      <p>
        People, responses, notification settings and past revisions are not
        copied. Only the selected manager is assigned. Existing content,
        appearance and permissions stay unchanged.
      </p>
      <label className="forms-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Enable the listed features and create this private draft.
      </label>
      <div className="form-actions">
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={onBack}
        >
          Back to setup
        </button>
        <button
          type="button"
          className="button button-accent"
          disabled={busy || !confirmed}
          onClick={onConfirm}
        >
          {busy ? "Creating…" : "Confirm features and create draft"}
        </button>
      </div>
    </div>
  );
}
