/**
 * Embeddings over an OpenAI-style endpoint (`src/slash.ts` `endpointInference`'s `embed`), so a self-host whose server
 * embeds indexes its rows by meaning on the same pass as the Cloud.
 *
 * BEFORE THIS, THE ENDPOINT SPOKE CHAT COMPLETIONS ONLY, and `infer.embed` waited forever on a self-host. Every request
 * here goes to a fake `send`; nothing leaves the machine and no key of anybody's is used.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SlashAnsweredError, SlashRefusedError, endpointInference, slashFromEnv, type EndpointModelOptions } from '../src/slash.ts';

/** A key as an issuer shapes one, built here so no credential sits in the file. */
const KEY = `sk-${'fake0Ab1Cd2Ef3Gh4Ij5'}`;
const CHAT = 'http://127.0.0.1:11434/v1/chat/completions';

type Sent = { url: string; headers: Record<string, string>; body: { model?: string; input?: string[] } };

/** An endpoint that answers `answer` to each call, and the calls it saw. */
const fake = (answer: (body: Sent['body']) => Response, more: Partial<EndpointModelOptions> = {}) => {
  const sent: Sent[] = [];
  const options: EndpointModelOptions = {
    url: CHAT,
    model: 'chatter',
    embedModel: 'embedder',
    key: async () => KEY,
    send: async (input, init) => {
      const body = JSON.parse(String(init.body)) as Sent['body'];
      sent.push({ url: input.href, headers: init.headers as Record<string, string>, body });
      return answer(body);
    },
    ...more,
  };
  return { sent, inference: endpointInference(options) };
};

const vectors = (rows: unknown[]) => Response.json({ data: rows.map((embedding, index) => ({ object: 'embedding', index, embedding })), usage: { prompt_tokens: 7 } });

test('NO EMBEDDING MODEL IS NO EMBED: the endpoint answers completions alone', () => {
  const { inference } = fake(() => vectors([]), { embedModel: undefined });
  assert.equal(inference.embed, undefined);
});

test('A /v1/chat/completions ADDRESS POSTS TO /v1/embeddings, with the model and the texts, and the key in one header', async () => {
  const { sent, inference } = fake(() => vectors([[3, 4], [0, -2]]));
  assert.ok(inference.embed);
  const out = await inference.embed(['a cup of tea', 'the kiln']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'http://127.0.0.1:11434/v1/embeddings');
  assert.deepEqual(sent[0]!.body, { model: 'embedder', input: ['a cup of tea', 'the kiln'] });
  const holding = Object.entries(sent[0]!.headers).filter(([, v]) => v.includes(KEY));
  assert.deepEqual(holding, [['authorization', `Bearer ${KEY}`]]);
  assert.ok(!JSON.stringify(sent[0]!.body).includes(KEY), 'the key reached the body');

  /* UNIT LENGTH, THEN INT8: [3, 4] is [0.6, 0.8], which is [76, 102]. */
  assert.equal(out.model, 'embedder');
  assert.equal(out.dims, 2);
  assert.ok(out.vectors.every((v) => v instanceof Int8Array));
  assert.deepEqual(out.vectors.map((v) => [...v]), [[76, 102], [0, -127]]);
  assert.deepEqual(out.usage, { in: 7, out: 0 });
});

test('THE ANSWER IS READ IN index ORDER, and an address ending in /v1 takes /embeddings after it', async () => {
  const { sent, inference } = fake(
    () => Response.json({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }),
    { url: 'http://127.0.0.1:8080/v1/' },
  );
  const out = await inference.embed!(['first', 'second']);
  assert.equal(sent[0]!.url, 'http://127.0.0.1:8080/v1/embeddings');
  assert.deepEqual(out.vectors.map((v) => [...v]), [[127, 0], [0, 127]]);
  assert.deepEqual(out.usage, { in: 0, out: 0 }, 'no count is billed as nothing');
});

test('A NAMED EMBEDDINGS ADDRESS WINS, and an address no sibling can be had of means no embed', async () => {
  const named = fake(() => vectors([[1]]), { embedUrl: 'http://127.0.0.1:9000/embed' });
  await named.inference.embed!(['one']);
  assert.equal(named.sent[0]!.url, 'http://127.0.0.1:9000/embed');
  assert.equal(fake(() => vectors([]), { url: 'http://127.0.0.1:9000/ask' }).inference.embed, undefined);
});

test('A SHORT COUNT, A NaN AND TWO WIDTHS ARE EACH THE ANSWERED MARK, and an empty batch sends nothing', async () => {
  const answered = (e: unknown): boolean => e instanceof SlashAnsweredError && e.answered === true && e.model === 'embedder';
  await assert.rejects(fake(() => vectors([[1, 0]])).inference.embed!(['a', 'b']), answered);
  await assert.rejects(fake(() => Response.json({ data: [{ index: 0, embedding: [1, null] }] })).inference.embed!(['a']), answered);
  await assert.rejects(fake(() => vectors([[1, 0], [1, 0, 0]])).inference.embed!(['a', 'b']), answered);
  await assert.rejects(fake(() => new Response('<html>a proxy</html>', { status: 200 })).inference.embed!(['a']), answered);

  const empty = fake(() => assert.fail('an empty batch was sent'));
  assert.deepEqual(await empty.inference.embed!([]), { model: 'embedder', dims: 0, vectors: [], usage: { in: 0, out: 0 } });
  assert.equal(empty.sent.length, 0);
});

test("A 401 IS THE SAME REFUSAL A COMPLETION GETS, and the key is in no thrown message", async () => {
  const { inference } = fake(() => new Response(`bad key ${KEY}`, { status: 401 }), { keyName: 'your own key for Slash' });
  const embedded = await inference.embed!(['a']).then(
    () => assert.fail('a 401 answered'),
    (e: unknown) => e,
  );
  const completed = await inference
    .complete({ model: 'glm-5.3-flash', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10, jsonSchema: {} })
    .then(
      () => assert.fail('a 401 answered'),
      (e: unknown) => e,
    );
  assert.ok(embedded instanceof SlashRefusedError && completed instanceof SlashRefusedError);
  assert.equal(embedded.message, completed.message);
  assert.equal(embedded.refused, 401);
  assert.equal(embedded.key, completed.key);
  for (const e of [embedded, completed]) assert.ok(!JSON.stringify({ m: e.message, s: e.stack }).includes(KEY), 'a thrown message quoted the key');
});

test('slashFromEnv READS SLASH_EMBED_MODEL AND SLASH_EMBED_ENDPOINT, trimmed, and empty is absent', () => {
  assert.deepEqual(slashFromEnv({ SLASH_ENDPOINT: CHAT, SLASH_EMBED_MODEL: ' embedder ', SLASH_EMBED_ENDPOINT: ' http://127.0.0.1:9000/embed ' }), {
    url: CHAT,
    model: undefined,
    key: undefined,
    embedModel: 'embedder',
    embedUrl: 'http://127.0.0.1:9000/embed',
  });
  const none = slashFromEnv({ SLASH_ENDPOINT: CHAT, SLASH_EMBED_MODEL: '  ', SLASH_EMBED_ENDPOINT: '' });
  assert.equal(none?.embedModel, undefined);
  assert.equal(none?.embedUrl, undefined);
  assert.equal(slashFromEnv({ SLASH_EMBED_MODEL: 'embedder' }), undefined, 'an embedding model with no endpoint is no model');
});
