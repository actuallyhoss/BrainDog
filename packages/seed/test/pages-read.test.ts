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

import { NOW, PAGES, REGISTERS, RUNS, THINGS, installSeed } from '../src/index.ts';
import { readCashAhead } from './money-walk-page.ts';

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
  const k = await openRecord(sql, { now: () => NOW });
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
  /* EVERY PROJECT HAS A PAGE, A PARKED ONE TOO, SINCE 24 October (things, not rows): a parked project's row opened its
     fields. The rail is the sidebar's own list now, which keeps the parked apart, so a page each crowds nothing. */
  const parked = THINGS.filter((t) => t.lane !== 'building' && t.lane !== 'earning');
  assert.ok(parked.length > 0, 'the seed needs a parked project for this to bite');
  for (const thing of THINGS) assert.ok(slugs.includes(slugify(String(thing.name))), `no page for ${String(thing.name)}`);

  const kiln = page(k, 'kiln');
  assert.match(kiln.title as string, /Kiln/, 'the title still carries its placeholder');
  /* A BLOCK'S `figures` ARE EACH FIGURE AS THE RECORD DECLARES IT, its hole and all, keyed by its id with no parameter (`figuresOf`, 9e03fe8e7): a host fills `{{it}}` from the id in the cell. What must carry none is what the page reads out. */
  const said = JSON.stringify(kiln, (key, v: unknown) => (key === 'figures' ? undefined : v));
  assert.ok(said.includes('At a glance'), 'the page was read to nothing, so this proves nothing');
  const survivors = new Set(said.match(/\{\{\w*\}\}/g) ?? []);
  assert.deepEqual([...survivors], [], 'a placeholder survived into the page');
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
  /* WHAT MOVED, since money-core 3.0.0 retired the Money page's table of bills: the seed holds more movements than
     the block's `limit:` draws, so the two numbers differ here rather than only in principle. */
  const { k, sql } = await seeded();
  const money = page(k, 'money');
  const table = money.blocks.find((b) => b.kind === 'timeline' && b.source === 'register.transactions');
  assert.ok(table, 'the Money page draws no list of what moved');

  assert.deepEqual(table.refusals, []);
  assert.ok(table.rows.length > 0, 'the block drew nothing');
  assert.ok(table.matched > table.rows.length, `${table.matched} matched and ${table.rows.length} were drawn, so the count is the page`);
  for (const row of table.rows) assert.notEqual(row.fields.state, 'void', 'a voided movement is not one that moved');
  /* AND EACH ROW SAYS WHO CHANGED IT LAST, from its history, when the block asks for the `changed` column. What moved
     does not, so the same block is read by hand with it. */
  const asked = k.block({ ...table, columns: [...(table.columns ?? []), { field: 'changed' }] });
  assert.deepEqual(asked.refusals, []);
  assert.equal(asked.changes?.length, asked.rows.length);
  /* A MOVEMENT IS WRITTEN BY THE SEED AND MAY BE CATEGORISED BY A RULE AFTER, and the last of the two is the one said.
     THE SEED IS THE RECORD'S OWN HAND, A RULE AND NOT YOU (`byOf`), since nobody chose those writes at that moment. */
  assert.ok(
    asked.changes?.every((c) => c !== null && c.by === 'rule' && (c.who === 'p_seed' || c.who.startsWith('rule:'))),
    JSON.stringify(asked.changes?.slice(0, 2)),
  );
  sql.close();
});

test('a `stat` block comes back with readings, each in its own currency', async () => {
  const { k, sql } = await seeded();
  /* MONEY'S HERO, SINCE money-core 3.34.0 took What you have off a book's page (aaf8e24df), so a book leads on Cash ahead and Money on its figure. */
  const stat = page(k, 'money').blocks.find((b) => b.kind === 'stat' && b.lead === true)!;
  assert.ok(stat.readings && stat.readings.length >= 1);

  /* THE MONEY THERE IS, which the page leads with. */
  for (const metric of ['cash-now']) {
    const cell: NonNullable<typeof stat.readings>[number] = stat.readings.find((r) => r.metric.split(':')[0] === metric)!;
    assert.ok(cell?.reading, cell?.refusal ? `${cell.refusal.code}: ${cell.refusal.fix}` : `${metric}: no reading`);
    assert.ok((cell.reading.value ?? 0) > 0, `${metric} read nothing`);
    assert.equal(cell.reading.unit, 'GBP');
  }

  /* THE LINE IS THE FIGURE'S OWN NIGHTS, the sample's since it holds them from the moment it is made (`cashPoints`). */
  const cash = stat.readings.find((r) => r.metric.startsWith('cash-now'))!;
  assert.ok(Array.isArray(cash.trend) && cash.trend.length > 0, 'the sample holds its nights and Cash now draws no line');
  assert.equal(stat.lead, true);
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

test(
  'A PROJECT PAGE’S AGENTS ARE THE RUNS PLACED IN THAT PROJECT, newest seen first',
  async () => {
    const { k, sql } = await seeded();
    const agents = page(k, 'kiln').blocks.find((b) => b.kind === 'cards' && b.source === 'register.session');
    assert.ok(agents, 'the Kiln page has no Agents block over the kernel’s runs');
    assert.deepEqual(agents.refusals, []);
    const kilns = RUNS.filter((r) => r.project === 'things#1')
      .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
      .map((r) => r.doing);
    assert.deepEqual(agents.rows.map((r) => r.fields.doing), kilns);
    sql.close();
  },
);

/* ── one block's refusal is one block ────────────────────────────────────── */

test('EVERY BLOCK ON THE MONEY PAGE DRAWS, including the one about the future', async () => {
  const { k, sql } = await seeded();
  const money = page(k, 'money');
  const refused = money.blocks.filter((b) => b.refusals.length > 0);
  assert.deepEqual(refused.map((b) => `${b.heading}: ${b.refusals[0]?.fix}`), []);

  /* THE FUTURE IS THE HERO'S SINCE money-core 3.29.0: Cash now's cell carries the walk ahead, a balance a day. */
  const cash = money.blocks.find((b) => b.kind === 'stat' && b.lead === true)?.readings?.find((c) => c.metric === 'cash-now');
  assert.ok(cash?.ahead, 'the cash walk did not run');
  assert.ok((cash.trend ?? []).length > 1, 'the walk found no days');
  assert.equal(cash.ahead.currency, 'GBP');
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
  const block = out.value.blocks.find((b) => b.source === 'register.transactions' && b.kind === 'timeline' && b.columns);
  assert.ok(block, 'the Money page draws no table to read by hand');
  const result = k.block({ ...block, columns: [{ field: 'colour' }] });
  assert.equal(result.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.match(result.refusals[0]?.fix ?? '', /colour/);
  assert.ok((result.refusals[0]?.allowed ?? []).includes('amount'));
  sql.close();
});

/* ── the sentence a page prints, fed back to the record ──────────────────── */

test('EVERY FIELD IS REACHABLE BY THE NAME THE SCREEN SHOWS FOR IT', async () => {
  /**
   * A page prints its own `where:` back to the reader using each field's LABEL, so
   * `direction is owed_to_me` appears on screen as `which way is owed to me`. Fed back to the
   * record, that was `FIELD_UNKNOWN: obligations has no field called which`, and seven of the
   * eleven filters the shipped pages print could not be read by the record that printed them. The
   * browser's copy of the grammar accepted labels all along, which is why nobody noticed: a
   * differential pass over this seed is what found the two disagreeing.
   *
   * OVER EVERY LABELLED FIELD OF EVERY REGISTER, rather than over a list of the four sentences that
   * were failing on the day. A list of sentences is a fixture that goes stale the first time
   * somebody renames a field; this asks the property.
   *
   * A REFUSAL ABOUT THE VALUE IS FINE AND IS THE POINT OF THE PROBE. `x` is not a day, an amount or
   * a member of any enum, so most of these refuse: what must never come back is a refusal about the
   * FIELD, because that is the record saying it cannot read a name it puts on a screen.
   */
  const { k, sql } = await seeded();
  const bad: string[] = [];
  for (const [id, decl] of Object.entries(REGISTERS)) {
    for (const f of decl.fields as readonly { id: string; label?: string }[]) {
      if (!f.label) continue;
      const out = k.list({ register: id, where: `${f.label.toLowerCase()} is x`, limit: 1 });
      if (out.ok) continue;
      const said = refused(out) ? out.refusal : null;
      if (said?.code === 'FIELD_UNKNOWN') bad.push(`${id}.${f.id} (${f.label}): ${said.fix}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(REGISTERS).length > 1, 'no register was probed, so this asserts nothing');
  sql.close();
});

test('THE MONEY PAGE READS WHOLE ON A RECORD, and every walk on it starts from Cash now', async () => {
  const { k, sql } = await seeded();
  const money = page(k, 'money');
  for (const block of money.blocks)
    assert.deepEqual(block.refusals, [], `${block.kind} "${block.heading ?? ''}": ${block.refusals.map((r) => r.fix).join(' / ')}`);

  const cash = k.metric(k.metricDecl('cash-now')!);
  assert.ok(cash.ok && cash.value.value !== null);
  /* NO CHART WALKS ON THE HOME SINCE money-core 3.29.0: the hero draws the walk small, today first, from Cash now. */
  assert.deepEqual(money.blocks.filter((b) => b.source === 'forecast.runway').map((b) => b.kind), []);
  const hero = money.blocks.find((b) => b.kind === 'stat' && b.lead === true)?.readings?.find((c) => c.metric === 'cash-now');
  assert.equal(hero?.reading?.value, cash.value.value, 'the hero does not say Cash now');
  assert.ok(hero?.ahead && hero.ahead.low.value <= cash.value.value, 'the walk ahead does not start from Cash now');

  /* A REPEATING ROW IS SPENT EVERY TIME IT COMES ROUND: the rent appears in each month of Cash ahead's walk. */
  const forecast = readCashAhead(k);
  const rent = forecast.walk!.steps.filter((s) => s.label === 'Studio rent');
  assert.ok(rent.length >= 11, `the rent came round ${rent.length} times in a year`);
  assert.equal(forecast.walk!.from, cash.value.value, 'Cash ahead does not start from Cash now');

  /* EVERY OPEN ACCOUNT, THE CARD TOO, SINCE money-core 3.32.0 (`balance-by-account`): the sample's two cash accounts and its card. */
  const accounts = money.blocks.find((b) => b.source === 'metric.balance-by-account')!;
  assert.equal(accounts.readings?.[0]?.reading?.groups?.length, 3);
  sql.close();
});
