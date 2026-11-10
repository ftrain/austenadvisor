// The Advisor server: the engine's answers and the rewrite over HTTP, and the page (Vite in development, dist/
// when built). The routes are in routes/.
//
//   npm run dev            # http://localhost:4180, the page rebuilt as it changes
//   npm start              # the built page from dist/

import { createApp } from './app.ts';
import { AI_KEYS, aiAvailable, READER, READER_ON, WRITER_MODEL } from './rewrite.ts';
import { bootModels } from './models.ts';
import { authors } from './voices.ts';

const PORT = Number(process.env.PORT ?? 4180);
const DEV = process.argv.includes('--dev');

// A request that fails outside its handler is logged, and the server goes on serving the others.
process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e));

async function main() {
  const server = await createApp({ dev: DEV, hmrPort: PORT + 1 });
  // Every built voice's pack, and the whole models of the voices most often suggested, read before the first writer arrives.
  bootModels(authors().filter((x) => x.built).map((a) => a.id), console.log);
  server.listen(PORT, () => console.log(`Advisor at http://localhost:${PORT}${aiAvailable() ? ` (writer ${WRITER_MODEL}, reader ${READER_ON ? READER : 'off'})` : ` (rewrites off: no ${AI_KEYS})`}`));
}

void main();
