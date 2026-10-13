/**
 * Worked numbers as a pack: a number worked out from other numbers, every day.
 *
 * THE RULE. A recipe names the measure it writes and how it is worked: `change` is the newest reading less the one
 * `over` before it, times `per`, over the real span between the two; `ratio` is a over b; `share` is a over a and b
 * together; `sum` and `difference` are what they say. One reading is written a recipe a run, with the source `worked`.
 *
 * WHY A SCRIPT. A poll cannot add, subtract, divide or scale, and a declared figure divides or subtracts two sums over
 * one list and cannot read the newest reading of a measure. A script can, and until this one nobody had written one
 * for numbers, so a number that is a week's change of another was typed once and never renewed.
 *
 * FOUR THINGS WRITE NOTHING AND SAY WHY IN THE RUN'S LOG: a measure with no reading, an earlier reading older than
 * twice `over`, a divisor of nought, and two measures in two currencies. Each has its test below, and each asserts on
 * the writes as well as the words, because a recipe that wrote a nought and said why would still draw the nought.
 *
 * RED FIRST, MEASURED. With no `worked.js` the file failed at its first read, ENOENT. The fixture tests hand the
 * script a double that answers the filters the script sends (`matches`), because the script finds the newest reading
 * by asking, and a double that ignored the filter would say nothing about the asking. The last test is the whole path
 * on a self-host, where the record itself answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('worked.js', HERE), 'utf8');
const PACK_FILE = new URL('worked-numbers.pack.json', HERE);

type ScriptBody = { script: string; runs: { every: string }; reads: string[]; writes: string[]; egress: string[]; keys: string[]; source: string };
type Field = { id: string; type: string; required?: boolean; default?: Json; values?: string[]; to?: string };
type PackDoc = { pack: string; version: string; requires: { packs: Record<string, string> }; extends: Record<string, { values?: Record<string, string[]> }>; declarations: Record<string, unknown>[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const template = (): PackDoc => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as PackDoc;
const scriptOf = (doc: PackDoc): ScriptBody => doc.declarations.find((d) => typeof d.script === 'string') as ScriptBody;
const SCRIPT = scriptOf(template());

const NOW = '2026-10-13T06:00:00.000Z';
const HOUR = 3_600;
const DAY = 86_400;
const WEEK = 7 * DAY;

/** The instant `seconds` before the run. */
const ago = (seconds: number): string => new Date(Date.parse(NOW) - seconds * 1_000).toISOString();

/* ── The fixture ───────────────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

let minted = 0;
const row = (register: string, fields: Record<string, Json>): Row => {
  minted += 1;
  return { id: `01K5FIXTURE${String(minted).padStart(15, '0')}`, register, seq: minted, fields, version: 1, updated_at: NOW };
};

/** One project, invented, that every fixture reading is about. */
const KILN = row('things', { name: 'Kiln' });

/** A reading of `measure` on Kiln, `secondsAgo` before the run, named the measure, a comma, the project. */
const reading = (measure: string, value: number, secondsAgo: number, more: Record<string, Json> = {}): Row =>
  row('datapoints', { name: `${measure}, Kiln`, value, unit: '', thing: KILN.id, at: ago(secondsAgo), source: 'reported', ...more });

/** A reading that is money: an amount in minor units and its currency, and no `value`. */
const money = (measure: string, amount: number, currency: string, secondsAgo: number): Row =>
  row('datapoints', { name: `${measure}, Kiln`, amount: { amount, currency }, thing: KILN.id, at: ago(secondsAgo), source: 'polled' });

const recipe = (fields: Record<string, Json>): Row => row('recipes', { thing: KILN.id, over: WEEK, ...fields });

/**
 * THE FILTERS THE SCRIPT SENDS, ANSWERED AS THE RECORD ANSWERS THEM, and any other filter is thrown at, so a filter
 * the script grows is one this double is taught and never one it lets through as "every row".
 */
function matches(where: Json, r: Row): boolean {
  if (where === null) return true;
  const node = where as Record<string, Json>;
  if (Array.isArray(node.all)) return node.all.every((n) => matches(n, r));
  if (Array.isArray(node.any)) return node.any.some((n) => matches(n, r));
  const held = node.field === 'id' ? r.id : r.fields[node.field as string];
  const none = held === undefined || held === null || held === '';
  if ('is' in node) return held === node.is;
  if ('not' in node) return held !== node.not;
  if ('empty' in node) return none === node.empty;
  if ('gt' in node) return !none && String(held) > String(node.gt);
  if ('lte' in node) return !none && String(held) <= String(node.lte);
  throw new Error(`the double has no answer for ${JSON.stringify(where)}`);
}

/**
 * THE SANDBOX'S CLOCK, STANDING STILL (`CtxHost.clock`), as the bands' tests hold it: none of these is about a
 * script's limits, and a loaded machine must not refuse one for time the script did not spend.
 */
const STEADY = (): number => 0;

/** How many rows the record answers at once, most recently written first. */
const PAGE = 50;

/** A host double over `rows`, which counts what it was asked so a test can say how the script went about it. */
function hostOf(rows: Row[]): CtxHost & { asked: { register: string; where: Json }[] } {
  const asked: { register: string; where: Json }[] = [];
  return {
    asked,
    fetch: async () => {
      throw new Error('worked numbers fetch nothing');
    },
    list: async (register, where) => {
      asked.push({ register, where });
      return rows
        .filter((r) => r.register === register && matches(where, r))
        .sort((a, b) => b.seq - a.seq)
        .slice(0, PAGE) as unknown as Json[];
    },
    now: () => NOW,
    clock: STEADY,
    tz: 'UTC',
    input: null,
    config: {},
  };
}

const DECL: ScriptDecl = { id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: SCRIPT.keys, reads: SCRIPT.reads, writes: SCRIPT.writes, source: SOURCE };

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

/** The readings a run wrote into Numbers, each without the two things every one carries: the run's instant and the source. */
function wrote(a: ScriptAnswer): Record<string, Json>[] {
  const out: Record<string, Json>[] = [];
  for (const w of writesOf(a)) {
    if (w.op !== 'create') continue;
    assert.equal(w.register, 'datapoints');
    const { at, source, ...rest } = w.fields as Record<string, Json>;
    assert.equal(at, NOW, 'a worked number is stamped with the run');
    assert.equal(source, 'worked');
    out.push(rest);
  }
  return out;
}

const run = (rows: Row[]): Promise<ScriptAnswer> => runInQuickJs(DECL, hostOf([KILN, ...rows]));

/** A run that must write nothing at all and say `why` in its log. */
async function refuses(rows: Row[], why: RegExp): Promise<void> {
  const a = await run(rows);
  assert.deepEqual(writesOf(a), [], 'a recipe that cannot be worked writes nothing, not a nought');
  assert.match(a.log, why);
}

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES worked.js AS ITS SOURCE, byte for byte, runs every day, and reaches nothing outside the record', () => {
  assert.equal(SCRIPT.source, SOURCE, 'worked-numbers.pack.json and worked.js disagree; copy worked.js into the source');
  assert.deepEqual(SCRIPT.runs, { every: '1d' });
  assert.deepEqual(SCRIPT.egress, [], 'worked numbers fetch nothing and must not be able to');
  assert.deepEqual(SCRIPT.keys, []);
  assert.deepEqual([...SCRIPT.reads].sort(), ['datapoints', 'recipes', 'things']);
  assert.deepEqual([...SCRIPT.writes].sort(), ['datapoints', 'recipes']);
});

test('the file reads clean as an add-on somebody opens from disk: the list of recipes, and one value laid on Numbers', async () => {
  const file = await readPackFile(readFileSync(PACK_FILE, 'utf8'));
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'worked-numbers');
  const doc = template();
  assert.equal(doc.version, '1.0.0');
  /* THE ONE VALUE IT LAYS ON A LIST IT DOES NOT OWN: `worked`, after the Source's own. */
  assert.deepEqual(doc.extends, { 'register.datapoints': { values: { source: ['worked'] } } });
  const list = doc.declarations.find((d) => d.register === 'recipes') as { name: string; fields: Field[] };
  assert.equal(list.name, 'Worked numbers');
  const fields = new Map(list.fields.map((f) => [f.id, f]));
  for (const id of ['name', 'thing', 'how', 'of', 'with', 'over', 'per', 'unit']) assert.ok(fields.has(id), `recipes has no ${id}`);
  assert.equal(fields.get('name')!.required, true);
  assert.deepEqual(fields.get('how')!.values, ['change', 'ratio', 'share', 'sum', 'difference']);
  assert.deepEqual([fields.get('over')!.type, fields.get('over')!.default], ['duration', WEEK]);
  /* `per` HAS NO DEFAULT OF ITS OWN, because its default is whatever `over` is, which the script reads. */
  assert.deepEqual([fields.get('per')!.type, fields.get('per')!.default], ['duration', undefined]);
  const page = doc.declarations.find((d) => typeof d.page === 'string') as { title: string; requires: string[] };
  assert.equal(page.title, 'Worked numbers');
  assert.ok(page.requires.includes('register.datapoints'), 'the page does not ask for the Numbers list');
});

/* ── The five kinds ────────────────────────────────────────────────────────────────────────────── */

/** Coins every hour for eight days, written oldest first as a feed writes them: 192 readings, 5 more each hour. */
const coins = (): Row[] => Array.from({ length: 192 }, (_, i) => reading('Coins', 1_000 + 5 * i, (191 - i) * HOUR, { unit: 'coins' }));

test('CHANGE: a reading every hour for eight days gives the newest less the one seven days before', async () => {
  const mine = recipe({ name: 'Coin net per week, Kiln', how: 'change', of: 'Coins' });
  const a = await run([...coins(), mine]);
  /* THE NEWEST IS 1,955 AND THE ONE 168 HOURS BEFORE IS 1,115. The span is the seven days asked for, so nothing is
     scaled, and the unit is the measure's own because the recipe names none. */
  assert.deepEqual(wrote(a), [{ name: 'Coin net per week, Kiln', value: 840, unit: 'coins', thing: KILN.id }]);
  /* AND THE RECIPE IS TOLD WHAT IT CAME TO, so the page draws each recipe beside its newest value. */
  assert.deepEqual(
    writesOf(a).filter((w) => w.op === 'update'),
    [{ op: 'update', spoken: `recipes#${mine.seq}`, patch: { value: 840, worked_at: NOW }, version: 1 }],
  );
});

test('CHANGE IS SCALED BY THE REAL SPAN: a change over nine days is said for seven, or for a day when `per` says a day', async () => {
  const rows = [
    reading('Signups', 320, 9 * DAY),
    /* SIX DAYS BACK IS NOT SEVEN, so this one is not the earlier reading, and nothing nearer than nine days is. */
    reading('Signups', 440, 6 * DAY),
    reading('Signups', 500, 0),
    recipe({ name: 'Signups a week', how: 'change', of: 'Signups' }),
    recipe({ name: 'Signups a day', how: 'change', of: 'Signups', per: DAY, unit: 'a day' }),
  ];
  /* 500 LESS 320 IS 180 OVER NINE DAYS: 140 a week, 20 a day. */
  assert.deepEqual(wrote(await run(rows)), [
    { name: 'Signups a week', value: 140, thing: KILN.id },
    { name: 'Signups a day', value: 20, unit: 'a day', thing: KILN.id },
  ]);
});

test('THE NEWEST READING IS FOUND WHEN IT WAS NOT THE LAST WRITTEN: sixty older readings sent after it do not hide it', async () => {
  /* THE RECORD ANSWERS FIFTY, MOST RECENTLY WRITTEN FIRST. A feed that catches up sends old readings with their own
     times after newer ones, so the newest reading is off the first page, and so is the one a week before it. */
  const rows = [
    reading('Coins', 100, 7 * DAY),
    reading('Coins', 900, 0),
    ...Array.from({ length: 60 }, (_, i) => reading('Coins', 5, 20 * DAY + i * HOUR)),
    recipe({ name: 'Coins a week', how: 'change', of: 'Coins' }),
  ];
  assert.deepEqual(wrote(await run(rows)), [{ name: 'Coins a week', value: 800, thing: KILN.id }]);
});

test('RATIO: a over b, and money over a count stays money', async () => {
  const rows = [
    reading('Errors', 3, HOUR),
    reading('Requests', 1_200, HOUR),
    money('Revenue', 250_000, 'USD', HOUR),
    reading('Customers', 500, HOUR),
    recipe({ name: 'Error rate', how: 'ratio', of: 'Errors', with: 'Requests' }),
    recipe({ name: 'Revenue a customer', how: 'ratio', of: 'Revenue', with: 'Customers' }),
  ];
  assert.deepEqual(wrote(await run(rows)), [
    { name: 'Error rate', value: 0.0025, thing: KILN.id },
    { name: 'Revenue a customer', amount: { amount: 500, currency: 'USD' }, thing: KILN.id },
  ]);
});

test('SHARE: a over a and b together, which is how churn is said from cancels and subscribers', async () => {
  const rows = [reading('Cancels', 4, HOUR), reading('Subscribers', 96, HOUR), recipe({ name: 'Churn', how: 'share', of: 'Cancels', with: 'Subscribers' })];
  assert.deepEqual(wrote(await run(rows)), [{ name: 'Churn', value: 0.04, thing: KILN.id }]);
});

test('SUM: two measures added, and money that arrived the older way, as a number with a currency for its unit, counts as money', async () => {
  const rows = [
    money('Subscriptions', 120_000, 'USD', HOUR),
    reading('One-off sales', 300, HOUR, { unit: 'USD' }),
    recipe({ name: 'Takings', how: 'sum', of: 'Subscriptions', with: 'One-off sales' }),
  ];
  assert.deepEqual(wrote(await run(rows)), [{ name: 'Takings', amount: { amount: 150_000, currency: 'USD' }, thing: KILN.id }]);
});

test('DIFFERENCE: a less b, each the newest reading of its measure whatever is older', async () => {
  const rows = [
    reading('Income', 100, 3 * DAY),
    reading('Income', 900, HOUR, { unit: 'hours' }),
    reading('Costs', 650.5, 2 * HOUR, { unit: 'hours' }),
    recipe({ name: 'Left over', how: 'difference', of: 'Income', with: 'Costs' }),
  ];
  assert.deepEqual(wrote(await run(rows)), [{ name: 'Left over', value: 249.5, unit: 'hours', thing: KILN.id }]);
});

/* ── The four that write nothing ───────────────────────────────────────────────────────────────── */

test('NO READING: a measure nothing has reported writes nothing and is named, and so is a change with nothing to change from', async () => {
  await refuses(
    [reading('Errors', 3, HOUR), recipe({ name: 'Error rate', how: 'ratio', of: 'Errors', with: 'Requests' })],
    /Error rate was not worked out: Requests has no reading on Kiln\./,
  );
  /* ONE READING IS NOT A CHANGE. The only reading is the newest, and none stands seven days before it. */
  await refuses(
    [reading('Coins', 900, HOUR), recipe({ name: 'Coins a week', how: 'change', of: 'Coins' })],
    /Coins a week was not worked out: Coins has no reading on Kiln from 7 days or more before its newest\./,
  );
  /* THE SEED'S EXAMPLE ROWS ARE NOT READINGS, as every dashboard over Numbers leaves them out. */
  await refuses(
    [reading('Errors', 3, HOUR), reading('Requests', 1_200, HOUR, { source: 'example' }), recipe({ name: 'Error rate', how: 'ratio', of: 'Errors', with: 'Requests' })],
    /Requests has no reading on Kiln\./,
  );
});

test('AN EARLIER READING OLDER THAN TWICE `over` writes nothing: fifteen days is not a week stretched', async () => {
  const rows = (daysBack: number): Row[] => [reading('Coins', 100, daysBack * DAY), reading('Coins', 900, 0), recipe({ name: 'Coins a week', how: 'change', of: 'Coins' })];
  await refuses(rows(15), /Coins a week was not worked out: the reading of Coins before its newest is 15 days older, which is more than twice the 7 days asked for\./);
  /* TWICE IS STILL TAKEN: fourteen days is scaled to seven, and a day more is not. */
  assert.deepEqual(wrote(await run(rows(14))), [{ name: 'Coins a week', value: 400, thing: KILN.id }]);
});

test('A DIVISOR OF NOUGHT writes nothing, for a ratio and for a share', async () => {
  await refuses(
    [reading('Errors', 3, HOUR), reading('Requests', 0, HOUR), recipe({ name: 'Error rate', how: 'ratio', of: 'Errors', with: 'Requests' })],
    /Error rate was not worked out: Requests is nought, and nothing is divided by nought\./,
  );
  await refuses(
    [reading('Cancels', 0, HOUR), reading('Subscribers', 0, HOUR), recipe({ name: 'Churn', how: 'share', of: 'Cancels', with: 'Subscribers' })],
    /Churn was not worked out: Cancels and Subscribers come to nought together, and nothing is divided by nought\./,
  );
});

test('TWO CURRENCIES write nothing, whichever way each arrived, and money is never worked with a plain number as though it were one', async () => {
  await refuses(
    [money('Subscriptions', 120_000, 'USD', HOUR), money('One-off sales', 30_000, 'EUR', HOUR), recipe({ name: 'Takings', how: 'sum', of: 'Subscriptions', with: 'One-off sales' })],
    /Takings was not worked out: Subscriptions is in USD and One-off sales is in EUR, and two currencies are never worked together\./,
  );
  await refuses(
    [money('Subscriptions', 120_000, 'USD', HOUR), reading('One-off sales', 300, HOUR, { unit: 'EUR' }), recipe({ name: 'Share of takings', how: 'share', of: 'Subscriptions', with: 'One-off sales' })],
    /Subscriptions is in USD and One-off sales is in EUR/,
  );
  await refuses(
    [money('Subscriptions', 120_000, 'USD', HOUR), reading('Customers', 500, HOUR), recipe({ name: 'Nonsense', how: 'sum', of: 'Subscriptions', with: 'Customers' })],
    /Nonsense was not worked out: Subscriptions is money and Customers is not, so the two cannot be added\./,
  );
});

/* ── Around them ───────────────────────────────────────────────────────────────────────────────── */

test('ONE RECIPE THAT CANNOT BE WORKED DOES NOT STOP THE NEXT, and a recipe that says too little is told what it lacks', async () => {
  const rows = [
    reading('Income', 900, HOUR),
    reading('Costs', 650, HOUR),
    recipe({ name: 'Error rate', how: 'ratio', of: 'Errors', with: 'Requests' }),
    recipe({ name: 'No way', of: 'Income' }),
    recipe({ name: 'Half said', how: 'sum', of: 'Income' }),
    /* A RECIPE THAT WROTE THE MEASURE IT READS would feed on its own answer from the second day on. */
    recipe({ name: 'Income', how: 'sum', of: 'Income', with: 'Costs' }),
    recipe({ name: 'Left over', how: 'difference', of: 'Income', with: 'Costs' }),
  ];
  const a = await run(rows);
  assert.deepEqual(wrote(a), [{ name: 'Left over', value: 250, thing: KILN.id }]);
  assert.match(a.log, /Error rate was not worked out: Errors has no reading on Kiln\./);
  assert.match(a.log, /No way was not worked out: it does not say how it is worked\./);
  assert.match(a.log, /Half said was not worked out: a sum needs a second measure\./);
  assert.match(a.log, /Income was not worked out: it would write the measure it reads\./);
});

test('NOTHING NEW IS NOT WRITTEN AGAIN: a number is renewed when a reading under it is, so one that stopped moving is seen to have stopped', async () => {
  const rows = [reading('Income', 900, 3 * DAY), reading('Costs', 650, 2 * DAY), recipe({ name: 'Left over', how: 'difference', of: 'Income', with: 'Costs' })];
  /* YESTERDAY'S RUN WROTE IT, after both readings. Written again today it would look renewed, and it was not. */
  const yesterday = row('datapoints', { name: 'Left over', value: 250, thing: KILN.id, at: ago(DAY), source: 'worked' });
  const still = await run([...rows, yesterday]);
  assert.deepEqual(writesOf(still), []);
  assert.match(still.log, /Left over stands as it was: no reading under it is newer than the last time it was worked out\./);
  /* A NEW READING OF EITHER MEASURE RENEWS IT. */
  assert.deepEqual(wrote(await run([...rows, yesterday, reading('Costs', 700, HOUR)])), [{ name: 'Left over', value: 200, thing: KILN.id }]);
});

test('A RECIPE WITH NO PROJECT reads the readings that have none, by the name whole', async () => {
  const bare = (name: string, value: number): Row => row('datapoints', { name, value, at: ago(HOUR), source: 'typed' });
  const rows = [bare('Disk used', 30), bare('Disk size', 120), reading('Disk used', 999, 0), row('recipes', { name: 'Disk full', how: 'ratio', of: 'Disk used', with: 'Disk size', over: WEEK })];
  assert.deepEqual(wrote(await run(rows)), [{ name: 'Disk full', value: 0.25 }]);
});

/* ── What it leans on ──────────────────────────────────────────────────────────────────────────── */

test('IT NEEDS THE NUMBERS LIST, from whichever pack declares it, and is refused by name on a record that has none', async () => {
  const { createRecordApi } = await import('../../packages/record/src/index.ts');
  const { fixedClock, openSqlite } = await import('../../packages/kernel/test/sqlite.ts');
  const { firstPartyDocument } = await import('../../packages/seed/src/index.ts');
  assert.deepEqual(template().requires.packs, { portfolio: '^1.0.0' }, 'it names a use case, and Numbers may come from any pack');

  type Planned = { ok: boolean; value?: { diff: { planHash: string; approve: string[] } }; refusal?: { code: string; fix: string } };
  const sql = openSqlite();
  try {
    const api = await createRecordApi({ sql, clock: fixedClock(Date.parse(NOW)) });
    const owner = { principal: { kind: 'person' as const, id: 'p_1', level: 'owner' as const } };
    const put = async (doc: unknown): Promise<Planned> => {
      const p = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Planned;
      if (!p.ok) return p;
      return (await api.installPack({ doc, source: { kind: 'local' }, planHash: p.value!.diff.planHash, approve: p.value!.diff.approve } as never, owner)) as Planned;
    };
    assert.ok((await put(firstPartyDocument('portfolio', { seeds: [] }))).ok);
    const refused = await put(template());
    assert.equal(refused.ok, false, 'it installed on a record with nowhere for a number to be');
    assert.match(refused.refusal?.fix ?? '', /datapoints/);
  } finally {
    sql.close();
  }
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: installed beside a founder’s lists, a reading an hour for eight days, due, run, applied, and drawn', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const { FIRST_PARTY, firstPartyDocument } = await import('../../packages/seed/src/index.ts');
  const { useCaseDocument } = await import('../../packages/seed/src/usecases/index.ts');

  const dir = mkdtempSync(join(tmpdir(), 'braindog-worked-'));
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
    /* THE RECORD DOES NOT ALREADY DO IT: a founder's record holds the readings, and its Source has no `worked`. */
    const sources = (): string[] => {
      const numbers = api.kernel.declarations().find((d) => d.id === 'register.datapoints');
      return (JSON.parse(numbers!.body) as { fields: Field[] }).fields.find((f) => f.id === 'source')!.values!;
    };
    assert.equal(sources().includes('worked'), false, 'Numbers has the value already');
    await put(template());
    assert.equal(sources().at(-1), 'worked', 'the value was not laid after the Source’s own');

    /* A READING AN HOUR FOR EIGHT DAYS, each with its own time, the last an hour before the run. ON THE MACHINE'S
       CLOCK, because the self-host stamps a run with it, and a change is refused once its earlier reading is more
       than a fortnight back: readings on a fixed day would pass until the day this file was a fortnight old. */
    const END = Math.floor(Date.now() / 1_000) * 1_000 - HOUR * 1_000;
    const kiln = said(await api.create({ register: 'things', fields: { name: 'Kiln', lane: 'building' } }, owner)) as { id: string };
    const report = async (name: string, value: number, at: string) => said(await api.create({ register: 'datapoints', fields: { name, value, unit: 'coins', thing: kiln.id, at, source: 'reported' } }, owner));
    for (let i = 0; i < 192; i += 1) await report('Coins, Kiln', 1_000 + 5 * i, new Date(END - (191 - i) * HOUR * 1_000).toISOString());
    /* THE RECIPE AS A PERSON MAKES IT: `over` is left out and is the list's default, seven days. */
    said(await api.create({ register: 'recipes', fields: { name: 'Coin net per week, Kiln', thing: kiln.id, how: 'change', of: 'Coins' } }, owner));
    said(await api.create({ register: 'recipes', fields: { name: 'Coins a customer', thing: kiln.id, how: 'ratio', of: 'Coins', with: 'Customers' } }, owner));

    const due = () => running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), SCRIPT.script);
    const worked = () =>
      running.sql
        .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'datapoints' AND json_extract(fields, '$.source') = 'worked' AND deleted_at IS NULL ORDER BY seq")
        .map((r) => JSON.parse(r.fields) as { name: string; value: number; unit: string; thing: string })
        .map((n) => [n.name, n.value, n.unit, n.thing]);
    const runs = () =>
      running.sql
        .all<{ to_v: string | null; note: string }>('SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid', `declaration:script.${SCRIPT.script}`)
        .map((e) => ({ note: e.note, ...(JSON.parse(e.to_v ?? '{}') as { outcome?: string; log?: string }) }));

    due();
    await running.poll();
    const first = runs().at(-1);
    assert.equal(first?.outcome, 'ok', `${first?.note ?? 'no run event'} ${first?.log ?? ''}`);
    /* THE NEWEST IS 1,955 AND THE ONE SEVEN DAYS BEFORE IS 1,115. */
    assert.deepEqual(worked(), [['Coin net per week, Kiln', 840, 'coins', kiln.id]]);
    /* AND THE ONE THAT COULD NOT BE WORKED SAID WHY, in the run's own log, and wrote nothing. */
    assert.match(first?.log ?? '', /Coins a customer was not worked out: Customers has no reading on Kiln\./);

    const page = said(await api.page({ slug: 'worked' }, owner)) as { blocks: { kind: string; rows?: { fields: Record<string, unknown> }[]; refusals?: unknown[] }[] };
    const table = page.blocks.find((b) => b.kind === 'table');
    assert.ok(table, 'the page draws no table');
    assert.deepEqual(table.refusals ?? [], []);
    assert.equal(table.rows?.length, 2, 'each recipe is drawn once');
    assert.ok(JSON.stringify(table.rows).includes('840'), 'the recipe is not drawn beside its newest value');

    /* THE NEXT RUN WITH NOTHING NEW WRITES NOTHING, and with one more reading it writes one more point: 2,500 less
       the 1,120 that was newest seven days before it, over a span a moment longer than seven days, so just under 1,380. */
    due();
    await running.poll();
    assert.equal(worked().length, 1);
    assert.match(runs().at(-1)?.log ?? '', /Coin net per week, Kiln stands as it was/);
    await report('Coins, Kiln', 2_500, new Date().toISOString());
    due();
    await running.poll();
    assert.equal(runs().at(-1)?.outcome, 'ok', runs().at(-1)?.log);
    assert.equal(worked().length, 2, `a new reading did not renew the number: ${runs().at(-1)?.log ?? ''}`);
    const renewed = worked()[1]![1] as number;
    assert.ok(renewed > 1_379 && renewed <= 1_380, `${renewed} is not 1,380 scaled back by the moment over`);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
