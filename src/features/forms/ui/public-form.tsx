"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { PublicFormDto, SubmissionReceipt } from "../form_types";
import {
  ApiError,
  type CurrentUser,
  errorMessage,
  request,
  useResource,
} from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { PublicFields, visibleFields, type FormAnswers } from "./public-fields";
import { isContentElement } from "../form_elements";
import {
  appearanceAttributes,
  FormProgress,
  visibleFormPages,
} from "./form-pages";

type PublicFormProps = {
  form: PublicFormDto;
  headingLevel?: 1 | 2;
  onSubmitted?: (receipt: SubmissionReceipt) => void;
  signInReturnTo?: string;
};

type SubmittedResponse = {
  versionId: string;
  requestId: string;
  answers: FormAnswers;
};

function FormEntry({ form, headingLevel = 2, onSubmitted }: PublicFormProps) {
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [pageId, setPageId] = useState("first");
  const pages = visibleFormPages(form.definition, answers);
  const pageIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === pageId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<SubmissionReceipt>();
  const [uncertain, setUncertain] = useState(false);
  const requestId = useRef<string | null>(null);
  const originalResponse = useRef<SubmittedResponse | null>(null);
  const sending = useRef(false);
  const Heading = headingLevel === 1 ? "h1" : "h2";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uncertain && pageIndex < pages.length - 1) {
      setPageId(pages[pageIndex + 1].id);
      return;
    }
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    requestId.current ??= crypto.randomUUID();
    const response = originalResponse.current ?? {
      versionId: form.versionId,
      requestId: requestId.current,
      answers: Object.fromEntries(
        visibleFields(form.definition.fields, answers)
          .filter((field) => !isContentElement(field.type))
          .map((field) => [
            field.id,
            answers[field.id] ??
              (field.type === "multiselect"
                ? []
                : field.type === "checkbox" || field.type === "consent"
                  ? false
                  : ""),
          ]),
      ),
    };
    let accepted: SubmissionReceipt | undefined;
    try {
      accepted = await request<SubmissionReceipt>(
        form.kind === "registration"
          ? `/api/events/${form.eventId}/registration`
          : `/api/forms/${form.id}/submit`,
        {
          method: "POST",
          body: JSON.stringify(response),
        },
      );
      setReceipt(accepted);
      originalResponse.current = null;
      setUncertain(false);
    } catch (cause) {
      setError(errorMessage(cause));
      const definitelyRejected =
        cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
      // A later rejection cannot resolve an earlier ambiguous attempt. Preserve
      // its exact content and key until a receipt or deliberate edit decision.
      if (originalResponse.current || !definitelyRejected) {
        originalResponse.current = response;
        setUncertain(true);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
    if (accepted) onSubmitted?.(accepted);
  }

  function editResponse() {
    if (
      sending.current ||
      !window.confirm(
        "The earlier response may already have been received. Editing starts a new response and could create a duplicate. Continue?",
      )
    )
      return;
    originalResponse.current = null;
    requestId.current = null;
    setUncertain(false);
    setError(undefined);
  }

  return (
    <section
      className="forms-public"
      {...appearanceAttributes(form.definition)}
    >
      <Heading>{form.definition.title}</Heading>
      {form.definition.description && (
        <p className="forms-public-description">
          {form.definition.description}
        </p>
      )}
      {receipt ? (
        <div>
          <Notice kind="success">
            {receipt.message || form.definition.successMessage}
          </Notice>
          {form.kind === "membership" ? (
            <p>
              Your application is subject to human review. Sending this form
              does not grant staff access or automatically approve membership.{" "}
              <Link href="/membership" className="text-link">
                View membership status
              </Link>
            </p>
          ) : form.kind === "registration" ? (
            <Link href="/registrations" className="text-link">
              My registrations
            </Link>
          ) : (
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setReceipt(undefined);
                setAnswers({});
                setPageId("first");
                requestId.current = null;
                originalResponse.current = null;
                setUncertain(false);
              }}
            >
              Send another message
            </button>
          )}
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <p className="field-help">
            If you are signed in, this response will also appear in your private
            account history.
          </p>
          {error && (
            <Notice>
              {uncertain
                ? "We could not confirm whether your response was received. Retry the original response to check safely. "
                : "Your entered answers are still here. "}
              {error}
            </Notice>
          )}
          <FormProgress pages={pages} index={pageIndex} />
          <PublicFields
            fields={form.definition.fields}
            shownIds={pages[pageIndex].fields}
            layout={form.definition.layout}
            answers={answers}
            onChange={(id, value) => setAnswers({ ...answers, [id]: value })}
            disabled={busy || uncertain}
          />
          {form.kind === "membership" && (
            <p className="field-help">
              Applications are reviewed by the club. Submitting this form does
              not automatically approve membership.
            </p>
          )}
          <div className="forms-actions">
            {pageIndex > 0 && (
              <button
                type="button"
                className="button button-outline"
                disabled={busy || uncertain}
                onClick={() => setPageId(pages[pageIndex - 1].id)}
              >
                Back
              </button>
            )}
            <button className="button button-accent" disabled={busy}>
              {busy
                ? "Sending…"
                : uncertain
                  ? "Retry response"
                  : pageIndex < pages.length - 1
                    ? "Continue"
                    : form.definition.submitLabel}
            </button>
            {uncertain && (
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={editResponse}
              >
                Edit response
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function MembershipEntry({
  form,
  headingLevel,
  onSubmitted,
  signInReturnTo,
}: PublicFormProps) {
  const { data, error } = useResource<CurrentUser>("/api/me");
  const Heading = headingLevel === 1 ? "h1" : "h2";
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Loading />;
  if (!data.actor)
    return (
      <section className="forms-public">
        <Heading>{form.definition.title}</Heading>
        <p className="forms-public-description">
          {form.kind === "registration"
            ? "Verify your email to reserve your place. Registration does not apply for club membership."
            : "Verify your email before sending a membership application. The club reviews applications separately."}
        </p>
        <Link
          className="button button-accent"
          href={`/sign-in?next=${encodeURIComponent(signInReturnTo ?? (form.kind === "registration" ? `/events/${form.eventId}/en/registration` : `/forms/${form.id}`))}`}
        >
          {form.kind === "registration"
            ? "Sign in to register"
            : "Sign in to apply"}
        </Link>
      </section>
    );
  return (
    <FormEntry
      form={form}
      headingLevel={headingLevel}
      onSubmitted={onSubmitted}
    />
  );
}

export function PublicFormContent({
  form,
  headingLevel,
  onSubmitted,
  signInReturnTo,
}: PublicFormProps) {
  return ["membership", "registration"].includes(form.kind) ? (
    <MembershipEntry
      form={form}
      headingLevel={headingLevel}
      onSubmitted={onSubmitted}
      signInReturnTo={signInReturnTo}
    />
  ) : (
    <FormEntry
      form={form}
      headingLevel={headingLevel}
      onSubmitted={onSubmitted}
    />
  );
}

export function PublicForm({
  formId,
  headingLevel,
  onSubmitted,
}: {
  formId: string;
  headingLevel?: 1 | 2;
  onSubmitted?: (receipt: SubmissionReceipt) => void;
}) {
  const { data, error } = useResource<PublicFormDto>(`/api/forms/${formId}`);
  return error ? (
    <Notice>{error}</Notice>
  ) : data ? (
    <PublicFormContent
      key={data.versionId}
      form={data}
      headingLevel={headingLevel}
      onSubmitted={onSubmitted}
    />
  ) : (
    <Loading />
  );
}
