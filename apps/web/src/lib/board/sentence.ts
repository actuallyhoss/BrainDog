/**
 * A WIDGET AS ONE SENTENCE WITH PARTS YOU CAN PRESS (widgets plan §5.4, batch W4): "Show money out in Food for this
 * month as a list." Each part is read off the block itself, and changing a part writes the block again the one way the
 * grammar has (`where`, `kind`, `heading`), so the inspector never holds a second idea of what a widget reads.
 *
 * THE PARTS ARE THE RECORD'S OWN WORDS: a list by its name, a choice by its label, a window as "this month". A clause the
 * sentence cannot say stays in the block untouched and is said as "and one more condition", never dropped.
 *
 * PURE, so a test holds it in Node.
 */

/** A block as the inspector reads it. */
export type Block = Record<string, unknown>;

/** The windows a widget over a dated list can be read over, as the sentence says each, and the clause each writes. */
export const WINDOWS = [
  { id: 'week', say: 'this week', clause: (f: string) => `${f} at least bow` },
  { id: 'month', say: 'this month', clause: (f: string) => `${f} at least bom` },
  { id: 'last-month', say: 'last month', clause: (f: string) => `${f} at least bom-1m, ${f} before bom` },
  { id: '30d', say: 'the last 30 days', clause: (f: string) => `${f} after -30d` },
  { id: '90d', say: 'the last 90 days', clause: (f: string) => `${f} after -90d` },
  { id: 'any', say: 'any time', clause: () => '' },
] as const;
export type WindowId = (typeof WINDOWS)[number]['id'];

/** What each kind is called in the sentence ("as a list"). */
export const KIND_SAID: Readonly<Record<string, string>> = {
  table: 'a list',
  todo: 'a list to tick',
  timeline: 'a timeline',
  cards: 'cards',
  calendar: 'a calendar',
  stat: 'figures',
  kpis: 'key numbers',
  progress: 'bars toward a target',
  feed: 'a feed',
  queue: 'questions',
  bar: 'bars',
  heat: 'a heat map',
  sparkline: 'a line',
  lanes: 'lanes',
  board: 'a board',
  gallery: 'pictures',
  chart: 'a chart',
};
export const kindSaid = (kind: string): string => KIND_SAID[kind] ?? kind;

/** One clause of a `where`, as the sentence reads it. */
export type Clause = { text: string; field: string | null; op: string | null; value: string | null };

/** A `where` cut into its clauses. Commas inside nothing else split it, as the grammar's own clauses are written. */
export function clausesOf(where: unknown): Clause[] {
  if (typeof where !== 'string' || where.trim() === '') return [];
  return where
    .split(/,\s*/u)
    .filter((c) => c.trim() !== '')
    .map((text) => {
      const m = /^([a-z_][a-z0-9_]*)\s+(is not|is|at least|at most|after|before)\s+(.+)$/u.exec(text.trim());
      return m ? { text: text.trim(), field: m[1]!, op: m[2]!, value: m[3]! } : { text: text.trim(), field: null, op: null, value: null };
    });
}

/** The clauses as a `where` again, or none. */
export const whereOf = (clauses: readonly Clause[]): string | undefined => {
  const text = clauses.map((c) => c.text).filter((t) => t !== '').join(', ');
  return text === '' ? undefined : text;
};

/** The day field a block's window is read on: the field its window clauses name. */
const DAY_OPS = new Set(['at least', 'at most', 'after', 'before']);
const DAY_WORD = /^(bo[wmy]|today|[+-]\d+[dwm]|bom-1m)/u;

/** Which window a block is read over, and the day field, or `null` when it reads no window. */
export function windowOfBlock(block: Block): { id: WindowId; field: string } | null {
  const dated = clausesOf(block.where).filter((c) => c.field !== null && c.op !== null && DAY_OPS.has(c.op) && DAY_WORD.test(c.value ?? ''));
  if (dated.length === 0) return null;
  const field = dated[0]!.field!;
  const text = dated.map((c) => c.text).join(', ');
  const hit = WINDOWS.find((w) => w.id !== 'any' && w.clause(field) === text);
  return hit ? { id: hit.id, field } : null;
}

/** The block read over another window, every other clause kept. `field` is the day field to read it on. */
export function withWindow(block: Block, id: WindowId, field: string): Block {
  const kept = clausesOf(block.where).filter((c) => !(c.field === field && c.op !== null && DAY_OPS.has(c.op) && DAY_WORD.test(c.value ?? '')));
  const w = WINDOWS.find((x) => x.id === id)!;
  const clause = w.clause(field);
  const where = whereOf([...kept, ...(clause === '' ? [] : clause.split(', ').map((text) => ({ text, field, op: null, value: null })))]);
  const out = { ...block };
  if (where === undefined) delete out.where;
  else out.where = where;
  return out;
}

/** The block with one choice clause set to another value, or taken out when `value` is `null`. */
export function withChoice(block: Block, field: string, value: string | null): Block {
  const all = clausesOf(block.where);
  const at = all.findIndex((c) => c.field === field && c.op === 'is');
  const next = [...all];
  if (value === null) {
    if (at >= 0) next.splice(at, 1);
  } else if (at >= 0) next[at] = { text: `${field} is ${value}`, field, op: 'is', value };
  else next.push({ text: `${field} is ${value}`, field, op: 'is', value });
  const out = { ...block };
  const where = whereOf(next);
  if (where === undefined) delete out.where;
  else out.where = where;
  return out;
}

/** A part of the sentence: words, or a part you press, with what it changes. */
export type Part =
  | { kind: 'words'; text: string }
  | { kind: 'list'; text: string }
  | { kind: 'choice'; text: string; field: string; value: string }
  | { kind: 'window'; text: string; id: WindowId; field: string }
  | { kind: 'order'; text: string; field: string | null; dir: 'asc' | 'desc' }
  | { kind: 'as'; text: string; to: string }
  | { kind: 'more'; text: string };

/** The fields the sentence can say a choice on, with how each is said. `label` is the field as the list labels it. */
export type FieldSaid = { id: string; label?: string | undefined; type?: string | undefined; values?: readonly string[] | undefined; to?: string | undefined };

/** The direction words a money list's clause reads as ("money out"). */
const DIRECTION: Readonly<Record<string, string>> = { out: 'money out', in: 'money in' };
/** Clauses no person needs read to them: the ledger's own housekeeping. */
const QUIET = /^(state is cleared|transfer is false|stays is not true|corrects is not true|merged_into is empty|self is not true|state is not done or dropped|state is not done|live is true)$/u;

/**
 * THE SENTENCE: "Show [what] [in Food] [for this month] as [a list]." `list` is the list's name, `fields` its fields.
 * A figure widget says its figures by their labels.
 */
export function sentenceOf(block: Block, list: string | null, fields: readonly FieldSaid[] = []): Part[] {
  const parts: Part[] = [{ kind: 'words', text: 'Show' }];
  const cells = Array.isArray(block.cells) ? (block.cells as { label?: unknown; metric?: unknown }[]) : [];
  if (cells.length > 0) {
    const said = cells.map((c) => (typeof c.label === 'string' ? c.label : String(c.metric ?? ''))).filter((t) => t !== '');
    parts.push({ kind: 'list', text: said.length > 2 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said.join(' and ') });
  } else {
    const clauses = clausesOf(block.where);
    const dir = clauses.find((c) => c.field === 'direction' && c.op === 'is');
    parts.push({ kind: 'list', text: dir && DIRECTION[dir.value ?? ''] ? DIRECTION[dir.value!]! : (list ?? 'what it reads').toLowerCase() });
    const win = windowOfBlock(block);
    let more = 0;
    for (const c of clauses) {
      if (c === dir || QUIET.test(c.text)) continue;
      if (win && c.field === win.field && c.op !== null && DAY_OPS.has(c.op)) continue;
      const f = fields.find((x) => x.id === c.field);
      if (c.op === 'is' && c.field !== null && c.value !== null && f !== undefined) {
        parts.push({ kind: 'words', text: f.type === 'ref' ? 'for' : 'where' });
        parts.push({ kind: 'choice', text: f.type === 'ref' ? c.value : `${(f.label ?? f.id).toLowerCase()} is ${c.value}`, field: c.field, value: c.value });
      } else more += 1;
    }
    if (win) {
      parts.push({ kind: 'words', text: 'over' });
      parts.push({ kind: 'window', text: WINDOWS.find((w) => w.id === win.id)!.say, id: win.id, field: win.field });
    }
    if (more > 0) parts.push({ kind: 'more', text: more === 1 ? 'and one more condition' : `and ${more} more conditions` });
  }
  /* THE ORDER, where the kind draws rows in one: "newest first", "largest first", "A to Z". */
  if (cells.length === 0 && ORDERED.has(String(block.kind))) {
    const o = orderOf(block);
    const f = o === null ? undefined : fields.find((x) => x.id === o.field);
    parts.push({ kind: 'order', text: o === null ? 'in the usual order' : orderSaid(o.field, o.dir, f, fields), field: o?.field ?? null, dir: o?.dir ?? 'desc' });
  }
  parts.push({ kind: 'words', text: 'as' });
  parts.push({ kind: 'as', text: kindSaid(String(block.kind)), to: String(block.kind) });
  return parts;
}

/** The kinds that draw rows in an order a person can change. */
export const ORDERED: ReadonlySet<string> = new Set(['table', 'todo', 'cards', 'timeline', 'feed', 'gallery', 'queue']);

const DAYS = new Set(['day', 'instant', 'date']);
const AMOUNTS = new Set(['money', 'number', 'int', 'decimal', 'quantity']);

/** A block's first order, or `null` when it says none. */
export function orderOf(block: Block): { field: string; dir: 'asc' | 'desc' } | null {
  const first = Array.isArray(block.order) ? (block.order as { field?: unknown; dir?: unknown }[])[0] : undefined;
  return first && typeof first.field === 'string' ? { field: first.field, dir: first.dir === 'asc' ? 'asc' : 'desc' } : null;
}

/** An order as the sentence says it: by a day, an amount or a name, and which way. */
export function orderSaid(field: string, dir: 'asc' | 'desc', f: FieldSaid | undefined, fields: readonly FieldSaid[] = []): string {
  const label = (f?.label ?? field).toLowerCase().replace(/_/gu, ' ');
  const type = f?.type ?? (field === 'on' || field === 'day' || field === 'by' ? 'day' : undefined);
  /* THE LIST'S OWN DAY IS SAID PLAINLY; another day is said by its name. */
  const main = dayFieldOf(fields) ?? 'on';
  if (type !== undefined && DAYS.has(type)) {
    const due = /^(by|due)$/u.test(field);
    const way = due ? (dir === 'asc' ? 'soonest first' : 'latest first') : dir === 'desc' ? 'newest first' : 'oldest first';
    return field === main || fields.length === 0 ? way : `by ${label}, ${way}`;
  }
  if (type !== undefined && AMOUNTS.has(type)) return `${dir === 'desc' ? 'largest' : 'smallest'} ${label} first`;
  return dir === 'asc' ? `${label} A to Z` : `${label} Z to A`;
}

/** The orders the sentence offers: the list's days and amounts each way, and its first text field A to Z. */
export function orderChoices(fields: readonly FieldSaid[]): { label: string; field: string; dir: 'asc' | 'desc' }[] {
  const days = fields.filter((f) => DAYS.has(f.type ?? '')).slice(0, 2);
  /* MONEY FIRST, AND A PLAIN NUMBER ONLY ON A LIST THAT KEEPS NO MONEY: "largest available after" is nobody's order. */
  const money = fields.filter((f) => f.type === 'money');
  const amounts = (money.length > 0 ? money : fields.filter((f) => AMOUNTS.has(f.type ?? ''))).slice(0, 1);
  const text = fields.find((f) => f.type === 'text' || f.type === undefined);
  const out: { label: string; field: string; dir: 'asc' | 'desc' }[] = [];
  for (const f of [...days, ...amounts]) for (const dir of ['desc', 'asc'] as const) out.push({ label: orderSaid(f.id, dir, f, fields), field: f.id, dir });
  if (text) out.push({ label: orderSaid(text.id, 'asc', text, fields), field: text.id, dir: 'asc' });
  return out;
}

/** The block in another order, its first order replaced and the rest kept. */
export function withOrder(block: Block, field: string, dir: 'asc' | 'desc'): Block {
  const rest = Array.isArray(block.order) ? (block.order as { field?: unknown }[]).slice(1).filter((o) => o.field !== field) : [];
  return { ...block, order: [{ field, dir }, ...rest] };
}

/** The day field a list's widget could be read over, for a block that reads no window yet. */
export const dayFieldOf = (fields: readonly FieldSaid[]): string | null =>
  fields.find((f) => (f.type === 'day' || f.type === 'instant') && /^(on|day|by|date|at|due)$/u.test(f.id))?.id ?? fields.find((f) => f.type === 'day')?.id ?? null;
