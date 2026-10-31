/**
 * A number written the way a figure the host drew is written.
 *
 * A chart computes figures the host never wrote: the tallest bar, a net, a balance after a slider
 * moved. The renderer cannot know the currency, so it copies the shape of a cell it was given, its
 * symbol or code, its decimals and where the minus goes, and a computed £-2,000 reads `−£2,000.00`
 * beside a host's `−£1,600.00` rather than as a bare `-2000`.
 */

import { MISSING, exponentOf, money, quantity, type Home } from './format.ts';
import { currencyOfFigure, readAmount, writeAmount, type AmountSetting } from './money.ts';

const MINUS = '−';
const NUM = 'en-u-nu-latn';
const NUMBER = /(?<![\p{L}\p{N}.,])[−-]?\d[\d,]*(?:\.(\d+))?/u;

/**
 * `value` in the shape of `template`: `£34,850.00`, `USD 12.00`, `−£1,600.00`, or a plain number.
 *
 * A STORED FIGURE IS NOT COPIED, IT IS READ. When the template is one `money()` wrote, `EGP 1,299.00`,
 * only its currency is taken (`readFigure`) and the value is written as an amount in it. Told the home currency
 * (a code, or `null` for a record with none), by the one writer, in the setting asked for. Not told, in the stored
 * form again, so whoever draws it next (`axisFigure`, `headlineFigure`) reads an amount and never a drawing.
 * A template that is a drawing or a plain number keeps the path below.
 */
export function figureLike(template: string, value: number, home?: Home, setting: AmountSetting = 'exact'): string {
  if (!Number.isFinite(value)) return MISSING;
  /* TOLD THE HOME, A TEMPLATE THE HOST DREW FIRST (`$3.63 USD`) STILL NAMES ITS CURRENCY (`readFigure`), so the value is
     the writer's too. Not told, only the stored form is read, as it always was: a drawing keeps the path below, which
     copies its shape, since nobody draws this figure again. */
  /* AND A SIGN ALONE NAMES IT (`currencyOfFigure`): "$1,950", as the writer draws another currency, copied as a shape. */
  const currency = home === undefined ? readAmount(template.trim())?.currency : currencyOfFigure(template, home);
  if (currency) {
    /* Half a minor unit rounds away from nought, on either side of it, as the path below always did. */
    const minor = Math.sign(value) * Math.round(Math.abs(value) * 10 ** exponentOf(currency));
    if (home === undefined) return money(minor, currency);
    /* WHOLE WHERE THE PAGE WROTE IT WHOLE (audit 31 Oct o, AO11): read by its sign alone, "£2,400" was written again as
       "£2,400.00", and a category's total "£18,604.78" stood under the page's "£18,605 out". A template with no pence
       is the page's rule for its whole amounts, so the value is rounded to the whole unit and written without them. */
    if (wholeShape(template)) return writeAmount({ minor: wholeMinor(minor, currency), currency }, home, setting === 'exact' ? 'read' : setting)?.text ?? MISSING;
    return writeAmount({ minor, currency }, home, setting)?.text ?? MISSING;
  }
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

/** Whether a figure was written with no fraction ("£2,400", "EGP 1,299"), the shape a page uses for its whole amounts. */
export function wholeShape(template: string): boolean {
  const m = NUMBER.exec(template);
  return m !== null && m[1] === undefined;
}

/** Minor units rounded to the whole unit of `currency`, half away from nought. */
export function wholeMinor(minor: number, currency: string): number {
  const unit = 10 ** exponentOf(currency);
  return Math.sign(minor) * Math.round(Math.abs(minor) / unit) * unit;
}
