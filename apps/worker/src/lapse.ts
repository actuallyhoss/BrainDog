/**
 * What a record whose billing has lapsed may still do: read everything, export, and nothing else (ADR-059).
 *
 * ITS OWN FILE, AND FREE OF `cloudflare:`, for `session.ts`'s reason: this decides what a paying customer's agent is
 * refused, and a decision that can only run inside workerd is a decision nobody tests. The doors in `session.ts` ask
 * it once they know who is calling and whether the record has lapsed, and the Worker's drain asks `lapseDrops` of each
 * job it leases.
 *
 * THE LAPSE IS THE DIRECTORY'S FACT, NEVER THE RECORD'S. Only a verified Stripe event writes a `lapsed` row
 * (`billing.ts`), so a record with no billing row, which is every record nobody pays for through Stripe, is never
 * capped by anything here: every function below is asked only once the Directory has said `lapsed`.
 */

import { OPERATION_METHOD, type OutboxRow } from '@braindog/kernel';
import { ROUTES } from '@braindog/host';
import { TOOLS } from '@braindog/mcp';
import type { CallContext, Level } from '@braindog/record';

/** The one sentence a lapsed record answers every write with, on every surface: the app, `/api` and `/mcp`. */
export const LAPSED_FIX = 'Read-only until billing resumes. Export is available.';

/** The record methods that change something, by the name a path gives them. A name in no row here is not asked about. */
const WRITES: ReadonlySet<string> = new Set(ROUTES.filter((r) => r.writes).map((r) => r.name));

/** The MCP tools that change something. A client reads the same flag as `readOnlyHint`. */
const TOOL_WRITES: ReadonlySet<string> = new Set(TOOLS.filter((t) => t.writes).map((t) => t.name));

type Principal = CallContext['principal'];

/**
 * A level held to `read`, or to nothing.
 *
 * `append` IS HELD TO NOTHING AND NOT TO `read`, because it is the one level that does not read (`LEVEL_REACH` in
 * `@braindog/record`): capping it at `read` would show a contractor who files expenses every row they were never shown,
 * on the day the record stopped being paid for.
 */
const readOnly = (level: Level | null): Level | null => (level === null || level === 'append' ? null : 'read');

/**
 * The context a caller on a lapsed record is answered under: a person at `read`, a token at `scope ∩ {read}`, and each
 * list they were invited to held to `read` the same way.
 *
 * THE DOOR REFUSES WRITES WITH `LAPSED_FIX` BEFORE THIS IS EVER HANDED ON (`mayWrite`), so this is the second line and
 * not the first: a method this file does not know writes, or a write reached by a path no row names, still meets the
 * record's own ladder at `read`. A runner, a link and the system are left as they are, because none of them reaches a
 * rung for this to lower.
 */
export function capped(ctx: CallContext): CallContext {
  const p = ctx.principal;
  let principal: Principal;
  if (p.kind === 'person') principal = { ...p, level: readOnly(p.level) };
  else if (p.kind === 'token') principal = { ...p, scope: 'read', level: readOnly(p.level) };
  else return ctx;
  const out: CallContext = { ...ctx, principal };
  const levels = ctx.levels === undefined ? undefined : heldToRead(ctx.levels);
  if (levels === undefined) delete out.levels;
  else out.levels = levels;
  return out;
}

/** Each list's own level held to `read`, and a list held at `append` dropped, so the record's level answers for it. */
function heldToRead(levels: Readonly<Record<string, Level>>): Readonly<Record<string, Level>> | undefined {
  const out: Record<string, Level> = {};
  for (const [list, level] of Object.entries(levels)) if (level !== 'append') out[list] = 'read';
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Whether a call to `method` may go on while the record has lapsed. `ctx` is the caller's context before `capped`.
 *
 * EVERY READ PASSES, AND OF THE WRITES ONLY `export` (ADR-059): the record is the customer's whatever they owe, so the
 * owner's own session exports it, and so does an operation grant approved for `export`, which is how `braindog export`
 * takes it. A token, a member below owner and a grant approved for anything else are refused, because an export is a
 * copy of everything and the lapse lowers nobody's reach into one.
 */
export function mayWrite(method: string, ctx: CallContext): boolean {
  if (!WRITES.has(method)) return true;
  if (method !== OPERATION_METHOD.export) return false;
  if (ctx.operation !== undefined) return ctx.operation === OPERATION_METHOD.export;
  const p = ctx.principal;
  return p.kind === 'person' && p.level === 'owner' && ctx.provedAt !== undefined;
}

/**
 * Whether an MCP message is a call to a tool that writes. Anything else, a listing, a read or a message this cannot
 * parse, is `false` and goes on to the record, which answers it at `read`.
 */
export function mcpWrites(message: unknown): boolean {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return false;
  const m = message as { method?: unknown; params?: unknown };
  if (m.method !== 'tools/call' || m.params === null || typeof m.params !== 'object') return false;
  const name = (m.params as { name?: unknown }).name;
  return typeof name === 'string' && TOOL_WRITES.has(name);
}

/**
 * Whether the drain acks this job as done and unsent while its record has lapsed.
 *
 * A CALL, A POLL AND A MODEL JOB ARE WORK FOR SOMEBODY WHO IS NOT PAYING, so none is sent: `pull.fetch` and every
 * `infer.*`. A digest is the same, and a notification that is one says so by its `because` (`digest.`), by the
 * digest's own page in a push's `url`, or by the digest id in a webhook's body. Every other notification goes,
 * a reminder and an urgent notice among them, because the lapse is not a reason to miss a date (53 §5.10).
 */
export function lapseDrops(job: Pick<OutboxRow, 'kind' | 'payload'>): boolean {
  if (job.kind === 'pull.fetch' || job.kind.startsWith('infer.')) return true;
  if (!job.kind.startsWith('notify.')) return false;
  const said = parsed(job.payload);
  if (said === null) return false;
  if (typeof said.because === 'string' && said.because.startsWith('digest.')) return true;
  if (job.kind === 'notify.push') return typeof said.url === 'string' && said.url.startsWith('/digest/');
  if (job.kind === 'notify.webhook' && typeof said.body === 'string') {
    const body = parsed(said.body);
    return body !== null && typeof body.digest === 'string';
  }
  return false;
}

/** A JSON object, or `null` for anything that is not one. */
function parsed(text: string): Record<string, unknown> | null {
  try {
    const out: unknown = JSON.parse(text);
    return out !== null && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
