/**
 * What this caller is offered, in one read: `offered`, READ+ ("the list of resources in under a second").
 *
 * WHAT WAS SLOW. The agent door listed its resources by reading every fixed address in full to see whether it answered,
 * then drawing every page to find the figures on it, then listing the skills: 20 seconds on a record of 54 pages, 8
 * once the pages were drawn eight at a time, at the start of every session. All of that was run to learn five short
 * lists, and the record can say each of them without running anything.
 *
 * A FIXED ADDRESS IS DECIDED BY THE PERMISSION ITS OWN READER ASKS, NEVER BY RUNNING THE READ. `FIXED` below names each
 * address beside the check its method makes before it does any work (`index.ts`, and `inbox-patterns.ts` and
 * `understand.ts` beside this file). The inbox is the one that goes by more than a level: an owner, or a key its owner
 * gave the `inbox` reach, and in both cases a caller who reads the whole record.
 *
 * TWO PLACES NOW SAY EACH PERMISSION, AND THE TEST HOLDS THEM TOGETHER. `test/offered.test.ts` reads every address
 * through the record's own method for four callers and wants `fixed` to list exactly the ones that answered. A reader
 * whose check changes fails there, which is the sign that an address would be listed and then refused.
 *
 * WHAT A HOST CANNOT SERVE IS THE DOOR'S TO DROP. This says who may read an address, and a door on a host with no
 * `context` or `inbox` method leaves that address out as it does today.
 *
 * THE LISTS ARE `boot`'S RULE, THE PAGES ARE `pages`' AND THE FIGURES ARE `figures`': a list she reads, a page that
 * draws from one and is about no row she cannot read, and a figure every list of which she reads, so a figure offered
 * is one `metric` answers. No count is taken and no page is drawn for somebody who reads every list.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { sessionDeclaration, type MetricDecl } from '@braindog/kernel';

import { listFor } from '../agent-lists.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** One list by its id and the name the record gave it. */
export type OfferedList = { id: string; name: string };
/** One page by its address and its title. */
export type OfferedPage = { slug: string; title: string };
/** One figure: its id, the record's name for it, and whether it is read about one thing (`project-owed:Kiln`). */
export type OfferedFigure = { id: string; name: string; param: boolean };
/** One skill: its name and when to use it, which is `null` when the skill does not say. Never its text. */
export type OfferedSkill = { name: string; when: string | null };
export type Offered = { fixed: string[]; lists: OfferedList[]; pages: OfferedPage[]; figures: OfferedFigure[]; skills: OfferedSkill[] };

/** How many skills one read of the list takes, and the most one answer names. */
export const SKILLS_CHUNK = 200;
export const SKILLS_MOST = 1_000;

/** The list of runs, which `sessionsLive` asks by name. The skills are the list that plays their part (`listFor`). */
const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

/** Which check a fixed address's reader makes before it does any work. */
type Asks = 'self' | 'record' | 'any' | 'every' | 'runs' | 'inbox';

/**
 * Every address with no parameter, in the order the agent door lists them, each beside what its reader asks.
 *
 * - `self`: `whoami`, `guard(ctx, 'read')`, or a person or key at "Adds only" on the whole record who may add.
 * - `record`: `guard(ctx, 'read')`. `actions`, `arrangement` and its grammars, and `version`, which the door
 *   asks before it answers the two grammars it keeps as its own text.
 * - `any`: `scoped(ctx, 'read')`, a read that filters its own answer. `boot`, `context`, `digestToday`, `governance`,
 *   `automations`, `briefing`, `widgetGallery` (`widgets`), `exceptions`, `stale`, `learnings`, and `previewPage`, which draws `handoffs`. The four
 *   before it were each read whole to learn that they answer, about half of `resources/list` on a record his size.
 * - `every`: `understandPlan`, for somebody who reads every list, on a record that can walk what it holds.
 * - `runs`: `sessionsLive`, a read of the list of runs by name.
 * - `inbox`: `inbox` and `inboxPatterns`.
 */
const FIXED: readonly (readonly [string, Asks])[] = [
  ['whoami', 'self'],
  ['boot', 'any'],
  ['context', 'any'],
  ['understand', 'every'],
  ['handoffs', 'any'],
  ['briefing', 'any'],
  ['widgets', 'any'],
  ['exceptions', 'any'],
  ['stale', 'any'],
  ['learnings', 'any'],
  ['sessions/live', 'runs'],
  ['digest/today', 'any'],
  ['decisions', 'any'],
  ['inbox', 'inbox'],
  ['inbox/patterns', 'inbox'],
  ['actions', 'record'],
  ['automations', 'any'],
  ['arrangement', 'record'],
  ['grammar/page', 'record'],
  ['grammar/register', 'record'],
  ['grammar/metric', 'record'],
  ['grammar/proposals', 'record'],
  ['grammar/ingest', 'record'],
  ['grammar/kinds', 'record'],
  ['grammar/script', 'record'],
  ['grammar/automations', 'record'],
  ['grammar/pack', 'record'],
];

/** The addresses `offered` decides, for a door to hold its own list against: one it lists and this does not name is read as before. */
export const FIXED_ADDRESSES: readonly string[] = FIXED.map(([address]) => address);

export function methods(deps: RecordDeps) {
  const { kernel, guard, scoped, readable } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `inbox-patterns.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** A key its owner gave the `inbox` reach, as `inboxReached` in `index.ts` asks it. `Array.isArray`, so a word is no reach. */
  const reached = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    return p.kind === 'token' && p.level === 'owner' && Array.isArray(p.reach) && p.reach.includes('inbox');
  };

  /** Each check, asked once for a caller and only when an address needs it. */
  const asker = (ctx: CallContext): ((asks: Asks) => boolean) => {
    const said = new Map<Asks, boolean>();
    const ask = (asks: Asks): boolean =>
      asks === 'self'
        ? guard(ctx, 'read') === null ||
          ((ctx.principal.kind === 'person' || ctx.principal.kind === 'token') && ctx.principal.level === 'append' && guard(ctx, 'append') === null)
        : asks === 'record'
        ? guard(ctx, 'read') === null
        : asks === 'every'
          ? deps.readsEveryList?.(ctx) === true && deps.understood !== undefined
          : asks === 'runs'
            ? guard(ctx, 'read', SESSION) === null
            : asks === 'inbox'
              ? (reached(ctx) || guard(ctx, 'owner') === null) && whole(ctx)
              : true;
    return (asks) => {
      if (!said.has(asks)) said.set(asks, ask(asks));
      return said.get(asks)!;
    };
  };

  /**
   * Whether the row a page is made for is one she is shown: its list read, AND THE ROW ITSELF ADMITTED, as `aboutSeen` in
   * `index.ts` asks it. Asked of the list alone, a person another member kept private was listed to the owner's agent by
   * name (`braindog:page/<the row's slug>`) though reading it was refused: the title is the row's, so the name was the leak.
   */
  const aboutSeen = (ctx: CallContext, about: { register: string; seq?: number | null }): boolean => {
    if (readable(ctx, about.register) !== null) return false;
    if (typeof about.seq !== 'number' || kernel.scope(ctx, about.register) === undefined) return true;
    const row = kernel.get({ register: about.register, seq: about.seq });
    return row !== null && deps.sight.admits(ctx, row);
  };

  /** The pages she may open, as `pages` in `index.ts` lists them. */
  const pagesFor = (ctx: CallContext): OfferedPage[] => {
    /* HELD FROM NO BLOCK, as `pages` asks it: every list read, and a level that reads. Her pages are not drawn to ask. */
    const everyList = deps.readsEveryList?.(ctx) === true && guard(ctx, 'read') === null;
    const out: OfferedPage[] = [];
    /* HELD WHILE THE VERSION STANDS when the record hands them so (`pagesNow`): resolving every page is most of this read. */
    for (const p of deps.pagesNow?.() ?? kernel.pages()) {
      /* `seesPage`: any list the page draws from is one she reads, or it draws from none, and never a page about a row
         in a list she cannot read, whose title is that row's. */
      if (p.registers.length > 0 && p.registers.every((id) => readable(ctx, id) !== null)) continue;
      if (p.about !== null && !aboutSeen(ctx, p.about)) continue;
      if (!everyList && (deps.withheld === undefined || deps.withheld(ctx, p.slug))) continue;
      out.push({ slug: p.slug, title: p.title });
    }
    return out;
  };

  /** The figures she may read, held to `metric`'s own check as `figures` in `index.ts` holds them: every list a figure reads. */
  const figuresFor = (ctx: CallContext): OfferedFigure[] => {
    const out: OfferedFigure[] = [];
    for (const row of kernel.declarations()) {
      if (row.kind !== 'metric') continue;
      const decl = JSON.parse(row.body) as MetricDecl;
      if (kernel.figureLists(decl).some((list) => readable(ctx, list) !== null)) continue;
      out.push({ id: row.id.slice('metric.'.length), name: decl.name, param: row.body.includes('{{it}}') });
    }
    return out;
  };

  /**
   * The skills by name, with when to use each, read a chunk at a time and never with their text.
   *
   * THE LIST THAT PLAYS THE PART OF THE SKILLS, whatever it is called, and none on a record that keeps no skills.
   *
   * ONCE A NAME, THE ONE THE LIST HANDS FIRST. A skill kept for every project and again for one project is two entries
   * with one name, and `braindog:skill/<name>` reads the first the list hands it. A retired skill is not offered.
   */
  const skillsFor = (ctx: CallContext): OfferedSkill[] => {
    const skillList = listFor('skills', kernel.registers());
    if (skillList === null || readable(ctx, skillList) !== null) return [];
    const rule = kernel.scope(ctx, skillList);
    const named = new Map<string, OfferedSkill>();
    let cursor: string | null | undefined;
    do {
      const page = kernel.list({ register: skillList, limit: SKILLS_CHUNK, ...(cursor ? { cursor } : {}) }, rule);
      if (!page.ok) break;
      for (const entry of page.value.rows) {
        const name = entry.fields.name;
        if (entry.state === 'retired' || typeof name !== 'string' || name === '' || named.has(name)) continue;
        const when = entry.fields.trigger;
        named.set(name, { name, when: typeof when === 'string' && when !== '' ? when : null });
        if (named.size >= SKILLS_MOST) break;
      }
      cursor = page.value.cursor;
    } while (cursor && named.size < SKILLS_MOST);
    return [...named.values()];
  };

  return {
    /**
     * Everything this caller is offered, in one read: the fixed addresses she may read, the lists, the pages, the
     * figures, and the skills by name. READ+, and filtered to her as `boot` is.
     */
    async offered(ctx: CallContext): Promise<Result<Offered>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* ONE TRANSACTION, SO ONE MOMENT, as `boot` reads: a list installed between two of these is in all of them or none. */
      return ok(
        kernel.transaction(() => {
          const asks = asker(ctx);
          const lists: OfferedList[] = [];
          for (const [id, decl] of kernel.registers()) if (readable(ctx, id) === null) lists.push({ id, name: decl.name });
          return {
            fixed: FIXED.filter(([, need]) => asks(need)).map(([address]) => address),
            lists,
            pages: pagesFor(ctx),
            figures: figuresFor(ctx),
            skills: skillsFor(ctx),
          };
        }),
      );
    },
  };
}
