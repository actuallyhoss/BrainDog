/**
 * The route rows written outside `index.ts`: every file under `routes/`, gathered into `EXTRA_ROUTES`.
 *
 * ONE FILE PER UNIT, AND THIS FILE IS ONLY A LIST. A new routed method is a record method in
 * `packages/record/src/methods/<unit>.ts` and its row in `routes/<unit>.ts`, which exports `ROUTES`; it is registered
 * here with one import line and one spread line, both inside the `ROUTES` block, so two changes adding routes at
 * once touch two lines of this file and no line of `index.ts`.
 *
 * `index.ts` SERVES THESE AS IT SERVES ITS OWN. `ROUTES` there is its own rows and then these, and `handlersFor` wires
 * each of these to the record method of the same name, answering `NOT_IN_THIS_BUILD` from a record that has not got it.
 */

import type { Route } from '../index.ts';

/* ROUTES: the imports, one line per file under this folder, named for the file. */
import { ROUTES as agents } from './agents.ts';
import { ROUTES as automations } from './automations.ts';
import { ROUTES as comments } from './comments.ts';
import { ROUTES as members } from './members.ts';
import { ROUTES as previewChange } from './preview-change.ts';
import { ROUTES as slashDraft } from './slash-draft.ts';
import { ROUTES as vaultPassphrase } from './vault-passphrase.ts';
import { ROUTES as ownTokens } from './own-tokens.ts';
import { ROUTES as quiet } from './quiet.ts';
import { ROUTES as pattern } from './pattern.ts';
import { ROUTES as personName } from './person-name.ts';
import { ROUTES as retype } from './retype.ts';
import { ROUTES as understand } from './understand.ts';
/* END ROUTES */

export const EXTRA_ROUTES: readonly Route[] = [
  /* ROUTES: the spreads, one line per file, in the order of the imports above. */
  ...agents,
  ...automations,
  ...comments,
  ...members,
  ...previewChange,
  ...slashDraft,
  ...vaultPassphrase,
  ...ownTokens,
  ...quiet,
  ...pattern,
  ...personName,
  ...retype,
  ...understand,
  /* END ROUTES */
];
