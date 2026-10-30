/**
 * WHAT ONE PRESS ON A DECLARED ACTION DOES FIRST (PGS-A12 jobs 7 and 8,  build item 6), and
 * the words it says while it does.
 *
 * A page names an action (`packages/kernel/src/row-actions.ts`), the read cuts it to what this reader may press and marks
 * it `hard` and `undo`, the drawer draws it (`braindog-render` `Actions.svelte`), and the press reaches the page's one
 * `act` (`page-writes.ts`). This file answers the step that press takes before anything is written: held with an Undo,
 * a sheet that names the loss, sign in again, a value shown once, or a look at what will change and then Do it. UNDO
 * INSTEAD OF CONFIRM is the rule: a sheet asks first only where the page or the record says the loss is real.
 *
 * PURE, AND NODE LOADS IT, so `act-sheet.test.ts` holds every rule without a DOM. The one browser thing, `openSheet`,
 * reaches Svelte and `ActSheet.svelte` by a dynamic import inside itself, so nothing loads before a press needs a sheet.
 */

import type { Action } from 'braindog-render';

/** An action as the read sends it: the drawer's shape and whether the record can take it back for this reader. */
export type ActAction = Action & { undo?: boolean };

/** The one step a press takes first. `run` is a press with no way back this reader may use: run, and say so. */
export type Step = 'hold' | 'run' | 'confirm' | 'again' | 'once' | 'look_first';

/** The step, and for `confirm` the sentence the sheet asks. */
export type StepOf = { step: Step; said?: string };

/**
 * THE PLAIN SENTENCE A HARD ACTION IS ASKED WITH when the page wrote none, by its verb. A hard verb is one no rung of
 * the record lifts (`hard` in `ACTION_VERBS`), so it is asked every time, in words that say what is lost.
 */
export const HARD_SAID: Readonly<Record<string, string>> = Object.freeze({
  'row.delete': 'This takes it off your BrainDog. Undo is offered for a few seconds, and after that it stays gone.',
  'rule.from_arrivals': 'This files them and writes a rule, and from then on the rule files what arrives without asking you.',
});

/** The sentence for a hard verb the table above does not name. */
export const HARD_PLAIN = 'This is hard to take back once it is done.';

const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * The step a press on `action` takes first, in this order: sign in again (nothing is shown before the person is who
 * they say), a look at what will change, the sheet that names the loss, then the press itself, which shows its answer
 * once or is held for its Undo. A hard action with no `confirm` is asked the record's plain sentence for its verb.
 */
export function stepOf(action: ActAction): StepOf {
  if (action.again === true) return { step: 'again' };
  if (action.look_first === true) return { step: 'look_first' };
  if (text(action.confirm)) return { step: 'confirm', said: action.confirm.trim() };
  if (action.hard === true) return { step: 'confirm', said: HARD_SAID[action.verb] ?? HARD_PLAIN };
  if (action.once === true) return { step: 'once' };
  return { step: action.undo === false ? 'run' : 'hold' };
}

/**
 * The action with the step it has just taken said, so the next `stepOf` answers the one after. A sheet said yes to is
 * not asked again: its `confirm` and `hard` go, and so does a look taken or a sign-in made.
 */
export function pastStep(action: ActAction, step: Step): ActAction {
  if (step === 'again') return { ...action, again: false };
  const { confirm: _asked, ...rest } = action;
  if (step === 'look_first') return { ...rest, look_first: false, hard: false };
  if (step === 'confirm') return { ...rest, hard: false };
  return action;
}

/**
 * THE ARG A PRESS ITSELF SENDS, by verb: the value a switch or a choice moved to, the line typed, the option picked.
 * A page that binds it to a field (`args: { option: pick }`) sends the row's value of that field instead.
 */
export const PRESSED: Readonly<Record<string, string>> = Object.freeze({
  'row.create': 'fields',
  'row.update': 'value',
  'row.tick': 'done',
  'row.move': 'to',
  'suggestion.answer': 'option',
});

/** The args that name a field rather than carry a value: `field: state` writes the field `state`. */
const NAMES_A_FIELD: ReadonlySet<string> = new Set(['field']);

/**
 * What a press sends, by arg: each arg the action binds filled from the row's fields (or the field's own name, where the
 * arg names which field is written), and the verb's pressed arg from the press's `value` when the page left it unbound.
 * An arg bound to a field the row does not hold is left out, so the record says what is missing in its own words.
 */
export function argsOf(action: Pick<ActAction, 'verb' | 'args'>, row: { fields?: Readonly<Record<string, unknown>> } | null | undefined, value?: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const bound = action.args && !Array.isArray(action.args) ? (action.args as Readonly<Record<string, unknown>>) : {};
  const fields = row?.fields ?? {};
  for (const [arg, field] of Object.entries(bound)) {
    if (typeof field !== 'string') continue;
    if (NAMES_A_FIELD.has(arg)) out[arg] = field;
    else if (Object.hasOwn(fields, field)) out[arg] = fields[field];
  }
  const pressed = PRESSED[action.verb];
  if (pressed && !Object.hasOwn(out, pressed) && value !== undefined) out[pressed] = value;
  return out;
}

/** A switch's or a choice's word for on and off, read as a tick's done. Anything else is no answer. */
export function doneOf(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === 'false' || v === 'off' || v === 'no') return false;
  return null;
}

/**
 * THE VALUE A PRESS ANSWERED, as the shown-once sheet draws it: the answer itself when it is words, or its `value`,
 * `token` or `code`. Never kept: the sheet holds it while open and lets it go when it closes.
 */
export function answeredValue(v: unknown): string | null {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v && typeof v === 'object')
    for (const k of ['value', 'token', 'code'] as const) {
      const at = (v as Record<string, unknown>)[k];
      if (typeof at === 'string' && at !== '') return at;
    }
  return null;
}

/* ── the words ─────────────────────────────────────────────────────────────── */

/**
 * WHAT A PRESS SAYS, in a `words` object beside it by the rule every area keeps: past tense with the thing named for a
 * receipt, the action's own label on its buttons, and never a verb's id.
 */
export const actWords = {
  /** The receipt of a press that landed, by the action's label and what it was pressed on. */
  done: (label: string, title: string | null) => (title ? `${label}: “${title}”.` : `${label}: done.`),
  /** A verb this host has no single change for: that nothing ran first, then what the press does where it can. */
  cannot: (label: string, would: string) => `Nothing was changed: ${label} cannot run on this page yet. Where it can, it does this: ${would}`,
  /** A press that names no row where its verb acts on one. */
  noRow: 'This acts on one thing in the list, and the press named none. Press it on the line itself.',
  /** An add that sent nothing to add. */
  noAdd: 'This does not say what to add, so nothing was added.',
  /** A change whose page names no field to write, or a press that sent no value for it. */
  noChange: 'This does not say what to change, so nothing was changed.',
  /** A way back the record refused or could not take, with what it was. */
  undoFailed: (what: string, fix?: string) => (fix ? `Could not undo ${what}. ${fix}` : `Could not undo ${what}.`),
  /** The way back taken. */
  undone: (what: string) => `Put back: ${what}.`,
  /** The sheets' words. */
  keep: 'Keep it as it is',
  cancel: 'Cancel',
  doIt: 'Do it',
  close: 'Done',
  lookTitle: 'What will change',
  againTitle: 'Sign in again',
  againSaid: 'This asks you to show it is you before it runs. Sign in again, and it runs straight after.',
  againPress: 'Sign in again',
  onceTitle: (label: string) => label,
  onceSaid: 'This is shown once and not kept. Copy it now: when this closes it is gone.',
  copy: 'Copy',
  copied: 'Copied',
  onceNone: 'It was done, and there was nothing to show.',
} as const;

/**
 * WHAT A PRESS WILL CHANGE, in a line or two, for the look-first sheet and for a verb this host cannot run. Said over
 * the thing's own name and the values a person sees, never a field's id.
 */
export function lookOf(action: Pick<ActAction, 'verb' | 'label'>, title: string | null, args: Readonly<Record<string, unknown>>): string[] {
  const it = title ? `“${title}”` : 'This';
  const to = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  switch (action.verb) {
    case 'row.create':
      return ['A new one is added to this list.'];
    case 'row.update':
      return to(args.value) ? [`${it} is changed to ${to(args.value)}.`] : [`${it} is changed.`];
    case 'row.move':
      return to(args.to) ? [`${it} moves to ${to(args.to)}.`] : [`${it} moves.`];
    case 'row.tick':
      return [doneOf(args.done) === false ? `${it} is marked not done.` : `${it} is marked done.`];
    case 'row.delete':
      return [`${it} is deleted.`];
    case 'suggestion.answer':
      return to(args.option) ? [`The question is answered ${to(args.option)}.`] : ['The question is answered.'];
    case 'rule.from_arrivals':
      return ['These are filed.', 'A rule is written that files what arrives like them from now on.'];
    default:
      return [`${action.label.trim()} is done${title ? ` to ${it}` : ''}.`];
  }
}

/* ── the sheet ─────────────────────────────────────────────────────────────── */

/** What a sheet asks: the loss in a sentence, a sign-in, a value shown once, or what will change. */
export type SheetAsk =
  | { kind: 'confirm'; label: string; said: string }
  | { kind: 'again'; label: string }
  | { kind: 'once'; label: string; value: string | null }
  | { kind: 'look'; label: string; lines: readonly string[] };

/** Opens one sheet and answers whether the person said yes (signed in, pressed Do it), or closed it. */
export type OpenSheet = (ask: SheetAsk) => Promise<boolean>;

/**
 * THE SHEET, MOUNTED ON THE FIRST PRESS THAT NEEDS ONE and taken down when it answers. Svelte's `mount` and the sheet
 * itself are dynamic imports, so a page that is never pressed into a sheet loads neither (`ActSheet.svelte`).
 */
export const openSheet: OpenSheet = async (ask) => {
  const [{ mount, unmount }, { default: ActSheet }] = await Promise.all([import('svelte'), import('./ActSheet.svelte')]);
  return new Promise<boolean>((resolve) => {
    let app: Record<string, unknown> | null = null;
    const done = (yes: boolean): void => {
      resolve(yes);
      const was = app;
      app = null;
      /* AFTER THE CLOSE HAS PLAYED, so the sheet goes the way it came rather than vanishing. */
      if (was) setTimeout(() => void unmount(was), 400);
    };
    app = mount(ActSheet, { target: document.body, props: { ask, done } });
  });
};
