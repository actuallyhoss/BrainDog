/**
 * `GET /account/ops/funnel`: the last eight weeks of the way in, a week to a line, for the Funnel card of the
 * Admin page in the app (LAUNCH 103 job 9).
 *
 * SIX STEPS, EACH READ WHERE IT IS ALREADY KEPT. Visits, applications, invites used, people and records made are the
 * Directory's, answered as week totals by `funnel.read`. A record's first agent and first brief are the record's own
 * (`firsts()`), so each record is asked, twenty at a time, and at most `FUNNEL_RECORDS_MOST` of them; past that the
 * answer says it stopped, and the last two steps are short by the records it did not ask.
 *
 * COUNTS AND NOTHING ELSE. No person, address, name or record leaves this door: a week is its Monday and six numbers.
 *
 * Guarded as `/account/ops/invite` is: the operator's session or the key as a bearer, anyone else the 404 an unknown
 * path gets, 401 on a wrong key, a read counted by address. ITS OWN FILE, FREE OF `cloudflare:`, so every decision runs in a test over fakes; `index.ts` mounts it.
 */

import { sameKey } from '@braindog/host/auth';
import type { FunnelWeek as DirectoryWeek } from '@braindog/record/directory';

import { NOSNIFF } from './files.ts';

/** How many weeks the funnel shows, this one included. */
export const FUNNEL_WEEKS = 8;

/** The most records asked for their firsts in one read. */
export const FUNNEL_RECORDS_MOST = 500;

/** How many records are asked at once. */
export const FUNNEL_CHUNK = 20;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * The Directory's week totals (`funnel.read`), each week named by its Monday (`YYYY-MM-DD`, UTC). An ISO week name
 * (`YYYY-Www`) is read as well, and a count that is missing is none.
 */
export type FunnelRead = { weeks: (Partial<DirectoryWeek> & { week: string })[] };

/** One week of the funnel as this door answers it, oldest first. */
export type FunnelWeek = DirectoryWeek & { agent: number; brief: number };

export type Funnel = { weeks: FunnelWeek[]; asked: number; more: boolean; missed: number };

/** What `index.ts` hands the door. Every one is a value or a function, so a test builds it over fakes. */
export type FunnelDeps = {
  /** `PROVISION_KEY`, trimmed; empty, and no bearer opens this door. */
  key: string;
  /** Whether this request is the operator's own signed-in session (`operator.ts`). */
  operator?: boolean | undefined;
  /** A read's count by address (`overLimit` with `read`), or `null` to go on. */
  readLimit: (request: Request) => Promise<Response | null>;
  /** The one 401 (`saidUnauthorized`), which logs why and answers nothing of it. */
  unauthorized: () => Response;
  /** The Directory's `funnel.read { since }`, `since` in epoch milliseconds: its answer, or a `Result` holding it. */
  read: (since: number) => Promise<unknown>;
  /** Every open record, a page at a time (`Directory$.listRecords`). */
  records: (cursor?: string) => Promise<{ ids: string[]; cursor?: string }>;
  /** A record's `firsts()`: when its first agent connected and its first brief was written, each `null` until then. */
  firsts: (record: string) => Promise<unknown>;
  now: () => number;
};

const json = (body: unknown, status: number, extra: [string, string][] = []): Response =>
  new Response(JSON.stringify(body), { status, headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...NOSNIFF, ...extra] });

/** The Monday, 00:00 UTC, of the ISO week an instant falls in. */
export function mondayOf(ms: number): number {
  const day = Math.floor(ms / DAY_MS) * DAY_MS;
  /* 1 January 1970 was a Thursday, so a day's weekday from Monday is its count of days plus three, modulo seven. */
  const fromMonday = (Math.floor(day / DAY_MS) + 3) % 7;
  return day - fromMonday * DAY_MS;
}

const dayName = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** A week named either way, as its Monday's date, or `null` for a name that is neither. */
export function weekName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) {
    const at = Date.parse(`${name}T00:00:00Z`);
    return Number.isNaN(at) ? null : dayName(mondayOf(at));
  }
  const iso = /^(\d{4})-W(\d{2})$/.exec(name);
  if (iso === null) return null;
  /* ISO WEEK 1 HOLDS 4 JANUARY, so its Monday is the Monday of the week that day falls in. */
  const first = mondayOf(Date.UTC(Number(iso[1]), 0, 4));
  return dayName(first + (Number(iso[2]) - 1) * WEEK_MS);
}

/** An instant as epoch milliseconds, from a number or an ISO string, or `null` for neither. */
export function msOf(at: unknown): number | null {
  if (typeof at === 'number' && Number.isFinite(at) && at > 0) return at;
  if (typeof at === 'string' && at !== '') {
    const ms = Date.parse(at);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

const count = (n: unknown): number => (typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0);

/** The Directory's answer, unwrapped from a `Result` when it is one, or `null` for a refusal or a shape it is not. */
function totalsOf(said: unknown): FunnelRead | null {
  let value = said;
  if (typeof said === 'object' && said !== null && 'ok' in said) {
    if ((said as { ok: unknown }).ok !== true) return null;
    value = (said as { value?: unknown }).value;
  }
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { weeks?: unknown }).weeks)) return null;
  return value as FunnelRead;
}

/** Every record asked, at most `FUNNEL_RECORDS_MOST`, and whether there were more. */
async function recordsOf(deps: FunnelDeps): Promise<{ ids: string[]; more: boolean }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await deps.records(cursor);
    ids.push(...page.ids);
    if (ids.length >= FUNNEL_RECORDS_MOST) return { ids: ids.slice(0, FUNNEL_RECORDS_MOST), more: ids.length > FUNNEL_RECORDS_MOST || page.cursor !== undefined };
    if (page.cursor === undefined || page.ids.length === 0) return { ids, more: false };
    cursor = page.cursor;
  }
}

/** The funnel itself: eight weeks from the Directory's totals and each record's firsts. */
export async function funnelOf(deps: FunnelDeps): Promise<Funnel | null> {
  const thisWeek = mondayOf(deps.now());
  const since = thisWeek - (FUNNEL_WEEKS - 1) * WEEK_MS;
  const weeks: FunnelWeek[] = [];
  const at = new Map<string, FunnelWeek>();
  for (let i = 0; i < FUNNEL_WEEKS; i++) {
    const week: FunnelWeek = { week: dayName(since + i * WEEK_MS), seen: 0, applied: 0, invites_used: 0, signed_up: 0, records: 0, agent: 0, brief: 0 };
    weeks.push(week);
    at.set(week.week, week);
  }
  const totals = totalsOf(await deps.read(since));
  if (totals === null) return null;
  for (const line of totals.weeks) {
    const week = at.get(weekName(line?.week) ?? '');
    if (week === undefined) continue;
    week.seen += count(line.seen);
    week.applied += count(line.applied);
    week.invites_used += count(line.invites_used);
    week.signed_up += count(line.signed_up);
    week.records += count(line.records);
  }
  const { ids, more } = await recordsOf(deps);
  let missed = 0;
  for (let i = 0; i < ids.length; i += FUNNEL_CHUNK) {
    const said = await Promise.allSettled(ids.slice(i, i + FUNNEL_CHUNK).map((id) => deps.firsts(id)));
    for (const one of said) {
      if (one.status === 'rejected' || typeof one.value !== 'object' || one.value === null) {
        missed += 1;
        continue;
      }
      const firsts = one.value as { agent?: unknown; brief?: unknown };
      for (const step of ['agent', 'brief'] as const) {
        const ms = msOf(firsts[step]);
        const week = ms === null || ms < since ? undefined : at.get(dayName(mondayOf(ms)));
        if (week !== undefined) week[step] += 1;
      }
    }
  }
  return { weeks, asked: ids.length, more, missed };
}

/** `GET /account/ops/funnel`. */
export async function opsFunnel(request: Request, deps: FunnelDeps): Promise<Response> {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' ? deps.operator !== true : deps.key === '') return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'Nothing is here.' } }, 404);
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/ops/funnel is read with GET.' } }, 405, [['allow', 'GET, HEAD']]);
  const over = await deps.readLimit(request);
  if (over !== null) return over;
  if (bearer !== '' && !(await sameKey(bearer, deps.key))) return deps.unauthorized();
  const funnel = await funnelOf(deps);
  if (funnel === null) return json({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'The counts could not be read. Try again in a minute.' } }, 503);
  return json({ ok: true, value: funnel }, 200);
}
