/**
 * WHERE A COLLEAGUE WHO HOLDS LISTS, AND NOT THE RECORD, LANDS: their list, or their lists.
 *
 * MEASURED BEFORE IT WAS WRITTEN (`loop/research-invite-landing.md` finding 1), through the real seed
 * and the record's own `boot`: a bookkeeper given `write` on an Expenses list made for them, empty on
 * the day they were sent the link, accepted, pressed `Open BrainDog`, and Home said "Nothing in the
 * record yet." over a record of 230 rows, with `Start here`. `Start here` led to the tiles that set up
 * a brand new record, and every one of them was refused by the record. Their list answered `list` and
 * `create` the whole time. The product worked for them the moment they found the door, and never
 * showed them the door.
 *
 * ONE ANSWER, ASKED BY EVERY SCREEN THAT CARES, so Home and `/start` cannot reach two conclusions about
 * the same person. It is a module and not a line in a route so that `node --test` can hold it, the way
 * `routes/decide/answering.ts` holds who may answer a question.
 */

import type { Shell } from './boot-live.ts';

export type Landing =
  | { kind: 'list'; href: string; name: string }
  | { kind: 'lists'; lists: { href: string; name: string }[] };

/**
 * `null` for an owner, for anybody who holds the whole record, for a token and for the sample: each of
 * them has a record to land on, and Home is it.
 *
 * THE NAME IS THE SHELL'S, from `lists`, because `+layout.ts` renames lists into the voice the record
 * speaks in after `layoutOf` has run; the id is the last resort and is what the record's own refusals
 * already say, which a colleague reads as a word they were never taught.
 */
export function landing(shell: Pick<Shell, 'me' | 'lists'>): Landing | null {
  /* AND A RECORD-WIDE APPENDER GIVEN READS ON SOME LISTS LANDS ON THOSE: `append` reads nothing of the record as a whole,
     so Home has nothing to draw for them, and `boot` sent exactly the lists they read (`20 §1`). */
  const held = shell.me.lists ?? (shell.me.level === 'append' ? shell.lists.map((l) => l.id) : null);
  if (!held || held.length === 0) return null;
  const named = new Map(shell.lists.map((l) => [l.id, l.name]));
  const lists = held.map((id) => ({ href: `/r/${id}`, name: named.get(id) ?? id }));
  return lists.length === 1 ? { kind: 'list', ...lists[0]! } : { kind: 'lists', lists };
}
