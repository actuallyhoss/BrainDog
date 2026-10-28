/**
 * The first read before there is an account: `readSetup` reads a stranger's sentence once through the
 * model it is handed and holds the answer as `proposeSetup` does, with no record, no owner and no ledger.
 *
 * THE MODEL IS CANNED (`double.ts`) AND NOTHING ELSE IS BUILT: no SQLite is opened and no `core` made, so a read that
 * reached for a store would have nothing to reach. What is under test is the one path both doors share: the same
 * refusals with no model call, the same `setupOf`, and the model's own codes kept for the door to fall back on.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PEOPLE } from '../../../fixtures/names.ts';
import { readSetup, setupOf, type SetupAsk } from '../src/propose.ts';
import { PROMPTS } from '../src/prompts.ts';
import { canned } from './double.ts';

const OFFER: SetupAsk['offer'] = {
  usecases: [
    { id: 'personal', title: 'Personal', summary: 'Your money and bills.' },
    { id: 'business', title: 'Small business', summary: 'Your orders and stock.' },
  ],
  modules: [{ id: 'money-core', name: 'Money', lists: [{ id: 'obligations', name: 'Bills and invoices', fields: ['what', 'amount', 'due'] }] }],
};

const FIRST = PEOPLE[2]!.name.split(' ')[0]!;
const SAID = `I'm ${FIRST}, I fix bikes on weekends and I owe the parts shop $120.`;
const ASK: SetupAsk = { said: SAID, offer: OFFER, today: '2026-11-14' };

const ANSWER = {
  name: FIRST,
  summary: 'Your bike repairs and what you owe.',
  usecase: 'business',
  also: ['student'],
  modules: ['money-core', 'estate'],
  currency: 'USD',
  heard: [{ phrase: 'fix bikes', became: 'Small business' }],
  names: [],
  rows: [],
  draft: null,
  ask: { about: 'kind', question: 'Is fixing bikes your living, or a side thing?', choices: ['My living', 'A side thing'] },
};

const codeOf = (out: Awaited<ReturnType<typeof readSetup>>): string => (!out.ok && 'refusal' in out ? out.refusal.code : '');

test('A STRANGER IS READ WITH NO RECORD, and the reading names a use case it was offered', async () => {
  const model = canned();
  model.say(JSON.stringify(ANSWER));
  const out = await readSetup(ASK, model);
  assert.ok(out.ok);
  assert.equal(out.value.usecase, 'business');
  assert.equal(out.value.name, FIRST);
  assert.equal(out.value.currency, 'USD');
  assert.deepEqual(out.value.ask, { about: 'kind', question: ANSWER.ask.question, choices: ['My living', 'A side thing'] });
  assert.equal(out.value.by, PROMPTS.setup.model, 'an adapter that names no model keeps the template name');

  /* ONE CALL, made as `core.run` makes it: the template's system, the sentence fenced, the template's schema. */
  assert.equal(model.seen.length, 1);
  assert.equal(model.seen[0]?.messages[0]?.content, PROMPTS.setup.system);
  assert.match(model.seen[0]?.messages[1]?.content ?? '', /<untrusted id="said">/u);
  assert.equal(model.seen[0]?.jsonSchema, PROMPTS.setup.schema);
  assert.equal(readSetup.length, 2, 'the reader takes the ask and the model, and nothing to keep a count in');
});

test('AN ID OUTSIDE THE OFFER IS DROPPED AS setupOf DROPS IT: one path for both doors', async () => {
  const model = canned();
  model.say(JSON.stringify({ ...ANSWER, usecase: 'estate' }));
  const out = await readSetup(ASK, model);
  assert.ok(out.ok);
  assert.equal(out.value.usecase, null);
  assert.deepEqual(out.value.also, []);
  assert.deepEqual(out.value.modules, ['money-core']);
  assert.deepEqual(out.value, setupOf({ ...ANSWER, usecase: 'estate' }, ASK, PROMPTS.setup.model));
});

test('A MODEL THAT DID NOT ANSWER IS UNREACHABLE, and one off its schema is PROPOSAL_SCHEMA', async () => {
  const model = canned();
  model.say(new Error('timed out'));
  assert.equal(codeOf(await readSetup(ASK, model)), 'UNREACHABLE');
  model.say('not json');
  assert.equal(codeOf(await readSetup(ASK, model)), 'PROPOSAL_SCHEMA');
  model.say(JSON.stringify({ name: FIRST }));
  assert.equal(codeOf(await readSetup(ASK, model)), 'PROPOSAL_SCHEMA');
  assert.equal(model.seen.length, 3);
});

test('A BLANK SENTENCE AND AN EMPTY OFFER ARE REFUSED, and the model is never called', async () => {
  const model = canned();
  const blank = await readSetup({ ...ASK, said: '   ' }, model);
  assert.equal(!blank.ok && 'refusal' in blank ? blank.refusal.at : '', 'said');
  const empty = await readSetup({ ...ASK, offer: { usecases: [], modules: [] } }, model);
  assert.equal(!empty.ok && 'refusal' in empty ? empty.refusal.at : '', 'offer');
  const junk = await readSetup({ said: SAID, offer: 'nope' } as never, model);
  assert.equal(!junk.ok && 'refusal' in junk ? junk.refusal.at : '', 'offer');
  assert.equal(model.seen.length, 0);
});
