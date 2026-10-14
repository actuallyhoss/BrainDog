/**
 * A sealed key nobody opens is counted (AGT-D17 job 1): the figure `keys-unopened` and the tidy's finder of that name.
 *
 * WHAT WAS MEASURED BEFORE THIS. Each opening stamped its grant's `last_opened` and nothing read it, so a key sealed
 * two years ago and never opened looked the same as one opened this morning. These hold the count on a real record:
 * which keys are in it, that the figure and the finder are one number, and that the finder ASKS NOTHING, by day or by
 * night, so no question is filed for it until a later part wires one on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { BUILT_IN_FIGURES, builtInFigure, staleFigureOf } from '../src/built-in-figures.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { UNOPENED_DAYS, askOfKeysUnopened, countKeysUnopened, keysUnopened, unopenedKeys } from '../src/tidy-keys.ts';
import { causeOfFinder, finderOf, tidy, tidyHour, type TidyDeps } from '../src/tidy.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const KEYS: Declaration = {
  id: 'register.keys',
  kind: 'register',
  body: {
    id: 'keys',
    name: 'Keys',
    title: 'label',
    done: ['retired'],
    fields: [
      { id: 'label', type: 'text', required: true },
      { id: 'value', type: 'secret' },
      { id: 'state', type: 'enum', values: ['live', 'retired'], default: 'live' },
    ],
  } as never,
};

/** A list with no sealed field: its things are never keys, however old. */
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

type Grant = { sealed: number; opened?: number | null; rotated?: number | null; revoked?: boolean };

async function record(at = NOW) {
  const sql = openSqlite();
  const clock = fixedClock(at);
  const k = await openRecord(sql, clock);
  value(await k.install([KEYS, TASKS]));
  const allocate = (name: string): number => {
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    return sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name)!.n;
  };
  const deps = (): TidyDeps => ({ sql, nowMs: clock.now(), mint: ulids(() => clock.now()), allocate });
  return { sql, clock, k, deps };
}

/** A grant sealed `sealed` ms ago, last opened `opened` ms ago (or never), and the key on the Keys list that names it. */
function key(sql: NodeSql, k: Kernel, label: string, g: Grant, at = NOW): { id: string } {
  const id = `g_${label.toLowerCase().replace(/\W+/gu, '_')}`;
  /* WORKED OUT BEFORE THE INSERT, so secret-grep does not read the field's name as an opened key reaching the record. */
  const lastOpened = g.opened === undefined || g.opened === null ? null : iso(at - g.opened);
  sql.exec(
    "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at, last_opened, rotated_at, revoked_at) VALUES (?, ?, ?, 'api_token', 'hkdf', 'kek', 'kek_1', ?, ?, ?, ?)",
    id,
    label,
    `${label} account`,
    iso(at - g.sealed),
    lastOpened,
    g.rotated === undefined || g.rotated === null ? null : iso(at - g.rotated),
    g.revoked === true ? iso(at) : null,
  );
  const row = value<{ id: string }>(k.create('keys', { label }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.value', ?) WHERE id = ?", id, row.id);
  return row;
}

const figure = (k: Kernel, id = 'keys-unopened'): Reading => value<Reading>(k.metric(BUILT_IN_FIGURES[id]!));
const SIX_MONTHS = UNOPENED_DAYS * DAY;

test('a record where no list seals a value reads nothing, never nought, and the finder counts none', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  value(k.create('tasks', { name: 'Ship' }, { actor: 'p_1' }));
  assert.equal(figure(k).value, null);
  assert.equal(countKeysUnopened(sql, NOW), null);
  assert.deepEqual(keysUnopened.find(sql, NOW), { stale: 0, did: 0, ask: null });
  sql.close();
});

test('counts the keys sealed and unopened past six months, and none opened since, retired, deleted, revoked or newly sealed', async () => {
  const { sql, k } = await record();
  for (const name of ['Ship', 'Plan']) value(k.create('tasks', { name }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET created_at = ? WHERE register = 'tasks'", iso(NOW - 400 * DAY));
  assert.equal(figure(k).value, 0, 'old things on a list with no sealed field were counted');

  key(sql, k, 'Stripe', { sealed: 300 * DAY, opened: DAY });
  key(sql, k, 'Fly', { sealed: 300 * DAY, opened: 200 * DAY });
  key(sql, k, 'Resend', { sealed: 200 * DAY });
  key(sql, k, 'Sealed last month', { sealed: 30 * DAY });
  key(sql, k, 'Given a new value', { sealed: 400 * DAY, rotated: 10 * DAY });
  key(sql, k, 'Revoked', { sealed: 400 * DAY, revoked: true });
  const retired = key(sql, k, 'Retired', { sealed: 400 * DAY });
  sql.exec("UPDATE entry SET state = 'retired' WHERE id = ?", retired.id);
  const gone = key(sql, k, 'Deleted', { sealed: 400 * DAY });
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', iso(NOW), gone.id);
  value(k.create('keys', { label: 'Holds nothing' }, { actor: 'p_1' }));

  const read = figure(k);
  assert.deepEqual([read.value, read.met, read.held], [2, false, 1], 'Fly (opened before the window) and Resend (never opened) are the two');
  assert.doesNotMatch(read.why, /g_|grant|kek/u, 'the reading named a grant by its id');
  assert.deepEqual(keysUnopened.find(sql, NOW), { stale: 2, did: 0, ask: null });
  assert.equal(figure(k, 'keys-unopenable').value, 1, 'only the revoked one cannot be opened, and keys-unopenable still says so');

  const named = unopenedKeys(sql, NOW);
  assert.deepEqual(named, [
    { name: 'Resend', opens: 'Resend account', last_opened: null },
    { name: 'Fly', opens: 'Fly account', last_opened: iso(NOW - 200 * DAY).slice(0, 10) },
  ]);
  sql.close();
});

test('the edge of the window: opened a day inside it is not counted, a day outside it is', async () => {
  const { sql, k } = await record();
  key(sql, k, 'Inside', { sealed: 2 * SIX_MONTHS, opened: SIX_MONTHS - DAY });
  key(sql, k, 'Outside', { sealed: 2 * SIX_MONTHS, opened: SIX_MONTHS + DAY });
  assert.equal(figure(k).value, 1);
  assert.deepEqual(unopenedKeys(sql, NOW).map((u) => u.name), ['Outside']);
  sql.close();
});

test('the figure, the finder and its stale figure are one number', async () => {
  const { sql, k } = await record();
  key(sql, k, 'A', { sealed: 300 * DAY });
  key(sql, k, 'B', { sealed: 300 * DAY, opened: 250 * DAY });
  key(sql, k, 'C', { sealed: 300 * DAY, opened: 2 * DAY });
  const n = figure(k).value;
  assert.equal(n, 2);
  assert.equal(finderOf('keys-unopened')?.find(sql, NOW).stale, n);
  assert.equal(countKeysUnopened(sql, NOW), n);
  assert.equal(value<Reading>(k.metric(builtInFigure(staleFigureOf('keys-unopened'))!)).value, n);
  sql.close();
});

test('the moved clock: two keys sealed, one opened along the way, 181 days on the figure reads 1', async () => {
  const { sql, clock, k } = await record();
  key(sql, k, 'Opened', { sealed: 0 });
  key(sql, k, 'Never opened', { sealed: 0 });
  assert.equal(figure(k).value, 0);
  clock.advance(171 * DAY);
  /* The stamp `openGrant` writes on an opening: one more, and the time. */
  sql.exec("UPDATE grant SET opened = opened + 1, last_opened = ? WHERE label = 'Opened'", iso(clock.now()));
  clock.advance(10 * DAY);
  assert.equal(figure(k).value, 1);
  assert.deepEqual(unopenedKeys(sql, clock.now()).map((u) => u.name), ['Never opened']);
  sql.close();
});

test('the tidy runs it and files no question, by day or in the night, and writes nothing to the keys', async () => {
  const { sql, k, deps } = await record();
  key(sql, k, 'Old', { sealed: 300 * DAY });
  key(sql, k, 'Older', { sealed: 500 * DAY, opened: 400 * DAY });
  const before = sql.all('SELECT id, version, state, fields FROM entry ORDER BY id');
  const grants = sql.all('SELECT id, opened, last_opened, revoked_at FROM grant ORDER BY id');
  for (const pass of [tidy, tidyHour]) {
    const lines = sql.transactionSync(() => pass(deps(), [keysUnopened]));
    assert.deepEqual(lines, [{ finder: 'keys-unopened', stale: 2, did: 0, asked: null }]);
  }
  const filed = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion WHERE cause = ?', causeOfFinder('keys-unopened'))?.n;
  assert.equal(filed, 0, 'the finder asked a question');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')?.n, 0);
  assert.deepEqual(sql.all('SELECT id, version, state, fields FROM entry ORDER BY id'), before, 'a key was moved or changed');
  assert.deepEqual(sql.all('SELECT id, opened, last_opened, revoked_at FROM grant ORDER BY id'), grants, 'a grant was touched');
  sql.close();
});

test('the question is words only, in plain words, and names no id', () => {
  assert.deepEqual(askOfKeysUnopened(12), {
    question: '12 keys have not been opened in six months. Retire them?',
    does: "Moves them to their list's finished state. No value is destroyed: revoking one stays yours.",
  });
  assert.equal(askOfKeysUnopened(1).question, '1 key has not been opened in six months. Retire it?');
  assert.equal(keysUnopened.name, 'Sealed keys nobody has opened');
  assert.equal(BUILT_IN_FIGURES['keys-unopened']?.name, 'Sealed keys nobody has opened');
  for (const words of [keysUnopened.name ?? '', askOfKeysUnopened(3).question, askOfKeysUnopened(3).does])
    assert.doesNotMatch(words, /—|#|\brows?\b|\bentit|_/u);
});
