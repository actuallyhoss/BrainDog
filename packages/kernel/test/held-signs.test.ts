/**
 * The vital signs are held across reads until something one read is written or its answer moves by the clock alone
 * (`held-signs.ts`, finish S1): Today's "signs need a look" read every sign again on every open.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sql } from '@braindog/ports';

import { heldOn, noticeSign, signTraceOf, tablesWritten, wroteNothing } from '../src/held-signs.ts';
import { openRecord, type VitalSign } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('A WRITE IS COUNTED BY THE TABLE IT WRITES, and one this cannot read moves every table', () => {
  assert.deepEqual(tablesWritten("INSERT INTO event (id, ts) VALUES (?, ?)"), ['event']);
  assert.deepEqual(tablesWritten('INSERT OR REPLACE INTO sign_reading (sign) VALUES (?)'), ['sign_reading']);
  assert.deepEqual(tablesWritten('  UPDATE OR IGNORE "suggestion" SET status = ? WHERE id = ?'), ['suggestion']);
  assert.deepEqual(tablesWritten('DELETE FROM main.dog_meta WHERE key = ?'), ['dog_meta']);
  assert.deepEqual(tablesWritten('REPLACE INTO pref (person_id, key) VALUES (?, ?)'), ['pref']);
  assert.deepEqual(tablesWritten('WITH due AS (SELECT id FROM schedule) UPDATE schedule SET state = ? WHERE id IN (SELECT id FROM due)'), ['schedule']);
  assert.deepEqual(tablesWritten('WITH d AS (SELECT 1) SELECT * FROM d'), []);
  assert.deepEqual(tablesWritten("INSERT INTO event (note) VALUES ('a; DELETE FROM entry')"), ['event'], 'a word inside a string was read as SQL');
  assert.deepEqual(tablesWritten('BEGIN; INSERT INTO entry (id) VALUES (1); UPDATE event SET to_v = 1; COMMIT'), ['entry', 'event']);
  assert.deepEqual(tablesWritten("CREATE INDEX IF NOT EXISTS entry_i ON entry (json_extract(fields, '$.on'))"), []);
  assert.deepEqual(tablesWritten('PRAGMA foreign_keys = ON'), []);
  assert.equal(tablesWritten('DROP TABLE entry'), null);
  assert.equal(tablesWritten('ALTER TABLE entry ADD COLUMN x'), null);
});

test('A SCHEMA BEFORE THE TABLE IS NOT THE TABLE: `"main"."entry"` writes entry, and another schema is not sure (review 3, P4)', () => {
  assert.deepEqual(tablesWritten('UPDATE "main"."entry" SET fields = ? WHERE id = ?'), ['entry']);
  assert.deepEqual(tablesWritten('INSERT INTO [main].[entry] (id) VALUES (?)'), ['entry']);
  assert.deepEqual(tablesWritten('DELETE FROM `main` . `event` WHERE id = ?'), ['event']);
  assert.deepEqual(tablesWritten("UPDATE main.entry SET note = 'main'"), ['entry']);
  assert.deepEqual(tablesWritten('DELETE FROM"entry" WHERE id = ?'), ['entry']);
  assert.equal(tablesWritten('UPDATE temp.scratch SET a = 1'), null);
  assert.equal(tablesWritten('INSERT INTO "main". VALUES (1)'), null);
});

/** What a sign reading `text` with `params` is held on, on a record whose lists are `system`, `entry`, `active`, `tasks`, `projects` and the runs. */
function heldBy(text: string, ...params: string[]) {
  const lists = new Set(['system', 'entry', 'active', 'tasks', 'projects', 'session']);
  const trace = signTraceOf();
  noticeSign(trace, text, params, (w) => lists.has(w));
  return heldOn(trace, (l) => l === 'session');
}

test('A VALUE THAT IS A LIST\'S ID NAMES NO LIST unless the list column is bound to it (review 3, P3)', () => {
  /* EVERY LIST'S ROWS, read beside a word that is also a list's id: held on the rows' table, not on that one list. */
  const any = heldBy("SELECT e.id FROM event e LEFT JOIN entry n ON e.target_kind = 'entry' AND n.id = substr(e.target, 7) WHERE e.ts >= ? AND e.actor = 'system'", '2026-10-30T00:00:00.000Z');
  assert.deepEqual(any.lists, []);
  assert.ok(any.tables.includes('entry'), JSON.stringify(any));
  const bound = heldBy("SELECT id FROM entry WHERE state IN ('active', 'idle') AND kind = ?", 'system');
  assert.deepEqual(bound.lists, []);
  assert.ok(bound.tables.includes('entry'), JSON.stringify(bound));
  /* ONE LIST, BOUND: held on that list alone, by a bound value or a quoted word, in any order of parameters. */
  assert.deepEqual(heldBy('SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL', 'tasks'), { lists: ['tasks'], tables: [], head: false });
  assert.deepEqual(heldBy("SELECT id FROM entry e WHERE e.register IN (?, 'projects') AND e.state = 'active'", 'tasks'), { lists: ['projects', 'tasks'], tables: [], head: false });
  assert.deepEqual(heldBy('SELECT id FROM "main"."entry" WHERE x = ?1 AND register = ?2', 'system', 'tasks'), { lists: ['tasks'], tables: [], head: false });
  /* A SECOND READ OF THE ROWS WITH NO LIST OF ITS OWN reads any list's rows. */
  const joined = heldBy("SELECT p.title FROM entry e JOIN entry p ON p.id = json_extract(e.fields, '$.project') WHERE e.register = ?", 'tasks');
  assert.ok(joined.tables.includes('entry'), JSON.stringify(joined));
  /* A BINDING THAT NARROWS NOTHING (in what a select answers) names no list's rows alone. */
  assert.ok(heldBy("SELECT count(CASE WHEN register = 'tasks' THEN 1 END) FROM entry").tables.includes('entry'));
  /* A COMMA'S JOIN reads the rows too. */
  assert.ok(heldBy('SELECT 1 FROM event, entry WHERE entry.id = ?', 'tasks').tables.includes('entry'));
  /* A BINDING UNDER `OR`, OR ON THE KEPT SIDE OF A LEFT JOIN, narrows nothing (finish G4). */
  assert.ok(heldBy('SELECT id FROM entry WHERE register = ? OR state = ?', 'tasks', 'open').tables.includes('entry'));
  assert.ok(heldBy('SELECT a.id FROM entry a LEFT JOIN event v ON a.register = ? AND v.target = a.id', 'tasks').tables.includes('entry'));
  /* AND ONE IN A JOIN'S OWN `ON` narrows the table it joins. */
  assert.deepEqual(heldBy('SELECT v.id FROM event v LEFT JOIN entry n ON n.id = substr(v.target, 7) AND n.register = ?', 'tasks'), { lists: ['tasks'], tables: ['event'], head: true });
});

test('A WRITE WHOSE RETURNING ANSWERED NOTHING CHANGED NOTHING: the belt claiming nothing due is not a write', () => {
  const claim = "UPDATE schedule SET state = 'firing' WHERE id IN (SELECT id FROM schedule WHERE due_at <= ?) RETURNING id";
  assert.equal(wroteNothing(claim, 0), true);
  assert.equal(wroteNothing(claim, 1), false);
  assert.equal(wroteNothing('UPDATE schedule SET state = ?', 0), false, 'a write that returns nothing by its shape may still have written');
  assert.equal(wroteNothing("UPDATE event SET note = 'RETURNING'", 0), false);
});

/** The record's database, counting each statement that reads the questions. */
function counted(sql: Sql): { sql: Sql; reads: () => number } {
  let n = 0;
  const see = (text: string): void => {
    if (/^\s*(SELECT|WITH)\b/iu.test(text) && /\bFROM\s+suggestion\b/u.test(text)) n += 1;
  };
  return {
    sql: {
      exec: (text, ...params) => sql.exec(text, ...params),
      all: (text, ...params) => (see(text), sql.all(text, ...params)),
      one: (text, ...params) => (see(text), sql.one(text, ...params)),
      transactionSync: (fn) => sql.transactionSync(fn),
    },
    reads: () => n,
  };
}

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

async function asked() {
  const raw = openSqlite();
  const c = counted(raw);
  const clock = fixedClock(NOW);
  const k = await openRecord(c.sql, clock);
  const ask = (question: string, body: Record<string, unknown> = {}): { id: string } => {
    const r = k.propose({ question, body_kind: 'options', body: { ...OPTIONS, ...body } }, 'slash');
    assert.ok(r.ok, JSON.stringify(r));
    return r.value as { id: string };
  };
  const sign = (id: string): VitalSign => {
    const r = k.signs();
    assert.ok(r.ok, JSON.stringify(r));
    const s = r.value.signs.find((x) => x.sign === id);
    assert.ok(s, `${id} is not on the list`);
    return s;
  };
  return { raw, clock, k, ask, sign, reads: c.reads };
}

test('A SIGN IS HELD WHILE NOTHING IT READS IS WRITTEN, and read again at once after a write it reads', async () => {
  const r = await asked();
  r.ask('Fire the kiln on Friday?', { about: 'kiln' });
  assert.equal(r.sign('questions-by-cause').state, 'green');
  const before = r.reads();
  assert.equal(r.sign('questions-by-cause').state, 'green');
  r.clock.advance(10 * 60_000);
  assert.equal(r.sign('questions-by-cause').state, 'green');
  assert.equal(r.reads(), before, 'a sign nothing moved under was read again');
  /* THE WRITE IT READS: a second question about the kiln. */
  r.ask('Fire the kiln on Saturday?', { about: 'kiln' });
  const red = r.sign('questions-by-cause');
  assert.equal(red.state, 'red', red.said);
  assert.ok(r.reads() > before);
  r.raw.close();
});

test('A WRITE PAST THE KERNEL, WITH ITS LINE IN THE LOG, is read: a question closed as moot by the record', async () => {
  const r = await asked();
  r.ask('Fire the kiln on Friday?', { about: 'kiln' });
  const q = r.ask('Fire the kiln on Saturday?', { about: 'kiln' });
  assert.equal(r.sign('questions-by-cause').state, 'red');
  /* AS `tools-seen.ts` CLOSES ONE, through the database the kernel was opened on and not through the kernel. */
  r.raw.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ? AND status = 'open'", q.id);
  r.raw.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, 'system', 'resolve', ?, 'suggestion', 'moot', 'gone')",
    '01JZZZZZZZZZZZZZZZZZZZZZZZ',
    new Date(NOW).toISOString(),
    `suggestion:${q.id}`,
  );
  assert.equal(r.sign('questions-by-cause').state, 'green');
  r.raw.close();
});

test('A SIGN WHOSE ANSWER MOVES BY THE CLOCK is read again when it moves, with nothing written', async () => {
  const r = await asked();
  r.ask('Raise the retainer?');
  r.clock.set(NOW + 15 * DAY - HOUR);
  assert.equal(r.sign('oldest-question').state, 'green');
  const before = r.reads();
  r.clock.set(NOW + 15 * DAY - 30 * 60_000);
  assert.equal(r.sign('oldest-question').state, 'green');
  assert.equal(r.reads(), before, 'held inside its day');
  /* FIFTEEN DAYS OLD, past the line, with no write between. */
  r.clock.set(NOW + 15 * DAY + 60_000);
  const red = r.sign('oldest-question');
  assert.equal(red.state, 'red', red.said);
  assert.equal(red.said, 'The oldest open question is 15 days old.');
  r.raw.close();
});

test('A QUESTION PUT OFF COMES BACK OPEN when its time comes, and the signs over the questions say so', async () => {
  const r = await asked();
  const q = r.ask('Raise the retainer?');
  const put = r.k.decide(q.id, { defer: { until: new Date(NOW + 2 * HOUR).toISOString(), why: 'after lunch' } }, 'p_1');
  assert.ok(put.ok, JSON.stringify(put));
  assert.equal(r.sign('oldest-question').said, 'No question is waiting.');
  r.clock.advance(HOUR);
  assert.equal(r.sign('oldest-question').said, 'No question is waiting.');
  r.clock.advance(HOUR + 60_000);
  assert.equal(r.sign('oldest-question').said, 'The oldest open question was asked today.');
  r.raw.close();
});
