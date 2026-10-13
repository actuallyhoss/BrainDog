/**
 * `COST_SQL` is `costOf` said in SQL, so a queue counts and ranks every open question without reading a body into the
 * process (audit 16, M5). The two must give one band for every body, or a count beside the queue would disagree with
 * the order it is drawn in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COST_RANK_SQL, COST_SQL, OLD_MS, WAIT_RANK_SQL, WAIT_SQL, costOf, costRank, waitOf, waitParams, waitRank, waitRows, type Wait } from '../src/weigh.ts';
import { openSqlite } from './sqlite.ts';

const many = (n: number, row: Record<string, unknown> = {}) => Array.from({ length: n }, () => row);

const CASES: [string, unknown][] = [
  ['rowset', { rows: [{ register: 'tasks', fields: {} }] }],
  ['rowset', { rows: many(20, { register: 'tasks' }) }],
  ['rowset', { rows: [{ register: 'tasks' }, { at: 'tasks#4', patch: {} }] }],
  ['rowset', { rows: [{ at: 7 }] }],
  ['rowset', { rows: ['tasks#4'] }],
  ['rowset', { rows: { at: 'tasks#4' } }],
  ['rowset', {}],
  ['change', { from: { id: 'page.today' }, to: {} }],
  ['change', { from: null }],
  ['change', {}],
  ['pack', { disable: 'money-core' }],
  ['pack', { disable: 3 }],
  ['pack', { install: 'people' }],
  ['settings', { set: {} }],
  ['arrange', { packs: { disable: ['money-core'] } }],
  ['arrange', { packs: { install: ['people'] } }],
  ['arrange', { packs: { enable: [] }, pages: [{}] }],
  ['arrange', { settings: [{}] }],
  ['arrange', { rows: many(20) }],
  ['arrange', { rows: many(3), packs: ['disable'] }],
  ['arrange', { packs: 'disable' }],
  ['pattern', { any: true }],
  ['options', { options: [] }],
  ['something-new', { from: {} }],
];

test('COST_SQL GIVES costOf’S BAND FOR EVERY BODY, a body that is not an object included', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  /* COST_SQL READS WHICH FIELDS THE HISTORY WITHHOLDS off the lists' declarations, so the table has to be there. */
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  /* `COST_SQL` reads whether a list holds a row since batch 64 (a field added to a list in use). */
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq))');
  const bodies: [string, string][] = [
    ...CASES.map(([kind, body]): [string, string] => [kind, JSON.stringify(body)]),
    ...['rowset', 'change', 'pack', 'settings', 'arrange', 'pattern', 'options'].flatMap((kind): [string, string][] => [
      [kind, 'not json'],
      [kind, '[1, 2]'],
      [kind, '"text"'],
    ]),
  ];
  for (const [kind, body] of bodies) {
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, body);
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* text that is not JSON is read as nothing, as the kernel reads it */
    }
    const want = costOf(kind, parsed);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, `${kind} ${body.slice(0, 60)}`);
  }
  sql.close();
});

/* ── WAIT_SQL is waitOf said in SQL (AGT-C08) ── */

const NOW = Date.UTC(2026, 9, 9, 9);
const FRESH = new Date(NOW - 3_600_000).toISOString();
const STALE = new Date(NOW - OLD_MS - 60_000).toISOString();
const ROW_ID = '01K0000000000000000000BILL';

/* ONE SET OF QUESTIONS, each with the wait it must have: TypeScript and SQL are held to it and so to each other. */
const WAITING: [Wait, string, unknown, string][] = [
  ['soon', 'rowset', { register: 'bills', rows: [{ at: 'bills#1', patch: { paid: true } }] }, FRESH],
  ['soon', 'rowset', { register: 'bills', rows: [{ at: 'B1', patch: { paid: true } }] }, FRESH],
  ['soon', 'rowset', { register: 'bills', rows: [{ at: ROW_ID, patch: { paid: true } }] }, FRESH],
  ['soon', 'rowset', { register: 'bills', rows: [{ at: 'bills#2', patch: { due: '2026-10-11' } }] }, FRESH],
  ['soon', 'rowset', { register: 'bills', rows: [{ name: 'Rent', due: '2026-10-09T23:00:00.000Z' }] }, STALE],
  ['soon', 'rowset', { register: 'bills', rows: [{ name: 'Rent', amount: { amount: 120000, currency: 'GBP' } }] }, FRESH],
  ['soon', 'rowset', { register: 'tasks', rows: [{ at: 'tasks#9', patch: { cost: { amount: 5, currency: 'EUR' } } }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ at: 'bills#2', patch: { paid: true } }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ at: 'bills#3', patch: { paid: true } }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ at: 'B01', patch: { paid: true } }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ name: 'Gas', due: '2026-10-08' }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ name: 'Gas', paid_on: '2026-10-10' }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ name: 'Gas', was_due: '2026-10-10' }] }, FRESH],
  ['new', 'rowset', { register: 'tasks', rows: [{ at: 'bills#1', patch: { paid: true } }] }, FRESH],
  ['new', 'rowset', { register: { bills: 'bills' }, rows: [{ at: 'bills#1', patch: {} }] }, FRESH],
  ['new', 'rowset', { register: 'bills', rows: [{ name: 'Rent', amount: { amount: 100, currency: 'gbp' } }] }, FRESH],
  ['old', 'rowset', { register: 'bills', rows: [{ at: 'bills#2', patch: { paid: true } }] }, STALE],
  ['old', 'rowset', { register: 'bills', rows: 'bills#1' }, STALE],
  ['old', 'options', { register: 'bills', rows: [{ at: 'bills#1', patch: {} }] }, STALE],
  ['old', 'change', { to: {} }, STALE],
  ['new', 'pack', { install: 'money' }, FRESH],
];

test('WAIT_SQL GIVES waitOf’S WAIT FOR EVERY QUESTION, rows read the one way, and WAIT_RANK_SQL its rank', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (id TEXT, body_kind TEXT, body TEXT, opened_at TEXT)');
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq))');
  const bills = (fields: unknown[]) => JSON.stringify({ id: 'bills', seq_prefix: 'B', fields });
  /* The live list: `due` is a deadline; `was_due` was one and is retired; `paid_on` is a day and no deadline. The version
     before it said `paid_on` was one, and is superseded, so it is never read. */
  sql.exec("INSERT INTO declaration VALUES ('register.bills', 1, 'register', ?, 0, '2026-10-01T00:00:00.000Z')", bills([{ id: 'paid_on', type: 'day', deadline: true }]));
  sql.exec(
    "INSERT INTO declaration VALUES ('register.bills', 2, 'register', ?, 0, NULL)",
    bills([
      { id: 'due', type: 'day', deadline: true },
      { id: 'was_due', type: 'day', deadline: true, retired: true },
      { id: 'paid_on', type: 'day' },
    ]),
  );
  sql.exec("INSERT INTO entry VALUES (?, 'bills', 1, ?, NULL)", ROW_ID, JSON.stringify({ due: '2026-10-10' }));
  sql.exec("INSERT INTO entry VALUES ('01K0000000000000000000BIL2', 'bills', 2, ?, NULL)", JSON.stringify({ due: '2026-11-20' }));
  sql.exec("INSERT INTO entry VALUES ('01K0000000000000000000BIL3', 'bills', 3, ?, '2026-10-08T00:00:00.000Z')", JSON.stringify({ due: '2026-10-10' }));
  for (const [i, [, kind, body, at]] of WAITING.entries()) sql.exec('INSERT INTO suggestion VALUES (?, ?, ?, ?)', `q${i}`, kind, JSON.stringify(body), at);

  const rows = waitRows(sql);
  const said = sql.all<{ id: string; wait: string; rank: number }>(`SELECT id, ${WAIT_SQL} AS wait, ${WAIT_RANK_SQL} AS rank FROM suggestion ORDER BY rowid`, ...waitParams(NOW), ...waitParams(NOW));
  for (const [i, [want, kind, body, at]] of WAITING.entries()) {
    const ts = waitOf({ body_kind: kind, body: JSON.stringify(body), opened_at: at }, NOW, rows);
    assert.deepEqual([ts, said[i]?.wait, said[i]?.rank], [want, want, waitRank(want)], `q${i} ${kind} ${JSON.stringify(body).slice(0, 70)}`);
  }
  /* AND AS AN ORDER: soon first, then old, then new, which is what `openQuestions` draws by. */
  const order = sql.all<{ id: string }>(`SELECT id FROM suggestion ORDER BY ${WAIT_RANK_SQL} ASC, rowid ASC`, ...waitParams(NOW)).map((r) => r.id);
  const want = WAITING.map(([w], i) => ({ w, id: `q${i}` }))
    .sort((a, b) => waitRank(a.w) - waitRank(b.w) || Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .map((q) => q.id);
  assert.deepEqual(order, want);
  /* A body that is not JSON, or not an object, only waits; it never throws. */
  sql.exec('DELETE FROM suggestion');
  for (const body of ['not json', '[1, 2]', '"text"']) sql.exec("INSERT INTO suggestion VALUES ('x', 'rowset', ?, ?)", body, STALE);
  assert.deepEqual(sql.all<{ wait: string }>(`SELECT ${WAIT_SQL} AS wait FROM suggestion`, ...waitParams(NOW)).map((r) => r.wait), ['old', 'old', 'old']);
  sql.close();
});
