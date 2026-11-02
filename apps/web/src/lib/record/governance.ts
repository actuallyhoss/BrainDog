/**
 * `/decide` and `/decide/<id>` on a live record: the open suggestions `governance` answers, the decisions
 * beside them, the rows a `rowset` would change, and the `decide` call that answers one.
 *
 * PURE, SO `node --test` CAN IMPORT IT, for the reason `keychain.ts` gives: the client is handed in, so
 * every branch is testable against an object literal, and the client stays out of the entry chunk.
 *
 * LIVE OR REFUSED, AND NOTHING IN BETWEEN. A refusal is drawn in the host's own sentence, whatever its code. This
 * used to read `UNREACHABLE` and `UNAUTHORIZED` at an address with no slug as "no record here" and answer
 * `sample`, so both screens drew fixture questions nobody had asked; the sample is gone, and a 401
 * is sent to sign-in by the layout before this is ever asked.
 */

import { money } from 'braindog-render';
/* THE SAME FUNCTION THE RECORD RANKS WITH, and not a second one. `/decide` does not go through
   `governance.open`: it reads `governance` raw and builds its own `Question`, so a band computed only
   inside the kernel's page source would never reach this screen, and two rankings of one queue that
   disagreed would be worse than no ranking at all. */
import { COSTS, costOf, costRank, optionCost } from '@braindog/kernel';
import { nameSpokenIn } from '@braindog/kernel/spoken-names';

import { copy } from '../copy.ts';
import { citedWords, figuresIn } from '../cite.ts';
import { moneyInText } from './money.ts';
import { labels, relabel } from '../voice.ts';
import { callsOutOf, type CallOut } from './actions.ts';
import type { MergeCluster, Question } from './schema.ts';

/**
 * A `rowset` body, as `propose` files it (`packages/kernel/src/govern.ts`): a row with `at` updates that row at the
 * version it was read at, and a row without one creates. It is here and not beside the sample's rowsets, because a
 * shipped reader may not import the fixture to name a type.
 *
 * `why` IS EACH ROW'S REASON, as the record files a scope question's (`packages/record/src/methods/stale.ts`
 * `proposeScopes`): `{ text: '<title>: <reasons>.', at: '<the row's name>' }`, so the question says why each row moves.
 */
export type Reason = { text: string; at: string };
export type RowsetBody = { register: string; rows: readonly Record<string, unknown>[]; why?: readonly Reason[] };

/** A reason the record filed beside a row: a sentence and the row it cites. A bare sentence or a half one is not one. */
const isReason = (v: unknown): v is Reason =>
  isRow(v) && typeof v.text === 'string' && v.text.trim() !== '' && typeof v.at === 'string' && v.at !== '';

/** The list one update row is in: its own `register` where it names one (a fold moving a link another list holds), else the question's. */
const listOf = (body: { register: string }, row: Record<string, unknown>): string =>
  typeof row.register === 'string' && row.register !== '' ? row.register : body.register;

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

/** A register's declaration, with only the keys a diff reads: a list of refs says what it holds (`of`) and of which list (`to`). */
export type Decl = {
  title?: string;
  fields: readonly { id: string; type: string; label?: string; labels?: Readonly<Record<string, string>>; of?: string; to?: string; required?: boolean }[];
};

/** A row a proposal would update, as `get` answers it. */
export type Held = { id?: string; register?: string; seq: number | null; version: number; fields: Record<string, unknown> };

/**
 * What a diff is drawn from: each named register's declaration, the rows it would change, and `names`, what each row a
 * ref in it points at is called (`refNames`), so a diff says "Copperleaf" and never `01M3MV…` or `things#23`.
 */
export type Rows = { registers: Record<string, Decl>; rows: Record<string, Held[]>; names?: Record<string, string> };

/** What an open suggestion is, as filed: its kind, its body as the record holds it, and who filed it. The queue groups by
    `by`, and a `change` or a `pattern` is previewed from `body` (`routes/decide/[id]/proposed.ts`). `merge` is the group a
    merge suggestion was filed for, as the record puts it on the row, which `merge.ts` reads for its names and Picks. */
export type About = { kind: string; body: Row; by: string; merge?: Row };

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
export type Read<T> = { from: 'live'; value: T } | { from: 'refused'; fix: string };

/** What a `decide` call came back with: done, or the sentence to show. */
export type Sent = { ok: true } | { ok: false; fix: string };

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * One open suggestion as the queue draws a question.
 *
 * `band` IS WHAT IT WOULD COST TO GET THIS ONE WRONG, computed from what accepting it would do, and it
 * is the ranking (`19 §6`). `cost` stays empty on a live question: that field is the cost of DELAY,
 * which is prose somebody has to write and nobody has. `rank` is the caller's, because a rank is a
 * place in a list and this function sees one row.
 *
 * An `options` body offers its options; every other kind is accepted or rejected, which are the two
 * words `decide` takes for it.
 *
 * EVERY SENTENCE HERE WAS STORED BY SOMEBODY ELSE AND IS DRAWN AS WORDS. Slash's braces become words (`citedWords`), so
 * no screen that prints an option prints `{{ref:…}}`: what a brace stands for where the body keeps `figures`, and words
 * of its own where it does not, which is every question Slash files, because a filed question is shown to readers who
 * may not read the rows it cites (`packages/slash/src/propose.ts`). Money written into a sentence as "GBP 2400.00" is
 * drawn in the record's currency (`moneyInText`). The options card on `/decide/<id>` draws the reasons again
 * with their links (`Cited`), from the body; everything else reads these words.
 */
export function questionOf(row: Row, asked: string | undefined, rank: number): Question {
  const id = String(row.id);
  const body = isRow(row.body) ? row.body : {};
  const figures = figuresIn(body);
  const said = (v: unknown): string => moneyInText(citedWords(text(v), figures));
  /* WHICH OPTIONS ARE HARD TO TAKE BACK, by the record's own word where it sends one (`option_costs`, by the option's
     id), and weighed here from the option as the kernel weighs it where it does not. Either saying hard is hard: a
     build that disagrees with the record errs towards the care. */
  const sent = Array.isArray(row.option_costs) ? row.option_costs.filter(isRow) : [];
  const hardOption = (o: Row): boolean => optionCost(o) === 'undo' || sent.some((c) => c.id === o.id && c.cost === 'undo');
  const options =
    row.body_kind === 'options' && Array.isArray(body.options)
      ? body.options.filter((o): o is Row => isRow(o) && typeof o.id === 'string').map((o) => ({
          key: String(o.id),
          title: said(o.label) || String(o.id),
          body: said(o.because),
          ...(o.recommended === true ? { recommended: true } : {}),
          ...(hardOption(o) ? { hard: true } : {}),
        }))
      : [
          { key: 'accept', title: copy.acceptIt, body: '' },
          { key: 'reject', title: copy.rejectIt, body: '' },
        ];
  /* THE REASONING IS THE QUESTION'S, written by whoever opened it (`body.context`), and it is drawn above the options. */
  /* An agent that wrote its reason as `why` is read the same, so the page says why it asks (2 Nov). */
  const context = (said(body.context).trim() || said(body.why).trim());
  /* THE RECORD'S OWN BAND WHERE IT SENDS ONE (`cost`): it has read which fields the history withholds, and a browser
     weighing the body alone cannot. Without one the body is weighed here, as before. */
  const band = (COSTS as readonly string[]).includes(text(row.cost)) ? (text(row.cost) as ReturnType<typeof costOf>) : costOf(text(row.body_kind), row.body);
  const title = moneyInText(asked?.trim() ?? '');
  /* A MERGE THE RECORD READ AS ONE (`merge`), carried to the card as it came, once it is the shape the card reads. */
  const merge = mergeOf(row.merge);
  return { id, title: title || id, cost: '', band, rank, opened: text(row.opened_at), options, ...(context ? { context } : {}), ...(merge ? { merge } : {}), ...(typeof row.decider === 'string' || row.decider === null ? { decider: row.decider as string | null } : {}) };
}

const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * The record's merge question (`MergeCluster`), or `null` when the row carries none or one in a shape this build cannot
 * read: a card drawn from half a cluster would offer a Pick for somebody it cannot name. Narrowed whole, keys and all,
 * so nothing the record did not check rides through onto a screen.
 */
export function mergeOf(v: unknown): MergeCluster | null {
  if (!isRow(v) || !Array.isArray(v.candidates) || !Array.isArray(v.options) || v.candidates.length < 2) return null;
  const candidates = v.candidates.map((c) =>
    isRow(c) &&
    typeof c.name === 'string' &&
    typeof c.row === 'string' &&
    typeof c.keeps === 'boolean' &&
    (c.org === null || typeof c.org === 'string') &&
    texts(c.seen) &&
    texts(c.known_by) &&
    Array.isArray(c.rows) &&
    c.rows.every((n) => Number.isInteger(n) && (n as number) >= 0)
      ? { name: c.name, row: c.row, keeps: c.keeps, org: c.org as string | null, seen: [...c.seen], known_by: [...c.known_by], rows: [...(c.rows as number[])] }
      : null,
  );
  const options = v.options.map((o) =>
    isRow(o) && typeof o.option === 'string' && typeof o.says === 'string' && isRow(o.decide) && typeof o.decide.option === 'string'
      ? { option: o.option, says: o.says, decide: { option: o.decide.option } }
      : null,
  );
  if (candidates.some((c) => c === null) || options.some((o) => o === null)) return null;
  return { candidates: candidates as MergeCluster['candidates'], options: options as MergeCluster['options'] };
}

/**
 * One decision row as the ledger draws it. `answer` is the option's id, so the options come from the
 * suggestion it settled, when that is known, and a screen names the option by its label.
 */
export function decisionOf(row: Row, settled?: Row): Question {
  const id = String(row.id);
  return {
    id,
    /* DRAWN IN THE RECORD'S CURRENCY, as an open question's title is (`questionOf`): a rule's question keeps "GBP
       4,800.00", and the page of a question once answered printed it so, in its heading and its tab (audit 6g, AG1). */
    title: moneyInText(text(row.question)) || id,
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
export const aboutOf = (row: Row): About => ({
  kind: text(row.body_kind),
  body: isRow(row.body) ? row.body : {},
  by: text(row.opened_by),
  ...(isRow(row.merge) ? { merge: row.merge } : {}),
});

export function rowsetOf(row: Row): RowsetBody | undefined {
  if (row.body_kind !== 'rowset' || !isRow(row.body)) return undefined;
  const { register, rows, why } = row.body;
  if (typeof register !== 'string' || !Array.isArray(rows)) return undefined;
  const said = Array.isArray(why) ? why.filter(isReason).map((w) => ({ text: w.text, at: w.at })) : [];
  return { register, rows: rows.filter(isRow), ...(said.length > 0 ? { why: said } : {}) };
}

/**
 * A field's value as a diff shows it: from the record's own declarations, as `heldBy` relabelled them, and not
 * through `display`, which reads the shell's declaration cache (`REGISTERS`) and falls back to the seed's for a
 * register it has not learnt.
 *
 * AN ENUM IS SAID BY ITS LABEL FIRST, as the row it changes reads it. A Personal record's merge of a person
 * said the role was changing from "client" to "registrar" over a row that reads Work contact and a form that
 * offers Agency.
 */
export function plainOf(registers: Readonly<Record<string, Decl>>, names: Readonly<Record<string, string>> = {}) {
  const said = (ref: string): string => names[ref] ?? (ROW_ID.test(ref) ? SOME_ROW : nameSpokenIn(ref, (s) => names[s] ?? null));
  return (register: string, field: string, value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null;
    const f = registers[register]?.fields.find((x) => x.id === field);
    const type = f?.type;
    if (type === 'bool') return value ? 'yes' : 'no';
    if (type === 'enum') return f?.labels?.[String(value)] ?? String(value).replace(/_/g, ' ');
    /* A REF IS SAID BY THE ROW'S NAME, one or a list of them, and an id nothing here can name is "a row", never the id. */
    if (type === 'ref' && typeof value === 'string') return said(value);
    if (Array.isArray(value)) {
      const parts = value.filter((v) => v !== null && v !== undefined && v !== '').map((v) => (typeof v === 'string' ? (f?.of === 'ref' ? said(v) : v) : JSON.stringify(v)));
      return parts.length === 0 ? null : parts.join(', ');
    }
    if (isRow(value)) return typeof value.amount === 'number' && typeof value.currency === 'string' ? money(value.amount, value.currency) : JSON.stringify(value);
    return nameSpokenIn(String(value), (s) => names[s] ?? null);
  };
}

/** A row a ref names that nothing here can name: said as that, never by its id. */
const SOME_ROW = 'A row you cannot open';

/** A row's internal id, as a ref holds it. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
/** A spoken id inside a sentence, as `nameSpokenIn` reads one. */
const SPOKEN = /(?<![\w#/.-])(?:[a-z][a-z0-9_]{0,31}#[1-9]\d{0,14}|S[1-9]\d{0,14})(?![\w#-])/gu;
/** How many rows one question's refs are read for at most: a question naming more says the rest as "a row". */
const NAMES_MOST = 40;

/**
 * THE REFS A ROWSET NAMES, each a row id or a spoken id: the ref fields of what it would write, and of the rows as they
 * are, and the spoken ids written into its text. Read by field type alone, in the order met, each once.
 */
export function refsOf(bodies: readonly RowsetBody[], registers: Readonly<Record<string, Decl>>, held: Readonly<Record<string, readonly Held[]>> = {}): string[] {
  const out = new Set<string>();
  const take = (decl: Decl | undefined, fields: Record<string, unknown>): void => {
    for (const [id, v] of Object.entries(fields)) {
      const f = decl?.fields.find((x) => x.id === id);
      const refs = f?.type === 'ref' ? [v] : f?.type === 'list' && f.of === 'ref' && Array.isArray(v) ? v : [];
      for (const r of refs) if (typeof r === 'string' && r !== '') out.add(r);
      if (typeof v === 'string' && (f === undefined || f.type === 'text')) for (const m of v.matchAll(SPOKEN)) out.add(m[0]);
    }
  };
  for (const body of bodies)
    for (const r of body.rows) {
      const list = listOf(body, r);
      const decl = registers[list];
      if (typeof r.at === 'string') {
        if (isRow(r.patch)) take(decl, r.patch);
        const seq = Number(/(\d+)$/u.exec(r.at)?.[1]);
        const was = (held[list] ?? []).find((e) => e.id === r.at || e.seq === seq);
        if (was) take(decl, was.fields);
      } else take(decl, r);
    }
  return [...out];
}

/** What each ref is called: the title of the row it names, in its own list's words; one the record will not give is left out. */
async function refNames(client: Governor, refs: readonly string[], registers: Record<string, Decl>, read: ReadonlyMap<string, Held | null>): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const ref of refs.slice(0, NAMES_MOST)) {
    let row = read.get(ref);
    if (row === undefined) {
      const got = await client.call('get', { spoken: ref });
      row = got.ok && isHeld(got.value) ? got.value : null;
    }
    if (row === null || typeof row.register !== 'string') continue;
    const list = row.register;
    if (!(list in registers)) {
      const decl = await client.schema(list);
      if (decl.ok && isDecl(decl.value)) registers[list] = relabel({ ...decl.value, id: list }, labels());
    }
    const key = registers[list]?.title;
    const title = key === undefined ? undefined : row.fields[key];
    if (typeof title === 'string' && title.trim() !== '') names[ref] = title.replace(/\s+/gu, ' ').trim();
  }
  return names;
}

const isDecl = (v: unknown): v is Decl => isRow(v) && Array.isArray(v.fields);
const isHeld = (v: unknown): v is Held =>
  isRow(v) && (typeof v.seq === 'number' || v.seq === null) && typeof v.version === 'number' && isRow(v.fields);

/**
 * The declarations and the rows the proposals would update. A row named by its spoken id is asked for
 * by the number that id ends in, and a row named by its internal id is asked for by that id, which
 * `get` reads the way it reads a spoken one. A row the record will not give back, or that is in
 * another register, draws nothing, which is what `updatesOf` does with it.
 *
 * EACH DECLARATION IS RELABELLED WITH THE RECORD'S LABELS, by the holder `data/record.ts`'s `schema` draws a list with.
 * Both Decide screens hand this the raw `@braindog/client`, whose `schema` knows no labels, so a `plainOf` that read
 * a field's labels still found none there and the diff said Registrar where the row reads Agency.
 *
 * AND THE ROWS A PATCH ADDS TO A LIST OF REFS, with the declaration of the list they are in, so a change that rewrites a
 * text and takes in what was learned can say each one by its title (`updatesOf`'s `takes`). Read by field type alone,
 * never by a list's name; a ref the row already holds is not read again, and one the record will not give is left out,
 * which the card counts as one the reader cannot open.
 *
 * A ROW MAY NAME ITS OWN LIST (`register`), when a fold moves a link another list holds: that row is read, and its
 * declaration asked, in the list it names, and every other row in the question's.
 */
export async function heldBy(client: Governor, bodies: readonly RowsetBody[], opts: { names?: boolean } = {}): Promise<Rows> {
  const registers: Record<string, Decl> = {};
  const rows: Record<string, Held[]> = {};
  /* EVERY ROW A REF WAS READ FOR, so naming the refs (`refNames`) never asks for one a second time. */
  const read = new Map<string, Held | null>();
  for (const body of bodies) {
    if (!(body.register in registers)) {
      const decl = await client.schema(body.register);
      if (decl.ok && isDecl(decl.value)) registers[body.register] = relabel({ ...decl.value, id: body.register }, labels());
    }
    for (const r of body.rows) {
      if (typeof r.at !== 'string' || r.at === '') continue;
      const list = listOf(body, r);
      if (!(list in registers)) {
        const decl = await client.schema(list);
        if (decl.ok && isDecl(decl.value)) registers[list] = relabel({ ...decl.value, id: list }, labels());
      }
      const seq = /^(?:[a-z_]+#|[A-Z]+)(\d+)$/u.exec(r.at)?.[1];
      const got = seq === undefined ? await client.call('get', { spoken: r.at }) : await client.get(list, Number(seq));
      const was = got.ok && isHeld(got.value) && (got.value.register ?? list) === list ? got.value : undefined;
      if (was) (rows[list] ??= []).push(was);
      for (const [field, after] of Object.entries(isRow(r.patch) ? r.patch : {})) {
        const f = registers[list]?.fields.find((x) => x.id === field);
        if (f?.type !== 'list' || f.of !== 'ref' || typeof f.to !== 'string' || !Array.isArray(after)) continue;
        const to = f.to;
        if (!(to in registers)) {
          const decl = await client.schema(to);
          if (decl.ok && isDecl(decl.value)) registers[to] = relabel({ ...decl.value, id: to }, labels());
        }
        const before = was?.fields[field];
        const had = new Set(Array.isArray(before) ? before.map(String) : []);
        for (const ref of after) {
          if (typeof ref !== 'string' || ref === '' || had.has(ref)) continue;
          const one = await client.call('get', { spoken: ref });
          const row = one.ok && isHeld(one.value) ? one.value : undefined;
          read.set(ref, row ?? null);
          if (row && (row.register ?? to) === to && !(rows[to] ?? []).some((e) => e.id === row.id && e.seq === row.seq)) (rows[to] ??= []).push(row);
        }
      }
    }
  }
  /* AND WHAT EACH REF IS CALLED, for one question's page (`readOne`): the queue reads every open question, and a get for
     every ref of each would be the request count a review counted against it. */
  if (!opts.names) return { registers, rows };
  const names = await refNames(client, refsOf(bodies, registers, rows), registers, read);
  return { registers, rows, names };
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

/** A read that did not answer, in the host's own sentence. */
function missed(out: Wire<unknown>): Read<never> {
  if ('refusal' in out) return { from: 'refused', fix: out.refusal.fix };
  return { from: 'refused', fix: copy.changedSince };
}

/**
 * The open questions dearest first, and their rank is where they landed.
 *
 * SORTED HERE AND NOT IN SQL, because the band is computed from the body rather than stored, so there
 * is no column to order by. Within a band the OLDEST comes first, which is the opposite of the read
 * underneath (`listGovernance` answers newest first, because a queue nobody has answered is read from
 * the top): once there is a rank, the one worth meeting is the expensive question that has been
 * sitting, not the expensive question that arrived a minute ago. `id` settles a tie on the instant so
 * two questions never swap places between reads.
 *
 * The same order the kernel's `openQuestions` puts a `queue` block in, deliberately: one queue, read
 * two ways, must not be two orders.
 */
const ranked = (open: Question[]): Question[] =>
  open
    .slice()
    .sort((a, b) => costRank(a.band ?? '') - costRank(b.band ?? '') || a.opened.localeCompare(b.opened) || a.id.localeCompare(b.id))
    .map((q, i) => ({ ...q, rank: i + 1 }));

/** What a question was asked as: `boot`'s words for it, else the words the governance row carries, else nothing. */
export const askedOf = (asked: ReadonlyMap<string, string | undefined>, row: Row): string | undefined =>
  asked.get(String(row.id))?.trim() || text(row.question).trim() || undefined;

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
      open: ranked(rows.map((r) => questionOf(r, askedOf(asked, r), 0))),
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
    return { from: 'live', value: { question: decisionOf(row, settled), rowset: undefined, registers: {}, rows: {}, closed: true, calls: [], ...(settled ? { about: aboutOf(settled) } : {}), ...keptApplied(row, settled) } };
  }

  /* THE WORDS THE QUESTION WAS ASKED IN, from `boot`'s waiting list and else from the row itself. `boot` names only the
     newest it holds, so an older question's page was drawn with no title over its Accept and Decline. */
  const drawn = questionOf(row, askedOf(questionsAsked(booted), row), 1);
  if (row.status === 'open') {
    const rowset = rowsetOf(row);
    const calls = callsOutOf(isRow(row.body) ? row.body.egress : undefined);
    const pagesNow = row.body_kind === 'arrange' && isRow(row.body) ? await pagesStanding(client, row.body.pages) : {};
    return {
      from: 'live',
      value: { question: drawn, rowset, ...(await heldBy(client, rowset ? [rowset] : [], { names: true })), closed: false, calls, about: aboutOf(row), pagesNow },
    };
  }
  const by = await linkedRow(client, 'decision', row.decision);
  const decided = by ? decisionOf(by).decided : undefined;
  const question = by ? { ...drawn, title: moneyInText(text(by.question)) || id, ...(decided ? { decided } : {}) } : drawn;
  /* AND WHAT IT WAS ABOUT AND WHO ASKED, kept once it is answered, so the receipt still links the invoice it chased and
     can say what the answer set going (`does.ts`). */
  return { from: 'live', value: { question, rowset: undefined, registers: {}, rows: {}, closed: true, calls: [], about: aboutOf(row), ...keptApplied(by, row) } };
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
