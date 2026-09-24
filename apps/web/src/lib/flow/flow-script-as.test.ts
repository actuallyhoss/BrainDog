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

import { ARGS, draftOf, faultsOf, sayStep, type Arg } from './flow.ts';

const scriptAs = (): Arg | undefined => ARGS.script.find((a) => a.path.join('.') === 'script.as');

test('a script step says it keeps the id of its queued run, not an answer', () => {
  const said = sayStep({ script: { id: 'tidy', as: 'job' } });
  assert.equal(said, 'Run the script tidy, keeping the id of its queued run as job');
  assert.doesNotMatch(said, /answer/u);
  assert.equal(sayStep({ script: { id: 'tidy' } }), 'Run the script tidy');
});

test('the inspector names the field and its absence in the same terms, with no answer in either', () => {
  const as = scriptAs();
  assert.ok(as);
  assert.equal(as.label, 'Keep the queued run id as');
  assert.doesNotMatch(as.label, /answer/u);
  assert.ok(as.required);
  assert.doesNotMatch(as.missing, /answer/u);
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

/* THE FIELD STAYS REQUIRED BECAUSE THE RECORD STILL REQUIRES IT. The task that opened this file asked for it to be made
   optional, since the runner writes `vars[as]` only when `as` is a string. Measured on 24 September before touching
   anything: `validateDeclaration` refuses `{ script: { id: 'tidy' } }` with "steps[0].script.as is undefined, and an
   answer's name is lower-case letters, digits and underscores" (`flow-lint.ts`, `named(spec.as, ...)` with no
   `undefined` escape, where `call` has one). An optional box on the canvas would let a person press Send on a step the
   record then refuses on Decide, in a sentence about an answer. This pair holds the canvas to the lint, both ways: when
   the lint lets the step through, this fails, and the field can be made optional in the same change. */
test('a script step with no name is faulted on the canvas exactly while the record refuses it', () => {
  const body = { rule: 'one', on: { manual: true }, steps: [{ script: { id: 'tidy' } }] };
  const refused = validateDeclaration({ id: 'rule.one', kind: 'rule', body } as never);
  assert.equal(refused?.code, 'DECLARATION_INVALID');
  const as = scriptAs();
  assert.ok(as?.required);
  assert.deepEqual(
    faultsOf(draftOf('one', body)).map((f) => f.say),
    [as.missing],
  );
  const named = { ...body, steps: [{ script: { id: 'tidy', as: 'job' } }] };
  assert.equal(validateDeclaration({ id: 'rule.one', kind: 'rule', body: named } as never), null);
  assert.deepEqual(faultsOf(draftOf('one', named)), []);
});
