/**
 * The backfill that offers each project its key numbers from what Numbers holds (the KPI plan of 21 October, K2-C).
 *
 * `kpiBackfill` IS THE DECISION AND `run` IS THE SCRIPT ROUND IT, both measured against a record shaped like his on 30
 * September: 27 projects, 2,500 and more readings, most of them stopping on 28 September, Kiln's five daily series and
 * its revenue by month, Linework's thirty daily series, one-off revenue on Tally and Aperture, outlooks of
 * 0 / 300 / 3,000 on Lantern and noughts on the Slate projects, and engineering counts on the rest. The names are made up.
 *
 * The script is run as a host's sandbox runs it, its declared `source` imported as a module and handed a `ctx` over a
 * real record that answers one page of fifty in Numbers' own order (the day, newest first), and a `propose` that is the
 * record's own gate. So a script that paged by "numbers below the lowest read" fails here, and so does one that wrote a
 * key number or asked twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan as planOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument } from '../src/index.ts';
import { KPI_LIST } from '../src/modules/portfolio.ts';

type Fields = Record<string, unknown>;
type Row = { id: string; spoken: string; version: number; fields: Fields };
type Ask = { project: string; cause: string; question: string; body_kind: 'rowset'; body: { register: string; rows: Fields[]; why: string } };
type Script = {
  kpiBackfill: (things: Row[], readings: Row[], kpis: Row[]) => Ask[];
  KPI_BACKFILL_SCRIPT: Record<string, unknown>;
};
/* BY A PATH WORKED OUT HERE AND NOT WRITTEN AS A LITERAL, as the money scripts' tests import theirs: a literal import of
   a `.js` with no `.d.ts` does not typecheck under strict. */
const at = new URL('../src/modules/portfolio/kpi-backfill.js', import.meta.url).href;
const { kpiBackfill, KPI_BACKFILL_SCRIPT } = (await import(at)) as Script;

const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

/* ── his record, as the dump of 30 September holds it ───────────────────────────────────────────────────────────── */

const PROJECTS: [string, string][] = [
  ['Kiln', 'earning'], ['Quill', 'parked'], ['Fairway', 'parked'], ['Muse', 'parked'], ['Minnow', 'parked'],
  ['Linework', 'earning'], ['Atoll', 'earning'], ['Coral', 'parked'], ['Inn', 'parked'], ['Kennel', 'building'],
  ['Wright', 'retired'], ['Glider', 'retired'], ['Slateman', 'earning'], ['Gum', 'parked'], ['Slate site', 'earning'],
  ['Blobs', 'retired'], ['Juniper', 'building'], ['Parlour', 'building'], ['Slate', 'earning'], ['Delta', 'parked'],
  ['Lantern', 'building'], ['Old Notebook', 'earning'], ['Tally', 'earning'], ["Drafts", 'retired'], ['Bean Co', 'parked'],
  ['Circle', 'parked'], ['Aperture', 'earning'],
];
const IMPORTED = '2026-09-28T20:48:26.463Z';
const dayBefore = (end: string, back: number) => new Date(Date.parse(`${end}T00:00:00.000Z`) - back * DAY).toISOString();
const monthOf = (i: number) => `${2025 + Math.floor((8 + i) / 12)}-${String(((8 + i) % 12) + 1).padStart(2, '0')}-01T00:00:00.000Z`;

type Reading = { name: string; project: string; value: number; at: string; unit?: string };
function hisReadings(): Reading[] {
  const out: Reading[] = [];
  /* EACH SERIES ITS OWN LINE, so no two read alike and only a true repeat is taken for one. */
  let lines = 0;
  const daily = (project: string, name: string, n: number, end: string, base: number) => {
    const step = 7 + 2 * lines++;
    for (let i = n - 1; i >= 0; i--) out.push({ project, name: `${name}, ${project}`, value: base + ((i * step) % 101), at: dayBefore(end, i) });
  };
  const once = (project: string, name: string, value: number, unit?: string) => out.push({ project, name: `${name}, ${project}`, value, at: IMPORTED, ...(unit ? { unit } : {}) });
  const outlook = (project: string, bear: number, base: number, bull: number) => {
    once(project, 'Monthly revenue a year out: bear', bear, 'USD');
    once(project, 'Monthly revenue a year out: base', base, 'USD');
    once(project, 'Monthly revenue a year out: bull', bull, 'USD');
  };

  /* KILN: five daily series to 28 Sep, revenue and orders by month twice over (one month told apart), one-offs. */
  for (const name of ['Servers', 'Coins in circulation', 'Weekly active players', 'Daily active players']) daily('Kiln', name, 208, '2026-09-28', 700);
  daily('Kiln', 'Monthly active players', 173, '2026-09-28', 4000);
  for (let i = 0; i < 12; i++) {
    const usd = Math.round((15 + i * 330) * 100) / 100;
    out.push({ project: 'Kiln', name: 'Revenue by month, Kiln', value: i === 0 ? 29.7 : usd, at: monthOf(i), unit: 'USD' });
    out.push({ project: 'Kiln', name: 'Revenue, Kiln', value: i === 0 ? 9.9 : usd, at: monthOf(i), unit: 'USD' });
    out.push({ project: 'Kiln', name: 'Orders, Kiln', value: i === 0 ? 1 : 40 * i, at: monthOf(i) });
    out.push({ project: 'Kiln', name: 'Orders by month, Kiln', value: i === 0 ? 5 : 40 * i, at: monthOf(i) });
  }
  for (let i = 7; i < 12; i++) out.push({ project: 'Kiln', name: 'Votes per day, Kiln', value: 30_000 + i * 5000, at: monthOf(i) });
  for (const name of ['Aov', 'Payers', 'Subs', 'Churn30d', 'Dau', 'Mau', 'Coin float', 'New payers30d', 'Renewal fails30d', 'Pending cancels', 'Coin net per week', 'Orders30d', 'Ad spend30d', 'Active7d'])
    once('Kiln', name, 42);
  once('Kiln', 'Monthly revenue', 3925.65, 'USD');
  outlook('Kiln', 3000, 5000, 9000);
  out.push({ project: 'Kiln', name: 'Memory, kiln-box', value: 11, at: IMPORTED, unit: 'GB' });

  /* LINEWORK: thirty-odd daily series to 27 Sep, of 26 to 47 readings each, and its one-offs and engineering. */
  const linework: [string, number][] = [
    ['Players', 47], ['Results claimed', 47], ['Plays by an account', 47], ['Sign-ins', 47], ['Skips', 47], ['Not a word', 47],
    ['Wrong guesses', 47], ['Practice', 47], ['Daily puzzle', 47], ['Sessions played', 47], ['Missed', 47], ['Solved', 47],
    ['Sessions started', 47], ['Drawings reported', 46], ['New players', 46], ['Results shared', 46], ['Accounts that have played', 45],
    ['Channels subscribed', 45], ['DM subscribers', 45], ['Discord servers', 45], ['Archive', 45], ['Results re-opened', 41],
    ['Pages opened', 41], ['Servers getting the daily', 34], ['Personal installs', 34], ['Servers the app cannot post in', 34],
    ['Drawings sent', 26], ['Words offered', 26], ['Practice · homemade', 26],
  ];
  for (const [name, n] of linework) daily('Linework', name, n, '2026-09-27', 200);
  for (const name of ['Win rate', 'Tests', 'Age days', 'Puzzles scheduled', 'Daily players', 'Servers', 'Share rate', 'Authed plays per day', 'Plays per day', 'Accounts', 'Puzzles released'])
    once('Linework', name, 7);
  outlook('Linework', 0, 0, 500);

  /* CLIENT WORK: one month of revenue each, and an outlook that is the same number three times. */
  once('Tally', 'Monthly revenue', 8750, 'USD');
  outlook('Tally', 8750, 8750, 8750);
  once('Aperture', 'Monthly revenue', 2000, 'USD');
  outlook('Aperture', 2000, 2000, 2000);

  /* THE PRODUCTS BEING BUILT: an outlook and engineering counts, and Parlour's two one-offs. */
  outlook('Lantern', 0, 300, 3000);
  once('Parlour', 'Names checked', 380);
  once('Parlour', 'Research agents', 3);
  outlook('Parlour', 0, 600, 5000);
  for (const p of ['Slate', 'Slate site', 'Slateman', 'Old Notebook', 'Kennel', 'Gum']) outlook(p, 0, 0, 0);
  once('Slateman', 'Loc', 18_773);
  for (const name of ['Tests green', 'Uncommitted paths', 'Cosmetics sellable', 'Loc', 'Scopes done']) once('Atoll', name, 12);
  outlook('Atoll', 0, 0, 4000);
  for (const name of ['Surfaces', 'Migrations', 'Decisions', 'Worker loc', 'Ui loc']) once('Old Notebook', name, 99);
  /* A SERVER'S OWN FIGURES, read five times: a % that is no share of anything the project is judged by. */
  for (let i = 0; i < 5; i++) out.push({ project: 'Slate', name: 'CPU, slate-box', value: 20 + i, at: dayBefore('2026-09-28', i), unit: '%' });

  /* PARKED AND RETIRED: plans worked out once, and outlooks that hope. */
  for (let i = 0; i < 40; i++) once('Bean Co', `Stage${i} egp`, 1000 * i);
  outlook('Bean Co', 0, 500, 2000);
  for (let i = 0; i < 30; i++) once('Juniper', `Stage${i} egp`, 1000 * i);
  for (let i = 0; i < 8; i++) once('Delta', `Min capital ${i} egp`, 500 * i);
  for (const name of ['Card frames', 'Rarity tiers', 'Loc', 'Breeds']) once('Kennel', name, 9);
  for (const name of ['Effort days art', 'Effort days money', 'Effort days build']) once('Quill', name, 9);
  once('Juniper', 'Doc lines', 4000);
  outlook('Juniper', 0, 0, 1500);
  for (const p of ['Blobs', 'Glider', 'Wright', 'Delta', 'Circle', 'Minnow', 'Muse', 'Fairway', 'Quill', 'Inn', 'Coral']) outlook(p, 0, 800, 4000);
  return out;
}

/* ── the decision, on plain rows ───────────────────────────────────────────────────────────────────────────────── */

const things: Row[] = PROJECTS.map(([name, lane], i) => ({ id: `e_thing_${i + 1}`, spoken: `things#${i + 1}`, version: 1, fields: { name, lane } }));
const idOf = (name: string) => things.find((t) => t.fields.name === name)!.id;
const readingRows = (list: Reading[]): Row[] =>
  list.map((r, i) => ({
    id: `e_dp_${i + 1}`,
    spoken: `datapoints#${i + 1}`,
    version: 1,
    fields: { name: r.name, value: r.value, thing: idOf(r.project), at: r.at, source: 'typed', ...(r.unit ? { unit: r.unit } : {}) },
  }));
const HIS = hisReadings();
const asks = kpiBackfill(things, readingRows(HIS), []);
const askFor = (project: string) => asks.find((a) => a.project === project);
const named = (project: string, kpi: string) => askFor(project)!.body.rows.find((r) => r.name === kpi);

test('his record is shaped as the dump holds it: 27 projects, 2,500 and more readings, most stopping on 28 September', () => {
  assert.equal(things.length, 27);
  assert.ok(HIS.length >= 2500, `${HIS.length} readings`);
  const lastDays = HIS.map((r) => r.at.slice(0, 10));
  assert.ok(lastDays.filter((d) => d === '2026-09-28').length > lastDays.filter((d) => d > '2026-09-28').length);
  assert.equal(lastDays.some((d) => d > '2026-09-28'), false);
});

test('ONE QUESTION A PROJECT, each a rowset of rows for Key numbers, with its own cause, short enough to ask', () => {
  assert.deepEqual(asks.map((a) => a.project).sort(), ['Aperture', 'Kiln', 'Lantern', 'Linework', 'Parlour', 'Tally']);
  assert.equal(new Set(asks.map((a) => a.cause)).size, asks.length);
  for (const a of asks) {
    assert.equal(a.body_kind, 'rowset');
    assert.equal(a.body.register, 'kpis');
    assert.equal(a.cause, `kpi-backfill:${idOf(a.project)}`);
    assert.ok(a.question.length <= 280 && a.question.length > 0, a.question);
    assert.ok(a.body.rows.length >= 1 && a.body.rows.length <= 6, `${a.project}: ${a.body.rows.length}`);
    assert.equal(a.body.rows.filter((r) => r.headline === true).length, 1, `${a.project} has one headline`);
    assert.deepEqual(a.body.rows.map((r) => r.order), a.body.rows.map((_, i) => i + 1));
    for (const r of a.body.rows) {
      /* EVERY FIELD IS ONE THE LIST DECLARES, AND EVERY ENUM VALUE ONE IT ALLOWS. */
      for (const f of Object.keys(r)) assert.ok((KPI_LIST.fields as readonly string[]).includes(f), `${f} is a field of kpis`);
      assert.ok((KPI_LIST.source as readonly string[]).includes(r.source as string));
      assert.ok((KPI_LIST.kind as readonly string[]).includes(r.kind as string));
      assert.ok((KPI_LIST.good as readonly string[]).includes(r.good as string));
      if (r.every !== undefined) assert.ok((KPI_LIST.every as readonly string[]).includes(r.every as string));
      assert.equal(r.thing, idOf(a.project));
      /* EVERY ROW IS A DRAFT: accepting the question makes the suggestions, and Keep on the project page keeps each. */
      assert.equal(r.draft, true);
    }
  }
});

test('KILN: its money leads, monthly; its daily series follow, daily; repeats, one-offs and server figures are left out', () => {
  const kiln = askFor('Kiln')!;
  const names = kiln.body.rows.map((r) => r.name);
  assert.deepEqual(names, ['Revenue by month', 'Servers', 'Weekly active players', 'Daily active players', 'Monthly active players', 'Orders by month']);
  const revenue = named('Kiln', 'Revenue by month')!;
  assert.deepEqual(
    { headline: revenue.headline, kind: revenue.kind, unit: revenue.unit, every: revenue.every, source: revenue.source, measure: revenue.measure },
    { headline: true, kind: 'flow', unit: 'USD', every: '1m', source: 'numbers', measure: 'Revenue by month' },
  );
  /* THE OUTLOOK'S BASE IS THE TARGET, A YEAR FROM THE DAY IT WAS SAID; bear and bull are no key number. */
  assert.deepEqual([revenue.target_amount, revenue.target_by], [{ amount: 500_000, currency: 'USD' }, '2027-09-28']);
  const dau = named('Kiln', 'Daily active players')!;
  assert.deepEqual([dau.kind, dau.every, dau.unit, dau.headline, dau.target_amount], ['level', '1d', undefined, false, undefined]);
  for (const out of ['Revenue', 'Orders', 'Monthly revenue', 'Aov', 'Churn30d', 'Memory, kiln-box', 'Coins in circulation']) assert.equal(names.includes(out), false, out);
  assert.equal(names.some((n) => /a year out/.test(String(n))), false);
  assert.match(kiln.question, /^Keep 6 key numbers for Kiln\? Revenue by month leads, then Servers, Weekly active players and 3 more\. Revenue by month aims for USD 5,000 by 28 Sep 2027/);
});

test('LINEWORK: six of its thirty daily series, the ones it is judged by, Players leading and Skips and Misses left out', () => {
  const half = askFor('Linework')!;
  const names = half.body.rows.map((r) => r.name);
  assert.deepEqual(names, ['Players', 'Plays by an account', 'Sign-ins', 'Sessions played', 'Sessions started', 'New players']);
  assert.equal(named('Linework', 'Players')!.headline, true);
  assert.equal(half.body.rows.every((r) => r.every === '1d' && r.source === 'numbers'), true);
  assert.deepEqual([named('Linework', 'Sign-ins')!.kind, named('Linework', 'Players')!.kind], ['flow', 'level']);
  /* AN OUTLOOK OF NOUGHT IS NO TARGET. */
  assert.equal(half.body.rows.some((r) => r.target_amount !== undefined || r.target !== undefined), false);
  for (const out of ['Skips', 'Missed', 'Wrong guesses', 'Tests', 'Win rate']) assert.equal(names.includes(out), false, out);
});

test('TALLY AND APERTURE: one month of revenue is their key number, with the outlook as its target', () => {
  for (const [project, amount] of [['Tally', 875_000], ['Aperture', 200_000]] as const) {
    const a = askFor(project)!;
    assert.equal(a.body.rows.length, 1);
    const [row] = a.body.rows;
    assert.deepEqual(
      { name: row!.name, measure: row!.measure, unit: row!.unit, kind: row!.kind, every: row!.every, headline: row!.headline, target_amount: row!.target_amount, target_by: row!.target_by },
      { name: 'Monthly revenue', measure: 'Monthly revenue', unit: 'USD', kind: 'level', every: '1m', headline: true, target_amount: { amount, currency: 'USD' }, target_by: '2027-09-28' },
    );
  }
  assert.equal(askFor('Tally')!.question, 'Keep Monthly revenue as the key number for Tally? Monthly revenue aims for USD 8,750 by 28 Sep 2027, the outlook\'s base.');
});

test('LANTERN: its outlook of 0 / 300 / 3,000 is put to him as the target of a revenue he types, to keep or drop', () => {
  const brain = askFor('Lantern')!;
  assert.deepEqual(brain.body.rows, [
    {
      name: 'Monthly revenue',
      thing: idOf('Lantern'),
      measures: 'Monthly revenue as you type it, a value a month.',
      source: 'typed',
      measure: 'Monthly revenue',
      kind: 'level',
      good: 'up',
      order: 1,
      headline: true,
      draft: true,
      unit: 'USD',
      every: '1m',
      target_amount: { amount: 30_000, currency: 'USD' },
      target_by: '2027-09-28',
    },
  ]);
  assert.equal(brain.question, "Track Monthly revenue for Lantern, aiming for USD 300 by 28 Sep 2027? That is its outlook's base (USD 0 at worst, USD 3,000 at best); say no to drop it.");
  /* PARLOUR'S TWO ONE-OFFS ARE LEFT OUT, AND ITS OUTLOOK IS ITS ONE QUESTION. */
  assert.deepEqual(askFor('Parlour')!.body.rows.map((r) => [r.name, r.target_amount]), [['Monthly revenue', { amount: 60_000, currency: 'USD' }]]);
});

test('NOTHING IS OFFERED where there is only trivia, a nought, or a project parked or finished', () => {
  for (const project of ['Slate', 'Slate site', 'Slateman', 'Atoll', 'Old Notebook', 'Juniper', 'Bean Co', 'Blobs', 'Glider', 'Delta'])
    assert.equal(askFor(project), undefined, project);
});

test('A PROJECT THAT HOLDS A KEY NUMBER IS OFFERED NONE, and examples and readings of no project are no readings', () => {
  const held: Row[] = [{ id: 'e_kpi_1', spoken: 'kpis#1', version: 1, fields: { name: 'Players', thing: 'things#6', state: 'retired' } }];
  const again = kpiBackfill(things, readingRows(HIS), held);
  assert.equal(again.some((a) => a.project === 'Linework'), false);
  assert.equal(again.length, asks.length - 1);

  const lone: Row[] = [{ id: 'e_t', spoken: 'things#1', version: 1, fields: { name: 'Kiln', lane: 'earning' } }];
  const example = (i: number, source: string, thing: string): Row => ({
    id: `e_${i}`,
    spoken: `datapoints#${i}`,
    version: 1,
    fields: { name: 'Orders', value: i, thing, at: dayBefore('2026-09-28', i), source },
  });
  assert.deepEqual(kpiBackfill(lone, [1, 2, 3, 4].map((i) => example(i, 'example', 'e_t')), []), []);
  assert.deepEqual(kpiBackfill(lone, [1, 2, 3, 4].map((i) => example(i, 'typed', 'e_nobody')), []), []);
  /* WEEKLY READINGS ARE WEEKLY, AND A MONEY AMOUNT IS READ IN ITS MINOR UNITS. */
  const weekly = [0, 1, 2, 3].map((i): Row => ({ id: `e_w${i}`, spoken: `datapoints#${i + 1}`, version: 1, fields: { name: 'Takings', amount: { amount: 12_000 + i, currency: 'GBP' }, thing: 'e_t', at: dayBefore('2026-09-28', 7 * i), source: 'reported' } }));
  const [kiln] = kpiBackfill(lone, weekly, []);
  assert.deepEqual([kiln!.body.rows[0]!.name, kiln!.body.rows[0]!.every, kiln!.body.rows[0]!.unit, kiln!.body.rows[0]!.kind], ['Takings', '1w', 'GBP', 'flow']);
});

test('the declaration is Portfolio\'s: no egress, no keys, reading Projects, Key numbers and Numbers', () => {
  assert.equal(KPI_BACKFILL_SCRIPT.script, 'kpi_backfill');
  assert.equal(KPI_BACKFILL_SCRIPT.pack, 'portfolio');
  assert.deepEqual([KPI_BACKFILL_SCRIPT.egress, KPI_BACKFILL_SCRIPT.keys], [[], []]);
  assert.deepEqual(KPI_BACKFILL_SCRIPT.reads, ['things', 'kpis', 'datapoints']);
  assert.deepEqual(KPI_BACKFILL_SCRIPT.writes, ['kpis']);
  assert.match(String(KPI_BACKFILL_SCRIPT.source), /^export function kpiBackfill|^function kpiBackfill/);
});

/* ── the script, on a record ───────────────────────────────────────────────────────────────────────────────────── */

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

test('ON A RECORD LIKE HIS, the script files one question a project, writes no key number, and a second run asks nothing new', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const pack = value<Pack>(await normalise(firstPartyDocument('portfolio', { seeds: [] }) as never, { kind: 'local' }));
  const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
  const diff = await planOf(pack, state);
  value(await install(pack, diff, hostFor(k), diff.planHash));

  const ids = new Map<string, string>();
  k.transaction(() => {
    for (const [name, lane] of PROJECTS) ids.set(name, value<{ id: string }>(k.create('things', { name, lane }, OWNER)).id);
    for (const r of HIS) value(k.create('datapoints', { name: r.name, value: r.value, thing: ids.get(r.project)!, at: r.at, source: 'typed', ...(r.unit ? { unit: r.unit } : {}) }, OWNER));
    return null;
  });
  assert.equal(k.count('datapoints'), HIS.length);

  const ACTOR = `script:${String(KPI_BACKFILL_SCRIPT.script)}@v1`;
  const mod = (await import(`data:text/javascript,${encodeURIComponent(KPI_BACKFILL_SCRIPT.source as string)}`)) as { default: (c: unknown) => Promise<unknown> };
  const logs: string[] = [];
  let reads = 0;
  const ctx = {
    input: null,
    tz: 'UTC',
    config: {},
    now: () => new Date(NOW).toISOString(),
    record: {
      /* ONE PAGE OF FIFTY IN THE LIST'S OWN ORDER, as a host's `scriptReads` answers: Numbers by its day, newest first. */
      list: async (register: string, where?: unknown) => {
        reads++;
        return value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map((e) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields }));
      },
    },
    write: () => assert.fail('the backfill writes nothing'),
    update: () => assert.fail('the backfill changes nothing'),
    propose: async (p: { question: string; body_kind: 'rowset'; body: Fields; cause: string }) => k.propose(p, ACTOR),
    log: (line: string) => void logs.push(line),
  };
  const openOf = () => value<{ id: string; body_kind: string; cause?: string | null }[]>(k.openSuggestions({ apart: 'with' }));

  assert.deepEqual(await mod.default(ctx), { asked: 6, waiting: 0, answered: 0, refused: 0 });
  assert.ok(reads < 200, `${reads} reads`);
  assert.match(logs.at(-1)!, /^Offered key numbers for Kiln, Linework, Parlour and 3 more\.$/);
  const first = openOf().filter((q) => String(q.cause ?? '').startsWith('kpi-backfill:'));
  assert.equal(first.length, 6);
  assert.equal(first.every((q) => q.body_kind === 'rowset'), true);
  /* NEVER WRITTEN, ONLY ASKED. */
  assert.equal(k.count('kpis'), 0);

  /* EVERY READING WAS READ, NOT THE NEWEST FIFTY: Kiln's revenue is from 2025 and its question still leads with it. */
  const kilnId = ids.get('Kiln')!;
  const filedKiln = k.governanceRow('suggestion', first.find((q) => q.cause === `kpi-backfill:${kilnId}`)!.id) as unknown as { body: string | Fields } | null;
  const kilnBody = (typeof filedKiln!.body === 'string' ? JSON.parse(filedKiln!.body) : filedKiln!.body) as { rows: Fields[] };
  assert.deepEqual(kilnBody.rows.map((r) => r.name), ['Revenue by month', 'Servers', 'Weekly active players', 'Daily active players', 'Monthly active players', 'Orders by month']);

  /* THE SECOND RUN JOINS WHAT IS WAITING AND FILES NOTHING. */
  assert.deepEqual(await mod.default(ctx), { asked: 0, waiting: 6, answered: 0, refused: 0 });
  assert.equal(openOf().filter((q) => String(q.cause ?? '').startsWith('kpi-backfill:')).length, 6);

  /* HE KEEPS KILN'S AND SAYS NO TO LINEWORK'S: the rows are made by his press, and neither is asked again. */
  const halfId = ids.get('Linework')!;
  const kilnQ = first.find((q) => q.cause === `kpi-backfill:${kilnId}`)!.id;
  const halfQ = first.find((q) => q.cause === `kpi-backfill:${halfId}`)!.id;
  value(k.decide(kilnQ, { decide: { option: 'accept', reason: 'These are the ones.' } }, OWNER.actor));
  value(k.decide(halfQ, { resolved_as: 'wont-fix', reason: 'Not yet.' }, OWNER.actor));
  assert.equal(k.count('kpis'), 6);
  const kept = value<{ rows: Entry[] }>(k.list({ register: 'kpis' })).rows;
  assert.equal(kept.every((e) => e.fields.thing === kilnId && e.fields.draft === true && e.fields.state === 'live'), true);
  assert.deepEqual(kept.filter((e) => e.fields.headline === true).map((e) => e.fields.name), ['Revenue by month']);

  const third = (await mod.default(ctx)) as { asked: number; waiting: number; answered: number };
  assert.deepEqual(third, { asked: 0, waiting: 4, answered: 1, refused: 0 });
  assert.equal(openOf().filter((q) => String(q.cause ?? '').startsWith('kpi-backfill:')).length, 4);
  assert.equal(k.count('kpis'), 6);
});

test('A HOST WITH NO PROPOSE files nothing and writes nothing, and says so in one sentence', async () => {
  const mod = (await import(`data:text/javascript,${encodeURIComponent(KPI_BACKFILL_SCRIPT.source as string)}`)) as { default: (c: unknown) => Promise<unknown> };
  const rows = readingRows(HIS);
  const lists: Record<string, Row[]> = { things, kpis: [], datapoints: rows };
  const logs: string[] = [];
  const ctx = {
    record: {
      list: async (register: string, where?: { field?: string; gte?: number; all?: { field: string; gte?: number; lt?: number }[] }) => {
        const seq = (r: Row) => Number(r.spoken.split('#')[1]);
        const from = where?.all?.[0]?.gte ?? where?.gte ?? 1;
        const to = where?.all?.[1]?.lt ?? Infinity;
        return (lists[register] ?? []).filter((r) => seq(r) >= from && seq(r) < to).slice(0, 50).map((r) => ({ ...r, seq: seq(r) }));
      },
    },
    write: () => assert.fail('the backfill writes nothing'),
    update: () => assert.fail('the backfill changes nothing'),
    log: (line: string) => void logs.push(line),
  };
  assert.equal(await mod.default(ctx), null);
  assert.deepEqual(logs, ['6 projects have key numbers to offer, and this run files no questions (a trial files none), so nothing was asked.']);
});
