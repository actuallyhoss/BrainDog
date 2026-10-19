/**
 * A row's page as the local copy keeps it (`lib/data/local.ts`): the row, its history and what points at it, the three
 * reads the page brackets together, as plain JSON. Kept `always`, so it is drawn only while the page asks again: its
 * history is the log itself, which no change can be placed on.
 *
 * ONLY A PAGE THE RECORD ANSWERED WHOLE IS KEPT. A row it refused, one it no longer holds, a merged number or a history
 * or a backlinks read it refused leaves the copy as it was. PURE, so `kept-row.test.ts` runs it under `node --test`.
 */

import type { Linked } from '../../../../lib/record/links-live.ts';
import type { Told } from '../../../../lib/record/history-live.ts';
import type { Got } from '../../../../lib/record/row-live.ts';
import type { RegisterDecl } from '../../../../lib/record/schema.ts';
import { namesOf } from '../kept-list.ts';

type LiveGot = Extract<Got, { from: 'live' }>;

export type KeptRow = {
  got: Omit<LiveGot, 'names'>;
  names: [string, string][];
  marks: [string, unknown][] | null;
  told: Extract<Told, { from: 'live' }>;
  linked: Extract<Linked, { from: 'live' }>;
};

/** The page's three answers as kept, or `null` when any of them is not one to keep. */
export function keptRowOf(got: Got, told: Told, linked: Linked): KeptRow | null {
  if (got.from !== 'live' || got.entry === null || got.folded !== undefined || told.from !== 'live' || linked.from !== 'live') return null;
  const { names, ...rest } = got;
  return { got: rest, names: [...names], marks: names.marks ? [...names.marks] : null, told, linked };
}

/** The three answers again, the names back as the map the page reads. */
export function rowFrom(kept: KeptRow): { got: Got; told: Told; linked: Linked } {
  return { got: { ...kept.got, names: namesOf(kept) }, told: kept.told, linked: kept.linked };
}

/** The row's list, the lists its refs name, and every list that points at it, whose rows the page draws. */
export function rowLists(register: string, decl: RegisterDecl | undefined, linked: Extract<Linked, { from: 'live' }>): string[] {
  const to = (decl?.fields ?? []).flatMap((f) => ((f.type === 'ref' || f.of === 'ref') && typeof f.to === 'string' ? [f.to] : []));
  return [...new Set([register, ...to, ...linked.groups.map((g) => g.register)])];
}
