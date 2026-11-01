/**
 * Scheduled actions on screen: a project's "Runs on" list and the account's usage page.
 *
 * THE RECORD OR ITS REFUSAL, as `packs.ts` does it. A screen reads a `Source`, which is the record over HTTP.
 * With no record it drew the sample's five actions, one of them paused with a Resume that changed only the tab;
 * that went with the sample, and no record is now the sentence for it.
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

import { bytes as fmtBytes, since, writeAmount } from 'braindog-render';

import { copy } from '../copy.ts';
import { humanize, titleOf } from './names.ts';
import { keptRead, wroteOutside } from '@braindog/client';
import type { RECONNECT_STATE, ReconnectState } from './keychain.ts';

/* ── the shapes ─────────────────────────────────────────────────────────── */

export type Refusal = { code: string; fix: string; at?: string | undefined };
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export type Channel = 'pull' | 'call' | 'poll';

/** What a run came to, as the kernel's `meter` writes it on the run's `pull` event. */
export type Outcome = 'ok' | 'changed' | 'unchanged' | 'paused' | 'failed' | 'refused' | 'dropped' | 'held';

/** The four counts a person reads, and run time when the ledger counted it. Failures are never limited. */
export type Totals = { runs: number; requests: number; bytes: number; failures: number; ms?: number };

/** The four meters an allowance holds, in the ledger's words. */
export type MeterKey = 'runs' | 'requests' | 'bytes' | 'ms';

/**
 * One scheduled action, as the record's `actions` read answers it.
 *
 * THE CONTRACT THIS SCREEN ASKS FOR ("each action's state,
 * last run, next run and counts from its own events"). The key is its Keychain label, never the key.
 */
export type ActionRow = {
  ingest: string;
  channel: Channel;
  /** The project it runs for, as its declaration holds it, or `null` for the whole record. */
  project: string | null;
  /** The row `project` names, found by the record: its id, its spoken id and its title. Absent from an older host. */
  project_row?: { id: string; spoken: string; title: string | null } | null;
  host: string | null;
  /** The list it files what it fetched in, or `null` when it files in none. Absent from an older host. */
  writes?: string | null;
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

/**
 * The Directory's ledger, as `GET /account/usage` answers: `@braindog/record/directory`'s `AccountUsage`, key for key.
 *
 * THE DIRECTORY'S SHAPE, WRITTEN OUT, because the web does not depend on `@braindog/record` and the graph gate refuses a
 * relative import across packages. It was this reader's own idea of the answer, and the two parted: Slash was read as
 * `included`, `used` and `packs` while the Directory answered `asks`, `neurons` and `days`, so `toLocaleString` ran on
 * nothing and `/usage` said the record could not be reached. `usage-contract.test.ts` now builds the answer with the
 * Directory's own code and runs this reader over it, so the day the two part again a test goes red, not his screen.
 *
 * TWO KEYS ARE WIDER THAN THE DIRECTORY'S, and the contract test names one. `slash` is optional, for a host a release
 * behind that answers without it, and its `cap` is never sent today: the allowance of asks is the record's own
 * `ask_cap`, which the Directory never reads. `extra` is optional for the same host a release behind.
 */
type LedgerTotals = Totals & { ms: number; held: number };
export type AccountUsage = {
  from: string;
  to: string;
  totals: LedgerTotals;
  records: {
    record: string;
    slug: string | null;
    /** One of the Directory's `PLANS`: `free`, `hosted`, `plus` or `selfhost`. */
    plan: string;
    closed: boolean;
    /** The day the record was made, where the host says it: `/usage` offers no month from before it. */
    since?: string;
    month: { month: string; used: LedgerTotals; allowance: { runs: number; requests: number; bytes: number; ms: number } | null; resets: string };
    totals: LedgerTotals;
    projects: ({ scope: string } & LedgerTotals)[];
    actions: ({ scope: string; action: string } & LedgerTotals)[];
    days: ({ day: string } & LedgerTotals)[];
    /** The deliveries and arrivals over the range, by action: counted, and in none of the totals above. `/usage` reads them. */
    counted: ({ action: string } & LedgerTotals)[];
    /**
     * Slash's asks over the range and the neurons the model spent on them, by day: counted, and in none of the totals
     * above. `cap` is the month's allowance of asks, which no host sends yet.
     */
    slash?: { asks: number; neurons: number; days: { day: string; asks: number; neurons: number }[]; cap?: number | null };
    /**
     * The month's extra usage past the allowance (the Directory's `ExtraUsage`), `null` on a plan that sells none. `on`
     * is whether a cap stands now; `cents` is what the month came to, in cents of the plans' currency, never past the
     * highest cap that stood in it.
     */
    extra?: { on: boolean; cap_cents: number; cents: number; reported_cents: number; month: string; month_cap_cents: number } | null;
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
  /* A RESUME IS A WRITE PAST THE CLIENT: the reads it kept go (`wroteOutside`). */
  if (body) wroteOutside();
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
    /* KEPT BY THE VERSION (`keptRead`), so a project opened again does not wait on its actions at the same version. */
    actions: () => keptRead(base, 'actions', () => send<ActionRow[]>(io, `${base}/api/actions`)),
    resume: (ingest) => send<Resumed>(io, `${base}/api/resumeAction`, { ingest }),
  };
}

/** What a screen draws from the first read: the rows, no list at all, or the record's fix. */
export type Opened = { source: Source; first: Answer<ActionRow[]>; absent: boolean };

/**
 * The record's actions, and whether it has the read at all.
 *
 * IT TOOK THE SAMPLE'S CLOCK AS A THIRD ARGUMENT, which nothing read once the sample went, and no caller passes it now.
 */
export async function openActions(io: Fetch, base = ''): Promise<Opened> {
  const source = live(io, base);
  const first = await source.actions();
  return { source, first, absent: !first.ok && first.refusal.code === 'ROUTE_UNKNOWN' };
}

/* ── one row, said ──────────────────────────────────────────────────────── */

export const words = {
  heading: 'Scheduled actions',
  everywhere: 'For every project',
  resume: 'Resume',
  resumed: (name: string) => `${name} runs again now.`,
  seeUsage: 'See usage',
  runs: (n: number) => (n === 1 ? '1 run this month' : `${n.toLocaleString('en-GB')} runs this month`),
  verb: { pull: 'Fetches from', call: 'Calls', poll: 'Watches' } as Record<Channel, string>,
  key: (label: string) => `with the key "${label}"`,
  /* The four states of a scheduled action, one calm sentence each. No red: paused is `warn`. */
  live: (last: string, next: string | null) => (next ? `Last ran ${last}. Next run ${next}.` : `Last ran ${last}.`),
  never: (next: string | null) => (next ? `Not run yet. First run ${next}.` : 'Not run yet.'),
  retrying: (host: string, next: string | null) =>
    next ? `${host} did not answer the last run. It tries again ${next}, and there is nothing to do.` : `${host} did not answer the last run. It tries again on its own.`,
  notWritten: 'Nothing was saved from the last run. The next run asks again.',
  refusedKey: (host: string, key: string) => `Paused. ${host} did not accept the key "${key}". Reconnect the key and it runs again.`,
  missingKey: (key: string) => `Paused. The key "${key}" is not in the Keychain. Add it and it runs again.`,
  reconnect: 'Reconnect key',
  addTheKey: 'Add the key',
  paused: 'Paused. It runs again when you resume it.',
  waitingFallback: 'Waiting for next month. This month\'s allowance is used up.',
  /* The usage page. */
  usage: 'Usage',
  /* WHAT A DRAW FAULT'S DETAILS SAY, in words and never the thrown message, which named a field or a line of code to a
     person who can do nothing with either. The first is an answer missing a part, the second the page itself. */
  usageShape: "This month's answer was missing a part this page needs, so the page stopped before drawing it.",
  usageThrew: "A part of this page stopped while drawing the month. The fault is in the app, not in your BrainDog.",
  byProject: 'By project',
  byAction: 'By action',
  overTime: 'Runs by week',
  records: 'Records',
  requests: 'requests',
  failures: (n: number) => (n === 1 ? '1 failure' : `${n.toLocaleString('en-GB')} failures`),
  noUsage: 'Nothing has run this month',
  noUsageIn: (month: string) => `Nothing ran in ${month}`,
  noLedger: 'This BrainDog does not report usage yet',
  /* THE LIMIT THAT HELD IT, NAMED. This said "this month's runs" whichever of the four meters had run out, so a record
     held on its fetched data was told to look at a count that was nowhere near its limit. */
  waitingUntil: (resets: string, noun: string) => `Actions are waiting until ${resets}, because this month's ${noun} is used up.`,
  noLimit: 'Counted, with no monthly limit.',
  week: (from: string, to: string) => (from === to ? from : `${from} to ${to}`),
  /* The four meters, each "Runs 1,204 of 15,000" and one sentence under its bar. */
  meterName: { runs: 'Runs', requests: 'Requests', bytes: 'Data fetched', ms: 'Run time' } as Record<MeterKey, string>,
  meterNoun: { runs: 'runs', requests: 'requests', bytes: 'fetched data', ms: 'run time' } as Record<MeterKey, string>,
  meterLine: (name: string, used: string, allowance: string) => `${name} ${used} of ${allowance}`,
  meterFree: (share: string, resets: string) => `${share} used. It starts again on ${resets}.`,
  meterNear: (share: string, resets: string) => `${share} used. At the limit, actions wait until ${resets}.`,
  meterFull: (resets: string) => `Used up. Actions wait until ${resets}.`,
  meterPast: (share: string) => `${share} of the month's allowance.`,
  binding: (noun: string) => `The limit you are nearest is your ${noun}.`,
  /* A MONTH FAR FROM EVERY LIMIT IS SAID SO, never "the limit you are nearest is your runs" at 1 of 1,000 (E9). */
  withinAll: 'Well within every limit this month.',
  /* UNDER AN HOUR IN MINUTES: "0 hours of 50 hours" stood beside "<1%" on a month that ran. */
  hours: (n: number) =>
    n > 0 && n * 60 < 1
      ? 'under a minute'
      : n > 0 && n < 1
        ? Math.round(n * 60) === 1
          ? '1 minute'
          : `${Math.round(n * 60)} minutes`
        : n === 1
          ? '1 hour'
          : `${n.toLocaleString('en-GB', { maximumFractionDigits: n < 10 ? 1 : 0 })} hours`,
  /* The plan, what it allows, and what else the month holds. */
  planName: { free: 'Free', hosted: 'Cloud', plus: 'Cloud Plus' } as Record<string, string>,
  planLine: (plan: string, runs: string, requests: string, bytes: string, hours: string) =>
    `On ${plan}: ${runs} runs, ${requests} requests, ${bytes} fetched and ${hours} of run time a month.`,
  /* SLASH IN THE LEDGER'S OWN TERMS: asks and the neurons the model spent on them, and an allowance only when the answer
     carries one. It said "credits left" out of `included` and `packs`, two keys the Directory never sent. `when` is
     "this month" or "in September". A NEURON IS THE HOST'S UNIT AND NOBODY'S WORD, so it is said as the units of work the
     model did. */
  slashLine: (asks: number, neurons: number, cap: number | null, when: string) =>
    asks === 0
      ? `Slash was not asked anything ${when}${cap !== null ? `, of the ${cap.toLocaleString('en-GB')} questions a month allows` : ''}.`
      : `Slash was asked ${asks === 1 ? 'once' : `${asks.toLocaleString('en-GB')} times`} ${when}` +
        (cap !== null ? `, of the ${cap.toLocaleString('en-GB')} questions a month allows` : '') +
        (neurons > 0 ? `, and the model did ${neurons.toLocaleString('en-GB')} ${neurons === 1 ? 'unit' : 'units'} of work answering.` : '.'),
  thisMonth: 'this month',
  inMonth: (month: string) => `in ${month}`,
  /* EXTRA USAGE, THE RUNNING AMOUNT AND THE CAP: what the month has come to, which is what is charged. */
  extraLine: (cost: string, cap: string) => `Extra usage is on: ${cost} so far this month, of the ${cap} cap you set.`,
  extraOff: (cost: string, when: string) => `Extra usage came to ${cost} ${when}.`,
  meterExtra: (cap: string) => `Past the allowance. Extra usage carries on up to the ${cap} cap.`,
  waitingCap: (resets: string, cap: string) => `Actions are waiting until ${resets}, because extra usage reached the ${cap} cap.`,
  /* A member's page. The ledger is the owner's, and an empty one read as nothing having run. */
  notOwner: "Limits and plans are the owner's to see. These are this BrainDog's own runs.",
  notOwnerNone: "Usage is counted on the owner's account, so only the owner sees it here.",
  /* The month switcher and a project's slice. */
  months: 'Months',
  monthIn: (month: string) => `Usage in ${month}`,
  everywhereUsage: 'Everywhere',
  only: (name: string) => `Only ${name}`,
  allProjects: 'Show every project',
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
/** The navigation state "Reconnect key" travels with: the Keychain reads the key's name and the action to resume from it. */
export type ReconnectNav = Record<typeof RECONNECT_STATE, ReconnectState>;

/**
 * `reconnect` is where the key an action was paused on is put right, when that is why it paused: the address to open,
 * the button's word, and the state to open it with.
 */
export type Said = { line: string; tone: Tone; resume: boolean; usage: boolean; reconnect?: { href: string; label: string; state: ReconnectNav } };

/**
 * The Keychain, where a paused action's key is put right.
 *
 * NOTHING AFTER THE PATH. An address is kept in the browser's history and goes wherever a link is pasted, and a key's
 * name is not for either, so what the Keychain should open travels in the navigation's state (`reconnectState`). After a
 * reload the state is gone and the plain Keychain shows, which is right.
 */
export const reconnectHref = (): string => '/keychain';

/* THE KEYCHAIN'S OWN KEY, HELD EQUAL BY THE COMPILER AND NOT IMPORTED AS A VALUE: the app's frame reads this file, and the
   Keychain's reads are not for every screen to load. A different word in `keychain.ts` fails the typecheck on this line. */
const RECONNECT_KEY: typeof RECONNECT_STATE = 'keychainReconnect';

/** What the Keychain opens on: the key by the name its declaration gives it, and the action to resume once it is in. */
export const reconnectState = (key: string, ingest: string): ReconnectNav => ({ [RECONNECT_KEY]: { key, then: ingest } });

/**
 * Whether a press on the link is this tab's to follow with state. A middle press or one with a modifier opens a tab or
 * a window, which the browser does from the address alone, and that opens the plain Keychain.
 */
export const ownPress = (e: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;

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
    /* A PAUSE WITH NO RUN BEHIND IT IS A KEY THAT WAS NOT IN THE KEYCHAIN WHEN THE ACTION FIRED: the kernel pauses the row
       there and meters nothing, so `last` is empty or an older run. Nothing else pauses an action without a paused run. */
    const missing = !refused && Boolean(row.key) && (last?.outcome !== 'paused' || last.status === null);
    const why = refused ? words.refusedKey(host, row.key!) : missing ? words.missingKey(row.key!) : words.paused;
    const reconnect = refused || missing ? { href: reconnectHref(), label: refused ? words.reconnect : words.addTheKey, state: reconnectState(row.key!, row.ingest) } : undefined;
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

/** The project a page is drawn for, as `forProject` matches an action to it: its row as a person says it, and its title. */
export type ForProject = { spoken: string; title: string };

/**
 * A project's actions, its own first and then the ones for every project.
 *
 * MATCHED BY THE ROW, as the record resolves the project an action's declaration names (`listActions`,
 * `project_row`): a declaration holds a row id, which is no name, so matching it against the project's title found
 * nothing and an action declared for a project showed on no page. An action the record could not resolve,
 * or one from a host that does not resolve, is matched by what it holds: the spoken id, or the name case-blind,
 * because a declaration typed `kiln` and a project called Kiln are the same project to a person.
 *
 * `null` is no project: Settings, ingest lists every action as its own, none of them faint.
 */
export function forProject(rows: readonly ActionRow[], project: ForProject | null): { own: ActionRow[]; everywhere: ActionRow[] } {
  const name = (r: ActionRow) => r.ingest;
  const by = (a: ActionRow, b: ActionRow) => name(a).localeCompare(name(b));
  if (project === null) return { own: [...rows].sort(by), everywhere: [] };
  const want = project;
  const fold = (s: string) => s.trim().toLowerCase();
  const mine = (r: ActionRow): boolean => {
    if (r.project_row) return r.project_row.spoken === want.spoken;
    return r.project !== null && (r.project === want.spoken || fold(r.project) === fold(want.title));
  };
  return {
    own: rows.filter(mine).sort(by),
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
  /* RUN TIME ONLY WHERE IT WAS COUNTED: the record's own events carry none, and a zero would say it took no time. */
  if (from.ms !== undefined) into.ms = (into.ms ?? 0) + from.ms;
};

export type Named = { name: string; faint: boolean } & Totals;

/** One meter of an allowance, as the page draws it: "Runs 1,204 of 15,000", the bar's share, and one sentence. */
export type Meter = { key: MeterKey; line: string; said: string; share: number; binding: boolean };

/**
 * One record's month against its allowance. Only a ledger draws one; a plan with no limit has no meters.
 *
 * `used` AND `allowance` ARE THE RUNS, kept beside the four meters for the one-line summary. `slash` and `extra` are
 * sentences, `null` when the host does not count them or extra usage is off.
 */
export type Allowed = {
  name: string;
  /** The record's id, which a control that changes its extra usage names. */
  record: string;
  plan: string | null;
  planLine: string | null;
  used: number;
  allowance: number | null;
  resets: string;
  waiting: boolean;
  meters: Meter[];
  binding: string | null;
  slash: string | null;
  extra: string | null;
  /**
   * The month's extra usage as figures, `null` on a plan that sells none or a host that does not say: whether it is on,
   * the cap and what the month has come to, in cents of the plans' currency. `extra` stays the sentence.
   */
  extraUse: { on: boolean; cap: number; cents: number } | null;
  /**
   * Slash's asks over the month as the ledger counted them, the numbers behind `slash`: the asks, the neurons the model
   * spent on them, and the month's allowance of asks when the answer carries one (`null` when it does not, which is
   * every host today). `null` when the host does not count Slash at all. `slash` stays the sentence.
   */
  asks: { asks: number; neurons: number; cap: number | null } | null;
};

/**
 * One project's slice: its own actions under its name, the global ones under Everywhere. `key` tells groups apart
 * (`''` is Everywhere); `scope` is the project as its actions declare it, which is what `usageHref` links by.
 */
export type Group = { key: string; scope: string; name: string; faint: boolean; totals: Totals; actions: Named[] };

/** An action on its way into a group: the group's key, its scope and name, and the action's counts. */
type Scoped = { key: string; scope: string; name: string; named: Named };

export type UsageView = {
  from: 'ledger' | 'events';
  month: string;
  /** Whether `month` is the one running now. A past month is drawn against the allowance, and nothing waits in it. */
  current: boolean;
  /** `false` for a person who owns no record here: the ledger is the owner's, and a member is told so. */
  owner: boolean;
  totals: Totals;
  projects: Named[];
  actions: Named[];
  groups: Group[];
  weeks: { label: string; runs: number }[];
  /**
   * The month's runs by UTC day, oldest first, one entry per day that has any: what `weeks` folds, kept so a chart can
   * draw the days themselves. A day with no entry had no runs counted, and a day after `through` has not happened.
   */
  days: { day: string; runs: number }[];
  records: Allowed[];
  /**
   * How many times the record's automations fired in the last seven days, where the record and not a ledger is read. A
   * rule that files a row fires without a run, so none of it is in `totals`, and a month with no run of an action read
   * "Nothing has run" over automations that had fired all day.
   */
  fired?: number;
  /**
   * Whether a rule that acts as a change lands, and leaves no run, acted in the month on screen (finish F53), on a host
   * too old to send each rule's month (`month_fired`): its work is none of the runs counted here, so the sentence says
   * where its count is. A host that sends the month has every rule's work in `totals`, and this is never set.
   */
  acted?: boolean;
  /**
   * The month the earliest record in the view was made, `YYYY-MM`, so the switcher offers no month from before it
   * ("August" on a record made in September). `null` where the host does not say.
   */
  since?: string | null;
};

/**
 * What a ledger's names are to a person: an automation's `rule:<id>` its name, a script's id its title, and a
 * project's scope its title. Built from the record's own reads; a name it cannot find is said as the ledger holds it.
 */
export type Names = ReadonlyMap<string, string>;

const NO_NAMES: Names = new Map();

/* AN ACTION OR A PROJECT THE LEDGER HOLDS NO NAME FOR IS SAID IN WORDS, never as its slug: Usage read "weekly-review"
   (audit of 31 October, A19). */
const nameOf = (names: Names, raw: string): string => names.get(raw) ?? humanize(raw);

const isGlobal = (scope: string | null): boolean => scope === null || scope === '' || scope === 'global';

/**
 * Days, in weeks from the first of the month: 1 to 7, 8 to 14, and on. A month is five bars at most.
 *
 * NO BAR FOR A WEEK THAT HAS NOT STARTED. `through` is today; a week after it drew as zero runs, which
 * reads as nothing having run rather than nothing having happened yet.
 */
export function weeksOf(days: readonly ({ day: string } & Pick<Totals, 'runs'>)[], month: string, through?: string, made?: string | null): UsageView['weeks'] {
  const [y, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  const last = through?.slice(0, 7) === month ? Math.min(end, Number(through.slice(8, 10))) : end;
  /* NO WEEK BEFORE THE BRAINDOG WAS MADE (AH30): one made on the 31st charted "1 Oct to 7 Oct" and three more empty weeks.
     The first bar starts on the day it was made. */
  const born = made?.slice(0, 7) === month ? Number(made.slice(8, 10)) : 1;
  const out: UsageView['weeks'] = [];
  for (let first = 1; first <= last; first += 7) {
    const stop = Math.min(first + 6, end);
    if (stop < born) continue;
    const start = Math.max(first, born);
    const runs = days
      .filter((d) => d.day.slice(0, 7) === month && Number(d.day.slice(8, 10)) >= start && Number(d.day.slice(8, 10)) <= stop)
      .reduce((n, d) => n + d.runs, 0);
    const name = MONTHS[(m ?? 1) - 1]?.slice(0, 3) ?? '';
    out.push({ label: words.week(`${start} ${name}`, `${stop} ${name}`), runs });
  }
  return out;
}

/**
 * The month's days with runs, oldest first: the same days `weeksOf` folds, kept whole for a chart of the days.
 *
 * ONLY WHAT WAS COUNTED. A day outside `month`, or after `through`, is dropped, and a day with no runs is not made up:
 * a chart draws a missing day as nothing counted, which is what the ledger said.
 */
export function daysOf(days: readonly ({ day: string } & Pick<Totals, 'runs'>)[], month: string, through?: string): UsageView['days'] {
  const last = through?.slice(0, 7) === month ? through.slice(0, 10) : null;
  const by = new Map<string, number>();
  for (const d of days) {
    const day = d.day.slice(0, 10);
    if (day.slice(0, 7) !== month || (last !== null && day > last) || !(d.runs > 0)) continue;
    by.set(day, (by.get(day) ?? 0) + d.runs);
  }
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([day, runs]) => ({ day, runs }));
}

const sortNamed = (rows: Named[]): Named[] => rows.sort((a, b) => Number(a.faint) - Number(b.faint) || b.runs - a.runs || a.name.localeCompare(b.name));

/**
 * Actions grouped by project: each project's own under its name, the global ones last under Everywhere, faint.
 *
 * GROUPED BECAUSE A PROJECT'S "RUNS ON" LINKS TO ITS SLICE (`usageHref`), and a slice is a group: the question a
 * person brings from a project's page is what that project costs, not which action in the whole account is busiest.
 */
function groupsOf(rows: readonly Scoped[]): Group[] {
  const out = new Map<string, Group>();
  for (const { key, scope, name, named } of rows) {
    const global = key === '';
    const g = out.get(key) ?? { key, scope, name, faint: global, totals: zero(), actions: [] };
    add(g.totals, named);
    g.actions.push(named);
    out.set(key, g);
  }
  for (const g of out.values()) sortNamed(g.actions);
  return [...out.values()].sort((a, b) => Number(a.faint) - Number(b.faint) || b.totals.runs - a.totals.runs || a.name.localeCompare(b.name));
}

/**
 * An automation as the record's `automations` read answers it, as far as usage reads it: its name, where it applies and
 * what it ran this month (`month.runs`, of which `month.failed` failed).
 */
export type AutomationRuns = {
  /** The rule's ids, so a rule the record names by its id is said in words (`spokenName`). */
  id?: string;
  rule?: string;
  name: string;
  project?: string | null;
  month?: { runs?: number; failed?: number } | null;
  week?: number;
  /** `inline` for a rule that acts as a change lands and leaves no run; its whole count and when it last acted. */
  path?: 'inline' | 'run';
  fired?: number;
  last_at?: string | null;
  /** Times it ran or landed its work this calendar month, UTC (`rule_month`). Absent from an older host. */
  month_fired?: number;
};

/**
 * HOW MANY TIMES A RULE RAN THIS MONTH, the one count every screen says (sec-follow M5, audit 6f AF9): the record's
 * dated count (`month_fired`, the kernel's `rule_month`), which holds a rule's runs and the work an inline rule did as a
 * change landed alike. Only a host too old to send it is read from its runs (`month.runs`), which leave the inline out.
 */
export const ruleMonthOf = (a: { month_fired?: number | undefined; month?: { runs?: number } | null | undefined }): number =>
  typeof a.month_fired === 'number' ? a.month_fired : (a.month?.runs ?? 0);

/**
 * The record's own events, summed: what `/usage` draws when there is no ledger. Nothing about limits.
 *
 * AND WHAT ITS AUTOMATIONS RAN THIS MONTH, which the record counts on each. Without them a month of rules filing bank
 * lines read "Nothing has run in September" on a record whose automations had run all day; the hosts' ledger counts a
 * rule's run too (`rule:<id>`). The record keeps no day of an automation's run, so the days and weeks stay the actions'.
 */
export function usageFromActions(rows: readonly ActionRow[], month: string, from: 'events', through?: string, current = true, automations: readonly AutomationRuns[] = []): UsageView {
  const totals = zero();
  const projects = new Map<string, Named>();
  const days = new Map<string, number>();
  const actions: Named[] = [];
  const scoped: Scoped[] = [];
  for (const r of rows) {
    add(totals, r.month);
    const global = isGlobal(r.project);
    const key = global ? '' : r.project!;
    const title = global ? words.everywhereUsage : (r.project_row?.title ?? key);
    const p = projects.get(key) ?? { name: title, faint: global, ...zero() };
    add(p, r.month);
    projects.set(key, p);
    const named: Named = { name: humanize(r.ingest), faint: global, runs: r.month.runs, requests: r.month.requests, bytes: r.month.bytes, failures: r.month.failures };
    actions.push(named);
    scoped.push({ key, scope: key, name: title, named });
    for (const d of r.days) days.set(d.day, (days.get(d.day) ?? 0) + d.runs);
  }
  const titles = projectNames(rows);
  for (const a of automations) {
    /* EVERY RULE BY ITS MONTH'S COUNT, the inline ones too (AF9): Automations says the same figure. */
    const runs = ruleMonthOf(a);
    if (!(runs > 0)) continue;
    /* UNDER ITS PROJECT WHERE AN ACTION HERE NAMED IT, else under Everywhere: a project is never said by its id. */
    const title = a.project ? titles.get(a.project) : undefined;
    const key = title === undefined ? '' : a.project!;
    const name = title ?? words.everywhereUsage;
    /* IN WORDS, NEVER AN ID (AF10): a rule declared with no name of its own is read back as "weekly-review". */
    const named: Named = { name: ruleSpoken(a.name, [a.id, a.rule]), faint: key === '', runs, requests: 0, bytes: 0, failures: a.month?.failed ?? 0 };
    add(totals, named);
    const p = projects.get(key) ?? { name, faint: key === '', ...zero() };
    add(p, named);
    projects.set(key, p);
    actions.push(named);
    scoped.push({ key, scope: key, name, named });
  }
  return {
    from,
    month,
    current,
    owner: true,
    totals,
    projects: sortNamed([...projects.values()]),
    actions: sortNamed(actions),
    groups: groupsOf(scoped),
    weeks: weeksOf([...days].map(([day, runs]) => ({ day, runs })), month, through),
    days: daysOf([...days].map(([day, runs]) => ({ day, runs })), month, through),
    records: [],
  };
}

/** A project's scope, as an action's declaration holds it, to the project's title the record found for it. */
function projectNames(rows: readonly ActionRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) if (r.project !== null && r.project_row?.title) out.set(r.project, r.project_row.title);
  return out;
}

/**
 * The names the ledger's rows are said by, from the record's own reads: its automations, its scripts and its actions.
 * Each is optional, so a record that answers none of them leaves every name as the ledger holds it.
 */
export function namesOf(o: {
  automations?: readonly { id: string; rule?: string; name: string }[] | undefined;
  scripts?: readonly { id: string; script?: string; title: string }[] | undefined;
  actions?: readonly ActionRow[] | undefined;
}): Names {
  const out = new Map<string, string>(o.actions ? projectNames(o.actions) : []);
  for (const a of o.automations ?? []) {
    /* THE LEDGER NAMES A RULE'S RUN `rule:<id>` (`@braindog/host` `meteredOf`); both ids are kept, as either can be it. */
    const name = ruleSpoken(a.name, [a.id, a.rule]);
    out.set(`rule:${a.id}`, name);
    if (a.rule) out.set(`rule:${a.rule}`, name);
  }
  for (const s of o.scripts ?? []) {
    const title = spokenName(s.title, [s.id, s.script]);
    out.set(s.id, title);
    if (s.script) out.set(s.script, title);
  }
  return out;
}

/** A name written as an id: lower case words joined by hyphens, underscores or dots, as `weekly-review`. */
const SLUG = /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/u;

/**
 * A NAME AS A PERSON READS IT, where the record answered the id in its place: a rule declared with no name of its own
 * is read back by its id, and Usage said "weekly-review" (audit 2, B16). Said in words, as `nameOf` says a name the
 * ledger holds none for.
 */
function spokenName(name: string, ids: readonly (string | undefined)[]): string {
  const bare = name.trim();
  if (bare === '') return humanize(ids.find((id) => id !== undefined && id !== '') ?? '');
  const isId = ids.some((id) => id !== undefined && (id === bare || id.replace(/^rule\./u, '') === bare));
  return isId || SLUG.test(bare) ? humanize(bare) : bare;
}

/**
 * A RULE'S NAME AS AUTOMATIONS AND ACTIVITY SAY IT (AF9, AF10): where the record answered its id for a name, the
 * product's own name for a rule it ships (`titleOf`, "Categorise what cleared"), else the id in words, so Usage never
 * says "Txn categorise" for the rule the next screen calls something else.
 */
function ruleSpoken(name: string, ids: readonly (string | undefined)[]): string {
  const bare = name.trim();
  const id = ids.find((x) => x !== undefined && x !== '')?.replace(/^rule\./u, '');
  const isId = bare === '' || ids.some((x) => x !== undefined && (x === bare || x.replace(/^rule\./u, '') === bare));
  if (isId) return titleOf({ id: id ?? bare, kind: 'rule' });
  return SLUG.test(bare) ? titleOf({ id: bare, kind: 'rule' }) : bare;
}

/** An amount of one meter, as a person reads it. */
function amountOf(key: MeterKey, n: number): string {
  if (key === 'bytes') return fmtBytes(n);
  if (key === 'ms') return words.hours(n / 3_600_000);
  return n.toLocaleString('en-GB');
}

/** A share as a person says it: "Less than 1%" for a little, never "0%" for something. */
const shareWords = (share: number): string => (share > 0 && share < 0.01 ? 'Less than 1%' : `${Math.floor(share * 100)}%`);

/** A meter's share as the meters' own sentences say it, for a page that says it again: "82%", "Less than 1%". */
export const shareSaid = (share: number): string => shareWords(share);

/** How far into its allowance a meter is before the page says the limit is near: the Directory's `NOTICE_AT`. */
const NEAR = 0.8;

/**
 * A sum of money in minor units, written by the one writer (`writeAmount`), so it reads as every other amount on
 * every screen: the minor unit is the currency's own (three places for a dinar, none for a yen), never a hundredth.
 * `home` is the currency the screen drops the code of; the ledger's is the account's, which no record names, so the
 * page passes the record's home or nothing, and then every currency carries its code ("£12 GBP", "EGP 12").
 */
const money = (minor: number, currency: string, home: string | null): string =>
  writeAmount({ minor: Math.round(minor), currency }, home, 'read')?.text ?? `${currency} ${minor}`;

/** The currency every plan figure is in: the one table's `CURRENCY` (`packages/record/src/plans.ts`), which this web does not import. */
const PLAN_CURRENCY = 'USD';

/** Cents of the plans' currency as a person reads them, by the one writer. */
export const centsSaid = (cents: number, home: string | null = null): string => money(cents, PLAN_CURRENCY, home);

/** One record of the ledger, against its allowance: its four meters, the one nearest its limit, and its plan. */
function allowedOf(r: AccountUsage['records'][number], current: boolean, month: string, home: string | null): Allowed {
  const allowance = r.month.allowance;
  const used = current ? r.month.used : r.totals;
  const resets = dayWords(r.month.resets);
  const keys: MeterKey[] = ['runs', 'requests', 'bytes', 'ms'];
  const shares = allowance ? keys.map((k) => ({ k, share: allowance[k] > 0 ? used[k] / allowance[k] : 0 })) : [];
  const top = [...shares].sort((a, b) => b.share - a.share)[0];
  /* EXTRA USAGE ON THIS MONTH: past the allowance the record runs on, and waits only at the cap. */
  const x = r.extra ?? null;
  const extraOn = current && x !== null && x.on && x.cap_cents > 0;
  const capSaid = extraOn ? money(x.cap_cents, PLAN_CURRENCY, home) : '';
  const atCap = extraOn && x.cents >= x.cap_cents;
  const waiting = current && allowance !== null && (extraOn ? atCap : used.held > 0 || shares.some((s) => s.share >= 1));
  const meters: Meter[] = allowance
    ? shares.map(({ k, share }) => ({
        key: k,
        line: words.meterLine(words.meterName[k], amountOf(k, used[k]), amountOf(k, allowance[k])),
        said: !current
          ? words.meterPast(shareWords(share))
          : share >= 1 && extraOn && !atCap
            ? words.meterExtra(capSaid)
            : share >= 1
              ? words.meterFull(resets)
              : share >= NEAR
                ? words.meterNear(shareWords(share), resets)
                : words.meterFree(shareWords(share), resets),
        share: Math.min(1, share),
        binding: top !== undefined && top.k === k && top.share > 0,
      }))
    : [];
  const planName = Object.hasOwn(words.planName, r.plan) ? (words.planName[r.plan] ?? null) : null;
  const asks = r.slash ? { asks: r.slash.asks, neurons: r.slash.neurons, cap: typeof r.slash.cap === 'number' ? r.slash.cap : null } : null;
  const slash = asks ? words.slashLine(asks.asks, asks.neurons, asks.cap, current ? words.thisMonth : words.inMonth(monthWords(month))) : null;
  /* ONLY THIS MONTH'S FIGURE IS THE DIRECTORY'S: a month gone says nothing of extra usage rather than this month's amount. */
  const extra =
    !current || x === null
      ? null
      : extraOn
        ? words.extraLine(money(x.cents, PLAN_CURRENCY, home), capSaid)
        : x.cents > 0
          ? words.extraOff(money(x.cents, PLAN_CURRENCY, home), words.thisMonth)
          : null;
  return {
    name: r.slug ?? r.record,
    record: r.record,
    plan: planName,
    planLine:
      planName && allowance
        ? words.planLine(planName, amountOf('runs', allowance.runs), amountOf('requests', allowance.requests), amountOf('bytes', allowance.bytes), amountOf('ms', allowance.ms))
        : null,
    used: used.runs,
    allowance: allowance?.runs ?? null,
    resets,
    waiting,
    meters,
    binding: top !== undefined && top.share > 0 ? words.meterNoun[top.k] : null,
    slash,
    extra,
    extraUse: current && x !== null ? { on: x.on && x.cap_cents > 0, cap: x.cap_cents, cents: x.cents } : null,
    asks,
  };
}

/** The ledger, as one view over every record the person owns. */
export function usageFromLedger(said: AccountUsage, month: string, through?: string, names: Names = NO_NAMES, current = true, home: string | null = null): UsageView {
  const totals = zero();
  totals.ms = 0;
  const projects = new Map<string, Named>();
  const actions: Named[] = [];
  const scoped: Scoped[] = [];
  const days = new Map<string, number>();
  const many = said.records.length > 1;
  for (const r of said.records) {
    add(totals, r.totals);
    const prefix = many ? `${r.slug ?? r.record} · ` : '';
    for (const p of r.projects) {
      const global = isGlobal(p.scope);
      const key = `${r.record}:${global ? '' : p.scope}`;
      const into = projects.get(key) ?? { name: prefix + (global ? words.everywhereUsage : nameOf(names, p.scope)), faint: global, ...zero(), ms: 0 };
      add(into, p);
      projects.set(key, into);
    }
    for (const a of r.actions) {
      const global = isGlobal(a.scope);
      const named: Named = { name: prefix + nameOf(names, a.action), faint: global, runs: a.runs, requests: a.requests, bytes: a.bytes, failures: a.failures, ms: a.ms };
      actions.push(named);
      /* ONE RECORD'S PROJECT IS NOT ANOTHER'S, so a group is keyed by record and scope and named with the record's prefix;
         every record's global actions share Everywhere. */
      scoped.push(global ? { key: '', scope: '', name: words.everywhereUsage, named } : { key: `${r.record}:${a.scope}`, scope: a.scope, name: prefix + nameOf(names, a.scope), named });
    }
    for (const d of r.days) days.set(d.day, (days.get(d.day) ?? 0) + d.runs);
  }
  const records: Allowed[] = said.records.filter((r) => !r.closed).map((r) => allowedOf(r, current, month, home));
  return {
    from: 'ledger',
    month,
    current,
    owner: said.records.length > 0,
    totals,
    projects: sortNamed([...projects.values()]),
    actions: sortNamed(actions),
    groups: groupsOf(scoped),
    weeks: weeksOf([...days].map(([day, runs]) => ({ day, runs })), month, through, madeDay(said.records)),
    days: daysOf([...days].map(([day, runs]) => ({ day, runs })), month, through),
    records,
    since: sinceOf(said.records),
  };
}

/** The month the earliest of these records was made, or `null` where none says. */
function sinceOf(records: AccountUsage['records']): string | null {
  const made = records.map((r) => (typeof r.since === 'string' && /^\d{4}-\d{2}/u.test(r.since) ? r.since.slice(0, 7) : null));
  if (made.length === 0 || made.some((m) => m === null)) return null;
  return (made as string[]).reduce((a, b) => (b < a ? b : a));
}

/** The day the earliest of these records was made, `YYYY-MM-DD`, or `null` where none says it whole. */
function madeDay(records: AccountUsage['records']): string | null {
  const made = records.map((r) => (typeof r.since === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(r.since) ? r.since.slice(0, 10) : null));
  if (made.length === 0 || made.some((m) => m === null)) return null;
  return (made as string[]).reduce((a, b) => (b < a ? b : a));
}

/** A month the switcher may show: `YYYY-MM`. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;

/** The month `by` months from `month`, as `YYYY-MM`. */
export function shiftMonth(month: string, by: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + by;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/** How far back the switcher goes: the ledger answers a year at most (`directory.ts` `usage`). */
export const MONTHS_BACK = 12;

/**
 * The range the page asks the ledger for: this month so far, UTC, or a whole past month when `month` names one.
 *
 * A MONTH AHEAD OF THIS ONE, OR FURTHER BACK THAN `MONTHS_BACK`, OR NOT A MONTH, IS THIS ONE: the address is typed by
 * whoever typed it, and a month nobody could have used is not a question to send.
 */
export function monthRange(now: number, month?: string): { month: string; from: string; to: string } {
  const today = new Date(now).toISOString().slice(0, 10);
  const current = today.slice(0, 7);
  if (month !== undefined && MONTH.test(month) && month < current && month >= shiftMonth(current, -MONTHS_BACK)) {
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return { month, from: `${month}-01`, to: last };
  }
  return { month: current, from: `${current}-01`, to: today };
}

/** The months either side of `month` the switcher offers, `null` past either end. */
export function monthsBeside(now: number, month: string): { earlier: string | null; later: string | null } {
  const current = new Date(now).toISOString().slice(0, 7);
  const earlier = shiftMonth(month, -1);
  const later = shiftMonth(month, 1);
  return { earlier: earlier >= shiftMonth(current, -MONTHS_BACK) ? earlier : null, later: later <= current ? later : null };
}

/** Where a project's "Runs on" links: `/usage` showing that project's slice. `project` is its scope, as the action declares it. */
export const usageHref = (project: string): string => `/usage?project=${encodeURIComponent(project)}`;

/** A month as a person says it: `2026-09` is September. */
export const monthWords = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/**
 * What `/usage`'s read came to. `fault` is a read that answered and a month that could not be drawn from it, never a
 * refusal of the record's, because the record was reached and said what it said. It carries a refusal's shape
 * (`INTERNAL`, the code the host's crash answer carries, and a plain sentence as `fix`, which a screen folds under Details; the
 * thrown message goes to the console, never to the page) so a caller that treats every
 * answer short of a month alike, as Settings' bill does, reads it with no case of its own.
 */
export type UsageRead = { ok: true; view: UsageView } | { ok: false; refusal: Refusal } | { ok: 'none' } | { ok: 'fault'; refusal: Refusal };

/**
 * The month, drawn, or the fault that stopped it.
 *
 * A THROW HERE IS THIS SCREEN'S, NOT THE RECORD'S. Every request above it is `send`, which never throws, so whatever
 * escapes a builder is the reader misreading an answer it was given. It was caught by `read()` as a failed read and
 * drawn as "BrainDog could not reach this record", which is how a missing key looked like a dead line for a month.
 */
function drawn(build: () => UsageView): UsageRead {
  try {
    return { ok: true, view: build() };
  } catch (e) {
    console.error(e);
    return { ok: 'fault', refusal: { code: 'INTERNAL', fix: words.usageShape } };
  }
}

/**
 * `/usage`'s one read: the ledger first, then the record's own events.
 *
 * A 404 FROM THE LEDGER IS A HOST WITHOUT ONE, and so is no host at all; a 401 is a person not signed in
 * to one, and the record read after it decides whether there is a record here at all. Any other refusal
 * from either is the record's own sentence, and so is the record's 401 or dead network: those drew the
 * sample's month of 3 September, counted against projects nobody has, until the sample went.
 *
 * TWO BASES SINCE THE RECORD IS IN THE ADDRESS. `base` is the bare host, where `/account/usage` and `/auth/methods` are the
 * person's; `api` is where the record answers, `/<slug>` under a slug, so the events counted are the record on screen.
 * `home` is the record's home currency (`homeCurrency()`), whose code an amount of extra use then drops, as every screen does.
 */
export async function readUsage(io: Fetch, now: number, base = '', api: string = base, month?: string, home: string | null = null): Promise<UsageRead> {
  const range = monthRange(now, month);
  const current = range.to === new Date(now).toISOString().slice(0, 10);
  /* NOBODY SIGNED IN IS NO LEDGER TO ASK. An open self-host, or a browser with no session, would only be told 401, and
     the browser logs that as an error; `/auth/methods` says so without one. A host that cannot say is asked as before. */
  let member = false;
  if (!(await nobodySignedIn(io, base))) {
    const ledger = await send<AccountUsage>(io, `${base}/account/usage?from=${range.from}&to=${range.to}`);
    if (ledger.ok && ledger.value.records.length > 0) {
      /* THE NAMES, FROM THE RECORD ON SCREEN, asked beside each other and never waited on for an answer that failed:
         a name not found is said as the ledger holds it, which is what this page said before it asked. */
      const [automations, scripts, actions] = await Promise.all([
        send<{ id: string; rule?: string; name: string }[]>(io, `${api}/api/automations`),
        send<{ id: string; script?: string; title: string }[]>(io, `${api}/api/scripts`),
        live(io, api).actions(),
      ]);
      const names = namesOf({
        automations: automations.ok && Array.isArray(automations.value) ? automations.value : undefined,
        scripts: scripts.ok && Array.isArray(scripts.value) ? scripts.value : undefined,
        actions: actions.ok && Array.isArray(actions.value) ? actions.value : undefined,
      });
      return drawn(() => usageFromLedger(ledger.value, range.month, current ? range.to : undefined, names, current, home));
    }
    /* A LEDGER WITH NO RECORD IN IT IS A MEMBER'S, since usage is the owner's (`directory.ts` `usage`). It read "Nothing
       has run this month" over a record that ran all month; now the record's own runs are drawn under the sentence. */
    if (ledger.ok) member = true;
    else if (!ledger.notFound && !ASK_THE_RECORD.has(ledger.refusal.code)) return { ok: false, refusal: ledger.refusal };
  }

  const [events, automations] = await Promise.all([live(io, api).actions(), current ? send<AutomationRuns[]>(io, `${api}/api/automations`) : null]);
  if (events.ok) {
    /* THE RECORD'S EVENTS ARE THIS MONTH'S ONLY (`ActionRow.month`), so a past month read from them is a month with
       nothing to say, never this month's runs under last month's name. Its automations' counts are this month's too. */
    const autos = automations?.ok && Array.isArray(automations.value) ? automations.value : [];
    return drawn(() => {
      const fired = autos.reduce((n, a) => n + (typeof a.week === 'number' && a.week > 0 ? a.week : 0), 0);
      /* WHERE THE RECORD KEEPS EVERY RULE'S MONTH (`month_fired`, sec-follow M5), the inline rules are in the runs counted
         and nothing is left apart (AF9); only an older host's inline rules are, and the sentence says so. */
      const counted = autos.every((a) => typeof a.month_fired === 'number');
      const acted = !counted && autos.some((a) => a.path === 'inline' && (a.fired ?? 0) > 0 && typeof a.last_at === 'string' && a.last_at.slice(0, 7) === range.month);
      const view = {
        ...usageFromActions(current ? events.value : [], range.month, 'events', current ? range.to : undefined, current, autos),
        ...(fired > 0 ? { fired } : {}),
        ...(acted ? { acted } : {}),
      };
      return member ? { ...view, owner: false } : view;
    });
  }
  if (member) return { ok: true, view: usageFromLedger({ from: range.from, to: range.to, totals: { ...zero(), ms: 0, held: 0 }, records: [] }, range.month, undefined, NO_NAMES, current) };
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
    /* WHAT A ROW DID NOT DO IS NOT SAID: "1 run · 0 requests · 0 B" was two counts of nothing beside the one. */
    t.requests === 0 ? '' : t.requests === 1 ? '1 request' : `${t.requests.toLocaleString('en-GB')} ${words.requests}`,
    t.bytes > 0 ? fmtBytes(t.bytes) : '',
    /* RUN TIME WHERE THE LEDGER COUNTED ANY: it was never shown, and it is one of the four things a plan limits. */
    t.ms !== undefined && t.ms > 0 ? words.hours(t.ms / 3_600_000) : '',
    t.failures > 0 ? words.failures(t.failures) : '',
  ]
    .filter(Boolean)
    .join(' · ');

/* ── what an install calls ─────────────────────────────────────────────── */

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
  /** The key by its Keychain label, never the key. */
  key: string | null;
  /** The record fields it sends, or `null` when the diff does not say. */
  sends: string[] | null;
  /** A call a rule runs, alone or beside its interval. Absent for one that runs only on its interval. */
  trigger?: 'rule' | 'both';
  /** The most rule-fired calls a day, when a rule runs it. */
  perDay?: number;
  /** The record's own sentence about a project action sending a key, which is approved with the line. */
  note?: string;
  /** The plan's sentence for what it files, "Writes Numbers on Oxbow: revenue, customers, 3 more." (`writes_line`). */
  writes?: string;
  /** Its interval is the provider's own floor, the least it may run at (`at_floor`). */
  floor?: true;
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
    const writes = str(o.writes_line);
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
        ...(writes === null ? {} : { writes }),
        ...(o.at_floor === true ? { floor: true as const } : {}),
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
      ? `${about}, more than your monthly ${allowance.toLocaleString('en-GB')}, so some runs would wait until the next month.`
      : `${about}, ${share} of your monthly ${allowance.toLocaleString('en-GB')}.`;
  },
  noLimit: (runs: number) => `About ${runs.toLocaleString('en-GB')} ${runs === 1 ? 'run' : 'runs'} a month, with no monthly limit.`,
  counted: (runs: number) => `About ${runs.toLocaleString('en-GB')} ${runs === 1 ? 'run' : 'runs'} a month, counted against your monthly allowance.`,
  byRule: (perDay: number) => `when a rule runs it, at most ${perDay.toLocaleString('en-GB')} a day`,
  /* THE ONE APPROVAL: said under the lines, before the press. */
  asksOnce: 'Installing asks you to approve these once, and none of them runs until you do.',
  acceptApproves: 'Accepting approves these, and they start running. Declining runs none of them.',
  /* `wouldAsk` SAID WHAT AN INSTALL ON THE SAMPLE "would" ask, under a toast that nothing was saved; `/packs` plans on the
     record now and draws the record's own lines. */
} as const;

/** How often one runs: its interval, when a rule runs it, or both. */
const whenOf = (c: CallOut): string =>
  c.trigger === 'rule'
    ? installWords.byRule(c.perDay ?? 100)
    : c.trigger === 'both'
      ? `${often(c.every)} and ${installWords.byRule(c.perDay ?? 100)}`
      : c.floor
        ? `${often(c.every)}, the provider's minimum`
        : often(c.every);

/**
 * One line per action: what it does, the host, how often, the key by label, and the fields it sends. When the plan says
 * what it files, that sentence goes on a line under it, after a full stop, so it still reads as two sentences where the
 * line is drawn without breaks.
 */
export const callLine = (c: CallOut): string => {
  const line = [
    `${words.verb[c.channel]} ${c.host ?? installWords.noHost}`,
    whenOf(c),
    c.key ? words.key(c.key) : installWords.noKey,
    c.sends ? installWords.sends(c.sends) : '',
  ]
    .filter(Boolean)
    .join(', ');
  return c.writes ? `${line}.\n${c.writes}` : line;
};

/**
 * The sentence under the lines: runs a month these actions add, against the record's allowance. `null`
 * when no action has an interval to count, because a guess is not an estimate.
 *
 * `allowance` IS THE RUNS THE DIRECTORY ANSWERED (`GET /account/usage`, a record's `month.allowance.runs`), `true` a
 * hosted record whose allowance this screen has not read, and `false` a host with no limit. The figure was typed here as
 * `HOSTED_RUNS` beside the Directory's `ALLOWANCE`, two copies of one number that a plan change would have split; now
 * the only figure said is one the Directory said, and without one the sentence says the runs are counted, not how many.
 */
export function estimateOf(calls: readonly CallOut[], allowance: number | boolean): string | null {
  const counted = calls.map((c) => runsAMonth(c.every)).filter((n): n is number => n !== null);
  if (counted.length === 0) return null;
  const runs = counted.reduce((a, b) => a + b, 0);
  if (allowance === false) return installWords.noLimit(runs);
  return allowance === true || allowance <= 0 ? installWords.counted(runs) : installWords.estimate(runs, allowance);
}
