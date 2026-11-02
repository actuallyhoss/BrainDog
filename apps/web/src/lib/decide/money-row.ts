/**
 * A QUESTION ABOUT MONEY THAT FELL DUE, AS ONE ROW (today F4): what it is, the amount on its own at the end, how late in
 * red, and the answer that says the amount ("Chase £4,800"). The record words these questions one way ("Invoice
 * 2026-041: brand system was due 38 days ago, £4,800. Chase it?"), and the row takes that sentence apart rather than
 * printing it whole, so the amount, how late and the answer each have their own place. A question worded any other
 * way is not a money row, and its card draws it as it always did.
 *
 * A SERVICE ABOUT TO RENEW IS THE SAME ROW (2 Nov): "kiln.example renews in 12 days for £14. Keep it?" is its name, the
 * amount, "Renews in 12 days" (never red, since nothing is late) and Keep it and Cancel it, beside the invoices in Money.
 *
 * And what an answer leaves (today F7): the outcome with its object ("Chased Invoice 2026-041: brand system for
 * £4,800"), never only the option's name.
 *
 * PURE, AND NODE LOADS IT.
 */

/** A money question as its row draws it. */
export type MoneyRow = {
  /** What fell due, as the record names it: "Invoice 2026-041: brand system". */
  title: string;
  /** The amount, as the card's sentence drew it: "£4,800". */
  amount: string;
  /** How late, in the row's own words: "38 days late". */
  late: string;
  /** What the record asks about it, when the answer's own words do not already say it: "Did it go through?". */
  asks: string;
  /** Money owed to you (a chase), as against money you owe. */
  owed: boolean;
  /** What the date is: money that fell `due`, or a service that `renews`. A renewal is not late, so it is not red. */
  kind: 'due' | 'renews';
  /** Days from now to the date: below nought when it is late, so a column can put the soonest first. */
  days: number;
};

/** "X was due 38 days ago, £4,800. Chase it?" The amount runs to the full stop a space follows, so "£12.50." is whole. */
const DUE = /^(.+?) was due (\d+) days? ago, (.+?)\.\s+(.+\?)$/u;

/* "kiln.example renews in 12 days for £14. Keep it?" (estate's `renew-soon`), and today and tomorrow as the record says
   them. The same row as money that fell due: what it is, the amount, when, and Keep it and Cancel it as its answers. */
const RENEWS = /^(.+?) renews (today|tomorrow|in (\d+) days?) for (.+?)\.\s+(.+\?)$/u;

/** When it renews, as the row says it. */
const renewWords = (n: number): string => (n === 0 ? 'Renews today' : n === 1 ? 'Renews tomorrow' : `Renews in ${n.toLocaleString('en-GB')} days`);

/** How late, as the row says it. */
const lateWords = (n: number): string => (n === 0 ? 'Due today' : `${n.toLocaleString('en-GB')} ${n === 1 ? 'day' : 'days'} late`);

/** The question's sentence as a row, or `null` for a question that is not worded as money that fell due. */
export function moneyRowOf(question: string, answers: readonly string[] = []): MoneyRow | null {
  const r = RENEWS.exec(question.trim());
  if (r) {
    const [, title, when, n, amount, asks] = r as unknown as [string, string, string, string | undefined, string, string];
    if (!/\d/u.test(amount)) return null;
    const days = when === 'today' ? 0 : when === 'tomorrow' ? 1 : Number(n);
    const said = answers.some((a) => `${a.trim()}?`.toLowerCase() === asks.trim().toLowerCase());
    return { title: title.trim(), amount: amount.trim(), late: renewWords(days), asks: said ? '' : asks.trim(), owed: false, kind: 'renews', days };
  }
  const m = DUE.exec(question.trim());
  if (!m) return null;
  const [, title, days, amount, asks] = m as unknown as [string, string, string, string, string];
  if (!/\d/u.test(amount)) return null;
  const owed = /\bchase\b/iu.test(asks) || answers.some((a) => /^chase\b/iu.test(a));
  /* "Chase it?" BESIDE A BUTTON THAT SAYS "Chase £4,800" SAYS NOTHING MORE, so it is left off the row. */
  const said = answers.some((a) => `${a.trim()}?`.toLowerCase() === asks.trim().toLowerCase());
  return { title: title.trim(), amount: amount.trim(), late: lateWords(Number(days)), asks: said ? '' : asks.trim(), owed, kind: 'due', days: -Number(days) };
}

/** The answer that names the amount: "Chase it" becomes "Chase £4,800". Any other answer keeps its words. */
export function amountAnswer(label: string, amount: string): string {
  return /^chase it$/iu.test(label.trim()) ? `Chase ${amount}` : label;
}

/** The verbs an answer opens on, and how the line it leaves says them done. */
const DONE: Readonly<Record<string, string>> = {
  accept: 'Accepted',
  approve: 'Approved',
  archive: 'Archived',
  chase: 'Chased',
  decline: 'Declined',
  drop: 'Dropped',
  file: 'Filed',
  keep: 'Kept',
  merge: 'Merged',
  move: 'Moved',
  park: 'Parked',
  pay: 'Paid',
  reject: 'Declined',
  retire: 'Retired',
  send: 'Sent',
  skip: 'Skipped',
  use: 'Used',
};

/**
 * WHAT AN ANSWER DID, in one line (today F7): the answer's verb done, and what it was done to. "Chase it" on a money row
 * is "Chased Invoice 2026-041: brand system for £4,800"; "Accept" on a question is "Accepted: Update Kiln’s note"; an
 * answer that opens on no verb this knows is said in its own words, quoted.
 */
export function outcomeOf(label: string, about: { title: string; amount?: string } | null): string {
  const words = label.trim();
  const [first = '', ...rest] = words.split(/\s+/u);
  const done = DONE[first.toLowerCase()];
  if (!done) return `“${words}”`;
  const tail = rest.join(' ');
  if (about?.amount && /^(it)?$/iu.test(tail)) return `${done} ${about.title} for ${about.amount}`;
  if (about && tail === '') return `${done}: ${about.title.replace(/\?$/u, '')}`;
  return tail === '' ? done : `${done} ${tail}`;
}
