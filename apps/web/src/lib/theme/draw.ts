/**
 * The record's installed look, drawn on the page (`28 §5`).
 *
 * `boot` ANSWERS `theme`: each scheme's custom properties, solved by `@braindog/theme` from the record's installed
 * `theme` declaration, the same build the install checked (`packages/record/src/theme-check.ts`). This module turns that
 * answer into ONE CONSTRUCTED STYLESHEET in `@layer theme`, adopted after the generated house sheet, so:
 *
 * - NOTHING IS PARSED FROM MARKUP AND NOTHING IS REBUILT. The house sheet is in the page at first paint, and the record's
 *   own arrives with the first `boot` answer and wins by being later in the same layer.
 * - `@layer a11y` STILL WINS, because it is a later layer than `theme` whatever order the sheets arrive in.
 * - A READER WHO ASKED FOR MORE CONTRAST KEEPS THE HOUSE'S HIGH-CONTRAST PALETTE. Every rule here is held off
 *   `data-theme='hc'` and off `prefers-contrast: more`: a record's look is a brand, and a brand may not take away the
 *   palette a reader needs to read at all.
 * - A PERSON'S OWN ACCENT STILL WINS FOR THEM. `accent.ts` appends its sheet to the end of the adopted list, and
 *   this one is put at the front, so the accent a person picked in Settings is the later of the two.
 * - UNINSTALLING RETURNS THE HOUSE LOOK: `null` empties the sheet.
 *
 * PLAIN NODE LOADS THIS FILE (the pure half is tested without a browser), so it imports only relative `.ts` files, and
 * every touch of `document` is behind `adoptable()`.
 */

import * as pref from '../pref.ts';
import { follow } from './follow.ts';

/** `Boot.theme` as the record answers it. */
export type Look = { light: Record<string, string>; dark: Record<string, string> };

/**
 * WHAT A NAME AND A VALUE MAY BE, CHECKED AGAIN HERE ALTHOUGH THE RECORD CHECKED THEM. The text goes straight into a
 * stylesheet, and a value carrying a `;` or a `}` would be a rule of its own. So a name is a custom property's own
 * shape and a value is a colour code or a whole number of pixels, which is everything the record sends, and anything
 * else is dropped rather than escaped.
 */
const NAME = /^[a-z][a-z0-9-]{0,31}$/u;
const VALUE = /^(?:#[0-9A-Fa-f]{6}|\d{1,3}px)$/u;

/** Whether an answer's `theme` is a look this module can draw, and the look when it is. */
export function lookOf(boot: unknown): Look | null {
  const said = boot !== null && typeof boot === 'object' ? (boot as { theme?: unknown }).theme : undefined;
  if (said === null || typeof said !== 'object') return null;
  const { light, dark } = said as { light?: unknown; dark?: unknown };
  const clean = (scheme: unknown): Record<string, string> | null => {
    if (scheme === null || typeof scheme !== 'object' || Array.isArray(scheme)) return null;
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(scheme)) if (typeof value === 'string' && NAME.test(name) && VALUE.test(value)) out[name] = value;
    return out;
  };
  const l = clean(light);
  const d = clean(dark);
  return l && d ? { light: l, dark: d } : null;
}

/**
 * The row height is the one property a person also sets for themselves, and theirs wins.
 *
 * `data-density` is written on every load (`app.html`), so no selector can tell a person who chose Comfortable from one
 * who chose nothing. The preference can: `row-h` is drawn only while the person has not picked a density (here or on
 * the record, whose word `follow` writes into the cookie), and `redraw` runs when they do.
 */
const ROW = 'row-h';

const decls = (scheme: Record<string, string>, indent: string, withRow: boolean): string =>
  Object.entries(scheme)
    .filter(([name]) => withRow || name !== ROW)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join('\n');

/**
 * The stylesheet a look is drawn by: the light scheme as the base, the dark swap for a reader who chose nothing, and the
 * two explicit choices, in `toCSS`'s own order so the two sheets read alike.
 */
export function lookCSS(look: Look, withRow = true): string {
  const off = ":not([data-theme='hc'])";
  const block = (selector: string, scheme: Record<string, string>, indent: string): string =>
    [`${indent}${selector} {`, decls(scheme, `${indent}  `, withRow), `${indent}}`].join('\n');
  return [
    '@layer theme {',
    '  @media not all and (prefers-contrast: more) {',
    block(`html${off}`, look.light, '    '),
    '    @media (prefers-color-scheme: dark) {',
    block(`html${off}:not([data-scheme])`, look.dark, '      '),
    '    }',
    block(`html${off}[data-scheme='light']`, look.light, '    '),
    block(`html${off}[data-scheme='dark']`, look.dark, '    '),
    '  }',
    '}',
    '',
  ].join('\n');
}

let sheet: CSSStyleSheet | null = null;
let current: Look | null = null;

const adoptable = (): boolean =>
  typeof document !== 'undefined' && 'adoptedStyleSheets' in document && typeof CSSStyleSheet !== 'undefined';

/**
 * Draw a look, or put the house look back with `null`.
 *
 * TAKES THE `boot` ANSWER WHOLE, so the one caller (the root layout's load) hands over what it has and this module
 * decides what in it is a look. A host older than the field answers without `theme`, which is the house look.
 */
export function draw(boot: unknown): void {
  /* THE PERSON'S OWN LOOK FIRST, from the same answer: their density decides whether the record's row height is drawn. */
  follow(boot);
  current = lookOf(boot);
  paint();
}

/** Draw the kept look again: after a person picks a density, whose row height then wins. */
export function redraw(): void {
  paint();
}

/** The look the page is in now, for the editor to start from; `null` is the house look. */
export const drawn = (): Look | null => current;

/** Draw a look the editor just saved, without waiting for the next `boot`. */
export function drawSaved(look: Look | null): void {
  current = look;
  paint();
}

/**
 * THE DENSITY A LOOK SAVES IS THE READER'S WHOLE DENSITY, for somebody who has not picked their own: it moved the row height and
 * nothing else, so a Compact look left every card, gap and margin at Comfortable. `data-density` is the one switch
 * for the scale (`style.css`), so this sets that, and keeps it for the next first paint. By the height the look draws, as
 * `densityOf` in `look.ts` reads it; written out here so the editor's module stays out of what every screen loads.
 */
function followDensity(): void {
  if (typeof document === 'undefined') return;
  const held = pref.read();
  if (held.density !== undefined) return;
  const row = current ? Number.parseFloat(current.light[ROW] ?? '') : Number.NaN;
  const said = row < 40 ? 'compact' : row > 48 ? 'roomy' : undefined;
  document.documentElement.setAttribute('data-density', said ?? 'comfortable');
  if (held.lookDensity !== said) pref.write({ lookDensity: said });
}

function paint(): void {
  followDensity();
  if (!adoptable()) return;
  if (current === null) {
    if (sheet) sheet.replaceSync('');
    return;
  }
  sheet ??= new CSSStyleSheet();
  sheet.replaceSync(lookCSS(current, pref.read().density === undefined));
  /* AT THE FRONT, so an accent sheet `accent.ts` adopted before this one arrived stays after it and keeps winning. */
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [sheet, ...document.adoptedStyleSheets];
}
