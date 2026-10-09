/**
 * The readers of sources that are no list's, by their word (`sourceReaders` in `metrics.ts`), and what each owes a page.
 *
 * WHAT WAS MEASURED BEFORE IT: the sources were an `if` chain a later unit had to edit in the middle; `signs-red` at 0
 * read `held: 0`, which a page takes for "nothing to read", so Health hid the one reading it exists to show; and a read
 * of 101 ids bound 101 values, past the 100 the Durable Object takes, so it answered INTERNAL on the real runtime.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guarded } from '@braindog/ports';

import { readVitals } from '../src/built-in-figures.ts';
import { markDoor } from '../src/door.ts';
import { holdsNothing, type Drawable } from '../src/drawn.ts';
import { evaluateMetric, pointedRows, sourceReaders, type MetricDecl } from '../src/metrics.ts';
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const figure = (source: string, more: Record<string, unknown> = {}): MetricDecl =>
  ({ metric: 'a-figure', source, value: { count: 'id' }, target: { lte: 0 }, window: '7d', compare: 'none', format: 'int', ...more }) as MetricDecl;

test('EVERY SOURCE THAT IS NO LIST’S HAS ONE READER BY ITS WORD, the door’s among them', () => {
  assert.deepEqual(Object.keys(sourceReaders()).sort(), [
    'governance.open',
    'handoffs.open',
    'record.door',
    'record.key-scan',
    'record.keys',
    'record.lists',
    'record.paths',
    'record.places',
    'record.rates',
    'record.signs',
    'record.vitals',
    'sessions.working',
  ]);
});

test('A SOURCE WORD NO READER HOLDS IS REFUSED BY NAME, with the words this build reads', () => {
  const r = evaluateMetric(openSqlite(), figure('record.dor'), { nowMs: NOW, schemaOf: () => null });
  assert.equal(r.ok, false);
  const refusal = (r as { refusal: { code: string; fix: string; at?: string } }).refusal;
  assert.equal(refusal.code, 'SOURCE_UNKNOWN');
  assert.equal(refusal.at, 'source');
  assert.match(refusal.fix, /record\.dor is not a source this build reads/u);
  assert.match(refusal.fix, /record\.door/u, 'the refusal does not say which words are read');
  assert.doesNotMatch(refusal.fix, /—/u);
});

test('A ZERO IS A READING: signs-red and green-days at 0 hold something, and a stat of them is drawn', () => {
  const sql = openSqlite();
  const red = value<{ value: number | null; held: number }>(
    readVitals(sql, { nowMs: NOW, tz: 'UTC', signs: () => [{ sign: 'a', state: 'green' } as never] }, figure('record.vitals', { metric: 'signs-red', vitals: 'red-now' })),
  );
  assert.deepEqual([red.value, red.held], [0, 1], 'signs-red at 0 read as nothing to read, so a page hid it');
  const none = value<{ value: number | null; held: number }>(readVitals(sql, { nowMs: NOW, tz: 'UTC', signs: () => [] }, figure('record.vitals', { vitals: 'red-now' })));
  assert.deepEqual([none.value, none.held], [null, 0], 'with nothing to judge it says nothing, never nought');

  const stat = { kind: 'stat', rows: [], refusals: [], readings: [{ metric: 'signs-red', reading: red }] } as unknown as Drawable;
  assert.equal(holdsNothing(stat), false, 'a stat of signs-red at 0 was taken from the page');
  const quiet = { kind: 'stat', rows: [], refusals: [], readings: [{ metric: 'signs-red', reading: none }] } as unknown as Drawable;
  assert.equal(holdsNothing(quiet), true, 'a stat of signs-red with nothing to judge drew a number');
  sql.close();
});

test('RECORD.DOOR READS ONE OF THE DOOR’S SIGNS OVER THE FIGURE’S WINDOW, and nothing with no session there', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const ctx = { nowMs: NOW, schemaOf: () => null };
  const internal = figure('record.door', { metric: 'agent-door-internal', sign: 'internal' });

  const quiet = value<{ value: number | null; held: number }>(evaluateMetric(sql, internal, ctx));
  assert.deepEqual([quiet.value, quiet.held], [null, 0], 'no INTERNAL answers over a door nobody reached read green');

  markDoor(sql, 'S1', { kind: 'hello', build: '1.4.0' }, NOW - 2 * DAY);
  markDoor(sql, 'S1', { kind: 'called', n: 3 }, NOW - 2 * DAY + MIN);
  markDoor(sql, 'S2', { kind: 'hello', build: '1.3.0' }, NOW - 10 * DAY);
  const none = value<{ value: number | null; held: number; met: boolean | null }>(evaluateMetric(sql, internal, ctx));
  assert.deepEqual([none.value, none.held, none.met], [0, 1, true], 'a door reached with no INTERNAL answer is a true nought');
  assert.equal(value<{ value: number }>(evaluateMetric(sql, figure('record.door', { sign: 'calls' }), ctx)).value, 3);
  assert.equal(value<{ value: number }>(evaluateMetric(sql, figure('record.door', { sign: 'hello', window: '30d' }), ctx)).value, 2, 'the window is the figure’s own');
  const behind = figure('record.door', { sign: 'behind', window: '30d' });
  assert.equal(value<{ value: number | null }>(evaluateMetric(sql, behind, ctx)).value, null, 'behind with no build said a number');
  assert.equal(value<{ value: number }>(evaluateMetric(sql, behind, { ...ctx, build: '1.4.0' })).value, 1);

  const wrong = evaluateMetric(sql, figure('record.door', { sign: 'nope' }), ctx);
  assert.equal(wrong.ok, false);
  assert.equal((wrong as { refusal: { at?: string } }).refusal.at, 'sign');
  sql.close();
});

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
    ],
  },
};

test('TWO HUNDRED VALUES ARE ONE BOUND ARRAY, so a read of them stays inside the Durable Object’s 100', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS]));
  const ids = Array.from({ length: 200 }, (_, i) => value<{ id: string }>(k.create('things', { name: `Project ${String(i)}` }, { actor: 'p_1' })).id);
  const named = pointedRows(guarded(sql), 'things', ids);
  assert.equal(named.size, 200);
  assert.equal(named.get(ids[199]!)?.title, 'Project 199');
  sql.close();
});
