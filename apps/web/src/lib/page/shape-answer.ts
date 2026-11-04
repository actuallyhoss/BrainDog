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
import { rowHref } from '../record/row-href.ts';
import type { FactDecided, FactReading, FactRecurring, FactRun, FactService, Money } from './project-facts.ts';

export type WorkRow = { seq: number; fields: Readonly<Record<string, unknown>>; created?: string | null; updated?: string | null };

/** What the shape is drawn from. */
export type ShapeRead = {
  key: string;
  fields: Readonly<Record<string, unknown>>;
  /** The row as the record answered it, its own `id` and the day it was made among it, for a panel that needs them. */
  row: { id: string; created_at: string | null; version: number | null };
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
  /** Every key number it keeps, as the `kpis` source answered them. */
  kpis: KpiAnswered[];
  /** Its runs, newest heard first; what it runs on; its readings, newest first; its repeating money; what was decided. */
  runs: FactRun[];
  services: FactService[];
  readings: FactReading[];
  recurring: FactRecurring[];
  decided: FactDecided[];
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
  services?: { list: string; field: string; rows: unknown[] } | null;
  readings?: { list: string; field: string; rows: unknown[] } | null;
  recurring?: { list: string; field: string; rows: unknown[] } | null;
  decided?: unknown[] | null;
};

type Raw = { seq?: unknown; fields?: Record<string, unknown>; updated_at?: unknown };
const t = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const moneyIn = (v: unknown): Money | null => {
  const m = v as { amount?: unknown; currency?: unknown } | null;
  return m && typeof m.amount === 'number' && typeof m.currency === 'string' && m.currency !== '' ? { minor: m.amount, currency: m.currency } : null;
};
const rowsIn = (part: { rows?: unknown } | null | undefined): Raw[] => (Array.isArray(part?.rows) ? (part.rows as Raw[]).filter((r) => isObject(r) && isObject(r.fields)) : []);

/** The runs on it as the page reads them, newest heard first. */
export function runsIn(rows: readonly Raw[]): FactRun[] {
  return rows.flatMap((r) => {
    const f = r.fields ?? {};
    const at = t(f.last_seen) || t(r.updated_at);
    if (typeof r.seq !== 'number' || at === '') return [];
    return [
      {
        seq: r.seq,
        agent: t(f.agent) || 'other',
        doing: t(f.doing),
        at,
        started: t(f.started) || at,
        state: t(f.state),
        closedAs: t(f.closed_as),
        next: t(f.next),
        notes: Array.isArray(f.notes) ? f.notes.map(t).filter(Boolean) : [],
        wrote: typeof f.wrote === 'number' ? f.wrote : null,
        repo: t(f.repo),
      },
    ];
  });
}

/** What it runs on, as the services list holds it. */
export function servicesIn(part: { list: string; rows?: unknown } | null | undefined): FactService[] {
  const list = part?.list ?? '';
  return rowsIn(part).flatMap((r) => {
    const f = r.fields ?? {};
    const name = t(f[REGISTERS[list]?.title ?? 'name']) || t(f.name);
    if (typeof r.seq !== 'number' || name === '') return [];
    const renews = t(f.renews);
    return [{ seq: r.seq, name, provider: t(f.provider), kind: t(f.kind), renews: /^\d{4}-\d{2}-\d{2}/u.test(renews) ? renews.slice(0, 10) : null, cost: moneyIn(f.cost), cycle: t(f.cycle), state: t(f.state), note: t(f.note), href: rowHref(`${list}#${r.seq}`) ?? `/r/${list}/${r.seq}` }];
  });
}

/** Its readings, newest first. */
export function readingsIn(part: { rows?: unknown } | null | undefined): FactReading[] {
  return rowsIn(part).flatMap((r) => {
    const f = r.fields ?? {};
    const at = t(f.at);
    const name = t(f.name);
    if (at === '' || name === '') return [];
    return [{ name, value: typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null, amount: moneyIn(f.amount), unit: t(f.unit), at, source: t(f.source) }];
  });
}

/** Its repeating money. */
export function recurringIn(part: { rows?: unknown } | null | undefined): FactRecurring[] {
  return rowsIn(part).flatMap((r) => {
    const f = r.fields ?? {};
    const amount = moneyIn(f.amount);
    if (!amount) return [];
    const next = t(f.next_due);
    return [{ what: t(f.what), direction: t(f.direction), amount, every: t(f.every), nextDue: /^\d{4}-\d{2}-\d{2}/u.test(next) ? next.slice(0, 10) : null, state: t(f.state) || 'live' }];
  });
}

/** What was decided about it, latest first. */
export function decidedIn(rows: unknown): FactDecided[] {
  return (Array.isArray(rows) ? (rows as Raw[]) : []).flatMap((r) => {
    const f = isObject(r) && isObject(r.fields) ? r.fields : null;
    if (!f) return [];
    const question = t(f.question);
    return question === '' ? [] : [{ question, answer: t(f.answer_label) || t(f.answer), at: t(f.at) }];
  });
}

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
  /* TOGETHER, in the order they were named: one after another a project's four lists were four round trips with nothing
     drawn, and Enter on a project waited longest here. */
  const targets = [...new Set([...targetsOf(r), ...spokenTargets(raw.fields, targetsOf(r))])];
  const walked = await Promise.all(targets.map((target) => (io ? walkRows(client, target) : tabRows(client, base, target))));
  targets.forEach((target, i) => {
    const rows = walked[i];
    if (rows) refs.set(target, refMapOf(target, rows));
  });
  const fields = entryOf(r, raw, refs).fields as Readonly<Record<string, unknown>>;
  /* WHAT POINTS AT IT, grouped as a row's page groups it. */
  const links = isObject(said.links) && Array.isArray(said.links.from) ? await linkReader(base, io, recordNow).answered(said.links as unknown as BacklinksValue, n) : null;
  const incoming = links?.from === 'live' ? links.groups.map((g) => ({ decl: REGISTERS[g.register], name: g.name, rows: g.rows })) : [];
  /* WHAT WAS SAID OF IT. AN ID IS NOT A NAME: a line by someone the page has not named is shown without its byline. */
  const lines = Array.isArray(said.history) ? linesOf(r, said.history as (Event & Suggested)[]) : [];
  const history = lines.map((l) => ({ note: l.note, by: /^p_/u.test(l.by) ? '' : l.by, at: l.at }));
  const stateSince = stateSinceOf(lines, decl!.state, fields);
  /* ITS WORK, by what its list declares, the list learnt where the tab has not yet. */
  const work = said.work?.list ?? null;
  if (work !== null && REGISTERS[work] === undefined) await learn(client.schema, work, asked);
  const via = work !== null ? viaOf(REGISTERS[work], r) : null;
  const rows: WorkRow[] = (said.work?.rows ?? []).flatMap((x) =>
    isObject(x) && typeof x.seq === 'number' && isObject(x.fields)
      ? [{ seq: x.seq, fields: x.fields, created: typeof x.created_at === 'string' ? x.created_at : null, updated: typeof x.updated_at === 'string' ? x.updated_at : null }]
      : [],
  );
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
    row: { id: typeof raw.id === 'string' ? raw.id : '', created_at: typeof raw.created_at === 'string' ? raw.created_at : null, version: Number.isInteger(raw.version) ? (raw.version as number) : null },
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
    kpis: (Array.isArray(said.kpis) ? said.kpis : []).filter((k): k is KpiAnswered => isObject(k) && typeof (k as { name?: unknown }).name === 'string' && Array.isArray((k as { points?: unknown }).points)),
    runs: runsIn(runs as unknown as Raw[]),
    services: servicesIn(said.services),
    readings: readingsIn(said.readings),
    recurring: recurringIn(said.recurring),
    decided: decidedIn(said.decided),
    now,
  };
}
