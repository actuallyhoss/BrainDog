/**
 * Alike questions drawn as one (`alike.ts`): a family folds into the place of its first member, a lone question and an
 * arrangement stay as they are, and the answer offered is what every member offers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueueQuestion } from '@braindog/kernel';

import { alikeOf, alikeWords, memberLines, runFamily, sharedOptions, sharedWays } from './alike.ts';

const opt = (key: string) => ({ key, label: key, because: '', recommended: false });
const q = (id: string, cause: string | undefined, alike: number, keys = ['accept', 'dismiss']): QueueQuestion =>
  ({ id, kind: 'rule', question: id, options: keys.map(opt), ...(cause ? { cause, alike } : {}) }) as unknown as QueueQuestion;

test('questions of one cause fold into the first one\'s place', () => {
  const out = alikeOf([q('a', 'c1', 3), q('b', undefined, 1), q('c', 'c1', 3), q('d', 'c1', 3)]);
  assert.deepEqual(out.map((e) => e.kind), ['many', 'one']);
  const many = out[0]!;
  assert.ok(many.kind === 'many' && many.lead.id === 'a' && many.rest.map((r) => r.id).join() === 'c,d');
});

test('a cause with one member drawn stays a plain question', () => {
  assert.deepEqual(alikeOf([q('a', 'c1', 3), q('b', 'c2', 2)]).map((e) => e.kind), ['one', 'one']);
});

test('an arrangement is never folded', () => {
  const pack = { ...q('p', 'c1', 2), body_kind: 'pack' } as QueueQuestion;
  assert.deepEqual(alikeOf([pack, { ...pack, id: 'p2' } as QueueQuestion]).map((e) => e.kind), ['one', 'one']);
});

test('only the options every member offers are shared', () => {
  assert.deepEqual(sharedOptions(q('a', 'c', 2), [q('b', 'c', 2, ['accept'])]).map((o) => o.key), ['accept']);
});

/* FOUR BANK TEXTS TO FOUR PAYEES, as his record held them on 20 October: one cause each (the payee is in it, and a cause
   holds one open question), so each came `alike: 1`, and the queue drew four cards. */
const bank = (id: string, cause: string, amount: number, extra: Partial<QueueQuestion> = {}): QueueQuestion =>
  ({
    id,
    who: 'ingest:bank-ipn-out-sms',
    at: '2026-10-19T14:48:12.952Z',
    kind: 'rowset',
    body_kind: 'rowset',
    question: 'Add this message to Ledger? Its last digits match HSBC (EGP).',
    why: 'It was matched to HSBC (EGP) by its last digits, 5826. Say yes once and later ones are added straight away.',
    cost: 'undo',
    options: ['accept', 'dismiss'].map(opt),
    money: [{ amount, currency: 'EGP' }],
    cause,
    alike: 1,
    ...extra,
  }) as unknown as QueueQuestion;

test('four bank texts with their own causes fold into one card, each told apart by its money', () => {
  const four = [
    bank('SG169', 'ingest#0a1b2c3d4e5f60718293a4b5', 3462000),
    bank('SG174', 'ingest#318a43530caf64d30e0e857a', 150150),
    q('SG200', 'rule#x', 1),
    bank('SG175', 'ingest#3275c39700647321fab106b3', 3050),
    bank('SG179', 'ingest#9f8e7d6c5b4a39281706f5e4', 235235),
  ];
  const out = alikeOf(four);
  assert.deepEqual(out.map((e) => e.kind), ['many', 'one']);
  const many = out[0]!;
  assert.ok(many.kind === 'many');
  assert.equal(many.lead.id, 'SG169');
  assert.deepEqual(many.rest.map((r) => r.id), ['SG174', 'SG175', 'SG179']);
  assert.deepEqual(sharedOptions(many.lead, many.rest).map((o) => o.key), ['accept', 'dismiss']);
  assert.deepEqual(memberLines([many.lead, ...many.rest]).map((m) => m.line), ['EGP 34,620.00', 'EGP 1,501.50', 'EGP 30.50', 'EGP 2,352.35']);
});

test('bank texts matched to another account, or from another ingest, are another family', () => {
  const other = bank('b', 'ingest#b', 100, { question: 'Add this message to Ledger? Its last digits match CIB (EGP).' });
  const card = bank('c', 'ingest#c', 100, { who: 'ingest:card-alerts' });
  assert.deepEqual(alikeOf([bank('a', 'ingest#a', 100), other, card]).map((e) => e.kind), ['one', 'one', 'one']);
});

test("a cause's overflow question is the cause it overflowed", () => {
  assert.deepEqual(alikeOf([q('a', 'rule#c1', 1), q('b', 'rule#c1#2', 1)]).map((e) => e.kind), ['many']);
});

/* ONE RUN'S CLEANUP, as S904 left his record on 24 October: rowsets, each its own cause, and two calls asked as options. */
const ran = (id: string, kind: 'rowset' | 'options', run = 'S904'): QueueQuestion =>
  ({
    id,
    who: run,
    at: '2026-10-23T20:00:00.000Z',
    kind,
    body_kind: kind,
    question: `Change ${id}?`,
    why: '',
    cost: 'undo',
    options: kind === 'options' ? ['yes', 'no'].map(opt) : [],
    cause: `rowset#${id}`,
    alike: 1,
    run: { id: run, name: 'Tidy projects, tasks, handoffs, tools, services and people', app: 'Claude Code' },
  }) as unknown as QueueQuestion;

test("one run's 24 rowsets fold into one card, and its two options questions stay apart", () => {
  const queue = [ran('SG281', 'options'), ...Array.from({ length: 24 }, (_, i) => ran(`SG${300 + i}`, 'rowset')), ran('SG288', 'options'), q('SG9', 'c9', 1)];
  const out = alikeOf(queue);
  assert.deepEqual(out.map((e) => e.kind), ['one', 'many', 'one', 'one']);
  const many = out[1]!;
  assert.ok(many.kind === 'many');
  assert.equal(many.rest.length + 1, 24);
  assert.deepEqual(runFamily(many.lead, many.rest), { id: 'S904', name: 'Tidy projects, tasks, handoffs, tools, services and people' });
  /* A rowset lists no options, and the card still offers Accept and Decline on all of them. */
  assert.deepEqual(sharedWays(many.lead, many.rest).map((w) => w.key), ['accept', 'reject']);
  assert.equal(alikeWords.fromRun(24, 'Tidy projects'), 'Approve all 24 from Tidy projects?');
});

test('two rowsets from one run are not a run family, and two runs are two families', () => {
  assert.deepEqual(alikeOf([ran('a', 'rowset'), ran('b', 'rowset')]).map((e) => e.kind), ['one', 'one']);
  const two = alikeOf([ran('a', 'rowset'), ran('b', 'rowset'), ran('c', 'rowset'), ran('x', 'rowset', 'S905'), ran('y', 'rowset', 'S905'), ran('z', 'rowset', 'S905')]);
  assert.deepEqual(two.map((e) => (e.kind === 'many' ? e.lead.id : e.q.id)), ['a', 'x']);
});
