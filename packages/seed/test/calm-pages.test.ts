/**
 * EVERY DECLARED PAGE IS CALM, as DIRECTION §35 asks of them (October 2nd: "i dont want a very 'busy' looking ui, rather
 * very tailored and to the point and easy to read"): a page opens on one line, holds at most six tiles before the rest is
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

test('THE SWEEP READS EVERY DECLARED PAGE, so a page left out is not a page passed', () => {
  assert.ok(pages.length >= 25, `only ${pages.length} pages were read`);
  for (const slug of ['money', 'portfolio', 'project', 'work', 'estate', 'agents', 'personal/home-personal', 'founder/home-founder', 'team/home-team', 'guide/guide', 'student/home-student', 'business/home-business'])
    assert.ok(pages.some(([s]) => s === slug), `${slug} is not swept`);
});

test('EVERY HEADING WEARS A GLYPH', () => {
  for (const [slug, page] of pages)
    for (const b of page.blocks)
      if (typeof b.heading === 'string') assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${slug}: ${b.heading} wears no glyph`);
});

test('EVERY PAGE THAT IS NOT ABOUT ONE ROW OPENS ON ITS LINE', () => {
  for (const [slug, page] of pages) {
    if (page.for !== undefined) continue;
    const first = page.blocks[0]!;
    assert.deepEqual([first.kind, first.lead], ['note', true], `${slug} opens on a ${first.kind} and not on its line`);
  }
});

test(`NO PAGE SHOWS MORE THAN ${ABOVE_THE_FOLD} TILES BEFORE THE REST IS FOLDED SHUT`, () => {
  for (const [slug, page] of pages) {
    const leads = page.blocks.filter((b) => b.lead && b.when !== undefined).map((b) => b.when!);
    /* AND A NOTE SAYING "MORE THAN ONE" BESIDE ITS TWIN SAYING "ONE" (`gt: n` and `is: n` on one figure, as Health says
       how many signs are unread): only one of the two draws, so the pair is one tile. */
    const twinOf = (b: Block): boolean =>
      b.kind === 'note' &&
      b.when?.gt !== undefined &&
      page.blocks.some((o) => o !== b && o.kind === 'note' && o.when?.metric === b.when!.metric && o.when?.is === b.when!.gt);
    const standsIn = (b: Block): boolean =>
      b.when !== undefined &&
      (b.when.lt !== undefined || twinOf(b) || leads.some((w) => w.metric === b.when!.metric && w.lt !== undefined && b.when!.gte === w.lt));
    const main = page.blocks.filter((b) => b.area !== 'rail');
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
    assert.ok(above.length <= ABOVE_THE_FOLD, `${slug} shows ${above.length} tiles before its fold: ${above.map((b) => b.heading ?? b.kind).join(', ')}`);
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
        const metric = about === undefined ? 'questions-open' : `questions-open:${about}`;
        assert.deepEqual(b.when, { metric, gt: 0 }, `${slug}: ${b.heading ?? b.kind} draws while nothing is asked`);
      }
});
