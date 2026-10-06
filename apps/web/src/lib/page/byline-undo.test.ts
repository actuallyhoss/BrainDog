/**
 * A byline's Undo reads the plan first: a change on its row alone goes back in one press, and one that touched more says
 * what else, in names, and lets the reader take back only this row's part (audit 20, M4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { planOf, undoApply, undoPlan, type UndoPlan } from '../record/undo-write.ts';
import type { Fetch } from '../record/boot-live.ts';
import { askOf, isOn, mineIn, onlyHere, undoAskWords, type Here } from './byline-undo.ts';

const HERE: Here = { at: { register: 'ledger', seq: 12 }, title: 'LOWRY ST STUDIOS RENT AUG', list: 'Money' };

const step = (title: string, extra: Record<string, unknown> = {}) => ({ title, label: 'With', from: 'empty', to: 'Lowry St Studios', do: 'set', ...extra });
const plan = (steps: Record<string, unknown>[], skipped: Record<string, unknown>[] = []): UndoPlan => planOf({ hash: 'h1', steps, skipped })!;

test('A CHANGE ON THIS ROW ALONE asks nothing: it goes back in the same press, as before', () => {
  assert.equal(askOf(plan([step(HERE.title, { register: 'ledger', seq: 12 })]), HERE), null);
  /* AN OLDER RECORD that names no row: the title and the list say it is this one. */
  assert.equal(askOf(plan([step(HERE.title, { list: 'Money' }), step(HERE.title, { list: 'Money', label: 'Note' })]), HERE), null);
});

test('A CHANGE THAT TOUCHED MORE names what else first, the lines it did, and how many each press puts back', () => {
  const walk = plan(
    [
      step(HERE.title, { register: 'ledger', seq: 12, row: '01J0000000000000000000000A' }),
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
  assert.equal(ask.lines[0], `Set With on ${HERE.title} to Lowry St Studios`);
  assert.ok(ask.lines.includes('Added Lowry St Studios'));
  assert.equal(ask.left, undoAskWords.left(1));
  assert.ok(!/01J|ledger|#\d/u.test([ask.lead, ...ask.lines].join(' ')), 'names, never ids, handles or list keys');
  assert.equal(undoAskWords.all(ask.all), 'Put back all 6');
});

test('a step is this row’s by list and number where the record says them, and by title and list name where it does not', () => {
  const s = (extra: Record<string, unknown>) => planOf({ hash: 'h', steps: [step(HERE.title, extra)] })!.steps[0]!;
  assert.equal(isOn(s({ register: 'ledger', seq: 12 }), HERE), true);
  assert.equal(isOn(s({ register: 'ledger', seq: 99 }), HERE), false, 'the same title on another row is another row');
  assert.equal(isOn(s({ list: 'Money' }), HERE), true);
  assert.equal(isOn(s({ list: 'Tasks' }), HERE), false);
});

test('A LONG TITLE THE RECORD CLIPPED is still this row, so a change on it alone goes back in one press', () => {
  const long = 'Quarterly reconciliation of the studio rent, deposits and the service charge for the whole of 2026';
  const here: Here = { ...HERE, title: long };
  const clipped = `${long.slice(0, 79).trimEnd()}…`;
  assert.equal(askOf(plan([step(clipped, { list: 'Money', row: 'A' })]), here), null);
  assert.equal(isOn(planOf({ hash: 'h', steps: [step('Quarterly…', { list: 'Money' })] })!.steps[0]!, here), true);
  assert.equal(isOn(planOf({ hash: 'h', steps: [step('Monthly…', { list: 'Money' })] })!.steps[0]!, here), false);
});

test('AN UNTITLED ROW is told by the record’s handle, never by a title it shares with every other untitled row', () => {
  const here: Here = { ...HERE, title: '' };
  /* ONE ROW PUT BACK, nothing left: the change the byline names, so it goes in one press. */
  assert.equal(askOf(plan([step('a payment', { list: 'Money', row: 'A' }), step('a payment', { list: 'Money', row: 'A', label: 'Note' })]), here), null);
  /* TWO UNTITLED PAYMENTS: which is this one cannot be said, so neither is taken for it and the whole is asked first. */
  const two = askOf(plan([step('a payment', { list: 'Money', row: 'A' }), step('a payment', { list: 'Money', row: 'B' })]), here);
  assert.ok(two);
  assert.equal(two.mine, 0);
  assert.equal(two.all, 2);
});

test('A STEP ON ANOTHER HANDLE is another row, and a step on this row’s handle is this row’s', () => {
  const p = plan([
    step(HERE.title, { list: 'Money', row: 'A' }),
    step(HERE.title, { list: 'Money', row: 'A', label: 'Note' }),
    step('Lowry St Studios', { list: 'Organisations', row: 'C', do: 'remove', label: null }),
  ]);
  assert.deepEqual(mineIn(p, HERE), [true, true, false]);
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

const WHOLE = { hash: 'all', steps: [step(HERE.title, { register: 'ledger', seq: 12 }), step('HSBC FEE SEP', { register: 'ledger', seq: 13 })], skipped: [] };
const MINE = { hash: 'mine', steps: [step(HERE.title, { register: 'ledger', seq: 12 })], skipped: [] };

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
