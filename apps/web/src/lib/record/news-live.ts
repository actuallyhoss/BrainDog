/**
 * Home's read mark and History's log against the record; and one figure as a tile, which the palette draws.
 *
 * A ROUTE-ONLY MODULE, loaded by the screens that read it, like `page-live.ts`: the client carries the route table
 * as a value. Home imports `markAll` with the screen, not when the reader leaves, so the mark can be sent from a
 * closing tab.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` with no slug used to draw the sample's
 * figures, feed and log; there is no sample now. A live answer is drawn from the answer and nothing else.
 *
 * EVERY SENTENCE THE RECORD STORED IS HANDED ON THROUGH `moneyInText`. The kernel writes an amount into a sentence the
 * way a program reads it, "GBP 2,400.00", and a screen prints it the way a person does, "£2,400.00" in the home
 * currency and "$4,800.00 USD" in any other. So the log leaves here already spoken.
 */

import { createClient, type Cursor, type EventLine } from '@braindog/client';
import type { FxRead, Part } from '@braindog/kernel';
import { isEventKind } from '@braindog/kernel/constants';
import { MISSING, money } from 'braindog-render';

import { copy } from '../copy.ts';
import { NO_ROW_SAID, unsaidFigure, type Metric } from './api.ts';
import { actorFor, refreshShell, type Fetch } from './boot-live.ts';
import { METRICS } from './declared.ts';
import { noteOf, settlingOf } from './history-live.ts';
import { beyondOf, format, fxNote, hrefFor, partsText, targetSaid } from './metrics.ts';
import { moneyInText } from './money.ts';
import { runByIn } from './names.ts';
import type { AuditEvent } from './schema.ts';

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
type Reading = { value: number | null; unit: string | null; rows: number; held?: number; met: boolean | null; refusals: unknown[]; parts?: Part[]; fx?: FxRead; beyond?: unknown };

type Said = { code: string; fix: string };

const refusalOf = (out: { ok: false; refusal: Said } | { ok: false; conflict: unknown }): Said =>
  'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record changed while it was being read.' };

/**
 * One figure as a tile, the way a live `stat` block draws one (`page-live.ts`).
 *
 * THE PALETTE DRAWS IT NOW, AND HOME DOES NOT. Home asked Money's three figures of every record holding `obligations`,
 * which is the web knowing one pack by the name of its list; a Home that leads with figures declares a `stat` block,
 * and the page reader draws it. The history below is Home's, and it is kept because the rule it bought still holds
 * for every figure the palette draws.
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
 * it and this file did not, so driven over `projects-earning` at `rows: 0, held: 27` (his own record, 27 projects
 * imported and `revenue` unset on all of them), Home answered `tone: "good"` with a door into a list of no rows and the
 * target line "never below zero", where the declared page answered no verdict, no door and the sentence.
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
  /* A WALK THAT NEVER WENT UNDER HAS NO VALUE AND IS NO FAILURE: the day it lasts past, as a page's tile says it. */
  const lasts = r && r.value === null && r.refusals.length === 0 ? beyondOf(r) : null;
  if (lasts !== null) return { id, label, value: copy.lastsPast(lasts), note: '' };
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
    /* IN THE CURRENCY THE FIGURE WAS READ IN (`targetSaid`), as a page's tile says it: a bare `money` names none, and
       Slash's Figures said "720000 over your limit", minor units as they are kept (the audit of 20 October). */
    note: [unsaid ? NO_ROW_SAID : decl ? targetSaid(decl, r) : '', across].filter(Boolean).join(' · '),
    tone: met === null ? undefined : met ? 'good' : 'warn',
    ...(door ? { href: door } : {}),
  };
}

/*
 * HOME READS WHAT IS NEW AS A `feed` BLOCK NOW (`lib/home/default-home.ts`), which the page reader draws with the
 * reader's mark, so the feed's own read went. What stays is the mark: Home stamps it when the reader leaves.
 */

/**
 * Mark everything up to `upTo` read, and ask the shell's `boot` again behind it, whose feed it was. `upTo` is the record's cursor
 * for the newest line: a rowid for the owner, `e.<id>` for a member held to named lists, handed back as it came.
 *
 * THE REQUEST IS MADE BEFORE THIS FIRST WAITS: nothing is awaited between the call and the client's fetch, so a screen
 * that calls it as it is left (`pagehide`) has sent the mark in that turn. Keep it so: an `await` above `markRead`
 * loses the mark of a closing tab.
 */
export async function markAll(base: string, upTo: Cursor | null, io?: Fetch): Promise<boolean> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.markRead(upTo ?? undefined);
  /* ONLY THE SHELL, WHOSE FEED IT WAS, and asked again behind the kept one so the next screen does not wait on it. The
     mark moves no row and no declaration: dropping the schemas and kept reads with it (`forget`) had the next screen
     ask every list's schema and walk again on every leave of Today. */
  refreshShell(base);
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
 *
 * `everything` ASKS FOR THE RECORD'S OWN BOOKKEEPING TOO, which it leaves out of the log otherwise: the sweep writing
 * quiet runs off, and an agent's stamps of when it saw a tool. History's switch asks for it; nothing else does.
 */
export async function readLog(base: string, me: string | null, io?: Fetch, before: Cursor | null = null, everything = false): Promise<LogRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.recentHistory({ limit: LOG_PAGE, ...(before === null ? {} : { cursor: before }), ...(everything ? { everything: true } : {}) });
  if (!out.ok) return { from: 'refused', fix: refusalOf(out).fix };
  const names = new Map<string, string>();
  const events: AuditEvent[] = [];
  /* THE RECORD'S FOLDED UPDATE PASS (kind `update`, SHL-A21) IS NONE OF THE KERNEL'S KINDS, so it is drawn as the
     upgrade it is, with every line it wrote under it; any other kind this build does not know is left out as before. */
  const toLine = (e: EventLine): AuditEvent | null => {
    const kind = e.pass !== undefined ? 'upgrade' : e.kind;
    if (!isEventKind(kind)) return null;
    const target = targetOf(e);
    if (target !== undefined && e.title) names.set(target, e.title);
    /* NO ROWID IS NO VERSION. A member held to named lists is sent none, because the gap between two of her lines
       counted what she was not shown, and her newest line's rowid was what the footer called "version 4,192". 0 is what
       "names no event" already means (`markRead`'s `upTo: 0`), and `/audit` draws no version for it. */
    const at = e.rowid ?? 0;
    /* HOW THE LINE SETTLED A SUGGESTION, kept so Activity can say who suggested beside who settled (`settledOf`). */
    const settling = settlingOf(e);
    return {
      seq: at,
      at: e.ts,
      by: actorFor(e.actor, me),
      ...(e.run_by === undefined ? {} : { run_by: runByIn(e.run_by) }),
      kind,
      ...(target === undefined ? {} : { target }),
      note: moneyInText(e.note ?? (e.register !== null ? noteOf(e.register, e) : '')),
      version: at,
      ...(e.pass === undefined ? {} : { pass: e.pass, steps: (e.steps ?? []).flatMap((s) => toLine(s) ?? []) }),
      ...(settling === null ? {} : { settling }),
    };
  };
  for (const e of out.value.events) {
    const line = toLine(e);
    if (line) events.push(line);
  }
  return { from: 'live', events, names, more: out.value.cursor !== null, cursor: out.value.cursor };
}
