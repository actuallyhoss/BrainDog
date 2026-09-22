/**
 * What `capture` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `queue.ts` and `feed.ts` are: an answer here can be tested
 * without a DOM, and two drawers that each worked it out would be two answers.
 *
 * WHAT IT IS FOR. A capture is the one-line add: one field, and the Add button inside its edge once
 * there is something in it to add. the old tool's Work leads with one ("What needs doing?"), and the
 * register grid has had its own since the grid's add landed (`apps/web` `inheritedFrom`). This is the
 * same line as a block, so any page can lead with it rather than one route owning it.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES from the record's answer, the first cell saying which:
 *
 *   into | register | what the list is called | where the list is, optional
 *   set  | field | value
 *
 * One `into`, first: the list a new row goes into. A `set` a field, each an equality the block's
 * `where:` pinned, in the form the record stores (`fills` on the kernel's answer), so a line under
 * "Later" adds a task that is kept for later without the person saying so twice. The drawer passes
 * them to the host untouched and draws none of them: they are what the list the reader is looking
 * at already says, and repeating them beside the field would be a form with fewer fields.
 *
 * THE FIELD IS THERE ONLY WHERE THE HOST CAN ACT ON IT. With no `oncapture` there is no field and no
 * button, because a control that cannot act is absent rather than greyed out (`19 §6`, the rule
 * `List` and `Queue` already follow). A disabled input would be worse than absent: it reads as a
 * record that is broken rather than as a page that cannot write. What is drawn in its place is one
 * line naming the list, and it is a door to that list where the evaluator gave the list an address,
 * because the list's own page is where a row can be added when this one cannot. `toHTML` has no
 * callbacks, so the mirror always draws that line, and the Svelte drawer draws the same tree when a
 * host passes nothing: equal by construction.
 *
 * THE HEADING IS THE FIELD'S PROMPT AND NOT A CAPTION. "What needs doing?" over a field that asks
 * "What needs doing?" is the question twice, so the heading is the field's placeholder and its
 * accessible name, and `captioned` leaves it off the figure. Where there is no field there is no
 * question being asked, so the read-only line does not repeat it either.
 */

import { safeHref } from './inline.ts';

/** The kinds of row, by their first cell. Closed, because a row filed under neither is a fault. */
export const CAPTURE_ROWS = ['into', 'set'] as const;

export type CaptureRowKind = (typeof CAPTURE_ROWS)[number];

/**
 * The renderer's own words, here for the reason `QUEUE_RECOMMENDED` is in `queue.ts`: this package
 * cannot import the app's `copy.ts`, and these are the only words a capture draws that its author did
 * not write.
 */
export const CAPTURE_ADD = 'Add';
/** The prompt when the block has no heading: what the field is for, in the list's own name. */
export const capturePromptFor = (label: string): string => `Add to ${label}`;
/** The line drawn in place of the field when the host cannot add, with nowhere to send the reader. */
export const captureNowhere = (label: string): string => `${label} cannot be added to from here.`;

/** A register id, as the kernel's `declare.ts` checks the `register:` it came from. */
const REGISTER_ID = /^[a-z][a-z0-9_-]{0,31}$/u;

/**
 * A path of this host's, the check `queue.ts` makes of its `more` row, for the same reason: a leading
 * slash alone admits `//evil.example`, and `safeHref` is the one function that knows why.
 */
const ours = (where: string): boolean => /^\/[^\s]*$/u.test(where) && safeHref(where) !== null;

const cell = (cells: readonly string[], i: number): string => (cells[i] ?? '').trim();

/**
 * What is wrong with a capture's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this rather than drawing a field whose text goes somewhere
 * nobody said, or drops an equality that would have been filled in: a line that quietly adds a task
 * to the wrong list, or as the wrong state, is a write the person did not make.
 */
export function captureFault(rows: readonly (readonly string[])[]): string | null {
  const seen = new Set<string>();
  let into = false;
  for (const [i, cells] of rows.entries()) {
    const word = cell(cells, 0);
    if (!(CAPTURE_ROWS as readonly string[]).includes(word)) return `a row that starts "${word}" where ${CAPTURE_ROWS.join(' or ')} goes`;
    if (word === 'into') {
      if (i !== 0) return into ? 'two lists to add to' : 'the list to add to after the first row';
      if (!REGISTER_ID.test(cell(cells, 1))) return `a list to add to, "${cell(cells, 1)}", that is not a register's id`;
      const where = cell(cells, 3);
      if (where !== '' && !ours(where)) return 'a place for the list that is not a path of this record';
      into = true;
      continue;
    }
    if (!into) return 'a value to fill in before the list it is for';
    const field = cell(cells, 1);
    if (field === '' || cell(cells, 2) === '') return 'a value to fill in with no field or no value';
    if (seen.has(field)) return `two values for ${field}`;
    seen.add(field);
  }
  return into ? null : 'no into row, so nothing says which list a new row goes into';
}

export type CapturePlan = {
  /** The register's id, which is what `oncapture` is called with. */
  register: string;
  /** What the list is called, as the evaluator wrote it; the id when it wrote nothing. */
  label: string;
  /** Where the list is, a path of this host's, or null for nowhere to send the reader. */
  href: string | null;
  /** What a new row is filled with, by field, in the form the record stores. */
  inherited: Record<string, string>;
};

/**
 * The rows as the list to add to and what a new row is filled with, or null when no row says the list.
 *
 * Lenient where `captureFault` is strict, for the reason `queuePlan` is: `Block` is a public type a
 * host can build by hand, so a stray row is left out rather than thrown. With no `into` there is no
 * list, and a drawer given null draws nothing inside the figure rather than a field that writes
 * nowhere.
 */
export function capturePlan(rows: readonly { cells: readonly string[] }[]): CapturePlan | null {
  const into = rows.find((r) => cell(r.cells, 0) === 'into');
  const register = into ? cell(into.cells, 1) : '';
  if (!REGISTER_ID.test(register)) return null;
  const where = cell(into!.cells, 3);
  const inherited: Record<string, string> = {};
  for (const r of rows) {
    if (cell(r.cells, 0) !== 'set') continue;
    const field = cell(r.cells, 1);
    const value = cell(r.cells, 2);
    if (field !== '' && value !== '' && !Object.hasOwn(inherited, field)) inherited[field] = value;
  }
  return { register, label: cell(into!.cells, 2) || register, href: ours(where) ? where : null, inherited };
}

/** The field's placeholder and accessible name: the block's heading, or what the field is for. */
export const capturePrompt = (heading: string, plan: CapturePlan): string => heading.trim() || capturePromptFor(plan.label);

/**
 * What pressing Add hands the host, or null when there is nothing to add.
 *
 * NULL FOR A LINE OF SPACES, which is also what decides whether the button is drawn at all: the
 * button appears once there is text, and "text" is the same question here as at the press, so a
 * field holding three spaces neither shows an Add nor sends a row with no title.
 *
 * `inherited` IS A COPY, so a host that keeps the object it was handed cannot change what the next
 * press sends.
 */
export function captureSubmit(plan: CapturePlan | null, typed: string): { register: string; text: string; inherited: Record<string, string> } | null {
  const text = typed.trim();
  if (plan === null || text === '') return null;
  return { register: plan.register, text, inherited: { ...plan.inherited } };
}
