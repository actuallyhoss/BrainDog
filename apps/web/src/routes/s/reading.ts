/**
 * What the shared page reads and says, out of the component so `node --test` can hold it (a Svelte page does not mount
 * there): the link off the address, the page's head, and each typed cell and figure as a stranger reads it.
 *
 * THE LINK IS `/s#<token>` (`linkOpened` in `@braindog/host`), so the token is in the fragment, which no browser
 * sends to any host and no log keeps. It is read once and wiped from the address bar at once, as `takeInvite` does
 * (`lib/auth.ts`), so it does not stay on the screen, in a screenshot or in the tab's history.
 *
 * EVERY VALUE IS DRAWN IN THE RECORD'S LANGUAGE AND ZONE, which the answer carries, never the visitor's device's: an
 * amount through the app's own money writer (`money` and `drawn`), a day through its own `day`, an instant counted
 * from the moment the owner's record was read in the record's zone.
 */

import { AMOUNT_SPACE, agentNamed, dateSaid, money, since } from 'braindog-render';

import { drawn, type Drawn } from '../../lib/record/money.ts';
import { thingName } from '../../lib/record/project.ts';
import { fieldSaid, words, type SharedBlock, type SharedCell, type SharedColumn, type SharedRead, type SharedReading, type SharedRow } from '../../lib/record/share-write.ts';

/**
 * The link off `#<token>`, once, wiping the address first. Nothing is printed, logged or kept: the token goes to the
 * one read that asks for the page and nowhere else. An address with no fragment is a link that does not open.
 */
export function takeShared(hash: string, clear: () => void): string {
  const raw = hash.replace(/^#/u, '').trim();
  if (raw === '') return '';
  clear();
  return raw;
}

/** The page's head: its name and one sentence. A link that does not open is one sentence for every way it fails. */
export function headOf(got: SharedRead): { title: string; line: string } {
  if (got.from === 'live') {
    const read = got.page.read_at === null ? Number.NaN : Date.parse(got.page.read_at);
    return { title: got.page.title, line: words.sharedUntil(dateSaid(dayIn(got.page.expires_at, got.page.zone), Number.isFinite(read) ? read : Date.now())) };
  }
  if (got.from === 'shut') return { title: words.sharedDead, line: words.sharedDeadBody };
  return { title: words.sharedUnreached, line: '' };
}

/**
 * Where a page is read: the record's language and zone, the moment the record said its clock read, and its home
 * currency, whose amounts are written by their sign alone as the app writes them ("£4,050", never "£4,050 GBP").
 * `pence` keeps nought pence, for a column where another amount has some (`tableOf` in `drawing.ts`).
 */
export type Where = { language: string; zone: string; now: number; home?: string | null; pence?: boolean };

/**
 * HOW THE OWNER'S NOTES ARE DRAWN HERE: in the record's clock, zone and home currency, and with no link into the record.
 * No row or day is handed a link, and `links: 'away'` draws a path of the record the owner linked (in a note, a link list
 * or a quick add) as its words, so only a link that leaves the record stays one (review 30 Oct, R10).
 */
export const noteOpts = (w: Where) => ({ now: w.now, zone: w.zone, home: w.home ?? null, links: 'away' as const });

/** A value as it is drawn: words, or an amount in the parts `Money` sets. */
export type Said = { text: string } | { money: Drawn & { text: string } };

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
const CURRENCY = /^[A-Z]{3}$/u;

/** A day as the app says one: "30 Aug" in the year the record is in, "30 Aug 2025" in another. */
const daySaid = (iso: string, where: Where): string => dateSaid(iso, where.now);

/** The calendar day an instant falls on in the record's zone, as `YYYY-MM-DD`: a link that stops at 03:00 UTC stops the day before in New York. */
const dayIn = (iso: string, zone: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t);
    const of = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${of('year')}-${of('month')}-${of('day')}`;
  } catch {
    return iso.slice(0, 10);
  }
};

/** A number in the record's language, with Latin digits, which a column of figures keeps aligned. */
const numberSaid = (n: number, language: string): string => {
  try {
    return new Intl.NumberFormat(language, { numberingSystem: 'latn', maximumFractionDigits: 3 }).format(n);
  } catch {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(n);
  }
};

/**
 * An amount, minor units in its own currency, as the app writes one: the record's home currency by its sign alone, any
 * other with its code, and never two added. `headline` is a tile's figure, in whole units from ten thousand up; a cell
 * keeps its pence unless they are all noughts ("£14", "−£8,530", "£12.40"). `null` for a value that is not whole money.
 */
export function moneySaid(amount: unknown, currency: unknown, setting: 'exact' | 'headline' | 'pence' = 'exact', home: string | null = null): (Drawn & { text: string }) | null {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || typeof currency !== 'string' || !CURRENCY.test(currency)) return null;
  const text = money(amount, currency);
  const parts = drawn(text, home, setting === 'headline' ? 'headline' : false);
  if (parts === null) return null;
  /* `pence` KEEPS NOUGHT PENCE, for a column where another amount has some, so its digits line up (`moneySet`). */
  const fraction = setting === 'exact' && /^\.0+$/u.test(parts.fraction) ? '' : parts.fraction;
  return { ...parts, fraction, text: `${parts.lead}${parts.whole}${fraction}${parts.iso === null ? '' : `${AMOUNT_SPACE}${parts.iso}`}` };
}

/** How many seconds each unit a duration may be declared in holds, as the app reads a duration field. */
const SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };
const UNIT_WORDS: Readonly<Record<string, [string, string]>> = { s: ['second', 'seconds'], m: ['minute', 'minutes'], h: ['hour', 'hours'], d: ['day', 'days'], w: ['week', 'weeks'] };

/**
 * A duration in words, as a person says how long something takes: "3 days", "1 day", "5 hours", "1.5 days". Held in
 * seconds and said in its field's unit, or the largest smaller one when it is less than one of those ("0.2 d" is
 * "5 hours"). Below ten it keeps a half, above it is whole.
 */
export function durationSaid(seconds: number, unit: string | undefined, language: string): string {
  const order = ['w', 'd', 'h', 'm', 's'];
  const most = unit !== undefined && Object.hasOwn(SECONDS, unit) ? unit : 's';
  const from = order.indexOf(most);
  const size = Math.abs(seconds);
  const chosen = order.slice(from).find((u) => size >= SECONDS[u]!) ?? order[order.length - 1]!;
  const n = size / SECONDS[chosen]!;
  const rounded = n < 10 ? Math.round(n * 2) / 2 : Math.round(n);
  const [one, many] = UNIT_WORDS[chosen]!;
  return `${seconds < 0 ? '−' : ''}${numberSaid(rounded, language)} ${rounded === 1 ? one : many}`;
}

/** An agent as the app names one: "Claude", "Codex", never the word it signs with. */
const agentSaid = (v: string): string => agentNamed(v) ?? v;

/** A number with its unit: a share sits on its figure ("60%"), another unit keeps its space ("12 kg"). */
const withUnit = (said: string, unit: string | null | undefined): string => (unit ? (unit === '%' ? `${said}%` : `${said} ${unit}`) : said);

/** One plain value as a person reads it: a day, an instant, a number, yes or no, or the words themselves. */
export function plainSaid(v: unknown, where: Where): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? words.sharedYes : words.sharedNo;
  if (typeof v === 'number') return Number.isFinite(v) ? numberSaid(v, where.language) : '';
  if (typeof v === 'string') return DAY.test(v) ? daySaid(v, where) : INSTANT.test(v) ? since(v, where.now, where.zone) : v;
  if (Array.isArray(v)) return v.map((x) => plainSaid(x, where)).filter((s) => s !== '').join(', ');
  return '';
}

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * One typed cell by its type, as the owner's own table draws it: an amount as Money writes it, a duration and a share
 * in words ("3 days", "60%"), a day as "30 Aug", an agent by its name. `minus` turns an amount the row says went out.
 */
function typedSaid(type: string, value: unknown, label: string | undefined, where: Where, minus = false, unit?: string, field?: string, plus = false): Said {
  if (type === 'money' && isObject(value) && typeof value.amount === 'number') {
    const m = moneySaid(minus ? -value.amount : value.amount, value.currency, where.pence === true ? 'pence' : 'exact', where.home ?? null);
    return m === null ? { text: '' } : { money: plus && value.amount > 0 && !minus ? plusOf(m) : m };
  }
  if (type === 'quantity' && isObject(value) && typeof value.value === 'number')
    return { text: withUnit(numberSaid(value.value, where.language), typeof value.unit === 'string' ? value.unit : null) };
  if (type === 'duration' && typeof value === 'number' && Number.isFinite(value)) return { text: durationSaid(value, unit, where.language) };
  if ((type === 'decimal' || type === 'int') && typeof value === 'number' && Number.isFinite(value)) return { text: withUnit(numberSaid(value, where.language), unit) };
  /* AN AGENT BY ITS NAME, on any list: the field holds what the agent signs with, `claude`, and the app says "Claude". */
  if (field === 'agent' && typeof value === 'string' && /^[a-z][a-z0-9-]*$/u.test(value)) return { text: label ?? agentSaid(value) };
  if (type === 'enum') return { text: label ?? (typeof value === 'string' ? fieldSaid(value) : '') };
  if (type === 'day' && typeof value === 'string') return { text: daySaid(value, where) };
  if (type === 'instant' && typeof value === 'string') return { text: since(value, where.now, where.zone) };
  return { text: plainSaid(value, where) };
}

/**
 * AN AMOUNT COMING IN, SIGNED AS THE APP SIGNS IT (audit 31 Oct o, AO9): the owner reads "+EGP 3,000" for a payment from
 * Upwork where its column says which way money goes, and the link read "EGP 3,000". Nought and a minus are left.
 */
const plusOf = (m: Drawn & { text: string }): Drawn & { text: string } => ({ ...m, lead: `+${m.lead}`, text: `+${m.text}` });

/** A list's cell: each value by the type it holds, joined. An amount in a list is said whole, one after another. */
function listSaid(cell: SharedCell, where: Where): Said {
  const of = cell.of ?? 'text';
  const each = Array.isArray(cell.value) ? cell.value : [];
  const said = each.map((v) => typedSaid(of, v, undefined, where)).map((s) => ('money' in s ? s.money.text : s.text));
  return { text: said.filter((s) => s !== '').join(', ') };
}

/**
 * One column of one row: its typed cell when the record sent one, else the plain value a record without cells sent.
 * A money column with a `sign` turns its amount when the row's sign field says it went out.
 */
export function cellSaid(row: SharedRow, column: Pick<SharedColumn, 'field' | 'sign' | 'or'>, where: Where): Said {
  /* A COLUMN'S `or` IS READ WHERE ITS OWN FIELD SAYS NOTHING (AL1), as the app reads it (`toRows`): the Ledger's name is
     who was paid, else the line's own words, and the timeline makes a bank's capitals words (`timelineTitle`). */
  if (column.or !== undefined) {
    const own = fieldSaid1(row, { field: column.field, ...(column.sign === undefined ? {} : { sign: column.sign }) }, where);
    return textOfSaid(own).trim() !== '' ? own : fieldSaid1(row, { field: column.or }, where);
  }
  return fieldSaid1(row, column, where);
}

/** A said value's words. */
const textOfSaid = (s: Said): string => ('money' in s ? s.money.text : s.text);

/** One field of a row as words, the way `cellSaid` says a column with no second field. */
function fieldSaid1(row: SharedRow, column: Pick<SharedColumn, 'field' | 'sign'>, where: Where): Said {
  const cell = row.cells[column.field];
  /* A NAME FILED AS A HANDLE IS SAID AS THE APP SAYS IT (`thingName` on a project's page): a shared Kiln read its tools
     "fenwick" and "outline-check" where the owner reads "Fenwick" and "Outline check" (audit of 31 October, A19). */
  const named = column.field === 'name' ? (cell?.type === 'text' || cell === undefined ? (cell?.value ?? row.fields.name) : null) : null;
  /* ONE RULE WITH THE PROJECT'S PAGE, so a domain stays as written on both and a key filed after its file reads alike. */
  if (typeof named === 'string' && thingName(named) !== named) return { text: thingName(named) };
  if (cell === undefined) {
    const plain = row.fields[column.field];
    return column.field === 'agent' && typeof plain === 'string' && /^[a-z][a-z0-9-]*$/u.test(plain) ? { text: agentSaid(plain) } : { text: plainSaid(plain, where) };
  }
  if (cell.type === 'list') return listSaid(cell, where);
  const sign = column.sign;
  const minus = sign !== undefined && (row.cells[sign.field]?.value ?? row.fields[sign.field]) === sign.minus;
  return typedSaid(cell.type, cell.value, cell.label, where, minus, cell.unit, column.field, sign !== undefined);
}

/** A figure: an amount when its unit is a currency, a count with its unit, or the words for a reading with none. */
/**
 * A figure's trend as the shared page draws it: the run, a gap as no point, or `null` when there is no line worth
 * drawing. THREE POINTS AT LEAST, the rule a card's trend keeps (`trendOf` in `braindog-render`): two make a slope and
 * say nothing a reader can trust.
 */
export function trendLine(r: SharedReading): number[] | null {
  if (r.trend === undefined) return null;
  const line = r.trend.map((v) => (v === null ? Number.NaN : v));
  return line.filter(Number.isFinite).length >= 3 ? line : null;
}

/** One point of a figure's trend in words, as the figure itself is written: "EGP 80,115.99", "42 %". */
export function pointSaid(r: SharedReading, n: number, where: Where): string {
  const { sign: _sign, ...unsigned } = r;
  const s = figureSaid({ ...unsigned, value: n }, where);
  return 'money' in s ? s.money.text : s.text;
}

export function figureSaid(r: SharedReading, where: Where): Said {
  if (r.value === null) return { text: words.sharedNoFigure };
  /* A FIGURE ITS TILE SIGNS (AO9) is said the way its money goes: "+£11,490" to come in, "−£43,047" going out. */
  const value = r.sign === 'out' && r.value > 0 ? -r.value : r.value;
  const signed = (m: Drawn & { text: string }): Drawn & { text: string } => (r.sign === 'in' && value > 0 ? plusOf(m) : m);
  if (r.unit !== null && CURRENCY.test(r.unit)) {
    const m = moneySaid(value, r.unit, 'headline', where.home ?? null);
    if (m !== null) return { money: signed(m) };
  }
  if (r.unit === null && r.format !== undefined) {
    const said = formatSaid(r.format, r.format.startsWith('money') ? value : r.value, where);
    if (said !== null) return 'money' in said ? { money: signed(said.money) } : said;
  }
  return { text: withUnit(numberSaid(r.value, where.language), r.unit) };
}

/** A day as whole days since 1970, as a figure declared `format: day` holds one: 20,756 is 30 Oct 2026. */
const DAY_MS = 86_400_000;

/**
 * A figure with no unit said as its declared format, as the app's tile says it (`format` in `lib/record/metrics.ts`): a
 * day as "30 Oct", a count of days as "57 days", a share as "62%", money in its currency. `null` for a format said as a
 * plain number.
 */
function formatSaid(format: string, value: number, where: Where): Said | null {
  if (format === 'day') {
    const day = new Date(Math.round(value) * DAY_MS);
    return Number.isFinite(day.getTime()) ? { text: daySaid(day.toISOString().slice(0, 10), where) } : null;
  }
  if (format === 'days') {
    const n = Math.round(value);
    return { text: `${numberSaid(n, where.language)} ${n === 1 ? 'day' : 'days'}` };
  }
  if (format === 'pct') return { text: `${numberSaid(Math.round(value * 1000) / 10, where.language).replace(/^-/u, '−')}%` };
  if (format === 'int') return { text: numberSaid(Math.round(value), where.language) };
  const currency = format === 'money' ? (where.home ?? null) : format.startsWith('money.') ? format.slice('money.'.length) : null;
  if (currency !== null) {
    const m = moneySaid(Math.round(value), currency, 'headline', where.home ?? null);
    return m === null ? null : { money: m };
  }
  return null;
}

/** A cell that says nothing: no words and no amount. */
const blank = (s: Said): boolean => ('money' in s ? s.money.text : s.text).trim() === '';

/**
 * One block as the shared page draws it: the columns that say something, the rows that do, and how many there were.
 * `matched` is what the record matched less the rows left out here, so "Showing 2 of 3" counts what a reader could see.
 */
export type Shown = { block: SharedBlock; columns: (SharedColumn & { label: string })[]; rows: SharedRow[]; matched: number };

/** The columns a block draws, or the one field each row keeps when the block named none. */
function columnsOf(b: SharedBlock): (SharedColumn & { label: string })[] {
  if (b.columns.length > 0) return b.columns.map((c) => ({ ...c, label: c.label ?? fieldSaid(c.field) }));
  const first = b.rows[0];
  const field = first ? (Object.keys(first.cells)[0] ?? Object.keys(first.fields)[0]) : undefined;
  return field === undefined ? [] : [{ field, label: fieldSaid(field) }];
}

/**
 * What the page draws, in its order: its opening line, said under its name, and each block with something in it.
 *
 * A BLOCK WITH NOTHING TO SAY IS NOT A TILE. A project's own parts, a list of keys whose names a link keeps back and a
 * row of figures the record sent none of each drew a card with a heading over nothing ("Overview", "Numbers and work",
 * "Key numbers"), so a stranger read the owner's tab names as empty boxes. NOR DOES A BLOCK'S OWN `empty:` SENTENCE KEEP
 * ONE: it is written for the owner, who can fill it, and a stranger read "The road: Kiln has no stages yet." about a part
 * of the work nobody had started (audit f, AF18).
 *
 * AND IN A TILE, NO EMPTY COLUMN AND NO NAMELESS ROW: a column no row fills is not drawn ("Doing said", "Note"), and a row
 * whose first column is blank, a key whose name is kept back, is left out rather than drawn as a blank line.
 *
 * A SECTION IS KEPT ONLY OVER SOMETHING: its heading names the blocks after it, so with none of them shown it goes too.
 */
export function shownBlocks(blocks: readonly SharedBlock[], where: Where): { lead: string | null; blocks: Shown[] } {
  let lead: string | null = null;
  const out: Shown[] = [];
  for (const b of blocks) {
    if (b.kind === 'project') continue;
    if (b.kind === 'note' && b.lead && !b.heading && b.body && lead === null && !/[`#|]/u.test(b.body)) {
      lead = b.body.replace(/\s+/gu, ' ').trim();
      continue;
    }
    if (b.kind === 'section') {
      if (b.heading) out.push({ block: b, columns: [], rows: [], matched: 0 });
      continue;
    }
    const all = columnsOf(b);
    const columns = all.filter((c) => b.rows.some((r) => !blank(cellSaid(r, c, where))));
    /* THE ROW'S NAME IS ITS FIRST COLUMN THAT IS NOT ANOTHER ROW'S: an order nobody is named on is still an order, where
       a Who first left it out. READ FROM THE COLUMNS AS DECLARED, not the ones something fills: with its Name kept back from
       every row, a list of keys took its next column for the name and drew a tile of "All", "All". */
    const title = all.find((c) => c.ref !== true) ?? all[0];
    const rows = title === undefined ? [] : b.rows.filter((r) => !blank(cellSaid(r, title, where)));
    const matched = Math.max(rows.length, b.matched - (b.rows.length - rows.length));
    const says = rows.length > 0 || b.readings.length > 0 || (b.measures?.length ?? 0) > 0 || b.authored.some((cells) => cells.some((c) => plainSaid(c, where) !== '')) || Boolean(b.body) || Boolean(b.refused);
    if (says) out.push({ block: b, columns, rows, matched });
  }
  return { lead, blocks: overSomething(out) };
}

/** A section with nothing under it before the next section of its column, or the end, goes. */
const overSomething = (out: readonly Shown[]): Shown[] =>
  out.filter((s, i) => {
    if (s.block.kind !== 'section') return true;
    const next = out.slice(i + 1).find((t) => t.block.area === s.block.area);
    return next !== undefined && next.block.kind !== 'section';
  });

/**
 * THE PAGE'S TWO COLUMNS, AS THE OWNER'S PAGE LAYS THEM (SB3, `layout.ts` in the app): on a page with a rail, the blocks
 * in its main column and the ones in its rail, each in declared order and a section kept only over something in its own
 * column. `rail` is `null` on a page with none, or where only one column has anything to show, which then takes the page.
 */
export function areasOf(blocks: readonly Shown[], layout: { rail: number } | null): { main: Shown[]; rail: Shown[] | null } {
  if (layout === null) return { main: [...blocks], rail: null };
  const main = overSomething(blocks.filter((s) => s.block.area !== 'rail'));
  const rail = overSomething(blocks.filter((s) => s.block.area === 'rail'));
  if (main.length === 0) return { main: rail, rail: null };
  return { main, rail: rail.length === 0 ? null : rail };
}
