/**
 * No read in the kernel crashes on size: every statement that took one `?` per value binds the values as one JSON array.
 *
 * WHAT WENT WRONG. A Durable Object refuses a statement with more than 100 bound parameters (`DO_LIMITS.variableNumber`,
 * `ports/src/sql.ts`), and `node:sqlite`, which every other test runs on, takes 32,766. So a statement that built its
 * placeholders from a list, `IN (${xs.map(() => '?').join(', ')})`, passed every test and answered INTERNAL in
 * production the first time the list held 101 values. Each one swept here now reads its list through `json_each(?)`.
 *
 * THE DATABASE HERE IS CAPPED, as the Durable Object is: each statement goes through `guard` first, which throws
 * `TOO_MANY_PARAMS` above a hundred. So every case below would fail on this machine with the old shape, and each hands
 * its statement 250 values, two and a half times the ceiling.
 *
 * AND THE ONES LEFT ARE COUNTED. A new `() => '?'` in `packages/kernel/src` fails the last test, which names the
 * statement to bind as one array instead. When one of those left is swept, lower the ceiling to the new count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DO_LIMITS, guard, type Param, type Row, type Sql } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type WriteContext } from '../src/index.ts';
import { importBrainl } from '../src/brainl.ts';
import { FOLD_HOPS, holders, rekey, type KeyedList } from '../src/entities.ts';
import { OUTBOX_KINDS, enqueue, lease } from '../src/outbox.ts';
import { referencedBy } from '../src/referenced.ts';
import { drainSchedule, pendingWork } from '../src/schedule.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER: WriteContext = { actor: 'p_owner' };
const MANY = 250;

/** The test database as the Durable Object holds it: a statement past its ceilings throws before the driver sees it. */
function capped(sql: NodeSql): Sql & { most: () => number } {
  let most = 0;
  const check = (text: string, params: readonly Param[]): void => {
    guard(text, params);
    most = Math.max(most, params.length);
  };
  return {
    exec: (text: string, ...params: Param[]) => {
      check(text, params);
      sql.exec(text, ...params);
    },
    all: <T = Row>(text: string, ...params: Param[]) => {
      check(text, params);
      return sql.all<T>(text, ...params);
    },
    one: <T = Row>(text: string, ...params: Param[]) => {
      check(text, params);
      return sql.one<T>(text, ...params);
    },
    transactionSync: <T>(fn: () => T) => sql.transactionSync(fn),
    most: () => most,
  };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const PEOPLE_KEYS: KeyedList = { register: 'people', role: 'meets', fields: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', handles: 'handles' } };

async function people(): Promise<{ sql: NodeSql; made: (name: string, fields?: Record<string, unknown>) => Entry }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PEOPLE]));
  return { sql, made: (name, fields = {}) => value<Entry>(k.create('people', { name, ...fields }, OWNER)) };
}

test('entities, holders: 250 keys asked in one statement find the one person who holds one of them', async () => {
  const { sql, made } = await people();
  const ada = made('Ada Byron', { email: 'ada@example.test' });
  const asked = [...Array.from({ length: MANY - 1 }, (_, i) => `github:nobody${i}`), 'email:ada@example.test'];
  const db = capped(sql);
  assert.deepEqual(holders(db, 'people', asked), [{ id: ada.id, keys: ['email:ada@example.test'] }]);
  assert.ok(db.most() <= 2, `holders bound ${db.most()} parameters for ${MANY} keys`);
  sql.close();
});

test('entities, rekey: an unfolded row takes its keys back from the whole chain, and no statement binds more than five', async () => {
  const { sql, made } = await people();
  /* A CHAIN AS LONG AS THE FOLD WALKS, `FOLD_HOPS` rows each folded into the next, and the key parked at its end. */
  const ends = Array.from({ length: FOLD_HOPS + 1 }, (_, i) => made(`Link ${i}`));
  for (let i = 0; i < ends.length - 1; i++)
    sql.exec('UPDATE entry SET fields = json_set(fields, ?, ?) WHERE id = ?', '$.merged_into', ends[i + 1]!.id, ends[i]!.id);
  const ada = made('Ada Byron');
  sql.exec("INSERT INTO entity_key (key, register, row_id, source, at) VALUES ('github:ada', 'people', ?, 'test', '2026-10-09')", ends.at(-1)!.id);
  const before = { id: ada.id, register: 'people', deleted_at: null, fields: { name: 'Ada Byron', handles: ['github:ada'], merged_into: ends[0]!.id } };
  const after = { ...before, fields: { name: 'Ada Byron', handles: ['github:ada'] } };
  const db = capped(sql);
  rekey(db, PEOPLE_KEYS, before, after, 'test', '2026-10-09');
  assert.equal(sql.one<{ row_id: string }>("SELECT row_id FROM entity_key WHERE key = 'github:ada'")?.row_id, ada.id);
  assert.ok(db.most() <= 5, `rekey bound ${db.most()} parameters for a chain of ${ends.length}`);
  sql.close();
});

test('outbox, lease: 250 kinds asked in one claim lease the job that is waiting', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const id = enqueue(sql, () => '01JZ8QK3F7R2M9V4XN6TCB5HAD', NOW, 'notify.email', { to: 'ada@example.test' });
  const kinds = Array.from({ length: MANY }, (_, i) => OUTBOX_KINDS[i % OUTBOX_KINDS.length]!);
  const db = capped(sql);
  const held = lease(db, { mint: () => '01JZ8QK3F7R2M9V4XN6TCB5HAE', allocate: () => 1, nowMs: NOW }, kinds, 10);
  assert.deepEqual(held.map((r) => r.id), [id]);
  assert.ok(db.most() <= 6, `lease bound ${db.most()} parameters for ${MANY} kinds`);
  sql.close();
});

test('schedule, pendingWork and drainSchedule: 250 kinds asked answer, and an empty list still matches nothing', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  enqueue(sql, () => '01JZ8QK3F7R2M9V4XN6TCB5HAF', NOW, 'notify.email', { to: 'ada@example.test' });
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01JZ8QK3F7R2M9V4XN6TCB5HAG', ?, 'reminder', 'sweep', '{}', 'pending', 0)",
    new Date(NOW - 60_000).toISOString(),
  );
  const db = capped(sql);
  const delivers = Array.from({ length: MANY }, (_, i) => (i === MANY - 1 ? 'notify.email' : `nothing.${i}`));
  assert.equal(pendingWork(db, delivers).outboxPending, true);
  assert.equal(pendingWork(db, delivers.slice(0, -1)).outboxPending, false);

  const deps = { mint: () => '01JZ8QK3F7R2M9V4XN6TCB5HAH', allocate: () => 1, nowMs: NOW };
  assert.equal(drainSchedule(db, deps, { reminder: () => null }, 100, []).claimed, 0, 'an empty list of kinds claimed a row');
  const kinds = Array.from({ length: MANY }, (_, i) => (i === MANY - 1 ? 'reminder' : 'pull') as 'reminder' | 'pull');
  const drained = drainSchedule(db, deps, { reminder: () => null }, 100, kinds);
  assert.deepEqual(drained, { claimed: 1, done: 1, failed: 0, dead: 0 });
  assert.ok(db.most() <= 4, `the schedule bound ${db.most()} parameters for ${MANY} kinds`);
  sql.close();
});

test('referenced: a list with 250 fields pointing here still keeps the row one of them names', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(
    await k.install([
      { id: 'register.accounts', kind: 'register', body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
      {
        id: 'register.moves',
        kind: 'register',
        body: { id: 'moves', name: 'Moves', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'account', type: 'ref', to: 'accounts' }] },
      },
    ]),
  );
  const cash = value<Entry>(k.create('accounts', { name: 'Cash' }, OWNER));
  value(k.create('moves', { what: 'Rent', account: cash.id }, OWNER));

  /* THE LIST'S DECLARATION IS STRETCHED TO 250 FIELDS POINTING HERE, the real one last, which `declare.ts` would
     not install; the statement is what is under test, and it reads the fields off whatever the cache hands it. */
  const pointing = [...Array.from({ length: MANY - 1 }, (_, i) => ({ id: `ref_${i}`, type: 'ref', to: 'accounts' })), { id: 'account', type: 'ref', to: 'accounts' }];
  const db = capped(sql);
  const parts = {
    sql: db,
    register: (id: string) =>
      id === 'accounts' ? { id: 'accounts', name: 'Accounts', delete: 'refuse_while_referenced', fields: [] } : id === 'moves' ? { id: 'moves', name: 'Moves', fields: pointing } : undefined,
    declarations: () => [{ kind: 'register', id: 'register.moves' }],
  };
  const refused = referencedBy(parts as never, 'accounts', cash.id);
  assert.ok(refused, 'a row that a live row points at was let go');
  assert.match(JSON.stringify(refused), /Moves/);
  assert.match(JSON.stringify(refused), /1 entry\b/);
  assert.ok(db.most() <= 5, `the count bound ${db.most()} parameters for ${MANY} fields`);
  sql.close();
});

test('brainl, import: a row as wide as a table may be goes in through one parameter, each value as it was written', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  /* A TABLE AS WIDE AS THE DURABLE OBJECT LETS ONE BE, its hundred columns, added to this record's section map so the
     import reads it as one of its own, in one parameter and a blob's rather than a hundred. The columns carry no type,
     so a value comes back as the type it was bound. */
  const cols = Array.from({ length: DO_LIMITS.column - 2 }, (_, i) => `c${i}`);
  sql.exec(`CREATE TABLE wide (id TEXT PRIMARY KEY, ${cols.join(', ')}, b BLOB)`);
  sql.exec("INSERT INTO dog_section (table_name, section) VALUES ('wide', 'data')");
  const cell = (i: number): string | number | null =>
    i % 5 === 0 ? `text ${i}` : i % 5 === 1 ? i : i % 5 === 2 ? i + 0.5 : i % 5 === 3 ? null : i % 2 ? '{"looks":"like json"}' : '[1, 2]';
  const lines = [`#table wide id,${cols.join(',')},b`, JSON.stringify(['w1', ...cols.map((_, i) => cell(i)), { b64: 'AQID' }])];
  const db = capped(sql);
  const out = importBrainl(db, (fn) => sql.transactionSync(fn), lines);
  assert.ok(out.ok, JSON.stringify(out));
  assert.ok(db.most() <= 2, `the import bound ${db.most()} parameters for ${cols.length} columns`);
  const row = sql.one<Record<string, unknown>>('SELECT * FROM wide WHERE id = ?', 'w1');
  assert.ok(row, 'the wide row did not go in');
  for (let i = 0; i < cols.length; i++) assert.deepEqual(row[`c${i}`], cell(i), `c${i} came back changed`);
  assert.deepEqual([...(row.b as Uint8Array)], [1, 2, 3]);
  const kinds = sql.one<{ t: string; n: string; r: string }>('SELECT typeof(c0) AS t, typeof(c1) AS n, typeof(c2) AS r FROM wide');
  assert.deepEqual({ ...kinds }, { t: 'text', n: 'integer', r: 'real' });
  sql.close();
});

test('brainl, import: a long text binds on its own, so one row of them is never one value past the bound on length', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  sql.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, a, b, n)');
  sql.exec("INSERT INTO dog_section (table_name, section) VALUES ('notes', 'data')");
  /* QUOTES AND NEWLINES, which JSON escapes, so in one array these would bind as one value twice their own size. */
  const long = (c: string): string => `"${c}"\n`.repeat(400_000);
  const lines = [
    '#table notes id,a,b,n',
    JSON.stringify(['short', long('a'), 'and a short one', 7]),
    JSON.stringify([long('x'), long('y'), long('z'), null]),
  ];
  const seen: number[] = [];
  const db = capped(sql);
  const out = importBrainl({ ...db, exec: (text, ...params) => (seen.push(...params.map((p) => (typeof p === 'string' ? p.length : 0))), db.exec(text, ...params)) }, (fn) => sql.transactionSync(fn), lines);
  assert.ok(out.ok, JSON.stringify(out));
  assert.ok(Math.max(...seen) <= long('a').length, `a bound value was ${Math.max(...seen)} characters, longer than the longest text`);
  assert.deepEqual({ ...sql.one<Record<string, unknown>>('SELECT a, b, n FROM notes WHERE id = ?', 'short') }, { a: long('a'), b: 'and a short one', n: 7 });
  assert.deepEqual({ ...sql.one<Record<string, unknown>>('SELECT a, b, n FROM notes WHERE id = ?', long('x')) }, { a: long('y'), b: long('z'), n: null });
  sql.close();
});

/* THE STATEMENTS STILL BUILT FROM A LIST, each bounded by something other than the data: a fixed list in the source, or
   index.ts's own sweep in a later batch. Counted by the `() => '?'` that makes a mark per value, so `push.ts`'s
   `Array.from` helper is one of them as much as a `.map`. A new one fails here; one swept lowers this to the new count. */
const PLACEHOLDER_CEILING = 9;

test(`packages/kernel/src builds at most ${PLACEHOLDER_CEILING} placeholder lists with () => '?', and no new one`, () => {
  const src = new URL('../src/', import.meta.url).pathname;
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith('.ts'))
        readFileSync(path, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            for (const _ of line.matchAll(/\(\) => '\?'/g)) found.push(`${path.slice(src.length)}:${i + 1}`);
          });
    }
  };
  walk(src);
  assert.ok(
    found.length <= PLACEHOLDER_CEILING,
    `${found.length} statements build one ? per value, above ${PLACEHOLDER_CEILING}: bind the new one as one JSON array read with json_each(?). ${found.join(', ')}`,
  );
});
