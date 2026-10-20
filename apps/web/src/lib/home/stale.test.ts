/**
 * What went stale, on Home: the record's own lines as what a person reads, one a kind with its count, where each is
 * cleared from, and the one sentence that heads them. An agent's call never reaches the screen.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  STALE_SHOWN,
  keepOnce,
  lessonRows,
  readLessons,
  readStale,
  staleAll,
  staleLine,
  staleRows,
  staleShown,
  type Call,
  type StaleRow,
} from './stale.ts';

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

test('A LINE IS ITS SENTENCE, ITS COUNT AND WHERE IT IS CLEARED: steps on the Agents page, questions in Needs you', () => {
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
  assert.match(tile, /background: var\(--tile\);/u);
  assert.match(tile, /border-radius: var\(--r-tile, 16px\);/u);
  assert.match(tile, /@media \(pointer: coarse\) \{\s*a\.s-line \{\s*min-block-size: var\(--tap\);/u);
  /* NOTHING THE RECORD SAYS FOR A CALLER IS DRAWN. */
  assert.doesNotMatch(tile, /\.clear\b/u);
});

/* ── What the lessons say: a skill behind its lessons, and one lesson two projects learned ─ */

/* INVENTED NAMES, written inline: a web test may not import the shared fixtures. */
const DEPLOY = { skill: 'skills#3', name: 'Ship it', project: 'Larkfield', behind: [{ learning: 'learnings#12', lesson: 'Run the checks first' }, { learning: 'learnings#14', lesson: 'Tag the build' }], count: 2 };
const TIDY = { skill: 'skills#5', name: 'Tidy up', project: null, behind: [{ learning: 'learnings#20', lesson: 'Keep the old notes' }], count: 1 };
/* THE RECORD'S OWN SHAPE (learningsTwice): each side its handle, its words and its project's name, older first. */
const side = (spoken: string, project: string) => ({ spoken, lesson: 'Ask before moving a file', project });
const PAIR = { older: side('learnings#7', 'Kestrel'), newer: side('learnings#31', 'Wrenmoor'), topic: 'moving files', question: 'Kestrel and Wrenmoor learned the same thing. Keep it once, for everywhere?', parts: [] };
const behind = (...skills: unknown[]) => ({ skills, total: skills.length });
const twice = (...pairs: unknown[]) => ({ pairs });
const linked = (spoken: string) => `/r/${spoken.replace('#', '/')}`;

/** A stand-in client: each method answers what `answers` holds, and any other is a host built before it. */
function host(answers: Record<string, unknown>) {
  const asked: { name: string; args: Record<string, unknown> }[] = [];
  const call: Call = async (name, args) => {
    asked.push({ name, args });
    if (!Object.hasOwn(answers, name)) return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${name}.` } };
    const a = answers[name];
    return a instanceof Error ? Promise.reject(a) : (a as { ok: true; value: unknown });
  };
  return { call, asked };
}
const yes = (value: unknown) => ({ ok: true as const, value });

test('A SKILL BEHIND ITS LESSONS IS ONE LINE BY ITS NAME: two lessons, and one said as "a lesson", each a link to the skill', () => {
  const rows = lessonRows({ behind: behind(DEPLOY, TIDY), twice: null }, undefined, linked);
  assert.deepEqual(rows, [
    { key: 'behind:skills#3', said: 'Ship it has 2 lessons it does not take in yet', count: 2, href: '/r/skills/3' },
    { key: 'behind:skills#5', said: 'Tidy up has a lesson it does not take in yet', count: 1, href: '/r/skills/5' },
  ]);
  /* WITH NO COUNT, the lessons it names are counted. */
  assert.equal(lessonRows({ behind: behind({ ...DEPLOY, count: undefined }), twice: null }, undefined, linked)[0]!.count, 2);
  /* A SKILL ON NO LIST THIS TAB HOLDS is words alone, never a dead link. */
  assert.equal(lessonRows({ behind: behind(DEPLOY), twice: null })[0]!.href, null);
});

test('ONE LESSON TWO PROJECTS LEARNED IS ONE LINE BY THE PROJECTS, with the press and no place of its own', () => {
  const { call } = host({});
  const [row] = lessonRows({ behind: null, twice: twice(PAIR) }, call, linked);
  assert.equal(row!.said, 'Kestrel and Wrenmoor learned the same thing');
  assert.equal(row!.href, null);
  assert.equal(row!.count, 1);
  assert.deepEqual(row!.pair, { older: 'learnings#7', newer: 'learnings#31' });
  assert.equal(typeof row!.keep, 'function');
  /* WITHOUT A CLIENT the line is words alone. */
  assert.equal(lessonRows({ behind: null, twice: twice(PAIR) })[0]!.keep, undefined);
});

test('NAMES, NEVER HANDLES, IN WHAT IS DRAWN; and a part the screen cannot say is nothing', () => {
  const rows = lessonRows({ behind: behind(DEPLOY, TIDY), twice: twice(PAIR) }, undefined, linked);
  for (const r of rows) assert.doesNotMatch(r.said, /#|learnings|skills/u, r.said);
  for (const none of [null, undefined, 'skills', 7, {}, { skills: 'three' }, { pairs: null }]) {
    assert.deepEqual(lessonRows({ behind: none, twice: none }, undefined, linked), [], JSON.stringify(none));
  }
  assert.deepEqual(
    lessonRows(
      {
        behind: behind(null, { ...DEPLOY, name: '  ' }, { ...DEPLOY, skill: '' }, { ...DEPLOY, count: 0, behind: [] }, { ...DEPLOY, count: 1.5, behind: 'two' }),
        twice: twice(null, { ...PAIR, newer: null }, { ...PAIR, newer: side('learnings#31', ' ') }, { ...PAIR, older: side('', 'Kestrel') }, { ...PAIR, older: 'learnings#7' }),
      },
      undefined,
      linked,
    ),
    [],
  );
  /* THE SAME SKILL OR PAIR TWICE IS ONE LINE. */
  assert.equal(lessonRows({ behind: behind(DEPLOY, DEPLOY), twice: twice(PAIR, PAIR) }, undefined, linked).length, 2);
});

test('THE TWO READS ARE ASKED ONCE EACH, and a refusal, a host without them and one that threw are each nothing', async () => {
  const both = host({ skillsBehind: yes(behind(DEPLOY)), learningsTwice: yes(twice(PAIR)) });
  assert.deepEqual(await readLessons(both.call), { behind: behind(DEPLOY), twice: twice(PAIR) });
  assert.deepEqual(both.asked, [{ name: 'skillsBehind', args: { limit: 3 } }, { name: 'learningsTwice', args: {} }]);
  assert.deepEqual(await readLessons(host({}).call), { behind: null, twice: null });
  const refused = host({ skillsBehind: { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } }, learningsTwice: new Error('offline') });
  assert.deepEqual(await readLessons(refused.call), { behind: null, twice: null });
  const half = host({ learningsTwice: yes(twice(PAIR)) });
  assert.deepEqual(lessonRows(await readLessons(half.call), half.call, linked).map((r) => r.said), ['Kestrel and Wrenmoor learned the same thing']);
});

test('A HOST WITH NEITHER READ DRAWS WHAT HOME DREW: the record\'s own lines, and nothing after them', async () => {
  const { call, asked } = host({});
  const rows = await staleAll(async () => answer([STEPS, ASKED, RUNS], 6), call);
  assert.deepEqual(rows, staleRows(answer([STEPS, ASKED, RUNS], 6)));
  assert.equal(staleLine(rows), '6 things went stale');
  assert.deepEqual(asked.map((a) => a.name), ['skillsBehind', 'learningsTwice']);
  /* AND THROUGH THE REAL CLIENT, which answers a call its host table lacks without asking the record. */
  const got = await readStale('http://record.test', async () => json(200, answer([STEPS, ASKED], 4)));
  assert.deepEqual(got.value.map((r) => r.key), ['steps', 'questions']);
});

test('BOTH KINDS OF LINE WITH A STAND-IN CLIENT, after the record\'s; six lines at most, and the rest counted under them', async () => {
  const both = host({ skillsBehind: yes(behind(DEPLOY, TIDY)), learningsTwice: yes(twice(PAIR)) });
  const rows = await staleAll(async () => answer([STEPS, ASKED, RUNS]), both.call);
  assert.deepEqual(rows.map((r) => r.said.split(' ').slice(0, 2).join(' ')), ['3 steps', '1 question', 'Runs that', 'Ship it', 'Tidy up', 'Kestrel and']);
  /* A STALE RECORD THAT FAILED is nothing, and the lessons still draw. */
  assert.equal((await staleAll(async () => Promise.reject(new Error('offline')), both.call)).length, 3);
  const many = Array.from({ length: 5 }, (_, n) => ({ kind: `finder-${String(n)}`, said: `Finder ${String(n)}: 1`, count: 1, clear: '' }));
  const full = await staleAll(async () => answer(many), both.call);
  const { shown, more } = staleShown(full);
  assert.equal(shown.length, STALE_SHOWN);
  assert.equal(shown.at(-1)!.said, 'Ship it has 2 lessons it does not take in yet');
  /* TIDY UP'S ONE LESSON AND THE ONE PAIR are in the line under them. */
  assert.equal(more, 2);
});

test('THE PRESS IS THE RECORD\'S promoteLearnings AND OPENS DECIDE; a pair answered already, and a refusal, are plain words', async () => {
  const filed = host({ promoteLearnings: yes({ asked: [{ said: PAIR.question, opened: true }], open: 1 }) });
  const [row] = lessonRows({ behind: null, twice: twice(PAIR) }, filed.call, linked) as [StaleRow];
  assert.deepEqual(await row.keep!(), { ok: true, href: '/decide' });
  assert.deepEqual(filed.asked, [{ name: 'promoteLearnings', args: {} }]);
  /* ASKED BEFORE AND STILL WAITING: nothing new is filed, and the press opens Decide where it waits. */
  assert.deepEqual(await keepOnce(host({ promoteLearnings: yes({ asked: [], open: 2 }) }).call), { ok: true, href: '/decide' });
  /* ASKED BEFORE AND ANSWERED: nothing is filed and nothing waits, so the press goes. */
  assert.deepEqual(await keepOnce(host({ promoteLearnings: yes({ asked: [], open: 0 }) }).call), { ok: false, said: 'You answered this one already.', gone: true });
  assert.deepEqual(await keepOnce(host({}).call), { ok: false, said: 'This BrainDog cannot keep these once yet.', gone: true });
  const refuse = (code: string) => host({ promoteLearnings: { ok: false, refusal: { code, fix: 'learnings#7 and learnings#31 are not a pair.' } } }).call;
  for (const code of ['VALUE_MALFORMED', 'NEEDS_BROWSER_SESSION', 'FORBIDDEN']) {
    const out = await keepOnce(refuse(code));
    assert.equal(out.ok, false, code);
    /* THE RECORD'S FIX IS SAID FOR A CALLER and names handles, so it is never drawn. */
    assert.ok(!out.ok && !out.said.includes('#'), code);
  }
  assert.deepEqual(await keepOnce(host({ promoteLearnings: new Error('offline') }).call), { ok: false, said: 'Could not reach your BrainDog. Try again.', gone: false });
  assert.equal((await keepOnce(host({ promoteLearnings: yes(null) }).call)).ok, false);
});

test('THE TILE: a lesson pair is its sentence and one quiet press, held while it waits, its refusal said under it', () => {
  assert.match(tile, /\{:else if row\.keep\}\s*<div class="s-line s-pair"/u);
  assert.match(tile, /<Button weight="quiet" size="sm" disabled=\{waiting !== null\}[^>]*onclick=\{\(\) => void keep\(row\)\}>\s*\{words\.keep\}/u);
  assert.match(tile, /keep: 'Keep it once'/u);
  assert.match(tile, /\{#if refused\[row\.key\]\}<p class="s-no" role="status">\{refused\[row\.key\]\}<\/p>\{\/if\}/u);
  assert.match(tile, /void goto\(at\(out\.href\)\)/u);
  /* NOTHING ASKS WITHOUT A PRESS: the one call is inside the press. */
  assert.equal(tile.match(/row\.keep\(\)/gu)?.length, 1);
});

/* ── What the tidy found, finder by finder, in a fold under the list (AGT-C18) ─ */

test('THE TIDY IS READ BY import() ONCE THE PART DRAWS, never by what every screen loads, and only with a line to sit under', () => {
  assert.match(tile, /import\('\.\/tidy-week\.ts'\)/u);
  assert.doesNotMatch(tile, /import [^;]*from '\.\/tidy-week\.ts'/u);
  assert.match(tile, /\$effect\(\(\) => \{\s*if \(!line\) return;/u);
  assert.match(tile, /m\.loadTidyWeek\(apiBase\(\)\)/u);
  assert.match(tile, /if \(here\) tidy = m\.tidyWeekLines\(found\);/u);
  /* AND NOT FROM HOME: the stale read Home makes is the same one, with nothing added to it. */
  assert.doesNotMatch(readFileSync(new URL('./stale.ts', import.meta.url), 'utf8'), /tidy-week/u);
});

test('THE FOLD IS UNDER THE LIST, its lines words alone: nothing in it is a press, and none draws nothing', () => {
  const at = tile.indexOf('<details class="s-tidy"');
  assert.ok(at > tile.indexOf('{#if list.more > 0}'), 'the fold sits under the list');
  assert.ok(at < tile.indexOf('</section>'), 'the fold is inside the stale part, not a tile of its own');
  assert.match(tile, /\{#if tidy\}\s*<details class="s-tidy"/u);
  assert.match(tile, /<summary class="s-tidy-said">\{words\.tidy\}<\/summary>/u);
  assert.match(tile, /tidy: 'What the tidy found'/u);
  assert.match(tile, /\{#each tidy as found \(found\.id\)\}<li class="s-tidy-line" dir="auto">\{found\.said\}<\/li>\{\/each\}/u);
  const fold = tile.slice(at, tile.indexOf('</details>', at));
  assert.doesNotMatch(fold, /<Button|<button|<a |onclick|href=/u);
  /* THE KEEP PRESS STAYS AS IT WAS: still the one call, inside its own press. */
  assert.equal(tile.match(/row\.keep\(\)/gu)?.length, 1);
});
