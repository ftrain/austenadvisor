// The Advisor server: the engine's answers and the rewrite over HTTP, and the page (Vite in development, dist/
// when built). The routes are in routes/.
//
//   npm run dev            # http://localhost:4180, the page rebuilt as it changes
//   npm start              # the built page from dist/

import { createApp } from './app.ts';
import { AI_KEYS, aiAvailable, READER, WRITER_MODEL } from './rewrite.ts';
import { authors, model } from './voices.ts';

const PORT = Number(process.env.PORT ?? 4180);
const DEV = process.argv.includes('--dev');

async function main() {
  const server = await createApp({ dev: DEV, hmrPort: PORT + 1 });
  // Each built voice's model, read before the first writer arrives.
  for (const a of authors().filter((x) => x.built)) {
    const t = performance.now();
    const m = model(a.id);
    m.similarSentences('a warm start', 1);
    console.log(`${a.advisor}: ${m.totalWords.toLocaleString()} words of ${a.name}, ready in ${Math.round(performance.now() - t)}ms`);
  }
  server.listen(PORT, () => console.log(`Advisor at http://localhost:${PORT}${aiAvailable() ? ` (writer ${WRITER_MODEL}, reader ${READER})` : ` (Rewrite with AI off: no ${AI_KEYS})`}`));
}

void main();
