/**
 * What a rule has done on a record restored or imported from a copy, as `automations` answers it.
 *
 * `rule_stat` IS `local` (migration 34) and travels in no export, so a restored record has none, while the log it
 * carries still holds every line the rule signed. The page read `fired` 0 off the empty count and told a person a rule
 * "did not match" when it had fired. A rule the log signs is said to have fired, at least once, when the log says, and
 * with no idle sentence. And the idle sentence counts from the rule's live version, so "since it was turned on" is true
 * of a rule edited since.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const HOUR = 3_600_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const BILLS = {
  id: 'register.bills',
  kind: 'register' as const,
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
    ],
  } as never,
};
const rule = (id: string, body: Record<string, unknown>) => ({ id: `rule.${id}`, kind: 'rule' as const, body: { rule: id, ...body } as never });
/** Inline: a Rent bill gets a note in the same write. */
const STAMP = rule('stamp', { register: 'bills', on: 'create', when: 'what is Rent', then: [{ set: { field: 'note', to: 'seen' } }] });
/** Inline too, and nothing it waits for is ever written. */
const NEVER = (to = 'never') => rule('never', { register: 'bills', on: 'create', when: 'what is Nothing', then: [{ set: { field: 'note', to } }] });

type Row = { rule: string; fired: number; last_at: string | null; lastFired: string | null; why_idle: string | null };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, JSON.stringify(r));
  return x.value;
};
const iso = (ms: number): string => new Date(ms).toISOString();

async function opened(at: number) {
  const sql = openSqlite();
  const clock = fixedClock(at);
  const api = await createRecordApi({ sql, clock });
  const read = async (): Promise<Map<string, Row>> => new Map(value<Row[]>(await api.automations(undefined, owner)).map((r) => [r.rule, r]));
  const bill = async (what: string) => value(await api.create({ register: 'bills', fields: { what } } as never, owner));
  return { sql, clock, api, read, bill };
}

/** What a restore from a copy leaves: the log and the lists, and none of this installation's own counts or runs. */
const restored = (sql: ReturnType<typeof openSqlite>): void => {
  sql.exec('DELETE FROM rule_stat');
  sql.exec('DELETE FROM automation_run');
};

test('A RULE THAT FIRED BEFORE A RESTORE SAYS IT FIRED, when the log says, and never "none matched"', async () => {
  const { sql, clock, api, read, bill } = await opened(NOW - 3 * HOUR);
  value(await api.kernel.install([BILLS, STAMP]));
  await bill('Rent');
  clock.set(NOW - 2 * HOUR);
  await bill('Water');
  clock.set(NOW - HOUR);
  await bill('Rent');
  restored(sql);
  clock.set(NOW);

  const stamp = (await read()).get('stamp')!;
  assert.equal(stamp.lastFired, iso(NOW - HOUR), 'the log still says when');
  assert.equal(stamp.fired, 2, 'counted from the log as the migration back-filled it');
  assert.equal(stamp.last_at, iso(NOW - HOUR));
  assert.equal(stamp.why_idle, null);
  /* AND THE ONE READ BY NAME SAYS THE SAME. */
  const one = value<Row>(await api.automations({ rule: 'stamp' }, owner));
  assert.equal(one.fired, 2);
  assert.equal(one.why_idle, null);
  sql.close();
});

test('A LOG THAT SAYS WHEN AND NOT HOW OFTEN STILL SAYS AT LEAST ONCE, and a rule that never fired still says why', async () => {
  const { sql, clock, api, read, bill } = await opened(NOW - 2 * HOUR);
  value(await api.kernel.install([BILLS, STAMP, NEVER()]));
  await bill('Rent');
  clock.set(NOW - HOUR);
  await bill('Rent');
  restored(sql);
  /* None of its lines is one the count reads, so the log says when and not how often. */
  sql.exec("UPDATE event SET target_kind = 'note' WHERE actor = 'rule:stamp'");

  const rows = await read();
  assert.ok(rows.get('stamp')!.fired >= 1);
  assert.equal(rows.get('stamp')!.last_at, iso(NOW - HOUR));
  assert.equal(rows.get('stamp')!.why_idle, null);
  assert.equal(rows.get('never')!.fired, 0);
  assert.equal(rows.get('never')!.last_at, null);
  assert.equal(rows.get('never')!.why_idle, '2 were added to Bills and none matched.');
  sql.close();
});

test('A RULE EDITED SINCE COUNTS FROM ITS LIVE VERSION, so "since it was turned on" is true', async () => {
  const { sql, clock, api, read, bill } = await opened(NOW - 2 * HOUR);
  value(await api.kernel.install([BILLS, NEVER()]));
  for (const what of ['Gas', 'Water', 'Phone']) await bill(what);
  assert.equal((await read()).get('never')!.why_idle, '3 were added to Bills and none matched.');

  clock.set(NOW - HOUR);
  value(await api.kernel.install([NEVER('edited')]));
  assert.equal((await read()).get('never')!.why_idle, 'No entry has been added to Bills since it was turned on.');
  clock.set(NOW);
  await bill('Tax');
  assert.equal((await read()).get('never')!.why_idle, 'One entry was added to Bills and it did not match.');
  sql.close();
});
