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
export type Held = { id?: string; seq: number; version: number; fields: Record<string, unknown> };

/** What a diff is drawn from: each named register's declaration and the rows it would change. */
export type Rows = { registers: Record<string, Decl>; rows: Record<string, Held[]> };

export type Queue = Rows & { open: Question[]; decided: Question[]; rowsets: Record<string, RowsetBody> };

export type One = Rows & { question: Question | null; rowset: RowsetBody | undefined };

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

/** One decision row as the ledger draws it. `answer` is the option's id; the question is its own. */
export function decisionOf(row: Row): Question {
  const id = String(row.id);
  return {
    id,
    title: text(row.question) || id,
    cost: '',
    rank: 0,
    opened: text(row.ts),
    options: [],
    decided: { option: text(row.answer), reason: text(row.reason), by: text(row.decided_by), at: text(row.ts) },
  };
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
const isHeld = (v: unknown): v is Held => isRow(v) && typeof v.seq === 'number' && typeof v.version === 'number' && isRow(v.fields);

/**
 * The declarations and the rows the proposals would update. A row is asked for by the number its spoken
 * id ends in; one the record will not give back draws nothing, which is what `updatesOf` does with it.
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
      const seq = typeof r.at === 'string' ? /^(?:[a-z_]+#|[A-Z]+)(\d+)$/u.exec(r.at)?.[1] : undefined;
      if (seq === undefined) continue;
      const got = await client.get(body.register, Number(seq));
      if (got.ok && isHeld(got.value)) (rows[body.register] ??= []).push(got.value);
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

/** The queue: the open suggestions, the decisions, and the rows the open ones would change. */
export async function readQueue(client: Governor): Promise<Read<Queue>> {
  const [open, booted, decisions] = await Promise.all([
    client.governance({ status: 'open' }),
    client.boot(),
    client.governance({ register: 'decision' }),
  ]);
  if (!open.ok) return missed(open);
  const asked = questionsAsked(booted);
  const rows = Array.isArray(open.value) ? open.value.filter(isRow) : [];
  const rowsets: Record<string, RowsetBody> = {};
  for (const r of rows) {
    const body = rowsetOf(r);
    if (body) rowsets[String(r.id)] = body;
  }
  return {
    from: 'live',
    value: {
      open: rows.map((r, i) => questionOf(r, asked.get(String(r.id)), i + 1)),
      decided: decisions.ok && Array.isArray(decisions.value) ? decisions.value.filter(isRow).map(decisionOf) : [],
      rowsets,
      ...(await heldBy(client, Object.values(rowsets))),
    },
  };
}

/** One question by id: a suggestion `SG<n>`, or a decision `D<n>`. A row the record does not give is `null`. */
export async function readOne(client: Governor, id: string): Promise<Read<One>> {
  const decision = /^D\d+$/u.test(id);
  const [got, booted] = await Promise.all([
    client.governance({ register: decision ? 'decision' : 'suggestion', id }),
    decision ? null : client.boot(),
  ]);
  if (!got.ok) return missed(got);
  if (!isRow(got.value)) return { from: 'live', value: { question: null, rowset: undefined, registers: {}, rows: {} } };
  const row = got.value;
  const rowset = decision ? undefined : rowsetOf(row);
  return {
    from: 'live',
    value: {
      question: decision ? decisionOf(row) : questionOf(row, questionsAsked(booted).get(id), 1),
      rowset,
      ...(await heldBy(client, rowset ? [rowset] : [])),
    },
  };
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
