/**
 * The included model on the vault's `spark` key, held to the vault's own gate: `loop/research-batch-thirty-three-audit.md` §2.
 *
 * WHAT THE AUDIT MEASURED, AND WHAT THIS FILE REPEATS. A self-host with `SPARK_ENDPOINT` and no `SPARK_KEY` keys the
 * included model with the grant labelled `spark` (`endpointOptionsOf` in `packages/host/src/spark.ts`), opened through
 * `keyOpener`, which signs `system`. `sparkByokFor` put the vault gate in front of tier `b`'s own grant and left this path
 * alone, so Bo, at `read` with a proof fifty minutes old, asked `/api/spark/read` and the call went out on the owner's key:
 * `tier a: Bo read=200 ... on the owner's vault key 3; grant.read actors ["system","system","system"]`. And the settings
 * door took the `spark` grant as tier `b`'s key with 200, so the owner could make the two the same key without knowing it.
 *
 * RED BEFORE THE REPAIR, measured on 22 September against the tree as it stood, four of the six failing in these words:
 * tier `a` `Bo read=200 propose=200; 3 model calls; grant.read ["system","system","system"]`, tier `b`
 * `Bo read=200; 1 model calls; grant.read ["system"]`, the save naming the `spark` grant `saved as tier b's key: 200`, and
 * the owner on a fifty-minute-old proof `a stale owner session opened the key: 200`. The operator-key case passed before
 * and after, which is its job: it is the line the repair must not cross.
 *
 * THE OWNER'S OWN ASKS ARE SIGNED BY HER SINCE, and were a `todo` here until the included model was built per ask. With
 * the engine's one adapter her read left `grant.read ["system"]`; with `sparkAskerEngine`'s two call sites put back to the
 * old two-argument calls, both her read and her propose go red again, which is how the pair was checked.
 *
 * THE SAME STACK AS `spark-byok-guard.test.ts`, WITH `key` LEFT OUT OF THE SPARK CONFIG, because that one omission is the
 * whole premise: with an operator key the included model never touches the vault, and the last case here says so.
 *
 * NO KEY IS PRINTED. A key is compared with `assert.ok(x === y)` and a message naming no value, as the byok file does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OPERATOR = 'fake-operator-key';

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
      { id: 'state', type: 'enum', values: ['open', 'done'], required: true },
    ],
  } as never,
};

const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

const DRAFT = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';
const PROPOSAL =
  '{"text":"Two tasks are open and {{ref:tasks#1}} is first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"what":"Chase {{ref:tasks#1}}"}]},"flagged":false}';

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } } | null;

/** A self-host whose Spark endpoint has no operator key unless `operator` says so. */
async function stack(operator = false) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-spark-included-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const sent: RequestInit[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey,
    keys: store,
    pollMs: 0,
    spark: {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'llama3',
      ...(operator ? { key: OPERATOR } : {}),
      send: async (_url, init) => {
        sent.push(init);
        const content = String(init.body).includes('body_kind') ? PROPOSAL : DRAFT;
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }), {
          status: 200,
        });
      },
    },
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const ada = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(ada.ok);
  const owner = ada.value.id;
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([TASKS, KEYS])).ok);
  for (const what of ['Invoice Acme', 'Invoice Beta'])
    assert.ok(running.api.kernel.create('tasks', { what, state: 'open' }, { actor: owner }).ok);

  /** A session for `person`, whose last proof was `ago` milliseconds before now. */
  const plant = (person: string, ago = 0): string => {
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    const db = new DatabaseSync(join(dir, 'directory.sqlite'));
    try {
      db.prepare('INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(createHmac('sha256', sessionKey).update(`s:${sid}`).digest('hex'), person, REC, now + 60 * MINUTE, now, now - ago);
    } finally {
      db.close();
    }
    return sid;
  };

  const call = async (path: string, sid: string, body?: unknown) => {
    const res = await fetch(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie: `bd_s=${sid}`, ...(body === undefined ? { 'sec-fetch-site': 'same-origin' } : { origin, 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body };
  };

  /** Bo, at `read`, joined, with a session whose proof is `ago` old. */
  const colleague = async (ago: number): Promise<{ id: string; sid: string }> => {
    const bo = running.directory.person$('bo@example.com', 'Bo');
    assert.ok(bo.ok);
    const invited = await running.api.invite(
      { person: bo.value.id, email: 'bo@example.com', name: 'Bo', level: 'read' },
      { principal: { kind: 'person', id: owner, level: 'owner' } },
    );
    assert.ok(invited.ok, `Bo was not put on the record: ${JSON.stringify(invited)}`);
    assert.ok(running.directory.join(REC, bo.value.id).ok);
    return { id: bo.value.id, sid: plant(bo.value.id, ago) };
  };

  /** A key the owner puts in the vault from her own fresh session, and the grant id it is kept under. */
  const put = async (sid: string, label: string): Promise<{ value: string; grant: string }> => {
    const value = ['bd_fake_', label.toLowerCase(), '_', randomBytes(24).toString('hex')].join('');
    const out = await call('/api/keys/put', sid, { label, opens: 'Spark', value });
    assert.equal(out.status, 200, `the key was not put in: ${out.status}`);
    const row = running.api.kernel.get(String(out.body?.value?.['credential'])) ?? assert.fail('the key row is not there');
    return { value, grant: String(row.fields['value']) };
  };

  const reads = () => running.sql.all<{ actor: string }>("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").map((e) => e.actor);
  const bearer = (init: RequestInit) => (init.headers as Record<string, string>).authorization;

  return {
    running,
    owner,
    sent,
    plant,
    call,
    colleague,
    put,
    reads,
    bearer,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const ASK = { question: 'Which tasks are open?' };

test("§2: ON TIER a, A READ COLLEAGUE WITH A FIFTY-MINUTE-OLD PROOF IS REFUSED THE VAULT'S spark KEY, before any model call", async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    await s.put(ada, 'spark');
    const bo = await s.colleague(50 * MINUTE);
    /* THE PREMISE: Bo is a session this host answers, so a 403 below is Spark's and not the cookie's. */
    assert.equal((await s.call('/api/spark/status', bo.sid)).status, 200);

    const read = await s.call('/api/spark/read', bo.sid, ASK);
    const propose = await s.call('/api/spark/propose', bo.sid, ASK);
    assert.deepEqual(
      [read.status, propose.status],
      [403, 403],
      `Bo read=${read.status} propose=${propose.status}; ${s.sent.length} model calls; grant.read ${JSON.stringify(s.reads())}`,
    );
    assert.equal(read.body?.refusal?.code, 'FORBIDDEN');
    assert.equal(s.sent.length, 0, 'the refusal came after a model call');
    assert.deepEqual(s.reads(), [], 'the vault was read for a caller it refuses');
  } finally {
    await s.close();
  }
});

test('§2: ON TIER b, BO READING IS REFUSED TOO, because the drafting pass is the included model on the same vault key', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    await s.put(ada, 'spark');
    const own = await s.put(ada, 'OpenAI');
    const set = await s.call('/api/spark/settings', ada, { tier: 'b', grant_id: own.grant, model: 'gpt-4o-mini' });
    assert.equal(set.status, 200, set.raw);
    const bo = await s.colleague(50 * MINUTE);

    const read = await s.call('/api/spark/read', bo.sid, ASK);
    assert.equal(read.status, 403, `Bo read=${read.status}; ${s.sent.length} model calls; grant.read ${JSON.stringify(s.reads())}`);
    assert.equal(s.sent.length, 0, 'the refusal came after a model call');
    assert.deepEqual(s.reads(), [], 'the vault was read for a caller it refuses');
  } finally {
    await s.close();
  }
});

test("§2: TIER b NAMING THE spark GRANT IS 422 AT grant_id, because that key is the one this host answers everybody with", async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value, grant } = await s.put(ada, 'spark');
    const set = await s.call('/api/spark/settings', ada, { tier: 'b', grant_id: grant, model: 'gpt-4o-mini' });
    assert.equal(set.status, 422, `the spark grant was saved as tier b's key: ${set.status}`);
    assert.equal(set.body?.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(set.body?.refusal?.at, 'grant_id');
    assert.ok(!set.raw.includes(value), 'the refusal carried the value');
    assert.equal((await s.call('/api/spark/status', ada)).body?.value?.['tier'], 'a', 'the refused tier was written anyway');
    assert.deepEqual(s.reads(), [], 'the refusal opened the grant');
  } finally {
    await s.close();
  }
});

test("§2: THE OWNER ON A FRESH PROOF STILL READS ON THE spark KEY, and on a stale one is sent back to prove it again", async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value } = await s.put(ada, 'spark');
    const stale = await s.call('/api/spark/read', s.plant(s.owner, 50 * MINUTE), ASK);
    assert.equal(stale.status, 403, `a stale owner session opened the key: ${stale.status}`);
    assert.equal(s.sent.length, 0);

    const fresh = await s.call('/api/spark/read', ada, ASK);
    assert.equal(fresh.status, 200, fresh.raw);
    assert.equal(s.sent.length, 1);
    assert.ok(s.bearer(s.sent[0]!) === `Bearer ${value}`, "the owner's read did not go out on the spark key");
    assert.equal(s.reads().length, 1, 'the key was opened other than once');
    assert.ok(!fresh.raw.includes(value), 'the key came back in the answer');
  } finally {
    await s.close();
  }
});

test("§2: THE OWNER'S OWN READ IS SIGNED BY HER AND NOT BY system", async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value } = await s.put(ada, 'spark');
    assert.equal((await s.call('/api/spark/read', ada, ASK)).status, 200);
    assert.deepEqual(s.reads(), [s.owner], 'the grant.read was not signed by the asker');
    assert.ok(s.sent.length === 1 && s.bearer(s.sent[0]!) === `Bearer ${value}`, "the read did not go out once, on the spark key");
  } finally {
    await s.close();
  }
});

test("§2: AND HER OWN PROPOSE, WHICH DRAFTS AND PROPOSES ON THE spark KEY ON TIER a, IS SIGNED BY HER TWICE", async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value } = await s.put(ada, 'spark');
    const out = await s.call('/api/spark/propose', ada, ASK);
    assert.equal(out.status, 200, out.raw);
    assert.deepEqual(s.reads(), [s.owner, s.owner], 'a grant.read of the propose was not signed by the asker');
    assert.ok(s.sent.length === 2 && s.sent.every((init) => s.bearer(init) === `Bearer ${value}`), 'the propose did not go out twice, on the spark key');
    assert.ok(!out.raw.includes(value), 'the key came back in the answer');
  } finally {
    await s.close();
  }
});

test('§2: WITH AN OPERATOR KEY THE GATE STANDS NOWHERE, since the included model never touches the vault', async () => {
  const s = await stack(true);
  try {
    const ada = s.plant(s.owner);
    await s.put(ada, 'spark');
    const own = await s.put(ada, 'OpenAI');
    assert.equal((await s.call('/api/spark/settings', ada, { tier: 'b', grant_id: own.grant, model: 'gpt-4o-mini' })).status, 200);
    const bo = await s.colleague(50 * MINUTE);

    const read = await s.call('/api/spark/read', bo.sid, ASK);
    assert.equal(read.status, 200, `a read on the operator key was stopped at the vault: ${read.status} ${read.body?.refusal?.code ?? ''}`);
    assert.ok(s.sent.length === 1 && s.bearer(s.sent[0]!) === `Bearer ${OPERATOR}`, 'the read did not go out once, on the operator key');
    assert.deepEqual(s.reads(), [], 'a read on the operator key opened the vault');
  } finally {
    await s.close();
  }
});
