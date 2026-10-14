/**
 * A job's cost in words, for the one figure `Money` would draw wrong.
 *
 * ONE MINOR UNIT IS "UNDER THE SMALLEST COIN". The runner rounds a run's cost up to the next cent, so a run that cost
 * $0.0042 arrives as 1; drawn as money it would read `$0.01`, a figure the run never cost. It reads "under $0.01"
 * instead. Every other figure, nought included (a run that truly cost nothing), is drawn by `Money` as it was, and this
 * answers null for it.
 */

import { exponentOf } from 'braindog-render';

export function costWords(minor: number, currency: string): string | null {
  if (minor !== 1) return null;
  const exp = exponentOf(currency);
  let coin: string;
  try {
    coin = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: exp, maximumFractionDigits: exp }).format(10 ** -exp);
  } catch {
    coin = `${currency.toUpperCase()} ${(10 ** -exp).toFixed(exp)}`;
  }
  return `under ${coin}`;
}
