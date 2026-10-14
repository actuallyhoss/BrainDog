/**
 * A block's declared actions, planned for a drawer (PGS-A12): which controls are shown, which fold, and what each is.
 *
 * THE SHAPE IS THE PAGE'S, checked by the record before it reaches here (`packages/kernel/src/row-actions.ts` cleans a
 * block's `actions` and a row's `row_actions` and cuts them to what this reader may press). This module only decides
 * how they are laid out, so the Svelte drawer (`../svelte/Actions.svelte`) and the string drawer (`html.ts`, which
 * prints `actionLabels` and nothing pressable) read one answer.
 *
 * AT MOST THREE ARE SHOWN, in the order the page declared them, and the rest fold into one menu. ON A PHONE ONE IS
 * SHOWN and the rest wait in a sheet, because three buttons across a 390 tile is a row of truncated words.
 *
 * Pure: no DOM, no clock.
 */

/** How one action is drawn. A kind this drawer does not know is a button. */
export type ActionAs = 'button' | 'switch' | 'choice' | 'copy' | 'link';

/**
 * One declared action as the page read hands it on: the declaration, and beside it the few facts the read reports
 * for this reader and this row (a switch's state, a choice's few and which one holds, a link's address).
 */
export type Action = {
  verb: string;
  /** The words on the control. An action with no label is not drawn: its verb is an id, never a name. */
  label: string;
  args?: Readonly<Record<string, unknown>> | readonly unknown[];
  as?: ActionAs;
  /** The sentence the host asks before it presses; the drawer only hands it on. */
  confirm?: string;
  again?: boolean;
  once?: boolean;
  look_first?: boolean;
  /** The record calls it hard to undo: drawn with a mark and a word, never colour alone. */
  hard?: boolean;
  /** A switch's state as the record holds it. */
  on?: boolean;
  /** A choice's few, and the one that holds. A choice with fewer than two is drawn as a button. */
  choices?: readonly string[];
  value?: string;
  /** A link's address, which the read resolved. A link with none is drawn as a button. */
  href?: string;
};

/** What the host is handed when an action is pressed: the action, the row it sits on, and a switch's or choice's new value. */
export type OnAct = (action: Action, row?: unknown, value?: string) => void;

/** One action as the drawer draws it. `primary` is the block's one filled control: at most one in a plan. */
export type PlannedAction = { action: Action; label: string; kind: ActionAs; hard: boolean; primary: boolean };

/**
 * `shown` in declared order, then `menu`, which is folded: a menu behind one button, or on a phone a sheet
 * (`fold` says which, and is null when nothing folds).
 */
export type ActionsPlan = { shown: PlannedAction[]; menu: PlannedAction[]; fold: 'menu' | 'sheet' | null };

/** How many controls are shown before the rest fold, wide and on a phone. */
export const ACTIONS_SHOWN = 3;
export const ACTIONS_SHOWN_NARROW = 1;

/** The word and the mark a hard action carries, so it is never told by colour alone. */
export const HARD_WORD = 'hard to undo';
export const HARD_MARK = '!';

/** The folded menu's button. */
export const ACTIONS_MORE = 'More';

const KINDS: ReadonlySet<string> = new Set(['button', 'switch', 'choice', 'copy', 'link']);

/** What a declared `as` draws, given what the read handed beside it. */
function kindOf(a: Action): ActionAs {
  const as = typeof a.as === 'string' && KINDS.has(a.as) ? a.as : 'button';
  if (as === 'choice' && (a.choices?.filter((c) => typeof c === 'string' && c.trim() !== '').length ?? 0) < 2) return 'button';
  if (as === 'link' && !(typeof a.href === 'string' && a.href.trim() !== '')) return 'button';
  return as;
}

const labelOf = (a: unknown): string =>
  a && typeof a === 'object' && typeof (a as Action).label === 'string' ? (a as Action).label.trim() : '';

/** The actions that can be drawn: an object with a label. Anything else is dropped rather than drawn as its verb. */
function drawable(list: readonly unknown[] | null | undefined): Action[] {
  return (Array.isArray(list) ? list : []).filter((a): a is Action => labelOf(a) !== '');
}

/**
 * The plan for one block's or one row's actions.
 *
 * THE FIRST IS THE ONE PRIMARY only when it is a plain button that is easy to take back. A switch or a choice is a
 * state and not a press, and a hard action in the accent's fill would invite exactly the press it should slow down.
 */
export function actionsPlan(list: readonly unknown[] | null | undefined, { narrow = false }: { narrow?: boolean } = {}): ActionsPlan {
  const planned = drawable(list).map((action, i): PlannedAction => {
    const kind = kindOf(action);
    const hard = action.hard === true;
    return { action, label: labelOf(action), kind, hard, primary: i === 0 && kind === 'button' && !hard };
  });
  const cut = narrow ? ACTIONS_SHOWN_NARROW : ACTIONS_SHOWN;
  /* NOTHING FOLDS UNTIL IT HAS TO: four wide is three and a menu of one, but three is three, never two and a menu. */
  if (planned.length <= cut) return { shown: planned, menu: [], fold: null };
  return { shown: planned.slice(0, cut), menu: planned.slice(cut), fold: narrow ? 'sheet' : 'menu' };
}

/** The labels the string drawer prints, in declared order, with a hard action's word beside it. Nothing pressable. */
export function actionLabels(list: readonly unknown[] | null | undefined): string[] {
  return drawable(list).map((a) => (a.hard === true ? `${labelOf(a)} (${HARD_WORD})` : labelOf(a)));
}
