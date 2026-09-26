import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { FeatureService } from "../../src/core/features/FeatureService";
import { ProjectService } from "../../src/features/projects/ProjectService";
import { ProjectReader } from "../../src/features/projects/ProjectReader";
import {
  projectContentSchema,
  type ProjectDto,
} from "../../src/features/projects/project_schemas";
import { MediaService } from "../../src/features/media/MediaService";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import type { AutomationScope } from "../../src/integrations/automation/scopes";
import type { Context } from "./luma-sync-fixture";

export function automationProjectChecks(get: () => Context) {
  async function fixture() {
    const c = get();
    const people = await c.club();
    const media = new MediaService(
      c.db,
      c.authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
    );
    const projects = new ProjectService(c.db, c.authorization, media);
    const context = {
      services: { authorization: c.authorization, projects },
      principal: {
        actor: people.owner,
        organizationId: people.scope.organizationId,
        scopes: ["projects:read", "projects:write", "projects:publish"],
      },
    } as unknown as AutomationContext;
    const input = projectContentSchema.parse({
      title: "Synthetic community garden",
      summary: "A verified project summary for the local fixture.",
    });
    const run = (name: string, value: unknown, scopes?: AutomationScope[]) =>
      executeOperation(
        scopes
          ? { ...context, principal: { ...context.principal, scopes } }
          : context,
        name,
        value,
      );
    return { ...c, ...people, projects, context, input, run };
  }

  it("C14 projects: preserves public stories through draft edits and publishes only confirmed exact versions with a separate grant", async () => {
    const f = await fixture();
    const draft = (await f.run("projects_create", f.input)) as ProjectDto;
    const other = (await f.run("projects_create", {
      ...f.input,
      title: "Unrelated private story",
    })) as ProjectDto;
    expect(draft).toMatchObject({
      version: 1,
      published: null,
      archived: false,
    });
    const publication = { id: draft.id, expectedVersion: 1, confirmed: true };
    await expect(
      f.run("projects_publish", publication, ["projects:write"]),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    for (const confirmed of [undefined, false]) {
      await expect(
        f.run("projects_publish", { ...publication, confirmed }),
      ).rejects.toMatchObject({ name: "ZodError" });
    }
    expect(await f.run("projects_publish", publication)).toMatchObject({
      version: 2,
      published: f.input,
      changed: false,
      reviewUrl: `/admin/projects/${draft.id}`,
    });
    const content = {
      ...f.input,
      summary: "Private revised story",
      status: "ongoing",
    };
    expect(
      await f.run("projects_save", {
        id: draft.id,
        expectedVersion: 2,
        content,
      }),
    ).toMatchObject({
      version: 3,
      draft: content,
      published: f.input,
      changed: true,
    });
    await expect(
      f.run("projects_publish", { ...publication, expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "PROJECT_CONFLICT" });
    const reader = new ProjectReader(f.db);
    expect(await reader.publicList()).toEqual([
      { id: draft.id, slug: draft.slug, ...f.input },
    ]);
    expect(
      await f.run("projects_publish", { ...publication, expectedVersion: 3 }),
    ).toMatchObject({ version: 4, published: content, changed: false });
    expect(await f.projects.detail(f.owner, other.id)).toMatchObject({
      published: null,
      version: 1,
    });
    expect(await f.run("projects_list", { limit: 1, offset: 0 })).toMatchObject(
      { nextOffset: 1 },
    );
    await expect(
      f.run("projects_unpublish", {
        id: draft.id,
        expectedVersion: 4,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "OPERATION_NOT_FOUND" });
  });

  it("C14 projects: rechecks current membership, organization and feature availability for scoped automation", async () => {
    const f = await fixture();
    const created = await f.projects.create(f.owner, f.input);
    await expect(
      f.run("projects_get", { id: created.id }, ["website:read"]),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    await expect(
      executeOperation(
        {
          ...f.context,
          principal: { ...f.context.principal, organizationId: randomUUID() },
        },
        "projects_get",
        { id: created.id },
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_ORGANIZATION_CHANGED" });
    await new FeatureService(f.db, f.authorization).configure(f.owner, {
      key: "projects",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    await expect(
      f.run("projects_get", { id: created.id }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(f.run("projects_create", f.input)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await new FeatureService(f.db, f.authorization).configure(f.owner, {
      key: "projects",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });
    await f.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.id, f.scope.membershipId));
    await expect(
      f.run("projects_publish", {
        id: created.id,
        expectedVersion: 1,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });
}
