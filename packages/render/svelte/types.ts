/**
 * The `Table` primitive's props, in a `.ts` file so a consumer can import them as types.
 *
 * They live here rather than in `Table.svelte` because a type exported from a component's instance
 * script is not on the module's public surface — and the register grid, the declared page and the
 * shared page all need to build these shapes.
 */

import { type Column, type TableRow } from '../src/table.ts';
import { MISSING } from '../src/format.ts';

/* WHAT A `kpis` BLOCK IS HANDED AND WHAT IT DRAWS, from the plan that decides every figure and word (`../src/kpis.ts`),
   so a host builds the input `Kpis.svelte` takes without reaching into `src/`. */
export type { KpiInput, KpiPoint, KpiView } from '../src/kpis.ts';

/*
 * `Column`, `TableRow`, `chunkRows` and `ariaSort` MOVED TO `../src/table.ts` AND ARE RE-EXPORTED
 * HERE. None of them was ever markup, and while they lived under `svelte/` the HTML renderer could
 * not read them, so it hand-rolled a second, smaller answer for the same primitive and the two
 * trees came apart. They keep their names here because six call sites across three packages import
 * them from this path, and moving a type is not a reason to touch six files.
 */
export { ariaSort, chunkRows, comparisonPlan, glyphColumn, intrinsicRows, TABLE_CHUNK, TABLE_ROWS_LABEL, type Column, type TableRow } from '../src/table.ts';

/**
 * What a host hands `Block` to make a `capture` real: the register, the line as typed and trimmed, and
 * what the new row inherits from the block's `where:`, by field, in the form the record stores.
 *
 * ONE SIGNATURE, WRITTEN HERE, because three components pass it down (`Block`, `Panel`, `Capture`) and a
 * host builds one, and a callback type copied into four places is four places to change the day the
 * line learns to carry a date.
 */
export type OnCapture = (register: string, text: string, inherited: Record<string, string>) => void;

/**
 * One column of one row, as a phone card draws it. A card never holds an empty value, so `value` is text. `named` says
 * the card shows the column's name before the value, because the value alone does not say what it is (`cardCells`).
 */
export type CardCell = { column: Column; value: string; named?: true };

/**
 * Which columns a phone card may draw, as indexes into `columns`, decided once for the table. `-1` is none.
 *
 * A PHONE CARD IS THE LEAD, THE FIGURE AND AT MOST TWO UNLABELLED VALUES. Every column with its label is a form per
 * row on a phone, and it puts "#", ids and missing marks in front of the one thing a reader scans a
 * list for, so a card draws only what a reader reads down the list by.
 *
 *   - the TITLE is the first column aligned to the start, because text and refs start and a
 *     quantity, a date or a count ends (13 §4.2);
 *   - the first line ENDS on the first figure, a column that never truncates, because a figure
 *     never truncates. A table with no figure has no mark, and nothing takes its place;
 *   - `start` and `end` are the columns the second line may take its values from, text at its start
 *     and quantities at its end, so a running balance still reads down one edge of the list.
 *
 * AN IDENTIFIER IS NEVER ON A CARD, and neither is a control. A column that truncates in the middle is
 * an identifier by the table's own declaration (`Column.truncate`), and so is one headed "#"; a row
 * picker's `hideLabel` says it is a control and not a value. The whole card is the row's target, so
 * neither has anything to add to it.
 */
export type CardPlan = { title: number; mark: number; start: number[]; end: number[] };

const isIdentifier = (c: Column): boolean => c.truncate === 'middle' || c.label.trim() === '#';

export function cardPlan(columns: readonly Column[]): CardPlan {
  const first = (test: (c: Column, i: number) => boolean) =>
    columns.findIndex((c, i) => !c.hideLabel && !isIdentifier(c) && test(c, i));
  const byText = first((c) => c.align !== 'end');
  const title = byText >= 0 ? byText : first(() => true);
  const mark = first((c, i) => i !== title && c.truncate === 'never');
  const start: number[] = [];
  const end: number[] = [];
  columns.forEach((c, i) => {
    if (i !== title && i !== mark && !c.hideLabel && !isIdentifier(c)) (c.align === 'end' ? end : start).push(i);
  });
  return { title, mark, start, end };
}

/** How many values the second line of a phone card holds at most, on a card 390px wide. */
export const CARD_VALUES = 2;

/** One row's phone card: its lead, its figure and the values on its second line, every one of them there to read. */
export type PhoneCard = { title: CardCell | null; mark: CardCell | null; start: CardCell[]; end: CardCell[] };

/**
 * A value a card can draw: text that is there, that is not the record's missing mark and that is not a
 * row's spoken number (`#12`), which is an id a person would never say about the row in front of them.
 */
const drawable = (value: string | null | undefined): value is string => {
  const t = value?.trim() ?? '';
  return t !== '' && t !== MISSING && !/^#\d+$/u.test(t);
};

/**
 * One row as a phone card draws it, from the table's plan.
 *
 * AN EMPTY VALUE IS DROPPED, NOT MARKED. On a grid a missing cell keeps its box and draws the mark,
 * because the column is still there above it; a card has no columns to keep, so the missing mark on it
 * would stand in for nothing. The second line takes the first
 * `CARD_VALUES` values that are there, in the table's column order, so a row with a blank note shows
 * its date and its balance rather than its date and a hole.
 *
 * A missing title or figure leaves its place empty rather than promoting the next column into it:
 * the lead of every card in one list is the same column, so a reader scanning the lead edge is never
 * reading two kinds of thing.
 */
export function cardCells(row: TableRow, columns: readonly Column[], plan: CardPlan = cardPlan(columns)): PhoneCard {
  const at = (i: number): CardCell | null => {
    const column = columns[i];
    const value = row.cells[i];
    return column && drawable(value) ? { column, value } : null;
  };
  const rest = [...plan.start, ...plan.end]
    .sort((a, b) => a - b)
    .map(at)
    .filter((c): c is CardCell => c !== null)
    .slice(0, CARD_VALUES);
  const mark = at(plan.mark);
  /* A SECOND FIGURE NAMES BOTH: "Was £34" and "Now £39", where the card said "£34" over "£39" (B11). */
  const twoFigures = mark !== null && isFigure(mark.value) && rest.some((c) => isFigure(c.value));
  const named = (c: CardCell): CardCell => (c.column.named === true || isCount(c.value) || (twoFigures && isFigure(c.value)) ? { ...c, named: true } : c);
  const said = rest.map(named);
  return {
    title: at(plan.title),
    mark: mark && twoFigures ? { ...mark, named: true } : mark,
    start: said.filter((c) => c.column.align !== 'end'),
    end: said.filter((c) => c.column.align === 'end'),
  };
}

/**
 * WHEN A CARD SAYS A COLUMN'S NAME (audit 31 Oct, B11). Most values say what they are without one: a day reads as a day,
 * "Every month" as how often, the figure beside a title as that thing's amount. Two kinds do not. A BARE COUNT is a
 * number with nothing to say what it counts, so a savings circle's card read "£200" over "10 4", its people and your
 * turn; it reads "People 10" and "Your turn 4". And A SECOND FIGURE beside the first: a subscription that went up read
 * "£34" over "£39", which is the price it was and the price it is, so both are named, "Was £34" and "Now £39".
 */
const isCount = (value: string): boolean => /^[+\-\u2212]?\d[\d,.]*%?$/u.test(value.trim());

/** A money figure: digits with a currency's sign or code beside them. */
const isFigure = (value: string): boolean => /\d/u.test(value) && (/\p{Sc}/u.test(value) || /(?:^|[\s\-\u2212+])[A-Z]{3}(?:\s|\u00a0)/u.test(value));

/** Where the caret is, in data rows and columns. The header is not a row it can be on. */
export type Cell = { row: number; col: number };

/**
 * Where the grid's one tab stop goes next, or `null` when the key is not the grid's.
 *
 * THE GRID SHIPPED A ROVING TABINDEX AND NO ROVER. `role="grid"`, `role="gridcell"` on every cell,
 * exactly one of them `tabindex="0"` and no arrow handler anywhere in the component. The only
 * `onkeydown` it had was `Enter` on a cell that could be activated. Two of its six callers bring
 * their own arrows; the other four do not, and on those four a keyboard user tabbed to cell (0,0)
 * and tabbed straight back out, every other cell in the table unreachable. The component's own
 * comment claimed the opposite in the present tense: *"a composite widget with one tab stop, arrow
 * keys inside it, and a caret a screen reader can follow along a row."* One tab stop is the whole
 * argument for `role="grid"` over `role="table"`, and at 500 rows by 8 columns it is the difference
 * between one tab stop and four thousand. It is a bargain the reader only wins if the arrows
 * are there to spend it on.
 *
 * Here rather than inside the component for the reason `chunkRows` is here: none of it is markup,
 * and a caret that walks off the end of a row is not visible in a rendered tree.
 *
 * IT CLAMPS AND DOES NOT WRAP, which is `moveTick`'s rule and `board.ts`'s: under wrapping the
 * cheapest possible slip, one press too many, becomes the largest possible move. The clamp is not
 * a `null` either: the arrow is swallowed at the edges too, so the last press before the end of a
 * row does not suddenly scroll the page instead of moving the caret.
 *
 * `Home` AND `End` ARE THE ROW'S ENDS, not the grid's, because a row here has columns to be at the
 * end of. That is what the register grid has always bound them to, and what the APG grid pattern
 * asks for; the whole-grid ends are the same keys with a modifier, which belong to whoever owns
 * the page rather than to one block on it.
 *
 * `from` is clamped before it is moved, so a caller whose caret is parked outside a table that has
 * since got smaller is brought back inside by the first press rather than left with nowhere to go.
 */
export function moveCell(from: Cell, key: string, rows: number, cols: number): Cell | null {
  if (rows <= 0 || cols <= 0) return null;
  const lastRow = rows - 1;
  const lastCol = cols - 1;
  const at = {
    row: Math.max(0, Math.min(Number.isFinite(from.row) ? Math.floor(from.row) : 0, lastRow)),
    col: Math.max(0, Math.min(Number.isFinite(from.col) ? Math.floor(from.col) : 0, lastCol)),
  };
  switch (key) {
    case 'ArrowDown':
      return { ...at, row: Math.min(at.row + 1, lastRow) };
    case 'ArrowUp':
      return { ...at, row: Math.max(at.row - 1, 0) };
    case 'ArrowRight':
      return { ...at, col: Math.min(at.col + 1, lastCol) };
    case 'ArrowLeft':
      return { ...at, col: Math.max(at.col - 1, 0) };
    case 'Home':
      return { ...at, col: 0 };
    case 'End':
      return { ...at, col: lastCol };
    default:
      return null;
  }
}

/* ── the control room: telling agents, who is working, what each was told (agents and MCP plan §7.1) ─────────── */

/*
 * THE PARTS OF THE AGENTS PAGE A PERSON DRIVES, AS WHAT THEY DRAW AND NOTHING THEY READ. The host reads the record
 * (`presence`, `instructionList`) and words every line (`apps/web/src/lib/record/instruct.ts`); these shapes are what it
 * hands `Instruct`, `Presence` and `Instructions`, so a renderer holds no clock, no route and no run's handle as a word.
 * Every string here is ready to read; an id is only ever a `key` a callback is handed back.
 */

/** An agent's maker mark, as `RenderOptions.agentMark` answers one: the path, its fill rule and its tone. */
export type ControlMark = { d: string; rule: 'evenodd' | 'nonzero'; tone: string };

/** One choice in the composer's "To" or "On": what it is handed back as, and what it says. */
export type InstructChoice = { key: string; label: string };

/** The composer as the host worked it out: who it goes to, where, when, and what happens next in plain words. */
export type InstructView = {
  /** "Whoever's next", each kind of agent, then each live run by name. */
  to: readonly InstructChoice[];
  toKey: string;
  /** "Any project", then each project by name. */
  on: readonly InstructChoice[];
  onKey: string;
  /** Whether "On" can be changed: a live run is on its own project. */
  onFixed: boolean;
  /** "Any machine", then each machine his runs are on, by name: drawn only when there are two to choose between. */
  machine?: readonly InstructChoice[];
  machineKey?: string;
  /** "Any profile", then each Claude Code profile his runs are under, by name: drawn only when there are two. */
  seat?: readonly InstructChoice[];
  seatKey?: string;
  /** Both when a matching run is live; only the one it can be otherwise. */
  when: readonly ('now' | 'next')[];
  whenKey: 'now' | 'next';
  /** What happens once it is sent, said as a sentence. */
  next: string;
  /** The agent kind it is for, for its mark beside "To"; `null` for whoever's next. */
  agent: string | null;
  /** Sending now. */
  busy: boolean;
  /** What the record refused, in its words, under the field. */
  fault: string | null;
};

/** One stretch of an instruction's bar: reached, the one it is at, or not yet. */
export type ThreadStep = 'done' | 'at' | 'ahead';

/** What an instruction's run changed while it held it, said by name, with the way back while there is one. */
export type ThreadReceipts = {
  /** "4 changes", or "1 change". */
  said: string;
  /** The changed things by name, at most a few. */
  names: readonly string[];
  /** "and 3 more", or nothing. */
  more: string | null;
  /** Whether Undo all is offered. */
  undo: boolean;
  /** What putting them back did, once it has. */
  undone: string | null;
  /** "New commits on axis-qa", when the run's head moved. */
  commits: string | null;
};

/** One instruction as a thread: what he said, to whom, how far it got, the agent's reply and what it changed. */
export type ThreadView = {
  key: string;
  said: string;
  /** "Claude · Kiln · now". */
  to: string;
  /** The agent kind it went to or was taken by, for its mark and the hue of its bar; `null` for nobody yet. */
  agent: string | null;
  /** Sent, Seen, Working, Done: the four stretches of the bar. */
  steps: readonly ThreadStep[];
  /** The state in a word or two: "Working 9 min", "Needs you", "Done". */
  word: string;
  /** `needs` is red and counts in Needs you; `ended` went nowhere (declined, expired, taken back). */
  tone: 'open' | 'done' | 'needs' | 'ended';
  /** "Sent 21:02 · Seen by Claude at 21:02, on its next prompt". */
  trail: string;
  /** The agent's answer in its words, and who said it when ("Claude at 21:14"). */
  reply: { by: string; text: string } | null;
  receipts: ThreadReceipts | null;
  /** Whether it can still be taken back: no run has taken it. */
  takeBack: boolean;
  /** Written here and not yet answered by the record. */
  sending: boolean;
  /** Pressing Take back or Undo all now. */
  busy: boolean;
};

/** One run open now, as the run row draws it, and what may be done to it. */
export type PresenceView = {
  key: string;
  /** The agent kind, for its mark and its hue. */
  agent: string | null;
  /** "Claude". */
  name: string;
  /** What it said it is doing, or nothing. */
  doing: string | null;
  /** The project's name and its slot (`blue`, `violet`…), for the dot; `null` on none. */
  project: { name: string; slot: string } | null;
  /** "axis-qa · working, heard 3 min ago". */
  meta: string;
  /** Working, thinking, waiting, or quiet: open and not heard from lately, which the face's dot says too. */
  live: 'working' | 'thinking' | 'waiting' | 'quiet';
  /** What it holds from him, in his words. */
  holds: string | null;
  /** "+2 helpers on axis-qa-2 and axis-qa-3". */
  helpers: string | null;
  /** Whether he paused or stopped it. */
  stopped: 'stop' | 'pause' | null;
  /** The honest line about what reaches it: hooks at its next tool call, or only its next BrainDog call. */
  reach: string;
  /** What Stop and Pause each say before they are pressed, in the agent's own terms. */
  confirm: { stop: string; pause: string };
  /** The run's own page. */
  href: string | null;
  /** Pressing now. */
  busy: boolean;
  /** How long it has run, for a row drawn on one line: "1 h 08 min". */
  time?: string;
  /** How it stands, for a row drawn on one line: "Working now", "Quiet for 40 min". */
  stands?: string;
  /**
   * The last thing it did, for a row drawn on one line, under its name: "Asked you: “Mark Wave 0 done?”", "Wrote 3
   * changes". Given, the row is headed by its name ("Claude Code in Kiln") and says this under it.
   */
  last?: string | null;
};
