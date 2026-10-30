/**
 * Put back restores a declaration an accepted change replaced (batch 62, `undo.ts`).
 *
 * Until now a decision that reworded a page or renamed a list had a plan with no step in it, and so every such
 * question was weighed hard to undo. The table keeps every version, and the undo now installs the earlier body again
 * as a new one: before, changed, and before again, all three kept. It is left with a sentence when somebody changed
 * the declaration again on top, when the earlier version was erased or is withheld, or when a list it reads is gone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, no, type Result } from '@braindog/ports';

import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { undoApply, undoPlan, undoStaged, type UndoApplied, type UndoParts, type UndoPlan, type UndoScope, type UndoStage } from '../src/undo.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const OWNER = { actor: 'p_owner' };

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

/** A page whose one line of wording is what a change rewrites. */
const page = (empty: string, title = 'Work'): Declaration => ({
  id: 'page.work',
  kind: 'page',
  body: { page: 'work', title, requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', columns: [{ field: 'name' }], empty }] } as never,
});
const BEFORE = page('Nothing here yet.');
const AFTER = page('No projects yet. Add the first one.');

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const JOTTINGS: Declaration = { ...NOTES, body: { ...(NOTES.body as object), name: 'Jottings' } as never };

type Rec = { k: Kernel; sql: NodeSql; parts: UndoParts; stage: UndoStage };
type Decided = { decision: string; suggestion: string; install?: Declaration; expect?: { id: string; version: number } };
type Version = { version: number; live: number; body: string };

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, out.ok ? '' : fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(): Promise<Rec> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([THINGS, BEFORE, NOTES]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@example.com', 'Sam'), ('p_mara', 'mara@example.com', 'Mara')");
  const parts: UndoParts = { sql, clock, mint: ulids(clock.now), transaction: k.transaction, write: k.write };
  return { k, sql, parts, stage: (batch) => k.stageInstall(batch) };
}

/** A change proposed, accepted and installed as the host installs it: against the version it names, signed. */
async function changed(r: Rec, question: string, from: Declaration, to: Declaration, signed = true): Promise<UndoScope> {
  const body = { declaration_id: to.id, from, to, from_version: versions(r.sql, to.id).at(-1)!.version };
  const asked = value<{ id: string }>(r.k.propose({ question, body_kind: 'change', body }, OWNER));
  const done = value<Decided>(r.k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  assert.ok(done.install, 'an accepted change names what to install');
  value(await r.k.install([done.install], done.expect, signed ? { actor: 'p_owner', suggestion: done.suggestion } : undefined));
  return { decision: done.decision };
}

const versions = (sql: NodeSql, id: string): Version[] =>
  sql.all<Version>('SELECT version, superseded_at IS NULL AS live, body FROM declaration WHERE id = ? ORDER BY version', id).map((v) => ({ ...v }));

/** The undo as a host runs it: the plan a person sees, the earlier bodies made ready, then one transaction. */
async function putBack(r: Rec, scope: UndoScope): Promise<UndoApplied> {
  const plan = value<UndoPlan>(undoPlan(r.sql, scope));
  const declared = value<Parameters<typeof undoApply>[5]>(await undoStaged(r.sql, r.stage, scope));
  const applied = value<UndoApplied>(undoApply(r.parts, scope, plan.hash, 'p_owner', {}, declared));
  r.k.reload();
  return applied;
}

test('a page reworded by an accepted change is put back, and its history holds all three versions', async () => {
  const r = await record();
  const scope = await changed(r, 'Say more when the page is empty?', BEFORE, AFTER);
  const [first, second] = versions(r.sql, 'page.work');
  assert.deepEqual([first!.live, second!.live], [0, 1], 'the change is live and the earlier wording is kept beside it');

  const plan = value<UndoPlan>(undoPlan(r.sql, scope));
  assert.equal(plan.say, 'Puts back one change.');
  assert.deepEqual(plan.lines, ['Puts the page "Work" back to how it read before this change.']);
  assert.deepEqual(plan.steps.map((s) => [s.do, s.title, s.label]), [['declare', 'Work', 'page']]);
  assert.deepEqual(versions(r.sql, 'page.work').length, 2, 'planning it wrote nothing');

  const applied = await putBack(r, scope);
  assert.equal(applied.say, 'Put back one change.');
  assert.deepEqual(applied.skipped, []);

  /* APPENDED, NEVER REWRITTEN: version 1 and 2 are as they were, and a third holds what the first said. */
  const after = versions(r.sql, 'page.work');
  assert.deepEqual(after.map((v) => [v.version, v.live]), [[1, 0], [2, 0], [3, 1]]);
  assert.equal(after[0]!.body, first!.body);
  assert.equal(after[1]!.body, second!.body);
  assert.equal(after[2]!.body, first!.body, 'the page reads as it did before the change');

  /* THE HISTORY SAYS BOTH MOVES, the second signed as a put back of that answer and in the undo's own batch. */
  const lines = r.sql
    .all<{ actor: string; from_v: string; to_v: string; note: string; batch: string | null }>("SELECT actor, from_v, to_v, note, batch FROM event WHERE kind = 'declare' AND target = 'declaration:page.work' ORDER BY rowid")
    .map((l) => ({ ...l }));
  assert.deepEqual(lines.map((l) => [l.from_v, l.to_v]), [['1', '2'], ['2', '3']]);
  assert.equal(lines[1]!.note, 'Put back by an undo of the answer to "Say more when the page is empty?"');
  assert.deepEqual([lines[1]!.actor, lines[1]!.batch], ['p_owner', applied.batch]);

  /* THE QUESTION READS UNDONE AND IS NOT ASKED AGAIN, and a second undo has nothing left to do. */
  assert.equal(r.sql.one<{ s: string; r: string }>('SELECT status AS s, resolved_as AS r FROM suggestion')?.r, 'undone');
  const again = value<UndoPlan>(undoPlan(r.sql, scope));
  assert.deepEqual([again.steps.length, again.skipped.length, again.already, again.say], [0, 0, true, 'This was undone already.']);
  r.sql.close();
});

test('a list renamed is put back under its earlier name, whether or not the install was signed', async () => {
  for (const signed of [true, false]) {
    const r = await record();
    const scope = await changed(r, 'Call the list Jottings?', NOTES, JOTTINGS, signed);
    assert.equal(r.k.register('notes')?.name, 'Jottings');
    const plan = value<UndoPlan>(undoPlan(r.sql, scope));
    assert.deepEqual(plan.lines, ['Puts the list "Jottings" back to how it read before this change, as "Notes".'], `signed ${signed}`);
    assert.deepEqual(plan.steps.map((s) => [s.from, s.to]), [['Notes', 'Jottings']]);
    await putBack(r, scope);
    assert.equal(r.k.register('notes')?.name, 'Notes', 'the list a write reads is the earlier one again');
    assert.deepEqual(versions(r.sql, 'register.notes').map((v) => [v.version, v.live, JSON.parse(v.body).name]), [[1, 0, 'Notes'], [2, 0, 'Jottings'], [3, 1, 'Notes']]);
    r.sql.close();
  }
});

test('a change with a later change on top is left, and the plan says who made the later one', async () => {
  const r = await record();
  const scope = await changed(r, 'Say more when the page is empty?', BEFORE, AFTER);
  const seen = value<UndoPlan>(undoPlan(r.sql, scope));
  value(await r.k.install([page('Start with one project.')], undefined, { actor: 'p_mara' }));

  const plan = value<UndoPlan>(undoPlan(r.sql, scope));
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.say, 'Nothing can be put back. One change is left as it is.');
  assert.deepEqual(plan.lines, ['Leaves "Work" as it is: Mara has changed it again since, and putting this back would undo that as well.']);
  /* AND THE PLAN SHE SAW BEFORE MARA'S CHANGE IS STALE, so nothing lands on top of Mara's wording. */
  const declared = value<Parameters<typeof undoApply>[5]>(await undoStaged(r.sql, r.stage, scope));
  const stale = undoApply(r.parts, scope, seen.hash, 'p_owner', {}, declared);
  assert.equal(stale.ok, false);
  assert.equal(versions(r.sql, 'page.work').length, 3);
  assert.equal(JSON.parse(versions(r.sql, 'page.work').at(-1)!.body).blocks[0].empty, 'Start with one project.');
  r.sql.close();
});

test('a change whose earlier version was erased or is withheld is left, for either mark', async () => {
  for (const mark of ['--erased--', '--redacted--']) {
    const r = await record();
    const scope = await changed(r, 'Say more when the page is empty?', BEFORE, AFTER);
    r.sql.exec("UPDATE declaration SET body = replace(body, 'Nothing here yet.', ?) WHERE id = 'page.work' AND version = 1", mark);
    const plan = value<UndoPlan>(undoPlan(r.sql, scope));
    assert.deepEqual(plan.steps, [], mark);
    assert.deepEqual(plan.lines, ['Leaves "Work" as it is: part of how it read before has been erased or is withheld, so there is no whole copy to put back.']);
    const applied = await putBack(r, scope);
    assert.equal(applied.put, 0);
    assert.equal(versions(r.sql, 'page.work').length, 2, 'nothing was installed');
    r.sql.close();
  }
});

test('a list she cannot read is left out of her plan without a word', async () => {
  const r = await record();
  const scope = await changed(r, 'Call the list Jottings?', NOTES, JOTTINGS);
  const plan = value<UndoPlan>(undoPlan(r.sql, scope, { reads: (register) => register !== 'notes' }));
  assert.deepEqual([plan.steps, plan.skipped], [[], []]);
  r.sql.close();
});

test('a page whose list is gone, or that was taken out since, is left with the reason', async () => {
  const gone = await record();
  const scope = await changed(gone, 'Say more when the page is empty?', BEFORE, AFTER);
  gone.sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'register.things'");
  assert.deepEqual(value<UndoPlan>(undoPlan(gone.sql, scope)).lines, ['Leaves "Work" as it is: the list it reads, "Projects", is no longer here.']);
  gone.sql.close();

  const out = await record();
  const taken = await changed(out, 'Say more when the page is empty?', BEFORE, AFTER);
  out.sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'page.work' AND superseded_at IS NULL");
  assert.deepEqual(value<UndoPlan>(undoPlan(out.sql, taken)).lines, ['Leaves "Work" as it is: it has been taken out since.']);
  out.sql.close();
});

test('an earlier version the checks refuse now, or one not made ready, is left and nothing is written', async () => {
  const r = await record();
  const scope = await changed(r, 'Say more when the page is empty?', BEFORE, AFTER);
  const plan = value<UndoPlan>(undoPlan(r.sql, scope));

  /* HANDED NOTHING, as a caller that has not staged: the step is left and says to ask again. */
  const bare = value<UndoApplied>(undoApply(r.parts, scope, plan.hash, 'p_owner'));
  assert.equal(bare.put, 0);
  assert.deepEqual(bare.lines, ['Leaves "Work" as it is: how it read before was not made ready to go back in, so ask for this undo again.']);

  /* AND A REFUSAL FROM THE CHECKS IS SAID IN ITS OWN WORDS. */
  const refusing: UndoStage = async () => no('DECLARATION_INVALID', 'The page shows a field the list no longer has.', { at: 'blocks[0]' }) as Result<never>;
  const declared = value<Parameters<typeof undoApply>[5]>(await undoStaged(r.sql, refusing, scope));
  const refused = value<UndoApplied>(undoApply(r.parts, scope, plan.hash, 'p_owner', {}, declared));
  assert.deepEqual(refused.lines, ['Leaves "Work" as it is: the page shows a field the list no longer has.']);
  assert.equal(versions(r.sql, 'page.work').length, 2);
  assert.equal(r.sql.one<{ r: string }>('SELECT resolved_as AS r FROM suggestion')?.r, 'addressed', 'the question still reads decided');
  assert.equal(r.sql.one('SELECT 1 AS y FROM undone'), undefined, 'and nothing was marked undone');

  /* IT CAN STILL GO BACK ONCE IT IS MADE READY. */
  assert.equal((await putBack(r, scope)).put, 1);
  r.sql.close();
});

test('a declaration that was new replaced nothing, so its plan holds no step', async () => {
  const r = await record();
  const fresh: Declaration = { id: 'register.ideas', kind: 'register', body: { id: 'ideas', name: 'Ideas', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
  const asked = value<{ id: string }>(r.k.propose({ question: 'Add a list of ideas?', body_kind: 'change', body: { declaration_id: fresh.id, to: fresh } }, OWNER));
  const done = value<Decided>(r.k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  value(await r.k.install([done.install!], done.expect, { actor: 'p_owner', suggestion: done.suggestion }));
  const plan = value<UndoPlan>(undoPlan(r.sql, { decision: done.decision }));
  assert.deepEqual([plan.steps, plan.skipped], [[], []]);
  r.sql.close();
});

test('a list given a field is put back while the field is empty, and left once the field holds answers', async () => {
  const add = { declaration_id: 'register.things', to: { add: { fields: [{ id: 'due', type: 'day', label: 'Due' }] } } };
  const added = async (r: Rec): Promise<UndoScope> => {
    const asked = value<{ id: string }>(r.k.propose({ question: 'Add a due day?', body_kind: 'change', body: add }, OWNER));
    const done = value<Decided>(r.k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
    value(await r.k.install([done.install!], done.expect, { actor: 'p_owner', suggestion: done.suggestion }));
    return { decision: done.decision };
  };

  const empty = await record();
  const scope = await added(empty);
  value(empty.k.create('things', { name: 'Kiln' }, OWNER));
  assert.equal((await putBack(empty, scope)).put, 1);
  assert.deepEqual(empty.k.register('things')?.fields.map((f) => f.id).filter((id) => id === 'due'), []);
  empty.sql.close();

  /* A DAY FILED UNDER IT WOULD BE LEFT WITH NO FIELD TO SHOW UNDER, so the list stays and the plan says why. */
  const filled = await record();
  const held = await added(filled);
  value(filled.k.create('things', { name: 'Kiln', due: '2026-11-01' }, OWNER));
  const plan = value<UndoPlan>(undoPlan(filled.sql, held));
  assert.deepEqual(plan.steps, []);
  assert.deepEqual(plan.lines, ['Leaves "Projects" as it is: putting it back would take "due" off the list, and that holds answers now.']);
  assert.equal((await putBack(filled, held)).put, 0);
  assert.equal(versions(filled.sql, 'register.things').length, 2, 'nothing was installed');
  filled.sql.close();
});
