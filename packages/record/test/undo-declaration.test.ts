/**
 * Put back on a decided change, end to end through the record (batch 62).
 *
 * The kernel's undo restores a declaration an accepted change replaced (`kernel/src/undo.ts`), in two calls: the
 * earlier body is made ready (`undoStage`, asynchronous) and then written inside the undo's one transaction. This file
 * holds the record's `undo` to both: a wording change decided, installed and put back reads as it did before, every
 * version is kept, and a list put back is the list the next write meets.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { UndoPlan } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const page = (empty: string) => ({
  id: 'page.work',
  kind: 'page' as const,
  body: { page: 'work', title: 'Work', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', columns: [{ field: 'name' }], empty }] } as never,
});
const BEFORE = page('Nothing here yet.');
const AFTER = page('No projects yet. Add the first one.');

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const WITH_DUE = {
  ...NOTES,
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'due', type: 'day' }] } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([THINGS, BEFORE, NOTES]));
  const versions = (id: string) =>
    sql.all<{ version: number; live: number; body: string }>('SELECT version, superseded_at IS NULL AS live, body FROM declaration WHERE id = ? ORDER BY version', id).map((v) => ({ ...v }));
  /** The wording a reader of the page gets now: the live version's own. */
  const empty = (): string => (JSON.parse(versions('page.work').find((v) => v.live === 1)!.body) as { blocks: { empty: string }[] }).blocks[0]!.empty;
  /** A change asked and accepted through the record, which installs it. */
  const decided = async (question: string, from: { id: string }, to: unknown): Promise<string> => {
    const from_version = versions(from.id).at(-1)!.version;
    const filed = value<{ id: string }>(await api.propose({ question, body_kind: 'change', body: { declaration_id: from.id, from, to, from_version } } as never, owner));
    return value<{ decision: string }>(await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'yes' } }, owner)).decision;
  };
  return { sql, api, versions, empty, decided };
}

test('A WORDING CHANGE DECIDED, INSTALLED AND PUT BACK READS AS IT DID BEFORE, and every version is kept', async () => {
  const { sql, api, versions, empty, decided } = await record();
  const decision = await decided('Say what to do on an empty Work page?', BEFORE, AFTER);
  assert.equal(empty(), 'No projects yet. Add the first one.', 'the accepted change is installed');

  const plan = value<UndoPlan>(await api.undo({ decision, dry: true }, owner));
  assert.deepEqual(plan.steps.map((s) => s.do), ['declare'], plan.lines.join(' / '));
  assert.equal(plan.skipped.length, 0, plan.lines.join(' / '));
  assert.equal(empty(), 'No projects yet. Add the first one.', 'a look puts nothing back');

  const done = value<{ put: number; skipped: { why: string }[]; lines: string[] }>(await api.undo({ decision, hash: plan.hash }, owner));
  assert.equal(done.put, 1, done.lines.join(' / '));
  assert.deepEqual(done.skipped, [], 'the step is done, not shown and then left');
  assert.equal(empty(), 'Nothing here yet.', 'the page reads as before');
  const all = versions('page.work');
  assert.deepEqual(all.map((v) => v.live), [0, 0, 1], 'before, changed and before again are all kept');
  assert.equal(all[2]!.body, all[0]!.body);

  /* And the page as a reader is served it. */
  const served = JSON.stringify(value(await api.page({ slug: 'work' } as never, owner)));
  assert.ok(served.includes('Nothing here yet.') && !served.includes('Add the first one'), 'the page the record serves is the earlier one');

  /* A second press has nothing left to do, and says so rather than installing a fourth version. */
  const again = (await api.undo({ decision, dry: true }, owner)) as { ok: boolean; value?: UndoPlan };
  if (again.ok) assert.ok(again.value!.already || again.value!.steps.length === 0, again.value!.lines.join(' / '));
  assert.equal(versions('page.work').length, 3);
  sql.close();
});

test('A LIST PUT BACK IS THE LIST THE NEXT WRITE MEETS: the cache is the table after the undo', async () => {
  const { sql, api, decided } = await record();
  const decision = await decided('Give a note a day it is due?', NOTES, WITH_DUE);
  assert.ok(api.kernel.register('notes')!.fields.some((f) => f.id === 'due'), 'the field is on the list');

  const plan = value<UndoPlan>(await api.undo({ decision, dry: true }, owner));
  assert.deepEqual(plan.steps.map((s) => s.do), ['declare'], plan.lines.join(' / '));
  value(await api.undo({ decision, hash: plan.hash }, owner));
  assert.ok(!api.kernel.register('notes')!.fields.some((f) => f.id === 'due'), 'the list in memory is the one put back');
  const made = api.kernel.create('notes', { name: 'Call the bank', due: '2026-10-20' }, { actor: 'p_1' });
  assert.equal(made.ok, false, 'a write under the field that went back is refused, as on any list without it');
  value(api.kernel.create('notes', { name: 'Call the bank' }, { actor: 'p_1' }));
  sql.close();
});

test('A STALE HASH PUTS NOTHING BACK, declaration or row', async () => {
  const { sql, api, versions, empty, decided } = await record();
  const decision = await decided('Say what to do on an empty Work page?', BEFORE, AFTER);
  const out = (await api.undo({ decision, hash: '0000000000000000' }, owner)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'PLAN_STALE');
  assert.equal(empty(), 'No projects yet. Add the first one.');
  assert.equal(versions('page.work').length, 2);
  sql.close();
});
