/**
 * What each starter use case is called, by its id, and nothing else.
 *
 * APART FROM THE USE CASES THEMSELVES, so a line that names one (the feed's "Added the Team board use case") can read
 * the name without loading every declaration they carry. `names.test.ts` holds each name to its use case's `title`.
 */
export const USE_CASE_NAMES: Readonly<Record<string, string>> = {
  student: 'Student',
  founder: 'Solo founder',
  team: 'Team board',
  guide: 'New project guide',
  personal: 'Personal',
  business: 'Small business',
};

/** A use case's name by its id, or its id in words for one this build does not ship. */
export const useCaseName = (id: string): string =>
  USE_CASE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');

/**
 * WHAT EACH FIRST-PARTY MODULE IS CALLED, by its pack id. Decide said "Money core" for `money-core`, from the id in words,
 * where every other screen says Money. `names.test.ts` holds this to the modules the use cases name.
 */
export const MODULE_NAMES: Readonly<Record<string, string>> = {
  portfolio: 'Portfolio',
  people: 'People',
  'money-core': 'Money',
  estate: 'Services',
  work: 'Work',
  agents: 'Agents',
};

/** A pack by the name a person knows it by: a module's name, a use case's pack by the use case, else its id in words. */
export const moduleName = (id: string): string => {
  const usecase = /^usecase-(.+)$/u.exec(id)?.[1];
  if (usecase !== undefined) return useCaseName(usecase);
  return MODULE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');
};

/**
 * WHAT EACH FIRST-PARTY RULE IS CALLED, by its id. A rule declares no name, and a plan drew Money's as `invoice-late`.
 * `names.test.ts` holds this to the rules the seed declares.
 */
export const RULE_NAMES: Readonly<Record<string, string>> = {
  'invoice-late': 'Chase late payments',
  'cash-stale': 'Keep balances current',
  'project-past-aim': 'Ask about a missed day',
  'txn-categorise': 'Categorise what cleared',
  'installment-due-soon': 'Say when a part falls due',
  'recurring-missed': 'Catch a repeat that did not happen',
};

/** A rule by its name, from its id with or without `rule.` in front, or `null` for one this build does not ship. */
export const ruleName = (id: string): string | null => RULE_NAMES[id.replace(/^rule[.:]/u, '')] ?? null;
