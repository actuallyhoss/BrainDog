/**
 * `questions-open-in:<list>`, the open questions about one list's rows: the rule a queue's `list is <list>`
 * keeps, so Work's sentence says how many of its own questions wait while Decide's badge counts the whole record.
 *
 * WHAT WAS MEASURED BEFORE IT: nothing counted one list's questions, so a page could say all was quiet while 25 waited.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { builtInFigure } from '../src/built-in-figures.ts';
import { openRecord, type PageBlock } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };
const about = (what: string) => ({ ...OPTIONS, about: what });
const queueOn = (list: string) => ({ kind: 'queue', source: 'governance.open', where: `list is ${list}`, empty: 'Nothing matched.' }) as PageBlock;
const waitingOn = (list: string) => ({ kind: 'section', heading: 'Waiting on you', when: { metric: `questions-open-in:${list}`, gt: 0 } }) as PageBlock;

test('QUESTIONS-OPEN-IN:<LIST> COUNTS THE OPEN QUESTIONS ABOUT THAT LIST\'S ROWS, the ones its queue keeps', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(builtInFigure('questions-open-in'), 'the record answers the figure with no pack declaring it');

  value(k.propose({ question: 'Move the kiln check to Friday?', body_kind: 'options', body: about('tasks#1') }, 'slash'));
  value(k.propose({ question: 'Split the glaze order?', body_kind: 'options', body: about('tasks#2') }, 'slash'));
  value(k.propose({ question: 'Is this the same potter?', body_kind: 'options', body: about('people#1') }, 'slash'));
  value(k.propose({ question: 'Pay the bill?', body_kind: 'options', body: OPTIONS }, 'slash'));
  /* A WORD IS ON NO LIST, even one spelled like a list's name. */
  value(k.propose({ question: 'Rename the box?', body_kind: 'options', body: about('tasks') }, 'slash'));
  const closed = value<{ id: string }>(k.propose({ question: 'Close the old ticket?', body_kind: 'options', body: about('tasks#3') }, 'slash'));

  const read = (list: string) => k.block({ kind: 'stat', cells: [{ metric: `questions-open-in:${list}` }] }).readings?.[0]?.reading?.value;
  assert.equal(read('tasks'), 3, 'before the one on tasks is answered');

  /* AN ANSWERED QUESTION IS NOT COUNTED. */
  value(k.decide(closed.id, { decide: { option: 'yes', reason: 'done with it' } }, 'p_1'));
  assert.equal(read('tasks'), 2);
  assert.equal(read('people'), 1);
  assert.equal(read('projects'), 0, 'a list nobody asked about counted another');
  assert.equal(read('task'), 0, 'a list is matched by its whole name');
  assert.equal(k.block({ kind: 'stat', cells: [{ metric: 'questions-open' }] }).readings?.[0]?.reading?.value, 5, 'the whole record is still the whole record');

  /* THE QUEUE'S OWN COUNT, list by list: the figure and `list is <list>` keep the same questions. */
  for (const list of ['tasks', 'people', 'projects']) assert.equal(read(list), k.block(queueOn(list)).matched, list);

  /* THE GATE: drawn over a list with a question, not over one with none, while others wait. */
  assert.notEqual(k.block(waitingOn('tasks')).drawn, false);
  assert.equal(k.block(waitingOn('projects')).drawn, false, 'Projects drew its queue while only tasks had questions');
  sql.close();
});

test('READ WITH NO LIST, IT COUNTS THE QUESTIONS ABOUT A ROW OF ANY LIST, and a body it cannot parse is about none', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(k.propose({ question: 'Move the kiln check?', body_kind: 'options', body: about('tasks#1') }, 'slash'));
  value(k.propose({ question: 'Same potter?', body_kind: 'options', body: about('people#4') }, 'slash'));
  value(k.propose({ question: 'Pay the bill?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const read = (id: string) => k.block({ kind: 'stat', cells: [{ metric: id }] }).readings?.[0]?.reading?.value;
  assert.equal(read('questions-open-in'), 2);
  sql.exec("UPDATE suggestion SET body = 'not json' WHERE id = (SELECT id FROM suggestion ORDER BY rowid LIMIT 1)");
  assert.equal(read('questions-open-in:tasks'), 0);
  assert.equal(read('questions-open-in:people'), 1, 'one body it could not read stopped the count');
  sql.close();
});

/* THE PASS OF 27 OCTOBER: "Add Priya to People?" is a rowset on People that names no row of its own, and People's
   line said no question was open while it waited in Needs you. A question that adds or changes a list's rows is on it. */
test("A QUESTION THAT ADDS OR CHANGES A LIST'S ROWS IS ON THAT LIST, in the figure and in the queue alike", async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(k.propose({ question: 'Same potter?', body_kind: 'options', body: about('people#4') }, 'slash'));
  const at = new Date(NOW).toISOString();
  const rowset = (id: string, register: string, name: string) =>
    sql.exec(
      `INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('${id}', 'rowset', '${JSON.stringify({ register, rows: [{ fields: { name } }] })}', 'open', 'slash', '${at}')`,
    );
  rowset('SG900', 'people', 'Priya');
  rowset('SG901', 'organisations', 'Apify');
  const read = (list: string) => k.block({ kind: 'stat', cells: [{ metric: `questions-open-in:${list}` }] }).readings?.[0]?.reading?.value;
  assert.equal(read('people'), 2, 'a rowset on People that names no row was not counted on People');
  assert.equal(read('organisations'), 1);
  assert.equal(read('tasks'), 0);
  for (const list of ['people', 'organisations', 'tasks']) assert.equal(read(list), k.block(queueOn(list)).matched, list);
  sql.close();
});
