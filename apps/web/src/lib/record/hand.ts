/**
 * Handing a row to a teammate or an agent in one press.
 *
 * A LIST SAYS WHO HOLDS ITS ROWS WITH `hand:` (`42 §4.4`): the link field a person is handed a row by, the text field
 * holding the name an agent signs with, and the state a row an agent takes moves to. Work declares it on `tasks`, and
 * nothing here names tasks: every list that declares the key gets the control.
 *
 * WHO CAN BE HANDED A ROW: you first, then the record's members by their People rows (the link field writes a People
 * row, so a member is offered through the row that stands for them), then the agents that have run on this record, by
 * the name each signs its runs with in the kernel's `session` list.
 *
 * A HAND IS ONE WRITE, AND PUTTING IT BACK IS ONE MORE: both fields and the state go in the same `update`, and the put
 * back is `inverseOf` that write, so the state's finished day comes back with it.
 *
 * PURE BUT FOR THE READS, and every read takes the base and an optional `fetch`, so `node --test` drives it.
 */

import { createClient } from '@braindog/client';
import { handOf, type Hand } from '@braindog/declare/hand';

import { copy } from '../copy.ts';
import { AGENT_NAMES, humanize } from './names.ts';
import { isLive, readJobs, readKinds, startJob, type JobKind, type JobRow } from './jobs.ts';
import type { RecordRow } from './remote.ts';
import type { Fetch } from './row-live.ts';
import type { Entry, Fields, RegisterDecl } from './schema.ts';
import { inverseOf } from './rows-write.ts';

export { handOf, type Hand };

/** One person or agent a row can be handed to, as the sheet draws them. */
export type Holder =
  | { kind: 'person'; key: string; name: string; you: boolean; seq: number }
  | { kind: 'agent'; key: string; name: string; agent: string };

/** A member of the record, as `members` answers for the owner or `boot`'s names say for anybody who may read People. */
export type Member = { person_id: string; name: string | null; email: string | null };

/** The list's `hand:`, read from the declaration a screen holds (`hand-of.ts`). */
export { handFor } from './hand-of.ts';

/* ── who ─────────────────────────────────────────────────────────────── */

const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const folded = (v: unknown): string => said(v).toLowerCase();

/** An agent's name as it signs, without the `agent:` a token is named with, in lower case: `claude`. */
export const agentKey = (v: unknown): string => folded(v).replace(/^agent:/u, '');

/** An agent's name as a person reads it: "Claude", and any other in words. */
export const agentName = (agent: string): string => (Object.hasOwn(AGENT_NAMES, agentKey(agent)) ? (AGENT_NAMES[agentKey(agent)] ?? agent) : humanize(agent));

/**
 * Everybody a row can be handed to, you first, then the members by name, then the agents by name.
 *
 * A MEMBER IS FOUND IN PEOPLE BY THEIR EMAIL WHEN IT IS KNOWN, else by their name, because the membership and the People
 * list are two records of one person and the email is the one thing both keep that a person cannot share. A member with
 * no People row is not offered: the link field can only write a row that is there. A People row folded into another by
 * a merge is not offered either, since the person it stood for is the other row now.
 */
export function holdersOf(input: {
  me: string;
  members: readonly Member[];
  people: readonly RecordRow[];
  /** The People list's title field, which holds the name. */
  title: string;
  runs: readonly RecordRow[];
}): Holder[] {
  const standing = input.people.filter((p) => typeof p.seq === 'number' && p.fields.merged_into == null);
  const rowOf = (m: Member): RecordRow | undefined =>
    (m.email ? standing.find((p) => folded(p.fields.email) === folded(m.email)) : undefined) ??
    (m.name ? standing.find((p) => folded(p.fields[input.title]) === folded(m.name)) : undefined);

  const people: Holder[] = [];
  const taken = new Set<number>();
  for (const m of input.members) {
    const row = rowOf(m);
    if (!row || row.seq === null || taken.has(row.seq)) continue;
    taken.add(row.seq);
    const you = m.person_id === input.me;
    people.push({ kind: 'person', key: `person:${row.seq}`, name: said(row.fields[input.title]) || said(m.name), you, seq: row.seq });
  }
  people.sort((a, b) => (a.kind === 'person' && a.you ? -1 : b.kind === 'person' && b.you ? 1 : a.name.localeCompare(b.name)));

  const agents = new Map<string, Holder>();
  for (const run of input.runs) {
    const agent = agentKey(run.fields.agent);
    if (agent && !agents.has(agent)) agents.set(agent, { kind: 'agent', key: `agent:${agent}`, name: agentName(agent), agent });
  }
  return [...people, ...[...agents.values()].sort((a, b) => a.name.localeCompare(b.name))];
}

/** Who holds the row now, by the key `holdersOf` gives them, so the sheet can mark them. */
export function heldBy(hand: Hand, row: Entry): { person: string | null; agent: string | null } {
  const person = hand.person ? row.fields[hand.person] : null;
  const agent = hand.agent ? agentKey(row.fields[hand.agent]) : '';
  return {
    person: typeof person === 'number' || (typeof person === 'string' && /^\d+$/u.test(person)) ? `person:${String(person)}` : null,
    agent: agent ? `agent:${agent}` : null,
  };
}

/* ── the write ───────────────────────────────────────────────────────── */

/**
 * The fields one hand writes, in the screen's spelling: a person as their People row's number, which the writer turns
 * into the row's id, and an agent as the name it signs with, with the row moved to `taken` when the list declares one.
 */
export function handPatch(hand: Hand, decl: Pick<RegisterDecl, 'state'>, holder: Holder): Fields | null {
  if (holder.kind === 'person') return hand.person ? { [hand.person]: holder.seq } : null;
  if (!hand.agent) return null;
  return { [hand.agent]: holder.agent, ...(hand.taken && decl.state ? { [decl.state]: hand.taken } : {}) };
}

/** What puts a hand back as one change: every field the hand wrote, and the finished day when it moved the state. */
export const putBackPatch = (before: Entry, patch: Fields, decl: Pick<RegisterDecl, 'state' | 'finished'>): Fields => inverseOf(before, patch, decl);

/* ── the reads ───────────────────────────────────────────────────────── */

const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/** The runs an agent has made on this record, newest first: one page is plenty to know who they are. */
const RUNS_READ = 200;
/** And of each run only who ran it and where: a run's doing, its notes and its handoff were most of 200 runs' bytes. */
const RUN_FIELDS = ['agent', 'host', 'seat'];

/** Every row of a list this caller may read, or `null` when it may not. People is small; a page of 500 is its whole. */
async function rowsOf(base: string, register: string, io?: Fetch, limit = 500, fields?: string[]): Promise<RecordRow[] | null> {
  const got = await clientOf(base, io).list({ register, limit, ...(fields ? { fields } : {}) });
  return got.ok ? (got.value.rows as RecordRow[]) : null;
}

export type Offered = { from: 'live'; holders: Holder[] } | { from: 'refused'; fix: string };

/**
 * Everybody the sheet offers, read when it opens.
 *
 * THE OWNER IS ANSWERED `members` WITH EMAILS; anybody else who may read People has `boot`'s names, which is the same
 * people without them, and is matched by name. A caller who may read neither is offered the agents and nobody else.
 * THE SESSION LIST IS READ ONLY FOR ITS AGENTS' NAMES, and a caller who may not read it is offered the people.
 */
export async function readHolders(
  base: string,
  hand: Hand,
  me: string,
  names: Readonly<Record<string, string>>,
  people: { register: string; title: string },
  io?: Fetch,
): Promise<Offered> {
  const client = clientOf(base, io);
  const [asked, rows, runs] = await Promise.all([
    hand.person ? client.members().catch(() => null) : Promise.resolve(null),
    hand.person ? rowsOf(base, people.register, io).catch(() => null) : Promise.resolve([]),
    hand.agent ? rowsOf(base, 'session', io, RUNS_READ, RUN_FIELDS).catch(() => null) : Promise.resolve([]),
  ]);
  if (rows === null && runs === null) return { from: 'refused', fix: copy.handReadFailed };
  const listed: Member[] =
    asked?.ok && Array.isArray(asked.value)
      ? (asked.value as { person_id?: unknown; name?: unknown; email?: unknown; suspended_at?: unknown }[]).flatMap((m) =>
          typeof m.person_id === 'string' && m.suspended_at == null
            ? [{ person_id: m.person_id, name: typeof m.name === 'string' ? m.name : null, email: typeof m.email === 'string' ? m.email : null }]
            : [],
        )
      : Object.entries(names).map(([person_id, name]) => ({ person_id, name, email: null }));
  /* YOU ARE A MEMBER EVEN WHEN NOBODY SENT YOUR NAME, and the People row that stands for you is found by it or not at all. */
  const members = listed.some((m) => m.person_id === me) || !me ? listed : [...listed, { person_id: me, name: names[me] ?? null, email: null }];
  return { from: 'live', holders: holdersOf({ me, members, people: rows ?? [], title: people.title, runs: runs ?? [] }) };
}

/* ── the agent's run ─────────────────────────────────────────────────── */

/** The argument an approved job kind takes a row by: `job.<id>` with `args: [{ id: 'row' }]`. */
export const ROW_ARG = 'row';

/** The row as a job's `row` argument and a briefing say it: `tasks#12`. */
export const spokenOf = (register: string, seq: number): string => `${register}#${String(seq)}`;

/**
 * HOW RECENTLY A MACHINE MUST HAVE TAKEN A RUN FOR THIS RECORD TO CALL A RUNNER CONNECTED. The record keeps no heartbeat
 * a screen can read for a runner, only the runs it claimed; a run nobody claims is cancelled after a day (`createJob`),
 * so a runner that took one within the day is one a new run can expect to reach.
 */
const CONNECTED_MS = 24 * 60 * 60 * 1000;

/** A run as `runnerConnected` reads it: who took it, when, and on which machine (`ran_on`, since migration 44). */
type Taken = Pick<JobRow, 'runner' | 'claimed_at'> & { ran_on?: string | null };

/** Whether a runner took a run lately, from the newest page of runs; on `machine` alone when one is named. */
export const runnerConnected = (runs: readonly Taken[], now: number, machine?: string): boolean =>
  runs.some(
    (r) => r.runner !== null && r.claimed_at !== null && now - Date.parse(r.claimed_at) < CONNECTED_MS && (machine === undefined || r.ran_on === machine),
  );

/**
 * Where "Start one now" may start a run (migration 44): each machine a runner took a run on within the day, by the name
 * its runs give it, with the Claude Code profiles its recent runs were under. A runner that said no machine is in none.
 */
export type StartPlace = { machine: string; seats: string[] };

/** The places "Start one now" offers, from the newest page of jobs and of runs, newest machine first. */
export function startPlacesOf(jobs: readonly Taken[], runs: readonly RecordRow[], now: number): StartPlace[] {
  const machines = [
    ...new Set(
      [...jobs]
        .filter((r) => r.runner !== null && r.claimed_at !== null && now - Date.parse(r.claimed_at) < CONNECTED_MS)
        .sort((a, b) => (a.claimed_at! < b.claimed_at! ? 1 : a.claimed_at! > b.claimed_at! ? -1 : 0))
        .map((r) => said(r.ran_on))
        .filter((m) => m !== ''),
    ),
  ];
  return machines.map((machine) => ({
    machine,
    seats: [...new Set(runs.filter((r) => said(r.fields.host) === machine).map((r) => said(r.fields.seat)).filter((s) => s !== ''))],
  }));
}

/** The first approved kind that takes a row, by title, or `null` when none does. */
export const rowKindOf = (kinds: readonly JobKind[]): JobKind | null => kinds.find((k) => k.args.some((a) => a.id === ROW_ARG)) ?? null;

/** The live run started for this row, when there is one. */
export const liveRunOf = (runs: readonly JobRow[], spoken: string): JobRow | null =>
  runs.find((r) => isLive(r.status) && r.args[ROW_ARG] === spoken) ?? null;

/**
 * A RUNNER ON YOUR MACHINE RUNS CLAUDE CODE (`apps/cli` `runner run`), so a job is started only for a row handed to
 * Claude. Any other agent takes the row in its next session, which the briefing tells it about first.
 */
export const RUNS_ON_A_RUNNER = 'claude';

/** The argument an approved job kind takes what he told it by: `args: [{ id: 'instruction' }]`, filled with `IN4`. */
export const INSTRUCTION_ARG = 'instruction';

/**
 * The kind "Start one now" starts (agents and MCP plan §2.3 path E): the first approved kind that takes an instruction,
 * else the first that takes a row, or `null` when none takes either.
 */
export const startKindOf = (kinds: readonly JobKind[]): JobKind | null => kinds.find((k) => k.args.some((a) => a.id === INSTRUCTION_ARG)) ?? rowKindOf(kinds);

/** What the job is started with: the instruction, and the row, each where the kind takes it. */
export function startArgs(kind: JobKind, instruction: string, spoken: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of kind.args) {
    if (a.id === INSTRUCTION_ARG) out[a.id] = instruction;
    else if (a.id === ROW_ARG) out[a.id] = spoken;
  }
  return out;
}

/**
 * WHETHER "START ONE NOW" IS OFFERED, and with which kind: only to Claude, only while a runner took a run within the
 * day (`runnerConnected`), and only where an approved kind takes the instruction or the row. Otherwise `null`, and the
 * sheet does not draw the press: the row waits for the agent's next session, which the briefing tells it about first.
 */
export async function startFor(base: string, now: number, io?: Fetch): Promise<JobKind | null> {
  return (await startWith(base, now, io))?.kind ?? null;
}

/**
 * The kind "Start one now" would start, as `startFor` reads it, and where it may start one: the machines a runner is on
 * and the profiles each one's runs were under (`startPlacesOf`), read only when there is a kind to start.
 */
export async function startWith(base: string, now: number, io?: Fetch): Promise<{ kind: JobKind; places: StartPlace[] } | null> {
  const runs = await readJobs(base, null, io).catch(() => null);
  if (!runs?.ok || !runnerConnected(runs.value.jobs, now)) return null;
  const kinds = await readKinds(base, runs.value.jobs, io).catch(() => null);
  const kind = kinds?.ok ? startKindOf(kinds.value) : null;
  if (kind === null) return null;
  const machines = runs.value.jobs.some((r) => typeof r.ran_on === 'string' && r.ran_on !== '');
  const sessions = machines ? await rowsOf(base, 'session', io, RUNS_READ, RUN_FIELDS).catch(() => null) : null;
  return { kind, places: startPlacesOf(runs.value.jobs, sessions ?? [], now) };
}

/** Whether a holder is one "Start one now" can start: an agent a runner runs. */
export const startsOnARunner = (holder: Holder): boolean => holder.kind === 'agent' && holder.agent === RUNS_ON_A_RUNNER;

/**
 * "WITH A NOTE": what he typed, as an instruction to the task for the agent it was handed to (`instruct` with
 * `to: task`), which the agent's next run on it is told first. Answers the instruction's name (`IN4`), or the record's
 * reason it was not made.
 */
export async function noteFor(base: string, register: string, seq: number, said: string, io?: Fetch): Promise<{ ok: true; id: string } | { ok: false; fix: string }> {
  /* NO `to_agent`: the row now names its agent in its lane, and the record reads the agent off the task (`instruct`). */
  const got = (await clientOf(base, io)
    .instruct({ said: said.trim(), to: 'task', task: spokenOf(register, seq), when: 'next' })
    .catch(() => null)) as { ok: boolean; value?: { id?: unknown }; refusal?: { fix?: string } } | null;
  if (got?.ok && typeof got.value?.id === 'string') return { ok: true, id: got.value.id };
  return { ok: false, fix: got?.refusal?.fix ?? copy.handNoteFailed };
}

/**
 * Start the run "Start one now" asks for: the kind, with the instruction and the row, on the machine and under the
 * profile he picked, each by name, or on any runner. Answers the run's id, or `null`.
 */
export async function startNow(
  base: string,
  kind: JobKind,
  instruction: string,
  register: string,
  seq: number,
  io?: Fetch,
  place: { machine?: string; seat?: string } = {},
): Promise<string | null> {
  const started = await startJob(base, kind.id, startArgs(kind, instruction, spokenOf(register, seq)), io, undefined, place).catch(() => null);
  return started?.ok ? started.value.id : null;
}

/** The live run working on this row, read once for the row page's line. */
export async function readRunFor(base: string, register: string, seq: number, io?: Fetch): Promise<JobRow | null> {
  const runs = await readJobs(base, null, io).catch(() => null);
  return runs?.ok ? liveRunOf(runs.value.jobs, spokenOf(register, seq)) : null;
}
