/**
 * ONE DECISION CARD (`card.ts`): what every place a question is drawn says about it, read without a DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { answeredLine, askerOf, byWords, cardOf, movesOf, nameOrNull, shiftsOf } from './card.ts';

const now = Date.parse('2026-10-06T09:00:00Z');

const ask = (over: Partial<QueueQuestion> & Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG7',
    who: 'agent:claude',
    at: '2026-10-06T07:00:00Z',
    kind: 'options',
    question: 'Which plan for Bake?',
    why: 'Two of the three quotes came back.',
    cost: 'call',
    options: [
      { key: 'seat', label: 'Per seat', because: 'Cheaper under ten people', recommended: true },
      { key: 'flat', label: 'Flat', because: '', recommended: false },
    ],
    ...over,
  }) as QueueQuestion;

test('WHY COMES FIRST, with who asked, and the suggestion is marked where it can be undone', () => {
  const card = cardOf(ask(), { now, home: 'GBP' });
  assert.equal(card.question, 'Which plan for Bake?');
  assert.equal(card.why, 'Two of the three quotes came back.');
  assert.equal(card.by.kind, 'agent');
  assert.equal(card.when, '2h ago');
  assert.equal(card.suggests, true);
  assert.equal(card.enter, 'seat', 'Enter gives the suggested answer');
  assert.equal(card.decline, null, 'a question of options has no Decline key');
  assert.equal(card.band, '', 'the plainest band is not said');
  assert.equal(card.href, '/decide/SG7');
});

test('NOTHING IS MARKED, AND NO KEY ANSWERS, WHERE IT IS HARD TO UNDO OR MONEY MOVES', () => {
  const hard = cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' });
  assert.equal(hard.suggests, false);
  assert.equal(hard.enter, null);
  assert.ok(hard.band !== '', 'a band that warns is said');

  const paying = cardOf(ask({ kind: 'rowset', options: [], money: { amount: 1298, currency: 'GBP' } }), { now, home: 'GBP' });
  assert.equal(paying.money, 'Moves £12.98');
  assert.deepEqual(
    paying.ways.map((w) => w.label),
    ['Accept £12.98', 'Decline'],
    'Accept names the amount and Reject says Decline',
  );
  assert.equal(paying.enter, null, 'Enter never accepts money');
  assert.equal(paying.decline, 'reject');
  assert.equal(paying.seeWhole, true);
});

test('TWO CURRENCIES ARE NEVER ADDED, and amounts pointing both ways name what moves', () => {
  assert.deepEqual(movesOf([{ amount: 500, currency: 'GBP' }, { amount: 700, currency: 'usd' }]), [
    { amount: 500, currency: 'GBP' },
    { amount: 700, currency: 'USD' },
  ]);
  assert.deepEqual(movesOf([{ amount: -300, currency: 'GBP' }, { amount: 300, currency: 'GBP' }]), [{ amount: 600, currency: 'GBP' }]);
  assert.deepEqual(movesOf({ amount: 12.5, currency: 'GBP' }), [], 'a fraction of a minor unit is not money');
  assert.deepEqual(movesOf({ amount: '1200', currency: 'JPY' }), [{ amount: 1200, currency: 'JPY' }]);
  assert.deepEqual(movesOf(undefined), []);
});

test('WHO ASKED IS THE AGENT, THE APP AND THE RUN, and never an id', () => {
  const by = askerOf(ask({ app: 'Claude Code · MacBook', run: { id: '01J9Z8X7W6V5T4S3R2Q1P0N9M8', name: 'Tidy invoices' } }));
  assert.deepEqual(byWords(by), ['Claude', 'Claude Code · MacBook', 'Tidy invoices']);
  const bare = askerOf(ask({ run: '01J9Z8X7W6V5T4S3R2Q1P0N9M8', app: '/Users/sam/repo' }));
  assert.deepEqual(byWords(bare), ['Claude'], 'a run named by its id and an app named by a path say nothing');
  for (const id of ['tools#8', 'run_42', 'agent:claude', 'SG14', 'sam-mbp.local', '01J9Z8X7W6V5T4S3R2Q1P0N9M8']) assert.equal(nameOrNull(id), null, id);
  for (const name of ['Claude Code', 'claude.ai', 'MacBook']) assert.equal(nameOrNull(name), name);
});

test('WHAT CHANGES IS SAID FROM WHAT TO WHAT, and an id is never a value', () => {
  assert.deepEqual(shiftsOf(ask({ before: { status: 'open', due_on: '2026-10-01' }, after: { status: 'paid', due_on: '2026-10-01' } }), 'GBP'), [
    { what: 'status', before: 'open', after: 'paid' },
  ]);
  assert.deepEqual(shiftsOf(ask({ changes: [{ field: 'amount', before: { amount: 100, currency: 'GBP' }, after: { amount: 250, currency: 'GBP' } }] }), 'GBP'), [
    { what: 'amount', before: '£1', after: '£2.50' },
  ]);
  assert.deepEqual(shiftsOf(ask({ changes: [{ field: 'amount', before: { amount: 0, currency: 'GBP' }, after: { amount: 250, currency: 'GBP' } }] }), 'GBP'), [
    { what: 'amount', before: '£0', after: '£2.50' },
  ], 'an amount that was nothing is still an amount');
  assert.deepEqual(movesOf([{ amount: 0, currency: 'GBP' }, { amount: 0, currency: 'GBP' }]), [], 'zero moves nothing, in any position');
  assert.deepEqual(shiftsOf(ask({ before: null, after: 'Weekly' }), 'GBP'), [{ what: '', before: 'nothing', after: 'Weekly' }]);
  assert.deepEqual(shiftsOf(ask({ changes: [{ field: 'owner', before: 'people#3', after: 'people#4' }] }), 'GBP'), [], 'a handle is no value');
  assert.deepEqual(shiftsOf(ask(), 'GBP'), [], 'an older record sends none');
});

test("A SLASH PROPOSAL'S ANSWERED LINE READS AS ITS HISTORY", () => {
  const slash = cardOf(ask({ who: 'slash', kind: 'rowset', options: [] }), { now });
  assert.equal(slash.slash, true);
  const accept = slash.ways.find((w) => w.key === 'accept')!;
  assert.equal(answeredLine(slash, accept, 'Sam', 'just now'), 'Slash suggested · Sam accepted');
  assert.equal(answeredLine(slash, slash.ways.find((w) => w.key === 'reject')!, 'Sam', 'just now'), 'Slash suggested · Sam declined');
  const drafted = cardOf(ask({ who: 'agent:claude', drafted_by: 'slash:model' }), { now });
  assert.equal(drafted.slash, true, 'drafted by Slash for whoever filed it');
  assert.equal(answeredLine(drafted, drafted.ways[1]!, 'Sam', 'just now'), 'Slash suggested · Sam chose Flat');
  const plain = cardOf(ask(), { now });
  assert.equal(answeredLine(plain, plain.ways[0]!, 'Sam', 'just now'), 'Per seat · you, just now');
  for (const s of [answeredLine(slash, accept, 'Sam', 'now'), slash.money, ...slash.ways.map((w) => w.label)]) assert.doesNotMatch(s, /—/u);
});

test('A MERGE IS STILL DRAWN AS ONE, from the options the record offers', () => {
  const candidates = [
    { at: 'people#1', name: 'Ana', seen: [], kept: true as const },
    { at: 'people#2', name: 'Ana B', seen: ['GitHub'] },
  ];
  const card = cardOf(
    ask({
      candidates,
      options: [
        { key: 'merge', label: 'Merge all', because: '', recommended: false },
        { key: 'apart', label: 'Keep apart', because: '', recommended: false },
        { key: 'pick:people#2', label: 'Pick', because: '', recommended: false },
      ],
    }),
    { now },
  );
  assert.equal(card.merge?.all.option, 'merge');
  assert.equal(card.merge?.apart.option, 'apart');
});

/* ── every place a question is drawn draws this card ───────────────────────── */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('THE FOUR DRAWS AND THE PALETTE DRAW THIS CARD', () => {
  for (const path of ['../page/QueueAnswer.svelte', '../home/Question.svelte', '../../routes/decide/Classic.svelte', '../palette/Palette.svelte'])
    assert.match(src(path), /import DecisionCard from '\$lib\/decide\/DecisionCard\.svelte'/u, `${path} draws a card of its own`);
  const card = src('./DecisionCard.svelte');
  assert.match(card, /cardOf\(/u, 'the card reads its view model');
  assert.match(card, /import MergeCard from/u, 'a merge is a variant of the card');
  assert.match(card, /hold\(/u, 'a press is held for its Undo');
  assert.doesNotMatch(card, /—/u);
});
