/**
 * The route rows for what each pattern did and "It is a second one" (`packages/record/src/methods/inbox-patterns.ts`,
 * REC-A03 steps 3 and 5).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+ TO READ AND ADMIN TO PRESS. The report files nothing, so a token with the inbox reach reads it as it reads the
 * inbox, and a GET carries its one number. The press writes a movement the pattern kept out, so it is an owner's in a
 * browser, as `fileArrival` is, and takes its message in a POST body.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'inboxPatterns', group: 'READ+', writes: false, what: 'What each pattern did with the last 14 days of messages, or the days asked for: what it filed, what it skipped and why, what waits, and what none of them read. It changes nothing.',
    takes: { days: 'integer' } },
  { name: 'fileAsSecond', group: 'ADMIN', writes: true, what: 'File a message that was skipped as a repeat after all, because it is a second real charge.' },
];
