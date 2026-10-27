/**
 * The route rows for where things stand (`packages/record/src/methods/stale.ts`, AGT-C18 job c and AGT-D04).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `stale` IS READ+ AND WRITES NOTHING: a person, or an agent on a key that reads, is told what went stale where they
 * stand and the one call that clears each, held by the record to the lists they may read. It takes nothing.
 *
 * `scopeProposals` IS READ+ AND `proposeScopes` IS DATA: the first says where each list's things with no scope
 * belong and why, and the second puts that to Decide as one question a list. The record refuses any token the second,
 * whatever its scope, since only a person's press files the whole record's moves.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'stale', group: 'READ+', writes: false, what: 'What went stale where you stand, each kind in one sentence with how many and the one call that clears it. It changes nothing.',
    takes: {} },
  { name: 'scopeProposals', group: 'READ+', writes: false, what: 'Where the things of each list that apply everywhere seem to belong, with the reasons for each. It changes nothing.',
    takes: { register: 'text' } },
  { name: 'proposeScopes', group: 'DATA', writes: true, what: 'Puts those moves to Decide as one question a list, signed by you, and nothing moves until you answer.',
    takes: { register: 'text' } },
];
