/**
 * What a script step's `as:` keeps, as the canvas says it: the id of the run it queued, never the script's answer.
 *
 * THE CARD SAID "KEEPING THE ANSWER AS". The runner's `startScript` (`packages/kernel/src/flow.ts`) puts a `script.run`
 * job in the outbox and goes on; what lands in `vars[as]` is that job's id, and nothing the script returns ever comes
 * back into the run. The record's dry run and the MCP grammar were corrected first, and Decide had to add a sentence
 * after the canvas's own to take its words back. These pin the canvas's words, so that sentence can go.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration } from '@braindog/kernel';

import { ARGS, blankStep, draftOf, faultsOf, sayStep, type Arg } from './flow.ts';

const scriptAs = (): Arg | undefined => ARGS.script.find((a) => a.path.join('.') === 'script.as');

test('a script step says it keeps the id of its queued run, not an answer', () => {
  const said = sayStep({ script: { id: 'tidy', as: 'job' } });
  assert.equal(said, 'Run the script tidy, keeping the id of its queued run as job');
  assert.doesNotMatch(said, /answer/u);
  assert.equal(sayStep({ script: { id: 'tidy' } }), 'Run the script tidy');
});

test('the inspector names the field as the id of the queued run, with no answer in it', () => {
  const as = scriptAs();
  assert.ok(as);
  assert.equal(as.label, 'Keep the queued run id as');
  assert.doesNotMatch(as.label, /answer/u);
});

/* THE OTHER SENTENCE THE SAME FIELD CAN SAY. The label and the missing-value line were corrected and the bad-name line
   was not: `as: 'Job'` still read "Job is not a name an answer can have", found by the check that followed this change.
   Measured red on that sentence before the fault said the id instead. */
test('a bad name on a script step is refused as the id of its queued run, not as an answer', () => {
  const body = { rule: 'one', on: { manual: true }, steps: [{ script: { id: 'tidy', as: 'Job' } }] };
  const said = faultsOf(draftOf('one', body)).map((f) => f.say);
  assert.equal(said.length, 1);
  assert.match(said[0]!, /^Job is not a name the id of a queued run can have\./u);
  const asked = { ...body, steps: [{ ask_person: { question: 'Which?', as: 'Job' } }] };
  assert.ok(faultsOf(draftOf('one', asked)).some((f) => /^Job is not a name an answer can have\./u.test(f.say)));
});

/* THE CANVAS AND THE LINT BOTH TAKE A SCRIPT STEP WITH NO NAME, and a new step starts without one. Until 24 September
   the lint refused `{ script: { id: 'tidy' } }` ("steps[0].script.as is undefined, and an answer's name is ...") though
   the runner writes `vars[as]` only when `as` is a string, so this test used to pin the canvas to that refusal. The lint
   now escapes `undefined` as `call` does (`packages/kernel/test/flow-lint-script-as.test.ts` runs such a step), and
   this held red on the canvas's own `required` and on `blankStep` seeding `as: ''` until both were dropped. A seeded ''
   matters on its own: the inspector drops an emptied optional box, but a step never opened keeps what it was born with,
   and the lint refuses ''. */
test('a script step with no name is accepted by the record and by the canvas, and a new one starts without one', () => {
  const body = { rule: 'one', on: { manual: true }, steps: [{ script: { id: 'tidy' } }] };
  assert.equal(validateDeclaration({ id: 'rule.one', kind: 'rule', body } as never), null);
  assert.equal(scriptAs()?.required, undefined);
  assert.deepEqual(faultsOf(draftOf('one', body)), []);
  const named = { ...body, steps: [{ script: { id: 'tidy', as: 'job' } }] };
  assert.equal(validateDeclaration({ id: 'rule.one', kind: 'rule', body: named } as never), null);
  assert.deepEqual(faultsOf(draftOf('one', named)), []);

  const fresh = blankStep('script');
  assert.deepEqual(fresh, { script: { id: '' } });
  const filled = { ...body, steps: [{ script: { ...(fresh.script as object), id: 'tidy' } }] };
  assert.equal(validateDeclaration({ id: 'rule.one', kind: 'rule', body: filled } as never), null, 'a new step with its script chosen installs');
});
