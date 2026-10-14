/**
 * What batch 86 wired in the kernel, through a real record and the kit as this build hands it (no module wrapped):
 * what a run said it is doing, on the two run sources and on the list of runs itself, with the run's project by name.
 *
 * `sessions-doing-said.test.ts` proves the column's rules with the kit handed in. This file proves the wire: the kit
 * `pages.ts` makes carries `recordNamed`, so a block naming `doing_said` on a record is answered and never refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import type { PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const MIN = 60_000;
const OWNER = { actor: 'p_1' };
const SAID = 'Fixing the invoice totals';

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

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const name of ['Kiln', 'Portage']) assert.ok(k.create('things', { name }, OWNER).ok);
  const run = (doing: string | null, minutesAgo: number, state: string, project?: string) => {
    const made = k.create('session', { ...(doing === null ? {} : { doing }), agent: 'claude', state }, {
      actor: OWNER.actor,
      stamp: { last_seen: new Date(NOW - minutesAgo * MIN).toISOString(), ...(project === undefined ? {} : { project }) },
    });
    assert.ok(made.ok, JSON.stringify(made));
  };
  run(SAID, 1, 'active', 'things#1');
  run('Claude Code in Kiln', 2, 'active', 'things#1');
  run('Edit packages/kernel/src/pages.ts', 3, 'active', 'things#2');
  run('Wrote the changelog', 30, 'done', 'things#2');
  run(null, 40, 'done');
  return { k, sql };
}

const cards = (source: string, more: Record<string, unknown> = {}, ...columns: Record<string, unknown>[]): PageBlock =>
  ({ kind: 'cards', source, columns: [{ field: 'agent', as: 'title' }, ...columns], ...more }) as never;

for (const source of ['sessions.working', 'sessions.live'])
  test(`${source} ANSWERS doing_said ON THE KIT THIS BUILD HANDS IT, and is not refused`, async () => {
    const { k, sql } = await record();
    const out = k.block(cards(source, {}, { field: 'doing_said', as: 'reply' }));
    assert.deepEqual(out.refusals, [], 'the kit carries the reader of a run’s name');
    const said = out.rows.map((r) => r.fields.doing_said);
    assert.deepEqual(said.slice(0, 3), [SAID, '', ''], 'the run’s words, then the record’s own name and a file path as nothing');
    sql.close();
  });

test('THE LIST OF RUNS ANSWERS doing_said AND EACH RUN’S PROJECT BY NAME, so a card over the runs that stopped says both', async () => {
  const { k, sql } = await record();
  const ended = cards(
    'register.session',
    { where: 'state is done', order: [{ field: 'last_seen', dir: 'desc' }] },
    { field: 'doing_said', as: 'reply' },
    { field: 'project', label: 'Project', as: 'scope' },
    { field: 'last_seen', as: 'when' },
  );
  const out = k.block(ended);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.rows.map((r) => r.fields.doing_said), ['Wrote the changelog', '']);
  assert.deepEqual(out.scopes, ['Portage', null], 'the project by its name, and nothing for a run placed nowhere');
  assert.equal(out.scope_marks?.length, 2);
  /* THE LIST HOLDS NO SUCH FIELD, and a block that asks for neither is handed neither. */
  const plain = k.block(cards('register.session', { where: 'state is done' }));
  assert.deepEqual(plain.refusals, []);
  assert.ok(plain.rows.every((r) => !('doing_said' in r.fields)));
  assert.equal(plain.scopes, undefined);
  const listed = k.list({ register: 'session', limit: 50 });
  assert.ok(listed.ok && listed.value.rows.every((r) => !('doing_said' in r.fields)));
  /* A WORD THE LIST DOES NOT HAVE IS REFUSED STILL, and so is the column on any other list. */
  assert.equal(k.block(cards('register.session', {}, { field: 'colour' })).refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(k.block({ kind: 'cards', source: 'register.things', columns: [{ field: 'name', as: 'title' }, { field: 'doing_said' }] } as never).refusals[0]?.code, 'FIELD_UNKNOWN');
  /* `as: scope` ON ANOTHER FIELD OF A RUN is refused as before: only its project says where it applies. */
  const astray = k.block(cards('register.session', {}, { field: 'agent', as: 'scope' }));
  assert.ok(astray.refusals.length > 0, JSON.stringify(astray));
  /* AND A PAGE THAT DECLARES THE CARDS INSTALLS. */
  const page = { id: 'page.crew', kind: 'page', body: { page: 'crew', title: 'Crew', blocks: [ended] } } as never;
  const installed = await k.install([page]);
  assert.ok(installed.ok, JSON.stringify(installed));
  sql.close();
});
