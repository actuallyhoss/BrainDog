/**
 * The words of Decide and the inbox: a question and its options, deferring, the reason a decision keeps, a
 * proposal and everything accepting it would change, and filing what came in.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen outside Decide
 * and the inbox also draws is in `shell.ts`.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { list } from './english.ts';

/**
 * `updatesTo` IS ONE LINE IN TWO POSITIONS, and `decide/[id]/arranged.ts` already knows it: the lead
 * of a single-pack proposal at `:316` and a line in the Packs section at `:284`, with `saidByLead`
 * there to stop the same sentence appearing twice on the one screen. A guard that exists because two
 * strings are equal should not depend on somebody keeping them equal.
 *
 * So it is typed once and named twice, for the reason `shell.ts` gives over `notReached`: two keys
 * over one string is how a sentence drifts into two.
 */
const updatesTo = (name: string, from: string, to: string): string => `Updates ${name} from ${from} to ${to}`;

export const decide = {
  /* Deferring. A defer without a date is a dismissal wearing a nicer word, so both fields are
     required and the button says what will exist afterwards. */
  deferTitle: 'Why not yet, and when',
  deferHint: 'What has to happen first',
  deferAction: 'Park it',
  wakeOn: 'Wake me on',

  /* Answering a question where it is drawn. The options used to be a printed span inside the card's
     own link, so the thing that looked like the answer was decoration and answering meant a second
     screen and a paragraph of prose. */
  answeredOption: (option: string) => `Answered: ${option}`,
  takeItBack: 'Take it back',
  /* The visible words start the accessible name rather than being a different sentence, so "take it
     back" said out loud reaches the control a person is looking at (WCAG 2.5.3). */
  takeItBackOf: (title: string) => `Take it back: ${title}`,
  whyForLater: 'Why, for whoever reads this in six weeks',
  reasonThinNudge: 'That will not mean much in six weeks. It is kept either way.',
  rankedBy: 'Ranked by the cost of being wrong',
  costOfDelay: 'Cost of deciding late',
  theOptions: 'The options',
  recommended: 'Suggested',
  /* WHY THE COMMIT IS REFUSING, said where the refusal is. A decision is immutable once made, so the
     reason is the whole of what anybody reading it in six weeks will have. */
  reasonRequired: 'A decision is kept for ever and cannot be edited, so it needs a reason. Write why you chose it.',
  reasonHint: 'Why this one, in a sentence somebody can read in six weeks.',
  commit: 'Record the decision',
  decidedBy: 'Decided by',
  immutable: 'A decision cannot be edited once it is made.',
  noQuestions: 'Nothing waits on you',
  lastDecided: 'The last one was decided',
  /* THE QUESTION IS NOT SAID. Its callers used to pass the question's id, `SG2`, and an id is never a word a person
     reads; the toast stands over the question it answers, so the option alone is the whole sentence. */
  decisionRecorded: (option: string) => `${option} is recorded as the decision.`,
  parkedUntil: (on: string) => `Parked until ${on}.`,
  changedSince: 'Something this would change has changed since it was proposed. Nothing was written.',
  /* THE BUTTON SAYS WHERE IT GOES, and it said `File it in a list`. The picker beside it names the place, so the
     button is the verb alone; `fileItIn` is the same press with the place said in it, for a button that stands alone. */
  fileIt: 'File it',
  fileItIn: (into: string) => `File it in ${into}`,
  /* `Archive this` AND IT WAS `Archive the arrival`. An `arrival` is what the record calls a thing
     that came in through an ingest, and the inbox is the one screen where the reader is looking at
     an email. Naming it after the mechanism that carried it is naming it after the plumbing. */
  archiveArrival: 'Archive this',
  inboxConnect: 'Set up a connector',
  inboxClear: 'Nothing waits in the inbox',
  inboxClearWhy: 'Anything that comes in without a rule to file it waits here.',
  /* THE AIM FOR THE DECIDE QUEUE, SAID WITH WHAT IT COUNTS. `/decide` printed the metric's note by itself at the end
     of its heading row: a fragment with no subject, beside a count of 4 it was failing. The target is said as every
     target is (`targetLine`, "Limit 3"), and this names what the limit is on. The tone and its glyph come from the
     metric. */
  aimFor: (target: string) => `${target} open at once`,
  /* Inbox and page-row writes (lane D) */
  inboxFileInto: 'File it in',
  /* BY THE LIST'S NAME, NEVER THE RECORD'S HANDLE: "Filed as tasks#12" put an id in front of a person. A handle, a
     list's id (`tasks`, `time-log`, `my_list`) or a ULID handed in is said as nothing at all. */
  inboxFiled: (list: string) =>
    list.trim() === '' || /#|^[a-z][a-z0-9_-]*$|^[0-9A-HJKMNP-TV-Z]{26}$/u.test(list.trim()) ? 'Filed. It has left the inbox.' : `Filed in ${list.trim()}. It has left the inbox.`,
  inboxArchived: 'Archived. It is kept, and it has left the inbox.',
  inboxNoLists: 'There is nowhere to file this yet.',
  /* Decide and page writes (lane B) */
  decideConflict: 'Something this would change has changed since it was proposed. Nothing was written, and the question has been read again.',
  /* DECIDE AND THE INBOX AS QUEUES: the cursor, a selection, and what a
     proposal would put on the screen. No sentence here assumes what kind of record it is. */
  proposalWillAppear: 'What will appear',
  proposalInSidebar: 'In the sidebar',
  proposalUnder: (section: string) => `Under ${section}`,
  proposalNotInSidebar: 'Not in the sidebar, reached by its link',
  proposalShows: 'Shows',
  proposalReads: 'Reads from',
  proposalFields: 'What it holds',
  proposalComesFrom: 'Comes from',
  proposalEvery: 'How often',
  proposalFilesInto: 'Files into',
  proposalAccent: 'Accent',
  proposalScheme: 'Scheme',
  proposalSamples: (n: number) => `Drawn from ${n} ${n === 1 ? 'thing' : 'things'} that came in`,
  /* AN AUTOMATION AND A SCRIPT, drawn as what they would do: Decide said "Rule" and an id and nothing else, so the owner
     accepted a flow without reading its trigger or a step. What starts it and each step are the canvas's own sentences
     (`flow.ts` `sayTrigger`, `sayStep`); these are only the words around them. */
  proposalHowItRuns: 'How it runs',
  /** Where a step sits: `Step 2`, and inside a branch `Step 2, if so 1` or `Step 2, if not 1`, in the canvas's arm words. */
  proposalStep: (at: readonly string[]) => `Step ${at.join(', ')}`,
  proposalArmStep: (arm: string, n: number) => `${arm.toLowerCase()} ${n}`,
  /* A `script` STEP RUNS SINCE `e6010208` (`flow.ts` `startScript` queues the script and the run goes on), and Decide
     went on ending it with a "not in this build" line where the dry run had stopped. These are the dry run's facts in the
     owner's order, all four ways `startScript` stops a run included. What `as:` keeps, the id of the queued run, is
     said by the canvas's sentence before it. */
  proposalScriptGoesOn:
    'The run goes on without waiting for it: what the script writes lands when this host runs it. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused, or if its input hands on what a secret or file field holds.',
  proposalCallsOut: 'Calls out',
  proposalCallsNothing: 'Nothing outside this record',
  proposalMaySend: 'May send',
  proposalSource: (name: string) => `The source of ${name}`,
  decideRows: (n: number, list: string) => `Changes ${n === 1 ? 'one item' : `${n} items`} in ${list}`,
  decideGroup: 'Group',
  decideGroupNone: 'Ranked',
  decideGroupList: 'By what it is about',
  decideGroupElse: 'Everything else',
  decideSelected: (n: number) => `${n} selected`,
  decideAnswerSuggested: (n: number) => `Answer ${n} with what is suggested`,
  decideNoneSuggested: 'None of these has a suggested answer. Answer each one.',
  decideBatchReason: 'One reason for all of them',
  decideBatchDone: (n: number) => `${n} answered.`,
  clearSelection: 'Clear the selection',
  decideDecided: (option: string) => `Decided: ${option}`,
  decideToSend: 'sends it',
  decideToLeave: 'goes back',
  decideNext: 'Next question',
  decideOpenInbox: 'Open the inbox',
  inboxOpenDecide: 'Open Decide',
  inboxSelected: (n: number) => `${n} selected`,
  inboxFileSelected: (n: number) => `File ${n}`,
  inboxArchiveSelected: (n: number) => `Archive ${n}`,
  inboxBatchFiled: (n: number) => `${n} filed. They have left the inbox.`,
  inboxBatchArchived: (n: number) => `${n} archived. They are kept, and they have left the inbox.`,
  /* A PROPOSAL THAT ARRANGES THIS BRAINDOG: a pack, its settings, or several at once. Why, what it
     calls out, the packs, what appears, the words that change, the rest; then what was applied, or how far it got. */
  arrangeLeadUseCase: (name: string) => `Sets this BrainDog up for ${name}`,
  arrangeLeadArrange: 'Rearranges this BrainDog',
  arrangeLeadInstall: (name: string) => `Adds ${name}`,
  /** A pack on at an older version, updated to the one on offer. The lead's position; see `updatesTo`. */
  arrangeLeadUpdate: updatesTo,
  arrangeLeadEnable: (name: string) => `Turns ${name} back on`,
  arrangeLeadDisable: (name: string) => `Turns ${name} off`,
  arrangeLeadSettings: (name: string) => `Changes the words and settings of ${name}`,
  arrangeWhy: 'Why',
  arrangeCalls: 'Calls out once you accept',
  arrangeCallsNote: 'Accepting approves these. Each one reaches a service outside this record, and counts toward what it calls out.',
  arrangeCallKey: (label: string) => `with the key “${label}”`,
  arrangeCallNoKey: 'with no key',
  arrangeCallNoHost: 'A service it does not name',
  arrangeCallSends: (fields: string) => `sends ${fields}`,
  /** A pack's cadence (`every 1h`) in words: "every hour", "every 3 hours". */
  arrangeCallEvery: (n: number, unit: 'm' | 'h' | 'd' | 'w') => {
    const word = { m: 'minute', h: 'hour', d: 'day', w: 'week' }[unit];
    return n === 1 ? `every ${word}` : `every ${n.toLocaleString('en')} ${word}s`;
  },
  arrangePacks: 'Add-ons',
  arrangeInstalls: (names: readonly string[]) => `Installs ${names.join(', then ')}`,
  /** The same line inside the Packs section, which is why `arranged.ts` guards against printing both. */
  arrangeUpdates: updatesTo,
  /** Use cases an arrangement installs beside the one the record speaks in, which keeps its voice. */
  arrangeBeside: (names: string[]) => `Adds ${list(names)} beside it, in the same voice`,
  /** A use case a pack proposal adds while another speaks: that one keeps speaking. */
  arrangeKeepsVoice: (name: string) => `${name} keeps its voice and Home`,
  arrangeTurnsOn: (names: readonly string[]) => `Turns on ${list([...names])}`,
  arrangeTurnsOff: (names: readonly string[]) => `Turns off ${list([...names])}`,
  arrangeListsLeave: (lists: readonly string[]) => `${list([...lists])} ${lists.length === 1 ? 'leaves' : 'leave'} the sidebar. What is in ${lists.length === 1 ? 'it' : 'them'} is kept.`,
  arrangeListsReturn: (lists: readonly string[]) => `${list([...lists])} ${lists.length === 1 ? 'comes' : 'come'} back to the sidebar.`,
  arrangeNew: (kind: string) => `New ${kind.toLowerCase()}`,
  arrangeChanged: (kind: string) => `Changed ${kind.toLowerCase()}`,
  arrangeAlso: 'Also adds',
  /** What an arrangement changes that is already here, apart from what it adds. */
  arrangeChanges: 'Changes',
  arrangeRetires: 'Takes away',
  arrangeRetiredRows: (name: string, rows: number) => `${name}, whose ${rows} ${rows === 1 ? 'item stays' : 'items stay'}`,
  /* WHAT AN UPDATE LEAVES AS THE OWNER CHANGED IT, said because the update does not rewrite it: an edit that carried the
     older version's window keeps that window. */
  arrangeKept: 'Kept',
  arrangeKeeps: (name: string) => `Keeps ${name} as you changed it. This update's version of it is not taken.`,
  arrangeKeepsPage: (name: string) => `Keeps your ${name} page as you arranged it. This update's version of it is not taken.`,
  /* A CHOICE AN UPDATE TAKES OFF A LIST WHOSE ROWS HOLD IT, which stays: said beside what it keeps, because the list the
     owner sees after accepting still offers it. `holding` is how many of the list's `rows` hold it, and both are said:
     the list's count alone read "it holds 3 rows that may use it" on a record where none of the three did (audit
     forty-eight, §4). `null` is a record that could not count holders, which keeps the choice for the list's rows and
     says so in those words.
     `binned` IS HOW MANY DELETED ROWS HOLD IT, said apart, since `rows` is the live count and a deleted row is in none
     of it: with the bin left out of the sentence, a People whose one registrar row was deleted read "because all 0 of
     its rows hold it". A deleted row is a reason of its own, because the choice going would make its restore refused. */
  arrangeStays: (name: string, field: string, values: readonly string[], rows: number, holding: number | null = null, binned = 0) => {
    const it = values.length === 1 ? 'it' : 'one of them';
    const deleted = binned === 1 ? 'a deleted item holds' : `${binned} deleted items hold`;
    const why =
      holding === null
        ? `it holds ${rows} ${rows === 1 ? 'item' : 'items'} that may use ${values.length === 1 ? 'it' : 'them'}`
        : holding === 0 && binned > 0
          ? `${deleted} ${it}, and ${binned === 1 ? 'that item' : 'those items'} could not be restored without ${values.length === 1 ? 'it' : 'them'}`
          : `${
              holding >= rows
                ? rows === 1
                  ? `its one item holds ${it}`
                  : `all ${rows} of its items hold ${it}`
                : `${holding} of its ${rows} items ${holding === 1 ? 'holds' : 'hold'} ${it}`
            }${binned === 0 ? '' : `, and ${binned === 1 ? '1 deleted item does' : `${binned} deleted items do`} too`}`;
    return `${name} keeps ${values.length === 1 ? `the choice ${values[0]}` : `${values.length} choices, ${list([...values])},`} for ${field}, which this update takes off, because ${why}.`;
  },
  /* WHAT A PACK LAYS ON A LIST ANOTHER PACK OWNS: Personal's roles on People. Named apart from what it adds, because the
     list is not new, and counted, because the owner is asked to take every one of them. */
  arrangeExtended: 'Adds to a list',
  arrangeExtendsFields: (pack: string, name: string, fields: readonly string[]) =>
    `${pack} adds ${fields.length} ${fields.length === 1 ? 'field' : 'fields'} to ${name}: ${list([...fields])}`,
  /* THE CHOICES SECOND, so `access.test.ts` can render it with the argument shapes it tries; last, no shape reached it. */
  arrangeExtendsValues: (pack: string, values: readonly string[], field: string, name: string) =>
    `${pack} adds ${values.length} ${values.length === 1 ? 'choice' : 'choices'} to ${field} in ${name}: ${list([...values])}`,
  arrangeMany: (kind: string): string =>
    ({ page: 'Pages', register: 'Lists', ingest: 'Rules for what comes in', theme: 'Looks', metric: 'Measures', digest: 'Summaries', rule: 'Rules', block: 'Page parts' })[kind] ??
    kind.charAt(0).toUpperCase() + kind.slice(1),
  arrangeShowsNow: 'Shows now',
  arrangeWillShow: 'Will show',
  arrangeExamples: (n: number) => `With ${n} ${n === 1 ? 'example' : 'examples'} to start from`,
  /** The rows a plan adds, list by list, each under the row it belongs with when it names one. */
  arrangeRows: 'Adds these',
  arrangeRowUnder: (row: string, under: string) => `${row}, for “${under}”`,
  arrangeRowsNote: 'Nothing is added until you accept. Each one can be changed or deleted afterwards like any other.',
  arrangeCountRows: (n: number) => `${n} new ${n === 1 ? 'item' : 'items'}`,
  arrangeDidRows: (n: number) => `Added ${n} ${n === 1 ? 'item' : 'items'}`,
  arrangeWords: 'Words',
  arrangeCalled: (now: string, next: string) => `${now} will be called “${next}”`,
  arrangeReads: (now: string, next: string) => `“${now}” will read “${next}”`,
  arrangeBackToHouse: (now: string, house: string) => `“${now}” goes back to “${house}”`,
  arrangeListCalled: (list: string, next: string) => `The list ${list} will be called “${next}”`,
  arrangeFieldCalled: (list: string, field: string, next: string) => `In ${list}, ${field} will be called “${next}”`,
  arrangeValueCalled: (list: string, value: string, next: string) => `In ${list}, “${value}” will be called “${next}”`,
  arrangeDefault: 'its usual word',
  /** A long label filed before its title was, so only its hashed setting name is known. */
  arrangeLongLabel: 'A label',
  arrangeSettings: 'Settings',
  arrangeSettingTo: (pack: string, setting: string, value: string, was: string | null) =>
    was === null ? `${pack}: ${setting} will be ${value}` : `${pack}: ${setting} will be ${value}, where it is ${was} now`,
  arrangeCountPages: (n: number) => `${n} new ${n === 1 ? 'page' : 'pages'}`,
  arrangeCountLists: (n: number) => `${n} new ${n === 1 ? 'list' : 'lists'}`,
  arrangeCountOther: (n: number) => `${n} more ${n === 1 ? 'change' : 'changes'}`,
  arrangeCountWords: (n: number) => `${n} ${n === 1 ? 'word changes' : 'words change'}`,
  arrangeLeadSummary: (lead: string, summary: string) => `${lead}: ${summary}`,
  arrangeCountSettings: (n: number) => `${n} ${n === 1 ? 'setting' : 'settings'}`,
  arrangeApplied: 'What was applied',
  arrangeDidInstall: (names: readonly string[]) => `Installed ${list([...names])}`,
  arrangeDidUpdate: (name: string, from: string, to: string) => `Updated ${name} from ${from} to ${to}`,
  arrangeDidEnable: (names: readonly string[]) => `Turned on ${list([...names])}`,
  arrangeDidDisable: (names: readonly string[]) => `Turned off ${list([...names])}`,
  arrangeDidPages: (names: readonly string[]) => `Put in place ${names.length === 1 ? 'the page' : 'the pages'} ${list([...names])}`,
  arrangeDidSettings: (names: readonly string[]) => `Changed the words and settings of ${list([...names])}`,
  arrangeDidSidebar: (names: readonly string[]) => `New in the sidebar: ${names.join(', ')}`,
  arrangeDidNothing: 'Everything it asked for was already in place.',
  arrangePartial: 'Only part of this was applied',
  arrangePartialDone: 'Done, and kept',
  arrangePartialLeft: 'Not done',
  arrangePartialWhy: 'What stopped it',
  arrangePartialOpen: 'The question is open again. Accept it once what stopped it is put right, or reject it.',
  arrangeNotApplied: 'None of it was applied, and the question is still open.',
  arrangePageNamed: (name: string) => `the page ${name}`,
  arrangeSettingsOf: (name: string) => `the words and settings of ${name}`,
  arrangeNotInBatch: 'A proposal that arranges this BrainDog is answered on its own, so it is not in this answer.',
  decideSelect: 'Select',
  decideSelectDone: 'Done',
} as const;
