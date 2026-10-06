/**
 * A BYLINE'S UNDO, WHEN THE CHANGE WAS BIGGER THAN THE ROW (audit 20, M4). A row the nightly walk linked carries the
 * walk's whole batch, so one press on its Undo took back up to two hundred links and organisations it never showed. Now
 * the plan is read first (`undo-write.ts` `undoPlan`, dry): a change that touched only this row goes back at once, as
 * before, and one that touched more says what it will take back, in names, before anything moves, as Undo this run does
 * (`panels/RunPanel.svelte`). Then one press: Put back all of it, Only this one, or Keep.
 *
 * WHICH STEPS ARE THIS ROW'S is read off the plan: by list and number where the record says them (`at`), and by title
 * and list name where it does not, which is every step a person would call this row's. The record clips a long title to
 * 80 characters and names an untitled row by its list ("a payment"), so a clipped title is matched by what it keeps,
 * and an untitled row by nothing but its number. Once a step is known to be this row's, every step with the same record
 * handle (`row`) is too, and a step on another handle is not, whatever its title says.
 *
 * ONLY THIS ONE ASKS THE RECORD FOR THIS ROW'S PART (`row` on the undo scope), beside the whole, and is offered only
 * when every step it answers is this row's. A record that does not know the filter answers the whole change again or
 * refuses it, and then the choice is not drawn: never a button that cannot do what it says.
 *
 * PURE, AND NODE LOADS IT.
 */

import { list } from '../copy/english.ts';
import type { RowHandle, UndoPlan, UndoStep } from '../record/undo-write.ts';
import { runLines, runWords } from './panels/run-lines.ts';

/** The row a byline is on: its list and number, its title (`''` for a row with none), and its list's name. */
export type Here = { at: RowHandle; title: string; list: string | null };

/** What the byline's Undo asks before it puts anything back. */
export type Ask = {
  /** The sentence that leads: what else the change touched, by name. */
  lead: string;
  /** What the change did, a line each, as the run panel says it. */
  lines: string[];
  more: string | null;
  /** What is left alone, when anything is. */
  left: string | null;
  /** How many steps the whole of it puts back, and how many of them are this row's. */
  all: number;
  mine: number;
};

/** How many other things the lead names before the rest is a count. */
const NAMED = 3;

export const undoAskWords = {
  lead: (names: string[], more: number) =>
    `This change also touched ${list(more > 0 ? [...names, more === 1 ? '1 more' : `${more.toLocaleString('en-GB')} more`] : names)}.`,
  all: (n: number) => (n === 1 ? 'Put back 1 change' : `Put back all ${n.toLocaleString('en-GB')}`),
  only: 'Only this one',
  onlyNamed: (title: string) => `Put back only the change to ${title}`,
  keep: 'Keep',
  left: (n: number) => (n === 1 ? '1 is left as it is: it changed since or cannot come back.' : `${n.toLocaleString('en-GB')} are left as they are: they changed since or cannot come back.`),
  group: (title: string) => `Undo the change to ${title}`,
} as const;

/** The record's title for a row is its own, or the same clipped to 80 characters with an ellipsis. */
function sameTitle(said: string, title: string): boolean {
  if (title === '') return false;
  if (said === title) return true;
  return said.endsWith('…') && said.length > 1 && title.startsWith(said.slice(0, -1).trimEnd());
}

/** Whether a step is on the row `here`, from the step alone. */
export function isOn(step: Pick<UndoStep, 'title' | 'list' | 'at'>, here: Here): boolean {
  if (step.at) return step.at.register === here.at.register && step.at.seq === here.at.seq;
  return sameTitle(step.title, here.title) && (step.list === null || here.list === null || step.list === here.list);
}

/**
 * Which of a plan's steps are on the row `here`, a flag each: by the step, then widened and narrowed by the record's
 * handle for the row a matched step is on. A plan that puts back one row's changes and leaves nothing is this row's
 * when the row has no title to tell it by, since the change the byline names was on it.
 */
export function mineIn(plan: Pick<UndoPlan, 'steps' | 'skipped'>, here: Here): boolean[] {
  const steps = plan.steps;
  const rows = new Set(steps.map((s) => s.row));
  if (here.title === '' && steps.length > 0 && plan.skipped.length === 0 && rows.size === 1 && !rows.has(null)) return steps.map(() => true);
  const direct = steps.map((s) => isOn(s, here));
  const ids = new Set(steps.flatMap((s, i) => (direct[i] && s.row !== null ? [s.row] : [])));
  return steps.map((s, i) => (s.at === null && s.row !== null && ids.size > 0 ? ids.has(s.row) : direct[i]!));
}

/** One name for each other thing the plan touches, in the plan's order, said once. */
function othersOf(steps: readonly UndoStep[], mine: readonly boolean[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const [i, s] of steps.entries()) {
    if (mine[i]) continue;
    const key = s.row ?? (s.at ? `${s.at.register}#${s.at.seq}` : `${s.list ?? ''}:${s.title}`);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(s.title.trim() || runWords.aRow);
  }
  return names;
}

/**
 * What to ask before putting `plan` back, or `null` where it touches nothing past this row and goes back in one press.
 */
export function askOf(plan: UndoPlan, here: Here): Ask | null {
  const mine = mineIn(plan, here);
  const others = othersOf(plan.steps, mine);
  if (others.length === 0) return null;
  const said = runLines(plan.steps);
  return {
    lead: undoAskWords.lead(others.slice(0, NAMED), others.length - NAMED),
    lines: said.lines,
    more: said.more,
    left: plan.skipped.length === 0 ? null : undoAskWords.left(plan.skipped.length),
    all: plan.steps.length,
    mine: mine.filter(Boolean).length,
  };
}

/** Whether a plan read for this row's part is only this row's, so putting it back takes nothing else with it. */
export const onlyHere = (plan: UndoPlan, here: Here): boolean => mineIn(plan, here).every(Boolean);
