/**
 * Money: what comes in and what goes out, with a date and a currency.
 *
 * One module of the sample record, split out of the seed's `src/index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one place. `src/index.ts` composes them and keeps every export it had.
 *
 * WHAT IS OWED IS NOT WHAT MOVED, and until now this module held only the first half. `obligations` and
 * `accounts` were the whole of it: a dated promise and a typed balance, with nothing in between. So the
 * record could say what was due and what was in the bank, and could not say that GBP 4,800 left the
 * card on the 14th, what it was for, or which of the two balances it explains. Every figure on the
 * Money page was therefore about intentions. `transactions` is the other half, and `categories`,
 * `recurring`, `installments` and `snapshots` are what make a ledger readable once it exists: what
 * money is for, what comes round without anybody deciding again, what is being paid off in parts, and
 * what the whole position was on a night nobody was looking.
 *
 * MONEY-CORE 3.0.0 IS ONE PAGE OVER THE SAME LISTS. The page leads with the money
 * there is, rolled forward from each account's newest balance through what has moved since; then how long it lasts and
 * what comes in and goes out over thirty days, which are the same walk the forecast draws; then the past, read from
 * `transactions`, which is where money that moved lives. Repeating money has one home, `recurring`, walked at every
 * cadence. Every list id, enum value and figure id a record already holds stays (`declare/src/index.ts`, `ID_RENAMED`),
 * because a pack update may rename a word and never an id.
 *
 * MONEY-CORE 3.1.0 KEEPS MONEY THAT IS NOT ONE PERSON'S APART, AND SAYS WHAT ITS RULES AND AGENTS DID.
 * A person who keeps their own money and a company's in one record read one
 * Cash now over both, which is a number about nobody. `books` is the list of those separate sets, every list that holds
 * money may say which book a row is in, and each book is a page of its own under Money. A question a rule asks is
 * answered where it is asked: "Chase it" stamps the day on the bill (`MONEY_AUTOMATIONS`), and "It stopped" ends a
 * repeating line.
 *
 * MONEY-CORE 3.3.0 IS CALMER, AND SPEAKS AS A FINANCE APP. The page is fewer, bigger tiles, each drawn only while its
 * question has an answer on this record: one line of what the money is doing, Cash now beside its walk, the month ahead
 * as a calendar beside its arithmetic, Cash now cut by account (`cash-by-account`, new), and what moved as a list. No
 * figure, field or setting says who owes whom any more: money due in is receivables and money due out is payables, and
 * every id stays.
 *
 * ONE FILE A PART, SINCE REC-B01 (`loop/scope/area-record-b.md`, section 2.5). `money.ts` was 2,858 lines, and every
 * unit after it edits Money, so it is cut into this folder: the sample rows, the settings, the walk, one file a list,
 * the figures by what they read, the rules, and each page with one file a tile under `pages/parts/`. A PURE MOVE: the
 * pack's document is the same to the byte (the 3.14.0 fingerprint in `test/pack-versions.test.ts`), and `money.ts`
 * stays as one line that exports this file, so every importer reads what it read. The exports below are every name
 * `money.ts` exported, by the file that holds each.
 */

export {
  OBLIGATIONS,
  ACCOUNTS,
  CATEGORIES,
  TRANSACTIONS,
  RECURRING_ITEMS,
  INSTALLMENTS,
  nightOf,
  snapshotRows,
  SNAPSHOTS,
  cashSeries,
  cashPoints,
} from './sample.ts';
export { AVAILABLE } from './lists/shared.ts';
export { MONEY_REGISTERS } from './lists/index.ts';
export { MONEY_HOME_SETTING, MONEY_TARGET_SETTINGS, TARGET_NOTE, withTargetSetting, targetConfigOf } from './settings.ts';
export { MONEY_METRICS } from './figures/index.ts';
export { MONEY_RULES, MONEY_AUTOMATIONS } from './rules.ts';
export { DUE_THIS_WEEK } from './pages/shared.ts';
export { MONEY_PAGES } from './pages/index.ts';
