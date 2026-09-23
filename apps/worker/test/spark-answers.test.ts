/**
 * The Worker answers an automation's question to Spark: Brief E of the wave forty-seven survey of the Worker's half
 * (`research-worker-spark.md` §5). The self-host's half is `apps/selfhost/test/spark-answers.test.ts`.
 *
 * WHAT STOOD BETWEEN THE TWO HALVES ON THIS HOST. `Record$.#open` passed no `answersSpark`, so a Worker with an endpoint
 * and `KEK` said `spark: true` at `/api/version` and refused `ask_spark` at propose in the words "no host in this build
 * answers an automation's question to Spark", and nothing in `alarm()` would have asked a queued question if it had.
 *
 * RED BEFORE THE WIRING, MEASURED ON 23 SEPTEMBER with `src/` as it stood at `afe656eb`: ten tests, two pass, seven fail,
 * one todo. The filing case read `NOT_IN_THIS_BUILD` where it expects `null`, and the answered, spent-month, no-key,
 * unread-answer and seven-question cases failed at the same filing. The secret case's propose was ALREADY refused
 * `DECLARATION_INVALID` before the wiring, not `NOT_IN_THIS_BUILD` as the survey expected, because the lint runs before
 * the switch; it went red at its second half, zero posts for the rule stored past the lint. The Worker with no `KEK` and
 * the pump's list passed before and after, which is their job: they are the lines the wiring must not cross.
 *
 * AND EACH LINE OF THE WIRING WAS TAKEN OUT AGAIN, ONE AT A TIME, TO SEE WHICH CASE HOLDS IT. The pass skipped in
 * `alarm()`: the answered, spent-month, no-key, secret, unread-answer and seven-question cases fail. `answersSpark` left
 * `false`: those six and the filing case fail. The rule's name dropped from the wire: `grant.read` reads `["system"]`
 * where it expects `["rule:rate"]`, and nothing else moves. The no-key check taken out: the no-key case sees one POST
 * with no `authorization`, and the seven-question case fails too. The alarm for now left out after a full pass: the
 * seven-question case alone fails, with five runs `failed`, two `waiting` and two questions `pending` after the alarms
 * the platform would fire now, because the alarm was armed an hour out for the record's `purge` sweep and not for them.
 * On a record with no such row it is the parked runs' day, which is what the survey's checker measured over the kernel.
 *
 * THE OBJECT IS REAL AND SO IS THE KEY, as in `script-try-asker.test.ts`: `src/index.ts` bundled by `wrangler`'s esbuild,
 * its record over `node:sqlite`, the key put through `serveWorkerKeys` under a bound `KEK`, and every rule filed as the
 * canvas files one. The model is `globalThis.fetch` and it is the only double. No key is printed.
 *
 * CASE 9, THE SAME QUESTION THROUGH WORKERD, IS LEFT A `todo`. Every earlier Spark fault on the Worker was found there
 * (`spark-in-do.test.ts`, `SQLITE_AUTH` on a pragma), and the engine this pass builds is the one the door builds over the
 * same storage, which that file already drives through workerd; the alarm, the key door and a filed rule in Miniflare
 * are a harness of their own and were not built in this pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';
import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { serveWorkerKeys } from '../src/vault.ts';

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER_ID = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const KEK = 'a'.repeat(64);
const ENDPOINT = 'https://gateway.example.test/v1/chat/completions';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TASKS = { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] };

/** The self-host suite's rule: ask Spark for a number about the task just written, then say it. */
const RATE = {
  rule: 'rate',
  on: { written: { register: 'tasks', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { ask_spark: { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' } },
    { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
  ],
};

/** The sentence a Worker record with no `spark` key fails the run on, before anything is posted or spent. */
const NO_KEY = "rule.rate asked Spark at step 1, and this record's vault holds no key labelled spark, so the run stopped there. Put your model key in the vault under spark.";

/** The model's usual answer: the number, and a count that bills a few tokens. */
const RATE_ANSWER = (): Response =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"answer":4.25}' } }], usage: { prompt_tokens: 300, completion_tokens: 8 } }), { status: 200 });

/** The audit's endpoint: a 200 whose completion is 70,000 characters, reporting 16,000 completion tokens. */
const AT_LENGTH = (): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ answer: 'x'.repeat(70_000) }) } }], usage: { prompt_tokens: 415, completion_tokens: 16_000 } }),
    { status: 200 },
  );

type Reply = { ok: boolean; value?: { id?: string; spark?: unknown }; refusal?: { code: string; fix: string; at?: string } };
type Object$ = {
  create(args: object): Promise<unknown>;
  fetch(r: Request): Promise<Response>;
  alarm(): Promise<void>;
  lease(n?: number): Promise<{ kind: string }[]>;
  wrappingKey: Function;
  depositGrant: Function;
  openForGrant: Function;
};
type Posted = { body: string; authorization: string | null };

const owner = () => ({ principal: { kind: 'person', id: OWNER_ID, level: 'owner' }, credentialed: true, provedAt: Date.now() });

/**
 * A hosted record in `Record$` as `src/index.ts` ships it, over `objectStorage()`, with `SPARK_ENDPOINT` set, `KEK` bound
 * unless `kek` is false, and the owner's model key put under `spark` through the app's own key door when `key` says so.
 *
 * THE MODEL IS `globalThis.fetch`, REPLACED FOR THE WHOLE CASE, because the Worker's `send` is `fetch` and there is no
 * other seam in the shipped object. Every request is kept with its body and its `authorization`, and none leaves.
 */
async function hosted(opts: { kek?: boolean; key?: boolean; answer?: () => Response; registers?: object[] } = {}) {
  const { Record$ } = await bundled();
  const storage = objectStorage();
  const env: Record<string, unknown> = {
    PUBLIC_HOST: HOST,
    SPARK_ENDPOINT: ENDPOINT,
    ...(opts.kek === false ? {} : { KEK }),
    INGRESS: { send: async () => {} },
    DIRECTORY: { idFromName: (n: string) => n, get: () => ({ knows: async (id: string) => id === REC, mayRun: async () => null, meter: async () => {} }) },
  };
  const state = { storage, id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  let object = new Record$(state, env) as never as Object$;
  env['RECORD'] = { idFromName: (n: string) => n, get: () => object };

  const sent: Posted[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    sent.push({ body: String(init?.body ?? ''), authorization: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization') });
    return (opts.answer ?? RATE_ANSWER)();
  }) as typeof fetch;

  const store = opts.kek === false ? null : ((await keyStoreOf(KEK)) ?? assert.fail('the KEK did not make a key store'));
  const made = await object.create({
    id: REC,
    slug: 'studio',
    name: 'Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: OWNER_ID, email: 'ada@example.test', name: 'Ada' },
    ...(store === null ? {} : { keys: await recordKeys(store, REC) }),
  });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);

  const call = async (method: string, args: object): Promise<Reply> => {
    const res = await object.fetch(
      new Request(`${ORIGIN}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner()) }, body: JSON.stringify(args) }),
    );
    return (await res.json()) as Reply;
  };
  /** A declaration proposed as the canvas sends one, `body_kind: 'change'`, and accepted, which is how a rule is filed. */
  const change = async (id: string, kind: string, body: object): Promise<Reply> => {
    const filed = await call('propose', { question: `Add ${id}?`, body_kind: 'change', body: { declaration_id: id, to: { id, kind, body }, from_version: 0 } });
    if (!filed.ok) return filed;
    return call('decide', { id: filed.value?.id, decide: { option: 'accept', reason: 'the brief asks for it' } });
  };

  for (const register of opts.registers ?? [TASKS]) {
    const r = await change(`register.${(register as { id: string }).id}`, 'register', register);
    assert.ok(r.ok, JSON.stringify(r));
  }

  if (opts.key) {
    /* THE KEYS LIST COMES WITH THE AGENTS PACK, offered and accepted as `script-try-asker.test.ts` installs it. */
    const pack = await call('propose', { question: 'Install agents?', body_kind: 'pack', body: { install: 'agents' } });
    assert.ok(pack.ok, JSON.stringify(pack));
    assert.ok((await call('decide', { id: pack.value?.id, decide: { option: 'accept', reason: 'the vault needs its list' } })).ok);
  }
  const value = `bd_fake_spark_${crypto.randomUUID().replaceAll('-', '')}`;
  if (opts.key) {
    const put = await serveWorkerKeys(
      new Request(`${ORIGIN}/api/keys/put`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ label: 'spark', opens: 'Spark', value }) }),
      owner() as never,
      {
        origins: new Set([ORIGIN]),
        record: REC,
        keys: {
          store: () => keyStoreOf(KEK),
          wrappingKey: () => object.wrappingKey(),
          depositGrant: (_id: string, args: object, by: object, hints: object, seal: Function) => object.depositGrant(args, by, hints, seal),
          openForGrant: (_id: string, args: object, by: object, hints: object, kekId: string) => object.openForGrant(args, by, hints, kekId),
        } as never,
      },
    );
    assert.equal(put.status, 200, await put.text());
  }

  const sql = storage.sql;
  const runs = () =>
    (sql.exec("SELECT state, vars, say FROM automation_run WHERE rule = 'rate' ORDER BY rowid").toArray() as { state: string; vars: string; say: string | null }[]).map((r) => ({ ...r }));
  const asks = () => (sql.exec("SELECT state, attempts FROM outbox WHERE kind = 'infer.ask' ORDER BY rowid").toArray() as { state: string; attempts: number }[]).map((r) => ({ ...r }));

  return {
    object: () => object,
    storage,
    sent,
    value,
    call,
    change,
    runs,
    asks,
    /* SPARK'S LEDGER, in this object's own storage until `do/spark.ts` exists, which is what the Worker hands the engine. */
    calls: () => {
      const has = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'call'").toArray().length > 0;
      return has ? (sql.exec('SELECT model, tokens_out, status, code FROM call ORDER BY rowid').toArray() as { model: string; tokens_out: number; status: string; code: string | null }[]).map((r) => ({ ...r })) : [];
    },
    reads: () => (sql.exec("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").toArray() as { actor: string }[]).map((e) => e.actor),
    retries: () => (sql.exec("SELECT count(*) AS n FROM schedule WHERE kind = 'retry'").toArray()[0] as { n: number }).n,
    /** The object evicted and woken again over the same storage, which is what reads a declaration written by SQL. */
    reopen: () => {
      object = new Record$(state, env) as never as Object$;
    },
    /**
     * Every alarm the platform would fire now: one, then again while the object's alarm is due, and never more than ten.
     * A parked run's day is not now, so a question left waiting a day is left here too.
     */
    settle: async (): Promise<number> => {
      let fired = 0;
      do {
        await object.alarm();
        fired++;
        const at = await storage.getAlarm();
        if (at === null || at > Date.now()) break;
      } while (fired < 10);
      return fired;
    },
    close: () => {
      globalThis.fetch = real;
    },
  };
}

const answerType = (body: string): unknown =>
  (JSON.parse(body) as { response_format?: { json_schema?: { schema?: { properties?: { answer?: { type?: string } } } } } }).response_format?.json_schema?.schema?.properties?.answer?.type;

/* ── 1 · the switch ──────────────────────────────────────────────────────── */

test('WITH AN ENDPOINT AND KEK, A RULE THAT ASKS SPARK IS FILED, where before this Worker refused it NOT_IN_THIS_BUILD', async () => {
  const s = await hosted();
  try {
    const filed = await s.change('rule.rate', 'rule', RATE);
    assert.equal(filed.ok ? null : filed.refusal?.code, null, filed.refusal?.fix);
  } finally {
    s.close();
  }
});

/* ── 2 · the question answered ───────────────────────────────────────────── */

test("THE QUESTION IS POSTED ONCE, TYPED AS A NUMBER, ON THE OWNER'S KEY OPENED IN THE RULE'S NAME, and the run ends done", async () => {
  const s = await hosted({ key: true });
  try {
    assert.ok((await s.change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');
    assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

    await s.object().alarm();
    assert.equal(s.sent.length, 1, `${s.sent.length} model calls for one question`);
    assert.equal(answerType(s.sent[0]!.body), 'number');
    assert.ok(s.sent[0]!.authorization === `Bearer ${s.value}`, "the question did not go out on the owner's key");
    /* THE ANSWER ARMED THE RUN'S WAKE, and nothing else wakes this object for it. */
    const armed = await s.storage.getAlarm();
    assert.ok(armed !== null && armed <= Date.now(), `the alarm after the answer is ${armed === null ? 'unset' : new Date(armed).toISOString()}`);

    await s.object().alarm();
    const [r] = s.runs();
    assert.equal(r?.state, 'done', r?.say ?? 'no run');
    assert.deepEqual(JSON.parse(r?.vars ?? '{}'), { rate: 4.25 });
    /* SIGNED BY THE RULE AND NOT BY `system`, so the vault's log tells an automation's opening from a scheduled action's. */
    assert.deepEqual(s.reads(), ['rule:rate']);
    assert.equal(s.sent.length, 1, 'the second alarm asked again');
  } finally {
    s.close();
  }
});

/* ── 3 · the one meter ───────────────────────────────────────────────────── */

test("AT ask_cap 0 NOTHING IS POSTED, and the run ends on the month's own sentence", async () => {
  const s = await hosted({ key: true });
  try {
    const res = await s.object().fetch(
      new Request(`${ORIGIN}/api/spark/settings`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner()) },
        body: JSON.stringify({ ask_cap: 0 }),
      }),
    );
    assert.equal(res.status, 200, await res.text());
    assert.ok((await s.change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');
    assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

    await s.settle();

    const next = MONTHS[(new Date().getUTCMonth() + 1) % 12];
    assert.equal(s.sent.length, 0, `${s.sent.length} model calls with the month spent`);
    const [r] = s.runs();
    assert.equal(r?.state, 'failed', r?.say ?? 'no run');
    assert.equal(r?.say, `rule.rate asked Spark at step 1, and this month's asks are spent until 1 ${next}. Raise the monthly limit, or wait.`);
  } finally {
    s.close();
  }
});

/* ── 4 · no key in the vault ─────────────────────────────────────────────── */

test('KEK BOUND AND NO KEY LABELLED spark: NOTHING IS POSTED, NOTHING IS SPENT, and the run says where the key goes', async () => {
  const s = await hosted({ answer: () => new Response('{"error":"no key"}', { status: 401 }) });
  try {
    assert.ok((await s.change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');
    assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

    await s.settle();

    assert.equal(s.sent.length, 0, `${s.sent.length} keyless posts to the owner's provider`);
    assert.deepEqual(s.calls(), [], 'an ask was written to the ledger with no key to make it');
    const [r] = s.runs();
    assert.equal(r?.state, 'failed', r?.say ?? 'no run');
    assert.equal(r?.say, NO_KEY);
  } finally {
    s.close();
  }
});

/* ── 4b · a key that was revoked ─────────────────────────────────────────── */

/* A REVOKED GRANT KEEPS ITS ROW AND ITS LABEL (`packages/kernel/src/vault.ts` `revokeGrant`), so a check that read the
   label alone would pass it, and the host's key path, which finds no live `spark` grant, would then post with no
   `authorization`: case 4's keyless POST by another road. Measured by the checker on 23 September with the
   `revoked_at === null` clause taken out of `workerSparkAnswers`: every case above still passed and this one saw one
   POST to the provider where it expects none. */
test('A spark KEY THAT WAS REVOKED IS NO KEY: nothing is posted, nothing is spent, and the run says where the key goes', async () => {
  const s = await hosted({ key: true, answer: () => new Response('{"error":"no key"}', { status: 401 }) });
  try {
    const [grant] = s.storage.sql.exec("SELECT id FROM grant WHERE label = 'spark'").toArray() as { id: string }[];
    assert.ok(grant, 'the key door filed no spark grant');
    const revoked = await s.call('revokeGrant', { id: grant.id });
    assert.ok(revoked.ok, JSON.stringify(revoked));
    assert.ok((await s.change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');
    assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

    await s.settle();

    assert.equal(s.sent.length, 0, `${s.sent.length} posts to the owner's provider on a revoked key`);
    assert.deepEqual(s.calls(), [], 'an ask was written to the ledger with no live key to make it');
    const [r] = s.runs();
    assert.equal(r?.state, 'failed', r?.say ?? 'no run');
    assert.equal(r?.say, NO_KEY);
  } finally {
    s.close();
  }
});

/* ── 5 · no KEK, no Spark ────────────────────────────────────────────────── */

test('KEK UNBOUND: /api/version SAYS spark false, THE RULE IS REFUSED, and a queued question is left where it is', async () => {
  const s = await hosted({ kek: false });
  try {
    const version = (await (await s.object().fetch(new Request(`${ORIGIN}/api/version`, { headers: { 'x-braindog-ctx': JSON.stringify(owner()) } }))).json()) as Reply;
    assert.equal(version.value?.spark, false);
    const filed = await s.change('rule.rate', 'rule', RATE);
    assert.equal(filed.ok ? null : filed.refusal?.code, 'NOT_IN_THIS_BUILD');
    /* A ROW AN EARLIER HOST QUEUED, written as `enqueue` writes one, so there is something for a pass to lease. */
    s.storage.sql.exec(
      "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('j_left', ?, 'infer.ask', ?, 'pending', 0)",
      new Date().toISOString() as never,
      JSON.stringify({ run: 'r_x', rule: 'rate', step: 0, question: 'Which?', shape: 'text' }) as never,
    );
    await s.object().alarm();
    assert.deepEqual(s.asks(), [{ state: 'pending', attempts: 0 }], 'a Worker with no model leased a question it cannot ask');
    assert.equal(s.sent.length, 0);
  } finally {
    s.close();
  }
});

/* ── 6 · a secret through a variable (audit forty-six finding 1) ─────────── */

const OBLIGATIONS = {
  id: 'obligations',
  name: 'Obligations',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'pin', type: 'secret' },
  ],
};
const PINNED = {
  rule: 'rate',
  on: { written: { register: 'obligations', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { ask_spark: { question: 'What rate applies to {{what}}, given {{vars.p}}?', as: 'rate' } },
  ],
};

test('A QUESTION NAMING A VARIABLE SET FROM A SECRET FIELD IS REFUSED AT PROPOSE, and one stored past the lint posts without the secret', async () => {
  const s = await hosted({ key: true, registers: [OBLIGATIONS] });
  try {
    const refused = await s.call('propose', { question: 'Add rule.rate?', body_kind: 'change', body: { declaration_id: 'rule.rate', to: { id: 'rule.rate', kind: 'rule', body: PINNED }, from_version: 0 } });
    assert.equal(refused.ok ? null : refused.refusal?.code, 'DECLARATION_INVALID', refused.refusal?.fix);
    assert.match(refused.refusal?.fix ?? '', /steps\[0\]/, 'the refusal does not name the set_var');

    /* THE SECOND LINE: a rule filed plain and then rewritten in the table, as `flow-waits.test.ts` writes its stored rule. */
    assert.ok((await s.change('rule.rate', 'rule', { ...PINNED, steps: [{ set_var: { name: 'x', to: 'y' } }] })).ok);
    s.storage.sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify(PINNED) as never);
    s.reopen();
    const made = await s.call('create', { register: 'obligations', fields: { what: 'Rent' } });
    assert.ok(made.ok, JSON.stringify(made));
    /* ONLY THE VAULT WRITES A SECRET FIELD, so `pin` is put in the row by SQL, as the kernel's own case puts it. */
    s.storage.sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.value?.id as never);

    await s.object().alarm();

    assert.equal(s.sent.length, 1, `${s.sent.length} model calls for one question`);
    assert.match(s.sent[0]!.body, /Rent/, 'the question that went out was not the one about this row');
    assert.doesNotMatch(s.sent.map((p) => p.body).join('\n'), /hunter2/, 'the secret field left the record');
  } finally {
    s.close();
  }
});

/* ── 7 · an answer this host cannot read (audit forty-six finding 4) ─────── */

/* THE MODEL NAME AND THE REFUSAL CODE ARE NOT PINNED HERE, because both are being settled in `packages/host/src/spark.ts`
   and `packages/spark/src/answer.ts` as this is written: the ledger's `model` is the package prompt's and not
   `SPARK_MODEL`. What the Worker owes is that the completion the owner's provider billed is one row with its count, that
   the run ends, and that nothing asks again. */
test('A MODEL THAT ANSWERED AT A LENGTH THIS HOST DOES NOT READ IS ASKED ONCE, counted with its tokens, and not retried', async () => {
  const s = await hosted({ key: true, answer: AT_LENGTH });
  try {
    assert.ok((await s.change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');
    assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

    await s.object().alarm();
    assert.equal(s.sent.length, 1, `${s.sent.length} completions for one question`);
    const rows = s.calls();
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.notEqual(rows[0]!.model, '-', 'the completion was settled under the dash, which no count reads');
    assert.equal(rows[0]!.tokens_out, 16_000);
    assert.equal(s.retries(), 0, 'the ladder is asking again');

    await s.settle();
    assert.equal(s.sent.length, 1, 'a later alarm asked again');
    const [r] = s.runs();
    assert.equal(r?.state, 'failed', r?.say ?? 'no run');
  } finally {
    s.close();
  }
});

/* ── 8 · the pump's list ─────────────────────────────────────────────────── */

test('WITH THE SWITCH ON AND A QUESTION QUEUED, lease() HANDS THE PUMP NO infer.ask JOB', async () => {
  const s = await hosted({ key: true });
  try {
    s.storage.sql.exec(
      "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('j_pump', ?, 'infer.ask', ?, 'pending', 0)",
      new Date().toISOString() as never,
      JSON.stringify({ run: 'r_x', rule: 'rate', step: 0, question: 'Which?', shape: 'text' }) as never,
    );
    assert.deepEqual((await s.object().lease(10)).map((j) => j.kind), [], 'the pump leased a question to Spark');
  } finally {
    s.close();
  }
});

/* ── 9 · through workerd ─────────────────────────────────────────────────── */

test.todo('the answered question of case 2 through workerd, in spark-in-do.test.ts shape, with the model a node:http server');

/* ── 10 · more questions than one pass leases ────────────────────────────── */

test('SEVEN QUESTIONS BEFORE ONE ALARM, NO KEY: all seven runs fail on the vault sentence and none is left waiting a day', async () => {
  const s = await hosted();
  try {
    assert.ok((await s.change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');
    for (let i = 1; i <= 7; i++) assert.ok((await s.call('create', { register: 'tasks', fields: { what: `Task ${i}` } })).ok);

    await s.settle();

    assert.deepEqual(s.asks().filter((a) => a.state === 'pending'), [], 'questions were left for a later alarm nothing sets');
    const runs = s.runs();
    assert.equal(runs.length, 7);
    assert.deepEqual(runs.map((r) => [r.state, r.say]), Array.from({ length: 7 }, () => ['failed', NO_KEY]));
    assert.equal(s.sent.length, 0);
  } finally {
    s.close();
  }
});
