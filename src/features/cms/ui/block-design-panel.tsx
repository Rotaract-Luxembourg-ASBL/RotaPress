"use client";
import { useEditorPuck } from "./editor-blocks";
import {
  blockDesignSchema,
  designOptions,
  inheritedDesignValue,
  type DesignOption,
} from "../block_design";
import { useState } from "react";

export function BlockDesignPanel() {
  const selected = useEditorPuck((state) => state.selectedItem);
  const selector = useEditorPuck((state) => state.appState.ui.itemSelector);
  const dispatch = useEditorPuck((state) => state.dispatch);
  const [breakpoint, setBreakpoint] = useState<"base" | "tablet" | "mobile">(
    "base",
  );
  if (!selected || !selector) return null;
  const design = selected.props.design ?? {};
  const values =
    breakpoint === "base" ? design : (design.responsive?.[breakpoint] ?? {});
  function updateSetting(key: string, value: string) {
    const next = { ...values };
    Reflect.deleteProperty(next, key);
    if (value) Reflect.set(next, key, value);
    update(
      breakpoint === "base"
        ? next
        : {
            ...design,
            responsive: { ...design.responsive, [breakpoint]: next },
          },
    );
  }
  function update(next: unknown) {
    if (!selected || !selector) return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone ?? "root:default-zone",
      data: {
        ...selected,
        props: { ...selected.props, design: blockDesignSchema.parse(next) },
      },
    });
  }
  return (
    <div className="form-stack editor-design-fields">
      <p className="field-help">
        Style this section. Theme defaults remain shared; only your overrides
        are saved. Content stays the same when you change themes.
      </p>
      <label>
        Screen size
        <select
          value={breakpoint}
          onChange={(event) =>
            setBreakpoint(event.target.value as typeof breakpoint)
          }
        >
          <option value="base">All screens</option>
          <option value="tablet">Tablet · up to 1024 px</option>
          <option value="mobile">Phone · up to 600 px</option>
        </select>
      </label>
      {breakpoint !== "base" && (
        <p className="field-help">
          Empty values inherit from larger screens. Use the matching canvas size
          to check this layout.
        </p>
      )}
      {Object.entries(designOptions)
        .filter(
          ([key]) =>
            breakpoint === "base" ||
            [
              "spacing",
              "width",
              "alignment",
              "columns",
              "textSize",
              "lineHeight",
              "imageFit",
              "imageRatio",
              "imagePosition",
            ].includes(key),
        )
        .filter(
          ([key]) =>
            !key.startsWith("image") ||
            [
              "Image",
              "Gallery",
              "ImageSlider",
              "Hero",
              "HeroSlider",
              "Cover",
              "Cards",
              "Team",
              "Sponsors",
              "PartnerCollection",
              "EventCollection",
              "ProjectCollection",
              "FeatureSection",
            ].includes(selected.type),
        )
        .filter(
          ([key]) =>
            key !== "columns" ||
            [
              "Cards",
              "Team",
              "Sponsors",
              "PartnerCollection",
              "Gallery",
              "ParticipationOptions",
              "EventCollection",
              "ProjectCollection",
            ].includes(selected.type),
        )
        .map(([key, setting]) => (
          <label key={key}>
            {setting.label}
            <select
              value={String(Reflect.get(values, key) ?? "")}
              onChange={(event) => updateSetting(key, event.target.value)}
            >
              <option value="">
                {breakpoint === "base"
                  ? "Theme / block default"
                  : (() => {
                      const inherited = inheritedDesignValue(
                        design,
                        breakpoint,
                        key as DesignOption,
                      );
                      const label =
                        typeof inherited.value === "string"
                          ? inherited.value === "one" && key === "columns"
                            ? "One"
                            : (Reflect.get(setting.choices, inherited.value) as
                                string | undefined)
                          : undefined;
                      return label
                        ? `Inherited: ${label} (${inherited.source})`
                        : "Inherited: theme / block default";
                    })()}
              </option>
              {breakpoint !== "base" && key === "columns" && (
                <option value="one">One</option>
              )}
              {Object.entries(setting.choices)
                .filter(
                  ([value]) => breakpoint === "base" || value !== "viewport",
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        ))}
      <button
        className="button button-outline"
        type="button"
        onClick={() =>
          update(
            breakpoint === "base"
              ? {}
              : {
                  ...design,
                  responsive: { ...design.responsive, [breakpoint]: {} },
                },
          )
        }
      >
        Reset {breakpoint === "base" ? "all" : breakpoint} design overrides
      </button>
    </div>
  );
}
