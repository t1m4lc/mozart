#!/usr/bin/env node
// One-shot codemod: rename libs/ui → libs/spartan-ui and @spartan-ui/* → @spartan-ui/*.
// Keeps Hlm* class names, [hlmFoo] selectors, hlm-*.ts filenames, and HlmFooImports
// consts intact so Spartan CLI's string-based migrators keep working.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();
const OLD_DIR = 'libs/ui';
const NEW_DIR = 'libs/spartan-ui';
const OLD_ALIAS = '@spartan-ui/';
const NEW_ALIAS = '@spartan-ui/';

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

// --- Step 1: git mv libs/ui → libs/spartan-ui ---
function moveDirectory() {
  if (!existsSync(join(REPO_ROOT, OLD_DIR))) {
    console.log(`[skip] ${OLD_DIR} already moved`);
    return;
  }
  if (existsSync(join(REPO_ROOT, NEW_DIR))) {
    throw new Error(`${NEW_DIR} already exists — refusing to clobber`);
  }
  console.log(`[mv]   ${OLD_DIR} → ${NEW_DIR}`);
  sh(`git mv ${OLD_DIR} ${NEW_DIR}`);
}

// --- Step 2: tsconfig.base.json ---
function rewriteTsconfigBase() {
  const path = join(REPO_ROOT, 'tsconfig.base.json');
  const json = readJson(path);
  const paths = json.compilerOptions?.paths;
  if (!paths) throw new Error('tsconfig.base.json has no compilerOptions.paths');

  const next = {};
  let renamed = 0;
  for (const [key, value] of Object.entries(paths)) {
    let newKey = key;
    let newValue = value;
    if (key.startsWith(OLD_ALIAS)) {
      newKey = NEW_ALIAS + key.slice(OLD_ALIAS.length);
      newValue = (value ?? []).map((v) =>
        typeof v === 'string'
          ? v.replace(/^\.\/libs\/ui\//, './libs/spartan-ui/')
          : v,
      );
      renamed++;
    }
    next[newKey] = newValue;
  }
  json.compilerOptions.paths = next;
  writeJson(path, json);
  console.log(`[json] tsconfig.base.json — ${renamed} path mappings rewritten`);
}

// --- Step 3: components.json ---
function rewriteComponentsJson() {
  const path = join(REPO_ROOT, 'components.json');
  const json = readJson(path);
  if (json.componentsPath === OLD_DIR) json.componentsPath = NEW_DIR;
  if (json.importAlias === '@mozart/ui') json.importAlias = '@spartan-ui';
  writeJson(path, json);
  console.log('[json] components.json — componentsPath + importAlias updated');
}

// --- Step 4: libs/spartan-ui/*/project.json sourceRoot ---
function rewriteProjectJsons() {
  const root = join(REPO_ROOT, NEW_DIR);
  const entries = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
  let touched = 0;
  for (const entry of entries) {
    const pjPath = join(root, entry.name, 'project.json');
    if (!existsSync(pjPath)) continue;
    const json = readJson(pjPath);
    let changed = false;
    if (typeof json.sourceRoot === 'string' && json.sourceRoot.startsWith('libs/ui/')) {
      json.sourceRoot = 'libs/spartan-ui/' + json.sourceRoot.slice('libs/ui/'.length);
      changed = true;
    }
    if (changed) {
      writeJson(pjPath, json);
      touched++;
    }
  }
  console.log(`[json] project.json sourceRoot rewritten in ${touched} libraries`);
}

// --- Step 5: workspace-wide string replace of @spartan-ui/ → @spartan-ui/ ---
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.angular',
  '.nx',
  'dist',
  'out-tsc',
  'target',
  'tmp',
  '.cache',
]);
const ARCHIVE_PREFIX = 'docs' + sep + 'archive' + sep;
const EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.html', '.css', '.scss',
  '.md', '.mdx',
  '.json',
  '.sh',
  '.yml', '.yaml',
]);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.changelog') {
      if (entry.name === '.git' || entry.name === '.angular' || entry.name === '.nx' || entry.name === '.cache') continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      const rel = relative(REPO_ROOT, full);
      if (rel.startsWith(ARCHIVE_PREFIX)) continue;
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (!EXTENSIONS.has(ext)) continue;
      out.push(full);
    }
  }
}

function rewriteImportsAcrossWorkspace() {
  const files = [];
  walk(REPO_ROOT, files);
  let touched = 0;
  let hitCount = 0;
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.includes(OLD_ALIAS)) continue;
    // Already updated tsconfig.base.json + components.json + project.json in earlier steps
    // — running the same replace again is idempotent.
    const updated = content.split(OLD_ALIAS).join(NEW_ALIAS);
    if (updated !== content) {
      writeFileSync(file, updated);
      touched++;
      hitCount += (content.match(new RegExp(OLD_ALIAS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    }
  }
  console.log(`[grep] @spartan-ui/ → @spartan-ui/ — ${touched} files, ${hitCount} occurrences`);
}

// --- Step 6: literal libs/ui/ → libs/spartan-ui/ in non-JSON docs/scripts ---
// (Already handled the JSON files above; here we update markdown / shell that
// reference the directory by literal path so the docs don't lie.)
function rewriteLiteralPathReferences() {
  const files = [];
  walk(REPO_ROOT, files);
  let touched = 0;
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    // Don't rewrite TS/JS — those almost never reference the literal path,
    // and we don't want to touch strings inside source comments by accident.
    if (rel.endsWith('.md') || rel.endsWith('.mdx') || rel.endsWith('.sh')) {
      const content = readFileSync(file, 'utf8');
      if (!content.includes('libs/ui/') && !content.includes('libs/ui ')) continue;
      // Be careful: only replace `libs/ui/` and `libs/ui` when followed by a
      // word boundary that suggests it's the directory (not a substring of
      // something else like `libs/ui-foo`). The patterns we care about are
      // `libs/ui/`, `libs/ui)`, `libs/ui ` (space), and `libs/ui` at EOL.
      let updated = content
        .replace(/\blibs\/ui\//g, 'libs/spartan-ui/')
        .replace(/\blibs\/ui\b/g, 'libs/spartan-ui');
      if (updated !== content) {
        writeFileSync(file, updated);
        touched++;
      }
    }
  }
  console.log(`[grep] libs/ui/ → libs/spartan-ui/ in md/sh — ${touched} files`);
}

// --- Run ---
console.log('=== rename-libs-ui-to-spartan-ui ===');
moveDirectory();
rewriteTsconfigBase();
rewriteComponentsJson();
rewriteProjectJsons();
rewriteImportsAcrossWorkspace();
rewriteLiteralPathReferences();
console.log('done.');
