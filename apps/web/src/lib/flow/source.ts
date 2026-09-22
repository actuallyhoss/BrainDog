/**
 * Automations on the wire: the record's `automations` read, `automationRun`, `cancelRun`, and `propose` for a save
 * (`loop/research-shell-automations.md` §5 and §6, Brief E against Brief D's methods).
 *
 * ONE SHAPE FOR EVERY RECORD, as `record/actions.ts` does it for scheduled actions. A screen reads a `Source`: the
 * record over HTTP when there is one, and the sample below when there is not, and the sample answers the way the
 * record does, so the canvas has one code path for each state it draws.
 *
 * THE THREE READS AND WHAT EACH FALLS BACK TO.
 *
 *   · `automations` answers the list. No record (`UNREACHABLE` or `UNAUTHORIZED`) draws the sample. A record with no
 *     such method yet (`ROUTE_UNKNOWN`, which is every record built before Brief D) draws no list, because a sample
 *     list on a real record would be a list of things that do not run; the canvas still opens, because saving goes
 *     through `propose`, which every record has.
 *   · `automationRun` and `cancelRun` are ADMIN and a browser session's. A refusal is the record's own sentence.
 *   · `propose` files the `change`. On the sample nothing is filed, and the screen says so rather than pretending.
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
 * `id` IS THE BARE ID, `gold-rate`, which the record calls `rule`; `rule.gold-rate` is what a change names and what the
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

/** `propose`'s answer: the suggestion's id, or `null` on the sample, where nothing is filed. */
export type Filed = { id: string | null };

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
 * so a row the record summarised and a row the sample built from a body read the same.
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

const unreachable = (): Answer<never> => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: copy.notOnDemo } });
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
  /** True while this tab is drawing the sample. */
  sample: boolean;
  /** Every automation, summarised, with no bodies. */
  automations(): Promise<Answer<AutomationRow[]>>;
  /** One, with its body and its last ten runs. What the editor opens. */
  automation(rule: string): Promise<Answer<AutomationRow>>;
  run(rule: string): Promise<Answer<{ run: string }>>;
  cancel(run: string): Promise<Answer<{ run: string }>>;
  propose(p: Proposal): Promise<Answer<Filed>>;
};

export function live(io: Fetch, base = ''): Source {
  return {
    sample: false,
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
  };
}

/** The two answers that mean there is no record here, the same two `actions.ts` and `packs.ts` fall back on. */
const SAMPLE_WHEN: ReadonlySet<string> = new Set(['UNREACHABLE', 'UNAUTHORIZED']);

/** What a screen draws from the first read: the rows, no list at all, or the record's fix. */
export type Opened = { source: Source; first: Answer<AutomationRow[]>; absent: boolean };

/**
 * THE SAMPLE IS KEPT FOR THE TAB, because the list and the editor are two routes and each opens its own source. Made
 * fresh on each, a flow drawn and "sent" in the editor was gone from the list one click later, which reads as the save
 * having failed rather than as a sample that writes nowhere.
 */
let kept: Source | null = null;

/** Which source this screen reads, decided by its first `automations` call. */
export async function openAutomations(io: Fetch, base = '', at?: () => number): Promise<Opened> {
  const source = live(io, base);
  const first = await source.automations();
  if (first.ok) return { source, first, absent: false };
  if (first.refusal.code === 'ROUTE_UNKNOWN') return { source, first, absent: true };
  if (!SAMPLE_WHEN.has(first.refusal.code)) return { source, first, absent: false };
  kept ??= sample(at);
  return { source: kept, first: await kept.automations(), absent: false };
}

/* ── the sample ─────────────────────────────────────────────────────────── */

const HOUR = 3_600_000;

/**
 * Four automations over the sample record's own lists, one for each trigger the canvas offers: a change (inline, the
 * kind every record already has), a clock that calls out and branches, an arrival that asks a person, and a button.
 *
 * WRITTEN IN THE RECORD'S OWN SHAPE AND READ THROUGH `rowOf`, so the sample cannot answer in a shape the record does
 * not: `rule` for the bare id, `started_at` on a run, `failed` in the month.
 */
export function SAMPLE_AUTOMATIONS(now: number): AutomationRow[] {
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const run = (id: string, ago: number, state: RunState, kinds: string[], say: string | null = null) => ({
    id,
    state,
    started_at: iso(-ago),
    finished_at: state === 'done' || state === 'failed' ? iso(-ago + 2_000) : null,
    say,
    steps: kinds.map((kind, n) => ({
      n,
      kind,
      state: state === 'failed' && n === kinds.length - 1 ? 'failed' : state === 'waiting' && n === kinds.length - 1 ? 'waiting' : 'done',
      answer: kind === 'call' ? '{"rate": 71.4}' : null,
      at: iso(-ago + n * 500),
    })),
  });
  return rowsOf([
    {
      rule: 'obligation-late',
      version: 3,
      body: {
        rule: 'obligation-late',
        name: 'Chase late payments',
        register: 'obligations',
        when: 'due before today, state is open',
        then: [{ tag: 'late' }, { notify: { say: '{{trigger.row.what}} is past due' } }],
        once_per: ['entry', 'due'],
      },
      last: { at: iso(-26 * HOUR), state: 'done', say: null },
      month: { runs: 4, failed: 0 },
    },
    {
      rule: 'gold-rate',
      version: 2,
      body: {
        rule: 'gold-rate',
        name: 'Gold rate',
        on: { every: '1h' },
        steps: [
          { call: { ingest: 'gold_rate', as: 'rate' } },
          { if: { field: 'rate', gt: 70 }, then: [{ notify: { say: 'Gold is {{vars.rate}} a gram' } }], else: [{ set_var: { name: 'quiet', to: 'yes' } }] },
        ],
      },
      next: iso(40 * 60_000),
      runs: [run('R3', 1 * HOUR, 'done', ['call', 'if', 'notify']), run('R2', 2 * HOUR, 'failed', ['call'], 'gold_rate did not answer, so the run stopped there.')],
      month: { runs: 518, failed: 3 },
    },
    {
      rule: 'shortcut-spend',
      version: 1,
      body: {
        rule: 'shortcut-spend',
        name: 'Spending from the phone',
        on: { arrival: { ingest: 'shortcut' } },
        steps: [
          { ask_person: { question: 'File {{trigger.arrival.body}} as spending?', options: ['File it', 'Leave it'], as: 'file', wait: '7d' } },
          { if: 'file is File it', then: [{ notify: { say: 'Filed the spending from the phone' } }] },
        ],
      },
      runs: [run('R1', 3 * HOUR, 'waiting', ['ask_person'])],
      month: { runs: 1, failed: 0 },
    },
    {
      rule: 'friday-review',
      version: 1,
      body: {
        rule: 'friday-review',
        name: 'Friday review',
        on: { manual: true },
        steps: [{ ask_spark: { question: 'What moved this week, in three lines?', as: 'summary' } }, { notify: { say: '{{vars.summary}}' } }],
      },
    },
  ]);
}

/**
 * The sample, in memory for this tab. A run, a cancel or a save changes the rows here and is written nowhere.
 *
 * THE LIST ANSWERS WITHOUT BODIES, AS THE RECORD'S DOES, so a screen that drew from a body the list never carries would
 * work on the sample and show nothing on a real record. Only `automation` hands one over.
 */
export function sample(at: () => number = () => Date.now()): Source {
  let rows = SAMPLE_AUTOMATIONS(at());
  let n = 10;
  const refuse = (code: string, fix: string, where: string): Answer<never> => ({ ok: false, refusal: { code, fix, at: where } });
  return {
    sample: true,
    automations: async () => ({ ok: true, value: rows.map((r) => ({ ...r, body: null, runs: [] })) }),
    automation: async (rule) => {
      const row = rows.find((r) => r.id === bare(rule));
      return row ? { ok: true, value: row } : refuse('DECLARATION_UNKNOWN', `There is no automation called rule.${bare(rule)}.`, 'rule');
    },
    run: async (rule) => {
      const row = rows.find((r) => r.id === bare(rule));
      if (!row) return refuse('DECLARATION_UNKNOWN', `There is no automation called rule.${bare(rule)}.`, 'rule');
      if (row.trigger !== 'manual')
        return refuse('DECLARATION_INVALID', `rule.${row.id} is started by ${row.trigger}, not by a button. Give it on: { manual: true }.`, 'on');
      const id = `R${(n += 1)}`;
      const started = new Date(at()).toISOString();
      rows = rows.map((r) => (r === row ? { ...r, runs: [{ id, state: 'pending', started, finished: null, say: null, steps: [] }, ...r.runs] } : r));
      return { ok: true, value: { run: id } };
    },
    cancel: async (id) => {
      const owner = rows.find((r) => r.runs.some((x) => x.id === id && (x.state === 'pending' || x.state === 'running' || x.state === 'waiting')));
      if (!owner) return refuse('OUT_OF_BOUNDS', `${id} has finished, so there is nothing to stop.`, 'run');
      rows = rows.map((r) =>
        r === owner ? { ...r, runs: r.runs.map((x) => (x.id === id ? { ...x, state: 'cancelled' as const, finished: new Date(at()).toISOString() } : x)) } : r,
      );
      return { ok: true, value: { run: id } };
    },
    /* NOTHING IS FILED, AND THE ROW IN THIS TAB TAKES THE BODY, so the list shows what was drawn when the person goes
       back to it. The screen says in words that nothing was sent. */
    propose: async (p) => {
      const to = isObject(p.body.to) ? p.body.to : null;
      const id = to && typeof to.id === 'string' ? bare(to.id) : null;
      const body = to && isObject(to.body) ? to.body : null;
      if (id && body) {
        const had = rows.find((r) => r.id === id);
        const made = rowOf({ rule: id, version: had ? had.version + 1 : 1, body })!;
        rows = had ? rows.map((r) => (r === had ? { ...made, runs: had.runs, last: had.last, month: had.month, next: had.next } : r)) : [...rows, made];
      }
      return { ok: true, value: { id: null } };
    },
  };
}
