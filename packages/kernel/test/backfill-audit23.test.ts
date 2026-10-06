/**
 * The walk, held to research-audit-23 item 6: a run question is kept by the whole place its runs worked in, the remote
 * or else the folder, and never by the repository's last name, so one yes about `sam/lantern` never places, or lists on
 * the project, a run in somebody else's `lantern`. Two places of one name are two questions, each said with its owner.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { understandBackfill, type BackfillDeps, type BackfillSuggestion } from '../src/backfill.ts';
import { keyOf } from '../src/identity-keys.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 2);
const HOUR = 3_600_000;
const OWNER = { actor: 'p_owner' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

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
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: BackfillDeps; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const k = await openRecord(sql, clock);
  value(await k.install([PROJECTS]));
  const deps: BackfillDeps = { sql, clock, mint: ulids(() => clock.now()), transaction: k.transaction, write: k.write, registers: k.registers };
  return { k, sql, deps, clock };
}

const run = (k: Kernel, fields: Record<string, unknown>): string =>
  value<Entry>(k.create('session', { doing: 'Work', agent: 'claude', state: 'done', ...fields }, { ...OWNER, stamp: { project: '' } })).id;
const runQuestions = (s: readonly BackfillSuggestion[]) => s.filter((x): x is Extract<BackfillSuggestion, { kind: 'run-project' }> => x.kind === 'run-project');

test('TWO OWNERS’ REPOSITORIES OF ONE NAME ARE TWO QUESTIONS, each with its own place, and said by whose it is', async () => {
  const { k, sql, deps, clock } = await record();
  value(k.create('things', { name: 'Lantern', repos: ['lantern'] }, OWNER));
  clock.set(NOW - 2 * HOUR);
  run(k, { repo: 'lantern', remote: 'git@github.com:sam/lantern.git' });
  run(k, { repo: 'lantern', remote: 'https://github.com/sam/lantern' });
  run(k, { repo: 'lantern', remote: 'https://github.com/evil/lantern.git' });
  clock.set(NOW);
  const asked = runQuestions(understandBackfill(deps).suggestions).sort((a, b) => a.question.localeCompare(b.question));

  assert.deepEqual(
    asked.map((s) => s.question),
    ['2 runs worked in sam/lantern. Is that Lantern?', 'A run worked in evil/lantern. Is that Lantern?'],
  );
  assert.deepEqual(asked[0]!.wheres, [keyOf('remote', 'github.com/sam/lantern')]);
  assert.deepEqual(asked[1]!.wheres, [keyOf('remote', 'github.com/evil/lantern')], 'a yes about one never covers the other');
  assert.notEqual(asked[0]!.key, asked[1]!.key);
  sql.close();
});

test('ONE PLACE OF A NAME IS STILL SAID BY ITS NAME, and two folders of one name by the folder each sits in', async () => {
  const { k, sql, deps, clock } = await record();
  value(k.create('things', { name: 'Lantern', repos: ['lantern'] }, OWNER));
  value(k.create('things', { name: 'Kiln', repos: ['kiln'] }, OWNER));
  clock.set(NOW - 2 * HOUR);
  run(k, { repo: 'kiln', remote: 'git@github.com:sam/kiln.git' });
  run(k, { repo: 'lantern', cwd: '/Users/sam/Code/lantern' });
  run(k, { repo: 'lantern', cwd: '/Users/sam/Clients/lantern' });
  clock.set(NOW);
  const asked = runQuestions(understandBackfill(deps).suggestions)
    .map((s) => s.question)
    .sort();

  assert.deepEqual(asked, [
    'A run worked in kiln. Is that Kiln?',
    'A run worked in lantern in Clients. Is that Lantern?',
    'A run worked in lantern in Code. Is that Lantern?',
  ]);
  assert.ok(!asked.some((q) => q.includes('/Users') || q.includes('github.com')), 'never a path or a host');
  sql.close();
});
