/**
 * `job`: the tenth kind of declaration, and the queue a machine the owner enrolled claims its runs from.
 *
 * A job is a run of Claude Code, or of Codex when its kind says `agent: codex`, on the owner's own machine, under the
 * owner's own subscription, started from the record and watched in it (`33 §11`, `46 §4.7`).
 *
 * A KIND IS APPROVED ONCE, AND A RUN NAMES ONE. What a run may do (its prompt, the tools it may use, the folder it works
 * in, how many turns it takes and how it asks) is a `job.<id>` declaration, installed through the ordinary `change`
 * proposal and accepted in Decide like any other change. A run is a row of `job` naming a kind and filling its
 * arguments, and nothing a run carries can widen what its kind allows. The fixed kinds the first design closed in the
 * table's CHECK are gone (migration 18): a kind is whatever the owner approved.
 *
 * THE RECORD NEVER RUNS ONE. It keeps the queue, and a runner claims from it: a device grant of reach `runner`,
 * enrolled from the machine with the code the owner approves in the app. A claim holds a job for `JOB_LEASE_MS`, renewed by every
 * event the runner posts and by every `readCancel`; a runner that stops answering loses the job, which goes back to the
 * queue once and is `interrupted` the second time. The runner fills the prompt's `%arg%` slots once (`fillPrompt`), runs
 * Claude Code with the kind's tools and permission mode, never with its permissions skipped, and posts what happened one
 * event at a time, in order.
 *
 * ONE MACHINE, ONE PROFILE, WHEN HE SAYS SO (migration 44). A job may name the machine it runs on, as runs name it
 * (`host`), and the Claude Code profile it runs under, by name (`studio`), in `job_place` beside it. A runner claims
 * saying the machine it is on and the profiles it can start Claude Code under, and takes only a job it can run that
 * way; a job that names neither goes to any runner, as before. The profile reaches the runner as a name, which it turns
 * into a folder of its own: the record never holds a path. The machine a runner took each job on is kept with it
 * (`ran_on`), so the app can say a runner on that machine is on.
 *
 * NO EVENT IS WRITTEN BY THE RECORD WHILE A RUNNER HOLDS A JOB. A runner numbers its events and each must be the next
 * (`postJobEvent`), so a line the record wrote in between would refuse the runner's next one. The record writes a note
 * when it hands a job over and when it takes one back, and at no other time; a stop asked while a runner holds the job
 * is a flag the runner reads, never a line.
 *
 * EVERY FUNCTION HERE TAKES `TokenDeps`, because a claim mints the job's bearer and every end revokes it through
 * `token.ts`, and the same seam carries the storage, the clock, the ids and the digest the rest needs. The kernel's
 * methods are `api/jobs.ts`, which builds it and wraps each write in the record's transaction.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant, isCurrencyCode, looksLikeCredential } from './coerce.ts';
import { MACHINE_NAME, SEAT_NAME } from './instruction.ts';
import { APPROVER_STANDING, createToken, endedByCutOff, revokeToken, type TokenDeps } from './token.ts';

/** How long a claim holds a job with no word from its runner. Every event and every `readCancel` renews it. */
export const JOB_LEASE_MS = 60_000;

/** How long a job waits for a machine before it is cancelled, with a note in its transcript saying so. */
export const JOB_WAITS_MS = 24 * 3_600_000;

/**
 * How long one run may take once a machine has claimed it, and so how long its bearer lasts.
 *
 * ONE DAY, BECAUSE THAT IS THE SHORTEST TOKEN `createToken` MINTS, and the bearer is minted in the same instant the run's
 * deadline is set from, so the two end together. A run still going at the end of it is `interrupted` by the sweep.
 */
export const JOB_RUNS_MS = 86_400_000;

/** What a runner is told to wait before asking again when nothing is queued (`33 §11`). */
export const JOB_IDLE_MS = 1_500;

/**
 * Where the job's bearer is used: the record's MCP door, as a path.
 *
 * A PATH AND NOT AN ADDRESS, because the record does not know the address it is served at and the runner does: it
 * resolves this against the host it enrolled with, and both hosts serve MCP at this path for every record, the bearer
 * saying which.
 */
export const JOB_MCP_PATH = '/mcp';

/** The most turns a kind may give one run. */
export const JOB_TURNS_MOST = 40;
/** The most arguments a kind may take. Each is one line a person types in, so a long form is a different design. */
export const JOB_ARGS_MOST = 8;
/** The most characters one argument may hold, whatever its kind declares. */
export const JOB_ARG_CHARS_MOST = 64;
/** The most characters in an argument's label, the words beside the one line a person types it into. */
export const JOB_ARG_LABEL_CHARS_MOST = 40;
/** The most tools a kind may name. Each is a line the owner reads in Decide before approving it. */
export const JOB_TOOLS_MOST = 24;
/** The most characters in a kind's title. */
export const JOB_TITLE_CHARS_MOST = 120;
/** The most characters in a kind's prompt: a page of instructions, which the owner reads whole in Decide. */
export const JOB_PROMPT_CHARS_MOST = 8_000;
/** The most characters in one `Bash(<pattern>)`. */
export const JOB_COMMAND_CHARS_MOST = 200;
/** The most bytes one event's body may hold, as JSON. The runner distils the stream; it never posts it raw. */
export const JOB_EVENT_BYTES_MOST = 16 * 1024;
/** The most events one run may post before its end: a run of `JOB_TURNS_MOST` turns with a few tools each is well inside it. */
export const JOB_EVENTS_MOST = 2_000;
/** The most events one `jobEvents` answer carries; the caller asks again from the last. */
export const JOB_EVENTS_PAGE = 500;
/** How many jobs one `listJobs` page carries unless it asks for fewer, and the most it may ask for. */
export const JOBS_PAGE = 50;
export const JOBS_PAGE_MOST = 200;
/** The most jobs that may wait for a machine at once. */
export const JOBS_WAITING_MOST = 20;
/** The most jobs a record may start in one day. Each is a model run on the owner's own subscription. */
export const JOBS_A_DAY = 100;
/** The most jobs one runner may hold at once. */
export const JOBS_HELD_MOST = 4;

/** The rows one sweep moves, per kind of move. The rest are moved by the next write or the next hour. */
const SWEEP_MOST = 200;
/** The queued rows one claim looks past for one whose kind is still installed. */
const PICK_WALK = 10;
/** The runner grants walked to find a machine by its id: a record enrols a handful. */
const RUNNERS_WALK = 200;
/** The most profiles one claim may say it can run under: a machine keeps a handful. */
const SEATS_MOST = 32;
/** How deep a posted body is walked for a credential, and where the walk stops keeping anything. */
const BODY_DEPTH_MOST = 8;
const ERROR_CHARS_MOST = 2_000;
const SESSION_CHARS_MOST = 200;
const ABOUT_CHARS_MOST = 80;
/** The most characters of a name the caller sent that a refusal says back, so a long one cannot fill the answer. */
const ECHO_CHARS_MOST = 80;
/**
 * The live bearers one job's revoke looks for.
 *
 * A JOB IS CLAIMED AT MOST TWICE, since the sweep takes it back once and stops it the second time, and each claim mints
 * one bearer and the sweep revokes it before the job goes back. So two is every bearer a job could have left live.
 */
const BEARERS_WALK = 2;

/** `job.status`, as migration 18's CHECK has it. */
export const JOB_STATUSES = ['queued', 'claimed', 'ok', 'needs_decision', 'refused', 'limit', 'error', 'interrupted', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** How a runner may end a job: every status but the two the queue itself holds one in. */
export const JOB_ENDS = ['ok', 'needs_decision', 'refused', 'limit', 'error', 'interrupted', 'cancelled'] as const;
export type JobEnd = (typeof JOB_ENDS)[number];

/** `job_event.kind`, as migration 1's CHECK has it. */
export const JOB_EVENT_KINDS = ['start', 'say', 'think', 'tool', 'out', 'limit', 'note', 'end', 'error'] as const;
export type JobEventKind = (typeof JOB_EVENT_KINDS)[number];

/**
 * How a run may ask for permission. `bypassPermissions` is not among them and never will be in this build: a run that
 * skips its permissions is a run nobody approved (owner item 13).
 */
export const JOB_PERMISSIONS = ['dontAsk', 'acceptEdits'] as const;
export type JobPermission = (typeof JOB_PERMISSIONS)[number];

/**
 * Which agent runs a kind: Claude Code, the first and the default, or Codex (`codex exec`). A kind that says none is
 * Claude Code's, as every kind installed before this was.
 */
export const JOB_AGENTS = ['claude', 'codex'] as const;
export type JobAgent = (typeof JOB_AGENTS)[number];

/** The file tools a kind may name as they are, beside the record's own tools and named commands. */
export const JOB_FILE_TOOLS = ['Read', 'Grep', 'Glob'] as const;

/** The prefix every one of the record's own MCP tools carries in Claude Code's tool list. */
export const JOB_MCP_PREFIX = 'mcp__braindog__';

/** One argument a kind takes: its id, which its prompt says as `%id%`, the words a person fills it in by, and how long. */
export type JobArg = { id: string; label: string; max: number };

/** A `job` declaration's body. Every key is one the runner or the record enforces; there is no other. */
export type JobBody = {
  job: string;
  title: string;
  prompt: string;
  args?: JobArg[];
  /** A name the machine maps to a folder of its own (`braindog runner repos add`). The record never sees a path. */
  repo?: string;
  tools: string[];
  turns: number;
  permission: JobPermission;
  /** True when a run changes files, which Decide says in red. */
  writes?: boolean;
  /** The pack that owns it, when no `pack` row does, read as a script's `pack:` is. */
  pack?: string;
  /** Which agent runs it: Claude Code when left out. */
  agent?: JobAgent;
};

const HEADER = ['job', 'title', 'prompt', 'args', 'repo', 'tools', 'turns', 'permission', 'writes', 'pack', 'agent'] as const;
const ARG_KEYS = ['id', 'label', 'max'] as const;

/** A kind's own id: the script and ingest grammar, lower case with a hyphen allowed. */
const NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
/** An argument's id, which is also the text between the two `%` of its slot. */
const ARG_ID = /^[a-z][a-z0-9_]{0,31}$/u;
/** One slot in a prompt. Kept as source and compiled at each use, because a global expression carries its position. */
const SLOT = '%([a-z][a-z0-9_]{0,31})%';
/** A repository's name as a machine maps it: letters, digits, `.`, `_` and `-`, which every folder name can carry. */
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
/**
 * A kind whose folder each run names: `repo` said as one of its own arguments' slots, `%repo%`. The run fills it with a
 * folder's name as the machine maps it, or `-` for none (an empty folder of its own); the machine still turns the name
 * into a folder only from its own map, so the record never sends a path.
 */
export const JOB_REPO_SLOT = /^%([a-z][a-z0-9_]{0,31})%$/u;
/** The value of a repo slot that names no folder: the run works in an empty one of its own. */
export const JOB_NO_REPO = '-';
/** One of the record's own tools. */
const MCP_TOOL = /^mcp__braindog__[a-z][a-z0-9_]{0,39}$/u;
/** One named command: `Bash(git log:*)`. */
const BASH = /^Bash\((.*)\)$/su;
/** A job's id, as `createJob` mints it. */
const JOB_ID = /^j_[0-9A-Z]{26}$/u;
/** A declaration id of this kind. */
const KIND_ID = /^job\.[a-z][a-z0-9_-]{0,31}$/u;

const bad = (fix: string, at: string, allowed?: readonly string[]): Refusal => ({
  code: 'DECLARATION_INVALID',
  fix,
  at,
  ...(allowed === undefined ? {} : { allowed }),
});

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Every slot a prompt says, in order, by the argument id inside it. */
const slotsOf = (prompt: string): string[] => [...prompt.matchAll(new RegExp(SLOT, 'gu'))].map((m) => m[1] ?? '');

/**
 * The prompt with each `%id%` replaced by that argument's value, once.
 *
 * ONE PASS, AND WHAT IT PUTS IN IS NEVER READ AGAIN. `replace` with a function does not scan the text it inserts, so a
 * value that itself says `%other%` stays those words and fills nothing. A slot naming no argument is left as written;
 * the lint refuses such a prompt at install, so on an approved kind there is none. The runner calls this, and only the
 * runner, since the kind's prompt as approved is what it pins.
 */
export function fillPrompt(prompt: string, args: Readonly<Record<string, string>>): string {
  return prompt.replace(new RegExp(SLOT, 'gu'), (slot: string, id: string) => (Object.hasOwn(args, id) ? (args[id] ?? slot) : slot));
}

/** What a named command runs, with the wildcards that end it taken off: `git log` for `Bash(git log:*)`. */
export const commandOf = (tool: string): string | null => {
  const inside = BASH.exec(tool)?.[1];
  return inside === undefined ? null : inside.replace(/[\s:*]+$/u, '');
};

/** Why one tool is not one a kind may name, or `null` when it is. */
function toolFault(id: string, tool: unknown, at: string): Refusal | null {
  if (typeof tool !== 'string') return bad(`${id}'s tool ${at} is text.`, at);
  if ((JOB_FILE_TOOLS as readonly string[]).includes(tool) || MCP_TOOL.test(tool)) return null;
  if (tool === 'Bash')
    return bad(`${id} names Bash on its own, which runs any command at all. Name the command it runs, like Bash(git log:*).`, at);
  const inside = BASH.exec(tool)?.[1];
  if (inside === undefined)
    return bad(
      `${id} names ${JSON.stringify(tool.slice(0, ECHO_CHARS_MOST))}. A job's tools are ${JOB_FILE_TOOLS.join(', ')}, BrainDog's own tools as ${JOB_MCP_PREFIX}<tool>, and named commands as Bash(<command>).`,
      at,
    );
  if (inside.length > JOB_COMMAND_CHARS_MOST) return bad(`${id}'s command ${at} is at most ${JOB_COMMAND_CHARS_MOST} characters.`, at);
  if (/[\p{Cc}]/u.test(inside)) return bad(`${id}'s command ${at} is one line.`, at);
  /* A PATTERN THAT NAMES NO COMMAND RUNS EVERY COMMAND, which is `Bash` on its own written longer. So what is left once
     the wildcards at its end are taken off must start with a command's own name. */
  const command = commandOf(tool) ?? '';
  if (command === '' || !/^[A-Za-z0-9_./]/u.test(command))
    return bad(`${id}'s ${JSON.stringify(tool.slice(0, ECHO_CHARS_MOST))} names no command, so it would run any. Name the command, like Bash(git log:*).`, at);
  return null;
}

/**
 * A `job` declaration's body, checked before it is stored.
 *
 * A KEY NOTHING READS IS REFUSED, as `scriptBody` refuses one, and for its reason. Everything in a kind is a promise
 * about what the runner will do, and a key that installed and was enforced by nobody would be read in Decide as a
 * promise kept.
 *
 * `permission` NEVER TAKES `bypassPermissions`, and says so in its own sentence rather than in a list of what it does
 * take, because the list alone reads as though the word were misspelt.
 */
export function jobBody(decl: { id: string; body: Record<string, unknown> }): Refusal | null {
  const id = decl.id;
  const body = decl.body;

  const stray = Object.keys(body).find((k) => !(HEADER as readonly string[]).includes(k));
  if (stray !== undefined)
    return bad(`${id} says ${stray}, and a job kind says ${HEADER.join(', ')}. Nothing else is read, so nothing else would be kept to.`, stray, HEADER);

  if (typeof body.job !== 'string' || !NAME.test(body.job))
    return bad(`${id}'s name is lower case letters, digits, - and _, starting with a letter, at most 32.`, 'job');
  if (typeof body.title !== 'string' || body.title.trim() === '' || body.title.length > JOB_TITLE_CHARS_MOST)
    return bad(`${id}'s title is what Decide and the list of jobs call it, at most ${JOB_TITLE_CHARS_MOST} characters.`, 'title');
  if (typeof body.prompt !== 'string' || body.prompt.trim() === '')
    return bad(`${id}'s prompt is what the run is asked to do, and it says nothing.`, 'prompt');
  if (body.prompt.length > JOB_PROMPT_CHARS_MOST) return bad(`${id}'s prompt is at most ${JOB_PROMPT_CHARS_MOST} characters.`, 'prompt');
  if (looksLikeCredential(body.prompt))
    return bad(`${id}'s prompt holds what looks like a key. A prompt is shown in Decide and sent to a machine; a key belongs in the keychain.`, 'prompt');

  /* THE ARGUMENTS, and every slot the prompt says against them. A slot naming no argument would reach the run as its
     own words; an argument no slot names would be asked of a person and sent nowhere. */
  if (body.args !== undefined && (!Array.isArray(body.args) || body.args.length > JOB_ARGS_MOST))
    return bad(`${id}'s args is a list of at most ${JOB_ARGS_MOST}, each { id, label, max }.`, 'args');
  const args: unknown[] = Array.isArray(body.args) ? body.args : [];
  const ids: string[] = [];
  for (const [i, arg] of args.entries()) {
    const at = `args[${i}]`;
    if (!isObject(arg) || Object.keys(arg).some((k) => !(ARG_KEYS as readonly string[]).includes(k)))
      return bad(`${id}'s argument ${i + 1} is { id, label, max } and nothing else.`, at, ARG_KEYS);
    if (typeof arg.id !== 'string' || !ARG_ID.test(arg.id))
      return bad(`${id}'s argument ${i + 1} has an id of lower case letters, digits and _, starting with a letter, which its prompt says as %id%.`, `${at}.id`);
    if (ids.includes(arg.id)) return bad(`${id} names the argument ${arg.id} twice.`, `${at}.id`);
    if (typeof arg.label !== 'string' || arg.label.trim() === '' || arg.label.length > JOB_ARG_LABEL_CHARS_MOST)
      return bad(`${id}'s argument ${arg.id} has a label, the words a person fills it in by, at most ${JOB_ARG_LABEL_CHARS_MOST} characters.`, `${at}.label`);
    if (typeof arg.max !== 'number' || !Number.isInteger(arg.max) || arg.max < 1 || arg.max > JOB_ARG_CHARS_MOST)
      return bad(`${id}'s argument ${arg.id} says how long it may be, a whole number from 1 to ${JOB_ARG_CHARS_MOST}.`, `${at}.max`);
    ids.push(arg.id);
  }
  const slots = slotsOf(body.prompt);
  const unfilled = slots.find((s) => !ids.includes(s));
  if (unfilled !== undefined)
    return bad(`${id}'s prompt says %${unfilled}%, and the kind takes no argument called ${unfilled}.`, 'prompt', ids);
  const unsaid = ids.find((a) => !slots.includes(a));
  if (unsaid !== undefined) return bad(`${id} takes ${unsaid}, and its prompt never says %${unsaid}%, so the value would go nowhere.`, 'args');

  const repoSlot = typeof body.repo === 'string' ? JOB_REPO_SLOT.exec(body.repo)?.[1] : undefined;
  if (repoSlot !== undefined && !ids.includes(repoSlot))
    return bad(`${id}'s repo says %${repoSlot}%, and the kind takes no argument called ${repoSlot}.`, 'repo', ids);
  if (body.repo !== undefined && repoSlot === undefined && (typeof body.repo !== 'string' || !REPO.test(body.repo)))
    return bad(
      `${id}'s repo is the name a machine gives one of its folders, letters, digits, ., _ and -, at most 64, or one of its arguments as %repo%. Leave it out to run in an empty folder.`,
      'repo',
    );

  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > JOB_TOOLS_MOST)
    return bad(`${id} names the tools a run may use, between 1 and ${JOB_TOOLS_MOST}.`, 'tools');
  for (const [i, tool] of tools.entries()) {
    const fault = toolFault(id, tool, `tools[${i}]`);
    if (fault) return fault;
    if (tools.indexOf(tool) !== i) return bad(`${id} names ${String(tool)} twice.`, `tools[${i}]`);
  }

  if (typeof body.turns !== 'number' || !Number.isInteger(body.turns) || body.turns < 1 || body.turns > JOB_TURNS_MOST)
    return bad(`${id}'s turns is how many turns one run may take, a whole number from 1 to ${JOB_TURNS_MOST}.`, 'turns');

  if (body.permission === 'bypassPermissions')
    return bad(`${id} would skip the run's permissions, and no job skips them in this build. Use dontAsk, which runs only the tools it names.`, 'permission', JOB_PERMISSIONS);
  if (!(JOB_PERMISSIONS as readonly unknown[]).includes(body.permission))
    return bad(`${id}'s permission is ${JOB_PERMISSIONS.join(' or ')}.`, 'permission', JOB_PERMISSIONS);

  if (body.writes !== undefined && typeof body.writes !== 'boolean') return bad(`${id}'s writes is true or false.`, 'writes');
  /* A RUN THAT CHANGES FILES WITHOUT ASKING SAYS SO, so the line Decide draws in red is never left out of the one kind
     that needs it most. */
  if (body.permission === 'acceptEdits' && body.writes !== true)
    return bad(`${id} changes files without asking, so it says writes: true, which Decide shows before anybody approves it.`, 'writes');

  if (body.pack !== undefined && typeof body.pack !== 'string') return bad(`${id}'s pack is the id of the pack that owns it.`, 'pack');

  if (body.agent !== undefined && !(JOB_AGENTS as readonly unknown[]).includes(body.agent))
    return bad(`${id}'s agent is ${JOB_AGENTS.join(' or ')}, the one that runs it. Leave it out for Claude Code.`, 'agent', JOB_AGENTS);
  /* CODEX CANNOT HOLD A RUN TO NAMED COMMANDS. It runs commands inside a sandbox, read-only for dontAsk and the folder
     alone for acceptEdits, with no list of which; a kind that named some would read in Decide as a promise nobody
     keeps. Its file reads go through that same sandbox, so Read, Grep and Glob, and the record's own tools, are what it
     names. */
  if (body.agent === 'codex') {
    const named = tools.findIndex((t) => typeof t === 'string' && BASH.test(t));
    if (named >= 0)
      return bad(
        `${id} runs on Codex, which cannot hold a run to named commands: it runs any command its sandbox allows, read-only for dontAsk. Name Read, Grep, Glob and BrainDog's own tools, or leave agent out for Claude Code.`,
        `tools[${named}]`,
      );
  }
  return null;
}

/* ── the queue ─────────────────────────────────────────────────────────────── */

/** A runner, as the record's principal names it: the id `runnerGrant` gave it and the name its owner approved it under. */
export type JobRunner = { id: string; name: string };

/** A runner's bearer, checked: who the machine is. */
export type RunnerGrant = JobRunner;

/**
 * What `createJob` takes. `machine` is the machine it must run on, as runs name it, and `seat` the Claude Code profile
 * it must run under, by name; each absent for any.
 */
export type CreateJobArgs = { kind?: unknown; args?: unknown; about?: unknown; machine?: unknown; seat?: unknown };

/**
 * Where a runner claiming is: the machine, as runs name it (`os.hostname()`), and the Claude Code profiles it can start
 * a run under, by name. A runner that says neither takes only a job that names neither.
 */
export type RunnerPlace = { host?: unknown; seats?: unknown; repos?: unknown };

/**
 * A runner as it last claimed: its name, the machine it said it is on, the profiles it can run Claude Code under and
 * the folders it maps, by name and never by path, and when (`heard`). What the app offers to send a request to.
 */
export type RunnerHeard = { id: string; name: string; host: string | null; seats: string[]; repos: string[]; heard: string };

/** The pseudo-person the runners' last claims are kept under in `pref`, one key per runner: never a person's id. */
const HEARD_HOLDER = 'runner:heard';
/** The most folder names one claim may say it maps. */
const REPOS_MOST = 64;
/** How long the same place a runner said is not written again. */
const HEARD_AGAIN_MS = 30_000;

/** One job as the list shows it. `lost` is worked out, never stored: a claim whose lease has run out. */
export type JobRow = {
  id: string;
  kind: string;
  /** The kind's title and repository as installed now, or `null` for a kind since retired. */
  title: string | null;
  repo: string | null;
  args: Record<string, string>;
  about: string | null;
  status: JobStatus;
  lost: boolean;
  cancel: boolean;
  /** The name of the machine that claimed it, or `null` while nobody has. */
  runner: string | null;
  /** The machine it must run on, and the profile it must run under, as he started it; `null` for any (migration 44). */
  machine: string | null;
  seat: string | null;
  /** The machine its runner took it on, as runs name it, or `null` while none has or a runner said none. */
  ran_on: string | null;
  seq: number;
  created_at: string;
  claimed_at: string | null;
  lease_until: string | null;
  expires: string;
  result: unknown;
  error: string | null;
  claude_session: string | null;
  /**
   * What the run cost, in minor units of `cost_currency`, as its runner reported it. The two are both set or both
   * `null`: a cost is kept only with the currency it was reported in, since the record chooses none for it.
   */
  cost_minor: number | null;
  cost_currency: string | null;
  turns: number | null;
  ms: number | null;
};

export type JobsPage = { jobs: JobRow[]; cursor: string | null };

/** One line of a job's transcript. */
export type JobEvent = { seq: number; kind: JobEventKind; body: unknown; ts: string };

export type JobEvents = { events: JobEvent[]; status: JobStatus; seq: number; lost: boolean; cancel: boolean };

/** A job as its runner is handed it: the kind's own prompt, with its slots unfilled, and the values to fill them with. */
export type ClaimedJob = {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  tools: string[];
  turns: number;
  permission: JobPermission;
  repo: string | null;
  args: Record<string, string>;
  /** The profile to start Claude Code under, by name, which the runner turns into a folder of its own; `null` for its own. */
  seat: string | null;
  seq: number;
  /** Which agent runs it. A runner older than this field runs every job with Claude Code, so a Codex kind says so. */
  agent: JobAgent;
};

export type Claimed = { job: ClaimedJob; lease_until: string; bearer: string; mcp: { url: string } } | { job: null; idle_ms: number };

export type Posted = { seq: number; cancel: boolean; lease_until: string | null };

export type CancelRead = { cancel: boolean; lease_until: string | null };

export type Cancelled = { id: string; status: JobStatus; cancel: boolean };

type Stored = {
  id: string;
  kind: string;
  args: string;
  status: JobStatus;
  runner_id: string | null;
  claimed_at: string | null;
  lease_until: string | null;
  seq: number;
  cancel: number;
  created_at: string;
  expires: string;
  claude_session: string | null;
  result: string | null;
  error: string | null;
  cost_minor: number | null;
  cost_currency: string | null;
  turns: number | null;
  ms: number | null;
  about: string | null;
};

const COLUMNS =
  'id, kind, args, status, runner_id, claimed_at, lease_until, seq, cancel, created_at, expires, claude_session, result, error, cost_minor, cost_currency, turns, ms, about';

/* THE RECORD'S OWN LINES IN A TRANSCRIPT, one sentence each, never naming an id. */
const WAITED = 'No machine took this in a day, so it was cancelled. Start it again when a runner is on.';
const LOST_ONCE = 'The machine running this stopped answering, so it is waiting for a machine again.';
const LOST_TWICE = 'The machine running this stopped answering a second time, so it was stopped.';
const RAN_OUT = 'This ran for a day without ending, so it was stopped.';
const KIND_GONE = 'Its kind of job was retired before a machine took it, so it was cancelled.';
const STOPPED_WAITING = 'Stopped before a machine took it.';
const STOPPED_LOST = 'Stopped while no machine was running it.';
const UNKEYED = 'The machine could not be given a key for this run, so it is waiting again.';

/** Every refusal about a job that is not the caller's to act on, in one sentence, so asking learns nothing. */
const NOT_YOURS = 'This machine is not running that job. Claim a job before reporting on it.';

/** The label of a job's bearer in the token list, which is how its end finds it again. */
const bearerLabel = (job: string): string => `job:${job}`;

/**
 * A runner's id, from its grant: `r_` and the start of a digest nobody can turn back into the grant.
 *
 * NOT THE DEVICE'S HANDLE. The handle is what Settings names a device by to revoke it (`device.ts`), and this is what the
 * queue holds a claim against; a separate digest keeps the two from being read as one, and the queue from reaching into
 * how `device.ts` makes its handles.
 */
const runnerIdOf = async (deps: TokenDeps, grant: string): Promise<string> => `r_${(await deps.digest(`runner:${grant}`)).slice(0, 16)}`;

const parsed = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/** The arguments a row holds, as the object it was stored as, or none. */
const argsOf = (text: string): Record<string, string> => {
  const v = parsed(text);
  if (!isObject(v)) return {};
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
};

/** The live declaration of one kind, or `null` when it is retired or never was. */
function kindOf(deps: TokenDeps, kind: string): JobBody | null {
  if (!KIND_ID.test(kind)) return null;
  const row = deps.sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'job' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
    kind,
  );
  const body = row === undefined ? null : parsed(row.body);
  return isObject(body) ? (body as unknown as JobBody) : null;
}

/** One line the record writes into a job's transcript, numbered after the last. Answers the new number. */
function noteOn(deps: TokenDeps, job: string, seq: number, body: Record<string, unknown>): number {
  const next = seq + 1;
  deps.sql.exec(
    "INSERT INTO job_event (job_id, seq, kind, body, ts) VALUES (?, ?, 'note', ?, ?)",
    job,
    next,
    JSON.stringify(body),
    instant(deps.nowMs),
  );
  deps.sql.exec('UPDATE job SET seq = ? WHERE id = ?', next, job);
  return next;
}

/** Revokes the bearer a claim minted for one job, if one is still live. */
function revokeBearer(deps: TokenDeps, job: string, by: string): void {
  for (const t of deps.sql.all<{ id: string }>('SELECT id FROM token WHERE label = ? AND revoked_at IS NULL LIMIT ?', bearerLabel(job), BEARERS_WALK))
    revokeToken(deps, by, t.id);
}

/**
 * Whether the record has already taken this job back once from a machine that stopped answering.
 *
 * READ FROM THE TRANSCRIPT, WHICH ALREADY SAYS SO, rather than from a column kept beside it. A runner could post a note of
 * its own saying `lost`, and the only job that would change is its own, which would then stop on its next loss rather
 * than wait again.
 */
const lostBefore = (deps: TokenDeps, job: string): boolean =>
  deps.sql.one("SELECT 1 AS hit FROM job_event WHERE job_id = ? AND kind = 'note' AND json_extract(body, '$.lost') = 1 LIMIT 1", job) !== undefined;

/**
 * Let go what nobody is running: a job waiting past its day is cancelled, and a job whose runner stopped answering goes
 * back to the queue once and is stopped the second time, or at once when it has run past its own day. Answers how many
 * rows it moved.
 *
 * RUN FIRST BY EVERY WRITE HERE, AND BY THE HOURLY SWEEP, so a record whose machines are all off still lets go of what
 * waited too long. Each move writes one note, which is the notice a person reads in the job's transcript.
 */
export function sweepJobs(deps: TokenDeps): number {
  const now = instant(deps.nowMs);
  let moved = 0;
  const waited = deps.sql.all<{ id: string; seq: number }>(
    "SELECT id, seq FROM job WHERE status = 'queued' AND expires <= ? ORDER BY created_at LIMIT ?",
    now,
    SWEEP_MOST,
  );
  for (const j of waited) {
    deps.sql.exec("UPDATE job SET status = 'cancelled' WHERE id = ? AND status = 'queued'", j.id);
    noteOn(deps, j.id, j.seq, { text: WAITED, status: 'cancelled' });
    moved++;
  }

  const held = deps.sql.all<{ id: string; seq: number; expires: string; cancel: number }>(
    "SELECT id, seq, expires, cancel FROM job WHERE status = 'claimed' AND (lease_until IS NULL OR lease_until < ? OR expires <= ?) ORDER BY created_at LIMIT ?",
    now,
    now,
    SWEEP_MOST,
  );
  for (const j of held) {
    revokeBearer(deps, j.id, 'system');
    if (j.cancel === 1) {
      deps.sql.exec("UPDATE job SET status = 'cancelled', lease_until = NULL WHERE id = ?", j.id);
      noteOn(deps, j.id, j.seq, { text: STOPPED_LOST, lost: true, status: 'cancelled' });
    } else if (j.expires > now && !lostBefore(deps, j.id)) {
      deps.sql.exec(
        "UPDATE job SET status = 'queued', runner_id = NULL, claimed_at = NULL, lease_until = NULL, expires = ? WHERE id = ?",
        instant(deps.nowMs + JOB_WAITS_MS),
        j.id,
      );
      noteOn(deps, j.id, j.seq, { text: LOST_ONCE, lost: true });
    } else {
      deps.sql.exec("UPDATE job SET status = 'interrupted', lease_until = NULL WHERE id = ?", j.id);
      noteOn(deps, j.id, j.seq, { text: j.expires > now ? LOST_TWICE : RAN_OUT, lost: true, status: 'interrupted' });
    }
    moved++;
  }
  return moved;
}

/** A job's place as a caller said it, checked: the machine and the profile, each a name or nothing. */
function placeFor(args: CreateJobArgs): Result<{ machine: string | null; seat: string | null }> {
  const out = { machine: null as string | null, seat: null as string | null };
  for (const [key, grammar, fix] of [
    ['machine', MACHINE_NAME, 'Name the machine as its runs name it, like Adas-MacBook-Pro.local.'],
    ['seat', SEAT_NAME, 'Name the profile as its runs name it, like studio or default: a name, never a folder.'],
  ] as const) {
    const v = args[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
    if (typeof v !== 'string' || !grammar.test(v.trim())) return no('VALUE_MALFORMED', fix, { at: key });
    out[key] = v.trim();
  }
  return ok(out);
}

/** A claim's place as the runner said it: its machine, or `null`, and the profiles it can run, each a name. */
function placeOf(place: RunnerPlace | undefined): { host: string | null; seats: string[]; repos: string[] } {
  const hostSaid = place?.host;
  const host = typeof hostSaid === 'string' && MACHINE_NAME.test(hostSaid.trim()) ? hostSaid.trim() : null;
  const seatsSaid = place?.seats;
  const said: unknown[] = Array.isArray(seatsSaid) ? seatsSaid : [];
  const seats = [...new Set(said.filter((v): v is string => typeof v === 'string' && SEAT_NAME.test(v.trim())).map((v) => v.trim()))].slice(0, SEATS_MOST);
  const reposSaid: unknown[] = Array.isArray(place?.repos) ? place.repos : [];
  const repos = [...new Set(reposSaid.filter((v): v is string => typeof v === 'string' && REPO.test(v.trim())).map((v) => v.trim()))].slice(0, REPOS_MOST);
  return { host, seats, repos };
}

/** Keeps where a runner said it is as it claims, one row of `pref` per runner, so the app can offer it. */
function keepHeard(deps: TokenDeps, runner: JobRunner, where: { host: string | null; seats: string[]; repos: string[] }): void {
  const value = JSON.stringify({ name: runner.name, host: where.host, seats: where.seats, repos: where.repos });
  /* A HELD CLAIM ASKS EVERY FEW SECONDS: the same words heard within half a minute are not written again. */
  const was = deps.sql.one<{ value: string; updated_at: string }>('SELECT value, updated_at FROM pref WHERE person_id = ? AND key = ?', HEARD_HOLDER, runner.id);
  if (was !== undefined && was.value === value && was.updated_at >= instant(deps.nowMs - HEARD_AGAIN_MS)) return;
  deps.sql.exec(
    'INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (person_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    HEARD_HOLDER,
    runner.id,
    value,
    instant(deps.nowMs),
  );
}

/**
 * The runners that claimed within `withinMs`, newest first, each as it last said where it is (`RunnerHeard`). Only a
 * runner whose grant is still active is named: one revoked in Settings is gone from the list at once.
 */
export async function runnersHeard(deps: TokenDeps, withinMs: number): Promise<RunnerHeard[]> {
  const since = instant(deps.nowMs - withinMs);
  const rows = deps.sql.all<{ key: string; value: string; updated_at: string }>(
    'SELECT key, value, updated_at FROM pref WHERE person_id = ? AND updated_at >= ? ORDER BY updated_at DESC LIMIT ?',
    HEARD_HOLDER,
    since,
    RUNNERS_WALK,
  );
  if (rows.length === 0) return [];
  const active = new Set<string>();
  for (const g of deps.sql.all<{ id: string }>("SELECT id FROM device_grant WHERE reach = 'runner' AND status = 'active' LIMIT ?", RUNNERS_WALK))
    active.add(await runnerIdOf(deps, g.id));
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return rows.flatMap((r) => {
    if (!active.has(r.key)) return [];
    const v = parsed(r.value);
    if (!isObject(v)) return [];
    return [
      {
        id: r.key,
        name: typeof v.name === 'string' ? v.name : 'A runner',
        host: typeof v.host === 'string' ? v.host : null,
        seats: strings(v.seats),
        repos: strings(v.repos),
        heard: r.updated_at,
      },
    ];
  });
}

/** The arguments one start fills in, checked against its kind. */
function argsFor(kind: string, body: JobBody, given: unknown): Result<Record<string, string>> {
  const declared = Array.isArray(body.args) ? body.args : [];
  if (given !== undefined && given !== null && !isObject(given))
    return no('VALUE_MALFORMED', `args is an object naming each thing ${kind} asks for.`, { at: 'args' });
  const said: Record<string, unknown> = isObject(given) ? given : {};
  const stray = Object.keys(said).find((k) => !declared.some((a) => a.id === k));
  if (stray !== undefined)
    return no('FIELD_UNKNOWN', `${kind} asks for nothing called ${stray.slice(0, ECHO_CHARS_MOST)}.`, { at: `args.${stray.slice(0, ECHO_CHARS_MOST)}`, allowed: declared.map((a) => a.id) });
  const out: Record<string, string> = {};
  for (const a of declared) {
    const v = Object.hasOwn(said, a.id) ? said[a.id] : undefined;
    if (typeof v !== 'string' || v.trim() === '') return no('REQUIRED_MISSING', `Fill in ${a.label}.`, { at: `args.${a.id}` });
    const value = v.trim();
    if (value.length > Math.min(a.max, JOB_ARG_CHARS_MOST))
      return no('OUT_OF_BOUNDS', `${a.label} is at most ${Math.min(a.max, JOB_ARG_CHARS_MOST)} characters.`, { at: `args.${a.id}` });
    if (/[\p{Cc}]/u.test(value)) return no('VALUE_MALFORMED', `${a.label} is one line.`, { at: `args.${a.id}` });
    if (looksLikeCredential(value))
      return no('VALUE_MALFORMED', `${a.label} looks like a key. A job's words are sent to a machine and a model; a key belongs in the keychain.`, { at: `args.${a.id}` });
    out[a.id] = value;
  }
  return ok(out);
}

/**
 * Start one job of an approved kind: a row waiting for a machine, and its id.
 *
 * `known` SAYS WHETHER `about` IS A ROW, asked of the record's own reader by the caller, so a job is never about a row
 * that is not there.
 */
export function createJob(deps: TokenDeps, args: CreateJobArgs, known: (spoken: string) => boolean): Result<{ id: string }> {
  const kind = typeof args?.kind === 'string' ? args.kind.trim() : '';
  if (kind === '') return no('REQUIRED_MISSING', 'Name the kind of job to run, like job.release-notes.', { at: 'kind' });
  const body = kindOf(deps, kind);
  if (!body)
    return no('DECLARATION_UNKNOWN', `${kind.slice(0, ECHO_CHARS_MOST)} is not a kind of job approved here. A kind is approved once, in Decide.`, { at: 'kind' });
  const filled = argsFor(kind, body, args.args);
  if (!filled.ok) return filled as Result<never>;
  /* A FOLDER EACH RUN NAMES is a name a machine maps, or `-` for none: never a path, whatever the argument allows. */
  const slot = typeof body.repo === 'string' ? JOB_REPO_SLOT.exec(body.repo)?.[1] : undefined;
  if (slot !== undefined) {
    const named = filled.value[slot] ?? '';
    if (named !== JOB_NO_REPO && !REPO.test(named))
      return no('VALUE_MALFORMED', `${slot} is a folder's name as the machine maps it, like braindog, or - for none.`, { at: `args.${slot}` });
  }
  const place = placeFor(args);
  if (!place.ok) return place as Result<never>;

  let about: string | null = null;
  if (args.about !== undefined && args.about !== null) {
    const said = typeof args.about === 'string' ? args.about.trim() : '';
    if (said === '' || said.length > ABOUT_CHARS_MOST || !known(said))
      return no('REF_UNKNOWN', 'about names the row this job is about, by its spoken id, and there is no such row.', { at: 'about' });
    about = said;
  }

  sweepJobs(deps);
  const waiting = deps.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM job WHERE status = 'queued'")?.n ?? 0;
  if (waiting >= JOBS_WAITING_MOST)
    return no('OUT_OF_BOUNDS', `${JOBS_WAITING_MOST} jobs are already waiting for a machine. Start this once one is taken, or stop one.`, { at: 'kind' });
  const today = deps.sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM job WHERE created_at > ?', instant(deps.nowMs - 86_400_000))?.n ?? 0;
  if (today >= JOBS_A_DAY)
    return no('OUT_OF_BOUNDS', `This BrainDog started ${JOBS_A_DAY} jobs in the last day, which is as many as one day takes. Start this tomorrow.`, { at: 'kind' });

  const id = `j_${deps.mint()}`;
  deps.sql.exec(
    "INSERT INTO job (id, kind, args, status, seq, cancel, created_at, expires, about) VALUES (?, ?, ?, 'queued', 0, 0, ?, ?, ?)",
    id,
    kind,
    JSON.stringify(filled.value),
    instant(deps.nowMs),
    instant(deps.nowMs + JOB_WAITS_MS),
    about,
  );
  if (place.value.machine !== null || place.value.seat !== null)
    deps.sql.exec('INSERT INTO job_place (job_id, machine, seat) VALUES (?, ?, ?)', id, place.value.machine, place.value.seat);
  return ok({ id });
}

/** A job's id, as a caller sent it, or `null` when it is not one. */
const jobIdOf = (value: unknown): string | null => (typeof value === 'string' && JOB_ID.test(value) ? value : null);

const NO_SUCH_JOB = (at: string) => no<never>('REF_UNKNOWN', 'There is no job by that name here.', { at });

/**
 * Stop one job. A job still waiting is cancelled at once; one a machine is running is flagged, and its runner reads the
 * flag on its next event or `readCancel` and ends it `cancelled`. A job that has ended is answered as it is.
 */
export function cancelJob(deps: TokenDeps, args: { id?: unknown }): Result<Cancelled> {
  const id = jobIdOf(args?.id);
  if (id === null) return NO_SUCH_JOB('id');
  sweepJobs(deps);
  const row = deps.sql.one<{ status: JobStatus; seq: number; cancel: number }>('SELECT status, seq, cancel FROM job WHERE id = ?', id);
  if (!row) return NO_SUCH_JOB('id');
  if (row.status === 'queued') {
    deps.sql.exec("UPDATE job SET status = 'cancelled', cancel = 1 WHERE id = ? AND status = 'queued'", id);
    noteOn(deps, id, row.seq, { text: STOPPED_WAITING, status: 'cancelled' });
    return ok({ id, status: 'cancelled', cancel: true });
  }
  if (row.status === 'claimed') {
    deps.sql.exec("UPDATE job SET cancel = 1 WHERE id = ? AND status = 'claimed'", id);
    return ok({ id, status: 'claimed', cancel: true });
  }
  return ok({ id, status: row.status, cancel: row.cancel === 1 });
}

/** The name each runner goes by, by its queue id, for the list. */
async function runnersNamed(deps: TokenDeps): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const rows = deps.sql.all<{ id: string; label: string | null }>(
    "SELECT id, label FROM device_grant WHERE reach = 'runner' AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT ?",
    RUNNERS_WALK,
  );
  for (const r of rows) out.set(await runnerIdOf(deps, r.id), r.label ?? 'A runner');
  return out;
}

/** Where a job runs, as `job_place` holds it. */
type Place = { machine: string | null; seat: string | null; ran_on: string | null };
const NOWHERE: Place = { machine: null, seat: null, ran_on: null };

/** The places of these jobs, by id: one read for a page. */
function placesOf(deps: TokenDeps, ids: readonly string[]): Map<string, Place> {
  if (ids.length === 0) return new Map();
  return new Map(
    deps.sql
      .all<Place & { job_id: string }>('SELECT job_id, machine, seat, ran_on FROM job_place WHERE job_id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
      .map((r) => [r.job_id, { machine: r.machine, seat: r.seat, ran_on: r.ran_on }]),
  );
}

/** The folder a job works in, by name: its kind's, or the one its run named when the kind takes it as an argument. */
function repoOf(repo: string | undefined, args: Record<string, string>): string | null {
  if (repo === undefined) return null;
  const slot = JOB_REPO_SLOT.exec(repo)?.[1];
  if (slot === undefined) return repo;
  const named = args[slot] ?? '';
  return named === '' || named === JOB_NO_REPO ? null : named;
}

/** A stored row as the list shows it. */
function shown(deps: TokenDeps, row: Stored, kinds: Map<string, JobBody | null>, names: Map<string, string>, place: Place = NOWHERE): JobRow {
  if (!kinds.has(row.kind)) kinds.set(row.kind, kindOf(deps, row.kind));
  const kind = kinds.get(row.kind) ?? null;
  const now = instant(deps.nowMs);
  return {
    id: row.id,
    kind: row.kind,
    title: kind?.title ?? null,
    repo: repoOf(kind?.repo, argsOf(row.args)),
    args: argsOf(row.args),
    about: row.about,
    status: row.status,
    lost: row.status === 'claimed' && (row.lease_until === null || row.lease_until < now),
    cancel: row.cancel === 1,
    runner: row.runner_id === null ? null : (names.get(row.runner_id) ?? 'A runner'),
    machine: place.machine,
    seat: place.seat,
    ran_on: place.ran_on,
    seq: row.seq,
    created_at: row.created_at,
    claimed_at: row.claimed_at,
    lease_until: row.lease_until,
    expires: row.expires,
    result: parsed(row.result),
    error: row.error,
    claude_session: row.claude_session,
    cost_minor: row.cost_minor,
    cost_currency: row.cost_currency,
    turns: row.turns,
    ms: row.ms,
  };
}

/** The jobs, newest first, in one state or all of them, a page at a time. The cursor is the last id of the page before. */
export async function listJobs(deps: TokenDeps, args: { status?: unknown; limit?: unknown; cursor?: unknown }): Promise<Result<JobsPage>> {
  const status = args?.status;
  if (status !== undefined && status !== null && !(JOB_STATUSES as readonly unknown[]).includes(status))
    return no('ENUM_VALUE_UNKNOWN', `A job is ${JOB_STATUSES.join(', ')}.`, { at: 'status', allowed: JOB_STATUSES });
  const limit = args?.limit ?? JOBS_PAGE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > JOBS_PAGE_MOST)
    return no('OUT_OF_BOUNDS', `A page of jobs is between 1 and ${JOBS_PAGE_MOST}.`, { at: 'limit' });
  const cursor = args?.cursor ?? null;
  if (cursor !== null && jobIdOf(cursor) === null) return no('VALUE_MALFORMED', 'That cursor is not one a page of jobs gave.', { at: 'cursor' });

  const which = typeof status === 'string' ? status : null;
  const after = typeof cursor === 'string' ? cursor : null;
  const rows = deps.sql.all<Stored>(
    `SELECT ${COLUMNS} FROM job WHERE (? IS NULL OR status = ?) AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`,
    which,
    which,
    after,
    after,
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const names = page.some((r) => r.runner_id !== null) ? await runnersNamed(deps) : new Map<string, string>();
  const kinds = new Map<string, JobBody | null>();
  const places = placesOf(deps, page.map((r) => r.id));
  return ok({
    jobs: page.map((r) => shown(deps, r, kinds, names, places.get(r.id))),
    cursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  });
}

/** What one job has done since a line the caller names, and where it stands now. */
export function jobEvents(deps: TokenDeps, args: { id?: unknown; after?: unknown }): Result<JobEvents> {
  const id = jobIdOf(args?.id);
  if (id === null) return NO_SUCH_JOB('id');
  const after = args?.after ?? 0;
  if (typeof after !== 'number' || !Number.isInteger(after) || after < 0)
    return no('VALUE_MALFORMED', 'after is the number of the last line you have, 0 for the first.', { at: 'after' });
  const row = deps.sql.one<{ status: JobStatus; seq: number; cancel: number; lease_until: string | null }>(
    'SELECT status, seq, cancel, lease_until FROM job WHERE id = ?',
    id,
  );
  if (!row) return NO_SUCH_JOB('id');
  const events = deps.sql
    .all<{ seq: number; kind: JobEventKind; body: string | null; ts: string }>(
      'SELECT seq, kind, body, ts FROM job_event WHERE job_id = ? AND seq > ? ORDER BY seq LIMIT ?',
      id,
      after,
      JOB_EVENTS_PAGE,
    )
    .map((e) => ({ seq: e.seq, kind: e.kind, body: parsed(e.body), ts: e.ts }));
  const now = instant(deps.nowMs);
  return ok({
    events,
    status: row.status,
    seq: row.seq,
    lost: row.status === 'claimed' && (row.lease_until === null || row.lease_until < now),
    cancel: row.cancel === 1,
  });
}

/**
 * A runner's bearer, checked: the machine it names, or one sentence for every way it is not one.
 *
 * AS `keychainGrant` CHECKS ITS OWN (`device.ts`): the record the bearer names, an active grant of reach `runner` holding its
 * hash, an approver still an owner of the record and not suspended (`APPROVER_STANDING`), a grant not past its time, and one approved after the
 * operator's cut-off. The use is written, so a machine that keeps asking is never swept as silent.
 */
export async function runnerGrant(deps: TokenDeps, bearer: string): Promise<Result<RunnerGrant>> {
  const cut = typeof bearer === 'string' ? bearer.indexOf('.') : -1;
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  const secret = cut < 0 ? '' : bearer.slice(cut + 1);
  const wrong = no<RunnerGrant>('FORBIDDEN', 'That bearer is not a known runner. Enrol the machine again.', { at: 'authorization' });
  if (!record || !secret || record !== deps.recordId()) return wrong;

  const row = deps.sql.one<{
    id: string;
    label: string | null;
    approved_by: string | null;
    approved_at: string | null;
    expires: string;
    suspended_at: string | null;
    still_owner: string | null;
  }>(
    `SELECT d.id AS id, d.label AS label, d.approved_by AS approved_by, d.approved_at AS approved_at, d.expires AS expires,
            p.suspended_at AS suspended_at, m.person_id AS still_owner
     FROM device_grant d ${APPROVER_STANDING}
     WHERE d.token_hash = ? AND d.reach = 'runner' AND d.status = 'active'`,
    await deps.digest(secret),
  );
  const now = instant(deps.nowMs);
  if (!row || !row.approved_by || !row.still_owner || row.suspended_at || row.expires <= now) return wrong;
  if (endedByCutOff(deps.validFrom, row.approved_at)) return wrong;

  deps.sql.exec('UPDATE device_grant SET last_used = ? WHERE id = ?', now, row.id);
  return ok({ id: await runnerIdOf(deps, row.id), name: row.label ?? 'A runner' });
}

/** The person whose approval a runner holds, found by the runner's id among the active grants, or `null`. */
async function approverOf(deps: TokenDeps, runner: string): Promise<string | null> {
  const rows = deps.sql.all<{ id: string; approved_by: string | null }>(
    "SELECT id, approved_by FROM device_grant WHERE reach = 'runner' AND status = 'active' LIMIT ?",
    RUNNERS_WALK,
  );
  for (const r of rows) if (r.approved_by !== null && (await runnerIdOf(deps, r.id)) === runner) return r.approved_by;
  return null;
}

/** A job a claim took, before its bearer is minted: enough to answer the runner, or to put it back. */
type Taken = { id: string; kind: string; body: JobBody; args: Record<string, string>; seat: string | null; seq: number; lease_until: string; expires: string };

/**
 * The oldest queued job whose kind is still installed and that this runner can run where it is, claimed for it, or
 * `null` when there is none. A job naming a machine goes only to a runner on it, and one naming a profile only to a
 * runner that can start Claude Code under it; the machine the runner took it on is kept beside it.
 */
function take(deps: TokenDeps, runner: JobRunner, where: { host: string | null; seats: string[] }): Taken | null {
  sweepJobs(deps);
  const holding = deps.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM job WHERE status = 'claimed' AND runner_id = ?", runner.id)?.n ?? 0;
  if (holding >= JOBS_HELD_MOST) return null;
  for (let i = 0; i < PICK_WALK; i++) {
    const next = deps.sql.one<{ id: string; kind: string; args: string; seq: number; expires: string; seat: string | null }>(
      `SELECT j.id AS id, j.kind AS kind, j.args AS args, j.seq AS seq, j.expires AS expires, p.seat AS seat
       FROM job j LEFT JOIN job_place p ON p.job_id = j.id
       WHERE j.status = 'queued'
         AND (p.machine IS NULL OR p.machine = ?)
         AND (p.seat IS NULL OR p.seat IN (SELECT value FROM json_each(?)))
       ORDER BY j.created_at, j.id LIMIT 1`,
      where.host,
      JSON.stringify(where.seats),
    );
    if (!next) return null;
    const body = kindOf(deps, next.kind);
    if (!body) {
      deps.sql.exec("UPDATE job SET status = 'cancelled' WHERE id = ? AND status = 'queued'", next.id);
      noteOn(deps, next.id, next.seq, { text: KIND_GONE, status: 'cancelled' });
      continue;
    }
    const lease = instant(deps.nowMs + JOB_LEASE_MS);
    deps.sql.exec(
      "UPDATE job SET status = 'claimed', runner_id = ?, claimed_at = ?, lease_until = ?, expires = ? WHERE id = ? AND status = 'queued'",
      runner.id,
      instant(deps.nowMs),
      lease,
      instant(deps.nowMs + JOB_RUNS_MS),
      next.id,
    );
    if (where.host !== null)
      deps.sql.exec(
        'INSERT INTO job_place (job_id, ran_on) VALUES (?, ?) ON CONFLICT (job_id) DO UPDATE SET ran_on = excluded.ran_on',
        next.id,
        where.host,
      );
    const seq = noteOn(deps, next.id, next.seq, { text: `Taken by ${runner.name}.`, runner: runner.name });
    return { id: next.id, kind: next.kind, body, args: argsOf(next.args), seat: next.seat, seq, lease_until: lease, expires: next.expires };
  }
  return null;
}

/**
 * A runner takes the oldest queued job: the job, the lease it holds it by, and the job's own bearer, or nothing and how
 * long to wait before asking again.
 *
 * THE CLAIM IS ONE TRANSACTION AND THE BEARER IS MINTED AFTER IT, because minting awaits a digest and nothing awaited may
 * sit inside a write. The row is `claimed` before the first await, so a second claim arriving meanwhile takes the next
 * job and never this one. A bearer that cannot be minted puts the job back, with a note saying why.
 *
 * THE JOB'S BEARER IS A TOKEN, scope `propose`, labelled `job:<id>`, minted for the person who approved this machine and
 * expiring when the run's day does: what the run's Claude Code reaches the record's MCP door with, and nothing more. It
 * is revoked when the job ends, when the sweep takes the job back, and when it runs out.
 *
 * `transaction` IS THE RECORD'S, handed in by `api/jobs.ts`, so the claim is atomic with the sweep that runs before it.
 *
 * `place` IS WHERE THE RUNNER SAYS IT IS: its machine and the profiles it can run under (`RunnerPlace`). A name that is
 * not one is passed over, so an older runner, or one that says nothing, takes only a job that names no machine and no
 * profile.
 */
export async function claimJob(deps: TokenDeps, runner: JobRunner, transaction: <T>(fn: () => T) => T, place?: RunnerPlace): Promise<Result<Claimed>> {
  const person = await approverOf(deps, runner.id);
  if (person === null) return no('FORBIDDEN', 'This machine is no longer enrolled. Enrol it again.', { at: 'principal' });
  const where = placeOf(place);
  const taken = transaction(() => {
    keepHeard(deps, runner, where);
    return take(deps, runner, where);
  });
  if (taken === null) return ok({ job: null, idle_ms: JOB_IDLE_MS });

  const minted = await createToken(deps, person, { scope: 'propose', label: bearerLabel(taken.id), days: 1 });
  if (!minted.ok) {
    transaction(() => {
      deps.sql.exec(
        "UPDATE job SET status = 'queued', runner_id = NULL, claimed_at = NULL, lease_until = NULL, expires = ? WHERE id = ? AND status = 'claimed'",
        taken.expires,
        taken.id,
      );
      noteOn(deps, taken.id, taken.seq, { text: UNKEYED });
    });
    return minted as Result<never>;
  }
  return ok({
    job: {
      id: taken.id,
      kind: taken.kind,
      title: taken.body.title,
      prompt: taken.body.prompt,
      tools: [...taken.body.tools],
      turns: taken.body.turns,
      permission: taken.body.permission,
      repo: taken.body.repo ?? null,
      args: taken.args,
      seat: taken.seat,
      seq: taken.seq,
      agent: taken.body.agent ?? 'claude',
    },
    lease_until: taken.lease_until,
    bearer: minted.value.bearer,
    mcp: { url: JOB_MCP_PATH },
  });
}

/** What a runner posts. */
export type PostJobEventArgs = { job_id?: unknown; seq?: unknown; kind?: unknown; body?: unknown };

/** A job this runner claimed, whether or not it still holds it, or `null` when it never claimed one by that id. */
const claimedBy = (deps: TokenDeps, runner: JobRunner, id: string | null): Stored | null => {
  if (id === null) return null;
  const row = deps.sql.one<Stored>(`SELECT ${COLUMNS} FROM job WHERE id = ?`, id);
  return row && row.runner_id === runner.id ? row : null;
};

/**
 * A body with every string that looks like a credential replaced by a sentence saying one was there.
 *
 * STRIPPED WHERE IT ENTERS. A run's tool output is whatever the tool printed, and a key printed by a command would
 * otherwise sit in the transcript for every reader of the job. Walked to `BODY_DEPTH_MOST` levels; anything deeper is
 * kept as nothing.
 */
function stripped(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return looksLikeCredential(value) ? 'A key was printed here, and BrainDog does not keep one.' : value;
  if (value === null || typeof value !== 'object') return value;
  if (depth >= BODY_DEPTH_MOST) return null;
  if (Array.isArray(value)) return value.map((v) => stripped(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripped(v, depth + 1)]));
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** An `end` event's body, checked: how the run ended and what it said about itself. */
function endOf(body: unknown): Result<{ status: JobEnd; result: string | null; error: string | null; session: string | null; cost: number | null; currency: string | null; turns: number | null; ms: number | null }> {
  if (!isObject(body) || !(JOB_ENDS as readonly unknown[]).includes(body.status))
    return no('VALUE_MALFORMED', `An end says how the job ended: status is ${JOB_ENDS.join(', ')}.`, { at: 'body.status', allowed: JOB_ENDS });
  if (body.error !== undefined && (typeof body.error !== 'string' || body.error.length > ERROR_CHARS_MOST))
    return no('VALUE_MALFORMED', `An end's error is text, at most ${ERROR_CHARS_MOST} characters.`, { at: 'body.error' });
  if (body.claude_session !== undefined && (typeof body.claude_session !== 'string' || body.claude_session.length > SESSION_CHARS_MOST))
    return no('VALUE_MALFORMED', 'An end\'s claude_session is the id Claude Code gave the run.', { at: 'body.claude_session' });
  for (const key of ['cost_minor', 'turns', 'ms'] as const)
    if (body[key] !== undefined && !isCount(body[key])) return no('VALUE_MALFORMED', `An end's ${key} is a whole number, 0 or more.`, { at: `body.${key}` });
  /* A COST COMES WITH THE CURRENCY IT WAS REPORTED IN, or not at all. The runner knows what its model charged in; the
     record would only be guessing, and a figure with a guessed currency is drawn wrong for every reader of the list. */
  if (body.cost_currency !== undefined && (typeof body.cost_currency !== 'string' || !isCurrencyCode(body.cost_currency)))
    return no('VALUE_MALFORMED', "An end's cost_currency is the ISO 4217 code of the currency its cost is in, in capitals, like USD.", { at: 'body.cost_currency' });
  if ((body.cost_minor === undefined) !== (body.cost_currency === undefined))
    return no('VALUE_MALFORMED', "An end's cost_minor and cost_currency come together, or neither is sent.", {
      at: body.cost_minor === undefined ? 'body.cost_minor' : 'body.cost_currency',
    });
  return ok({
    status: body.status as JobEnd,
    result: body.result === undefined ? null : JSON.stringify(stripped(body.result)),
    /* THE ERROR IS STRIPPED AS THE RESULT IS. It is whatever the run printed when it failed, a command's output
       included, and it sits on the job's row for every reader of the list. */
    error: typeof body.error === 'string' ? String(stripped(body.error)) : null,
    session: typeof body.claude_session === 'string' ? body.claude_session : null,
    cost: isCount(body.cost_minor) ? body.cost_minor : null,
    currency: typeof body.cost_currency === 'string' ? body.cost_currency : null,
    turns: isCount(body.turns) ? body.turns : null,
    ms: isCount(body.ms) ? body.ms : null,
  });
}

/**
 * A runner reports one line of its job, which must be the next: the line's number, whether the job was stopped, and the
 * lease renewed.
 *
 * `seq` IS THE JOB'S LAST NUMBER AND ONE, so a gap or a replay of another line is refused, and a replay of the last line
 * the record already holds is answered again with nothing written, because a runner that lost the answer to its post
 * sends it once more. An `end` ends the job with the status it names, keeps what the run said about itself, and revokes
 * the job's bearer.
 */
export function postJobEvent(deps: TokenDeps, runner: JobRunner, args: PostJobEventArgs): Result<Posted> {
  sweepJobs(deps);
  const id = jobIdOf(args?.job_id);
  const row = claimedBy(deps, runner, id);
  if (row === null || id === null) return no('FORBIDDEN', NOT_YOURS, { at: 'job_id' });

  const kind = args.kind;
  if (!(JOB_EVENT_KINDS as readonly unknown[]).includes(kind))
    return no('ENUM_VALUE_UNKNOWN', `A job's line is ${JOB_EVENT_KINDS.join(', ')}.`, { at: 'kind', allowed: JOB_EVENT_KINDS });
  const seq = args.seq;
  if (!isCount(seq)) return no('VALUE_MALFORMED', `seq is the number of this line, ${row.seq + 1} next.`, { at: 'seq' });
  /* THE LAST LINE AGAIN, `end` INCLUDED, is answered as it was the first time, and asked after the job has ended too,
     since the answer to an `end` is the one a runner most needs and the likeliest to be lost on the way back. */
  if (seq === row.seq && seq > 0) {
    const last = deps.sql.one<{ kind: string }>('SELECT kind FROM job_event WHERE job_id = ? AND seq = ?', id, seq);
    if (last?.kind === kind) return ok({ seq, cancel: row.cancel === 1, lease_until: row.lease_until });
  }
  if (row.status !== 'claimed') return no('FORBIDDEN', NOT_YOURS, { at: 'job_id' });
  if (seq !== row.seq + 1) return no('FORBIDDEN', `Lines are posted in order, and the next one this job takes is ${row.seq + 1}.`, { at: 'seq' });

  const body = args.body ?? null;
  if (body !== null && !isObject(body)) return no('VALUE_MALFORMED', "A line's body is an object, or nothing.", { at: 'body' });
  const text = body === null ? null : JSON.stringify(stripped(body));
  if (text !== null && new TextEncoder().encode(text).length > JOB_EVENT_BYTES_MOST)
    return no('OUT_OF_BOUNDS', `One line holds at most ${JOB_EVENT_BYTES_MOST} bytes. Say less, and keep the rest on the machine.`, { at: 'body' });
  if (kind !== 'end' && row.seq >= JOB_EVENTS_MOST)
    return no('OUT_OF_BOUNDS', `A job keeps at most ${JOB_EVENTS_MOST} lines. End this one.`, { at: 'seq' });
  const ended = kind === 'end' ? endOf(body) : null;
  if (ended !== null && !ended.ok) return ended as Result<never>;

  const at = instant(deps.nowMs);
  const lease = ended === null ? instant(deps.nowMs + JOB_LEASE_MS) : null;
  deps.sql.exec('INSERT INTO job_event (job_id, seq, kind, body, ts) VALUES (?, ?, ?, ?, ?)', id, seq, kind as string, text, at);
  deps.sql.exec('UPDATE job SET seq = ?, lease_until = ? WHERE id = ?', seq, lease, id);
  if (ended !== null && ended.ok) {
    const e = ended.value;
    deps.sql.exec(
      'UPDATE job SET status = ?, result = ?, error = ?, claude_session = ?, cost_minor = ?, cost_currency = ?, turns = ?, ms = ? WHERE id = ?',
      e.status,
      e.result,
      e.error,
      e.session,
      e.cost,
      e.currency,
      e.turns,
      e.ms,
      id,
    );
    revokeBearer(deps, id, `runner:${runner.id}`);
  }
  return ok({ seq, cancel: row.cancel === 1, lease_until: lease });
}

/** A runner asks whether its job was stopped, and holds it for another lease by asking. */
export function readCancel(deps: TokenDeps, runner: JobRunner, args: { job_id?: unknown }): Result<CancelRead> {
  sweepJobs(deps);
  const id = jobIdOf(args?.job_id);
  const row = claimedBy(deps, runner, id);
  if (row === null || id === null || row.status !== 'claimed') return no('FORBIDDEN', NOT_YOURS, { at: 'job_id' });
  const lease = instant(deps.nowMs + JOB_LEASE_MS);
  deps.sql.exec('UPDATE job SET lease_until = ? WHERE id = ?', lease, id);
  return ok({ cancel: row.cancel === 1, lease_until: lease });
}
