/**
 * A run is placed by what it is, never by what it is called (research audit 14, M1; research understanding 38).
 *
 * A remote is compared whole, `host/owner/name`; a last name alone is a question for the person, one project or
 * several, and never a placing; a run is placed once and never moved; and a repository the record does not know, seen
 * in three runs or more, comes back as one "Start a project?" suggestion with its remote and folder filled in.
 *
 * MEASURED BEFORE: `named()` compared the last name of every place a project listed and settled one hit silently, so a
 * fork, another company's `app`, and any run working under a folder called `web`, `api` or `app` was filed in whichever
 * project listed a place of that name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { matchProject, placeOnce, projectSuggestions, remoteKey, suggestProjects, type Candidate, type Resolved, type SeenRun } from '../src/scope.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const PROJECTS: Candidate[] = [
  { id: 'p1', spoken: 'things#1', repos: ['github.com/me/app'], folders: [] },
  { id: 'p2', spoken: 'things#2', repos: [], folders: ['C:\\Code\\web'] },
  { id: 'p3', spoken: 'things#3', repos: ['portage'], folders: [] },
];

const at = (where: Parameters<typeof matchProject>[1], projects: readonly Candidate[] = PROJECTS) => {
  const r = matchProject(projects, where);
  return r.project ? `${r.project.spoken} by ${r.project.how}` : r.ambiguous;
};

test('A REMOTE IS COMPARED WHOLE: a fork or another owner’s repository of the same name is not the project', () => {
  assert.equal(at({ remote: 'git@github.com:me/app.git' }), 'things#1 by remote');
  assert.deepEqual(at({ remote: 'https://github.com/acme/app' }), [], 'another owner’s app');
  assert.deepEqual(at({ remote: 'https://github.com/someone/app', repo: 'app', cwd: '/Users/sam/forks/app' }), [], 'a fork');
  assert.deepEqual(at({ remote: 'https://gitlab.com/me/app' }), [], 'another host');
});

test('A LAST NAME ALONE IS A QUESTION, ONE PROJECT OR SEVERAL, and never settled', () => {
  /* The repository with no remote: `app` may be things#1, and the person says. */
  assert.deepEqual(at({ repo: 'app' }), ['things#1']);
  /* A folder up the working path called `web` points at the project listing a `web` folder, and only asks. */
  assert.deepEqual(at({ cwd: '/Users/sam/Code/web/src' }), ['things#2']);
  /* The repository's own name first, then the nearest folder: the folder it sits in is never asked about beside it. */
  assert.deepEqual(at({ repo: 'app', cwd: '/Users/sam/web/app' }), ['things#1']);
  assert.deepEqual(at({ cwd: '/Users/sam/web/notes/app/src' }), ['things#1']);
  assert.deepEqual(at({ cwd: '/Users/sam/web/notes/src' }), ['things#2']);
  /* Two projects behind the one name are both named, a choice. */
  assert.deepEqual(at({ cwd: '/Users/sam/web' }, [...PROJECTS, { id: 'p4', spoken: 'things#4', repos: [], folders: ['/srv/web'] }]), ['things#2', 'things#4']);
  /* A drive is never a name, and a place with no project's name in it is simply global. */
  assert.deepEqual(at({ cwd: 'D:\\tmp\\scratch' }), []);
});

test('A BARE NAME A PROJECT LISTS SETTLES, as the person wrote it, and a tie between two is still a choice', () => {
  assert.equal(at({ repo: 'Portage' }), 'things#3 by repo');
  assert.equal(at({ remote: 'github.com/anyone/portage' }), 'things#3 by repo');
  /* Only the repository's own name: a folder up the path called `portage` is still a question. */
  assert.deepEqual(at({ cwd: '/Users/sam/portage/newsletter' }), ['things#3']);
  const twice = [...PROJECTS, { id: 'p4', spoken: 'things#4', repos: ['portage'], folders: [] }];
  assert.deepEqual(at({ repo: 'portage' }, twice), ['things#3', 'things#4']);
});

test('A RUN IS PLACED ONCE: the first hint that resolves places it, and a placed run is never moved', () => {
  const resolved = (spoken: string | null): Resolved => ({ project: spoken ? { id: spoken, spoken, how: 'folder' } : null, ambiguous: [] });
  let asked = 0;
  const resolve = (spoken: string | null) => () => {
    asked += 1;
    return resolved(spoken);
  };
  assert.equal(placeOnce('things#1', { cwd: '/Users/sam/Code/web' }, resolve('things#2')), null, 'moved from one project to another');
  assert.equal(placeOnce(null, {}, resolve('things#2')), null, 'placed by nothing');
  assert.equal(asked, 0, 'a run with a project, or a call with no place, resolves nothing');
  assert.equal(placeOnce(null, { cwd: '/tmp' }, resolve(null)), null);
  assert.deepEqual(placeOnce(null, { cwd: 'C:\\Code\\web' }, resolve('things#2')), { id: 'things#2', spoken: 'things#2', how: 'folder' });
  assert.deepEqual(placeOnce('', { repo: 'portage' }, resolve('things#3'))?.spoken, 'things#3', 'an empty project is none');
});

test('AN UNKNOWN REPOSITORY IN THREE RUNS IS ONE "START A PROJECT?", with its remote and folder; two runs are a visit', () => {
  const seen = (at: string, more: Partial<SeenRun>): SeenRun => ({ at, ...more });
  const runs: SeenRun[] = [
    seen('2026-10-01T09:00:00Z', { remote: 'git@bitbucket.org:lanternfish/Lanternfish_PREPROD.git', repo: 'Lanternfish_PREPROD', cwd: '/Users/sam/Code/Lanternfish_PREPROD' }),
    seen('2026-10-02T09:00:00Z', { remote: 'https://bitbucket.org/lanternfish/lanternfish_preprod', cwd: '/Users/sam/Code/Lanternfish_PREPROD' }),
    /* A hook that could not read git: the repository's folder name alone, counted with the one remote of that name. */
    seen('2026-10-03T09:00:00Z', { repo: 'lanternfish_preprod', cwd: '/Users/sam/Code/Lanternfish_PREPROD/apps/web' }),
    /* Placed runs, runs with only a folder, and a repository seen twice are not asked about. */
    seen('2026-10-03T10:00:00Z', { remote: 'github.com/me/app', project: 'things#1' }),
    seen('2026-10-03T11:00:00Z', { remote: 'github.com/me/app', project: 'things#1' }),
    seen('2026-10-03T12:00:00Z', { remote: 'github.com/me/app', project: 'things#1' }),
    seen('2026-10-04T09:00:00Z', { cwd: '/tmp/a' }),
    seen('2026-10-04T10:00:00Z', { cwd: '/tmp/a' }),
    seen('2026-10-04T11:00:00Z', { cwd: '/tmp/a' }),
    seen('2026-10-05T09:00:00Z', { remote: 'github.com/me/notes' }),
    seen('2026-10-05T10:00:00Z', { remote: 'github.com/me/notes' }),
    /* Three runs in a repository a project may be, by name: that is the project's question, not a new project. */
    seen('2026-10-05T11:00:00Z', { repo: 'web' }),
    seen('2026-10-05T12:00:00Z', { repo: 'web' }),
    seen('2026-10-05T13:00:00Z', { repo: 'web' }),
  ];
  assert.deepEqual(suggestProjects(runs, PROJECTS), [
    {
      key: 'bitbucket.org/lanternfish/lanternfish_preprod',
      name: 'lanternfish_preprod',
      remote: 'https://bitbucket.org/lanternfish/lanternfish_preprod',
      folder: '/Users/sam/Code/Lanternfish_PREPROD',
      runs: 3,
    },
  ]);
  assert.deepEqual(suggestProjects(runs.slice(0, 2), PROJECTS), []);
});

test('A TEMP-LIKE FOLDER IS NEVER OFFERED AS A PROJECT, and a repository is offered only once runs worked in it on two days (scope D6)', () => {
  const seen = (at: string, more: Partial<SeenRun>): SeenRun => ({ at, ...more });
  const temp = ['01', '02', '03', '04'].map((d) => seen(`2026-10-${d}T09:00:00Z`, { repo: 'Temp', cwd: 'C:\\Users\\sam\\Temp' }));
  assert.deepEqual(suggestProjects(temp, PROJECTS), [], '4 runs in Temp suggest nothing');
  const worktree = ['01', '02', '03'].map((d) => seen(`2026-10-${d}T09:00:00Z`, { repo: 'agent-a8b9705fca6febb7f', cwd: '/Users/sam/Code/kiln/.claude/worktrees/agent-a8b9705fca6febb7f' }));
  assert.deepEqual(suggestProjects(worktree, PROJECTS), [], 'nor an agent’s worktree');
  const oneDay = ['09', '10', '11'].map((h) => seen(`2026-10-01T${h}:00:00Z`, { repo: 'marsh', cwd: '/Users/sam/Code/marsh' }));
  assert.deepEqual(suggestProjects(oneDay, PROJECTS), [], 'three runs in one day are a visit');
  const twoDays = [oneDay[0]!, ...oneDay.slice(1).map((r) => ({ ...r, at: r.at.replace('10-01', '10-02') }))];
  assert.deepEqual(
    suggestProjects(twoDays, PROJECTS).map((s) => s.name),
    ['marsh'],
    'three runs over two days in marsh suggest it',
  );
});

test('THE SUGGESTION IS READ FROM THE RECORD’S RUNS, and a repository a project lists is never suggested', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const things: Declaration = {
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
  const ok = <T>(r: unknown): T => {
    const x = r as { ok: boolean; value: T };
    assert.ok(x.ok);
    return x.value;
  };
  ok(await k.install([things]));
  ok<Entry>(k.create('things', { name: 'Kiln', repos: ['github.com/studio/kiln'] }, { actor: 'p_owner' }));
  for (const [i, remote] of ['github.com/studio/Ledger', 'github.com/studio/ledger.git', 'git@github.com:studio/ledger', 'github.com/studio/kiln'].entries()) {
    /* ON TWO DAYS AT LEAST, as a habit is (`SUGGEST_DAYS`). */
    clock.set(NOW - i * 86_400_000);
    ok(k.create('session', { client_id: `cc-${i}`, remote, cwd: 'C:\\Users\\sam\\Code\\Ledger\\src', repo: 'Ledger' }, { actor: 'p_owner' }));
  }

  const registers = new Map([['things', { id: 'things', scopes: { repos: 'repos', folders: 'folders' } }]]);
  assert.deepEqual(projectSuggestions(sql, registers), [
    { key: 'github.com/studio/ledger', name: 'Ledger', remote: 'github.com/studio/Ledger', folder: 'C:\\Users\\sam\\Code\\Ledger', runs: 3 },
  ]);
  assert.deepEqual(projectSuggestions(sql, new Map()), [], 'a record with no projects suggests none');
  sql.close();
});

test('remoteKey is the one key for a remote, in every form git writes it', () => {
  for (const said of ['https://sam@GitHub.com/Acme/BrainDog.git', 'git@github.com:acme/braindog', 'ssh://git@github.com:22/acme/braindog/', 'github.com/acme/braindog'])
    assert.equal(remoteKey(said), 'github.com/acme/braindog', said);
});
