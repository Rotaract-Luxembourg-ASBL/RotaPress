"use client";

import { websiteStyle, websiteThemes } from "@/features/cms/appearance";
import type { SiteSettings } from "@/features/cms/cms_schemas";

/** Isolated sample of the same settings used by the public renderer. */
export function WebsiteStylePreview({ value }: { value: SiteSettings }) {
  const theme = websiteThemes[value.themeId];
  return (
    <aside
      className="website-style-preview"
      aria-label="Style preview"
      style={websiteStyle(value)}
    >
      <span className="website-style-preview-label">Live style sample</span>
      <div className="website-style-preview-card">
        <span className="website-style-preview-kicker">Your community</span>
        <h4>Good people. Shared purpose.</h4>
        <p>See how your colors and headings work together before saving.</p>
        <span className="website-style-preview-button">Button style</span>
      </div>
      <div
        className="website-style-swatches"
        aria-label="Current website palette"
      >
        {[
          ["Accent", value.accentColor ?? theme.accent],
          ["Background", theme.paper],
          ["Text", theme.ink],
        ].map(([name, color]) => (
          <span key={name}>
            <i style={{ background: color }} aria-hidden="true" />
            {name}
            <code>{color}</code>
          </span>
        ))}
      </div>
      <p className="website-style-preview-note">
        Sample only. Administration keeps its own appearance.
      </p>
    </aside>
  );
}
