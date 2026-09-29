/**
 * The name a question or a decision goes out under to somebody who does not read every list, in place of its number.
 *
 * THE NUMBER COUNTED WHAT SHE WAS NOT SHOWN. `SG<n>` and `D<n>` come from one counter each over the whole record
 * (`allocate` in the kernel), so a member invited to Obligations was measured reading `SG1` then `SG6` and `D1` then
 * `D4` with four Diary questions and two Diary decisions between them, and an `append` member's own `propose` answering
 * `SG7`, the six questions filed before hers on every list, from one call. Numbering per list is not the way out: the
 * number is the primary key of `suggestion` and `decision`, so two lists cannot both hold an `SG3`.
 *
 * `q.<id>` IS THE ID OF THE QUESTION'S FIRST `suggest` EVENT, and `d.<id>` the id of the decision's `decide` event: a
 * line she is already shown, so the handle says nothing the line did not. Every path that allocates an `SG` writes that
 * event in the same transaction, a reopen writes a second one that `LIMIT 1` passes over, so the handle never moves, and
 * since `6650d45b` a ULID's tail is redrawn on every mint, so two handles cannot be subtracted. It needs no key and no
 * table, and it survives a restart, which the sealed `s.` cursor does not (`history-cursor.ts`).
 *
 * THE NUMBER STILL COMES BACK IN. `spokenOf` turns a handle into the number the kernel keys on, so every check after it
 * is the one a typed `SG6` meets, and a hidden question answers exactly as a missing one whichever she typed.
 */

import type { Sql } from '@braindog/ports';

export type Governed = 'suggestion' | 'decision';

/** The event each handle names, and the prefix it goes out under. */
const EVENT: Record<Governed, { kind: string; prefix: string }> = {
  suggestion: { kind: 'suggest', prefix: 'q.' },
  decision: { kind: 'decide', prefix: 'd.' },
};

/** A handle and nothing else: checked before it reaches SQL, so a typed string is never a query. */
const HANDLE = /^([qd])\.([0-9A-Z]{26})$/u;

/** `q.<id>` for a question, `d.<id>` for a decision, or `null` when no event names it. */
export function handleOf(sql: Sql, register: Governed, spoken: string): string | null {
  const { kind, prefix } = EVENT[register];
  const found = sql.one<{ id: string }>('SELECT id FROM event WHERE kind = ? AND target = ? ORDER BY rowid LIMIT 1', kind, `${register}:${spoken}`);
  return found ? `${prefix}${found.id}` : null;
}

/**
 * The `SG<n>` or `D<n>` a handle names, or `null` for a handle that names no such event. Anything that is not a handle
 * is `null` too; the caller hands a typed number through as it came.
 */
export function spokenOf(sql: Sql, handle: string): string | null {
  const parts = HANDLE.exec(handle);
  if (parts === null) return null;
  const register: Governed = parts[1] === 'q' ? 'suggestion' : 'decision';
  const found = sql.one<{ target: string }>('SELECT target FROM event WHERE id = ? AND kind = ?', parts[2]!, EVENT[register].kind);
  const target = found?.target ?? '';
  return target.startsWith(`${register}:`) ? target.slice(register.length + 1) : null;
}

/** Whether a string is shaped as a handle, which is what decides whether it goes through `spokenOf`. */
export const isHandle = (text: unknown): text is string => typeof text === 'string' && HANDLE.test(text);
