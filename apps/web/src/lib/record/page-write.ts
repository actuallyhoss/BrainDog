/**
 * A declared page's two gestures against the record: a card moved to another column of a board, and a task ticked.
 *
 * A ROUTE-ONLY MODULE, loaded by `/p/<slug>` when one of the two happens. ONLY A LIVE PAGE CALLS THIS: the sample says
 * `cardMovedTo` and `taskTicked` as it always did.
 *
 * THE ROW IS NAMED BY WHAT THE PAGE ANSWER CARRIED: its register, its number and the version it was read at, handed down
 * through the renderer's row as `ref`. The change is an `update` at that version, so a card somebody else moved first is
 * a conflict and never a silent overwrite.
 *
 * WHAT CHANGES IS THE DECLARATION'S TO SAY. A board's columns are its first column's field, drawn in the screen's
 * spelling, so the column a card lands in goes back to the declared value. A task's tick is its register's state: done
 * is the first terminal state, and not done is the first state that is not terminal.
 */

import type { RowRef } from 'braindog-render';

import { copy } from '../copy.ts';
import { REGISTERS } from './data.ts';
import { declaredValue } from './where.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type Updated =
  | { from: 'written' }
  | { from: 'refused'; fix: string }
  | { from: 'conflict'; fix: string }
  | { from: 'unreachable'; fix: string };

/** The patch that puts a card in the column `to`, which is drawn as the screen spells it. */
export const movePatch = (ref: RowRef, field: string, to: string): Record<string, unknown> => ({
  [field]: declaredValue(ref.register, field, to),
});

/** The patch that marks a task done or not done, or `null` when its register declares no state to say it with. */
export function tickPatch(ref: RowRef, done: boolean): Record<string, unknown> | null {
  const decl = REGISTERS[ref.register];
  const field = decl?.state;
  if (!decl || !field) return null;
  const terminal = decl.done ?? [];
  const values = decl.fields.find((f) => f.id === field)?.values ?? [];
  const value = done ? terminal[0] : values.find((v) => !terminal.includes(v));
  return value === undefined ? null : { [field]: value };
}

const fetched: Fetch = (url, init) => fetch(url, init);

/** One row's change, at the version the page read it at. `title` is what a conflict's sentence calls the row. */
export async function updateRow(base: string, ref: RowRef, patch: Record<string, unknown>, title: string, io: Fetch = fetched): Promise<Updated> {
  let res: Response;
  try {
    res = await io(`${base}/api/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ register: ref.register, seq: ref.seq, patch, version: ref.version }),
    });
  } catch {
    return { from: 'unreachable', fix: copy.recordNotReached };
  }
  if (res.status === 401) return { from: 'refused', fix: copy.signInAgain };
  const said: unknown = await res.json().catch(() => undefined);
  if (typeof said !== 'object' || said === null || !('ok' in said)) return { from: 'unreachable', fix: copy.recordNotReached };
  if ((said as { ok: unknown }).ok === true) return { from: 'written' };

  const refusal = (said as { refusal?: { code?: unknown; fix?: unknown } }).refusal;
  /* A CONFLICT CARRIES NO REFUSAL, and a stale version is the same fact said as one. */
  if ('conflict' in said || refusal?.code === 'VERSION_STALE') return { from: 'conflict', fix: copy.pageRowConflict(title) };
  if (refusal?.code === 'UNREACHABLE') return { from: 'unreachable', fix: copy.recordNotReached };
  return { from: 'refused', fix: typeof refusal?.fix === 'string' && refusal.fix !== '' ? refusal.fix : copy.recordNotReached };
}
