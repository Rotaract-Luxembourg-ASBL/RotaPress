"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  formDefinitionSchema,
  type FormDefinition,
  type FormField,
} from "../form_schemas";
import type { FormDto } from "../form_types";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { fieldLabels } from "./field-editor";
import { Icon } from "@/ui/icon";
import { DraftPreview, FormSharePanel } from "./form-edit-panels";
import { FormBuildPanel } from "./form-canvas";
import { FormDesignPanel } from "./form-design-panel";
import { hasOptions, MAX_FORM_ELEMENTS } from "../form_elements";
import { FormSettingsPanel } from "./form-settings";
import { ScopedEmailTemplates } from "@/integrations/email/ui/scoped-email-templates";
import { FormArchiveAction, formArchiveMessage } from "./form-archive-action";
import { ruleSources } from "../form_logic";

function Builder({
  initial,
  reload,
}: {
  initial: FormDto;
  reload: () => void;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  const [past, setPast] = useState<FormDefinition[]>([]);
  const [future, setFuture] = useState<FormDefinition[]>([]);
  const [tab, setTab] = useState("build");
  const [emailDirty, setEmailDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  const canEdit = saved.event ? saved.event.canEdit : true;
  const canPublish = saved.event ? saved.event.canPublish : true;
  const disabled = busy || saved.archived || !canEdit;

  useEffect(() => {
    if (!dirty && !emailDirty) return;
    function preventLoss(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function followLink(event: MouseEvent) {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        link &&
        link.getAttribute("target") !== "_blank" &&
        !window.confirm("Leave this form and discard unsaved changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", preventLoss);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", preventLoss);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty, emailDirty]);

  function change(next: FormDefinition) {
    setPast((items) => [...items.slice(-39), draft]);
    setFuture([]);
    setDraft(next);
    setMessage(undefined);
  }

  async function operate(operation: "save" | "publish") {
    setError(undefined);
    setMessage(undefined);
    if (operation === "save" || dirty) {
      const result = formDefinitionSchema.safeParse(draft);
      if (!result.success) {
        setError(
          result.error.issues
            .map((issue) => {
              const index =
                issue.path[0] === "fields" && typeof issue.path[1] === "number"
                  ? issue.path[1] + 1
                  : null;
              return `${index ? `Field ${index}: ` : ""}${issue.message}`;
            })
            .join(" "),
        );
        return;
      }
    }
    setBusy(true);
    try {
      let base = saved;
      if (operation === "publish" && dirty) {
        base = await request<FormDto>(`/api/admin/forms/${saved.id}/save`, {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: saved.draftRevision,
            definition: draft,
          }),
        });
        setSaved(base);
        setDraft(base.draft);
      }
      const next = await request<FormDto>(
        `/api/admin/forms/${saved.id}/${operation}`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: base.draftRevision,
            ...(operation === "save" ? { definition: draft } : {}),
          }),
        },
      );
      setSaved(next);
      setDraft(next.draft);
      setPast([]);
      setFuture([]);
      setMessage(
        operation === "save"
          ? "Draft saved. Publish when it is ready for visitors."
          : "Form published. Visitors now see your latest saved version.",
      );
    } catch (cause) {
      setError(`${errorMessage(cause)} Your entered changes are still here.`);
    } finally {
      setBusy(false);
    }
  }

  function updateField(index: number, field: FormField) {
    const dependents = draft.fields.filter(
      (candidate) => candidate.condition?.fieldId === field.id,
    );
    if (
      dependents.some(
        (candidate) =>
          ["checkbox", "consent"].includes(field.type) !==
            (typeof candidate.condition!.equals === "boolean") ||
          (field.type === "choice" &&
            !field.options.includes(String(candidate.condition!.equals))),
      )
    ) {
      setError(
        "A follow-up question uses this answer. Update its visibility condition before changing this field's type or removing that choice.",
      );
      return;
    }
    setError(undefined);
    change({
      ...draft,
      fields: draft.fields.map((current, position) =>
        position === index ? field : current,
      ),
    });
  }

  function duplicateField(index: number) {
    if (draft.fields.length >= MAX_FORM_ELEMENTS) return;
    const fields = [...draft.fields];
    fields.splice(index + 1, 0, {
      ...fields[index],
      id: `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      label: `${fields[index].label.slice(0, 193)} (copy)`,
    });
    change({ ...draft, fields });
    setSelected(fields[index + 1].id);
  }

  function moveField(index: number, target: number) {
    if (index === target || target < 0 || target >= draft.fields.length) return;
    const fields = [...draft.fields];
    const [moved] = fields.splice(index, 1);
    fields.splice(target, 0, moved);
    const positions = new Map(
      fields.map((field, position) => [field.id, position]),
    );
    if (
      fields.some((field, position) =>
        ruleSources(field).some(
          (id) => (positions.get(id) ?? position) >= position,
        ),
      )
    ) {
      setError(
        "A conditional field must stay after the field it depends on. Change its condition before moving it here.",
      );
      return;
    }
    setError(undefined);
    change({ ...draft, fields });
  }

  function removeField(index: number) {
    if (
      draft.fields.some((field) =>
        ruleSources(field).includes(draft.fields[index].id),
      )
    ) {
      setError(
        "Another field depends on this answer. Remove that condition before removing this field.",
      );
      return;
    }
    change({
      ...draft,
      fields: draft.fields.filter((_, position) => position !== index),
    });
    setSelected(
      draft.fields[index - 1]?.id ?? draft.fields[index + 1]?.id ?? null,
    );
  }

  function addField(newType: FormField["type"], at: number) {
    if (draft.fields.length >= MAX_FORM_ELEMENTS) return;
    const id = `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    setSelected(id);
    change({
      ...draft,
      fields: [
        ...draft.fields.slice(0, at),
        {
          id,
          type: newType,
          label: fieldLabels[newType],
          description: "",
          required: false,
          options: hasOptions(newType) ? ["First option", "Second option"] : [],
          condition: null,
        },
        ...draft.fields.slice(at),
      ],
    });
  }

  const canRead = saved.event
    ? saved.event.canReadSubmissions
    : user.capabilities.includes("submissions.read");
  const canSettings = saved.event
    ? saved.event.canPublish
    : user.capabilities.includes("forms.settings");
  const tabs = [
    ["build", "Build"],
    ["design", "Design"],
    ["preview", "Preview"],
    ...(canSettings ? [["settings", "Settings"]] : []),
    ...(canSettings ? [["emails", "Emails"]] : []),
    ["share", "Share"],
  ];
  return (
    <div className="form-editor">
      <Link
        className="form-back-link"
        href={
          saved.event
            ? `/admin/events/${saved.event.id}?tab=participation`
            : "/admin/forms"
        }
      >
        <Icon name="back" />
        {saved.event ? "Back to event" : "All forms"}
      </Link>
      <PageHeading
        title={draft.title || "Untitled form"}
        description={
          saved.event
            ? `Event form · ${saved.event.title}`
            : saved.kind === "membership"
              ? "Membership application"
              : "Website form"
        }
      >
        {tab !== "emails" && (
          <div className="forms-actions">
            <button
              className="button button-outline"
              disabled={disabled || !past.length}
              onClick={() => {
                setFuture([draft, ...future]);
                setDraft(past[past.length - 1]);
                setPast(past.slice(0, -1));
                setMessage(undefined);
              }}
            >
              Undo
            </button>
            <button
              className="button button-outline"
              disabled={disabled || !future.length}
              onClick={() => {
                setPast([...past, draft]);
                setDraft(future[0]);
                setFuture(future.slice(1));
                setMessage(undefined);
              }}
            >
              Redo
            </button>
            {!saved.archived && (
              <>
                <button
                  className="button button-outline"
                  disabled={disabled || !dirty}
                  onClick={() => operate("save")}
                >
                  Save draft
                </button>
                <button
                  className="button button-accent"
                  disabled={
                    disabled ||
                    !canPublish ||
                    (!dirty &&
                      saved.publishedVersionNumber === saved.draftRevision)
                  }
                  onClick={() => operate("publish")}
                >
                  {busy ? "Working…" : "Publish form"}
                </button>
              </>
            )}
            <FormArchiveAction
              form={saved}
              onDeleted={() =>
                router.replace(
                  saved.event
                    ? `/admin/events/${saved.event.id}?tab=participation`
                    : "/admin/forms",
                )
              }
              disabled={busy || dirty || !canPublish}
              onChanged={(next) => {
                setSaved(next);
                setDraft(next.draft);
                setMessage(formArchiveMessage(next));
              }}
            />
          </div>
        )}
      </PageHeading>
      {tab !== "emails" && (
        <div className="form-editor-status" aria-live="polite">
          <span
            className="form-status"
            data-status={
              saved.archived
                ? "archived"
                : saved.publishedVersionId
                  ? "published"
                  : "draft"
            }
          >
            {saved.archived
              ? "Archived · read only"
              : saved.publishedVersionNumber === saved.draftRevision
                ? "Up to date. Visitors see this version."
                : saved.publishedVersionId
                  ? "Published"
                  : "Private draft"}
          </span>
          <span>
            {dirty
              ? "Unsaved changes. Save privately or publish to update the public form."
              : saved.publishedVersionNumber === saved.draftRevision
                ? "All changes saved and published."
                : saved.publishedVersionId
                  ? "Draft saved. Publish to update what visitors see."
                  : "Draft saved. Publish when you are ready."}
          </span>
          {!canPublish && (
            <span>Your event manager can publish this form.</span>
          )}
        </div>
      )}
      <div className="form-editor-navigation">
        <div
          className="form-editor-tabs"
          role="tablist"
          aria-label="Form editor"
          onKeyDown={(event) => {
            const index = tabs.findIndex(([value]) => value === tab);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            setTab(tabs[next][0]);
            document.getElementById(`form-tab-${tabs[next][0]}`)?.focus();
          }}
        >
          {tabs.map(([value, label]) => (
            <button
              type="button"
              role="tab"
              key={value}
              id={`form-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`form-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {canRead && (
          <Link className="text-link" href={`/admin/inbox?formId=${saved.id}`}>
            <Icon name="mail" />
            View responses
          </Link>
        )}
      </div>
      {error && (
        <Notice>
          {error}{" "}
          <button
            className="inline-button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Replace your entered changes with the latest saved draft?",
                )
              )
                reload();
            }}
          >
            Reload saved version
          </button>
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      <div
        id="form-panel-build"
        role="tabpanel"
        aria-labelledby="form-tab-build"
        hidden={tab !== "build"}
      >
        <FormBuildPanel
          draft={draft}
          disabled={disabled}
          selected={selected}
          onSelect={setSelected}
          onChange={change}
          onUpdate={updateField}
          onMove={moveField}
          onRemove={removeField}
          onDuplicate={duplicateField}
          onAdd={addField}
        />
      </div>
      <div
        id="form-panel-preview"
        role="tabpanel"
        aria-labelledby="form-tab-preview"
        hidden={tab !== "preview"}
      >
        <DraftPreview definition={draft} />
      </div>
      <div
        id="form-panel-design"
        role="tabpanel"
        aria-labelledby="form-tab-design"
        hidden={tab !== "design"}
      >
        <FormDesignPanel draft={draft} disabled={disabled} onChange={change} />
      </div>
      {canSettings && (
        <div
          id="form-panel-emails"
          role="tabpanel"
          aria-labelledby="form-tab-emails"
          hidden={tab !== "emails"}
        >
          <ScopedEmailTemplates
            key={saved.id}
            target={{ kind: "form", id: saved.id }}
            onDirtyChange={setEmailDirty}
          />
        </div>
      )}
      {canSettings && (
        <div
          id="form-panel-settings"
          role="tabpanel"
          aria-labelledby="form-tab-settings"
          hidden={tab !== "settings"}
        >
          <div className="form-settings-layout">
            <FormSettingsPanel
              formId={saved.id}
              archived={saved.archived}
              registration={saved.kind === "registration"}
              canReview={saved.event?.canReadSubmissions}
            />
          </div>
        </div>
      )}
      <div
        id="form-panel-share"
        role="tabpanel"
        aria-labelledby="form-tab-share"
        hidden={tab !== "share"}
      >
        <FormSharePanel
          form={saved}
          dirty={dirty}
          busy={busy}
          canPlace={user.capabilities.includes("cms.edit")}
        />
      </div>
    </div>
  );
}

export function FormBuilder({ formId }: { formId: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <LoadedBuilder
      key={reloadKey}
      formId={formId}
      reload={() => setReloadKey((value) => value + 1)}
    />
  );
}

function LoadedBuilder({
  formId,
  reload,
}: {
  formId: string;
  reload: () => void;
}) {
  const { data, error } = useResource<FormDto>(`/api/admin/forms/${formId}`);
  return error ? (
    <Notice>{error}</Notice>
  ) : data ? (
    <Builder initial={data} reload={reload} />
  ) : (
    <Loading />
  );
}
