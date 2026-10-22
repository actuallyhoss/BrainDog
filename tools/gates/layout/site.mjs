/**
 * `layout-site`, and the overflow rule on every other record: the variant pass. Each run is one build served over one
 * record (`VARIANTS` in `../layout.mjs`), the marketing site among them, measured by the same check as the sweep.
 *
 * `runs` is the variants this run draws, each with the seed planted on it or `null`; `widths` is theirs and not the
 * sweep's. `run.serve(v)` points the port at the variant, and the entry points it back when the pass is over.
 */

import { openPage } from '../lib.mjs';
import { answers } from '../record.mjs';
import { measure } from './measure.mjs';
import { plant } from './plant.mjs';
import { mark, printedOn, UNFOLD } from './shared.mjs';

/**
 * The variants, at the widths that matter for them.
 *
 * Only the routes that branch, and only on a phone and a desktop. The point is that the OTHER half
 * of the branch is drawn at all and holds together, not a second full sweep of a build that differs
 * from the first by one constant.
 */
export async function variants(run, { runs: variantRuns, widths: variantWidths }) {
  const { browser, ready, findings, budgets: B } = run;
  for (const { v, planted } of variantRuns) {
    run.serve(v);
    /* THE PORT ANSWERS FOR THE VARIANT BEFORE ANYTHING IS MEASURED ON IT, which is what `answers` proves of the main
       record above: a pass over a forward that still pointed at the first record would be the first record again. */
    if ((v.record ?? null) !== null) await answers(run.origin);
    for (const width of variantWidths) {
      /* OPENED AS EVERY PAGE IS (`openPage`), ON THE VARIANT'S OWN CLOCK; the site is drawn on the gates' record's. */
      const opened = await openPage(browser, run.at(v.routes[0]), {
        width,
        touch: width < 640,
        record: run.asked(),
        ready,
        prerendered: v.prerendered === true,
        again: run.again,
      });
      const { context, page } = opened;
      process.stdout.write(`    ${v.name} @${String(width).padStart(4)} `);
      for (const route of v.routes) {
        /* THE SAME READINESS, or the variant pass is the half of this gate that can still go green
           over nothing. The site is prerendered and says so in `VARIANTS`. */
        const unmeasured = ready.check(`${v.name}${route} @${width}`, route, await opened.goto(run.at(route)));
        if (unmeasured) {
          findings.push(mark(planted, unmeasured));
          process.stdout.write('!');
          continue;
        }
        /* THE SAME PREPARATION, or "the identical check" is only true of the function. An un-laid-out
           rowgroup has no geometry and cannot overflow; the seed is what makes this pass answerable by
           `self-test`, which otherwise passes on the main loop alone however little the variant pass
           measures. */
        await page.addStyleTag({ content: UNFOLD });
        await plant(page, planted);
        await page.waitForTimeout(B.settleMs);
        const out = await measure(page, width, B.widthTolerancePx, width < 640);
        run.checked++;
        process.stdout.write(out.length ? '!' : '.');
        for (const o of out) findings.push(mark(planted, `${v.name}${route} @${width}  ${o}`));
        await printedOn(run, opened, `${v.name}${route} @${width}`, planted, route);
      }
      process.stdout.write('\n');
      await context.close();
    }
  }
}
