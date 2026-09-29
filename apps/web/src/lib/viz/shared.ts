/**
 * What every chart in `lib/viz` shares: its tones, how it writes a number, how wide a label is, and
 * how a list reads aloud.
 *
 * PURE, AND NO SVELTE, so the geometry modules beside it (and their tests under `node --test`) can
 * use it without a component in sight.
 *
 * A TONE IS A NAME OR A PROJECT'S OWN COLOUR (SYSTEM §2, §7). The names are the chart ramp (`ink`,
 * then the greys `g1` to `g4`, darkest first) and the four meanings (`danger` for late or needs him,
 * `earn` for money in, `warn` for waiting, `live` for running). Anything else is taken as a colour
 * the record holds (a project's `colour`) and is set inline as `--c`, which is the one way a colour
 * the theme does not own reaches a chart. `viz.css` turns a name into a token; a component never
 * writes a colour.
 */

export const NAMED_TONES = ['ink', 'g1', 'g2', 'g3', 'g4', 'danger', 'earn', 'warn', 'live'] as const;

export type NamedTone = (typeof NAMED_TONES)[number];

/** A named tone, or any other string, which is a project's own colour. */
export type Tone = NamedTone | (string & {});

/** The chart ramp, darkest first: one series in ink, the rest in greys (SYSTEM §2). */
export const RAMP = ['ink', 'g1', 'g2', 'g3', 'g4'] as const satisfies readonly NamedTone[];

/**
 * How a mark is painted: `tone` goes on `data-tone`, and `colour`, when there is one, on `--c`.
 * `own` is a project colour, which only the inline `--c` carries.
 */
export interface Paint {
  tone: NamedTone | 'own';
  colour: string | undefined;
}

export function paint(tone: Tone | undefined, fallback: NamedTone): Paint {
  if (tone === undefined || tone.trim() === '') return { tone: fallback, colour: undefined };
  if ((NAMED_TONES as readonly string[]).includes(tone)) return { tone: tone as NamedTone, colour: undefined };
  return { tone: 'own', colour: tone };
}

/** The ramp step for the i-th series, so parts with no tone of their own step down the greys. */
export const rampAt = (i: number): NamedTone => RAMP[Math.min(Math.max(Math.trunc(i), 0), RAMP.length - 1)] ?? 'g4';

/** Is this a grey step (or nothing)? A label beside a grey mark stays quiet; beside a highlight it is ink. */
export const isQuiet = (tone: Tone | undefined): boolean =>
  tone === undefined || tone === 'g1' || tone === 'g2' || tone === 'g3' || tone === 'g4';

const GROUPED = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** A figure grouped the way a person writes it, "9,800". Callers with money pass their own `format`. */
export const figure = (n: number): string => (Number.isFinite(n) ? GROUPED.format(n).replace('-', '−') : '');

/** Two decimals is all an SVG attribute needs; more is bytes and diff noise. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * About how wide a label is at a given size, in px. Geist's figures and lower case average a little
 * over half an em; this errs wide so a gutter never clips. A chart reserves space by it; it never
 * cuts a word by it.
 */
export function textWidth(text: string, size = 12): number {
  let em = 0;
  for (const ch of text) em += /[\s.,:;'|!ijlt]/.test(ch) ? 0.3 : /[A-Z0-9mw£$€%]/.test(ch) ? 0.64 : 0.55;
  return Math.ceil(em * size);
}

const LIST = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

/** "a, b and c", the way a sentence joins things. */
export const listed = (parts: readonly string[]): string => LIST.format(parts);

/** The subject and the reading, as one sentence: "acme.example takings a day, from 138 to 96". */
export function sentence(subject: string | undefined, reading: string): string {
  const s = subject?.trim();
  if (s) return reading ? `${s}, ${reading}` : s;
  return reading.charAt(0).toUpperCase() + reading.slice(1);
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
