"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import type { FormDto } from "../../forms/form_types";
import type { FormCollection } from "../../forms/form_collection";
import type {
  RegistrationDto,
  RegistrationSettingsDto,
} from "../registration_schemas";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { RegistrationFormPreparation } from "./event-participation-setup";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";
import type { CollectionPage } from "@/core/collections";

type StaffRegistration = RegistrationDto & {
  name: string;
  email: string;
  formId: string;
  submissionId: string;
};
export function EventRegistrationPanel({
  eventId,
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
  const choices = useResource<FormCollection>(
    formsEnabled
      ? `/api/admin/events/${eventId}/forms?kind=registration&status=active&pageSize=10`
      : null,
  );
  const configured = useResource<FormDto>(
    formsEnabled && data?.formId ? `/api/admin/forms/${data.formId}` : null,
  );
  const forms = [
    ...(choices.data?.forms ?? []),
    ...(configured.data &&
    !choices.data?.forms.some((form) => form.id === configured.data?.id)
      ? [configured.data]
      : []),
  ];
  const formsLoaded =
    !formsEnabled ||
    Boolean(
      choices.data && (!data?.formId || configured.data || configured.error),
    );
  const { params, change } = useCollectionLocation();
  const page = Number(params.get("registrationsPage")) || 1;
  const search = params.get("registrationsSearch") ?? "";
  const status = params.get("registrationsStatus") ?? "all";
  const records = useResource<
    CollectionPage & { registrations: StaffRegistration[] }
  >(
    `/api/admin/events/${eventId}/registrations?${new URLSearchParams({ page: String(page), search, status })}`,
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
  const configuredForm =
    configured.data ?? forms.find((form) => form.id === data?.formId);
  const preparedForm = data?.formId
    ? configuredForm
    : (registrationForms.find((form) => form.publishedVersionId) ??
      registrationForms[0]);
  const recordList = (
    <>
      <div className="admin-actions">
        <label>
          Search registrations
          <input
            type="search"
            value={search}
            onChange={(event) =>
              change(
                {
                  registrationsSearch: event.target.value,
                  registrationsPage: 1,
                },
                false,
              )
            }
          />
        </label>
        <label>
          Registration status
          <select
            value={status}
            onChange={(event) =>
              change(
                {
                  registrationsStatus: event.target.value,
                  registrationsPage: 1,
                },
                false,
              )
            }
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
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
      {records.data && (
        <CollectionPagination
          {...records.data}
          noun="registrations"
          onPage={(next) => change({ registrationsPage: next }, false)}
        />
      )}
    </>
  );
  if (!enabled) {
    return error || records.error ? (
      <Notice>{error ?? records.error}</Notice>
    ) : records.data && records.data.registrations.length > 0 ? (
      <details>
        <summary>Saved registrations ({records.data.total})</summary>
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
          ) : choices.error || configured.error ? (
            <Notice>
              {choices.error ?? configured.error}{" "}
              <button
                className="inline-button"
                onClick={() => {
                  choices.refresh();
                  configured.refresh();
                }}
              >
                Reload forms
              </button>
            </Notice>
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<FormDto>();
  const choices = useResource<FormCollection>(
    `/api/admin/events/${eventId}/forms?${new URLSearchParams({ kind: "registration", status: "active", search, page: String(page), pageSize: "10" })}`,
  );
  const selectedForm =
    picked?.id === formId ? picked : forms.find((form) => form.id === formId);
  const options = [
    ...(choices.data?.forms ?? []),
    ...(selectedForm &&
    !choices.data?.forms.some((form) => form.id === selectedForm.id)
      ? [selectedForm]
      : []),
  ];
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
        <label>
          Find a registration form
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        {choices.error && (
          <Notice>
            {choices.error}{" "}
            <button
              type="button"
              className="inline-button"
              onClick={choices.refresh}
            >
              Try again
            </button>
          </Notice>
        )}
        <div className="event-fields-grid">
          <label>
            Registration form
            <select
              value={formId}
              onChange={(e) => {
                setFormId(e.target.value);
                setPicked(options.find((form) => form.id === e.target.value));
                if (
                  !options.some(
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
              {options
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
        {choices.data && (
          <CollectionPagination
            {...choices.data}
            noun="registration forms"
            onPage={setPage}
          />
        )}
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
