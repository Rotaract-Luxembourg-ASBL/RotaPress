"use client";

import Link from "next/link";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { appearanceSchema, websiteThemes } from "@/features/cms/appearance";
import type { CmsLocale, SiteSettings } from "@/features/cms/cms_schemas";
import { WebsiteBrandingFields } from "./website-branding-fields";
import { WebsiteStylePreview } from "./website-style-preview";

const sections = [
  { id: "identity", label: "Logo & icon" },
  { id: "style", label: "Colors & type" },
  { id: "layout", label: "Page layout" },
] as const;
type AppearanceSection = (typeof sections)[number]["id"];

function HexColor({
  value,
  disabled,
  onChange,
  onInvalid,
  onInvalidChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onInvalid: () => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const inputId = useId();
  const [text, setText] = useState(value);
  const [external, setExternal] = useState(value);
  const invalid = !/^#[0-9a-fA-F]{6}$/.test(text);
  if (value !== external || (disabled && text !== value)) {
    setExternal(value);
    setText(value);
  }
  useEffect(() => {
    onInvalidChange(!disabled && invalid);
  }, [disabled, invalid, onInvalidChange]);
  useEffect(() => () => onInvalidChange(false), [onInvalidChange]);
  return (
    <div className="website-hex-color">
      <label htmlFor={inputId}>Hex color</label>
      <input
        id={inputId}
        type="text"
        disabled={disabled}
        value={text}
        pattern="#[0-9a-fA-F]{6}"
        maxLength={7}
        required
        spellCheck={false}
        aria-invalid={!disabled && invalid}
        aria-describedby={!disabled && invalid ? `${inputId}-error` : undefined}
        title="Enter # followed by six hexadecimal characters, for example #365a69."
        onInvalid={(event) => {
          event.preventDefault();
          const input = event.currentTarget;
          onInvalid();
          requestAnimationFrame(() => input.focus());
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(event.target.value))
            onChange(event.target.value);
        }}
      />
      {!disabled && invalid && (
        <span id={`${inputId}-error`} className="field-help" role="alert">
          Enter # and six characters from 0–9 or a–f, for example #365a69.
        </span>
      )}
    </div>
  );
}

export function WebsiteAppearanceSettings({
  value,
  onChange,
  canRestore,
  onRestore,
  canLeave,
  locale,
  dirty,
  busy,
  saveState,
  onInvalidChange,
}: {
  value: SiteSettings;
  onChange: (value: SiteSettings) => void;
  canRestore: boolean;
  onRestore: () => void;
  canLeave: () => boolean;
  locale: CmsLocale;
  dirty: boolean;
  busy: boolean;
  saveState: string;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const [section, setSection] = useState<AppearanceSection>("identity");
  const prefix = useId();
  const theme = websiteThemes[value.themeId];
  const settingsHref = (tab: string) =>
    `/admin/website?tab=${tab}&locale=${locale}`;
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sections.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) %
            sections.length;
    setSection(sections[next].id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(
        `[data-section="${sections[next].id}"]`,
      )
      ?.focus();
  }
  return (
    <section
      className="website-settings-panel website-appearance"
      aria-label="Website branding and appearance settings"
    >
      <header className="website-appearance-heading">
        <div>
          <h2>Branding &amp; appearance</h2>
          <p>
            Choose your logo and website style. Changes stay private until
            published.
          </p>
        </div>
        <div className="website-appearance-save">
          <span className="small muted" role="status">
            {saveState}
          </span>
          <button
            type="submit"
            className="button button-accent"
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </header>
      <div
        className="website-appearance-tabs"
        role="tablist"
        aria-label="Appearance sections"
      >
        {sections.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${prefix}-${item.id}-tab`}
            aria-controls={`${prefix}-${item.id}-panel`}
            aria-selected={section === item.id}
            tabIndex={section === item.id ? 0 : -1}
            data-section={item.id}
            onClick={() => setSection(item.id)}
            onKeyDown={(event) => navigate(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${prefix}-identity-panel`}
        aria-labelledby={`${prefix}-identity-tab`}
        hidden={section !== "identity"}
      >
        <WebsiteBrandingFields
          value={value}
          onChange={onChange}
          canLeave={canLeave}
          locale={locale}
        />
      </div>
      <div
        role="tabpanel"
        id={`${prefix}-style-panel`}
        aria-labelledby={`${prefix}-style-tab`}
        hidden={section !== "style"}
        className="website-appearance-section"
      >
        <header>
          <h3>Colors &amp; typography</h3>
          <p className="field-help">
            Choose a theme, then adjust its accent color and headings. The
            sample updates as you edit.
          </p>
        </header>
        <div className="website-style-grid">
          <div className="form-stack">
            <label>
              Website theme
              <select
                value={value.themeId}
                onChange={(event) =>
                  onChange({
                    ...value,
                    themeId: appearanceSchema.shape.themeId.parse(
                      event.target.value,
                    ),
                  })
                }
              >
                {Object.entries(websiteThemes).map(([id, item]) => (
                  <option key={id} value={id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-help">
              {theme.description} Your content and custom choices are kept.
            </p>
            <fieldset
              className="website-appearance-control"
              aria-label="Accent color settings"
            >
              <legend>Accent color</legend>
              <label className="website-settings-check">
                <input
                  type="checkbox"
                  checked={value.accentColor !== null}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      accentColor: event.target.checked ? theme.accent : null,
                    })
                  }
                />
                Custom accent color
              </label>
              <div className="website-accent-inputs">
                <label>
                  Accent color
                  <input
                    type="color"
                    disabled={value.accentColor === null}
                    value={value.accentColor ?? theme.accent}
                    onChange={(event) =>
                      onChange({ ...value, accentColor: event.target.value })
                    }
                  />
                </label>
                <HexColor
                  value={value.accentColor ?? theme.accent}
                  disabled={value.accentColor === null}
                  onChange={(accentColor) =>
                    onChange({ ...value, accentColor })
                  }
                  onInvalid={() => setSection("style")}
                  onInvalidChange={onInvalidChange}
                />
              </div>
              <p className="field-help">
                Used for buttons and highlights.{" "}
                {value.accentColor === null
                  ? `Using ${theme.accent}, the theme default.`
                  : "Clear Custom accent color to return to the theme default."}
              </p>
            </fieldset>
            <label>
              Heading style
              <select
                value={value.font ?? "theme"}
                onChange={(event) =>
                  onChange({
                    ...value,
                    font:
                      event.target.value === "theme"
                        ? null
                        : appearanceSchema.shape.font.parse(event.target.value),
                  })
                }
              >
                <option value="theme">Theme default</option>
                <option value="sans">Modern sans serif</option>
                <option value="serif">Classic serif</option>
              </select>
            </label>
            <p className="field-help">
              Applies to headings. Body text keeps the theme's readable style.
            </p>
            <button
              type="button"
              className="inline-button website-reset-style"
              disabled={value.accentColor === null && value.font === null}
              onClick={() =>
                onChange({ ...value, accentColor: null, font: null })
              }
            >
              Reset color and headings to theme defaults
            </button>
          </div>
          <WebsiteStylePreview value={value} />
        </div>
        <details className="website-appearance-restore">
          <summary>Restore a previous appearance</summary>
          <p className="field-help">
            Restore the previous published theme, color and headings as a saved
            draft. Your logo, icon and page content stay the same.
          </p>
          <button
            type="button"
            className="button button-outline button-small"
            disabled={!canRestore}
            onClick={onRestore}
          >
            Restore previous appearance to draft
          </button>
          {!canRestore && (
            <p className="field-help">
              {dirty
                ? "Save your changes before restoring."
                : "A previous published appearance will be available after you publish a different style."}
            </p>
          )}
        </details>
      </div>

      <div
        role="tabpanel"
        id={`${prefix}-layout-panel`}
        aria-labelledby={`${prefix}-layout-tab`}
        hidden={section !== "layout"}
        className="website-appearance-section"
      >
        <header>
          <h3>Edit your website layout</h3>
          <p className="field-help">
            Arrange content in its own editor. Your colors and branding stay
            with your website.
          </p>
        </header>
        <div className="website-design-destinations">
          {[
            {
              tab: "parts",
              title: "Header & footer",
              text: "Arrange your logo, navigation, contact details and shared footer.",
            },
            {
              tab: "pages",
              title: "Page layouts",
              text: "Open a page to arrange sections, adjust their appearance and preview the result.",
            },
            {
              tab: "templates",
              title: "Website templates",
              text: "Choose a coordinated set of editable pages, menu, header and footer.",
            },
          ].map((item) => (
            <Link
              key={item.tab}
              href={settingsHref(item.tab)}
              onClick={(event) => {
                if (!canLeave()) event.preventDefault();
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.text}</span>
              <span className="text-link">Open {item.title.toLowerCase()}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="website-appearance-preview-help">
        <p className="field-help">
          {dirty
            ? "Save settings to include these changes in Preview website. Publish website makes the reviewed changes public."
            : "Preview your saved draft, then use Publish website when you are ready for visitors to see it."}
        </p>
        {value.homePageId && !dirty && (
          <Link
            className="button button-outline"
            href={`/admin/website/preview?locale=${locale}`}
            target="_blank"
          >
            Open saved website preview
          </Link>
        )}
      </div>
    </section>
  );
}
