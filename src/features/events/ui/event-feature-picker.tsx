"use client";

import { eventModules, type EventModuleKey } from "../event_modules";
import { presetModuleDependencies } from "../event_templates";
import { eventFeaturePresentation } from "./event-feature-catalogue";
import { Icon } from "@/ui/icon";

export function EventFeaturePicker({
  selected,
  onChange,
}: {
  selected: EventModuleKey[];
  onChange: (keys: EventModuleKey[]) => void;
}) {
  function toggle(key: EventModuleKey, checked: boolean) {
    if (checked) {
      onChange([
        ...new Set([...selected, ...presetModuleDependencies(key), key]),
      ]);
      return;
    }
    onChange(
      selected.filter(
        (item) => item !== key && !presetModuleDependencies(item).includes(key),
      ),
    );
  }
  return (
    <fieldset className="event-feature-picker">
      <legend>Choose your event features</legend>
      <p className="field-help">
        Select only what you need. Required features are included automatically.
        Nothing is published and registration stays closed.
      </p>
      <div className="event-feature-picker-grid">
        {(Object.keys(eventModules) as EventModuleKey[]).map((key) => {
          const feature = eventFeaturePresentation[key];
          const checked = selected.includes(key);
          return (
            <label
              key={key}
              className={`event-feature-option${checked ? " is-selected" : ""}`}
            >
              <input
                type="checkbox"
                aria-label={feature.label}
                checked={checked}
                onChange={(event) => toggle(key, event.target.checked)}
              />
              <Icon name={feature.icon} />
              <span>
                <strong>{feature.label}</strong>
                <small>{feature.description}</small>
              </span>
            </label>
          );
        })}
      </div>
      <p className="field-help">
        {selected.length === 0
          ? "Details only. You can add an event page or other features later."
          : `${selected.length} features selected. Review the pages and forms before creating the event.`}
      </p>
    </fieldset>
  );
}
