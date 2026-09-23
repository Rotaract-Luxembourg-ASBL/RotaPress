"use client";

import { AutoField, type Field } from "@puckeditor/core";
import "@puckeditor/core/no-external.css";
import { puckConfig } from "@/features/cms/ui/puck-config";
import type { Block } from "@/features/cms/cms_schemas";
import { blockDesignSchema, designOptions } from "@/features/cms/block_design";
import { EventRegistrationPreview } from "@/features/cms/ui/event-registration-block";
import { EventPackagesPreview } from "@/features/cms/ui/event-packages-block";
import { EventPrizesPreview } from "@/features/cms/ui/event-prizes-block";
import { EventWinnersPreview } from "@/features/cms/ui/event-winners-block";
import { FormEditorPreview } from "@/features/cms/ui/form-block";
import { PartnerPicker } from "@/features/cms/ui/directory-block";
import { EventRichTextField } from "./event-rich-text-field";

export function sectionLabel(type: Block["type"]) {
  if (type === "PageIntro") return "Introduction";
  if (type === "EventHero") return "Event introduction";
  if (type === "Programme") return "Programme";
  if (type === "FAQ") return "FAQ";
  if (type === "ParticipationOptions") return "Offer descriptions";
  return puckConfig.components[type].label || type;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Reuse the registered block fields and defaults, with an event form layout. */
function Fields({
  fields,
  values,
  onChange,
  path,
}: {
  fields: Record<string, Field<unknown>>;
  values: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  path: string;
}) {
  return (
    <div className="event-section-fields">
      {Object.entries(fields).map(([key, field]) => {
        if (
          key === "version" ||
          key === "id" ||
          key === "design" ||
          field.visible === false
        )
          return null;
        const label = field.label || key.charAt(0).toUpperCase() + key.slice(1);
        const name = `${path}.${key}`;
        const value = values[key];
        const change = (next: unknown) => {
          if (Object.is(next, value)) return;
          onChange({ ...values, [key]: next });
        };
        if (field.type === "array") {
          const items: unknown[] = Array.isArray(value) ? value : [];
          const replace = (index: number, item: unknown) =>
            change(items.map((old, i) => (i === index ? item : old)));
          return (
            <section className="event-repeaters" key={key} aria-label={label}>
              <h3>{label}</h3>
              {items.map((item, index) => (
                <fieldset className="event-repeater" key={index}>
                  <legend>
                    {label} {index + 1}
                  </legend>
                  <Fields
                    fields={field.arrayFields as Record<string, Field<unknown>>}
                    values={objectValue(item)}
                    path={`${name}.${index}`}
                    onChange={(next) => replace(index, next)}
                  />
                  <div className="event-inline-actions">
                    <button
                      type="button"
                      className="button button-outline button-small"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...items];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        change(next);
                      }}
                    >
                      Move item up
                    </button>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      disabled={index === items.length - 1}
                      onClick={() => {
                        const next = [...items];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        change(next);
                      }}
                    >
                      Move item down
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        if (window.confirm(`Remove this item from ${label}?`))
                          change(items.filter((_, i) => i !== index));
                      }}
                    >
                      Remove item
                    </button>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                className="button button-outline"
                disabled={items.length >= (field.max ?? 120)}
                onClick={() =>
                  change([
                    ...items,
                    structuredClone(field.defaultItemProps ?? {}),
                  ])
                }
              >
                Add item
              </button>
            </section>
          );
        }
        if (field.type === "object")
          return (
            <fieldset key={key}>
              <legend>{label}</legend>
              <Fields
                fields={field.objectFields as Record<string, Field<unknown>>}
                values={objectValue(value)}
                onChange={change}
                path={name}
              />
            </fieldset>
          );
        if (field.type === "richtext")
          return (
            <EventRichTextField
              key={key}
              field={field}
              value={String(value ?? "")}
              onChange={change}
            />
          );
        if (field.type === "custom")
          return (
            <div className="event-custom-field" key={key}>
              <AutoField<unknown>
                field={field}
                value={value}
                onChange={change}
                id={name}
              />
            </div>
          );
        if (field.type === "select" || field.type === "radio")
          return (
            <label key={key}>
              {label}
              <select
                value={String(value ?? "")}
                onChange={(e) => {
                  const selected = field.options.find(
                    (option) => String(option.value) === e.target.value,
                  );
                  change(selected?.value ?? e.target.value);
                }}
              >
                {field.options.map((option) => (
                  <option
                    key={String(option.value)}
                    value={String(option.value)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        if (field.type === "textarea")
          return (
            <label key={key}>
              {label}
              <textarea
                rows={4}
                value={String(value ?? "")}
                onChange={(e) => change(e.target.value)}
              />
            </label>
          );
        if (field.type === "text" || field.type === "number")
          return (
            <label key={key}>
              {label}
              <input
                type={field.type === "number" ? "number" : "text"}
                value={typeof value === "number" ? value : String(value ?? "")}
                min={field.type === "number" ? field.min : undefined}
                max={field.type === "number" ? field.max : undefined}
                step={field.type === "number" ? field.step : undefined}
                onChange={(e) =>
                  change(
                    field.type === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            </label>
          );
        return null;
      })}
    </div>
  );
}

export function EventSectionFields({
  block,
  onChange,
  sectionLinks = [],
}: {
  block: Block;
  onChange: (block: Block) => void;
  sectionLinks?: { label: string; href: string }[];
}) {
  const config = puckConfig.components[block.type];
  const fields = { ...config.fields } as Record<string, Field<unknown>>;
  if (block.type === "PartnerCollection") {
    // Match the central directory block's conditional controls in this editor too.
    if (block.props.selectionMode === "category") delete fields.partnerIds;
    else {
      delete fields.category;
      const profiles = block.props;
      fields.partnerIds = {
        type: "custom",
        label: "Selected profiles",
        render: ({ onChange, readOnly }) => (
          <PartnerPicker
            value={profiles.partnerIds}
            onChange={onChange}
            disabled={readOnly}
            initialCategory={profiles.category ?? "all"}
          />
        ),
      };
    }
  }
  if (block.type === "EventHero") {
    fields.buttonHref = {
      type: "select",
      label: "Button destination",
      options: [
        { label: "Choose a section (button stays hidden)", value: "" },
        ...sectionLinks.map((item) => ({
          label: item.label,
          value: item.href,
        })),
        ...(block.props.buttonHref &&
        !sectionLinks.some((item) => item.href === block.props.buttonHref)
          ? [{ label: "Current saved link", value: block.props.buttonHref }]
          : []),
      ],
    };
  }
  return (
    <>
      <Fields
        fields={fields}
        values={block.props}
        path={block.props.id}
        onChange={(props) => {
          // The registry controls each property's input; the CMS boundary validates the complete draft.
          onChange({ ...block, props } as Block);
        }}
      />
      {block.type === "Form" && (
        <FormEditorPreview formId={block.props.formId} />
      )}
      {block.type === "EventRegistration" && <EventRegistrationPreview />}
      {block.type === "EventPackages" && (
        <EventPackagesPreview title={block.props.title} />
      )}
      {block.type === "EventPrizes" && (
        <EventPrizesPreview title={block.props.title} />
      )}
      {block.type === "EventWinners" && (
        <EventWinnersPreview title={block.props.title} />
      )}
      <details className="event-section-appearance">
        <summary>Section appearance</summary>
        <div className="event-section-fields">
          {Object.entries(designOptions).map(([key, setting]) => (
            <label key={key}>
              {setting.label}
              <select
                value={
                  block.props.design?.[
                    key as keyof typeof block.props.design
                  ] ?? ""
                }
                onChange={(e) => {
                  const design = { ...block.props.design };
                  delete design[key as keyof typeof design];
                  onChange({
                    ...block,
                    props: {
                      ...block.props,
                      design: blockDesignSchema.parse(
                        e.target.value
                          ? { ...design, [key]: e.target.value }
                          : design,
                      ),
                    },
                  } as Block);
                }}
              >
                <option value="">Event default</option>
                {Object.entries(setting.choices).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
    </>
  );
}
