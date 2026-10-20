/**
 * A MENU'S ITEMS CARRY NONE OF THE BROWSER'S OWN BORDER, FILL OR FONT, MEASURED IN A BROWSER (UI pass, motion F1).
 *
 * Every ⋯ menu drew its verbs as grey bevelled buttons, because each caller passed a plain `<button role="menuitem">`
 * and the class that would have reset it was written in the caller, and missing in half of them. `Menu.svelte` now
 * takes all of it back once, for whatever its caller drew. A rule that exists says nothing about what a button looks
 * like, so this compiles `Menu.svelte` for its stylesheet, lays a menu of the kinds of item callers really pass under
 * it, and reads the computed style of each, in the pop and in the sheet. The first test reads the same markup with no
 * stylesheet, so the measure is shown to see the browser's own button at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { chromium, type Page } from '@playwright/test';

const filename = fileURLToPath(new URL('./Menu.svelte', import.meta.url));
const { css } = compile(readFileSync(filename, 'utf8'), { filename, css: 'external', generate: 'client' });
const sheet = css?.code ?? '';
const scope = /\.menu\.(svelte-[a-z0-9]+)/u.exec(sheet)?.[1];

/** The items callers pass: a plain button, a link, a checkable item, a disabled one, and the sheet's own Cancel. */
const items = `
  <button type="button" role="menuitem"><span class="mi-name">Open</span></button>
  <a role="menuitem" href="#x"><span class="mi-name">Copy link</span></a>
  <button type="button" role="menuitemcheckbox" aria-checked="true"><span class="mi-name">Show done</span></button>
  <button type="button" role="menuitem" disabled><span class="mi-name">Archive it</span></button>`;

const menu = (form: 'pop' | 'sheet', styled: boolean) => `<!doctype html>
  <style>body { font: 15px/1.4 serif; } ${styled ? sheet : ''}</style>
  <div class="menu ${scope ?? ''}" data-form="${form}" role="menu" style="position: static; font-family: monospace">
    ${items}
    ${form === 'sheet' ? `<button type="button" class="menu-cancel ${scope ?? ''}" role="menuitem">Cancel</button>` : ''}
  </div>`;

type Look = { role: string; cancel: boolean; border: string[]; fill: string; image: string; appearance: string; font: string; underline: string };

const looks = (page: Page): Promise<Look[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map((el) => {
      const s = getComputedStyle(el);
      return {
        role: el.getAttribute('role') ?? '',
        cancel: el.classList.contains('menu-cancel'),
        border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
        fill: s.backgroundColor,
        image: s.backgroundImage,
        appearance: s.appearance,
        font: s.fontFamily,
        underline: s.textDecorationLine,
      };
    }),
  );

test('the menu stylesheet compiles with its scope', () => {
  assert.ok(scope, 'Menu.svelte has a scoped .menu rule');
  assert.match(sheet, /\[role\^='menuitem'\]/u);
});

test('in a browser, no menu item keeps the browser border, fill or font, in the pop or the sheet', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    /* THE MEASURE SEES THE BROWSER'S BUTTON: unstyled, a button has a border and a fill of its own. */
    await page.setContent(menu('pop', false));
    const bare = (await looks(page)).find((l) => l.role === 'menuitem')!;
    assert.ok(bare.border.some((w) => w !== '0px') || bare.fill !== 'rgba(0, 0, 0, 0)', 'an unstyled button draws something of its own');

    for (const form of ['pop', 'sheet'] as const) {
      await page.setContent(menu(form, true));
      const all = await looks(page);
      assert.equal(all.length, form === 'sheet' ? 5 : 4);
      for (const l of all) {
        const name = `${form} ${l.role}${l.cancel ? ' cancel' : ''}`;
        /* Cancel is set apart from the verbs by one hairline above it, its own and on purpose. */
        const sides = l.cancel ? l.border.slice(1) : l.border;
        assert.deepEqual(sides, sides.map(() => '0px'), `${name}: no border`);
        assert.equal(l.fill, 'rgba(0, 0, 0, 0)', `${name}: no fill`);
        assert.equal(l.image, 'none', `${name}: no gradient`);
        assert.equal(l.appearance, 'none', `${name}: no native look`);
        assert.equal(l.font, 'monospace', `${name}: the menu's own face`);
        assert.equal(l.underline, 'none', `${name}: no underline`);
      }
    }
  } finally {
    await browser.close();
  }
});
