/// <reference types="vitest" />
import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  },
  optimizeDeps: {
    include: ['front-matter', 'marked', 'prismjs', 'prismjs/components/index.js'],
  },
  plugins: [
    analog({
      ssr: false,
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
        ],
        discover: false,
        sitemap: { host: 'https://mozart.build' },
      },
    }),
    nxViteTsPaths(),
    tailwindcss(),
    devRedirectsFromCloudflareFile(),
  ],
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
