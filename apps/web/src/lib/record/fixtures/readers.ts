/**
 * The sample's answers to the app's calls, for the tests that drive the helpers and the engines over the seed.
 *
 * A TEST IMPORTS THIS AND NOTHING SHIPPED MAY. These are `boot`, `list`, `entry`, `search`, `page`, `values`, `job` and
 * `metric` as `api.ts` answered them out of `data.ts`, with everything only they read: the sample's page engine, its
 * cash walk, its feed over the sample's ledger and its decide queue. They were the mock the app was drawn against before
 * a record could answer, and they shipped for as long as they sat beside the helpers the live screens draw with (wave
 * B2 of `loop/research-no-sample.md`). Thirty-nine test files import them, counted on 25 September: `engines.test.ts` and
 * `capture-block.test.ts` hold the kernel's pages to this engine, and the rest read the seed through it as data. Also
 * here are the sample-bound helpers no screen called (`applyFilters`, `backlinks`, `noticed`, `trackHealth`, `workingNow`,
 * `trendOf`, `figureTile` and the like), because each reads the sample's rows or its clock. `no-sample-b2.test.ts`
 * refuses any file outside a test that imports this directory.
 *
 * THE CLOCK IS THE SAMPLE'S `NOW` THROUGHOUT, because the rows are the sample's: a due date in them is only overdue on
 * the day the seed was written for.
 */

import { day as fmtDay, money, MISSING } from 'braindog-render';
import { barsOf, costOf, costRank, findingsFrom, isStale, stepsPercent, tallySteps, type Cost, type Part, type SeriesLine } from '@braindog/kernel';

import {
  CHANGED,
  NO_ROW_SAID,
  PAGE,
  agentsTable,
  columnHeading,
  columnsFor,
  decl,
  display,
  feedTable,
  healthOf,
  historyTable,
  hueOf,
  iconFor,
  inheritedFrom,
  labelOf,
  markColumns,
  runName,
  signFaults,
  sortRows,
  toRows,
  unsaidFigure,
  updatesIn,
  runsIn,
  walkTable,
  whereOf,
  workingAt,
  workingNowAt,
  type Backlink,
  type BlockResult,
  type FeedRow,
  type Metric,
  type NavEntry,
  type SearchHit,
  type SearchResult,
  type TrackHealth,
} from '../api.ts';
/* THE SAMPLE'S READERS READ THE TABLES THE HELPERS READ, which `fill.ts` fills with the sample. They read the fixture's
   own until wave C1, when the fixture's tables and `held.ts`'s were one object for the declarations and two for the
   rows, so a test that grew a list for a reader and a helper had to know which of the two each one looked in. */
import './fill.ts';
import { PAGES, REGISTERS, ROWS } from '../held.ts';
import { AUDIT, DECIDED, JOBS, NEWS, NOW, OBSERVED, PEOPLE_ACCESS, PROPOSALS, QUESTIONS, QUEUE, SERIES, SUSPENDED, VIEWS } from './sample.ts';
import { copy } from '../../copy.ts';
import { answers, terms, tokensOf, why } from '../find.ts';
import { runway } from '../forecast.ts';
import { resolvePages } from '../pages.ts';
import { compile, explain, matches } from '../where.ts';
import { METRICS } from '../declared.ts';
import { BARE, fxNote, fxNow, meetsTarget, offTarget, noteOf, read, targetLine, targetSaid, walksNote, windowMs, withParam, type MetricDecl, type Reading } from '../metrics.ts';
import { mixedFix } from '../money.ts';
import { REDUCES, type Entry, type FieldDecl, type Filter, type Job, type PageBlock, type PageDecl, type Question } from '../schema.ts';

/* TWO SENTENCES ONLY THIS ENGINE SAYS, so they are kept here and not in `copy.ts`, where a sentence no screen draws is a
   dead one. The runway tile over a walk of nothing, and a movement that rounds to no per cent: "up 0%" gives a reader a
   way and a distance of nothing. */
const NOTHING_DATED = 'Nothing dated to walk yet.';
const ABOUT_THE_SAME = 'about the same';

/**
 * The cash the walk starts from, in minor units.
 *
 * A STAND-IN, and it is named up here so that it reads as one. The record does not hold a bank
 * balance yet, and a runway seeded from a number nobody declared is a forecast that looks like a
 * fact. When an account row exists this becomes a lookup and nothing else changes.
 */
/**
 * The `forecast.runway` block the record declares, or `null`.
 *
 * ONE DECLARATION, READ BY BOTH. The tile and the block were two walks over two openings, and the
 * only way two figures about one future stay in step is for there to be one of them.
 */
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
  const decl = METRICS[opening.metric];
  if (!decl) return { value: null, unit: null, refusal: `There is no metric called ${opening.metric} for the walk to start from.` };
  const reading = read(decl, NOW);
  if (reading.refusals.length) return { value: null, unit: null, refusal: reading.refusals[0]! };
  /* A BALANCE IN SEVERAL CURRENCIES WITH NO RATE BETWEEN THEM IS NOT ONE AMOUNT TO START FROM: its parts are, one walk a
     currency, as the record says. */
  if (reading.parts) return { value: null, unit: null, parts: reading.parts, missing: reading.fx?.missing ?? [] };
  return { value: reading.value ?? 0, unit: reading.unit ?? currencyOfFormat(decl.format), converted: Boolean(reading.fx?.asOf) };
}

/** `money.GBP` is sterling; any other format is not a currency. */
const currencyOfFormat = (format: string | undefined): string | null => (format?.startsWith('money.') ? format.slice('money.'.length) : null);

const declaredWalk = (): PageBlock | null => {
  for (const decl of Object.values(PAGES)) for (const b of decl.blocks) if (b.source === 'forecast.runway') return b;
  return null;
};

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
  REF_NOT_FOUND: 'the row it points at is not in this record yet',
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

export function applyFilters(register: string, entries: Entry[], filters: Filter[], q?: string, join?: 'any'): Entry[] {
  const w = compile(register, whereOf(filters, join), NOW);
  let out = filters.length ? entries.filter((e) => matches(e, w, NOW)) : entries;

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

const open = (e: Entry) => e.fields.state === 'open' || e.fields.state === 'part';

const days = (iso: unknown) =>
  typeof iso === 'string' ? (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000 : Infinity;

/**
 * A figure, read from its DECLARATION.
 *
 * This was a twelve-case `switch` with `const KILN = 1` inside it, which is why there was exactly
 * one project page and why `stat` was unusable on any page an agent writes. The documents are in
 * `declared.ts` and the evaluator is in `metrics.ts`; what is left here is the two figures the
 * record computes rather than stores, and the translation from a reading into a tile.
 *
 * The NOTE is the target and the comparison, which is what 08 §2.2 says a figure is for: "EGP
 * 6,240,000 · target ≤ 5,000,000 · up 18% on the 30 days before it" is three facts and the second
 * is the one you act on. A bare figure is a number you look at.
 */
export function metric(id: string): Metric {
  /* THE RUNWAY, the only figure in the product that is about the future, and 08 §2.3's `running`
     aggregation — a cumulative reducer with a stop condition. It seeds from what is liquid, applies
     every dated movement in order, and reports the first day the balance goes under, with the row
     that did it: "you run out on 14 November" is a number you look at, and "the Fenwick renewal is
     what does it" is one you act on.

     AND IT WALKS WHAT THE PAGE DECLARES. The tile used a module constant of GBP 42,000 while the
     Money page's own `forecast.runway` block said GBP 5,000 — two figures about the same future,
     8.4 times apart, neither saying which balance it rested on. There is one declaration now, and
     the note says the figure it starts from. */
  if (id === 'runway') {
    const block = declaredWalk();
    const walk = runway(openingOf(block?.opening).value ?? 0, block?.from ?? [], undefined, undefined, NOW);
    /* AND A WALK OVER NOTHING IS NOT A RUNWAY OF OVER 180 DAYS. `tone: 'good'` is hard-coded on this
       branch, so a record with no money in it and nothing dated to spend reported the one figure in
       the product that is about the future as fine — out of an opening balance of zero and an empty
       list of movements. `19 §6` again: nothing to show is not the same as nothing to worry about. */
    if (!walk.crossed && walk.steps.length === 0 && walk.from === 0)
      return { id, label: 'Runway', value: MISSING, note: NOTHING_DATED, href: '/p/money' };
    if (!walk.crossed)
      return {
        id,
        label: 'Runway',
        value: `Over ${walk.horizon} days`,
        /* "TAKES X UNDER" HAS NO OBJECT, so a reader supplies one and reads *under X* — which the
           walk directly below it then breaks, twice, under a green tick. The floor is zero (the
           crossing test is `balance < 0`); `X` is where the walk STARTS. Measured on a three-row
           record: "nothing dated takes GBP 5,000.00 under" over a table showing that balance falling
           to GBP 3,636.00 on the same day. This branch only ever renders on a small record — at
           twelve rows the walk crosses and the tile flips — so it is week one's sentence, which is
           the week nothing had ever looked at. */
        note: `starts at ${money(walk.from, walk.currency ?? 'GBP')} and nothing dated takes it under`,
        /* THE TICK NEEDS SOMETHING TO HAVE BEEN WALKED. With an opening balance declared on the page
           and no dated movement anywhere in the record, the note is true — nothing takes it under,
           because there is no nothing — and a green tick over it is a verdict on a walk that did not
           happen. The sentence stays; the judgement goes. */
        ...(walk.steps.length === 0 ? {} : { tone: 'good' as const }),
        href: '/p/money',
      };
    return {
      id,
      label: 'Runway',
      value: `${walk.days} days`,
      note: `${fmtDay(walk.crossed.day)} · ${walk.crossed.label}`,
      tone: walk.days !== null && walk.days < 45 ? 'bad' : 'warn',
      href: walk.crossed.href,
    };
  }

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
        : targetLine({ format: 'int', target: { lte: 3 } } as Parameters<typeof targetLine>[0]),
      ...(none ? {} : { tone: QUEUE.length > 3 ? ('warn' as const) : ('good' as const) }),
      href: '/decide',
    };
  }

  /* `project-owed:Kiln` — the document, and the thing it is about. The parameter is everything after
     the FIRST colon, because a project can be called anything and a name with a colon in it is a
     name, not two ids. */
  const at = id.indexOf(':');
  const base = at === -1 ? id : id.slice(0, at);
  const template = METRICS[base];
  if (!template)
    return { id, label: id, value: MISSING, note: 'no metric is declared under that name', tone: 'warn', href: '/p/money' };
  const decl = at === -1 ? template : withParam(template, id.slice(at + 1));
  return figureTile(id, decl, read(decl, NOW));
}

/**
 * ONE READING OF ONE DECLARATION, AS A TILE: the sample engine's half of a rule the other two engines also hold.
 *
 * IT WAS THE TAIL OF `metric` AND IS ITS OWN FUNCTION SO THAT A READING CAN BE HANDED TO IT. The
 * other two renderers of this same tile, `news-live.ts`'s `tileOf` and `page-live.ts`'s, each take a
 * reading and return a tile, so each can be driven over a reading a test wrote; this one built its
 * own out of the seed's fixed rows, so the only readings it could ever be asked about were the four
 * `things` the sample ships. The parity drive in `news-live.test.ts` needs `rows: 0` over `held: 27`,
 * which is a shape the sample's rows cannot produce, so with no seam here the third engine could only
 * be argued about rather than measured. Nothing else changed in the move: `metric` still reads the
 * declaration and calls this with `read(decl)`.
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
      href: '/packs',
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
   * nothing had audited, because both usability passes before this one could not reach an empty
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
  const met = empty || unsaid ? null : off ? (reading.targetIn ? meetsTarget({ ...decl, target: reading.targetIn.target }, reading.value) : null) : meetsTarget(decl, reading.value);
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
   */
  const oldestIn = (direction: string) =>
    (ROWS.obligations ?? [])
      .filter((e) => open(e) && e.fields.direction === direction && days(e.fields.due) < 0)
      .map((e) => String(e.fields.due))
      .sort()[0] ?? '';

  return {
    /** Money you owe, past its date — the set the `overdue` metric counts. */
    'obligations.oldest_unpaid': oldestIn('owed_by_me'),
    /** Money owed to you, past its date. Statutory interest you could charge. */
    'obligations.oldest_unrecovered': oldestIn('owed_to_me'),
    'obligations.count': String((ROWS.obligations ?? []).length),
    'services.count': String((ROWS.services ?? []).length),
    ...Object.fromEntries(
      /* EVERY FIGURE THE RECORD DECLARES, not a list of the ones some page happened to name, so a note any pack writes resolves. A
         figure with a parameter is left out, because it is only a figure once a page fills it. */
      Object.keys(METRICS).filter((id) => !JSON.stringify(METRICS[id]).includes('{{')).map((id) => [id, metric(id).value]),
    ),
  };
}

/**
 * Every page there is, which is not the same as every page DECLARED.
 *
 * A declaration carrying `for:` is a template and becomes one page per row it admits — four
 * projects over one `project` declaration, where before there was a `kiln` page and no way to have
 * a second. Resolved on read rather than cached, because the rows it depends on are the record.
 */
export const pages = (): Record<string, PageDecl> => resolvePages(PAGES, NOW);

export function boot() {
  /* ONE RESOLUTION, READ TWICE. The rail below and the pen at the bottom of this function each
     called `pages()`, and one resolution costs 0.48 ms at 26 projects against 0.05 ms on the
     sample, measured here. Half of a millisecond is not the reason; two snapshots of the same set
     inside one answer is, because a template expands against `ROWS` and the two lists a `boot`
     hands the shell should not be able to disagree about what a page is. */
  const resolved = Object.values(pages());

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
   * five rows the template admits, which is already the order the rail draws them in, because
   * `resolvePages` numbers each page's `nav.order` by its position in that same set.
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
  const RAIL_PAGES = 5;
  const drawn = new Map<string, number>();
  const nav: NavEntry[] = [];
  for (const p of resolved) {
    if (!p.nav || p.placed === false) continue;
    /* `identity` is set by `resolvePages` on the pages a template produced and on no others, so
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
      href: `/t/${t.seq}`,
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
       * `USABILITY.md`'s second question is whether the product grows as the record grows, and the
       * rail was the clearest no in it: eight list links, each with its own tally, drawn identically
       * over a record of eight rows and a record of four hundred. Seven of the eight read `0`, and a
       * link to a list with nothing in it is a thing a person has to read, decide is irrelevant, and
       * put down, every time they look at the rail. The precedent is `Second.svelte`, which filters
       * the same way under a comment saying that counting every declared register "is the count that
       * made this unreachable".
       *
       * HERE AND NOT IN THE RAIL, because the rail is not the only reader. The phone's More sheet
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
    /** Pages that emerged and were never placed. A holding pen, not a decision (19 §3). */
    pen: resolved.filter((p) => p.placed === false),
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

/**
 * A cash walk over money in several currencies that could not be converted, as the record's `pages.ts` draws it: one walk
 * a currency, each from that currency's part of the opening, and the sentence saying why it is not one walk.
 * `null` when the walk is one.
 */
function splitWalks(opened: ReturnType<typeof openingOf>, b: PageBlock): { walks: ReturnType<typeof runway>[]; note: string | null } | null {
  const legs = b.from ?? [];
  if (!Array.isArray(b.from) || (!opened.parts && opened.value === null)) return null;
  const home = fxNow().home;
  const whole = opened.parts ? null : runway(opened.value!, legs, b.horizon, undefined, NOW);
  /* AN OPENING IN THE HOME CURRENCY AND A MOVEMENT WITH NO RATE INTO IT, as the record's `pages.ts` draws it: the home walk
     of everything that converts, and each currency with no rate on its own beside it, from nothing. */
  const lacking =
    whole && home !== null && !opened.parts && (opened.unit === null || opened.unit === home) && whole.missing?.length
      ? [...new Set(whole.missing.map((pair) => pair.split(' to ')[0]!))].sort()
      : [];
  if (lacking.length) {
    const main = runway(opened.value!, legs, b.horizon, { except: lacking }, NOW);
    const walks = [{ ...main, currency: main.currency ?? home }, ...lacking.map((c) => runway(0, legs, b.horizon, c, NOW))];
    return { walks: remembered(b, walks), note: walksNote(home, whole!.missing!, walks.length) };
  }
  const apart =
    opened.parts !== undefined ||
    (whole !== null && !opened.converted && !whole.mixed.includes(BARE) && ((whole.mixed.length > 0 && whole.steps.length === 0) || (opened.unit !== null && whole.currency !== null && opened.unit !== whole.currency)));
  if (!apart) return null;
  const moving = whole ?? runway(0, legs, b.horizon, undefined, NOW);
  if (moving.mixed.includes(BARE)) return null;
  const currencies = [...new Set([...(opened.parts?.map((p) => p.currency) ?? (opened.unit ? [opened.unit] : [])), ...moving.mixed, ...(moving.currency ? [moving.currency] : [])])]
    .filter((c) => /^[A-Z]{3}$/u.test(c))
    .sort();
  const walks = currencies.map((c) => runway(opened.parts ? (opened.parts.find((p) => p.currency === c)?.amount ?? 0) : opened.unit === c ? opened.value! : 0, legs, b.horizon, c, NOW));
  if (walks.length === 0) return null;
  const missing = [...new Set([...(opened.missing ?? []), ...(moving.missing ?? [])])].sort();
  return { walks: remembered(b, walks), note: walksNote(home, missing, walks.length) };
}

/** Each walk of a split walk with the opening figure remembered in its currency, when the block names the series. */
function remembered<W extends ReturnType<typeof runway>>(b: PageBlock, walks: W[]): (W & { past?: { at: string; value: number }[] })[] {
  const points = recordedOf(b);
  return typeof points === 'string' || points === null ? walks : walks.map((w) => ({ ...w, past: pastIn(b, points, w.currency) }));
}

/**
 * The cash walk, shaped as an ordinary table block.
 *
 * Four columns, and the fourth is the reason the walk is drawn at all: the balance after each
 * movement. A list of dated amounts is the same information the register already has; the running
 * figure beside them is what makes it a forecast.
 *
 * The row that crosses carries the `bad` tone, so the eye lands on the day rather than on the
 * biggest number — those are rarely the same row, and the big number is the distraction.
 */
function runwayBlock(b: PageBlock): BlockResult {
  /* THE DECLARATION, NOT A CONSTANT. This read a module-level `OPENING` of GBP 42,000 while its own
     page said GBP 5,000 — so the tile and the block it sat beside disagreed by 8.4 times, in the
     one figure this product computes about the future. A block with no `opening:` gets none, and
     the walk says so rather than inventing a balance. */
  /* HOW FAR AHEAD IS A BUSINESS QUESTION; `limit:` IS A SCREEN QUESTION.
     
     This read `b.limit ? b.limit * 12 : 180`, so the horizon was twelve times however many rows fit
     on the page — 144 days for a block declaring twelve — while the block's own `empty:` sentence
     read "Nothing dated in the next six months." Two answers to how far the forecast looks, in one
     declaration, and neither was the `horizon:` key `PageBlock` has always carried and nothing read.
     
     It mattered the moment the block started stating its total: "12 of 58" where 58 was movements
     inside a window derived from a row count. */
  const opened = openingOf(b.opening);
  const split = splitWalks(opened, b);
  if (split) {
    const late = latenessOf(b);
    const recorded = recordedOf(b);
    return {
      ...b,
      register: undefined,
      entries: [],
      matched: [],
      refusals: [...(typeof recorded === 'string' ? [recorded] : []), ...(typeof late === 'string' ? [late] : []), ...split.walks.flatMap((w) => w.refusals)],
      walks: split.walks,
      walkNote: split.note,
      ...(typeof late === 'string' || late === undefined ? {} : { lateness: late, ...(typeof b.late === 'string' && METRICS[b.late]?.name ? { late_name: METRICS[b.late]!.name } : {}) }),
      ...walkTable(split.walks[0]!, b.kind === 'bridge' || b.kind === 'forecast' ? split.walks[0]!.steps.length : b.limit, new Date(NOW).toISOString().slice(0, 10), false),
      drawn: b.drawn ?? drawnWhen(b),
      stale_at: new Date(NOW).toISOString(),
      metrics: undefined,
    };
  }
  const walk = runway(opened.value ?? 0, b.from ?? [], b.horizon, undefined, NOW);
  /* A WALK THE RECORD CANNOT MAKE IS A SENTENCE, not an empty table. A cash walk over two currencies
     produces a crossing day that looks real and is invented.

     AND THE WALK'S OWN SENTENCES REACH THE BLOCK, WHICH THEY DID NOT. This read `walk.mixed` and
     nothing else, so the refusals the walk itself produces — a horizon it cannot carry, a leg
     pointed at something that is not money, a cycle that is not a whole number of months, a row
     that recurs past the cap — came back to a block that drew an empty table under its own `empty:`
     sentence instead. "Nothing is coming" and "this walk could not be made" are different facts and
     one of them is the reason for the other. */
  const recorded = recordedOf(b);
  const late = latenessOf(b);
  const refusals = [
    ...(opened.refusal ? [opened.refusal] : []),
    ...(typeof recorded === 'string' ? [recorded] : []),
    ...(typeof late === 'string' ? [late] : []),
    ...walk.refusals,
    ...(walk.mixed.length ? [`The cash walk needs one currency: ${mixedFix(walk.mixed)}.`] : []),
    ...(opened.unit !== null && walk.currency !== null && opened.unit !== walk.currency
      ? [`The opening balance is in ${opened.unit} and the movements are in ${walk.currency}. A cash walk adds them, so they need one currency.`]
      : []),
  ];
  return {
    ...b,
    register: undefined,
    entries: [],
    matched: [],
    refusals,
    ...(refusals.length ? {} : { walk }),
    ...(refusals.length || typeof recorded === 'string' || !recorded ? {} : { past: pastIn(b, recorded, walk.currency) }),
    ...(refusals.length || typeof late === 'string' || late === undefined ? {} : { lateness: late, ...(typeof b.late === 'string' && METRICS[b.late]?.name ? { late_name: METRICS[b.late]!.name } : {}) }),
    /* A BRIDGE ADDS UP THE WHOLE WALK, and a forecast draws it, so each shows every movement it read rather than a slice of them. */
    ...walkTable(walk, b.kind === 'bridge' || b.kind === 'forecast' ? walk.steps.length : b.limit, new Date(NOW).toISOString().slice(0, 10), refusals.length > 0),
    drawn: b.drawn ?? drawnWhen(b),
    stale_at: new Date(NOW).toISOString(),
    metrics: undefined,
  };
}

/**
 * A series: each figure read here, grouped as the record groups it, and lined up by the record's own `barsOf`.
 *
 * The figures are this build's readings and the arithmetic that lines them up is imported, so the
 * sample and a record draw the same bars in the same buckets.
 */
function seriesBlock(b: PageBlock): BlockResult {
  const got = barsOf(
    b.series as SeriesLine[] | undefined,
    b.back,
    b.ahead,
    (id) => (METRICS[id] ?? null) as never,
    (decl) => {
      const r = read(decl as never, NOW);
      return r.refusals.length
        ? { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: r.refusals[0]! } }
        : {
            ok: true,
            value: {
              groups: r.groups ?? [],
              current: r.current ?? '',
              value: r.value ?? null,
              /* THE CURRENCY THE FIGURE IS IN, which is the home one once converted; its parts when it is in several. */
              unit: r.rows === 0 || r.parts ? null : (r.unit ?? unitOfFormat((decl as { format?: string }).format)),
              ...(r.parts ? { parts: r.parts } : {}),
            },
          };
    },
  );
  const refusals = 'refusal' in got ? [got.refusal.fix] : [];
  const unread = Object.keys(b).filter((k) => !READS.has(k)).map((k) => `${k}: is not a key this build reads`);
  return {
    ...b,
    register: undefined,
    columns: [],
    entries: [],
    matched: [],
    refusals: [...unread, ...refusals],
    rows: [],
    ...('bars' in got ? { bars: got.bars } : {}),
    shown: 'bars' in got ? got.bars.keys.length : 0,
    total: 'bars' in got ? got.bars.keys.length : 0,
    drawn: b.drawn ?? drawnWhen(b),
    stale_at: new Date(NOW).toISOString(),
    metrics: undefined,
  };
}

/** The currency a `money.<CUR>` format names, or `null`. */
const unitOfFormat = (format: string | undefined): string | null => (format?.startsWith('money.') ? format.slice('money.'.length) : null);

/** The knobs a forecast may offer: the kernel's `KNOBS`. */
const KNOBS = ['horizon', 'late', 'spend', 'leave', 'grow', 'drift', 'count', 'sell'];

/**
 * A forecast's remembered balance before today, as the record's `recordedOf` reads it, or the sentence that stops it.
 *
 * The series is the opening figure's own, over the ninety days before today, a day with no point absent.
 */
/**
 * Remembered points in one currency, as the record's `pastIn` draws them. The sample's points carry no unit, so each is in
 * the currency its figure's format names.
 */
function pastIn(b: PageBlock, points: readonly { at: string; value: number }[], currency: string | null): { at: string; value: number }[] {
  const id = typeof b.recorded === 'string' ? b.recorded.replace(/^series\./u, '') : '';
  const unit = currencyOfFormat(METRICS[id]?.format);
  return !currency || !unit || unit === currency ? [...points] : [];
}

function recordedOf(b: PageBlock): readonly { at: string; value: number }[] | string | null {
  if (b.knobs !== undefined && (!Array.isArray(b.knobs) || b.knobs.some((k) => !KNOBS.includes(k)))) return `knobs is a list of ${KNOBS.join(', ')}.`;
  if (b.recorded === undefined) return null;
  const id = typeof b.recorded === 'string' ? b.recorded.replace(/^series\./u, '') : '';
  const opening = b.opening !== null && typeof b.opening === 'object' ? b.opening.metric : null;
  if (!id || id !== opening) return `recorded: names the series its opening figure is remembered in, which is ${opening ?? 'a figure this walk does not open from'}.`;
  const DAY = 86_400_000;
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const from = at(NOW - 90 * DAY);
  const to = at(NOW - DAY);
  return (SERIES[id] ?? []).filter((p) => p.at >= from && p.at <= to);
}

/**
 * A forecast's late mark, as the record's `latenessOf` reads it, or the sentence that stops it.
 *
 * `undefined` when the block names no figure; the reading, `null` when nothing was paid, when it does.
 */
function latenessOf(b: PageBlock): number | null | string | undefined {
  if (b.under !== undefined && (!Number.isInteger(b.under) || b.under < 1 || b.under > 365)) return 'under: is a whole number of days between 1 and 365.';
  if (b.late === undefined) return undefined;
  const decl = typeof b.late === 'string' ? METRICS[b.late] : undefined;
  if (!decl) return `There is no metric called ${String(b.late)} for the late knob to mark.`;
  const reading = read(decl, NOW);
  return reading.refusals.length ? reading.refusals[0]! : reading.value;
}

/**
 * Whether a block's `when:` is satisfied, given the figure it names.
 *
 * A FIGURE THAT CANNOT BE READ DOES NOT DRAW THE BLOCK. The alternative — drawing it anyway — is
 * how a red note about an overdue invoice appears on a record with no invoices at all, which is the
 * one thing a `when:` exists to prevent. A block with no `when:` always draws.
 */
function drawnWhen(b: PageBlock): boolean {
  if (!b.when) return true;
  /* A `when:` NAMING A FIGURE NOBODY DECLARED DOES NOT DRAW. It is the same answer as a figure that
     cannot be computed, and for the same reason: the block's condition is unknown, and drawing on
     an unknown is guessing. */
  const decl = METRICS[b.when.metric];
  if (!decl) return false;
  const reading = read(withParam(decl, b.when.metric), NOW);
  /* A FIGURE IN SEVERAL CURRENCIES MEETS THE CONDITION WHEN ONE OF ITS AMOUNTS DOES, as the record reads it: money late
     in pounds is late whatever is late in dollars. */
  const said = reading.parts ? reading.parts.map((p) => p.amount) : reading.value === null ? [] : [reading.value];
  const when = b.when;
  return said.some((v) => {
    if (when.gt !== undefined) return v > when.gt;
    if (when.gte !== undefined) return v >= when.gte;
    if (when.lt !== undefined) return v < when.lt;
    if (when.lte !== undefined) return v <= when.lte;
    if (when.is !== undefined) return v === when.is;
    if (when.not !== undefined) return v !== when.not;
    /* A CONDITION WITH NO TEST IN IT IS NOT A CONDITION, and drawing the block would be guessing that
       the author meant "always". They meant something; the block waits until they say what. */
    return false;
  });
}

/**
 * Every key a block declaration may carry, so one it cannot is named rather than ignored.
 *
 * A list, not a type check: a declaration arrives as JSON from a pack somebody else wrote, and
 * TypeScript is not there at the moment it is read. `when:` is the one 06 §1.1 documents and this
 * build does not have — an agent writing the doc's own worked example got a block that always drew.
 */
const READS = new Set([
  'kind', 'heading', 'span', 'source', 'where', 'columns', 'cells', 'order', 'limit',
  'target', 'authored', 'empty', 'tone', 'body', 'drawn', 'when', 'opening', 'from', 'horizon', 'of',
  /* A section's two keys: `fold` starts it shut, `icon` names the glyph beside its heading. */
  'fold', 'icon',
  /* A feed's and a diff's keys, so a page may declare them before their bindings land. */
  'since', 'first', 'row', 'field', 'versions',
  /* A block that reads its project's rows and the ones it inherits from everywhere. */
  'inherit',
  /* A stat whose first figure is the screen's hero. */
  'lead',
  /* A series's lines and its reach. */
  'series', 'back', 'ahead', 'net',
  /* A stat or lines over readings: whether a point is a day or a week. */
  'bucket',
  /* A forecast's remembered figure and its knobs, its late mark and its warning reach, and the figure its sell knob offers. */
  'recorded', 'knobs', 'late', 'under', 'sell',
  /* A bar's or a split's row for what no part holds, and the intent each part is drawn in. */
  'unset', 'tones',
  /* A card grid's out-of-date rule. */
  'stale',
  /* A progress budget's figure of what was spent, and a goal's of what was logged toward it. */
  'spent', 'toward',
  /* A note whose body is a whole document. */
  'document',
  /* Whether each row says an agent is on it right now, and the answer that asking produces. */
  'working', 'working_now',
  /* A capture's list, and what a new row in it is filled with. */
  'register', 'fills',
]);

export function page(slug: string): { page: PageDecl; blocks: BlockResult[]; values: Record<string, string> } | null {
  const decl = pages()[slug];
  if (!decl) return null;

  /**
   * SIX QUERIES, SIX INDEPENDENT FAILURES. The page route states that invariant at the top of its
   * own file, and it was not true of the read underneath it: `readPage` maps every block in one
   * call, so anything that threw in one of them took the whole page with it. A `where:` written as
   * the predicate tree `docs/06-PAGES` §1.1 specifies did exactly that — `.split` on an object —
   * and a page of five correct blocks rendered as nothing at all.
   *
   * A block that throws becomes a block that refuses, in the surface `draw()` already draws. The
   * message is the thrown one because a declaration is written by somebody who can act on it.
   */
  const blocks = decl.blocks.map((b): BlockResult => {
    try {
      return readBlock(b);
    } catch (e) {
      return {
        ...b,
        register: undefined,
        columns: [],
        entries: [],
        matched: [],
        refusals: [`this block could not be read: ${e instanceof Error ? e.message : String(e)}`],
        rows: [],
        shown: 0,
        total: 0,
        drawn: b.drawn ?? drawnWhen(b),
        stale_at: new Date(NOW).toISOString(),
        metrics: undefined,
      };
    }
  });

  return { page: decl, blocks, values: values() };
}

/**
 * What a `progress` block's `spent:` or `toward:` figure read, in parts, as the record answers it beside the rows; or the
 * sentence that stops it. A limit in one currency and a figure in another are never set against each other.
 */
function progressFigure(b: PageBlock, rows: readonly Entry[]): { spentBy?: NonNullable<BlockResult['spentBy']>; refusal?: string } {
  const id = b.spent ?? b.toward;
  if (id === undefined) return {};
  const at = b.spent === undefined ? 'toward' : 'spent';
  const decl = METRICS[id];
  if (!decl) return { refusal: `${at}: there is no metric called ${id}` };
  if (typeof decl.group_by !== 'string' || decl.bucket !== undefined) return { refusal: `${at}: ${id} groups by a word, and a date cut into buckets is a series` };
  const r = read(decl as never, NOW);
  if (r.refusals.length) return { refusal: r.refusals[0]! };
  const unit = r.rows === 0 ? null : unitOfFormat(decl.format);
  const limit = b.columns?.[1]?.field;
  const other = unit === null || limit === undefined ? undefined : rows.map((e) => currencyOfValue(e.fields[limit])).find((c) => c !== null && c !== unit);
  if (other) return { refusal: `A row here is in ${other} and ${id} is in ${unit}, and two currencies are never set against each other.` };
  const groups = (r.groups ?? []).map((g) => ({ key: String(g.key), value: typeof g.value === 'number' ? g.value : null }));
  return { spentBy: { metric: id, unit, groups, ...(b.spent === undefined ? { toward: true } : {}) } };
}

const currencyOfValue = (v: unknown): string | null =>
  typeof v === 'object' && v !== null && typeof (v as { currency?: unknown }).currency === 'string' ? (v as { currency: string }).currency : null;

/** Exported for the test that holds this engine against the kernel's over the seed. */
export function readBlock(b: PageBlock): BlockResult {
  {
    /* A BLOCK MAY BE SOURCED FROM A WALK, NOT ONLY A REGISTER. 05 §2 defers a `forecast` KIND to
       post-v1 and says the primitive layer is what exists so that it can be drawn without one, so
       this adds a source rather than a kind: `forecast.runway` fills an ordinary `table` with the
       cash walk. Nothing about the block is new, and the day a real `forecast` kind ships, the
       declaration that changes is the kind, not the query. */
    if (b.source === 'forecast.runway') return runwayBlock(b);
    if (b.source?.startsWith('metric.')) return partsBlock(b, b.source.slice('metric.'.length));
    if (b.kind === 'series') return seriesBlock(b);
    /* A FEED READS THE LEDGER and a diff reads one row's history, so neither is a register's rows. */
    if (b.source === 'activity') return activityBlock(b);
    /* WHAT IS WAITING ON A PERSON, which is the decide queue read onto a page. */
    if (b.source === 'governance.open') return openBlock(b);
    /* THE ONE-LINE ADD reads no rows, only what its `where:` fills a new one with. */
    if (b.kind === 'capture') return captureBlock(b);
    if (b.kind === 'diff') return diffBlock(b);
    /* THE RUNS WORKING NOW are `session`'s rows in the order the kernel's `sessionsLive` gives them,
       so a declared order would be a second answer to a question the source settles. */
    const live = b.source === 'sessions.live';
    if (live && b.order?.length) return computed(b, ['order: sessions.live comes the most recently seen first, so it takes no order:']);

    const register = live ? SESSION : b.source?.startsWith('register.') ? b.source.slice('register.'.length) : undefined;
    const all = live ? liveRuns() : register ? (ROWS[register] ?? []) : [];
    const { entries: matched, refusals, own } = register
      ? b.inherit === true
        ? inheritFor(register, all, b)
        : { ...filterForBlock(register, all, b), own: undefined }
      : { entries: [], refusals: [], own: undefined };

    /* WHAT THE DECLARATION SAID THAT THIS BUILD DOES NOT READ.
       Three shapes reached here and were answered with an empty block, which is the state reserved
       for "it asked and the answer was nothing":
         - a `source:` that resolves to neither a register nor the walk. 06 §1.1 documents
           `metric.<id>` and `block.<n>` and neither is implemented.
         - a field in `columns:` that the register does not declare. The same typo in `where:` says
           "there is no field called amounnt"; in `columns:` it drew a row of blank cells.
         - a key the type does not carry at all — `when:` is in 06 §1.1 and is not read anywhere.
       All three are the block's own error, so they go where `explain()` goes. */
    const said = [...refusals];
    if (b.source && !register) said.push(`source: ${b.source} is not a source this build reads. It reads register.<id>, forecast.runway, activity, governance.open and sessions.live`);
    if (register) {
      /* `seq` is a column and not a field: it is on the ROW rather than in its fields, and `toRows`
         renders it as `#4`. Any pack may name it, so it belongs in the set a column may resolve to
         even though no register declares it. */
      const declared = new Set(['seq', CHANGED, ...(REGISTERS[register]?.fields ?? []).map((f) => f.id)]);
      for (const c of b.columns ?? [])
        if (!declared.has(c.field)) said.push(`columns: there is no field called ${c.field} on ${register}`);
      said.push(...signFaults(register, b.columns));
      /* WHERE A ROW APPLIES IS THE SCOPE FIELD'S TO SAY, as the kernel checks it. */
      const scope = scopeFieldOf(register);
      for (const c of b.columns ?? [])
        if (c.as === 'scope' && c.field !== scope?.id)
          said.push(
            scope
              ? `columns: as: scope draws where a row applies, which ${register} says in ${scope.id}, not ${c.field}`
              : `columns: as: scope draws where a row applies, and ${register} has no field that says so`,
          );
    }
    for (const key of Object.keys(b))
      if (!READS.has(key)) said.push(`${key}: is not a key this build reads`);
    /* OUT OF DATE IS A DAY AND A WINDOW, as the record checks it. */
    if (b.stale !== undefined && register) {
      const type = decl(register, b.stale?.field ?? '')?.type;
      if ((type !== 'day' && type !== 'instant') || typeof b.stale?.after !== 'string' || windowMs(b.stale.after) === null)
        said.push(`stale: names a day field on ${register} and a window, such as { field: as_of, after: 7d }`);
    }
    /* `limit:` is a READING cap, not a query cap: it says how much of the answer fits on the page.
       The kinds that reduce are handed the whole answer (see `matched`), so a sum is a sum. */
    const entries = matched.slice(0, b.limit ?? 50);
    const columns = b.columns
      ? b.columns.map((c) => ({
          field: c.field,
          label: columnHeading(register ?? '', c),
          width: c.width ?? 'minmax(12ch,1fr)',
          align: c.align ?? 'start',
          /* A FIGURE NEVER TRUNCATES, AND WHICH COLUMNS ARE FIGURES IS THE REGISTER'S TO SAY.
             This asked the field's NAME and matched `amount` or `cost`, so `revenue` and `rate`,
             both declared money, were drawn as ordinary text, and a text field called `cost_centre`
             would have been drawn as a figure. The declared type is already in scope here: the same
             function reads `REGISTERS[register].fields` twelve lines above to name a column the
             register does not have, and `columnsFor` has asked the type since it was written
             (13 §4.2: a truncated figure is not shortened, it is wrong). A column over no register
             has no declared type to ask, so it truncates as the text it is being drawn as. */
          truncate: decl(register ?? '', c.field)?.type === 'money' ? ('never' as const) : ('end' as const),
          /* A card's role for this column. Without it every cards block fell back to the guessed roles.
             `scope` is not a role the renderer draws: it says what the cell holds, which is settled here. */
          ...(c.as === undefined || (c.as === 'scope' && b.kind !== 'cards') ? {} : { as: c.as === 'scope' ? ('fact' as const) : c.as }),
        }))
      : [];
    const rows = toRows(register ?? '', ringed(register, b, entries), columns, NOW);
    (b.columns ?? []).forEach((c, i) => {
      if (c.as !== 'scope') return;
      entries.forEach((e, n) => {
        const cells = rows[n]?.cells;
        if (cells) cells[i] = absent(e.fields[c.field]) ? EVERYWHERE : (cells[i] ?? null);
      });
    });
    if (register) markColumns(register, b.columns, entries, rows, (e) => provenanceOf(register, e));
    /* A BUDGET OR A GOAL IS SET AGAINST THE PARTS OF ITS FIGURE, read here as the record reads them beside the rows. */
    const figured = b.kind === 'progress' ? progressFigure(b, matched) : {};
    if (figured.refusal) said.push(figured.refusal);
    /* A RUN HOLDS ITS PROJECT AS A SPOKEN ID, and the kernel's page layer names it, so this does too. */
    if (live)
      (b.columns ?? []).forEach((c, i) => {
        if (c.field !== 'project') return;
        entries.forEach((e, n) => {
          const cells = rows[n]?.cells;
          if (cells) cells[i] = projectName(e.fields.project) ?? cells[i] ?? null;
        });
      });
    return {
      ...b,
      register,
      columns,
      entries,
      matched,
      refusals: said,
      rows,
      /* The kernel's own test of a run gone quiet, so the two hosts dim the same runs. */
      ...(live ? { quiet: entries.map((e) => isStale({ fields: e.fields as never, updated_at: e.created }, NOW)) } : {}),
      /* ALIGNED WITH THE ROWS, NOT WORKED OUT WHILE DRAWING THEM. The dot used to be decided inside
         `projectRows`, which reads the sample's own ledger, so a LIVE record drew no dot at all no
         matter what its agents were doing. Both engines answer the question now and the drawer only
         reads the answer. */
      ...(b.working === true && register ? { working_now: entries.map((e) => workingNow(register, e.seq)) } : {}),
      ...(own === undefined ? {} : { inherited: Math.max(0, entries.length - own) }),
      ...(figured.spentBy === undefined ? {} : { spentBy: figured.spentBy }),
      /* A KIND THAT REDUCES DRAWS THE WHOLE ANSWER, so it is never showing a slice of it. `bar`,
         `chips` and `gauge` iterate `matched` — every row — and apply `limit:` to their GROUPS; this
         counted `entries` for every kind alike, so the first author to write `limit: 5` on a bar
         over 38 rows would have got "Showing 5 of 38" above a chart containing all 38. No block in
         the seed declares one, which is the only reason it is not on screen today. */
      shown: REDUCES.has(b.kind) ? matched.length : entries.length,
      total: matched.length,
      drawn: b.drawn ?? drawnWhen(b),
      stale_at: new Date(NOW).toISOString(),
      metrics: b.cells?.map((c) => {
        const trend = c.trend === undefined ? undefined : trendOf(c.metric, c.trend);
        const note = c.note === undefined ? {} : { note: noteOf(c.note, (id) => (METRICS[id] ? metric(id).value : null)) };
        return { ...metric(c.metric), label: c.label, ...(trend ? { trend } : {}), ...note };
      }),
    };
  }
}

/**
 * HOW FAR ALONG EACH CARD IS FROM THE STEPS UNDER IT, where its ring's field is empty, as the record works it out
 * (`@braindog/kernel` `steps.ts`). Only what the cells are drawn from carries it; the rows themselves are not changed.
 */
function ringed(register: string | undefined, b: { kind: string; columns?: readonly { field: string; as?: string }[] }, entries: Entry[]): Entry[] {
  const ring = b.kind === 'cards' ? b.columns?.find((c) => c.as === 'ring')?.field : undefined;
  if (!register || !ring) return entries;
  const tally = new Map<string, { done: number; total: number }>();
  for (const [id, list] of Object.entries(REGISTERS)) {
    const of = list.steps ? list.fields.find((f) => f.id === list.steps!.of) : undefined;
    if (list.steps && of?.to === register) tallySteps(ROWS[id] ?? [], list.steps, tally);
  }
  if (tally.size === 0) return entries;
  return entries.map((e) => {
    const share = typeof e.fields[ring] === 'number' ? null : stepsPercent(tally.get(String(e.seq)));
    return share === null ? e : { ...e, fields: { ...e.fields, [ring]: share } };
  });
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

/** The mock's stand-in for a compiled `where:`. The real one is one JSON tree, seven consumers. */
function filterForBlock(register: string, entries: Entry[], b: PageBlock): { entries: Entry[]; refusals: string[] } {
  /* THE PREDICATE IS EVALUATED, not pattern-matched. This was five `String.includes` checks, and
     anything outside them passed every row through a filter that looked like it had worked — the
     one failure a declarative surface must not have, because the thing writing most of these
     declarations is an agent and an agent cannot see it. See `where.ts`. */
  /* Compiled ONCE, not per row: resolving fields, dates and enum values against the register is
     work that does not change between rows, and doing it inside the filter made it O(rows). */
  const predicate = b.where ? compile(register, b.where, NOW) : null;
  let out = predicate ? entries.filter((e) => matches(e, predicate, NOW)) : entries;

  /* THERE WERE TWO HIDDEN WINDOWS HERE, keyed on register-and-kind: a `timeline` over services
     dropped cancelled rows and anything past ninety days, and a `table` over tasks dropped done and
     dropped ones. The argument was that they are the kind's own default rather than a filter a
     reader chose. The argument is wrong, and it is wrong in the way this file spends most of its
     comments warning about: the same `where:` over the same register returned different rows
     depending on the kind, with nothing in the declaration saying so, and an agent asking a `table`
     for closed tasks got back `total: 0` and its own "nothing matched" sentence.

     Both are now written where they can be read, on the two declarations that wanted them, and both
     produce exactly the row counts the code did — 12 and 11. A default that cannot be seen is not a
     default, it is a second filter.

*/
  const order = b.order?.[0];
  return {
    entries: order ? sortRows(register, out, order.field, order.dir) : out,
    /* CARRIED OUT, not swallowed. A predicate that could not be understood matches nothing, which
       is the safe answer and an invisible one: the block drew a heading over a blank rectangle and
       whoever wrote the declaration — usually an agent — learned nothing. 10 §7's fourth rule is
       that the refusal is the teacher. */
    refusals: predicate ? explain(predicate) : [],
  };
}

/** The kernel's register of agent runs, which `sessions.live` reads. */
const SESSION = 'session';

/** The runs not in one of `session`'s `done` states, the most recently seen first: the kernel's `sessionsLive`. */
const liveRuns = (): Entry[] => {
  const done = new Set<string>(REGISTERS[SESSION]?.done ?? []);
  return (ROWS[SESSION] ?? [])
    .filter((e) => !done.has(String(e.fields.state ?? '')))
    .sort((a, z) => String(z.fields.last_seen ?? '').localeCompare(String(a.fields.last_seen ?? '')));
};

/** A spoken id as the ladder writes a run's project: `things#1`. */
const SPOKEN = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/** The title of the row a spoken id names, or `undefined` when it names none, so the id is kept as written. */
const projectName = (value: unknown): string | undefined => {
  const m = typeof value === 'string' ? SPOKEN.exec(value) : null;
  if (!m) return undefined;
  const title = REGISTERS[m[1]!]?.title;
  const name = title ? (ROWS[m[1]!] ?? []).find((e) => e.seq === Number(m[2]))?.fields[title] : undefined;
  return absent(name) ? undefined : String(name);
};

/** What a scope cell reads for a row that applies to every project. */
const EVERYWHERE = 'Everywhere';

const absent = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** The field that says where a register's rows apply, as `packages/kernel/src/scope.ts` finds it. */
const scopeFieldOf = (register: string): (FieldDecl & { scope?: { same?: string }; to?: string }) | undefined =>
  (REGISTERS[register]?.fields as (FieldDecl & { scope?: { same?: string }; retired?: boolean })[] | undefined)?.find(
    (f) => f.scope !== undefined && !f.retired,
  );

/**
 * A project's rows, then the rows that apply everywhere, as the kernel's `inScope` decides it: where
 * the register says the nearer wins, an open project row hides a global row of the same title.
 * `own` is how many of `entries`, at the front, are the project's.
 */
function inheritFor(register: string, all: Entry[], b: PageBlock): { entries: Entry[]; refusals: string[]; own: number } {
  const none = (refusal: string) => ({ entries: [], refusals: [refusal], own: 0 });
  const decl = REGISTERS[register];
  const scope = scopeFieldOf(register);
  if (!decl || !scope) return none(`inherit: ${register} has no field that says where its rows apply, so there is nothing to inherit`);
  const w = compile(register, b.where, NOW);
  if (w.bad.length) return { entries: [], refusals: explain(w), own: 0 };
  const home = w.clauses.find((c): c is Extract<typeof c, { values: string[] }> => c.field === scope.id && c.op === 'is' && c.values.length === 1);
  if (!home) return none(`where: a block that inherits names its project, as ${scope.id} is <project>`);

  const said = home.values[0]!.trim().toLowerCase();
  const projects = scope.to ? (ROWS[scope.to] ?? []) : [];
  const projectTitle = scope.to ? REGISTERS[scope.to]?.title : undefined;
  const project = projects.find((p) => String(p.seq) === said || String(p.fields[projectTitle ?? ''] ?? '').toLowerCase() === said);
  const at = (e: Entry): boolean => {
    const v = e.fields[scope.id];
    return project !== undefined && (Array.isArray(v) ? v.includes(project.seq) : v === project.seq);
  };

  const title = decl.title ?? '';
  const done = new Set<string>(decl.done ?? []);
  const open = (e: Entry): boolean => !done.has(String(e.fields[decl.state ?? ''] ?? ''));
  const claimed = new Set(scope.scope?.same === 'nearer' ? all.filter((e) => at(e) && open(e)).map((e) => String(e.fields[title] ?? '')) : []);
  const rest = { ...w, clauses: w.clauses.filter((c) => c !== home) };

  const order = b.order?.[0];
  const sorted = (list: Entry[]) => (order ? sortRows(register, list, order.field, order.dir ?? 'asc') : list);
  const own = sorted(all.filter((e) => at(e) && matches(e, rest, NOW)));
  const global = sorted(all.filter((e) => absent(e.fields[scope.id]) && matches(e, rest, NOW) && !claimed.has(String(e.fields[title] ?? ''))));
  return { entries: [...own, ...global], refusals: [], own: own.length };
}

/**
 * A `bar` or a `split` over a grouped figure, as the record's `metricBlock` reads it: the figure's parts.
 *
 * A PART MAY BE A MONTHLY SHARE OF A YEARLY COST, which a sum over the rows cannot be. A date cut into buckets is a
 * series and not parts of a whole, so only a figure grouped by a word is drawn this way.
 */
function partsBlock(b: PageBlock, id: string): BlockResult {
  if (b.kind !== 'bar' && b.kind !== 'split') return computed(b, [`source: a ${b.kind} does not read a figure yet; a bar or a split does`]);
  const decl = METRICS[id];
  if (!decl) return computed(b, [`source: there is no metric called ${id}`]);
  if (typeof decl.group_by !== 'string' || decl.bucket !== undefined)
    return computed(b, [`source: a ${b.kind} over a figure draws its parts, so ${id} groups by a word, and a date cut into buckets is a series`]);
  const r = read(decl, NOW);
  if (r.refusals.length) return computed(b, r.refusals);
  const groups = (r.groups ?? []).map((g) => ({ key: g.key, value: g.value, ...(g.parts ? { parts: g.parts } : {}) }));
  return { ...computed(b, []), parts: { metric: id, value: r.value, groups, more: r.more ?? 0, unit: r.unit ?? null }, shown: groups.length, total: groups.length };
}

/** The shell every block that is not a register's rows returns, so each says only what it adds. */
const computed =(b: PageBlock, refusals: string[]): BlockResult => ({
  ...b,
  register: undefined,
  columns: [],
  entries: [],
  matched: [],
  refusals,
  rows: [],
  shown: 0,
  total: 0,
  drawn: b.drawn ?? drawnWhen(b),
  stale_at: new Date(NOW).toISOString(),
  metrics: undefined,
});

/**
 * A `capture` over `register:`, as the sample answers it: the list a new row goes into, and what its `where:` fills
 * that row with.
 *
 * `inheritedFrom` AND NOT A SECOND COPY OF IT. The register grid's add already decides what a line typed under a
 * filter inherits, and each of its exclusions is written out there; a page's capture is the same line under the same
 * filter, so it asks the same function. The kernel's `captureBlock` answers from its own parse of the sentence, and
 * `capture-block.test.ts` holds the two to one answer over the seed.
 *
 * THE FILTER IS STILL READ, so a `where:` naming a field the list lacks is refused on the block, as the record
 * refuses it, rather than quietly filling nothing.
 */
function captureBlock(b: PageBlock): BlockResult {
  const register = (b as PageBlock & { register?: unknown }).register;
  if (typeof register !== 'string' || register === '') return computed(b, ['register: a capture names the list it adds to, as register: tasks']);
  if (!REGISTERS[register]) return computed(b, [`register: there is no register called ${register}, so a capture has nowhere to add to`]);
  /* AT THE SAMPLE'S CLOCK, as every other read in this file: a range of one written-out day and one relative word is put
     in order at the clock it is given, and the wall clock refused `by between today and 2026-09-20` here on the 25th
     while the kernel, opened at the same 3 September as these rows, filled the task (`capture-block.test.ts`). */
  const where = compile(register, b.where, NOW);
  const said = explain(where);
  if (said.length) return { ...computed(b, said), register };
  const filters: Filter[] = where.clauses.flatMap((c) => (c.op === 'is' && 'values' in c ? [{ field: c.field, op: c.op, values: c.values }] : []));
  /* EVERY VALUE `inheritedFrom` WRITES IS A STRING, an enum's or a text's, and `Fields` is the wider type of a whole row. */
  const fills = Object.fromEntries(Object.entries(inheritedFrom(register, filters)).map(([field, value]) => [field, String(value)]));
  return { ...computed(b, []), register, fills };
}

/**
 * The questions still open, as a `queue` block reads them: the sample's own decide queue, which is the
 * same list `/decide` draws, in the same order.
 *
 * ONE ANSWER AND NOT A SECOND ONE. The kernel's `openBlock` is the real evaluator; this is the sample's
 * copy, and it is here for the reason every other branch in this file is: the demo has no record behind
 * it, and a page that drew nothing without one would make the kind unreviewable. The two are held
 * against each other in `engines.test.ts`.
 *
 * `slash` IS WHO OPENED THEM, because the sample's proposals are all Slash's (`PROPOSALS`), and the
 * `Question` it keeps carries no author of its own.
 */
function openBlock(b: PageBlock): BlockResult {
  if (b.order?.length) return computed(b, ['order: governance.open comes ranked by what each question would cost to get wrong, so it takes no order:']);
  const limit = Math.min(20, Math.max(1, Math.floor(b.limit ?? 3)));
  /* DEAREST FIRST, AND FROM THE SAME FUNCTION THE RECORD USES. `QUEUE` is sorted by the fixture's own
     hand-written `rank`, which is what makes the sample read like a real morning; the band is computed
     from the proposal's body where there is one, so the sample's order and the record's are one rule
     and not two. A question the fixture wrote with no body behind it is a judgement, which is what
     those questions are (`weigh.ts`). */
  const open = QUEUE.filter((q) => q.decided === undefined);
  const band = (q: Question): Cost => costOf(PROPOSALS[q.id]?.kind ?? 'options', PROPOSALS[q.id]?.body);
  const queue = open
    .slice()
    .sort((x, y) => costRank(band(x)) - costRank(band(y)) || x.opened.localeCompare(y.opened) || x.id.localeCompare(y.id))
    .slice(0, limit)
    .map((q) => ({
      id: q.id,
      who: 'slash',
      at: q.opened,
      kind: PROPOSALS[q.id]?.kind ?? 'options',
      question: q.title,
      why: q.context ?? q.cost,
      cost: band(q),
      options: q.options.map((o) => ({ key: o.key, label: o.title, because: o.body, recommended: o.recommended === true })),
    }));
  return { ...computed(b, []), queue, shown: queue.length, total: open.length };
}

/** The kinds of actor a feed groups by, the kernel's `FEED_BY`. */
const FEED_KINDS: readonly string[] = ['agent', 'rule', 'you'];

/** The kind of actor behind a ledger event, the kernel's `byOf` over this build's spelling of actors. */
const feedByOf = (by: string): FeedRow['by'] => (by === 'you' ? 'you' : /^rule[.:]/.test(by) || by === 'system' ? 'rule' : 'agent');

/**
 * A feed over the ledger: a run of events by one actor, of one kind, on one row is one row with a
 * count, and past `first:` rows a group's remainder is one row. The kernel's `feedRows`, mirrored.
 */
function activityBlock(b: PageBlock): BlockResult {
  /* THE THREE THINGS A FEED'S `where:` MAY ASK, each `is` or `is not`, joined by `and`. */
  type Asked = { actor: string; kind: string; target: string };
  const tests: ((e: Asked) => boolean)[] = [];
  const bad: string[] = [];
  for (const part of (b.where ?? '').split(/\s+and\s+/i).filter((p) => p.trim())) {
    const m = /^\s*(actor|kind|target)\s+is(\s+not)?\s+(.+?)\s*$/i.exec(part);
    if (!m) {
      bad.push(`where: a feed asks about actor, kind or target, and "${part.trim()}" is none of them`);
      continue;
    }
    const field = m[1]!.toLowerCase() as keyof Asked;
    const values = m[3]!.split(/\s+or\s+|,\s*/i).map((v) => v.trim());
    if (field === 'actor' && values.some((v) => !FEED_KINDS.includes(v))) bad.push('where: an actor is agent, rule or you');
    const negate = m[2] !== undefined;
    tests.push((e) => values.includes(e[field]) !== negate);
  }
  if (bad.length) return computed(b, bad);

  const kept = AUDIT.filter((e) => tests.every((t) => t({ actor: feedByOf(e.by), kind: e.kind, target: e.target ?? '' })));
  /* AN `agents` BLOCK IS THE AGENTS' WORK, one group per agent, each keeping its own rest past `first:`. The kernel's `agentRows`, mirrored. */
  if (b.kind === 'agents') {
    const theirs = kept.filter((e) => feedByOf(e.by) === 'agent');
    const named = (target: string | null): string | null => {
      const m = target === null ? null : /^([a-z][a-z0-9_]*)#([0-9]+)$/u.exec(target);
      const title = m ? REGISTERS[m[1]!]?.title : undefined;
      const row = m && title ? (ROWS[m[1]!] ?? []).find((e) => e.seq === Number(m[2])) : undefined;
      const said = row && title ? row.fields[title] : undefined;
      return typeof said === 'string' && said !== '' ? said : target;
    };
    const rows: FeedRow[] = [];
    for (const e of theirs) {
      const last = rows.at(-1);
      if (last && last.who === e.by && last.kind === e.kind && last.target === (e.target ?? null)) last.count += 1;
      else rows.push({ by: 'agent', who: e.by, count: 1, kind: e.kind, target: e.target ?? null, note: e.note ?? null, at: e.at, thing: named(e.target ?? null) });
    }
    const feed = agentsCut(rows, b.first);
    return { ...computed(b, []), feed, ...agentsTable(feed, NOW), total: theirs.length };
  }
  const bursts: FeedRow[] = [];
  for (const e of kept) {
    const last = bursts.at(-1);
    if (last && last.who === e.by && last.kind === e.kind && last.target === (e.target ?? null)) last.count += 1;
    else bursts.push({ by: feedByOf(e.by), who: e.by, count: 1, kind: e.kind, target: e.target ?? null, note: e.note ?? null, at: e.at });
  }
  let feed = bursts;
  if (b.first !== undefined) {
    const cap = Math.min(50, Math.max(1, Math.floor(b.first)));
    const taken = new Map<string, number>();
    const rest = new Map<string, FeedRow>();
    feed = [];
    for (const row of bursts) {
      const n = taken.get(row.by) ?? 0;
      taken.set(row.by, n + 1);
      if (n < cap) feed.push(row);
      else {
        const folded = rest.get(row.by);
        if (folded) folded.count += row.count;
        else rest.set(row.by, { by: row.by, who: null, count: row.count, kind: null, target: null, note: null, at: row.at });
      }
    }
    feed.push(...rest.values());
  }
  /* A DEMO READER HAS NO READ MARK, so the seen row carries no time: the renderer's "not looked yet". */
  return {
    ...computed(b, []),
    feed,
    ...(b.since === 'seen' ? { seen: null } : {}),
    ...feedTable(feed, b.since === 'seen', null, NOW),
    total: kept.length,
  };
}

/** Past `first` rows, one agent's remainder as one row that keeps its name, so no count is lost. */
export function agentsCut(rows: readonly FeedRow[], first: number | undefined): FeedRow[] {
  if (first === undefined) return [...rows];
  const cap = Math.min(50, Math.max(1, Math.floor(first)));
  const kept: FeedRow[] = [];
  const taken = new Map<string, number>();
  const rest = new Map<string, FeedRow>();
  for (const row of rows) {
    const who = row.who ?? '';
    const n = taken.get(who) ?? 0;
    taken.set(who, n + 1);
    if (n < cap) kept.push(row);
    else {
      const folded = rest.get(who);
      if (folded) folded.count += row.count;
      else rest.set(who, { ...row, kind: null, target: null, note: null, thing: null });
    }
  }
  return [...kept, ...rest.values()];
}

/**
 * A diff over one row's text field. THIS BUILD KEEPS NO FIELD HISTORY, so a row has one version, the
 * one it holds, and the block draws that version with nothing to compare it to.
 */
function diffBlock(b: PageBlock): BlockResult {
  const register = b.source?.startsWith('register.') ? b.source.slice('register.'.length) : undefined;
  if (!register || !REGISTERS[register]) return computed(b, [`source: ${b.source ?? ''} is not a register this build holds`]);
  if (!b.row) return computed(b, ['row: a diff names the row whose history it reads, as row: skills#2']);
  if (!b.field) return computed(b, ['field: a diff names the field it compares, as field: body']);
  const decl = REGISTERS[register]!.fields.find((f) => f.id === b.field);
  if (!decl) return computed(b, [`field: there is no field called ${b.field} on ${register}`]);
  if (decl.type !== 'document' && decl.type !== 'text') return computed(b, [`field: a diff compares text, and ${b.field} is ${decl.type}`]);
  const seq = Number(/(\d+)$/.exec(b.row)?.[1]);
  const row = (ROWS[register] ?? []).find((e) => e.seq === seq);
  if (!row) return computed(b, [`row: ${b.row} is not a row of ${register}`]);
  const text = row.fields[b.field];
  const history = typeof text === 'string' ? [{ at: row.created, by: row.by, text }] : [];
  return {
    ...computed(b, []),
    history,
    ...historyTable(history, history.length),
  };
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
 * AND THE MOCK RECOMPUTES THE FILTER PER PAGE, which the real record does not. That is worth saying
 * plainly rather than hiding: this is a fidelity exercise in the SHAPE of the answer, not in its
 * cost. Its value is that it forces the head count, `⌘a`, the sort chips and the empty states to be
 * written against a PARTIAL answer — which is what `call('list', …)` will return, and what none of
 * them assumed while this returned everything.
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
  const all = ROWS[register] ?? [];
  const filtered = applyFilters(register, all, opts.filters ?? [], opts.q, opts.join);
  const sorted = opts.sort ? sortRows(register, filtered, opts.sort.field, opts.sort.dir) : filtered;
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

/** Who changed a row last and when, in the sample: the newest thing said about it or done to it, or who wrote it. */
function provenanceOf(register: string, e: Entry): { by: string; at: string } {
  const href = `/r/${register}/${e.seq}`;
  const target = `${register}#${e.seq}`;
  /* THE LEDGER TOO, because an agent's edit is written there whether or not it made the news. */
  const said = [...NEWS.filter((n) => n.href === href), ...AUDIT.filter((a) => a.target === target)].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return said ? { by: said.by, at: said.at } : { by: e.by, at: e.created };
}

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
      questions.push({ title: q2.title, detail: q2.decided ? 'Decided' : 'Open question', href: `/decide/${q2.id}`, kind: 'Decide', icon: 'decide', spoken: q2.id });
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
