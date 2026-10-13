/**
 * `matched`: the folds the record made by its own strong rules (`src/methods/matched.ts`), each with who was matched
 * into whom by name, one sentence of evidence, when, and the batch its Undo takes. A read: it folds nothing.
 *
 * Through the real record's `meet`, so the fold listed is one the kernel's rules made: somebody met in a commit, the
 * same name noted under another address, and then a note under the commit's own address, which is the meeting that
 * finds the commit's person by their key and folds the two (`kindsMeet` in the kernel's people file).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, MATCHED_MOST, type Matched } from '../src/methods/matched.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
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
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
/** A member who reads Projects and nothing else: the people are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };

type Met = { row?: { seq: number; name: string }; matched_by: string; undo?: string; question?: string };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.ok(!out.ok, `expected a refusal, got ${JSON.stringify(out)}`);
  return (out as { refusal: Refusal }).refusal;
};

/** The method on the record's own kernel, with the guard a list closed to the caller is refused by. */
function read(api: Api, sql: ReturnType<typeof openSqlite>) {
  const closed = (ctx: CallContext, register?: string): Refusal | null =>
    register !== undefined && ctx.registers !== undefined && !ctx.registers.includes(register)
      ? { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${register}.`, at: 'register' }
      : null;
  const deps = {
    kernel: api.kernel,
    sql,
    guard: (ctx: CallContext, _need: string, asked?: string) => closed(ctx, asked),
    readable: closed,
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return methods(deps).matched;
}

async function record(decls: unknown[] = [THINGS, PEOPLE]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install(decls as never));
  const meet = async (said: Record<string, unknown>) => value<Met>(await api.meet(said as never, owner));
  const live = () => sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq").map((r) => r.seq);
  return { api, sql, meet, live, matched: read(api, sql) };
}

/** Teodor met in a commit, noted under another address, then noted under the commit's own: the strong rules fold the two. */
async function folded() {
  const r = await record();
  await r.meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  const asked = await r.meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  assert.ok(asked.question, 'a commit and a note under another address are asked about, not folded');
  assert.deepEqual(r.live(), [1, 2]);
  const met = await r.meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Wednesday' });
  assert.ok(met.undo, 'the strong rules did not fold them');
  assert.deepEqual(r.live(), [1], 'one person results');
  return { ...r, batch: met.undo! };
}

test('A FOLD THE STRONG RULES MADE IS LISTED ONCE: who into whom by name, one sentence of evidence, when, and its batch', async () => {
  const { sql, matched, batch } = await folded();
  const out = value<Matched>(await matched(undefined, owner));
  assert.ok(out !== null);
  assert.equal(out.matches.length, 1);
  const one = out.matches[0]!;
  assert.deepEqual(one.from, ['Teodor Vance']);
  assert.deepEqual(one.into, { name: 'Teodor Vance', seq: 1 });
  assert.equal(one.batch, batch, 'the batch its Undo takes');
  assert.equal(one.at, '2026-10-13T12:00:00.000Z');
  /* ONE SENTENCE, IN PLAIN WORDS, NAMING THE KEY THEY SHARE and never an address, an id or a dash. */
  assert.equal(one.evidence, 'The same name and the same handle, teodorv.');
  assert.doesNotMatch(JSON.stringify({ ...one, batch: '' }), /@|example|[0-9A-HJKMNP-TV-Z]{26}|—|merged_into/u);
  /* A READER OF THE LIST IS ANSWERED AS THE OWNER IS. */
  assert.deepEqual(value<Matched>(await matched({}, reader)), out);
  sql.close();
});

test('A FOLD THE BANDS MADE SAYS ITS OWN SENTENCE, never the handle the two happen to share', async () => {
  /* What `settleVerdicts` writes in the fold's note (`people.ts`): 'Matched A with B: <sentence>'. Nothing folds on a
     score yet, so the note of a fold the strong rules made is rewritten to the one a band fold carries. */
  const { sql, matched, batch } = await folded();
  sql.exec("UPDATE event SET note = 'Matched Teodor Vance with Teodor Vance: both are on Lanternfish.' WHERE batch = ? AND note IS NOT NULL", batch);
  const out = value<Matched>(await matched(undefined, owner));
  assert.equal(out?.matches[0]?.evidence, 'Both are on Lanternfish.');
  sql.close();
});

test('IT WRITES NOTHING AND FOLDS NOTHING: the log and the people are as they were after any number of reads', async () => {
  const { sql, matched, live } = await folded();
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  for (let i = 0; i < 3; i++) value<Matched>(await matched(undefined, owner));
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before);
  assert.deepEqual(live(), [1]);
  sql.close();
});

test('AFTER THE MERGE IS UNDONE TWO PEOPLE ARE BACK AND NONE IS LISTED', async () => {
  const { api, sql, matched, live, batch } = await folded();
  value(api.kernel.undoMerge(batch, { actor: 'p_1' }));
  assert.deepEqual(live(), [1, 2], 'two people are back');
  assert.deepEqual(value<Matched>(await matched(undefined, owner))!.matches, []);
  sql.close();
});

test('WHAT IS LISTED IS WHAT STANDS: after the record\'s own undo of the batch, the fold is listed exactly while one person is still two folded', async () => {
  const { api, sql, matched, live, batch } = await folded();
  const plan = value<{ hash: string }>(await api.undo({ batch, dry: true }, owner));
  value(await api.undo({ batch, hash: plan.hash }, owner));
  /* TODAY THE GENERAL UNDO LEAVES THE FOLDED ONE FOLDED and says so; once it hands a fold to the kernel's undo of a merge,
     two are back. Either way the read says what the list holds, never what the last press meant to do. */
  const listed = value<Matched>(await matched(undefined, owner))!.matches;
  assert.equal(listed.length, live().length === 1 ? 1 : 0);
  sql.close();
});

test('A MERGE THE OWNER ANSWERED A QUESTION WITH IS NOT ONE THE RECORD MADE, and is not listed', async () => {
  const r = await record();
  await r.meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  const asked = await r.meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  value(r.api.kernel.decide(asked.question!, { decide: { option: 'accept', reason: 'the same Teodor' } }, 'p_1'));
  assert.deepEqual(r.live(), [1]);
  assert.deepEqual(value<Matched>(await r.matched(undefined, owner))!.matches, []);
  r.sql.close();
});

test('A MEMBER WHO MAY NOT READ THE PEOPLE IS ANSWERED NOTHING, refused before anything is read', async () => {
  const { sql, matched } = await folded();
  const out = await matched(undefined, shut);
  assert.equal(out.ok, false);
  assert.doesNotMatch(JSON.stringify(refusal(out)), /Teodor|teodorv|—/u);
  sql.close();
});

test('A GRANT NARROWED TO SOME OF THE PEOPLE IS ANSWERED ONLY THE FOLDS INTO SOMEBODY IT ADMITS', async () => {
  const { sql, matched } = await folded();
  const narrowed = (name: string) => ({ principal: { kind: 'person', id: 'p_4', level: 'read' }, wheres: { people: { field: 'name', is: name } } }) as unknown as CallContext;
  assert.equal(value<Matched>(await matched(undefined, narrowed('Teodor Vance')))!.matches.length, 1);
  assert.deepEqual(value<Matched>(await matched(undefined, narrowed('Somebody Else')))!.matches, []);
  sql.close();
});

test('A RECORD THAT KEEPS NO PEOPLE ANSWERS NOTHING, never an empty list, and one that folded nobody answers none', async () => {
  const none = await record([THINGS]);
  assert.equal(value<Matched>(await none.matched(undefined, owner)), null);
  none.sql.close();

  const r = await record();
  await r.meet({ name: 'Ada Lovelace', email: 'ada@example.com', source: 'note from Monday' });
  assert.deepEqual(value<Matched>(await r.matched(undefined, owner)), { matches: [] });
  r.sql.close();
});

test('FIFTY AT MOST, NEWEST FIRST', async () => {
  assert.equal(MATCHED_MOST, 50);
  const r = await record();
  /* Each pair met in two commits, which fold on the strong rules alone; the clock is fixed, so the log's order says which is newer. */
  const names = ['Alba', 'Bruno', 'Carla'];
  const batches: string[] = [];
  for (const [i, first] of names.entries()) {
    const stem = `${first.toLowerCase()}marlowe`;
    await r.meet({ name: `${first} Marlowe`, email: `${stem}@one.example`, source: `commit ${i}0 in lanternfish` });
    const met = await r.meet({ name: `${first} Marlowe`, email: `${stem}@two.example`, source: `commit ${i}1 in lanternfish` });
    assert.ok(met.undo, `${first} was not folded`);
    batches.push(met.undo!);
  }
  const all = value<Matched>(await r.matched(undefined, owner))!.matches;
  assert.deepEqual(all.map((m) => m.batch), [...batches].reverse());
  assert.deepEqual(all.map((m) => m.into.name), ['Carla Marlowe', 'Bruno Marlowe', 'Alba Marlowe']);
  assert.equal(all[0]!.evidence, 'The same name and the same handle, carlamarlowe.');
  const two = value<Matched>(await r.matched({ limit: 2 }, owner))!.matches;
  assert.deepEqual(two.map((m) => m.batch), batches.slice(1).reverse());
  for (const limit of [0, -1, 1.5, '2', 51]) {
    const out = await r.matched({ limit }, owner);
    assert.equal(out.ok, false, JSON.stringify(limit));
    assert.equal(refusal(out).at, 'limit');
  }
  r.sql.close();
});

test('THROUGH THE RECORD ITSELF, once methods/index.ts lists matched', async (t) => {
  const { api, sql, batch } = await folded();
  const through = (api as unknown as { matched?: (a: unknown, c: CallContext) => Promise<Result<Matched>> }).matched;
  if (through === undefined) {
    sql.close();
    return t.skip('matched is not registered in methods/index.ts yet (blocked to the integrator)');
  }
  assert.equal(value<Matched>(await through(undefined, owner))!.matches[0]!.batch, batch);
  assert.equal((await through(undefined, shut)).ok, false);
  sql.close();
});
