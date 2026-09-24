/**
 * The Spark screen's reads and its one press (`/spark`, `loop/research-spark.md` S15).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `governance.ts` takes it.
 *
 * WHAT SPARK SAYS IS THE RECORD'S, AND HOW THE SCREEN SAYS IT IS HERE. The record words what it noticed and each question;
 * this file words the frame around them, warmly and plainly, and never says a change was made: a question is only ever put
 * on Decide, where the owner answers it.
 */

type Refused = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };
type Answer<T> = { ok: true; value: T } | Refused;

export type SparkClient = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Answer<T>> };

export type Noticed = { kind: string; subject: string; text: string };
export type Draft = { question: string; body_kind: string; asked: { id: string; status: string } | null };
/** Whether Spark looks once a day on its own, and the day it last did. */
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
  title: 'Spark',
  lede: 'Spark looks at how you use this BrainDog and suggests ways to fit it better. Nothing changes until you say yes on Decide.',
  byRules: 'Spark is using its own rules. A model can draft for it when this host is set up with one.',
  byModel: (name: string) => `Spark drafts with a model (${name}), and checks every suggestion the same way before it reaches you.`,
  byLarge: 'Spark is using its own rules, because this BrainDog is now too large for the included model to read.',
  noticed: 'What Spark noticed',
  noticedNone: 'Nothing stands out yet. Spark keeps an eye on which lists grow, which pages you open and what agents do.',
  suggests: 'What Spark suggests',
  suggestsNone: 'No suggestions right now. This BrainDog fits the way you use it.',
  emptyTitle: 'Nothing to suggest yet',
  emptyBody: 'As you use this BrainDog, Spark notices which lists grow, which pages you open and what agents do, and suggests ways to fit it to how you work. Nothing changes until you say yes on Decide.',
  ask: 'Put these on Decide',
  asking: 'Putting them on Decide',
  waiting: 'Waiting on Decide',
  answered: 'You answered this',
  fresh: 'Not asked yet',
  open: 'Open on Decide',
  filed: (n: number) => (n === 1 ? 'One suggestion is on Decide.' : `${n} suggestions are on Decide.`),
  filedNone: 'Nothing new to put on Decide.',
  sample: 'Spark reads a real BrainDog',
  sampleBody: 'This is the sample. In your own BrainDog, Spark says what it notices about how you use it and what it would change.',
  notOwner: 'Only the owner of this BrainDog can see what Spark noticed.',
  skipped: 'Not put on Decide',
  dailyTitle: 'Spark on its own',
  dailySwitch: 'Let Spark look once a day',
  dailyOn: 'Once a day, Spark looks at how you use this BrainDog and puts anything new on Decide, never more than three at a time and never a question you already answered.',
  dailyOff: 'Spark waits for you. It looks only when you open Spark and press to put its suggestions on Decide.',
  dailyLast: (day: string) => `It last looked on ${spokenDay(day)}.`,
  dailySaidOn: 'Spark will look once a day.',
  dailySaidOff: 'Spark will wait for you to ask.',
  dailyMore: 'Open Spark',
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
 * `loop/research-batch-sixty-four-audit.md` finding 5: at 300 lists the included model turns every press away unsent, and
 * this line went on saying it drafts. A fresh reading still says the model's name until a press says `large`: the record
 * learns it only by asking, and keeps no note of it between loads.
 */
export const draftedBy = (reading: Reading, asked?: Asked | null): string =>
  asked?.large === true ? words.byLarge : reading.model === null ? words.byRules : words.byModel(reading.model);

const fixOf = (r: Refused): string => ('refusal' in r ? r.refusal.fix : 'Something changed while this was open. Try again.');

export async function readSpark(client: SparkClient): Promise<{ ok: true; reading: Reading } | { ok: false; fix: string; owner: boolean }> {
  const out = await client.call<Reading>('spark', {});
  if (out.ok) return { ok: true, reading: out.value };
  const code = 'refusal' in out ? out.refusal.code : '';
  return { ok: false, fix: code === 'FORBIDDEN' ? words.notOwner : fixOf(out), owner: code !== 'FORBIDDEN' };
}

/** The press: Spark's suggestions filed, and one sentence to say what happened. */
export async function askSpark(client: SparkClient): Promise<{ ok: true; asked: Asked; said: string } | { ok: false; fix: string }> {
  const out = await client.call<Asked>('sparkPropose', {});
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  /* THE TOAST SAYS HOW MANY AND NOT WHY THE RULES DREW THEM. The why is the record's dropped line, which the screen draws
     under "Not put on Decide"; repeating it here put the same too-large sentence on one screen twice after one press. */
  return { ok: true, asked: out.value, said: out.value.filed.length === 0 ? words.filedNone : words.filed(out.value.filed.length) };
}

/** The line under the switch: what on or off means, and when Spark last looked. */
export const dailySaid = (daily: Daily): string => (daily.on ? words.dailyOn : words.dailyOff) + (daily.last ? ` ${words.dailyLast(daily.last)}` : '');

/** The switch: Spark looking once a day, on or off. Only the owner, in a browser. */
export async function setDaily(client: SparkClient, on: boolean): Promise<{ ok: true; daily: Daily; said: string } | { ok: false; fix: string }> {
  const out = await client.call<Daily>('sparkDaily', { on });
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  return { ok: true, daily: out.value, said: out.value.on ? words.dailySaidOn : words.dailySaidOff };
}
