#!/usr/bin/env node
// Post-build SEO touch-ups for apps/landing:
// 1. Drop /privacy and /terms from sitemap.xml while the legal copy is placeholder.
// 2. Inject <meta name="robots" content="noindex,nofollow"> into the static HTML
//    for those two routes so non-JS crawlers respect it.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST_CANDIDATES = [
  resolve(ROOT, '../../dist/apps/landing/analog/public'),
  resolve(ROOT, '../../dist/apps/landing'),
];

const NOINDEX_ROUTES = ['/privacy', '/terms'];
const NOINDEX_META =
  '<meta name="robots" content="noindex,nofollow" />';

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
    if (
      items.includes('sitemap.xml') ||
      items.includes('privacy') ||
      items.includes('terms')
    ) {
      roots.push(candidate);
    }
  }
  if (roots.length === 0) {
    throw new Error(
      `post-build-seo: cannot find dist root in any of:\n  ${DIST_CANDIDATES.join('\n  ')}`,
    );
  }
  return roots;
}

async function scrubSitemap(distRoot) {
  const sitemapPath = join(distRoot, 'sitemap.xml');
  if (!(await exists(sitemapPath))) {
    console.warn('post-build-seo: sitemap.xml missing, skipping scrub');
    return;
  }
  const xml = await readFile(sitemapPath, 'utf8');
  const filtered = xml.replace(
    /<url>[\s\S]*?<\/url>\s*/g,
    (match) => {
      for (const route of NOINDEX_ROUTES) {
        if (match.includes(`<loc>https://mozart.build${route}</loc>`)) {
          return '';
        }
      }
      return match;
    },
  );
  await writeFile(sitemapPath, filtered, 'utf8');
  console.log(
    `post-build-seo: scrubbed ${NOINDEX_ROUTES.join(', ')} from sitemap.xml`,
  );
}

async function trailingSlashSitemap(distRoot) {
  const sitemapPath = join(distRoot, 'sitemap.xml');
  if (!(await exists(sitemapPath))) return;
  const xml = await readFile(sitemapPath, 'utf8');
  // Cloudflare Pages 308-redirects /x → /x/. Carry the slash in <loc> so the
  // sitemap points at the 200 directly (no redirect hop) and matches canonical.
  const next = xml.replace(/<loc>([^<]+)<\/loc>/g, (match, url) =>
    url.endsWith('/') ? match : `<loc>${url}/</loc>`,
  );
  await writeFile(sitemapPath, next, 'utf8');
  console.log('post-build-seo: added trailing slashes to sitemap.xml <loc>');
}

async function injectNoindex(distRoot) {
  for (const route of NOINDEX_ROUTES) {
    const htmlPath = join(distRoot, route.slice(1), 'index.html');
    if (!(await exists(htmlPath))) {
      console.warn(`post-build-seo: ${htmlPath} missing, skipping`);
      continue;
    }
    const html = await readFile(htmlPath, 'utf8');
    if (html.includes('name="robots"')) {
      console.log(`post-build-seo: ${route} already has robots meta`);
      continue;
    }
    const next = html.replace(/<\/head>/i, `  ${NOINDEX_META}\n  </head>`);
    if (next === html) {
      console.warn(`post-build-seo: ${route} has no </head>, skipping`);
      continue;
    }
    await writeFile(htmlPath, next, 'utf8');
    console.log(`post-build-seo: injected noindex into ${route}/index.html`);
  }
}

const distRoots = await findDistRoots();
for (const root of distRoots) {
  await scrubSitemap(root);
  await trailingSlashSitemap(root);
  await injectNoindex(root);
}
