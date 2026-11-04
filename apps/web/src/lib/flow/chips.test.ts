/**
 * The inspector's chips, grouped by where the value comes from, and the pickers that replace typed identifiers.
 *
 * WHAT IS CHECKED IS WHAT WOULD BE SILENTLY WRONG. A field of the row and an answer kept by an earlier step can share a
 * name (`amount` on the invoice and `amount` from a call), and a grouping that went by the word rather than by the path
 * would draw one chip for both and insert whichever came first: a message that says the invoice's amount when the
 * person picked the call's, with nothing on the card to tell them apart. An arrival's keys filed under "From the row"
 * would promise a row a clock or a door with no named list does not hand over.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHANNELS, DAYS, triggerChips, varsBefore, type Node } from './flow.ts';
import { CHANNEL_WORDS, DAY_WORDS, GROUP_WORDS, chipWord, doorsPickable, groupChips, idWords, pickerOf, withCurrent } from './chips.ts';

test('a field of the row and an earlier answer with the same name are two chips, each under its own heading', () => {
  const groups = groupChips(['trigger.row.amount', 'trigger.row.due', 'vars.amount']);
  assert.deepEqual(
    groups.map((g) => [g.label, g.chips.map((c) => c.path)]),
    [
      [GROUP_WORDS.row, ['trigger.row.amount', 'trigger.row.due']],
      [GROUP_WORDS.earlier, ['vars.amount']],
    ],
  );
  assert.deepEqual(
    groups.flatMap((g) => g.chips.map((c) => c.word)),
    ['amount', 'due', 'amount'],
  );
});

test('an arrival hands over what arrived, and it is not filed as a row', () => {
  const t = { arrival: { ingest: 'shortcut' } };
  const groups = groupChips(triggerChips(t));
  assert.deepEqual(
    groups.map((g) => g.label),
    [GROUP_WORDS.arrival],
  );
  assert.ok(groups[0]!.chips.every((c) => c.path.startsWith('trigger.arrival.')));
});

test('a heading with nothing under it is not drawn, and the order is the row, then what arrived, then earlier steps', () => {
  assert.deepEqual(groupChips([]), []);
  assert.deepEqual(
    groupChips(['vars.rate']).map((g) => g.label),
    [GROUP_WORDS.earlier],
  );
  /* HANDED IN BACKWARDS, and still drawn in the order a run gets them: the trigger's first, then each step's. */
  assert.deepEqual(
    groupChips(['vars.rate', 'trigger.arrival.body', 'trigger.row.what']).map((g) => g.label),
    [GROUP_WORDS.row, GROUP_WORDS.arrival, GROUP_WORDS.earlier],
  );
});

test('the same path handed in twice is one chip', () => {
  const groups = groupChips(['vars.rate', 'vars.rate']);
  assert.equal(groups[0]!.chips.length, 1);
});

test('the chips a real draft offers are grouped the same way the inspector draws them', () => {
  const steps: Node[] = [
    { key: 'a', step: { call: { ingest: 'price', as: 'rate' } } },
    { key: 'b', step: { notify: { say: '' } } },
  ];
  const paths = [...triggerChips({ written: { register: 'obligations' } }, ['what', 'due']), ...varsBefore(steps, 'b')];
  assert.deepEqual(
    groupChips(paths).map((g) => [g.label, g.chips.map((c) => c.word)]),
    [
      [GROUP_WORDS.row, ['what', 'due']],
      [GROUP_WORDS.earlier, ['rate']],
    ],
  );
});

test('a chip is named by its last part, never by its path', () => {
  assert.equal(chipWord('trigger.row.amount_due'), 'amount due', 'the last part, as words (05b872c45)');
  assert.equal(chipWord('vars.rate'), 'rate');
});

test('a declared call with no name of its own is said as words', () => {
  assert.equal(idWords('invoice-sent'), 'Invoice sent');
  assert.equal(idWords('gold_rate'), 'Gold rate');
  assert.equal(idWords('--'), '--');
});

/* ── pickers ─────────────────────────────────────────────────────────────── */

test('the arguments that name a list, a declared call or a field of the row get a picker, and nothing else does', () => {
  assert.equal(pickerOf('link', ['link', 'to', 'register']), 'list');
  assert.equal(pickerOf('create', ['create', 'register']), 'list');
  assert.equal(pickerOf('call', ['call', 'ingest']), 'call');
  assert.equal(pickerOf('run', ['run']), 'call');
  assert.equal(pickerOf('set', ['set', 'field']), 'field');
  assert.equal(pickerOf('link', ['link', 'field']), 'field');
  /* A NEW ANSWER'S NAME IS WRITTEN, NOT PICKED: nothing exists yet to pick it from. */
  assert.equal(pickerOf('call', ['call', 'as']), null);
  assert.equal(pickerOf('notify', ['notify', 'say']), null);
  assert.equal(pickerOf('set', ['set', 'to']), null);
});

test('a value already written that the record does not list is kept as a choice, so opening the sheet never rewrites it', () => {
  const lists = [
    { id: 'obligations', name: 'Money' },
    { id: 'tasks', name: 'Tasks' },
  ];
  assert.deepEqual(
    withCurrent(lists, 'tasks').map((o) => o.id),
    ['obligations', 'tasks'],
  );
  assert.deepEqual(
    withCurrent(lists, 'retired_list'),
    [{ id: 'retired_list', name: 'retired_list' }, ...lists],
  );
  assert.deepEqual(withCurrent(lists, ''), lists);
});

test('every channel and every day the trigger offers has a word, and no word is the stored value', () => {
  /* READ FROM `flow.ts`'s OWN LISTS, so a channel added there without a word here fails rather than printing `pull`. */
  for (const value of CHANNELS) {
    const word = CHANNEL_WORDS[value];
    assert.ok(word, `no word for the channel ${value}`);
    assert.notEqual(word, value);
    assert.match(word, /^[A-Z]/u);
  }
  for (const value of DAYS) {
    const word = DAY_WORDS[value];
    assert.ok(word, `no word for the day ${value}`);
    assert.match(word, /^[A-Z][a-z]+day$/u);
  }
});

test('the doors are a picker only for an arrival by webhook, because the doors read lists webhooks and nothing else', () => {
  /* AN EMAIL, A PASTE OR A SCHEDULED FETCH IS AN INGEST AN ARRIVAL MAY NAME and the doors read never lists, so a picker
     there would hold no way to choose it. The box stays for every channel but the one the list is complete for. */
  assert.equal(doorsPickable('webhook'), true);
  for (const c of CHANNELS.filter((c) => c !== 'webhook')) assert.equal(doorsPickable(c), false, `the doors offered for ${c}`);
  assert.equal(doorsPickable(undefined), false);
});
