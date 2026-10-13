/**
 * What a row's panel offers for a field that declares its moves: what the row holds, and the moves out of that.
 *
 * THE FORM OFFERED EVERY VALUE AND THE RECORD REFUSED MOST OF THEM. A list's state may declare `transitions`, the moves
 * out of each of its values, and the record holds a change to them (`TRANSITION_ILLEGAL`, naming the ones allowed). The
 * panel drew all of a thread's six states whatever it was, so the way to learn which three were real was to press one.
 *
 * THE STORED VALUE IS THE ONE READ, never what is typed. Offer by what is typed and pressing Done on a waiting thread
 * takes Waiting off the control before anything is saved, so the press cannot be taken back, and a second press walks
 * two moves in one save, which the record measures from the row as it stands and refuses.
 *
 * A NEW ROW MAY START ANYWHERE, so with nothing stored every value is offered: the record checks a move, and a row
 * that is not there yet makes none.
 *
 * A STATE THE MOVES DO NOT NAME IS LEFT FREE, as the record leaves it: it checks only a state it declares a move out
 * of, so offering such a row its own value alone would lock a row the record does not. A state nothing leaves is
 * declared with no moves (`to: []`), and that one is offered alone.
 *
 * A MOVE SAYS WHAT IT ASKS FOR BEFORE IT IS PRESSED. The record keeps two more things on the state a row LEAVES: the
 * fields a move out needs filled (`requires`, as the reason a learning was superseded) and that only a decision makes
 * it (`by: 'decide'`). Both were offered bare, so the refusal was the first a person heard of either. `movesWith`
 * carries them beside each move out, and `moveWord` is the few words drawn there.
 *
 * EVERY FIELD ASKED FOR IS NAMED. `requires` is a list and the record wants all of it, so a move that wanted a reason
 * and a date said "needs a reason", took the reason, and was refused for the date. `needs` is the whole list, and the
 * word joins the labels as a person writes them: "needs a reason and date".
 */

import { copy } from '../copy.ts';
import { list } from '../copy/english.ts';
import type { FieldDecl } from '../record/schema.ts';

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The values to offer for `f` on a row that holds `stored` (nothing, for a row not made yet), in the declared order. */
export function movesFrom(f: Pick<FieldDecl, 'values' | 'transitions'>, stored: string | null | undefined): readonly string[] {
  const values = f.values ?? [];
  if (stored === undefined || stored === null || stored === '' || !isMap(f.transitions)) return values;
  const move = f.transitions[stored];
  if (!isMap(move)) return values;
  const to = Array.isArray(move.to) ? move.to.map(String) : [];
  const offered = values.filter((v) => v === stored || to.includes(v));
  /* WHAT THE ROW HOLDS IS ALWAYS ON OFFER, or the control opens on nothing: a value the list no longer declares has no
     place in the order, so it goes first. */
  return offered.includes(stored) ? offered : [stored, ...offered];
}

/** The field names in a `requires`, each once: an empty string or anything that is no string names no field. */
const fieldsOf = (requires: unknown): readonly string[] =>
  Array.isArray(requires) ? [...new Set(requires.filter((need): need is string => typeof need === 'string' && need !== ''))] : [];

/** One value on offer, and what the record asks of a move to it: the fields it wants filled, or a decision. */
export interface Move {
  readonly value: string;
  /** The fields the record wants filled before the row leaves its state, in the order the list declares them. */
  readonly needs?: readonly string[];
  /** Only an accepted proposal makes this move. */
  readonly byDecision?: true;
}

/**
 * What `movesFrom` offers, each with what the record asks of it. What the row holds is no move, so it carries nothing,
 * and neither does anything offered to a new row or to a state the moves do not name: the record checks neither.
 */
export function movesWith(f: Pick<FieldDecl, 'values' | 'transitions'>, stored: string | null | undefined): readonly Move[] {
  const offered = movesFrom(f, stored);
  const move = typeof stored === 'string' && stored !== '' && isMap(f.transitions) ? f.transitions[stored] : undefined;
  if (!isMap(move)) return offered.map((value) => ({ value }));
  const needs = fieldsOf(move.requires);
  const asked: Omit<Move, 'value'> = {
    ...(needs.length > 0 ? { needs } : {}),
    ...(move.by === 'decide' ? { byDecision: true as const } : {}),
  };
  return offered.map((value) => (value === stored ? { value } : { value, ...asked }));
}

/* "a reason", as it reads inside a longer word: what `moveNeedsReason` says after the "needs" every such word opens on. */
const reasonWord = (): string => {
  const opens = copy.moveNeeds('');
  return copy.moveNeedsReason.startsWith(opens) ? copy.moveNeedsReason.slice(opens.length) : copy.moveNeedsReason;
};

/**
 * The words beside a move, or none. A DECISION COMES FIRST: a move only a proposal makes is not made here whatever is
 * filled, and the proposal is where its reason goes. `why` is the field a list keeps its reason in, and any other
 * field is said by the label the list gives it.
 *
 * A FIELD ALREADY FILLED IS NOT ASKED FOR AGAIN (`filled`, which the form answers from the row and from what is typed),
 * so the word shortens as the fields are filled and goes with the last one. Two fields the form gives one label are
 * said once.
 */
export function moveWord(m: Move, labelOf: (field: string) => string, filled: (field: string) => boolean = () => false): string {
  if (m.byDecision) return copy.moveAsksDecide;
  const asked = fieldsOf(m.needs).filter((field) => !filled(field));
  if (asked.length === 0) return '';
  if (asked.length === 1 && asked[0] === 'why') return copy.moveNeedsReason;
  return copy.moveNeeds(list([...new Set(asked.map((field) => (field === 'why' ? reasonWord() : labelOf(field))))]));
}
