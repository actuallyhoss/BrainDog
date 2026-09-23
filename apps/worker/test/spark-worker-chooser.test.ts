/**
 * An automation's question to Spark on the Worker when the only entry labelled `spark` is not an API token.
 * `loop/research-batch-fifty-four-audit.md` finding 4, driven as its W1 drove it.
 *
 * WHAT THE AUDIT MEASURED, AT `538bc705`. The gate in `workerSparkAnswers` read the label and `revoked_at` alone, the key
 * path read `sparkGrantOf`, and with a password as the only `spark` entry the two disagreed: the gate let the question by,
 * the key path chose nothing to open, and the run ended "the key labelled spark in this record's vault would not open on
 * this Worker", which sends the owner to a `KEK` that works. `2fae4d2b` put the gate on `sparkGrantOf`, so the run then
 * ended on the no-key sentence instead: "this record's vault holds no key labelled spark ... Put your model key in the
 * vault under spark". That is not true either. The vault holds exactly that, the owner put it there, and the vault's own
 * screen lists it as a key of kind Password (`apps/web/src/lib/record/vault.ts`, "The kinds a key row declares").
 *
 * RED AT `b7409d2d`, MEASURED ON 23 SEPTEMBER: all four cases failed on that no-key sentence with zero posts and zero
 * ledger rows, so the refusal was already right and the sentence alone was wrong. A note is in the list for the same
 * reason a password is: the screen calls it a key too, and "holds no key labelled spark" beside a row labelled `spark` is
 * a sentence the owner can check and find false.
 *
 * THE HARNESS IS `spark-key-status.test.ts`'s, CUT DOWN AND COPIED RATHER THAN IMPORTED, because a test file exports
 * nothing and that one is not this change's to edit: `src/index.ts` bundled by `wrangler`'s esbuild, its record over
 * `node:sqlite`, each key put through `serveWorkerKeys` under a bound `KEK` with the kind the owner chose, the rule filed
 * as the canvas files one, and `globalThis.fetch` the only double.
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

const TASKS = { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] };
const RATE = {
  rule: 'rate',
  on: { written: { register: 'tasks', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { ask_spark: { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' } },
    { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
  ],
};

/** The sentence an entry under `spark` that is not a token ends the run on: what is there, what Spark needs, nothing sent. */
const sentenceFor = (named: string) =>
  `rule.rate asked Spark at step 1, and the key labelled spark in this record's vault is ${named}, not an API token, so nothing was sent and the run stopped there. Put your model key in the vault under spark as an API token.`;

type Reply = { ok: boolean; value?: { id?: string }; refusal?: { code: string; fix: string } };
type Object$ = {
  create(args: object): Promise<unknown>;
  fetch(r: Request): Promise<Response>;
  alarm(): Promise<void>;
  wrappingKey: Function;
  depositGrant: Function;
  openForGrant: Function;
};

const owner = () => ({ principal: { kind: 'person', id: OWNER_ID, level: 'owner' }, credentialed: true, provedAt: Date.now() });

/**
 * The bundled Worker's record with one entry under `spark` of the kind given, and the rule `rate` filed.
 *
 * ONE ENTRY, BECAUSE ONE KIND PER LABEL IS ALL THIS DOOR ALLOWS: a second put under `spark` is a rotation, and a rotation
 * to another kind is refused `IMMUTABLE_FIELD` (measured while writing this file, 422 on a password put after a token). A
 * token and a password side by side under one label are a kernel `bindGrant` away and no door's, which is why
 * `spark-named.test.ts` builds that vault by hand.
 */
async function hosted(kind: string) {
  const { Record$ } = await bundled();
  const storage = objectStorage();
  const env: Record<string, unknown> = {
    PUBLIC_HOST: HOST,
    SPARK_ENDPOINT: ENDPOINT,
    KEK,
    INGRESS: { send: async () => {} },
    DIRECTORY: { idFromName: (n: string) => n, get: () => ({ knows: async (id: string) => id === REC, mayRun: async () => null, meter: async () => {} }) },
  };
  const state = { storage, id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  const object = new Record$(state, env) as never as Object$;
  env['RECORD'] = { idFromName: (n: string) => n, get: () => object };

  const sent: { authorization: string | null }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    sent.push({ authorization: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization') });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"answer":4.25}' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), {
      status: 200,
    });
  }) as typeof fetch;

  const store = (await keyStoreOf(KEK)) ?? assert.fail('the KEK did not make a key store');
  const made = await object.create({
    id: REC,
    slug: 'studio',
    name: 'Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: OWNER_ID, email: 'ada@example.test', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);

  const call = async (method: string, args: object): Promise<Reply> => {
    const res = await object.fetch(
      new Request(`${ORIGIN}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner()) }, body: JSON.stringify(args) }),
    );
    return (await res.json()) as Reply;
  };
  const change = async (id: string, kind: string, body: object): Promise<Reply> => {
    const filed = await call('propose', { question: `Add ${id}?`, body_kind: 'change', body: { declaration_id: id, to: { id, kind, body }, from_version: 0 } });
    if (!filed.ok) return filed;
    return call('decide', { id: filed.value?.id, decide: { option: 'accept', reason: 'the brief asks for it' } });
  };

  assert.ok((await change('register.tasks', 'register', TASKS)).ok);
  const pack = await call('propose', { question: 'Install agents?', body_kind: 'pack', body: { install: 'agents' } });
  assert.ok(pack.ok, JSON.stringify(pack));
  assert.ok((await call('decide', { id: pack.value?.id, decide: { option: 'accept', reason: 'the vault needs its list' } })).ok);
  const put = await serveWorkerKeys(
    new Request(`${ORIGIN}/api/keys/put`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'spark', opens: 'Spark', kind, value: `bd_fake_spark_${crypto.randomUUID().replaceAll('-', '')}` }),
    }),
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
  assert.ok((await change('rule.rate', 'rule', RATE)).ok, 'the rule was not filed');

  const sql = storage.sql;
  return {
    sent,
    call,
    runs: () => (sql.exec("SELECT state, say FROM automation_run WHERE rule = 'rate' ORDER BY rowid").toArray() as { state: string; say: string | null }[]).map((r) => ({ ...r })),
    calls: () => {
      const has = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'call'").toArray().length > 0;
      return has ? (sql.exec('SELECT model, status, code FROM call ORDER BY rowid').toArray() as { model: string; status: string; code: string | null }[]).map((r) => ({ ...r })) : [];
    },
    /** Every alarm the platform would fire now, never more than ten; a rung an hour out is left where it is. */
    settle: async (): Promise<void> => {
      for (let fired = 0; fired < 10; fired++) {
        await object.alarm();
        const at = await storage.getAlarm();
        if (at === null || at > Date.now()) break;
      }
    },
    close: () => {
      globalThis.fetch = real;
    },
  };
}

const KINDS = [
  ['password', 'a password'],
  ['ssh_key', 'an SSH key'],
  ['recovery_codes', 'a set of recovery codes'],
  ['note', 'a note'],
] as const;

for (const [kind, named] of KINDS)
  test(`W1 · ${named.toUpperCase()} AS THE ONLY spark ENTRY: nothing is posted or counted, and the run names the kind it found`, async () => {
    const s = await hosted(kind);
    try {
      assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);
      await s.settle();

      /* THE REFUSAL WAS ALREADY RIGHT AT `b7409d2d` AND STAYS SO: before `538bc705` a password went out as the bearer. */
      assert.deepEqual(s.sent, [], `${s.sent.length} posts with ${named} as the only spark entry`);
      assert.deepEqual(s.calls(), [], 'an ask was written to the ledger with no token to make it');
      const [r] = s.runs();
      assert.equal(r?.state, 'failed', r?.say ?? 'no run');
      /* RED AT `b7409d2d` ON "this record's vault holds no key labelled spark", which the owner's own vault screen
         contradicts, and at `538bc705` on "would not open on this Worker", which sends him to a `KEK` that works. */
      assert.equal(r?.say, sentenceFor(named));
    } finally {
      s.close();
    }
  });
