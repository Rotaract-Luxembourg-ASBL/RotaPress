"use client";

import Link from "next/link";
import type { FormDto } from "../../forms/form_types";
import type { EventParticipationPlacement } from "../event_readiness";

export type EventPagePlacementProps = {
  placement?: EventParticipationPlacement;
  error?: string;
  eventPublished: boolean;
  canEdit: boolean;
  navigationDisabled: boolean;
};

export function EventPagePlacement({
  kind,
  placement,
  error,
  eventPublished,
  canEdit,
  navigationDisabled,
}: EventPagePlacementProps & { kind: "form" | "registration" }) {
  return (
    <section
      className="form-stack event-participation-tools"
      aria-label={
        kind === "registration"
          ? "Registration page placement"
          : "Form page placement"
      }
    >
      <div className="event-feature-header">
        <h4>
          {kind === "registration"
            ? "3. Place registration on your page"
            : "Show forms on your event page"}
        </h4>
        <span className="status-badge">
          {error
            ? "Page status unavailable"
            : !placement
              ? "Checking page"
              : placement.live
                ? "Visible to guests"
                : placement.published
                  ? "Section unavailable"
                  : "Not visible to guests"}
        </span>
      </div>
      {error ? (
        <p className="field-help" role="alert">
          {error}
        </p>
      ) : placement ? (
        placement.pages.length ? (
          <ul className="content-rows">
            {placement.pages.map((page) => (
              <li className="content-row" key={`${page.id}-${page.locale}`}>
                <div>
                  <strong>{page.locale.toUpperCase()} event page</strong>
                  <p className="small">
                    Saved draft: {page.draft ? "Visible" : "Not visible"}
                  </p>
                  <p className="small">
                    Published page:{" "}
                    {page.live
                      ? "Visible"
                      : page.published
                        ? "Section unavailable"
                        : "Not visible"}
                  </p>
                </div>
                {page.editorHref && canEdit && (
                  <Link
                    className="button button-outline button-small"
                    href={page.editorHref}
                    aria-disabled={navigationDisabled}
                    onClick={(e) => {
                      if (navigationDisabled) e.preventDefault();
                    }}
                  >
                    Open page editor · {page.locale.toUpperCase()}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-help">
            Create the main page in Event page first.
          </p>
        )
      ) : undefined}
      <p className="field-help">
        {kind === "registration"
          ? "In the page editor, open Add section and choose Add Event registration to put sign-up directly on your page. It uses this event's registration settings."
          : "In the page editor, open Add section and choose Add Form, then select a published event enquiry form. Use Event registration for bookings."}{" "}
        In Page layout, make sure the section is visible. Save and publish to
        update the page visitors see. Other draft changes leave the published
        section unchanged.
      </p>
      {!canEdit && Boolean(placement?.pages.length) && (
        <p className="field-help">
          An event editor can place this block on the page.
        </p>
      )}
      {!eventPublished && (
        <p className="field-help">
          Publish the event details and page in Event page before sharing.
        </p>
      )}
    </section>
  );
}

export function RegistrationFormPreparation({
  form,
  canCreate,
  disabled,
  navigationDisabled,
  onCreate,
}: {
  form?: FormDto;
  canCreate: boolean;
  disabled: boolean;
  navigationDisabled: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="form-stack">
      <div className="event-feature-header">
        <h4>1. Prepare the registration form</h4>
        <span className="status-badge">
          {!form
            ? "Form needed"
            : form.archived
              ? "Form archived"
              : form.publishedVersionId
                ? "Form published"
                : "Draft · Publish next"}
        </span>
      </div>
      {form ? (
        <>
          <p className="field-help">
            <strong>{form.draft.title}</strong>.{" "}
            {form.archived
              ? "Restore and publish this form to accept new registrations."
              : form.publishedVersionId
                ? "The published questions are ready to use. Choose this form in the registration settings below."
                : "Edit the questions, save your changes, then use Publish form in the form editor."}
          </p>
          <div>
            <Link
              className="button button-outline button-small"
              href={`/admin/forms/${form.id}`}
              aria-disabled={navigationDisabled}
              onClick={(e) => {
                if (navigationDisabled) e.preventDefault();
              }}
            >
              {form.event?.canEdit
                ? "Edit registration questions"
                : "View registration form"}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="field-help">
            Create a registration form with starting questions, then edit and
            publish it. Creating the draft keeps registration closed.
          </p>
          {canCreate ? (
            <div>
              <button
                type="button"
                className="button button-accent button-small"
                disabled={disabled}
                onClick={onCreate}
              >
                Create registration form
              </button>
            </div>
          ) : (
            <p className="field-help">
              Ask an event editor to create the form.
            </p>
          )}
        </>
      )}
    </div>
  );
}
