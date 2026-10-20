/**
 * Matched for you: the record's own folds as lines a person can read, one sentence for the board, and the Undo each
 * one carries: the plan read first and said in names, then put back by its hash.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Fetch } from '../record/boot-live.ts';
import { MATCHED_SHOWN, backSaid, matchedLine, matchedRows, matchedShown, planSaid, putBack, readMatched, undoMatch, undoOf } from './matched.ts';

const B1 = '01JA7ZK3Q4M8N2P5R6S7T8V9W0';
const B2 = '01JA7ZK3Q4M8N2P5R6S7T8V9W1';
const fold = (from: unknown, name: unknown, batch: unknown = B1, at: unknown = '2026-10-13T09:30:00.000Z', evidence: unknown = 'The same name and the same handle, adalovelace.') => ({
  from,
  into: { name, seq: 12 },
  evidence,
  at,
  batch,
});
const answer = (matches: unknown) => ({ ok: true as const, value: { matches } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('A FOLD IS ONE SENTENCE IN NAMES, ITS EVIDENCE, WHEN, AND THE BATCH ITS UNDO TAKES', () => {
  const rows = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance', 'T. Vance'], 'Teodor Vance', B2, '2026-10-12T18:00:00.000Z', 'Both wrote from the same handle.')]));
  assert.deepEqual(rows, [
    { key: `${B1}:0`, line: 'A. Lovelace was matched to Ada Lovelace.', evidence: 'The same name and the same handle, adalovelace.', when: '2026-10-13T09:30:00.000Z', batch: B1, into: 'Ada Lovelace', attach: false },
    { key: `${B2}:1`, line: 'Teo Vance and T. Vance were matched to Teodor Vance.', evidence: 'Both wrote from the same handle.', when: '2026-10-12T18:00:00.000Z', batch: B2, into: 'Teodor Vance', attach: false },
  ]);
});

test('TWO WHO GO BY ONE NAME ARE SAID AS THAT, never "Ada is now Ada"', () => {
  const [two, three, mixed] = matchedRows(answer([fold(['Ada Lovelace'], 'Ada Lovelace'), fold(['ada lovelace', 'Ada Lovelace '], 'Ada Lovelace'), fold(['Ada Lovelace', 'A. Lovelace'], 'Ada Lovelace')]));
  assert.equal(two!.line, 'Two called Ada Lovelace are now one.');
  assert.equal(three!.line, 'Three called Ada Lovelace are now one.');
  assert.equal(mixed!.line, 'Ada Lovelace and A. Lovelace were matched to Ada Lovelace.');
});

test('MANY FOLDED AT ONCE ARE THREE NAMES AND A COUNT, so the sentence stays one line', () => {
  const [row] = matchedRows(answer([fold(['Ann One', 'Ann Two', 'Ann Three', 'Ann Four', 'Ann Five'], 'Ann Whole')]));
  assert.equal(row!.line, 'Ann One, Ann Two, Ann Three and 2 others were matched to Ann Whole.');
  const [four] = matchedRows(answer([fold(['Ann One', 'Ann Two', 'Ann Three', 'Ann Four'], 'Ann Whole')]));
  assert.equal(four!.line, 'Ann One, Ann Two, Ann Three and 1 other were matched to Ann Whole.');
});

test('NO ID IS EVER IN WHAT A PERSON READS: the batch is a handle beside the words, never in them', () => {
  const rows = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2)]));
  for (const r of rows) {
    for (const said of [r.line, r.evidence]) {
      assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}/u);
      assert.doesNotMatch(said, /#\d|\bseq\b/u);
      assert.doesNotMatch(said, /—/u);
    }
  }
  assert.equal(matchedLine(rows), '2 people matched for you');
});

test('A FOLD WITH NOBODY TO NAME IS DROPPED, and words are trimmed', () => {
  const rows = matchedRows(
    answer([
      fold([], 'Ada Lovelace'),
      fold(['A. Lovelace'], ''),
      fold(['A. Lovelace'], 7),
      fold('A. Lovelace', 'Ada Lovelace'),
      null,
      'x',
      fold([' A. Lovelace ', 4, ''], '  Ada Lovelace ', B2, 'not a time', 9),
    ]),
  );
  assert.deepEqual(rows, [{ key: `${B2}:0`, line: 'A. Lovelace was matched to Ada Lovelace.', evidence: '', when: null, batch: B2, into: 'Ada Lovelace', attach: false }]);
});

test('A RECORD WITHOUT THE METHOD ANSWERS NOTHING, and so does one that keeps nobody', () => {
  for (const code of ['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN', 'FORBIDDEN', 'UNREACHABLE']) assert.deepEqual(matchedRows({ ok: false, refusal: { code, fix: 'No.' } }), []);
  for (const odd of [null, undefined, 'x', {}, { ok: true }, { ok: true, value: null }, { ok: true, value: { matches: 'none' } }, answer([])]) assert.deepEqual(matchedRows(odd), []);
});

test('FIVE ARE SHOWN AND THE REST ARE COUNTED, while the line counts them all', () => {
  const rows = matchedRows(answer(Array.from({ length: 8 }, (_, i) => fold([`Old ${i}`], `Kept ${i}`, `${B1.slice(0, 25)}${i}`))));
  assert.equal(MATCHED_SHOWN, 5);
  assert.equal(rows.length, 8);
  const { shown, more } = matchedShown(rows);
  assert.deepEqual(shown.map((r) => r.line), [0, 1, 2, 3, 4].map((i) => `Old ${i} was matched to Kept ${i}.`));
  assert.equal(more, 3);
  assert.deepEqual(matchedShown(rows.slice(0, 5)), { shown: rows.slice(0, 5), more: 0 });
  assert.equal(matchedLine(rows), '8 people matched for you');
  assert.equal(new Set(rows.map((r) => r.key)).size, 8);
});

test('THE LINE: one person, N people, and nothing for none', () => {
  const rows = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2), fold(['M. Okafor'], 'Mara Okafor', B2)]));
  assert.equal(matchedLine([]), null);
  assert.equal(matchedLine(rows.slice(0, 1)), 'One person matched for you');
  assert.equal(matchedLine(rows), '3 people matched for you');
});

test('THIS WEEK IS SAID ONLY WHEN EVERY ONE OF THEM WAS THIS WEEK', () => {
  const now = Date.parse('2026-10-14T12:00:00.000Z');
  const week = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2, '2026-10-08T12:00:00.000Z')]));
  assert.equal(matchedLine(week, now), '2 people matched for you this week');
  const older = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', B2, '2026-09-01T12:00:00.000Z')]));
  assert.equal(matchedLine(older, now), '2 people matched for you');
  const undated = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace', B1, null)]));
  assert.equal(matchedLine(undated, now), 'One person matched for you');
});

test('UNDO NAMES THE BATCH THE RECORD TAKES, and nothing for a fold that came with none', () => {
  const [row, bare] = matchedRows(answer([fold(['A. Lovelace'], 'Ada Lovelace'), fold(['Teo Vance'], 'Teodor Vance', '')]));
  assert.deepEqual(undoOf(row!), { batch: B1 });
  assert.equal(bare!.batch, '');
  assert.equal(undoOf(bare!), null);
});

test('THE READ NEVER FAILS THE SCREEN: a host without the call, a refusal and a dead line all answer nobody', async () => {
  const none = { ok: true, value: [] };
  const absent = async () => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog has no such read yet.', at: 'matched' } });
  assert.deepEqual(await readMatched('http://record.test', absent), none);
  assert.deepEqual(await readMatched('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), none);
  assert.deepEqual(await readMatched('http://record.test', async () => Promise.reject(new Error('offline'))), none);
  const got = await readMatched('http://record.test', async () => json(200, answer([fold(['A. Lovelace'], 'Ada Lovelace')])));
  assert.deepEqual(got.value.map((r) => r.line), ['A. Lovelace was matched to Ada Lovelace.']);
});

/* ── Undo: the plan, then Put back ───────────────────────────────────────── */

const BASE = 'http://record.test';
const [VANCE] = matchedRows(answer([fold(['T. Vance'], 'Teodor Vance', B2)]));

/** A host that answers `undo` by what it was sent, and keeps every body. */
function host(reply: (body: Record<string, unknown>) => Response): { io: Fetch; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const io = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    sent.push(body);
    return reply(body);
  }) as Fetch;
  return { io, sent };
}

/**
 * The plan a record that can split a match answers, as its own undo writes one: the one put away is brought back, what
 * the match added comes off the one who was kept, and what pointed at either goes home.
 */
const FOLD_PLAN = {
  say: 'Puts back 2 people',
  steps: [
    { row: '01JA7ZK3Q4M8N2P5R6S7T8V9X1', register: 'r1', seq: 13, title: 'T. Vance', list: 'People', do: 'restore', line: 'Bring T. Vance back' },
    { row: '01JA7ZK3Q4M8N2P5R6S7T8V9X0', register: 'r1', seq: 12, title: 'Teodor Vance', list: 'People', do: 'set', line: 'Take what the match added off Teodor Vance' },
    { row: '01JA7ZK3Q4M8N2P5R6S7T8V9X2', register: 'r2', seq: 4, title: 'Renew the lease', list: 'Tasks', do: 'set', from: 'T. Vance', line: 'Point Renew the lease back at T. Vance' },
  ],
  skipped: [],
  hash: 'h1',
};

/** And the plan a record built before that answers for the same match: one carried line, and the matched one left. */
const OLD_PLAN = {
  say: 'Puts back 1 change. Leaves 1 as it is.',
  steps: [{ row: '01JA7ZK3Q4M8N2P5R6S7T8V9X0', title: 'Teodor Vance', do: 'untag', line: 'Forget a name Teodor Vance was matched by' }],
  skipped: [{ row: '01JA7ZK3Q4M8N2P5R6S7T8V9X1', title: 'T. Vance', why: 'it has been changed since', line: 'Leaves T. Vance as it is: it has been changed since.' }],
  hash: 'h0',
};

test('THE PLAN IS ASKED DRY AND SAID IN NAMES: who comes back, as how many, and nothing is changed', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: FOLD_PLAN }));
  const out = await undoMatch(BASE, VANCE!, io);
  assert.deepEqual(sent, [{ batch: B2, dry: true }]);
  assert.equal(out?.from, 'plan');
  assert.equal(out?.say, 'Puts back Teodor Vance and T. Vance as two people.');
  assert.equal(out?.plan.hash, 'h1');
  assert.doesNotMatch(out!.say, /[0-9A-HJKMNP-TV-Z]{26}|—|#\d/u);
});

test('THE SENTENCE: two by one name, three, one alone, and the record\'s own where it names nobody', () => {
  const step = (title: string, n: number, word = 'restore') => ({ title, label: null, from: null, to: null, do: word, line: '', row: `r${String(n)}`, list: null, at: null });
  const plan = (steps: ReturnType<typeof step>[], say = '') => ({ say, steps, skipped: [], hash: 'h' });
  assert.equal(planSaid(plan([step('Ada Lovelace', 1), step('ada lovelace', 2)])), 'Puts back Ada Lovelace as two people.');
  assert.equal(planSaid(plan([step('Ann One', 1), step('Ann Two', 2), step('Ann Three', 3)])), 'Puts back Ann One, Ann Two and Ann Three as three people.');
  assert.equal(planSaid(plan([step('T. Vance', 1)])), 'Puts back T. Vance as a person of their own.');
  /* ONE PERSON NAMED BY TWO STEPS IS ONE PERSON. */
  assert.equal(planSaid(plan([step('T. Vance', 1), step('T. Vance', 1)])), 'Puts back T. Vance as a person of their own.');
  /* A CHANGE THAT IS NOT SOMEBODY COMING BACK IS NOT NAMED AS ONE. */
  assert.equal(planSaid(plan([step('Teodor Vance', 1), step('T. Vance', 2), step('Renew brain.dog', 3, 'set')])), 'Puts back Teodor Vance and T. Vance as two people.');
  /* THE RECORD SAYS IT GIVES PEOPLE BACK AND NAMES THEM ITS OWN WAY: its names where it has them, its sentence where not. */
  assert.equal(planSaid(plan([step('Teodor Vance', 1, 'split'), step('T. Vance', 2, 'split')], 'Puts back 2 people')), 'Puts back Teodor Vance and T. Vance as two people.');
  assert.equal(planSaid(plan([], 'Puts back 2 people')), 'Puts back 2 people.');
  assert.equal(planSaid(plan([step('Teodor Vance', 1, 'untag')], 'Puts back 1 change.')), null);
  assert.equal(planSaid(plan([])), null);
});

test('THE ONE WHO WAS KEPT IS NAMED FIRST, and nothing that only pointed at them is named as a person', () => {
  const step = (title: string, n: number, word: string, list = 'People') => ({ title, label: null, from: null, to: null, do: word, line: '', row: `r${String(n)}`, list, at: null });
  const plan = (steps: ReturnType<typeof step>[], say = 'Puts back 2 people', skipped: { title: string; why: string; line: string }[] = []) => ({ say, steps, skipped, hash: 'h' });
  const kept = step('Teodor Vance', 1, 'set');
  const back = step('T. Vance', 2, 'restore');
  /* SOMEBODY ELSE ON THE SAME LIST WHO POINTED AT ONE OF THEM, and a task: neither comes back, so neither is named. */
  const other = step('Mara Okafor', 3, 'set');
  const task = step('Teodor Vance', 4, 'set', 'Tasks');
  assert.equal(planSaid(plan([back, kept, other]), 'Teodor Vance'), 'Puts back Teodor Vance and T. Vance as two people.');
  /* THE KEPT ONE THE MATCH ADDED NOTHING TO HAS NO STEP, and is still one of the two the record counts. */
  assert.equal(planSaid(plan([back]), 'Teodor Vance'), 'Puts back Teodor Vance and T. Vance as two people.');
  assert.equal(planSaid(plan([back, task], ''), 'Teodor Vance'), 'Puts back T. Vance as a person of their own.');
  /* A CHANGE THAT HELD MORE THAN THIS MATCH IS SAID BY THE RECORD'S COUNT, never as fewer than come back. */
  assert.equal(planSaid(plan([back, kept, step('M. Okafor', 5, 'restore')], 'Puts back 4 people'), 'Teodor Vance'), 'Puts back 4 people.');
  /* WHAT IT LEAVES IS SAID AFTER: one by its reason, more by their number. */
  const left = { title: 'Renew the lease', why: 'changed since', line: 'Leaves Renew the lease as it is: changed since' };
  assert.equal(planSaid(plan([back, kept], 'Puts back 2 people, leaves 1 as it is', [left]), 'Teodor Vance'), 'Puts back Teodor Vance and T. Vance as two people. Leaves Renew the lease as it is: changed since.');
  assert.equal(planSaid(plan([back, kept], 'Puts back 2 people, leaves 2 as they are', [left, left]), 'Teodor Vance'), 'Puts back Teodor Vance and T. Vance as two people. Leaves 2 as they are.');
});

test('A RECORD THAT CANNOT GIVE TWO BACK ANSWERS NULL, and so does every way the read can go wrong: no button is drawn', async () => {
  assert.equal(await undoMatch(BASE, VANCE!, host(() => json(200, { ok: true, value: OLD_PLAN })).io), null);
  assert.equal(await undoMatch(BASE, VANCE!, host(() => json(200, { ok: true, value: { ...FOLD_PLAN, steps: [], say: 'This was put back already.' } })).io), null);
  assert.equal(await undoMatch(BASE, VANCE!, host(() => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No undo here yet.' } })).io), null);
  assert.equal(await undoMatch(BASE, VANCE!, host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner puts this back.' } })).io), null);
  assert.equal(await undoMatch(BASE, VANCE!, host(() => json(200, { ok: true, value: 'x' })).io), null);
  assert.equal(await undoMatch(BASE, VANCE!, (async () => Promise.reject(new Error('offline'))) as Fetch), null);
  /* A MATCH THE RECORD SENT NO BATCH FOR IS NEVER ASKED ABOUT. */
  const none = host(() => json(200, { ok: true, value: FOLD_PLAN }));
  assert.equal(await undoMatch(BASE, { batch: '' }, none.io), null);
  assert.deepEqual(none.sent, []);
});

test('PUT BACK SENDS THE PLAN THAT WAS READ, by its hash, and says who came back', async () => {
  const { io, sent } = host((body) => json(200, { ok: true, value: body.dry ? FOLD_PLAN : { put: 2, skipped: [] } }));
  const read = await undoMatch(BASE, VANCE!, io);
  const out = await putBack(BASE, VANCE!, read!.plan, io);
  assert.deepEqual(sent, [{ batch: B2, dry: true }, { batch: B2, hash: 'h1' }]);
  assert.deepEqual(out, { from: 'undone', said: 'Put back Teodor Vance and T. Vance as two people.' });
  assert.equal(backSaid(read!.plan, VANCE!.into), 'Put back Teodor Vance and T. Vance as two people.');
  assert.equal(backSaid(OLD_PLAN as never), null);
});

test('WHAT THE RECORD LEFT IS SAID IN ITS OWN WORDS, never as all of it put back', async () => {
  const left = [{ title: 'T. Vance', why: 'it has been changed since', line: 'Leaves T. Vance as it is: it has been changed since.' }];
  const some = host((body) => json(200, { ok: true, value: body.dry ? FOLD_PLAN : { put: 1, skipped: left } }));
  const read = await undoMatch(BASE, VANCE!, some.io);
  assert.deepEqual(await putBack(BASE, VANCE!, read!.plan, some.io), { from: 'undone', said: 'Put back 1 change. Left T. Vance as it is: it has been changed since.' });
  const none = host(() => json(200, { ok: true, value: { put: 0, skipped: [] } }));
  assert.deepEqual(await putBack(BASE, VANCE!, read!.plan, none.io), { from: 'undone', said: 'There was nothing left to put back.' });
});

test('A PLAN THAT MOVED ANSWERS AGAIN, so the tile reads it again; a refusal is the record\'s own sentence', async () => {
  const read = await undoMatch(BASE, VANCE!, host(() => json(200, { ok: true, value: FOLD_PLAN })).io);
  const stale = host(() => json(409, { ok: false, refusal: { code: 'PLAN_STALE', fix: 'The plan moved.' } }));
  assert.deepEqual(await putBack(BASE, VANCE!, read!.plan, stale.io), { from: 'again' });
  assert.deepEqual(await putBack(BASE, VANCE!, read!.plan, host(() => json(409, { ok: false, conflict: {} })).io), { from: 'again' });
  const no = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner puts this back.' } }));
  assert.deepEqual(await putBack(BASE, VANCE!, read!.plan, no.io), { from: 'refused', fix: 'Only the owner puts this back.' });
  /* A DEAD LINE AND A MATCH WITH NO BATCH ARE A SENTENCE TOO, and nothing is sent for the second. */
  const dead = await putBack(BASE, VANCE!, read!.plan, (async () => Promise.reject(new Error('offline'))) as Fetch);
  const bare = await putBack(BASE, { batch: '' }, read!.plan, stale.io);
  for (const out of [dead, bare]) assert.ok(out.from === 'refused' && out.fix.trim() !== '' && !/—|[0-9A-HJKMNP-TV-Z]{26}/u.test(out.fix));
  assert.equal(stale.sent.length, 1);
});

/* ── the tile's own source ───────────────────────────────────────────────── */

const part = readFileSync(new URL('./Matched.svelte', import.meta.url), 'utf8');
const script = part.slice(part.indexOf('<script'), part.indexOf('</script>'));
const markup = part.slice(part.indexOf('</script>'), part.indexOf('<style>'));
const style = part.slice(part.indexOf('<style>'));

test('EACH MATCH THE RECORD CAN SPLIT CARRIES UNDO, a quiet rectangle, and one it cannot carries none', () => {
  assert.match(part, /data-matched/u);
  /* DRAWN ONLY UNDER A PLAN: no plan for the match, no button. */
  assert.match(markup, /\{#if plan && asking !== row\.batch\}\s*<Button size="sm" aria-label="\{words\.undo\}: \{row\.line\}" data-matched-undo/u);
  const undo = /<Button[^>]*data-matched-undo[^>]*>/u.exec(markup)![0];
  /* NEVER THE ACCENT, never a pill: the shared rectangle at its quiet weight. */
  assert.doesNotMatch(undo, /weight=/u);
  assert.doesNotMatch(style, /border-radius:\s*(999|50%|var\(--r-ctl)/u);
  assert.doesNotMatch(markup, /<button\b/u);
  assert.match(script, /undo: 'Undo'/u);
});

test('A PRESS SHOWS THE PLAN IN ONE SENTENCE WITH PUT BACK AND KEEP, and changes nothing until Put back', () => {
  const ask = markup.slice(markup.indexOf('class="m-ask"'));
  assert.match(ask, /\{plan\.say\}/u);
  assert.match(ask, /\{words\.keep\}[\s\S]*\{words\.putBack\}/u);
  assert.match(script, /putBack: 'Put back'/u);
  assert.match(script, /keep: 'Keep'/u);
  /* THE PRESS OF UNDO ONLY OPENS THE QUESTION; the write is behind Put back alone. */
  assert.match(markup, /data-matched-undo onclick=\{\(\) => \(asking = row\.batch\)\}/u);
  assert.equal(markup.match(/back\(row\)/gu)?.length, 1);
  assert.equal(script.match(/putBack\(apiBase\(\)/gu)?.length, 1);
});

test('PUT BACK TAKES THE LINE AWAY AT ONCE, SAYS IT IN A TOAST, AND ASKS THE RECORD AGAIN', () => {
  const back = script.slice(script.indexOf('async function back'));
  const gone = back.indexOf('gone = new Set');
  const toast = back.indexOf("toasts.push(out.said, { intent: 'good' })");
  const read = back.indexOf('await readMatched(apiBase())');
  assert.ok(gone > 0 && toast > gone && read > toast, 'gone, then said, then read again');
  /* A PLAN THAT MOVED IS READ AGAIN, and nothing is taken off the list for it. */
  const again = back.slice(back.indexOf("out.from === 'again'"), gone);
  assert.match(again, /await ask\(row\);\s*return;/u);
  /* THE LINE AND THE LIST ARE BOTH OF WHO IS STILL MATCHED. */
  assert.match(script, /matchedLine\(live, now\)/u);
  assert.match(script, /matchedShown\(live\)/u);
});

test('THE PLANS ARE ASKED WHEN THE LIST OPENS, never when Home loads, and nothing is drawn for nobody', () => {
  assert.match(script, /\$effect\(\(\) => \{\s*if \(!open\) return;/u);
  assert.equal(script.match(/undoMatch\(/gu)?.length, 1);
  assert.match(markup, /^<\/script>\s*\{#if line\}/u);
  assert.match(markup, /\{\/if\}\s*$/u);
});

test('AT 390 THE TWO BUTTONS WRAP UNDER THE SENTENCE, and no words here hold an id or a long dash', () => {
  const rule = (name: string) => new RegExp(`\\.${name} \\{[^}]*\\}`, 'u').exec(style)?.[0] ?? '';
  assert.match(rule('m-ask'), /flex-wrap: wrap/u);
  assert.match(rule('m-sure'), /flex: 1 1 16rem/u);
  assert.match(rule('m-main'), /flex-wrap: wrap/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(markup, /\{row\.(batch|key)\}(?!\))/u);
  assert.doesNotMatch(part, /—/u);
});

test("THE TILE READS THE RECORD'S OWN WORDS FOR A MATCH PUT BACK: the step and the sentence are the kernel's, held here", () => {
  /* The tile knows a plan that gives people back by a `restore` step or by "Puts back N people". If the kernel says
     either another way, Undo goes away with nothing red, so the two are held together from the kernel's source. */
  const kernel = readFileSync(new URL('../../../../../packages/kernel/src/undo-fold.ts', import.meta.url), 'utf8');
  const tile = readFileSync(new URL('./matched.ts', import.meta.url), 'utf8');
  assert.match(tile, /const GIVEN_BACK = 'restore';/u);
  assert.match(kernel, /steps\.push\(\{ do: 'restore', \.\.\.at,/u, 'the kernel marks the one who comes back another way now');
  assert.match(tile, /const SAYS_BACK = \/\^Puts back \(\\d\+\) people\\b\/u;/u);
  assert.match(kernel, /`Puts back \$\{n\}\$\{named === undefined \|\| named === '' \? '' : ` \$\{named\}`\}`/u, 'the kernel says who comes back another way now');
  /* And the press is the client's own `undo`, a batch and never a row with it (a match goes back whole). */
  assert.match(tile, /return row\.batch === '' \? null : \{ batch: row\.batch \};/u);
  const part = readFileSync(new URL('./Matched.svelte', import.meta.url), 'utf8');
  /* No Undo on the toast after Put back: the record refuses to undo the change that put a match back. */
  assert.match(part, /toasts\.push\(out\.said, \{ intent: 'good' \}\);/u);
});

test('A NAME SLASH PUT ON A ROW IS DRAWN BY THE SENTENCE IT WAS READ FROM, with nobody folded into it', () => {
  const rows = matchedRows(answer([{ kind: 'attach', from: [], into: { name: 'Kiln Room', seq: 4 }, sentence: ' Met Ada at the kiln room. ', at: '2026-10-13T09:30:00.000Z', batch: B1 }]));
  assert.deepEqual(rows, [{ key: `${B1}:0`, line: 'Slash put a name on Kiln Room.', evidence: 'Met Ada at the kiln room.', when: '2026-10-13T09:30:00.000Z', batch: B1, into: 'Kiln Room', attach: true }]);
});
