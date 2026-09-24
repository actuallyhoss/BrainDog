/**
 * Scheduled actions on screen: a project's "Runs on" list and the account's usage page (`loop/DIRECTION.md`
 * §0b, `loop/research-scheduled-actions.md` §6).
 *
 * THE RECORD OR ITS REFUSAL, as `packs.ts` does it. A screen reads a `Source`, which is the record over HTTP.
 * With no record it drew the sample's five actions, one of them paused with a Resume that changed only the tab;
 * that went with DIRECTION 26, and no record is now the sentence for it.
 *
 * TWO READS, AND WHAT EACH FALLS BACK TO.
 *
 *   · `actions` on the record: every scheduled action the caller may read, with its state, its last run,
 *     its next run and this month's counts from its own `pull` events. A record that has no such method yet
 *     (`ROUTE_UNKNOWN`) draws no list; any other refusal, `UNREACHABLE` and `UNAUTHORIZED` among them, is said.
 *   · `GET /account/usage` on the host: the Directory's ledger, billing-grade, with each record's month
 *     against its plan's allowance. A 404, or no host, falls back to `actions`, which says nothing about
 *     limits because the record cannot see them.
 *
 * NOT THROUGH `@braindog/client`, because the client refuses a method missing from its route table before
 * it sends anything, and "this build has no such read" and "there is no record here" are different
 * answers this screen draws differently. The fetch is handed in, so a test hands in something that is
 * not a socket.
 *
 * PURE, for the reason `device.ts` gives: `node --test` cannot import a `.svelte.ts` file.
 */

import { bytes as fmtBytes, since } from 'braindog-render';

import { copy } from '../copy.ts';

/* ── the shapes ─────────────────────────────────────────────────────────── */

export type Refusal = { code: string; fix: string; at?: string | undefined };
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export type Channel = 'pull' | 'call' | 'poll';

/** What a run came to, as the kernel's `meter` writes it on the run's `pull` event. */
export type Outcome = 'ok' | 'changed' | 'unchanged' | 'paused' | 'failed' | 'refused' | 'dropped' | 'held';

/** The four counts a person reads. Run time is the ledger's, and failures are never limited. */
export type Totals = { runs: number; requests: number; bytes: number; failures: number };

/**
 * One scheduled action, as the record's `actions` read answers it.
 *
 * THE CONTRACT THIS SCREEN ASKS FOR, from `research-scheduled-actions.md` §4.6 ("each action's state,
 * last run, next run and counts from its own events"). The key is its vault label, never the key.
 */
export type ActionRow = {
  ingest: string;
  channel: Channel;
  /** The project it runs for, by name, or `null` for the whole record. */
  project: string | null;
  host: string | null;
  every: string;
  key: string | null;
  state: 'pending' | 'firing' | 'paused' | 'done';
  next: string | null;
  last: { at: string; outcome: Outcome; status: number | null; note: string } | null;
  /** This calendar month so far, UTC, and `held` is how many runs the plan's limit held. */
  month: Totals & { held: number };
  /** This month by UTC day, oldest first. What the chart is drawn from when there is no ledger. */
  days: ({ day: string } & Totals)[];
};

/** `resumeAction`'s answer. */
export type Resumed = { ingest: string; kind: Channel };

/** The Directory's ledger, as `GET /account/usage` answers. `@braindog/record`'s `AccountUsage`, the keys read here. */
type LedgerTotals = Totals & { ms: number; held: number };
export type AccountUsage = {
  from: string;
  to: string;
  totals: LedgerTotals;
  records: {
    record: string;
    slug: string | null;
    plan: string;
    closed: boolean;
    month: { month: string; used: LedgerTotals; allowance: { runs: number; requests: number; bytes: number; ms: number } | null; resets: string };
    totals: LedgerTotals;
    projects: ({ scope: string } & LedgerTotals)[];
    actions: ({ scope: string; action: string } & LedgerTotals)[];
    days: ({ day: string } & LedgerTotals)[];
  }[];
};

/* ── the wire ───────────────────────────────────────────────────────────── */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/* A DEAD NETWORK SAID "The demo has no account, so nothing here can be approved, revoked or connected", which was about a
   door that no longer exists and told nobody to try again. */
const unreachable = (): Answer<never> => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: copy.recordNotReached } });
const unauthorized = (): Answer<never> => ({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: copy.signInAgain } });

const isAnswer = (v: unknown): v is Answer<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && ((v as { ok: unknown }).ok === true ? 'value' in v : 'refusal' in v);

/**
 * One request, read as the record's envelope.
 *
 * AN ANSWER THAT IS NOT AN ENVELOPE IS NO RECORD. A static host answers `/api/actions` with its own 404
 * page, and a dev proxy with nothing behind it answers with an error page; both are `UNREACHABLE`, the
 * client's own reading. A 401 carries an empty body and is `UNAUTHORIZED`. `notFound` is set for any 404,
 * envelope or not, because the usage route falls back on a 404 whatever its body says.
 */
async function send<T>(io: Fetch, url: string, body?: Record<string, unknown>): Promise<Answer<T> & { notFound?: true }> {
  let res: Response;
  try {
    res = await io(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return unreachable();
  }
  /* THE BODY IS CANCELLED, NOT LEFT. A 401 returned with its body unread, and the request stayed pending in
     the network panel on /p/kiln for as long as the tab was open. */
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined);
    return unauthorized();
  }
  const said: unknown = await res.json().catch(() => undefined);
  const out = (isAnswer(said) ? said : unreachable()) as Answer<T>;
  return res.status === 404 ? { ...out, notFound: true } : out;
}

/** The two ledger answers that leave the question of a record to the record: nobody reached, or nobody signed in. */
const ASK_THE_RECORD: ReadonlySet<string> = new Set(['UNREACHABLE', 'UNAUTHORIZED']);

export type Source = {
  actions(): Promise<Answer<ActionRow[]>>;
  resume(ingest: string): Promise<Answer<Resumed>>;
};

export function live(io: Fetch, base = ''): Source {
  return {
    actions: () => send<ActionRow[]>(io, `${base}/api/actions`),
    resume: (ingest) => send<Resumed>(io, `${base}/api/resumeAction`, { ingest }),
  };
}

/** What a screen draws from the first read: the rows, no list at all, or the record's fix. */
export type Opened = { source: Source; first: Answer<ActionRow[]>; absent: boolean };

/**
 * The record's actions, and whether it has the read at all.
 *
 * `_at` WAS THE SAMPLE'S CLOCK. `Inspector.svelte` and `/automations/<id>` still pass `() => NOW` and are other briefs'
 * files; it can go once neither does.
 */
export async function openActions(io: Fetch, base = '', _at?: () => number): Promise<Opened> {
  const source = live(io, base);
  const first = await source.actions();
  return { source, first, absent: !first.ok && first.refusal.code === 'ROUTE_UNKNOWN' };
}

/* ── one row, said ──────────────────────────────────────────────────────── */

export const words = {
  /* THE SEED'S HEADING, which the agents pack declares and this list is drawn under. */
  runsOn: 'Runs on',
  heading: 'Scheduled actions',
  everywhere: 'For every project',
  resume: 'Resume',
  resumed: (name: string) => `${name} runs again now.`,
  seeUsage: 'See usage',
  runs: (n: number) => (n === 1 ? '1 run this month' : `${n.toLocaleString('en-GB')} runs this month`),
  verb: { pull: 'Fetches from', call: 'Calls', poll: 'Watches' } as Record<Channel, string>,
  key: (label: string) => `with the key "${label}"`,
  /* The four states of `research-scheduled-actions.md` §6.2, one calm sentence each. No red: paused is `warn`. */
  live: (last: string, next: string | null) => (next ? `Last ran ${last}. Next run ${next}.` : `Last ran ${last}.`),
  never: (next: string | null) => (next ? `Not run yet. First run ${next}.` : 'Not run yet.'),
  retrying: (host: string, next: string | null) =>
    next ? `${host} did not answer the last run. It tries again ${next}, and there is nothing to do.` : `${host} did not answer the last run. It tries again on its own.`,
  notWritten: 'Nothing was saved from the last run. The next run asks again.',
  refusedKey: (host: string, key: string) => `Paused. ${host} did not accept the key "${key}". Reconnect the key and it runs again.`,
  missingKey: (key: string) => `Paused. The key "${key}" is not in the vault. Add it and it runs again.`,
  reconnect: 'Reconnect key',
  addTheKey: 'Add the key',
  paused: 'Paused. It runs again when you resume it.',
  waitingFallback: 'Waiting for next month. This record has used its allowance for this month.',
  /* The usage page. */
  usage: 'Usage',
  usageFor: (month: string) => `Scheduled actions in ${month}`,
  byProject: 'By project',
  byAction: 'By action',
  overTime: 'Runs by week',
  records: 'Records',
  requests: 'requests',
  failures: (n: number) => (n === 1 ? '1 failure' : `${n.toLocaleString('en-GB')} failures`),
  noUsage: 'Nothing has run this month.',
  noLedger: 'This record does not report usage yet.',
  ofAllowance: (used: number, allowance: number, resets: string) =>
    `${used.toLocaleString('en-GB')} of ${allowance.toLocaleString('en-GB')} runs. It starts again on ${resets}.`,
  waitingUntil: (resets: string) => `Actions on this record are waiting until ${resets}, because it has used this month's runs.`,
  noLimit: 'Counted, with no monthly limit.',
  week: (from: string, to: string) => (from === to ? from : `${from} to ${to}`),
} as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-10-01` as a person says it: `1 October`. */
export const dayWords = (iso: string): string => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`;
};

/** `15m`, `1h`, `6h`, `1d` as a person says them. Anything else is printed as it was declared. */
export function often(every: string): string {
  const m = /^(\d+)\s*(m|h|d|w)$/u.exec(every.trim());
  if (!m) return every;
  const n = Number(m[1]);
  const unit = { m: 'minute', h: 'hour', d: 'day', w: 'week' }[m[2] as 'm' | 'h' | 'd' | 'w'];
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

export type Tone = 'warn' | undefined;

/** What one row says about where it stands, whether it offers Resume, and whether it points at usage. */
/** `reconnect` is where the key an action was paused on is put right, when that is why it paused. */
export type Said = { line: string; tone: Tone; resume: boolean; usage: boolean; reconnect?: { href: string; label: string } };

/**
 * The Vault, opened on the key a paused action needs, with the action to resume once the key is in.
 *
 * A LABEL AND AN ACTION'S NAME IN THE ADDRESS, and never a value: the value is typed into the sheet the Vault opens.
 */
export const reconnectHref = (key: string, ingest: string): string =>
  `/vault?${new URLSearchParams({ reconnect: key, then: ingest }).toString()}`;

/**
 * One action's state, in one sentence.
 *
 * PAUSED OUTRANKS EVERYTHING, because it is the only state a person has to act on. WAITING is read off
 * the last run: a run the plan held carries the Directory's own sentence, which names the day it runs
 * again, so this says that sentence rather than a second version of it.
 */
export function stateOf(row: ActionRow, now: number): Said {
  const host = row.host ?? row.ingest;
  const next = row.next ? since(row.next, now) : null;
  const last = row.last;
  if (row.state === 'paused') {
    const refused = Boolean(last && (last.status === 401 || last.status === 403) && row.key);
    /* A PAUSE WITH NO RUN BEHIND IT IS A KEY THAT WAS NOT IN THE VAULT WHEN THE ACTION FIRED: the kernel pauses the row
       there and meters nothing, so `last` is empty or an older run. Nothing else pauses an action without a paused run. */
    const missing = !refused && Boolean(row.key) && (last?.outcome !== 'paused' || last.status === null);
    const why = refused ? words.refusedKey(host, row.key!) : missing ? words.missingKey(row.key!) : words.paused;
    const reconnect = refused || missing ? { href: reconnectHref(row.key!, row.ingest), label: refused ? words.reconnect : words.addTheKey } : undefined;
    return { line: why, tone: 'warn', resume: true, usage: false, ...(reconnect ? { reconnect } : {}) };
  }
  if (!last) return { line: words.never(next), tone: undefined, resume: false, usage: false };
  if (last.outcome === 'held') return { line: last.note || words.waitingFallback, tone: undefined, resume: false, usage: true };
  if (last.outcome === 'failed') return { line: words.retrying(host, next), tone: undefined, resume: false, usage: false };
  if (last.outcome === 'refused') return { line: words.notWritten, tone: undefined, resume: false, usage: false };
  return { line: words.live(since(last.at, now), next), tone: undefined, resume: false, usage: false };
}

/** A row's second line: what it does, where, how often, and with which key. */
export const whatOf = (row: ActionRow): string =>
  [`${words.verb[row.channel]} ${row.host ?? row.ingest}`, often(row.every), row.key ? words.key(row.key) : ''].filter(Boolean).join(', ');

/**
 * A project's actions, its own first and then the ones for every project.
 *
 * MATCHED BY NAME, as the "Runs on" blocks above it match `project is {{name}}`, and case-blind, because
 * a declaration typed `kiln` and a project called Kiln are the same project to a person.
 *
 * `null` is no project: Settings, ingest lists every action as its own, none of them faint.
 */
export function forProject(rows: readonly ActionRow[], project: string | null): { own: ActionRow[]; everywhere: ActionRow[] } {
  const name = (r: ActionRow) => r.ingest;
  const by = (a: ActionRow, b: ActionRow) => name(a).localeCompare(name(b));
  if (project === null) return { own: [...rows].sort(by), everywhere: [] };
  const want = project.trim().toLowerCase();
  return {
    own: rows.filter((r) => r.project !== null && r.project.trim().toLowerCase() === want).sort(by),
    everywhere: rows.filter((r) => r.project === null || r.project === 'global').sort(by),
  };
}

/** After a resume: the row is pending and due now, as `resumeAction` leaves it. */
export const afterResume = (rows: readonly ActionRow[], ingest: string, at: string): ActionRow[] =>
  rows.map((r) => (r.ingest === ingest ? { ...r, state: 'pending', next: at } : r));

/* ── usage ──────────────────────────────────────────────────────────────── */

const zero = (): Totals => ({ runs: 0, requests: 0, bytes: 0, failures: 0 });
const add = (into: Totals, from: Totals): void => {
  into.runs += from.runs;
  into.requests += from.requests;
  into.bytes += from.bytes;
  into.failures += from.failures;
};

export type Named = { name: string; faint: boolean } & Totals;

/** One record's month against its allowance. Only a ledger draws one, and only for a plan with a limit. */
export type Allowed = { name: string; used: number; allowance: number | null; resets: string; waiting: boolean };

export type UsageView = {
  from: 'ledger' | 'events';
  month: string;
  totals: Totals;
  projects: Named[];
  actions: Named[];
  weeks: { label: string; runs: number }[];
  records: Allowed[];
};

/**
 * Days, in weeks from the first of the month: 1 to 7, 8 to 14, and on. A month is five bars at most.
 *
 * NO BAR FOR A WEEK THAT HAS NOT STARTED. `through` is today; a week after it drew as zero runs, which
 * reads as nothing having run rather than nothing having happened yet.
 */
export function weeksOf(days: readonly ({ day: string } & Pick<Totals, 'runs'>)[], month: string, through?: string): UsageView['weeks'] {
  const [y, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  const last = through?.slice(0, 7) === month ? Math.min(end, Number(through.slice(8, 10))) : end;
  const out: UsageView['weeks'] = [];
  for (let start = 1; start <= last; start += 7) {
    const stop = Math.min(start + 6, end);
    const runs = days
      .filter((d) => d.day.slice(0, 7) === month && Number(d.day.slice(8, 10)) >= start && Number(d.day.slice(8, 10)) <= stop)
      .reduce((n, d) => n + d.runs, 0);
    const name = MONTHS[(m ?? 1) - 1]?.slice(0, 3) ?? '';
    out.push({ label: words.week(`${start} ${name}`, `${stop} ${name}`), runs });
  }
  return out;
}

const sortNamed = (rows: Named[]): Named[] => rows.sort((a, b) => Number(a.faint) - Number(b.faint) || b.runs - a.runs || a.name.localeCompare(b.name));

/** The record's own events, summed: what `/usage` draws when there is no ledger. Nothing about limits. */
export function usageFromActions(rows: readonly ActionRow[], month: string, from: 'events', through?: string): UsageView {
  const totals = zero();
  const projects = new Map<string, Named>();
  const days = new Map<string, number>();
  const actions: Named[] = [];
  for (const r of rows) {
    add(totals, r.month);
    const global = r.project === null || r.project === 'global';
    const key = global ? '' : r.project!;
    const p = projects.get(key) ?? { name: global ? words.everywhere : r.project!, faint: global, ...zero() };
    add(p, r.month);
    projects.set(key, p);
    actions.push({ name: r.ingest, faint: global, runs: r.month.runs, requests: r.month.requests, bytes: r.month.bytes, failures: r.month.failures });
    for (const d of r.days) days.set(d.day, (days.get(d.day) ?? 0) + d.runs);
  }
  return {
    from,
    month,
    totals,
    projects: sortNamed([...projects.values()]),
    actions: sortNamed(actions),
    weeks: weeksOf([...days].map(([day, runs]) => ({ day, runs })), month, through),
    records: [],
  };
}

/** The ledger, as one view over every record the person owns. */
export function usageFromLedger(said: AccountUsage, month: string, through?: string): UsageView {
  const totals = zero();
  const projects = new Map<string, Named>();
  const actions: Named[] = [];
  const days = new Map<string, number>();
  const many = said.records.length > 1;
  for (const r of said.records) {
    add(totals, r.totals);
    const prefix = many ? `${r.slug ?? r.record} · ` : '';
    for (const p of r.projects) {
      const global = p.scope === 'global' || p.scope === '';
      const key = `${r.record}:${p.scope}`;
      const into = projects.get(key) ?? { name: prefix + (global ? words.everywhere : p.scope), faint: global, ...zero() };
      add(into, p);
      projects.set(key, into);
    }
    for (const a of r.actions) {
      const global = a.scope === 'global' || a.scope === '';
      actions.push({ name: prefix + a.action, faint: global, runs: a.runs, requests: a.requests, bytes: a.bytes, failures: a.failures });
    }
    for (const d of r.days) days.set(d.day, (days.get(d.day) ?? 0) + d.runs);
  }
  const records: Allowed[] = said.records
    .filter((r) => !r.closed)
    .map((r) => {
      const allowance = r.month.allowance;
      const waiting = allowance !== null && (r.month.used.held > 0 || (['runs', 'requests', 'bytes', 'ms'] as const).some((k) => r.month.used[k] >= allowance[k]));
      return { name: r.slug ?? r.record, used: r.month.used.runs, allowance: allowance?.runs ?? null, resets: dayWords(r.month.resets), waiting };
    });
  return {
    from: 'ledger',
    month,
    totals,
    projects: sortNamed([...projects.values()]),
    actions: sortNamed(actions),
    weeks: weeksOf([...days].map(([day, runs]) => ({ day, runs })), month, through),
    records,
  };
}

/** This month so far, UTC: the range the page asks the ledger for. */
export function monthRange(now: number): { month: string; from: string; to: string } {
  const today = new Date(now).toISOString().slice(0, 10);
  return { month: today.slice(0, 7), from: `${today.slice(0, 7)}-01`, to: today };
}

/** A month as a person says it: `2026-09` is September. */
export const monthWords = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

export type UsageRead = { ok: true; view: UsageView } | { ok: false; refusal: Refusal } | { ok: 'none' };

/**
 * `/usage`'s one read: the ledger first, then the record's own events.
 *
 * A 404 FROM THE LEDGER IS A HOST WITHOUT ONE, and so is no host at all; a 401 is a person not signed in
 * to one, and the record read after it decides whether there is a record here at all. Any other refusal
 * from either is the record's own sentence, and so is the record's 401 or dead network: those drew the
 * sample's month of 3 September, counted against projects nobody has, until DIRECTION 26.
 *
 * TWO BASES SINCE THE RECORD IS IN THE ADDRESS. `base` is the bare host, where `/account/usage` and `/auth/methods` are the
 * person's; `api` is where the record answers, `/app/<slug>` under a slug, so the events counted are the record on screen.
 */
export async function readUsage(io: Fetch, now: number, base = '', api: string = base): Promise<UsageRead> {
  const range = monthRange(now);
  /* NOBODY SIGNED IN IS NO LEDGER TO ASK. An open self-host, or a browser with no session, would only be told 401, and
     the browser logs that as an error; `/auth/methods` says so without one. A host that cannot say is asked as before. */
  if (!(await nobodySignedIn(io, base))) {
    const ledger = await send<AccountUsage>(io, `${base}/account/usage?from=${range.from}&to=${range.to}`);
    if (ledger.ok) return { ok: true, view: usageFromLedger(ledger.value, range.month, range.to) };
    if (!ledger.notFound && !ASK_THE_RECORD.has(ledger.refusal.code)) return { ok: false, refusal: ledger.refusal };
  }

  const events = await live(io, api).actions();
  if (events.ok) return { ok: true, view: usageFromActions(events.value, range.month, 'events', range.to) };
  if (events.refusal.code === 'ROUTE_UNKNOWN') return { ok: 'none' };
  return { ok: false, refusal: events.refusal };
}

/** Whether `/auth/methods` answers that nobody is signed in here. `false` when it cannot say. */
async function nobodySignedIn(io: Fetch, base: string): Promise<boolean> {
  const said = await send<{ me?: unknown }>(io, `${base}/auth/methods`);
  return said.ok && typeof said.value === 'object' && said.value !== null && said.value.me === null;
}

/** Counts as a person reads them in one row: `142 runs · 1,204 requests · 3.1 MB`, and failures when there are any. */
export const countsOf = (t: Totals): string =>
  [
    t.runs === 1 ? '1 run' : `${t.runs.toLocaleString('en-GB')} runs`,
    t.requests === 1 ? '1 request' : `${t.requests.toLocaleString('en-GB')} ${words.requests}`,
    fmtBytes(t.bytes),
    t.failures > 0 ? words.failures(t.failures) : '',
  ]
    .filter(Boolean)
    .join(' · ');

/* ── what an install calls ─────────────────────────────────────────────── */

/** The hosted plan's runs a month, per record (`research-scheduled-actions.md` §4.4). A self-host has none. */
export const HOSTED_RUNS = 15_000;

/** A month as a twelfth of a year, so an hourly action is 730 runs and twenty of them are 14,600. */
const MONTH_MS = (365 / 12) * 86_400_000;

/** The kernel's interval grammar (`pull.ts` `intervalMs`), where `m` is minutes. */
export function everyMs(every: string): number | null {
  const m = /^(\d{1,4})([smhdw])$/u.exec(every.trim());
  if (!m) return null;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2] as 's' | 'm' | 'h' | 'd' | 'w'];
  const ms = Number(m[1]) * unit;
  return ms > 0 ? ms : null;
}

/**
 * Runs a month from an interval, without the jitter.
 *
 * THE JITTER MOVES WHEN A RUN FIRES, NOT HOW MANY: it is a fixed offset per action (`jitterMs`), so the
 * gap between two runs stays the interval.
 */
export function runsAMonth(every: string): number | null {
  const ms = everyMs(every);
  return ms === null ? null : Math.round(MONTH_MS / ms);
}

/** One scheduled action a pack's install or update would add, as the diff's `calls_out` carries it. */
export type CallOut = {
  ingest: string;
  channel: Channel;
  host: string | null;
  every: string;
  /** The key by its vault label, never the key. */
  key: string | null;
  /** The record fields it sends, or `null` when the diff does not say. */
  sends: string[] | null;
  /** A call a rule runs, alone or beside its interval. Absent for one that runs only on its interval. */
  trigger?: 'rule' | 'both';
  /** The most rule-fired calls a day, when a rule runs it. */
  perDay?: number;
  /** The record's own sentence about a project action sending a key, which is approved with the line. */
  note?: string;
};

const CHANNELS: ReadonlySet<string> = new Set(['pull', 'call', 'poll']);

/**
 * `planPack`'s `calls_out`, or a proposal's `egress`, read defensively: the record's JSON, and a key it lacks
 * is left unsaid rather than guessed. `grant` (a plan) or `key` (a proposal) is the key's label. A call only a
 * rule runs has no interval, and is kept with its daily ceiling.
 */
export function callsOutOf(raw: unknown): CallOut[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  return raw.flatMap((c): CallOut[] => {
    if (typeof c !== 'object' || c === null) return [];
    const o = c as Record<string, unknown>;
    const ingest = str(o.ingest);
    const every = str(o.every);
    const trigger = o.trigger === 'rule' || o.trigger === 'both' ? o.trigger : null;
    if (!ingest || (!every && trigger !== 'rule')) return [];
    const channel = str(o.channel) ?? 'pull';
    const note = str(o.key_line);
    return [
      {
        ingest,
        channel: (CHANNELS.has(channel) ? channel : 'pull') as Channel,
        host: str(o.host),
        every: every ?? '',
        key: str(o.grant) ?? str(o.key),
        sends: Array.isArray(o.sends) ? o.sends.filter((s): s is string => typeof s === 'string') : null,
        ...(trigger === null ? {} : { trigger, perDay: typeof o.per_day === 'number' ? o.per_day : 100 }),
        ...(note === null ? {} : { note }),
      },
    ];
  });
}

/** A declared field as a person reads it: `invoices.amount_due` is "amount due". */
const fieldWords = (field: string): string => (field.split('.').pop() ?? field).replace(/_/gu, ' ');

const andList = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export const installWords = {
  heading: 'Calls other services',
  noHost: 'a host it does not name',
  sends: (fields: readonly string[]) => (fields.length === 0 ? 'sends no fields' : `sends ${andList(fields.map(fieldWords))}`),
  noKey: 'with no key',
  estimate: (runs: number, allowance: number) => {
    const pct = (runs / allowance) * 100;
    const share = pct > 0 && pct < 1 ? 'less than 1%' : `${Math.round(pct)}%`;
    const about = `About ${runs.toLocaleString('en-GB')} ${runs === 1 ? 'run' : 'runs'} a month`;
    return runs > allowance
      ? `${about}, more than this record's ${allowance.toLocaleString('en-GB')}, so some runs would wait until the next month.`
      : `${about}, ${share} of this record's ${allowance.toLocaleString('en-GB')}.`;
  },
  noLimit: (runs: number) => `About ${runs.toLocaleString('en-GB')} ${runs === 1 ? 'run' : 'runs'} a month, with no monthly limit on this record.`,
  byRule: (perDay: number) => `when a rule runs it, at most ${perDay.toLocaleString('en-GB')} a day`,
  /* THE ONE APPROVAL (`research-scheduled-actions.md` §5): said under the lines, before the press. */
  asksOnce: 'Installing asks you to approve these once, and none of them runs until you do.',
  acceptApproves: 'Accepting approves these, and they start running. Declining runs none of them.',
  /* `wouldAsk` SAID WHAT AN INSTALL ON THE SAMPLE "would" ask, under a toast that nothing was saved; `/packs` plans on the
     record now and draws the record's own lines (DIRECTION 26). */
} as const;

/** How often one runs: its interval, when a rule runs it, or both. */
const whenOf = (c: CallOut): string =>
  c.trigger === 'rule'
    ? installWords.byRule(c.perDay ?? 100)
    : c.trigger === 'both'
      ? `${often(c.every)} and ${installWords.byRule(c.perDay ?? 100)}`
      : often(c.every);

/** One line per action: what it does, the host, how often, the key by label, and the fields it sends. */
export const callLine = (c: CallOut): string =>
  [
    `${words.verb[c.channel]} ${c.host ?? installWords.noHost}`,
    whenOf(c),
    c.key ? words.key(c.key) : installWords.noKey,
    c.sends ? installWords.sends(c.sends) : '',
  ]
    .filter(Boolean)
    .join(', ');

/**
 * The sentence under the lines: runs a month these actions add, against the hosted allowance. `null`
 * when no action has an interval to count, because a guess is not an estimate.
 */
export function estimateOf(calls: readonly CallOut[], hosted: boolean): string | null {
  const counted = calls.map((c) => runsAMonth(c.every)).filter((n): n is number => n !== null);
  if (counted.length === 0) return null;
  const runs = counted.reduce((a, b) => a + b, 0);
  return hosted ? installWords.estimate(runs, HOSTED_RUNS) : installWords.noLimit(runs);
}
