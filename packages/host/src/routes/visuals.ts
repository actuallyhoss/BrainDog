/**
 * The route rows for visuals (`packages/record/src/methods/visuals.ts`): DATA to hang one and READ+ to read, as `log` and
 * `get` are, since a visual changes no value.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'attachVisual', group: 'DATA', writes: true, what: 'Hang a page on a task, a project, a question or a decision, with the pictures it names, or give one it carries a new version. Answers a receipt whose batch undo takes back.' },
  { name: 'visuals', group: 'READ+', writes: false, what: 'The visuals one thing you can see carries, each by its title, version and who made it, without its page.',
    takes: { on: 'text' } },
  { name: 'visual', group: 'READ+', writes: false, what: 'One visual: the version asked or its newest, with its page and its pictures by hash, and every version by who made it.',
    takes: { id: 'text', version: 'integer' } },
];
