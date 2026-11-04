/**
 * Turning a pack off and on.
 *
 * What is asserted is that nothing is lost. A disabled pack's registers leave the cache, its pages
 * stop reading, its indexes go, and every row stays exactly as it was; enabling brings back the same
 * bodies over the same rows. The two guards refuse before anything is written, and a disabled pack
 * takes no upgrade.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { applyMigrations } from '../src/migrate.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const BY = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  pack: 'portfolio',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  },
};

/** Learnings as the agents pack declares them, cut to the field that leans on Projects. */
const LEARNINGS: Declaration = {
  id: 'register.learnings',
  kind: 'register',
  pack: 'agents',
  body: {
    id: 'learnings',
    name: 'Learnings',
    title: 'lesson',
    fields: [
      { id: 'lesson', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
    ],
  },
};

/** Declared in the app, so no pack owns it and nothing can turn it off with Projects. */
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things', index: true, scope: {} },
    ],
  },
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  pack: 'notebook',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'body',
    fields: [
      { id: 'body', type: 'text', required: true, search: true },
      { id: 'code', type: 'text', unique: true },
      { id: 'kind', type: 'enum', values: ['idea', 'call'], index: true },
    ],
  },
};

const NOTES_PAGE: Declaration = {
  id: 'page.notebook',
  kind: 'page',
  pack: 'notebook',
  body: {
    page: 'notebook',
    title: 'Notebook',
    nav: { section: 'Money', order: 30 },
    requires: ['register.notes'],
    blocks: [
      { kind: 'table', heading: 'Notes', span: 12, source: 'register.notes', columns: [{ field: 'body' }], limit: 50, empty: 'Nothing written yet.' },
    ],
  },
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

const refusalOf = (r: Result<unknown>) => (!r.ok && 'refusal' in r ? r.refusal : null);
const codeOf = (r: Result<unknown>): string => (r.ok ? 'accepted' : (refusalOf(r)?.code ?? 'conflict'));

/** A `pack` row as the pack path writes one. */
const remember = (k: Kernel, id: string, packs: Record<string, string> = {}) =>
  k.rememberPack({
    id,
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: JSON.stringify({ pack: id, version: '1.0.0', requires: { format: 1, primitives: 1, packs } }),
    checksum: `sum-${id}`,
  });

async function record(...batch: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(batch));
  for (const pack of new Set(batch.map((d) => d.pack).filter((p): p is string => typeof p === 'string'))) remember(k, pack);
  return { k, sql };
}

const rowsOf = (sql: NodeSql, register: string) => sql.all('SELECT * FROM entry WHERE register = ? ORDER BY id', register);
const indexesOf = (sql: NodeSql, register: string) =>
  sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry' ORDER BY name")
    .map((r) => r.name)
    .filter((name) => name.includes(`_${register}__`));
const packEvents = (sql: NodeSql) =>
  sql
    .all<{ kind: string; target: string; to_v: string | null }>("SELECT kind, target, to_v FROM event WHERE target_kind = 'pack' ORDER BY rowid")
    .map((e) => [e.kind, e.target, e.to_v]);
const disabledAt = (sql: NodeSql, id: string) => sql.one<{ d: string | null }>('SELECT disabled_at AS d FROM pack WHERE id = ?', id)?.d;

/* ── off and on ──────────────────────────────────────────────────────────── */

test('DISABLE THEN ENABLE OVER A REGISTER HOLDING ROWS, and nothing is lost', async () => {
  const { k, sql } = await record(NOTES, NOTES_PAGE);
  for (const [i, body] of ['Call the bank', 'Ring Halden about the lease', 'Draft the brief'].entries())
    value(k.create('notes', { body, code: `N${i}`, kind: i === 1 ? 'call' : 'idea' }, BY));
  value(k.update('notes', 'notes#2', { body: 'Ring Halden about the new lease' }, BY));

  const rows = rowsOf(sql, 'notes');
  const sums = k.declarations().filter((d) => d.pack_id === 'notebook').map((d) => [d.id, d.checksum]);
  const indexes = indexesOf(sql, 'notes');
  assert.equal(indexes.length, 2);
  assert.ok(k.page('notebook').ok);

  const off = value(k.disablePack('notebook'));
  assert.deepEqual(
    { changed: off.changed, state: off.state, packs: off.packs, declarations: off.declarations },
    { changed: true, state: 'disabled', packs: ['notebook'], declarations: ['page.notebook', 'register.notes'] },
  );
  assert.equal(k.registers().has('notes'), false, 'a disabled register stayed in the cache');
  assert.equal(k.page('notebook').ok, false, 'a disabled page still reads');
  assert.equal(k.declarations().some((d) => d.pack_id === 'notebook'), false);
  assert.deepEqual(indexesOf(sql, 'notes'), [], 'a disabled register kept its indexes');
  assert.deepEqual(rowsOf(sql, 'notes'), rows, 'a row changed when the pack went off');
  assert.ok(disabledAt(sql, 'notebook'));
  /* `requires` is what the stored manifest asks of other packs, and the notebook asks nothing. */
  assert.deepEqual(k.packs().map((p) => ({ ...p })), [{ id: 'notebook', version: '1.0.0', requires: {} }], 'the pack row went');

  const on = value(await k.enablePack('notebook'));
  assert.deepEqual({ changed: on.changed, declarations: on.declarations }, { changed: true, declarations: ['page.notebook', 'register.notes'] });
  assert.ok(k.registers().has('notes'));
  assert.ok(k.page('notebook').ok, 'the page did not come back');
  const back = k.declarations().filter((d) => d.pack_id === 'notebook');
  assert.deepEqual(back.map((d) => [d.id, d.checksum]), sums, 'a declaration came back with a different body');
  /* A NEW VERSION, THE SAME BYTES: `retired` only ever goes from 0 to 1, so coming back is a new row. */
  assert.deepEqual(back.map((d) => d.version), [2, 2]);
  assert.deepEqual(indexesOf(sql, 'notes'), indexes, 'the indexes did not come back');
  assert.deepEqual(rowsOf(sql, 'notes'), rows, 'a row changed when the pack came back');
  assert.equal(disabledAt(sql, 'notebook'), null);
  assert.equal(k.get('notes#2')?.fields.body, 'Ring Halden about the new lease');
  assert.equal(codeOf(k.create('notes', { body: 'Call the bank again', code: 'N0' }, BY)), 'ALREADY_KNOWN', 'the unique rule did not come back');

  const list = '["page.notebook","register.notes"]';
  assert.deepEqual(packEvents(sql), [
    ['install', 'pack:notebook', '1.0.0'],
    ['retire', 'pack:notebook', list],
    ['install', 'pack:notebook', list],
  ]);

  /* AND THE SAME CALL TWICE CHANGES NOTHING, and says so. */
  const again = value(await k.enablePack('notebook'));
  assert.equal(again.changed, false);
  assert.match(again.said, /already enabled/);
  value(k.disablePack('notebook'));
  const twice = value(k.disablePack('notebook'));
  assert.equal(twice.changed, false);
  assert.match(twice.said, /already disabled/);
  assert.equal(packEvents(sql).length, 4, 'a no-op wrote an event');
  sql.close();
});

test('A DISABLED REGISTER TAKES NO WRITES, and a disabled pack takes no upgrade', async () => {
  const { k, sql } = await record(NOTES);
  value(k.create('notes', { body: 'Call the bank' }, BY));
  value(k.disablePack('notebook'));
  const before = rowsOf(sql, 'notes');

  assert.equal(codeOf(k.create('notes', { body: 'One more' }, BY)), 'REGISTER_UNKNOWN');
  assert.notEqual(codeOf(k.update('notes', 'notes#1', { body: 'Changed while off' }, BY)), 'accepted');

  const upgrade: Declaration = { ...NOTES, body: { ...NOTES.body, name: 'Notebook' } };
  const installed = await k.install([upgrade]);
  assert.equal(codeOf(installed), 'PACK_DISABLED');
  assert.equal(refusalOf(installed)?.at, 'pack');
  assert.equal(codeOf(await k.stageInstall([upgrade])), 'PACK_DISABLED');

  assert.deepEqual(rowsOf(sql, 'notes'), before);
  assert.equal(k.declarations().some((d) => d.pack_id === 'notebook'), false);
  assert.equal(codeOf(k.disablePack('nothing-installed')), 'DECLARATION_UNKNOWN');
  assert.equal(codeOf(k.disablePack('kernel')), 'PROVIDES_CONFLICT');
  sql.close();
});

/* ── the dependency guard ────────────────────────────────────────────────── */

test('A PACK ANOTHER ACTIVE PACK LEANS ON IS REFUSED, naming it, and alsoDisable turns both off together', async () => {
  const { k, sql } = await record(PROJECTS, LEARNINGS);
  const thing = value(k.create('things', { name: 'BrainDog', repos: ['braindog'] }, BY));
  value(k.create('learnings', { lesson: 'Ship the kernel first', project: thing.id }, BY));
  const events = packEvents(sql).length;

  const refused = k.disablePack('portfolio');
  assert.equal(codeOf(refused), 'PACK_REQUIRED');
  assert.deepEqual(refusalOf(refused)?.allowed, ['agents']);
  assert.match(refusalOf(refused)?.fix ?? '', /agents 1\.0\.0/);
  assert.ok(k.registers().has('things'), 'a refused disable still retired something');
  assert.equal(disabledAt(sql, 'portfolio'), null);
  assert.equal(packEvents(sql).length, events);

  const both = value(k.disablePack('portfolio', { alsoDisable: ['agents'] }));
  assert.deepEqual(both.packs, ['portfolio', 'agents']);
  assert.equal(k.registers().has('things') || k.registers().has('learnings'), false);
  assert.ok(disabledAt(sql, 'portfolio') && disabledAt(sql, 'agents'));
  assert.deepEqual(
    packEvents(sql).slice(-2).map(([kind, target]) => [kind, target]),
    [['retire', 'pack:portfolio'], ['retire', 'pack:agents']],
  );

  /* BACK ON IN ORDER. The dependent first is refused by the install path, which is where it belongs. */
  assert.notEqual(codeOf(await k.enablePack('agents')), 'accepted');
  assert.ok(disabledAt(sql, 'agents'), 'a refused enable cleared disabled_at');
  value(await k.enablePack('portfolio'));
  value(await k.enablePack('agents'));
  assert.equal(k.count('things'), 1);
  assert.equal(k.count('learnings'), 1);
  sql.close();
});

test('AND A MANIFEST THAT REQUIRES THE PACK LEANS ON IT TOO', async () => {
  const { k, sql } = await record(NOTES);
  remember(k, 'notebook-digest', { notebook: '^1' });
  const refused = k.disablePack('notebook');
  assert.equal(codeOf(refused), 'PACK_REQUIRED');
  assert.deepEqual(refusalOf(refused)?.allowed, ['notebook-digest']);
  assert.deepEqual(value(k.disablePack('notebook', { alsoDisable: ['notebook-digest'] })).packs, ['notebook', 'notebook-digest']);
  sql.close();
});

/* ── the scopes guard ────────────────────────────────────────────────────── */

test('THE PACK HOLDING THE PROJECTS IS REFUSED WHILE A FIELD LEFT ON STILL POINTS AT THEM', async () => {
  const { k, sql } = await record(PROJECTS, TASKS);
  const refused = k.disablePack('portfolio');
  assert.equal(codeOf(refused), 'SCOPES_IN_USE');
  assert.equal(refusalOf(refused)?.at, 'register.tasks.thing');
  assert.ok(k.registers().has('things'));
  assert.equal(disabledAt(sql, 'portfolio'), null);

  /* With nothing left pointing at the projects, the way is clear. */
  value(k.retire(['register.tasks']));
  assert.equal(value(k.disablePack('portfolio')).changed, true);
  sql.close();
});

test('AND UNINSTALLING IT IS REFUSED THE SAME WAY, since uninstall retires through the same door', async () => {
  const { k, sql } = await record(PROJECTS, TASKS, LEARNINGS);
  const refused = k.retire(['register.things']);
  assert.equal(codeOf(refused), 'SCOPES_IN_USE');
  assert.equal(refusalOf(refused)?.at, 'register.learnings.project');
  assert.match(refusalOf(refused)?.fix ?? '', /register\.learnings\.project, register\.tasks\.thing still point/);
  assert.ok(k.registers().has('things'), 'a refused retire took something out');

  /* Only one of the two leaving with it is still refused, naming the one left. */
  assert.equal(refusalOf(k.retire(['register.things', 'register.learnings']))?.at, 'register.tasks.thing');

  /* All three together is an uninstall of the lot, and goes through. */
  assert.equal(value(k.retire(['register.things', 'register.learnings', 'register.tasks'])), 3);
  assert.equal(k.registers().has('things'), false);
  sql.close();
});

/* ── a pack the seed installed ───────────────────────────────────────────── */

test('A PACK OWNED ONLY BY ITS BODY, AS THE SEED INSTALLS PEOPLE, GOES OFF AND COMES BACK THE SAME', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const PEOPLE: Declaration = {
    id: 'register.people',
    kind: 'register',
    body: { id: 'people', name: 'People', title: 'name', pack: 'people', fields: [{ id: 'name', type: 'text', required: true }] },
  };
  value(await k.install([PEOPLE]));
  value(k.create('people', { name: 'Ada Lovelace' }, BY));
  assert.equal(k.packs().length, 0, 'this record has no pack row, as a seeded one has none');

  assert.deepEqual(value(k.disablePack('people')).declarations, ['register.people']);
  assert.equal(k.registers().has('people'), false);
  assert.match(value(k.disablePack('people')).said, /already disabled/);
  assert.equal(codeOf(await k.install([PEOPLE])), 'PACK_DISABLED');

  value(await k.enablePack('people'));
  assert.equal(k.count('people'), 1);
  assert.equal(k.declarations().find((d) => d.id === 'register.people')?.pack_id, null, 'enabling changed who owns the declaration');
  assert.match(value(await k.enablePack('people')).said, /already enabled/);
  sql.close();
});

/* ── the migration ───────────────────────────────────────────────────────── */

const schema = (sql: NodeSql) => ({
  schema: sql.all("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"),
  migration: sql.all('SELECT * FROM migration ORDER BY version'),
});

test('MIGRATION 3 APPLIES ONCE, and a second run changes nothing', async () => {
  const sql = openSqlite();
  const first = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(first.result.ok, fixOf(first.result));
  assert.ok(first.result.value.applied.includes(3));
  assert.ok(sql.all<{ name: string }>('PRAGMA table_info(pack)').some((c) => c.name === 'disabled_at'));

  const before = schema(sql);
  const second = await applyMigrations(sql, fixedClock(NOW + 60_000));
  assert.ok(second.result.ok, fixOf(second.result));
  assert.deepEqual(second.result.value.applied, []);
  assert.deepEqual(schema(sql), before);
  sql.close();
});

test('A RECORD FROM BEFORE MIGRATION 3 TAKES IT ON OPEN, and its packs arrive enabled', async () => {
  const { k, sql } = await record(NOTES);
  value(k.create('notes', { body: 'Call the bank' }, BY));
  sql.exec('ALTER TABLE pack DROP COLUMN disabled_at');
  /* And migration 10's column, which `ADD COLUMN` cannot re-apply: a rewind that left it behind
     would be a state no record can be in, ledger at 2 and schema at 10. */
  sql.exec('ALTER TABLE grant DROP COLUMN sealed_under');
  /* And migration 15's column on `token`, for the same reason. */
  sql.exec('ALTER TABLE token DROP COLUMN reach');
  /* And migration 19's column on `member` and 20's on `record`, for the same reason. */
  sql.exec('ALTER TABLE member DROP COLUMN row_where');
  sql.exec('ALTER TABLE record DROP COLUMN quiet');
  /* And the ledger above it, since the runner applies only what is above the highest version it holds. */
  sql.exec('DELETE FROM migration WHERE version >= 3');

  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual({ ...sql.one<Record<string, unknown>>('SELECT id, version, disabled_at FROM pack') },{ id: 'notebook', version: '1.0.0', disabled_at: null });

  const reopened = await openRecord(sql, fixedClock(NOW));
  assert.equal(value(reopened.disablePack('notebook')).changed, true);
  assert.equal(reopened.count('notes'), 1);
  sql.close();
});
