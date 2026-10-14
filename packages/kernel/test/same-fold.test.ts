/**
 * Which rows are here twice, and what folding them would write (AGT-C13 job d): `clashes` and `foldPlan`, through the
 * kernel's `sameClashes` and `sameFoldPlan`, on a real record whose duplicates were written past the door, as his were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const reg = (body: Record<string, unknown>): Declaration => ({ id: `register.${String(body.id)}`, kind: 'register', body }) as Declaration;

const PROJECTS = reg({ id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] });
/* Folded rows move to the finished state: the list has one. */
const SKILLS = reg({
  id: 'skills',
  name: 'Skills',
  title: 'name',
  seq_prefix: 'SK',
  state: 'state',
  done: ['retired'],
  same: { fields: ['name'], within: 'project', fold: 'text' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'project', type: 'ref', to: 'things' },
    { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
  ],
});
/* No finished state, so a folded row is deleted; and the latest is kept. */
const TOOLS = reg({ id: 'tools', name: 'Tools', title: 'name', seq_prefix: 'TL', same: { fields: ['name'], fold: 'exact', keep: 'latest' }, fields: [{ id: 'name', type: 'text', required: true }] });
/* The oldest is kept, except where a newer one holds the sealed value. */
const KEYS = reg({
  id: 'keys',
  name: 'Keys',
  title: 'label',
  seq_prefix: 'KY',
  same: { fields: ['label'], fold: 'text' },
  fields: [{ id: 'label', type: 'text', required: true }, { id: 'scan', type: 'file' }],
});
const USES = reg({
  id: 'uses',
  name: 'Uses',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'skill', type: 'ref', to: 'skills' },
    { id: 'skills', type: 'list', of: 'ref', to: 'skills' },
    { id: 'tool', type: 'ref', to: 'tools' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A row made under another name, then given `name` past the door, as a record from before `same:` holds one. */
function twin(k: Kernel, sql: NodeSql, register: string, field: string, said: string, rest: Record<string, unknown> = {}): Entry {
  const row = value<Entry>(k.create(register, { [field]: `${said} ${String(Math.random()).slice(2)}`, ...rest }, OWNER));
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.${field}', ?) WHERE id = ?`, said, row.id);
  return row;
}

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, SKILLS, TOOLS, KEYS, USES]));
  const home = value<Entry>(k.create('things', { name: 'Lantern' }, OWNER));
  const away = value<Entry>(k.create('things', { name: 'Harbor' }, OWNER));
  const at = (project: Entry) => ({ project: project.id });
  const sk = {
    pony1: twin(k, sql, 'skills', 'name', 'ponytail', at(home)),
    pony2: twin(k, sql, 'skills', 'name', 'Ponytail (copy)', at(home)),
    deploy1: twin(k, sql, 'skills', 'name', 'deploy', at(home)),
    deploy2: twin(k, sql, 'skills', 'name', 'deploy.md', at(home)),
    lint1: twin(k, sql, 'skills', 'name', 'lint', at(away)),
    lint2: twin(k, sql, 'skills', 'name', 'Lint', at(away)),
    lint3: twin(k, sql, 'skills', 'name', 'lint', at(away)),
    /* Alone in its project, so in no group. */
    ponyAway: twin(k, sql, 'skills', 'name', 'ponytail', at(away)),
  };
  return { k, sql, home, away, sk };
}

test('THREE GROUPS, EACH KEEPING THE OLDEST, and the rows alone in their project in none', async () => {
  const { k, sql, home, away, sk } = await record();
  const groups = k.sameClashes('skills');
  assert.deepEqual(groups, [
    { key: `same:skills:${home.id}:ponytail`, keep: sk.pony1.id, others: [sk.pony2.id] },
    { key: `same:skills:${home.id}:deploy`, keep: sk.deploy1.id, others: [sk.deploy2.id] },
    { key: `same:skills:${away.id}:lint`, keep: sk.lint1.id, others: [sk.lint2.id, sk.lint3.id] },
  ]);
  /* A list declaring no `same:` has nothing here twice. */
  assert.deepEqual(k.sameClashes('uses'), []);
  /* A finished row is not here: retire one of the three lints, and two are left. */
  sql.exec("UPDATE entry SET state = 'retired', fields = json_set(fields, '$.state', 'retired') WHERE id = ?", sk.lint3.id);
  assert.deepEqual(k.sameClashes('skills').at(-1)?.others, [sk.lint2.id]);
  sql.close();
});

test('KEEP EACH WAY: the latest where the list says so, and a sealed row always', async () => {
  const { k, sql } = await record();
  const hammer1 = twin(k, sql, 'tools', 'name', 'hammer');
  const hammer2 = twin(k, sql, 'tools', 'name', 'hammer');
  assert.deepEqual(k.sameClashes('tools'), [{ key: 'same:tools:*:hammer', keep: hammer2.id, others: [hammer1.id] }]);

  /* The oldest is the import's index row; the newer one holds the sealed value, and it is the one kept. */
  const gh1 = twin(k, sql, 'keys', 'label', 'GitHub token');
  const gh2 = twin(k, sql, 'keys', 'label', 'github token');
  /* Two sealed values of one key both stay; the plain one beside them folds into the oldest of the two. */
  const npm1 = twin(k, sql, 'keys', 'label', 'npm');
  const npm2 = twin(k, sql, 'keys', 'label', 'npm');
  const npm3 = twin(k, sql, 'keys', 'label', 'npm');
  for (const row of [gh2, npm1, npm2]) sql.exec(`UPDATE entry SET fields = json_set(fields, '$.scan', json('{"ref":"blob1"}')) WHERE id = ?`, row.id);
  const keys = k.sameClashes('keys');
  assert.deepEqual(keys, [
    { key: 'same:keys:*:github token', keep: gh2.id, others: [gh1.id] },
    { key: 'same:keys:*:npm', keep: npm1.id, others: [npm3.id] },
  ]);
  assert.ok(!keys.some((g) => g.others.includes(npm2.id)), 'a sealed row was folded away');

  /* Two sealed rows alone fold nothing, so no group is answered. */
  sql.exec("UPDATE entry SET deleted_at = '2026-10-06T00:00:00Z' WHERE id = ?", npm3.id);
  assert.deepEqual(k.sameClashes('keys').map((g) => g.key), ['same:keys:*:github token']);
  sql.close();
});

test('THE PLAN MOVES EVERY LINK, then finishes the others where the list can, and deletes them where it cannot', async () => {
  const { k, sql, sk } = await record();
  const hammer1 = twin(k, sql, 'tools', 'name', 'hammer');
  const hammer2 = twin(k, sql, 'tools', 'name', 'hammer');
  const one = value<Entry>(k.create('uses', { what: 'one', skill: sk.pony2.id, tool: hammer1.id }, OWNER));
  /* Into two groups at once: written once, under the first, with every link moved and none twice. */
  const both = value<Entry>(k.create('uses', { what: 'both', skills: [sk.pony2.id, sk.deploy2.id, sk.pony1.id] }, OWNER));
  value<Entry>(k.create('uses', { what: 'untouched', skill: sk.pony1.id }, OWNER));
  const before = sql.all('SELECT id, version, fields, state, deleted_at FROM entry ORDER BY id');

  const plan = k.sameFoldPlan('skills');
  assert.equal(plan.length, 3);
  assert.deepEqual(plan[0]!.writes, [
    { register: 'uses', at: one.id, patch: { skill: sk.pony1.id } },
    { register: 'uses', at: both.id, patch: { skills: [sk.pony1.id, sk.deploy1.id] } },
    { register: 'skills', at: sk.pony2.id, patch: { state: 'retired' }, note: 'Folded into ponytail' },
  ]);
  assert.deepEqual(plan[1]!.writes, [{ register: 'skills', at: sk.deploy2.id, patch: { state: 'retired' }, note: 'Folded into deploy' }]);
  assert.deepEqual(plan[2]!.writes, [
    { register: 'skills', at: sk.lint2.id, patch: { state: 'retired' }, note: 'Folded into lint' },
    { register: 'skills', at: sk.lint3.id, patch: { state: 'retired' }, note: 'Folded into lint' },
  ]);

  /* No finished state: the other is deleted, after its links are moved. */
  assert.deepEqual(k.sameFoldPlan('tools'), [
    {
      key: 'same:tools:*:hammer',
      keep: hammer2.id,
      others: [hammer1.id],
      writes: [
        { register: 'uses', at: one.id, patch: { tool: hammer2.id } },
        { register: 'tools', at: hammer1.id, delete: true, note: 'Folded into hammer' },
      ],
    },
  ]);
  assert.deepEqual(k.sameFoldPlan('uses'), []);
  /* And nothing was written. */
  assert.deepEqual(sql.all('SELECT id, version, fields, state, deleted_at FROM entry ORDER BY id'), before);
  sql.close();
});
