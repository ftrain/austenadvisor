// npm run build:model -- austen
// Builds data/english.sqlite (WordNet 3.1 and the Brown-trained tagger: once, for every author) and
// data/<author>.sqlite (the works and the model of them).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, ROOT, authorDbPath, englishDbPath, getMeta, open, setMeta } from '../db.ts';
import { buildCorpus } from '../corpus/build.ts';
import { readAuthor } from '../corpus/sources.ts';
import { readBrown, Tagger, type TaggerModel } from '../nlp/tagger.ts';
import { loadWordNet, WordNet, WORDNET_SCHEMA } from '../nlp/wordnet.ts';
import { unzip } from '../nlp/zip.ts';
import { trainModel } from './model.ts';

const NLTK = 'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora';

async function nltkZip(name: string): Promise<Map<string, Buffer>> {
  const dir = join(DATA, 'sources', 'nltk');
  const file = join(dir, `${name}.zip`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    console.log(`fetching ${name}.zip from NLTK's data`);
    const res = await fetch(`${NLTK}/${name}.zip`);
    if (!res.ok) throw new Error(`${name}.zip: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return unzip(readFileSync(file));
}

export async function buildEnglish(force = false): Promise<void> {
  const db = open(englishDbPath());
  db.exec(WORDNET_SCHEMA);
  if (force || !getMeta(db, 'wordnet')) {
    console.log('WordNet 3.1');
    const n = loadWordNet(db, await nltkZip('wordnet31'));
    setMeta(db, 'wordnet', { synsets: n, version: '3.1' });
  }
  if (force || !getMeta(db, 'tagger')) {
    console.log('Training the tagger on the Brown Corpus');
    const t = Tagger.train(readBrown(await nltkZip('brown')), 5, console.log);
    setMeta(db, 'tagger', t.toJSON());
  }
  db.close();
}

export async function buildAuthor(id: string): Promise<void> {
  const author = readAuthor(ROOT, id);
  console.log(`${author.name}: the works`);
  const db = open(authorDbPath(id));
  const counts = buildCorpus(db, author);
  console.log(`  ${counts.works} works, ${counts.chapters} chapters, ${counts.paragraphs} paragraphs, ${counts.sentences} sentences, ${counts.words.toLocaleString()} words`);
  const eng = open(englishDbPath(), { readOnly: true });
  const tagger = Tagger.from(getMeta<TaggerModel>(eng, 'tagger')!);
  console.log(`${author.name}: the model`);
  console.time('  model');
  trainModel(db, tagger, new WordNet(eng));
  console.timeEnd('  model');
  db.exec('VACUUM');
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((a) => !a.startsWith('--'));
  await buildEnglish(force);
  for (const id of ids.length ? ids : ['austen']) await buildAuthor(id);
}
