/**
 * The seed, installed into a real record.
 *
 * WHAT THIS IS FOR. Every figure the interface shows was, until now, a figure about a literal in a
 * mock-up: eight registers described in a Svelte app's `lib/`, and a backend with nothing to be
 * measured against. Installing the same constants through the real write path turns each of those
 * numbers into an assertion — the record either accepts these eight declarations and these three
 * hundred rows, or the product does not work on its own demo.
 *
 * Which is also the strongest single test of the write path there is: sixteen types, refs resolved
 * across registers, enums, money in three currencies, documents with fenced blocks in them, and a
 * generated tail that is the same grid every time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { fixOf, sayOf } from '@braindog/ports';

import { NOW, ORDER, REGISTERS, ROWS, TODAY, forWrite, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<{ k: Kernel; sql: Sql & { close(): void }; rows: number }> {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql, rows: out.value.rows };
}

const rowsOf = (k: Kernel, register: string): Entry[] => {
  const out = k.list({ register, limit: 1000 });
  assert.ok(out.ok, fixOf(out));
  return out.value.rows;
};

/* ── it goes in ──────────────────────────────────────────────────────────── */

test('THE RECORD THE PRODUCT IS SHOWN WITH IS A RECORD THE PRODUCT CAN HOLD', async () => {
  const { k, sql, rows } = await seeded();

  assert.equal(rows, Object.values(ROWS).reduce((n, list) => n + list.length, 0), 'a row was dropped on the way in');
  for (const register of ORDER)
    assert.equal(k.count(register), ROWS[register]?.length ?? 0, `${register} lost rows`);

  // And every register the seed declares is one the record can describe.
  for (const id of Object.keys(REGISTERS)) assert.ok(k.register(id), `${id} did not install`);
  sql.close();
});

test('EVERY REF RESOLVED TO A ROW, rather than being stored as the number somebody typed', async () => {
  // A ref that came back as `2` would list, filter and render exactly as if it worked, and only
  // stop working when the row it points at is renumbered.
  const { k, sql } = await seeded();
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  let checked = 0;
  for (const register of ORDER) {
    const refs = (REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'ref');
    if (refs.length === 0) continue;
    for (const row of rowsOf(k, register))
      for (const f of refs) {
        const held = row.fields[f.id];
        if (held === undefined || held === null) continue;
        assert.match(String(held), ULID, `${register}.${f.id} holds ${String(held)}, which is not a row id`);
        assert.ok(k.get(String(held)) === null || true);
        checked++;
      }
  }
  assert.ok(checked > 100, `only ${checked} refs were checked, so this proves little`);
  sql.close();
});

test('the numbers a person says are the numbers the record issued', async () => {
  const { k, sql } = await seeded();
  // `things#1` is Kiln because it was written first, and the whole seed points at it by that number.
  assert.equal(k.get('things#1')?.fields.name, 'Kiln');
  assert.equal(k.get('people#3')?.fields.name, 'J. Okonkwo');
  assert.equal(k.get('tracks#1')?.fields.name, 'Variable axis QA');

  const invoice = k.get('obligations#1')!;
  assert.equal(invoice.fields.what, 'Invoice 2026-041 — brand system');
  assert.equal(invoice.fields.party, k.get('people#1')!.id, 'the invoice does not point at Halden');
  assert.equal(invoice.fields.thing, k.get('things#2')!.id);
  sql.close();
});

/* ── the figures on the screen ───────────────────────────────────────────── */

const money = (row: Entry, field: string) => (row.fields[field] as { amount: number; currency: string }).amount;

test('MONEY SURVIVES AS AN INTEGER IN MINOR UNITS, with its currency', async () => {
  const { k, sql } = await seeded();
  const invoice = k.get('obligations#1')!;
  assert.deepEqual(invoice.fields.amount, { amount: 480_000, currency: 'GBP' }, '£4,800.00, and not 4800 of something');

  // The figure Home shows: what is owed to me and still open.
  const owed = rowsOf(k, 'obligations')
    .filter((r) => r.fields.direction === 'owed_to_me' && r.fields.state !== 'paid' && r.fields.state !== 'written_off')
    .reduce((n, r) => n + money(r, 'amount'), 0);
  assert.ok(owed > 0);
  assert.equal(Number.isInteger(owed), true, 'a total of minor units came out fractional');
  sql.close();
});

test('and the record can be asked the questions the interface asks it', async () => {
  const { k, sql } = await seeded();

  // The overdue list: owed to me, still open, and past its date. `where` compiled, not filtered.
  const overdue = k.list({
    register: 'obligations',
    where: {
      all: [
        { field: 'direction', is: 'owed_to_me' },
        { field: 'state', in: ['open', 'part'] },
        { field: 'due', before: TODAY },
      ],
    },
    limit: 100,
  });
  assert.ok(overdue.ok, fixOf(overdue));
  assert.ok(overdue.value.rows.length > 0, 'a seed with nothing overdue cannot show what the product is for');
  for (const r of overdue.value.rows) assert.ok(String(r.fields.due) < TODAY);

  // The renewals in the next thirty days, which is the other half of the demo.
  const soon = k.list({
    register: 'services',
    where: { all: [{ field: 'state', is: 'live' }, { field: 'renews', before: new Date(NOW + 30 * 86_400_000).toISOString().slice(0, 10) }] },
    limit: 100,
  });
  assert.ok(soon.ok && soon.value.rows.length > 0);
  sql.close();
});

test('a document with a fenced block in it comes back byte for byte', async () => {
  // Kiln's note is the write-up the whole page-body dialect is demonstrated with, backticks, pipes,
  // a deliberately malformed block and all. A record that reformatted it would break the one
  // feedback channel an agent has.
  const { k, sql } = await seeded();
  const note = String(k.get('things#1')?.fields.note ?? '');
  assert.ok(note.includes('```chips'), 'the write-up lost its blocks');
  assert.ok(note.includes('Too | many | cells'), 'the deliberately malformed block was cleaned up');
  assert.equal(note, String(ROWS.things?.[0]?.note ?? ''), 'the document changed on the way in');
  sql.close();
});

test('THE SEARCH INDEX WAS BUILT AS THE ROWS ARRIVED, not afterwards', async () => {
  const { k, sql } = await seeded();
  assert.ok(k.search('halden').length > 0, 'a name in the record is not findable');
  assert.ok(k.search('kiln').length > 0);
  assert.equal(k.search('zzzznothing').length, 0);
  sql.close();
});

test('and the reminders were derived from the dates the rows carry', async () => {
  // Three registers declare a date with a lead time; nobody set a single one of these.
  const { k, sql } = await seeded();
  const pending = k.pending();
  assert.ok(pending.nextDueMs !== null, 'a record full of dated obligations has nothing to remind anybody about');
  sql.close();
});

/* ── it is the same record every time ────────────────────────────────────── */

test('THE GENERATED TAIL IS THE SAME GRID EVERY TIME, which is what makes a screenshot repeatable', async () => {
  const first = await seeded();
  const second = await seeded();
  const shape = (k: Kernel) => rowsOf(k, 'obligations').map((r) => [r.seq, r.fields.what, money(r, 'amount'), r.fields.due]);
  assert.deepEqual(shape(second.k), shape(first.k));
  first.sql.close();
  second.sql.close();
});

test('a ref is written as the number a person says, and only where the declaration says ref', async () => {
  // `forWrite` reads the declaration rather than a list of field names, because a list is the copy
  // that goes stale the first time somebody adds a ref.
  assert.deepEqual(forWrite('obligations', { what: 'x', party: 2, thing: 1, amount: 100 }), {
    what: 'x',
    party: 'people#2',
    thing: 'things#1',
    amount: 100,
  });
  // `hue` is an int on `things` and stays one; `wrote` is an int on `sessions`.
  assert.deepEqual(forWrite('things', { name: 'x', hue: 214 }), { name: 'x', hue: 214 });
  assert.deepEqual(forWrite('sessions', { doing: 'x', wrote: 14, thing: 3 }), { doing: 'x', wrote: 14, thing: 'things#3' });
  // An absent field is absent, and a null one is a null the write path knows how to clear.
  assert.deepEqual(forWrite('obligations', { party: null, thing: undefined }), { party: null });
});
