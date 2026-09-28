/**
 * What History says about the log it has read: the lead that says what is new, the twelve weeks of how much changed a
 * day, a row named by its title and its list, and a burst of one actor's work said as one line.
 *
 * PLAIN `.ts` BESIDE THE PAGE, like `who.ts`, so the rules live where a reader of the screen finds them and load in
 * plain Node. Nothing here reads the record: it words what `readLog` and `readUnseen` already answered.
 *
 * NO ID REACHES A PERSON FROM HERE. The log names a row `transactions#36`, a question `suggestion:SG31` and a pack
 * `pack:money-core`, and each of those used to be printed as it was stored. A row is its title and its list, a
 * question is what it asks, a pack is its name, and a target this file cannot word is left unsaid rather than
 * printed as a key (design.md SYS-3).
 */

import { useCaseName } from '@braindog/seed/usecases/names';
import { firstPartyModule as moduleOf } from '@braindog/seed/packs/modules';

import { copy } from '../../lib/copy.ts';
import { PAGES } from '../../lib/record/held.ts';
import { moneyInText } from '../../lib/record/money.ts';
import { actor, humanize, listName, nameWords, type Actor } from '../../lib/record/names.ts';
import type { AuditEvent } from '../../lib/record/schema.ts';

/**
 * THE WORDS THIS SCREEN SAYS OF ITS OWN, kept beside the rules that use them rather than in the copy aggregate, the way
 * `nameWords` is: each is a piece of a sentence this file builds, and none is read anywhere else.
 */
export const historyWords = {
  /* THE ONE LIST TODAY'S COUNT OPENED THE LOG ON (`?list=`), said over the filters so the narrowing is never silent. */
  onlyList: (name: string) => `Only ${name}`,
  since: 'Since you last looked',
  sinceNothing: 'Nothing new since you last looked',
  sinceNewest: (n: number): string => `Since you last looked, the newest ${n.toLocaleString('en')}`,
  you: 'you',
  rules: 'rules',
  /* "OTHER AGENTS" AND NOT THE BARE PLURAL, which is the Agents pack's id: `web-lists` reads a literal that is a
     first-party pack id as the web knowing that pack, whatever the sentence around it means. */
  agents: 'other agents',
  others: 'others',
  inList: (title: string, list: string): string => `${title}, in ${list}`,
  aRowIn: (list: string): string => `A row in ${list}`,
  rowsIn: (n: number, list: string): string => `${n.toLocaleString('en')} rows in ${list}`,
  times: (n: number): string => `${n.toLocaleString('en')} times`,
  between: (from: string, to: string): string => `${from} to ${to}`,
  aQuestion: 'A question',
  aDecision: 'A decision',
  aPrediction: 'A prediction',
  strip: 'How much changed a day',
  stripRead: (n: number): string => `Counted over the ${n.toLocaleString('en')} newest entries read so far`,
} as const;

/* ── since you last looked ─────────────────────────────────────────────── */

/** One group of the lead line: who, as the lead says them, and how many lines of what is new they signed. */
export type SinceGroup = { label: string; count: number };

/**
 * WHO A LINE OF WHAT IS NEW COUNTS TOWARDS. An agent the product knows by name is its own group ("Claude"), because
 * that is the question a person asks of a morning; every rule and automation is one group, "rules", because nobody
 * chose any of them at that moment, which is the kernel's own grouping (`byOf` in `kernel/src/pages.ts`). A person the
 * record names is their name, and anybody it cannot name joins "others" rather than being counted under four words
 * that would read as one person.
 */
function groupOf(a: Actor): string {
  if (a.kind === 'you') return historyWords.you;
  if (a.kind === 'rule' || a.kind === 'automation') return historyWords.rules;
  if (a.kind === 'agent') return a.name === nameWords.agent ? historyWords.agents : a.name;
  if (a.kind === 'person') return a.name === copy.feedSomeone ? historyWords.others : a.name;
  return a.name;
}

/**
 * The actors of what is new, as the lead's groups, busiest first.
 *
 * `actors` IS EVERY LINE'S SIGNATURE AS THE RECORD SENT IT (`whatsNew`), so the reader's own id is You here as it is on
 * every other screen. A tie keeps the order the lines came in, which is newest first.
 */
export function sinceGroups(actors: readonly string[], me: string | null, names: ReadonlyMap<string, string>): SinceGroup[] {
  const counts = new Map<string, number>();
  for (const by of actors) {
    const label = groupOf(actor(by, me, names));
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/**
 * The lead line: "Since you last looked: Claude 9 · rules 3 · you 2".
 *
 * `capped` IS THE RECORD SAYING THERE IS MORE than the lines it sent (`sinceCapped`), and then the counts are of the
 * newest ones only. The line says so, because a count that stops at the page size and reads as the whole is a
 * confident wrong answer.
 */
export function sinceSaid(groups: readonly SinceGroup[], capped: boolean): string {
  if (groups.length === 0) return historyWords.sinceNothing;
  const total = groups.reduce((n, g) => n + g.count, 0);
  const head = capped ? historyWords.sinceNewest(total) : historyWords.since;
  return `${head}: ${groups.map((g) => `${g.label} ${g.count.toLocaleString('en')}`).join(' · ')}`;
}

/* ── the twelve weeks ──────────────────────────────────────────────────── */

/**
 * The log read so far as a `heat` block's rows, `day | how many lines`.
 *
 * THE DAY IS THE ONE THE DAY FILTER USES (the first ten characters of the line's stamp), so a washed day and the
 * `?on=` it would narrow to are the same day. The weeks, the washes and the phone's shorter grid are the render
 * package's (`src/heat.ts`), which every page's `heat` block already draws, so History draws no second heat of its own.
 */
export function heatRows(events: readonly AuditEvent[]): { cells: string[] }[] {
  const per = new Map<string, number>();
  for (const e of events) {
    const day = e.at.slice(0, 10);
    per.set(day, (per.get(day) ?? 0) + 1);
  }
  return [...per].map(([day, n]) => ({ cells: [day, String(n)] }));
}

/* ── what a line was done to ───────────────────────────────────────────── */

/** What a line names, in words, and where it goes when it can go anywhere. */
export type Thing = { text: string; href: string | null };

/**
 * A row as the log names it: `transactions#36`, the list and the number.
 *
 * A HYPHEN IS PART OF A LIST ID, as the kernel's `REGISTER_ID` allows (`kernel/src/declare.ts`), so `bank-lines#3` is a
 * row like any other and not a target this file cannot word.
 */
const ROW = /^([a-z][a-z0-9_-]*)#(\d+)$/u;

/** The list a row target belongs to, or `null` for any target that is not a row. */
export const listOf = (target: string | undefined): string | null => (target === undefined ? null : (ROW.exec(target)?.[1] ?? null));

/**
 * What a target is called and where it goes, or `null` when there is nothing to say that is not an id.
 *
 * `title` IS WHAT THE RECORD CALLED THE TARGET when it sent the line (`readLog`'s `names`): a row's title or the
 * question a governance line is about. It is a sentence the record stored, so it goes through `moneyInText` like the
 * note beside it.
 *
 * A PERSON NEVER GETS HERE: `targetSaid` in `who.ts` answers for one first, and says them by name.
 */
export function thingOf(target: string, title: string | null): Thing | null {
  const said = title !== null && title.trim() !== '' ? moneyInText(title) : null;
  const row = ROW.exec(target);
  /* A ROW IS ITS TITLE AND ITS LIST, "Object storage, in Services", and it goes to its own page rather than through the
     spoken-id resolver, which took `services#6` only once the `#` was escaped out of the fragment. */
  if (row) {
    const list = listName(row[1]!);
    return { text: said ? historyWords.inList(said, list) : historyWords.aRowIn(list), href: `/r/${row[1]}/${row[2]}` };
  }
  const page = /^page\.([a-z0-9_-]+)$/u.exec(target)?.[1];
  if (page !== undefined) {
    const decl = Object.hasOwn(PAGES, page) ? PAGES[page] : undefined;
    return { text: decl?.title.trim() || humanize(page), href: `/p/${page}` };
  }
  /* A GOVERNANCE LINE IS WHAT IT WAS ABOUT. The spoken id (`SG31`) stays in the address, where the resolver needs it,
     and out of the words, where it names nothing to a person. */
  const governed = /^(suggestion|decision|prediction):(.+)$/u.exec(target);
  if (governed) {
    const kind = governed[1]!;
    const spoken = governed[2]!;
    const unsaid = kind === 'suggestion' ? historyWords.aQuestion : kind === 'decision' ? historyWords.aDecision : historyWords.aPrediction;
    return { text: said ?? unsaid, href: kind === 'suggestion' ? `/decide/${encodeURIComponent(spoken)}` : `/${encodeURIComponent(spoken)}` };
  }
  /* A PACK IS WHAT IT IS CALLED, and a use case's pack is the use case, as Home's feed says them (`boot-live.ts`). */
  const pack = /^pack:(.+)$/u.exec(target)?.[1];
  if (pack !== undefined) {
    const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(pack)?.[1];
    return { text: usecase ? copy.feedUseCase(useCaseName(usecase)) : copy.feedPack(moduleOf(pack)?.name ?? humanize(pack)), href: null };
  }
  return said === null ? null : { text: said, href: null };
}

/* ── bursts ────────────────────────────────────────────────────────────── */

/**
 * HOW A BURST IS TOLD FROM WORK DONE BY HAND. A rule that files a bank statement writes one line a payment, so the log
 * drew one "Created" per payment under the same name. A run of at least `BURST_MIN` lines by one actor,
 * of one kind, on rows of one list, each within `BURST_GAP_MS` of the one before and all on one day, is one line. The
 * same day because the day filter and the twelve weeks count by day, and a burst that crossed midnight would sit under
 * one day while holding lines of another.
 *
 * ITS OWN RULE, NOT THE FEED'S. The kernel's `feedRows` folds a run on ONE target, which is somebody editing one row
 * over and over; the run this screen needs to fold is the one across many rows of a list, which `feedRows` keeps as
 * many lines. Home's bulk rule (`BULK_MIN` in `boot-live.ts`) folds across lists and kinds into counts; History keeps
 * the kind, because the kind is a filter here.
 */
export const BURST_MIN = 3;
export const BURST_GAP_MS = 10 * 60_000;

/**
 * One line History draws: an event on its own, or the newest event of a burst with how many it stands for.
 *
 * `many` IS SET ONLY FOR A BURST OVER SEVERAL ROWS, and says them as "14 rows in Payments" with the list to go to. A
 * burst on one row keeps that row's own words and says how many times in its note.
 */
export type Told = {
  e: AuditEvent;
  count: number;
  many: { text: string; href: string } | null;
  note: string;
  /** The oldest line's stamp, which is the burst's start; the event's own for a line on its own. */
  from: string;
};

const joins = (prev: AuditEvent, next: AuditEvent, first: AuditEvent, list: string): boolean =>
  next.by === first.by &&
  next.kind === first.kind &&
  listOf(next.target) === list &&
  next.at.slice(0, 10) === first.at.slice(0, 10) &&
  Math.abs(Date.parse(prev.at) - Date.parse(next.at)) <= BURST_GAP_MS;

/** The lines as drawn, newest first as they came, a burst being one. The walk is one pass: a run is read once. */
export function burstsOf(events: readonly AuditEvent[]): Told[] {
  const out: Told[] = [];
  for (let i = 0; i < events.length; ) {
    const first = events[i]!;
    const list = listOf(first.target);
    let j = i;
    if (list !== null) while (j + 1 < events.length && joins(events[j]!, events[j + 1]!, first, list)) j++;
    if (list === null || j + 1 - i < BURST_MIN) {
      out.push({ e: first, count: 1, many: null, note: first.note, from: first.at });
      i++;
      continue;
    }
    const run = events.slice(i, j + 1);
    const rows = new Set(run.map((e) => e.target)).size;
    /* THE NOTE THEY ALL CARRY SAYS WHY, and is kept; notes that differ are fourteen sentences, and the line has room for none of them. */
    const notes = new Set(run.map((e) => e.note));
    const shared = notes.size === 1 ? first.note : '';
    out.push({
      e: first,
      count: run.length,
      many: rows > 1 ? { text: historyWords.rowsIn(rows, listName(list)), href: `/r/${list}` } : null,
      note: rows > 1 ? shared : [shared, historyWords.times(run.length)].filter(Boolean).join(' · '),
      from: run.at(-1)!.at,
    });
    i = j + 1;
  }
  return out;
}
