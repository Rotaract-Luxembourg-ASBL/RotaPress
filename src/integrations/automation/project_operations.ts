import { z } from "zod";
import {
  projectContentSchema,
  projectSaveSchema,
  type ProjectDto,
} from "@/features/projects/project_schemas";
import { operation, pagination, pageMetadata } from "./operation";
import { receiptOperation } from "./receipt_operation";
import { requireReceiptCapability } from "./receipt_authority";
import type { Transaction } from "@/core/authorization/AuthorizationService";
import type { AutomationContext } from "./operation";
import { pageOutput } from "./response_schemas";
import { publicationConfirmation } from "./publication_policy";
import { exampleId } from "./examples";

const projectOutput = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  version: z.int().positive(),
  draft: projectContentSchema,
  published: projectContentSchema.nullable(),
  changed: z.boolean(),
  archived: z.boolean(),
  reviewUrl: z.string(),
});
const idInput = z.strictObject({ id: z.uuid() });
const projectAuthority =
  (capability: "cms.edit" | "cms.publish") =>
  async (context: AutomationContext, _input: unknown, tx: Transaction) => {
    await requireReceiptCapability(capability)(context, _input, tx);
    await context.services.authorization.features.require(
      context.principal.organizationId,
      "projects",
      tx,
    );
  };
const example = {
  title: "Neighbourhood garden",
  summary: "A club initiative to create a shared green space.",
  story:
    "Describe the verified purpose, volunteering work and next steps here.",
  status: "planned",
  location: "",
  startDate: null,
  endDate: null,
  coverImageId: null,
  outcomes: "",
  linkLabel: "",
  linkUrl: "",
};
function content(project: ProjectDto) {
  return {
    id: project.id,
    slug: project.slug,
    version: project.version,
    draft: project.draft,
    published: project.published,
    changed: project.changed,
    archived: project.archived,
    reviewUrl: `/admin/projects/${project.id}`,
  };
}

export const projectOperations = [
  operation(
    {
      name: "projects_list",
      effect: "read",
      method: "GET",
      path: "/projects",
      scope: "projects:read",
      description:
        "List project stories, private drafts and published snapshots. Projects showcase volunteering and initiatives; they do not manage registrations or calendar schedules.",
      input: pagination,
      output: pageOutput(projectOutput),
      example: { limit: 20, offset: 0 },
    },
    async ({ services, principal }, { offset, limit }) => {
      const result = await services.projects.query(principal.actor, {
        offset,
        pageSize: limit,
        status: "all",
      });
      return {
        items: result.items.map(content),
        ...pageMetadata(result.total, { offset, limit }),
      };
    },
  ),
  operation(
    {
      name: "projects_get",
      effect: "read",
      method: "GET",
      path: "/projects/{id}",
      scope: "projects:read",
      description:
        "Read a project's complete saved draft, current version and published snapshot before editing or requested publication.",
      input: idInput,
      output: projectOutput,
      example: { id: exampleId },
    },
    async ({ services, principal }, { id }) =>
      content(await services.projects.detail(principal.actor, id)),
  ),
  receiptOperation(
    {
      name: "projects_create",
      effect: "draft",
      method: "POST",
      path: "/projects",
      scope: "projects:write",
      description:
        "Create a private project story from verified facts. Dates, cover image, outcomes and link are optional. Never invent impact figures or completed work.",
      input: projectContentSchema,
      output: projectOutput,
      example,
    },
    projectAuthority("cms.edit"),
    async ({ services, principal }, input, tx) =>
      content(await services.projects.create(principal.actor, input, tx)),
  ),
  receiptOperation(
    {
      name: "projects_save",
      effect: "draft",
      method: "PATCH",
      path: "/projects/{id}",
      scope: "projects:write",
      description:
        "Save a complete project draft using expectedVersion from projects_get. Preserve unrelated fields. The current public story remains unchanged until separately published.",
      input: projectSaveSchema.extend(idInput.shape),
      output: projectOutput,
      example: { id: exampleId, expectedVersion: 1, content: example },
    },
    projectAuthority("cms.edit"),
    async ({ services, principal }, { id, ...input }, tx) =>
      content(
        await services.projects.change(principal.actor, id, "save", input, tx),
      ),
  ),
  receiptOperation(
    {
      name: "projects_publish",
      effect: "publish",
      method: "POST",
      path: "/projects/{id}/publish",
      scope: "projects:publish",
      description:
        "Publish the exact saved project story only when the user explicitly requests it. Requires its current expectedVersion and confirmed=true. Cover media must already be public; this call never changes image visibility or publishes other content.",
      input: idInput.extend({
        expectedVersion: z.int().positive(),
        confirmed: publicationConfirmation,
      }),
      output: projectOutput,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    projectAuthority("cms.publish"),
    async ({ services, principal }, { id, ...input }, tx) =>
      content(
        await services.projects.change(
          principal.actor,
          id,
          "publish",
          input,
          tx,
        ),
      ),
  ),
  ...(["archive", "restore", "unpublish"] as const).map((action) =>
    receiptOperation(
      {
        name: `projects_${action}`,
        effect: action === "restore" ? "draft" : "archive",
        method: "POST",
        path: `/projects/{id}/${action}`,
        scope: "projects:manage",
        description: `${action} the exact requested project using its current version. History is retained and restored projects remain private drafts.`,
        input: idInput.extend({
          expectedVersion: z.int().positive(),
          confirmed: z.literal(true),
        }),
        output: projectOutput,
        example: { id: exampleId, expectedVersion: 1, confirmed: true },
      },
      projectAuthority("cms.publish"),
      async ({ services, principal }, { id, expectedVersion }, tx) =>
        content(
          await services.projects.change(
            principal.actor,
            id,
            action,
            { expectedVersion, confirmed: true },
            tx,
          ),
        ),
    ),
  ),
];
