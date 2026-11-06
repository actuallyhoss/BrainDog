/**
 * `GET /account/ops/people`: who has an account and how their records stand, for the People tile of the Admin page.
 *
 * WHAT THE PRIVACY POLICY LETS THE OPERATOR SEE BESIDE A NAME, AND NOTHING PAST IT. The account's own facts (an address,
 * how they sign in, when they last used a session, which records and what role, a plan and whether it is paid) and the
 * count of each allowance a record uses are ours to hold and read ("Your account", "When you pay"). What is IN a record
 * is the owner's, and we open one only to support them, keep BrainDog safe or follow the law. So this door never reads a
 * row, a list, a project, the history, a plugin or a key's label, and it does not count them either: a count of those
 * beside an address is a use the policy does not name. Nor does it read a record's firsts or `dir_step`, whose counts are
 * promised to name nobody.
 *
 * WHAT THE RECORD IS ASKED IS WHAT ITS PLAN LIMITS: how many agent keys are live and how many bytes of files it holds,
 * and its own name. Everything else comes from the Directory, which answers without waking a record.
 *
 * AN ANSWER IS BUILT FIELD BY FIELD (`lineOf`), so whatever is added to the Directory's read later stays out of this
 * answer until somebody names it here. A record's id leaves nothing behind it either: the page has the address.
 *
 * NEVER EVERY RECORD ON EVERY OPEN. A record's answer is kept in the Directory (`dir_ops_held`) and good for
 * `PEOPLE_FRESH_MS`. A read asks only those gone stale, `PEOPLE_CHUNK` at a time, and at most `PEOPLE_ASK_MOST` of them, the
 * most recently seen first; past that the answer says how many are `waiting`, and the next read takes them. No request
 * of anybody else's touches this.
 *
 * Guarded as `/account/ops/funnel` is: the operator's session or the key as a bearer, anyone else the 404 an unknown path
 * gets, 401 on a wrong key, a read counted by address. ITS OWN FILE, FREE OF `cloudflare:`, so every decision runs in a
 * test over fakes; `index.ts` mounts it.
 */

import { sameKey } from '@braindog/host/auth';
import type { Allowance, PeopleHeld, PeopleLine, PeopleRead, PeopleRecord, UsageTotals } from '@braindog/record/directory';

import { NOSNIFF } from './files.ts';

/** How long a record's answer stands before it is asked again. */
export const PEOPLE_FRESH_MS = 6 * 3_600_000;

/** The most records asked in one read. */
export const PEOPLE_ASK_MOST = 100;

/** How many records are asked at once. */
export const PEOPLE_CHUNK = 20;

/** What a record has reached of its plan this month. */
export type Limit = 'runs' | 'requests' | 'bytes' | 'ms' | 'held' | 'asks' | 'agents' | 'files';

/** A BrainDog as this door answers it. Counts, plan names, and the one name its owner gave it. */
export type PersonRecord = {
  slug: string | null;
  name: string | null;
  role: 'owner' | 'member';
  members: number;
  plan: string;
  pay: string | null;
  since: number;
  agents: number | null;
  agents_most: number | null;
  files: number | null;
  files_most: number | null;
  runs_7: number;
  runs_30: number;
  actions_30: number;
  month: UsageTotals;
  allowance: Allowance | null;
  asks: number;
  credits: number | null;
  limits: Limit[];
};

/** A person as this door answers them. */
export type Person = {
  email: string;
  name: string | null;
  signed_up: number;
  seen: number | null;
  suspended: boolean;
  passkeys: number;
  came: 'code' | 'invited' | 'open';
  records: PersonRecord[];
};

export type People = {
  people: Person[];
  /** Everybody with an account, and every open record, whether or not they fit in `people`. */
  total: number;
  records: number;
  /** Whether there are more people than the newest `people` holds. */
  more: boolean;
  /** Records asked in this read, records whose asking failed, and stale records left for the next read. */
  asked: number;
  missed: number;
  waiting: number;
};

/** What `index.ts` hands the door. Every one is a value or a function, so a test builds it over fakes. */
export type PeopleDeps = {
  /** `PROVISION_KEY`, trimmed; empty, and no bearer opens this door. */
  key: string;
  /** Whether this request is the operator's own signed-in session (`operator.ts`). */
  operator?: boolean | undefined;
  /** A read's count by address (`overLimit` with `read`), or `null` to go on. */
  readLimit: (request: Request) => Promise<Response | null>;
  /** The one 401 (`saidUnauthorized`), which logs why and answers nothing of it. */
  unauthorized: () => Response;
  /** The Directory's `people`. */
  read: () => Promise<PeopleRead> | PeopleRead;
  /** A record's `opsHeld`: its name, live agent keys and bytes of files, or `null` for one it could not say. */
  held: (record: string) => Promise<Omit<PeopleHeld, 'record'> | null>;
  /** The Directory's `peopleKeep`, under the time the asking happened. */
  keep: (held: PeopleHeld[], at: number) => Promise<void> | void;
  now: () => number;
};

const json = (body: unknown, status: number, extra: [string, string][] = []): Response =>
  new Response(JSON.stringify(body), { status, headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...NOSNIFF, ...extra] });

/** A count, whatever came across: a figure that is not one is none. */
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
const countOr = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);
const textOr = (s: unknown): string | null => (typeof s === 'string' && s !== '' ? s : null);

/** What this record has reached: each meter of its month, Slash, and the two its plan holds it to. */
function limitsOf(r: PeopleRecord): Limit[] {
  const out: Limit[] = [];
  const a = r.allowance;
  if (a !== null) for (const m of ['runs', 'requests', 'bytes', 'ms'] as const) if (count(r.month[m]) >= a[m]) out.push(m);
  if (count(r.month.held) > 0) out.push('held');
  if (r.asks_spent === true) out.push('asks');
  if (r.agents !== null && r.agents_most !== null && r.agents >= r.agents_most) out.push('agents');
  if (r.files !== null && r.files_most !== null && r.files >= r.files_most) out.push('files');
  return out;
}

const totals = (t: UsageTotals): UsageTotals => ({ runs: count(t.runs), requests: count(t.requests), bytes: count(t.bytes), ms: count(t.ms), failures: count(t.failures), held: count(t.held) });
const allowed = (a: Allowance | null): Allowance | null => (a === null ? null : { runs: count(a.runs), requests: count(a.requests), bytes: count(a.bytes), ms: count(a.ms) });

/** A person, field by field: what is not named here does not leave. */
function lineOf(p: PeopleLine): Person {
  return {
    email: String(p.email),
    name: textOr(p.name),
    signed_up: count(p.created_at),
    seen: countOr(p.seen),
    suspended: p.suspended === true,
    passkeys: count(p.passkeys),
    came: p.came === 'code' || p.came === 'invited' ? p.came : 'open',
    records: p.records.map(
      (r): PersonRecord => ({
        slug: textOr(r.slug),
        name: textOr(r.name),
        role: r.role === 'owner' ? 'owner' : 'member',
        members: count(r.members),
        plan: String(r.plan),
        pay: textOr(r.pay),
        since: count(r.since),
        agents: countOr(r.agents),
        agents_most: countOr(r.agents_most),
        files: countOr(r.files),
        files_most: countOr(r.files_most),
        runs_7: count(r.runs_7),
        runs_30: count(r.runs_30),
        actions_30: count(r.actions_30),
        month: totals(r.month),
        allowance: allowed(r.allowance),
        asks: count(r.asks),
        credits: countOr(r.credits),
        limits: limitsOf(r),
      }),
    ),
  };
}

/** The door's answer: the Directory's read, with the stale records asked and their answers kept and drawn in. */
export async function peopleOf(deps: PeopleDeps): Promise<People> {
  const read = await deps.read();
  const now = deps.now();
  /* EACH RECORD ONCE, THE MOST RECENTLY SEEN FIRST: the people the operator is looking for are the ones still here. */
  const stale = new Map<string, PeopleRecord[]>();
  const bySeen = read.people.slice().sort((a, b) => (b.seen ?? 0) - (a.seen ?? 0));
  for (const person of bySeen) {
    for (const r of person.records) {
      if (r.asked_at !== null && now - r.asked_at < PEOPLE_FRESH_MS) continue;
      stale.set(r.record, [...(stale.get(r.record) ?? []), r]);
    }
  }
  const asking = [...stale.keys()].slice(0, PEOPLE_ASK_MOST);
  const kept: PeopleHeld[] = [];
  let missed = 0;
  for (let i = 0; i < asking.length; i += PEOPLE_CHUNK) {
    const chunk = asking.slice(i, i + PEOPLE_CHUNK);
    const said = await Promise.allSettled(chunk.map((record) => deps.held(record)));
    said.forEach((one, at) => {
      const record = chunk[at] as string;
      if (one.status === 'rejected' || one.value === null || typeof one.value !== 'object') {
        missed += 1;
        return;
      }
      const held: PeopleHeld = { record, name: textOr(one.value.name), agents: count(one.value.agents), files: count(one.value.files) };
      kept.push(held);
      for (const line of stale.get(record) ?? []) {
        line.name = held.name;
        line.agents = held.agents;
        line.files = held.files;
      }
    });
  }
  if (kept.length > 0) await deps.keep(kept, now);
  return {
    people: read.people.map(lineOf),
    total: count(read.total),
    records: count(read.records),
    more: count(read.total) > read.people.length,
    asked: asking.length,
    missed,
    waiting: stale.size - asking.length,
  };
}

/** `GET /account/ops/people`. */
export async function opsPeople(request: Request, deps: PeopleDeps): Promise<Response> {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' ? deps.operator !== true : deps.key === '') return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'Nothing is here.' } }, 404);
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/ops/people is read with GET.' } }, 405, [['allow', 'GET, HEAD']]);
  const over = await deps.readLimit(request);
  if (over !== null) return over;
  if (bearer !== '' && !(await sameKey(bearer, deps.key))) return deps.unauthorized();
  try {
    return json({ ok: true, value: await peopleOf(deps) }, 200);
  } catch {
    return json({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'The people could not be read. Try again in a minute.' } }, 503);
  }
}
