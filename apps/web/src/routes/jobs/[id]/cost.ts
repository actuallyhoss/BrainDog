/**
 * A job's cost in words, for the one figure `Money` would draw wrong.
 *
 * ONE MINOR UNIT IS "UNDER THE SMALLEST COIN". The runner rounds a run's cost up to the next cent, so a run that cost
 * $0.0042 arrives as 1; drawn as money it would read `$0.01`, a figure the run never cost. It reads "under $0.01"
 * instead. Every other figure, nought included (a run that truly cost nothing), is drawn by `Money` as it was, and this
 * answers null for it.
 *
 * THE COIN IS SPELLED BY THE ONE WRITER, the way `Money` spells the figure beside it: the stored form (`money()`) read
 * by `symbolText` against the record's home currency. It was its own `Intl` currency format, so on a record kept in
 * pounds the coin read `$0.01` while every other dollar on the screen read `$0.01 USD`, and an Egyptian pound read
 * `EGP 0.01` here only by luck of the runtime.
 */

import { money } from 'braindog-render';
import { homeCurrency } from '../../../lib/record/api.ts';
import { symbolText } from '../../../lib/record/money.ts';

export function costWords(minor: number, currency: string, home: string | null = homeCurrency()): string | null {
  if (minor !== 1) return null;
  return `under ${symbolText(money(1, currency.toUpperCase()), home, 'exact')}`;
}
