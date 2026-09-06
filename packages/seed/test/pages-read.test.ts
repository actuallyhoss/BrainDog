/**
 * The record answering its own pages.
 *
 * Until now the pages were documents the record HELD and only the browser could run. This is the
 * record running them: every block of every page the product ships with, over the seeded rows, and
 * what comes back is rows and readings rather than markup — the formatting is a different package
 * and has never heard of money or of projects.
 *
 * The assertion that matters is the last one: nothing on any page refuses for a reason that is not
 * on a named list. A block that quietly draws the whole register looks exactly like a block that
 * filtered, and the thing writing most of these declarations cannot see the screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, slugify, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { refused, sayOf } from '@braindog/ports';

import { LOOKUPS, NOW, PAGES, THINGS, installSeed } from '../src/index.ts';

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

async function seeded(): Promise<{ k: Kernel; sql: Sql & { close(): void } }> {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW }, { lookups: LOOKUPS });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql };
}

const page = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

/* ── the record answers them ─────────────────────────────────────────────── */

test('EVERY PAGE THE RECORD HOLDS IS A PAGE IT CAN OPEN', async () => {
  const { k, sql } = await seeded();
  const listed = k.pages();

  // The declared pages, plus one per project from the template.
  for (const slug of Object.keys(PAGES).filter((s) => !(PAGES[s] as { for?: unknown }).for))
    assert.ok(listed.some((p) => p.slug === slug), `${slug} is not among the pages`);
  assert.ok(listed.length > Object.keys(PAGES).length, 'the template did not expand');

  for (const p of listed) assert.ok(page(k, p.slug).blocks.length > 0, `${p.slug} has no blocks`);
  sql.close();
});

test('A TEMPLATE IS ONE DECLARATION AND ONE PAGE PER ROW, slugged by the row it is about', async () => {
  /* Four projects are four pages over one document rather than four documents with the name typed
     into every predicate, every metric id and every heading. And the slug is the NAME, so `/p/kiln`
     is a URL somebody can type and one that survives the row being renumbered. */
  const { k, sql } = await seeded();
  const slugs = k.pages().map((p) => p.slug);
  /* The template's own predicate decides which rows get a page: `lane is building or earning`, so a
     parked project has none. A template that expanded over every row would be a rail full of things
     nobody is working on. */
  const live = THINGS.filter((t) => t.lane === 'building' || t.lane === 'earning');
  assert.ok(live.length >= 3 && live.length < THINGS.length, 'the seed needs both kinds for this to bite');
  for (const thing of live) assert.ok(slugs.includes(slugify(String(thing.name))), `no page for ${String(thing.name)}`);
  for (const thing of THINGS.filter((t) => !live.includes(t)))
    assert.ok(!slugs.includes(slugify(String(thing.name))), `${String(thing.name)} is parked and has a page`);

  const kiln = page(k, 'kiln');
  assert.match(kiln.title as string, /Kiln/, 'the title still carries its placeholder');
  assert.ok(!JSON.stringify(kiln).includes('{{'), 'a placeholder survived into the page');
  sql.close();
});

test('and a page that does not exist is refused with the ones that do', async () => {
  const { k, sql } = await seeded();
  const out = k.page('atlantis');
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.ok(refused(out));
    assert.equal(out.refusal.code, 'PAGE_UNKNOWN');
    assert.ok((out.refusal.allowed ?? []).includes('money'));
  }
  sql.close();
});

/* ── what a block comes back with ────────────────────────────────────────── */

test('A BLOCK COMES BACK WITH ROWS AND A COUNT OF WHAT MATCHED, which are different numbers', async () => {
  // A block draws the first `limit:` rows and its total is over ALL of them: summing the page
  // instead of the answer is a figure wrong by however many rows did not fit, and it is the same
  // number of pixels either way.
  const { k, sql } = await seeded();
  const money = page(k, 'money');
  const table = money.blocks.find((b) => b.kind === 'table' && b.source === 'register.obligations')!;

  assert.deepEqual(table.refusals, []);
  assert.ok(table.rows.length > 0, 'the block drew nothing');
  assert.ok(table.matched >= table.rows.length, 'more rows were drawn than matched');
  for (const row of table.rows) assert.equal(row.fields.direction, 'owed_to_me');
  sql.close();
});

test('a `stat` block comes back with readings, each in its own currency', async () => {
  const { k, sql } = await seeded();
  const stat = page(k, 'money').blocks.find((b) => b.kind === 'stat')!;
  assert.ok(stat.readings && stat.readings.length >= 3);

  const owed = stat.readings.find((r) => r.metric === 'owed-to-you')!;
  assert.ok(owed.reading, owed.refusal ? `${owed.refusal.code}: ${owed.refusal.fix}` : 'no reading');
  assert.ok((owed.reading.value ?? 0) > 0);
  assert.equal(owed.reading.unit, 'GBP');

  /* `runway` is computed rather than declared, and the block says so on that cell alone — the other
     three still read. A tile that showed an em dash with no reason would be indistinguishable from
     a metric that matched nothing. */
  const runway = stat.readings.find((r) => r.metric === 'runway')!;
  assert.equal(runway.reading, null);
  assert.equal(runway.refusal?.code, 'METRIC_UNKNOWN');
  sql.close();
});

test('and a project page reads its metrics ABOUT THAT PROJECT', async () => {
  const { k, sql } = await seeded();
  const kiln = page(k, 'kiln');
  const marlow = page(k, 'marlow-co');

  const figure = (p: PageResult, id: string): number | null => {
    for (const b of p.blocks)
      for (const r of b.readings ?? []) if (r.metric.startsWith(id)) return r.reading?.value ?? null;
    return null;
  };

  const a = figure(kiln, 'project-owed');
  const b = figure(marlow, 'project-owed');
  assert.ok(a !== null && b !== null, 'a project page has no figure of its own');
  assert.notEqual(a, b, 'two projects read the same number, so the parameter did nothing');
  sql.close();
});

/* ── one block's refusal is one block ────────────────────────────────────── */

test('EVERY BLOCK ON THE MONEY PAGE DRAWS, including the one about the future', async () => {
  const { k, sql } = await seeded();
  const money = page(k, 'money');
  const refused = money.blocks.filter((b) => b.refusals.length > 0);
  assert.deepEqual(refused.map((b) => `${b.heading}: ${b.refusals[0]?.fix}`), []);

  const walk = money.blocks.find((b) => b.source === 'forecast.runway')!;
  assert.ok(walk.walk, 'the cash walk did not run');
  assert.ok(walk.walk.steps.length > 0, 'the walk found no movements');
  assert.equal(walk.walk.currency, 'GBP');
  sql.close();
});

test('ONE BLOCK REFUSING DOES NOT TAKE THE PAGE WITH IT', async () => {
  // A page that fails whole is a page a person cannot use to find out what is wrong with it.
  const { k, sql } = await seeded();
  const broken = k.block({ kind: 'table', source: 'register.obligations', columns: [{ field: 'colour' }] });
  assert.equal(broken.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.deepEqual(broken.rows, []);

  // And the page around a block like that still draws the others.
  const money = page(k, 'money');
  assert.ok(money.blocks.filter((b) => b.rows.length > 0 || (b.readings ?? []).length > 0 || b.walk).length >= 4);
  sql.close();
});

test('NOTHING ON ANY PAGE REFUSES FOR A REASON THAT IS NOT ON THE LIST', async () => {
  /* The list is short and every entry is a thing this build genuinely does not do yet. A tenth code
     appearing here means a page is drawing less than it declares and nobody noticed — which is the
     failure the whole layer keeps running into. */
  const EXPECTED = new Set<string>([]);
  const { k, sql } = await seeded();
  const unexpected: string[] = [];

  for (const p of k.pages())
    for (const block of page(k, p.slug).blocks) {
      for (const r of block.refusals) if (!EXPECTED.has(r.code)) unexpected.push(`${p.slug} · ${block.heading ?? block.kind}: ${r.code} — ${r.fix}`);
      for (const reading of block.readings ?? [])
        if (reading.refusal && reading.refusal.code !== 'METRIC_UNKNOWN')
          unexpected.push(`${p.slug} · ${reading.metric}: ${reading.refusal.code} — ${reading.refusal.fix}`);
    }

  assert.deepEqual(unexpected, []);
  sql.close();
});

test('a block that names a field the register does not declare says so, and draws nothing', async () => {
  const { k, sql } = await seeded();
  const out = k.page('money');
  assert.ok(out.ok);

  // Read one block by hand with a column nobody declared: the refusal names the field and the ones
  // that exist, so whoever wrote it can fix it without opening the schema.
  const block = out.value.blocks.find((b) => b.source === 'register.obligations' && b.columns)!;
  const result = k.block({ ...block, columns: [{ field: 'colour' }] });
  assert.equal(result.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.match(result.refusals[0]?.fix ?? '', /colour/);
  assert.ok((result.refusals[0]?.allowed ?? []).includes('amount'));
  sql.close();
});
