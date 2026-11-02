/**
 * The route rows for the record's automation methods (`packages/record/src/methods/automations.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, for the reason `routes/agents.ts` gives: `router-groups` holds
 * each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same name to its group's
 * guard. `automations` itself is not here: it was routed before this file and is widened in place.
 *
 * `checkAutomation` AND `tryAutomation` ARE POSTS, as `previewPage` is, though neither writes anything the record keeps:
 * a rule body is no query string, and a try runs the steps inside a rehearsal that rolls them back. `checkAutomation` and
 * `automationSentence` keep and run nothing at all, so each is marked a read sent as a POST (`postRead`), as
 * `previewPage` is: opening an automation checks its body, and a reader seeing as somebody, or the live look, was refused
 * that as a write ("checkAutomation" blocked three times on `automations-id`). A try still
 * writes inside its rehearsal, and stays a write. `setAutomation` and
 * `retryRun` are an owner's in a browser, as `automationRun` is, because each starts or stops what a rule does.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'checkAutomation', group: 'READ+', writes: true, postRead: true, what: 'Whether an automation body would install, with the refusal and where it is in the body when it would not. It installs nothing.' },
  { name: 'tryAutomation', group: 'READ+', writes: true, what: 'Take an automation body\'s steps now over a sample row, arrival or figure, and say what each did or would do. Everything it wrote is rolled back, and nothing is sent.' },
  { name: 'automationSentence', group: 'READ+', writes: true, postRead: true, what: 'An automation written as a sentence, turned into the body it means and read back in BrainDog\'s words, with what it would have done over the last 30 days of real rows. It installs and runs nothing.' },
  { name: 'todayReminders', group: 'READ+', writes: false, what: 'The reminder lines automations have put on Today in the last two days, newest first, held to the lists the caller reads.' },
  { name: 'automationVersions', group: 'READ+', writes: false, what: 'One automation\'s versions, newest first, each with its body, when it was installed and by whom.',
    takes: { rule: 'text' } },
  { name: 'setAutomation', group: 'ADMIN', writes: true, what: 'Switch one automation on or off, as a new version landed at once. In the app, or by your agents while they act without asking.' },
  { name: 'retryRun', group: 'ADMIN', writes: true, what: 'Start a finished run again, under the automation as installed now, with the same trigger. In the app, or by your agents while they act without asking.' },
];
