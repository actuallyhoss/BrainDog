/**
 * A byline's Undo reads the plan first: a change on its row alone goes back in one press, and one that touched more says
 * what else, in names, and lets the reader take back only this row's part.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { planOf, undoApply, undoPlan, type UndoPlan } from '../record/undo-write.ts';
import type { Fetch } from '../record/boot-live.ts';
import { askOf, isOn, mineIn, onlyHere, undoAskWords, type Here } from './byline-undo.ts';

const HERE: Here = { at: { register: 'ledger', seq: 12 }, id: null };
const TITLE = 'LOWRY ST STUDIOS RENT AUG';

const step = (title: string, extra: Record<string, unknown> = {}) => ({ title, label: 'With', from: 'empty', to: 'Lowry St Studios', do: 'set', ...extra });
const plan = (steps: Record<string, unknown>[], skipped: Record<string, unknown>[] = []): UndoPlan => planOf({ hash: 'h1', steps, skipped })!;

test('A CHANGE ON THIS ROW ALONE asks nothing: it goes back in the same press, as before', () => {
  assert.equal(askOf(plan([step(TITLE, { register: 'ledger', seq: 12 })]), HERE), null);
  /* A STEP WITH NO NUMBER on the id of one that has it is this row's too. */
  assert.equal(askOf(plan([step(TITLE, { register: 'ledger', seq: 12, row: 'A' }), step(TITLE, { row: 'A', label: 'Note' })]), HERE), null);
  /* AND BY THE ROW'S OWN ID, where the page was sent it. */
  assert.equal(askOf(plan([step(TITLE, { list: 'Money', row: 'A' })]), { ...HERE, id: 'A' }), null);
});

test('A RECORD THAT NAMES NO ROW is never matched by title: the change is said whole and asked first', () => {
  const ask = askOf(plan([step(TITLE, { list: 'Money' }), step('HSBC FEE SEP', { list: 'Money' })]), HERE);
  assert.ok(ask);
  assert.equal(ask.mine, 0);
  assert.equal(ask.lead, `This change touched ${TITLE} and HSBC FEE SEP.`, 'nothing is "also" when no step is known as this row');
});

test('A CHANGE THAT TOUCHED MORE names what else first, the lines it did, and how many each press puts back', () => {
  const walk = plan(
    [
      step(TITLE, { register: 'ledger', seq: 12, row: '01J0000000000000000000000A' }),
      step('HSBC FEE SEP', { register: 'ledger', seq: 13, row: '01J0000000000000000000000B' }),
      step('Lowry St Studios', { register: 'organisations', seq: 1, do: 'remove', row: '01J0000000000000000000000C', label: null }),
      step('CITY WATER', { register: 'ledger', seq: 14 }),
      step('CITY WATER', { register: 'ledger', seq: 14, label: 'Note' }),
      step('Gym', { register: 'ledger', seq: 15 }),
    ],
    [{ title: 'Rent', why: 'You changed it since.' }],
  );
  const ask = askOf(walk, HERE);
  assert.ok(ask);
  assert.equal(ask.lead, 'This change also touched HSBC FEE SEP, Lowry St Studios, CITY WATER and 1 more.');
  assert.equal(ask.all, 6);
  assert.equal(ask.mine, 1);
  assert.equal(ask.lines[0], `Set With on ${TITLE} to Lowry St Studios`);
  assert.ok(ask.lines.includes('Added Lowry St Studios'));
  assert.equal(ask.left, undoAskWords.left(1));
  assert.ok(!/01J|ledger|#\d/u.test([ask.lead, ...ask.lines].join(' ')), 'names, never ids, handles or list keys');
  assert.equal(undoAskWords.all(ask.all), 'Put back all 6');
});

test('a step is this row’s by list and number, or by the row’s id, and never by its title', () => {
  const s = (extra: Record<string, unknown>) => planOf({ hash: 'h', steps: [step(TITLE, extra)] })!.steps[0]!;
  assert.equal(isOn(s({ register: 'ledger', seq: 12 }), HERE), true);
  assert.equal(isOn(s({ register: 'ledger', seq: 99 }), HERE), false, 'the same title on another row is another row');
  assert.equal(isOn(s({ list: 'Money' }), HERE), false, 'a title and a list name say nothing about which row');
  assert.equal(isOn(s({ list: 'Money', row: 'A' }), { ...HERE, id: 'A' }), true);
  assert.equal(isOn(s({ list: 'Money', row: 'B' }), { ...HERE, id: 'A' }), false);
  assert.equal(isOn(s({ register: 'ledger', seq: 99, row: 'A' }), { ...HERE, id: 'A' }), false, 'the number the record says wins');
});

test('TWO ROWS WITH THE SAME TITLE IN ONE WALK are told apart: only the one on this row is this row’s', () => {
  const walk = plan([
    step('STRIPE PAYOUT', { register: 'ledger', seq: 12, row: 'A' }),
    step('STRIPE PAYOUT', { register: 'ledger', seq: 13, row: 'B' }),
    step('STRIPE PAYOUT', { row: 'B', label: 'Note' }),
  ]);
  assert.deepEqual(mineIn(walk, HERE), [true, false, false]);
  const ask = askOf(walk, HERE);
  assert.ok(ask, 'the other payout is asked about before anything goes back');
  assert.equal(ask.mine, 1);
  assert.equal(ask.lead, 'This change also touched STRIPE PAYOUT.');
  assert.equal(onlyHere(walk, HERE), false);
  /* AND THE SAME WALK WITH NO NUMBERS, matched by the row's id. */
  const bare = plan([step('STRIPE PAYOUT', { row: 'A' }), step('STRIPE PAYOUT', { row: 'B' })]);
  assert.deepEqual(mineIn(bare, { ...HERE, id: 'A' }), [true, false]);
  assert.deepEqual(mineIn(bare, HERE), [false, false], 'with no id here, neither is claimed');
});

test('AN UNTITLED ROW never claims another row: a plan that touched one other row is asked about first', () => {
  /* THE OLD FIRST BRANCH took a single row's change as this row's when this one had no title. */
  const one = askOf(plan([step('a payment', { list: 'Money', row: 'B' }), step('a payment', { list: 'Money', row: 'B', label: 'Note' })]), { ...HERE, id: 'A' });
  assert.ok(one);
  assert.equal(one.mine, 0);
  /* ITS OWN CHANGE, by number or id, goes in one press. */
  assert.equal(askOf(plan([step('a payment', { register: 'ledger', seq: 12, row: 'A' })]), HERE), null);
  assert.equal(askOf(plan([step('a payment', { list: 'Money', row: 'A' })]), { ...HERE, id: 'A' }), null);
  /* TWO UNTITLED PAYMENTS and no handle here: neither is taken for it and the whole is asked first. */
  const two = askOf(plan([step('a payment', { list: 'Money', row: 'A' }), step('a payment', { list: 'Money', row: 'B' })]), HERE);
  assert.ok(two);
  assert.equal(two.mine, 0);
  assert.equal(two.all, 2);
});

test('A STEP ON ANOTHER HANDLE is another row, and a step on this row’s handle is this row’s', () => {
  const p = plan([
    step(TITLE, { list: 'Money', row: 'A' }),
    step(TITLE, { list: 'Money', row: 'A', label: 'Note' }),
    step('Lowry St Studios', { list: 'Organisations', row: 'C', do: 'remove', label: null }),
  ]);
  assert.deepEqual(mineIn(p, { ...HERE, id: 'A' }), [true, true, false]);
});

/* ── only this one, against a record ─────────────────────────────────────── */

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function host(answer: (body: Record<string, unknown>) => unknown): { io: Fetch; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const io = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    sent.push(body);
    return json({ ok: true, value: answer(body) });
  }) as Fetch;
  return { io, sent };
}

const WHOLE = { hash: 'all', steps: [step(TITLE, { register: 'ledger', seq: 12 }), step('HSBC FEE SEP', { register: 'ledger', seq: 13 })], skipped: [] };
const MINE = { hash: 'mine', steps: [step(TITLE, { register: 'ledger', seq: 12 })], skipped: [] };

test('ONLY THIS ONE asks the record for this row’s part, by list and number, and sends back that plan’s hash', async () => {
  const { io, sent } = host((b) => (b.dry ? (b.row ? MINE : WHOLE) : { put: 1 }));
  const scope = { batch: 'b7', row: HERE.at };
  const read = await undoPlan('http://record.test', scope, io);
  assert.equal(read.from, 'plan');
  assert.ok(read.from === 'plan' && onlyHere(read.plan, HERE));
  const out = read.from === 'plan' ? await undoApply('http://record.test', scope, read.plan, io) : null;
  assert.equal(out?.from, 'undone');
  assert.deepEqual(sent, [
    { batch: 'b7', row: { register: 'ledger', seq: 12 }, dry: true },
    { batch: 'b7', row: { register: 'ledger', seq: 12 }, hash: 'mine' },
  ]);
});

test('A RECORD THAT DOES NOT KNOW THE ROW FILTER answers the whole change again, and that is never this row’s part', async () => {
  const { io } = host(() => WHOLE);
  const read = await undoPlan('http://record.test', { batch: 'b7', row: HERE.at }, io);
  assert.ok(read.from === 'plan' && !onlyHere(read.plan, HERE));
});

test('ONLY THIS ONE IS OFFERED ONLY WHEN THE RECORD ANSWERED THIS ROW’S PART, read beside the whole before the ask is drawn', () => {
  const host = readFileSync(new URL('./row-host.svelte.ts', import.meta.url), 'utf8');
  assert.match(host, /undoPlan\(this\.#deps\.base\(\), \{ batch, row: here\.at \}/u, 'this row’s part is asked for before the ask is drawn');
  assert.match(host, /onlyHere\(mine\.plan, here\) \? mine\.plan : null/u, 'a whole change answered again is never offered as this row’s');
  assert.match(host, /undoApply\(this\.#deps\.base\(\), scope, only,/u, 'Only this one sends the hash of the plan read for this row');
  const ask = readFileSync(new URL('./UndoAsk.svelte', import.meta.url), 'utf8');
  assert.match(ask, /\{#if a\.only\}/u, 'no button for a part the record would not keep to this row');
  /* AND AN EMPTY PART is no part: the record kept nothing of this row to put back. */
  assert.equal(onlyHere(plan([]), HERE), true, 'onlyHere is vacuous on nothing, so the host checks there is something');
  assert.match(host, /mine\.plan\.steps\.length > 0/u);
});
