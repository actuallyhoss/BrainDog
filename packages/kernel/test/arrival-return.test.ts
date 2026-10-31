/**
 * An arrival a person filed or archived goes back to the inbox: `returnArrival`.
 *
 * THERE WAS NO WAY BACK. `fileArrival` and `archiveArrival` each move an arrival out of `untriaged` or `review` and
 * nothing moved one in again, so a person who filed a message into the wrong list had a row to delete by hand and an
 * arrival the inbox would never show them again. The DDL (`0001_kernel.ts:202`) forbids no move back; only the verb was
 * missing, and every case below failed first on `k.returnArrival is not a function`.
 *
 * THE LAST CASE IS A RESCUE. A return makes an unverified arrival rescuable again, because the ingest re-runs an
 * `untriaged` row whose `reason` is `UNVERIFIED` when a verified delivery brings the same bytes (`ingest.ts:669-673`),
 * and the rescue files a row with no `state` event. `filedAs` read the newest event whose `to_v` was `matched`, which
 * is the person's old filing, so the return would archive a row it had already archived and `fileArrival` would answer
 * "already filed" with that dead row. Only the arrival's NEWEST `state` event may be read as a person's settlement, and
 * only when it put the arrival where it is now.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, conflicted, fixOf, type Result } from '@braindog/ports';

import { openRecord, type ArrivalSettled, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const PERSON = { actor: 'p_1' };

const REGISTER = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
});

/* One webhook pattern, so there is an arrival an ingest filed and a door an unverified arrival can be rescued at. */
const HOOK: Declaration = {
  id: 'ingest.bank-out',
  kind: 'ingest',
  body: {
    ingest: 'bank-out',
    channel: 'webhook',
    match: { all: [{ field: 'body', contains: 'paid' }] },
    extract: { merchant: { text: { between: ['You paid ', ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register: 'out', confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
};

const PAID = 'You paid Carrefour EGP 120.00 today.';

/* An email pattern that files at `needs-review`, so there is an arrival waiting in `review` rather than `untriaged`. */
const HELD: Declaration = {
  id: 'ingest.bank-held',
  kind: 'ingest',
  body: {
    ingest: 'bank-held',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'held:' }] },
    extract: { merchant: { text: { between: ['You paid ', ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register: 'out', confidence: 'needs-review' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([REGISTER('out'), REGISTER('notes'), HOOK, HELD]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
};

const email = (k: Kernel, subject: string): string =>
  value(k.arrive({ channel: 'email', headers: { from: 'a@example.com', subject }, body: `About ${subject}.`, sha256: subject })).raw;

const stateEvents = (sql: NodeSql, raw: string): { from_v: string | null; to_v: string | null; batch: string | null }[] =>
  sql.all("SELECT from_v, to_v, batch FROM event WHERE target = ? AND kind = 'state' ORDER BY rowid", `inbox_raw:${raw}`);
const stateOf = (sql: NodeSql, raw: string): string | undefined => sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', raw)?.state;
const waiting = (k: Kernel): string[] => k.inboxBefore(null, 50).map((a) => a.id);

test('A FILED ARRIVAL GOES BACK TO THE STATE IT CAME FROM, and the row it became is archived in the same batch', async () => {
  const { k, sql } = await record();
  const raw = email(k, 'Invoice 7');
  assert.equal(stateOf(sql, raw), 'untriaged');
  const filed = value(k.fileArrival(raw, 'notes', null, PERSON));
  assert.ok(filed.entry);
  assert.ok(!waiting(k).includes(raw));

  const back = value<ArrivalSettled>(k.returnArrival(raw, filed.entry.version, PERSON));
  assert.deepEqual([back.state, back.already], ['untriaged', false]);
  assert.ok(waiting(k).includes(raw), 'the inbox does not list it again');
  assert.equal(k.inboxBefore(null, 50).find((a) => a.id === raw)?.state, 'untriaged');

  const row = sql.one<{ deleted_at: string | null }>('SELECT deleted_at FROM entry WHERE id = ?', filed.entry.id);
  assert.notEqual(row?.deleted_at, null, 'the row it was filed as is still live');
  assert.equal(k.count('notes'), 0);

  /* THE STATE LINE AND THE ROW'S ARCHIVE ARE ONE BATCH, the way the filing's `create` and its state line are. */
  const events = stateEvents(sql, raw);
  assert.equal(events.length, 2);
  const returned = events[1]!;
  assert.deepEqual([returned.from_v, returned.to_v], ['"matched"', '"untriaged"']);
  const kinds = sql.all<{ kind: string; target: string }>('SELECT kind, target FROM event WHERE batch = ? ORDER BY rowid', returned.batch);
  assert.deepEqual(kinds.map((e) => e.kind).sort(), ['delete', 'state']);
  assert.ok(kinds.some((e) => e.target === `entry:${filed.entry!.id}`));

  /* A SECOND RETURN IS THE SAME ANSWER AND WRITES NOTHING. */
  const again = value<ArrivalSettled>(k.returnArrival(raw, filed.entry.version, PERSON));
  assert.deepEqual([again.state, again.already, again.entry], ['untriaged', true, null]);
  assert.equal(stateEvents(sql, raw).length, 2, 'a second return wrote another state event');

  /* AND A LATER FILING FINDS ITS OWN ROW, not the one the return archived. */
  const refiled = value(k.fileArrival(raw, 'out', null, PERSON));
  assert.equal(refiled.already, false);
  assert.notEqual(refiled.entry?.id, filed.entry.id);
  const retried = value(k.fileArrival(raw, 'out', null, PERSON));
  assert.deepEqual([retried.already, retried.entry?.id], [true, refiled.entry?.id], 'the retry answered with the archived row');
  sql.close();
});

test('AN ARCHIVED ARRIVAL GOES BACK WITH NO ROW TOUCHED AND ITS VERSION UNREAD', async () => {
  const { k, sql } = await record();
  const raw = email(k, 'Newsletter');
  value(k.archiveArrival(raw, 'p_1'));
  const rows = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event WHERE target LIKE ?', 'entry:%')?.n ?? 0);

  const back = value<ArrivalSettled>(k.returnArrival(raw, 999, PERSON));
  assert.deepEqual([back.state, back.already, back.entry], ['untriaged', false, null]);
  assert.ok(waiting(k).includes(raw));
  assert.equal(Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event WHERE target LIKE ?', 'entry:%')?.n ?? 0), rows);
  assert.deepEqual(
    stateEvents(sql, raw).map((e) => [e.from_v, e.to_v]),
    [
      ['"untriaged"', '"ignored"'],
      ['"ignored"', '"untriaged"'],
    ],
  );
  sql.close();
});

/* EVERY OTHER CASE LEFT FROM `untriaged`, so a return that always wrote `untriaged` passed them all: with it hard-coded
   in place of `back`, nothing went red. This one leaves from `review` and must land there again. */
test('AN ARRIVAL FILED FROM REVIEW GOES BACK TO REVIEW, not to untriaged', async () => {
  const { k, sql } = await record();
  const held = value(k.arrive({ channel: 'email', headers: { from: 'bank@example.com', subject: 'Held' }, body: `held: ${PAID}`, sha256: 'h1' }));
  assert.equal(held.state, 'review');
  assert.equal(k.count('out'), 0);
  const filed = value(k.fileArrival(held.raw, 'notes', null, PERSON));

  const back = value<ArrivalSettled>(k.returnArrival(held.raw, filed.entry!.version, PERSON));
  assert.deepEqual([back.state, back.already], ['review', false]);
  assert.equal(stateOf(sql, held.raw), 'review');
  assert.equal(k.inboxBefore(null, 50).find((a) => a.id === held.raw)?.state, 'review');
  const returned = stateEvents(sql, held.raw).at(-1)!;
  assert.deepEqual([returned.from_v, returned.to_v], ['"matched"', '"review"']);
  sql.close();
});

test('AN ARRIVAL AN INGEST MATCHED IS REFUSED, because no person filed it', async () => {
  const { k, sql } = await record();
  const arrived = value(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'i1', verified: true }));
  assert.equal(arrived.state, 'matched');
  const out = k.returnArrival(arrived.raw, 1, PERSON);
  assert.equal(codeOf(out), 'OUT_OF_BOUNDS');
  assert.match(fixOf(out), /A rule filed this arrival.*edited or archived in its list/);
  assert.equal(stateOf(sql, arrived.raw), 'matched');
  assert.equal(k.count('out'), 1);
  sql.close();
});

test('A RETURN AFTER THE ROW WAS EDITED IS A CONFLICT, and neither the arrival nor the row moves', async () => {
  const { k, sql } = await record();
  const raw = email(k, 'Invoice 8');
  const filed = value(k.fileArrival(raw, 'notes', null, PERSON));
  value(k.update('notes', filed.entry!.id, { merchant: 'Edited since' }, { actor: 'p_2' }));

  const out = k.returnArrival(raw, filed.entry!.version, PERSON);
  assert.equal(conflicted(out), true, JSON.stringify(out));
  assert.equal(stateOf(sql, raw), 'matched');
  assert.equal(stateEvents(sql, raw).length, 1);
  assert.equal(sql.one<{ deleted_at: string | null }>('SELECT deleted_at FROM entry WHERE id = ?', filed.entry!.id)?.deleted_at, null);
  sql.close();
});

test('A WAITING ARRIVAL IS THE SAME ANSWER WITH NOTHING WRITTEN, and a missing one is refused', async () => {
  const { k, sql } = await record();
  const raw = email(k, 'Invoice 9');
  const out = value<ArrivalSettled>(k.returnArrival(raw, 1, PERSON));
  assert.deepEqual([out.state, out.already, out.entry], ['untriaged', true, null]);
  assert.equal(stateEvents(sql, raw).length, 0);
  assert.equal(codeOf(k.returnArrival('nope', 1, PERSON)), 'OUT_OF_BOUNDS');
  sql.close();
});

test('A RETURNED UNVERIFIED ARRIVAL THE INGEST THEN RESCUES IS THE INGEST FILING, not the person one the return took back', async () => {
  const { k, sql } = await record();
  const first = value(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'r1', verified: false }));
  assert.equal(first.state, 'untriaged');
  const filed = value(k.fileArrival(first.raw, 'notes', null, PERSON));
  value(k.returnArrival(first.raw, filed.entry!.version, PERSON));

  /* THE RESCUE RUNS, as `arrive-redelivery.test.ts` says it must for an untriaged row nothing was offered. It writes
     the ingest's row and sets `matched` with no `state` event, so the newest one is still the return's. */
  const rescued = value(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'r1', verified: true }));
  assert.deepEqual([rescued.raw, rescued.state, rescued.redelivered === true], [first.raw, 'matched', false]);
  assert.equal(k.count('out'), 1);
  const events = stateEvents(sql, first.raw).length;

  const back = k.returnArrival(first.raw, 1, PERSON);
  assert.equal(codeOf(back), 'OUT_OF_BOUNDS', `a return of the ingest's filing answered ${JSON.stringify(back)}`);
  assert.equal(k.count('out'), 1, "the return archived the ingest's row");
  assert.equal(stateEvents(sql, first.raw).length, events);

  const refile = k.fileArrival(first.raw, 'notes', null, PERSON);
  assert.equal(codeOf(refile), 'OUT_OF_BOUNDS', `filing it again answered ${JSON.stringify(refile)}`);
  assert.match(fixOf(refile), /left the inbox/);
  sql.close();
});

/* ── a question that holds several mails (audit 31l, RL10) ── */

const askAbout = (k: Kernel, sql: NodeSql, raws: string[], rows: number): string => {
  const id = value(
    k.propose(
      { question: 'Add these?', body_kind: 'rowset', body: { register: 'out', rows: Array.from({ length: rows }, (_, n) => ({ merchant: `Shop ${String(n + 1)}` })) } } as never,
      'slash',
      'rules',
    ),
  ).id;
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as Record<string, unknown>;
  sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, raws, count: rows }), id);
  return id;
};
const bodyOf = (sql: NodeSql, id: string): { rows: { merchant: string }[]; raws: string[] } =>
  JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as { rows: { merchant: string }[]; raws: string[] };
const statusOf = (sql: NodeSql, id: string): string | undefined => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status;

test('ONE MAIL FILED OUT OF A QUESTION ABOUT SEVERAL IS GIVEN BACK TO IT WHEN IT IS PUT BACK', async () => {
  const { k, sql } = await record();
  const [a, b, c] = [email(k, 'One'), email(k, 'Two'), email(k, 'Three')];
  const q = askAbout(k, sql, [a, b, c], 3);
  const filed = value(k.fileArrival(b, 'notes', null, PERSON));
  assert.deepEqual(bodyOf(sql, q).raws, [a, c]);
  assert.equal(statusOf(sql, q), 'open');

  value(k.returnArrival(b, filed.entry!.version, PERSON));
  const back = bodyOf(sql, q);
  assert.deepEqual(back.raws, [a, c, b]);
  assert.deepEqual(back.rows.map((r) => r.merchant), ['Shop 1', 'Shop 3', 'Shop 2']);
  assert.equal(statusOf(sql, q), 'open');
  sql.close();
});

test('A MAIL PUT BACK AFTER THE REST WERE FILED REOPENS THE QUESTION WITH ITSELF ALONE, so no mail is filed twice', async () => {
  const { k, sql } = await record();
  const [a, b] = [email(k, 'One'), email(k, 'Two')];
  const q = askAbout(k, sql, [a, b], 2);
  const first = value(k.fileArrival(a, 'notes', null, PERSON));
  value(k.fileArrival(b, 'notes', null, PERSON));
  assert.equal(statusOf(sql, q), 'resolved');

  value(k.returnArrival(a, first.entry!.version, PERSON));
  assert.equal(statusOf(sql, q), 'open');
  assert.deepEqual(bodyOf(sql, q).raws, [a]);
  assert.deepEqual(bodyOf(sql, q).rows.map((r) => r.merchant), ['Shop 1']);
  sql.close();
});

test('A QUESTION WHOSE ROWS AND MAILS DO NOT LINE UP CLOSES WHEN ONE IS FILED, rather than keep the filed mail in it', async () => {
  const { k, sql } = await record();
  const [a, b, c] = [email(k, 'One'), email(k, 'Two'), email(k, 'Three')];
  const q = askAbout(k, sql, [a, b, c], 2);
  value(k.fileArrival(b, 'notes', null, PERSON));
  assert.equal(statusOf(sql, q), 'resolved');
  assert.equal(sql.one<{ r: string }>('SELECT resolved_as AS r FROM suggestion WHERE id = ?', q)?.r, 'moot');
  sql.close();
});
