/**
 * WHAT WENT QUIET, ON TODAY (ENG-B13 on a screen). A list that stopped being written to, a way in that stopped taking
 * messages, a feed that missed its time: the record works them out (`exceptions`, the kernel's source) and until now no
 * screen a person opens reported one. Today carries them as one tile, `Gone quiet`, where the record reads them onto a
 * page for this reader (`Holds.quiet`), and nothing at all on a day nothing is quiet.
 *
 * The body is asserted as `default-home.test.ts` asserts it, and then read by a real record, so the tile is held to
 * what the record draws and not to what this file hopes it does.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';

import { DEFAULT_HOME, quietHeld, todayHome, type Holds } from './default-home.ts';

const ALL: Holds = { tasks: true, adds: true, money: true };
const quietOf = (holds: Holds) => todayHome(holds).blocks.filter((b) => b.source === 'exceptions');

test('TODAY CARRIES ONE TILE OF WHAT WENT QUIET: what it is, since when and what it was before, in the read`s own order', () => {
  const blocks = quietOf({ ...ALL, quiet: true });
  assert.equal(blocks.length, 1);
  const b = blocks[0]!;
  assert.equal(b.kind, 'table');
  assert.equal(b.heading, 'Gone quiet');
  assert.deepEqual(b.columns?.map((c) => c.field), ['subject', 'since', 'was']);
  /* THE LONGEST QUIET FIRST IS THE READ'S OWN ORDER, and an `order:` on it is refused; every kind is shown, so no `where:`. */
  assert.equal(b.where, undefined);
  assert.equal(b.order, undefined);
  /* NOTHING QUIET DRAWS NOTHING: with no empty line the record leaves the block out (`drawn.ts`). */
  assert.equal(b.empty, undefined);
  assert.ok(b.icon, 'a tile has its icon');
  /* IN THE MAIN COLUMN, never the rail, and never the page's line. */
  assert.equal((b as unknown as { area?: string }).area, undefined);
  assert.notEqual(b.lead, true);
});

/* THE BOARD'S ORDER (the widgets plan of 29 October): Needs you leads, then Late, then cash and the week; the record's
   own state, its vital signs and what went quiet, follows them, before the key numbers. */
const keyOf = (b: { key?: unknown } | undefined): unknown => b?.key;

test('IT STANDS AFTER THE VITAL SIGNS AND BEFORE THE KEY NUMBERS, with tasks or without', () => {
  for (const holds of [{ ...ALL, health: true, quiet: true }, { tasks: false, adds: false, money: false, health: true, quiet: true }] as Holds[]) {
    const blocks = todayHome(holds).blocks;
    const at = blocks.findIndex((b) => b.source === 'exceptions');
    const signs = blocks.map((b, n) => (b.when?.metric === 'signs-red' ? n : -1)).filter((n) => n >= 0);
    assert.equal(signs.length, 2);
    assert.equal(at, signs[1]! + 1, 'straight after the line on the vital signs');
    assert.equal(keyOf(blocks[at + 1]), 'numbers', 'straight before the key numbers');
    assert.ok(at > blocks.findIndex((b) => b.source === 'governance.open'), 'after what needs you');
    assert.ok(at > blocks.findIndex((b) => b.heading === 'Late'), 'after what is late');
  }
  /* WITHOUT THE HEALTH PAGE it stands straight after the cash, still before the key numbers. */
  const bare = todayHome({ ...ALL, quiet: true }).blocks;
  const at = bare.findIndex((b) => b.source === 'exceptions');
  assert.equal(keyOf(bare[at - 1]), 'cash');
  assert.equal(keyOf(bare[at + 1]), 'numbers');
});

test('A RECORD THAT DOES NOT READ IT ONTO A PAGE DRAWS NO SUCH BLOCK, and is block for block as it was', () => {
  for (const holds of [ALL, { ...ALL, quiet: false }, { tasks: false, adds: false, money: false }] as Holds[]) assert.deepEqual(quietOf(holds), []);
  assert.deepEqual(todayHome({ ...ALL, quiet: false }), DEFAULT_HOME);
  assert.deepEqual(DEFAULT_HOME.blocks.filter((b) => b.source === 'exceptions'), []);
  /* WITH IT, the one tile is all that is added, and its key on the phone's board. */
  const held = todayHome({ ...ALL, quiet: true });
  assert.deepEqual({ ...held, phone: DEFAULT_HOME.phone, blocks: held.blocks.filter((b) => b.source !== 'exceptions') }, DEFAULT_HOME);
  assert.deepEqual(held.phone?.order?.filter((k) => k !== 'quiet'), DEFAULT_HOME.phone?.order);
});

test('NO LIST AND NO ADD-ON IS NAMED IN IT: the tile is the same on every record, and its words are plain', () => {
  const [b] = quietOf({ ...ALL, quiet: true });
  const text = JSON.stringify(b);
  assert.doesNotMatch(text, /register\.|"register"|"page"|\/p\/|\/r\//u, 'names no list and no page');
  /* A record that calls its tasks jobs, with a week of its own, is given the very same tile. */
  const week = { due: { register: 'orders', name: 'Orders', one: 'Order', day: 'due', who: 'customer', what: 'what', open: null, paid: null } };
  assert.deepEqual(quietOf({ ...ALL, quiet: true, one: 'job', week }), [b]);
  assert.deepEqual(quietOf({ tasks: false, adds: false, money: false, quiet: true }), [b]);
  for (const said of [b!.heading, ...(b!.columns ?? []).map((c) => c.label)]) {
    assert.ok(said, 'every heading is said');
    assert.doesNotMatch(said!, /[—]|\b(row|entity|item|exception)s?\b/iu);
  }
});

/* ── read by a record ──────────────────────────────────────────────────── */

const NOW = Date.UTC(2026, 9, 14, 12);
const ago = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

/** A record that keeps one list, Numbers, on a fixed clock, with the handle its rows are planted through. */
async function record() {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync: <T>(fn: () => T): T => fn(),
  };
  const k = await openRecord(sql as unknown as Parameters<typeof openRecord>[0], { now: () => NOW });
  const made = (await k.install([
    { id: 'register.numbers', kind: 'register', body: { id: 'numbers', name: 'Numbers', title: 'what', fields: [{ id: 'what', type: 'text' }] } },
  ] as never)) as { ok: boolean; refusal?: { fix: string } };
  assert.ok(made.ok, made.refusal?.fix);
  let n = 0;
  /** One reading on Numbers, made `days` ago, as a write that day would have left it (the kernel's own test plants it so). */
  const reading = (days: number): void => {
    const id = `01KQUIET${String(++n).padStart(18, '0')}`;
    sql.exec('INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, 'numbers', n, JSON.stringify({ what: 'a reading' }), ago(days), ago(days));
  };
  return { k, db, reading };
}

/** Today on a record with no tasks and no Money page, which a record that keeps only Numbers is, as its own page. */
const TODAY = todayHome({ tasks: false, adds: false, money: false, quiet: true });
const asPage = { id: 'page.today-quiet', kind: 'page', body: { ...TODAY, page: 'today-quiet' } };

test('THE RECORD DRAWS THE TILE WHEN A LIST HAS STOPPED: its name, the day it was last written to and what it was before', async () => {
  const { k, db, reading } = await record();
  /* Numbers took a reading a day for five days and none for the four since. */
  for (const d of [8, 7, 6, 5, 4]) reading(d);
  const [tile] = quietOf({ ...ALL, quiet: true });
  const read = k.block(tile as never);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.matched, 1);
  assert.deepEqual(
    ['subject', 'since', 'was'].map((f) => read.rows![0]!.fields[f]),
    ['Numbers', ago(4).slice(0, 10), 'Written to on 5 of 14 days'],
  );
  /* AND ON TODAY AS A PAGE: installed with no rule refusing it, and the tile drawn. */
  const installed = (await k.install([asPage] as never)) as { ok: boolean; refusal?: { fix: string } };
  assert.ok(installed.ok, installed.refusal?.fix);
  const page = k.page('today-quiet');
  assert.ok(page.ok, JSON.stringify(page));
  const drawn = page.value.blocks.find((b) => b.source === 'exceptions') as { drawn?: boolean; rows?: unknown[]; refusals: unknown[] };
  assert.deepEqual(drawn.refusals, []);
  assert.notEqual(drawn.drawn, false);
  assert.equal(drawn.rows!.length, 1);
  db.close();
});

test('NOTHING QUIET IS NO TILE: the record leaves the block out, refuses nothing and says no empty line', async () => {
  const { k, db, reading } = await record();
  /* Written to today: Numbers is arriving as it was. */
  for (const d of [4, 3, 2, 1, 0]) reading(d);
  const installed = (await k.install([asPage] as never)) as { ok: boolean; refusal?: { fix: string } };
  assert.ok(installed.ok, installed.refusal?.fix);
  const page = k.page('today-quiet');
  assert.ok(page.ok, JSON.stringify(page));
  const left = page.value.blocks.find((b) => b.source === 'exceptions') as { drawn?: boolean; why?: string; rows?: unknown[]; refusals: unknown[] };
  assert.deepEqual(left.refusals, []);
  assert.deepEqual(left.rows, []);
  assert.equal(left.drawn, false);
  assert.equal(left.why, 'empty');
  db.close();
});

test('A HOST BUILT BEFORE THE SOURCE ANSWERS THE TILE AS A REFUSAL, AND IT IS NOT DRAWN: left at its place, and nothing else touched', () => {
  const said = 'exceptions is not a source this record reads.';
  const late = { source: 'deadlines', refusals: ['Late is not read here.'], drawn: true };
  const tile = { source: 'exceptions', refusals: [said], drawn: true };
  const fine = { source: 'exceptions', refusals: [] as string[], drawn: true };
  const out = quietHeld([late, tile, fine]);
  assert.deepEqual(out, [late, { ...tile, drawn: false }, fine]);
  /* ANOTHER BLOCK'S REFUSAL IS STILL SAID, and a tile the record drew is the very block it sent. */
  assert.equal(out[0], late);
  assert.equal(out[2], fine);
});
