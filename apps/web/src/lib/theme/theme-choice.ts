/**
 * The looks Appearance offers, and the other scheme of the one picked (PGS-A21).
 *
 * `boot` ANSWERS `looks` BESIDE `theme`: the record's own look and one for each add-on that carries a theme, in the
 * order they are listed (`looksOf` in `@braindog/record`). The app's two come first, House and High contrast, so a
 * person sees every look the record holds as one choice, and one press picks. The pick is their `look.theme`
 * (`house`, or a look's id); High contrast stays the `look.contrast` switch it always was.
 *
 * THE PREVIEW DRAWS THE OTHER SCHEME, FROM ITS OWN SOLVED COLOURS. The page itself is the scheme in use; what a person
 * cannot see without switching is the other one, and `boot.theme` already carries both, solved by the same build the
 * install checked. So the preview is never a colour the record would not draw.
 *
 * PURE, AND PLAIN NODE LOADS IT: no import, no `document`. Appearance reads it behind its own lazy chunk.
 */

/** Each scheme's custom properties by name without the `--`, as `Boot.theme` answers them. */
export type Look = { light: Record<string, string>; dark: Record<string, string> };

/** One look Appearance lists. `from` says which kind it is, and `on` marks the one the page is drawn in now. */
export type LookChoice = { id: string; name: string; from: 'house' | 'contrast' | 'own' | 'pack'; on: boolean };

/** The words for the house look, picked on purpose (`LOOK_THEME_HOUSE` in `@braindog/record`). */
export const HOUSE = 'house';
/** High contrast's place in the list. Not a `look.theme` word: pressing it turns `look.contrast` on. */
export const CONTRAST = 'contrast';

/* THE APP'S OWN TWO, in this module's words: the copy modules load with every screen, and these are Appearance's alone. */
export const lookWords = {
  title: 'Look',
  line: 'One press puts the whole app in it, for you.',
  /* A PERSON'S OWN COLOUR IS DRAWN OVER ANY LOOK (`accent.ts`), so the chooser says so rather than seeming not to work. */
  ownOnTop: 'Your own colour below stays on top of it until you pick House there.',
  house: 'House',
  contrast: 'High contrast',
  preview: (scheme: 'light' | 'dark') => (scheme === 'dark' ? 'Your look in dark' : 'Your look in light'),
};

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/* WHAT `boot` SAID THE LOOKS ARE, each kept only when it has the shape `looksOf` answers, so an older host (no field) or
   a stray entry is no look rather than a button with nothing in it. */
function looksIn(boot: unknown): { id: string; name: string; from: 'own' | 'pack' }[] {
  const said = record(boot)?.looks;
  if (!Array.isArray(said)) return [];
  const out: { id: string; name: string; from: 'own' | 'pack' }[] = [];
  for (const one of said) {
    const l = record(one);
    if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || l.name === '' || (l.from !== 'own' && l.from !== 'pack')) continue;
    if (l.id === HOUSE || l.id === CONTRAST || out.some((o) => o.id === l.id)) continue;
    out.push({ id: l.id, name: l.name, from: l.from });
  }
  return out;
}

/** The person's `look.theme` as `boot` answered it on `me.prefs`, or `undefined` when they have not picked one. */
export function pickIn(boot: unknown): string | undefined {
  const pick = record(record(record(boot)?.me)?.prefs)?.['look.theme'];
  return typeof pick === 'string' ? pick : undefined;
}

/**
 * The looks to offer, House and High contrast first, then the record's, with the one drawn now marked.
 *
 * WHICH ONE IS ON FOLLOWS THE RECORD'S OWN RULE (`themeFor`): High contrast when it is on, since it wins over every
 * look; else the pick when it is `house` or a look the record still holds; else the record's own look, else the first
 * of the add-ons', which is the first of `looks` because they arrive in that order; else House.
 */
export function choicesOf(boot: unknown, contrast = false, pick: string | undefined = pickIn(boot)): LookChoice[] {
  const looks = looksIn(boot);
  const drawn = contrast ? CONTRAST : pick === HOUSE ? HOUSE : (looks.find((l) => l.id === pick) ?? looks[0])?.id ?? HOUSE;
  return [
    { id: HOUSE, name: lookWords.house, from: 'house' as const },
    { id: CONTRAST, name: lookWords.contrast, from: 'contrast' as const },
    ...looks,
  ].map((c) => ({ ...c, on: c.id === drawn }));
}

/* THE SAME GUARD AS `draw.ts`'s, held here too because these values go into a `style` attribute: a custom property's
   own shape for the name and a colour code or a whole number of pixels for the value, and anything else is dropped. */
const NAME = /^[a-z][a-z0-9-]{0,31}$/u;
const VALUE = /^(?:#[0-9A-Fa-f]{6}|\d{1,3}px)$/u;

const clean = (scheme: unknown): Record<string, string> | null => {
  const s = record(scheme);
  if (!s) return null;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(s)) if (typeof value === 'string' && NAME.test(name) && VALUE.test(value)) out[name] = value;
  return out;
};

/** The scheme a page in `scheme` is not in. */
export const otherScheme = (scheme: 'light' | 'dark'): 'light' | 'dark' => (scheme === 'dark' ? 'light' : 'dark');

/**
 * The other scheme's solved tokens, for a page drawn in `scheme`: from `boot.theme` when the record answers a look,
 * else from `fallback` (the house's own, or High contrast's), else `null` and there is nothing true to draw.
 */
export function previewOf(boot: unknown, scheme: 'light' | 'dark', fallback: Look | null = null): Record<string, string> | null {
  const other = otherScheme(scheme);
  const theme = record(record(boot)?.theme);
  const said = theme ? clean(theme[other]) : null;
  if (said && Object.keys(said).length > 0) return said;
  return fallback ? clean(fallback[other]) : null;
}

/** The tokens as a `style` attribute: `--name: value` each, in the order given. */
export const styleOf = (tokens: Record<string, string> | null): string =>
  tokens === null ? '' : Object.entries(tokens).map(([name, value]) => `--${name}: ${value};`).join(' ');
