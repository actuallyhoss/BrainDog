/**
 * The tidy as numbers (AGT-C18 job b): how many things are stale now, and how many the record cleared this week.
 *
 * WHAT WAS MEASURED BEFORE THIS. "how good is braindog's mcp at cleaning up stale stuff?" (D40.10) had no number. The
 * finders counted, and nothing read them: no figure, so no tile, no lead note and no vital sign could say it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ulids } from '../src/ids.ts';
import { openRecord } from '../src/index.ts';
import { BUILT_IN_FIGURES, RECORD_TIDY, builtInFigure, readTidy, staleFigureOf } from '../src/built-in-figures.ts';
import { TIDY_LINE_DDL, finders, registerFinder, staleNow, tidied, tidyHour, type TidyDeps } from '../src/tidy.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const DAY = 86_400_000;
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const day = (ms: number): string => ago(ms).slice(0, 10);

async function record(): Promise<{ sql: NodeSql; deps: TidyDeps }> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const mint = ulids(() => NOW);
  const allocate = (name: string): number => {
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    return sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name)!.n;
  };
  return { sql, deps: { sql, nowMs: NOW, mint, allocate } };
}

let planted = 7000;
/** One run waiting with a step, left `left` ago, written straight into the table the finders read. */
function step(sql: NodeSql, left: number): void {
  const seq = ++planted;
  const at = ago(left);
  sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, 'session', ?, ?, 'handoff', 1, ?, ?)",
    `RUN${seq}`,
    seq,
    JSON.stringify({ doing: `Run ${seq}`, state: 'handoff', started: at, last_seen: at, next: 'Ship it', next_at: at }),
    at,
    at,
  );
}

const question = (sql: NodeSql, asked: number): void =>
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'options', '{}', 'open', 'p_owner', ?)",
    `SGQ${++planted}`,
    ago(asked),
  );

/** One kept line, as the hourly pass writes it. */
const kept = (sql: NodeSql, finder: string, back: number, did: number): void => {
  sql.exec(TIDY_LINE_DDL);
  sql.exec('INSERT INTO tidy_line (finder, day, stale, did, low, at) VALUES (?, ?, 0, ?, 0, ?)', finder, day(back * DAY), did, ago(back * DAY));
};

const value = (sql: NodeSql, id: string): number | null => {
  const decl = builtInFigure(id);
  assert.ok(decl, `no figure called ${id}`);
  assert.equal(decl.source, RECORD_TIDY);
  const read = readTidy(sql, { nowMs: NOW }, decl);
  assert.ok(read.ok, id);
  return read.value.value;
};

/** Two steps left over thirty days ago, one question open fifteen days, and things that are not stale beside them. */
function stale(sql: NodeSql): void {
  step(sql, 31 * DAY);
  step(sql, 45 * DAY);
  step(sql, 2 * DAY); // still fresh
  question(sql, 15 * DAY);
  question(sql, 3 * DAY); // not old
}

test('a fresh record: nothing stale, nothing tidied, and both figures read 0', async () => {
  const { sql } = await record();
  assert.equal(staleNow(sql, NOW), 0);
  assert.equal(tidied(sql, NOW, 7), 0);
  assert.equal(value(sql, 'gone-stale'), 0);
  assert.equal(value(sql, 'tidied-week'), 0);
  for (const f of finders()) assert.equal(value(sql, staleFigureOf(f.id)), 0, f.id);
});

test('staleNow is the sum of every finder\'s stale, and a list of finders narrows it', async () => {
  const { sql } = await record();
  stale(sql);
  assert.equal(staleNow(sql, NOW), 3);
  assert.equal(staleNow(sql, NOW), finders().reduce((n, f) => n + f.find(sql, NOW).stale, 0));
  assert.equal(staleNow(sql, NOW, finders().filter((f) => f.id === 'steps-old')), 2);
  assert.equal(staleNow(sql, NOW, []), 0);
});

test('tidied is the sum of did over the days asked for, read from the kept lines', async () => {
  const { sql } = await record();
  kept(sql, 'steps-old', 0, 2);
  kept(sql, 'runs-stopped', 0, 1);
  kept(sql, 'steps-old', 3, 4);
  kept(sql, 'runs-stopped', 6, 5);
  kept(sql, 'steps-old', 7, 100); // the eighth day back
  kept(sql, 'steps-old', 30, 100);
  assert.equal(tidied(sql, NOW, 7), 12);
  assert.equal(tidied(sql, NOW, 1), 3);
  assert.equal(tidied(sql, NOW), 12, 'a week when no days are said');
  assert.equal(tidied(sql, NOW, 7, 'steps-old'), 6);
  assert.equal(tidied(sql, NOW, 7, 'nothing'), 0);
});

test('neither read writes: no table is made, no line is kept and no question is filed', async () => {
  const { sql } = await record();
  stale(sql);
  const counts = () => [
    sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')?.n,
    sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n,
    sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'tidy_line'")?.n,
  ];
  const before = counts();
  staleNow(sql, NOW);
  tidied(sql, NOW, 7);
  value(sql, 'gone-stale');
  value(sql, 'tidied-week');
  assert.deepEqual(counts(), before);
  assert.equal(before[2], 0);
});

test('the figures are declared, one a finder, and read the numbers the finders and the kept lines hold', async () => {
  const { sql, deps } = await record();
  stale(sql);
  assert.ok(Object.hasOwn(BUILT_IN_FIGURES, 'gone-stale'));
  assert.ok(Object.hasOwn(BUILT_IN_FIGURES, 'tidied-week'));
  assert.equal(value(sql, 'gone-stale'), staleNow(sql, NOW));
  assert.equal(value(sql, 'gone-stale'), 3);
  for (const f of finders()) {
    const decl = builtInFigure(staleFigureOf(f.id));
    assert.ok(decl, f.id);
    assert.equal(decl.metric, `stale-${f.id}`);
    assert.doesNotMatch(decl.name, /-|#|\bfinder\b/, `${f.id} is named in plain words`);
    assert.equal(value(sql, staleFigureOf(f.id)), f.find(sql, NOW).stale, f.id);
  }
  assert.equal(value(sql, 'stale-steps-old'), 2);
  assert.equal(value(sql, 'stale-questions-old'), 1);
  assert.equal(builtInFigure('stale-nothing-here'), null);
  assert.equal(builtInFigure('stale-'), null);

  /* The hourly pass keeps today's line, and the week's figure reads it with the days before. */
  kept(sql, 'steps-old', 2, 4);
  tidyHour(deps);
  assert.equal(value(sql, 'tidied-week'), tidied(sql, NOW, 7));
  assert.equal(value(sql, 'tidied-week'), 4);
});

test('a target of none stale: met at 0, missed above it, and the week\'s count is never judged', async () => {
  const { sql } = await record();
  const none = readTidy(sql, { nowMs: NOW }, builtInFigure('gone-stale')!);
  assert.ok(none.ok);
  assert.equal(none.value.met, true);
  stale(sql);
  const some = readTidy(sql, { nowMs: NOW }, builtInFigure('gone-stale')!);
  assert.ok(some.ok);
  assert.equal(some.value.met, false);
  const week = readTidy(sql, { nowMs: NOW }, builtInFigure('tidied-week')!);
  assert.ok(week.ok);
  assert.equal(week.value.met, null);
});

test('a finder registered later has its figure too, named by its own words', async () => {
  const { sql } = await record();
  registerFinder({ id: 'figures-test-extra', name: 'Things only this test counts', find: () => ({ stale: 5, did: 0, ask: null }) });
  const decl = builtInFigure('stale-figures-test-extra');
  assert.equal(decl?.name, 'Things only this test counts');
  assert.equal(value(sql, 'stale-figures-test-extra'), 5);
  assert.equal(value(sql, 'gone-stale'), 5);
});

test('a finder that cannot count reads nothing in its own figure, never a nought, and the total still adds the others', async () => {
  const { sql } = await record();
  registerFinder({
    id: 'figures-test-broken',
    find: () => {
      throw new Error('a finder that cannot count');
    },
  });
  assert.equal(value(sql, 'stale-figures-test-broken'), null);
  const read = readTidy(sql, { nowMs: NOW }, builtInFigure('stale-figures-test-broken')!);
  assert.ok(read.ok);
  assert.equal(read.value.held, 0);
  assert.equal(value(sql, 'gone-stale'), 5, 'the finder the test above registered is still counted');
});
