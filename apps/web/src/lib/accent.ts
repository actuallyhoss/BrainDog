/**
 * A record's own colour, applied to the page it is being looked at on.
 *
 * THE CLAIM IS THAT EVERY RECORD FEELS LIKE THE BUSINESS IT BELONGS TO, and every customer was
 * looking at the same red. `@braindog/theme` already solves an entire coherent palette from one
 * colour — against contrast floors, dichromat separability, gamut mapping and a monotone elevation
 * ladder, with every refusal written and tested — and nothing had ever called it with anything but
 * the house seed.
 *
 * A CONSTRUCTED STYLESHEET, NOT A `<style>` TAG. It is adopted after the generated house sheet and
 * wins by being later in the same `@layer theme`, so a record with no colour of its own renders
 * exactly as it did and nothing about the committed CSS changes — which is what keeps the
 * byte-comparison gate meaningful.
 *
 * AND IT IS REFUSED RATHER THAN APPROXIMATED. A colour that cannot meet the floors comes back as
 * the sentences it failed, so a person picking one is told why rather than shown a screen they
 * cannot read.
 *
 * AND THE FLOORS NOW INCLUDE THE ONE THIS MODULE IS MOST EXPOSED TO. `apply` takes any hex, and
 * `restore` re-applies whatever the preference holds without re-deriving it from `ACCENTS`, so the
 * reachable set was never the five swatches. Until check R the accent's own fill was measured by
 * nothing: four of the colours this product used to suggest measured between 1.92:1 and 2.47:1
 * against the raised dark surface and `recordTheme` accepted every one, which is a checked switch
 * nobody can see. A refusal from here names a lighter or darker shade of the same colour, because
 * that is the one move the person holding the picker can make.
 *
 * 2026-10-07, THE COLOUR IS THE WORKING ACCENT, NOT ONLY THE BRAND'S. The product paints its buttons, links, selection
 * and charts in `--action` (DIRECTION §39) and kept `--accent` for the mark's red, so a picker that re-solved only
 * `--accent` changed two swatches and nothing a person uses. `recordTheme` solves `--action` and its tints, label and
 * words from the chosen colour (`Seed.action` in `@braindog/theme`: the house's blue is pinned only beside the house
 * red), so picking Moss turns the buttons Moss, in light exactly the swatch and in dark a lighter step of it.
 */

import { ACCENTS, recordTheme } from '@braindog/theme';

import * as pref from './pref.ts';

/* Re-exported so a screen picking a colour imports one module rather than two, and so the five live
   where every other colour literal in this product lives. `ACCENTS.length` is 5 and has been since
   Brick was removed for being the house colour under another name; the settings screen's own "six
   swatches" is right for a different reason, which is that the sixth control is House. */
export { ACCENTS };

let sheet: CSSStyleSheet | null = null;

/** Whether this browser can adopt a constructed sheet. Every current one can; older ones get nothing. */
const adoptable = (): boolean =>
  typeof document !== 'undefined' && 'adoptedStyleSheets' in document && typeof CSSStyleSheet !== 'undefined';

type Applied = { ok: true } | { ok: false; refusals: string[]; codes: string[] };

/**
 * The record's word for a colour: a swatch's name, or `House`. `undefined` is a colour no swatch wears, which the
 * record has no word for, so it stays on this device.
 */
export const nameOf = (accent: string | null): string | undefined =>
  accent === null ? 'House' : ACCENTS.find((a) => a.hex.toLowerCase() === accent.toLowerCase())?.name;

/**
 * Put a colour on this page, and remember it: in the cookie for the next first paint, and on the record as the person's
 * own `look.accent`, so every device they sign in on wears it.
 *
 * `null` PUTS THE HOUSE COLOUR BACK, which is a real answer and not an absence: somebody who tried
 * a green and did not like it wants the product back, not a blank. It is sent as `House` for the same reason.
 *
 * THIS IS THE PERSON'S COLOUR, NOT THE RECORD'S LOOK. The look (`theme/draw.ts`) is the owner's, for everybody; this
 * sheet is adopted after it, so for this person their own colour wins.
 */
export function apply(accent: string | null): Applied {
  const out = paint(accent);
  const name = nameOf(accent);
  if (out.ok && name !== undefined) void pref.keep('look.accent', name);
  return out;
}

/**
 * The record's `look.accent` as `boot` answered it, put on the page and written over the cookie, and nothing sent back.
 *
 * A NAME THIS BUILD HAS NO SWATCH FOR IS NO ANSWER, and the device's colour stands: a swatch taken out of
 * `@braindog/theme` after somebody chose it should leave them in what they had, not throw it away. `undefined` is a
 * record that holds no accent, or one too old to keep it, and the same.
 */
export function adopt(name: unknown): Applied | null {
  if (name === 'House') return paint(null);
  const hex = ACCENTS.find((a) => a.name === name)?.hex;
  return hex === undefined ? null : paint(hex);
}

/* THE PAGE AND THE COOKIE, AND NOTHING SENT: what `apply`, `adopt` and `restore` share. `restore` must not send, since a
   colour it drops is an old cookie's, and writing House over the record would undo the person's choice everywhere. */
function paint(accent: string | null): Applied {
  if (accent === null) {
    if (sheet) sheet.replaceSync('');
    pref.write({ theme: undefined });
    return { ok: true };
  }

  const built = recordTheme(accent);
  if (!built.ok) return built;
  if (!adoptable()) {
    /* NOTHING TO ADOPT INTO IS NOT A REFUSAL. The colour is remembered, and the next load of a
       browser that can do it will paint with it. */
    pref.write({ theme: accent });
    return { ok: true };
  }

  sheet ??= new CSSStyleSheet();
  sheet.replaceSync(built.value.css);
  /* AT THE END, AND THAT IS WHAT MAKES THE PERSON'S PICK WIN. The record's installed look (`theme/draw.ts`) is adopted
     at the front of the same list, so whichever arrives first, this sheet is the later one in `@layer theme`. */
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  pref.write({ theme: accent });
  return { ok: true };
}

/**
 * Re-apply whatever was remembered, once, on load.
 *
 * A REMEMBERED COLOUR THAT IS NOT APPLIED IS A COLOUR THE PRODUCT FORGOT.
 *
 * THIS DOES NOT TOUCH `data-theme`, AND IT USED TO. The accent is an adopted stylesheet: the custom
 * properties come from `recordTheme()` and go into `document.adoptedStyleSheets`, so the attribute
 * was carrying a hex nothing reads. `house.css` has exactly four `data-theme` selectors and all
 * four say `hc`, so writing an accent there was writing over the high-contrast palette's own
 * switch. There is a flash of the house accent on a cold load as a result, for as long as the
 * module takes to run, and that is the honest trade: the alternative was a palette a reader who
 * needs it could not turn on.
 *
 * AND A STORED COLOUR THE VALIDATOR NOW REFUSES IS DROPPED HERE, WHICH IS THE ONLY PLACE IT CAN BE.
 * A preference outlives the floors that accepted it: check R arrived after the swatch row had
 * already written real cookies, and the four colours this product suggested until then come no
 * closer than 2.55:1, 2.84:1, 2.92:1 and 2.94:1 as a fill against a dark surface, measured through
 * `recordTheme` against a 3:1 floor, so it refuses all four. This used to ignore that
 * refusal, which meant the same failure on every load for ever, no adopted sheet, and a settings
 * screen reading a hex that matches no swatch: `accent = held.theme ?? null` there, so the tick sat
 * on neither a colour nor House and the picker showed nothing chosen at all.
 *
 * SO IT IS CLEARED, AND THAT IS WHAT MAKES THE ACCOUNT WORTH ONE LINE. Holding a value that can
 * never be built again is not remembering a preference, it is remembering a failure; once the
 * cookie is back to House the message is said once rather than on every load, which is the
 * difference between an account and noise.
 *
 * AND THE REFUSAL COMES BACK CARRYING THE COLOUR IT DROPPED, which is one field more than `apply`
 * answers with, and that field is the reason this is its own shape rather than `apply`'s. This used
 * to return `void`, so the shell heard nothing and the only account was the `console.warn` below;
 * it then returned `apply`'s shape, which the shell could hear but could not say, because
 * `copy.accentRefused` wants a name first and the refusal carried none. The shell's other way to
 * get one is `pref.read().theme` BEFORE the call, and that is a trap: the line above has already
 * emptied the cookie by the time this returns, so a reader a line late reads `undefined` and names
 * the dropped colour the empty string.
 *
 * THE SAYING ITSELF IS THE SHELL'S AND NOT THIS MODULE'S. `+layout.svelte` pushes it onto the toast
 * stack, which is the one polite live region in the product. It cannot be done from here: this file
 * is loaded by a node test against a `document` with four members in it, and the toast store is
 * Svelte runes.
 */
export function restore(): { ok: true } | { ok: false; refusals: string[]; codes: string[]; dropped: string } {
  const held = pref.read().theme;
  if (!held) return { ok: true };

  const out = paint(held);
  if (out.ok) return out;

  /* HOUSE FIRST, THEN THE SENTENCE, so that the sentence is true in the past tense by the time
     anybody reads it. `paint(null)` is the House control's path without the send: it empties the
     sheet if one was ever adopted and takes `theme` out of the cookie without touching the other
     preferences beside it, and it leaves the record's `look.accent` alone. */
  paint(null);
  /* THE AUTHOR'S SENTENCE AND NOT THE READER'S, deliberately: this goes to a console, and the one
     thing a console is read by is somebody who can act on "2.92:1 against s1 in dark". The reader's
     version of the same refusal is `copy.accentRefused`, built from `codes` and `dropped` by
     whichever surface is looking at it: the swatch row when a swatch was pressed, and the shell when
     nobody pressed anything and a load lost a colour. Both are what the returned result is for, and
     the console line stays because it is the only one of the three that carries the ratio. */
  const why = out.refusals[0] ?? `${out.codes.join(', ')}.`;
  console.warn(`${held} can no longer be this record's colour. ${why} It is back to the house colour.`);
  return { ...out, dropped: held };
}
