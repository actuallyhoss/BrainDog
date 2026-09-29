/**
 * Slash's citations, drawn: the one reader of the brace grammar in the app.
 *
 * WHAT A BRACE IS. Slash may not type a figure (`packages/slash/src/prompts.ts`, rule 1), so every figure and every row
 * it names reaches the screen as a brace: `{{ref:obligations#7}}` is a row, `{{obligations#7.amount}}` a row's value,
 * `{{runway-months}}` a figure the record keeps, `{{sum:expenses.amount.GBP}}` a total the record worked out over the
 * rows it read, and `{{money:500500 EGP}}` an amount a row holds. The engine checked every one against what it read
 * (`cite`), and kept on the answer what each stood for (`figuresOf`, the body's `figures`). This file turns the two back
 * into things a person reads.
 *
 * NO BRACE IS EVER DRAWN. A brace this file cannot resolve, because the answer is older than `figures` or names
 * something it did not keep, is drawn in words of its own: a row by its list, a figure by its name. It was the defect
 * this file exists to end: the palette printed `p.text` as it came and Decide printed `because` as it came, and both
 * showed the owner raw braces.
 *
 * PURE AND NODE-LOADABLE, so `node --test` can hold it: `Cited.svelte` draws what `cited` answers and decides nothing.
 */

import { day, formatTyped, integer, money, quantity, valueWord, yesno, type TypedForm } from 'braindog-render';

import { listName } from './record/names.ts';

/** A row a citation links to: its title, and the address of its page (drawn through `at()` by the caller). */
export type RowLink = { title: string; href: string };

/**
 * One piece of a cited sentence.
 *
 * `money` IS AN AMOUNT FOR `Money` TO DRAW, in minor units with its own currency, never a string formatted here. `sum`
 * is a total with the rows it adds up, so the screen can put them one tap away; `n` counts them all and `rows` holds the
 * ones the answer kept.
 */
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'row'; title: string; href: string }
  | { kind: 'money'; minor: number; currency: string }
  | { kind: 'words'; text: string }
  | { kind: 'sum'; key: string; minor: number; currency: string | null; n: number; rows: RowLink[] };

/** Words this renderer says for a brace it cannot resolve, and nothing else. */
export const words = {
  rowIn: (list: string) => `a row in ${list}`,
  notKnown: 'not known yet',
  total: 'the total',
  sumRows: (n: number) => (n === 1 ? 'the row it adds up' : `the ${integer(n)} rows it adds up`),
  sumMore: (n: number) => (n === 1 ? 'and one more in the list' : `and ${integer(n)} more in the list`),
} as const;

const isRow = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `34 §4`: the qualified spoken id, and the prefix every path over a row starts with. */
const QUALIFIED = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)/u;
const INTERPOLATION = /\{\{([^}\n]*)\}\}/gu;
const CURRENCY = /^[A-Z]{3}$/u;
const MONEY_LITERAL = /^(-?[0-9]+)\s+([A-Z]{3})$/u;
/** The typed kinds `formatTyped` draws from a literal; `money` has its own arm and `ref` is never a literal. */
const LITERAL_FORMS: readonly string[] = ['date', 'day', 'until', 'ago', 'pct', 'quantity'];

const hrefOf = (register: string, seq: number): string => `/r/${encodeURIComponent(register)}/${seq}`;

/**
 * A row's title out of a projection's summary: the first part that is not its spoken id.
 *
 * THE SPOKEN ID IS AN ADDRESS AND NEVER A NAME. The host's bridge writes `spoken | title | state`, and a record's own
 * projection writes the title alone, so the id is dropped wherever it sits. The engine reads titles the same way
 * (`titleOf` in `packages/slash/src/project.ts`). It is not `names.ts`'s `titleOf`, which names a declaration.
 */
export const summaryTitle = (summary: string, spoken: string): string =>
  summary
    .split(' | ')
    .map((part) => part.trim())
    .find((part) => part !== '' && part !== spoken) ?? '';

/** The row a spoken id names, as a link, with its list's name where the answer kept no title. */
const rowLink = (spoken: string, title?: string): Segment | null => {
  const m = QUALIFIED.exec(spoken);
  if (!m || m[0] !== spoken) return null;
  const register = m[1] ?? '';
  return { kind: 'row', title: title && title.trim() !== '' ? title : words.rowIn(listName(register)), href: hrefOf(register, Number(m[2])) };
};

/** A number as a person reads it: grouped, Latin digits, a true minus. */
const numberWords = (n: number): string => (Number.isInteger(n) ? integer(n) : n.toLocaleString('en-u-nu-latn', { maximumFractionDigits: 6 }));

/** A value held on a row, drawn in the record's format for its field's type. */
const valueSegment = (type: string, value: unknown, spoken: string | null): Segment => {
  if (isRow(value) && typeof value.amount === 'number' && typeof value.currency === 'string')
    return { kind: 'money', minor: value.amount, currency: value.currency };
  if (isRow(value) && typeof value.value === 'number' && typeof value.unit === 'string')
    return { kind: 'words', text: quantity(value.value, value.unit) };
  if (typeof value === 'boolean') return { kind: 'words', text: yesno(value) };
  if (typeof value === 'number') return { kind: 'words', text: numberWords(value) };
  if (typeof value === 'string') {
    if (type === 'day') return { kind: 'words', text: day(value) };
    if (type === 'instant') return { kind: 'words', text: day(value.slice(0, 10)) };
    if (type === 'enum') return { kind: 'words', text: valueWord(value) };
    if (type === 'ref') return rowLink(value) ?? { kind: 'words', text: value };
    return { kind: 'words', text: value };
  }
  if (Array.isArray(value)) return { kind: 'words', text: value.map((v) => (typeof v === 'string' ? valueWord(v) : String(v))).join(', ') };
  /* A VALUE THE ANSWER DID NOT KEEP IS NAMED BY ITS ROW, never by its path. */
  return (spoken ? rowLink(spoken) : null) ?? { kind: 'words', text: words.notKnown };
};

const DAY_MS = 86_400_000;

/**
 * A figure the record keeps, as its reading: money for `Money`, anything else in its declared format.
 *
 * THE FORMATS ARE `format` IN `lib/record/metrics.ts`, rule for rule (a `pct` is a ratio shown as a percentage, `days`
 * whole days, `day` days since 1970), restated here because that module is the browser's figure evaluator and a sentence
 * is drawn where it is not loaded. THE READING'S CURRENCY WINS OVER THE DECLARED ONE, because a figure over accounts in
 * another currency is added up in that one (`unit` in the kernel's `Reading`).
 */
const metricSegment = (f: Record<string, unknown>): Segment => {
  const value = typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null;
  if (value === null) return { kind: 'words', text: words.notKnown };
  const unit = typeof f.unit === 'string' && f.unit !== '' ? f.unit : null;
  if (unit !== null && CURRENCY.test(unit)) return { kind: 'money', minor: Math.round(value), currency: unit };
  const shape = typeof f.format === 'string' ? f.format : '';
  const currency = shape.startsWith('money.') ? shape.slice('money.'.length) : '';
  if (CURRENCY.test(currency)) return { kind: 'money', minor: Math.round(value), currency };
  switch (shape) {
    case 'int':
      return { kind: 'words', text: integer(Math.round(value)) };
    case 'pct':
      return { kind: 'words', text: `${(value * 100).toLocaleString('en-u-nu-latn', { maximumFractionDigits: 1 })}%` };
    case 'days':
      return { kind: 'words', text: Math.round(value) === 1 ? '1 day' : `${integer(Math.round(value))} days` };
    case 'decimal':
      return { kind: 'words', text: value.toLocaleString('en-u-nu-latn', { maximumFractionDigits: 2 }) };
    case 'day':
      return { kind: 'words', text: day(new Date(Math.round(value) * DAY_MS).toISOString().slice(0, 10)) };
    default:
      return { kind: 'words', text: unit === null ? numberWords(value) : `${numberWords(value)} ${unit}` };
  }
};

const sumSegment = (key: string, f: Record<string, unknown>): Segment | null => {
  if (typeof f.amount !== 'number' || !Number.isSafeInteger(f.amount)) return null;
  const rows = (Array.isArray(f.rows) ? f.rows : []).flatMap((r): RowLink[] => {
    if (!isRow(r) || typeof r.register !== 'string' || typeof r.seq !== 'number') return [];
    const title = typeof r.title === 'string' && r.title.trim() !== '' ? r.title : words.rowIn(listName(r.register));
    return [{ title, href: hrefOf(r.register, r.seq) }];
  });
  return {
    kind: 'sum',
    key,
    minor: f.amount,
    currency: typeof f.currency === 'string' && CURRENCY.test(f.currency) ? f.currency : null,
    n: typeof f.n === 'number' && f.n >= rows.length ? f.n : rows.length,
    rows,
  };
};

/** What one kept figure is, read defensively: the answer came over the wire and may be older than this file. */
const figureSegment = (key: string, f: unknown, spoken: string | null): Segment | null => {
  if (!isRow(f)) return null;
  switch (f.kind) {
    case 'row':
      return typeof f.register === 'string' && typeof f.seq === 'number'
        ? { kind: 'row', title: typeof f.title === 'string' && f.title.trim() !== '' ? f.title : words.rowIn(listName(f.register)), href: hrefOf(f.register, f.seq) }
        : null;
    case 'value':
      return valueSegment(typeof f.type === 'string' ? f.type : 'text', f.value, spoken);
    case 'metric':
      return metricSegment(f);
    case 'sum':
      return sumSegment(key, f);
    default:
      return null;
  }
};

/** A path's own words when the answer kept nothing for it: the row it is over, or the figure's id said as words. */
const pathFallback = (path: string): Segment => {
  const m = QUALIFIED.exec(path);
  if (m) return rowLink(m[0]) ?? { kind: 'words', text: words.notKnown };
  return { kind: 'words', text: path.replace(/[-_.]/gu, ' ') };
};

/** One brace's inside, resolved against the answer's `figures`. */
const resolve = (inner: string, figures: Record<string, unknown>, now: number | undefined): Segment => {
  const at = (key: string, spoken: string | null): Segment | null =>
    Object.hasOwn(figures, key) ? figureSegment(key, figures[key], spoken) : null;
  const colon = inner.indexOf(':');
  if (colon < 0) return at(inner, QUALIFIED.exec(inner)?.[0] ?? null) ?? pathFallback(inner);

  const kind = inner.slice(0, colon).trim();
  const arg = inner.slice(colon + 1).trim();
  if (kind === 'ref') return at(`ref:${arg}`, arg) ?? rowLink(arg) ?? { kind: 'words', text: words.notKnown };
  if (kind === 'sum') return at(`sum:${arg}`, null) ?? { kind: 'words', text: words.total };

  /* A TYPED LITERAL IS ITS OWN VALUE; a typed path is the value the answer kept for that path. */
  if (/^[-0-9]/u.test(arg)) {
    if (kind === 'money') {
      const m = MONEY_LITERAL.exec(arg);
      if (m) return { kind: 'money', minor: Number(m[1]), currency: m[2] ?? '' };
    }
    if (LITERAL_FORMS.includes(kind)) {
      const said = formatTyped(kind as TypedForm, arg, now);
      if (said !== null) return { kind: 'words', text: said };
    }
    return { kind: 'words', text: words.notKnown };
  }
  const kept = at(arg, QUALIFIED.exec(arg)?.[0] ?? null);
  /* `until` AND `ago` OVER A DAY SAY HOW FAR OFF IT IS, which is what the author of the brace asked for over the date. */
  const held = figures[arg];
  if (kept?.kind === 'words' && (kind === 'until' || kind === 'ago') && isRow(held) && typeof held.value === 'string') {
    const said = formatTyped(kind, held.value, now);
    if (said !== null) return { kind: 'words', text: said };
  }
  return kept ?? pathFallback(arg);
};

/** The `figures` an answer's body kept, or none: `body.figures` as the engine writes it. */
export const figuresIn = (body: unknown): Record<string, unknown> =>
  isRow(body) && isRow(body.figures) ? body.figures : {};

/**
 * One option's reason as it was filed, braces and all, by the option's id, or `null` where the body holds none.
 *
 * FOR THE SCREEN THAT DRAWS THE REASON WITH ITS LINKS. `questionOf` hands every screen the reason as words; the options
 * card on `/decide/<id>` draws it through `Cited` instead, and `Cited` needs the sentence before it was turned into words.
 */
export const reasonIn = (body: unknown, id: string): string | null => {
  if (!isRow(body) || !Array.isArray(body.options)) return null;
  const option = body.options.find((o): o is Record<string, unknown> => isRow(o) && o.id === id);
  return option !== undefined && typeof option.because === 'string' ? option.because : null;
};

/**
 * A sentence Slash wrote, as the pieces a screen draws: its words, and each brace as the thing it stands for.
 *
 * A LONE `{{` OR `}}` LEFT IN THE WORDS IS TAKEN OUT, because a brace that never closed is not text anybody wrote to be
 * read, and the rule is that none reaches the screen.
 */
export function cited(text: string, figures: Record<string, unknown> = {}, now?: number): Segment[] {
  const out: Segment[] = [];
  const say = (t: string): void => {
    const clean = t.replaceAll('{{', '').replaceAll('}}', '');
    if (clean === '') return;
    const last = out.at(-1);
    if (last?.kind === 'text') last.text += clean;
    else out.push({ kind: 'text', text: clean });
  };
  let from = 0;
  for (const m of text.matchAll(INTERPOLATION)) {
    say(text.slice(from, m.index));
    out.push(resolve((m[1] ?? '').trim(), figures, now));
    from = m.index + m[0].length;
  }
  say(text.slice(from));
  return out;
}

/**
 * The same sentence as plain words, for a screen that draws a line of text rather than pieces: the queue's option names
 * and reasons. Money is written as `money()` writes it, so the caller's `moneyInText` draws it in the record's currency.
 */
export function citedWords(text: string, figures: Record<string, unknown> = {}, now?: number): string {
  return cited(text, figures, now)
    .map((s) => {
      switch (s.kind) {
        case 'text':
        case 'words':
          return s.text;
        case 'row':
          return s.title;
        case 'money':
          return money(s.minor, s.currency);
        case 'sum':
          return s.currency === null ? integer(s.minor) : money(s.minor, s.currency);
      }
    })
    .join('');
}
