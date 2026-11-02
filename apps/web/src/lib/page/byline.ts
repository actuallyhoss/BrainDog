/**
 * WHO CHANGED A ROW FOR YOU, ON A PAGE (trust): a row an agent, a rule or Slash changed wears a faint tint
 * until you have seen it, and a quiet line, "Claude for Mara · 2h ago · Undo", where Undo puts that change back on the
 * record by its batch, saying first what else it takes back when the change touched more than the row (`byline-undo.ts`).
 *
 * THE RECORD SAYS WHO, AND `record/byline.ts` WORDS IT. A list block answers `changes` aligned with its rows: for each
 * row whose last change was an agent's, a rule's or Slash's, who signed it, when, the batch Undo puts back, and for a run
 * its agent and the person it works for. This gathers them across a page's blocks by the row each is about, and keeps
 * what this reader has seen.
 *
 * THE RECORD'S WORD CAN ONLY TAKE A TINT AWAY. It says a change is `unseen` while it is newer than the reader's read
 * mark, the one Home's news moves and nothing on a page does. So a row is new here only when the record does not say it
 * was seen AND it changed after this device's own mark for the page or the row.
 *
 * SEEN IS THIS READER'S, ON THIS DEVICE, where the record does not say it itself. A row is unseen while its change is
 * newer than the last time the reader left the page it is on, or opened that row; both are kept in the browser's
 * storage. A PAGE WITH NO MARK ON THIS DEVICE IS SEEN AS IT OPENS: the first visit starts the mark at that moment
 * (`seenOn`), so a plain load tints nothing and only a change that lands after it is new. Reading "no mark" as "seen
 * nothing" tinted every row of a 261-row ledger on a new device, which says nothing. The tint is never a loss: the line
 * and its Undo are in the row's panel whatever this says.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, no runes). Storage is handed in, so a test drives it.
 */

import { bylineOf, type Byline } from '../record/byline.ts';

export type { Byline };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A block as this reads it: its list, its rows by number, and the record's `changes` aligned with them. */
export type Changed = { register?: string | undefined; entries: readonly { seq: number }[]; changes?: unknown };

/**
 * EVERY CHANGE A PAGE'S BLOCKS CARRY, by the row's key (`tasks#3`), the newest where two blocks draw one row. A block
 * that answers no `changes`, or one not aligned with its rows, gives none. `seen` is what this reader has seen on the
 * page; a page left or a row opened since its change makes it not new, whatever the record says.
 */
export function bylinesIn(
  blocks: readonly Changed[],
  seen: Seen,
  me: string | null = null,
  names: ReadonlyMap<string, string> = new Map(),
  now: number = Date.now(),
): Map<string, Byline> {
  const out = new Map<string, Byline>();
  for (const b of blocks) {
    const changes = b.changes;
    if (!b.register || !Array.isArray(changes) || changes.length !== b.entries.length) continue;
    b.entries.forEach((e, n) => {
      const key = `${b.register}#${e.seq}`;
      const mark = Math.max(seen.page, seen.rows[key] ?? 0);
      /* WHO THE RUN IS, where the record says it on the change (`run_by`), is read there by `bylineOf`: "Claude Code". */
      /* NO MARK IS NO CLAIM (`record/byline.ts` `unseenOf`): only the record's own word can call the change new then. */
      const line = bylineOf(changes[n], me, names, now, mark > 0 ? new Date(mark).toISOString() : null);
      if (line === null) return;
      /* THE PAGE LEFT OR THE ROW OPENED SINCE IT CHANGED: seen, even where the record's own word says it is new. The
         record's word is the reader's read mark, which only Home's news moves (`markRead`), so a ledger an import wrote
         stayed tinted on every load, all 261 rows of it, however often the page was read. */
      const said = line.unseen && mark > 0 && mark >= Date.parse(line.at) ? { ...line, unseen: false } : line;
      const was = out.get(key);
      if (!was || Date.parse(said.at) > Date.parse(was.at)) out.set(key, said);
    });
  }
  return out;
}

/** A week, the most the record sends a page's changes for. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * THE ONE LINE AT THE FOOT OF THE BOARD: how many of the page's rows were changed for the reader this
 * week, and by whom, in one sentence. "5 changes by your rules this week". The list itself opens in the docked panel;
 * five lines over the page's questions, a bank's name in capitals on each, were noise above the work.
 *
 * BY WHOM IS SAID ONLY WHEN IT IS ONE KIND: your rules, Slash, or the one agent by its name. Changes by more than one
 * kind are "made for you". `null` when the week holds none.
 */
export function changedLine(lines: Iterable<Byline>, now: number = Date.now()): { count: number; text: string } | null {
  const week = [...lines].filter((b) => now - Date.parse(b.at) <= WEEK_MS);
  if (week.length === 0) return null;
  const kinds = new Set(week.map((b) => b.by));
  const names = new Set(week.map((b) => b.name));
  const one = kinds.size === 1 ? week[0]! : null;
  const by =
    one === null
      ? bylineWords.madeForYou
      : one.by === 'rule'
        ? bylineWords.byRules
        : one.by === 'slash' || (one.by === 'agent' && names.size === 1)
          ? /* AN APP WITH NO NAME OF ITS OWN IS "another app" (domains lane, 2 Nov): its kind's word, "Other", read
               "1 change on this page by Other this week". */
            /^other(?: apps?)?$/iu.test(one.name.trim())
            ? bylineWords.byAnotherApp
            : bylineWords.by(one.name)
          : bylineWords.madeForYou;
  return { count: week.length, text: bylineWords.changes(week.length, by) };
}

/** The words a byline adds on a page, kept with it. */
export const bylineWords = {
  undo: 'Undo',
  /** Over the page's own lines of what was changed for the reader since they last looked. */
  heading: 'Changed for you',
  /** The line at the foot of the board: "5 changes by your rules this week". */
  /* ON THIS PAGE, SAID (audit of 30 October, 17): each page counts the changes to the rows it shows, so Money said 3 and
     the Ledger 19 in the same week, and read as two answers to one question. */
  changes: (n: number, by: string) => `${n} ${n === 1 ? 'change' : 'changes'} on this page ${by} this week`,
  byRules: 'by your rules',
  by: (name: string) => `by ${name}`,
  byAnotherApp: 'by another app',
  madeForYou: 'made for you',
  /** The line's one action, which opens the list in the panel. */
  review: 'Review',
  /** The panel's title over the week's changes. */
  panelTitle: 'Changed on this page this week',
  /** What a screen reader hears for a line's Undo, with the row it is about. */
  undoNamed: (title: string) => `Undo the change to ${title}`,
  /** A change on a record that sends no batch for it, which this page cannot put back. */
  noUndo: 'This change cannot be put back from here.',
} as const;

/* ── seen ──────────────────────────────────────────────────────────────── */

/** What a reader has seen on one page: when they last left it, and when they last opened each row, as epoch ms. */
export type Seen = { page: number; rows: Record<string, number> };

/** The part of `Storage` this reads and writes. */
export type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** How many rows' marks a page keeps: the newest, so the store never grows past what a page draws. */
const ROWS_KEPT = 200;

const KEY = (slug: string): string => `braindog.seen.${slug}`;

/** The browser's storage, or `null` where it cannot be reached: a private window, a blocked site, a test. */
export function storeOf(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * What the reader has seen on `slug`. A page with no mark kept (never left on this device, or a mark that does not
 * read) starts one at `now`, the moment it is opened: what is already there is seen, and what lands after is new.
 */
export function seenOn(slug: string, store: Store | null, now: number = Date.now()): Seen {
  try {
    const raw = store?.getItem(KEY(slug));
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!isObject(v)) return { page: now, rows: {} };
    const rows: Record<string, number> = {};
    if (isObject(v.rows)) for (const [k, t] of Object.entries(v.rows)) if (typeof t === 'number' && Number.isFinite(t)) rows[k] = t;
    return { page: typeof v.page === 'number' && Number.isFinite(v.page) && v.page > 0 ? v.page : now, rows };
  } catch {
    return { page: now, rows: {} };
  }
}

/** Keeps what the reader has seen on `slug`. A store that refuses keeps nothing, and nothing else changes. */
export function keepSeen(slug: string, seen: Seen, store: Store | null): void {
  const rows = Object.fromEntries(
    Object.entries(seen.rows)
      .sort((a, b) => b[1] - a[1])
      .slice(0, ROWS_KEPT),
  );
  try {
    store?.setItem(KEY(slug), JSON.stringify({ page: seen.page, rows }));
  } catch {
    /* A FULL OR BLOCKED STORE: the tint shows again on the next visit, and nothing is lost. */
  }
}
