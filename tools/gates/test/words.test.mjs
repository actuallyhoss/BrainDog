/**
 * `words` READS WHAT A SCREEN PRINTS AND NOTHING ELSE, KNOWS EVERY WORD ON ITS LIST, HOLDS TODAY'S DEBT BY FILE AND
 * COUNT, AND SAYS THE SAME AS THE PAGE LINT (EXP-B07).
 *
 *   node --test tools/gates/test/words.test.mjs
 *
 * The reader is asserted as a function, since what it reads is a judgement about code and copy that a planted tree
 * proves only in the large. The gate is spawned at a seeded root for what an operator reads: the exit code and the line.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { breaks, judge, literalsOf, pageFiles, pageStrings, pageWords, readList } from '../words.mjs';
import { BUTTON_WORDS, PAGE_WORDS } from '../../../packages/render/src/lint.ts';
import { GUIDE, guide, readRaw } from '../words-guide.mjs';

const gate = join(import.meta.dirname, '..', 'words.mjs');
const list = readList();
const DASH = String.fromCharCode(0x2014);

/** The gate run as a script at a tree of `files`, and what it printed. */
function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-words-'));
  for (const [at, body] of Object.entries(files)) {
    mkdirSync(join(root, at, '..'), { recursive: true });
    writeFileSync(join(root, at), body);
  }
  try {
    const r = spawnSync(process.execPath, [gate], { env: { ...process.env, BRAINDOG_GATE_ROOT: root }, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const texts = (src) => literalsOf(src).map((l) => l.text);

test('the reader takes the values a screen prints, and a template with each ${} as {}', () => {
  const src = "export const c = {\n  title: 'Bills',\n  said: (n: number) => `${n} bills due`,\n  chips: ['One', \"Two\"],\n};\n";
  assert.deepEqual(literalsOf(src), [
    { text: 'Bills', line: 2, key: 'title' },
    { text: '{} bills due', line: 3, key: 'said' },
    { text: 'One', line: 4, key: 'chips' },
    { text: 'Two', line: 4, key: 'chips' },
  ]);
});

test('the reader leaves code alone: comments, keys, addresses, comparisons, unions, indexes and method arguments', () => {
  const src = [
    "import { list } from './row.ts';",
    "type K = 'row' | 'bill';",
    '/* a row */ // a row',
    "const c = { 'row': 'Bills', k: (x: string) => (x === 'row' ? 'Yes' : 'No'), j: (xs: string[]) => xs.join(' row '), i: m['row'] };",
    "switch (k) { case 'row': break; }",
    "const t = {} as Record<'row', string>; const u = new Map<string, 'row'>();",
    "const r = /'row/g.test(s) ? 'Kept' : s.replace(/'row/g, 'row');",
  ].join('\n');
  assert.deepEqual(texts(src), ['Bills', 'Yes', 'No', 'Kept']);
});

test('a key is the one its value sits under, through calls and arrays, and ends at the next comma', () => {
  const src = "export const c = {\n  whoChips: [plain('a'), 'b'],\n  next: 'c',\n  tabs: { installed: 'd' },\n};\n";
  assert.deepEqual(literalsOf(src).map((l) => [l.text, l.key]), [['a', 'whoChips'], ['b', 'whoChips'], ['c', 'next'], ['d', 'installed']]);
});

/** A sentence each entry must find. A new entry with no sentence here fails the first test below. */
const RED = {
  row: 'Open this row to change it',
  'list item': 'Drag a list item to move it',
  entity: 'Every entity you keep',
  credential: 'Paste the credential',
  register: 'Add it to the register',
  pack: 'Install a pack',
  slug: 'The slug of this page',
  schema: 'Change the schema',
  declaration: 'Its declaration changed',
  MCP: 'Any MCP client',
  snapshot: 'Take a snapshot now',
  Spark: 'Ask Spark',
  recommended: 'Recommended for you',
  Submit: 'Submit',
  OK: 'OK',
  "isn't code": "BrainDog isn't code",
  'an id in a sentence': 'Filed as tools#8',
  'the long dash': `Rent ${DASH} due Friday`,
};

test('EVERY WORD ON THE LIST IS FOUND, says what to use instead and why, and the reason has no long dash', () => {
  assert.deepEqual(Object.keys(RED).sort(), list.words.map((w) => w.name).sort(), 'a sentence for each entry, and an entry for each sentence');
  for (const w of list.words) {
    assert.ok(w.say && w.why, `${w.name} says what to use and why`);
    assert.ok([false, 'plain-words', 'system-word'].includes(w.page), `${w.name} says which rule of the page lint reads it, or false`);
    assert.doesNotMatch(`${w.say} ${w.why}`, new RegExp(DASH), `${w.name} is written without a long dash`);
    assert.deepEqual(breaks(list, { text: RED[w.name], key: null }).map((b) => b.rule), [w.name], RED[w.name]);
  }
});

test('the plain sentences beside them are green, and a dash alone is the mark for no value', () => {
  for (const text of ['Register a passkey to sign in', 'Three bills in a line of four', 'Your #1 project', DASH, ` ${DASH} `, 'Okay, done', 'Run S7 again', 'Suggested', 'Pack and send each order', 'It cost to make, pack and send'])
    assert.deepEqual(breaks(list, { text, key: null }), [], text);
});

test('a title, heading, label or button ends with no full stop; a body is a sentence and an ellipsis is a promise', () => {
  assert.deepEqual(breaks(list, { text: 'Who are you.', key: 'whoTitle' }).map((b) => b.rule), ['a title that ends in a full stop']);
  for (const key of ['heading', 'nameLabel', 'goButton']) assert.equal(breaks(list, { text: 'Save it.', key }).length, 1, key);
  assert.deepEqual(breaks(list, { text: 'Tell it what you keep.', key: 'whoBody' }), []);
  assert.deepEqual(breaks(list, { text: 'Install from...', key: 'fromLabel' }), []);
});

test('HELD BY FILE AND COUNT: at the count is green, above it is red, below it can come down', () => {
  const held = { 'a.ts': { count: 2, why: 'x' }, 'b.ts': { count: 1, why: 'y' } };
  assert.deepEqual(judge(new Map([['a.ts', 2], ['b.ts', 1]]), held), { over: [], down: [] });
  assert.deepEqual(judge(new Map([['a.ts', 3], ['c.ts', 1]]), held), { over: ['a.ts', 'c.ts'], down: [{ rel: 'b.ts', held: 1, now: 0 }] });
});

test('the held list names real files, each with a count and a reason, and the repository is green over it', () => {
  for (const [rel, h] of Object.entries(list.held)) assert.ok(Number.isInteger(h.count) && h.count > 0 && h.why, rel);
  const { BRAINDOG_GATE_ROOT: _aimed, ...env } = process.env;
  const r = spawnSync(process.execPath, [gate], { cwd: join(import.meta.dirname, '..', '..', '..'), encoding: 'utf8', env });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const n = Object.values(list.held).reduce((s, h) => s + h.count, 0);
  const files = Object.keys(list.held).length;
  assert.match(r.stdout, new RegExp(`, ${n} held in ${files} files?\\b`), 'the held count is printed, and every held finding is still there to hold');
});

test('THE PAGE LINT SAYS THE SAME: its words are the list\'s page entries and its buttons the list\'s, word for word', () => {
  assert.deepEqual(PAGE_WORDS, pageWords(list));
  assert.deepEqual(BUTTON_WORDS, list.buttons);
  assert.deepEqual(new Set(PAGE_WORDS.map((w) => w.rule)), new Set(['plain-words', 'system-word']));
});

test('A DECLARED PAGE IS READ BY ITS TITLE, HEADING, LABEL, BODY AND EMPTY, in a seed source and in a pack file', () => {
  const ts = "export const p = { title: 'Bills', blocks: [{ heading: 'Each row', body: ['Rows {{bills.rows}}', 'See [it](/r/rows)'], empty: 'No rows yet', source: 'rows', note: 'a row' }] };\n";
  assert.deepEqual(pageStrings(ts).map((l) => [l.key, l.text]), [['title', 'Bills'], ['heading', 'Each row'], ['body', 'Rows {}'], ['body', 'See [it]'], ['empty', 'No rows yet']]);
  const json = '{\n  "title": "Live feed",\n  "pages": [{ "label": "Each row", "blocks": [{ "kind": "table", "source": "rows" }] }]\n}\n';
  assert.deepEqual(pageStrings(json).map((l) => [l.key, l.text, l.line]), [['title', 'Live feed', 2], ['label', 'Each row', 3]]);
  /* Code is never read: a span in backticks, and a type's angle brackets with the name before them, nested. */
  const code = "export const p = { body: ['Run `pack` with the `rows` flag', 'A Map<string, Array<Row>> holds them', 'Typed `x` and the rows'] };\n";
  assert.deepEqual(pageStrings(code).map((l) => breaks(list, l).map((b) => b.rule)), [[], [], ['row']]);
});

test('the declared pages are the seed\'s sources and each add-on\'s pack file, tests aside', () => {
  const root = join(import.meta.dirname, '..', '..', '..');
  const files = pageFiles(root);
  assert.ok(files.includes('packs/live-feed/live-feed.pack.json'), 'a pack file');
  assert.ok(files.some((f) => f.startsWith('packages/seed/src/modules/')), 'a seed module');
  assert.ok(!files.some((f) => /\.test\.ts$/.test(f)), 'no test');
});

test('a planted tree is judged whole, by every kind of copy file, and an empty root is a skip', () => {
  const r = run({
    'apps/web/src/lib/copy/bills.ts': "export const bills = { open: 'Open this row' };\n",
    'apps/web/src/lib/first-run.ts': "export const firstRun = { whoTitle: 'Who are you.' };\n",
    'apps/web/src/routes/decide/words.ts': 'export const words = { said: (n: string) => `Filed as ${n}#${n}` };\n',
    'apps/web/src/lib/copy/agents.ts': "export const agents = { doorAny: 'Any MCP client' };\n",
  });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\b4 finding\(s\)/u);
  for (const at of ['bills.ts:1', 'first-run.ts:1', 'decide/words.ts:1', 'agents.ts:1']) assert.ok(r.out.includes(at), `${at} in ${r.out}`);
  assert.equal(run({ 'apps/web/src/lib/copy/bills.ts': "export const bills = { open: 'Open this bill' };\n" }).code, 0);
  assert.equal(run({ 'README.md': 'nothing here\n' }).code, 3);
});

test('THE WRITING GUIDE IS THE LIST, PRINTED: docs/54-WRITING.md is what words.json makes, every word and button on it', () => {
  const page = readFileSync(GUIDE, 'utf8');
  assert.equal(page, guide(readRaw()), 'run node tools/gates/words-guide.mjs');
  for (const w of list.words) assert.ok(page.includes(`| ${w.name} | ${w.say} |`), w.name);
  assert.match(page, new RegExp(list.buttons.join(', ').replace(/, (\w+)$/, ' and $1')));
  assert.doesNotMatch(page, new RegExp(DASH), 'the guide is written without a long dash');
});
