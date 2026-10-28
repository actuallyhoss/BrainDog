/**
 * Money's settings: the home currency, the rest days, and the targets a person changes later. Cut out of `money.ts` with no change.
 */

/**
 * The Money setting a record adds every currency up in. Read each time a figure is, so a change holds at once.
 *
 * AND IT DELIBERATELY HAS NO DEFAULT, WHICH A DEFAULT OF `GBP` WAS TRIED AGAINST AND MEASURED.
 * `test/money-settings.test.ts` holds a record with one account in Egyptian pounds and one in dollars
 * and asserts that Cash now reads `null` until somebody chooses; with sterling defaulted in, the same
 * record answered a sterling figure. That is the whole argument: an unanswered question must read as
 * unanswered, because a figure converted at a rate nobody asked for looks exactly like a figure a
 * person chose, and this one is the number the owner decides against. Sterling being the pack's own
 * spelling of money, the shipped sample's currency and the app installer's chosen value does not
 * make it this record's answer.
 */
export const MONEY_HOME_SETTING = {
  home_currency: { type: 'text', label: 'Home currency', note: 'The currency money in other currencies is added up in, when there is a rate for it. Held to this as soon as it is saved.' },
  /* THE DAYS NO MONEY MOVES ON, SINCE money-core 3.16.0. A repeating line set to move off them goes to the
     working day before or after (`recurring.weekend`); a line left to keep its day keeps it, which is every line until
     a person says otherwise. SATURDAY AND SUNDAY TO START, AND A RECORD'S OWN AFTER THAT: in Cairo the weekend is Friday
     and Saturday. Day names, one a line, because that is what a person types on the settings screen; the walk reads
     names or weekday numbers by this setting's name (`restDaysOf` in `packages/kernel/src/forecast.ts`), so no leg
     has to name it. */
  rest_days: {
    type: 'list',
    max: 7,
    default: ['Saturday', 'Sunday'],
    label: 'Rest days',
    note: 'The days no money moves on, one a line, such as Friday. A repeating payment set to move goes to the working day before or after.',
  },
} as const;

/**
 * THE TARGETS A PERSON CHANGES LATER, AS SETTINGS OF MONEY. A figure's target was fixed the day Money went in, so somebody
 * whose rent went up could not move "no more than" without reinstalling. Each of these is a setting of the pack, a sum of
 * money or a number of days, and the figure names it (`target.setting`): the record reads the setting each time the figure
 * is read, so a change holds the figure to it at once.
 *
 * A MONEY CEILING STARTS EMPTY, SINCE money-core 3.0.0, and empty is no target: the figure has no verdict until a person
 * types a sum. The sums that were here, GBP 50,000.00 owed in thirty days among them, were one studio's sizes in one
 * currency, and a pack cannot know either the size or the currency of the record it lands on. The sum a person types is held in the record's home currency (`liveTarget` in `packages/kernel/src/declare.ts`).
 * A number of days is no currency's, so its default stays the figure's own.
 */
export const MONEY_TARGET_SETTINGS: Readonly<Record<string, { setting: string; type: 'money' | 'number'; label: string }>> = {
  /* `most_out_30d` IS THE KEY AND THE WORDS ARE ONLY WORDS, so this label follows its figure: a saved ceiling is kept
     under the key whatever the label says (`test/money.test.ts`), and the ceiling caps what is OWED inside the thirty
     days rather than everything that leaves, which is `leaving-30d`'s. */
  'out-30d': { setting: 'most_out_30d', type: 'money', label: 'Most payables due in 30 days' },
  'leaving-30d': { setting: 'most_leaving_30d', type: 'money', label: 'Most going out in 30 days' },
  'every-month-out': { setting: 'most_out_every_month', type: 'money', label: 'Most going out every month' },
  'every-month-by-category': { setting: 'most_on_one_category', type: 'money', label: 'Most a month on one category' },
  'spent-by-category-month': { setting: 'most_spent_on_one_category', type: 'money', label: 'Most spent on one category in a month' },
  'spent-30d': { setting: 'most_spent_30d', type: 'money', label: 'Most spent in 30 days' },
  'due-30d': { setting: 'most_due_30d', type: 'money', label: 'Most due in 30 days' },
  'owed-to-you': { setting: 'most_owed_to_you', type: 'money', label: 'Most receivables at once' },
  'owed-by-you': { setting: 'most_owed_by_you', type: 'money', label: 'Most payables at once' },
  'installments-left': { setting: 'most_left_in_parts', type: 'money', label: 'Most left to pay in parts' },
  'installments-due-30d': { setting: 'most_parts_due_30d', type: 'money', label: 'Most in parts due in 30 days' },
  'days-late-in': { setting: 'most_days_late', type: 'number', label: 'Most days money in may be late' },
};

/** What a target setting says under its box on the settings screen. */
export const TARGET_NOTE = 'Held to this as soon as it is saved.';

export type Decl = Record<string, unknown>;
const boundOf = (target: Decl): number | null => (typeof target.lte === 'number' ? target.lte : typeof target.gte === 'number' ? target.gte : null);

/**
 * A figure whose target is one of Money's settings, naming it; any other declaration as it was.
 *
 * A MONEY TARGET NEEDS NO NUMBER TO NAME ITS SETTING, because it has none until a person types one. A number of days
 * does: it is the default the setting starts at.
 */
export function withTargetSetting(d: Decl): Decl {
  const said = typeof d.metric === 'string' ? MONEY_TARGET_SETTINGS[d.metric] : undefined;
  const target = d.target as Decl | undefined;
  if (!said || !target || (said.type === 'number' && boundOf(target) === null)) return d;
  return { ...d, target: { ...target, setting: said.setting } };
}

/**
 * The settings a set of declarations' targets are held to. A number of days starts at the target it replaces; a sum of
 * money starts empty, which the record reads as no target, since a sum is in a currency and the pack knows none.
 */
export function targetConfigOf(declarations: readonly Decl[]): Record<string, Decl> {
  const config: Record<string, Decl> = {};
  for (const d of declarations) {
    const target = d.target as Decl | undefined;
    const said = typeof d.metric === 'string' ? MONEY_TARGET_SETTINGS[d.metric] : undefined;
    if (!said || !target || target.setting !== said.setting) continue;
    const bound = boundOf(target);
    config[said.setting] = { type: said.type, label: said.label, note: TARGET_NOTE, ...(said.type === 'number' && bound !== null ? { default: bound } : {}) };
  }
  return config;
}
