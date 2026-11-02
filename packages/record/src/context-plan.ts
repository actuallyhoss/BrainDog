/**
 * WHAT `context` SAYS, RANKED AND BUDGETED (agents and MCP plan §3, W2-B). Pure: the record gathers the facts
 * (`ContextFacts`, in `briefing()`), and this decides what is said, in what order, and what is cut, so a test holds the
 * rules without a record.
 *
 * ON HIS RECORD `context` WAS ABOUT 900 CHARACTERS OF TEXT, AND HALF OF IT THE SAME FOUR TEACHING LINES ON EVERY CALL,
 * while what he told the agent, what it may do, his rules, who else was in the repo and its own lane were not there at
 * all. Now the answer leads with what he told it and fills, in rank order, up to a budget of about 700 tokens
 * (characters / 4, set per agent in Settings):
 *
 *   0 Stop or pause      the whole answer's first line when set; never cut
 *   1 Told you           open instructions, in his voice, with how to take or answer; never cut
 *   2 Card               who and where, Next, the two-sessions warning, Waiting, Learned: five lines, 120 words
 *   3 What you reach     for an agent acting for a colleague, one line of what it can reach; never cut
 *     What you may do    one sentence from the effective settings
 *   4 Rules and brief    his brief for this agent, then rules here, then everywhere: 120 tokens
 *   5 Working here now   other live runs in this repo (worktrees are the same repo); one in your tree or on your
 *                        branch is warned of on the card, the one text the start hook prints
 *   6 Your lane here     open tasks handed to this kind of agent, then ones nobody holds: 5 rows
 *   6b Numbers           the key numbers this agent keeps on this project, stale first, each with when it last came
 *                        in, then how to report one: 4 rows
 *   7 Decided lately     the last 14 days here, answers to this run's own questions first: 3 rows
 *   8 Held               lessons that held: confirmed lately, here before everywhere, method before fact: 3 rows
 *   9 On request only    keys, tools, people and signs, at depth "full"
 *
 * Every section cut says `and N more: <exact call>`. The teaching lines are said once a run, on its first call
 * (`first`), never again. The "More: call context" line is gone (this is context), and so are the owner's vital signs
 * (the app shows them, where he can act).
 *
 * A SCRIPT KEY (`who: null`) is told only what it was told, what it reaches and what it may do.
 */

import type { InstrKind, InstrState, InstrTo, InstrWhen, Stop } from '@braindog/kernel';

import { TWO_SESSIONS, agentName, cardParts, cutTo, labeled, oneLine, since, wordCount, words, type CardAt, type CardParts } from './card.ts';
import { callSaid, decidedLately, lessonsHeld, restCall, RULE, type Lately, type Lesson } from './context-caps.ts';
import { listFor } from './agent-lists.ts';
import { dayWords } from './headlines.ts';
import type { Context } from './index.ts';

/* ── the budget ────────────────────────────────────────────────────────── */

/** The default budget, in tokens, as Settings › Agents sets it (`ProfileContext.budget`). */
export const PLAN_BUDGET = 700;
/** The budget of `depth: "full"`. */
export const FULL_BUDGET = 4_000;
/** The card's most lines and words. */
export const PLAN_CARD_LINES = 5;
export const PLAN_CARD_WORDS = 120;
/** The rules-and-brief section's most tokens. */
export const RULES_TOKENS = 120;
/** The most rows of each section in the default answer; `full` holds four times as many. */
export const ROWS = { here: 4, lane: 5, kpis: 4, decided: 3, learned: 3 } as const;

/** A text's size as the plan counts it: characters / 4, rounded up. */
export const tokensOf = (text: string): number => Math.ceil([...text].length / 4);

export type Depth = 'card' | 'brief' | 'task' | 'full';

/* ── the facts ─────────────────────────────────────────────────────────── */

/**
 * One open instruction, as the record hands it: `id` spoken (`IN4`), what he said, who said it by name ("Mara"), when
 * (ISO), and where it stands. `taken_by` is the run that took it, spoken; this run is `ContextFacts.run`.
 */
export type ToldFact = {
  id: string;
  said: string;
  by?: string | null | undefined;
  at: string;
  kind?: InstrKind | undefined;
  when?: InstrWhen | undefined;
  to?: InstrTo | undefined;
  state?: InstrState | undefined;
  taken_by?: string | null | undefined;
  /** The task it is about, by name, and the instruction a redirect replaced, spoken. */
  task?: string | null | undefined;
  replaces?: string | null | undefined;
};

/**
 * What the agent may do, from its effective settings (`whoami`'s `effective`): its ceiling, the lists it writes by name
 * (`null` for every list it reads), where (the record or project, by name), what is always asked, and tools switched
 * off. Or the sentence itself, when the record already said it.
 */
export type MayFact = {
  ceiling: 'read' | 'propose' | 'write';
  lists?: readonly string[] | null | undefined;
  on?: string | null | undefined;
  asked?: readonly string[] | undefined;
  off?: readonly string[] | undefined;
};

/** A rule: its words and whether it is this project's. */
export type RuleFact = { said: string; here?: boolean | undefined };

/** Another live run in this repo or project: its handle, app, what it says it is doing, branch, worktree and age. */
export type OtherRun = {
  spoken: string;
  agent?: string | null | undefined;
  doing?: string | null | undefined;
  branch?: string | null | undefined;
  worktree?: string | null | undefined;
  /** Seconds since it started: how long it has been at it. */
  for_s?: number | undefined;
  /** It shares this run's working tree (the same folder), which is warned of like the same branch. */
  same_tree?: boolean | undefined;
  /** This run's lead (the session that started this worktree builder), or a sibling builder of the same lead. */
  role?: 'lead' | 'sibling' | undefined;
  /** What the lead was told, for a builder: the instruction it is working from. */
  told?: string | null | undefined;
};

/** A task in the lane: its words, handle, version and state; `mine` when its agent field is this kind of agent. */
export type LaneRow = { name: string; spoken: string; version?: number | undefined; state?: string | null | undefined; mine: boolean };

/**
 * A key number this agent keeps on the project it is in (the KPI plan of 21 October, K4-A): its name, how often a value
 * should come in, when the last one did (ISO, `null` for never), and whether it stopped arriving.
 */
export type KpiFact = { name: string; every?: string | null | undefined; last: string | null; stale: boolean };

/** What an agent does with a key number it keeps, said once under them. */
export const KPI_HOW = 'Report a reading with create on Numbers; propose anything else.';

/** A lesson: its handle and words, and how `lessonsHeld` ranks it. */
export type LessonFact = Lesson & { said: string };

/** The task in hand, whole, so an update needs no `get` (depth `task`). */
export type TaskFact = {
  name: string;
  spoken: string;
  version: number;
  state?: string | null | undefined;
  /** Its other fields as a person reads them, label to value. */
  fields?: Readonly<Record<string, string>> | undefined;
  note?: string | null | undefined;
  /** Its last history lines, newest first. */
  history?: readonly string[] | undefined;
  people?: readonly string[] | undefined;
  keys?: readonly string[] | undefined;
  tools?: readonly string[] | undefined;
  /** Other runs that touched it, as lines. */
  runs?: readonly string[] | undefined;
};

/* ── a task's values as a person reads them ───────────────────────────── */

/** Seconds in each unit a duration is said in, largest first. */
const DURATION_UNITS: readonly (readonly [unit: string, seconds: number, one: string])[] = [
  ['w', 604_800, 'week'],
  ['d', 86_400, 'day'],
  ['h', 3_600, 'hour'],
  ['m', 60, 'minute'],
  ['s', 1, 'second'],
];

/**
 * A duration the record keeps in whole seconds, in its field's unit or the largest it fills: "1 day", "2.5 hours".
 * `context {task}` said "effort: 86400".
 */
export function durationWords(seconds: number, unit?: string): string {
  const [, size, one] = DURATION_UNITS.find(([u]) => u === unit) ?? DURATION_UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? DURATION_UNITS[4]!;
  const n = Math.round((seconds / size) * 10) / 10;
  return `${String(n)} ${n === 1 ? one : `${one}s`}`;
}

/**
 * One value of a task's field as a person reads it, by the field's type: a day as "9 Sep", an instant as "30 Oct 19:33",
 * a duration in words, an enum by its label, true and false as yes and no. `null` for anything the plan does not say
 * (an object, an empty value). A text, a ref already named, and a number are said as they are.
 */
export function valueWords(
  field: { type?: string; labels?: Readonly<Record<string, string>> | undefined; unit?: string | undefined } | undefined,
  value: unknown,
  now: number,
): string | null {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return null;
  switch (field?.type) {
    case 'day':
      return typeof value === 'string' ? dayWords(value.slice(0, 10), now) : String(value);
    case 'instant':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(value) ? `${dayWords(value.slice(0, 10), now)} ${value.slice(11, 16)}` : String(value);
    case 'duration':
      return typeof value === 'number' ? durationWords(value, field.unit) : String(value);
    case 'enum':
      return typeof value === 'string' ? (field.labels?.[value] ?? value.replace(/_/gu, ' ')) : String(value);
    case 'bool':
      return value === true ? 'yes' : value === false ? 'no' : String(value);
    default:
      return typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  }
}

/** What changed since the stamp the caller holds (`context {since}`): nothing else is said. */
export type SinceFact = {
  stamp: string;
  told?: readonly ToldFact[] | undefined;
  decided?: readonly Lately[] | undefined;
  handed?: readonly LaneRow[] | undefined;
  /** Runs that started or ended in this repo, as lines ("S884 Claude Code started: Builder 1"). */
  runs?: readonly string[] | undefined;
  learned?: readonly LessonFact[] | undefined;
};

/** The calls a cut section names, by section, and how many rows there are in all where more were left unread. */
export type SectionId = 'stop' | 'told' | 'reach' | 'may' | 'rules' | 'here' | 'lane' | 'kpis' | 'decided' | 'learned' | 'task' | 'needs' | 'teach' | 'extra' | 'since';

/**
 * Everything `context` may say, gathered by the record (§8.3). `who` is the card's lines (`cardParts`), or `null` for a
 * script key. The rest are plain facts already held to what the caller may read.
 */
export type ContextFacts = {
  stop: Stop | null;
  told: readonly ToldFact[];
  who: CardParts | null;
  may: MayFact | string | null;
  /**
   * What an agent acting for a colleague can reach, in one line (`acts-for.ts`): "You act for Sam and can view Kiln.
   * Amounts are hidden from you." Said beside May and never cut, so it knows why a list is not there. `null` or absent for an owner's agent.
   */
  reach?: string | null | undefined;
  rules: readonly RuleFact[];
  brief: string | null;
  others: readonly OtherRun[];
  lane: readonly LaneRow[];
  decided: readonly Lately[];
  learned: readonly LessonFact[];
  /** The key numbers this agent keeps here, by owner. */
  kpis?: readonly KpiFact[] | undefined;
  task?: TaskFact | undefined;
  since?: SinceFact | undefined;
  /** The caller's run, spoken, its app (`claude`) and its branch. */
  run?: string | null | undefined;
  agent?: string | null | undefined;
  branch?: string | null | undefined;
  /** The record's person by name ("Mara"), whose voice a stop is said in. */
  owner?: string | null | undefined;
  /** The instant the plan is drawn at, ms. */
  now: number;
  /** The record's version for this run (`stampFor`), carried on the plan so the door can hand it on. */
  stamp?: string | undefined;
  /**
   * The first line Today opens on (the record's briefing, by its rules), asked only when the card has no step to give:
   * no instruction in hand, no step left here and nothing in this agent's lane (AK18). `null` when Today says nothing.
   * Said as the person's own line, never as the agent's Next (RK8). Held by the record for the call (`carded`).
   */
  today?: (() => string | null) | undefined;
  /** Outside any project: the projects this agent worked on last, by name. */
  recent?: readonly string[] | undefined;
  /**
   * The record asks this run which project it is in (`Context.ask`, an agent with no folder), in its own line naming
   * `topic`: the card then says "No project here." and names no argument of its own (audit 10k, AK24).
   */
  asks?: boolean | undefined;
  /** This run's first call: the teaching lines are said, once. */
  first?: boolean | undefined;
  teach?: readonly string[] | undefined;
  /** Section 9, said only at depth `full`. */
  extra?: { keys?: readonly string[]; tools?: readonly string[]; people?: readonly string[]; signs?: readonly string[] } | undefined;
  /** How many rows a section has in all, when the facts hold only the first few, and the call that lists them. */
  totals?: Partial<Record<SectionId, number>> | undefined;
  calls?: Partial<Record<SectionId, string>> | undefined;
};

/* ── the plan ──────────────────────────────────────────────────────────── */

/** One section as said: its lines, ready to print, and what was cut with the call that lists it. */
export type PlanSection = { id: SectionId; lines: string[]; more?: { n: number; call: string }; foot?: string };

/**
 * The plan: the card, the sections in the order said, and the size of the whole as `planText` prints it. Sections
 * `stop` and `told` print before the card, the rest after it. `retire` is the lessons suggested for retiring (handles),
 * returned, never filed.
 */
export type Plan = { card: string; sections: PlanSection[]; tokens: number; retire: string[]; stamp?: string };

export type PlanOptions = { budget?: number | undefined; depth?: Depth | undefined };

/* ── the words ─────────────────────────────────────────────────────────── */

const INDENT = ' '.repeat(9);
const DAY_S = 86_400;

/** Rows under one label: the label on the first, the rest indented to line up. */
const rowsUnder = (label: string, rows: readonly string[]): string[] => rows.map((r, i) => (i === 0 ? labeled(label, r) : `${INDENT}${r}`));

/** The more line a cut section ends with, or says alone when none of its rows fit. */
const moreLine = (label: string, more: { n: number; call: string }, alone: boolean): string =>
  alone ? labeled(label, `${String(more.n)} here: ${more.call}`) : `${INDENT}and ${String(more.n)} more: ${more.call}`;

/** How long ago an ISO instant was, at `now`, as the card says it. */
const ago = (at: string | null | undefined, now: number): string | null => {
  const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isFinite(ms) ? since(Math.max(0, (now - ms) / 1_000)) : null;
};

/** A length of time in seconds as "32m" or "4h". */
const span = (s: number | undefined): string | null => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return null;
  if (s < 3_600) return `${String(Math.max(1, Math.floor(s / 60)))}m`;
  if (s < DAY_S) return `${String(Math.floor(s / 3_600))}h`;
  return `${String(Math.floor(s / DAY_S))}d`;
};

/** A name and a list as a person says it: "Tasks", "Tasks and Learnings", "Tasks, Notes and Learnings". */
const and = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`);

/** His words as an agent reads them, always marked as his: `Mara said in BrainDog: "…"`. */
const voice = (who: string, id: string, said: string, verb = 'said'): string => `${who} ${verb} in BrainDog (${id}): "${oneLine(said)}"`;

/** The answer's first line when the run is stopped or paused, and what still works. */
export function stopLine(stop: Stop, by: string): string {
  return stop.kind === 'stop'
    ? `${voice(by, stop.id, stop.said, 'stopped you')}. Stop now: reply with instructions, leave a handoff, then end.`
    : `${voice(by, stop.id, stop.said, 'paused you')}. Wait: only instructions, handoff and log on your run go through until they resume you.`;
}

/** One instruction as "Told you" says it: who, when, what, and how to take or answer it. */
export function toldLine(t: ToldFact, run: string | null, now: number, owner?: string | null): string {
  const by = t.by && oneLine(t.by) ? words(t.by, 24) : owner && oneLine(owner) ? words(owner, 24) : 'The owner';
  const when = ago(t.at, now);
  const whom = t.to === 'anyone' ? ', for whoever is next' : t.task ? `, on ${words(t.task, 40)}` : '';
  const head = `${voice(by, t.id, t.said)}${whom}${when === null ? '' : `, ${when}`}`;
  const instead = t.replaces ? ` It replaces ${t.replaces}.` : '';
  if (t.taken_by && run !== null && t.taken_by === run)
    return `${head}.${instead} You have it: when done, instructions {reply:"${t.id}", said:"…", state:"done"}.`;
  if (t.taken_by) return `${head}.${instead} ${t.taken_by} has it.`;
  return `${head}.${instead} Take it: instructions {take:"${t.id}"}.`;
}

/** What the agent may do, in one sentence. */
export function mayLine(may: MayFact | string): string {
  if (typeof may === 'string') return oneLine(may);
  const asked = may.asked && may.asked.length > 0 ? may.asked : ['money', 'keys', 'deletes'];
  const on = may.on && oneLine(may.on) ? ` on ${words(may.on, 40)}` : '';
  const off = may.off && may.off.length > 0 ? ` Off for you: ${and(may.off.map((t) => words(t, 24)))}.` : '';
  if (may.ceiling === 'read') return `You only read${on}: ask for any change with propose.${off}`;
  if (may.ceiling === 'propose') return `You suggest${on}: every change goes to the person with propose, and they decide in BrainDog.${off}`;
  const lists = may.lists === null || may.lists === undefined ? 'every list you read' : and(may.lists.map((l) => words(l, 30)));
  return `You write ${lists}${on}; ${and(asked)} are asked.${off}`;
}

/** A run working here now, as one row: who, what, branch, how long. */
function otherLine(r: OtherRun): string {
  const app = agentName(r.agent);
  const doing = r.doing && oneLine(r.doing) ? `, ${words(r.doing, 60)}` : '';
  const notes = [...(r.branch ? [`branch ${words(r.branch, 40)}`] : []), ...(span(r.for_s) === null ? [] : [`for ${span(r.for_s)!}`])];
  const lead = r.role === 'lead' ? 'Your lead ' : '';
  const told = r.role === 'lead' && r.told && oneLine(r.told) ? `; told "${words(r.told, 80)}"` : '';
  return `${lead}${r.spoken}${app === null ? '' : ` ${app}`}${doing}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}${told}`;
}

/** A task in the lane: its words, handle and version, its state, and whose. */
const laneLine = (t: LaneRow): string =>
  `${words(t.name, 70)} (${t.spoken}${typeof t.version === 'number' ? ` v${String(t.version)}` : ''})${t.state ? ` · ${words(t.state, 16)}` : ''} · ${t.mine ? 'yours' : 'nobody has it yet'}`;

/** The lane's call: the tasks handed to this kind of agent, or that nobody holds. */
const laneCall = (list: string, agent: string | null | undefined): string =>
  callSaid('list', { register: list, where: { field: 'agent', is: agent && agent.trim() ? agent.trim() : 'claude' } });

/** A cadence as a person says it. */
const EVERY_SAID: Readonly<Record<string, string>> = { '1h': 'hourly', '1d': 'daily', '1w': 'weekly', '1m': 'monthly' };

/** A key number as one row: "Players, daily: reported 23d ago, stale", or "never reported". */
export function kpiLine(k: KpiFact, now: number): string {
  const every = k.every ? EVERY_SAID[k.every] : undefined;
  const when = ago(k.last, now);
  return `${words(k.name, 50)}${every ? `, ${every}` : ''}: ${when === null ? 'never reported' : `reported ${when}`}${k.stale ? ', stale' : ''}`;
}

/* ── the card ──────────────────────────────────────────────────────────── */

/**
 * THE TWO-SESSIONS WARNING, when another live run shares this run's working tree or its branch. The record's own
 * same-tree line (`also_here`) when it sent one: it knows the machine and the helpers, and says the warning word for
 * word, then who by name and what each is doing. Else the runs here on this branch or in this tree, and the warning.
 * `null` when nobody is. The card says it, so "Working here now" does not.
 */
function clashLine(f: ContextFacts): string | null {
  if (f.who?.also) return f.who.also;
  const mine = (f.branch ?? '').trim();
  const branchOf = (o: OtherRun): boolean => mine !== '' && (o.branch ?? '').trim() === mine;
  const clash = [...f.others].sort((a, z) => Number(z.role === 'lead') - Number(a.role === 'lead')).filter((o) => o.same_tree === true || branchOf(o));
  if (clash.length === 0) return null;
  const where = clash.every(branchOf) ? `on your branch ${words(mine, 40)}` : 'in your working tree';
  return labeled('Also', `${and(clash.map((o) => o.spoken))} ${clash.length === 1 ? 'is' : 'are'} ${where}. ${TWO_SESSIONS}`);
}

/**
 * The plan's card: line one (or "No project here." with the projects worked on last), then Next (the instruction in
 * hand, else the step left here, else the top of its lane), the two-sessions warning when true, then Waiting and the one
 * lesson that leads, and the line saying the command is older when it is. At most five lines and 120 words: the warning
 * and the Update line, when true, are kept and Learned gives way. The other runs moved to "Working here now", the red
 * signs to the app, and "More" is gone. A builder in a worktree is not given the owner's queue.
 *
 * THE START HOOK PRINTS THIS CARD AND NOTHING ELSE, so the warning is a line of it: an agent sharing a tree is told at
 * start, not only when it calls `context`.
 */
/** Today's first line, or `null` when it says nothing or cannot be read. */
const todayLine = (f: ContextFacts): string | null => {
  try {
    const line = f.today?.() ?? null;
    return line === null || line.trim() === '' ? null : oneLine(line);
  } catch {
    return null;
  }
};

function planCard(f: ContextFacts, lesson: string | null, builder: boolean, clash: string | null): string {
  const who = f.who!;
  const recent = (f.recent ?? []).map((r) => words(r, 30)).filter(Boolean).slice(0, 3);
  const first = who.placed
    ? who.who
    : `${who.who.replace(/, no project yet:.*$/u, '')}. No project here.${
        f.asks === true ? (recent.length > 0 ? ` Lately: ${and(recent)}.` : '') : recent.length > 0 ? ` Lately: ${and(recent)}; name one to context as project.` : ' Name it to context as project.'
      }`;
  const inHand = f.told.find((t) => t.taken_by && f.run && t.taken_by === f.run && t.kind !== 'stop' && t.kind !== 'pause');
  const top = f.lane.find((t) => t.mine);
  /* A STEP LEFT HERE, ELSE THE TOP OF THE LANE (AK18). WHAT TODAY OPENS ON IS THE PERSON'S, never the agent's step
     (audit 31k, RK8): "Next: Today: Dentist is 3 days late" sent a Kiln run to his dentist. So it is its own line, said as
     his, and only to an agent with nothing in hand, no step left and no lane here; a builder is never given it. */
  const handed = who.next !== null && who.next !== undefined && !who.next.includes('Nothing was handed over') ? who.next : null;
  const today = inHand || handed || f.lane.length > 0 || builder ? null : todayLine(f);
  const next = inHand
    ? labeled('Next', `${inHand.id}, in hand: do it, then reply with instructions.`)
    : (handed ?? (top ? labeled('Next', `${words(top.name, 70)} (${top.spoken}, yours)`) : (who.next ?? null)));
  const his = today === null ? null : labeled('Today', `${words(today, 60)} (${words(f.owner ?? 'the owner', 24)}'s, not a step for you)`);
  const learned = lesson === null ? null : labeled('Learned', words(lesson, 91));
  const lines = [first, next, his, clash, builder ? null : who.waiting, learned, who.update].filter((l): l is string => l !== null);
  /* FIVE LINES AT MOST: line one, Next, the warning, Waiting and Update are five, so Learned is the one that gives way,
     then Today, which is his and is in BrainDog whatever the card says. */
  if (lines.length > PLAN_CARD_LINES && learned !== null) lines.splice(lines.indexOf(learned), 1);
  if (lines.length > PLAN_CARD_LINES && his !== null) lines.splice(lines.indexOf(his), 1);
  return cutTo(lines, PLAN_CARD_WORDS).join('\n');
}

/* ── the plan ──────────────────────────────────────────────────────────── */

/**
 * What `context` says, from the facts the record gathered, cut to the budget (`budget` tokens, 700 by default, 4,000 at
 * depth `full`). Stop, Told you and the card are never cut; every other section takes the rows that fit, in rank order,
 * and says how many it left with the call that lists them. `tokens` is the size of `planText(plan)`.
 */
export function planContext(f: ContextFacts, opts: PlanOptions = {}): Plan {
  const depth: Depth = opts.depth ?? (f.task ? 'task' : 'brief');
  const full = depth === 'full';
  const budget = Math.max(opts.budget ?? PLAN_BUDGET, full ? FULL_BUDGET : 0);
  const times = full ? 4 : 1;
  const run = f.run ?? null;
  const by = f.owner ?? f.told.find((t) => t.by)?.by ?? null;
  const sections: PlanSection[] = [];
  const said = (p: { card: string; sections: PlanSection[] }): number => tokensOf(planText({ ...p, tokens: 0, retire: [] }));

  /* 0 AND 1, NEVER CUT. A stop or a pause is the answer's first line. */
  if (f.stop) sections.push({ id: 'stop', lines: [labeled('Stop', stopLine(f.stop, words(by ?? 'The owner', 24)))] });
  const told = (f.since ? (f.since.told ?? []) : f.told).filter((t) => t.kind !== 'stop' && t.kind !== 'pause');
  if (told.length > 0) sections.push({ id: 'told', lines: rowsUnder('Told', told.map((t) => toldLine(t, run, f.now, f.owner))) });

  /* A SCRIPT KEY is told what it was told and what it may do, and nothing else. */
  if (f.who === null) {
    if (f.reach) sections.push({ id: 'reach', lines: [labeled('Reach', oneLine(f.reach))] });
    if (f.may !== null) sections.push({ id: 'may', lines: [labeled('May', mayLine(f.may))] });
    const plan = { card: '', sections };
    return { ...plan, tokens: said(plan), retire: [], ...(f.stamp ? { stamp: f.stamp } : {}) };
  }

  /* SINCE A STAMP, only what changed: "Nothing new" is one line. */
  if (f.since) {
    const s = f.since;
    const decided = decidedLately(s.decided ?? [], f.now, 3 * times);
    const learned = (s.learned ?? []).map((l) => words(l.said, 100));
    const rows: [SectionId, string, string[]][] = [
      ['decided', 'Decided', decided],
      ['lane', 'Handed', (s.handed ?? []).map(laneLine)],
      ['here', 'Runs', (s.runs ?? []).map((r) => words(r, 100))],
      ['learned', 'Learned', learned],
    ];
    for (const [id, label, lines] of rows) if (lines.length > 0) sections.push({ id, lines: rowsUnder(label, lines) });
    if (sections.length === 0) sections.push({ id: 'since', lines: [labeled('Since', 'Nothing new since you last looked.')] });
    const plan = { card: '', sections };
    return { ...plan, tokens: said(plan), retire: [], stamp: f.stamp ?? s.stamp };
  }

  /* THE LESSONS, ranked once: the first leads the card's Learned, the next go to "Learned here". */
  const held = lessonsHeld(f.learned, f.now);
  const lessons = held.rows.map((l) => oneLine(l.said)).filter(Boolean);
  const builder = f.others.some((o) => o.role === 'lead');
  const cardText = planCard(f, lessons[0] ?? null, builder, clashLine(f));
  const plan = { card: cardText, sections };
  const done = (): Plan => ({ ...plan, tokens: said(plan), retire: held.retire, ...(f.stamp ? { stamp: f.stamp } : {}) });
  if (depth === 'card') return done();

  /**
   * One ranked section: as many of its rows as fit in what the budget has left, with the more line when any were cut.
   * `kept` rows are said whatever the budget (the same-branch warning). `total` counts rows the facts did not hold.
   */
  const fill = (id: SectionId, label: string, all: readonly string[], cap: number, call: string, opt: { kept?: string[]; total?: number; tokens?: number; foot?: string } = {}): void => {
    const kept = opt.kept ?? [];
    const rows = all.slice(0, cap);
    const total = Math.max(opt.total ?? 0, all.length);
    for (let k = rows.length; k >= 0; k--) {
      const n = total - k;
      if (k === 0 && kept.length === 0 && n === 0) break;
      /* A FOOT IS SAID UNDER THE ROWS, after the more line, while any row is, and goes with the last of them. */
      const section: PlanSection = { id, lines: rowsUnder(label, [...kept, ...rows.slice(0, k)]), ...(n > 0 ? { more: { n, call } } : {}), ...(opt.foot && k > 0 ? { foot: opt.foot } : {}) };
      /* A SECTION WITH A CAP OF ITS OWN (rules and brief, 120 tokens) keeps to it as well as to the budget. */
      if (opt.tokens !== undefined && k > 0 && tokensOf(sectionText(section, label).join('\n')) > opt.tokens) continue;
      if (said({ card: cardText, sections: [...sections, section] }) <= budget) {
        sections.push(section);
        return;
      }
    }
    /* NOT EVEN ITS MORE LINE FITS: the warning still goes in; the rest is for `context {depth:"full"}`. */
    if (kept.length > 0) sections.push({ id, lines: rowsUnder(label, kept) });
  };
  const calls = f.calls ?? {};
  const totals = f.totals ?? {};

  /* 3 WHAT YOU REACH, for an agent acting for a colleague, never cut; then WHAT YOU MAY DO, one line. */
  if (f.reach) sections.push({ id: 'reach', lines: [labeled('Reach', oneLine(f.reach))] });
  if (f.may !== null) fill('may', 'May', [mayLine(f.may)], 1, 'whoami');

  /* THE TASK IN HAND, whole, at depth `task`: fields, note, last three history lines and its version. */
  if (depth === 'task' && f.task) {
    const t = f.task;
    const rows = [
      `${words(t.name, 90)} (${t.spoken} v${String(t.version)})${t.state ? ` · ${t.state}` : ''}`,
      ...Object.entries(t.fields ?? {}).map(([k, v]) => `${words(k, 20)}: ${words(v, 90)}`),
      ...(t.note ? [`Note: ${words(t.note, 200)}`] : []),
      ...(t.history ?? []).slice(0, 3).map((h) => `History: ${words(h, 90)}`),
    ];
    sections.push({ id: 'task', lines: rowsUnder('Task', rows) });
  }

  /* 4 RULES AND BRIEF: his brief for this agent, then this project's rules, then everywhere's. */
  const rules = [...f.rules].filter((r) => oneLine(r.said)).sort((a, z) => Number(z.here === true) - Number(a.here === true));
  const ruleRows = [...(f.brief && oneLine(f.brief) ? [`Brief: ${words(f.brief, 300)}`] : []), ...rules.map((r) => words(r.said, 100))];
  if (ruleRows.length > 0) fill('rules', 'Rules', ruleRows, ruleRows.length, calls.rules ?? callSaid('list', { register: 'learnings', where: { field: 'kind', is: RULE } }), { total: (totals.rules ?? 0) + (ruleRows.length - rules.length), tokens: full ? RULES_TOKENS * 4 : RULES_TOKENS });

  if (depth === 'task' && f.task) {
    const t = f.task;
    const needs = [
      ...((t.people ?? []).length > 0 ? [`People: ${and((t.people ?? []).map((p) => words(p, 30)))}`] : []),
      ...((t.keys ?? []).length > 0 ? [`Keys: ${and((t.keys ?? []).map((k) => words(k, 30)))}`] : []),
      ...((t.tools ?? []).length > 0 ? [`Tools: ${and((t.tools ?? []).map((k) => words(k, 30)))}`] : []),
      ...(t.runs ?? []).map((r) => `Run: ${words(r, 90)}`),
    ];
    if (needs.length > 0) fill('needs', 'Needs', needs, needs.length, callSaid('get', { spoken: t.spoken }));
  }

  /* 5 WORKING HERE NOW: the lead first for a builder, then the others. A run in this tree or on this branch is warned of
     on the card (`clashLine`), never cut, and only there, so the text says it once. */
  const others = [...f.others].sort((a, z) => Number(z.role === 'lead') - Number(a.role === 'lead'));
  if (others.length > 0) fill('here', 'Here now', others.map(otherLine), ROWS.here * times, calls.here ?? callSaid('list', { register: 'session', where: { field: 'state', is: 'active' } }), { total: totals.here ?? 0 });

  /* 6 YOUR LANE: handed to this kind of agent first, then free. */
  const lane = [...f.lane].sort((a, z) => Number(z.mine) - Number(a.mine));
  if (depth !== 'task' && lane.length > 0) fill('lane', 'Lane', lane.map(laneLine), ROWS.lane * times, calls.lane ?? laneCall(/^([a-z][a-z0-9_]*)#/u.exec(lane[0]!.spoken)?.[1] ?? 'list', f.agent), { total: totals.lane ?? 0 });

  /* 6b NUMBERS: the key numbers it keeps here, stale ones first, then how to report one. */
  const kpis = [...(f.kpis ?? [])].sort((a, z) => Number(z.stale) - Number(a.stale));
  if (depth !== 'task' && kpis.length > 0)
    fill('kpis', 'Numbers', kpis.map((k) => kpiLine(k, f.now)), ROWS.kpis * times, calls.kpis ?? callSaid('list', { register: 'kpis', where: { field: 'owner', is: f.agent && f.agent.trim() ? f.agent.trim() : 'claude' } }), { foot: KPI_HOW });

  /* 7 DECIDED LATELY. */
  const decided = decidedLately(f.decided, f.now, Number.POSITIVE_INFINITY);
  if (decided.length > 0) fill('decided', 'Decided', decided, ROWS.decided * times, calls.decided ?? callSaid('governance', { register: 'decision' }), { total: totals.decided ?? 0 });

  /* 8 LEARNED HERE: after the one the card leads with. */
  if (depth !== 'task' && lessons.length > 1)
    fill('learned', 'Held', lessons.slice(1).map((l) => words(l, 100)), ROWS.learned * times, calls.learned ?? restCall('learnings'), { total: Math.max(0, (totals.learned ?? 0) - 1) });

  /* THE TEACHING LINES, once a run. */
  if (f.first === true && (f.teach ?? []).length > 0) fill('teach', 'How', (f.teach ?? []).map(oneLine), (f.teach ?? []).length, callSaid('context', { depth: 'full' }));

  /* 9 ON REQUEST ONLY. */
  if (full && f.extra) {
    const e = f.extra;
    const rows = [
      ...((e.keys ?? []).length > 0 ? [`Keys: ${and((e.keys ?? []).slice(0, 40).map((k) => words(k, 30)))}`] : []),
      ...((e.tools ?? []).length > 0 ? [`Tools: ${and((e.tools ?? []).slice(0, 40).map((k) => words(k, 30)))}`] : []),
      ...((e.people ?? []).length > 0 ? [`People: ${and((e.people ?? []).slice(0, 20).map((k) => words(k, 30)))}`] : []),
      ...(e.signs ?? []).slice(0, 10).map((s) => `Sign: ${words(s, 100)}`),
    ];
    if (rows.length > 0) fill('extra', 'Also', rows, rows.length, 'record_index');
  }
  return done();
}

/** A section's lines with its more line, as printed. */
function sectionText(s: PlanSection, label: string): string[] {
  const foot = s.foot ? [`${INDENT}${s.foot}`] : [];
  if (!s.more) return [...s.lines, ...foot];
  return s.lines.length === 0 ? [moreLine(label, s.more, true)] : [...s.lines, moreLine(label, s.more, false), ...foot];
}

/** The label a section's rows print under, for its more line when none of them fit. */
const LABELS: Record<SectionId, string> = {
  stop: 'Stop',
  told: 'Told',
  reach: 'Reach',
  may: 'May',
  rules: 'Rules',
  here: 'Here now',
  lane: 'Lane',
  kpis: 'Numbers',
  decided: 'Decided',
  learned: 'Held',
  task: 'Task',
  needs: 'Needs',
  teach: 'How',
  extra: 'Also',
  since: 'Since',
};

/** The plan as the agent reads it: Stop and Told you, the card, then the rest, each cut section with its more line. */
export function planText(p: Plan): string {
  const first = p.sections.filter((s) => s.id === 'stop' || s.id === 'told');
  const rest = p.sections.filter((s) => s.id !== 'stop' && s.id !== 'told');
  return [...first.flatMap((s) => sectionText(s, LABELS[s.id])), ...(p.card ? [p.card] : []), ...rest.flatMap((s) => sectionText(s, LABELS[s.id]))].join('\n');
}

/** The card's words, as the sign `agent-card-words` reads them. */
export const planCardWords = (p: Plan): number => wordCount(p.card);

/* ── the facts from today's context ────────────────────────────────────── */

/** What `factsFromContext` is told beside the context: the card's `at`, the instant, and what `Context` does not hold. */
export type FactsAt = CardAt & { now: number } & Partial<Pick<ContextFacts, 'stop' | 'told' | 'may' | 'reach' | 'brief' | 'first' | 'teach' | 'stamp' | 'recent' | 'extra' | 'task' | 'since' | 'kpis' | 'today'>>;

const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

/**
 * The facts `planContext` reads, from the `Context` the record answers today, for what it holds: the card's lines, the
 * other runs in this tree, the lane (rows handed to this agent on the work lists, then free ones), rules, decisions
 * and lessons. What `Context` does not hold (instructions, the stop, the effective settings, his brief, whether this
 * is the run's first call) comes in `at`. The record's `briefing()` gathers these itself once it has them (W2-A).
 */
export function factsFromContext(c: Context, at: FactsAt): ContextFacts {
  const run = at.run === undefined ? (c.session?.spoken ?? null) : at.run;
  const me = (at.agent ?? '').trim().toLowerCase().replace(/^agent:/u, '');
  /* THE WORK LISTS ARE THE ONES THAT PLAY NONE OF THE AGENTS' PARTS (a role), runs aside: what the card's Next reads. */
  const work = c.registers.filter((r) => r.id !== 'session' && r.role === undefined);
  const tasks = work.find((r) => [...r.rows, ...r.inherited].some((row) => typeof row.agent === 'string')) ?? work[0];
  const lane: LaneRow[] = (tasks ? [...tasks.rows, ...tasks.inherited] : [])
    .map((row) => {
      const agent = typeof row.agent === 'string' ? row.agent.trim().toLowerCase().replace(/^agent:/u, '') : '';
      const name = Object.entries(row).find(([k, v]) => !['spoken', 'scope', 'state', 'version', 'agent', 'created_at'].includes(k) && typeof v === 'string' && v.trim())?.[1];
      return { row, agent, name: typeof name === 'string' ? name : row.spoken };
    })
    .filter(({ agent }) => agent === '' || agent === me)
    .map(({ row, agent, name }) => ({ name, spoken: row.spoken, version: row.version, state: row.state === null ? null : (tasks?.states?.[row.state] ?? row.state), mine: agent !== '' && agent === me }));
  const learnings = ((id) => (id === null ? undefined : c.registers.find((r) => r.id === id)))(listFor('learnings', c.registers));
  const learned: LessonFact[] = (learnings ? [...learnings.rows, ...learnings.inherited] : [])
    .filter((row) => row.state === null || row.state === 'active')
    .map((row) => ({
      spoken: row.spoken,
      said: str(row.lesson) ?? '',
      kind: str(row.kind),
      here: row.scope === 'project',
      made: str(row.created_at),
      confirmed: str(row.confirmed_on),
    }))
    .filter((l) => l.said !== '');
  const rules: RuleFact[] = (c.rules?.rows ?? []).map((row) => ({ said: str(row.lesson) ?? '', here: row.scope === 'project' })).filter((r) => r.said !== '');
  const others: OtherRun[] = c.live.same_repo
    .filter((r) => r.spoken !== run && r.state === 'active' && !r.stale)
    .map((r) => ({
      spoken: r.spoken,
      agent: r.agent,
      doing: r.doing,
      branch: str((r as { branch?: unknown }).branch),
      worktree: str((r as { worktree?: unknown }).worktree),
      /* THE RECORD'S `also_here` NAMES THE RUNS IN THIS VERY TREE, which today's context knows and the branch does not say. */
      same_tree: c.also_here?.runs.some((a) => a.name.includes(`(${r.spoken})`)) === true,
    }));
  /* TODAY'S DECISIONS ARE LINES ("Decided 2 Oct: …") with no instant: they are said as they came. */
  const decided: Lately[] = (c.decided ?? []).map((line) => ({ said: line, at: new Date(at.now).toISOString() }));
  return {
    stop: at.stop ?? null,
    told: at.told ?? [],
    who: cardParts(c, at, at.now),
    may: at.may ?? null,
    ...(at.reach ? { reach: at.reach } : {}),
    rules,
    brief: at.brief ?? null,
    others,
    lane,
    decided,
    learned,
    run,
    agent: at.agent ?? null,
    branch: at.branch ?? null,
    now: at.now,
    ...(at.task ? { task: at.task } : {}),
    ...(at.kpis && at.kpis.length > 0 ? { kpis: at.kpis } : {}),
    ...(at.since ? { since: at.since } : {}),
    ...(at.stamp ? { stamp: at.stamp } : {}),
    ...(at.recent ? { recent: at.recent } : {}),
    ...(at.today ? { today: at.today } : {}),
    ...(typeof c.ask === 'string' && c.ask !== '' ? { asks: true } : {}),
    ...(at.first !== undefined ? { first: at.first } : {}),
    ...(at.teach ? { teach: at.teach } : {}),
    ...(at.extra ? { extra: at.extra } : {}),
    ...(at.decider ? { owner: at.decider } : {}),
    calls: { ...(tasks?.rest ? { lane: tasks.rest } : {}), ...(learnings?.rest ? { learned: learnings.rest } : {}) },
    totals: {
      lane: tasks ? (tasks.here ?? tasks.rows.length) + (tasks.everywhere ?? tasks.inherited.length) : 0,
      learned: learnings ? (learnings.here ?? 0) + (learnings.everywhere ?? 0) : 0,
      rules: c.rules?.more ?? 0,
    },
  };
}
