/**
 * Scheduled actions: `call`, `poll`, and the runner that drains them with `pull` (`loop/DIRECTION.md` §0b).
 *
 * THE OWNER'S RULES ARE THE SPINE OF THIS FILE. Fifteen minutes or the provider's floor, refused at
 * declaration. Jitter from the record, the pack and the action, never random. A 401 or a 403 is never
 * retried: the action pauses, the owner is told, and it runs again only when somebody resumes it. Every run
 * is metered from the first. And the record never makes the call or holds the key: the executor here is a
 * stand-in, which is the whole point.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import {
  actionJitterMs,
  openRecord,
  type ActionAnswer,
  type ActionRequest,
  type Declaration,
  type Execute,
  type GrantRow,
  type Kernel,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOUR = 3_600_000;
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

/** The rule a changed balance should reach, and only a changed one. */
const SEEN: Declaration = {
  id: 'rule.seen',
  kind: 'rule',
  body: { rule: 'seen', register: 'notes', when: 'what is 120', then: [{ tag: 'seen' }] } as never,
};

const POLL = (over: Record<string, unknown> = {}, pack?: string): Declaration => ({
  id: 'ingest.balance',
  kind: 'ingest',
  ...(pack === undefined ? {} : { pack }),
  body: {
    ingest: 'balance',
    channel: 'poll',
    url: 'https://api.example.test/v1/balance',
    every: '1h',
    grant: 'example read',
    extract: { what: { after: 'balance ' } },
    writes: { register: 'notes' },
    ...over,
  } as never,
});

const CALL = (over: Record<string, unknown> = {}, pack?: string): Declaration => ({
  id: 'ingest.ping',
  kind: 'ingest',
  ...(pack === undefined ? {} : { pack }),
  body: {
    ingest: 'ping',
    channel: 'call',
    url: 'https://hooks.example.test/in?since={since:date}',
    every: '15m',
    grant: 'hook key',
    project: 'studio',
    body: { text: 'up to {until}', count: 3 },
    ...over,
  } as never,
});

type Clockish = ReturnType<typeof fixedClock>;

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish; keys: Record<string, string> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  const keys: Record<string, string> = {};
  for (const [label, opens] of [['example read', 'api.example.test'], ['hook key', 'hooks.example.test']] as const) {
    const made = k.bindGrant({ label, opens, kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1');
    assert.ok(made.ok, fixOf(made));
    keys[label] = (made.value as GrantRow).id;
  }
  if (decls.length) {
    const out = await k.install([NOTES, ...decls]);
    assert.ok(out.ok, fixOf(out as Result<unknown>));
  }
  for (const pack of new Set(decls.map((d) => d.pack).filter((p): p is string => typeof p === 'string')))
    k.rememberPack({ id: pack, version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack, version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }), checksum: `sum-${pack}` });
  return { k, sql, clock, keys };
}

const said = (status: number, body = ''): ActionAnswer => ({ status, body, bytes: body.length, ms: 3, requests: 1 });

/** A stand-in for the host: it answers in order, repeating the last, and keeps what it was asked. */
function host(...answers: ActionAnswer[]): { execute: Execute; seen: ActionRequest[] } {
  const seen: ActionRequest[] = [];
  return {
    seen,
    execute: async (request) => {
      seen.push(request);
      return answers[Math.min(seen.length - 1, answers.length - 1)]!;
    },
  };
}

const codeOf = (r: Result<unknown>): string => (r.ok ? 'accepted' : 'refusal' in r ? r.refusal.code : 'conflict');
const row = (sql: NodeSql, kind: string, key: string) =>
  sql.one<{ state: string; due_at: string; payload: string; attempts: number }>('SELECT state, due_at, payload, attempts FROM schedule WHERE kind = ? AND key = ?', kind, key);
const meters = (sql: NodeSql, ingest: string) =>
  sql
    .all<{ to_v: string | null; note: string }>("SELECT to_v, note FROM event WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL ORDER BY rowid", `declaration:ingest.${ingest}`)
    .map((e) => ({ ...(JSON.parse(e.to_v!) as { channel: string; host: string; status: number | null; outcome: string; scope: string; usage: Record<string, number> }), note: e.note }));

/* ── rule one: refused at declaration ────────────────────────────────────── */

test('A CALL OR A POLL IS REFUSED AT INSTALL, each fault with its own code', async () => {
  const { k } = await record();
  const refusedWith = async (decl: Declaration) => codeOf(await k.install([NOTES, decl]));

  assert.equal(await refusedWith(POLL({ url: 'http://api.example.test/v1/balance' })), 'ACTION_NOT_HTTPS');
  assert.equal(await refusedWith(CALL({ url: 'https://{grant.host}/in' })), 'ACTION_HOST_COMPUTED');
  assert.equal(await refusedWith(CALL({ url: 'https://user@hooks.example.test/in' })), 'ACTION_HOST_COMPUTED');
  assert.equal(await refusedWith(POLL({ grant: undefined })), 'ACTION_GRANT_MISSING');
  assert.equal(await refusedWith(POLL({ every: '5m' })), 'ACTION_INTERVAL_TOO_SHORT');
  /* THE PROVIDER'S HIGHER FLOOR, and not only ours. */
  assert.equal(await refusedWith(POLL({ every: '30m', floor: '1h' })), 'ACTION_INTERVAL_TOO_SHORT');
  assert.equal(await refusedWith(CALL({ body: { text: '${process.env.HOME}' } })), 'ACTION_EVALUATES');
  assert.equal(await refusedWith(CALL({ url: 'https://hooks.example.test/in?page={page}' })), 'ACTION_EVALUATES');

  /* And a pull under the floor says the same thing, since it is the same rule. */
  assert.equal(
    await refusedWith({ id: 'ingest.npm', kind: 'ingest', body: { ingest: 'npm', channel: 'pull', every: '1m', extract: {}, writes: { register: 'notes' } } as never }),
    'ACTION_INTERVAL_TOO_SHORT',
  );
  assert.equal(await refusedWith(POLL({ every: '1h', floor: '1h' })), 'accepted');
});

/* ── armed, and jittered by arithmetic ───────────────────────────────────── */

test('BOTH ARE ARMED AT INSTALL, due now, and the self-host is told their origins', async () => {
  const { k, sql } = await record(POLL(), CALL());
  assert.deepEqual({ ...row(sql, 'poll', 'balance'), payload: undefined, attempts: undefined }, { state: 'pending', due_at: new Date(NOW).toISOString(), payload: undefined, attempts: undefined });
  assert.equal(row(sql, 'call', 'ping')?.state, 'pending');
  assert.deepEqual(k.actionOrigins(), ['https://api.example.test', 'https://hooks.example.test']);
});

test('JITTER IS DETERMINISTIC from the record, the pack and the action', async () => {
  const every = HOUR;
  const once = actionJitterMs(ID, 'bank', 'balance', every);
  assert.equal(actionJitterMs(ID, 'bank', 'balance', every), once);
  assert.notEqual(actionJitterMs(ID, 'other', 'balance', every), once, 'the pack does not move it');
  assert.notEqual(actionJitterMs(ID, 'bank', 'ledger', every), once, 'the action does not move it');
  assert.notEqual(actionJitterMs('rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', 'bank', 'balance', every), once, 'the record does not move it');
  assert.ok(once >= 0 && once < every / 10 + 1);

  /* And the row re-arms by it: now, plus the interval, plus this record's offset for this action. */
  const { k, sql } = await record(POLL({}, 'bank'));
  await k.runActions(host(said(200, 'balance 120')).execute);
  assert.equal(row(sql, 'poll', 'balance')?.due_at, new Date(NOW + every + actionJitterMs(ID, 'bank', 'balance', every)).toISOString());
});

/* ── the request ─────────────────────────────────────────────────────────── */

test('THE REQUEST NAMES THE KEY AND NEVER CARRIES IT, and a call substitutes and never evaluates', async () => {
  const { k, sql, keys } = await record(CALL());
  const stand = host(said(202, 'accepted'));
  const run = await k.runActions(stand.execute);
  assert.deepEqual({ fired: run.fired, ran: run.ran, ok: run.ok }, { fired: 1, ran: 1, ok: 1 });

  const [request] = stand.seen;
  assert.ok(request);
  assert.deepEqual({ ...request.grant }, { id: keys['hook key'], label: 'hook key' });
  assert.equal(request.method, 'POST');
  assert.equal(request.origin, 'https://hooks.example.test');
  assert.equal(request.url, `https://hooks.example.test/in?since=${new Date(NOW - 15 * 60_000).toISOString().slice(0, 10)}`);
  assert.deepEqual(JSON.parse(request.body!), { text: `up to ${new Date(NOW).toISOString()}`, count: 3 });
  assert.equal(request.timeoutMs, 10_000);
  assert.equal(request.maxBytes, 2_000_000);

  /* THE OUTBOX ROW IS A REFERENCE: which action, which channel, which key by id. */
  const job = sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'pull.fetch'");
  assert.deepEqual(JSON.parse(job!.payload), { channel: 'call', ingest: 'ping', grant: keys['hook key'] });
  assert.doesNotMatch(JSON.stringify(request), /ciphertext|nonce|kek_2f/);
});

/* ── rule four: a refused key pauses, and only a person resumes ──────────── */

test('A 401 IS NEVER RETRIED: the action pauses, an event says so, the owner is told, and only resuming starts it', async () => {
  const { k, sql, clock, keys } = await record(POLL());
  const stand = host(said(401, 'no'), said(200, 'balance 120'));

  const first = await k.runActions(stand.execute);
  assert.equal(first.paused, 1);
  assert.equal(row(sql, 'poll', 'balance')?.state, 'paused');
  assert.ok(sql.one<{ s: string | null }>('SELECT stale_at AS s FROM grant WHERE id = ?', keys['example read']!)?.s, 'the key was not marked stale');
  assert.equal(sql.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'pull.fetch'")?.state, 'done', 'the job walked the ladder');
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry'").length, 0, 'a retry was armed');
  assert.equal(meters(sql, 'balance')[0]?.outcome, 'paused');

  /* THE EXISTING NOTIFICATION PATH: a note event, and the push and the email it queues. */
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:balance'");
  assert.match(note?.note ?? '', /paused/);
  const told = sql.all<{ kind: string }>("SELECT kind FROM outbox WHERE kind IN ('notify.push', 'notify.email') ORDER BY kind").map((r) => r.kind);
  assert.deepEqual(told, ['notify.email', 'notify.push']);

  /* Hours later, nothing has run. */
  clock.advance(6 * HOUR);
  const later = await k.runActions(stand.execute);
  assert.deepEqual({ ran: later.ran, fired: later.fired }, { ran: 0, fired: 0 });
  assert.equal(stand.seen.length, 1);

  assert.equal(codeOf(k.resumeAction('ledger', 'p_1')), 'OUT_OF_BOUNDS');
  assert.ok(k.resumeAction('balance', 'p_1').ok);
  assert.equal(row(sql, 'poll', 'balance')?.state, 'pending');
  assert.match(sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND actor = 'p_1'")?.note ?? '', /resumed/);

  const resumed = await k.runActions(stand.execute);
  assert.deepEqual({ ran: resumed.ran, changed: resumed.changed }, { ran: 1, changed: 1 });
  assert.equal(codeOf(k.resumeAction('balance', 'p_1')), 'OUT_OF_BOUNDS');
});

test('A 403 PAUSES THE SAME WAY, and a key that is not in the vault pauses before anything is sent', async () => {
  const forbidden = await record(CALL());
  const stand = host(said(403));
  assert.equal((await forbidden.k.runActions(stand.execute)).paused, 1);
  assert.equal(row(forbidden.sql, 'call', 'ping')?.state, 'paused');

  const missing = await record(POLL({ grant: 'nobody bound this' }));
  const idle = host(said(200, 'balance 120'));
  await missing.k.runActions(idle.execute);
  assert.equal(idle.seen.length, 0, 'a request went out with no key to send');
  assert.equal(row(missing.sql, 'poll', 'balance')?.state, 'paused');
  assert.match(missing.sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:balance'")?.note ?? '', /not in the vault/);
});

/* ── rule five: metered from the first run ───────────────────────────────── */

test('EVERY RUN IS METERED from the first: runs, requests, bytes, run time and failures, scoped', async () => {
  const { k, sql } = await record(POLL(), CALL());
  await k.runActions(host(said(200, 'balance 120')).execute);

  assert.deepEqual(
    meters(sql, 'ping').map(({ note: _, ...m }) => m),
    [{ channel: 'call', host: 'hooks.example.test', status: 200, outcome: 'ok', scope: 'studio', usage: { runs: 1, requests: 1, bytes: 11, ms: 3, failures: 0 } }],
  );
  assert.deepEqual(
    meters(sql, 'balance').map(({ note: _, ...m }) => m),
    [{ channel: 'poll', host: 'api.example.test', status: 200, outcome: 'changed', scope: 'global', usage: { runs: 1, requests: 1, bytes: 11, ms: 3, failures: 0 } }],
  );
});

/* ── a poll acts only on a change ────────────────────────────────────────── */

test('A POLL FIRES ITS RULE ONLY WHEN THE ANSWER CHANGES, and A, B, A is two changes back', async () => {
  const { k, sql, clock } = await record(POLL(), SEEN);
  const stand = host(said(200, 'balance 120'), said(200, 'balance 120'), said(200, 'balance 130'), said(200, 'balance 120'));
  const outcomes: string[] = [];
  for (let i = 0; i < 4; i++) {
    const run = await k.runActions(stand.execute);
    outcomes.push(run.changed ? 'changed' : run.ok ? 'same' : 'other');
    clock.advance(2 * HOUR);
  }
  assert.deepEqual(outcomes, ['changed', 'same', 'changed', 'changed']);

  const rows = sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'notes' ORDER BY seq").map((r) => JSON.parse(r.fields) as { what: string; tags?: string[] });
  assert.deepEqual(rows.map((r) => r.what), ['120', '130', '120']);
  assert.deepEqual(rows.map((r) => r.tags ?? []), [['seen'], [], ['seen']], 'the rule fired on an answer that did not change');
});

/* ── failures back off, visibly ──────────────────────────────────────────── */

test('A 5XX OR A THROWN EXECUTOR WALKS THE LADDER, as events, and never doubles up while it waits', async () => {
  const { k, sql, clock } = await record(POLL());
  const run = await k.runActions(host(said(503)).execute);
  assert.equal(run.failed, 1);
  const job = sql.one<{ state: string; attempts: number }>("SELECT state, attempts FROM outbox WHERE kind = 'pull.fetch'");
  assert.deepEqual({ ...job }, { state: 'failed', attempts: 1 });
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry'").length, 1, 'no backoff was armed');
  assert.equal(meters(sql, 'balance')[0]?.outcome, 'failed');
  assert.equal(row(sql, 'poll', 'balance')?.state, 'pending', 'a transient failure paused the action');

  /* The next interval fires while the failed job waits on its rung: nothing new is queued. */
  clock.advance(2 * HOUR);
  const waiting = host(said(200, 'balance 120'));
  await k.runActions(waiting.execute);
  assert.equal(sql.all("SELECT 1 FROM outbox WHERE kind = 'pull.fetch'").length, 1);
  assert.equal(waiting.seen.length, 0);

  const thrown = await record(CALL());
  const out = await thrown.k.runActions(async () => {
    throw new Error('socket hang up');
  });
  assert.equal(out.failed, 1);
  assert.match(meters(thrown.sql, 'ping')[0]?.note ?? '', /could not be reached/);
});

/* ── the pack ────────────────────────────────────────────────────────────── */

test('TURNING THE PACK OFF STOPS RE-ARMING, turning it on arms again, and uninstalling sweeps both kinds', async () => {
  const { k, sql } = await record(POLL({}, 'bank'), CALL({}, 'bank'));
  assert.ok(k.disablePack('bank').ok);
  assert.deepEqual(k.actionOrigins(), []);

  const stand = host(said(200, 'balance 120'));
  await k.runActions(stand.execute);
  assert.equal(stand.seen.length, 0);
  assert.equal(row(sql, 'poll', 'balance')?.state, 'done');
  assert.equal(row(sql, 'call', 'ping')?.state, 'done');

  assert.ok((await k.enablePack('bank')).ok);
  assert.equal(row(sql, 'poll', 'balance')?.state, 'pending');
  assert.equal(row(sql, 'call', 'ping')?.state, 'pending');

  k.forgetPack('bank');
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind IN ('call', 'poll')").length, 0);
});
