/**
 * Two defaults the shell carried for one owner: a figure with no list linked to Money, and every currency picker led
 * with the Egyptian pound.
 *
 * BOTH WERE DRIVEN BEFORE THIS FILE EXISTED: `hrefFor` over a figure whose
 * source names no list answered `/p/money`, and `currencyChoices` answered `["EGP","USD","GBP","EUR", ...]` for a
 * record at `GBP`, at `JPY` and with no home currency at all. `/p/money` is a page only money-core declares, so on a
 * record without Money that door opens nothing, and the picker's order was the order of the person who wrote it.
 *
 * WHAT A PERSON COULD SEE OF THE FIRST ONE, MEASURED: nothing yet. Every figure the seed declares names
 * a list (seven sources, all `register.`). So the `/p/money` fallback was a default waiting for the first figure that
 * reads something other than a list, and the cases below hand the live tiles such a figure to hold them to the answer
 * before one ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import './fixtures/fill.ts';
import { COMMON_CURRENCIES, OFFERED_CURRENCIES, OTHER_CURRENCIES, currencyChoices } from './currencies.ts';
import { METRICS } from './declared.ts';
import { hrefFor, type MetricDecl } from './metrics.ts';
import { tileOf as homeTile } from './news-live.ts';
import { tileOf as pageTile } from './page-live.ts';

/** A declared figure moved off its list: the same figure, reading something that is not a register. */
const unlisted = (id: string): MetricDecl => ({ ...METRICS['estate-year']!, metric: id, source: 'sessions.live' });

/** The build's figures with one more in them for the length of `run`, because both live tiles look a figure up by id. */
function withFigure<T>(decl: MetricDecl, run: () => T): T {
  METRICS[decl.metric] = decl;
  try {
    return run();
  } finally {
    delete METRICS[decl.metric];
  }
}

/* ── a figure with no list ─────────────────────────────────────────────── */

test('A FIGURE WHOSE SOURCE NAMES NO LIST HAS NO DOOR, where it used to be handed Money’s page', () => {
  assert.equal(hrefFor(unlisted('unlisted')), null);
  /* AND A FIGURE THAT NAMES ONE STILL OPENS IT: the derived link is the whole point of `hrefFor`. */
  assert.match(hrefFor(METRICS['estate-year']!) ?? '', /^\/r\/services\?/u);
});

test('HOME’S TILE AND A PAGE’S TILE LEAVE THE DOOR OFF A FIGURE WITH NO LIST, and keep it on one that has', () => {
  const decl = unlisted('unlisted-live');
  const reading = { value: 1_250_000, unit: 'GBP', rows: 4, held: 4, met: true, refusals: [] };
  const home = withFigure(decl, () => homeTile(decl.metric, reading));
  const page = withFigure(decl, () => pageTile({ metric: decl.metric, reading } as never));
  assert.equal(home.value, 'GBP 12,500.00', 'the figure itself is drawn; only the door goes');
  assert.equal(home.href, undefined);
  assert.equal(page.href, undefined);

  const listed = homeTile('estate-year', reading);
  assert.equal(listed.href, hrefFor(METRICS['estate-year']!));
});

/* ── the currency picker ───────────────────────────────────────────────── */

test('THE COMMON CURRENCIES LEAD WITH THE RECORD’S OWN, whichever it is', () => {
  for (const home of ['GBP', 'JPY', 'usd', ' eur ']) {
    const { common, other } = currencyChoices(home);
    const code = home.trim().toUpperCase();
    assert.equal(common[0], code, `a record at ${code} was offered ${common[0]} first`);
    assert.equal(common.filter((c) => c === code).length, 1, `${code} is offered once`);
    assert.deepEqual([...common].sort(), [...COMMON_CURRENCIES].sort(), 'leading with it adds and drops nothing');
    assert.equal(other.includes(code), false);
  }
});

test('A HOME CURRENCY OUTSIDE THE COMMON ONES LEADS THEM TOO, and is not offered twice', () => {
  const { common, other } = currencyChoices('NZD');
  assert.equal(common[0], 'NZD');
  assert.equal(other.includes('NZD'), false, 'a code in both groups is two options with one value');
  assert.equal(common.length + other.length, OFFERED_CURRENCIES.length);
});

test('WITH NO HOME CURRENCY THE COMMON ONES ARE IN THE RUNTIME’S ORDER, with no one person’s first', () => {
  const { common } = currencyChoices('');
  assert.deepEqual(common, OFFERED_CURRENCIES.filter((c) => common.includes(c)));
  assert.equal(common[0], 'AED', 'the first common code in the order `Intl` lists them');
  assert.deepEqual(currencyChoices('not a code').common, common);
  assert.equal(currencyChoices('').other, OTHER_CURRENCIES);
});

test('THE SETTINGS PICKER IS ORDERED BY THE SAVED CURRENCY, so a pick does not move the list under the next one', () => {
  /* WHAT WENT WRONG WHEN IT WAS ORDERED BY THE DRAFT. The select writes its draft on every `change`, and a closed select
     stepped with the down arrow fires one per step, so each step moved the code just picked to the front and the next
     step landed on the code it had left: from `GBP` it went AED, AUD, AED, AUD. Held at the saved code, the same six
     steps walk six codes in order. */
  const { common, other } = currencyChoices('GBP');
  const order = ['', ...common, ...other];
  const walked = Array.from({ length: 6 }, (_, i) => order[order.indexOf('GBP') + 1 + i]);
  assert.equal(new Set(walked).size, 6);

  /* A SOURCE SCAN, BECAUSE NOTHING IN THIS APP RENDERS A ROUTE'S COMPONENT UNDER `node --test`. Comments blanked, as
     `at-sites.test.ts` blanks them, because a comment may say what the page used to draw. */
  /* NAMED NOW, SO BOTH PICKERS ASK `currencyOptions` (ecf4b4fed), which leads with what it is handed: the add-on's page, and Settings › Words. */
  for (const path of ['../../routes/addons/[id]/Installed.svelte', '../../routes/settings/[area]/areas/Words.svelte']) {
    const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//gu, '');
    const asked = [...source.matchAll(/currencyOptions\(([^)]*)\)/gu)].map((m) => m[1]);
    assert.equal(asked.length, 1, `${path} asks for the choices in one place`);
    assert.equal(asked[0], 'heldIn', `the settings picker is ordered by something other than the saved code: currencyOptions(${asked[0]})`);
    assert.match(source, /const heldIn = /u);
  }
});
