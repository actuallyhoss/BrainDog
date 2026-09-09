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
 */

import { ACCENTS, recordTheme } from '@braindog/theme';

import * as pref from './pref.ts';

/* Re-exported so a screen picking a colour imports one module rather than two, and so the six live
   where every other colour literal in this product lives. */
export { ACCENTS };

let sheet: CSSStyleSheet | null = null;

/** Whether this browser can adopt a constructed sheet. Every current one can; older ones get nothing. */
const adoptable = (): boolean =>
  typeof document !== 'undefined' && 'adoptedStyleSheets' in document && typeof CSSStyleSheet !== 'undefined';

/**
 * Put a colour on this page, and remember it.
 *
 * `null` PUTS THE HOUSE COLOUR BACK, which is a real answer and not an absence: somebody who tried
 * a green and did not like it wants the product back, not a blank.
 */
export function apply(accent: string | null): { ok: true } | { ok: false; refusals: string[]; codes: string[] } {
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
 */
export function restore(): void {
  const held = pref.read().theme;
  if (held) apply(held);
}
