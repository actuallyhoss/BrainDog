/**
 * `choiceOf`: what a decided question says it chose, for the card's "Decided 2 Oct: <the choice>" (AGT-B09).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { choiceOf } from '../src/decided.ts';
import { decidedHere } from '../src/context-caps.ts';

const OPTIONS = { options: [{ id: 'renew', label: 'Renew it ' }, { id: 'lapse', label: 'Let it lapse' }] };

test('AN OPTIONS QUESTION SAYS THE OPTION CHOSEN, as the person read it', () => {
  assert.equal(choiceOf('Let lanternfish.example lapse?', { resolved_as: 'addressed', body: OPTIONS, decided: { answer: 'renew' } }), 'Renew it');
  assert.equal(choiceOf('Let lanternfish.example lapse?', { resolved_as: 'addressed', body: OPTIONS, decided: { answer: 'lapse' } }), 'Let it lapse');
});

test('AN OPTION NO LONGER AMONG THE OPTIONS SAYS NOTHING, never its id', () => {
  assert.equal(choiceOf('Let it lapse?', { resolved_as: 'addressed', body: OPTIONS, decided: { answer: 'sell' } }), null);
  assert.equal(choiceOf('Let it lapse?', { resolved_as: 'addressed', body: { options: [{ id: 'renew', label: '  ' }] }, decided: { answer: 'renew' } }), null);
});

test('AN ACCEPT SAYS YES TO THE QUESTION, in its own words without the question mark', () => {
  const rows = { register: 'tasks', rows: [{ title: 'Proof the Copperleaf specimen' }, { title: 'Send it to Oxbow' }] };
  assert.equal(choiceOf('Add the two proofing tasks? ', { resolved_as: 'addressed', body: rows, decided: { answer: 'accept' } }), 'Yes: Add the two proofing tasks');
  /* EVERY ROW TAKEN BY PLACE IS ALL OF THEM. */
  assert.equal(choiceOf('Add the two proofing tasks?', { resolved_as: 'addressed', body: rows, decided: { answer: 'accept', rows: [0, 1] } }), 'Yes: Add the two proofing tasks');
  assert.equal(choiceOf('Install the Copperleaf pack??', { resolved_as: 'addressed', body: {}, decided: { answer: 'accept' } }), 'Yes: Install the Copperleaf pack');
});

test('A REJECT, A WONT-FIX AND AN INCORRECT EACH SAY NO, as the kernel says `said: No`', () => {
  assert.equal(choiceOf('Archive Quietcart?', { resolved_as: 'addressed', body: { rows: [] }, decided: { answer: 'reject' } }), 'No: Archive Quietcart');
  assert.equal(choiceOf('Archive Quietcart?', { resolved_as: 'wont-fix', body: { rows: [] } }), 'No: Archive Quietcart');
  assert.equal(choiceOf('Archive Quietcart?', { resolved_as: 'incorrect', body: OPTIONS }), 'No: Archive Quietcart');
});

test('WHAT WAS ONLY PARTLY TAKEN, OR CLOSED SOME WAY THAT IS NO ANSWER, IS LEFT OUT', () => {
  const rows = { register: 'tasks', rows: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] };
  assert.equal(choiceOf('Add three tasks?', { resolved_as: 'addressed', body: rows, decided: { answer: 'accept', rows: [0, 2] } }), null);
  for (const as of ['withdrawn', 'moot', 'asked-again', null])
    assert.equal(choiceOf('Add three tasks?', { resolved_as: as, body: rows, decided: { answer: 'accept' } }), null, String(as));
  /* ADDRESSED WITH NO DECISION BEHIND IT: the rows already said it, and nobody answered. */
  assert.equal(choiceOf('Add three tasks?', { resolved_as: 'addressed', body: rows, decided: null }), null);
  assert.equal(choiceOf('Add three tasks?', { resolved_as: 'addressed', body: rows, decided: { answer: 'maybe' } }), null);
  /* A QUESTION WITH NO WORDS HAS NOTHING TO SAY YES OR NO TO. */
  assert.equal(choiceOf(' ? ', { resolved_as: 'wont-fix', body: rows }), null);
  assert.equal(choiceOf('', { resolved_as: 'addressed', body: rows, decided: { answer: 'accept' } }), null);
});

test('A CHOICE READS ON THE CARD AS "Decided <day>: <the choice>"', () => {
  const choice = choiceOf('Archive Quietcart?', { resolved_as: 'wont-fix', body: { rows: [] } });
  assert.deepEqual(decidedHere([{ choice: choice!, decided_at: '2026-10-02T09:00:00.000Z', project: 'things#3' }], 'things#3'), ['Decided 2 Oct: No: Archive Quietcart']);
});
