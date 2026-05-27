// Reads apps/web/.env and patches the Angular build `define` section in
// project.json so that import.meta.env.* substitutions are live values.
// Run before `nx run web:build` in CI (ephemeral) or locally with
// `pnpm web:inject-env` then `git update-index --skip-worktree apps/web/project.json`.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(dir, '.env');
const pjPath = resolve(dir, 'project.json');

if (!existsSync(envPath)) {
  console.log('apps/web/.env not found — skipping define injection');
  process.exit(0);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
pj.targets.build.options.define ??= {};
for (const [k, v] of Object.entries(env)) {
  pj.targets.build.options.define[`import.meta.env.${k}`] = JSON.stringify(v);
}
writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n');
console.log(`Injected ${Object.keys(env).length} env vars into apps/web/project.json define`);
