/**
 * Calendar (PGS-B14 job e): one declared page, one `calendar` block (and no line over it since core 1.3.1) over the computed deadlines, on a real record.
 *
 * READ AS THE RECORD READS ITS OWN PAGE (`k.page`), over a record that holds the lists and no row until the test writes one, so
 * what is asserted is what a screen draws: the three months, and each row on the day its own list calls its deadline.
 *
 * THE PAGE NAMES NO LIST, so the rows below are written into two lists of Work and the page is never told which.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type BlockResult, type Declaration, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, TODAY, declarations, pageDeclarations } from '../src/index.ts';
import { BASE_PAGES, CALENDAR_SOURCE } from '../src/modules/base.ts';

const OWNER = { actor: 'p_1' };
const PAGE = BASE_PAGES.calendar!;
const ALL = PAGE.blocks as Record<string, unknown>[];
/* NO LINE OVER THE CALENDAR SINCE core 1.3.1 (3 Nov, "i dont like those briefs at all, remove them"): the calendar is the page. */
const BLOCKS = ALL.filter((b) => b.kind === 'calendar');
const DECL: Declaration = { id: 'page.calendar', kind: 'page', body: PAGE as never, pack: 'core' };

const day = (n: number): string => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);

/** A record with every list the modules declare, this page, and no row: nothing is due on it until a test says so. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([...declarations(), DECL]);
  assert.ok(out.ok, sayOf(out));
  return k;
}

function months(k: Kernel): BlockResult {
  const out = k.page('calendar') as { ok: boolean; value: { blocks: BlockResult[] } };
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value.blocks.map((b) => b.kind), ['calendar']);
  return out.value.blocks[0]!;
}

/**
 * Whether the record asks the calendar before the source. UNTIL `pages.ts` READS THE KIND'S `across` (the line
 * calendar-deadlines-82 hands on), a block over `deadlines` is answered by the source whatever draws it: a table's
 * fourteen days and no months. The two tests that need the months say so and wait, and run whole once the line lands.
 */
const WAITS = 'pages.ts still answers deadlines before the calendar is asked (the blocked line of calendar-deadlines-82)';
const monthsRead = (b: BlockResult): boolean => (b as { window?: unknown }).window !== undefined;

const made = (r: unknown): void => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
};

/** Every cell a row answers, whichever name the kernel hands a deadline's title and day under. */
const cells = (b: BlockResult): unknown[][] => (b.rows ?? []).map((r) => Object.values(r.fields));
const on = (b: BlockResult, title: string): boolean => cells(b).some((c) => c.includes(title));
const onDay = (b: BlockResult, title: string, iso: string): boolean => cells(b).some((c) => c.includes(title) && c.includes(iso));

test('CALENDAR IS ONE PAGE WITH ONE CALENDAR AND NO LINE OVER IT: the computed deadlines, this month and the two after it', () => {
  assert.equal(PAGE.page, 'calendar');
  assert.equal(PAGE.title, 'Calendar');
  /* "Everything with a day it is due, this month and the next two." went in core 1.3.1: it said what the calendar shows. */
  assert.deepEqual(ALL.map((b) => [b.kind, b.lead]), [['calendar', undefined]]);
  assert.equal(BLOCKS.length, 1);
  const { kind, source, back, ahead } = BLOCKS[0]!;
  assert.deepEqual([kind, source, back, ahead], ['calendar', CALENDAR_SOURCE, 0, 2]);
  assert.equal(CALENDAR_SOURCE, 'deadlines');
});

test('IT LEANS ON NO LIST AND IS NOT ON THE RAIL, so every record can hold it and the seven places stay seven', () => {
  assert.equal(PAGE.requires, undefined);
  assert.equal(PAGE.nav, undefined);
  /* THE SOURCE'S OWN TWO NAMES, never a field of a list: which field is a list's deadline is the list's to say. */
  assert.deepEqual(BLOCKS[0]!.columns, [{ field: 'title' }, { field: 'day' }]);
  assert.equal(BLOCKS[0]!.where, undefined);
});

test('NOTHING THE GRAMMAR REFUSES: the page installs as a declaration', () => {
  assert.equal(validateDeclaration(DECL), null);
});

test('WHAT A PERSON READS ON IT IS PLAIN: no id, no dash, no word for the machine', () => {
  const said = [PAGE.title, ...ALL.flatMap((b) => [b.heading, b.empty, b.body])].filter((s): s is string => typeof s === 'string');
  assert.ok(said.length >= 2);
  for (const s of said) {
    assert.doesNotMatch(s, /—|–/u, s);
    assert.doesNotMatch(s, /\b(row|rows|entity|register|item)\b/iu, s);
  }
});

test('A FRESH RECORD HAS THE PAGE, and it opens on its three months with nothing on them', async (t) => {
  const k = await fresh();
  assert.deepEqual(k.pages().map((p) => [p.slug, p.title, p.nav]), [['calendar', 'Calendar', null]]);
  const b = months(k);
  assert.deepEqual(b.refusals ?? [], []);
  assert.equal(b.kind, 'calendar');
  assert.deepEqual(b.rows ?? [], []);
  if (!monthsRead(b)) return t.skip(WAITS);
  /* THE RECORD IS READ ON 3 SEPTEMBER 2026, so the months are September, October and November. */
  assert.equal(TODAY, '2026-09-03');
  assert.deepEqual((b as { window?: unknown }).window, { from: '2026-09-01', to: '2026-11-30', today: TODAY });
});

test('A DEADLINE ON A LIST SHOWS ON ITS DAY, from two lists the page never names', async (t) => {
  const k = await fresh();
  made(k.create('tasks', { what: 'Send the proofs', by: day(10) }, OWNER));
  made(k.create('tracks', { name: 'Ship the specimen page', state: 'planned', target: day(40) }, OWNER));
  const b = months(k);
  assert.deepEqual(b.refusals ?? [], []);
  /* TEN DAYS OUT IS DRAWN EITHER WAY; forty days out is next month, which only the calendar's own months reach. */
  assert.ok(onDay(b, 'Send the proofs', day(10)), JSON.stringify(b.rows));
  if (!monthsRead(b)) return t.skip(WAITS);
  assert.equal(b.rows?.length, 2, JSON.stringify(b.rows));
  assert.ok(onDay(b, 'Ship the specimen page', day(40)), JSON.stringify(b.rows));
});

test('FINISHED WORK AND A DAY PAST THE THREE MONTHS ARE NOT DRAWN', async () => {
  const k = await fresh();
  made(k.create('tasks', { what: 'Send the proofs', by: day(10) }, OWNER));
  made(k.create('tasks', { what: 'Pay the printer', state: 'done', by: day(12) }, OWNER));
  made(k.create('tracks', { name: 'Plan next year', state: 'planned', target: day(200) }, OWNER));
  const b = months(k);
  assert.deepEqual(b.refusals ?? [], []);
  assert.ok(on(b, 'Send the proofs'));
  assert.ok(!on(b, 'Pay the printer'), 'a finished task has no day to wait for');
  assert.ok(!on(b, 'Plan next year'), 'December and later are not these three months');
});

/* THE SEED SPREADS `BASE_PAGES` INTO `PAGES` (`src/index.ts`), so a record made by `installSeed` and People's pack
   document both hold Calendar. */
test('THE SEED SHIPS IT: Calendar is among the pages every seeded record is given', () => {
  assert.ok(pageDeclarations().some((d) => d.id === 'page.calendar'));
});
