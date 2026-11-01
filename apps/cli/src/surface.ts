/**
 * The record as the MCP tools reach it, over HTTP.
 *
 * EVERY METHOD IS ONE `client.call`, and nothing else happens here. Authorisation, validation and every
 * refusal's sentence stay with the host, so an agent reads the same words whichever transport it used.
 * The one exception is a host that did not answer, whose sentence is the plan's §1.7.
 */

import { CALL_TABLE, type Client } from '@braindog/client';
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
 * The optional methods of `McpSurface` this client routes: the first four, `arrangement` and
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
 *
 * `scriptTry` IS ON IT FROM THE DAY IT WAS ROUTED, for `recentHistory`'s lesson: it backs `propose` with `"try"` on a
 * script change, and a stdio agent left off this list would be told this record cannot try a script when its host can.
 * `previewPage` JOINED WITH ITS BRANCH for the same reason: before it, a host that routed the
 * method still left `surfaceOver`'s answer without it, measured, so `propose` with `try` on a page change would have
 * answered `NOT_IN_THIS_BUILD` over stdio and drawn the page over HTTP.
 *
 * `triage` JOINED WITH ITS TOOL, for the same lesson: an agent given the `inbox` reach
 * works from the command line as often as over `POST /mcp`, and left off this list it would be told this record cannot
 * file an arrival when its host can. Who may triage is still the record's to say, in its own sentence.
 *
 * `previewChange` JOINED WITH ITS BRANCH (`change_preview`), and `tryAutomation` beside it
 * for its own (`automation_try`), for `previewPage`'s reason: each backs `propose` with `"try"`, on a bundle and on a
 * rule change, and left off this list a stdio agent would be told this record cannot draw a change or try a rule when
 * its host can.
 *
 * `understandPlan` JOINED WITH ITS RESOURCE (`braindog:understand`), for the same lesson: an agent working for the owner from the
 * command line sees what the record would link before it meets anyone, as it does over `POST /mcp`. Who may read it is
 * the record's to say.
 *
 * `inboxPatterns` JOINED WITH ITS ADDRESS (`braindog:inbox/patterns`), for `triage`'s lesson: a stdio agent with the
 * `inbox` reach reads what each pattern did with what came in, as an agent over HTTP can.
 *
 * `briefing`, `exceptions`, `stale` AND `about` JOINED WITH THEIR ADDRESSES (`braindog:briefing`, `braindog:exceptions`,
 * `braindog:stale`, `braindog:about/<name>`), for `actions`'s lesson: each backs a resource and no tool, so left off
 * this list the address is simply absent from a stdio session. The probe keeps each off until the client routes it.
 *
 * `learnings` JOINED WITH ITS ADDRESS (`braindog:learnings`), for the same lesson: an agent he runs from the command
 * line reads the standing lessons before it works, as an agent over HTTP does.
 */
const LATER = [
  'context',
  'handoff',
  'meet',
  'sessionsLive',
  'arrangement',
  'recentHistory',
  'automations',
  'dryRun',
  'scriptTry',
  'previewPage',
  'inbox',
  'inboxPatterns',
  'triage',
  'undoOwn',
  /* A page on `log` (`attachVisual`), for a stdio agent as for one over HTTP. */
  'attachVisual',
  'previewChange',
  'tryAutomation',
  'understandPlan',
  'briefing',
  'widgetGallery',
  'exceptions',
  'stale',
  'about',
  'learnings',
  /* `instructionsMine` JOINED WITH ITS TOOL (`instructions`, agents and MCP plan §2, §6.1), for `recentHistory`'s lesson:
     left off, a stdio agent would be told it cannot read what he told it when its host can. It is also what tells the
     door this record knows instructions, so the door reads the caller's settings and what waits beside each call. */
  'instructionsMine',
] as const;

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

  const later: Pick<McpSurface<Ctx>, (typeof LATER)[number] | 'actions' | 'figures' | 'offered' | 'beat'> = {};
  for (const name of LATER) if (routed.has(name)) later[name] = (args: object, ctx: Ctx) => ask<unknown>(ctx, name, args);
  /* `actions` TAKES NO ARGUMENTS, so it is written out rather than folded into the loop above: the surface declares it
     as `(ctx)` alone, and giving it the loop's `(args, ctx)` shape is a compile error, not a harmless widening. */
  if (routed.has('actions')) later.actions = (ctx: Ctx) => ask<unknown>(ctx, 'actions');
  /* AND `figures` FOR THE SAME REASON, ON THIS LIST BEFORE ANY HOST ROUTES IT, for `recentHistory`'s lesson.
     Without it `record_index` names only the figures a page draws; the probe keeps it off until
     the client's table carries the name, so no call goes out for a route that is not there. */
  if (routed.has('figures')) later.figures = (ctx: Ctx) => ask<{ id: string; name?: string }[]>(ctx, 'figures');
  /* AND `offered`, WHICH IS WHY A STDIO SESSION'S LIST OF RESOURCES IS ONE ROUND TRIP: without it the door
     reads every fixed address and draws every page to learn what to list, a round trip each over this transport. A host
     that answers it with a refusal is listed the old way, so a host older than the route costs nothing but the time. */
  if (routed.has('offered')) later.offered = (ctx: Ctx) => ask<unknown>(ctx, 'offered');
  /* `beat` AT MOST ONCE A MINUTE FROM HERE: the door beats on every tool call it admits and the record
     keeps one a minute, so the rest would be a round trip each for nothing. Its own two-second deadline, so it outlives
     the call it rode on. So Codex and any stdio client without the PostToolUse hook reads Working too. */
  let beatAt = 0;
  if (routed.has('beat'))
    later.beat = () => {
      const now = Date.now();
      if (now - beatAt < 60_000) return Promise.resolve({ ok: true, value: { run: null } });
      beatAt = now;
      return ask<unknown>({ signal: AbortSignal.timeout(2_000) }, 'beat');
    };

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
    /* `act`'S CALLS, EACH SENT AS THE APP SENDS IT (`client.call`), and the table they are held to, the client's own. The
       host and the record still decide every one; a name the host does not route is refused in the client's words. */
    call: (name, args, ctx) => ask(ctx, name, args),
    calls: () => CALL_TABLE,
    /* THE TOOLS RUN HERE, so the handshake and the tool list answer with the host down: not cut by his settings. */
    onMachine: true,
  };
}
