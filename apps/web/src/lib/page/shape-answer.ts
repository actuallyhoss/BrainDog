/**
 * A project's shape, from its page's own answer (`shape-hold.svelte.ts` holds it, and each part of the page draws from
 * it, `ProjectPart.svelte`): its row, what was said of it, what points at it, the work and the runs on it, its key
 * number and its money, on the record's clock.
 *
 * THE PAGE'S ANSWER CARRIES THEM (scope 2026-10-24 A20). The page was answered, and then the shape read its row, its
 * history, its links, its work, its runs, its key number and five figures for itself (`shape-read.ts`, gone): seven
 * reads and a wave after the page. The page is now asked with `shape` (`page-live.ts`), the record answers each part
 * beside the blocks as its own method answers it (`packages/record/src/project-shape.ts`), and this turns that answer
 * into what the parts draw. Nothing here asks the record a read of its own: a list the tab has not learnt yet is
 * learnt (`learn`, usually answered by `schemas` already), and refs are named from the tab's walk the page shares.
 *
 * A PART THE RECORD REFUSED IS `null` IN THE ANSWER, and the part is drawn without it, as it was when its own read was
 * refused. An answer that is not a project's, or no answer, is no shape.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { sinceWords } from 'braindog-render';

import { actor } from '../record/names.ts';
import { REGISTERS } from '../record/held.ts';
import { monthsOf, openWorkOf, scalarOf, viaOf, MONEY_IN, MONEY_OUT, type OpenWork, type Via } from '../../routes/r/[register]/[seq]/figures.ts';
import { localDay } from '../../routes/r/[register]/[seq]/said.ts';
import { linesOf, type Event, type Suggested } from '../record/history-live.ts';
import { linkReader, type BacklinksValue } from '../record/links-live.ts';
import { midnightOf, sessionsOf, type SessionRow } from '../record/today-live.ts';
import { isProject, type Figure, type shapeOf } from '../record/project.ts';
import { leadIn } from '../home/card-kpis.ts';
import type { KpiAnswered } from '../home/card-kpi.ts';
import type { Months } from '../record/visuals.ts';
import { entryOf, learn, refMapOf, targetsOf, type RecordRow, type RefMap } from '../record/remote.ts';
import { rowsOf as tabRows, walkRows } from '../data/ref-rows.ts';
import { spokenTargets } from '../record/row-live.ts';
import { recordNow } from '../record/boot-live.ts';

export type WorkRow = { seq: number; fields: Readonly<Record<string, unknown>> };

/** What the shape is drawn from. */
export type ShapeRead = {
  key: string;
  fields: Readonly<Record<string, unknown>>;
  /** The row as the record answered it, its own `id` and the day it was made among it, for a panel that needs them. */
  row: { id: string; created_at: string | null };
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

/** What the record answers beside a project's page (`packages/record/src/project-shape.ts` `ShapeAnswer`). */
export type ShapeAnswer = {
  register: string;
  seq: number;
  row: unknown;
  history: unknown;
  links: unknown;
  work: { list: string; rows: unknown[]; cursor: unknown } | null;
  runs: { list: string; field: string; rows: unknown[] } | null;
  kpis: unknown[] | null;
  figures: Readonly<Record<string, unknown>>;
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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether a page's answer is a project's shape as the record says one. */
export function isShapeAnswer(v: unknown): v is ShapeAnswer {
  return isObject(v) && typeof v.register === 'string' && typeof v.seq === 'number' && isObject(v.figures);
}

/* EACH TAB'S LEARNT LISTS AND NAMED REFS, as every reader keeps them: a list is asked for once. */
const asked = new Map<string, Promise<void>>();

/**
 * The shape the record answered beside a project's page at `base`, or `null` where it is not a project's or not one. A
 * caller handed a fetch of its own (a test) walks for itself and not the tab's walk.
 */
export async function shapeFrom(base: string, said: unknown, io?: NonNullable<ClientOptions['fetch']>): Promise<ShapeRead | null> {
  if (!isShapeAnswer(said)) return null;
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const { register: r, seq: n } = said;
  if (REGISTERS[r] === undefined) await learn(client.schema, r, asked);
  const decl = REGISTERS[r];
  if (!isProject(decl) || !isObject(said.row) || !isObject(said.row.fields)) return null;
  const spoken = `${r}#${n}`;
  const raw = said.row as unknown as RecordRow;
  /* ITS REFS NAMED FROM THE TAB'S WALK, which the page beside it walked already to name its own. */
  const refs = new Map<string, RefMap>();
  for (const target of [...targetsOf(r), ...spokenTargets(raw.fields, targetsOf(r))]) {
    const rows = io ? await walkRows(client, target) : await tabRows(client, base, target);
    if (rows) refs.set(target, refMapOf(target, rows));
  }
  const fields = entryOf(r, raw, refs).fields as Readonly<Record<string, unknown>>;
  /* WHAT POINTS AT IT, grouped as a row's page groups it. */
  const links = isObject(said.links) && Array.isArray(said.links.from) ? await linkReader(base, io).answered(said.links as unknown as BacklinksValue, n) : null;
  const incoming = links?.from === 'live' ? links.groups.map((g) => ({ decl: REGISTERS[g.register], name: g.name, rows: g.rows })) : [];
  /* WHAT WAS SAID OF IT. AN ID IS NOT A NAME: a line by someone the page has not named is shown without its byline. */
  const lines = Array.isArray(said.history) ? linesOf(r, said.history as (Event & Suggested)[]) : [];
  const history = lines.map((l) => ({ note: l.note, by: /^p_/u.test(l.by) ? '' : l.by, at: l.at }));
  const stateSince = stateSinceOf(lines, decl!.state, fields);
  /* ITS WORK, by what its list declares, the list learnt where the tab has not yet. */
  const work = said.work?.list ?? null;
  if (work !== null && REGISTERS[work] === undefined) await learn(client.schema, work, asked);
  const via = work !== null ? viaOf(REGISTERS[work], r) : null;
  const rows: WorkRow[] = (said.work?.rows ?? []).flatMap((x) => (isObject(x) && typeof x.seq === 'number' && isObject(x.fields) ? [{ seq: x.seq, fields: x.fields }] : []));
  const now = recordNow();
  const open = via ? openWorkOf(rows, via, localDay(now), said.work?.cursor != null) : null;
  const runs = (said.runs?.rows ?? []) as Parameters<typeof sessionsOf>[0];
  /* ITS MONEY, by the name the record asked it by, which is the row's name. */
  const name = String(fields[decl!.title] ?? '').trim();
  const figure = (id: string): unknown => (Object.hasOwn(said.figures, `${id}:${name}`) ? said.figures[`${id}:${name}`] : null);
  const scalar = (id: string): Figure | null => {
    const v = figure(id);
    return v === null ? null : (scalarOf(v) as Figure | null);
  };
  const months = (id: string): Months | null => {
    const v = figure(id);
    return v === null ? null : ((monthsOf(v) as Months | null) ?? null);
  };
  return {
    key: spoken,
    fields,
    row: { id: typeof raw.id === 'string' ? raw.id : '', created_at: typeof raw.created_at === 'string' ? raw.created_at : null },
    incoming,
    history,
    stateSince,
    money: { in: scalar('project-in-month'), out: scalar('project-out-month'), owed: scalar('project-owed') },
    inByMonth: months(MONEY_IN),
    outByMonth: months(MONEY_OUT),
    work,
    via,
    rows,
    open,
    noun: (work ? (REGISTERS[work]?.name ?? '') : '').toLowerCase(),
    sessions: sessionsOf(runs, midnightOf(now), now),
    last: lastOf(runs, now),
    kpi: leadIn(said.kpis),
    now,
  };
}
