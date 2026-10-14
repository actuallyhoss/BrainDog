/**
 * The included model on the Worker: Workers AI through `aiInference`, as Slash's model when no endpoint is configured.
 *
 * WHAT WAS THERE BEFORE THIS FILE. `src/inference.ts` passed its own 17 tests and nothing imported it, so with `AI` bound
 * and `SLASH_ENDPOINT` empty a probe answered `"no model"`: `/api/version` said `slash: false` on the Cloud and
 * the palette drew no Slash row, while the binding sat declared in both environments.
 *
 * DARK UNTIL HE SAYS SO, AND THE BINDING IS NOT THE SWITCH. It is easy to read `ai` as still to be bound,
 * and it is not: `wrangler.jsonc` binds `AI` in alpha and in production, and `deploy.yml` deploys production on every green
 * `ci` on `master`. Keyed on the binding alone, the commit carrying this file would have started spending his account's
 * Workers AI at its first deploy. So the included model needs `SLASH_INCLUDED` set to `yes` as well, a var no environment
 * declares, and the first case below is the state `wrangler.jsonc` ships.
 *
 * THE BINDING IS A LOCAL FUNCTION AND SO IS THE ENDPOINT. No test here spends a neuron or leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { workerSlashAnswers, workerSlashDoor, workerSlashEngine, workerSlashModel } from '../src/slash.ts';

const URL_ = 'https://gateway.example.test/v1/chat/completions';
const FAKE_KEK = '0'.repeat(64);
const FLASH = '@cf/zai-org/glm-5.3-flash';
const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };
const ASK = { run: 'run_1', step: 0, rule: 'rate', question: 'What rate applies?', shape: 'number' as const };

type Run = { model: string; inputs: Record<string, unknown>; options: unknown };

/** Workers AI's `run`, answering each queued completion once in the chat shape `glm-5.3-flash` answers in. */
const fakeAi = (answers: string[]) => {
  const runs: Run[] = [];
  return {
    runs,
    AI: {
      run: async (model: string, inputs: Record<string, unknown>, options?: unknown) => {
        runs.push({ model, inputs, options });
        const content = answers.shift() ?? '{}';
        return { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 700, completion_tokens: 60 } };
      },
    },
  };
};

/** The production environment's Slash vars as `wrangler.jsonc` declared them until he switched the
    included model on (`SLASH_INCLUDED: yes` in both environments), over a fake binding. */
const shipped = (ai: ReturnType<typeof fakeAi>) => ({ AI: ai.AI, AI_GATEWAY: 'braindog' });
/** And the same with the included model switched on. */
const switchedOn = (ai: ReturnType<typeof fakeAi>) => ({ ...shipped(ai), SLASH_INCLUDED: 'yes' });

const noGrants = () => ({ kernel: { grants: () => [] } }) as never;

test('DARK AS SHIPPED: AI bound and SLASH_INCLUDED unset is no model, no engine, no answer and no run', async () => {
  const ai = fakeAi([]);
  const deps = { sql: openSqlite(), clock: fixedClock(0) };
  assert.equal(workerSlashModel(shipped(ai), noGrants), undefined, 'the binding alone turned the included model on');
  assert.equal(await workerSlashEngine(shipped(ai), noGrants, deps), undefined);
  assert.equal(workerSlashAnswers(shipped(ai), noGrants, deps), undefined);
  assert.equal(await workerSlashDoor(shipped(ai), noGrants, deps, new Set()).engine!(), undefined);
  /* AND THE SWITCH WITHOUT THE BINDING IS NOTHING EITHER, which is a deploy that forgot `ai`. */
  assert.equal(workerSlashModel({ SLASH_INCLUDED: 'yes' }, noGrants), undefined);
  assert.equal(ai.runs.length, 0);
  deps.sql.close();
});

test('SWITCHED ON WITH NO ENDPOINT, the record has a model named included, and one draft is one run on glm-5.3-flash', async () => {
  const ai = fakeAi(['{"drafts":[]}', '{"plan":{}}']);
  const model = workerSlashModel(switchedOn(ai), noGrants);
  /* RED BEFORE THIS: `undefined`, the probe's `"no model"`. */
  assert.equal(model?.name, 'included');

  assert.deepEqual(await model.draft({ usage: {} } as never), { drafts: [] });
  assert.equal(ai.runs.length, 1);
  assert.equal(ai.runs[0]!.model, FLASH);
  /* `collectLog: false` IS WHAT KEEPS A RECORD'S OWN SENTENCES OUT OF THE GATEWAY'S LOG (`inference.ts` `through`). */
  assert.deepEqual(ai.runs[0]!.options, { gateway: { id: 'braindog', collectLog: false } });
  const messages = ai.runs[0]!.inputs['messages'] as { role: string; content: string }[];
  assert.deepEqual(messages.map((m) => m.role), ['system', 'user']);
  assert.match(messages[0]!.content, /^You are Slash, the manager of one BrainDog/u);

  /* THE FIRST PLAN GOES THE SAME WAY, told the plan's instructions and not the drafts'. */
  assert.deepEqual(await model.form!({ what: 'a plan', said: 'a shop', today: '2026-09-23', lists: [] } as never), { plan: {} });
  assert.equal(ai.runs.length, 2);
  assert.match((ai.runs[1]!.inputs['messages'] as { content: string }[])[0]!.content, /has just said what they are starting/u);
});

test("AN AUTOMATION'S QUESTION IS ANSWERED WITH NO VAULT GRANT, because the included model opens no key", async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 23, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const ai = fakeAi(['{"answer":4.25}']);
  const answer = workerSlashAnswers(switchedOn(ai), () => api, { sql: own, clock });
  assert.ok(answer, 'a Worker with the included model built no answer');
  const out = await answer(ASK);
  /* THE ENDPOINT'S RULE WOULD HAVE REFUSED THIS `FORBIDDEN`, "holds no key labelled slash", before anything was built. */
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(ai.runs.length, 1);
  assert.equal(ai.runs[0]!.model, FLASH);
  sql.close();
  own.close();
});

/* ── his own key, chosen in Slash's own store ───────────────────────────────────────────────────────────────────────── */

const GRANT = '01M33H56ZCMM62YT38ARN8JRM8';
const HIS_TOKEN = 'provider-token-for-this-test';
/** His vault, as the host reads it: one live API token, the one he picked. */
const hisVault = () => ({ kernel: { grants: () => [{ id: GRANT, label: 'model provider', kind: 'api_token', revoked_at: null }] } }) as never;

/** Slash's own store with his key chosen: the two tables `slashOwnKeyOf` reads, written as the package writes them. */
const chosen = (provider: 'anthropic' | 'openai' = 'openai') => {
  const store = openSqlite();
  store.exec('CREATE TABLE slash_settings (singleton INTEGER PRIMARY KEY, tier TEXT, model TEXT, grant_id TEXT, ask_cap INTEGER, updated_at TEXT)');
  store.exec('CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT)');
  store.exec("INSERT INTO slash_settings VALUES (1, 'b', 'his-model', ?, 80, '2026-09-23T09:00:00.000Z')", GRANT);
  store.exec("INSERT INTO slash_meta VALUES ('own.provider', ?), ('own.base_url', ?)", provider, URL_.replace('/chat/completions', ''));
  return store;
};

test('HIS OWN KEY WINS ON THE PRESS: with his key chosen, the included model never runs and the POST carries his key', async () => {
  const ai = fakeAi(['{"drafts":[]}']);
  const store = chosen();
  const sent: { url: string; authorization: string | null; model: unknown }[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisVault, {
    store: () => store,
    send: async (url, init) => (
      sent.push({ url: String(url), authorization: new Headers(init.headers).get('authorization'), model: (JSON.parse(String(init.body)) as { model: unknown }).model }),
      new Response(JSON.stringify({ choices: [{ message: { content: '{"drafts":[]}' } }] }), { status: 200 })
    ),
    open: () => async () => HIS_TOKEN,
  });
  assert.equal(model?.name, 'your key');
  await model.draft({ usage: {} } as never);
  assert.deepEqual(sent, [{ url: URL_, authorization: `Bearer ${HIS_TOKEN}`, model: 'his-model' }]);
  assert.equal(ai.runs.length, 0, 'the included model ran for a record set to its own key');

  /* AND BACK ON THE INCLUDED MODEL, THE SAME MODEL OBJECT ASKS IT: the choice is read on each press, not when the object opened. */
  store.exec("UPDATE slash_settings SET tier = 'a' WHERE singleton = 1");
  assert.equal(model.name, 'included');
  await model.draft({ usage: {} } as never);
  assert.equal(ai.runs.length, 1);
  assert.equal(sent.length, 1);
  store.close();
});

test('A KEY THAT WILL NOT OPEN SENDS NOTHING, and the included model is not asked in its place', async () => {
  const ai = fakeAi([]);
  const store = chosen();
  const sent: string[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisVault, {
    store: () => store,
    send: async (url) => (sent.push(String(url)), new Response('{}', { status: 200 })),
    open: () => async () => null,
  });
  await assert.rejects(model!.draft({ usage: {} } as never), /did not open/u);
  assert.deepEqual(sent, [], 'a call went out with no key');
  assert.equal(ai.runs.length, 0);
  store.close();
});

test('HIS KEY ON ANTHROPIC IS ASKED IN MESSAGES: x-api-key, the version header, and no bearer', async () => {
  const ai = fakeAi([]);
  const store = chosen('anthropic');
  store.exec("UPDATE slash_meta SET value = 'https://api.anthropic.example.test' WHERE key = 'own.base_url'");
  const sent: { url: string; headers: Headers }[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisVault, {
    store: () => store,
    send: async (url, init) => (
      sent.push({ url: String(url), headers: new Headers(init.headers) }),
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{"drafts":[]}' }], usage: { input_tokens: 3, output_tokens: 2 } }), { status: 200 })
    ),
    open: () => async () => HIS_TOKEN,
  });
  assert.deepEqual(await model!.draft({ usage: {} } as never), { drafts: [] });
  assert.equal(sent[0]?.url, 'https://api.anthropic.example.test/v1/messages');
  assert.equal(sent[0]?.headers.get('x-api-key'), HIS_TOKEN);
  assert.equal(sent[0]?.headers.get('anthropic-version'), '2023-06-01');
  assert.equal(sent[0]?.headers.get('authorization'), null);
  store.close();
});

/**
 * THE ASK IS BILLED ON TIER `a`, WHICH IS WHAT THE MONTHLY CAP READS. The package prices a ledger row by looking its
 * `model` up in its own `MODELS`, keyed by routing name (`packages/slash/src/call.ts` `account`), and reads that name off
 * the reply (`nameIn`). `aiInference` answers the provider id, `@cf/zai-org/glm-5.3-flash`, which `MODELS` does not hold,
 * so handing its `model` through bills every row at 0 neurons: measured by making exactly that change, this case reads
 * `[0, 0]` where it expects `[12, 12]`. 700 tokens in and 60 out at 13,636 and 45,455 a million is 12.3, rounded to 12.
 */
test('THE DOOR BUILDS THE INCLUDED ENGINE, and each call is a ledger row billed in neurons under glm-5.3-flash', async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 23, 9));
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok, 'the register was not installed');
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, OWNER)).ok);
  const own = openSqlite();
  const ai = fakeAi([
    '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}',
    '{"text":"One task is open, {{ref:tasks#1}}.","body_kind":"rowset","body":{"register":"tasks","rows":[{"fields":{"what":"Chase the first"},"from":["tasks#1"]}]},"flagged":false}',
  ]);
  const door = workerSlashDoor(switchedOn(ai), () => api, { sql: own, clock }, new Set());
  const engine = await door.engine!();
  assert.ok(engine, 'the door built no engine over the included model');
  const out = await engine.propose('Which tasks are open?', OWNER);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  assert.equal(ai.runs.length, 2);
  assert.deepEqual(
    own.all<{ kind: string; tier: string; model: string; neurons: number }>('SELECT kind, tier, model, neurons FROM slash_call ORDER BY rowid').map((r) => ({ ...r })),
    [
      { kind: 'read', tier: 'a', model: 'glm-5.3-flash', neurons: 12 },
      { kind: 'propose', tier: 'a', model: 'glm-5.3-flash', neurons: 12 },
    ],
  );
  sql.close();
  own.close();
});

test('THE PER-CALL CEILING REFUSES A RUNAWAY BEFORE THE RUN: a reading too large to send is no run, and the rules speak', async () => {
  const ai = fakeAi([]);
  const model = workerSlashModel(switchedOn(ai), noGrants);
  assert.ok(model);
  /* ABOUT 200,000 TOKENS IN, which at 13,636 neurons a million is some 2,700 before a token comes out. */
  await assert.rejects(model.draft({ usage: { note: 'x'.repeat(800_000) } } as never), /neurons and its ceiling is 232/u);
  assert.equal(ai.runs.length, 0, 'a call over the ceiling reached the binding');
});

/**
 * A BAD ANSWER FROM THE INCLUDED MODEL WAS BILLED, SO IT IS COUNTED AND NOT ASKED AGAIN. `aiInference` answers prose as a
 * `PROPOSAL_SCHEMA` refusal, which the adapter turns into `SlashAnsweredError` so the package settles the row under the
 * model's name and ends the run. The checker measured this unpinned: with that branch replaced by a plain throw, every case
 * in `slash*.test.ts` stayed green, while the row went to `-` as `UNREACHABLE` and the ladder would have asked the model up
 * to its eighth rung, spending neurons on each and counting none of them against `ask_cap`.
 */
test('A BAD ANSWER IS BILLED AND ENDS THE RUN: prose from the included model is ANSWER_UNREADABLE, one run, one row priced', async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 23, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const ai = fakeAi(['The rate is about four and a quarter.']);
  const answer = workerSlashAnswers(switchedOn(ai), () => api, { sql: own, clock });
  assert.ok(answer);
  const out = await answer(ASK);
  assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : 'not refused', 'ANSWER_UNREADABLE', JSON.stringify(out));
  assert.equal(ai.runs.length, 1);
  assert.deepEqual(
    own.all<{ model: string; tokens_in: number; tokens_out: number; neurons: number }>('SELECT model, tokens_in, tokens_out, neurons FROM slash_call').map((r) => ({ ...r })),
    [{ model: 'glm-5.3-flash', tokens_in: 700, tokens_out: 60, neurons: 12 }],
  );
  sql.close();
  own.close();
});

/* AN AUTOMATION'S QUESTION GOES TO HIS KEY TOO, signed by the rule, and
   neither the included model nor the operator's ceiling is in it. The record's vault is his, seen through a view whose
   `grants` holds the one key he picked, because this suite seals no key. */
test("ON HIS OWN KEY AN AUTOMATION'S QUESTION IS ANSWERED THERE: one POST with his key, no run of the included model", async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 23, 9));
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const withKey = Object.create(api, {
    kernel: { value: Object.create(api.kernel, { grants: { value: () => [{ id: GRANT, label: 'model provider', kind: 'api_token', revoked_at: null }] } }) },
  }) as typeof api;
  const own = openSqlite();
  const ai = fakeAi([]);
  const sent: { url: string; authorization: string | null }[] = [];
  const opened: (string | undefined)[] = [];
  const deps = {
    sql: own,
    clock,
    send: async (url: URL, init: RequestInit) => (
      sent.push({ url: String(url), authorization: new Headers(init.headers).get('authorization') }),
      new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":4.25}' } }], usage: { prompt_tokens: 9, completion_tokens: 3 } }), { status: 200 })
    ),
    open: (_api: unknown, actor?: string) => (opened.push(actor), async () => HIS_TOKEN),
  };
  /* THE ENGINE BUILDS SLASH'S TABLES, and his choice is then written into them as Settings would save it. */
  assert.ok(await workerSlashEngine({ ...switchedOn(ai), KEK: FAKE_KEK }, () => withKey, deps));
  own.exec("UPDATE slash_settings SET tier = 'b', model = 'his-model', grant_id = ? WHERE singleton = 1", GRANT);
  own.exec("INSERT INTO slash_meta (key, value) VALUES ('own.provider', 'openai'), ('own.base_url', 'https://gateway.example.test/v1')");

  const answer = workerSlashAnswers({ ...switchedOn(ai), KEK: FAKE_KEK }, () => withKey, deps);
  assert.ok(answer);
  const out = await answer(ASK);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(sent, [{ url: URL_, authorization: `Bearer ${HIS_TOKEN}` }]);
  assert.deepEqual(opened, ['rule:rate'], "his key was opened for somebody other than the rule that asked");
  assert.equal(ai.runs.length, 0, 'the included model ran for a record set to its own key');
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
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};
