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

import { ARGS, blankStep, draftOf, faultsOf, learnScripts, sayStep, type Arg } from './flow.ts';

const scriptAs = (): Arg | undefined => ARGS.script.find((a) => a.path.join('.') === 'script.as');

test('a script step says it keeps the id of its queued run, not an answer', () => {
  const said = sayStep({ script: { id: 'tidy', as: 'job' } });
  assert.equal(said, 'Run the script Tidy, keeping the id of its queued run as job');
  assert.doesNotMatch(said, /answer/u);
  assert.equal(sayStep({ script: { id: 'tidy' } }), 'Run the script Tidy');
});

/* THE SCREENS PRINTED "Run the script close_follow_ups", a key where a name goes (the printed gate, batch 50). */
test('a script step names the script by the title it declares, and by its id in words before the record says it', () => {
  assert.equal(sayStep({ script: { id: 'close_follow_ups' } }), 'Run the script Close follow ups');
  learnScripts([{ script: 'close_follow_ups', title: 'Close the follow-ups' }]);
  assert.equal(sayStep({ script: { id: 'close_follow_ups', as: 'closing' } }), 'Run the script Close the follow-ups, keeping the id of its queued run as closing');
});

test('the inspector names the field as the id of the queued run, with no answer in it', () => {
  const as = scriptAs();
  assert.ok(as);
  assert.equal(as.label, 'Call its run');
  assert.doesNotMatch(as.label, /answer/u);
});

/* THE CANVAS AND THE LINT BOTH TAKE A SCRIPT STEP WITH NO NAME, and a new step starts without one. The lint once
   refused `{ script: { id: 'tidy' } }` ("steps[0].script.as is undefined, and an answer's name is ...") though
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
