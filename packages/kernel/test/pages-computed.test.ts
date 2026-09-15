/**
 * What a page computes, and the two keys that say where a row applies.
 *
 * `inherit:` reads a project's rows and the global ones through `inScope`; `as: scope` names where
 * each row applies; `activity` is a feed's events; a `diff` reads one row's history. The page layer
 * takes these as deps its host wires, and here they are wired from the record's own public reads,
 * so every answer below comes from a real record rather than a stub.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { feedRows, readBlock, versionsOf, type ActivityEvent, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const OWNER = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
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

const SKILLS: Declaration = {
  id: 'register.skills',
  kind: 'register',
  body: {
    id: 'skills',
    name: 'Skills',
    title: 'name',
    state: 'state',
    done: ['retired'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'body', type: 'document' },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person', same: 'nearer' } },
      { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
    ],
  },
};

/* Keys add up rather than hide: the scope field says nothing about `same`. */
const KEYS: Declaration = {
  id: 'register.credentials',
  kind: 'register',
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, SKILLS, KEYS]));
  value(k.create('things', { name: 'Kiln' }, OWNER));
  value(k.create('things', { name: 'Portage' }, OWNER));
  value(k.create('skills', { name: 'review-pr', body: '# Review\nRead the diff.' }, OWNER));
  value(k.create('skills', { name: 'review-pr', body: '# Review\nRead the diff.\nCheck the outlines.', project: 'things#1' }, OWNER));
  value(k.create('skills', { name: 'deploy', body: '# Deploy' }, OWNER));
  value(k.create('credentials', { label: 'Kiln deploy key', project: 'things#1' }, OWNER));
  value(k.create('credentials', { label: 'DNS' }, OWNER));
  return { k, sql };
}

/** The deps a host wires, from the record's public reads. */
function depsOver(k: Kernel, sql: NodeSql): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    if (!decl) return null;
    return {
      register,
      ...(decl.state === undefined ? {} : { state: decl.state }),
      fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])),
    };
  };
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({
        register: q.register,
        ...(q.where ? { where: q.where } : {}),
        ...(q.limit ? { limit: q.limit } : {}),
        ...(q.order?.length ? { order: q.order } : {}),
      });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: {
      nowMs: NOW,
      schemaOf,
      refByTitle: (register, title) => {
        const named = k.register(register)?.title;
        const out = named === undefined ? null : k.list({ register, limit: 200 });
        return out?.ok ? (out.value.rows.find((r) => r.fields[named!] === title)?.id ?? null) : null;
      },
    },
    scopeOf: (register) => {
      const f = k.register(register)?.fields.find((x) => x.scope !== undefined && !x.retired);
      return f?.to ? { field: f.id, to: f.to } : null;
    },
    inScope: (register, project, opts) => k.inScope(register, project, opts),
    history: (register, row) => {
      const found = k.get(row);
      return found && found.register === register ? ok(k.history(found.id)) : no('VALUE_MALFORMED', `${row} is not a row of ${register}.`, { at: 'row' });
    },
    activity: (limit) => ({
      events: sql.all<ActivityEvent>('SELECT ts, actor, kind, target, note FROM event ORDER BY rowid DESC LIMIT ?', limit),
      seen: null,
    }),
  };
}

const skillsOn = (project: string, extra: Partial<PageBlock> = {}): PageBlock => ({
  kind: 'cards',
  source: 'register.skills',
  where: `project is ${project}`,
  inherit: true,
  columns: [{ field: 'name', as: 'title' }, { field: 'project', as: 'scope' }],
  empty: 'No skills apply here.',
  ...extra,
});

/** Each row as `name @ where it applies`, sorted, so an order the block did not ask for cannot fail it. */
const applies = (b: BlockResult, field = 'name'): string[] =>
  b.rows.map((r, i) => `${String(r.fields[field])} @ ${b.scopes?.[i] ?? 'everywhere'}`).sort();

/* ── inherit ─────────────────────────────────────────────────────────────── */

test('INHERIT: Kiln shows its own review-pr and not the global one, and Portage shows the global one', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);

  const kiln = readBlock(deps, skillsOn('Kiln'));
  assert.deepEqual(kiln.refusals, []);
  assert.deepEqual(applies(kiln), ['deploy @ everywhere', 'review-pr @ Kiln']);
  assert.equal(kiln.scopes?.[0], 'Kiln', 'the project’s own rows come first');
  assert.equal(kiln.inherited, 1);
  assert.equal(kiln.matched, 2, 'the hidden review is not counted either');

  const portage = readBlock(deps, skillsOn('Portage'));
  assert.deepEqual(applies(portage), ['deploy @ everywhere', 'review-pr @ everywhere']);
  assert.equal(portage.inherited, 2);
  sql.close();
});

test('and the page agrees with inScope, which a run’s context is built on', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);
  for (const project of ['things#1', 'things#2']) {
    const scoped = value<{ rows: Entry[]; inherited: Entry[] }>(k.inScope('skills', project));
    const name = project === 'things#1' ? 'Kiln' : 'Portage';
    const page = readBlock(deps, skillsOn(name));
    assert.deepEqual(
      page.rows.map((r) => r.id).sort(),
      [...scoped.rows, ...scoped.inherited].map((r) => r.id).sort(),
      `${name}: the page and inScope disagree about which skills apply`,
    );
  }
  sql.close();
});

test('a retired project skill hides nothing, and keys add up rather than hide', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);
  value(k.update('skills', 'skills#2', { state: 'retired' }, OWNER));
  assert.deepEqual(applies(readBlock(deps, skillsOn('Kiln'))), ['deploy @ everywhere', 'review-pr @ Kiln', 'review-pr @ everywhere']);

  const keys = readBlock(deps, {
    kind: 'table',
    source: 'register.credentials',
    where: 'project is Kiln',
    inherit: true,
    columns: [{ field: 'label' }, { field: 'project', as: 'scope' }],
    empty: 'No keys apply here.',
  });
  assert.deepEqual(keys.refusals, []);
  assert.deepEqual(applies(keys, 'label'), ['DNS @ everywhere', 'Kiln deploy key @ Kiln']);
  sql.close();
});

test('the limit counts both lists, the project’s first', async () => {
  const { k, sql } = await record();
  const cut = readBlock(depsOver(k, sql), skillsOn('Portage', { limit: 1 }));
  assert.equal(cut.rows.length, 1);
  assert.equal(cut.matched, 2);
  const own = readBlock(depsOver(k, sql), skillsOn('Kiln', { limit: 1 }));
  assert.deepEqual(applies(own), ['review-pr @ Kiln']);
  assert.equal(own.inherited, 0);
  sql.close();
});

test('an inheriting block that cannot say which project, or has no scope, says so and draws nothing', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);

  const unnamed = readBlock(deps, skillsOn('Kiln', { where: 'name is deploy' }));
  assert.equal(unnamed.refusals[0]?.code, 'REQUIRED_MISSING');
  assert.equal(unnamed.refusals[0]?.at, 'where');
  assert.deepEqual(unnamed.rows, []);

  const unscoped = readBlock(deps, { kind: 'table', source: 'register.things', where: 'name is Kiln', inherit: true, columns: [{ field: 'name' }], empty: 'None.' });
  assert.equal(unscoped.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(unscoped.refusals[0]?.at, 'inherit');

  const astray = readBlock(deps, skillsOn('Kiln', { columns: [{ field: 'name', as: 'scope' }] }));
  assert.equal(astray.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(astray.refusals[0]?.at, 'columns');

  /* A host that has not wired the read gets a refusal, never every row of the register. */
  const { inScope: _unwired, ...bare } = deps;
  const early = readBlock(bare, skillsOn('Kiln'));
  assert.equal(early.refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(early.rows, []);
  sql.close();
});

test('a block that does not inherit is the block it was', async () => {
  const { k, sql } = await record();
  const plain = readBlock(depsOver(k, sql), { kind: 'table', source: 'register.skills', where: 'project is Kiln', columns: [{ field: 'name' }], empty: 'None.' });
  assert.deepEqual(plain.refusals, []);
  assert.equal(plain.rows.length, 1);
  assert.equal(plain.inherited, undefined);
  assert.equal(plain.scopes, undefined);
  sql.close();
});

/* ── diff ────────────────────────────────────────────────────────────────── */

test('A DIFF READS THE VALUES ONE FIELD HELD, newest first, as many as it asks for', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);
  value(k.update('skills', 'skills#1', { body: '# Review\nRead the whole diff.' }, OWNER));
  value(k.update('skills', 'skills#1', { name: 'review' }, OWNER));
  value(k.update('skills', 'skills#1', { body: '# Review\nRead the whole diff.\nName what you skipped.' }, OWNER));

  const block = { kind: 'diff', source: 'register.skills', row: 'skills#1', field: 'body', empty: 'One version so far.' };
  const two = readBlock(deps, block);
  assert.deepEqual(two.refusals, []);
  assert.equal(two.matched, 3, 'the create and two edits to the body; the rename is not a version of it');
  assert.deepEqual(
    two.history?.map((v) => v.text),
    ['# Review\nRead the whole diff.\nName what you skipped.', '# Review\nRead the whole diff.'],
  );
  assert.equal(readBlock(deps, { ...block, versions: 10 }).history?.at(-1)?.text, '# Review\nRead the diff.');

  const { row: _row, ...rowless } = block;
  assert.equal(readBlock(deps, rowless).refusals[0]?.code, 'REQUIRED_MISSING');
  assert.equal(readBlock(deps, { ...block, field: 'project' }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(readBlock(deps, { ...block, field: 'colour' }).refusals[0]?.code, 'FIELD_UNKNOWN');
  sql.close();
});

test('versionsOf skips an event that leaves the field as it was', () => {
  const at = '2026-09-15T12:00:00Z';
  const events = [
    { ts: at, actor: 'p_1', kind: 'create', field: null, to: { body: 'a' } },
    { ts: at, actor: 'p_1', kind: 'edit', field: 'name', to: 'x' },
    { ts: at, actor: 'p_1', kind: 'edit', field: 'body', to: 'a' },
    { ts: at, actor: 'S4', kind: 'edit', field: 'body', to: 'b' },
  ];
  assert.deepEqual(versionsOf(events, 'body').map((v) => `${v.by}:${v.text}`), ['p_1:a', 'S4:b']);
});

/* ── activity ────────────────────────────────────────────────────────────── */

test('A FEED IS THE RECORD’S EVENTS, a burst on one row, and no count lost past `first`', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);
  value(k.update('skills', 'skills#3', { body: '# Deploy\nTag first.' }, OWNER));
  value(k.update('skills', 'skills#3', { body: '# Deploy\nTag first, then push.' }, OWNER));

  const feed = readBlock(deps, { kind: 'feed', source: 'activity', where: 'actor is you', since: 'seen', empty: 'Nothing yet.' });
  assert.deepEqual(feed.refusals, []);
  assert.ok((feed.feed ?? []).length > 0);
  assert.equal(feed.feed?.[0]?.count, 2, 'two edits in a row to one skill are one row');
  assert.equal(feed.feed?.[0]?.kind, 'edit');
  assert.equal(feed.seen, null, 'a reader with no mark has none');
  assert.equal(feed.feed?.reduce((n, r) => n + r.count, 0), feed.matched);

  const cut = readBlock(deps, { kind: 'feed', source: 'activity', first: 2, empty: 'Nothing yet.' });
  assert.equal(cut.feed?.length, 3, 'two rows, and one more for the rest of the group');
  assert.equal(cut.feed?.at(-1)?.who, null);
  assert.equal(cut.feed?.reduce((n, r) => n + r.count, 0), cut.matched);

  assert.deepEqual(readBlock(deps, { kind: 'feed', source: 'activity', where: 'actor is agent', empty: 'Nothing yet.' }).feed, []);
  assert.equal(readBlock(deps, { kind: 'feed', source: 'activity', where: 'actor is robot', empty: 'Nothing yet.' }).refusals[0]?.code, 'ENUM_VALUE_UNKNOWN');

  const { activity: _unwired, ...bare } = deps;
  assert.equal(readBlock(bare, { kind: 'feed', source: 'activity', empty: 'Nothing yet.' }).refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  sql.close();
});

test('an actor is an agent, a rule or you, and each is its own group', () => {
  const at = '2026-09-15T12:00:00Z';
  const event = (actor: string): ActivityEvent => ({ ts: at, actor, kind: 'edit', target: actor, note: null });
  const rows = feedRows(['S4', 'agent:claude', 'spark', 'rule:renewal', 'ingest:mail', 'system', 'p_1'].map(event));
  assert.deepEqual(rows.map((r) => r.by), ['agent', 'agent', 'agent', 'rule', 'rule', 'rule', 'you']);
});
