/**
 * The record's colour on load, and the stored colour the floor now refuses.
 *
 * THIS MODULE HAD NO TEST FILE AT ALL, which is why the defect below survived the commit that
 * created it. `apply` was covered from the other side by `theme.test.ts` over the five suggestions
 * and by `pref.test.ts` reading this file as TEXT to check it never writes `data-theme` again;
 * `restore`, the one function here that runs on every single load, was read by nothing.
 *
 * WHAT IT IS ABOUT IS A PREFERENCE OUTLIVING THE VALIDATOR THAT ACCEPTED IT. `6553689c` added
 * check R, which measures the accent as a fill against all five surfaces in both schemes and both
 * profiles and refuses under 3:1. The four colours this product suggested until that commit are now
 * refused, and each one's CLOSEST measurement is still short: measured here through `recordTheme`,
 * Moss `#2F6F4E` is 2.92:1 against `s1` in dark, Ink blue `#1B4FA8` is 2.55:1 against `sunk`, Plum
 * `#8A3E7A` is 2.84:1 against `sunk`, and Teal `#0F6C77` is 2.94:1 against `bg`. Ochre `#A86A16` is
 * the fifth and it passes, which is why there are four here and not five. Every browser that pressed
 * one of the other four before the floor moved is holding a hex the product will not build, and it
 * holds it for ever.
 *
 * A FAKE DOCUMENT AND NOT A BROWSER, because what is being tested is the decision and not the
 * paint: a cookie jar, an `adoptedStyleSheets` array and a constructed sheet that remembers the
 * last text given to it are the whole of what this module touches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as accent from './accent.ts';
import * as pref from './pref.ts';

/**
 * Moss as it shipped until 21 September, which the floor added that day refuses at 2.92:1.
 *
 * ONE OF THE FOUR AND NOT A COLOUR INVENTED FOR A TEST. A value nobody's browser holds would prove
 * the branch and not the bug: these four are what the swatch row wrote into real cookies.
 */
const REFUSED = '#2F6F4E';

/** Moss as it is now, raised up the lightness axis to clear 3:1. It is here to show the happy path still works. */
const ACCEPTED = '#41815F';

/**
 * A document with a cookie jar and somewhere to adopt a sheet.
 *
 * THE SHEET REMEMBERS ITS TEXT, because "the accent was put back" and "the accent was cleared" are
 * both statements about what `replaceSync` was last given, and a stub that threw the text away could
 * not tell the two apart.
 */
function browser(cookie = '') {
  class Sheet {
    text = '';
    replaceSync(css: string) {
      this.text = css;
    }
  }
  (globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet = Sheet;
  (globalThis as { document?: unknown }).document = {
    adoptedStyleSheets: [] as Sheet[],
    get cookie() {
      return cookie;
    },
    set cookie(next: string) {
      cookie = next.split(';')[0] ?? '';
    },
  };
  /* READ BACK OFF THE GLOBAL EVERY TIME RATHER THAN CLOSING OVER THE ARRAY. `apply` adopts with
     `document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]`, which replaces the
     property and never touches the array that was there, so a closure over the initial one would
     report zero sheets no matter what was adopted. The cast goes through `unknown` because the DOM
     library's `document` is a `Document` and this stub is deliberately four members of one. */
  return () => (globalThis as unknown as { document: { adoptedStyleSheets: Sheet[] } }).document.adoptedStyleSheets;
}

/** Every warning this module wrote while `run` ran, so "says so once" is a count and not an impression. */
function warnings(run: () => void): string[] {
  const kept = console.warn;
  const said: string[] = [];
  console.warn = (...args: unknown[]) => void said.push(args.map(String).join(' '));
  try {
    run();
  } finally {
    console.warn = kept;
  }
  return said;
}

test('A STORED COLOUR THE FLOOR NOW REFUSES IS CLEARED, not carried to the next load', () => {
  /* The preference was written by a build whose validator accepted it, and `restore` re-applies it
     without re-deriving it from `ACCENTS`, so the reachable set here was never the five swatches.
     Left in place it fails on every load for ever, and the settings screen reads `held.theme ??
     null` for its tick: a hex that matches no swatch and is not `null` leaves `aria-pressed` false
     on all six controls, so the picker shows no colour chosen and House not chosen either. */
  const sheets = browser();
  pref.write({ theme: REFUSED, scheme: 'dark' });

  warnings(() => accent.restore());

  assert.equal(pref.read().theme, undefined, 'the refused colour is still in the cookie');
  assert.equal(pref.read().scheme, 'dark', 'clearing the accent took another preference with it');
  assert.equal(
    sheets().length,
    0,
    'a sheet was adopted for a colour that was refused, so the page is painted in something the checks rejected',
  );
});

test('and it says so once, naming the colour, rather than failing in silence', () => {
  /* SILENTLY IS THE WORST OF THE THREE OUTCOMES. The colour goes back to House either way, so
     nothing on screen is unreadable; what a reader loses with no account is the reason their
     record stopped being green, and the account is worth exactly one line. */
  browser();
  pref.write({ theme: REFUSED });

  const said = warnings(() => accent.restore());
  assert.equal(said.length, 1, 'a refused stored accent should be reported once');
  assert.match(said[0] ?? '', /2F6F4E/iu, 'the report does not name the colour it dropped');
});

test('and the load after that is quiet, because there is nothing left to refuse', () => {
  /* ONCE MEANS ONCE, and the clearing is what makes it once. A message written on every load is a
     message a person learns to scroll past, which is the same silence with more noise in it. */
  browser();
  pref.write({ theme: REFUSED });

  warnings(() => accent.restore());
  const second = warnings(() => accent.restore());
  assert.deepEqual(second, [], 'the refusal was reported again on a load with no stored accent');
});

test('and the caller is told, in the same shape `apply` answers in', () => {
  /* THE SHELL CALLS THIS AND COULD SAY IT IN WORDS. `restore` returned `void`, so the refusal had
     nowhere to go even if a caller wanted it; the settings screen already turns `codes` into a
     sentence a person can act on through `copy.accentRefused`, and that is the sentence this
     result makes reachable from the shell. */
  browser();
  pref.write({ theme: REFUSED });

  let out!: ReturnType<typeof accent.restore>;
  warnings(() => void (out = accent.restore()));
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.deepEqual(out.codes, ['CONTRAST_FLOOR']);
  assert.ok(out.refusals.length > 0, 'a refusal with no sentence in it');
});

test('a stored colour that still clears the floors is put back, and kept', () => {
  /* THE HALF THAT MUST NOT REGRESS. A fix that cleared the preference whenever anything went wrong
     would forget every record's colour on every load, which is a worse bug than the one being
     repaired here. */
  const sheets = browser();
  pref.write({ theme: ACCEPTED });

  const said = warnings(() => accent.restore());
  assert.deepEqual(said, [], 'a colour that passed every check was reported as a problem');
  assert.equal(pref.read().theme, ACCEPTED, 'a colour that passed every check was forgotten');
  assert.equal(sheets().length, 1);
  assert.match(sheets()[0]?.text ?? '', /@layer theme/u, 'the adopted sheet is not the record palette');
});

test('and a browser holding no colour at all adopts nothing and says nothing', () => {
  /* THE ORDINARY CASE, which is most loads: no accent has ever been chosen, so the generated house
     sheet already in the page is the whole answer and this module must not touch it. */
  const sheets = browser();

  const said = warnings(() => accent.restore());
  assert.deepEqual(said, []);
  assert.equal(sheets().length, 0);
  assert.equal(pref.read().theme, undefined);
});
