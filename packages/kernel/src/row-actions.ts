/**
 * WHAT A PAGE MAY SAY CAN BE PRESSED: the verbs a block's `actions` and `row_actions` name, checked when the page is
 * installed and cut to its reader when it is read (PGS-A12, `loop/scope/area-pages-a.md` 2.2, decision 3).
 *
 * Until this file a declared page wrote six things fixed by kind (`apps/web/src/lib/page/page-writes.ts`): a task
 * ticked, a card moved, a bar dropped, a line captured, a field typed and an option pressed. No block could say Install,
 * Pause, Seal, Approve or File it, so every screen that does one was hand-written. A page now names a verb from a closed
 * table, the record binds each verb to the method a press calls (`packages/record/src/verbs.ts`), and the web has one
 * `act`. The two tables agree, and a test holds them to it.
 *
 * NOT `actions.ts`, which is the ingest's scheduled calls out. Nothing here calls anything: it is a table and two pure
 * functions, so `declare.ts` and `pages.ts` can both ask it without importing each other, as they ask `block-keys.ts`.
 *
 * `hard` IS THE FLOOR OF `change-kind.ts` SAID PER VERB: a verb whose change no rung lifts (a delete, or a rule that runs
 * unattended and files what arrives) asks first whoever presses it, so a page's `confirm` on it is asked every time and
 * a host draws it as hard to undo. `undo` says the record has a way back for it, so the press is held for the Undo.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/**
 * The least a reader must reach to be sent a control for a verb. `decide` is the record's own rung between write and
 * owner (`Need` in `packages/record`): answering a question needs it, and a member who has it is sent the control.
 */
export const ACTION_LEVELS = ['read', 'write', 'decide', 'owner'] as const;
export type ActionLevel = (typeof ACTION_LEVELS)[number];

/**
 * One verb: the level it needs, whether the record can take it back, whether it is hard to undo, and what a press sends.
 * `undo_level` is set where taking it back needs more than the press did: the record's `undo` is an owner's alone, so a
 * decider who answers a question is not told they can take the answer back.
 */
export type ActionVerb = { level: ActionLevel; undo: boolean; hard: boolean; args: readonly string[]; undo_level?: ActionLevel };

/** What an ask sends: the question, why it is asked, and the two answers it offers (`question` is `propose`'s own word). */
export const ASK_ARGS = ['question', 'why', 'first', 'second'] as const;

/**
 * THE VERBS A PAGE MAY NAME. The first five are the six writes said as verbs (a capture is `row.create`, a typed field
 * `row.update`), and their old paths stay; then the Decide answer, the Inbox's make-a-rule press, and the ask.
 * The answer is `suggestion.answer`, the kernel's own word for what Decide holds (`governanceRow('suggestion')`): the
 * scope wrote `question.answer`, and `question` is a field an add-on declares, which `core-names` keeps out of the core.
 *
 * `question.ask` PUTS A QUESTION TO THE RECORD'S OWNER (PGS-A15), filed as Decide's own "Ask yourself" sheet files one,
 * by whoever pressed, and waits on Decide like any other. Its args (`ASK_ARGS`) are what the record builds that
 * question from, and a form over it names them as its fields. It needs no row, so it is a block's verb, and its way
 * back is the question taken back while it is still open.
 *
 * `args` ARE WHAT A PRESS SENDS, by name. A page binds one to a field of the block's source (`args: { field: state }`),
 * and what it leaves unbound comes from the press itself: the value picked, the line typed.
 */
export const ACTION_VERBS = Object.freeze({
  'row.create': { level: 'write', undo: true, hard: false, args: ['fields'] },
  'row.update': { level: 'write', undo: true, hard: false, args: ['field', 'value'] },
  'row.delete': { level: 'write', undo: true, hard: true, args: [] },
  'row.tick': { level: 'write', undo: true, hard: false, args: ['done'] },
  'row.move': { level: 'write', undo: true, hard: false, args: ['field', 'to'] },
  'suggestion.answer': { level: 'decide', undo: true, hard: false, args: ['option', 'reason'], undo_level: 'owner' },
  'rule.from_arrivals': { level: 'owner', undo: true, hard: true, args: ['arrivals'] },
  'question.ask': { level: 'write', undo: true, hard: false, args: ASK_ARGS },
} as const satisfies Readonly<Record<string, ActionVerb>>);

export type VerbName = keyof typeof ACTION_VERBS;

/** The verbs a block's own `actions` may name, which need no row to act on. The rest are a row's. */
export const BLOCK_VERBS: ReadonlySet<string> = new Set<VerbName>(['row.create', 'rule.from_arrivals', 'question.ask']);

/** How an action is drawn: a button, a switch over a yes-or-no field, a choice of a few, a value copied, a link. */
export const ACTION_AS = ['button', 'switch', 'choice', 'copy', 'link'] as const;
export type ActionAs = (typeof ACTION_AS)[number];

/** The two keys a block carries actions under. */
export const ACTION_KEYS = ['actions', 'row_actions'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** At most this many actions a list; past three a host folds them into one menu. */
export const ACTIONS_MOST = 8;
/** A label's length in bytes, which is what a narrow button can hold. */
export const LABEL_MOST = 40;
/** A `confirm` sentence's length in bytes: one sentence a sheet asks. */
export const CONFIRM_MOST = 140;

/** The keys one action may carry. */
const ACTION_FIELDS: ReadonlySet<string> = new Set(['verb', 'label', 'args', 'as', 'confirm', 'again', 'once', 'look_first']);

/** One action as a page declares it, cleaned. */
export type DeclaredAction = {
  verb: VerbName;
  label: string;
  args?: Readonly<Record<string, string>>;
  as?: ActionAs;
  confirm?: string;
  again?: true;
  once?: true;
  look_first?: true;
};

/** One action as a read sends it: only what this reader may press, each saying whether the record can take it back. */
export type OfferedAction = DeclaredAction & { hard: boolean; undo: boolean };

const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A block's `actions` or `row_actions` checked, or the refusal that names the action and the fix.
 *
 * `ctx.fields` ARE THE FIELDS THE BLOCK'S SOURCE OR LIST HOLDS, and an arg bound to any other is refused: a press would
 * send a value nobody can read. `ctx.key` says which of the two lists this is, because a block's own `actions` act on
 * no row, so a verb that needs one is refused there. The install and the read both ask here.
 */
export function actionsBody(raw: unknown, ctx: { fields: ReadonlySet<string>; key?: ActionKey }): Result<DeclaredAction[]> {
  const key: ActionKey = ctx.key ?? 'actions';
  const bad = (fix: string, at: string, allowed?: readonly string[]): Result<DeclaredAction[]> =>
    no('DECLARATION_INVALID', fix, { at, ...(allowed ? { allowed } : {}) });
  if (!Array.isArray(raw)) return bad(`${key} is a list of actions, each with a verb and a label.`, key);
  if (raw.length > ACTIONS_MOST)
    return bad(`${key} holds ${raw.length} actions, and a block holds at most ${ACTIONS_MOST}. Keep the ones pressed most and take the rest off.`, key);
  const verbs = Object.keys(ACTION_VERBS);
  const out: DeclaredAction[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `${key}[${i}]`;
    if (!isRecord(item)) return bad(`${at} is an action: { verb, label }.`, at);
    const named = typeof item.label === 'string' && item.label.trim() ? `${at} (${item.label.trim()})` : at;
    const stray = Object.keys(item).find((k) => !ACTION_FIELDS.has(k));
    if (stray !== undefined) return bad(`${named} has ${stray}, which an action does not read. Take it off.`, `${at}.${stray}`, [...ACTION_FIELDS]);
    const verb = typeof item.verb === 'string' ? item.verb : '';
    const spec = own<ActionVerb>(ACTION_VERBS, verb);
    if (!spec) return bad(`${named}'s verb ${JSON.stringify(item.verb ?? null)} is not one a page may name. Pick one of the verbs listed with this refusal.`, `${at}.verb`, verbs);
    if (key === 'actions' && !BLOCK_VERBS.has(verb))
      return bad(`${named}'s verb ${verb} acts on one row, so it goes under row_actions, not actions.`, `${at}.verb`, [...BLOCK_VERBS]);
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label || bytes(label) > LABEL_MOST)
      return bad(`${named}'s label is the words on the button, 1 to ${LABEL_MOST} bytes. Write a short one, such as "File it".`, `${at}.label`);
    const action: DeclaredAction = { verb: verb as VerbName, label };
    if (item.args !== undefined) {
      if (!isRecord(item.args)) return bad(`${named}'s args name, for each thing the press sends, the field it comes from: { field: state }.`, `${at}.args`, spec.args);
      const args: Record<string, string> = {};
      for (const [arg, field] of Object.entries(item.args)) {
        if (!spec.args.includes(arg))
          return bad(`${named} sends no ${arg}. ${spec.args.length ? `${verb} sends ${spec.args.join(', ')}.` : `${verb} sends nothing; take args off.`}`, `${at}.args.${arg}`, spec.args);
        if (typeof field !== 'string' || !ctx.fields.has(field))
          return bad(`${named}'s ${arg} is ${JSON.stringify(field)}, which is not a field this block's list holds. Pick one listed with this refusal.`, `${at}.args.${arg}`, [...ctx.fields]);
        args[arg] = field;
      }
      action.args = args;
    }
    if (item.as !== undefined) {
      if (!(ACTION_AS as readonly unknown[]).includes(item.as))
        return bad(`${named}'s as is how it is drawn: ${ACTION_AS.join(', ')}.`, `${at}.as`, ACTION_AS);
      action.as = item.as as ActionAs;
    }
    if (item.confirm !== undefined) {
      const said = typeof item.confirm === 'string' ? item.confirm.trim() : '';
      if (!said || bytes(said) > CONFIRM_MOST)
        return bad(`${named}'s confirm is the one sentence asked before it is done, 1 to ${CONFIRM_MOST} bytes. Say it shorter.`, `${at}.confirm`);
      action.confirm = said;
    }
    for (const flag of ['again', 'once', 'look_first'] as const) {
      if (item[flag] === undefined) continue;
      if (item[flag] !== true) return bad(`${named}'s ${flag} is true or left off.`, `${at}.${flag}`, ['true']);
      action[flag] = true;
    }
    out.push(action);
  }
  return ok(out);
}

/** How far up the ladder each word reaches. A record level outside the table (`propose`, `append`) presses nothing. */
const RANK: Readonly<Record<string, number>> = Object.freeze({ read: 0, propose: 0, append: 0, write: 1, decide: 2, owner: 3 });

/**
 * The actions this reader may press, each marked `hard` and `undo` from the table.
 *
 * A READ NEVER SENDS A CONTROL THE RECORD WOULD REFUSE. `level` is the reader's, in the record's own words; a verb above
 * it is dropped, not drawn disabled, and so is a verb the table no longer holds. What is left keeps its order.
 * `runs`, when the host passes it, is the verbs it can carry out (`RUNS` in `packages/record/src/verbs.ts`): a verb the
 * table names and this host does not run yet is dropped too, rather than drawn to be refused on every press.
 */
export function cutActions(list: readonly DeclaredAction[], level: string, runs?: ReadonlySet<string>): OfferedAction[] {
  const reach = own(RANK, level) ?? -1;
  const out: OfferedAction[] = [];
  for (const a of list) {
    const spec = own<ActionVerb>(ACTION_VERBS, a.verb);
    if (!spec || reach < (own(RANK, spec.level) ?? Infinity) || (runs && !runs.has(a.verb))) continue;
    const undo = spec.undo && reach >= (own(RANK, spec.undo_level ?? spec.level) ?? Infinity);
    out.push({ ...a, hard: spec.hard, undo });
  }
  return out;
}
