/**
 * What tells a row from another of its name: its day and amount in a line, "12 Oct 2025 · £450". This year's day says no
 * year. The panel's search and the @ list say it alike.
 */
import { moneyWhole } from 'braindog-render';
import { homeCurrency } from './api.ts';

export const factsOf = (hit: { on?: string; amount?: { amount: number; currency: string } }): string | undefined => {
  const parts: string[] = [];
  if (hit.on && /^\d{4}-\d{2}-\d{2}/u.test(hit.on)) {
    const when = new Date(`${hit.on.slice(0, 10)}T12:00:00Z`);
    const year = new Date().getUTCFullYear() === when.getUTCFullYear();
    parts.push(when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...(year ? {} : { year: 'numeric' }) }));
  }
  if (hit.amount) parts.push(moneyWhole(hit.amount.amount, hit.amount.currency, homeCurrency())?.text ?? '');
  const line = parts.filter(Boolean).join(' · ');
  return line === '' ? undefined : line;
};
