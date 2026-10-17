import type { NextConfig } from "next";

const policy =
  "default-src 'self'; script-src 'self' 'unsafe-inline'" +
  (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
  "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'";

const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  serverExternalPackages: [
    "pg",
    "nodemailer",
    "playwright-core",
    "mediainfo.js",
    "pdf-lib",
  ],
  outputFileTracingIncludes: {
    "/api/admin/media/uploads/*": [
      "./scripts/media-inspect.mjs",
      "./node_modules/mediainfo.js/**/*",
      "./node_modules/pdf-lib/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./.local/**/*", "./.data/**/*", "./.env*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `${policy}; frame-ancestors 'none'`,
          },
        ],
      },
      // File selection previews use browser-local object URLs in administration.
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `${policy.replace("img-src 'self' data:", "img-src 'self' data: blob:")}; frame-ancestors 'none'`,
          },
        ],
      },
      // Only authorized preview documents may appear inside the same-origin editor.
      // Session, current scope and expiry checks still run on every preview request.
      {
        source: "/automation-preview",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'",
          },
        ],
      },
      ...["/admin/website/preview", "/admin/website/:id/preview"].map(
        (source) => ({
          source,
          headers: [
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            {
              key: "Content-Security-Policy",
              value: `${policy}; frame-ancestors 'self'`,
            },
          ],
        }),
      ),
    ];
  },
};
export default config;
