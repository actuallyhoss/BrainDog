/**
 * The route row for a board's edits (`packages/record/src/board-steps.ts`, the widgets plan of 29 October §7.3).
 *
 * `boardSteps` IS DATA SINCE EACH PERSON HAS THEIR OWN TODAY (widgets plan W8): the owner's call writes the record's page,
 * which everybody who reads the record opens, and the record asks the owner's door for that as `setDeclaration` does,
 * which his own agent passes while he lets agents do everything without asking; a member's call on `home` writes their
 * own Today and nothing anybody else opens. Every other page is still the owner's. It applies the editor's steps on top
 * of the board as it stands and writes one version.
 *
 * AND THE LINE SAYS WHO (9 Nov): an agent reads it through `act`, and on 8 Nov one that read that boards were the owner's
 * session's arranged his Today through his own browser instead.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'boardSteps', group: 'DATA', writes: true, what: "Apply a board's edits (move, size, add, remove, keep a draft, the phone's arrangement) on top of the page as it stands, as one new version. A page not kept yet is kept from base on its first edit. The owner's, and his agents' while he lets them do everything without asking. A member's edits to Today are kept as their own Today; put sets theirs back.",
    takes: { page: 'text', version: 'integer', steps: 'json', base: 'json', put: 'json' } },
];
