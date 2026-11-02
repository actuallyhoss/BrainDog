/**
 * How a value is drawn. Formatting is decided FOR the author, not by them: money as money, a rate
 * as a level, a status with its glyph, a day as a day (05 §7.1). A figure formatted differently in
 * two places is two figures as far as a reader is concerned.
 *
 * Numbers group in `en` — `,` for thousands, `.` for the decimal — the minus is U+2212, and there
 * is no locale option at stage 0 (36 §13 D2). Latin digits are pinned for every figure, because
 * Eastern Arabic digits break tabular alignment: prose may use the locale's digits, a ledger may not.
 */

import { amountsIn, writeFigure, type AmountSetting, type WrittenAmount } from './money.ts';

const MINUS = '−';
const NUM = 'en-u-nu-latn';

/**
 * THE HOME CURRENCY, AS THE OLD NAMES BELOW ARE TOLD IT. `symbolFigure`, `headlineFigure`, `barFigure`,
 * `axisFigure` and `leadingCode` each wrote an amount their own way, from text, with a sign table of their own. Told
 * the record's home currency (a code, or `null` for a record that has none) each is one call of the one writer in
 * `money.ts`: the figure is read once (`readFigure`) and written once (`writeAmount`), by the one table there. So a
 * currency that is not the home one reads the same in a cell, on a tile, on a bar and in a sentence: `$3.63 USD`.
 *
 * NOT TOLD (`undefined`), each keeps the path it had, because a caller that does not know the home currency cannot
 * be given the rule. That path writes the unambiguous symbol (`US$3.63`), which is a second spelling, so it is only
 * for a host that draws nothing else of the record; it goes when the last host passes `home`. Text that is not one
 * whole figure, a compact drawing, a sign with no code or a bare number, keeps that path too: it is never read as one.
 */
export type Home = string | null | undefined;

/** A figure as the one writer writes it, or `null` when the home is not told or the text is not one whole figure. */
function writtenOnce(text: string, home: Home, setting: AmountSetting): WrittenAmount | null {
  if (home === undefined) return null;
  /* ONE READER FOR THE THREE WAYS A HOST HANDS A FIGURE ON: stored (`USD 3.63`), stored before figures were grouped
     (`USD 4012.46`), and drawn first with its code after (`$3.63 USD`). The last two fell to the path below and came
     out `US$4,012.46` beside a cell's `$3.63 USD`: two spellings of one currency on one record. */
  return writeFigure(text, home, setting);
}

/**
 * Currencies whose minor unit is not two decimal places. Money is ALWAYS an integer in minor units.
 *
 * THE TWO EXPONENT-4 CODES WERE MISSING, and the failure is a hundredfold. `CLF` (Chile's unidad de
 * fomento) and `UYW` (Uruguay's indexed unit) are the only ISO 4217 codes with four decimal places;
 * without a row here `exponentOf` fell to its `?? 2` and `money(1_000_000, 'CLF')` printed
 * `CLF 10,000.00` where the amount is `CLF 100.0000`.
 *
 * The drift test that should have caught it named `CLF` explicitly and passed: it asserted
 * `exponentOf(code) === drawn(code)` over `[...Object.keys(EXPONENT), … 'CLF' …]`, both sides
 * returned 2, and agreement between two wrong answers is agreement. It is checked against `Intl`
 * now, which is the authority `36 §5.6` rule 2 names.
 */
/* EXPORTED so the kernel's drift check can compare KEY SETS and not just the codes somebody
   remembered to list. It enumerated its own keys, which made it blind by construction to a code
   this table has and the kernel's does not — the direction a currency table actually drifts. */
export const EXPONENT: Readonly<Record<string, number>> = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

export const exponentOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

/**
 * Code first, then the amount. `{{money:129900 EGP}}` is `EGP 1,299.00`; `{{money:1299 JPY}}` is
 * `JPY 1,299`. A negative amount reads `EGP −1,299.00` with a real minus sign, not a hyphen.
 *
 * BY THE DIGITS, NEVER BY DIVISION. It divided by a power of ten and printed the float, and a float
 * holds sixteen digits: `{{money:900719925474099312 JPY}}` drew `JPY 900,719,925,474,099,300`, the
 * last digits made up by the arithmetic, on a figure somebody reconciles against a statement. The
 * amount is a run of digits now (a whole number, a `bigint` or a string of them), the point is
 * placed by slicing it and the groups of three are counted off it, so every digit it is handed is a
 * digit it prints. A number already past 2^53 has lost its digits before it arrives; the typed value
 * hands the author's digits over as a string, so that one never does.
 */
export function money(minor: number | bigint | string, currency: string): string {
  /* AN INTEGER, OR IT IS NOT MONEY. `02 §3`: money is always an integer in minor units. A float
     arrived here and was silently rounded to a penny — `money(0.5, 'USD')` drew `USD 0.01` — which
     is the one class of defect that makes somebody act on a false number, arriving through the
     formatter rather than through the record. `MISSING` is what this module draws for a figure it
     cannot state, and an unstateable figure is what a fractional minor unit is. A string is held to
     the same rule: digits with one leading hyphen, or nothing. */
  let text: string;
  if (typeof minor === 'bigint') text = minor.toString();
  else if (typeof minor === 'number') {
    if (!Number.isInteger(minor)) return MISSING;
    text = BigInt(minor).toString();
  } else {
    if (!/^-?\d+$/.test(minor)) return MISSING;
    text = minor;
  }
  const negative = text.startsWith('-');
  const exp = exponentOf(currency);
  const digits = (negative ? text.slice(1) : text).replace(/^0+/, '').padStart(exp + 1, '0');
  const whole = digits.slice(0, digits.length - exp);
  /* COUNTED OFF, NOT LOOKED AHEAD. `\B(?=(\d{3})+$)` rescans the rest of the digits at every one of
     them, so an author's fifty thousand digits held the page for a second; this is one pass. */
  const head = whole.length % 3 || 3;
  const groups = [whole.slice(0, head)];
  for (let i = head; i < whole.length; i += 3) groups.push(whole.slice(i, i + 3));
  const grouped = groups.join(',');
  const body = exp === 0 ? grouped : `${grouped}.${digits.slice(digits.length - exp)}`;
  /* NOUGHT HAS NO SIGN. `-0` is a string a person can type and a value `Math.abs` used to fold away;
     `EGP −0.00` would be a debt of nothing. */
  const zero = /^[0.,]+$/.test(body);
  return `${currency.toUpperCase()} ${negative && !zero ? MINUS : ''}${body}`;
}

/**
 * The currency code at the front of a figure `money` wrote, split from the amount after it.
 *
 * A DRAWING DECISION, NOT A FORMAT. The text stays `GBP 28,320.00`, code first and always present,
 * because money is never a bare number. What a screen may do is set the code quieter than the figure,
 * the way `Money` in the app already does beside a row's amount, and it needs one rule for "this
 * starts with a code" rather than a regex in every component. Three capitals, one space, then a
 * digit or a minus: anything else is not a figure this module wrote, and comes back `null`.
 */
export function leadingCode(
  text: string,
  home?: Home,
  setting: AmountSetting = 'exact',
): { currency: string; rest: string; sign: string; place?: WrittenAmount['codePlace']; text?: string } | null {
  /* TOLD THE HOME CURRENCY, THE PARTS ARE THE WRITER'S. `place` says where the code stands, and it is `null` with an
     empty `currency` when the figure's sign says the currency. `sign` is the minus in front of everything, and
     `rest` is the figure with its currency sign: the three, set in their place, are `text` and nothing more. */
  const w = writtenOnce(text, home, setting);
  if (w) {
    const figure = `${w.whole}${w.fraction}`;
    return { currency: w.code, rest: w.codePlace === 'before' ? figure : `${w.sign}${figure}`, sign: w.minus, place: w.codePlace, text: w.text };
  }
  /* A SIGN WRITTEN IN FRONT OF THE CODE IS PART OF THE FIGURE. A page may mark an amount as money in or money out
     ("+GBP 850.00"), and read as not a figure at all the whole cell stayed in the code’s spelling, in a column of symbols. */
  const m = /^([+\u2212-]?)([A-Z]{3})[ \u00a0](?=[\u2212\-\d])/u.exec(text);
  return m ? { currency: m[2]!, rest: text.slice(m[0].length), sign: m[1] ?? '' } : null;
}

/**
 * A figure `money` wrote, as a person writes it: `GBP 28,320.00` drawn `£28,320.00`.
 *
 * DISPLAY ONLY. `money` still writes the code first and everything that reads figures back out of
 * text reads that; this is what a screen sets in its place. The symbol is the one British English
 * gives with `currencyDisplay: 'symbol'`, which is unambiguous by design (`US$`, `A$`, `CA$`), so
 * two currencies in one column never look alike. A currency with no symbol of its own (`EGP`, `CHF`)
 * comes back `null`, and the caller keeps drawing its code.
 */
export function symbolFigure(text: string, home?: Home): string | null {
  const w = writtenOnce(text, home, 'exact');
  if (w) return w.text;
  const coded = leadingCode(text);
  if (!coded) return null;
  const symbol = symbolOf(coded.currency);
  if (symbol === null) return null;
  const minus = /^[\u2212-]/u.exec(coded.rest)?.[0] ?? '';
  return `${coded.sign}${minus}${symbol}${coded.rest.slice(minus.length)}`;
}

/**
 * The symbol English writes a currency with among others (`\u00a3`, `$`, `CA$`), or `null` for one it writes by its code
 * (`EGP`). THE WRITER'S OWN SIGN (`money.ts`, AM15): British English's `US$` drew one payout "+US$1,950" in a table
 * while every other screen said "$1,950".
 */
function symbolOf(currency: string): string | null {
  try {
    const symbol = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'symbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value;
    return symbol && symbol.toUpperCase() !== currency ? symbol : null;
  } catch {
    return null;
  }
}

/**
 * HOW LONG A FIGURE IS, WHEN IT IS LONGER THAN A TILE HOLDS, so a stat steps it down inside its own cell rather than running
 * into the next one (the host's stylesheet reads `--chars`). An amount never breaks inside itself and several amounts break
 * between their ` · ` (a no-break space before the dot, so a line never starts with it), so the longest amount, as drawn, is what has to fit. `null` for a figure any tile holds.
 */
export function figureChars(text: string, home?: Home): number | null {
  if (!text) return null;
  const longest = Math.max(...text.split(/\s·\s/u).map((part) => (symbolFigure(part.trim(), home) ?? part.trim()).length));
  return longest > 10 ? longest : null;
}

/** A figure a host drew symbol first with its code after, `−£24,000.00 GBP`, as it stands inside a sentence. */
const SYMBOL_CODED = /(?<![\p{L}\p{N}])[+\u2212-]?[A-Z]{0,2}\p{Sc}[\u2212-]?[\d,]+(?:\.\d+)?[ \u00a0\u202f][A-Z]{3}\b/gu;

/**
 * A sentence with every figure `money` wrote in it drawn the way `symbolFigure` draws one, or, for a `headline` (the
 * page's one line, a tile's note), the way `headlineFigure` does.
 */
export const symbolText = (text: string, headline = false, home?: Home): string => {
  /* Told the home currency, a sentence is the writer's too: every stored amount in it, written once. */
  if (home !== undefined) return amountsIn(text, home, headline ? 'read' : 'exact');
  const coded = text.replace(/\b[A-Z]{3} [\u2212-]?[\d,]+(?:\.\d+)?/gu, (hit) => (headline ? headlineFigure(hit) : (symbolFigure(hit) ?? hit)));
  /* A HEADLINE ALSO SAYS SHORT WHAT A HOST ALREADY DREW, `£24,000.00 GBP` with its code after: `£24,000`. */
  return headline ? coded.replace(SYMBOL_CODED, (hit) => headlineFigure(hit)) : coded;
};

/**
 * ONE MINUS SIGN, in all four of them.
 *
 * `money` and `pct` prepended `MINUS` over `Math.abs`; `integer` and `quantity` returned
 * `toLocaleString` straight, which emits an ASCII hyphen. Measured side by side:
 *
 *   money     "GBP −1,299.00"   U+2212
 *   integer   "-1,299"           U+002D
 *
 * The file's own opening paragraph says *"the minus is U+2212"* and `36 §13 D2` states it for
 * number and money presentation. AND IT IS NOT A TYPOGRAPHIC PREFERENCE HERE: `Money.svelte:22` is
 * `currency ? money(minor, currency) : integer(minor)` and `api.ts`'s `moneyOr` does the same, so a
 * register whose rows do not all carry a currency draws both glyphs down one tabular column — two
 * different widths, in the face chosen so digits line up.
 *
 * `signed()` is the one place the sign is decided, so a fifth formatter cannot get it wrong.
 */
const signed = (value: number, body: (n: number) => string): string =>
  `${value < 0 ? MINUS : ''}${body(Math.abs(value))}`;

/**
 * A FIGURE AND ITS UNIT, AS ONE: a percent, a per mille and a degree hug the figure ("1.8%", "21°"), and every other unit
 * stands a space away ("25 hours"). THE ONE JOIN, SO A PERCENT IS WRITTEN ONE WAY APP-WIDE (leftovers 2 Nov, 6): the
 * Dashboard's Churn read "1.8 %" beside Tidepool's "1.8%".
 */
export const withUnit = (figure: string, unit: string | null | undefined): string => {
  const u = (unit ?? '').trim();
  if (u === '') return figure;
  return /^(?:%|‰|°[CF]?)$/u.test(u) ? `${figure}${u}` : `${figure} ${u}`;
};

export const quantity = (value: number, unit: string): string =>
  withUnit(signed(value, (n) => n.toLocaleString(NUM, { maximumFractionDigits: 3 })), unit);

export const pct = (value: number): string =>
  `${signed(value, (n) => n.toLocaleString(NUM, { maximumFractionDigits: 1 }))}%`;

export const integer = (value: number): string => signed(value, (n) => n.toLocaleString(NUM));

/**
 * A FIGURE READ BACK INTO ITS PARTS, so a chart can say it shorter without losing what it is written in.
 *
 * Every figure this package or its host hands a chart has one of these shapes: `GBP −1,299.00` (`money`),
 * `−£1,299.00` (`symbolFigure`), `+£850.00`, `$4,800.00 USD`, or a bare `11200`. The unit in front is a
 * code and a space, or a currency sign with at most two capitals before it (`£`, `US$`, `CA$`), so a word
 * with a number in it (`Q3`) is not read as money. A sign written both before and after the unit is not a
 * figure anybody wrote on purpose, and is left alone. A hyphen is read as the minus it stands for.
 *
 * THE CODE AFTER A FIGURE MAY HANG ON A NO-BREAK SPACE. The web's money drawer writes `£24,000.00` and its code with
 * U+00A0 between them, so a line of amounts never breaks inside one, and the plain space this pattern asked for read
 * every such figure as no figure at all: the forecast's axis said `£31,035.00 GBP` in full and a tile kept its `.00`.
 */
const FIGURE_PARTS = /^([+−-]?)([A-Z]{3}[ \u00a0]|[A-Z]{0,2}\p{Sc})?([−-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([ \u00a0\u202f][A-Z]{3})?$/u;

type FigureParts = { sign: string; unit: string; inner: string; whole: string; minor: string; code: string };

/**
 * Whether three capitals are a currency anybody pays in. A CODE AFTER A FIGURE IS ONLY ONE WHEN IT IS A CURRENCY:
 * "Top up £200 ISA" and "Pay the £120 EDF bill" end in three capitals too, and read as a code they were said
 * `ISA 200` and `EDF 120`. A runtime that cannot list its currencies takes every three capitals, as before.
 */
let currencies: ReadonlySet<string> | null | undefined;
const isCurrency = (code: string): boolean => {
  if (currencies === undefined) {
    try {
      currencies = new Set(Intl.supportedValuesOf('currency'));
    } catch {
      currencies = null;
    }
  }
  return currencies === null || currencies.has(code);
};

function figureParts(text: string): FigureParts | null {
  const m = FIGURE_PARTS.exec(text.trim());
  if (!m || (m[1] && m[3]) || (m[6] && !isCurrency(m[6].trim()))) return null;
  const minus = (s: string | undefined): string => (s === '-' ? MINUS : (s ?? ''));
  return { sign: minus(m[1]), unit: m[2] ?? '', inner: minus(m[3]), whole: m[4]!.replaceAll(',', ''), minor: m[5] ?? '', code: m[6] ?? '' };
}

/**
 * WHETHER A CELL IS AN AMOUNT OF NOTHING: one figure in a currency, every digit of it zero (`−GBP 0.00`, `+£0`). `signed`
 * asks only about one written as money moving, with its `+` or `−`. A bare `0` names no currency and is not money.
 */
export function zeroFigure(text: string, signed = false): boolean {
  const p = figureParts(text);
  if (!p || (p.unit === '' && p.code === '')) return false;
  if (signed && p.sign === '' && p.inner === '') return false;
  return /^0+$/u.test(p.whole) && /^0*$/u.test(p.minor);
}

/** Whole digits with a comma every three, by the string and never through a float, so no digit of a large amount moves. */
const grouped = (digits: string): string => digits.replace(/^0+(?=\d)/u, '').replace(/\B(?=(\d{3})+(?!\d))/gu, ',');

/**
 * ONE MARK OF CURRENCY, NEVER TWO, for a chart's short figures: a symbol with its code after it, `$4,800.00 USD`, is
 * said by the code it names, as the unambiguous symbol where there is one (`US$`) and as the code in front where there
 * is not (`EGP `). A figure written one way only keeps its unit as it was.
 */
function oneMark(p: FigureParts): { unit: string; code: string } {
  const code = p.code.trim();
  if (code === '' || p.unit === '' || /^[A-Z]{3}[ \u00a0]$/u.test(p.unit)) return { unit: p.unit, code: p.code };
  return { unit: symbolOf(code) ?? `${code} `, code: '' };
}

/**
 * A BAR'S VALUE, GROUPED: `11200` is drawn `11,200` and `£11,200.00` is drawn `£11,200`.
 *
 * A bar is read against the bars beside it, so a zero minor part is noise down the whole column and is
 * dropped; a minor part that is not zero is part of the amount and stays. The unit, the sign and a code
 * after the figure stay where they were written. Text that is not one figure comes back unchanged: a
 * bar's value cell is the author's, and a sentence in it is not this function's to rewrite. A symbol with its code
 * after it is said once (`oneMark`): `$4,800.00 USD` is `US$4,800`.
 */
export function barFigure(text: string, home?: Home): string {
  const w = writtenOnce(text, home, 'read');
  if (w) return w.text;
  const p = figureParts(text);
  if (!p) return text;
  const minor = /^0*$/u.test(p.minor) ? '' : `.${p.minor}`;
  const { unit, code } = oneMark(p);
  return `${p.sign}${unit}${p.inner}${grouped(p.whole)}${minor}${code}`;
}

/**
 * A BAR CHART'S FIGURES, OR A COLUMN'S, AS ONE SET (2.A.7, the money review's S3, changed 1 Nov): each through
 * `barFigure`, then said by the one rule for cents below. A cell that is not one figure is left as it was.
 */
export function barFigures(texts: readonly string[], home?: Home, written = false): string[] {
  /* ONE RULE A SET (polish5, 2 Nov), where it was one rule a figure: Reports' Paid most read "£3,300" over "£389.90" over
     "£5.91", and a Ledger tile "−$2,100" over "−$117.18", two kinds of figure down one column. A SET OF TOTALS (a bar
     chart, a split, a table of months: a summary) is said whole, every figure of it. A SET OF EXACT AMOUNTS (`written`:
     a ledger's lines, a list's rows) is said to the penny where any one of a currency carries pence, every amount of
     that currency then showing its places ("−$2,100.00" over "−$117.18"), and whole where none does. */
  const said = texts.map((t) => barFigure(t, home));
  if (!written) return said.map((t) => (figureParts(t) ? wholeFigure(t) : t));
  const places = new Map<string, number>();
  for (const t of said) {
    const p = figureParts(t);
    if (p && p.minor !== '') places.set(markOf(p), Math.max(places.get(markOf(p)) ?? 0, p.minor.length));
  }
  return said.map((t) => {
    const p = figureParts(t);
    const n = p ? places.get(markOf(p)) : undefined;
    if (!p || n === undefined || p.minor.length >= n) return t;
    return `${p.sign}${p.unit}${p.inner}${grouped(p.whole)}.${p.minor.padEnd(n, '0')}${p.code}`;
  });
}

/** A figure's currency as its marks say it, the digits taken out: `$` and `−$` are one, `EGP ` another. */
const markOf = (p: FigureParts): string => `${p.unit}|${p.code.trim()}`;

/**
 * A FIGURE IN A SET OF TOTALS, WHOLE AT ANY SIZE: "£389.90" is "£390", "£5.91" is "£6". Half a unit rounds away from
 * nought. Text that is not one figure comes back as it was.
 */
export function wholeFigure(text: string): string {
  const p = figureParts(text);
  if (!p || p.minor === '') return text;
  const units = BigInt(p.whole) + (Number(p.minor[0]) >= 5 ? 1n : 0n);
  /* NOUGHT HAS NO SIGN: "−£0.40" is "£0", not "−£0". */
  const signed = units === 0n ? { sign: '', inner: '' } : p;
  return `${signed.sign}${p.unit}${signed.inner}${grouped(units.toString())}${p.code}`;
}

/**
 * A TOTAL AS IT IS SAID: whole from a thousand up ("$17,040" for $17,039.87), to the cent under a thousand where the cents
 * are not nought ("$884.59"), and never ".00". Half a unit rounds away from nought. Text that holds no amount with
 * cents comes back as it was. A single exact amount (a ledger line, a bill) is not a total and keeps its cents.
 */
export function totalSaid(text: string): string {
  return text.replace(/(\d{1,3}(?:,\d{3})*|\d+)\.(\d+)(?!\d)/u, (found: string, whole: string, minor: string) => {
    if (/^0+$/u.test(minor)) return whole;
    const units = Number(whole.replaceAll(',', ''));
    if (units < 1000) return found;
    const up = Number(minor[0]) >= 5 ? 1 : 0;
    return (units + up).toLocaleString('en');
  });
}

/**
 * A FIGURE STANDING ON ITS OWN, AS A HEADLINE SAYS IT: `GBP 33,850.00` is `£33,850`, `EGP 412,300.00` is `EGP 412,300`.
 *
 * A headline is read at a glance, so `.00` under it is width that says nothing a round figure does not; a fraction that
 * is not all zeros is part of the amount and stays (`£33,850.50`). ONE MARK OF CURRENCY, NEVER TWO: a figure written
 * with a symbol and its code after it, `$4,800.00 USD` or `E£43,700.00 EGP`, is said by the code it names, as the
 * unambiguous symbol where there is one (`US$4,800`) and as the code in front where there is not (`EGP 43,700`).
 *
 * DISPLAY ONLY, AND NEVER FOR A LEDGER. `money` still writes every minor unit, and a column of amounts keeps them so
 * its digits line up and none is rounded away. Several amounts joined by ` · ` are each said this way. A figure that
 * names no currency is not money and comes back as written: a bare `2026` may be a year, and grouping it would lie.
 */
export function headlineFigure(text: string, home?: Home): string {
  return text
    .split(/(\s·\s)/u)
    .map((part, i) => (i % 2 === 1 ? part : totalSaid(writtenOnce(part, home, 'read')?.text ?? headlineOne(part))))
    .join('');
}

function headlineOne(text: string): string {
  const p = figureParts(text);
  if (!p) return text;
  const coded = /^[A-Z]{3}[ \u00a0]$/u.test(p.unit) ? p.unit.trim() : '';
  const code = p.code.trim() || coded;
  /* A FIGURE WITH NO CURRENCY IN IT IS NOT ONE THIS FUNCTION SAYS. */
  if (code === '' && p.unit === '') return text;
  const body = `${grouped(p.whole)}${/^0*$/u.test(p.minor) ? '' : `.${p.minor}`}`;
  if (code === '') return `${p.sign}${p.unit}${p.inner}${body}`;
  const plus = p.sign === '+' ? '+' : '';
  const minus = p.sign === MINUS || p.inner === MINUS ? MINUS : '';
  const symbol = symbolOf(code);
  if (symbol !== null) return `${plus}${minus}${symbol}${body}`;
  /* A CODE JOINED BY THE NO-BREAK SPACE IS THE ONE WRITER'S DRAWING (`−EGP 73,615.27`), and it keeps the writer's
     order, the minus in front and the same space: said this path's way it read `EGP −73,615.27` beside itself. */
  return p.unit.endsWith(' ') ? `${plus}${minus}${code} ${body}` : `${plus}${code} ${minus}${body}`;
}

/** An amount in minor units as a headline says it: `headlineMoney(3_385_000, 'GBP')` is `£33,850`. */
export const headlineMoney = (minor: number, currency: string, home?: Home): string => headlineFigure(money(minor, currency), home);

/** The steps a chart's axis counts in. British usage: a thousand is `k`, a million `m`, a billion `bn`. */
const COMPACT = ['', 'k', 'm', 'bn', 'tn'] as const;

/**
 * AN AXIS LABEL, COMPACT: `£31,240.55` is drawn `£31k`, `−£1,600.00` is `−£1.6k`, `GBP 850.40` is
 * `GBP 850`.
 *
 * An axis label says where a scale reaches, not what an amount is, and the amounts themselves are in the
 * chart's numbers beside it. So it keeps one decimal below ten of a step (`£1.6k`) and whole steps above
 * (`£31k`), and it keeps the unit the figure was written in, so an axis in pounds still reads as pounds.
 *
 * THE STEP IS CHOSEN AFTER THE ROUNDING, which is the order `bytes` learned: choosing first would say
 * `999,700` as `1,000k`. Rounded to nothing, the sign goes too, because `−£0` is not a reading anybody
 * wants. Text that is not one figure comes back unchanged.
 */
export function axisFigure(text: string, home?: Home): string {
  const w = writtenOnce(text, home, 'axis');
  if (w) return w.text;
  const p = figureParts(text);
  if (!p) return text;
  let n = Number(`${p.whole}.${p.minor || '0'}`);
  let i = 0;
  const { unit, code } = oneMark(p);
  for (;;) {
    const said = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
    if (said < 1_000 || i === COMPACT.length - 1) {
      const body = `${said.toLocaleString(NUM, { maximumFractionDigits: 1 })}${COMPACT[i] ?? ''}`;
      return said === 0 ? `${unit}${body}${code}` : `${p.sign}${unit}${p.inner}${body}${code}`;
    }
    n /= 1_000;
    i += 1;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Measured at noon UTC of the day named, so a timezone cannot move a due date by one (36 §13 D15).
 *
 * THE SHAPE IS NOT THE CHECK. `Date.UTC` normalises rather than refusing, so `2026-02-30` matched
 * the pattern, rolled forward and rendered "2 Mar 2026" — a date that is not the one in the record
 * and not marked as anything, on a field somebody diaries against. The round trip is the check: a
 * day that does not come back out as the day that went in was never a day.
 */
function noon(iso: string): number | null {
  const m = DAY.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d, 12);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/**
 * The number inside a formatted cell, for the one thing that has to read a string it just wrote:
 * the length of a bar.
 *
 * `String(cell).replace(/[^\d.-]/g, '')` was the version here and in the Svelte primitive, and it
 * threw the sign away, because `money()` writes a real minus (U+2212) and a hyphen is what that
 * class keeps. `GBP −1,299.00` came back as 1299 and drew a bar the length of the same amount owed
 * the other way. A magnitude that reads its own output has to read the WHOLE of it.
 *
 * NaN for a cell with no number in it, never 0: a bar at zero claims the value is zero.
 *
 * AND A NUMBER IS A NUMBER, NOT A RUN OF DIGITS INSIDE A WORD. The pattern had no left edge, so it
 * took the first digits anywhere in the cell and `Q3 −1,299.00` measured as 3: the `3` of the
 * quarter, with the amount and its sign never reached. That is not a rounding error, it is the
 * wrong figure and the wrong side of zero. Rendered through `bar` it put a credit of 1,299 at the
 * top of the chart at full length and shrank the one row that was actually owed to two thirds of
 * it, every selector correct and every bar a lie. The lookbehind is the whole fix: a digit glued to
 * a letter, to another digit, to a decimal point or to a hyphen is part of that word and is not the
 * number this cell states. A cell whose only digits are inside a word therefore has no magnitude,
 * which is `NaN`, which is a row that keeps its words and loses its bar.
 */
const NUMBER = /(?<![\p{L}\p{N}.,-])-?\d[\d,]*(?:\.\d+)?/u;

/**
 * A SIGN WRITTEN BEFORE THE CURRENCY IS THE NUMBER'S SIGN. `money()` says a debt as "−EGP 272,371.46" and "−£1,240",
 * the sign ahead of the code or symbol, and the pattern above only reads a sign glued to the digits: the Accounts
 * bars drew an overdrawn card as a full bar of money held. The sign counts when nothing but a currency stands
 * between it and the number.
 */
const SIGN_BEFORE_CURRENCY = /(?<![\p{L}\p{N}])-\s*(?:\p{Sc}|[A-Z]{3})\s*$/u;

export function magnitudeOf(cell: string): number {
  const s = cell.replaceAll(MINUS, '-');
  const m = NUMBER.exec(s);
  if (!m) return NaN;
  const n = Number(m[0].replaceAll(',', ''));
  return n > 0 && SIGN_BEFORE_CURRENCY.test(s.slice(0, m.index)) ? -n : n;
}

/**
 * A MONTH'S SHORT NAME FROM ONE TABLE, "Sep" and never the "Sept" that `toLocaleString('en-GB')` writes (P16): cards and
 * Kiln said "3 Sept" where every other screen said "7 Sep". `m` counts from 0.
 */
export const monthShort = (m: number): string => MONTHS[m] ?? '';

/** A day with no year, "3 Sep", as a card or a step says it. The day as written where it is not one. */
export function dayShort(iso: string): string {
  const t = noon(iso);
  if (t === null) return iso;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function day(iso: string): string {
  const t = noon(iso);
  if (t === null) return iso;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * THE ONE WAY A DAY IS SAID TO A PERSON: "4 Sep" in the reader's year, "4 Sep 2025" in any other. The Board said
 * "30 Aug 2026" beside a list that said "4 Sep", and a person's page said "Seen in 2026-08-28": three spellings of a
 * day on three screens. A day this cannot read comes back as it came, as `day()` does. An instant is said by its day.
 */
export function dateSaid(iso: string, now: number = Date.now()): string {
  const d = iso.slice(0, 10);
  const t = noon(d);
  if (t === null) return iso;
  return d.slice(0, 4) === String(new Date(now).getFullYear()) ? dayShort(d) : day(d);
}

/** A day left in a sentence as the record keeps it ("renews 2026-09-10") said as a person says it ("renews 10 Sep"). */
export const datesIn = (text: string, now: number = Date.now()): string =>
  text.replace(/(?<![\d-])(\d{4}-\d{2}-\d{2})(?![\dT:-])/gu, (d) => dateSaid(d, now));

/**
 * The moment, to the minute, for the one screen where a band is not enough.
 *
 * `since()` ANSWERS "HOW LONG AGO" AND THE LEDGER IS ASKED "WHEN". Its bands are what a person
 * actually holds - nobody plans around "in 47 days" - and past a day they are deliberately coarse,
 * so two events the same afternoon both read `3d ago`. That is right on a row about an invoice and
 * wrong on the audit log, which the restore screen sends somebody to with the words "find the
 * moment", and which a person reads to say which change they mean out loud.
 *
 * UTC, ON PURPOSE, THOUGH THE READER'S ZONE IS KNOWN NOW. `relative()` and `since()` count the
 * reader's own day, because "today" and "in 1d" are about where the reader is. This is not:
 * the ledger stores an instant, and the moment it names is the one number on that screen that has to
 * read the same for two people looking at it from different places, so one of them can say it to the
 * other. `day()` above it is UTC for its own reason, a named day held at noon.
 */
export function stamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, '0');
  /* THE DAY PART, BECAUSE `day()` TAKES A DAY. Its `noon()` matches `^YYYY-MM-DD$` anchored and
     hands back its argument unchanged when it does not, so passing the whole instant printed
     `2026-09-03T09:00:00.000Z, 09:00` on the ledger: the raw stored value, on the screen this
     function was written for, two functions under the paragraph that says a machine timestamp is
     what `since()` exists to stop showing anybody. */
  return `${day(iso.slice(0, 10))}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/**
 * How a number of whole days is said: days to about two weeks, weeks to about two months, months to
 * a year, then years. A band is what a person actually holds — nobody plans around "in 47 days".
 *
 * SHARED, because `since()` needs the same ladder past a day and the alternative is two band tables
 * that drift. `''` for zero days, which the callers turn into their own word.
 */
/**
 * THE LADDER `36 §5.5` PUBLISHES, which this was not.
 *
 * It was a private ladder that happened to be tested: `Nd` cut at 14 rather than 13, months divided
 * by 30 rather than 30.44, years by 365 rather than 365.25, and a **`1.0y`…`1.9y` decimal form that
 * appears in no document at all**. Measured against the published table: **412 of 1,200 day counts
 * disagreed.** `d=14` read `14d` here and `2w` there; `d=60` read `2mo` here and `9w` there;
 * everything from 75 to about 360 days read one month older than specified. Four tests pinned it and
 * every one of them killed its mutant — the ladder was tightly held, and it was the wrong ladder.
 *
 * AND NO BAND SPELLS PAST ITS OWN EDGE, which is the defect `bytes()` was fixed for. The published
 * table had it too, in exactly two places, and the fix belonged in the document rather than here:
 *
 *   · `round(60/7)` is `9w` — sixty-three days — immediately below `round(61/30.44)`, which is
 *     `2mo`, sixty-one. **Non-monotone**: one day older read as two days younger.
 *   · `round(364/30.44)` is `12mo`, a year said the long way, immediately below `1y`.
 *
 * `36 §5.5` is amended with a `min` on each of those two bands and the reasoning beside it, which is
 * what `36 §13` asks for — *"name the document to amend in the same revision"*. An earlier pass
 * capped the bands HERE and amended nothing, which made the code monotone and the specification not:
 * a private ladder that reads better is still a private ladder, and the next reader of the table has
 * no way to know the code disagrees with it.
 *
 * Measured after: 0 of 1,200 disagree, and no non-monotone step.
 */
const band = (n: number): string => {
  if (n === 0) return '';
  if (n <= 13) return `${n}d`;
  if (n <= 60) return `${Math.min(8, Math.round(n / 7))}w`;
  if (n <= 364) return `${Math.min(11, Math.round(n / 30.44))}mo`;
  return `${Math.round(n / 365.25)}y`;
};

/**
 * WHICH CALENDAR DAY A MOMENT FALLS ON, counted from the epoch — the unit both functions band.
 *
 * `relative()` rounded the NOON-OFFSET: `Math.round((noon(day) - now) / 86_400_000)`. With `now` at
 * midday that gives the calendar answer, and it drifts by a whole band the further `now` sits from
 * noon — at midnight, yesterday's date read **"today"**. `since()` rounded ELAPSED time, so a moment
 * 36 hours old was "2d ago" beside a `day` cell for the same afternoon reading "1d ago". Two
 * functions, two units, one table.
 *
 * They count days now, both of them, and a day is a day rather than a distance from lunchtime.
 *
 * AND THE DAY IS THE READER'S, NOT GREENWICH'S. It was counted from midnight UTC, and he reads in
 * Cairo: from midnight to two or three in the morning his "today" was the day before, so a task due
 * that morning read "in 1d" and a deadline passed in the night read "today". The calendar day is
 * found with `Intl.DateTimeFormat` in a zone: the one the caller names (the record's own, for text
 * drawn off the browser), else the browser's own when there is a window, else UTC. A zone `Intl`
 * does not know falls to UTC rather than throwing, because a formatter never stops a page.
 */
const CALENDARS = new Map<string, Intl.DateTimeFormat>();

function calendarIn(zone: string): Intl.DateTimeFormat {
  let found = CALENDARS.get(zone);
  if (found === undefined) {
    try {
      found = new Intl.DateTimeFormat('en-u-nu-latn-ca-gregory', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' });
    } catch {
      found = calendarIn('UTC'); // UTC is a zone every `Intl` knows, so this cannot come back here
    }
    CALENDARS.set(zone, found);
  }
  return found;
}

/** The zone "today" is counted in: the one named, else the browser's own, else UTC. */
export function readerZone(zone?: string): string {
  if (zone) return zone;
  /* `'window' in globalThis` AND NOT `typeof window`: this package is checked without the DOM's types,
     and a worker or a test has no window, so text drawn there counts in UTC unless it names a zone. */
  /* READ ONCE A PAGE: a formatter made on every call to learn it was a hot spot of a cold phone's first draw (speed4). */
  if ('window' in globalThis) return (browserZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  return 'UTC';
}

/** The browser's own zone, once `readerZone` has read it. */
let browserZone: string | undefined;

/**
 * THE ONE DAY AN INSTANT FALLS ON, `YYYY-MM-DD`, in a zone: the record's where the caller holds it, else the reader's
 * (`readerZone`). Every "today" a screen draws is this of its clock, never `toISOString().slice(0, 10)`, which is the
 * day in Greenwich: from midnight to two or three in Cairo it named yesterday, so a task due on the 26th read "today"
 * on Work while Today called it a day late. A zone `Intl` does not know is UTC, as `relative` reads it. `''` for an
 * instant that is not one.
 */
export function dayIn(ms: number, zone?: string): string {
  if (!Number.isFinite(ms)) return '';
  const parts = calendarIn(readerZone(zone)).formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month').padStart(2, '0')}-${part('day').padStart(2, '0')}`;
}

const CLOCKS = new Map<string, Intl.DateTimeFormat>();

/** The wall clock an instant shows in a zone, `HH:MM` on twenty-four hours, read as `dayIn` reads its day. */
export function timeIn(ms: number, zone?: string): string {
  if (!Number.isFinite(ms)) return '';
  const z = readerZone(zone);
  let found = CLOCKS.get(z);
  if (found === undefined) {
    try {
      found = new Intl.DateTimeFormat('en-GB-u-nu-latn', { timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    } catch {
      found = new Intl.DateTimeFormat('en-GB-u-nu-latn', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    }
    CLOCKS.set(z, found);
  }
  const parts = found.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('hour').padStart(2, '0')}:${part('minute').padStart(2, '0')}`;
}

const dayIndex = (ms: number, zone: string): number => {
  /* `formatToParts` throws on an invalid time where `Math.floor` gave NaN; a formatter never throws. */
  if (!Number.isFinite(ms)) return Number.NaN;
  const parts = calendarIn(zone).formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000);
};

export function relative(iso: string, now: number = Date.now(), zone?: string): string {
  const t = noon(iso);
  if (t === null) return iso;
  /* The day named is the day named, held at noon UTC by `noon()`, so its index is read in UTC; only
     "today" belongs to the reader. */
  const days = dayIndex(t, 'UTC') - dayIndex(now, readerZone(zone));
  const size = band(Math.abs(days));
  if (size === '') return 'today';
  return days > 0 ? `in ${size}` : `${size} ago`;
}

/**
 * AN INSTANT, SAID IN THE UNIT IT MATTERS IN — which nothing in this package could do.
 *
 * `relative()` takes a DAY. It is anchored on `/^\d{4}-\d{2}-\d{2}$/` and returns its argument
 * unchanged when the pattern misses, so an instant handed to it rendered as
 * `2026-09-03T11:57:00.000Z` on screen. Every caller in the app had learned to `.slice(0, 10)`
 * first, which hides the miss and throws the time away with it — so a device grant three minutes old
 * and one eleven hours old both read *today*, on the one table whose entire decision is whether ten
 * minutes have passed (`12 §6.1`, `49 §5.9`).
 *
 * BANDED, AND THE BAND TIGHTENS WHERE THE DECISION IS. `relative()`'s argument is that nobody plans
 * around "in 47 days", and the same holds for "44 minutes" — so this rounds to five below the hour.
 * Inside the first quarter of an hour it does NOT round, because that is the window a device grant
 * lives in: ten minutes (`49 §5.9`), and "10 min ago" rounded from twelve is the difference between
 * a request you can still approve and one that is over. A band is a kindness until it is the number
 * somebody is deciding on.
 *
 * Past a day it hands over to `relative()` rather than growing a second set of bands, so one date
 * cannot be said two ways by two functions.
 *
 * A string that is neither an instant nor a day comes back unchanged. That is `relative()`'s own
 * contract — a formatter must never invent a time it was not given — and it is weaker here than it
 * reads, because `Date.parse` accepts far more than an instant: `'2026'` and `'Sept 8'` both parse
 * to real dates. Nothing in this product hands it either, and the honest statement is that this
 * rejects what `Date.parse` rejects rather than what a person would call malformed.
 *
 * THREE BOUNDARIES A REVIEW MEASURED AND FOUND WRONG, each one comparison apart:
 *
 *   · `Math.round(mins / 5) * 5` is **60** at 58 and 59 minutes, so the ladder read
 *     *55 min → 60 min → 1h* — two spellings of an hour, one of them in the band that is supposed to
 *     stop below it.
 *   · `Math.round(1439 / 60)` is 24, so 23h59m read **"24h ago"** beside a real day.
 *   · The handover past a day threw the time of day away — `slice(0, 10)` and then `relative()`,
 *     which anchored at noon — so an instant exactly 24 hours old, read at midnight, said **"today"**.
 *     That is the failure this function exists to end, surviving one band further out.
 *
 * AND THEN IT COUNTED ELAPSED 24-HOUR PERIODS, which is a third unit. A moment 36 hours old came out
 * "2d ago" beside a `day` cell for the same afternoon reading "1d ago" — for twelve hours out of
 * every twenty-four, past a day, an `instant` column and a `day` column in one table disagreed by a
 * whole band. The comment here claimed they could not. Both count CALENDAR DAYS now, which is the
 * thing each was reaching for: `dayIndex` above, and `relative()`'s own ladder below it.
 */
export function since(iso: string, now: number = Date.now(), zone?: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return relative(iso, now, zone);
  if (DAY.test(iso)) return relative(iso, now, zone);

  const ms = t - now;
  const n = Math.abs(ms);
  if (n < 60_000) return 'just now';

  const mins = Math.round(n / 60_000);
  /* Capped at the top of each range rather than rounded past it, so no band ever spells the one
     above it. `Math.round` alone gave `60 min` and `24h`. */
  const size =
    mins < 15
      ? `${mins} min`
      : mins < 60
        ? `${Math.min(55, Math.round(mins / 5) * 5)} min`
        : n < 86_400_000
          ? `${Math.min(23, Math.round(mins / 60))}h`
          : band(Math.abs(dayIndex(t, readerZone(zone)) - dayIndex(now, readerZone(zone))));
  return ms > 0 ? `in ${size}` : `${size} ago`;
}

/** Each short unit of the ladder as the word a sentence says. */
const UNIT_WORDS: Readonly<Record<string, string>> = { min: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' };

/**
 * A SHORT TIME SAID AS A SENTENCE SAYS IT: "10d ago" as "10 days ago", "in 1w" as "in 1 week", "5h ago" as "5 hours
 * ago". The ladder is `relative()`'s and `since()`'s, so a sentence and the row beside it never band one day two ways;
 * only the unit is written out.'s leftovers: Money's first line said a part was "due 10d
 * ago", the short form a row's corner may take, in a sentence a person reads aloud.
 */
export const inWords = (short: string): string =>
  short.replace(/\b(\d+)\s?(min|mo|h|d|w|y)\b/u, (_, n: string, unit: string) => `${n} ${UNIT_WORDS[unit] ?? unit}${n === '1' ? '' : 's'}`);

/** `relative()` in words, for a sentence: "10 days ago", "in 3 weeks", "today". */
export const relativeWords = (iso: string, now: number = Date.now(), zone?: string): string => inWords(relative(iso, now, zone));

/** `since()` in words, for a sentence: "12 minutes ago", "5 hours ago", "3 days ago". */
export const sinceWords = (iso: string, now: number = Date.now(), zone?: string): string => inWords(since(iso, now, zone));

/**
 * `date:` links to the calendar and `day:` does not — a future date raises "what else is then". A SENTENCE'S FORM, so
 * how far off it is is said in words ("4 Sep, in 3 days"), as the typed `until:` and `ago:` say theirs. The year only
 * when it is another year, and a comma and not a dot, since it sits inside a sentence: the shared page read "not
 * deferrable past 20 Sep 2026 · in 2 weeks" (audit 2, B20).
 */
export const dateLong = (iso: string, now: number = Date.now(), zone?: string): string => `${dateSaid(iso, now)}, ${relativeWords(iso, now, zone)}`;

/**
 * A size, in the unit that tells one file from another.
 *
 * `(bytes / 1e6).toFixed(1) + ' MB'` was written inline on the backups screen, and over a record of
 * ninety-three rows every snapshot came out **"0.2 MB"** — four distinct copies, four identical
 * strings, on the one screen whose entire job is to say which copy is which. A formatter that cannot
 * distinguish the values it is given is not formatting them.
 *
 * NO DOCUMENT SPECIFIES THIS. `13-UI` has no rule for bytes; the specs use raw counts, `KiB` and
 * `MiB`. So it is a decision rather than a citation, and the decision is:
 *
 *   · **Decimal units**, because `53 §4`'s ceiling is written `40 MiB` and a person reading a file
 *     listing sees `MB`. One of the two has to be picked; the screen picks the one people read.
 *   · **Three significant figures**, so 157 kB and 160 kB are different strings and 1.24 MB and
 *     1.31 MB are too. A fixed decimal place is what collapsed them.
 *   · **Whole bytes below a kilobyte**, because `0.4 kB` is a number nobody wanted.
 *
 * AND THE UNIT IS CHOSEN AFTER THE ROUNDING, WHICH IS THE ONLY ORDER THAT WORKS. Choosing first gave
 * `999_500 → "1,000 kB"` — four significant figures, a thousands separator inside a kB reading, and
 * five hundred bytes later the same file is `"1.00 MB"`. The same at every boundary: `9_995` was
 * `"10.00 kB"` beside `10_000`'s `"10.0 kB"`, and `999_999_999` was `"1,000 MB"`. It is the same
 * capping `since()` needed twenty lines above, arrived at the same way: round, then look at what you
 * rounded to, and climb if it spilled.
 */
export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return MISSING;
  /* ROUNDED BEFORE THE BAND IS CHOSEN, for the same reason as the loop below: `999.5` rounds to 1000
     and `1000 B` is a four-digit reading of a unit that stops at three. */
  const whole = Math.round(n);
  if (whole < 1_000) return `${whole} B`;

  /* THE WHOLE SI LADDER, because the escape at the top of a short one prints the four significant
     figures this function exists to prevent: with the list ending at `TB`,
     `bytes(999_500_000_000_000)` was `"1,000 TB"` — a thousands separator inside a three-figure
     reading, which is the exact shape the loop below rejects one rung lower. A `PB` is a real unit
     and costs a string. Above `YB` the escape is unreachable by any number this product can hold. */
  const units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let value = whole / 1_000;
  let i = 0;
  /* Three significant figures: 157 kB · 15.7 MB · 1.57 GB. `toPrecision` is not it — it would give
     `1.00e+3` for the very case this loop exists to catch. */
  const places = (v: number) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
  /**
   * ONE ROUNDING, AND IT IS THE RENDERER'S — the climb reads its own output.
   *
   * It rounded twice with two different rules: `toFixed` rounds the exact binary double,
   * `toLocaleString` rounds the shortest decimal. They disagree on every `.5` tie, so `1005` printed
   * `1.00 kB` where the renderer would have said `1.01`, and `9995` — the example this function was
   * fixed for — printed `9.99 kB` instead of `10.0 kB`. Wrong in the digit, which is worse than the
   * four-digit band it replaced. Doing the arithmetic by hand cannot help: `1.005 * 100` is
   * `100.49999999999999`.
   *
   * So the string is produced first and the climb asks whether THAT spilled. There is no second
   * opinion to disagree with.
   */
  const say = (v: number) => {
    const p = places(v);
    return v.toLocaleString(NUM, { minimumFractionDigits: p, maximumFractionDigits: p });
  };
  for (;;) {
    /* TWICE, BECAUSE ROUNDING MOVES THE BOUNDARY. `9.995` has two decimal places and rounds to
       `10.00`, which has one — four significant figures, the defect this loop exists to prevent,
       arriving through the rounding rather than through the unit. Saying the rounded number again
       settles it, and a second pass cannot move it further: `10.0` is already at its own precision. */
    const once = Number(say(value).replaceAll(',', ''));
    const text = say(once);
    if (once < 1_000 || i === units.length - 1) return `${text} ${units[i]}`;
    value /= 1_000;
    i += 1;
  }
}

export const yesno = (v: boolean): string => (v ? 'yes' : 'no');

/** Stored values that are initialisms, spelled the way a person writes them. */
const INITIALISMS: Readonly<Record<string, string>> = {
  saas: 'SaaS', api: 'API', vat: 'VAT', url: 'URL', dns: 'DNS', ssl: 'SSL', tls: 'TLS', seo: 'SEO',
  ai: 'AI', mcp: 'MCP', cli: 'CLI', paye: 'PAYE', cis: 'CIS', pr: 'PR', ci: 'CI', ui: 'UI', ux: 'UX', qa: 'QA', sql: 'SQL',
  css: 'CSS', html: 'HTML', pdf: 'PDF',
};

/** A name kept as a machine keeps it: lower case, its words joined by hyphens or underscores, `review-pr`. */
const SLUG = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/u;

/**
 * A NAME KEPT AS A SLUG, SAID AS WORDS: `review-pr` is "Review PR" and `write-release-notes` is "Write release notes".
 * A skill is named the way an agent finds it on disk, and its page was titled "review-pr". Anything that is not a slug
 * is a person's own words and comes back as it was written.
 */
export function slugWords(name: string): string {
  if (!SLUG.test(name)) return name;
  const words = name.split(/[-_]/u).map((w) => (Object.hasOwn(INITIALISMS, w) ? INITIALISMS[w]! : w));
  const first = words[0]!;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

/** Names a handle spells as one lower-case word that a person writes with capitals of their own. */
const BRANDS: Readonly<Record<string, string>> = { braindog: 'BrainDog', github: 'GitHub', gitlab: 'GitLab', youtube: 'YouTube', linkedin: 'LinkedIn' };

/**
 * A TOOL'S OR A SKILL'S HANDLE, SAID AS ITS NAME. It is filed as the agent types it (`fenwick`, `review-pr`,
 * `nordhaven-dns`), and that is what the palette, a project's page and a list drew: "Tools: fenwick". `slugWords` leaves
 * one lower-case word alone, since on a page it may be a person's own; a handle is never that, so here one word is a
 * name too: "Fenwick", "Review PR", "Nordhaven DNS", "BrainDog". Anything that is not a handle comes back as written.
 */
export function handleName(name: string): string {
  const said = name.trim();
  if (Object.hasOwn(BRANDS, said)) return BRANDS[said]!;
  if (/^[a-z][a-z0-9]*$/u.test(said)) return Object.hasOwn(INITIALISMS, said) ? INITIALISMS[said]! : said.charAt(0).toUpperCase() + said.slice(1);
  return slugWords(said);
}

/**
 * A STORED VALUE AS A WORD. A board groups on a status and a chips block counts by a kind, and
 * both drew the value the record keeps: `open 8` over a column, `6 saas` in a row of chips. The
 * host spells the same values `Open` and `SaaS` a click away, so the renderer does too.
 *
 * `lead` is for a word that stands alone, a column's heading, and starts it with a capital. A word
 * that follows a figure (`6 domain`) reads as part of a phrase and keeps its case, except an
 * initialism, which is never lower case. Only a whole value is matched: an author's own sentence
 * is not rewritten.
 */
export function valueWord(value: string, lead = false): string {
  const word = value.replace(/_/g, ' ');
  /* `Object.hasOwn`, BECAUSE THE KEY IS THE AUTHOR'S OWN WORD and every member of
     `Object.prototype` was a hit on a plain object. `valueWord('constructor')` returned the Object
     CONSTRUCTOR from a function declared to return a string, `html.ts` handed it straight to
     `escape`, and `s.replace is not a function` took down the whole document over one cell: a
     `board` column called `constructor` and a `chips` word of the same spelling both threw. That is
     not a hypothetical spelling either, it is an ordinary English word in a status column, and it
     is the one member of the prototype that survives the lower-casing above and the underscore
     rewrite on the line before it. The same guard is what `kinds.ts` uses for `TONES` and what
     `queue.ts` uses for its cost bands. */
  const key = word.toLowerCase();
  if (Object.hasOwn(INITIALISMS, key)) return INITIALISMS[key]!;
  return lead ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** Short words a bank line holds that are words and not initials: lowered mid-line, as a person writes them. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'via']);
/** Short words that are words, said with a capital: months, days, company endings and the common nouns of a bank line. */
const SHORT_NAMES = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'ltd', 'co', 'inc', 'plc', 'llc',
  'tax', 'fee', 'pay', 'end', 'new', 'set', 'day', 'net', 'gas', 'car', 'bus', 'cab', 'bar', 'box', 'top', 'one', 'two', 'all', 'out', 'off', 'our', 'per',
]);
/** Longer initialisms a bank line holds that could be said as a word, kept in capitals: the terms of a transfer. */
const LONG_INITIALS = new Set(['IBAN', 'SWIFT', 'DVLA']);
/**
 * A WORD NOBODY COULD SAY IS INITIALS: four capitals or more with no vowel in them ("HMRC") are read letter by letter,
 * so they keep their capitals. A rule and not a list of names, because whose initials a bank line carries is the
 * record's and the add-on's, never the renderer's.
 */
const unsayable = (bare: string): boolean => bare.length > 3 && !/[AEIOUY]/u.test(bare) && /^\p{Lu}+$/u.test(bare);

/**
 * BANK TEXT AS A PERSON WRITES IT: "KILN STOREFRONT PAYOUT" is "Kiln Storefront Payout", and "TALLYARD" is
 * "Tallyard". A bank sends its lines in capitals, and capitals down a ledger read as shouting and hide the one word that
 * tells two lines apart.
 *
 * ONLY A STRING WITH NO SMALL LETTER IN IT, AND MORE THAN THREE LETTERS IN ALL: "Rent" and "iPad case" are a person's
 * own and stay as typed, and "VAT" alone is an initialism. Inside a line a word of three letters or fewer is kept as it
 * came ("VAT", "UK", "S"), since it is far more often an initialism than a word, unless it is one of the short words a
 * line is made of: "TO" and "THE" are lowered after the first word ("Transfer to Tax Reserve"), and a month, a day or
 * "LTD" takes a capital. A word joined by a hyphen is cased with its neighbour ("YEAR-END" is "Year-End",
 * "O'NEILL-SMITH" is "O'neill-Smith"), and the long initialisms a bank writes ("HMRC") keep their capitals.
 */
export function readable(text: string): string {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length <= 3 || /\p{Ll}/u.test(text)) return text;
  let first = true;
  return text.replace(/\p{L}[\p{L}'’]*(?:-\p{L}[\p{L}'’]*)*/gu, (compound) => {
    const lead = first;
    first = false;
    const parts = compound.split('-');
    const joined = parts.length > 1 && parts.some((w) => w.replace(/['’]/gu, '').length > 3);
    return parts
      .map((word) => {
        const bare = word.replace(/['’]/gu, '');
        const low = word.toLowerCase();
        if (LONG_INITIALS.has(bare) || unsayable(bare)) return word;
        if (!lead && parts.length === 1 && SMALL_WORDS.has(low)) return low;
        if (bare.length <= 3 && !joined && !SHORT_NAMES.has(low)) return word;
        return word.charAt(0) + word.slice(1).toLowerCase();
      })
      .join('-');
  });
}

/** A ref reads as its spoken id, which is the string a person says out loud. */
export const ref = (spoken: string): string => {
  const i = spoken.indexOf('#');
  return i === -1 ? spoken : spoken.slice(i);
};

/**
 * The typed interpolations: eight, counted. `date` `day` `until` `ago` `money` `quantity` `pct` `ref`.
 * An argument that does not parse renders as the author's text, MARKED — never vanishing, and never
 * inventing a day (05 §7.2).
 */
export const TYPED = ['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref'] as const;
export type TypedForm = (typeof TYPED)[number];

export function formatTyped(form: TypedForm, arg: string, now?: number, zone?: string): string | null {
  const a = arg.trim();
  switch (form) {
    /* ONE ARM, because there was a ternary with two identical ones: `dateLong` IS
       `` `${day(iso)} · ${relative(iso, now)}` ``, so the false branch was its body written out
       again. `05 §7.2` does distinguish them — *"only the forward one links"* — and the link is
       `inline.ts`'s (`form === 'date' ? 'day' : …`), not a difference in the text. A conditional
       whose branches agree is a claim that they differ, and this one had `dateLong`'s only caller on
       one side of it. */
    case 'date':
    case 'day':
      return noon(a) === null ? null : dateLong(a, now, zone);
    /* IN WORDS, as a sentence says it ("due 10 days ago"): a typed form is only ever written into prose. */
    case 'until':
    case 'ago':
      return noon(a) === null ? null : relativeWords(a, now, zone);
    /* `^[A-Z]{3}$`, WHICH IS `36 §5.6` RULE 1 — it was `[A-Za-z]`, so `{{money:129900 egp}}` drew
       `EGP 1,299.00` and the author never learned that the code is upper case. `05 §7.2`'s rule for
       this whole family is that an argument which does not parse *"renders as the author's text,
       marked"*: dotted text somebody can fix beats a figure that quietly normalised itself, because
       the next code they type may not round-trip. `money()` still upper-cases for its own callers,
       where the code comes from a typed field rather than from prose. */
    case 'money': {
      /* THE AUTHOR'S DIGITS, AS DIGITS. `Number(m[1])` came first, and past 2^53 it kept sixteen of
         them and invented the rest before `money()` ever saw the figure. */
      const m = /^(-?\d+)\s+([A-Z]{3})$/.exec(a);
      return m ? money(m[1]!, m[2]!) : null;
    }
    case 'quantity': {
      const m = /^(-?[\d.]+)\s*(.*)$/.exec(a);
      return m && !Number.isNaN(Number(m[1])) ? quantity(Number(m[1]), m[2]!.trim()) : null;
    }
    /* `Number('')` is 0, so `{{pct:}}` rendered `0%` — a measurement, printed, of a thing nobody
       measured. That is this module's own rule in bold, broken by a falsy check.
       AND `Number()` ACCEPTS MORE THAN A PERCENTAGE IS. `36 §5.5` gives the form
       `-?\d+(\.\d+)?`; `Number` read `0x1f` as 31, `0b11` as 3 and `1e3` as 1,000, so three
       notations no author of this dialect would use rendered as measurements. The grammar is the
       check, and a finite check on top of it because `\d+` can still overflow to `Infinity`. */
    case 'pct':
      return /^-?\d+(\.\d+)?$/.test(a) && Number.isFinite(Number(a)) ? pct(Number(a)) : null;
    case 'ref':
      return /^[a-z][a-z0-9_]*#\d+$/.test(a) ? ref(a) : null;
  }
}

/**
 * A path that names nothing renders as the path, marked; a path whose value is MISSING renders an
 * em dash — never blank, never `undefined`, and NEVER A ZERO. A product that earns nothing and a
 * product nobody measured are not the same product (05 §7.1).
 */
export const MISSING = '—';
