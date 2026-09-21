/**
 * Spark on the Worker (`src/spark.ts`): the person's own key from the vault, through the same port as the self-host, and the
 * daily look. The endpoint is a test double and every key an obviously fake value; nothing leaves the machine.
 *
 * AND THE THIRTEENTH PACKAGE, `@braindog/spark`, driven through both hosts' builders at the bottom of this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { sparkLook, workerSparkEngine, workerSparkModel } from '../src/spark.ts';

const URL_ = 'https://gateway.example.test/v1/chat/completions';
const FAKE_KEK = '0'.repeat(64);
const FAKE_PERSON_KEY = 'fake-person-key-for-tests-only';

const net = () => {
  const sent: RequestInit[] = [];
  return { sent, send: async (_u: URL, init: RequestInit) => (sent.push(init), new Response('{"drafts":[]}', { status: 200 })) };
};

test('NO ENDPOINT OR NO KEK, NO MODEL: a hosted record says spark: false and the rules draft', () => {
  const api = () => ({ kernel: { grants: () => [] } }) as never;
  assert.equal(workerSparkModel({}, api), undefined);
  assert.equal(workerSparkModel({ SPARK_ENDPOINT: URL_ }, api), undefined, 'a model was built with no way to open a key');
  assert.equal(workerSparkModel({ SPARK_ENDPOINT: '', KEK: FAKE_KEK }, api), undefined);
});

test("THE PERSON'S OWN KEY, labelled spark in the vault, is opened on each call and sent only as the call's authorization", async () => {
  const opened: string[] = [];
  let grants = [
    { id: 'g_old', label: 'spark', revoked_at: '2026-09-01T00:00:00.000Z' },
    { id: 'g_other', label: 'example read', revoked_at: null },
  ];
  const api = () => ({ kernel: { grants: () => grants } }) as never;
  const wire = net();
  const model = workerSparkModel({ SPARK_ENDPOINT: URL_, SPARK_MODEL: 'small', KEK: FAKE_KEK }, api, {
    send: wire.send,
    open: () => async (grant) => (opened.push(grant.id), FAKE_PERSON_KEY),
  });
  assert.ok(model);

  /* NO LIVE SPARK KEY YET: called with none, and nothing opened. An operator key is never read here, even when set. */
  await model.draft({} as never);
  assert.deepEqual(opened, []);
  assert.equal((wire.sent[0]!.headers as Record<string, string>).authorization, undefined);

  /* A KEY PUT IN AFTER BOOT COUNTS ON THE NEXT CALL. */
  grants = [...grants, { id: 'g_new', label: 'spark', revoked_at: null }];
  await model.draft({ usage: {} } as never);
  assert.deepEqual(opened, ['g_new']);
  assert.equal((wire.sent[1]!.headers as Record<string, string>).authorization, `Bearer ${FAKE_PERSON_KEY}`);
  const body = String(wire.sent[1]!.body);
  assert.ok(!body.includes(FAKE_PERSON_KEY), 'the key went into what the model reads');
  assert.equal((JSON.parse(body) as { model: string }).model, 'small');

  const env = { SPARK_ENDPOINT: URL_, KEK: FAKE_KEK, SPARK_KEY: 'fake-operator-key' } as never;
  const hosted = workerSparkModel(env, api, { send: wire.send, open: () => async () => FAKE_PERSON_KEY });
  await hosted!.draft({} as never);
  assert.equal((wire.sent[2]!.headers as Record<string, string>).authorization, `Bearer ${FAKE_PERSON_KEY}`, 'an operator key was used on a hosted record');
});

test('THE DAILY LOOK runs once a day on a real record and never throws out of an alarm', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 17, 12));
  const api = await createRecordApi({ sql, clock });
  await sparkLook(api);
  assert.equal(api.kernel.prefsOf('spark')['spark.last'], '2026-09-17');
  assert.deepEqual(await api.sparkTick(), { ran: false, why: 'today' });
  await sparkLook({ sparkTick: async () => { throw new Error('offline'); } } as never);
  sql.close();
});

/* ── the thirteenth package, reached from both hosts ──────────────────────────────────────────────────────────────────── */

/**
 * `@braindog/spark` DRIVEN THROUGH EACH HOST'S OWN BUILDER, and the self-host's imported here beside the Worker's on purpose.
 *
 * THE CLAIM IS THAT THE TWO HOSTS AGREE, and a test that drives one of them cannot make it. `1f85a49a` settled that the
 * package is a second feature under one name rather than a newer version of the host's, and the thing that would then go
 * wrong quietly is one host reaching the engine while the other still answers from the rules. So both builders are asked the
 * same question against the same shape of record in one place, which is the assertion two separate files could not carry.
 *
 * THE RECORD IS REAL AND THE MODEL IS NOT. The rows go in through `api.create`, the projection comes back through the
 * record's own guarded reads, and the proposal lands on the record's Decide; only the endpoint is a double, because what is
 * under test is the wiring and a live call would be slow, paid for and differently wrong every run.
 */

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    /* A REGISTER IS SEARCHED ON THE FIELDS IT NAMES: `packages/host` measured that a titled row in a register declaring no
       `search:` line comes back from `search` as no rows at all, and the keyword fallback is one of the two reads here. */
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

const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };

/** Pass 1 drafts the predicate, pass 2 writes the one cited proposal: `46 §5.4`'s two calls, in that order. */
const ANSWERS = (): string[] => [
  '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}',
  '{"text":"Two tasks are open and {{ref:tasks#1}} falls due first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"what":"Chase {{ref:tasks#1}}"}]},"flagged":false}',
];

/** An endpoint that answers each queued completion once, with the token counts the meter bills. */
const modelDouble = () => {
  const queue = ANSWERS();
  const sent: RequestInit[] = [];
  return {
    sent,
    send: async (_url: URL, init: RequestInit) => {
      sent.push(init);
      const content = queue.shift() ?? '{}';
      return new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }),
        { status: 200 },
      );
    },
  };
};

/** Two open rows on a real record, which is what a projection and a citation are then about. */
const twoOpenTasks = async (clock: { now: () => number }) => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok, 'the register was not installed');
  for (const fields of [
    { what: 'Invoice Acme', amount: { amount: 500500, currency: 'EGP' }, due: '2026-10-01', state: 'open' },
    { what: 'Invoice Beta', amount: { amount: 120000, currency: 'EGP' }, due: '2026-10-08', state: 'open' },
  ])
    assert.ok((await api.create({ register: 'tasks', fields }, OWNER)).ok, 'the row was not written');
  return { sql, api };
};

test("A REAL ASK REACHES THE PACKAGE'S ENGINE THROUGH THE WORKER'S OWN BUILDER, and its answer lands on the record's Decide", async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const { sql, api } = await twoOpenTasks(clock);
  const own = openSqlite();
  const wire = modelDouble();

  const engine = await workerSparkEngine({ SPARK_ENDPOINT: URL_, SPARK_MODEL: 'small', KEK: FAKE_KEK }, () => api, {
    sql: own,
    clock,
    send: wire.send,
    open: () => async () => FAKE_PERSON_KEY,
  });
  assert.ok(engine, 'a configured Worker built no engine');

  const out = await engine.propose('Which tasks are open?', OWNER);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  assert.equal(out.value.body_kind, 'rowset');
  assert.deepEqual(out.value.citations, ['tasks#1']);
  assert.match(String(out.value.filed), /^SG[0-9]+$/u, 'nothing was filed on the record');
  /* THE FOLD'S LAST LINE IS THE VAULT, REFUSED, on every ask (`46 §4.2`), which is the boundary showing in the output. */
  assert.deepEqual(out.value.read.at(-1), { register: 'grant', rows: 0, predicate: 'refused' });

  /* THE QUESTION IS ON THE REAL RECORD'S DECIDE. */
  const boot = (await api.boot(OWNER)) as { ok: boolean; value: { waiting: { id: string }[] } };
  assert.ok(boot.ok);
  assert.equal(boot.value.waiting.length, 1);
  assert.equal(boot.value.waiting[0]!.id, out.value.filed);

  /* AND THE ANSWER CAME FROM THE PACKAGE'S ENGINE AND NOT FROM THE RULES: two rows in Spark's OWN meter, and the record's
     own Spark still modelless, so nothing here could have come from `SparkModel.draft`. */
  assert.deepEqual(
    own.all<{ kind: string; status: string }>('SELECT kind, status FROM call ORDER BY rowid').map((r) => `${r.kind}:${r.status}`),
    ['read:ok', 'propose:ok'],
  );
  const reading = (await api.spark({}, OWNER)) as { ok: boolean; value: { model: string | null } };
  assert.equal(reading.value.model, null);

  /* THE WIRE SAYS WHICH PORT SPOKE. `json_schema` with `strict` is `endpointInference`'s request and `endpointModel` never
     sends it: the record's model asks for a bare `json_object`. And `small` is this deployment's id standing in for the short
     name `glm-5.3-flash` the package's routing table asked for (`46 §2`), which is the mapping living in the host. */
  assert.equal(wire.sent.length, 2);
  const asked = JSON.parse(String(wire.sent[0]!.body)) as { model: string; response_format: { type: string; json_schema: { strict: boolean } } };
  assert.equal(asked.response_format.type, 'json_schema');
  assert.equal(asked.response_format.json_schema.strict, true);
  assert.equal(asked.model, 'small');
  /* NO KEY ON THE CALL, because this record's vault holds no live grant labelled `spark`. What a grant that IS there does is
     the test above, over the same `wireOf` these two builders share, so it is not driven twice through the slower path. */
  assert.equal((wire.sent[0]!.headers as Record<string, string>).authorization, undefined);

  sql.close();
  own.close();
});

test("AND THE SAME ASK REACHES IT THROUGH THE SELF-HOST'S BUILDER, over the operator's key", async () => {
  const { sparkEngineFor } = await import('../../selfhost/src/spark.ts');
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const { sql, api } = await twoOpenTasks(clock);
  const own = openSqlite();
  const wire = modelDouble();

  const engine = await sparkEngineFor(
    { url: 'http://localhost:11434/v1/chat/completions', key: 'fake-operator-key', send: wire.send },
    () => api,
    undefined,
    { sql: own, clock },
  );
  assert.ok(engine, 'a configured self-host built no engine');

  const out = await engine.propose('Which tasks are open?', OWNER);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  assert.equal(out.value.body_kind, 'rowset');
  assert.deepEqual(out.value.citations, ['tasks#1']);
  assert.match(String(out.value.filed), /^SG[0-9]+$/u, 'nothing was filed on the record');

  /* FILED AS `spark`, which is the one actor this package's single write is allowed to be (`30 §3`). */
  const queue = (await api.governance({ limit: 5 }, OWNER)) as { ok: boolean; value: { body_kind: string; opened_by: string }[] };
  assert.ok(queue.ok);
  assert.equal(queue.value[0]!.body_kind, 'rowset');
  assert.equal(queue.value[0]!.opened_by, 'spark');
  assert.equal((wire.sent[0]!.headers as Record<string, string>).authorization, 'Bearer fake-operator-key');

  sql.close();
  own.close();
});

test('THE KEYLESS PATH BUILDS NO ENGINE EITHER, so a host with nothing configured keeps drafting with the rules', async () => {
  const deps = { sql: openSqlite(), clock: fixedClock(0) };
  const api = () => ({ kernel: { grants: () => [] } }) as never;
  assert.equal(await workerSparkEngine({}, api, deps), undefined);
  /* AN ENDPOINT WITH NO WAY TO OPEN A KEY IS STILL NOTHING, which is the rule `/api/version`'s own flag follows. */
  assert.equal(await workerSparkEngine({ SPARK_ENDPOINT: URL_ }, api, deps), undefined);
  const { sparkEngineFor } = await import('../../selfhost/src/spark.ts');
  assert.equal(await sparkEngineFor(undefined, api, undefined, deps), undefined);
  deps.sql.close();
});

/**
 * AND THE REFUSAL COMES BEFORE THE LOAD, HELD AS TEXT BECAUSE NOTHING INSIDE THIS PROCESS CAN SEE IT.
 *
 * Both builders say in prose that reversing those two lines would keep the feature working and lose the property, and that
 * is measured rather than supposed: with `await import('@braindog/spark')` moved above the refusal in both files, the six
 * tests above stay green, all six, because a builder that returns `undefined` after evaluating the module returns the same
 * `undefined`. Node evaluates an ES module once and offers no way to ask a running process which modules it holds, and the
 * two tests above have already loaded this one, so no later test in this file could observe the difference. `46 §5.1` is
 * about the load and not about the answer, so the order of the bytes is the only place the claim is checkable here.
 *
 * THE BUNDLE IS THE OTHER HALF AND IT IS NOT THIS FILE'S. What a keyless deployment actually ships is `wrangler`'s output,
 * which this test process never builds; this holds the source property that makes that output possible.
 */
test('NEITHER BUILDER LOADS THE PACKAGE BEFORE IT HAS DECIDED IT NEEDS IT', () => {
  for (const file of ['../src/spark.ts', '../../selfhost/src/spark.ts']) {
    const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    const refused = src.indexOf('if (inference === undefined) return undefined;');
    const loaded = src.indexOf("await import('@braindog/spark')");
    assert.ok(refused !== -1, `${file}: no builder refuses on an endpoint that built no inference`);
    assert.ok(loaded !== -1, `${file}: the package is not loaded dynamically at all`);
    assert.ok(loaded > refused, `${file}: the package is loaded at line ${src.slice(0, loaded).split('\n').length}, before the refusal`);
  }
});
