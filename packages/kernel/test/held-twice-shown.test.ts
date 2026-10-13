/**
 * `held-twice-shown`, the people the `held-twice` figure is about (integrate-80, deferred from the people page's note).
 *
 * WHAT WAS MISSING: `held-twice` says how many would go, and the list narrowed to them shows every one of them, so a
 * note over that list could say "1" above two people. Two numbers were wanted, "2 people, 1 too many", and a figure
 * holds one.
 *
 * SO A SECOND FIGURE READS THE SAME PASS (`twice` in `people.ts`), and these hold the two to it on a real record: a
 * pair is 2 shown and 1 too many, three of one name are 3 and 2, and where nobody is twice the second says nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_FIGURES, RECORD_PEOPLE, builtInFigure, countHeldTwiceBy } from '../src/built-in-figures.ts';
import { figureLists } from '../src/money-figures.ts';
import { openRecord, type Declaration, type Entry, type Kernel, type Reading, type WriteContext } from '../src/index.ts';
import { peopleTwiceIdsIn, peopleTwiceIn } from '../src/people.ts';
import type { MeetsFields } from '../src/roles.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 3);

const MEETS: MeetsFields = { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', self: 'self' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

/** The people list under a name of its own, so nothing here leans on what a record calls its people. */
const FOLK: Declaration = {
  id: 'register.folk',
  kind: 'register',
  body: {
    id: 'folk',
    name: 'People',
    title: 'name',
    meets: { ...MEETS },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'note', type: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'folk' },
    ],
  },
};

/** A list of names that plays no part: nobody is met into it. */
const CONTACTS: Declaration = { id: 'register.contacts', kind: 'register', body: { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };

async function record(decls: Declaration[] = [PROJECTS, FOLK]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(decls));
  return { k, sql };
}

const person = (k: Kernel, fields: Record<string, unknown>): Entry => value<Entry>(k.create('folk', fields, OWNER));

/** A figure read as a page reads it: by its id, through the record. */
const read = (k: Kernel, id: 'held-twice' | 'held-twice-shown'): Reading => {
  const decl = builtInFigure(id);
  assert.ok(decl, `no figure called ${id}`);
  return value<Reading>(k.metric(decl));
};

/** How the module that owns the pass hands both counts in: the people shown are the ones the narrowed list holds. */
const shownIn = (sql: Parameters<typeof peopleTwiceIn>[0]): number | null => peopleTwiceIdsIn(sql)?.length ?? null;
const handIn = (): void => countHeldTwiceBy(peopleTwiceIn, shownIn);

test('THE MODULE THAT OWNS THE PASS HANDS THE SECOND COUNT IN WHEN IT LOADS, so the figure reads with nothing set up', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Sam', email: 'sam@one.example' });
  person(k, { name: 'Sam' });
  const shown = read(k, 'held-twice-shown').value;
  sql.close();
  assert.equal(shown, 2);
});

test('THE SECOND FIGURE IS ONE EVERY RECORD HAS, over the people and no one list by name', () => {
  const decl = builtInFigure('held-twice-shown');
  assert.ok(decl);
  assert.equal(decl, BUILT_IN_FIGURES['held-twice-shown']);
  assert.equal(decl.metric, 'held-twice-shown');
  assert.equal(decl.source, RECORD_PEOPLE);
  assert.equal(decl.source, builtInFigure('held-twice')?.source, 'the two figures read different sources, so they could disagree');
  assert.deepEqual(decl.target, { lte: 0 });
  assert.equal(decl.format, 'int');
  assert.deepEqual(figureLists(decl), figureLists(builtInFigure('held-twice')!), 'whoever may read the count may read who it is about');
  assert.doesNotMatch(decl.name ?? '', /row|entity|—|twice shown/u);
  assert.notEqual(decl.name, builtInFigure('held-twice')?.name);
});

test('ONE PAIR IS 2 PEOPLE SHOWN AND 1 TOO MANY, and the first figure reads as it did', async () => {
  handIn();
  const { k, sql } = await record();
  person(k, { name: 'Mariam', email: 'mariam@shop.example' });
  person(k, { name: 'mariam ', note: 'From the import' });
  person(k, { name: 'Layla' });
  const shown = read(k, 'held-twice-shown');
  assert.deepEqual([shown.value, shown.held, shown.met], [2, 1, false]);
  assert.equal(read(k, 'held-twice').value, 1);
  assert.equal(shown.value, peopleTwiceIdsIn(sql)?.length, 'the figure and the narrowed list show different people');
  assert.doesNotMatch(shown.why, /row|entity|—|folk#/u);
  sql.close();
});

test('THREE OF ONE NAME ARE 3 SHOWN AND 2 TOO MANY', async () => {
  handIn();
  const { k, sql } = await record();
  person(k, { name: 'Omar Said', email: 'omar@one.example' });
  person(k, { name: 'Omar Said' });
  person(k, { name: 'omar said' });
  assert.equal(read(k, 'held-twice-shown').value, 3);
  assert.equal(read(k, 'held-twice').value, 2);
  assert.equal(peopleTwiceIdsIn(sql)?.length, 3);
  sql.close();
});

test('A PAIR AND THREE MARKED AS HIM ARE COUNTED EACH ONCE: 5 shown, 3 too many', async () => {
  handIn();
  const { k, sql } = await record();
  person(k, { name: 'Sam', email: 'sam@one.example' });
  person(k, { name: 'Sam' });
  person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  person(k, { name: 'Karim Assaf', handles: ['github:kas'], self: true });
  person(k, { name: 'Kas' });
  assert.equal(read(k, 'held-twice-shown').value, 5);
  assert.equal(read(k, 'held-twice').value, 3);
  sql.close();
});

test('NOBODY TWICE SAYS NOTHING, where the first figure says nought', async () => {
  handIn();
  const { k, sql } = await record();
  const empty = read(k, 'held-twice-shown');
  assert.deepEqual([empty.value, empty.held, empty.met], [null, 0, null], 'an empty people list drew a number');
  person(k, { name: 'Mariam', email: 'mariam@shop.example' });
  person(k, { name: 'Layla' });
  const none = read(k, 'held-twice-shown');
  assert.deepEqual([none.value, none.held, none.met], [null, 0, null]);
  assert.doesNotMatch(none.why, /row|entity|—/u);
  assert.equal(read(k, 'held-twice').value, 0, 'the first figure stopped saying nought');
  sql.close();
});

test('NOTHING WHERE NO LIST HOLDS PEOPLE, and a second count never handed in leaves the first as it was', async () => {
  handIn();
  const { k, sql } = await record([PROJECTS, CONTACTS]);
  value(k.create('contacts', { name: 'Mariam' }, OWNER));
  value(k.create('contacts', { name: 'Mariam' }, OWNER));
  assert.equal(read(k, 'held-twice-shown').value, null);
  assert.equal(read(k, 'held-twice').value, null);
  sql.close();
  /* The call as it stood before this figure, with one count: the second keeps what was handed in. */
  countHeldTwiceBy(peopleTwiceIn);
  const two = await record();
  person(two.k, { name: 'Sam', email: 'sam@one.example' });
  person(two.k, { name: 'Sam' });
  assert.equal(read(two.k, 'held-twice').value, 1);
  assert.equal(read(two.k, 'held-twice-shown').value, 2);
  two.sql.close();
});
