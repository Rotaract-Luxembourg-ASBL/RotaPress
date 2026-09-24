/** Local production rehearsal. Unique disposable stacks, loopback ports,
 * synthetic credentials, internal TLS. Never uses a real email provider. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import https from "node:https";
import { resolve } from "node:path";
import pg from "pg";
import sharp from "sharp";
import {
  databaseConnection,
  hostingKeys,
  prepareHostedDatabase,
} from "./database.mjs";

const suffix = randomBytes(5).toString("hex");
const original = `rotapress-check-${suffix}`;
const restored = `rotapress-restore-${suffix}`;
process.env.ROTAPRESS_STACK = original;
const { root, directory, compose, savePrivate, saveSettings } =
  await import("./operator.mjs");
const { backup, restore } = await import("./recovery.mjs");
const secret = randomBytes(32).toString("hex");
const claim = randomBytes(32).toString("base64url");
const password = randomBytes(32).toString("hex");
const key = `${randomUUID()}.webp`;
const bytes = await sharp({
  create: { width: 2, height: 2, channels: 3, background: "#17458f" },
})
  .webp()
  .toBuffer();
const owner = "synthetic-owner@example.test";
const values = {
  APP_DOMAIN: "hosting.test",
  APP_URL: "https://hosting.test",
  ROTAPRESS_IMAGE_TAG: "hosting-check",
  POSTGRES_PASSWORD: password,
  ROTAPRESS_HOSTING_KEY: secret,
  ROTAPRESS_SETUP_CLAIM: claim,
  ROTAPRESS_OWNER_EMAIL: owner,
  ROTAPRESS_ENVIRONMENT: "production",
  ROTAPRESS_DEPLOYMENT: "hosted",
  EMAIL_PROVIDER: "resend",
  EMAIL_REMOTE_DELIVERY_ENABLED: "true",
  EMAIL_FROM_ADDRESS: "synthetic@example.test",
  RESEND_API_KEY: "re_synthetic_never_used_00000000000000",
};
const override = resolve(directory, "check.compose.yaml");
async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
const dbPort = await freePort(),
  httpsPort = await freePort();
process.env.ROTAPRESS_COMPOSE_OVERRIDE = override;
saveSettings(values);
savePrivate(
  resolve(directory, "Caddyfile"),
  "https://hosting.test {\n tls internal\n header Strict-Transport-Security max-age=31536000\n reverse_proxy web:3000 {\n header_up X-Real-IP {remote_host}\n }\n}\n",
);
savePrivate(
  override,
  `services:
  postgres:
    ports: ["127.0.0.1:${dbPort}:5432"]
  https:
    ports: !override ["127.0.0.1:${httpsPort}:443"]
    volumes: !override
      - ${JSON.stringify(`${directory.replaceAll("\\", "/")}/Caddyfile:/etc/caddy/Caddyfile:ro`)}
      - certificates:/data
      - proxy_config:/config
networks:
  database:
    internal: false
`,
);

async function other(code, args = []) {
  return new Promise((done, reject) => {
    const running = spawn(
      process.execPath,
      ["--input-type=module", "-e", code, ...args],
      {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, ROTAPRESS_STACK: restored },
      },
    );
    running.once("error", reject);
    running.once("exit", (status) =>
      status === 0 ? done() : reject(new Error("RESTORE_REHEARSAL_FAILED")),
    );
  });
}

async function publishedPort(service, port) {
  const address = (
    await compose(["port", service, String(port)], { capture: true })
  ).trim();
  assert.match(address, /^127\.0\.0\.1:\d+$/u);
  return Number(address.split(":")[1]);
}
function request(
  port,
  path,
  { method = "GET", body, cookie, origin = values.APP_URL } = {},
) {
  return new Promise((done, reject) => {
    const req = https.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        // This local-only rehearsal uses Caddy's internal CA, never a public host.
        servername: "hosting.test",
        rejectUnauthorized: false,
        headers: {
          host: "hosting.test",
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          done({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.once("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

let admin;
let runtime;
try {
  await compose([
    "up",
    "--detach",
    "--no-build",
    "--wait",
    "--wait-timeout",
    "180",
  ]);
  const databasePort = await publishedPort("postgres", 5432);
  const bootstrapUrl = `postgresql://rotapress_bootstrap:${password}@127.0.0.1:${databasePort}/rotapress`;
  admin = new pg.Client({ connectionString: bootstrapUrl });
  await admin.connect();
  const credentials = hostingKeys(secret);
  runtime = new pg.Client({
    connectionString: databaseConnection(
      bootstrapUrl,
      "rotapress_app",
      credentials.runtime,
    ),
  });
  await runtime.connect();
  const initial = (
    await admin.query(
      "SELECT claim_hash, claim_expires_at FROM club.installation WHERE id=1",
    )
  ).rows[0];
  assert.equal(
    initial.claim_hash,
    createHash("sha256").update(claim).digest("hex"),
  );
  assert.equal(
    (await admin.query("SELECT count(*)::int AS count FROM club.membership"))
      .rows[0].count,
    0,
  );
  await assert.rejects(
    runtime.query("CREATE TABLE public.forbidden (id integer)"),
  );
  await assert.rejects(runtime.query("DELETE FROM club.installation"));
  const params = { bootstrapUrl, secret, ownerEmail: owner, claim };
  await prepareHostedDatabase(params);
  assert.deepEqual(
    (
      await admin.query(
        "SELECT claim_hash, claim_expires_at FROM club.installation WHERE id=1",
      )
    ).rows[0],
    initial,
  );
  await assert.rejects(
    prepareHostedDatabase({
      ...params,
      secret: randomBytes(32).toString("hex"),
    }),
  );
  await admin.query("GRANT pg_read_all_data TO rotapress_app");
  await assert.rejects(
    prepareHostedDatabase(params),
    /HOSTING_DATABASE_ROLE_UNSAFE/u,
  );
  await admin.query("REVOKE pg_read_all_data FROM rotapress_app");
  const expiry = new Date(Date.now() - 60_000);
  await admin.query(
    "UPDATE club.installation SET claim_expires_at=$1 WHERE id=1",
    [expiry],
  );
  await prepareHostedDatabase(params);
  assert.equal(
    (
      await admin.query(
        "SELECT claim_expires_at FROM club.installation WHERE id=1",
      )
    ).rows[0].claim_expires_at.getTime(),
    expiry.getTime(),
  );
  const renewed = randomBytes(32).toString("base64url");
  await prepareHostedDatabase({ ...params, claim: renewed });
  const port = await publishedPort("https", 443);
  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  assert.match(health.headers["strict-transport-security"], /max-age/u);
  assert.equal(
    (
      await request(port, "/api/setup/claim", {
        method: "POST",
        body: { claim: renewed },
        origin: "https://untrusted.test",
      })
    ).status,
    403,
  );
  const exchanged = await request(port, "/api/setup/claim", {
    method: "POST",
    body: { claim: renewed },
  });
  assert.equal(exchanged.status, 200);
  const cookie = exchanged.headers["set-cookie"][0];
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /Secure/u);
  assert.equal(
    JSON.parse((await request(port, "/api/me", { cookie })).text)
      .setupClaimReady,
    true,
  );
  assert.equal(
    (await request(port, "/api/setup", { method: "POST", cookie, body: {} }))
      .status,
    401,
  );
  const isolated = await compose(
    [
      "exec",
      "-T",
      "--user",
      "10001:10001",
      "web",
      "node",
      "-e",
      "try {require('fs').readFileSync('/proc/1/environ'); process.exit(1)} catch(e) {if(e.code!=='EACCES') process.exit(2)}",
    ],
    { capture: true },
  );
  assert.equal(isolated, "");
  await compose(
    [
      "exec",
      "-T",
      "--user",
      "10001:10001",
      "web",
      "node",
      "-e",
      `require('fs').writeFileSync('/app/.data/uploads/${key}',Buffer.from('${bytes.toString("base64")}','base64'),{mode:0o600})`,
    ],
    { capture: true },
  );
  await admin.query(
    "INSERT INTO club.organization (name, tagline) VALUES ('Synthetic hosting recovery', 'Stored across restarts')",
  );
  await compose(["restart", "web"]);
  await compose(["up", "--detach", "--no-build", "--wait", "web"]);
  assert.equal(
    (await admin.query("SELECT name FROM club.organization")).rows[0].name,
    "Synthetic hosting recovery",
  );
  const jobLog = await compose(["logs", "--no-color", "web"], {
    capture: true,
  });
  assert.match(jobLog, /cms_publications_processed/u);
  assert.doesNotMatch(jobLog, /jobs_batch_failed|jobs_failed/u);
  const folder = await backup();
  await assert.rejects(restore(folder), /fresh checkout/u);
  await runtime.end();
  runtime = undefined;
  await admin.end();
  admin = undefined;
  await compose(["stop"]);
  await other(
    "const { restore } = await import('./scripts/hosting/recovery.mjs'); await restore(process.argv[1]);",
    [folder],
  );
  await other(
    "const { compose } = await import('./scripts/hosting/operator.mjs'); await compose(['up','--detach','--no-build','--wait','--wait-timeout','180']);",
  );
  await other(`
    import assert from 'node:assert/strict';
    const { compose } = await import('./scripts/hosting/operator.mjs');
    const names = await compose(['exec','-T','postgres','psql','-U','rotapress_bootstrap','-d','rotapress','-Atc',"SELECT name FROM club.organization"], {capture:true});
    assert.equal(names.trim(), 'Synthetic hosting recovery');
    await assert.rejects(compose(['exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','rotapress_bootstrap','-d','rotapress','-c','SET ROLE rotapress_app; DELETE FROM club.installation'], {capture:true}));
    const digest = await compose(['exec','-T','--user','10001:10001','web','node','-e', "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/app/.data/uploads/${key}')).digest('hex'))"], {capture:true});
    assert.equal(digest.trim(), '${createHash("sha256").update(bytes).digest("hex")}');
  `);
  console.log(
    "PASS: portable startup, migrations, restricted roles, expired/renewed claims, HTTPS, secure cookies, process isolation, persisted data/uploads, consistent backup, fresh-stack restore, and overwrite refusal. No email sent.",
  );
} finally {
  await runtime?.end();
  await admin?.end();
  // These exact names are generated above solely for this disposable rehearsal.
  assert.match(original, /^rotapress-check-[a-f0-9]{10}$/u);
  assert.match(restored, /^rotapress-restore-[a-f0-9]{10}$/u);
  await compose(["down", "--volumes", "--remove-orphans"]);
  const restoreEnv = resolve(
    root,
    ".local",
    "hosting",
    restored,
    "production.env",
  );
  if (existsSync(restoreEnv))
    await other(
      "const { compose } = await import('./scripts/hosting/operator.mjs'); await compose(['down','--volumes','--remove-orphans']);",
    );
}
