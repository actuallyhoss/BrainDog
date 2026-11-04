/**
 * EVERY MONEY FIGURE A DECLARED PAGE DRAWS, MEASURED IN A REAL BROWSER AGAINST THE CELL IT HAS TO FIT.
 *
 * `60c6b817` repaired a truncated money figure on `/p/portfolio` and recorded the whole repair in a
 * thirty-seven line comment at `routes/p/[slug]/+page.svelte:1172`: three slot widths, three cell
 * widths, a figure width, three cut amounts, two widths either side of the threshold, two phone slot
 * widths and a rem threshold rejected after being measured. Fifteen figures, every one of them
 * reproducible, and not one of them asserted anywhere. The risk is
 * that nothing will ever re-take those measurements, and that the headroom at the width the
 * threshold was solved for is 0.8px: a 280px slot gives each of two cells 124px, and the widest
 * ten-character money figure in the record draws 123.2px of ink. A font whose digits are one percent
 * wider closes that, and `13 §4.2` says what happens then — a truncated figure is not shortened, it
 * is wrong.
 *
 * THIS FILE IS THE MEASUREMENT RATHER THAN THE PROSE, and it is the first of the two possible repairs and not the second: the threshold is still a hand-solved
 * number, in another file. What is new is that the 0.8px is read off a drawn page on every run and printed, so
 * the font swap that closes it is a failing test rather than a screenshot somebody notices later.
 *
 * AND THAT IS WHAT HAPPENED, ON THE FIRST LINUX RUN. The same woff2 drew 1.6 per cent wider there,
 * four figures came out cut by up to 2.7px, and the thresholds moved: the route's money step from
 * 280px to 288px and the four-across stat step in `blocks.css` from 30rem to 38rem. Neither was
 * solved against Windows alone. `MARGIN` below makes every figure fit with two per cent of its own
 * width to spare in whichever face the run draws, so the Linux runner holds the wider face to it too.
 *
 * A SECOND DEFECT WAS ANSWERED HERE TOO, BY A TEST THAT IS GONE. The commit's message
 * put the defect on a phone at 390px where the diff changed nothing, and that what it really repaired
 * was a narrow slot between 900 and 1180. A test lifted the rule back out and measured the figures
 * cut again in that slot. Now a stat under 480px of block draws as rows, label on the left and
 * figure on the right, so nothing in that slot is cut with or without the rule, and that test was
 * retired: the first test below still holds that no figure is cut at any width.
 *
 * WHY A BROWSER AND NOT A CLASS NAME. The defect is ink wider than a box. Asserting that a rule
 * exists, or that an element carries a class, says nothing about either: the whole chain from
 * `--fs-figure` through `letter-spacing: -0.02em` and `font-variant-numeric: tabular-nums` to the shipped
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
 * block this test is about. So the shell, the rail, the body and the twelve-column page are built
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

import './fixtures/fill.ts';
import { spanOf } from './arrange.ts';
import { page, pages } from './fixtures/readers.ts';
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
 * rem IS CONVERTED AND NOT REFUSED, because `blocks.css` still writes steps in rem for blocks that
 * draw no figure (its 30rem and 34rem), while every step a stat grid answers to is px, deliberately,
 * for the reason the route's own comment argues at length and the last two tests below measure. All
 * of them belong in this list, in the unit the measurement is in.
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

/* THE PAGE IS THREE COMPONENTS SINCE IT WAS SPLIT: the frame, the grid of slots (where `.page`, `.block-slot` and the
   money step live) and one block's slot, in the order the frame mounts them. */
const routeCss = ['apps/web/src/lib/page/PageView.svelte', 'apps/web/src/lib/page/PageBody.svelte', 'apps/web/src/lib/page/BlockSlot.svelte']
  .map(componentCss)
  .join('\n');
const shellCss = componentCss('apps/web/src/lib/shell/AppFrame.svelte');
/* `blocks.css` AND THE KIND SHEETS `blocks-kinds.css` GATHERS, in its order, because a stat's steps and every other
   block's are in `kinds/` now and `PageView` loads them with the page. Read through the gathering file's own
   `@import`s, so a kind sheet added there is in this cascade without a line here. */
const blocksCss = [
  read('packages/skin/blocks.css'),
  ...[...read('packages/skin/blocks-kinds.css').matchAll(/@import '\.\/([^']+)';/g)].map((m) => read(`packages/skin/${m[1]}`)),
].join('\n');

/**
 * THE CASCADE IN SOURCE ORDER, because layer order is established by the opening statement of
 * `tokens.css` and everything under it depends on that. `+layout.svelte` imports these five in this
 * order and then `blocks.css`; its own `<style>` and the route's come after, as component styles do.
 */
const SHEETS = [
  /* THE SHIPPED FONT, REACHABLE. `tokens.css` asks for `/fonts/geist.woff2`, which resolves against
     nothing at all in a page built from a string, so the `@font-face` failed and the whole
     measurement was a fallback face. This is the shipped declaration with the shipped file inlined:
     same weight range, same unicode-range, same swap. The address's `?v=` goes with it. */
  read('packages/skin/tokens.css').replace(
    /\/fonts\/geist\.woff2(?:\?v=[0-9a-f]+)?/u,
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
 * The widths a stat grid's own container queries change their mind at, read the same way. A step the
 * page writes itself is read here too and named nowhere, so one added tomorrow is probed without an
 * edit to this list (and must earn its place, the test after the first says).
 */
const STEPS = [...new Set([...guards(blocksCss, '@container (inline-size < '), ...guards(blocksCss, '@container stat (inline-size < '), ...guards(routeCss, '@container (inline-size < ')].map((g) => g.px))].sort(
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
  /** The figure's box grows with its ink, so its `room` is always about zero and says nothing about the cell. */
  readonly follows: boolean;
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
      /* A BOX SIZED BY ITS OWN TEXT HAS NO SPARE ROOM TO MEASURE, which the phone's lead rows are:
         the figure sits in a `minmax(0, auto)` track, so `£9,090.00` read 72.656px of ink in a
         72.656px box, 0px to spare, and a wider face would widen the box rather than cut the digit.
         So the text is widened for one reading and the box watched: if it moves, it is that kind.
         Measured on the shipped record that is 96 of 524 readings, every one below a 640px window,
         and the run prints the count per band so an exemption that spreads is seen spreading. */
      const probe = el as HTMLElement;
      probe.style.letterSpacing = '0.5em';
      const follows = probe.getBoundingClientRect().width > box + 0.5;
      probe.style.letterSpacing = '';
      out.push({
        where: (slot as HTMLElement).dataset.where ?? '',
        slot: Number((slot as HTMLElement).dataset.slot),
        text: el.textContent ?? '',
        ink: round(ink),
        box: round(box),
        room: round(box - ink),
        size: getComputedStyle(el).fontSize,
        columns,
        follows,
      });
    }
  }
  return out;
}

/**
 * ONE PIXEL OF SLACK, WHICH IS THE SAME PIXEL `layout.mjs:315` GRANTS AND FOR THE SAME REASON, and
 * this file would cry wolf without it. Two things are inside a pixel here and neither is a lost
 * digit. Chromium applies `letter-spacing: -0.02em` AFTER the last glyph as well as between them, so
 * 0.48px of every figure's measured ink at `--fs-figure` is space rather than a digit; and a twelve-column
 * page divides into thirds that land on a third of a pixel, so a cell is 122.5px or 117.328px rather
 * than a whole number.
 *
 * WHAT THAT PIXEL COVERS ON THE SHIPPED RECORD, MEASURED, because slack nobody has measured is slack
 * that hides the next defect: the tightest figure on the whole record is NOT the threshold that was
 * flagged. `/p/money`'s fourth tile, `£10,416.16`, draws 123.203px of ink in a 122.5px cell — 0.703px
 * over, of which 0.48px is that trailing letter-spacing, leaving about a fifth of a pixel of the last
 * digit inside the antialiasing at the block's edge. It happens in a 586px full-width slot, which is
 * what a 900px window gives, and it is gone by 903px because the cell reaches 123.25px there. So the
 * shipped record runs about a fifth of a pixel over for three pixels of window width, and the next
 * font or token that widens a digit takes it past this pixel and turns this test red. That is what
 * this file is for.
 */
const SLACK = 1;

/**
 * AND TWO PER CENT OF ROOM IN EVERY CELL, BECAUSE THE FACE IS NOT THE SAME FACE ON EVERY MACHINE.
 *
 * The slack above is the whole margin a figure had until the first run on a hosted ubuntu image.
 * There the same woff2 drew about 1.6 per cent wider than it does here (125.2px of ink for
 * `£38,880.00` where this machine reads 123.203px), and four figures between a 900px and a 1600px
 * window came out cut by up to 2.7px: a defect for every reader on Linux that this file could not
 * see from Windows, because it only asked whether the ink fitted the face it was drawn in.
 *
 * So a figure has to fit with room to spare, and the room is a share of its own width rather than
 * a pixel count, because the Linux face is wider in proportion. Two per cent covers the measured
 * 1.6, so a figure that passes here is not cut on the CI runner, and the face that widens a digit
 * by another half per cent is a red test here before it is a cut figure anywhere. It is NOT true
 * that a run passing here passes there: the runner asks for the same two per cent of its own wider
 * ink, so a figure needs about 3.6 per cent here to pass on both. The money step was first moved to
 * 286px, which left 3.1 here and 1.4 there; the tightest figure now has 3.9.
 *
 * NOT ON A BOX THAT GROWS WITH ITS TEXT. Such a box has no spare room by construction and a wider
 * face moves the box, not the digit; `follows` says which figures those are.
 */
const MARGIN = 0.02;

/** Every figure that is cut past the slack or short of its margin, and the one with the least room either way. */
type Verdict = { readonly cut: Seen[]; readonly short: Seen[]; readonly tightest: Seen | null; readonly figures: number; readonly following: number };

const verdict = (seen: Seen[]): Verdict => ({
  cut: seen.filter((s) => s.room < -SLACK),
  short: seen.filter((s) => !s.follows && s.room < s.ink * MARGIN),
  /* BY SHARE AND NOT BY PIXELS, and never a box that follows its text: the phone's lead rows answered
     0px here on every run and hid the call that was actually close. */
  tightest: seen.filter((s) => !s.follows).reduce<Seen | null>((a, b) => (a === null || b.room / b.ink < a.room / a.ink ? b : a), null),
  figures: seen.length,
  following: seen.filter((s) => s.follows).length,
});

const say = (s: Seen): string =>
  `${s.text} at ${s.size} draws ${s.ink}px of ink in a ${s.box}px cell (${s.columns} across a ${s.slot}px slot, ${s.where}): ${s.room}px to spare` +
  (s.follows ? ', in a box that grows with its text' : `, ${Math.round((s.room / s.ink) * 1000) / 10}% of its width`);

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

/**
 * Every slot a band can give each stat block, as pinned markup: both ends of the band and both sides
 * of every container step inside it. Why that is the complete list and not a sample is argued where
 * the first test uses it.
 */
async function bandProbes(view: Page, band: { from: number; to: number }): Promise<string> {
  const low = await geometry(view, band.from);
  const high = await geometry(view, band.to);
  await view.setViewportSize({ width: band.from, height: 900 });
  return GRIDS.flatMap((g) => {
    const min = Math.ceil(low.get(g.span) ?? 0);
    const max = Math.floor(high.get(g.span) ?? 0);
    const widths = [min, max, ...STEPS.filter((px) => px > min && px <= max).flatMap((px) => [px - 1, px])];
    return [...new Set(widths)].sort((a, b) => a - b).map((slot) => pinned(g, slot));
  }).join('');
}

async function measured(view: Page, body: string, css = CASCADE): Promise<Verdict> {
  /* THE LONGEST SWEEP GROWS WITH EVERY STAT A DECLARED PAGE ADDS, and now takes longer than Playwright's own 30 seconds to
     lay out. That is a clock, not a finding: what is measured below is untouched. */
  await view.setContent(chain(body, css), { timeout: 240_000 });
  await view.evaluate(() => document.fonts.ready);
  assert.ok(await view.evaluate(() => document.fonts.check('500 24px Geist')), 'Geist did not load, so this would be a fallback face rather than the face the app ships');
  return verdict(await view.evaluate(reading));
}

test('NO MONEY FIGURE A DECLARED PAGE DRAWS IS CUT, AT ANY WIDTH THE APP CAN PUT IT IN', async (t) => {
  assert.ok(!routeCss.includes(':global('), 'a `:global(` survived the scan, so the rules under test are invalid CSS a browser drops');
  assert.ok(GRIDS.length > 0, 'no declared page draws a stat, so this whole file would pass over nothing');
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
  /* A BAND'S PROBES ARE ONE PAGE OF EVERY DECLARED STAT AT EVERY WIDTH, and laying it out takes Chromium most of
     Playwright's default 30 s when the CI runs every leg at once (it failed there on that timeout, never on a cut
     figure). The wait is the page's to take, not a hang, so it gets three minutes. */
  view.setDefaultTimeout(180_000);

  const tight: Seen[] = [];
  const short: string[] = [];
  let following = 0;
  const bandsFollowing: string[] = [];
  let figures = 0;
  for (const band of BANDS) {
    /* THE BAND'S OWN SLOT RANGE, PER SPAN, off the app's geometry at each end of it, and WHICH WIDTHS
       INSIDE IT, AND WHY THIS IS THE COMPLETE LIST RATHER THAN A SAMPLE. Between two container steps
       the column count is fixed, so a cell is an increasing affine function of the slot and the
       figure's ink is a constant: the narrowest slot of each step is that step's worst case, and
       every wider slot in it is slack. So the ends of the band and both sides of every step inside it
       are the whole of it. The finer sweep below is what keeps that an argument nobody has to take on
       trust. */
    const seen = await measured(view, await bandProbes(view, band));
    assert.deepEqual(
      seen.cut.map(say),
      [],
      `at a window between ${band.from}px and ${band.to}px, ${seen.cut.length} of ${seen.figures} figures are drawn short of a digit`,
    );
    short.push(...seen.short.map((s) => `${band.from}-${band.to}: ${say(s)}`));
    following += seen.following;
    if (seen.following) bandsFollowing.push(`${band.from}-${band.to}: ${seen.following}`);
    figures += seen.figures;
    if (seen.tightest) tight.push(seen.tightest);
  }
  /* EVERY BAND BEFORE THE VERDICT, so a font that widens a digit is reported everywhere it bites. */
  assert.deepEqual(short, [], `${short.length} figures fit this face with less than ${MARGIN * 100}% of their width to spare, so a wider face cuts them`);
  t.diagnostic(`${figures - following} of ${figures} figures held to the ${MARGIN * 100}% margin; ${following} sit in a box that grows with its text (${bandsFollowing.join(", ")})`);

  /* AND A PIXEL AT A TIME ACROSS THE WHOLE RANGE OF THE ONE BLOCK THAT LIVES IN A NARROW SLOT, at
     the narrowest window that draws it at full size, which is where the defect was found and
     where the 0.8px is. `/p/portfolio`'s `Earning` is the only `span: 4` stat on the declared pages;
     every other one is `span: 12` and never sees a slot under a phone's. */
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
  assert.deepEqual(
    sweep.short.map(say),
    [],
    `${sweep.short.length} of ${sweep.figures} figures between a ${from}px and a ${to}px slot have less than ${MARGIN * 100}% of their width to spare`,
  );
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
 * NO STEP ON THE PAGE RESTACKS A STAT, BECAUSE NONE IS NEEDED, AND THIS IS THE MEASUREMENT THAT SAYS SO.
 *
 * The page carried its own money step, `@container (inline-size < 288px)` in `PageBody.svelte`, which put a stat's
 * figures one to a row under 288px of slot. Then `stat.css` began drawing every stat as rows under 480px of block, and
 * the history called the 288 step dead without anybody measuring it. Measured on 9 October 2026, with the step lifted
 * out of the cascade: 5,958 readings at both ends of every band and both sides of every step, and a pixel at a time
 * across the narrow block's whole range, and not one figure cut or short of its margin. The narrowest slot the app gives
 * a stat is 288px, the 320px phone's, so the step never fired at all. So it is gone, and with it the constant this file
 * named it by.
 *
 * SO THIS TEST HOLDS BOTH HALVES. Every step the page itself writes over a stat's grid is lifted out and the figures
 * measured again: a step that cuts nothing when lifted is dead weight, and the test fails naming it, which is how a 288
 * step put back is caught. And with no such step, the shipped cascade is swept a pixel at a time BELOW the narrowest slot
 * the app gives, down to `UNDER`, so the rows `stat.css` draws are shown to hold where a page step would have acted.
 * The run prints the narrowest slot and the widest figure.
 */
const UNDER = 240;

/** Every `@container` step the page's own components write over a grid, as byte ranges in `routeCss`. */
const pageSteps = (): Guard[] => guards(routeCss, '@container (inline-size < ').filter((g) => routeCss.slice(g.start, g.end).includes('.grid'));

/** The cascade with one of the page's steps taken out, everything else as shipped. */
const without = (g: Guard): string => [...SHEETS.slice(0, -1), routeCss.slice(0, g.start) + routeCss.slice(g.end)].join('\n');

/**
 * EVERY FIGURE WHOSE INK RUNS PAST ITS OWN SLOT, by more than the slack. A stat drawn as rows sizes its figure's box by
 * the figure, so `room` is about nought there and says nothing; what cuts a figure in a row is the row running past
 * the block. A grid that squeezed five figures into a 240px slot read as whole without this.
 */
function spilled(slack: number): string[] {
  const out: string[] = [];
  for (const slot of document.querySelectorAll('.block-slot')) {
    const edge = slot.getBoundingClientRect();
    for (const el of slot.querySelectorAll('.cell-figure')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.right > edge.right + slack || r.left < edge.left - slack) {
          out.push(`${el.textContent ?? ''} runs past a ${(slot as HTMLElement).dataset.slot}px slot (${(slot as HTMLElement).dataset.where})`);
          break;
        }
      }
    }
  }
  return out;
}

/** Every probe the first test takes, in one cascade: the band probes, and the narrow block a pixel at a time. */
async function everyStep(view: Page, css: string): Promise<{ wrong: string[]; seen: Seen[] }> {
  const wrong: string[] = [];
  const seen: Seen[] = [];
  const take = async (label: string, body: string): Promise<void> => {
    const v = await measured(view, body, css);
    seen.push(...(await view.evaluate(reading)));
    wrong.push(...[...v.cut, ...v.short].map((s) => `${label}: ${say(s)}`));
    wrong.push(...(await view.evaluate(spilled, SLACK)).map((s) => `${label}: ${s}`));
  };
  for (const band of BANDS) await take(`${band.from}-${band.to}`, await bandProbes(view, band));
  const narrow = Math.min(...SPANS);
  const widest = BANDS[BANDS.length - 1]!;
  const from = Math.ceil((await geometry(view, widest.from)).get(narrow) ?? 0);
  const to = Math.floor((await geometry(view, widest.to)).get(narrow) ?? 0);
  await view.setViewportSize({ width: widest.from, height: 900 });
  const grids = GRIDS.filter((g) => g.span === narrow);
  await take('the narrow sweep', Array.from({ length: to - from + 1 }, (_, i) => grids.map((g) => pinned(g, from + i)).join('')).join(''));
  return { wrong, seen };
}

test('NO STEP ON THE PAGE RESTACKS A STAT: lifted out, the 288px money step cut no figure at any step, so it is gone', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const view = await browser.newPage({ viewport: { width: 1180, height: 900 } });

  for (const g of pageSteps()) {
    const { wrong, seen } = await everyStep(view, without(g));
    assert.ok(
      wrong.length > 0,
      `the page's own ${g.px}px step over a stat's grid was lifted out and none of ${seen.length} figures is cut or short at any step, ` +
        `the narrowest slot being ${Math.min(...seen.map((s) => s.slot))}px: stat.css draws a stat as rows there already, so the step is dead weight and goes`,
    );
  }

  const { wrong, seen } = await everyStep(view, CASCADE);
  assert.deepEqual(wrong, [], `${wrong.length} figures are cut or short of their margin with no page step over a stat`);
  const narrowest = Math.min(...seen.map((s) => s.slot));
  const widest = seen.reduce((a, b) => (b.ink > a.ink ? b : a));
  assert.ok(narrowest > UNDER, `the app gives a stat a ${narrowest}px slot, under the ${UNDER}px this test sweeps down to`);

  /* AND UNDER THE NARROWEST SLOT, where a page step would have acted: every stat, a pixel at a time, at the narrowest phone. */
  await view.setViewportSize({ width: FLOOR, height: 900 });
  const below = await measured(view, Array.from({ length: narrowest - UNDER }, (_, i) => GRIDS.map((g) => pinned(g, UNDER + i)).join('')).join(''));
  const cut = [...below.cut, ...below.short].map(say).concat(await view.evaluate(spilled, SLACK));
  assert.deepEqual(cut, [], `${cut.length} figures are cut or short between a ${UNDER}px and a ${narrowest}px slot, where the rows stat.css draws should hold`);
  t.diagnostic(`${seen.length} figures; the narrowest slot the app gives a stat is ${narrowest}px; the widest figure: ${say(widest)}`);
  t.diagnostic(`${below.figures} more from ${UNDER}px to ${narrowest - 1}px, none cut`);
});

/**
 * A READER WHO SETS HER BROWSER'S TEXT SMALLER GETS THE SAME FIGURES, WHOLE.
 *
 * The stat figures are drawn at `--fs-figure`, which is 24px at any root font size, so a step that
 * guards their width is a px width too. The four-across step was written `38rem`, and every
 * measurement above takes rem at a 16px root, so a reader on Chrome's "Small" (12px) or "Very small"
 * (9px) had a threshold of 456px or 342px in front of the same 123.2px figures: the 586px slot a
 * 900px window gives went back to four across, which is the cut the first Linux run found. Nothing
 * above could see it, because nothing above changed the root.
 *
 * THE ROOT IS THE BROWSER'S SETTING AND NOT A RULE ON `html`, set through the protocol the way the
 * settings page sets it, and read back before anything is measured: a root that did not move would
 * pass this test while proving nothing, the same way a fallback face would.
 */
test('A SMALLER ROOT FONT DOES NOT BRING A CUT FIGURE BACK', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());

  for (const root of [12, 9]) {
    const view = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const cdp = await view.context().newCDPSession(view);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: root } });
    await view.setContent(chain(''));
    assert.equal(
      await view.evaluate(() => getComputedStyle(document.documentElement).fontSize),
      `${root}px`,
      `the browser's font size was set to ${root}px and the root did not follow, so this would measure a 16px root again`,
    );

    const wrong: string[] = [];
    for (const band of BANDS) {
      const seen = await measured(view, await bandProbes(view, band));
      wrong.push(...[...seen.cut, ...seen.short].map((s) => `${band.from}-${band.to}: ${say(s)}`));
    }
    assert.deepEqual([...new Set(wrong)], [], `at a ${root}px root, ${wrong.length} figures are cut or short of their ${MARGIN * 100}% margin`);
    t.diagnostic(`a ${root}px root: every stat figure in every band fits with its ${MARGIN * 100}% margin`);
    await view.close();
  }
});

/** Where the `<div>` opening at `start` closes, by counting, since a cell holds nested divs and an svg but never a stray `<div`. */
function closing(html: string, start: number): number {
  let depth = 0;
  for (let i = start; i < html.length; i += 1) {
    if (html.startsWith('<div', i)) depth += 1;
    else if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return i + '</div>'.length;
    }
  }
  return -1;
}

/**
 * AND THE SAME FOR THE FIVE-ACROSS STEP, WHICH NO DECLARED PAGE CAN SHOW, SO THIS TEST DRAWS ONE.
 *
 * The four-across step was repaired to 608px because the test above measured it cut at a 12px root.
 * The five-across step beside it was still `60rem` and that test passed, not because the step was
 * sound but because no declared page has a stat of five figures: at a 12px root `60rem` is 720px, and
 * a 720px slot gives five cells of 118.4px for a figure that draws 123.2px of ink. So the grid here is
 * the widest money figure the record draws, in the app's own markup from `toHTML`, copied into a
 * shipped stat until it has five cells, which is the smallest stat that rule governs.
 *
 * TWO THINGS ARE HELD, AND THE SECOND IS THE ONE THAT NAMES THE FAULT. Every figure fits with its
 * margin at every root, which is `13 §4.2` again; and the grid goes the same number of columns across
 * at every slot whatever the root, because the figures it guards are px and a step that moves with
 * the root is a step guarding nothing. The slots are the whole full-width range a laptop window gives,
 * every 4px and both sides of every container step, so a step written in rem shows as the band of
 * slots where 12px and 16px disagree.
 */
test('A FIFTH FIGURE GOES THREE ACROSS AT THE SAME SLOT AT EVERY ROOT, AND FITS', async (t) => {
  const figureAt = /class="cell-figure[^"]*">([^<]*)</g;
  const widest = GRIDS.flatMap((g) => [...g.html.matchAll(figureAt)].map((m) => ({ g, text: m[1]!, at: m.index }))).reduce((a, b) =>
    b.text.length >= a.text.length ? b : a,
  );
  const start = widest.g.html.lastIndexOf('<div class="cell"', widest.at);
  const end = closing(widest.g.html, start);
  assert.ok(start !== -1 && end > widest.at, `the cell holding ${widest.text} on ${widest.g.where} could not be found in its own markup`);
  const cell = widest.g.html.slice(start, end);
  const had = (widest.g.html.match(/<div class="cell"/g) ?? []).length;
  assert.ok(had >= 2 && had < 5, `${widest.g.where} already draws ${had} cells, so copying one is not how this test reaches five`);
  const html = (widest.g.html.slice(0, end) + cell.repeat(5 - had) + widest.g.html.slice(end)).replace(/--cells:\d+/, '--cells:5');
  const five: Grid = { where: `${widest.g.where}, drawn five across with ${widest.text}`, span: widest.g.span, html };

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const laptop = BANDS[BANDS.length - 1]!;
  const probe = await browser.newPage({ viewport: { width: laptop.to, height: 900 } });
  const from = Math.ceil((await geometry(probe, laptop.from)).get(12) ?? 0);
  const to = Math.floor((await geometry(probe, laptop.to)).get(12) ?? 0);
  await probe.close();
  assert.ok(to > from, `a full-width slot measures ${from}px at ${laptop.from} and ${to}px at ${laptop.to}, so there is no range to probe`);
  const slots = [
    ...new Set([...Array.from({ length: Math.floor((to - from) / 4) + 1 }, (_, i) => from + i * 4), ...STEPS.flatMap((px) => [px - 1, px])]),
  ]
    .filter((px) => px >= from && px <= to)
    .sort((a, b) => a - b);

  const across = new Map<number, Map<number, number>>();
  const wrong: string[] = [];
  for (const root of [16, 12, 9]) {
    const view = await browser.newPage({ viewport: { width: laptop.to, height: 900 } });
    const cdp = await view.context().newCDPSession(view);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: root } });
    const seen = await measured(view, slots.map((slot) => pinned(five, slot)).join(''));
    assert.equal(
      await view.evaluate(() => getComputedStyle(document.documentElement).fontSize),
      `${root}px`,
      `the browser's font size was set to ${root}px and the root did not follow, so this would measure a 16px root again`,
    );
    wrong.push(...[...seen.cut, ...seen.short].map((s) => `a ${root}px root: ${say(s)}`));
    const columns = await view.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.block-slot')].map((el) => {
        const grid = el.querySelector('.grid');
        return [Number(el.dataset.slot), grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0] as const;
      }),
    );
    across.set(root, new Map(columns));
    await view.close();
  }

  const at16 = across.get(16)!;
  const moved = [12, 9].flatMap((root) =>
    slots
      .filter((slot) => across.get(root)!.get(slot) !== at16.get(slot))
      .map((slot) => `${slot}px at a ${root}px root: ${across.get(root)!.get(slot)} across where a 16px root draws ${at16.get(slot)}`),
  );
  assert.deepEqual([...new Set(wrong)], [], `${wrong.length} of the five-figure readings are cut or short of their ${MARGIN * 100}% margin`);
  assert.deepEqual(moved, [], `${moved.length} slots lay five figures out differently once the root is smaller, so a step there is written in the root's unit`);
  const changes = slots.filter((slot, i) => i > 0 && at16.get(slot) !== at16.get(slots[i - 1]!)).map((slot) => `${at16.get(slot)} across from ${slot}px`);
  t.diagnostic(`${slots.length} slots from ${from}px to ${to}px, ${widest.text} five times: ${changes.join(', ')}, the same at 16, 12 and 9px roots`);
});
