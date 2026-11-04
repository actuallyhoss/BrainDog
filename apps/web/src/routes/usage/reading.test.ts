/**
 * `/usage`'s sentence and chart readings, and the per-day array `actions.ts` keeps for them: every figure is one the
 * ledger or the record sent, a chart with no data is none, and red is said only when actions wait.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { daysOf, namesOf, usageFromActions, usageFromLedger, words, type AccountUsage, type Allowed, type Group, type UsageView } from '../../lib/record/actions.ts';
import { asksOf, byProject, daysSaid, earlierOf, groupName, placeOf, heatOf, offCloud, projectsSaid, ringsOf, said, sentenceOf, weekBars, weeksSaid } from './reading.ts';

const t = (runs: number, held = 0) => ({ runs, requests: runs * 2, bytes: runs * 1_000, ms: runs * 10, failures: 0, held });

const ledger = (used: number, held = 0, slash?: AccountUsage['records'][number]['slash']): AccountUsage => ({
  from: '2026-09-01',
  to: '2026-09-15',
  totals: t(used, held),
  records: [
    {
      record: 'rec_1',
      slug: 'studio',
      plan: 'hosted',
      closed: false,
      month: { month: '2026-09', used: t(used, held), allowance: { runs: 1_000, requests: 1_000_000, bytes: 1_000_000_000, ms: 1_000_000_000 }, resets: '2026-10-01' },
      totals: t(used, held),
      projects: [],
      actions: [],
      days: [
        { day: '2026-08-31', ...t(99) },
        { day: '2026-09-01', ...t(40) },
        { day: '2026-09-08', ...t(used - 40) },
        { day: '2026-09-20', ...t(5) },
      ],
      counted: [],
      ...(slash ? { slash } : {}),
    },
  ],
});

test('the per-day array keeps the month up to today, drops days with nothing, and sums a day twice named', () => {
  const days = daysOf([{ day: '2026-09-02', runs: 3 }, { day: '2026-09-02', runs: 1 }, { day: '2026-08-30', runs: 9 }, { day: '2026-09-01', runs: 0 }, { day: '2026-09-20', runs: 4 }], '2026-09', '2026-09-15');
  assert.deepEqual(days, [{ day: '2026-09-02', runs: 4 }]);
  const view = usageFromLedger(ledger(100), '2026-09', '2026-09-15');
  assert.deepEqual(view.days, [{ day: '2026-09-01', runs: 40 }, { day: '2026-09-08', runs: 60 }]);
  assert.equal(view.records[0]?.asks, null, 'a host that does not count Slash says nothing of it');
  const counted = usageFromLedger(ledger(100, 0, { asks: 41, neurons: 12_300, days: [] }), '2026-09', '2026-09-15');
  assert.deepEqual(counted.records[0]?.asks, { asks: 41, neurons: 12_300, cap: null });
});

test('the sentence names the busiest meter, and only waiting actions are the red phrase', () => {
  const calm = sentenceOf(usageFromLedger(ledger(100), '2026-09', '2026-09-15'));
  assert.deepEqual(calm, { text: "Well within the month's allowance; the busiest meter is at 10%." });

  const near = sentenceOf(usageFromLedger(ledger(850), '2026-09', '2026-09-15'));
  assert.equal(near?.text, "Runs is at 85% of the month's allowance; at the limit, actions wait until 1 October.");
  assert.equal(near?.needs, undefined, 'near is not yet something that needs him');

  const held = sentenceOf(usageFromLedger(ledger(1_000, 3), '2026-09', '2026-09-15'));
  assert.equal(held?.text, "Runs is at 100% of the month's allowance; actions wait until 1 October.");
  assert.equal(held?.needs, 'actions wait until 1 October');
  assert.ok(held && held.needs && held.text.includes(held.needs), 'the red phrase is inside the sentence');

  const past = sentenceOf(usageFromLedger(ledger(500), '2026-08', undefined, undefined, false));
  assert.match(past?.text ?? '', /^In August the busiest meter was runs, at 50% of the allowance\.$/u);
});

test('a member is told whose the plan is, and a month with no limit or no ledger says only its runs', () => {
  const member = { ...usageFromLedger(ledger(0), '2026-09'), owner: false, from: 'events' as const };
  assert.deepEqual(sentenceOf(member), { text: words.notOwner });
  const events: UsageView = { ...usageFromLedger(ledger(0), '2026-09'), records: [], totals: { runs: 12, requests: 0, bytes: 0, failures: 0 } };
  assert.deepEqual(sentenceOf(events), { text: '12 runs this month.' });
  assert.deepEqual(sentenceOf({ ...events, totals: { ...events.totals, runs: 0 } }), { text: 'Nothing has run in September.' }, 'nothing ran is said by the month, over the empty state');
  assert.deepEqual(
    sentenceOf({ ...events, totals: { ...events.totals, runs: 0 }, fired: 17 }),
    { text: 'No scheduled action has run in September. Automations fired 17 times in the last 7 days.' },
    'automations that fired are said, never "Nothing has run"',
  );
});

test('the rings: amber from 80%, red only when used up, and the figure never says 0% of something', () => {
  const r = usageFromLedger(ledger(850), '2026-09', '2026-09-15').records[0] as Allowed;
  const rings = ringsOf(r);
  assert.deepEqual(rings.map((x) => [x.key, x.tone, x.figure]), [['runs', 'warn', '85%'], ['requests', 'ink', '<1%'], ['bytes', 'ink', '<1%'], ['ms', 'ink', '<1%']]);
  assert.equal(ringsOf(usageFromLedger(ledger(1_000, 1), '2026-09').records[0] as Allowed)[0]?.tone, 'danger');
  assert.equal(rings[0]?.amount, '850 of 1,000');
});

test('the weeks: the latest bar in ink and a line naming the busiest week', () => {
  const view = usageFromLedger(ledger(100), '2026-09', '2026-09-15');
  assert.deepEqual(weekBars(view).map((b) => b.tone ?? 'grey'), ['grey', 'grey', 'ink']);
  assert.equal(weeksSaid(view), '100 runs; the busiest week was 8 Sep to 14 Sep.');
  assert.equal(weeksSaid({ ...view, totals: { ...view.totals, runs: 0 } }), null);
});

const group = (name: string, runs: number): Group => ({ key: name, scope: name, name, faint: false, totals: { runs, requests: 0, bytes: 0, failures: 0 }, actions: [] });

test('by project: the line names who ran most', () => {
  assert.equal(projectsSaid([group('Kiln', 20), group('Everywhere', 60)]), 'Everywhere ran 75% of them.');
  assert.equal(projectsSaid([group('Kiln', 30), group('Loom', 30)]), 'Kiln and Loom ran 50% each.');
});

test('the heat grid: weeks from Monday, nothing drawn for days outside the month or not yet come', () => {
  const view = usageFromLedger(ledger(100), '2026-09', '2026-09-15');
  const heat = heatOf(view, '2026-09-15');
  assert.ok(heat);
  /* 1 September 2026 is a Tuesday, so the first row starts on Monday 31 August, which is not this month's. */
  assert.deepEqual(heat.rows, ['1 Sep', '7 Sep', '14 Sep']);
  assert.ok(Number.isNaN(heat.values[0]?.[0]), '31 August is not drawn as a zero');
  assert.equal(heat.values[0]?.[1], 40);
  assert.equal(heat.values[1]?.[1], 60);
  assert.equal(heat.values[1]?.[0], 0, 'a day in range with nothing counted is zero');
  assert.ok(Number.isNaN(heat.values[2]?.[2]), 'the 16th has not happened yet');
  assert.equal(heatOf({ ...view, days: [] }, '2026-09-15'), null);
  assert.equal(daysSaid(view), 'Busiest on Tue 8 Sep, with 60 runs.');
});

test("Slash's asks as a ring only where the answer carries an allowance of them", () => {
  const capped = usageFromLedger(ledger(100, 0, { asks: 190, neurons: 9_000, days: [], cap: 200 }), '2026-09').records[0] as Allowed;
  assert.deepEqual(asksOf(capped), { used: 190, max: 200, tone: 'warn' });
  /* THE DIRECTORY'S OWN ANSWER CARRIES NO ALLOWANCE, so no ring: the line says the asks alone. */
  const bare = usageFromLedger(ledger(100, 0, { asks: 41, neurons: 12_300, days: [] }), '2026-09').records[0] as Allowed;
  assert.equal(asksOf(bare), null);
  assert.equal(asksOf({ ...capped, asks: null }), null);
});

/* ── every line true of a three-run month, and no allowance off the Cloud ── */

test('X21: off the Cloud the month names no allowance: no rings, no plan, and the sentence says no limit', () => {
  const view = offCloud(usageFromLedger(ledger(3), '2026-09', '2026-09-15'));
  assert.deepEqual(view.records.map((r) => [r.meters.length, r.plan, r.waiting]), [[0, null, false]]);
  assert.doesNotMatch(sentenceOf(view)?.text ?? '', /allowance/u);
  assert.equal(said.monthTitle(true, '2026-09'), "This month's runs");
  assert.equal(said.monthTitle(false, '2026-08'), "August's runs");
});

test('X22: the busiest day is said only when one day leads', () => {
  const day = (d: string, runs: number) => ({ day: d, runs });
  assert.equal(daysSaid({ days: [day('2026-09-01', 1), day('2026-09-02', 1), day('2026-09-03', 1)] }), '1 run on each of 3 days.');
  assert.equal(daysSaid({ days: [day('2026-09-01', 2), day('2026-09-02', 2), day('2026-09-03', 1)] }), 'Busiest on Tue 1 Sep and Wed 2 Sep, with 2 runs each.');
  assert.equal(daysSaid({ days: [day('2026-09-01', 1), day('2026-09-02', 3)] }), 'Busiest on Wed 2 Sep, with 3 runs.');
});

test('X22: run time under an hour is said in minutes, never "0 hours" beside a share over nothing', () => {
  assert.equal(words.hours(0.0002), 'under a minute');
  assert.equal(words.hours(0.5), '30 minutes');
  assert.equal(words.hours(1 / 60), '1 minute');
  assert.equal(words.hours(2), '2 hours');
  const rings = ringsOf(usageFromLedger(ledger(3), '2026-09', '2026-09-15').records[0]!);
  assert.doesNotMatch(rings.find((r) => r.key === 'ms')?.amount ?? '', /^0 hours/u);
});

test('X22: the actions in no project are "Not in a project", never "Everywhere"', () => {
  const g = (key: string, name: string, runs: number): Group => ({ key, scope: key, name, faint: key === '', totals: { ...t(runs), ms: 0 }, actions: [] });
  assert.equal(groupName(g('', 'Everywhere', 3)), 'Not in a project');
  assert.equal(groupName(g('rec_1:kiln', 'Kiln', 3)), 'Kiln');
});

test('X22: the month before is offered only from the month the record was made', () => {
  const made: AccountUsage = { ...ledger(3), records: ledger(3).records.map((r) => ({ ...r, since: '2026-09-02' })) };
  const view = usageFromLedger(made, '2026-09', '2026-09-15');
  assert.equal(view.since, '2026-09');
  assert.equal(earlierOf({ earlier: '2026-08' }, view), null, 'August is offered on a record made in September');
  assert.equal(earlierOf({ earlier: '2026-08' }, { since: '2026-07' }), '2026-08');
  /* A HOST THAT DOES NOT SAY WHEN THE RECORD WAS MADE keeps the month before, as it always did. */
  assert.equal(earlierOf({ earlier: '2026-08' }, { since: null }), '2026-08');
});

test('the page keeps the sample and the clock out of its words', () => {
  const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
  /* ITS WORDS AND CODE: a comment in capitals says NOW and draws nothing. */
  assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->/gu, '').replace(/\/\*[\s\S]*?\*\//gu, ''), /\bNOW\b|'sample'/u);
});

test('A MONTH OF RUNS SAYS THAT RULES ACTING ON CHANGES ARE NOT AMONG THEM, where one acted (finish F53)', () => {
  const view = usageFromActions([], '2026-09', 'events', '2026-09-03', true, [{ name: 'Weekly review', month: { runs: 1, failed: 0 } }]);
  assert.equal(sentenceOf(view)?.text, '1 run this month.');
  assert.equal(sentenceOf({ ...view, acted: true })?.text, `1 run this month. ${said.rulesApart}`);
});

test('WHERE THE RECORD KEEPS EVERY RULE\'S MONTH, EVERY RULE IS IN THE RUNS AND NONE IS SAID APART (audit 6f AF9)', () => {
  const view = usageFromActions([], '2026-09', 'events', '2026-09-03', true, [
    { id: 'rule.weekly-review', rule: 'weekly-review', name: 'weekly-review', path: 'run', month: { runs: 1, failed: 0 }, month_fired: 1 },
    { name: 'File a Ledger entry', path: 'inline', month: { runs: 0, failed: 0 }, month_fired: 17 },
  ]);
  assert.equal(view.totals.runs, 18);
  assert.equal(sentenceOf(view)?.text, '18 runs this month.');
  /* AND A RULE NAMED BY ITS ID IS SAID IN WORDS (AF10). */
  assert.deepEqual(view.actions.map((a) => a.name).sort(), ['File a Ledger entry', 'Weekly review']);
});

test('a month whose runs were in no project is not split by project, and its actions name no project after them', () => {
  const none = { key: '', name: 'Everywhere', totals: { runs: 158 } } as unknown as Group;
  const kiln = { key: 'p_kiln', name: 'Kiln', totals: { runs: 3 } } as unknown as Group;
  assert.equal(byProject([none]), false);
  assert.equal(byProject([none, kiln]), true);
  assert.equal(placeOf(none), '');
  assert.equal(placeOf(kiln), 'Kiln');
});

test('a rule read back by its id is said in words, and a name of its own is kept', () => {
  const names = namesOf({ automations: [{ id: 'weekly-review', name: 'weekly-review' }, { id: 'rent', name: 'Remind me of the rent' }] });
  assert.equal(names.get('rule:weekly-review'), 'Weekly review');
  assert.equal(names.get('rule:rent'), 'Remind me of the rent');
});
