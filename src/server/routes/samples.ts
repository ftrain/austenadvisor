// The samples a student can start from. Each entry is its line in samples/index.json with the sample's text added.
// Without an index, every .txt file is listed with what can be read from it: its id, file, title and text.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../db.ts';
import { route, send } from '../http.ts';

export interface Sample {
  id: string;
  file: string;
  title: string;
  text: string;
  kind?: string;
  level?: string;
  words?: number;
  teaches?: string[];
  bestVoices?: string[];
  pending?: string[];
}

export function listSamples(dir = join(ROOT, 'samples')): Sample[] {
  if (!existsSync(dir)) return [];
  const read = (file: string) => {
    const f = join(dir, file);
    return file.endsWith('.txt') && !file.includes('/') && existsSync(f) ? readFileSync(f, 'utf8') : null;
  };
  const index = join(dir, 'index.json');
  if (existsSync(index)) {
    try {
      const entries = JSON.parse(readFileSync(index, 'utf8')) as Omit<Sample, 'text'>[];
      const out: Sample[] = [];
      for (const e of entries) {
        const text = read(String(e.file));
        if (text !== null) out.push({ ...e, text });
      }
      return out;
    } catch (e) {
      console.error(`samples/index.json: ${(e as Error).message}; listing the .txt files instead`);
    }
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((file) => {
      const text = read(file)!;
      return { id: file.replace(/\.txt$/, ''), file, title: /^#\s*(.*)$/m.exec(text)?.[1] ?? file, text };
    });
}

route('GET', '/api/samples', (_q, res) => send(res, 200, listSamples()));
