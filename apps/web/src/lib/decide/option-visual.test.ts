import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { QueueQuestion } from '@braindog/kernel';

import { dayOf, leadFirst, visualOf } from './option-visual.ts';

const now = Date.parse('2026-10-20T09:00:00Z');
const ask = (extra: Record<string, unknown> = {}): QueueQuestion =>
  ({ id: 'SG3', who: 'agent:claude', at: '2026-10-20T07:00:00Z', kind: 'rowset', question: 'Settle it?', why: '', cost: 'call', options: [], ...extra }) as QueueQuestion;

test('a payment option sets its amount against the balance', () => {
  const v = visualOf(ask({ money: [{ amount: 25000, currency: 'GBP' }] }), { key: 'accept' }, { now, balance: { amount: 100000, currency: 'GBP' } });
  assert.equal(v?.kind, 'money');
  assert.equal(v?.kind === 'money' && v.share, 0.25);
  assert.equal(v?.kind === 'money' && v.basis, 'balance');
});

test('a payment bigger than the month clamps its bar and says it is over', () => {
  const v = visualOf(ask({ money: [{ amount: 300, currency: 'USD' }] }), { key: 'accept' }, { now, spend: { amount: 100, currency: 'USD' } });
  assert.deepEqual(v && v.kind === 'money' ? [v.share, v.over, v.basis] : null, [1, true, 'spend']);
});

test('money with nothing to set it against, or in another currency, draws nothing', () => {
  const q = ask({ money: [{ amount: 500, currency: 'GBP' }] });
  assert.equal(visualOf(q, { key: 'accept' }, { now }), null);
  assert.equal(visualOf(q, { key: 'accept' }, { now, balance: { amount: 9000, currency: 'EGP' } }), null);
});

test('a due date draws today and the day, late when it has passed', () => {
  const q = ask({ changes: [{ field: 'due_on', before: '2026-10-18', after: '2026-10-25' }] });
  const v = visualOf(q, { key: 'accept' }, { now });
  assert.deepEqual(v && v.kind === 'date' ? [v.days, v.late, v.was === dayOf('2026-10-18')] : null, [5, false, true]);
  const late = visualOf(ask({ changes: [{ field: 'due_on', before: null, after: '2026-10-17' }] }), { key: 'accept' }, { now });
  assert.equal(late?.kind === 'date' && late.late, true);
});

test('a field change draws before and after, and a first value alone draws nothing', () => {
  const v = visualOf(ask({ changes: [{ field: 'stage', before: 'Draft', after: 'Live' }] }), { key: 'accept' }, { now });
  assert.deepEqual(v, { kind: 'change', what: 'stage', before: 'Draft', after: 'Live' });
  assert.equal(visualOf(ask({ changes: [{ field: 'stage', before: null, after: 'Live' }] }), { key: 'accept' }, { now }), null);
});

test('a merge draws the names joining into the one kept, or the one picked', () => {
  const q = ask({ candidates: [{ at: 'r1', name: 'Priya Raman', seen: [], kept: true }, { at: 'r2', name: 'S. Raman', seen: [] }] });
  assert.deepEqual(visualOf(q, { key: 'merge' }, { now }), { kind: 'merge', names: ['Priya Raman', 'S. Raman'], into: 'Priya Raman' });
  const picked = visualOf(q, { key: 'pick:r2' }, { now });
  assert.equal(picked?.kind === 'merge' && picked.into, 'S. Raman');
  assert.equal(visualOf(q, { key: 'apart' }, { now }), null);
});

test('a filing names its list and the row figure', () => {
  const v = visualOf(ask(), { key: 'accept' }, { now, listName: 'Invoices', figure: 'EGP 467,915' });
  assert.deepEqual(v, { kind: 'filing', list: 'Invoices', figure: 'EGP 467,915' });
});

test('declining and a plain option with nothing of its own draw nothing', () => {
  const q = ask({ money: [{ amount: 100, currency: 'GBP' }] });
  assert.equal(visualOf(q, { key: 'reject' }, { now, balance: { amount: 900, currency: 'GBP' } }), null);
  assert.equal(visualOf(q, { key: 'seat' }, { now, balance: { amount: 900, currency: 'GBP' } }), null);
});

test('an option carrying its own money is drawn from that, not the question', () => {
  const v = visualOf(ask(), { key: 'annual', money: [{ amount: 12000, currency: 'GBP' }] } as { key: string }, { now, spend: { amount: 48000, currency: 'GBP' } });
  assert.equal(v?.kind === 'money' && v.share, 0.25);
});

test('the suggested option leads and the others keep their order', () => {
  assert.deepEqual(leadFirst([{ recommended: false, k: 'a' }, { recommended: true, k: 'b' }, { recommended: false, k: 'c' }]).map((w) => w.k), ['b', 'a', 'c']);
});

test('the card draws a picture only for an option with a kind, after its own picture', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('./DecisionCard.svelte', import.meta.url), 'utf8');
  assert.match(card, /\{#if !way\.shows\}<OptionVisual/u);
  const one = readFileSync(new URL('./OptionVisual.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(one, /\{:else\}/u, 'an option with no kind drew a placeholder');
});

test('text that is no day on the calendar is no day', () => {
  assert.equal(dayOf('2026-02-30'), null);
  assert.notEqual(dayOf('2026-02-28'), null);
});
