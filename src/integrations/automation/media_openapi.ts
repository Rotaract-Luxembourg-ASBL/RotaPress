/** Binary transport for the same media_upload mutation; it adds no extra authority. */
export function binaryMediaUploadPath() {
  return {
    post: {
      operationId: "media_upload_binary",
      summary: "Upload an original image as a binary body",
      description:
        "Authenticated binary variant of media_upload, up to 5 MiB and 20 million pixels. X-RotaPress-Upload is unpadded canonical base64url of UTF-8 JSON matching media_upload input except mimeType and data: requestId, filename and optional title/alt/caption/tags/collection. The Content-Type must match the file signature. PNG, JPEG and WebP normalize to private WebP. Same-actor, same-requestId retries return the original asset; changed content or another actor is rejected. Publication and visibility remain manual.",
      tags: ["media"],
      "x-rotapress-scope": "media:write",
      "x-rotapress-operation": "media_upload",
      "x-rotapress-read-only": false,
      security: [{ staffConnection: [] }],
      parameters: [
        {
          name: "X-RotaPress-Upload",
          in: "header",
          required: true,
          description:
            "Unpadded base64url JSON upload metadata; no URL or arbitrary destination is accepted.",
          schema: {
            type: "string",
            minLength: 1,
            maxLength: 8192,
            pattern: "^[A-Za-z0-9_-]+$",
          },
        },
      ],
      requestBody: {
        required: true,
        content: Object.fromEntries(
          ["image/png", "image/jpeg", "image/webp"].map((type) => [
            type,
            {
              schema: {
                type: "string",
                format: "binary",
                maxLength: 5 * 1024 * 1024,
              },
            },
          ]),
        ),
      },
      responses: {
        "200": {
          description:
            "Private uploaded image and current metadata revision; retry-safe for this actor and requestId.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/media_upload_response" },
            },
          },
        },
        ...Object.fromEntries(
          [
            [400, "Invalid metadata or unexpected query parameters."],
            [401, "Missing, expired or revoked bearer connection."],
            [403, "Denied origin, scope, membership or club access."],
            [404, "The upload retry refers to an image that was deleted."],
            [
              408,
              "Binary body did not finish within the 20-second upload deadline.",
            ],
            [
              409,
              "This requestId was used with another actor or different content.",
            ],
            [413, "Actual streamed request body exceeds 5 MiB."],
            [
              415,
              "Use image/png, image/jpeg or image/webp with a raw binary body.",
            ],
            [
              422,
              "Invalid file signature, image decoding, animation, dimensions or size.",
            ],
            [
              429,
              "Upload quota exceeded. Wait before retrying; the daily club limit is 200 attempts.",
            ],
            [
              500,
              "The request could not be completed. Internal details are not returned.",
            ],
          ].map(([status, description]) => [
            String(status),
            {
              description,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["error"],
                    additionalProperties: false,
                    properties: { error: { type: "string" } },
                  },
                },
              },
            },
          ]),
        ),
      },
    },
  };
}
