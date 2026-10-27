/**
 * What `queue` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `feed.ts` and `cards.ts` are: an answer here can be tested
 * without a DOM, and two drawers that each worked it out would be two answers.
 *
 * WHAT IT IS FOR. A queue is the short list of things waiting on a person, with what their agents
 * recommend. It is the shape `20 §3` asks for and the one Decide is built around: a question, who
 * opened it, why it is being asked, and the ways to answer it.
 *
 * DEAREST FIRST, AND THE ORDER IS THE EVALUATOR'S. `19 §6` asks for the queue ranked by cost of
 * being wrong, and for a week this file said it was while `governance.open` ordered by recency —
 * a docstring making a promise the evaluator never made. The record computes the band now
 * (`@braindog/kernel`'s `weigh.ts`) from what accepting the proposal would do, and sends it down as
 * the question row's seventh cell. THIS NEVER REORDERS, and that has not changed: what is dearest
 * is the record's judgement to make, not the drawer's, and a queue that re-sorted what it was
 * handed would be a second ranking nobody could see the input to.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES, in the record's own order. A question and its options
 * are separate rows, the first cell saying which:
 *
 *   q    | id | who | when | question | why | cost
 *   opt  | id | key | label | because | recommended | shows, optional
 *   does | id | what accepting it changes, one line a row, optional
 *   more | n | where the rest of them are, optional
 *
 * The `more` row, last and at most one, is how many are waiting past the ones drawn, so a person
 * reading three cards knows whether that is the whole of it. The evaluator counts it; a queue that
 * silently drew the first three of nine would be a queue that lies about how much is waiting.
 *
 * AND ITS THIRD CELL IS WHERE THEY ARE, because a count with nowhere to press is a dead end: "5 more"
 * told a reader there was more and gave them no way to reach it. The ADDRESS IS THE EVALUATOR'S, never
 * this package's — a renderer that knew `/decide` would be a renderer with a route in it, and the
 * host is the only thing that knows where its own questions live (the same rule `cellHref` and `link`
 * follow). Without it the count is still drawn, as plain words.
 *
 * A ROW PER OPTION RATHER THAN ONE WIDE ROW, because the number of options is not fixed and a row of
 * cells is. `feed` already marks one of its rows the same way, with `seen`, so this is the primitive's
 * own idiom rather than a new one.
 *
 * `recommended` IS A LABEL AND NEVER A SELECTION. An agent's recommendation is drawn as a word beside
 * the option it names, and nothing is pre-chosen: a queue that arrives with an answer already filled
 * in is a queue that gets pressed through, which is the opposite of what a question is for. The same
 * rule as `19 §6` read from the other side.
 *
 * `shows` IS WHAT THE OPTION IS, drawn beside its label: which lining is a colour, which box is a price, which cut is
 * a photograph. Three spellings and no others, each one the kernel's `showsOf` already checked on filing:
 *
 *   swatch:#1f3a5f,#c9a227     one to eight colours, six hex digits each
 *   figure:EGP 1,200           a few words or a figure, drawn as text
 *   file:parts#2/photo         a file the record holds, by row and field, which only the host can turn into an address
 *
 * A SWATCH IS THE ONE PLACE A COLOUR FROM DATA REACHES A SCREEN (`05 §5`), so this package checks the spelling again
 * rather than trusting the kernel did: a cell that is not six hex digits could close the custom property it is written
 * into and write a style of its own. It is drawn only inside that option's visual, never as a colour the page, the card
 * or the tile is drawn in.
 *
 * A FIGURE IS WORDS SOMEBODY ELSE WROTE, as the label is, and an agent writes `3 of tasks#8` into one as readily as
 * a price. It is read through `spoken`, and drawn only when `spoken` takes nothing out of it.
 */

import { safeHref } from './inline.ts';
import { spoken } from './spoken.ts';

/**
 * A `does` ROW IS ONE LINE OF WHAT ACCEPTING THE QUESTION ABOVE IT CHANGES ("Adds 12 tasks to Work"), written by the
 * record from the proposal's body. Only the `lead` form draws them, on its first question, which is the one a person is
 * about to answer: a line of consequences under every card in the list is a page of small print nobody reads.
 */
/** The kinds of row, by their first cell. Closed, because a row filed under none of them is a fault. */
export const QUEUE_ROWS = ['q', 'opt', 'does', 'more'] as const;

export type QueueRowKind = (typeof QUEUE_ROWS)[number];

const isRowKind = (s: string): s is QueueRowKind => (QUEUE_ROWS as readonly string[]).includes(s);

/**
 * The renderer's own words, here for the reason `FEED_GROUPS` is in `feed.ts`: this package cannot
 * import the app's `copy.ts`, and these are the only words a queue draws that its author did not write.
 */
export const QUEUE_CLEARED = 'Nothing is waiting on you.';
export const QUEUE_RECOMMENDED = 'Recommended';
/** The accessible name of the lead question's lines of what accepting it changes. Never drawn as a heading. */
export const QUEUE_DOES = 'What it changes';

/**
 * What each cost band is called on screen, and the closed set of them.
 *
 * THE FACT IS THE RECORD'S AND THE WORDS ARE THIS PACKAGE'S, which is the same split `TONES` makes
 * in `kinds.ts`: the kernel decides which band a question is in, because that is a judgement about
 * the record, and it holds no English because a kernel with a reader in it is a kernel that has to
 * know what language they read. A band this package does not know draws nothing rather than drawing
 * its own name, because a chip reading `undo-ish` is worse than no chip.
 *
 * FOUR WORDS AND NO SENTENCE. The band is the reason the question is where it is in the list, and
 * that is all it says: a chip is a label, not an argument for the ranking. Why a proposal is
 * expensive is in the question's own `why`, written by whoever opened it.
 */
export const QUEUE_COSTS: Record<string, string> = {
  undo: 'Hard to undo',
  shape: 'Changes the setup',
  rows: 'Adds to or changes your things',
  call: 'Your call',
};

/**
 * What a question's band is called, or `''` for a band this package has no word for.
 *
 * `Object.hasOwn`, THE SAME GUARD `queueFault` TEN LINES DOWN ALREADY USES on this very table. A
 * plain-object read answers `constructor` with the Object constructor, so a band spelled that way
 * came back as a FUNCTION from a function declared to return a string, and `escape` throws on one.
 * The parser refuses that band before a fence can reach here, which is the only reason it was never
 * seen; `queueCost` is exported and a host calls it directly.
 */
export const queueCost = (band: string): string => (Object.hasOwn(QUEUE_COSTS, band) ? QUEUE_COSTS[band]! : '');
/** What the last line says when a queue holds more than it draws. */
export const queueMore = (n: number): string => `${n} more`;
/** A tile's line naming the option its agents recommend, in the word the card already uses for it. */
export const queueSuggested = (label: string): string => `${QUEUE_RECOMMENDED}: ${label}`;
/**
 * What the fold holding a card's reasons is called, on every card but the one a person answers next. A question, so it
 * reads as something to open: the bare "Why" was a grey word nothing said would open (visual review 4).
 */
export const QUEUE_REASONS = 'Why?';
/**
 * Whether the card at `n` says why under each way to answer, rather than in a fold: the first only, which is the one a
 * person answers next. Eight questions with a paragraph under every option made Decide three screens long on a phone
 * (visual review 3), and the reasons for a question nobody is on yet are small print until they ask for them.
 */
export const queueReasoned = (n: number): boolean => n === 0;
/** What a tile's folded list of options is called. There is always at least one, or the block degraded. */
export const queueWays = (n: number): string => (n === 1 ? '1 way to answer' : `${n} ways to answer`);

/** What an option is, read off its seventh cell. */
export type QueueShows = { swatch: string[] } | { figure: string } | { file: { row: string; field: string } };

const HEX = /^#[0-9a-fA-F]{6}$/u;
const SWATCH_MOST = 8;
const FILE = /^([a-z][a-z0-9_]*#[1-9][0-9]*)\/([a-z][a-z0-9_]*)$/u;

/**
 * An option's visual from its cell, or null for a cell that says none, says it wrongly, or says what no person reads.
 *
 * NULL FOR ALL THREE, and the parser tells the first two apart (`queueFault`): a blank cell is an option with nothing
 * to show, and a cell this cannot read is a fault in the fence. A host that built the block by hand gets the visual
 * left out, never a value written into a style it did not pass.
 *
 * A FIGURE `spoken` WOULD CHANGE IS LEFT OUT, NOT MENDED: "3" is not what "3 of tasks#8" said, and a figure with a
 * part gone is a number nobody wrote. The option reads by its name. It is no fault either (`speltOf` is what the
 * fence is held to), because the spelling is right and a queue that degraded over one agent's id would take every
 * other question on the page down with it.
 */
export function showsOf(value: string): QueueShows | null {
  const read = speltOf(value);
  return read !== null && 'figure' in read && spoken(read.figure) !== read.figure ? null : read;
}

/** A cell read by its spelling alone: one of the three, well formed, whatever its figure says. */
function speltOf(value: string): QueueShows | null {
  const v = value.trim();
  const at = v.indexOf(':');
  if (at < 0) return null;
  const what = v.slice(0, at);
  const rest = v.slice(at + 1).trim();
  if (what === 'swatch') {
    const colours = rest.split(',').map((c) => c.trim());
    return colours.length >= 1 && colours.length <= SWATCH_MOST && colours.every((c) => HEX.test(c)) ? { swatch: colours } : null;
  }
  if (what === 'figure') return rest === '' ? null : { figure: rest };
  if (what === 'file') {
    const m = FILE.exec(rest);
    return m ? { file: { row: m[1]!, field: m[2]! } } : null;
  }
  return null;
}

/**
 * Where a file the host resolved may be drawn from: a path of this host's and nowhere else.
 *
 * A REMOTE IMAGE IS REFUSED ON A PAGE (`06 §7`), because loading one tells another host who is reading and when, so an
 * address with a scheme or a protocol-relative one is left out even when the host hands it back. The same check
 * `ours` makes of the `more` row's address, for the same reason.
 */
export const fileSrc = (src: string | null | undefined): string | null => (typeof src === 'string' && ours(src) ? src : null);

/**
 * Where the rest of a queue is: a path of this host's, or nothing. Anything else is a fault.
 *
 * A LEADING SLASH IS NOT THE TEST FOR SAME-ORIGIN, and this was the second gate in the package that
 * had not been told. `inline.ts`'s `safeHref` carries the whole argument: `//evil.example/x` starts
 * with a slash, carries no scheme, and is a protocol-relative URL the browser completes with the
 * current page's scheme; `/\evil.example/x` is the same thing, because a URL parser reads a
 * backslash in the authority position as a slash. Both matched `^/\S*$`, both were accepted as "a
 * path of this record", and `toHTML` drew `<a class="queue-more" href="/\evil.example/x">` on a page
 * whose rows an agent writes. So the shape check stays here, and the origin question is asked of the
 * one function that answers it, rather than of a second regex that would drift away from the first.
 */
const PATH = /^\/[^\s]*$/u;

const ours = (where: string): boolean => PATH.test(where) && safeHref(where) !== null;

/**
 * What is wrong with a queue's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this rather than dropping rows, because an option filed under no
 * question would otherwise vanish, and a queue that quietly loses a way to answer is a silent decision
 * about somebody else's choice.
 */
export function queueFault(rows: readonly (readonly string[])[]): string | null {
  let open = false;
  let options = 0;
  let ended = false;
  for (const cells of rows) {
    const word = (cells[0] ?? '').trim();
    if (!isRowKind(word)) return `a row that starts "${word}" where ${QUEUE_ROWS.join(', ')} goes`;
    if (ended) return 'a row after the count of what is left';
    if (word === 'more') {
      if (!/^\d+$/u.test((cells[1] ?? '').trim())) return 'a count of what is left that is not a whole number';
      const where = (cells[2] ?? '').trim();
      if (where !== '' && !ours(where)) return 'a place to see the rest that is not a path of this record';
      ended = true;
      continue;
    }
    if (word === 'does') {
      if (!open) return 'a line of what it changes before any question';
      continue;
    }
    if (word === 'q') {
      if (open && options === 0) return 'a question with no way to answer it';
      /* A BAND WITH NO WORD IS A FAULT, AND NO BAND AT ALL IS NOT. A host writing a queue by hand may
         not have one, and a question with no chip is a question; a band spelled `undoable` is a
         ranking this package silently ignored, which is the failure that looks like it worked. */
      const band = (cells[6] ?? '').trim();
      if (band !== '' && !Object.hasOwn(QUEUE_COSTS, band)) return `a cost band this build has no word for: "${band}"`;
      open = true;
      options = 0;
    } else {
      if (!open) return 'an option before any question';
      /* A VISUAL THIS CANNOT READ IS A FAULT, AND NO VISUAL IS NOT, the rule the band above keeps: `swatch:red` left
         out in silence is an option drawn without the one thing that said what it was. */
      const shows = (cells[6] ?? '').trim();
      if (shows !== '' && speltOf(shows) === null) return `a visual this build does not draw: "${shows}"`;
      options += 1;
    }
  }
  return open && options === 0 ? 'a question with no way to answer it' : null;
}

export type QueueOption<R> = {
  row: R;
  /** The id `decide` takes as the answer. */
  key: string;
  label: string;
  /** The reason to pick it, which the option's author wrote. */
  because: string;
  recommended: boolean;
  /** What the option is, drawn beside its label, or null when it shows nothing. */
  shows: QueueShows | null;
};

export type QueueItem<R> = {
  row: R;
  /** The suggestion's id, which is what an act is reported against. */
  id: string;
  /** Who opened it, as the record names an actor. */
  who: string;
  /** When it was opened, as the evaluator formatted it. */
  when: string;
  question: string;
  /** Why it is being asked, written by whoever opened it. Empty when they wrote none. */
  why: string;
  /** The band the record put it in, and the reason it sits where it does. Empty when it said none. */
  cost: string;
  /** That band's word, or `''` for a band this package has no word for. */
  costLabel: string;
  options: QueueOption<R>[];
  /** What accepting it changes, a line each, from its `does` rows. Empty when the record wrote none. */
  does: string[];
};

const cell = (cells: readonly string[], i: number): string => (cells[i] ?? '').trim();

/**
 * The rows as questions with their options, and the sentence for a queue with nothing in it.
 *
 * Lenient where `queueFault` is strict, for the reason `feedPlan` is: `Block` is a public type a host
 * can build by hand, so an option before any question is left out rather than thrown. Order is the
 * evaluator's, which is the record's own, and this never reorders: what is costliest is the record's
 * judgement to make, not the drawer's.
 */
export function queuePlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { items: QueueItem<R>[]; more: number; moreHref: string | null; empty: string } {
  const items: QueueItem<R>[] = [];
  let more = 0;
  let moreHref: string | null = null;
  for (const row of rows) {
    const word = cell(row.cells, 0);
    if (word === 'more') {
      const n = Number(cell(row.cells, 1));
      more = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      const where = cell(row.cells, 2);
      moreHref = ours(where) ? where : null;
      continue;
    }
    if (word === 'q') {
      const band = cell(row.cells, 6);
      items.push({ row, id: cell(row.cells, 1), who: cell(row.cells, 2), when: cell(row.cells, 3), question: cell(row.cells, 4), why: cell(row.cells, 5), cost: band, costLabel: queueCost(band), options: [], does: [] });
      continue;
    }
    if (word !== 'opt' && word !== 'does') continue;
    const at = items.at(-1);
    if (!at) continue;
    if (word === 'does') {
      const line = cell(row.cells, 2);
      if (line !== '') at.does.push(line);
      continue;
    }
    at.options.push({
      row,
      key: cell(row.cells, 2),
      label: cell(row.cells, 3) || cell(row.cells, 2),
      because: cell(row.cells, 4),
      recommended: cell(row.cells, 5).toLowerCase() === 'true',
      shows: showsOf(cell(row.cells, 6)),
    });
  }
  return { items, more, moreHref, empty: QUEUE_CLEARED };
}
