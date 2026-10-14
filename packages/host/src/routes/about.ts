/**
 * The route row for what one thing on the record is (`packages/record/src/methods/about.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`: it names no list, so anybody
 * who may read anything is answered, and the answer is held to the lists that caller reads. Something in a list closed
 * to her is answered as a name nobody has, so the route never says it is there.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE, AND BOTH FORMS ARE TAKEN OVER THE WIRE. `name` is text, so a call naming
 * the thing by anything else is refused here, at `name`. `row` is JSON, `{ "register": "projects", "seq": 3 }`, the one
 * row a page is drawn for: the web's "Where it was seen" asks by it, as a GET with the row as one query value. It was
 * text-only once, so the row reached the record as a string and every project page logged a 422 under an empty tile.
 * The route decodes it and no more: the record method checks its shape and refuses a wrong one at `row`.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'about', group: 'READ+', writes: false, what: 'What one thing is, asked by its name or by its number in its list: its kind, its name, what else it goes by and where it was seen. When two things answer to the name, both are offered and neither is picked. Held to the lists you may read. It changes nothing.',
    takes: { name: 'text', row: 'json' } },
];
