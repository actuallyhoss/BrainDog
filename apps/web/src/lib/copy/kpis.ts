/**
 * The words of a project's key numbers: the sheet that adds one or changes one (`lib/kpis/KpiSheet.svelte`), what it
 * says when something typed will not do, the toasts its writes leave, the block's own foot and its suggested numbers
 * (`lib/kpis/KpisBlock.svelte`), and the rows of a number's menu (`lib/page/block-menu.ts`).
 *
 * AN AREA FILE OF THE COPY AGGREGATE, spread into `copy` by `lib/copy.ts`, so every use is written `copy.<key>`.
 * Plain Node loads it, so it imports nothing.
 *
 * PLAIN WORDS FOR A PHONE. A key number is "a number", where it comes from is said as a person says it ("I type it"),
 * and nothing here names the list, a field id or an enum spelling.
 */

export const kpis = {
  /* THE SHEET'S TITLE: adding one, and changing one by its name. The line under it names the project. */
  kpiNewTitle: 'Add a key number',
  kpiEditTitle: (name: string): string => (name ? `Change ${name}` : 'Change this number'),
  kpiOn: (project: string): string => `On ${project}`,
  kpiOnDraft: (project: string): string => `Suggested for ${project}, not kept yet`,

  kpiName: 'Name',
  kpiNamePlaceholder: 'Monthly recurring revenue',

  /* WHERE THE NUMBER COMES FROM, as four plain choices, each with one line of what it means. The fifth is drawn only for
     a number that already reads what Numbers holds under its name. */
  kpiSource: 'Where does the number come from?',
  kpiSourceTyped: 'I type it',
  kpiSourceTypedLine: 'You add a value here when it changes.',
  kpiSourceAgent: 'An agent reports it',
  kpiSourceAgentLine: (project: string): string => `An agent working on ${project} writes it in.`,
  kpiSourceFeed: 'It fills itself from a feed',
  kpiSourceFeedLine: 'A feed reads it from a web address on a schedule.',
  kpiSourceFigure: 'Worked out from my lists',
  kpiSourceFigureLine: 'BrainDog works it out from the tasks and money on this project.',
  kpiSourceNumbers: 'Already in Numbers',
  kpiSourceNumbersLine: 'Values saved in Numbers under its name.',

  /* THE FIGURE A "WORKED OUT" NUMBER IS, by what it says and never by its id. */
  kpiFigure: 'Worked out as',
  kpiFigurePick: 'Pick one',
  kpiFigureInMonth: 'Money in this month',
  kpiFigureInByMonth: 'Money in, by month',
  kpiFigureKeptMonth: 'Kept this month',
  kpiFigureOwed: 'Still to come in',
  kpiFigureCost: 'Costs a year',
  kpiFigureOpen: 'Open tasks',
  kpiFigureDone: 'Done this week',
  kpiFigureQuiet: 'Days since last worked on',

  /* WHAT GOOD LOOKS LIKE: a figure, what it counts in, and the day it should be reached. */
  kpiTarget: 'Target',
  kpiTargetPlaceholder: '10,000',
  kpiUnit: 'Unit',
  kpiUnitPlaceholder: 'USD or %',
  kpiBy: 'By when',

  kpiMore: 'More',
  kpiFewer: 'Fewer',

  kpiMeasures: 'What it measures',
  kpiMeasuresPlaceholder: 'Paying customers each month, after refunds',
  kpiMeasure: 'Name in Numbers',
  kpiMeasureHelp: 'Values saved in Numbers under this name count toward it.',

  kpiGood: 'Which way is good',
  kpiGoodUp: 'Up',
  kpiGoodDown: 'Down',

  kpiEvery: 'How often a new value comes',
  kpiEveryHour: 'Hourly',
  kpiEveryDay: 'Daily',
  kpiEveryWeek: 'Weekly',
  kpiEveryMonth: 'Monthly',
  kpiEveryHelp: 'It is said to be late after two of these go by with nothing new.',

  kpiOwner: 'Who keeps it',
  kpiOwnerPlaceholder: 'You, an agent or a feed',

  kpiToday: 'Show on Today',
  kpiTodayAuto: 'Auto',
  kpiTodayPinned: 'Always',
  kpiTodayHidden: 'Never',
  kpiTodayAutoLine: 'Shown when it needs a look: off target, late or moving fast.',
  kpiTodayPinnedLine: 'Always on Today, before the rest.',
  kpiTodayHiddenLine: 'Never on Today. It stays on the project.',

  kpiHeadline: 'Lead the card with it',
  kpiHeadlineLine: (project: string): string => `${project}'s card and page show this number first.`,

  /* THE FOOT. A suggested number is kept by saving it, so its button says so. */
  kpiAdd: 'Add it',
  kpiSave: 'Save',
  kpiKeep: 'Keep it',
  kpiCancel: 'Cancel',
  kpiStop: 'Stop tracking it',
  kpiStopLine: 'Its values stay. It leaves the project and Today.',

  /* THE TOASTS, naming the number in quotes, never an id. */
  kpiAdded: (name: string, project: string): string => `Added “${name}” to ${project}.`,
  kpiSaved: (name: string): string => `Saved “${name}”.`,
  kpiStopped: (name: string): string => `Stopped tracking “${name}”.`,
  kpiUndone: 'Put back as it was',

  /* WHAT WILL NOT DO, said before anything is sent. */
  kpiNoName: 'Give it a name.',
  kpiLongName: 'Keep the name under 80 letters.',
  kpiNoFigure: 'Pick what it is worked out as.',
  kpiNotDigits: (typed: string): string => `“${typed}” is not a number. Use digits, like 1,200.`,
  kpiShareOver: 'A share is out of 100.',
  kpiLongUnit: 'Keep the unit short, like USD, players or %.',
  kpiBadDay: 'Pick a day.',
  kpiDayNoTarget: 'Say the target too, or clear the day.',

  /* THE BLOCK ON A PROJECT'S PAGE: its foot, and what it says with nothing kept yet. */
  kpiAddNumber: 'Add a number',
  kpiNoneYet: 'No key numbers yet.',
  kpiNotRead: 'The key numbers could not be read just now.',
  kpiLeads: 'Shown first',
  /* UNDER TODAY'S NUMBERS, the door to every number kept. */
  kpiAllNumbers: 'All numbers',

  /* WHAT BRAINDOG OR AN AGENT SUGGESTED, on the project's page only, each kept or turned down with one press. */
  kpiSuggested: 'Suggested',
  kpiKeepOne: 'Keep',
  kpiNotThis: 'Not this',
  kpiKept: (name: string): string => `Kept “${name}”.`,
  kpiTurnedDown: (name: string): string => `Turned down “${name}”.`,

  /* A NUMBER'S OWN MENU, one press each, with a line over Undo. */
  kpiMenu: (name: string): string => `More for ${name}`,
  kpiMenuPin: 'Pin to Today',
  kpiMenuHide: 'Hide from Today',
  kpiMenuAuto: 'Unpin from Today',
  kpiMenuLetChoose: 'Let Today choose',
  kpiMenuOpen: 'Open',
  kpiMenuChoose: 'Choose what shows on Today',
  kpiChooseHint: 'Four at most, and the first two on a phone. With room left, Today picks by what needs a look.',
  kpiChooseShown: 'Showing on Today',
  kpiChooseNone: 'Nothing chosen. Today picks for you.',
  kpiChooseFull: 'Today shows four at most. Take one out to add another.',
  kpiChooseToday: 'On Today now',
  kpiChooseHidden: 'Hidden',
  kpiChooseSaved: 'Today’s numbers are saved.',
  kpiChooseUp: (name: string): string => `Move ${name} up`,
  kpiChooseDown: (name: string): string => `Move ${name} down`,
  kpiChooseOut: (name: string): string => `Take ${name} off Today`,
  kpiChooseGeneral: 'Not in a project',
  kpiChooseSave: 'Save',
  kpiChooseCancel: 'Cancel',
  kpiMenuLead: 'Lead the card with this',
  kpiPinnedSaid: (name: string): string => `${name} is on Today.`,
  kpiHiddenSaid: (name: string): string => `${name} is off Today.`,
  kpiAutoSaid: (name: string): string => `Today shows ${name} when it needs a look.`,
  kpiLeadSaid: (name: string): string => `${name} leads the card.`,
  kpiUnnamed: 'This number',

  /* A STALE NUMBER'S FIX (`lib/kpis/stale-fix.ts`): ask the agent that keeps it, or add a reading by hand. */
  kpiAskAgent: (agent: string): string => `Ask ${agent} to report it`,
  kpiAddReading: 'Add a reading',
  /* WHAT THE AGENT IS TOLD, in the owner's words: which number, where, and since when. */
  kpiAskSaid: (name: string, project: string | null, since: string | null): string =>
    `Please report ${name}${project ? ` on ${project}` : ''}. ${since ? `The last reading was on ${since}.` : 'It has no reading yet.'}`,
  kpiAsked: (agent: string, name: string): string => `Asked ${agent} to report ${name}.`,
  kpiAskTakenBack: 'Taken back',
  kpiReadingTitle: 'Add a reading',
  kpiReadingValue: 'Value',
  kpiReadingPlaceholder: '1,200',
  kpiReadingEmpty: 'Type the value.',
  kpiReadingNoList: 'There is nowhere to keep readings yet.',
  kpiReadingAdded: (name: string): string => `Added a reading to ${name}.`,

  /* ITS PAST VALUES, under the sheet (`lib/kpis/past.ts`): newest first, who set each, the newest taken back with Undo and
     any other changed or taken out. Each write is put back in its own row, since a toast waits for the sheet to close. */
  kpiPast: 'Past values',
  kpiPastNone: 'No values yet.',
  kpiPastNotRead: 'Its past values could not be read just now.',
  kpiPastBy: (who: string): string => `by ${who}`,
  kpiPastChange: 'Change',
  kpiPastUndo: 'Undo',
  kpiPastRemove: 'Remove',
  kpiPastPutBack: 'Put back',
  kpiPastRemoved: 'Taken out',
  kpiPastChanged: (was: string): string => `Was ${was}`,
  kpiPastValueOn: (day: string): string => `Value on ${day}`,
  kpiPastChangeOn: (day: string): string => `Change the value on ${day}`,
  kpiPastUndoOn: (day: string): string => `Undo the value on ${day}`,
  kpiPastRemoveOn: (day: string): string => `Remove the value on ${day}`,
  kpiPastPutBackOn: (day: string): string => `Put back the value on ${day}`,
} as const;
