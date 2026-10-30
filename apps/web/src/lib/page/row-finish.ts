/**
 * THE ONE PRESS ON A PAGE ABOUT A ROW (things, not rows): finish it, in the list's own word. A bill's page says
 * "Mark paid" at its head, a task's "Mark done", read from the list's declaration (`finishOf`) and pressed through the
 * same write Today's late lines use (`finishLate`), with its Undo. Nothing for a row already finished, and nothing on a
 * list that declares no way to finish one.
 *
 * READ ON THE PAGE'S OPEN, ONE ROW, and never with the shell: the page chunk loads it.
 */

import { createClient } from '@braindog/client';

import { REGISTERS } from '../record/held.ts';
import { learn } from '../record/remote.ts';
import { finishOf } from '../../routes/r/[register]/[seq]/lead.ts';

const asked = new Map<string, Promise<void>>();

/** A list as far as its parts are asked: its fields, its state and the states that finish it. */
type Decl = NonNullable<(typeof REGISTERS)[string]>;
const sameSet = (a: readonly string[] = [], b: readonly string[] = []): boolean => a.length > 0 && a.length === b.length && a.every((x) => b.includes(x));

/**
 * THE LIST A ROW IS FINISHED THROUGH, or `null`: one whose rows are its parts. Read off the declarations, never off a
 * name: a list that keeps no money of its own and is finished by the same words as a list that points at it and does
 * keep money (a plan, paid or cancelled, and its instalments, paid or cancelled). Such a row is finished when its parts
 * are, so with none of them open there is nothing to press.
 */
export function partsOf(decl: Decl, all: readonly Decl[]): { list: string; link: string; state: string; done: readonly string[] } | null {
  if (!decl.state || (decl.done ?? []).length === 0 || decl.fields.some((f) => f.type === 'money' && f.retired !== true)) return null;
  for (const d of all) {
    if (d.id === decl.id || !d.state || !sameSet(d.done, decl.done) || !d.fields.some((f) => f.type === 'money' && f.retired !== true)) continue;
    const link = d.fields.find((f) => f.type === 'ref' && f.to === decl.id && f.retired !== true);
    if (link) return { list: d.id, link: link.id, state: d.state, done: d.done ?? [] };
  }
  return null;
}

/** The finishing press for `register#seq`, as the page's button says it, or `null` where the row has none. */
export async function finishFor(base: string, register: string, seq: number, lists: readonly { id: string; kernel?: true }[] = []): Promise<{ said: string } | null> {
  const client = createClient({ base });
  if (REGISTERS[register] === undefined) await learn(client.schema, register, asked).catch(() => undefined);
  /* NO FINISH ON AN AGENT'S RUN (audit 6g, AG10): a run working now led with a red "Mark done" beside its own Tell, Pause
     and Stop. A run ends itself, or is stopped from its live row. */
  if (register === 'session') return null;
  const decl = REGISTERS[register];
  if (!decl?.state) return null;
  const got = await client.get(register, seq).catch(() => null);
  if (!got?.ok) return null;
  const fields = (got.value as { fields?: Record<string, unknown> } | null)?.fields ?? {};
  const now = fields[decl.state];
  const to = finishOf(decl, typeof now === 'string' ? now : '');
  if (to === null) return null;
  /* A ROW WITH NOTHING LEFT TO PAY HAS NOTHING TO MARK PAID (Q3 of 29 October): an empty plan, such as a second "harbourview"
     written beside "Harbourview", wore a red "Mark paid" over "No instalments yet". Its open parts are asked for by the link
     the parts keep to it (`partsOf`); a part linked to no row is matched to its row by the record's own script. */
  if (!decl.fields.some((f) => f.type === 'money' && f.retired !== true) && (decl.done ?? []).length > 0) {
    await Promise.all(lists.filter((l) => l.kernel !== true && REGISTERS[l.id] === undefined).map((l) => learn(client.schema, l.id, asked).catch(() => undefined)));
    const parts = partsOf(decl, Object.values(REGISTERS));
    const id = (got.value as { id?: unknown } | null)?.id;
    if (parts && typeof id === 'string') {
      const open = await client
        .list({ register: parts.list, where: { all: [{ field: parts.state, not_in: [...parts.done] }, { field: parts.link, is: id }] } as never, limit: 1 })
        .catch(() => null);
      const rows = open?.ok ? ((open.value as { rows?: unknown[] } | null)?.rows ?? []) : [];
      if (rows.length === 0) return null;
    }
  }
  return { said: to.said };
}
