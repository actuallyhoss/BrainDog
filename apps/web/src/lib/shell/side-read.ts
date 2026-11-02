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
import { MONEY_IN, monthsOf, type MoneyIn } from '../../routes/r/[register]/[seq]/figures.ts';
import { laneSaid, lanesOf, type Lanes, type ListFacts, type SideProject } from './side.ts';
import { keepSide, keptPerson, keptSide, type SideCopy } from './side-copy.ts';

/** The most projects read: more than any record holds, and the limit the desk and the pages ask, so all share one read. */
const READ = 500;

/** A project as read, before the week and this device's pins are put on it. */
export type SideRow = Omit<SideProject, 'late' | 'moved' | 'working' | 'pinned'> & { seq: number };

export type SideRead = {
  /** The projects list's id, where "+" adds one. */
  list: string;
  rows: SideRow[];
  lanes: Lanes;
  /** Each lane's own word, as the list's state field says it ("Parked", "Closed"). */
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
  /* EACH LANE AS EVERY OTHER SCREEN SAYS IT (`laneSaid`): the list's own label, else the value as a word. */
  const label = (lane: string): string => laneSaid(copy.labels, lane);
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

/**
 * HOW LONG THE PROJECTS' MONEY IN IS HELD, whatever the version says, as a kept read is (`TODAY_HELD_MS`): a figure a
 * project, and the record moves every few minutes on a day its agents work, so the sidebar asked them all again each
 * time, a turn of the record's thread a move, to say whether money came in this month.
 */
export const MONEY_HELD_MS = 300_000;

type MoneyIns = (MoneyIn | null)[];
let moneyHeld: { key: string; at: number; ins: Promise<MoneyIns> } | null = null;

/** Each project's money in, month by month, held for `MONEY_HELD_MS` for the same record and the same projects. */
function moneyOf(base: string, play: readonly SideRow[], now: number): Promise<MoneyIns> {
  const key = JSON.stringify([base, play.map((p) => p.name)]);
  if (moneyHeld !== null && moneyHeld.key === key && now >= moneyHeld.at && now - moneyHeld.at < MONEY_HELD_MS) return moneyHeld.ins;
  const client = createClient({ base });
  let reached = play.length === 0;
  const ins = Promise.all(
    play.map((p) =>
      client.metric(`${MONEY_IN}:${p.name}`).then(
        (out) => {
          if (out.ok || !('refusal' in out) || !AGAIN.has(out.refusal.code)) reached = true;
          return out.ok ? monthsOf(out.value) : null;
        },
        () => null,
      ),
    ),
  );
  const held = { key, at: now, ins };
  moneyHeld = held;
  /* A READ THE RECORD DID NOT ANSWER IS NOT HELD, so the next move asks again. */
  void ins.then(() => {
    if (!reached && moneyHeld === held) moneyHeld = null;
  });
  return ins;
}

/** How each in-play project's week went: its late work and whether money came in this month, by key. */
export type Week = ReadonlyMap<string, { late: number; moved: boolean }>;

/**
 * THE WEEK, ONE READ A PROJECT: late work as its card and its page count it (`latesOf`), and money in as its page's
 * Money tile reads it, this month's bucket. A read that fails says nothing.
 */
export async function readWeek(base: string, list: string, play: readonly SideRow[], now = Date.now(), before: Week = new Map(), money = true): Promise<Week> {
  /* NO MONEY ASKED OF A RECORD THAT KEEPS NONE, OR OF A READER WHO SEES NONE (collab pass 3): the figure is Money's, and a
     self-host with no Money answered each project's ask with a 404. */
  const [lates, ins] = await Promise.all([latesOf(base, list, play.map((p) => p.seq)).catch(() => null), money ? moneyOf(base, play, now) : Promise.resolve(play.map(() => null))]);
  return new Map(
    play.map((p, i) => {
      const now = ins[i] === null || ins[i] === undefined ? undefined : ins[i].months.find((m) => m.partial);
      const had = before.get(p.key);
      /* A READ THAT FAILED KEEPS WHAT WAS DRAWN (audit 2, B18): late work not counted is not "nothing late". */
      return [p.key, { late: lates === null ? (had?.late ?? 0) : (lates.get(p.seq) ?? 0), moved: ins[i] === null || ins[i] === undefined ? (had?.moved ?? false) : (now?.value ?? 0) > 0 }];
    }),
  );
}

/** Where this device keeps the last week it drew, for one record and one person. */
export const WEEK_KEPT_KEY = 'bd_side_week';
/** Bump when the kept shape changes. Before 2 it was every record's week by base alone, for whoever was signed in. */
export const WEEK_KEPT_VERSION = 2;

type WeekStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type WeekKept = { v: number; base: string; person: string; week: Record<string, { late?: unknown; moved?: unknown }> };

const weekStore = (): WeekStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * THE WEEK THIS DEVICE LAST DREW FOR THE RECORD AT `base`, drawn at once on every screen while it is read again (audit 2,
 * B18): Kiln's "late" was on Today, which reads it in its own first read, and missing on Needs you, Settings and Keys,
 * where the week waits for the screen's reads to rest and was not in yet. Empty where nothing is kept.
 *
 * ONE ENTRY, FOR ONE RECORD AND ONE PERSON, drawn only beside the shell this browser keeps for them (`keptPerson`), as
 * the list beside it is (`side-copy.ts`). Kept by record alone, a member who signed in after the owner on a shared
 * device was drawn the owner's late counts, which took in rows kept private from them, and a failed read kept them
 * (review 3, P1). An entry of the old shape, another person's, or one with no shell beside it is dropped.
 */
export function keptWeek(base: string, now: number = Date.now(), store: WeekStore | null = weekStore()): Week {
  if (!store) return new Map();
  try {
    const raw = store.getItem(WEEK_KEPT_KEY);
    if (raw === null) return new Map();
    const e = JSON.parse(raw) as Partial<WeekKept> | null;
    if (!e || e.v !== WEEK_KEPT_VERSION || typeof e.base !== 'string' || typeof e.person !== 'string' || e.week === null || typeof e.week !== 'object') {
      store.removeItem(WEEK_KEPT_KEY);
      return new Map();
    }
    if (e.base !== base) return new Map();
    if (keptPerson(base, now, store) !== e.person) {
      store.removeItem(WEEK_KEPT_KEY);
      return new Map();
    }
    return new Map(
      Object.entries(e.week).flatMap(([key, w]) =>
        w !== null && typeof w === 'object' && typeof w.late === 'number' && Number.isInteger(w.late) && w.late >= 0 ? [[key, { late: w.late, moved: w.moved === true }] as const] : [],
      ),
    );
  } catch {
    try {
      store.removeItem(WEEK_KEPT_KEY);
    } catch {
      /* nothing to drop */
    }
    return new Map();
  }
}

/** Keeps the week just read for the record at `base`, for the person the shell beside it was read for; else nothing. */
export function keepWeek(base: string, week: Week, now: number = Date.now(), store: WeekStore | null = weekStore()): void {
  if (!store) return;
  try {
    const person = keptPerson(base, now, store);
    if (person === null) return;
    const entry: WeekKept = { v: WEEK_KEPT_VERSION, base, person, week: Object.fromEntries(week) };
    store.setItem(WEEK_KEPT_KEY, JSON.stringify(entry));
  } catch {
    /* A browser that keeps nothing draws the week once it is read. */
  }
}

/**
 * HOW MANY ROWS OF A LIST ARE OPEN, for Work's row in the sidebar: every row taken on, neither in a state the list
 * declares done nor in one it keeps for later, which is what Work's own Open counts. Read off the declaration with one
 * `countBy`, never by a figure's name: the done states are its `done`, and the states kept for later are the live ones
 * its state field lists before the one a new row starts in (`laterOf`). `null` where the list declares no state, the
 * count was capped, or the read did not land; the row then keeps what it drew.
 */
export async function readOpenWork(base: string, list: string): Promise<number | null> {
  const client = createClient({ base });
  /* THE LIST'S DECLARATION MAY NOT BE LEARNED YET (Today, Needs you and Projects never open it), so it is asked, not skipped. */
  if (REGISTERS[list] === undefined) await learn(client.schema, list, asked).catch(() => undefined);
  const d = REGISTERS[list];
  if (!d?.state) return null;
  const out = await client
    .countBy({ register: list, by: d.state })
    .catch(() => null);
  if (!out?.ok) return null;
  return openOf(out.value, [...(d.done ?? []), ...laterOf(d)]);
}

/**
 * THE STATES A LIST KEEPS FOR LATER: the live ones its state field lists before the state a new row starts in, so a
 * task kept for later is not counted as taken on. None where the field names no starting state.
 */
export function laterOf(d: { state?: string | undefined; done?: readonly string[] | undefined; fields?: readonly { id: string; values?: readonly string[] | undefined; default?: unknown }[] | undefined }): string[] {
  const f = d.fields?.find((x) => x.id === d.state);
  const values = f?.values ?? [];
  const start = typeof f?.default === 'string' ? values.indexOf(f.default) : -1;
  return start <= 0 ? [] : values.slice(0, start).filter((v) => !(d.done ?? []).includes(v));
}

/** The open rows of a `countBy` over a list's state: every one matched, less those in a closed state. */
export function openOf(counted: { counts: readonly { value: unknown; n: number }[]; matched: number; capped?: true }, closed: readonly string[]): number | null {
  if (counted.capped || !Number.isSafeInteger(counted.matched)) return null;
  const shut = counted.counts.filter((c) => typeof c.value === 'string' && closed.includes(c.value)).reduce((a, c) => a + c.n, 0);
  return Math.max(0, counted.matched - shut);
}

/**
 * HOW MANY PEOPLE A LIST THAT KEEPS PEOPLE HOLDS, as its page counts them: never the reader's own row, and never one
 * merged into another. Read off the roles it declares (`meets:`), so a list that declares none answers `null` and the
 * row keeps the shell's count.
 */
export async function readFolk(base: string, list: string): Promise<number | null> {
  const client = createClient({ base });
  if (REGISTERS[list] === undefined) await learn(client.schema, list, asked).catch(() => undefined);
  const roles = REGISTERS[list]?.meets;
  const self = roles?.self;
  if (!self) return null;
  const merged = roles.merged_into;
  const out = await client
    .countBy({ register: list, by: self, ...(merged ? { where: { toJSON: () => `${merged} is empty` } } : {}) })
    .catch(() => null);
  if (!out?.ok || out.value.capped || !Number.isSafeInteger(out.value.matched)) return null;
  const mine = out.value.counts.filter((c) => c.value === true).reduce((a, c) => a + c.n, 0);
  return Math.max(0, out.value.matched - mine);
}

/** What a list's declaration says about where it belongs (`side.ts` `homesOf`), or `null` until it is learnt. */
export function factsOf(id: string, projects: string | null): ListFacts | null {
  const d = REGISTERS[id];
  if (d === undefined) return null;
  const fields = d.fields ?? [];
  return {
    ...(d.pack ? { pack: d.pack } : {}),
    money: fields.some((f) => f.type === 'money'),
    folk: d.meets !== undefined || d.org !== undefined,
    projects: d.scopes !== undefined,
    ofProjects: projects !== null && projects !== id && fields.some((f) => f.type === 'ref' && (f as { to?: unknown }).to === projects),
  };
}

/** Every list's facts once each declaration is learnt, asked together; a list whose declaration did not land is left out. */
export async function readFacts(base: string, lists: readonly { id: string }[]): Promise<Record<string, ListFacts>> {
  const client = createClient({ base });
  await Promise.all(lists.filter((l) => REGISTERS[l.id] === undefined).map((l) => learn(client.schema, l.id, asked).catch(() => undefined)));
  const projects = lists.find((l) => REGISTERS[l.id]?.scopes !== undefined)?.id ?? null;
  const out: Record<string, ListFacts> = {};
  for (const l of lists) {
    const f = factsOf(l.id, projects);
    if (f) out[l.id] = f;
  }
  return out;
}
