import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { ask, confirm } from "./hosting/console.mjs";
import {
  compose,
  envPath,
  saveSettings,
  settings,
  writeSetupLink,
} from "./hosting/operator.mjs";
import { backup, restore } from "./hosting/recovery.mjs";

const email = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) && !value.endsWith(".test");
const credential = (value) =>
  Boolean(value) && value.length <= 200 && !/['\r\n\0]/u.test(value);
const domain = (value) =>
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
    value,
  ) && !/(^|\.)(test|invalid|example|localhost|local|internal)$/u.test(value);

async function configure() {
  if (existsSync(envPath)) {
    console.log(
      "Hosting settings already exist. Start the site, or use link to renew an unfinished setup. Your database and keys are preserved.",
    );
    return settings();
  }
  console.log(
    "RotaPress hosting\nUse a server with Docker and Node.js. Point your domain to that server and allow ports 80 and 443. RotaPress handles the database and HTTPS.\n",
  );
  const host = await ask("Website domain (for example club.org)", {
    valid: domain,
  });
  const owner = await ask("Your owner email", { valid: email });
  const sender = await ask("Verified sender email from your email provider", {
    valid: email,
  });
  const provider = await ask("Email service: resend or smtp", {
    fallback: "resend",
    valid: (v) => ["resend", "smtp"].includes(v),
  });
  const values = {
    APP_DOMAIN: host,
    APP_URL: `https://${host}`,
    ROTAPRESS_OWNER_EMAIL: owner,
    ROTAPRESS_HOSTING_KEY: randomBytes(32).toString("hex"),
    POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
    ROTAPRESS_SETUP_CLAIM: randomBytes(32).toString("base64url"),
    ROTAPRESS_ENVIRONMENT: "production",
    ROTAPRESS_DEPLOYMENT: "hosted",
    EMAIL_PROVIDER: provider,
    EMAIL_REMOTE_DELIVERY_ENABLED: "true",
    EMAIL_FROM_NAME: "RotaPress",
    EMAIL_FROM_ADDRESS: sender,
  };
  if (provider === "resend")
    values.RESEND_API_KEY = await ask("Resend API key (hidden)", {
      secret: true,
      valid: (v) => /^re_[a-zA-Z0-9_-]{12,197}$/u.test(v),
    });
  else {
    values.SMTP_HOST = await ask("SMTP hostname", { valid: domain });
    values.SMTP_PORT = await ask("SMTP port", {
      fallback: "587",
      valid: (v) => ["465", "587"].includes(v),
    });
    values.SMTP_USERNAME = await ask("SMTP username", { valid: credential });
    values.SMTP_PASSWORD = await ask("SMTP password (hidden)", {
      secret: true,
      valid: credential,
    });
  }
  saveSettings(values);
  console.log(
    "Private settings saved. No database settings or security keys need to be entered.",
  );
  return values;
}

async function start(build = true) {
  const values = settings();
  console.log(
    "Starting PostgreSQL, applying pending migrations, and preparing HTTPS…",
  );
  await compose([
    "up",
    "--detach",
    ...(build ? ["--build"] : []),
    "--wait",
    "--wait-timeout",
    "180",
  ]);
  console.log(
    `RotaPress is running at ${values.APP_URL}. HTTPS needs your domain to reach this server.`,
  );
  writeSetupLink(values);
}

async function main() {
  const command = process.argv[2] || "install";
  if (command === "--help" || command === "help") {
    console.log(
      "RotaPress hosting\n  node scripts/host.mjs           Guided install\n  node scripts/host.mjs configure Save private settings only\n  node scripts/host.mjs start     Build and start; migrate automatically\n  node scripts/host.mjs link      Renew a pending owner's setup link\n  node scripts/host.mjs backup    Pause writes, save database, uploads and recovery keys\n  node scripts/host.mjs restore <backup-folder>  Restore into a fresh stack only\n  node scripts/host.mjs update    Back up, rebuild and migrate your current checkout\n  node scripts/host.mjs status    Show services\n  node scripts/host.mjs logs      Show recent application logs\n  node scripts/host.mjs stop      Stop services, preserving data",
    );
    return;
  }
  if (command === "configure") return configure();
  if (command === "install") {
    await configure();
    if (
      await confirm(
        "Build and start this website on this Docker server, opening ports 80 and 443?",
      )
    )
      await start();
  } else if (command === "start") await start();
  else if (command === "stop") await compose(["stop"]);
  else if (command === "status") await compose(["ps"]);
  else if (command === "logs") await compose(["logs", "--tail", "80", "web"]);
  else if (command === "link") {
    const values = settings();
    values.ROTAPRESS_SETUP_CLAIM = randomBytes(32).toString("base64url");
    saveSettings(values);
    await start(false);
  } else if (command === "backup") await backup();
  else if (command === "restore") {
    if (!process.argv[3])
      throw new Error("Choose the backup folder to restore.");
    if (await confirm("Restore this backup into a fresh RotaPress stack?"))
      await restore(process.argv[3]);
  } else if (command === "update") {
    console.log(
      "Updates use the code already in this checkout. Take a backup before applying pending migrations.",
    );
    await backup();
    await start();
  } else throw new Error("Unknown command. Run node scripts/host.mjs --help.");
}

main().catch((error) => {
  // Operator errors are controlled strings; never dump database/provider exceptions.
  console.error(
    error instanceof Error ? error.message : "Hosting operation failed.",
  );
  process.exitCode = 1;
});
