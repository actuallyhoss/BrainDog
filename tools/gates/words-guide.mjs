/**
 * `words-guide`: the writing guide's page, made from the words list.
 *
 *   node tools/gates/words-guide.mjs            writes docs/54-WRITING.md
 *   node tools/gates/words-guide.mjs --check    exits 1 when the page is not what the list makes
 *
 * THE GUIDE IS THE LIST, PRINTED, and never a second copy kept by hand. Each word a person must never read, what to say
 * in its place and why come from `words.json`; the page lint's rules about words come from `lint.ts` (`LINT_RULES`), so
 * a rule added there or a word added here changes the page in the same change, and `test/words.test.mjs` fails the day
 * the two disagree. A shape is not printed: it is how the gate finds a word, not what a writer reads. Neither is the
 * held list, which moves with every fix and is about files, not about writing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LINT_RULES } from '../../packages/render/src/lint.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(here, '..', '..');
export const GUIDE = join(REPO, 'docs', '54-WRITING.md');

/* The rules of the page lint that are about words rather than drawing: a writer can break these, a drawer the rest. */
const WORD_RULES = ['em-dash', 'plain-words', 'system-word', 'dev-name', 'bare-key', 'one-word-button', 'title-stop', 'raw-fault'];

/** A table cell: one line, its pipes escaped. */
const cell = (s) => String(s).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

/** The page, from the list as `words.json` holds it. Pure, so the test compares it with the file on disk. */
export function guide(list) {
  const out = [
    '# The writing guide',
    '',
    '**CONTRACT.** Made from `tools/gates/words.json` by `node tools/gates/words-guide.mjs`, and checked against it by',
    '`tools/gates/test/words.test.mjs`. Change the list and run the script; an edit made here by hand turns the test red.',
    '',
    'The words a person reads name their own things, in plain sentences. Two checks hold it: the `words` gate reads every',
    'copy file the app ships and every title, heading, label, body and empty text of a page the seed or a plugin',
    'declares; the page lint reads what a page prints on a real record, and Health shows what it finds.',
    '',
    '## Words a person never reads',
    '',
    '| Never | Say | Why | On a page |',
    '|---|---|---|---|',
  ];
  /* NO TEMPLATE INSIDE ANOTHER'S `${}`: the gates' own reader (`test/handles.test.mjs` blank) reads one level. */
  const tick = (s) => '`' + s + '`';
  for (const w of list.words) out.push(`| ${cell(w.name)} | ${cell(w.say)} | ${cell(w.why)} | ${w.page ? tick(w.page) : 'the source only'} |`);
  out.push(
    '',
    '## Titles, headings, labels and buttons',
    '',
    `${cell(list.titles.why)} Say ${cell(list.titles.say)}. A body is a sentence and ends in one; an ellipsis promises more and is not a full stop.`,
    '',
    '## Buttons of one word',
    '',
    `Only ${list.buttons.slice(0, -1).join(', ')} and ${list.buttons.at(-1)}. Any other button says what it does to what: Save the bill, not Save.`,
    '',
    '## What the page lint finds in the words',
    '',
    '| Rule | What it finds | Read in |',
    '|---|---|---|',
  );
  const rules = new Map(LINT_RULES.map((r) => [r.rule, r]));
  for (const rule of WORD_RULES) {
    const r = rules.get(rule);
    out.push(`| ${tick(rule)} | ${cell(r?.says ?? '')} | ${r?.copy ? "the product's copy" : 'every part of a page'} |`);
  }
  out.push(
    '',
    "A rule read in the product's copy is not read in the person's own words, such as a note they wrote. No rule reads code:",
    "a span in backticks or a type's angle brackets is drawn as code and left as typed. Today's debts are",
    'held by file in `words.json`, each with its reason, and that list only shrinks.',
    '',
  );
  return out.join('\n');
}

/** The list as the file holds it. */
export const readRaw = (at = join(here, 'words.json')) => JSON.parse(readFileSync(at, 'utf8'));

if (import.meta.main) {
  /* A ROOT FROM `BRAINDOG_GATE_ROOT`, so `self-test` asks the check over a planted tree; the write is the repository's. */
  const root = process.env.BRAINDOG_GATE_ROOT;
  const page = guide(root ? readRaw(join(root, 'tools', 'gates', 'words.json')) : readRaw());
  if (process.argv.includes('--check')) {
    const now = (() => {
      try {
        return readFileSync(root ? join(root, 'docs', '54-WRITING.md') : GUIDE, 'utf8');
      } catch {
        return '';
      }
    })();
    if (now !== page) {
      console.error('  docs/54-WRITING.md is not what tools/gates/words.json makes. Run node tools/gates/words-guide.mjs.');
      process.exitCode = 1;
    } else console.log('  docs/54-WRITING.md is the words list, printed');
  } else {
    writeFileSync(GUIDE, page);
    console.log('  wrote docs/54-WRITING.md from tools/gates/words.json');
  }
}
