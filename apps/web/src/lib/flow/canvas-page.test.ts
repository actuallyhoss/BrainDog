/**
 * The canvas page's footer, read as text, because the page is a `.svelte` file and this runner is `node --test`
 * (the move `accent.test.ts` makes on the shell, for the same reason).
 *
 * THE BAR COVERED THE COLUMN ON A PHONE, AND ITS OWN BUTTONS WERE UNDER THE TAB BAR. Below 900px the scroller is the
 * shell's `.body`, whose scrollport runs to the bottom of the window, and `TabBar.svelte` is fixed over the last
 * `--tabbar` of it (56px, 90 on an iPhone with a home indicator). A footer sticky at `inset-block-end: 0` stuck to that
 * edge, under the tab bar. Worked from the tokens at 390: the footer is its sentence on one line (the sentence's 16rem
 * basis and the two 44px buttons do not fit 358px together, so they wrap), then the buttons: 12 + 18 + 8 + 44 + 12 = 94px
 * tall, so on an iPhone the 90px tab bar hid all but its top 4px, and on any phone the part that showed was opaque
 * `--bg` over the arm drawn beneath it, which on the sample's "Gold rate" is "Otherwise". DESIGN-SYSTEM 7: nothing sits
 * under the tab bar.
 *
 * SO THE FOOTER STICKS ONLY WHERE THERE IS NO TAB BAR. Below 900px it is the end of the column, in the flow, and the
 * column scrolls past nothing. The test holds the one declaration that matters to the one place it may be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = fileURLToPath(new URL('../../routes/automations/[id]/+page.svelte', import.meta.url));

/** Every declaration in a stylesheet with the chain of at-rules and selectors it sits inside. Comments are dropped. */
function declarations(css: string): { said: string; inside: string[] }[] {
  const out: { said: string; inside: string[] }[] = [];
  const stack: string[] = [];
  let buffer = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//gu, '')) {
    if (ch === '{') {
      stack.push(buffer.trim().replace(/\s+/gu, ' '));
      buffer = '';
    } else if (ch === '}') {
      if (buffer.trim()) out.push({ said: buffer.trim(), inside: [...stack] });
      stack.pop();
      buffer = '';
    } else if (ch === ';') {
      out.push({ said: buffer.trim(), inside: [...stack] });
      buffer = '';
    } else buffer += ch;
  }
  return out;
}

test('THE SEND BAR STICKS ONLY AT 900px AND UP, where there is no tab bar for it to sit under and no column it hides', () => {
  const source = readFileSync(PAGE, 'utf8');
  const css = source.slice(source.indexOf('<style>') + '<style>'.length, source.indexOf('</style>'));
  const sticky = declarations(css).filter((d) => /^position:\s*sticky$/u.test(d.said));
  assert.ok(sticky.length > 0, 'the footer no longer sticks anywhere, so a long flow puts Send two screens down on a laptop');
  for (const d of sticky)
    assert.deepEqual(d.inside, ['@media (width >= 900px)', '.bar'], `position: sticky is drawn inside ${d.inside.join(' > ') || 'nothing'}, so a phone gets it too`);
});
