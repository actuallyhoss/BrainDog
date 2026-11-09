/**
 * The kernel's constants and the few small rules a screen reads, as `@braindog/kernel/constants`, with nothing heavy
 * behind them.
 *
 * THE APP'S FIRST OPEN READ THE WHOLE KERNEL FOR A HANDFUL OF THESE. `PEOPLE` lived in `people.ts`, whose imports reach
 * the identity keys, the built-in figures and two migrations; `COSTS` in `weigh.ts`; `REDUCES`, `ROW_TEXT_MOST` and
 * `railRoom` in `pages.ts`, which imports half the kernel. A screen that asks for one of them here asks for this file and
 * the four small ones it reads, each of which imports nothing but types. `test/constants.test.ts` holds that true.
 *
 * DEFINED HERE, NOT COPIED. `pages.ts`, `weigh.ts` and `people.ts` import these and export them again, so the root
 * `@braindog/kernel` still answers every name it did, and there is one value for each.
 */

import { LEGACY } from './legacy-lists.ts';

export { ABANDON_MS, QUIET_MS, STALE_MS, WORKING_MS, isQuiet, isStale, presenceOf, type Presence } from './presence.ts';
export { GROUP_CAP, isBucket } from './buckets.ts';
export { isEventKind } from './events.ts';
/* WHICH LINES THE BELL HOLDS, which the record walks its log by and the web's bell reads its answer by. */
export { RAN_BADLY, bellNever, bellWorthy, runFailed, writerOf, type BellShape } from './bell.ts';

/**
 * The list `meet` wrote by name before any list declared `meets:`, and still does while none does. The record's `meet`
 * guard reads `kernel.meetsList()` and not this name; only its members' names gate, `namesFor`
 * (`packages/record/src/index.ts`), still names `people`, by list and by module.
 */
export const PEOPLE = LEGACY.meets;

/**
 * The four, worst first — which is the order they are ranked in, and the order they are compared in.
 *
 * - `undo`  — accepting it is hard to take back, because Put back has nothing to go back to: it
 *             turns a pack off, it moves money, it retypes a field that holds answers, it adds a
 *             field to a list that holds rows, it changes a value the history withholds, or every
 *             option it offers is one its proposer marked hard. The other button tomorrow does not
 *             return the record to where it was.
 * - `shape` — accepting it changes what everyone sees: a pack installed or turned on, a pack's
 *             settings, a page, a declaration that is new or replaces one. Reversible, and not quietly: everyone
 *             who opens the record meets it.
 * - `rows`  — accepting it adds rows, changes or removes rows that exist, or adds a rule that will
 *             add them. Deletable, put back or restored, one at a time.
 * - `call`  — a judgement with nothing attached. Accepting it writes a decision and its reason and
 *             changes no part of the record, which is what makes it the cheapest to get wrong and
 *             the one most worth thinking about last.
 */
export const COSTS = ['undo', 'shape', 'rows', 'call'] as const;

export type Cost = (typeof COSTS)[number];

/**
 * The kinds whose answer is ADDED UP over the rows, so a block of one over more rows than a page reads would draw a part
 * of the list as the whole. What they are drawn from, and why `section` is not one of them, is argued in `pages.ts` above
 * `wholeOf`.
 *
 * IT IS CALLED `SUMS` AND IT USED TO BE CALLED `REDUCES`, which was the name of a DIFFERENT SET one
 * import away. `apps/web/src/lib/record/schema.ts` exported a `REDUCES` of these five plus
 * `section`, and this file exported a `REDUCES` of the five, both `ReadonlySet<string>` and both
 * importable into the same module: `page-live.ts` imports one of them today, and adding
 * `import { REDUCES } from '@braindog/kernel'` beside it would have compiled and answered
 * differently about `section`, with nothing in either name to say they disagreed. Two names now,
 * one question each, and `apps/web`'s `block-kinds.test.ts` holds the two packages together.
 */
/* `ReadonlySet` BECAUSE IT LEAVES THE PACKAGE, which `SLASH_KINDS` in `slash.ts` is declared as for
   the same reason: a bare `new Set` exported hands every caller `add` and `delete` on the set the
   kernel refuses by. */
/* `heat` IS ONE OF THEM BECAUSE IT ADDS THE ROWS ON ONE DAY TOGETHER (`render/src/heat.ts`), and it was left out when
   the kind landed. Measured over a register of sixty rows on sixty days: fifty rows, `matched: 60`, no refusal, so ten
   busy days were drawn as gaps. `ring` IS NOT, though it can look like one: over a register it draws one row it counts
   (`ringOf`), two `matched` figures and never a row read, so a ceiling would refuse a ring over 201 tasks for a limit
   it never meets. */
export const SUMS: ReadonlySet<string> = new Set(['bar', 'chips', 'gauge', 'heat', 'progress', 'split']);

/**
 * `SUMS` and `section`: the kinds whose count on screen is the WHOLE MATCH rather than the page drawn.
 *
 * Nothing in the kernel reads it, and it is here rather than in the app because it is a fact about
 * the record's own dialect that every consumer with a screen has to get right. `apps/web` reads it
 * for the slice line under a block, on both of its engines: `api.ts` over the sample and
 * `page-live.ts` over a live answer. The two disagreed about `section` while this was one set doing
 * both jobs, and the page said it twice, differently, for the same declaration: measured through
 * `blockOf` on a section with 2 rows and `matched: 301`, `shown 2, total 301`, which is what
 * `/p/[slug]` prints "Showing 2 of 301" on, over a heading that draws no row of its own and whose
 * own count says 301, while the same heading on the sample printed nothing.
 *
 * DERIVED FROM `SUMS` RATHER THAN LISTED AGAIN, so the only way the two can disagree is the one
 * kind that is the actual difference between the questions.
 */
export const REDUCES: ReadonlySet<string> = new Set([...SUMS, 'section']);

/**
 * HOW MANY PAGES OUT OF ONE TEMPLATE A RAIL DRAWS, and the rule lives in the kernel because two rails obey it.
 *
 * A template carrying `nav` is one rail entry per row it admits, which is a rail that grows with
 * the record. Measured end to end through the record's own `boot` at his size, 27 projects, 23
 * services and 22 skills over three nav-carrying templates: 72 rail entries, one per row, against
 * 15 with this cap. A rail that grows without bound is a rail that stops being a rail.
 *
 * THE BUDGET IS KEYED ON THE REGISTER AND THE HEADING TOGETHER. Per register alone, the first
 * template over a list spends the whole budget and a second one drew NOTHING: measured in
 * `apps/web` with a `Clients` template beside the shipped `Projects` one over the same 26 rows,
 * Projects drew 6 and Clients drew 0, so a heading somebody had declared was gone rather than
 * short. A page nobody generated is never counted at all, so rows can never push out a page
 * somebody wrote.
 *
 * IT IS IN THE KERNEL BECAUSE THE SAMPLE AND THE LIVE SHELL BOTH HAVE TO OBEY IT, and they are in
 * different files with no other package between them. The cap shipped as a local constant inside
 * the sample's `boot()` (then in `apps/web/src/lib/record/api.ts`, now in
 * `apps/web/src/lib/record/fixtures/readers.ts`), which is the SAMPLE's rail: the sample is four
 * projects forever, so the rule was true where it changed nothing and absent from the rail a real
 * record draws, where the same 26 links were still being offered every morning.
 *
 * NOTHING IS HIDDEN BY IT. Every page keeps its own address, stays in the list of pages a caller
 * may open, and the list it came out of carries the whole count beside its name in the rail.
 */
export const RAIL_PAGES = 5;

/**
 * The counter that rule needs, made once per rail: it answers whether one page may be drawn.
 *
 * A page with no `about` is a page somebody wrote, and it is always drawn. A page out of a
 * template is drawn while its register and heading have room, and the ones kept are the first
 * `RAIL_PAGES` offered, which is the order the rail draws them in.
 *
 * THE KEY IS A JSON PAIR RATHER THAN TWO STRINGS JOINED, because a heading is somebody's own
 * words and any separator picked here is one they are allowed to type.
 */
export function railRoom(): (about: { register: string; section: string } | null | undefined) => boolean {
  const drawn = new Map<string, number>();
  return (about) => {
    if (!about) return true;
    const key = JSON.stringify([about.register, about.section]);
    const n = (drawn.get(key) ?? 0) + 1;
    drawn.set(key, n);
    return n <= RAIL_PAGES;
  };
}

/**
 * The characters of one text a page's row carries before it is cut, as many as `list` gives an agent (`packages/mcp`).
 * Counted in code points, so a cut never splits a character in two.
 */
export const ROW_TEXT_MOST = 280;
