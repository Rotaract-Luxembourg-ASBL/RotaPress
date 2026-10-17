/** Authenticated binary transport of the same scoped private export reader. */
export function privateExportDownloadPath() {
  const common = {
    summary: "Download a private response export",
    description:
      "Use the same REST token, MCP key or MCP OAuth bearer that created the export and its responses:export grant. This private download endpoint accepts the originating transport; general REST operations still require REST credentials. Current membership, form authority, content generation and ten-minute expiry are checked on every request. No public URL, query token or browser session fallback is accepted.",
    tags: ["responses"],
    "x-rotapress-scope": "responses:export",
    "x-rotapress-operation": "responses_export_read",
    "x-rotapress-read-only": true,
    security: [{ privateExportConnection: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description:
          "Private CSV attachment, at most 10 MiB, with no-store caching. HEAD returns these headers without bytes.",
        headers: {
          "Content-Disposition": { schema: { type: "string" } },
          "Content-Length": { schema: { type: "integer", maximum: 10485760 } },
          "Cache-Control": { schema: { const: "private, no-store" } },
        },
        content: {
          "text/csv": {
            schema: { type: "string", format: "binary", maxLength: 10485760 },
          },
        },
      },
      ...Object.fromEntries(
        [
          [400, "Invalid export ID or unexpected query parameters."],
          [401, "Missing, expired or revoked bearer connection."],
          [403, "Denied origin, scope, membership or current form access."],
          [404, "The referenced form is no longer available."],
          [409, "The club content generation has changed."],
          [
            410,
            "Export unavailable, expired or created by another connection.",
          ],
          [422, "Stored export integrity check failed."],
          [429, "Connection request quota exceeded."],
        ].map(([status, description]) => [
          String(status),
          {
            description,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["error"],
                  properties: { error: { type: "string" } },
                  additionalProperties: false,
                },
              },
            },
          },
        ]),
      ),
    },
  };
  return {
    get: { ...common, operationId: "responses_export_download" },
    head: { ...common, operationId: "responses_export_head" },
  };
}
