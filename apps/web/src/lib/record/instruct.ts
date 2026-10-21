/**
 * The Agents page's control room, the host's half (agents and MCP plan §2, §4.4, §7.1): what the record says about the
 * runs open now (`presence`) and what he told agents (`instructionList`), worded for the three parts braindog-render
 * draws (`Instruct`, `Presence`, `Instructions`), and the writes behind each press (`instruct`, `withdrawInstruction`,
 * and Undo all over the receipts).
 *
 * EVERY WORD A PERSON READS IS MADE HERE, ONCE. The renderer draws strings; a run's handle (`S883`) and a project's
 * (`things#1`) are keys handed back to a press and never a word on the screen: a run is its agent and its project
 * ("Claude on Kiln"), a project its name.
 *
 * SAID HONESTLY, PATH BY PATH (§2.3, §2.4). What happens next is said for the run it will reach: Claude Code with our
 * hooks sees an instruction within about 15 seconds, at its next prompt or tool call, and is stopped at its next tool
 * call; an agent without them (`reach: next_call`) sees it and is stopped only at its next BrainDog call, and keeps
 * editing until then. The record says which (`presence.reach`), so this file never guesses from the agent's name.
 *
 * PURE BUT FOR `control` (the client calls) and `undoAll`, so node reads every sentence in `instruct.test.ts`.
 */

import { createClient } from '@braindog/client';
import type { InstructChoice, InstructView, PresenceView, ThreadReceipts, ThreadStep, ThreadView } from 'braindog-render/svelte';

import { AGENT_NAMES } from './names.ts';
import { REGISTERS } from './held.ts';
import { slotOf } from '../ui/face.ts';
import { undoChange } from './undo-write.ts';
import type { Fetch } from './boot-live.ts';

/* ── what the record answers ────────────────────────────────────────────── */

/** One run open now, as `presence` answers it (`PresenceRow` in `packages/record/src/methods/agents.ts`). */
export type LiveRun = {
  run: string;
  name: string | null;
  agent: string | null;
  machine: string | null;
  project: string | null;
  repo: string | null;
  worktree: string | null;
  branch: string | null;
  doing: string | null;
  state: 'working' | 'thinking' | 'waiting' | 'ended' | 'gone';
  instruction: string | null;
  task: string | null;
  stopped: 'stop' | 'pause' | null;
  helpers: string[];
  parent: string | null;
  for_s: number;
  heard_s: number;
  reach: 'hooks' | 'next_call';
};

export type SeenHow = 'start' | 'prompt' | 'tool' | 'channel' | 'job' | 'asked';
export type InstrState = 'sent' | 'seen' | 'working' | 'done' | 'needs_you' | 'declined' | 'expired' | 'withdrawn';

/** What a run changed while it held an instruction (`Receipts` in `methods/instructions.ts`). */
export type Receipts = {
  run: string;
  batches: { batch: string; at: string; changes: number; rows: string[]; names: string[] }[];
  changes: number;
  head_before: string | null;
  head_after: string | null;
};

/** One thread of `instructionList`. */
export type Thread = {
  id: string;
  said: string;
  kind: 'tell' | 'stop' | 'pause' | 'resume' | 'redirect';
  when: 'now' | 'next';
  to: 'run' | 'agent' | 'anyone' | 'task';
  to_run: string | null;
  to_agent: string | null;
  project: string | null;
  task: string | null;
  state: InstrState;
  seen_by: string | null;
  seen_how: SeenHow | null;
  seen_at: string | null;
  taken_by: string | null;
  taken_at: string | null;
  reply: string | null;
  replied_at: string | null;
  expires_at: string | null;
  at: string;
  updated_at: string;
  seen: { run: string; how: SeenHow; at: string }[];
  receipts: Receipts | null;
};

/** A run the page knows by handle: its agent kind, project and branch, read from presence or its own row. */
export type RunKnown = { agent: string | null; project: string | null; branch: string | null };

/** A project as the composer offers it: its handle as runs hold it (`things#1`), its name and its stored hue. */
export type Project = { key: string; name: string; hue: number | null };

/* ── the words ──────────────────────────────────────────────────────────── */

/** The kinds of agent "To" offers, in the order a person meets them. */
export const AGENT_KINDS = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'windsurf'] as const;

/** How long a "next start" instruction waits, the kernel's `WAIT_MS`, said in days. */
export const WAIT_DAYS = 14;

export const controlWords = {
  anyone: 'Whoever’s next',
  anywhere: 'Any project',
  aRun: 'An agent',
  aTask: 'A task',
  now: 'now',
  next: 'next start',
  empty: 'Say what the agent should do.',
  stopSaid: 'Stop where you are.',
  pauseSaid: 'Hold here until I resume you.',
  resumeSaid: 'Carry on.',
  kind: { stop: 'Stop', pause: 'Pause', resume: 'Resume', redirect: 'Redirect', tell: '' } as const,
  how: {
    start: 'when it started',
    prompt: 'on its next prompt',
    tool: 'in a BrainDog answer',
    channel: 'straight away, by channel',
    job: 'when its job started',
    asked: 'when it asked',
  } as Record<SeenHow, string>,
} as const;

/** An agent kind by its name ("Claude"), or `null` for none. */
export const agentNamed = (kind: string | null | undefined): string | null => (kind ? (AGENT_NAMES[kind] ?? null) : null);

const plural = (n: number, one: string, many = `${one}s`): string => `${String(n)} ${n === 1 ? one : many}`;

/** A stretch of time in words: "under a minute", "9 min", "3 h 20 min", "2 days". */
export function spanSaid(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${String(min)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 === 0 ? `${String(h)} h` : `${String(h)} h ${String(min % 60)} min`;
  return plural(Math.floor(h / 24), 'day');
}

/** When something was last heard, from seconds ago: "just now", "3 min ago", "2 h ago". */
export function agoSaid(seconds: number): string {
  if (seconds < 60) return 'just now';
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${String(min)} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${String(h)} h ago` : `${plural(Math.floor(h / 24), 'day')} ago`;
}

/** A moment as a person reads it: "21:02" today, "3 Sep, 21:02" another day, in the record's zone. */
export function clockSaid(iso: string | null, now: number, zone?: string): string {
  if (iso === null) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const opts = zone ? { timeZone: zone } : {};
  const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { ...opts, year: 'numeric', month: 'numeric', day: 'numeric' }).format(ms);
  const time = new Intl.DateTimeFormat('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  if (day(at) === day(now)) return time;
  return `${new Intl.DateTimeFormat('en-GB', { ...opts, day: 'numeric', month: 'short' }).format(at)}, ${time}`;
}

/** A project's name by its handle, or the handle's own words when the page has not read it. */
const projectName = (key: string | null, projects: ReadonlyMap<string, Project>): string | null =>
  key === null ? null : (projects.get(key)?.name ?? null);

/** A run by name: its agent, and where it works when that tells two apart ("Claude on Kiln"). */
export function runSaid(handle: string | null, runs: ReadonlyMap<string, RunKnown>, projects: ReadonlyMap<string, Project>, where = false): string {
  const known = handle === null ? undefined : runs.get(handle);
  const who = agentNamed(known?.agent) ?? controlWords.aRun;
  const on = where ? projectName(known?.project ?? null, projects) : null;
  return on ? `${who} on ${on}` : who;
}

/* ── the composer ───────────────────────────────────────────────────────── */

/** What he chose in the composer: who it goes to (`anyone`, `agent:<kind>`, `run:<handle>`), on what, and when. */
export type Chosen = { to: string; on: string; when: 'now' | 'next' | null };

export const PICK_FIRST: Chosen = { to: 'anyone', on: '', when: null };

/** The lead runs open now, a helper folded under the run it works for, as "To" and the run rows list them. */
export const leadsOf = (rows: readonly LiveRun[]): LiveRun[] => rows.filter((r) => r.parent === null && r.state !== 'ended' && r.state !== 'gone');

const reachSoon = (r: LiveRun): string => (r.reach === 'hooks' ? 'within about 15 seconds, at its next prompt or tool call' : 'at its next BrainDog call, and not before');

/** A live run's label in "To": its agent and project, and its branch when another run of the same agent is there too. */
function runChoice(r: LiveRun, all: readonly LiveRun[], projects: ReadonlyMap<string, Project>): InstructChoice {
  const who = agentNamed(r.agent) ?? controlWords.aRun;
  const on = projectName(r.project, projects);
  const twin = all.some((o) => o !== r && o.agent === r.agent && o.project === r.project);
  const tail = twin ? (r.branch ?? r.doing ?? null) : null;
  return { key: `run:${r.run}`, label: `${who}${on ? ` on ${on}` : ''}${tail ? `, ${tail}` : ''} (working now)` };
}

/**
 * The composer as it stands for `pick`: its choices, the one each is at, and what happens once it is sent, said from
 * the runs open now. "Now" is offered only while a run it would reach is live (§2.1), and is then the first choice.
 *
 * ON ONE PROJECT'S PAGE (`project`, plan §7.2: "Tell agents on Kiln") "On" is that project and nothing else, and "To"
 * offers only the runs working there, so nothing typed on Kiln's page goes to a run on another project.
 */
export function composerOf(pick: Chosen, rows: readonly LiveRun[], projects: ReadonlyMap<string, Project>, project?: string | null): Omit<InstructView, 'busy' | 'fault'> {
  const scoped = project ?? null;
  const leads = leadsOf(rows).filter((r) => scoped === null || r.project === scoped);
  const to: InstructChoice[] = [
    { key: 'anyone', label: controlWords.anyone },
    ...AGENT_KINDS.map((k) => ({ key: `agent:${k}`, label: AGENT_NAMES[k] ?? k })),
    ...leads.map((r) => runChoice(r, leads, projects)),
  ];
  const toKey = to.some((c) => c.key === pick.to) ? pick.to : 'anyone';
  const named = scoped === null ? undefined : projects.get(scoped);
  const on: InstructChoice[] =
    scoped === null
      ? [{ key: '', label: controlWords.anywhere }, ...[...projects.values()].map((p) => ({ key: p.key, label: p.name }))]
      : [{ key: scoped, label: named?.name ?? controlWords.anywhere }];

  if (toKey.startsWith('run:')) {
    const r = leads.find((x) => `run:${x.run}` === toKey)!;
    const who = runSaid(r.run, new Map([[r.run, r]]), projects, true);
    const held = r.stopped === 'stop' ? ' It is stopped, so it can only reply and end.' : r.stopped === 'pause' ? ' It is paused; it reads this, and works once you resume it.' : '';
    return {
      to,
      toKey,
      on: r.project && !on.some((c) => c.key === r.project) ? [...on, { key: r.project, label: projectName(r.project, projects) ?? controlWords.anywhere }] : on,
      onKey: r.project ?? '',
      onFixed: true,
      when: ['now'],
      whenKey: 'now',
      next: `${who} sees this ${reachSoon(r)}.${held}`,
      agent: r.agent,
    };
  }

  const kind = toKey.startsWith('agent:') ? toKey.slice('agent:'.length) : null;
  const onKey = scoped ?? (on.some((c) => c.key === pick.on) ? pick.on : '');
  const place = projectName(onKey || null, projects);
  const live = leads.filter((r) => r.stopped === null && (kind === null || r.agent === kind) && (onKey === '' || r.project === onKey));
  const when: ('now' | 'next')[] = live.length > 0 ? ['now', 'next'] : ['next'];
  const whenKey = pick.when !== null && when.includes(pick.when) ? pick.when : when[0]!;
  const kindName = agentNamed(kind);
  const there = place ? `on ${place}` : 'anywhere';
  let next: string;
  if (whenKey === 'now' && live.length === 1) {
    const r = live[0]!;
    next = `Goes to ${runSaid(r.run, new Map([[r.run, r]]), projects, true)}, working now: it sees this ${reachSoon(r)}. If it ends first, the next ${kindName ?? 'agent'} ${there} gets it.`;
  } else if (whenKey === 'now') {
    next = `Goes to the ${plural(live.length, `${kindName ?? 'agent'} run`)} working ${there} now. The first to take it does it, and the others are told it is taken.`;
  } else {
    next = `The next ${kindName ? `${kindName} run` : 'agent'} ${there} gets this when it starts or next checks in. It waits up to ${String(WAIT_DAYS)} days.`;
  }
  return { to, toKey, on, onKey, onFixed: scoped !== null, when, whenKey, next, agent: kind };
}

/** The runs a panel scoped to one run or one project draws: that run, or the lead runs on that project, else all. */
export const scopedLeads = (rows: readonly LiveRun[], scope: { run?: string | null; project?: string | null } = {}): LiveRun[] =>
  leadsOf(rows).filter((r) => (scope.run == null || r.run === scope.run) && (scope.project == null || r.project === scope.project));

/** What he told agents on one project, or about one run: the threads such a panel lists. */
export const scopedThreads = (threads: readonly Thread[], scope: { run?: string | null; project?: string | null } = {}): Thread[] =>
  threads.filter(
    (t) =>
      (scope.project == null || t.project === scope.project) &&
      (scope.run == null || t.to_run === scope.run || t.taken_by === scope.run || t.seen_by === scope.run || (t.seen ?? []).some((s) => s.run === scope.run)),
  );

/** What `instruct` is sent for the composer as it stood and the words he typed. */
export function instructArgs(view: Pick<InstructView, 'toKey' | 'onKey' | 'whenKey'>, said: string): Record<string, string> {
  const args: Record<string, string> = { said: said.trim() };
  if (view.toKey.startsWith('run:')) return { ...args, to: 'run', to_run: view.toKey.slice('run:'.length), when: 'now' };
  if (view.toKey.startsWith('agent:')) Object.assign(args, { to: 'agent', to_agent: view.toKey.slice('agent:'.length) });
  else args.to = 'anyone';
  if (view.onKey !== '') args.project = view.onKey;
  args.when = view.whenKey;
  return args;
}

/* ── the runs open now ──────────────────────────────────────────────────── */

/** One run row, worded: who, what it said, where, how long, what it holds from him, and what can stop it. */
export function presenceOf(r: LiveRun, rows: readonly LiveRun[], projects: ReadonlyMap<string, Project>, threads: readonly Thread[] = []): PresenceView {
  const name = agentNamed(r.agent) ?? (r.name?.trim() || controlWords.aRun);
  const project = r.project === null ? null : (projects.get(r.project) ?? null);
  const helpers = rows.filter((h) => h.parent === r.run);
  const branches = [...new Set(helpers.map((h) => h.branch).filter((b): b is string => b !== null && b !== r.branch))];
  const held = r.instruction === null ? null : (threads.find((t) => t.id === r.instruction) ?? null);
  const on = project ? ` on ${project.name}` : '';
  const doing = r.doing?.trim() || null;
  const hooks = r.reach === 'hooks';
  return {
    key: r.run,
    agent: r.agent,
    name,
    doing: doing === name ? null : doing,
    project: project ? { name: project.name, slot: slotOf(project.hue) } : null,
    meta: [r.branch, `running ${spanSaid(r.for_s * 1000)}`, `heard ${agoSaid(r.heard_s)}`].filter((x): x is string => !!x).join(' · '),
    live: r.state === 'working' || r.state === 'thinking' ? r.state : 'waiting',
    holds: held ? `On your word: “${held.said.replace(/\s+/gu, ' ').trim()}”` : null,
    helpers:
      helpers.length === 0
        ? null
        : `+${plural(helpers.length, 'helper')}${branches.length > 0 ? `, on ${branches.slice(0, 3).join(', ')}${branches.length > 3 ? ` and ${String(branches.length - 3)} more` : ''}` : ''}`,
    stopped: r.stopped,
    reach: hooks
      ? `Pause and Stop reach ${name} at its next tool call, through its hooks.`
      : `${name} has no hooks here, so it keeps working until its next BrainDog call. Pause and Stop reach it there.`,
    confirm: {
      stop: hooks
        ? `Stop ${name}${on}? Its next tool call is refused, and it is asked to reply and end.`
        : `Stop ${name}${on}? It keeps editing until its next BrainDog call; there it is refused and asked to reply and end.`,
      pause: hooks
        ? `Pause ${name}${on}? Its tools are held from its next call until you resume it.`
        : `Pause ${name}${on}? It is held at its next BrainDog call, until you resume it.`,
    },
    href: /^S[1-9][0-9]*$/u.test(r.run) ? `/r/session/${r.run.slice(1)}` : null,
    busy: false,
  };
}

/* ── what he told agents ────────────────────────────────────────────────── */

const STEPS: Record<InstrState, readonly ThreadStep[]> = {
  sent: ['done', 'ahead', 'ahead', 'ahead'],
  seen: ['done', 'done', 'ahead', 'ahead'],
  working: ['done', 'done', 'at', 'ahead'],
  done: ['done', 'done', 'done', 'done'],
  needs_you: ['done', 'done', 'done', 'done'],
  declined: ['done', 'done', 'done', 'done'],
  expired: ['done', 'ahead', 'ahead', 'ahead'],
  withdrawn: ['done', 'ahead', 'ahead', 'ahead'],
};

const OPEN: readonly InstrState[] = ['sent', 'seen', 'working'];

/** What was put back by Undo all, by instruction, and what each press is busy with. */
export type ThreadMarks = { undone?: ReadonlyMap<string, string>; busy?: ReadonlySet<string> };

/**
 * One thread, worded: who it went to and when, how far it got, the trail of who saw it and how, the reply, and what
 * the run changed with the way back.
 */
export function threadOf(
  t: Thread,
  ctx: { now: number; zone?: string; runs: ReadonlyMap<string, RunKnown>; projects: ReadonlyMap<string, Project> } & ThreadMarks,
): ThreadView {
  const { now, zone, runs, projects } = ctx;
  const hm = (iso: string | null) => clockSaid(iso, now, zone);
  const holder = t.taken_by ?? t.seen_by ?? t.to_run;
  const agent = (holder ? runs.get(holder)?.agent : null) ?? t.to_agent ?? null;
  const who =
    t.to === 'run' ? runSaid(t.to_run, runs, projects) : t.to === 'agent' ? (agentNamed(t.to_agent) ?? controlWords.aRun) : t.to === 'task' ? controlWords.aTask : controlWords.anyone;
  const kindWord = controlWords.kind[t.kind];
  const to = [kindWord || null, who, projectName(t.project, projects), t.kind === 'tell' || t.kind === 'redirect' ? controlWords[t.when] : null].filter((x): x is string => !!x).join(' · ');

  const trail: string[] = [`Sent ${hm(t.at)}`];
  const seenRuns = [...new Map((t.seen ?? []).map((s) => [s.run, s])).values()];
  if (seenRuns.length > 0) {
    const first = seenRuns[0]!;
    const names = [...new Set(seenRuns.map((s) => runSaid(s.run, runs, projects)))];
    trail.push(`Seen by ${names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`} at ${hm(first.at)}, ${controlWords.how[first.how]}`);
  } else if (t.seen_by !== null && t.seen_how !== null) {
    trail.push(`Seen by ${runSaid(t.seen_by, runs, projects)} at ${hm(t.seen_at)}, ${controlWords.how[t.seen_how]}`);
  }
  if (t.taken_by !== null && t.taken_at !== null && !seenRuns.some((s) => s.run === t.taken_by && s.at === t.taken_at)) trail.push(`Taken by ${runSaid(t.taken_by, runs, projects)} at ${hm(t.taken_at)}`);
  if (t.state === 'withdrawn') trail.push(`Taken back ${hm(t.updated_at)}`);
  if (t.state === 'expired') trail.push(`No run took it in ${String(WAIT_DAYS)} days`);

  const word =
    t.state === 'working'
      ? `Working ${spanSaid(now - Date.parse(t.taken_at ?? t.updated_at))}`
      : t.state === 'needs_you'
        ? 'Needs you'
        : t.state === 'withdrawn'
          ? 'Taken back'
          : t.state.charAt(0).toUpperCase() + t.state.slice(1);
  const tone: ThreadView['tone'] = t.state === 'needs_you' ? 'needs' : t.state === 'done' ? 'done' : OPEN.includes(t.state) ? 'open' : 'ended';

  const reply = t.reply === null ? null : { by: `${runSaid(t.taken_by, runs, projects)}${t.replied_at ? ` at ${hm(t.replied_at)}` : ''}`, text: t.reply };

  let receipts: ThreadReceipts | null = null;
  const r = t.receipts;
  const moved = r !== null && r.head_after !== null && r.head_after !== r.head_before;
  if (r !== null && (r.changes > 0 || moved)) {
    const names = [...new Set(r.batches.flatMap((b) => b.names))];
    const branch = runs.get(r.run)?.branch ?? null;
    const undone = ctx.undone?.get(t.id) ?? null;
    receipts = {
      said: r.changes > 0 ? plural(r.changes, 'change') : 'No changes in BrainDog',
      names: names.slice(0, 4),
      more: names.length > 4 ? `and ${String(names.length - 4)} more` : null,
      undo: r.changes > 0 && undone === null,
      undone,
      commits: moved ? `New commits${branch ? ` on ${branch}` : ''}` : null,
    };
  }

  return {
    key: t.id,
    said: t.said,
    to,
    agent,
    steps: STEPS[t.state],
    word,
    tone,
    trail: trail.join(' · '),
    reply,
    receipts,
    takeBack: t.state === 'sent' || t.state === 'seen',
    sending: false,
    busy: ctx.busy?.has(t.id) ?? false,
  };
}

/** The threads in the order he acts on them: Needs you first, then what is open, then the rest, each newest first. */
export function threadOrder(threads: readonly Thread[]): Thread[] {
  const rank = (t: Thread): number => (t.state === 'needs_you' ? 0 : OPEN.includes(t.state) ? 1 : 2);
  return [...threads].sort((a, b) => rank(a) - rank(b) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** A thread drawn the moment Send is pressed, before the record answers: what he said, to whom, on its way. */
export function sendingOf(key: string, said: string, view: Omit<InstructView, 'busy' | 'fault'>): ThreadView {
  const label = (list: readonly InstructChoice[], k: string) => list.find((c) => c.key === k)?.label ?? '';
  const who = label(view.to, view.toKey).replace(/ \(working now\)$/u, '');
  const on = view.onKey === '' || view.toKey.startsWith('run:') ? null : label(view.on, view.onKey);
  return {
    key,
    said: said.trim(),
    to: [who, on, controlWords[view.whenKey]].filter((x): x is string => !!x).join(' · '),
    agent: view.agent,
    steps: ['at', 'ahead', 'ahead', 'ahead'],
    word: 'On its way',
    tone: 'open',
    trail: '',
    reply: null,
    receipts: null,
    takeBack: false,
    sending: true,
    busy: false,
  };
}

/** The runs the page knows by handle: every run open now, as presence answers it. */
export const runsOf = (rows: readonly LiveRun[]): Map<string, RunKnown> => new Map(rows.map((r) => [r.run, { agent: r.agent, project: r.project, branch: r.branch }]));

/** The run handles a thread names that the page does not know yet, to read their rows once. */
export const unknownRuns = (threads: readonly Thread[], known: ReadonlyMap<string, RunKnown>): string[] =>
  [...new Set(threads.flatMap((t) => [t.to_run, t.seen_by, t.taken_by, ...(t.seen ?? []).map((s) => s.run)]).filter((h): h is string => h !== null && /^S[1-9][0-9]*$/u.test(h) && !known.has(h)))];

/* ── the shared moment between the parts ────────────────────────────────── */

/**
 * WHAT ONE PART TELLS THE OTHER: a run row's Tell aims the composer at that run, and a stop, a pause or a send asks the
 * others to read again now rather than at the next poll. Two panels on one page, so a plain set of listeners.
 */
function channel<T>() {
  const heard = new Set<(v: T) => void>();
  return {
    say(v: T): void {
      for (const f of heard) f(v);
    },
    on(f: (v: T) => void): () => void {
      heard.add(f);
      return () => void heard.delete(f);
    },
  };
}

/** A run row's Tell: the run it is for, by handle. */
export const aim = channel<string>();
/** Something he told changed: read again. */
export const told = channel<void>();

/* ── the record ─────────────────────────────────────────────────────────── */

type Out<T> = { ok: true; value: T } | { ok: false; fix: string };

const outOf = <T>(answer: { ok: boolean; value?: unknown; refusal?: { fix?: string } }, fallback: string): Out<T> =>
  answer.ok ? { ok: true, value: answer.value as T } : { ok: false, fix: answer.refusal?.fix ?? fallback };

/** The control room's reads and writes, through the record's own doors. */
export function control(base: string, io?: Fetch) {
  const c = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    async presence(): Promise<Out<LiveRun[]>> {
      return outOf<LiveRun[]>(await c.presence(), 'The agents working now could not be read.');
    },
    /** What he told agents, newest first; `run` narrows to what went to, was seen by or was taken by one run. */
    async threads(limit = 50, run?: string, project?: string): Promise<Out<Thread[]>> {
      const out = outOf<{ rows: Thread[] }>(await c.instructionList({ limit, ...(run ? { run } : {}), ...(project ? { project } : {}) }), 'What you told agents could not be read.');
      return out.ok ? { ok: true, value: out.value.rows } : out;
    },
    async send(args: Record<string, string>): Promise<Out<Thread>> {
      return outOf<Thread>(await c.instruct(args as unknown as Parameters<typeof c.instruct>[0]), 'That could not be sent.');
    },
    async takeBack(id: string): Promise<Out<Thread>> {
      return outOf<Thread>(await c.withdrawInstruction({ id }), 'That could not be taken back.');
    },
    /** Stop, pause or resume one run now, with why in his words or the plain default. */
    async hold(run: string, kind: 'stop' | 'pause' | 'resume', why: string): Promise<Out<Thread>> {
      const said = why.trim() || (kind === 'stop' ? controlWords.stopSaid : kind === 'pause' ? controlWords.pauseSaid : controlWords.resumeSaid);
      return outOf<Thread>(await c.instruct({ said, kind, to: 'run', to_run: run }), 'That run could not be reached.');
    },
    /** The runs named by handle that are not open now, from their own rows: agent, project and branch. */
    async runs(handles: readonly string[]): Promise<Map<string, RunKnown>> {
      const out = new Map<string, RunKnown>();
      await Promise.all(
        handles.map(async (h) => {
          const seq = Number(h.slice(1));
          const got = await c.get('session', seq);
          const f = got.ok && typeof got.value === 'object' && got.value !== null ? ((got.value as { fields?: Record<string, unknown> }).fields ?? {}) : null;
          if (f === null) return;
          const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
          out.set(h, { agent: text(f.agent), project: text(f.project), branch: text(f.branch) });
        }),
      );
      return out;
    },
    /**
     * The projects "On" offers, by the handle runs hold them by (`<list>#1`): the list the runs name and every list the
     * tab has learnt declares `scopes`, never one named here, read whole, its title field said and its hue kept for the
     * dot.
     */
    async projects(rows: readonly LiveRun[]): Promise<Map<string, Project>> {
      const declared = Object.values(REGISTERS)
        .filter((d) => (d as { scopes?: unknown }).scopes !== undefined)
        .map((d) => d.id);
      const registers = [...new Set([...rows.map((r) => r.project?.split('#')[0] ?? null), ...declared].filter((x): x is string => !!x))];
      const out = new Map<string, Project>();
      for (const register of registers) {
        const got = await c.list({ register, limit: 100 });
        if (!got.ok) continue;
        const listed = (got.value as { rows?: { seq: number | null; fields: Record<string, unknown>; state?: string | null }[] }).rows ?? [];
        for (const row of listed) {
          if (row.seq === null || row.fields.draft === true) continue;
          const titled = REGISTERS[register]?.title;
          const name = [titled ? row.fields[titled] : undefined, row.fields.name, row.fields.title].find((v): v is string => typeof v === 'string' && v.trim() !== '');
          if (!name) continue;
          out.set(`${register}#${String(row.seq)}`, { key: `${register}#${String(row.seq)}`, name, hue: typeof row.fields.hue === 'number' ? row.fields.hue : null });
        }
      }
      return new Map([...out.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)));
    },
  };
}

/**
 * UNDO ALL: put back what the run changed while it held the instruction, batch by batch, newest first, and say what it
 * came to in one sentence. A batch somebody changed since is left alone and counted, as Undo does everywhere.
 */
export async function undoAll(base: string, receipts: Receipts, io?: Fetch): Promise<string> {
  let put = 0;
  let skipped = 0;
  let fix: string | null = null;
  for (const b of receipts.batches) {
    const out = await undoChange(base, b.batch, io);
    if (out.from === 'undone') {
      put += out.put;
      skipped += out.skipped.length;
    } else fix ??= out.fix;
  }
  if (put === 0 && fix !== null) return fix;
  const back = put === 0 ? 'There was nothing left to put back.' : `Put back ${plural(put, 'change')}.`;
  return skipped > 0 ? `${back} Left ${String(skipped)} that changed since.` : back;
}
