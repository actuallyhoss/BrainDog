/**
 * What a secret or a file field held, followed out of the record: a call a rule queues (SEC-2) and a digest's webhook
 * (KRN-13).
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR (audit fifty-two §3, again on 23 September against this file). `queueCall`'s
 * second line collected the strings the row's secret and file fields held at the moment of the call, and left out a
 * sent field that contained one. So a copy of a key made before the key changed was sent: with `rule.copy` writing
 * `party` from `{{token}}` on create and `rule.post` running `paid_hook` on paid, a grant revoked and deposited again
 * between the two queued `party: '<the old grant id>'`, and so did a token cleared from the row. A file field holds
 * `{ sha256, mime, bytes, name }`, and the loop collected strings only, so a copy of `doc.name` or `doc.sha256` went
 * out with nothing held back. And a run that wrote `party` from the token, parked on a wait, and ran the call after the
 * token changed sent the old value, although the run's own `-unsent` (`flow.ts`) already said `party` was written from
 * a secret.
 *
 * A DIGEST'S `webhook.grant` was named on its CALLS OUT line and gated at accept, and the `notify.webhook` it queued
 * carried the url and the body alone, so no deliverer could have signed the post with it.
 *
 * THE COPY IS PUT IN BY SQL, AS A ROW AN EARLIER BUILD WROTE HOLDS IT. These tests stored a rule that copied the key
 * into `party` past the lint and let it run, and pinned that the row kept the copy. That copy is the leak: every reader
 * of the list sees `party`. Since wave fifty-five the runner refuses it as the lint does (the first test below), so a
 * stored rule no longer makes the copy these tests need, and a record that already holds one is what the second line
 * is for. Where the run's own `-unsent` is the case, the run is put where that build left it, past its write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

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
      { id: 'doc', type: 'file' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

const HOOK: Declaration = {
  id: 'ingest.paid_hook',
  kind: 'ingest',
  body: { ingest: 'paid_hook', channel: 'call', url: 'https://hooks.example.test/paid', trigger: 'rule', grant: 'hook key', sends: ['invoices.what', 'invoices.party'] } as never,
};

const inline = (id: string, when: string, then: unknown[]): Declaration => ({
  id: `rule.${id}`,
  kind: 'rule',
  body: { rule: id, register: 'invoices', when, once_per: ['entry'], then } as never,
});

const onCreate = (id: string, steps: unknown[]): Declaration => ({
  id: `rule.${id}`,
  kind: 'rule',
  body: { rule: id, on: { written: { register: 'invoices', op: ['create'] } }, once_per: ['entry'], steps } as never,
});

/** `rule.post`, which installs clean: it runs the call when a row is paid and writes nothing. */
const POST = inline('post', 'state is paid', [{ run: 'paid_hook' }]);

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

const SEALED = (label: string) => ({ label, opens: 'the provider', kind: 'api_token' as const, ciphertext: b(4), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' });

/**
 * A record holding `rule.copy` as an earlier build stored it, beside whatever else installs clean, or no `rule.copy`
 * at all where `copy` is `null`.
 */
async function record(copy: Declaration | null, ...clean: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const first = await openRecord(sql, clock, { answersSpark: true });
  assert.ok(first.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  value(first.bindGrant({ label: 'hook key', opens: 'hooks.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1') as Result<GrantRow>);
  value(await first.install([INVOICES, HOOK, ...(copy === null ? [] : [inline('copy', 'state is open', [{ tag: 'placeholder' }])]), ...clean]));
  if (copy !== null) sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.copy' AND superseded_at IS NULL", JSON.stringify(copy.body));
  return { k: await openRecord(sql, clock, { answersSpark: true }), sql, clock };
}

const sent = (sql: NodeSql) =>
  sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'pull.fetch' ORDER BY rowid").map((j) => JSON.parse(j.payload) as { ingest: string; row: Record<string, unknown> });

const partyOf = (sql: NodeSql, id: string): unknown => sql.one<{ v: string }>("SELECT json_extract(fields, '$.party') AS v FROM entry WHERE id = ?", id)?.v;

const SCAN = { sha256: 'a'.repeat(64), mime: 'application/pdf', bytes: 1200, name: 'contract-signed.pdf' };
const LATER = { sha256: 'b'.repeat(64), mime: 'application/pdf', bytes: 1300, name: 'contract-v2.pdf' };

/** `party` holding `copy`, written as an earlier build's `rule.copy` wrote it, which no build now does. */
const seeded = (sql: NodeSql, id: string, copy: string): void => {
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.party', ?) WHERE id = ?", copy, id);
};

/* ── the copy itself ──────────────────────────────────────────────────────── */

test('A RULE STORED PAST THE LINT THAT COPIES THE KEY OR THE FILE INTO party IS REFUSED AT RUN TIME, on both paths', async () => {
  /* MEASURED AT HEAD `b7409d2d`, BEFORE THIS CHANGE: each of these wrote the copy into `party` and finished, and the
     tests below this one pinned that the row kept it. `rules.ts` held a `set` out of the run-time check it drew for every
     other verb, and `flow.ts` held a `set` and a `tag` out of its own. */
  const wrong: string[] = [];
  /* INLINE, INSIDE THE WRITE THAT PUTS THE GRANT IN. */
  {
    const { k, sql } = await record(inline('copy', 'state is open', [{ set: { field: 'party', to: '{{token}}' } }]), POST);
    const out = value(k.depositGrant({ register: 'invoices', field: 'token', fields: { what: 'Invoice 41', state: 'open' }, grant: SEALED('service key') }, { actor: 'p_1' }));
    await k.drain();
    const party = partyOf(sql, out.entry.id);
    if (party !== null && party !== undefined) wrong.push(`inline {{token}}: party holds ${String(party)}`);
    const refused = sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused' AND subject LIKE 'invoices.rule.copy.then[0].set.to:%'");
    if (refused.length !== 1) wrong.push(`inline {{token}}: ${refused.length} refusals were observed`);
    sql.close();
  }
  /* AS A RUN, from the key and from each part of a file a call would carry. */
  for (const [what, to, fields] of [
    ['run {{trigger.row.token}}', '{{trigger.row.token}}', {}],
    ['run {{trigger.row.doc.name}}', '{{trigger.row.doc.name}}', { doc: SCAN }],
    ['run {{trigger.row.doc.sha256}}', '{{trigger.row.doc.sha256}}', { doc: SCAN }],
  ] as const) {
    const { k, sql } = await record(onCreate('copy', [{ set: { field: 'party', to } }, { run: 'paid_hook' }]));
    const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', state: 'open', ...fields }, { actor: 'p_1' }));
    sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
    await k.drain();
    const party = partyOf(sql, made.id);
    if (party !== null && party !== undefined) wrong.push(`${what}: party holds ${String(party)}`);
    const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'copy'");
    if (run?.state !== 'failed' || !/secret or file field/.test(run.say ?? '')) wrong.push(`${what}: the run is ${run?.state} ${run?.say ?? ''}`);
    /* AND THE CALL AFTER THE WRITE IS NOT TAKEN, since the run stops at the step it refused. */
    if (sent(sql).length !== 0) wrong.push(`${what}: ${JSON.stringify(sent(sql))}`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

/* ── SEC-2: a copy made before the secret changed ─────────────────────────── */

/**
 * The row is made through the vault door, so `token` holds a real grant id, and `party` is given that id by SQL, as an
 * earlier build's `rule.copy` wrote it in the same write. What happens to `token` after that is the case.
 */
async function copied(): Promise<{ k: Kernel; sql: NodeSql; made: Entry; first: string }> {
  const { k, sql } = await record(null, POST);
  const out = value(k.depositGrant({ register: 'invoices', field: 'token', fields: { what: 'Invoice 41', state: 'open' }, grant: SEALED('service key') }, { actor: 'p_1' }));
  seeded(sql, out.entry.id, out.grant.id);
  await k.drain();
  return { k, sql, made: out.entry, first: out.grant.id };
}

test('A COPY OF A KEY THE ROW NO LONGER NAMES IS NOT SENT: the grant revoked and deposited again after the copy', async () => {
  const { k, sql, made, first } = await copied();
  value(k.revokeGrant(first, 'p_1'));
  const again = value(k.depositGrant({ register: 'invoices', ref: made.id, field: 'token', grant: SEALED('service key') }, { actor: 'p_1' }));
  assert.notEqual(again.grant.id, first, 'the vault rotated the grant in place, so the row still names the copied id');
  value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  const calls = sent(sql);
  assert.equal(calls.length, 1, JSON.stringify(calls));
  assert.deepEqual(calls[0]!.row, { what: 'Invoice 41' }, JSON.stringify(calls));
  /* THE ROW KEEPS THE COPY. Only what leaves is cleaned. */
  assert.equal(partyOf(sql, made.id), first);
  sql.close();
});

test('AND NOT WHEN THE TOKEN IS CLEARED FROM THE ROW after the copy', async () => {
  /* NO PATCH CLEARS A SECRET FIELD (`IMMUTABLE_FIELD`), so this is SQL, as a record an earlier build wrote may hold. */
  const { k, sql, made } = await copied();
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.token') WHERE id = ?", made.id);
  value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  assert.deepEqual(sent(sql).map((c) => c.row), [{ what: 'Invoice 41' }]);
  sql.close();
});

/* ── SEC-2: a file field's name and hash ──────────────────────────────────── */

for (const part of ['name', 'sha256'] as const)
  test(`A COPY OF A FILE FIELD'S ${part.toUpperCase()} IS NOT SENT, as a copy of a secret is not`, async () => {
    const { k, sql } = await record(null, POST);
    const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', doc: SCAN, state: 'open' }, { actor: 'p_1' }));
    seeded(sql, made.id, SCAN[part]);
    await k.drain();
    value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
    await k.drain();
    assert.deepEqual(sent(sql).map((c) => c.row), [{ what: 'Invoice 41' }]);
    sql.close();
  });

test('AND NOT AFTER THE FILE WAS REPLACED: the name it held is in the log, and is held back too', async () => {
  const { k, sql } = await record(null, POST);
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', doc: SCAN, state: 'open' }, { actor: 'p_1' }));
  seeded(sql, made.id, SCAN.name);
  await k.drain();
  value(k.update('invoices', made.id, { doc: LATER }, { actor: 'p_1' }) as Result<unknown>);
  value(k.update('invoices', made.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  assert.equal(partyOf(sql, made.id), 'contract-signed.pdf');
  assert.deepEqual(sent(sql).map((c) => c.row), [{ what: 'Invoice 41' }]);
  sql.close();
});

/* ── SEC-2: the run's carried set ─────────────────────────────────────────── */

test('A RUN THAT WROTE A FIELD FROM THE SECRET DOES NOT SEND IT after the secret changed under its wait', async () => {
  /* PLAINTEXT, NOT A GRANT ID, so the vault's ids cannot be what holds it back: the only thing left that says `party`
     came from `token` is the run's `-unsent`.

     THE RUN IS PUT PAST ITS WRITE AS HEAD `b7409d2d` LEFT IT, since this build refuses the write: the step row says the
     `set` was done, `party` holds what it wrote, and the column holds that build's three keys with `party` under
     `-unsent`. This build then takes the wait itself. */
  const { k, sql, clock } = await record(
    onCreate('copy', [{ set: { field: 'party', to: '{{trigger.row.token}}' } }, { wait: '1h' }, { run: 'paid_hook' }]),
  );
  const made = value<Entry>(k.create('invoices', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter2') WHERE id = ?", made.id);
  seeded(sql, made.id, 'hunter2');
  const run = sql.one<{ id: string }>("SELECT id FROM automation_run WHERE rule = 'copy'")!.id;
  sql.exec("INSERT INTO automation_step (run, n, kind, state, answer, ms, at) VALUES (?, 0, 'set', 'done', NULL, NULL, ?)", run, new Date(NOW).toISOString());
  sql.exec('UPDATE automation_run SET step = 1, vars = ? WHERE id = ?', JSON.stringify({ '-sendable': {}, '-unsent': ['party'], '-sealed': [] }), run);
  await k.drain();
  assert.equal(sql.one<{ state: string }>('SELECT state FROM automation_run WHERE id = ?', run)?.state, 'waiting');
  assert.equal(sent(sql).length, 0, 'the call went before the wait');
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', 'hunter3') WHERE id = ?", made.id);
  clock.advance(2 * 3_600_000);
  await k.drain();
  const calls = sent(sql);
  assert.equal(calls.length, 1, `the run is ${JSON.stringify(sql.all('SELECT state, step FROM automation_run'))}`);
  assert.deepEqual(calls[0]!.row, { what: 'Invoice 41' }, JSON.stringify(calls));
  sql.close();
});

test('WHAT NO SECRET OR FILE EVER HELD IS SENT AS IT WAS, with a key and a file on the row', async () => {
  const { k, sql } = await record(inline('copy', 'state is open', [{ set: { field: 'party', to: 'Fenwick' } }]), POST);
  const out = value(k.depositGrant({ register: 'invoices', field: 'token', fields: { what: 'Invoice 41', doc: SCAN, state: 'open' }, grant: SEALED('service key') }, { actor: 'p_1' }));
  value(k.update('invoices', out.entry.id, { state: 'paid' }, { actor: 'p_1' }) as Result<unknown>);
  await k.drain();
  assert.deepEqual(sent(sql).map((c) => c.row), [{ what: 'Invoice 41', party: 'Fenwick' }]);
  sql.close();
});

/* ── KRN-13: a digest's webhook grant ─────────────────────────────────────── */

const DIGEST = (webhook: Record<string, unknown>, extra: Record<string, unknown> = {}): Declaration => ({
  id: 'digest.weekly',
  kind: 'digest',
  body: {
    digest: 'weekly',
    name: 'Weekly',
    schedule: { day: 'mon', at: '08:00' },
    channels: ['webhook'],
    sections: [{ heading: 'Open', source: 'register.invoices', where: 'state is open', as: 'table', columns: [{ field: 'what' }] }],
    webhook,
    ...extra,
  } as never,
});

async function digested(decl: Declaration, delivers: string[] = ['notify.webhook']): Promise<{ k: Kernel; sql: NodeSql; rows: { kind: string; payload: Record<string, unknown> }[] }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { delivers: delivers as never });
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  value(k.bindGrant({ label: 'collector', opens: 'collector.example.com', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1') as Result<GrantRow>);
  value(await k.install([INVOICES, decl]));
  value<Entry>(k.create('invoices', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'digest', 'weekly', ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
    new Date(NOW).toISOString(),
    JSON.stringify({ declaration: 'digest.weekly' }),
  );
  clock.set(NOW + 1000);
  await k.drain();
  const rows = sql.all<{ kind: string; payload: string }>("SELECT kind, payload FROM outbox WHERE kind IN ('notify.webhook', 'infer.prose') ORDER BY created, id");
  return { k, sql, rows: rows.map((r) => ({ kind: r.kind, payload: JSON.parse(r.payload) as Record<string, unknown> })) };
}

test('A DIGEST WHOSE WEBHOOK DECLARES A GRANT QUEUES A POST THAT NAMES IT, beside the body and never inside it', async () => {
  const { sql, rows } = await digested(DIGEST({ url: 'https://collector.example.com/in', grant: 'collector' }));
  assert.equal(rows.length, 1, JSON.stringify(rows));
  const [hook] = rows;
  assert.equal(hook!.kind, 'notify.webhook');
  assert.equal(hook!.payload.url, 'https://collector.example.com/in');
  assert.equal(hook!.payload.grant, 'collector', `the post names no key to sign it with: ${JSON.stringify(hook!.payload)}`);
  assert.doesNotMatch(String(hook!.payload.body), /collector"|kek_2f/, 'the grant went into what the endpoint reads');
  sql.close();
});

test('AND ONE THAT DECLARES NONE NAMES NONE, so a host cannot sign it with a key nobody approved', async () => {
  const { sql, rows } = await digested(DIGEST({ url: 'https://collector.example.com/in' }));
  assert.equal(rows.length, 1);
  assert.equal('grant' in rows[0]!.payload, false, JSON.stringify(rows[0]!.payload));
  sql.close();
});

test('AND THE PROSE PATH CARRIES THE GRANT THROUGH TO THE POST, since it sends from what the alarm assembled', async () => {
  /* `prose: spark` QUEUES `infer.prose` WITH THE ASSEMBLED DIGEST, and the post is sent from that payload on the ack.
     A grant the alarm read off the declaration and did not put on the assembly would be lost there. */
  const { k, sql, rows } = await digested(DIGEST({ url: 'https://collector.example.com/in', grant: 'collector' }, { prose: 'spark' }), ['notify.webhook', 'infer.prose']);
  assert.deepEqual(rows.map((r) => r.kind), ['infer.prose']);
  assert.equal(rows[0]!.payload.webhook_grant, 'collector', JSON.stringify(Object.keys(rows[0]!.payload)));

  /* AND THE ACK IS WHERE THE POST IS QUEUED, so the post is what is read. The first version of this case stopped at the
     `infer.prose` payload and never acked it, so it said nothing about the post its name promises. */
  const [leased] = k.leaseOutbox(['infer.prose'], 10);
  assert.ok(leased, 'nothing leased the prose job');
  assert.ok(k.ackOutbox({ id: leased.id, state: 'done', leasedUntil: leased.leasedUntil, result: { text: 'One invoice is open. It is not late.' } }).ok);
  const posts = sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'notify.webhook'").map((r) => JSON.parse(r.payload) as Record<string, unknown>);
  assert.equal(posts.length, 1, 'the ack queued no post');
  assert.equal(posts[0]!.grant, 'collector', `the post the ack queued names no key: ${JSON.stringify(posts[0])}`);
  sql.close();
});
