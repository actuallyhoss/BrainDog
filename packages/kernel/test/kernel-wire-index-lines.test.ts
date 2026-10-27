/**
 * Batch 47's kernel index lines, one case a line (kernel-index-47): each goes red when its line in `index.ts` goes.
 *
 * The leftovers of 43 to 45 (the replay mark, the host's build, a one-block preview's inbox reach, the key scan's
 * night), the runs carried in and the beat, the queue's draw bound as one list, a script's
 * question, and the hand marks that end the hold's green days. Each is read through the kernel's own
 * verbs, as a host reaches it, never through the module the line calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { markDoor } from '../src/door.ts';
import { enqueue } from '../src/outbox.ts';
import { openRecord, type Declaration, type Entry, type MetricDecl, type PageBlock, type SessionHints, type WriteContext } from '../src/index.ts';
import { testSigner } from './signer.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const DAY = 86_400_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const OWNER: WriteContext = { actor: 'p_1' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'day', type: 'text' }] } as never,
};

async function record(opts: { build?: string; sign?: ReturnType<typeof testSigner> } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, opts);
  assert.ok(k.createRecord({ id: ID, slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([TASKS])).ok);
  return { k, sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const as = (session: SessionHints, token = 't_1'): WriteContext => ({ actor: 'agent:claude', principal: { kind: 'token', token }, session });
const hands = (sql: NodeSql): number => Number(sql.one<{ n: number }>("SELECT coalesce(sum(value), 0) AS n FROM sign_reading WHERE sign = 'hand'")?.n ?? 0);
const lastSeen = (sql: NodeSql, seq: number): unknown =>
  (JSON.parse(sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'session' AND seq = ?", seq)!.fields) as { last_seen?: unknown }).last_seen;

test('45 REPLAY MARK: a write replayed by its op_id says so, and the first write does not', async () => {
  const { k, sql } = await record();
  const first = value<Entry>(k.create('tasks', { what: 'Pay rent' }, { ...OWNER, opId: 'op-1' }));
  assert.equal(first.replayed, undefined);
  const again = value<Entry>(k.create('tasks', { what: 'Pay rent' }, { ...OWNER, opId: 'op-1' }));
  assert.deepEqual([again.id, again.replayed], [first.id, true]);
  sql.close();
});

test('43 C5 THE BUILD: the host\'s build reaches the figures, so the door\'s behind reads a session on another', async () => {
  const behind = { metric: 'door-behind', source: 'record.door', sign: 'behind', value: { count: 'id' }, target: { lte: 0 }, window: '30d', compare: 'none', format: 'int' } as unknown as MetricDecl;
  const { k, sql } = await record({ build: '1.4.0' });
  markDoor(sql, 'S1', { kind: 'hello', build: '1.3.0' }, NOW - DAY);
  assert.equal(value<{ value: number | null }>(k.metric(behind)).value, 1);
  sql.close();
});

test('44 #1 THE BLOCK VERB: a one-block preview for a key the inbox does not reach tells a sign in the quiet words', async () => {
  const { k, sql, clock } = await record();
  const body = 'Invoice from Ada for 900';
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('hex');
  value(k.arrive({ channel: 'paste', body, sha256 } as never));
  clock.advance(2 * DAY);
  const signs = { kind: 'table', source: 'signs', where: 'sign is arrivals-filed' } as unknown as PageBlock;
  const said = (inbox?: boolean) => k.block(signs, inbox === undefined ? {} : { inbox }).rows[0]?.fields.said;
  assert.equal(said(false), 'Messages came in that are not filed yet.');
  assert.notEqual(said(), said(false), 'the owner read the quiet words');
  sql.close();
});

test('44 #11-13 THE KEY SCAN: the signs night walks the record for pasted keys and keeps where it got to', async () => {
  const { k, sql, clock } = await record();
  assert.equal(sql.one("SELECT 1 AS x FROM dog_meta WHERE key = 'key-scan'"), undefined);
  const due = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'snapshot' AND key = 'signs'")!.due_at);
  clock.set(due + MIN);
  await k.drain();
  assert.ok(sql.one("SELECT 1 AS x FROM dog_meta WHERE key = 'key-scan'"), 'the night did not scan for keys');
  sql.close();
});

test('AGT-C10 CARRIED IN: an imported run\'s last_seen lands as seen_before, never refused', async () => {
  const { k, sql } = await record();
  const run = value<Entry>(k.create('session', { doing: 'Old work', agent: 'claude', state: 'done', last_seen: '2026-08-14T09:30:00.000Z' }, OWNER));
  assert.deepEqual([run.fields.seen_before, run.fields.last_seen], ['2026-08-14T09:30:00.000Z', undefined]);
  sql.close();
});

test('AGT-C03 HEARTBEAT: the kernel answers a beat with the caller\'s run and moves its clock', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-1' })));
  clock.advance(20 * MIN);
  assert.equal(k.heartbeat(as({ client_id: 'cc-1' })), 'S1');
  assert.equal(lastSeen(sql, 1), new Date(NOW + 20 * MIN).toISOString());
  sql.close();
});

test('AGT-C03 HEARD: a call marked at the door beats the caller\'s run', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-1' })));
  clock.advance(20 * MIN);
  value(k.heard(as({ client_id: 'cc-1' }), { kind: 'called' }));
  assert.equal(lastSeen(sql, 1), new Date(NOW + 20 * MIN).toISOString());
  sql.close();
});

test('AGT-B03 ONE LIST BOUND: the queue draws its questions whole, read by one JSON list', async () => {
  const { k, sql } = await record();
  for (const q of ['Which first?', 'Which second?'])
    value(k.propose({ question: q, body_kind: 'options', body: { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] } }, 'p_1'));
  const queue = k.block({ kind: 'queue', source: 'governance.open' } as unknown as PageBlock);
  assert.deepEqual(queue.refusals, []);
  const drawn = (queue as unknown as { queue: { question: string }[] }).queue.map((q) => q.question).sort();
  assert.deepEqual(drawn, ['Which first?', 'Which second?'], 'the drawn questions were not read');
  sql.close();
});

test('F61 A SCRIPT ASKS: a scheduled run\'s question is filed through the gate', async () => {
  const { k, sql } = await record();
  const script: Declaration = {
    id: 'script.month-end',
    kind: 'script',
    body: { script: 'month-end', runs: { every: '1d' }, egress: [], keys: [], reads: ['tasks'], writes: ['tasks'], source: 'export default async function run(ctx) {}' } as never,
  };
  value(await k.install([script]));
  const rent = value<Entry>(k.create('tasks', { what: 'Rent' }, OWNER));
  let n = 0;
  enqueue(sql, () => `01KWIRE47JOB000000000${(++n).toString(36).toUpperCase().padStart(5, '0')}`, NOW, 'script.run', { script: 'month-end', version: 1, input: null });
  const ask = {
    cause: 'month-end.last-day',
    question: 'Rent falls on the last day of the month. Is it the last day, or that date?',
    about: ['Rent, 30 September'],
    options: [
      { label: 'The last day', patches: [{ id: 'tasks#1', version: rent.version, fields: { day: 'last' } }] },
      { label: 'That date', patches: [{ id: 'tasks#1', version: rent.version, fields: { day: '30' } }] },
    ],
  };
  await k.runActions(async () => ({ status: 500 }) as never, {
    script: async () => ({ writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ask }) as never,
  });
  const open = sql.all<{ cause: string | null }>("SELECT cause FROM suggestion WHERE status = 'open'");
  assert.deepEqual(open.map((q) => q.cause), ['month-end.last-day'], 'the run asked nobody');
  sql.close();
});

test('PRF-A18 RETRY BY HAND: a dead letter tried again by a person marks a hand', async () => {
  const { k, sql, clock } = await record();
  k.outbox('notify.email', { to: 'someone' });
  for (let i = 0; i < 8; i++) {
    const [job] = k.leaseOutbox(['notify.email'], 1);
    assert.ok(job);
    value(k.ackOutbox({ id: job.id, state: 'failed', error: 'The mail host said no', leasedUntil: job.leasedUntil }));
    if (i === 7) break;
    clock.advance(2 * DAY);
    await k.drain();
  }
  const before = hands(sql);
  value(k.retryFault({ actor: 'p_1' }, { cause: 'outbox#notify.email' }));
  assert.equal(hands(sql), before + 1);
  sql.close();
});

test('PRF-A18 REPLACED FROM A FILE: a replacing import marks a hand', async () => {
  const { k, sql } = await record({ sign: testSigner() });
  value(k.create('tasks', { what: 'Kept' }, OWNER));
  const lines = value<string[]>(await k.export());
  value(await k.import(lines, { replace: true, by: 'p_1' }));
  assert.equal(hands(sql), 1);
  sql.close();
});

test('PRF-A18 RESTORED: a restore marks a hand', async () => {
  const { k, sql } = await record();
  k.lifecycle('restore.pitr', 'p_1', 'Put back to this morning');
  assert.equal(hands(sql), 1);
  sql.close();
});

test('AGT-C08 THE ORDER: a question that moves money leads the queue over an older one', async () => {
  const { k, sql, clock } = await record();
  /* A QUESTION THAT STAYS OPEN is what this tests, so BrainDog settling its own arranging (the Handled list) is turned off. */
  sql.exec("INSERT INTO pref (person_id, key, value, updated_at) VALUES ('record:handled', 'on', 'false', '2026-10-01T00:00:00.000Z')");
  value(k.create('tasks', { what: 'Glaze test' }, OWNER));
  const old = value<{ id: string }>(
    k.propose({ question: 'Rename it?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { what: 'Glaze two' } }] } }, 'slash'),
  );
  const BILLS: Declaration = {
    id: 'register.bills',
    kind: 'register',
    body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
  };
  value(await k.install([BILLS]));
  clock.advance(DAY);
  const money = value<{ id: string }>(
    k.propose({ question: 'Add the rent?', body_kind: 'rowset', body: { register: 'bills', rows: [{ what: 'Rent', amount: { amount: 900_00, currency: 'EGP' } }] } }, 'slash'),
  );
  const drawn = (k.block({ kind: 'queue', source: 'governance.open' } as unknown as PageBlock) as unknown as { queue: { id: string }[] }).queue;
  assert.deepEqual(drawn.map((q) => q.id), [money.id, old.id]);
  sql.close();
});

test('AGT-C08 RECHECK: the hourly sweep closes a question the owner already did by hand, as moot', async () => {
  const { k, sql } = await record();
  /* A QUESTION THAT STAYS OPEN is what this tests, so BrainDog settling its own arranging (the Handled list) is turned off. */
  sql.exec("INSERT INTO pref (person_id, key, value, updated_at) VALUES ('record:handled', 'on', 'false', '2026-10-01T00:00:00.000Z')");
  value(k.create('tasks', { what: 'Glaze test' }, OWNER));
  const asked = value<{ id: string }>(
    k.propose({ question: 'Rename it?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { what: 'Glaze two' } }] } }, 'slash'),
  );
  value(k.update('tasks', 'tasks#1', { what: 'Glaze two' }, OWNER));
  k.purge();
  const q = sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', asked.id);
  assert.deepEqual({ ...q }, { status: 'resolved', resolved_as: 'moot' });
  sql.close();
});

/** The signs night run once: the record's row due, and the drain past it. */
async function night(k: Awaited<ReturnType<typeof record>>['k'], sql: NodeSql, clock: ReturnType<typeof fixedClock>): Promise<void> {
  clock.set(Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'snapshot' AND key = 'signs'")!.due_at) + MIN);
  await k.drain();
}
const point = (sql: NodeSql, series: string): number | undefined => sql.one<{ value: number }>('SELECT value FROM metric_point WHERE series = ? ORDER BY at DESC LIMIT 1', series)?.value;

test('REC-A17 THE NIGHT COUNTS: the signs night keeps each list\'s live and deleted totals', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'One' }, OWNER));
  const gone = value<Entry>(k.create('tasks', { what: 'Two' }, OWNER));
  value(k.update('tasks', gone.id, { deleted_at: new Date(NOW).toISOString() }, OWNER));
  await night(k, sql, clock);
  assert.deepEqual([point(sql, 'counts:tasks:live'), point(sql, 'counts:tasks:deleted')], [1, 1]);
  sql.close();
});

test('REC-A13 THE NIGHT WALK: a document placeholder that names nothing is counted the next night', async () => {
  const { k, sql, clock } = await record();
  const NOTES: Declaration = {
    id: 'register.notes',
    kind: 'register',
    body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'text', type: 'document' }] } as never,
  };
  value(await k.install([NOTES]));
  value(k.create('notes', { what: 'Plan', text: 'We owe {{nothing.here}} this month.' }, OWNER));
  await night(k, sql, clock);
  assert.equal(point(sql, 'paths:dead'), 1);
  sql.close();
});
