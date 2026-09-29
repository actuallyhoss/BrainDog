/**
 * Slash's row in Settings: this month's asks against the cap, the model, when the count resets, and the owner's limit
 * (`docs/23-ASSISTANT-UI.md` §8).
 *
 * PURE, SO `node --test` CAN IMPORT IT. The rules and the words live here, beside the components that draw them
 * (`SlashAsks.svelte` in Settings, `SlashUsage.svelte` and `SlashOut.svelte` on `/usage`), and the components only
 * draw what these answer.
 *
 * THE CHOICE OF MODEL IS `SlashModel`'s, beside this row: "Included" or "Your own key".
 * This row shows what the host says of the choice made. On the included model the month's asks against the cap, and the
 * limit the owner sets. On his own key the same count with no cap beside it, because his asks there are listed and not
 * capped: the host says so with `asks.capped: false`.
 *
 * WHAT SLASH SPENT IS HERE TOO, for the Slash section of `/usage`: the month's asks and the
 * background work's own allowance, apart, then the asks by day with what each cost and what it filed, and when the month
 * is spent, the two ways on. `SlashUsage.svelte` draws it and `SlashOut.svelte` draws the two buttons.
 */

import { since } from 'braindog-render';
import type { SlashAsked, SlashStatus } from '@braindog/client';

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

/**
 * How many calls the Slash section on `/usage` asks the ledger for: the most its door answers (`history` in
 * `packages/slash/src/index.ts`), so an ordinary month is read whole and a busy one says it was not.
 */
export const LEDGER_FETCHED = 100;

/**
 * The asks a month Slash's background work may spend: `BACKGROUND_ASKS_MONTH` in `packages/slash/src/types.ts`, restated
 * because the web never imports the engine, as `BACKGROUND_JOBS_MONTH` in `packages/host/src/model-jobs.ts` restates it
 * for the same reason. The status door says his cap and not this one, so this is the figure the section is measured to.
 */
export const BACKGROUND_ASKS_MONTH = 60;

/* WORK NOBODY ASKED FOR. The host's background meter (`backgroundMeter` in `packages/host/src/model-jobs.ts`) counts a
   digest's prose and a pattern drafted for the record, which files nothing itself; a pattern that filed a proposal was a
   press of his, so it is his. Sorting the inbox and indexing for search are the record's own work as well. */
const BACKGROUND: ReadonlySet<string> = new Set(['prose', 'triage', 'embed']);

/** Whether a call on the ledger was background work rather than a question of his. */
export const isBackground = (a: Pick<SlashAsked, 'kind' | 'filed'>): boolean =>
  BACKGROUND.has(a.kind) || (a.kind === 'pattern' && a.filed === null);

/* WHAT A CALL COST IS WHAT A METER COUNTED FOR IT, and no second rule. `asksUsed` in `packages/slash/src/call.ts` counts
   `read`, `propose` and `pattern` against his cap, and the background meter counts `prose` and an unfiled `pattern`
   against its own; both pass over `-`, a model never reached. Every other kind is counted by neither, so it cost nothing.
   The door says no cost of its own, so this is the meters' rule read back, and it moves when theirs does. */
const METERED: ReadonlySet<string> = new Set(['read', 'propose', 'pattern', 'prose']);

/** The asks one call cost: 1 when a meter counted it, 0 when none did. */
export const costOf = (a: Pick<SlashAsked, 'kind' | 'model'>): number => (a.model !== '-' && METERED.has(a.kind) ? 1 : 0);

/** One line of the day: a question of his, or a piece of background work, and what it cost. */
export type SpentLine = {
  id: string;
  /** What was asked, or what the work was when nobody asked. */
  what: string;
  when: string;
  cost: number;
  /** Decide's page for the proposal it filed, or `null` when it filed none. */
  href: string | null;
  refused: boolean;
  background: boolean;
};

/** A day of the month with anything on the ledger: its asks and its background asks, apart, and its lines. */
export type SpentDay = { day: string; label: string; asks: number; background: number; lines: SpentLine[] };

/**
 * The month as the ledger lists it. `whole` is `false` when the door's list ended inside the month, so the counts below
 * are the newest calls' and not the month's.
 */
export type SpentMonth = { days: SpentDay[]; asks: number; background: number; whole: boolean };

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* THE DAY IS THE LEDGER'S, IN UTC, as the month is (`monthOf` in `packages/slash/src/call.ts`), so a day's asks add up to
   the month's count and nothing near midnight falls into the month either side. It is read off the string for the reason
   `resetsWords` gives. */
/** `2026-09-26` as a day heading: Today, Yesterday, then 26 Sep. */
export const dayWords = (day: string, now: number): string => {
  const today = new Date(now).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === new Date(now - 86_400_000).toISOString().slice(0, 10)) return 'Yesterday';
  const d = /^\d{4}-(\d{2})-(\d{2})$/u.exec(day);
  return d ? `${Number(d[2])} ${SHORT[Number(d[1]) - 1] ?? ''}`.trim() : day;
};

/** What a piece of background work was, by the ledger's kind. */
const WORK = new Map<string, string>([
  ['prose', 'Summary for a digest'],
  ['pattern', 'Pattern drafted for the inbox'],
  ['triage', 'Inbox sorted'],
  ['embed', 'Search kept up to date'],
]);

/**
 * The ledger's calls in `month` (`YYYY-MM`), by day, newest first.
 *
 * A READ AND ITS PROPOSAL ARE ONE QUESTION ON ONE LINE. Pass 2 is settled after pass 1, so the ledger, newest first,
 * lists the proposal and then the read with the same question under it (`askedLately` in `lib/palette/slash-ask.ts` folds
 * the same pair). Only that pair is folded: the same question asked twice in a row is two lines. The line's cost is what
 * the meter counted for both passes, so the day's figures add up to the month's count above them.
 */
export function spentIn(rows: readonly SlashAsked[], month: string, now: number = Date.now()): SpentMonth {
  const days: SpentDay[] = [];
  let asks = 0;
  let background = 0;
  /* The line a proposal opened, waiting for the read that drafted it. */
  let waiting: SpentLine | null = null;
  for (const a of rows) {
    if (a.ts.slice(0, 7) !== month) continue;
    const day = a.ts.slice(0, 10);
    let d = days.find((x) => x.day === day);
    if (!d) {
      d = { day, label: dayWords(day, now), asks: 0, background: 0, lines: [] };
      days.push(d);
    }
    const bg = isBackground(a);
    const cost = costOf(a);
    const href = a.filed === null ? null : `/decide/${encodeURIComponent(a.filed)}`;
    const refused = a.status === 'refused' || a.status === 'error';
    const what = bg ? (WORK.get(a.kind) ?? words.workOther) : a.question?.trim() || words.erased;
    if (bg) {
      d.background += cost;
      background += cost;
    } else {
      d.asks += cost;
      asks += cost;
    }
    if (!bg && a.kind === 'read' && waiting !== null && waiting.what === what && d.lines.includes(waiting)) {
      waiting.cost += cost;
      waiting.refused = waiting.refused && refused;
      waiting = null;
      continue;
    }
    const line: SpentLine = { id: a.id, what, when: since(a.ts, now), cost, href, refused, background: bg };
    d.lines.push(line);
    waiting = !bg && a.kind === 'propose' && a.question !== null ? line : null;
  }
  const oldest = rows[rows.length - 1];
  const whole = rows.length < LEDGER_FETCHED || (oldest !== undefined && oldest.ts.slice(0, 7) < month);
  return { days, asks, background, whole };
}

/** A call's cost as the line says it. */
export const costSaid = (cost: number, background: boolean): string =>
  cost === 0 ? words.free : `${cost} ${background ? 'background ' : ''}${cost === 1 ? 'ask' : 'asks'}`;

/** His asks this month, as the section's first meter says them, or `null` on `byo`, where nothing is counted. */
export const asksLine = (s: SlashStatus): string | null => {
  const shown = asksShown(s);
  if (shown === null) return null;
  return metered(s) ? `${shown} asks this month` : `${shown} ${s.asks.used === 1 ? 'ask' : 'asks'} on your key this month`;
};

/** The background allowance's line. Counted from a list that ended inside the month, it is a floor, and says so. */
export const backgroundLine = (m: SpentMonth): string =>
  `${m.whole ? '' : 'At least '}${m.background} of ${BACKGROUND_ASKS_MONTH} background asks this month`;

/**
 * Where the two buttons go when the month's asks are spent. Both are the Agents area of
 * Settings, where `SlashModel` is: "Use your own key" lands on its own-key choice, whose hint carries that id.
 */
export const outOfAsks = { key: '/settings/agents#slash-kind-key', settings: '/settings/agents' } as const;

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
  /* The Slash section of `/usage`. */
  byDay: 'Asks by day',
  none: 'Nothing asked of Slash this month. Each question you ask, and what it cost, is listed here by day.',
  partial: 'The newest asks are listed here; the earlier ones this month are in the count above.',
  erased: 'A question since erased',
  workOther: 'Background work',
  free: 'Cost nothing',
  filed: 'Open on Decide',
  refused: 'not answered',
  out: (resets: string) => `Slash is out of asks until ${resets}.`,
  outKey: 'Use your own key',
  outSettings: 'Settings',
} as const;
