/**
 * EVERY MONEY FIGURE A DECLARED PAGE DRAWS, MEASURED IN A REAL BROWSER AGAINST THE CELL IT HAS TO FIT.
 *
 * `60c6b817` repaired a truncated money figure on `/p/portfolio` and recorded the whole repair in a
 * thirty-seven line comment at `routes/p/[slug]/+page.svelte:1172`: three slot widths, three cell
 * widths, a figure width, three cut amounts, two widths either side of the threshold, two phone slot
 * widths and a rem threshold rejected after being measured. Fifteen figures, every one of them
 * reproducible, and not one of them asserted anywhere. `loop/research-batch-five-audit.md` finding 7
 * is that nothing will ever re-take those measurements, and that the headroom at the width the
 * threshold was solved for is 0.8px: a 280px slot gives each of two cells 124px, and the widest
 * ten-character money figure in the record draws 123.2px of ink. A font whose digits are one percent
 * wider closes that, and `13 §4.2` says what happens then — a truncated figure is not shortened, it
 * is wrong.
 *
 * THIS FILE IS THE MEASUREMENT RATHER THAN THE PROSE, and it is the first of the two repairs that
 * audit offers and not the second: the threshold is still a hand-solved 280px, in a file this run
 * does not own. What is new is that the 0.8px is read off a drawn page on every run and printed, so
 * the font swap that closes it is a failing test rather than a screenshot somebody notices later.
 *
 * AND FINDING 6 IS ANSWERED HERE TOO, IN THE SECOND TEST, FOR THE SAME REASON. That finding is that
 * the commit's message puts the defect on a phone at 390px where the diff changes nothing at 390, 360
 * or 320, and that what it really repairs is a narrow slot between 900 and 1180. The honest repair
 * would be the sentence over the rule, and `+page.svelte` was not this run's file to edit, so the
 * correction is made the way that cannot go stale: the second test lifts the rule back out of the
 * cascade and measures both claims. In the narrow slot the figures come back cut by 52.2px, 31.7px
 * and 5.7px. On a phone, not one value moves. A reader who believes the message will be corrected by
 * a test run rather than by another paragraph.
 *
 * WHY A BROWSER AND NOT A CLASS NAME. The defect is ink wider than a box. Asserting that a rule
 * exists, or that an element carries a class, says nothing about either: the whole chain from
 * `--t-xl` through `letter-spacing: -0.02em` and `font-variant-numeric: tabular-nums` to the shipped
 * woff2's own digit advances decides it, and only a layout engine knows the answer. So the shipped
 * cascade is assembled in the order `+layout.svelte` imports it, the shipped Geist is handed to it
 * as the app's own `@font-face` with its `url()` pointed at the file on disk, and the markup is
 * `toHTML` over the segments `blocks.ts` builds from the declared pages. The figure strings under
 * test are the strings the app draws, not fixtures written beside them.
 *
 * THE FONT IS CHECKED BEFORE ANYTHING IS MEASURED. Without that check this harness quietly measured
 * a fallback face and answered 113.4px for `£22,600.00` where the app draws 123.2px — a measurement
 * that would have passed every assertion below while proving nothing, and passed it because the
 * fallback is NARROWER. With the real file it answers 123.203125px, which is to the pixel what the
 * audit read on a harness of its own.
 *
 * AND THE GEOMETRY IS THE APP'S, NOT A LIST OF WIDTHS SOMEBODY TYPED. The first version of this file
 * pinned slot widths from 174px upward for every block and reported ten figures cut in a 280px slot
 * at a laptop window. Every one of those was a lie about the app: nine of the ten stat blocks on the
 * declared pages are `span: 12` and a full-width slot at a laptop window is 586px at 900 and 1216px
 * at the page's own maximum, never 280. Only `/p/portfolio`'s `Earning` is `span: 4`, which is the
 * block the audit is about. So the shell, the rail, the body and the twelve-column page are built
 * here as the app builds them, and the slot width per span is READ OFF that page at each viewport
 * rather than asserted from the comment. `--rail`, `--gutter`, `--sp-6` and `--page-max` do the
 * arithmetic, so a token moving moves this test with it.
 *
 * THE LAYOUT GATE CANNOT SEE THIS, which is why the measurement is here and not there.
 * `tools/gates/layout.mjs` reports an element only when it reaches past the WINDOW with nothing
 * scrolling above it, and a figure overflowing a 124px cell in the middle of a scrolling page does
 * neither. That narrowing is deliberate and right for its own subject; truncation inside a cell is a
 * different defect, and this is the file that measures it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { chromium, type Page } from '@playwright/test';
import { toHTML } from 'braindog-render';

import { spanOf } from './arrange.ts';
import { page, pages } from './api.ts';
import { toSegments } from './blocks.ts';

const ROOT = new URL('../../../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

/**
 * `:global(…)` OFF, BY SCANNING AND NOT BY A PATTERN, because these selectors nest two parentheses
 * deep. The audit that raised this finding got exactly this wrong first and left it in as a warning:
 * its harness unwrapped with a one-level pattern, which cannot match
 * `:global(.grid:has(> .cell:nth-child(2)))`, so the rule under test survived as invalid CSS, the
 * parser dropped it, and the first run reported that the repair fires at no width at all. A balanced
 * scan cannot make that mistake, and the assertion below refuses to run if a `:global(` survives.
 */
function unglobal(css: string): string {
  const open = ':global(';
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (!css.startsWith(open, i)) {
      out += css[i];
      i += 1;
      continue;
    }
    let depth = 1;
    let j = i + open.length;
    for (; j < css.length && depth > 0; j += 1) {
      if (css[j] === '(') depth += 1;
      else if (css[j] === ')') depth -= 1;
    }
    out += css.slice(i + open.length, j - 1);
    i = j;
  }
  return out;
}

/** One at-rule, as a width in px and as the byte range of its whole block, so a rule can be read AND removed. */
type Guard = { readonly px: number; readonly start: number; readonly end: number };

/**
 * Every `@media (width …)` or `@container (inline-size …)` in a stylesheet, as px at a 16px root.
 *
 * rem IS CONVERTED AND NOT REFUSED, because `blocks.css` writes its stat thresholds in rem while the
 * route writes its money threshold in px, deliberately, for the reason the route's own comment
 * argues at length. Both belong in this list, in the unit the measurement is in.
 */
function guards(css: string, needle: string): Guard[] {
  const out: Guard[] = [];
  for (let i = css.indexOf(needle); i !== -1; i = css.indexOf(needle, i + 1)) {
    const close = css.indexOf(')', i);
    const said = css.slice(i + needle.length, close).trim();
    const px = said.endsWith('rem') ? Number(said.slice(0, -3)) * 16 : Number(said.slice(0, -2));
    assert.ok(Number.isFinite(px) && px > 0, `a width read out of a stylesheet is not a width: ${JSON.stringify(said)}`);
    /* The block's own braces, matched, so `end` is past the closing one whatever nests inside it. */
    let depth = 0;
    let j = css.indexOf('{', close);
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    out.push({ px, start: i, end: j });
  }
  return out;
}

/** The `<style>` of a Svelte component, as plain CSS a browser will parse. */
function componentCss(path: string): string {
  const src = read(path);
  const open = src.indexOf('<style>');
  const close = src.lastIndexOf('</style>');
  assert.ok(open !== -1 && close > open, `${path} has no <style> block, so this harness is assembling the wrong cascade`);
  return unglobal(src.slice(open + '<style>'.length, close));
}

const ROUTE = 'apps/web/src/lib/page/PageView.svelte';
const routeCss = componentCss(ROUTE);
const shellCss = componentCss('apps/web/src/routes/+layout.svelte');
const blocksCss = read('apps/web/src/lib/blocks.css');

/**
 * THE CASCADE IN SOURCE ORDER, because layer order is established by the opening statement of
 * `tokens.css` and everything under it depends on that. `+layout.svelte` imports these five in this
 * order and then `blocks.css`; its own `<style>` and the route's come after, as component styles do.
 */
const SHEETS = [
  /* THE SHIPPED FONT, REACHABLE. `tokens.css` asks for `/fonts/geist.woff2`, which resolves against
     nothing at all in a page built from a string, so the `@font-face` failed and the whole
     measurement was a fallback face. This is the shipped declaration with the shipped file inlined:
     same weight range, same unicode-range, same swap. */
  read('packages/skin/tokens.css').replace(
    '/fonts/geist.woff2',
    `data:font/woff2;base64,${readFileSync(new URL('apps/web/static/fonts/geist.woff2', ROOT)).toString('base64')}`,
  ),
  read('packages/skin/house.css'),
  read('packages/skin/base.css'),
  read('packages/skin/a11y.css'),
  read('apps/web/src/app.css'),
  blocksCss,
  shellCss,
  routeCss,
];

const CASCADE = SHEETS.join('\n');

/** One stat block, as the markup the app draws it as and the span the page lays it out at. */
type Grid = { readonly where: string; readonly span: number; readonly html: string };

const GRIDS: Grid[] = Object.keys(pages()).flatMap((slug) =>
  (page(slug)?.blocks ?? [])
    .filter((block) => block.kind === 'stat')
    .map((block) => ({
      where: `/p/${slug} ${block.heading ?? 'stat'}`,
      /* THE SPAN THE PAGE ACTUALLY USES, through the same clamp the page applies, never the declared
         one: `arrange.ts` floors a span at what the block survives and that floor is silent. */
      span: spanOf(block.kind, block.span, block.columns.length),
      html: toHTML(toSegments(block)),
    })),
);

const SPANS = [...new Set(GRIDS.map((g) => g.span))].sort((a, b) => a - b);

/**
 * THE VIEWPORT BANDS, READ OUT OF THE STYLESHEETS, which is `layout.mjs`'s idea one layer down: a
 * `@media (width < 900px)` anywhere in the cascade is a width at which this app changes its mind, and
 * a band added tomorrow is measured tomorrow without anybody editing this file.
 *
 * THE FLOOR IS 320, the narrowest phone `layout.mjs` sweeps. THE CEILING IS 1600, and it is a
 * derived number rather than a taste: `.page` stops growing at `--page-max`, so above that plus the
 * rail and the gutters every width below is the same width, and probing 2560 would probe 1600 twice.
 */
const FLOOR = 320;
const CEIL = 1600;
const EDGES = [
  ...new Set(
    SHEETS.flatMap((css) => [...guards(css, '@media (width < '), ...guards(css, '@media (width >= ')].map((g) => g.px)).filter(
      (px) => px > FLOOR && px <= CEIL,
    ),
  ),
].sort((a, b) => a - b);
const BANDS = [FLOOR, ...EDGES].map((from, i) => ({ from, to: (EDGES[i] ?? CEIL + 1) - 1 }));

/**
 * The widths a stat grid's own container queries change their mind at, read the same way. The
 * route's money threshold is one of these and is not named here, so moving it from 280 to 300 moves
 * every width probed below.
 */
const STEPS = [...new Set([...guards(blocksCss, '@container (inline-size < '), ...guards(routeCss, '@container (inline-size < ')].map((g) => g.px))].sort(
  (a, b) => a - b,
);

type Seen = {
  readonly where: string;
  readonly slot: number;
  readonly text: string;
  readonly ink: number;
  readonly box: number;
  readonly room: number;
  readonly size: string;
  readonly columns: number;
};

/**
 * THE READING, IN THE PAGE. `scrollWidth` is an integer and the headroom under test is under a pixel,
 * so the ink comes off a Range over the figure's own text instead. A figure in several currencies is
 * ALLOWED to wrap — `blocks.css` says so and the phone rules set `white-space: normal` for exactly
 * that — so the widest of the range's client rects is the line that has to fit, never their sum.
 */
function reading(): Seen[] {
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const out: Seen[] = [];
  for (const slot of document.querySelectorAll('.block-slot')) {
    const grid = slot.querySelector('.grid');
    const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
    for (const el of slot.querySelectorAll('.cell-figure')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      const ink = rects.length ? Math.max(...rects.map((r) => r.width)) : 0;
      const box = el.getBoundingClientRect().width;
      out.push({
        where: (slot as HTMLElement).dataset.where ?? '',
        slot: Number((slot as HTMLElement).dataset.slot),
        text: el.textContent ?? '',
        ink: round(ink),
        box: round(box),
        room: round(box - ink),
        size: getComputedStyle(el).fontSize,
        columns,
      });
    }
  }
  return out;
}

/**
 * ONE PIXEL OF SLACK, WHICH IS THE SAME PIXEL `layout.mjs:315` GRANTS AND FOR THE SAME REASON, and
 * this file would cry wolf without it. Two things are inside a pixel here and neither is a lost
 * digit. Chromium applies `letter-spacing: -0.02em` AFTER the last glyph as well as between them, so
 * 0.48px of every figure's measured ink at `--t-xl` is space rather than a digit; and a twelve-column
 * page divides into thirds that land on a third of a pixel, so a cell is 122.5px or 117.328px rather
 * than a whole number.
 *
 * WHAT THAT PIXEL COVERS ON THE SHIPPED RECORD, MEASURED, because slack nobody has measured is slack
 * that hides the next defect: the tightest figure on the whole record is NOT the threshold the audit
 * flagged. `/p/money`'s fourth tile, `£10,416.16`, draws 123.203px of ink in a 122.5px cell — 0.703px
 * over, of which 0.48px is that trailing letter-spacing, leaving about a fifth of a pixel of the last
 * digit inside the antialiasing at the block's edge. It happens in a 586px full-width slot, which is
 * what a 900px window gives, and it is gone by 903px because the cell reaches 123.25px there. So the
 * shipped record runs about a fifth of a pixel over for three pixels of window width, and the next
 * font or token that widens a digit takes it past this pixel and turns this test red. That is what
 * this file is for.
 */
const SLACK = 1;

/** Every figure that is cut past the slack, and the one with the least room to spare either way. */
type Verdict = { readonly cut: Seen[]; readonly tightest: Seen | null; readonly figures: number };

const verdict = (seen: Seen[]): Verdict => ({
  cut: seen.filter((s) => s.room < -SLACK),
  tightest: seen.reduce<Seen | null>((a, b) => (a === null || b.room < a.room ? b : a), null),
  figures: seen.length,
});

const say = (s: Seen): string =>
  `${s.text} at ${s.size} draws ${s.ink}px of ink in a ${s.box}px cell (${s.columns} across a ${s.slot}px slot, ${s.where}): ${s.room}px to spare`;

/**
 * THE APP'S OWN CHAIN, and every box in it is the app's. The rail is a stub because `Sidebar.svelte`
 * is a file this run does not own, but its width is `var(--rail)`, which is the only thing about it
 * the page's geometry reads — and below 900px `.rail-slot` is `display: none` in the layout's own
 * stylesheet, so the phone drops the rail here exactly as it does in the app.
 */
const chain = (body: string, css = CASCADE): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>` +
  `<div class="shell" data-shape="rail"><div class="rail-slot"><nav class="rail" style="inline-size:var(--rail)"></nav></div>` +
  `<main class="body"><div class="page">${body}</div></main></div></body></html>`;

/** A slot laid out by the page's twelve columns, so its width is the page's answer and not this file's. */
const laid = (span: number): string => `<div class="block-slot" style="--span:${span}" data-span="${span}"></div>`;

/**
 * A slot with its width pinned, for the widths inside a band that a viewport sweep would need
 * hundreds of page loads to reach. It is exact rather than an approximation: the CSS that decides
 * this layout reads the VIEWPORT through `@media` and the SLOT through `@container`, and nothing
 * else, so a pinned slot of width W under a viewport anywhere in W's own band is the same cascade a
 * viewport that produced W would give.
 */
const pinned = (g: Grid, slot: number): string =>
  `<div class="block-slot" style="--span:${g.span};inline-size:${slot}px" data-where="${g.where}" data-slot="${slot}">${g.html}</div>`;

/** The slot width the page gives each span at this viewport, read off the drawn page. */
async function geometry(view: Page, width: number): Promise<Map<number, number>> {
  await view.setViewportSize({ width, height: 900 });
  await view.setContent(chain(SPANS.map(laid).join('')));
  const got = await view.evaluate(() =>
    [...document.querySelectorAll('.block-slot')].map((el) => [Number((el as HTMLElement).dataset.span), el.getBoundingClientRect().width] as const),
  );
  return new Map(got);
}

async function measured(view: Page, body: string, css = CASCADE): Promise<Verdict> {
  await view.setContent(chain(body, css));
  await view.evaluate(() => document.fonts.ready);
  assert.ok(await view.evaluate(() => document.fonts.check('500 24px Geist')), 'Geist did not load, so this would be a fallback face rather than the face the app ships');
  return verdict(await view.evaluate(reading));
}

test('NO MONEY FIGURE A DECLARED PAGE DRAWS IS CUT, AT ANY WIDTH THE APP CAN PUT IT IN', async (t) => {
  assert.ok(!routeCss.includes(':global('), 'a `:global(` survived the scan, so the rules under test are invalid CSS a browser drops');
  assert.ok(GRIDS.length > 0, 'no declared page draws a stat, so this whole file would pass over nothing');
  assert.ok(STEPS.includes(280), `the stat stylesheets step at ${STEPS.join(', ')} and none of them is the money threshold this file was written for`);
  /* THE BANDS ARE REPORTED AND NOT PINNED TO A LIST. Asserting that the cascade breaks at exactly
     400, 640 and 900 would make a breakpoint added upstairs a failure here instead of a width this
     file starts probing, which is the opposite of reading them out of the stylesheets. What has to
     hold is that there are bands and that they cover the range. */
  assert.ok(EDGES.length > 0, 'no stylesheet in the cascade changes its mind at any width, so the bands below are one band and something is not being read');
  assert.equal(BANDS[0]?.from, FLOOR, 'the first band does not start at the narrowest phone');
  assert.equal(BANDS[BANDS.length - 1]?.to, CEIL, 'the last band does not reach the width past which the page stops growing');
  t.diagnostic(`bands: ${BANDS.map((b) => `${b.from}-${b.to}`).join(', ')}; container steps: ${STEPS.join(', ')}`);

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const view = await browser.newPage({ viewport: { width: 1180, height: 900 } });

  const tight: Seen[] = [];
  for (const band of BANDS) {
    /* THE BAND'S OWN SLOT RANGE, PER SPAN, off the app's geometry at each end of it. */
    const low = await geometry(view, band.from);
    const high = await geometry(view, band.to);

    /* WHICH WIDTHS INSIDE THE BAND, AND WHY THIS IS THE COMPLETE LIST RATHER THAN A SAMPLE. Between
       two container steps the column count is fixed, so a cell is an increasing affine function of
       the slot and the figure's ink is a constant: the narrowest slot of each step is that step's
       worst case, and every wider slot in it is slack. So the ends of the band and both sides of
       every step inside it are the whole of it. The finer sweep below is what keeps that an argument
       nobody has to take on trust. */
    await view.setViewportSize({ width: band.from, height: 900 });
    const probes = GRIDS.flatMap((g) => {
      const min = Math.ceil(low.get(g.span) ?? 0);
      const max = Math.floor(high.get(g.span) ?? 0);
      const widths = [min, max, ...STEPS.filter((px) => px > min && px <= max).flatMap((px) => [px - 1, px])];
      return [...new Set(widths)].sort((a, b) => a - b).map((slot) => pinned(g, slot));
    });
    const seen = await measured(view, probes.join(''));
    assert.deepEqual(
      seen.cut.map(say),
      [],
      `at a window between ${band.from}px and ${band.to}px, ${seen.cut.length} of ${seen.figures} figures are drawn short of a digit`,
    );
    if (seen.tightest) tight.push(seen.tightest);
  }

  /* AND A PIXEL AT A TIME ACROSS THE WHOLE RANGE OF THE ONE BLOCK THAT LIVES IN A NARROW SLOT, at
     the narrowest window that draws it at full size, which is where the audit found the defect and
     where the 0.8px is. `/p/portfolio`'s `Earning` is the only `span: 4` stat on the declared pages;
     every other one is `span: 12` and never sees a slot under 288px. */
  const narrow = Math.min(...SPANS);
  const narrowGrids = GRIDS.filter((g) => g.span === narrow);
  const widest = BANDS[BANDS.length - 1]!;
  const from = Math.ceil((await geometry(view, widest.from)).get(narrow) ?? 0);
  const to = Math.floor((await geometry(view, widest.to)).get(narrow) ?? 0);
  assert.ok(to > from, `a ${narrow}-twelfth slot measures ${from}px at ${widest.from} and ${to}px at ${widest.to}, so the sweep below has no range`);
  await view.setViewportSize({ width: widest.from, height: 900 });
  const sweep = await measured(
    view,
    Array.from({ length: to - from + 1 }, (_, i) => narrowGrids.map((g) => pinned(g, from + i)).join('')).join(''),
  );
  assert.deepEqual(sweep.cut.map(say), [], `${sweep.cut.length} of ${sweep.figures} figures are cut somewhere between a ${from}px and a ${to}px slot`);
  if (sweep.tightest) tight.push(sweep.tightest);
  t.diagnostic(`a ${narrow}-twelfth slot runs ${from}px to ${to}px, swept a pixel at a time`);

  /**
   * THE CLOSEST CALL ON THE WHOLE RECORD, PRINTED RATHER THAN ASSERTED AT A NUMBER.
   *
   * The threshold's headroom is what this file exists for, and it is not a figure anybody chose:
   * asserting that it stays above some comfortable margin would be inventing a second hand-solved
   * constant beside the first one, and the margin on the shipped record is already inside a pixel. So
   * what this line asserts is the one thing `13 §4.2` promises — that no figure is drawn short of a
   * digit — and what the run says out loud is how much room the tightest figure actually had, so the
   * next reader gets the number instead of having to take the measurement again.
   */
  const closest = tight.reduce((a, b) => (b.room < a.room ? b : a));
  t.diagnostic(`the closest call on the shipped record: ${say(closest)}`);
  assert.ok(closest.room >= -SLACK, `the closest call is past the ${SLACK}px of slack: ${say(closest)}`);
});

/**
 * WHERE THE DEFECT WAS, AND WHERE IT WAS NOT, WHICH IS THE OTHER FINDING.
 *
 * `60c6b817`'s message says the figure was found cut in a marketing screenshot at 390px.
 * `research-batch-five-audit.md` finding 6 is that the commit changes nothing at 390, 360 or 320 and
 * that what it repairs is a narrow slot between 900 and 1180. Both halves of that are measurements,
 * so both are taken here rather than written down: the repair is lifted out of the cascade and the
 * same pages are drawn again at the app's own slot widths. In the narrow slot, figures come back
 * cut. On a phone, not one value moves.
 *
 * IT LOCATES THE RULE BY THE THRESHOLD IT READS OUT OF THE STYLESHEET, so this test follows the
 * repair if it is rewritten and goes red if it is deleted. And the phone half is held as every
 * value being IDENTICAL rather than as nothing being cut, because nothing is cut on a phone either
 * way: a test that only asked whether the figures fit would pass on a phone the repair had quietly
 * restacked, which is the claim finding 6 is actually about.
 */
test('THE CUT FIGURE WAS A NARROW SLOT ON A LAPTOP AND NEVER A PHONE, WITH THE REPAIR TAKEN BACK OUT', async (t) => {
  const money = guards(routeCss, '@container (inline-size < ').filter((g) => g.px === 280);
  assert.equal(money.length, 1, `the route declares ${money.length} container queries at 280px, and this test is about exactly one`);
  const without = routeCss.slice(0, money[0]!.start) + routeCss.slice(money[0]!.end);
  assert.ok(!without.includes('inline-size < 280px'), 'the repair is still in the cascade it was lifted out of');
  /* THE ONE CASCADE WITH ONE RULE TAKEN OUT OF IT, and derived from `CASCADE` by substitution rather
     than reassembled from the sheets, because the two halves of this comparison have to differ in
     exactly that rule and nothing else. Reassembled, they drifted: a rule added to `CASCADE` while
     this was being written reached one side and not the other, and the phone comparison below failed
     on a difference this test had introduced itself. */
  const bareCascade = CASCADE.replace(routeCss, without);
  assert.ok(!bareCascade.includes('inline-size < 280px'), 'the repair survived the substitution, so both sides of this comparison are the same cascade');
  assert.equal(bareCascade.length, CASCADE.length - (money[0]!.end - money[0]!.start), 'the substitution changed more than the one rule it was meant to');

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const view = await browser.newPage({ viewport: { width: 1180, height: 900 } });

  const narrow = Math.min(...SPANS);
  const grids = GRIDS.filter((g) => g.span === narrow);
  assert.ok(grids.length > 0, `no stat block is laid out at ${narrow} twelfths, so this test is about a block that is gone`);

  /* THE LAPTOP WINDOWS THE AUDIT NAMES, with the slot read off the page at each rather than quoted:
     a `span: 4` block measures 174px at 900, 215px at 1024 and 267px at 1180. */
  for (const window of [900, 1024, 1180]) {
    const slot = Math.round((await geometry(view, window)).get(narrow) ?? 0);
    await view.setViewportSize({ width: window, height: 900 });
    const probes = grids.map((g) => pinned(g, slot)).join('');
    const on = await measured(view, probes);
    assert.deepEqual(on.cut.map(say), [], `the repair is in the cascade and a figure is still cut in the ${slot}px slot a ${window}px window gives it`);
    const off = await measured(view, probes, bareCascade);
    assert.ok(
      off.cut.length > 0,
      `with the repair lifted out, nothing is cut in the ${slot}px slot a ${window}px window gives a ${narrow}-twelfth block, so the repair is not what keeps that width whole`,
    );
    t.diagnostic(`a ${window}px window, ${slot}px slot: without the repair, ${off.cut.map(say).join(' · ')}`);
  }

  /* AND THE PHONE, WHICH THE MESSAGE NAMED AND THE DIFF NEVER TOUCHED. Below 900 the rail is gone
     and `.block-slot` takes `grid-column: auto`, so the slot IS the page: 288px at 320 and 358px at
     390, both above the threshold, so the rule cannot fire at either end of a phone's range. */
  for (const window of [320, 360, 390]) {
    const slot = Math.round((await geometry(view, window)).get(narrow) ?? 0);
    await view.setViewportSize({ width: window, height: 900 });
    const probes = GRIDS.map((g) => pinned(g, slot)).join('');
    const on = await measured(view, probes);
    const off = await measured(view, probes, bareCascade);
    assert.deepEqual(off.cut.map(say), [], `a figure is cut at a ${window}px window with the repair lifted out, so the phone had a defect of its own`);
    assert.deepEqual(
      off,
      on,
      `lifting the repair out changes what a ${window}px window draws in its ${slot}px slot, so 60c6b817 did touch the phone after all`,
    );
    t.diagnostic(`a ${window}px window, ${slot}px slot: identical with and without the repair, closest call ${on.tightest ? say(on.tightest) : 'none'}`);
  }
});
