#!/usr/bin/env node
// Bump the workspace's release version across every file that pins it.
//
// Usage:  node tools/release-bump.mjs 0.1.0-beta.2
//
// What it touches:
//   - apps/desktop-tauri/tauri.conf.json      "version"
//   - apps/desktop-tauri/Cargo.toml           [package].version
//   - apps/desktop-tauri/Cargo.lock           sync via `cargo update -p mozart --offline`
//   - package.json                            "version"
//   - CHANGELOG.md                            prepend new section under [Unreleased]
//   - apps/landing/src/content/changelog/v<slug>.md   create new markdown
//
// What you do AFTER running this:
//   1. Fill in CHANGELOG.md and the landing changelog
//   2. git add -A && git commit -m "chore(release): v<version>"
//   3. git tag v<version> && git push origin main --tags
//
// The tag triggers release.yml (desktop), deploy-web.yml, deploy-landing.yml.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_RE = /^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+(\.\d+)?)?$/;

const version = process.argv[2];
if (!version || !VERSION_RE.test(version)) {
  console.error('Usage: node tools/release-bump.mjs <version>');
  console.error('Example: node tools/release-bump.mjs 0.1.0-beta.2');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const slug = `v${version.replace(/\./g, '-')}`;

function patch(file, fn) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) throw new Error(`Missing: ${file}`);
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (before === after) {
    console.warn(`  (unchanged) ${file}`);
    return;
  }
  writeFileSync(path, after);
  console.log(`  ✓ ${file}`);
}

console.log(`\nBumping to v${version} (${today})\n`);

// apps/desktop-tauri/tauri.conf.json
patch('apps/desktop-tauri/tauri.conf.json', (src) =>
  src.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`),
);

// apps/desktop-tauri/Cargo.toml
patch('apps/desktop-tauri/Cargo.toml', (src) =>
  src.replace(/^version = "[^"]+"/m, `version = "${version}"`),
);

// package.json (root)
patch('package.json', (src) =>
  src.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`),
);

// Cargo.lock: sync via cargo. Silently skipped if cargo isn't installed.
try {
  execSync('cargo update -p mozart --offline', {
    cwd: resolve(ROOT, 'apps/desktop-tauri'),
    stdio: 'pipe',
  });
  console.log('  ✓ apps/desktop-tauri/Cargo.lock');
} catch (err) {
  console.warn('  (skipped) Cargo.lock — run `cargo update -p mozart` manually');
}

// CHANGELOG.md: prepend a new section under [Unreleased]
patch('CHANGELOG.md', (src) => {
  const marker = '## [Unreleased]\n';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('CHANGELOG.md is missing the ## [Unreleased] anchor');
  const head = src.slice(0, idx + marker.length);
  const tail = src.slice(idx + marker.length);
  const section = `\n## [${version}] — ${today}\n\n### Added\n- TODO\n\n### Fixed\n- TODO\n\n### Removed\n- TODO\n`;
  return `${head}${section}${tail}`;
});

// apps/landing/src/content/changelog/v<slug>.md (new file)
const landingPath = resolve(
  ROOT,
  `apps/landing/src/content/changelog/${slug}.md`,
);
if (existsSync(landingPath)) {
  console.warn(`  (exists) apps/landing/src/content/changelog/${slug}.md`);
} else {
  const body = `---
version: '${version}'
date: ${today}
title: TODO short title
---

TODO — intro paragraph that says why this release matters.

### Section heading
- TODO bullet
`;
  writeFileSync(landingPath, body);
  console.log(`  ✓ apps/landing/src/content/changelog/${slug}.md`);
}

console.log(`
Done. Next:
  1. Fill in CHANGELOG.md and apps/landing/src/content/changelog/${slug}.md
  2. git add -A && git commit -m "chore(release): v${version}"
  3. git tag v${version} && git push origin main --tags
`);
