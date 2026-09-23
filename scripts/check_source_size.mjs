/**
 * Enforce the project's 800 physical line limit on authored text files.
 * Run from the workspace root: node scripts/check_source_size.mjs
 * An optional first argument selects another root for isolated verification.
 * No packages, Git repository, network access or file mutations are required.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const LIMIT = 800;
const root = path.resolve(process.argv[2] ?? process.cwd());
const ignoredDirectories = new Set([
  '.git', '.next', '.turbo', '.cache', '.pnpm-store', '.venv',
  'node_modules', 'dist', 'build', 'coverage', 'playwright-report',
  'test-results', 'artifacts', '.local', '.data', 'backups',
]);
const machineLockfiles = new Set([
  'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock',
  'bun.lockb', 'npm-shrinkwrap.json',
]);
const extensions = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.conf',
  '.sql', '.prisma', '.graphql', '.gql', '.css', '.scss', '.sass',
  '.less', '.html', '.htm', '.vue', '.svelte', '.sh', '.bash',
  '.zsh', '.ps1', '.cmd', '.bat', '.py', '.md', '.mdx', '.txt',
]);
const exactNames = new Set([
  'Dockerfile', 'Containerfile', 'Makefile', 'Justfile',
  '.gitignore', '.dockerignore', '.npmrc', '.nvmrc',
  '.node-version', '.editorconfig', '.prettierrc', '.eslintrc',
  '.env.example', '.env.sample',
]);

function physicalLines(text) {
  if (text.length === 0) return 0;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const count = normalized.split('\n').length;
  return normalized.endsWith('\n') ? count - 1 : count;
}

function candidate(name) {
  return exactNames.has(name)
    || extensions.has(path.extname(name).toLowerCase())
    || name.startsWith('Dockerfile.')
    || name.endsWith('.example');
}

function scopedSnapshot(relative) {
  return /^db\/migrations\/meta\/[^/]+\.json$/.test(relative);
}

const violations = [];
const errors = [];
const generated = [];
let checked = 0;
let largest = { lines: 0, file: '(none)' };

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const relative = path.relative(root, fullPath).split(path.sep).join('/');
    if (entry.isSymbolicLink()) {
      errors.push(`${relative}: symbolic links are not checked; keep authored code as regular files`);
      continue;
    }
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await inspect(fullPath);
      continue;
    }
    if (!entry.isFile() || !candidate(entry.name)) continue;
    if (machineLockfiles.has(entry.name) || scopedSnapshot(relative)) {
      generated.push(relative);
      continue;
    }
    try {
      const bytes = await readFile(fullPath);
      if (bytes.includes(0)) {
        errors.push(`${relative}: unexpected binary content in an authored text path`);
        continue;
      }
      const content = bytes.toString('utf8');
      if (/\.generated(?:\.d)?\.ts$/.test(entry.name)) {
        if (!content.slice(0, 2048).includes('@generated')) {
          errors.push(`${relative}: a generated type exception needs an @generated provenance header`);
          continue;
        }
        generated.push(relative);
        continue;
      }
      const lines = physicalLines(content);
      checked += 1;
      if (lines > largest.lines) largest = { lines, file: relative };
      if (lines > LIMIT) violations.push({ file: relative, lines });
    } catch (error) {
      errors.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

try {
  if (!(await stat(root)).isDirectory()) throw new Error('The selected root is not a directory.');
  await inspect(root);
  console.log(`Checked ${checked} authored files. Maximum allowed: ${LIMIT} physical lines.`);
  console.log(`Largest checked file: ${largest.file} (${largest.lines} lines).`);
  if (generated.length > 0) {
    console.log(`Skipped ${generated.length} narrowly identified machine generated artifacts.`);
  }
  for (const violation of violations) {
    console.error(`OVERSIZE ${violation.file}: ${violation.lines} lines; limit is ${LIMIT}.`);
  }
  for (const error of errors) console.error(`ERROR ${error}`);
  if (errors.length > 0 || violations.length > 0) {
    process.exitCode = 1;
  } else {
    console.log('Source size check passed.');
  }
} catch (error) {
  console.error(`Source size check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
