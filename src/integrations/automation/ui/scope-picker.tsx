"use client";
import { useId } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { scopeDefinitions, type AutomationScope } from "../scopes";

const groups = [
  {
    name: "Website",
    prefix: "website:",
    hint: "Pages, revisions, menus and appearance drafts",
  },
  {
    name: "Media",
    prefix: "media:",
    hint: "Images, including private files when selected",
  },
  {
    name: "Events",
    prefix: "events:",
    hint: "Event content and setup suggestions",
  },
  {
    name: "Forms",
    prefix: "forms:",
    hint: "Form definitions, never responses",
  },
  { name: "Directory", prefix: "directory:", hint: "Community profiles" },
  {
    name: "Projects",
    prefix: "projects:",
    hint: "Volunteering stories, initiatives and verified outcomes",
  },
  {
    name: "Calendar",
    prefix: "calendar:",
    hint: "Calendars, recurring activities and page design",
  },
  {
    name: "Reference websites",
    prefix: "sources:",
    hint: "Only the HTTPS origins you approve below",
  },
] as const;

export function ScopePicker({
  value,
  onChange,
  disabled,
  legend = "Allowed actions",
}: {
  value: AutomationScope[];
  onChange: (scopes: AutomationScope[]) => void;
  disabled?: boolean;
  legend?: string;
}) {
  const { capabilities, features } = useCurrentUser();
  const helpId = useId();
  const available = (Object.keys(scopeDefinitions) as AutomationScope[]).filter(
    (scope) =>
      capabilities.includes(scopeDefinitions[scope].capability) &&
      (!scope.startsWith("forms:") || features.forms) &&
      (!scope.startsWith("events:") || features.events) &&
      (!scope.startsWith("projects:") || features.projects) &&
      (!scope.startsWith("calendar:") || features.calendar),
  );
  const selected = available.filter((scope) => value.includes(scope));
  function toggle(scopes: AutomationScope[], checked: boolean) {
    onChange(
      available.filter((scope) =>
        scopes.includes(scope) ? checked : value.includes(scope),
      ),
    );
  }
  return (
    <fieldset
      disabled={disabled}
      className="scope-picker"
      aria-describedby={helpId}
    >
      <legend>{legend}</legend>
      <p id={helpId} className="small muted">
        Choose what this connection can do. Reads may include private drafts.
        Publishing needs its own selected permission and an explicit request.
        Participant records are never included.
      </p>
      <div className="scope-picker-toolbar">
        <strong aria-live="polite">
          {selected.length} of {available.length} selected
        </strong>
        <div className="actions">
          <button
            type="button"
            className="button button-outline"
            onClick={() => onChange(available)}
          >
            Select all
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() =>
              onChange(
                available.filter(
                  (scope) =>
                    scope.endsWith(":read") && scope !== "sources:read",
                ),
              )
            }
          >
            Read only
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() =>
              onChange(
                available.filter(
                  (scope) =>
                    scope.startsWith("website:") && !scope.endsWith(":publish"),
                ),
              )
            }
          >
            Website drafts
          </button>
        </div>
      </div>
      <div className="scope-picker-groups">
        {groups.map((group) => {
          const choices = available.filter((scope) =>
            scope.startsWith(group.prefix),
          );
          if (!choices.length) return null;
          const count = choices.filter((scope) => value.includes(scope)).length;
          return (
            <div key={group.prefix} className="scope-picker-group">
              <div className="scope-picker-group-heading">
                <strong>
                  {group.name}{" "}
                  <span className="muted small">
                    {count}/{choices.length}
                  </span>
                </strong>
                <button
                  type="button"
                  className="inline-button"
                  aria-label={`${count === choices.length ? "Clear" : "Select all"} ${group.name} actions`}
                  onClick={() => toggle(choices, count !== choices.length)}
                >
                  {count === choices.length ? "Clear" : "Select all"}
                </button>
              </div>
              <p className="small muted">{group.hint}</p>
              {choices.map((scope) => (
                <label key={scope} className="automation-scope">
                  <input
                    type="checkbox"
                    checked={value.includes(scope)}
                    onChange={(event) => toggle([scope], event.target.checked)}
                  />
                  {scopeDefinitions[scope].label}
                </label>
              ))}
            </div>
          );
        })}
      </div>
      {!selected.length && (
        <p className="small">
          Select at least one action to create this connection.
        </p>
      )}
    </fieldset>
  );
}
