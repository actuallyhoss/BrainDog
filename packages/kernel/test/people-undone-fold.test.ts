/**
 * A fold he undid is never made again ("Undo gives two back, and that pair is never folded again").
 *
 * The strong rules fold two people with the same full name and the same handle, as one batch. Whichever undo takes
 * that batch back, the next meeting of either of them folds nobody and asks nothing: it writes its line on the person
 * it was about. The rules themselves are untouched, so anybody else they say is one person is still folded.
 *
 * THE PAIR IS FOUND IN THE LOG'S OWN LINES (`foldUndone` in `people.ts`): the merge field set and put back, or the
 * fold's batch in `undone`. Nothing here adds a column or a table.
 *
 * A COMMIT AND A NOTE ARE NEVER FOLDED BY ONE MEETING (somebody met in commits alone beside somebody
 * noted is asked about), so the pairs here are two notes, and two commits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Met, type UndoPlan, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
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
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const OWNER: WriteContext = { actor: 'p_owner' };
const AGENT: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'cc-1', host: 'h', repo: 'lanternfish' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE]));
  return { k, sql };
}

/** How many batches ever set the merge field: one a fold. */
const folds = (sql: NodeSql): number =>
  Number(sql.one<{ n: number }>("SELECT count(DISTINCT coalesce(batch, id)) AS n FROM event WHERE kind = 'edit' AND field = 'merged_into' AND to_v IS NOT NULL")?.n);

const questions = (sql: NodeSql): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n);

/** The live people, by name and address, oldest first. */
const living = (sql: NodeSql): string[] =>
  sql
    .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq")
    .map((r) => JSON.parse(r.fields) as { name: string; email?: string })
    .map((f) => `${f.name} <${f.email ?? ''}>`);

const FIRST = { name: 'Teodor Vance', email: 'teodorv@lanternfish.example' };
const SECOND = { name: 'Teodor Vance', email: 'teodorv@pellucid.example' };
const TWO = ['Teodor Vance <teodorv@lanternfish.example>', 'Teodor Vance <teodorv@pellucid.example>'];

/** Somebody else the same rules say is one person: folded as ever, whatever was undone beside them. */
function othersStillFold(k: Kernel, sql: NodeSql, where: (n: number) => string, as: WriteContext): void {
  const [people, made] = [k.count('people'), folds(sql)];
  value<Met>(k.meet({ name: 'Mara Lindqvist', email: 'maral@lanternfish.example', where: where(7) }, as));
  const mara = value<Met>(k.meet({ name: 'Mara Lindqvist', email: 'maral@pellucid.example', where: where(8) }, as));
  assert.equal(mara.matched_by, 'strong', 'two people the strong rules say are one were not folded');
  assert.ok(mara.undo, 'the fold carried no undo');
  assert.equal(k.count('people'), people + 1);
  assert.equal(folds(sql), made + 1);
  /* AND A THIRD ADDRESS OF HIS, never folded and never undone, is folded as before, into the older of the two. */
  const third = value<Met>(k.meet({ name: 'Teodor Vance', email: 'teodorv@quillfeather.example', where: where(9) }, as));
  assert.equal(third.matched_by, 'strong');
  assert.equal(k.count('people'), people + 1);
  assert.equal(folds(sql), made + 2);
}

test('A FOLD HE UNDID IS NEVER MADE AGAIN: the next meeting writes its line on the one it was about, and asks nothing', async () => {
  const { k, sql } = await record();
  const note = (n: number): string => `a note about call ${n}`;
  const first = value<Met>(k.meet({ ...FIRST, where: note(0) }, OWNER)).row!;
  const met = value<Met>(k.meet({ ...SECOND, where: note(1) }, OWNER));
  assert.equal(met.matched_by, 'strong');
  assert.equal(met.row?.id, first.id);
  assert.equal(k.count('people'), 1, 'one person');
  assert.equal(folds(sql), 1, 'one batch');

  value(k.undoMerge(met.undo!, OWNER));
  assert.deepEqual(living(sql), TWO, 'Undo did not give two back');

  /* THE SECOND, MET AGAIN EXACTLY AS BEFORE. */
  const again = value<Met>(k.meet({ ...SECOND, where: note(1) }, OWNER));
  assert.equal(again.matched_by, 'key');
  assert.notEqual(again.row?.id, first.id, 'the meeting was written on the other person');
  assert.equal(again.undo, undefined);
  assert.equal(again.merge, null);
  assert.deepEqual(living(sql), TWO);
  assert.equal(folds(sql), 1, 'the pair was folded again under a new batch');
  assert.equal(questions(sql), 0, 'the pair he undid was asked about');
  /* AND THE FIRST, and a commit of either. */
  value<Met>(k.meet({ ...FIRST, where: note(2) }, OWNER));
  value<Met>(k.meet({ ...SECOND, where: 'commit 3 in lanternfish' }, AGENT));
  value<Met>(k.meet({ ...FIRST, where: 'commit 4 in lanternfish' }, AGENT));
  assert.deepEqual(living(sql), TWO);
  assert.equal(folds(sql), 1);
  assert.equal(questions(sql), 0);

  othersStillFold(k, sql, note, OWNER);
  sql.close();
});

test('THE SAME AFTER THE GENERAL UNDO, which leaves the folded one gone: whoever is met by its address is that person, apart', async () => {
  const { k, sql } = await record();
  const commit = (n: number): string => `commit ${n} in lanternfish`;
  const first = value<Met>(k.meet({ ...FIRST, where: commit(0) }, AGENT)).row!;
  const met = value<Met>(k.meet({ ...SECOND, where: commit(1) }, AGENT));
  assert.equal(met.matched_by, 'strong');
  assert.equal(k.count('people'), 1);

  /* THE GENERAL UNDO takes back what the kept person was carried, leaves the folded one as it is, and writes the batch
     into `undone`. The address is nobody's again. */
  const plan = value<UndoPlan>(k.undoPlan({ batch: met.undo! }));
  value(k.undoApply({ batch: met.undo! }, plan.hash, OWNER.actor));
  assert.ok(sql.one('SELECT 1 AS n FROM undone WHERE batch = ?', met.undo!), 'the undo did not mark the batch');
  assert.equal(k.get(first.id)!.fields.handles, undefined);

  /* THE SECOND, MET AGAIN EXACTLY AS BEFORE: a person of their own, not folded back in under a new batch. */
  const again = value<Met>(k.meet({ ...SECOND, where: commit(1) }, AGENT));
  assert.notEqual(again.row?.id, first.id, 'the same two were folded again');
  assert.equal(again.matched_by, 'none');
  assert.equal(again.undo, undefined);
  assert.equal(again.merge, null);
  assert.deepEqual(living(sql), TWO);
  assert.equal(folds(sql), 1, 'the pair was folded again under a new batch');
  assert.equal(questions(sql), 0, 'the pair he undid was asked about');

  /* AND EVERY MEETING AFTER, of either. */
  const later = value<Met>(k.meet({ ...SECOND, where: commit(2) }, AGENT));
  assert.equal(later.row?.id, again.row?.id);
  assert.equal(later.matched_by, 'key');
  value<Met>(k.meet({ ...FIRST, where: commit(3) }, AGENT));
  assert.deepEqual(living(sql), TWO);
  assert.equal(folds(sql), 1);
  assert.equal(questions(sql), 0);

  othersStillFold(k, sql, commit, AGENT);
  sql.close();
});

test('AND WITH BOTH BACK AND ONLY `undone` TO SAY SO: the batch marked there is enough, with no line putting the field back', async () => {
  const { k, sql } = await record();
  const note = (n: number): string => `a note about call ${n}`;
  value<Met>(k.meet({ ...FIRST, where: note(0) }, OWNER));
  const met = value<Met>(k.meet({ ...SECOND, where: note(1) }, OWNER));
  value(k.undoMerge(met.undo!, OWNER));
  /* An undo that restores the two and says so only in `undone`: the line that put the merge field back is left out. */
  const marked = sql.one<{ by_batch: string }>('SELECT by_batch FROM undone WHERE batch = ?', met.undo!);
  assert.ok(marked, 'the merge undone was not marked');
  sql.exec("DELETE FROM event WHERE batch = ? AND field = 'merged_into'", marked.by_batch);
  assert.equal(Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field = 'merged_into' AND to_v IS NULL")?.n), 0);

  const again = value<Met>(k.meet({ ...SECOND, where: note(1) }, OWNER));
  assert.equal(again.matched_by, 'key');
  assert.equal(again.undo, undefined);
  assert.deepEqual(living(sql), TWO);
  assert.equal(folds(sql), 1);
  assert.equal(questions(sql), 0);

  /* WITH NEITHER, the rules are the rules: nothing but the log holds the pair apart. */
  sql.exec('DELETE FROM undone WHERE batch = ?', met.undo!);
  const folded = value<Met>(k.meet({ ...SECOND, where: note(2) }, OWNER));
  assert.equal(folded.matched_by, 'key');
  assert.ok(folded.undo, 'a pair nothing in the log holds apart was not folded');
  assert.equal(k.count('people'), 1);
  sql.close();
});
