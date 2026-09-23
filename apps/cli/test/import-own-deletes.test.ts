/**
 * A ROW THE IMPORT PUT IN THE BIN ITSELF IS NOT A ROW HE DELETED (`loop/research-batch-fifty-four-audit.md` section 1).
 *
 * Wave fifty-three gave the import two rules that meet on Holdings. The retire pass deletes a holding the old tool no
 * longer holds, because Holdings has no state to close it with (`legacy.ts`, the holdings `retire`). And `applyPlan`
 * holds back every planned key a deleted row still carries, reading the delete as his (`gone`). A holding carries no
 * id, so its key is its kind, label, day, cost and quantity, and it comes back whenever the quantity does.
 *
 * MEASURED BEFORE THIS FILE, through `importCommand` on the record behind `serveApi` (the first test): a gold lot of 5,
 * corrected to 6 in the old tool the next night and back to 5 the night after, left no live lot at all, and the third
 * night's report said "Deleted in this BrainDog, so not added again: Gold 24c 2026-07-30". Before wave fifty-three the
 * same three nights left one lot of 5. Only a new export would ever have brought it back, and none could: the key sat
 * in `gone` for the thirty days the bin keeps it.
 *
 * THE IMPORT NOW REMEMBERS WHICH ROWS ITS OWN RETIRE PASS PUT IN THE BIN, BY ID AND BY THE VERSION THE DELETE LEFT, in
 * the run it keeps in `imports.jsonl`. A row still in the bin at that version is the import's, and its key is written
 * again the night the old tool holds it again. A row he put back and then deleted himself is at a later version, so it is
 * his, and stays deleted (the third test). No key is kept, because a holding's key carries its cost and quantity.
 *
 * AND THE SECOND HALF OF SECTION 6, A LINE OWED: a project he deleted here is held back, and a task the next export
 * files under it arrived with no project and nothing said. Measured before this file (the last test): task 106 on
 * `lanternly` arrived with `thing` empty and the report named only the project.
 *
 * EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY_PREFIX } from '../src/legacy.ts';
import { syntheticExport } from './legacy-export.ts';
import { liveRows, nights } from './import-nights.ts';

type Obj = Record<string, unknown>;

const GOLD = { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost_minor: 691_000, currency: 'EGP', acquired_on: '2026-07-30', matures_on: null, meta_json: null };

/** 06:00 UTC on the day, 09:00 in Cairo, a few hours after that night's export was taken. */
const at = (day: string) => Date.parse(`${day}T06:00:00.000Z`);

/** The synthetic export taken on `day`, holding one gold lot of `qty`. */
function holding(day: string, qty: number): Obj {
  const e = syntheticExport({ takenAt: `${day}T03:30:00.000Z` });
  const money = e.money as Obj;
  money.asOf = day;
  money.assets = [{ ...GOLD, qty }];
  return e;
}

const lots = (sql: Parameters<typeof liveRows>[0]) => liveRows(sql, 'holdings').map((r) => r.fields.qty);
const heldBack = (text: string) => text.split('\n').filter((l) => /Deleted in this BrainDog/u.test(l));

test('A LOT CORRECTED 5 TO 6 AND BACK TO 5 IN THE OLD TOOL is one lot of 5 here, and nothing says he deleted it', async (t) => {
  const { sql, night, morning } = await nights(t, at('2026-09-15'));

  const one = await night(holding('2026-09-15', 5), at('2026-09-15'));
  assert.deepEqual(lots(sql), [5], one.text);

  /* THE IMPORT'S OWN RETIRE PASS PUTS THE LOT OF 5 IN THE BIN, because the old tool holds a lot of 6 in its place. */
  const two = await night(holding('2026-09-16', 6), at('2026-09-16'));
  assert.deepEqual(lots(sql), [6], two.text);
  assert.match(two.text, /Gone from what the old tool holds/u);

  const three = await night(holding('2026-09-17', 5), at('2026-09-17'));
  assert.deepEqual(lots(sql), [5], `the lot the old tool holds again is not here:\n${three.text}`);
  assert.deepEqual(heldBack(three.text), [], 'the import called its own delete his');
  assert.deepEqual(heldBack(await morning()), [], 'the morning read called the import\'s own delete his');

  /* AND THE NIGHT AFTER IS QUIET: the lot is found by its key, and nothing is added a second time. */
  const four = await night(holding('2026-09-18', 5), at('2026-09-18'));
  assert.deepEqual(lots(sql), [5], four.text);
  assert.match(four.text, /Holdings: 0 added, 0 updated, 1 unchanged\./u);
});

test('A LOT HE DELETED HERE IS STILL HELD BACK, whatever the next export holds', async (t) => {
  const { sql, night, deleteByKey } = await nights(t, at('2026-09-15'));
  await night(holding('2026-09-15', 5), at('2026-09-15'));
  const [lot] = liveRows(sql, 'holdings');
  assert.ok(lot);
  await deleteByKey('holdings', (lot.fields.tags as string[]).find((x) => x.startsWith(KEY_PREFIX))!);

  const two = await night(holding('2026-09-16', 5), at('2026-09-16'));
  assert.deepEqual(lots(sql), [], two.text);
  assert.equal(heldBack(two.text).length, 1, two.text);
  assert.match(heldBack(two.text)[0]!, /Gold 24c/u);
});

test('A LOT THE IMPORT PUT IN THE BIN, WHICH HE PUT BACK AND THEN DELETED HIMSELF, is his delete and stays deleted', async (t) => {
  const { sql, night, restore, deleteByKey } = await nights(t, at('2026-09-15'));
  await night(holding('2026-09-15', 5), at('2026-09-15'));
  const [five] = liveRows(sql, 'holdings');
  assert.ok(five);
  const key = (five.fields.tags as string[]).find((x) => x.startsWith(KEY_PREFIX))!;
  await night(holding('2026-09-16', 6), at('2026-09-16'));
  assert.deepEqual(lots(sql), [6]);

  /* THE SAME ROW, BY ITS ID: out of the bin and back into it by his hand, so the delete it now carries is his. */
  await restore('holdings', five.id);
  await deleteByKey('holdings', key);

  const three = await night(holding('2026-09-17', 5), at('2026-09-17'));
  assert.deepEqual(lots(sql), [], `the lot he deleted himself came back:\n${three.text}`);
  assert.equal(heldBack(three.text).length, 1, three.text);
});

test('A TASK FILED UNDER A PROJECT HE DELETED HERE arrives without it, and the report names the task and the project', async (t) => {
  const { sql, night, morning, deleteByKey, restore } = await nights(t, at('2026-09-15'));
  const first = syntheticExport({ takenAt: '2026-09-15T03:30:00.000Z' });
  await night(first, at('2026-09-15'));
  await deleteByKey('things', `${KEY_PREFIX}project:lanternly`);

  const second = syntheticExport({ takenAt: '2026-09-16T03:30:00.000Z' });
  (second.tasks as Obj[]).push({ id: 106, text: 'Price the annual plan', done: 0, entity: 'lanternly', lane: 'sam', deleted: 0 });
  const two = await night(second, at('2026-09-16'));
  const task = liveRows(sql, 'tasks').find((r) => r.fields.what === 'Price the annual plan');
  assert.ok(task, two.text);
  assert.equal(task.fields.thing ?? null, null, 'the task was filed under something');

  const loose = two.lines.filter((l) => /^Written without/u.test(l));
  assert.equal(loose.length, 1, `nothing named the task filed with no project:\n${two.text}`);
  assert.match(loose[0]!, /^Written without lanternly \(Projects\), which is deleted in this BrainDog: .*#106 \(Tasks\)/u);
  /* TASK 101 WAS WRITTEN BEFORE THE DELETE AND STILL POINTS AT THE PROJECT'S ID, so it lost nothing and is not named. */
  assert.doesNotMatch(loose[0]!, /#101/u);
  /* AND THE MORNING READ SAYS IT ONCE: the project's own line beside it names the project and nothing filed under it. */
  assert.equal((await morning()).split('\n').filter((l) => /^- Written without lanternly/u.test(l)).length, 1);

  /* PUT BACK, THE PROJECT TAKES ITS TASK: the next night resolves the ref, patches the field, and says nothing more. */
  const [project] = sql.all<{ id: string }>("SELECT e.id FROM entry e, json_each(e.fields, '$.tags') t WHERE e.register = 'things' AND t.value = ?", `${KEY_PREFIX}project:lanternly`);
  assert.ok(project);
  await restore('things', project.id);
  const three = await night(second, at('2026-09-17'));
  assert.equal(liveRows(sql, 'tasks').find((r) => r.fields.what === 'Price the annual plan')?.fields.thing, project.id, three.text);
  assert.doesNotMatch(three.text, /Written without/u);
});

test('A TASK HE DELETED HERE UNDER A PROJECT HE DELETED HERE is held back, and is not also said to be written', async (t) => {
  /* MEASURED BY THE CHECKER BEFORE THIS TEST: the project `lanternly` and task 101 filed under it both deleted by hand,
     and the next night named #101 twice, once as "Deleted in this BrainDog, so not added again" and once as "Written
     without lanternly", because a held-back row still leaves its ref for the second pass. It was not written at all. */
  const { sql, night, deleteByKey } = await nights(t, at('2026-09-15'));
  await night(syntheticExport({ takenAt: '2026-09-15T03:30:00.000Z' }), at('2026-09-15'));
  await deleteByKey('things', `${KEY_PREFIX}project:lanternly`);
  await deleteByKey('tasks', `${KEY_PREFIX}task:101`);
  assert.equal(liveRows(sql, 'tasks').filter((r) => (r.fields.tags as string[]).includes(`${KEY_PREFIX}task:101`)).length, 0);

  const two = await night(syntheticExport({ takenAt: '2026-09-16T03:30:00.000Z' }), at('2026-09-16'));
  assert.match(heldBack(two.text)[0] ?? '', /#101 \(Tasks\)/u, two.text);
  const loose = two.lines.filter((l) => /^Written without/u.test(l));
  assert.ok(loose.every((l) => !/#101 \(Tasks\)/u.test(l.split(': ').slice(1).join(': '))), `a row held back was said to be written:\n${loose.join('\n')}`);
});
