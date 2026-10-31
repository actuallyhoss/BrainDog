/**
 * A figure's reading is held across reads while the lists it read stand (`readingHeld`, `held-readings.ts`): an agent's
 * step on its run reads nothing again, a write to a list the figure reads reads it again, and so does a repair in place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sql } from '@braindog/ports';

import { notice, traceOf } from '../src/held-readings.ts';
import { openRecord, type Declaration, type MetricDecl } from '../src/index.ts';
import { overSplit } from '../src/row-parts.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }] },
} as never;

const CASH: MetricDecl = { metric: 'cash', name: 'Cash', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } as never;

/** The record's database, counting the reads of the accounts' rows. */
function counted(sql: Sql): { sql: Sql; reads: () => number } {
  let n = 0;
  const see = (text: string, params: unknown[]): void => {
    if (/\bentry\b/u.test(text) && (params.includes('accounts') || text.includes("'accounts'")) && !/max\(rowid\)/u.test(text)) n += 1;
  };
  return {
    sql: {
      exec: (text, ...params) => sql.exec(text, ...params),
      all: (text, ...params) => (see(text, params), sql.all(text, ...params)),
      one: (text, ...params) => (see(text, params), sql.one(text, ...params)),
      transactionSync: (fn) => sql.transactionSync(fn),
    },
    reads: () => n,
  };
}

test('A FIGURE IS HELD WHILE ITS LISTS STAND: a run moving reads it no more, and a write to its list or a repair in place does', async () => {
  const raw = openSqlite();
  const { sql, reads } = counted(raw);
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ACCOUNTS])).ok);
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 5_000, currency: 'EGP' } }, OWNER).ok);

  const first = k.metric(CASH);
  assert.ok(first.ok && first.value.value === 5_000, JSON.stringify(first));
  const before = reads();

  /* AN AGENT'S RUN MOVES, and the figure over the accounts is not read again. */
  const run = k.create('session', { doing: 'Working', agent: 'claude', state: 'active' }, OWNER);
  assert.ok(run.ok, JSON.stringify(run));
  assert.ok(k.update('session', run.value.id, { doing: 'Still working' }, OWNER).ok);
  const held = k.metric(CASH);
  assert.ok(held.ok && held.value.value === 5_000);
  assert.equal(reads(), before, 'a run moving read the accounts again');

  /* A WRITE TO THE ACCOUNTS IS READ. */
  assert.ok(k.create('accounts', { name: 'Savings', balance: { amount: 2_000, currency: 'EGP' } }, OWNER).ok);
  const written = k.metric(CASH);
  assert.ok(written.ok && written.value.value === 7_000, JSON.stringify(written));

  /* AND SO IS A ROW PUT RIGHT IN PLACE, with no line and its version and time unmoved. */
  raw.exec("UPDATE entry SET fields = json_set(fields, '$.balance.amount', 12000) WHERE register = 'accounts' AND json_extract(fields, '$.name') = 'Savings'");
  const repaired = k.metric(CASH);
  assert.ok(repaired.ok && repaired.value.value === 17_000, JSON.stringify(repaired));

  /* AND A WRITE TAKEN BACK LEAVES NOTHING HELD THAT IT SAW. */
  assert.throws(() =>
    raw.transactionSync(() => {
      raw.exec("UPDATE entry SET fields = json_set(fields, '$.balance.amount', 1) WHERE register = 'accounts'");
      const inside = k.metric(CASH);
      assert.ok(inside.ok && inside.value.value === 2);
      throw new Error('taken back');
    }),
  );
  const after = k.metric(CASH);
  assert.ok(after.ok && after.value.value === 17_000, JSON.stringify(after));
  raw.close();
});

/** What a figure reading `text` with `params` is held on, on a record whose lists are `system`, `active`, `tasks`, `projects` and the runs. */
function figureHeld(text: string, ...params: string[]): { whole: boolean; lists: string[] } {
  const lists = new Set(['system', 'active', 'tasks', 'projects', 'session']);
  const trace = traceOf();
  notice(trace, text, params, (w) => lists.has(w));
  return { whole: trace.whole, lists: [...trace.lists].sort() };
}

test("A VALUE THAT IS A LIST'S ID NAMES NO LIST unless the list column is bound to it (finish G4, review 3's P3)", () => {
  /* EVERY LIST'S ROWS, read beside a word that is also a list's id: read each time, never held on that one list. */
  assert.deepEqual(figureHeld("SELECT count(*) AS n FROM entry WHERE json_extract(fields, '$.who') = 'system'"), { whole: true, lists: [] });
  assert.deepEqual(figureHeld("SELECT count(*) AS n FROM entry WHERE state IN ('active', 'idle') AND kind = ?", 'tasks'), { whole: true, lists: [] });
  /* ONE LIST, BOUND: held on that list alone. */
  assert.deepEqual(figureHeld('SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', 'tasks'), { whole: false, lists: ['tasks'] });
  assert.deepEqual(figureHeld("SELECT id FROM entry e WHERE e.register IN (?, 'projects') AND e.state = 'active'", 'tasks'), { whole: false, lists: ['projects', 'tasks'] });
  /* A LINK'S HOP binds its own list, and is held on both. */
  assert.deepEqual(
    figureHeld("SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND id IN (SELECT json_extract(hop1.fields, '$.task') FROM entry AS hop1 WHERE hop1.register = ? AND hop1.deleted_at IS NULL)", 'tasks', 'projects'),
    { whole: false, lists: ['projects', 'tasks'] },
  );
  /* A BINDING THAT NARROWS NOTHING: under OR, NOT or CASE, or on the kept side of a left join. */
  assert.equal(figureHeld('SELECT count(*) AS n FROM entry WHERE register = ? OR state = ?', 'tasks', 'open').whole, true);
  assert.equal(figureHeld('SELECT count(*) AS n FROM entry WHERE state = ? OR (deleted_at IS NULL AND register = ?)', 'open', 'tasks').whole, true);
  assert.equal(figureHeld('SELECT count(*) AS n FROM entry WHERE NOT (register = ?)', 'tasks').whole, true);
  assert.equal(figureHeld("SELECT count(CASE WHEN register = 'tasks' THEN 1 END) AS n FROM entry").whole, true);
  assert.equal(figureHeld('SELECT count(*) AS n FROM entry a LEFT JOIN entry_private p ON a.register = ? AND p.entry_id = a.id', 'tasks').whole, true);
  /* A SECOND READ OF THE ROWS WITH NO LIST OF ITS OWN reads any list's rows. */
  assert.equal(figureHeld("SELECT p.id FROM entry e JOIN entry p ON p.id = json_extract(e.fields, '$.project') WHERE e.register = ?", 'tasks').whole, true);
  /* A WRITE, or a statement this cannot read, is never held. */
  assert.equal(figureHeld('UPDATE entry SET state = ? WHERE register = ? RETURNING id', 'done', 'tasks').whole, true);
  assert.equal(figureHeld('SELECT count(*) AS n FROM', 'tasks').whole, true);
});

test("A SPLIT ROW'S PARTS ARE READ THROUGH A VIEW THAT KEEPS EACH ROW'S LIST, so a figure over them is held on its list", () => {
  const over = overSplit('SELECT sum(json_extract(fields, ?)) AS v FROM entry WHERE register = ? AND deleted_at IS NULL', 'tasks', 'parts');
  assert.deepEqual(figureHeld(over, '$.amount', 'tasks'), { whole: false, lists: ['tasks'] });
  assert.equal(figureHeld(overSplit('SELECT count(*) AS n FROM entry', 'tasks', 'parts')).whole, true);
  /* A VIEW WRITTEN BY HAND, one word off the kernel's, is no view this knows: its rows are any list's. */
  assert.equal(figureHeld(over.replace("register <> 'tasks'", "register <> 'projects'"), '$.amount', 'tasks').whole, true);
});

test("TWO FIGURES OVER ONE WALK ARE BOTH HELD ON ITS LISTS: the second, handed the read's walk, moves with a bill as the first does", async () => {
  const raw = openSqlite();
  const k = await openRecord(raw, fixedClock(NOW));
  const bills: Declaration = {
    id: 'register.obligations',
    kind: 'register',
    body: { id: 'obligations', name: 'Bills', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'amount', type: 'money' }, { id: 'due', type: 'day' }, { id: 'direction', type: 'text' }] },
  } as never;
  const legs = [{ register: 'obligations', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'owed_to_me' } }];
  const walked = (metric: string, walk: string): Declaration =>
    ({ id: `metric.${metric}`, kind: 'metric', body: { metric, name: metric, source: 'forecast.runway', legs, value: { walk, within: '30d' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } }) as never;
  assert.ok((await k.install([ACCOUNTS, bills, walked('arriving-30d', 'in'), walked('leaving-30d', 'out')])).ok);
  /* A LINE IN THE LOG FIRST, so the lists are not read as for the first time after the bill. */
  assert.ok(k.create('accounts', { name: 'Current' }, OWNER).ok);
  const out = (): unknown => {
    const b = k.pageWalk().block({ kind: 'stat', cells: [{ metric: 'arriving-30d' }, { metric: 'leaving-30d' }] } as never) as unknown as { readings: { metric: string; reading: { value: unknown } | null }[] };
    return b.readings.find((r) => r.metric === 'leaving-30d')?.reading?.value;
  };
  assert.equal(out(), 0);
  assert.ok(k.create('obligations', { name: 'Rent', amount: { amount: 12_000, currency: 'EGP' }, due: '2026-10-05' }, OWNER).ok);
  assert.equal(out(), 12_000, 'Out, 30 days kept the nought it read before the bill');
  assert.ok(k.create('obligations', { name: 'Power', amount: { amount: 850, currency: 'EGP' }, due: '2026-10-06' }, OWNER).ok);
  assert.equal(out(), 12_850);
  raw.close();
});
