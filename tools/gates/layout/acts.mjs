/**
 * The states a page is measured in besides rest (PRF-B08 edits this list). `sweep.mjs` runs each act of a route at the
 * phone and tablet widths, measures the page again, and loads the route afresh.
 */

/**
 * THE CONTROLS THAT DO NOT EXIST UNTIL SOMEBODY DOES SOMETHING, and this gate has never seen one.
 *
 * The sweep below measures a page AT REST: it opens a route, waits for it to settle, and reads
 * the geometry. That is the right default and it is not the whole product. Two of the targets a
 * phone actually presses are conditional markup, and both were under 44px for as long as they
 * have existed:
 *
 *   * `.capture-go`, the submit control of the register's capture line, measured 48x24. It is
 *     drawn inside `{#if capture.trim()}`, so at rest it is not in the document at all.
 *   * `.filter-value`, in the Display sheet, measured 358x34. It is the only way to sort a list
 *     or hide a column on a phone, and the sheet is closed at rest.
 *
 * Both were found by a person reading the CSS, not by this gate, on a run that reported zero
 * findings over 572 page-runs. A rule that cannot see a control cannot enforce anything about it.
 *
 * ONLY AT THE FLOOR WIDTHS, AND ONLY WHERE THERE IS AN ACT. The target-size rule turns on the
 * pointer and the pointer is emulated below 640, so a state opened at 1180px would be measured
 * against a rule that does not apply there. Three widths and two acts was six extra page-runs on
 * a sweep of five hundred and seventy-two.
 *
 * AND NOT AT THE FLOOR'S TWO LAPTOP WIDTHS, which joined it so every screen is drawn at the size the
 * owner reads it. Both are past the widest breakpoint under a fine pointer, which is the 1180px
 * argument again with more room, so the acts keep to the phones and the tablet: four widths and
 * eight page-runs on a sweep of about eighteen hundred.
 *
 * AN ACT THAT DOES NOT TAKE IS A FINDING AND NOT A SKIP. A `catch` here would give exactly the
 * green this block exists to stop being: the gate would report the state measured and have
 * measured the page behind it.
 */
export const ACTS = {
  '/r/obligations': [
    {
      name: 'capture typed',
      run: async (page) => {
        /* BELOW 640 THE CAPTURE LINE IS A SHEET BEHIND THE HEAD'S "+", so the act opens it first. */
        if (!(await page.locator('#capture').isVisible())) await page.click('.capture-open', { timeout: 4000 });
        await page.fill('#capture', 'a');
        await page.waitForSelector('.capture-go, [data-capture-go]:not([disabled])', { timeout: 4000 });
      },
    },
    {
      name: 'Display open',
      run: async (page) => {
        await page.getByRole('button', { name: 'Display' }).click({ timeout: 4000 });
        await page.waitForSelector('.filter-value', { timeout: 4000 });
      },
    },
  ],
};
