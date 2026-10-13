/**
 * What every pass of the layout gate shares (`../layout.mjs` is the entry, and each rule's check is a file beside this
 * one). Nothing here is a rule: it is how a finding is tagged, how a page is opened and reached, and where the widths
 * come from.
 *
 * THE RUN. `../layout.mjs` owns the port, the record and the browser, and hands every pass one object, `run`:
 *   `browser`, `ready`                the browser and the readiness contract (`lib.mjs` `readiness`)
 *   `at(route)`                       the address a route is opened at, on whichever build the port is serving
 *   `asked()`                         the record `/api` reaches on this pass, as `openPage` reads it
 *   `findings`, `checked`, `missing`  what the run found, how many page-runs it measured, the routes drawn as not found
 *   `budgets`, `actMs`                the gate's numbers out of `budgets.json`, read in the entry so `self-test` sees them
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { openPage, skipDir } from '../lib.mjs';
import { checkScreen, readScreen } from '../printed.mjs';

/** A seeded finding carries its seed's name, so `self-test` can tell which seed a red line answers. */
export const mark = (s, text) => (s ? `[${s.id}] ${text}` : text);

/** An un-laid-out rowgroup has no geometry: it cannot overflow, and it cannot be measured. */
export const UNFOLD = '.rowgroup{content-visibility:visible !important}';

/** Every source file that could hold a media query. */
async function* sources(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (skipDir(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (/\.(css|svelte)$/.test(e.name)) yield p;
  }
}

/** The pixel widths inside `@media` conditions, in every syntax this repo uses. */
export async function breakpoints(root) {
  const found = new Set();
  for (const dir of [join(root, 'apps', 'web', 'src'), join(root, 'packages', 'skin')]) {
    for await (const file of sources(dir)) {
      const text = await readFile(file, 'utf8');
      for (const m of text.matchAll(/(?:width\s*[<>]=?\s*|(?:min|max)-width:\s*)(\d+)px/g)) {
        found.add(Number(m[1]));
      }
    }
  }
  return [...found];
}

/* THE THREE SHAPES `19 §3` OFFERS, by what the shell writes on `.shell[data-shape]` and what the record keeps to ask
   for each. The rail is the default and asks for nothing; the record's word for it is not the shell's. */
export const SHAPES = [
  { name: 'the rail', drawn: 'rail', keeps: null },
  { name: 'the top bar', drawn: 'bar', keeps: { 'nav.shape': 'bar' } },
  { name: 'the menu', drawn: 'menu', keeps: { 'nav.shape': 'menu' } },
];

/**
 * WHAT A SETTLED SCREEN PRINTS (PRF-B04 job 5, `printed.mjs` `checkScreen`): on every page-run, a raw id, a raw time,
 * a key, a value that never arrived or a page error is a finding of this gate too. Said once a screen, and only of
 * a screen that settled.
 */
export const printedOn = async (run, opened, where, planted, route) => {
  for (const f of checkScreen(await readScreen(opened, where), { missing: run.missing.includes(route) })) run.findings.push(mark(planted, f));
};

/**
 * A desktop window drawing one shape, opened at `route` (`openPage`). THE SHAPE IS KEPT BY THE RECORD, through its own
 * `setPref` as a person's Settings keeps it, and the next window that asks for none hands it back. Motion is reduced
 * unless the pass is watching something move.
 */
export const openFor = (run, width, shape, route, reducedMotion = 'reduce') =>
  openPage(run.browser, run.at(route), { width, record: run.asked(), prefs: shape.keeps ?? {}, reducedMotion, ready: run.ready });

/**
 * Opens a screen and waits for it to settle; `false`, with the finding written, when it never did. A screen that
 * settled is read for what it prints (`printedOn`).
 */
export const reach = async (run, opened, route, where, planted = null) => {
  const unmeasured = run.ready.check(where, route, await opened.goto(run.at(route)));
  if (unmeasured) {
    run.findings.push(mark(planted, unmeasured));
    process.stdout.write('!');
    return false;
  }
  await opened.page.waitForTimeout(run.budgets.settleMs);
  await printedOn(run, opened, where, planted, route);
  return true;
};
