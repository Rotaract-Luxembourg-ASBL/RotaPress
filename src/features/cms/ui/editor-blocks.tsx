"use client";

import { createUsePuck, type Content } from "@puckeditor/core";
import { useState } from "react";
import { puckConfig, type PuckBlocks } from "./puck-config";
import { Icon as EditorIcon } from "@/ui/icon";
import { isSitePart, sitePartBlockTypes, type CmsKind } from "../cms_schemas";
import { useCurrentUser } from "@/ui/admin-shell";
import { PatternPicker } from "../kits/ui/pattern-picker";
import { eventOnlyBlockTypes } from "../../events/event_content";

export const useEditorPuck = createUsePuck<typeof puckConfig>();
const rootZone = "root:default-zone";
const blockDescriptions: Record<string, string> = {
  Calendar:
    "Merge selected calendars, recurring activities and published events",
  PageIntro: "Introduce a page with a heading and a short welcome",
  PageCollection: "Keep project and story cards linked to published pages",
  Columns: "Arrange two groups of blocks side by side",
  EventPrizes: "Display the event's separately published prize gallery",
  EventWinners: "Display only reviewed public names from demonstration draws",
  EventPackages: "Display published offers and external checkout links",
  EventContact: "Public contact details for the event team",
  EventFlyer: "A public event flyer image",
  EventShare: "Share the published event's canonical link",
  HeroSlider:
    "Photographic stories with inset text, buttons and manual slide controls",
  FeatureSection: "Image beside benefits, icons and a call to action",
  Programme: "Ordered times, activities and practical details",
  ParticipationOptions:
    "Package information and links to your registration pages",
  EventCollection: "Automatically display published public events from Events",
  SiteRow: "Three columns with adjustable widths and stacking on phones",
  SiteBrand: "Club identity or a logo from your media library",
  SiteMenu: "Reference the shared primary menu",
  SiteContact: "Address, email and phone",
  SiteSocial: "Reference the shared social links",
  SiteFooterText: "Reference the shared footer text",
  Hero: "Heading, introduction and an optional image",
  Form: "Contact, volunteer, membership and other reusable forms",
  Heading: "A section heading with two hierarchy levels",
  Button: "A styled link to a page or website",
  Divider: "A simple visual break between sections",
  Spacer: "Adjust the space between your blocks",
  Cover: "A content section with a background image or color",
  ImageSlider: "Browse images with manual slide controls",
  RichText: "Paragraphs, lists and formatted text",
  Image: "An image with a caption and layout options",
  Gallery: "A collection of images",
  Cards: "Related content and links",
  CallToAction: "A clear next step for your visitors",
  Statistics: "Meaningful facts and figures",
  FAQ: "Questions and answers",
  Team: "Introduce your people",
  Sponsors: "Existing inline names and logos, specific to this page",
  PartnerCollection:
    "Show partners, sponsors or team profiles: choose specific profiles or a category",
  SharedSection: "Reuse a published section",
};

export function BlockLibrary({
  onInsert,
  insertionIndex,
  disabled = false,
  kind,
}: {
  onInsert: () => void;
  insertionIndex: number | null;
  disabled?: boolean;
  kind: CmsKind;
}) {
  const { features } = useCurrentUser();
  const [query, setQuery] = useState("");
  const dispatch = useEditorPuck((state) => state.dispatch);
  const content = useEditorPuck((state) => state.appState.data.content);
  const selection = useEditorPuck((state) => state.appState.ui.itemSelector);
  const [zone, setZone] = useState(selection?.zone ?? rootZone);
  const length = zoneBlocks(content, zone).length;
  const destination = Math.max(0, Math.min(insertionIndex ?? length, length));
  return (
    <div className="editor-block-library">
      {zone === rootZone && (
        <PatternPicker
          kind={kind}
          index={destination}
          disabled={disabled}
          onInsert={onInsert}
        />
      )}
      {(isSitePart(kind) ||
        content.some((item) => item.type === "Columns")) && (
        <label className="editor-block-search">
          Insert into
          <select
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          >
            <option value={rootZone}>
              {isSitePart(kind) ? "Whole site part" : "Whole page"}
            </option>
            {content.flatMap((item, index) =>
              item.type === "SiteRow" || item.type === "Columns"
                ? (item.type === "SiteRow"
                    ? ["left", "center", "right"]
                    : ["left", "right"]
                  ).map((column) => (
                    <option
                      key={`${item.props.id}:${column}`}
                      value={`${item.props.id}:${column}`}
                    >
                      Row {index + 1} · {column} column
                    </option>
                  ))
                : [],
            )}
          </select>
        </label>
      )}
      <label className="editor-block-search">
        Search blocks
        <input
          type="search"
          value={query}
          placeholder="Find a block…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p className="editor-help">
        {destination === 0
          ? "Insert at the start of the page."
          : `Insert after block ${destination}.`}{" "}
        Click a block below.
      </p>
      {Object.entries(puckConfig.categories ?? {}).map(([key, category]) => {
        const blocks = (category.components ?? []).filter(
          (name) =>
            (name !== "Form" || features.forms) &&
            !eventOnlyBlockTypes.some((type) => type === name) &&
            (name !== "EventCollection" || features.events) &&
            (name !== "Calendar" || features.calendar) &&
            (zone === rootZone || name !== "Columns") &&
            (isSitePart(kind)
              ? sitePartBlockTypes.some((type) => type === name) &&
                (zone === rootZone || name !== "SiteRow")
              : !name.startsWith("Site")) &&
            `${name} ${puckConfig.components[name].label ?? ""} ${blockDescriptions[name]}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        );
        return (
          blocks.length > 0 && (
            <section key={key}>
              <h3>{category.title}</h3>
              <div className="editor-block-list">
                {blocks.map((name) => (
                  <button
                    key={name}
                    disabled={disabled}
                    aria-label={`Add ${puckConfig.components[name].label || name} block`}
                    onClick={() => {
                      if (disabled) return;
                      dispatch({
                        type: "insert",
                        componentType: name,
                        destinationIndex: destination,
                        destinationZone: zone,
                      });
                      dispatch({
                        type: "setUi",
                        ui: {
                          itemSelector: { index: destination, zone },
                        },
                        recordHistory: false,
                      });
                      onInsert();
                    }}
                  >
                    <span className="editor-block-symbol">
                      <EditorIcon
                        name={
                          name === "Image" || name === "Gallery"
                            ? "image"
                            : "plus"
                        }
                      />
                    </span>
                    <span>
                      <strong>
                        {puckConfig.components[name].label || name}
                      </strong>
                      <small>{blockDescriptions[name]}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        );
      })}
    </div>
  );
}

export function BlockActions({ disabled = false }: { disabled?: boolean }) {
  const selected = useEditorPuck((state) => state.appState.ui.itemSelector);
  const count = useEditorPuck(
    (state) =>
      zoneBlocks(
        state.appState.data.content,
        state.appState.ui.itemSelector?.zone ?? rootZone,
      ).length,
  );
  const dispatch = useEditorPuck((state) => state.dispatch);
  if (!selected) return null;
  const zone = selected.zone ?? rootZone;
  function move(offset: number) {
    if (!selected || disabled) return;
    const destinationIndex = selected.index + offset;
    dispatch({
      type: "reorder",
      sourceIndex: selected.index,
      destinationIndex,
      destinationZone: zone,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: destinationIndex, zone } },
      recordHistory: false,
    });
  }
  return (
    <div
      className="editor-block-actions"
      role="group"
      aria-label="Selected block actions"
    >
      <button
        className="editor-icon-button"
        title="Move up"
        aria-label="Move block up"
        disabled={disabled || selected.index === 0}
        onClick={() => move(-1)}
      >
        <EditorIcon name="up" />
      </button>
      <button
        className="editor-icon-button"
        title="Move down"
        aria-label="Move block down"
        disabled={disabled || selected.index >= count - 1}
        onClick={() => move(1)}
      >
        <EditorIcon name="down" />
      </button>
      <button
        className="editor-icon-button"
        title="Duplicate block"
        aria-label="Duplicate block"
        disabled={disabled}
        onClick={() =>
          dispatch({
            type: "duplicate",
            sourceIndex: selected.index,
            sourceZone: zone,
          })
        }
      >
        <EditorIcon name="duplicate" />
      </button>
      <button
        className="editor-icon-button editor-danger"
        title="Remove block"
        aria-label="Remove block"
        disabled={disabled}
        onClick={() =>
          dispatch({ type: "remove", index: selected.index, zone })
        }
      >
        <EditorIcon name="trash" />
      </button>
    </div>
  );
}

function zoneBlocks(
  content: Content<PuckBlocks>,
  zone: string,
): Content<PuckBlocks> {
  if (zone === rootZone) return content;
  const [id, column] = zone.split(":");
  const row = content.find((item) => item.props.id === id);
  if (row?.type === "Columns" && (column === "left" || column === "right"))
    return row.props[column];
  return row?.type === "SiteRow" &&
    (column === "left" || column === "center" || column === "right")
    ? row.props[column]
    : [];
}
