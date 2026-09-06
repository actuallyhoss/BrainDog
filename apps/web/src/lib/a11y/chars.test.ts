/**
 * `silenced()` — the one accessibility claim this app makes, and the one that was a no-op.
 *
 * `Character keys: Off` wrote its preference to the cookie and both key dispatchers went on acting
 * on bare letters. The registry's own header names it as the app's WCAG 2.1.4 conformance mechanism
 * and `copy.ts` calls it *the only shipped one found across eleven precedents* — a switch connected
 * to nothing. Somebody who needs it turns it on, is not believed by the software, and has no way to
 * tell that from their own mistake.
 *
 * WHAT IS ACTUALLY BEING TESTED is the boundary: 2.1.4 covers shortcuts made of *letter, punctuation,
 * number, or symbol characters*, so `/` and `?` and `g` all go, and every real chord and every named
 * key stays. A switch that also took `⌘K` and the arrows would be a switch nobody could leave on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { silenced } from './chars.ts';

/** A keydown, without a DOM. Only the five fields `silenced` reads. */
const press = (key: string, mod: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mod }) as KeyboardEvent;

/** The cookie the switch writes, since `document` is what `pref` reads. */
function chars(on: boolean | undefined) {
  const value = on === undefined ? '{}' : JSON.stringify({ chars: on });
  (globalThis as { document?: { cookie: string } }).document = { cookie: `bd_pref=${encodeURIComponent(value)}` };
}

test('with the switch off, every bare single character is silenced', () => {
  chars(false);
  for (const key of ['j', 'k', 'p', 'y', 'g', '/', '?', '1', ','])
    assert.equal(silenced(press(key)), true, `${key} still acted with character keys off`);
});

test('and Shift does not rescue one, because Shift+Y is still one character', () => {
  chars(false);
  assert.equal(silenced(press('Y', { shiftKey: true })), true);
});

test('every real chord keeps working, which is what makes the switch affordable', () => {
  // If turning it on cost the palette, undo and the sidebar, nobody could leave it on — and the
  // registry's promise is precisely that the chords are unaffected.
  chars(false);
  assert.equal(silenced(press('k', { metaKey: true })), false);
  assert.equal(silenced(press('z', { ctrlKey: true })), false);
  assert.equal(silenced(press('v', { altKey: true })), false);
});

test('and so does every named key: an arrow is not a character shortcut', () => {
  chars(false);
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'F10', 'Home', 'End', 'ContextMenu'])
    assert.equal(silenced(press(key)), false, `${key} was silenced, and 2.1.4 does not cover it`);
});

test('with the switch on, nothing is silenced', () => {
  chars(true);
  assert.equal(silenced(press('j')), false);
  assert.equal(silenced(press('/')), false);
});

test('AND THE DEFAULT IS ON, because a first visit has never been asked', () => {
  // `undefined` is not `false`. A missing preference silencing the keyboard would make a fresh
  // browser look broken to everybody who never opened settings.
  chars(undefined);
  assert.equal(silenced(press('j')), false);
});

test('with no document at all, nothing is silenced', () => {
  // Server-side rendering, or a test that never set one up. A cookie that cannot be read is not a
  // preference to switch anything off.
  delete (globalThis as { document?: unknown }).document;
  assert.equal(silenced(press('j')), false);
});
