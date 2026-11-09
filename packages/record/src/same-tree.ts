/**
 * WHO ELSE IS IN THIS WORKING TREE, AND WHAT THE LAST SESSION HERE LEFT: the lines a starting session's card
 * reads, worked out from runs it is handed and never from the database, so a test reads them without one.
 *
 * "SAME REPO" WAS A FOLDER'S NAME ON ANY MACHINE, and the card printed one warning line for each other run. On the
 * owner's record a session saw six warning lines, four about sessions dead for hours. A working tree is one folder on
 * one machine, so two runs share one only when they name the same `host` and the same repository, and a session and
 * its helpers are one piece of work, not two that overwrite each other (`sameTree`).
 *
 * THE WARNING IS SAID ONCE, then who (`alsoHere`): the warning word for word, then the three most recently heard from by
 * name and what each says it is doing, then how many more. Only runs working by the kernel's one clock (`presenceOf`)
 * count, so a session gone quiet never warns anybody.
 *
 * A NEXT STEP IS TRUE OR ABSENT (`nextLines`). A session was told to start a batch ten hours old and 53 commits behind.
 * A step older than `STEP_DAYS` is not printed at all, rather than printed with a warning beside it; and the step's age
 * and the commits since are always said, so a reader can weigh it.
 */

import { agentOf, onMachine, presenceOf, type Json } from '@braindog/kernel';

/** The warning, said once on a card when another working run is in the same tree. */
export const TREE_WARNING = 'Two sessions in one working tree overwrite each other. Coordinate or stop.';

/** How many working runs "Also here" names before it counts the rest. */
export const ALSO_HERE_MOST = 3;

/** How many days a step left for the next session stays a step: past this it is absent, never shown stale. */
export const STEP_DAYS = 7;

/** A step this old or older carries "check before acting" even when the reader's own run left it. */
const CHECK_AFTER_S = 86_400;

/** How long the "Tried:" line may be, ellipsis included. */
export const TRIED_MOST = 90;

/**
 * How much of a step the Next line says, ellipsis included: what a step could hold before a handoff took 1,000
 * characters (`STEP_LINE` in `index.ts`), so a long step leaves the card as short as it was. The whole step is the
 * context's `handoff.next`, and the run's own row.
 */
export const STEP_SHOWN = 280;

/** How much of what a run says it is doing "Also here" quotes. */
const DOING_MOST = 60;

/**
 * A run as these lines read it: what `live()` answers, a row of the run list, or the caller's own hints. `fields` are
 * the run's fields as migration 28 names them (`host`, `repo`, `remote`, `parent`, `agent`, `client`, `doing`,
 * `last_seen`). `spoken` is its name out loud (`S42`), else `seq` makes it.
 */
export type TreeRun = {
  id?: string | undefined;
  seq?: number | null | undefined;
  spoken?: string | undefined;
  state?: string | null;
  fields: Record<string, Json>;
};

const PREFIX = 'S';

const textOf = (v: Json | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** A run's name out loud, `S42`, or `null` for a run that has none yet. */
const spokenOf = (run: TreeRun): string | null =>
  run.spoken ?? (typeof run.seq === 'number' ? `${PREFIX}${String(run.seq)}` : null);

/** Whether `child` names `run` as its parent: by its name out loud, as the record writes it, or by its id. */
const parentIs = (child: TreeRun, run: TreeRun): boolean => {
  const parent = textOf(child.fields.parent);
  return parent !== null && (parent === spokenOf(run) || parent === run.id);
};

/** Whether two runs are the same run, by id or by name out loud. */
const sameRun = (a: TreeRun, b: TreeRun): boolean =>
  (a.id !== undefined && a.id === b.id) || (spokenOf(a) !== null && spokenOf(a) === spokenOf(b));

/** Whether a run says which agent or which app it is: a kind other than `other`, or a client's name. */
const namesAgent = (run: TreeRun): boolean => {
  const agent = textOf(run.fields.agent);
  return (agent !== null && agent !== 'other') || textOf(run.fields.client) !== null;
};

/**
 * Whether two runs work in one tree: the same machine and the same repository, and neither works for the other nor do
 * both work for one session.
 *
 * THE REPOSITORY IS ITS FOLDER'S NAME AND ITS REMOTE. Both name it when both are known: two projects that are both
 * called `app` and pull from different remotes are two trees. Where only one side knows its folder's name, the remotes
 * decide alone. A run that names no machine is in no tree anybody can share: an import wrote it, or a client that says
 * nothing of where it is.
 *
 * A HELPER IS ITS SESSION'S HANDS. A subagent writes in its parent's tree on purpose, and two helpers of one session
 * are that session's own work, so neither is warned about the other. A run is not in a tree with itself either.
 */
export function sameTree(a: TreeRun, b: TreeRun): boolean {
  if (sameRun(a, b)) return false;
  /* A COMMAND SOMEBODY RAN AT A TERMINAL IS NOT A SESSION IN THE TREE (audit 31 Oct k, AK7). `braindog skills sync` or
     `keys put`, run by hand in a checkout, names its machine and repository and neither an agent nor an app, and a
     session started there next was told "Two sessions in one working tree overwrite each other. Coordinate or stop."
     about it. Every agent's session names one or the other: the hooks and `braindog mcp --agent` an agent, an MCP
     client its app. The caller is not held to it: a person at a terminal is still told who works where they are. */
  if (!namesAgent(b)) return false;
  const host = textOf(a.fields.host);
  if (host === null || host !== textOf(b.fields.host)) return false;
  const [repoA, repoB] = [textOf(a.fields.repo), textOf(b.fields.repo)];
  const [remoteA, remoteB] = [textOf(a.fields.remote), textOf(b.fields.remote)];
  if (remoteA !== null && remoteB !== null && remoteA !== remoteB) return false;
  const repo = repoA !== null && repoB !== null ? repoA === repoB : remoteA !== null && remoteA === remoteB;
  if (!repo) return false;
  if (parentIs(a, b) || parentIs(b, a)) return false;
  const parent = textOf(a.fields.parent);
  return parent === null || parent !== textOf(b.fields.parent);
}

/** What a person calls the agent behind a run, "Claude Code", from the kind and the app it says it is. */
const agentName = (run: TreeRun): string =>
  agentOf({ agent: textOf(run.fields.agent) ?? undefined, client: textOf(run.fields.client) ?? undefined }).name;

/** A run as a person reads it: its agent's name with its name out loud beside it as a handle, "Claude Code". */
export function runName(run: TreeRun): string {
  const spoken = spokenOf(run);
  return spoken === null ? agentName(run) : `${agentName(run)} (${spoken})`;
}

/** One line of words, at most `most` characters with the ellipsis, cut at a word where one is near. */
export function clipped(said: string, most: number): string {
  const one = said.replace(/\s+/gu, ' ').trim();
  if (one.length <= most) return one;
  const cut = one.slice(0, most - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > most * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/u, '')}…`;
}

/* ── also here ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Who else is working in the caller's tree: the warning, the newest few by name, and how many more. */
export type AlsoHere = {
  /** `TREE_WARNING`, once however many there are. */
  warning: string;
  /** The `ALSO_HERE_MOST` most recently heard from, by name, with what each says it is doing when it said. */
  runs: { name: string; doing: string | null }[];
  /** How many more are working here past those. */
  more: number;
  /** The two lines as the card prints them: the warning, then "Also here: ...". */
  lines: [string, string];
};

/** When a run was last heard from, in milliseconds, or nothing for a run never heard from. */
const heard = (run: TreeRun): number => {
  const seen = textOf(run.fields.last_seen);
  const ms = seen === null ? Number.NaN : Date.parse(seen);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};

/**
 * What a run says it is doing, or `null` when it has said nothing yet. The title a run is given before it speaks,
 * "Claude Code in BrainDog", "Claude Code on MacBook" or the older "Claude Code run" (`provisionalTitle`), says nothing its
 * name does not, so it is left out.
 */
const doingOf = (run: TreeRun): string | null => {
  const doing = textOf(run.fields.doing);
  if (doing === null) return null;
  const name = agentName(run);
  if (doing === `${name} run` || doing.startsWith(`${name} in `) || onMachine(doing, name)) return null;
  return clipped(doing, DOING_MOST).replace(/[.!]+$/u, '');
};

/**
 * Who else is working in `self`'s tree at `nowMs`, or `null` when nobody is.
 *
 * WORKING BY THE ONE CLOCK: a run counts only while `presenceOf` says `working`, so a session that went quiet, ended or
 * left a step warns nobody. The caller is never one of them, however it is handed in, and neither is its helper, its
 * parent, or another helper of its parent (`sameTree`). Newest heard from first; a tie goes to the later run.
 *
 * ONE SESSION WITH FOUR HELPERS IS ONE SESSION AT WORK, as the kernel's `workingRuns` counts them: a helper whose parent
 * is working is that parent's hands and is never named or counted here. A helper whose parent has gone quiet or ended
 * stands on its own, because something is still writing in the tree.
 */
export function alsoHere(runs: readonly TreeRun[], self: TreeRun, nowMs: number): AlsoHere | null {
  const working = runs.filter((run) => presenceOf(run, nowMs) === 'working');
  const hands = (run: TreeRun): boolean => working.some((p) => p !== run && parentIs(run, p));
  const here = working
    .filter((run) => sameTree(self, run) && !hands(run))
    .sort((a, b) => heard(b) - heard(a) || (b.seq ?? 0) - (a.seq ?? 0));
  if (here.length === 0) return null;
  const named = here.slice(0, ALSO_HERE_MOST).map((run) => ({ name: runName(run), doing: doingOf(run) }));
  const more = here.length - named.length;
  const who = named.map((r) => (r.doing === null ? r.name : `${r.name}, ${r.doing}`)).join('; ');
  return {
    warning: TREE_WARNING,
    runs: named,
    more,
    lines: [TREE_WARNING, `Also here: ${who}${more > 0 ? `, and ${String(more)} more` : ''}.`],
  };
}

/* ── the next step ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The step a run left here, as the record's open handoffs answer it: who left it, what it says, when, what was
 * tried, the commits made in this repository since, and who took it when somebody did.
 */
export type LeftStep = {
  /** The run that left it. */
  by: TreeRun;
  /** The step, in its writer's words. */
  step: string;
  /** When it was left: the run's `next_at`. */
  at: string;
  /** What its writer already tried. */
  tried?: readonly string[] | undefined;
  /** Commits made in this repository since it was left, when the record knows. */
  commits?: number | null | undefined;
  /** Whether the reader's own run left it. Another run's step always carries "check before acting". */
  mine?: boolean | undefined;
  /** The run that took it and when, once one did. */
  taken?: { by: TreeRun; at: string } | null | undefined;
};

/** The newest run that ended here when no step is open: who, when it ended, and the commit it ended at. */
export type LastHere = { by: TreeRun; at: string; head?: string | null | undefined };

/** Seconds from `at` to `nowMs`, never below nought, or `null` for an instant that cannot be read. */
const secondsSince = (at: string, nowMs: number): number | null => {
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? Math.max(0, Math.floor((nowMs - ms) / 1000)) : null;
};

/** An age as a person says it: "just now", "3 min ago", "2h ago", "4 days ago". */
export function agoOf(s: number): string {
  if (s < 60) return 'just now';
  if (s < 3600) return `${String(Math.floor(s / 60))} min ago`;
  if (s < 86_400) return `${String(Math.floor(s / 3600))}h ago`;
  const days = Math.floor(s / 86_400);
  return `${String(days)} ${days === 1 ? 'day' : 'days'} ago`;
}

/** A sentence as a line ends it: once, with a full stop unless it already ends in one. */
const sentence = (said: string): string => {
  const one = said.replace(/\s+/gu, ' ').trim();
  return /[.!?…]$/u.test(one) ? one : `${one}.`;
};

/**
 * The card's Next slot, one of four shapes, as lines with no label (the card puts "Next" before the first):
 *
 *   1. An open step: "<step> Left by Claude Code 2h ago, 3 commits since. Check before acting." and, when its
 *      writer tried things, a second line "Tried: ..." cut at `TRIED_MOST`. "Check before acting" when another run
 *      wrote it or it is a day old.
 *   2. A step somebody took: "Claude Code took this 3 min ago: <step>".
 *   3. No step: "Nothing was handed over. Last here: Claude Code, 2h ago, at 5a57ba2."
 *   4. Nothing at all, on a record where no run ended here before.
 *
 * A STEP PAST ITS WINDOW IS ABSENT, NEVER STALE: one left more than `STEP_DAYS` ago, or at an instant that cannot be
 * read, is not shown, and the slot says what the last session here was instead. PURE: `nowMs` is the record's clock.
 */
export function nextLines(open: LeftStep | null, last: LastHere | null, nowMs: number): string[] {
  const age = open === null ? null : secondsSince(open.at, nowMs);
  if (open !== null && age !== null && age <= STEP_DAYS * 86_400 && open.step.trim() !== '') {
    const step = sentence(clipped(open.step, STEP_SHOWN));
    if (open.taken) {
      const took = secondsSince(open.taken.at, nowMs);
      return [`${runName(open.taken.by)} took this${took === null ? '' : ` ${agoOf(took)}`}: ${step}`];
    }
    const commits = typeof open.commits === 'number' && open.commits > 0 ? `, ${String(open.commits)} ${open.commits === 1 ? 'commit' : 'commits'} since` : '';
    const check = open.mine !== true || age >= CHECK_AFTER_S ? ' Check before acting.' : '';
    const lines = [`${step} Left by ${runName(open.by)} ${agoOf(age)}${commits}.${check}`];
    const tried = (open.tried ?? []).map((t) => t.replace(/\s+/gu, ' ').trim().replace(/[.;]+$/u, '')).filter((t) => t !== '');
    if (tried.length > 0) lines.push(clipped(`Tried: ${tried.join('; ')}`, TRIED_MOST));
    return lines;
  }
  if (last === null) return [];
  const ended = secondsSince(last.at, nowMs);
  const head = textOf(last.head ?? undefined);
  return [`Nothing was handed over. Last here: ${runName(last.by)}${ended === null ? '' : `, ${agoOf(ended)}`}${head === null ? '' : `, at ${head}`}.`];
}
