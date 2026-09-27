/**
 * The route rows for the record's automation methods (`packages/record/src/methods/automations.ts`,
 * `loop/finish/contracts.md` §2.2 and §3.1).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, for the reason `routes/agents.ts` gives: `router-groups` holds
 * each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same name to its group's
 * guard. `automations` itself is not here: it was routed before this file and is widened in place (X10).
 *
 * `checkAutomation` AND `tryAutomation` ARE POSTS, as `previewPage` is, though neither writes anything the record keeps:
 * a rule body is no query string, and a try runs the steps inside a rehearsal that rolls them back. `setAutomation` and
 * `retryRun` are an owner's in a browser, as `automationRun` is, because each starts or stops what a rule does.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'checkAutomation', group: 'READ+', writes: true, what: 'Whether an automation body would install, with the refusal and where it is in the body when it would not. It installs nothing.' },
  { name: 'tryAutomation', group: 'READ+', writes: true, what: 'Take an automation body\'s steps now over a sample row, arrival or figure, and say what each did or would do. Everything it wrote is rolled back, and nothing is sent.' },
  { name: 'automationVersions', group: 'READ+', writes: false, what: 'One automation\'s versions, newest first, each with its body, when it was installed and by whom.',
    takes: { rule: 'text' } },
  { name: 'setAutomation', group: 'ADMIN', writes: true, what: 'Switch one automation on or off, as a new version landed at once. A browser session only.' },
  { name: 'retryRun', group: 'ADMIN', writes: true, what: 'Start a finished run again, under the automation as installed now, with the same trigger. A browser session only.' },
];
