import type {
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

/** Only validated image-producing operations can emit pixels. Keep text readable. */
export function imageToolContent(
  operation: string,
  result: Record<string, unknown>,
  ok: boolean,
): (TextContent | ImageContent)[] {
  if (ok && ["media_inspect", "website_preview"].includes(operation)) {
    const data = result.data;
    if (data && typeof data === "object" && "image" in data) {
      const image = data.image;
      if (
        image &&
        typeof image === "object" &&
        "data" in image &&
        "mimeType" in image &&
        typeof image.data === "string" &&
        image.mimeType === "image/webp"
      ) {
        return [
          {
            type: "text",
            text: JSON.stringify({
              ...result,
              data: {
                ...data,
                image: { ...image, data: "[image content attached]" },
              },
            }),
          },
          { type: "image", data: image.data, mimeType: image.mimeType },
        ];
      }
    }
  }
  return [{ type: "text", text: JSON.stringify(result) }];
}
