"use client";

import Link from "next/link";
import { useState } from "react";
import { appearanceSchema, websiteThemes } from "@/features/cms/appearance";
import type { CmsLocale, SiteSettings } from "@/features/cms/cms_schemas";
import { WebsiteBrandingFields } from "./website-branding-fields";
import { WebsiteStylePreview } from "./website-style-preview";

function HexColor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [external, setExternal] = useState(value);
  if (value !== external) {
    setExternal(value);
    setText(value);
  }
  return (
    <label>
      Hex color
      <input
        type="text"
        disabled={disabled}
        value={text}
        pattern="#[0-9a-fA-F]{6}"
        maxLength={7}
        required
        spellCheck={false}
        title="Enter # followed by six hexadecimal characters, for example #365a69."
        onChange={(event) => {
          setText(event.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(event.target.value))
            onChange(event.target.value);
        }}
      />
    </label>
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
}: {
  value: SiteSettings;
  onChange: (value: SiteSettings) => void;
  canRestore: boolean;
  onRestore: () => void;
  canLeave: () => boolean;
  locale: CmsLocale;
  dirty: boolean;
}) {
  const theme = websiteThemes[value.themeId];
  const settingsHref = (tab: string) =>
    `/admin/website?tab=${tab}&locale=${locale}`;
  return (
    <section
      className="website-settings-panel website-appearance"
      aria-label="Website branding and appearance settings"
    >
      <header>
        <h2>Branding &amp; appearance</h2>
        <p>
          Make your website feel like your club. Save privately, preview your
          pages, then publish when ready.
        </p>
      </header>
      <nav
        className="website-appearance-jump-links"
        aria-label="Appearance sections"
      >
        <a href="#website-branding-title">Logo &amp; identity</a>
        <a href="#website-colors-title">Colors &amp; typography</a>
        <a href="#website-layout-title">Layout &amp; design</a>
      </nav>
      <WebsiteBrandingFields
        value={value}
        onChange={onChange}
        canLeave={canLeave}
        locale={locale}
      />

      <section
        className="website-appearance-section"
        aria-labelledby="website-colors-title"
      >
        <header>
          <span className="eyebrow">Website style</span>
          <h3 id="website-colors-title">Colors &amp; typography</h3>
          <p className="field-help">
            Choose a visual foundation, then fine-tune your accent and headings.
            Your pages, menu and shared content are kept.
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
              {theme.description} Any custom accent or heading choice stays in
              place when you change theme.
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
                <option value="theme">Template default</option>
                <option value="sans">Modern sans serif</option>
                <option value="serif">Classic serif</option>
              </select>
            </label>
            <p className="field-help">
              Headings use the chosen style. Body text stays readable and
              consistent across your website.
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
      </section>

      <section
        className="website-appearance-section"
        aria-labelledby="website-layout-title"
      >
        <header>
          <span className="eyebrow">Structure</span>
          <h3 id="website-layout-title">Layout &amp; design</h3>
          <p className="field-help">
            The {theme.name} theme supplies these defaults. Individual page
            sections can use their own spacing and appearance.
          </p>
        </header>
        <dl className="website-layout-defaults">
          <div>
            <dt>Content width</dt>
            <dd>{theme.width}</dd>
          </div>
          <div>
            <dt>Section spacing</dt>
            <dd>{theme.blockGap}</dd>
          </div>
          <div>
            <dt>Card corners</dt>
            <dd>
              {theme.radius === "0px" ? "Square" : `${theme.radius} rounded`}
            </dd>
          </div>
        </dl>
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
              title: "Complete templates",
              text: "Start a complete set of editable pages with a coordinated menu and shared parts.",
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
      </section>
      <div className="website-appearance-preview-help">
        <div>
          <h3>Review your actual website</h3>
          <p className="field-help">
            {dirty
              ? "Save settings first to include these changes in your website preview."
              : "Preview your saved pages, branding and menu together. Publish the website to make them public."}
          </p>
        </div>
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
      <details className="website-settings-secondary website-appearance-restore">
        <summary>Restore a previous appearance</summary>
        <p className="field-help">
          Restore the previous published theme, colors and heading style into
          this draft. Your branding, page content and selected shared parts stay
          the same.
        </p>
        <button
          type="button"
          className="button button-outline"
          disabled={!canRestore}
          onClick={onRestore}
        >
          Restore previous appearance to draft
        </button>
      </details>
    </section>
  );
}
