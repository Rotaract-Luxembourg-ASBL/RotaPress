"use client";
import { useState } from "react";
import type { FormDefinition, FormField } from "../form_schemas";
import { fieldTypes } from "../form_schemas";
import { isContentElement, MAX_FORM_ELEMENTS } from "../form_elements";
import { FieldEditor, fieldLabels } from "./field-editor";
import { FormDetails } from "./form-edit-panels";
import { PublicFields } from "./public-fields";
import { appearanceAttributes } from "./form-pages";
import { Icon } from "@/ui/icon";
import { Dialog } from "@/ui/dialog";

const groups = [
  {
    title: "Contact & text",
    types: ["text", "textarea", "email", "phone", "url"],
  },
  {
    title: "Choices & numbers",
    types: ["choice", "radio", "multiselect", "checkbox", "rating", "number"],
  },
  { title: "Date & consent", types: ["date", "time", "consent"] },
  { title: "Structure", types: ["heading", "page_break"] },
];
const hints: Record<FormField["type"], string> = {
  text: "A short answer",
  textarea: "A longer message",
  email: "A valid email address",
  phone: "Contact telephone number",
  url: "A website or portfolio link",
  choice: "Choose from a dropdown",
  radio: "Choose one visible option",
  multiselect: "Choose several options",
  checkbox: "One yes/no checkbox",
  rating: "A score from 1 to 5 or 10",
  number: "A number with optional limits",
  date: "Pick a calendar date",
  time: "Choose a time of day",
  consent: "Agree to your exact wording",
  heading: "Introduce a section with text",
  page_break: "Start the next step of your form",
};

export function FormBuildPanel({
  draft,
  disabled,
  selected,
  onSelect,
  onChange,
  onUpdate,
  onMove,
  onRemove,
  onDuplicate,
  onAdd,
}: {
  draft: FormDefinition;
  disabled: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (draft: FormDefinition) => void;
  onUpdate: (index: number, field: FormField) => void;
  onMove: (index: number, target: number) => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
  onAdd: (type: FormField["type"], at: number) => void;
}) {
  const [inserting, setInserting] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const index = draft.fields.findIndex((field) => field.id === selected);
  const field = draft.fields[index];
  function addAt(position: number) {
    setSearch("");
    setInserting(position);
  }
  function select(id: string | null) {
    onSelect(id);
    if (window.innerWidth < 1100)
      requestAnimationFrame(() =>
        document
          .getElementById("form-inspector")
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  }
  return (
    <div className="form-studio">
      <section className="form-canvas-workspace" aria-label="Form canvas">
        <div className="form-canvas-toolbar">
          <div>
            <strong>Your form</strong>
            <span>
              {
                draft.fields.filter((item) => !isContentElement(item.type))
                  .length
              }{" "}
              questions ·{" "}
              {1 +
                draft.fields.filter((item) => item.type === "page_break")
                  .length}{" "}
              {draft.fields.some((field) => field.type === "page_break")
                ? "pages"
                : "page"}
            </span>
          </div>
          <button
            type="button"
            className="button button-outline"
            disabled={disabled || draft.fields.length >= MAX_FORM_ELEMENTS}
            onClick={() => addAt(draft.fields.length)}
          >
            <Icon name="plus" />
            Add element
          </button>
        </div>
        <p className="field-help">
          Select a question to edit it. Drag its handle to reorder, or use Move
          up and Move down in the editor.
        </p>
        <div
          className="form-canvas-sheet forms-public"
          {...appearanceAttributes(draft)}
        >
          <button
            className="form-canvas-intro"
            aria-label="Edit form details"
            aria-pressed={!field}
            onClick={() => select(null)}
          >
            <h2>{draft.title || "Untitled form"}</h2>
            <p>
              {draft.description || "Add an introduction for your visitors"}
            </p>
            <span>
              Edit title and introduction <Icon name="edit" />
            </span>
          </button>
          <ol
            className="form-canvas-elements"
            data-layout={draft.layout ?? "stacked"}
          >
            {draft.fields.map((item, position) => (
              <li
                key={item.id}
                className="form-canvas-element"
                data-selected={selected === item.id}
                data-drop-position={
                  dropTarget === position &&
                  dragged !== null &&
                  dragged !== position
                    ? dragged > position
                      ? "before"
                      : "after"
                    : undefined
                }
                data-wide={
                  item.width === "full" ||
                  isContentElement(item.type) ||
                  (item.width !== "half" &&
                    ["textarea", "radio", "multiselect", "rating"].includes(
                      item.type,
                    ))
                }
                data-half={item.width === "half"}
                onDragOver={(event) => {
                  if (dragged !== null) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTarget(position);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged !== null && !disabled) onMove(dragged, position);
                  setDragged(null);
                  setDropTarget(null);
                }}
              >
                <div className="form-canvas-element-bar">
                  <button
                    className="form-drag-handle"
                    type="button"
                    draggable={!disabled}
                    disabled={disabled}
                    aria-label={`Drag ${item.label} to reorder`}
                    onDragStart={(event) => {
                      setDragged(position);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                    onClick={() => select(item.id)}
                  >
                    <Icon name="more" />
                  </button>
                  <button
                    className="form-canvas-select"
                    type="button"
                    aria-label={`Edit question ${position + 1}: ${item.label}`}
                    onClick={() => select(item.id)}
                  >
                    <span>{fieldLabels[item.type]}</span>
                    {(item.condition ||
                      item.visibility ||
                      item.requiredWhen) && (
                      <span className="forms-badge">Rules</span>
                    )}
                    <Icon name="edit" />
                  </button>
                </div>
                <div
                  className="form-canvas-field"
                  onClick={() => select(item.id)}
                >
                  {item.type === "page_break" ? (
                    <div className="form-canvas-break">
                      <Icon name="outline" />
                      <strong>{item.label}</strong>
                      <span>Next page</span>
                    </div>
                  ) : (
                    <div inert>
                      <PublicFields
                        fields={[
                          {
                            ...item,
                            condition: null,
                            visibility: undefined,
                            requiredWhen: undefined,
                          },
                        ]}
                        answers={{}}
                        onChange={() => {}}
                        disabled
                      />
                    </div>
                  )}
                </div>
                <button
                  className="form-insert-here"
                  type="button"
                  aria-label={`Insert after ${item.label}`}
                  disabled={
                    disabled || draft.fields.length >= MAX_FORM_ELEMENTS
                  }
                  onClick={() => addAt(position + 1)}
                >
                  <Icon name="plus" />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="button button-accent" disabled>
            {draft.submitLabel}
          </button>
        </div>
        <div className="forms-actions">
          <button
            className="button button-outline"
            disabled={disabled || draft.fields.length >= MAX_FORM_ELEMENTS}
            onClick={() => addAt(draft.fields.length)}
          >
            <Icon name="plus" />
            Add element
          </button>
          <span className="field-help">
            {draft.fields.length}/{MAX_FORM_ELEMENTS} elements · Up to 10 pages
          </span>
        </div>
      </section>
      <aside
        className="panel form-inspector"
        id="form-inspector"
        aria-label={field ? "Question editor" : "Form details editor"}
      >
        {field ? (
          <FieldEditor
            key={field.id}
            field={field}
            earlier={draft.fields.slice(0, index)}
            index={index}
            count={draft.fields.length}
            disabled={disabled}
            onChange={(next) => onUpdate(index, next)}
            onMove={(direction) => onMove(index, index + direction)}
            onRemove={() => onRemove(index)}
            onDuplicate={() => onDuplicate(index)}
          />
        ) : (
          <fieldset className="forms-fieldset" disabled={disabled}>
            <FormDetails draft={draft} onChange={onChange} />
          </fieldset>
        )}
      </aside>
      {inserting !== null && (
        <Dialog title="Add an element" onClose={() => setInserting(null)}>
          <div className="form-element-picker">
            <p>Choose a question or add structure to your form.</p>
            <input
              type="search"
              aria-label="Find an element"
              placeholder="Search questions and layout…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {groups.map((group) => {
              const types = fieldTypes.filter(
                (type) =>
                  group.types.includes(type) &&
                  `${fieldLabels[type]} ${hints[type]}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              );
              return types.length ? (
                <section key={group.title}>
                  <h3>{group.title}</h3>
                  <div>
                    {types.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          onAdd(type, inserting);
                          setInserting(null);
                        }}
                      >
                        <strong>{fieldLabels[type]}</strong>
                        <span>{hints[type]}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null;
            })}
            {!fieldTypes.some((type) =>
              `${fieldLabels[type]} ${hints[type]}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p>No matching elements. Try “choice” or “page”.</p>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
