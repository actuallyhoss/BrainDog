/**
 * The filing of an attach (`src/about.ts` `attachFiled`): what the text names lands as it does today, and
 * what rests on the model's word alone is asked first, as its own kind, so Slash can earn it. A row
 * with an amount always asks. NO MODEL IS CALLED: every answer is planted by a fake adapter, and every name
 * is invented (`fixtures/names.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ATTACH_VERB, askAbout, attachFiled, attachKindOf, type AboutJob, type AboutShown } from '../src/about.ts';
import { ATTACH, kindOfAttach } from '../../kernel/src/change-kind.ts';

import { COMPANIES, PEOPLE } from '../../../fixtures/names.ts';

const TEO = PEOPLE[2]!.name;
const INES = PEOPLE[5]!.name;
const TEO_FIRST = TEO.split(' ')[0]!;
const PELLUCID = COMPANIES[2];

const FIRST = `${TEO_FIRST} sent the drawings for ${PELLUCID}.`;
const WHOLE = `${INES} will send the draft on Friday.`;

const job = (trusted = true): AboutJob => ({
  items: [{ n: 1, kind: 'note', where: 'a note on the renewal', text: `${FIRST} ${WHOLE}`, trusted }],
  candidates: [
    { h: 'h1', kind: 'person', name: TEO, also: [], seen: [], how: 'name' },
    { h: 'h2', kind: 'person', name: INES, also: [], seen: [], how: 'name' },
  ],
});

const ANSWER = {
  about: [
    { n: 1, kind: 'person', name: TEO_FIRST, is: 'h1', sentence: FIRST, role: 'designer', with: [] },
    { n: 1, kind: 'person', name: INES, is: 'h2', sentence: WHOLE, role: null, with: [] },
  ],
};

/** A fake adapter: answers what it is given and keeps what it was shown. */
const fake = (answer: unknown) => {
  const shown: AboutShown[] = [];
  return { shown, about: async (input: AboutShown) => (shown.push(input), answer) };
};

const people = () => ({ list: 'contacts', amount: false });

test("the host's attach kind is the kernel's", () => {
  assert.equal(ATTACH_VERB, ATTACH);
  for (const amount of [false, true]) assert.deepEqual(attachKindOf('contacts', amount), kindOfAttach('contacts', amount));
});

test('a first name alone asks, and the whole name lands', async () => {
  const asked = await askAbout(fake(ANSWER).about, job());
  assert.equal(asked.by, 'model');
  const { lands, asks } = attachFiled(asked.kept, job(), people);
  assert.deepEqual(lands.map((a) => [a.h, a.name, a.named]), [['h2', INES, true]]);
  assert.equal(asks.length, 1);
  const ask = asks[0]!;
  assert.equal(ask.h, 'h1');
  assert.equal(ask.row, TEO);
  assert.equal(ask.question, `Is the ${TEO_FIRST} in this note ${TEO}?`);
  assert.equal(ask.sentence, FIRST);
  assert.deepEqual(ask.change, { key: 'contacts:attach', list: 'contacts', verb: 'attach', floor: null });
  assert.ok(!/[—–]/u.test(ask.question), 'no dash as punctuation');
  assert.ok(!/\bh1\b/u.test(ask.question), 'the question names the row, never its handle');
});

test('a row with an amount asks, even when the text names it whole', async () => {
  const asked = await askAbout(fake(ANSWER).about, job());
  const { lands, asks } = attachFiled(asked.kept, job(), () => ({ list: 'payees', amount: true }));
  assert.deepEqual(lands, []);
  assert.deepEqual(asks.map((a) => [a.h, a.change?.floor]), [['h1', 'money'], ['h2', 'money']]);
  assert.equal(asks[1]!.question, `Is this note about ${INES}?`);
});

test('an untrusted text attaches nothing, so nothing lands and nothing is asked', async () => {
  const asked = await askAbout(fake(ANSWER).about, job(false));
  assert.deepEqual(asked.kept.attach, []);
  assert.deepEqual(attachFiled(asked.kept, job(false), people), { lands: [], asks: [] });
});

test('an attach with no place still asks, with no kind to file it by', async () => {
  const asked = await askAbout(fake(ANSWER).about, job());
  const { lands, asks } = attachFiled(asked.kept, job());
  assert.deepEqual(lands.map((a) => a.h), ['h2']);
  assert.deepEqual(asks.map((a) => [a.h, a.change]), [['h1', null]]);
});

test('a row the kernel found by a key the text holds lands, as the rules attach it', () => {
  const keyed: AboutJob = { ...job(), candidates: [{ h: 'h1', kind: 'person', name: TEO, also: [], seen: [], how: 'key' }] };
  const kept = { attach: [{ n: 1, h: 'h1', kind: 'person' as const, name: TEO, sentence: FIRST, role: null, named: false }], mentions: [], links: [], triage: [], fields: [] };
  assert.deepEqual(attachFiled(kept, keyed, people).lands.map((a) => a.h), ['h1']);
});
