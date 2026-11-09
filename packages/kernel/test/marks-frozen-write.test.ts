/**
 * The mark rules on the write path and the figure through the record, where `marks-unknown.test.ts` holds the
 * two functions by themselves: a key's write that would change or clear a mark naming a picture is refused with
 * `MARK_IS_FROZEN` while a person's goes through (his word of 4 November), a word that draws nothing takes one more
 * write, and `marks-unknown` is read by the record's own `metric`, which is what a stat block calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { builtInFigure } from '../src/built-in-figures.ts';
import { openRecord, type Declaration, type Reading } from '../src/index.ts';
import { MARK_IS_FROZEN, MARK_IS_FROZEN_SAYS } from '../src/marks.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

type Out<T> = { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out<T>;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    identity: { mark: 'mark' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'mark', type: 'text' },
    ],
  } as never,
};

const W = { actor: 'p_1' };
/* AN AGENT'S KEY, whose writes keep a chosen mark as it is. */
const KEY = { actor: 'agent:claude', principal: { kind: 'token' as const, token: 'tok_1' } };

test('A MARK THAT NAMES A PICTURE TAKES NO CHANGE AND NO CLEAR FROM A KEY, and the rest of the row is still written', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS]));
  const row = value<{ id: string }>(k.create('things', { name: 'BrainDog', mark: 'rocket' }, W));

  for (const next of ['cake', 'koala', '', null]) {
    const out = k.update('things', row.id, { mark: next } as never, KEY) as Out<unknown>;
    assert.equal(out.ok, false, `rocket to ${String(next)} went through`);
    assert.deepEqual([out.refusal?.code, out.refusal?.fix, out.refusal?.at], [MARK_IS_FROZEN, MARK_IS_FROZEN_SAYS, 'mark']);
  }
  /* WHAT IS ALREADY THERE, SENT BACK, IS NO CHANGE: a form that sends the whole row is not refused. */
  const kept = value<{ fields: Record<string, unknown> }>(k.update('things', row.id, { name: 'BrainDog 2', mark: 'rocket' }, KEY));
  assert.deepEqual([kept.fields.name, kept.fields.mark], ['BrainDog 2', 'rocket']);
  /* A PERSON CHANGES IT, where it is drawn. */
  assert.equal(value<{ fields: Record<string, unknown> }>(k.update('things', row.id, { mark: 'cake' }, W)).fields.mark, 'cake');
  sql.close();
});

test('A WORD THAT DRAWS NOTHING TAKES ONE MORE WRITE, and is held once it names a picture', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS]));
  const row = value<{ id: string }>(k.create('things', { name: 'Driftwood', mark: 'koala' }, W));
  const bare = value<{ id: string }>(k.create('things', { name: 'Kiln' }, W));

  assert.equal(value<{ fields: Record<string, unknown> }>(k.update('things', row.id, { mark: 'rocket' }, KEY)).fields.mark, 'rocket');
  assert.equal((k.update('things', row.id, { mark: 'cake' }, KEY) as Out<unknown>).refusal?.code, MARK_IS_FROZEN);
  /* AN EMPTY MARK WAS NEVER A CHOICE, so its first picture goes in. */
  assert.equal(value<{ fields: Record<string, unknown> }>(k.update('things', bare.id, { mark: 'gift' }, W)).fields.mark, 'gift');
  sql.close();
});

test('MARKS-UNKNOWN IS READ BY THE RECORD ITSELF, as a stat block reads it', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS]));
  const decl = builtInFigure('marks-unknown');
  assert.ok(decl, 'no such figure');
  value(k.create('things', { name: 'BrainDog', mark: 'rocket' }, W));
  const driftwood = value<{ id: string }>(k.create('things', { name: 'Driftwood', mark: 'koala' }, W));
  value(k.create('things', { name: 'Portage', mark: 'paw' }, W));
  assert.equal(value<Reading>(k.metric(decl)).value, 2);

  value(k.update('things', driftwood.id, { mark: 'cake' }, W));
  assert.equal(value<Reading>(k.metric(decl)).value, 1);
  sql.close();
});
