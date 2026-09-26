"use client";

import Image from "next/image";
import Link from "next/link";
import { websiteStyle } from "@/features/cms/appearance";
import type { CmsLocale, SiteSettings } from "@/features/cms/cms_schemas";
import { resolveWebsiteBranding } from "@/features/cms/site_identity";
import { templateBrands } from "@/features/cms/template_brand";
import { websiteBrandingSchema } from "@/features/cms/website_branding";
import { useCurrentUser } from "./admin-shell";
import { type ClubSettings, useResource } from "./api";
import { MediaPicker } from "./media-picker";

export function WebsiteBrandingFields({
  value,
  onChange,
  canLeave,
  locale,
}: {
  value: SiteSettings;
  onChange: (value: SiteSettings) => void;
  canLeave: () => boolean;
  locale: CmsLocale;
}) {
  const { data: club } = useResource<ClubSettings | null>("/api/club");
  const { capabilities } = useCurrentUser();
  const branding = value.branding;
  const resolved = resolveWebsiteBranding(value);
  const mark = resolved.mark ? templateBrands[resolved.mark] : undefined;
  const image = resolved.logoId
    ? {
        src: `/media/${resolved.logoId}`,
        alt: resolved.logoAlt || club?.name || "Club logo",
      }
    : mark;
  function change(next: Partial<SiteSettings["branding"]>) {
    onChange({ ...value, branding: { ...branding, ...next } });
  }
  return (
    <section className="website-branding" aria-label="Logo and browser icon">
      <p className="field-help">
        Your shared identity appears on website pages, public forms and sign-in.
      </p>
      <div className="website-branding-grid">
        <div className="website-branding-controls">
          <fieldset className="website-branding-field" aria-label="Club logo">
            <legend>Club logo</legend>
            <MediaPicker
              label="Choose club logo"
              value={branding.logoId ?? ""}
              onChange={(logoId) => change({ logoId: logoId || null })}
              onSelect={(asset) =>
                change({ logoId: asset.id, logoAlt: asset.alt.slice(0, 250) })
              }
            />
            {branding.logoId ? (
              <>
                <label>
                  Logo alternative text
                  <input
                    value={branding.logoAlt}
                    maxLength={250}
                    placeholder={club?.name || "Your club name"}
                    onChange={(event) =>
                      change({ logoAlt: event.target.value })
                    }
                  />
                </label>
                <label className="website-settings-check">
                  <input
                    type="checkbox"
                    checked={resolved.showName}
                    onChange={(event) =>
                      change({ showName: event.target.checked })
                    }
                  />
                  Show club name beside the logo
                </label>
              </>
            ) : (
              <label>
                Logo style
                <select
                  value={branding.mark}
                  onChange={(event) =>
                    change({
                      mark: websiteBrandingSchema.shape.mark.parse(
                        event.target.value,
                      ),
                    })
                  }
                >
                  <option value="template">Use the theme's mark</option>
                  <option value="none">Club name only</option>
                  <option value="rotary">Rotary mark</option>
                  <option value="rotaract">Rotaract mark</option>
                </select>
              </label>
            )}
            <p className="field-help">
              {branding.logoId
                ? "Use a public image before publishing. Alternative text describes your logo to screen readers."
                : "Choose your own logo, or keep a mark with your club name."}
            </p>
          </fieldset>
          <fieldset
            className="website-branding-field"
            aria-label="Browser icon"
          >
            <legend>Browser icon</legend>
            <MediaPicker
              label="Choose browser icon"
              value={branding.iconId ?? ""}
              onChange={(iconId) => change({ iconId: iconId || null })}
            />
            <p className="field-help">
              A small square image for browser tabs and bookmarks.
            </p>
          </fieldset>
        </div>
        <div className="website-branding-sample">
          <div
            className="website-branding-preview"
            aria-label="Branding preview"
          >
            <span className="website-preview-caption">
              Logo &amp; icon preview
            </span>
            <div
              className="website-browser-tab-preview"
              aria-label="Browser tab preview"
            >
              {branding.iconId ? (
                <Image
                  src={`/media/${branding.iconId}`}
                  alt=""
                  width={18}
                  height={18}
                  unoptimized
                />
              ) : (
                <span
                  className="website-browser-tab-placeholder"
                  aria-hidden="true"
                />
              )}
              <span>{club?.name || "Your club"}</span>
              <span aria-hidden="true">×</span>
            </div>
            <div
              className="website-identity-sample"
              style={websiteStyle(value)}
            >
              {image && (
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={240}
                  height={90}
                  unoptimized
                />
              )}
              {(resolved.showName || !image) && (
                <strong>{club?.name || "Your club"}</strong>
              )}
            </div>
            <p className="field-help">
              Sample of your draft identity. Your published website stays
              unchanged until you publish.
            </p>
          </div>
          <p className="field-help">
            Club name: <strong>{club?.name || "Your club"}</strong>.{" "}
            {capabilities.includes("settings.manage") ? (
              <Link
                href="/admin/settings?tab=general"
                onClick={(event) => {
                  if (!canLeave()) event.preventDefault();
                }}
              >
                Edit club details
              </Link>
            ) : (
              "A club settings manager can change this name."
            )}
          </p>
          <details className="website-branding-help">
            <summary>Where will this logo appear?</summary>
            <p className="field-help">
              Shared branding is used on your website, standalone forms, sign-in
              and membership pages. A logo chosen in a header or footer block
              overrides it. Change those in{" "}
              <Link
                href={`/admin/website?tab=parts&locale=${locale}`}
                onClick={(event) => {
                  if (!canLeave()) event.preventDefault();
                }}
              >
                Header &amp; footer
              </Link>
              . Standalone event pages keep their own design.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
