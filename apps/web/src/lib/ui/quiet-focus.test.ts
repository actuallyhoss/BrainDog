/**
 * A PAGE'S NAME FOCUSED AFTER A MOVE DRAWS NO RING ON A COLD OPEN, AND STILL DOES FOR A KEYBOARD (the audit of 25
 * October, Z26: a heavy black box round "Numbers" on a page opened from a link, `list-390-light.png`).
 *
 * The browser's own `:focus-visible` cannot be asked from `node --test`, so what is tried is the mark the layout's rule
 * reads (`main h1[data-quiet]:focus`), and the layout's markup is read for the places it is wired.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heard, quietFocus } from './quiet-focus.ts';

function heading() {
  const blurs: (() => void)[] = [];
  return {
    dataset: {} as Record<string, string | undefined>,
    focused: 0,
    focus() {
      this.focused += 1;
    },
    addEventListener(_: 'blur', fn: () => void) {
      blurs.push(fn);
    },
    blur() {
      for (const fn of blurs.splice(0)) fn();
    },
  };
}

test('a name focused with no key before it is quiet, and loses the mark when it loses focus', () => {
  const h1 = heading();
  quietFocus(h1);
  assert.equal(h1.focused, 1);
  assert.equal(h1.dataset.quiet, '', 'a cold open draws the ring');
  h1.blur();
  assert.equal(h1.dataset.quiet, undefined);
});

test('after a press the name is quiet, and after a key it wears its ring', () => {
  const h1 = heading();
  heard({ type: 'pointerdown' });
  quietFocus(h1);
  assert.equal(h1.dataset.quiet, '');
  h1.blur();
  heard({ type: 'keydown' });
  quietFocus(h1);
  assert.equal(h1.dataset.quiet, undefined, 'a keyboard lost its ring');
  heard({ type: 'pointerdown' });
});

test('the layout focuses the name through it and hides the ring only on the mark', () => {
  const layout = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
  assert.match(layout, /quietFocus\(h1\);/u);
  assert.match(layout, /onkeydowncapture=\{heard\} onpointerdowncapture=\{heard\}/u);
  assert.match(layout, /main h1\[data-quiet\]:focus/u);
});
