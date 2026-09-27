/**
 * The sample put where a live tab keeps what the record has said: its declarations, its pages, its rows, the name each
 * row goes by, and its exchange rates.
 *
 * A TEST IMPORTS THIS FOR ITS SIDE EFFECT AND NOTHING SHIPPED MAY. Every helper a live screen draws with reads
 * `held.ts`, which only the record fills in a shipped tab, so `thing is Kiln` is a question about the record's projects
 * and a list not learnt yet has no fields rather than the seed's. The tests that hold those helpers to the sample ask
 * about the sample on purpose, and this is how they say so. `tools/gates/no-fixtures.mjs` refuses a shipped file that
 * imports it.
 *
 * NO FACTOR TABLES. The browser's own figure engine was the one reader of `held.ts`'s `LOOKUPS`, and it is gone: a
 * figure is read by the record, which reads its factors off the figure's declaration.
 *
 * IT WAS THE FIXTURE'S OWN SIDE EFFECT UNTIL WAVE C1, and not only a test's. `data.ts` wrote the declarations and pages
 * into `held.ts` when it loaded, and eleven shipped files imported it for a table or two, so every tab carried the
 * seed's declarations from its first line.
 */

import { ratesFrom } from '@braindog/kernel';

import { PAGES, REGISTERS, ROWS } from './sample.ts';
import * as held from '../held.ts';
import { withFx } from '../metrics.ts';

Object.assign(held.REGISTERS, REGISTERS);
Object.assign(held.PAGES, PAGES);
Object.assign(held.ROWS, ROWS);

for (const [register, rows] of Object.entries(ROWS)) {
  const title = REGISTERS[register]?.title;
  held.TITLES.set(register, new Map(rows.map((e) => [e.seq, title === undefined ? '' : String(e.fields[title] ?? '')])));
}

/* THE SAMPLE'S `fx` ROWS AS THE RATES FIGURES CONVERT AT, AND NO HOME CURRENCY, which is what a figure read in a test
   was always read with. Never put back: a test that hands in its own with `withFx` restores this one when it is done. */
withFx(() => ({ home: null, rates: ratesFrom((held.ROWS.fx ?? []).map((e) => e.fields)) }));
