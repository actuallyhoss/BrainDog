/**
 * `43 §2` — `testAgainst`: run a declaration over real samples and count what it found.
 *
 * THIS IS WHAT SOMEBODY PRESSES BEFORE THEY ARM AN INGEST. `23 §4` draws it as a hit rate on every line,
 * `3 of 3`, `2 of 3`, `0 of 3`, and its rule is the one that shapes this file: **state the number, do not
 * grade it.** So there is no score here, no percentage and no verdict. A count and its denominator, and the
 * person decides what `2 of 3` means for their bank, because only they know whether the third message was a
 * fee notice that should never have matched.
 *
 * IT WRITES NOTHING. `§2` says so and it is the reason the button is safe to press on live samples.
 */

import { matches, type RawArrival } from './arrival.ts';
import { extract, type Declaration, type ExtractCtx } from './pipeline.ts';

export type Tally = { won: number; lost: number };

export type Report = {
  samples: number;
  matched: number;
  skipped: number;
  rows: number;
  fields: Record<string, Tally>;
};

/**
 * A FIELD IS TALLIED PER ROW AND NOT PER SAMPLE. One SMS is one row and the two agree, which is the case
 * `23 §4` draws. One CSV is five hundred, and counting it as a single sample would let a pattern that found
 * the amount once in five hundred read `1 of 1`. The denominator is rows the declaration actually reached:
 * a sample that did not match, or that its own `skip:` declined, asked nothing of the fields and is counted
 * on its own line instead.
 */
export function testAgainst(decl: Declaration, samples: RawArrival[], ctx: ExtractCtx): Report {
  const report: Report = { samples: samples.length, matched: 0, skipped: 0, rows: 0, fields: {} };

  for (const raw of samples) {
    if (!matches(decl, raw)) continue;
    report.matched += 1;

    const got = extract(decl, raw, ctx);
    if (got.skipped !== undefined) {
      report.skipped += 1;
      continue;
    }

    report.rows += got.rows.length;
    for (const row of got.rows)
      for (const [field, outcome] of Object.entries(row.outcome)) {
        const tally = (report.fields[field] ??= { won: 0, lost: 0 });
        /* `defaulted` IS A WIN. The declaration said what to do when the field is not there and it did it,
           which is the author's pattern working rather than failing. `chosen` likewise: `first:` picking its
           second form is the form list earning its place. What loses is `missing`, `invalid` and
           `ambiguous`, which are the three that put the row in front of a person. */
        if (outcome === 'exact' || outcome === 'chosen' || outcome === 'defaulted') tally.won += 1;
        else tally.lost += 1;
      }
  }

  return report;
}
