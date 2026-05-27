/// <reference types="vitest" />
import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const contentSlugs = (subdir: string): string[] => {
  const root = join(__dirname, 'src/content', subdir);
  const walk = (dir: string, prefix: string): string[] => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const next = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return walk(join(dir, entry.name), next);
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return [next.replace(/\.md$/, '')];
      }
      return [];
    });
  };
  return walk(root, '');
};

const docsRoutes = contentSlugs('docs').map((slug) => `/docs/${slug}`);
const blogRoutes = contentSlugs('blog').map((slug) => `/blog/${slug}`);
const changelogRoutes = contentSlugs('changelog').map(
  (slug) => `/changelog/${slug}`,
);

// Mirrors public/_redirects (Cloudflare Pages) in `vite dev` so vanity
// URLs like /discord work at localhost too. Production is unaffected —
// CF serves _redirects at the edge before any file is fetched.
function devRedirectsFromCloudflareFile(): Plugin {
  const file = join(__dirname, 'public/_redirects');
  type Rule = { from: string; to: string; status: number };
  const parse = (): Rule[] => {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      return [];
    }
    return raw
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .flatMap((line) => {
        const [from, to, statusRaw] = line.split(/\s+/);
        if (!from || !to) return [];
        const status = Number(statusRaw) || 302;
        return [{ from, to, status }];
      });
  };
  return {
    name: 'mozart-dev-redirects',
    apply: 'serve',
    configureServer(server) {
      const rules = parse();
      if (rules.length === 0) return;
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const hit = rules.find((r) => r.from === path);
        if (!hit) return next();
        res.writeHead(hit.status, { Location: hit.to });
        res.end();
      });
    },
  };
}

// Mirrors the Cloudflare Pages Functions under functions/api/analytics/* in
// `vite dev`. Production uses CF Functions directly — this plugin is dev-only.
// Reads INTERNAL_DEVICE_TOKEN from process.env (i.e. .env / .env.local loaded
// via `loadEnv`). The cookie name must stay in sync with functions/api/analytics/_lib.ts.
function devAnalyticsApi(token: string | undefined): Plugin {
  const COOKIE = 'mozart_internal_device';
  const MAX_AGE = 60 * 60 * 24 * 365;
  const constantTimeEquals = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  const hasCookie = (header: string | undefined): boolean => {
    if (!header) return false;
    const prefix = `${COOKIE}=`;
    return header
      .split(';')
      .map((s) => s.trim())
      .some((s) => s.startsWith(prefix) && s.length > prefix.length);
  };
  const json = (res: import('http').ServerResponse, status: number, body: unknown, extra?: Record<string, string>) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...extra,
    });
    res.end(JSON.stringify(body));
  };
  return {
    name: 'mozart-dev-analytics-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/analytics/is-internal-device', (req, res, next) => {
        if (req.method !== 'GET') return next();
        json(res, 200, { isInternalDevice: hasCookie(req.headers.cookie) });
      });
      server.middlewares.use('/api/analytics/set-internal-device', (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (!token) return json(res, 503, { error: 'internal_device_token_unset' });
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          let body: { token?: unknown } = {};
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch {
            return json(res, 400, { error: 'invalid_json' });
          }
          const provided = typeof body.token === 'string' ? body.token : '';
          if (!constantTimeEquals(provided, token)) {
            return json(res, 401, { error: 'invalid_token' });
          }
          json(res, 200, { ok: true }, {
            'set-cookie': `${COOKIE}=1; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`,
          });
        });
      });
    },
  };
}

// Exposes libs/mozart-assets/src/{shared,landing}/** at `/assets/...` —
// dev via middleware, build via copy into outDir/assets.
// Also serves shared/favicons/* at the output root (favicon.ico, favicon.svg, manifest.webmanifest).
function mozartAssetsPlugin(): Plugin {
  const libRoot = resolve(__dirname, '../../libs/mozart-assets/src');
  const faviconsRoot = resolve(libRoot, 'shared/favicons');
  const mime: Record<string, string> = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ogg': 'audio/ogg',
    '.webmanifest': 'application/manifest+json',
  };
  let outDir: string | undefined;
  return {
    name: 'mozart-assets',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    configureServer(server) {
      // /assets/* → libs/mozart-assets/src/**
      server.middlewares.use('/assets', (req, res, next) => {
        try {
          const url = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (!url || url.includes('..')) return next();
          const fp = join(libRoot, url);
          if (!fp.startsWith(libRoot)) return next();
          const stat = statSync(fp);
          if (!stat.isFile()) return next();
          res.setHeader('Content-Type', mime[extname(fp).toLowerCase()] ?? 'application/octet-stream');
          createReadStream(fp).pipe(res);
        } catch {
          next();
        }
      });
      // Root-level favicon / manifest files → libs/mozart-assets/src/shared/favicons/
      server.middlewares.use((req, res, next) => {
        try {
          const url = decodeURIComponent((req.url ?? '').split('?')[0]);
          const filename = url.startsWith('/') ? url.slice(1) : url;
          if (!filename || filename.includes('/')) return next();
          const fp = join(faviconsRoot, filename);
          if (!fp.startsWith(faviconsRoot)) return next();
          const stat = statSync(fp);
          if (!stat.isFile()) return next();
          res.setHeader('Content-Type', mime[extname(fp).toLowerCase()] ?? 'application/octet-stream');
          createReadStream(fp).pipe(res);
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      if (!outDir) return;
      // Copy all mozart-assets → /assets/
      cpSync(libRoot, resolve(__dirname, outDir, 'assets'), {
        recursive: true,
        filter: (src) => !src.endsWith('.md'),
      });
      // Copy shared/favicons/ → output root (favicon.ico, favicon.svg, manifest.webmanifest …)
      cpSync(faviconsRoot, resolve(__dirname, outDir), {
        recursive: true,
        filter: (src) => !src.endsWith('.md'),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/landing',
  publicDir: 'public',
  build: {
    target: ['es2022'],
    reportCompressedSize: true,
  },
  resolve: {
    mainFields: ['module'],
    alias: mode === 'production' ? [
      {
        find: /\/environments\/environment$/,
        replacement: resolve(__dirname, 'src/environments/environment.prod.ts'),
      },
    ] : [],
  },
  optimizeDeps: {
    include: ['front-matter', 'marked', 'prismjs', 'prismjs/components/index.js'],
  },
  plugins: [
    analog({
      ssr: true,
      static: true,
      content: { highlighter: 'prism' },
      prerender: {
        routes: [
          '/',
          '/docs',
          ...docsRoutes,
          '/blog',
          ...blogRoutes,
          '/changelog',
          ...changelogRoutes,
          '/privacy',
          '/terms',
          '/download',
        ],
        discover: false,
        sitemap: { host: 'https://mozart.build' },
      },
    }),
    nxViteTsPaths(),
    tailwindcss(),
    devRedirectsFromCloudflareFile(),
    mozartAssetsPlugin(),
  ],
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
