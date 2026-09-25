/**
 * An automation's question to Slash on the Worker, when the key is there and will not open, and when the provider answers a
 * status no retry mends. `loop/research-batch-forty-nine-audit.md` findings 2 and 4, driven as the audit drove them (its
 * P1 and P6); the host's half is `packages/host/test/slash-status-final.test.ts`.
 *
 * FINDING 2. `workerSlashAnswers` refused a job when no live grant was labelled `slash`, and read the label, not the
 * opening. With the owner's key put under one `KEK` and the object woken under another, as a `wrangler secret put KEK`
 * leaves it, the audit measured 8 POSTs with no `authorization` of 8 over the ladder, 8 ledger rows under the dash, and a
 * run ending "Slash could not be reached after 8 attempts". A scheduled action on the same key refuses `WRONG_KEY`.
 *
 * FINDING 4. A 400, a 401 and a 404 to a good key were each asked eight times over about 266 minutes, and the run ended
 * "could not be reached" about a provider that answered all eight.
 *
 * THE HARNESS IS `slash-answers.test.ts`'s, CUT DOWN AND COPIED RATHER THAN IMPORTED, because a test file exports nothing
 * and that one is not this change's to edit: `src/index.ts` bundled by `wrangler`'s esbuild, its record over
 * `node:sqlite`, the key put through `serveWorkerKeys` under a bound `KEK`, the rule filed as the canvas files one, and
 * `globalThis.fetch` the only double. What is added is `rekey`, which wakes the object again under another `KEK`.
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
const OTHER_KEK = 'b'.repeat(64);
const ENDPOINT = 'https://gateway.example.test/v1/chat/completions';

const TASKS = { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] };
const RATE = {
  rule: 'rate',
  on: { written: { register: 'tasks', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { ask_slash: { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' } },
    { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
  ],
};

/** The sentence a key that is there and will not open ends the run on, before anything is posted or spent. */
const WONT_OPEN =
  "rule.rate asked Slash at step 1, and the key labelled slash in this record's vault would not open on this Worker, so nothing was sent and the run stopped there.";

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

async function hosted(answer: () => Response) {
  const { Record$ } = await bundled();
  const storage = objectStorage();
  const env: Record<string, unknown> = {
    PUBLIC_HOST: HOST,
    SLASH_ENDPOINT: ENDPOINT,
    KEK,
    INGRESS: { send: async () => {} },
    DIRECTORY: { idFromName: (n: string) => n, get: () => ({ knows: async (id: string) => id === REC, mayRun: async () => null, meter: async () => {} }) },
  };
  const state = { storage, id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  let object = new Record$(state, env) as never as Object$;
  env['RECORD'] = { idFromName: (n: string) => n, get: () => object };

  const sent: { authorization: string | null }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    sent.push({ authorization: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization') });
    return answer();
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
  const value = `bd_fake_slash_${crypto.randomUUID().replaceAll('-', '')}`;
  const put = await serveWorkerKeys(
    new Request(`${ORIGIN}/api/keys/put`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ label: 'slash', opens: 'Slash', value }) }),
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
    value,
    call,
    object: () => object,
    runs: () => (sql.exec("SELECT state, say FROM automation_run WHERE rule = 'rate' ORDER BY rowid").toArray() as { state: string; say: string | null }[]).map((r) => ({ ...r })),
    calls: () => {
      const has = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'call'").toArray().length > 0;
      return has ? (sql.exec('SELECT model, status, code FROM call ORDER BY rowid').toArray() as { model: string; status: string; code: string | null }[]).map((r) => ({ ...r })) : [];
    },
    retries: () => (sql.exec("SELECT count(*) AS n FROM schedule WHERE kind = 'retry'").toArray()[0] as { n: number }).n,
    /** The object woken again over the same storage under another `KEK`, as a `wrangler secret put KEK` leaves it. */
    rekey: () => {
      env['KEK'] = OTHER_KEK;
      object = new Record$(state, env) as never as Object$;
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

/* ── P1 · the KEK changed under the record ───────────────────────────────── */

test('A `slash` KEY THAT WILL NOT OPEN UNDER THIS KEK: NOTHING IS POSTED, NOTHING IS WRITTEN TO THE LEDGER, and the run says why', async () => {
  const s = await hosted(() => new Response('{"error":"no key"}', { status: 401 }));
  try {
    s.rekey();
    assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

    await s.object().alarm();
    assert.deepEqual(s.sent, [], `${s.sent.length} posts, ${s.sent.filter((p) => p.authorization === null).length} with no authorization`);
    await s.settle();

    assert.deepEqual(s.sent, [], 'a later rung posted');
    assert.deepEqual(s.calls(), [], 'an ask was written to the ledger with no key to make it');
    const [r] = s.runs();
    assert.equal(r?.state, 'failed', r?.say ?? 'no run');
    assert.equal(r?.say, WONT_OPEN);
  } finally {
    s.close();
  }
});

/* ── P6 · a status no retry mends ────────────────────────────────────────── */

for (const n of [400, 401, 404])
  test(`A ${n} TO A GOOD KEY IS ONE POST, and the run ends in the first alarms on a sentence that names the status`, async () => {
    const s = await hosted(() => new Response(`{"error":"${n}"}`, { status: n }));
    try {
      assert.ok((await s.call('create', { register: 'tasks', fields: { what: 'Gold' } })).ok);

      await s.settle();

      assert.equal(s.sent.length, 1, `${s.sent.length} posts for a status that answers the same on every rung`);
      assert.equal(s.sent[0]!.authorization, `Bearer ${s.value}`, "the question did not go out on the owner's key");
      /* THE RUN IS OVER, AND NOT PARKED FOR THE NEXT RUNG: the audit's run was still waiting here, a retry queued. */
      const [r] = s.runs();
      assert.equal(r?.state, 'failed', `the run is ${r?.state ?? 'missing'}, with ${s.retries()} retry queued`);
      assert.equal(s.retries(), 0, 'the ladder is asking again');
      assert.deepEqual(s.calls(), [{ model: '-', status: 'error', code: 'PULL_REQUEST_REFUSED' }], 'the refusal was counted as an ask');
      assert.doesNotMatch(r?.say ?? '', /could not be reached/u);
      assert.equal(
        r?.say,
        n === 401
          ? 'rule.rate asked Slash at step 1, and the provider refused the key labelled slash (401), so the run stopped there rather than ask it again.'
          : `rule.rate asked Slash at step 1, and the provider answered ${n} with no completion, which asking again would not change, so the run stopped there.`,
      );
    } finally {
      s.close();
    }
  });
