/**
 * A BYLINE'S UNDO, WHEN THE CHANGE WAS BIGGER THAN THE ROW (audit 20, M4). A row the nightly walk linked carries the
 * walk's whole batch, so one press on its Undo took back up to two hundred links and organisations it never showed. Now
 * the plan is read first (`undo-write.ts` `undoPlan`, dry): a change that touched only this row goes back at once, as
 * before, and one that touched more says what it will take back, in names, before anything moves, as Undo this run does
 * (`panels/RunPanel.svelte`). Then one press: Put back all of it, Only this one, or Keep.
 *
 * WHICH STEPS ARE THIS ROW'S is read off the plan by the record's handles alone: a step's list and number (`at`), which
 * the record says on every step but a stop, or its id for the row (`row`) where the page knows this row's. Never by
 * title (audit 22, M2): a walk batch can hold two payments both called "STRIPE PAYOUT", and a row with no title shares
 * its name with every other, so a title says nothing about which row a step was on. A step none of that ties to this
 * row is another row's, and the change is asked about before it goes back. Once a step is known to be this row's, a
 * step with the same id and no number is too.
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

/** The row a byline is on: its list and number, and the record's id for it where the page was given one. */
export type Here = { at: RowHandle; id: string | null };

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

const named = (names: string[], more: number): string =>
  list(more > 0 ? [...names, more === 1 ? '1 more' : `${more.toLocaleString('en-GB')} more`] : names);

export const undoAskWords = {
  lead: (names: string[], more: number) =>
    `This change also touched ${named(names, more)}.`,
  /* WHEN NO STEP CAN BE TOLD AS THIS ROW'S, nothing is "also": the change is said whole, this row's name among the rest. */
  touched: (names: string[], more: number) => `This change touched ${named(names, more)}.`,
  all: (n: number) => (n === 1 ? 'Put back 1 change' : `Put back all ${n.toLocaleString('en-GB')}`),
  only: 'Only this one',
  onlyNamed: (title: string) => `Put back only the change to ${title}`,
  keep: 'Keep',
  left: (n: number) => (n === 1 ? '1 is left as it is: it changed since or cannot come back.' : `${n.toLocaleString('en-GB')} are left as they are: they changed since or cannot come back.`),
  group: (title: string) => `Undo the change to ${title}`,
} as const;

/** Whether a step is on the row `here`, from the step alone: by its list and number, or else by its id for the row. */
export function isOn(step: { readonly row: string | null; readonly at: RowHandle | null }, here: Here): boolean {
  if (step.at) return step.at.register === here.at.register && step.at.seq === here.at.seq;
  return here.id !== null && step.row === here.id;
}

/**
 * Which of a plan's steps are on the row `here`, a flag each: by the step, then a step with no number on the id of a
 * step that matched.
 */
export function mineIn(plan: { readonly steps: readonly UndoStep[] }, here: Here): boolean[] {
  const direct = plan.steps.map((s) => isOn(s, here));
  const ids = new Set(plan.steps.flatMap((s, i) => (direct[i] && s.row !== null ? [s.row] : [])));
  return plan.steps.map((s, i) => direct[i]! || (s.at === null && s.row !== null && ids.has(s.row)));
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
    lead: (mine.some(Boolean) ? undoAskWords.lead : undoAskWords.touched)(others.slice(0, NAMED), others.length - NAMED),
    lines: said.lines,
    more: said.more,
    left: plan.skipped.length === 0 ? null : undoAskWords.left(plan.skipped.length),
    all: plan.steps.length,
    mine: mine.filter(Boolean).length,
  };
}

/** Whether a plan read for this row's part is only this row's, so putting it back takes nothing else with it. */
export const onlyHere = (plan: UndoPlan, here: Here): boolean => mineIn(plan, here).every(Boolean);
