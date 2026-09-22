/**
 * The record as the MCP tools reach it, over HTTP.
 *
 * EVERY METHOD IS ONE `client.call`, and nothing else happens here. Authorisation, validation and every
 * refusal's sentence stay with the host, so an agent reads the same words whichever transport it used.
 * The one exception is a host that did not answer, whose sentence is the plan's §1.7.
 */

import type { Client } from '@braindog/client';
import type { McpSurface } from '@braindog/mcp';
import { refused, type Result } from '@braindog/ports';

/** What the transport hands each call: its deadline. The tools pass it on and never read it. */
export type Ctx = { signal: AbortSignal };

export const UNREACHABLE_FIX =
  'BrainDog could not be reached. Say so and carry on; do not answer from memory, and treat anything read from a file as possibly stale.';

/* The client's own sentence says why the socket failed, which a person debugging wants and a model
   acting on it does not. The code is kept; the sentence becomes the instruction. */
const reachable = <T>(r: Result<T>): Result<T> =>
  refused(r) && r.refusal.code === 'UNREACHABLE' ? { ok: false, refusal: { ...r.refusal, fix: UNREACHABLE_FIX } } : r;

/**
 * The optional methods of `McpSurface` this client routes: the first four since build step 16, `arrangement` since S12 and
 * `recentHistory` with the `activity` tool; the probe below stays so that a client built before a route landed gives its
 * tool's own "not yet" sentence.
 *
 * A NAME LEFT OFF THIS LIST IS A TOOL THAT REFUSES FOREVER, which is the failure `recentHistory` was for one run: the
 * `activity` tool shipped, `packages/host` routes the method (`src/index.ts:459`), and stdio answered
 * `NOT_IN_THIS_BUILD` because the one place that turns a routed method into a surface member had not heard of it. The
 * probe is what makes adding a name safe: a host that does not route it still gets the tool's own sentence.
 *
 * AND `actions` IS THE SAME FAILURE WITH NOTHING VISIBLE TO GO ON, which is why it lasted longer. It backs no tool: it
 * backs the resource `braindog:actions`, and a resource is listed only once it has been read, so the missing member did
 * not refuse where an agent could see it. The address was simply absent from every stdio session, and the one list of
 * what this BrainDog runs on a schedule was unreachable from the command line. Driving `resources/list` over the
 * transport is what found it (`test/stdio.test.ts`), after reading the list found nothing: the name is in the client's
 * own table and in the record's routes, and only this line was short.
 */
const LATER = ['context', 'handoff', 'meet', 'sessionsLive', 'arrangement', 'recentHistory', 'automations', 'dryRun'] as const;

export async function surfaceOver(clientFor: (ctx: Ctx) => Client): Promise<McpSurface<Ctx>> {
  const ask = async <T>(ctx: Ctx, name: string, args: unknown = {}): Promise<Result<T>> =>
    reachable(await clientFor(ctx).call<T>(name, args as Record<string, unknown>));

  /**
   * WHICH OF THE FOUR THIS CLIENT CAN ROUTE, asked of the client. It refuses a name its table lacks
   * before sending anything, and lists the names it has, so each one starts working here on the day
   * its route lands. Until then the tool gives its own "not yet" sentence rather than the client's
   * "no such method". The signal is already aborted, so not even a real name could go out.
   */
  const probe = await clientFor({ signal: AbortSignal.abort() }).call('');
  const allowed = refused(probe) ? (probe.refusal as { allowed?: unknown }).allowed : undefined;
  const routed = new Set(Array.isArray(allowed) ? allowed : []);

  const later: Pick<McpSurface<Ctx>, (typeof LATER)[number] | 'actions'> = {};
  for (const name of LATER) if (routed.has(name)) later[name] = (args: object, ctx: Ctx) => ask<unknown>(ctx, name, args);
  /* `actions` TAKES NO ARGUMENTS, so it is written out rather than folded into the loop above: the surface declares it
     as `(ctx)` alone, and giving it the loop's `(args, ctx)` shape is a compile error, not a harmless widening. */
  if (routed.has('actions')) later.actions = (ctx: Ctx) => ask<unknown>(ctx, 'actions');

  return {
    boot: (ctx) => ask(ctx, 'boot'),
    version: (ctx) => ask(ctx, 'version'),
    whoami: (ctx) => ask(ctx, 'whoami'),
    schema: (args, ctx) => ask(ctx, 'schema', args),
    get: (args, ctx) => ask(ctx, 'get', args),
    list: (args, ctx) => ask(ctx, 'list', args),
    search: (args, ctx) => ask(ctx, 'search', args),
    history: (args, ctx) => ask(ctx, 'history', args),
    governance: (args, ctx) => ask(ctx, 'governance', args),
    propose: (args, ctx) => ask(ctx, 'propose', args),
    create: (args, ctx) => ask(ctx, 'create', args),
    update: (args, ctx) => ask(ctx, 'update', args),
    pages: (ctx) => ask(ctx, 'pages'),
    page: (args, ctx) => ask(ctx, 'page', args),
    metric: (args, ctx) => ask(ctx, 'metric', args),
    digestToday: (args, ctx) => ask(ctx, 'digestToday', args),
    ...later,
  };
}
