import {
  duplicateInput,
  restoreInput,
  revisionReadInput,
} from "@/features/cms/cms_commands";
import { defaultSiteSettings } from "@/features/cms/cms_schemas";
import { operation } from "./operation";
import { exampleId } from "./examples";
import { importReceiptSchema } from "./import_schemas";
import { websiteContextOutput, websiteDetailOutput } from "./response_schemas";
import {
  websiteCopyInput,
  websiteRevisionOutput,
  websiteSettingsInput,
} from "./website_management_schemas";

export const websiteManagementOperations = [
  operation(
    {
      name: "website_revision_get",
      method: "GET",
      path: "/website/content/{id}/revisions/{revisionId}",
      scope: "website:read",
      description:
        "Read one retained revision in its exact page and language using revision IDs from website_get. Includes content, never author identity. Reading does not restore or publish it.",
      input: revisionReadInput,
      output: websiteRevisionOutput,
      example: { id: exampleId, locale: "en", revisionId: exampleId },
    },
    async ({ services, principal }, input) =>
      services.cms.revision(principal.actor, input),
  ),
  operation(
    {
      name: "website_restore",
      method: "PATCH",
      path: "/website/content/{id}/restore",
      scope: "website:manage",
      description:
        "Restore a retained revision into a new private draft. Read website_get for the current expectedRevisionId; revisionId chooses the historical version. Retries with an old expectedRevisionId conflict without adding another draft. CustomCode cannot be restored by automation. The published revision stays unchanged.",
      input: restoreInput,
      output: websiteDetailOutput,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        revisionId: exampleId,
      },
    },
    async ({ principal }, input) => {
      const { websiteManagement } =
        await import("./website_management_service");
      return websiteManagement.restore(principal, input);
    },
  ),
  operation(
    {
      name: "website_duplicate",
      method: "POST",
      path: "/website/content/{id}/copies",
      scope: "website:manage",
      description:
        "Copy the exact current saved page or reusable section into a private draft with a new title and unused slug. Use a stable requestId for identical retries; returns an import receipt with the new content ID. Cannot copy CustomCode, shared header/footer singletons or event pages. Nothing is published.",
      input: websiteCopyInput,
      output: importReceiptSchema,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        requestId: exampleId,
        title: "Community projects copy",
        slug: "community-projects-copy",
      },
    },
    async ({ principal }, input) => {
      const { websiteManagement } =
        await import("./website_management_service");
      return websiteManagement.duplicate(principal, input);
    },
  ),
  operation(
    {
      name: "website_locale_create",
      method: "POST",
      path: "/website/content/{id}/languages",
      scope: "website:manage",
      description:
        "Add a missing language to existing content as a private empty draft (headers/footers receive their native starter). This does not translate or copy another language. Existing languages return a conflict and are never overwritten; use website_save to prepare the new language's content.",
      input: duplicateInput,
      output: websiteDetailOutput,
      example: {
        id: exampleId,
        locale: "fr",
        title: "Nos projets",
        slug: "nos-projets",
      },
    },
    async ({ principal }, input) => {
      const { websiteManagement } =
        await import("./website_management_service");
      return websiteManagement.addLocale(principal, input);
    },
  ),
  operation(
    {
      name: "website_settings_save",
      method: "PATCH",
      path: "/website/settings",
      scope: "website:settings",
      description:
        "Save private website settings: homepage, menus, shared header/footer selection, branding, appearance and search/share metadata. Read website_context, preserve unrelated settings and templateSetup records, and use its site.version as expectedVersion. Referenced content must belong to this club and language. Does not activate appearance, install templates, publish the website or make media public.",
      input: websiteSettingsInput,
      output: websiteContextOutput.shape.site,
      example: {
        locale: "en",
        expectedVersion: 0,
        settings: defaultSiteSettings,
      },
    },
    async ({ principal }, input) => {
      const { websiteManagement } =
        await import("./website_management_service");
      return websiteManagement.saveSettings(principal, input);
    },
  ),
];
