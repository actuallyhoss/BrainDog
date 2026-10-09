/**
 * A record written at an older format opens on this build, and every entry in it reads the same after (SHL-A06's drill).
 *
 * THE GUARD `format-current` CANNOT BE. Migrations run at every open (`applyMigrations`), so on a live record that sign
 * reads green whenever the open worked; what it cannot say is that an older file opens at all. This is that check: a
 * record laid down by the SQL of migrations 1 to N alone (N = 33, 34, 35 and 37, the formats batches 44 to 47 shipped),
 * with the data steps those builds ran beside them, then filled with what a build writes, then opened here.
 *
 * THE ROWS ARE WRITTEN BY THIS BUILD AND COPIED IN, column by column the two layouts share, since no older build is kept
 * to write them. That is what an older build left: the same tables, without the columns and tables that came later.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { rebuildKeys } from '../src/entities.ts';
import { seedLadder } from '../src/change-kind.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { checksum, execScript, FORMAT_VERSION, KERNEL_MIGRATION, MIGRATIONS } from '../src/migrate.ts';
import { causeSteps } from '../src/migrations/0031_cause.ts';
import { repeatMarks } from '../src/migrations/0035_repeat_marks.ts';
import { SIGNS_VITALS } from '../src/signs-vitals.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const at = new Date(NOW).toISOString();

/** The formats a file may still be in: the last four this repository shipped. */
const OLDER = [33, 34, 35, 37];

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

/** A record written by this build: bills made, one paid, one tagged, one deleted. */
async function written(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([BILLS]);
  assert.ok(out.ok, fixOf(out));
  const made = (what: string, amount: number) => {
    const r = k.create('bills', { what, amount: { amount, currency: 'GBP' }, state: 'open' } as never, { actor: 'p_1' });
    assert.ok(r.ok, JSON.stringify(r));
    return r.value;
  };
  const rent = made('Halden rent', 125_000);
  made('Office chair', 9_900);
  const gone = made('Mistaken fare', 300);
  assert.ok(k.update('bills', rent.id, { state: 'paid', tags: ['home'] } as never, { actor: 'p_1' }).ok);
  assert.ok(k.update('bills', gone.id, { deleted_at: true } as never, { actor: 'p_1' }).ok);
  return { k, sql };
}

/**
 * A file at migration `n`: the SQL of 1 to `n`, each with its ledger line and its format word, and the data steps the
 * builds of those days ran after theirs, as `applyMigrations` does.
 */
async function laidAt(n: number): Promise<NodeSql> {
  const sql = openSqlite();
  const mint = ulids(() => NOW);
  sql.exec('CREATE TABLE IF NOT EXISTS migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)');
  for (const m of MIGRATIONS.slice(0, n)) {
    execScript(sql, m.sql);
    sql.exec('INSERT INTO migration (version, applied_at, checksum) VALUES (?, ?, ?)', m.version, at, await checksum(m.sql));
    const bump = /^-- format-bump (\d+)$/m.exec(m.sql);
    if (bump) sql.exec("INSERT INTO dog_meta (key, value) VALUES ('format', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", bump[1]!);
    if (m.slug === 'entity_key') rebuildKeys(sql, at);
    if (m.slug === 'trust') seedLadder(sql, NOW);
    if (m.slug === 'cause') causeSteps(sql, mint, at);
    if (m.slug === 'repeat_marks') repeatMarks(sql, mint, at);
  }
  return sql;
}

const columns = (sql: NodeSql, table: string): string[] => sql.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', table).map((c) => c.name);

/**
 * Every row of `from` into the older file `to`, table by table and column by column the two share. The search index is
 * copied by its own columns, as a build of those days kept it beside each row; its shadow tables are its own business.
 */
function copyInto(from: NodeSql, to: NodeSql): void {
  const tables = to
    .all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'migration' AND name NOT LIKE 'entry_fts_%' ORDER BY rowid")
    .filter((t) => !/^CREATE VIRTUAL TABLE/i.test(t.sql) || t.name === 'entry_fts');
  to.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) {
    if (t.name === 'entry_fts') {
      for (const r of from.all<{ rowid: number; id: string; register: string; text: string }>('SELECT rowid, id, register, text FROM entry_fts'))
        to.exec('INSERT INTO entry_fts (rowid, id, register, text) VALUES (?, ?, ?, ?)', r.rowid, r.id, r.register, r.text);
      continue;
    }
    const theirs = new Set(columns(from, t.name));
    const shared = columns(to, t.name).filter((c) => theirs.has(c));
    if (shared.length === 0) continue;
    const list = shared.map((c) => `"${c}"`).join(', ');
    /* THE ROWID TRAVELS where the table has one, because the index is keyed on the row's. */
    const rowid = /WITHOUT ROWID/i.test(t.sql) ? '' : 'rowid AS "__rowid", ';
    to.exec(`DELETE FROM "${t.name}"`);
    for (const r of from.all<Record<string, unknown>>(`SELECT ${rowid}${list} FROM "${t.name}"`)) {
      const values = shared.map((c) => r[c] as never);
      if (rowid === '') to.exec(`INSERT INTO "${t.name}" (${list}) VALUES (${shared.map(() => '?').join(', ')})`, ...values);
      else to.exec(`INSERT INTO "${t.name}" (rowid, ${list}) VALUES (?, ${shared.map(() => '?').join(', ')})`, r.__rowid as never, ...values);
    }
  }
  to.exec('PRAGMA foreign_keys = ON');
}

/** What a person reads of one entry, and its history, by id. */
const seen = (k: Kernel, id: string): { entry: Entry | null; lines: unknown[] } => ({ entry: k.get(id), lines: k.history(id) });

for (const n of OLDER) {
  test(`A RECORD AT MIGRATION ${n} opens on this build, reads every entry as it was written, and is then in the current format`, async () => {
    const source = await written();
    const ids = source.sql.all<{ id: string }>('SELECT id FROM entry ORDER BY rowid').map((r) => r.id);
    assert.ok(ids.length >= 3, 'the record holds what was written');
    const before = new Map(ids.map((id) => [id, seen(source.k, id)]));
    assert.ok([...before.values()].filter((b) => b.entry !== null).length >= 2, 'the entries read before the copy');

    const old = await laidAt(Math.min(n, KERNEL_MIGRATION));
    copyInto(source.sql, old);
    const format = SIGNS_VITALS.find((s) => s.sign === 'format-current')!.read!;
    const behind = KERNEL_MIGRATION - Math.min(n, KERNEL_MIGRATION);
    const unopened = format(old, NOW, 'UTC');
    /* RED FIRST: a file left at an older format, read before it is opened, says how far behind it is. */
    assert.equal(unopened.state, behind === 0 ? 'green' : 'red', unopened.said);
    assert.equal(unopened.value, behind);

    const k = await openRecord(old, fixedClock(NOW + 60_000));
    assert.equal(old.one<{ v: number }>('SELECT max(version) AS v FROM migration')?.v, KERNEL_MIGRATION, 'every later update applied at open');
    assert.equal(old.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'format'")?.value, String(FORMAT_VERSION));
    const opened = format(old, NOW, 'UTC');
    assert.equal(opened.state, 'green', opened.said);

    for (const id of ids) {
      const was = before.get(id)!;
      const now = seen(k, id);
      assert.deepEqual(now.entry, was.entry, `an entry read differently after the open at migration ${n}`);
      assert.ok(was.lines.length > 0, 'every entry written has its history');
      assert.deepEqual(now.lines, was.lines, `an entry's history read differently after the open at migration ${n}`);
    }
    const live = k.list({ register: 'bills', limit: 50 });
    assert.ok(live.ok, fixOf(live));
    assert.deepEqual(live.value.rows.map((r) => r.fields.what).sort(), ['Halden rent', 'Office chair']);
    assert.equal(k.search('Halden').length, 1, 'what the older build indexed is still found');
    source.sql.close();
    old.close();
  });
}
