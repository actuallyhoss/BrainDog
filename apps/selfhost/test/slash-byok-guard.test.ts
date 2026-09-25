/**
 * Tier `b`, the owner's own key, held to the three rules `loop/research-batch-thirty-one-audit.md` §1, §3 and §5 found
 * broken in `bd8add33`, each over a real self-host socket with the self-host's real key store.
 *
 * WHY A SELF-HOST AND NOT A DOOR OVER A HAND-WRITTEN ENGINE. All three faults sat in the join between this package and the
 * app: `slashByokOf` was handed a grant id and an opener that signed every read `system`, the package's meter looked at
 * tier `a` alone, and `configure` checked a grant id's shape and never the vault. `test/slash.test.ts` drives each builder
 * by hand and stayed green through all three, so the measurement has to be the one the audit made, end to end: a key put
 * in through `/api/keys/put`, sealed under `openKeyStore`, opened by `keyOpener`, sent by the endpoint double below.
 *
 * THE SESSIONS ARE PLANTED IN THE DIRECTORY, as `apps/selfhost/test/slash-routes.test.ts` plants them, because the case
 * that matters is a colleague whose last proof is fifty minutes old and the server key's sign-in cannot make one. Each
 * cookie still goes through the directory's own session flow, so `provedAt` is what this host reads off `authed_at`.
 *
 * IT LIVES IN THIS APP AND NOT IN `packages/host/test`, where it was written first. Every case drives this app's `start`
 * and this app's key store, so as a test of `packages/host` it imported two layers up (`../../../apps/selfhost/src`),
 * the one edge the package graph forbids in `src` and that nothing but habit forbade here. Its subject is the join
 * between the two, and the side of the join that owns a socket is this one.
 *
 * NO KEY IS PRINTED. Every assertion that touches the key compares it with `assert.ok(x === y)` and a message that names
 * no value, because `assert.equal` puts both sides in its failure text and a red run is exactly when that text is read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { keyOpener } from '../src/actions.ts';
import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OPERATOR = 'fake-operator-key';
const OWNER_MODEL = 'gpt-4o-mini';
/* THE SENTENCE `46 §5.5` step 3 GIVES FOR TIER `b` WITH NO OPEN KEY, which `§5.9` step 4 names for a vault that refuses. */
const CLOSED = 'Your key is not open in this session. Open the vault, or switch Slash to the included model.';

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

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-byok-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  const store = await openKeyStore(join(dir, 'kek.key'));
  /* THE PROPOSAL IS TOLD APART FROM THE DRAFT BY THE SCHEMA IT PINS, which is the only job whose answer has a
     `body_kind`. Every request is kept, so a refusal that still drafted is a call in `sent`. */
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
    slash: {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'llama3',
      key: OPERATOR,
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

  /** The owner's key in the vault and tier `b` on its grant, both from Ada's own fresh browser session. */
  const tierB = async (sid: string): Promise<{ value: string; grant: string }> => {
    const value = ['bd_fake_slash_byok_', randomBytes(24).toString('hex')].join('');
    const put = await call('/api/keys/put', sid, { label: 'OpenAI', opens: 'Slash on my own account', value });
    assert.equal(put.status, 200, put.raw);
    const row = running.api.kernel.get(String(put.body?.value?.['credential'])) ?? assert.fail('the key row is not there');
    const grant = String(row.fields['value']);
    const set = await call('/api/slash/settings', sid, { tier: 'b', grant_id: grant, model: OWNER_MODEL });
    assert.equal(set.status, 200, set.raw);
    return { value, grant };
  };

  const reads = () => running.sql.all<{ actor: string }>("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").map((e) => e.actor);
  const bearer = (init: RequestInit) => (init.headers as Record<string, string>).authorization;

  return {
    running,
    store,
    owner,
    sent,
    plant,
    call,
    colleague,
    tierB,
    reads,
    bearer,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('§1: A READ COLLEAGUE WITH A FIFTY-MINUTE-OLD PROOF IS REFUSED THE OWNER KEY, before any model call and with no grant.read', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    await s.tierB(ada);
    const bo = await s.colleague(50 * MINUTE);

    /* THE PREMISE: Bo is a session this host answers, so the 403 below is Slash's and not the cookie's. */
    assert.equal((await s.call('/api/slash/status', bo.sid)).status, 200);

    const out = await s.call('/api/slash/propose', bo.sid, { question: 'Which tasks are open?' });
    assert.equal(out.status, 403, `a read colleague proposed on the owner's key: ${out.status} ${out.body?.refusal?.code ?? ''}`);
    assert.deepEqual(out.body?.refusal && { code: out.body.refusal.code, fix: out.body.refusal.fix }, { code: 'FORBIDDEN', fix: CLOSED });
    assert.equal(s.sent.length, 0, 'the refusal came after a model call');
    assert.deepEqual(s.reads(), [], 'the vault was read for a caller it refuses');
  } finally {
    await s.close();
  }
});

test('§1: THE OWNER WITH A STALE PROOF IS SENT BACK TO THE VAULT TOO, since the vault asks for a proof in fifteen minutes', async () => {
  const s = await stack();
  try {
    await s.tierB(s.plant(s.owner));
    const stale = s.plant(s.owner, 50 * MINUTE);
    const out = await s.call('/api/slash/propose', stale, { question: 'Which tasks are open?' });
    assert.equal(out.status, 403, `a stale owner session opened the key: ${out.status}`);
    assert.equal(out.body?.refusal?.code, 'FORBIDDEN');
    assert.equal(s.sent.length, 0);
    assert.deepEqual(s.reads(), []);
  } finally {
    await s.close();
  }
});

test("§1: THE OWNER'S OWN FRESH PROPOSE GOES OUT ON HER KEY, and the one grant.read is signed by her and not by system", async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value } = await s.tierB(ada);
    const out = await s.call('/api/slash/propose', ada, { question: 'Which tasks are open?' });
    assert.equal(out.status, 200, out.raw);
    assert.equal(out.body?.value?.['body_kind'], 'rowset');
    assert.equal(s.sent.length, 2);
    assert.ok(s.bearer(s.sent[1]!) === `Bearer ${value}`, "the proposal did not carry the owner's key");
    assert.deepEqual(s.reads(), [s.owner], 'the key was opened under somebody other than the asker');
    /* AND THE KEY IS IN NO RESPONSE AND NO ROW THE ASK WROTE. */
    assert.ok(!out.raw.includes(value), 'the key came back in the answer');
    assert.ok(!JSON.stringify(s.running.sql.all('SELECT * FROM event')).includes(value), 'the key is in the event table');
  } finally {
    await s.close();
  }
});

test('keyOpener SIGNS THE grant.read WITH THE ACTOR IT IS GIVEN, and with system only when it is given none', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value, grant } = await s.tierB(ada);
    /* THE SCHEDULED PATH FIRST, which names nobody and must go on reading `system`, then the asker's. */
    const scheduled = await keyOpener(s.running.api, s.store)({ id: grant, label: 'OpenAI' });
    const asked = await keyOpener(s.running.api, s.store, s.owner)({ id: grant, label: 'OpenAI' });
    assert.ok(scheduled === value && asked === value, 'the opener did not open the key it was handed');
    assert.deepEqual(s.reads(), ['system', s.owner], 'the grant.read events were not signed by the actor each opener was given');
  } finally {
    await s.close();
  }
});

test('§1: BACK ON TIER a, THE GRANT LEFT IN SETTINGS OPENS NO GATE, so a read colleague with a stale proof still proposes', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    await s.tierB(ada);
    /* `configure` keeps `grant_id` when the tier goes back to `a`. Measured with `slashGrantIdOf` answering it on any
       tier: this propose was 403 FORBIDDEN, the vault's sentence for a key nobody was going to send. */
    assert.equal((await s.call('/api/slash/settings', ada, { tier: 'a' })).status, 200);
    const bo = await s.colleague(50 * MINUTE);
    const out = await s.call('/api/slash/propose', bo.sid, { question: 'Which tasks are open?' });
    assert.equal(out.status, 200, `a tier a propose was stopped at the vault: ${out.status} ${out.body?.refusal?.code ?? ''}`);
    assert.ok(s.sent.every((init) => s.bearer(init) === `Bearer ${OPERATOR}`), 'a tier a ask went out on a key other than the operator one');
    assert.deepEqual(s.reads(), [], 'a tier a ask read the vault');
  } finally {
    await s.close();
  }
});

test('§3: ON TIER b AT ask_cap 1, THE SECOND READ IS SLASH_BUDGET_SPENT, because the draft is on this host and its key', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    await s.tierB(ada);
    const cap = await s.call('/api/slash/settings', ada, { ask_cap: 1 });
    assert.equal(cap.status, 200, cap.raw);

    const first = await s.call('/api/slash/read', ada, { question: 'Which tasks are open?' });
    assert.equal(first.status, 200, first.raw);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await s.call('/api/slash/read', ada, { question: 'Which tasks are open?' })).status);
    const second = await s.call('/api/slash/propose', ada, { question: 'Which tasks are open?' });

    assert.deepEqual(statuses, [422, 422, 422, 422], `reads past the cap: ${statuses.join(' ')}`);
    assert.equal(second.body?.refusal?.code, 'SLASH_BUDGET_SPENT', `a propose that drafts went past the cap: ${second.status}`);
    const onOperator = s.sent.filter((init) => s.bearer(init) === `Bearer ${OPERATOR}`).length;
    assert.equal(onOperator, 1, `${s.sent.length} model calls, ${onOperator} of them on the operator key`);
    const status = await s.call('/api/slash/status', ada);
    assert.deepEqual(status.body?.value?.['asks'] && { used: (status.body.value['asks'] as { used: number }).used }, { used: 1 });
  } finally {
    await s.close();
  }
});

test('§3: A PROPOSE ON A STORED ask_id DRAFTS NOTHING ON THIS HOST, so the cap on drafts does not stop it', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { value } = await s.tierB(ada);
    assert.equal((await s.call('/api/slash/settings', ada, { ask_cap: 1 })).status, 200);
    const first = await s.call('/api/slash/read', ada, { question: 'Which tasks are open?' });
    assert.equal(first.status, 200, first.raw);
    const out = await s.call('/api/slash/propose', ada, { question: 'Which tasks are open?', ask_id: first.body?.value?.['ask_id'] });
    assert.equal(out.status, 200, out.raw);
    assert.equal(s.sent.length, 2);
    assert.ok(s.bearer(s.sent[1]!) === `Bearer ${value}`, "the proposal did not go on the owner's key");
  } finally {
    await s.close();
  }
});

test('§5: TIER b NAMING A GRANT THE VAULT HAS NOT GOT IS 422 AT grant_id, and the propose after it still works', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const ghost = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';
    const set = await s.call('/api/slash/settings', ada, { tier: 'b', grant_id: ghost, model: OWNER_MODEL });
    assert.equal(set.status, 422, `a grant that is not there was saved: ${set.raw}`);
    assert.equal(set.body?.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(set.body?.refusal?.at, 'grant_id');
    assert.equal((await s.call('/api/slash/status', ada)).body?.value?.['tier'], 'a', 'the refused tier was written anyway');
    const out = await s.call('/api/slash/propose', ada, { question: 'Which tasks are open?' });
    assert.equal(out.status, 200, `the propose after a refused save was ${out.status} ${out.body?.refusal?.code ?? ''}`);
  } finally {
    await s.close();
  }
});

test('§3: ON TIER byo AT ask_cap 1, THE SECOND READ IS SLASH_BUDGET_SPENT, because byo drafts on this host and its key as b does', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    /* NO GRANT AND NO VAULT: tier `byo` is "your own endpoint", and on this host that endpoint is `SLASH_ENDPOINT` with
       `SLASH_KEY`, the operator's. `46 §4.1` calls the tier unmetered, which is only true of an endpoint the owner pays for. */
    const set = await s.call('/api/slash/settings', ada, { tier: 'byo', model: OWNER_MODEL, ask_cap: 1 });
    assert.equal(set.status, 200, set.raw);

    const first = await s.call('/api/slash/read', ada, { question: 'Which tasks are open?' });
    assert.equal(first.status, 200, first.raw);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await s.call('/api/slash/read', ada, { question: 'Which tasks are open?' })).status);
    const drafting = await s.call('/api/slash/propose', ada, { question: 'Which tasks are open?' });

    assert.deepEqual(statuses, [422, 422, 422, 422], `tier byo reads past the cap: ${statuses.join(' ')}`);
    assert.equal(drafting.body?.refusal?.code, 'SLASH_BUDGET_SPENT', `a tier byo propose that drafts went past the cap: ${drafting.status}`);
    assert.equal(s.sent.length, 1, `${s.sent.length} model calls at ask_cap 1`);
    const status = await s.call('/api/slash/status', ada);
    assert.deepEqual(status.body?.value?.['asks'] && { used: (status.body.value['asks'] as { used: number }).used }, { used: 1 });
  } finally {
    await s.close();
  }
});

test('§5: TIER b NAMING A LIVE GRANT THAT IS NOT AN api_token IS 422 AT grant_id, because 46 §5.9 names that kind alone', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    /* A PASSWORD IS A LIVE KEY IN THE VAULT AND WOULD OPEN, so the existence check passes it: measured before this case,
       the save answered 200 and the next propose went out as `Bearer <the password>` to `SLASH_ENDPOINT`. */
    const value = ['bd_fake_password_', randomBytes(12).toString('hex')].join('');
    const put = await s.call('/api/keys/put', ada, { label: 'Bank login', opens: 'the bank', kind: 'password', value });
    assert.equal(put.status, 200, put.raw);
    const row = s.running.api.kernel.get(String(put.body?.value?.['credential'])) ?? assert.fail('the key row is not there');
    const grant = String(row.fields['value']);
    assert.equal(s.running.api.kernel.grants().find((g) => g.id === grant)?.kind, 'password', 'the premise: the grant is a password');

    const set = await s.call('/api/slash/settings', ada, { tier: 'b', grant_id: grant, model: OWNER_MODEL });
    assert.equal(set.status, 422, `a password grant was saved as Slash's key: ${set.status}`);
    assert.equal(set.body?.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(set.body?.refusal?.at, 'grant_id');
    assert.ok(!set.raw.includes(value), 'the refusal carried the value');
    assert.equal((await s.call('/api/slash/status', ada)).body?.value?.['tier'], 'a', 'the refused tier was written anyway');
    assert.deepEqual(s.reads(), [], 'the refusal opened the grant');
  } finally {
    await s.close();
  }
});

test('§5: A REVOKED GRANT IS NOT A KEY EITHER', async () => {
  const s = await stack();
  try {
    const ada = s.plant(s.owner);
    const { grant } = await s.tierB(ada);
    assert.equal((await s.call('/api/slash/settings', ada, { tier: 'a' })).status, 200);
    assert.ok(s.running.api.kernel.revokeGrant(grant, s.owner).ok);
    /* NO `grant_id` IN THE PATCH: the one still stored from before is what tier `b` would open, so it is what is checked. */
    const set = await s.call('/api/slash/settings', ada, { tier: 'b', model: OWNER_MODEL });
    assert.equal(set.status, 422, `a revoked grant was saved: ${set.raw}`);
    assert.equal(set.body?.refusal?.at, 'grant_id');
  } finally {
    await s.close();
  }
});
