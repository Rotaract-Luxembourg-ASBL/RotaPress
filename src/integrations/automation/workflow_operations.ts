import { z } from "zod";
import { operation } from "./operation";
import { exampleId } from "./examples";
import { platformInstructions } from "./platform_instructions";
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
      name: "automation_task_prompt",
      effect: "read",
      method: "POST",
      path: "/prompts/platform_task",
      scope: null,
      readOnly: true,
      description:
        "Get the whole-platform workflow, scope boundaries, retry receipts and private export instructions. Returns guidance only; it does not schedule or execute a task.",
      input: z.strictObject({}),
      output,
      example: {},
    },
    async () => ({ prompt: platformInstructions }),
  ),
  operation(
    {
      name: "automation_website_prompt",
      effect: "read",
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
      effect: "read",
      path: "/prompts/prepare_event",
      method: "POST",
      scope: null,
      readOnly: true,
      description:
        "Get a workflow for preparing event pages, forms, media and explicitly requested operational settings. Returns instructions only.",
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
      effect: "read",
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
      effect: "read",
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
