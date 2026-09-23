"use client";

import Link from "next/link";
import type {
  CmsLocale,
  CmsSummary,
  SiteSettings,
} from "@/features/cms/cms_schemas";
import { ContentStatus } from "./content-status";
import { Icon } from "./icon";

export function WebsitePartsSettings({
  value,
  items,
  locale,
  onChange,
  onCreate,
  canLeave,
}: {
  value: SiteSettings;
  items: CmsSummary[];
  locale: CmsLocale;
  onChange: (value: SiteSettings) => void;
  onCreate: (kind: "header" | "footer") => void;
  canLeave: () => boolean;
}) {
  return (
    <section
      className="website-settings-panel"
      aria-label="Website header and footer settings"
    >
      <header>
        <h2>Header & footer</h2>
        <p>
          Edit the shared content visitors see at the top and bottom of your
          pages.
        </p>
      </header>
      <div className="website-parts-grid">
        {(["header", "footer"] as const).map((kind) => {
          const chosenId = value[`${kind}Id`];
          const available = items.filter(
            (item) => item.kind === kind && item.locale === locale,
          );
          const selected = chosenId
            ? available.find((item) => item.id === chosenId)
            : available.find(
                (item) =>
                  !item.archived && !item.kitId && item.publishedRevisionId,
              );
          const choices = available.filter(
            (item) =>
              item.id === chosenId || (!item.archived && !item.demonstration),
          );
          return (
            <article className="website-part-card" key={kind}>
              <div className="website-part-heading">
                <Icon name={kind === "header" ? "website" : "outline"} />
                <h3>{kind === "header" ? "Header" : "Footer"}</h3>
              </div>
              {selected ? (
                <>
                  <strong>{selected.title}</strong>
                  <ContentStatus item={selected} />
                  <p className="field-help">
                    {selected.archived
                      ? "This selected part is archived. Choose another part before publishing."
                      : chosenId
                        ? "Selected for your website draft."
                        : "The original shared part used by your website."}
                  </p>
                  <Link
                    className="button button-outline"
                    href={`/admin/website/${selected.id}?locale=${locale}`}
                    onClick={(event) => {
                      if (!canLeave()) event.preventDefault();
                    }}
                  >
                    {selected.archived ? "View" : "Edit"} {kind}
                  </Link>
                </>
              ) : (
                <>
                  <p className="field-help">
                    {chosenId
                      ? "The selected part is unavailable in this language. Choose a replacement below."
                      : `Your website currently uses its built-in ${kind}. Choose a saved design or create one to customize it.`}
                  </p>
                  {!choices.length && (
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => onCreate(kind)}
                    >
                      <Icon name="plus" />
                      Create {kind} draft
                    </button>
                  )}
                </>
              )}
              {choices.length > 0 && (
                <details className="website-part-choices" open={!selected}>
                  <summary>
                    {selected
                      ? `Choose a different ${kind}`
                      : `Choose a ${kind}`}
                  </summary>
                  <label>
                    Selected {kind}
                    <select
                      value={chosenId ?? ""}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          [`${kind}Id`]: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Original website {kind}</option>
                      {chosenId &&
                        !choices.some((item) => item.id === chosenId) && (
                          <option value={chosenId}>
                            Selected {kind} unavailable
                          </option>
                        )}
                      {choices.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                          {item.archived
                            ? " (archived)"
                            : item.publishedRevisionId
                              ? ""
                              : " (draft)"}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
              )}
            </article>
          );
        })}
      </div>
      <div className="website-settings-secondary form-stack">
        <h3>Footer text & social links</h3>
        <p className="field-help">
          These values appear wherever your footer includes shared text or
          social links.
        </p>
        <label>
          Footer text
          <textarea
            rows={3}
            maxLength={1000}
            value={value.footerText}
            onChange={(event) =>
              onChange({ ...value, footerText: event.target.value })
            }
          />
        </label>
        {value.socialLinks.map((item, index) => (
          <div className="website-social-row" key={index}>
            <label>
              Label
              <input
                required
                maxLength={60}
                value={item.label}
                onChange={(event) =>
                  onChange({
                    ...value,
                    socialLinks: value.socialLinks.map((entry, i) =>
                      i === index
                        ? { ...entry, label: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
            <label>
              Website URL
              <input
                required
                value={item.href}
                onChange={(event) =>
                  onChange({
                    ...value,
                    socialLinks: value.socialLinks.map((entry, i) =>
                      i === index
                        ? { ...entry, href: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="button button-outline"
              aria-label={`Remove social link ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  socialLinks: value.socialLinks.filter((_, i) => i !== index),
                })
              }
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="button button-outline"
            disabled={value.socialLinks.length >= 8}
            onClick={() =>
              onChange({
                ...value,
                socialLinks: [...value.socialLinks, { label: "", href: "" }],
              })
            }
          >
            <Icon name="plus" />
            Add social link
          </button>
        </div>
      </div>
    </section>
  );
}
