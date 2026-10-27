/**
 * What Slash did without asking, on Activity: a change a question of Slash's made that the ladder answered
 * reads as Slash's, "Slash did this without asking", then who kept or undid it. A person's own change and a suggestion
 * somebody pressed read as they did. Names are invented here, inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cardWords } from '../../lib/decide/card.ts';
import { settlingOf, slashDidWords, type Suggested } from '../../lib/record/history-live.ts';
import { actor } from '../../lib/record/names.ts';
import { settledOf, slashDidOf } from './lines.ts';

const MARA = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
const NAMES = new Map([[MARA, 'Mara']]);
/* THE KERNEL'S `LADDER_RULE`, which signs the decision and the rows of a question Slash's rung let land. */
const LADDER = 'rule:ladder';

const line = (e: { actor: string; kind: string; to?: unknown } & Suggested) => ({ settling: settlingOf({ to: null, ...e }) });

/** The `decide` the ladder wrote, and a row's line the same answer wrote, as the record sends them. */
const decided = (more: Suggested = {}) => line({ actor: LADDER, kind: 'decide', to: { answer: 'accept' }, suggested_by: 'slash', ...more });
const rowLine = (more: Suggested = {}) => line({ actor: LADDER, kind: 'update', suggested_by: 'slash', settled_by: LADDER, ...more });

test('A CHANGE SLASH MADE WITH NO QUESTION SAYS SO, on the decision and on every row it wrote', () => {
  assert.equal(slashDidOf(decided(), null, NAMES), 'Slash did this without asking');
  assert.equal(slashDidOf(rowLine(), null, NAMES), 'Slash did this without asking');
  /* AND ACTIVITY DRAWS IT WHERE IT DRAWS WHO SETTLED, never "Slash suggested · Ladder accepted". */
  assert.equal(settledOf(decided(), null, NAMES), 'Slash did this without asking');
  assert.equal(settledOf(rowLine(), null, NAMES), 'Slash did this without asking');
  /* WHO DREW IT DOES NOT CHANGE THAT NOBODY WAS ASKED. */
  assert.equal(settledOf(decided({ drafted_by: 'rules' }), null, NAMES), 'Slash did this without asking');
});

test('UNDONE BY MARA READS "Slash did · Mara undid", where the line says the ladder had answered it', () => {
  const undone = (kind: string, to: unknown, more: Suggested = {}) =>
    line({ actor: MARA, kind, to, suggested_by: 'slash', answered_by: LADDER, ...more });
  assert.equal(slashDidOf(undone('resolve', 'undone'), null, NAMES), 'Slash did · Mara undid');
  assert.equal(slashDidOf(undone('suggest', 'reopened'), null, NAMES), 'Slash did · Mara undid');
  assert.equal(slashDidOf(undone('update', null, { settled_by: MARA, undone: true }), null, NAMES), 'Slash did · Mara undid');
  assert.equal(settledOf(undone('resolve', 'undone'), null, NAMES), 'Slash did · Mara undid');
  /* THE VERB IS THE CARD'S OWN, and the reader is You as everywhere on this screen. */
  assert.equal(slashDidOf(undone('resolve', 'undone'), MARA, NAMES), slashDidWords.did(actor(MARA, MARA).name, cardWords.undid));
});

test('KEPT BY MARA READS "Slash did · Mara kept", where the line says who kept it', () => {
  assert.equal(slashDidOf(decided({ kept_by: MARA }), null, NAMES), 'Slash did · Mara kept');
  assert.equal(settledOf(rowLine({ kept_by: MARA }), null, NAMES), 'Slash did · Mara kept');
});

test('A PERSON’S OWN CHANGE AND A SUGGESTION SOMEBODY SETTLED READ AS TODAY', () => {
  /* A person's own edit carries no suggestion at all. */
  assert.equal(slashDidOf(line({ actor: MARA, kind: 'update' })), null);
  assert.equal(settledOf(line({ actor: MARA, kind: 'update' })), null);
  assert.equal(slashDidOf({}), null, 'a line the log sent with nothing about a suggestion');
  /* A suggestion of Slash's Mara pressed is hers to have accepted, as the card says. */
  const pressed = line({ actor: MARA, kind: 'decide', to: { answer: 'accept' }, suggested_by: 'slash' });
  assert.equal(slashDidOf(pressed, null, NAMES), null);
  assert.equal(settledOf(pressed, null, NAMES), 'Slash suggested · Mara accepted');
  /* An undo of one somebody pressed, or one the line does not say the ladder answered, is any undo of Slash's. */
  assert.equal(slashDidOf(line({ actor: MARA, kind: 'resolve', to: 'undone', suggested_by: 'slash' }), null, NAMES), null);
  assert.equal(settledOf(line({ actor: MARA, kind: 'resolve', to: 'undone', suggested_by: 'slash', answered_by: MARA }), null, NAMES), 'Slash suggested · Mara undid');
  /* AN AGENT'S CHANGE ITS OWN RUNG LET LAND IS NOT SLASH'S. */
  assert.equal(slashDidOf(line({ actor: LADDER, kind: 'decide', to: { answer: 'accept' }, suggested_by: 'agent:claude' })), null);
  /* THE CLOSE BESIDE THE LADDER'S YES IS NOT SAID TWICE. */
  assert.equal(slashDidOf(line({ actor: LADDER, kind: 'resolve', to: 'addressed', suggested_by: 'slash' })), null);
});

test('THE WORDS NAME NO ID AND HOLD NO EM DASH', () => {
  for (const s of [slashDidOf(decided(), null, NAMES), slashDidOf(decided({ kept_by: MARA }), null, NAMES)]) {
    assert.doesNotMatch(s!, /—|rule|ladder|p_/u);
  }
});
