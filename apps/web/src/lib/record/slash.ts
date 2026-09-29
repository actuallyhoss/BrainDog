/**
 * The Slash screen's reads and its one press (`/slash`).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `governance.ts` takes it.
 *
 * WHAT SLASH SAYS IS THE RECORD'S, AND HOW THE SCREEN SAYS IT IS HERE. The record words what it noticed and each question;
 * this file words the frame around them, warmly and plainly, and never says a change was made: a question is only ever put
 * on Decide, where the owner answers it.
 */

type Refused = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };
type Answer<T> = { ok: true; value: T } | Refused;

export type SlashClient = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Answer<T>> };

export type Noticed = { kind: string; subject: string; text: string };
export type Draft = { question: string; body_kind: string; asked: { id: string; status: string } | null };
/** Whether Slash looks once a day on its own, and the day it last did. */
export type Daily = { on: boolean; last: string | null };
export type Reading = { model: string | null; quiet: string | null; noticed: Noticed[]; drafts: Draft[]; waiting: { id: string; question: string }[]; cap: number; daily?: Daily };
/** `large`: the included model turned this press away unsent, because the record's reading is past what one ask may spend. */
export type Asked = { by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[]; large?: boolean };

/** One suggestion as the screen draws it: its question, and where it stands. */
export type Suggestion = { question: string; state: 'new' | 'waiting' | 'answered'; href: string | null; said: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-09-17` as a person says it: 17 September 2026. */
const spokenDay = (day: string): string => (/^\d{4}-\d{2}-\d{2}$/u.test(day) ? `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}` : day);

export const words = {
  title: 'Slash',
  lede: 'Slash looks at how you use this BrainDog and suggests ways to fit it better. Nothing changes until you say yes on Decide.',
  byRules: 'Slash is using its own rules. A model can draft for it when this host is set up with one.',
  byModel: (name: string) => `Slash drafts with a model (${name}), and checks every suggestion the same way before it reaches you.`,
  byLarge: 'Slash is using its own rules, because this BrainDog is now too large for the included model to read.',
  noticed: 'What Slash noticed',
  noticedNone: 'Nothing stands out yet. Slash keeps an eye on which lists grow, which pages you open and what agents do.',
  suggests: 'What Slash suggests',
  suggestsNone: 'No suggestions right now. This BrainDog fits the way you use it.',
  emptyTitle: 'Nothing to suggest yet',
  emptyBody: 'As you use this BrainDog, Slash notices which lists grow, which pages you open and what agents do, and suggests ways to fit it to how you work. Nothing changes until you say yes on Decide.',
  ask: 'Put these on Decide',
  asking: 'Putting them on Decide',
  waiting: 'Waiting on Decide',
  answered: 'You answered this',
  fresh: 'Not asked yet',
  open: 'Open on Decide',
  filed: (n: number) => (n === 1 ? 'One suggestion is on Decide.' : `${n} suggestions are on Decide.`),
  filedNone: 'Nothing new to put on Decide.',
  sample: 'Slash reads a real BrainDog',
  sampleBody: 'This is the sample. In your own BrainDog, Slash says what it notices about how you use it and what it would change.',
  notOwner: 'Only the owner of this BrainDog can see what Slash noticed.',
  skipped: 'Not put on Decide',
  dailyTitle: 'Slash on its own',
  dailySwitch: 'Let Slash look once a day',
  dailyOn: 'Once a day, Slash looks at how you use this BrainDog and puts anything new on Decide, never more than three at a time and never a question you already answered.',
  dailyOff: 'Slash waits for you. It looks only when you open Slash and press to put its suggestions on Decide.',
  dailyLast: (day: string) => `It last looked on ${spokenDay(day)}.`,
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
     under "Not put on Decide"; repeating it here put the same too-large sentence on one screen twice after one press. */
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
  file: 'Ask on Decide',
  drop: 'Not this',
  /** Which of several drafts is drawn, for a screen reader. */
  which: 'Which draft to show',
  kept: 'Kept. This is how it stands now.',
  filed: 'This is waiting on Decide.',
  open: 'Open on Decide',
  none: 'Slash drafted nothing from that.',
  noPage: 'This draft changes no page, so there is nothing to draw. What it changes is in its question.',
  unDrawn: 'This draft could not be drawn here. You can still ask about it on Decide, where it is drawn again.',
  unreached: 'BrainDog could not reach this record.',
  noModel: 'Slash changes a page from a description only when this BrainDog has a model set up. You can still change how the page is built yourself.',
  source: 'Change how this is built',
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
export type DraftedAll = { by: string; drafts: Drafted[]; dropped: string[] };

/**
 * What the owner described, drafted and checked, filing nothing. `page` is the page it is about, by its address, and is
 * left out on the Slash screen, where the description is about the whole BrainDog.
 */
export async function draftChange(client: SlashClient, asked: string, page?: string): Promise<{ ok: true; drafted: DraftedAll } | { ok: false; fix: string }> {
  const out = await client.call<DraftedAll>('slashDraft', page === undefined ? { asked } : { asked, page });
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
  const filed = await client.call<{ id?: unknown }>('propose', { question: draft.question, body_kind: 'change', body: { to: draft.change.to } });
  if (!filed.ok) return { kind: 'refused', fix: fixOf(filed) };
  const id = String(filed.value?.id ?? '');
  const href = decideHref(id);
  if (!keep) return { kind: 'filed', id, href };
  const accepted = await client.call<unknown>('decide', { id, decide: { option: 'accept', reason: changeWords.reason } });
  if (!accepted.ok) return { kind: 'filed', id, href, fix: fixOf(accepted) };
  return { kind: 'kept' };
}

/** The line under the switch: what on or off means, and when Slash last looked. */
export const dailySaid = (daily: Daily): string => (daily.on ? words.dailyOn : words.dailyOff) + (daily.last ? ` ${words.dailyLast(daily.last)}` : '');

/** The switch: Slash looking once a day, on or off. Only the owner, in a browser. */
export async function setDaily(client: SlashClient, on: boolean): Promise<{ ok: true; daily: Daily; said: string } | { ok: false; fix: string }> {
  const out = await client.call<Daily>('slashDaily', { on });
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  return { ok: true, daily: out.value, said: out.value.on ? words.dailySaidOn : words.dailySaidOff };
}
