/**
 * The route rows for retyping a field: previewing what changing its type would do to a list's rows, then doing it
 * (`packages/record/src/methods/retype.ts`, `loop/finish/gaps.md` GAP-8).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD: `router-groups` holds each row's group to
 * `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same name to the guard its group implies.
 *
 * READ+ TO PREVIEW, DATA TO RETYPE: an owner's change lands at once, and anybody else's waits on Decide, the same
 * split every other field-shape change takes.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  {
    name: 'previewRetype',
    group: 'READ+',
    writes: false,
    what: 'What changing one field would do over its list’s rows: how many carry over, each that does not, and a few as they would read. It writes nothing.',
  },
  {
    name: 'retypeField',
    group: 'DATA',
    writes: true,
    what: 'Change one field’s type or what it takes, with an answer for every row that would not carry over. An owner’s lands at once; anybody else’s waits on Decide.',
  },
];
