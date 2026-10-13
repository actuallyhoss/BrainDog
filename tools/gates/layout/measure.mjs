/**
 * What one page is measured for, the one way, on every pass: the overflow rule, and the target rule under a coarse
 * pointer. One function, so the sweep, the docked pass and the variant pass cannot come to hold a copy each.
 */

import { OVERFLOW } from './overflow.mjs';
import { TARGETS } from './target.mjs';

/**
 * The findings of one page as it stands, four at most and each said once. `coarse` is whether the pointer is a thumb,
 * and `docked` whether a panel stands beside the work, whose edge then takes the window's (`OVERFLOW`).
 */
export async function measure(page, width, slack, coarse, docked = false) {
  const hits = await page.evaluate(OVERFLOW, [width, slack, docked]);
  if (coarse) hits.push(...(await page.evaluate(TARGETS)));
  return [...new Set(hits)].slice(0, 4);
}
