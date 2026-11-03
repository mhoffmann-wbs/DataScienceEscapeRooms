/// <reference types="vitest/config" />
import { createReadStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const BASE = '/DataScienceEscapeRooms/';

// Serves Pyodide's runtime files from our own site instead of a CDN: in dev from
// node_modules, in builds copied to dist/pyodide/. The python worker loads them from there.
function pyodideFiles(): Plugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
  const files = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
  let outDir = 'dist';
  return {
    name: 'pyodide-files',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(`${BASE}pyodide/`, (req, res, next) => {
        const file = req.url?.split('?')[0]?.replace(/^\//, '');
        if (!file || !files.includes(file)) return next();
        if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        if (file.endsWith('.mjs')) res.setHeader('Content-Type', 'text/javascript');
        createReadStream(join(dir, file)).pipe(res);
      });
    },
    async writeBundle() {
      await mkdir(join(outDir, 'pyodide'), { recursive: true });
      await Promise.all(files.map((f) => copyFile(join(dir, f), join(outDir, 'pyodide', f))));
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), pyodideFiles()],
  worker: { format: 'es' },
  // Pyodide must not be pre-bundled: it locates its own files at runtime.
  optimizeDeps: { exclude: ['pyodide'] },
  // Phaser alone is ~1.6 MB minified; that's expected, not a regression.
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
