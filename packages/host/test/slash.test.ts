/**
 * Slash's model at an endpoint (`src/slash.ts`): what is sent, what is read back, and that a failing endpoint leaves Slash's
 * own rules to speak. The endpoint is a test double and every key is an obviously fake value; nothing leaves the machine.
 *
 * AND THE TWO PORTS THE THIRTEENTH PACKAGE ASKS A HOST FOR, driven against a real record. `createSlash` is imported by a
 * relative path because `packages/host` does not depend on `@braindog/slash` and must not: `46 §5.1` has the host import the
 * package dynamically and only when `SLASH_ENDPOINT` is set, so the edge belongs to the app, which is where the one wiring
 * line goes. A test may reach across (this file already reaches `kernel/test/sqlite.ts`), and `tools/gates/graph.mjs` reads
 * `src/**` alone, so nothing here weakens the boundary it is standing in for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import {
  answerOf,
  endpointInference,
  endpointModel,
  slashByokOf,
  slashFromEnv,
  slashGrantIdOf,
  slashInferenceOf,
  slashModelNameOf,
  slashModelOf,
  slashNamedEngine,
  slashRecord,
  SLASH_INSTRUCTIONS,
  SLASH_PLAN_INSTRUCTIONS,
} from '../src/slash.ts';
import { createSlash, MODELS } from '../../slash/src/index.ts';
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
  assert.equal(body.messages[0]!.content, SLASH_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(body.messages[1]!.content), INPUT);
  assert.ok(!String(call!.init.body).includes(FAKE_KEY), 'the key went into what the model reads');
  assert.ok(!SLASH_INSTRUCTIONS.includes('—'));

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
  assert.equal(body.messages[0]!.content, SLASH_PLAN_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(body.messages[1]!.content), input);
  assert.ok(!String(net.sent[0]!.init.body).includes(FAKE_KEY));
  assert.ok(!SLASH_PLAN_INSTRUCTIONS.includes('—'), 'no dash as punctuation in what the model is told');
});

test('AN ANSWER IS READ INSIDE A FENCE OR AS A BARE BODY, and a failing endpoint throws without the key in its sentence', async () => {
  assert.deepEqual(answerOf(JSON.stringify({ choices: [{ message: { content: '```json\n{"drafts":[]}\n```' } }] })), { drafts: [] });
  assert.deepEqual(answerOf('{"drafts":[]}'), { drafts: [] });
  const down = endpoint(() => new Response(`bad key ${FAKE_KEY}`, { status: 401 }));
  await assert.rejects(endpointModel({ url: 'https://models.example.org/v1/chat/completions', key: async () => FAKE_KEY, send: down.send }).draft(INPUT), (e: Error) => {
    assert.equal(e.message, 'The Slash endpoint answered 401.');
    return true;
  });
  assert.throws(() => endpointModel({ url: 'file:///etc/passwd', send: down.send }), /http or https/u);
});

test('A RECORD WITH AN ENDPOINT SAYS WHICH MODEL IS BEHIND SLASH, and does not ask it before there is anything to go on', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 17, 12));
  const down = endpoint(() => new Response('', { status: 503 }));
  const api = await createRecordApi({ sql, clock, slashModel: endpointModel({ url: 'http://localhost:9/v1/chat/completions', send: down.send }) });
  const out = (await api.slashPropose({}, owner)) as { ok: boolean; value: { by: string; filed: unknown[] } };
  assert.ok(out.ok);
  /* A NEW RECORD IS WATCHED, SO THE MODEL IS NOT EVEN ASKED. */
  assert.equal(down.sent.length, 0);
  assert.deepEqual(out.value.filed, []);
  const reading = (await api.slash({}, owner)) as { ok: boolean; value: { model: string } };
  assert.equal(reading.value.model, 'endpoint');
  sql.close();
});

/* ── the two ports `@braindog/slash` asks a host for ─────────────────────── */

const usedCompletion = (content: string, usage: { prompt_tokens: number; completion_tokens: number }) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage }), { status: 200 });

test('THE SAME ENDPOINT IS THE PACKAGE\'S Inference PORT, asked with a schema and read back with the provider\'s own token counts', async () => {
  const net = endpoint(() => usedCompletion('{"registers":["tasks"],"where":null,"q":"open"}', { prompt_tokens: 812, completion_tokens: 19 }));
  const inference = endpointInference({ url: 'http://localhost:11434/v1/chat/completions', model: 'small', key: async () => FAKE_KEY, send: net.send });
  const schema = { type: 'object', required: ['registers'], properties: { registers: { type: 'array' } } };
  const reply = await inference.complete({
    model: 'glm-5.3-flash',
    messages: [{ role: 'system', content: 'You are Slash.' }, { role: 'user', content: 'Which tasks are open?' }],
    maxTokens: 200,
    jsonSchema: schema,
  });
  assert.equal(reply.text, '{"registers":["tasks"],"where":null,"q":"open"}');
  /* THE METER BILLS WHAT THE PROVIDER COUNTED and never the local estimate (`46 §4.1`). */
  assert.deepEqual(reply.usage, { in: 812, out: 19 });

  const body = JSON.parse(String(net.sent[0]!.init.body)) as {
    model: string;
    max_tokens: number;
    response_format: { type: string; json_schema: { name: string; schema: unknown; strict: boolean } };
    messages: { role: string; content: string }[];
  };
  /* THE SHORT NAME IS THE PACKAGE'S AND THE PROVIDER ID IS THE HOST'S (`46 §2`): this endpoint answers with `small`. */
  assert.equal(body.model, 'small');
  assert.equal(body.max_tokens, 200);
  assert.equal(body.response_format.type, 'json_schema');
  assert.deepEqual(body.response_format.json_schema.schema, schema);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  assert.equal((net.sent[0]!.init.headers as Record<string, string>).authorization, `Bearer ${FAKE_KEY}`);
  assert.ok(!String(net.sent[0]!.init.body).includes(FAKE_KEY), 'the key went into what the model reads');

  /* A PROVIDER THAT DID NOT ANSWER THROWS, which is what `core.run` reads as `UNREACHABLE`. */
  const down = endpoint(() => new Response('', { status: 503 }));
  await assert.rejects(
    endpointInference({ url: 'http://localhost:9/v1/chat/completions', send: down.send }).complete({ model: 'glm-5.3-flash', messages: [], maxTokens: 10, jsonSchema: {} }),
    /answered 503/u,
  );
});

/* ── `SLASH_MODEL` maps the package's four short names and nothing else (research-slash-routes F1, F2) ─── */

const ask = (model: string) => ({ model, messages: [], maxTokens: 10, jsonSchema: {} });
const sentModel = (net: { sent: { init: RequestInit }[] }, i: number): string => (JSON.parse(String(net.sent[i]!.init.body)) as { model: string }).model;

test('A MODEL THE OWNER NAMED REACHES THE ENDPOINT, and SLASH_MODEL stands in only for the package\'s four routing names', async () => {
  const net = endpoint(() => usedCompletion('{}', { prompt_tokens: 1, completion_tokens: 1 }));
  const inference = endpointInference({ url: 'http://localhost:11434/v1/chat/completions', model: 'ENV_MODEL', send: net.send });
  /* THE FAILURE, AS IT WAS MEASURED: an owner's `llama3:8b` on tier `byo` was posted as `ENV_MODEL`, so a settings route
     would have stored a model that nothing sends. */
  await inference.complete(ask('llama3:8b'));
  assert.equal(sentModel(net, 0), 'llama3:8b');
  /* THE PACKAGE'S OWN TABLE AND NOT A COPY OF IT, so a fifth model added there and not to `ROUTING_NAMES` is red here. */
  const shorts = Object.keys(MODELS);
  assert.equal(shorts.length, 4);
  for (const short of shorts) await inference.complete(ask(short));
  assert.deepEqual([1, 2, 3, 4].map((i) => sentModel(net, i)), ['ENV_MODEL', 'ENV_MODEL', 'ENV_MODEL', 'ENV_MODEL']);
  /* WITH NO SLASH_MODEL EVERY NAME PASSES THROUGH, the short ones included. */
  await endpointInference({ url: 'http://localhost:11434/v1/chat/completions', send: net.send }).complete(ask('glm-5.3'));
  assert.equal(sentModel(net, 5), 'glm-5.3');
});

/* A STATUS THAT IS NOT `ok` IS A MODEL THAT DID NOT ANSWER, `loop/research-worker-spark.md` §6 Q8's default taken for the
   owner. Wave 47 marked it `answered`, so the package settled a 429 as a paid ask that ends the run for good, where before
   it was retried uncounted: a provider's rate limit or an outage behind a gateway spent the owner's allowance and stopped
   the automation on the first rung. The mark stays on what comes after a 200, which is what a provider bills. RED ON 23
   SEPTEMBER against wave 47's `post`: all four statuses carried `answered: true`. */
test('A STATUS THAT IS NOT ok IS THROWN WITHOUT THE ANSWERED MARK, so the ladder asks again and no ask is spent', async () => {
  const marks: Record<string, unknown> = {};
  for (const status of [401, 429, 502, 503]) {
    const down = endpoint(() => new Response(`slow down ${FAKE_KEY}`, { status }));
    try {
      await endpointInference({ url: 'http://localhost:9/v1/chat/completions', key: async () => FAKE_KEY, send: down.send }).complete(ask('glm-5.3-flash'));
      marks[status] = 'resolved';
    } catch (e) {
      const { answered } = e as { answered?: unknown };
      marks[status] = { message: (e as Error).message, answered };
    }
  }
  assert.deepEqual(marks, {
    401: { message: 'The Slash endpoint answered 401.', answered: undefined },
    429: { message: 'The Slash endpoint answered 429.', answered: undefined },
    502: { message: 'The Slash endpoint answered 502.', answered: undefined },
    503: { message: 'The Slash endpoint answered 503.', answered: undefined },
  });
});

/* THE REPLY SAYS WHICH MODEL THE ENDPOINT WAS SENT, because the package cannot know `SLASH_MODEL` (`46 §2`) and its ledger
   named the routing short name for a call this host sent as `llama3`. And the provider's count is clamped to a whole count
   that is not negative: `tokens_in` and `tokens_out` are `INTEGER NOT NULL`, and before this line a body reporting
   `prompt_tokens: -40` and `completion_tokens: 2.5` was handed on as exactly that, so the row stored a negative count and
   a REAL in an integer column. RED ON 23 SEPTEMBER: the reply had no `model`, and `usage` read `{ in: -40, out: 2.5 }`. */
test('THE REPLY NAMES THE MODEL THIS HOST SENT, and a count that is negative or fractional reaches the meter as a whole count', async () => {
  const net = endpoint(() => usedCompletion('{"answer":4}', { prompt_tokens: -40, completion_tokens: 2.5 }));
  const reply = (await endpointInference({ url: 'http://localhost:11434/v1/chat/completions', model: 'llama3', send: net.send }).complete(ask('glm-5.3-flash'))) as {
    usage: unknown;
    model?: unknown;
  };
  assert.equal(sentModel(net, 0), 'llama3');
  assert.deepEqual({ model: reply.model, usage: reply.usage }, { model: 'llama3', usage: { in: 0, out: 3 } });
  /* AND A THROW AFTER THE 200 NAMES IT TOO, so the row a model that answered unreadably leaves is under the same name. */
  const junk = endpoint(() => new Response('<html>a proxy page</html>', { status: 200 }));
  await assert.rejects(endpointInference({ url: 'http://localhost:11434/v1/chat/completions', model: 'llama3', send: junk.send }).complete(ask('glm-5.3-flash')), (e: unknown) => {
    assert.deepEqual({ answered: (e as { answered?: unknown }).answered, model: (e as { model?: unknown }).model }, { answered: true, model: 'llama3' });
    return true;
  });
});

test('A TIER a STATUS NAMES THE MODEL THAT ANSWERS, which on a host with SLASH_MODEL is that and not the routing short name', async () => {
  const own = openSqlite();
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 22, 9));
  const api = await createRecordApi({ sql, clock });
  const net = endpoint(() => usedCompletion('{}', { prompt_tokens: 1, completion_tokens: 1 }));
  const config = slashFromEnv({ SLASH_ENDPOINT: 'http://localhost:11434/v1/chat/completions', SLASH_MODEL: 'llama3' }, { operatorKey: false });
  const inference = slashInferenceOf(config, { grants: () => [], openKey: async () => null, send: net.send })!;
  const slash = slashNamedEngine(createSlash({ sql: own, clock, inference, record: slashRecord(api) }), slashModelNameOf(config));
  /* THE FAILURE, AS IT WAS MEASURED: `{"tier":"a","model":"glm-5.3-flash",...}` over an endpoint serving `llama3`. */
  assert.equal(slash.status().tier, 'a');
  assert.equal(slash.status().model, 'llama3');
  /* THE REST OF THE ENGINE IS THE ENGINE'S: the wrap changes one answer and hides no method. */
  assert.equal(typeof slash.read, 'function');
  assert.equal(slash.status().asks.cap, createSlash({ sql: own, clock, inference, record: slashRecord(api) }).status().asks.cap);

  /* AN OWNER'S OWN NAME ON TIER byo IS SHOWN AS IT WAS TYPED, because that is also what is now sent. */
  assert.ok(slash.configure({ tier: 'byo', model: 'llama3:8b' }, owner).ok);
  assert.equal(slash.status().model, 'llama3:8b');

  /* AND A HOST WITH NO SLASH_MODEL SHOWS THE SHORT NAME, which is what its endpoint is sent. */
  assert.equal(slashModelNameOf(slashFromEnv({ SLASH_ENDPOINT: 'http://localhost:1/v1' })), undefined);
  const bare = slashNamedEngine(createSlash({ sql: openSqlite(), clock, inference, record: slashRecord(api) }), undefined);
  assert.equal(bare.status().model, 'glm-5.3-flash');
  sql.close();
  own.close();
});

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    /* A REGISTER IS SEARCHED ON THE FIELDS IT NAMES AND NOT ON ITS TITLE. Measured while writing the keyword test below: with
       no `search:` line, `api.search({ q: 'Invoice' })` answered an empty list for a row whose title is `Invoice Acme`. */
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

test('A PROPOSAL ARRIVES FROM THE PACKAGE\'S ENGINE ONTO A REAL RECORD\'S DECIDE, over the host\'s two adapters and nothing else', async () => {
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const fields of [
    { what: 'Invoice Acme', amount: { amount: 500500, currency: 'EGP' }, due: '2026-10-01', state: 'open' },
    { what: 'Invoice Beta', amount: { amount: 120000, currency: 'EGP' }, due: '2026-10-08', state: 'open' },
  ])
    assert.ok((await api.create({ register: 'tasks', fields }, owner)).ok, 'the row was not written');

  const answers = [
    '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}',
    '{"text":"Two tasks are open and {{ref:tasks#1}} falls due first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"what":"Chase {{ref:tasks#1}}"}]},"flagged":false}',
  ];
  const net = endpoint(() => usedCompletion(answers.shift() ?? '{}', { prompt_tokens: 700, completion_tokens: 60 }));

  const slash = createSlash({
    sql: own,
    clock,
    inference: endpointInference({ url: 'http://localhost:11434/v1/chat/completions', model: 'small', send: net.send }),
    record: slashRecord(api),
  });

  const out = await slash.propose('Which tasks are open?', owner);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  assert.equal(out.value.body_kind, 'rowset');
  assert.deepEqual(out.value.citations, ['tasks#1']);
  assert.match(String(out.value.filed), /^SG[0-9]+$/u, 'nothing was filed on the record');
  /* THE FOLD'S LAST LINE IS THE VAULT, REFUSED, on every ask (`46 §4.2`). */
  assert.deepEqual(out.value.read.at(-1), { register: 'grant', rows: 0, predicate: 'refused' });
  assert.deepEqual(out.value.read.at(0), { register: 'tasks', rows: 2, predicate: '{"field":"state","is":"open"}' });

  /* THE QUESTION IS ON DECIDE, IN THE REAL RECORD, FILED AS SLASH. */
  const boot = (await api.boot(owner)) as { ok: boolean; value: { waiting: { id: string; question: string }[] } };
  assert.ok(boot.ok);
  assert.equal(boot.value.waiting.length, 1);
  assert.equal(boot.value.waiting[0]!.id, out.value.filed);
  const queue = (await api.governance({ limit: 5 }, owner)) as { ok: boolean; value: { id: string; body_kind: string; opened_by: string }[] };
  assert.ok(queue.ok);
  assert.equal(queue.value[0]!.body_kind, 'rowset');
  assert.equal(queue.value[0]!.opened_by, 'slash');

  /* AND THE RECORD'S OWN SLASH HAS NO MODEL: this proposal came from the package's engine, not from the rules. */
  const reading = (await api.slash({}, owner)) as { ok: boolean; value: { model: string | null } };
  assert.equal(reading.value.model, null);

  /* TWO CALLS, TWO ROWS IN SLASH'S OWN METER (`46 §4.1`), the endpoint answered both, and each row names the model the host sent. */
  const metered = own.all<{ kind: string; status: string; model: string }>('SELECT kind, status, model FROM call ORDER BY rowid');
  assert.deepEqual(metered.map((row) => `${row.kind}:${row.status}:${row.model}`), ['read:ok:small', 'propose:ok:small']);
  assert.equal(net.sent.length, 2);

  /* WHAT THE MODEL WAS SHOWN OF THE INDEX carries no open count, because a host reading the record through `list` cannot
     count non-terminal rows and a zero printed for an unknown is a figure in a prompt that nothing measured. */
  const drafting = JSON.parse(String(net.sent[0]!.init.body)) as { messages: { content: string }[] };
  assert.match(drafting.messages[1]!.content, /tasks \(2 rows\): what:text · amount:money · due:day · state:enum/u);
  assert.ok(!drafting.messages[1]!.content.includes('grant'), 'the vault register reached the prompt');

  sql.close();
  own.close();
});

test('A PREDICATE THE GRAMMAR REFUSES FALLS BACK ON THE RECORD\'S OWN SEARCH, which is the bridge\'s other read', async () => {
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, owner)).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Ring the bank', state: 'open' } }, owner)).ok);

  /* A FIELD THE REGISTER HAS NOT GOT: the package drops the predicate and keeps the keywords (`46 §5.4` step 5). */
  const answers = [
    '{"registers":["tasks"],"where":{"field":"nope","is":"x"},"q":"Invoice"}',
    '{"text":"One task mentions it: {{ref:tasks#1}}.","body_kind":"query","body":{},"flagged":false}',
  ];
  const net = endpoint(() => usedCompletion(answers.shift() ?? '{}', { prompt_tokens: 300, completion_tokens: 20 }));
  const slash = createSlash({
    sql: own,
    clock,
    inference: endpointInference({ url: 'http://localhost:11434/v1/chat/completions', send: net.send }),
    record: slashRecord(api),
  });

  const reading = await slash.read('Anything about the invoice?', owner);
  assert.ok(reading.ok, `refused: ${JSON.stringify(reading)}`);
  assert.equal(reading.value.predicate, null, 'an ungrammatical predicate reached the record');
  assert.equal(reading.value.q, 'Invoice');
  assert.deepEqual(reading.value.rows.map((row) => row.spoken), ['tasks#1']);
  assert.equal(reading.value.rows[0]!.summary, 'tasks#1 | Invoice Acme | open');
  assert.deepEqual(reading.value.read.at(0), { register: 'tasks', rows: 1, predicate: 'all' });

  const out = await slash.propose('Anything about the invoice?', owner, undefined, reading.value.ask_id);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  /* A `query` IS THE ANSWER AND NOT A QUESTION: nothing is filed, and the verbs are the view's. */
  assert.equal(out.value.body_kind, 'query');
  assert.equal(out.value.filed, null);
  assert.deepEqual(out.value.verbs, ['edit', 'save', 'open']);
  const waiting = (await api.boot(owner)) as { ok: boolean; value: { waiting: unknown[] } };
  assert.deepEqual(waiting.value.waiting, []);
  sql.close();
  own.close();
});

/* ── tier `b`: the owner's own key, named by the setting, and the owner's own model name (research-slash-routes K1) ─── */

/** Two live grants and a revoked one. `g_...HAD` is the host's `slash`-labelled key and `g_...HAE` is the one the owner names. */
const SLASH_GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWN_GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const GONE_GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const VAULT = [
  { id: SLASH_GRANT, label: 'slash', revoked_at: null },
  { id: OWN_GRANT, label: 'openai', revoked_at: null },
  { id: GONE_GRANT, label: 'anthropic', revoked_at: '2026-09-01T00:00:00.000Z' },
];
const keyOf = (id: string) => `fake-key-of-${id}`;
const bearer = (net: { sent: { init: RequestInit }[] }, i: number) => (net.sent[i]!.init.headers as Record<string, string>).authorization;

test('TIER b ASKS WITH THE KEY ITS SETTING NAMES AND THE MODEL ITS OWNER TYPED, and not the slash-labelled key or SLASH_MODEL', async () => {
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 22, 9));
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const what of ['Invoice Acme', 'Invoice Beta']) assert.ok((await api.create({ register: 'tasks', fields: { what, state: 'open' } }, owner)).ok);
  const answers = [
    '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}',
    '{"text":"Two tasks are open and {{ref:tasks#1}} is first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"what":"Chase {{ref:tasks#1}}"}]},"flagged":false}',
  ];
  const net = endpoint(() => usedCompletion(answers.shift() ?? '{}', { prompt_tokens: 700, completion_tokens: 60 }));
  const opened: string[] = [];
  const deps = { grants: () => VAULT, openKey: async (g: { id: string }) => (opened.push(g.id), keyOf(g.id)), send: net.send };
  const config = slashFromEnv({ SLASH_ENDPOINT: 'http://localhost:11434/v1/chat/completions', SLASH_MODEL: 'llama3' }, { operatorKey: false });
  const slash = createSlash({ sql: own, clock, inference: slashInferenceOf(config, deps)!, record: slashRecord(api) });

  /* NOTHING TO OPEN BEFORE THE OWNER NAMES A GRANT: the settings row starts with none, and `propose` then says so. */
  assert.equal(slashGrantIdOf(own), null);
  assert.equal(slashByokOf(config, deps, slashGrantIdOf(own)), undefined);

  assert.ok(slash.configure({ tier: 'b', model: 'gpt-4o-mini', grant_id: OWN_GRANT }, owner).ok);
  assert.equal(slashGrantIdOf(own), OWN_GRANT);
  const byok = slashByokOf(config, deps, slashGrantIdOf(own));
  assert.ok(byok, 'a named, live grant built no adapter');
  /* BUILDING IT OPENS NOTHING. The key is opened on the call, as the host's own path opens it, so a propose that finds no
     rows and calls no model is not a `grant.read` on the record. */
  assert.deepEqual(opened, []);

  const out = await slash.propose('Which tasks are open?', owner, byok);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  assert.equal(out.value.body_kind, 'rowset');
  assert.equal(net.sent.length, 2);
  /* THE DRAFTING CALL IS THE HOST'S, because the package drafts the predicate on its own inference on every tier
     (`propose.ts` hands `byok` to the proposal alone), so it goes with the `slash` key and `SLASH_MODEL`. */
  assert.equal(bearer(net, 0), `Bearer ${keyOf(SLASH_GRANT)}`);
  assert.equal(sentModel(net, 0), 'llama3');
  /* THE PROPOSAL IS THE OWNER'S: the grant the setting names, and the model name as the owner typed it. */
  assert.equal(bearer(net, 1), `Bearer ${keyOf(OWN_GRANT)}`);
  assert.equal(sentModel(net, 1), 'gpt-4o-mini');
  assert.deepEqual(opened, [SLASH_GRANT, OWN_GRANT]);
  assert.ok(!String(net.sent[1]!.init.body).includes(keyOf(OWN_GRANT)), 'the key went into what the model reads');

  /* A SHORT NAME THE OWNER TYPED IS STILL THE OWNER'S. `SLASH_MODEL` is the host's answer to its own tier `a` routing, and
     on the owner's key and bill it has no say: `glm-5.3` goes out as `glm-5.3`, where the host's path would send `llama3`. */
  await byok.complete(ask('glm-5.3'));
  assert.equal(sentModel(net, 2), 'glm-5.3');

  /* AN OPERATOR'S KEY DOES NOT STAND IN FOR THE OWNER'S: a self-host with `SLASH_KEY` set still sends the named grant. */
  const operated = slashByokOf({ ...config!, key: 'fake-operator-key' }, deps, OWN_GRANT)!;
  await operated.complete(ask('gpt-4o-mini'));
  assert.equal(bearer(net, 3), `Bearer ${keyOf(OWN_GRANT)}`);

  /* NO ADAPTER, AND SO THE PACKAGE'S OWN FORBIDDEN, for a grant that is revoked, one the vault never held, a host that
     cannot open keys, and a host with no endpoint. */
  assert.equal(slashByokOf(config, deps, GONE_GRANT), undefined);
  assert.equal(slashByokOf(config, deps, 'g_01JZ8QK3F7R2M9V4XN6TCB5HAG'), undefined);
  assert.equal(slashByokOf(config, { ...deps, openKey: null }, OWN_GRANT), undefined);
  assert.equal(slashByokOf(undefined, deps, OWN_GRANT), undefined);
  /* THE DRAFT IS QUEUED AGAIN BECAUSE THE REFUSAL COMES AFTER THE ROWS. The first writing of this line asked with the
     queue empty, the draft came back `{}`, the rules found no rows, and the package answered `ok` with `model: '-'`
     before it ever looked for a key (`propose.ts`: zero rows, zero inference). That was the package being right. */
  answers.push('{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}');
  const refused = await slash.propose('Which tasks are open?', owner, slashByokOf(config, deps, GONE_GRANT));
  assert.ok(!refused.ok && 'refusal' in refused, `answered: ${JSON.stringify(refused)}`);
  assert.equal(refused.refusal.code, 'FORBIDDEN');

  /* A GRANT REVOKED BETWEEN THE ADAPTER AND THE CALL, OR ONE THE HOST COULD NOT OPEN, SENDS NOTHING. The host's own path
     would go out with no `authorization` at all, which to a provider is an anonymous call on the owner's account. */
  const sent = net.sent.length;
  const shut = slashByokOf(config, { ...deps, openKey: async () => null }, OWN_GRANT)!;
  await assert.rejects(shut.complete(ask('gpt-4o-mini')), /could not be opened/u);
  let vault = VAULT;
  const revoking = slashByokOf(config, { ...deps, grants: () => vault }, OWN_GRANT)!;
  vault = VAULT.map((g) => (g.id === OWN_GRANT ? { ...g, revoked_at: '2026-09-22T09:00:00.000Z' } : g));
  await assert.rejects(revoking.complete(ask('gpt-4o-mini')), /could not be opened/u);
  assert.equal(net.sent.length, sent);

  sql.close();
  own.close();
});

test('NO ENDPOINT MEANS NEITHER PORT IS BUILT, so a keyless host keeps drafting with the rules', async () => {
  const net = endpoint(() => completion('{"drafts":[]}'));
  const deps = { grants: () => [], openKey: null, send: net.send };
  assert.equal(slashFromEnv({}), undefined);
  assert.equal(slashModelOf(slashFromEnv({}), deps), undefined);
  assert.equal(slashInferenceOf(slashFromEnv({}), deps), undefined);
  /* AND AN ENDPOINT WITH NO KEY ANYWHERE IS STILL NO MODEL on a host that cannot open the vault (`slashModelOf`'s rule). */
  const configured = slashFromEnv({ SLASH_ENDPOINT: 'http://localhost:11434/v1/chat/completions' }, { operatorKey: false });
  assert.equal(slashInferenceOf(configured, deps), undefined);
  assert.ok(slashInferenceOf(configured, { ...deps, openKey: async () => null }) !== undefined);
  assert.equal(net.sent.length, 0);
});

/**
 * A register that holds a key and a body of prose, which the bridge is supposed to carry neither of.
 *
 * THE KERNEL ALREADY REFUSES A SECRET AS A TITLE (`declare.ts`, "a secret says where a key is sealed, not what the row is
 * called"), so `summaryOf` cannot print one by reading `decl.title`. What is left to prove is the two drops themselves, and
 * they were the one claim in `slashRecord` with nothing behind it: `list` hands back the document's whole prose, measured
 * below, and the projection is what a prompt is built from.
 */
const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true },
      { id: 'opens', type: 'text' },
      { id: 'notes', type: 'document' },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

test('A SECRET AND A DOCUMENT REACH NEITHER THE ROWS NOR THE INDEX, so neither can reach a prompt', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([KEYS])).ok);
  const prose = 'The rotation runbook, at length, and a long way past what a token cap would carry.';
  assert.ok((await api.create({ register: 'credentials', fields: { label: 'Stripe', opens: 'api.stripe.test', notes: prose } }, owner)).ok);

  /* WHAT THE RECORD'S OWN `list` HANDS BACK, measured: the document's whole body is in the row, so the drop is this bridge's. */
  const listed = (await api.list({ register: 'credentials', limit: 5 }, owner)) as { ok: boolean; value: { rows: { fields: Record<string, unknown> }[] } };
  assert.equal(listed.value.rows[0]!.fields['notes'], prose);

  const projected = await slashRecord(api).project({ registers: ['credentials'], budget: { tokens: 6000 } }, owner);
  assert.ok(projected.ok);
  assert.deepEqual(projected.value.rows[0]!.fields, { label: 'Stripe', opens: 'api.stripe.test' });
  assert.equal(projected.value.rows[0]!.summary, 'credentials#1 | Stripe');
  const shown = projected.value.index.registers.find((r) => r.id === 'credentials');
  assert.deepEqual(shown!.fields.map((f) => f.id), ['label', 'opens']);
  assert.ok(!JSON.stringify(projected.value).includes('runbook'), 'the document reached the projection');
  sql.close();
});
