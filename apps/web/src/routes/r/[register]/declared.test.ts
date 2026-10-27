/**
 * A list as a page the record composes, at `/r/<list>?declared` until the list board is signed off: the kernel's
 * `listPage` drawn by the one renderer, with the panel every declared page opens on each row, and the screen as it was
 * left where it is.
 *
 * THE PURE HALF IS CALLED, AND THE SCREEN IS READ FROM ITS SOURCE, as `row-drawer.test.ts` reads it: which of the two
 * a visit draws is one test of the address, and the test here is that the screen asks it once, draws the composed page
 * in the first branch and everything it drew before in the others.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listPage } from '@braindog/kernel';

import type { Entry, RegisterDecl } from '../../../lib/record/schema.ts';
import { bodyFor, classicHref, declaredHref, drawnRows, wantsDeclared, words } from './declared.ts';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const COMPOSED = readFileSync(new URL('./DeclaredList.svelte', import.meta.url), 'utf8');

const at = (search: string) => new URL(`https://record.test/r/trips${search}`);

/** A list no pack ships: a day, a state with an order, and an amount. */
const DECL = {
  id: 'trips',
  name: 'Trips',
  one: 'Trip',
  title: 'title',
  mobile: ['title', 'on', 'state'],
  state: 'state',
  done: ['back'],
  fields: [
    { id: 'title', label: 'Title', type: 'text', required: true },
    { id: 'on', label: 'Day', type: 'day' },
    { id: 'state', label: 'State', type: 'enum', values: ['planned', 'away', 'back'] },
    { id: 'cost', label: 'Cost', type: 'money' },
  ],
  order: { field: 'on', dir: 'asc' },
} as unknown as RegisterDecl;

test('ONLY `?declared` ASKS FOR THE COMPOSED PAGE, and a row open beside it changes nothing', () => {
  assert.equal(wantsDeclared(at('')), false);
  assert.equal(wantsDeclared(at('?declared')), true);
  assert.equal(wantsDeclared(at('?declared=')), true);
  assert.equal(wantsDeclared(at('?declared&row=3')), true);
  assert.equal(wantsDeclared(at('?row=3&declared')), true);
  /* A WORD THAT ONLY HOLDS IT, OR HOLDS IT AS A VALUE, IS ANOTHER KEY. */
  assert.equal(wantsDeclared(at('?row=3')), false);
  assert.equal(wantsDeclared(at('?q=declared')), false);
  assert.equal(wantsDeclared(at('?declaredly')), false);
  assert.equal(wantsDeclared(at('?classic')), false);
});

test('THE BODY IS THE KERNEL’S OWN, and there is none until the declaration is read', () => {
  assert.equal(bodyFor(undefined), null);
  assert.equal(bodyFor(null), null);
  const body = bodyFor(DECL);
  assert.ok(body, 'a declaration read has a body');
  assert.deepEqual(body, listPage(DECL as unknown as Parameters<typeof listPage>[0]));
  /* AND IT IS A PAGE BODY OVER THIS LIST: its name, and a block reading the list by its id. */
  assert.equal(body.title, 'Trips');
  assert.match(JSON.stringify(body), /register\.trips/u);
  /* NEWEST FIRST BY THE LIST'S OWN DAY, which is the kernel's to decide and this screen's only to hand on. */
  assert.deepEqual(body.blocks.find((b) => b.kind === 'table')?.order, [{ field: 'on', dir: 'desc' }]);
});

test('THE OPENING LINE SAYS HOW MANY WHERE THE SCREEN HAS READ IT, and no number where it has not', () => {
  const shape = DECL as unknown as Parameters<typeof listPage>[0];
  assert.deepEqual(bodyFor(DECL, 217), listPage(shape, { count: 217 }));
  assert.match(bodyFor(DECL, 217)!.blocks[0]!.body ?? '', /^217 in Trips/u);
  assert.deepEqual(bodyFor(DECL, null), listPage(shape));
  assert.deepEqual(bodyFor(DECL, undefined), listPage(shape));
  assert.equal(bodyFor(undefined, 217), null);
});

test('EACH WAY ACROSS MOVES ONE KEY: the rest of the address is as it was', () => {
  assert.equal(classicHref(at('?declared')), '/r/trips');
  assert.equal(classicHref(at('?declared&row=3')), '/r/trips?row=3');
  assert.equal(classicHref(at('?q=rent&declared=&sort=on')), '/r/trips?q=rent&sort=on');
  assert.equal(classicHref(at('?row=3')), '/r/trips?row=3');
  assert.equal(classicHref(at('?declared#b-2')), '/r/trips#b-2');

  assert.equal(declaredHref(at('')), '/r/trips?declared');
  assert.equal(declaredHref(at('?row=3')), '/r/trips?declared&row=3');
  /* ASKED TWICE IS ASKED ONCE. */
  assert.equal(declaredHref(at('?declared&row=3')), '/r/trips?declared&row=3');
  assert.equal(declaredHref(at('?declared=1&q=rent')), '/r/trips?declared&q=rent');

  /* THERE AND BACK IS WHERE IT STARTED. */
  for (const search of ['', '?row=3', '?q=rent&sort=on']) {
    const there = new URL(declaredHref(at(search)), 'https://record.test');
    assert.equal(wantsDeclared(there), true);
    assert.equal(classicHref(there), `/r/trips${search}`);
  }
});

test('THE ROWS THE PANEL WALKS ARE THE LIST’S OWN AS THE PAGE DREW THEM, each once and in order', () => {
  const row = (seq: number): Entry => ({ seq, fields: {}, version: 1, created: '', by: '' }) as unknown as Entry;
  const blocks = [
    { kind: 'prose', entries: [] },
    { kind: 'table', register: 'trips', entries: [row(9), row(4), row(7)] },
    { kind: 'table', register: 'places', entries: [row(1)] },
    { kind: 'board', register: 'trips', entries: [row(4), row(2)] },
  ];
  assert.deepEqual(
    drawnRows(blocks, 'trips').map((e) => e.seq),
    [9, 4, 7, 2],
  );
  assert.deepEqual(drawnRows(blocks, 'nowhere'), []);
  assert.deepEqual(drawnRows([], 'trips'), []);
});

test('WHAT IT SAYS IS PLAIN: no id, no dash, and the way back is named', () => {
  assert.equal(words.back, 'Back to the list as it was');
  for (const said of Object.values(words)) {
    assert.doesNotMatch(said, /—/u, 'no em dash in copy a person reads');
    assert.doesNotMatch(said, /\b(row|entity|list item)\b/iu);
    assert.doesNotMatch(said, /\?declared|previewPage/u);
  }
});

test('THE SCREEN MOUNTS THE COMPOSED PAGE ONLY WHEN THE ADDRESS ASKS, and draws nothing of the old list beside it', () => {
  /* FETCHED WHEN ASKED FOR, as Work fetches its classic board: the screen as it was loads none of the page reader. */
  assert.doesNotMatch(SCREEN, /import DeclaredList from/u);
  assert.equal(SCREEN.split("import('./DeclaredList.svelte')").length - 1, 1, 'one fetch');
  assert.match(SCREEN, /import \{ wantsDeclared \} from '\.\/declared\.ts';/u);
  assert.match(SCREEN, /const composed = \$derived\(wantsDeclared\(page\.url\)\);/u);
  assert.equal(SCREEN.split('wantsDeclared(').length - 1, 1, 'the address is asked once');
  assert.equal([...SCREEN.matchAll(/<loaded\.default\b/gu)].length, 1, 'one mount');

  /* THE MARKUP IS ONE CHAIN, and the composed page is its first branch: every branch after it is an `else`. */
  const markup = SCREEN.slice(SCREEN.indexOf('\n</script>'), SCREEN.indexOf('\n<style>'));
  const top = [...markup.matchAll(/^\{(#if|:else if|:else|\/if)\b[^\n]*/gmu)].map((m) => m[0]);
  assert.equal(top[0], '{#if composed}');
  assert.equal(top.filter((t) => t.startsWith('{#if')).length, 1, 'one chain at the top');
  assert.equal(top.at(-1), '{/if}');
  assert.match(top[1] ?? '', /^\{:else if refusal /u, 'what the screen drew first is drawn next');
  const mine = markup.slice(markup.indexOf('{#if composed}'), markup.indexOf('\n{:else if'));
  assert.match(mine, /\{#await import\('\.\/DeclaredList\.svelte'\) then loaded\}\s*<loaded\.default register=\{id\} /u);
  for (const old of ['<PageHead', '<ListTable', '<ListCards', '<ListBoard', '<ChipsBar', '<RowPanel', '<CaptureLine', '<BulkBar'])
    assert.equal(mine.includes(old), false, `${old} is not drawn beside the composed page`);
  /* AND NOTHING IS DRAWN OUTSIDE THE CHAIN but the title and the keys. */
  const outside = markup.slice(markup.lastIndexOf('\n{/if}') + 6).trim();
  assert.equal(outside, '');

  /* THE OLD LIST'S KEYS AND ITS PANEL'S HOST STAND DOWN while its rows are not on screen: a bare key must not change a
     row nobody can see, and one address has one host writing `?row=`. */
  const keys = SCREEN.slice(SCREEN.indexOf('function onkeydown(e: KeyboardEvent) {'));
  assert.match(keys.slice(0, 400), /if \(composed\) return;/u);
  const host = SCREEN.indexOf('    void result.entries;\n    void page.url.href;');
  assert.match(SCREEN.slice(host, host + 200), /if \(composed\) return;/u);

  /* UNTIL IT IS SIGNED OFF IT IS REACHED BY ITS ADDRESS: the screen as it was offers no way to it. */
  assert.doesNotMatch(SCREEN, /declaredHref/u);
  assert.doesNotMatch(SCREEN, /[?&]declared\b/u);
});

test('THE COMPOSED PAGE IS DRAWN BY THE ONE RENDERER FROM THE RECORD’S OWN DRAWING, with the one panel on its rows', () => {
  /* THE BODY IS INSTALLED NOWHERE: the record draws it (`previewPage`, through `drawnOf`) and writes nothing. */
  assert.match(COMPOSED, /bodyFor\(/u);
  assert.match(COMPOSED, /drawnOf\(/u);
  assert.match(COMPOSED, /import PageBody from '\$lib\/page\/PageBody\.svelte';/u);
  assert.match(COMPOSED, /<PageBody\b/u);
  /* A ROW OPENS THE PANEL EVERY DECLARED PAGE OPENS, and which row is the address's `?row=`. */
  assert.match(COMPOSED, /listHost\(\{/u);
  assert.match(COMPOSED, /drawnRows\(/u);
  assert.match(COMPOSED, /<RowPanel host=\{host\.host\} \/>/u);
  assert.match(COMPOSED, /<RowVerbMenu host=\{host\.host\} \{reread\} \/>/u);
  assert.match(COMPOSED, /host\.sync\(\);/u);
  /* THE RECORD'S REFUSAL IS SAID IN ITS OWN SENTENCE, never one written here. */
  assert.match(COMPOSED, /\.fix\b/u);
  /* ONE QUIET LINE BACK, to the same address without the one key. */
  assert.match(COMPOSED, /href=\{at\(classicHref\(page\.url\)\)\}/u);
  assert.match(COMPOSED, /\{words\.back\}/u);
  assert.equal(COMPOSED.split('classicHref(').length - 1, 1, 'one link back');
  /* A LINK MEETS 44px UNDER A FINGER. */
  assert.match(COMPOSED, /@media \(pointer: coarse\)[^}]*\{[^}]*min-block-size: 44px/u);
  /* THE LOOK: a flat line, no shadow, no gradient, no border. */
  assert.doesNotMatch(COMPOSED, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(COMPOSED, /—/u);
});
