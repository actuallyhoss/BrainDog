/**
 * The pages census and the paths check: `pagesCensus` and `checkPaths`, both READ+ and both writing nothing (PGS-A01,
 * REC-A12 job 4).
 *
 * `pagesCensus` IS ONE ROW A PAGE THE CALLER MAY OPEN, AND THE TOTALS. Each row is the kernel's `censusOf` over the page's
 * answer (`kernel/src/census.ts`): how many blocks, how many drawn, each refusal, each path that named nothing, each
 * glyph no host draws, and the dashes. THE DASHES ARE THE PAGE LINT'S COUNT (`page-lint.ts`, `lintAnswer`), never a
 * second scanner: a figure with no reading and a dash alone where the data holds a value are the two things the lint
 * says draw `—`. The proof area's daily sign reads the totals, so a page that breaks is seen the morning after.
 *
 * CUT TO THE CALLER, AS `pages` CUTS. A page is counted when `seesPage` in `index.ts` would list it: any list it reads is
 * readable to them and the row it is about is. A block the page would hold from them (a list they may not read, the
 * record read across for somebody who does not read it whole, a figure over rows their grant narrows) is counted as
 * held, refused and saying nothing else, so a census never names a path or a glyph of a list they cannot open. A page
 * whose blocks are all held from them is not counted, as `whollyWithheld` drops it from their pages.
 *
 * `checkPaths` IS THE IMPORTER'S QUESTION BEFORE IT WRITES A DOCUMENT: each `{{path}}` the document holds (`pathsOf`)
 * and whether it names something: a field of the list it is written into, or read as a note block reads it
 * (`kernel.block`'s `unnamed`, as `index.ts` asks a figure's change). A path over a list the caller may not read is
 * answered as naming nothing, which is what a page would show them.
 */

import { GLYPH_NAMES } from 'braindog-render/glyphs/names';
import { censusOf, pathsOf, sourceReadsWhole, viewerOfRead, whollyWithheld, type BlockResult, type Census, type PageBlock, type PageResult } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';

import { lintAnswer, ROUND_MS, ROUND_PAGES } from '../page-lint.ts';
import { hostSourcesOf } from '../sources/index.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** One page counted, with its title for a person to read beside its address. */
export type PageCensus = Census & { title: string };

/** What `pagesCensus` answers: each page counted, and how many pages carry each fault. */
export type PagesCensus = {
  pages: PageCensus[];
  totals: {
    /** Pages counted. */
    pages: number;
    /** Pages with at least one refused block. */
    refused: number;
    /** Pages that print a path that named nothing. */
    unresolved: number;
    /** Pages that show a dash where a value goes, and every such dash across them. */
    dashed: number;
    dashes: number;
    /** Pages whose heading names a glyph no host draws. */
    glyphs_unknown: number;
    /** Pages the record lists and could not draw, by title. */
    undrawn: string[];
    /** Pages left uncounted because the round ran out of time. */
    unread: number;
  };
};

/** One path a document holds, and whether the record has anything by that name. */
export type PathCheck = { path: string; named: boolean };

/** The most characters one document may hold for `checkPaths`: far over a project note, short of a whole export. */
export const CHECK_DOCUMENT_MOST = 200_000;

/** The two findings of the page lint that draw a dash: a figure with no answer, and a dash alone where a value is. */
const DASH_RULES: ReadonlySet<string> = new Set(['no-reading', 'only-a-dash']);

/** What a block held from its reader carries in the census, as `page` holds it: a refusal and nothing it would print. */
const HELD: Refusal = { code: 'FORBIDDEN', fix: 'This reads a list you may not open.', at: 'source' };

/** What the census and its slices share: who may open a page, and each block as the caller is shown it. */
function shared(deps: RecordDeps) {
  const { kernel, readable } = deps;

  /** Whether the caller may open a page `kernel.pages()` lists: the rule of `seesPage` in `index.ts`, asked of `readable`. */
  const opens = (ctx: CallContext, p: { registers: string[]; about: { register: string; seq?: number | null } | null }): boolean =>
    (p.registers.length === 0 || p.registers.some((id) => readable(ctx, id) === null)) && (p.about === null || aboutSeen(ctx, p.about));

  /** Whether the row a page is made for is one she is shown, as `aboutSeen` in `index.ts` asks: its list read, and the row admitted. */
  const aboutSeen = (ctx: CallContext, about: { register: string; seq?: number | null }): boolean => {
    if (readable(ctx, about.register) !== null) return false;
    if (typeof about.seq !== 'number' || kernel.scope(ctx, about.register) === undefined) return true;
    const row = kernel.get({ register: about.register, seq: about.seq });
    return row !== null && deps.sight.admits(ctx, row);
  };

  /** Whether the caller reads the record whole, as `whole` in `signs.ts` asks it, with no grant narrowed to some rows. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*') && Object.keys(ctx.wheres ?? {}).length === 0;
  };

  /**
   * Whether the caller reads every list, and all of each (`readsEveryList` in `index.ts`), which the questions ask: a
   * member who reads the whole record but holds one list at `append` is shown no queue, so the census holds it too.
   */
  const everyList = (ctx: CallContext): boolean =>
    deps.readsEveryList?.(ctx) ?? (whole(ctx) && Object.keys(ctx.levels ?? {}).every((list) => readable(ctx, list) === null));

  /**
   * One block as this caller is shown it in the census: unchanged, or held, as `heldBy` in `index.ts` holds it, when it
   * reads across the whole record and they do not read it whole (the questions: every list, and all of each), reads a
   * list they may not read, or works out a figure over a list their grant narrows to some rows.
   */
  const shown = (ctx: CallContext, b: BlockResult): BlockResult => {
    const lists = kernel.blockRegisters(b as unknown as PageBlock);
    const source = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
    const held =
      (sourceReadsWhole(b.source, hostSourcesOf({ kernel, ctx, readable })) && !(String(b.source).startsWith('governance.') ? everyList(ctx) : whole(ctx))) ||
      lists.some((id) => readable(ctx, id) !== null) ||
      lists.some((id) => id !== source && Object.hasOwn(ctx.wheres ?? {}, id));
    /* A HELD BLOCK IS DRAWN AS ITS REFUSAL, whatever its own `when:` said for the owner, as `shellOf` drops `drawn`: an
       empty table over a list she may not read is on her page as a refused block, so it is counted as one. */
    return held ? ({ kind: b.kind, refusals: [HELD] } as unknown as BlockResult) : b;
  };

  /** A census about to begin: the pages the caller may open, somebody's own first, then the ones each template made. */
  const begun = (ctx: CallContext): CensusPart => {
    const listed = kernel.pages().filter((p) => opens(ctx, p));
    /* THE PAGES SOMEBODY WROTE FIRST, then the pages each template made, so a round cut short has counted his own. */
    const order = [...listed.filter((p) => p.template === null), ...listed.filter((p) => p.template !== null)];
    return { order: order.map((p) => ({ slug: p.slug, title: p.title, stored: p.template === null })), next: 0, read: 0, pages: [], undrawn: [] };
  };

  /** Whether a census has drawn every page it will: its last page, or `ROUND_PAGES`. */
  const ended = (part: CensusPart): boolean => part.next >= part.order.length || part.read >= ROUND_PAGES;

  /**
   * The next pages of a census, until it ends or `stop` says so. `stop` is asked before each page after the first this
   * call draws, with how many it drew, so every call draws at least one page while any is left.
   */
  const step = (ctx: CallContext, part: CensusPart, stop: (drawn: number) => boolean): CensusPart => {
    const out: CensusPart = { ...part, pages: [...part.pages], undrawn: [...part.undrawn] };
    /* THE RECORD'S OWN SOURCES (`lists`, `pages`) ARE HANDED IN, so a page over one is counted as drawn, not refused. */
    const hostSources = hostSourcesOf({ kernel, ctx, readable });
    let drawn = 0;
    while (!ended(out)) {
      if (drawn > 0 && stop(drawn)) break;
      const p = out.order[out.next]!;
      out.next += 1;
      out.read += 1;
      drawn += 1;
      let answer: PageResult;
      try {
        /* THE PAGE AS `page` READS IT FOR HER where the record hands that in (`pageFor`): each block held by the record's own
           rule, with what it reads beside its source, so a census counts exactly the pages `pages` lists her. */
        const got = deps.pageFor?.(ctx, p.slug) ?? kernel.page(p.slug, undefined, { hostSources, viewer: viewerOfRead(ctx) });
        if (!got.ok) {
          out.undrawn.push(p.title);
          continue;
        }
        answer = got.value;
      } catch {
        out.undrawn.push(p.title);
        continue;
      }
      const held: PageResult = deps.pageFor !== undefined ? answer : { ...answer, blocks: answer.blocks.map((b) => shown(ctx, b)) };
      /* OVER EVERY BLOCK, as `drawnWithheld` in `index.ts` asks it, so a census counts exactly the pages `pages` lists. */
      if (whollyWithheld(held.blocks)) continue;
      const dashes = lintAnswer(held, null).filter((f) => DASH_RULES.has(f.rule)).length;
      const counted = censusOf(held, dashes, { held: p.stored ? 'stored' : 'generated', glyphs: GLYPH_NAMES });
      out.pages.push({ ...counted, title: answer.title });
    }
    return out;
  };

  /** What a census came to, as `pagesCensus` answers it. */
  const answer = (part: CensusPart): PagesCensus => {
    const { pages } = part;
    const counted = (has: (c: PageCensus) => boolean) => pages.filter(has).length;
    return {
      pages,
      totals: {
        pages: pages.length,
        refused: counted((c) => c.refused.length > 0),
        unresolved: counted((c) => c.unresolved.length > 0),
        dashed: counted((c) => c.dashes > 0),
        dashes: pages.reduce((n, c) => n + c.dashes, 0),
        glyphs_unknown: counted((c) => c.glyphs_unknown.length > 0),
        undrawn: part.undrawn,
        unread: part.order.length - part.read,
      },
    };
  };

  return { opens, whole, everyList, shown, census: { begun, ended, step, answer } };
}

/**
 * A census under way, kept between ticks as plain data: the pages in the order they are counted, the next one, how many
 * were drawn, and what was counted so far. The record's lint counts its census a few pages a tick (`lintTick`).
 */
export type CensusPart = { order: { slug: string; title: string; stored: boolean }[]; next: number; read: number; pages: PageCensus[]; undrawn: string[] };

/**
 * THE CENSUS A FEW PAGES AT A TIME, for a host's tick: `begun`, `step` until `ended`, then `answer`, which is what
 * `pagesCensus` answers for the same pages. One census in one call is `pagesCensus` itself, built from these.
 */
export function censusSlices(deps: RecordDeps) {
  return shared(deps).census;
}

export function methods(deps: RecordDeps) {
  const { kernel, scoped, readable, no, clock } = deps;
  const { census } = shared(deps);

  return {
    /**
     * Every page the caller may open, counted: its blocks, how many draw, each refusal, each path that named nothing, each
     * glyph no host draws and each dash, then how many pages carry each. READ+, and it writes nothing, not even the line
     * a page's opening keeps.
     */
    async pagesCensus(_args: unknown, ctx: CallContext): Promise<Result<PagesCensus>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* A ROUND IS BOUNDED AS THE PAGE LINT'S IS: drawing is synchronous, so a record with a page per run stops counting
         at `ROUND_PAGES` or `ROUND_MS` and says how many it left, rather than holding the host. */
      const start = clock.now();
      return { ok: true, value: census.answer(census.step(ctx, census.begun(ctx), () => clock.now() - start > ROUND_MS)) };
    },

    /**
     * Each `{{path}}` a document holds, once, in the order it reads, and whether the record has anything by that name:
     * `{ document, register? }` in, `{ paths: [{ path, named }] }` out. READ+, and it writes nothing. Paths inside a code
     * span are text and are not asked. `register` IS THE LIST THE DOCUMENT IS WRITTEN INTO: a page made for each of its
     * rows fills every field of the row (`rowNamed` in `kernel/src/pages.ts`), so `{{name}}` in a project's note names
     * the project's name, and asked without the list it would be said as naming nothing and written as text.
     */
    async checkPaths(args: { document?: unknown; register?: unknown } | undefined, ctx: CallContext): Promise<Result<{ paths: PathCheck[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = Object.keys(said).find((k) => k !== 'document' && k !== 'register');
      if (extra !== undefined)
        return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes document, and the list it is written into.`, { at: extra, allowed: ['document', 'register'] });
      const document = said.document;
      if (typeof document !== 'string') return no('REQUIRED_MISSING', 'document is the text to check, as it would be written.', { at: 'document' });
      if (document.length > CHECK_DOCUMENT_MOST)
        return no('VALUE_MALFORMED', `document is at most ${CHECK_DOCUMENT_MOST.toLocaleString('en')} characters. Check it a part at a time.`, { at: 'document' });
      const register = said.register;
      if (register !== undefined && (typeof register !== 'string' || register === ''))
        return no('VALUE_MALFORMED', 'register is the list the document is written into, by its name.', { at: 'register' });
      /* A LIST SHE MAY NOT READ IS REFUSED AS `list` REFUSES IT, before whether it exists is asked, so the answer never
         tells her a list is there. */
      const shut = register === undefined ? null : readable(ctx, register);
      if (shut) return { ok: false, refusal: { ...shut, at: 'register' } };
      const list = register === undefined ? undefined : kernel.registers().get(register);
      if (register !== undefined && !list) return no('REGISTER_UNKNOWN', `There is no list called ${register}.`, { at: 'register' });
      const fields = new Set((list?.fields ?? []).map((f) => f.id));
      const block = { kind: 'note', body: document } as unknown as PageBlock;
      const paths = pathsOf(block);
      if (paths.length === 0) return { ok: true, value: { paths: [] } };
      let unnamed: ReadonlySet<string>;
      try {
        unnamed = new Set(kernel.block(block).unnamed ?? []);
      } catch {
        /* A NOTE THE RECORD COULD NOT READ NAMES NOTHING it can vouch for, so every path is said as naming nothing. */
        unnamed = new Set(paths);
      }
      /* A PATH OVER A LIST THE CALLER MAY NOT READ names nothing to them, as a page would show it. */
      const hidden = (path: string): boolean =>
        kernel.blockRegisters({ kind: 'note', body: `{{${path}}}` } as unknown as PageBlock).some((id) => readable(ctx, id) !== null);
      const named = (path: string): boolean => fields.has(path) || (!unnamed.has(path) && !hidden(path));
      return { ok: true, value: { paths: paths.map((path) => ({ path, named: named(path) })) } };
    },
  };
}
