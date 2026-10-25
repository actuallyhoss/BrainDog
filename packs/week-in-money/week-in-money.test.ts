/**
 * Week in money: one digest every Monday at half past eight, with cash now, what fell due in the week each way, and
 * what money arrived, and two sentences from Slash above it on a host that has Slash.
 *
 * A DIGEST IS A DECLARATION, NOT A SCRIPT. The pack says which figure and which lists to read, with a sentence
 * saying which rows, and the record assembles it on the hour, drops each list section that has no rows, and queues it.
 * So this pack is one declaration and no code, and this file drives the record's own schedule on a fixed clock: the
 * install arms the digest, the clock moves to the hour it was armed for, and the record's drain runs it.
 *
 * WITH `prose: slash` THE DIGEST WAITS FOR SLASH, where the host has it: the record queues one question holding the
 * assembled digest, and the message goes out when the answer comes back. On a host with no model it goes out at once,
 * as figures, and the second test holds that.
 *
 * Every row here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { OutboxKind } from '../../packages/kernel/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

/* MONDAY 28 SEPTEMBER 2026 AT SIX IN THE MORNING, in a record kept in UTC: the digest is armed for 08:30 today. */
const NOW = Date.UTC(2026, 8, 28, 6);
const DUE = '2026-09-28T08:30:00.000Z';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** Every kind a host can deliver, and the same without `infer.prose`: a host with no model. */
const WITH_SLASH: OutboxKind[] = ['notify.email', 'notify.push', 'notify.webhook', 'infer.prose'];
const NO_MODEL: OutboxKind[] = ['notify.email', 'notify.push', 'notify.webhook'];

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[] };
type Part = { heading: string; rows: { fields: Record<string, unknown> }[]; reading?: unknown };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./week-in-money.pack.json', import.meta.url);
const file = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A record with an owner who has an address, Money and what it links to, and this pack when `withPack` says so. */
async function record(delivers: OutboxKind[], withPack = true): Promise<{ api: Api; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, delivers });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'studio',
      name: 'Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' },
    }),
  );
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  if (withPack) await put(api, file());
  return { api, sql, clock };
}

const write = (api: Api, list: string, fields: Record<string, unknown>): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/** When the record armed the digest, or `undefined` when it armed none. */
const armed = (sql: NodeSql): string | undefined =>
  sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'digest' AND key = 'week-in-money'")?.due_at;

/** Move the clock to the hour the digest was armed for, and let the record run what came due. */
async function monday(api: Api, sql: NodeSql, clock: ReturnType<typeof fixedClock>): Promise<void> {
  const at = armed(sql);
  assert.equal(at, DUE, 'the digest is armed for 08:30 on the Monday the record is on');
  clock.set(Date.parse(at!) + 1000);
  await api.kernel.drain();
}

const queued = (sql: NodeSql, kind: string): unknown[] =>
  sql.all<{ payload: string }>('SELECT payload FROM outbox WHERE kind = ? ORDER BY created, id', kind).map((r) => JSON.parse(r.payload) as unknown);

test('BEFORE THE PACK: Money arms no weekly digest of its own', async () => {
  const { sql } = await record(WITH_SLASH, false);
  assert.equal(armed(sql), undefined);
  sql.close();
});

test('THE FILE IS week-in-money 1.0.0, on money-core 3, one digest with prose from Slash', () => {
  const doc = file() as { pack: string; version: string; requires: { packs: unknown }; declarations: Record<string, unknown>[] };
  assert.deepEqual([doc.pack, doc.version], ['week-in-money', '1.0.1']);
  assert.deepEqual(doc.requires.packs, { 'money-core': '>=3.0.0 <4.0.0' });
  assert.deepEqual(
    doc.declarations.map((d) => [d.digest, d.prose]),
    [['week-in-money', 'slash']],
  );
});

test("ON MONDAY THE WEEK'S MONEY WAITS FOR SLASH: cash now, what fell due each way, what arrived, and nothing older", async () => {
  const { api, sql, clock } = await record(WITH_SLASH);
  const account = write(api, 'accounts', { name: 'Current account', kind: 'bank', balance: gbp(250_000), as_of: '2026-09-20', liquid: true });
  write(api, 'obligations', { what: 'Invoice for the kiln fitting', direction: 'owed_to_me', amount: gbp(120_000), due: '2026-09-24', state: 'open' });
  write(api, 'obligations', { what: 'Studio insurance', direction: 'owed_by_me', amount: gbp(18_000), due: '2026-09-26', state: 'paid' });
  write(api, 'obligations', { what: 'An invoice from August', direction: 'owed_to_me', amount: gbp(40_000), due: '2026-08-30', state: 'open' });
  write(api, 'obligations', { what: 'October rent', direction: 'owed_by_me', amount: gbp(90_000), due: '2026-10-01', state: 'open' });
  write(api, 'transactions', { what: 'Payment for invoice 12', on: '2026-09-25', direction: 'in', amount: gbp(80_000), account, state: 'cleared' });
  write(api, 'transactions', { what: 'Paper and ink', on: '2026-09-26', direction: 'out', amount: gbp(4_500), account, state: 'cleared' });
  write(api, 'transactions', { what: 'A payment from the first of the month', on: '2026-09-01', direction: 'in', amount: gbp(30_000), account, state: 'cleared' });

  await monday(api, sql, clock);

  assert.equal(queued(sql, 'notify.email').length, 0, 'the message goes out when Slash answers, not before');
  const asked = queued(sql, 'infer.prose') as { name: string; sections: Part[] }[];
  assert.equal(asked.length, 1, 'one question to Slash, holding the whole digest');
  const digest = asked[0]!;
  assert.equal(digest.name, 'Week in money');
  assert.deepEqual(
    digest.sections.map((s) => [s.heading, s.reading === undefined ? s.rows.map((r) => r.fields.what) : 'a figure']),
    [
      ['Cash now', 'a figure'],
      ['Money in that fell due', ['Invoice for the kiln fitting']],
      ['Money out that fell due', ['Studio insurance']],
      ['What arrived', ['Payment for invoice 12']],
    ],
  );
  sql.close();
});

test('ON A HOST WITH NO MODEL IT GOES OUT AT ONCE AS FIGURES, and a section with no rows is left out', async () => {
  const { api, sql, clock } = await record(NO_MODEL);
  write(api, 'accounts', { name: 'Current account', kind: 'bank', balance: gbp(250_000), as_of: '2026-09-20', liquid: true });
  write(api, 'obligations', { what: 'Invoice for the kiln fitting', direction: 'owed_to_me', amount: gbp(120_000), due: '2026-09-24', state: 'open' });

  await monday(api, sql, clock);

  const mail = queued(sql, 'notify.email') as { to: string[]; subject: string; text: string }[];
  assert.equal(mail.length, 1);
  assert.deepEqual(mail[0]!.to, ['ada@example.test']);
  assert.equal(mail[0]!.subject, 'Week in money');
  assert.match(mail[0]!.text, /## Cash now/);
  assert.match(mail[0]!.text, /## Money in that fell due/);
  assert.match(mail[0]!.text, /Invoice for the kiln fitting/);
  assert.doesNotMatch(mail[0]!.text, /## Money out that fell due/, 'nothing was due to be paid, so the heading is not there');
  assert.doesNotMatch(mail[0]!.text, /## What arrived/, 'nothing arrived, so the heading is not there');
  assert.equal(armed(sql), '2026-10-05T08:30:00.000Z', 'and the next one is armed for the Monday after');
  sql.close();
});
