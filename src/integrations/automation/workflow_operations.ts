import { z } from "zod";
import { operation } from "./operation";
import { exampleId } from "./examples";
import {
  workflowInput,
  visualReviewInput,
  nativeWebsitePrompt,
  prepareEventPrompt,
  prepareProjectPrompt,
  visualReviewPrompt,
} from "./workflow_prompts";

const output = z.strictObject({ prompt: z.string() });
export const workflowOperations = [
  operation(
    {
      name: "automation_website_prompt",
      path: "/prompts/plan_native_website",
      method: "POST",
      scope: null,
      readOnly: true,
      description:
        "Get instructions for creating and visually reviewing native website drafts. Returns a prompt; never runs a model or changes content.",
      input: workflowInput,
      output,
      example: {
        brief:
          "Prepare About and Contact pages with our verified club identity.",
        locale: "en",
      },
    },
    async (_context, input) => ({ prompt: nativeWebsitePrompt(input) }),
  ),
  operation(
    {
      name: "automation_event_prompt",
      path: "/prompts/prepare_event",
      method: "POST",
      scope: null,
      readOnly: true,
      description:
        "Get a workflow for preparing event pages, forms, media and human-reviewed settings. Returns instructions only.",
      input: workflowInput,
      output,
      example: {
        brief:
          "Prepare a private community dinner. Ask for date and venue if missing.",
        locale: "en",
      },
    },
    async (_context, input) => ({ prompt: prepareEventPrompt(input) }),
  ),
  operation(
    {
      name: "automation_review_prompt",
      path: "/prompts/review_page_design",
      method: "POST",
      scope: null,
      readOnly: true,
      description:
        "Get the saved-revision desktop and phone visual review workflow. Returns instructions only.",
      input: visualReviewInput,
      output,
      example: { pageId: exampleId, locale: "en" },
    },
    async (_context, input) => ({ prompt: visualReviewPrompt(input) }),
  ),
  operation(
    {
      name: "automation_project_prompt",
      path: "/prompts/prepare_project",
      method: "POST",
      scope: null,
      readOnly: true,
      description:
        "Get instructions for preparing a private volunteering or initiative story with verified facts and outcomes. Returns instructions only.",
      input: workflowInput,
      output,
      example: {
        brief:
          "Prepare a project story for our community garden using only the facts I provide.",
        locale: "en",
      },
    },
    async (_context, input) => ({ prompt: prepareProjectPrompt(input) }),
  ),
];
