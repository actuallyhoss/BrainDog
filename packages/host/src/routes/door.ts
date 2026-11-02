/**
 * The route rows for the agent door's own signs (`packages/record/src/methods/door.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `heard` IS DATA AND A WRITE: a POST whose JSON body is the mark, so it takes nothing in a query. It opens no run and
 * changes no row a person reads; it adds to the door's own table. `doorSigns` IS READ+ AND NO WRITE, the whole record's,
 * and takes how many days back. `doorHealth` IS ADMIN, the owner's in a browser: every connection, its app, build and last
 * tool call, and the door's seven signs. It takes nothing and changes nothing.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'heard', group: 'DATA', writes: true, what: 'Say how long this session\'s start hook took. The agent door marks hello, the tool list and calls itself. It opens no run.',
    takes: {} },
  { name: 'doorSigns', group: 'READ+', writes: false, what: 'How many sessions connected, were given the tools and made a call, over the last 7 days unless days says otherwise. It changes nothing.',
    takes: { days: 'integer' } },
  { name: 'doorHealth', group: 'ADMIN', writes: false, what: 'Every app, machine and key that can act on this BrainDog, the build each runs and when it last used a tool, and whether the agent door is working. In the app, or by your agents while they act without asking.',
    takes: {} },
];
