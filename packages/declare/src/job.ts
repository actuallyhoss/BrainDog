/**
 * A job kind as the people and the machines that decide on it read one (`loop/finish/agents.md` C13, C14).
 *
 * THE LINT IS THE KERNEL'S AND IS NOT COPIED. `jobFault` asks `validateDeclaration`, which dispatches a `job` to
 * `jobBody` in the kernel's `jobs.ts`, so a pack checked here, a shared file checked in the Kennel and a change checked
 * at install are refused by one function in one sentence. A pack's declarations already reach it through `shared.ts`
 * and `catalogue.ts`; this is the same question asked of one job kind by a caller holding nothing else.
 *
 * THE CARD IS WHAT AN OWNER APPROVES. Decide draws a `job.<id>` change before anybody accepts it, and the runner prints
 * the same reading in its terminal the first time a machine meets a kind: what it is asked to do, the tools in words,
 * the folder it works in and how it asks. Written once here so the two never describe one kind two ways.
 *
 * THE PIN IS WHAT A MACHINE ALLOWED. A runner keeps, per kind, the SHA-256 of the parts of a claimed job that decide
 * what the run can do, and asks again when they change. It is computed by the machine from what it was handed, never
 * taken from the host, so a host that forged a kind cannot hand over a pin that matches.
 */

import { JOB_MCP_PREFIX, commandOf, digest, jcs, validateDeclaration, type Json } from '@braindog/kernel';
import type { Refusal } from '@braindog/ports';

/** Why a `job` declaration would be refused at install, or `null` when it would install. */
export function jobFault(decl: { id: string; body: Record<string, Json> }): Refusal | null {
  return validateDeclaration({ id: decl.id, kind: 'job', body: decl.body });
}

/** One tool a kind names, and what it lets a run do, in words a person reads. */
export type JobCardTool = { tool: string; says: string };

/** A job kind as Decide and the runner's terminal show it. */
export type JobCard = {
  title: string;
  prompt: string;
  /** What a person fills in to start one, by the label they read. */
  asks: { id: string; label: string }[];
  /** The name of the folder it works in, which each machine maps; `null` is an empty folder of its own. */
  repo: string | null;
  tools: JobCardTool[];
  turns: number;
  permission: string;
  /** How it asks for permission, as a sentence. */
  permissionSays: string;
  /** True when a run changes files, which the card says in red. */
  writes: boolean;
};

const TOOL_SAYS: Readonly<Record<string, string>> = {
  Read: 'Read files',
  Grep: 'Search inside files',
  Glob: 'Find files by name',
};

const PERMISSION_SAYS: Readonly<Record<string, string>> = {
  dontAsk: 'Uses only the tools listed, and asks nothing.',
  acceptEdits: 'Changes files without asking.',
};

/**
 * What one tool lets a run do, in words. A tool this reading does not know is shown as it is written.
 *
 * THE KERNEL'S OWN READING OF A TOOL'S NAME, `JOB_MCP_PREFIX` and `commandOf`, so the words Decide shows for a command
 * are the command the lint let through, never a second parse of the same text.
 */
export function toolSays(tool: string): string {
  if (Object.hasOwn(TOOL_SAYS, tool)) return TOOL_SAYS[tool] ?? tool;
  if (tool.startsWith(JOB_MCP_PREFIX)) return `Use the record's ${tool.slice(JOB_MCP_PREFIX.length).replace(/_/gu, ' ')} tool`;
  const command = commandOf(tool);
  if (command === null) return tool;
  /* `git log:*` IS "run git log" WITH ANY ARGUMENTS; a wildcard anywhere else is a pattern, and is shown as one. */
  return command.includes('*') ? `Run commands like ${command}` : `Run ${command}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * A `job` declaration's body as a card, or `null` when it is not an object at all.
 *
 * READ AS IT IS, NOT AS IT SHOULD BE. Decide shows a proposed change before the lint has had its say in front of the
 * owner, so a key of the wrong shape is read as empty here rather than thrown on; `jobFault` is what refuses it.
 */
export function jobCard(body: unknown): JobCard | null {
  if (!isObject(body)) return null;
  const permission = text(body.permission);
  return {
    title: text(body.title),
    prompt: text(body.prompt),
    asks: (Array.isArray(body.args) ? body.args : []).filter(isObject).map((a) => ({ id: text(a.id), label: text(a.label) })),
    repo: typeof body.repo === 'string' && body.repo !== '' ? body.repo : null,
    tools: (Array.isArray(body.tools) ? body.tools : []).filter((t): t is string => typeof t === 'string').map((tool) => ({ tool, says: toolSays(tool) })),
    turns: typeof body.turns === 'number' ? body.turns : 0,
    permission,
    permissionSays: Object.hasOwn(PERMISSION_SAYS, permission) ? (PERMISSION_SAYS[permission] ?? permission) : permission,
    writes: body.writes === true,
  };
}

/** The parts of a claimed job a pin is taken over: everything that decides what the run may do. */
export type Pinned = { prompt: string; tools: readonly string[]; turns: number; permission: string; repo: string | null };

/**
 * The pin a machine keeps for a kind it allowed: the SHA-256, as lower-case hex, of the canonical JSON of the prompt as
 * approved (its `%arg%` slots unfilled), the tools, the turns, the permission and the repository.
 *
 * THE ARGUMENTS ARE NOT IN IT, since they change with every run and are only ever filled into the approved slots. The
 * title is not either: renaming a kind changes nothing it can do.
 */
export function jobPin(job: Pinned): Promise<string> {
  return digest(jcs({ prompt: job.prompt, tools: [...job.tools], turns: job.turns, permission: job.permission, repo: job.repo }));
}
