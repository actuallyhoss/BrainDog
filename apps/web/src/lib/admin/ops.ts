/**
 * The operator's doors, as the Admin page reads and writes them: `/account/ops/*` and the Kennel's review. Each is
 * opened by the operator's own session (the Worker's `operator.ts`), so nothing here holds a key.
 *
 * A stranger's words (an application's name, its link) come back as plain strings and the page draws them as text.
 */

export type Answer<T> = { ok: true; value: T } | { ok: false; status: number; fix: string };

/** What a status says to the operator when the door gave no sentence of its own. */
function said(status: number): string {
  if (status === 404) return 'This is not open to you here.';
  if (status === 400 || status === 422) return 'That did not look right. Check what you typed.';
  if (status === 409) return 'That one was already decided.';
  if (status === 429) return 'Too many tries. Wait a minute and try again.';
  return 'That did not work. Try again in a minute.';
}

/** One call: a GET without a body, a POST with one. */
export async function door<T>(path: string, body?: unknown): Promise<Answer<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, status: 0, fix: 'BrainDog could not be reached. Check the connection and try again.' };
  }
  const out = (await res.json().catch(() => null)) as { ok?: boolean; value?: T; refusal?: { fix?: string } } | null;
  if (!res.ok || out?.ok === false) return { ok: false, status: res.status, fix: res.status === 404 ? said(404) : (out?.refusal?.fix ?? said(res.status)) };
  return { ok: true, value: (out?.value ?? {}) as T };
}

export type Application = { id: string; name: string; email: string; use?: string; link?: string; made_at: number; state: 'waiting' | 'invited' | 'declined' | string };
export type Code = { ref: string; note?: string | null; made_at: number; ends_at?: number | null; state: 'open' | 'held' | 'spent' | 'ended' | string; made?: string | null };
export type Reach = {
  lists?: unknown[];
  pages?: unknown[];
  rules?: unknown[];
  skills?: unknown[];
  calls_out?: { line?: string; host?: string }[];
  uses?: { id?: string; writes?: boolean }[];
};
export type Waiting = {
  entry?: { kind?: string; id?: string; title?: string; summary?: string; publisher?: { name?: string } };
  version?: { version?: string; reach?: Reach };
  flags?: string[];
  added?: string[];
  note?: { text?: string } | null;
};
export type Report = { id: string; version?: string; why: string; by: string; at: string };
export type Review = { pending: Waiting[]; reports: Report[] };
export type Week = { week: string; seen?: number; applied?: number; invites_used?: number; signed_up?: number; agent?: number; brief?: number };
export type Funnel = { weeks: Week[]; asked?: number; more?: boolean; missed?: number };

export const REVIEW = '/api/kennel/v1/review';

/** The six steps of the way in, in the order a person takes them. */
export const STEPS = [
  { key: 'seen', label: 'Visits' },
  { key: 'applied', label: 'Applied' },
  { key: 'invites_used', label: 'Invites used' },
  { key: 'signed_up', label: 'Signed up' },
  { key: 'agent', label: 'First agent' },
  { key: 'brief', label: 'First brief' },
] as const;

/** One step as the funnel draws it: its total, its share of the widest step, what it kept of the step before, and its weeks. */
export type Step = { key: string; label: string; total: number; share: number; next: number; rate: string | null; of: string | null; weeks: { week: string; n: number }[]; peak: number };

const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** The shape drawn while there is nothing to count: a funnel with no figures in it, so an empty page still reads as this one. */
const GHOST = [1, 0.66, 0.54, 0.44, 0.34, 0.26];

/** Whether any week counted anything, so there is a table worth opening. */
export const counted = (funnel: Funnel): boolean => funnel.weeks.some((w) => STEPS.some((s) => count(w[s.key]) > 0));

const percent = (part: number): string => {
  const at = part * 100;
  if (at < 1) return 'Under 1%';
  return `${at < 10 ? String(Math.round(at * 10) / 10) : String(Math.round(at))}%`;
};

/**
 * The funnel's steps, from a door's answer or from none yet.
 *
 * THE WIDTHS ARE ON A CUBE ROOT. Visits run to thousands and sign-ups to tens, and on a straight scale every step after
 * the first is a hair. The figure and the percent beside each step are the facts; the shape only says where it narrows.
 * A step larger than the one before (an invite sent by hand has no application behind it) says no percent, since over
 * 100% of a step nobody took is not a rate.
 */
export function stepsOf(funnel: Funnel | null): Step[] {
  const weeks = funnel?.weeks ?? [];
  const totals = STEPS.map((s) => weeks.reduce((t, w) => t + count(w[s.key]), 0));
  const top = Math.max(0, ...totals);
  /* A FUNNEL ONLY ONCE VISITS LEAD IT. On a young record one sign-up and no counted visits is no shape to join up, so each
     step then stands as its own bar, at half the height, since one sign-up is not a wall. */
  const joined = top === 0 || totals[0] === top;
  const shares = totals.map((t, i) => (top === 0 ? (GHOST[i] ?? 0) : Math.max(0.05, Math.cbrt(t / top) * (joined ? 1 : 0.5))));
  return STEPS.map((s, i) => {
    const before = i > 0 ? (totals[i - 1] ?? 0) : 0;
    const total = totals[i] ?? 0;
    const kept = before > 0 && total > 0 && total <= before;
    const line = weeks.map((w) => ({ week: w.week, n: count(w[s.key]) }));
    return {
      key: s.key,
      label: s.label,
      total,
      share: shares[i] ?? 0,
      next: joined ? (shares[i + 1] ?? shares[i] ?? 0) : (shares[i] ?? 0),
      rate: kept ? percent(total / before) : null,
      of: kept ? (STEPS[i - 1]?.label ?? null) : null,
      weeks: line,
      peak: Math.max(0, ...line.map((w) => w.n)),
    };
  });
}

export const readApplications = async (): Promise<Answer<Application[]>> => {
  const out = await door<{ applications?: Application[] }>('/account/ops/applications');
  return out.ok ? { ok: true, value: Array.isArray(out.value.applications) ? out.value.applications : [] } : out;
};

export const readCodes = async (): Promise<Answer<Code[]>> => {
  const out = await door<{ codes?: Code[] }>('/account/ops/invite');
  return out.ok ? { ok: true, value: Array.isArray(out.value.codes) ? out.value.codes : [] } : out;
};

export const readReview = async (): Promise<Answer<Review>> => {
  const out = await door<Partial<Review>>(REVIEW);
  return out.ok ? { ok: true, value: { pending: Array.isArray(out.value.pending) ? out.value.pending : [], reports: Array.isArray(out.value.reports) ? out.value.reports : [] } } : out;
};

export const readFunnel = async (): Promise<Answer<Funnel>> => {
  const out = await door<Partial<Funnel>>('/account/ops/funnel');
  return out.ok ? { ok: true, value: { ...out.value, weeks: Array.isArray(out.value.weeks) ? out.value.weeks : [] } } : out;
};

/** A day as the page says it: "3 Nov". */
export function day(ms: number | null | undefined): string {
  if (typeof ms !== 'number') return '';
  const at = new Date(ms);
  const thisYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
}

/** A link is drawn only when it is http(s); anything else is text. */
export const webLink = (text: string | undefined): string | null => (typeof text === 'string' && /^https?:\/\//i.test(text.trim()) ? text.trim() : null);

/** A link as a short line: the host and path without the scheme. */
export const linkSaid = (href: string): string => href.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** What a used list, figure or page of the person's is called, from its id. */
export function useSaid(u: { id?: string; writes?: boolean }): { label: string; what: 'list' | 'figure' | 'page' | 'record'; writes: boolean } {
  const id = String(u.id ?? '');
  const placed = /^(register|metric|page)\./.exec(id);
  const label = (placed ? id.slice(id.indexOf('.') + 1) : id).replace(/[._-]+/g, ' ').trim() || 'the record';
  const what = !placed ? 'record' : placed[1] === 'metric' ? 'figure' : placed[1] === 'page' ? 'page' : 'list';
  return { label: label.charAt(0).toUpperCase() + label.slice(1), what, writes: u.writes === true };
}

/** "2 lists", "1 page". */
export const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/* ── people ───────────────────────────────────────────────────────────────── */

/** What a BrainDog has reached of its plan this month, as the door names it. */
export type Limit = 'runs' | 'requests' | 'bytes' | 'ms' | 'held' | 'asks' | 'agents' | 'files';
export type Meters = { runs: number; requests: number; bytes: number; ms: number };

/** A BrainDog as `/account/ops/people` answers it: counts, a plan's name, and the one name its owner gave it. */
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
  month: Meters & { failures: number; held: number };
  allowance: Meters | null;
  asks: number;
  credits: number | null;
  limits: Limit[];
};
export type Person = { email: string; name: string | null; signed_up: number; seen: number | null; suspended: boolean; passkeys: number; came: 'code' | 'invited' | 'open'; records: PersonRecord[] };
export type People = { people: Person[]; total?: number; records?: number; more?: boolean; asked?: number; missed?: number; waiting?: number };

export const readPeople = async (): Promise<Answer<People>> => {
  const out = await door<Partial<People>>('/account/ops/people');
  return out.ok ? { ok: true, value: { ...out.value, people: Array.isArray(out.value.people) ? out.value.people : [] } } : out;
};

const DAY_MS = 86_400_000;

/** How many agents a person's BrainDogs hold, or `null` while none of them has been asked. */
export function agentsOf(p: Person): number | null {
  const known = p.records.flatMap((r) => (r.agents === null ? [] : [r.agents]));
  return known.length === 0 ? null : known.reduce((n, a) => n + a, 0);
}

/** Every limit any of a person's BrainDogs has reached. */
export const limitsOf = (p: Person): Limit[] => [...new Set(p.records.flatMap((r) => r.limits))];

/** Everything counted against a person's BrainDogs lately: Slash's month and thirty days of runs. */
export const activityOf = (p: Person): number => p.records.reduce((n, r) => n + r.asks + r.runs_30, 0);

/**
 * Whether somebody signed up and never came back: three days on, seen no later than the day they arrived, and nothing
 * counted against them since.
 *
 * NOT ONLY THE SESSION, because a session is rotated once a day and signing out removes it, so its date alone would call
 * somebody gone who signed out last week. An agent connected or a question asked is coming back too.
 */
export function neverBack(p: Person, now: number): boolean {
  if (now - p.signed_up < 3 * DAY_MS) return false;
  if (p.seen !== null && p.seen - p.signed_up >= DAY_MS) return false;
  return activityOf(p) === 0 && (agentsOf(p) ?? 0) === 0;
}

export const seenThisWeek = (p: Person, now: number): boolean => p.seen !== null && now - p.seen < 7 * DAY_MS;

export type PeopleSort = 'seen' | 'new' | 'active';
export type PeopleSlice = 'all' | 'week' | 'gone' | 'agentless' | 'limit';

/** Whether a person is in a slice. Nobody is agentless while their BrainDogs have not been asked: that is not known. */
export function inSlice(p: Person, slice: PeopleSlice, now: number): boolean {
  if (slice === 'week') return seenThisWeek(p, now);
  if (slice === 'gone') return neverBack(p, now);
  if (slice === 'agentless') return agentsOf(p) === 0;
  if (slice === 'limit') return limitsOf(p).length > 0;
  return true;
}

/** A sort, the newest sign-up breaking every tie. Somebody with no session left to say goes last on Last active. */
export function sortPeople(list: readonly Person[], by: PeopleSort): Person[] {
  const rank = (p: Person): number => (by === 'new' ? p.signed_up : by === 'active' ? activityOf(p) : (p.seen ?? 0));
  return list.slice().sort((a, b) => rank(b) - rank(a) || b.signed_up - a.signed_up);
}

/** Whether a search finds a person: their name, address, or a BrainDog's name or address. */
export function peopleFound(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [p.name, p.email, ...p.records.flatMap((r) => [r.name, r.slug])].some((s) => (s ?? '').toLowerCase().includes(q));
}

/** When, as the row says it: "Today", "Yesterday", "3 days ago", then the day. */
export function agoSaid(ms: number, now: number): string {
  const days = Math.floor((now - ms) / DAY_MS);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${String(days)} days ago`;
  return day(ms);
}

/** A mail link for an address, encoded so nothing in it can add a subject or a body. */
export const mailTo = (email: string): string => `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`;

/** A size as a person reads it: "12 MB", "1.5 GB". */
export function bytesSaid(n: number): string {
  if (n >= 1e9) return `${String(Math.round(n / 1e8) / 10)} GB`;
  if (n >= 1e6) return `${String(Math.round(n / 1e6))} MB`;
  if (n >= 1e3) return `${String(Math.round(n / 1e3))} KB`;
  return n === 0 ? '0 MB' : `${String(n)} bytes`;
}

/** Run time as a person reads it: "40 min", "5 h". */
export const timeSaid = (ms: number): string => (ms >= 3_600_000 ? `${String(Math.round(ms / 360_000) / 10)} h` : `${String(Math.round(ms / 60_000))} min`);
