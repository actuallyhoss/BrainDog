/**
 * How often one caller may ask: the key, the class, the numbers, the window and the refusal, shared by both hosts.
 *
 * NEITHER DOOR HAD A RATE. Measured: `/api` and `/mcp` answered as often as they
 * were asked, on the Worker and on the self-host, and the only limits in the tree were the sign-in lockout, the ingest
 * budget and a report key's minute. The Cloud's `ratelimits` binding was drafted in `wrangler.jsonc` and read by no
 * code, so a token in a loop spent the record's Durable Object as fast as the network carried the requests.
 *
 * NOTHING HERE TOUCHES A DOOR. The Worker asks its `RL_READ` and `RL_WRITE` bindings through `bindingLimiter`;
 * the self-host, which has no binding, asks `windowLimiter`. Both answer the same `Limiter`, both key a caller
 * with `limitKey` and both refuse with `refusedFor`, so the two hosts cannot drift into two different ideas of who a
 * caller is or what a refusal looks like, which is the drift `index.ts`'s header argues against for the routes.
 *
 * NO CLOCK AND NO `node:` IMPORT, because `tools/gates/stack.mjs` keeps `packages/` runtime-neutral. `windowLimiter`
 * is handed its clock, which is also what lets a test move a minute in one line.
 */

import type { Refusal } from '@braindog/ports';

import { ipBucket } from '@braindog/record/directory';
import { MCP_PER_MINUTE, tooManyLine } from './abuse.ts';
import { ROUTES } from './index.ts';

/**
 * The drafted binding's numbers (`apps/worker/wrangler.jsonc`, `ratelimits`, 600 and 120 a minute), for both hosts.
 *
 * ONE PAIR, WRITTEN TWICE, AND THE COPY IN `wrangler.jsonc` IS THE ONE THAT GOVERNS THE CLOUD. The binding's limit is
 * configuration and not code, so these two are what the self-host counts to and what a test asserts. A change to one
 * that is not made to the other gives the two hosts different ceilings, which is a finding and not a feature.
 */
export const READ_PER_MINUTE = 600;
export const WRITE_PER_MINUTE = 120;

/**
 * The version poll's own budget (`RL_POLL` in `wrangler.jsonc`), 240 a minute: four a second.
 *
 * AN OPEN TAB ASKS `/api/version` ABOUT EVERY 1.5 s WHILE IT HAS FOCUS (`apps/web/src/lib/data/live.ts`), which is 40 a
 * minute, and on the read budget that was 40 of the 600 a person's screens, agents and re-reads share. Worse, the
 * poll is the one call that must keep answering while the rest is busy: a screen that spent the minute on re-reads
 * would have had its next poll refused, and the tab would sit stale for up to a minute. So the poll counts apart, at
 * six focused tabs' worth, and spends nothing of the read budget. The answer is one `MAX(rowid)`, so a caller looping
 * on it past this costs the record little; the ceiling is here so it costs something.
 */
export const POLL_PER_MINUTE = 240;

/** Which budget a request spends. Separate budgets, so a burst of writes never starves reads, and not the reverse. */
export type LimitClass = 'read' | 'write' | 'poll' | 'mcp';

/** A limiter's answer: go on, or wait this many whole seconds. */
export type Verdict = { ok: true } | { ok: false; retryAfter: number };

/** What both hosts implement: the Worker over its bindings, the self-host over `windowLimiter`. */
export type Limiter = { limit(key: string, cls: LimitClass): Promise<Verdict> };

/**
 * The door a request came through, as the Worker's `doorOf` and `bearerOf` already resolve it.
 *
 * STRUCTURAL, as `index.ts`'s `RecordSurface` is, so `host` names no type of `@braindog/record`'s here.
 */
export type LimitDoor = {
  door: 'bearer' | 'session';
  /**
   * Accepted and never read.
   *
   * THE RECORD IS NOT THE KEY, and it is here so the door can be passed as it is. Two tokens on one record keyed by
   * the record would share one budget: an integration that loops would then refuse the owner's own phone, and the
   * test's second token is there to go red if that mistake is made.
   */
  record?: string;
  ctx: { principal: { kind: string; id: string } };
};

/**
 * Who a limit counts: the token for a bearer, the person for a session, and the address for no door.
 *
 * THERE WAS A THIRD DOOR, THE PUBLIC DEMO, AND IT WAS KEYED BY ADDRESS because every visitor to it was the same
 * `p_demo`: a key built from that principal would have given the whole internet one budget. The demo is gone,
 * so every door left names somebody who signed in or holds a token.
 *
 * A BEARER CAN BE A PERSON. An operation grant resolves to the person who approved it, not to a token, and it is
 * counted as that person, who is the one spending it.
 *
 * NO DOOR AT ALL is a request the host could not attribute to anybody, and the address is all it has.
 */
export function limitKey(door: LimitDoor | null, ip: string): string {
  if (door === null) return `ip:${ipBucket(ip)}`;
  const { kind, id } = door.ctx.principal;
  return `${kind}:${id}`;
}

/* A READ SENT AS A WRITE (`postRead`: `previewPage`, `reads`) CHANGES NOTHING, so it spends the read budget. `reads`
   carries at most `READS_MOST` reads (`packages/record/src/methods/reads.ts`) and is counted once, as the one request it
   is: what it saves the record is the doors each of them would have passed. */
const WRITES = new Set(ROUTES.filter((r) => r.writes && r.postRead !== true).map((r) => r.name));

/** The routes a screen polls on a clock, which spend `POLL_PER_MINUTE` and not the read budget. */
const POLLS: ReadonlySet<string> = new Set(['version']);

/**
 * Which budget a request spends, from the route table's `writes`.
 *
 * AN `/mcp` REQUEST IS A READ AT THE DOOR, and it is passed as `undefined`. Which tool it calls is inside a JSON-RPC
 * body the door has not parsed, and parsing it there to choose a budget would mean reading a megabyte from a caller
 * the limit exists to slow down. So an agent's writes spend the read budget; the record's own permissions still decide
 * whether the write is allowed.
 *
 * A NAME NO ROUTE HAS IS A READ, because the router answers it `ROUTE_UNKNOWN` without touching the record.
 */
export function classOf(route: string | undefined): LimitClass {
  if (route !== undefined && POLLS.has(route)) return 'poll';
  return route !== undefined && WRITES.has(route) ? 'write' : 'read';
}

const WINDOW_MS = 60_000;
const PER_MINUTE: Readonly<Record<LimitClass, number>> = { read: READ_PER_MINUTE, write: WRITE_PER_MINUTE, poll: POLL_PER_MINUTE, mcp: MCP_PER_MINUTE };

/**
 * A fixed sixty-second window per key, for a host with no binding to ask.
 *
 * ALIGNED TO THE CLOCK'S MINUTE, so every key's window closes at the same instant and the whole map is dropped then.
 * A window that opened at each key's first request would need a sweep to find the keys whose minute had ended; an
 * address that asked once and never again would otherwise stay in memory for as long as the process runs, and a
 * self-host on the open internet is asked by a great many addresses once.
 *
 * THE BURST AT THE EDGE IS ACCEPTED. A fixed window lets up to twice the limit through across the instant it closes.
 * The Cloud's binding is a fixed window too ("permissive, eventually consistent", in Cloudflare's own words), and the
 * two hosts behaving alike is worth more here than a sliding window on one of them.
 *
 * `size()` IS HOW MANY KEYS ARE HELD, so a test can see the map emptied rather than trust that it was.
 */
export function windowLimiter(now: () => number): Limiter & { size(): number } {
  let window = -1;
  let counts = new Map<string, number>();
  return {
    size: () => counts.size,
    async limit(key, cls) {
      const at = now();
      const current = Math.floor(at / WINDOW_MS);
      if (current !== window) {
        window = current;
        counts = new Map();
      }
      const slot = `${cls}\u0000${key}`;
      const seen = (counts.get(slot) ?? 0) + 1;
      counts.set(slot, seen);
      if (seen <= PER_MINUTE[cls]) return { ok: true };
      return { ok: false, retryAfter: Math.max(1, Math.ceil(((current + 1) * WINDOW_MS - at) / 1000)) };
    },
  };
}

/** The part of Cloudflare's rate-limit binding this uses. */
export type RateLimitBinding = { limit(options: { key: string }): Promise<{ success: boolean }> };

/**
 * The Worker's `RL_READ` and `RL_WRITE` as a `Limiter`.
 *
 * AN ABSENT BINDING LIMITS NOTHING. Production binds both (`apps/worker/wrangler.jsonc`); `alpha` and a test's
 * `bundled()` bind neither, and answer exactly as they did before.
 *
 * THE PRICE PAGE STATES THE MONTH, NOT THE MINUTE. `/pricing` shows each plan's monthly allowance (runs, requests,
 * data fetched, script time and Slash credits), read from `apps/site/src/lib/plans.ts`, which `plans.test.ts` holds
 * to the Directory's `ALLOWANCE`; past it an action waits for the first of next month. These per-minute budgets are
 * no plan's allowance: they are the same on every plan, stop a caller in a loop, and a refusal from them says when to
 * ask again, so a person reading the price page is promised nothing they limit.
 *
 * SIXTY SECONDS TO WAIT, BECAUSE THE BINDING SAYS ONLY YES OR NO. Its answer carries no reset time, and sixty is the
 * `period` the binding is declared with: the longest the refusal can last, which is the honest bound to send.
 *
 * A BINDING THAT THROWS IS THROWN. Whether a broken limiter should open the door or close it is the door's to decide,
 * next to the rest of what it does with a failure.
 *
 * A POLL WITH NO `RL_POLL` SPENDS THE READ BUDGET, as it did before it had one, so a deployment that has not bound the
 * new binding yet limits the poll exactly as it always has rather than not at all.
 */
/* AN UNBOUND `mcp` SPENDS THE READ BUDGET, as an unbound poll does, so a deployment without `RL_MCP` limits /mcp as it always did. */
export function bindingLimiter(bindings: { read?: RateLimitBinding | undefined; write?: RateLimitBinding | undefined; poll?: RateLimitBinding | undefined; mcp?: RateLimitBinding | undefined }): Limiter {
  return {
    async limit(key, cls) {
      const binding = cls === 'poll' ? (bindings.poll ?? bindings.read) : cls === 'mcp' ? (bindings.mcp ?? bindings.read) : bindings[cls];
      if (binding === undefined) return { ok: true };
      const { success } = await binding.limit({ key });
      return success ? { ok: true } : { ok: false, retryAfter: WINDOW_MS / 1000 };
    },
  };
}

/**
 * The 429: `RATE_LIMITED` with `retry_after` in the envelope and `Retry-After` in the header.
 *
 * THE REGISTRY'S EXISTING SHAPE, and no new code. `index.ts` already maps `RATE_LIMITED` to 429 and sends
 * `Retry-After` beside `retry_after`, and `ingest.ts` answers its own budget the same way; a client that handles one
 * of them handles this.
 *
 * `no-store`, as every answer of `serveApi`'s is: a refusal for one caller is no shared cache's to hand to another.
 */
export function refusedFor(retryAfter: number): Response {
  const wait = Number.isFinite(retryAfter) ? Math.max(1, Math.ceil(retryAfter)) : WINDOW_MS / 1000;
  const refusal: Refusal = {
    code: 'RATE_LIMITED',
    fix: tooManyLine(wait),
    retry_after: wait,
  };
  return new Response(JSON.stringify({ ok: false, refusal }), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': String(wait),
    },
  });
}
