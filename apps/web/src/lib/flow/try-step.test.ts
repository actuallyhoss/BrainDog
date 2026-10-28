/**
 * Testing one step alone: the ask a card's "Test this step" sends, the tokens an earlier test's
 * answers give a later step, and the one-step try's answer read through `source.ts`. Invented names inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { live, tryRunOf, type TriedStep } from './source.ts';
import { TOKENS_MOST, WITHHELD, outText, placed, testedOf, tokensFrom, tryStep } from './try-step.ts';

/** Five steps, the third reading the call's answer. */
const DRAFT = {
  rule: 'quarry_rates',
  on: { written: { register: 'orders', op: ['create'] } },
  steps: [
    { set_var: { name: 'w', to: 'order {{trigger.row.what}}' } },
    { call: { ingest: 'quarry_hook', as: 'a' } },
    { set: { field: 'memo', to: 'rate {{vars.a.rate}}' } },
    { if: 'what is Slate', then: [{ ask_person: { question: 'Ship it?', options: ['Yes', 'No'], as: 'ok' } }] },
    { notify: { say: 'Done {{vars.w}}' } },
  ],
};

const step = (path: string, state: TriedStep['state'], extra: Partial<TriedStep> = {}): TriedStep => ({ path, verb: 'x', state, answer: null, say: '', ...extra });

test('THE DRAFT IS LAID OUT AS THE RUNNER LAYS IT: a branch, then its arm, each with the name it keeps', () => {
  assert.deepEqual(placed(DRAFT), [
    { at: 'steps[0]', as: 'w' },
    { at: 'steps[1]', as: 'a' },
    { at: 'steps[2]', as: null },
    { at: 'steps[3]', as: null },
    { at: 'steps[3].then[0]', as: 'ok' },
    { at: 'steps[4]', as: null },
  ]);
});

test('THE ASK: the step, and the answers of the steps before it that an earlier test gave', () => {
  const earlier = [
    step('steps[0]', 'done', { out: 'order Slate', as: 'w' }),
    step('steps[1]', 'done', { out: { rate: 48.5 }, as: 'a' }),
    step('steps[3].then[0]', 'done', { out: 'Yes', as: 'ok' }),
  ];
  assert.deepEqual(tryStep(DRAFT, 'steps[2]', earlier), { step: 'steps[2]', given: { w: 'order Slate', a: { rate: 48.5 } } });
  /* NOTHING BEFORE THE FIRST STEP, so its ask is the step alone. */
  assert.deepEqual(tryStep(DRAFT, 'steps[0]', earlier), { step: 'steps[0]' });
});

test('WHAT WAS WITHHELD, CUT OR NOT TAKEN IS NOT GIVEN BACK, so the record takes that step again', () => {
  const earlier = [
    step('steps[0]', 'done', { out: WITHHELD, as: 'w' }),
    step('steps[1]', 'done', { out: '{"rate":4', as: 'a', cut: true }),
  ];
  assert.deepEqual(tryStep(DRAFT, 'steps[2]', earlier), { step: 'steps[2]' });
  assert.deepEqual(tryStep(DRAFT, 'steps[2]', [step('steps[1]', 'would', { as: 'a' })]), { step: 'steps[2]' });
  assert.deepEqual(tryStep(DRAFT, 'steps[2]', [step('steps[1]', 'done', { out: { pin: WITHHELD, rate: 2 }, as: 'a' })]), { step: 'steps[2]' });
});

test('TOKENS FROM AN OUT: a field each, two levels down, a text answer as itself, and nothing withheld', () => {
  const tokens = tokensFrom([
    step('steps[0]', 'done', { out: 'order Slate', as: 'w' }),
    step('steps[1]', 'done', { out: { rate: 48.5, buyer: { name: 'Corin Vale', pin: WITHHELD } }, as: 'a' }),
    step('steps[2]', 'would', { as: 'z', out: { never: 1 } }),
  ]);
  assert.deepEqual(
    tokens.map((t) => [t.token, t.sample]),
    [
      ['{{vars.w}}', 'order Slate'],
      ['{{vars.a.rate}}', '48.5'],
      ['{{vars.a.buyer.name}}', 'Corin Vale'],
    ],
  );
  assert.equal(tokens[1]!.path, 'vars.a.rate');
});

test(`TOKENS ARE HELD TO ${TOKENS_MOST}, however wide an answer is`, () => {
  const wide = Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`f${i}`, i]));
  assert.equal(tokensFrom({ trigger: 'manual', steps: [step('steps[0]', 'done', { out: wide, as: 'a' })] }).length, TOKENS_MOST);
});

test('A ONE-STEP TRY IS READ WITH ITS OUT, AS, CUT AND SENDS, and the tested step is found by its path', () => {
  const run = tryRunOf({
    trigger: { kind: 'written' },
    steps: [
      { path: 'steps[0]', verb: 'set_var', state: 'done', say: 'vars.w is set.', out: 'order Slate', as: 'w' },
      { path: 'steps[1]', verb: 'call', state: 'would', say: 'Nothing was sent.', sends: { what: 'Slate' } },
    ],
  })!;
  assert.deepEqual(run.steps[0]!.out, 'order Slate');
  assert.deepEqual(run.steps[1]!.sends, { what: 'Slate' });
  assert.equal(testedOf(run), null, 'a whole try named a tested step');
  assert.equal(testedOf({ ...run, step: 'steps[1]' })?.verb, 'call');
  assert.equal(outText({ rate: 2 }), '{\n  "rate": 2\n}');
});

test('THE TRY CALL SENDS step AND given BESIDE THE BODY, and a whole try sends neither', async () => {
  const sent: unknown[] = [];
  const io = (async (_url: string, init?: { body?: unknown }) => {
    sent.push(JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify({ ok: true, value: { trigger: { kind: 'manual' }, steps: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const source = live(io as never);
  const one = await source.attempt(DRAFT, {}, { step: 'steps[2]', given: { a: { rate: 2 } } });
  await source.attempt(DRAFT, {});
  assert.ok(one.ok && one.value.step === 'steps[2]', 'a one-step try did not say which step it tested');
  assert.deepEqual(sent[0], { body: DRAFT, sample: {}, step: 'steps[2]', given: { a: { rate: 2 } } });
  assert.deepEqual(sent[1], { body: DRAFT, sample: {} });
});
