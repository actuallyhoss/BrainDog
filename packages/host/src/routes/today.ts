/**
 * The route row for Today's tiles in one read (`packages/record/src/today.ts`, scope 2026-10-24 A12).
 *
 * `today` IS READ+ AND CHANGES NOTHING: Today's body drawn as `previewPage` draws it, with what BrainDog did itself, what
 * is shared out and the project cards' parts beside it, each its own method's answer to the same caller. A POST because
 * a body is no query string, which makes it a read sent as a write (`postRead`), as `previewPage` is.
 *
 * `shape` (phone or wide) has the record remember the body a first read of Today asked on that shape of screen, and
 * `last`, asked by itself beside `boot`, draws Today with it, the answer carrying the digest of what it drew (`asked`).
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'today', group: 'READ+', writes: true, postRead: true, what: "Today's body drawn as previewPage draws it, with each tile's part beside it: what BrainDog did itself, what is shared out, and the project cards' late work, runs and key numbers. It changes nothing.",
    takes: { body: 'json', page: 'text', offer: 'json', fresh: 'json', last: 'text', shape: 'text' } },
];
