"use client";

import Image from "next/image";
import Link from "next/link";
import type { CmsLocale, SiteSettings } from "@/features/cms/cms_schemas";
import { resolveWebsiteBranding } from "@/features/cms/site_identity";
import { templateBrands } from "@/features/cms/template_brand";
import { websiteBrandingSchema } from "@/features/cms/website_branding";
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
    <section
      className="website-branding"
      aria-labelledby="website-branding-title"
    >
      <div className="form-stack">
        <span className="eyebrow">Shared identity</span>
        <h3 id="website-branding-title">Logo &amp; identity</h3>
        <p className="field-help">
          One identity for your website, standalone forms, sign-in and
          membership pages. Save and preview your choices, then publish the
          website to make them public.
        </p>
      </div>
      <div className="website-branding-grid">
        <div className="form-stack">
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
            <p className="field-help">
              Upload your club signature or choose an image from Media.
              Publishable logos use public images.
            </p>
          </fieldset>
          {branding.logoId && (
            <label>
              Logo alternative text
              <input
                value={branding.logoAlt}
                maxLength={250}
                placeholder={club?.name || "Your club name"}
                onChange={(event) => change({ logoAlt: event.target.value })}
              />
            </label>
          )}
          <label>
            When no club logo is selected
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
              <option value="template">Use the template's mark</option>
              <option value="none">Club name only</option>
              <option value="rotary">Rotary mark</option>
              <option value="rotaract">Rotaract mark</option>
            </select>
          </label>
          <label className="website-settings-check">
            <input
              type="checkbox"
              checked={resolved.showName}
              disabled={!branding.logoId}
              onChange={(event) => change({ showName: event.target.checked })}
            />
            Show club name beside the logo
          </label>
          {!branding.logoId && (
            <p className="field-help">
              The club name stays visible with template marks.
            </p>
          )}
        </div>
        <div className="form-stack">
          <div
            className="website-branding-preview"
            aria-label="Branding preview"
          >
            <span className="eyebrow">Draft identity</span>
            <div>
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
            <span className="field-help">
              Preview only. Your published branding stays in place until you
              publish.
            </span>
          </div>
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
              A square image works best for browser tabs and bookmarks. Choose a
              simple mark that stays recognizable at a small size.
            </p>
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
          </fieldset>
        </div>
      </div>
      <p className="field-help">
        A logo set directly in a header or footer block overrides this shared
        choice. Manage those in{" "}
        <Link
          href={`/admin/website?tab=parts&locale=${locale}`}
          onClick={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          Header &amp; footer
        </Link>
        . Standalone event pages keep their own event design.
      </p>
    </section>
  );
}
