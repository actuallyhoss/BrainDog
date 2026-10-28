/**
 * One open arrangement per cause, and it carries the whole list.
 *
 * WHAT WAS MEASURED BEFORE THIS. A second arrangement with the cause of an open one was answered `joined` and its parts
 * were dropped: an agent that found a fourth key to ask for after filing three had to wait for the owner to answer the
 * three, or ask under another cause and put a second card in front of him. Now the open one is widened with the parts
 * it lacks, one note says so, and the owner reads one card that holds them all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { uniteArrangements, partsOf, type Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const list = (id: string, name: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([list('obligations', 'Obligations'), list('places', 'Places')]));
  return { k, sql };
}

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false, 'this was supposed to be refused');
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

const arrange = (body: Record<string, unknown>, cause = 'setup.work') => ({ question: 'Set this BrainDog up for work?', body_kind: 'arrange' as const, cause, body });
const FIRST = { why: ['They started a job this week.'], packs: { install: ['work'] }, settings: [{ pack: 'usecase-student', values: { voice_home: 'Today' } }] };
const SECOND = { why: ['They pay rent on the first.', 'They started a job this week.'], packs: { install: ['work'] }, rows: [{ register: 'obligations', fields: { what: 'Rent' } }] };

const held = (sql: NodeSql, id: string) => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as Record<string, unknown>;
const notes = (sql: NodeSql, id: string) => sql.all<{ to_v: string; note: string }>("SELECT to_v, note FROM event WHERE kind = 'note' AND target = ? ORDER BY rowid", `suggestion:${id}`).map((r) => ({ ...r }));

test('A SECOND ARRANGEMENT WITH THE CAUSE WIDENS THE OPEN ONE: its new parts are added, with one note, and one card waits', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(arrange(FIRST), 'S1'));
  const second = value<Filed>(k.propose(arrange(SECOND), 'S2'));
  assert.deepEqual({ ...second }, { id: first.id, joined: true, widened: 1 });

  const body = held(sql, first.id);
  assert.deepEqual(
    partsOf(body).map((p) => p.id),
    ['install:work', 'setting:usecase-student', 'rows:obligations'],
  );
  /* The reasons are both lists, each said once, the open one's first. */
  assert.deepEqual(body.why, ['They started a job this week.', 'They pay rent on the first.']);
  assert.deepEqual(notes(sql, first.id), [{ to_v: '1', note: 'Asked for one more part, and added it to this question.' }]);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 1);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'suggest'")!.n, 1);

  /* Accepted, the whole list is handed to the record to apply as one. */
  const out = value<{ apply?: { body: Record<string, unknown> } }>(k.decide(first.id, { decide: { option: 'accept', reason: 'All of it.' } }, 'p_owner'));
  assert.deepEqual(partsOf(out.apply!.body).map((p) => p.id), ['install:work', 'setting:usecase-student', 'rows:obligations']);
});

test('NOTHING NEW IS A PLAIN JOIN: the body stays as it was, and only another agent leaves a join note', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(arrange(FIRST), 'S1'));
  const before = held(sql, first.id);
  assert.deepEqual({ ...value<Filed>(k.propose(arrange({ why: ['Again.'], packs: { install: ['work'] } }), 'S1')) }, { id: first.id, joined: true });
  assert.deepEqual(held(sql, first.id), before);
  assert.deepEqual(notes(sql, first.id), []);
});

test('A PART THE OPEN ONE HOLDS STAYS AS IT ASKS IT, and only what is new is added', () => {
  const open = { why: ['a'], settings: [{ pack: 'usecase-student', values: { voice_home: 'Today' } }] };
  const next = { why: ['b'], settings: [{ pack: 'usecase-student', values: { voice_home: 'Week' } }], packs: { enable: ['money-core'] } };
  const union = uniteArrangements(open, next)!;
  assert.equal(union.added, 1);
  assert.deepEqual(union.body.settings, open.settings);
  assert.deepEqual(union.body.packs, { enable: ['money-core'] });
  assert.equal(uniteArrangements(open, { why: ['c'], settings: next.settings }), null);
});

test('ENTRIES KEEP POINTING AT EACH OTHER, moved past the open one', () => {
  const open = { why: ['a'], rows: [{ register: 'obligations', fields: { what: 'Rent' } }] };
  const next = { why: ['b'], rows: [{ register: 'places', fields: { what: 'Home' } }, { register: 'places', fields: { what: 'Office' }, links: { near: 0 } }] };
  const union = uniteArrangements(open, next)!;
  assert.deepEqual(union.body.rows, [open.rows[0], next.rows[0], { ...next.rows[1], links: { near: 1 } }]);
});

test('A UNION PAST THE CEILING IS REFUSED in the proposer words, and the open one is left as it was', async () => {
  const { k, sql } = await record();
  const rows = (register: string, n: number) => Array.from({ length: n }, (_, i) => ({ register, fields: { what: `${register} ${i + 1}` } }));
  const first = value<Filed>(k.propose(arrange({ why: ['Bills.'], rows: rows('obligations', 40) }), 'S1'));
  const before = held(sql, first.id);
  const no = refusal(k.propose(arrange({ why: ['Places.'], rows: rows('places', 30) }), 'S2'));
  assert.match(no.fix, /^Added to the arrangement already waiting for this, it would be too much\. /u);
  assert.doesNotMatch(no.fix, /—/u);
  assert.deepEqual(held(sql, first.id), before);
  assert.deepEqual(notes(sql, first.id), []);
});

test('THREE OPEN ARRANGEMENTS DO NOT STOP A FOURTH WITH ONE OF THEIR CAUSES: it widens that one', async () => {
  const { k, sql } = await record();
  const ids = ['one', 'two', 'three'].map((c) => value<Filed>(k.propose(arrange(FIRST, `setup.${c}`), 'S1')).id);
  assert.equal(refusal(k.propose(arrange(SECOND, 'setup.four'), 'S1')).at, 'body_kind');
  assert.deepEqual({ ...value<Filed>(k.propose(arrange(SECOND, 'setup.two'), 'S2')) }, { id: ids[1], joined: true, widened: 1 });
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 3);
});
