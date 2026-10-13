/**
 * `heldTwice`: who the note "People who may be on this record twice" is about (`src/methods/held-twice.ts`), so the
 * list can be narrowed to them. A read: it answers the spoken numbers of the people the kernel's `peopleTwiceIdsIn`
 * names, nothing on a record that keeps no people, and a refusal for a caller the list is closed to.
 *
 * Through the real record, over the same people the figure counts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';
import { peopleTwiceIdsIn, type Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
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
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
/** Somebody who reads Projects and nothing else: the people are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };

type Twice = { seqs: number[] } | null;
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** Called through this so the file typechecks on a record that has not registered the method yet. */
const heldTwice = (api: Api, args: unknown, ctx: CallContext): Promise<Result<Twice>> => {
  const method = (api as unknown as { heldTwice?: (a: unknown, c: CallContext) => Promise<Result<Twice>> }).heldTwice;
  assert.equal(typeof method, 'function', 'heldTwice is not registered in methods/index.ts');
  return method!(args, ctx);
};

async function record(decls: unknown[] = [THINGS, PEOPLE]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install(decls as never));
  const add = (register: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  return { api, sql, add };
}

/** Two called Sam and two called Nour among three others, so four people are named and their numbers are not the first four. */
async function studio() {
  const r = await record();
  const layla = r.add('people', { name: 'Layla' });
  const sam = [r.add('people', { name: 'Sam', email: 'sam@one.example' })];
  const omar = r.add('people', { name: 'Omar Said', email: 'omar@one.example' });
  const nour = [r.add('people', { name: 'Nour', email: 'nour@studio.example' })];
  sam.push(r.add('people', { name: 'Sam' }));
  r.add('things', { name: 'Fanline' });
  nour.push(r.add('people', { name: 'Nour' }));
  return { ...r, layla, omar, sam, nour };
}

const numbers = (rows: readonly Entry[]): number[] => rows.map((r) => r.seq!).sort((a, b) => a - b);

test('THE PEOPLE HELD TWICE ARE ANSWERED BY THEIR NUMBERS IN THE LIST, each once, lowest first, and nobody else', async () => {
  const { api, sql, sam, nour, layla, omar } = await studio();
  const out = value<Twice>(await heldTwice(api, { register: 'people' }, owner));
  assert.deepEqual(out, { seqs: numbers([...sam, ...nour]) });
  assert.ok(!out!.seqs.includes(layla.seq!) && !out!.seqs.includes(omar.seq!), 'somebody held once was named');

  /* THE SAME PEOPLE THE FIGURE IS ABOUT, read from the kernel's own reader. */
  const ids = peopleTwiceIdsIn(sql)!;
  assert.deepEqual(out!.seqs, numbers(ids.map((id) => api.kernel.get(id)!)));
  /* NUMBERS, and never what the record calls a person inside. */
  assert.doesNotMatch(JSON.stringify(out), /[0-9A-HJKMNP-TV-Z]{26}/u);
  sql.close();
});

test('A READ: anybody who may read the list is answered the same, and nothing is written or asked', async () => {
  const { api, sql } = await studio();
  const count = () => [sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n];
  const before = count();
  const mine = value<Twice>(await heldTwice(api, { register: 'people' }, owner));
  assert.deepEqual(value<Twice>(await heldTwice(api, { register: 'people' }, reader)), mine);
  assert.deepEqual(count(), before);
  sql.close();
});

test('NOBODY HELD TWICE IS AN EMPTY ANSWER, and one of a pair removed takes both off', async () => {
  const { api, sql, add } = await record();
  add('people', { name: 'Layla' });
  assert.deepEqual(value<Twice>(await heldTwice(api, { register: 'people' }, owner)), { seqs: [] });
  const a = add('people', { name: 'Mariam', email: 'mariam@shop.example' });
  const b = add('people', { name: 'mariam ' });
  assert.deepEqual(value<Twice>(await heldTwice(api, { register: 'people' }, owner)), { seqs: numbers([a, b]) });
  value(api.kernel.update('people', b.id, { deleted_at: true }, { actor: 'p_1' }));
  assert.deepEqual(value<Twice>(await heldTwice(api, { register: 'people' }, owner)), { seqs: [] }, 'somebody removed is still named');
  sql.close();
});

test('A RECORD THAT KEEPS NO PEOPLE ANSWERS NOTHING, never an empty list, and so does a list that is not the people', async () => {
  const none = await record([THINGS]);
  none.add('things', { name: 'Fanline' });
  none.add('things', { name: 'Fanline' });
  assert.equal(value<Twice>(await heldTwice(none.api, { register: 'things' }, owner)), null);
  none.sql.close();

  const { api, sql } = await studio();
  assert.equal(value<Twice>(await heldTwice(api, { register: 'things' }, owner)), null, 'Projects were answered with people');
  sql.close();
});

test('A CALLER THE LIST IS CLOSED TO IS REFUSED, before anything is read, and told nothing of who is in it', async () => {
  const { api, sql } = await studio();
  const out = await heldTwice(api, { register: 'people' }, shut);
  assert.equal(out.ok, false);
  assert.equal(refusal(out).code, refusal(await api.list({ register: 'people' } as never, shut) as Result<unknown>).code, 'refused as reading the list is');
  assert.doesNotMatch(JSON.stringify(refusal(out)), /Sam|Nour|\d{2,}|—/u);
  /* AND WHAT THEY MAY READ IS STILL NOT THE PEOPLE. */
  assert.equal(value<Twice>(await heldTwice(api, { register: 'things' }, shut)), null);
  sql.close();
});

test('A GRANT NARROWED TO SOME OF THE PEOPLE IS ANSWERED ONLY THOSE, never the number of somebody it leaves out', async () => {
  const { api, sql, sam } = await studio();
  const narrowed = { principal: { kind: 'person', id: 'p_4', level: 'read' }, wheres: { people: { field: 'name', is: 'Sam' } } } as unknown as CallContext;
  assert.deepEqual(value<Twice>(await heldTwice(api, { register: 'people' }, narrowed)), { seqs: numbers(sam) });
  sql.close();
});

test('A LIST NOT NAMED, OR NAMED BY SOMETHING THAT IS NOT TEXT, IS REFUSED AT register in one plain sentence', async () => {
  const { api, sql } = await studio();
  for (const args of [undefined, {}, { register: 7 }, { register: ['people'] }, { register: '' }]) {
    const out = await heldTwice(api, args, owner);
    assert.equal(out.ok, false, JSON.stringify(args));
    assert.equal(refusal(out).at, 'register');
    assert.doesNotMatch(refusal(out).fix, /—|[0-9A-HJKMNP-TV-Z]{26}/u);
  }
  const unknown = await heldTwice(api, { register: 'nowhere' }, owner);
  assert.equal(refusal(unknown).code, 'REGISTER_UNKNOWN');
  sql.close();
});
