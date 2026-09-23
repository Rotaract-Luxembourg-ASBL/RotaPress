"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import type { FormDto } from "../../forms/form_types";
import type {
  RegistrationDto,
  RegistrationSettingsDto,
} from "../registration_schemas";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { RegistrationFormPreparation } from "./event-participation-setup";

type StaffRegistration = RegistrationDto & {
  name: string;
  email: string;
  formId: string;
  submissionId: string;
};
export function EventRegistrationPanel({
  eventId,
  forms,
  formsLoaded,
  canConfigure,
  canCreate,
  onCreateForm,
  enabled,
  formsEnabled,
  eventPublished,
  disabled,
  navigationDisabled,
}: {
  eventId: string;
  forms: FormDto[];
  formsLoaded: boolean;
  canConfigure: boolean;
  canCreate: boolean;
  onCreateForm: () => void;
  enabled: boolean;
  formsEnabled: boolean;
  eventPublished: boolean;
  disabled: boolean;
  navigationDisabled: boolean;
}) {
  const { data, error, refresh } = useResource<RegistrationSettingsDto>(
    `/api/admin/events/${eventId}/registration`,
  );
  const records = useResource<{ registrations: StaffRegistration[] }>(
    `/api/admin/events/${eventId}/registrations`,
  );
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    window.addEventListener("event-registration-updated", refresh);
    return () =>
      window.removeEventListener("event-registration-updated", refresh);
  }, [refresh]);
  const [busy, setBusy] = useState(false);
  async function cancel(row: StaffRegistration) {
    if (
      !window.confirm(
        `Cancel this registration for ${row.name}? The place will be released; the record is retained.`,
      )
    )
      return;
    setBusy(true);
    setProblem(undefined);
    try {
      await request(
        `/api/admin/events/${eventId}/registrations/${row.id}/cancel`,
        { method: "POST", body: JSON.stringify({ confirmed: true }) },
      );
      records.refresh();
      window.dispatchEvent(new Event("event-registration-updated"));
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const registrationForms = forms.filter(
    (form) => form.kind === "registration" && !form.archived,
  );
  const configuredForm = forms.find((form) => form.id === data?.formId);
  const preparedForm = data?.formId
    ? configuredForm
    : (registrationForms.find((form) => form.publishedVersionId) ??
      registrationForms[0]);
  const recordList = (
    <>
      {problem && <Notice>{problem}</Notice>}
      {records.error && <Notice>{records.error}</Notice>}
      <ul className="content-rows">
        {records.data?.registrations.map((row) => (
          <li key={row.id} className="content-row">
            <div>
              <strong>{row.name}</strong>
              <p className="small muted">
                {row.email} · {row.status}
              </p>
              <Link
                className="text-link"
                href={`/admin/forms/${row.formId}/submissions/${row.submissionId}`}
              >
                Private response
              </Link>
            </div>
            {row.status === "confirmed" && (
              <button
                className="button button-outline button-small"
                disabled={busy}
                onClick={() => void cancel(row)}
              >
                Cancel registration
              </button>
            )}
          </li>
        ))}
      </ul>
      {data?.authority !== "luma" &&
        records.data?.registrations.length === 0 && (
          <p className="small muted">No registrations yet.</p>
        )}
      {records.data?.registrations.length === 500 && (
        <p>
          Showing the most recent 500 registrations. Use the form submission
          filters and export for older responses.
        </p>
      )}
    </>
  );
  if (!enabled) {
    return error || records.error ? (
      <Notice>{error ?? records.error}</Notice>
    ) : records.data && records.data.registrations.length > 0 ? (
      <details>
        <summary>
          Saved registrations ({records.data.registrations.length})
        </summary>
        <p className="field-help">
          Registration is paused. Existing bookings remain available to your
          team.
        </p>
        {recordList}
      </details>
    ) : null;
  }
  return (
    <section
      className="form-stack event-participation-tools"
      aria-label="Registration settings and records"
    >
      <h3>
        {data?.authority === "luma"
          ? "Registration on Luma"
          : "Free registration"}
      </h3>
      {error && <Notice>{error}</Notice>}
      {!data ? (
        <Loading />
      ) : data.authority === "luma" ? (
        <p>
          Manage bookings and tickets in Luma. Use the Luma connection below to
          manage the registration link and guest imports.
        </p>
      ) : (
        <>
          <p>
            {data.confirmedCount} confirmed{" "}
            {data.capacity === null
              ? "· no capacity limit"
              : `of ${data.capacity} places`}{" "}
            · {data.open ? "Open" : "Closed"}
          </p>
          {!formsEnabled ? (
            <p className="field-help">
              Forms must be enabled for this club and this event before using
              free registration. Existing bookings are kept.
            </p>
          ) : !formsLoaded ? (
            <Loading />
          ) : (
            <>
              <RegistrationFormPreparation
                form={preparedForm}
                canCreate={canCreate}
                disabled={disabled}
                navigationDisabled={navigationDisabled}
                onCreate={onCreateForm}
              />
              <div className="form-stack event-participation-tools">
                <div className="event-feature-header">
                  <h4>2. Choose the form and open registration</h4>
                  <span className="status-badge">
                    {!data.formId
                      ? "Choose a form"
                      : !configuredForm?.publishedVersionId ||
                          configuredForm.archived
                        ? "Form unavailable"
                        : data.open
                          ? "Open"
                          : "Closed"}
                  </span>
                </div>
                {registrationForms.length === 0 && !data.formId ? (
                  <p className="field-help">
                    Prepare the form in step 1 first. The form choice, capacity
                    and opening controls will appear here.
                  </p>
                ) : canConfigure ? (
                  <Settings
                    key={data.version}
                    value={data}
                    eventId={eventId}
                    forms={forms}
                    eventPublished={eventPublished}
                    disabled={disabled}
                    onSaved={() => {
                      refresh();
                      window.dispatchEvent(
                        new Event("event-registration-updated"),
                      );
                    }}
                  />
                ) : (
                  <p className="field-help">
                    The event manager chooses the form and opens registration.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
      {recordList}
    </section>
  );
}
function Settings({
  value,
  eventId,
  forms,
  eventPublished,
  disabled,
  onSaved,
}: {
  value: RegistrationSettingsDto;
  eventId: string;
  forms: FormDto[];
  eventPublished: boolean;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [formId, setFormId] = useState(value.formId ?? "");
  const [capacity, setCapacity] = useState(value.capacity?.toString() ?? "");
  const [open, setOpen] = useState(value.open);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selectedForm = forms.find((form) => form.id === formId);
  const publishedForm = Boolean(
    selectedForm?.publishedVersionId && !selectedForm.archived,
  );
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !window.confirm(
            `Save native registration settings for this event? Registration will be ${open ? "open" : "closed"}. Existing registrations are preserved.`,
          )
        )
          return;
        setBusy(true);
        setError(undefined);
        try {
          await request(`/api/admin/events/${eventId}/registration`, {
            method: "POST",
            body: JSON.stringify({
              expectedVersion: value.version,
              authority: formId ? "native" : "none",
              formId: formId || null,
              capacity: capacity ? Number(capacity) : null,
              open,
              confirmed: true,
            }),
          });
          onSaved();
        } catch (cause) {
          setError(errorMessage(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset
        disabled={busy || disabled}
        className="form-stack forms-fieldset"
      >
        <div className="event-fields-grid">
          <label>
            Registration form
            <select
              value={formId}
              onChange={(e) => {
                setFormId(e.target.value);
                if (
                  !forms.some(
                    (form) =>
                      form.id === e.target.value &&
                      form.publishedVersionId &&
                      !form.archived,
                  )
                )
                  setOpen(false);
              }}
            >
              <option value="">Choose a registration form</option>
              {forms
                .filter(
                  (f) =>
                    f.kind === "registration" &&
                    (!f.archived || f.id === formId),
                )
                .map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.draft.title}
                    {f.archived
                      ? " (archived)"
                      : f.publishedVersionId
                        ? ""
                        : " (draft)"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Capacity
            <input
              type="number"
              min="1"
              max="100000"
              value={capacity}
              placeholder="Unlimited"
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
        </div>
        <p className="field-help">
          Leave capacity empty for unlimited places. Guests sign in to reserve a
          place.
        </p>
        <label className="forms-check">
          <input
            type="checkbox"
            checked={open}
            disabled={!publishedForm && !open}
            onChange={(e) => setOpen(e.target.checked)}
          />
          Open registration
        </label>
        {formId && !publishedForm && (
          <p className="field-help">
            {selectedForm?.archived
              ? "This form is archived. You can close registration here; restore and publish the form before reopening."
              : "Publish this form before opening registration."}{" "}
            <Link className="text-link" href={`/admin/forms/${formId}`}>
              Edit registration form
            </Link>
          </p>
        )}
        {!eventPublished && (
          <p className="field-help">
            Publish the event in Event page & publishing before guests can
            register.
          </p>
        )}
        <div className="form-actions">
          <button className="button button-outline">
            Save registration settings
          </button>
        </div>
      </fieldset>
      {error && <Notice>{error}</Notice>}
    </form>
  );
}
