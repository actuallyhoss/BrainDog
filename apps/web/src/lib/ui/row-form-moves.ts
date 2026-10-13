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
 */

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
