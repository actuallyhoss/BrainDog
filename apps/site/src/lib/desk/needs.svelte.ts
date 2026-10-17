/**
 * What waits for Maya, shared: the one source the desk's Needs you pane, its count on the tab and the home page's
 * red card all read, so answering in one place moves it in all three.
 *
 * THE MOVES ARE A PURE REDUCER (`step`), and the store only holds its result in a rune. Answer yes and the ask leaves
 * the open list and its done line goes first in the done list, with an Undo. Not now drops it with no done line. Undo
 * puts it back in its first place, wherever the others have gone since. A test runs both the reducer and this module.
 */

import { NEEDS } from '../demo/maya.ts';

export type NeedsState = { readonly open: readonly string[]; readonly done: readonly string[] };

export type NeedsMove = { kind: 'answer'; id: string; yes: boolean } | { kind: 'undo'; id: string };

/** Every ask open, nothing done: the desk as the page loads, and with scripting off. */
export const start = (order: readonly string[]): NeedsState => ({ open: [...order], done: [] });

/** The state after one move. `order` is the asks' first order, which an undone ask goes back into. */
export function step(state: NeedsState, move: NeedsMove, order: readonly string[]): NeedsState {
  if (move.kind === 'answer') {
    if (!state.open.includes(move.id)) return state;
    return {
      open: state.open.filter((x) => x !== move.id),
      done: move.yes ? [move.id, ...state.done.filter((x) => x !== move.id)] : state.done,
    };
  }
  if (!state.done.includes(move.id)) return state;
  const place = (id: string): number => order.indexOf(id);
  return {
    open: [...state.open.filter((x) => x !== move.id), move.id].sort((a, b) => place(a) - place(b)),
    done: state.done.filter((x) => x !== move.id),
  };
}

const ORDER: readonly string[] = NEEDS.map((n) => n.id);

let state = $state<NeedsState>(start(ORDER));

export const needs = {
  /** The asks still waiting, in their first order. */
  get open(): string[] {
    return [...state.open];
  },
  /** The asks answered yes, the latest first. */
  get done(): string[] {
    return [...state.done];
  },
  /** Yes moves the ask across with its done line; no ("Not now", "Keep both") drops it with none. */
  answer(id: string, yes: boolean): void {
    state = step(state, { kind: 'answer', id, yes }, ORDER);
  },
  /** Puts an answered ask back where it first stood. */
  undo(id: string): void {
    state = step(state, { kind: 'undo', id }, ORDER);
  },
};
