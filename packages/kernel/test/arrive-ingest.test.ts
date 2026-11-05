/**
 * A webhook arrival is offered to the ingest its URL names, and to no other.
 *
 * THE URL NAMED ONE INGEST AND THE RECORD TRIED THEM ALL. `/in/webhook/<rec>/<ingest>/<token>` carries
 * the ingest the token was minted for, the door checks the token against THAT ingest's digest, and then
 * both hosts handed the record the bytes and the flag and dropped the name. `arrive` offered the payload
 * to every webhook pattern in declaration order, so two ingests whose `match:` both accepted a text sent
 * every arrival to whichever was declared first. Measured below before the fix: an arrival naming
 * `second` came back `ingest: 'first'` and was written by the first ingest's extraction, which is a
 * token for one sender buying a write under another sender's pattern.
 *
 * MAIL NAMES NONE AND KEEPS THE OLD ORDER. One forwarding address serves every mail ingest on a record,
 * so a message has no ingest to name and is still offered to each in declaration order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

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

/* BOTH PATTERNS MATCH THE SAME TEXT ON PURPOSE, and each writes into a register of its own, so the rows say
   which ingest's extraction ran and not only which name came back on the receipt. */
const HOOK = (ingest: string, channel: 'webhook' | 'email', register: string): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: {
    ingest,
    channel,
    match: { all: [{ field: 'body', contains: 'paid' }] },
    extract: { merchant: { text: { between: ['You ', ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register, confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
});

const TEXT = 'You paid EGP 120.00 today.';

async function record(decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([REGISTER('one'), REGISTER('two'), ...decls]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const arrived = (r: unknown): Arrived => {
  const out = r as { ok: boolean; value: Arrived };
  assert.ok(out.ok, JSON.stringify(r));
  return out.value;
};

const written = (k: Kernel): Record<string, number> => ({ one: k.count('one'), two: k.count('two') });

test('A WEBHOOK ARRIVAL NAMING THE SECOND INGEST IS MATCHED BY THE SECOND, though the first also matches', async () => {
  const { k, sql } = await record([HOOK('first', 'webhook', 'one'), HOOK('second', 'webhook', 'two')]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'second', body: TEXT, sha256: 'w1', verified: true }));

  assert.equal(out.ingest, 'second', `the arrival named second and ${out.ingest} matched it`);
  assert.equal(out.state, 'matched');
  assert.deepEqual(written(k), { one: 0, two: 1 }, 'the row was written by another ingest\'s extraction');
  sql.close();
});

test('A NAMED INGEST THAT DOES NOT MATCH IS NOT RESCUED BY ANOTHER THAT DOES', async () => {
  const other: Declaration = {
    ...HOOK('picky', 'webhook', 'two'),
    body: { ...(HOOK('picky', 'webhook', 'two').body as object), match: { all: [{ field: 'body', contains: 'refund' }] } } as never,
  };
  const { k, sql } = await record([HOOK('first', 'webhook', 'one'), other]);
  const out = arrived(k.arrive({ channel: 'webhook', ingest: 'picky', body: TEXT, sha256: 'w2', verified: true }));

  assert.equal(out.ingest, null);
  assert.equal(out.state, 'untriaged');
  assert.deepEqual(written(k), { one: 0, two: 0 });
  sql.close();
});

test('MAIL NAMES NO INGEST AND IS STILL OFFERED TO EACH IN DECLARATION ORDER', async () => {
  const { k, sql } = await record([HOOK('first-mail', 'email', 'one'), HOOK('second-mail', 'email', 'two')]);
  const out = arrived(k.arrive({ channel: 'email', headers: { From: 'bank@example.com' }, body: TEXT, sha256: 'm1' }));

  assert.equal(out.ingest, 'first-mail');
  assert.deepEqual(written(k), { one: 1, two: 0 });
  sql.close();
});
