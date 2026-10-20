/**
 * The key number sheet's logic (`sheet.ts`): a new number needs only a name and a source, the defaults follow the source
 * until set by hand, a target in a currency is money, a number already kept reads back as it was typed, an edit sends
 * only what changed, and what will not do is said in plain words before anything is sent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from '@braindog/seed';

import { kpis as words } from '../copy/kpis.ts';
import { draftOf, everyFor, faultsOf, FIGURES, firstFault, newDraft, patchOf, rowOf, saysMore, sourcesFor, SOURCES, undoOf, withFigure, withSource, type KpiDraft } from './sheet.ts';

/* THE LIST AS PORTFOLIO DECLARES IT: its fields, and the values each choice may hold. */
const KPIS = REGISTERS.kpis!;
const FIELDS: readonly string[] = KPIS.fields.map((f) => f.id);
const valuesOf = (id: string): readonly string[] => (KPIS.fields.find((f) => f.id === id) as { values?: readonly string[] } | undefined)?.values ?? [];

const AT = { you: 'Sami', home: 'GBP' };
const named = (over: Partial<KpiDraft> = {}): KpiDraft => ({ ...newDraft(AT), name: 'Monthly recurring revenue', ...over });

test('A NEW NUMBER NEEDS ONLY A NAME: you type it, weekly, kept by you, up is good, on Today when it needs a look', () => {
  const d = newDraft(AT);
  assert.equal(d.source, 'typed');
  assert.equal(d.every, '1w');
  assert.equal(d.owner, 'Sami');
  assert.equal(d.good, 'up');
  assert.equal(d.today, 'auto');
  assert.equal(d.headline, false);
  assert.deepEqual(faultsOf(d), { name: words.kpiNoName });
  assert.deepEqual(faultsOf(named()), {});
});

test('THE ROW WRITTEN carries every field the sheet owns, in the list’s own names and values, and keeps a suggestion', () => {
  const row = rowOf(named(), 4);
  assert.deepEqual(row, {
    name: 'Monthly recurring revenue',
    thing: 4,
    measures: null,
    source: 'typed',
    measure: 'Monthly recurring revenue',
    figure: null,
    unit: null,
    good: 'up',
    target: null,
    target_amount: null,
    target_by: null,
    every: '1w',
    owner: 'Sami',
    today: 'auto',
    headline: false,
    draft: false,
  });
  /* Every key is a field of the list, and every enum a value it declares. */
  for (const key of Object.keys(row)) assert.ok(FIELDS.includes(key), key);
  for (const key of ['source', 'good', 'every', 'today'] as const) assert.ok(valuesOf(key).includes(String(row[key])), key);
  assert.ok(!('kind' in row), 'the shape is the engine’s to work out');
  /* The sheet offers exactly the four sources the plan names, all of them the list's. */
  assert.deepEqual(SOURCES, ['typed', 'agent', 'feed', 'figure']);
  for (const s of SOURCES) assert.ok(valuesOf('source').includes(s));
});

test('THE DEFAULTS FOLLOW THE SOURCE until set by hand: an agent’s and a feed’s are daily and nobody’s, a figure has no cadence', () => {
  const none = new Set<never>();
  const agent = withSource(named(), 'agent', none, AT);
  assert.equal(agent.every, '1d');
  assert.equal(agent.owner, '');
  assert.equal(withSource(named(), 'feed', none, AT).every, '1d');
  const fig = withSource(named(), 'figure', none, AT);
  assert.equal(fig.every, '');
  assert.equal(rowOf({ ...fig, figure: 'project-owed' }, 4).every, null);
  /* A cadence and a keeper set by hand stay through a change of source. */
  const kept = withSource({ ...named(), every: '1m', owner: 'Mona' }, 'agent', new Set(['every', 'owner'] as const), AT);
  assert.equal(kept.every, '1m');
  assert.equal(kept.owner, 'Mona');
  /* And back to typed, the keeper is you again. */
  assert.equal(withSource(agent, 'typed', none, AT).owner, 'Sami');
});

test('A FIGURE BRINGS ITS UNIT AND WHICH WAY IS GOOD: a cost is money in the record’s currency and good when it falls', () => {
  const none = new Set<never>();
  const cost = withFigure(withSource(named({ name: 'Costs' }), 'figure', none, AT), 'project-cost', none, AT);
  assert.equal(cost.unit, 'GBP');
  assert.equal(cost.good, 'down');
  const quiet = withFigure(cost, 'project-last-worked', none, AT);
  assert.equal(quiet.unit, 'days');
  assert.equal(quiet.good, 'down');
  /* Set by hand, the good way stays. */
  assert.equal(withFigure({ ...cost, good: 'up' }, 'project-owed', new Set(['good'] as const), AT).good, 'up');
  /* A figure KPI writes the figure and no name in Numbers; every figure offered is a project figure by id. */
  const row = rowOf(quiet, 2);
  assert.equal(row.figure, 'project-last-worked');
  assert.equal(row.measure, null);
  for (const f of FIGURES) assert.match(f.id, /^project-[a-z0-9-]+$/u);
  /* A number with no name takes the figure's; one with a name keeps it. */
  assert.equal(withFigure({ ...newDraft(AT), source: 'figure' }, 'project-owed', none, AT).name, words.kpiFigureOwed);
  assert.equal(cost.name, 'Costs');
  /* Worked out with nothing picked will not do. */
  assert.deepEqual(faultsOf({ ...withSource(named(), 'figure', none, AT), figure: '' }), { figure: words.kpiNoFigure });
});

test('A TARGET IN A CURRENCY IS MONEY in minor units, by the currency’s own places; any other target is a figure', () => {
  const usd = rowOf(named({ unit: 'usd', target: '10,000', target_by: '2026-12-01' }), 4);
  assert.deepEqual(usd.target_amount, { amount: 1_000_000, currency: 'USD' });
  assert.equal(usd.target, null);
  assert.equal(usd.unit, 'USD');
  assert.equal(usd.target_by, '2026-12-01');
  assert.deepEqual(rowOf(named({ unit: 'JPY', target: '1250' }), 4).target_amount, { amount: 1250, currency: 'JPY' });
  const players = rowOf(named({ unit: 'players', target: '1,200.5' }), 4);
  assert.equal(players.target, 1200.5);
  assert.equal(players.target_amount, null);
  assert.equal(players.unit, 'players');
  /* No target, no day: a day alone means nothing. */
  assert.equal(rowOf(named({ target_by: '2026-12-01' }), 4).target_by, null);
});

test('WHAT WILL NOT DO is said in plain words, field by field, and the caret goes to the first', () => {
  assert.deepEqual(faultsOf(named({ target: '0x10' })), { target: words.kpiNotDigits('0x10') });
  assert.deepEqual(faultsOf(named({ target: '1,5' })), { target: words.kpiNotDigits('1,5') });
  assert.deepEqual(faultsOf(named({ unit: '%', target: '140' })), { target: words.kpiShareOver });
  assert.deepEqual(faultsOf(named({ unit: 'x'.repeat(30) })), { unit: words.kpiLongUnit });
  assert.deepEqual(faultsOf(named({ target: '10', target_by: '2026-02-30' })), { target_by: words.kpiBadDay });
  assert.deepEqual(faultsOf(named({ target_by: '2026-12-01' })), { target_by: words.kpiDayNoTarget });
  assert.deepEqual(faultsOf(named({ name: 'n'.repeat(81) })), { name: words.kpiLongName });
  assert.equal(firstFault(faultsOf(named({ name: '', target: 'lots' }))), 'name');
  assert.equal(firstFault({}), null);
  /* No sentence on screen names the list or a field's machinery. */
  for (const said of Object.values(words)) {
    const s = typeof said === 'function' ? (said as (x: string, y: string) => string)('Kiln', 'Kiln') : said;
    assert.doesNotMatch(s, /\b(row|rows|list|register|enum|datapoints?|kpis?)\b/iu, s);
  }
});

const KEPT = {
  name: 'Players',
  thing: 4,
  source: 'numbers',
  measure: 'Players, Sketchpad',
  unit: 'players',
  good: 'up',
  target: 5000,
  target_by: '2026-12-31',
  every: '1d',
  owner: 'claude',
  today: 'pinned',
  headline: true,
  draft: false,
  state: 'live',
  kind: 'level',
} as const;

test('A NUMBER ALREADY KEPT READS BACK AS TYPED, keeps reading Numbers, and opens More when its hidden fields say something', () => {
  const d = draftOf(KEPT);
  assert.equal(d.source, 'numbers');
  assert.equal(d.measure, 'Players, Sketchpad');
  assert.equal(d.target, '5,000');
  assert.equal(d.today, 'pinned');
  assert.ok(sourcesFor(d).includes('numbers'));
  assert.ok(!sourcesFor(newDraft(AT)).includes('numbers'));
  /* Daily, weekly, monthly; hourly only for a number that already has it. */
  assert.deepEqual(everyFor(newDraft(AT)), ['1d', '1w', '1m']);
  assert.deepEqual(everyFor({ every: '1h' }), ['1h', '1d', '1w', '1m']);
  assert.ok(saysMore(d, AT));
  assert.ok(!saysMore(named(), AT));
  /* A money target reads back in its currency's own units, and a name in Numbers equal to its name follows a rename. */
  const money = draftOf({ name: 'MRR', thing: 4, source: 'typed', measure: 'MRR', target_amount: { amount: 875_000, currency: 'USD' } });
  assert.equal(money.target, '8,750');
  assert.equal(money.unit, 'USD');
  assert.equal(money.measure, '');
});

test('AN EDIT SENDS ONLY WHAT CHANGED, never the project, and its undo puts each field back', () => {
  const d = draftOf(KEPT);
  assert.deepEqual(patchOf(KEPT, d), {});
  const patch = patchOf(KEPT, { ...d, target: '6000', today: 'auto' });
  assert.deepEqual(patch, { target: 6000, today: 'auto' });
  assert.deepEqual(undoOf(KEPT, patch), { target: 5000, today: 'pinned' });
  /* Clearing a field clears it on the number. */
  assert.deepEqual(patchOf(KEPT, { ...d, target: '', target_by: '2026-12-31' }), { target: null, target_by: null });
  /* Saving a suggestion keeps it. */
  assert.deepEqual(patchOf({ ...KEPT, draft: true }, d), { draft: false });
});
