/**
 * Run again over what is already there: the dry run's sentences for none, one and many, who takes what by name and
 * never by handle, a refusal in the record's own words, and the press's result with the batch Undo takes back.
 * Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { againWords, applyRule, contestLines, contestOf, doneOf, doneSaid, dryLines, dryOf, dryRule, fieldOf, labelOf, nameFor, type Call } from './run-again.ts';

const names = nameFor(new Map([['tea-shop', 'Tea shop by payee'], ['rent', 'Rent rule']]));
const applied = (over: Record<string, unknown> = {}) => ({ rule: 'tea-shop', matched: 7, applied: 0, kept: 5, remaining: 0, sample: [], refusals: [], filled: 7, left: 5, ...over });

test('the dry run says how many it would fill, for none, one and many', () => {
  assert.deepEqual(dryLines(dryOf(applied({ filled: 0, kept: 0 }))!, names), ['Nothing would be filled.']);
  assert.deepEqual(dryLines(dryOf(applied({ filled: 1, kept: 0 }))!, names), ['Would fill 1.']);
  assert.deepEqual(dryLines(dryOf(applied({ filled: 1200, kept: 1 }))!, names), ['Would fill 1,200.', '1 is already set by hand.']);
});

test('what another rule took is said by its name, and the rest of what holds a value as set by hand', () => {
  const dry = dryOf(applied(), { won: 7, lost: 2, takenBy: { rent: 2 } })!;
  assert.deepEqual(dryLines(dry, names), ['Would fill 7.', '3 are already set by hand.', '2 are taken by Rent rule.']);
  /* A RULE THE PAGE HAS NO NAME FOR IS SAID IN WORDS, never as its handle. */
  const other = dryOf(applied({ kept: 1 }), { takenBy: { 'rule.late-fee': 1 } })!;
  assert.deepEqual(dryLines(other, names), ['Would fill 7.', '1 is taken by Late fee.']);
});

test('taken counts never pass what already holds a value', () => {
  const dry = dryOf(applied({ kept: 3 }), { takenBy: { rent: 2, 'tea-shop-two': 4 } })!;
  assert.equal(dry.held, 0);
  assert.deepEqual(dry.taken, [
    { rule: 'tea-shop-two', n: 3 },
  ]);
});

test('past the page and skipped calls are said, once each', () => {
  const lines = dryLines(dryOf(applied({ remaining: 40, calls_skipped: 3, kept: 0 }))!, names);
  assert.deepEqual(lines, ['Would fill 7.', againWords.later(40), againWords.calls]);
});

test('dryRule asks both reads, and a dryRun refusal keeps the fill figure', async () => {
  const asked: string[] = [];
  const call: Call = async (name, args) => {
    asked.push(`${name} ${JSON.stringify(args)}`);
    if (name === 'dryRun') return { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'You cannot read Ledger.' } };
    return { ok: true, value: applied() };
  };
  const out = await dryRule(call, 'tea-shop', { rule: 'tea-shop', register: 'ledger', then: [{ set: { field: 'category', to: 'Tea' } }] });
  assert.ok(out.ok);
  assert.equal(out.value.fill, 7);
  assert.equal(out.value.held, 5);
  assert.deepEqual(asked[0], 'ruleApply {"id":"tea-shop","dry":true}');
  assert.match(asked[1]!, /^dryRun /u);
});

test('a refusal is the record\'s own sentence, and a throw says nothing was changed', async () => {
  const refused: Call = async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner can run a rule again.' } });
  assert.deepEqual(await dryRule(refused, 'tea-shop'), { ok: false, fix: 'Only the owner can run a rule again.' });
  assert.deepEqual(await applyRule(refused, 'tea-shop'), { ok: false, fix: 'Only the owner can run a rule again.' });
  const thrown: Call = async () => {
    throw new Error('offline');
  };
  assert.deepEqual(await applyRule(thrown, 'tea-shop'), { ok: false, fix: againWords.unreached });
});

test('the press says what it filled, what it refused, and carries the batch', async () => {
  const call: Call = async (name, args) => {
    assert.equal(name, 'ruleApply');
    assert.deepEqual(args, { id: 'tea-shop' });
    return { ok: true, value: applied({ applied: 6, filled: 6, refusals: [{ code: 'VALUE_MALFORMED', fix: 'Category takes one of its choices.' }], batch: '01JTEABATCH' }) };
  };
  const out = await applyRule(call, 'tea-shop');
  assert.ok(out.ok);
  assert.equal(out.value.batch, '01JTEABATCH');
  assert.equal(doneSaid(out.value), 'Filled 6. 1 was refused: Category takes one of its choices.');
  assert.equal(doneSaid(doneOf(applied({ filled: 0 }))!), 'Nothing was filled.');
  assert.equal(doneOf(applied({ filled: 1 }))!.batch, null);
  assert.equal(doneSaid(doneOf(applied({ filled: 1, remaining: 2 }))!), 'Filled 1. 2 more wait past this run. Run it again for them.');
});

test('only a rule that sets a field is offered, by the field\'s label', () => {
  assert.equal(fieldOf({ register: 'ledger', then: [{ tag: 'tea' }, { set: { field: 'category', to: 'Tea' } }] }), 'category');
  assert.equal(fieldOf({ register: 'ledger', then: [{ notify: { say: 'Hi' } }] }), null);
  assert.equal(fieldOf(null), null);
  assert.equal(labelOf({ fields: [{ id: 'category', label: 'Spending kind' }] }, 'category'), 'Spending kind');
  assert.equal(labelOf(null, 'due_on'), 'Due on');
});

test('the try panel says the contest by rule name', () => {
  assert.equal(contestOf({ matches: 3 }), null);
  assert.deepEqual(contestLines(contestOf({ won: 0, lost: 0, takenBy: {} })!, names), []);
  assert.deepEqual(contestLines(contestOf({ won: 4, lost: 0, takenBy: {} })!, names), [againWords.alone]);
  assert.deepEqual(contestLines(contestOf({ won: 5, lost: 3, takenBy: { rent: 2, 'tea-shop': 1 } })!, names), [
    'First on 5: no other rule got there before it.',
    'Lost 2 to Rent rule.',
    'Lost 1 to Tea shop by payee.',
  ]);
});
