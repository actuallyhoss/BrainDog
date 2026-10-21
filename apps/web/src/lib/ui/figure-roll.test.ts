/**
 * A figure rolls only when it changes, never on its first draw (`Figure.svelte`).
 *
 * The roll was armed by a flag set in an effect, and the browser can style a figure for the first time after that
 * effect ran: the figure then took its first style armed and faded in from nothing. The top bar's Needs you badge was
 * photographed as a red dot with a ghost of its number that way. These read what decides it: the roll belongs to an
 * attribute set as the element is made, from a value that is not state, and nothing in the sheet animates a figure
 * without it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

const file = fileURLToPath(new URL('./Figure.svelte', import.meta.url));
const source = readFileSync(file, 'utf8');
const style = /<style>([\s\S]*)<\/style>/u.exec(source)?.[1] ?? '';

test('the roll is set on the figure as it is made, and nothing but a new figure can set it again', () => {
  const { js } = compile(source, { filename: file, generate: 'client' });
  /* The update that sets `data-roll`, and every value it follows: only `said`, whose change makes a new element. */
  const update = /template_effect\(\(\) => \{([^}]*data-roll[^}]*)\}\)/su.exec(js.code)?.[1] ?? /set_attribute\([^;]*'data-roll'[^;]*;/u.exec(js.code)?.[0];
  assert.ok(update, 'the figure says whether it is a change');
  const follows = [...update.matchAll(/\$\.get\((\w+)\)/gu)].map((m) => m[1]);
  assert.deepEqual([...new Set(follows)].filter((n) => n !== 'said'), [], 'data-roll follows nothing that changes on a figure already drawn');
  assert.match(js.code, /\$\.key\([^,]+, \(\) => \$\.get\(said\)/u, 'a new figure is a new element');
});

test('the first draw carries no roll', () => {
  const { js } = compile(source, { filename: file, generate: 'server' });
  assert.doesNotMatch(js.code, /data-roll=""/u, 'a server draw is a first draw');
  assert.match(source, /const drawn = \{ yet: false \}/u, 'a figure starts out not drawn');
});

test('nothing in the sheet moves a figure that is not a change', () => {
  const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
  const moving = rules.filter((r) => /transition|translate|opacity/u.test(r.body));
  assert.ok(moving.length >= 2, 'the roll and its starting style are there');
  for (const r of moving) assert.match(r.selector, /\[data-roll\]/u, `${r.selector} moves a figure without data-roll`);
  assert.doesNotMatch(style, /data-live/u);
});
