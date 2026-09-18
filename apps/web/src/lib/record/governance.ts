/**
 * `/decide` and `/decide/<id>` on a live record: the open suggestions `governance` answers, the decisions
 * beside them, the rows a `rowset` would change, and the `decide` call that answers one.
 *
 * PURE, SO `node --test` CAN IMPORT IT, for the reason `vault.ts` gives: the client is handed in, so
 * every branch is testable against an object literal, and the client stays out of the entry chunk.
 *
 * LIVE OR THE SAMPLE IS THE FIRST READ'S TO SAY. `UNREACHABLE` and `UNAUTHORIZED` mean there is no record
 * here (`noRecord`, as `/settings/agents` and `/vault` read it), and the screen draws its sample. Any other
 * refusal is a record that answered no, and its own sentence is what the screen shows.
 */

import { money } from 'braindog-render';

import { copy } from '../copy.ts';
import { callsOutOf, type CallOut } from './actions.ts';
import type { RowsetBody } from './data.ts';
import { noRecord } from './device.ts';
import type { Question } from './schema.ts';

type Refusal = { code: string; fix: string };
type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };
type Row = Record<string, unknown>;

/** The client methods these screens call, as `@braindog/client` names them. */
export type Governor = {
  boot(): Promise<Wire<{ waiting?: readonly { id: string; question?: string }[]; counts?: { decided?: number } }>>;
  governance(args: { register?: string; id?: string; status?: string; limit?: number; cursor?: string }): Promise<Wire<unknown>>;
  schema(register: string): Promise<Wire<unknown>>;
  get(register: string, seq: number): Promise<Wire<unknown>>;
  call(name: string, args?: Record<string, unknown>): Promise<Wire<unknown>>;
};

/** A register's declaration, with only the keys a diff reads. */
export type Decl = { title?: string; fields: readonly { id: string; type: string; label?: string }[] };

/** A row a proposal would update, as `get` answers it. */
export type Held = { id?: string; register?: string; seq: number | null; version: number; fields: Record<string, unknown> };

/** What a diff is drawn from: each named register's declaration and the rows it would change. */
export type Rows = { registers: Record<string, Decl>; rows: Record<string, Held[]> };

/** What an open suggestion is, as filed: its kind, its body as the record holds it, and who filed it. The queue groups by
    `by`, and a `change` or a `pattern` is previewed from `body` (`routes/decide/[id]/proposed.ts`). */
export type About = { kind: string; body: Row; by: string };

export type Queue = Rows & {
  open: Question[];
  decided: Question[];
  rowsets: Record<string, RowsetBody>;
  about?: Record<string, About>;
  /** Where the decisions below the ones read carry on, and how many there are in all. Absent on a queue read whole. */
  older?: Older;
};

/**
 * THE DECISIONS NOT READ YET. `cursor` is the id of the last decision read and `null` once there are no more; `total` is
 * every decision on the record, from `boot`, so a screen can say how many there are before it has them all. The
 * suggestions read so far are kept, so a decision on a later page is named by the option it chose.
 */
export type Older = { cursor: string | null; total: number; suggestions: Map<string, Row>; after: string | null; read: boolean };

/**
 * `closed` is a question no longer open: a decision, or a suggestion somebody has settled. `calls` is what an open
 * `change` would call out once accepted, from the `egress` the record worked out when it was filed.
 */
export type One = Rows & {
  question: Question | null;
  rowset: RowsetBody | undefined;
  closed: boolean;
  calls: CallOut[];
  about?: About;
  /** An arrangement's changed pages as they stand now, by declaration id, so the gate can say what each shows before and after. */
  pagesNow?: Record<string, Row>;
  /**
   * WHAT AN ACCEPTED ARRANGEMENT DID, as the record kept it on the decision, with the body it was read against. Drawn on
   * a reload and for every member, where it was once only in the tab that pressed accept.
   */
  applied?: { did: Row; body: Row };
};

/** What the record kept on a decision about what its arrangement did, with the question's body, or nothing. */
const keptApplied = (decision: Row | null | undefined, suggestion: Row | null | undefined): Pick<One, 'applied'> =>
  decision && isRow(decision.applied) && suggestion && isRow(suggestion.body) ? { applied: { did: decision.applied, body: suggestion.body } } : {};

export const words = {
  /* A settled suggestion whose decision this screen could not find among the ones it reads. */
  closed: (id: string) => `${id} is no longer open.`,
} as const;

/** Where a screen's rows came from. */
export type Read<T> = { from: 'live'; value: T } | { from: 'sample' } | { from: 'refused'; fix: string };

/** What a `decide` call came back with: done, or the sentence to show. */
export type Sent = { ok: true } | { ok: false; fix: string };

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * One open suggestion as the queue draws a question. The record has no cost and no rank for it, so the
 * rank is its place in the record's own order and the cost is empty. An `options` body offers its
 * options; every other kind is accepted or rejected, which are the two words `decide` takes for it.
 */
export function questionOf(row: Row, asked: string | undefined, rank: number): Question {
  const id = String(row.id);
  const body = isRow(row.body) ? row.body : {};
  const options =
    row.body_kind === 'options' && Array.isArray(body.options)
      ? body.options.filter((o): o is Row => isRow(o) && typeof o.id === 'string').map((o) => ({
          key: String(o.id),
          title: text(o.label) || String(o.id),
          body: text(o.because),
          ...(o.recommended === true ? { recommended: true } : {}),
        }))
      : [
          { key: 'accept', title: copy.acceptIt, body: '' },
          { key: 'reject', title: copy.rejectIt, body: '' },
        ];
  /* THE REASONING IS THE QUESTION'S, written by whoever opened it (`body.context`), and it is drawn above the options. */
  const context = text(body.context).trim();
  return { id, title: asked?.trim() || id, cost: '', rank, opened: text(row.opened_at), options, ...(context ? { context } : {}) };
}

/**
 * One decision row as the ledger draws it. `answer` is the option's id, so the options come from the
 * suggestion it settled, when that is known, and a screen names the option by its label.
 */
export function decisionOf(row: Row, settled?: Row): Question {
  const id = String(row.id);
  return {
    id,
    title: text(row.question) || id,
    cost: '',
    rank: 0,
    opened: text(row.ts),
    options: settled ? questionOf(settled, undefined, 0).options : [],
    decided: { option: text(row.answer), reason: text(row.reason), by: text(row.decided_by), at: text(row.ts) },
  };
}

/**
 * Which suggestion each decision settled, by decision id.
 *
 * THE RECORD SAYS, AND THIS READS IT. A decision row names the suggestion it settled (`suggestion`) and a
 * suggestion names the decision that settled it (`decision`), from the two events `decide` writes together.
 * This used to pair them by the option offered and the order they were opened, which two questions worded
 * alike and answered in the same instant defeat. A decision that names none, or names one this screen did
 * not read, has no suggestion here, and its option is drawn by its id.
 */
export function pairs(decisions: readonly Row[], suggestions: readonly Row[]): Map<string, Row> {
  const byId = new Map(suggestions.map((s) => [String(s.id), s]));
  const out = new Map<string, Row>();
  for (const d of decisions) {
    const s = typeof d.suggestion === 'string' ? byId.get(d.suggestion) : undefined;
    if (s) out.set(String(d.id), s);
  }
  return out;
}

const listed = (out: Wire<unknown>): Row[] => (out.ok && Array.isArray(out.value) ? out.value.filter(isRow) : []);

/** The most rows one `governance` read answers with. */
export const GOVERNANCE_PAGE = 200;
/** How many decisions Decide reads at a time. */
export const DECIDED_PAGE = 50;

/**
 * ONE PAGE OF A GOVERNANCE LIST, and where the next starts. The record answers a page no longer than `limit`, filled from
 * what the caller may see, so a page shorter than it is the last. A page whose last row is the cursor it was asked
 * with has gone nowhere, and is read as the last too, so a host that ignores the cursor cannot loop a screen.
 */
export async function governancePage(
  client: Pick<Governor, 'governance'>,
  args: { register?: string; status?: string },
  cursor: string | null,
  limit = GOVERNANCE_PAGE,
): Promise<{ ok: true; rows: Row[]; cursor: string | null } | { ok: false; out: Wire<unknown> }> {
  const out = await client.governance({ ...args, limit, ...(cursor ? { cursor } : {}) });
  if (!out.ok || !Array.isArray(out.value)) return { ok: false, out };
  const rows = out.value.filter(isRow);
  const last = rows.at(-1)?.id;
  const next = rows.length >= limit && typeof last === 'string' && last !== cursor ? last : null;
  return { ok: true, rows, cursor: next };
}

/** EVERY ROW OF A GOVERNANCE LIST, a page at a time: open questions past `boot`'s twenty, decisions past any one page. */
export async function everyGovernance(client: Pick<Governor, 'governance'>, args: { register?: string; status?: string }): Promise<Wire<Row[]>> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  do {
    const got = await governancePage(client, args, cursor);
    if (!got.ok) return got.out as Wire<Row[]>;
    rows.push(...got.rows);
    cursor = got.cursor;
  } while (cursor);
  return { ok: true, value: rows };
}

/** Read suggestions, a page at a time, until every one these decisions name is held or none are left. */
async function suggestionsFor(client: Governor, decisions: readonly Row[], older: Older): Promise<void> {
  const wanted = () => decisions.some((d) => typeof d.suggestion === 'string' && !older.suggestions.has(d.suggestion));
  while (wanted() && !(older.read && older.after === null)) {
    const got = await governancePage(client, { register: 'suggestion', status: 'all' }, older.after);
    older.read = true;
    if (!got.ok) {
      older.after = null;
      return;
    }
    for (const r of got.rows) older.suggestions.set(String(r.id), r);
    older.after = got.cursor;
  }
}

/**
 * THE NEXT PAGE OF DECISIONS, each named by the option it chose. `older` is the queue's, and it moves on: its cursor to
 * the last decision read, and the suggestions read so far kept for the page after.
 */
export async function olderDecisions(client: Governor, older: Older): Promise<Read<{ decided: Question[]; older: Older }>> {
  const got = await governancePage(client, { register: 'decision' }, older.cursor, DECIDED_PAGE);
  if (!got.ok) return missed(got.out);
  const next: Older = { ...older, suggestions: new Map(older.suggestions), cursor: got.cursor };
  await suggestionsFor(client, got.rows, next);
  const settled = pairs(got.rows, [...next.suggestions.values()]);
  return { from: 'live', value: { decided: got.rows.map((d) => decisionOf(d, settled.get(String(d.id)))), older: next } };
}

/** The one row a link names, or nothing when there is no link or the record does not give the row. */
async function linkedRow(client: Governor, register: 'suggestion' | 'decision', id: unknown): Promise<Row | undefined> {
  if (typeof id !== 'string' || id === '') return undefined;
  const got = await client.governance({ register, id });
  return got.ok && isRow(got.value) ? got.value : undefined;
}

/** The body of a `rowset` suggestion, or nothing. */
export const aboutOf = (row: Row): About => ({ kind: text(row.body_kind), body: isRow(row.body) ? row.body : {}, by: text(row.opened_by) });

export function rowsetOf(row: Row): RowsetBody | undefined {
  if (row.body_kind !== 'rowset' || !isRow(row.body)) return undefined;
  const { register, rows } = row.body;
  return typeof register === 'string' && Array.isArray(rows) ? { register, rows: rows.filter(isRow) } : undefined;
}

/**
 * A field's value as a diff shows it on a live record. The sample formats through `display`, which reads
 * the sample's declarations; this reads the record's.
 */
export function plainOf(registers: Readonly<Record<string, Decl>>) {
  return (register: string, field: string, value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null;
    const type = registers[register]?.fields.find((f) => f.id === field)?.type;
    if (type === 'bool') return value ? 'yes' : 'no';
    if (type === 'enum') return String(value).replace(/_/g, ' ');
    if (isRow(value)) return typeof value.amount === 'number' && typeof value.currency === 'string' ? money(value.amount, value.currency) : JSON.stringify(value);
    return String(value);
  };
}

const isDecl = (v: unknown): v is Decl => isRow(v) && Array.isArray(v.fields);
const isHeld = (v: unknown): v is Held =>
  isRow(v) && (typeof v.seq === 'number' || v.seq === null) && typeof v.version === 'number' && isRow(v.fields);

/**
 * The declarations and the rows the proposals would update. A row named by its spoken id is asked for
 * by the number that id ends in, and a row named by its internal id is asked for by that id, which
 * `get` reads the way it reads a spoken one. A row the record will not give back, or that is in
 * another register, draws nothing, which is what `updatesOf` does with it.
 */
export async function heldBy(client: Governor, bodies: readonly RowsetBody[]): Promise<Rows> {
  const registers: Record<string, Decl> = {};
  const rows: Record<string, Held[]> = {};
  for (const body of bodies) {
    if (!(body.register in registers)) {
      const decl = await client.schema(body.register);
      if (decl.ok && isDecl(decl.value)) registers[body.register] = decl.value;
    }
    for (const r of body.rows) {
      if (typeof r.at !== 'string' || r.at === '') continue;
      const seq = /^(?:[a-z_]+#|[A-Z]+)(\d+)$/u.exec(r.at)?.[1];
      const got = seq === undefined ? await client.call('get', { spoken: r.at }) : await client.get(body.register, Number(seq));
      if (got.ok && isHeld(got.value) && (got.value.register ?? body.register) === body.register) (rows[body.register] ??= []).push(got.value);
    }
  }
  return { registers, rows };
}

/**
 * THE PAGES AN ARRANGEMENT CHANGES, AS THEY ARE NOW, read through `arrangement` with the page's slug. A page the record
 * will not give (a new one, or one this reader cannot open) is left out, and the gate draws only what it will show.
 */
export async function pagesStanding(client: Governor, pages: unknown): Promise<Record<string, Row>> {
  const out: Record<string, Row> = {};
  for (const p of Array.isArray(pages) ? pages.filter(isRow) : []) {
    if (p.was === null || p.was === undefined || typeof p.id !== 'string') continue;
    const got = await client.call('arrangement', { page: p.id.replace(/^page\./u, '') });
    if (got.ok && isRow(got.value) && isRow(got.value.body)) out[p.id] = got.value.body;
  }
  return out;
}

/** A read that did not answer: no record here, or the record's own sentence. */
function missed(out: Wire<unknown>): Read<never> {
  if ('refusal' in out) return noRecord(out.refusal.code) ? { from: 'sample' } : { from: 'refused', fix: out.refusal.fix };
  return { from: 'refused', fix: copy.changedSince };
}

const questionsAsked = (booted: Awaited<ReturnType<Governor['boot']>> | null): Map<string, string | undefined> =>
  new Map((booted?.ok ? (booted.value.waiting ?? []) : []).map((w) => [w.id, w.question]));

/** The queue: the open suggestions, the decisions with their options, and the rows the open ones would change. */
export async function readQueue(client: Governor): Promise<Read<Queue>> {
  const [open, booted] = await Promise.all([everyGovernance(client, { status: 'open' }), client.boot()]);
  if (!open.ok) return missed(open);
  const asked = questionsAsked(booted);
  const rows = open.value;
  const total = booted.ok ? booted.value.counts?.decided : undefined;
  const first = await olderDecisions(client, { cursor: null, total: 0, suggestions: new Map(), after: null, read: false });
  const decided = first.from === 'live' ? first.value : { decided: [], older: null };
  const rowsets: Record<string, RowsetBody> = {};
  for (const r of rows) {
    const body = rowsetOf(r);
    if (body) rowsets[String(r.id)] = body;
  }
  return {
    from: 'live',
    value: {
      open: rows.map((r, i) => questionOf(r, asked.get(String(r.id)) || text(r.question), i + 1)),
      decided: decided.decided,
      ...(decided.older ? { older: { ...decided.older, total: Math.max(total ?? 0, decided.decided.length) } } : {}),
      rowsets,
      about: Object.fromEntries(rows.map((r) => [String(r.id), aboutOf(r)])),
      ...(await heldBy(client, Object.values(rowsets))),
    },
  };
}

/**
 * THE DECISIONS ALREADY ASKED FOR SURVIVE A SECOND READ OF THE QUEUE.
 *
 * `readQueue` answers the newest `DECIDED_PAGE` decisions and no more, so a reader who had pressed for older ones and
 * then hit a conflict watched the ledger fold back to fifty and lost their place. The fresh page leads, because it
 * holds whatever was just decided; every older decision the reader had already paged in follows, in the order it was
 * read, and paging carries on from where they had got to rather than from the top.
 */
export function keepDecided(had: Queue | null | undefined, fresh: Queue): Queue {
  const kept = had?.decided ?? [];
  if (kept.length === 0) return fresh;
  const fresher = new Set(fresh.decided.map((d) => d.id));
  const decided = [...fresh.decided, ...kept.filter((d) => !fresher.has(d.id))];
  if (!had?.older || !fresh.older) return { ...fresh, decided };
  /* The reader's own cursor and the suggestions read for it, which are further along than a first read's. */
  const older: Older = {
    ...had.older,
    suggestions: new Map([...fresh.older.suggestions, ...had.older.suggestions]),
    total: Math.max(fresh.older.total, decided.length),
  };
  return { ...fresh, decided, older };
}

/**
 * One question by id: a suggestion `SG<n>`, or a decision `D<n>`. A row the record does not give is `null`.
 *
 * A SUGGESTION NO LONGER OPEN IS DRAWN SETTLED: what was decided, by whom, when and why, from the
 * decision that settled it, under the question that decision kept. Its rows are not read, because
 * a diff against rows the decision has already written would show nothing, or something else.
 */
export async function readOne(client: Governor, id: string): Promise<Read<One>> {
  const decision = /^D\d+$/u.test(id);
  const [got, booted] = await Promise.all([
    client.governance({ register: decision ? 'decision' : 'suggestion', id }),
    decision ? null : client.boot(),
  ]);
  if (!got.ok) return missed(got);
  if (!isRow(got.value)) return { from: 'live', value: { question: null, rowset: undefined, registers: {}, rows: {}, closed: false, calls: [] } };
  const row = got.value;

  if (decision) {
    const settled = await linkedRow(client, 'suggestion', row.suggestion);
    return { from: 'live', value: { question: decisionOf(row, settled), rowset: undefined, registers: {}, rows: {}, closed: true, calls: [], ...keptApplied(row, settled) } };
  }

  const drawn = questionOf(row, questionsAsked(booted).get(id), 1);
  if (row.status === 'open') {
    const rowset = rowsetOf(row);
    const calls = callsOutOf(isRow(row.body) ? row.body.egress : undefined);
    const pagesNow = row.body_kind === 'arrange' && isRow(row.body) ? await pagesStanding(client, row.body.pages) : {};
    return {
      from: 'live',
      value: { question: drawn, rowset, ...(await heldBy(client, rowset ? [rowset] : [])), closed: false, calls, about: aboutOf(row), pagesNow },
    };
  }
  const by = await linkedRow(client, 'decision', row.decision);
  const decided = by ? decisionOf(by).decided : undefined;
  const question = by ? { ...drawn, title: text(by.question) || id, ...(decided ? { decided } : {}) } : drawn;
  return { from: 'live', value: { question, rowset: undefined, registers: {}, rows: {}, closed: true, calls: [], ...keptApplied(by, row) } };
}

const sentOf = (out: Wire<unknown>): Sent =>
  out.ok ? { ok: true } : { ok: false, fix: 'refusal' in out ? out.refusal.fix : copy.changedSince };

/** Answer one, with the reason `decide` requires. An empty reason is not sent. */
export async function answer(client: Governor, id: string, option: string, reason: string): Promise<Sent> {
  const why = reason.trim();
  if (why === '') return { ok: false, fix: copy.reasonRequired };
  return sentOf(await client.call('decide', { id, decide: { option, reason: why } }));
}

/** Park one until a day, with why it can wait. */
export async function park(client: Governor, id: string, until: string, why: string): Promise<Sent> {
  if (why.trim() === '' || until === '') return { ok: false, fix: copy.reasonRequired };
  return sentOf(await client.call('decide', { id, defer: { until, why: why.trim() } }));
}
