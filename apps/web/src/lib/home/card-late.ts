/**
 * HOW MUCH OF EACH PROJECT'S WORK IS LATE, for its card's red flag (proj section 4, Row A: "1 late").
 *
 * Counted as the project's own page counts it (`ProjectShape.svelte`): the open rows of the work list that points at the
 * projects list (the one that says who holds its rows), past their day on the record's clock (`recordNow`, SF3), so a
 * card, its page's hero and Work say one number. One read a card, in parallel; a read that fails says nothing, and a
 * card with nothing late draws no flag.
 *
 * A SCREEN OF CARDS MAY NOT HOLD THE WORK LIST'S DECLARATION YET (Projects reads only the projects list), so where none
 * is held, the lists pointing at the first projects are named by one `backlinks` each and only their declarations are
 * learnt (`remote.ts` `learn`), never their rows.
 */

import { REGISTERS } from '../record/held.ts';
import { handFor } from '../record/hand.ts';
import { recordNow } from '../record/boot-live.ts';
import { createClient } from '@braindog/client';
import { learn } from '../record/remote.ts';
import { figureReader, viaOf } from '../../routes/r/[register]/[seq]/figures.ts';
import { localDay } from '../../routes/r/[register]/[seq]/said.ts';

/** What this tab has asked, so a list's declaration is asked for once. */
const asked = new Map<string, Promise<void>>();

const workFor = (projects: string): string | undefined => Object.keys(REGISTERS).find((id) => handFor(REGISTERS[id]) !== null && viaOf(REGISTERS[id], projects) !== null);

export async function latesOf(base: string, projects: string, seqs: readonly number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (seqs.length === 0) return out;
  let work = workFor(projects);
  const client = createClient({ base });
  for (const seq of seqs.slice(0, 3)) {
    if (work) break;
    const links = await client.backlinks({ register: projects, seq, limit: 24 }).catch(() => null);
    const lists = links?.ok ? [...new Set(links.value.from.map((g) => g.register))] : [];
    await Promise.all(lists.map((id) => learn(client.schema, id, asked)));
    work = workFor(projects);
  }
  const via = work ? viaOf(REGISTERS[work], projects) : null;
  if (!work || !via) return out;
  const f = figureReader(base);
  const today = localDay(recordNow());
  const got = await Promise.all(seqs.map((n) => f.openWork(work, via, `${projects}#${n}`, today).catch(() => null)));
  seqs.forEach((n, i) => {
    const late = got[i]?.late ?? 0;
    if (late > 0) out.set(n, late);
  });
  return out;
}
