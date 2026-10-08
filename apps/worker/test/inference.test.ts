/**
 * The `Inference` port on the Worker, over a stubbed `env.AI`.
 *
 * NOT ONE NEURON IS SPENT HERE, AND THAT IS A PROPERTY OF THE FILE RATHER THAN A HABIT. Every test
 * below hands `aiInference` a binding whose `run` is a local function, so a test run costs the
 * owner nothing and cannot be made to cost anything by a typo in a model id. The live account has
 * Workers AI enabled and credits on it; spending against it is a decision the owner takes, not a
 * side effect of `node --test`.
 *
 * THE FOUR ANSWERS THAT ARE NOT THE HAPPY ONE ARE THE POINT. A model that answers correctly needs
 * one test; a model that answers plausibly and wrongly needs four, because each of the four has a
 * different repair. A missing model is a deploy that is wrong and will stay wrong. An answer that
 * ignores the schema is a prompt to fix. A truncated answer is a ceiling to raise. A call that
 * would cost more than it may is a job to resize, and it is the only one of the four that must be
 * caught BEFORE the money is gone, so it is asserted by counting calls rather than by reading a
 * refusal.
 *
 * TWO OF THOSE FOUR SHARE A REFUSAL CODE, WHICH IS WHY THE SENTENCES ARE ASSERTED AND NOT JUST THE
 * CODES. `packages/ports/src/inference.ts` closes this port at three codes and puts the vocabulary
 * in the `fix` line, so `PROPOSAL_SCHEMA` covers both a model that answered prose and a model that
 * was cut off mid-object. A test that stopped at the code would pass with the two swapped, and the
 * two send a reader to different repairs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, refused, type Result } from '@braindog/ports';

import { aiInference, RAW_MOST, scrubRaw, type AiEnv, type AiOptions, type CompleteRequest } from '../src/inference.ts';

/** The triage schema of `46 §5`, cut to the two fields the model actually contributes. */
const TRIAGE = {
  type: 'object',
  properties: { kind: { type: 'string' }, actionable: { type: 'boolean' } },
  required: ['kind', 'actionable'],
  additionalProperties: false,
};

type Seen = { model: string; inputs: Record<string, unknown>; options: AiOptions | undefined };

/** A binding that records what it was asked and answers with `reply`. A throw from `reply` is a provider that failed. */
const answering = (reply: (model: string, inputs: Record<string, unknown>) => unknown): { seen: Seen[]; env: AiEnv } => {
  const seen: Seen[] = [];
  const env: AiEnv = {
    AI: {
      run: async (model: string, inputs: Record<string, unknown>, options?: AiOptions): Promise<unknown> => {
        seen.push({ model, inputs, options });
        return reply(model, inputs);
      },
    },
    AI_GATEWAY: 'braindog-alpha',
  };
  return { seen, env };
};

/**
 * The triage ask, so the tests below differ only in the answer.
 *
 * 50 NEURONS IS A CEILING THE CALL FITS UNDER WITH ROOM, and the room is deliberate: the estimate
 * for this ask is 2 neurons, so no test below refuses for the budget by accident while it is
 * asserting something else. The one test that does mean to hit the ceiling names its own.
 */
const ask: CompleteRequest = {
  model: 'llama-3.2-1b',
  messages: [{ role: 'user', content: 'Is this an invoice?' }],
  maxTokens: 64,
  schema: TRIAGE,
  budget: { neurons: 50 },
};

/** The refusal code an answer carried, so a failure reads as the code rather than as a shape. */
const codeOf = (r: Result<unknown>): string => (refused(r) ? r.refusal.code : r.ok ? 'no refusal at all' : 'a conflict');

test('A GOOD ANSWER COMES BACK AS TEXT AND A USAGE, and the call it made is the one the routing table names', async () => {
  const { seen, env } = answering(() => ({
    response: '{"kind":"invoice","actionable":true}',
    usage: { prompt_tokens: 412, completion_tokens: 12, total_tokens: 424 },
  }));

  const got = await aiInference(env).complete(ask);

  assert.ok(got.ok, fixOf(got));
  assert.deepEqual(got.value, {
    text: '{"kind":"invoice","actionable":true}',
    model: '@cf/meta/llama-3.2-1b-instruct',
    usage: { in: 412, out: 12, neurons: null },
  });

  assert.equal(seen.length, 1);
  const call = seen[0];
  assert.ok(call);
  assert.equal(call.model, '@cf/meta/llama-3.2-1b-instruct');
  assert.deepEqual(call.inputs['messages'], [{ role: 'user', content: 'Is this an invoice?' }]);
  assert.equal(call.inputs['max_tokens'], 64);
  assert.deepEqual(call.inputs['response_format'], { type: 'json_schema', json_schema: TRIAGE });
  assert.equal('tools' in call.inputs, false, 'no Slash call passes tools (11 §3, 46 #9)');
});

test('THE NEURON FIGURE IS THE PLATFORM’S OR IT IS NULL, and the platform reports none', async () => {
  const { env } = answering(() => ({ response: '{"kind":"invoice","actionable":true}', usage: { prompt_tokens: 412, completion_tokens: 12 } }));
  const got = await aiInference(env).complete(ask);
  assert.ok(got.ok);
  assert.equal(got.value.usage.neurons, null, 'a figure derived from the rate table would read as a measurement');
});

test('EVERY CALL GOES THROUGH THE GATEWAY WITH THE PAYLOAD LOG OFF, and an unnamed gateway is a direct call', async () => {
  const answer = { response: '{"kind":"invoice","actionable":true}', usage: { prompt_tokens: 1, completion_tokens: 1 } };

  const { seen, env } = answering(() => answer);
  await aiInference(env).complete(ask);
  assert.deepEqual(seen[0]?.options, { gateway: { id: 'braindog-alpha', collectLog: false } });

  const direct = answering(() => answer);
  await aiInference({ ...direct.env, AI_GATEWAY: '' }).complete(ask);
  assert.deepEqual(direct.seen[0]?.options, {});
});

test('AN ANSWER THAT DOES NOT HONOUR THE SCHEMA IS PROPOSAL_SCHEMA, in each of the four ways a model ignores one', async () => {
  const refusedFor = async (response: string): Promise<Result<unknown>> => {
    const { env } = answering(() => ({ response, usage: { prompt_tokens: 412, completion_tokens: 9 } }));
    return aiInference(env).complete(ask);
  };

  const prose = await refusedFor('Sure! Here is the JSON you asked for.');
  assert.equal(codeOf(prose), 'PROPOSAL_SCHEMA');
  assert.match(fixOf(prose), /not JSON at all/u);

  const short = await refusedFor('{"kind":"invoice"}');
  assert.equal(codeOf(short), 'PROPOSAL_SCHEMA');
  assert.match(fixOf(short), /missing actionable/u, 'the sentence names the field that is missing');

  const extra = await refusedFor('{"kind":"invoice","actionable":true,"confidence":0.9}');
  assert.equal(codeOf(extra), 'PROPOSAL_SCHEMA');
  assert.match(fixOf(extra), /confidence/u);

  const list = await refusedFor('["invoice", true]');
  assert.equal(codeOf(list), 'PROPOSAL_SCHEMA');
  assert.match(fixOf(list), /array where the schema asks for object/u);
});

test('EVERY SCHEMA REFUSAL SAYS NOBODY IS RETRYING, because a second call bills twice for one payload', async () => {
  const { env } = answering(() => ({ response: 'not json', usage: { prompt_tokens: 412, completion_tokens: 9 } }));
  assert.match(fixOf(await aiInference(env).complete(ask)), /not retried/u);
});

test('A MODEL THAT IS NOT AVAILABLE IS NOT_IN_THIS_BUILD, and each of the three ways says which one it was', async () => {
  const { seen, env } = answering(() => ({ response: '{}', usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  const unlisted = await aiInference(env).complete({ ...ask, model: 'glm-5.3' });
  assert.equal(codeOf(unlisted), 'NOT_IN_THIS_BUILD');
  assert.match(fixOf(unlisted), /'glm-5\.3': no adapter on this host/u);
  assert.doesNotMatch(fixOf(unlisted), /does not serve it/u, 'Workers AI does serve glm-5.3; it is this host that does not route it');
  assert.equal(seen.length, 0, 'a model this adapter does not carry costs nothing to refuse');

  const gone = answering(() => { throw new Error('No such model @cf/meta/llama-3.2-1b-instruct or task'); });
  assert.match(fixOf(await aiInference(gone.env).complete(ask)), /does not serve it/u, 'only the provider saying so earns that clause');

  const broken = answering(() => { throw new Error('Internal error'); });
  const upstream = await aiInference(broken.env).complete(ask);
  assert.equal(codeOf(upstream), 'NOT_IN_THIS_BUILD');
  assert.match(fixOf(upstream), /did not answer/u, 'a 500 is not the same news as a retired model id');

  const unbound: AiEnv = { AI_GATEWAY: 'braindog-alpha' };
  assert.match(fixOf(await aiInference(unbound).complete(ask)), /no adapter on this host/u);
  assert.match(fixOf(await aiInference(unbound).embed(['one'])), /no adapter on this host/u);
});

test('A TRUNCATED ANSWER IS TOLD APART FROM AN UNREADABLE ONE, because the repair is the ceiling and not the prompt', async () => {
  const { env } = answering(() => ({
    response: '{"kind":"invoi',
    usage: { prompt_tokens: 412, completion_tokens: 64, total_tokens: 476 },
  }));

  const got = await aiInference(env).complete(ask);
  assert.equal(codeOf(got), 'PROPOSAL_SCHEMA');
  assert.match(fixOf(got), /stopped at the 64-token ceiling/u, 'the sentence names the ceiling that was hit');
  assert.doesNotMatch(fixOf(got), /not JSON at all/u, 'the parse failure is true here and is not the repair');
});

test('AN ANSWER ONE TOKEN UNDER THE CEILING IS NOT TRUNCATED, so the boundary is the ceiling and not near it', async () => {
  const { env } = answering(() => ({ response: '{"kind":"invoice","actionable":true}', usage: { prompt_tokens: 412, completion_tokens: 63 } }));
  const got = await aiInference(env).complete(ask);
  assert.ok(got.ok);
  assert.equal(got.value.usage.out, 63);
});

/**
 * THE ESTIMATE IS PINNED TO A NUMBER SO A PRICE EDIT IS VISIBLE. 19 prompt bytes are 5 tokens at
 * `11 §3`'s `ceil(utf8 bytes / 4)`, and 5 × 2,455 + 64 × 18,273 over a million rounds up to 2
 * neurons. If somebody re-reads the catalogue and moves a rate, this assertion is where they find
 * out, rather than in a monthly total nobody reconciles.
 */
test('A CALL THAT WOULD COST MORE THAN ITS CEILING IS REFUSED BEFORE THE MONEY IS GONE', async () => {
  const { seen, env } = answering(() => ({ response: '{"kind":"invoice","actionable":true}', usage: { prompt_tokens: 5, completion_tokens: 4 } }));

  const got = await aiInference(env).complete({ ...ask, budget: { neurons: 1 } });

  assert.equal(codeOf(got), 'SLASH_BUDGET_SPENT');
  assert.match(fixOf(got), /about 2 neurons and its ceiling is 1/u, 'both figures, because the two repairs are not interchangeable');
  assert.equal(seen.length, 0, 'a ceiling checked after the call is a report and not a refusal');
});

/**
 * `−0.5` QUANTISES TO `−63` AND NOT `−64`, WHICH IS WRITTEN DOWN HERE BECAUSE IT SURPRISED THE
 * FIRST DRAFT OF THIS TEST. `Math.round` in JavaScript breaks a tie towards positive infinity, so
 * `Math.round(-63.5)` is `-63` while `Math.round(63.5)` is `64`: the quantiser is not symmetric
 * about zero. Nothing is wrong with that, and cosine distance over a 1,024-dimension vector does
 * not notice one least-significant bit. It is asserted because the self-host has to produce the
 * same bytes for the same text, and a second implementation that reached for a symmetric round
 * would put two spellings of the same embedding in one `entry_vec` table.
 */
test('EMBEDDINGS COME BACK QUANTISED TO INT8, with the model and the width that produced them', async () => {
  const { seen, env } = answering(() => ({ data: [[1, -1, 0.5, -0.5, 0], [0.00393, -0.00393, 1, 1, 1]], shape: [2, 5] }));

  const got = await aiInference(env).embed(['one', 'two']);

  assert.ok(got.ok, fixOf(got));
  assert.equal(got.value.model, '@cf/baai/bge-m3');
  assert.equal(got.value.dims, 5);
  assert.equal(seen[0]?.model, '@cf/baai/bge-m3');
  assert.deepEqual(seen[0]?.inputs['text'], ['one', 'two']);
  assert.ok(got.value.vectors[0] instanceof Int8Array);
  assert.deepEqual([...(got.value.vectors[0] ?? [])], [127, -127, 64, -63, 0]);
  assert.deepEqual([...(got.value.vectors[1] ?? [])], [0, 0, 127, 127, 127]);
});

test('A VALUE PAST THE UNIT RANGE IS CLAMPED AND NEVER REACHES −128, so the byte a caller reads is always negatable', async () => {
  const { env } = answering(() => ({ data: [[9, -9, -1.004]] }));
  const got = await aiInference(env).embed(['one']);
  assert.ok(got.ok);
  assert.deepEqual([...(got.value.vectors[0] ?? [])], [127, -127, -127]);
});

test('AN EMBEDDING BATCH IS PRICED AT NOTHING AND COUNTED BY APPROXIMATION, because the model reports no usage', async () => {
  const { env } = answering(() => ({ data: [[1, 0]] }));
  const got = await aiInference(env).embed(['12345678']);
  assert.ok(got.ok);
  assert.deepEqual(got.value.usage, { in: 2, out: 0, neurons: null }, 'eight bytes are two tokens at ceil(bytes / 4)');
});

test('NOTHING TO EMBED IS NOT A CALL, and a count that does not match what was asked is refused rather than filed', async () => {
  const { seen, env } = answering(() => ({ data: [[1]] }));

  const empty = await aiInference(env).embed([]);
  assert.ok(empty.ok);
  assert.deepEqual(empty.value, { model: '@cf/baai/bge-m3', dims: 0, vectors: [], usage: { in: 0, out: 0, neurons: null } });
  assert.equal(seen.length, 0);

  const short = await aiInference(env).embed(['one', 'two']);
  assert.equal(codeOf(short), 'NOT_IN_THIS_BUILD', 'a vector filed against the wrong entry is worse than no vector');
});

/**
 * THE TWO ROWS OF THE ROUTING TABLE DO NOT SPEAK THE SAME SHAPE, AND THE FIRST DRAFT OF THIS
 * ADAPTER READ BOTH AS THOUGH THEY DID. Measured against `@cloudflare/workers-types`
 * 5.20260907.1, which is what `apps/worker/tsconfig.json` compiles against:
 * `"@cf/meta/llama-3.2-1b-instruct": BaseAiTextGeneration`, whose output is
 * `{ response?: string; tool_calls?; usage? }`, and `"@cf/zai-org/glm-5.3-flash":
 * Base_Ai_Cf_Zai_Org_Glm_5_3_Flash`, whose output is `ChatCompletionsOutput`, which is OpenAI's
 * shape and has no `response` at all. Compiling `glm.response` against it answers
 * *"TS2339: Property 'response' does not exist on type 'ChatCompletionsOutput'"*.
 *
 * NOTHING CAUGHT IT BECAUSE `AiBinding` IS STRUCTURAL. `run(model: string, ...)` matches the
 * binding's unknown-model fallback overload, which returns `Record<string, unknown>`, so every
 * per-model output type in the platform's declarations is erased at exactly the seam that needed
 * them. The type checks; the read comes back `undefined`; every structured call on the flash row
 * would have been refused `PROPOSAL_SCHEMA: it is not JSON at all`, blaming the model for the
 * adapter reading the wrong field.
 */
test('THE CHAT-COMPLETIONS ROW IS READ OUT OF `choices`, because it does not answer with `response`', async () => {
  const { seen, env } = answering(() => ({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1_758_326_400,
    model: '@cf/zai-org/glm-5.3-flash',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: '{"kind":"invoice","actionable":true}' },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 412, completion_tokens: 12, total_tokens: 424 },
  }));

  const got = await aiInference(env).complete({ ...ask, model: 'glm-5.3-flash' });

  assert.ok(got.ok, fixOf(got));
  assert.deepEqual(got.value, {
    text: '{"kind":"invoice","actionable":true}',
    model: '@cf/zai-org/glm-5.3-flash',
    usage: { in: 412, out: 12, neurons: null },
  });
  assert.equal(seen[0]?.model, '@cf/zai-org/glm-5.3-flash');
});

/**
 * THE SAME DIVERGENCE ON THE WAY IN, AND THIS ONE IS THE EXPENSIVE HALF. The text-generation row
 * takes `AiTextGenerationResponseFormat`, which is `{ type; json_schema?: any }`, so a bare schema
 * is what it wants. The chat-completions row takes `ResponseFormatJSONSchema`, which is
 * `{ type: 'json_schema'; json_schema: { name: string; description?; schema?; strict? } }`.
 * Compiling the bare schema against the flash row answers *"TS2769: No overload matches this call
 * ... Property 'name' is missing in type 'Record<string, unknown>'"*.
 *
 * A REQUEST THAT IS NOT REJECTED IS WORSE THAN ONE THAT IS. If the platform accepts the malformed
 * wrapper rather than answering 400, the call is billed and the schema was never applied, so the
 * constraint this whole port exists to impose is silently off.
 */
test('EACH ROW IS SENT THE `response_format` ITS OWN INPUT TYPE DECLARES, and the two are not the same', async () => {
  const answer = { response: '{"kind":"invoice","actionable":true}', usage: { prompt_tokens: 5, completion_tokens: 4 } };

  const bare = answering(() => answer);
  await aiInference(bare.env).complete(ask);
  assert.deepEqual(bare.seen[0]?.inputs['response_format'], { type: 'json_schema', json_schema: TRIAGE });

  const wrapped = answering(() => ({
    choices: [{ index: 0, message: { role: 'assistant', content: '{"kind":"invoice","actionable":true}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 4 },
  }));
  await aiInference(wrapped.env).complete({ ...ask, model: 'glm-5.3-flash' });
  assert.deepEqual(wrapped.seen[0]?.inputs['response_format'], {
    type: 'json_schema',
    json_schema: { name: 'answer', schema: TRIAGE, strict: true },
  });
});

/**
 * WHERE THE PLATFORM SAYS IT WAS CUT OFF, THE GUESS IS NOT USED. `ChatCompletionChoice` carries a
 * required `finish_reason`, so on that row truncation is stated rather than inferred from a token
 * count that happens to reach the ceiling. The adapter's header used to say the post-processed
 * output carries no `finish_reason`, which is true of the text-generation row and false of this
 * one, and the guess it justified calls a complete answer truncated whenever the model lands
 * exactly on the ceiling.
 */
test('A CHAT-COMPLETIONS ANSWER THAT LANDS ON THE CEILING AND SAYS `stop` IS NOT TRUNCATED', async () => {
  const good = '{"kind":"invoice","actionable":true}';

  const stopped = answering(() => ({
    choices: [{ index: 0, message: { role: 'assistant', content: good }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 412, completion_tokens: 64 },
  }));
  const fine = await aiInference(stopped.env).complete({ ...ask, model: 'glm-5.3-flash' });
  assert.ok(fine.ok, fixOf(fine));

  const cut = answering(() => ({
    choices: [{ index: 0, message: { role: 'assistant', content: '{"kind":"invoi' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 412, completion_tokens: 64 },
  }));
  const got = await aiInference(cut.env).complete({ ...ask, model: 'glm-5.3-flash' });
  assert.equal(codeOf(got), 'PROPOSAL_SCHEMA');
  assert.match(fixOf(got), /stopped at the 64-token ceiling/u);
});

/**
 * A ROW THAT IS NOT A LIST OF NUMBERS IS THE SAME FAILURE AS A BATCH OF THE WRONG LENGTH, and the
 * first draft refused one and quietly filed the other. `embed` guarded the count because the
 * caller writes `entry_vec` by position, then handed each row to a quantiser that dropped every
 * value that was not a number, so a malformed row became a SHORT vector and a row that was not a
 * list at all became an EMPTY one, both reported `ok`. A zero-length vector in `entry_vec` is a
 * row that matches nothing and never says why, which is the worse half of what the count guard
 * exists to prevent.
 */
test('A RAGGED OR UNREADABLE EMBEDDING ROW IS REFUSED, not quantised down to whatever was numeric', async () => {
  const notAList = answering(() => ({ data: [[0.1, 0.2], 'nope'] }));
  assert.equal(codeOf(await aiInference(notAList.env).embed(['one', 'two'])), 'NOT_IN_THIS_BUILD');

  const ragged = answering(() => ({ data: [[0.1, 0.2, 0.3], [0.1, null, 0.3]] }));
  const got = await aiInference(ragged.env).embed(['one', 'two']);
  assert.equal(codeOf(got), 'NOT_IN_THIS_BUILD', 'a two-wide vector beside a three-wide one compares against nothing');

  const empty = answering(() => ({ data: [[]] }));
  assert.equal(codeOf(await aiInference(empty.env).embed(['one'])), 'NOT_IN_THIS_BUILD');
});

test("THE PROVIDER'S OWN WORDS RIDE THE REFUSAL AS `detail`, beside the phrase, so the operator can tell route from account", async () => {
  const said = '5016: AiError: Your account 0123456789abcdef0123456789abcdef has no access to @cf/zai-org/glm-5.3-flash';
  const { env } = answering(() => { throw new Error(said); });
  const out = await aiInference(env).complete(ask);
  assert.ok(refused(out));
  assert.match(out.refusal.fix, /did not answer/u, 'the phrase stays the sentence a person reads');
  assert.equal(out.refusal.detail, '5016: AiError: Your account [cut] has no access to @cf/zai-org/glm-5.3-flash');

  const embedded = await aiInference(env).embed(['one']);
  assert.ok(refused(embedded));
  assert.match(String(embedded.refusal.detail), /has no access/u);

  /* NOTHING THROWN, NOTHING TO QUOTE: an unbound binding is the phrase alone. */
  const unbound = await aiInference({ AI_GATEWAY: 'braindog-alpha' }).complete(ask);
  assert.ok(refused(unbound));
  assert.equal(unbound.refusal.detail, undefined);
});

test("A KEY OR A PERSON'S PROMPT IN THE PROVIDER'S MESSAGE NEVER REACHES `detail`, and nothing past 300 characters does", async () => {
  const prompt = 'Sam wrote: my card ending 7731 was charged twice';
  const said = `400 Bad Request: Authorization: Bearer cf-live-0a1b2c3d api_key="sk_live_abc" body {"messages":[{"role":"user","content":"${prompt}"}],"x":"${'pad '.repeat(120)}${prompt}"}`;
  const { env } = answering(() => { throw new Error(said); });
  const out = await aiInference(env).complete(ask);
  assert.ok(refused(out));
  const detail = String(out.refusal.detail);
  assert.ok(detail.length <= RAW_MOST, `${detail.length} characters`);
  for (const secret of ['cf-live-0a1b2c3d', 'sk_live_abc', prompt]) assert.ok(!detail.includes(secret), secret);
  assert.match(detail, /^400 Bad Request/u);
  assert.equal(scrubRaw('a long token run ' + 'A1'.repeat(30)), 'a long token run [cut]');
  assert.equal(scrubRaw('bad input {"text":["Ada 7731"]} key sk-proj-ab12cd'), 'bad input {"text":"[cut]"} key [cut]');
  assert.equal(scrubRaw('API key invalid for this route'), 'API key invalid for this route', 'words that are no key stay');
});
