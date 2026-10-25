/**
 * Whose name a trial opens the owner's key in: a draft script run by `scriptTry` (`@braindog/host/script-try`) and the
 * `grant.read` it leaves in the keychain's log.
 *
 * A TRIAL HAS AN ASKER AND A SCHEDULED RUN HAS NONE, AND THE SELF-HOST OPENED BOTH AS `system`. `server.ts` handed the
 * trial the opener it builds for the scheduled pass, `keyOpener(api, options.keys)`, whose actor defaults to `system`,
 * so the owner trying her own draft left a `grant.read` the keychain's log could not tell from the nightly run's. Slash's
 * included key had the same fault and was fixed by threading the asker's id to `keyOpener`
 * (`packages/host/src/slash.ts`, `slashAskerEngine`, and `slash-byok-guard.test.ts`, "signed by her and not by system").
 *
 * THE WHOLE JOIN, BECAUSE THE FAULT IS IN THE JOIN. A key put in through `/api/keys/put` from the owner's fresh session,
 * sealed by this host's real key store, the draft passed through the record's own `scriptTry` with its guard and body
 * check, run in QuickJS, the key opened by `keyOpener` and sent by the `send` double below. The double stands for the
 * socket only, so the `grant.read` read back at the end is the row the kernel wrote.
 *
 * NO KEY IS PRINTED, for `slash-byok-guard.test.ts`'s reason: a comparison that touches it is `assert.ok(x === y)`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { Send } from '../src/actions.ts';
import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GOLD = 'https://api.gold.test';

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

const GOLD_LIST = {
  id: 'register.gold',
  kind: 'register' as const,
  body: { id: 'gold', name: 'Gold', title: 'at', fields: [{ id: 'at', type: 'text', required: true }] } as never,
};

/** A draft that fetches the gold rate with the owner's key, as an agent would bring it to `script_try`. */
const DRAFT = {
  script: 'gold-rate',
  runs: { every: '1d' },
  egress: [GOLD],
  keys: ['goldapi'],
  reads: [],
  writes: ['gold'],
  source: `export default async function run(ctx) {
  const r = await ctx.fetch('${GOLD}/rate', { key: 'goldapi' });
  ctx.write('gold', { at: String(r.status) });
}`,
};

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-script-try-asker-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const sent: { url: string; auth: string | null }[] = [];
  const send: Send = async (url, init) => (sent.push({ url: url.href, auth: new Headers(init.headers).get('authorization') }), new Response('{}'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey,
    keys: store,
    pollMs: 0,
    /* NO `openKey` HERE, which is the point: the trial's opener is the one `server.ts` builds over `keys`. */
    actions: { send, resolve: async () => [{ address: '93.184.216.34', family: 4 }] },
  });
  const origin = `http://localhost:${(running.server.address() as { port: number }).port}`;

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
  assert.ok((await running.api.kernel.install([KEYS, GOLD_LIST])).ok);

  /* A SESSION FOR ADA, planted as `slash-byok-guard.test.ts` plants one, proved at `authedAt`. The keychain door takes a key
     only from an owner whose proof is under fifteen minutes old, so the key goes in through a fresh one. */
  const plant = (authedAt: number): string => {
    const sid = randomBytes(32).toString('base64url');
    const db = new DatabaseSync(join(dir, 'directory.sqlite'));
    try {
      const now = Date.now();
      db.prepare('INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(createHmac('sha256', sessionKey).update(`s:${sid}`).digest('hex'), owner, REC, now + 60 * MINUTE, now, authedAt);
    } finally {
      db.close();
    }
    return sid;
  };
  const sid = plant(Date.now());
  const value = ['bd_fake_gold_', randomBytes(16).toString('hex')].join('');
  const put = await fetch(`${origin}/api/keys/put`, {
    method: 'POST',
    headers: { cookie: `bd_s=${sid}`, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'goldapi', opens: 'api.gold.test', value }),
  });
  assert.equal(put.status, 200, await put.text());

  return {
    running,
    owner,
    plant,
    /** One call over HTTP with a session's cookie, as the app sends it. */
    async call(cookie: string, name: string, body: unknown): Promise<{ status: number; text: string }> {
      const r = await fetch(`${origin}/api/${name}`, { method: 'POST', headers: { cookie: `bd_s=${cookie}`, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, text: await r.text() };
    },
    value,
    sent,
    reads: () => running.sql.all<{ actor: string }>("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").map((e) => e.actor),
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("THE OWNER'S TRIAL OPENS HER KEY IN HER NAME, and the grant.read it leaves is signed by her and not by system", async () => {
  const s = await stack();
  try {
    const tried = await s.running.api.scriptTry({ body: DRAFT }, { principal: { kind: 'person', id: s.owner, level: 'owner' } });
    assert.ok(tried.ok, JSON.stringify(tried));
    /* THE WITNESS THAT A KEY WAS OPENED AT ALL: without it an empty log would pass the assertion below by opening nothing. */
    assert.equal(s.sent.length, 1, JSON.stringify(tried.value));
    assert.ok(s.sent[0]!.auth === `Bearer ${s.value}`, 'the trial did not send the owner key it opened');
    assert.deepEqual(s.reads(), [s.owner], 'the grant.read was not signed by the owner who asked for the trial');
  } finally {
    await s.close();
  }
});

/*
 * A TRIAL OPENED THE OWNER'S KEY FOR A SESSION THE KEYCHAIN ITSELF REFUSES. The record
 * handed the trial the keychain on `level === 'owner'` alone, and the keychain's own gate asks one thing more, a proof under
 * fifteen minutes old. Measured on this stack: a session proved two hours ago was refused `listGrants` with
 * `NEEDS_BROWSER_SESSION`, and the same cookie's `scriptTry` sent one request carrying the owner's key and left a
 * `grant.read` signed with her id, for an opening her session could not have made. A cookie is thirty days of standing
 * access, and the draft chooses the origin, so the trial was what a laptop left open reached.
 */
test('A SESSION PROVED TWO HOURS AGO IS REFUSED THE KEYCHAIN, AND ITS TRIAL SENDS NO KEY, opens nothing and is told to sign in again', async () => {
  const s = await stack();
  try {
    const stale = s.plant(Date.now() - 120 * MINUTE);
    /* V1, THE WITNESS THAT THE KEYCHAIN REFUSES THIS SESSION, so the case below is about the trial and not the cookie. */
    const v1 = await s.call(stale, 'listGrants', {});
    assert.equal(v1.status, 403, v1.text);
    assert.match(v1.text, /NEEDS_BROWSER_SESSION/);

    const v2 = await s.call(stale, 'scriptTry', { body: DRAFT });
    /* THE TRIAL STILL RUNS, KEYLESS, rather than being refused whole: the answer is the run's, with the fetch refused. */
    assert.equal(v2.status, 200, v2.text);
    assert.equal(s.sent.length, 0, 'the trial of a session the keychain refuses sent a request');
    assert.deepEqual(s.reads(), [], 'the trial of a session the keychain refuses opened the owner key');
    assert.match(v2.text, /Sign in again to try it with the key/, `the trial did not say why the key stayed shut: ${v2.text}`);
  } finally {
    await s.close();
  }
});

test('A SESSION PROVED A MINUTE AGO TRIES THE SAME DRAFT WITH THE KEY, so the gate above is the proof and not the cookie', async () => {
  const s = await stack();
  try {
    const fresh = s.plant(Date.now() - MINUTE);
    const tried = await s.call(fresh, 'scriptTry', { body: DRAFT });
    assert.equal(tried.status, 200, tried.text);
    assert.equal(s.sent.length, 1, tried.text);
    assert.ok(s.sent[0]!.auth === `Bearer ${s.value}`, 'the fresh trial did not send the owner key');
    assert.deepEqual(s.reads(), [s.owner]);
  } finally {
    await s.close();
  }
});
