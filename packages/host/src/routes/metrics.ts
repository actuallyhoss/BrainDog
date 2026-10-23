/**
 * The route row for several figures in one read (`packages/record/src/methods/metrics.ts`).
 *
 * `metrics` IS READ+, AS `metric` IS, AND IT CHANGES NOTHING: each figure is answered by `metric` itself, with every check
 * it makes. `metrics` is JSON, a list of ids, so it survives a query string as the list it was.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'metrics', group: 'READ+', writes: false, what: 'Several figures in one read: each one as metric answers it, or the refusal metric would give. It changes nothing.',
    takes: { metrics: 'json' } },
];
