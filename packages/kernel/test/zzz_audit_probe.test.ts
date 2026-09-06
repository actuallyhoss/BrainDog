/* THROWAWAY AUDIT PROBE — delete after running. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type OutboxKind } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const ID = 'rec_01ABCDEFGHJKMNPQRSTVWXYZ01';
const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', index: true },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'late', 'paid'], index: true, transitions: { open: { to: ['late', 'paid'] }, late: { to: ['paid'] }, paid: { to: [] } } },
    ],
  } as never,
};

const DELIVERS: OutboxKind[] = ['notify.email', 'notify.push', 'notify.webhook', 'infer.prose'];

const outbox = (sql: NodeSql) => sql.all<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox');
const notes = (sql: NodeSql) => sql.all<{ kind: string; note: string | null }>("SELECT kind, note FROM event WHERE kind = 'note'");

const scheduler = () => ({ get: () => Promise.resolve(null), set: () => Promise.resolve(), clear: () => Promise.resolve(), wake: () => Promise.resolve() });

async function base(delivers = DELIVERS) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { delivers });
  const made = k.createRecord({
    id: ID,
    slug: 'probe',
    name: 'Probe',
    tz: 'Europe/London',
    locale: 'en-GB',
    owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' },
    keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' } },
  } as never);
  assert.ok(made.ok, JSON.stringify(made));
  return { sql, clock, k: k as Kernel };
}

test('PROBE 2 — a digest on the mcp channel sends nothing and reports success', async () => {
  const { sql, clock, k } = await base();
  const r = await k.install([
    OBLIGATIONS,
    {
      id: 'digest.mondaymcp',
      kind: 'digest',
      body: {
        digest: 'mondaymcp',
        name: 'Monday',
        schedule: { at: '08:00' },
        channels: ['mcp'],
        sections: [{ heading: 'Open', source: 'register.obligations', as: 'table', columns: [{ field: 'what' }] }],
      },
    } as never,
  ]);
  console.log('  P2 install channels:[mcp] ok? ', r.ok, r.ok ? '' : JSON.stringify(r));
  assert.ok(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }).ok);

  const row = sql.one<{ id: string; due_at: string }>("SELECT id, due_at FROM schedule WHERE kind = 'digest'");
  console.log('  P2 armed digest    :', JSON.stringify(row));
  clock.set(Date.parse(row!.due_at) + 1000);
  console.log('  P2 drained         :', JSON.stringify(await k.drain(undefined as never, 10)));
  console.log('  P2 outbox rows     :', JSON.stringify(outbox(sql)));
  console.log('  P2 note events     :', JSON.stringify(notes(sql)));
  console.log('  P2 schedule after  :', JSON.stringify(sql.all("SELECT kind, key, state FROM schedule WHERE kind = 'digest'")));
  sql.close();
});

test('PROBE 3 — a credential expiring inside 48h writes a note and nothing leaves', async () => {
  const { sql, clock, k } = await base();
  const made = k.bindGrant(
    {
      label: 'Stripe, live',
      opens: 'stripe.com',
      kind: 'api_token' as const,
      ciphertext: b(10),
      nonce: b(20),
      kdf: 'hkdf',
      wrapped_by: 'kek',
      kek_id: 'kek_2f',
      expires_at: new Date(NOW + 10 * DAY).toISOString().slice(0, 10),
    } as never,
    'p_1',
  );
  console.log('  P3 bindGrant ok?   :', made.ok, made.ok ? '' : JSON.stringify(made));
  const rows = sql.all<{ kind: string; key: string; payload: string; due_at: string }>('SELECT kind, key, payload, due_at FROM schedule');
  console.log('  P3 schedule rows   :', JSON.stringify(rows));
  const rot = rows.find((x) => x.kind === 'rotate' && x.key.endsWith(':expires'));
  assert.ok(rot, 'no expiry row armed');
  console.log('  P3 payload         :', rot.payload, '   <-- urgent flag written here');
  clock.set(Date.parse(rot.due_at) + 1000);
  console.log('  P3 drained         :', JSON.stringify(await k.drain(undefined as never, 10)));
  console.log('  P3 outbox rows     :', JSON.stringify(outbox(sql)), ' <-- expect [] ');
  console.log('  P3 note events     :', JSON.stringify(notes(sql)));
  sql.close();
});

test('PROBE 5 — a reminder that falls due inside quiet hours fires inside quiet hours', async () => {
  const { sql, clock, k } = await base();
  const REG: Declaration = {
    id: 'register.obligations',
    kind: 'register',
    body: {
      ...(OBLIGATIONS.body as Record<string, unknown>),
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'due', type: 'instant', index: true, remind: ['0d'] },
        { id: 'state', type: 'enum', values: ['open', 'paid'], index: true, transitions: { open: { to: ['paid'] }, paid: { to: [] } } },
      ],
    } as never,
  };
  assert.ok((await k.install([REG])).ok);
  // 03:00 London — squarely inside 22:00–08:00 quiet hours.
  const dueAt = new Date(Date.UTC(2026, 8, 8, 2, 0)).toISOString();
  assert.ok(k.create('obligations', { what: 'Invoice 41', due: dueAt, state: 'open' }, { actor: 'p_1' }).ok);
  const row = sql.one<{ due_at: string; key: string }>("SELECT due_at, key FROM schedule WHERE kind = 'reminder'");
  console.log('  P5 reminder row    :', JSON.stringify(row));
  assert.ok(row);
  clock.set(Date.parse(row.due_at) + 1000);
  console.log('  P5 drained         :', JSON.stringify(await k.drain(undefined as never, 10)));
  console.log('  P5 schedule after  :', JSON.stringify(sql.all("SELECT kind, state, due_at FROM schedule WHERE kind = 'reminder'")));
  console.log('  P5 note events     :', JSON.stringify(notes(sql)), '  <-- fired at 03:00 local');
  console.log('  P5 outbox rows     :', JSON.stringify(outbox(sql)));
  sql.close();
});
