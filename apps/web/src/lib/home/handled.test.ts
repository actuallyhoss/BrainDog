/**
 * What BrainDog arranged today, on Home: the record's `handled` as a few lines with their reasons, nothing at nought or
 * on a host that does not answer the read, and the tile reached by a dynamic import only.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Thread } from '../record/instruct.ts';
import { HANDLED_SHOWN, HANDLED_WORDS, handledOf, handledTile, loadHandled, ownCount, readHandled, toldHandled, withTold } from './handled.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const line = (n: number) => ({ decision: `D${String(n)}`, line: `Change the last seen of project ${String(n)}`, why: 'It only arranges your own rows.', at: '2026-10-20T08:00:00.000Z' });
const answer = (rows: unknown[], more: unknown = 0) => ({ ok: true as const, value: { rows, more } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('THE FIRST FIVE LINES, then "and N more" for the rest and what the record held back', () => {
  const tile = handledTile(handledOf(answer([1, 2, 3, 4, 5, 6, 7].map(line), 2)));
  assert.equal(HANDLED_SHOWN, 5);
  assert.equal(tile?.heading, HANDLED_WORDS.heading);
  assert.deepEqual(tile?.lines.map((l) => l.decision), ['D1', 'D2', 'D3', 'D4', 'D5']);
  assert.equal(tile?.more, 'and 4 more');
  assert.equal(handledTile(handledOf(answer([line(1)])))?.more, '');
});

test('A LINE WITH NO DECISION, NO WORDS OR AN ID FOR WORDS IS DROPPED, AND EM DASHES ARE SAID PLAINLY', () => {
  const found = handledOf(answer([{ ...line(1), decision: '' }, { ...line(2), line: '' }, { ...line(3), line: ULID }, { ...line(4), why: 'Seen today — so it moved' }, 'x', null]));
  assert.deepEqual(found?.rows.map((r) => r.decision), ['D4']);
  assert.equal(found?.rows[0]?.why, 'Seen today, so it moved');
});

test('A REFUSAL, A SHAPE OF ANOTHER KIND AND NOUGHT ARE ALL NOTHING', async () => {
  assert.equal(handledOf({ ok: false, refusal: { code: 'ROUTE_UNKNOWN' } }), null);
  assert.equal(handledOf({ ok: true, value: { rows: 'no' } }), null);
  assert.equal(handledTile(null), null);
  assert.equal(await readHandled(async () => answer([])), null);
  assert.equal(await readHandled(async () => { throw new Error('down'); }), null);
  assert.equal(await loadHandled('http://x.test', async () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } })), null);
});

test('THE TILE IS REACHED BY A DYNAMIC IMPORT, never from a file every screen loads', () => {
  const home = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /import\('\.\/handled\.ts'\)/);
  assert.doesNotMatch(home, /^\s*import .* from '\.\/handled\.ts'/mu);
});

test('"N MORE" OPENS THE LINES THE RECORD SENT, and only what it held back stays a count', () => {
  const found = handledOf(answer([1, 2, 3, 4, 5, 6, 7].map(line), 2));
  const shut = handledTile(found);
  assert.equal(shut?.lines.length, HANDLED_SHOWN);
  assert.equal(shut?.opens, 2, 'the two lines past the first five open in place');
  const open = handledTile(found, true);
  assert.equal(open?.lines.length, 7);
  assert.equal(open?.opens, 0);
  assert.equal(open?.more, 'and 2 more', 'what the record held back is still said');
  assert.equal(handledTile(handledOf(answer([line(1)])), true)?.more, '');
});

const told = (over: Partial<Thread> = {}): Thread => ({
  id: 'IN4',
  said: 'Merge wave 1, then stop',
  kind: 'tell',
  when: 'now',
  to: 'run',
  to_run: 'S1',
  to_agent: null,
  project: null,
  task: null,
  state: 'done',
  seen_by: 'S1',
  seen_how: 'prompt',
  seen_at: '2026-10-20T08:00:00.000Z',
  taken_by: 'S1',
  taken_at: '2026-10-20T08:00:00.000Z',
  reply: 'Merged W1-A to E, check green.',
  replied_at: '2026-10-20T09:00:00.000Z',
  expires_at: null,
  at: '2026-10-20T07:59:00.000Z',
  updated_at: '2026-10-20T09:00:00.000Z',
  seen: [],
  receipts: { run: 'S1', batches: [{ batch: 'b1', at: '2026-10-20T08:30:00.000Z', changes: 3, rows: [], names: [] }], changes: 3, head_before: 'a', head_after: 'b' },
  ...over,
});

test('WHAT AN AGENT FINISHED TODAY OF WHAT HE TOLD IT LANDS IN HANDLED, by the agent’s name, with its reply and changes', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  const lines = toldHandled([told(), told({ id: 'IN2', replied_at: '2026-10-18T09:00:00.000Z', updated_at: '2026-10-18T09:00:00.000Z' })], { S1: 'claude' }, now);
  assert.equal(lines.length, 1, 'only what was finished today');
  assert.equal(lines[0]?.line, 'Claude finished “Merge wave 1, then stop”');
  assert.equal(lines[0]?.why, 'Merged W1-A to E, check green. · 3 changes');
  assert.equal(lines[0]?.told?.changes, 3, 'its Undo puts back what the run changed');
  assert.doesNotMatch(`${lines[0]?.line} ${lines[0]?.why}`, /\bS1\b|\bIN4\b/u);
  const merged = withTold(handledOf(answer([line(1)])), lines);
  assert.deepEqual(merged?.rows.map((r) => r.decision), ['told:IN4', 'D1'], 'newest first');
  assert.equal(ownCount(merged), 1, '"BrainDog handled N itself" counts its own lines alone');
  assert.equal(withTold(null, []), null);
  assert.equal(withTold(null, lines)?.rows.length, 1);
});

test('TODAY SAYS WHAT AGENTS FINISHED AND WHAT THEY ASK, from the shell’s read, and Needs you lists what they ask', () => {
  const home = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /told=\{toldNeeds\} finished=\{finishedBy\}/u);
  const decide = readFileSync(new URL('../../routes/decide/+page.svelte', import.meta.url), 'utf8');
  assert.match(decide, /<ToldNeeds rows=\{toldNeeds\} \/>/u);
  assert.match(decide, /withTold\(handledRead, toldHandled\(/u);
});
