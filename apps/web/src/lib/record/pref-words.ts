/**
 * What a personal setting now is, in one plain sentence: the line a kept change's toast says before its Undo.
 *
 * THE SETTING NAMED THE WAY THE SCREEN NAMES IT. Appearance labels its choices "Colour scheme", "Text", "Density" and
 * "More contrast" (`copy/account.ts`), so the sentence reuses those words and never the key the record keeps it under:
 * "Density is compact.", not `look.density`. A value this build has no word for is said as the setting changing, never
 * printed, because a person reading a raw value is reading an id.
 *
 * PRESENT TENSE ON PURPOSE. The toast says what the setting is now, so the same sentence reads true after a change and
 * after its Undo: "Density is compact." then "Density is comfortable.".
 *
 * THE ACCENT IS SAID BY ITS SWATCH'S NAME. Appearance holds the colour as its hex, and `ACCENTS` (already in that
 * screen's chunk through `accent.ts`) turns it back into "Moss". The sentences were `copy.accentSet` and
 * `copy.accentReset`, said here alone since Appearance writes through `pref-write.ts`.
 */

import { ACCENTS } from '@braindog/theme';

/** Every personal setting Appearance writes, by the name the cookie and `pref.apply` know it by. */
export type PrefKey = 'scheme' | 'text' | 'density' | 'contrast' | 'theme';
/** What each one holds: a word, the contrast switch, or `null` for the setting's own default. */
export type PrefValue = string | boolean | null;

const SCHEME: Record<string, string> = {
  light: 'The colour scheme is light.',
  dark: 'The colour scheme is dark.',
  system: 'The colour scheme follows this device.',
};
const TEXT: Record<string, string> = { sm: 'Text is small.', base: 'Text is normal.', md: 'Text is large.' };
const DENSITY: Record<string, string> = {
  compact: 'Density is compact.',
  comfortable: 'Density is comfortable.',
  roomy: 'Density is roomy.',
};

/* WHAT IS SAID WHEN A VALUE HAS NO WORD, by setting: a newer build's value in an older tab, said without printing it. */
const CHANGED: Record<PrefKey, string> = {
  scheme: 'The colour scheme changed.',
  text: 'Text size changed.',
  density: 'Density changed.',
  contrast: 'Contrast changed.',
  theme: 'Your colour changed.',
};

/** The sentence for `key` now holding `value`. */
export function said(key: PrefKey, value: PrefValue): string {
  switch (key) {
    /* NO SCHEME IS "MATCH THIS DEVICE": `pref.apply` sends `null` as `system`, and the sentence agrees with it. */
    case 'scheme':
      return SCHEME[typeof value === 'string' ? value : 'system'] ?? CHANGED.scheme;
    /* NO SIZE OR DENSITY IS THE DEFAULT, which the controls draw as Normal and Comfortable. */
    case 'text':
      return TEXT[typeof value === 'string' ? value : 'base'] ?? CHANGED.text;
    case 'density':
      return DENSITY[typeof value === 'string' ? value : 'comfortable'] ?? CHANGED.density;
    case 'contrast':
      return value === true ? 'Contrast is high.' : 'Contrast is normal.';
    case 'theme': {
      if (value === null || value === false) return 'Back to the house colour.';
      const name = typeof value === 'string' ? ACCENTS.find((a) => a.hex.toLowerCase() === value.toLowerCase())?.name : undefined;
      return name === undefined ? CHANGED.theme : `${name} is your colour.`;
    }
  }
}
