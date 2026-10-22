/**
 * The route row for the record's check of its own words (`packages/record/src/methods/text-faults.ts`, PGS-B15 job a).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `textFaults` IS READ+ AND WRITES NOTHING: a person, or an agent on a key that reads, is told every path that names
 * nothing, every value that does not parse and every fence drawn as written, on the pages they may open and in the
 * documents of the lists they may read, each with its place and its fix. It takes nothing. A reader of the whole record is
 * told what the record's night pass kept and when (`computedAt`); the walk is not made when a screen opens.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'textFaults', group: 'READ+', writes: false, what: 'Every fault in the words of your pages and documents, as the record found them at its last nightly check, and when that was: a path that names nothing, a value that does not parse, a block shown as written. Each with its place and its fix. It changes nothing.',
    takes: {} },
];
