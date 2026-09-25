/**
 * AN EXPORT OLDER THAN ONE AN EARLIER NIGHT CARRIED CLOSES NOTHING (`loop/research-batch-fifty-three-audit.md` section 3,
 * left open by wave fifty-four's `dc9ec9e4`).
 *
 * The retire pass reads tonight's export against itself: a task, a ledger row or a holding an earlier night carried and
 * tonight's export does not hold is read as gone from the old tool. Imported after a newer one, an older export does not
 * hold what only the newer one carried, and nothing compared the two. `dc9ec9e4` kept the ledger's voids inside the days
 * tonight's ledger answered, which spares a row dated after the older export's newest day and none dated inside it.
 *
 * MEASURED BEFORE THIS FILE, through `importCommand` on the record behind `serveApi` (the first test): after an export
 * taken 2026-09-16 and then one taken 2026-09-09, task 106 was dropped, ledger row T3 (dated 2026-09-03, inside the older
 * ledger's 2026-09-01 to 2026-09-08) was void, and the lot Gold 21c was in the bin, each said as gone from the old tool.
 * Row T5, dated 2026-09-12 and outside that span, stayed cleared, which is the part `dc9ec9e4` mended. And with
 * wave fifty-three's rule on deleted rows the newer export imported once more did not bring Gold 21c back: it said
 * "Deleted in this BrainDog, so not added again" (`loop/research-batch-fifty-four-audit.md` section 1, H2).
 *
 * THE RULE NOW: the run remembered in `imports.jsonl` carries the day its export was taken, and a night whose export was
 * taken before the newest one this machine carried into the same BrainDog skips every retire pass, with one line naming
 * both days. The rows it holds are still written.
 *
 * EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { syntheticExport } from './legacy-export.ts';
import { liveRows, nights } from './import-nights.ts';

type Obj = Record<string, unknown>;

const txn = (id: string, description: string, day: string, amount_minor: number): Obj => ({ id, account_id: 'main', day, description, amount_minor, category_id: 'C1' });
const lot = (label: string): Obj => ({ kind: 'gold', label, qty: 5, unit_cost_minor: 515_000, currency: 'EGP', acquired_on: '2026-06-30', matures_on: null, meta_json: null });

/** 06:00 UTC on the day, 09:00 in Cairo. */
const at = (day: string) => Date.parse(`${day}T06:00:00.000Z`);

/**
 * The export taken on `day`. The newer one holds one more task, two more ledger rows (T3 inside the older ledger's
 * days and T5 after them) and one more gold lot, as the old tool would a week on.
 */
function exported(day: string, newer: boolean): Obj {
  const e = syntheticExport({ takenAt: `${day}T03:30:00.000Z` });
  const money = e.money as Obj;
  money.asOf = day;
  money.ledger = {
    txns: [
      txn('T1', 'Lunch with the accountant', '2026-09-01', -45_000),
      ...(newer ? [txn('T3', 'Printer toner', '2026-09-03', -9_900)] : []),
      txn('T2', 'Quill invoice 14', '2026-09-05', 125_000),
      txn('T4', 'Cash for the market', '2026-09-08', -20_000),
      ...(newer ? [txn('T5', 'Store fee', '2026-09-12', -3_300)] : []),
    ],
    categories: [{ id: 'C1', name: 'Running costs', grp: 'work', is_income: 0 }],
  };
  money.assets = newer ? [lot('Gold 24c'), lot('Gold 21c')] : [lot('Gold 24c')];
  if (newer) (e.tasks as Obj[]).push({ id: 106, text: 'Price the annual plan', done: 0, lane: 'sam', deleted: 0 });
  return e;
}

const taskState = (sql: Parameters<typeof liveRows>[0], what: string) => liveRows(sql, 'tasks').filter((r) => r.fields.what === what).map((r) => r.fields.state);
const ledgerState = (sql: Parameters<typeof liveRows>[0], what: string) => liveRows(sql, 'transactions').filter((r) => r.fields.what === what).map((r) => r.fields.state);
const lots = (sql: Parameters<typeof liveRows>[0]) => liveRows(sql, 'holdings').map((r) => r.fields.label).sort();

test('AN OLDER EXPORT AFTER A NEWER ONE leaves open, cleared and held what only the newer one carried, and says why', async (t) => {
  const { sql, night, morning } = await nights(t, at('2026-09-16'));

  const one = await night(exported('2026-09-16', true), at('2026-09-16'));
  assert.deepEqual(taskState(sql, 'Price the annual plan'), ['open'], one.text);
  assert.deepEqual(ledgerState(sql, 'Printer toner'), ['cleared'], one.text);
  assert.deepEqual(lots(sql), ['Gold 21c', 'Gold 24c'], one.text);

  /* A SAVED BACKUP IMPORTED THE NEXT MORNING, which `legacy-export.mjs --from` is the documented way to do. */
  const two = await night(exported('2026-09-09', false), at('2026-09-17'));
  assert.deepEqual(taskState(sql, 'Price the annual plan'), ['open'], `the older export dropped task 106:\n${two.text}`);
  assert.deepEqual(ledgerState(sql, 'Printer toner'), ['cleared'], `the older export voided T3:\n${two.text}`);
  assert.deepEqual(ledgerState(sql, 'Store fee'), ['cleared'], two.text);
  assert.deepEqual(lots(sql), ['Gold 21c', 'Gold 24c'], `the older export deleted Gold 21c:\n${two.text}`);
  assert.doesNotMatch(two.text, /Closed, and why:/u);
  const line = two.lines.find((l) => /taken on 2026-09-09/u.test(l));
  assert.ok(line, `nothing said the export was older:\n${two.text}`);
  assert.match(line, /2026-09-16/u, 'the line does not name the newer export it was measured against');
  assert.match(line, /Tasks/u);
  assert.match(line, /Ledger/u);
  assert.match(line, /Holdings/u);
  /* AND THE MORNING READ SAYS IT, because the night's report is printed at three in the morning to nobody. */
  assert.match(await morning(), /taken on 2026-09-09/u);

  /* THE NEWER EXPORT AGAIN: nothing was lost, so nothing is held back and nothing is added a second time. */
  const three = await night(exported('2026-09-17', true), at('2026-09-18'));
  assert.deepEqual(lots(sql), ['Gold 21c', 'Gold 24c'], three.text);
  assert.doesNotMatch(three.text, /Deleted in this BrainDog/u);
  assert.doesNotMatch(three.text, /taken on 2026-09-17/u);
});

test('A NEWER EXPORT AFTER AN OLDER ONE STILL CLOSES what the old tool no longer holds', async (t) => {
  const { sql, night } = await nights(t, at('2026-09-16'));
  await night(exported('2026-09-16', true), at('2026-09-16'));
  await night(exported('2026-09-09', false), at('2026-09-17'));

  /* THE NEWEST EXPORT SO FAR, with task 106 deleted in the old tool: it is measured against 09-16, not the 09-09 night. */
  const newest = exported('2026-09-18', true);
  (newest.tasks as Obj[]).find((x) => x.id === 106)!.deleted = 1;
  const three = await night(newest, at('2026-09-18'));
  assert.deepEqual(taskState(sql, 'Price the annual plan'), ['dropped'], three.text);
  assert.match(three.text, /Closed, and why:/u);
});
