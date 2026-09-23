"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, request, useResource } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import {
  createEventSchema,
  eventFieldsSchema,
  type EventFields as Fields,
  type EventSummary,
  type ManagerOption,
} from "../event_schemas";
import {
  eventPresets,
  type EventTemplateReview,
  type EventTemplateSelection,
} from "../event_templates";
import type { EventModuleKey } from "../event_modules";
import { EventFields } from "./event-fields";
import { EventFeaturePicker } from "./event-feature-picker";
import { EventTemplateReviewPanel } from "./event-template-review";

const steps = ["Basics", "Schedule & location", "Setup & features", "Review"];
const basicsSchema = eventFieldsSchema.pick({
  title: true,
  description: true,
  visibility: true,
});

export function EventCreateDialog({
  onClose,
  sources,
}: {
  onClose: () => void;
  sources: EventSummary[];
}) {
  const router = useRouter();
  const { data, error } = useResource<{ managers: ManagerOption[] }>(
    "/api/admin/events/managers",
  );
  const [value, setValue] = useState<Fields>({
    title: "",
    description: "",
    startsAt: "",
    endsAt: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    venue: "",
    visibility: "private",
  });
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState("custom");
  const [selectedModules, setSelectedModules] = useState<EventModuleKey[]>([
    "website",
  ]);
  const [manager, setManager] = useState("");
  const [review, setReview] = useState<{
    preview: EventTemplateReview;
    input: {
      event: Fields & { managerUserId: string };
      template: EventTemplateSelection;
    };
    requestId: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const managerUserId =
    manager || data?.managers.find((person) => person.isCurrent)?.userId || "";
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function back(target: number) {
    setReview(undefined);
    setProblem(undefined);
    setStep(target);
  }
  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(undefined);
    if (step === 0) {
      const result = basicsSchema.safeParse({
        title: value.title,
        description: value.description,
        visibility: value.visibility,
      });
      if (!result.success) {
        setProblem(
          result.error.issues[0]?.message ?? "Check the event details.",
        );
        return;
      }
      if (!managerUserId) {
        setProblem("Choose a responsible manager before continuing.");
        return;
      }
      setStep(1);
      return;
    }
    const result = createEventSchema.safeParse({ ...value, managerUserId });
    if (!result.success) {
      setProblem(
        result.error.issues[0]?.message ?? "Check the event schedule.",
      );
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    setBusy(true);
    try {
      const selection: EventTemplateSelection = template.startsWith("copy:")
        ? { kind: "copy", id: template.slice(5) }
        : {
            kind: "preset",
            id:
              template === "custom"
                ? "simple"
                : (template as "simple" | "networking" | "fundraiser"),
            selectedModules,
          };
      const input = { event: result.data, template: selection };
      const preview = await request<EventTemplateReview>(
        "/api/admin/events/template-preview",
        { method: "POST", body: JSON.stringify(input) },
      );
      setReview({ preview, input, requestId: crypto.randomUUID() });
      setStep(3);
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const draft = await request<EventSummary>(
        "/api/admin/events/from-template",
        {
          method: "POST",
          body: JSON.stringify({
            ...review.input,
            requestId: review.requestId,
            reviewToken: review.preview.token,
            confirmed: true,
          }),
        },
      );
      router.push(`/admin/events/${draft.id}`);
    } catch (cause) {
      setProblem(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="New event draft"
      onClose={onClose}
      canClose={() =>
        !busy && (!dirty || window.confirm("Discard this unsaved event?"))
      }
    >
      <div className="event-create-flow" aria-busy={busy}>
        <nav aria-label="Event creation steps">
          <ol className="event-create-steps">
            {steps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={step === index ? "step" : undefined}
                  disabled={busy || index > step || !data}
                  onClick={() => index < step && back(index)}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {error && <Notice>{error}</Notice>}
        {!data && !error && <Loading />}
        {data && (
          <section className="event-create-stage" aria-labelledby={headingId}>
            <div className="event-create-stage-heading">
              <p className="field-help">
                Step {step + 1} of {steps.length}
              </p>
              <h3 ref={heading} id={headingId} tabIndex={-1}>
                {steps[step]}
              </h3>
            </div>
            {problem && <Notice>{problem}</Notice>}
            {step === 3 && review ? (
              <>
                <dl className="event-create-summary">
                  <div>
                    <dt>Event</dt>
                    <dd>{review.input.event.title}</dd>
                  </div>
                  <div>
                    <dt>Responsible manager</dt>
                    <dd>
                      {
                        data.managers.find(
                          (person) => person.userId === managerUserId,
                        )?.name
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Starts</dt>
                    <dd>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: review.input.event.timezone,
                      }).format(new Date(review.input.event.startsAt))}{" "}
                      · {review.input.event.timezone}
                    </dd>
                  </div>
                  {review.input.event.endsAt && (
                    <div>
                      <dt>Ends</dt>
                      <dd>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: review.input.event.timezone,
                        }).format(new Date(review.input.event.endsAt))}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Venue</dt>
                    <dd>{review.input.event.venue || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Visibility when published</dt>
                    <dd>
                      {review.input.event.visibility}. This draft stays private.
                    </dd>
                  </div>
                </dl>
                <EventTemplateReviewPanel
                  review={review.preview}
                  busy={busy}
                  onBack={() => back(2)}
                  onConfirm={() => void confirm()}
                />
              </>
            ) : (
              <form
                className="form-stack"
                onSubmit={next}
                onChange={() => {
                  setDirty(true);
                  setProblem(undefined);
                }}
              >
                <fieldset className="form-stack event-fieldset" disabled={busy}>
                  {step < 2 && (
                    <EventFields
                      value={value}
                      onChange={setValue}
                      section={step === 0 ? "basics" : "schedule"}
                    />
                  )}
                  {step === 0 && (
                    <>
                      <label>
                        Responsible manager
                        <select
                          required
                          value={managerUserId}
                          onChange={(event) => setManager(event.target.value)}
                        >
                          <option value="" disabled>
                            Choose a manager
                          </option>
                          {data.managers.map((person) => (
                            <option key={person.userId} value={person.userId}>
                              {person.name}
                              {person.isCurrent ? " (You)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="field-help">
                        Only a currently approved member can manage an event.
                        This assignment grants access to this event alone.
                      </p>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <label>
                        Starting setup
                        <select
                          value={template}
                          onChange={(event) => {
                            const choice = event.target.value;
                            setTemplate(choice);
                            if (choice === "custom")
                              setSelectedModules(["website"]);
                            else if (choice in eventPresets)
                              setSelectedModules([
                                ...eventPresets[
                                  choice as keyof typeof eventPresets
                                ].features,
                              ]);
                          }}
                        >
                          <option value="custom">Choose features</option>
                          {Object.entries(eventPresets).map(([id, preset]) => (
                            <option key={id} value={id}>
                              {preset.label}
                            </option>
                          ))}
                          {sources.length > 0 && (
                            <optgroup label="Copy an existing event">
                              {sources.map((source) => (
                                <option
                                  key={source.id}
                                  value={`copy:${source.id}`}
                                >
                                  {source.title}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </label>
                      {template.startsWith("copy:") ? (
                        <p className="field-help">
                          The copy keeps the source event's features and content
                          as private drafts. You will review what is included
                          before creating it.
                        </p>
                      ) : (
                        <EventFeaturePicker
                          selected={selectedModules}
                          onChange={setSelectedModules}
                        />
                      )}
                    </>
                  )}
                </fieldset>
                <div className="form-actions event-create-actions">
                  {step > 0 && (
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => back(step - 1)}
                    >
                      Back
                    </button>
                  )}
                  <button className="button button-accent" disabled={busy}>
                    {busy
                      ? "Preparing review…"
                      : step === 2
                        ? "Review event setup"
                        : "Next"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
