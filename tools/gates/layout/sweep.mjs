/**
 * The sweep: every route at every width this part draws, at rest and then in each state an act opens (`acts.mjs`).
 * `layout-overflow`, `layout-target`, `layout-target-edge` and `layout-settle` are all proved here, each seed on a page
 * of its own.
 *
 * `seeds` is the seeds this pass plants, or `[null]` for a real run; `floor` and `desktop` say where the acts apply.
 */

import { openPage } from '../lib.mjs';
import { ACTS } from './acts.mjs';
import { measure } from './measure.mjs';
import { plant } from './plant.mjs';
import { takeMark } from './settle.mjs';
import { mark, printedOn, UNFOLD } from './shared.mjs';

export async function sweep(run, { widths, routes: ROUTES, seeds: sweepSeeds, floor: FLOOR, desktop }) {
  const { browser, ready, findings, budgets: B } = run;
  for (const width of widths)
    for (const planted of sweepSeeds) {
      /**
       * A COARSE POINTER AT PHONE WIDTHS, because that is the axis the target-size rule turns on.
       *
       * `05 §6` and `13 §7`: density follows the POINTER, never the width. `--ctl-h` is 44 on a coarse
       * pointer and **36** on a fine one, measured in the built page. (Two comments in this repo say 32,
       * including `controls.css`'s; the token is 36.) A gate that only ever emulated a mouse could
       * measure every width this product has and never once see the size a thumb gets.
       */
      /* OPENED THE ONE WAY EVERY GATE OPENS A PAGE (PRF-B04, `openPage`): the record's clock, and a coarse pointer at a
         phone's width. The mark is taken off after the first load, so every route below is loaded with it gone. */
      const opened = await openPage(browser, run.at(ROUTES[0]), { width, touch: width < 640, record: run.asked(), ready, again: run.again });
      const { context, page } = opened;
      if (planted?.id === 'layout-settle') await takeMark(context);
      process.stdout.write(`    ${String(width).padStart(4)}px ${planted ? `${planted.id} ` : ''}`);

      for (const route of ROUTES) {
        /* `domcontentloaded` IS WORTH NOTHING ON ITS OWN HERE and never was: `ssr = false`, so the shell
           served off disk is a script tag that imports the client, and `#main` does not exist until it
           has run. The wait for the screen's mark is the only thing between the gate and an empty document, which is
           why its expiry is a finding and not a `catch`. */
        const unmeasured = ready.check(`${route} @${width}`, route, await opened.goto(run.at(route)));
        if (unmeasured) {
          findings.push(mark(planted, unmeasured));
          process.stdout.write('!');
          continue;
        }
        // An un-laid-out rowgroup has no geometry: it cannot overflow, and it cannot be measured.
        await page.addStyleTag({ content: UNFOLD });
        await plant(page, planted);
        await page.waitForTimeout(B.settleMs);

        const out = await measure(page, width, B.widthTolerancePx, width < 640);

        run.checked++;
        process.stdout.write(out.length ? '!' : '.');
        for (const o of out) findings.push(mark(planted, `${route} @${width}  ${o}`));
        await printedOn(run, opened, `${route} @${width}`, planted, route);

        /* AND THEN THE STATES, at the widths where the rule they break applies. `FLOOR` short of its
           desktops is the phones and the tablet; above them the pointer is fine and a 34px control is the
           density this product means. */
        if (FLOOR.includes(width) && !desktop(width))
          for (const act of ACTS[route] ?? []) {
            try {
              await act.run(page);
            } catch (e) {
              findings.push(mark(planted, `${route} @${width}  could not reach "${act.name}": ${String(e).split('\n')[0]}`));
              process.stdout.write('!');
              continue;
            }
            await page.waitForTimeout(B.settleMs);
            const after = await measure(page, width, B.widthTolerancePx, width < 640);
            run.checked++;
            process.stdout.write(after.length ? '!' : ':');
            for (const o of after) findings.push(mark(planted, `${route} @${width} (${act.name})  ${o}`));
            /* BACK TO REST, because the acts share one page and the next one must not open its sheet
               over the last one's. A reload is cheaper to reason about than an undo per act. */
            await opened.goto(run.at(route));
            await page.addStyleTag({ content: UNFOLD });
          }
      }
      process.stdout.write('\n');
      await context.close();
    }
}
