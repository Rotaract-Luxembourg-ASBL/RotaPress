import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { digest, inventory } from "../../scripts/reset/inventory.mjs";
import {
  finishCompletion,
  prepareCompletion,
} from "../../scripts/reset/completion.mjs";
import { resetTransaction } from "../../scripts/reset/transaction.mjs";
import { clearedTables } from "../../scripts/reset/tables.mjs";
import { ContentGeneration } from "../../src/core/content/ContentGeneration";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";

let client: Client;
let runtimeUrl: string;
let migrationUrl: string;
const ownerId = randomUUID();
const memberId = randomUUID();
const organizationId = randomUUID();
const eventId = randomUUID();
const filesBase = resolve(".local/test-uploads");
const filesRoot = resolve(filesBase, `reset-completion-${randomUUID()}`);

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  if (!env.TEST_MIGRATION_DATABASE_URL || !env.DATABASE_URL)
    throw new Error("Test database configuration is required.");
  const target = new URL(env.TEST_MIGRATION_DATABASE_URL);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  )
    throw new Error(
      "Only disposable rotapress_test may run reset regressions.",
    );
  client = new Client({ connectionString: target.toString() });
  migrationUrl = target.toString();
  runtimeUrl = env.DATABASE_URL;
  await client.connect();
});
beforeEach(async () => {
  await client.query(
    'TRUNCATE club.installation,club.organization,club.membership,club.audit_entry,club."user" CASCADE',
  );
  await client.query(
    "INSERT INTO club.\"user\" (id,name,email,email_verified) VALUES ($1,'Synthetic owner','reset-owner@example.test',true),($2,'Synthetic member','reset-member@example.test',true)",
    [ownerId, memberId],
  );
  await client.query(
    "INSERT INTO club.organization (id,name) VALUES ($1,'Synthetic reset club')",
    [organizationId],
  );
  await client.query(
    "INSERT INTO club.installation (id,nominated_email,organization_id,completed_at) VALUES (1,'reset-owner@example.test',$1,now())",
    [organizationId],
  );
  await client.query(
    "INSERT INTO club.membership (organization_id,user_id,role,status) VALUES ($1,$2,'owner','approved'),($1,$3,'member','approved')",
    [organizationId, ownerId, memberId],
  );
  await client.query(
    "INSERT INTO club.account (id,user_id,account_id,provider_id) VALUES ($1,$2,'synthetic-google-id','google')",
    [randomUUID(), ownerId],
  );
  await client.query(
    "INSERT INTO club.session (id,user_id,token,expires_at,auth_method,auth_provider_version) VALUES ($1,$2,$3,now()+interval '1 day','google','synthetic-version-7')",
    [randomUUID(), ownerId, randomUUID()],
  );
  await client.query(
    "INSERT INTO club.google_auth_configuration (organization_id,version,client_id,client_secret,enabled) VALUES ($1,7,'synthetic-client','synthetic-encrypted-credential',true)",
    [organizationId],
  );
  await client.query(
    "INSERT INTO club.oauth_client (id,client_id,user_id,redirect_uris,scopes) VALUES ($1,'synthetic-client',$2,ARRAY['https://client.example.test/callback'],ARRAY['media:read'])",
    [randomUUID(), ownerId],
  );
  await client.query(
    "INSERT INTO club.event (id,organization_id,title,starts_at,timezone,created_by) VALUES ($1,$2,'Synthetic event',now(),'Europe/Luxembourg',$3)",
    [eventId, organizationId, ownerId],
  );
  await client.query(
    "INSERT INTO club.site_domain (organization_id,hostname,event_id,challenge,verified_at) VALUES ($1,'club.example.test',NULL,'preserved',now()),($1,'event.example.test',$2,'removed',now())",
    [organizationId, eventId],
  );
  await client.query(
    "INSERT INTO club.project (organization_id,slug,draft) VALUES ($1,'synthetic-project','{}')",
    [organizationId],
  );
  await client.query(
    "INSERT INTO club.automation_receipt (organization_id,actor_user_id,connection_id,request_id,task_id,generation,operation,input_hash,result) SELECT $1,$2,'synthetic-client',$3,$4,generation,'synthetic-operation',repeat('a',64),'{\"private\":\"content\"}' FROM club.content_generation WHERE organization_id=$1",
    [organizationId, ownerId, randomUUID(), randomUUID()],
  );
});
afterAll(async () => {
  await client?.end();
  if (dirname(filesRoot) !== filesBase)
    throw new Error("Unsafe reset test cleanup");
  await rm(filesRoot, { recursive: true, force: true });
});

describe("controlled content reset on real PostgreSQL", () => {
  it("finishes files once under database locks and rejects newly retained content", async () => {
    const source = await inventory(client);
    const backupRoot = resolve(filesRoot, "backup");
    await mkdir(backupRoot, { recursive: true });
    const backup = {
      root: backupRoot,
      files: { "uploads.jsonl": digest('{"complete":true,"files":0}\n') },
      manifest: { source },
      manifestFingerprint: digest(source),
    };
    const generation = randomUUID();
    const receipt = await prepareCompletion(
      filesRoot,
      backup,
      "https://reset.example.test",
      generation,
    );
    await resetTransaction(client, source, { commit: true, generation });
    expect(
      await finishCompletion(client, filesRoot, backup, receipt),
    ).toMatchObject({ reset: true, protectedUnchanged: true });
    expect(
      await finishCompletion(client, filesRoot, backup, receipt),
    ).toMatchObject({ reset: true, emptyContent: true });
    expect(await readdir(resolve(filesRoot, ".data/uploads"))).toEqual([]);
    await client.query("UPDATE club.automation_receipt SET result='{}'");
    await expect(
      finishCompletion(client, filesRoot, backup, receipt),
    ).rejects.toThrow("RESET_COMPLETION_STATE_CHANGED");
  });

  it("refuses content committed while the operator was acquiring table locks", async () => {
    const before = await inventory(client);
    const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    const writer = new Client({ connectionString: migrationUrl });
    await writer.connect();
    try {
      await writer.query("BEGIN");
      await writer.query(
        "INSERT INTO club.audit_entry (organization_id,actor_user_id,action) VALUES ($1,$2,'synthetic.concurrent_write')",
        [organizationId, ownerId],
      );
      const pending = resetTransaction(client, before, { commit: true }).then(
        () => null,
        (error: unknown) => error,
      );
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await writer.query("SELECT pg_stat_clear_snapshot()");
        const activity = await writer.query(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
          [pid],
        );
        if (activity.rows[0]?.wait_event_type === "Lock") {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await writer.query("COMMIT");
      const result = await pending;
      expect(waiting).toBe(true);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("RESET_DATAFINGERPRINT_MISMATCH");
      expect(
        (await client.query("SELECT count(*)::int AS total FROM club.event"))
          .rows[0].total,
      ).toBe(1);
    } finally {
      await writer.query("ROLLBACK");
      await writer.end();
    }
  });

  it("keeps all authentication/configuration and approved owners while clearing content and invalidating old requests", async () => {
    const before = await inventory(client);
    const db = drizzle(client, { schema });
    const oldGeneration = await ContentGeneration.read(organizationId, db);
    const result = await resetTransaction(client, before, { commit: true });
    expect(result).toMatchObject({
      committed: true,
      emptyContent: true,
      protectedFingerprint: before.protectedFingerprint,
    });
    const after = await inventory(client);
    expect(after.ownerIds).toEqual([ownerId]);
    expect(after.counts.user).toBe(2);
    expect(after.counts.account).toBe(1);
    expect(after.counts.session).toBe(1);
    expect(after.counts.site_domain).toBe(1);
    expect(after.counts.membership).toBe(1);
    for (const table of clearedTables)
      expect(after.counts[table]).toBe(table === "audit_entry" ? 1 : 0);
    expect(
      (
        await client.query(
          "SELECT version,client_secret FROM club.google_auth_configuration",
        )
      ).rows[0],
    ).toEqual({ version: 7, client_secret: "synthetic-encrypted-credential" });
    expect(
      (await client.query("SELECT result,task_id FROM club.automation_receipt"))
        .rows[0],
    ).toEqual({ result: null, task_id: null });
    await expect(
      ContentGeneration.assertCurrent(
        organizationId,
        oldGeneration.generation,
        db,
      ),
    ).rejects.toMatchObject({ code: "CONTENT_RESET" });
    await expect(
      ContentGeneration.assertCurrent(organizationId, undefined, db),
    ).rejects.toMatchObject({ code: "CONTENT_RESET" });
    expect(
      (
        await ContentGeneration.assertCurrent(
          organizationId,
          result.generation,
          db,
        )
      ).generation,
    ).toBe(result.generation);
    const owner: TrustedActor = {
      userId: ownerId,
      email: "reset-owner@example.test",
      emailVerified: true,
      sessionId: randomUUID(),
      authenticatedAt: new Date(),
      authMethod: "google",
    };
    expect(
      await new AuthorizationService(db).require(owner, "ownership.manage"),
    ).toMatchObject({ organizationId, role: "owner" });
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS total FROM pg_constraint WHERE connamespace='club'::regnamespace",
        )
      ).rows[0].total,
    ).toBeGreaterThan(100);
  });

  it("rolls back rehearsal changes and refuses drift, unknown tables, wrong owners and active app connections", async () => {
    const before = await inventory(client);
    await resetTransaction(client, before);
    expect((await inventory(client)).dataFingerprint).toBe(
      before.dataFingerprint,
    );
    await expect(
      resetTransaction(client, { ...before, ownerIds: [randomUUID()] }),
    ).rejects.toThrow("RESET_OWNER_MISMATCH");
    await client.query(
      "UPDATE club.google_auth_configuration SET version=version+1",
    );
    await expect(
      resetTransaction(client, before, { commit: true }),
    ).rejects.toThrow("RESET_PROTECTEDFINGERPRINT_MISMATCH");
    expect(
      (await client.query("SELECT count(*)::int AS total FROM club.event"))
        .rows[0].total,
    ).toBe(1);
    await client.query("CREATE TABLE club.reset_unknown_table (id integer)");
    try {
      await expect(inventory(client)).rejects.toThrow(
        "RESET_TABLE_REVIEW_REQUIRED",
      );
    } finally {
      await client.query("DROP TABLE club.reset_unknown_table");
    }
    const app = new Client({ connectionString: runtimeUrl });
    await app.connect();
    try {
      await expect(
        resetTransaction(client, await inventory(client), { commit: true }),
      ).rejects.toThrow("RESET_WRITES_NOT_STOPPED");
    } finally {
      await app.end();
    }
  });
});
