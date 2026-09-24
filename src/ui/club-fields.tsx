"use client";

import type { ClubSettings } from "./api";
import { useId } from "react";

export const initialClubSettings: ClubSettings = {
  name: "",
  tagline: "",
  description: "",
  locale: "en",
  timezone: "Europe/Luxembourg",
  accentColor: "#a84432",
};

export function ClubFields({
  value,
  onChange,
  grouped = false,
  showBranding = true,
  brandPresets = false,
}: {
  value: ClubSettings;
  onChange: (value: ClubSettings) => void;
  grouped?: boolean;
  showBranding?: boolean;
  brandPresets?: boolean;
}) {
  const timezoneList = useId();
  const timezones = Array.from(
    new Set([value.timezone, ...Intl.supportedValuesOf("timeZone")]),
  ).sort();
  function update(key: keyof ClubSettings, text: string) {
    onChange({ ...value, [key]: text });
  }

  return (
    <>
      {grouped && <h2>Club identity</h2>}
      <label>
        Club name
        <input
          name="clubName"
          value={value.name}
          onChange={(event) => update("name", event.target.value)}
          maxLength={120}
          required
          placeholder="Your club’s name"
        />
      </label>
      <label>
        Tagline
        <input
          name="tagline"
          value={value.tagline}
          onChange={(event) => update("tagline", event.target.value)}
          maxLength={180}
          required
          placeholder="A few words about what brings you together"
        />
      </label>
      <label>
        About your club
        <textarea
          name="description"
          value={value.description}
          onChange={(event) => update("description", event.target.value)}
          maxLength={2000}
          rows={4}
          required
          placeholder="Introduce your community and its purpose."
        />
      </label>
      {grouped && (
        <>
          <div className="form-divider" />
          <h2>Language and time zone</h2>
        </>
      )}
      <div className="form-columns">
        <label>
          Default content language
          <select
            name="locale"
            value={value.locale}
            onChange={(event) => update("locale", event.target.value)}
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="lb">Luxembourgish</option>
          </select>
        </label>
        <label>
          Time zone
          <input
            name="timezone"
            value={value.timezone}
            onChange={(event) => update("timezone", event.target.value)}
            maxLength={100}
            required
            placeholder="Europe/Luxembourg"
            list={timezoneList}
          />
          <datalist id={timezoneList}>
            {timezones.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone.replaceAll("_", " ").replaceAll("/", " / ")}
              </option>
            ))}
          </datalist>
        </label>
      </div>
      <p className="field-help">
        Choose a city or enter a valid IANA time zone. The default language does
        not translate content. Administration remains in English.
      </p>
      {showBranding && grouped && (
        <>
          <div className="form-divider" />
          <h2>Default website branding</h2>
        </>
      )}
      {showBranding && (
        <div className="form-stack">
          {brandPresets && (
            <fieldset className="setup-brand-presets">
              <legend>Start with your community’s color</legend>
              <div>
                <button
                  type="button"
                  aria-pressed={value.accentColor.toLowerCase() === "#17458f"}
                  onClick={() => update("accentColor", "#17458f")}
                >
                  <span className="setup-swatch setup-swatch-rotary" />
                  Rotary blue
                </button>
                <button
                  type="button"
                  aria-pressed={value.accentColor.toLowerCase() === "#d41367"}
                  onClick={() => update("accentColor", "#d41367")}
                >
                  <span className="setup-swatch setup-swatch-rotaract" />
                  Rotaract cranberry
                </button>
              </div>
            </fieldset>
          )}
          <label>
            Accent color
            <div className="color-field">
              <input
                name="accentColor"
                type="color"
                value={value.accentColor}
                onChange={(event) => update("accentColor", event.target.value)}
              />
              <span>{value.accentColor}</span>
              <span className="muted small">Used on your public website</span>
            </div>
          </label>
        </div>
      )}
    </>
  );
}
