/**
 * The route rows for what an installed add-on lets people and agents start (`packages/record/src/methods/addon-tools.ts`):
 * its agent tools, its command bar entries and its row actions.
 *
 * `addonActions` IS A READ: what the add-ons that are on give, row actions held to the lists the caller reads.
 * `addonTool` RUNS ONE, READ+ beside `scriptTry` and for its reasons: it spends a run of the plan and may send a request
 * of its own, so it is a POST and never a prefetched link. It opens with `guard(ctx, 'propose')`, as `scriptTry` does,
 * and every write it makes goes through the record's own `create` and `update` under the caller's context, so the
 * caller's rung decides whether it lands or is asked. An agent reaches it as `act {call: "addon.<id>.<tool>"}`.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'addonActions', group: 'READ+', writes: false, what: 'What the add-ons that are on let you start: tools for agents, entries in the command bar and actions on rows, each with its add-on.',
    takes: { list: 'text' } },
  { name: 'addonTool', group: 'READ+', writes: true, what: "Start one of an add-on's tools, commands or row actions: its script runs now with your own sight, and anything it changes is written as you.",
    takes: { addon: 'text', tool: 'text', args: 'json', command: 'text', values: 'json', action: 'text', row: 'text' } },
];
