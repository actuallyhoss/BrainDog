/**
 * Projects by git remote (DIRECTION §37's one-field fix, made in the matcher): a run is placed by the remote every run
 * records, `github.com/actuallyhoss/BrainDog`, and failing that by the last name of the folder it works in, so a project
 * row that still lists the folder Windows wrote no longer decides where a Mac's runs belong.
 *
 * MEASURED BEFORE: the owner's BrainDog row listed `C:\Repos\braindog`, and every run in BrainDog's own checkout on the
 * Mac was told "No project here", so it read none of the project's rows and filed its work as applying everywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type SessionHints, type WriteContext } from '../src/index.ts';
import { matchProject, type Candidate } from '../src/scope.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);

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

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const as = (session: SessionHints): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session });

/** The owner's rows as the Windows PC left them: BrainDog by its Windows folder alone, Encore by its remote. */
async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, TASKS]));
  const ids = [
    { name: 'BrainDog', folders: ['C:\\Repos\\braindog'] },
    { name: 'Encore', repos: ['git@bitbucket.org:encore/Encore_PREPROD.git'] },
  ].map((row) => value<Entry>(k.create('things', row, { actor: 'p_owner' })).id);
  return { k, sql, ids };
}

const placed = (k: Awaited<ReturnType<typeof record>>['k'], where: Parameters<Awaited<ReturnType<typeof record>>['k']['resolveProject']>[0]) => {
  const r = k.resolveProject(where);
  return r.project ? `${r.project.spoken} by ${r.project.how}` : r.ambiguous.length ? `between ${r.ambiguous.join(' and ')}` : null;
};

test('THE OWNER’S BRAINDOG ROW IS FOUND FROM THE MAC by the remote’s name, though it lists only the folder Windows wrote', async () => {
  const { k, sql, ids } = await record();
  const mac = { remote: 'https://github.com/actuallyhoss/BrainDog.git', repo: 'braindog', cwd: '/Users/sam/Developer/braindog' };
  assert.equal(placed(k, mac), 'things#1 by repo');
  assert.equal(placed(k, { remote: 'git@github.com:actuallyhoss/BrainDog' }), 'things#1 by repo', 'the remote alone does not find it');
  assert.equal(placed(k, { repo: 'BrainDog' }), 'things#1 by repo');

  /* And the run that opens there is in it: what it adds lands in BrainDog, and it is named for it. */
  const task = value<Entry>(k.create('tasks', { what: 'Ship the brief' }, as({ ...mac, client_id: 'cc-1', host: 'mbp', agent: 'claude' })));
  assert.equal(task.fields.thing, ids[0]);
  assert.deepEqual([k.get('S1')!.fields.project, k.get('S1')!.fields.doing], ['things#1', 'Claude in BrainDog']);
  sql.close();
});

test('A RUN IN A SUBFOLDER OR A WORKTREE IS FOUND BY THE NEAREST FOLDER THAT CARRIES A PROJECT’S NAME', async () => {
  const { k, sql } = await record();
  /* The hook in a subfolder, with git too slow to answer: no remote and no repository, only the folder. */
  assert.equal(placed(k, { cwd: '/Users/sam/Developer/braindog/loop' }), 'things#1 by repo');
  assert.equal(placed(k, { cwd: '/Users/sam/Developer/braindog/.claude/worktrees/agent-aad7846157cdaa3ef' }), 'things#1 by repo');
  /* A worktree whose folder is its repository's name still has the remote it was cut from. */
  assert.equal(placed(k, { repo: 'agent-aad7846157cdaa3ef', remote: 'github.com/actuallyhoss/BrainDog' }), 'things#1 by repo');
  /* A scratch folder carries no project's name, and a run there is global, as it was. */
  assert.equal(placed(k, { cwd: '/private/tmp/claude-501/-Users-sam-Developer/044b77b1/scratchpad' }), null);
  assert.equal(placed(k, { cwd: 'C:\\Users\\sam\\AppData\\Local\\Temp' }), null);
  sql.close();
});

test('A REMOTE IS THE SAME REPOSITORY IN ANY CASE, and in any of the forms git writes it', async () => {
  const { k, sql } = await record();
  for (const remote of ['https://bitbucket.org/encore/encore_preprod', 'git@BITBUCKET.org:Encore/Encore_PREPROD.git', 'ssh://git@bitbucket.org/encore/Encore_PREPROD'])
    assert.equal(placed(k, { remote }), 'things#2 by remote', remote);
  sql.close();
});

test('NAMES ARE MATCHED LAST AND NEVER GUESSED: an exact remote or folder wins, and two projects of one name leave the run global', () => {
  const projects: Candidate[] = [
    { id: 'p1', spoken: 'things#1', repos: ['github.com/acme/site'], folders: [] },
    { id: 'p2', spoken: 'things#2', repos: ['github.com/other/site'], folders: [] },
    { id: 'p3', spoken: 'things#3', repos: [], folders: ['/home/sam/site'] },
  ];
  const at = (where: Parameters<typeof matchProject>[1]) => {
    const r = matchProject(projects, where);
    return r.project ? `${r.project.spoken} by ${r.project.how}` : r.ambiguous;
  };
  assert.equal(at({ remote: 'https://github.com/acme/site.git' }), 'things#1 by remote');
  assert.equal(at({ remote: 'https://github.com/third/site', cwd: '/home/sam/site/src' }), 'things#3 by folder');
  assert.deepEqual(at({ remote: 'https://github.com/third/site' }), ['things#1', 'things#2', 'things#3']);
  assert.deepEqual(at({ repo: 'elsewhere' }), []);
});
