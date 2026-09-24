import { resolve } from "node:path";

async function main() {
  // Configuration must load before importing server-only modules. No migrations
  // run here: the worker uses the same restricted runtime role as the app.
  if (process.env.ROTAPRESS_DEPLOYMENT !== "hosted")
    process.loadEnvFile(resolve(".env.local"));
  const { services } = await import("../src/composition/services");
  const { pool } = await import("../src/infrastructure/database/client");
  try {
    const result = await services.notifications.runBatch();
    const calendarSync = await services.calendarSources.runBatch();
    console.log(
      JSON.stringify({
        event: "calendar_feeds_refreshed",
        processed: calendarSync.checked,
        ...calendarSync,
      }),
    );
    const calendar = await services.calendarNotifications.runBatch();
    console.log(
      JSON.stringify({
        event: "calendar_notifications_processed",
        processed: calendar.checked,
        ...calendar,
      }),
    );
    console.log(
      JSON.stringify({ event: "form_notifications_processed", ...result }),
    );
    const publications = await services.publications.runBatch();
    const webhooks = await services.webhookNotifications.runBatch();
    console.log(
      JSON.stringify({ event: "form_webhooks_processed", ...webhooks }),
    );
    console.log(
      JSON.stringify({ event: "cms_publications_processed", ...publications }),
    );
    const reconciliations = await services.lumaReconciliation.runBatch();
    console.log(
      JSON.stringify({
        event: "luma_reconciliations_processed",
        ...reconciliations,
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch(() => {
  // Never print exception details, addresses, answers or environment values.
  console.error(
    JSON.stringify({
      event: "jobs_failed",
      code: "JOB_RUN_UNAVAILABLE",
    }),
  );
  process.exitCode = 1;
});
