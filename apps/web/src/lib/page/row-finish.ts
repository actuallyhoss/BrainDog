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

/** The finishing press for `register#seq`, as the page's button says it, or `null` where the row has none. */
export async function finishFor(base: string, register: string, seq: number): Promise<{ said: string } | null> {
  const client = createClient({ base });
  if (REGISTERS[register] === undefined) await learn(client.schema, register, asked).catch(() => undefined);
  const decl = REGISTERS[register];
  if (!decl?.state) return null;
  const got = await client.get(register, seq).catch(() => null);
  if (!got?.ok) return null;
  const fields = (got.value as { fields?: Record<string, unknown> } | null)?.fields ?? {};
  const now = fields[decl.state];
  const to = finishOf(decl, typeof now === 'string' ? now : '');
  if (to === null) return null;
  /* A PLAN WITH NOTHING LEFT TO PAY HAS NOTHING TO MARK PAID (Q3 of 29 October): an empty plan, such as a second
     "harbourview" written beside "Harbourview", wore a red "Mark paid" over "No instalments yet". Its open parts are asked for by
     the link the script writes and by the name a part was written with. */
  if (register === 'plans') {
    const id = (got.value as { id?: unknown } | null)?.id;
    const name = fields.name;
    const ways = [...(typeof id === 'string' ? [{ field: 'plan_row', is: id }] : []), ...(typeof name === 'string' && name !== '' ? [{ field: 'plan', is: name }] : [])];
    if (ways.length === 0) return null;
    const parts = await client.list({ register: 'installments', where: { all: [{ field: 'state', is: 'open' }, { any: ways }] } as never, limit: 1 }).catch(() => null);
    const rows = parts?.ok ? ((parts.value as { rows?: unknown[] } | null)?.rows ?? []) : [];
    if (rows.length === 0) return null;
  }
  return { said: to.said };
}
