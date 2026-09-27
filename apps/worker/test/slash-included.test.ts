/**
 * The included model on the Worker: Workers AI through `aiInference`, as Slash's model when no endpoint is configured
 * (`loop/research-living-in-it.md` section 7, W56-2).
 *
 * WHAT WAS THERE BEFORE THIS FILE. `src/inference.ts` passed its own 17 tests and nothing imported it, so with `AI` bound
 * and `SLASH_ENDPOINT` empty the survey's probe answered `"no model"`: `/api/version` said `slash: false` on the Cloud and
 * the palette drew no Slash row, while the binding sat declared in both environments.
 *
 * DARK UNTIL HE SAYS SO, AND THE BINDING IS NOT THE SWITCH. The brief was written as though `ai` were still to be bound,
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

/** The production environment's Slash vars as `wrangler.jsonc` declared them until 24 September, when he switched the
    included model on (`SLASH_INCLUDED: yes` in both environments), over a fake binding. */
const shipped = (ai: ReturnType<typeof fakeAi>) => ({ SLASH_ENDPOINT: '', AI: ai.AI, AI_GATEWAY: 'braindog' });
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
  assert.equal(workerSlashModel({ SLASH_ENDPOINT: '', SLASH_INCLUDED: 'yes' }, noGrants), undefined);
  assert.equal(ai.runs.length, 0);
  deps.sql.close();
});

test('SWITCHED ON WITH NO ENDPOINT, the record has a model named included, and one draft is one run on glm-5.3-flash', async () => {
  const ai = fakeAi(['{"drafts":[]}', '{"plan":{}}']);
  const model = workerSlashModel(switchedOn(ai), noGrants);
  /* RED AT HEAD: `undefined`, the survey's `"no model"`. */
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

test('HIS OWN ENDPOINT WINS: with SLASH_ENDPOINT set as well, the fake AI never runs and the POST goes to the endpoint', async () => {
  const ai = fakeAi([]);
  const posted: string[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), SLASH_ENDPOINT: URL_, KEK: FAKE_KEK }, noGrants, {
    send: async (url, _init) => (posted.push(String(url)), new Response('{"drafts":[]}', { status: 200 })),
    open: () => async () => null,
  });
  assert.equal(model?.name, 'endpoint');
  await model.draft({ usage: {} } as never);
  assert.deepEqual(posted, [URL_]);
  assert.equal(ai.runs.length, 0, 'the included model ran on a Worker that names its own endpoint');
  /* AND AN ENDPOINT WITH NO `KEK` IS NO MODEL, NOT THE INCLUDED ONE: `slash.ts` says falling through there would answer his
     asks on the account's neurons while he believes they go to his own provider. The checker added this line because no
     case held it: with `workerSlashModel` falling back to `includedModel` after an endpoint that built nothing, all passed. */
  assert.equal(workerSlashModel({ ...switchedOn(ai), SLASH_ENDPOINT: URL_ }, noGrants), undefined, 'a keyless endpoint fell through to the included model');
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

/* HIS OWN ENDPOINT WINS ON THE ENGINE TOO, and not only on the record's model. The checker measured the engine's choice
   unpinned: with `workerSlashEngine` taking the included model first whenever it is on, every case stayed green, and a
   version of this case driven through `workerSlashDoor` stayed green as well, because the door hands every ask the
   asker's endpoint inference and so hides the engine's own. The engine is therefore asked here with no door around it. */
test("HIS OWN ENDPOINT WINS ON THE ENGINE: with both set, the engine's own model is the endpoint and the fake AI never runs", async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 23, 9));
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const own = openSqlite();
  const ai = fakeAi([]);
  const posted: string[] = [];
  const engine = await workerSlashEngine({ ...switchedOn(ai), SLASH_ENDPOINT: URL_, KEK: FAKE_KEK }, () => api, {
    sql: own,
    clock,
    send: async (url, _init) => (posted.push(String(url)), new Response('', { status: 503 })),
    open: () => async () => null,
  });
  assert.ok(engine);
  await engine.propose('Which tasks are open?', OWNER);
  assert.ok(posted.length > 0, 'nothing went to the endpoint');
  assert.equal(ai.runs.length, 0, 'the included model ran on a Worker that names its own endpoint');
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
