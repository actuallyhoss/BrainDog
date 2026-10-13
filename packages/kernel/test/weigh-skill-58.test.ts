/**
 * What is hard to undo, and what only looked it (batch 58, put right in batch 60, and a change lowered in batch 62).
 *
 * `costOf` gave `undo` to any rowset with an update in it, and every card's main button warned of it. The record keeps
 * the way back for that: an edit's history line holds what the row said before, and Put back writes it in again.
 *
 * Batch 58 lowered a replaced declaration too, on the grounds that the old version stays beside its successor, and
 * batch 60 took that back, because a plan for such a decision had no step in it. SINCE BATCH 62 PUT BACK RESTORES A
 * DECLARATION AN ACCEPTED CHANGE REPLACED (`undo.ts`, `declaredIn`): the plan holds a `declare` step, which the test
 * near the end of this file reads off `undoPlan` itself, so a `change` with a `from` under it is `shape`. Only a
 * retype or a narrowing with a `from` stays `undo`, because it rewrites the answers under the field and the undo
 * leaves it. An update to a field whose value the history withholds is `undo` still, which Put back says it has no
 * copy of. A pack turned off and money moved are the band as they were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { COST_RANK_SQL, COST_SQL, MANY_ROWS, costOf, costRank, costRows } from '../src/weigh.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const SKILL_BEFORE = { id: 'skill.weekly_review', kind: 'skill', body: { name: 'Weekly review', text: 'Read the week, then say what moved.' } };
const SKILL_AFTER = { id: 'skill.weekly_review', kind: 'skill', body: { name: 'Weekly review', text: 'Read the week, say what moved, and name one thing to drop.' } };
const SKILL_REWORDED = { declaration_id: 'skill.weekly_review', from: SKILL_BEFORE, to: SKILL_AFTER, from_version: 3 };

const fee = { amount: 12_500, currency: 'EGP' };

test('a skill’s wording changed is put back by the undo, so it is the shape and not hard to undo', () => {
  assert.equal(costOf('change', SKILL_REWORDED), 'shape');
  /* A NEW DECLARATION REPLACES NOTHING, so there is nothing to restore and it is the band it was. */
  assert.equal(costOf('change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER }), 'shape');
  assert.equal(costOf('change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER, from: null }), 'shape');
});

test('only a retype or a narrowing over a declaration that exists is hard to undo, and the same shape over none is not', () => {
  const field = { id: 'owner', type: 'text', label: 'Owner' };
  for (const to of [{ add: { fields: [field] } }, { retire: { fields: ['owner'] } }, { retype: { field: 'owner', type: 'ref' } }, { narrow: { field: 'owner', required: true } }]) {
    const hard = 'retype' in to || 'narrow' in to;
    assert.equal(costOf('change', { declaration_id: 'register.tasks', from: { id: 'register.tasks' }, to }), hard ? 'undo' : 'shape', JSON.stringify(to));
    assert.equal(costOf('change', { declaration_id: 'register.tasks', to }), 'shape', JSON.stringify(to));
  }
});

test('a pack turned off is still hard to undo, alone or as one part of an arrangement', () => {
  assert.equal(costOf('pack', { disable: 'money' }), 'undo');
  assert.equal(costOf('arrange', { why: ['because'], packs: { disable: ['money'] } }), 'undo');
  assert.equal(costOf('pack', { enable: 'money' }), 'shape');
  assert.ok(costRank(costOf('pack', { disable: 'money' })) < costRank(costOf('change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER })));
});

test('a row changed is put back from its history, so it weighs what a row added weighs', () => {
  const update = { at: 'tasks#3', version: 2, patch: { title: 'Call the bank' } };
  assert.equal(costOf('rowset', { register: 'tasks', rows: [update] }), 'rows');
  assert.equal(costOf('rowset', { register: 'tasks', rows: [{ fields: { title: 'One' } }, update] }), 'rows');
  /* A ROW REMOVED IS KEPT AND MARKED, and Put back restores it, so it is not the dearer band either. */
  assert.equal(costOf('rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { deleted_at: '2026-10-13T09:00:00.000Z' } }] }), 'rows');
  /* AND MANY OF THEM AT ONCE IS STILL THE EVENT IT WAS. */
  assert.equal(costOf('rowset', { register: 'tasks', rows: Array.from({ length: MANY_ROWS }, () => update) }), 'shape');
});

test('money moved is hard to undo, in a new row or in a change to one', () => {
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee }] }), 'undo');
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee } }] }), 'undo');
  /* ONE SUCH ROW AMONG MANY IS ENOUGH: a rowset lands whole. */
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'A' }, { title: 'B' }, { title: 'Rent', fee }] }), 'undo');
  /* A FIGURE THAT IS NOT MONEY IS NOT: an amount with no currency, or a currency that is not three capitals. */
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500 } }] }), 'rows');
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500, currency: 'egp' } }] }), 'rows');
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12.5, currency: 'EGP' } }] }), 'rows');
  /* AN UPDATE WITH NO PATCH WRITES NOTHING, whatever else it carries. */
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ at: 'bills#2', fee }] }), 'rows');
});

const CASES: [string, unknown][] = [
  ['change', SKILL_REWORDED],
  ['change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER }],
  ['change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER, from: null }],
  ['change', { from: false, to: SKILL_AFTER }],
  ['change', { from: 0, to: SKILL_AFTER }],
  ['change', { from: '', to: SKILL_AFTER }],
  ['change', { from: {}, to: SKILL_AFTER }],
  ['change', { from: 'text', to: { retire: { fields: ['owner'] } } }],
  ['change', { from: [1], to: { retype: { field: 'owner', type: 'ref' } } }],
  ['pack', { disable: 'money' }],
  ['pack', { enable: 'money' }],
  ['arrange', { why: ['because'], packs: { disable: ['money'] } }],
  ['rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { title: 'Call the bank' } }] }],
  ['rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { deleted_at: '2026-10-13T09:00:00.000Z' } }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee: null } }] }],
  ['rowset', { register: 'tasks', rows: Array.from({ length: MANY_ROWS }, () => ({ at: 'tasks#3', patch: {} })) }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee } }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'A' }, 'bills#2', null, { title: 'Rent', fee }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500 } }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500, currency: 'egp' } }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12.5, currency: 'EGP' } }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', fee }] }],
  ['rowset', { register: 'bills', rows: [{ at: null, patch: { fee } }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', patch: [fee] }] }],
  ['rowset', { register: 'bills', rows: { title: 'Rent', fee } }],
  ['rowset', { register: 'bills', rows: [[fee]] }],
];

test('COST_SQL and costOf give one band for each of these, so the count beside the queue agrees with its cards', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq))');
  for (const [kind, body] of CASES) {
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    const want = costOf(kind, body);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, `${kind} ${JSON.stringify(body).slice(0, 80)}`);
  }
  sql.close();
});

test('the SQL says what the tests above say, read off the table and not off costOf', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (id INTEGER PRIMARY KEY, body_kind TEXT, body TEXT)');
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq))');
  const put = (kind: string, body: unknown) => sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
  put('change', SKILL_REWORDED);
  put('pack', { disable: 'money' });
  put('rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { title: 'Call the bank' } }] });
  put('rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee } }] });
  const said = sql.all<{ cost: string }>(`SELECT ${COST_SQL} AS cost FROM suggestion ORDER BY id`).map((r) => r.cost);
  assert.deepEqual(said, ['shape', 'undo', 'rows', 'undo']);
  sql.close();
});

/* ── a value the history withholds (batch 60) ── */

const keysList = (fields: unknown): string => JSON.stringify({ id: 'keys', name: 'Keys', title: 'name', fields });

/** `[band, body]`: what an update to the Keys list weighs, read with the list's declarations beside it. */
const WITHHELD: [string, unknown][] = [
  ['undo', { register: 'keys', rows: [{ at: 'keys#1', version: 1, patch: { pin: '9999' } }] }],
  ['undo', { register: 'keys', rows: [{ at: 'keys#1', version: 1, patch: { name: 'Door', hint: 'the old street' } }] }],
  ['undo', { register: 'keys', rows: [{ at: 'keys#1', version: 1, patch: { fees: [] } }] }],
  ['undo', { register: 'keys', rows: [{ at: 'keys#1', version: 1, patch: { pin: null } }] }],
  ['undo', { register: 'keys', rows: [{ name: 'Gate' }, { at: null, patch: { pin: '9999' } }] }],
  /* A FIELD THE HISTORY SHOWS, a row that is new, and a row removed: each has its way back. */
  ['rows', { register: 'keys', rows: [{ at: 'keys#1', version: 1, patch: { name: 'Front door' } }] }],
  ['rows', { register: 'keys', rows: [{ name: 'Gate', pin: '1234' }] }],
  ['rows', { register: 'keys', rows: [{ at: 'keys#1', version: 1, patch: { deleted_at: '2026-10-13T09:00:00.000Z' } }] }],
  /* ANOTHER LIST'S FIELD OF THE SAME NAME IS ITS OWN, and a body that names no list names no field. */
  ['rows', { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { pin: '9999' } }] }],
  ['rows', { register: ['keys'], rows: [{ at: 'keys#1', patch: { pin: '9999' } }] }],
  ['rows', { rows: [{ at: 'keys#1', patch: { pin: '9999' } }] }],
  ['rows', { register: 'keys', rows: [{ at: 'keys#1', patch: ['pin'] }, 'pin', null, [{ pin: 1 }]] }],
  ['rows', { register: 'keys', rows: [{ at: 'keys#1', pin: '9999' }] }],
  ['rows', { register: 'broken', rows: [{ at: 'broken#1', patch: { pin: '9999' } }] }],
];

test('a row changed in a field the history withholds is hard to undo, and COST_SQL says so with costOf', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq))');
  /* VERSION 1 TYPED `pin` SECRET AND VERSION 2 DROPPED IT: the rows written under version 1 hold it still. */
  sql.exec("INSERT INTO declaration VALUES ('register.keys', 1, 'register', ?, 0, '2026-10-01T00:00:00.000Z')", keysList([{ id: 'name', type: 'text' }, { id: 'pin', type: 'secret' }]));
  sql.exec(
    "INSERT INTO declaration VALUES ('register.keys', 2, 'register', ?, 0, NULL)",
    keysList([{ id: 'name', type: 'text' }, { id: 'hint', type: 'text', redact: true }, { id: 'fees', type: 'list', of: 'money' }, 'pin', { type: 'secret' }]),
  );
  sql.exec("INSERT INTO declaration VALUES ('register.tasks', 1, 'register', ?, 0, NULL)", JSON.stringify({ id: 'tasks', fields: [{ id: 'pin', type: 'text' }] }));
  /* A DECLARATION THIS BUILD CANNOT READ NAMES NO FIELD, and does not stop the queue drawing. */
  sql.exec("INSERT INTO declaration VALUES ('register.broken', 1, 'register', 'not json', 0, NULL)");
  sql.exec("INSERT INTO declaration VALUES ('register.broken', 2, 'register', ?, 0, NULL)", JSON.stringify({ id: 'broken', fields: { pin: { id: 'pin', type: 'secret' } } }));

  const rows = costRows(sql);
  assert.deepEqual([...rows.withheld('keys')].sort(), ['fees', 'hint', 'pin']);
  assert.deepEqual(rows.withheld('tasks'), []);
  for (const [want, body] of WITHHELD) {
    const said = JSON.stringify(body).slice(0, 90);
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', 'rowset', JSON.stringify(body));
    assert.equal(costOf('rowset', body, rows), want, said);
    assert.equal(sql.one<{ cost: string }>(`SELECT ${COST_SQL} AS cost FROM suggestion`)?.cost, want, `as SQL: ${said}`);
  }
  /* WITHOUT THE RECORD ONLY THE BODY IS WEIGHED, and a body does not say which of its fields is withheld. */
  assert.equal(costOf('rowset', WITHHELD[0]![1]), 'rows');
  sql.close();
});

/* ── what Put back does with each, read off the record itself (batch 60) ── */

const NOW = Date.UTC(2026, 9, 13, 9);
const OWNER = { actor: 'p_owner' };

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, out.ok ? '' : fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const NOTES_RENAMED: Declaration = { ...NOTES, body: { ...(NOTES.body as object), name: 'Jottings' } as never };

const KEYS: Declaration = {
  id: 'register.keys',
  kind: 'register',
  body: {
    id: 'keys',
    name: 'Keys',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'pin', type: 'text', redact: true },
    ],
  } as never,
};

type Plan = { say: string; lines: string[]; steps: { do?: string }[]; skipped: { why: string }[] };
type Decided = { decision: string; install?: Declaration };

test('PUT BACK ON A DECIDED CHANGE HAS A STEP THAT RESTORES THE DECLARATION, which is why replacing one is the shape', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([NOTES]));
  const body = { declaration_id: 'register.notes', from: NOTES, to: NOTES_RENAMED };
  const asked = value<{ id: string }>(k.propose({ question: 'Call the list Jottings?', body_kind: 'change', body }, OWNER));

  /* THE CARD AND THE COUNT BESIDE THE QUEUE BOTH SAY SO, from the body as the record stored it. */
  const stored = sql.one<{ body: string; cost: string }>(`SELECT body, ${COST_SQL} AS cost FROM suggestion WHERE id = ?`, asked.id)!;
  assert.equal(stored.cost, 'shape');
  assert.equal(costOf('change', JSON.parse(stored.body), costRows(sql)), 'shape');

  const done = value<Decided>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  /* THE DECISION HANDS THE DECLARATION BACK FOR ITS CALLER TO INSTALL, as the host does on a yes. */
  assert.ok(done.install, 'an accepted change names what to install');
  value(await k.install([done.install]));
  const live = () => sql.all<{ version: number; name: string; superseded: number }>(
    "SELECT version, json_extract(body, '$.name') AS name, superseded_at IS NOT NULL AS superseded FROM declaration WHERE id = 'register.notes' ORDER BY version",
  ).map((r) => ({ ...r }));
  const after = live();
  assert.deepEqual(after, [{ version: 1, name: 'Notes', superseded: 1 }, { version: 2, name: 'Jottings', superseded: 0 }], 'the old version is kept, and it is not the live one');

  /* THE PLAN HOLDS THE STEP THAT RESTORES VERSION 1 (batch 62). The day it does not, `costOf` and `COST_SQL` go back
     to 'undo' for a change. */
  const plan = value<Plan>(k.undoPlan({ decision: done.decision }));
  assert.deepEqual(plan.steps.map((s) => s.do), ['declare'], 'the plan restores the declaration');
  assert.deepEqual(plan.lines, ['Puts the list "Jottings" back to how it read before this change, as "Notes".']);
  assert.deepEqual(live(), after, 'and planning it moved nothing');
  sql.close();
});

test('PUT BACK LEAVES A WITHHELD VALUE AS IT IS, and the question that changed it was weighed hard to undo', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([KEYS]));
  const key = value<Entry>(k.create('keys', { name: 'Door', pin: '1234' }, OWNER));
  const ask = (patch: Record<string, unknown>) => {
    const row = k.get(key.id)!;
    const body = { register: 'keys', rows: [{ at: 'keys#1', version: row.version, patch }] };
    const asked = value<{ id: string }>(k.propose({ question: 'Change the door key?', body_kind: 'rowset', body }, OWNER));
    const stored = sql.one<{ body: string; cost: string }>(`SELECT body, ${COST_SQL} AS cost FROM suggestion WHERE id = ?`, asked.id)!;
    assert.equal(costOf('rowset', JSON.parse(stored.body), costRows(sql)), stored.cost, 'the card and the count agree');
    const done = value<Decided>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
    return { cost: stored.cost, plan: value<Plan>(k.undoPlan({ decision: done.decision })) };
  };

  const pin = ask({ pin: '9999' });
  assert.equal(pin.cost, 'undo');
  assert.deepEqual(pin.plan.steps, [], 'the earlier pin is not in the history to write in again');
  assert.equal(pin.plan.skipped.length, 1);

  /* THE NAME BESIDE IT IS SHOWN IN THE HISTORY, so the same question about it has its way back. */
  const name = ask({ name: 'Front door' });
  assert.equal(name.cost, 'rows');
  assert.equal(name.plan.steps.length, 1);
  assert.deepEqual(name.plan.skipped, []);
  sql.close();
});
