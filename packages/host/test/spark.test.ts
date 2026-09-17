/**
 * Spark's model at an endpoint (`src/spark.ts`): what is sent, what is read back, and that a failing endpoint leaves Spark's
 * own rules to speak. The endpoint is a test double and every key is an obviously fake value; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { answerOf, endpointModel, SPARK_INSTRUCTIONS, SPARK_PLAN_INSTRUCTIONS } from '../src/spark.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const FAKE_KEY = 'fake-key-for-tests-only';
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const INPUT = { usage: { lists: [] }, noticed: [], rules: [], offered: [], kinds: ['pack', 'settings', 'arrange'], most: 3 } as never;

function endpoint(answer: () => Response) {
  const sent: { url: string; init: RequestInit }[] = [];
  return { sent, send: async (url: URL, init: RequestInit) => (sent.push({ url: url.href, init }), answer()) };
}

const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 });

test('A DRAFT IS ASKED OF A CHAT-COMPLETIONS ENDPOINT, with the key asked for on the call and nothing else of it kept', async () => {
  const net = endpoint(() => completion('{"drafts":[{"question":"Turn off Notes?","body_kind":"pack","body":{"disable":"notes"}}]}'));
  let asked = 0;
  const model = endpointModel({ url: 'http://localhost:11434/v1/chat/completions', model: 'small', key: async () => (asked++, FAKE_KEY), send: net.send });
  assert.equal(model.name, 'endpoint');
  assert.deepEqual(await model.draft(INPUT), { drafts: [{ question: 'Turn off Notes?', body_kind: 'pack', body: { disable: 'notes' } }] });
  assert.equal(asked, 1);
  const [call] = net.sent;
  assert.equal(call!.init.method, 'POST');
  assert.equal((call!.init.headers as Record<string, string>).authorization, `Bearer ${FAKE_KEY}`);
  const body = JSON.parse(String(call!.init.body)) as { model: string; messages: { role: string; content: string }[] };
  assert.equal(body.model, 'small');
  assert.equal(body.messages[0]!.content, SPARK_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(body.messages[1]!.content), INPUT);
  assert.ok(!String(call!.init.body).includes(FAKE_KEY), 'the key went into what the model reads');
  assert.ok(!SPARK_INSTRUCTIONS.includes('—'));

  /* NO KEY, NO HEADER. */
  const bare = endpoint(() => completion('{"drafts":[]}'));
  await endpointModel({ url: 'http://localhost:8080/v1/chat/completions', send: bare.send }).draft(INPUT);
  assert.equal((bare.sent[0]!.init.headers as Record<string, string>).authorization, undefined);
});

test('A FIRST PLAN IS ASKED WITH ITS OWN INSTRUCTIONS, handed only the sentence and the lists, with the key kept out of both', async () => {
  const net = endpoint(() => completion('{"plan":{"milestones":[{"what":"Pick a name","stage":"idea"}]}}'));
  const model = endpointModel({ url: 'http://localhost:11434/v1/chat/completions', key: async () => FAKE_KEY, send: net.send });
  const input = { what: 'A plan.', said: 'I want to start a podcast', today: '2026-09-17', lists: [{ register: 'milestones', least: 1, most: 3, fields: { what: { text: 80 } } }] };
  assert.deepEqual(await model.form!(input), { plan: { milestones: [{ what: 'Pick a name', stage: 'idea' }] } });
  const body = JSON.parse(String(net.sent[0]!.init.body)) as { messages: { role: string; content: string }[] };
  assert.equal(body.messages[0]!.content, SPARK_PLAN_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(body.messages[1]!.content), input);
  assert.ok(!String(net.sent[0]!.init.body).includes(FAKE_KEY));
  assert.ok(!SPARK_PLAN_INSTRUCTIONS.includes('—'), 'no dash as punctuation in what the model is told');
});

test('AN ANSWER IS READ INSIDE A FENCE OR AS A BARE BODY, and a failing endpoint throws without the key in its sentence', async () => {
  assert.deepEqual(answerOf(JSON.stringify({ choices: [{ message: { content: '```json\n{"drafts":[]}\n```' } }] })), { drafts: [] });
  assert.deepEqual(answerOf('{"drafts":[]}'), { drafts: [] });
  const down = endpoint(() => new Response(`bad key ${FAKE_KEY}`, { status: 401 }));
  await assert.rejects(endpointModel({ url: 'https://models.example.org/v1/chat/completions', key: async () => FAKE_KEY, send: down.send }).draft(INPUT), (e: Error) => {
    assert.equal(e.message, 'The Spark endpoint answered 401.');
    return true;
  });
  assert.throws(() => endpointModel({ url: 'file:///etc/passwd', send: down.send }), /http or https/u);
});

test('A RECORD WITH AN ENDPOINT SAYS WHICH MODEL IS BEHIND SPARK, and does not ask it before there is anything to go on', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 17, 12));
  const down = endpoint(() => new Response('', { status: 503 }));
  const api = await createRecordApi({ sql, clock, sparkModel: endpointModel({ url: 'http://localhost:9/v1/chat/completions', send: down.send }) });
  const out = (await api.sparkPropose({}, owner)) as { ok: boolean; value: { by: string; filed: unknown[] } };
  assert.ok(out.ok);
  /* A NEW RECORD IS WATCHED, SO THE MODEL IS NOT EVEN ASKED. */
  assert.equal(down.sent.length, 0);
  assert.deepEqual(out.value.filed, []);
  const reading = (await api.spark({}, owner)) as { ok: boolean; value: { model: string } };
  assert.equal(reading.value.model, 'endpoint');
  sql.close();
});
