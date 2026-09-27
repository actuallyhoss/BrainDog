/**
 * Whether the person this shell was drawn for may do a thing, on the whole record or on one list: the one question
 * every screen that draws a control asks before it draws it (`loop/finish/contracts.md` §8, platform A).
 *
 * THE RECORD DECIDES AND THIS READS WHAT IT DECIDED. `boot` answers `me.levels`, the level the caller holds on each list,
 * with a record-wide appender's owner-only lists (Keys, People, and any list declaring `owner_only: true`) already left
 * out (`20 §1`). Nothing here works out who may reach a list; it only turns the level the record named into what that
 * level does, so a control a press would be refused for is not drawn in the first place.
 *
 * PLAIN NODE, so a test can import it: relative imports with their extension, and types only.
 */

import type { Level } from './schema.ts';
import type { Shell } from './boot-live.ts';

/**
 * What each level does, in the record's own ladder (`LEVEL_REACH`, `packages/record/src/index.ts`).
 *
 * `append` ADDS AND READS NOTHING, which is the one rung that is not a prefix of the ones above it (`20 §1`), so a
 * comparison of places on the ladder would hand an appender every read. The record answers a press either way; this
 * only keeps the screen from offering what it would refuse.
 */
const DOES: Readonly<Record<Level, readonly Level[]>> = {
  read: ['read'],
  append: ['append'],
  write: ['read', 'append', 'write'],
  decide: ['read', 'append', 'write', 'decide'],
  owner: ['read', 'append', 'write', 'decide', 'owner'],
};

/**
 * The levels a grant on one list is offered at, which the People screen's per-list select draws.
 *
 * `decide` AND `owner` ARE THE WHOLE RECORD'S. Answering a question is for somebody invited to the whole record,
 * whatever the question is about, and the owner's methods name no list, so on one list either answers nothing more
 * than `write` does (`20 §1`). Offering them there described powers the record does not grant.
 */
export const LIST_LEVELS: readonly Level[] = ['read', 'append', 'write'];

/** A level this build knows, looked up with `Object.hasOwn` because the word arrived over the wire. */
const isLevel = (said: unknown): said is Level => typeof said === 'string' && Object.hasOwn(DOES, said);

/**
 * `me.levels` as `boot` sent it, keeping only a level this build knows, or `null` when the host sent none.
 *
 * A HOST OLDER THAN THE FIELD SENDS NOTHING, and that is not the same as a caller who holds no list: `null` leaves the
 * key off the shell, and `may` then asks the record-wide level as it did before the field existed.
 */
export function levelsFrom(said: unknown): Record<string, Level> | null {
  if (said === null || typeof said !== 'object' || Array.isArray(said)) return null;
  const out: Record<string, Level> = {};
  for (const [list, level] of Object.entries(said)) if (isLevel(level)) out[list] = level;
  return out;
}

/**
 * May the caller do `need`, on `list` when one is named, and on the record itself when none is.
 *
 * ON A LIST, THE LEVEL THE RECORD NAMED FOR IT, and a list it named nothing for is one the caller holds nothing on,
 * whatever their record-wide level: that is how a record-wide appender is kept off Keys and People.
 *
 * ON THE RECORD, THE RECORD-WIDE LEVEL, and a colleague held to named lists has none. The shell carries `read` for them
 * as a fallback (`layoutOf` in `boot-live.ts`) so that nothing downstream meets a word it does not know, and `lists` is
 * how it says the fallback is one, so here they may do nothing that belongs to the whole record.
 */
export function may(shell: Pick<Shell, 'me'>, need: Level, list?: string): boolean {
  const me = shell.me;
  const whole: unknown = me.lists === null ? me.level : null;
  const held: unknown =
    list === undefined ? whole : me.levels === undefined ? whole : Object.hasOwn(me.levels, list) ? me.levels[list] : null;
  return isLevel(held) && DOES[held].includes(need);
}
