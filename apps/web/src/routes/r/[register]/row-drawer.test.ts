/**
 * The row beside a list is the one panel every declared page opens (PGS-C04): `RowPanel`, through a host the list
 * screen makes (`listHost` in `lib/page/row-host.svelte.ts`). The hand-built peek drew every field and could change
 * none; the panel changes a row in one write, says so with an Undo, and the list reads its rows again so the changed
 * day shows at once.
 *
 * READ FROM THE SOURCE, as `offer-compact.test.ts` reads this screen: what the host does with an address, a walk and
 * something typed is held by its own test (`lib/page/row-host-list.test.ts`), and here only that this screen makes one,
 * hands it the list as drawn, and sends its keys and its menu to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const MENU = readFileSync(new URL('./parts/ListRowMenu.svelte', import.meta.url), 'utf8');

/** The text of the one `listHost({ ... })` the screen makes, to its closing `});`. */
const made = (() => {
  const at = SCREEN.indexOf('listHost({');
  return at < 0 ? '' : SCREEN.slice(at, SCREEN.indexOf('\n  });', at));
})();

/** One branch of the screen's key handler: from its test to the next `} else if`. */
const branch = (opens: string) => {
  const at = SCREEN.indexOf(opens);
  return at < 0 ? '' : SCREEN.slice(at, SCREEN.indexOf('} else if', at + opens.length));
};

test('THE HAND-BUILT PEEK IS GONE: no import of it, no use of it, and no file', () => {
  assert.doesNotMatch(SCREEN, /RowPeek/u);
  assert.equal(existsSync(new URL('./parts/RowPeek.svelte', import.meta.url)), false, 'parts/RowPeek.svelte is deleted');
  /* AND WHAT ONLY IT USED went with it: the screen's own read of `?row=` and the row it found for it. */
  assert.doesNotMatch(SCREEN, /\bconst peeked\b/u);
  assert.doesNotMatch(SCREEN, /\bpeekedEntry\b/u);
  assert.doesNotMatch(SCREEN, /\bconst peek\b/u);
});

test('ONE HOST, MADE WITH THE LIST AND ITS ROWS AS DRAWN, and the one panel drawn on it', () => {
  assert.match(SCREEN, /import \{ listHost, type Walked \} from '\$lib\/page\/row-host\.svelte\.ts';/u);
  assert.match(SCREEN, /import RowPanel from '\$lib\/page\/RowPanel\.svelte';/u);
  assert.equal(SCREEN.split('listHost({').length - 1, 1, 'one host');
  assert.match(made, /\(\) => id\b/u, "the list's id");
  /* THE ROWS AS DRAWN: `result.entries`, the order on screen with what was edited here over it, and never `pages`. */
  assert.match(made, /result\.entries/u);
  assert.doesNotMatch(made, /pages\.flat\(\)/u);
  assert.equal([...SCREEN.matchAll(/<RowPanel\b[^>]*\/>/gu)].length, 1, 'one panel');
  /* THE PANEL AND THE MENU ITS MORE OPENS ARE HANDED THE HOST'S OWN HOST, as a declared page hands them its. */
  assert.match(SCREEN, /<RowPanel host=\{host\.host\} \/>/u);
  assert.match(SCREEN, /<RowVerbMenu host=\{host\.host\} reread=\{rereadRows\} \/>/u);
  /* AND IT IS KEPT IN STEP FROM ONE EFFECT that reads the rows and the address. */
  const at = SCREEN.indexOf('    void result.entries;\n    void page.url.href;');
  const effect = SCREEN.slice(SCREEN.lastIndexOf('$effect(() => {', at), SCREEN.indexOf('\n  });', at));
  assert.match(effect, /^\$effect\(\(\) => \{\s*void result\.entries;\s*void page\.url\.href;/u);
  assert.match(effect, /untrack\(\(\) => \{[^}]*host\.sync\(\);\s*\}\);$/u);
  /* A PANEL THAT CLOSED ITSELF (Escape, its own close) IS CLOSED ON THE HOST, which takes `?row=` out of the address. */
  assert.match(effect, /const shut = host\.opened === null;/u);
  assert.match(effect, /if \(shut\) host\.close\(\);\s*host\.sync\(\);/u);
  assert.equal(SCREEN.split('host.sync()').length - 1, 1);
});

test('`p` AND THE MENU\'S PEEK OPEN THE ROW ON THE HOST', () => {
  const p = branch("e.key === 'p'");
  assert.match(p, /host\.open\(/u);
  assert.match(p, /result\.entries\[focus\.row\]/u);
  /* THE MENU'S PEEK is the page's `peek`, by the row's number, as the menu has always called it. */
  assert.match(MENU, /onclick=\{\(\) => peek\(seq\)\}/u);
  assert.match(SCREEN, /peek=\{\(seq\) => void \(keeps\(seq\) \|\| host\.open\(seq\)\)\}/u);
  /* NEITHER THROWS AWAY WHAT IS TYPED for another row: `keeps` says so and the panel stays. */
  assert.match(p, /!keeps\(seq\)\) host\.open\(seq\);/u);
  assert.match(SCREEN, /const typed = host\.host\.dirty && host\.opened !== null && host\.opened !== seq;/u);
});

test('ESC IN THE LIST CLOSES AN OPEN PEEK BEFORE IT CLEARS A SELECTION (scope E40)', () => {
  const esc = branch("e.key === 'Escape' && host.opened !== null");
  assert.match(esc, /host\.close\(\);/u);
  assert.ok(SCREEN.indexOf("e.key === 'Escape' && host.opened !== null") < SCREEN.indexOf("e.key === 'Escape' && selected.size > 0"), 'the peek closes first');
  /* AND THE ROOM OPENS WITH THE SLIDE, never after it, so the list does not jump once the panel has landed. */
  const panel = readFileSync(new URL('../../../lib/ui/Panel.svelte', import.meta.url), 'utf8');
  const open = panel.slice(panel.indexOf(':global(:root:has(dialog.dock[open]:not(:modal)))'));
  assert.match(open.slice(0, open.indexOf('}')), /transition-duration: var\(--d-panel\);\s*transition-timing-function: var\(--ease-sheet\);/u);
  assert.doesNotMatch(panel, /transition-delay: var\(--d-panel\)/u);
});

test('`j` AND `k` WALK THE HOST ONLY WHILE A ROW IS OPEN, and the list\'s own cursor as before when none is', () => {
  const j = branch("e.key === 'j'");
  const k = branch("e.key === 'k'");
  assert.match(j, /if \(host\.opened !== null\) walked\(host\.next\(\)\);/u);
  assert.match(k, /if \(host\.opened !== null\) walked\(host\.previous\(\)\);/u);
  /* AS BEFORE, WITH NO ROW OPEN: one row down or up, kept inside the list, and the keyboard's focus carried. */
  assert.match(j, /else \{\s*focus = \{ \.\.\.focus, row: Math\.min\(focus\.row \+ 1, rows\.length - 1\) \};\s*carry\(\);\s*\}/u);
  assert.match(k, /else \{\s*focus = \{ \.\.\.focus, row: Math\.max\(focus\.row - 1, 0\) \};\s*carry\(\);\s*\}/u);
  /* AND NOWHERE ELSE: a walk is the two keys'. */
  assert.equal(SCREEN.split('host.next()').length - 1, 1);
  assert.equal(SCREEN.split('host.previous()').length - 1, 1);
  /* A WALK THAT WOULD LEAVE SOMETHING TYPED IS SAID, and one that moved takes the list's cursor with it. */
  const at = SCREEN.indexOf('function walked(out: Walked)');
  const body = SCREEN.slice(at, SCREEN.indexOf('\n  }', at));
  assert.match(body, /if \(out === 'unsaved'\) return void toasts\.push\(UNSAVED, \{ intent: 'warn' \}\);/u);
  assert.match(body, /focus = \{ \.\.\.focus, row: at \};\s*carry\(\);/u);
  /* THE SENTENCE IS THE LISTS' COPY (`lib/copy/lists.ts`), not a line typed into the screen. */
  assert.match(SCREEN, /const UNSAVED = copy\.rowUnsaved;/u);
  const words = readFileSync(new URL('../../../lib/copy/lists.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(words.match(/rowUnsaved: '([^']*)'/u)?.[1] ?? '—', /[—–]|\brow\b/u, 'plain words, no dash');
});

test('THE ADDRESS KEEPS `?row=` THROUGH A SORT OR A FILTER, and only the host takes it out', () => {
  /* EVERY CHANGE TO THE ADDRESS STARTS FROM THE ADDRESS AS IT IS, so a sort or a chip carries the open row along. */
  const at = SCREEN.indexOf('function setParam(');
  const setParam = SCREEN.slice(at, SCREEN.indexOf('\n  }', at));
  assert.match(setParam, /new URLSearchParams\(page\.url\.searchParams\)/u);
  /* THE SCREEN ITSELF NEVER DROPS IT: a row that leaves the list is the host's to close, and closing clears it. */
  assert.doesNotMatch(SCREEN, /delete\('row'\)/u);
  assert.doesNotMatch(SCREEN, /searchParams\.get\('row'\)/u);
  /* THE HOST READS AND WRITES THE ADDRESS THE SCREEN IS AT. */
  assert.match(made, /page\.url/u);
  assert.match(made, /goto\(/u);
  /* OPENING AND CLOSING ARE STEPS BACK UNDOES; a walk from one open row to the next replaces the step it is on. */
  assert.match(made, /replaceState: page\.url\.searchParams\.has\('row'\) && to\.searchParams\.has\('row'\)/u);
});

test("A SAVE IN THE PANEL READS THE LIST'S ROWS AGAIN, in place, so the changed day shows at once", () => {
  /* `recheck` asks the same question again and keeps the reader where they are; `refresh` would start from the top. */
  assert.match(made, /reread: \(\) => rereadRows\(\)/u);
  const at = SCREEN.indexOf('async function rereadRows()');
  const body = SCREEN.slice(at, SCREEN.indexOf('\n  }', at));
  assert.match(body, /^async function rereadRows\(\) \{\s*await recheck\(\);/u);
  assert.match(SCREEN, /async function recheck\(\)/u);
  /* A LIST WALKED PAST ITS FIRST PAGE is only marked stale by that, so the rows the host holds newer are landed. */
  assert.match(body, /if \(pages\.length <= 1\) return;/u);
  assert.match(body, /if \(got && got\.version > e\.version\) landRow\(got\);/u);
});

test('THE LIST STILL NARROWS BESIDE THE DOCKED PANEL: the room it takes is the panel\'s own `--dock-w`', () => {
  assert.match(SCREEN, /\.list-screen \{\s*padding-inline-end: max\(0px, calc\(var\(--dock-w\) - var\(--gutter\)\)\);/u);
});
