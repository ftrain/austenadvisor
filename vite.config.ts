import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Where the page is served from. '/' by default; ADVISOR_BASE=/reviser/ for unscroll.com, where nginx takes /reviser/
// off each request before it reaches the server, so the server itself always answers at its root.
const base = `/${(process.env.ADVISOR_BASE ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  base,
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true, target: 'es2022' },
  server: { port: 4180, allowedHosts: ['.exe.xyz', 'localhost'] },
});
