/**
 * What a rule has done, as `automations` answers it: `fired`, `last_at`, `why_idle` and `family`.
 *
 * THE RULE: "how many rows a rule has filed, and never for one that has not". The count is the kernel's `rule_stat`,
 * the whole of it and not a page of history. A rule that has done nothing says why in one sentence, counted from the
 * list itself and never from the log, so a pruned history cannot make it say more were added than the list holds.
 * Rules that do the same thing to the same list share one `family` key, read from the body's shape.
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
      { id: 'payee', type: 'text' },
    ],
  } as never,
};
const rule = (id: string, body: Record<string, unknown>) => ({ id: `rule.${id}`, kind: 'rule' as const, body: { rule: id, ...body } as never });
/** Inline: a Rent bill gets a note in the same write. */
const STAMP = rule('stamp', { register: 'bills', on: 'create', when: 'what is Rent', then: [{ set: { field: 'note', to: 'seen' } }] });
/** Inline too, and nothing it waits for is ever written. */
const NEVER = rule('never', { register: 'bills', on: 'create', when: 'what is Nothing', then: [{ set: { field: 'note', to: 'never' } }] });

type Row = { rule: string; fired: number; last_at: string | null; why_idle: string | null; family: string | null };
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

/** Words a person reads: no id, no em dash, and "entry", never "row". */
const plain = (said: string): void => {
  assert.doesNotMatch(said, /—|\brule\.|\bbills\b|\brows?\b/, said);
  assert.match(said, /\.$/, said);
};

test('A RULE THAT FIRED TWICE SAYS 2, when it last did, and no idle sentence', async () => {
  const { sql, clock, api, read, bill } = await opened(NOW - 3 * HOUR);
  value(await api.kernel.install([BILLS, STAMP]));
  await bill('Rent');
  clock.set(NOW - HOUR);
  await bill('Water');
  clock.set(NOW);
  await bill('Rent');

  const stamp = (await read()).get('stamp')!;
  assert.equal(stamp.fired, 2);
  assert.equal(stamp.last_at, iso(NOW));
  assert.equal(stamp.why_idle, null);
  /* AND THE ONE READ BY NAME SAYS THE SAME. */
  const one = value<Row>(await api.automations({ rule: 'stamp' }, owner));
  assert.equal(one.fired, 2);
  assert.equal(one.last_at, iso(NOW));
  sql.close();
});

test('A RULE ON A LIST WITH NO NEW ENTRY SAYS SO, and entries from before it was turned on are not counted', async () => {
  const { sql, clock, api, read, bill } = await opened(NOW - 2 * HOUR);
  value(await api.kernel.install([BILLS]));
  await bill('Gas');
  await bill('Water');
  clock.set(NOW);
  value(await api.kernel.install([NEVER]));

  const never = (await read()).get('never')!;
  assert.equal(never.fired, 0);
  assert.equal(never.last_at, null);
  assert.equal(never.why_idle, 'No entry has been added to Bills since it was turned on.');
  plain(never.why_idle!);
  sql.close();
});

test('A RULE ON A LIST THAT GOT 34 AND MATCHED NONE SAYS 34, read from the list and not the log', async () => {
  const { sql, api, read, bill } = await opened(NOW);
  value(await api.kernel.install([BILLS, NEVER]));
  for (let i = 0; i < 34; i++) await bill(`Bill ${String(i + 1)}`);

  let never = (await read()).get('never')!;
  assert.equal(never.fired, 0);
  assert.equal(never.why_idle, '34 were added to Bills and none matched.');
  plain(never.why_idle!);

  /* A PRUNED HISTORY DOES NOT MOVE IT: the log can lose every line and the list still holds 34. */
  sql.exec('DELETE FROM event');
  never = (await read()).get('never')!;
  assert.equal(never.why_idle, '34 were added to Bills and none matched.');
  sql.close();
});

test('THE COUNT STOPS AT 1,000 AND SAYS SO, and 999 is said as it is', async () => {
  const { sql, api, read } = await opened(NOW);
  value(await api.kernel.install([BILLS, NEVER]));
  /* Straight into the list: a thousand writes through the record would only be slower to say the same. */
  const fill = (from: number, to: number): void =>
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT ? UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO entry (id, register, seq, fields, created_at, updated_at) SELECT 'cap' || i, 'bills', 1000 + i, '{"what":"x"}', ?, ? FROM n`,
      from,
      to,
      iso(NOW),
      iso(NOW),
    );
  fill(1, 999);
  let never = (await read()).get('never')!;
  assert.equal(never.why_idle, '999 were added to Bills and none matched.');
  fill(1000, 1200);
  never = (await read()).get('never')!;
  assert.equal(never.fired, 0);
  assert.equal(never.last_at, null);
  assert.equal(never.why_idle, '1,000 or more were added to Bills and none matched.');
  plain(never.why_idle!);
  sql.close();
});

test('TWO RULES THAT SET ONE FIELD ON ONE LIST ARE ONE FAMILY, and a rule that does something else is not', async () => {
  const { sql, api, read } = await opened(NOW);
  const byPayee = (id: string, payee: string, to: string) =>
    rule(id, { register: 'bills', on: 'create', when: `payee is ${payee}`, then: [{ set: { field: 'note', to } }] });
  const TAG = rule('tagged', { register: 'bills', on: 'create', when: 'payee is Shell', then: [{ tag: 'fuel' }] });
  const BUTTON = rule('button', { on: { manual: true }, steps: [{ stop: true }] });
  value(await api.kernel.install([BILLS, byPayee('shell', 'Shell', 'Fuel'), byPayee('vodafone', 'Vodafone', 'Phone'), TAG, BUTTON]));

  const rows = await read();
  const family = rows.get('shell')!.family;
  assert.ok(family !== null);
  assert.equal(rows.get('vodafone')!.family, family, 'the same action on the same field of the same list');
  assert.notEqual(rows.get('tagged')!.family, family);
  /* A RULE ABOUT NO LIST HAS NO FAMILY, and its idle sentence says what it waits for. */
  assert.equal(rows.get('button')!.family, null);
  assert.equal(rows.get('button')!.why_idle, 'Nobody has started it since it was turned on.');
  for (const r of rows.values()) if (r.why_idle !== null) plain(r.why_idle);
  sql.close();
});
