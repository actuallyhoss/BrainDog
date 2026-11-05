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
 * the last 7 days) is only whole when the read reaches back past its start (`reaches`). Nothing here fills a gap with a
 * guess.
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
import { datesIn, readable } from 'braindog-render';
import { useCaseName } from '@braindog/seed/usecases/names';
import { firstPartyModule as moduleOf } from '@braindog/seed/packs/modules';

import { copy } from '../../lib/copy.ts';
import { cardWords } from '../../lib/decide/card.ts';
import { settledSaid, slashDidSaid, type SettledWords, type Settling } from '../../lib/record/history-live.ts';
import { PAGES } from '../../lib/record/held.ts';
import { moneyInText } from '../../lib/record/money.ts';
import { actor, humanize, listName, ruleNameSaid, type ActorKind } from '../../lib/record/names.ts';
import type { AuditEvent, EventKind } from '../../lib/record/schema.ts';
import { runOf } from '../../lib/ui/face.ts';
import { listed } from '../../lib/viz/shared.ts';
import { byLine } from '../slash/lines.ts';

const count = (n: number): string => n.toLocaleString('en');

/**
 * THE WORDS THIS SCREEN SAYS OF ITS OWN, kept beside the rules that use them rather than in the copy aggregate, the way
 * `nameWords` is: each is a piece of a sentence this file or its page builds, and none is read anywhere else.
 */
export const historyWords = {
  /* AFTER THE PAGE A LINK SHARES, and in its place when the line names none (AN21). */
  withLink: ' with a link',
  aLink: ' a link',
  /* THE ONE LIST TODAY'S COUNT OPENED THE LOG ON (`?list=`), said in the toolbar so the narrowing is never silent. */
  onlyList: (name: string) => `Only ${name}`,
  everyList: (name: string) => `Show everything, not only ${name}`,
  everyone: 'Everyone',
  everyKind: 'Every kind',
  filters: 'Filters',
  /* THE SENTENCE UNDER THE TITLE. History, not need: nothing in it is red. */
  nothingNew: 'Nothing changed since you last looked.',
  oneAway: 'One change since you were last here',
  manyAway: (n: number) => `${count(n)} changes since you were last here`,
  moreAway: (n: number) => `More than ${count(n)} changes since you were last here`,
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
  byPeople: (n: number) => `${count(n)} by people`,
  byRules: (n: number) => `${count(n)} by rules`,
  byBrainDog: (n: number) => `${count(n)} by BrainDog`,
  lanesSubject: 'Agent stretches of work in the last 24 hours',
  /* WHO WORKED OVER THE MONTH, the record's own figure (`activity-by-who`), with BrainDog's own work as a part (AF12). */
  lastMonth: 'Last 30 days',
  whoSubject: 'Changes in the last 30 days, by who made them',
  groupsSubject: 'Changes by who made them',
  kindsSubject: 'Changes by kind, the five biggest',
  heatSubject: 'Changes by hour over the last 7 days',
  quietWeek: 'Nothing changed in the last 7 days.',
  evenWeek: 'Changes are spread evenly across the day.',
  /* THE SWITCH THAT SHOWS THE RECORD'S OWN BOOKKEEPING beside the changes, and the line saying what it is hiding. */
  everything: 'Everything',
  hidden: (n: number): string => `${count(n)} bookkeeping ${n === 1 ? 'entry' : 'entries'} hidden.`,
  showThem: (n: number): string => (n === 1 ? 'Show it' : 'Show them'),
  /* THE FOOT SAYS WHERE THEY ARE rather than being a second press beside Show more. */
  hiddenWhere: 'Everything shows them.',
  /* AND SINCE 3 NOV IT IS THAT PRESS, one short line at the foot that turns Everything on, where it was a sentence
     telling the reader which control to find. */
  showHidden: (n: number): string => (n === 1 ? 'Show 1 hidden line' : `Show ${count(n)} hidden lines`),
  /* A FILTER THAT MISSED, said once and in words: the filters on are drawn in the toolbar already. */
  noneMatch: 'Nothing here matches these filters',
  /* THE FILTERS APPLY TO WHAT WAS READ, so a miss offers the older page, where a match may be. */
  furtherBack: 'Look further back',
  onlyBooks: 'Nothing changed, apart from BrainDog keeping its own books.',
  /* THE ONE PRESS AT THE STREAM'S FOOT, for more of what was read and then for older lines. */
  showMore: 'Show more',
  /* A RULE OR A SCRIPT THAT RAN, said by what it is beside its title, which the line already says. */
  aRule: 'A rule',
  aScript: 'A script',
  ran: 'Ran',
  /* WHAT BRAINDOG DID ON ITS OWN, said apart from the agents in the sentence under the title (`awaySaid`). */
  itself: 'BrainDog itself',
  /* ONE PASS OF BRAINDOG'S OWN UPDATE, said as one line that opens to what it did (`passOf`). */
  showSteps: (n: number): string => (n === 1 ? 'Show what it did' : `Show the ${count(n)} things it did`),
  hideSteps: 'Hide what it did',
  /* A MINUTE'S RUN, FOLDED (G28). */
  showEach: (n: number): string => `Show all ${count(n)}`,
  hideEach: 'Hide them',
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
 * GENERIC, as every rule here is: the runs are the kernel's own list on every record, and a stamp is
 * told by its field, which the line carries (`field`), or by the words `noteOf` says it in where it does not.
 *
 * A STAMP IS A RUN'S, as the record's own rule has it (`bookkeeping` in the kernel): a person who fills "Last seen" on
 * somebody in People, or ticks "Seen" on a film, changed their own things, and hiding it hid their work from them.
 */
export function isBookkeeping(e: Pick<AuditEvent, 'by' | 'kind' | 'target' | 'note'> & { field?: string | null | undefined }): boolean {
  if (listOf(e.target) === RUNS) return true;
  /* A KEY BEING READ IS THE RECORD DOING ITS JOB, many times a day, and it buried what changed (5 Nov). Every read is still
     written and shown under Everything; storing, rotating or revoking one is a change and stays. */
  if (e.kind === 'grant.read') return true;
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

/** Who wrote the lines `whatsNew` answered, as the record counts them (`byWho`, `packages/record/src/update-pass.ts`). */
export type ByWho = { you: number; people: number; agents: number; rules: number; record: number };

/** The record's count if it is one, and `null` for a host older than `byWho` or anything that is not a count. */
export function byWhoOf(v: unknown): ByWho | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  /* THE KEYS OFF A COUNT OF NOTHING, so the five are said once, as the type says them. */
  const keys = Object.keys({ you: 0, people: 0, agents: 0, rules: 0, record: 0 } satisfies ByWho) as (keyof ByWho)[];
  return keys.every((k) => Number.isSafeInteger(o[k]) && (o[k] as number) >= 0)
    ? { you: o.you as number, people: o.people as number, agents: o.agents as number, rules: o.rules as number, record: o.record as number }
    : null;
}

/* ── one pass of BrainDog's own update ─────────────────────────────────── */

/** What the record says of a pass beside its line (`PassSaid` in the record): its sentence and its counts. */
export type PassSaid = { said: string; updated: number; asked: number; steps: number; at: string };

/** A line of the log that may be one pass of the update, with every line the pass wrote under it as `steps`. */
export type Passed = AuditEvent & { pass?: PassSaid; steps?: readonly AuditEvent[] };

/** A pass as Activity draws it: the one sentence its line reads, and what it did, each a line of its own. */
export type PassLine = { said: string; steps: Told[] };

/**
 * ONE PASS OF THE UPDATE IS ONE LINE. The night's update writes an install, a carry and a question a line,
 * which filled Activity with "Installed the Agents add-on" and "Installed the Work add-on"; the record now sends the
 * pass as one line, with the sentence that names how many add-ons and whether anything was kept, and every line it
 * wrote under it. This says that line, and its steps as lines Activity already draws, each keyed under the pass so two
 * passes never share a key. `null` for any other line, and for a pass the record sent no steps for.
 */
export function passOf(e: Passed): PassLine | null {
  const { pass, steps } = e;
  if (pass === undefined || pass === null || !Array.isArray(steps) || steps.length === 0) return null;
  const said = typeof pass.said === 'string' && pass.said.trim() !== '' ? pass.said : e.note;
  const seen = new Map<string, number>();
  const told = steps.map((s): Told => {
    const k = `${keyOf(e)}/${keyOf(s)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { key: n === 0 ? k : `${k}~${n}`, e: s, count: 1, many: null, note: s.note, from: s.at };
  });
  return { said, steps: told };
}

/* ── the sentence under the title ─────────────────────────────────────── */

/**
 * "26 changes since you were last here. Agents made 22."
 *
 * `actors` IS EVERY LINE'S SIGNATURE SINCE THE READER LAST LOOKED, as the record sent it (`whatsNew`). `capped` is the
 * record saying there is more than the lines it sent, and then the count is a floor and the agents are counted over
 * the newest lines only, which the sentence says, because a count that stops at the page size and reads as the whole
 * is a confident wrong answer.
 *
 * `byWho` IS THE RECORD'S OWN COUNT OF WHO WROTE THOSE LINES, worked out where an agent reads it too. The
 * record's own lines (its update, its seed, Slash) are said apart, "and BrainDog itself made 3", and never counted as an
 * agent's or a person's. One pass of the update is one line there, and so one here.
 */
export function awaySaid(
  actors: readonly string[],
  me: string | null,
  names: ReadonlyMap<string, string>,
  capped: boolean,
  byWho: ByWho | null = null,
  /* THE PAGE'S OWN COUNT, the one its What changed tile says, when the record's read stopped short of it (P29): the line
     said "More than 60 changes … Agents made 5 of the newest 60" beside a tile saying 195 and "5 by agents". */
  counted: { total: number; agents: number } | null = null,
): string {
  if (capped && counted !== null && counted.total >= actors.length && counted.total > 0) {
    const head = counted.total === 1 ? historyWords.oneAway : historyWords.manyAway(counted.total);
    if (counted.agents === 0) return `${head}.`;
    return counted.agents === counted.total ? `${head}. Agents made all of them.` : `${head}. Agents made ${counted.agents === 1 ? 'one' : count(counted.agents)}.`;
  }
  const n = actors.length;
  /* NOTHING NEW SAYS NOTHING (Q13 of 29 October): "Nothing changed since you last looked." stood over "Today 28", true of
     the mark and false to the eye, so the head is the title alone and the days under it say what happened. */
  if (n === 0) return '';
  /* THE RECORD'S OWN COUNT WHEN IT SENT ONE, so this sentence and an agent asking `whatsNew` read the same number; a host
     older than `byWho` is counted here as before. */
  const agents = byWho ? byWho.agents : actors.filter((by) => isAgent(actor(by, me, names).kind)).length;
  const own = byWho ? byWho.record : 0;
  const head = capped ? historyWords.moreAway(n) : n === 1 ? historyWords.oneAway : historyWords.manyAway(n);
  const itself = historyWords.itself;
  const few = (k: number): string => (k === 1 ? 'one' : count(k));
  /* TWO SHORT SENTENCES (money F11): how many, then who. "195 changes since you were last here. Agents made 5." Over
     a capped page the second is about the newest lines only, and says so. */
  const newest = capped ? ` of the newest ${count(n)}` : '';
  if (agents === 0) {
    if (own === 0) return `${head}.`;
    if (n === 1 && !capped) return `${head}, by ${itself}.`;
    return own === n ? `${head}. ${upper(itself)} made ${capped ? `all${newest}` : 'all of them'}.` : `${head}. ${upper(itself)} made ${few(own)}${newest}.`;
  }
  if (n === 1 && !capped) return `${head}, by an agent.`;
  /* AND WHAT BRAINDOG DID ON ITS OWN APART, never inside the agents' number: a night's update is nobody's work. */
  const tail = own === 0 ? '' : `, and ${itself} made ${few(own)}`;
  if (agents === n) return `${head}. Agents made ${capped ? `all${newest}` : 'all of them'}.`;
  return `${head}. Agents made ${few(agents)}${newest}${tail}.`;
}

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

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
 * A ROW'S NAME WITHOUT THE BANK'S OWN NOISE: the statement date a payee line begins with ("25OCT26 Phone Banking
 * Transfer" is "Phone Banking Transfer"), and a name that is only a card or reference number ("0447") is no name, so the
 * line says "an entry" and the row's own page holds the raw text.
 */
export function bankName(title: string): string | null {
  const bare = title.trim().replace(/^\d{1,2}[A-Za-z]{3}\d{2,4}\s+/u, '').trim();
  return /\p{L}{2,}/u.test(bare) ? bare : null;
}

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
  /* A BANK'S LINE IN CAPITALS READS AS WORDS (`readable`): "Changed LEDGER POST" is "Changed Ledger Post". */
  const cleaned = title === null ? null : bankName(title);
  const said = cleaned !== null ? moneyInText(readable(cleaned)) : null;
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
    /* A PLUGIN, in the word a person reads since 3 Nov; the shared feed still says "add-on" (`copy.feedPack`). */
    return { text: usecase ? copy.feedUseCase(useCaseName(usecase)) : `the ${moduleOf(pack)?.name ?? humanize(pack)} plugin`, href: null, list: null };
  }
  return said === null ? null : { text: said, href: null, list: null };
}

/* ── a change to a page, a rule, a script or a list ────────────────────── */

type Declared = { kind: 'page' | 'rule' | 'script' | 'list'; id: string };

/** What a `declare` line changed, from its target (`declaration:rule.meet-payees`), or `null` for any other target. */
export function declaredIn(target: string | undefined): Declared | null {
  const m = /^declaration:(page|rule|script|register)\.(.+)$/u.exec(target ?? '');
  if (!m) return null;
  return { kind: m[1] === 'register' ? 'list' : (m[1] as Declared['kind']), id: m[2]! };
}

/**
 * THE VERB A CHANGE TO THE SETUP IS SAID WITH, by what it changed (3 Nov): every `declare` line read "Changed the page",
 * the rules an upgrade rewrote too, and named nothing, so four rules changed in a minute were "Changed the page, 4 times".
 */
export const declareWord = (target: string | undefined): string => `Changed the ${declaredIn(target)?.kind ?? 'page'}`;

/**
 * WHAT IT CHANGED, by name and with its own page: a page by its title, a rule or a script by the title the Automations
 * page gives it (`titles`, keyed `rule:<id>` and `script:<id>`), a list by the rail's name for it.
 */
export function declaredThing(target: string | undefined, titles: ReadonlyMap<string, string>, nameOf: (list: string) => string = listName): Thing | null {
  const d = declaredIn(target);
  if (d === null) return null;
  if (d.kind === 'page') return thingOf(`page.${d.id}`, null, nameOf);
  if (d.kind === 'list') return { text: nameOf(d.id), href: `/r/${d.id}`, list: null };
  const title = titles.get(`${d.kind}:${d.id}`);
  const href = d.kind === 'rule' ? `/automations/${encodeURIComponent(d.id)}` : `/scripts/${encodeURIComponent(d.id)}`;
  return { text: title ? ruleNameSaid(title) : humanize(d.id), href, list: null };
}

/** A minute's run of setup changes as one line: "Changed the rule, 3 times", or "Changed pages and rules, 4 times". */
export function declaresSaid(targets: readonly (string | undefined)[]): string {
  const kinds = [...new Set(targets.map((t) => declaredIn(t)?.kind ?? 'page'))];
  const times = historyWords.times(targets.length);
  if (kinds.length === 1) return `${declareWord(targets[0])}, ${times}`;
  const plural = { page: 'pages', rule: 'rules', script: 'scripts', list: 'lists' } as const;
  return `Changed ${listed(kinds.map((k) => plural[k]))}, ${times}`;
}

/** A QUESTION THAT QUOTES SOMETHING, QUOTED ITSELF, nests its quotes: “Move ‘Next sprint’ to Doing?”, never “Move "Next sprint" to Doing?”. */
export const nestQuotes = (text: string): string => text.replace(/"([^"]*)"/gu, '‘$1’');

/* ── a line as a sentence ──────────────────────────────────────────────── */

/**
 * A TITLE THAT OPENS ON WHAT WAS DONE ("Filed 2 payments under Software", "Handled the backup"): a word in capitals and
 * then lower case ending in -ed, or one of the short past forms that do not. Put after the line's own verb it read
 * "Closed Filed 2 payments", two verbs and no sentence.
 */
const DONE = /^(?:\p{Lu}\p{Ll}+ed|Paid|Sent|Made|Set|Put|Kept|Left|Got|Took|Ran|Found|Wrote|Read|Built|Held|Brought|Bought|Sold|Told)\b/u;

/** The parts a line of Activity is drawn in, so it reads as one sentence. */
export type LineSaid = {
  /** The verb before what the line names, or `null` where the name already says what was done. */
  verb: string | null;
  /** Whether what it names is a question or a sentence somebody wrote, drawn in quotation marks after the verb. */
  quoted: boolean;
  /** The verb said after who did it, in lower case, where the title had no room for it: "A rule · closed". */
  done: string | null;
  /** The note, without the name the line already says, and with every stored day said as a person says it. */
  note: string;
};

/** A SCRIPT SIGNATURE IN A NOTE IS THE SCRIPT IN WORDS: "Written by script:book_from_account@v3." is "Written by the Book from account script." */
export const scriptWords = (note: string): string =>
  note
    /* The line already says which script wrote it, so "Written by the X script." is not said again. */
    .replace(/\bWritten by script:[a-z][a-z0-9_-]*@v\d+\.?\s*(?:·\s*)?/gu, '')
    .replace(/\bscript:([a-z][a-z0-9_-]*)@v\d+/gu, (_m, slug: string) => `the ${humanize(slug)} script`)
    /* AN INVITATION BY ITS ID IS A MECHANISM TOO (selfhost2 lane, 2 Nov): the line that gives somebody access read
       "Accepted invitation i_01M6E2J20RBD0NEFX0Y96DTAP8." */
    .replace(/^Accepted invitation i_[0-9A-Za-z]+\.?$/u, 'Joined with an invitation.')
    .replace(/\s*\bAccepted invitation i_[0-9A-Za-z]+\.?/gu, '')
    /* A rule's id is a mechanism: "rule.meet-payees ran." is "Meet payees ran." */
    .replace(/\brule[.:]([a-z][a-z0-9_-]*)/gu, (_m, slug: string) => humanize(slug))
    /* AND ANY OTHER NAME IN snake_case IS A MECHANISM'S: "settle_matched_line did not
       finish" is "Settle matched line did not finish", never the id. A caller holding the thing's title says that first. */
    .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu, (slug, at: number) => (at === 0 ? humanize(slug) : humanize(slug).toLowerCase()))
    .replace(/\s*·\s*$/u, '')
    .trim();

/**
 * ONE LINE AS A SENTENCE: "Asked “Does Portage keep sending…?”", "Closed “Filed 2 payments…”" said as "Filed 2
 * payments…" with "closed" beside who did it, and a note that does not start by saying the title again ("Noted
 * Newsletter sending · Newsletter sending · renews 2026-09-10" is "Noted Newsletter sending · renews 10 Sep").
 *
 * `governed` is a line about a question or a decision, whose name is somebody's own words and so is quoted.
 */
/**
 * A LINE ABOUT SOMEBODY'S ACCESS, AS ONE SENTENCE WITH THEM IN IT (empty states, 2 Nov): "Gave you access", "Gave Kim
 * access", "Took access away from Kim". The verb and the person were set side by side, "Gave access You", which read as
 * a label and a name. `null` for any other kind, which is said as it was.
 */
export function accessSaid(kind: string, who: { name: string; you: boolean }): string | null {
  /* "Someone on this record" is said inside the sentence in lower case. */
  const name = who.name.startsWith('Someone ') ? `s${who.name.slice(1)}` : who.name;
  if (kind === 'access.grant') return who.you ? 'Gave you access' : `Gave ${name} access`;
  if (kind === 'access.revoke') return who.you ? 'Took your access away' : `Took access away from ${name}`;
  return null;
}

export function lineSaid(word: string, thing: string | null, note: string, governed: boolean, now: number = Date.now()): LineSaid {
  const name = thing?.trim() ?? '';
  let rest = note.trim();
  if (name !== '') {
    if (rest === name) rest = '';
    else if (rest.startsWith(`${name} · `)) rest = rest.slice(name.length + 3).trim();
  }
  /* A NOTE THAT ONLY SAYS THE VERB AGAIN IS NO NOTE (3 Nov): a row made with no note of its own is noted "created", so
     every new row read "Created 4 entries" over "You · created · Learnings", the verb twice in one line. */
  if (rest.toLowerCase() === word.toLowerCase() || (word === 'Changed' && rest === 'changed this')) rest = '';
  rest = datesIn(scriptWords(rest), now);
  if (name !== '' && DONE.test(name)) return { verb: null, quoted: false, done: word.toLowerCase(), note: rest };
  return { verb: word, quoted: governed && name !== '', done: null, note: rest };
}

/* ── who suggested and who settled ─────────────────────────────────────── */

/**
 * THE WORDS A SETTLED SUGGESTION IS SAID IN, each from where it is already said and none typed here: the answered
 * card's (`cardWords`), and the Slash page's for who drafted it (`byLine`), Slash's own rules or the model it names.
 */
export const settledWords: SettledWords = {
  slash: cardWords.slash,
  accepted: cardWords.accepted,
  declined: cardWords.declined,
  chose: cardWords.chose,
  undid: cardWords.undid,
  drafted: byLine,
};

/**
 * WHO SUGGESTED AND WHO SETTLED, for a line that settled a suggestion of Slash's: "Slash suggested · Mara accepted",
 * then who drafted it where the record says. The line read "Decided" under one name, so a suggestion of Slash's that
 * somebody accepted read as a decision that person came to alone.
 *
 * ONE SENTENCE WITH A ROW'S HISTORY, made by the function that makes it there (`settledSaid`), so the two cannot drift.
 * `settling` is how the line settled it, as `settlingOf` reads a line of the log. `null` for a line that settled
 * nothing, for a person's own or an agent's suggestion, and where the record does not say who suggested: each of those
 * reads as it did. The reader is said as the screen says them. A change Slash's rung let land is said as Slash's own
 * (`slashDidOf`), never as an accept the ladder pressed.
 */
export function settledOf(
  e: { settling?: Settling | null },
  me: string | null = null,
  names: ReadonlyMap<string, string> = new Map(),
): string | null {
  const s = e.settling ?? null;
  return s === null ? null : (slashDidOf(e, me, names) ?? settledSaid(s, actor(s.by, me, names).name, settledWords));
}

/**
 * WHAT SLASH DID WITHOUT ASKING, for a line a question of Slash's made that the ladder answered: "Slash did this without
 * asking", and "Slash did · Mara undid" or "· Mara kept" once somebody acted on it. It read under the ladder's name as
 * an accept nobody pressed, and its Undo as a plain undo.
 *
 * ONE SENTENCE WITH A ROW'S HISTORY, made by `slashDidSaid`, and the one `settledOf` says first, so Activity draws it
 * where it draws who settled. `null` for every other line, which reads as it did.
 */
export function slashDidOf(
  e: { settling?: Settling | null },
  me: string | null = null,
  names: ReadonlyMap<string, string> = new Map(),
): string | null {
  const s = e.settling ?? null;
  return s === null ? null : slashDidSaid(s, (id) => actor(id, me, names).name, settledWords);
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
  /** A minute's lines of one kind by one doer, folded into this one (`sameMinute`), each still a line under it. */
  fold?: Told[];
};

/**
 * ONE LINE FOR A MINUTE'S RUN OF ONE KIND BY ONE DOER (G28): ten "Gave access" lines in the minute a person connected
 * ten machines and keys read as one, "Gave access to 10 machines and keys", which opens in place. `burstsOf` folds a
 * run over the rows of one list; this folds what has no list (an access, a key) and lines a list burst left single.
 * Never a rule's or a script's run (`rolledRuns` says those), nor a pass of BrainDog's own update.
 */
export const MINUTE_MIN = 3;
export function sameMinute(told: readonly Told[]): Told[] {
  const out: Told[] = [];
  const alone = (t: Told): boolean => t.count === 1 && t.fold === undefined && ranOf(t.e) === null && (t.e as Passed).pass === undefined;
  const minute = (at: string): string => at.slice(0, 16);
  for (let i = 0; i < told.length; ) {
    const first = told[i]!;
    let j = i;
    if (alone(first))
      while (j + 1 < told.length && alone(told[j + 1]!) && told[j + 1]!.e.by === first.e.by && told[j + 1]!.e.kind === first.e.kind && minute(told[j + 1]!.e.at) === minute(first.e.at)) j++;
    if (j + 1 - i < MINUTE_MIN) {
      out.push(first);
      i++;
      continue;
    }
    const run = told.slice(i, j + 1);
    out.push({ ...first, key: `${first.key}~minute`, count: run.length, many: null, note: '', from: run.at(-1)!.e.at, fold: run });
    i = j + 1;
  }
  return out;
}

/** A minute's folded run as its one line says it. */
export function minuteSaid(kind: string, word: string, n: number): string {
  if (kind === 'access.grant') return `Gave access to ${count(n)} machines and keys`;
  if (kind === 'access.revoke') return `Took access from ${count(n)} machines and keys`;
  if (kind === 'create') return `Created ${historyWords.rows(n)}`;
  return `${word}, ${historyWords.times(n)}`;
}

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

/* ── a rule or a script that ran ───────────────────────────────────────── */

/** A rule's or a script's run, from who signed a `pull` line: which it is, its id, and its own page. `null` for any other line. */
export function ranOf(e: Pick<AuditEvent, 'kind' | 'by'>): { kind: 'rule' | 'script'; id: string; href: string } | null {
  if (e.kind !== 'pull') return null;
  const rule = /^rule[.:](.+)$/u.exec(e.by)?.[1];
  if (rule !== undefined) return { kind: 'rule', id: rule, href: `/automations/${encodeURIComponent(rule)}` };
  const script = /^script:([^@]+)@v\d+$/u.exec(e.by)?.[1];
  if (script !== undefined) return { kind: 'script', id: script, href: `/scripts/${encodeURIComponent(script)}` };
  return null;
}

/** A run that did not go through, by the words its line says it in. */
const FAILED = /\b(?:did not finish|failed|refused|could not|was held)\b/iu;

/** Whether a line is a run that did not go through: what "What changed" counts apart, and never rolled into one. */
export const ranBadly = (e: Pick<AuditEvent, 'kind' | 'by' | 'note'>): boolean => ranOf(e) !== null && FAILED.test(e.note);

/**
 * WHAT A RUN'S NOTE SAYS ONCE ITS TITLE LEADS THE LINE: "“File what an account holds” ran and wrote one line." is
 * "Wrote one line.", "settle_matched_line did not finish, so it wrote nothing" is "Did not finish, so it wrote nothing",
 * and "Meet payees ran." is nothing at all, since "Ran Meet payees" already says it.
 */
export function ranSaid(note: string, title: string, id: string): string {
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  let rest = scriptWords(note.trim()).replace(new RegExp(`\\b${esc(id)}\\b`, 'gu'), title);
  for (const lead of [`“${title}” `, `"${title}" `, `${title} `, `${humanize(id)} `]) if (rest.startsWith(lead)) rest = rest.slice(lead.length);
  rest = rest.replace(/^ran(?: and |\.?$)/u, '').trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** The script a line was written by, by its id without the version, or `null` for any other doer. */
const scriptOf = (by: string): string | null => /^script:([^@]+)@v\d+$/u.exec(by)?.[1] ?? null;

/**
 * ONE LINE A RULE A DAY, AND ONE A SCRIPT A DAY WITH WHAT IT WROTE. A filing rule runs on every payment that arrives and
 * writes a "ran" line each time, so a day of Activity was forty "Fetched · A rule: Meet payees · Meet payees ran." The
 * runs of one rule on one day that went through are its newest line, saying how many times; a run that failed stays a
 * line of its own, since that one needs him.
 *
 * A SCRIPT THE SAME, AND WHAT IT WROTE FOLDED IN (audit 6f AF11): a script that set up two plans opened the day with
 * eight lines, four "Ran …" and the entries it made and changed between them. Its runs that day are one line, and the
 * writes it signed that day are said on it ("4 times · made 2 entries, changed 12") rather than drawn under it.
 */
export function rolledRuns(told: readonly Told[]): Told[] {
  /* THE SCRIPTS THAT RAN WELL, BY DAY, read first: a script's writes are logged before the run that made them. */
  const ranWell = new Set<string>();
  for (const t of told) {
    const ran = ranOf(t.e);
    if (ran?.kind === 'script' && !ranBadly(t.e)) ranWell.add(`${ran.id}\u0001${dayOf(t.e.at)}`);
  }
  const wrote = new Map<string, { made: number; changed: number }>();
  for (const t of told) {
    const script = t.e.kind === 'pull' ? null : scriptOf(t.e.by);
    const k = script === null ? '' : `${script}\u0001${dayOf(t.e.at)}`;
    if (!ranWell.has(k)) continue;
    const w = wrote.get(k) ?? { made: 0, changed: 0 };
    if (t.e.kind === 'create') w.made += t.count;
    else w.changed += t.count;
    wrote.set(k, w);
  }
  const out: Told[] = [];
  const held = new Map<string, Told>();
  const say = (k: string, n: number): string => {
    const w = wrote.get(k);
    const did = w === undefined ? [] : [w.made > 0 ? `made ${historyWords.rows(w.made)}` : '', w.changed > 0 ? `changed ${w.made > 0 ? count(w.changed) : historyWords.rows(w.changed)}` : ''].filter(Boolean);
    return [n > 1 ? historyWords.times(n) : '', did.join(', ')].filter(Boolean).join(' · ');
  };
  for (const t of told) {
    const ran = ranOf(t.e);
    const script = t.e.kind === 'pull' ? null : scriptOf(t.e.by);
    /* A WRITE OF A SCRIPT THAT RAN WELL THAT DAY IS SAID ON ITS RUN'S LINE. */
    if (script !== null && ranWell.has(`${script}\u0001${dayOf(t.e.at)}`)) continue;
    if (ran === null || ranBadly(t.e)) {
      out.push(t);
      continue;
    }
    const k = ran.kind === 'rule' ? `${t.e.by}\u0001${dayOf(t.e.at)}` : `${ran.id}\u0001${dayOf(t.e.at)}`;
    const keyed = `${ran.kind}\u0001${k}`;
    const had = held.get(keyed);
    if (had) {
      had.count += t.count;
      had.from = t.from;
      had.note = ran.kind === 'script' ? say(k, had.count) : historyWords.times(had.count);
      continue;
    }
    const note = ran.kind === 'script' ? (wrote.has(k) || t.count > 1 ? say(k, t.count) : t.note) : t.count > 1 ? historyWords.times(t.count) : '';
    const line: Told = { ...t, note };
    held.set(keyed, line);
    out.push(line);
  }
  return out;
}

/**
 * THE LOG NEWEST FIRST BY WHEN, THEN BY ITS PLACE IN THE LOG (money F11). The record sends it by version, and a line
 * written with the record's own "now" ahead of the rules that ran after it put 15:00 between 09:00 and 06:00, an
 * order the hour headings then printed as wrong. The version breaks a tie inside one moment, newest first.
 */
export function newestFirst<T extends { at: string; seq: number }>(log: readonly T[]): T[] {
  const when = (at: string): number => {
    const t = Date.parse(at);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  return [...log].sort((a, b) => when(b.at) - when(a.at) || b.seq - a.seq);
}

/** How far apart a question's close and its decision may be and still be one press. */
export const SETTLE_TWIN_MS = 60_000;

/**
 * ONE LINE PER DECISION. Answering a question writes two lines to the log, the decision and the question closing, by
 * the same person on the same question in the same second, and Activity drew both: "Closed “Keep 6 key numbers for
 * Crumb.gg?…”" over "Decided “Keep 6 key numbers for Crumb.gg?…”" at 20:31 (Z34,
 * `audit-390-light.png`). The close is folded into its decision, which keeps its own words and takes the close's note
 * ("Answered in one press, with no reason given") where it has none. A close with no decision beside it, a question
 * withdrawn or one that lapsed, is drawn as it was.
 *
 * THE DECISION NAMES ITS QUESTION BY `settles`. The record writes the decision's own target (`decision:D3`) and the
 * close's (`suggestion:SG11`), so matching the two targets folded nothing on a real log, and "Filed 2 Ledger Post
 * payments under Software" was three lines at 13:40 (audit of 31 October, A18).
 *
 * AND A QUESTION ANSWERED IN THE MOMENT IT WAS ASKED IS ONE LINE TOO. A filing rule asks, and BrainDog settles it on
 * his own arranging in the same instant: the asking is folded into the decision, which says who asked (`asked`). A
 * question that waited for an answer keeps its own line, since that is when it was asked; so does one its own asker
 * answered, and a question reopened after it was answered.
 */
export function oneDecision<T extends Pick<AuditEvent, 'at' | 'by' | 'kind' | 'target' | 'note' | 'settles' | 'asked' | 'settling'>>(log: readonly T[]): T[] {
  const when = (e: T): number => Date.parse(e.at);
  const near = (a: T, b: T): boolean => Math.abs(when(a) - when(b)) <= SETTLE_TWIN_MS;
  const settles = (d: T, question: string | undefined): boolean => d.kind === 'decide' && question !== undefined && (d.target === question || d.settles === question);
  const twin = (close: T, decide: T): boolean => settles(decide, close.target) && decide.by === close.by && near(decide, close);
  const folded = new Map<T, string>();
  const askers = new Map<T, string>();
  const gone = new Set<T>();
  for (const e of log) {
    if (e.kind === 'resolve') {
      const decided = log.find((d) => twin(e, d));
      if (decided === undefined) continue;
      gone.add(e);
      if (decided.note.trim() === '' && e.note.trim() !== '' && !folded.has(decided)) folded.set(decided, e.note);
    } else if (e.kind === 'suggest' && (e.settling ?? null) === null) {
      const decided = log.find((d) => settles(d, e.target) && d.by !== e.by && near(d, e) && when(e) <= when(d));
      if (decided === undefined || askers.has(decided)) continue;
      gone.add(e);
      askers.set(decided, e.by);
    }
  }
  if (gone.size === 0) return [...log];
  return log
    .filter((e) => !gone.has(e))
    .map((e) => (folded.has(e) || askers.has(e) ? { ...e, note: folded.get(e) ?? e.note, ...(askers.has(e) ? { asked: askers.get(e)! } : {}) } : e));
}

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
 *
 * A RUN THE RECORD CAN NAME IS A LANE BY THAT NAME: the app it ran in, else its kind of agent (the line's `run_by`), so
 * a Claude Code run and a Codex run are two lanes. A LANE IS KEYED BY THE WORDS IT IS LABELLED WITH, so two runs of one
 * app share a lane and no two lanes ever carry one name.
 */
export function lanesOf(events: readonly AuditEvent[], clock: number, me: string | null, names: ReadonlyMap<string, string>): AgentLane[] {
  const start = clock - LANE_SPAN_MS;
  const times = new Map<string, number[]>();
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!(t >= start && t <= clock)) continue;
    const who = actor(e.by, me, names, e.run_by ?? null);
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

/** One part of who worked, as the record's figure answers it: what it is called and how many changes. */
export type WhoPart = { label: string; value: number };

/**
 * WHO WORKED OVER THE MONTH, from the record's figure `activity-by-who` (Agents, Rules, You and BrainDog over the last
 * 30 days): its parts that did something, the largest first, or `null` for a refusal, an answer of another shape, or a
 * month with nothing in it (audit 6f AF12: the figure counted BrainDog's own work and no screen drew it).
 */
export function whoPartsOf(answer: unknown): WhoPart[] | null {
  const out = answer as { ok?: unknown; value?: { groups?: unknown } | null } | null | undefined;
  if (out?.ok !== true || !Array.isArray(out.value?.groups)) return null;
  const parts: WhoPart[] = [];
  for (const g of out.value.groups as unknown[]) {
    const p = g as { label?: unknown; value?: unknown } | null;
    if (p === null || typeof p.label !== 'string' || typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value <= 0) continue;
    parts.push({ label: p.label, value: p.value });
  }
  return parts.length === 0 ? null : parts.sort((a, b) => b.value - a.value);
}

/** "Over the last 30 days BrainDog made 333 changes, rules 221 and agents 5." */
export function whoSaid(parts: readonly WhoPart[]): string {
  const said = parts.map((p, i) => {
    const who = p.label === 'BrainDog' ? p.label : p.label.toLowerCase();
    /* EVERY NAME AS IT IS SAID MID-SENTENCE, THE FIRST TOO (empty states, 2 Nov): a new record read "Over the last 30 days
       You made 9 changes". BrainDog keeps its capital, being a name. */
    return i === 0 ? `${who} made ${count(p.value)} ${p.value === 1 ? 'change' : 'changes'}` : `${who} ${count(p.value)}`;
  });
  return `Over the last 30 days ${said[0]}${said.length > 1 ? `, ${listed(said.slice(1))}` : ''}.`;
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
  /** What changed, in a person's words, the most first; a tie keeps the order they were first met in, newest first. */
  parts: { part: string; count: number; agents: number }[];
};

/** The parts "What changed" says that are not a list's name. */
export const partWords = {
  asked: 'Questions asked',
  answered: 'Questions answered',
  predicted: 'Predictions',
  exported: 'Exports',
  imported: 'Imports',
  ran: 'Rule and script runs',
  failed: 'Runs that failed',
  arrived: 'Mail and messages in',
  keys: 'Keys',
  sharing: 'Sharing',
  /* PLUGINS, as a person calls them since 3 Nov ("Add-ons" are plugins in anything a person reads). */
  pages: 'Plugins and pages',
  upkeep: 'Record upkeep',
  other: 'Other changes',
} as const;

/**
 * WHAT A LINE CHANGED, IN A PERSON'S WORDS: a change to a row is its list ("Ledger",
 * "People"), a question asked or answered is that, an export is an export, a rule's run is a run and a failed one is
 * counted apart. "What changed" was split by the log's own verbs, "Fetched 41", and said "Fetched is the biggest share".
 */
export function partOf(e: Pick<AuditEvent, 'kind' | 'by' | 'target' | 'note'>, nameOf: (list: string) => string = listName): string {
  switch (e.kind) {
    case 'suggest':
    case 'propose':
      return partWords.asked;
    case 'decide':
    case 'resolve':
    case 'supersede':
      return partWords.answered;
    case 'predict':
    case 'score':
      return partWords.predicted;
    case 'export':
      return partWords.exported;
    case 'import':
      return partWords.imported;
    case 'pull':
      return FAILED.test(e.note) ? partWords.failed : partWords.ran;
    case 'arrive':
    case 'match':
    case 'extract':
      return partWords.arrived;
    case 'grant.add':
    case 'grant.read':
    case 'grant.rotate':
    case 'grant.revoke':
    case 'grant.bind':
      return partWords.keys;
    case 'access.grant':
    case 'access.revoke':
    case 'share.open':
    case 'share.close':
      return partWords.sharing;
    case 'install':
    case 'uninstall':
    case 'upgrade':
    case 'declare':
    case 'retire':
      return partWords.pages;
    case 'erase':
    case 'migrate':
    case 'restore.pitr':
    case 'purge':
      return partWords.upkeep;
    default: {
      const list = listOf(e.target);
      return list === null ? partWords.other : nameOf(list);
    }
  }
}

export function tallyOf(events: readonly AuditEvent[], me: string | null, names: ReadonlyMap<string, string>, nameOf: (list: string) => string = listName): Tally {
  const groups = new Map<Group, number>();
  const parts = new Map<string, { part: string; count: number; agents: number }>();
  for (const e of events) {
    const group = groupOf(actor(e.by, me, names, e.run_by ?? null).kind);
    groups.set(group, (groups.get(group) ?? 0) + 1);
    const part = partOf(e, nameOf);
    const k = parts.get(part) ?? { part, count: 0, agents: 0 };
    k.count++;
    if (group === 'agent') k.agents++;
    parts.set(part, k);
  }
  return {
    total: events.length,
    groups: GROUPS.flatMap((group) => (groups.has(group) ? [{ group, count: groups.get(group)! }] : [])),
    parts: [...parts.values()].sort((a, b) => b.count - a.count),
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
