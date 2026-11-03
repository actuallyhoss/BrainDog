/**
 * The sample's answers to the app's calls, for the tests that drive the helpers over the seed.
 *
 * A TEST IMPORTS THIS AND NOTHING SHIPPED MAY. These are `boot`, `list`, `entry`, `search`, `page`, `values`, `job` and
 * `metric` as `api.ts` answered them out of `data.ts`. They were the mock the app was drawn against before a record could
 * answer, and they shipped for as long as they sat beside the helpers the live screens draw with.
 * Also here are the sample-bound helpers no screen called (`applyFilters`, `backlinks`,
 * `noticed`, `trackHealth`, `workingNow`, `trendOf`, `figureTile` and the like), because each reads the sample's rows or
 * its clock. `no-sample-render-helpers.test.ts` refuses any file outside a test that imports this directory.
 *
 * THE RECORD ANSWERS AND THIS FILE ONLY ASKS. `page`, `pages`, `readBlock`, `metric`, `values`, `list` and `applyFilters`
 * ask a real kernel over `node:sqlite`, seeded once by `installSeed` when this module loads, and a page or a figure comes
 * back drawn by the same `blockOf` and `tileOf` a live page draws with (`page-live.ts`). They answered out of a second
 * engine in this app once: a cash walk, a page expander, a figure reader and a row matcher that no screen
 * ran, and that every change to a figure or a sentence had to be made in twice.
 * Where a test was written against that engine and the kernel answers otherwise, the kernel is right.
 *
 * THE CLOCK IS THE SAMPLE'S `NOW` THROUGHOUT, and the kernel is opened at it, because the rows are the sample's: a due
 * date in them is only overdue on the day the seed was written for.
 */

import { DatabaseSync } from 'node:sqlite';

import { MISSING } from 'braindog-render';
import { RAIL_PAGES, fill, findingsFrom, openRecord, type Entry as Row, type Kernel, type MetricDecl as RecordMetric, type Part } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import {
  NO_ROW_SAID,
  PAGE,
  columnsFor,
  decl,
  display,
  healthOf,
  hueOf,
  iconFor,
  labelOf,
  runName,
  toRows,
  unsaidFigure,
  updatesIn,
  runsIn,
  workingAt,
  workingNowAt,
  type Backlink,
  type BlockResult,
  type Metric,
  type NavEntry,
  type SearchHit,
  type SearchResult,
  type TrackHealth,
} from '../api.ts';
/* THE SAMPLE'S READERS READ THE TABLES THE HELPERS READ, which `fill.ts` fills with the sample. They read the fixture's
   own until the sample left the app, when the fixture's tables and `held.ts`'s were one object for the declarations and two for the
   rows, so a test that grew a list for a reader and a helper had to know which of the two each one looked in. */
import './fill.ts';
import { REGISTERS, ROWS } from '../held.ts';
import { AUDIT, DECIDED, JOBS, NEWS, NOW, OBSERVED, PEOPLE_ACCESS, QUESTIONS, QUEUE, SERIES, SUSPENDED, VIEWS } from './sample.ts';
import { copy } from '../../copy.ts';
import { answers, terms, tokensOf, why } from '../find.ts';
import { METRICS } from '../declared.ts';
import { fxNote, markOf, meetsTarget, offTarget, targetLine, targetSaid, windowMs, type MetricDecl, type Reading } from '../metrics.ts';
import { blockOf, tileOf as pageTile } from '../page-live.ts';
import { entryOf, refMapOf, sentenceOf, type RefMap } from '../remote.ts';
import { learnRowPages } from '../row-href.ts';
import type { Entry, Filter, Job, PageBlock, PageDecl } from '../schema.ts';

/* A SENTENCE ONLY THIS FILE SAYS, so it is kept here and not in `copy.ts`, where a sentence no screen draws is a dead
   one: a movement that rounds to no per cent. "up 0%" gives a reader a way and a distance of nothing. */
const ABOUT_THE_SAME = 'about the same';

/* ── the record every reader below asks ──────────────────────────────── */

type Sql = Parameters<typeof openRecord>[0];

/** A record in memory over `node:sqlite`, bound the way the kernel's own tests bind one. */
function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Sql;
}

/** How long before `NOW` a run's edit still counts as the row it is on now: the hour the sample's `WRITTEN` opens with. */
const ON_IT_MS = 3_600_000;

/**
 * The seeded record, opened at the sample's clock when this module loads.
 *
 * NOTHING HERE WRITES TO IT AFTER IT LOADS, so what it answered once is what it answers every time, and each answer below
 * is asked for once and kept. A test that needs a record it can write to opens its own.
 *
 * TWO THINGS THE SEED DOES NOT WRITE ARE WRITTEN HERE, from the sample that says them. `installSeed` fills the lists and
 * signs every row `p_seed`, so the record held no daily points (a stat's `trend:` drew nothing, where the sample walks
 * `SERIES`) and no run had touched a row (`working: true` lit nothing, where the sample's ledger has Claude's live run on
 * the task it is doing). So each series goes in as the points a nightly would have written, and each edit the ledger has
 * an agent make in the last hour goes in signed by that agent's live run, at the minute the ledger gives it, because the
 * kernel marks a row by the run that signed it (`pages.ts` `workingOf`) and not by the agent's name.
 */
const RECORD: Kernel = await (async () => {
  let clock = NOW;
  const k = await openRecord(openSqlite(), { now: () => clock });
  const seeded = await installSeed(k);
  if (!seeded.ok) throw new Error(`the seed did not install on the fixture's record: ${JSON.stringify(seeded)}`);

  for (const [series, points] of Object.entries(SERIES)) {
    /* The seed writes the cash points itself now, with their currency. */
    if (series === 'cash-now') continue;
    const format = METRICS[series]?.format;
    const unit = format?.startsWith('money.') ? format.slice('money.'.length) : '';
    const wrote = k.writePoints('sample', points.map((p) => ({ series, grain: 'day', at: p.at, value: p.value, unit, n: null })));
    if (!wrote.ok) throw new Error(`the sample's ${series} points did not go in: ${JSON.stringify(wrote)}`);
  }

  const runs = k.list({ register: 'session', where: 'state is active', limit: 50 });
  if (!runs.ok) throw new Error(`the fixture's record did not list its runs: ${JSON.stringify(runs)}`);
  const runOf = new Map(runs.value.rows.map((run) => [String(run.fields.agent), `S${String(run.seq)}`]));
  for (const e of [...AUDIT].reverse()) {
    const signed = runOf.get(e.by);
    const at = Date.parse(e.at);
    const [register = '', seq = ''] = (e.target ?? '').split('#');
    if (e.kind !== 'edit' || signed === undefined || NOW - at > ON_IT_MS || !Object.hasOwn(REGISTERS, register) || seq === '') continue;
    clock = at;
    const wrote = k.update(register, `${register}#${seq}`, {}, { actor: signed, note: e.note });
    clock = NOW;
    if (!wrote.ok) throw new Error(`${signed}'s edit to ${e.target ?? ''} did not go in: ${JSON.stringify(wrote)}`);
  }
  return k;
})();

/** THE MOST ROWS ONE `list` CALL ANSWERS, which is the kernel's own ceiling, and the most calls one walk of a list makes. */
const PER_CALL = 500;
const CALLS = 20;

/**
 * Every row the record answers for one question about one list, following its cursor to the end; `null` when it refuses
 * the question. A list longer than `CALLS` pages throws rather than coming back cut short.
 */
function walk(q: { register: string; where?: string; order?: { field: string; dir: 'asc' | 'desc' }[] }): Row[] | null {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (let n = 0; n < CALLS; n++) {
    const out = RECORD.list({ ...q, limit: PER_CALL, ...(cursor === null ? {} : { cursor }) });
    if (!out.ok) return null;
    rows.push(...out.value.rows);
    cursor = out.value.cursor;
    if (cursor === null) return rows;
  }
  throw new Error(`${q.register} holds more rows than ${CALLS} calls of ${PER_CALL} reach`);
}

/** Each list's rows as the record holds them, in the order they were written. */
const WALKED = new Map<string, Row[]>();
function rowsOf(register: string): Row[] {
  const kept = WALKED.get(register);
  if (kept) return kept;
  const rows = walk({ register, order: [{ field: 'seq', dir: 'asc' }] }) ?? [];
  WALKED.set(register, rows);
  return rows;
}

/**
 * The number and the name of every row of every list the sample declares, for turning the record's refs into the numbers
 * a person says, as a live reader's `RefMap`s do. `refMapOf` also keeps each list's names in `held.ts`'s `TITLES`.
 */
let REFS: ReadonlyMap<string, RefMap> | null = null;
function refs(): ReadonlyMap<string, RefMap> {
  REFS ??= new Map(Object.keys(REGISTERS).map((register) => [register, refMapOf(register, rowsOf(register))]));
  return REFS;
}

/** One of the record's rows as the helpers read a row: each ref as the number of the row it points at. */
const entryFrom = (register: string, row: Row): Entry => entryOf(register, row, refs());

/** One figure's reading as the record answers it, by the figure's id and its parameter, kept once asked. */
const READINGS = new Map<string, ReturnType<Kernel['metric']> | null>();
function readingOf(id: string): ReturnType<Kernel['metric']> | null {
  if (READINGS.has(id)) return READINGS.get(id) ?? null;
  const at = id.indexOf(':');
  const template = RECORD.metricDecl(at === -1 ? id : id.slice(0, at));
  /* A PARAMETER IS FILLED BY THE KERNEL'S OWN `fill`, which writes `within` as the record does. */
  const said = template === null ? null : RECORD.metric(at === -1 ? template : (fill(template, null, id.slice(at + 1)) as RecordMetric));
  READINGS.set(id, said);
  return said;
}

/**
 * What a cash walk starts from, as the record reads it: a typed number, or a declared figure's reading.
 *
 * `{ metric }` keeps the walk and the Cash now tile on one declaration. A figure that cannot be read
 * leaves the walk with no opening and says why, rather than walking from zero.
 */
export function openingOf(
  opening: PageBlock['opening'],
): { value: number | null; unit: string | null; refusal?: string; parts?: Part[]; missing?: string[]; converted?: boolean } {
  if (typeof opening === 'number') return { value: opening, unit: null };
  if (!opening || typeof opening !== 'object' || typeof opening.metric !== 'string') return { value: null, unit: null };
  const read = readingOf(opening.metric);
  if (read === null) return { value: null, unit: null, refusal: `There is no metric called ${opening.metric} for the walk to start from.` };
  if (!read.ok) return { value: null, unit: null, refusal: 'refusal' in read ? read.refusal.fix : `${opening.metric} could not be read.` };
  const first = read.value.refusals[0];
  if (first) return { value: null, unit: null, refusal: first.fix };
  /* A BALANCE IN SEVERAL CURRENCIES WITH NO RATE BETWEEN THEM IS NOT ONE AMOUNT TO START FROM: its parts are, one walk a
     currency, as the record says. */
  if (read.value.parts) return { value: null, unit: null, parts: read.value.parts, missing: read.value.fx?.missing ?? [] };
  return { value: read.value.value ?? 0, unit: read.value.unit ?? currencyOfFormat(METRICS[opening.metric]?.format), converted: Boolean(read.value.fx?.asOf) };
}

/** `money.GBP` is sterling; any other format is not a currency. */
const currencyOfFormat = (format: string | undefined): string | null => (format?.startsWith('money.') ? format.slice('money.'.length) : null);

/* ── what the record noticed, on the screen it is about ──────────── */

/**
 * What this record has noticed about one register, if anything has crossed.
 *
 * THE MOST SOPHISTICATED MECHANISM IN THE PRODUCT WAS INVISIBLE. Nine signals, four detectors whose
 * counts come from the rule of three, a dispersion requirement on each because a burst is not a
 * pattern, a weekly analyser with four governors and a self-suspending brake — and the interface
 * never emitted a signal, never read a finding and never showed one. The person it exists for could
 * not tell it was there.
 *
 * IT GOES WHERE IT IS ABOUT. `write.refused` carries `<register>.<field>:<code>`, which is a PLACE:
 * the grid where somebody keeps being refused. A findings screen somewhere else would be a second
 * inbox; a line above the rows they are already failing at is the record saying "this keeps
 * happening" at the moment they are doing it.
 *
 * THE THRESHOLDS ARE THE KERNEL'S, applied by `findingsFrom`. A screen with its own copy of them is
 * a screen that says a pattern has been reached while the analyser proposes nothing.
 */
export type Noticed = {
  /** The field it keeps happening on, as a place on this screen. */
  field: { id: string; label: string } | null;
  /** The refusal code, kept whole — it is what an operator greps for. */
  code: string;
  n: number;
  days: number;
  window: string;
  /** The kernel's own sentence, verbatim, for the title and for anyone reading the analysis. */
  why: string;
  /** What to do about it, in one clause. */
  fix: string;
};

/**
 * What one refusal code means for whoever keeps hitting it.
 *
 * THE CODE IS FOR THE OPERATOR AND THE CLAUSE IS FOR THE PERSON. `ENUM_VALUE_UNKNOWN` names the
 * mechanism exactly and tells a bookkeeper nothing; showing only the friendly sentence would leave
 * the person supporting them nothing to search. Both, so neither reader is the one it was not
 * written for.
 *
 * AN UNKNOWN CODE IS NOT A BLANK. A refusal this table has not met yet still crossed a threshold
 * twelve times, and the honest line says so rather than drawing an empty strip.
 */
const FIXES: Readonly<Record<string, string>> = {
  ENUM_VALUE_UNKNOWN: 'the value being saved is not one this field allows. Either widen the field or fix what writes it',
  REQUIRED_MISSING: 'something keeps arriving without it. Either it is not really required, or whatever sends these rows never had it',
  TYPE_MISMATCH: 'what arrives is not the shape this field allows',
  REF_NOT_FOUND: 'what it points at is not here yet',
  OUT_OF_BOUNDS: 'the value is outside the range this field allows',
  IMMUTABLE: 'this field is settled once written, and something keeps trying to change it',
};

/**
 * What this record has noticed about one register, if anything has crossed.
 *
 * THE MOST SOPHISTICATED MECHANISM IN THE PRODUCT WAS INVISIBLE. Nine signals, four detectors whose
 * counts come from the rule of three, a dispersion requirement on each because a burst is not a
 * pattern, a weekly analyser with four governors and a self-suspending brake — and the interface
 * never emitted a signal, never read a finding and never showed one. The person it exists for could
 * not tell it was there.
 *
 * IT GOES WHERE IT IS ABOUT. `write.refused` carries `<register>.<field>:<code>`, which is a PLACE:
 * the grid where somebody keeps being refused. A findings screen somewhere else would be a second
 * inbox nobody opens; a line above the rows they are already failing at is the record saying "this
 * keeps happening" at the moment they are doing it.
 *
 * THE THRESHOLDS ARE THE KERNEL'S, applied by `findingsFrom` and never re-stated here. A screen
 * with its own copy of them is a screen that announces a pattern while the analyser proposes
 * nothing, which reads as the product being wrong about itself.
 *
 * ONE, NOT ALL OF THEM. `findingsFrom` sorts by how far past its own threshold each finding is, so
 * the first is the worst; a strip listing four is a second inbox again.
 *
 * AND NOTHING AT ALL WHILE THE ANALYSER IS SUSPENDED. A crossed threshold is not the whole test:
 * `analyse()` has four governors and a brake in front of it, and on a record under a fortnight old,
 * or one with three questions already open, or one whose proposals keep coming back wrong, the
 * threshold is crossed and no proposal is ever coming. Drawing the strip there is the exact failure
 * this function was written to avoid — a screen announcing a pattern while the analyser proposes
 * nothing — with the governors rather than the thresholds as the thing it forgot to ask.
 *
 * IT IS A PARAMETER because the live app will hand it `analyse().suspended` from the record itself.
 * The default is the fixture, so the mock reads the same way the product will.
 */
export function noticed(register: string, suspended: string | null = SUSPENDED): Noticed | null {
  if (suspended !== null) return null;
  const prefix = `${register}.`;
  const first = findingsFrom(OBSERVED).find((f) => f.signal === 'write.refused' && f.subject.startsWith(prefix));
  if (!first) return null;

  const [id = '', code = ''] = first.subject.slice(prefix.length).split(':');
  const field = decl(register, id);
  return {
    field: field ? { id, label: labelOf(field) } : null,
    code,
    n: first.n,
    days: first.days,
    window: first.window,
    why: first.why,
    fix: FIXES[code] ?? 'the record has been refusing these and nobody has looked at why',
  };
}

/**
 * The rows of `entries` a list's chips admit, as the record answers the sentence the chips write.
 *
 * THE RECORD MATCHES AND THIS KEEPS WHAT IT NAMED. `sentenceOf` writes the chips as the sentence a live list sends, the
 * record lists the rows it admits, and a row is kept here when the record named its number. A sentence the record
 * refuses admits no row, which is what an unreadable filter has always matched.
 */
export function applyFilters(register: string, entries: Entry[], filters: Filter[], q?: string, join?: 'any'): Entry[] {
  let out = entries;
  if (filters.length) {
    const where = sentenceOf(register, filters, refs(), join);
    const admitted = new Set((walk({ register, ...(where === undefined ? {} : { where }) }) ?? []).map((row) => row.seq));
    out = entries.filter((e) => admitted.has(e.seq));
  }

  /**
   * THE TEXT BOX IS ONE OPERATOR, AND IT IS NOT A SCAN OVER EVERY COLUMN.
   *
   * `50 §5.2` step 6: *"text → the search box as `matches`"*. `29 §5` says what that is — *"`matches:`,
   * FTS5 over the register's `search:` fields"* — and `34 §6` gives the semantics: whole-token,
   * case-folded, over the register's searchable fields.
   *
   * This filtered on `display()` over EVERY field, which is the shape `fts.ts` opens by ruling out,
   * and it is why the door on `/search` landed somewhere else: the page counted title matches and
   * linked to a list matching everything. Both sides read the declaration now; `find.ts` is the one
   * matcher, and `find.test.ts`'s *"EVERY GROUP'S COUNT IS THE NUMBER OF ROWS ITS OWN DOOR LANDS
   * ON"* asserts the two answers are the same set. (This named `search.test.ts`, which asserts no
   * such thing — a miscitation inside the comment written to fix a miscitation.)
   */
  if (q) out = out.filter((e) => answers(register, e, q));
  return out;
}

export function trackHealth(seq: number): TrackHealth {
  return healthOf(
    ROWS.tracks?.find((t) => t.seq === seq),
    ROWS.updates ?? [],
    seq,
    NOW,
  );
}

/** The same thread, read against the sample. */
export const updatesFor = (seq: number): Entry[] => updatesIn(ROWS.updates ?? [], seq);

/** The same runs, read against the sample. */
export const runsOn = (project: string): Entry[] => runsIn(ROWS.session ?? [], project);

/** The same question, asked against the sample's frozen clock. */
export const working = (run: Entry): boolean => workingAt(run, NOW);

/** The job a run is doing, found by the run the job names, or `null`. */
export const jobOf = (run: Entry): Job | null => Object.values(JOBS).find((j) => j.run === runName(run)) ?? null;

/**
 * Every row in the record that points at this one, grouped by the relation that points.
 *
 * GROUPED BY FIELD AND NOT BY REGISTER, because two fields of one register can point at the same
 * place and mean different things: an update's `track` is what it is about and its `supersedes` is
 * what it replaces. Collapsing them into "Updates (7)" would be a number nobody could act on.
 *
 * A register is skipped when it points at itself through the row itself — a row is not its own
 * backlink — and the scan is over `ROWS`, which is already in memory.
 */
export function backlinks(register: string, seq: number, show = 5): Backlink[] {
  const out: Backlink[] = [];

  for (const [id, r] of Object.entries(REGISTERS))
    for (const f of r.fields) {
      if (f.type !== 'ref' || f.to !== register) continue;
      const hits = (ROWS[id] ?? []).filter((e) => Number(e.fields[f.id]) === seq && !(id === register && e.seq === seq));
      if (hits.length === 0) continue;

      /* The pointing field is dropped from the columns: every row in this list has the same value
         for it, which is the row you are already looking at. */
      const columns = columnsFor(id).filter((c) => c.field !== f.id).slice(0, 3);
      out.push({
        register: id,
        name: r.name,
        label: labelOf(f),
        icon: iconFor(r.icon, 'rows'),
        total: hits.length,
        rows: toRows(id, hits.slice(0, show), columns, NOW),
        columns,
        href: `/r/${id}?f=${f.id}:is:${seq}`,
      });
    }

  /* Most first: on a person, "Obligations 12" is the reason you opened the page and "Tasks 1" is
     not, and a list in declaration order buries the first behind the second. */
  return out.sort((a, b) => b.total - a.total);
}

/**
 * A figure, read by the record from its DECLARATION and drawn as the tile a live page draws.
 *
 * `project-owed:Kiln` is the document and the thing it is about: the parameter is everything after the FIRST colon,
 * because a project can be called anything and a name with a colon in it is a name, not two ids. The kernel's `fill`
 * puts the name in, as the record does for a page's cell.
 *
 * NO RUNWAY. This drew a cash walk as a tile out of the browser's own walk, which is gone; the record's walk is a
 * forecast block on a page, and `readBlock` answers one.
 */
export function metric(id: string): Metric {
  if (id === 'open-questions') {
    /* AND THIS ONE RETURNS BEFORE THE EMPTY GUARD BELOW, so it kept the tick a record with nothing
       in it has not earned: `Open questions · 0 · no more than 3 · ✓`. It is the same defect the
       guard was written for, on `/decide` — which `19 §2` names as one of the three spine screens,
       and which the commit that added the guard edited in the same breath. A figure over an empty
       list is not good news; it is not news. */
    const none = QUEUE.length === 0 && DECIDED.length === 0;
    return {
      id,
      label: 'Open questions',
      value: String(QUEUE.length),
      /* A LITERAL THAT `targetLine` WOULD HAVE WRITTEN. Every other target on every other tile went
         from `target ≤ X` to a sentence; this one is typed out here, so it stayed — on `/decide`,
         which `19 §2` names as one of the three spine screens. */
      note: none
        ? copy.nothingIn('Decisions')
        : targetLine({ format: 'int', target: { lte: 3 } } as Parameters<typeof targetLine>[0], QUEUE.length),
      ...(none ? {} : { tone: QUEUE.length > 3 ? ('warn' as const) : ('good' as const) }),
      href: '/decide',
    };
  }

  const read = readingOf(id);
  if (read === null)
    return { id, label: id, value: MISSING, note: 'no metric is declared under that name', tone: 'warn', href: '/p/money' };
  return pageTile({ metric: id, reading: read.ok ? read.value : null, ...(!read.ok && 'refusal' in read ? { refusal: read.refusal } : {}) } as never);
}

/**
 * ONE READING OF ONE DECLARATION, AS A TILE, in the words the sample's tiles were drawn in.
 *
 * IT TAKES A READING A TEST WROTE, which is what it is kept for: the parity drive in `news-live.test.ts` holds it
 * beside `news-live.ts`'s `tileOf` and `page-live.ts`'s over one reading, `rows: 0` over `held: 27`, a shape no seeded
 * row can produce. `metric` above draws the record's reading through `page-live.ts` and does not come here.
 */
export function figureTile(id: string, decl: MetricDecl, reading: Reading): Metric {
  /**
   * A FIGURE THAT CANNOT BE WORKED OUT SAYS SO, IN THE TERMS OF THIS SCREEN.
   *
   * `reading.refusals` are written for whoever wrote the DECLARATION: "group_by: is published in 08
   * and not read by this build", "target takes a number in the figure's own units — { lte: 400000 }
   * for money in minor units, not { lte: { amount, currency } }". Those are the right sentences and
   * they were printed under a headline figure on the Home screen — `08` is a document number, `this
   * build` is the software talking about itself, and there is no control anywhere in this app that
   * edits a metric.
   *
   * THE AUTHOR'S SENTENCE IS NOT LOST. It is what `/p/*`'s degraded block prints, beside the
   * declaration, where there is somebody who can act on it. Here the note says the fact and points
   * at the pack that owns the figure, which is the one move available to the person reading it.
   */
  if (reading.refusals.length)
    return {
      id,
      label: decl.name,
      value: MISSING,
      note: copy.figureUnavailable,
      tone: 'warn',
      /* THE PACK IS WHERE A FIGURE IS DECLARED, and it is the only screen in this product that has
         anything to say about one. A tile that cannot be worked out linking to the money page —
         which is where it is already — was a link back to itself. */
      href: '/settings/plugins',
    };

  /**
   * A FIGURE OVER AN EMPTY LIST IS NOT GOOD NEWS. IT IS NOT NEWS.
   *
   * `meetsTarget` is `value <= target.lte`, and `0 <= 2000000` is true — so on a record with nothing
   * in it, `OWED TO YOU · GBP 0.00`, `DUE IN 30 DAYS · GBP 0.00` and `OVERDUE TO PAY · GBP 0.00`
   * each carried a tick labelled *good*. Four green ticks on the screen somebody sees the hour they
   * install the product, telling them their finances are healthy on the strength of no data at all.
   *
   * `19 §6` names five empty states and says collapsing them is the failure; this is the collapse
   * nothing had caught, because earlier usability checks could not reach an empty
   * record in a browser. `no-data-yet` was reading as `cleared`.
   *
   * THE TONE GOES AND THE SENTENCE ARRIVES. A tile with no tone is a fact without a verdict, which
   * is exactly right here — and the note says which list is empty, so it points at the thing to do
   * rather than only declining to judge. The comparison line is dropped with it: "nothing to compare
   * with yet" under "nothing in Obligations yet" is the same sentence twice.
   */
  const empty = reading.held === 0;

  /* AND THE STATE BETWEEN THAT ZERO AND AN ANSWER, which `unsaidFigure` above is and says why: a
     reducing figure whose predicate requires the field it reduces over, matching no row of the rows
     the list holds. The figure itself stays, because a total of nothing is zero; it is the verdict on
     it and the door beside it that were invented. */
  const unsaid = unsaidFigure(decl, reading);

  /* A FIGURE CONVERTED OUT OF ITS DECLARED CURRENCY IS JUDGED AGAINST ITS TARGET CONVERTED, and has no verdict without a rate. */
  const off = offTarget(decl, reading.unit);
  const met = empty || unsaid ? null : markOf(decl, off ? (reading.targetIn ? meetsTarget({ ...decl, target: reading.targetIn.target }, reading.value, reading) : null) : meetsTarget(decl, reading.value, reading));
  /* The delta reads as a MOVEMENT and not as a sign: "up 18% on the 30d before" is a sentence, and
     `+18%` beside a target is two numbers a reader has to tell apart. */
  /* AND AN ABSENT COMPARISON SAYS SO. `19 §6`: a surface showing nothing must never be
     indistinguishable from a surface with nothing to show — and three of the four tiles on the money
     page carried no movement and no explanation, which reads as "this has not moved" when every one
     of them declares a window. */
  /* AND A MOVEMENT OF NOTHING IS NOT A MOVEMENT. `Math.abs(delta * 100).toFixed(0)` rounds every
     shift under half a per cent to `0`, so the sentence read "up 0% on the 30 days before" — a
     direction, a magnitude of nothing, and a reader left to work out which half to believe. */
  const pct = reading.delta === null ? 0 : Math.round(Math.abs(reading.delta * 100));
  const move =
    reading.delta === null
      ? reading.unmeasured
        ? ` · ${reading.unmeasured}`
        : ''
      : pct === 0
        ? ` · ${ABOUT_THE_SAME} ${reading.why}`
        : ` · ${reading.delta >= 0 ? 'up' : 'down'} ${pct}% ${reading.why}`;

  /* MONEY IN SEVERAL CURRENCIES SAYS WHY IT IS IN PARTS, and a converted figure as of which day's rates. */
  const across = fxNote(reading);
  return {
    id,
    label: decl.name,
    value: reading.shown,
    note: empty
      ? copy.nothingIn(REGISTERS[decl.source.replace(/^register\./, '')]?.name ?? decl.name)
      : /* AND THE TARGET LINE GOES WITH THE TICK. "never below zero" under a figure no row contributed
           to is a bound every such figure satisfies, printed as though it had been checked. */
        unsaid
        ? [NO_ROW_SAID, across].filter(Boolean).join(' · ')
        : reading.parts
          ? (across ?? '')
          : `${targetSaid(decl, reading)}${move}${across ? ` · ${across}` : ''}`.replace(/^ · /u, ''),
    tone: met === null ? undefined : met ? 'good' : 'warn',
    /**
     * AND A FIGURE OVER AN EMPTY REGISTER IS NOT A DOOR EITHER.
     *
     * The paragraph above takes the tick off a tile computed from no data, and left the tile a
     * link: pressing `OWED TO YOU · GBP 0.00 · nothing in Obligations yet` opened a filtered list
     * of a register with nothing in it, so somebody reading the sentence that says there is nothing
     * there was invited to go and look at it.
     *
     * `held === 0` AND NOT `value === 0`, and the difference is the whole of it. `Overdue · GBP
     * 0.00` over thirty-eight invoices is an answer, and its door opens the filter that produced it,
     * which is worth having. A register with nothing in it has no such filter to show.
     *
     * AND NEITHER IS A FIGURE NO ROW HAS SAID ANYTHING TO. That door is the predicate as a filter, and
     * the predicate matched nothing, so it opened a list of no rows from under a sentence saying there
     * was nothing to see.
     */
    ...(empty || unsaid ? {} : { href: reading.href }),
  };
}

/** The values a page's `{{path}}` interpolations resolve to, pre-resolved server-side (22 §5). */
export function values(): Record<string, string> {
  /**
   * TWO PATHS, EACH NAMED FOR THE DIRECTION IT MEANS.
   *
   * There was one, called `oldest_overdue`, and it changed direction under a comment explaining why:
   * first it took the minimum over BOTH directions, so a sentence about a receivable printed the age
   * of a bill you owe; then it was narrowed to `owed_to_me`, and the note that consumes it is gated
   * on the `overdue` metric — which is `owed BY me`. So the alarm fired on payables and printed the
   * age of a receivable: 5w on screen for a record whose oldest overdue payable is nine weeks old.
   *
   * The old comment got the rule right and the caller wrong: *a path is named after what it means or
   * it means whatever the first caller assumed*. So neither of these is called `oldest_overdue`, and
   * a sentence has to say which one it wants.
   *
   * THE RECORD ANSWERS WHICH IS OLDEST: the obligations still open, one way, due before today, earliest first.
   */
  const oldestIn = (direction: 'owed by me' | 'owed to me'): string => {
    const out = RECORD.list({ register: 'obligations', where: `state is open or part, direction is ${direction}, due before today`, order: [{ field: 'due', dir: 'asc' }], limit: 1 });
    const due = out.ok ? out.value.rows[0]?.fields.due : undefined;
    return typeof due === 'string' ? due : '';
  };

  return {
    /** Money you owe, past its date: the set the `overdue` metric counts. */
    'obligations.oldest_unpaid': oldestIn('owed by me'),
    /** Money owed to you, past its date. Statutory interest you could charge. */
    'obligations.oldest_unrecovered': oldestIn('owed to me'),
    'obligations.count': String(rowsOf('obligations').length),
    'services.count': String(rowsOf('services').length),
    ...Object.fromEntries(
      /* EVERY FIGURE THE RECORD DECLARES, not a list of the ones some page happened to name, so a note any pack writes resolves. A
         figure with a parameter is left out, because it is only a figure once a page fills it. */
      Object.keys(METRICS).filter((id) => !JSON.stringify(METRICS[id]).includes('{{')).map((id) => [id, metric(id).value]),
    ),
  };
}

/**
 * Every page there is, which is not the same as every page DECLARED, as the record lists them.
 *
 * A declaration carrying `for:` is a template and the record makes one page of it per row it admits. Each is kept here
 * as its declaration filled with its row by the kernel's own `fill`, with `param` and `identity` naming the row, which
 * is what a live project page carries (`page-live.ts`). The record is not written to, so the list is read once.
 */
let PAGES_SAID: Record<string, PageDecl> | null = null;
export const pages = (): Record<string, PageDecl> => {
  if (PAGES_SAID) return PAGES_SAID;
  const declared = RECORD.declarations()
    .filter((d) => d.kind === 'page')
    .map((d) => JSON.parse(d.body) as PageDecl);
  const out: Record<string, PageDecl> = {};
  for (const listed of RECORD.pages()) {
    const about = listed.about;
    if (about === null || about.seq === null) {
      const written = declared.find((d) => d.page === listed.slug);
      if (written) out[listed.slug] = written;
      continue;
    }
    /* READ OFF `about` AND NOT DESTRUCTURED, because the guard above narrows `about.seq` to a number and a destructured
       `seq` would keep the declared `number | null` that `param` and `identity` do not take. */
    const register = about.register;
    const seq = about.seq;
    const row = rowsOf(register).find((r) => r.seq === seq);
    if (!row) continue;
    /* ONE LIST MAY CARRY TWO TEMPLATES, so the one whose filled title is the title the record listed is the one this page is. */
    const filled = declared.filter((d) => d.for?.register === register).map((d) => fill(d, row) as PageDecl);
    const decl = filled.find((d) => d.title === listed.title) ?? filled[0];
    if (!decl) continue;
    const titled = REGISTERS[register]?.title;
    const title = titled === undefined ? '' : String(row.fields[titled] ?? '');
    out[listed.slug] = { ...decl, page: listed.slug, param: { register, seq, title }, identity: { register, seq } };
  }
  PAGES_SAID = out;
  return out;
};

export function boot() {
  /* ONE LIST OF PAGES, READ TWICE: the rail below and the pen at the bottom of this function, which the two lists a
     `boot` hands the shell should not be able to disagree about. */
  const resolved = Object.values(pages());
  /* THE ROWS A TEMPLATE MADE A PAGE FOR, as the live boot learns them, so the sample opens a project's own page too. */
  learnRowPages(RECORD.pages());

  /**
   * ONE PAGE PER ROW IS A PAGE RULE AND IT WAS ALSO THE RAIL'S, which nothing had ever counted.
   *
   * A declaration carrying `for:` becomes one page per row it admits, and every one of them
   * carrying `nav` went into the rail. Measured on a record at his scale, 27 projects with 26 of
   * them building or earning, 401 tasks and 91 credentials: 36 rail entries, 27 of them under
   * Projects, against 13 entries on the sample. That is the argument written below for the open
   * tracks, arriving at the other thing in this function that grows one entry per row, so it gets
   * the same answer and the same number: a rail that grows without bound is a rail that stops
   * being a rail.
   *
   * COUNTED PER REGISTER THE ROWS COME FROM AND PER HEADING THEY LAND UNDER, so a page somebody
   * wrote is never pushed out of the rail by rows landing in a list. The five kept are the first
   * five pages the record lists for the template, and the cap is the record's own `RAIL_PAGES`.
   *
   * THE HEADING IS IN THE KEY BECAUSE ONE REGISTER CAN CARRY TWO TEMPLATES, which is what a pack
   * installing a second view of a list somebody already keeps produces. Counted per register
   * alone, the first template spent the whole budget and the second drew NOTHING: measured with a
   * `Clients` template over `things` beside the shipped `Projects` one at 26 projects, Projects
   * drew 6 and Clients drew 0, so a heading a declaration asked for was gone rather than short.
   * Per heading, rows still cannot grow either one past five, which is what the cap is for; what
   * adds a heading is somebody writing a declaration, not the record filling up.
   *
   * NOTHING IS HIDDEN BY THIS, which is the test the tracks cap passes too. `/p/<its own name>`
   * still resolves, the Projects list in the rail carries the whole count beside its name, its row
   * still answers the palette, and `/p/portfolio` is a page whose entire job is listing them with
   * what each one needs. What goes is the standing offer to read 26 links every morning to find one.
   *
   * THE PALETTE IS THE ONE PLACE THAT DID NOT SURVIVE THIS UNTOUCHED, and it is not this file.
   * `Palette.svelte` lists pages out of the rail rather than out of `pages()`, `/` never calls
   * `search()` at all, and an unprefixed query throws away every page-kind hit as a duplicate of a
   * rail row. Measured at 26 projects: typing `project 26` offers `/r/things/26` and no longer
   * offers `/p/project-26`. Harmless at the size the sample is, because nothing here is capped
   * until a register carries more than five rows a template admits, and it is the first thing to
   * put right in that file before this rule reaches the rail a live record draws.
   */
  const drawn = new Map<string, number>();
  const nav: NavEntry[] = [];
  for (const p of resolved) {
    if (!p.nav || p.placed === false) continue;
    /* `identity` is set by `pages` on the pages a template produced and on no others, so
       this counts pages about a row and leaves every declared page alone. The key is a JSON pair
       rather than two strings joined, because a section is 40 bytes of somebody's own words and
       any separator picked here is one they are allowed to type. */
    const about = p.identity ? JSON.stringify([p.identity.register, p.nav.section]) : undefined;
    if (about) {
      const n = (drawn.get(about) ?? 0) + 1;
      drawn.set(about, n);
      if (n > RAIL_PAGES) continue;
    }
    nav.push({
      id: p.page,
      title: p.title,
      href: `/p/${p.page}`,
      section: p.nav.section,
      order: p.nav.order,
      icon: iconFor(p.icon, 'doc'),
      hue: hueOf(p.identity),
    });
  }

  /* OPEN TRACKS IN THE RAIL, under their own heading. A track is a thing you are in the middle of,
     so the whole point is getting back into it — and a thread you have to go and find through a
     list is a thread you stop keeping. Only the open ones, and capped: a rail that grows without
     bound is a rail that stops being a rail. Holding and finished tracks live in the list. */
  const RAIL_TRACKS = 5;
  for (const [n, t] of (ROWS.tracks ?? [])
    .filter((t) => t.fields.state === 'open')
    .slice(0, RAIL_TRACKS)
    .entries())
    nav.push({
      id: `track-${t.seq}`,
      title: String(t.fields.name),
      /* ON ITS ROW, where a live record opens a thread: the thread's own screen (`/t/<n>`) is gone. The list's id is the
         declaration's, which the sample always holds here. */
      href: `/r/${String(REGISTERS.tracks?.id)}/${t.seq}`,
      /* THE REGISTER'S OWN NAME, NOT A SECOND SPELLING OF IT. This was the literal `Tracks`, so
         renaming the register to Threads renamed the list, the page heading, the palette and the
         rail's own Lists section, and left the rail section above these rows saying the old word.
         One string, read from the declaration, cannot drift from it. */
      section: REGISTERS.tracks?.name ?? 'Threads',
      order: 10 + n,
      icon: 'rows',
    });

  return {
    index: {
      slug: 'the-studio',
      name: 'The Studio',
      locale: 'en',
      /**
       * THE LISTS THAT HOLD SOMETHING, AND IT USED TO BE EVERY LIST DECLARED.
       *
       * One question to ask of the product is whether it grows as the record grows, and the
       * rail was the clearest no: eight list links, each with its own tally, drawn identically
       * over a record of eight rows and a record of four hundred. Seven of the eight read `0`, and a
       * link to a list with nothing in it is a thing a person has to read, decide is irrelevant, and
       * put down, every time they look at the rail. Counting every declared register is the count that
       * made a busy list unreachable, so only the lists that hold something are drawn.
       *
       * HERE AND NOT IN THE RAIL, because the rail is not the only reader. The phone's sidebar
       * draws this same list, and the last time a rail rule lived in one of the two surfaces rather
       * than in the list they share, the phone and the desktop showed different navigation and the
       * bundle baseline had to be re-recorded to put it right. One list, one rule.
       *
       * A LIST IS NOT HIDDEN BY THIS. It is one keystroke away in the palette, which reaches objects
       * rather than screens, and it arrives in the rail the moment it holds a row. What goes is the
       * standing offer to look at nothing.
       */
      registers: Object.values(REGISTERS)
        .filter((r) => (ROWS[r.id] ?? []).length > 0)
        .map((r) => ({
          id: r.id,
          name: r.name,
          count: (ROWS[r.id] ?? []).length,
          icon: iconFor(r.icon, 'rows'),
          /**
           * THE SAVED VIEWS OF THIS LIST, which appeared in no navigation at all.
           *
           * Two views existed in the record and the rail held zero `/v/` links, while the keyboard
           * sheet documented `⌥V` as "Save the filter as a view" — so the product taught somebody to
           * make a thing and then never showed it to them again. The palette found them, and the
           * palette is labelled "Search".
           *
           * UNDER THE LIST THEY FILTER, because that is what one IS: the same rows with a predicate.
           * A section of its own would be a second place to look for a list.
           */
          views: Object.entries(VIEWS)
            .filter(([, v]) => v.register === r.id)
            .map(([key, v]) => ({ key, name: v.name, href: `/v/${key}` })),
        })),
    },
    nav,
    /** Pages that emerged and were never placed. A holding pen, not a decision (19 §3).
        `Shell.pen` is now `PenItem[]` (`lib/design/pen.ts`), and this sample fixture never emits a change
        offer, so it holds none rather than the old `PageDecl[]` shape. */
    pen: [],
    me: {
      person: 'you',
      level: 'owner' as const,
      owner: true,
      /* Two, because a switcher over a list of one is a control that can only ever confirm what you
         already know. The second is somebody else's record you have read access to, which is the
         case the level badge exists for. */
      records: [
        { slug: 'the-studio', name: 'The Studio', level: 'owner' as const },
        { slug: 'pell-vine', name: 'Pell & Vine', level: 'read' as const },
      ],
    },
    people: PEOPLE_ACCESS,
    questions: QUESTIONS,
    whatsNew: NEWS,
    sinceCapped: false,
    version: 4192,
    /** Absent means every "Ask BrainDog" affordance is ABSENT, not disabled (23 §8). */
    assistant: false,
  };
}

/**
 * How many rows a register holds at all.
 *
 * NOT HOW MANY A PREDICATE MATCHED, which is what every other count on this page is. `19 §6` names
 * five empty states and says collapsing them into one is the failure — and telling "your filter
 * matched nothing" from "there is nothing here yet" needs exactly this number.
 */
export const heldBy = (register: string): number => (ROWS[register] ?? []).length;

/** Each page as the record answers `page` for it, kept once asked. */
const OPENED = new Map<string, ReturnType<Kernel['page']>>();

/**
 * One page, as the record reads it and a live page draws it: every block the record answered, through `blockOf`.
 *
 * ONE BLOCK'S REFUSAL IS ONE BLOCK, and that is the record's rule now: its `readPage` answers a block that cannot be
 * read as a block carrying the refusal, and `blockOf` draws the refusal's sentence.
 */
export function page(slug: string): { page: PageDecl; blocks: BlockResult[]; values: Record<string, string> } | null {
  const decl = pages()[slug];
  if (!decl) return null;
  const got = OPENED.get(slug) ?? RECORD.page(slug);
  OPENED.set(slug, got);
  if (!got.ok) return null;
  return { page: decl, blocks: got.value.blocks.map((b) => blockOf(b as never, refs(), NOW)), values: values() };
}

/**
 * One block, without a page around it, as the record reads it and a live page draws it.
 *
 * THE RECORD'S `block`, WHICH IS WHAT A `draw` TOOL HANDS AN AGENT, answers the declaration: its rows, its figures, its
 * walk, its feed, or the refusal that stops it. `blockOf` turns that answer into what the page draws, with every ref
 * named from the record's own rows.
 */
export function readBlock(b: PageBlock): BlockResult {
  return blockOf(RECORD.block(b as never) as never, refs(), NOW);
}

/**
 * How a figure moved over a window, one value a day from its series, as the record's `trendOf` reads it.
 *
 * A day with no point is a gap and never a zero, and today is not in it, because today's point is
 * written tomorrow. Nothing recorded at all is no trend, so no line is drawn from nothing.
 */
export function trendOf(metricId: string, window: string, now: number = NOW): (number | null)[] | undefined {
  const span = windowMs(window);
  if (span === null) return undefined;
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round(span / DAY));
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const last = now - DAY;
  const by = new Map((SERIES[metricId] ?? []).map((p) => [p.at, p.value]));
  const trend = Array.from({ length: days }, (_, i) => by.get(at(last - (days - 1 - i) * DAY)) ?? null);
  return trend.some((v) => v !== null) ? trend : undefined;
}

/**
 * One page of a list, and where the next one starts.
 *
 * `13 §4.3` SPECIFIES THREE MECHANISMS AND THIS TREE HAD ONE AND A HALF. Rows arrive in *"200-row
 * keyset pages into rowgroups of 100 under `content-visibility`; the DOM caps at 2,000 with a
 * visible cap line"*. The rowgroups are built and correct. The cap line is built and correct. The
 * pages did not exist: this function took a filter and a sort and returned every row the register
 * held, so `DOM_CAP` was not the END of a paging sequence, it was a substitute for one.
 *
 * KEYSET, NOT OFFSET, WHICH IS WHY THE CURSOR NAMES A ROW. `33 §2` chose it deliberately: an offset
 * shifts under a concurrent write, so page two silently skips or repeats whatever moved across the
 * boundary. The cursor here is the `seq` of the last row of the page before, and the next page
 * starts after that ROW rather than at that COUNT — so a row inserted above it changes nothing.
 *
 * A CURSOR THAT NO LONGER RESOLVES IS `stale`, NOT AN EMPTY PAGE. If the answer changed underneath —
 * the filter moved, the row was archived — the honest response is to say the sequence is broken and
 * let the caller start again. Returning `[]` would look like the end of the list, which is the one
 * answer that is indistinguishable from a correct one.
 *
 * NO `limit` MEANS THE WHOLE ANSWER, which every existing caller wants and which is what a count,
 * a metric and a forecast read. Paging is something a *grid* does.
 *
 * THE RECORD'S ROWS, IN THE RECORD'S ORDER. The rows are the seeded record's, each ref drawn as the
 * number of the row it points at; the chips are matched by the record (`applyFilters`) and a sort is
 * the record's `order`. The paging over that answer is this file's, and it is a fidelity exercise in
 * the SHAPE of a paged answer: it makes the head count, `⌘a`, the sort chips and the empty states be
 * written against a PARTIAL answer, which is what the record's `list` returns.
 */
export function list(
  register: string,
  opts: {
    filters?: Filter[];
    q?: string;
    sort?: { field: string; dir: 'asc' | 'desc' };
    /** `'any'` joins the chips with "or", as the address word `join=any` does. See `whereOf`. */
    join?: 'any';
    /** Rows per page. Clamped to `33 §2`'s ceiling of 200. Absent means the whole answer. */
    limit?: number;
    /** The `seq` of the last row of the previous page. */
    cursor?: string;
  } = {},
) {
  const all = rowsOf(register).map((row) => entryFrom(register, row));
  const filtered = applyFilters(register, all, opts.filters ?? [], opts.q, opts.join);
  const sorted = opts.sort ? inOrder(register, filtered, opts.sort) : filtered;
  const key = questionKey(register, opts);

  if (opts.limit === undefined)
    return { entries: sorted, total: all.length, matched: filtered.length, cursor: null, stale: false };

  /* `NaN` SURVIVED THIS CLAMP AND CAME BACK AS THE END OF THE LIST. `Math.floor(NaN)` is `NaN` and
     both `Math.max` and `Math.min` propagate it, so `slice(0, NaN)` was `[]` and the answer was
     `{ entries: [], cursor: null }` — the empty page this function's own comment says it refuses to
     give, because it is indistinguishable from a finished walk. */
  const asked = Number(opts.limit);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(1, Math.floor(asked)), PAGE) : PAGE;

  let from = 0;
  if (opts.cursor !== undefined) {
    const at = cursorAt(sorted, key, opts.cursor);
    if (at === -1) return { entries: [], total: all.length, matched: filtered.length, cursor: null, stale: true };
    from = at + 1;
  }

  const page = sorted.slice(from, from + limit);
  const last = page[page.length - 1];
  return {
    entries: page,
    total: all.length,
    matched: filtered.length,
    /* NULL AT THE END OF THE ANSWER, and only there. A cursor pointing at the last row would ask the
       caller for one more page that is always empty, and an observer watching a sentinel would keep
       firing at the bottom of a finished list. */
    cursor: last && from + limit < sorted.length ? `${key}:${last.seq}` : null,
    stale: false,
  };
}

/**
 * `entries` in the order the record sorts its list by `sort`, the row's number breaking a tie. A sort the record refuses
 * leaves them as they came, which is what the list answers when it cannot be sorted.
 */
function inOrder(register: string, entries: Entry[], sort: { field: string; dir: 'asc' | 'desc' }): Entry[] {
  const said = walk({ register, order: [{ field: sort.field, dir: sort.dir }, { field: 'seq', dir: 'asc' }] });
  if (said === null) return entries;
  const place = new Map(said.map((row, i) => [row.seq, i]));
  return [...entries].sort((a, z) => (place.get(a.seq) ?? said.length) - (place.get(z.seq) ?? said.length));
}

/**
 * A CURSOR NAMES A ROW **IN ONE ANSWER**, and it used to name only the row.
 *
 * `findIndex` on a bare `seq` finds that row wherever it happens to sit, so a cursor taken from an
 * ascending page and handed to the descending answer resumed at index 2,415 of 2,614 and reported
 * `stale: false` — silently skipping 2,415 rows. The grid resets its pages when the question changes,
 * so it was not reachable through the screen; the API had no guard and nothing tested it, which is
 * how it would have reached the first caller that did not reset.
 *
 * The question is part of the cursor now. `33 §2` calls a cursor opaque, and this is what opaque
 * buys: a cursor from a different question does not resolve, so the answer is `stale` — start again —
 * rather than a page from the middle of somewhere else.
 *
 * AND THE SAME QUESTION HASHES THE SAME WAY, WHICHEVER ORDER IT WAS BUILT IN. This was
 * `JSON.stringify` over the options as handed in, and `JSON.stringify` preserves key order — so
 * `{ field, op, values }` and `{ op, values, field }` were two different questions over the same 38
 * rows in the same order, as were `values: ['open','part','paid']` and `['paid','part','open']`, and
 * `sort: { field, dir }` and `{ dir, field }`. A caller that rebuilt its options object with a
 * different key order got `stale` on every `more()`: refetch page one, keep the new cursor, fire the
 * observer, `stale` again — an unbounded reset loop that never advances a row. That is precisely
 * *"the first caller that did not reset"* the paragraph above names, arriving through the guard
 * rather than past it.
 *
 * A filter is written out field by field in a fixed order; the filters and each `values` list are
 * SORTED, because `state in (open, paid)` and `state in (paid, open)` are the same question and a
 * reader who dragged a chip has not asked a new one.
 */
const questionKey = (
  register: string,
  opts: { filters?: Filter[]; q?: string; sort?: { field: string; dir: 'asc' | 'desc' }; join?: 'any' },
): string => {
  const said = JSON.stringify([
    register,
    (opts.filters ?? [])
      .map((f) => [f.field, f.op, [...f.values].sort()] as const)
      .sort((x, y) => (x[0] === y[0] ? x[1].localeCompare(y[1]) : x[0].localeCompare(y[0]))),
    opts.q ?? '',
    opts.sort ? [opts.sort.field, opts.sort.dir] : null,
    /* THE SAME CHIPS JOINED BY "or" ARE ANOTHER QUESTION, so a cursor from the "and" list is stale
       under it. Appended only when present, so every cursor minted before the word still resolves. */
    ...(opts.join === 'any' ? ['any'] : []),
  ]);
  let h = 5381;
  for (let i = 0; i < said.length; i++) h = ((h * 33) ^ said.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

const cursorAt = (rows: readonly Entry[], key: string, cursor: string): number => {
  const at = cursor.lastIndexOf(':');
  if (at === -1 || cursor.slice(0, at) !== key) return -1;
  const seq = cursor.slice(at + 1);
  return rows.findIndex((e) => String(e.seq) === seq);
};

/** The same question, asked against the record's own ledger and runs, at the record's own clock. */
export const workingNow = (register: string, seq: number, now: number = NOW): boolean =>
  workingNowAt(register, seq, now, AUDIT, ROWS.session ?? []);

export const entry = (register: string, seq: number): Entry | undefined =>
  (ROWS[register] ?? []).find((e) => e.seq === seq);

export function search(q: string, limit = 24): SearchResult {
  const needle = q.trim().toLowerCase();
  const want = terms(q);
  if (!want) return { hits: [], total: 0, groups: [] };

  const groups: SearchHit[][] = [];

  for (const [id, r] of Object.entries(REGISTERS)) {
    const group: SearchHit[] = [];
    for (const e of ROWS[id] ?? []) {
      /* THE DECLARATION DECIDES, not this loop. `title.includes(needle)` could not find a row by its
         provider or by the body of its update, and the door this function draws pointed at a list
         that could. One matcher, read from `search:` — see `find.ts`. */
      if (!answers(id, e, q)) continue;
      const title = String(e.fields[r.title] ?? '');
      group.push({
        title,
        /* The register's own name is the GROUP heading these rows sit under, so repeating it on
           every row said the same word twice, eight times down the list. */
        detail: display(id, r.state ?? '', e.fields[r.state ?? ''], NOW) ?? '',
        /* AND WHY IT IS HERE, when the title does not contain what was typed. Broadening the match
           past the title means rows arrive under a name that does not answer the query, and a result
           somebody cannot connect to their own typing is one they stop trusting. */
        ...(() => {
          const said = why(id, e, q, title);
          return said === null ? {} : { why: said };
        })(),
        href: `/r/${id}/${e.seq}`,
        kind: r.name,
        icon: iconFor(r.icon, 'rows'),
        spoken: `#${e.seq}`,
      });
    }
    if (group.length) groups.push(group);
  }

  const questions: SearchHit[] = [];
  for (const q2 of [...QUESTIONS, ...DECIDED])
    /* THE SAME TOKENISATION AS THE ROWS ABOVE. A question is not a register row and has no
       declaration to read, but a query that means one thing in eight groups and something else in
       the ninth is a query nobody can reason about — so the words are split and prefix-matched the
       same way, over the one piece of text a question has. The id still resolves whole. */
    if (want.every((w) => tokensOf(q2.title).some((t) => t.startsWith(w))) || q2.id.toLowerCase() === needle)
      questions.push({ title: q2.title, detail: q2.decided ? 'Decided' : 'Open question', href: `/decide/${q2.id}`, kind: 'Needs you', icon: 'decide', spoken: q2.id });
  /**
   * AND THE PAGES, because the screen's own sentence promised them.
   *
   * `/search`'s empty state reads *"Every list, every decision, and every page — by the words in
   * them"*, and this function walked registers and questions. So `renewals` and `overview` — both
   * page titles the palette finds one keystroke away — answered *"Nothing in the record matches"* on
   * the surface `19 §2` calls the structured fallback for when the palette was not enough. The
   * promise shipped as the route became a first-class destination, which is the worst moment for it
   * to be false.
   *
   * No door: `/p/*` is not a filtered list, so the group discloses its cap in a sentence like the
   * questions do.
   */
  const found: SearchHit[] = [];
  for (const [slug, p] of Object.entries(pages()))
    if (p.nav && p.placed !== false && want.every((w) => tokensOf(p.title).some((t) => t.startsWith(w))))
      /* THE GROUP IS HEADED BY THE WORD THE PRODUCT USES FOR IT, AND IT WAS NOT. This wrote the
         literal `Pages` while the rail, the sheet and every other surface say `Pages and lists`
         out of `copy.pages`, so the palette and the navigation named the same thing twice and
         differently. One word, in the file that owns the words. */
      found.push({ title: p.title, detail: p.nav.section, href: `/p/${slug}`, kind: copy.pages, icon: iconFor(p.icon, 'grid') });
  if (found.length) groups.push(found);

  /* Questions FIRST in the rotation: a decision waiting on you is the one thing in the record that
     is about today, and it is the one source that can never be more than a handful of rows. */
  if (questions.length) groups.unshift(questions);

  const hits: SearchHit[] = [];
  for (let round = 0; hits.length < limit; round++) {
    const before = hits.length;
    for (const group of groups) {
      const hit = group[round];
      if (hit) hits.push(hit);
      if (hits.length >= limit) break;
    }
    if (hits.length === before) break;
  }

  return {
    hits,
    total: groups.reduce((n, g) => n + g.length, 0),
    /* The list's own name, off the first hit — every hit in a group carries the same `kind` because
       the group IS one register (or the questions, which unshift themselves in front).

       AND THE ADDRESS THAT HOLDS ALL OF THEM. A results page that caps a group and cannot say where
       the rest is has the defect it was built to fix, one door along; the register's own `q` runs
       the same title match, so the link is the same question asked of one list. The questions group
       has no register, and `/decide` is not a filtered list, so it gets none. */
    groups: groups.map((g) => {
      const first = g[0]?.href ?? '';
      const register = /^\/r\/([a-z0-9_]+)\//.exec(first)?.[1] ?? null;
      return {
        kind: g[0]?.kind ?? '',
        total: g.length,
        hits: g,
        href: register ? `/r/${register}?q=${encodeURIComponent(q.trim())}` : null,
      };
    }),
  };
}

/**
 * One run, by the id in the address — or `null`, which is a MISS and not a failure.
 *
 * THE ROUTE IGNORED ITS OWN PARAMETER. `/jobs/9` and `/jobs/anything` rendered the same screen with
 * the same fixture under a header printing that fixture's id, so the `[id]` segment was decoration.
 * A route whose segment means nothing is one that gets linked wrongly the first time it is linked.
 */
export const job = (id: string): Job | null => JOBS[id] ?? null;
