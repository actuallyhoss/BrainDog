/**
 * EVERY DECLARED PAGE IS CALM (since October 2nd: not a busy-looking UI, but one tailored, to the point and easy to
 * read): a page holds at most six tiles before the rest is
 * folded shut, wears a glyph on every heading, and says none of its line's figures again in a tile beside it.
 *
 * READ OFF THE DECLARATIONS AND NOT A DRAWN PAGE, because what a record draws depends on its rows and these hold the
 * page on every record: the first-party modules' pages, the agents pack's, and every starter use case's own.
 *
 * WHAT IS COUNTED AS A TILE ABOVE THE FOLD is what can stand on the page at once. A lead is the page's line and is not
 * a tile, and neither is what stands in for one: a tile drawn only while something is missing (`when: { lt }`, the box
 * to add a first account), or one drawn exactly while a lead is not (Money's figure a book, while one Cash now over two
 * books would mean nothing). A boxed section and the blocks it holds are one tile. The rail is looked up beside the page
 * and is not counted either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENTS_PAGES, PAGES } from '../src/index.ts';
import { USE_CASES } from '../src/usecases/index.ts';

type When = { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number };
type Block = { kind: string; heading?: string; icon?: string; lead?: boolean; fold?: boolean; box?: boolean; area?: string; when?: When; body?: string; cells?: { metric: string }[] };
type Page = { page: string; for?: unknown; blocks: Block[] };

const pages: [string, Page][] = [
  ...Object.entries({ ...PAGES, ...AGENTS_PAGES }).map(([slug, p]) => [slug, p as unknown as Page] as [string, Page]),
  ...USE_CASES.flatMap((u) =>
    ((u.pack?.declarations ?? []) as Record<string, unknown>[])
      .filter((d) => typeof d.page === 'string')
      .map((d) => [`${u.usecase}/${String(d.page)}`, d as unknown as Page] as [string, Page]),
  ),
];

/** The most tiles a page shows before the rest is folded shut. */
const ABOVE_THE_FOLD = 6;

/**
 * THE ONE PAGE LET OVER IT, AND BY HOW MANY, UNTIL IT IS RULED ON (book-lasts-year-78). A book's page stood at six, and
 * the line that its money lasts the year is a seventh: one sentence under What is due, drawn only while the walk never
 * goes under, in place of the cell Money lasts until. Whether it stays a tile of its own, becomes the page's line or
 * takes another tile's place is the owner's; nothing else is let over, and this page by no more than the one line.
 * SINCE money-core 3.34.0 THE BOOK'S PAGE IS NOT LET OVER: Cash ahead's own summary says how long the money lasts, and
 * the line went. The pages below are.
 */
/* AND MONEY'S HOME BY THREE, SINCE ROUND 1030 (the money parity plan of 29 October, his "finish all the money stuff"):
   Over time the whole row under the hero, This month's budgets beside Instalments, on a board the app packs by each
   tile's height. The board is his ask; whether it folds after six is the owner's to rule on. SINCE money-core 3.34.0 the
   line saying every budget as one month went, and the lines of Heads up stand under the hero, whether Cash now adds up
   and an old balance, each a tile while it is true. */
/* AND BUDGETS BY ONE, SINCE ROUND 1030 (a budget for a week or a year, money-core 3.32.0): This week's budgets and This
   year's budgets, each drawn only while such a budget is kept, beside the month's. By one and not two since money-core
   3.34.0, whose This month stat went into the line. */
/* SINCE money-core 3.34.0 A BOOK'S PAGE AND ACCOUNTS NEED NO ALLOWANCE: What you have and the line that the money lasts
   the year left the book, and the Balance bar left Accounts. */
/* AND AN ACCOUNT'S PAGE BY ONE, SINCE money-core 3.34.0: its hero is one of two stats, the balance once while the bank
   and the lines agree and the two figures while they differ, and only one of them is ever drawn. */
/* AND REPORTS BY ONE: Health is drawn as one of its stats, by whether some cash is in another currency, and only one
   of them is ever drawn. */
const OVER: Record<string, number> = { money: 3, 'money-budgets': 1, 'money-account': 1, 'money-reports': 1 };

test('THE SWEEP READS EVERY DECLARED PAGE, so a page left out is not a page passed', () => {
  assert.ok(pages.length >= 25, `only ${pages.length} pages were read`);
  for (const slug of ['money', 'portfolio', 'project', 'work', 'estate', 'agents', 'calendar', 'activity', 'personal/home-personal', 'founder/home-founder', 'team/home-team', 'guide/guide', 'student/home-student', 'business/home-business'])
    assert.ok(pages.some(([s]) => s === slug), `${slug} is not swept`);
});

test('EVERY HEADING WEARS A GLYPH', () => {
  for (const [slug, page] of pages)
    for (const b of page.blocks)
      if (typeof b.heading === 'string') assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${slug}: ${b.heading} wears no glyph`);
});

/* NO PAGE HAS TO OPEN ON A LINE ANY MORE (3 Nov, "i dont like those briefs at all, remove them"): a line that only
   counted what the page under it shows went, so the sweep no longer asks every page for one. */

test(`NO PAGE SHOWS MORE THAN ${ABOVE_THE_FOLD} TILES BEFORE THE REST IS FOLDED SHUT`, () => {
  for (const [slug, page] of pages) {
    const leads = page.blocks.filter((b) => b.lead && b.when !== undefined).map((b) => b.when!);
    /* AND A NOTE SAYING "MORE THAN ONE" BESIDE ITS TWIN SAYING "ONE" (`gt: n` and `is: n` on one figure, as Health says
       how many signs are unread): only one of the two draws, so the pair is one tile. */
    const twinOf = (b: Block): boolean =>
      b.kind === 'note' &&
      b.when?.gt !== undefined &&
      page.blocks.some((o) => o !== b && o.kind === 'note' && o.when?.metric === b.when!.metric && o.when?.is === b.when!.gt);
    /* A WHEN THAT HOLDS ALL OF SEVERAL is drawn only while something is missing if any one of them is (`lt`): Money's Over
       time draws Cash's line in net worth's place until net worth has a week of nights. */
    const missing = (w: When & { all?: When[] }): boolean => w.lt !== undefined || (w.all ?? []).some((c) => c.lt !== undefined);
    const standsIn = (b: Block): boolean =>
      b.when !== undefined &&
      (missing(b.when) || twinOf(b) || leads.some((w) => w.metric === b.when!.metric && w.lt !== undefined && b.when!.gte === w.lt));
    /* THE CAPTURE LINE RIGHT AFTER THE SENTENCE IS IN THE HEADER, NOT A TILE (`captured` in apps/web/src/lib/page/PageBody.svelte). */
    const opening = page.blocks.find((b) => !b.lead);
    const main = page.blocks.filter((b) => b.area !== 'rail' && !(b === opening && b.kind === 'capture'));
    const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
    /* A BOXED SECTION AND THE BLOCKS AFTER IT, UP TO THE NEXT SECTION, ARE ONE TILE, as the app draws them (`boxesOf` in
       `apps/web/src/lib/page/layout.ts`): Money's Heads up is one tile of three lines, not three tiles. */
    let boxed = false;
    const above = (fold < 0 ? main : main.slice(0, fold)).filter((b) => {
      if (b.kind === 'section') {
        boxed = b.box === true;
        return boxed;
      }
      return !boxed && !b.lead && !standsIn(b);
    });
    assert.ok(above.length <= ABOVE_THE_FOLD + (OVER[slug] ?? 0), `${slug} shows ${above.length} tiles before its fold: ${above.map((b) => b.heading ?? b.kind).join(', ')}`);
    /* AND AN ALLOWANCE NOBODY NEEDS ANY MORE IS TAKEN OUT, not left for the next tile to use. */
    if (OVER[slug] !== undefined) assert.equal(above.length, ABOVE_THE_FOLD + OVER[slug], `${slug} no longer needs to be let over ${ABOVE_THE_FOLD}`);
  }
});

test('NO TILE SAYS AGAIN A FIGURE THE LINE ABOVE IT SAYS', () => {
  const said = (body: string | undefined): string[] => [...String(body ?? '').matchAll(/\{\{([a-z0-9-]+)\}\}/gu)].map((m) => m[1]!);
  for (const [slug, page] of pages) {
    const line = new Set(page.blocks.filter((b) => b.kind === 'note' && b.lead).flatMap((b) => said(b.body)));
    for (const b of page.blocks)
      for (const c of b.cells ?? []) assert.ok(!line.has(c.metric), `${slug}: ${b.heading ?? b.kind} says ${c.metric}, which the line says`);
  }
});

test('A QUEUE OF QUESTIONS IS DRAWN ONLY WHILE ONE IS ASKED, so no page carries a band saying nothing waits', () => {
  for (const [slug, page] of pages)
    for (const b of page.blocks as (Block & { source?: string })[])
      if (b.kind === 'queue' && b.source === 'governance.open') {
        /* A QUEUE NARROWED TO ONE THING IS GATED ON THAT THING'S COUNT, `questions-open:<it>`, so a project page with nothing
           asked about it draws no band while the record has questions elsewhere. */
        const about = /^about is (.+)$/u.exec((b as { where?: string }).where ?? '')?.[1];
        /* AND A QUEUE NARROWED TO ONE LIST (`list is tasks`) IS GATED ON THAT LIST'S COUNT, `questions-open-in:<list>`, or on
           the record's (team/home-team gates its list-narrowed queue on questions-open). */
        const list = /^list is (.+)$/u.exec((b as { where?: string }).where ?? '')?.[1];
        const metrics = about !== undefined ? [`questions-open:${about}`] : list !== undefined ? [`questions-open-in:${list}`, 'questions-open'] : ['questions-open'];
        assert.ok(metrics.some((metric) => JSON.stringify(b.when) === JSON.stringify({ metric, gt: 0 })), `${slug}: ${b.heading ?? b.kind} draws while nothing is asked`);
      }
});
