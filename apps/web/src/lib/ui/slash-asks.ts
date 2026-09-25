/**
 * Slash's row in Settings: this month's asks against the cap, the model, when the count resets, and the owner's limit
 * (`docs/23-ASSISTANT-UI.md` §8, `loop/research-spark-routes.md` §4 and Brief W1).
 *
 * PURE, SO `node --test` CAN IMPORT IT. The rules and the words live here rather than in `copy.ts`, which the palette's
 * Slash work owns this run; the component only draws what these answer.
 *
 * NO `a`/`b` SWITCH, ON PURPOSE. `research-spark-routes.md` F6 measured that on both hosts as built tier `a` already spends
 * the owner's own key, so a control offering *Use your own key* would switch between two ways of spending the same key.
 * That still holds wherever a `SLASH_ENDPOINT` is set. On a Cloud deployment with none, the Worker's included model is built
 * (`apps/worker/src/slash.ts` `includedInference`) and spends the Cloudflare account's Workers AI, and it answers only once
 * `SLASH_INCLUDED` is `yes`, which no environment sets yet. From then on, tier `a` on that deployment does not spend the
 * owner's key, and the premise of this paragraph is gone there. The row shows what the host says and lets the owner set
 * the monthly limit. The `a`/`byo` choice that §4 of the same file offers the owner, with the model name `byo` requires, is NOT built here yet:
 * that is a gap in this row, not a decision against it.
 */

import type { SlashStatus } from '@braindog/client';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ONLY TIER `a` IS METERED. `b` is the owner's key and `byo` the operator's endpoint. `23 §8` says the meter
   "disappears entirely" on `byo`, and the engine caps `b` no more than it does `byo`: the budget check in
   `packages/slash/src/propose.ts` refuses only when the tier is `a`. The package still answers `asks` on every tier, so `{ used: 0, cap: 80 }` arrives on a
   `byo` host and a row drawn from it would read `0 of 80`: a limit that nothing enforces, stated as a fact. The first
   version of `asksShown` below did exactly that, and the test that says `null` failed on `'0 of 80'`. */
const metered = (s: SlashStatus): boolean => s.tier === 'a';

/** `41 of 80` on tier `a`; `null` anywhere else, so the row is gone rather than zeroed. */
export const asksShown = (s: SlashStatus): string | null => (metered(s) ? `${s.asks.used} of ${s.asks.cap}` : null);

/** The palette's one footer line, once a month (`23 §8`, 80 %). Settings draws nothing at this point. */
export const nearCap = (s: SlashStatus): boolean => metered(s) && s.asks.used >= s.asks.cap * 0.8;

/** The `warn` chip on the Settings row. A cap of zero is at the cap before the first ask, which is what zero means. */
export const atCap = (s: SlashStatus): boolean => metered(s) && s.asks.used >= s.asks.cap;

/* THE RESET IS MIDNIGHT UTC ON THE FIRST (`monthOf` in `packages/slash/src/call.ts` builds it with `Date.UTC`), so the day is
   read off the string and not through `new Date(...)`: in any zone west of Greenwich a local date says the last day of the
   month before, a day early for a count that resets on the first. */
/** `2026-10-01T00:00:00.000Z` as a person says it: 1 October 2026. Anything else is shown as it came. */
export const resetsWords = (resets: string): string => {
  const day = /^(\d{4})-(\d{2})-(\d{2})/u.exec(resets);
  return day ? `${Number(day[3])} ${MONTHS[Number(day[2]) - 1]} ${day[1]}` : resets;
};

/* ANY NUMBER GOES TO THE ENGINE, AND ONLY A NON-NUMBER STAYS HERE. A fraction or a negative is refused by `configure` with
   its own sentence ("a whole number of asks, and zero turns Slash off"), and a refusal is shown verbatim (`13 §6`), so a
   second rule here would be a second sentence for the same mistake that could drift from the first. Letters are not sent
   at all: the door's answer to a string names `ask_cap`, the schema's word, which a person never typed. */
/** What the owner typed, as the number to send, or `null` when there is nothing to send. */
export const capOf = (typed: string): number | null => {
  const t = typed.trim();
  const n = Number(t);
  return t === '' || !Number.isFinite(n) ? null : n;
};

/** The toast after a saved limit. */
export const capSaid = (cap: number): string =>
  cap === 0 ? 'Slash is off until you raise the limit.' : `Slash answers up to ${cap} ${cap === 1 ? 'ask' : 'asks'} a month.`;

export const words = {
  title: 'Slash',
  asks: 'Asks this month',
  model: 'Model',
  resets: 'Resets',
  spent: 'Out of asks',
  noModel: 'This host has no model set up for Slash, so there are no asks to count.',
  capLabel: 'Monthly limit',
  capHint: 'The most asks Slash answers in a month. Zero turns Slash off.',
  capGo: 'Save the limit',
} as const;
