/**
 * The Slash screen's reads and its one press (`/slash`).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `governance.ts` takes it.
 *
 * WHAT SLASH SAYS IS THE RECORD'S, AND HOW THE SCREEN SAYS IT IS HERE. The record words what it noticed and each question;
 * this file words the frame around them, warmly and plainly, and never says a change was made: a question is only ever put
 * on Decide, where the owner answers it.
 */

import { recordToday } from './zone.ts';

type Refused = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };
type Answer<T> = { ok: true; value: T } | Refused;

export type SlashClient = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Answer<T>> };

export type Noticed = { kind: string; subject: string; text: string };
export type Draft = { question: string; body_kind: string; by?: string; asked: { id: string; status: string; lapses?: string; note?: string } | null };
/** Whether Slash looks once a day on its own, and the day it last did. */
export type Daily = { on: boolean; last: string | null };
/**
 * `waiting[].by` is who drafted a question Slash filed, as the record kept it: `rules`, a model's name, or `null` for one
 * filed before the record kept that. Absent from a host older than it.
 */
export type Waiting = { id: string; question: string; by?: string | null; lapses?: string | null };
export type Reading = { model: string | null; quiet: string | null; noticed: Noticed[]; drafts: Draft[]; waiting: Waiting[]; cap: number; daily?: Daily };
/** `large`: the included model turned this press away unsent, because the record's reading is past what one ask may spend. */
export type Asked = { by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[]; large?: boolean };

/** One suggestion as the screen draws it: its question, and where it stands. */
export type Suggestion = { question: string; state: 'new' | 'waiting' | 'answered'; href: string | null; said: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-09-17` AS EVERY OTHER DATE READS (AN22): "on 17 Sep", the year only when it is not this one, and "today" for
 * today. "It last looked on 31 October 2026" was the one date in Settings that said its month whole and its year.
 */
const spokenDay = (day: string, today: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return `on ${day}`;
  if (day === today) return 'today';
  const said = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  return `on ${day.slice(0, 4) === today.slice(0, 4) ? said : `${said} ${day.slice(0, 4)}`}`;
};

export const words = {
  title: 'Slash',
  lede: 'Slash looks at how you use this BrainDog and suggests ways to fit it better. Nothing changes until you say yes in Needs you.',
  /* WHO DRAFTS IS NEVER THE HEADLINE: the line under the title is the state (`emptyTitle` and `routes/slash/lines.ts`),
     and these are the one dim line at the foot, linked to the setting that adds a model. */
  byRules: 'Drafted by rules.',
  byModel: (name: string) => `Drafted by ${name}, checked by rules.`,
  byLarge: 'Drafted by rules: too large for the included model.',
  noticed: 'What Slash noticed',
  noticedNone: 'Nothing stands out yet.',
  suggests: 'What Slash suggests',
  suggestsNone: 'No suggestions right now.',
  emptyTitle: 'Nothing to suggest yet.',
  emptyBody: 'Suggestions come as you use it, and wait for your yes.',
  ask: 'Put these in Needs you',
  asking: 'Putting them in Needs you',
  waiting: 'Waiting in Needs you',
  answered: 'You answered this',
  fresh: 'Not asked yet',
  open: 'Open in Needs you',
  filed: (n: number) => (n === 1 ? 'One suggestion is in Needs you.' : `${n} suggestions are in Needs you.`),
  filedNone: 'Nothing new to put in Needs you.',
  sample: 'Slash reads a real BrainDog',
  sampleBody: 'This is the sample. In your own BrainDog, Slash says what it notices about how you use it and what it would change.',
  notOwner: 'Only the owner of this BrainDog can see what Slash noticed.',
  skipped: 'Not put in Needs you',
  dailyTitle: 'Look once a day',
  dailySwitch: 'Let Slash look once a day',
  dailyOn: 'Up to 3 new suggestions a day, in Needs you.',
  dailyOff: 'Only when you open Slash and ask.',
  dailyLast: (day: string, today: string = recordToday()) => `It last looked ${spokenDay(day, today)}.`,
  dailySaidOn: 'Slash will look once a day.',
  dailySaidOff: 'Slash will wait for you to ask.',
  dailyMore: 'Open Slash',
} as const;

const decideHref = (id: string): string => `/decide/${encodeURIComponent(id)}`;

/** Each draft with where it stands, new ones first. */
/** Nothing noticed and nothing suggested, as on a new record: the screen says so once rather than under two headings. */
export const nothingYet = (reading: Reading): boolean => reading.noticed.length === 0 && reading.drafts.length === 0;

export function suggestionsOf(reading: Reading): Suggestion[] {
  const out = reading.drafts.map((d): Suggestion => {
    if (d.asked === null) return { question: d.question, state: 'new', href: null, said: words.fresh };
    if (d.asked.status === 'open') return { question: d.question, state: 'waiting', href: decideHref(d.asked.id), said: words.waiting };
    return { question: d.question, state: 'answered', href: decideHref(d.asked.id), said: words.answered };
  });
  const rank = { new: 0, waiting: 1, answered: 2 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state]);
}

/** Whether the press has anything to do: a new suggestion, room under the cap, and a record old enough to advise. */
export const canAsk = (reading: Reading): boolean =>
  reading.quiet === null && reading.waiting.length < reading.cap && reading.drafts.some((d) => d.asked === null);

/**
 * The line under the title: who drafts.
 *
 * THE LAST PRESS OUTRANKS THE READING, because the reading names the model the host has and not whether it will be asked.
 * At 300 lists the included model turns every press away unsent, and
 * this line went on saying it drafts. A fresh reading still says the model's name until a press says `large`: the record
 * learns it only by asking, and keeps no note of it between loads.
 */
export const draftedBy = (reading: Reading, asked?: Asked | null): string =>
  asked?.large === true ? words.byLarge : reading.model === null ? words.byRules : words.byModel(reading.model);

const fixOf = (r: Refused): string => ('refusal' in r ? r.refusal.fix : 'Something changed while this was open. Try again.');

export async function readSlash(client: SlashClient): Promise<{ ok: true; reading: Reading } | { ok: false; fix: string; owner: boolean }> {
  const out = await client.call<Reading>('slash', {});
  if (out.ok) return { ok: true, reading: out.value };
  const code = 'refusal' in out ? out.refusal.code : '';
  return { ok: false, fix: code === 'FORBIDDEN' ? words.notOwner : fixOf(out), owner: code !== 'FORBIDDEN' };
}

/**
 * The press: Slash's suggestions filed, and one sentence to say what happened. With `asked`, the owner's own description
 * of what to build, Slash's model drafts from it instead, and the same sentence says how many reached Decide.
 */
export async function askSlash(client: SlashClient, asked?: string): Promise<{ ok: true; asked: Asked; said: string } | { ok: false; fix: string }> {
  const out = await client.call<Asked>('slashPropose', asked === undefined ? {} : { asked });
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  /* THE TOAST SAYS HOW MANY AND NOT WHY THE RULES DREW THEM. The why is the record's dropped line, which the screen draws
     under "Not put in Needs you"; repeating it here put the same too-large sentence on one screen twice after one press. */
  return { ok: true, asked: out.value, said: out.value.filed.length === 0 ? words.filedNone : words.filed(out.value.filed.length) };
}

/* ── a change described, drawn, then kept ─────────────────────────────────────
   The owner says what a page should do differently, Slash drafts the change, the page
   draws it as it would stand, and one press keeps it. The Slash screen's own description goes the same way, with no
   page named. */

export const changeWords = {
  change: 'Change this page',
  /** The page menu below 900px, for a screen reader: the trigger itself is only an icon. */
  more: (title: string) => `More for ${title}`,
  describeTitle: 'Describe what you want',
  hintPage: 'Say what you want this page to show or do differently. Slash drafts the change and draws it here, and nothing changes until you keep it.',
  hintRecord: 'Say in your own words what you want this BrainDog to hold and show. Slash drafts the lists, figures and pages for it and draws them here, and nothing is made until you keep one.',
  placeholderPage: 'Put the late ones first, and add a figure for how many are left this week',
  placeholderRecord: 'A desk for my launch, in five parts, with the next step on each and a sentence saying how far along I am',
  field: 'What to change',
  send: 'Draft it',
  sending: 'Drafting',
  drawing: 'Drawing the draft',
  keep: 'Keep it',
  keeping: 'Keeping',
  file: 'Ask in Needs you',
  drop: 'Throw away',
  /** Ask the same words again, with this draft turned down, so Slash drafts another way (§45 "Keep, Try again"). */
  again: 'Try again',
  againing: 'Trying again',
  /** Which of several drafts is drawn, for a screen reader. */
  which: 'Which draft to show',
  kept: 'Kept. This is how it stands now.',
  filed: 'This is waiting in Needs you.',
  open: 'Open in Needs you',
  none: 'Slash drafted nothing from that.',
  noPage: 'This draft changes no page, so there is nothing to draw. What it changes is in its question.',
  unDrawn: 'This draft could not be drawn here. You can still ask about it in Needs you, where it is drawn again.',
  unreached: 'BrainDog could not be reached.',
  noModel: 'Slash changes a page from a description only when this BrainDog has a model set up.',
  /** The reason an owner's own keep is decided with, which Decide's history shows beside it. */
  reason: 'Kept from what Slash drafted on the page.',
} as const;

/** A declaration as a change carries it (`SlashDecl` in the record). */
export type ChangeDecl = { id: string; kind: string; body: Record<string, unknown> };

/**
 * One draft from a description, as `slashDraft` answers it (`SlashDrafted` in the record). `rows` are sample rows the
 * preview is drawn over and nothing files; `preview` is what the record drew
 * when it checked the draft, carried here as it came.
 */
export type Drafted = {
  question: string;
  change: { to: ChangeDecl | { declarations: ChangeDecl[] } };
  rows: Record<string, Record<string, unknown>[]>;
  preview: { pages: unknown[] };
};

/** `slashDraft`'s whole answer: who drafted, the drafts that drew clean, and a sentence for each that did not. */
export type DraftedAll = { by: string; drafts: Drafted[]; dropped: string[]; cost?: { asks: number; tokens: number; said: string } };

/**
 * What the owner described, drafted and checked, filing nothing. `page` is the page it is about, by its address, and is
 * left out on the Slash screen, where the description is about the whole BrainDog.
 */
export async function draftChange(
  client: SlashClient,
  asked: string,
  page?: string,
  body?: unknown,
  not: readonly Drafted[] = [],
): Promise<{ ok: true; drafted: DraftedAll } | { ok: false; fix: string }> {
  /* TRY AGAIN SENDS THE SAME WORDS WITH WHAT IT TURNED DOWN, each as its question and change, so the model drafts
     another way and the record drops the same change if it comes back. */
  const declined = not.length === 0 ? {} : { not: not.map((d) => ({ question: d.question, change: { to: d.change.to } })) };
  /* A PAGE THE RECORD HOLDS NONE OF YET (Today, Decide) IS SENT AS IT IS DRAWN, so the draft changes that. */
  const out = await client.call<DraftedAll>('slashDraft', page === undefined ? { asked, ...declined } : { asked, page, ...(body === undefined ? {} : { body }), ...declined });
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  return { ok: true, drafted: out.value };
}

/**
 * Whether the answer came from Slash's own rules, which cannot read a sentence: no model is set up, or the record cannot
 * draw a change before it lands. Either way the sheet offers the source instead, the one other way to change a page.
 */
export const byRules = (drafted: DraftedAll): boolean => drafted.by === 'rules';

/** What a keep or an ask on Decide came to. `fix` on a filed one is why it was not kept at once. */
export type Kept = { kind: 'kept' } | { kind: 'filed'; id: string; href: string; fix?: string } | { kind: 'refused'; fix: string };

/**
 * One draft filed on Decide, and with `keep` accepted in the same press.
 *
 * THE CHANGE IS FILED AS IT WAS DRAWN, its declarations and nothing else: the sample rows were only there to draw it
 * over, and a kept change must not bring made-up rows into the record. The accept is always asked when keeping, and the
 * record answers it, so a person who may not decide is refused there with the record's own sentence and the change
 * waits on Decide, as a member's field does (`action-draft.ts` `fileDraft`).
 */
export async function fileDrafted(client: SlashClient, draft: Drafted, keep: boolean): Promise<Kept> {
  /* `declaration_id` IS WHAT THE CHANGE INSTALLS, which the record asks for by name: without it every Keep it was refused
     ("A change proposal needs declaration_id"), found on the first walk of moment 5. A bundle is named by its first member. */
  const to = draft.change.to as { id?: unknown; declarations?: { id?: unknown }[] };
  /* A BUNDLE IS FILED UNDER ITS FIRST MEMBER, which the record asks for too: a page and its look were refused for want of one. */
  const first = typeof to.id === 'string' ? to.id : to.declarations?.[0]?.id;
  const named = typeof first === 'string' ? { declaration_id: first } : {};
  const filed = await client.call<{ id?: unknown }>('propose', { question: draft.question, body_kind: 'change', body: { ...named, to: draft.change.to } });
  if (!filed.ok) return { kind: 'refused', fix: fixOf(filed) };
  const id = String(filed.value?.id ?? '');
  const href = decideHref(id);
  if (!keep) return { kind: 'filed', id, href };
  const accepted = await client.call<unknown>('decide', { id, decide: { option: 'accept', reason: changeWords.reason } });
  if (!accepted.ok) return { kind: 'filed', id, href, fix: fixOf(accepted) };
  return { kind: 'kept' };
}

/** The line under the switch: what on or off means, and when Slash last looked. */
export const dailySaid = (daily: Daily, today: string = recordToday()): string => (daily.on ? words.dailyOn : words.dailyOff) + (daily.last ? ` ${words.dailyLast(daily.last, today)}` : '');

/** The switch: Slash looking once a day, on or off. Only the owner, in a browser. */
export async function setDaily(client: SlashClient, on: boolean): Promise<{ ok: true; daily: Daily; said: string } | { ok: false; fix: string }> {
  const out = await client.call<Daily>('slashDaily', { on });
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  return { ok: true, daily: out.value, said: out.value.on ? words.dailySaidOn : words.dailySaidOff };
}
