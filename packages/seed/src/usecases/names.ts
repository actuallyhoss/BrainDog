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
  shop: 'Shop',
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
  core: 'BrainDog',
  /* PROJECTS, AS EVERY SCREEN CALLS IT: the store and Installed said Portfolio, the id, beside a sidebar saying Projects. */
  portfolio: 'Projects',
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
  /* TAKEN AWAY AT money-core 3.16.0 AND STILL NAMED: a record that has not said yes to the update still holds it, and its
     runs and the question about taking it away name it. */
  'cash-stale': 'Keep balances current',
  'project-past-aim': 'Ask about a missed day',
  'txn-categorise': 'Categorise what cleared',
  'installment-due-soon': 'Say when a part falls due',
  'recurring-missed': 'Catch a repeat that did not happen',
  'recurring-ended': 'End a schedule on its last day',
  'budget-near': 'Say when a budget is nearly spent',
  'budget-over': 'Say when a budget is over',
  /* THE OTHERS THE PRODUCT SHIPS, each the name its declaration gives it, so a screen that could not read the record's
     titles (Activity's fallback, a row's history) still says a sentence and never "Meet payees" or "Entry takes book". */
  'account-closed': "Ask where a closed account's money goes",
  'account-files-book': 'File what an account holds in its book',
  'account-moved': 'Move what a closed account holds',
  'bill-moves-line': 'Ask to move a repeating line on when its bill is paid',
  'bill-takes-book': "File a bill or an invoice in its account's book",
  'card-limit-owes': 'Work out what a card owes once its limit is typed',
  'card-text-owes': 'Work out what a card owes from its text',
  'category-stays-asks': 'Ask whether a category of moves is money that stays yours',
  'category-stays-yes': 'Leave a category of moves out of spending',
  'category-correction-asks': 'Ask whether a category of corrections is left out of spending',
  'category-correction-yes': 'Leave a category of corrections out of spending',
  'category-taught': 'Make the filing rule a person said yes to',
  'category-teaches': 'Offer a filing rule from a category set by hand',
  'entry-takes-book': "File a Ledger entry in its account's book",
  'instalment-settles': 'Mark an instalment paid by its payment',
  'invoice-chased': 'Mark an invoice as chased',
  'kind-offers-kpis': 'Offer a project the key numbers of its kind',
  'meet-payees': 'Know who each payment was with',
  'meet-sender-organisations': 'Know who sends the mail a pattern reads',
  'meet-senders': 'Note whoever writes in',
  'part-counts-plan': 'Count what is left of a plan',
  'part-takes-book': "File an instalment in its account's book",
  'payment-files-paid': "File a paid bill's payment as spending",
  'payment-matches': 'Find what a payment paid',
  'payment-matches-again': 'Look again for what a recent payment paid',
  'payment-settles': 'Mark a bill paid by its payment',
  'payment-unsettles': 'Open a bill again when its payment is deleted',
  'plan-links-parts': 'Link the parts of a new plan',
  'plan-made-one': 'Move the parts of a plan made one with another',
  'posted-replaced': 'Let a real charge take the place of the line posted for it',
  'recurring-stopped': 'End a repeat that stopped',
  'recurring-went-through': 'Move a repeat that went through on to its next day',
  'renew-soon': 'Ask whether to keep a service before it renews',
  'renewal-cancelled': 'Mark a service cancelled, and leave telling the provider to you',
  'renewal-kept': 'Keep a service live, and leave its next renewal day to you',
  'renewal-passed': 'Mark a service lapsing once its renewal day has passed',
  'repeat-takes-book': "File a repeating line in its account's book",
  'rule-files-back': 'File what a filing rule matches',
  /* WORK'S TWO, which declare no name of their own: each is called what its script is. */
  close_follow_ups: 'Close the follow-ups of a finished task',
  start_with_parent: 'Start a follow-up where its parent is',
};

/**
 * WHAT A FIRST-PARTY SCRIPT IS CALLED, by its id, the title it declares: what a screen says when it could not read the
 * record's own titles, so a run reads "File what an account holds in the account's book" and never "Book from account".
 */
export const SCRIPT_NAMES: Readonly<Record<string, string>> = {
  book_from_account: "File what an account holds in the account's book",
  budget_watch: 'Mark a budget near or over its most for its week, month or year',
  card_owed: 'Work out what a card owes from its texts',
  category_stays: 'Ask whether a category of moves is money that stays yours',
  category_correction: 'Ask whether a category of corrections is left out of spending',
  close_account: 'Close an account, and ask about what it still holds',
  file_back: 'File what a filing rule matches',
  last_day: 'Ask whether a payment on a month end is the last day or that date',
  learn_category: 'Offer a filing rule from a category set by hand',
  ledger_twice: 'Find lines in the Ledger written twice',
  match_payment: 'Find what a payment paid',
  move_line: 'Ask to move a repeating line on when its bill is paid',
  offer_budgets: "Offer a budget for each category from last month's spending",
  plans_from_names: 'Give each plan a page and count what is left after each part',
  post_due: 'Post the repeating lines you asked for on their day',
  replace_posted: 'Let a real charge take the place of the line posted for it',
  settle: 'Mark what a payment paid',
  settle_matched_line: 'Mark a repeating line paid by its payment',
  unsettle: 'Open a bill again when its payment is deleted',
  close_follow_ups: 'Close the follow-ups of a finished task',
  start_with_parent: 'Start a follow-up where its parent is',
};

/**
 * WHAT A FIRST-PARTY RULE'S WRITE SAYS AFTER THE ROW'S NAME, by the rule's id, for the rules that change a row rather
 * than note on it or ask. "Since you were away" drew `Categorise what cleared changed TALLYARD` down the page; the line
 * is the row and what was done to it, `Tallyard categorised`. A rule left out keeps the verb and the row.
 */
export const RULE_DONE: Readonly<Record<string, string>> = {
  'txn-categorise': 'categorised',
  'recurring-ended': 'ended',
};

/** The words after a row's name for what a rule did to it, or `null` for a rule this build does not word. */
export const ruleDone = (id: string): string | null => {
  const bare = id.replace(/^rule[.:]/u, '');
  return Object.hasOwn(RULE_DONE, bare) ? RULE_DONE[bare]! : null;
};

/**
 * WHAT A FIRST-PARTY RULE'S ROWS ARE, by the rule's id, for a feed line that folds a run of its writes into one: six
 * lines of "TALLYARD categorised" read as `Categorised 6 payments: Tallyard, Northern Rail and 4 more`. Only rules worded
 * in `RULE_DONE`; any other folded run keeps the verb and names the rows.
 */
export const RULE_ROWS: Readonly<Record<string, string>> = {
  'txn-categorise': 'payments',
  'recurring-ended': 'repeats',
};

/**
 * WHAT A FIRST-PARTY RULE ASKED, by the rule's id: where in its question the row's name ends, and the line the feed says.
 * "Since you were away" led with the rule's name, `Catch a repeat that did not happen suggested Ledger Post, sen…`; the
 * line is what was asked, `Asked whether Ledger Post went through`. `names.test.ts` holds each `ends` to the question
 * the rule declares, and a question that does not read that way is said as `Asked: <question>`.
 */
export const RULE_ASKED: Readonly<Record<string, { ends: string; asked: string }>> = {
  'invoice-late': { ends: ' was due ', asked: 'Asked whether to chase {{what}}' },
  'recurring-missed': { ends: ' was due ', asked: 'Asked whether {{what}} went through' },
  'project-past-aim': { ends: ' was aiming for ', asked: 'Asked whether to move {{what}}’s day or park it' },
};

const bare = (id: string): string => id.replace(/^rule[.:]/u, '');

/** A few names as a person lists them: `A`, `A and B`, `A, B and C`, and past three `A, B and 4 more`, counting every row. */
export const namesSaid = (names: readonly string[]): string => {
  const distinct = [...new Set(names)];
  if (distinct.length <= 1) return distinct[0] ?? '';
  if (names.length <= 3 && distinct.length === names.length) return `${distinct.slice(0, -1).join(', ')} and ${distinct.at(-1)!}`;
  return `${distinct.slice(0, 2).join(', ')} and ${names.length - 2} more`;
};

/** A rule's folded run over `things` as one line, `Categorised 6 payments: …`, or `null` for a rule this build does not word. */
export const ruleFolded = (id: string, things: readonly string[]): string | null => {
  const done = ruleDone(id);
  const rows = Object.hasOwn(RULE_ROWS, bare(id)) ? RULE_ROWS[bare(id)]! : null;
  if (done === null || rows === null) return null;
  return `${done.charAt(0).toUpperCase()}${done.slice(1)} ${things.length} ${rows}: ${namesSaid(things)}`;
};

/**
 * THE WORDS A QUESTION MAY START WITH THAT ARE NOT A NAME, so `Asked: The backup…` reads `Asked: the backup…` and
 * `Asked: Kiln…` keeps its capital. A closed list, because a name is anything and the words around a name are not.
 */
const PLAIN_START = new Set(
  (
    'the a an this that these those it its there here some any every each no one two ' +
    'is are was were be do does did has have had can could should would will shall may might must ' +
    'which what who whom whose when where why how whether if ' +
    'add update move keep change set run retire park choose give make take send chase pay renew turn cancel close open ' +
    'drop stop start file archive merge split mark rename delete remove'
  ).split(' '),
);

/** A question as the second half of a line: its first letter lowered, unless it starts with a name. */
export const asPartOf = (question: string): string => {
  const first = /^[A-Z][a-z]*/u.exec(question)?.[0];
  return first !== undefined && PLAIN_START.has(first.toLowerCase()) ? `${question.charAt(0).toLowerCase()}${question.slice(1)}` : question;
};

/** What a rule asked, as the feed says it: by the row it names where the rule is worded here, else the question itself. */
export const ruleAsked = (id: string, question: string): string => {
  const said = Object.hasOwn(RULE_ASKED, bare(id)) ? RULE_ASKED[bare(id)]! : null;
  const at = said === null ? -1 : question.indexOf(said.ends);
  return said !== null && at > 0 ? said.asked.replace('{{what}}', question.slice(0, at)) : `Asked: ${asPartOf(question)}`;
};

/** A rule by its name, from its id with or without `rule.` in front, or `null` for one this build does not ship. */
export const ruleName = (id: string): string | null => RULE_NAMES[id.replace(/^rule[.:]/u, '')] ?? null;
