/**
 * What the sidebar reads: the projects list (the one that declares `scopes`, never a list by name) and its rows, then
 * how each in-play project's week went (late work, money in this month), asked second so the names draw first.
 *
 * LOADED WITH THE SIDEBAR'S OWN CHUNK, never with the shell. IT NEVER FAILS THE FRAME: no projects list, a list the
 * reader may not read and a refused call all answer `null` or nothing, and nothing is drawn for them.
 */

import { createClient } from '@braindog/client';

import { latesOf } from '../home/card-late.ts';
import { hueOf, projectsOf, type CardDecl, type CardRow } from '../home/project-cards.ts';
import { REGISTERS } from '../record/held.ts';
import { learn } from '../record/remote.ts';
import { rowHref } from '../record/row-href.ts';
import { figureReader } from '../../routes/r/[register]/[seq]/figures.ts';
import { lanesOf, type Lanes, type SideProject } from './side.ts';

/** The most projects read: more than any record holds, and the read stays one call. */
const READ = 200;

/** A project as read, before the week and this device's pins are put on it. */
export type SideRow = Omit<SideProject, 'late' | 'moved' | 'working' | 'pinned'> & { seq: number };

export type SideRead = {
  /** The projects list's id, where "+" adds one. */
  list: string;
  rows: SideRow[];
  lanes: Lanes;
  /** Each lane's own word, as the list's state field says it ("Parked", "Finished"). */
  label: (lane: string) => string;
};

/** What this tab has asked of each list's declaration, so one is asked once. */
const asked = new Map<string, Promise<void>>();

const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

type StateField = { id: string; values?: readonly string[]; labels?: Readonly<Record<string, string>> };

/** A read still on its way, by the record it asks, so the sidebar and the More sheet opening together ask once. */
const flying = new Map<string, Promise<SideRead | null>>();

/** The record's projects, or `null` where it keeps no projects list or the list could not be read. */
export function readSide(base: string, lists: readonly { id: string }[]): Promise<SideRead | null> {
  const held = flying.get(base);
  if (held) return held;
  const asking = readSideOnce(base, lists).finally(() => flying.delete(base));
  flying.set(base, asking);
  return asking;
}

async function readSideOnce(base: string, lists: readonly { id: string }[]): Promise<SideRead | null> {
  const client = createClient({ base });
  await Promise.all(lists.filter((l) => REGISTERS[l.id] === undefined).map((l) => learn(client.schema, l.id, asked).catch(() => undefined)));
  const decls = lists.flatMap((l) => (REGISTERS[l.id] ? [{ ...(REGISTERS[l.id] as unknown as CardDecl & { done?: string[] }), id: l.id }] : []));
  const decl = projectsOf(decls);
  if (decl === null) return null;
  const out = await client.list({ register: decl.id, limit: READ }).catch(() => null);
  if (!out?.ok) return null;
  const state = decl.state ? (decl.fields.find((f) => f.id === decl.state) as StateField | undefined) : undefined;
  const rows = (out.value.rows as unknown[]).flatMap((r): SideRow[] => {
    if (typeof r !== 'object' || r === null || typeof (r as CardRow).seq !== 'number' || typeof (r as CardRow).fields !== 'object') return [];
    const { seq, fields } = r as CardRow;
    const name = said(fields[decl.title]);
    if (name === '') return [];
    return [
      {
        key: `${decl.id}#${seq}`,
        seq,
        name,
        href: rowHref(`${decl.id}#${seq}`) ?? `/r/${decl.id}/${seq}`,
        mark: decl.identity ? said(fields[decl.identity.mark]) : '',
        hue: hueOf(decl, fields),
        lane: decl.state ? said(fields[decl.state]) : '',
      },
    ];
  });
  const labels = state?.labels ?? {};
  const label = (lane: string): string => labels[lane] ?? (lane === '' ? '' : lane.charAt(0).toUpperCase() + lane.slice(1));
  return { list: decl.id, rows, lanes: lanesOf(decl, state?.values ?? []), label };
}

/** How each in-play project's week went: its late work and whether money came in this month, by key. */
export type Week = ReadonlyMap<string, { late: number; moved: boolean }>;

/**
 * THE WEEK, ONE READ A PROJECT: late work as its card and its page count it (`latesOf`), and money in as its page's
 * Money tile reads it, this month's bucket. A read that fails says nothing.
 */
export async function readWeek(base: string, list: string, play: readonly SideRow[]): Promise<Week> {
  const f = figureReader(base);
  const [lates, ins] = await Promise.all([
    latesOf(base, list, play.map((p) => p.seq)).catch(() => new Map<number, number>()),
    Promise.all(play.map((p) => f.moneyIn(p.name).catch(() => null))),
  ]);
  return new Map(
    play.map((p, i) => {
      const now = ins[i]?.months.find((m) => m.partial);
      return [p.key, { late: lates.get(p.seq) ?? 0, moved: (now?.value ?? 0) > 0 }];
    }),
  );
}
