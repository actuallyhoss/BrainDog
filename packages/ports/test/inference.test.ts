/**
 * The `Inference` port, and the four things it must be impossible to get wrong.
 *
 * WHY THIS PACKAGE HAS A `test/` AT ALL NOW. `ports` was types and nothing else, so there was
 * nothing to run and no directory. The three refusal constructors in `src/inference.ts` are the
 * first runtime values this package has ever shipped, and a refusal that no test has seen is a
 * sentence somebody wrote once and nobody read.
 *
 * THE FOUR: a model that is not there refuses rather than throwing; an answer that is not the JSON
 * the call pinned refuses rather than being parsed hopefully; a call over its ceiling refuses
 * BEFORE the provider is touched; and a usage that nobody could measure says `null` rather than
 * zero. The fourth is the one that costs money quietly, which is why it has two tests.
 *
 * `test/inference.ts` beside this file is the canned adapter, and it is not a `.test.ts` so the
 * runner's glob leaves it alone. The reason it lives here rather than in `src/` is `37 §10` D9:
 * *"no memory fakes for the eight other ports"* and *"the first spec that needs a fake ships it in
 * its own `test/`"*. This is the first spec that needs one. The canned adapter that `slash` will
 * want is a DIFFERENT object with golden job outputs in it (`46 §9`), and it ships under
 * `packages/slash/test/` when that package arrives; this one exists to exercise the port's own
 * refusals and knows nothing about jobs.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refused, type Result } from '../src/index.ts';
import {
  INFERENCE_CODES,
  isInferenceRefusal,
  type CompleteRequest,
  type Completion,
  type Draft,
  type Prose,
} from '../src/inference.ts';
import { cannedInference, type Canned } from './inference.ts';

/** The smallest request that is a request: one system line, one user line, a schema, a ceiling. */
const ask = (over: Partial<CompleteRequest> = {}): CompleteRequest => ({
  model: 'glm-5.3-flash',
  messages: [
    { role: 'system', content: 'Answer only JSON.' },
    { role: 'user', content: 'services#6 renews on the fourth' },
  ],
  maxTokens: 512,
  schema: { type: 'object', properties: { prose: { type: 'string' } }, required: ['prose'] },
  budget: { neurons: 2_000 },
  ...over,
});

const one = (canned: Partial<Canned> = {}): ReturnType<typeof cannedInference> =>
  cannedInference({
    models: { 'glm-5.3-flash': { text: '{"prose":"Due this week is EGP 12,447.19."}', in: 900, out: 60, neurons: 12 } },
    ...canned,
  });

/** The code and the sentence of a not-ok answer, or a failed assertion naming what came back instead. */
const refusalOf = <T>(r: Result<T>) => {
  assert.ok(refused(r), `expected a refusal and got ${JSON.stringify(r)}`);
  return r.refusal;
};

test('a model this deployment does not serve is a refusal and not a throw', async () => {
  const ai = one();
  const answer = await ai.complete(ask({ model: '@cf/meta/llama-3.2-1b-instruct' }));

  /* THE POSTURE IS THE ASSERTION. `@braindog/ports` says a refusal is a VALUE: an exception carries
     neither a code nor a sentence across an RPC boundary without being rebuilt, and this call
     crosses one on every host. An adapter that throws here turns an unbound model into a 500.

     AND THE CODE IS ASSERTED AS A LITERAL RATHER THAN AS THE CONSTANT THE SOURCE USES, here and in
     the two below. Comparing an imported constant to itself asserts that the module loaded. `10 §7`
     builds the agent contract on a code being stable across versions, and the only test of that is
     one that says the word. */
  const refusal = refusalOf(answer);
  assert.equal(refusal.code, 'NOT_IN_THIS_BUILD');
  assert.equal(refusal.at, 'model');
  assert.match(refusal.fix, /@cf\/meta\/llama-3\.2-1b-instruct/);
  /* AND IT NAMES THE REPAIR, which for this code is a deploy rather than an edit (`30 §6`). */
  assert.match(refusal.fix, /deploy/i);
});

test('an answer that is not the JSON the call pinned refuses, and says nothing is retried', async () => {
  const ai = one({
    models: { 'glm-5.3-flash': { text: 'Happy to help! Here is the prose you asked for.', in: 900, out: 40, neurons: 11 } },
  });
  const answer = await ai.complete(ask());

  const refusal = refusalOf(answer);
  assert.equal(refusal.code, 'PROPOSAL_SCHEMA');
  /* THE SENTENCE HAS TO SAY WHY NOBODY IS RETRYING. `46 §5.3` on the digest: a retry bills twice for
     one payload, and a fix line that reads "try again" invites the second bill. */
  assert.match(refusal.fix, /not retried/);
});

/**
 * THE TWO SHAPES A SCHEMA-CONSTRAINED PROVIDER ACTUALLY FAILS IN, and neither was reached.
 *
 * The test above hands back `Happy to help!`, which is prose where JSON was asked for, and that is
 * the one case a provider given `response_format` mostly does NOT produce. Measured by deleting the
 * two branches beneath it in `test/inference.ts` one at a time and re-running: with the `required`
 * loop removed all eight tests passed, and with the top-level-object check removed all eight passed
 * again. Two thirds of the check the suite's header calls *"refuses rather than being parsed
 * hopefully"* was covered by nothing, and either could have been deleted in a tidy-up without a
 * single test noticing.
 *
 * They are one test because they are one claim from the caller's side: what comes back parsed as
 * JSON is still not the document the call pinned, and the caller is told WHICH way it is not.
 */
test('JSON that parses and still does not match the pinned schema refuses, and names what is wrong', async () => {
  /* WELL-FORMED AND WRONG, which is the realistic failure: the model answered a JSON object and
     filled in a key nobody asked for. `46 §5.3` step 4 is that the package checks the parsed value
     by hand for exactly this, because the provider validated its own idea of the schema. */
  const short = one({
    models: { 'glm-5.3-flash': { text: '{"summary":"Due this week is EGP 12,447.19."}', in: 900, out: 55, neurons: 12 } },
  });
  const missingKey = refusalOf(await short.complete(ask()));
  assert.equal(missingKey.code, 'PROPOSAL_SCHEMA');
  assert.equal(missingKey.at, 'schema');
  /* THE SENTENCE NAMES THE KEY. A schema refusal that says only "it does not match" sends its
     reader back to diff two documents by eye, which is the work the adapter already did. */
  assert.match(missingKey.fix, /`prose` is missing/);
  assert.match(missingKey.fix, /not retried/);

  /* AND AN ARRAY IS NOT AN OBJECT, which `JSON.parse` is perfectly happy with. `typeof []` is
     `'object'` and `typeof null` is `'object'` too, so a guard written as the obvious type check
     admits both and every `in` test against them then answers something useless rather than
     refusing. All three are the same refusal here on purpose. */
  for (const text of ['[{"prose":"Due this week."}]', 'null', '"just a string"']) {
    const odd = refusalOf(await one({ models: { 'glm-5.3-flash': { text, in: 10, out: 10, neurons: 1 } } }).complete(ask()));
    assert.equal(odd.code, 'PROPOSAL_SCHEMA', `\`${text}\` should not have been accepted as an object`);
    assert.match(odd.fix, /top level is not an object|not JSON/);
  }
});

test('a call over its ceiling refuses BEFORE the provider is touched', async () => {
  const ai = one();
  const answer = await ai.complete(ask({ budget: { neurons: 4 } }));

  const refusal = refusalOf(answer);
  assert.equal(refusal.code, 'SLASH_BUDGET_SPENT');
  assert.equal(refusal.at, 'budget');
  /* BOTH FIGURES, because a ceiling refusal with one number in it cannot be acted on: the reader
     has to know how far over the call was to decide between raising the ceiling and sending less. */
  assert.match(refusal.fix, /12/);
  assert.match(refusal.fix, /4/);
  /* AND THIS IS THE ASSERTION THE OTHERS DO NOT MAKE. A budget checked after the call is not a
     budget, it is a receipt. The canned adapter records every call it served, and it must have
     served none. */
  assert.deepEqual(ai.served, []);
});

test('a served call reports its neuron count, because the meter is what the credits are read on', async () => {
  const ai = one();
  const answer = await ai.complete(ask());

  assert.ok(answer.ok, `expected a completion and got ${JSON.stringify(answer)}`);
  const value: Completion = answer.value;
  assert.equal(value.model, 'glm-5.3-flash');
  assert.deepEqual(value.usage, { in: 900, out: 60, neurons: 12 });
  assert.deepEqual(ai.served, ['glm-5.3-flash']);
});

test('a provider that cannot price a call answers null neurons, never zero', async () => {
  /* ZERO AND UNKNOWN ARE DIFFERENT ANSWERS AND ONLY ONE OF THEM IS FREE. A tier B call on the
     customer's own key spends none of the owner's neurons and is honestly 0 (`46 §4.1`). A provider
     that did not say what it spent is unknown, and summing unknown as 0 gives a monthly total that
     is confidently wrong and reads as good news. */
  const ai = one({
    models: { 'llama3.2:3b': { text: '{"prose":"Nothing is due."}', in: 700, out: 20, neurons: null } },
  });
  const answer = await ai.complete(ask({ model: 'llama3.2:3b' }));

  assert.ok(answer.ok, `expected a completion and got ${JSON.stringify(answer)}`);
  assert.equal(answer.value.usage.neurons, null);
  assert.notEqual(answer.value.usage.neurons, 0);
});

test('a request carrying a key the port does not define is refused by the adapter', async () => {
  const ai = one();

  /* TWO BANS IN ONE GUARD, and both of them are type bans that a cast walks straight through.
     `tools` is the one the slash spec settles (`46 #9`, `11 §6`): every Slash call is schema-constrained
     structured output, retrieval is `project()`, and the ban is meant to be structural rather than
     a rule somebody remembers at review. A credential is the other (`46 §2` #3): the adapter is
     built by the host with the key already closed over, so a key arriving in a REQUEST is a key
     that has travelled through the package that is not allowed to hold one.

     A cast is exactly how both would arrive in practice, from a host handing through a body it
     parsed, so the adapter checks the keys it was given rather than trusting the compiler. */
  const withTools = { ...ask(), tools: [{ name: 'list' }] } as unknown as CompleteRequest;
  const withKey = { ...ask(), apiKey: 'sk-live-not-a-real-one' } as unknown as CompleteRequest;

  await assert.rejects(() => ai.complete(withTools), /tools/);
  await assert.rejects(() => ai.complete(withKey), /apiKey/);
  assert.deepEqual(ai.served, []);
});

test('a null prose is a success, and only the three codes are this port refusing', async () => {
  const ai = one();
  const answer = await ai.complete(ask());
  assert.ok(answer.ok, `expected a completion and got ${JSON.stringify(answer)}`);

  /* THE JOB SUCCEEDED AND THERE IS NO PROSE. `46 §5.3` drops a digest sentence that cites a figure
     it cannot support and ships the digest as figures only, never retried. A caller that could not
     tell that apart from `PROPOSAL_SCHEMA` would raise an incident over a digest that worked. */
  const prose: Prose = { prose: null, model: answer.value.model, usage: answer.value.usage };
  const draft: Draft = { body: { question: 'A pattern for these three', body_kind: 'pattern', body: {} }, model: prose.model, usage: prose.usage };
  assert.equal(prose.prose, null);
  assert.equal(draft.body?.body_kind, 'pattern');

  const missing = refusalOf(await ai.complete(ask({ model: 'nothing-serves-this' })));
  assert.ok(isInferenceRefusal(missing));
  /* THE LIST IS THREE AND THE COUNT IS ASSERTED, because a fourth added without a test is a fourth
     status a host maps by accident. */
  assert.deepEqual([...INFERENCE_CODES], ['NOT_IN_THIS_BUILD', 'PROPOSAL_SCHEMA', 'SLASH_BUDGET_SPENT']);
  /* AND A REFUSAL FROM SOMEWHERE ELSE IS NOT THIS PORT'S, which is what the predicate is for: a
     host mapping a code onto a status must not send every 422 through the model's own branch. */
  assert.equal(isInferenceRefusal({ code: 'REGISTER_UNKNOWN', fix: 'There is no register called that.' }), false);
});

test('embed reports one usage for the whole batch and vectors of one width', async () => {
  const ai = one({ embed: { model: '@cf/baai/bge-m3', dims: 4, in: 120, neurons: 2 } });
  const answer = await ai.embed(['one', 'two', 'three']);

  assert.ok(answer.ok, `expected vectors and got ${JSON.stringify(answer)}`);
  assert.equal(answer.value.dims, 4);
  assert.equal(answer.value.vectors.length, 3);
  for (const v of answer.value.vectors) assert.equal(v.length, 4);
  assert.deepEqual(answer.value.usage, { in: 120, out: 0, neurons: 2 });
});
