/**
 * The route row for what one machine holds, written down by the record (`packages/record/src/methods/tools-seen.ts`,
 * AGT-D02): every server, command line and integration matched to its row by what it runs.
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `toolsSeen` IS DATA. Its first statement is `guard(ctx, 'write', ...)` over the list tools are kept in, so a key that
 * may write there is answered and one that may not is refused as writing there is. It adds a tool directly, signed by
 * the caller's run, as `meet` adds a person, and asks only when a known name now runs something else.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `machine` is text and `found` is JSON, the list of tools; what makes one tool
 * a tool, and a value that looks like a key, are the record's to say.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'toolsSeen', group: 'DATA', writes: true, what: 'Write down the servers, command lines and integrations one machine holds. Each is matched to its row by what it runs, added when new, and asked about only when a known name runs something else.',
    takes: { machine: 'text', found: 'json' } },
];
