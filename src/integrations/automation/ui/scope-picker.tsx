"use client";
import { useId } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { scopeDefinitions, type AutomationScope } from "../scopes";

const websiteRecreationScopes: AutomationScope[] = [
  "website:read",
  "website:write",
  "website:manage",
  "website:settings",
  "website:preview",
  "media:read",
  "media:write",
  "media:inspect",
  "sources:read",
  "projects:read",
  "projects:write",
];

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
    name: "Files",
    prefix: "files:",
    hint: "PDF, audio and video; private bytes have a separate grant",
  },
  {
    name: "Albums",
    prefix: "albums:",
    hint: "Reusable photo albums with separate draft and publication actions",
  },
  {
    name: "Membership",
    prefix: "members:",
    hint: "Private member records and requested membership decisions",
  },
  {
    name: "Account access",
    prefix: "access:",
    hint: "Staff roles, event teams and owner changes; never the assistant's own access",
  },
  {
    name: "Responses",
    prefix: "responses:",
    hint: "Private answers, exact exports and permanent deletion are separate choices",
  },
  {
    name: "Registrations",
    prefix: "registrations:",
    hint: "Private attendance and requested booking cancellation",
  },
  {
    name: "Guest access",
    prefix: "guests:",
    hint: "Private guests and requested portal access",
  },
  {
    name: "Communications",
    prefix: "communications:",
    hint: "Notification templates and failed alerts to configured recipients",
  },
  {
    name: "Events",
    prefix: "events:",
    hint: "Event content, requested operational changes and cancellation",
  },
  {
    name: "Forms",
    prefix: "forms:",
    hint: "Definitions, publication, recipients and retention; private answers are separate",
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
    hint: "Only the domains or exact HTTPS hosts you approve below",
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
        Private participant records require their own selected permissions.
        Requested actions execute directly within these grants, including
        publication, access changes and deletion. Existing connections keep
        their current grants.
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
      <div className="scope-picker-task">
        <strong>Recreate an existing website</strong>
        <p className="small muted">
          Prepare pages, menus, appearance, images and project stories when
          Projects is enabled, then compare private previews. Add the reference
          domain below once to include its HTTPS website, www and subdomains.
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button-outline"
            onClick={() =>
              onChange(
                available.filter((scope) =>
                  websiteRecreationScopes.includes(scope),
                ),
              )
            }
          >
            Website recreation
          </button>
          {available.includes("media:publish") && (
            <label className="automation-scope">
              <input
                type="checkbox"
                checked={value.includes("media:publish")}
                onChange={(event) =>
                  toggle(["media:publish"], event.target.checked)
                }
              />
              Publish reviewed images
            </label>
          )}
        </div>
        <p className="small muted">
          This preset prepares private drafts. Uploads stay private until
          specific reviewed images are explicitly published. Image publication
          is an optional permission; publishing pages needs its own permission.
        </p>
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
