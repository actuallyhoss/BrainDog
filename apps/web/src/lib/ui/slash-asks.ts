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
 * background work's own allowance, apart, each with a line for every purpose it was spent on, then the asks by day with what each cost and what it filed, and when the month
 * is spent, the two ways on. `SlashUsage.svelte` draws it and `SlashOut.svelte` draws the two buttons.
 */

import { since } from 'braindog-render';
import type { SlashAsked, SlashStatus } from '@braindog/client';

/* THE CAP'S RULES AND THE RESET'S WORDS ARE `slash-cap.ts`'s, so Today's quiet line takes them without this file. */
import { atCap, listed, metered, nearCap, resetsWords } from './slash-cap.ts';
export { atCap, metered, nearCap, resetsWords };

/** `41 of 80` on the included model; `12` on his own key, listed and not capped; `null` on `byo`, gone rather than zeroed. */
export const asksShown = (s: SlashStatus): string | null => (metered(s) ? `${s.asks.used} of ${s.asks.cap}` : listed(s) ? String(s.asks.used) : null);

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
  cap === 0 ? 'Slash is off until you raise the limit.' : `Slash answers up to ${cap} ${cap === 1 ? 'question' : 'questions'} a month.`;

/**
 * How many calls the Slash section on `/usage` asks the ledger for: the most its door answers (`history` in
 * `packages/slash/src/index.ts`), so an ordinary month is read whole and a busy one says it was not.
 */
export const LEDGER_FETCHED = 100;

/* WHOSE AN ASK WAS IS WHAT THE LEDGER SAYS IT WAS FOR, and no longer read out of its kind. `Purpose` in
   `packages/slash/src/types.ts` names them: his own question, a rule of his asking at a step and a new record's first
   plan spend his allowance, and everything else the record did for itself. The background allowance's size is the
   host's to say (`status.background.cap`); the copy of it that stood here is gone, so a host that does not say it gets a
   count and no figure to measure it to. */
const HIS: ReadonlySet<string> = new Set(['ask', 'automation', 'plan']);

/** The engine's own words on a call nobody typed, each the purpose it was made for (`ASKED_2` in `call.ts` and the host's). */
const ASKED_FOR = new Map<string, string>([
  ["Slash's page headlines", 'headline'],
  ["Slash's reading of who is who", 'understand'],
  ["Slash's first plan", 'plan'],
  ["Slash's skill draft", 'skill'],
  ["Slash's daily look", 'look'],
]);

const AUTOMATION = /^rule\..+ step \d+$/u;

/** What of a ledger row says what it was for: its kind, its purpose, the engine's own words and what it filed. */
export type Purposed = Pick<SlashAsked, 'kind' | 'filed' | 'purpose'> & { question: string | null };

/**
 * What an ask was for. The row says it; a host built before it did says only the kind, so there it is worked out as the
 * store's own step to version 3 fills it (`FILL_2` in `packages/slash/src/call.ts`): by the kind, the engine's own
 * question, and whether a pattern filed.
 */
export const purposeOf = (a: Purposed): string => {
  if (a.purpose !== undefined && a.purpose !== '') return a.purpose;
  const q = a.question?.trim() ?? '';
  const named = ASKED_FOR.get(q);
  if (a.kind === 'read' || a.kind === 'propose') return AUTOMATION.test(q) ? 'automation' : named === 'plan' ? 'plan' : 'ask';
  if (named !== undefined) return named;
  if (a.kind === 'pattern') return a.filed === null ? 'pattern' : 'ask';
  return a.kind;
};

/** Whether a call on the ledger was background work rather than a question of his. */
export const isBackground = (a: Purposed): boolean => !HIS.has(purposeOf(a));

/* WHAT A CALL COST IS WHAT A METER COUNTED FOR IT, and no second rule. The ledger's `spends` column is the meters' word
   and the door does not hand it on, so this is their rule read back (`PURPOSES` in `packages/host/src/infer.ts`): a call
   no model answered (`-`) spends nothing, a proposal is the second model call of a question whose read is already one
   ask (`PROPOSED` in `packages/slash/src/propose.ts`), the operator's test of a model spends nobody's, and every other
   call spends one of the allowance its purpose names. */
/** The kinds a meter counted on a host built before purposes: his cap's `read` and `pattern`, the background's `prose`. */
const COUNTED_BEFORE: ReadonlySet<string> = new Set(['read', 'pattern', 'prose']);

/** The asks one call cost: 1 when a meter counted it, 0 when none did. */
export const costOf = (a: Pick<SlashAsked, 'kind' | 'model' | 'purpose'>): number => {
  if (a.model === '-' || a.kind === 'propose') return 0;
  if (a.purpose === undefined || a.purpose === '') return COUNTED_BEFORE.has(a.kind) ? 1 : 0;
  return a.purpose === 'probe' ? 0 : 1;
};

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
 * are the newest calls' and not the month's. `by` is the same asks by what they were for, the most spent first.
 */
export type SpentMonth = { days: SpentDay[]; asks: number; background: number; whole: boolean; by: SpentFor[] };

/** What one purpose spent in the month: its words, the asks a meter counted for it, and whose allowance they were. */
export type SpentFor = { label: string; n: number; background: boolean };

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
 * THE BACKGROUND ASKS THAT ARE NOT PATTERNS, though the ledger writes them as `pattern` calls: each kind of background
 * work the host spends has its own question (`slashRecordMeter.background` in `packages/host/src/slash-ask.ts`), so it
 * is named by that rather than all three saying "Pattern drafted for the inbox".
 */
const ASKED_AS = new Map<string, string>([
  ["Slash's page headlines", 'Page headlines written'],
  ["Slash's skill draft", 'Skill revised'],
  ["Slash's daily look", 'Daily look written'],
]);

/**
 * A PURPOSE IN A PERSON'S WORDS: `line` heads its count for the month, and `what` is one call of it on a day's list where
 * the purpose alone says what the work was. `look` has no `what`, because it is several kinds of work and the call's own
 * kind and question say which (`WORK`, `ASKED_AS`). A purpose with no entry is a newer host's, and is counted as other
 * work rather than shown under the host's own name for it.
 */
const PURPOSES = new Map<string, { line: string; what?: string }>([
  ['ask', { line: 'Your questions' }],
  ['automation', { line: 'Automations', what: 'An automation asked' }],
  ['plan', { line: 'First plan', what: 'First plan drafted' }],
  ['headline', { line: 'Page headlines', what: 'Page headlines written' }],
  ['understand', { line: 'Read what arrived', what: 'Read what arrived' }],
  ['look', { line: 'Daily look and drafts' }],
  ['compose', { line: 'Drafts written', what: 'Draft written' }],
  ['skill', { line: 'Skills revised', what: 'Skill revised' }],
  ['pattern', { line: 'Patterns drafted', what: 'Pattern drafted for the inbox' }],
  ['prose', { line: 'Digest summaries', what: 'Summary for a digest' }],
  ['embed', { line: 'Search kept up to date', what: 'Search kept up to date' }],
  ['probe', { line: 'Model tests', what: 'Model tested' }],
]);

/** What a piece of background work was: by its purpose, then by its question, then by the ledger's kind. */
const workOf = (a: SlashAsked, purpose: string): string =>
  PURPOSES.get(purpose)?.what ??
  (a.kind === 'pattern' && a.question !== null ? ASKED_AS.get(a.question.trim()) : undefined) ??
  WORK.get(a.kind) ??
  words.workOther;

/* A QUESTION OF HIS IS SHOWN AS HE TYPED IT. An automation's is `rule.<id> step <n>` on the ledger and a first plan's is
   the engine's own phrase, neither of which he typed, so those two are named by what they were. */
const askedOf = (a: SlashAsked, purpose: string): string => (purpose === 'ask' ? undefined : PURPOSES.get(purpose)?.what) ?? (a.question?.trim() || words.erased);

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
  const by: SpentFor[] = [];
  /* The line a proposal opened, waiting for the read that drafted it, and the question both were. */
  let waiting: SpentLine | null = null;
  let waitingFor: string | null = null;
  for (const a of rows) {
    if (a.ts.slice(0, 7) !== month) continue;
    const day = a.ts.slice(0, 10);
    let d = days.find((x) => x.day === day);
    if (!d) {
      d = { day, label: dayWords(day, now), asks: 0, background: 0, lines: [] };
      days.push(d);
    }
    const purpose = purposeOf(a);
    const bg = !HIS.has(purpose);
    const cost = costOf(a);
    const href = a.filed === null ? null : `/decide/${encodeURIComponent(a.filed)}`;
    const refused = a.status === 'refused' || a.status === 'error';
    const what = bg ? workOf(a, purpose) : askedOf(a, purpose);
    const label = PURPOSES.get(purpose)?.line ?? words.workElse;
    let f = by.find((x) => x.label === label);
    if (!f) {
      f = { label, n: 0, background: bg };
      by.push(f);
    }
    f.n += cost;
    if (bg) {
      d.background += cost;
      background += cost;
    } else {
      d.asks += cost;
      asks += cost;
    }
    if (!bg && a.kind === 'read' && waiting !== null && waitingFor === a.question && d.lines.includes(waiting)) {
      waiting.cost += cost;
      waiting.refused = waiting.refused && refused;
      waiting = null;
      continue;
    }
    const line: SpentLine = { id: a.id, what, when: since(a.ts, now), cost, href, refused, background: bg };
    d.lines.push(line);
    waiting = !bg && a.kind === 'propose' && a.question !== null ? line : null;
    waitingFor = waiting === null ? null : a.question;
  }
  const oldest = rows[rows.length - 1];
  const whole = rows.length < LEDGER_FETCHED || (oldest !== undefined && oldest.ts.slice(0, 7) < month);
  by.sort((x, y) => y.n - x.n || x.label.localeCompare(y.label));
  return { days, asks, background, whole, by: by.filter((x) => x.n > 0) };
}

/**
 * One line a purpose under a count: `Read what arrived: 4`, the most spent first. `background` picks the allowance.
 * Counted from a list that ended inside the month, each is a floor, and says so.
 */
export const purposeLines = (m: SpentMonth, background: boolean): string[] =>
  m.by.filter((f) => f.background === background).map((f) => `${f.label}: ${m.whole ? '' : 'at least '}${f.n.toLocaleString('en-GB')}`);

/** A call's cost as the line says it. */
export const costSaid = (cost: number, background: boolean): string =>
  cost === 0 ? words.free : `${cost} ${background ? 'background ' : ''}${cost === 1 ? 'question' : 'questions'}`;

/** His asks this month, as the section's first meter says them, or `null` on `byo`, where nothing is counted. */
export const asksLine = (s: SlashStatus): string | null => {
  const shown = asksShown(s);
  if (shown === null) return null;
  return metered(s) ? `${shown} questions this month` : `${shown} ${s.asks.used === 1 ? 'question' : 'questions'} on your key this month`;
};

/**
 * The background allowance's line. `exact` is the host's own count and its allowance (`status.background`), said as it
 * came. A host that says neither gets the ledger's count with no allowance beside it, since the figure is the host's and
 * is copied nowhere here; counted from a list that ended inside the month, that count is a floor, and says so.
 */
export const backgroundLine = (m: SpentMonth, exact?: { used: number; cap: number }): string =>
  exact
    ? `${exact.used.toLocaleString('en-GB')} of ${exact.cap.toLocaleString('en-GB')} background questions this month`
    : `${m.whole ? '' : 'At least '}${m.background.toLocaleString('en-GB')} background ${m.background === 1 && m.whole ? 'question' : 'questions'} this month`;

/**
 * Where the two buttons go when the month's asks are spent. Both are the Agents area of
 * Settings, where `SlashModel` is: "Use your own key" lands on its own-key choice, whose hint carries that id.
 */
export const outOfAsks = { key: '/settings/agents#slash-kind-key', settings: '/settings/agents', plans: '/settings/billing' } as const;

export const words = {
  title: 'Slash',
  asks: 'Questions this month',
  keyAsks: 'Questions on your key this month',
  keyHint: 'Your provider bills these, so Slash lists them and sets no limit.',
  model: 'Model',
  resets: 'Resets',
  spent: 'Questions used',
  noModel: 'Slash suggests from your own rules until a model is connected.',
  capLabel: 'Monthly limit',
  capHint: 'The most questions Slash answers in a month. Zero turns Slash off.',
  capGo: 'Save the limit',
  /* The Slash section of `/usage`. */
  byDay: 'Questions by day',
  none: 'Nothing asked of Slash this month. Each question you ask, and what it cost, is listed here by day.',
  partial: 'The newest questions are listed here; the earlier ones this month are in the count above.',
  erased: 'A question since erased',
  workOther: 'Background work',
  workElse: 'Other background work',
  forWhat: 'What they were for',
  free: 'Cost nothing',
  filed: 'Open in Needs you',
  refused: 'not answered',
  out: (resets: string) => `This month's Slash questions are used. They come back on ${resets}.`,
  outKey: 'Use your own key',
  outSettings: 'Settings',
  outPlans: 'See plans',
} as const;
