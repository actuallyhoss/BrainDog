/**
 * The route row for several reads in one request (`packages/record/src/methods/reads.ts`, scope 2026-10-24 A12).
 *
 * `reads` IS READ+ AND CHANGES NOTHING: each read in it is answered by its own route, with every check that route makes,
 * and a route that writes is refused inside it. It is a POST because a list of reads is no query string, which makes it
 * a read sent as a write (`postRead`), as `previewPage` is.
 *
 * WHY. Today asked about thirty reads of his record on one open, and every one went through the doors in front of the
 * record and queued on its one thread (23 Oct, "Durable Object is overloaded"). The app sends the reads a screen asks
 * at once as one of these (`packages/client`, `batchReads`), so the doors are passed once and the record answers them
 * one after another, as it would have anyway.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'reads', group: 'READ+', writes: true, postRead: true, what: 'Several reads in one request: each answered as its own route answers it, with its status. A write is refused. It changes nothing.',
    takes: { calls: 'json' } },
];
