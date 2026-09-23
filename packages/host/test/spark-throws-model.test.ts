/**
 * The two throws out of `post` that come after a request left and before a body was read, the timeout and the body that
 * broke off, name the model this host sent, as the size and the parse already do.
 *
 * WAVE 48 PASSED `model` INTO BOTH AND TESTED NEITHER. `packages/host/test/spark.test.ts` holds the parse throw to
 * `model: 'llama3'`, and `apps/selfhost/test/spark-answers.test.ts` holds the size throw's row to it; the timeout and the
 * broke-off body were checked for their mark and their message and never for a name, so either `model` argument could
 * be dropped and every suite stayed green. That is not a guess: on 23 September, with the third argument taken off both
 * `SparkAnsweredError`s in `post`, the host's other 232 tests, the 9 in `packages/spark/test/spark-*.test.ts` and the 46
 * in `apps/selfhost/test/spark*.test.ts` all passed. Dropped, `answer` settles the row under the template's
 * `glm-5.3-flash` on a host whose endpoint was sent `llama3`.
 *
 * AND THE COUNT IN AN OVERSIZED BODY IS CLAMPED AS THE REPLY'S IS. `usageIn` reads the provider's count out of a body too
 * large to hand on, and it goes through `counted`, so the ceiling holds on the throw as on the reply.
 *
 * RED ON 23 SEPTEMBER, measured by taking `model` off the two throws and then putting it back: cases 1 and 2 failed with
 * `model: undefined` where `llama3` was expected. Case 3 was red before the ceiling, reading `usage` as `{ in: 1e300,
 * out: 1e300 }`, and case 4 read `{ in: 0, out: 0 }`, a count too large for a double billed as nothing at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { endpointInference, SPARK_TOKENS_CEILING } from '../src/spark.ts';

const call = { model: 'glm-5.3-flash', messages: [{ role: 'user' as const, content: 'q' }], maxTokens: 64, jsonSchema: {} };

/** What `complete` threw on a host whose `SPARK_MODEL` is `llama3`, read for the fields the package reads off it. */
const thrown = async (send: (url: URL, init: RequestInit) => Promise<Response>) => {
  try {
    await endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'llama3', send, timeoutMs: 20 }).complete(call);
  } catch (e) {
    const { answered, model, usage } = e as { answered?: unknown; model?: unknown; usage?: unknown };
    return { message: (e as Error).message, answered, model, usage };
  }
  return null;
};

test('(1) THE TIMEOUT NAMES THE MODEL THIS HOST SENT', async () => {
  const out = await thrown(
    (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
  );
  assert.deepEqual(out, {
    message: 'The Spark endpoint did not finish answering within 0.02 seconds.',
    answered: true,
    model: 'llama3',
    usage: undefined,
  });
});

test('(2) A 200 WHOSE BODY BROKE OFF NAMES THE MODEL THIS HOST SENT', async () => {
  const out = await thrown(
    async () =>
      new Response(
        new ReadableStream({
          start: (c) => {
            c.enqueue(new TextEncoder().encode('{"choices":'));
            c.error(new Error('socket hang up'));
          },
        }),
        { status: 200 },
      ),
  );
  assert.deepEqual(out, { message: 'The Spark endpoint broke off its answer.', answered: true, model: 'llama3', usage: undefined });
});

test('(3) A BODY TOO LARGE TO READ, REPORTING 1e300 TOKENS, THROWS WITH THE COUNT AT THE CEILING', async () => {
  const body = JSON.stringify({ choices: [{ message: { content: 'x'.repeat(70_000) } }], usage: { prompt_tokens: 1e300, completion_tokens: 1e300 } });
  const out = await thrown(async () => new Response(body, { status: 200 }));
  assert.deepEqual(out, {
    message: 'The Spark endpoint answered more than Spark reads.',
    answered: true,
    model: 'llama3',
    usage: { in: SPARK_TOKENS_CEILING, out: SPARK_TOKENS_CEILING },
  });
});

/* `1e999` IS VALID JSON AND `JSON.parse` READS IT AS `Infinity`, which `Number.isFinite` sent to zero: the one count a
   body can report that is larger than 1e300 was the one billed as nothing. The body is written by hand because
   `JSON.stringify(Infinity)` is `null`. */
test('(4) A REPLY REPORTING 1e999 TOKENS, WHICH PARSES AS INFINITY, IS BILLED AT THE CEILING AND NOT AS NOTHING', async () => {
  const body = `{"choices":[{"message":{"content":"{\\"answer\\":4}"}}],"usage":{"prompt_tokens":1e999,"completion_tokens":1e999}}`;
  const reply = await endpointInference({
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'llama3',
    send: async () => new Response(body, { status: 200 }),
  }).complete(call);
  assert.deepEqual({ model: reply.model, usage: reply.usage }, { model: 'llama3', usage: { in: SPARK_TOKENS_CEILING, out: SPARK_TOKENS_CEILING } });
});
