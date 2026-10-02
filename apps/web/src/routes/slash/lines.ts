/**
 * What `/slash` says in figures and sentences: the line under the title, whose red phrase is the
 * suggestions waiting for him on Decide, the one list and who drafted each line of it, the "Suggestions" tile's figure,
 * bar and reading line, and the quiet fold that holds the rest.
 *
 * EVERY NUMBER IS ONE `readSlash` ANSWERED. The tile counts `suggestionsOf(reading)` by where each stands and nothing
 * else, and the cap is the record's own `cap`, so no figure here is a guess.
 *
 * PURE, SO `node --test` CAN IMPORT IT.
 */

import { suggestionsOf, words as slashWords, type Reading, type Suggestion } from '../../lib/record/slash.ts';

export const words = {
  /* The groups this screen adds to `slash.ts`'s. */
  answeredTitle: 'What you answered',
  allAnswered: 'You have answered everything Slash suggested. What it notices next is drafted here.',
  /* The title row's red phrase. */
  waitOn: (n: number) => (n === 1 ? 'One suggestion waits for you on Decide' : `${counted(n)} suggestions wait for you on Decide`),
  /* The title row with nothing waiting: what is new, else that everything was answered, else that there is nothing. */
  fresh: (n: number) => (n === 1 ? 'Slash has one new suggestion.' : `Slash has ${counted(n).toLowerCase()} new suggestions.`),
  allSettled: 'You have answered everything Slash suggested.',
  /* The empty tile's one thing to do, where a model can answer it: the Ask field's own example, asked. */
  tryAsk: (q: string) => `Try: ${q}`,
  /* The tile. */
  tileTitle: 'Suggestions',
  tileMeta: 'Nothing changes until you say yes',
  unit: (n: number) => (n === 1 ? 'suggestion' : 'suggestions'),
  partWaiting: 'On Decide',
  partNew: 'New',
  partAnswered: 'Answered',
  /* The answer, in the Ask tile. */
  asked: 'You asked',
  /* How many it read, said without the system's word for them. */
  rowsRead: (n: number) => (n === 1 ? 'one found' : `${n.toLocaleString('en')} found`),
  /* The hint under "What Slash suggests". */
  press: 'Put these on Decide and each waits there for your yes. Nothing changes until then.',
  /* Who drafted a suggestion: Slash's own rules, or the model it names. */
  byRules: 'From how you use BrainDog',
  byModel: (name: string) => `Drafted by ${name}`,
  /* The one fold under the list. */
  more: 'More from Slash',
  foldTally: 'where each suggestion stands',
  foldNoticed: 'what Slash noticed',
  foldAnswered: 'what you answered',
  foldLately: 'what you asked lately',
  foldDaily: 'the daily look',
  foldDescribe: 'describing what you want',
} as const;

/** The title row's sentence, and the phrase inside it that needs him. */
export type Sentence = { text: string; needs: string | undefined };

const SPELLED = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'] as const;

/** A count that opens a sentence: a word to ten, figures after. */
const counted = (n: number): string => SPELLED[n] ?? n.toLocaleString('en-GB');

/**
 * THE LINE UNDER "Slash" IS THE STATE, never the host: what waits for him on Decide, in red; else how many are new; else
 * that he answered everything; else that there is nothing yet (`empty`, the record's own words). Who drafts is not the
 * headline: it is one dim line at the foot of the screen, linked to the setting that adds a model.
 */
export function sentenceOf(waiting: number, fresh: number, suggested: number, empty: string): Sentence {
  if (waiting > 0) {
    const needs = words.waitOn(waiting);
    return { text: `${needs}.`, needs };
  }
  if (fresh > 0) return { text: words.fresh(fresh), needs: undefined };
  if (suggested > 0) return { text: words.allSettled, needs: undefined };
  return { text: /[.!?]$/u.test(empty) ? empty : `${empty}.`, needs: undefined };
}

/** One part of the tile's bar. */
export type Part = { label: string; value: number; tone: 'warn' | 'ink' | 'earn' };

/** The tile: how many Slash suggested, the bar of where each stands, and the line that reads it. */
export type Tally = { total: number; parts: Part[]; reading: string };

/** "a, b and c". */
const listed = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/**
 * "Suggestions": new, waiting on Decide and answered, as one stacked bar. Waiting is amber, since it waits on him; new is
 * ink, since it is his to put there; answered is green, since it is done. `null` with nothing suggested.
 *
 * `onDecide` IS THE RECORD'S COUNT of Slash's open questions, the one `canAsk` holds under `cap`, so the line can say why
 * the new ones are not put there yet when Decide is full.
 */
export function tallyOf(suggestions: readonly Suggestion[], onDecide: number, cap: number): Tally | null {
  if (suggestions.length === 0) return null;
  const waiting = suggestions.filter((s) => s.state === 'waiting').length;
  const fresh = suggestions.filter((s) => s.state === 'new').length;
  const answered = suggestions.filter((s) => s.state === 'answered').length;
  const parts: Part[] = [
    { label: words.partWaiting, value: waiting, tone: 'warn' as const },
    { label: words.partNew, value: fresh, tone: 'ink' as const },
    { label: words.partAnswered, value: answered, tone: 'earn' as const },
  ].filter((p) => p.value > 0);
  const clauses = [
    ...(waiting > 0 ? [`${waiting} ${waiting === 1 ? 'waits' : 'wait'} for you on Decide`] : []),
    ...(fresh > 0 ? [`${fresh} ${fresh === 1 ? 'is' : 'are'} not asked yet`] : []),
    ...(answered > 0 ? [`you answered ${answered}`] : []),
  ];
  const head = listed(clauses);
  const full = fresh > 0 && cap > 0 && onDecide >= cap ? ` Slash keeps at most ${cap} on Decide at once, so the new ones wait their turn.` : '';
  return { total: suggestions.length, parts, reading: `${head.charAt(0).toUpperCase()}${head.slice(1)}.${full}` };
}

/**
 * WHO DRAFTED IT, as the line under a suggestion says it: "rules" is Slash's own reading of how this BrainDog is used,
 * and anything else is the model the record names. `null` where nobody said, and then the line claims nobody: a rule's
 * draft is never handed a model's name to sound clever, and a model's is never passed off as the rules'.
 */
export function byLine(by: string | null | undefined): string | null {
  const name = by?.trim() ?? '';
  if (name === '') return null;
  return name === 'rules' ? words.byRules : words.byModel(name);
}

/** A suggestion and who drafted it (`byLine`'s input), or `null` where the record does not say. */
export type Drafted = Suggestion & { by: string | null };

const decideHref = (id: string): string => `/decide/${encodeURIComponent(id)}`;
const idOf = (href: string | null): string | null => (href === null ? null : decodeURIComponent(href.slice('/decide/'.length)));

/**
 * EVERY SUGGESTION SLASH HAS MADE, with who drafted it: waiting on Decide first, since that is what needs him, then the
 * new ones, then what he answered.
 *
 * WHO DRAFTED, MOST CERTAIN FIRST. The last press's `filed` names the drafter of each question it put on Decide, by id.
 * Then the draft's own `by`, where the record sends one. Then the rules: the `slash` read asks no model, and every draft it
 * hands back is `slashReading`'s, which only Slash's own rules write (`noticeUsage` and `catalogueDrafts` in
 * `packages/record/src/slash.ts`, each `by: 'rules'`); the model's drafts reach Decide by a press and never come back in
 * the reading.
 *
 * WHAT WAITS ON DECIDE THAT NO DRAFT MATCHES is listed too, from the record's own `waiting`: a question the model filed,
 * or one whose draft has since changed. It waits on him all the same. Who drafted it is the last press's word, else the
 * record's own (`waiting[].by`, kept when it was filed), and nothing where neither says, as for a question filed before
 * the record kept it.
 */
export function suggestedOf(reading: Reading, filed: readonly { id: string; by: string }[] = []): Drafted[] {
  const filedBy = new Map(filed.map((f) => [f.id, f.by]));
  /* THE RECORD'S WORD OUTRANKS A DRAFT'S, since it was kept when the question was filed; only the press is fresher. */
  for (const w of reading.waiting) if (!filedBy.has(w.id) && typeof w.by === 'string' && w.by.trim() !== '') filedBy.set(w.id, w.by);
  const byId = new Map<string, string | undefined>();
  const byQuestion = new Map<string, string | undefined>();
  for (const d of reading.drafts) {
    const own = (d as { by?: unknown }).by;
    const by = typeof own === 'string' && own.trim() !== '' ? own : 'rules';
    if (d.asked) byId.set(d.asked.id, by);
    else byQuestion.set(d.question, by);
  }
  const out: Drafted[] = suggestionsOf(reading).map((s) => {
    const id = idOf(s.href);
    const by = id === null ? byQuestion.get(s.question) : (filedBy.get(id) ?? byId.get(id));
    return { ...s, by: by ?? 'rules' };
  });
  const listed = new Set(out.map((s) => s.href));
  for (const w of reading.waiting) {
    const href = decideHref(w.id);
    if (!listed.has(href)) out.push({ question: w.question, state: 'waiting', href, said: slashWords.waiting, by: filedBy.get(w.id) ?? null });
  }
  const rank = { waiting: 0, new: 1, answered: 2 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state]);
}

/** What the fold under the list holds, each `true` only where this record has it to draw. */
export type Folded = { tally: boolean; noticed: boolean; answered: boolean; lately: boolean; daily: boolean; describe: boolean };

/**
 * THE FOLD'S ONE LINE: what is inside, named, so a press is never a guess. Only what this record has is named, and with
 * nothing to hold there is no fold at all (`null`).
 */
export function foldOf(has: Folded): string | null {
  const parts = [
    ...(has.noticed ? [words.foldNoticed] : []),
    ...(has.answered ? [words.foldAnswered] : []),
    ...(has.lately ? [words.foldLately] : []),
    ...(has.tally ? [words.foldTally] : []),
    ...(has.daily ? [words.foldDaily] : []),
    ...(has.describe ? [words.foldDescribe] : []),
  ];
  if (parts.length === 0) return null;
  const line = listed(parts);
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}
