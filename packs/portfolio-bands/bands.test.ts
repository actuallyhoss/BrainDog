/**
 * The Products bands as a pack (`loop/research-legacy-keeps.md` section 8, K5; `loop/DIRECTION.md` section 24).
 *
 * THE OLD TOOL'S RULE, AS THE SURVEY READ IT (section 3 of the same file). One bar in three bands. `now` is what every
 * project takes today, retired ones that still pay included. `next` is the headroom `max(0, base - now)` on projects
 * being earned from or shipped, and `later` is the same headroom on projects being explored. A retired project adds
 * no headroom. The commit that drew it gave its own figures, $14,818 / $7,252 / $14,150 a month, and the four fixture
 * projects below are built to land on exactly those, so a wrong band is a wrong number and not a wrong shape.
 *
 * WHY A SCRIPT AND NOT A FIGURE. A declared figure is one aggregation over one field (`AGGREGATIONS` in
 * `packages/kernel/src/metrics.ts`: sum, count, avg, min, max, distinct), so a `sum` over `revenue` says `now` and
 * nothing declared says `max(0, base - now)` row by row. The rows are also in the wrong place for a figure: `now` and
 * `base` are readings in `datapoints`, one row each, joined to a project by `thing`. A script lists both and does the
 * subtraction, which is the shell's own answer (section 22) to a sum nobody can declare.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 24TH AGAINST `bab716a5`. With no `bands.js` the file failed at its first read,
 * ENOENT. Then with a `bands.js` that did only what a declared figure can, a sum of every project's monthly revenue,
 * four of five failed, and the whole path said exactly why: the pack installed, the run was `ok`, and the record held
 * `now` at 1,481,800 cents and no `next` and no `later`, because nothing summed over one field can say them.
 *
 * THE LAST TEST IS THE WHOLE PATH on a self-host: the pack planned and installed as the owner would install it, beside
 * Portfolio and the founder's lists, then due, leased, run in QuickJS, and its writes applied by the record. The fixture
 * tests before it hand the script a double, which is enough for the arithmetic and says nothing about whether the
 * predicate trees it sends are ones the record accepts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('bands.js', HERE), 'utf8');
const PACK = JSON.parse(readFileSync(new URL('portfolio-bands.pack.json', HERE), 'utf8')) as {
  pack: string;
  declarations: Record<string, unknown>[];
};
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as {
  script: string;
  reads: string[];
  writes: string[];
  egress: string[];
  keys: string[];
  source: string;
};

const NOW = '2026-09-24T06:00:00.000Z';

/* ── The fixture ───────────────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

let minted = 0;
const row = (register: string, fields: Record<string, Json>, version = 1): Row => {
  minted += 1;
  return { id: `01K5FIXTURE${String(minted).padStart(15, '0')}`, register, seq: minted, fields, version, updated_at: NOW };
};

/** A project and its readings, named the way the the old tool import names them: the measure, a comma, the project. */
type Project = { name: string; lane: string; monthly?: [number, string]; base?: [number, string]; baseSaid?: string };

/**
 * FOUR PROJECTS, ONE PER KIND OF BAND. Earning with headroom (Ledger), shipping (Kiln), exploring (Tessel) and retired
 * (Halden). Halden still pays, so it is in `now`, and its base is well above what it takes, so a retired project that
 * leaked headroom into `next` would show as $5,000 too much there.
 */
const SAM: Project[] = [
  { name: 'Ledger', lane: 'earning', monthly: [12_000, 'USD'], base: [16_000, 'USD'] },
  { name: 'Kiln', lane: 'building', monthly: [2_318, 'USD'], base: [5_570, 'USD'], baseSaid: 'Revenue, next twelve months' },
  { name: 'Tessel', lane: 'parked', monthly: [100, 'USD'], base: [14_250, 'USD'] },
  { name: 'Halden', lane: 'retired', monthly: [400, 'USD'], base: [5_400, 'USD'] },
];

/**
 * The rows a record holding `projects` would hand the script. Two readings the script must NOT take ride along: an
 * older monthly figure for the first project, dated a month back and written last so it is not first by accident, and
 * an example row the seed wrote, which every dashboard in the record already leaves out.
 */
function recordOf(projects: Project[]): { things: Row[]; datapoints: Row[] } {
  const things: Row[] = [];
  const datapoints: Row[] = [];
  const reading = (measure: string, thing: Row, [value, unit]: [number, string], at = '2026-09-20T10:00:00.000Z', source = 'typed') =>
    datapoints.push(row('datapoints', { name: `${measure}, ${thing.fields.name as string}`, value, unit, thing: thing.id, at, source }));
  for (const p of projects) {
    const thing = row('things', { name: p.name, lane: p.lane });
    things.push(thing);
    if (p.monthly) reading('Monthly revenue', thing, p.monthly);
    if (p.base) reading(p.baseSaid ?? 'Monthly revenue a year out: base', thing, p.base);
  }
  const first = things[0];
  if (first) {
    reading('Monthly revenue', first, [9_000, 'USD'], '2026-08-20T10:00:00.000Z');
    reading('Monthly revenue', first, [999_999, 'USD'], '2026-09-23T10:00:00.000Z', 'example');
  }
  return { things, datapoints };
}

/** A host double. `where` is ignored, so the script's own filtering is what is under test; the last test sends it. */
const hostOf = (rows: Record<string, Row[]>): CtxHost & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    fetch: async () => {
      throw new Error('the bands fetch nothing');
    },
    list: async (register) => {
      asked.push(register);
      return (rows[register] ?? []) as unknown as Json[];
    },
    now: () => NOW,
    tz: 'UTC',
    input: null,
  };
};

const declOf = (source = SCRIPT.source): ScriptDecl => ({
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

/* ── The arithmetic, in QuickJS ────────────────────────────────────────────────────────────────── */

test("FOUR PROJECTS GIVE THE OLD TOOL'S SPLIT: $14,818 now, $7,252 next, $14,150 later", async () => {
  const { things, datapoints } = recordOf(SAM);
  const h = hostOf({ things, datapoints, revenue_bands: [] });
  const a = await runInQuickJs(declOf(), h);
  assert.deepEqual(writesOf(a), [created('now', 1_481_800, 'USD'), created('next', 725_200, 'USD'), created('later', 1_415_000, 'USD')]);
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

test('A SECOND RUN UPDATES THE BANDS IN PLACE: an unchanged band is left alone, and a currency no project holds goes to zero', async () => {
  const { things, datapoints } = recordOf(SAM);
  const bands = [
    row('revenue_bands', { band: 'now', amount: { amount: 1_481_800, currency: 'USD' }, at: '2026-09-23T06:00:00.000Z' }, 3),
    row('revenue_bands', { band: 'next', amount: { amount: 1, currency: 'USD' }, at: '2026-09-23T06:00:00.000Z' }, 4),
    row('revenue_bands', { band: 'now', amount: { amount: 500, currency: 'EUR' }, at: '2026-09-23T06:00:00.000Z' }, 2),
  ];
  const a = await runInQuickJs(declOf(), hostOf({ things, datapoints, revenue_bands: bands }));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `revenue_bands#${bands[2]!.seq}`, patch: { amount: { amount: 0, currency: 'EUR' }, at: NOW }, version: 2 },
    { op: 'update', spoken: `revenue_bands#${bands[1]!.seq}`, patch: { amount: { amount: 725_200, currency: 'USD' }, at: NOW }, version: 4 },
    created('later', 1_415_000, 'USD'),
  ]);
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: installed from the pack file, due, run, applied, and drawn as one split', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const { FIRST_PARTY, firstPartyDocument } = await import('../../packages/seed/src/index.ts');
  const { useCaseDocument } = await import('../../packages/seed/src/usecases/index.ts');

  const dir = mkdtempSync(join(tmpdir(), 'braindog-bands-'));
  const running = await start({
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
    await put(PACK);

    for (const p of SAM) {
      const thing = said(await api.create({ register: 'things', fields: { name: p.name, lane: p.lane } }, owner)) as { id: string };
      const reading = async (measure: string, [value, unit]: [number, string]) =>
        said(await api.create({ register: 'datapoints', fields: { name: `${measure}, ${p.name}`, value, unit, thing: thing.id, at: '2026-09-20T10:00:00Z', source: 'typed' } }, owner));
      if (p.monthly) await reading('Monthly revenue', p.monthly);
      if (p.base) await reading(p.baseSaid ?? 'Monthly revenue a year out: base', p.base);
    }

    running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), SCRIPT.script);
    await running.poll();

    const [event] = running.sql.all<{ to_v: string | null; note: string }>(
      'SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid',
      `declaration:script.${SCRIPT.script}`,
    );
    const outcome = JSON.parse(event?.to_v ?? '{}') as { outcome?: string; log?: string };
    assert.equal(outcome.outcome, 'ok', `${event?.note ?? 'no run event'} ${outcome.log ?? ''}`);

    const stored = running.sql
      .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'revenue_bands' AND deleted_at IS NULL ORDER BY seq")
      .map((r) => JSON.parse(r.fields) as { band: string; amount: { amount: number; currency: string } });
    assert.deepEqual(
      stored.map((b) => [b.band, b.amount.amount, b.amount.currency]),
      [
        ['now', 1_481_800, 'USD'],
        ['next', 725_200, 'USD'],
        ['later', 1_415_000, 'USD'],
      ],
    );

    const page = said(await api.page({ slug: 'bands' }, owner)) as { blocks: { kind: string; rows?: unknown[]; refusals?: unknown[] }[] };
    const split = page.blocks.find((b) => b.kind === 'split');
    assert.ok(split, 'the page draws no split');
    assert.deepEqual(split.refusals ?? [], []);
    assert.equal(split.rows?.length, 3, 'one bar, three bands');

    /* TOMORROW'S RUN, WITH ONE PROJECT GROWN: the band it moved is updated and nothing is added, so the split still
       draws one day's bar rather than two days summed. */
    const ledger = running.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Ledger'");
    said(await api.create({ register: 'datapoints', fields: { name: 'Monthly revenue, Ledger', value: 13_000, unit: 'USD', thing: ledger!.id, at: '2026-09-23T10:00:00Z', source: 'typed' } }, owner));
    running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), SCRIPT.script);
    await running.poll();
    const again = running.sql
      .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'revenue_bands' AND deleted_at IS NULL ORDER BY seq")
      .map((r) => JSON.parse(r.fields) as { band: string; amount: { amount: number } });
    assert.deepEqual(
      again.map((b) => [b.band, b.amount.amount]),
      [
        ['now', 1_581_800],
        ['next', 625_200],
        ['later', 1_415_000],
      ],
    );

    /* A MONTH AND A HALF OF DAILY FIGURES ON A FORECAST TYPED ONCE. The record answers fifty rows, most recently
       written first, and the first cut of this script asked for both measures in one list, so fifty Monthly revenue
       readings written after Tessel's base pushed the base off the page. Measured before the repair: `later` went from
       1,415,000 to 0, the run said `ok`, and the log said nothing. */
    const tessel = running.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Tessel'");
    for (let d = 1; d <= 50; d += 1) {
      const at = new Date(Date.parse('2026-09-21T10:00:00Z') + d * 3_600_000).toISOString();
      said(await api.create({ register: 'datapoints', fields: { name: 'Monthly revenue, Tessel', value: 100, unit: 'USD', thing: tessel!.id, at, source: 'typed' } }, owner));
    }
    running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), SCRIPT.script);
    await running.poll();
    const flooded = running.sql
      .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'revenue_bands' AND deleted_at IS NULL ORDER BY seq")
      .map((r) => JSON.parse(r.fields) as { band: string; amount: { amount: number } });
    assert.deepEqual(
      flooded.map((b) => [b.band, b.amount.amount]),
      [
        ['now', 1_581_800],
        ['next', 625_200],
        ['later', 1_415_000],
      ],
    );
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
