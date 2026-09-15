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
  boot(): Promise<Wire<{ waiting?: readonly { id: string; question?: string }[] }>>;
  governance(args: { register?: string; id?: string; status?: string; limit?: number }): Promise<Wire<unknown>>;
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

export type Queue = Rows & { open: Question[]; decided: Question[]; rowsets: Record<string, RowsetBody> };

/**
 * `closed` is a question no longer open: a decision, or a suggestion somebody has settled. `calls` is what an open
 * `change` would call out once accepted, from the `egress` the record worked out when it was filed.
 */
export type One = Rows & { question: Question | null; rowset: RowsetBody | undefined; closed: boolean; calls: CallOut[] };

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
  return { id, title: asked?.trim() || id, cost: '', rank, opened: text(row.opened_at), options };
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
 * THE RECORD DOES NOT SAY. A decision row keeps the question's words and the option's id, and a
 * suggestion row keeps neither its question nor its decision, so the pair is read from what both do
 * keep: a suggestion no longer open, opened before the decision, that offers the option it recorded.
 * Oldest decision first, each suggestion taken once, and a suggestion named as the question or an
 * `options` body naming that option before an accept or a reject, which any proposal offers.
 */
export function pairs(decisions: readonly Row[], suggestions: readonly Row[]): Map<string, Row> {
  const out = new Map<string, Row>();
  const taken = new Set<string>();
  const by = (key: string) => (a: Row, b: Row) => (text(a[key]) < text(b[key]) ? -1 : text(a[key]) > text(b[key]) ? 1 : 0);
  /* The record lists newest first, so reversed, a tie on the instant keeps the order they were filed in. */
  const settled = [...suggestions].reverse().filter((s) => s.status !== 'open').sort(by('opened_at'));
  for (const d of [...decisions].reverse().sort(by('ts'))) {
    const answer = text(d.answer);
    const fits = settled.filter(
      (s) => !taken.has(String(s.id)) && text(s.opened_at) <= text(d.ts) && questionOf(s, undefined, 0).options.some((o) => o.key === answer),
    );
    const s = fits.find((f) => String(f.id) === text(d.question)) ?? fits.find((f) => f.body_kind === 'options') ?? fits[0];
    if (!s) continue;
    taken.add(String(s.id));
    out.set(String(d.id), s);
  }
  return out;
}

const listed = (out: Wire<unknown>): Row[] => (out.ok && Array.isArray(out.value) ? out.value.filter(isRow) : []);

/** Every suggestion and every decision this screen reads, for `pairs`. */
async function everything(client: Governor): Promise<{ suggestions: Row[]; decisions: Row[] }> {
  const [suggestions, decisions] = await Promise.all([
    client.governance({ register: 'suggestion', status: 'all', limit: 200 }),
    client.governance({ register: 'decision', limit: 200 }),
  ]);
  return { suggestions: listed(suggestions), decisions: listed(decisions) };
}

/** The body of a `rowset` suggestion, or nothing. */
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

/** A read that did not answer: no record here, or the record's own sentence. */
function missed(out: Wire<unknown>): Read<never> {
  if ('refusal' in out) return noRecord(out.refusal.code) ? { from: 'sample' } : { from: 'refused', fix: out.refusal.fix };
  return { from: 'refused', fix: copy.changedSince };
}

const questionsAsked = (booted: Awaited<ReturnType<Governor['boot']>> | null): Map<string, string | undefined> =>
  new Map((booted?.ok ? (booted.value.waiting ?? []) : []).map((w) => [w.id, w.question]));

/** The queue: the open suggestions, the decisions with their options, and the rows the open ones would change. */
export async function readQueue(client: Governor): Promise<Read<Queue>> {
  const [open, booted, all] = await Promise.all([client.governance({ status: 'open' }), client.boot(), everything(client)]);
  if (!open.ok) return missed(open);
  const asked = questionsAsked(booted);
  const rows = listed(open);
  const rowsets: Record<string, RowsetBody> = {};
  for (const r of rows) {
    const body = rowsetOf(r);
    if (body) rowsets[String(r.id)] = body;
  }
  const settled = pairs(all.decisions, all.suggestions);
  return {
    from: 'live',
    value: {
      open: rows.map((r, i) => questionOf(r, asked.get(String(r.id)), i + 1)),
      decided: all.decisions.map((d) => decisionOf(d, settled.get(String(d.id)))),
      rowsets,
      ...(await heldBy(client, Object.values(rowsets))),
    },
  };
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
    const all = await everything(client);
    const settled = pairs(all.decisions.some((d) => d.id === row.id) ? all.decisions : [...all.decisions, row], all.suggestions);
    return { from: 'live', value: { question: decisionOf(row, settled.get(id)), rowset: undefined, registers: {}, rows: {}, closed: true, calls: [] } };
  }

  const drawn = questionOf(row, questionsAsked(booted).get(id), 1);
  if (row.status === 'open') {
    const rowset = rowsetOf(row);
    const calls = callsOutOf(isRow(row.body) ? row.body.egress : undefined);
    return { from: 'live', value: { question: drawn, rowset, ...(await heldBy(client, rowset ? [rowset] : [])), closed: false, calls } };
  }
  const all = await everything(client);
  const settled = pairs(all.decisions, all.suggestions);
  const by = all.decisions.find((d) => settled.get(String(d.id))?.id === row.id);
  const decided = by ? decisionOf(by).decided : undefined;
  const question = by ? { ...drawn, title: text(by.question) || id, ...(decided ? { decided } : {}) } : drawn;
  return { from: 'live', value: { question, rowset: undefined, registers: {}, rows: {}, closed: true, calls: [] } };
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
