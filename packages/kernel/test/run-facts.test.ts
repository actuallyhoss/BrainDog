/**
 * What a run says about itself is a fact of the list of runs, and the record's own fields are a list apart.
 *
 * THE LIST OF RUNS OFFERED A PERSON ITS PLUMBING. Its editor drew a box for the folder a run worked in, its commit and
 * its machine, the facts its agent reported, as if they were a person's to change; and they are how the agent's next
 * write finds its run (`findSession`). `RUN_FACTS` names them, and the web app keeps the same list (`field-draft.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KERNEL_WRITTEN, RUN_FACTS, sessionDeclaration } from '../src/session.ts';

const FIELDS = (sessionDeclaration().body.fields as { id: string; type: string; label?: string }[]);
const byId = new Map(FIELDS.map((f) => [f.id, f]));

test('every fact a run reports is a field the list of runs declares', () => {
  const missing = RUN_FACTS.filter((id) => !byId.has(id));
  assert.deepEqual(missing, [], `the list of runs declares no field called ${missing.join(', ')}`);
  assert.equal(new Set(RUN_FACTS).size, RUN_FACTS.length, 'a fact is named twice');
});

test('no fact a run reports is one the record writes alone', () => {
  /* TWO DIFFERENT DOORS: the agent writes these through its token, and a caller's patch naming a kernel field is refused
     whoever sends it. A field on both lists would refuse the agent its own facts. */
  const both = RUN_FACTS.filter((id) => KERNEL_WRITTEN.includes(id));
  assert.deepEqual(both, []);
});

test("a person's own fields on a run stay theirs", () => {
  /* What a run is doing, its next step and the kind of agent it is for are what a person who makes a run by hand
     for an agent to take up writes, so none of them is a fact the run reported. */
  for (const id of ['doing', 'next', 'agent', 'state', 'tried', 'notes'])
    assert.ok(!RUN_FACTS.includes(id), `${id} is a person's, and is listed as the run's own`);
});

test('every unlabelled text field on the list of runs is the record\'s or the run\'s own', () => {
  /* THE GUARD FOR "AND ANY LIKE THEM": the plumbing the list declares with no label a person can read. A new such
     field lands on one of the two lists, or this says where it was forgotten. */
  const loose = FIELDS.filter((f) => f.type === 'text' && f.label === undefined)
    .map((f) => f.id)
    .filter((id) => !RUN_FACTS.includes(id) && !KERNEL_WRITTEN.includes(id));
  assert.deepEqual(loose, []);
});
