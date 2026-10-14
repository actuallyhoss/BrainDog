/**
 * One learning that replaces another (`replacedIn` in `src/methods/learnings.ts`, AGT-C14 job b, as a read): an agent
 * is handed only what still holds. A learning names the one it replaces; the replaced one leaves the `learnings` read,
 * is counted in `replaced`, and is still on the list, unchanged, for a person.
 *
 * Through the real record on a real kernel in memory, with the seed and the agents add-on installed as any add-on is.
 * The seed's own learnings are taken back first, so every row an assertion counts is one this file wrote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { replacedIn, replacesField, type Learnings } from '../src/methods/learnings.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const DAY = 86_400_000;
const NOW = SEEDED + 200 * DAY;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A run in the seed's Portage, placed by its repository's folder name. */
const inPortage: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c-1', client: 'claude-code', host: 'mac', repo: 'portage' },
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Made = { api: Api; clock: ReturnType<typeof fixedClock>; portage: string };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  const seeded = value<{ rows: Entry[] }>(await api.list({ register: 'learnings', limit: 50 }, owner)).rows;
  for (const row of seeded)
    if (row.state === 'active') value(await api.update({ register: 'learnings', seq: row.seq!, patch: { state: 'reverted', why: 'Taken off so this file counts only what it wrote.' } }, owner));
  const things = value<{ rows: Entry[] }>(await api.list({ register: 'things', where: { field: 'name', is: 'Portage' } }, owner)).rows[0];
  if (!things) assert.fail('the seed has no Portage');
  clock.set(NOW);
  return { api, clock, portage: `things#${String(things.seq)}` };
}

/** One learning made `ago` days back, here in Portage or everywhere, and the name a person says it by. */
async function learn(r: Made, ago: number, lesson: string, more: Record<string, unknown> = {}, here = true): Promise<string> {
  r.clock.set(NOW - ago * DAY);
  const row = value<Entry>(
    await r.api.create(
      { register: 'learnings', fields: { lesson, because: `It went wrong once, and this is the note of how: ${lesson}`, kind: 'method', ...(here ? { project: r.portage } : {}), ...more } },
      owner,
    ),
  );
  r.clock.set(NOW);
  return r.api.kernel.nameOf(row.id);
}

const seqOf = (spoken: string): number => Number(spoken.replace(/^[A-Z]+/u, ''));
const read = async (r: Made, ctx: CallContext = inPortage): Promise<Learnings> =>
  value<Learnings>(await (r.api as unknown as { learnings: (a: unknown, c: CallContext) => Promise<Result<Learnings>> }).learnings({}, ctx));
const handed = (got: Learnings): string[] => got.rows.map((row) => row.spoken);
const stored = async (r: Made, spoken: string): Promise<Entry> =>
  value<{ rows: Entry[] }>(await r.api.list({ register: 'learnings', where: { field: 'seq', is: seqOf(spoken) }, limit: 1 }, owner)).rows[0]!;

test('ONE A LEARNING REPLACES IS NOT HANDED, is counted, and is still on the list unchanged for a person', async () => {
  const r = await record();
  const old = await learn(r, 20, 'Chase an invoice at thirty days.');
  const before = await stored(r, old);
  assert.deepEqual(handed(await read(r)), [old], 'alone, it stands');

  const newer = await learn(r, 3, 'Chase an invoice once its own terms have run out.', { supersedes: old });
  const got = await read(r);
  assert.deepEqual(handed(got), [newer]);
  assert.deepEqual([got.replaced, got.faded, got.truncated], [1, 0, false]);

  /* NOTHING WAS WRITTEN: the old row keeps its state and version, and a person still finds it on the list. */
  const after = await stored(r, old);
  assert.deepEqual([after.state, after.version, after.updated_at], [before.state, before.version, before.updated_at]);
  const listed = value<{ rows: Entry[] }>(await r.api.list({ register: 'learnings', limit: 50 }, owner)).rows.map((row) => r.api.kernel.nameOf(row.id));
  assert.ok(listed.includes(old) && listed.includes(newer), JSON.stringify(listed));
});

test('DOWN A CHAIN: C replaces B replaces A, and only C is handed', async () => {
  const r = await record();
  const a = await learn(r, 30, 'Build the site with the old bundler.');
  const b = await learn(r, 20, 'Build the site with the new bundler.', { supersedes: a });
  const c = await learn(r, 10, 'Build the site with the bundler the lockfile names.', { supersedes: b });
  const other = await learn(r, 5, 'Proof the poster on paper before the web.');
  const got = await read(r);
  assert.deepEqual(handed(got).sort(), [c, other].sort());
  assert.equal(got.replaced, 2);
});

test('A LOOP DOES NOT HANG: two that name each other both stand, and one that replaces the loop puts both out', async () => {
  const r = await record();
  const a = await learn(r, 30, 'The staging copy sends no mail.');
  const b = await learn(r, 20, 'The staging copy sends mail to the team only.', { supersedes: a });
  value(await r.api.update({ register: 'learnings', seq: seqOf(a), patch: { supersedes: b } }, owner));
  const looped = await read(r);
  assert.deepEqual(handed(looped).sort(), [a, b].sort(), 'nobody can say which of the two holds');
  assert.equal(looped.replaced, 0);

  const c = await learn(r, 2, 'The staging copy sends mail to a sink nobody reads.', { supersedes: b });
  const got = await read(r);
  assert.deepEqual(handed(got), [c]);
  assert.equal(got.replaced, 2);
});

test('A REPLACEMENT DELETED OR TAKEN BACK hands the old lesson again', async () => {
  const r = await record();
  const old = await learn(r, 20, 'Export the variable font last of all.');
  const newer = await learn(r, 5, 'Export the variable font first, then the statics.', { supersedes: old });
  assert.deepEqual(handed(await read(r)), [newer]);

  value(r.api.kernel.write('learnings', `learnings#${String(seqOf(newer))}`, { deleted_at: 'now' } as never, { actor: 'p_1' }));
  const gone = await read(r);
  assert.deepEqual([handed(gone), gone.replaced], [[old], 0]);

  const again = await learn(r, 1, 'Export the statics first, then the variable font.', { supersedes: old });
  assert.deepEqual(handed(await read(r)), [again]);
  value(await r.api.update({ register: 'learnings', seq: seqOf(again), patch: { state: 'reverted', why: 'It was wrong: the statics come out of the variable one.' } }, owner));
  assert.deepEqual(handed(await read(r)), [old]);
});

test('WHERE IT APPLIES: a project\'s lesson replaces one for everywhere in that project, and nowhere else', async () => {
  const r = await record();
  const wide = await learn(r, 20, 'Release on a Friday afternoon is fine.', {}, false);
  const here = await learn(r, 4, 'Never release this project on a Friday.', { supersedes: wide });
  const inside = await read(r);
  assert.deepEqual([handed(inside), inside.replaced], [[here], 1]);
  /* The owner in a browser stands in no project, so the project's lesson is not read and the wide one still holds. */
  const outside = await read(r, owner);
  assert.deepEqual([handed(outside), outside.replaced], [[wide], 0]);
});

test('A REPLACEMENT THAT HAS FADED STILL SAYS THE OLD ONE STOPPED BEING TRUE', async () => {
  const r = await record();
  const old = await learn(r, 150, 'The old importer drops the last line.', { confirmed_on: dayOf(NOW - 5 * DAY) });
  await learn(r, 120, 'The importer keeps the last line since its fix.', { supersedes: old });
  const got = await read(r);
  assert.deepEqual([handed(got), got.replaced, got.faded], [[], 1, 1]);
});

test('replacedIn, BY ITSELF: the field is found by what the list declares, and odd values name nothing', () => {
  const fields = [
    { id: 'lesson', type: 'text' },
    { id: 'project', type: 'ref', to: 'things' },
    { id: 'old_link', type: 'ref', to: 'learnings', retired: true },
    { id: 'supersedes', type: 'ref', to: 'learnings' },
  ];
  assert.equal(replacesField('learnings', fields), 'supersedes');
  assert.equal(replacesField('learnings', fields.slice(0, 3)), null);

  const row = (id: string, names?: unknown): Entry => ({ id, fields: names === undefined ? {} : { supersedes: names } }) as unknown as Entry;
  const rows = [row('a'), row('b', 'a'), row('c', 'b'), row('self', 'self'), row('blank', ''), row('odd', 7), row('far', 'gone')];
  assert.deepEqual([...replacedIn(rows, 'supersedes')].sort(), ['a', 'b', 'gone']);
  assert.equal(replacedIn(rows, null).size, 0, 'a list with no such field replaces nothing');
  /* A ring of three with a tail into it ends, and every one in the ring is out. */
  const ring = [row('x', 'y'), row('y', 'z'), row('z', 'x'), row('t', 'x')];
  assert.deepEqual([...replacedIn(ring, 'supersedes')].sort(), ['x', 'y', 'z']);
  assert.equal(replacedIn(ring.slice(0, 3), 'supersedes').size, 0);
});
