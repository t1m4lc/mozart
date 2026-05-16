/// <reference types="vitest" />
import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

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
  plugins: [
    analog({
      ssr: false,
      static: true,
      prerender: {
        routes: ['/'],
        discover: false,
      },
    }),
    tailwindcss(),
  ],
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
