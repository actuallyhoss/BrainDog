/**
 * The cookie the shell reads before it paints, and the two settings that were lost on every reload.
 *
 * WHAT IS BEING TESTED IS THE MERGE, mostly. Each preference is written by its own control, and a
 * write that carried only the field it knew about would silently reset every other one — which is
 * the shape of bug that makes people think a product forgets things at random, and is exactly what
 * a per-control store invites.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as pref from './pref.ts';

/** A document with a cookie jar, since that is the whole of what `pref` touches. */
function jar(initial = '') {
  (globalThis as { document?: { cookie: string } }).document = {
    get cookie() {
      return initial;
    },
    set cookie(next: string) {
      initial = next.split(';')[0] ?? '';
    },
  };
}

test('a write merges rather than replaces', () => {
  jar();
  pref.write({ scheme: 'dark' });
  pref.write({ density: 'roomy' });
  assert.deepEqual(pref.read(), { scheme: 'dark', density: 'roomy' });
});

test('HIDDEN COLUMNS SURVIVE A RELOAD, per register', () => {
  /* 50 §5.2 names the store `prefs.columns[register]` and it did not exist: untick a column, press
     Done, reload, and it is back — on a screen whose search, filters and sort all survive in the
     URL, which is why a reader expects this to. */
  jar();
  pref.write({ columns: { obligations: ['party', 'due'] } });
  pref.write({ columns: { ...pref.read().columns, services: ['cost'] } });

  assert.deepEqual(pref.read().columns, { obligations: ['party', 'due'], services: ['cost'] });
  // And the scheme somebody set earlier is still there, which is the merge doing its job.
  pref.write({ scheme: 'dark' });
  assert.deepEqual(pref.read().columns?.obligations, ['party', 'due']);
});

test('and clearing one register leaves the others alone', () => {
  jar();
  pref.write({ columns: { obligations: ['party'], services: ['cost'] } });
  const all = { ...pref.read().columns };
  delete all.obligations;
  pref.write({ columns: all });
  assert.deepEqual(pref.read().columns, { services: ['cost'] });
});

test('THE NAV ORDER SURVIVES A RELOAD', () => {
  /* The rail's header claims "position lives in a per-user store and wins", and there was no store:
     Move up reordered the rail on screen and a reload put it back, silently — while `Hide`, one item
     below it in the same menu, was honest about writing nothing. */
  jar();
  pref.write({ nav: ['/p/money', '/r/obligations', '/'] });
  assert.deepEqual(pref.read().nav, ['/p/money', '/r/obligations', '/']);
});

test('the activity mark survives, so "since you were away" can advance', () => {
  /**
   * HOME'S FEED MADE A CLAIM ABOUT THE READER'S OWN HISTORY AND NOTHING STORED ONE.
   *
   * "Since you were away" read a module constant and there was no mark anywhere — not in the cookie,
   * not in `localStorage` — so the fifth session showed the same six items as the first. `19 §6`
   * calls this half of Home the answer to *"what happened while you were not looking"*, and
   * `copy.markAllRead` sat unused waiting for the store that did not exist.
   *
   * AN INSTANT, NOT A PER-ITEM FLAG: one string that survives a new arrival correctly, and the same
   * shape the real record uses (`33 §2`'s `whatsNew` cursor, defaulting to `member.seen_at`).
   */
  jar();
  assert.equal(pref.read().seen, undefined, 'a first visit has looked at nothing');
  pref.write({ seen: '2026-09-03T09:00:00Z' });
  assert.equal(pref.read().seen, '2026-09-03T09:00:00Z');
  /* And it is replaced, not accumulated — marking read twice leaves one mark. */
  pref.write({ seen: '2026-09-04T09:00:00Z' });
  assert.equal(pref.read().seen, '2026-09-04T09:00:00Z');
});

test('a cookie this build cannot read is not a crash', () => {
  // A preference from an older version, or one somebody edited. The default is the right answer and
  // the next write replaces it.
  jar('bd_pref=%7Bnot-json');
  assert.deepEqual(pref.read(), {});
});

test('and an absent document reads empty rather than throwing', () => {
  delete (globalThis as { document?: unknown }).document;
  assert.deepEqual(pref.read(), {});
  pref.write({ scheme: 'dark' });
});

/**
 * THE HIGH-CONTRAST PALETTE HAS A SWITCH, AND IT DID NOT.
 *
 * `packages/theme` solves a second palette against a higher contrast floor, `theme.mjs` writes it
 * into `house.css` behind `html[data-theme='hc']`, and `--check` byte-compares it on every build.
 * Nothing in `apps/web/src` ever set that attribute, so a whole generated palette validated by
 * sixteen checks could not be turned on by the reader it exists for.
 *
 * WHAT WAS IN ITS WAY IS WHAT THIS ALSO CHECKS. `data-theme` carried two meanings and only one was
 * read: `house.css` has four `data-theme` selectors and all four say `hc`, while the record accent
 * was being written into the same attribute by `app.html` and by `accent.ts`. The one that was
 * written was the one nothing read.
 */
test('the contrast palette has a switch, and the accent does not fight it for the attribute', () => {
  const house = readFileSync(fileURLToPath(new URL('../../../../packages/skin/house.css', import.meta.url)), 'utf8');
  const selectors = [...house.matchAll(/data-theme=(['"])([^'"]+)\1/gu)].map((m) => m[2]);
  assert.ok(selectors.length > 0, 'house.css no longer carries a data-theme palette');
  assert.deepEqual([...new Set(selectors)], ['hc'], 'data-theme means something other than hc again');

  /* THE BOOT SCRIPT WRITES IT, so the palette is on before first paint rather than after a flash. */
  const boot = readFileSync(fileURLToPath(new URL('../app.html', import.meta.url)), 'utf8');
  assert.match(boot, /p\.contrast&&d\.setAttribute\('data-theme','hc'\)/u, 'the shell does not boot the contrast palette');
  assert.doesNotMatch(boot, /setAttribute\('data-theme',\s*p\.theme\)/u, 'the accent claims data-theme again');

  /* AND THE ACCENT DOES NOT TOUCH IT. Its palette is an adopted stylesheet and needs no attribute. */
  const accent = readFileSync(fileURLToPath(new URL('./accent.ts', import.meta.url)), 'utf8');
  const code = accent.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(code, /data-theme/u, 'accent.ts writes data-theme again');

  /* THE CONTROL EXISTS, on the screen that owns every other palette decision. */
  const appearance = readFileSync(fileURLToPath(new URL('../routes/settings/[area]/+page.svelte', import.meta.url)), 'utf8');
  assert.match(appearance, /pickContrast\(true\)/u, 'nothing turns the contrast palette on');
  assert.match(appearance, /aria-pressed=\{moreContrast\}/u, 'the switch does not say which state it is in');
});
