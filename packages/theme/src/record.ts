/**
 * A record's own palette, solved from one colour.
 *
 * THE CLAIM IS THAT EVERY RECORD FEELS LIKE THE BUSINESS IT BELONGS TO, and every customer on earth
 * was looking at the same red. This package already solves an entire coherent palette from one seed
 * against contrast floors, dichromat separability, gamut mapping and a monotone elevation ladder —
 * nine hundred lines of it, with every refusal written and tested — and nothing ever called it with
 * anything but the house colour.
 *
 * IT IS A SECOND `@layer theme` BLOCK, not a replacement. The generated house palette is in the
 * stylesheet at first paint so a record with no colour of its own still renders; this arrives after
 * and wins by being later in the same layer. Nothing about the shipped CSS changes, which is what
 * keeps the byte-comparison gate meaningful.
 *
 * AND IT IS REFUSED RATHER THAN APPROXIMATED. A colour that cannot meet the floors comes back as a
 * list of what it failed, not as a palette that looks nearly right — the checks are the reason a
 * customer can pick a colour at all without somebody reviewing it.
 */

import { build, normalise, HOUSE_PROFILE, HIGH_CONTRAST_PROFILE, type Built, type Seed } from './build.ts';
import { checkElevation, checkScheme, refusals } from './checks.ts';
import { forcedColors, toCSS } from './css.ts';


/* `forcedColors` is no longer called here — see the note on check L below. */
void forcedColors;

export type RecordTheme = {
  /** The `@layer theme` block, ready for one `replaceSync`. */
  css: string;
  /** The accent as it was solved, so a caller can show the colour it actually got. */
  accent: string;
  built: Built;
};

/**
 * A record's palette from its accent, or the reasons it cannot have one.
 *
 * THE NEUTRALS TAKE THE ACCENT'S HUE ONLY WHEN THE ACCENT IS FAINT. `from-accent` on a saturated
 * brand renders brown: at L 0.16 even a whisper of chroma at a warm hue reads as dirt rather than
 * as warmth, which is what the house seed's own note records paying to learn. So a record's
 * surfaces stay the paper-in-the-sun olive that everything else is built against, and what changes
 * is the accent, the marks and the links — which is where colour means anything.
 */
export function recordTheme(accent: string, opts: { neutralHue?: number } = {}): { ok: true; value: RecordTheme } | { ok: false; refusals: string[] } {
  /* A COLOUR WITH NO HUE IN IT IS NOT A SEED. `normalise` throws on a near-grey, and it is right to
     — there is nothing to build a palette from — but a throw is not how anything else in this
     product answers, so the sentence comes back as a refusal. */
  try {
    normalise(accent);
  } catch (e) {
    return { ok: false, refusals: [e instanceof Error ? e.message : `${accent} is not a colour this record can read.`] };
  }
  const hex = accent;

  const seed: Seed = {
    accent: hex,
    neutralHue: opts.neutralHue ?? 110,
    space: 4,
    radius: { sm: 4, md: 6, lg: 8 },
    density: 'comfortable',
  };

  const built = build(seed, HOUSE_PROFILE, 'record');
  const contrast = build(seed, HIGH_CONTRAST_PROFILE, 'record-hc');

  /* EVERY FLOOR, BEFORE ANY OF IT IS SHOWN. A palette that fails a check is a screen somebody
     cannot read, and "nearly" is not a value a contrast ratio takes.

     THE DOCUMENT IS WHAT IS CHECKED, and a record's theme is one `@layer theme` block — the
     forced-colours boundary lives in `@layer a11y`, which no theme can reach and which is already
     in the page. Validating the block on its own would refuse every record for the absence of a
     rule it is not allowed to write.

     SO CHECK L IS NOT RUN HERE, AND IT IS NOT FAKED EITHER. It used to be: this file manufactured
     the forced-colours block with `forcedColors(…)`, appended it to the stylesheet, and then asked
     `validate` whether the stylesheet contained a forced-colours block — the caller handing in the
     thing being looked for, which is the exact shape of check that cannot fail. A record's theme
     genuinely cannot affect that boundary, so the honest answer is that L is not a property of a
     theme: it is a property of the document, asserted once by the generator that writes the
     document, against the real `a11y.css`. */
  const css = toCSS(built, contrast);
  const wrong = [
    ...refusals(checkScheme(built, 'dark')),
    ...refusals(checkScheme(built, 'light')),
    ...refusals(checkElevation(built)),
    ...refusals(checkScheme(contrast, 'dark')),
    ...refusals(checkScheme(contrast, 'light')),
    ...refusals(checkElevation(contrast)),
  ].map((f) => f.fix ?? `${f.check} failed on the ${f.scheme} scheme.`);
  if (wrong.length) return { ok: false, refusals: [...new Set(wrong)] };

  return { ok: true, value: { css, accent: hex, built } };
}

/**
 * Six colours a record can be, as a starting point rather than a palette.
 *
 * THEY ARE SUGGESTIONS AND NOT THE SET. Any colour a customer supplies is solved and checked the
 * same way; these exist so somebody with no brand colour to hand is not staring at a colour picker
 * on their second minute. Each is chosen inside the same window the house seed's own note works
 * through — light enough for a white label at 4.5:1, dark enough to hold a 3:1 boundary against
 * cream — and each is far enough from the four intent hues to never be mistaken for a state.
 *
 * THEY LIVE HERE BECAUSE COLOUR LITERALS LIVE HERE. A component may name only the semantic layer,
 * and a gate greps for it: the moment a swatch list is written in a settings screen it is a second
 * place the product's colours are decided.
 */
export const ACCENTS: readonly { name: string; hex: string }[] = [
  { name: 'Brick', hex: '#CF413A' },
  { name: 'Moss', hex: '#2F6F4E' },
  { name: 'Ink blue', hex: '#1B4FA8' },
  { name: 'Plum', hex: '#8A3E7A' },
  { name: 'Ochre', hex: '#A86A16' },
  { name: 'Teal', hex: '#0F6C77' },
];
