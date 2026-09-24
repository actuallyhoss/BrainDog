/**
 * Home's and History's reads against the record: the figures, what is new, and the log.
 *
 * A ROUTE-ONLY MODULE, loaded by the two screens that read it, like `page-live.ts`: the client carries the route table
 * as a value.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` with no slug used to draw the sample's
 * figures, feed and log; there is no sample now (DIRECTION 26). A live answer is drawn from the answer and nothing else.
 */

import { createClient, type Cursor, type EventLine } from '@braindog/client';
import { isEventKind, type FxRead, type Part } from '@braindog/kernel';
import { MISSING, money } from 'braindog-render';

import { copy } from '../copy.ts';
import { NO_ROW_SAID, unsaidFigure, type Metric } from './api.ts';
import { actorFor, forget, newsOf, readBoot, type Fetch } from './boot-live.ts';
import { METRICS } from './declared.ts';
import { noteOf } from './history-live.ts';
import { format, fxNote, hrefFor, offTarget, partsText, targetLine } from './metrics.ts';
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

/**
 * A reading as the kernel's `metrics.ts` sends one, and only the keys read here.
 *
 * `held` IS OPTIONAL AND `rows` IS NOT, which is the one asymmetry in this list and is about the
 * readers rather than the record: every record that answers a figure at all answers both, but a
 * caller that builds a reading by hand (`news-live.test.ts`) has only ever written `rows`, and a
 * required key would have made those readings a compile error rather than a repair. Where it is
 * absent the tile falls back to `rows`, which is the old, ambiguous reading of a zero and withholds
 * the verdict rather than inventing one.
 */
type Reading = { value: number | null; unit: string | null; rows: number; held?: number; met: boolean | null; refusals: unknown[]; parts?: Part[]; fx?: FxRead };

type Said = { code: string; fix: string };

const refusalOf = (out: { ok: false; refusal: Said } | { ok: false; conflict: unknown }): Said =>
  'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record changed while it was being read.' };

/**
 * One figure as a tile, the way a live `stat` block draws one (`page-live.ts`).
 *
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over an empty list carries none, because a tick over an empty list
 * is a verdict on nothing. The label, the format and the target line are the declaration's.
 *
 * AN EMPTY LIST IS `held === 0` AND NOT `rows === 0`, and the difference is the whole of it. `rows` is what the
 * predicate matched and `held` is what the list holds at all, so nothing overdue over forty invoices and nothing
 * overdue over a list nobody has written to came through here as the same tile: the first was denied the good news and
 * the door to the filter that produced it, and the second would have been given a green tick on no data at all had the
 * predicate happened to match. The kernel carries both numbers and this file's reading of one dropped `held` on the
 * floor, so the page tile (`api.ts`, which keys off `held` and says which list is empty) and Home's tile disagreed
 * about the same figure. The sentence naming the list is not here: this reader holds the figure's declaration and not
 * the record's own name for the register behind it.
 *
 * AND THE `stat` TILE NAMED ABOVE READS IT THE SAME WAY NOW, which it did not when this sentence was first written:
 * `page-live.ts` kept keying its verdict and its door off `rows` for one commit, so the live pages drew the collapsed
 * tile that this one had stopped drawing. `engines.test.ts` hands one kernel reading, `rows: 0, held: 40` over the
 * seed's forty obligations, to both renderers and holds them to one verdict and one door, so the next divergence is a
 * failing test rather than two screens answering differently about one figure.
 *
 * AND THERE IS A THIRD STATE BETWEEN THOSE TWO, which `unsaidFigure` in `api.ts` answers for every engine that draws
 * this tile: a list that HOLDS rows where not one of them carries the field the figure reduces over. `page-live.ts` had
 * it and this file did not, so driven over `projects-earning` at `rows: 0, held: 27` — his own record, 27 projects
 * imported and `revenue` unset on all of them — Home answered `tone: "good"` with a door into a list of no rows and the
 * target line "never below zero", where the declared page answered no verdict, no door and the sentence. Home is the
 * first screen he opens, so it is the worst of the three places to have got this wrong.
 *
 * THE RULE IS ASKED, NOT READ A SECOND TIME. `50 §1` is this tree's bill for the same rule written twice; the reason
 * three engines diverged here at all is that the state was written on one of them. `news-live.test.ts` drives one
 * reading through all three and holds their tone, their door and their note to each other.
 */
export function tileOf(id: string, r: Reading | null): Metric {
  const decl = METRICS[id];
  const label = decl?.name ?? id;
  /* MONEY IN SEVERAL CURRENCIES IS EACH AMOUNT IN ITS OWN, and says why, as a page's tile does. */
  const across = r ? fxNote(r) : null;
  if (r?.parts && r.refusals.length === 0) return { id, label, value: partsText(r.parts), note: across ?? '' };
  if (!r || r.value === null || r.refusals.length) return { id, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const empty = (r.held ?? r.rows) === 0;
  const unsaid = unsaidFigure(decl, r);
  const met = empty || unsaid ? null : r.met;
  /* NO DOOR OVER NO ROWS, AND NONE FOR A FIGURE THAT READS NO LIST: `hrefFor` answers `null` there, where it used to
     answer Money's page on every record. */
  const door = decl && !empty && !unsaid ? hrefFor(decl) : null;
  return {
    id,
    label,
    value: r.unit ? money(Math.round(r.value), r.unit) : format(decl?.format, r.value),
    /* THE TARGET LINE GOES WITH THE TICK, because "never below zero" under a figure no row contributed to is a bound
       every such figure satisfies, printed as though something had been checked against it. */
    note: [unsaid ? NO_ROW_SAID : decl && !offTarget(decl, r.unit) ? targetLine(decl) : '', across].filter(Boolean).join(' · '),
    tone: met === null ? undefined : met ? 'good' : 'warn',
    ...(door ? { href: door } : {}),
  };
}

/** `upTo` is the record's cursor for the newest line: a rowid for the owner, `e.<id>` for a member held to named lists. */
export type News = { items: NewsItem[]; upTo: Cursor | null; sinceCapped: boolean };

export type HomeRead = { from: 'live'; tiles: Metric[]; news: News } | { from: 'refused'; fix: string };

/**
 * Home's figures and what is new, asked together.
 *
 * A FIGURE THE RECORD WILL NOT WORK OUT FOR THIS CALLER IS LEFT OUT. A figure over a register somebody may not read is
 * `METRIC_UNKNOWN` to them, and a tile saying so would name the figure the refusal exists to withhold.
 */
export async function readHome(base: string, me: string | null, io?: Fetch, asked: readonly string[] = HOME_FIGURES): Promise<HomeRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const [news, ...figures] = await Promise.all([client.whatsNew(), ...asked.map((id) => client.metric(id))]);
  if (!news.ok) return { from: 'refused', fix: refusalOf(news).fix };
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
export async function markAll(base: string, upTo: Cursor | null, io?: Fetch): Promise<boolean> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.markRead(upTo ?? undefined);
  forget();
  return out.ok;
}

/** How many lines of the log History asks for: the record's largest page. */
export const LOG_PAGE = 200;

export type LogRead =
  | { from: 'live'; events: AuditEvent[]; names: Map<string, string>; more: boolean; cursor: Cursor | null }
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
export async function readLog(base: string, me: string | null, io?: Fetch, before: Cursor | null = null): Promise<LogRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.recentHistory({ limit: LOG_PAGE, ...(before === null ? {} : { cursor: before }) });
  if (!out.ok) return { from: 'refused', fix: refusalOf(out).fix };
  const names = new Map<string, string>();
  const events: AuditEvent[] = [];
  for (const e of out.value.events) {
    if (!isEventKind(e.kind)) continue;
    const target = targetOf(e);
    if (target !== undefined && e.title) names.set(target, e.title);
    /* NO ROWID IS NO VERSION. A member held to named lists is sent none, because the gap between two of her lines
       counted what she was not shown, and her newest line's rowid was what the footer called "version 4,192". 0 is what
       "names no event" already means (`markRead`'s `upTo: 0`), and `/audit` draws no version for it. */
    const at = e.rowid ?? 0;
    events.push({
      seq: at,
      at: e.ts,
      by: actorFor(e.actor, me),
      kind: e.kind,
      ...(target === undefined ? {} : { target }),
      note: e.note ?? (e.register !== null ? noteOf(e.register, e) : ''),
      version: at,
    });
  }
  return { from: 'live', events, names, more: out.value.cursor !== null, cursor: out.value.cursor };
}
