/**
 * One page's versions: `pageVersions({ page })`, READ, writing nothing.
 *
 * THE KERNEL KEEPS EVERY VERSION OF A DECLARATION AND NOTHING LISTED A PAGE'S. A new version is a new row beside the
 * old one, which is stamped `superseded_at` (`kernel/src/declare.ts`), and the app's source view held only the body
 * before the last Apply. This is the read its History is drawn from, as `automationVersions` is an automation's
 * (`automations.ts`): newest first, each with its body, when it was applied and by whom.
 *
 * WHO IS A NAME, NEVER AN ID. The log's `declare` line says the actor by id, and a person reads "Ada", an agent by
 * its kind, "Slash", "BrainDog" for the record's own work. These are the words Put back says a writer in
 * (`whoOf` in `kernel/src/undo.ts`), which that file keeps to itself. A version no line was written for is an
 * add-on's when one installed it, and nobody's otherwise.
 *
 * HELD AS `arrangement({ page })` IS: anyone who reads the record, and only a page they may open, by the rule of
 * `seesPage` in `index.ts` asked of `readable`. A page made for each row of a list has no declaration of its own,
 * so its versions are its template's. A page they may not open and a page that is not there are the same refusal,
 * which names what was asked and the pages there are.
 *
 * AND EACH VERSION IS CUT TO THE LISTS ITS READER MAY READ. `opens` asks about the lists the page
 * reads TODAY, and an older version may have read others: a Desk that once drew Salaries handed that block's source to
 * somebody invited to Notes alone. So a block over a list the caller may not read is left out of the version, and so
 * is a block whose words name that list, and `cut` says how many were left out. It says a count and never which
 * lists. A cut version is not the page as it stood, so a host does not offer to put it back: applying it would take
 * those blocks away from everybody.
 *
 * AND SO IS A BLOCK OVER A FIGURE THE RECORD NO LONGER HOLDS. The kernel names a figure's lists by
 * reading the figure, and one since taken out reads nothing, so a stat over a payroll total came back whole to the
 * Notes reader the day the total was retired. Nothing left says which lists it read, so the block is left out for
 * anybody who does not read every list, and counted in `cut` with the rest.
 * AND A BLOCK OVER A SOURCE FROM A PART OF THE CODE SINCE REMOVED goes the same way (integrate 66): the kernel says
 * whether it knows a source (`sourceKnown`), and one it does not know names no list to check a reader against.
 *
 * A BODY BEGINS WITH ITS KIND. The kernel stores a declaration with its keys in order of spelling, `blocks` first,
 * and `setDeclaration` reads the kind off the first key, so a version handed back as stored was refused when Put back
 * applied it. Each body is answered `page` first.
 */

import { slugify } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Body = Record<string, unknown>;

/** One version of a page's declaration, as a person reads it in History. */
export type PageVersion = {
  version: number;
  /** When it was applied. */
  at: string;
  /** The version the page draws from now. */
  live: boolean;
  /** Who applied it, by name, or `null` when the log holds no line for it and no add-on wrote it. */
  by: string | null;
  /** The declaration as it stood, `page` first, which Put back applies again and Save writes to a file. */
  body: Body;
  /**
   * How many blocks were left out because they read or name a list this reader may not read. Absent when the version
   * is whole. A version that says it is not what the page held, and is not put back.
   */
  cut?: number;
};

/** What `pageVersions` answers: the page by its address and title, and its versions newest first. */
export type PageVersions = { page: string; title: string; versions: PageVersion[] };

/** How many versions one read answers, newest first, as `VERSIONS_SHOWN` bounds an automation's. */
export const PAGE_VERSIONS_SHOWN = 50;

/** The runs list, whose row says which agent a run was. */
const SESSION = 'session';

/** A run's spoken id, `S42`, which signs a write an agent made inside a run. */
const RUN = /^S[1-9][0-9]*$/u;

/** A list as a declaration's text says it, `register.bills`, and a row of one by its spoken id, `bills#4`. */
const NAMED = /register\.([A-Za-z0-9_-]+)/gu;
const SPOKEN = /(?<![A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_-]*)#[0-9]+/gu;

/** A `{{hole}}` in a sentence, and each word in one that could be a figure's id: `payroll-total` of `{{payroll-total.change}}`. */
const HOLE = /\{\{([^{}]*)\}\}/gu;
const WORD = /[a-z][a-z0-9_-]*/gu;

/**
 * Every figure a piece of a block's text could be naming. A key's whole value is one, with `metric.` before it when it
 * is a source and whatever follows its first colon left off (`cost:{{name}}` reads `cost`), and so is each word inside
 * a hole. A word of a plain sentence is not: it reads nothing.
 */
const figuresIn = (text: string): string[] => {
  const whole = text.trim().replace(/^metric\./u, '');
  const at = whole.indexOf(':');
  return [at < 0 ? whole : whole.slice(0, at), ...[...text.matchAll(HOLE)].flatMap((hole) => hole[1]!.match(WORD) ?? [])];
};

/** A declaration's keys with its kind first, as `setDeclaration` reads one. */
const kindFirst = (body: Body): Body => {
  const { page, title, ...rest } = body;
  return { ...(page === undefined ? {} : { page }), ...(title === undefined ? {} : { title }), ...rest };
};

/** Every piece of text a block or a key holds, but a block's `kind`, which is a word of the language and not the author's. */
const wordsOf = (node: unknown, key?: string): string[] =>
  typeof node === 'string'
    ? key === 'kind'
      ? []
      : [node]
    : Array.isArray(node)
      ? node.flatMap((n) => wordsOf(n))
      : node !== null && typeof node === 'object'
        ? Object.entries(node).flatMap(([k, v]) => wordsOf(v, k))
        : [];

/** The value of every `register:` key under a node: an inputs block's list, and each leg of a cash walk. */
const keyed = (node: unknown): string[] =>
  Array.isArray(node)
    ? node.flatMap(keyed)
    : node !== null && typeof node === 'object'
      ? Object.entries(node).flatMap(([k, v]) => (k === 'register' && typeof v === 'string' ? [v] : keyed(v)))
      : [];

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, readable, no, readsEveryList } = deps;

  /** A key this call does not take, in the sentence `index.ts`'s `stray` uses. */
  const stray = (args: Body, takes: readonly string[]): Refusal | null => {
    const key = Object.keys(args).find((k) => !takes.includes(k));
    return key === undefined ? null : { code: 'FIELD_UNKNOWN', fix: `${key} is not something this call takes. It takes ${takes.join(', ')}.`, at: key, allowed: [...takes] };
  };

  /** Whether the caller may open a page `kernel.pages()` lists: the rule of `seesPage` in `index.ts`, the row it is about admitted too. */
  const opens = (ctx: CallContext, p: { registers: string[]; about: { register: string; seq?: number | null } | null }): boolean =>
    (p.registers.length === 0 || p.registers.some((id) => readable(ctx, id) === null)) && (p.about === null || aboutSeen(ctx, p.about));

  /** Whether the row a page is made for is one she is shown: its list read, and the row admitted (`aboutSeen` in `index.ts`). */
  const aboutSeen = (ctx: CallContext, about: { register: string; seq?: number | null }): boolean => {
    if (readable(ctx, about.register) !== null) return false;
    if (typeof about.seq !== 'number' || kernel.scope(ctx, about.register) === undefined) return true;
    const row = kernel.get({ register: about.register, seq: about.seq });
    return row !== null && deps.sight.admits(ctx, row);
  };

  /**
   * Who an actor is, as a person reads it: a person by name, a run by its agent, and never an id.
   *
   * AN AGENT'S KIND IS READ OFF ITS RUN, AND THE RUNS ARE THE OWNER'S OWN LIST. A reader who may not read the runs, or
   * not that run, is told "An agent": "Claude Code" under a version said which app the owner works with to somebody the
   * runs were never shared with (the lens leftovers). An `agent:` actor says its kind in its own
   * name, and is held the same way.
   */
  const whoOf = (actor: string, ctx: CallContext): string => {
    if (actor === 'slash') return 'Slash';
    if (actor === 'system' || actor === 'rule:ladder' || actor === 'rule:additive' || actor === 'rule:update') return 'BrainDog';
    if (actor.startsWith('rule:') || actor.startsWith('script:')) return 'A rule';
    if (actor.startsWith('ingest:')) return 'An import';
    const spaced = (kind: string): string => kind.replace(/[-_]+/gu, ' ').replace(/^./u, (c) => c.toUpperCase());
    const runsRead = kernel.registers().has(SESSION) && readable(ctx, SESSION) === null;
    if (actor.startsWith('agent:')) return actor === 'agent:other' || !runsRead ? 'An agent' : spaced(actor.slice('agent:'.length));
    if (RUN.test(actor)) {
      if (!runsRead) return 'An agent';
      const run = kernel.get({ register: SESSION, seq: Number(actor.slice(1)) });
      if (run === null || !deps.sight.admits(ctx, run)) return 'An agent';
      const agent = run.fields.agent;
      return typeof agent === 'string' && agent !== '' && agent !== 'other' ? spaced(agent) : 'An agent';
    }
    return sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', actor)?.name?.trim() || 'Someone';
  };

  /**
   * What cuts a version for this caller: its body `page` first, less every block over a list they may not read, and
   * how many things were left out.
   *
   * THE LISTS A VERSION NAMES ARE ASKED OF `readable`, ONE AT A TIME, AS `opens` ASKS THE PAGE'S. They are the ones the
   * kernel reads off each block (`blockRegisters`: a source, a figure's lists, a walk's legs, the steps under a card),
   * and the ones the text says outright, `register.bills`, a `register:` key, a row's spoken id. A list since taken
   * out is asked the same way, so a version over one is cut for whoever was never let read it.
   *
   * THEN THE WORDS. A note beside the table that says "Raise the salaries in May" names the list as surely as the
   * table's source did, so a block whose text says a hidden list's id or its name as a word goes with it. A block's
   * `kind` is not text. What reads across the record (`*`) is not asked: its source names no list.
   *
   * SOMEBODY WHO READS EVERY LIST IS ASKED NOTHING and given each version whole.
   */
  const cutFor = (ctx: CallContext): ((stored: Body, titleNow: string) => { body: Body; cut: number }) => {
    if (readsEveryList?.(ctx) === true) return (stored) => ({ body: kindFirst(stored), cut: 0 });
    const lists = kernel.registers();
    /* THE FIGURES THIS RECORD HELD ONCE AND HOLDS NO MORE: every version of a declaration is kept, so a figure with
       rows and none of them live was taken out. One still there is the kernel's to read, below. */
    const gone = new Set(
      sql
        .all<{ id: string }>(
          "SELECT DISTINCT id FROM declaration d WHERE kind = 'metric' AND NOT EXISTS (SELECT 1 FROM declaration l WHERE l.id = d.id AND l.kind = 'metric' AND l.superseded_at IS NULL AND l.retired = 0)",
        )
        .map((r) => r.id.slice('metric.'.length)),
    );
    const unread = (node: unknown, key?: string): boolean => gone.size > 0 && wordsOf(node, key).some((text) => figuresIn(text).some((id) => gone.has(id)));
    /* AND A BLOCK OVER A SOURCE THIS BUILD NO LONGER KNOWS (`kernel.sourceKnown`): a part of the code that answered by
       name and has since been removed. It names no list, so nothing can say its reader may read what it drew. */
    const strange = (block: unknown): boolean => {
      const source = block !== null && typeof block === 'object' ? (block as { source?: unknown }).source : undefined;
      return typeof source === 'string' && !kernel.sourceKnown(source);
    };
    const asked = new Map<string, boolean>();
    const hiddenList = (list: string): boolean => {
      let said = asked.get(list);
      if (said === undefined) asked.set(list, (said = list !== '*' && list !== '' && readable(ctx, list) !== null));
      return said;
    };
    /* A block is JSON somebody wrote in an older language, so one the kernel cannot walk names what its text names. */
    const reads = (block: unknown): string[] => {
      try {
        return block !== null && typeof block === 'object' ? kernel.blockRegisters(block as Parameters<typeof kernel.blockRegisters>[0]) : [];
      } catch {
        return [];
      }
    };
    const said = (node: unknown): string[] => {
      const text = wordsOf(node).join('\n');
      return [...[...text.matchAll(NAMED)].map((m) => m[1]!), ...[...text.matchAll(SPOKEN)].map((m) => m[1]!).filter((id) => lists.has(id)), ...keyed(node)];
    };
    return (stored, titleNow) => {
      const { blocks: held, page, title, ...rest } = stored;
      const blocks: unknown[] = Array.isArray(held) ? held : [];
      const read = blocks.map(reads);
      const hidden = [...new Set([...read.flat(), ...said(blocks), ...said(rest)])].filter(hiddenList);
      if (hidden.length === 0 && !unread(stored) && !blocks.some(strange)) return { body: kindFirst(stored), cut: 0 };
      const words = hidden.flatMap((id) => [id, lists.get(id)?.name ?? '']).filter((w) => w.trim() !== '');
      const names = words.length === 0 ? null : new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map((w) => w.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
      /* WHAT A BLOCK SAYS THAT ITS READER MAY NOT BE SHOWN: a hidden list by its id or its name, or a figure the record
         no longer holds, whose lists nobody can name any more. */
      const says = (node: unknown, key?: string): boolean => (names !== null && wordsOf(node, key).some((text) => names.test(text))) || unread(node, key);
      /* A SETTING OF THE PAGE THAT NAMES ONE GOES TOO, and a page made for each row of a hidden list (`for:`) was about
         that list in every block, so none of them is kept. */
      const settings = Object.entries(rest).filter(([key, value]) => !says(value, key));
      const forHidden = rest.for !== undefined && !settings.some(([key]) => key === 'for');
      const kept = forHidden ? [] : blocks.filter((block, i) => !read[i]!.some((list) => hidden.includes(list)) && !says(block) && !strange(block));
      /* AND A TITLE THAT SAYS ONE IS ANSWERED AS THE PAGE IS TITLED NOW, which `pages` already shows this caller. */
      const retitled = says(title);
      const cut = blocks.length - kept.length + (Object.keys(rest).length - settings.length) + (retitled ? 1 : 0);
      return { body: { ...(page === undefined ? {} : { page }), ...(title === undefined ? {} : { title: retitled ? titleNow : title }), ...Object.fromEntries(settings), blocks: kept }, cut };
    };
  };

  return {
    /**
     * `{ page }`, a page by its address (`plans`, or `page.plans`). Answers `{ page, title, versions }`, the versions
     * newest first and at most `PAGE_VERSIONS_SHOWN` of them, each cut to the lists the caller may read and saying
     * `cut` when anything was left out.
     */
    async pageVersions(args: { page?: unknown } | undefined, ctx: CallContext): Promise<Result<PageVersions>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = stray((args ?? {}) as Body, ['page']);
      if (extra) return { ok: false, refusal: extra };
      const asked = args?.page;
      if (typeof asked !== 'string' || asked === '') return no('REQUIRED_MISSING', 'A page is asked for by its address, such as studies.', { at: 'page' });
      const slug = asked.startsWith('page.') ? asked.slice('page.'.length) : asked;
      const pages = kernel.pages().filter((p) => opens(ctx, p));
      const seen = pages.find((p) => p.slug === slug);
      /* ITS DECLARATION BY ITS OWN NAME, AND ELSE BY THE ADDRESS THAT NAME MAKES: a page named `my_plans` is opened at
         `my-plans`, which is what the app holds. A page made for a row reads its template's. */
      const live = seen === undefined ? [] : kernel.declarations().filter((d) => d.kind === 'page');
      const named = `page.${seen?.template ?? slug}`;
      const id = (live.find((d) => d.id === named) ?? live.find((d) => slugify(d.id.slice('page.'.length)) === slug))?.id;
      if (seen === undefined || id === undefined) {
        const there = pages.map((p) => p.slug);
        return no('PAGE_UNKNOWN', `There is no page called ${slug} that you can read. The pages are: ${there.length === 0 ? 'none' : there.slice(0, 20).join(', ')}.`, { at: 'page' });
      }
      const rows = sql.all<{ version: number; body: string; pack_id: string | null; created_at: string; superseded_at: string | null; retired: number }>(
        "SELECT version, body, pack_id, created_at, superseded_at, retired FROM declaration WHERE id = ? AND kind = 'page' ORDER BY version DESC LIMIT ?",
        id,
        PAGE_VERSIONS_SHOWN,
      );
      const cutTo = cutFor(ctx);
      const versions: PageVersion[] = rows.map((r) => {
        const by = sql.one<{ actor: string }>(
          "SELECT actor FROM event WHERE kind = 'declare' AND target = ? AND to_v = ? ORDER BY rowid DESC LIMIT 1",
          `declaration:${id}`,
          String(r.version),
        );
        const shown = cutTo(JSON.parse(r.body) as Body, seen.title);
        return {
          version: r.version,
          at: r.created_at,
          live: r.superseded_at === null && r.retired === 0,
          by: by ? whoOf(by.actor, ctx) : r.pack_id === null ? null : 'A plugin',
          body: shown.body,
          ...(shown.cut === 0 ? {} : { cut: shown.cut }),
        };
      });
      return ok({ page: seen.slug, title: seen.title, versions });
    },
  };
}
