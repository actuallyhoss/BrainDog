/**
 * The list screen's pure half: what its page and its parts work out from what they are handed, holding no state and
 * writing nothing.
 *
 * OUT OF THE COMPONENT BECAUSE A SVELTE PAGE DOES NOT MOUNT UNDER `node --test`, and nothing inside one can be reached
 * by a test at all. The page keeps the address, the read, the state and every write; the parts beside this file draw
 * what the page hands them; and what is left, the arithmetic and the words that turn on nothing but their arguments,
 * lives here, loadable by plain Node the way `put-back.ts` beside the page is: relative `.ts` imports, no `$lib`, no
 * runes.
 */

import { day, exponentOf, money, shortDay, since, symbolFigure, type Tone } from 'braindog-render';
import { copy } from '../../../../lib/copy.ts';
import { seqWidth } from '../../../../lib/record/api.ts';
import { wayField } from '../../../../lib/record/money-way.ts';
import { declaredValue } from '../../../../lib/record/where.ts';
import { recordToday } from '../../../../lib/record/zone.ts';
import { isMoney, type Entry, type FieldDecl, type Filter, type RegisterDecl } from '../../../../lib/record/schema.ts';
import { orgFieldOf, orgRoleOf } from '../folk.ts';
import { presenceOf } from '@braindog/kernel';

/**
 * WHAT JUST HAPPENED TO A ROW, DRAWN WHERE THE ROW WAS.
 *
 * IT WAS A SET OF ARCHIVED SEQUENCES AND THE ROW LEFT THE SCREEN. That is the single change with
 * the most evidence behind it: of eighty-five human writes over thirteen days
 * in the record this product is modelled on, **thirteen reversed the write immediately before
 * them, and twelve of those landed inside five seconds**, across four different verbs. They had
 * one cause. The row vanished, so the only way to check you had hit the right one was to do the
 * opposite and look.
 *
 * A ROW IN THE PAGE'S `receipts` IS DRAWN WHERE IT ALREADY WAS, whatever its state now is, wearing a
 * chip that says what happened and offering the inverse. It stays until the QUESTION changes, because
 * the next question is a new screen and a receipt for a row that is no longer in the answer is a row
 * the reader did not ask for.
 *
 * A DESTRUCTIVE ACTION IS UNDONE, NEVER CONFIRMED. A confirmation dialog asks its question before
 * anything has happened, when the reader knows the least they ever will about it, and the answer
 * is always yes, which is why people stop reading them. The receipt gives back the one thing a
 * dialog cannot: the row, named in the past tense, still where it was.
 *
 * THE TYPE IS HERE, AND NOT IN THE PAGE, because the grid and the cards both draw it.
 */
export type Receipt = {
  /** One or two words in the past tense. `Archived`, `Restored`, `Undone`. */
  mark: string;
  /* `Tone` FROM THE RENDERER, not a fifth vocabulary written here. `13 §5.1` is that meaning may
     not live in styling alone, and `Chip` enforces it: there is no way to draw a tone in this
     app without its glyph, so the word and the glyph carry the meaning and the hue agrees. */
  intent?: Tone | undefined;
  /**
   * THE SAME FACT IN THE WIDTH THE GRID HAS, and it is absent for most receipts because most of
   * them already fit.
   *
   * The `act` column is `11ch` and `truncate: 'never'`, sized for two icon verbs or for
   * `Put back` beside a two-word mark. `markNeeds` is a sentence: on obligations it reads
   * "Needs which way, amount, due, status" and came out of the cell as "Needs whic", clipped,
   * immediately after the most common write in the product.
   *
   * IT IS NOT A TRUNCATION, IT IS A DIFFERENT SENTENCE FOR A SURFACE THAT ALREADY SAYS THE REST.
   * The grid draws every declared field as a column and leaves an unfilled one empty, so which
   * fields a row still wants is on the row four times over. The card draws three `mobile:`
   * fields and cannot say it, which is why the card gets the long form and this one does not.
   */
  short?: string | undefined;
  /**
   * The inverse. Absent when there is nothing to put back, which a receipt still records.
   *
   * `undefined` IS ALLOWED AS WELL AS ABSENT because a live change builds its inverse from the row as the
   * screen held it, and a row the screen was not holding has no values to go back to: `putBackOf` answers
   * `undefined` then, and the chip draws without `Put back` rather than with one that writes nothing.
   */
  undo?: (() => void) | undefined;
};

/**
 * THE FREE SPACE GOES WHERE THE WORDS ARE, and it went to the title whatever the title held.
 *
 * Every flexible column took `1fr` and the title `3fr`, so Skills gave a name column of
 * `review-pr` 530px and cut "Before merging a bran…" at 200px beside it, and Keys cut "What it
 * opens" the same way. A flexible track now takes an `fr` for every ten characters of the longest
 * value in the rows in hand, from one to four, and the title never less than three. Still a
 * DECLARED track list, which `Table` needs for `content-visibility`: the rows decide the numbers
 * once, and layout never measures a cell.
 */
export function weighed<C extends { field: string; width: string }>(c: C, isTitle: boolean, entries: readonly Entry[]): C {
  /* THE SPOKEN ID GIVES WAY. On Keys an 11ch column held `#6` in 102px while "Fenwick Cloud
     recovery codes" was cut beside it. It takes the digits the rows in hand have (`seqWidth`). */
  if (c.field === 'seq') return { ...c, width: seqWidth(entries) };
  const track = /^minmax\(([^,]+),\s*[\d.]+fr\)$/.exec(c.width);
  if (!track) return c;
  let longest = 0;
  for (const e of entries.slice(0, 200)) {
    const v = e.fields[c.field];
    if (typeof v === 'string' && v.length > longest) longest = v.length;
  }
  const fr = Math.min(4, Math.max(isTitle ? 3 : 1, Math.ceil(longest / 10)));
  /* And a title that fits is not cut to feed a column that will be cut anyway: its floor is its
     longest value, up to thirty characters. A `ch` here is wider than an average letter, so the
     floor is a little generous, which is the side to be wrong on. */
  const floor = isTitle && longest > 0 ? `max(${track[1]}, ${Math.min(30, longest)}ch)` : track[1];
  return { ...c, width: `minmax(${floor}, ${fr}fr)` };
}

/**
 * WHAT EACH DIRECTION OF AN ORDER IS CALLED, in the field's own terms.
 *
 * A column header can get away with an arrow because the arrow sits on the thing it orders; a chip
 * in a sheet is read on its own, and "Due ↑ lowest first" is a sentence about a date that nobody
 * says. `19 §9`'s rule is that the product speaks the reader's words, and the reader's word for an
 * ascending day is *oldest*.
 */
export const wayOf = (field: string, decl: RegisterDecl | undefined): readonly [string, string] => {
  if (field === 'seq') return [copy.firstAdded, copy.lastAdded];
  const type = decl?.fields.find((f) => f.id === field)?.type;
  if (type === 'day' || type === 'instant') return [copy.oldestFirst, copy.newestFirst];
  if (type === 'money' || type === 'int' || type === 'decimal' || type === 'duration')
    return [copy.lowestFirst, copy.highestFirst];
  return [copy.aToZ, copy.zToA];
};

/**
 * THE FIELD A ROW'S TONE IS ABOUT: the register's `day` field declared `deadline:`, the one `toneOf`
 * (`lib/record/api.ts`) dates a row by. A table marks this column as the one that carries the tone,
 * so the dot sits beside the date that made the row late or close. It was the state
 * column, and a red dot beside "Open" said overdue while the word beside it said something else.
 */
export const deadlineOf = (decl: RegisterDecl | undefined): string | undefined =>
  decl?.fields.find((f) => f.type === 'day' && f.deadline)?.id;

/**
 * A FINISHED ROW CARRIES NO COLOUR. `toneOf` calls a row in a `done` state `good`, which drew a green
 * dot beside every "Paid" and "Cleared" on a list and beside "Cancelled" too. A normal state is the
 * calm one: a list draws a row late or close, and a finished row says it is
 * finished in its own word. The rows keep every other field as they came.
 */
/* AND A ROW THAT IS ONLY CLOSE CARRIES NONE EITHER (P24, money F2): amber is off lists, so a Due cell said "⚠︎ watch this"
   beside the ring and the words "Due in 4 days" that already say it. Late keeps its red. */
export function withoutGood<R extends { tone?: Tone | undefined }>(rows: readonly R[]): R[] {
  return rows.map((r) => (r.tone === 'good' || r.tone === 'warn' ? { ...r, tone: undefined } : r));
}

/**
 * The `sort` parameter a press on `field` writes: ascending on a new field, and the other way on the
 * field already sorted ascending.
 *
 * ONE TOGGLE FOR THE HEADER AND FOR DISPLAY, so a sort set by clicking a column and one set in the
 * sheet are the same fact, written the same way into the same parameter (`19 §5`: which rows you are
 * looking at, and in what order, is shareable).
 */
export const nextSort = (sort: { field: string; dir: 'asc' | 'desc' } | undefined, field: string): string =>
  `${field}:${sort?.field === field && sort.dir === 'asc' ? 'desc' : 'asc'}`;

/**
 * The offer itself, read by the bar and by the pills' counts, so the two are one list.
 *
 * Only INDEXED fields are offered, in declaration order, at most eight. A filter on an unindexed
 * field is a promise the storage cannot keep at 5,000 rows.
 */
export function filterableOf(fields: RegisterDecl['fields']): RegisterDecl['fields'] {
  return fields.filter((f) => f.index).slice(0, 8);
}

/**
 * A value is SELECTED when the filter includes it, and a `not-in` filter includes nothing.
 *
 * The test used to be `values.includes(value)` with no regard for the operator, so the URL a
 * declared metric hands the reader, `?f=state:not-in:cancelled`, the one that opens "Cost per
 * year", drew `cancelled` as the value being shown. Fifteen live rows on screen, and the control
 * above them saying the one word none of them held.
 */
export const chipOn = (register: string, filters: readonly Filter[], field: string, value: string): boolean => {
  const f = filters.find((x) => x.field === field);
  if (!f) return false;
  /* A SEGMENT SAYS WHAT YOU ARE LOOKING AT, so under a `not-in` filter it is on when the value is
     NOT excluded, which is what the grid underneath it shows. */
  /* COMPARED AS THE FIELD DECLARES IT, so a link written before there was one canonical spelling
     still lights the control it named. Every URL this build writes carries the declared value; a
     bookmark from before does not, and a bookmark is exactly the thing that outlives a fix. */
  const held = f.values.map((v) => declaredValue(register, field, v));
  const want = declaredValue(register, field, value);
  return f.op === 'not-in' ? !held.includes(want) : held.includes(want);
};

/**
 * One pill pressed, written into the address.
 *
 * Toggling KEEPS THE OPERATOR. It always wrote `:in:`, so one press on a neighbouring segment of a
 * `not-in` filter turned exclusion into inclusion and pulled the excluded rows back in, silently,
 * and in the direction that adds rows to a figure somebody had just clicked through to check.
 */
export function toggleChip(p: URLSearchParams, filters: readonly Filter[], field: string, value: string): void {
  const existing = p.getAll('f').filter((v) => !v.startsWith(`${field}:`));
  const at = filters.find((f) => f.field === field);
  const op = at?.op ?? 'in';
  const current = at?.values ?? [];
  const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  p.delete('f');
  for (const v of existing) p.append('f', v);
  if (values.length) p.append('f', `${field}:${op}:${values.join(',')}`);
}

/** A list clause the bar draws as its own chip: the filter, where it sits in the address, and the field it narrows. */
export type Listed = { f: Filter; at: number; field: FieldDecl | undefined };

/**
 * The clauses a pill cannot draw: `has` and `lacks` on a list field, which has no declared set of values to light.
 *
 * THE INDEX RATHER THAN THE TEXT, so taking one off is exact. Rebuilding the chip from the parsed
 * filter would have to spell the value back the way the URL held it, and `chipsOf` deliberately
 * keeps a value's colons: `handles:has:git:jokonkwo` rebuilt and compared would match, and a
 * value the encoder had spelled differently would not, leaving a chip that cannot be pressed off.
 */
export const listedOf = (filters: readonly Filter[], decl: RegisterDecl | undefined): Listed[] =>
  filters
    .map((f, at) => ({ f, at, field: decl?.fields.find((d) => d.id === f.field) }))
    .filter((c) => (c.f.op === 'has' || c.f.op === 'lacks') && c.field?.type === 'list');

/** The address without the clause at `at`, every other clause kept in its order. */
export function dropChip(p: URLSearchParams, at: number): void {
  const rest = p.getAll('f').filter((_, i) => i !== at);
  p.delete('f');
  for (const v of rest) p.append('f', v);
}

/**
 * THE QUICK FILTER: the slices a list with a deadline and finished states is looked at by, in one segmented control
 * over its rows (money F7): "All 38 · Late 4 · Due soon 2 · Paid 10". Each is a set of the
 * address's own chips, so a link, Back and a saved view read it as any filter; the segment is on when the chips on its
 * two fields (the state and the deadline) are exactly its own. Counted over the whole list only (`counted`), since a
 * count of the rows in hand is a false one while the list is still paging.
 */
export type Quick = { key: 'all' | 'late' | 'soon' | 'done'; label: string; chips: readonly string[]; count: number | null };

/** The chip a filter is written as in the address, `field:op:a,b`. */
export const chipText = (f: Filter): string => `${f.field}:${f.op}:${f.values.join(',')}`;

export function quickOf(decl: RegisterDecl | undefined, entries: readonly Entry[], now: number, counted: boolean): Quick[] {
  const dated = deadlineOf(decl);
  const field = decl?.state ? decl.fields.find((f) => f.id === decl.state) : undefined;
  const values = field?.type === 'enum' ? (field.values ?? []) : [];
  const done = values.filter((v) => decl?.done?.includes(v));
  const open = values.filter((v) => !decl?.done?.includes(v));
  if (!decl?.state || !dated || done.length === 0 || open.length === 0) return [];
  const openChip = `${decl.state}:in:${open.join(',')}`;
  const soonOf = (e: Entry): boolean => {
    const v = e.fields[dated];
    if (typeof v !== 'string' || !DAY_RE.test(v) || isDone(decl, e)) return false;
    const days = (Date.parse(`${v}T12:00:00Z`) - now) / DAY_MS;
    return days >= 0 && days < SOON_DAYS;
  };
  const first = done[0]!;
  const n = (keep: (e: Entry) => boolean): number | null => (counted ? entries.filter(keep).length : null);
  return [
    { key: 'all', label: words.quickAll, chips: [], count: counted ? entries.length : null },
    { key: 'late', label: words.quickLate, chips: [openChip, `${dated}:before:today`], count: n((e) => isLate(decl, e, now)) },
    { key: 'soon', label: words.quickSoon, chips: [openChip, `${dated}:after:yesterday`, `${dated}:before:+${SOON_DAYS}d`], count: n(soonOf) },
    { key: 'done', label: field ? labelOfValue(field, first) : first, chips: [`${decl.state}:in:${first}`], count: n((e) => String(e.fields[decl.state!] ?? '') === first) },
  ];
}

/** "Due soon" is what the list's tone calls it: due within two weeks (`toneOf`'s `warn`). */
const SOON_DAYS = 14;

const labelOfValue = (f: FieldDecl, v: string): string => {
  const said = f.labels?.[v] ?? v.replace(/_/gu, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
};

/** Which quick slice the address is on: the one whose chips are exactly those on its fields, else none. */
export function quickOn(quick: readonly Quick[], filters: readonly Filter[], decl: RegisterDecl | undefined): Quick['key'] | null {
  if (quick.length === 0) return null;
  const fields = new Set([decl?.state, deadlineOf(decl)].filter(Boolean));
  const held = filters.filter((f) => fields.has(f.field)).map(chipText).sort();
  const found = quick.find((q) => q.chips.length === held.length && [...q.chips].sort().every((c, i) => c === held[i]));
  return found?.key ?? null;
}

/** The address on a quick slice: every chip on the state and the deadline taken off, and the slice's own put on. */
export function setQuickIn(p: URLSearchParams, quick: readonly Quick[], key: Quick['key'], decl: RegisterDecl | undefined): void {
  const fields = [decl?.state, deadlineOf(decl)].filter((f): f is string => Boolean(f));
  const rest = p.getAll('f').filter((v) => !fields.some((f) => v.startsWith(`${f}:`)));
  p.delete('f');
  for (const v of rest) p.append('f', v);
  for (const c of quick.find((q) => q.key === key)?.chips ?? []) p.append('f', c);
}

/**
 * WHICH BOX A TYPE TAKES IN A CELL. The types this grid already edited keep the boxes they had; the ones it gains
 * take the row page's, so a value new to the grid is typed here the way it is typed there.
 *
 * A MONEY AND A DURATION ARE TEXT WITH A DECIMAL KEYPAD, not `number`, because a number box hands back an empty
 * string for anything it cannot parse and `wrongMoney` would then be judging nothing. A ref is the number a person
 * says, so a numeric keypad. A url and an email take the browser's own box for the keyboard it brings, where the
 * row page types both as plain text; the value either box hands back is the text as typed, so the patch is the same.
 */
export function boxOf(type: string | undefined): { type: string; inputmode: 'decimal' | 'numeric' | undefined } {
  if (type === 'day') return { type: 'date', inputmode: undefined };
  if (type === 'int' || type === 'decimal') return { type: 'number', inputmode: undefined };
  if (type === 'money' || type === 'duration') return { type: 'text', inputmode: 'decimal' };
  if (type === 'ref') return { type: 'text', inputmode: 'numeric' };
  if (type === 'url' || type === 'email') return { type, inputmode: undefined };
  return { type: 'text', inputmode: undefined };
}

/* ── what the list says about itself: the sentence, the board's lanes, the summary tile ──────────────────────── */

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * THE THREE WAYS A LIST IS DRAWN FROM 640PX UP: the table, the board
 * and the cards. Below 640 a list is always the phone's cards, whatever the address asks for.
 *
 * IN THE ADDRESS, as `?view=board`, beside the filters and the sort: a link to a board opens on the board. The table
 * is the list's own shape and has no parameter, so every address written before the switch existed still opens as it
 * did. A board is asked for only where the list has lanes to draw (`laneFieldOf`); anywhere else it is the table. The
 * field the lanes are is `?lane=`, chosen in Display, and absent means the state.
 */
export type View = 'table' | 'board' | 'cards' | 'groups';

/**
 * WHAT A BARE ADDRESS OPENS ON: the table, except on a list of people that says which organisation each is with
 * (`orgFieldOf`), which opens grouped by it, since twenty-four colleagues of one company read as one line and not as
 * twenty-four. That list's table is then `?view=table`, so a link to it still opens the table.
 */
/** A list that draws in groups: people by organisation, and since 29 October organisations by kind. */
export const groupsOf = (decl: RegisterDecl | undefined): boolean => orgFieldOf(decl) !== null || orgRoleOf(decl) !== null || runsList(decl) || kpisList(decl);

/** The list of agent runs, which opens as one ledger of faces (`ListRuns`), its "List" in the switch where People's says Groups (L17). */
export const runsList = (decl: RegisterDecl | undefined): boolean => decl?.id === RUNS;

/** The key numbers, which open as their readings with a small chart each (`ListKpis`), "List" in the switch (L11). */
export const kpisList = (decl: RegisterDecl | undefined): boolean => decl?.id === 'kpis';

/* A LIST OF SENTENCES OPENS AS CARDS (1 Nov, L13): Learnings at 1512 was a one-column table of long lines; two columns
   of cards read them. Its table is `?view=table`. */
const SENTENCE_LISTS: ReadonlySet<string> = new Set(['learnings']);

export const homeViewOf = (decl: RegisterDecl | undefined): View => (groupsOf(decl) ? 'groups' : decl && SENTENCE_LISTS.has(decl.id) ? 'cards' : 'table');

export const viewOf = (asked: string | null, decl: RegisterDecl | undefined): View => {
  if (asked === 'cards' || asked === 'table') return asked;
  if (asked === 'board' && laneFieldOf(decl)) return 'board';
  if (asked === 'groups' && groupsOf(decl)) return 'groups';
  return homeViewOf(decl);
};

/** A view as the address and a kept default spell it, or nothing for a word that is not one. */
const viewWord = (v: unknown): View | undefined => (v === 'board' || v === 'cards' || v === 'table' || v === 'groups' ? v : undefined);

/**
 * THE FIELDS A BOARD CAN BE LAID OUT BY: every live choice field of two to twelve values, the list's state first and the
 * rest in the order the list declares them. A choice of one value is one lane, and a choice of forty is a table read
 * sideways, so neither is offered.
 */
export function laneChoicesOf(decl: RegisterDecl | undefined): FieldDecl[] {
  const fit = (decl?.fields ?? []).filter((f) => {
    const n = f.values?.length ?? 0;
    return f.type === 'enum' && !f.retired && n >= 2 && n <= 12;
  });
  return [...fit.filter((f) => f.id === decl?.state), ...fit.filter((f) => f.id !== decl?.state)];
}

/**
 * THE FIELD A BOARD'S LANES ARE: the one the address asks for (`?lane=priority`, chosen in Display) when it is one of the
 * choices, else the list's state, else its first choice field. A list with no choice field has nothing to lay out in
 * lanes and is never a board.
 */
export function laneFieldOf(decl: RegisterDecl | undefined, asked?: string | null): FieldDecl | undefined {
  const choices = laneChoicesOf(decl);
  return choices.find((f) => f.id === asked) ?? choices[0];
}

/** One lane of a board: a declared value and the rows in it, or `null` for the rows whose value is unset. */
export type Lane = { value: string | null; entries: Entry[] };

/**
 * THE ROWS IN LANES, one per declared value of the lane field in the order the list declares them, and each lane in the
 * order the rows came. A row whose value is empty, or holds one the list no longer declares, goes in a last lane of its
 * own, drawn only when it holds something: a row is never left off the board because it is in none of the lanes.
 */
export function lanesOf(decl: RegisterDecl | undefined, entries: readonly Entry[], asked?: string | null): Lane[] {
  const f = laneFieldOf(decl, asked);
  if (!f) return [];
  const values = f.values ?? [];
  const lanes: Lane[] = values.map((value) => ({ value, entries: [] }));
  const rest: Entry[] = [];
  for (const e of entries) {
    const at = values.indexOf(String(e.fields[f.id] ?? ''));
    if (at < 0) rest.push(e);
    else lanes[at]!.entries.push(e);
  }
  return rest.length > 0 ? [...lanes, { value: null, entries: rest }] : lanes;
}

/* ── the way a person keeps a list: their default, on this device for now ─────────────────────────────────── */

/**
 * HOW ONE PERSON LIKES ONE LIST TO OPEN: its order, its view, the field its board is laid out by and the columns they
 * hide. Each is what the address or the column cookie already says while they look; the default is that, kept, so a
 * list opened with nothing in its address opens the way they left it rather than in the order it was declared.
 *
 * ON THIS DEVICE FOR NOW, in `localStorage` under the record, the person and the list, and Display says so. It is
 * not a filter and not a view: which rows a person is looking at stays a saved view everyone can open.
 */
export type ListDefault = {
  /** `field:dir`, as `?sort=` spells it. Absent is the list's own order. */
  sort?: string | undefined;
  view?: View | undefined;
  /** The field a board's lanes are, when it is not the one the board takes by itself. */
  lane?: string | undefined;
  hidden: string[];
};

/** Where one person's default for one list is kept. */
export const defaultKey = (record: string, person: string, register: string): string =>
  `bd.list-default:${record}:${person}:${register}`;

/** The storage a default is kept in, as much of it as this needs, so a test can hand in a map or one that throws. */
export type Keep = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * A KEPT DEFAULT READ BACK, or `null` for none. Anything that is not the shape is none, because the device is a place
 * other code and other builds have written to, and a list that will not open is a worse answer than its own order.
 * A store that throws (a private window, blocked site data) is none too.
 */
export function readDefault(store: Keep | null, key: string): ListDefault | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return null;
    const text = (x: unknown) => (typeof x === 'string' && x !== '' ? x : undefined);
    return {
      sort: text(v.sort),
      view: viewWord(v.view),
      lane: text(v.lane),
      hidden: Array.isArray(v.hidden) ? v.hidden.filter((h): h is string => typeof h === 'string') : [],
    };
  } catch {
    return null;
  }
}

/** Keeps a default, or forgets it with `null`. Answers whether the device took it, and never throws. */
export function writeDefault(store: Keep | null, key: string, d: ListDefault | null): boolean {
  try {
    if (!store) return false;
    if (d) store.setItem(key, JSON.stringify(d));
    else store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the screen shows right now, as a default: the address's order, view and lane, and the hidden columns. A lane
 * left in the address after the board was switched off is not kept, since nothing on screen is laid out by it.
 */
export function defaultFrom(p: URLSearchParams, hidden: ReadonlySet<string>): ListDefault {
  const view = p.get('view');
  return {
    sort: p.get('sort') || undefined,
    view: viewWord(view),
    lane: (view === 'board' && p.get('lane')) || undefined,
    hidden: [...hidden].sort(),
  };
}

/** Whether two defaults would open the list the same way. */
export const sameDefault = (a: ListDefault | null, b: ListDefault | null): boolean =>
  JSON.stringify(a && { ...a, hidden: [...a.hidden].sort() }) === JSON.stringify(b && { ...b, hidden: [...b.hidden].sort() });

/**
 * THE ADDRESS A LIST OPENS ON UNDER A DEFAULT, held up against what the list declares now: an order by a field it no
 * longer has is dropped, a board on a list with no lanes is dropped, a lane that is not a choice is dropped, and a
 * hidden column it no longer has is dropped. The rest still applies. An empty answer is nothing to change.
 */
export function defaultParams(d: ListDefault, decl: RegisterDecl | undefined): { params: URLSearchParams; hidden: string[] } {
  const fields = new Set(['seq', ...(decl?.fields.filter((f) => !f.retired).map((f) => f.id) ?? [])]);
  const params = new URLSearchParams();
  const [field, dir] = (d.sort ?? '').split(':');
  if (field && fields.has(field)) params.set('sort', `${field}:${dir === 'desc' ? 'desc' : 'asc'}`);
  /* A KEPT VIEW THE LIST OPENS ON ANYWAY WRITES NOTHING, and one it can no longer draw is dropped: a board with no lanes,
     a grouping with no organisation to group by. */
  const fits = d.view === 'cards' || d.view === 'table' || (d.view === 'board' && laneFieldOf(decl)) || (d.view === 'groups' && groupsOf(decl));
  if (d.view && fits && d.view !== homeViewOf(decl)) params.set('view', d.view);
  if (d.view === 'board' && d.lane && laneChoicesOf(decl).some((f) => f.id === d.lane)) params.set('lane', d.lane);
  return { params, hidden: d.hidden.filter((h) => fields.has(h) && h !== decl?.title) };
}

/** Where a navigation came from or went to, as much of SvelteKit's `NavigationTarget` as `arrivedAt` reads. */
type Navigated = { url: URL | null; params?: Readonly<Record<string, string | undefined>> | null } | null;

/**
 * THE LIST A NAVIGATION ARRIVES AT, whose default then applies: the list a bare address names, reached from another
 * address or as the tab's first load. `null` for a move inside the list, and for an address that already asks for
 * something.
 *
 * A FIRST LOAD CAME FROM NOWHERE, AND SVELTEKIT SAYS SO WITH A `from` WHOSE `url` IS `null`. The app is a static shell,
 * so its router starts on `type: 'enter'` from a state that has no address yet, and `from` is that state rather than
 * `null`. `from?.url.pathname` read a property of that `null`, so a list opened at its own address threw inside
 * `afterNavigate` and never drew.
 */
export function arrivedAt(from: Navigated, to: Navigated): string | null {
  if (!to?.url || to.url.search !== '' || from?.url?.pathname === to.url.pathname) return null;
  return to.params?.register ?? null;
}

/**
 * WHERE A ROW STANDS, for the small dot drawn before its state's word: `open` while it is still to do, in
 * the working accent; `done` once the list calls its state finished, in grey; `late` past its deadline, in red, whatever
 * its state says. Three answers and not more, because the declaration says which states are finished and nothing else:
 * a fourth colour for "on the way" was a guess from the order the values are written in, and on Tasks it painted
 * "Later" as working and "Doing" as waiting. The word beside the dot says which open state it is.
 */
export type Stand = 'open' | 'done' | 'late';

export function standOf(decl: RegisterDecl | undefined, value: string, late: boolean): Stand {
  if (decl?.done?.includes(value)) return 'done';
  return late ? 'late' : 'open';
}

/**
 * A STATE AS ITS DOT (`StateDot`): a finished state is the filled slate, a state that
 * says part of it is done ("Part paid") the half-filled ring, and every other open state the hollow ring. NEVER RED: a
 * row's lateness is said where the date is, in the word "late" beside a red dot, and not in its state's colour.
 */
export function dotOf(decl: RegisterDecl | undefined, value: string): 'open' | 'part' | 'done' {
  if (decl?.done?.includes(value)) return 'done';
  return /^part(?:$|[_\s-])/iu.test(value) ? 'part' : 'open';
}

/** Whether a row is in one of the list's finished states ("Paid", "Done"). */
export const isDone = (decl: RegisterDecl | undefined, e: Entry): boolean =>
  Boolean(decl?.state && decl.done?.includes(String(e.fields[decl.state] ?? '')));

/**
 * WHETHER A ROW IS LATE, BY THE SAME CLOCK AS ITS DOT: its declared deadline is behind the record's instant and it is
 * not finished. The noon anchor is `toneOf`'s (`lib/record/api.ts`), so the sentence never counts a row late that the
 * list draws on time, or the other way round.
 */
export function isLate(decl: RegisterDecl | undefined, e: Entry, now: number): boolean {
  const dated = deadlineOf(decl);
  const due = dated ? e.fields[dated] : undefined;
  if (typeof due !== 'string' || !DAY_RE.test(due) || isDone(decl, e)) return false;
  return (Date.parse(`${due}T12:00:00Z`) - now) / DAY_MS < 0;
}

/**
 * Calendar days from the record's day to a day, as a card counts them: FROM THE RECORD'S DAY, NOT GREENWICH'S (AH22, as
 * `RowCards` and `soonSaid` already count). Counted in UTC days, Maya's Tasks said "the next due today" at 21:00 in New
 * York over a task Work called due tomorrow, and its board "Due in 2 days" where the task's own page said 3.
 */
const daysTo = (iso: string, now: number): number => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${recordToday(now)}T00:00:00Z`)) / DAY_MS);

/** A day inside a sentence: "today", "tomorrow", "in 3 days", or the date itself past two weeks. */
export function dayWord(iso: string, now: number): string {
  const n = daysTo(iso, now);
  if (n <= 0) return words.today;
  if (n === 1) return words.tomorrow;
  if (n <= 13) return words.inDays(n);
  return words.onDay(iso.slice(0, 4) === String(new Date(now).getUTCFullYear()) ? shortDay(iso) : day(iso));
}

/**
 * WHEN A ROW IS DUE, AS A BOARD CARD SAYS IT: "2 days late" when it is past its deadline, which is the one phrase on
 * the card drawn in red, and "Due tomorrow" when it is not. A finished row, and a row with no deadline,
 * says nothing about one.
 */
export function dueOf(decl: RegisterDecl | undefined, e: Entry, now: number): { text: string; late: boolean } | null {
  const dated = deadlineOf(decl);
  const due = dated ? e.fields[dated] : undefined;
  if (typeof due !== 'string' || !DAY_RE.test(due) || isDone(decl, e)) return null;
  if (isLate(decl, e, now)) {
    const n = -daysTo(due, now);
    return { text: n <= 0 ? words.dueToday : words.daysLate(n), late: true };
  }
  return { text: words.due(dayWord(due, now)), late: false };
}

/** A day as its month, "July", with the year when it is not the record's this year, "July 2025". */
function monthOf(day: string, now: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  const month = at.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return at.getUTCFullYear() === new Date(now).getUTCFullYear() ? month : `${month} ${at.getUTCFullYear()}`;
}

/** The list's name for how many rows, "1 bill" or "12 bills". */
const counted = (decl: RegisterDecl, n: number): string => `${n} ${(n === 1 ? decl.one : decl.name).toLowerCase()}`;

/** The record's own list of runs, which every record holds under this name. */
const RUNS = 'session';

/**
 * HOW MANY AGENTS ARE AT WORK ON THE LIST OF RUNS, by the record's one clock (`presenceOf`), a helper left out while the
 * run it works for is at work too: the rail's number, so the list says "12 at work" beside the pill's "12 working" and
 * not only "33 open", which counted every run not finished.
 */
export function atWorkIn(entries: readonly Entry[], now: number): number {
  const working = entries.filter((e) => presenceOf({ fields: e.fields as never }, now) === 'working');
  const runs = new Set(working.map((e) => `S${String(e.seq)}`));
  return working.filter((e) => !(typeof e.fields.parent === 'string' && runs.has(e.fields.parent))).length;
}

/* HOW MANY OF A CYCLE MAKE A MONTH, for a list that says how often each row renews. */
const PER_MONTH: Readonly<Record<string, number>> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, annual: 1 / 12, annually: 1 / 12 };

/**
 * THE ROWS' COST A MONTH, said as money ("$628"): the list's first money field over a choice field of how often it
 * renews (`cycle`, `billing`), each row's amount scaled to a month. Nothing where the rows hold two currencies, a cycle
 * this cannot scale, or no amounts at all.
 */
function monthlyOf(decl: RegisterDecl, rows: readonly Entry[]): string | null {
  const amount = decl.fields.find((f) => f.type === 'money' && !f.retired);
  const cycle = decl.fields.find((f) => f.type === 'enum' && /^(cycle|billing|every|period)$/iu.test(f.id));
  if (!amount || !cycle) return null;
  let total = 0;
  let currency: string | null = null;
  for (const e of rows) {
    const v = e.fields[amount.id];
    const c = String(e.fields[cycle.id] ?? '');
    if (!isMoney(v)) continue;
    const per = PER_MONTH[c];
    if (per === undefined) return null;
    if (currency !== null && v.currency !== currency) return null;
    currency = v.currency;
    total += v.amount * per;
  }
  if (currency === null || total <= 0) return null;
  /* A MONTH'S COST IS SAID IN WHOLE UNITS: a yearly plan scaled to a month has cents nobody pays. */
  const unit = 10 ** exponentOf(currency);
  return figureSaid({ currency }, Math.round(total / unit) * unit, true);
}

/**
 * WHAT THE LIST OF RUNS SAYS, COUNTING WHAT ITS ROWS SHOW (1 Nov, L16): "2 at work, 2 open" stood over two working runs
 * and one finished, the open two being the working two. Now each run is counted once, by what its line says: at work,
 * quiet, finished.
 */
function runsSaid(entries: readonly Entry[], open: number, now: number): string {
  const working = atWorkIn(entries, now);
  const quiet = Math.max(0, open - working);
  const done = entries.length - open;
  /* "0 AT WORK, 2 OPEN" STOOD OVER TWO ROWS MARKED ACTIVE (live check, 1 Nov): nothing at work is not said, and a run
     that is active but not working is said as the row says it, active, and that it has gone quiet. */
  const said = [working > 0 ? words.atWork(working) : '', quiet > 0 ? words.quietRuns(quiet) : '', done > 0 ? words.finished(done) : ''].filter(Boolean).join(', ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/* This module's own words, the sentence and the tile's reading lines. */
const words = {
  open: (n: number) => `${n} open`,
  atWork: (n: number) => `${n} at work`,
  quietRuns: (n: number) => `${n} active but quiet`,
  aMonth: (said: string) => `${said} a month`,
  finished: (n: number) => `${n} finished`,
  toSettle: (n: number) => `${n} to settle`,
  toShip: (n: number) => `${n} to ship`,
  renew: (n: number) => `${n} renew`,
  nextNamed: (title: string, when: string) => `next ${title} ${when}`,
  nothingOpen: 'Nothing is open',
  late: (n: number) => `${n} late`,
  noneLate: 'none late',
  nextDue: (when: string) => `the next due ${when}`,
  newest: (when: string) => `newest ${when}`,
  besidesYou: 'besides you',
  thisWeek: (n: number) => `${n} added this week`,
  allThisWeek: (n: number) => `All ${n} added this week`,
  newestNamed: (name: string) => `the newest ${name}`,
  lastCame: (name: string, when: string) => `Nothing new this week; the last added was ${name}, ${when}.`,
  noneThisWeek: 'Nothing new this week',
  quietSince: (name: string, month: string) => `${name} quiet since ${month}`,
  match: (n: number, of: number) => `${n} of ${of} ${n === 1 ? 'matches' : 'match'}.`,
  today: 'today',
  tomorrow: 'tomorrow',
  inDays: (n: number) => `in ${n} days`,
  onDay: (said: string) => `on ${said}`,
  due: (when: string) => `Due ${when}`,
  dueToday: 'Due today',
  daysLate: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} late`,
  allDone: (n: number) => (n === 1 ? 'The one here is finished.' : `All ${n} are finished.`),
  allOpen: (n: number) => (n === 1 ? 'The one here is still open' : `All ${n} are still open`),
  mostOpen: 'Most are still open',
  halfOpen: 'Half are still open',
  mostDone: 'Most are finished',
  lateTail: (n: number) => `; ${n} ${n === 1 ? 'is' : 'are'} late.`,
  most: (label: string, n: number, of: number) => `${label} holds the most, ${n} of ${of}.`,
  share: (label: string, pct: number) => `${label} holds ${pct}% of it.`,
  whole: (label: string) => `${label} holds all of it.`,
  largest: (title: string, pct: number) => `${title} is the largest, ${pct}% of the total.`,
  only: (title: string) => `${title} is the whole of it.`,
  quickAll: 'All',
  quickLate: 'Late',
  quickSoon: 'Due soon',
} as const;

/** The sentence under the title, cut round the phrase that needs him, which `PageHead` draws in red. */
export type Reading = { before: string; needs: string; after: string };

const plain = (text: string): Reading => ({ before: text, needs: '', after: '' });

/**
 * THE ONE LINE UNDER THE LIST'S TITLE: what is open, what is late, and when the next thing falls due.
 *
 * "12 open, 3 late, the next due tomorrow." with "3 late" red and nothing else, and "none late" when nothing is. A list
 * that declares no deadline stops after what is open; one with neither a state nor a deadline says how many it holds
 * and how new the newest is. Filtered, it says how many of the list match, which is the one fact the reader has just
 * asked for.
 *
 * IT SAYS NOTHING WHILE THE LIST IS STILL BEING PAGED (`whole` false): a count of the rows in hand, printed as the
 * list's, is the quiet lie paging introduces, and the head's own count already says `200+`.
 */
export function readingOf(
  decl: RegisterDecl | undefined,
  entries: readonly Entry[],
  now: number,
  at: { whole: boolean; filtered: boolean; matched: number; total: number; besides?: boolean; quiet?: { name: string; day: string } | null },
): Reading | null {
  if (!decl) return null;
  if (at.filtered) return plain(words.match(at.matched, at.total));
  if (!at.whole || entries.length === 0) return null;
  const dated = deadlineOf(decl);
  if (!decl.state && !dated) {
    /* WHAT IS NEW, NOT HOW MANY (1 Nov, L1): the bar beside the title already counts the list ("People 7"), so "7 people
       besides you, newest 2 min ago" said the count twice. The line says what came in this week and which came last,
       by name, which no other part of the screen says. */
    const newestE = entries.reduce<Entry | null>((best, e) => (!best || e.created > best.created ? e : best), null);
    const name = newestE && decl.title ? String(newestE.fields[decl.title] ?? '').trim() : '';
    const week = entries.filter((e) => now - Date.parse(e.created) < 7 * DAY_MS).length;
    if (!newestE) return null;
    /* ON A LIST OF PEOPLE, WHO HAS GONE QUIET LEADS (People's page says the same): "June Park quiet since July; 2 added
       this week." The page hands it over (`quiet`), since when somebody was last in touch is the list's `meets`. */
    const quiet = at.quiet ? words.quietSince(at.quiet.name, monthOf(at.quiet.day, now)) : '';
    if (week > 0) {
      const lead = week === entries.length && week > 1 ? words.allThisWeek(week) : words.thisWeek(week);
      if (quiet) return plain(`${quiet}; ${lead.charAt(0).toLowerCase()}${lead.slice(1)}.`);
      return plain(name && week > 1 ? `${lead}, ${words.newestNamed(name)}.` : name ? `${lead}: ${name}.` : `${lead}.`);
    }
    if (quiet) return plain(`${quiet}; ${words.noneThisWeek.toLowerCase()}.`);
    return plain(name ? words.lastCame(name, since(newestE.created, now)) : `${words.noneThisWeek}.`);
  }
  const open = entries.filter((e) => !isDone(decl, e));
  /* ONE STATE SAYS ITSELF: "16 live" over sixteen Live categories and "All 143 cleared" over a cleared ledger, where
     "16 open" and "Nothing is open" read as though the list were a queue of jobs. */
  const soleState = (rows: readonly Entry[]): string | null => {
    if (!decl.state || rows.length === 0) return null;
    const seen = new Set(rows.map((e) => e.fields[decl.state!]));
    const [v] = [...seen];
    if (seen.size !== 1 || typeof v !== 'string' || v.trim() === '') return null;
    const labels = (decl.fields.find((f) => f.id === decl.state) as { labels?: Record<string, string> } | undefined)?.labels;
    return (labels?.[v] ?? v).trim().replace(/[_-]+/gu, ' ').toLowerCase();
  };
  if (open.length === 0) {
    const all = entries.length > 1 ? soleState(entries) : null;
    return plain(all ? `All ${entries.length.toLocaleString('en')} ${all}.` : `${words.nothingOpen}.`);
  }
  /* "TO SETTLE" ON A LIST OF AMOUNTS (money F16): "28 open" read against a board's "Open 22", which counts one state; a
     bill part paid is still to settle, and the words say what the number counts. */
  const settles = decl.fields.some((f) => f.type === 'money') && Boolean(decl.done?.length);
  /* A STATE WITH NO FINISHED VALUE IS A KIND, NOT A STAGE: Projects' lane is Building,
     Earning, Parked or Finished and declares none of them done, so every row read as open, and "30 open." stood over
     Parked and Finished rows. Such a list says how many it holds, in its own word. */
  const staged = Boolean(decl.done?.length);
  /* A LIST OF RENEWALS RENEWS, IT IS NOT SETTLED: Services' deadline is the day a domain or a
     plan renews, so "34 to settle" over them was the bills' word. It says what renews and which comes next, by name. */
  const renews = Boolean(dated && /^renew/iu.test(dated) && decl.done?.length);
  const lead =
    renews
      ? words.renew(open.length)
      : decl.id === RUNS
      ? runsSaid(entries, open.length, now)
      : decl.state && staged
        ? settles && dated
          ? /* ORDERS ARE SHIPPED, NOT SETTLED (audit 31 Oct o, AO16): the list said "3 to settle" where the Orders page
               over the same rows says "3 to ship". One word for one count. */
            (/^orders?$/iu.test(decl.one ?? '') || /^orders?$/iu.test(decl.name) ? words.toShip : words.toSettle)(open.length)
          : soleState(open)
            ? `${open.length.toLocaleString('en')} ${soleState(open)}`
            : words.open(open.length)
        : counted(decl, open.length);
  /* A LINE THAT IS ONLY THE COUNT IS NOT SAID: the head beside the title already draws it ("Projects 4" over "4 projects.").
     A LIST OF KINDS SAYS HOW IT SPLITS INSTEAD (1 Nov, L18): Projects' lane is Building, Earning, Parked or Finished, so
     its line is "2 building, 1 earning, 1 parked.", what the sidebar's "4 in play" is made of. */
  if (!dated) {
    if (lead !== counted(decl, entries.length)) return plain(`${lead}.`);
    const f = decl.state ? decl.fields.find((x) => x.id === decl.state) : undefined;
    const parts = (f?.type === 'enum' ? (f.values ?? []) : [])
      .map((v) => ({ v, n: entries.filter((e) => String(e.fields[f!.id] ?? '') === v).length }))
      .filter((x) => x.n > 0);
    return parts.length >= 2 ? plain(`${parts.map((x) => `${x.n} ${labelOfValue(f!, x.v).toLowerCase()}`).join(', ')}.`) : null;
  }
  const late = open.filter((e) => isLate(decl, e, now)).length;
  const coming = open
    .map((e) => ({ e, v: e.fields[dated] }))
    .filter((x): x is { e: Entry; v: string } => typeof x.v === 'string' && DAY_RE.test(x.v) && (Date.parse(`${x.v}T12:00:00Z`) - now) / DAY_MS >= 0)
    .sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  const next = coming[0]?.v;
  const nextTitle = decl.title && coming[0] ? String(coming[0].e.fields[decl.title] ?? '').trim() : '';
  const tail = next ? `, ${renews && nextTitle ? words.nextNamed(nextTitle, dayWord(next, now)) : words.nextDue(dayWord(next, now))}.` : '.';
  /* WHAT IT ALL COSTS A MONTH (1 Nov, L14): "7 renew, $628 a month; next GitHub in 12 days." */
  const monthly = renews ? monthlyOf(decl, open) : null;
  if (renews && late === 0) return plain(monthly ? `${lead}, ${words.aMonth(monthly)}; ${tail.slice(2)}` : `${lead}${tail}`);
  return late > 0 ? { before: `${lead}, `, needs: words.late(late), after: tail } : plain(`${lead}, ${words.noneLate}${tail}`);
}

/**
 * WHETHER A SIDE OF THE MONEY TILE DRAWS ITS BAR: the bar splits a side by state, so a side holding one state is
 * a full bar whatever it holds, and two sides of two different sums drew two bars of one length. A side's late part and
 * the rest are two parts, so it still draws.
 */
export const drawsBar = (lines: readonly { late: unknown }[]): boolean => lines.length + lines.filter((l) => l.late).length >= 2;

/** One state's share of a list: the value, how many rows hold it, and whether it is a finished one. */
export type StatePart = { value: string; count: number; done: boolean };

/**
 * THE LIST COUNTED BY STATE, for the "By state" tile: a list whose state has two to six values, each counted over the
 * rows in hand. Counted only where those rows are the whole list, which is the caller's to know (`whole`); a list
 * nobody has put anything in, or whose rows hold none of the declared values, has no tile.
 */
export function byStateOf(decl: RegisterDecl | undefined, entries: readonly Entry[]): StatePart[] | null {
  const f = decl?.state ? decl.fields.find((x) => x.id === decl.state) : undefined;
  const values = f?.type === 'enum' ? (f.values ?? []) : [];
  if (!decl || values.length < 2 || values.length > 6) return null;
  const parts = values.map((value) => ({
    value,
    count: entries.filter((e) => String(e.fields[f!.id] ?? '') === value).length,
    done: decl.done?.includes(value) ?? false,
  }));
  return parts.some((p) => p.count > 0) ? parts : null;
}

/**
 * WHAT THE "BY STATE" TILE'S CHART MEANS, in one line. "Most are still open; 3 are late." on a list that declares its
 * finished states; on one that declares none, which state holds the most.
 *
 * NOTHING WHERE THE HEAD ALREADY SAID IT (`headSaid`): on a list that declares its finished states, the sentence under
 * the title is "28 open, 4 late", and "Most are still open; 4 are late." under it is the same news twice. The tile's
 * lines carry the split; which state holds the most is not in the head, so that one is still said.
 */
export function stateReading(
  decl: RegisterDecl,
  parts: readonly StatePart[],
  entries: readonly Entry[],
  now: number,
  label: (value: string) => string,
  headSaid = false,
): string | null {
  const all = parts.reduce((n, p) => n + p.count, 0);
  if (!decl.done?.length) {
    const top = parts.reduce((a, b) => (b.count > a.count ? b : a));
    return words.most(label(top.value), top.count, all);
  }
  if (headSaid) return null;
  const done = parts.filter((p) => p.done).reduce((n, p) => n + p.count, 0);
  const open = all - done;
  if (open === 0) return words.allDone(all);
  const late = entries.filter((e) => isLate(decl, e, now)).length;
  const lead = done === 0 ? words.allOpen(open) : open > done ? words.mostOpen : open === done ? words.halfOpen : words.mostDone;
  return late > 0 ? `${lead}${words.lateTail(late)}` : `${lead}.`;
}

/** The figure types a list can total. */
const FIGURES = new Set(['money', 'int', 'decimal']);

/**
 * A list's number column, totalled: the field, the currency a money field is in, the sum, and how many rows hold a value
 * (`seen`), which is what decides whether the figure says anything (`ListSummary`).
 */
export type Figured = {
  field: FieldDecl;
  currency: string | null;
  total: number;
  seen: number;
  valueOf: (e: Entry) => number | null;
  /** On a list of readings, one a day: the day of the newest, whose value `total` is (`figureOf`). */
  latest?: string;
};

/**
 * THE LIST'S NUMBER, WHEN IT HAS ONE, ADDED UP: the first figure its card declares, else the first figure field it
 * has. A money field is totalled only when every row is in one currency, because a sum of eight sterling invoices and
 * one euro one is a number, and it looks exactly like a right one. A column no row has filled has no total.
 */
export function figureOf(decl: RegisterDecl | undefined, entries: readonly Entry[]): Figured | null {
  if (!decl) return null;
  const ids = [...decl.mobile.slice(1), ...decl.fields.map((f) => f.id)];
  const field = ids.map((id) => decl.fields.find((f) => f.id === id)).find((f) => f !== undefined && FIGURES.has(f.type));
  if (!field) return null;
  const currencies = new Set<string>();
  const valueOf = (e: Entry): number | null => {
    const v = e.fields[field.id];
    if (field.type === 'money') return isMoney(v) ? v.amount : null;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  let total = 0;
  let seen = 0;
  for (const e of entries) {
    const n = valueOf(e);
    if (n === null) continue;
    const v = e.fields[field.id];
    if (isMoney(v)) currencies.add(v.currency.toUpperCase());
    total += n;
    seen += 1;
  }
  if (seen === 0 || currencies.size > 1) return null;
  const currency = field.type === 'money' ? ([...currencies][0] ?? null) : null;
  /* A LIST OF READINGS, ONE A DAY, IS SAID BY ITS NEWEST, never added up: Snapshots headed thirty nights of cash with
     "Nightly £1,039,080", a sum of one balance thirty times (recheck of 30 October, N2). A `day` held unique is what
     makes a list one reading a day. */
  const day = decl.fields.find((f) => f.type === 'day' && f.unique === true);
  if (day) {
    let newest: { on: string; value: number } | null = null;
    for (const e of entries) {
      const on = e.fields[day.id];
      const n = valueOf(e);
      if (typeof on !== 'string' || n === null) continue;
      if (newest === null || on > newest.on) newest = { on, value: n };
    }
    if (newest) return { field, currency, total: newest.value, seen, valueOf, latest: newest.on };
  }
  return { field, currency, total, seen, valueOf };
}

/**
 * A figure as a tile or a bar says it: money with its symbol ("£4,800.00"), anything else grouped ("9,800"). `whole`
 * is the column's (`wholeMoney`): where every amount in it is a whole number of pounds, the sum is too, and its ".00"
 * goes with theirs.
 */
export function figureSaid(fig: Pick<Figured, 'currency'>, n: number, whole = false): string {
  if (fig.currency) {
    const said = money(Math.round(n), fig.currency);
    const drawn = symbolFigure(said) ?? said;
    return whole ? withoutZeros(drawn) : drawn;
  }
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

/**
 * THE MONEY COLUMNS WHERE EVERY AMOUNT IS WHOLE, by field: each row that holds one holds no pence, so ".00" after all
 * thirty-eight says nothing and the column reads "£8,530". One amount with pence in it and every row keeps both
 * places, since a column that mixes "£600" and "£4,240.50" no longer lines up on its point. Counted in each
 * currency's own minor units, so a yen column was always whole and a dinar's three places are judged as three.
 */
export function wholeMoney(decl: RegisterDecl | undefined, entries: readonly Entry[]): Set<string> {
  const out = new Set<string>();
  for (const f of decl?.fields ?? []) {
    if (f.type !== 'money') continue;
    let seen = 0;
    let whole = true;
    for (const e of entries) {
      const v = e.fields[f.id];
      if (!isMoney(v)) continue;
      seen += 1;
      if (v.amount % 10 ** exponentOf(v.currency) !== 0) {
        whole = false;
        break;
      }
    }
    if (whole && seen > 0) out.add(f.id);
  }
  return out;
}

/** A drawn amount without its zero minor units: "£8,530.00" as "£8,530". An amount with pence in it comes back as it was. */
export const withoutZeros = (text: string): string => text.replace(/\.0+(?!\d)/u, '');

/**
 * THE FIELD A LIST'S NUMBER CANNOT BE ADDED ACROSS: the choice that says which way each amount goes, or what each is
 * measured over. Money in and money out added together is a number, and it looks exactly like a right one: a list of
 * bills and invoices totalled £168,794 of which some was owed to its owner and the rest by them.
 *
 * READ FROM THE DECLARATION, FOR ANY LIST. First the choice field that declares it qualifies the number
 * (`qualifies:`, the declaration's own word for "this amount is not readable without me": a cost's cycle, an amount's
 * direction). Where no field says so, a money list with exactly one required choice of two values that is not its
 * state: every row must be one of two kinds, so the list holds two sums. Two such fields, and nothing says which
 * divides the money, so it is totalled as one.
 */
export function directionOf(decl: RegisterDecl | undefined, figure: FieldDecl | undefined): FieldDecl | undefined {
  /* ONE READING OF IT, which the cards' and the table's sign read too (`money-way.ts`). */
  return figure ? wayField(decl, figure) : undefined;
}

/** One side of a list's number: the declared value it is for (`null` for rows that hold none), its rows and their sum. */
export type FigurePart = { value: string | null; entries: Entry[]; total: number; seen: number };

/**
 * THE LIST'S NUMBER, SAID ONCE FOR EACH WAY IT GOES (`directionOf`): one part per declared value that holds an amount,
 * in the order the list declares them, and never their sum. A list with no such field has one part, the whole of it.
 * Rows that hold an amount and none of the declared values are a last part of their own, so no money is left out of
 * the tile because nobody said which way it went.
 */
export function figureParts(decl: RegisterDecl | undefined, entries: readonly Entry[]): { fig: Figured; by: FieldDecl | undefined; parts: FigurePart[] } | null {
  const fig = figureOf(decl, entries);
  if (!fig) return null;
  /* A READING IS NOT SPLIT EITHER: the newest night is one figure, whichever way it was taken. */
  if (fig.latest !== undefined) return { fig, by: undefined, parts: [{ value: null, entries: [...entries], total: fig.total, seen: fig.seen }] };
  const by = directionOf(decl, fig.field);
  const part = (value: string | null, rows: Entry[]): FigurePart => {
    let total = 0;
    let seen = 0;
    for (const e of rows) {
      const n = fig.valueOf(e);
      if (n === null) continue;
      total += n;
      seen += 1;
    }
    return { value, entries: rows, total, seen };
  };
  if (!by) return { fig, by, parts: [part(null, [...entries])] };
  const values = by.values ?? [];
  const parts = values.map((v) => part(v, entries.filter((e) => String(e.fields[by.id] ?? '') === v)));
  const rest = part(null, entries.filter((e) => !values.includes(String(e.fields[by.id] ?? ''))));
  return { fig, by, parts: [...parts, rest].filter((p) => p.seen > 0) };
}

/**
 * THE ORDER A LIST WITH A DEADLINE OPENS IN, when nobody has asked for another: what is late first, the longest
 * overdue leading; then what is still to do by the day it falls due; then what has no day; then what is finished.
 * The head says "4 late", and the list under it opened in the order the rows were last touched, with the four spread
 * through thirty-eight and none of them on the first screen.
 *
 * A LIST WITH NO DEADLINE KEEPS THE RECORD'S ORDER, and so does any list sorted in its address. Within a band the
 * rows keep the order they came in, so two bills due the same day do not swap between two reads. `head` is the rows
 * added on this screen, which stay first: a row somebody has just typed is the one they are looking for.
 */
export function lateFirst(decl: RegisterDecl | undefined, entries: readonly Entry[], now: number, head: ReadonlySet<number> = new Set()): Entry[] {
  const dated = deadlineOf(decl);
  if (!dated) return [...entries];
  const dueOn = (e: Entry): string => {
    const v = e.fields[dated];
    return typeof v === 'string' && DAY_RE.test(v) ? v : '';
  };
  const band = (e: Entry): number => {
    if (head.has(e.seq)) return 0;
    if (isDone(decl, e)) return 4;
    if (dueOn(e) === '') return 3;
    return isLate(decl, e, now) ? 1 : 2;
  };
  return entries
    .map((e, at) => ({ e, at, band: band(e) }))
    /* THE FINISHED, THE MOST RECENTLY DUE FIRST (skills pass 2 Nov): they came in the record's order, "27 Oct, 31 Oct,
       29 Oct, 30 Oct", under rows sorted by their day. */
    .sort((a, b) => a.band - b.band || ((a.band === 1 || a.band === 2) && dueOn(a.e).localeCompare(dueOn(b.e))) || (a.band === 4 && dueOn(b.e).localeCompare(dueOn(a.e))) || a.at - b.at)
    .map((x) => x.e);
}

/**
 * WHERE THE LIST'S NUMBER SITS, as bars and the line saying what they mean: split by state when the list has one (each
 * state's share of the total), else its five largest rows by name. Only parts that hold something are drawn.
 */
export function figureSplit(
  decl: RegisterDecl,
  fig: Figured,
  entries: readonly Entry[],
  label: (value: string) => string,
  titleOf: (e: Entry) => string,
): { items: { label: string; value: number }[]; reading: string } | null {
  /* BY STATE ONLY: the tile says where the money is in the list's own progress, whatever the board is laid out by. */
  const lanes = decl.state && laneFieldOf(decl)?.id === decl.state ? lanesOf(decl, entries).filter((l) => l.value !== null) : [];
  const sum = (rows: readonly Entry[]) => rows.reduce((n, e) => n + (fig.valueOf(e) ?? 0), 0);
  const items =
    lanes.length > 0
      ? lanes.map((l) => ({ label: label(l.value!), value: sum(l.entries) })).filter((i) => i.value > 0)
      : entries
          .map((e) => ({ label: titleOf(e), value: fig.valueOf(e) ?? 0 }))
          .filter((i) => i.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);
  if (items.length === 0 || fig.total <= 0) return null;
  const top = items.reduce((a, b) => (b.value > a.value ? b : a));
  const pct = Math.round((top.value / fig.total) * 100);
  const reading =
    lanes.length > 0
      ? items.length === 1
        ? words.whole(top.label)
        : words.share(top.label, pct)
      : items.length === 1 && pct === 100
        ? words.only(top.label)
        : words.largest(top.label, pct);
  return { items, reading };
}

/** The pages with one row's private mark set or cleared, after a good answer from the record; every other row is untouched. */
export function withPrivate<T extends { seq: number; private?: true }>(pages: readonly (readonly T[])[], seq: number, on: boolean): T[][] {
  return pages.map((page) =>
    page.map((e) => {
      if (e.seq !== seq) return e;
      const { private: _was, ...rest } = e;
      return (on ? { ...rest, private: true as const } : rest) as T;
    }),
  );
}

/**
 * THE HEAD'S COUNT: the answer's own count, which the record says with the first page,
 * and never a floor of what has been loaded. Numbers read "200+ of 2,527" over a list the record had counted. The cap
 * line counts against the same number, and a row typed here before the record counted it is counted.
 */
export const headCount = (p: { matched: number; drawn: number }): number => Math.max(p.matched, p.drawn);

/** THE FOOT WHILE THE REST IS ON ITS WAY, where the head now says the whole count: what is shown, and that more comes. */
export const shownSaid = (shown: number, of: number): string =>
  `Showing ${shown.toLocaleString('en')} of ${of.toLocaleString('en')}. More as you scroll.`;

/** A picked row's `data-menu-host` while more than one is picked: a right-click on it opens the selection's menu. */
export const SELECTION_MENU = '[data-selection-menu]';
