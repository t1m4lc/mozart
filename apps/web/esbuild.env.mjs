/**
 * Esbuild plugin: reads apps/web/.env and injects each variable as
 * `import.meta.env.VAR_NAME` at build time — no TypeScript env files needed.
 *
 * Usage: referenced from project.json `"plugins": ["apps/web/esbuild.env.mjs"]`
 *
 * In CI: deploy-web.yml writes apps/web/.env from GitHub variables/secrets
 *        before running the build.
 * In dev: copy apps/web/.env.example → apps/web/.env and fill in your values.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '.env');

function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    vars[key] = raw.replace(/^(["'])(.*)\1$/, '$2');
  }
  return vars;
}

export default {
  name: 'dotenv',
  setup(build) {
    if (!existsSync(envPath)) return;
    const vars = parseEnv(readFileSync(envPath, 'utf8'));
    build.initialOptions.define ??= {};
    for (const [key, value] of Object.entries(vars)) {
      build.initialOptions.define[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  },
};
