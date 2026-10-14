/**
 * The things held twice, counted by the tidy (AGT-C18's `rows-same`, "C13's clashes").
 *
 * WHAT WAS MEASURED BEFORE THIS. A list declaring `same:` said "3 skills are here twice" above itself, and the tidy
 * counted none of it: "Things gone stale" on the Agents page and `braindog tidy` never said a skill or a key was held
 * twice. These hold the count on a real record whose twins were written past the door, as a record from before `same:`
 * holds them: a pair counts 1, a list with no `same:` counts nothing, a deleted or finished row is not here, and the
 * finder ASKS NOTHING and writes nothing, by day or in the night.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { OWNER as PERSON, PROJECTS as NAMES } from '../../../fixtures/names.ts';
import { builtInFigure, staleFigureOf } from '../src/built-in-figures.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel, type Reading, type WriteContext } from '../src/index.ts';
import { heldTwiceLine, rowsSame, rowsSameLine, twiceHref } from '../src/tidy-same.ts';
import { causeOfFinder, finderOf, finders, staleNow, tidy, tidyHour, type TidyDeps } from '../src/tidy.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const BY: WriteContext = { actor: `p_${PERSON.handle}` };

const reg = (body: Record<string, unknown>): Declaration => ({ id: `register.${String(body.id)}`, kind: 'register', body }) as Declaration;

/* A list that says what makes two of its things one, with a finished state a fold moves a twin to. */
const SKILLS = reg({
  id: 'skills',
  name: 'Skills',
  one: 'skill',
  title: 'name',
  state: 'state',
  done: ['retired'],
  same: { fields: ['name'], fold: 'text' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
  ],
});
/* No word for one of its things, and the latest kept. */
const TOOLS = reg({ id: 'tools', name: 'Tools', title: 'name', same: { fields: ['name'], fold: 'exact', keep: 'latest' }, fields: [{ id: 'name', type: 'text', required: true }] });
/* Says nothing about what makes two the same: its twins are nobody's business here. */
const NOTES = reg({ id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] });

const value = <T>(out: unknown): T => {
  const x = out as { ok: boolean; value: T };
  assert.ok(x.ok, fixOf(out as never));
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: () => TidyDeps }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([SKILLS, TOOLS, NOTES]));
  const allocate = (name: string): number => {
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    return sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name)!.n;
  };
  return { k, sql, deps: () => ({ sql, nowMs: NOW, mint: ulids(() => NOW), allocate }) };
}

let made = 0;
/** A row made under a name of its own, then given `said` past the door, as a record from before `same:` holds one. */
function twin(k: Kernel, sql: NodeSql, register: string, said: string): Entry {
  const row = value<Entry>(k.create(register, { name: `${said} ${++made}` }, BY));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.name', ?) WHERE id = ?", said, row.id);
  return row;
}

const found = (sql: NodeSql) => finderOf('rows-same')!.find(sql, NOW);

test('the registry holds rows-same last, named in plain words, and it is the one this file lends', () => {
  assert.equal(finders().at(-1)?.id, 'rows-same');
  assert.equal(finderOf('rows-same'), rowsSame);
  assert.equal(rowsSame.name, 'Things here twice');
  assert.equal(causeOfFinder('rows-same'), 'tidy#rows-same');
});

test('A LIST SAYING WHAT MAKES TWO ONE, WITH TWO PAIRS, COUNTS 2: its line in its own words and the address that folds them', async () => {
  const { k, sql } = await record();
  const [a, b] = NAMES;
  twin(k, sql, 'skills', a);
  twin(k, sql, 'skills', a.toUpperCase());
  twin(k, sql, 'skills', b);
  twin(k, sql, 'skills', b);
  /* Alone, so in no pair. */
  twin(k, sql, 'skills', NAMES[2]);
  assert.deepEqual(found(sql), {
    stale: 2,
    did: 0,
    ask: null,
    said: '2 things are here twice',
    at: [{ said: '2 skills are here twice', count: 2, href: '/r/skills?twice=1' }],
  });
  sql.close();
});

test('three alike count 2, a second list has its own line, and the lines come by the list\'s name', async () => {
  const { k, sql } = await record();
  for (let i = 0; i < 3; i++) twin(k, sql, 'tools', NAMES[3]);
  twin(k, sql, 'skills', NAMES[4]);
  twin(k, sql, 'skills', NAMES[4]);
  const out = found(sql);
  assert.equal(out.stale, 3);
  assert.equal(out.said, '3 things are here twice');
  assert.deepEqual(out.at, [
    { said: '1 skill is here twice', count: 1, href: '/r/skills?twice=1' },
    { said: '2 tools are here twice', count: 2, href: '/r/tools?twice=1' },
  ]);
  assert.equal(staleNow(sql, NOW, [rowsSame]), 3);
  sql.close();
});

test('A LIST WITHOUT same: COUNTS NOTHING, however many of its things share a name', async () => {
  const { k, sql } = await record();
  for (let i = 0; i < 4; i++) value(k.create('notes', { name: NAMES[0] }, BY));
  assert.deepEqual(found(sql), { stale: 0, did: 0, ask: null });
  sql.close();
});

test('A DELETED ROW IS NOT COUNTED, nor a finished one: a pair one of which is gone is no pair', async () => {
  const { k, sql } = await record();
  twin(k, sql, 'skills', NAMES[0]);
  const gone = twin(k, sql, 'skills', NAMES[0]);
  twin(k, sql, 'skills', NAMES[1]);
  const done = twin(k, sql, 'skills', NAMES[1]);
  assert.equal(found(sql).stale, 2);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), gone.id);
  assert.equal(found(sql).stale, 1);
  sql.exec("UPDATE entry SET state = 'retired', fields = json_set(fields, '$.state', 'retired') WHERE id = ?", done.id);
  assert.deepEqual(found(sql), { stale: 0, did: 0, ask: null });
  sql.close();
});

test('NOTHING IS WRITTEN, NOTHING ASKED: the tidy runs it by day and in the night and files no question', async () => {
  const { k, sql, deps } = await record();
  twin(k, sql, 'skills', NAMES[0]);
  twin(k, sql, 'skills', NAMES[0]);
  const rows = () => sql.all('SELECT id, version, state, deleted_at, fields FROM entry ORDER BY id');
  const events = () => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n;
  const [before, logged] = [rows(), events()];
  for (const pass of [tidy, tidyHour]) {
    const lines = sql.transactionSync(() => pass(deps(), [rowsSame]));
    assert.deepEqual(lines, [{ finder: 'rows-same', stale: 1, did: 0, asked: null }]);
  }
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')?.n, 0, 'the finder asked a question');
  assert.deepEqual(rows(), before, 'a row was folded, moved or changed');
  assert.equal(events(), logged, 'something was written to the log');
  sql.close();
});

test('its figure comes free from the registry and reads the finder\'s own number', async () => {
  const { k, sql } = await record();
  twin(k, sql, 'tools', NAMES[1]);
  twin(k, sql, 'tools', NAMES[1]);
  const figure = builtInFigure(staleFigureOf('rows-same'));
  assert.ok(figure);
  assert.equal(figure.name, 'Things here twice');
  assert.equal(value<Reading>(k.metric(figure)).value, 1);
  sql.close();
});

test('the words: plain, for one and for many, naming no id', () => {
  assert.equal(rowsSameLine(1), '1 thing is here twice');
  assert.equal(heldTwiceLine({ id: 'tools', name: 'Tools' }, 1), '1 thing in Tools is here twice');
  assert.equal(heldTwiceLine({ id: 'keys', name: 'API keys', one: 'API key' }, 2), '2 API keys are here twice');
  assert.equal(heldTwiceLine({ id: 'keys', name: 'API keys', one: 'API key' }, 1), '1 API key is here twice');
  assert.equal(twiceHref('my list'), '/r/my%20list?twice=1');
  for (const words of [rowsSame.name ?? '', rowsSameLine(3), heldTwiceLine({ id: 'skills', name: 'Skills', one: 'skill' }, 3)])
    assert.doesNotMatch(words, /—|#|\brows?\b|\bentit|_/u);
});
