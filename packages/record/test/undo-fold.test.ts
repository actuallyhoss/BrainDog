/**
 * Undo of a match, the record's half (`src/methods/undo.ts`): the batch `matched` hands a screen is one the strong rules
 * folded two people in, and `undo` puts it back as the kernel puts a merge back, whole, so two people come back with
 * what each held. A look first and a press second, as for any undo, and only for the owner signed in.
 *
 * Through a real record in memory, folded as `matched.test.ts` folds one: somebody met in a commit, the same name noted
 * under another address, then a note under the commit's own address, which is the meeting that folds the two.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, UndoPlan } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import type { Undone } from '../src/methods/undo.ts';
import type { Matched } from '../src/methods/matched.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', keys: 'keys', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text', label: 'Handles' },
      { id: 'keys', type: 'list', of: 'text', label: 'Keys' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, credentialed: true };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } };

type Met = { row?: { seq: number; name: string }; matched_by: string; undo?: string; question?: string };
type Person = { seq: number; fields: Record<string, unknown> };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: unknown): { code: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(r)}`);
  return x.refusal!;
};

/** No id, address or dash in anything a person reads. */
const PLAIN = /[0-9A-HJKMNP-TV-Z]{26}|@|merged_into|—/u;

/** Teodor met in a commit, noted under another address, then noted under the commit's own: the strong rules fold the two. */
async function folded() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([TASKS, PEOPLE] as never));
  const meet = async (said: Record<string, unknown>) => value<Met>(await api.meet(said as never, owner));
  const people = (): Person[] =>
    sql
      .all<{ seq: number; fields: string }>("SELECT seq, fields FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq")
      .map((r) => ({ seq: r.seq, fields: JSON.parse(r.fields) as Record<string, unknown> }));
  const matches = async () => value<Matched>(await api.matched(undefined, owner))!.matches;
  const events = () => sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  const asked = await meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  assert.ok(asked.question, 'a commit and a note under another address are asked about, not folded');
  const before = people();
  assert.deepEqual(before.map((p) => p.seq), [1, 2]);
  const met = await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Wednesday' });
  assert.ok(met.undo, 'the strong rules did not fold them');
  assert.deepEqual(people().map((p) => p.seq), [1], 'one person results');
  return { api, sql, people, matches, events, before, batch: met.undo! };
}

test('THE LOOK: the batch `matched` lists is answered as the fold put back, in names, with a hash, and nothing is written', async () => {
  const { api, sql, people, matches, events, batch } = await folded();
  const listed = await matches();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.batch, batch, 'the batch its Undo takes');

  const n = events();
  const plan = value<UndoPlan>(await api.undo({ batch: listed[0]!.batch, dry: true }, owner));
  assert.match(plan.say, /^Puts back 2 people/u, plan.say);
  assert.ok(typeof plan.hash === 'string' && plan.hash !== '', 'the hash a press hands back');
  assert.equal(plan.already, false);
  assert.ok(plan.steps.length > 0, 'the plan says what comes back');
  /* EVERY LINE A PERSON READS IS IN `lines`, what it does first and what it leaves after, as on any other plan. */
  assert.deepEqual(plan.lines, [...plan.steps.map((s) => s.line), ...plan.skipped.map((s) => s.line)]);
  assert.match(JSON.stringify(plan.lines), /Teodor Vance/u, 'said by name');
  assert.doesNotMatch(JSON.stringify([plan.say, plan.lines, plan.skipped.map((s) => [s.title, s.why])]), PLAIN);
  assert.deepEqual(plan.skipped, [], 'nothing of a fresh fold is left as it is');
  /* THE SAME LOOK TWICE IS THE SAME PLAN, and neither wrote a line. */
  assert.equal(value<UndoPlan>(await api.undo({ batch, dry: true }, owner)).hash, plan.hash);
  assert.equal(events(), n, 'a look writes nothing');
  assert.deepEqual(people().map((p) => p.seq), [1]);
  sql.close();
});

test('THE PRESS: two live people again, each holding what they held, and `matched` no longer lists the pair', async () => {
  const { api, sql, people, matches, before, batch } = await folded();
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  const done = value<Undone>(await api.undo({ batch, hash: plan.hash }, owner));

  const now = people();
  assert.deepEqual(now.map((p) => p.seq), [1, 2], 'two people are back');
  /* THE ONE FOLDED AWAY IS AS THEY WERE, AND THE ONE KEPT GAVE BACK WHAT IT WAS CARRIED: the other's address is not a
     key of theirs any more. What the meeting itself noted on the one kept (Wednesday's note) is theirs and stays. */
  assert.deepEqual(now[1]!.fields, before[1]!.fields);
  assert.equal(now[0]!.fields.email, 'teodorv@lanternfish.example');
  assert.doesNotMatch(JSON.stringify(now[0]!.fields), /pellucid|Tuesday/u, 'the kept one still carries what the fold gave it');
  assert.deepEqual(await matches(), [], 'the pair is not listed');

  /* THE SAME ANSWER ANY UNDO GIVES, so no screen changes: its own batch, a count, one sentence, the lines, what was left. */
  assert.deepEqual(Object.keys(done).sort(), ['batch', 'lines', 'put', 'say', 'skipped']);
  assert.ok(typeof done.batch === 'string' && done.batch !== '');
  assert.ok(done.put > 0);
  assert.match(done.say, /^Put back 2 people\.$/u, done.say);
  assert.deepEqual(done.lines, plan.steps.map((s) => s.line));
  assert.deepEqual(done.skipped, []);
  assert.doesNotMatch(JSON.stringify([done.say, done.lines]), PLAIN);
  sql.close();
});

test('A HASH FROM BEFORE A LATER EDIT IS REFUSED: PLAN_STALE, nobody comes back, and a fresh look says what is left', async () => {
  const { api, sql, people, batch } = await folded();
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  /* THE KEY THE FOLD CARRIED ONTO THE ONE KEPT IS TAKEN OFF BY HAND, so that line of the fold is no longer the fold's. */
  const kept = api.kernel.get({ register: 'people', seq: 1 })!;
  value(api.kernel.write('people', kept.id, { keys: [] } as never, { actor: 'p_1', version: kept.version }));

  const out = refused(await api.undo({ batch, hash: plan.hash }, owner));
  assert.equal(out.code, 'PLAN_STALE');
  assert.doesNotMatch(out.fix, PLAIN);
  assert.deepEqual(people().map((p) => p.seq), [1], 'nothing was put back');

  const again = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  assert.notEqual(again.hash, plan.hash, 'the plan moved with the edit');
  assert.ok(again.skipped.some((s) => /^Leaves .+ as it is: /u.test(s.line)), JSON.stringify(again.skipped));
  /* AND THE FRESH HASH LANDS: the two are back, and what was changed by hand is left as it now is. */
  value<Undone>(await api.undo({ batch, hash: again.hash }, owner));
  assert.deepEqual(people().map((p) => p.seq), [1, 2]);
  sql.close();
});

test('A PRESS WITH NO HASH, OR ONE THAT NAMES ONE OF THE TWO, IS REFUSED: a match goes back whole or not at all', async () => {
  const { api, sql, people, batch } = await folded();
  assert.equal(refused(await api.undo({ batch }, owner)).code, 'REQUIRED_MISSING');
  for (const args of [{ batch, row: { register: 'people', seq: 2 }, dry: true }, { batch, row: { register: 'people', seq: 1 }, hash: 'x' }]) {
    const out = refused(await api.undo(args, owner));
    assert.equal(out.code, 'VALUE_MALFORMED');
    assert.match(out.fix, /both/u);
  }
  assert.deepEqual(people().map((p) => p.seq), [1]);
  sql.close();
});

test('ONLY THE OWNER, SIGNED IN: a member below owner and a token are refused the look and the press, as on any undo', async () => {
  const { api, sql, people, events, batch } = await folded();
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  const n = events();
  for (const [who, ctx, code] of [['a member below owner', member, 'LEVEL_REQUIRED'], ['the owner’s own token', token, 'NEEDS_BROWSER_SESSION']] as const) {
    for (const args of [{ batch, dry: true }, { batch, hash: plan.hash }]) assert.equal(refused(await api.undo(args, ctx)).code, code, who);
  }
  assert.deepEqual(people().map((p) => p.seq), [1], 'nobody was put back');
  assert.equal(events(), n, 'and nothing was written');
  sql.close();
});

test('AN ORDINARY CHANGE STILL GOES THE GENERAL WAY: its plan counts changes, and its press removes what was added', async () => {
  const { api, sql, people, batch } = await folded();
  const made = value<Entry>(api.kernel.create('tasks', { name: 'Ship' }, { actor: 'p_1' }));
  const own = sql.one<{ batch: string | null; id: string }>('SELECT batch, id FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `entry:${made.id}`)!;
  const ordinary = own.batch ?? own.id;
  assert.equal(api.kernel.isFold(ordinary), false);
  assert.equal(api.kernel.isFold(batch), true);
  const plan = value<UndoPlan>(await api.undo({ batch: ordinary, dry: true }, owner));
  assert.equal(plan.say, 'Puts back one change.');
  const done = value<Undone>(await api.undo({ batch: ordinary, hash: plan.hash }, owner));
  assert.equal(done.put, 1);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'tasks' AND deleted_at IS NULL")!.n, 0);
  /* AND THE FOLD BESIDE IT IS UNTOUCHED. */
  assert.deepEqual(people().map((p) => p.seq), [1]);
  sql.close();
});

test('THE LADDER IS TOLD IN THE SAME TRANSACTION: whoever made the fold is back at Ask on folding, and no id of theirs is answered', async () => {
  const { api, sql, batch } = await folded();
  /* A FOLD AN AGENT MADE, on a rung above Ask for folding. The strong rules sign as whoever met, here the owner, so the
     batch is signed over to the record's own agent the way a fold it made would be. */
  sql.exec("UPDATE event SET actor = 'slash' WHERE batch = ?", batch);
  sql.exec("INSERT OR REPLACE INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('slash', 'fold', 'tell', 4, '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT OR REPLACE INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('slash', 'tasks:add', 'tell', 4, '2026-10-01T00:00:00.000Z')");
  const rung = (kind: string) => sql.one<{ rung: string; dropped_at: string | null }>("SELECT rung, dropped_at FROM ladder WHERE agent = 'slash' AND kind = ?", kind)!;

  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  assert.equal(rung('fold').rung, 'tell', 'a look drops nothing');
  const done = value<Undone & { undone?: unknown }>(await api.undo({ batch, hash: plan.hash }, owner));
  assert.equal(rung('fold').rung, 'ask');
  assert.ok(rung('fold').dropped_at, 'and it says when');
  assert.equal(rung('tasks:add').rung, 'tell', 'another kind of change keeps its rung');
  assert.equal(done.undone, undefined, 'which agent it was stays in the record');
  /* ONE MARK FOR THE BATCH, the kernel's own, naming the undo's batch: the one this answers. */
  const marks = sql.all<{ batch: string; by_batch: string; agent: string | null }>('SELECT batch, by_batch, agent FROM undone');
  assert.deepEqual(marks.map((m) => ({ ...m })), [{ batch, by_batch: done.batch, agent: 'slash' }]);

  /* AND THE RECORD KEEPS THAT THIS BATCH WAS PUT BACK, as for any undo: a second look says so, and a second press does nothing. */
  const again = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  assert.equal(again.already, true);
  assert.equal(again.say, 'This was put back already.');
  assert.deepEqual(again.steps, []);
  assert.equal(value<Undone>(await api.undo({ batch, hash: again.hash }, owner)).put, 0);
  sql.close();
});
