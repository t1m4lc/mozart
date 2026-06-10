#!/usr/bin/env node
// Emit AI-friendly index files for crawlers and RAG pipelines:
//   /llms.txt       — compact index of docs/blog/changelog (titles + URLs + descriptions)
//   /llms-full.txt  — full Markdown content concatenated for offline / extended context
//
// Pattern follows analogjs.org's own files (see
// https://analogjs.org/docs/integrations/ai#llms-index-files). The generator
// reads source content from apps/landing/src/content/{docs,blog,changelog}
// and writes into every dist root produced by the Analog static build.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC_CONTENT = resolve(ROOT, 'src/content');
const DIST_CANDIDATES = [
  resolve(ROOT, '../../dist/apps/landing/analog/public'),
  resolve(ROOT, '../../dist/apps/landing'),
];

const SITE_URL = 'https://mozart.build';
const SITE_TITLE = 'Mozart';
const SITE_SUMMARY =
  'Local-first desktop app for running AI agents on your own files. Agents (Claude Code, Codex today) work in isolated workspaces and you review every change before accepting it. Free forever for individuals.';

// Marketing pages aren't markdown content; their titles/descriptions are
// read from the prerendered HTML so llms.txt never drifts from the pages.
const PAGE_ROUTES = [
  '/download',
  '/pricing',
  '/for/sales',
  '/for/marketing',
  '/for/recruiting',
  '/for/small-business',
];

// Normalize smart punctuation to ASCII. `.txt` is often served without a
// `charset=utf-8` header, so a UTF-8 em-dash renders as mojibake ("â€”").
// Keeping the index ASCII-only sidesteps that entirely (and reads fine for
// the crawlers/RAG pipelines this file targets).
function asciiPunctuation(text) {
  return text
    .replace(/[—–]/g, '-') // em / en dash → hyphen
    .replace(/[‘’]/g, "'") // curly single quotes → '
    .replace(/[“”]/g, '"') // curly double quotes → "
    .replace(/…/g, '...') // ellipsis → ...
    .replace(/\u00a0/g, ' '); // non-breaking space → space
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findDistRoots() {
  const roots = [];
  for (const candidate of DIST_CANDIDATES) {
    if (!(await exists(candidate))) continue;
    const items = await readdir(candidate);
    if (items.includes('index.html') || items.includes('sitemap.xml')) {
      roots.push(candidate);
    }
  }
  if (roots.length === 0) {
    throw new Error(
      `generate-llms: cannot find dist root in any of:\n  ${DIST_CANDIDATES.join('\n  ')}`,
    );
  }
  return roots;
}

async function walkMarkdown(dir, prefix = '') {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const next = join(dir, entry.name);
    const slug = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...(await walkMarkdown(next, slug)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push({ path: next, slug: slug.replace(/\.md$/, '') });
    }
  }
  return results;
}

// Minimal YAML front-matter parser — handles the keys we ship today
// (title, description, date, version, order). Avoids pulling a dep into a
// build-time script that runs after the bundle is sealed.
function parseFrontMatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { attrs: {}, body: raw };
  const [, head, body] = match;
  const attrs = {};
  for (const line of head.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, valueRaw] = kv;
    let value = valueRaw.trim();
    if (!value) continue;
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    attrs[key] = value;
  }
  return { attrs, body };
}

function humanizeSentenceCase(slug) {
  const words = slug.replace(/[-_]/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function humanizeTitleCase(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const DOCS_GROUP_ORDER = [
  'getting-started',
  'concepts',
  'how-to',
  'reference',
  'community',
];

function docsGroupRank(slug) {
  const idx = DOCS_GROUP_ORDER.indexOf(slug);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

async function loadEntries(subdir, deriveEntry) {
  const root = join(SRC_CONTENT, subdir);
  const files = await walkMarkdown(root);
  const entries = [];
  for (const file of files) {
    const raw = await readFile(file.path, 'utf8');
    const { attrs, body } = parseFrontMatter(raw);
    entries.push(deriveEntry({ slug: file.slug, attrs, body: body.trim() }));
  }
  return entries;
}

function buildDocsEntry({ slug, attrs, body }) {
  const segments = slug.split('/');
  const isUngrouped = segments.length === 1;
  const groupSlug = isUngrouped ? 'getting-started' : segments[0];
  const fileSlug = segments[segments.length - 1];
  return {
    kind: 'docs',
    slug,
    url: `${SITE_URL}/docs/${slug}/`,
    title: attrs.title ?? humanizeSentenceCase(fileSlug),
    description: attrs.description ?? '',
    groupSlug,
    groupTitle: humanizeTitleCase(groupSlug),
    order: attrs.order ? Number(attrs.order) : Number.POSITIVE_INFINITY,
    body,
  };
}

function buildBlogEntry({ slug, attrs, body }) {
  return {
    kind: 'blog',
    slug,
    url: `${SITE_URL}/blog/${slug}/`,
    title: attrs.title ?? humanizeSentenceCase(slug),
    description: attrs.description ?? '',
    date: attrs.date ?? '',
    body,
  };
}

function buildChangelogEntry({ slug, attrs, body }) {
  const version = attrs.version ?? slug.replace(/^v/, '').replace(/-/g, '.');
  const headline = attrs.title ? `${version} — ${attrs.title}` : version;
  return {
    kind: 'changelog',
    slug,
    url: `${SITE_URL}/changelog/${slug}/`,
    title: headline,
    description: attrs.title ?? '',
    date: attrs.date ?? '',
    version,
    body,
  };
}

function sortDocs(entries) {
  return [...entries].sort((a, b) => {
    const ga = docsGroupRank(a.groupSlug);
    const gb = docsGroupRank(b.groupSlug);
    if (ga !== gb) return ga - gb;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });
}

function sortDateDesc(entries) {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function renderLlmsTxt({ pages, docsByGroup, blog, changelog }) {
  const lines = [];
  lines.push(`# ${SITE_TITLE}`);
  lines.push('');
  lines.push(`> ${SITE_SUMMARY}`);
  lines.push('');
  lines.push(`Home: ${SITE_URL}`);
  lines.push('');

  if (pages.length > 0) {
    lines.push('## Pages');
    lines.push('');
    for (const entry of pages) lines.push(formatBullet(entry));
    lines.push('');
  }

  for (const group of docsByGroup) {
    lines.push(`## Docs — ${group.title}`);
    lines.push('');
    for (const entry of group.entries) {
      lines.push(formatBullet(entry));
    }
    lines.push('');
  }

  if (blog.length > 0) {
    lines.push('## Blog');
    lines.push('');
    for (const entry of blog) lines.push(formatBullet(entry));
    lines.push('');
  }

  if (changelog.length > 0) {
    lines.push('## Changelog');
    lines.push('');
    for (const entry of changelog) lines.push(formatBullet(entry));
    lines.push('');
  }

  return lines.join('\n');
}

function formatBullet(entry) {
  const desc = entry.description ? `: ${entry.description}` : '';
  return `- [${entry.title}](${entry.url})${desc}`;
}

function renderLlmsFullTxt({ docs, blog, changelog }) {
  const lines = [];
  lines.push(`# ${SITE_TITLE} — full documentation`);
  lines.push('');
  lines.push(`> ${SITE_SUMMARY}`);
  lines.push('');
  lines.push(`Source: ${SITE_URL}`);
  lines.push('');

  const section = (heading, entries) => {
    if (entries.length === 0) return;
    lines.push(`# ${heading}`);
    lines.push('');
    for (const entry of entries) {
      lines.push(`## ${entry.title}`);
      lines.push('');
      lines.push(`URL: ${entry.url}`);
      if (entry.description) lines.push(`Description: ${entry.description}`);
      lines.push('');
      if (entry.body) {
        lines.push(entry.body);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  };

  section('Docs', docs);
  section('Blog', blog);
  section('Changelog', changelog);

  return lines.join('\n');
}

async function loadPageEntries(distRoot) {
  const entries = [];
  for (const route of PAGE_ROUTES) {
    const htmlPath = join(distRoot, route.slice(1), 'index.html');
    if (!(await exists(htmlPath))) continue;
    const html = await readFile(htmlPath, 'utf8');
    const title =
      /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? route;
    const description =
      /<meta\s+name="description"\s+content="([^"]*)"/i
        .exec(html)?.[1]
        ?.trim() ?? '';
    entries.push({ url: `${SITE_URL}${route}/`, title, description });
  }
  return entries;
}

async function main() {
  const [docsRaw, blogRaw, changelogRaw] = await Promise.all([
    loadEntries('docs', buildDocsEntry),
    loadEntries('blog', buildBlogEntry),
    loadEntries('changelog', buildChangelogEntry),
  ]);

  const docs = sortDocs(docsRaw);
  const blog = sortDateDesc(blogRaw);
  const changelog = sortDateDesc(changelogRaw);

  const docsByGroup = (() => {
    const groups = new Map();
    for (const entry of docs) {
      const bucket = groups.get(entry.groupSlug) ?? {
        slug: entry.groupSlug,
        title: entry.groupTitle,
        entries: [],
      };
      bucket.entries.push(entry);
      groups.set(entry.groupSlug, bucket);
    }
    return [...groups.values()].sort(
      (a, b) => docsGroupRank(a.slug) - docsGroupRank(b.slug),
    );
  })();

  const distRoots = await findDistRoots();
  const pages = await loadPageEntries(distRoots[0]);

  const llms = asciiPunctuation(
    renderLlmsTxt({ pages, docsByGroup, blog, changelog }),
  );
  const llmsFull = asciiPunctuation(renderLlmsFullTxt({ docs, blog, changelog }));

  // Keep the source public/ file in sync so dev server reflects current content.
  const publicDir = resolve(ROOT, 'public');
  await writeFile(join(publicDir, 'llms.txt'), llms, 'utf8');
  console.log(`generate-llms: updated source public/llms.txt`);

  for (const root of distRoots) {
    await writeFile(join(root, 'llms.txt'), llms, 'utf8');
    await writeFile(join(root, 'llms-full.txt'), llmsFull, 'utf8');
    console.log(
      `generate-llms: wrote llms.txt (${pages.length} pages, ${docs.length} docs, ${blog.length} blog, ${changelog.length} changelog) → ${root}`,
    );
  }
}

await main();
