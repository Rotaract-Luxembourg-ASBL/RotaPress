import { z } from "zod";
import { createHash } from "node:crypto";
import { DomainError } from "@/core/DomainError";
import { operation, type AutomationContext } from "./operation";
import { mediaDetailOutput, mediaUploadMetadata } from "./media_schemas";
import { referenceUrlSchema } from "./reference_content";
import { sourceRulesAllow } from "./source_rules";
import { uploadAutomationImage } from "./media_upload";
import { exampleId } from "./examples";

const inputSchema = mediaUploadMetadata.extend({
  url: referenceUrlSchema,
  rightsConfirmed: z.literal(true),
});

async function requireImageSource(
  context: AutomationContext,
  url: string,
  refresh = false,
) {
  const principal =
    refresh && context.reauthorize
      ? await context.reauthorize()
      : context.principal;
  if (
    principal.actor.userId !== context.principal.actor.userId ||
    principal.organizationId !== context.principal.organizationId ||
    principal.keyId !== context.principal.keyId
  )
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Reconnect for the current club before importing an image.",
      403,
    );
  for (const scope of ["sources:read", "media:write"] as const)
    if (!principal.scopes.includes(scope))
      throw new DomainError(
        "AUTOMATION_SCOPE_REQUIRED",
        `This connection needs ${scope} to import a reference image.`,
        403,
      );
  if (!sourceRulesAllow(url, principal.sourceOrigins))
    throw new DomainError(
      "SOURCE_ORIGIN_DENIED",
      "Approve this image's reference domain before importing it.",
      403,
    );
  const current = await context.services.authorization.require(
    principal.actor,
    "cms.edit",
  );
  if (current.organizationId !== principal.organizationId)
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Reconnect for the current club before importing an image.",
      403,
    );
  return principal;
}

export const sourceImageOperations = [
  operation(
    {
      name: "source_image_import",
      method: "POST",
      path: "/sources/images",
      scope: "media:write",
      requiredScopes: ["sources:read"],
      description:
        "Import one rights-approved public PNG/JPEG/WebP from an approved reference domain, up to 5 MiB. Requires sources:read and media:write. Honors robots, pins public DNS and rejects redirects; no cookies or scripts. rightsConfirmed=true confirms reuse eligibility. A stable requestId makes identical image/metadata retries safe. Returns a normalized private media asset for media_inspect and native blocks; never publishes it.",
      input: inputSchema,
      output: mediaDetailOutput,
      example: {
        requestId: exampleId,
        url: "https://www.rotary.org/club-photo.jpg",
        filename: "club-photo.jpg",
        alt: "Describe the approved club photo accurately.",
        rightsConfirmed: true,
      },
    },
    async (context, { url, rightsConfirmed, ...metadata }) => {
      await requireImageSource(context, url);
      const scopedContext: AutomationContext = {
        ...context,
        reauthorize: () => requireImageSource(context, url, true),
      };
      return uploadAutomationImage(
        scopedContext,
        metadata,
        async () => {
          const image = await context.sources.importImage(
            url,
            context.principal.sourceOrigins,
          );
          await requireImageSource(context, url, true);
          return image;
        },
        undefined,
        createHash("sha256")
          .update(JSON.stringify([new URL(url).href, rightsConfirmed]))
          .digest("hex"),
      );
    },
  ),
];
