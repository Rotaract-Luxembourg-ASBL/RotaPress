import { z } from "zod";
import {
  projectContentSchema,
  projectSaveSchema,
  type ProjectDto,
} from "@/features/projects/project_schemas";
import { operation, page, pagination } from "./operation";
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
      method: "GET",
      path: "/projects",
      scope: "projects:read",
      description:
        "List project stories, private drafts and published snapshots. Projects showcase volunteering and initiatives; they do not manage registrations or calendar schedules.",
      input: pagination,
      output: pageOutput(projectOutput),
      example: { limit: 20, offset: 0 },
    },
    async ({ services, principal }, input) =>
      page((await services.projects.list(principal.actor)).map(content), input),
  ),
  operation(
    {
      name: "projects_get",
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
  operation(
    {
      name: "projects_create",
      method: "POST",
      path: "/projects",
      scope: "projects:write",
      description:
        "Create a private project story from verified facts. Dates, cover image, outcomes and link are optional. Never invent impact figures or completed work. Read projects_list after an uncertain create before retrying to avoid duplicates.",
      input: projectContentSchema,
      output: projectOutput,
      example,
    },
    async ({ services, principal }, input) =>
      content(await services.projects.create(principal.actor, input)),
  ),
  operation(
    {
      name: "projects_save",
      method: "PATCH",
      path: "/projects/{id}",
      scope: "projects:write",
      description:
        "Save a complete project draft using expectedVersion from projects_get. Preserve unrelated fields. The current public story remains unchanged until separately published.",
      input: projectSaveSchema.extend(idInput.shape),
      output: projectOutput,
      example: { id: exampleId, expectedVersion: 1, content: example },
    },
    async ({ services, principal }, { id, ...input }) =>
      content(
        await services.projects.change(principal.actor, id, "save", input),
      ),
  ),
  operation(
    {
      name: "projects_publish",
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
    async ({ services, principal }, { id, ...input }) =>
      content(
        await services.projects.change(principal.actor, id, "publish", input),
      ),
  ),
];
