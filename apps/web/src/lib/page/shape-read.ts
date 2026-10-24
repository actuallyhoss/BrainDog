/**
 * A project's shape, read (`ProjectShape.svelte` draws it): its row, what was said of it, what points at it, the work
 * and the runs on it, its key number and its money, on the record's clock.
 *
 * ASKED AHEAD OF THE SHAPE (`shapeAhead`): a page about a project's row says which row the moment its answer is in, and
 * the shape mounted only once the page's blocks had walked every list their rows name, so it was read a round trip or
 * three after the page was drawn and the page's blocks were pushed down when it landed (CLS 0.15 on a project's first
 * open, `loop/perf/r3-diag.mjs`). The page now asks for it as soon as it knows the row and the shape takes that read when
 * it mounts (`takeShape`), so it lands sooner; what follows it on the page waits for it (`shapeWaits` in `PageView`).
 *
 * ONE ROUND TRIP AND NOT THREE: what needs only the row's number (what was said of it, what points at it, its key
 * number) is asked beside the row, the work and the runs as soon as the lists' declarations are learnt, and the money,
 * asked by the project's name, by the title the page was expanded under (`about` in `page-live.ts`).
 *
 * Each read here is the reader's own and held to the reader by the record, as it was in the component.
 */

import { createClient } from '@braindog/client';
import { sinceWords } from 'braindog-render';

import { actor } from '../record/names.ts';

import { REGISTERS } from '../record/held.ts';
import { figureReader, openWorkOf, viaOf, WORK_READ, type OpenWork, type Via } from '../../routes/r/[register]/[seq]/figures.ts';
import { localDay } from '../../routes/r/[register]/[seq]/said.ts';
import { readHistory } from '../record/history-live.ts';
import { linkReader } from '../record/links-live.ts';
import { handFor } from '../record/hand.ts';
import { midnightOf, sessionsOf, type SessionRow } from '../record/today-live.ts';
import { isProject, type Figure, type shapeOf } from '../record/project.ts';
import type { KpiAnswered } from '../home/project-cards.ts';
import type { Months } from '../record/visuals.ts';
import { rowReader } from '../record/row-live.ts';
import { readBoot, recordNow } from '../record/boot-live.ts';
import { learn } from '../record/remote.ts';

export type WorkRow = { seq: number; fields: Readonly<Record<string, unknown>> };

/** What the shape is drawn from. */
export type ShapeRead = {
  key: string;
  fields: Readonly<Record<string, unknown>>;
  incoming: Parameters<typeof shapeOf>[0]['incoming'];
  history: Parameters<typeof shapeOf>[0]['history'];
  money: { in: Figure | null; out: Figure | null; owed: Figure | null };
  inByMonth: Months | null;
  outByMonth: Months | null;
  /** The work list that points here, how it points, and every row of it on this project. */
  work: string | null;
  via: Via | null;
  rows: WorkRow[];
  open: OpenWork | null;
  /** What the open work is called, in the plural and lower case. */
  noun: string;
  /** The runs on this project heard from today. */
  sessions: SessionRow[];
  /** The day the row last moved into the state it is in now, read off its history, or `null` where no line says so. */
  stateSince: string | null;
  /** Who worked on it last and how long ago in words, from its newest run on any day: the hero's news. */
  last: { name: string; said: string } | null;
  /** The key number its card leads with, as the `kpis` source answered it, where it keeps one. */
  kpi: KpiAnswered | null;
  now: number;
};

/** The newest run of those read (newest first), as the hero says it: who, and how long ago in words. */
export function lastOf(runs: readonly { fields?: Readonly<Record<string, unknown>>; updated_at?: string }[], now: number): { name: string; said: string } | null {
  for (const r of runs) {
    const at = String(r.fields?.last_seen ?? r.updated_at ?? '').trim();
    if (!Number.isFinite(Date.parse(at))) continue;
    const agent = String(r.fields?.agent ?? '').trim() || 'other';
    return { name: actor(agent).name, said: sinceWords(at, now) };
  }
  return null;
}

/**
 * THE DAY A ROW MOVED INTO THE STATE IT IS IN, from its history (newest first): the newest line that set the state field
 * to what it holds now. `null` where the list declares no state or no line says so, and the page then says no day.
 */
export function stateSinceOf(lines: readonly { at: string; field?: string; to?: unknown }[], state: string | undefined, fields: Readonly<Record<string, unknown>>): string | null {
  if (!state) return null;
  const now = fields[state];
  const moved = lines.find((l) => l.field === state && l.to === now && Number.isFinite(Date.parse(l.at)));
  return moved ? moved.at : null;
}

/* A read that fails is a read that said nothing: the blocks it feeds go without it and the others still draw. */
const quiet = <T>(p: Promise<T>, none: T): Promise<T> => p.catch(() => none);

/** The shape of the project at `r#n` on the record at `base`, or `null` where it is not a project's row or not read. */
export async function readShape(base: string, r: string, n: number, title = ''): Promise<ShapeRead | null> {
  const client = createClient({ base });
  const linked = linkReader(base);
  const spoken = `${r}#${n}`;
  /* A ROW THAT IS NOT A PROJECT'S IS READ FOR NOTHING: its list is learnt first, which `schemas` has usually answered. */
  const asked = new Map<string, Promise<void>>();
  if (REGISTERS[r] === undefined) await learn(client.schema, r, asked);
  if (!isProject(REGISTERS[r])) return null;
  /* ITS ROW, WHAT WAS SAID OF IT, WHAT POINTS AT IT AND ITS KEY NUMBER go out at once: none needs another declaration. */
  const reading = Promise.all([
    rowReader(base).read(r, n),
    quiet<Awaited<ReturnType<typeof readHistory>> | null>(readHistory(base, r, n), null),
    quiet<Awaited<ReturnType<ReturnType<typeof linkReader>['read']>> | null>(linked.read(r, n), null),
  ] as const);
  const leading = quiet(import('../home/card-kpis.ts').then((m) => m.readLead(base, spoken)), null);
  /* THE MONEY IS ASKED BY THE PROJECT'S NAME: the one the page was expanded under, where it was handed one, so it goes out
     with the row and not after it; asked again by the row's own name where the two differ. */
  const f = figureReader(base);
  const moneyOf = (name: string) =>
    Promise.all([
      ...(['project-in-month', 'project-out-month', 'project-owed'] as const).map((m) => (name === '' ? Promise.resolve(null) : quiet(f.scalar(m, name), null))),
      name === '' ? Promise.resolve(null) : quiet(f.moneyIn(name), null),
      name === '' ? Promise.resolve(null) : quiet(f.moneyOut(name), null),
    ] as const);
  const said = title.trim();
  const early = said === '' ? null : moneyOf(said);
  /* THE WORK AND THE RUNS ARE FOUND BY WHAT THE LISTS DECLARE, so every list `boot` names is learnt first: from the
     declarations asked beside `boot` (`schemas`) where they are in, else in one `schemas` (`batchSchemas`). A list
     the reader may not read is refused there and is no list to find. */
  await quiet(
    readBoot(base).then((booted) => {
      const ids = booted.from === 'live' ? booted.boot.registers.map((x) => x.id) : [];
      return Promise.all(ids.filter((id) => REGISTERS[id] === undefined).map((id) => learn(client.schema, id, asked)));
    }),
    [],
  );
  /* THE WORK LIST IS THE ONE THAT SAYS WHO HOLDS ITS ROWS AND POINTS AT THIS LIST, found by what it declares. */
  const work = Object.keys(REGISTERS).find((id) => handFor(REGISTERS[id]) !== null && viaOf(REGISTERS[id], r) !== null) ?? null;
  const via = work ? viaOf(REGISTERS[work], r) : null;
  /* THE RUNS ON IT: the list whose rows are runs (`seq_prefix`) heard from (`last_seen`), by the field that names the project:
     a ref to this list, or its `project`, which holds the spoken id (`things#1`). */
  const runs = Object.keys(REGISTERS).find((id) => (REGISTERS[id] as { seq_prefix?: unknown }).seq_prefix !== undefined && REGISTERS[id]!.fields.some((x) => x.id === 'last_seen'));
  const runsVia = runs ? (REGISTERS[runs]!.fields.find((x) => x.type === 'ref' && (x as { to?: string }).to === r) ?? REGISTERS[runs]!.fields.find((x) => x.id === 'project'))?.id : undefined;
  const asWhere = (w: string) => ({ toJSON: () => w });
  const listing = Promise.all([
    work && via ? quiet(client.list({ register: work, where: asWhere(`${via.field} is ${spoken}`) as never, limit: WORK_READ }), null) : Promise.resolve(null),
    runs && runsVia ? quiet(client.list({ register: runs, where: asWhere(`${runsVia} is ${spoken}`) as never, limit: 40, order: [{ field: 'last_seen', dir: 'desc' }] }), null) : Promise.resolve(null),
  ] as const);
  const [row, told, links] = await reading;
  if (row.from !== 'live' || !row.entry || !isProject(REGISTERS[r])) return null;
  const decl = REGISTERS[r]!;
  const name = String(row.entry.fields[decl.title] ?? '').trim();
  const incoming = links?.from === 'live' ? links.groups.map((g) => ({ decl: REGISTERS[g.register], name: g.name, rows: g.rows })) : [];
  /* AN ID IS NOT A NAME: a line by someone the page has not named is shown without its byline. */
  const history = (told?.from === 'live' ? told.lines : []).map((l) => ({ note: l.note, by: /^p_/u.test(l.by) ? '' : l.by, at: l.at }));
  const stateSince = told?.from === 'live' ? stateSinceOf(told.lines, decl.state, row.entry.fields) : null;
  const now = recordNow();
  const today = localDay(now);
  const [[i, o, w, inByMonth, outByMonth], [listed, runRows], kpi] = await Promise.all([early !== null && said === name ? early : moneyOf(name), listing, leading] as const);
  const got = listed && (listed as { ok?: boolean }).ok ? (listed as { value: { rows: { seq: number; fields: Record<string, unknown> }[]; cursor: unknown } }).value : null;
  const rows: WorkRow[] = (got?.rows ?? []).filter((x) => typeof x.seq === 'number').map((x) => ({ seq: x.seq, fields: x.fields }));
  const open = via ? openWorkOf(rows, via, today, got?.cursor != null) : null;
  const runGot = runRows && (runRows as { ok?: boolean }).ok ? ((runRows as { value: { rows: unknown[] } }).value.rows as Parameters<typeof sessionsOf>[0]) : [];
  return {
    key: spoken,
    fields: row.entry.fields,
    incoming,
    history,
    stateSince,
    money: { in: (i as Figure | null) ?? null, out: (o as Figure | null) ?? null, owed: (w as Figure | null) ?? null },
    inByMonth: (inByMonth as Months | null) ?? null,
    outByMonth: (outByMonth as Months | null) ?? null,
    work,
    via,
    rows,
    open,
    noun: (work ? (REGISTERS[work]?.name ?? '') : '').toLowerCase(),
    sessions: sessionsOf(runGot, midnightOf(now), now),
    last: lastOf(runGot, now),
    kpi:(kpi as KpiAnswered | null | undefined) ?? null,
    now,
  };
}

/** How long a shape asked ahead may be taken by the shape that mounts for it; older, it reads again. */
const AHEAD_MS = 5_000;

const ahead = new Map<string, { at: number; read: Promise<ShapeRead | null> }>();

/** Ask for the shape of `r#n` now, for the shape that mounts for it to take (`takeShape`); the same ask, if one is out. */
export function shapeAhead(base: string, r: string, n: number, title = ''): Promise<ShapeRead | null> {
  const key = `${base} ${r}#${n}`;
  const was = ahead.get(key);
  if (was !== undefined && performance.now() - was.at < AHEAD_MS) return was.read;
  const read = readShape(base, r, n, title).catch(() => null);
  ahead.set(key, { at: performance.now(), read });
  return read;
}

/** The shape asked ahead for `r#n`, taken once; `null` where none was asked or it is too old to be the record's now. */
export function takeShape(base: string, r: string, n: number): Promise<ShapeRead | null> | null {
  const key = `${base} ${r}#${n}`;
  const was = ahead.get(key);
  ahead.delete(key);
  return was !== undefined && performance.now() - was.at < AHEAD_MS ? was.read : null;
}
