/**
 * THE ONE PRESS ON A LATE ROW OF TODAY: finish it where it is shown. "Mark paid" on a bill or a salary, "Mark done"
 * on a task, in the words the row's own page leads with (`finishOf`), through the same write and with the same way back.
 *
 * READ FIRST, THEN WRITTEN AT THAT VERSION. The late list is a read across every list (`deadlines`), which carries no
 * row's version, so the row is read once, and the write is held to what it read: somebody else's change in between is a
 * conflict that is said, never a quiet overwrite. Only the state moves, so nothing else of the row is sent.
 *
 * THE LINE IS DRAWN FINISHED ON THE PRESS (`LateNow.svelte`), and this goes behind it: a refusal puts the line back and says
 * why, and the Undo here takes it back as the record's own write.
 *
 * LOADED ON THE PRESS AND NEVER WITH TODAY: the front door carries none of it.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { putBackOf } from '../record/field-write.ts';
import { REGISTERS } from '../record/held.ts';
import { learn } from '../record/remote.ts';
import type { Fields } from '../record/schema.ts';
import { toasts } from '../ui/toast.svelte.ts';
import { finishOf } from '../../routes/r/[register]/[seq]/lead.ts';

/** A row as `list#number`, the handle a late line carries. */
const HANDLE = /^([a-z][a-z0-9_-]*)#([1-9][0-9]*)$/u;

/** The row a late line names, or `null` for one that names none. */
export function rowOf(handle: string): { register: string; seq: number } | null {
  const m = HANDLE.exec(handle);
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
}

/** What a press did: finished, the row's own page to open instead, or the record's sentence on why not. */
export type Finished = { ok: true } | { ok: false; open: true } | { ok: false; fix: string };

type Row = { fields: Record<string, unknown>; version?: number };
const isRow = (v: unknown): v is Row => v !== null && typeof v === 'object' && typeof (v as { fields?: unknown }).fields === 'object';

/**
 * Finish the row `handle` names, at `base`, and say so with an Undo. `again` reads Today again once the record has it,
 * and once more after an Undo; `undone` has the line drawn as it was the moment Undo is pressed. A list with no way to
 * finish a row (one finished state that may be an ending, or none) answers `open`: its own page is where it is changed.
 */
export async function finishLate(base: string, handle: string, again: () => void, undone: () => void = () => {}): Promise<Finished> {
  const at = rowOf(handle);
  if (at === null) return { ok: false, open: true };
  const client = createClient({ base });
  try {
    if (REGISTERS[at.register] === undefined) await learn(client.schema, at.register, new Map());
    const decl = REGISTERS[at.register];
    if (!decl?.state) return { ok: false, open: true };
    const got = await client.get(at.register, at.seq);
    if (!got.ok || !isRow(got.value)) return { ok: false, fix: copy.writeNotReached };
    const row = got.value;
    const now = row.fields[decl.state];
    const to = finishOf(decl, typeof now === 'string' ? now : '');
    if (to === null) return { ok: false, open: true };
    const patch: Fields = { [decl.state]: to.value };
    const out = await client.update({ register: at.register, seq: at.seq, patch, ...(typeof row.version === 'number' ? { version: row.version } : {}) });
    if (!out.ok) return { ok: false, fix: 'refusal' in out ? out.refusal.fix : copy.writeRaced };
    again();
    const wrote = out.value as { version?: unknown } | null;
    const version = typeof wrote?.version === 'number' ? wrote.version : undefined;
    const before = { ...(row.fields as Fields) };
    toasts.push(to.done, {
      undo: () => {
        undone();
        void client
          .update({ register: at.register, seq: at.seq, patch: putBackOf(before, patch, decl), ...(version === undefined ? {} : { version }) })
          .then((back) => {
            if (!back.ok) toasts.push('refusal' in back ? back.refusal.fix : copy.writeRaced, { intent: 'warn' });
            again();
          });
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, fix: copy.writeNotReached };
  }
}
