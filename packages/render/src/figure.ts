/**
 * A number written the way a figure the host drew is written.
 *
 * A chart computes figures the host never wrote: the tallest bar, a net, a balance after a slider
 * moved. The renderer cannot know the currency, so it copies the shape of a cell it was given, its
 * symbol or code, its decimals and where the minus goes, and a computed £-2,000 reads `−£2,000.00`
 * beside a host's `−£1,600.00` rather than as a bare `-2000`.
 */

import { MISSING, quantity } from './format.ts';

const MINUS = '−';
const NUM = 'en-u-nu-latn';
const NUMBER = /(?<![\p{L}\p{N}.,])[−-]?\d[\d,]*(?:\.(\d+))?/u;

/** `value` in the shape of `template`: `£34,850.00`, `USD 12.00`, `−£1,600.00`, or a plain number. */
export function figureLike(template: string, value: number): string {
  if (!Number.isFinite(value)) return MISSING;
  const m = NUMBER.exec(template);
  if (!m) return quantity(Math.round(value * 100) / 100, '');
  const decimals = m[1]?.length ?? 0;
  let prefix = template.slice(0, m.index).replace(/[−-]\s*$/u, '').replace(/^\s*[−-]/u, '');
  const suffix = template.slice(m.index + m[0].length);
  const rounded = Math.round(Math.abs(value) * 10 ** decimals) / 10 ** decimals;
  const body = rounded.toLocaleString(NUM, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const minus = value < 0 && rounded !== 0 ? MINUS : '';
  prefix = prefix.trimStart();
  /* A CODE KEEPS ITS PLACE AND THE SIGN FOLLOWS IT, as `money` writes `GBP −1,299.00`; a symbol takes
     the sign in front of it, as `symbolFigure` writes `−£1,299.00`. */
  return /^[A-Z]{3} $/u.test(prefix) ? `${prefix}${minus}${body}${suffix}` : `${minus}${prefix}${body}${suffix}`;
}
