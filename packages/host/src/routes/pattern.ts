/**
 * The route rows for the ingest pattern builder (`packages/record/src/methods/pattern.ts`, `loop/finish/platform.md`
 * §4.0 T).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * TWO READS, AND THE ARGUMENTS SAY WHAT THEY ARE. A pattern and its samples are structured, so they are `json`; a
 * selection's sample and field are the text the builder sent, and its ends are whole numbers. A try long enough to
 * outgrow an address goes as a POST, which the host takes for any read.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'tryPattern', group: 'READ+', writes: false, what: 'Try a pattern on up to ten messages from the inbox and show what it would read from each. It writes nothing.',
    takes: { ingest: 'json', samples: 'json', pasted: 'json' } },
  { name: 'anchorsFor', group: 'READ+', writes: false, what: 'The ways to find text selected in one message again, each tried on every sample. It writes nothing.',
    takes: { sample: 'text', field: 'text', start: 'integer', end: 'integer', samples: 'json', pasted: 'json', type: 'text' } },
];
