// The engine from the command line.
//
//   npm run cli -- analyze samples/store.txt        what Advisor flags and advises
//   npm run cli -- austenize samples/store.txt      the statistical rewrite, with its reasons
//   npm run cli -- word tolerable                   how the author used a word
//   npm run cli -- concordance "at last"            the author's sentences with a phrase
//   npm run cli -- similar "I went to the shop"     the author's sentences nearest in meaning
//   npm run cli -- rewrite samples/store.txt        Claude with the engine as its tools (ANTHROPIC_API_KEY)
//   --author twain                                   another advisor's model

import { readFileSync } from 'node:fs';
import { analyze } from './engine/analyze.ts';
import { austenize } from './engine/austenize.ts';
import { blocksOfText, textOfBlocks } from './engine/doc.ts';
import { AuthorModel } from './engine/model.ts';
import { concordance, wordProfile } from './engine/tools.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildBrief } from './engine/brief.ts';
import { gate, render, rewriteWithAI, systemPrompt, toolResult, userPrompt, type Submission } from './server/rewrite.ts';

const args = process.argv.slice(2);
const ai = args.indexOf('--author');
const authorId = ai >= 0 ? args.splice(ai, 2)[1]! : 'austen';
const [cmd, ...rest] = args;
const arg = rest.join(' ');
const m = AuthorModel.load(authorId);
const text = () => readFileSync(arg, 'utf8');

switch (cmd) {
  case 'analyze': {
    const a = analyze(m, blocksOfText(text()));
    console.log(`Score ${a.report.score}/100 like ${m.author.short} (${a.ms} ms)\n`);
    for (const f of a.words) console.log(`  [${f.kind}] ${f.word} → ${f.alternatives.map((x) => x.text).join(', ') || '—'}`);
    console.log('');
    for (const x of a.advice) console.log(`  ${x.severity.toUpperCase()} ${x.title}\n    ${x.why}${x.examples[0] ? `\n    “${x.examples[0].text}” — ${x.examples[0].cite}` : ''}`);
    console.log('');
    for (const x of a.report.measures) console.log(`  ${x.label}: yours ${x.yours}, ${m.author.short} ${x.author}`);
    break;
  }
  case 'austenize': {
    const r = austenize(m, blocksOfText(text()));
    console.log(textOfBlocks(r.after));
    console.log(`\nScore ${r.scoreBefore} → ${r.scoreAfter}. Changes:`);
    for (const c of r.changes) console.log(`  “${c.before}” → “${c.after}”: ${c.why}${c.example ? `\n    “${c.example.text}” — ${c.example.cite}` : ''}`);
    if (r.kept.length) console.log(`Kept (no word of ${m.author.short}'s found): ${r.kept.map((k) => k.word).join(', ')}`);
    break;
  }
  case 'word': {
    const p = wordProfile(m, arg, { examples: 5 });
    console.log(p.note);
    if (p.works.length) console.log(`By work: ${p.works.map((w) => `${w.title} ${w.count}`).join('; ')}`);
    if (p.neighbours.length) console.log(`Nearest in her usage: ${p.neighbours.join(', ')}`);
    if (p.collocates.length) console.log(`Found beside it: ${p.collocates.map((c) => c.word).join(', ')}`);
    for (const a of p.alternatives ?? []) console.log(`  instead: ${a.text} (${a.relation}; ${a.count}×)${a.example ? `\n    “${a.example.text}” — ${a.example.cite}` : ''}`);
    for (const c of p.examples) console.log(`  “${c.text}” — ${c.cite}`);
    break;
  }
  case 'concordance':
    for (const k of concordance(m, arg, 20)) console.log(`  ${k.left.slice(-50).padStart(50)} [${k.match}] ${k.right.slice(0, 50)}   — ${k.cite.cite}`);
    break;
  case 'similar':
    for (const c of m.similarSentences(arg, 8, { minWords: 8 })) console.log(`  (${c.sim.toFixed(2)}) “${c.text}” — ${c.cite}`);
    break;
  case 'rewrite': {
    const r = await rewriteWithAI(m, textOfBlocks(blocksOfText(text())), {}, (s) => console.error(`… ${s}`));
    console.log(r.text, `\n\n${r.explanation}\nScore ${r.scoreBefore} → ${r.scoreAfter}; ${r.toolCalls.length} calls to the engine.`);
    for (const n of r.notes) console.log(`  ${n.technique}: “${n.before}” → “${n.after}”\n    ${n.verified ? '✓' : '⚠'} “${n.austen}” — ${n.cite}`);
    break;
  }
  // The rewrite protocol by hand, for testing a model without the API: the prompts out, the tools, the gate.
  case 'brief': {
    const [file, dir] = rest;
    const brief = buildBrief(m, blocksOfText(readFileSync(file!, 'utf8')).filter((b) => b.kind !== 'title'));
    mkdirSync(dir!, { recursive: true });
    writeFileSync(`${dir}/system.txt`, systemPrompt(m));
    writeFileSync(`${dir}/user.txt`, userPrompt(m, brief));
    writeFileSync(`${dir}/brief.json`, JSON.stringify(brief, null, 1));
    console.log(`${dir}/system.txt, ${dir}/user.txt (${brief.sentences.length} sentences, score ${brief.score})`);
    break;
  }
  case 'tool': {
    const [name, json] = rest;
    console.log(toolResult(m, name!, JSON.parse(json ?? '{}')));
    break;
  }
  case 'submit': {
    const [dir, file] = rest;
    const brief = JSON.parse(readFileSync(`${dir}/brief.json`, 'utf8'));
    const sub = JSON.parse(readFileSync(file!, 'utf8')) as Submission;
    const problems = rest.includes('--render') ? [] : gate(m, brief, sub);
    if (problems.length) {
      console.log(`Not yet accepted:\n- ${problems.join('\n- ')}`);
      break;
    }
    const r = render(m, brief, sub);
    writeFileSync(`${dir}/result.json`, JSON.stringify({ ...r, scoreBefore: brief.score, scoreAfter: analyze(m, blocksOfText(r.text)).report.score }, null, 1));
    console.log(`Accepted. Score ${brief.score} → ${analyze(m, blocksOfText(r.text)).report.score}.`);
    break;
  }
  default:
    console.log('npm run cli -- analyze|austenize|word|concordance|similar|rewrite …');
}
