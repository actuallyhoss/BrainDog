/**
 * Scope: where a row applies, and how a run learns which project it is in.
 *
 * Two scopes, global and one project, and a run is placed by where it runs. What is asserted here is
 * how a place is matched to a project, that a token's writes start in its run's project and never
 * move a row outward, that the nearer row wins where a register says so, and that the kernel's own
 * register cannot be retired out from under the runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

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
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person', same: 'nearer' } },
      { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
    ],
  },
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things', scope: {} },
    ],
  },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const OWNER: WriteContext = { actor: 'p_owner' };

/** A token's write, carrying whatever its run says about itself. */
const agent = (session: SessionHints = {}): WriteContext => ({
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session,
});

/** Three projects: BrainDog by remote, name and folder; Site by a parent folder; Studio off Windows. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; ids: string[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, SKILLS, TASKS, PEOPLE]));
  const ids = [
    { name: 'BrainDog', repos: ['github.com/acme/braindog', 'braindog'], folders: ['C:\\Repos\\braindog'] },
    { name: 'Site', repos: ['git@github.com:Acme/site.git'], folders: ['C:\\Repos'] },
    { name: 'Studio', repos: ['https://gitlab.com/studio/studio-web'], folders: ['/home/sam/studio'] },
  ].map((row) => value<Entry>(k.create('things', row, OWNER)).id);
  return { k, sql, ids };
}

const placed = (k: Kernel, where: Parameters<Kernel['resolveProject']>[0]) => {
  const r = k.resolveProject(where);
  return { project: r.project ? `${r.project.spoken} by ${r.project.how}` : null, ambiguous: r.ambiguous };
};

const runs = (sql: NodeSql): number => sql.all("SELECT 1 FROM entry WHERE register = 'session'").length;

/* ── resolving a place to a project ──────────────────────────────────────── */

test('A REMOTE MATCHES whatever form it is written in, and it wins over the folder', async () => {
  const { k, sql } = await record();
  for (const remote of [
    'https://sam@GitHub.com/acme/braindog.git',
    'ssh://git@github.com:22/acme/braindog',
    'git@github.com:acme/braindog.git',
    'github.com/acme/braindog/',
  ])
    assert.deepEqual(placed(k, { remote }), { project: 'things#1 by remote', ambiguous: [] }, remote);

  /* The project wrote its remote in the scp form, and a run may say it any way. */
  assert.deepEqual(placed(k, { remote: 'https://github.com/Acme/site' }), { project: 'things#2 by remote', ambiguous: [] });
  assert.deepEqual(placed(k, { remote: 'https://gitlab.com/studio/studio-web.git', cwd: 'C:\\Repos\\braindog' }), {
    project: 'things#3 by remote',
    ambiguous: [],
  });
  /* A remote nobody lists is passed over, and the folder decides. */
  assert.deepEqual(placed(k, { remote: 'https://github.com/someone/else', cwd: 'C:\\Repos\\braindog\\apps' }), {
    project: 'things#1 by folder',
    ambiguous: [],
  });
  sql.close();
});

test('A FOLDER MATCHES as Windows writes it, and the longest folder wins', async () => {
  const { k, sql } = await record();
  const at = (cwd: string) => placed(k, { cwd }).project;

  assert.equal(at('c:/repos/BrainDog/packages/kernel'), 'things#1 by folder', 'the braindog folder is longer than C:\\Repos');
  assert.equal(at('C:\\Repos\\braindog'), 'things#1 by folder');
  assert.equal(at('C:\\Repos\\braindog\\'), 'things#1 by folder');
  assert.equal(at('C:\\Repos\\other'), 'things#2 by folder');
  assert.equal(at('C:\\Repos\\braindogs'), 'things#2 by folder', 'a longer name is not a folder inside');
  assert.equal(at('/home/sam/studio/src'), 'things#3 by folder');
  assert.equal(at('/HOME/sam/studio'), null, 'case is ignored on a drive letter only');
  assert.equal(at('D:\\tmp'), null);
  sql.close();
});

test('A BARE REPO NAME MATCHES LAST, and only a repos entry with no slash', async () => {
  const { k, sql } = await record();
  assert.deepEqual(placed(k, { repo: 'BrainDog' }), { project: 'things#1 by repo', ambiguous: [] });
  assert.deepEqual(placed(k, { repo: 'braindog', cwd: 'D:\\elsewhere' }), { project: 'things#1 by repo', ambiguous: [] });
  assert.deepEqual(placed(k, { repo: 'site' }), { project: null, ambiguous: [] }, 'Site lists a remote, not a name');
  assert.deepEqual(placed(k, {}), { project: null, ambiguous: [] });
  sql.close();
});

test('TWO PROJECTS AT THE SAME STRENGTH LEAVE THE RUN GLOBAL, and are named', async () => {
  const { k, sql } = await record();
  value(k.create('things', { name: 'Fork', repos: ['https://github.com/acme/braindog'], folders: ['c:/repos/braindog/'] }, OWNER));

  assert.deepEqual(placed(k, { cwd: 'C:\\Repos\\braindog\\docs' }), { project: null, ambiguous: ['things#1', 'things#4'] });
  /* A tie at the remote is not settled by the folder, which is a weaker rung. */
  assert.deepEqual(placed(k, { remote: 'git@github.com:acme/braindog.git', cwd: 'C:\\Repos\\braindog' }), {
    project: null,
    ambiguous: ['things#1', 'things#4'],
  });
  sql.close();
});

/* ── the ladder places the run ───────────────────────────────────────────── */

test('A RUN OPENED IN A MATCHING REPO GETS ITS PROJECT, and a run re-attached elsewhere is placed again', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { what: 'Wire scope' }, agent({ client_id: 'cc-1', remote: 'git@github.com:acme/braindog.git', host: 'h' })));
  const run = k.get('S1')!;
  assert.equal(run.fields.project, 'things#1');

  value(k.create('tasks', { what: 'Anywhere' }, agent({ client_id: 'cc-2', cwd: 'D:\\tmp' })));
  assert.equal(k.get('S2')?.fields.project, undefined, 'a run opened nowhere in particular is global');

  /* Named by its spoken id from another folder, the run keeps its place. */
  value(k.create('tasks', { what: 'Still here' }, agent({ spoken: 'S1', cwd: '/home/sam/studio' })));
  assert.equal(k.get('S1')?.fields.project, 'things#1');

  /* By its client id with no place given, likewise. */
  value(k.create('tasks', { what: 'No hints' }, agent({ client_id: 'cc-1' })));
  assert.equal(k.get('S1')?.fields.project, 'things#1');

  /* Re-attached from Studio's folder, it is in Studio, and the record noting that is not an edit. */
  value(k.create('tasks', { what: 'Moved' }, agent({ client_id: 'cc-1', cwd: '/home/sam/studio/src' })));
  const moved = k.get('S1')!;
  assert.equal(moved.fields.project, 'things#3');
  assert.equal(moved.version, run.version);

  /* And from a folder that is nobody's, it is global again. */
  value(k.create('tasks', { what: 'Adrift' }, agent({ client_id: 'cc-1', cwd: 'D:\\tmp' })));
  assert.equal(k.get('S1')?.fields.project, undefined);
  assert.equal(runs(sql), 2);
  sql.close();
});

/* ── a token's writes ────────────────────────────────────────────────────── */

test('THE CREATE DEFAULT: what a token adds lands in its run’s project, and a person’s does not', async () => {
  const { k, sql, ids } = await record();
  const here = agent({ client_id: 'cc-1', cwd: 'C:\\Repos\\braindog' });

  assert.equal(value<Entry>(k.create('tasks', { what: 'Mine' }, here)).fields.thing, ids[0]);
  assert.equal(value<Entry>(k.create('skills', { name: 'review-pr' }, here)).fields.project, ids[0]);
  assert.equal(value<Entry>(k.create('tasks', { what: 'Theirs' }, OWNER)).fields.thing, undefined);
  assert.equal(
    value<Entry>(k.create('tasks', { what: 'Global' }, agent({ client_id: 'cc-2', cwd: 'D:\\tmp' }))).fields.thing,
    undefined,
    'a global run adds global rows',
  );
  /* widen is any on a task, so a token may say another project outright. */
  assert.equal(value<Entry>(k.create('tasks', { what: 'Studio', thing: 'things#3' }, here)).fields.thing, ids[2]);
  sql.close();
});

test('A TOKEN NEVER WIDENS: it may narrow a global row, and moving a row out of its project is FORBIDDEN', async () => {
  const { k, sql, ids } = await record();
  const here = agent({ client_id: 'cc-1', cwd: 'C:\\Repos\\braindog' });

  /* Nothing is opened by a write refused for its scope. */
  for (const project of ['things#3', null]) {
    const r = refusal(k.create('skills', { name: 'deploy', project }, here));
    assert.equal(r.code, 'FORBIDDEN');
    assert.equal(r.at, 'project');
    assert.match(r.fix, /things#1/);
  }
  assert.equal(runs(sql), 0);

  const mine = value<Entry>(k.create('skills', { name: 'deploy' }, here));
  for (const project of [null, 'things#2']) {
    const r = refusal(k.update('skills', mine.id, { project }, here));
    assert.equal(r.code, 'FORBIDDEN', `moved to ${String(project)}`);
    assert.match(r.fix, /never widen it\. Propose the move/);
  }
  assert.equal(k.get(mine.id)?.fields.project, ids[0]);

  /* Global to a project is narrowing, even to a project the run is not in. */
  const global = value<Entry>(k.create('skills', { name: 'lint' }, OWNER));
  assert.equal(value<Entry>(k.update('skills', global.id, { project: 'things#3' }, here)).fields.project, ids[2]);
  /* A global run may narrow what it adds in the same way. */
  const away = agent({ client_id: 'cc-2', cwd: 'D:\\tmp' });
  assert.equal(value<Entry>(k.create('skills', { name: 'studio-only', project: 'things#3' }, away)).fields.project, ids[2]);

  /* The move outward is the owner's, one press. */
  assert.equal(value<Entry>(k.update('skills', mine.id, { project: null }, OWNER)).fields.project, undefined);
  /* And where widen is any, a token may move a row anywhere. */
  const task = value<Entry>(k.create('tasks', { what: 'Loose' }, here));
  assert.equal(value<Entry>(k.update('tasks', task.id, { thing: null }, here)).fields.thing, undefined);
  sql.close();
});

test('LINKS ONLY GROW: a token adds a project to a person and never removes one', async () => {
  const { k, sql, ids } = await record();
  const here = agent({ client_id: 'cc-1', cwd: 'C:\\Repos\\braindog' });
  const ada = value<Entry>(k.create('people', { name: 'Ada', projects: ['things#1'] }, OWNER));

  assert.deepEqual(value<Entry>(k.update('people', ada.id, { projects: ['things#1', 'things#3'] }, here)).fields.projects, [
    ids[0],
    ids[2],
  ]);
  for (const projects of [['things#3'], []]) {
    const r = refusal(k.update('people', ada.id, { projects }, here));
    assert.equal(r.code, 'FORBIDDEN');
    assert.equal(r.at, 'projects');
    assert.match(r.fix, /never remove one, and this removes things#1/);
  }
  assert.deepEqual(value<Entry>(k.update('people', ada.id, { projects: ['things#3'] }, OWNER)).fields.projects, [ids[2]]);
  sql.close();
});

/* ── reading by scope ────────────────────────────────────────────────────── */

test('NEARER WINS: a project’s own skill hides the global one of that name, and only while it applies', async () => {
  const { k, sql } = await record();
  const here = agent({ client_id: 'cc-1', cwd: 'C:\\Repos\\braindog' });
  value(k.create('skills', { name: 'review-pr' }, OWNER));
  value(k.create('skills', { name: 'deploy' }, OWNER));
  const ours = value<Entry>(k.create('skills', { name: 'review-pr' }, here));
  value(k.create('skills', { name: 'review-pr', project: 'things#3' }, OWNER));

  const names = (rows: Entry[]) => rows.map((r) => r.fields.name).sort();
  const seen = (project: string | null) => {
    const r = value<{ rows: Entry[]; inherited: Entry[] }>(k.inScope('skills', project));
    return { rows: names(r.rows), inherited: names(r.inherited) };
  };

  assert.deepEqual(seen('things#1'), { rows: ['review-pr'], inherited: ['deploy'] });
  assert.deepEqual(seen('things#2'), { rows: [], inherited: ['deploy', 'review-pr'] });
  assert.deepEqual(seen(null), { rows: [], inherited: ['deploy', 'review-pr'] }, 'a global run inherits everything global');

  value(k.update('skills', ours.id, { state: 'retired' }, OWNER));
  assert.deepEqual(seen('things#1'), { rows: ['review-pr'], inherited: ['deploy', 'review-pr'] }, 'a retired skill hides nothing');

  /* Where a register keeps both, both are read. */
  value(k.create('tasks', { what: 'Ship' }, OWNER));
  value(k.create('tasks', { what: 'Ship' }, here));
  const tasks = value<{ rows: Entry[]; inherited: Entry[] }>(k.inScope('tasks', 'things#1'));
  assert.deepEqual([tasks.rows.length, tasks.inherited.length], [1, 1]);

  /* And a person is read in every project they are linked to. */
  value(k.create('people', { name: 'Ada', projects: ['things#1', 'things#3'] }, OWNER));
  assert.equal(value<{ rows: Entry[] }>(k.inScope('people', 'things#3')).rows[0]?.fields.name, 'Ada');

  assert.equal(refusal(k.inScope('things', null)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(k.inScope('skills', 'tasks#1')).code, 'VALUE_MALFORMED');
  sql.close();
});

/* ── the declarations ────────────────────────────────────────────────────── */

test('THE SCOPE KEYS ARE CHECKED AT INSTALL: one register of projects, and a scope field that points at it', async () => {
  const { k, sql } = await record();
  const skills = (field: Record<string, unknown>, more: Record<string, unknown>[] = []): Declaration => ({
    id: 'register.notes',
    kind: 'register',
    body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text' }, field, ...more] } as never,
  });
  const cases: [Declaration, string, RegExp][] = [
    [
      { id: 'register.places', kind: 'register', body: { ...PROJECTS.body, id: 'places', name: 'Places' } },
      'DECLARATION_INVALID',
      /register\.things already declares scopes/,
    ],
    [
      { id: 'register.things', kind: 'register', body: { ...PROJECTS.body, scopes: { repos: 'remotes' } } },
      'FIELD_UNKNOWN',
      /no such field/,
    ],
    [
      { id: 'register.things', kind: 'register', body: { ...PROJECTS.body, scopes: { repos: 'name' } } },
      'DECLARATION_INVALID',
      /list of text/,
    ],
    [skills({ id: 'where', type: 'text', scope: {} }), 'DECLARATION_INVALID', /only a ref to a project/],
    [skills({ id: 'where', type: 'ref', to: 'things', scope: { widen: 'everyone' } }), 'ENUM_VALUE_UNKNOWN', /any or person/],
    [skills({ id: 'where', type: 'ref', to: 'things', scope: { links: true } }), 'DECLARATION_INVALID', /links is for a list/],
    [skills({ id: 'where', type: 'list', of: 'ref', to: 'things', scope: { same: 'nearer' } }), 'DECLARATION_INVALID', /takes links/],
    [skills({ id: 'where', type: 'ref', to: 'tasks', scope: {} }), 'DECLARATION_INVALID', /projects are the rows of register\.things/],
    [skills({ id: 'where', type: 'ref', to: 'things', scope: { wider: 'person' } }), 'DECLARATION_INVALID', /no such key/],
    [
      skills({ id: 'where', type: 'ref', to: 'things', scope: {} }, [{ id: 'also', type: 'ref', to: 'things', scope: {} }]),
      'DECLARATION_INVALID',
      /one field says where a row applies/,
    ],
  ];
  for (const [decl, code, fix] of cases) {
    const r = refusal(await k.install([decl]));
    assert.equal(r.code, code, r.fix);
    assert.match(r.fix, fix);
  }
  sql.close();
});

test('THE KERNEL’S REGISTER IS NOT RETIRED, alone or beside another', async () => {
  const { k, sql } = await record();
  for (const ids of [['register.session'], ['register.tasks', 'register.session']]) {
    const r = refusal(k.retire(ids));
    assert.equal(r.code, 'PROVIDES_CONFLICT');
    assert.equal(r.at, 'register.session');
  }
  assert.equal(k.register('session')?.name, 'Agent runs');
  assert.equal(k.register('tasks')?.name, 'Tasks', 'nothing else in the call was retired');
  sql.close();
});

test('A RUN WRITTEN BY HAND IS PLACED BY WHERE IT SAYS IT WORKED, and a caller still cannot name its project', async () => {
  const { k, sql } = await record();
  /* An import carrying a run over from another record: a person's write, with the repository and folder it worked in. */
  value(k.create('session', { agent: 'claude', doing: 'Carried over', repo: 'braindog', state: 'done' }, OWNER));
  assert.equal(k.get('S1')!.fields.project, 'things#1');
  value(k.create('session', { agent: 'claude', doing: 'Somewhere else', cwd: 'D:\tmp', state: 'done' }, OWNER));
  assert.equal(k.get('S2')!.fields.project, undefined, 'a run from nowhere a project names is global');
  assert.equal(refusal(k.create('session', { agent: 'claude', doing: 'Named', project: 'things#2' }, OWNER)).code, 'IMMUTABLE_FIELD');
  sql.close();
});
