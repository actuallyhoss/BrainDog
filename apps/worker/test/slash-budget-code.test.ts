/**
 * The operator's ceiling saying no carries its code on the throw (slash-purpose-93#5), so Slash's walk over a route stops
 * there (`packages/slash/src/call.ts` `budgetIn`): every candidate after it would hear the same no. A model that did not
 * answer for any other reason carries no code, and the walk asks the next one. The binding is a local function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { includedInference, type SlashEnv } from '../src/slash.ts';

const call = { model: 'llama-3.2-1b', messages: [{ role: 'user' as const, content: 'Is this an invoice?' }], maxTokens: 64, jsonSchema: { type: 'object' } };

const env = (run: () => Promise<unknown>): SlashEnv => ({ AI: { run }, SLASH_INCLUDED: 'yes' }) as unknown as SlashEnv;

const thrown = async (p: Promise<unknown>): Promise<Record<string, unknown>> => {
  try {
    await p;
  } catch (e) {
    return e as Record<string, unknown>;
  }
  assert.fail('the call was supposed to throw');
};

test('A CEILING OF NOTHING THROWS SENT NOTHING, MARKED SLASH_BUDGET_SPENT, and the binding is never called', async () => {
  let calls = 0;
  const model = includedInference(env(async () => ((calls += 1), { response: '{}' })), () => 0)!;
  const e = await thrown(model.complete(call));
  assert.equal(e.code, 'SLASH_BUDGET_SPENT');
  assert.equal(e.sent, false);
  assert.equal(calls, 0);
});

test('A BINDING THAT REFUSES FOR ANOTHER REASON BEFORE SENDING CARRIES NO CODE, so the walk may ask the next model', async () => {
  const model = includedInference(env(async () => ({ response: '{}' })))!;
  const e = await thrown(model.complete({ ...call, model: 'no-such-model' }));
  assert.equal(e.sent, false);
  assert.equal(e.code, undefined);
});
