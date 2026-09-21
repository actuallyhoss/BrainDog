/**
 * THE FRAME ROUND BAND 0005's DASHBOARD IS A CROP, AND THIS IS THE ONLY THING THAT LOOKS AT IT.
 *
 * TWO PASSES RUNNING, THAT FRAME CUT SOMETHING IT SHOULD NOT HAVE. First it cut a money figure,
 * through the final `0` of `no more than GBP 50,000.00`; then it cut three sparklines mid-stroke.
 * Both were found by a human looking at a screenshot, and the pass that fixed the second one wrote
 * down that no test in `apps/site/test` would have caught either cut. That is still true of every
 * other check this app has: the three gates that read it measure the MARKUP, and `content.test.ts`
 * measures the WORDS. Nothing in this tree has ever read a pixel of the picture.
 *
 * WHAT THIS IS FOR, AND IT IS THE WHOLE REASON THE TEST EXISTS. A capture is replaced every time
 * the app's look changes, and the crop is two numbers about THAT capture: source column 2556 and
 * source row 1214, which are the middles of the widest clear runs in the picture that was on disk
 * the day they were chosen. The next replacement is the moment this breaks, because nothing about
 * re-running `scripts/usecases.mjs` moves those two numbers, and a person looking at a screenshot
 * is the only thing standing there now.
 *
 * IT READS `src/routes/+page.svelte` AND NOT `build/`, which is the opposite of what
 * `content.test.ts` does, and the reason is that the numbers do not survive the build. Measured on
 * `apps/site/build/_app/immutable/assets/0.z52x0c1z.css`: the minifier folds
 * `inline-size: calc(100% * 2880 / 2556)` down to `inline-size:112.676%`, and the string `2556`
 * appears nowhere under `build/` at all. `aspect-ratio:2880/1214` does survive. Reading a rounded
 * percentage back into a source column is arithmetic on a rounding, so the source is the only place
 * the crop is legible, and the cost of that choice is that this test cannot see a rule the build
 * drops.
 *
 * WHAT COUNTS AS INK, and it is the predicate the fixing pass used, reproduced to the pixel. A
 * pixel is ink when its Rec. 709 luma is more than 25 steps from the median luma of its own row,
 * taken over the columns the frame actually shows. A panel edge that runs the whole height is not
 * ink, because a crop that lands on an edge reads as an edge: measured over both captures, the
 * navigation rail's right edge at source columns 480 and 481 deviates at all 81 rows of the window
 * round every cut tested here, while the tallest glyph stroke near either historic cut reaches 26
 * of 81. A rule that runs the whole width needs no carve-out of its own, because a row that is
 * mostly rule has the rule's own luma as its median.
 *
 * THAT CARVE-OUT IS HOW I KNOW IT IS THE SAME PREDICATE. Raw, this counts 81 deviating pixels on
 * historic bottom cut row 1035 and 73 on row 686; the fixing pass recorded 79 and 71, which is
 * those two minus the rail. Historic right cut column 2356 counts 3 over the rows its frame showed,
 * and the record says 3.
 *
 * NO PORT AND NO SERVER. Chromium is the only WebP decoder this repository has: `usecases.mjs` and
 * `product.mjs` both encode through an `OffscreenCanvas` in a Playwright page, `sharp` is in the
 * lockfile only as an override on somebody else's dependency and is not resolvable from here, and
 * Node has no image decoding of its own. So the capture arrives as a `data:` URL inside a headless
 * page, which binds nothing and cannot collide with the browser gates that hold 5189 and 5317.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from '@playwright/test';

const PAGE = new URL('../src/routes/+page.svelte', import.meta.url);
const SHOTS = new URL('../static/shots/', import.meta.url);

/** More than this many luma steps from the median of its own row and the pixel is ink. */
const INK = 25;

/**
 * Rows either side of a cut that a deviating column is weighed over before it is read as a panel
 * edge rather than as ink. 40 gives an 81 row window, which is taller than any glyph in a 2x capture
 * of a 14px to 34px type scale. The window is not what sets the ceiling, though: the share below is.
 */
const EDGE_REACH = 40;

/**
 * The share of that window a column has to deviate at to be a panel edge. The rail measures 81 of
 * 81 and the tallest glyph stroke 26 of 81, so anything from 0.34 to 1.0 separates them; four
 * fifths leaves room for a rule crossing the edge, which costs the edge a row or two of its window
 * because the rule takes over that row's median.
 *
 * AND FOUR FIFTHS IS ALSO THE BLIND SPOT, so it is written down rather than found the hard way.
 * Driven over a synthetic grid, a stroke centred on the cut is still seen as ink at 64 rows tall and
 * is read as a panel edge at 65: 65 of the 81 rows deviate and four fifths of 81 is 64.8. So a
 * vertical feature taller than 64 source rows, which is 32 CSS pixels in a 2x capture, is cut
 * without this file saying a word. Nothing that tall sits on either of the two cuts today, and the
 * two cuts this test was written for measured 26 rows and 24. If a capture ever puts a display sized
 * glyph or a tall bar on a cut, this constant is where the miss came from.
 */
const EDGE_SHARE = 0.8;

/**
 * Source rows above the nominal bottom cut that are cut in practice as well. `aspect-ratio` sizes
 * the border box and the 1px top rule lives inside it, so the picture ends up one rendered pixel
 * shorter than the ratio says. The fixing pass drove the built page at 1440, 1280, 1024, 999 and
 * 900 in both schemes and got bottom cuts of 1212.2, 1212.0, 1211.5, 1211.4 and 1211.1 against a
 * nominal 1214, so the cut is somewhere in the last four rows and all four have to be clear.
 */
const SLACK = 3;

type Grid = {
  /** The capture's own size, before any of the cropping this test reads. */
  readonly width: number;
  readonly height: number;
  /** Luma of the top left `cols` by `rows` rectangle of it, row major. */
  readonly luma: Uint8Array;
  readonly cols: number;
  readonly rows: number;
};

/* One browser for the file, opened on the first decode so that a run which never decodes anything
   never launches one, and one grid per capture because two tests read the same pixels. */
let opened: Promise<{ browser: Browser; page: Page }> | undefined;
const decoded = new Map<string, Grid>();

after(async () => {
  if (opened) await (await opened).browser.close();
});

/**
 * Decodes a capture to luma, keeping the top left `cols` by `rows` rectangle of it. The cropping
 * happens in the page and not here: the whole 2880 by 1800 grid is 5.2 million bytes to carry back
 * over the debugging protocol, and every pixel this test reads is inside the frame plus the window
 * the panel edge test needs below it.
 */
async function decode(file: string, cols: number, rows: number): Promise<Grid> {
  const already = decoded.get(file);
  if (already) {
    /* THE RECTANGLE IS NOT IN THE CACHE KEY, and a second call that wanted a taller one would be
       handed the shorter grid and would read the wrong region without complaining. Measured: after
       a 1,255 row decode, a call asking for 1,654 rows of the same file came back with 1,255 and no
       error. Every call in this file asks for the same rectangle, so this says so out loud rather
       than decoding a second copy of five million pixels to make it true. */
    assert.ok(
      already.cols >= Math.min(cols, already.width) && already.rows >= Math.min(rows, already.height),
      `${file} was decoded to ${already.cols} by ${already.rows} and is now wanted at ${cols} by ${rows}`,
    );
    return already;
  }

  opened ??= chromium.launch().then(async (browser) => ({ browser, page: await browser.newPage() }));
  const { page } = await opened;
  const out = await page.evaluate(
    async (want: { src: string; cols: number; rows: number }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/webp;base64,${want.src}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('this page has no 2d context to decode into');
      context.drawImage(bitmap, 0, 0);
      const cw = Math.min(want.cols, bitmap.width);
      const ch = Math.min(want.rows, bitmap.height);
      /* A DataView AND NOT THE Uint8ClampedArray ITSELF, because this file is typechecked under
         `noUncheckedIndexedAccess` and `getUint8` returns a number where an index returns a number
         or undefined. Three `?? 0` per pixel would be three places a real out of range read could
         hide as black. */
      const rgba = new DataView(context.getImageData(0, 0, cw, ch).data.buffer);
      const luma = new Uint8Array(cw * ch);
      for (let p = 0, i = 0; p < luma.length; p += 1, i += 4)
        luma[p] = Math.round(
          0.2126 * rgba.getUint8(i) + 0.7152 * rgba.getUint8(i + 1) + 0.0722 * rgba.getUint8(i + 2),
        );
      let packed = '';
      for (let i = 0; i < luma.length; i += 0x8000) packed += String.fromCharCode(...luma.subarray(i, i + 0x8000));
      return { width: bitmap.width, height: bitmap.height, cols: cw, rows: ch, luma: btoa(packed) };
    },
    { src: readFileSync(new URL(file, SHOTS)).toString('base64'), cols, rows },
  );

  const grid: Grid = { ...out, luma: new Uint8Array(Buffer.from(out.luma, 'base64')) };
  assert.ok(grid.cols > 0 && grid.rows > 0, `${file} decoded to nothing`);
  decoded.set(file, grid);
  return grid;
}

/**
 * Luma at a pixel. Off the grid throws, because a silent zero here reads as ink on a dark row.
 *
 * THE COLUMN IS CHECKED AGAINST `cols` AND NOT LEFT TO THE INDEX, because the grid is one flat array
 * and a column past the right edge is a legal index into the NEXT row. Driven on a 4 by 3 grid, an
 * index read at 4,0 came back as the pixel at 0,1 and only 4,2 ran off the end and threw. A crop
 * whose column equals the capture's own width, which the first test allows, would have read a column
 * of row starts and found them as clear as any other patch of background.
 */
function px(grid: Grid, x: number, y: number): number {
  const inside = x >= 0 && x < grid.cols && y >= 0 && y < grid.rows;
  const value = inside ? grid.luma[y * grid.cols + x] : undefined;
  if (value === undefined) throw new RangeError(`pixel ${x},${y} is outside a ${grid.cols} by ${grid.rows} grid`);
  return value;
}

/** Median luma of every row of the grid, over every column the grid holds. */
function medians(grid: Grid): Uint8Array {
  const out = new Uint8Array(grid.rows);
  for (let y = 0; y < grid.rows; y += 1) {
    const run = Array.from(grid.luma.subarray(y * grid.cols, (y + 1) * grid.cols)).sort((a, b) => a - b);
    const middle = run[run.length >> 1];
    if (middle === undefined) throw new RangeError('a row with no columns has no median');
    out[y] = middle;
  }
  return out;
}

function deviates(grid: Grid, median: Uint8Array, x: number, y: number): boolean {
  return Math.abs(px(grid, x, y) - (median[y] ?? 0)) > INK;
}

/** True when the column deviates at most of the window round `y`, which makes it an edge, not ink. */
function panelEdge(grid: Grid, median: Uint8Array, x: number, y: number): boolean {
  const top = Math.max(0, y - EDGE_REACH);
  const bottom = Math.min(grid.rows - 1, y + EDGE_REACH);
  let hits = 0;
  for (let k = top; k <= bottom; k += 1) if (deviates(grid, median, x, k)) hits += 1;
  return hits >= EDGE_SHARE * (bottom - top + 1);
}

/** The rows of column `x`, down to but not including `rows`, where a right cut would fall on ink. */
function inkDownColumn(grid: Grid, median: Uint8Array, x: number, rows: number): number[] {
  const hits: number[] = [];
  for (let y = 0; y < rows; y += 1) if (deviates(grid, median, x, y)) hits.push(y);
  return hits;
}

/** The columns of row `y`, over every column the grid holds, where a bottom cut would fall on ink. */
function inkAlongRow(grid: Grid, median: Uint8Array, y: number): number[] {
  const hits: number[] = [];
  for (let x = 0; x < grid.cols; x += 1)
    if (deviates(grid, median, x, y) && !panelEdge(grid, median, x, y)) hits.push(x);
  return hits;
}

/**
 * The crop, and the captures it is a crop OF, read out of the band's own CSS and markup. There is no
 * list of filenames in here: whatever the `<picture>` names at the crop's own source width is what
 * gets measured. The first test does pin that pair by name, so renaming a capture is a red test
 * naming both halves rather than a silent change of subject.
 */
function crop(): { width: number; column: number; row: number; files: string[] } {
  const source = readFileSync(PAGE, 'utf8');

  /* THE FIRST `.report-shot img` BLOCK AND NOT A SEARCH OF THE WHOLE FILE. The narrow treatment
     declares the same selector again lower down to undo the crop, and the comment above the rule
     quotes both ratios in prose. Either would be matched by a file wide search for `aspect-ratio`. */
  const at = source.indexOf('.report-shot img {');
  assert.notEqual(at, -1, 'there is no `.report-shot img` rule any more, so the band no longer crops anything');
  const rule = source.slice(at, source.indexOf('}', at));

  const inline = rule.match(/inline-size:\s*calc\(100%\s*\*\s*(\d+)\s*\/\s*(\d+)\)/);
  const ratio = rule.match(/aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
  assert.ok(inline, 'the crop has no `inline-size: calc(100% * W / C)`, so its right edge is not a source column any more');
  assert.ok(ratio, 'the crop has no `aspect-ratio: W / R`, so its bottom edge is not a source row any more');

  const width = Number(inline[1]);
  const column = Number(inline[2]);
  const row = Number(ratio[2]);
  for (const [name, value] of [['width', width], ['column', column], ['row', row]] as const)
    assert.ok(Number.isInteger(value) && value > 0, `the crop's ${name} read as ${value}`);
  assert.equal(
    width,
    Number(ratio[1]),
    `the two ratios disagree about the capture's width, ${width} against ${Number(ratio[1])}, so at most one of them crops where it says it does`,
  );

  const start = source.indexOf('<figure class="report-shot">');
  assert.notEqual(start, -1, 'the report band no longer holds a `report-shot` figure');
  const figure = source.slice(start, source.indexOf('</figure>', start));
  assert.ok(figure.includes('<picture>'), 'the report band no longer holds a `<picture>`, so there is nothing to crop');

  /* TWO CAPTURES AND NOT FOUR. The band serves a phone pair below 900px as well, and below 900px
     the media query sets `aspect-ratio: auto` and `object-fit: fill`, which undoes the crop. So the
     only captures this crop ever lands on are the ones declared at the crop's own source width. */
  const files: string[] = [];
  for (const found of figure.matchAll(/(?:src|srcset)="\/shots\/([^"]+)"[\s\S]*?width="(\d+)"/g)) {
    const [, name, declared] = found;
    if (name !== undefined && Number(declared) === width) files.push(name);
  }
  return { width, column, row, files };
}

test('the crop names a column and a row of the captures it is actually applied to', () => {
  const { width, column, files } = crop();
  assert.ok(column <= width, `a right cut at source column ${column} is not inside a ${width}px capture`);
  assert.deepEqual(
    files,
    ['usecase-founder-dashboard-dark.webp', 'usecase-founder-dashboard-light.webp'],
    'the report band serves a different pair of captures at the crop width than the crop was measured against',
  );
});

test('neither cut falls through ink, in either scheme', async () => {
  const { width, column, row, files } = crop();
  for (const file of files) {
    const grid = await decode(file, column + 1, row + EDGE_REACH + 1);
    assert.equal(
      grid.width,
      width,
      `${file} is ${grid.width}px wide where the markup and the crop both say ${width}, so both cuts land somewhere other than where they were measured`,
    );
    assert.ok(grid.height > row, `${file} is only ${grid.height}px tall, so a bottom cut at source row ${row} is off the end of it`);
    const median = medians(grid);

    /* THE RIGHT CUT. A cut at column 2556.0 shows column 2555 whole and column 2556 not at all, so
       both of them are the cut and both have to be clear. It runs down the rows the frame shows,
       which stop one short of the bottom cut. */
    for (const x of [column - 1, column]) {
      const hits = inkDownColumn(grid, median, x, row);
      assert.deepEqual(
        hits,
        [],
        `${file}: the frame's right edge cuts through ink at source column ${x}, on ${hits.length} row(s) starting ${hits.slice(0, 8).join(', ')}`,
      );
    }

    /* THE BOTTOM CUT, over every column the frame shows, which is column 0 to the right cut. */
    for (let y = row - SLACK; y <= row; y += 1) {
      const hits = inkAlongRow(grid, median, y);
      assert.deepEqual(
        hits,
        [],
        `${file}: the frame's bottom edge cuts through ink at source row ${y}, on ${hits.length} column(s) starting ${hits.slice(0, 8).join(', ')}`,
      );
    }
  }
});

/**
 * A CLEAR CUT ACROSS A BLANK PICTURE IS CLEAR, which is the one way the test above could pass while
 * the band showed nothing at all. It is not a hypothetical: the first version of `send-shot.mjs`
 * photographed five of the seven bands as bare ground and both product shots as empty frames,
 * because the bands arrive on a scroll driven timeline and the pictures are lazy. So the frame has
 * to carry ink somewhere, and the measurement has to be able to find it.
 */
test('the captures are not blank', async () => {
  const { column, row, files } = crop();
  for (const file of files) {
    const grid = await decode(file, column + 1, row + EDGE_REACH + 1);
    const median = medians(grid);
    let found = 0;
    for (let y = 0; y < row; y += 24) found += inkAlongRow(grid, median, y).length;
    assert.ok(
      found > 1000,
      `${file}: the frame carries ${found} ink pixels across every 24th row it shows, which is a blank or nearly blank capture`,
    );
  }
});

test('a panel edge and a rule are not ink, and a glyph stroke is', () => {
  /* Flat ground, one 2px column all the way down, one 1px row all the way across, and a 24 row
     stroke of the kind that got cut. The window is 81 rows, so the ground has to be taller. */
  const cols = 400;
  const rows = 200;
  const luma = new Uint8Array(cols * rows).fill(200);
  const at = (x: number, y: number): number => y * cols + x;
  for (let y = 0; y < rows; y += 1) luma[at(120, y)] = luma[at(121, y)] = 40;
  for (let x = 0; x < cols; x += 1) luma[at(x, 100)] = 40;
  for (let y = 130; y < 154; y += 1) luma[at(300, y)] = 40;
  const grid: Grid = { width: cols, height: rows, cols, rows, luma };
  const median = medians(grid);

  assert.deepEqual(inkAlongRow(grid, median, 100), [], 'a rule that runs the whole width read as ink, so every crop that landed on a rule would fail');
  assert.deepEqual(inkAlongRow(grid, median, 60), [], 'a panel edge that runs the whole height read as ink');
  assert.deepEqual(inkAlongRow(grid, median, 140), [300], 'a 24 row stroke did not read as ink, which is the cut this whole file exists to catch');
  assert.equal(inkDownColumn(grid, median, 300, 190).length, 24, 'a 24 row stroke was not seen down its own column');
});
