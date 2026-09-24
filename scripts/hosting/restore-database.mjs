import { prepareEmptyHostedDatabase } from "./database.mjs";

try {
  await prepareEmptyHostedDatabase({
    bootstrapUrl: process.env.BOOTSTRAP_DATABASE_URL,
    secret: process.env.ROTAPRESS_HOSTING_KEY,
  });
  console.log("Empty recovery database prepared.");
} catch {
  console.error(
    "Recovery refused: use an empty dedicated database and matching recovery keys.",
  );
  process.exitCode = 1;
}
