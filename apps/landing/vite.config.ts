/// <reference types="vitest" />
import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

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

const changelogDetailSlugs = (): string[] => {
  const root = join(__dirname, 'src/content/changelog');
  return contentSlugs('changelog').filter((slug) => {
    try {
      const raw = readFileSync(join(root, `${slug}.md`), 'utf8');
      return /^\s*detail\s*:\s*true\s*$/m.test(raw);
    } catch {
      return false;
    }
  });
};

const docsRoutes = contentSlugs('docs').map((slug) => `/docs/${slug}`);
const blogRoutes = contentSlugs('blog').map((slug) => `/blog/${slug}`);
const changelogRoutes = changelogDetailSlugs().map(
  (slug) => `/changelog/${slug}`,
);

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
      },
    }),
    nxViteTsPaths(),
    tailwindcss(),
  ],
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
