/**
 * A founder's Home says what stopped reporting (ENG-B13 'Seen').
 *
 * GONE QUIET WAS DRAWN ONLY ON THE TODAY THE BROWSER BUILDS (`quietTile` in `apps/web/src/lib/home/default-home.ts`),
 * and a record whose use case declares its own Home never draws that page. So on a founder's record a project whose
 * numbers stopped a fortnight ago was said on no page read in the morning. This file holds the same block on
 * `home-founder`: the heading and the three columns the browser's tile uses, six lines at most, straight after what
 * the money is, and nothing at all on a record where nothing went quiet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const DAY = 86_400_000;
const ago = (days: number): string => new Date(NOW - days * DAY).toISOString();

/** The most blocks one page may declare (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`). */
const CEILING = 24;

type Declared = { kind: string; key?: string; heading?: string; icon?: string; source?: string; where?: string; when?: unknown; lead?: boolean; columns?: { field: string; label?: string }[]; order?: unknown; limit?: number; empty?: string };

/** The blocks `home-founder` declares, in their order. */
const declared = (): Declared[] => {
  const decls = (useCase('founder')!.pack?.declarations ?? []) as { page?: string; blocks?: Declared[] }[];
  const home = decls.find((d) => d.page === 'home-founder');
  assert.ok(home, 'the founder use case declares its own Home');
  return home.blocks ?? [];
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/**
 * A fresh founder record made the way onboarding makes one (`founder-home.test.ts`), with the database it sits on.
 *
 * `examples: false` FOR A RECORD SOMETHING WENT QUIET ON. A list is quiet when nothing at all was written to it for
 * three days, and the examples are written today, so Numbers holding today's example is a list still being written to.
 */
async function founder(examples = true): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples }));
  return { k, sql };
}

let n = 0;
/** One reading on Numbers written `days` ago, as a project's feed would have left it that day. */
function reading(sql: NodeSql, days: number): void {
  const id = `01KQHQT${String(++n).padStart(19, '0')}`;
  const fields = { name: 'Signups', value: 40 + n, unit: 'count', source: 'feed', at: ago(days).slice(0, 10) };
  sql.exec('INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, 'datapoints', 9_000 + n, JSON.stringify(fields), ago(days), ago(days));
}

type Drawn = { kind: string; key?: string; heading?: string; source?: string; drawn?: boolean; why?: string; matched?: number; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string; fix?: string }[] };

const read = (k: Kernel): Drawn[] => value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
const refusedOn = (blocks: Drawn[]): string[] => blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => `${b.heading}: ${b.refusals!.map((r) => r.code).join(', ')}`);

/**
 * THE BROWSER'S TILE, AS DATA. `quietTile` in `apps/web/src/lib/home/default-home.ts` is the block Today draws on a
 * record with no Home of its own, and this is that block written out, so the two say one thing in one set of words. No
 * `where:`, no `order:` (the longest quiet first is the read's own, and it refuses one written over it) and no `empty:`.
 */
const TILE = {
  kind: 'table',
  heading: 'Gone quiet',
  icon: 'history',
  source: 'exceptions',
  columns: [
    { field: 'subject', label: 'What' },
    { field: 'since', label: 'Last seen' },
    { field: 'was', label: 'Before' },
  ],
  limit: 6,
};

test("A FOUNDER'S HOME DECLARES GONE QUIET, the browser's tile word for word, straight after what the money is", () => {
  const blocks = declared();
  const at = blocks.findIndex((b) => b.source === 'exceptions');
  assert.ok(at >= 0, `home-founder reads what went quiet nowhere: ${blocks.map((b) => b.heading ?? b.kind).join(' ; ')}`);
  assert.equal(blocks.filter((b) => b.source === 'exceptions').length, 1, 'said once');
  const { kind, heading, icon, source, columns, limit } = blocks[at]!;
  assert.deepEqual({ kind, heading, icon, source, columns, limit }, TILE);
  for (const left of ['where', 'order', 'empty'] as const) assert.equal(blocks[at]![left], undefined, `${left}: is not written on it`);

  /* STRAIGHT AFTER THE LEAD LINE AND WHAT THE MONEY IS: every block above it is the money there is, a lead line or the
     bar by book, and the block under it is not. */
  const above = blocks.slice(0, at);
  assert.ok(above.length > 0, 'the page still opens on its lead line');
  assert.ok(above.some((b) => b.lead === true), 'a lead line stands above it');
  assert.deepEqual(above.filter((b) => !(b.lead === true || b.source === 'metric.cash-by-book')).map((b) => b.heading ?? b.kind), [], 'only what the money is stands above it');
  assert.equal(blocks[at + 1]?.heading, 'Bring your money in', 'and the ways to start come after it');
});

test('THE PAGE STAYS INSIDE THE BLOCK CEILING, and no block was taken off for the new one', () => {
  const blocks = declared();
  assert.ok(blocks.length <= CEILING, `home-founder declares ${String(blocks.length)} blocks, and a page holds ${String(CEILING)}`);
  /* FAR FROM THE CEILING, so nothing was taken off to make room: every heading the page had is still there. */
  const headings = blocks.map((b) => b.heading);
  for (const h of ['What you have, by book', 'Bring your money in', 'Numbers this week', 'Bring your numbers in', 'Late', 'Due this week', 'Lapsing', 'Working now'])
    assert.ok(headings.includes(h), `${h} is gone from ${headings.join(' ; ')}`);
});

/**
 * SIX TILES BEFORE THE FOLD, AND WORKING NOW IS THE ONE THAT GAVE WAY. The page stood at six as `calm-pages.test.ts`
 * counts them (What you have by book, Numbers this week, Late, Due this week, Lapsing, Working now), so Gone quiet was
 * a seventh. The table of which agents work is folded shut under Agents at work; the line saying how many stays above
 * the fold, and the fold is gone with its table while no agent works.
 */
test('GONE QUIET IS ABOVE THE FOLD AND WORKING NOW GAVE WAY TO IT, folded with no line counting the agents over it', () => {
  const blocks = declared() as (Declared & { fold?: boolean; body?: string })[];
  const fold = blocks.findIndex((b) => b.kind === 'section' && b.fold === true);
  assert.ok(fold >= 0, 'home-founder has no fold');
  assert.equal(blocks.filter((b) => b.kind === 'section').length, 1, 'one fold and no other section');
  assert.equal(blocks[fold]!.heading, 'Agents at work');
  assert.deepEqual(blocks[fold]!.when, { metric: 'runs-working', gt: 0 });
  assert.ok(blocks.findIndex((b) => b.source === 'exceptions') < fold, 'what went quiet is read before anything is opened');
  assert.deepEqual(blocks.slice(fold + 1).map((b) => b.heading), ['Working now'], 'only the table of which agents is under it');
  /* NO COUNT OVER THE FOLD SINCE Founder 3.10.0 (3 Nov, "i dont like those briefs at all, remove them"): "2 agent(s) are
     working now." counted the table of them under it. */
  assert.notEqual(blocks[fold - 1]!.lead, true, 'a line still stands over the fold');
  assert.equal(blocks.some((b) => String(b.body ?? '').includes('{{runs-working}}')), false, 'a line still counts the agents at work');
});

test('NUMBERS CAME EVERY DAY FOR A WEEK AND STOPPED TEN DAYS AGO: Home says so in one table, by name', async () => {
  const { k, sql } = await founder(false);
  [16, 15, 14, 13, 12, 11, 10].forEach((d) => reading(sql, d));
  const blocks = read(k);
  assert.deepEqual(refusedOn(blocks), [], 'home-founder refused a block');
  for (const b of blocks) assert.ok(typeof b.key === 'string' && b.key !== '', `a ${b.kind} block (${b.heading ?? 'no heading'}) has no key`);
  assert.equal(new Set(blocks.map((b) => b.key)).size, blocks.length, 'and no two share one');

  const quiet = blocks.filter((b) => b.source === 'exceptions');
  assert.equal(quiet.length, 1);
  const tile = quiet[0]!;
  assert.equal(tile.kind, 'table');
  assert.equal(tile.heading, 'Gone quiet');
  assert.notEqual(tile.drawn, false, `left out as ${String(tile.why)}`);
  assert.ok(tile.rows!.length >= 1 && tile.rows!.length <= 6, `${String(tile.rows!.length)} lines`);
  const numbers = tile.rows!.find((r) => r.fields.subject === 'Numbers');
  assert.ok(numbers, `Numbers is not among ${tile.rows!.map((r) => String(r.fields.subject)).join(', ')}`);
  assert.equal(numbers.fields.since, ago(10).slice(0, 10), 'the day it was last written to');
  assert.equal(numbers.fields.was, 'Written to on 7 of 14 days');
  sql.close();
});

test('ON A RECORD WHERE NOTHING WENT QUIET THE TILE IS NOT DRAWN: no heading, no empty line', async () => {
  const { k, sql } = await founder();
  const blocks = read(k);
  assert.deepEqual(refusedOn(blocks), [], 'home-founder refused a block');
  const tile = blocks.find((b) => b.source === 'exceptions');
  assert.ok(tile, 'the block keeps its place on the page, as every block a page hides does');
  assert.equal(tile.matched, 0);
  assert.equal(tile.drawn, false, 'a heading over nothing is not drawn');
  assert.equal(tile.why, 'empty');
  /* AND NO AGENT WORKS ON A FRESH RECORD, so the fold over which of them is not drawn either. */
  const fold = blocks.find((b) => b.kind === 'section');
  assert.ok(fold);
  assert.equal(fold.drawn, false, 'a fold over nothing is not drawn');
  sql.close();
});

test('SEVEN THINGS QUIET AT ONCE ARE SIX LINES, and the tile says how many there are', async () => {
  const { k, sql } = await founder(false);
  const lists = ['datapoints', 'accounts', 'obligations', 'services', 'books', 'tasks', 'things'];
  for (const list of lists)
    for (const d of [16, 15, 14, 13, 12, 11, 10]) {
      const id = `01KQHQS${String(++n).padStart(19, '0')}`;
      sql.exec('INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, list, 9_000 + n, '{}', ago(d), ago(d));
    }
  const tile = read(k).find((b) => b.source === 'exceptions')!;
  assert.deepEqual(tile.refusals ?? [], []);
  assert.equal(tile.rows!.length, 6);
  assert.equal(tile.matched, lists.length);
  sql.close();
});
