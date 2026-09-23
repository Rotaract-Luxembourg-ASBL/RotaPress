"use client";
import Link from "next/link";
import type { SiteSettings } from "@/features/cms/cms_schemas";
import { defaultSiteSeo } from "@/features/cms/site_seo";
import { MediaPicker } from "./media-picker";

export function WebsiteSeoSettings({
  value,
  onChange,
}: {
  value: SiteSettings;
  onChange: (value: SiteSettings) => void;
}) {
  const seo = value.seo ?? defaultSiteSeo;
  function change(next: Partial<typeof seo>) {
    onChange({ ...value, seo: { ...seo, ...next } });
  }
  return (
    <section
      className="panel form-stack"
      aria-label="Website search and sharing settings"
    >
      <div>
        <p className="eyebrow">Search & sharing</p>
        <h2>Help people find your club</h2>
        <p>
          Defaults for this website language. Individual pages and events keep
          their own titles, descriptions and sharing images.
        </p>
      </div>
      <label>
        Default search title
        <input
          value={seo.title}
          maxLength={160}
          placeholder="Use the club name"
          onChange={(e) => change({ title: e.target.value })}
        />
      </label>
      <label>
        Default search description
        <textarea
          value={seo.description}
          rows={3}
          maxLength={300}
          placeholder="Describe your club in one or two sentences"
          onChange={(e) => change({ description: e.target.value })}
        />
      </label>
      <div className="seo-search-preview">
        <span>Search preview</span>
        <h3>{seo.title || "Your club name"}</h3>
        <p>
          {seo.description ||
            "Your club introduction appears when a page has no description."}
        </p>
      </div>
      <MediaPicker
        label="Default sharing image"
        value={seo.socialImageId ?? ""}
        onChange={(id) => change({ socialImageId: id || null })}
      />
      <p className="field-help">
        Choose a public image. A page’s sharing image takes precedence.
      </p>
      <label className="forms-check">
        <input
          type="checkbox"
          checked={seo.indexable}
          onChange={(e) => change({ indexable: e.target.checked })}
        />
        <span>Allow search engines to index published public pages</span>
      </label>
      <p className="field-help">
        Private content always requires authorization. Search visibility is a
        crawler preference, not access control.
      </p>
      <details>
        <summary>Search Console verification</summary>
        <label>
          Google verification token
          <input
            value={seo.googleVerification}
            maxLength={160}
            onChange={(e) => change({ googleVerification: e.target.value })}
          />
          <span className="field-help">
            Paste only the content value from your Google site verification meta
            tag. No HTML.
          </span>
        </label>
      </details>
      <p className="field-help">
        Save this draft, then publish the website to apply it.{" "}
        <Link href="/admin/settings?tab=domains">
          Domains and canonical address
        </Link>{" "}
        are in Settings. Page-specific SEO is in each page’s settings.
      </p>
    </section>
  );
}
