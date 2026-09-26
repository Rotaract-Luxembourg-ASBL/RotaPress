import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import {
  operationCatalogue,
  operations,
  contractVersion,
} from "../src/integrations/automation/catalogue";
import { openApiDocument } from "../src/integrations/automation/openapi";
import {
  automationPrompts,
  renderAutomationPrompt,
} from "../src/integrations/automation/prompts";

async function main() {
  const root = process.cwd();
  const coveragePath = "docs/development/automation-coverage.json";
  const lockPath = "docs/development/automation-contract.json";
  const coverage: Record<string, { operations: string[]; manual: string }> =
    JSON.parse(await readFile(coveragePath, "utf8"));
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  async function files(directory: string): Promise<string[]> {
    const items = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        items.map((item) =>
          item.isDirectory()
            ? files(resolve(directory, item.name))
            : [resolve(directory, item.name)],
        ),
      )
    )
      .flat()
      .sort();
  }
  async function fingerprint(directory: string) {
    const paths = (await files(resolve(root, "src", directory)))
      .map((path) => relative(root, path).replaceAll("\\", "/"))
      .filter((path) => /\.(ts|tsx|css|json)$/.test(path))
      .sort();
    const content = await Promise.all(
      paths.map(
        async (path) =>
          `${path}\n${(await readFile(resolve(root, path), "utf8")).replaceAll("\r\n", "\n")}`,
      ),
    );
    return hash(content.join("\n"));
  }
  const discovered = [];
  for (const parent of ["features", "integrations"]) {
    for (const entry of await readdir(resolve(root, "src", parent), {
      withFileTypes: true,
    }))
      if (entry.isDirectory()) discovered.push(`${parent}/${entry.name}`);
  }
  for (const domain of discovered)
    if (!coverage[domain])
      throw new Error(
        `Declare API/MCP coverage or a manual-only reason for ${domain}.`,
      );
  const names = operations.map((o) => o.name);
  for (const op of operations) {
    if (!op.input.safeParse(op.example).success)
      throw new Error(
        `Update the request example for ${op.name}; it no longer matches the input schema.`,
      );
  }
  if (
    new Set(names).size !== names.length ||
    new Set(operations.map((o) => `${o.method} ${o.path}`)).size !==
      operations.length
  )
    throw new Error(
      "Automation operation names and HTTP method/path pairs must be unique.",
    );
  for (const [domain, policy] of Object.entries(coverage)) {
    if (!policy.manual.trim())
      throw new Error(`Explain the manual boundary for ${domain}.`);
    for (const name of policy.operations)
      if (!names.includes(name))
        throw new Error(`Unknown operation ${name} in ${domain}.`);
  }
  const covered = Object.values(coverage).flatMap((p) => p.operations);
  for (const name of names)
    if (!covered.includes(name))
      throw new Error(`Declare feature coverage for ${name}.`);
  const current = {
    version: contractVersion,
    contract: hash(
      JSON.stringify({
        catalogue: operationCatalogue(),
        openapi: openApiDocument(),
        prompts: automationPrompts,
        promptText: automationPrompts.map(({ name }) =>
          renderAutomationPrompt(
            name,
            name === "adapt_reference_website"
              ? { sourceUrl: "https://www.rotary.org/" }
              : name === "review_page_design"
                ? { pageId: "11111111-1111-4111-8111-111111111111" }
                : { brief: "Prepare verified private content for review." },
          ),
        ),
      }),
    ),
    domains: Object.fromEntries(
      await Promise.all(
        Object.keys(coverage)
          .sort()
          .map(async (domain) => [domain, await fingerprint(domain)]),
      ),
    ),
  };
  if (process.argv.includes("--write")) {
    await writeFile(lockPath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(
      "Recorded the reviewed API/MCP contract. Review this diff together with schemas, prompts, coverage and tests.",
    );
  } else {
    const expected = JSON.parse(await readFile(lockPath, "utf8"));
    if (JSON.stringify(expected) !== JSON.stringify(current)) {
      const changed = Object.keys(current.domains).filter(
        (key) => current.domains[key] !== expected.domains?.[key],
      );
      throw new Error(
        `API/MCP review required: ${changed.join(", ") || "operation schemas or prompts"}. Update operations, prompts, tests and coverage as needed, then run api:record. Do not record without reviewing the change.`,
      );
    }
    console.log(
      `API/MCP contract passed: ${operations.length} shared operations; ${Object.keys(coverage).length} reviewed domains.`,
    );
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "API/MCP contract check failed.",
  );
  process.exitCode = 1;
});
