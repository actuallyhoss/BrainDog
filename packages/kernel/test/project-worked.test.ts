/**
 * `project-worked:<project>`, when a project was last worked on, its tasks and its runs read together (the audit of 25
 * October, Z7).
 *
 * WHAT WAS MEASURED BEFORE IT: Projects said "Worked on 4 days ago" of a project whose run had been heard from twenty
 * minutes before, while Today said "Claude worked on it 20 minutes ago" of the same one, because Projects read Work's
 * `project-last-worked`, which reads the tasks alone, and Today read the runs alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_FIGURES, builtInFigure, type WorkedReading } from '../src/built-in-figures.ts';
import { figureLists } from '../src/money-figures.ts';
import type { PageBlock } from '../src/pages.ts';
import { openRecord, type Declaration, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

/** A list that hands work out and points at the projects, as Work's tasks do. */
const CHORES: Declaration = {
  id: 'register.chores',
  kind: 'register',
  body: {
    id: 'chores',
    name: 'Chores',
    title: 'what',
    hand: { agent: 'agent' },
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'agent', type: 'text' },
      { id: 'thing', type: 'ref', to: 'things' },
    ],
  },
};

/** A list that points at the projects and hands nothing out: what is written on it is not work on the project. */
const RECEIPTS: Declaration = {
  id: 'register.receipts',
  kind: 'register',
  body: { id: 'receipts', name: 'Receipts', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things' }] },
};

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, CHORES, RECEIPTS]));
  const project = (name: string) => value<{ id: string; seq: number }>(k.create('things', { name }, { actor: 'p_1' }));
  const ago = (id: string, ms: number) => sql.exec('UPDATE entry SET updated_at = ? WHERE id = ?', new Date(NOW - ms).toISOString(), id);
  const chore = (thing: string, ms: number, list = 'chores') => ago(value<{ id: string }>(k.create(list, { what: 'A step', thing }, { actor: 'p_1' })).id, ms);
  const run = (agent: string, project: string, ms: number) =>
    value(k.create('session', { doing: 'Work', agent, state: 'idle' }, { actor: 'p_1', stamp: { last_seen: new Date(NOW - ms).toISOString(), project } }));
  const read = (about: string) => value<WorkedReading>(k.metric({ ...(BUILT_IN_FIGURES['project-worked'] as MetricDecl), about } as MetricDecl));
  return { sql, k, project, chore, run, read };
}

test('A PROJECT WORKED ON BY A RUN TWENTY MINUTES AGO READS TODAY, not the four days since its tasks were written', async () => {
  const { sql, project, chore, run, read } = await record();
  assert.ok(builtInFigure('project-worked'), 'the record has no figure that reads tasks and runs together');
  const lantern = project('Lanternfish');
  chore(lantern.id, 4 * DAY);
  run('claude', 'things#1', 20 * MIN);
  const got = read('Lanternfish');
  assert.deepEqual([got.value, got.met, got.at, got.by], [0, true, new Date(NOW - 20 * MIN).toISOString(), 'claude'], 'the runs were left out');
  assert.equal(read('things#1').at, got.at, 'its spoken id reads another time than its name');
  sql.close();
});

test('A TASK WRITTEN AFTER THE LAST RUN IS THE NEWEST, and says no agent', async () => {
  const { sql, project, chore, run, read } = await record();
  const copper = project('Copperleaf');
  run('codex', copper.id, 3 * DAY);
  chore(copper.id, 2 * 60 * MIN);
  const got = read('copperleaf');
  assert.deepEqual([got.value, got.at, got.by], [0, new Date(NOW - 2 * 60 * MIN).toISOString(), null]);
  sql.close();
});

test('ONLY A LIST THAT HANDS WORK OUT IS WORK, a run names its project three ways, and past thirty days it is quiet', async () => {
  const { sql, project, chore, run, read } = await record();
  const quiet = project('Saltmarsh');
  chore(quiet.id, 2 * DAY, 'receipts');
  assert.equal(read('Saltmarsh').value, null, 'a receipt is not work on the project');
  run('claude', 'Saltmarsh', 40 * DAY);
  const got = read('Saltmarsh');
  assert.deepEqual([got.value, got.met, got.by], [40, false, 'claude'], 'a run naming its project by name was not read, or forty days met the target');
  assert.equal(read('Nobody here').value, null, 'a name no project has read a time');
  sql.close();
});

test('A CARD SAYS THE MOMENT AND WHOSE RUN IT WAS, from a when column over the figure', async () => {
  const { sql, k, project, chore, run } = await record();
  project('Lanternfish');
  const copper = project('Copperleaf');
  run('claude', 'things#1', 20 * MIN);
  chore(copper.id, 5 * DAY);
  const block = k.block({ kind: 'cards', source: 'register.things', columns: [{ field: 'name', as: 'title' }, { metric: 'project-worked:{{name}}', as: 'when', label: 'Worked on' }], order: [{ field: 'name', dir: 'asc' }] } as PageBlock);
  assert.deepEqual(block.refusals, []);
  assert.deepEqual(block.whens, [
    { value: 5, met: true, at: new Date(NOW - 5 * DAY).toISOString(), by: null },
    { value: 0, met: true, at: new Date(NOW - 20 * MIN).toISOString(), by: 'claude' },
  ]);
  /* READ BY WHOEVER READS THE WHOLE RECORD: it reads the runs and every list that hands work out. */
  assert.deepEqual(figureLists(BUILT_IN_FIGURES['project-worked']!), ['*']);
  sql.close();
});
