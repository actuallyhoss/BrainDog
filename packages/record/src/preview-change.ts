/**
 * `previewChange`: a whole change drawn before anybody accepts it, with every page it would make as it would stand.
 *
 * WHAT DECIDE COULD SHOW WAS ONE PAGE, OVER LISTS ALREADY THERE. `previewPage` draws one page body against the record as
 * it is, so a change that brings its own lists, figures and rules beside its pages could not be drawn at all: the lint
 * refuses a page whose `requires` names a list nobody installed, and a template was drawn as written, `{{name}}` and
 * all, never over a row (`packages/mcp/test/compose-page.test.ts` measured both). An agent filed a launch desk it had
 * never seen hold a row, and the owner accepted it to find out what it was.
 *
 * SO THE WHOLE CHANGE IS INSTALLED FOR REAL, INSIDE A REHEARSAL, AND THROWN AWAY. The declarations go through the
 * kernel's own staged install (`stageInstall`, the path a pack takes), the sample rows through the ordinary write path
 * with every rule a real row meets, and each page is then read by `page`'s own reader. `kernel.rehearse` rolls every
 * one of those writes back and puts the list cache back after it (`packages/kernel/src/api/rehearse.ts`), so what is
 * drawn is what accepting the change would draw, and the record answers every later call exactly as it did before.
 * Nothing observes the page, nothing kicks the host and nothing is spent.
 *
 * HELD AS `previewPage` HOLDS A BODY, BECAUSE THE WORDS ARE THE CALLER'S. A block over a list the caller cannot read is
 * drawn as the held shell `page` draws, a figure she cannot read reads as one nobody declared, and a `where` whose words
 * ask about a hidden list is held or refused in `list`'s own sentence, all through the functions `index.ts` holds a
 * page with (`Holding`), never a copy of them. Everything a change names outside its page blocks must be a list she
 * reads, asked before the lint so that the lint's sentence is never how she learns which lists this record keeps; and
 * a rule, a script or a door runs across the whole record, so only somebody who reads all of it may try one.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import {
  KINDS,
  fill,
  slugify,
  validateDeclaration,
  type BlockResult,
  type Declaration,
  type DeclKind,
  type Entry,
  type Json,
  type Kernel,
  type PageBlock,
  type PageSees,
  type Patch,
  viewerOfRead,
} from '@braindog/kernel';

import type { CallContext } from './index.ts';
import { PREVIEW_BYTES_MOST, PREVIEW_CURRENCIES_MOST, PREVIEW_HORIZON_MOST, PREVIEW_ROWS_MOST, PREVIEW_WALK_ROWS_MOST, PREVIEW_WALKS_MOST } from './index.ts';

/** The most declarations one preview installs in its rehearsal. */
export const PREVIEW_DECLARATIONS_MOST = 12;
/** The most sample rows one list is given in a preview. */
export const PREVIEW_SAMPLE_ROWS_A_LIST = 20;
/** The most sample rows one preview writes across all its lists. */
export const PREVIEW_SAMPLE_ROWS_MOST = 100;

/** One declaration as a change carries it: its kind and name as one id, and its body. */
export type Decl = { id: string; kind: string; body: Record<string, Json> };

/** What `previewChange` takes: the change's `to`, sample rows by list, and the row a page per row is drawn over. */
export type PreviewChangeArgs = { to: Decl | { declarations: Decl[] }; rows?: Record<string, Record<string, Json>[]>; about?: string };

/**
 * One page the change would make, drawn as `page` would draw it once the change landed, and the page as it stands now
 * when the change replaces one (`was`, `null` for a new page or one the caller cannot open).
 */
export type PreviewedPage = {
  id: string;
  slug: string;
  title: string;
  nav: { section: string; order: number; tabs?: true } | null;
  layout: { rail: 3 | 4 | 5; sticky?: true } | null;
  icon: string | null;
  /** The row a page per row is drawn over, as `<list>#<seq>`, and `null` for a page somebody wrote or no row at all. */
  about: string | null;
  blocks: BlockResult[];
  was: BlockResult[] | null;
};

export type ChangePreviewed = { pages: PreviewedPage[] };

/**
 * The functions `index.ts` holds a page with, handed over rather than copied, so a proposed block is held from a caller
 * exactly as the same block is once it is installed (`index.ts`, `heldBlock` and the functions beside it).
 *
 * THE RETURNS ARE `unknown` WHERE `index.ts` INFERS ITS OWN, since a block answered here is only ever passed on.
 */
export type Holding = {
  heldBlock: (ctx: CallContext, b: BlockResult) => unknown;
  shellOf: (b: BlockResult, beyond: Refusal, log: boolean) => unknown;
  heldBy: (ctx: CallContext, b: PageBlock) => { log: Refusal | null; beyond: Refusal | null };
  unplaced: (ctx: CallContext, block: unknown, forList: unknown) => { block: unknown; back: Map<string, string> };
  whereHeld: (ctx: CallContext, block: unknown) => { refusal: Refusal; shell: boolean } | null;
  seesPage: (ctx: CallContext, p: { registers: string[]; about: { register: string; seq?: number | null } | null }) => boolean;
  readsEveryList: (ctx: CallContext) => boolean;
  /** What of the reads across the record she is shown, handed to every page read made for her (`seesFor` in `index.ts`). */
  seesFor: (ctx: CallContext) => PageSees | undefined;
};

export type PreviewDeps = {
  kernel: Kernel;
  readable: (ctx: CallContext, register: string) => Refusal | null;
  held: Holding;
};

const TAKES = ['to', 'rows', 'about'] as const;

/**
 * The kinds somebody held from a list may try: a list, a figure and a page, each of which is drawn only through the
 * blocks it makes. A rule, a script, a door or a digest acts on rows across the record, so trying one is for whoever
 * reads all of it, as `page` holds the log and the open questions (`ACROSS` in `index.ts`).
 */
const HELD_KINDS: ReadonlySet<string> = new Set(['register', 'page', 'metric']);

/** A row's spoken id as a change names it: a list, `#`, and its number from 1. */
const SPOKEN = /^([a-z][a-z0-9_-]{0,63})#([1-9][0-9]{0,15})$/u;

const isMap = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A plan for one written block, as `previewPage` makes it: drawn, held, held as a shell by its `where`, or refused. */
type Plan = { draw: true } | { held: true } | { shell: Refusal } | { refused: Refusal };

/** A page declaration of the change, read once: its blocks with hidden figures renamed, and each block's plan. */
type Planned = { index: number; decl: Declaration; forList: string | null; written: unknown[]; back: Map<string, string>[]; plans: Plan[] };

/** A cash walk, whose cost is counted before it runs, in the rehearsal, where its legs' rows are. */
const isWalk = (block: unknown): boolean => isMap(block) && block.source === 'forecast.runway';

/**
 * Every list and figure a declaration names outside its page blocks: the declaration's own list, a `register.` word
 * anywhere, a `register` key, a reference field's `to`, a `metric` key and a `source` of `metric.`. A page's blocks are
 * left out, because each is held on its own rather than refused (`plansOf`).
 */
function namesIn(d: Declaration): { lists: string[]; figures: string[] } {
  const lists: string[] = d.kind === 'register' ? [d.id.slice('register.'.length)] : [];
  const figures: string[] = [];
  const visit = (node: unknown, key: string | undefined, parent: Record<string, unknown> | null): void => {
    if (typeof node === 'string') {
      if (node.startsWith('register.')) lists.push(node.slice('register.'.length));
      else if (key === 'register') lists.push(node);
      else if (key === 'to' && parent !== null && typeof parent.type === 'string' && parent.type.includes('ref')) lists.push(node);
      if (key === 'metric') figures.push(node.split(':')[0] ?? node);
      else if (key === 'source' && node.startsWith('metric.')) figures.push(node.slice('metric.'.length).split(':')[0] ?? node);
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) visit(n, undefined, null);
      return;
    }
    if (!isMap(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (d.kind === 'page' && node === d.body && k === 'blocks') continue;
      visit(v, k, node);
    }
  };
  visit(d.body, undefined, null);
  return { lists, figures };
}

/** Every `unplaced-` name back to the caller's own, in anything answered: `unplaced` renamed them (`index.ts`). */
function namedBack<T>(value: T, backs: readonly Map<string, string>[]): T {
  if (backs.every((b) => b.size === 0)) return value;
  let text = JSON.stringify(value);
  for (const back of backs) for (const [name, was] of back) text = text.replaceAll(name, was);
  return JSON.parse(text) as T;
}

/** A written block without its `where`, which is how `previewPage` lints a block `list` refused her words on. */
const bare = (block: unknown): unknown => {
  if (!isMap(block)) return block;
  const { where: _where, ...rest } = block;
  return rest;
};

/** The rows and walk steps a drawn block answers, which is what `PREVIEW_ROWS_MOST` counts, as `previewPage` counts it. */
function answeredBy(block: BlockResult): number {
  const steps = (walk: unknown): number => {
    const s = (walk as { steps?: unknown } | undefined)?.steps;
    return Array.isArray(s) ? s.length : 0;
  };
  const b = block as { rows?: unknown; walk?: unknown; walks?: unknown };
  return (Array.isArray(b.rows) ? b.rows.length : 0) + steps(b.walk) + (Array.isArray(b.walks) ? (b.walks as unknown[]).reduce<number>((n, w) => n + steps(w), 0) : 0);
}

export function previewer(deps: PreviewDeps) {
  const { kernel, readable, held } = deps;

  /** Her refusal from `readable`, at the place in the change that named the list. */
  const unread = (ctx: CallContext, list: string, at: string): Result<never> | null => {
    const said = readable(ctx, list);
    return said === null ? null : { ok: false, refusal: { ...said, at } };
  };

  /**
   * Which declaration of the change the lint's first fault is about, found by asking each alone of the record with the
   * whole change laid over it, which is how `lintBatch` asks them (`packages/kernel/src/declare.ts`). `null` when the
   * fault is about the change as a whole, a door or a disabled pack, and no single declaration says it.
   */
  const culprit = (batch: readonly Declaration[]): Declaration | null => {
    const live = kernel.declarations();
    const known = new Map<string, Record<string, Json>>();
    const owners = new Map<string, string | null>();
    for (const row of live) {
      try {
        known.set(row.id, JSON.parse(row.body) as Record<string, Json>);
      } catch {
        known.set(row.id, {});
      }
      owners.set(row.id, row.pack_id);
    }
    const standing = new Set(live.map((row) => row.id));
    for (const d of batch) {
      known.set(d.id, d.body);
      owners.set(d.id, null);
    }
    return (
      batch.find((d) => {
        try {
          return validateDeclaration(d, known, owners, standing) !== null;
        } catch {
          return false;
        }
      }) ?? null
    );
  };

  /**
   * A refusal about the change, with its `at` under the declaration it is about (`page.desk.blocks[8].columns`), so the
   * caller of a bundle is told which of its declarations to mend. An `at` that already names one is left as it is.
   */
  const blamed = (fault: Refusal, batch: readonly Declaration[]): Refusal => {
    const at = fault.at;
    if (at !== undefined && batch.some((d) => at === d.id || at.startsWith(`${d.id}.`))) return fault;
    const whose = culprit(batch) ?? (batch.length === 1 ? batch[0]! : (batch.find((d) => fault.fix.includes(d.id)) ?? null));
    if (whose === null) return fault;
    return { ...fault, at: at === undefined || at === '' ? whose.id : `${whose.id}.${at}` };
  };

  /**
   * One page declaration's blocks, planned before anything is linted, exactly as `previewPage` plans a body's: each
   * figure she cannot read renamed to one nobody declared, then each block drawn, held as `heldBy` holds it, held by its
   * `where`, or refused in `list`'s sentence.
   */
  const plansOf = (ctx: CallContext, index: number, decl: Declaration): Planned => {
    const f = decl.body.for;
    const forList = isMap(f) && typeof f.register === 'string' ? f.register : null;
    const renamed = (Array.isArray(decl.body.blocks) ? (decl.body.blocks as unknown[]) : []).map((block) => held.unplaced(ctx, block, forList ?? undefined));
    const written = renamed.map((r) => r.block);
    const plans = written.map((block): Plan => {
      if (!isMap(block)) return { draw: true };
      try {
        if (held.heldBy(ctx, block as never).beyond !== null) return { held: true };
        const where = held.whereHeld(ctx, block);
        return where === null ? { draw: true } : where.shell ? { shell: where.refusal } : { refused: where.refusal };
      } catch {
        return { draw: true };
      }
    });
    return { index, decl, forList, written, back: renamed.map((r) => r.back), plans };
  };

  /**
   * A page's blocks as they are linted (`rehearsing: false`) and as they are installed in the rehearsal (`rehearsing:
   * true`): a held block as a bare note in its place, so the count and every position the lint names stay the body's,
   * and one refused by its `where` without it. In the rehearsal a cash walk is a note too, drawn on its own once its
   * cost is counted, so a walk past the ceilings never runs; the lint has already read it as written.
   */
  const laid = (p: Planned, rehearsing: boolean): Declaration => {
    if (!Array.isArray(p.decl.body.blocks)) return p.decl;
    const blocks = p.written.map((block, i) => {
      const plan = p.plans[i]!;
      if ('held' in plan || 'shell' in plan) return { kind: 'note' };
      if ('refused' in plan) return bare(block);
      return rehearsing && isWalk(block) ? { kind: 'note' } : block;
    });
    return { ...p.decl, body: { ...p.decl.body, blocks: blocks as Json[] } };
  };

  return async (args: unknown, ctx: CallContext): Promise<Result<ChangePreviewed>> => {
    const said = isMap(args) ? args : {};
    const stray = Object.keys(said).find((k) => !(TAKES as readonly string[]).includes(k));
    if (stray !== undefined)
      return no('FIELD_UNKNOWN', `${stray} is not something previewChange takes. It takes to, rows and about.`, { at: stray, allowed: [...TAKES] });

    /* ── the change ── */
    const to = said.to;
    const bundled = isMap(to) && Array.isArray(to.declarations);
    const given: unknown[] | null = bundled ? (to.declarations as unknown[]) : isMap(to) ? [to] : null;
    if (given === null)
      return no('REQUIRED_MISSING', 'to is the declaration the change installs, as { id, kind, body }, or several as { declarations: [...] }.', { at: 'to' });
    if (given.length === 0) return no('REQUIRED_MISSING', 'to.declarations names at least one declaration to try.', { at: 'to.declarations' });
    if (given.length > PREVIEW_DECLARATIONS_MOST)
      return no(
        'OUT_OF_BOUNDS',
        `A preview tries at most ${PREVIEW_DECLARATIONS_MOST} declarations at once, and this change has ${given.length}. Try its lists and figures first, then its pages.`,
        { at: 'to.declarations' },
      );
    const batch: Declaration[] = [];
    for (const [i, d] of given.entries()) {
      const at = bundled ? `to.declarations[${i}]` : 'to';
      if (!isMap(d) || typeof d.id !== 'string' || typeof d.kind !== 'string' || !isMap(d.body))
        return no('VALUE_MALFORMED', 'Each declaration is { id, kind, body }, as a change carries it.', { at });
      if (!(KINDS as readonly string[]).includes(d.kind))
        return no('ENUM_VALUE_UNKNOWN', `${d.kind} is not a kind of declaration BrainDog keeps.`, { at: `${at}.kind`, allowed: [...KINDS] });
      if (!d.id.startsWith(`${d.kind}.`) || d.id.length === d.kind.length + 1)
        return no('VALUE_MALFORMED', `${d.id} is not a ${d.kind}'s id: it is the kind, a dot and a name, such as ${d.kind}.name.`, { at: `${at}.id` });
      if (batch.some((b) => b.id === d.id)) return no('VALUE_MALFORMED', `${d.id} is in this change twice. Say each declaration once.`, { at: `${at}.id` });
      batch.push({ id: d.id, kind: d.kind as DeclKind, body: d.body as Record<string, Json> });
    }

    /* ── the sample rows and the row a page per row is drawn over ── */
    const rowsSaid = said.rows;
    if (rowsSaid !== undefined && !isMap(rowsSaid))
      return no('VALUE_MALFORMED', 'rows is sample rows by list, as { list: [ { field: value } ] }.', { at: 'rows' });
    const samples: [string, Record<string, Json>[]][] = [];
    let sampled = 0;
    for (const [list, rows] of Object.entries(isMap(rowsSaid) ? rowsSaid : {})) {
      if (!Array.isArray(rows) || rows.some((r) => !isMap(r)))
        return no('VALUE_MALFORMED', `rows.${list} is a list of rows, each an object of field names and their values.`, { at: `rows.${list}` });
      if (rows.length > PREVIEW_SAMPLE_ROWS_A_LIST)
        return no('OUT_OF_BOUNDS', `A preview writes at most ${PREVIEW_SAMPLE_ROWS_A_LIST} sample rows in one list, and rows.${list} has ${rows.length}.`, { at: `rows.${list}` });
      sampled += rows.length;
      if (sampled > PREVIEW_SAMPLE_ROWS_MOST)
        return no('OUT_OF_BOUNDS', `A preview writes at most ${PREVIEW_SAMPLE_ROWS_MOST} sample rows in all, and this one has more.`, { at: 'rows' });
      samples.push([list, rows as Record<string, Json>[]]);
    }
    const aboutSaid = said.about;
    const about = typeof aboutSaid === 'string' ? SPOKEN.exec(aboutSaid) : null;
    if (aboutSaid !== undefined && about === null)
      return no('VALUE_MALFORMED', 'about names the row a page per row is drawn over, by its spoken id, such as parts#1.', { at: 'about' });
    const aboutRow = about === null ? null : { register: about[1]!, seq: Number(about[2]) };

    /* ── what she may name, asked before the lint reads a word of it ──
       A LIST SHE CANNOT READ IS ANSWERED IN `readable`'s SENTENCE, WHETHER OR NOT THE RECORD HOLDS IT, which is how
       `previewPage` answers a `requires`: asked after the lint, somebody invited to one list would learn which others
       this record keeps from which of her guesses the lint refused. The owner reads every list, so `readable` passes
       her and the lint tells her which of them is not there. */
    for (const [list] of samples) {
      const stop = unread(ctx, list, `rows.${list}`);
      if (stop) return stop;
    }
    if (aboutRow !== null) {
      const stop = unread(ctx, aboutRow.register, 'about');
      if (stop) return stop;
    }
    const whole = held.readsEveryList(ctx);
    const declared = new Set(batch.map((d) => d.id));
    for (const d of batch) {
      if (!whole && !HELD_KINDS.has(d.kind))
        return no('FORBIDDEN', `Trying a ${d.kind} runs it across all of this BrainDog, so it is for people who can read all of it.`, { at: d.id });
      const { lists, figures } = namesIn(d);
      for (const list of lists) {
        const stop = unread(ctx, list, d.id);
        if (stop) return stop;
      }
      if (whole) continue;
      /* A FIGURE SHE CANNOT READ IS A FIGURE THAT DOES NOT EXIST, as `metric` says it, and one nobody declared is answered
         in the same sentence, so the two cannot be told apart by asking. Her own figures in the change are hers. */
      for (const figure of figures) {
        if (declared.has(`metric.${figure}`)) continue;
        const source = kernel.metricDecl(figure)?.source;
        if (typeof source !== 'string' || (source.startsWith('register.') && readable(ctx, source.slice('register.'.length)) !== null))
          return no('METRIC_UNKNOWN', `There is no figure called ${figure} that you can read.`, { at: d.id });
      }
      /* AND A FIGURE'S `where` IS WORDS SHE WROTE, asked of `list` with her own reads as a block's are (`whereHeld`), since
         a `where` resolved against the whole record answers a title she could not otherwise see. */
      if (d.kind === 'metric') {
        const words = held.whereHeld(ctx, { source: d.body.source, where: d.body.where });
        if (words) return { ok: false, refusal: { ...words.refusal, at: d.id } };
      }
    }

    /* ── the lint, over the change as it will be installed ── */
    const pages = batch.flatMap((d, i) => (d.kind === 'page' ? [plansOf(ctx, i, d)] : []));
    if (aboutRow !== null && !pages.some((q) => q.forList === aboutRow.register))
      return no('VALUE_MALFORMED', `about names a row of ${aboutRow.register}, and no page in this change is made for each row of it.`, { at: 'about' });
    const backs = pages.flatMap((q) => q.back);
    const layOut = (rehearsing: boolean): Declaration[] =>
      batch.map((d, i) => {
        const planned = pages.find((q) => q.index === i);
        return planned === undefined ? d : laid(planned, rehearsing);
      });
    /* A FAULT THE LINT BLAMES ON ONE BLOCK IS STRIPPED FROM WHAT IS LINTED, AND CARRIED AS THAT BLOCK'S OWN REFUSAL
       INSTEAD, so a second block's fault is not hidden behind the first: `kernel.lint` halts the whole change at
       its first bad `where`, and a model that named a field one block lacks and another field a different block
       lacks made two faults with one lint call between them. `bare` (`laid`, below) is what already strips a
       `where` `whereHeld` refused; the same shell serves a `where` the lint refused for what it names rather than
       who may read it. A fault it cannot pin on one page's one block, or a block already stripped once for
       nothing, still halts the whole change (`test/slash-compose-desk.test.ts`). */
    let linted = layOut(false);
    const quarantined = new Set<string>();
    for (;;) {
      const fault = kernel.lint(linted);
      if (!fault) break;
      const blamedFault = blamed(namedBack(fault, backs), linted);
      const found = /^(.+)\.blocks\[(\d+)\](?:\.(.+))?$/u.exec(blamedFault.at ?? '');
      const page = found ? pages.find((q) => q.decl.id === found[1]) : undefined;
      const i = found ? Number(found[2]) : NaN;
      const key = found ? `${found[1]}[${i}]` : '';
      if (page === undefined || page.plans[i] === undefined || quarantined.has(key)) return { ok: false, refusal: blamedFault };
      quarantined.add(key);
      const { at: _at, ...rest } = blamedFault;
      page.plans[i] = { refused: found![3] === undefined ? (rest as Refusal) : ({ ...rest, at: found![3] } as Refusal) };
      linted = layOut(false);
    }
    const installing = layOut(true);
    const staged = await kernel.stageInstall(installing);
    if (!staged.ok) return 'refusal' in staged ? { ok: false, refusal: blamed(namedBack(staged.refusal, backs), installing) } : (staged as Result<never>);

    /* ── the rehearsal: install, write the samples, draw every page, keep nothing ── */
    const p = ctx.principal;
    const actor = p.kind === 'token' ? p.person : p.id;
    let walks = 0;
    let legRows = 0;

    /**
     * Why a cash walk is not run in a preview, or `null`: `previewPage`'s ceilings, asked of the walk as it stands in
     * the rehearsal, where the rows its legs read include the samples. Counted across every page of the change.
     */
    const walkCost = (block: unknown): Refusal | null => {
      const w = block as { horizon?: unknown; from?: unknown; opening?: unknown };
      const horizon = typeof w.horizon === 'number' ? w.horizon : 0;
      if (horizon > PREVIEW_HORIZON_MOST)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `A preview walks cash at most ${PREVIEW_HORIZON_MOST} days ahead, and this walk asks for ${horizon.toLocaleString('en-GB')}. Accepted, the page draws this walk in full.`,
          at: 'horizon',
        };
      walks += 1;
      if (walks > PREVIEW_WALKS_MOST)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `A preview draws at most ${PREVIEW_WALKS_MOST} cash walks, and this is walk ${walks}. Accepted, the page draws this walk.`,
          at: 'source',
        };
      const currencies = new Set<string>();
      const reads = (list: string): boolean => readable(ctx, list) === null;
      for (const leg of Array.isArray(w.from) ? (w.from as unknown[]) : []) {
        if (!isMap(leg) || typeof leg.register !== 'string') continue;
        let page = kernel.list({ register: leg.register, where: leg.where as never, limit: 500, reads });
        /* A LEG `list` REFUSES IS REFUSED BY THE WALK IN ITS OWN ANSWER, and reads nothing. */
        if (!page.ok) continue;
        legRows += page.value.matched;
        if (legRows > PREVIEW_WALK_ROWS_MOST)
          return {
            code: 'OUT_OF_BOUNDS',
            fix: `A preview's cash walks read at most ${PREVIEW_WALK_ROWS_MOST.toLocaleString('en-GB')} rows across their legs, and with this walk they read ${legRows.toLocaleString('en-GB')}. Accepted, the page draws this walk. Preview it with fewer legs, or a narrower where on each.`,
            at: 'from',
          };
        for (;;) {
          for (const row of page.value.rows) {
            const money = typeof leg.amount === 'string' ? row.fields[leg.amount] : undefined;
            if (isMap(money) && typeof money.currency === 'string') currencies.add(money.currency);
          }
          if (page.value.cursor === null) break;
          const next = kernel.list({ register: leg.register, where: leg.where as never, limit: 500, cursor: page.value.cursor, reads });
          if (!next.ok) break;
          page = next;
        }
      }
      const opening = isMap(w.opening) ? w.opening.metric : undefined;
      const start = typeof opening === 'string' ? kernel.metricDecl(opening) : null;
      const reading = start ? kernel.metric(start) : null;
      if (reading?.ok) for (const part of reading.value.parts ?? []) currencies.add(part.currency);
      if (currencies.size > PREVIEW_CURRENCIES_MOST)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `A preview walks cash in at most ${PREVIEW_CURRENCIES_MOST} currencies, and this walk's money is in ${currencies.size}. Accepted, the page walks every currency its legs hold. Preview it with a where on each leg that keeps fewer currencies.`,
          at: 'from',
        };
      return null;
    };

    /** One page of the change, drawn in the rehearsal after everything is installed and every sample written. */
    const drawn = (plan: Planned, listed: ReturnType<Kernel['pages']>): Result<Omit<PreviewedPage, 'was'>> => {
      const body = plan.decl.body;
      const name = String(body.page ?? plan.decl.id.slice('page.'.length));
      let entry: (typeof listed)[number] | undefined;
      let row: Entry | null = null;
      if (plan.forList === null) {
        const base = slugify(name);
        entry = listed.find((q) => q.about === null && q.slug === base) ?? listed.find((q) => q.about === null && q.slug.startsWith(`${base}-`));
      } else {
        /* ONLY A ROW SHE CAN SEE. `fill` writes the row's own fields into the page, so a row past her row rule, or somebody's
           private row, came back through `about` or as the first of the list, title, notes and amount. */
        const mine = listed.filter((q) => q.about?.register === plan.forList && held.seesPage(ctx, q));
        if (aboutRow !== null && aboutRow.register === plan.forList) {
          entry = mine.find((q) => q.about?.seq === aboutRow.seq);
          if (entry === undefined)
            return no('VALUE_MALFORMED', `${plan.forList}#${aboutRow.seq} is not a row ${plan.decl.id} makes a page for. Name one its where admits, or leave about out.`, { at: 'about' });
        } else entry = mine[0];
        row = entry?.about ? kernel.get({ register: entry.about.register, seq: entry.about.seq ?? 0 }) : null;
      }
      /* READ FOR HER, as `page` reads one: no row kept private from her (`viewer`), and a feed or a queue through her lens. */
      const page = entry === undefined ? null : kernel.page(entry.slug, undefined, { viewer: viewerOfRead(ctx), sees: held.seesFor(ctx) });
      const shown = page !== null && page.ok ? page.value : null;
      /* A PAGE PER ROW WITH NO ROW TO BE ABOUT IS DRAWN AS WRITTEN, placeholders and all, under one sentence that says so,
         which is how `previewPage` draws every template. */
      const unfilled = plan.forList !== null && entry === undefined;
      const blocks = plan.written.map((block, i): BlockResult => {
        const planned = plan.plans[i]!;
        const one = (): unknown => {
          if ('held' in planned) return held.heldBlock(ctx, block as BlockResult);
          if ('shell' in planned) return held.shellOf(block as BlockResult, planned.shell, false);
          if ('refused' in planned) return held.heldBlock(ctx, { ...(block as BlockResult), rows: [], matched: 0, refusals: [planned.refused] });
          if (isWalk(block)) {
            const filled = (row === null ? block : fill(block, row)) as BlockResult;
            const cost = walkCost(filled);
            return cost ? held.heldBlock(ctx, { ...filled, rows: [], matched: 0, refusals: [cost] }) : held.heldBlock(ctx, kernel.block(filled as PageBlock, { viewer: viewerOfRead(ctx) }));
          }
          const read = shown?.blocks[i];
          /* DRAWN FOR HER, so no row kept private from her is in it (`viewer`), as `page` draws a block for its reader. */
          return held.heldBlock(ctx, read ?? kernel.block(block as PageBlock, { viewer: viewerOfRead(ctx) }));
        };
        return namedBack(one(), [plan.back[i]!]) as BlockResult;
      });
      if (unfilled) {
        const list = plan.forList!;
        blocks.unshift({
          kind: 'note',
          body: `No row of ${kernel.register(list)?.name ?? list} yet, so this page is drawn with its placeholders.`,
          rows: [],
          matched: 0,
          refusals: [],
        } as unknown as BlockResult);
      }
      const nav = isMap(body.nav) && typeof body.nav.section === 'string' && typeof body.nav.order === 'number'
        ? { section: body.nav.section, order: body.nav.order, ...(body.nav.tabs === true ? { tabs: true as const } : {}) }
        : null;
      const rail = isMap(body.layout) ? body.layout.rail : undefined;
      const layout = isMap(body.layout) && (rail === 3 || rail === 4 || rail === 5)
        ? { rail: rail as 3 | 4 | 5, ...(body.layout.sticky === true ? { sticky: true as const } : {}) }
        : null;
      const title = shown !== null && typeof shown.title === 'string' ? shown.title : typeof body.title === 'string' ? body.title : name;
      return ok({
        id: plan.decl.id,
        slug: entry?.slug ?? slugify(name),
        title: namedBack(title, plan.back),
        nav,
        layout,
        icon: typeof body.icon === 'string' ? body.icon : null,
        about: entry?.about && entry.about.seq !== null ? `${entry.about.register}#${entry.about.seq}` : null,
        blocks,
      });
    };

    const rehearsed = kernel.rehearse((): Result<Omit<PreviewedPage, 'was'>[]> => {
      const applied = staged.value();
      if (!applied.ok) return 'refusal' in applied ? { ok: false, refusal: blamed(namedBack(applied.refusal, backs), installing) } : (applied as Result<never>);
      kernel.reload();
      /* THE SAMPLES THROUGH THE WRITE PATH, with every check and every rule a real row meets, so a rule in the change is
         seen doing what it would do. Signed by the caller, as nothing is kept to be signed.
         AND HELD TO HER READS AS `create` HOLDS A ROW SHE SENDS (`refsSeen` in `index.ts`). Without `reads` the write path
         resolves a ref against the whole record, so somebody invited to Jobs alone could send a sample Job at `clients#1`
         and learn from a drawn page or `REF_UNKNOWN` whether that hidden client exists. */
      const reads = (register: string): boolean => readable(ctx, register) === null;
      for (const [list, rows] of samples)
        for (const [i, fields] of rows.entries()) {
          const made = kernel.create(list, fields as Patch, { actor, reads });
          if (!made.ok) {
            if (!('refusal' in made)) return made as Result<never>;
            const at = made.refusal.at;
            return { ok: false, refusal: { ...made.refusal, at: `rows.${list}[${i}]${at === undefined || at === '' ? '' : `.${at}`}` } };
          }
        }
      const listed = kernel.pages();
      const out: Omit<PreviewedPage, 'was'>[] = [];
      for (const plan of pages) {
        const one = drawn(plan, listed);
        if (!one.ok) return one as Result<never>;
        out.push(one.value);
      }
      return ok(out);
    });
    if (!rehearsed.ok) return rehearsed as Result<never>;

    /* ── the pages as they stand now, drawn as `page` draws them, for a change to a page the record has ── */
    const standing = new Set(kernel.declarations().map((d) => d.id));
    const listedNow = rehearsed.value.some((page) => standing.has(page.id)) ? kernel.pages() : [];
    const answer: ChangePreviewed = {
      pages: rehearsed.value.map((page): PreviewedPage => {
        if (!standing.has(page.id)) return { ...page, was: null };
        const now =
          page.about === null
            ? listedNow.find((q) => q.about === null && q.slug === page.slug)
            : listedNow.find((q) => q.about !== null && `${q.about.register}#${q.about.seq}` === page.about);
        if (now === undefined || !held.seesPage(ctx, now)) return { ...page, was: null };
        const read = kernel.page(now.slug, undefined, { viewer: viewerOfRead(ctx), sees: held.seesFor(ctx) });
        return { ...page, was: read.ok ? read.value.blocks.map((b) => held.heldBlock(ctx, b) as BlockResult) : null };
      }),
    };

    /* ── and what it answers, together, held to `previewPage`'s ceilings ── */
    const answered = answer.pages.reduce((n, page) => n + [...page.blocks, ...(page.was ?? [])].reduce((m, b) => m + answeredBy(b), 0), 0);
    if (answered > PREVIEW_ROWS_MOST)
      return no(
        'OUT_OF_BOUNDS',
        `A preview answers at most ${PREVIEW_ROWS_MOST.toLocaleString('en-GB')} rows and walk steps across its pages, and this one drew ${answered.toLocaleString('en-GB')}. Preview it with lower table limits, shorter walks or fewer pages.`,
        { at: 'to' },
      );
    const weight = new TextEncoder().encode(JSON.stringify(answer)).length;
    if (weight > PREVIEW_BYTES_MOST)
      return no(
        'OUT_OF_BOUNDS',
        `A preview answers at most ${PREVIEW_BYTES_MOST.toLocaleString('en-GB')} bytes, and this one came to ${weight.toLocaleString('en-GB')}. Preview it with lower table limits or fewer pages.`,
        { at: 'to' },
      );
    return ok(answer);
  };
}
