/**
 * A sum of a ledger skips the parts view only while no row of the list is split, and is never told so by a kept flag.
 *
 * MEASURED: the worst figure on 20,000 lines went from 1,749 ms to 39 ms with nothing split, and through the view each
 * figure reads every row of the record. A wrong answer here is wrong money, so what is asserted is the sum, through every way
 * a row can come to be split or stop being split: the kernel's write, an update, an undo-like rollback, a repair that
 * writes SQL with no line in the log, a row deleted, an empty list of parts, and no index at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { holdsSplit, pastSplitView, splitIndexName, splitView } from '../src/split-view.ts';
import { overSplit, overSplitNow } from '../src/row-parts.ts';
import { readsOf } from '../src/sql-reads.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const PERSON = { actor: 'p_1' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const SPENDS: Declaration = {
  id: 'register.spends',
  kind: 'register',
  body: {
    id: 'spends',
    name: 'Spends',
    title: 'payee',
    fields: [
      { id: 'payee', type: 'text', required: true },
      { id: 'on', type: 'day', index: true },
      { id: 'category', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'parts', type: 'json', parts_of: 'amount' },
    ],
  } as never,
};
const OTHERS: Declaration = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'parts', type: 'json' }] } as never };

const BY_CATEGORY: Declaration = {
  id: 'metric.by-category',
  kind: 'metric',
  body: { metric: 'by-category', name: 'Spent', window: '7d', compare: 'none', format: 'money', target: { gte: 0 }, source: 'register.spends', value: { sum: 'amount' }, group_by: 'category' } as never,
};
const TOTAL: Declaration = {
  id: 'metric.total',
  kind: 'metric',
  body: { metric: 'total', name: 'Total', window: '7d', compare: 'none', format: 'money', target: { gte: 0 }, source: 'register.spends', value: { sum: 'amount' } } as never,
};

/** A record with the ledger, each statement noted. */
async function made() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  const one = sql.one.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  sql.one = ((q: string, ...a: never[]) => (statements.push(q), one(q, ...a))) as typeof sql.one;
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([SPENDS, OTHERS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const row = (fields: Record<string, unknown>): Entry => {
    const out = k.create('spends', { payee: 'Corner Shop', on: '2026-08-24', ...fields }, PERSON);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as Entry;
  };
  /** What a sum of the list by category answers through the same statement a figure reads, the two ways. */
  const SUM = "SELECT json_extract(fields, '$.category') AS k, sum(json_extract(fields, '$.amount.amount')) AS v FROM entry WHERE register = ? AND deleted_at IS NULL GROUP BY 1 ORDER BY 1";
  const plain = (rows: unknown[]) => rows.map((r) => ({ ...(r as object) }));
  const asRead = () => plain(sql.all(overSplitNow(sql, SUM, 'spends', 'parts'), 'spends'));
  const throughView = () => plain(sql.all(overSplit(SUM, 'spends', 'parts'), 'spends'));
  return { sql, k, row, statements, asRead, throughView };
}

const SPLIT = (a: number, b: number) => [
  { category: 'Food', amount: gbp(a) },
  { category: 'Home', amount: gbp(b) },
];

test('NOTHING SPLIT: the read goes straight off the table, and answers what the view answers', async () => {
  const { sql, row, asRead, throughView } = await made();
  row({ category: 'Food', amount: gbp(500) });
  row({ category: 'Home', amount: gbp(700) });
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
  assert.deepEqual(asRead(), throughView());
  assert.deepEqual(asRead(), [
    { k: 'Food', v: 500 },
    { k: 'Home', v: 700 },
  ]);
});

test('THE FIRST SPLIT ROW IS SEEN AT ONCE: each part under its own label, with no restart and no flag to clear', async () => {
  const { sql, row, asRead, throughView } = await made();
  row({ category: 'Food', amount: gbp(500) });
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
  row({ amount: gbp(900), parts: SPLIT(400, 500) });
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  assert.deepEqual(asRead(), [
    { k: 'Food', v: 900 },
    { k: 'Home', v: 500 },
  ]);
  assert.deepEqual(asRead(), throughView());
});

test('AN UPDATE THAT SPLITS A ROW, AND ONE THAT TAKES THE SPLIT OFF', async () => {
  const { sql, k, row, asRead, throughView } = await made();
  const one = row({ category: 'Food', amount: gbp(900) });
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
  const split = k.update('spends', one.id, { parts: SPLIT(300, 600) }, PERSON);
  assert.ok(split.ok, JSON.stringify(split));
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  assert.deepEqual(asRead(), [
    { k: 'Food', v: 300 },
    { k: 'Home', v: 600 },
  ]);
  const off = k.update('spends', one.id, { parts: null }, PERSON);
  assert.ok(off.ok, JSON.stringify(off));
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
  assert.deepEqual(asRead(), [{ k: 'Food', v: 900 }]);
  assert.deepEqual(asRead(), throughView());
});

test('A WRITE TAKEN BACK IS NOT A SPLIT ROW: the answer is the rows, inside and after the transaction', async () => {
  const { sql, row, asRead } = await made();
  row({ category: 'Food', amount: gbp(500) });
  assert.throws(() =>
    sql.transactionSync(() => {
      row({ amount: gbp(900), parts: SPLIT(400, 500) });
      assert.equal(holdsSplit(sql, 'spends', 'parts'), true, 'inside the write it is split');
      throw new Error('taken back');
    }),
  );
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
  assert.deepEqual(asRead(), [{ k: 'Food', v: 500 }]);
});

test('A REPAIR THAT WRITES SQL WITH NO LINE IN THE LOG IS SEEN TOO, which a flag kept by the kernel would miss', async () => {
  const { sql, row, asRead, throughView } = await made();
  const one = row({ category: 'Food', amount: gbp(900) });
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify({ ...one.fields, parts: SPLIT(100, 800) }), one.id);
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  assert.deepEqual(asRead(), throughView());
  assert.deepEqual(asRead(), [
    { k: 'Food', v: 100 },
    { k: 'Home', v: 800 },
  ]);
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify(one.fields), one.id);
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
});

test('A DELETED SPLIT ROW KEEPS THE VIEW, which reads deleted rows too, and the sum still leaves it out', async () => {
  const { sql, row, asRead, throughView } = await made();
  row({ category: 'Food', amount: gbp(500) });
  const split = row({ amount: gbp(900), parts: SPLIT(400, 500) });
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), split.id);
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  assert.deepEqual(asRead(), [{ k: 'Food', v: 500 }]);
  assert.deepEqual(asRead(), throughView());
});

test('AN EMPTY LIST OF PARTS READS AS THE VIEW READS IT: the view has no row for it, so neither does the read', async () => {
  const { sql, row, asRead, throughView } = await made();
  const one = row({ category: 'Food', amount: gbp(900) });
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify({ ...one.fields, parts: [] }), one.id);
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  assert.deepEqual(asRead(), throughView());
  assert.deepEqual(asRead(), []);
});

test('A TEXT, A NUMBER OR AN OBJECT IN THE FIELD IS NOT A SPLIT, and another list with a field of that name says nothing', async () => {
  const { sql, k, row } = await made();
  const one = row({ category: 'Food', amount: gbp(900) });
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify({ ...one.fields, parts: { a: 1 } }), one.id);
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false);
  const other = k.create('notes', { name: 'A note', parts: [1, 2] }, PERSON);
  assert.ok(other.ok, JSON.stringify(other));
  assert.equal(holdsSplit(sql, 'spends', 'parts'), false, 'a row of another list said this one is split');
});

test('NO INDEX TO ASK IS THE VIEW: slower, and the same sums', async () => {
  const { sql, row, asRead, throughView } = await made();
  row({ category: 'Food', amount: gbp(500) });
  row({ amount: gbp(900), parts: SPLIT(400, 500) });
  sql.exec(`DROP INDEX ${splitIndexName('spends', 'parts')}`);
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  assert.deepEqual(asRead(), throughView());
  assert.deepEqual(asRead(), [
    { k: 'Food', v: 900 },
    { k: 'Home', v: 500 },
  ]);
});

test('A NAME THAT IS NOT THE GRAMMAR\'S IS NEVER WRITTEN INTO A STATEMENT: it reads through the view', async () => {
  const { sql } = await made();
  assert.equal(holdsSplit(sql, "spends' OR 1=1 --", 'parts'), true);
  assert.equal(holdsSplit(sql, 'spends', "parts' --"), true);
});

test('A RECORD OPENED FROM BEFORE THE INDEX GETS IT AT ITS OPEN, with its split rows in it, and building it is safe twice', async () => {
  const { sql, row } = await made();
  row({ amount: gbp(900), parts: SPLIT(400, 500) });
  sql.exec(`DROP INDEX ${splitIndexName('spends', 'parts')}`);
  await openRecord(sql, fixedClock(NOW));
  assert.ok(sql.one("SELECT 1 AS y FROM sqlite_master WHERE type = 'index' AND name = ?", splitIndexName('spends', 'parts')));
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
  await openRecord(sql, fixedClock(NOW));
  assert.equal(holdsSplit(sql, 'spends', 'parts'), true);
});

test('DECLARING THE LIST AGAIN KEEPS THE INDEX, and a list with no field of parts has none', async () => {
  const { sql, k } = await made();
  const again = await k.install([{ ...SPENDS, body: { ...(SPENDS.body as object), name: 'Outgoings' } as never }]);
  assert.ok(again.ok, JSON.stringify(again));
  assert.ok(sql.one("SELECT 1 AS y FROM sqlite_master WHERE type = 'index' AND name = ?", splitIndexName('spends', 'parts')));
  assert.equal(sql.one("SELECT 1 AS y FROM sqlite_master WHERE type = 'index' AND name LIKE 'entry_i_notes__%split'"), undefined);
});

test('A FIGURE: nothing split reads no view, and a split written next is in its sum and under its own label at once', async () => {
  const { k, row, statements } = await made();
  const install = await k.install([BY_CATEGORY, TOTAL]);
  assert.ok(install.ok, JSON.stringify(install));
  row({ category: 'Food', amount: gbp(500) });
  statements.length = 0;
  const figure = (id: string) => {
    const out = k.metric(k.metricDecl(id)!) as { ok: boolean; value: { value: unknown; groups?: { key: unknown; value: unknown }[] }; refusal?: unknown };
    assert.ok(out.ok, JSON.stringify(out));
    return out.value;
  };
  assert.equal(figure('total').value, 500);
  assert.ok(statements.length > 0);
  assert.ok(!statements.some((q) => /^WITH entry AS/u.test(q)), 'a figure read the view with nothing split');

  row({ amount: gbp(900), parts: SPLIT(400, 500) });
  statements.length = 0;
  assert.equal(figure('total').value, 1_400);
  assert.ok(statements.some((q) => /^WITH entry AS/u.test(q)), 'the figure did not read the split row as its parts');
  const cut = figure('by-category');
  const labels = Object.fromEntries((cut.groups ?? []).map((p) => [String(p.key), p.value]));
  assert.equal(labels['Food'], 900);
  assert.equal(labels['Home'], 500);
});

test('THE QUESTION IS READ AS A READ OF THAT LIST ALONE, so a held figure is held by it and nothing else', () => {
  const asked = readsOf("SELECT 1 AS y FROM main.entry INDEXED BY entry_i_spends__parts__split WHERE register = 'spends' AND json_type(fields, '$.parts') = 'array' LIMIT 1", [], (w) => w === 'spends');
  assert.deepEqual(asked.lists, ['spends']);
  assert.equal(pastSplitView(`WITH ${splitView('spends', 'parts')} SELECT 1`), 'SELECT 1');
});
