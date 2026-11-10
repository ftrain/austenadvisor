// Builds samples/index.json from the sample texts. The title comes from each file's "# " heading, the word count
// from its body, and the kind from a few cues in the words. An existing index is merged: kind, level, teaches,
// bestVoices and pending, once set by hand, are kept. A voice named under "pending" moves to bestVoices once its
// authors/<id>.json exists.
//
//   node scripts/index-samples.ts          write samples/index.json
//   node scripts/index-samples.ts --check  exit 1 if the index is out of date

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KINDS = ['argument', 'story', 'letter', 'speech', 'essay', 'review'] as const;
export const LEVELS = ['6-8', '9-10', '11-12', 'college'] as const;
export type Kind = (typeof KINDS)[number];
export type Level = (typeof LEVELS)[number];

/** Voices planned but not built yet. A sample may name them under `pending`. */
export const PENDING_VOICES = [
  'lincoln', 'federalist', 'douglass', 'johnson', 'hemingway', 'hammett', 'woolf',
  'gibbon', 'dickens', 'wilde', 'chesterton', 'emerson', 'thoreau',
];

export interface SampleEntry {
  id: string;
  file: string;
  title: string;
  kind: Kind;
  level: Level;
  words: number;
  /** Glossary ids or move ids the sample gives a reason to learn. */
  teaches: string[];
  /** Built voices that suit the sample best. */
  bestVoices: string[];
  /** Voices that would suit it, not built yet. */
  pending: string[];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SAMPLES_DIR = join(ROOT, 'samples');
export const AUTHORS_DIR = join(ROOT, 'authors');
export const INDEX_PATH = join(SAMPLES_DIR, 'index.json');

/** Splits a sample into its "# " heading and the body after it. */
export function splitSample(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (at < 0) return { title: '', body: text.trim() };
  return { title: lines[at]!.replace(/^#\s+/, '').trim(), body: lines.slice(at + 1).join('\n').trim() };
}

/** Words are runs separated by white space that hold a letter or a digit. */
export function countWords(body: string): number {
  return body.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

/** Guesses a sample's kind from a few cues. A guess only: a kind set by hand in the index wins. */
export function guessKind(title: string, body: string): Kind {
  const t = body.toLowerCase();
  const words = Math.max(1, countWords(body));
  if (/\breview\b/i.test(title)) return 'review';
  if (/^(dear|to whom|hey|hi|hello)\b[^\n]{0,40},\s*$/im.test(body.split('\n')[0] ?? '')) return 'letter';
  const firstPerson = count(t, /\b(i|me|my|we|our)\b/g) / words;
  const past = count(t, /\b\w+ed\b|\b(was|were|had|said|went|came|saw|got|took|told|thought|knew|felt|ran|sat|made)\b/g);
  const present = count(t, /\b(is|are|am|do|does|has|have|says)\b/g);
  const dialogue = count(body, /["“]/g) >= 2 || /\b(said|asked|told)\b/.test(t);
  if (firstPerson > 0.03 && past > present * 1.5 && dialogue) return 'story';
  if (count(t, /\b(should|must|because)\b/g) >= 2) return 'argument';
  if (/\b(everyone|everybody|you all|ladies and gentlemen|raise your glass|vote for)\b/.test(t) && /^(hi|hello|good (morning|evening))\b/i.test(body)) return 'speech';
  return 'essay';
}

const builtVoices = (): Set<string> =>
  new Set(readdirSync(AUTHORS_DIR).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json')));

export function readIndex(path = INDEX_PATH): SampleEntry[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as SampleEntry[];
}

/** The index the sample files call for, keeping what was set by hand in `previous`. */
export function buildIndex(previous: SampleEntry[] = readIndex(), dir = SAMPLES_DIR, built = builtVoices()): SampleEntry[] {
  const old = new Map(previous.map((e) => [e.file, e]));
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((file) => {
      const { title, body } = splitSample(readFileSync(join(dir, file), 'utf8'));
      const was = old.get(file);
      const voices = [...(was?.bestVoices ?? []), ...(was?.pending ?? [])];
      return {
        id: basename(file, '.txt'),
        file,
        title,
        kind: was?.kind ?? guessKind(title, body),
        level: was?.level ?? '9-10',
        words: countWords(body),
        teaches: was?.teaches ?? [],
        bestVoices: voices.filter((v) => built.has(v)),
        pending: voices.filter((v) => !built.has(v)),
      };
    });
}

export const formatIndex = (index: SampleEntry[]): string =>
  '[\n' + index.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = formatIndex(buildIndex());
  const now = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (next !== now) {
      console.error('samples/index.json is out of date. Run: node scripts/index-samples.ts');
      process.exit(1);
    }
  } else {
    writeFileSync(INDEX_PATH, next);
    console.log(`Wrote ${INDEX_PATH}`);
  }
}
