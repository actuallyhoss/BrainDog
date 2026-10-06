/**
 * `names.ts`: every actor, list and declaration said as a name, and never as the id the record keeps it under.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { REGISTERS } from './held.ts';
import { actor, humanize, listName, nameWords, titleOf } from './names.ts';

const PERSON = 'p_01M1KJ7RG0TYYA0AX15QPGJJ4';

test('the reader is You, in the sample and on a live record', () => {
  assert.deepEqual(actor('you'), { name: copy.feedYou, kind: 'you' });
  assert.deepEqual(actor(PERSON, PERSON), { name: copy.feedYou, kind: 'you' });
});

test('a person is their name where the caller holds one, and Someone on this record where it does not', () => {
  assert.deepEqual(actor(PERSON, null, new Map([[PERSON, 'de Vries']])), { name: 'de Vries', kind: 'person' });
  assert.deepEqual(actor(PERSON), { name: copy.feedSomeone, kind: 'person' });
  assert.deepEqual(actor('p_self'), { name: copy.feedSomeone, kind: 'person' });
});

test('AN ADDRESS IS NEVER A NAME: any who with an @ is Someone, unless the caller holds a name for it', () => {
  for (const who of ['jo@kiln.example', 'Jo Bell <jo@kiln.example>', '@jo', 'agent:bot@kiln.example']) {
    assert.deepEqual(actor(who), { name: copy.feedSomeone, kind: 'person' }, who);
  }
  assert.deepEqual(actor('jo@kiln.example', null, new Map([['jo@kiln.example', 'Jo Bell']])), { name: 'Jo Bell', kind: 'person' });
});

test('Slash, the record and the sample are said by the product\'s names', () => {
  assert.deepEqual(actor('slash'), { name: nameWords.slash, kind: 'slash' });
  assert.deepEqual(actor('system'), { name: nameWords.brainDog, kind: 'system' });
  assert.deepEqual(actor('p_seed'), { name: nameWords.brainDog, kind: 'sample' });
});

test('a rule is its name, in both spellings, and a first-party rule by the name the product gives it', () => {
  assert.deepEqual(actor('rule.invoice-late'), { name: 'Chase late payments', kind: 'rule' });
  assert.deepEqual(actor('rule:late-reply'), { name: 'Late reply', kind: 'rule' });
  assert.deepEqual(actor('ingest:hsbc-sms'), { name: 'Hsbc sms', kind: 'automation' });
  assert.deepEqual(actor('runner:01M1KJ7RG0TYYA0AX15QPGJJ4Z'), { name: nameWords.automation, kind: 'automation' });
});

test('an agent is its proper name, and a run whose agent is not held is An agent', () => {
  assert.deepEqual(actor('agent:claude'), { name: 'Claude', kind: 'agent' });
  assert.deepEqual(actor('codex'), { name: 'Codex', kind: 'agent' });
  assert.deepEqual(actor('agent:gemini'), { name: 'Gemini', kind: 'agent' });
  assert.deepEqual(actor('S42'), { name: nameWords.agent, kind: 'agent' });
});

test('no actor is ever said with an underscore, a colon or a ULID in it', () => {
  const signed = ['p_seed', 'p_self', PERSON, 'rule:cash-stale', 'rule.renewal', 'agent:claude', 'runner:rnr_9k2', 'ingest:npm-downloads', 'system', 'slash', 'S7', 'weird_actor', 'x:y', '01M1KJ7RG0TYYA0AX15QPGJJ4Z'];
  for (const by of signed) {
    const { name } = actor(by);
    assert.doesNotMatch(name, /[_:]|[0-9A-HJKMNP-TV-Z]{26}/u, `${by} was said as ${name}`);
    assert.notEqual(name, '', `${by} was said as nothing`);
  }
});

test('a name the caller already holds is kept as it was written', () => {
  assert.deepEqual(actor('iPad kiosk'), { name: 'iPad kiosk', kind: 'person' });
});

test('an id in words is its last part, spaced and raised at the first letter', () => {
  assert.equal(humanize('cash-stale'), 'Cash stale');
  assert.equal(humanize('money_core'), 'Money core');
  assert.equal(humanize('rule:late-reply'), 'Late reply');
  assert.equal(humanize('hsbcSMS'), 'Hsbc SMS');
  assert.equal(humanize(''), '');
});

test('a declaration is its title, else its name, else a first-party rule\'s name, else its id in words', () => {
  assert.equal(titleOf({ id: 'rent', title: 'Rent due' }), 'Rent due');
  assert.equal(titleOf({ id: 'rent', title: '  ', name: 'Rent' }), 'Rent');
  assert.equal(titleOf({ id: 'invoice-late', kind: 'rule' }), 'Chase late payments');
  assert.equal(titleOf({ id: 'cash-stale-weekly', kind: 'rule' }), 'Cash stale weekly');
  assert.equal(titleOf({ id: 'invoice-late' }), 'Invoice late', 'a declaration that is not a rule borrowed a rule\'s name');
});

test('a list is the name its declaration gives it, else its id in words, and never a prototype member', () => {
  REGISTERS.suppliers_x = { id: 'suppliers_x', name: 'Suppliers', one: 'Supplier', title: 'name', mobile: ['name', 'name', 'name'], fields: [] };
  try {
    assert.equal(listName('suppliers_x'), 'Suppliers');
  } finally {
    delete REGISTERS.suppliers_x;
  }
  assert.equal(listName('late_payers'), 'Late payers');
  assert.equal(listName('constructor'), 'Constructor');
});
