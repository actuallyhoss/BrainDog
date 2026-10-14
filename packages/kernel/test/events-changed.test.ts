/**
 * HOW MANY OF A LIST'S ENTRIES HAD ONE FIELD CHANGED (`events.<list>` as `{ count: changed, field }`, AGT-C17 job c).
 * "The brain's growth over time: learnings arriving and skills changing": a skill takes a new version by its `rev`, and
 * the history holds every edit of it, so the figure counts the skills whose `rev` changed in its window, and by week.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';
import { OWNER, PROJECTS } from '../../../fixtures/names.ts';

/* Wednesday 23 September 2026, so its week starts on Monday the 21st. */
const NOW = Date.UTC(2026, 8, 23, 12);
const DAY = 86_400_000;

const SEED: Declaration[] = [
  {
    id: 'register.skills',
    kind: 'register',
    body: {
      id: 'skills',
      name: 'Skills',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'trigger', type: 'text' },
        { id: 'rev', label: 'Version', type: 'int', default: 1 },
      ],
    } as never,
  },
];

const figure = (more: Record<string, unknown> = {}) =>
  ({
    metric: 'skills-changed',
    name: 'Skills changed, 30 days',
    source: 'events.skills',
    value: { count: 'changed', field: 'rev' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    ...more,
  }) as unknown as MetricDecl;

const WEEKLY = { metric: 'skills-changed-by-week', window: '182d', group_by: 'at', bucket: 'week' };

type Sqlite = ReturnType<typeof openSqlite>;

/** A record with a list of skills, three made twenty days ago by the owner. */
const open = async (): Promise<{ sql: Sqlite; k: Kernel; ids: string[]; at: (days: number, edit: () => unknown) => void }> => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install(SEED);
  assert.ok(installed.ok, JSON.stringify(installed));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_1', ?, ?)", OWNER.email, OWNER.name);
  const ids = PROJECTS.slice(0, 3).map((name) => {
    let id = '';
    assert.ok(
      k.backdate(NOW - 20 * DAY, () => {
        const made = k.create('skills', { name }, { actor: 'p_1' });
        assert.ok(made.ok, JSON.stringify(made));
        id = (made as { value: { id: string } }).value.id;
        return made;
      }).ok,
    );
    return id;
  });
  const at = (days: number, edit: () => unknown): void => {
    const got = k.backdate(NOW - days * DAY, () => {
      const done = edit() as { ok: boolean };
      assert.ok(done.ok, JSON.stringify(done));
      return done;
    });
    assert.ok(got.ok, JSON.stringify(got));
  };
  return { sql, k, ids, at };
};

const read = (k: Kernel, more: Record<string, unknown> = {}) => {
  const got = k.metric(figure(more));
  assert.ok(got.ok, JSON.stringify(got));
  return got.value;
};

const weeks = (groups: readonly { key: string; value: number | null; state: string }[] | undefined) => (groups ?? []).map((g) => [g.key, g.value, g.state]);

test('TWO SKILLS CHANGED ONE WEEK AND ONE THE NEXT READ 2 AND 1, and an edit of another field is not counted', async () => {
  const { sql, k, ids, at } = await open();
  const [a, b, c] = ids as [string, string, string];
  /* Tuesday the 8th: two skills take a new version. Tuesday the 15th: one does, and another is reworded. */
  at(15, () => k.update('skills', a, { rev: 2 }, { actor: 'p_1' }));
  at(15, () => k.update('skills', b, { rev: 2 }, { actor: 'p_1' }));
  at(8, () => k.update('skills', a, { rev: 3 }, { actor: 'p_1' }));
  at(8, () => k.update('skills', c, { trigger: 'Before a release' }, { actor: 'p_1' }));

  const got = read(k, WEEKLY);
  assert.deepEqual(weeks(got.groups), [
    ['2026-09-07', 2, 'partial'],
    ['2026-09-14', 1, 'full'],
    ['2026-09-21', null, 'empty'],
  ]);
  assert.equal(got.current, '2026-09-21');
  assert.equal(got.value, 2, 'the window counts each skill that changed once');

  const month = read(k);
  assert.deepEqual([month.value, month.rows, month.groups], [2, 2, undefined]);
  assert.equal(month.why, 'Skills whose version changed in the last 30 days');
  assert.doesNotMatch(month.why, /—|rev\b/u);

  const reworded = read(k, { value: { count: 'changed', field: 'trigger' } });
  assert.equal(reworded.value, 1, 'the field it is asked of, and only that one');
  sql.close();
});

test('A SKILL THAT CHANGED TWICE IN ONE WEEK IS ONE SKILL THAT CHANGED, and a change before the window or to a deleted skill is not counted', async () => {
  const { sql, k, ids, at } = await open();
  const [a, b] = ids as [string, string, string];
  at(15, () => k.update('skills', a, { rev: 2 }, { actor: 'p_1' }));
  at(14, () => k.update('skills', a, { rev: 3 }, { actor: 'p_1' }));
  at(15, () => k.update('skills', b, { rev: 2 }, { actor: 'p_1' }));
  assert.ok(k.update('skills', b, { deleted_at: true } as never, { actor: 'p_1' }).ok);

  assert.deepEqual(weeks(read(k, WEEKLY).groups), [
    ['2026-09-07', 1, 'partial'],
    ['2026-09-14', null, 'empty'],
    ['2026-09-21', null, 'empty'],
  ]);
  assert.equal(read(k, { window: '7d' }).value, 0, 'the changes on the 8th and 9th are before the last seven days');
  sql.close();
});

test('NOTHING CHANGED READS NOUGHT, with no weeks to draw', async () => {
  const { sql, k } = await open();
  const got = read(k, WEEKLY);
  assert.deepEqual([got.value, got.groups, got.current], [0, [], '2026-09-21']);
  sql.close();
});

test('THE COUNT OF WHAT WAS MADE READS AS IT DID beside it', async () => {
  const { sql, k, ids, at } = await open();
  at(8, () => k.update('skills', ids[0]!, { rev: 2 }, { actor: 'p_1' }));
  const made = read(k, { value: { count: 'made' } });
  assert.deepEqual([made.value, made.groups?.map((g) => [g.key, g.label, g.value])], [3, [['person:p_1', OWNER.name, 3]]]);
  const bucketed = k.metric(figure({ value: { count: 'made' }, bucket: 'week' }));
  assert.equal(bucketed.ok, false);
  assert.deepEqual((bucketed as { refusal: { code: string; at?: string } }).refusal.code, 'DECLARATION_INVALID');
  sql.close();
});

test('A FIELD THE LIST LACKS, ANY OTHER COUNT, A where AND A BUCKET WITHOUT group_by: at ARE REFUSED', async () => {
  const { sql, k } = await open();
  const refused = (more: Record<string, unknown>) => {
    const got = k.metric(figure(more));
    assert.equal(got.ok, false, JSON.stringify(got));
    return (got as { refusal: { code: string; fix: string; at?: string } }).refusal;
  };
  const unknown = refused({ value: { count: 'changed', field: 'colour' } });
  assert.deepEqual([unknown.code, unknown.at], ['FIELD_UNKNOWN', 'value']);
  const other = refused({ value: { count: 'edited', field: 'rev' } });
  assert.deepEqual([other.code, other.at], ['SOURCE_UNKNOWN', 'source']);
  assert.match(other.fix, /\{ count: made \}/u);
  assert.match(other.fix, /\{ count: changed, field: <a field> \}/u);
  assert.deepEqual(refused({ where: 'by is person' }).at, 'where');
  assert.deepEqual(refused({ bucket: 'week' }).at, 'group_by');
  assert.deepEqual(refused({ group_by: 'at' }).at, 'group_by');
  assert.deepEqual(refused({ group_by: 'at', bucket: 'fortnight' }).at, 'bucket');
  for (const r of [unknown, other]) assert.doesNotMatch(r.fix, /—/u);
  sql.close();
});

test('THE FIGURE BY WEEK INSTALLS AS A DECLARATION', async () => {
  const { sql, k } = await open();
  const decl = { ...figure(WEEKLY), name: 'Skills changed, by week' };
  const installed = await k.install([{ id: 'metric.skills-changed-by-week', kind: 'metric', body: decl as never }]);
  assert.ok(installed.ok, JSON.stringify(installed));
  sql.close();
});
