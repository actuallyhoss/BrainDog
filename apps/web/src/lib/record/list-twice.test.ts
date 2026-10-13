/**
 * THE PEOPLE WHO MAY BE ON THE RECORD TWICE, AS A LIST AN ADDRESS OPENS (`?twice=1`).
 *
 * The People page says how many people may be held twice and its link opened everyone, sorted by name, to be looked
 * through by eye. The record can name them (`heldTwice`), so the address carries one word, the list asks who they are
 * once and narrows itself to their numbers, and the line above the list says what is being shown and how to leave it.
 *
 * THE WORD IS READ BY THE LIST'S ROLE AND NEVER BY ITS NAME: a list that declares `meets:` is the people one, whatever
 * it is called, and any other list opens as it always did.
 *
 * AND BY THE ONE NAME THE KERNEL STILL READS, on a record whose add-on is older than the role: the list `meet` wrote by
 * name before any list declared `meets:`. That name is the kernel's (`PEOPLE`), imported and never written in `api.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PEOPLE as LEGACY_PEOPLE } from '@braindog/kernel';
import { compile, evaluate, type Predicate } from '@braindog/where';

import { heldTwiceOn, isRows, rowsFilter, twiceOf, twiceWords } from './api.ts';
import { REGISTERS, ROWS } from './fixtures/sample.ts';
import { rowsHeldTwice, treeOf, whereFor } from './remote.ts';
import type { RegisterDecl } from './schema.ts';
import { schemaOf } from './where.ts';
import './fixtures/fill.ts';

const route = readFileSync(new URL('../../routes/r/[register]/+page.svelte', import.meta.url), 'utf8');

const params = (href: string): URLSearchParams => new URL(href, 'http://x').searchParams;

/** A list of people as a record declares one: the sample's, with the role the record's own carries. */
const PEOPLE = { ...REGISTERS.people!, meets: { name: 'name' } } as RegisterDecl;

/** The same list as an add-on older than the role declared it: under the name the kernel still reads, saying no `meets:`. */
const { meets: _unsaid, ...BEFORE } = PEOPLE as RegisterDecl & { meets?: unknown };
const LEGACY = { ...BEFORE, id: LEGACY_PEOPLE } as RegisterDecl;

/** The numbers of the sample's people a `where` admits, by the engine the record compiles with. */
const admitted = (where: unknown): number[] => {
  const schema = schemaOf('people');
  assert.deepEqual(compile(where as Predicate, schema).bad, [], 'the record would refuse this tree');
  return (ROWS.people ?? []).filter((e) => evaluate(where as Predicate, e.fields, schema, { seq: e.seq })).map((e) => e.seq);
};

test('twice=1 on the list of people reads as the held-twice filter', () => {
  assert.equal(twiceOf(params('/r/people?twice=1')), true);
  assert.equal(heldTwiceOn(params('/r/people?twice=1'), PEOPLE), true);
  /* Beside a sort and a chip, which it neither reads nor disturbs. */
  assert.equal(heldTwiceOn(params('/r/people?sort=name&twice=1&f=trust:in:known'), PEOPLE), true);
});

test('the sample declares the role itself, and its list narrows as it stands', () => {
  /* `PEOPLE` above says the role again, which would hide a sample that stopped saying it. */
  const own = REGISTERS.people;
  assert.ok(own, 'the sample no longer has a list of people');
  assert.equal((own as { meets?: { name?: string } }).meets?.name, 'name', 'the sample no longer declares the role');
  assert.equal(heldTwiceOn(params('/r/people?twice=1'), own), true);
  assert.equal(heldTwiceOn(params('/r/people'), own), false);
});

test('any other spelling, and no word, is the list as it always opened', () => {
  for (const href of ['/r/people', '/r/people?twice=', '/r/people?twice=0', '/r/people?twice=yes', '/r/people?f=twice:in:1'])
    assert.equal(heldTwiceOn(params(href), PEOPLE), false, href);
});

test('a list that is not the people one ignores the word', () => {
  for (const id of ['tasks', 'obligations', 'things']) {
    const decl = REGISTERS[id];
    assert.ok(decl, `the sample no longer has ${id}`);
    assert.equal(heldTwiceOn(params(`/r/${id}?twice=1`), decl), false, id);
  }
  /* A list still being read. */
  assert.equal(heldTwiceOn(params('/r/people?twice=1'), undefined), false);
});

/* THE RECORD ON AN ADD-ON OLDER THAN THE ROLE (People 2.0.0 and before). Its list declares no `meets:` and the kernel
   reads it by the name it had (`LEGACY` in `packages/kernel/src/roles.ts`), so the figure counts and its note links
   here. The word must narrow this list too, or the link opens everyone. */
test('the list the kernel reads by name, declaring no role, narrows', () => {
  assert.equal(LEGACY_PEOPLE, 'people', 'the kernel no longer reads the list by this name');
  const legacy = LEGACY;
  assert.equal((legacy as { meets?: unknown }).meets, undefined);
  assert.equal(heldTwiceOn(params('/r/people?twice=1'), legacy), true);
  assert.equal(heldTwiceOn(params('/r/people?sort=name&twice=1'), legacy), true);
  /* The word is still the word: without it the list opens as it always did. */
  for (const href of ['/r/people', '/r/people?twice=0', '/r/people?f=twice:in:1']) assert.equal(heldTwiceOn(params(href), legacy), false, href);
});

test('another list declaring no role still ignores the word, whatever it holds', () => {
  /* The same fields under any other id: it is the kernel's one name that is read, never the shape. */
  for (const id of ['contacts', 'person', 'People', 'people2', 'organisations', 'fx']) {
    const other = { ...LEGACY, id } as RegisterDecl;
    assert.equal(heldTwiceOn(params(`/r/${id}?twice=1`), other), false, id);
  }
});

test('a list that declares the role narrows under any name', () => {
  for (const id of ['people', 'contacts', 'clients']) {
    const said = { ...PEOPLE, id } as RegisterDecl;
    assert.equal(heldTwiceOn(params(`/r/${id}?twice=1`), said), true, id);
    assert.equal(heldTwiceOn(params(`/r/${id}`), said), false, id);
  }
});

test('the list is asked with a tree over the numbers heldTwice answers', () => {
  const rows = rowsFilter([1, 3]);
  assert.equal(isRows(rows), true);
  assert.equal(isRows({ field: 'trust', op: 'in', values: ['known'] }), false);
  /* A tree and not a sentence, with nothing in the search box either. */
  const where = whereFor('people', [rows], '', new Map());
  assert.deepEqual(where, { field: 'seq', in: [1, 3] });
  assert.deepEqual(admitted(where), [1, 3]);
  /* And the same leaf wherever a tree is built, a bulk write and a saved view included. */
  assert.deepEqual(treeOf('people', [rows], '', new Map()), where);
});

test('one person is still a tree, and still that person', () => {
  const where = whereFor('people', [rowsFilter([2])], '', new Map());
  assert.equal(typeof where, 'object');
  assert.deepEqual(admitted(where), [2]);
});

test('the chips and the search box narrow inside the people held twice', () => {
  const first = (ROWS.people ?? [])[0];
  assert.ok(first, 'the sample has no people');
  const name = String(first.fields.name ?? '').split(' ')[0] ?? '';
  const where = whereFor('people', [rowsFilter([1, 2, 3])], name, new Map());
  assert.equal(typeof where, 'object');
  const seen = admitted(where);
  assert.ok(seen.includes(first.seq), 'the search dropped the person it names');
  assert.ok(seen.every((seq) => [1, 2, 3].includes(seq)), 'the search reached past the people held twice');
});

test('nobody held twice asks for nobody, and is not refused', () => {
  const where = whereFor('people', [rowsFilter([])], '', new Map());
  assert.equal(typeof where, 'object');
  assert.deepEqual(admitted(where), []);
});

test('the record is asked once, and its answer becomes the filter', async () => {
  const calls: unknown[][] = [];
  const call = async (name: string, args: Record<string, unknown>) => {
    calls.push([name, args]);
    return { ok: true as const, value: { seqs: [4, 9] } };
  };
  const out = await rowsHeldTwice(call, 'people');
  assert.deepEqual(calls, [['heldTwice', { register: 'people' }]]);
  assert.deepEqual(out, { ok: true, value: rowsFilter([4, 9]) });
});

test('a record with no people list, or nobody held twice, answers an empty filter', async () => {
  for (const value of [null, { seqs: [] }, { seqs: null }]) {
    const out = await rowsHeldTwice(async () => ({ ok: true as const, value }), 'people');
    assert.deepEqual(out, { ok: true, value: rowsFilter([]) }, JSON.stringify(value));
  }
});

test('a refusal comes back as the refusal, never as everyone', async () => {
  const refusal = { code: 'FORBIDDEN', fix: 'Ask the owner to let you read this list.' };
  const out = await rowsHeldTwice(async () => ({ ok: false as const, refusal }), 'people');
  assert.deepEqual(out, { ok: false, refusal });
});

test('the words say what is shown, how to leave, and that nobody is', () => {
  assert.equal(twiceWords.showing, 'Showing the people who may be on this record twice');
  assert.equal(twiceWords.none, 'Nobody is on this record twice.');
  assert.ok(twiceWords.clear.length > 0);
  for (const said of Object.values(twiceWords)) {
    assert.doesNotMatch(said, /—/, said);
    assert.doesNotMatch(said, /\b(row|rows|entity|list item|seq)\b/i, said);
  }
});

test('the list screen reads the word, asks once, and draws the line with its way out', () => {
  assert.match(route, /twiceOf\(page\.url\.searchParams\)/, 'the route does not read the word');
  assert.equal(route.match(/rowsHeldTwice\(/g)?.length, 1, 'the record is asked in one place');
  assert.match(route, /data-held-twice/, 'no line above the list');
  assert.match(route, /twiceWords\.showing/);
  assert.match(route, /data-held-twice-clear/, 'no way to clear it');
  assert.match(route, /twiceWords\.none/, 'an empty answer says nothing');
  /* The word leaves the address and nothing else does. */
  assert.match(route, /p\.delete\(TWICE\)/);
  /* A view has no word for it, so nothing is saved while it narrows the list, and Save view is not drawn beside a chip. */
  assert.match(route, /if \(twice\) \{\s*toasts\.push\(twiceWords\.unsaved/, 'a view is saved without the word');
  assert.match(route, /savable=\{twice === null\}/, 'Save view is drawn while the word narrows the list');
  assert.ok(twiceWords.unsaved.includes(twiceWords.clear), 'the sentence names a button the line does not have');
});
