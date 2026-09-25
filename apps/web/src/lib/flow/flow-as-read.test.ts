/**
 * The canvas says, before Send, what the record now refuses at install: a step reading `{{vars.x}}` where no step before
 * it certainly kept `x` (`packages/kernel/test/flow-lint-as-read.test.ts` has the record's side).
 *
 * MEASURED RED ON 24 SEPTEMBER AT `896dd8b`. Audit sixty-six, finding 7: deleting a script step's `as:` on the canvas took
 * the chip away from `varsBefore` (`keeps`), but not the chip already put into the step after it, and `faultsOf` had no
 * line for a `{{vars.x}}` that `varsBefore` would not offer. B1's body drew with no fault, and the first test below
 * failed on that empty list before `faultsOf` asked `unkept`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration } from '@braindog/kernel';

import { draftOf, faultsOf } from './flow.ts';

const b1 = {
  rule: 't',
  on: { written: { register: 'items', op: ['update'], fields: ['state'] } },
  steps: [{ if: 'state is done', then: [{ script: { id: 'tidy' } }, { set: { field: 'note', to: 'queued as {{vars.job}}' } }] }],
};

const manual = (steps: unknown[]) => ({ rule: 'm', on: { manual: true }, steps });
const reads = (name: string) => ({ notify: { say: `about {{vars.${name}}}` } });
const keep = (name: string) => ({ set_var: { name, to: 'v' } });

test('B1 IS SAID ON THE CARD THAT READS THE NAME, with the name and what the run would write', () => {
  const d = draftOf('t', b1);
  const reader = d.steps[0]!.then![1]!;
  const faults = faultsOf(d);
  assert.deepEqual(faults, [
    {
      key: reader.key,
      say: '"Set note to queued as job" reads job, and no step keeps a value called job, so the run would write a dash in its place. Name it job on the step that makes it, or take job out.',
    },
  ]);
  /* THE NAME PUT BACK, and the card has nothing to fix. */
  const named = structuredClone(b1);
  (named.steps[0]!.then[0] as { script: { as?: string } }).script.as = 'job';
  assert.deepEqual(faultsOf(draftOf('t', named)), []);
});

test('A NAME KEPT LATER, OR IN ONE ARM, IS SAID AS IN THE WRONG PLACE, for every kind that keeps one', () => {
  const said = (body: unknown) => faultsOf(draftOf('m', body as never)).map((f) => f.say);
  assert.match(said(manual([reads('x'), keep('x')]))[0] ?? '', /reads x, and x is kept only by a step that may not run before it: a later step, or one arm of an If\./u);
  assert.match(said(manual([{ if: 'what is Rent', then: [keep('x')] }, reads('x')]))[0] ?? '', /reads x, and x is kept only by a step that may not run/u);
  /* THE `else` ARM KEEPS A NAME SOMEWHERE TOO. With `every` blind to it the checker measured "no step keeps a value called x". */
  assert.match(said(manual([{ if: 'what is Rent', then: [{ stop: true }], else: [keep('x')] }, reads('x')]))[0] ?? '', /reads x, and x is kept only by a step that may not run/u);
  assert.match(said(manual([{ call: { ingest: 'gold_rate' } }, reads('rate')]))[0] ?? '', /reads rate, and no step keeps a value called rate/u);
  assert.deepEqual(said(manual([{ call: { ingest: 'gold_rate', as: 'rate' } }, reads('rate')])), []);
  assert.deepEqual(said(manual([{ ask_person: { question: 'Which?', options: ['a', 'b'], as: 'pick' } }, reads('pick')])), []);
  assert.deepEqual(said(manual([{ if: 'what is Rent', then: [keep('x')], else: [keep('x')] }, reads('x')])), []);
});

/* THE CANVAS AND THE RECORD ANSWER EVERY BODY HERE ALIKE: a fault of this kind on the card exactly where the lint refuses
   one, so that nobody presses Send on a clean card and hears about it on Decide, and nobody is stopped on one the record
   would take. */
test('the canvas says it exactly where the record refuses it', () => {
  const bodies: [string, Record<string, unknown>][] = [
    ['b1', b1],
    ['nothing keeps it', manual([reads('nope')])],
    ['a later step', manual([reads('x'), keep('x')])],
    ['its own name', manual([{ set_var: { name: 'p', to: 'again {{vars.p}}' } }])],
    ['one arm', manual([{ if: 'what is Rent', then: [keep('x')] }, reads('x')])],
    ['the other arm', manual([{ if: 'what is Rent', then: [keep('x')], else: [reads('x')] }])],
    ['in a condition', manual([{ if: 'what is {{vars.w}}', then: [{ stop: true }] }])],
    ['both arms', manual([{ if: 'what is Rent', then: [keep('x')], else: [keep('x')] }, reads('x')])],
    ['kept first', manual([keep('x'), { if: 'what is Rent', then: [reads('x')] }, reads('x')])],
    ['a deeper path', manual([{ ask_slash: { question: 'Rate?', as: 'r' } }, { notify: { say: '{{ vars.r.value }}' } }])],
    ['the script named', manual([{ script: { id: 'tidy', as: 'job' } }, reads('job')])],
    /* THE INLINE PASS HAS NO RUN, and the record does not ask this of it: the braces stay as typed (`rules.ts`'s
       `filling`). Without the run-path gate in `faultsOf` the canvas stopped this body and the record took it. */
    ['inline', { rule: 'i', register: 'items', when: 'state is done', then: [{ notify: { say: 'x {{vars.q}}' } }] }],
  ];
  for (const [what, body] of bodies) {
    const record = /reads \{\{\s*vars\./u.test(validateDeclaration({ id: `rule.${String(body.rule)}`, kind: 'rule', body } as never)?.fix ?? '');
    const canvas = faultsOf(draftOf(String(body.rule), body)).some((f) => /\breads \S+, and /u.test(f.say));
    assert.equal(canvas, record, `${what}: the record ${record ? 'refuses' : 'takes'} it and the canvas ${canvas ? 'says' : 'does not say'} so`);
  }
});
