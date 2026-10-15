/**
 * A column one pack adds into another pack's block (PGS-C29), read off the manifests and laid in by `withAdds`: after the
 * block's own columns, by the key the block answers, two at most on one block, and a key the page lacks leaving the page
 * as it was. Invented pages and packs only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockKeyOf } from '../src/block-keys.ts';
import { ADDED_COLUMNS_MOST, additionsOf, withAdds } from '../src/page-adds.ts';
import type { PageBlock } from '../src/pages.ts';

const SHELF: PageBlock = { kind: 'cards', heading: 'On the shelf', source: 'register.jars', columns: [{ field: 'name', as: 'title' }, { field: 'jam', as: 'fact' }] };
const LEDGER: PageBlock = { kind: 'table', heading: 'Ledger', key: 'ledger', source: 'register.jars', columns: [{ field: 'name' }, { field: 'jam' }] };
const NOTE: PageBlock = { kind: 'note', heading: 'About the pantry', body: 'Jars, by shelf.' } as PageBlock;
const OWN: readonly PageBlock[] = [NOTE, SHELF, LEDGER];

const manifest = (adds: unknown[]): string => JSON.stringify({ pack: 'x', adds });
const column = (into: string, field: string, label: string, page = 'page.pantry') => ({ page, into, column: { field, label, as: 'fact' } });

test('a column goes after the own columns of the cards block its key names, and of a table by its declared key', () => {
  const adds = additionsOf(
    [
      { id: 'weights', manifest: manifest([column(blockKeyOf(SHELF), 'weight', 'Weight')]) },
      { id: 'labels', manifest: manifest([column('ledger', 'label', 'Label')]) },
    ],
    'page.pantry',
  );
  assert.equal(adds.length, 2);
  const laid = withAdds(OWN, adds);
  assert.equal(laid.length, 3, 'a column adds no block of its own');
  assert.deepEqual(laid[1]!.block.columns, [...SHELF.columns!, { field: 'weight', label: 'Weight', as: 'fact' }]);
  assert.deepEqual(laid[2]!.block.columns, [...LEDGER.columns!, { field: 'label', label: 'Label', as: 'fact' }]);
  assert.equal(laid[1]!.added, undefined, 'the block stays the page\'s own');
  assert.deepEqual(SHELF.columns!.length, 2, 'the page\'s own declaration is never written');
});

test('two added columns on one block at most, from every pack, the first by pack id kept', () => {
  assert.equal(ADDED_COLUMNS_MOST, 2);
  const key = blockKeyOf(SHELF);
  const adds = additionsOf(
    [
      { id: 'zest', manifest: manifest([column(key, 'zest', 'Zest')]) },
      { id: 'acid', manifest: manifest([column(key, 'acid', 'Acid'), column(key, 'brix', 'Sugar')]) },
    ],
    'page.pantry',
  );
  /* Handed zest first, as a host might: the block still keeps acid's two, in the order acid wrote them. */
  const laid = withAdds(OWN, [...adds.filter((a) => a.pack === 'zest'), ...adds.filter((a) => a.pack === 'acid')]);
  assert.deepEqual(
    laid[1]!.block.columns!.map((c) => c.field),
    ['name', 'jam', 'acid', 'brix'],
  );
});

test('a key the page no longer has leaves the page as it was, and says nothing', () => {
  const adds = additionsOf([{ id: 'weights', manifest: manifest([column('kgone', 'weight', 'Weight')]) }], 'page.pantry');
  assert.equal(adds.length, 1);
  assert.deepEqual(withAdds(OWN, adds), OWN.map((block) => ({ block })));
});

test('a block with no columns of its own, and a column the block already draws, are left as they were', () => {
  const noted = withAdds(OWN, additionsOf([{ id: 'weights', manifest: manifest([column(blockKeyOf(NOTE), 'weight', 'Weight')]) }], 'page.pantry'));
  assert.equal(noted[0]!.block, NOTE);
  const again = withAdds(OWN, additionsOf([{ id: 'weights', manifest: manifest([column(blockKeyOf(SHELF), 'jam', 'Jam')]) }], 'page.pantry'));
  assert.deepEqual(again[1]!.block.columns, SHELF.columns);
});

test('what does not read as a column is left out: a block and a column at once, no label, or another page', () => {
  const key = blockKeyOf(SHELF);
  const adds = additionsOf(
    [
      {
        id: 'odd',
        manifest: manifest([
          { ...column(key, 'weight', 'Weight'), block: { kind: 'note' } },
          { page: 'page.pantry', into: key, column: { field: 'weight' } },
          { page: 'page.pantry', into: key, column: { field: 'weight', metric: 'jar-weight', label: 'Weight' } },
          column(key, 'weight', 'Weight', 'page.cellar'),
        ]),
      },
    ],
    'page.pantry',
  );
  assert.deepEqual(adds, []);
});

test('a block addition is laid in as before, beside a column addition', () => {
  const extra: PageBlock = { kind: 'note', heading: 'From the jar pack', body: 'Label every jar.' } as PageBlock;
  const adds = additionsOf(
    [{ id: 'jars', manifest: manifest([{ page: 'page.pantry', block: extra, after: 'About the pantry' }, column(blockKeyOf(SHELF), 'weight', 'Weight')]) }],
    'page.pantry',
  );
  const laid = withAdds(OWN, adds);
  assert.deepEqual(
    laid.map((l) => [l.block.heading, l.added ?? null]),
    [['About the pantry', null], ['From the jar pack', 'jars'], ['On the shelf', null], ['Ledger', null]],
  );
  assert.equal(laid[2]!.block.columns!.at(-1)!.field, 'weight');
});

test('a column comes through a carrier a page keys and fills, and is laid as the carrier holds it', () => {
  const into = blockKeyOf(SHELF);
  const [add] = additionsOf([{ id: 'weights', manifest: manifest([{ page: 'page.pantry', into, column: { metric: 'jar-weight:{{name}}', label: 'Weight', as: 'trend' } }]) }], 'page.pantry');
  assert.ok(add && typeof add.into === 'string');
  /* What `readPage` does to every addition before `withAdds`: a key on its block, and the block filled from the row. */
  const keyed = { ...add, block: { ...add.block, key: 'k-carrier', columns: [{ field: undefined as unknown as string, metric: 'jar-weight:Plum', label: 'Weight', as: 'trend' }] } };
  const laid = withAdds(OWN, [keyed]);
  assert.deepEqual(laid[1]!.block.columns!.at(-1), { field: undefined, metric: 'jar-weight:Plum', label: 'Weight', as: 'trend' });
});

test('a column the block cannot draw without losing something is left out, and the block is as it was', () => {
  const shelf = blockKeyOf(SHELF);
  const laid = (adds: unknown[]) => withAdds(OWN, additionsOf([{ id: 'weights', manifest: manifest(adds) }], 'page.pantry'));
  const figure = (into: string, as?: string) => ({ page: 'page.pantry', into, column: { metric: 'jar-weight:{{name}}', label: 'Weight', ...(as ? { as } : {}) } });
  /* A FIGURE ON A TABLE: the read would check it as a field of the list and refuse the Ledger. */
  assert.deepEqual(laid([figure('ledger')])[2]!.block, LEDGER);
  /* A FIGURE AS A CARD'S FIGURE OR ITS FACT: nothing reads it, so it would draw nothing where a short trend says its newest. */
  assert.deepEqual(laid([figure(shelf, 'figure')])[1]!.block, SHELF);
  assert.deepEqual(laid([figure(shelf)])[1]!.block, SHELF);
  /* A ROLE THE CARD HOLDS ALREADY: a second title would make the renderer degrade the card. */
  assert.deepEqual(laid([{ page: 'page.pantry', into: shelf, column: { field: 'maker', label: 'Maker', as: 'title' } }])[1]!.block, SHELF);
  /* A FOURTH FACT, past the three a card takes, from a second pack beside the first's two. */
  const full: PageBlock = { ...SHELF, key: 'kfull', columns: [...SHELF.columns!, { field: 'lid', as: 'fact' }] };
  const both = withAdds(
    [full],
    additionsOf(
      [
        { id: 'acid', manifest: manifest([column('kfull', 'acid', 'Acid')]) },
        { id: 'brix', manifest: manifest([column('kfull', 'brix', 'Sugar')]) },
      ],
      'page.pantry',
    ),
  );
  assert.deepEqual(both[0]!.block.columns!.map((c) => c.field), ['name', 'jam', 'lid', 'acid']);
});
