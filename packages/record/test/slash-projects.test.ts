/**
 * Slash's daily look asks "Start a project?" about each repository agents work in that no project holds (the kernel's
 * `projectSuggestions`): one question a repository, in names, and never again once the person says no.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 6, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS = {
  id: 'register.projects',
  kind: 'register' as const,
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked'], required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
    ],
  } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS]));
  value(api.kernel.create('projects', { name: 'Kiln', lane: 'earning', repos: ['github.com/studio/kiln'] }, { actor: 'p_owner' }));
  /* THREE RUNS IN LEDGER, WHICH NO PROJECT HOLDS, AND THREE IN KILN, WHICH ONE DOES. */
  for (const [i, remote] of ['github.com/studio/Ledger', 'git@github.com:studio/ledger', 'github.com/studio/ledger.git', 'github.com/studio/kiln', 'github.com/studio/kiln', 'github.com/studio/kiln'].entries())
    value(api.kernel.create('session', { client_id: `cc-${i}`, remote, repo: 'Ledger', cwd: '/Users/sam/Code/Ledger' }, { actor: 'p_owner' }));
  return { api, sql, day: (n: number) => clock.set(NOW + n * DAY) };
}

type Ticked = { ran: boolean; filed?: { id: string; question: string }[]; dropped?: string[] };

test('ONE "START A PROJECT?" A REPOSITORY NO PROJECT HOLDS, in names, which accepting makes into a project', async () => {
  const { api, sql } = await record();
  const ticked = (await api.slashTick()) as Ticked;
  assert.ok(ticked.ran);
  const asked = (ticked.filed ?? []).filter((f) => f.question.startsWith('Start a project'));
  assert.deepEqual(
    asked.map((f) => f.question),
    ['Start a project for Ledger? Your agents have worked in it 3 times, and no project holds it yet.'],
  );
  /* NO HOST, NO FOLDER, NO HANDLE IN WHAT A PERSON READS. */
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', asked[0]!.id)!.body) as { rows: Record<string, unknown>[] };
  assert.deepEqual(body.rows, [{ lane: 'building', name: 'Ledger', repos: ['Ledger'] }]);
  value(await api.decide({ id: asked[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const names = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'projects' }, owner)).rows.map((r) => r.fields.name).sort();
  assert.deepEqual(names, ['Kiln', 'Ledger']);
  sql.close();
});

test('A NO HOLDS: the same repository is never asked about again', async () => {
  const { api, sql, day } = await record();
  const first = (await api.slashTick()) as Ticked;
  const asked = (first.filed ?? []).find((f) => f.question.startsWith('Start a project'))!;
  value(await api.decide({ id: asked.id, decide: { option: 'reject', reason: 'a fork I keep' } }, owner));
  day(1);
  const second = (await api.slashTick()) as Ticked;
  assert.ok(second.ran);
  assert.equal((second.filed ?? []).filter((f) => f.question.startsWith('Start a project')).length, 0);
  assert.ok(!(second.dropped ?? []).some((d) => d.includes('Ledger')), 'a no is not a line in the day’s log');
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE json_extract(body, '$.project_key') IS NOT NULL").length, 1);
  sql.close();
});
