/**
 * Scheduled actions: `call`, `poll`, and the runner that drains them with `pull`.
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
  summary,
  openRecord,
  type ActionAnswer,
  type ActionRequest,
  type ActionRow,
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
  /* A CALL ALWAYS NAMES ITS KEY. A POLL OF AN ADDRESS THAT NEEDS NONE NAMES NONE (`poll-maps.test.ts`). */
  assert.equal(await refusedWith(CALL({ grant: undefined })), 'ACTION_GRANT_MISSING');
  assert.equal(await refusedWith(POLL({ grant: '' })), 'ACTION_GRANT_MISSING');
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
  /* AND WHICH KEY SEALED IT TRAVELS WITH THE ROW, because the executor is the last place that can
     tell a credential meant for a person from one meant for a run. */
  assert.deepEqual({ ...request.grant }, { id: keys['hook key'], label: 'hook key', sealed_under: 'record' });
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

  /* THE EXISTING NOTIFICATION PATH: a note event, and the email it queues. A push is queued one per owner subscription
     (`push.test.ts`), and nobody on this record has subscribed a phone, so there is none. */
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:balance'");
  assert.match(note?.note ?? '', /paused/);
  const told = sql.all<{ kind: string }>("SELECT kind FROM outbox WHERE kind IN ('notify.push', 'notify.email') ORDER BY kind").map((r) => r.kind);
  assert.deepEqual(told, ['notify.email']);

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

test('A 403 PAUSES THE SAME WAY, and a key that is not in the keychain pauses before anything is sent', async () => {
  const forbidden = await record(CALL());
  const stand = host(said(403));
  assert.equal((await forbidden.k.runActions(stand.execute)).paused, 1);
  assert.equal(row(forbidden.sql, 'call', 'ping')?.state, 'paused');

  const missing = await record(POLL({ grant: 'nobody bound this' }));
  const idle = host(said(200, 'balance 120'));
  await missing.k.runActions(idle.execute);
  assert.equal(idle.seen.length, 0, 'a request went out with no key to send');
  assert.equal(row(missing.sql, 'poll', 'balance')?.state, 'paused');
  assert.match(missing.sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:balance'")?.note ?? '', /not in the keychain/);
});

test('A HOST WITH NO KEY STORE PAUSES THE ACTION ONCE: nothing is sent again, the key is not marked stale, and resuming re-arms it', async () => {
  const { k, sql, clock, keys } = await record(POLL());
  const fix = 'This host holds no key store yet, so the key "example read" was not opened and nothing was sent.';
  const stand = host({ refused: { code: 'WRONG_KEY', fix }, bytes: 0, ms: 1, requests: 0 }, said(200, 'balance 120'));

  const first = await k.runActions(stand.execute);
  assert.deepEqual({ paused: first.paused, refused: first.refused, failed: first.failed }, { paused: 1, refused: 0, failed: 0 });
  assert.equal(row(sql, 'poll', 'balance')?.state, 'paused');
  assert.equal(sql.one<{ s: string | null }>('SELECT stale_at AS s FROM grant WHERE id = ?', keys['example read']!)?.s, null, 'a key nobody tried was marked stale');
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry'").length, 0, 'a retry was armed');
  assert.equal(meters(sql, 'balance')[0]?.outcome, 'paused');
  assert.ok(meters(sql, 'balance')[0]?.note.includes(fix));

  const notes = () => sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:balance'");
  assert.equal(notes().length, 1);
  assert.ok(notes()[0]!.note.includes(fix), 'the owner was not told what the executor said');

  /* The next interval, and the one after: nothing is sent, and nobody is told twice. */
  clock.advance(6 * HOUR);
  const later = await k.runActions(stand.execute);
  assert.deepEqual({ ran: later.ran, fired: later.fired }, { ran: 0, fired: 0 });
  assert.equal(stand.seen.length, 1);
  assert.equal(notes().length, 1);

  assert.ok(k.resumeAction('balance', 'p_1').ok);
  assert.equal(row(sql, 'poll', 'balance')?.state, 'pending');
  const resumed = await k.runActions(stand.execute);
  assert.deepEqual({ ran: resumed.ran, changed: resumed.changed }, { ran: 1, changed: 1 });
  assert.equal(stand.seen.length, 2);
});

/* ── rule five: metered from the first run ───────────────────────────────── */

test('EVERY RUN IS METERED from the first: runs, requests, bytes, run time and failures, scoped', async () => {
  const { k, sql } = await record(POLL(), CALL());
  const run = await k.runActions(host(said(200, 'balance 120')).execute);

  assert.deepEqual(
    meters(sql, 'ping').map(({ note: _, ...m }) => m),
    [{ channel: 'call', host: 'hooks.example.test', status: 200, outcome: 'ok', scope: 'studio', usage: { runs: 1, requests: 1, bytes: 11, ms: 3, failures: 0, held: 0, cpu_ms: 0 }, answer: { status: 200, body: 'balance 120', cut: false } }],
  );
  assert.deepEqual(
    meters(sql, 'balance').map(({ note: _, ...m }) => m),
    [{ channel: 'poll', host: 'api.example.test', status: 200, outcome: 'changed', scope: 'global', usage: { runs: 1, requests: 1, bytes: 11, ms: 3, failures: 0, held: 0, cpu_ms: 0 } }],
  );

  /* AND THE PASS HANDS EVERY RUN BACK, by its event's id, which is what the Directory's ledger counts once. */
  const events = sql.all<{ id: string; ts: string }>("SELECT id, ts FROM event WHERE kind = 'pull' AND to_v IS NOT NULL ORDER BY rowid");
  assert.deepEqual(run.usage.map((m) => [m.event, m.at]), events.map((e) => [e.id, e.ts]));
  assert.deepEqual(run.usage.map((m) => [m.ingest, m.scope, m.usage.runs]).sort(), [['balance', 'global', 1], ['ping', 'studio', 1]]);
});

/* ── the plan's limit ────────────────────────────────────────────────────── */

test('AT THE PLAN’S LIMIT A RUN WAITS FOR THE NEXT MONTH: nothing is sent, nothing is paused, and an event says so', async () => {
  const { k, sql, clock } = await record(CALL());
  const OCTOBER = Date.UTC(2026, 9, 1);
  const say = 'ping is waiting until 1 October. This record has used its 15,000 runs for September.';

  /* The host asks the Directory before it sends, and answers `held` when the record is at its limit. */
  const asked: ActionRequest[] = [];
  const run = await k.runActions(async (request) => {
    asked.push(request);
    return { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: { until: OCTOBER, say } };
  });
  assert.deepEqual([run.held, run.ran, run.ok, run.paused], [1, 0, 0, 0]);
  assert.equal(asked.length, 1);
  assert.deepEqual(
    meters(sql, 'ping').map((m) => ({ outcome: m.outcome, usage: m.usage, note: m.note })),
    [{ outcome: 'held', usage: { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1, cpu_ms: 0 }, note: say }],
  );
  assert.deepEqual(run.usage.map((m) => [m.outcome, m.usage.held]), [['held', 1]]);
  assert.equal(row(sql, 'call', 'ping')?.state, 'pending', 'a held action was paused, so somebody would have to resume it');
  assert.equal(Date.parse(row(sql, 'call', 'ping')?.due_at ?? ''), OCTOBER);
  assert.equal(sql.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'pull.fetch'")?.state, 'done');

  /* Before the month turns nothing fires; when it turns, the action runs on its own. */
  clock.advance(2 * HOUR);
  const early = host(said(200));
  await k.runActions(early.execute);
  assert.equal(early.seen.length, 0, 'a held action ran before the month turned');

  clock.advance(OCTOBER - clock.now());
  const later = host(said(200));
  assert.equal((await k.runActions(later.execute)).ran, 1);
  assert.equal(later.seen.length, 1);
});

test('A TURNED-OFF PACK’S WAITING JOB SENDS NOTHING AND COUNTS NO RUN, and still leaves an event', async () => {
  const { k, sql } = await record(CALL({}, 'bank'));
  await k.runActions(host(said(503)).execute);
  assert.ok(k.disablePack('bank').ok);
  /* Its retry comes round after the pack is off. */
  sql.exec("UPDATE outbox SET state = 'pending' WHERE kind = 'pull.fetch'");

  const stand = host(said(200));
  const run = await k.runActions(stand.execute);
  assert.equal(stand.seen.length, 0);
  assert.deepEqual(run.usage.map((m) => [m.outcome, m.usage.runs, m.usage.requests]), [['dropped', 0, 0]]);
  assert.match(meters(sql, 'ping').at(-1)?.note ?? '', /pack is off/);
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

/* ── the list ────────────────────────────────────────────────────────────── */

test('THE LIST SAYS WHY AN ACTION IS PAUSED, counts a held run in the month, and carries no key', async () => {
  const { k, keys } = await record(POLL(), CALL());
  const OCTOBER = Date.UTC(2026, 9, 1);
  const say = 'ping is waiting until 1 October. This record has used its 15,000 runs for September.';
  await k.runActions(async (request) =>
    request.channel === 'poll' ? said(401, 'no') : { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: { until: OCTOBER, say } },
  );

  const rows = k.actions();
  assert.deepEqual(rows.map((r) => r.ingest), ['balance', 'ping']);
  const [balance, ping] = rows as [ActionRow, ActionRow];
  /* THE LIST AN ACTION FILES IN IS SAID, and `null` for one that files nothing (rates-foot-note-80): a reader finds a
     hand-drafted action by what it writes where its name is its author's own. */
  assert.deepEqual([balance.writes, ping.writes], ['notes', null]);

  assert.deepEqual(
    { channel: balance.channel, project: balance.project, host: balance.host, every: balance.every, key: balance.key, state: balance.state, next: balance.next },
    { channel: 'poll', project: null, host: 'api.example.test', every: '1h', key: 'example read', state: 'paused', next: null },
  );
  assert.deepEqual({ outcome: balance.last?.outcome, status: balance.last?.status }, { outcome: 'paused', status: 401 });
  assert.match(balance.last?.note ?? '', /answered 401 to the key "example read"/);
  assert.deepEqual(balance.month, { runs: 1, requests: 1, bytes: 2, ms: 3, failures: 1, held: 0 });
  assert.equal(balance.days.length, 15);
  assert.deepEqual(balance.days[0], { day: '2026-09-01', runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0 });
  assert.deepEqual(balance.days.at(-1), { day: '2026-09-15', runs: 1, requests: 1, bytes: 2, ms: 3, failures: 1 });

  assert.deepEqual(
    { project: ping.project, key: ping.key, state: ping.state, outcome: ping.last?.outcome, note: ping.last?.note },
    { project: 'studio', key: 'hook key', state: 'pending', outcome: 'held', note: say },
  );
  assert.equal(Date.parse(ping.next ?? ''), OCTOBER);
  assert.deepEqual(ping.month, { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1 });

  const said_ = JSON.stringify(rows);
  assert.doesNotMatch(said_, /ciphertext|nonce|kek_2f/);
  for (const id of Object.values(keys)) assert.ok(!said_.includes(id), 'a grant id reached the list');
});

/* ── a call a rule runs, and the one press that approves it ─────────────── */

const INVOICES: Declaration = {
  id: 'register.invoices',
  kind: 'register',
  body: {
    id: 'invoices',
    name: 'Invoices',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text' },
      { id: 'token', type: 'secret' },
      { id: 'scan', type: 'file' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

/** A call only a rule runs: no clock, and the two fields it sends. */
const HOOK = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.paid_hook',
  kind: 'ingest',
  body: {
    ingest: 'paid_hook',
    channel: 'call',
    url: 'https://hooks.example.test/paid',
    trigger: 'rule',
    grant: 'hook key',
    sends: ['invoices.what', 'invoices.party'],
    ...over,
  } as never,
});

const PAID = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'rule.paid',
  kind: 'rule',
  body: { rule: 'paid', register: 'invoices', when: 'state is paid', once_per: ['entry'], then: [{ run: 'paid_hook' }], ...over } as never,
});

const callJobs = (sql: NodeSql) =>
  sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'pull.fetch' ORDER BY rowid").map((j) => JSON.parse(j.payload) as Record<string, unknown>);

const bodyOf = <T>(sql: NodeSql, id: string): T => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as T;

test('A RULE RUNS A CALL ONCE PER ROW, and the call sends only the fields its sends names', async () => {
  const { k, sql, keys } = await record(INVOICES, HOOK({ body: { text: '{row.what} is paid', who: '{row.party}' } }), PAID());
  /* A call only a rule runs still has its row, for pausing and the list. */
  assert.equal(row(sql, 'call', 'paid_hook')?.state, 'pending');

  const made = k.create('invoices', { what: 'Invoice 41', party: 'Fenwick', state: 'paid' }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  const id = (made.value as { id: string }).id;
  assert.deepEqual(callJobs(sql), [
    { channel: 'call', ingest: 'paid_hook', grant: keys['hook key'], rule: 'paid', entry: id, row: { what: 'Invoice 41', party: 'Fenwick' } },
  ]);

  /* ONCE PER ROW: writing it again sends nothing new, and a row the rule does not match sends nothing. */
  assert.ok(k.update('invoices', 'invoices#1', { party: 'Fenwick Cloud' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('invoices', { what: 'Invoice 42', state: 'open' }, { actor: 'p_1' }).ok);
  assert.equal(callJobs(sql).length, 1);

  const stand = host(said(202, 'ok'));
  const run = await k.runActions(stand.execute);
  assert.equal(run.ran, 1, 'the rule-only row fired a scheduled run as well');
  const [request] = stand.seen;
  assert.ok(request);
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://hooks.example.test/paid');
  assert.deepEqual(JSON.parse(request.body!), { text: 'Invoice 41 is paid', who: 'Fenwick' });
  assert.doesNotMatch(JSON.stringify(request), /ciphertext|nonce|kek_2f/);

  /* AND A DEAD-LETTER SUMMARY NEVER QUOTES THE FIELDS. */
  const job = sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'pull.fetch'");
  assert.equal(summary(job!.payload).row, '--withheld--');
});

test('THE HUNDRED AND FIRST CALL IN A DAY IS HELD, with one sentence, and counts as held rather than failed', async () => {
  const { k, sql } = await record(INVOICES, HOOK(), PAID());
  for (let i = 1; i <= 102; i++) assert.ok(k.create('invoices', { what: `Invoice ${i}`, state: 'paid' }, { actor: 'p_1' }).ok);
  assert.equal(callJobs(sql).length, 100);

  const held = meters(sql, 'paid_hook');
  assert.deepEqual(held.map((m) => m.outcome), ['held', 'held']);
  assert.equal(held[0]!.note, 'paid_hook did not send invoices#101: it has made its 100 calls from rules today. That row will not be sent later; rules can start it again tomorrow.');
  assert.equal(row(sql, 'call', 'paid_hook')?.state, 'pending', 'a held call is not a paused action');
});

test('A CALL A RULE RUNS PAUSES WHEN ITS KEY IS GONE, and queues nothing while it is paused', async () => {
  const { k, sql } = await record(INVOICES, HOOK({ grant: 'absent key' }), PAID());
  assert.ok(k.create('invoices', { what: 'Invoice 1', state: 'paid' }, { actor: 'p_1' }).ok);
  assert.equal(callJobs(sql).length, 0);
  assert.equal(row(sql, 'call', 'paid_hook')?.state, 'paused');
  assert.ok(k.create('invoices', { what: 'Invoice 2', state: 'paid' }, { actor: 'p_1' }).ok);
  assert.equal(callJobs(sql).length, 0);
});

test('APPLYING A RULE TO ROWS ALREADY THERE QUEUES NO CALLS, says how many it skipped, and a later edit sends none', async () => {
  const { k, sql } = await record(INVOICES, HOOK());
  for (let i = 1; i <= 3; i++) assert.ok(k.create('invoices', { what: `Invoice ${i}`, state: 'paid' }, { actor: 'p_1' }).ok);
  assert.ok((await k.install([PAID()])).ok);

  const dry = k.applyRule('paid', { dry: true });
  assert.ok(dry.ok, fixOf(dry));
  assert.equal(dry.value.calls_skipped, 3);
  const applied = k.applyRule('paid');
  assert.ok(applied.ok, fixOf(applied));
  assert.equal(applied.value.calls_skipped, 3);
  assert.equal(callJobs(sql).length, 0);

  assert.ok(k.update('invoices', 'invoices#1', { party: 'Fenwick' }, { actor: 'p_1' }).ok);
  assert.equal(callJobs(sql).length, 0, 'an old row sent its call on its next edit');
  /* A row written after it is news, so it sends. */
  assert.ok(k.create('invoices', { what: 'Invoice 4', state: 'paid' }, { actor: 'p_1' }).ok);
  assert.equal(callJobs(sql).length, 1);
});

test('A RULE THAT RUNS A CALL, AND THE CALL, ARE REFUSED AT INSTALL when they could send what nobody approved', async () => {
  const { k } = await record();
  const refusedWith = async (...decls: Declaration[]) => codeOf(await k.install([NOTES, INVOICES, ...decls]));

  assert.equal(await refusedWith(HOOK(), PAID({ then: [{ run: 'nothing_here' }] })), 'DECLARATION_UNKNOWN');
  assert.equal(await refusedWith(HOOK(), PAID({ once_per: undefined })), 'REQUIRED_MISSING');
  assert.equal(await refusedWith(CALL(), PAID({ then: [{ run: 'ping' }] })), 'DECLARATION_INVALID');
  /* NEVER A SECRET OR A FILE. */
  assert.equal(await refusedWith(HOOK({ sends: ['invoices.token'] })), 'DECLARATION_INVALID');
  assert.equal(await refusedWith(HOOK({ sends: ['invoices.scan'] })), 'DECLARATION_INVALID');
  assert.equal(await refusedWith(HOOK({ sends: ['invoices.nope'] })), 'FIELD_UNKNOWN');
  assert.equal(await refusedWith(HOOK({ sends: ['ledger.what'] })), 'REGISTER_UNKNOWN');
  assert.equal(await refusedWith(HOOK({ sends: ['invoices.what', 'notes.what'] })), 'DECLARATION_INVALID');
  /* A rule-only call has no clock, and a scheduled one has no row. */
  assert.equal(await refusedWith(HOOK({ every: '1h' })), 'DECLARATION_INVALID');
  assert.equal(await refusedWith(HOOK({ trigger: undefined, every: '1h' })), 'DECLARATION_INVALID');
  assert.equal(await refusedWith(POLL({ trigger: 'rule' })), 'DECLARATION_INVALID');
  /* A row's field only in the body, and only one it sends. */
  assert.equal(await refusedWith(HOOK({ url: 'https://hooks.example.test/{row.what}' })), 'ACTION_EVALUATES');
  assert.equal(await refusedWith(HOOK({ body: { text: '{row.token}' } })), 'ACTION_EVALUATES');

  assert.equal(await refusedWith(HOOK({ trigger: 'both', every: '1h' }), PAID()), 'accepted');
});

test('AN AGENT PROPOSES ITS ACTIONS AS ONE CHANGE: every host, how often, the key and the fields, and one press arms them all', async () => {
  const { k, sql } = await record(INVOICES);
  const proposed = k.propose(
    {
      question: 'Send paid invoices to the studio hook?',
      body_kind: 'change',
      /* What the proposer says about its own egress is dropped, and the record's reading stored instead. */
      body: { declaration_id: 'ingest.paid_hook', to: { declarations: [CALL(), HOOK(), PAID()] }, egress: [{ host: 'friendly.example.test' }] },
    },
    'p_1',
  );
  assert.ok(proposed.ok, fixOf(proposed));
  const sg = (proposed.value as { id: string }).id;
  const body = bodyOf<{
    egress: { ingest: string; host: string; every: string | null; per_day: number | null; key: string; sends: string[] }[];
    approve: string[];
  }>(sql, sg);
  assert.deepEqual(
    body.egress.map((e) => [e.ingest, e.host, e.every, e.per_day, e.key, e.sends]),
    [
      ['ping', 'hooks.example.test', '15m', null, 'hook key', []],
      ['paid_hook', 'hooks.example.test', null, 100, 'hook key', ['invoices.what', 'invoices.party']],
    ],
  );
  assert.deepEqual(body.approve, [
    'CALLS OUT hooks.example.test · every 15m · grant "hook key"',
    `ping runs for the project studio and sends the key "hook key".`,
    'CALLS OUT hooks.example.test · when a rule runs it, at most 100 a day · grant "hook key" · sends invoices.what, invoices.party',
    /* AND WHO CAN OPEN THE KEY, ONCE AT THE END: a scheduled action opens it with nobody present.
       Under every keyed line it would be the same sentence three times; here it is the record's own
       fact, said once. */
    'A scheduled action opens this key with nobody present, so the server that runs it can open it too.',
  ]);
  /* NOTHING IS ARMED BY ASKING. */
  assert.ok(!row(sql, 'call', 'ping'));
  assert.ok(!row(sql, 'call', 'paid_hook'));

  const decided = k.decide(sg, { decide: { option: 'accept', reason: 'the owner read the hosts' } }, 'p_1');
  assert.ok(decided.ok, fixOf(decided));
  const install = (decided.value as { install?: unknown }).install;
  assert.ok(install);
  const put = await k.install([install as never]);
  assert.ok(put.ok, fixOf(put as Result<unknown>));
  assert.equal(row(sql, 'call', 'ping')?.state, 'pending');
  assert.equal(row(sql, 'call', 'paid_hook')?.state, 'pending');
  const decision = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'decide' ORDER BY rowid DESC LIMIT 1");
  assert.deepEqual((JSON.parse(decision!.to_v) as { approved?: string[] }).approved, body.approve);

  /* AND ONLY WHAT CHANGED ASKS AGAIN. The same actions carry no lines; a different field list does. */
  const same = k.propose({ question: 'Again?', body_kind: 'change', body: { declaration_id: 'ingest.ping', to: { declarations: [CALL()] } } }, 'p_1');
  assert.ok(same.ok, fixOf(same));
  assert.equal(bodyOf<Record<string, unknown>>(sql, (same.value as { id: string }).id).approve, undefined);
  const narrower = k.propose({ question: 'Send only the name?', body_kind: 'change', body: { declaration_id: 'ingest.paid_hook', to: HOOK({ sends: ['invoices.what'] }) } }, 'p_1');
  assert.ok(narrower.ok, fixOf(narrower));
  assert.deepEqual(bodyOf<{ approve: string[] }>(sql, (narrower.value as { id: string }).id).approve, [
    'CALLS OUT hooks.example.test · when a rule runs it, at most 100 a day · grant "hook key" · sends invoices.what',
    'A scheduled action opens this key with nobody present, so the server that runs it can open it too.',
  ]);
});

test('DECLINING ARMS NOTHING, a proposal that would not install is refused when filed, and accepting waits for every key', async () => {
  const { k, sql } = await record(INVOICES);
  const ask = (decls: Declaration[]) => {
    const p = k.propose({ question: 'Turn these on?', body_kind: 'change', body: { declaration_id: decls[0]!.id, to: { declarations: decls } } }, 'p_1');
    assert.ok(p.ok, fixOf(p));
    return (p.value as { id: string }).id;
  };

  const declined = k.decide(ask([CALL(), POLL()]), { decide: { option: 'reject', reason: 'not these hosts' } }, 'p_1');
  assert.ok(declined.ok, fixOf(declined));
  assert.equal((declined.value as { install?: unknown }).install, undefined);
  assert.ok(!row(sql, 'call', 'ping'));
  assert.ok(!row(sql, 'poll', 'balance'));

  /* A secret in sends is refused before anybody is asked. */
  const bad = k.propose({ question: 'Send the token?', body_kind: 'change', body: { declaration_id: 'ingest.paid_hook', to: HOOK({ sends: ['invoices.token'] }) } }, 'p_1');
  assert.equal(codeOf(bad), 'DECLARATION_INVALID');

  const gone = ask([CALL({ grant: 'absent key' })]);
  const waiting = k.decide(gone, { decide: { option: 'accept', reason: 'yes' } }, 'p_1');
  assert.equal(codeOf(waiting), 'REQUIRED_MISSING');
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', gone)?.status, 'open');
});

/* ── the key a connector's approval needs ────────────────────────────────── */

/** A connector: it says how to page, so its credential is opened by `sealedGrant` and the connector key. */
const PAGER = (grant: string): Declaration => ({
  id: 'ingest.acme-charges',
  kind: 'ingest',
  body: {
    ingest: 'acme-charges',
    channel: 'pull',
    every: '1h',
    grant,
    map: { what: { path: 'id', type: 'text' } },
    fetch: {
      base: 'https://api.example.test',
      path: '/v1/charges',
      auth: { kind: 'none' },
      schedule: { every: '1h' },
      page: { kind: 'page_number', param: 'page' },
      read: { rows: 'data' },
    },
    writes: { register: 'notes' }, dedupe: ['what'],
  } as never,
});

test('ACCEPTING A CONNECTOR WHOSE KEY WAS SEALED FOR A PERSON IS REFUSED BEFORE IT IS ARMED', async () => {
  /* THE FAILURE THIS STOPS. `sealedGrant` refuses a record-sealed key on the first run, and by then
     somebody has approved the action: it reads as approved, it is armed, and it does nothing. That
     is the same shape `REQUIRED_MISSING` already refuses a MISSING key to avoid, with a longer
     fuse, and the keychain is the only party that can tell the difference. */
  const { k, sql, keys } = await record(INVOICES);
  const asked = k.propose(
    { question: 'Pull charges?', body_kind: 'change', body: { declaration_id: 'ingest.acme-charges', to: PAGER(keys['example read']!) } },
    'p_1',
  );
  assert.ok(asked.ok, fixOf(asked));
  const id = (asked.value as { id: string }).id;

  const refused = k.decide(id, { decide: { option: 'accept', reason: 'yes' } }, 'p_1');
  assert.equal(codeOf(refused), 'OUT_OF_BOUNDS');
  /* AND IT SAYS WHAT TO DO, because the person reading it deposited this key themselves. */
  assert.match((refused as { refusal: { fix: string } }).refusal.fix, /under the connector/);
  /* NOTHING WAS DECIDED. The question is still open, so accepting again after re-sealing works. */
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status, 'open');
  assert.ok(!row(sql, 'pull', 'acme-charges'));
  sql.close();
});

test('and the same connector is accepted once its key is sealed under the connector', async () => {
  const { k, sql } = await record(INVOICES);
  const made = k.bindGrant(
    { label: 'acme', opens: 'api.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f', sealed_under: 'connector' },
    'p_1',
  );
  assert.ok(made.ok, fixOf(made));
  const asked = k.propose(
    { question: 'Pull charges?', body_kind: 'change', body: { declaration_id: 'ingest.acme-charges', to: PAGER((made.value as GrantRow).id) } },
    'p_1',
  );
  assert.ok(asked.ok, fixOf(asked));

  const decided = k.decide((asked.value as { id: string }).id, { decide: { option: 'accept', reason: 'yes' } }, 'p_1');
  assert.ok(decided.ok, fixOf(decided));
  sql.close();
});

test('A CALL IS NOT HELD TO THE CONNECTOR KEY, because it opens its own through the record key', async () => {
  /* `openGrant` unwraps the RECORD key and `sealedGrant` the connector one (`12 §6`). A check that
     did not know the difference would refuse every `call` and `poll` in the record — which is what
     the first version of this check did, and what this test exists to stop coming back. */
  const { k, sql } = await record(INVOICES);
  const asked = k.propose(
    { question: 'Turn the hook on?', body_kind: 'change', body: { declaration_id: 'ingest.paid_hook', to: { declarations: [CALL(), HOOK(), PAID()] } } },
    'p_1',
  );
  assert.ok(asked.ok, fixOf(asked));
  const decided = k.decide((asked.value as { id: string }).id, { decide: { option: 'accept', reason: 'the owner read the hosts' } }, 'p_1');
  assert.ok(decided.ok, fixOf(decided));
  sql.close();
});
