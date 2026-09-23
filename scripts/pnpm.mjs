import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { local, root, run, reportFailure } from "./local_common.mjs";

try {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const version = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(manifest.packageManager)?.[1];
  if (!version) throw new Error("package.json must pin an exact pnpm packageManager version.");
  const directory = resolve(local, `pnpm-${version}`);
  const binary = resolve(directory, "bin", Number(version.split(".")[0]) >= 11 ? "pnpm.mjs" : "pnpm.cjs");
  if (!existsSync(binary)) {
    console.log(`Preparing project-local pnpm ${version}.`);
    const metadata = await fetch(`https://registry.npmjs.org/pnpm/${version}`, {
      signal: AbortSignal.timeout(30_000),
    }).then((response) => {
      if (!response.ok) throw new Error(`pnpm registry returned ${response.status}.`);
      return response.json();
    });
    const tarball = new URL(metadata.dist.tarball);
    if (tarball.origin !== "https://registry.npmjs.org") throw new Error("Unexpected pnpm archive origin.");
    const response = await fetch(tarball, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`pnpm download returned ${response.status}.`);
    const archive = Buffer.from(await response.arrayBuffer());
    const digest = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    if (digest !== metadata.dist.integrity) throw new Error("pnpm download integrity verification failed.");
    mkdirSync(directory, { recursive: true });
    const archivePath = resolve(local, `pnpm-${version}.tgz`);
    writeFileSync(archivePath, archive);
    run(process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar", [
      "-xzf", archivePath, "--strip-components=1", "-C", directory,
    ]);
  }
  const store = resolve(local, "pnpm-store");
  const env = {
    ...process.env,
    PNPM_HOME: resolve(local, "pnpm-home"),
    pnpm_config_store_dir: store,
    pnpm_config_cache_dir: resolve(local, "pnpm-cache"),
  };
  const args = process.argv.slice(2);
  if (args.includes("--global") || args.includes("-g")) throw new Error("This bootstrap supports project-local commands only.");
  // pnpm owns a built-in `setup`; prefer the project's script without changing the user's shell.
  if (Object.hasOwn(manifest.scripts ?? {}, args[0] ?? "")) args.unshift("run");
  else if (args[0] === "setup") throw new Error("The project setup script is missing.");
  run(process.execPath, [binary, ...args], { env });
} catch (error) {
  reportFailure(error);
}
