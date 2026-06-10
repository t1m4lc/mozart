#!/usr/bin/env node
// Walk the prerendered landing output and assert SEO essentials:
// - sitemap.xml exists and includes the canonical static routes
// - robots.txt references the sitemap
// - /privacy and /terms HTML carry noindex
// - every static route's HTML still has the index.html shell metadata
//   (description, og:title, og:image, canonical, exactly one declared h1).

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, '../../dist/apps/landing/analog/public');

const REQUIRED_SITEMAP_ROUTES = [
  '/',
  '/docs',
  '/docs/introduction',
  '/docs/install',
  '/docs/quickstart',
  '/docs/concepts/local-first',
  '/docs/concepts/isolated-workspaces',
  '/docs/community/we-are-mozart',
  '/blog',
  '/blog/hello-world',
  '/changelog',
  '/for/sales',
  '/for/marketing',
  '/for/recruiting',
  '/for/small-business',
  '/pricing',
  '/join-us',
];
const SITEMAP_FORBIDDEN_ROUTES = ['/privacy', '/terms'];

// Prerendered routes intentionally NOT listed as bullets in llms.txt: the home
// page (it's the "Home:" line), section index pages (covered by their section
// headers + child entries), and the noindex legal pages. Every other route that
// ships an index.html must appear in llms.txt — content pages are auto-discovered
// by generate-llms.mjs, static marketing pages via its PAGE_ROUTES list.
const LLMS_EXEMPT_ROUTES = new Set([
  '/',
  '/docs',
  '/blog',
  '/changelog',
  '/privacy',
  '/terms',
]);

const failures = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function checkSitemap() {
  const sitemapPath = join(DIST, 'sitemap.xml');
  if (!(await exists(sitemapPath))) {
    failures.push(`sitemap.xml missing at ${sitemapPath}`);
    return;
  }
  const xml = await readFile(sitemapPath, 'utf8');
  for (const route of REQUIRED_SITEMAP_ROUTES) {
    const slashed = route === '/' ? '/' : `${route}/`;
    const loc = `<loc>https://mozart.build${slashed}</loc>`;
    if (!xml.includes(loc)) {
      failures.push(`sitemap.xml missing required route: ${route}`);
    }
  }
  for (const route of SITEMAP_FORBIDDEN_ROUTES) {
    const loc = `<loc>https://mozart.build${route}</loc>`;
    if (xml.includes(loc)) {
      failures.push(`sitemap.xml still contains forbidden route: ${route}`);
    }
  }
}

async function checkRobots() {
  const robotsPath = join(DIST, 'robots.txt');
  if (!(await exists(robotsPath))) {
    failures.push('robots.txt missing');
    return;
  }
  const text = await readFile(robotsPath, 'utf8');
  if (!text.includes('Sitemap:')) {
    failures.push('robots.txt missing Sitemap: directive');
  }
}

async function checkLlmsIndex() {
  for (const file of ['llms.txt', 'llms-full.txt']) {
    const path = join(DIST, file);
    if (!(await exists(path))) {
      failures.push(`${file} missing at dist root`);
      continue;
    }
    const text = await readFile(path, 'utf8');
    if (!text.includes('https://mozart.build')) {
      failures.push(`${file} missing canonical URLs`);
    }
    if (!text.includes('/docs/introduction')) {
      failures.push(`${file} missing docs entries`);
    }
    if (file === 'llms.txt' && !text.includes('/for/sales')) {
      failures.push('llms.txt missing marketing page entries');
    }
  }
}

// Catch a new prerendered page that was never registered in llms.txt: a
// forgotten PAGE_ROUTES entry would otherwise vanish silently from the index.
async function checkLlmsCoverage(routes) {
  const llmsPath = join(DIST, 'llms.txt');
  if (!(await exists(llmsPath))) return; // checkLlmsIndex already reported it
  const llms = await readFile(llmsPath, 'utf8');
  for (const route of routes) {
    if (LLMS_EXEMPT_ROUTES.has(route)) continue;
    const url = `https://mozart.build${route}/`;
    if (!llms.includes(url)) {
      failures.push(
        `llms.txt missing prerendered route ${route} — add it to PAGE_ROUTES in generate-llms.mjs, or to LLMS_EXEMPT_ROUTES in check-seo.mjs if intentionally excluded`,
      );
    }
  }
}

async function checkNoindex(route) {
  const htmlPath = join(DIST, route.slice(1), 'index.html');
  if (!(await exists(htmlPath))) {
    failures.push(`${route}/index.html missing`);
    return;
  }
  const html = await readFile(htmlPath, 'utf8');
  if (!/<meta\s+name="robots"\s+content="noindex,nofollow"/i.test(html)) {
    failures.push(`${route}/index.html missing noindex meta`);
  }
}

async function checkRouteShell(route) {
  const segment = route === '/' ? '' : route.slice(1);
  const htmlPath = segment
    ? join(DIST, segment, 'index.html')
    : join(DIST, 'index.html');
  if (!(await exists(htmlPath))) {
    failures.push(`${route} prerendered HTML missing`);
    return;
  }
  const html = await readFile(htmlPath, 'utf8');

  // The SPA shell ships baseline SEO meta from index.html; every prerendered
  // route should keep it. (Per-route overrides happen client-side via Meta.)
  const required = [
    ['<title>', 'title tag'],
    ['name="description"', 'description meta'],
    ['property="og:title"', 'og:title meta'],
    ['property="og:image"', 'og:image meta'],
    ['rel="canonical"', 'canonical link'],
    ['name="twitter:card"', 'twitter:card meta'],
  ];
  for (const [needle, label] of required) {
    if (!html.includes(needle)) {
      failures.push(`${route}: missing ${label}`);
    }
  }

  // Exactly one declared <h1>. The SPA shell defers h1 to client render, so
  // count *declared* h1 nodes in the static HTML (which should be zero), or
  // accept exactly one if the route is server-rendered. Either way: never > 1.
  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count > 1) {
    failures.push(`${route}: ${h1Count} <h1> nodes declared (must be ≤ 1)`);
  }
}

async function listPrerenderedRoutes() {
  if (!(await exists(DIST))) {
    failures.push(`dist root missing: ${DIST}`);
    return [];
  }
  const found = [];
  const walk = async (dir, prefix) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const next = join(dir, entry.name);
      const slug = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'assets' || entry.name === 'fonts') continue;
        await walk(next, slug);
      } else if (entry.isFile() && entry.name === 'index.html') {
        found.push(prefix ? `/${prefix}` : '/');
      }
    }
  };
  await walk(DIST, '');
  return found;
}

await checkSitemap();
await checkRobots();
await checkLlmsIndex();
for (const route of SITEMAP_FORBIDDEN_ROUTES) {
  await checkNoindex(route);
}

const routes = await listPrerenderedRoutes();
await checkLlmsCoverage(routes);
for (const route of routes) {
  await checkRouteShell(route);
}

if (failures.length > 0) {
  console.error('check-seo failures:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`check-seo: ok (${routes.length} routes inspected)`);
