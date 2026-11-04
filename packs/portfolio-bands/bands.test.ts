/**
 * The Products bands as a pack.
 *
 * THE RULE. One bar in three bands. `now` is what every project
 * takes today, retired ones that still pay included. `next` is the headroom `max(0, base - now)` on projects being
 * earned from or shipped, and `later` is the same headroom on projects being explored. A retired project adds no
 * headroom. The four fixture projects below are invented and built to land on $11,000 / $6,250 / $8,000 a month, one
 * project per kind of band, so a wrong band is a wrong number and not a wrong shape.
 *
 * WHY A SCRIPT AND NOT A FIGURE. A declared figure is one aggregation over one field (`AGGREGATIONS` in
 * `packages/kernel/src/metrics.ts`: sum, count, avg, min, max, distinct), so a `sum` over `revenue` says `now` and
 * nothing declared says `max(0, base - now)` row by row. The rows are also in the wrong place for a figure: `now` and
 * `base` are readings in `datapoints`, one row each, joined to a project by `thing`. A script lists both and does the
 * subtraction, which is the shell's own answer to a sum nobody can declare.
 *
 * RED FIRST, MEASURED. With no `bands.js` the file failed at its first read,
 * ENOENT. Then with a `bands.js` that did only what a declared figure can, a sum of every project's monthly revenue,
 * four of five failed, and the whole path said exactly why: the pack installed, the run was `ok`, and the record held
 * `now` and no `next` and no `later`, because nothing summed over one field can say them.
 *
 * AND RED AGAIN, when the pack compiled in
 * the two labels one importer writes and required that importer's use case. Three probes were run against the file
 * as it stood, and all three failed: its text held the import's label for the base case; on a record holding Portfolio and a
 * `datapoints` list from a pack of somebody else's, it was refused `OUT_OF_BOUNDS`, "portfolio-bands needs
 * usecase-founder ^1.0.0, and this BrainDog has none"; and there was no way to give it other names. The tests under
 * "The settings" and "What it leans on" are those probes, grown.
 *
 * 2.0.0 TAKES THE NAMES AS SETTINGS. 1.0.0 shipped a `fill` and a `fill.ts` that
 * rewrote one line of the script before install, so a person needed TypeScript in the app to set the pack up. The two
 * sides are `list` settings now, the script reads them from `ctx.config`, and the checks `fill.ts` made run in the
 * script, where a setting a person changes later is checked as well.
 *
 * THE LAST TEST IS THE WHOLE PATH on a self-host: the pack planned and installed as the owner would install it, its
 * names set, beside Portfolio and the founder's lists, then due, leased, run in QuickJS, and its writes applied by the record.
 * The fixture tests before it hand the script a double, which is enough for the arithmetic and says nothing about
 * whether the predicate trees it sends are ones the record accepts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { blockKeyOf } from '../../packages/kernel/src/block-keys.ts';
import { additionsOf, withAdds } from '../../packages/kernel/src/page-adds.ts';
import type { PageBlock } from '../../packages/kernel/src/pages.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('bands.js', HERE), 'utf8');
const PACK_FILE = new URL('portfolio-bands.pack.json', HERE);

type ScriptBody = { script: string; reads: string[]; writes: string[]; egress: string[]; keys: string[]; source: string };
type PackDoc = { pack: string; requires: { packs: Record<string, string> }; declarations: Record<string, unknown>[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const template = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;
const scriptOf = (doc: Record<string, unknown>): ScriptBody => (doc as PackDoc).declarations.find((d) => typeof d.script === 'string') as ScriptBody;
const SCRIPT = scriptOf(template());

/**
 * WHETHER THE RECORD READS A COLUMN ADDITION YET. 2.2.0 adds a column into Portfolio's In play cards, and until
 * `readAdds` in `packages/declare/src/index.ts` takes `into` and `column` (its ADDITION_KEYS, and the call to
 * `readAddColumn`), it refuses the file at that entry's `into`. Asked of the file as it ships, so the day that line lands
 * every install below takes the whole file and the test marked `todo` runs.
 */
const SHIPPED = await readPackFile(readFileSync(PACK_FILE, 'utf8'));
const COLUMNS_READ = SHIPPED.ok || !/^adds\.\d+\.(into|column)$/.test((SHIPPED as { refusal?: { at?: string } }).refusal?.at ?? '');
const WAITING = 'until readAdds takes into and column (packages/declare/src/index.ts, ADDITION_KEYS and readAddColumn)';

/** The file as it installs today: as it ships, or with its column additions taken off while the record cannot read one. */
const installable = (): Record<string, unknown> => {
  const doc = template();
  if (COLUMNS_READ) return doc;
  return { ...doc, adds: (doc.adds as Record<string, unknown>[]).filter((a) => a.into === undefined) };
};

/** The two settings as `ctx.config` holds them. */
type Names = { now: Json; base: Json };

/** What the file itself says, as its settings' defaults: one name a side, neither of them anybody's import. */
const EXAMPLE: Names = { now: ['Monthly recurring revenue'], base: ['Monthly recurring revenue in a year'] };

/**
 * THE MEASURES THE FIXTURES ARE NAMED BY, and a second name for the forecast, because a record that has been fed for a
 * while holds one number under an old name and a new one, and the bands must take either.
 */
const SPEC: Names = { now: ['Takings a month'], base: ['Takings a month in a year', 'Forecast takings'] };

/** The line of the script that reads the settings through their checks, which one test takes the checks off. */
const CHECKED = 'const measures = measuresOf(ctx.config);';

const NOW = '2026-09-24T06:00:00.000Z';

/* ── The fixture ───────────────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

let minted = 0;
const row = (register: string, fields: Record<string, Json>, version = 1): Row => {
  minted += 1;
  return { id: `01K5FIXTURE${String(minted).padStart(15, '0')}`, register, seq: minted, fields, version, updated_at: NOW };
};

/** A project and its readings, each named the measure, a comma, the project. `baseSaid` is the forecast's other name. */
type Project = { name: string; lane: string; monthly?: [number, string]; base?: [number, string]; baseSaid?: string };

/**
 * FOUR PROJECTS, ONE PER KIND OF BAND. Earning with headroom (Ledger), shipping (Kiln), exploring (Tessel) and retired
 * (Halden). Halden still pays, so it is in `now`, and its base is well above what it takes, so a retired project that
 * leaked headroom into `next` would show as $4,300 too much there.
 */
const STUDIO: Project[] = [
  { name: 'Ledger', lane: 'earning', monthly: [9_000, 'USD'], base: [12_500, 'USD'] },
  { name: 'Kiln', lane: 'building', monthly: [1_250, 'USD'], base: [4_000, 'USD'], baseSaid: 'Forecast takings' },
  { name: 'Tessel', lane: 'parked', monthly: [50, 'USD'], base: [8_050, 'USD'] },
  { name: 'Halden', lane: 'retired', monthly: [700, 'USD'], base: [5_000, 'USD'] },
];

/**
 * The rows a record holding `projects` would hand the script. Two readings the script must NOT take ride along: an
 * older monthly figure for the first project, dated a month back and written last so it is not first by accident, and
 * an example row the seed wrote, which every dashboard in the record already leaves out.
 */
function recordOf(projects: Project[], now = 'Takings a month', base = 'Takings a month in a year'): { things: Row[]; datapoints: Row[] } {
  const things: Row[] = [];
  const datapoints: Row[] = [];
  const reading = (measure: string, thing: Row, [value, unit]: [number, string], at = '2026-09-20T10:00:00.000Z', source = 'typed') =>
    datapoints.push(row('datapoints', { name: `${measure}, ${thing.fields.name as string}`, value, unit, thing: thing.id, at, source }));
  for (const p of projects) {
    const thing = row('things', { name: p.name, lane: p.lane });
    things.push(thing);
    if (p.monthly) reading(now, thing, p.monthly);
    if (p.base) reading(p.baseSaid ?? base, thing, p.base);
  }
  const first = things[0];
  if (first) {
    reading(now, first, [7_000, 'USD'], '2026-08-20T10:00:00.000Z');
    reading(now, first, [999_999, 'USD'], '2026-09-23T10:00:00.000Z', 'example');
  }
  return { things, datapoints };
}

/**
 * THE SANDBOX'S CLOCK, STANDING STILL (`CtxHost.clock`). None of these tests is about a script's limits, and on a loaded
 * machine three of them once failed at ten times their usual duration, refused for time the machine spent and the
 * script did not. The limits are tested in `packages/script/test`, on the machine's clock and on a held one.
 */
const STEADY = (): number => 0;

/**
 * A host double holding the pack's settings as `config`. `where` is ignored, so the script's own filtering is what is
 * under test; the last test sends it.
 */
const hostOf = (rows: Record<string, Row[]>, config: Names | Record<string, Json> = SPEC): CtxHost => ({
  fetch: async () => {
    throw new Error('the bands fetch nothing');
  },
  list: async (register) => (rows[register] ?? []) as unknown as Json[],
  now: () => NOW,
  clock: STEADY,
  tz: 'UTC',
  input: null,
  config: config as Json,
});

const declOf = (source = SOURCE): ScriptDecl => ({
  id: SCRIPT.script,
  version: 1,
  egress: SCRIPT.egress,
  keys: SCRIPT.keys,
  reads: SCRIPT.reads,
  writes: SCRIPT.writes,
  source,
});

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

const created = (band: string, amount: number, currency: string): ScriptWrite => ({
  op: 'create',
  register: 'revenue_bands',
  fields: { band, amount: { amount, currency }, at: NOW },
});

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES bands.js AS ITS SOURCE, byte for byte, so the file a person reads is the code that runs', () => {
  assert.equal(SCRIPT.source, SOURCE, 'portfolio-bands.pack.json and bands.js disagree; copy bands.js into the source');
  assert.deepEqual(SCRIPT.egress, [], 'the bands fetch nothing and must not be able to');
  assert.deepEqual(SCRIPT.keys, []);
  assert.deepEqual([...SCRIPT.reads].sort(), ['datapoints', 'revenue_bands', 'things']);
  assert.deepEqual(SCRIPT.writes, ['revenue_bands']);
});

/* ── The settings ──────────────────────────────────────────────────────────────────────────────── */

test('the file reads clean as an add-on somebody opens from disk, takes its two names as settings, and names nobody’s import', async () => {
  const file = await readPackFile(JSON.stringify(installable()));
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'portfolio-bands');
  /* NO `fill` LEFT, so nothing in the app has to rewrite the file before it is installed. */
  assert.equal('fill' in file.value.doc, false, 'the file still carries fill marks');
  const config = (template() as { config: Record<string, { type: string; default: Json }> }).config;
  assert.deepEqual(Object.keys(config), ['now', 'base']);
  assert.deepEqual([config.now!.type, config.base!.type], ['list', 'list']);
  assert.deepEqual({ now: config.now!.default, base: config.base!.default }, EXAMPLE);
  /* THE FIRST CUT COMPILED IN TWO LABELS, one importer's names for the base case, as `git grep` found them then.
     They are not quoted here, so the same grep over `packs/` now answers nothing. The source names no
     measure at all: the example's names are the settings' defaults and nowhere else. */
  for (const name of [...(EXAMPLE.now as string[]), ...(EXAMPLE.base as string[])]) assert.equal(SOURCE.includes(name), false, `bands.js names ${name}`);
  assert.ok(SOURCE.includes(CHECKED), 'bands.js no longer reads its settings through measuresOf');
});

test('WITH NOTHING SET, THE DEFAULTS BAND A RECORD NAMED THE WAY THE FILE SAYS', async () => {
  const { things, datapoints } = recordOf(STUDIO, 'Monthly recurring revenue', 'Monthly recurring revenue in a year');
  /* Kiln's forecast is under a name the defaults do not hold, so it adds no headroom: $6,250 less $2,750. */
  const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: [] }, EXAMPLE));
  assert.deepEqual(writesOf(a), [created('now', 1_100_000, 'USD'), created('next', 350_000, 'USD'), created('later', 800_000, 'USD')]);
});

test('A NAME IS MATCHED AS THE TEXT IT IS, whatever it holds', async () => {
  /* A QUOTE, A BACKSLASH AND A LINE BREAK, the three things that ended a name written into the script by hand. */
  const odd = 'Kiln\'s "take"\\a\nmonth';
  const { things, datapoints } = recordOf([{ name: 'Kiln', lane: 'building', monthly: [10, 'USD'], base: [30, 'USD'] }], odd, 'Forecast');
  const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: [] }, { now: [odd], base: ['Forecast'] }));
  assert.deepEqual(writesOf(a).slice(0, 2), [created('now', 1_000, 'USD'), created('next', 2_000, 'USD')]);
});

test('NAMES THAT WOULD DRAW THE WRONG BAR STOP THE RUN WITH A SENTENCE, and nothing is written', async () => {
  const { things, datapoints } = recordOf(STUDIO);
  const refused = async (config: Record<string, Json>, why: RegExp) => {
    const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: [] }, config));
    assert.ok('refused' in a, `${JSON.stringify(config)} ran: ${JSON.stringify(a)}`);
    assert.match(a.refused.why, why);
  };
  await refused({}, /at least one now name/);
  await refused({ now: [], base: ['Forecast'] }, /at least one now name/);
  await refused({ now: ['Takings'], base: ['   '] }, /at least one base name/);
  await refused({ now: ['Takings', 'Forecast'], base: ['Forecast'] }, /named as both now and base/);
  await refused({ now: ['Takings'], base: ['Takings, forecast'] }, /begins with Takings and a comma/);
  await refused({ now: ['Takings, today'], base: ['Takings'] }, /begins with Takings and a comma/);
  /* AND BOTH TRAPS IN ANOTHER CASE, because the record's `starts` folds case (`fold` in `packages/where/src/index.ts`),
     so a list asked for `takings` answers every reading of `Takings` too. Measured on a record with the checks
     comparing exact text: a forecast typed once under `takings` and fifty daily readings of `Takings` after it, and
     `later` fell from 800,000 to 0 on a run that wrote without a word, the page-of-fifty failure `bands.js` describes,
     reached again through the case of one letter. The same with `TAKINGS, today` and `takings`. */
  await refused({ now: ['Takings'], base: ['takings'] }, /one name to the record/);
  await refused({ now: ['TAKINGS, today'], base: ['takings'] }, /begins with takings and a comma/);

  /* A repeat on one side is one name, not a refusal: it matches the same readings either way. */
  const twice = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: [] }, { now: ['Takings a month', ' Takings a month '], base: SPEC.base }));
  assert.deepEqual(writesOf(twice), [created('now', 1_100_000, 'USD'), created('next', 625_000, 'USD'), created('later', 800_000, 'USD')]);
});

test('WHAT THE NAME CHECKS STOP, run with the checks taken off: the forecast is read as today, and the headroom is gone', async () => {
  /* THE SETTINGS READ AS THEY ARE, as a script without `measuresOf` would read them, over one project that takes
     $1,250 and is forecast at $4,000. The honest split is $1,250 now and $2,750 next. */
  assert.ok(SOURCE.includes(CHECKED));
  const unchecked = declOf(SOURCE.replace(CHECKED, 'const measures = { now: ctx.config.now, base: ctx.config.base };'));
  const kiln = (base: string) => {
    const { things, datapoints } = recordOf([{ name: 'Kiln', lane: 'building', monthly: [1_250, 'USD'] }], 'Takings');
    datapoints.push(row('datapoints', { name: `${base}, Kiln`, value: 4_000, unit: 'USD', thing: things[0]!.id, at: '2026-09-21T10:00:00.000Z', source: 'typed' }));
    return { things, datapoints, revenue_bands: [] };
  };
  /* ONE NAME ON BOTH SIDES: both readings are `now`, the later one (the forecast) wins, and there is no base. */
  const same = await runInQuickJs(unchecked, hostOf(kiln('Takings'), { now: ['Takings'], base: ['Takings'] }));
  assert.deepEqual(writesOf(same), [created('now', 400_000, 'USD'), created('next', 0, 'USD'), created('later', 0, 'USD')]);
  /* A FORECAST NAMED AFTER TODAY AND A COMMA: `Takings, forecast, Kiln` begins `Takings, `, so it is the same. */
  const comma = await runInQuickJs(unchecked, hostOf(kiln('Takings, forecast'), { now: ['Takings'], base: ['Takings, forecast'] }));
  assert.deepEqual(writesOf(comma), [created('now', 400_000, 'USD'), created('next', 0, 'USD'), created('later', 0, 'USD')]);
  /* AND THROUGH THE CHECKS, the same record under two names that cannot be confused splits as it should. */
  const honest = await runInQuickJs(declOf(), hostOf(kiln('Forecast'), { now: ['Takings'], base: ['Forecast'] }));
  assert.deepEqual(writesOf(honest), [created('now', 125_000, 'USD'), created('next', 275_000, 'USD'), created('later', 0, 'USD')]);
});

/* ── The arithmetic, in QuickJS ────────────────────────────────────────────────────────────────── */

test('FOUR PROJECTS GIVE THE SPLIT: $11,000 now, $6,250 next, $8,000 later, with the forecast under either of its names', async () => {
  const { things, datapoints } = recordOf(STUDIO);
  const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: [] }));
  assert.deepEqual(writesOf(a), [created('now', 1_100_000, 'USD'), created('next', 625_000, 'USD'), created('later', 800_000, 'USD')]);
  assert.equal(a.usage.fetches, 0);
});

test('ONE AMOUNT PER CURRENCY, headroom never below zero, and a base in another currency is said rather than subtracted', async () => {
  const { things, datapoints } = recordOf([
    /* Base under what it takes: the project is past its own forecast, which is headroom of nothing, not of minus. */
    { name: 'Souk', lane: 'earning', monthly: [50_000, 'EGP'], base: [40_000, 'EGP'] },
    /* Pounds today and dollars a year out: two currencies are never subtracted, so it adds to `now` and nothing else. */
    { name: 'Atlas', lane: 'building', monthly: [1_000, 'GBP'], base: [3_000, 'USD'] },
    /* No reading today, only a forecast: all of it is headroom. */
    { name: 'Dune', lane: 'parked', base: [250, 'GBP'] },
  ]);
  const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: [] }));
  assert.deepEqual(writesOf(a), [
    created('now', 5_000_000, 'EGP'),
    created('next', 0, 'EGP'),
    created('later', 0, 'EGP'),
    created('now', 100_000, 'GBP'),
    created('next', 0, 'GBP'),
    created('later', 25_000, 'GBP'),
  ]);
  assert.match(a.log, /Atlas takes GBP today and is forecast in USD/);
});

test('A READING THAT IS MONEY IS COUNTED AS IT STANDS, in minor units, beside the older readings that carry a currency as their unit', async () => {
  const oxbow = row('things', { name: 'Oxbow', lane: 'earning' });
  const kiln = row('things', { name: 'Kiln', lane: 'parked' });
  const money = (amount: number, currency: string): Json => ({ amount, currency });
  const datapoints = [
    /* An older decimal reading and a newer money one under one name: the newer is today, with no value at all. */
    row('datapoints', { name: 'Takings a month, Oxbow', value: 40, unit: 'USD', thing: oxbow.id, at: '2026-09-10T10:00:00.000Z', source: 'typed' }),
    row('datapoints', { name: 'Takings a month, Oxbow', amount: money(4_815, 'USD'), thing: oxbow.id, at: '2026-09-20T10:00:00.000Z', source: 'typed' }),
    /* Money wins over a value written beside it, and its currency over the unit. */
    row('datapoints', { name: 'Takings a month in a year, Oxbow', value: 1, unit: 'EUR', amount: money(10_000, 'usd'), thing: oxbow.id, at: '2026-09-20T10:00:00.000Z', source: 'typed' }),
    /* JPY has no decimals: 4,815 yen is 4815 as money and as a decimal alike. */
    row('datapoints', { name: 'Takings a month, Kiln', amount: money(4_815, 'JPY'), thing: kiln.id, at: '2026-09-20T10:00:00.000Z', source: 'typed' }),
    row('datapoints', { name: 'Takings a month in a year, Kiln', value: 10_000, unit: 'JPY', thing: kiln.id, at: '2026-09-20T10:00:00.000Z', source: 'typed' }),
    /* An amount that is not money, and an example row, are not counted. */
    row('datapoints', { name: 'Takings a month, Kiln', amount: 999, thing: kiln.id, at: '2026-09-22T10:00:00.000Z', source: 'typed' }),
    row('datapoints', { name: 'Takings a month, Oxbow', amount: money(999_999, 'USD'), thing: oxbow.id, at: '2026-09-23T10:00:00.000Z', source: 'example' }),
  ];
  const a = await runInQuickJs(declOf(), hostOf({ things: [oxbow, kiln], datapoints, revenue_bands: [] }));
  assert.deepEqual(writesOf(a), [
    created('now', 4_815, 'JPY'),
    created('next', 0, 'JPY'),
    created('later', 5_185, 'JPY'),
    created('now', 4_815, 'USD'),
    created('next', 5_185, 'USD'),
    created('later', 0, 'USD'),
  ]);
  assert.equal(a.log, '');
});

test('A SECOND RUN UPDATES THE BANDS IN PLACE: an unchanged band is left alone, and a currency no project holds goes to zero', async () => {
  const { things, datapoints } = recordOf(STUDIO);
  const bands = [
    row('revenue_bands', { band: 'now', amount: { amount: 1_100_000, currency: 'USD' }, at: '2026-09-23T06:00:00.000Z' }, 3),
    row('revenue_bands', { band: 'next', amount: { amount: 1, currency: 'USD' }, at: '2026-09-23T06:00:00.000Z' }, 4),
    row('revenue_bands', { band: 'now', amount: { amount: 500, currency: 'EUR' }, at: '2026-09-23T06:00:00.000Z' }, 2),
  ];
  const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: bands }));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `revenue_bands#${bands[2]!.seq}`, patch: { amount: { amount: 0, currency: 'EUR' }, at: NOW }, version: 2 },
    { op: 'update', spoken: `revenue_bands#${bands[1]!.seq}`, patch: { amount: { amount: 625_000, currency: 'USD' }, at: NOW }, version: 4 },
    created('later', 800_000, 'USD'),
  ]);
});

/* ── What it leans on ──────────────────────────────────────────────────────────────────────────── */

/**
 * A pack of somebody else's that declares `datapoints`, invented for this file: readings typed in by hand, with no
 * use case, no organisations and no dashboard. It is what "whichever pack declares it" means, measured. SINCE
 * PORTFOLIO 1.19.0 NUMBERS IS PORTFOLIO'S OWN, so this pack installs only beside a Portfolio from before then, and
 * beside today's it is refused, since two packs cannot own one list.
 */
const DIARY = {
  pack: 'numbers-diary',
  version: '1.0.0',
  summary: 'Readings about each project, typed in by hand.',
  author: 'Example',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: { portfolio: '^1.0.0' } },
  declarations: [
    {
      register: 'datapoints',
      name: 'Readings',
      one: 'reading',
      holds: 'one number about one project at one moment',
      title: 'name',
      fields: [
        { id: 'name', label: 'Measure', type: 'text', required: true, index: true, search: true },
        { id: 'value', label: 'Value', type: 'decimal', required: true },
        { id: 'unit', label: 'Unit', type: 'text' },
        { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
        { id: 'at', label: 'When', type: 'instant', index: true },
        { id: 'source', label: 'Source', type: 'text' },
      ],
    },
  ],
};

/**
 * PORTFOLIO FROM BEFORE IT HELD NUMBERS: 1.16.0 as brain.dog last served it (`packages/seed/test/fixtures/released`),
 * without its example rows, the way a record still on that version holds it. The bands require `portfolio ^1.0.0`, so a
 * record on it is one the bands can be offered to, and there the readings come from another pack or from nowhere.
 */
const BEFORE_NUMBERS = {
  ...(JSON.parse(readFileSync(new URL('../../packages/seed/test/fixtures/released/portfolio-1.16.0.json', import.meta.url), 'utf8')) as Record<string, unknown>),
  seeds: [],
};

type Planned = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

type Diff = { planHash: string; approve: string[]; config: { key: string; type: string; value: Json; from: string }[] };

async function recordWith(...docs: unknown[]): Promise<{ plan: (doc: unknown) => Promise<Planned & { value?: { diff: Diff } }>; put: (doc: unknown) => Promise<Planned>; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.parse(NOW)) });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  const plan = async (doc: unknown) => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Planned & { value?: { diff: Diff } };
  const put = async (doc: unknown): Promise<Planned> => {
    const p = await plan(doc);
    if (!p.ok) return p;
    return (await api.installPack({ doc, source: { kind: 'local' }, planHash: p.value!.diff.planHash, approve: p.value!.diff.approve } as never, owner)) as Planned;
  };
  for (const doc of docs) {
    const r = await put(doc);
    assert.ok(r.ok, JSON.stringify(r.refusal));
  }
  return { plan, put, close: () => sql.close() };
}

test('IT REQUIRES PORTFOLIO, AND DATAPOINTS FROM WHICHEVER PACK DECLARES THEM, and names no use case', async () => {
  assert.deepEqual((template() as PackDoc).requires.packs, { portfolio: '^1.0.0' });

  /* PORTFOLIO'S OWN NUMBERS, SINCE 1.19.0: Portfolio alone is a record the bands install on. */
  const own = await recordWith(firstPartyDocument('portfolio', { seeds: [] }));
  const mine = await own.put(installable());
  assert.ok(mine.ok, JSON.stringify(mine.refusal));
  /* AND NOBODY ELSE'S BESIDE IT: two packs cannot own one list. */
  const second = await own.put(DIARY);
  assert.equal(second.ok, false, 'a second pack declared Portfolio\'s Numbers');
  assert.equal(second.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(second.refusal?.at, 'register.datapoints');
  own.close();

  /* ANOTHER PACK'S READINGS, beside a Portfolio from before it held Numbers. */
  const diary = await recordWith(BEFORE_NUMBERS, DIARY);
  const r = await diary.put(installable());
  assert.ok(r.ok, JSON.stringify(r.refusal));
  diary.close();

  /* WITHOUT A DATAPOINTS LIST IT IS REFUSED, NAMING THE LIST. A script's `reads` is not a list the plan checks
     (`pointsAt` in `packages/declare/src/index.ts` reads fields, pages and figures), so the page's `requires` is what
     says it: with `register.datapoints` taken off the page, this install went through on a record that has nowhere
     for a reading to be, and the bands ran every day over nothing. */
  const bare = await recordWith(BEFORE_NUMBERS);
  const refused = await bare.put(installable());
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.match(refused.refusal?.fix ?? '', /points at the datapoints list/);
  bare.close();
});

test('AN UPDATE FROM 1.0.0 NAMES BOTH SETTINGS AS DEFAULT, so the owner sets his own names before he presses update', async () => {
  /* 1.0.0 AS THE CATALOGUE PUBLISHED IT, its measures written into the script by a fill and no settings declared. */
  const was = JSON.parse(readFileSync(new URL('../../apps/web/static/catalogue/packs/portfolio-bands/1.0.0.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const r = await recordWith(firstPartyDocument('portfolio', { seeds: [] }), was);
  const planned = await r.plan(installable());
  assert.ok(planned.ok, JSON.stringify(planned.refusal));
  assert.deepEqual(
    planned.value!.diff.config.map((c) => [c.key, c.type, c.from, c.value]),
    [
      ['now', 'list', 'default', EXAMPLE.now],
      ['base', 'list', 'default', EXAMPLE.base],
    ],
  );
  assert.ok((await r.put(installable())).ok);
  r.close();
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: installed, its names set, due, run, applied, and drawn as one split', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const { FIRST_PARTY } = await import('../../packages/seed/src/index.ts');
  const { useCaseDocument } = await import('../../packages/seed/src/usecases/index.ts');

  const dir = mkdtempSync(join(tmpdir(), 'braindog-bands-'));
  /* THE SELF-HOST'S SANDBOX ON THE SAME STEADY CLOCK, through `scriptClock` on `start`. */
  const running = await start({
    scriptClock: STEADY,
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send: async () => new Response('{}'), resolve: async () => [] },
  });
  try {
    const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    assert.ok(running.directory.provision({ slug: 'studio', email: 'ada@example.test', record: REC }).ok);
    const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };

    type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
    const said = (r: unknown): unknown => {
      const x = r as Out;
      assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
      return x.value;
    };
    const put = async (doc: unknown) => {
      const planned = said(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as { diff: { planHash: string; approve: unknown } };
      return said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    };
    for (const id of FIRST_PARTY) await put(firstPartyDocument(id));
    await put(useCaseDocument('founder', NOW.slice(0, 10)));
    /* THE RECORD DOES NOT ALREADY DO IT: a founder's record holds the readings and nothing that bands them. */
    const before = api.kernel.declarations().map((d) => d.id);
    assert.ok(before.includes('register.datapoints') && before.includes('register.things'));
    assert.equal(before.includes('register.revenue_bands') || before.includes(`script.${SCRIPT.script}`), false, 'the bands are already declared');
    await put(installable());
    /* THE OWNER'S NAMES, SET ON THE PACK'S PAGE AFTER INSTALL. A run reads the settings as they stand when it is leased,
       so nothing is installed again. */
    said(await api.setPackConfig({ id: 'portfolio-bands', values: SPEC }, owner));

    for (const p of STUDIO) {
      const thing = said(await api.create({ register: 'things', fields: { name: p.name, lane: p.lane } }, owner)) as { id: string };
      const reading = async (measure: string, [value, unit]: [number, string]) =>
        said(await api.create({ register: 'datapoints', fields: { name: `${measure}, ${p.name}`, value, unit, thing: thing.id, at: '2026-09-20T10:00:00Z', source: 'typed' } }, owner));
      if (p.monthly) await reading('Takings a month', p.monthly);
      if (p.base) await reading(p.baseSaid ?? 'Takings a month in a year', p.base);
    }

    const due = () => running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), SCRIPT.script);
    const stored = () =>
      running.sql
        .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'revenue_bands' AND deleted_at IS NULL ORDER BY seq")
        .map((r) => JSON.parse(r.fields) as { band: string; amount: { amount: number; currency: string } })
        .map((b) => [b.band, b.amount.amount, b.amount.currency]);

    due();
    await running.poll();

    const [event] = running.sql.all<{ to_v: string | null; note: string }>(
      'SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid',
      `declaration:script.${SCRIPT.script}`,
    );
    const outcome = JSON.parse(event?.to_v ?? '{}') as { outcome?: string; log?: string };
    assert.equal(outcome.outcome, 'ok', `${event?.note ?? 'no run event'} ${outcome.log ?? ''}`);
    assert.deepEqual(stored(), [
      ['now', 1_100_000, 'USD'],
      ['next', 625_000, 'USD'],
      ['later', 800_000, 'USD'],
    ]);

    const page = said(await api.page({ slug: 'bands' }, owner)) as { blocks: { kind: string; rows?: unknown[]; refusals?: unknown[] }[] };
    const split = page.blocks.find((b) => b.kind === 'split');
    assert.ok(split, 'the page draws no split');
    assert.deepEqual(split.refusals ?? [], []);
    assert.equal(split.rows?.length, 3, 'one bar, three bands');

    /* TOMORROW'S RUN, WITH ONE PROJECT GROWN: the band it moved is updated and nothing is added, so the split still
       draws one day's bar rather than two days summed. */
    const ledger = running.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Ledger'");
    said(await api.create({ register: 'datapoints', fields: { name: 'Takings a month, Ledger', value: 10_000, unit: 'USD', thing: ledger!.id, at: '2026-09-23T10:00:00Z', source: 'typed' } }, owner));
    due();
    await running.poll();
    assert.deepEqual(stored(), [
      ['now', 1_200_000, 'USD'],
      ['next', 525_000, 'USD'],
      ['later', 800_000, 'USD'],
    ]);

    /* A MONTH AND A HALF OF DAILY FIGURES ON A FORECAST TYPED ONCE. The record answers fifty rows, most recently
       written first, and the first cut of this script asked for both measures in one list, so fifty readings of today
       written after Tessel's base pushed the base off the page. Measured before the repair: `later` went to 0, the
       run said `ok`, and the log said nothing. */
    const tessel = running.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Tessel'");
    for (let d = 1; d <= 50; d += 1) {
      const at = new Date(Date.parse('2026-09-21T10:00:00Z') + d * 3_600_000).toISOString();
      said(await api.create({ register: 'datapoints', fields: { name: 'Takings a month, Tessel', value: 50, unit: 'USD', thing: tessel!.id, at, source: 'typed' } }, owner));
    }
    due();
    await running.poll();
    assert.deepEqual(stored(), [
      ['now', 1_200_000, 'USD'],
      ['next', 525_000, 'USD'],
      ['later', 800_000, 'USD'],
    ]);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── On Projects (2.2.0) ───────────────────────────────────────────────────────────────────────── */

type Addition = { page: string; into?: string; after?: string; column?: Record<string, string>; block?: Record<string, unknown>; note?: string };
const addsOf = (doc: Record<string, unknown>): Addition[] => doc.adds as Addition[];

/** Portfolio's Projects page as it ships, its own blocks and nothing added. */
const projectsPage = (): PageBlock[] =>
  ((firstPartyDocument('portfolio', { seeds: [] }) as { declarations: { page?: string; blocks?: PageBlock[] }[] }).declarations.find((d) => d.page === 'portfolio')!.blocks ?? []);

/**
 * WHETHER PROJECTS DRAWS THE MONTH ON A CARD YET: the kernel holds a column naming a figure off a card until the card
 * reads that figure in its role (`fits` in `packages/kernel/src/page-adds.ts`), which PGS-C29 job 2 brings. Asked of the
 * kernel as it is, so the day it reads one the tests below hold the column to being drawn.
 */
const MONTH_LAID = withAdds(projectsPage(), additionsOf([{ id: 'portfolio-bands', manifest: readFileSync(PACK_FILE, 'utf8') }], 'page.portfolio')).some(
  (l) => l.block.columns?.some((c) => c.label === 'This month') === true,
);
const NOT_DRAWN = 'until a card reads its figure off a figure (packages/kernel/src/pages.ts, and fits in page-adds.ts)';

test('2.2.0 IS 2.1.0 WITH TWO ADDITIONS TO PROJECTS, and nothing else moved', () => {
  const was = JSON.parse(readFileSync(new URL('../../apps/web/static/catalogue/packs/portfolio-bands/2.1.0.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const now = template();
  /* 2.2.2 SINCE 27 October: the column goes into Projects' board, the key In play answers since Portfolio 1.30.0. 2.2.3
     SINCE 4 November: the bands follow In play, since How they are going, which they followed, left Projects at Portfolio
     1.31.2 (fdc1b185b) and they had fallen to the foot of the page. */
  assert.equal(now.version, '2.2.3');
  assert.equal(was.adds, undefined);
  const { version: _v, changes: _c, adds: _a, icon: _i, ...rest } = now;
  const { version: _w, changes: _d, ...before } = was;
  assert.deepEqual(rest, before);
  assert.ok(String(now.changes).length <= 500);
  assert.deepEqual(addsOf(now).map((a) => [a.page, a.into ?? null, a.after ?? null]), [
    ['page.portfolio', blockKeyOf(projectsPage().find((b) => b.heading === 'In play')), null],
    ['page.portfolio', null, 'In play'],
  ]);
});

test('THE MONTH GOES ON THE IN PLAY CARDS AND THE BANDS UNDER THEM, as Projects is read, and go when the pack goes', () => {
  const own = projectsPage();
  const inPlay = own.findIndex((b) => b.heading === 'In play');
  assert.ok(inPlay >= 0, 'Portfolio no longer draws In play');
  const adds = additionsOf([{ id: 'portfolio-bands', manifest: JSON.stringify(template()) }], 'page.portfolio');
  assert.equal(adds.length, 2);
  const laid = withAdds(own, adds);
  const cards = laid.find((l) => l.block.heading === 'In play')!.block;
  /* HELD OFF THE CARDS WHILE NOTHING READS A CARD'S FIGURE OFF A FIGURE (`fits` in page-adds.ts): a column that drew
     nothing took the place of the newest number a card with a short trend says. PGS-C29 job 2 reads it, and this turns. */
  assert.deepEqual(cards.columns, MONTH_LAID ? [...own[inPlay]!.columns!, { metric: 'revenue-bands-month:{{name}}', label: 'This month', as: 'figure' }] : own[inPlay]!.columns);
  const at = laid.findIndex((l) => l.block.heading === 'In play');
  const split = laid[at + 1]!;
  assert.equal(split.added, 'portfolio-bands');
  assert.deepEqual([split.block.kind, split.block.heading, split.block.source], ['split', 'A month: now, next and later', 'register.revenue_bands']);
  /* NO EMPTY LINE, so a record with no band worked out draws no tile; a band is one row a band and a currency, so the
     split parts the currencies and never adds two. */
  assert.equal(split.block.empty, undefined);
  assert.deepEqual(split.block.columns, [{ field: 'band' }, { field: 'amount' }]);
  /* TAKEN OUT, ITS MANIFEST IS GONE, and the page is Portfolio's own again. */
  assert.deepEqual(withAdds(own, additionsOf([], 'page.portfolio')), own.map((block) => ({ block })));
});

type PageRead = { blocks: { kind: string; heading?: string; added?: string; columns?: { field?: string; metric?: string; label?: string }[] }[] };

/** A record holding Portfolio, whose Numbers the bands read, and the bands as they install today, and its Projects page read. */
async function projectsWithBands(): Promise<{ read: () => Promise<PageRead>; uninstall: () => Promise<void>; close: () => void; portfolioBody: () => string }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.parse(NOW)) });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  for (const doc of [firstPartyDocument('portfolio', { seeds: [] }), installable()]) {
    const planned = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Planned & { value?: { diff: Diff } };
    assert.ok(planned.ok, JSON.stringify(planned.refusal));
    const put = (await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.value!.diff.planHash, approve: planned.value!.diff.approve } as never, owner)) as Planned;
    assert.ok(put.ok, JSON.stringify(put.refusal));
  }
  const read = async (): Promise<PageRead> => {
    const r = (await api.page({ slug: 'portfolio' }, owner)) as { ok: boolean; value?: PageRead };
    assert.ok(r.ok);
    return r.value!;
  };
  const uninstall = async () => assert.ok(((await api.uninstallPack({ id: 'portfolio-bands' } as never, owner)) as Planned).ok);
  const portfolioBody = () => api.kernel.declarations().find((d) => d.id === 'page.portfolio')!.body;
  return { read, uninstall, close: () => sql.close(), portfolioBody };
}

test('INSTALLED BESIDE PORTFOLIO, the bands are drawn after In play, and uninstalled they are gone', async () => {
  const r = await projectsWithBands();
  const before = r.portfolioBody();
  const headings = (await r.read()).blocks.map((b) => [b.heading ?? null, b.added ?? null]);
  const at = headings.findIndex(([h]) => h === 'In play');
  assert.deepEqual(headings[at + 1], ['A month: now, next and later', 'portfolio-bands']);
  assert.equal(r.portfolioBody(), before, 'the bands were written into Portfolio\'s page');
  await r.uninstall();
  assert.ok(!(await r.read()).blocks.some((b) => b.heading === 'A month: now, next and later'));
  r.close();
});

test('INSTALLED BESIDE PORTFOLIO, each card in play says This month, and uninstalled it does not', { todo: !COLUMNS_READ ? WAITING : !MONTH_LAID ? NOT_DRAWN : false }, async () => {
  assert.ok(COLUMNS_READ, `the record refuses the column at install ${WAITING}`);
  assert.ok(MONTH_LAID, `Projects holds the column off its cards ${NOT_DRAWN}`);
  const r = await projectsWithBands();
  const labels = async () => (await r.read()).blocks.find((b) => b.heading === 'In play')?.columns?.map((c) => c.label ?? null) ?? [];
  assert.equal((await labels()).at(-1), 'This month');
  await r.uninstall();
  assert.ok(!(await labels()).includes('This month'));
  r.close();
});
