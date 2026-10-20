/**
 * A HIT'S SECOND LINE, THE ONE THAT TELLS IT FROM THE NEXT (money F12). Three "Kiln storefront payout" lines under
 * Ledger said "Ledger" three times; each now says its day and its amount. A row with a deadline says it as its list's
 * Due cell does ("64 days late", "Due 7 Sep"), and a row with none says its first day. The amount follows either way.
 * A row that holds neither says nothing here, and the page falls back to why it matched or the list it is in.
 */

import type { Entry, RegisterDecl } from '../../lib/record/schema.ts';
import { amountOf, currencyOf } from '../../lib/record/money.ts';
import { dueOf } from '../r/[register]/parts/list.ts';
import { daySaid } from '../r/[register]/[seq]/said.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

export type Second = { text: string; late: boolean };

export function secondOf(
  decl: RegisterDecl | undefined,
  e: Entry,
  now: number,
  moneySaid: (minor: number, currency: string) => string,
): Second | null {
  if (!decl) return null;
  const parts: string[] = [];
  const due = dueOf(decl, e, now);
  if (due) parts.push(due.text);
  else {
    const day = decl.fields.find((f) => f.type === 'day' && typeof e.fields[f.id] === 'string' && DAY.test(String(e.fields[f.id])));
    if (day) parts.push(daySaid(String(e.fields[day.id]), now));
  }
  const amount = decl.fields.find((f) => f.type === 'money' && amountOf(e.fields[f.id]) !== null);
  if (amount) parts.push(moneySaid(amountOf(e.fields[amount.id])!, currencyOf(e.fields[amount.id]) ?? ''));
  return parts.length === 0 ? null : { text: parts.join(' · '), late: due?.late ?? false };
}
