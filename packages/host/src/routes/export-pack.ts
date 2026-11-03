/**
 * The route row for an add-on made from what a person made (`packages/record/src/methods/export-pack.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `exportPack` IS READ+, AND IT CHANGES NOTHING. The method's first statement is `guard(ctx, 'read')`, and somebody who
 * does not read the whole record is refused after it, as sharing a use case is. It answers the file and what it would
 * add; downloading it and publishing it are the person's presses, and nothing here sends it anywhere.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `declarations` (the ticks) and `rows` (the example rows by list and number)
 * arrive as JSON; `title`, `id` and `version` as text. Whether a tick is one of the record's own is the record's.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'exportPack', group: 'READ+', writes: false, what: 'What you made here that you can share, or the plugin file made from the ones you ticked, with what it brings along and why. It carries none of your own entries, names or keys, and it changes nothing.',
    takes: { declarations: 'json', rows: 'json', title: 'text', id: 'text', version: 'text', summary: 'text' } },
];
