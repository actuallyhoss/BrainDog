/**
 * An enum sorts in the order it was declared.
 *
 * `tasks.priority` is declared `urgent, high, normal, low`, and ordered by it ascending the record answered
 * `high, low, normal, urgent`: A to Z by the stored word, or by the label where one was written. Pressing the
 * Priority header put Urgent last, or somewhere among the rest, in either direction
 * (`loop/research-living-in-it.md` section 5, measured at 07ba6dbd). His call 1 in that survey's section 8 chooses
 * between the two orders; W56-3 takes declared order as the survey's default, and the comment in `list` says so.
 *
 * The same rows are sorted by the browser in `apps/web/src/lib/record/enum-order.test.ts`, so the two engines are
 * held to one order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const OWNER = { actor: 'p_1' };

/* THE TASKS REGISTER'S TWO ENUMS AS THE SEED DECLARES THEM: `priority` with a label on every value, `state` with a label
   on two of seven (`backlog` reads Later), and `effort` with none at all, so each of the three shapes is sorted. `state`
   is also the field the record mirrors into its own column, so the position is read through `fieldSqlIn` there too. */
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      {
        id: 'priority',
        type: 'enum',
        values: ['urgent', 'high', 'normal', 'low'],
        labels: { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' },
      },
      {
        id: 'state',
        type: 'enum',
        values: ['backlog', 'open', 'doing', 'review', 'blocked', 'done', 'dropped'],
        labels: { backlog: 'Later', review: 'To check' },
      },
      { id: 'effort', type: 'enum', values: ['small', 'medium', 'large'] },
    ],
  } as never,
};

const ROWS: Record<string, string>[] = [
  { what: 'a', priority: 'normal', state: 'open', effort: 'medium' },
  { what: 'b', priority: 'urgent', state: 'done', effort: 'large' },
  { what: 'c', state: 'backlog' },
  { what: 'd', priority: 'low', state: 'review', effort: 'small' },
  { what: 'e', priority: 'high', state: 'doing', effort: 'large' },
  { what: 'f', priority: 'urgent', state: 'blocked' },
  { what: 'g', priority: 'normal', state: 'dropped', effort: 'small' },
];

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([TASKS]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const fields of ROWS) assert.ok(k.create('tasks', fields, OWNER).ok);
  return k;
}

type Page = { rows: Entry[]; cursor: string | null };
const page = (r: unknown): Page => {
  const x = r as { ok: boolean; value: Page; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const sorted = (k: Kernel, field: string, dir: 'asc' | 'desc', limit = 50, cursor: string | null = null) =>
  page(k.list({ register: 'tasks', order: [{ field, dir }], limit, cursor }));

test('PRIORITY ASCENDING IS URGENT, HIGH, NORMAL, LOW, the order it was declared in, and empty is last both ways', async () => {
  const k = await record();
  const words = (dir: 'asc' | 'desc') => sorted(k, 'priority', dir).rows.map((r) => r.fields.priority ?? null);
  /* Red at 07ba6dbd: `["high","low","normal","normal","urgent","urgent",null]`, the labels' A to Z. */
  assert.deepEqual(words('asc'), ['urgent', 'urgent', 'high', 'normal', 'normal', 'low', null]);
  assert.deepEqual(words('desc'), ['low', 'normal', 'normal', 'high', 'urgent', 'urgent', null]);
  /* THE ROWS THEMSELVES, ties newest first, which is what the browser's twin asserts over the same seven. */
  assert.deepEqual(sorted(k, 'priority', 'asc').rows.map((r) => r.fields.what), ['f', 'b', 'e', 'g', 'a', 'd', 'c']);
  assert.deepEqual(sorted(k, 'priority', 'desc').rows.map((r) => r.fields.what), ['d', 'g', 'a', 'e', 'f', 'b', 'c']);
});

test('A PARTLY LABELLED ENUM AND AN UNLABELLED ONE SORT BY POSITION TOO, not by the words on screen', async () => {
  const k = await record();
  /* Red at 07ba6dbd: `state` answered blocked, doing, done, dropped, Later, open, To check, a mix of labels and stored
     words in one alphabet; `effort` answered large, medium, small. */
  assert.deepEqual(
    sorted(k, 'state', 'asc').rows.map((r) => r.fields.state),
    ['backlog', 'open', 'doing', 'review', 'blocked', 'done', 'dropped'],
  );
  assert.deepEqual(
    sorted(k, 'effort', 'asc').rows.map((r) => r.fields.effort ?? null),
    ['small', 'small', 'medium', 'large', 'large', null, null],
  );
});

test('A WORD THE ENUM NO LONGER DECLARES SORTS AFTER EVERY DECLARED ONE AND BEFORE THE EMPTY, as the browser puts it', async () => {
  /* A ROW THAT PREDATES A NARROWED DECLARATION still holds the word, so it is written here the way it would be left
     behind. The `ELSE` of the sort's `CASE` is what places it, and nothing held it: with `ELSE -1` every test above stayed
     green while the stray word led the list ascending, ahead of Urgent, and the browser's twin in
     `apps/web/src/lib/record/enum-order.test.ts` put it after Low. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([TASKS])).ok);
  for (const fields of [{ what: 'a', priority: 'low' }, { what: 'b' }, { what: 'c', priority: 'urgent' }, { what: 'd', priority: 'low' }])
    assert.ok(k.create('tasks', fields, OWNER).ok);
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.priority', 'someday') WHERE register = 'tasks' AND json_extract(fields, '$.what') = 'd'`);
  const words = (dir: 'asc' | 'desc') => sorted(k, 'priority', dir).rows.map((r) => r.fields.priority ?? null);
  assert.deepEqual(words('asc'), ['urgent', 'low', 'someday', null]);
  assert.deepEqual(words('desc'), ['someday', 'low', 'urgent', null]);
});

test('A LIST SORTED BY AN ENUM PAGES WITHOUT A GAP OR A REPEAT, because the cursor carries the position it sorted by', async () => {
  const k = await record();
  for (const field of ['priority', 'state', 'effort'])
    for (const dir of ['asc', 'desc'] as const)
      for (const limit of [1, 2, 3]) {
        const whole = sorted(k, field, dir).rows.map((r) => r.fields.what);
        const seen: unknown[] = [];
        let cursor: string | null = null;
        for (let i = 0; i < 20; i++) {
          const p: Page = sorted(k, field, dir, limit, cursor);
          seen.push(...p.rows.map((r) => r.fields.what));
          cursor = p.cursor;
          if (cursor === null) break;
        }
        assert.deepEqual(seen, whole, `${field} ${dir}, ${limit} a page`);
      }
});
