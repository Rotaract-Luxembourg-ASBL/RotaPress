"use client";

import type { Block, CmsData } from "@/features/cms/cms_schemas";
import { Icon } from "@/ui/icon";
import { sectionLabel } from "./event-section-fields";
import {
  defaultEventDesign,
  eventPalettes,
  type EventDesign,
} from "../event_design";

export function EventPageLayout({
  data,
  change,
  edit,
  add,
}: {
  data: CmsData;
  change: (data: CmsData) => void;
  edit: (id: string) => void;
  add: () => void;
}) {
  const hidden = data.root.props.eventHiddenSections ?? [];
  function move(index: number, offset: number) {
    const content = [...data.content];
    [content[index], content[index + offset]] = [
      content[index + offset],
      content[index],
    ];
    change({ ...data, content });
  }
  function toggle(block: Block, visible: boolean) {
    const ids = hidden.filter((id) => id !== block.props.id);
    change({
      ...data,
      root: {
        props: {
          ...data.root.props,
          eventHiddenSections: visible ? ids : [...ids, block.props.id],
        },
      },
    });
  }
  return (
    <section className="event-page-panel">
      <header>
        <p className="eyebrow">Design</p>
        <h2>Page layout</h2>
        <p>
          Arrange your landing page. Hidden sections keep their content so you
          can bring them back later.
        </p>
      </header>
      <div className="event-layout-list">
        {data.content.map((block, index) => {
          const label = sectionLabel(block.type);
          return (
            <article
              className="event-layout-row"
              key={block.props.id}
              aria-label={`${label} section`}
            >
              <span className="event-layout-number">{index + 1}</span>
              <div className="event-layout-description">
                <strong>{label}</strong>
                <label className="event-visibility">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(block.props.id)}
                    onChange={(e) => toggle(block, e.target.checked)}
                  />
                  Show {label}
                </label>
              </div>
              <div className="event-inline-actions">
                <button
                  type="button"
                  className="button button-outline button-small"
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <Icon name="up" />
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  aria-label={`Move ${label} down`}
                  disabled={index === data.content.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Icon name="down" />
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() => edit(block.props.id)}
                >
                  Edit {label}
                </button>
                <button
                  type="button"
                  className="text-link"
                  aria-label={`Remove ${label}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove ${label} and its content from this draft? To keep the content, hide it instead.`,
                      )
                    )
                      return;
                    change({
                      ...data,
                      content: data.content.filter(
                        (item) => item.props.id !== block.props.id,
                      ),
                      root: {
                        props: {
                          ...data.root.props,
                          eventHiddenSections: hidden.filter(
                            (id) => id !== block.props.id,
                          ),
                        },
                      },
                    });
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!data.content.length && (
        <p>
          Your page is empty. Add an introduction, programme or another section
          below.
        </p>
      )}
      <button type="button" className="button button-accent" onClick={add}>
        <Icon name="plus" />
        Add section
      </button>
      <p className="field-help">
        Section visibility changes the page only. Registration availability is
        managed in Registration &amp; forms.
      </p>
    </section>
  );
}

export function EventPageAppearance({
  design,
  change,
}: {
  design: EventDesign;
  change: (next: EventDesign) => void;
}) {
  return (
    <section className="event-page-panel">
      <header>
        <p className="eyebrow">Design</p>
        <h2>Theme &amp; appearance</h2>
        <p>
          These settings belong to this event. Save a draft to keep your work,
          then publish to update the page guests see.
        </p>
      </header>
      <div className="event-palette-options">
        {Object.entries(eventPalettes).map(([key, palette]) => (
          <button
            type="button"
            className="event-palette-option"
            aria-pressed={design.palette === key}
            key={key}
            onClick={() =>
              change({
                ...design,
                palette: key as EventDesign["palette"],
                primaryColor: null,
                backgroundColor: null,
                textColor: null,
              })
            }
          >
            <span className="event-palette-swatches">
              {[palette.primary, palette.background, palette.text].map(
                (color) => (
                  <span key={color} style={{ backgroundColor: color }} />
                ),
              )}
            </span>
            <strong>{palette.label}</strong>
          </button>
        ))}
      </div>
      <div className="event-section-fields">
        <label>
          Page style
          <select
            value={design.presentation ?? "classic"}
            onChange={(e) =>
              change({
                ...design,
                presentation: e.target.value as "classic" | "reference",
              })
            }
          >
            <option value="reference">
              Rotaract event — full-width sections
            </option>
            <option value="classic">Simple — contained sections</option>
          </select>
        </label>
        <label>
          Section navigation
          <select
            value={design.navigation ? "show" : "hide"}
            onChange={(e) =>
              change({ ...design, navigation: e.target.value === "show" })
            }
          >
            <option value="show">Show links to visible sections</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label>
          Section spacing
          <select
            value={design.spacing ?? "comfortable"}
            onChange={(e) =>
              change({
                ...design,
                spacing: e.target.value as "compact" | "comfortable" | "airy",
              })
            }
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="airy">Airy</option>
          </select>
        </label>
        <label>
          Card corners
          <select
            value={design.corners ?? "rounded"}
            onChange={(e) =>
              change({
                ...design,
                corners: e.target.value as "square" | "rounded" | "soft",
              })
            }
          >
            <option value="square">Square</option>
            <option value="rounded">Rounded</option>
            <option value="soft">Soft</option>
          </select>
        </label>
        <label>
          Colour palette
          <select
            value={design.palette}
            onChange={(e) =>
              change({
                ...design,
                palette: e.target.value as EventDesign["palette"],
                primaryColor: null,
                backgroundColor: null,
                textColor: null,
              })
            }
          >
            {Object.entries(eventPalettes).map(([key, palette]) => (
              <option key={key} value={key}>
                {palette.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Font style
          <select
            value={design.font}
            onChange={(e) =>
              change({ ...design, font: e.target.value as EventDesign["font"] })
            }
          >
            <option value="modern">Modern sans serif</option>
            <option value="classic">Classic serif</option>
          </select>
        </label>
        <label>
          Content width
          <select
            value={design.width}
            onChange={(e) =>
              change({
                ...design,
                width: e.target.value as EventDesign["width"],
              })
            }
          >
            <option value="focused">Focused</option>
            <option value="wide">Wide</option>
          </select>
        </label>
        {(
          [
            ["primaryColor", "Accent colour", "primary"],
            ["backgroundColor", "Page background", "background"],
            ["textColor", "Text colour", "text"],
          ] as const
        ).map(([key, label, token]) => (
          <label key={key}>
            {label}
            <input
              type="color"
              value={design[key] ?? eventPalettes[design.palette][token]}
              onChange={(e) => change({ ...design, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button
        className="button button-outline"
        type="button"
        onClick={() => change(defaultEventDesign)}
      >
        Reset event appearance
      </button>
    </section>
  );
}
