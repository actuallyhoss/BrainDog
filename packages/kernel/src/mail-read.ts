/**
 * What a forwarded mail is about, read by rules alone: an invoice or receipt, a renewal notice, a shipping or booking
 * confirmation, and who it names. Pure text in, plain facts out; nothing here reads the record, follows a link or opens
 * an attachment. A figure or a day that is not read cleanly is left out and marked, never guessed: a guess would be filed as if it were read.
 */

import { isCurrencyCode } from './coerce.ts';

export type MailKind = 'invoice' | 'receipt' | 'renewal' | 'shipping' | 'none';

export type MailMoney = { amount: number; currency: string };

export type MailPerson = { name?: string; email: string };

export type MailRead = {
  kind: MailKind;
  /** The sender's address and domain after unwrapping a forward, or '' when the mail names none. */
  from: MailPerson | null;
  domain: string;
  /** Total as printed; absent when none was read or the reading is in doubt, and `amountClean` says which. */
  amount?: MailMoney;
  amountClean: boolean;
  due?: string;
  renewsOn?: string;
  /** A shipping or booking day. */
  date?: string;
  ref?: string;
  /** Others the mail names with a real address, never more than `MOST_NAMED`. */
  named: MailPerson[];
  /** The words the mail used about itself that read like money business but no rule could place. */
  looksFinancial: boolean;
};

export const MOST_NAMED = 5;

const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u;

/** The longest header value an address is read from: past it a stranger's header is cut, not parsed. */
export const HEADER_READ = 8192;

/**
 * A header value cut at its commas outside quotes, in one pass: a comma splits when an even number of quotes follows
 * it. A lookahead that counted them again at every comma cost the length times the commas, which a stranger's long
 * From header turned into minutes of a record's time.
 */
export function splitMailboxes(header: string): string[] {
  const text = header.slice(0, HEADER_READ).replace(/\r?\n[ \t]+/gu, ' ');
  const parts: string[] = [];
  let after = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '"') after += 1;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') after -= 1;
    else if (text[i] === ',' && after % 2 === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/** Mailboxes in a header value, split at commas outside quotes. Only a real address counts; a name alone is dropped. */
export function mailboxes(header: string | undefined): MailPerson[] {
  const out: MailPerson[] = [];
  const parts = splitMailboxes(header ?? '');
  for (const part of parts) {
    const angled = /^(.*?)<\s*(?:mailto:)?([^<>\s]+@[^<>\s]+?)\s*>/u.exec(part);
    const email = (angled?.[2] ?? /([^\s<>"(),;]+@[^\s<>"(),;]+)/u.exec(part)?.[1] ?? '').toLowerCase().replace(/\.$/u, '');
    if (!ADDRESS.test(email)) continue;
    const name = (angled?.[1] ?? '').trim().replace(/^"([\s\S]*)"$/u, '$1').trim();
    if (!out.some((p) => p.email === email)) out.push(name === '' || name.toLowerCase() === email ? { email } : { name, email });
  }
  return out;
}

/** The head of a forwarded message inside a body: its From, To, Cc and Subject lines, unquoted. `null` when the body is not a forward. */
export function forwardedHead(body: string): { from?: string; to?: string; cc?: string; subject?: string } | null {
  const mark = /^[ \t>]*(?:-{2,}\s*(?:Forwarded message|Original Message)\s*-{2,}|Begin forwarded message:)/imu.exec(body);
  if (!mark) return null;
  const lines = body.slice(mark.index + mark[0].length).split(/\r?\n/u).slice(0, 24);
  const head: { from?: string; to?: string; cc?: string; subject?: string } = {};
  for (const line of lines) {
    const m = /^[ \t>*]*(From|To|Cc|Subject):\s*(.*)$/iu.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase() as 'from' | 'to' | 'cc' | 'subject';
    if (head[key] === undefined) head[key] = m[2]!.replace(/\*/gu, '').trim();
  }
  return head.from === undefined ? null : head;
}

/* ── money ──────────────────────────────────────────────────────────────── */

const ZERO_PLACES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX']);
const THREE_PLACES = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);
export const places = (currency: string): number => (ZERO_PLACES.has(currency) ? 0 : THREE_PLACES.has(currency) ? 3 : 2);

/** A printed number into minor units with no float in between. `clean` is false when its separators could mean two things. */
export function minorOf(printed: string, exp: number): { minor: number; clean: boolean } | null {
  const s = printed.replace(/[\s ]/gu, '');
  if (!/^\d[\d.,]*$/u.test(s) || /[.,]$/u.test(s)) return null;
  const dots = (s.match(/\./gu) ?? []).length;
  const commas = (s.match(/,/gu) ?? []).length;
  let whole = s;
  let frac = '';
  let clean = true;
  if (dots > 0 && commas > 0) {
    const at = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    whole = s.slice(0, at).replace(/[.,]/gu, '');
    frac = s.slice(at + 1);
    if (s.slice(0, at).split(/[.,]/u).slice(1).some((g) => g.length !== 3)) return null;
  } else if (dots + commas > 1) {
    const sep = dots > 1 ? '.' : ',';
    if (s.split(sep).slice(1).some((g) => g.length !== 3)) return null;
    whole = s.split(sep).join('');
  } else if (dots + commas === 1) {
    const at = s.search(/[.,]/u);
    const after = s.slice(at + 1);
    if (after.length === 3 && exp !== 3) {
      whole = s.slice(0, at) + after;
      clean = false;
    } else {
      whole = s.slice(0, at);
      frac = after;
    }
  }
  if (frac.length > exp || whole.length > 12) return null;
  const minor = Number(whole + frac.padEnd(exp, '0'));
  return Number.isSafeInteger(minor) ? { minor, clean } : null;
}

const NUMBER = '\\d{1,3}(?:[., \\u00a0]\\d{3})+(?:[.,]\\d{1,3})?|\\d+(?:[.,]\\d{1,3})?';
const MONEY_RE = new RegExp(`(?:\\b([A-Z]{3}) ?(${NUMBER}))|(?:([£€$]) ?(${NUMBER}))|(?:(${NUMBER}) ?([A-Z]{3})\\b)`, 'gu');
const SYMBOL: Record<string, string> = { '£': 'GBP', '€': 'EUR', $: 'USD' };

/**
 * Money written in free text, as `MONEY_RE` reads it, held apart from the words around it: nothing word-like or a
 * separated digit just before, so an id or a cursor that happens to hold `9USD` is never read as money, and nothing
 * word-like just after. A symbol's amount may end in k, m or bn, as "£1.5k" is written.
 */
const MONEY_IN_TEXT = new RegExp(`(?<![\\w.,])(?:([A-Z]{3}) ?(${NUMBER})|([£€$]) ?(${NUMBER})(?:k|m|bn)?|(${NUMBER}) ?([A-Z]{3}))(?!\\w)`, 'gu');

/** What an amount out of sight is written as: its currency kept, its number gone. */
export const MONEY_MASK = '…';

/**
 * Text with every amount written in it taken out (sharing plan §2.7, "Hide amounts"): "Paid £923.47 for clay" is "Paid
 * £… for clay", "GBP 400" is "GBP …" and "400 EUR" is "… EUR". Read by `MONEY_RE`'s own shapes and its own currency
 * check, so what is masked is what a mail's amount is read as; a number with no currency beside it stays.
 */
export function maskMoneyText(text: string): string {
  if (!/\d/u.test(text)) return text;
  return text.replace(MONEY_IN_TEXT, (whole, code: string | undefined, _a, symbol: string | undefined, _b, _c, after: string | undefined) => {
    const currency = code ?? after ?? SYMBOL[symbol ?? ''];
    if (currency === undefined || !isCurrencyCode(currency)) return whole;
    if (code !== undefined) return `${code} ${MONEY_MASK}`;
    if (symbol !== undefined) return `${symbol}${MONEY_MASK}`;
    return `${MONEY_MASK} ${after}`;
  });
}

type Token = { at: number; money: MailMoney; clean: boolean; line: string; before: string };

function moneyTokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const code = m[1] ?? m[6];
    const printed = m[2] ?? m[4] ?? m[5];
    const symbol = m[3];
    if (printed === undefined) continue;
    const currency = code ?? SYMBOL[symbol ?? ''];
    if (currency === undefined || !isCurrencyCode(currency)) continue;
    const read = minorOf(printed, places(currency));
    if (read === null) continue;
    const at = m.index ?? 0;
    const start = text.lastIndexOf('\n', at - 1) + 1;
    const end = text.indexOf('\n', at);
    out.push({
      at,
      money: { amount: read.minor, currency },
      /* A BARE DOLLAR SIGN NAMES NO COUNTRY'S DOLLAR, so it is read and never trusted. */
      clean: read.clean && symbol !== '$',
      line: text.slice(start, end === -1 ? text.length : end),
      before: text.slice(Math.max(start, at - 48), at),
    });
  }
  return out;
}

/* Lower rank is a better label. A subtotal, tax or shipping line is never the total. */
const RANKS: [number, RegExp][] = [
  [1, /(?:amount due|total due|balance due|amount payable|please pay|payment due|total payable)\W*$/iu],
  [2, /(?<![a-z])(?:total|amount paid|you paid|paid|payment of|charged|renewal (?:price|cost|amount)|renews at|invoice amount)\W*(?:\([^)]*\))?\W*$/iu],
  [3, /(?:amount|price|cost)\W*$/iu],
];
const NOT_TOTAL = /sub-?total|tax|vat|gst|shipping|delivery fee|discount|saving/iu;

/** The one labelled total, or absent with `clean: false` when two different totals compete or none is labelled. */
export function readTotal(text: string): { money?: MailMoney; clean: boolean } {
  const ranked = moneyTokens(text)
    .map((t) => {
      if (NOT_TOTAL.test(t.before)) return null;
      const rank = RANKS.find(([, re]) => re.test(t.before))?.[0];
      return rank === undefined ? null : { rank, t };
    })
    .filter((r): r is { rank: number; t: Token } => r !== null);
  if (ranked.length === 0) return { clean: false };
  const best = Math.min(...ranked.map((r) => r.rank));
  const top = ranked.filter((r) => r.rank === best);
  const keys = new Set(top.map((r) => `${r.t.money.currency}${r.t.money.amount}`));
  if (keys.size !== 1) return { clean: false };
  return { money: top[0]!.t.money, clean: top.every((r) => r.t.clean) };
}

/* ── days ───────────────────────────────────────────────────────────────── */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DAY_RES: { re: RegExp; pick: (m: RegExpMatchArray) => [string, string, string] }[] = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/gu, pick: (m) => [m[1]!, m[2]!, m[3]!] },
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON},?\\s+(\\d{4})\\b`, 'giu'), pick: (m) => [m[3]!, String(MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1), m[1]!] },
  { re: new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'giu'), pick: (m) => [m[3]!, String(MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1), m[2]!] },
];

type DayToken = { at: number; day: string; before: string };

function dayTokens(text: string): DayToken[] {
  const out: DayToken[] = [];
  for (const { re, pick } of DAY_RES)
    for (const m of text.matchAll(re)) {
      const [y, mo, d] = pick(m).map(Number) as [number, number, number];
      const when = new Date(Date.UTC(y, mo - 1, d));
      if (!(mo >= 1 && mo <= 12) || when.getUTCFullYear() !== y || when.getUTCMonth() !== mo - 1 || when.getUTCDate() !== d) continue;
      const at = m.index ?? 0;
      const start = text.lastIndexOf('\n', at - 1) + 1;
      out.push({ at, day: when.toISOString().slice(0, 10), before: text.slice(Math.max(start, at - 44), at) });
    }
  return out;
}

/** The day printed after a label; absent when no day follows it or two different days do. */
export function dayAfter(text: string, label: RegExp): string | undefined {
  const days = new Set(dayTokens(text).filter((t) => label.test(t.before)).map((t) => t.day));
  return days.size === 1 ? [...days][0] : undefined;
}

const DUE = /(?:due(?: date)?|pay(?:able)? by|payment due|due on|due by)\W*$/iu;
const RENEWS = /(?:renew(?:s|al)?(?: date)?(?: on)?|will renew on|next (?:billing|payment) date|expires?(?: on)?|expiry date|expiration date)\W*$/iu;
const SHIPS = /(?:deliver(?:y|ed)?(?: date)?|arriv(?:es|al)|estimated(?: delivery)?|ship(?:s|ped)? on|dispatch(?:ed)?|check-?in|departure|pick-?up|booking date|arrive by)\W*$/iu;

/* ── kind ───────────────────────────────────────────────────────────────── */

const MONEYISH = /\b(invoice|receipt|bill|payment|statement|amount due|order total|subscription|renew|renewal|charged)\b/iu;

function classify(subject: string, body: string, hasRenewDay: boolean): MailKind {
  const score = (re: RegExp): number => (re.test(subject) ? 3 : 0) + (re.test(body) ? 1 : 0);
  const renew = score(/\b(renew(?:s|al|ed)?|auto-?renew|expires?|expiry|expiring)\b/iu);
  const ship = score(/\b(shipped|dispatched|tracking|out for delivery|delivery|booking|reservation|itinerary|check-?in|e-?ticket)\b/iu);
  const paid = score(/\b(receipt|you paid|payment received|thank you for your payment|paid in full)\b/iu);
  const bill = score(/\b(invoice|amount due|balance due|bill|payment due)\b/iu);
  if (hasRenewDay && renew > 0 && renew >= Math.max(bill, paid)) return 'renewal';
  if (paid > 0 && paid >= bill) return 'receipt';
  if (bill > 0 && bill >= ship) return 'invoice';
  if (ship > 0) return 'shipping';
  return 'none';
}

const REF = /\b(?:invoice|receipt|order|booking|reference|confirmation)\s*(?:no\.?|number|#|ref\.?)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,24})\b/iu;

/** One mail read by rules: the forwarded sender if it is a forward, the kind, the total, the days and who it names. */
export function readMail(m: { from?: string; to?: string; cc?: string; subject?: string; body?: string }): MailRead {
  const body = (m.body ?? '').slice(0, 20_000);
  const forwarded = forwardedHead(body);
  const subject = (forwarded?.subject ?? m.subject ?? '').replace(/^\s*(?:(?:fwd?|re):\s*)+/iu, '');
  const from = mailboxes(forwarded?.from ?? m.from)[0] ?? null;
  const exclude = new Set([...mailboxes(m.to).map((p) => p.email), ...(from ? [from.email] : [])]);
  const named = [...mailboxes(m.cc), ...mailboxes(forwarded?.to), ...mailboxes(forwarded?.cc)]
    .filter((p, i, all) => !exclude.has(p.email) && all.findIndex((q) => q.email === p.email) === i)
    .slice(0, MOST_NAMED);

  const text = `${subject}\n${body}`;
  const renewsOn = dayAfter(text, RENEWS);
  const kind = classify(subject, body, renewsOn !== undefined);
  const total = kind === 'none' || kind === 'shipping' ? { clean: false } : readTotal(text);
  const ref = REF.exec(text)?.[1];
  const due = kind === 'invoice' ? dayAfter(text, DUE) : undefined;
  const date = kind === 'shipping' ? dayAfter(text, SHIPS) : undefined;

  return {
    kind,
    from,
    domain: from ? from.email.slice(from.email.lastIndexOf('@') + 1) : '',
    ...(total.money ? { amount: total.money } : {}),
    amountClean: total.money !== undefined && total.clean,
    ...(due ? { due } : {}),
    ...(kind === 'renewal' && renewsOn ? { renewsOn } : {}),
    ...(date ? { date } : {}),
    ...(ref ? { ref } : {}),
    named,
    looksFinancial: kind === 'none' && MONEYISH.test(text),
  };
}
