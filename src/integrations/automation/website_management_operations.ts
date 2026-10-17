import { receiptOperation } from "./receipt_operation";
import { websiteManagementFor } from "./WebsiteManagementService";
import {
  duplicateInput,
  restoreInput,
  revisionReadInput,
  revisionListInput,
  revisionListOutput,
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
  websiteArchiveInput,
} from "./website_management_schemas";

export const websiteManagementOperations = [
  operation(
    {
      name: "website_revisions_list",
      effect: "read",
      method: "GET",
      path: "/website/content/{id}/revisions",
      scope: "website:read",
      description:
        "Browse every retained revision for an authorized page and language, with exact totals and pagination. Use these revision IDs with website_revision_get to compare or website_restore to restore. Author identities are never returned.",
      input: revisionListInput,
      output: revisionListOutput,
      example: { id: exampleId, locale: "en", page: 1, pageSize: 30 },
    },
    ({ services, principal }, input) =>
      services.cms.revisionHistory(principal.actor, input),
  ),
  receiptOperation(
    {
      name: "website_archive",
      effect: "archive",
      method: "PATCH",
      path: "/website/content/{id}/archive",
      scope: "website:publish",
      requiredScopes: ["website:manage"],
      description:
        "Archive one identified ordinary club page ONLY after the user explicitly asks to remove it. Requires website:manage and website:publish, current staff publication authority, website_get's current expectedRevisionId and confirmed=true. Rejects multilingual, shared and event content, and pages referenced by draft/published homepage, menu or Events settings. Remove those references deliberately first. Clears publication and public media usage, retains the page/revisions, and never hard-deletes. Use website_pages_restore with its additional website:organize grant to restore archived pages as private drafts; an ordinary archived page can also be copied. Does not archive other pages, publish settings or hide image files.",
      input: websiteArchiveInput,
      output: websiteDetailOutput,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        confirmed: true,
      },
    },
    ({ services, principal }, input, tx) =>
      services.cms.requireMutation(
        principal.actor,
        input.id,
        "cms.publish",
        tx,
      ),
    (context, input, tx) =>
      websiteManagementFor(context).archive(context.principal, input, tx),
  ),
  operation(
    {
      name: "website_revision_get",
      effect: "read",
      method: "GET",
      path: "/website/content/{id}/revisions/{revisionId}",
      scope: "website:read",
      description:
        "Read one retained revision in its exact page and language using revision IDs from website_revisions_list. Includes content, never author identity. Reading does not restore or publish it.",
      input: revisionReadInput,
      output: websiteRevisionOutput,
      example: { id: exampleId, locale: "en", revisionId: exampleId },
    },
    async ({ services, principal }, input) =>
      services.cms.revision(principal.actor, input),
  ),
  receiptOperation(
    {
      name: "website_restore",
      effect: "draft",
      method: "PATCH",
      path: "/website/content/{id}/restore",
      scope: "website:manage",
      description:
        "Restore a retained revision into a new private draft. Read website_get for the current expectedRevisionId; revisionId chooses the historical version. Use a stable requestId to recover the original committed draft after interruption. CustomCode cannot be restored by automation. The published revision stays unchanged.",
      input: restoreInput,
      output: websiteDetailOutput,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        revisionId: exampleId,
      },
    },
    ({ services, principal }, input, tx) =>
      services.cms.requireMutation(principal.actor, input.id, "cms.edit", tx),
    (context, input, tx) =>
      websiteManagementFor(context).restore(context.principal, input, tx),
  ),
  receiptOperation(
    {
      name: "website_duplicate",
      effect: "draft",
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
    ({ services, principal }, input, tx) =>
      services.cms.requireMutation(principal.actor, input.id, "cms.edit", tx),
    (context, input, tx) =>
      websiteManagementFor(context).duplicate(context.principal, input, tx),
  ),
  receiptOperation(
    {
      name: "website_locale_create",
      effect: "draft",
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
    ({ services, principal }, input, tx) =>
      services.cms.requireMutation(principal.actor, input.id, "cms.edit", tx),
    (context, input, tx) =>
      websiteManagementFor(context).addLocale(context.principal, input, tx),
  ),
  receiptOperation(
    {
      name: "website_settings_save",
      effect: "draft",
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
    ({ services, principal }, _input, tx) =>
      services.authorization.require(principal.actor, "cms.edit", tx),
    (context, input, tx) =>
      websiteManagementFor(context).saveSettings(context.principal, input, tx),
  ),
];
