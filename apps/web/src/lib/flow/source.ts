/**
 * Automations on the wire: the record's `automations` read, `automationRun`, `cancelRun`, and `propose` for a save
 * (`loop/research-shell-automations.md` §5 and §6, Brief E against Brief D's methods).
 *
 * THE RECORD OR ITS REFUSAL, as `record/actions.ts` does it for scheduled actions. A screen reads a `Source`, which is
 * the record over HTTP. With no record it drew the sample's four automations, and a flow drawn and "sent" there was
 * kept for the tab and filed nowhere; that went with DIRECTION 26, and no record is now the sentence for it.
 *
 * THE THREE READS AND WHAT EACH FALLS BACK TO.
 *
 *   · `automations` answers the list. A record with no such method yet (`ROUTE_UNKNOWN`, which is every record built
 *     before Brief D) draws no list; the canvas still opens, because saving goes through `propose`, which every record
 *     has. Any other refusal, `UNREACHABLE` and `UNAUTHORIZED` among them, is said.
 *   · `automationRun` and `cancelRun` are ADMIN and a browser session's. A refusal is the record's own sentence.
 *   · `propose` files the `change`.
 *
 * NOT THROUGH `@braindog/client`, FOR `actions.ts`'s REASON: the client refuses a method missing from its own route
 * table before sending anything, and "this build has no such read" and "there is no record here" are two answers this
 * screen draws differently. `send` is a copy of the one in `actions.ts`, which does not export it and is not this
 * brief's to change; the two are the same eighteen lines and say so here so that a fix to one is looked for in both.
 *
 * READ DEFENSIVELY. The `automations` answer was written in the same wave as this file (`packages/record/src/
 * automations.ts`), and this screen was first written against a guess at it that had a body on every listed row. The
 * record's list has none, and every row would have been dropped. So `rowOf` reads the record's keys by name, works out
 * from a body what the record left out, and leaves out only a row with no id.
 */

import { since } from 'braindog-render';

import { copy } from '../copy.ts';
import { pathOf, sayTrigger, triggerKind, triggerOfBody, words, type Body } from './flow.ts';

/* ── the shapes ─────────────────────────────────────────────────────────── */

export type Refusal = { code: string; fix: string; at?: string | undefined };
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export type RunState = 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

/** One step a run took, as `automation_step` keeps it. `answer` is at most 64 KB and never a secret. */
export type RunStep = { n: number; kind: string; state: 'done' | 'waiting' | 'failed' | 'skipped'; answer: string | null; at: string };

/** One run, as `automation_run` keeps it: pinned to the version it started under, with its sentence if it failed. */
export type RunRow = { id: string; state: RunState; started: string; finished: string | null; say: string | null; steps: RunStep[] };

/**
 * One automation, as the record's `automations` read answers it (`packages/record/src/automations.ts`).
 *
 * TWO ANSWERS, ONE SHAPE HERE. The list (`GET /api/automations`) carries the summary a row needs and NO BODY; the one
 * (`GET /api/automations?rule=<id>`) carries the body and its last ten runs. So `body` is `null` on a listed row and
 * the editor asks for the one before it opens anything, and the list draws from the summary alone.
 *
 * `id` IS THE BARE ID, `usd-eur`, which the record calls `rule`; `rule.usd-eur` is what a change names and what the
 * record calls `id`. `version` is what an edit is drawn from.
 */
export type AutomationRow = {
  id: string;
  name: string;
  version: number;
  /** The trigger's kind: written, arrival, every, metric, decided or manual. */
  trigger: string;
  path: 'inline' | 'run';
  register: string | null;
  enabled: boolean;
  next: string | null;
  last: { at: string; state: RunState; say: string | null } | null;
  month: { runs: number; failures: number } | null;
  body: Body | null;
  runs: RunRow[];
};

/** `propose`'s answer: the suggestion's id, or `null` when the record filed it without saying which. */
export type Filed = { id: string | null };

/** One row an inline rule's dry run walked: the row as the record names it, what it would get, and why not if nothing. */
export type TriedRow = { spoken: string; would: string[]; reason: string | null };

/**
 * What a body would do, as the record's `dryRun` answers it (`packages/record/src/index.ts`, `dryRun`).
 *
 * TWO ANSWERS, ONE SHAPE HERE, as with `AutomationRow`. Every body gets the record's own sentences (`path`, `trigger`,
 * `steps`, from `automations.ts` `said`). An inline body is also walked over its list by the kernel, which adds how many
 * rows it read and matched and the first twenty with what each would get; a run reads no row, so `matches` and `rows`
 * are `null` for it and `sample` is empty, and the screen says the sentences alone.
 */
export type Tried = { path: 'inline' | 'run'; trigger: string; steps: string[]; matches: number | null; rows: number | null; sample: TriedRow[] };

/* ── reading an answer that is being written in the same wave ────────────── */

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const STATES: ReadonlySet<string> = new Set(['pending', 'running', 'waiting', 'done', 'failed', 'cancelled']);
const STEP_STATES: ReadonlySet<string> = new Set(['done', 'waiting', 'failed', 'skipped']);

const bare = (id: string): string => (id.startsWith('rule.') ? id.slice('rule.'.length) : id);

function runOf(raw: unknown): RunRow | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const state = text(raw.state);
  const started = text(raw.started_at) ?? text(raw.started);
  if (!id || !state || !STATES.has(state) || !started) return null;
  const steps = Array.isArray(raw.steps)
    ? raw.steps.flatMap((s): RunStep[] =>
        isObject(s) && typeof s.n === 'number' && typeof s.kind === 'string' && typeof s.state === 'string' && STEP_STATES.has(s.state)
          ? [{ n: s.n, kind: s.kind, state: s.state as RunStep['state'], answer: text(s.answer), at: text(s.at) ?? started }]
          : [],
      )
    : [];
  return { id, state: state as RunState, started, finished: text(raw.finished_at) ?? text(raw.finished), say: text(raw.say), steps };
}

/**
 * One row of either answer. What the record said wins; what it left out is worked out from the body when there is one,
 * so a row the record summarised and a row it answered with its body read the same.
 */
export function rowOf(r: unknown): AutomationRow | null {
  if (!isObject(r)) return null;
  const id = text(r.rule) ?? (text(r.id) === null ? null : bare(text(r.id)!));
  if (!id) return null;
  const body = isObject(r.body) ? r.body : null;
  const runs = Array.isArray(r.runs) ? r.runs.map(runOf).filter((x): x is RunRow => x !== null) : [];
  const last =
    isObject(r.last) && text(r.last.at) && STATES.has(String(r.last.state))
      ? { at: text(r.last.at)!, state: r.last.state as RunState, say: text(r.last.say) }
      : runs[0]
        ? { at: runs[0].started, state: runs[0].state, say: runs[0].say }
        : null;
  /* `failed` IS THE RECORD'S WORD FOR IT, counted by the run's state; `failures` is the scheduled actions' ledger word. */
  const month =
    isObject(r.month) && typeof r.month.runs === 'number'
      ? { runs: r.month.runs, failures: typeof r.month.failed === 'number' ? r.month.failed : typeof r.month.failures === 'number' ? r.month.failures : 0 }
      : null;
  const named = text(r.name) ?? (body && typeof body.name === 'string' && body.name.trim() !== '' ? body.name : null);
  const path = r.path === 'inline' || r.path === 'run' ? r.path : body ? pathOf(body) : 'inline';
  return {
    id,
    name: named ?? id,
    version: typeof r.version === 'number' ? r.version : 0,
    trigger: text(r.trigger) ?? (body ? triggerKind(triggerOfBody(body)) : 'written'),
    path,
    register: text(r.register) ?? (body ? subjectOfBody(body) : null),
    enabled: typeof r.enabled === 'boolean' ? r.enabled : body?.enabled !== false,
    next: text(r.next) ?? text(r.next_at),
    last,
    month,
    body,
    runs,
  };
}

/** The list answer, read into rows. A row with no id is left out: there is nothing to open. */
export const rowsOf = (raw: unknown): AutomationRow[] => (Array.isArray(raw) ? raw.map(rowOf).filter((x): x is AutomationRow => x !== null) : []);

/**
 * A dry run's answer, read by name for `rowOf`'s reason. An answer with no sentences at all is `null`, because a trial
 * that says nothing is not something the screen can draw as an answer.
 */
export function triedOf(raw: unknown): Tried | null {
  if (!isObject(raw) || !Array.isArray(raw.steps) || typeof raw.trigger !== 'string') return null;
  const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sample = Array.isArray(raw.sample)
    ? raw.sample.flatMap((s): TriedRow[] =>
        isObject(s) && typeof s.spoken === 'string'
          ? [{ spoken: s.spoken, would: Array.isArray(s.would) ? s.would.filter((w): w is string => typeof w === 'string') : [], reason: text(s.reason) }]
          : [],
      )
    : [];
  return {
    path: raw.path === 'inline' ? 'inline' : 'run',
    trigger: raw.trigger,
    steps: raw.steps.filter((l): l is string => typeof l === 'string'),
    matches: count(raw.matches),
    rows: count(raw.rows),
    sample,
  };
}

/**
 * A step's answer as a person reads it: `rate 71.4`, not `{"rate": 71.4}`.
 *
 * THE RUNNER KEEPS IT AS TEXT, and usually as the JSON the step handed back (`automation_step.answer`, at most 64 KB),
 * so the Runs tab printed braces and quotes in the identifier face. An object is said as its keys and values, a list as
 * its items, and anything that does not parse is the text it was kept as. A value that is itself an object stays JSON,
 * because flattening it would say something the step did not.
 */
export function answerWords(answer: string): string {
  let v: unknown;
  try {
    v = JSON.parse(answer);
  } catch {
    return answer;
  }
  const one = (x: unknown): string => (typeof x === 'string' ? x : JSON.stringify(x));
  if (Array.isArray(v)) return v.map(one).join(', ');
  if (isObject(v)) return Object.entries(v).map(([k, x]) => `${k} ${one(x)}`).join(', ');
  return one(v);
}

/** The register a body's rows come from, as `flow-lint.ts`'s `subjectOf` reads it. */
function subjectOfBody(body: Body): string | null {
  if (typeof body.register === 'string') return body.register;
  const t = triggerOfBody(body);
  return 'written' in t ? t.written.register : null;
}

/**
 * What starts a listed automation, in one sentence, from the summary alone when there is no body: the list answer
 * carries the trigger's kind and its list, which is enough for a change or a button and not for how often a clock runs.
 */
export function rowTrigger(row: AutomationRow): string {
  if (row.body) return sayTrigger(triggerOfBody(row.body));
  if (row.trigger === 'written' && row.register) return sayTrigger({ written: { register: row.register } });
  if (row.trigger === 'arrival') return sayTrigger({ arrival: {} });
  if (row.trigger === 'manual') return sayTrigger({ manual: true });
  return words.kinds[row.trigger] ?? row.trigger;
}

/**
 * One automation's second line on the list: off, or its last run and its next, in the words `actions.ts` uses for a
 * scheduled action, so the two lists read alike. A failed last run carries the record's own sentence about why.
 */
export function rowLine(row: AutomationRow, now: number): string {
  if (!row.enabled) return words.off;
  const next = row.next ? words.nextRun(since(row.next, now)) : '';
  if (!row.last) return next || words.neverRun;
  const last = words.lastRun(since(row.last.at, now), words.runState[row.last.state] ?? row.last.state);
  const why = row.last.state === 'failed' && row.last.say ? ` ${row.last.say}` : '';
  return [last + why, next].filter(Boolean).join(' ');
}

/* ── the wire ───────────────────────────────────────────────────────────── */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/* A DEAD NETWORK SAID "The demo has no account", as `actions.ts` did, about a door that is gone. */
const unreachable = (): Answer<never> => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: copy.recordNotReached } });
const unauthorized = (): Answer<never> => ({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: copy.signInAgain } });

const isAnswer = (v: unknown): v is Answer<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && ((v as { ok: unknown }).ok === true ? 'value' in v : 'refusal' in v);

/** One request, read as the record's envelope. A copy of `actions.ts`'s `send`; the header says why. */
async function send<T>(io: Fetch, url: string, body?: Record<string, unknown>): Promise<Answer<T>> {
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
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined);
    return unauthorized();
  }
  const said: unknown = await res.json().catch(() => undefined);
  return (isAnswer(said) ? said : unreachable()) as Answer<T>;
}

export type Proposal = { question: string; body_kind: 'change'; body: Record<string, unknown> };

export type Source = {
  /** Every automation, summarised, with no bodies. */
  automations(): Promise<Answer<AutomationRow[]>>;
  /** One, with its body and its last ten runs. What the editor opens. */
  automation(rule: string): Promise<Answer<AutomationRow>>;
  run(rule: string): Promise<Answer<{ run: string }>>;
  cancel(run: string): Promise<Answer<{ run: string }>>;
  propose(p: Proposal): Promise<Answer<Filed>>;
  /** What a body would do, before it is sent anywhere. It writes nothing, on the record or here. */
  dryRun(body: Body): Promise<Answer<Tried>>;
};

export function live(io: Fetch, base = ''): Source {
  return {
    automations: async () => {
      const out = await send<unknown>(io, `${base}/api/automations`);
      return out.ok ? { ok: true, value: rowsOf(out.value) } : out;
    },
    /* A READ TAKES ITS ARGUMENTS IN THE QUERY (`packages/host/src/index.ts`, `takes`), and `rule` is `text`, so the
       bare id goes as it is and comes back as the one automation or the record's DECLARATION_UNKNOWN. */
    automation: async (rule) => {
      const out = await send<unknown>(io, `${base}/api/automations?${new URLSearchParams({ rule: bare(rule) }).toString()}`);
      if (!out.ok) return out;
      const row = rowOf(out.value);
      return row ? { ok: true, value: row } : unreachable();
    },
    run: (rule) => send<{ run: string }>(io, `${base}/api/automationRun`, { rule: bare(rule) }),
    cancel: (run) => send<{ run: string }>(io, `${base}/api/cancelRun`, { run }),
    propose: async (p) => {
      const out = await send<{ id?: unknown }>(io, `${base}/api/propose`, p);
      return out.ok ? { ok: true, value: { id: typeof out.value?.id === 'string' ? out.value.id : null } } : out;
    },
    /* A GET WITH THE BODY AS JSON IN `rule`. The route is `writes: false`, and its table types `rule` as `json`, so the
       GET branch of `serveApi` (`packages/host/src/index.ts`) `JSON.parse`s that one value and hands every other query
       value on as the text it was sent as. `automation` above sends its `rule` as a bare id because there it is `text`;
       the same name is a different type on the two routes, which is why this was read and not assumed. */
    dryRun: async (body) => {
      const out = await send<unknown>(io, `${base}/api/dryRun?${new URLSearchParams({ rule: JSON.stringify(body) }).toString()}`);
      if (!out.ok) return out;
      const tried = triedOf(out.value);
      return tried ? { ok: true, value: tried } : unreachable();
    },
  };
}

/** What a screen draws from the first read: the rows, no list at all, or the record's fix. */
export type Opened = { source: Source; first: Answer<AutomationRow[]>; absent: boolean };

/**
 * The record's automations, and whether it has the read at all.
 *
 * IT TOOK THE SAMPLE'S CLOCK AS A THIRD ARGUMENT, and a sample was kept for the tab so the list and the editor agreed
 * about a flow that had been filed nowhere. Nothing read it once the sample went, and no caller passes it now.
 */
export async function openAutomations(io: Fetch, base = ''): Promise<Opened> {
  const source = live(io, base);
  const first = await source.automations();
  return { source, first, absent: !first.ok && first.refusal.code === 'ROUTE_UNKNOWN' };
}
