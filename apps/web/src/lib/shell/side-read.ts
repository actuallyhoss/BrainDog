/**
 * What the sidebar reads: the projects list (the one that declares `scopes`, never a list by name) and its rows, then
 * how each in-play project's week went (late work, money in this month), asked second so the names draw first.
 *
 * LOADED WITH THE SIDEBAR'S OWN CHUNK, never with the shell. IT NEVER FAILS THE FRAME: no projects list, a list the
 * reader may not read and a refused call all answer `null` or nothing, and nothing is drawn for them.
 */

import { createClient } from '@braindog/client';

import { latesOf } from '../home/card-late.ts';
import { drawnRead, hueOf, projectsOf, type CardDecl, type CardRow } from '../home/project-cards.ts';
import { REGISTERS } from '../record/held.ts';
import { learn } from '../record/remote.ts';
import { rowHref } from '../record/row-href.ts';
import { figureReader } from '../../routes/r/[register]/[seq]/figures.ts';
import { lanesOf, type Lanes, type SideProject } from './side.ts';
import { keepSide, keptSide, type SideCopy } from './side-copy.ts';

/** The most projects read: more than any record holds, and the limit the desk and the pages ask, so all share one read. */
const READ = 500;

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

/** A read still on its way, by the record it asks, so the sidebar and the phone's Projects opening together ask once. */
const flying = new Map<string, Promise<SideRead | null>>();

/**
 * The record's projects, or `null` where it keeps no projects list or the reader may not read it. A read cut off or
 * not answered (the screen moved on, the record busy) is asked again a moment later, `AGAIN_MS` apart, and throws once
 * those are spent, so the sidebar keeps what it drew rather than drawing nothing.
 */
export function readSide(base: string, lists: readonly { id: string }[]): Promise<SideRead | null> {
  const held = flying.get(base);
  if (held) return held;
  const asking = readSideAgain(base, lists).finally(() => flying.delete(base));
  flying.set(base, asking);
  return asking;
}

/** How long after a read that did not land the sidebar asks again, each time. */
export const AGAIN_MS = [400, 1_600] as const;
/** What says the record was not reached or not free, which is asked again, and not a refusal of the list. */
const AGAIN = new Set(['UNREACHABLE', 'INTERNAL', 'RECORD_UNAVAILABLE', 'RATE_LIMITED']);

/** Not reached: asked again. */
class NotReached extends Error {}

async function readSideAgain(base: string, lists: readonly { id: string }[]): Promise<SideRead | null> {
  for (let n = 0; ; n++) {
    try {
      return await readSideOnce(base, lists);
    } catch (e) {
      const wait = AGAIN_MS[n];
      if (!(e instanceof NotReached) || wait === undefined) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** The list last drawn on this device for the record at `base` (`side-copy.ts`), drawn while it is read; else `null`. */
export function keptRead(base: string): SideRead | null {
  const kept = keptSide(base);
  return kept ? sideOf(kept) : null;
}

/** The sidebar's read from what it keeps of it: its lanes and their words rebuilt from the values the list declares. */
function sideOf(copy: SideCopy): SideRead {
  const label = (lane: string): string => copy.labels[lane] ?? (lane === '' ? '' : lane.charAt(0).toUpperCase() + lane.slice(1));
  return { list: copy.list, rows: copy.rows, lanes: lanesOf({ done: copy.done }, copy.values), label };
}

async function readSideOnce(base: string, lists: readonly { id: string }[]): Promise<SideRead | null> {
  const client = createClient({ base });
  await Promise.all(lists.filter((l) => REGISTERS[l.id] === undefined).map((l) => learn(client.schema, l.id, asked).catch(() => undefined)));
  const decls = lists.flatMap((l) => (REGISTERS[l.id] ? [{ ...(REGISTERS[l.id] as unknown as CardDecl & { done?: string[] }), id: l.id }] : []));
  const decl = projectsOf(decls);
  if (decl === null) {
    /* A LIST WHOSE DECLARATION DID NOT LAND IS NOT A RECORD WITH NO PROJECTS: asked again. */
    if (lists.some((l) => REGISTERS[l.id] === undefined)) throw new NotReached();
    return null;
  }
  /* ONLY THE FIELDS A ROW IS DRAWN FROM (`drawnRead`), never its notes. */
  const out = await client.list(drawnRead(decl, READ)).catch(() => null);
  if (out === null || (!out.ok && (!('refusal' in out) || AGAIN.has(out.refusal.code)))) throw new NotReached();
  if (!out.ok) return null;
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
        /* ITS NEXT STEP, the field its card says it from (`cardsOf`), for the phone's row (Z32 of 25 October). */
        ...(said(fields.next) === '' ? {} : { next: said(fields.next) }),
      },
    ];
  });
  /* KEPT ON THIS DEVICE AS DRAWN, for the next screen to draw at once (`side-copy.ts`). */
  const copy: SideCopy = { list: decl.id, rows, values: [...(state?.values ?? [])], done: [...(decl.done ?? [])], labels: { ...(state?.labels ?? {}) } };
  keepSide(base, copy);
  return sideOf(copy);
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

/**
 * HOW MANY ROWS OF A LIST ARE OPEN, for Work's row in the sidebar (`side.ts` `withOpenWork`): every row whose state is
 * not one the list declares done, as Work's head and its project chips count them. Read off the declaration (its
 * `state` and `done`) with one `countBy`, never by a figure's name. `null` where the list declares no state, the count
 * was capped, or the read did not land, and the row then says no number.
 */
export async function readOpenWork(base: string, list: string): Promise<number | null> {
  const d = REGISTERS[list] as { state?: string; done?: readonly string[] } | undefined;
  if (!d?.state) return null;
  const out = await createClient({ base })
    .countBy({ register: list, by: d.state })
    .catch(() => null);
  if (!out?.ok) return null;
  return openOf(out.value, d.done ?? []);
}

/** The open rows of a `countBy` over a list's state: every one matched, less those in a done state. */
export function openOf(counted: { counts: readonly { value: unknown; n: number }[]; matched: number; capped?: true }, done: readonly string[]): number | null {
  if (counted.capped || !Number.isSafeInteger(counted.matched)) return null;
  const closed = counted.counts.filter((c) => typeof c.value === 'string' && done.includes(c.value)).reduce((a, c) => a + c.n, 0);
  return Math.max(0, counted.matched - closed);
}
