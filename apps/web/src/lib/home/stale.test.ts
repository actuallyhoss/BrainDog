/**
 * What went stale, on Home: the record's own lines as what a person reads, one a kind with its count, where each is
 * cleared from, and the one sentence that heads them. An agent's call never reaches the screen.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { STALE_SHOWN, readStale, staleLine, staleRows, staleShown } from './stale.ts';

const STEPS = {
  kind: 'steps',
  said: '3 steps were left earlier and nobody took them. The oldest was left 9 days ago: Send the invoice to Mira Holt',
  count: 3,
  clear: 'handoff with drop S12 and why, a few words on why it is no longer true',
};
const ASKED = {
  kind: 'questions',
  said: '1 question has waited 21 days for an answer: Are Teo Vance and T. Vance one person?',
  count: 1,
  clear: 'decide with id SG90 and your answer',
};
const RUNS = { kind: 'runs-empty', said: 'Runs that never did anything: 2', count: 2, clear: 'Nothing to call. The hourly tidy looks at these again.' };
const answer = (lines: unknown, count: unknown = 0) => ({ ok: true as const, value: { lines, count } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('A LINE IS ITS SENTENCE, ITS COUNT AND WHERE IT IS CLEARED: steps on the Agents page, questions in Decide', () => {
  assert.deepEqual(staleRows(answer([STEPS, ASKED, RUNS], 6)), [
    { key: 'steps', said: STEPS.said, count: 3, href: '/p/agents' },
    { key: 'questions', said: ASKED.said, count: 1, href: '/decide' },
    { key: 'runs-empty', said: RUNS.said, count: 2, href: null },
  ]);
});

test("AN AGENT'S CALL NEVER REACHES A ROW: the words in `clear` are for a caller, and a person is given a place", () => {
  const rows = staleRows(answer([STEPS, ASKED, RUNS, { kind: 'runs-stopped', said: 'Runs that stopped: 1', count: 1, clear: 'propose with the question: Close the 1 run that stopped?' }]));
  const drawn = JSON.stringify(rows);
  for (const word of ['handoff with', 'drop S12', 'decide with id', 'SG90', 'Nothing to call', 'propose with', 'clear']) {
    assert.ok(!drawn.includes(word), `"${word}" reached a row`);
  }
  assert.deepEqual(Object.keys(rows[0]!).sort(), ['count', 'href', 'key', 'said']);
});

test('A LINE THE SCREEN CANNOT SAY IS DROPPED: no sentence, no kind, or a count that is none', () => {
  const rows = staleRows(
    answer([
      null,
      'steps',
      { kind: 'steps', said: '   ', count: 2, clear: '' },
      { kind: '', said: 'Something: 2', count: 2, clear: '' },
      { kind: 'runs-empty', said: 'Runs that never did anything: 0', count: 0, clear: '' },
      { kind: 'runs-stopped', said: 'Runs that stopped: many', count: 'many', clear: '' },
      { kind: 'late', said: 'Late: 1.5', count: 1.5, clear: '' },
      { kind: 42, said: 'A number for a kind', count: 1, clear: '' },
      { ...ASKED, said: `  ${ASKED.said}  ` },
      /* THE SAME KIND TWICE IS ONE ROW, the first: the record says a kind once. */
      { ...ASKED, said: 'Said twice', count: 9 },
    ]),
  );
  assert.deepEqual(rows, [{ key: 'questions', said: ASKED.said, count: 1, href: '/decide' }]);
});

test('A MALFORMED ANSWER, A REFUSAL, A HOST WITHOUT THE CALL AND AN EMPTY ANSWER ARE ALL NO ROWS', () => {
  for (const none of [
    undefined,
    null,
    'stale',
    7,
    [],
    {},
    { ok: true },
    { ok: true, value: null },
    { ok: true, value: {} },
    { ok: true, value: { lines: 'three', count: 3 } },
    { ok: 'yes', value: { lines: [STEPS], count: 3 } },
    { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This build has no such call.' } },
    { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' }, value: { lines: [STEPS], count: 3 } },
    answer([], 0),
  ]) {
    assert.deepEqual(staleRows(none), [], JSON.stringify(none));
  }
});

test('THE HEADING COUNTS THE THINGS, not the kinds: "4 things went stale", one said as one, and nothing for none', () => {
  assert.equal(staleLine(staleRows(answer([STEPS, ASKED]))), '4 things went stale');
  assert.equal(staleLine(staleRows(answer([ASKED]))), '1 thing went stale');
  assert.equal(staleLine(staleRows(answer([STEPS, ASKED, RUNS]))), '6 things went stale');
  assert.equal(staleLine([]), null);
  assert.equal(staleLine(staleRows({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: '' } })), null);
});

test('AT MOST SIX ROWS, and the rest are counted: the heading still counts every one', () => {
  assert.equal(STALE_SHOWN, 6);
  const kinds = Array.from({ length: 9 }, (_, n) => ({ kind: `finder-${String(n)}`, said: `Finder ${String(n)}: ${String(n + 1)}`, count: n + 1, clear: '' }));
  const rows = staleRows(answer(kinds));
  assert.equal(rows.length, 9);
  const { shown, more } = staleShown(rows);
  assert.deepEqual(shown.map((r) => r.key), ['finder-0', 'finder-1', 'finder-2', 'finder-3', 'finder-4', 'finder-5']);
  /* 7 + 8 + 9 things are in the three kinds not listed. */
  assert.equal(more, 24);
  assert.equal(staleLine(rows), '45 things went stale');
  assert.deepEqual(staleShown(rows.slice(0, 6)), { shown: rows.slice(0, 6), more: 0 });
  assert.deepEqual(staleShown([]), { shown: [], more: 0 });
});

test('THE READ NEVER FAILS THE SCREEN: a refusal, a host without the call and a line that dropped are all nothing', async () => {
  const none = { ok: true, value: [] };
  const absent = async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This build has no such call.' } });
  assert.deepEqual(await readStale('http://record.test', absent), none);
  assert.deepEqual(await readStale('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), none);
  assert.deepEqual(await readStale('http://record.test', async () => Promise.reject(new Error('offline'))), none);
  assert.deepEqual(await readStale('http://record.test', async () => new Response('<html>', { status: 200 })), none);
  const got = await readStale('http://record.test', async () => json(200, answer([STEPS, ASKED], 4)));
  assert.deepEqual(got.value.map((r) => [r.key, r.count, r.href]), [['steps', 3, '/p/agents'], ['questions', 1, '/decide']]);
});

/* ── The tile, read as text (a component does not load under `node --test`) ─ */

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const tile = bare(readFileSync(new URL('./Stale.svelte', import.meta.url), 'utf8'));

test('THE TILE: the line is its heading, a row with a place is a link and one without is words, and none draws nothing', () => {
  assert.match(tile, /\{#if line\}/u);
  assert.match(tile, /<h2 [^>]*id="stale-h"[^>]*>\{line\}<\/h2>/u);
  assert.match(tile, /\{#each list\.shown as row \(row\.key\)\}/u);
  assert.match(tile, /\{#if row\.href\}\s*<a class="s-line" href=\{at\(row\.href\)\}/u);
  assert.match(tile, /\{:else\}\s*<p class="s-line"/u);
  assert.match(tile, /\{#if list\.more > 0\}/u);
  /* THE SENTENCE SAYS HOW MANY, so the pill beside it is not read out a second time. */
  assert.match(tile, /<span class="s-count" aria-hidden="true">\{row\.count\}<\/span>/u);
});

test('THE TILE IS QUIET AND FLAT: no red, no border, no shadow, and a link is 44 under a thumb', () => {
  assert.doesNotMatch(tile, /--(accent|red|late|danger|warn|needs)/u);
  assert.doesNotMatch(tile, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(tile.replace(/@media \(forced-colors: active\) \{[\s\S]*?\n {2}\}/u, ''), /\bborder: /u);
  assert.match(tile, /background: var\(--tile, var\(--bg\)\);/u);
  assert.match(tile, /border-radius: var\(--r-tile, 16px\);/u);
  assert.match(tile, /@media \(pointer: coarse\) \{\s*a\.s-line \{\s*min-block-size: var\(--tap\);/u);
  /* NOTHING THE RECORD SAYS FOR A CALLER IS DRAWN. */
  assert.doesNotMatch(tile, /\.clear\b/u);
});
