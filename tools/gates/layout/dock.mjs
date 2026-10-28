/**
 * `layout-dock`: a panel docked beside the work arrives, and the work holds together beside it. The overflow rule and
 * the full-width rule are asked again here with the panel's edge and the panel's column (`measure.mjs`, `full.mjs`).
 *
 * `at` is the widths this pass draws, and `seeds` the seeds it plants, one page each, or `null` for a real run.
 */

import { misdrawn, short, SPAN } from './full.mjs';
import { measure } from './measure.mjs';
import { plant } from './plant.mjs';
import { mark, openFor, reach, SHAPES, UNFOLD } from './shared.mjs';

/**
 * AND WITH A PANEL DOCKED BESIDE THE WORK, which no pass above ever opened.
 *
 * The docked right panel takes a column of its own from 1,280 up, and every screen that opens a task or a
 * row narrows beside it. Every pass above measures a screen at rest, so the three things that go wrong only while a
 * panel is open swept green: the work squeezed under the panel or scrolling sideways beside it, blocks paired into
 * halves by the window's width when the panel has taken a third of it, and the column opening in one frame while
 * the panel takes a quarter of a second to arrive, so a strip of bare ground shows where it will be.
 *
 * AT 1,280, 1,440 AND 1,728 (`dockedAtPx`): where the panel first docks, where blocks begin to pair, and the owner's
 * wide laptop. On every shape, because the panel's column is a track of each shape's own grid.
 *
 * TWO SCREENS, ONE FOR EACH WAY A PANEL OPENS: a task's title on Work (`.item-open`, the renderer's row verb) and `p`
 * on a list (the register's peek). An open that does not take is a finding and not a skip, for the reason `ACTS`
 * gives.
 *
 * WHAT IS READ, IN ORDER:
 *   * THE ARRIVAL, WITH MOTION ON. Every pass above reduces motion, which is the right default and is exactly why a
 *     panel that arrives late was never seen. Each frame from the press until the panel is still, the ground between
 *     the work's edge and the panel's is read; more than `dockBlankShare` of the panel's column over the gap it rests
 *     at is the blank column.
 *   * THE OVERFLOW RULE, with the panel's edge for the window's (`MEASURE`'s `docked`).
 *   * FULL WIDTH, IN THE COLUMN LEFT BESIDE THE PANEL, by the same share as at rest.
 *   * THE PAIRING, AGAINST THE SAME SCREEN WITH THE SAME ROOM AND NO PANEL. Blocks set side by side beside the panel
 *     are compared with the screen drawn in a window narrower by the panel's column, where the work has about the same
 *     room and nothing is docked. If that window stacks them, pairing read the window and not the work. No number
 *     of pixels is assumed: the product's own rule at that room is the measure.
 */
/* `ms` IS THE WAIT FOR A PRESS THAT OPENS SOMETHING (`run.actMs`), so this pass spells no number of its own. */
const DOCKED = [
  { name: 'Work', route: '/p/work', open: (page, ms) => page.locator('#main .item-open:visible').first().click({ timeout: ms }) },
  { name: 'Bills and invoices', route: '/r/obligations', open: (page) => page.keyboard.press('p') },
];
/* EACH FRAME FROM THE PRESS UNTIL THE PANEL IS STILL, the widest ground between the work and the panel. Still is two
   frames with the gap unchanged and nothing running on the panel or on the root; `limit` ends a watch on a panel
   that never came.

   THE ROOT TOO, because the column is a transition there and not on the panel: `--dock-col` waits `--d-panel` and
   then lands in one step (`Panel.svelte`). Read off the panel alone, a slide that ended a frame before the column
   came looked still with the panel over the work's end, and the column landing after the watch was never seen.
   A transition in its delay is running, so the root's list holds it until it lands.

   THE WIDEST GAP STARTS AT THE FIRST ONE READ, NOT AT 0. While the panel slides in over the work the gap is
   negative, and a 0 to start from made every watch that ended there report the whole overlap as bare ground.

   AND A WATCH THAT RUNS OUT HAS NO REST, so it says it never came to rest and gives no gap to measure from: the last
   one read was mid-slide, and the overlap against it is the same false bare ground. `#main` is read each frame,
   because a press that changes the address draws a new one (`{#key}` in `+layout.svelte`). */
const ARRIVAL = (limit) =>
  new Promise((done) => {
    const from = performance.now();
    let blank = null;
    let last = null;
    let still = 0;
    const moving = (el) => el.getAnimations().some((a) => a.playState === 'running');
    const frame = () => {
      const main = document.getElementById('main');
      /* A PANEL WITH NO WIDTH HAS NOT ARRIVED, though the dialog is open: `display: none` or a column of 0 leaves the
         work beside nothing, and read as docked it put the panel's edge at 0 and every element of the work under it
         (the `layout-dock` seed). */
      const shown = document.querySelector('dialog.dock[open]:not(:modal)');
      const dock = shown && shown.getBoundingClientRect().width > 0 ? shown : null;
      if (dock && main) {
        const gap = dock.getBoundingClientRect().left - main.getBoundingClientRect().right;
        if (blank === null || gap > blank) blank = gap;
        still = last !== null && Math.abs(gap - last) < 1 && !moving(dock) && !moving(document.documentElement) ? still + 1 : 0;
        last = gap;
        if (still > 1) return done({ docked: true, settled: true, blank: Math.round(blank), rest: Math.round(gap) });
      }
      if (performance.now() - from > limit) return done({ docked: dock !== null, settled: false, blank: null, rest: null });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
/* THE NARROWEST OF ANY TWO BLOCKS SET SIDE BY SIDE in the work, or `null` when every block has its row to itself. */
const PAIRED = () => {
  const slots = [...document.querySelectorAll('#main .block-slot')]
    .filter((el) => !el.closest('dialog'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  let narrowest = null;
  for (const a of slots)
    for (const b of slots)
      if (a !== b && Math.abs(a.top - b.top) < 1 && a.right <= b.left + 1) narrowest = Math.min(narrowest ?? a.width, a.width, b.width);
  return narrowest === null ? null : Math.round(narrowest);
};

export async function dock(run, { at: dockAt, seeds: dockSeeds }) {
  const { findings, budgets: B } = run;
  /* UNDER THE SEEDS, ONE PAGE WITH THE PANEL OPEN PER SEED, AND NOT NONE (this pass skipped the
     seed, so `self-test` had never once asked it to go red). The first width, the rail and Work: the seeded heading is
     2000px wide, so it reaches under the panel at every width on every shape, and `self-test` holds the run to naming
     that; the panel hidden before the press is a panel that never arrives. In the first part only, like every width no
     part draws. Each seed reaches the screen afresh, so the style one plants is gone before the next is planted. */
  const seeded = dockSeeds !== null;
  const dockRuns = seeded ? dockSeeds.map((s) => ({ screen: DOCKED[0], planted: s })) : DOCKED.map((d) => ({ screen: d, planted: null }));
  for (const width of dockAt)
    for (const shape of seeded ? SHAPES.slice(0, 1) : SHAPES) {
      const opened = await openFor(run, width, shape, dockRuns[0]?.screen.route ?? DOCKED[0].route, 'no-preference');
      const { context, page } = opened;
      process.stdout.write(`    dock @${String(width).padStart(4)} ${shape.drawn.padEnd(4)} `);
      for (const { screen, planted } of dockRuns) {
        const where = `${screen.name} (${screen.route}) @${width} on ${shape.name}, panel open`;
        if (!(await reach(run, opened, screen.route, `${screen.route} @${width} on ${shape.name} (docked)`, planted))) continue;
        await page.addStyleTag({ content: UNFOLD });
        if (planted?.id === 'layout-dock') await plant(page, planted);
        const watching = page.evaluate(ARRIVAL, B.dockArrivalMs);
        try {
          await screen.open(page, run.actMs);
        } catch (e) {
          await watching.catch(() => null);
          findings.push(mark(planted, `${where}  could not open a panel: ${String(e).split('\n')[0]}`));
          process.stdout.write('!');
          continue;
        }
        /* `null` IS A PAGE THAT LOADED AGAIN UNDER THE WATCH, which took the watch with it: the press left the screen. */
        const arrival = await watching.catch(() => null);
        run.checked++;
        if (arrival === null || !arrival.docked) {
          findings.push(
            mark(
              planted,
              `${where}  ${arrival === null ? 'loaded the page again instead of opening a panel' : `opened no docked panel in ${B.dockArrivalMs}ms: a sheet over the screen, or nothing`}`,
            ),
          );
          process.stdout.write('!');
          continue;
        }
        if (planted?.id === 'layout-overflow') await plant(page, planted);
        await page.waitForTimeout(B.settleMs);
        const said = [...(await measure(page, width, B.widthTolerancePx, false, true))];
        if (!arrival.settled) said.push(`was still moving ${B.dockArrivalMs}ms after the press, so how it arrived was not read`);
        const span = await page.evaluate(SPAN);
        if (span === null) said.push('drew no #main to measure beside the panel');
        else {
          const wrong = misdrawn(span, shape);
          if (wrong) said.push(wrong);
          else {
            const narrow = short(span, 'left beside the panel', B.fullWidthShare);
            if (narrow) said.push(narrow);
            if (arrival.rest !== null && arrival.blank - arrival.rest > span.dock * B.dockBlankShare)
              said.push(
                `showed ${arrival.blank - arrival.rest}px of bare ground between the work and the panel while it arrived: ` +
                  'the column opened before the panel came to fill it',
              );
            const pairs = await page.evaluate(PAIRED);
            if (pairs !== null && span.dock > 0) {
              /* THE SAME SCREEN, NO PANEL, IN A WINDOW NARROWER BY THE PANEL'S COLUMN. */
              const alike = width - span.dock;
              const shut = await openFor(run, alike, shape, screen.route);
              const other = shut.context;
              const bare = shut.page;
              if (await reach(run, shut, screen.route, `${screen.route} @${alike} on ${shape.name} (the panel's room, shut)`, planted)) {
                await bare.addStyleTag({ content: UNFOLD });
                const apart = await bare.evaluate(PAIRED);
                const room = await bare.evaluate(SPAN);
                run.checked++;
                if (apart === null)
                  said.push(
                    `sets blocks side by side, the narrower ${pairs}px, in the ${span.room}px left beside the panel, where a ${alike}px ` +
                      `window with ${room?.room ?? alike}px for the work stacks them: pairing reads the window and not the work`,
                  );
              }
              await other.close();
            }
          }
        }
        process.stdout.write(said.length ? '!' : '.');
        for (const s of [...new Set(said)]) findings.push(mark(planted, `${where}  ${s}`));
      }
      process.stdout.write('\n');
      await context.close();
    }
}
