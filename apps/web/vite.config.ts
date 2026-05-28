/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, createReadStream, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function mozartSharedAssetsPlugin(): Plugin {
  const sharedRoot = resolve(__dirname, '../../libs/mozart-assets/src/shared');
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
  };
  let outDir: string | undefined;
  return {
    name: 'mozart-shared-assets',
    configResolved(cfg) {
      if (cfg.command === 'build') outDir = cfg.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/assets/shared', (req, res, next) => {
        try {
          const url = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (!url || url.includes('..')) return next();
          const fp = join(sharedRoot, url);
          if (!fp.startsWith(sharedRoot)) return next();
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
      cpSync(sharedRoot, resolve(__dirname, outDir, 'assets/shared'), {
        recursive: true,
        filter: (src) => !src.endsWith('.md'),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  publicDir: 'public',
  build: {
    target: ['es2022'],
    reportCompressedSize: true,
  },
  resolve: {
    mainFields: ['module'],
    alias: mode === 'production' ? [
      {
        find: /^.+\/environments\/environment$/,
        replacement: resolve(__dirname, 'src/environments/environment.prod.ts'),
      },
    ] : [],
  },
  server: {
    port: 4201,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        secure: false,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    angular(),
    nxViteTsPaths(),
    tailwindcss(),
    mozartSharedAssetsPlugin(),
    // Self-signed HTTPS on the dev server (port 4201). The desktop's
    // auth flow opens `https://localhost:4201/login?…` — without TLS
    // the browser returns ERR_SSL_PROTOCOL_ERROR. Cert is regenerated
    // on each cold start; accept the warning in the browser once per
    // session. Build/prod is unaffected (plugin is dev-only).
    basicSsl(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
