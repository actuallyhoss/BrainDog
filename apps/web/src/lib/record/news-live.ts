/**
 * Home's and History's reads against the record: the figures, what is new, and the log.
 *
 * A ROUTE-ONLY MODULE, loaded by the two screens that read it, like `page-live.ts`: the client carries the route table
 * as a value.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` mean there is no record here, and the screen draws the sample as it always did. Any
 * other refusal is the record's own sentence. A live answer is drawn from the answer and nothing else.
 */

import { createClient, type EventLine } from '@braindog/client';
import { isEventKind, type FxRead, type Part } from '@braindog/kernel';
import { MISSING, money } from 'braindog-render';

import { copy } from '../copy.ts';
import type { Metric } from './api.ts';
import { actorFor, forget, newsOf, readBoot, type Fetch } from './boot-live.ts';
import { METRICS } from './declared.ts';
import { noRecord } from './device.ts';
import { noteOf } from './history-live.ts';
import { format, fxNote, hrefFor, partsText, targetLine } from './metrics.ts';
import type { AuditEvent, NewsItem } from './schema.ts';

/** The three figures Home leads with, in the order it draws them. */
export const HOME_FIGURES = ['owed-to-you', 'due-30d', 'overdue'] as const;

/**
 * THE FIGURES HOME ASKS A RECORD FOR, AND NONE WHERE THEY CANNOT BE WORKED OUT. The three read Money's obligations,
 * so a record without that list (a student's) was asked for three figures it refuses every time. A use case that
 * declares its own Home asks for none: that page says what leads.
 */
export const homeFigures = (lists: readonly { id: string }[], declared: boolean): readonly string[] =>
  !declared && lists.some((l) => l.id === 'obligations') ? HOME_FIGURES : [];

/** A reading as the kernel's `metrics.ts` sends one, and only the keys read here. */
type Reading = { value: number | null; unit: string | null; rows: number; met: boolean | null; refusals: unknown[]; parts?: Part[]; fx?: FxRead };

type Said = { code: string; fix: string };

const refusalOf = (out: { ok: false; refusal: Said } | { ok: false; conflict: unknown }): Said =>
  'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record changed while it was being read.' };

/**
 * One figure as a tile, the way a live `stat` block draws one (`page-live.ts`).
 *
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over no rows carries none, because a tick over an empty list is a
 * verdict on nothing. The label, the format and the target line are the declaration's.
 */
export function tileOf(id: string, r: Reading | null): Metric {
  const decl = METRICS[id];
  const label = decl?.name ?? id;
  /* MONEY IN SEVERAL CURRENCIES IS EACH AMOUNT IN ITS OWN, and says why, as a page's tile does. */
  const across = r ? fxNote(r) : null;
  if (r?.parts && r.refusals.length === 0) return { id, label, value: partsText(r.parts), note: across ?? '' };
  if (!r || r.value === null || r.refusals.length) return { id, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const met = r.rows === 0 ? null : r.met;
  return {
    id,
    label,
    value: r.unit ? money(Math.round(r.value), r.unit) : format(decl?.format, r.value),
    note: [decl ? targetLine(decl) : '', across].filter(Boolean).join(' · '),
    tone: met === null ? undefined : met ? 'good' : 'warn',
    ...(decl && r.rows > 0 ? { href: hrefFor(decl) } : {}),
  };
}

export type News = { items: NewsItem[]; upTo: number | null; sinceCapped: boolean };

export type HomeRead = { from: 'live'; tiles: Metric[]; news: News } | { from: 'sample' } | { from: 'refused'; fix: string };

/**
 * Home's figures and what is new, asked together.
 *
 * A FIGURE THE RECORD WILL NOT WORK OUT FOR THIS CALLER IS LEFT OUT. A figure over a register somebody may not read is
 * `METRIC_UNKNOWN` to them, and a tile saying so would name the figure the refusal exists to withhold.
 */
export async function readHome(base: string, me: string | null, io?: Fetch, asked: readonly string[] = HOME_FIGURES): Promise<HomeRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const [news, ...figures] = await Promise.all([client.whatsNew(), ...asked.map((id) => client.metric(id))]);
  if (!news.ok) {
    const refusal = refusalOf(news);
    return noRecord(refusal.code) ? { from: 'sample' } : { from: 'refused', fix: refusal.fix };
  }
  return {
    from: 'live',
    tiles: figures.flatMap((out, i) => (out.ok ? [tileOf(asked[i]!, out.value as Reading)] : [])),
    news: { items: newsOf(news.value.events, me, news.value.events.some((e) => e.actor.startsWith('p_') && e.actor !== me) ? await namesFor(base, io) : new Map()), upTo: news.value.upTo, sinceCapped: news.value.sinceCapped },
  };
}

/** The names `boot` told this reader, from the shell's kept answer, so it costs no call once the shell has drawn. Asked only when somebody else is in the feed. */
async function namesFor(base: string, io?: Fetch): Promise<ReadonlyMap<string, string>> {
  const booted = await readBoot(base, io).catch(() => null);
  return new Map(Object.entries(booted?.from === 'live' ? (booted.boot.names ?? {}) : {}));
}

/** Mark everything up to `upTo` read, and drop the shell's kept answer, whose feed it was. */
export async function markAll(base: string, upTo: number | null, io?: Fetch): Promise<boolean> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.markRead(upTo ?? undefined);
  forget();
  return out.ok;
}

/** How many lines of the log History asks for: the record's largest page. */
export const LOG_PAGE = 200;

export type LogRead =
  | { from: 'live'; events: AuditEvent[]; names: Map<string, string>; more: boolean; cursor: number | null }
  | { from: 'sample' }
  | { from: 'refused'; fix: string };

/** Where a line points, in the sample's spelling: `obligations#3`, `suggestion:SG1`, or what the record wrote. */
function targetOf(e: EventLine): string | undefined {
  if (e.register !== null && e.seq !== null) return `${e.register}#${e.seq}`;
  if (e.target === null) return undefined;
  return e.target_kind === 'suggestion' && !e.target.includes(':') ? `suggestion:${e.target}` : e.target;
}

/**
 * The newest page of the record's log, in the lines History draws, or with `before` the page below the one that
 * answered with that cursor.
 *
 * `names` IS WHAT EACH TARGET IS CALLED, as the record resolved it: a row's title, or a question from its governance
 * row. History read those from the sample's rows and questions, which say nothing about a live record.
 */
export async function readLog(base: string, me: string | null, io?: Fetch, before: number | null = null): Promise<LogRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.recentHistory({ limit: LOG_PAGE, ...(before === null ? {} : { cursor: before }) });
  if (!out.ok) {
    const refusal = refusalOf(out);
    return noRecord(refusal.code) ? { from: 'sample' } : { from: 'refused', fix: refusal.fix };
  }
  const names = new Map<string, string>();
  const events: AuditEvent[] = [];
  for (const e of out.value.events) {
    if (!isEventKind(e.kind)) continue;
    const target = targetOf(e);
    if (target !== undefined && e.title) names.set(target, e.title);
    events.push({
      seq: e.rowid,
      at: e.ts,
      by: actorFor(e.actor, me),
      kind: e.kind,
      ...(target === undefined ? {} : { target }),
      note: e.note ?? (e.register !== null ? noteOf(e.register, e) : ''),
      version: e.rowid,
    });
  }
  return { from: 'live', events, names, more: out.value.cursor !== null, cursor: out.value.cursor };
}
