import { operation } from "./operation";
import { exampleId } from "./examples";
import { websiteContextOutput, websiteDetailOutput } from "./response_schemas";
import {
  websitePublishInput,
  websiteSettingsPublishInput,
} from "./website_management_schemas";

export const websitePublicationOperations = [
  operation(
    {
      name: "website_publish",
      method: "PATCH",
      path: "/website/content/{id}/publish",
      scope: "website:publish",
      description:
        "Publish one exact saved page, language, shared header/footer or reusable section ONLY when the user explicitly asks. Read website_get first and pass its current expectedRevisionId and confirmed=true. Existing media, form, reference, slug and event-publication checks apply. CustomCode cannot be published by automation. Shared content may affect several published pages. Does not publish other drafts, menus or appearance; an event page still follows event visibility.",
      input: websitePublishInput,
      output: websiteDetailOutput,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        confirmed: true,
      },
    },
    async ({ principal }, input) => {
      const { websiteManagement } =
        await import("./website_management_service");
      return websiteManagement.publish(principal, input);
    },
  ),
  operation(
    {
      name: "website_settings_publish",
      method: "PATCH",
      path: "/website/settings/publish",
      scope: "website:publish",
      description:
        "Activate requested saved website settings ONLY after an explicit user request. Read website_context and pass site.version. Choose scope=menu for homepage/menu changes alone; scope=settings activates all saved branding, appearance, shared-part selection and search/share settings. Existing referenced pages/parts must already be published and media public. Does not publish any page drafts or change media visibility.",
      input: websiteSettingsPublishInput,
      output: websiteContextOutput.shape.site,
      example: {
        locale: "en",
        expectedVersion: 1,
        scope: "menu",
        confirmed: true,
      },
    },
    async ({ principal }, input) => {
      const { websiteManagement } =
        await import("./website_management_service");
      return websiteManagement.publishSettings(principal, input);
    },
  ),
];
