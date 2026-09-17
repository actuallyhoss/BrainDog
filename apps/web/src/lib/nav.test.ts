/**
 * The rail's order, which had no test at all.
 *
 * `arrange()` is the one function that decides where a page sits in somebody's navigation, and its
 * whole subject is a disagreement: the reader has moved things, the record declares an order, and
 * neither is allowed to erase the other. It had a comment describing what it does and nothing
 * asserting it, and the comment was wrong about the case that matters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrange, orderLists, withOrder } from './nav.ts';

type Entry = { section: string; href: string; order: number };

const at = (section: string, href: string, order: number): Entry => ({ section, href, order });

/** One section, so the assertions are about order rather than about grouping. */
const of = (entries: readonly Entry[], arrangement: readonly string[]): string[] =>
  arrange(entries, arrangement).flatMap(([, list]) => list.map((e) => e.href));

test("the reader's order wins over the record's, which is the whole point of saving one", () => {
  const held = [at('Money', '/a', 1), at('Money', '/b', 2), at('Money', '/c', 3)];
  assert.deepEqual(of(held, ['/c', '/a', '/b']), ['/c', '/a', '/b']);
});

test('and with nothing saved, the record decides', () => {
  const held = [at('Money', '/c', 3), at('Money', '/a', 1), at('Money', '/b', 2)];
  assert.deepEqual(of(held, []), ['/a', '/b', '/c']);
});

test('AN ENTRY NOBODY HAS ARRANGED SITS WHERE THE RECORD PUT IT, and it used to fall to the end', () => {
  /* THE COMMENT SAID THIS AND THE CODE DID THE OPPOSITE. Every unnamed entry ranked
     `Number.MAX_SAFE_INTEGER`, so the declaration's order only broke ties among the leftovers and a
     page a pack adds tomorrow appeared at the bottom of its section for everybody who had ever
     reordered their rail. `/new` is declared second, between `/a` and `/b`, and the reader has moved
     `/new` is declared after `/b` and before `/a`, and the reader has moved `/b` in front of `/a`:
     it belongs beside `/b`, which is where its declaration put it, and not at the bottom. */
  const held = [at('Money', '/b', 1), at('Money', '/new', 2), at('Money', '/a', 3)];
  assert.deepEqual(of(held, ['/b', '/a']), ['/b', '/new', '/a']);
});

test('and one declared before anything the reader named comes first', () => {
  const held = [at('Money', '/new', 1), at('Money', '/a', 2), at('Money', '/b', 3)];
  assert.deepEqual(of(held, ['/b', '/a']), ['/new', '/b', '/a']);
});

test('two unarranged neighbours keep their own order rather than swapping', () => {
  const held = [at('Money', '/b', 1), at('Money', '/x', 2), at('Money', '/y', 3), at('Money', '/a', 4)];
  assert.deepEqual(of(held, ['/b', '/a']), ['/b', '/x', '/y', '/a']);
});

test('A MOVE NEVER CROSSES A SECTION, because a section is a heading a page declares', () => {
  /* Moving an item out of its section would put a page under a title that is not its own. The
     arrangement names `/m2` first overall, and it must still sit under Money. */
  const held = [at('Money', '/m1', 1), at('Work', '/w1', 1), at('Money', '/m2', 2)];
  const out = arrange(held, ['/m2', '/w1', '/m1']);
  assert.deepEqual(
    out.map(([section, list]) => [section, list.map((e) => e.href)]),
    [
      ['Money', ['/m2', '/m1']],
      ['Work', ['/w1']],
    ],
  );
});

test('and a section holds every entry it started with, whatever the arrangement says', () => {
  /* A sort that drops or duplicates a row is the one failure a reader reports as "my rail is
     broken" and nothing else here would catch: the assertions above all read the order. */
  const held = [at('Money', '/a', 1), at('Money', '/b', 2), at('Work', '/w', 1)];
  const out = of(held, ['/zz', '/b']);
  assert.equal(out.length, held.length);
  assert.deepEqual([...out].sort(), ['/a', '/b', '/w']);
});

test('THE LISTS FOLLOW THE ARRANGEMENT TOO, and a list it does not name keeps its place', () => {
  const lists = [{ id: 'assignments' }, { id: 'books' }, { id: 'courses' }];
  assert.deepEqual(orderLists(lists, ['/r/courses', '/p/studies', '/r/assignments']).map((l) => l.id), ['courses', 'books', 'assignments']);
  assert.deepEqual(orderLists(lists, []).map((l) => l.id), ['assignments', 'books', 'courses']);
});

test("A SHARED ORDER GOES FIRST, AND WHAT THE READER HAD ARRANGED STAYS BEHIND IT", () => {
  assert.deepEqual(withOrder(['/r/courses', '/r/assignments'], ['/p/money', '/r/assignments', '/r/people']), ['/r/courses', '/r/assignments', '/p/money', '/r/people']);
});
