/**
 * The record checks its own words: `textFaults` (READ+), PGS-B15 job a. It walks every page and every document field of
 * every list (`text-check.ts`) and answers `{ count, line, faults }`, the line being the one sentence ("14 values on 6
 * pages name nothing") and each fault its place and its fix.
 *
 * THE WALK IS THE NIGHT'S, AND A READ WALKS NOTHING. The record's night pass (`lintTick`) runs it once a day as the
 * system, keeps the answer with the time it was found (`keepTextFaults`), and a reader of the whole record is handed that
 * answer back at once. It took 10 s to draw the pages on every open after a write, and the record answers one call at a
 * time. A write does not drop the kept answer: it is the night's, and `computedAt` says when.
 *
 * A COUNT BOUNDS EVERY WALK, NEVER THE CLOCK. A Worker's clock stands still while synchronous code runs, so a time limit
 * never fires there (`page-lint.ts`). A walk reads at most `Budget.pages` pages and `Budget.rows` document rows, and
 * `truncated` says when it stopped short. On the Cloud the night's walk is also cut into shares of an alarm
 * (`keepTextFaultsStep`): it was one step of its own, uncapped, after the lint (F35). A reader the night's answer is
 * not true for (a grant held to some lists or rows, rows private to somebody else) gets a small walk of its own, `DAY`,
 * and the kept answer is never cut to them.
 *
 * NO SECOND SCANNER. Which paths name nothing is the kernel's answer: a page's blocks carry `unnamed`, and a document
 * off any page is read as a note block over its own row (`kernel.block` with `here`), as `checkPaths` reads one. A
 * page's blocks are held from the caller exactly when the census holds them, so a fault never names a path of a list
 * they cannot open, and a path over such a list is said as naming nothing, which is what their page shows.
 *
 * EACH FAULT CARRIES ITS ADDRESS (`at`) beside its names: the page's slug, or for a document drawn on no page its list's
 * id and its entry's number, so the app opens the place without matching a name.
 *
 * A DOCUMENT IS FOUND ONCE. A row's note drawn on the row's page is the same words twice, so the page's part is left
 * out and the document's fault names the page it is drawn on.
 *
 * THE READ WRITES NOTHING. It files no question; the question and the three times it runs are job b's (`index.ts`).
 */

import { sourceReadsWhole, viewerOfRead, type BlockResult, type Entry, type PageBlock, type PageResult } from '@braindog/kernel';
import type { Result } from '@braindog/ports';
import { TYPED } from 'braindog-render';

import { ROUND_HOLDER, ROUND_KEPT, ROUND_PAGES, keptRoundIn, pagesToLint, type KeptFinding } from '../page-lint.ts';
import type { TickBudget } from '../tick-budget.ts';
import { hostSourcesOf } from '../sources/index.ts';
import { textFaultLine, textFaults, type LongText, type TextFault, type TextPage, type TextPart } from '../text-check.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What `textFaults` answers: how many faults, the one sentence, the first `FAULTS_MOST` of them, and when they were found. */
export type TextFaultsRead = { count: number; pages: number; line: string; faults: TextFault[]; truncated: boolean; computedAt: string | null; printed?: Printed };

/**
 * WHAT THE PAGES PRINT RAW, EVERY FINDING OF THE NIGHT'S PAGE LINT: the sign `pages-clean` carries six of them, and
 * this is the whole round (`keptRound` in `page-lint.ts`), handed only to a reader of the whole record, with when it ran,
 * how many pages it read and how many it did not reach. Absent before the first round.
 */
export type Printed = { at: string; pages: number; unread: number; findings: KeptFinding[]; cut: string[] };

/** The most faults one answer carries. The count and the sentence are over all of them. */
export const FAULTS_MOST = 100;
/** The most rows one list is read for its documents, so a list of a hundred thousand notes cannot hold the host. */
export const TEXT_ROWS_MOST = 2_000;

/** What one walk may read, in counts: pages drawn, and document rows read over every list. */
export type Budget = { pages: number; rows: number };
/** The night's walk: the page lint's round (`ROUND_PAGES`), and ten thousand document rows. */
export const NIGHT: Budget = { pages: ROUND_PAGES, rows: 10_000 };
/** A walk in the day, for a reader the night's answer is not true for: a few pages and rows, never more. */
export const DAY: Budget = { pages: 12, rows: 300 };

/** How long a day walk's answer is kept for the same caller at the same version. */
export const KEPT_MS = 300_000;
/** The most callers kept at once; past it the oldest is dropped. */
const KEPT_MOST = 16;

const DAY_MS = 86_400_000;

/** Where the night's answer is kept: a pref of its own, so the pref reads the briefing makes never parse it. */
export const HOLDER = 'braindog:text-faults';
const KEPT = 'kept';

/** The night's answer as kept: when it was found, and what was found. */
export type TextFaultsKept = { at: number; value: Omit<TextFaultsRead, 'computedAt'> };

/** What a reader of the whole record is told before the night has run once. */
const NOT_YET: TextFaultsRead = { count: 0, pages: 0, line: '', faults: [], truncated: false, computedAt: null };

/** The words before a colon that are forms and never a figure's name. */
const NOT_FIGURES: ReadonlySet<string> = new Set([...TYPED, 'bad', 'icon']);

/** A field as a person says it when it carries no label: `effort_days` as "Effort days". */
const words = (id: string): string => {
  const w = id.replace(/[-_.]+/g, ' ').trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** The kept answer as the pref holds it, or `null` when none is there or it is not in shape. */
const keptIn = (stored: unknown): TextFaultsKept | null => {
  const k = stored as { at?: unknown; value?: unknown } | null | undefined;
  const v = k?.value as { count?: unknown; faults?: unknown; line?: unknown } | null | undefined;
  if (typeof k?.at !== 'number' || !Number.isFinite(k.at) || v === null || typeof v !== 'object') return null;
  return typeof v.count === 'number' && typeof v.line === 'string' && Array.isArray(v.faults) ? (k as TextFaultsKept) : null;
};

const toRead = (k: TextFaultsKept): TextFaultsRead => ({ ...k.value, computedAt: new Date(k.at).toISOString() });

/** The walk and its keeper, over the record's own deps. `methods` below is its READ+ door; `lintTick` calls `keep`. */
function walker(deps: RecordDeps) {
  const { kernel, readable, sql, clock } = deps;

  /** Whether the caller reads the record whole, as the census asks it. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*') && Object.keys(ctx.wheres ?? {}).length === 0;
  };
  const everyList = (ctx: CallContext): boolean =>
    deps.readsEveryList?.(ctx) ?? (whole(ctx) && Object.keys(ctx.levels ?? {}).every((list) => readable(ctx, list) === null));

  /** Whether the night's walk, made as the system, is what this caller would see: every list, every row. */
  const shared = (ctx: CallContext): boolean => whole(ctx) && everyList(ctx) && !kernel.anyHiddenFrom(viewerOfRead(ctx));

  /** The lists a block reads, as the kernel names them: over the call's one walk (`pageWalk`), so declarations are read once. */
  type Lists = (block: PageBlock) => string[];
  /** The call's one walk over the pages, blocks and lists (`kernel.pageWalk`). */
  type Walk = ReturnType<typeof kernel.pageWalk>;

  /** Whether a block is held from the caller, as the census holds it, so its words are not read for them. */
  const heldFrom = (ctx: CallContext, b: BlockResult, listsOf: Lists): boolean => {
    const lists = listsOf(b as unknown as PageBlock);
    const source = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
    return (
      (sourceReadsWhole(b.source, hostSourcesOf({ kernel, ctx, readable })) && !(String(b.source).startsWith('governance.') ? everyList(ctx) : whole(ctx))) ||
      lists.some((id) => readable(ctx, id) !== null) ||
      lists.some((id) => id !== source && Object.hasOwn(ctx.wheres ?? {}, id))
    );
  };

  /** Whether a path reads a list the caller may not, which names nothing to them. */
  const hidden = (ctx: CallContext, path: string, listsOf: Lists): boolean =>
    listsOf({ kind: 'note', body: `{{${path}}}` } as unknown as PageBlock).some((id) => readable(ctx, id) !== null);

  /** When a page's declaration was last written, as milliseconds, or `null` when it cannot be read. */
  const writtenAt = (page: string): number | null => {
    try {
      const row = sql.one<{ created_at: string }>(
        "SELECT created_at FROM declaration WHERE id = ? AND kind = 'page' AND superseded_at IS NULL AND retired = 0",
        `page.${page}`,
      );
      const at = row ? Date.parse(row.created_at) : Number.NaN;
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  };

  /** What a walk has left to read, and whether it stopped short of the end. */
  type Left = { rows: number; cut: boolean };

  /**
   * Every document field of every list the caller may read, each with the paths in it that name nothing to them. A row
   * is read through the caller's own grant on the list (`whereFor`), so a member held to some rows reads only those.
   *
   * A WALK IN STEPS, A GENERATOR: it yields after each batch of rows it lists and each document it reads, with what that
   * cost (`ROWS_COST`, `DOC_COST`), so the night's walk in an alarm stops where its share is spent and goes on in the
   * next (`keepTextFaultsStep`). The walk it reads through is the holder's, handed a fresh one for every alarm.
   */
  function* documents(ctx: CallContext, left: Left, held: Held): Generator<number, (LongText & { key: string })[]> {
    const out: (LongText & { key: string })[] = [];
    for (const [id, list] of kernel.registers()) {
      if (readable(ctx, id) !== null) continue;
      const docs = list.fields.filter((f) => f.type === 'document' && !f.retired);
      if (docs.length === 0) continue;
      const own = list.fields.filter((f) => !f.retired).map((f) => f.id);
      const ownLists = list.fields.filter((f) => f.type === 'list').map((f) => f.id);
      const rule = kernel.scope(ctx, id);
      let read = 0;
      for (let cursor: string | null | undefined; cursor !== null; ) {
        /* A COUNT AND NOT THE CLOCK: more rows are there, and the budget says no. */
        if (read >= TEXT_ROWS_MOST || left.rows <= 0) {
          left.cut = true;
          break;
        }
        const limit = Math.min(500, TEXT_ROWS_MOST - read, left.rows);
        const got = kernel.list({ register: id, limit, reads: (other: string) => readable(ctx, other) === null, ...(cursor ? { cursor } : {}) }, rule);
        yield ROWS_COST;
        if (!got.ok) break;
        for (const row of got.value.rows as Entry[]) {
          read += 1;
          left.rows -= 1;
          const title = row.fields[list.title];
          const name = typeof title === 'string' && title.trim() !== '' ? title.trim() : 'Untitled';
          for (const f of docs) {
            const text = row.fields[f.id];
            if (typeof text !== 'string' || (!text.includes('{{') && !/^(?:`{3,}|~{3,})/m.test(text))) continue;
            let unnamed: string[];
            try {
              unnamed = held.walk.block({ kind: 'note', body: text } as unknown as PageBlock, { here: row }).unnamed ?? [];
            } catch {
              unnamed = [];
            }
            const paths = [...text.replace(/`[^`]*`/g, ' ').matchAll(/\{\{([^{}:]*)\}\}/g)].map((m) => (m[1] ?? '').trim());
            const shut = paths.filter((p) => !own.includes(p) && !unnamed.includes(p) && hidden(ctx, p, held.walk.blockRegisters));
            out.push({
              key: `${id}#${row.seq}`, ...(typeof row.seq === 'number' ? { at: { list: id, seq: row.seq } } : {}), list: list.name, row: name, field: f.label?.trim() || words(f.id), text,
              unnamed: [...unnamed.filter((p) => !own.includes(p)), ...shut], own, ownLists,
            });
            yield DOC_COST;
          }
        }
        cursor = got.value.cursor;
      }
    }
    return out;
  }

  /** The names the caller may be told of: the figures, and each list they read with its count and its states. */
  const namesFor = (ctx: CallContext, texts: readonly string[], walk: Walk) => {
    const all: string[] = [];
    const states: Record<string, string[]> = {};
    for (const [id, list] of kernel.registers()) {
      if (readable(ctx, id) !== null) continue;
      const state = list.state === undefined ? undefined : list.fields.find((f) => f.id === list.state);
      states[id] = [...(state?.values ?? [])];
      all.push(id, `${id}.count`, ...states[id]!.map((v) => `${id}.${v}`));
    }
    const declared = kernel.declarations().filter((d) => d.kind === 'metric').map((d) => d.id.slice('metric.'.length));
    /* A FIGURE ASKED WITH ITS PARAMETER, `{{plan-left:Flat}}`: a built-in one is asked of the kernel, once a word. */
    const asked = new Set(texts.flatMap((t) => [...t.matchAll(/\{\{\s*([a-z][a-z0-9_-]*)\s*:/g)].map((m) => m[1]!)).filter((w) => !NOT_FIGURES.has(w)));
    const built = [...asked].filter((w) => !declared.includes(w) && (walk.block({ kind: 'note', body: `{{${w}}}` } as unknown as PageBlock).unnamed ?? []).length === 0);
    const figures = [...declared, ...built].filter((f) => !hidden(ctx, f, walk.blockRegisters));
    return { all: [...all, ...figures], figures, states };
  };

  /**
   * The pages the caller may open, in the page lint's order and up to the budget's count, each as its parts: a heading and
   * a document per block it draws and does not hold from them. A part that is a document already gathered for the row
   * the page is about is left out, and that document is told the page's title.
   */
  function* pagesFor(ctx: CallContext, docs: (LongText & { key: string })[], budget: Budget, left: Left, held: Held): Generator<number, TextPage[]> {
    const opens = (p: { registers: string[]; about: { register: string } | null }): boolean =>
      (p.registers.length === 0 || p.registers.some((id) => readable(ctx, id) === null)) && (p.about === null || readable(ctx, p.about.register) === null);
    const listed = kernel.pages().filter(opens);
    const out: TextPage[] = [];
    let drawn = 0;
    for (const p of pagesToLint(listed)) {
      if (drawn >= budget.pages) {
        left.cut = true;
        break;
      }
      drawn += 1;
      let answer: PageResult;
      try {
        const got = held.walk.page(p.slug);
        if (!got.ok) continue;
        answer = got.value;
      } catch {
        continue;
      } finally {
        yield PAGE_COST;
      }
      const key = p.about ? `${p.about.register}#${p.about.seq}` : null;
      const mine = key === null ? [] : docs.filter((d) => d.key === key);
      const pinned = new Set(answer.look?.pinned ?? []);
      /* A PINNED NOTE'S AGE is the later of when the page was written and when the thing it is about last changed. */
      const at = Math.max(writtenAt(p.template ?? p.slug) ?? 0, p.about?.updated_at ? Date.parse(p.about.updated_at) || 0 : 0);
      const days = at > 0 ? Math.floor((clock.now() - at) / DAY_MS) : null;
      const parts: TextPart[] = [];
      for (const b of answer.blocks) {
        if (b.drawn === false || heldFrom(ctx, b, held.walk.blockRegisters)) continue;
        const name = typeof b.heading === 'string' && b.heading.trim() !== '' ? b.heading.trim() : answer.title;
        const unnamed = [...(b.unnamed ?? [])];
        if (typeof b.heading === 'string' && b.heading.includes('{{')) parts.push({ name, text: b.heading, unnamed, page: true });
        const body = (b as { body?: unknown }).body;
        if (typeof body !== 'string' || body.trim() === '') continue;
        const doc = mine.find((d) => body.includes(d.text));
        if (doc) {
          doc.onPage = answer.title;
          doc.at = { slug: p.slug };
          doc.page = true;
        }
        /* WHAT THE PAGE SAYS AROUND THE DOCUMENT is still the page's own words. */
        const text = doc ? body.replace(doc.text, ' ') : body;
        if (text.trim() === '') continue;
        const pin = b.kind === 'note' && typeof b.key === 'string' && pinned.has(b.key) && days !== null ? { pinned: { days } } : {};
        parts.push({ name, text, unnamed, page: true, ...pin });
      }
      out.push({ title: answer.title, slug: p.slug, parts });
    }
    return out;
  }

  /**
   * ONE WALK FOR THE CALL (`pageWalk`): a figure two pages read is read once, and so is every declaration the lists of a
   * block are named from. It writes nothing, so nothing it kept can change under it; a walk in steps is handed a fresh
   * one for each alarm (`Held`), since the record may be written between two.
   */
  const pageWalkFor = (ctx: CallContext): Walk => kernel.pageWalk({ hostSources: hostSourcesOf({ kernel, ctx, readable }), viewer: viewerOfRead(ctx) });

  /** One walk for this caller within the budget, in steps: every fault in the pages and documents they may read. */
  function* walking(ctx: CallContext, budget: Budget, held: Held): Generator<number, Omit<TextFaultsRead, 'computedAt'>> {
    const left: Left = { rows: budget.rows, cut: false };
    const docs = yield* documents(ctx, left, held);
    const pages = yield* pagesFor(ctx, docs, budget, left, held);
    const names = namesFor(ctx, [...docs.map((d) => d.text), ...pages.flatMap((p) => p.parts.map((x) => x.text))], held.walk);
    const found = textFaults(pages, docs.map(({ key: _key, ...d }) => d), names);
    return {
      count: found.faults.length,
      pages: found.pages,
      line: textFaultLine(found),
      faults: found.faults.slice(0, FAULTS_MOST),
      truncated: found.faults.length > FAULTS_MOST || left.cut,
    };
  }

  /** One walk for this caller within the budget, in one go. */
  const walk = (ctx: CallContext, budget: Budget): Omit<TextFaultsRead, 'computedAt'> => {
    const gen = walking(ctx, budget, { walk: pageWalkFor(ctx) });
    for (;;) {
      const step = gen.next();
      if (step.done === true) return step.value;
    }
  };

  /** The night's answer as kept, or `null` before the first night. */
  const night = (): TextFaultsKept | null => keptIn(kernel.prefsOf(HOLDER)[KEPT]);

  const SIGNS: CallContext = { principal: { kind: 'system', id: 'signs' } };

  return {
    shared,
    walk,
    night,
    /** The night's walk, made as the system and kept with its time. Called by `lintTick` and nothing else. */
    keep(): TextFaultsRead {
      const at = clock.now();
      const value = walk(SIGNS, NIGHT);
      kernel.setPref(HOLDER, KEPT, { at, value } satisfies TextFaultsKept);
      return toRead({ at, value });
    },
    /**
     * The night's walk in steps, within `budget`, the walk under way kept in this object (`WORDS_RUNS`). Answers `true`
     * while there is more to walk; the answer is kept, with the time the walk began, when the last step ends.
     */
    keepStep(budget: TickBudget): boolean {
      let run = WORDS_RUNS.get(kernel);
      if (run === undefined) {
        const held: Held = { walk: pageWalkFor(SIGNS) };
        run = { at: clock.now(), held, steps: walking(SIGNS, NIGHT, held) };
        WORDS_RUNS.set(kernel, run);
      } else run.held.walk = pageWalkFor(SIGNS);
      for (;;) {
        let step: IteratorResult<number, Omit<TextFaultsRead, 'computedAt'>>;
        try {
          step = run.steps.next();
        } catch (e) {
          /* A WALK THAT THREW IS OVER: its steps are spent, and the last answer stands. */
          WORDS_RUNS.delete(kernel);
          throw e;
        }
        if (step.done === true) {
          WORDS_RUNS.delete(kernel);
          kernel.setPref(HOLDER, KEPT, { at: run.at, value: step.value } satisfies TextFaultsKept);
          return false;
        }
        budget.spend(step.value);
        if (budget.spent()) return true;
      }
    },
  };
}

/** The walk a step reads through, handed a fresh one for each alarm of a walk in steps. */
type Held = { walk: ReturnType<RecordDeps['kernel']['pageWalk']> };

/**
 * WHAT ONE STEP OF THE WORDS' WALK COSTS, in a tick's units (a page drawn is one, `TickBudget`): a page drawn, one batch
 * of up to 500 rows listed for their documents, and one document's words read as a note over its row. On his record the
 * walk was one tick of its own after the lint (F35), drawing up to `ROUND_PAGES` pages and reading every document at once.
 */
const PAGE_COST = 1;
const ROWS_COST = 0.5;
const DOC_COST = 0.1;

/**
 * THE NIGHT'S WALK UNDER WAY, per record (its kernel), kept in the object's memory between alarms: when it began, the
 * walk it reads through, and the steps left. An object that restarts begins again (`keepWords` in `index.ts` says how
 * often a day).
 */
const WORDS_RUNS = new WeakMap<object, { at: number; held: Held; steps: Generator<number, Omit<TextFaultsRead, 'computedAt'>> }>();

/** Whether the night's walk of this record is under way in this object (`keepTextFaultsStep`). */
export const textFaultsUnderway = (deps: Pick<RecordDeps, 'kernel'>): boolean => WORDS_RUNS.has(deps.kernel);

/** The night's walk, kept (see the header). */
export const keepTextFaults = (deps: RecordDeps): TextFaultsRead => walker(deps).keep();

/**
 * The night's walk, a share of it a tick (`TickBudget`): the walk under way goes on, or one begins, and `true` while
 * more is left. The answer is kept when it ends, as `keepTextFaults` keeps it.
 */
export const keepTextFaultsStep = (deps: RecordDeps, budget: TickBudget): boolean => walker(deps).keepStep(budget);

/**
 * The kept answer put away, so the next night pass finds nothing kept and walks again (an erasure names rows it held).
 * The page lint's kept round goes with it: a page a template made for a row is titled by that row.
 */
export const dropTextFaults = (deps: Pick<RecordDeps, 'kernel'>): void => {
  deps.kernel.setPref(HOLDER, KEPT, null);
  deps.kernel.setPref(ROUND_HOLDER, ROUND_KEPT, null);
};

export function methods(deps: RecordDeps) {
  const { scoped, kernel, clock, no } = deps;
  const read = walker(deps);

  /* THE LAST DAY WALK PER CALLER, with what it was true at: the record's version and its declarations. The same ask at
     the same version walks nothing; an install nobody is named for writes no event (`DeclaredBy` in the kernel), so the
     declarations' count, top and retired are read beside the version. */
  const kept = new Map<string, { stamp: string; at: number; value: TextFaultsRead }>();
  const stampOf = (): string => {
    let decl: unknown = null;
    try {
      decl = deps.sql.one('SELECT count(*) AS n, max(rowid) AS top, coalesce(sum(retired), 0) AS r, count(superseded_at) AS s FROM declaration');
    } catch {
      decl = clock.now();
    }
    return JSON.stringify([kernel.version(), decl]);
  };

  return {
    /**
     * `{}`: every fault in the words of the pages the caller may open and the documents of the lists they may read, as
     * `{ count, pages, line, faults, truncated, computedAt }`. The first `FAULTS_MOST` faults are carried, and the count
     * and the line are over all of them. A reader of the whole record is told what the night found and when
     * (`computedAt`, `null` before the first night); any other reader is walked a small `DAY` budget. READ+, held to
     * what the caller may read, and it writes nothing.
     */
    async textFaults(args: unknown, ctx: CallContext): Promise<Result<TextFaultsRead>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = args !== null && typeof args === 'object' ? Object.keys(args)[0] : undefined;
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes nothing.`, { at: extra, allowed: [] });
      if (read.shared(ctx)) {
        const night = read.night();
        const value = night === null ? NOT_YET : toRead(night);
        const round = keptRoundIn(kernel.prefsOf(ROUND_HOLDER)[ROUND_KEPT]);
        if (round === null) return { ok: true, value };
        const { at, ...rest } = round;
        return { ok: true, value: { ...value, printed: { at: new Date(at).toISOString(), ...rest } } };
      }
      const start = clock.now();
      const who = JSON.stringify([ctx.principal, ctx.registers ?? null, ctx.levels ?? null, ctx.wheres ?? null]);
      const stamp = stampOf();
      const was = kept.get(who);
      if (was !== undefined && was.stamp === stamp && start - was.at < KEPT_MS && start >= was.at) return { ok: true, value: was.value };
      const value: TextFaultsRead = { ...read.walk(ctx, DAY), computedAt: new Date(start).toISOString() };
      kept.delete(who);
      kept.set(who, { stamp, at: start, value });
      if (kept.size > KEPT_MOST) kept.delete(kept.keys().next().value!);
      return { ok: true, value };
    },
  };
}
