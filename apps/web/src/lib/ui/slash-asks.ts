/**
 * Slash's row in Settings: this month's asks against the cap, the model, when the count resets, and the owner's limit
 * (`docs/23-ASSISTANT-UI.md` §8, `loop/research-spark-routes.md` §4 and Brief W1).
 *
 * PURE, SO `node --test` CAN IMPORT IT. The rules and the words live here rather than in `copy.ts`, which the palette's
 * Slash work owns this run; the component only draws what these answer.
 *
 * THE CHOICE OF MODEL IS `SlashModel`'s, beside this row: "Included" or "Your own key" (`loop/finish/agents.md` AGT-21).
 * This row shows what the host says of the choice made. On the included model the month's asks against the cap, and the
 * limit the owner sets. On his own key the same count with no cap beside it, because his asks there are listed and not
 * capped (`agents.md` §5 item 7): the host says so with `asks.capped: false`.
 */

import type { SlashStatus } from '@braindog/client';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ONLY THE INCLUDED MODEL IS METERED. `23 §8` says the meter "disappears entirely" on `byo`, the operator's endpoint, and
   on his own key the host answers `capped: false`. The package still answers `asks` on every tier, so `{ used: 0, cap: 80 }`
   arrives on a `byo` host and a row drawn from it would read `0 of 80`: a limit that nothing enforces, stated as a fact.
   The first version of `asksShown` below did exactly that, and the test that says `null` failed on `'0 of 80'`. A host a
   release behind says no `capped`, and there tier `a` alone is metered, as it always was. */
export const metered = (s: SlashStatus): boolean => (s.asks.capped === undefined ? s.tier === 'a' : s.asks.capped && s.tier !== 'byo');

/** On his own key: the count is his to see, and nothing stops at it. */
const listed = (s: SlashStatus): boolean => s.asks.capped === false && (s.source === 'key' || s.tier === 'b');

/** `41 of 80` on the included model; `12` on his own key, listed and not capped; `null` on `byo`, gone rather than zeroed. */
export const asksShown = (s: SlashStatus): string | null => (metered(s) ? `${s.asks.used} of ${s.asks.cap}` : listed(s) ? String(s.asks.used) : null);

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
  keyAsks: 'Asks on your key this month',
  keyHint: 'Your provider bills these, so Slash lists them and sets no limit.',
  model: 'Model',
  resets: 'Resets',
  spent: 'Out of asks',
  noModel: 'This host has no model set up for Slash, so there are no asks to count.',
  capLabel: 'Monthly limit',
  capHint: 'The most asks Slash answers in a month. Zero turns Slash off.',
  capGo: 'Save the limit',
} as const;
