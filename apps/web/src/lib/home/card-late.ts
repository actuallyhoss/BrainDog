/**
 * HOW MUCH OF EACH PROJECT'S WORK IS LATE, for its card's red flag (proj section 4, Row A: "1 late").
 *
 * Counted as the project's own page counts it (`ProjectShape.svelte`): the open rows of the work list that points at the
 * projects list (the one that says who holds its rows), past their day on the record's clock (`recordNow`, SF3), so a
 * card, its page's hero and Work say one number. One read a card, in parallel; a read that fails says nothing, and a
 * card with nothing late draws no flag.
 *
 * AND THE MONEY THAT IS LATE WITH IT (the audit of 22 October, on the sidebar): a bill or a part of a plan that points at
 * the project, open past its day, is late as a task is, so a project whose salary is a fortnight late says so. Read from
 * every list the record keeps that points at the projects list, holds money and declares a day it falls due, one read a
 * list for every project at once (`paymentLates`), never a list by name.
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

/** The most late rows of one money list read at once: more than any record holds late. */
const LATE_READ = 200;

/** The lists that hold money pointing at the projects list, with a day each row falls due, other than the work list. */
const moneyFor = (projects: string, work: string | undefined): string[] =>
  Object.keys(REGISTERS).filter((id) => {
    const decl = REGISTERS[id];
    if (id === work || id === projects || !decl?.fields.some((f) => f.type === 'money')) return false;
    const via = viaOf(decl, projects);
    return via !== null && via.deadline !== null;
  });

/**
 * HOW MANY PAYMENTS ARE LATE FOR EACH PROJECT, by its number: one read a money list of what is still open and past its
 * day, each row counted for the project it points at. A link is held as the project's row id, so the projects are read
 * once for their ids, and only when something is late at all.
 */
async function paymentLates(client: ReturnType<typeof createClient>, projects: string, work: string | undefined): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const lists = moneyFor(projects, work);
  const reads = await Promise.all(
    lists.map(async (id) => {
      const via = viaOf(REGISTERS[id], projects)!;
      const open = via.done.length > 0 ? `${via.state.id} is not ${via.done.join(' or ')}, ` : '';
      const where = `${open}${via.deadline} before today, ${via.field} is set`;
      const got = await client.list({ register: id, where: { toJSON: () => where } as never, limit: LATE_READ }).catch(() => null);
      return got?.ok ? (got.value.rows as { fields?: Record<string, unknown> }[]).map((r) => r.fields?.[via.field]) : [];
    }),
  );
  const links = reads.flat().filter((v): v is string => typeof v === 'string' && v !== '');
  if (links.length === 0) return out;
  const all = await client.list({ register: projects, limit: LATE_READ }).catch(() => null);
  const seqOf = new Map(all?.ok ? (all.value.rows as { id?: unknown; seq?: unknown }[]).flatMap((r) => (typeof r.id === 'string' && typeof r.seq === 'number' ? [[r.id, r.seq] as const] : [])) : []);
  for (const link of links) {
    const spoken = new RegExp(`^${projects}#(\\d+)$`, 'u').exec(link);
    const seq = spoken ? Number(spoken[1]) : seqOf.get(link);
    if (seq !== undefined) out.set(seq, (out.get(seq) ?? 0) + 1);
  }
  return out;
}

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
  const f = figureReader(base);
  const today = localDay(recordNow());
  const [got, paid] = await Promise.all([
    work && via ? Promise.all(seqs.map((n) => f.openWork(work, via, `${projects}#${n}`, today).catch(() => null))) : Promise.resolve([]),
    paymentLates(client, projects, work).catch(() => new Map<number, number>()),
  ]);
  seqs.forEach((n, i) => {
    const late = (got[i]?.late ?? 0) + (paid.get(n) ?? 0);
    if (late > 0) out.set(n, late);
  });
  return out;
}
