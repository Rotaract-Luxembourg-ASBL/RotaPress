"use client";

import type { CmsSummary, SiteSettings } from "@/features/cms/cms_schemas";
import { Icon } from "./icon";
import Link from "next/link";

export function WebsiteMenuSettings({
  value,
  pages,
  onChange,
}: {
  value: SiteSettings;
  pages: CmsSummary[];
  onChange: (value: SiteSettings) => void;
}) {
  function move(index: number, offset: number) {
    const navigation = [...value.navigation];
    [navigation[index], navigation[index + offset]] = [
      navigation[index + offset],
      navigation[index],
    ];
    onChange({ ...value, navigation });
  }
  return (
    <section
      className="website-settings-panel"
      aria-label="Website menu settings"
    >
      <header>
        <h2>Homepage & menu</h2>
        <p>
          Choose where visitors arrive and the links they see across your
          website.
        </p>
      </header>
      <label className="website-settings-field">
        Homepage
        <select
          value={value.homePageId ?? ""}
          onChange={(event) =>
            onChange({ ...value, homePageId: event.target.value || null })
          }
        >
          <option value="">Default home page</option>
          {value.homePageId &&
            !pages.some((page) => page.id === value.homePageId) && (
              <option value={value.homePageId}>
                Selected homepage unavailable
              </option>
            )}
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.title}
              {page.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
        <span className="field-help">
          This page opens at your website's main address after publication.
        </span>
      </label>
      <div className="website-settings-field">
        <strong>Events directory</strong>
        <p className="field-help">
          Design the built-in /events page from the Events workspace. Use Events
          (/events) below to add it to your menu.
        </p>
        <Link className="text-link" href="/admin/events?tab=directory">
          Design Events directory
        </Link>
      </div>
      <div className="website-settings-section-heading">
        <h3>Menu links</h3>
        <span className="small muted">{value.navigation.length} / 12</span>
      </div>
      {!value.navigation.length && (
        <p className="website-settings-empty">
          No menu links yet. Add pages below in the order visitors should see
          them.
        </p>
      )}
      <ol className="website-menu-list">
        {value.navigation.map((item, index) => {
          const selectedId = "pageId" in item ? item.pageId : item.systemPage;
          return (
            <li key={index} className="website-menu-row">
              <span className="website-menu-position" aria-hidden="true">
                {index + 1}
              </span>
              <label>
                Link label
                <input
                  required
                  maxLength={60}
                  value={item.label}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      navigation: value.navigation.map((entry, i) =>
                        i === index
                          ? { ...entry, label: event.target.value }
                          : entry,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Destination
                <select
                  value={selectedId}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      navigation: value.navigation.map((entry, i) =>
                        i === index
                          ? event.target.value === "events" ||
                            event.target.value === "calendar"
                            ? {
                                label: entry.label,
                                systemPage: event.target.value as
                                  "events" | "calendar",
                              }
                            : { label: entry.label, pageId: event.target.value }
                          : entry,
                      ),
                    })
                  }
                >
                  <option value="events">Events (/events)</option>
                  <option value="calendar">Calendar (/calendar)</option>
                  {selectedId !== "events" &&
                    selectedId !== "calendar" &&
                    !pages.some((page) => page.id === selectedId) && (
                      <option value={selectedId}>
                        Selected page unavailable
                      </option>
                    )}
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                      {page.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="website-row-actions">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={index === 0}
                  aria-label={`Move menu link ${index + 1} up`}
                  onClick={() => move(index, -1)}
                >
                  <Icon name="up" />
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={index === value.navigation.length - 1}
                  aria-label={`Move menu link ${index + 1} down`}
                  onClick={() => move(index, 1)}
                >
                  <Icon name="down" />
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  aria-label={`Remove navigation item ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      navigation: value.navigation.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          className="button button-outline"
          disabled={value.navigation.length >= 12}
          onClick={() => {
            const page = pages.find((item) => !item.archived);
            onChange({
              ...value,
              navigation: [
                ...value.navigation,
                page
                  ? { pageId: page.id, label: page.title }
                  : { systemPage: "events", label: "Events" },
              ],
            });
          }}
        >
          <Icon name="plus" />
          Add navigation link
        </button>
      </div>
      <p className="field-help">
        Only published pages appear in the public menu. The Events directory
        lists your published public events automatically.
      </p>
    </section>
  );
}
