/**
 * A match the record made by itself carries its Undo: `isFold` says a batch is one, and `foldPlan` says what putting it
 * back would do, in names, before anything is done (ENG-B04, "shown with Undo").
 *
 * What is asserted is that the plan is a reading and nothing else. It writes no line, it names people and never their
 * ids, it leaves what somebody changed since and says so, and `undoMerge` then does what it said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type FoldPlan, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

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

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    delete: 'refuse_while_referenced',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'role', type: 'enum', values: ['client', 'collaborator', 'other'] },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'heading',
    fields: [
      { id: 'heading', type: 'text', required: true },
      { id: 'about', type: 'list', of: 'ref', to: 'people' },
    ],
  },
};

const OWNER: WriteContext = { actor: 'p_owner' };
const AGENT: WriteContext = {
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id: 'cc-1', host: 'h', repo: 'braindog' },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE, NOTES]));
  return { k, sql };
}

const events = (sql: NodeSql): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n);

/** One person met twice by a shared handle, in commits, so the strong rules fold the second into the first. */
function folded(k: Kernel): { batch: string; kept: string } {
  const first = value<Met>(k.meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', where: 'commit 0 in lanternfish' }, AGENT)).row!;
  const met = value<Met>(k.meet({ name: 'Teodor Vance', email: 'teodorv@pellucid.example', where: 'commit 1 in lanternfish' }, AGENT));
  assert.equal(met.matched_by, 'strong');
  assert.ok(met.undo, 'a merge the record made carried no undo');
  assert.equal(k.count('people'), 1);
  return { batch: met.undo!, kept: first.id };
}

/** Everything of a plan a person could be shown. */
const shown = (p: FoldPlan): string => JSON.stringify([p.say, p.lines, p.steps.map((s) => [s.title, s.list, s.from, s.to, s.line]), p.skipped.map((s) => [s.title, s.why, s.line])]);

test('A FOLD THE RECORD MADE IS ONE, and an ordinary write and a merge somebody said yes to are not', async () => {
  const { k, sql } = await record();
  const { batch } = folded(k);
  assert.equal(k.isFold(batch), true);

  /* An ordinary write: its batch is its own line. */
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  assert.ok(ada.batch);
  assert.equal(k.isFold(ada.batch!), false);
  assert.equal(k.foldPlan(ada.batch!), null);
  assert.equal(k.isFold('nothing-by-this-name'), false);

  /* A doubtful pair is a question, and the yes is a decision: its batch folds a row and holds the `decide` line. */
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 4464966 in braindog' }, AGENT));
  const said = value<{ batch: string }>(k.decide('SG1', { decide: { option: 'accept', reason: 'the same Ada' } }, 'p_owner'));
  const lines = sql.all<{ kind: string; field: string | null }>('SELECT kind, field FROM event WHERE batch = ?', said.batch);
  assert.ok(lines.some((l) => l.kind === 'decide'), 'the accepted merge held no decide line');
  assert.ok(lines.some((l) => l.field === 'merged_into'), 'the accepted merge folded nobody');
  assert.equal(k.isFold(said.batch), false);
  sql.close();
});

test('THE PLAN SAYS BOTH PEOPLE BY NAME AND WRITES NOTHING, and undoMerge then gives the two back with their keys', async () => {
  const { k, sql } = await record();
  const { batch, kept } = folded(k);
  const before = events(sql);
  const undone = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM undone')?.n);

  const plan = k.foldPlan(batch)!;
  assert.equal(plan.say, 'Puts back 2 people');
  assert.equal(plan.already, false);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(
    plan.steps.map((s) => [s.do, s.title, s.list, s.line]),
    [
      ['restore', 'Teodor Vance', 'People', 'Bring Teodor Vance back'],
      ['set', 'Teodor Vance', 'People', 'Take what the match added off Teodor Vance'],
    ],
  );
  assert.deepEqual(plan.lines, plan.steps.map((s) => s.line));
  assert.match(plan.hash, /^[0-9a-f]{16}$/u);
  /* NAMES, NEVER IDS: no row's id is in anything a person reads, and each step keeps it only as its handle. */
  const ids = sql.all<{ id: string }>('SELECT id FROM entry').map((r) => r.id);
  for (const id of [...ids, batch]) assert.ok(!shown(plan).includes(id), 'an id was put where a person reads');
  assert.equal(plan.steps[1]!.row, kept);
  assert.equal(plan.steps[0]!.seq, 2);

  /* A READING: no line written, nothing marked undone, and asked twice it answers the same. */
  assert.equal(k.foldPlan(batch)!.hash, plan.hash);
  assert.equal(events(sql), before);
  assert.equal(Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM undone')?.n), undone);
  assert.equal(k.count('people'), 1);

  const out = value<{ restored: string[] }>(k.undoMerge(batch, OWNER));
  assert.deepEqual(out.restored, ['Teodor Vance']);
  assert.equal(k.count('people'), 2);
  const back = k.get('people#2')!;
  assert.equal(back.deleted_at, null);
  assert.equal(back.fields.merged_into, undefined);
  assert.equal(back.fields.email, 'teodorv@pellucid.example');
  assert.equal(k.get(kept)!.fields.handles, undefined, 'the kept one kept what the match carried to it');
  /* Its own key answers to it again. */
  assert.equal(value<Met>(k.meet({ email: 'teodorv@pellucid.example', where: 'commit 2 in lanternfish' }, AGENT)).row?.id, back.id);

  /* AND ONCE PUT BACK, the plan says so and offers nothing. */
  const after = k.foldPlan(batch)!;
  assert.equal(after.already, true);
  assert.equal(after.say, 'This was put back already.');
  assert.deepEqual(after.steps, []);
  assert.notEqual(after.hash, plan.hash);
  sql.close();
});

test('A FIELD CHANGED SINCE THE MATCH IS LEFT, said under skipped, and the fingerprint moves', async () => {
  const { k, sql } = await record();
  const { batch, kept } = folded(k);
  const plain = k.foldPlan(batch)!;
  assert.deepEqual(k.get(kept)!.fields.handles, ['email:teodorv@pellucid.example']);

  /* Somebody rewrites what the match carried onto the kept one. */
  value(k.update('people', kept, { handles: ['github:teodorvance'] }, OWNER));
  const before = events(sql);
  const plan = k.foldPlan(batch)!;
  assert.equal(events(sql), before);
  assert.deepEqual(
    plan.skipped.map((s) => [s.title, s.why, s.line]),
    [['Teodor Vance', 'changed since', 'Leaves handles on Teodor Vance as it is: changed since.']],
  );
  assert.equal(plan.skipped[0]!.row, kept);
  assert.equal(plan.say, 'Puts back 2 people, leaves 1 as it is');
  assert.deepEqual(plan.lines.at(-1), plan.skipped[0]!.line);
  assert.notEqual(plan.hash, plain.hash);
  /* The two still come apart, and the met line the match added still comes off the kept one. */
  assert.deepEqual(plan.steps.map((s) => s.line), ['Bring Teodor Vance back', 'Take what the match added off Teodor Vance']);

  /* AND THE UNDO DOES WHAT THE PLAN SAID: two again, and what was rewritten stays as it was rewritten. */
  value(k.undoMerge(batch, OWNER));
  assert.equal(k.count('people'), 2);
  assert.deepEqual(k.get(kept)!.fields.handles, ['github:teodorvance']);
  assert.deepEqual(k.get(kept)!.fields.met, ['2026-09-11 · commit 0 in lanternfish']);
  sql.close();
});

test('A LINK THE MATCH MOVED IS A STEP IN NAMES, and undoMerge points it back', async () => {
  const { k, sql } = await record();
  const first = value<Entry>(k.create('people', { name: 'Teodor Vance', email: 'teodorv@lanternfish.example' }, OWNER));
  const second = value<Entry>(k.create('people', { name: 'Teodor', email: 'teodorv@pellucid.example' }, OWNER));
  const note = value<Entry>(k.create('notes', { heading: 'Call with Teodor', about: [second.id, first.id] }, OWNER));
  /* The second learns its full name, and is folded the moment it is met. */
  value(k.update('people', second.id, { name: 'Teodor Vance' }, OWNER));
  const met = value<Met>(k.meet({ email: 'teodorv@pellucid.example', where: 'commit 1 in lanternfish' }, AGENT));
  assert.equal(met.row?.id, first.id, 'the strong rules did not fold the second Teodor');
  assert.deepEqual(k.get(note.id)!.fields.about, [first.id]);
  const batch = sql.one<{ batch: string }>("SELECT batch FROM event WHERE field = 'merged_into' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1")!.batch;
  assert.equal(k.isFold(batch), true);

  const before = events(sql);
  const plan = k.foldPlan(batch)!;
  assert.equal(events(sql), before);
  assert.equal(plan.say, 'Puts back 2 people');
  const link = plan.steps.find((s) => s.row === note.id)!;
  assert.deepEqual([link.do, link.title, link.list, link.from, link.line], ['set', 'Call with Teodor', 'Notes', 'Teodor Vance', 'Point Call with Teodor back at Teodor Vance']);
  assert.equal(plan.steps[0]!.row, second.id);
  for (const id of [first.id, second.id, note.id, batch]) assert.ok(!shown(plan).includes(id), 'an id was put where a person reads');

  value(k.undoMerge(batch, OWNER));
  assert.equal(k.count('people'), 2);
  assert.equal(k.get(second.id)!.fields.email, 'teodorv@pellucid.example');
  assert.deepEqual(k.get(note.id)!.fields.about, [second.id, first.id], 'undo did not point the note back');
  sql.close();
});
