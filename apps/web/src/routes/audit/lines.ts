/**
 * What Activity says about the log it has read: the sentence under the title, the hour bands the stream is grouped in,
 * a row named by its title and its list, a burst of one actor's work said as one line, and the three tiles beside the
 * stream (who worked, what changed, and the busy hours), each with the one line that says what its chart means.
 *
 * PLAIN `.ts` BESIDE THE PAGE, like `who.ts`, so the rules live where a reader of the screen finds them and load in
 * plain Node. Nothing here reads the record: it words and counts what `readLog` and `readUnseen` already answered.
 *
 * EVERY COUNT IS OF WHAT WAS READ. `readLog` answers the newest page of the log (`LOG_PAGE`) and the screen asks for
 * older pages on demand; there is no read of a time range yet. So a window this file counts over (the last 24 hours,
 * the last 7 days) is only whole when the read reaches back past its start, and the page says so when it does not
 * (`reaches`, `historyWords.stripRead`). Nothing here fills a gap with a guess.
 *
 * THE READER'S CLOCK. The bands, the times on the rows, the lanes and the heat grid are all on the reader's own wall
 * clock, the way the charts' axes are (`lib/viz/swimlanes.ts`), so "09:39" on a row and "09:00" on the axis above it
 * are the same hour. The day filter (`?on=`) and a burst's one day are that same local day.
 *
 * NO ID REACHES A PERSON FROM HERE. The log names a row `transactions#36`, a question `suggestion:SG31` and a pack
 * `pack:money-core`, and each of those used to be printed as it was stored. A row is its title and its list, a
 * question is what it asks, a pack is its name, and a target this file cannot word is left unsaid rather than
 * printed as a key.
 */

import { sessionDeclaration } from '@braindog/kernel';
import { useCaseName } from '@braindog/seed/usecases/names';
import { firstPartyModule as moduleOf } from '@braindog/seed/packs/modules';

import { copy } from '../../lib/copy.ts';
import { PAGES } from '../../lib/record/held.ts';
import { moneyInText } from '../../lib/record/money.ts';
import { actor, humanize, listName, type ActorKind } from '../../lib/record/names.ts';
import type { AuditEvent, EventKind } from '../../lib/record/schema.ts';
import { runOf } from '../../lib/ui/face.ts';
import { listed } from '../../lib/viz/shared.ts';

const count = (n: number): string => n.toLocaleString('en');

/**
 * THE WORDS THIS SCREEN SAYS OF ITS OWN, kept beside the rules that use them rather than in the copy aggregate, the way
 * `nameWords` is: each is a piece of a sentence this file or its page builds, and none is read anywhere else.
 */
export const historyWords = {
  /* THE ONE LIST TODAY'S COUNT OPENED THE LOG ON (`?list=`), said in the toolbar so the narrowing is never silent. */
  onlyList: (name: string) => `Only ${name}`,
  everyList: (name: string) => `Show everything, not only ${name}`,
  everyone: 'Everyone',
  everyKind: 'Every kind',
  filters: 'Filters',
  /* THE SENTENCE UNDER THE TITLE. History, not need: nothing in it is red. */
  nothingNew: 'Nothing changed since you last looked.',
  oneAway: 'One thing changed while you were away',
  manyAway: (n: number) => `${count(n)} things changed while you were away`,
  moreAway: (n: number) => `More than ${count(n)} things changed while you were away`,
  /* WHAT A CHANGE WAS MADE TO, when the record sent no title: an entry in the person's own list, which is named beside it. */
  aRow: 'an entry',
  rows: (n: number): string => (n === 1 ? 'one entry' : `${count(n)} entries`),
  times: (n: number): string => `${count(n)} times`,
  between: (from: string, to: string): string => `${from} to ${to}`,
  /* LOWER CASE, because each follows the verb it was done by: "Asked a question". */
  aQuestion: 'a question',
  aDecision: 'a decision',
  aPrediction: 'a prediction',
  today: 'Today',
  yesterday: 'Yesterday',
  /* THE THREE TILES. */
  whoWorked: 'Who worked',
  lastDay: 'Last 24 hours',
  whatChanged: 'What changed',
  busyHours: 'Busy hours',
  lastWeek: 'Last 7 days',
  byAgents: (n: number) => `${count(n)} by agents`,
  byYou: (n: number) => `${count(n)} by you`,
  lanesSubject: 'Agent stretches of work in the last 24 hours',
  groupsSubject: 'Changes by who made them',
  kindsSubject: 'Changes by kind, the five biggest',
  heatSubject: 'Changes by hour over the last 7 days',
  quietWeek: 'Nothing changed in the last 7 days.',
  evenWeek: 'Changes are spread evenly across the day.',
  stripRead: (n: number): string => `Counted over the ${count(n)} newest entries read so far`,
  /* THE SWITCH THAT SHOWS THE RECORD'S OWN BOOKKEEPING beside the changes, and the line saying what it is hiding. */
  everything: 'Everything',
  hidden: (n: number): string =>
    `${n === 1 ? 'One entry is' : `${count(n)} entries are`} BrainDog's own bookkeeping: agent runs starting and stopping, their working folders, and when a tool was last seen.`,
  showThem: (n: number): string => (n === 1 ? 'Show it' : 'Show them'),
  onlyBooks: 'Nothing changed, apart from BrainDog keeping its own books.',
  /* A RUN'S WORK, FOLDED UNDER ITS NEWEST LINE. */
  more: (n: number): string => `+${count(n)} more`,
} as const;

/* ── the record's own bookkeeping ──────────────────────────────────────── */

/**
 * THE LIST THE KERNEL KEEPS ITS AGENT RUNS IN, read off the kernel's own declaration rather than typed here, so this
 * file and the record never disagree about which list it is.
 */
const RUNS = String(sessionDeclaration().body.id);

/** The fields that only stamp when something was last seen: a tool's `seen`, a run's `last_seen`. */
const STAMPS: ReadonlySet<string> = new Set(['seen', 'last_seen']);

/**
 * A STAMP SAID IN WORDS, for a log that names no field. `noteOf` (`history-live.ts`) says a field's change as its label
 * or its id in words, then "set to", "from" or "cleared", so a line whose whole note is a last-seen stamp reads this way.
 */
const STAMP_SAID = /^(?:last seen|seen) (?:set to |from |cleared$)/u;

/**
 * WHETHER A LINE IS THE RECORD KEEPING ITS BOOKS rather than a change to somebody's things: the hourly sweep that marks
 * quiet runs abandoned, a run's working folder moving, a run's own state and last-seen time, and the daily stamp of
 * when a tool was last seen. Measured on the owner's record: 154 of the newest 200 lines were the sweep alone, so the
 * changes an agent made were buried under the record noting that its runs had stopped.
 *
 * GENERIC, as every rule here is (DIRECTION §27): the runs are the kernel's own list on every record, and a stamp is
 * told by its field, which the line carries (`field`), or by the words `noteOf` says it in where it does not.
 *
 * A STAMP IS A RUN'S, as the record's own rule has it (`bookkeeping` in the kernel): a person who fills "Last seen" on
 * somebody in People, or ticks "Seen" on a film, changed their own things, and hiding it hid their work from them.
 */
export function isBookkeeping(e: Pick<AuditEvent, 'by' | 'kind' | 'target' | 'note'> & { field?: string | null | undefined }): boolean {
  if (listOf(e.target) === RUNS) return true;
  if (e.kind !== 'edit' || runOf(e.by) === null) return false;
  if (typeof e.field === 'string') return STAMPS.has(e.field);
  return STAMP_SAID.test(e.note.trim().toLowerCase());
}

/** The changes alone, or everything when `all` is set: what the stream draws. */
export const changesOf = <T extends Pick<AuditEvent, 'by' | 'kind' | 'target' | 'note'>>(events: readonly T[], all: boolean): T[] =>
  all ? [...events] : events.filter((e) => !isBookkeeping(e));

/**
 * WHETHER THE RECORD KEEPS BOOKS AT ALL, from the lists the shell holds: it does once it holds an agent run, which the
 * sweep and the stamps are about. The switch is offered on that and not only on what this page held back, because the
 * record leaves the sweep and the stamps out of the log it sends unless it is asked for everything, so a page can hide
 * nothing of its own and still have something to show.
 */
export const keepsBooks = (lists: readonly { id: string; count?: number }[] | undefined): boolean =>
  (lists ?? []).some((l) => l.id === RUNS && (l.count ?? 0) > 0);

/* ── who counts as what ────────────────────────────────────────────────── */

/**
 * AN AGENT IS AN AGENT OR SLASH. Both are models acting on the record, which is what "the agents did 22 of them" is
 * asking about; a rule or an automation is a mechanism somebody set up, and a person is a person.
 */
export const isAgent = (kind: ActorKind): boolean => kind === 'agent' || kind === 'slash';

/** The groups "What changed" splits the log into, in the order its bar draws them: the agents first, in ink. */
export const GROUPS = ['agent', 'rule', 'person', 'you', 'record'] as const;
export type Group = (typeof GROUPS)[number];

export const groupWords: Record<Group, string> = {
  agent: 'Agents',
  rule: 'Rules',
  person: 'People',
  you: 'You',
  record: 'BrainDog',
};

/** One series in ink and the rest in greys: the agents are the highlight, you a quiet grey. */
export const GROUP_TONES: Record<Group, 'ink' | 'g1' | 'g2' | 'g3' | 'g4'> = {
  agent: 'ink',
  rule: 'g1',
  person: 'g2',
  you: 'g3',
  record: 'g4',
};

export function groupOf(kind: ActorKind): Group {
  if (kind === 'you') return 'you';
  if (isAgent(kind)) return 'agent';
  if (kind === 'rule' || kind === 'automation') return 'rule';
  if (kind === 'system' || kind === 'sample') return 'record';
  return 'person';
}

/* ── the sentence under the title ─────────────────────────────────────── */

/**
 * "26 things changed while you were away; 22 of them by agents."
 *
 * `actors` IS EVERY LINE'S SIGNATURE SINCE THE READER LAST LOOKED, as the record sent it (`whatsNew`). `capped` is the
 * record saying there is more than the lines it sent, and then the count is a floor and the agents are counted over
 * the newest lines only, which the sentence says, because a count that stops at the page size and reads as the whole
 * is a confident wrong answer.
 */
export function awaySaid(actors: readonly string[], me: string | null, names: ReadonlyMap<string, string>, capped: boolean): string {
  const n = actors.length;
  if (n === 0) return historyWords.nothingNew;
  const agents = actors.filter((by) => isAgent(actor(by, me, names).kind)).length;
  const head = capped ? historyWords.moreAway(n) : n === 1 ? historyWords.oneAway : historyWords.manyAway(n);
  if (agents === 0) return `${head}.`;
  if (n === 1 && !capped) return `${head}, by an agent.`;
  if (capped) return agents === n ? `${head}; agents made all of the newest ${count(n)}.` : `${head}; agents made ${count(agents)} of the newest ${count(n)}.`;
  if (agents === n) return `${head}; all of them by agents.`;
  return agents === 1 ? `${head}; one of them by an agent.` : `${head}; ${count(agents)} of them by agents.`;
}

/* ── the reader's clock ────────────────────────────────────────────────── */

const two = (n: number): string => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** A moment's day on the reader's clock, `2026-09-29`: what `?on=` holds and what a band and a burst are one day of. */
export function dayOf(at: string | number): string {
  const d = new Date(typeof at === 'number' ? at : Date.parse(at));
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** A moment's time on the reader's clock, `09:39`, as a row and a chart's axis both say it. */
export function clockOf(at: string): string {
  const d = new Date(Date.parse(at));
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

const midnight = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Calendar days from `a`'s day to `b`'s, rounded so a day that gains or loses an hour to the clocks is still one. */
const daysBetween = (a: number, b: number): number => Math.round((midnight(b) - midnight(a)) / DAY_MS);

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const WEEKDAY_SHORT = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
/* A MONTH IS SPELLED HERE AND NOT BY `Intl`, whose British English writes September "Sept" where every other screen
   says "Sep", so a day band read "3 Sept" over a line that said "the backup on 3 Sep". The hub's days and the week
   strip spell theirs the same way (`automations/hub.ts`, `lib/viz/weekstrip.ts`). */
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A date on the reader's clock, "12 Sep", and with its year, "12 Sep 2025", when it is not this one. */
const dateSaid = (ms: number, year: boolean): string => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTH[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`;
};

/** A day as a person says it from today: Today, Yesterday, a weekday within the week, else "12 Sep". */
export function dayWord(ms: number, clock: number): string {
  const back = daysBetween(ms, clock);
  if (back <= 0) return historyWords.today;
  if (back === 1) return historyWords.yesterday;
  if (back < 7) return WEEKDAY.format(ms);
  return dateSaid(ms, new Date(ms).getFullYear() !== new Date(clock).getFullYear());
}

/**
 * WHETHER WHAT WAS READ REACHES BACK TO `start`: the whole log was read, or its oldest line read is at or before it.
 * A window the read does not reach is counted over what was read, and the tile says so.
 */
export function reaches(events: readonly AuditEvent[], more: boolean, start: number): boolean {
  if (!more) return true;
  const oldest = events.at(-1);
  return oldest !== undefined && Date.parse(oldest.at) <= start;
}

/* ── what a line was done to ───────────────────────────────────────────── */

/** What a line names, in words, where it goes when it can go anywhere, and the list it is in when it is a row. */
export type Thing = { text: string; href: string | null; list: string | null };

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
 * A ROW'S LIST IS SAID APART FROM ITS TITLE, at the row's trailing edge where a list row draws the project: the log
 * carries the list a row is in and not the project, so the list is the honest answer to "where".
 *
 * A PERSON NEVER GETS HERE: `targetSaid` in `who.ts` answers for one first, and says them by name.
 *
 * `nameOf` IS WHAT A LIST IS CALLED, and the page hands it the rail's own names. Without one a list is said from its
 * declaration or its id in words (`listName`), which is how a list the person calls Instalments was "Installments"
 * here and nowhere else.
 */
export function thingOf(target: string, title: string | null, nameOf: (list: string) => string = listName): Thing | null {
  const said = title !== null && title.trim() !== '' ? moneyInText(title) : null;
  const row = ROW.exec(target);
  /* A ROW GOES TO ITS OWN PAGE rather than through the spoken-id resolver, which took `services#6` only once the `#`
     was escaped out of the fragment. */
  if (row) return { text: said ?? historyWords.aRow, href: `/r/${row[1]}/${row[2]}`, list: nameOf(row[1]!) };
  const page = /^page\.([a-z0-9_-]+)$/u.exec(target)?.[1];
  if (page !== undefined) {
    const decl = Object.hasOwn(PAGES, page) ? PAGES[page] : undefined;
    return { text: decl?.title.trim() || humanize(page), href: `/p/${page}`, list: null };
  }
  /* A GOVERNANCE LINE IS WHAT IT WAS ABOUT. The spoken id (`SG31`) stays in the address, where the resolver needs it,
     and out of the words, where it names nothing to a person. */
  const governed = /^(suggestion|decision|prediction):(.+)$/u.exec(target);
  if (governed) {
    const kind = governed[1]!;
    const spoken = governed[2]!;
    const unsaid = kind === 'suggestion' ? historyWords.aQuestion : kind === 'decision' ? historyWords.aDecision : historyWords.aPrediction;
    return { text: said ?? unsaid, href: kind === 'suggestion' ? `/decide/${encodeURIComponent(spoken)}` : `/${encodeURIComponent(spoken)}`, list: null };
  }
  /* A PACK IS WHAT IT IS CALLED, and a use case's pack is the use case, as Home's feed says them (`boot-live.ts`). */
  const pack = /^pack:(.+)$/u.exec(target)?.[1];
  if (pack !== undefined) {
    const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(pack)?.[1];
    return { text: usecase ? copy.feedUseCase(useCaseName(usecase)) : copy.feedPack(moduleOf(pack)?.name ?? humanize(pack)), href: null, list: null };
  }
  return said === null ? null : { text: said, href: null, list: null };
}

/* ── bursts ────────────────────────────────────────────────────────────── */

/**
 * HOW A BURST IS TOLD FROM WORK DONE BY HAND. A rule that files a bank statement writes one line a payment, so the log
 * drew one "Created" per payment under the same name. A run of at least `BURST_MIN` lines by one actor, of one kind,
 * on rows of one list, each within `BURST_GAP_MS` of the one before and all on one day, is one line. The same day
 * because the day filter and the bands count by day, and a burst that crossed midnight would sit under one day while
 * holding lines of another.
 *
 * ITS OWN RULE, NOT THE FEED'S. The kernel's `feedRows` folds a run on ONE target, which is somebody editing one row
 * over and over; the run this screen needs to fold is the one across many rows of a list, which `feedRows` keeps as
 * many lines. Home's bulk rule (`BULK_MIN` in `boot-live.ts`) folds across lists and kinds into counts; Activity keeps
 * the kind, because the kind is a filter here.
 */
export const BURST_MIN = 3;
export const BURST_GAP_MS = 10 * 60_000;

/**
 * One line Activity draws: an event on its own, or the newest event of a burst with how many it stands for.
 *
 * `many` IS SET ONLY FOR A BURST OVER SEVERAL ROWS, and says them as "14 rows" with the list they are in and the list
 * to go to. A burst on one row keeps that row's own words and says how many times in its note.
 */
export type Told = {
  /** What the page keys the line on: `keyOf` its newest event, made unique if two lines say exactly the same. */
  key: string;
  e: AuditEvent;
  count: number;
  many: { text: string; href: string; list: string } | null;
  note: string;
  /** The oldest line's stamp, which is the burst's start; the event's own for a line on its own. */
  from: string;
};

const joins = (prev: AuditEvent, next: AuditEvent, first: AuditEvent, list: string): boolean =>
  next.by === first.by &&
  next.kind === first.kind &&
  listOf(next.target) === list &&
  dayOf(next.at) === dayOf(first.at) &&
  Math.abs(Date.parse(prev.at) - Date.parse(next.at)) <= BURST_GAP_MS;

/** The lines as drawn, newest first as they came, a burst being one. The walk is one pass: a run is read once. */
export function burstsOf(events: readonly AuditEvent[], nameOf: (list: string) => string = listName): Told[] {
  const out: Told[] = [];
  /* TWO LINES WITH NO PLACE IN THE LOG CAN SAY EXACTLY THE SAME, and a key drawn twice is a list that cannot be drawn. */
  const seen = new Map<string, number>();
  const keyed = (e: AuditEvent): string => {
    const k = keyOf(e);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n === 0 ? k : `${k}~${n}`;
  };
  for (let i = 0; i < events.length; ) {
    const first = events[i]!;
    const list = listOf(first.target);
    let j = i;
    if (list !== null) while (j + 1 < events.length && joins(events[j]!, events[j + 1]!, first, list)) j++;
    if (list === null || j + 1 - i < BURST_MIN) {
      out.push({ key: keyed(first), e: first, count: 1, many: null, note: first.note, from: first.at });
      i++;
      continue;
    }
    const run = events.slice(i, j + 1);
    const rows = new Set(run.map((e) => e.target)).size;
    /* THE NOTE THEY ALL CARRY SAYS WHY, and is kept; notes that differ are fourteen sentences, and the line has room for none of them. */
    const notes = new Set(run.map((e) => e.note));
    const shared = notes.size === 1 ? first.note : '';
    out.push({
      key: keyed(first),
      e: first,
      count: run.length,
      many: rows > 1 ? { text: historyWords.rows(rows), href: `/r/${list}`, list: nameOf(list) } : null,
      note: rows > 1 ? shared : [shared, historyWords.times(run.length)].filter(Boolean).join(' · '),
      from: run.at(-1)!.at,
    });
    i = j + 1;
  }
  return out;
}

/* ── one run's work, folded ────────────────────────────────────────────── */

/** Fewer lines than this by one run, side by side, are drawn as they are: folding two lines saves nothing. */
export const RUN_FOLD_MIN = 3;

/** One run's lines next to each other, drawn as its newest and folded under it as "+9 more"; a line alone has no rest. */
export type RunFold = { key: string; head: Told; rest: Told[] };

/**
 * A RUN'S WORK IS ONE THING TO READ. An agent that fixes a payout writes a line a field, so one stretch of its work was
 * a column of lines with the same face down the stream; the newest says who and what, and the rest wait one press away.
 * Only lines of one run next to each other fold, in the order they were drawn, so nothing moves out of its place in
 * time, and a person's lines, a rule's and Slash's are never folded under anybody.
 */
export function runFolds(told: readonly Told[]): RunFold[] {
  const runs: Told[][] = [];
  for (const t of told) {
    const run = runOf(t.e.by);
    const last = runs.at(-1);
    if (run !== null && last && runOf(last[0]!.e.by) === run) last.push(t);
    else runs.push([t]);
  }
  return runs.flatMap((lines): RunFold[] =>
    lines.length >= RUN_FOLD_MIN ? [{ key: lines[0]!.key, head: lines[0]!, rest: lines.slice(1) }] : lines.map((t) => ({ key: t.key, head: t, rest: [] })),
  );
}

/** Every line a fold holds, which is what a press on "+9 more" keeps as opened. */
export const foldKeys = (f: RunFold): string[] => [f.head.key, ...f.rest.map((t) => t.key)];

/**
 * WHETHER A FOLD SOMEBODY OPENED IS STILL OPEN: by any line it held when it was opened, and not by its newest. A run
 * still at work puts its next line on top of the fold, which is then the fold's newest and its key, and a fold kept by
 * that key shut under the reader the moment the run wrote again.
 */
export const foldOpen = (f: RunFold, opened: ReadonlySet<string>): boolean => foldKeys(f).some((k) => opened.has(k));

/* ── one line's identity, and the page read again ──────────────────────── */

/**
 * WHAT MAKES A LINE THE SAME LINE when the newest page is read again: its place in the log, and where the record sent
 * none (a member held to named lists is sent no rowid, so every line of hers is `version: 0`) everything it says.
 */
export const keyOf = (e: AuditEvent): string =>
  e.seq > 0 ? `v${e.seq}` : `${e.at}\u0001${e.by}\u0001${e.kind}\u0001${e.target ?? ''}\u0001${e.note}`;

/**
 * The newest page, read again because the record moved, laid over the lines already held.
 *
 * `added` ARE THE LINES THAT ARRIVED, which the page tints for a second and a half. A page that shares no
 * line with what is held means more arrived than one page holds, and the lines held are no longer the ones next to it:
 * then the page stands alone (`joined: false`), the caller takes its cursor, and nothing is tinted, because a screen
 * redrawn from scratch is not a row arriving.
 */
export function fold(held: readonly AuditEvent[], page: readonly AuditEvent[]): { events: AuditEvent[]; added: string[]; joined: boolean } {
  const have = new Set(held.map(keyOf));
  const fresh = page.filter((e) => !have.has(keyOf(e)));
  if (held.length > 0 && page.length > 0 && fresh.length === page.length) return { events: [...page], added: [], joined: false };
  return { events: [...fresh, ...held], added: fresh.map(keyOf), joined: true };
}

/** An older page under the lines held, leaving out any the two share. */
export function below(held: readonly AuditEvent[], page: readonly AuditEvent[]): AuditEvent[] {
  const have = new Set(held.map(keyOf));
  return [...held, ...page.filter((e) => !have.has(keyOf(e)))];
}

/* ── the hour bands ────────────────────────────────────────────────────── */

/** A group on the ground: its title ("Today 09:00", "08:00", "Yesterday"), and its lines, newest first. */
export type Band = { key: string; title: string; lines: Told[] };

/**
 * The stream in bands, newest first.
 *
 * TODAY IS SPLIT BY THE HOUR, and so is a day on its own (the day filter): that is where the reader is asking what
 * happened when. An older day is one band, because a quiet week split by the hour is a column of headings with a line
 * under each. The first band of a split day says the day ("Today 09:00") and the rest of that day's say the hour.
 *
 * A LINE IS PLACED BY ITS NEWEST MOMENT, so a burst sits where it ended. Bands keep the order they were first met in,
 * and a key met again joins its band rather than starting a second one.
 */
export function hourGroups(told: readonly Told[], clock: number): Band[] {
  const today = dayOf(clock);
  const days = new Set(told.map((t) => dayOf(t.e.at)));
  const bands = new Map<string, Band>();
  const titled = new Set<string>();
  for (const t of told) {
    const ms = Date.parse(t.e.at);
    const day = dayOf(ms);
    const hourly = day >= today || days.size === 1;
    const hour = `${two(new Date(ms).getHours())}:00`;
    const key = hourly ? `${day}T${hour}` : day;
    const band = bands.get(key);
    if (band) {
      band.lines.push(t);
      continue;
    }
    const title = !hourly ? dayWord(ms, clock) : titled.has(day) ? hour : `${dayWord(ms, clock)} ${hour}`;
    titled.add(day);
    bands.set(key, { key, title, lines: [t] });
  }
  return [...bands.values()];
}

/** One day of the stream: its word, how many lines it holds, and its hours, each an hour's subhead over its lines. */
export type DayBand = { key: string; title: string; count: number; hours: Band[] };

/**
 * The stream as one tile a day, newest first, with an hour subhead inside it for each hour that has a line.
 *
 * EVERY DAY IS SPLIT BY THE HOUR, inside its own tile: an hour was a tile of its own with the board between them, so a
 * busy morning was six boxes for one morning. A day is the unit the eye groups by, and the hour is the place in it.
 *
 * A LINE IS PLACED BY ITS NEWEST MOMENT, as `hourGroups` places it, and a day or an hour met again takes its line.
 */
export function dayGroups(told: readonly Told[], clock: number): DayBand[] {
  const days = new Map<string, DayBand & { by: Map<string, Band> }>();
  for (const t of told) {
    const ms = Date.parse(t.e.at);
    const day = dayOf(ms);
    const hour = `${two(new Date(ms).getHours())}:00`;
    const band = days.get(day) ?? { key: day, title: dayWord(ms, clock), count: 0, hours: [], by: new Map<string, Band>() };
    days.set(day, band);
    band.count++;
    const at = band.by.get(hour);
    if (at) at.lines.push(t);
    else {
      const next: Band = { key: `${day}T${hour}`, title: hour, lines: [t] };
      band.by.set(hour, next);
      band.hours.push(next);
    }
  }
  return [...days.values()].map(({ key, title, count, hours }) => ({ key, title, count, hours }));
}

/* ── who worked: the lanes ─────────────────────────────────────────────── */

export const LANE_SPAN_MS = 24 * HOUR_MS;
/** A gap longer than this between two lines by one agent starts a new stretch of work. */
export const STRETCH_GAP_MS = 30 * 60_000;
/** A stretch of one line is drawn this long, so it is a mark and not a hairline. */
export const STRETCH_MIN_MS = 5 * 60_000;
/** An agent whose newest line is this recent is working now: its stretch runs to the now line, in `live`. */
export const LIVE_MS = 10 * 60_000;

export type Stretch = { from: number; to: number; live: boolean };
export type AgentLane = { label: string; spans: Stretch[] };

/**
 * One lane per agent that wrote in the 24 hours up to `clock`, the one that wrote most recently first.
 *
 * A STRETCH IS WHAT THE LOG CAN SAY, not a session. The log holds the moments an agent wrote, and nothing about when
 * it started thinking or stopped: so a stretch runs from its first line to its last, a new one starts after a gap of
 * more than half an hour, and one whose last line is within ten minutes of now is drawn as still running.
 *
 * AN AGENT IS SAID AS `actor` SAYS IT, so every run the record cannot put a name to (`S42`) is one lane, "An agent",
 * rather than a lane per run named by a number.
 */
export function lanesOf(events: readonly AuditEvent[], clock: number, me: string | null, names: ReadonlyMap<string, string>): AgentLane[] {
  const start = clock - LANE_SPAN_MS;
  const times = new Map<string, number[]>();
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!(t >= start && t <= clock)) continue;
    const who = actor(e.by, me, names);
    if (!isAgent(who.kind)) continue;
    const held = times.get(who.name);
    if (held) held.push(t);
    else times.set(who.name, [t]);
  }
  const close = (from: number, last: number): Stretch => ({
    from,
    to: Math.min(clock, Math.max(last, from + STRETCH_MIN_MS)),
    live: clock - last <= LIVE_MS,
  });
  const lanes = [...times].map(([label, ts]) => {
    ts.sort((a, b) => a - b);
    const spans: Stretch[] = [];
    let from = ts[0]!;
    let last = from;
    for (const t of ts.slice(1)) {
      if (t - last > STRETCH_GAP_MS) {
        spans.push(close(from, last));
        from = t;
      }
      last = t;
    }
    spans.push(close(from, last));
    return { label, spans, newest: last };
  });
  return lanes.sort((a, b) => b.newest - a.newest).map(({ label, spans }) => ({ label, spans }));
}

/** "Claude ran 4 stretches, Codex 2 and Cursor 2. Codex is working now." */
export function lanesSaid(lanes: readonly AgentLane[]): string {
  if (lanes.length === 0) return '';
  const ran = lanes.map((l, i) => {
    const n = l.spans.length;
    return i === 0 ? `${l.label} ran ${count(n)} ${n === 1 ? 'stretch' : 'stretches'}` : `${l.label} ${count(n)}`;
  });
  const now = lanes.filter((l) => l.spans.some((s) => s.live)).map((l) => l.label);
  const head = `${listed(ran)}.`;
  return now.length === 0 ? head : `${head} ${listed(now)} ${now.length === 1 ? 'is' : 'are'} working now.`;
}

/* ── what changed: the tally ───────────────────────────────────────────── */

export type Tally = {
  total: number;
  /** Who made the changes, in `GROUPS` order, the empty groups left out. */
  groups: { group: Group; count: number }[];
  /** Each kind of change, the most first; a tie keeps the order the kinds were first met in, newest first. */
  kinds: { kind: EventKind; count: number; agents: number }[];
};

export function tallyOf(events: readonly AuditEvent[], me: string | null, names: ReadonlyMap<string, string>): Tally {
  const groups = new Map<Group, number>();
  const kinds = new Map<EventKind, { kind: EventKind; count: number; agents: number }>();
  for (const e of events) {
    const group = groupOf(actor(e.by, me, names).kind);
    groups.set(group, (groups.get(group) ?? 0) + 1);
    const k = kinds.get(e.kind) ?? { kind: e.kind, count: 0, agents: 0 };
    k.count++;
    if (group === 'agent') k.agents++;
    kinds.set(e.kind, k);
  }
  return {
    total: events.length,
    groups: GROUPS.flatMap((group) => (groups.has(group) ? [{ group, count: groups.get(group)! }] : [])),
    kinds: [...kinds.values()].sort((a, b) => b.count - a.count),
  };
}

/** "Created is the biggest share: 14 of 26, and agents made 12 of them." The kinds come worded and busiest first. */
export function tallySaid(kinds: readonly { word: string; count: number; agents: number }[], total: number): string {
  const top = kinds[0];
  if (!top) return '';
  const tied = kinds.filter((k) => k.count === top.count);
  if (tied.length > 1) return `${listed(tied.map((k) => k.word))} tie for the biggest share, ${count(top.count)} each.`;
  const by = top.agents === 0 ? '' : top.agents === top.count ? ', all of them by agents' : `, and agents made ${count(top.agents)} of them`;
  if (kinds.length === 1) return `${top.word} is all of it: ${count(top.count)}${by}.`;
  return `${top.word} is the biggest share: ${count(top.count)} of ${count(total)}${by}.`;
}

/* ── busy hours: the heat grid ─────────────────────────────────────────── */

/** The grid's columns: the hours of the day on the reader's clock. */
export const HOURS: readonly string[] = Array.from({ length: 24 }, (_, h) => two(h));

/**
 * The seven days up to and including today, oldest at the top, by the hour: how many lines were written in each.
 * `start` is the first day's midnight, which is where the read has to reach for the grid to be whole.
 */
export function busyOf(events: readonly AuditEvent[], clock: number): { rows: string[]; values: number[][]; start: number; total: number } {
  const today = midnight(clock);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d.getTime();
  });
  const start = days[0]!;
  const values = days.map(() => HOURS.map(() => 0));
  let total = 0;
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!(t >= start && t <= clock)) continue;
    const row = values[6 - daysBetween(t, clock)];
    if (!row) continue;
    row[new Date(t).getHours()]!++;
    total++;
  }
  return { rows: days.map((d) => WEEKDAY_SHORT.format(d)), values, start, total };
}

const hourSaid = (h: number): string => `${two(h % 24)}:00`;

/**
 * "Busiest from 08:00 to 10:00; the quietest hours are 03:00 to 05:00."
 *
 * OVER THE WEEK'S HOURS SUMMED, because the question is which part of the day is busy, not which one cell was. The
 * busiest stretch is the best two hours side by side, or one hour when its neighbours add nothing to it; the quietest
 * is the longest run of the emptiest hours, the earliest on a tie.
 */
export function busySaid(values: readonly (readonly number[])[]): string {
  const hours = HOURS.map((_, h) => values.reduce((n, row) => n + (row[h] ?? 0), 0));
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) return historyWords.quietWeek;
  const high = Math.max(...hours);
  const low = Math.min(...hours);
  if (high === low) return historyWords.evenWeek;
  const peak = hours.indexOf(high);
  let pair = 0;
  for (let h = 1; h < 23; h++) if (hours[h]! + hours[h + 1]! > hours[pair]! + hours[pair + 1]!) pair = h;
  const busy = hours[pair]! + hours[pair + 1]! > high ? [pair, pair + 2] : [peak, peak + 1];
  let at = 0;
  let run = 0;
  for (let h = 0; h < 24; ) {
    if (hours[h] !== low) {
      h++;
      continue;
    }
    let end = h;
    while (end + 1 < 24 && hours[end + 1] === low) end++;
    if (end - h + 1 > run) {
      run = end - h + 1;
      at = h;
    }
    h = end + 1;
  }
  const quiet = run > 1 ? `the quietest hours are ${hourSaid(at)} to ${hourSaid(at + run)}` : `the quietest hour is ${hourSaid(at)}`;
  return `Busiest from ${hourSaid(busy[0]!)} to ${hourSaid(busy[1]!)}; ${quiet}.`;
}
