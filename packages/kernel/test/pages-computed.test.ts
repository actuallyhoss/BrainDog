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

import type { ActionRow } from '../src/actions.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { agentRows, feedRows, readBlock, versionsOf, type ActivityEvent, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
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

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  /* THE CLOCK COMES BACK OUT, so a test that needs a write to have happened an hour ago can put it
     there rather than wait for one. Every read below still asks at `NOW`. */
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([PROJECTS, SKILLS, KEYS]));
  value(k.create('things', { name: 'Kiln' }, OWNER));
  value(k.create('things', { name: 'Portage' }, OWNER));
  value(k.create('skills', { name: 'review-pr', body: '# Review\nRead the diff.' }, OWNER));
  value(k.create('skills', { name: 'review-pr', body: '# Review\nRead the diff.\nCheck the outlines.', project: 'things#1' }, OWNER));
  value(k.create('skills', { name: 'deploy', body: '# Deploy' }, OWNER));
  value(k.create('credentials', { label: 'Kiln deploy key', project: 'things#1' }, OWNER));
  value(k.create('credentials', { label: 'DNS' }, OWNER));
  return { k, sql, clock };
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
    sessionsLive: () => {
      const out = k.list({ register: 'session', where: { field: 'state', in: ['active', 'idle'] }, order: [{ field: 'last_seen', dir: 'desc' }], limit: 200 });
      return out.ok ? out.value.rows : [];
    },
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

test('AN `agents` BLOCK IS THE AGENTS’ WORK, one group per agent, and each agent keeps its own rest past `first`', () => {
  const at = '2026-09-15T12:00:00Z';
  const event = (actor: string, target: string): ActivityEvent => ({ ts: at, actor, kind: 'edit', target, note: null });
  const rows = agentRows([event('S4', 'a'), event('S4', 'a'), event('S4', 'b'), event('S7', 'c'), event('S4', 'd'), event('S7', 'e')], 1);
  assert.deepEqual(
    rows.map((r) => [r.who, r.count, r.target]),
    [['S4', 2, 'a'], ['S7', 1, 'c'], ['S4', 2, null], ['S7', 1, null]],
    'a burst is one row, and past one row an agent’s rest is one row with its name kept',
  );
});

test('THE RECORD WIRES ITS OWN ACTIVITY: an agents block reads agents only, names rows as a page does, and leaves the owner’s lines out', async () => {
  const { k, sql } = await record();
  value(k.update('skills', 'skills#3', { body: '# Deploy\nTag first.' }, { actor: 'S2' }));
  value(k.update('skills', 'skills#3', { body: '# Deploy\nTag, then push.' }, { actor: 'S2' }));
  value(k.create('things', { name: 'Harbour' }, { actor: 'S5' }));
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind) VALUES ('ev_grant', '2026-09-15T12:00:00Z', 'S2', 'grant.add', 'grant:g_1', 'grant')");

  const agents = k.block({ kind: 'agents', source: 'activity', first: 5, empty: 'Nothing yet.' } as PageBlock);
  assert.deepEqual(agents.refusals, []);
  assert.deepEqual(
    (agents.feed ?? []).map((r) => [r.who, r.count, r.kind, r.target, r.thing]),
    [['S5', 1, 'create', 'things#3', 'Harbour'], ['S2', 2, 'edit', 'skills#3', 'deploy']],
    'no grant line, and no person’s writes',
  );
  const feed = k.block({ kind: 'feed', source: 'activity', empty: 'Nothing yet.' } as PageBlock);
  assert.ok((feed.feed ?? []).some((r) => r.by === 'you'), 'a feed still reads everybody');
  sql.close();
});

/* ── the runs working now ────────────────────────────────────────────────── */

test('SESSIONS.LIVE IS THE RUNS NOT FINISHED, the most recently seen first, filtered and cut as a register is', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);
  const run = (doing: string, agent: string, state: string, hoursAgo: number) =>
    value(k.create('session', { doing, agent, state }, { actor: OWNER.actor, stamp: { last_seen: new Date(NOW - hoursAgo * 3_600_000).toISOString(), project: 'things#1' } }));
  run('Axis QA', 'claude', 'active', 1);
  run('Specimen copy', 'codex', 'idle', 0.1);
  run('Kerning pass', 'claude', 'done', 0.05);

  const block: PageBlock = {
    kind: 'cards',
    source: 'sessions.live',
    columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
    empty: 'No agent is working right now.',
  };
  const live = readBlock(deps, block);
  assert.deepEqual(live.refusals, []);
  assert.deepEqual(live.rows.map((r) => r.fields.doing), ['Specimen copy', 'Axis QA'], 'a finished run is not live, and the newest seen leads');
  assert.equal(live.matched, 2);

  assert.deepEqual(readBlock(deps, { ...block, where: 'agent is claude' }).rows.map((r) => r.fields.doing), ['Axis QA']);
  const cut = readBlock(deps, { ...block, limit: 1 });
  assert.equal(cut.rows.length, 1);
  assert.equal(cut.matched, 2, 'the count is of every live run, not of the ones shown');

  assert.equal(readBlock(deps, { ...block, order: [{ field: 'doing' }] }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(readBlock(deps, { ...block, columns: [{ field: 'colour' }] }).refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(readBlock(deps, { ...block, where: 'colour is red' }).rows.length, 0);

  const { sessionsLive: _unwired, ...bare } = deps;
  const early = readBlock(bare, block);
  assert.equal(early.refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(early.rows, []);
  sql.close();
});

test('A RUN’S PROJECT IS NAMED, not left as the spoken id the ladder wrote', async () => {
  const { k, sql } = await record();
  const deps = depsOver(k, sql);
  const run = (doing: string, hoursAgo: number, project?: string) =>
    value(
      k.create('session', { doing, agent: 'claude', state: 'active' }, {
        actor: OWNER.actor,
        stamp: { last_seen: new Date(NOW - hoursAgo * 3_600_000).toISOString(), ...(project === undefined ? {} : { project }) },
      }),
    );
  run('Axis QA', 0.1, 'things#1');
  run('Newsletter', 0.2, 'things#2');
  run('Nowhere yet', 0.3);
  run('A project since deleted', 0.4, 'things#9');

  const live = readBlock(deps, { kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }, { field: 'project', as: 'fact' }], empty: 'None.' });
  assert.deepEqual(live.refusals, []);
  assert.equal(live.rows[0]?.fields.project, 'things#1', 'the row keeps what the run holds');
  assert.deepEqual(live.scopes, ['Kiln', 'Portage', null, 'things#9'], 'a name, nothing for no project, and an id that names no row as it was written');
  sql.close();
});

test('an actor is an agent, a rule or you, and each is its own group', () => {
  const at = '2026-09-15T12:00:00Z';
  const event = (actor: string): ActivityEvent => ({ ts: at, actor, kind: 'edit', target: actor, note: null });
  const rows = feedRows(['S4', 'agent:claude', 'slash', 'rule:renewal', 'ingest:mail', 'system', 'p_1'].map(event));
  assert.deepEqual(rows.map((r) => r.by), ['agent', 'agent', 'agent', 'rule', 'rule', 'rule', 'you']);
});

test('AN `actions` BLOCK LISTS THE RECORD’S SCHEDULED ACTIONS, keys by label, and filters on where each stands', async () => {
  const { k, sql } = await record();
  const action = (ingest: string, state: ActionRow['state'], project: string | null): ActionRow => ({
    ingest,
    channel: 'poll',
    project,
    host: 'status.example.test',
    every: '1h',
    key: 'status read',
    state,
    next: state === 'paused' ? null : '2026-09-09T13:00:00.000Z',
    last: { at: '2026-09-09T11:00:00.000Z', outcome: 'ok', status: 200, note: '' },
    month: { runs: 3, requests: 3, bytes: 90, failures: 1, held: 0 },
    days: [],
  });
  const deps: PageDeps = { ...depsOver(k, sql), actions: () => [action('balance', 'pending', null), action('kiln_status', 'paused', 'Kiln')] };

  const block: PageBlock = { kind: 'table', source: 'actions', columns: [{ field: 'ingest' }, { field: 'host' }, { field: 'key' }, { field: 'state' }] };
  const all = readBlock(deps, block);
  assert.deepEqual(all.refusals, []);
  assert.deepEqual(
    all.rows.map((r) => [r.fields.ingest, r.fields.key, r.fields.state, r.fields.runs, r.fields.last_outcome]),
    [
      ['balance', 'status read', 'pending', 3, 'ok'],
      ['kiln_status', 'status read', 'paused', 3, 'ok'],
    ],
  );
  assert.equal(all.matched, 2);
  /* THE LAST RUN'S STATUS AND NOTE, so a host can say why an action paused rather than guess. */
  assert.deepEqual([all.rows[0]?.fields.last_status, all.rows[0]?.fields.last_note], [200, '']);
  assert.deepEqual(readBlock(deps, { ...block, where: 'state is paused' }).rows.map((r) => r.fields.ingest), ['kiln_status']);
  assert.equal(readBlock(deps, { ...block, limit: 1 }).matched, 2);

  assert.equal(readBlock(deps, { ...block, order: [{ field: 'ingest' }] }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(readBlock(deps, { ...block, columns: [{ field: 'secret' }] }).refusals[0]?.code, 'FIELD_UNKNOWN');
  const { actions: _unwired, ...bare } = deps;
  assert.equal(readBlock(bare, block).refusals[0]?.code, 'NOT_IN_THIS_BUILD');

  /* AND THROUGH THE RECORD'S OWN WIRING, an installed poll is a row of it. */
  value(
    await k.install([
      { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text' }] } as never },
      {
        id: 'ingest.balance',
        kind: 'ingest',
        body: { ingest: 'balance', channel: 'poll', url: 'https://api.example.test/v1/balance', every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
      },
    ]),
  );
  const wired = k.block({ kind: 'table', source: 'actions' } as PageBlock);
  assert.deepEqual(wired.refusals, []);
  assert.deepEqual(wired.rows.map((r) => [r.fields.ingest, r.fields.host, r.fields.state]), [['balance', 'api.example.test', 'pending']]);
  sql.close();
});

/*
 * ── what is waiting on a person ───────────────────────────────────────────
 *
 * Every assertion below goes through `k.block`, which is the record's own wiring of `openQuestions`,
 * because the half worth testing is the mapping from a governance row to a question: a body is
 * whatever the proposer wrote, and the read has to survive one that is wrong.
 */
test('GOVERNANCE.OPEN IS THE QUESTIONS STILL OPEN, newest first as the register keeps them, with the options their bodies carry', async () => {
  const { k, sql } = await record();
  const opt = (id: string, label: string, because: string, recommended?: boolean) => ({ id, label, because, ...(recommended ? { recommended } : {}) });
  const first = value<{ id: string }>(
    k.propose(
      {
        question: 'Raise the retainer on Kiln?',
        body_kind: 'options',
        body: { context: 'Kiln has run over for two months.', options: [opt('raise', 'Raise it', 'Covers the overrun', true), opt('leave', 'Leave it', 'Keeps the price it was quoted at')] },
      },
      'slash',
    ),
  );
  const second = value<{ id: string }>(
    k.propose({ question: 'Add the Portage deploy key?', body_kind: 'rowset', body: { register: 'credentials', rows: [{ label: 'Portage deploy key' }] } }, 'slash'),
  );

  const drawn = k.block({ kind: 'queue', source: 'governance.open' } as PageBlock);
  assert.deepEqual(drawn.refusals, []);
  assert.deepEqual(
    (drawn.queue ?? []).map((q) => [q.id, q.who, q.kind, q.question, q.why]),
    [
      [second.id, 'slash', 'rowset', 'Add the Portage deploy key?', ''],
      [first.id, 'slash', 'options', 'Raise the retainer on Kiln?', 'Kiln has run over for two months.'],
    ],
  );
  assert.equal(drawn.matched, 2);
  assert.ok((drawn.queue?.[0]?.at ?? '').startsWith('2026-09-15'));

  /* THE OPTIONS ARE THE BODY'S OWN, and a kind that has none comes back with none: the two words a
     rowset is answered with are the drawer's to write, not the kernel's. */
  assert.deepEqual(
    (drawn.queue?.[1]?.options ?? []).map((o) => [o.key, o.label, o.because, o.recommended]),
    [
      ['raise', 'Raise it', 'Covers the overrun', true],
      ['leave', 'Leave it', 'Keeps the price it was quoted at', false],
    ],
  );
  assert.deepEqual(drawn.queue?.[0]?.options, []);

  /* AN ANSWERED QUESTION LEAVES, which is the one thing a queue must get right: a person who answers
     and still sees it waiting answers it twice. */
  value(k.decide(first.id, { decide: { option: 'leave', reason: 'The quote stands.' } }, 'p_1'));
  assert.deepEqual(k.block({ kind: 'queue', source: 'governance.open' } as PageBlock).queue?.map((q) => q.id), [second.id]);

  sql.close();
});

test('A QUEUE SAYS HOW MANY ARE WAITING PAST THE ONES IT DRAWS, and a where: narrows both', async () => {
  const { k, sql } = await record();
  const options = [
    { id: 'yes', label: 'Yes', because: 'It is due' },
    { id: 'no', label: 'No', because: 'It is not' },
  ];
  for (let i = 0; i < 5; i += 1) value(k.propose({ question: `Question ${i}?`, body_kind: 'options', body: { options } }, i < 2 ? 'slash' : 'p_1'));

  /* THREE IS WHAT A QUEUE DRAWS UNASKED, and the count is of everything open rather than of the page read. */
  const three = k.block({ kind: 'queue', source: 'governance.open' } as PageBlock);
  assert.equal(three.queue?.length, 3);
  assert.equal(three.matched, 5);
  assert.equal(k.block({ kind: 'queue', source: 'governance.open', limit: 2 } as PageBlock).queue?.length, 2);

  /* WITH A PREDICATE THE COUNT IS OF WHAT THE PAGE COULD SEE, and says so by being smaller. */
  const mine = k.block({ kind: 'queue', source: 'governance.open', where: 'who is slash' } as PageBlock);
  assert.equal(mine.matched, 2);
  assert.deepEqual(mine.queue?.map((q) => q.who), ['slash', 'slash']);

  /* AND THE RECORD'S ORDER IS THE ONLY ORDER, because a source that settles it would be answering twice. */
  assert.equal(k.block({ kind: 'queue', source: 'governance.open', order: [{ field: 'who' }] } as PageBlock).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(k.block({ kind: 'queue', source: 'governance.open', where: 'colour is red' } as PageBlock).refusals[0]?.code, 'FIELD_UNKNOWN');

  /* AN UNWIRED HOST IS TOLD SO RATHER THAN HANDED AN EMPTY QUEUE, which would read as "nothing is waiting". */
  const { openQuestions: _unwired, ...bare } = depsOver(k, sql);
  assert.equal(readBlock(bare, { kind: 'queue', source: 'governance.open' }).refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  sql.close();
});

/* ── working: true ───────────────────────────────────────────────────────── */

test('WORKING: TRUE MARKS THE ROWS AN AGENT IS ON RIGHT NOW, by the run that signed the write and not by the agent’s name', async () => {
  const { k, sql, clock } = await record();
  const deps = depsOver(k, sql);
  /* Two runs of one agent: one still going, one that has stopped. Their NAMES are what a write is
     signed with, which is how "Claude is open somewhere" is told apart from "Claude is on this row". */
  const run = (doing: string, state: string) =>
    value<Entry>(k.create('session', { doing, agent: 'claude', state }, { actor: OWNER.actor, stamp: { last_seen: new Date(NOW - 5 * 60_000).toISOString() } }));
  const going = `S${String(run('Axis QA', 'active').seq)}`;
  const stopped = `S${String(run('Kerning pass', 'idle').seq)}`;

  const skills = value<{ rows: Entry[] }>(k.list({ register: 'skills', order: [{ field: 'seq' }] })).rows;
  const touch = (row: Entry, actor: string) => value(k.update('skills', row.id, { body: `# Touched by ${actor}` }, { actor }));

  clock.set(NOW - 3 * 60_000);
  touch(skills[0]!, going);
  touch(skills[1]!, stopped);
  touch(skills[2]!, OWNER.actor);
  clock.set(NOW);

  const block: PageBlock = { kind: 'todo', source: 'register.skills', columns: [{ field: 'name' }], order: [{ field: 'seq' }], working: true };
  const drawn = readBlock(deps, block);
  assert.deepEqual(drawn.refusals, []);
  assert.deepEqual(drawn.working_now, [true, false, false], 'the live run’s row alone: not the stopped run’s, and not the owner’s');

  /* THE SECOND CLOCK. A write by a run that is still going, made four hours ago, is not somebody
     working on that row now: it is a row that run finished with. */
  clock.set(NOW - 4 * 3_600_000);
  touch(skills[2]!, going);
  clock.set(NOW);
  assert.deepEqual(readBlock(deps, block).working_now, [true, false, false], 'a write older than the staleness window is not work in progress');

  /* NOT ASKED, NOT ANSWERED: it reads every row’s history, and no page pays for a key it did not write. */
  assert.equal(readBlock(deps, { ...block, working: false }).working_now, undefined);
  assert.equal(readBlock(deps, { kind: 'todo', source: 'register.skills', columns: [{ field: 'name' }] }).working_now, undefined);

  /* AND A RECORD WIRED FOR HALF THE QUESTION SAYS SO, rather than answering false for every row. */
  const { sessionsLive: _unwired, ...bare } = deps;
  const early = readBlock(bare, block);
  assert.equal(early.refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(early.working_now, undefined);
  sql.close();
});
