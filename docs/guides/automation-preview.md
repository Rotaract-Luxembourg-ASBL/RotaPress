# Visual review through AI

An assistant can inspect real screenshots of a **saved private page draft** through
`website_preview`. The result uses the same renderer and CSS as the website, including
the current published theme, header, footer and shared sections. It does not save,
publish, change media visibility or execute custom JavaScript.

Grant both `website:read` and `website:preview` to the connection. Include
`media:inspect` only when the assistant should see private image bytes. Images already
public remain available without that extra grant. Current staff, CMS and event access
still apply; a key or OAuth scope cannot bypass those permissions.

## Review a page

1. Ask the assistant to read the page with `website_get` and preserve its current
   `draft.id` as `expectedRevisionId`.
2. Save any proposed changes as a draft.
3. Call `website_preview` using the returned saved revision ID, first with
   `device: "desktop"`, then `device: "phone"`.
4. Inspect the returned image and warnings. Where `nextOffsetY` is present, call
   again with that offset to review the next portion of the same saved revision.
5. Correct the draft and repeat the affected preview. Open `reviewUrl` in your own
   signed-in browser for interactive checks and manual publication.

Example arguments:

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "locale": "en",
  "expectedRevisionId": "10000000-0000-4000-8000-000000000002",
  "device": "phone",
  "offsetY": 0
}
```

REST uses `POST /api/v1/website/content/{id}/preview`; omit `id` from the JSON body.
The REST response contains a base64 WebP image and its dimensions. MCP returns the
same picture as an image content block, so a client with vision support can inspect
it without interpreting encoded text. Clients without image support can use the
metadata and authorized browser review link.

The result identifies the saved revision, capture time, device, page height and
visible offset. `layoutOverflow` reports horizontal document overflow; it is a
useful signal, not a complete accessibility or design assessment. Long-page images
are limited to 2,400 pixels per call, with offsets through 30,000 pixels. A concurrent
page or event edit returns `409`; reread and review the new revision.

## What the image shows

The page's layout, text, images and native styling are real rendered pixels.
Custom code, forms, calendar controls, registration and other interactive controls
remain inactive or show their normal preview placeholder. Sliders show their initial
frame. This review cannot verify submissions, payments, keyboard interactions or
the behavior of custom JavaScript. The response makes those limitations explicit.

Private media is included only when the connection has `media:inspect`, the image
is referenced by the authorized page snapshot and the current actor can read it.
Unavailable images produce a warning. Published collection data can change between
captures; the saved page revision itself is checked before and after rendering.

Images are returned only to the authenticated caller. They are not uploaded to the
media library, stored as public files, or given anonymous share URLs. Treat pixels
containing private draft content as private data in your AI client's history.

## Runtime and isolation

The application's Node process uses pinned Playwright Chromium locally; this is
not an arbitrary-URL screenshot API or a separate browser service. Development uses
`node scripts/pnpm.mjs browser:install`. Hosted runtime images need the matching
Chromium binary and its operating-system libraries. Linux execution requires the
Chromium sandbox to work for the unprivileged application user. Check the current
[Playwright Docker requirements](https://playwright.dev/docs/docker) when changing
the container or host security profile.

The renderer creates a one-use, 30-second capability for one already-authorized
snapshot. The capability travels in an instance-local server request header and
never enters a URL, AI response or browser cookie. The private document rejects
ordinary requests. The headless browser receives no session, API key or OAuth token.
Its process environment excludes database, authentication and provider credentials;
only the operating-system paths and locale needed to launch Chromium are retained.
All application and custom JavaScript is disabled. Browser requests are fulfilled
only from bounded local CSS/fonts, reviewed public application images and authorized
media; arbitrary destinations, API calls, scripts, downloads and frames are blocked.

Only one capture runs per Node process, with eight calls per connection per minute,
bounded document/asset sizes, a 20-second browser deadline and a 600 KiB output limit.
The caller's connection, grants, current permissions and saved revision are checked
again before pixels are released. Revocation during rendering discards the result.
Missing Chromium or an unsupported runtime returns `503`; a busy renderer returns
`429`. Retry with backoff after addressing the reported cause. Do not disable
isolation controls to make a hosted preview work.
