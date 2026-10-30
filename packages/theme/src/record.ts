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

import { build, normalise, HOUSE_NEUTRAL_HUE, HOUSE_PROFILE, HIGH_CONTRAST_PROFILE, type Built, type Seed } from './build.ts';
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
 * surfaces stay the house's slate that everything else is built against, and what changes
 * is the accent, the marks, and the working accent (buttons, links, selection and charts: `action`, solved from
 * this colour since the house pins its working red only beside its own mark) — which is where colour means anything.
 */
/**
 * WHY IT WAS REFUSED, AND NOT ONLY THE AUTHOR'S SENTENCE FOR IT.
 *
 * `refusals` are written for whoever is BUILDING a theme: "the pair (faint on s3) is 3.61:1 in dark,
 * it needs 4.5:1, move faint further from the ground". Every one of them instructs an action, and
 * every one of those actions is a theme author's — there is no control on the settings screen that
 * moves a hue or lowers a chroma. `checks.ts`'s own comment says a refusal a person cannot act on
 * teaches them the control is broken.
 *
 * SO THE CODE TRAVELS TOO. It is the one thing a caller can turn into a sentence for the person in
 * front of it: a contrast floor is "text would not be readable", an inseparable intent is "two of
 * the four meanings would look the same". The author's sentences stay, for the surface that has an
 * author on it.
 *
 * CHECK R IS THE ONE EXCEPTION, AND IT IS THE REASON R IS ALLOWED TO REFUSE. Its sentence is
 * "pick a lighter shade of the same colour", and a lighter shade of their own colour is exactly
 * what the person at the picker has in front of them. It is the only refusal in the set whose
 * instruction is aimed at the customer rather than at a theme author, which is why the alternative
 * of quietly solving the accent up the lightness axis was rejected: a refusal nobody can act on is
 * worse than a colour made visible behind their back, and this one can be acted on.
 */
export function recordTheme(
  accent: string,
  opts: { neutralHue?: number } = {},
): { ok: true; value: RecordTheme } | { ok: false; refusals: string[]; codes: string[] } {
  /* A COLOUR WITH NO HUE IN IT IS NOT A SEED. `normalise` throws on a near-grey, and it is right to
     — there is nothing to build a palette from — but a throw is not how anything else in this
     product answers, so the sentence comes back as a refusal. */
  try {
    normalise(accent);
  } catch (e) {
    return {
      ok: false,
      refusals: [e instanceof Error ? e.message : `${accent} is not a colour this record can read.`],
      codes: ['THEME_VALUE_INVALID'],
    };
  }
  const hex = accent;

  const seed: Seed = {
    accent: hex,
    /* 2026-09-29, THE HOUSE SLATE AND NOT 110. The design system's ground is the product's, and the
       house profile now carries its chroma, up to 0.02 in dark, which at hue 110 is khaki. The accent is the record's. */
    neutralHue: opts.neutralHue ?? HOUSE_NEUTRAL_HUE,
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
  const found = [
    ...refusals(checkScheme(built, 'dark')),
    ...refusals(checkScheme(built, 'light')),
    ...refusals(checkElevation(built)),
    ...refusals(checkScheme(contrast, 'dark')),
    ...refusals(checkScheme(contrast, 'light')),
    ...refusals(checkElevation(contrast)),
  ];
  const wrong = found.map((f) => f.fix ?? `${f.check} failed on the ${f.scheme} scheme.`);
  if (wrong.length)
    return {
      ok: false,
      refusals: [...new Set(wrong)],
      /* A FINDING WITHOUT A CODE IS STILL A REFUSAL. `Finding.code` is optional, and dropping the
         undefined ones rather than widening the type keeps the list to codes a caller can switch on
         — which is the only thing it is for. */
      codes: [...new Set(found.flatMap((f) => (f.code === undefined ? [] : [f.code as string])))],
    };

  return { ok: true, value: { css, accent: hex, built } };
}

/**
 * Five colours a record can be, as a starting point rather than a palette. The heading said six
 * and the list has held five since Brick was removed for being the house colour under another
 * name; a count in a comment is the cheapest thing in a file to leave behind.
 *
 * THEY ARE SUGGESTIONS AND NOT THE SET. Any colour a customer supplies is solved and checked the
 * same way; these exist so somebody with no brand colour to hand is not staring at a colour picker
 * on their second minute. Each is chosen inside the same window the house seed's own note works
 * through.
 *
 * AND NONE OF THEM IS TWENTY DEGREES FROM EVERY INTENT, WHICH THIS NOTE USED TO CLAIM. Measured:
 * Ink blue is 3.7 degrees from `info`'s anchor, Ochre 7.5 from `warn`, Moss 13.6 from `earn`, and
 * `HUE_FLOOR` is 20. The sentence was wrong rather than the values: an accent is chrome and never
 * a row's verdict, so the intent floor does not govern it, which is the same argument the house
 * seed already makes about sitting 14 degrees from `info`. What keeps an accent off a state is
 * that it never appears where a state appears, not the angle.
 *
 * AND THE WINDOW HAS TWO SIDES, WHICH THIS NOTE USED TO GIVE ONE OF. It said "light enough for a
 * white label at 4.5:1, dark enough to hold a 3:1 boundary against cream", and cream is the LIGHT
 * scheme. The dark one was never measured. SC 1.4.11 asks 3:1 of the fill against the surface
 * under it, in both schemes. Against the worst of the five surfaces over both profiles and both
 * schemes, the old five measured: Ink blue 1.92, Plum 2.15, Teal 2.41, Moss 2.47, Ochre 3.33. Four
 * of the five produced a checked switch and a selected tile that vanish in the dark, and
 * `recordTheme` accepted every one of them with no refusal, because nothing in this package
 * measured `accent` against a surface at all: check D read `edge` and `accent-edge`, check B read
 * `accent-text`, check Q read the accent against its own label, and the fill itself was measured
 * by nothing. Check R is that measurement, and it refuses.
 *
 * AND THE "FOURTEEN DECLARATIONS ACROSS ELEVEN RULES" THIS NOTE USED TO GIVE IS A NARROWER COUNT
 * THAN IT READS, SO HERE IS THE RANGE. `grep -rn "var(--accent)" apps/web/src` finds 28 hits.
 * Two are prose in a comment and one is a 22-percent `color-mix`, which leaves 25 places the token
 * is painted; five of those are a chart `stroke`. So 20 declarations paint the accent as an opaque
 * colour a reader has to see against a surface, and they divide like this: 14 are a control's own
 * fill or a border in the accent's colour, and those 14 sit in 11 rules because three rules set
 * `background` and `border-color` together, which is the number the old sentence gave. Five more
 * are drawn around or under something rather than as a control's own fill, and reading each one
 * rather than grouping it by file: three are `outline`s (the focused grid row in `blocks.css`, the
 * block cursor band and the block being dragged in `p/[slug]`), one is the `lines` legend's own
 * key line, a 2px rule 14px wide in `blocks-charts.css` and not an axis, and one is the palette row
 * head's underline on `:focus-within`. All five are borders of the accent's own colour on any plain
 * reading of the words. The twentieth is `accent-color: var(--accent)` on the forecast range, a
 * fill the browser paints, and it was on the wrong side of the count: it is the one site that can
 * carry no border of ours at all, which makes it the case check R exists for.
 * Every direction the number moves is the safe one, so the argument for the floor was stronger
 * than the sentence making it.
 *
 * SO FOUR OF THEM CAME UP THE LIGHTNESS AXIS AND NOTHING ELSE MOVED. Same hue, same chroma, the
 * least L that clears 3.15:1 at its worst: Moss 0.490 to 0.550 (#41815F), Ink blue 0.448 to
 * 0.562 (#3C72CE), Plum 0.485 to 0.577 (#A75996), Teal 0.487 to 0.551 (#2B7F8A). Ochre was already inside and is untouched. The band that
 * clears 3:1 against a near-black at L 0.244 and a near-white at L 0.999 at the same time is
 * narrow and centred near L 0.57, which is where the house accent sits at 3.04 and why a
 * suggestion falling out of it is arithmetic rather than taste.
 *
 * THEY LIVE HERE BECAUSE COLOUR LITERALS LIVE HERE. A component may name only the semantic layer,
 * and a gate greps for it: the moment a swatch list is written in a settings screen it is a second
 * place the product's colours are decided.
 */
/**
 * The suggested accents — suggestions, not the set: any colour that clears the floors goes in.
 *
 * **BRICK WAS THE HOUSE COLOUR.** `ACCENTS[0]` was `#CF413A` and so is `BRAND_RED`, so the row
 * offered seven choices of which two were one choice, at opposite ends, with two different toasts —
 * and pressing Brick moved the tick, wrote the cookie, built a stylesheet and announced *"Brick is
 * this record's colour"* over **zero pixels of difference**: a diff of 25 palette tokens across a
 * register found every one identical but for hex casing and a leading zero.
 *
 * That is this codebase's signature defect — a control that reports success and changes nothing —
 * on the one screen whose entire subject is visible change. A suggestion that is already the default
 * is not a suggestion; the House control beside them is how you choose it.
 */
export { ACCENTS } from './accents.ts';
