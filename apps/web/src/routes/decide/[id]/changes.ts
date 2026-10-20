/**
 * What a `rowset` proposal would change in rows the record already has, field by field.
 *
 * A DOCUMENT OR A LONG TEXT IS DRAWN AS A DIFF, with the render package's own line diff, so there is one
 * diff in the product and not two. Everything else is a plain before and after. Rows the proposal would
 * create are not here: they have no before, and they keep the drawing they had.
 *
 * PURE: the declarations, the rows and the formatter are handed in, so `node --test` reads it.
 */

import { TYPED, day, diffRows, formatTyped, type Block, type TypedForm } from 'braindog-render';

/**
 * AN INSTANT THE FORMATTER HANDED BACK UNTOUCHED IS DRAWN AS A DAY, the way every other date in the
 * product reads. A field the declaration does not type as a date (a merge's `deleted_at`) came
 * through as `2026-09-16T15:23:18.843Z` beside a person's name.
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;
export const dated = (shown: string | null): string | null => (shown !== null && INSTANT.test(shown) ? day(shown.slice(0, 10)) : shown);

/** Past this many characters, or across a line, a text field is read as prose and diffed. */
export const LONG = 120;

export const words = {
  heading: 'What changes',
  before: 'Before',
  after: 'After',
  empty: 'Empty',
  /** A row with no title of its own: said as that, never by its handle. */
  untitled: 'Untitled',
  /** Over what a change takes in: the reason the text moved, before the diff. */
  takes: 'Why: what was learned',
} as const;

/**
 * A MOVE OF WHERE A ROW APPLIES, which is drawn as two chips and not as two row ids: the list its
 * projects are in, and the project each side names, as the proposal and the record hold it, `null` for everywhere.
 * `Changes.svelte` names each one from that list; the ids themselves are never drawn.
 */
export type Moved = { to: string; before: string | null; after: string | null; said?: { before: string | null; after: string | null } };

export type Change =
  | { field: string; label: string; long: true; block: Block }
  | { field: string; label: string; long: false; before: string | null; after: string | null; scope?: Moved };

/**
 * WHAT A CHANGE TAKES IN: the rows it adds to a list of refs while it rewrites a long text, each by its own words
 * (its title, then the first other text a row of its kind must have, which for a learning is the failure that taught
 * it). `closed` counts the ones this reader cannot open. No id and no handle is in here: a person presses on a reason.
 */
export type Take = { title: string; why: string | null };
export type Takes = { said: Take[]; closed: number };

/**
 * `why` IS THE ROW'S OWN REASON, from the question's `why` (a scope question's "used by 3 runs in Kiln."), with the
 * title the record led it with cut, since the title is drawn beside it. A row the question gives no reason has none.
 */
export type Updated = { at: string; title: string; changes: Change[]; takes?: Takes; why?: string; added?: true };

/** In the queue's card only the first row's reason is drawn, and the rest are this count. */
export const moreReasons = (n: number): string => (n === 1 ? 'and one more reason' : `and ${String(n)} more reasons`);

type Reason = { text: string; at: string };

/**
 * THE REASON A QUESTION FILED BESIDE ONE ROW: the ones whose `at` is the row's `at` as the proposal names it, else the
 * row's internal id, else (a spoken name no other row of the proposal claims) the number it ends in. Joined when the
 * record filed two, as a joined question may. The leading "<title>: " is cut; the full stop stays.
 */
function reasonFor(why: readonly Reason[] | undefined, at: string, row: Row, ats: ReadonlySet<string>, title: string): string | undefined {
  if (!why || why.length === 0) return undefined;
  const mine = (w: Reason): boolean =>
    w.at === at ||
    (row.id !== undefined && w.at === row.id) ||
    (!ats.has(w.at) && !ROW_ID.test(w.at) && !ROW_ID.test(at) && row.seq !== null && row.seq === Number(/#(\d+)$/u.exec(w.at)?.[1]) && sameList(w.at, at));
  const lead = `${title}: `;
  const said = why
    .filter(mine)
    .map((w) => w.text.trim())
    .map((t) => (t.startsWith(lead) && t.length > lead.length ? t.slice(lead.length).trimStart() : t))
    .filter((t) => t !== '');
  return said.length > 0 ? said.join(' ') : undefined;
}

/** Whether two spoken names are of one list (`keys#4`, `keys#12`), so a number is never matched across lists. */
const sameList = (a: string, b: string): boolean => a.replace(/#\d+$/u, '') === b.replace(/#\d+$/u, '');

type Field = { id: string; type: string; label?: string; to?: string; of?: string; scope?: unknown; retired?: boolean; required?: boolean };
type Decl = { title?: string; fields: readonly Field[] };

/**
 * The field that says where a row applies: the one that declares `scope:` and is not retired, a ref to one project.
 * The kernel's own reading (`scope.ts` `scopeFieldOf`), over the declaration the record answered for the proposal.
 */
const isScope = (f: Field | undefined): f is Field & { to: string } =>
  f !== undefined && f.type === 'ref' && typeof f.to === 'string' && f.scope !== undefined && f.scope !== null && f.retired !== true;

/** One side of a move: the project a value names, or `null` for everywhere. */
const placeSaid = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

type Row = { id?: string; seq: number | null; version: number; fields: Record<string, unknown> };

/** A row's internal id, which a proposal may name a row by instead of its spoken id. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

const text = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * A TYPED TOKEN IN A FIELD READS AS WHAT IT DRAWS. The diff primitive prints its lines verbatim, which
 * is right for a skill's source but put `{{money:1840000 GBP}}` on both sides of a note's change. The
 * question asks whether the words should change, so the words are filled first; a token whose
 * argument does not parse stays as the author typed it.
 */
const TOKEN = new RegExp(String.raw`\{\{(${TYPED.join('|')}):([^{}|]*)\}\}`, 'gu');
export const filled = (s: string, now?: number): string =>
  s.replace(TOKEN, (whole, form: string, arg: string) => formatTyped(form as TypedForm, arg, now) ?? whole);

/** A `diff` block, as a fence of `- `, `+ ` and two-space rows would parse, with typed tokens filled. */
export const diffBlock = (before: string, after: string): Block => ({
  type: 'block',
  kind: 'diff',
  rows: diffRows(filled(before), filled(after)).map((line) => ({ cells: [line] })),
  raw: '',
  start: 0,
  end: 0,
});

/** Whether a field's change is prose to diff rather than a value to show twice. */
export function isLong(type: string, before: unknown, after: unknown): boolean {
  if (type === 'document') return true;
  if (type !== 'text') return false;
  const a = text(before);
  const b = text(after);
  return /\r|\n/u.test(a + b) || Math.max(a.length, b.length) > LONG;
}

/** The line for the rows a change takes in that this reader cannot open: a count, and never what they are called. */
export const closedSaid = (closed: number, said: number): string =>
  `${closed === 1 ? 'One' : String(closed)}${said > 0 ? ' more' : ''} you cannot open`;

/** A field that holds a list of rows of another list. Read by its types, never by what the list is called. */
const isRefs = (f: Field | undefined): f is Field & { to: string } =>
  f !== undefined && f.type === 'list' && f.of === 'ref' && typeof f.to === 'string' && f.retired !== true;

const refsIn = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);

/** The row a ref names among the rows handed in, by its internal id or by the number its spoken id ends in. */
const named = (pool: readonly Row[], ref: string): Row | undefined =>
  pool.find((e) => e.id === ref) ?? (ROW_ID.test(ref) ? undefined : pool.find((e) => e.seq !== null && e.seq === Number(/(\d+)$/u.exec(ref)?.[1])));

const wordsIn = (v: unknown): string => (typeof v === 'string' ? filled(v).trim() : '');

/**
 * THE ROWS A PATCH ADDS TO A LIST OF REFS, in the order it adds them, and whether it takes any away. A ref is the same
 * row whether the record holds its internal id and the proposal says its spoken one, so the two sides are compared by
 * the row each names; one that names no row handed in is compared by its text and counted as closed.
 *
 * `why` IS THE FIRST OTHER TEXT A ROW OF THAT LIST MUST HAVE, which is how a list says what stands behind its title.
 */
function taken(target: Decl, pool: readonly Row[], before: unknown, after: unknown): { takes: Takes; lost: boolean } {
  const key = (ref: string): string => {
    const row = named(pool, ref);
    return row ? `row:${String(pool.indexOf(row))}` : `ref:${ref}`;
  };
  const had = new Set(refsIn(before).map(key));
  const has = new Set(refsIn(after).map(key));
  const why = target.fields.find((f) => f.type === 'text' && f.required === true && f.id !== target.title && f.retired !== true)?.id;
  const takes: Takes = { said: [], closed: 0 };
  for (const k of has) {
    if (had.has(k)) continue;
    const row = k.startsWith('row:') ? pool[Number(k.slice(4))] : undefined;
    if (!row) {
      takes.closed += 1;
      continue;
    }
    const title = wordsIn(target.title ? row.fields[target.title] : undefined);
    const because = why ? wordsIn(row.fields[why]) : '';
    takes.said.push({ title: title === '' ? words.untitled : title, why: because === '' ? null : because });
  }
  return { takes, lost: [...had].some((k) => !has.has(k)) };
}

/**
 * The update rows of a proposal, each with its changed fields. A row the record does not have, and a
 * field whose value would not move, draw nothing.
 */
export function updatesOf(
  body: { register: string; rows: readonly Record<string, unknown>[]; why?: readonly Reason[] } | undefined,
  registers: Readonly<Record<string, Decl | undefined>>,
  rows: Readonly<Record<string, readonly Row[] | undefined>>,
  show: (register: string, field: string, value: unknown) => string | null,
): Updated[] {
  if (!body) return [];
  const out: Updated[] = [];
  const ats = new Set(body.rows.flatMap((r) => (typeof r.at === 'string' ? [r.at] : [])));
  for (const r of body.rows) {
    if (typeof r.at !== 'string' || typeof r.patch !== 'object' || r.patch === null) continue;
    /* A ROW MAY NAME ITS OWN LIST, when a fold moves a link another list holds, and is read in that list. */
    const list = typeof r.register === 'string' && r.register !== '' ? r.register : body.register;
    const decl = registers[list];
    const held = rows[list] ?? [];
    const at = r.at;
    const seq = Number(/(\d+)$/u.exec(at)?.[1]);
    const row = held.find((e) => e.id === at) ?? (ROW_ID.test(at) ? undefined : held.find((e) => e.seq === seq));
    if (!row) continue;
    const changes: Change[] = [];
    const takes: Takes = { said: [], closed: 0 };
    /* The lists of refs whose whole change is what `takes` says, so they are not drawn a second time as handles. */
    const told = new Set<string>();
    for (const [field, after] of Object.entries(r.patch as Record<string, unknown>)) {
      const before = row.fields[field];
      if (text(before) === text(after)) continue;
      const f = decl?.fields.find((x) => x.id === field);
      const label = f?.label ?? field.replace(/_/g, ' ').replace(/^./u, (c) => c.toUpperCase());
      const target = isRefs(f) ? registers[f.to] : undefined;
      if (isRefs(f) && target) {
        const got = taken(target, rows[f.to] ?? [], before, after);
        takes.said.push(...got.takes.said);
        takes.closed += got.takes.closed;
        if (!got.lost) told.add(field);
      }
      changes.push(
        isScope(f)
          ? {
              field,
              label,
              long: false,
              before: null,
              after: null,
              scope: { to: f.to, before: placeSaid(before), after: placeSaid(after), said: { before: show(list, field, before), after: show(list, field, after) } },
            }
          : isLong(f?.type ?? 'text', before, after)
            ? { field, label, long: true, block: diffBlock(text(before), text(after)) }
            : { field, label, long: false, before: dated(show(list, field, before)), after: dated(show(list, field, after)) },
      );
    }
    if (changes.length === 0) continue;
    /* ONLY BESIDE A DIFF. Rows added to a list with no text rewritten are a plain change and keep their line: what
       they are is the change, not the reason for one. */
    const why = changes.some((c) => c.long) && takes.said.length + takes.closed > 0;
    const title = decl?.title ? row.fields[decl.title] : undefined;
    /* NEVER THE HANDLE (`projects#1`) IN ITS PLACE: a row with no title is said as one. */
    const named = typeof title === 'string' && title !== '' ? title : words.untitled;
    const reason = reasonFor(body.why, r.at, row, ats, typeof title === 'string' ? title.trim() : named);
    out.push({
      at: r.at,
      title: named,
      changes: why ? changes.filter((c) => !told.has(c.field)) : changes,
      ...(why ? { takes } : {}),
      ...(reason !== undefined ? { why: reason } : {}),
    });
  }
  return out;
}

/** The keys a create row may carry that are the proposal's and not the row's fields. */
const NOT_FIELDS = new Set(['at', 'patch', 'version', 'register']);

/**
 * THE ROWS A PROPOSAL WOULD CREATE (`added`), each field it would hold as a line with no before, in the order its list
 * declares them. "Add Send Jennifer the refund email to Tasks?" showed Accept and Decline over nothing: a create was
 * left to the ticks (`picked.ts`), which draw only a proposal of two or more. A field with nothing in it, or a retired
 * one, is not drawn, the title is the row's heading, and a ref is said by the row's name (`show`).
 */
export function createsOf(
  body: { register: string; rows: readonly Record<string, unknown>[] } | undefined,
  registers: Readonly<Record<string, Decl | undefined>>,
  show: (register: string, field: string, value: unknown) => string | null,
): Updated[] {
  if (!body) return [];
  const out: Updated[] = [];
  body.rows.forEach((r, n) => {
    if (typeof r.at === 'string') return;
    const list = typeof r.register === 'string' && r.register !== '' ? r.register : body.register;
    const decl = registers[list];
    const order = (k: string): number => {
      const i = decl?.fields.findIndex((f) => f.id === k) ?? -1;
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const keys = Object.keys(r)
      .filter((k) => !NOT_FIELDS.has(k) || decl?.fields.some((f) => f.id === k))
      .sort((a, b) => order(a) - order(b));
    const changes: Change[] = [];
    for (const field of keys) {
      const f = decl?.fields.find((x) => x.id === field);
      if (f?.retired === true || field === decl?.title) continue;
      const value = r[field];
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
      const label = f?.label ?? field.replace(/_/g, ' ').replace(/^./u, (c) => c.toUpperCase());
      changes.push(
        isLong(f?.type ?? 'text', null, value)
          ? { field, label, long: true, block: diffBlock('', text(value)) }
          : { field, label, long: false, before: null, after: dated(show(list, field, value)) },
      );
    }
    const title = decl?.title ? wordsIn(r[decl.title]) : '';
    if (changes.length === 0 && title === '') return;
    out.push({ at: `new:${String(n)}`, title: title === '' ? words.untitled : title, changes, added: true });
  });
  return out;
}
