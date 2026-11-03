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
import { ROUTES as keychainPassphrase } from './keychain-passphrase.ts';
import { ROUTES as keychainAccess } from './keychain-access.ts';
import { ROUTES as ownTokens } from './own-tokens.ts';
import { ROUTES as quiet } from './quiet.ts';
import { ROUTES as zone } from './zone.ts';
import { ROUTES as sameValues } from './same-values.ts';
import { ROUTES as pattern } from './pattern.ts';
import { ROUTES as personName } from './person-name.ts';
import { ROUTES as retype } from './retype.ts';
import { ROUTES as understand } from './understand.ts';
import { ROUTES as signs } from './signs.ts';
import { ROUTES as inboxPatterns } from './inbox-patterns.ts';
import { ROUTES as faults } from './faults.ts';
import { ROUTES as withdraw } from './withdraw.ts';
import { ROUTES as door } from './door.ts';
import { ROUTES as engine } from './engine.ts';
import { ROUTES as engineProbe } from './engine-probe.ts';
import { ROUTES as capture } from './capture.ts';
import { ROUTES as trust } from './trust.ts';
import { ROUTES as IMPORTS } from './imports.ts';
import { ROUTES as sameOne } from './same-one.ts';
import { ROUTES as heldTwice } from './held-twice.ts';
import { ROUTES as about } from './about.ts';
import { ROUTES as briefing } from './briefing.ts';
import { ROUTES as exceptions } from './exceptions.ts';
import { ROUTES as matched } from './matched.ts';
import { ROUTES as stale } from './stale.ts';
import { ROUTES as learnings } from './learnings.ts';
import { ROUTES as textFaults } from './text-faults.ts';
import { ROUTES as learned } from './learned.ts';
import { ROUTES as handled } from './handled.ts';
import { ROUTES as inboxHints } from './inbox-hints.ts';
import { ROUTES as SKILLS_BEHIND } from './skills-behind.ts';
import { ROUTES as TOOLS_SEEN } from './tools-seen.ts';
import { ROUTES as NAMED_TWICE } from './named-twice.ts';
import { ROUTES as exportPack } from './export-pack.ts';
import { ROUTES as SHARES } from './shares.ts';
import { ROUTES as deviceRename } from './device-rename.ts';
import { ROUTES as renameList } from './rename-list.ts';
import { ROUTES as doorSwitch } from './door-switch.ts';
import { ROUTES as flowGrammar } from './flow-grammar.ts';
import { ROUTES as PACKS_REMOVED } from './packs-removed.ts';
import { ROUTES as ADDONS } from './addons.ts';
import { ROUTES as ADDON_TOOLS } from './addon-tools.ts';
import { ROUTES as PUSH_TEST } from './push-test.ts';
import { ROUTES as HUES } from './hues.ts';
import { ROUTES as DECIDER } from './decider.ts';
import { ROUTES as actionRun } from './action-run.ts';
import { ROUTES as SHARING } from './sharing.ts';
import { ROUTES as SCHEMAS } from './schemas.ts';
import { ROUTES as SEALED } from './sealed.ts';
import { ROUTES as VISUALS } from './visuals.ts';
import { ROUTES as METRICS } from './metrics.ts';
import { ROUTES as READS } from './reads.ts';
import { ROUTES as TODAY } from './today.ts';
import { ROUTES as WIDGETS } from './widgets.ts';
import { ROUTES as board } from './board.ts';
/* END ROUTES */

export const EXTRA_ROUTES: readonly Route[] = [
  /* ROUTES: the spreads, one line per file, in the order of the imports above. */
  ...agents,
  ...board,
  ...automations,
  ...comments,
  ...members,
  ...previewChange,
  ...slashDraft,
  ...keychainPassphrase,
  ...keychainAccess,
  ...ownTokens,
  ...quiet,
  ...zone,
  ...sameValues,
  ...pattern,
  ...personName,
  ...retype,
  ...understand,
  ...signs,
  ...inboxPatterns,
  ...faults,
  ...withdraw,
  ...door,
  ...engine,
  ...engineProbe,
  ...capture,
  ...trust,
  ...IMPORTS,
  ...sameOne,
  ...heldTwice,
  ...about,
  ...briefing,
  ...exceptions,
  ...matched,
  ...stale,
  ...learnings,
  ...textFaults,
  ...learned,
  ...handled,
  ...inboxHints,
  ...SKILLS_BEHIND,
  ...TOOLS_SEEN,
  ...NAMED_TWICE,
  ...exportPack,
  ...SHARES,
  ...deviceRename,
  ...renameList,
  ...doorSwitch,
  ...flowGrammar,
  ...PACKS_REMOVED,
  ...ADDONS,
  ...ADDON_TOOLS,
  ...PUSH_TEST,
  ...HUES,
  ...DECIDER,
  ...actionRun,
  ...SHARING,
  ...SCHEMAS,
  ...SEALED,
  ...VISUALS,
  ...METRICS,
  ...READS,
  ...TODAY,
  ...WIDGETS,
  /* END ROUTES */
];
