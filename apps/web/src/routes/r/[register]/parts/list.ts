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

import { day, money, shortDay, since, symbolFigure, type Tone } from 'braindog-render';
import { copy } from '../../../../lib/copy.ts';
import { seqWidth } from '../../../../lib/record/api.ts';
import { declaredValue } from '../../../../lib/record/where.ts';
import { isMoney, type Entry, type FieldDecl, type Filter, type RegisterDecl } from '../../../../lib/record/schema.ts';

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
export function withoutGood<R extends { tone?: Tone | undefined }>(rows: readonly R[]): R[] {
  return rows.map((r) => (r.tone === 'good' ? { ...r, tone: undefined } : r));
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
export type View = 'table' | 'board' | 'cards';

export const viewOf = (asked: string | null, decl: RegisterDecl | undefined): View =>
  asked === 'cards' ? 'cards' : asked === 'board' && laneFieldOf(decl) ? 'board' : 'table';

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
  view?: 'board' | 'cards' | undefined;
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
      view: v.view === 'board' || v.view === 'cards' ? v.view : undefined,
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
    view: view === 'board' || view === 'cards' ? view : undefined,
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
  if (d.view === 'cards' || (d.view === 'board' && laneFieldOf(decl))) params.set('view', d.view);
  if (d.view === 'board' && d.lane && laneChoicesOf(decl).some((f) => f.id === d.lane)) params.set('lane', d.lane);
  return { params, hidden: d.hidden.filter((h) => fields.has(h) && h !== decl?.title) };
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

/** Calendar days from the record's instant to a day, as a card counts them. */
const daysTo = (iso: string, now: number): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS) - Math.floor(now / DAY_MS);

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

/** The list's name for how many rows, "1 bill" or "12 bills". */
const counted = (decl: RegisterDecl, n: number): string => `${n} ${(n === 1 ? decl.one : decl.name).toLowerCase()}`;

/* This module's own words, the sentence and the tile's reading lines. */
const words = {
  open: (n: number) => `${n} open`,
  nothingOpen: 'Nothing is open',
  late: (n: number) => `${n} late`,
  noneLate: 'none late',
  nextDue: (when: string) => `the next due ${when}`,
  newest: (when: string) => `newest ${when}`,
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
  at: { whole: boolean; filtered: boolean; matched: number; total: number },
): Reading | null {
  if (!decl) return null;
  if (at.filtered) return plain(words.match(at.matched, at.total));
  if (!at.whole || entries.length === 0) return null;
  const dated = deadlineOf(decl);
  if (!decl.state && !dated) {
    const newest = entries.reduce<string>((best, e) => (e.created > best ? e.created : best), '');
    return plain(newest ? `${counted(decl, entries.length)}, ${words.newest(since(newest, now))}.` : `${counted(decl, entries.length)}.`);
  }
  const open = entries.filter((e) => !isDone(decl, e));
  if (open.length === 0) return plain(`${words.nothingOpen}.`);
  const lead = decl.state ? words.open(open.length) : counted(decl, open.length);
  if (!dated) return plain(`${lead}.`);
  const late = open.filter((e) => isLate(decl, e, now)).length;
  const next = open
    .map((e) => e.fields[dated])
    .filter((v): v is string => typeof v === 'string' && DAY_RE.test(v) && (Date.parse(`${v}T12:00:00Z`) - now) / DAY_MS >= 0)
    .sort()[0];
  const tail = next ? `, ${words.nextDue(dayWord(next, now))}.` : '.';
  return late > 0 ? { before: `${lead}, `, needs: words.late(late), after: tail } : plain(`${lead}, ${words.noneLate}${tail}`);
}

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
 */
export function stateReading(
  decl: RegisterDecl,
  parts: readonly StatePart[],
  entries: readonly Entry[],
  now: number,
  label: (value: string) => string,
): string {
  const all = parts.reduce((n, p) => n + p.count, 0);
  if (!decl.done?.length) {
    const top = parts.reduce((a, b) => (b.count > a.count ? b : a));
    return words.most(label(top.value), top.count, all);
  }
  const done = parts.filter((p) => p.done).reduce((n, p) => n + p.count, 0);
  const open = all - done;
  if (open === 0) return words.allDone(all);
  const late = entries.filter((e) => isLate(decl, e, now)).length;
  const lead = done === 0 ? words.allOpen(open) : open > done ? words.mostOpen : open === done ? words.halfOpen : words.mostDone;
  return late > 0 ? `${lead}${words.lateTail(late)}` : `${lead}.`;
}

/** The figure types a list can total. */
const FIGURES = new Set(['money', 'int', 'decimal']);

/** A list's number column, totalled: the field, the currency a money field is in, and the sum. */
export type Figured = { field: FieldDecl; currency: string | null; total: number; valueOf: (e: Entry) => number | null };

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
  return { field, currency: field.type === 'money' ? ([...currencies][0] ?? null) : null, total, valueOf };
}

/** A figure as a tile or a bar says it: money with its symbol ("£4,800.00"), anything else grouped ("9,800"). */
export function figureSaid(fig: Pick<Figured, 'currency'>, n: number): string {
  if (fig.currency) {
    const said = money(Math.round(n), fig.currency);
    return symbolFigure(said) ?? said;
  }
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
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
