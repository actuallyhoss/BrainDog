/**
 * The words of a project's key numbers: the sheet that adds one or changes one (`lib/kpis/KpiSheet.svelte`), what it
 * says when something typed will not do, and the toasts its writes leave.
 *
 * AN AREA FILE OF THE COPY AGGREGATE, read directly by the sheet until the wiring spreads it into `copy` (one import and
 * one spread line in `lib/copy.ts`, the integrator's). Plain Node loads it, so it imports nothing.
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
} as const;
