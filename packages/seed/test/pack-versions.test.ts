/**
 * Each first-party pack's version against what it declares (`FIRST_PARTY_VERSIONS` in `packs/first-party.ts`).
 *
 * A RECORD IS OFFERED AN UPDATE ONLY WHEN A VERSION GOES UP, so a pack that changes without one strands every record that
 * installed it on the old declarations, and one that goes up without a change asks people to update for nothing. The
 * fingerprint is of what reaches a record that already holds the pack: its declarations and its settings, never its
 * example rows, which are planted only into an empty list.
 *
 * THE GUARD IS BUILT THE WAY IT IS BECAUSE ONE HASH WAS TOO EASY TO ANSWER. `money-core` was raised to 1.3.0 on
 * 20 September at 17:53 and the fingerprint under that label was written again five times in the seven hours and
 * forty-seven minutes after it, by `62511a98`, `ca30d210`, `2f97a30d`, `491e7e05` and `df458964`, each time as one hex
 * string on one line. Two of the five gave a reason in their commit message and one wrote a sentence beside the literal.
 * THE TWO THAT SAID NOTHING ANYWHERE, `62511a98` AND `491e7e05`, ARE EXACTLY THE TWO THAT CHANGED WHAT A RECORD HOLDS
 * rather than the words over it: `62511a98` took `metric.recurring-out-month` and `metric.recurring-in-month` away, the
 * two figures that read `register.recurring` where the pair that survives reads `register.obligations`, and
 * `491e7e05` added `rule.recurring-ended`, which moves a finished schedule to `ended` and is the difference between a
 * stopped row counted at GBP 249.00 a month and not counted at all. A hash reports all five of those the same way, so
 * the cheapest answer was always the same edit and the guard never put a decision in front of anybody.
 *
 * SO A VERSION RECORDS THE IDS AS WELL AS THE HASH, and the two are asked different questions. An id appearing or
 * vanishing is a declaration a record on that version does not have and can never be told about, so there is no
 * fingerprint to set again for it: the entry is refused and the ids are named. Only the words inside declarations that
 * are already there may be set again, and that costs a line of prose beside the literal, naming what moved and ending in
 * the value it set.
 *
 * WHAT THIS DOES NOT DO, said plainly, because a guard oversold is a guard nobody checks. The ids do not notice a filter
 * or a leg changing inside a page that already exists, and `ca30d210` and `2f97a30d` were both exactly that. The hash
 * notices, and the line of prose is where somebody has to say whether what moved was words or arithmetic. Nor can any of
 * this stop a hand determined to shut the test up: the point is to stop the reflex, because the edit that now hides a new
 * rule is a named id deleted from a list a reviewer reads instead of a hex nobody can read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../src/index.ts';

type Doc = { version: string; declarations: unknown[]; config?: unknown };

/** Every pack as 1.0.0 declared it, before any of them had a version of its own. */
export const RELEASED_1_0_0 = JSON.parse(readFileSync(new URL('./fixtures/first-party-1.0.0.json', import.meta.url), 'utf8')) as Record<string, Doc>;

const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/** Every declaration and every setting a record that installs the pack holds, by id. `provides` is the manifest's own list. */
const inventory = (id: FirstPartyId, doc: Doc): string[] =>
  [...firstPartyManifest(id).provides, ...Object.keys((doc.config ?? {}) as Record<string, unknown>).map((k) => `setting.${k}`)].sort();

/** The ids out of a recorded `holds`, which is written over several lines so that a person can read it. */
const ids = (holds: string): string[] => holds.split(/\s+/u).filter((t) => t !== '');

type Version = {
  /**
   * EVERY DECLARATION AND EVERY SETTING A RECORD ON THIS VERSION HOLDS, by id, in any order and any whitespace. This is
   * the half a fingerprint could not tell from a reworded heading, and it is required of the version each pack is on now.
   * The retired entries below have none, because the ids they were written against were never written down: a hash was.
   */
  holds?: string;
  /**
   * What those declarations and settings SAY, hashed. Written here as well as at the end of the last `history` line ON
   * PURPOSE: the edit that answers this guard without thinking is to change this value and nothing else, and that leaves
   * the two disagreeing, which is what the test refuses.
   */
  declares: string;
  /**
   * ONE LINE PER FINGERPRINT THIS VERSION HAS EVER DECLARED, oldest first, each ending `-> <the value it set>`. Required
   * of the version each pack is on now, because that is the only entry a reset can happen to. A reset appends a line; it
   * does not edit one, and the list getting longer is how a reader sees that a version has been rewritten five times.
   */
  history?: readonly string[];
};

/**
 * WHAT EACH VERSION ABOVE 1.0.0 DECLARES. A version that has not been released yet may have its fingerprint set again,
 * and the line that says which change moved it is the price. One that a record may already hold may not: raise the
 * version and give the new one its own entry.
 */
const DECLARED: Record<string, Version> = {
  'portfolio@1.1.0': { declares: 'a51dab345b11594b' },
  'portfolio@1.2.0': { declares: '5e42170296fe76b4' },
  'portfolio@1.3.0': {
    holds: `
      metric.projects-aim-30d metric.projects-by-health metric.projects-earning metric.projects-earning-before
      metric.projects-earning-change metric.projects-live metric.projects-need-you metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio register.things rule.project-past-aim
    `,
    declares: 'b43e0664aa176905',
    history: ['A project says what it earned in a year and what it earned the year before, and the Overview draws both, so `projects-earning-before` and `projects-earning-change` are new -> b43e0664aa176905'],
  },
  'portfolio@1.4.0': {
    holds: `
      metric.projects-aim-30d metric.projects-by-health metric.projects-earning metric.projects-earning-before
      metric.projects-earning-change metric.projects-earning-said metric.projects-live metric.projects-need-you
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio register.things rule.project-past-aim
    `,
    declares: '7e7c2e05e820f763',
    history: [
      'The Earning figures stop summing every project in play and sum the projects that said what they earn, which is the row set the bar beside them draws, and `projects-earning` says how many of them there were through the new `projects-earning-said`. A record where nobody had said anything read GBP 0.00 as a fact about the portfolio -> 7e7c2e05e820f763',
    ],
  },
  'money-core@3.1.0': {
    holds: `
      metric.arriving-30d metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of metric.cash-by-book
      metric.cash-now metric.chasing metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month
      metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d metric.net-by-month
      metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you
      metric.project-in-by-month metric.project-out-by-month metric.project-owed metric.received-30d
      metric.runway-days metric.spent-30d metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments
      register.obligations register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended
      rule.recurring-missed rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d
      setting.most_left_in_parts setting.most_on_one_category setting.most_out_30d setting.most_out_every_month
      setting.most_owed_by_you setting.most_owed_to_you setting.most_parts_due_30d setting.most_spent_30d
      setting.most_spent_on_one_category
    `,
    declares: 'e174c8e1ad7deb1f',
    history: [
      "Books keep money that is not one person's apart. A `books` list, an optional book on every list that holds money, a page per book under Money with its own walk, and one Cash now per book once there are two; a late invoice answered Chase it is stamped chased, a repeating line answered It stopped is ended, a stale balance is a digest line and not a question, and an account or book that rows point at cannot be deleted. One list, fields, figures, a page and two automations added and nothing taken away, so the step is a minor one -> e174c8e1ad7deb1f",
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 3.1.0 is on `origin/master` and records hold it. Three ids are gained, the month's
   * figures a project page reads, which are Money's by the list they read; the rest moved inside declarations 3.1.0
   * already held.
   */
  'money-core@3.2.0': {
    holds: `
      metric.arriving-30d metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of metric.cash-by-book
      metric.cash-now metric.chasing metric.days-late-in metric.due-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.leaving-30d metric.net-by-month metric.out-30d metric.out-by-month
      metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.runway-days metric.spent-30d metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '02e1f91a8c99d21c',
    history: [
      "`page.money` is built to the new look: it opens with a sentence said from `cash-now` and `runway-days`, Cash ahead sits beside the next thirty days, its questions are tiles, and what is paid in parts is one track a plan over `register.installments`; `runway-days`, `arriving-30d` and `leaving-30d` are remembered each night so their tiles draw twelve weeks as a line, and a project page's month is read from the new `project-in-month`, `project-out-month` and `project-kept-month` -> 02e1f91a8c99d21c",
    ],
  },
  'money-core@3.3.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of
      metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '510bf2c44fa10717',
    history: [
      "`page.money` is calmer: one line of what the money is doing, Cash now and how long it lasts beside Cash ahead, the month ahead as a calendar beside the bridge, Cash now cut by account over the new `cash-by-account` in place of a card an account, what moved as a list, a glyph on every tile and each tile drawn only while it has something to say, the calendar under the new `due-items-30d`; `page.money-book` takes the same tiles; no figure, setting or `register.snapshots` field says who owes whom, receivables and payables in their place; an `Out of date` note over the new `balances-stale` says an old balance on the page that reads it, and `Add an account` sits beside the headline tile while there is no account -> b22d572f1793ca16",
      "`page.money`'s line says how far `cash-now` moved on a month ago (`{{cash-now.change}}`), Waiting on you is drawn only while `questions-open` has any, and Where this month's money went takes a row of its own with Accounts and Instalments half each, so every row is whole when it is not drawn -> a3502edb4320d804",
      "`page.money`'s tiles share a row only when one figure draws both: Accounts (8) beside The next 30 days (4), both on `cash-accounts`, and every tile drawn on a figure of its own the whole width, so no row is half empty whatever is hidden -> 510bf2c44fa10717",
    ],
  },
  'portfolio@1.5.0': {
    holds: `
      metric.projects-aim-30d metric.projects-by-health metric.projects-earning metric.projects-earning-before
      metric.projects-earning-change metric.projects-earning-said metric.projects-live metric.projects-need-you
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio register.things rule.project-past-aim
    `,
    declares: 'e034fa8da981b2ea',
    history: [
      "A project page leads with the questions waiting on it, draws what changed on it, its plan on a time axis when its tasks have days and its money month by month, signs the amount on its Money table, drops the agent code block, and every money figure on `page.portfolio` is in the record's own currency with its target a setting -> e034fa8da981b2ea",
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 1.5.0 is on `origin/master` and records hold it. One id is gained,
   * `metric.projects-by-lane`, which no fingerprint could be set again for; the rest moved inside declarations 1.5.0
   * already held, which the history line says.
   */
  'portfolio@1.6.0': {
    holds: `
      metric.projects-aim-30d metric.projects-by-health metric.projects-by-lane metric.projects-earning metric.projects-earning-before
      metric.projects-earning-change metric.projects-earning-said metric.projects-live metric.projects-need-you metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '229b3838334777f4',
    history: [
      "`page.portfolio` is built to the new look: it opens with a sentence said from `projects-need-you`, draws every project's status as one track over the new `projects-by-lane`, draws what each earns as a split where it was a bar, and its cards wear the project's mark, hue and the new `about` line of `register.things`; `projects-live` and `projects-earning` are remembered each night, so In play and Earning draw twelve weeks as a line -> 229b3838334777f4",
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 1.6.0 is on `origin/master`. No id is gained or lost; one column moved inside
   * `page.portfolio`, which the history line says.
   */
  'portfolio@1.7.0': {
    holds: `
      metric.projects-aim-30d metric.projects-by-health metric.projects-by-lane metric.projects-earning metric.projects-earning-before
      metric.projects-earning-change metric.projects-earning-said metric.projects-live metric.projects-need-you metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: 'cb05e11cd1166509',
    history: [
      "`page.portfolio`'s cards in play draw a line of the work finished on each project by the week, over Work's `project-done-by-week`, left out on a record that will not hold Work's tasks -> cb05e11cd1166509",
    ],
  },
  'money-core@1.1.0': { declares: '5cb37a57b9de3499' },
  'money-core@1.2.0': { declares: '4f42a8e447293eaf' },
  /**
   * RETIRED WITHOUT EVER NAMING ONE SET OF DECLARATIONS, and kept here because the history is the only record of that.
   * Five of the six lines below were written after the fact, out of `git log -p` on this file, which is where the reason
   * for a reset had to be dug for before there was anywhere to put it. No `holds`, because the ids under this label
   * depend on which of the five you mean.
   */
  'money-core@1.3.0': {
    declares: '4b0b669c35680e7f',
    history: [
      'Raised to 1.3.0 here: `snapshots` gained a searchable title, `accounts` gained `last4`, and `owed-by-you` became the fourth figure a night holds -> bf68b1965194f832',
      '`62511a98` took `recurring-out-month` and `recurring-in-month` away, not a second name for `every-month-out` and `every-month-in` but a second answer over a different list: GBP 10,416.16 off `obligations.repeats` against GBP 9,196.33 off `recurring`, two clicks apart -> 2049f37907acb5c7',
      '`ca30d210` gave the walk and the bridge on `page.money` an `installments` leg, so both read the same legs -> d5fec3e0237f4183',
      '`2f97a30d` put `direction is out` on the Still to pay, in parts table on `page.ledger`, six rows to four -> 2ee211ae089dc1fb',
      '`491e7e05` added `rule.recurring-ended` and did not raise the version, which is the reset this guard was rebuilt over, and renamed `in-30d` and `out-30d` to Owed to you and Owed by you -> 16b20c1f9d41aef4',
      '`df458964` followed those two renames with the `most_out_30d` label and the by-category heading, both words a record prints -> 4b0b669c35680e7f',
    ],
  },
  /**
   * THE SAME FINGERPRINT AS 1.3.0'S LAST, AND THE VERSION MOVED ANYWAY, which is the whole of what a version is for: it
   * is about who gets told, not about the words. Nothing is declared here that was not declared under 1.3.0 an hour
   * before it; what changed is that a record holding an earlier 1.3.0 is now offered `rule.recurring-ended` instead of
   * being left on a label that had quietly moved underneath it.
   */
  'money-core@1.4.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-out
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d
      metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month
      metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.out-30d
      metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you
      metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category
      setting.most_out_30d setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '4b0b669c35680e7f',
    history: ['Raised so that a record on an earlier 1.3.0 is offered `rule.recurring-ended`, which 1.3.0 gained without moving -> 4b0b669c35680e7f'],
  },
  'money-core@1.5.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-out
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.holdings register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '6442babb13c81d12',
    history: ['Raised for `register.holdings`, the list that takes gold, a certificate and a policy without counting a policy as cash -> 6442babb13c81d12'],
  },
  'money-core@1.6.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-out ingest.bank-card-used ingest.bank-from-in ingest.bank-from-out ingest.bank-from-unsure
      ingest.bank-ipn-in ingest.bank-ipn-out
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.holdings register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '03f76621c84239df',
    history: [
      'Raised for three HSBC wordings, `ingest.bank-card-used`, `ingest.bank-ipn-out` and `ingest.bank-ipn-in`, and for `metric.spent-30d` and `metric.received-30d` counting thirty days rather than thirty-one -> 54bd8171345118f2',
      'Before any release, `ingest.bank-from-out` for the debit half of the `From HSBC:` line, which the `MON` token of `43 §4.3` made declarable -> c1e04509fe953ee1',
      'Still before any release, and CI had not run: `ingest.bank-from-out` asks for its hyphen against a digit, because a spaced one filed a transfer in as OUT at exact, the new `ingest.bank-from-unsure` holds that line for a person with no direction, and `ingest.bank-ipn-out` reads a purchase payee after `from` as well as `to` -> f8aab69dc2a8d7b0',
      /* AN ID GAINED UNDER A LABEL, which the guard answers with "raise the version", and it was not raised. Measured before
         writing this: `gh run list --workflow deploy.yml` showed every deploy since `aeef01c5`
         introduced 1.6.0 as `skipped`, because no `ci` run on master had completed, so no record anywhere has been
         offered 1.6.0 and there is no record on it to strand. Raising to 1.7.0 would also have put a version nobody
         shipped between 1.5.0 and this one. If a deploy has succeeded by the time this is read, this line is wrong and
         the id belongs to 1.7.0. */
      /* THE LAST SENTENCE ABOVE IS NOT RIGHT, and 1.7.0 was asked for on the strength of it and not raised. Measured
         later: the last successful deploy is `8bbf469e` at 16:23 UTC on the 21st, before
         `aeef01c5` set 1.6.0, and the one run not yet finished is `ci` on `d9e43931`, which has `3bc64513` behind it. A
         deploy ships a whole commit, so every build that can now reach a record carries `ingest.bank-from-in` under
         1.6.0, and no record can hold a 1.6.0 without it. What a first successful deploy does change is the next line:
         from then on 1.6.0 is released, and any id added under it is a raise to 1.7.0, not a line here. */
      'Still before any release, since every deploy since 1.6.0 was skipped: `ingest.bank-from-in` reads the `From HSBC:` credit off the `+` glued to its figure, and `ingest.bank-from-out` and `ingest.bank-from-unsure` refuse that sign so no line is claimed twice -> 03f76621c84239df',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, AS THE LINE ABOVE ASKS FOR AN ID GAINED. Eight ids arrive, so 1.6.0 cannot be set again
   * whatever its release state. Measured with `gh run list --workflow deploy.yml`: every deploy since
   * `aeef01c5` set 1.6.0 is still `skipped`, so no record holds 1.6.0 and a record on 1.5.0 is offered 1.7.0 directly.
   */
  'money-core@1.7.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms ingest.bank-card-used
      ingest.bank-card-used-sms ingest.bank-from-in ingest.bank-from-in-sms ingest.bank-from-out ingest.bank-from-out-sms
      ingest.bank-from-unsure ingest.bank-from-unsure-sms ingest.bank-ipn-in ingest.bank-ipn-in-sms ingest.bank-ipn-out
      ingest.bank-ipn-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.holdings register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '9b29858e7ee11345',
    history: [
      'Raised for the eight webhook twins an iOS Shortcut posts a bank SMS to, `ingest.bank-from-out-sms` and the seven beside it, each the reading of its mail pattern behind `verify: { kind: path }`, matching nothing until an owner mints its token -> 9b29858e7ee11345',
    ],
  },
  'money-core@1.8.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.holdings register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '8bcd20187c61cf1b',
    history: [
      "HSBC Egypt's six wordings and their six `-sms` twins leave for the `bank-hsbc-eg` pack, and `ingest.bank-card-out` and `ingest.bank-card-in` stay -> 8bcd20187c61cf1b",
    ],
  },
  /**
   * THE FIRST MAJOR STEP THIS PACK HAS TAKEN, because a list is taken away. `holds` below is 1.8.0's less
   * `register.holdings`, and nothing else moved: `money-core-major.test.ts` rebuilds 1.8.0 by putting that one body back
   * after `register.accounts` and reads 1.8.0's own fingerprint off the result.
   */
  'money-core@2.0.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '920c66c138d81d3f',
    history: [
      'Raised a major step because `register.holdings` leaves for the `holdings` pack, handed with its rows rather than retired, and `gold` leaves with it; `register.accounts` and every other list stay as 1.8.0 declared them -> 920c66c138d81d3f',
    ],
  },
  /**
   * A MINOR STEP AFTER THE FIRST MAJOR ONE, because a field is added and nothing is taken away. The ids are 2.0.0's
   * exactly; what moved is inside `register.transactions`, which the ids cannot see and the reason below has to.
   *
   * THE SECOND LINE BELOW IS WRONG, AND IT STAYS because a history is appended to and never edited. 2.1.0 shipped with
   * the deploy of `bab716a5` at 23:27 UTC on 23 September (`gh run list --workflow deploy.yml`, read on the 24th), and
   * that tree declared `99fe861644707f24`, the first line's value. `baf7048a` added `pairs:` eleven minutes later and read
   * the deploy before that one as the last. So a record on 2.1.0 holds `99fe861644707f24`, `f10e802c80863429` is a
   * label no deploy ever carried, and `pairs:` is 2.2.0's. Setting `declares` back is refused here, since a value may not
   * be listed twice.
   */
  'money-core@2.1.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: 'f10e802c80863429',
    history: [
      '`register.transactions` gains `available`, what the bank said was left after a movement, so the limit a card alert prints can tell a second charge of the same amount from the same alert sent twice -> 99fe861644707f24',
      'Still before any release, the last successful deploy being `19d4c785` at 15:07 UTC on 23 September: `register.transactions` declares `pairs:`, so the record marks both cleared legs of a move between two accounts as `transfer` rather than counting it once as spent and once as received, and a void or pending row pairs with nothing -> f10e802c80863429',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 2.1.0 shipped with `bab716a5` (above). The ids are 2.1.0's exactly: `pairs:` is
   * inside `register.transactions`, where the ids cannot see it.
   */
  'money-core@2.2.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '4640c85c0ef44586',
    history: [
      '`register.transactions` declares `pairs:`, the move `baf7048a` put under the shipped 2.1.0: both cleared legs of a move between two accounts are marked `transfer`, and a leg naming who it was with (`party`) or the obligation it paid (`settles`) pairs with nothing, so rent and a client paying the same sum a day later stay in Spent and Received -> 4640c85c0ef44586',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 2.2.0 is on `origin/master` and was deploying (deploy run `35941293759`, 01:04 UTC
   * on 24 September) when this was set. The ids are 2.2.0's exactly: what moved is one clause of `pairs.where` inside
   * `register.transactions`.
   */
  'money-core@2.3.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '8ad733c726f4fd0b',
    history: [
      '`register.transactions` keeps a reconciled card bill paired: `pairs.where` reads `settles is empty or transfer is true`, so a leg that settles an obligation stays the leg of a move it already is and still starts none, where at 2.2.0 setting `settles` on the bank leg parted the pair and EGP 9,500.00 read as spent and as received -> 8ad733c726f4fd0b',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 2.3.0 is on `origin/master` (`5dc5a7c6`) and deploy run `36010768543` carried it
   * out at 14:09 UTC on 24 September. The ids are 2.3.0's exactly: one field moved inside `register.obligations` and one
   * key inside each walk on `page.money`, both where the ids cannot see.
   */
  'money-core@2.4.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: '47e60867f14c18d0',
    history: [
      '`register.obligations` gains `ends`, the last day a repeating row moves money on, and the obligations leg of both walks on `page.money` names it, so a bill an import says ends on 10 November stops walking on the 10th where at 2.3.0 it walked every month to the horizon, because the import writes an end only where the list declares one (`5d4bbf8b`) -> 47e60867f14c18d0',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 2.4.0 is on `origin/master` (`7fa92aa4`). The ids are 2.4.0's exactly: one key on
   * a leg and one list of knobs moved, both inside `page.money`, where the ids cannot see.
   */
  'money-core@2.5.0': {
    holds: `
      ingest.bank-card-in ingest.bank-card-in-sms ingest.bank-card-out ingest.bank-card-out-sms
      metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue
      metric.owed-by-you metric.owed-to-you metric.project-owed metric.received-30d metric.spent-30d metric.txn-uncategorised
      page.home page.ledger page.money
      register.accounts register.categories register.fx register.installments register.obligations register.recurring
      register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_on_one_category setting.most_out_30d
      setting.most_out_every_month setting.most_owed_to_you
    `,
    declares: 'c98b58b3df5eaca1',
    history: [
      'The installments leg both walks on `page.money` read names `group: plan`, so each part of a plan reaches the chart as that plan and the count control can take the proofing press in or out whole, where every part was its own one-off; Cash ahead\'s knobs add `grow`, `drift` and `count` to horizon, late, spend and leave -> c98b58b3df5eaca1',
    ],
  },
  'money-core@3.0.0': {
    holds: `
      metric.arriving-30d metric.cash-accounts metric.cash-as-of metric.cash-now metric.days-late-in metric.due-30d
      metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d metric.in-by-month
      metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money
      register.accounts register.balances register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-late rule.recurring-ended rule.recurring-missed rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you
      setting.most_owed_to_you setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '22b7e4f2f0219a8c',
    history: [
      'Raised a major step because two pages go, `page.home` and `page.ledger`, into one `page.money`, and the four card wordings leave for packs/card-alerts; `register.balances` is new, `register.fx` says its `rates:`, and every list, field and figure id stays -> 22b7e4f2f0219a8c',
    ],
  },
  'work@1.1.0': { declares: 'b49e051fe7c26ac5' },
  'work@1.2.0': { declares: '49a30d2ef8c1d672' },
  'work@1.3.0': { declares: 'fb82e66d80644e3d' },
  'work@1.4.0': {
    holds: `
      metric.open-tasks metric.project-done-7d metric.project-due-soon metric.project-in-review metric.project-open
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board register.tasks register.tracks register.updates
    `,
    declares: '0173aa61c9b3bc21',
    history: ['The Board says which cards an agent is on right now, which is `tasks-with-agents` and `tasks-done-7d-agents` -> 0173aa61c9b3bc21'],
  },
  /**
   * THE FIRST ENTRY NOBODY TYPED. `holds` and `declares` below are what `scripts/fingerprint.mjs` printed, pasted
   * unedited; the reason is the one field the tool leaves blank, and writing it is where the decision about what moved
   * actually happened.
   */
  'work@1.5.0': {
    holds: `
      metric.open-tasks metric.project-done-7d metric.project-due-soon metric.project-in-review metric.project-open
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week
      metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
    `,
    declares: '39887628aa89f296',
    history: [
      'Due soon on `page.work` stops drawing the tickets that are already in the queue above it, and that queue gained the due day it was the only other place to see: the sample drew three of its fourteen tickets twice on one screen -> 43b75b3712bfb336',
      'Words only, and the same version because it was never released: `page.work`\'s Due soon now reads "Nothing else is due in the next two weeks." A block that holds work back can be empty while work is due, and driven against the sample with its eight open tickets inside the fortnight moved to blocked it said nothing was due over a queue of eleven that were -> 39887628aa89f296',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 1.5.0 shipped: the deploy of `8bbf469e` on 21 September at 16:23 UTC succeeded
   * and `79f17031`, which set 1.5.0, is behind it. No id moved, which the unchanged `holds` says; every change is inside
   * `page.work`, which is exactly the case the ids cannot see and the reason below has to.
   */
  'work@1.6.0': {
    holds: `
      metric.open-tasks metric.project-done-7d metric.project-due-soon metric.project-in-review metric.project-open
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week
      metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
    `,
    declares: '1e1996952c4dce03',
    history: [
      '`page.work` leads with what to do as six lists that tick, Today, This week, Waiting on you, With an agent, After this week and Later, cut by state, then agent, then day so no task falls under two; its Waiting on you, Due soon and With an agent tables, which nobody could tick from the Overview, are gone -> 93dcbade382b5e4a',
      /* THE SAME VERSION, BECAUSE 1.6.0 HAS NOT SHIPPED. Measured with `gh run list --workflow deploy`:
         the last successful deploy is still `8bbf469e` at 16:23 UTC on the 21st, and `7e796bbe`, which set 1.6.0, is
         not behind it. Every deploy since was skipped. */
      'Still before any release: `page.work` gains a seventh list, No due day, `state is open or doing, agent is empty, by is empty`, because a task of yours with no due day was under none of the six and `by is empty or after +7d` is refused. Done lately goes back to the full width to make room -> bc6a8f4d4c3319ab',
      'Still before any release, since every deploy since 1.6.0 was skipped: Waiting on you on `page.work` declares `what, note, by, changed`, so a todo row carries its due day and who changed it last as the third and fourth cells `c6e2a331` widened the kind to -> 1e1996952c4dce03',
    ],
  },
  'work@1.7.0': {
    holds: `
      metric.open-tasks metric.project-done-7d metric.project-due-soon metric.project-in-review metric.project-open
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week
      metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
    `,
    declares: 'ea8dd09cbe41f705',
    history: [
      '`register.updates` opens `by` from a closed list of four vendors to text, a widening, so an update by any author lands -> ea8dd09cbe41f705',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, because 1.7.0 is on `origin/master` (`814ca32c`) and four ids are gained, which the guard
   * refuses under a released label whatever the hash says. Nothing inside a declaration 1.7.0 held moved: the ids below
   * are 1.7.0's plus the four, pasted from `scripts/fingerprint.mjs` unedited.
   */
  'work@1.8.0': {
    holds: `
      metric.open-tasks metric.project-done-7d metric.project-due-soon metric.project-in-review metric.project-open
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week
      metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: 'e4126747e977dddd',
    history: [
      'A task\'s follow-ups close with it and start in its project: `rule.close_follow_ups` starts `script.close_follow_ups` when a task moves to done, which closes every step `Part of` it still open, doing or blocked, and `rule.start_with_parent` starts `script.start_with_parent` when a task is created with a parent, which gives it the parent\'s project and thread -> e4126747e977dddd',
    ],
  },
  'work@1.9.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-due-soon metric.project-in-review
      metric.project-open metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '03c89c8b18be3c6d',
    history: [
      'Work is called Work and its Overview leads with a capture line; the lists of yours and the Board are ordered by tier then due; it adds `project-dated` for a timeline of the next two weeks and a heat of what was done in twelve weeks, and a queue of what agents ask about tasks; tasks gain an optional `why` and `register.tasks` declares `hand` (`person: owner, agent: agent, taken: doing`), so a task can be handed to an agent even on a record with no People -> 03c89c8b18be3c6d',
    ],
  },
  'work@1.9.1': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-due-soon metric.project-in-review
      metric.project-open metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-later metric.tasks-overdue metric.tasks-waiting metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '03c89c8b18be3c6d',
    history: ['Nothing new is declared: the step lets a record whose links were left out when a use case installed it take the update, which puts the `thing` and `owner` of `register.tasks` back -> 03c89c8b18be3c6d'],
  },
  'work@1.10.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-in-review metric.project-open metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week
      metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later metric.tasks-overdue
      metric.tasks-today-yours metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: 'e2d0a0a7ab0b4a2c',
    history: [
      "`page.work` is the Work screen's bands, declared: one line said from the figures, the capture line, Open and Done in 7 days as the only figures, then Late, Today, This week, With an agent, Waiting on you and Done recently, each drawn only while its figure has any, and After this week, No due day and Later folded under Not this week; the chart of the weeks, the bar by project and the queue of questions go; `page.work-board` opens on one line; every tile's heading wears a glyph; `tasks-waiting`, `tasks-due-7d` and `tasks-done-7d` are remembered each night; and the new `project-done-by-week` counts one project's finished work by week -> f1bccb1108ea8511",
      '`tasks-waiting` and `tasks-due-7d` are no longer remembered each night, since Right now draws only Open and Done in 7 days and nothing reads their weeks -> df54fed030771614',
      "`page.work`'s Late, Today and This week are drawn on the new `tasks-late-yours`, `tasks-today-yours` and `tasks-week-yours`, each over its band's own clauses, the line's late is `tasks-late-yours`, and `tasks-with-agents` counts only what an agent has in hand, so no band is drawn empty -> e2d0a0a7ab0b4a2c",
    ],
  },
  /** A VERSION AND NOT A RESET: portfolio's last version is on `origin/master`. */
  'portfolio@1.8.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: 'b20a259181fb4e84',
    history: [
      "`page.portfolio` is calmer: Right now drops Need you, which is the line's, and Parked, which is a part of Where they are; the Earning tile goes, its year being the sum of What each one earns; Where they are sits beside How they are going; What each one earns, With an agent and Coming up are folded under a new section; every heading wears a glyph, and each tile is drawn only while its figure has any, Coming up and the parked list over the new `projects-aiming` and `projects-not-in-play` -> d09b14bf722cc8c4",
      "`page.portfolio`'s fold over what each earns, what agents hold and what is coming up is drawn only while one of them has a project, over the new `projects-looked-up`, so a fresh Overview reads no folded heading over nothing -> b20a259181fb4e84",
    ],
  },
  /** A VERSION AND NOT A RESET: portfolio 1.8.0 is live. */
  'portfolio@1.9.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '1f1496456a14ea07',
    history: [
      "`page.portfolio` is titled Projects, as its place in the top bar is, and Right now is four twelfths beside the two splits and drawn only while `projects-live` has any; `register.things` labels `lane` Building, Earning, Parked and Finished, so the split no longer prints the stored words -> 1f1496456a14ea07",
    ],
  },
  /** A VERSION AND NOT A RESET: portfolio 1.9.0 is live. */
  'portfolio@1.10.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '1e0e3cab192a5910',
    history: [
      "`page.portfolio` loses Right now, whose In play is said by the line now (`projects-live` beside `projects-need-you`), so Where they are and How they are going take half the row each, and the fold over what each earns, agents and dates wears `rows`, a glyph a folded heading draws -> 1e0e3cab192a5910",
    ],
  },
  /** A VERSION AND NOT A RESET: portfolio 1.10.0 is live. */
  'portfolio@1.11.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '152fb1ab4e697789',
    history: [
      "`page.portfolio` says each thing once: Needs you goes, since every card in play says its health and next step, and Where they are goes, leaving How they are going the whole width under the line -> 152fb1ab4e697789",
    ],
  },
  'portfolio@1.12.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '9848954ea3aa36b4',
    history: [
      "`page.portfolio` names its projects: the line says which need a push and which are on track (`metric.projects-on-track` added), How they are going draws past four in play, and the cards lose their Health and How far along labels -> 9848954ea3aa36b4",
    ],
  },
  /** A VERSION AND NOT A RESET: money-core's last version is on `origin/master`. */
  'money-core@3.4.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of
      metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '6c498d04c8ca76e8',
    history: [
      "`page.money` is calmer: the What you have tile beside the line goes, since it said the line's figures again, Cash ahead and the box for a first account take the whole width, Where this month's money went and Every month go so the month is drawn once, and everything after Accounts is folded under Coming and going; `page.money-book` folds the month ahead and what moved under its accounts the same way -> 6c498d04c8ca76e8",
    ],
  },
  /** A VERSION AND NOT A RESET: money-core 3.4.0 is live. */
  'money-core@3.5.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of
      metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: 'a3bc48d1fa79d146',
    history: [
      "`page.money`'s Out of date, Late coming in and Late going out notes lose their headings and become three lines of one boxed Heads up section under Accounts, drawn once there is an account (`cash-accounts`) and each line still on its own figure; Coming and going wears `calendar` on `page.money` and `page.money-book`, a glyph a folded heading draws -> a3bc48d1fa79d146",
    ],
  },
  /** A VERSION AND NOT A RESET: money-core 3.5.0 is live. */
  'money-core@3.6.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of
      metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '54940b8157f20a22',
    history: [
      "`page.money`'s and `page.money-book`'s Cash ahead open on `horizon: 90`, the next three months, with 180, 365 and longer still offered -> fed57bc77115f933",
      "`page.money`'s Cash ahead declares `headline: under`, so it leaves its own sentence off while the line over the page says when the money runs out -> c5af9aa1e3761e6f",
      "`page.money`'s and `page.money-book`'s Cash ahead walk a year again, `horizon: 365`, since the knob offers no length past the walk and 90 days took six months and a year away -> 54940b8157f20a22",
    ],
  },
  'money-core@3.7.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.books-held metric.cash-accounts metric.cash-as-of
      metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '043ae7e7914c74d9',
    history: [
      "`page.money`'s Cash ahead opens on 90 days with 180, 365 and 730 still on its control, the record walking to the longest of `horizons:` -> 043ae7e7914c74d9",
    ],
  },
  /** A VERSION AND NOT A RESET: estate's last version is on `origin/master`. */
  'estate@2.1.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: 'f88101804e05c342',
    history: [
      "`page.estate` is calmer: it says what belongs on a fresh record in one note, the note about a domain pointing nowhere comes under the line, At a glance drops Cost per year, which is the line's month again, the chips by type go, what each domain points at and every service are folded under a new section, every heading wears a glyph, and each tile is drawn only while its figure has any, over the new `renews-90d`, `domains-held` and `services-held` -> f88101804e05c342",
    ],
  },
  /** A VERSION AND NOT A RESET: estate 2.1.0 is released (`fixtures/released/estate-2.1.0.json`). */
  'estate@2.2.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: 'c1fcbf2f04e75a76',
    history: [
      "`register.services`'s `kind` gains `server`, `database`, `storage` and `network` with their labels -> 7cccb015ec1bb242",
      "Folded into the unreleased 2.2.0: `project-cost` reads only services whose cost is set, so a project whose services say no cost draws no Costs a year where it drew 0; no id added or taken away -> a593ca243fd01b37",
      "Folded into the unreleased 2.2.0: `page.estate`'s Waiting on you is gated on `questions-open-in:services`, the questions about a service, where it was gated on every open question, and its line opens on a clause saying how many; and `register.services`'s `kind` names `vm`, `edge` and `object` Virtual machine, Edge network and Object storage; a block added, nothing taken away, no id added or taken away -> ec4895c39c078fc5",
      "Folded into the unreleased 2.2.0: `page.estate` gains What agents did under its fold, an agents block over the log narrowed to services, first three a run; a block added, nothing taken away, no id added or taken away -> c1fcbf2f04e75a76",
    ],
  },
  /** A VERSION AND NOT A RESET: estate 2.2.0 is on `origin/master`. */
  'estate@2.3.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
      page.service
    `,
    declares: 'a750322603e54cc6',
    history: [
      'Estate 2.3.0 (things, not rows, 24 October): `page.service` is declared, a page for each service, a template with no nav and fleeting, drawing its own row by `seq is {{seq}}` and a line to its keys in the Vault; the project it is for stays on the row screen -> a750322603e54cc6',
    ],
  },
  /* SERVICES NAMES WHAT IS LAPSING. 2.3.0 is master's, so a version of its own. One block
     for another and no id added or taken away. */
  'estate@2.4.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
      page.service
    `,
    declares: '5b92d466b63000d2',
    history: [
      "Estate 2.4.0: `page.estate`'s At a glance, Renews in 30 days and Lapsing as two numbers, gives way to Lapsing, a table of each service that is lapsing by its name, who it is with and the day it was due, drawn only while `lapsing` holds one; one block for another, no id added or taken away -> 5b92d466b63000d2",
    ],
  },
  /* VAULT IS NOW KEYCHAIN: 2.4.0 IS MASTER'S, so a version of its own. A link's words and address, no id added. */
  'estate@2.5.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
      page.service
    `,
    declares: '54f54c1bd0495d00',
    history: [
      "Estate 2.5.0 (Vault is now Keychain): the Keys block of `page.service` says Keychain and links /keychain; a link's words and address, no id added or taken away -> 54f54c1bd0495d00",
    ],
  },
  /* ONE NAME FOR THE SERVICES PAGE, AND WHY EACH LAPSES. 2.5.0 IS MASTER'S, so a version of its own. */
  'estate@2.6.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate page.service
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: '34d56a965d9c4cdf',
    history: [
      "Estate 2.6.0 (Q50 of 29 October): `page.estate` is titled Services as the bar says it, and its Lapsing table says the day each lapses and why, from the row's note; no id added or taken away -> 34d56a965d9c4cdf",
    ],
  },
  'estate@2.6.1': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate page.service
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: 'f0fd333b99e642ce',
    history: [
      'Estate 2.6.1 of 30 October (audit 2, B14): `rule.renew-soon` asks only about a service that costs more than nothing, and `rule.renewal-kept` and `rule.renewal-cancelled` are named for what they do, since the answers read them as their reasons; no id added or taken away -> 33693ab8adbbf728',
      'Estate 2.6.1, folded before it shipped (audit 6g, AG3): the notes `rule.renewal-kept` and `rule.renewal-cancelled` leave say Needs you, the place, where they said Decide; no id added or taken away -> f0fd333b99e642ce',
    ],
  },
  /** A VERSION AND NOT A RESET: estate's last version is on `origin/master`. */
  'estate@2.7.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate page.service
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: 'b6f775cbf9e609dd',
    history: [
      'Estate 2.7.0 of 1 November (lists review, L36): `metric.points-nowhere` counts domains only, `page.estate` names each domain that points at nothing in a table where a note said "something", and its Next ninety days says each renewal\'s cost where it said who it is with; no id added or taken away -> ebb6356be5fc129c',
      'Estate 2.7.0, folded before it shipped (lists review, L28): `page.service` leads with what the next renewal takes, labelled so, and a service with no cost written draws no figure; no id added or taken away -> b6f775cbf9e609dd',
    ],
  },
  /** A VERSION AND NOT A RESET: work's last version is on `origin/master`. */
  'work@1.11.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-in-review metric.project-open metric.tasks-after-week-yours metric.tasks-done-7d metric.tasks-done-7d-agents
      metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later
      metric.tasks-not-this-week metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-week-yours metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: 'f4bd85839419fa6a',
    history: [
      "`page.work` is calmer and filters by project: Open goes from the figures, being the line's own first figure, how fast work moves and what was done are folded under Done lately, the bands under Not this week are drawn only while they hold a task over the new `tasks-after-week-yours`, `tasks-undated-yours` and `tasks-not-this-week`, and a strip of the tasks' projects narrows every band (`filters:` on `thing`); `page.work-board`'s table is drawn only while something is open -> f4bd85839419fa6a",
    ],
  },
  /** A VERSION AND NOT A RESET: work 1.11.0 is live. */
  'work@1.12.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-open metric.tasks-after-week-yours metric.tasks-done-7d
      metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-late-yours
      metric.tasks-later metric.tasks-not-this-week metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '90b06daec659222e',
    history: [
      "`page.work` draws Today the whole width and Late and This week half each beside one another under it, and Done lately wears `check`, a glyph a folded heading draws; the new `project-held-up` counts what on a project is handed back or blocked, so the project page draws that tile only while it lists a task -> 90b06daec659222e",
    ],
  },
  'work@1.13.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-open metric.tasks-after-week-yours metric.tasks-done-7d
      metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-late-yours
      metric.tasks-later metric.tasks-not-this-week metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '9e1faaf8dfe81776',
    history: [
      "`page.work`'s line names the task late longest (`tasks-late-yours.first`) and how many more, and is the counts only when nothing is late -> 9e1faaf8dfe81776",
    ],
  },
  'people@2.0.0': {
    holds: ` page.people register.people `,
    declares: 'a197d208773e19c1',
    history: [
      'Raised a major step because `register.people` stops offering `registrar` on `role`; a record whose rows hold it keeps it as its own value -> a197d208773e19c1',
    ],
  },
  'people@2.1.0': {
    holds: ` page.people register.people `,
    declares: '36fef157b524227d',
    history: [
      '`register.people` declares `meets:`, naming the field that plays each part, so the kernel reads the list meet writes off the list instead of finding one called people -> 36fef157b524227d',
    ],
  },
  'people@2.2.0': {
    holds: ` page.people page.someone register.people `,
    declares: 'dc4d1d8e39453316',
    history: [
      'One page per person (`page.someone`), with who they are, the projects they were met in and what is written about them; People\'s own page is placed under a People section and its cards leave out the agent\'s met lines; and a person that other rows still name is not deleted -> dc4d1d8e39453316',
    ],
  },
  'people@2.3.0': {
    holds: ` page.people page.someone register.people rule.meet-senders `,
    declares: 'fd9751362adfd6e0',
    history: [
      '`rule.meet-senders` meets whoever a mail arrives from, on by default; `page.someone` draws the person\'s `met` lines, which `page.people`\'s cards still leave out -> bf5edef4966a36eb',
      'The `met` lines move off the cards block, which takes at most three facts and already has `role`, `projects` and `email`, onto their own `note` block on `page.someone` -> fd9751362adfd6e0',
    ],
  },
  'people@2.3.1': {
    holds: ` page.people page.someone register.people rule.meet-senders `,
    declares: 'fd9751362adfd6e0',
    history: ['Nothing new is declared: the step lets a record whose links were left out when a use case installed it take the update, which puts the `projects` of `register.people` back -> fd9751362adfd6e0'],
  },
  'people@2.4.0': {
    holds: `
      metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-quiet
      page.people page.someone
      register.people
      rule.meet-senders
    `,
    declares: '1dbd61f8aaef95cc',
    history: [
      "`register.people` gains `in_touch`, the last day someone was in touch, and four figures read it; `page.people` opens on one line said from `people-count`, `people-in-touch-30d` and `people-quiet`, draws those days as a chart, lists everyone the latest first and wears a glyph on every heading, and `page.someone` leads with the person -> 858ae04a5cc16b2f",
      "`register.people` names `in_touch` in its `meets:`, so `meet` moves Last in touch to the day of the line it writes, now that the kernel reads that part -> 1dbd61f8aaef95cc",
    ],
  },
  'people@2.5.0': {
    holds: `
      metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-quiet
      page.people page.someone
      register.people
      rule.meet-senders
    `,
    declares: '8d5e640aac89fdd2',
    history: [
      "`page.people`'s In touch, 12 weeks heat block is drawn a line a person, `people: true` over columns `in_touch` then `name`, in place of a grid of days that never said who -> 8d5e640aac89fdd2",
    ],
  },
  /** A VERSION AND NOT A RESET: people 2.5.0 is live. */
  'people@2.6.0': {
    holds: `
      metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-quiet
      page.people page.someone
      register.people
      rule.meet-senders
    `,
    declares: '4fe7401face265f2',
    history: [
      "`page.people`'s In touch, 12 weeks says its form as `who: true` where 2.5.0 wrote `people: true`, the same line a person -> 4fe7401face265f2",
    ],
  },
  'people@2.7.0': {
    holds: `
      metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-quiet
      page.people page.someone
      register.people
      rule.meet-senders
    `,
    declares: '147b71896720725e',
    history: [
      "`page.people`'s line names who has gone quiet and since when (`people-quiet.first`, `.since`), and is the counts only when nobody is quiet -> 147b71896720725e",
    ],
  },
  'estate@1.1.0': {
    holds: `
      metric.estate-year metric.lapsing metric.points-nowhere metric.project-cost metric.renews-30d
      page.estate register.services
    `,
    declares: '90cc384470cccf30',
    history: ['An imported domain arrives with what the source did not know left blank, so `services` requires neither a renewal day nor a cost -> 90cc384470cccf30'],
  },
  'estate@1.2.0': {
    holds: `
      metric.estate-year metric.lapsing metric.points-nowhere metric.project-cost metric.renews-30d
      page.estate
      register.services
    `,
    declares: 'd7e0189d652eca6f',
    history: ['A domain carries the reason it is held, so `services` gains a text `note` and the import stops leaving every domain note in the export -> d7e0189d652eca6f'],
  },
  'estate@1.3.0': {
    holds: `
      metric.estate-year metric.lapsing metric.points-nowhere metric.project-cost metric.renews-30d
      page.estate
      register.services
    `,
    declares: '0983c05a00b9d1a2',
    history: ['`services` says a row holds who it is with where it said a registrar, which is what a domain is held with and not what hosting or a subscription is -> 0983c05a00b9d1a2'],
  },
  'estate@2.0.0': {
    holds: `
      metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d
      page.estate
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing
      setting.most_renewing_30d
    `,
    declares: '04aad1e9a082907a',
    history: [
      'Raised a major step because a rule now moves a live `services` row past its renewal day to lapsing and one asks before each renewal, four types join, every target becomes a setting with no default, and Services leads with what a month costs -> 04aad1e9a082907a',
    ],
  },
  /* THE PAGES THAT SAY ONLY WHAT IS TRUE OF THE RECORD ("Stop the harm"): each module's last version is
     on `origin/master`, so these are versions and not resets. Each is current once `FIRST_PARTY_VERSIONS` names it. */
  'portfolio@1.13.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane
      metric.projects-earning metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said
      metric.projects-live metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play
      metric.projects-on-track metric.projects-parked metric.projects-past-aim metric.projects-retired
      metric.projects-with-agent page.portfolio register.things rule.project-past-aim
    `,
    declares: '7a5e7599478b0e69',
    history: [
      "`page.portfolio` says what is empty in its line alone: with nothing in play a third line says so and how to start, where the second said every project in play was on track, In play is drawn only while it holds one (`projects-live`), no other block says it is empty, and Parked and finished reads one project for the count it draws -> 6bebd4ed6f6dbaaf",
      "`page.portfolio`'s line for nothing in play comes first of the three, so the nightly line is never written for the one saying nothing needs you across 0 projects and drawn over it -> 7a5e7599478b0e69",
    ],
  },
  'money-core@3.8.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.leaving-30d metric.net-by-month metric.out-30d metric.out-by-month
      metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you metric.project-in-by-month
      metric.project-in-month metric.project-kept-month metric.project-out-by-month metric.project-out-month
      metric.project-owed metric.received-30d metric.runway-days metric.spent-30d metric.spent-by-category-month
      metric.txn-uncategorised page.money page.money-book register.accounts register.balances register.books
      register.categories register.fx register.installments register.obligations register.recurring register.snapshots
      register.transactions rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late
      rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.txn-categorise setting.home_currency
      setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you
      setting.most_owed_to_you setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '91711ddc6ac8fb8f',
    history: [
      "`page.money`'s Accounts is drawn only while there is cash to cut, where a record whose accounts all stood at nought drew a track of its own saying so, and `page.money-book`'s Where this month's money went only while something left the book this month, over the new `book-spent-month` -> 91711ddc6ac8fb8f",
    ],
  },
  'money-core@3.9.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-out metric.in-30d metric.in-by-month metric.in-due-by-month metric.installments-due-30d
      metric.installments-left metric.late-in metric.leaving-30d metric.net-by-month metric.out-30d metric.out-by-month
      metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you metric.project-in-by-month
      metric.project-in-month metric.project-kept-month metric.project-out-by-month metric.project-out-month
      metric.project-owed metric.received-30d metric.runway-days metric.spent-30d metric.spent-by-category-month
      metric.txn-uncategorised page.money page.money-book register.accounts register.balances register.books
      register.categories register.fx register.installments register.obligations register.recurring register.snapshots
      register.transactions rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late
      rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.txn-categorise setting.home_currency
      setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you
      setting.most_owed_to_you setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: 'c0965e05d708483d',
    history: [
      "`page.money`'s and `page.money-book`'s Cash ahead offer 90, 180, 365 and 730 days, where 1825 and `last` made every load of Money walk at least five years for a chart that opens on three months -> c0965e05d708483d",
    ],
  },
  /* THE UNDERSTANDING LAYER (batch 17): each module's last version is live, so these are versions
     and not resets. */
  'portfolio@1.14.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '51a2d8569a7b35e3',
    history: ["`register.things` gains `domains`, the domains a project lives at, so a mail or a renewal naming one is read as about it -> 51a2d8569a7b35e3"],
  },
  /** A MAJOR STEP: the organisations move here from Founder without its `country`, `currency` and `accounts`. */
  'people@3.0.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: 'd6246046a52dcc45',
    history: [
      "`register.organisations` moves here from Founder under its id and declares `org:`, with `page.relation` a page each; `register.people` names `keys`, `org`, `self` and `aliases` in `meets:`; `page.someone` lists the keys and where a person was seen; `rule.meet-senders` meets the parsed address and `rule.meet-sender-organisations` the organisation behind a claimed mail -> ad6105a9acea6d51",
      "`page.someone` no longer draws Known by, which printed each key as `kind:value` joined by commas -> 3409c19c5f73a2be",
      "`rule.meet-payees` meets the payee a bank door read as an organisation by its `bank:` key, off the arrival, so a held charge meets it too -> d92d98f8624d5db7",
      "`rule.meet-payees` meets nobody for a payee written as an address, an InstaPay sender's `name@instapay` -> 3178b75f133dbcaf",
      "`rule.meet-senders` keeps an unclaimed mail's sender as a name and where it came from and writes no person, `rule.meet-sender-organisations` passes over a public mail host, both say where as the domain and never the subject, and `page.people`'s Everyone groups people by organisation, three a group; `page.relation`'s projects and money are drawn only where the record holds those lists, so they reach no record's copy without them -> 963caa7eb2eb1223",
      "`page.relation`'s lead card no longer says its projects, which are the list under it -> 4fc794e6106950fd",
      "`page.people`'s Everyone leaves out a person folded into another (`merged_into is empty`), as its Organisations does -> aff705f34dee2b67",
      "`rule.meet-senders` hands `meet` the sender's address under `only: 'known'`, so a sender whose address is already somebody's, whose domain is an organisation the record holds, or whom the owner has written to is met as a person, and anybody else is still a mention -> d6246046a52dcc45",
    ],
  },
  /** A MINOR STEP THOUGH `party` POINTS ELSEWHERE: `FIRST_PARTY_VERSIONS`' note says why. */
  'money-core@3.10.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '23feae99ca56ae69',
    history: [
      "`register.transactions` names an organisation in `party`, where it named a person, and gains `counterparty_text`, the payee as the bank wrote it, which every bank door writes -> dd5115760bcaef7b",
      "`page.money`'s and `page.money-book`'s Cash ahead offer 1825 and `last` again, since a load walks two years at most and a longer length only when a reader picks it -> 23feae99ca56ae69",
    ],
  },
  'work@1.14.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-open metric.tasks-after-week-yours
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later metric.tasks-not-this-week
      metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-week-yours metric.tasks-with-agents page.work page.work-board register.tasks register.tracks
      register.updates rule.close_follow_ups rule.start_with_parent script.close_follow_ups script.start_with_parent
    `,
    declares: '76e5fcf955e52544',
    history: [
      "`page.work` and `page.work-board` say an empty list in one line, Nothing is open right now, where every band said it in its own words and a list with nothing in it read eight tiles of white, and no band says it is empty -> 0e72d1cbeb5b5970",
      'Nothing is open right now comes first of the lines on `page.work` and `page.work-board`, so the nightly line is never written for the counts at nought and drawn over it -> 76e5fcf955e52544',
    ],
  },
  /* THE PICTURE FIRST (the design review's fixes 3 and 8): each module's last version is live, so these
     are versions and not resets. */
  'money-core@3.11.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '81b9a70d88638dbe',
    history: [
      "`page.money` opens on Cash ahead with a side column beside it, `runway-days` as its own Runs out tile in the danger tone where the line said it, the accounts and the questions under it; Heads up under the walk; Coming and going open as one boxed tile; the months behind and what moved folded under History -> 81b9a70d88638dbe",
    ],
  },
  'work@1.15.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-open metric.tasks-after-week-yours
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later metric.tasks-not-this-week
      metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-this-week-yours
      metric.tasks-week-yours metric.tasks-with-agents page.work page.work-board register.tasks register.tracks
      register.updates rule.close_follow_ups rule.start_with_parent script.close_follow_ups script.start_with_parent
    `,
    declares: '285a35e7197ac5cb',
    history: [
      "`page.work`'s line says counts, Late is a strip the whole width, At a glance draws `open-tasks`, `tasks-due-7d` and `tasks-done-7d` with its last seven nights, How fast it moves goes, and This week starts today over the new `tasks-this-week-yours`, a third of a row beside With an agent and Waiting on you -> 285a35e7197ac5cb",
    ],
  },
  /* RUNS OUT SAYS THE DAY: money-core 3.11.0 is live, so this is a version and not a reset. One figure gained. */
  'money-core@3.12.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runs-out-on metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: 'f7558a5590d4ee11',
    history: [
      "Runs out on `page.money` draws the new `runs-out-on`, the day the walk from `cash-now` goes under, with the days left from `runway-days` as the line under it, where it drew the count of days alone -> f7558a5590d4ee11",
    ],
  },
  /* THE SECOND DESIGN REVIEW'S FIXES IN THE DECLARATIONS (fixes 2, 3, 6, 7 and 8):
     work 1.15.0, portfolio 1.14.0, people 3.0.0 and money-core 3.12.0 are all live, so each of these is a version and
     not a reset. Three hold the ids the version before held; People gains one figure and keeps the one its chart drew
     on. `quiet-update.test.ts` rebuilds each version before from this build and holds it to the fingerprint above. */
  'work@1.16.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-open metric.tasks-after-week-yours
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later metric.tasks-not-this-week
      metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-this-week-yours
      metric.tasks-week-yours metric.tasks-with-agents page.work page.work-board register.tasks register.tracks
      register.updates rule.close_follow_ups rule.start_with_parent script.close_follow_ups script.start_with_parent
    `,
    declares: 'b27c59050f32684d',
    history: [
      "`page.work-board`'s board wears no heading and no glyph, where it said By status under a page called Board whose every column is headed by its status -> b27c59050f32684d",
    ],
  },
  'portfolio@1.15.0': {
    holds: `
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: '982f163d9d8ab76f',
    history: [
      "`page.portfolio` declares each of its two headings twice on one figure: an open tile while `projects-looked-up` or `projects-not-in-play` is four or fewer, with what agents hold and what is coming up half a row each and the parked as a table with no heading of its own, and the fold it had only past four; the open tile and the three under it declare keys of their own, so the folded ones keep the keys they had -> 982f163d9d8ab76f",
    ],
  },
  'people@3.1.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '36328d2fcaeb58f3',
    history: [
      "`page.people` draws Gone quiet, in the bad tone and on `people-quiet`, beside Last in touch, on the new `people-in-touch-90d`, two tables of a person, their organisation and the day, the one quiet longest first, where In touch, 12 weeks drew a row of dots a person; `people-in-touch-12w` stays declared -> 36328d2fcaeb58f3",
    ],
  },
  'money-core@3.13.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runs-out-on metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '2e09983b40aba73e',
    history: [
      "The walk of the next thirty days on `page.money` wears no heading and no glyph, where it said The next 30 days straight under Coming and going's own heading -> 2e09983b40aba73e",
    ],
  },
  'money-core@3.14.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runs-out-on metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '00b0aaff74dddb55',
    history: [
      "`register.accounts` labels `last4` Digits the bank prints, where it said Last four digits; the id stays -> 00b0aaff74dddb55",
    ],
  },
  'money-core@3.15.0': {
    holds: `
      metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.ledger-rows-7d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.runs-out-on metric.runway-days metric.spent-30d
      metric.spent-by-category-month metric.txn-uncategorised
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.cash-stale rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category
    `,
    declares: '4e8e4d8e76c0c89f',
    history: [
      "`ledger-rows-7d` is declared, Money's first sign of life: cleared Ledger rows dated in the last seven days, a count with a target of at least one -> 4e8e4d8e76c0c89f",
    ],
  },
  'money-core@3.16.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.categories-against-direction metric.cash-by-book metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.currencies-held
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.ledger-newest-days metric.ledger-rows-7d metric.nights-missed-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.received-7d metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d
      metric.spent-by-category-month metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise
      script.last_day
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '06d6906c4452a86e',
    history: [
      "Three more signs are declared, read by the kernel's new words: `ledger-newest-days` (age of the newest cleared row), `currencies-held` (currencies of the accounts' balances) and `uncategorised-share-30d` (money out with no category, 30 days) -> 1fdf9a3fd619ac95",
      "Folded into the unreleased 3.16.0: paydays (`recurring.day_of_month`, `recurring.weekend`, the `rest_days` setting and the leg naming both), `statement-oldest-days` (`rolled.read: age`) and `nights-missed-30d` (`series.cash-now`, once a kept line names its figure's lists) -> 978bc6c517e65459",
      "Then batch 42's step, first written as 3.17.0: a balance's age is the bank's last word: `cash-as-of` and `balances-stale` read the roll (`read: as_of`, `read: stale`), `account-ages` dates each account for the cards' `stale: { figure }`, `page.money` gains Last confirmed in Heads up, `page.money-book`'s cards read it, and `rule.cash-stale` goes; a row's currency comes from its account: `currency_from` on the Ledger's `amount`, `available` and `balance_after`, a balance check's `balance` and an instalment's `amount`, and `currency_fixed` on the Ledger's `amount` -> 2a1dd29a7593062b",
      "Folded into the one unreleased 3.16.0 (integrate 41-42): 3.17.0 above is no version of its own; a repeating line's `amount` declares `currency_from`, `day_of_month` is labelled Days of the month, and Money requires `register.balances` and draws What it holds today under Last confirmed -> a8ac310c2f6ef805",
      "Folded into the one unreleased 3.16.0 (uc6-money-47): `received-7d` (the Ledger's money in, 7 days) and `settled-in-7d` (bills and invoices paid to you, 7 days), the two halves of Today's money this week -> 4dc97ed72aa38e02",
      "Folded into the unreleased 3.16.0 (batch 48, F60): `script.last_day`, once a day, asks once in Decide whether repeating lines on the 28th to the 30th that end their month are paid on the last day or that date, and the pick writes `day_of_month` -> 913abc79c13c9220",
      "Folded into the unreleased 3.16.0 (hop-figures-50): `categories-against-direction`, live categories marked one way that a Ledger entry going the other way points at (a `pointed` hop over `transactions.category`), and `page.money` gains its Heads up line; and PGS-B06 (list-order-50): the Ledger declares its order, by day, newest first -> 06d6906c4452a86e",
    ],
  },
  'money-core@3.17.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.book-cash metric.book-spent-month metric.books-held metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.categories-against-direction metric.cash-by-book metric.cash-cross-check metric.cash-now metric.chasing metric.days-late-in metric.due-30d
      metric.currencies-held
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-due-30d metric.installments-left metric.late-in metric.leaving-30d
      metric.ledger-newest-days metric.ledger-rows-7d metric.nights-missed-30d
      metric.net-by-month metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.received-7d metric.repeating-overdue metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d
      metric.spent-by-category-month metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-book
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments register.obligations
      register.recurring register.snapshots register.transactions
      rule.installment-due-soon rule.invoice-chased rule.invoice-late rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.txn-categorise rule.payment-settles
      script.last_day script.settle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
      metric.filed-for-you-30d metric.filed-today
      metric.spent-last-month metric.spent-by-category-last-month metric.spent-by-category-to-date-last-month metric.spent-vs-last-month
      register.plans rule.part-counts-plan script.plans_from_names
      rule.plan-links-parts page.money-plan metric.plan-parts-paid metric.plan-parts metric.plan-paid metric.plan-left
      metric.plan-next-due metric.plan-last-due metric.installments-paid-by-plan metric.installments-total-by-plan
      metric.budget-passed-on metric.installments-next-due-by-plan metric.installments-left-by-plan metric.installments-after-next-by-plan
      rule.entry-takes-book rule.repeat-takes-book rule.part-takes-book script.book_from_account
      metric.book-in-month metric.book-out-month metric.book-net-month
      metric.ledger-in-no-book metric.repeating-in-no-book metric.instalments-in-no-book metric.bills-in-no-book
      metric.plan-parts-open
      metric.budgets-set rule.bill-takes-book metric.book-owed-to metric.book-owed-by
      metric.book-in-by-month metric.book-out-by-month metric.book-net-by-month
      metric.book-lasts-until
      rule.payment-matches rule.instalment-settles script.match_payment
      rule.recurring-went-through script.settle_matched_line
      metric.rule-filed metric.filed-by-rule-30d metric.rules-filing-30d metric.rules-filing page.money-rules
      rule.rule-files-back script.file_back rule.category-teaches rule.category-taught script.learn_category
      rule.payment-unsettles script.unsettle
      metric.lasts-no-income
    `,
    declares: 'b9c49eb41364b180',
    history: [
      "`cash-cross-check` is declared (cash-check-52): Cash now worked out a second way, each cash account walked entry by entry from its newest statement, less Cash now, a currency at a time; no value while no balance is typed -> 73738171ae2405ba",
      'The Money page draws the check (cash-page-54): one tile, Cash now does not add up, while `cash-cross-check` is not nought, and one line while no balance is typed -> e4a453d69795fe22',
      "Folded into the unreleased 3.17.0 (filing-list-56, REC-B10 job 3; account-state-56; integrate 56): the list Filing rules (`filing_rules`), the Ledger's `filed_by`, `pattern` on a category's How it matches, and `txn-categorise` links through the list by which way, account and on or off; an account's Status, open or closed, with closed its finished state, and the cash figures, `statement-oldest-days`, the Last confirmed cards and a book's Accounts cards leave a closed account out (`liquid is true, state is not closed`) -> f3d700ae322b0ea0",
      "Folded into the unreleased 3.17.0: a payment marks what it paid. `obligations` gains `paid_so_far`, `installments` gains `paid_by` (a link to the Ledger), `recurring` gains `last_paid` and `last_amount`, none indexed, and `transactions` declares `delete: refuse_while_referenced` so a payment an instalment names is not deleted from under it; no id added or taken away -> c238f926c22cb938",
      "Folded into the unreleased 3.17.0: `txn-categorise` files by each text in one link step that writes the rule's category and, with it, the rule into `filed_by` (`also`), so a rule whose category is retired or gone writes neither -> ccdc10025b479aee",
      "Folded into the unreleased 3.17.0 (seed-58, the look of 13 October, fault F; integrate 58): `page.money` gains a lead line for a record with two books or more, how many books and accounts the money is kept in, and loses the line for no balance typed, which was added in this same unreleased step, so the page still declares 24 blocks; no id added or taken away -> 24bb2fb8ce5c5a98",
      "Folded into the unreleased 3.17.0: the Ledger tile on Money, six newest entries open on the page before Heads up, drawn once `ledger-newest-days` has a value, and History gives up What moved, so the page still declares 24 blocks; the two late lines on Heads up say `{{bad:past their due date}}`, the same words in the danger colour; no id added or taken away -> 741a7d2695f49170",
      "Folded into the unreleased 3.17.0: a payment marks the bill it pays. `script.settle` is registered and `rule.payment-settles` starts it when a Ledger entry that names a bill in Settles has cleared, handing both by their ids, which the script now reads as well as a handle; the sum counts cleared entries alone. A rule and a script added -> 037bb14f0cdae30f",
      "Folded into the unreleased 3.17.0: the Ledger tile on Money is drawn by any entry that is not void and no longer waits on `ledger-newest-days`, and it says 'Nothing has moved yet.' where it leads a page; `transactions` pairs a move between two currencies at the rate of the day it left, within 2% (`pairs.across_currency`); `filed-for-you-30d` and `filed-today` are added, counts of the Ledger entries made by who made them, read from `events.transactions`; `metric.filed-for-you-30d` and `metric.filed-today` gained -> 6f1143a556590586",
      "Folded into the unreleased 3.17.0: a payment made void, or put back to pending, reopens the bill it had paid. `rule.payment-settles` starts on any status (`when: settles is set`), and `script.settle` counts cleared money alone, holds a pending or void payment to paying nothing, and writes a bill back to open or part paid with what its other cleared payments come to; a bill marked paid by hand, with no Paid so far, is left. One rule's `when` and one script's source changed; no id added or taken away -> 0696e982958e4019",
      "Folded into the unreleased 3.17.0, one fingerprint for five changes: four figures of this month's spending against last, `metric.spent-last-month`, `metric.spent-by-category-last-month`, `metric.spent-by-category-to-date-last-month` and `metric.spent-vs-last-month`, a difference by category against the month before (spend-figures-63); the Ledger tile reads filed-today and filed-for-you-30d in its written line, a `body` on one block of `page.money` (ledger-by-63); `metric.filed-for-you-30d` counts an agent, a bank add-on or a rule, not anything but a person, one `where` changed; and `script.settle` leaves a Paid so far somebody typed when a pending or void payment paid none of it; four ids added, none taken away -> 2c10a714a36d7c85",
      "Folded into the unreleased 3.17.0 (plans-list-66, REC-B12 jobs 1 and 2; integrate 66; commit 63423720, the deployed build, holds 3.16.0): a plan is a thing of its own. The list `register.plans` is added before Instalments, `register.installments` gains `plan_row` (Part of, a link to its plan) and `left_after` (Left after, money), `script.plans_from_names` makes one plan for each plan text, links the parts and writes what is left after each, once a day and when `rule.part-counts-plan` hands it a part made or changed -> e84778f2db7564d6",
      "Folded into the unreleased 3.17.0 (repeating-overdue-67, REC-B11 step 8; integrate 67; commit 63423720, the deployed build, holds 3.16.0): `metric.repeating-overdue`, how many live repeating lines have a Next more than three days gone; a figure added, nothing taken away -> 6811e7a441a592fa",
      "Folded into the unreleased 3.17.0, one fingerprint for four changes: the Ledger gains `payee`, a text labelled Paid to or from, searchable and not indexed, and `counterparty_text` keeps its id and is labelled As the bank wrote it (payee-field-68); the plans script never opens a closed plan and takes a plan as well as a part, and `rule.plan-links-parts` starts it when a plan is made (plans-calm-67-68); `page.money-plan`, the page of one plan, with six figures of one plan, `metric.plan-parts-paid`, `metric.plan-parts`, `metric.plan-paid`, `metric.plan-left`, `metric.plan-next-due` and `metric.plan-last-due`, and two by plan, `metric.installments-paid-by-plan` and `metric.installments-total-by-plan` (plan-page-68); and `metric.budget-passed-on`, the day a category's spending reached its budget, a running total with a stop (budget-passed-on-68); a field, a rule, a page and nine figures added, nothing taken away -> f6bc381aff1f291a",
      "Folded into the unreleased 3.17.0: `metric.repeating-overdue` counts only a line a payment was matched to before, its where gaining `last_paid is set` -> 624b3eb831b48599",
      "Folded into the unreleased 3.17.0, one fingerprint for five changes, no id added or taken away: the cash walk gains a leg of everyday spending over `transactions`, cleared and not a transfer, three full months, on `page.money`'s Cash ahead and bridge and on `metric.runway-days`, `metric.runs-out-on`, `metric.arriving-30d` and `metric.leaving-30d`; Money's Instalments tile reads each plan's paid of total from metric.installments-paid-by-plan and metric.installments-total-by-plan, in place of a count of the list's parts (instalments-tile-70); Money places This month's spending and Budgets after Instalments, and the History heading and Being chased leave the page (money-wire-70); a plan's page is led by one sentence in place of four figures (plan-lead-sentence-70); the filing rule's Reads choice `payee` is labelled As the bank wrote it, the words the Ledger uses for the field it reads, its value unchanged (filing-reads-words-70) -> 918d7eb2827cbb30",
      "Folded into the unreleased 3.17.0, one fingerprint for three changes, eleven ids added and none taken away: a thing on an account is in that account's book, `rule.entry-takes-book`, `rule.repeat-takes-book` and `rule.part-takes-book` start `script.book_from_account` when a Ledger entry, a repeating line or an instalment is written with an account and no book, and once a day the script asks one question about what an account held before it was put in a book (book-fill-71); seven figures, `metric.book-in-month`, `metric.book-out-month` and `metric.book-net-month` read once a book, and `metric.ledger-in-no-book`, `metric.repeating-in-no-book`, `metric.instalments-in-no-book` and `metric.bills-in-no-book` over the whole record (book-figures-71); and `page.money-book` gains This month, one row of book-in-month, book-out-month and book-net-month, drawn only while the book's month holds an amount (book-page-71) -> cc2fbb245bf45a53",
      "Folded into the unreleased 3.17.0, one fingerprint for three changes, two ids added and none taken away: `metric.repeating-overdue` is named Matched repeating lines past their day, since a line no payment was matched to is not counted, its id, where and value as they were; and `page.money-plan` leads a plan all paid with its own sentence, the first lead waiting on `metric.plan-parts-open` and the new one on `metric.plan-share-left`, two figures of one plan added and nothing taken away (plan-lead-all-paid-72); and `script.book_from_account`'s nightly count leaves out a void Ledger entry, an ended repeating line and an instalment not open, as the figures of what is in no book do, so the question says the page's number and File them writes on none of them -> a0efc60af881f46f",
      "Folded into the unreleased 3.17.0, one fingerprint for five changes, seven ids added and none taken away: Money declares `metric.budgets-set` itself, the count its Budgets tile waits on, which Personal 2.4.0 hands it; `rule.bill-takes-book` starts `script.book_from_account` for a bill or invoice written with an account and no book, `register.obligations` gains `account`, a link to its account, and the nightly question counts open and part-paid bills too (bill-takes-book-73); `metric.book-owed-to` and `metric.book-owed-by`, a book's open bills and invoices by the way they go, named Due to come into one book and Due to go out of one book (book-owed-figures-73); `metric.book-in-by-month`, `metric.book-out-by-month` and `metric.book-net-by-month`, thirteen months of one book, and `page.money-book` gains the row What is due and the chart In and out, by month (book-page-months-73); and the Ledger tile on `page.money` names who was paid (`payee`) and falls back to the bank's line (`or: 'what'`) (ledger-payee-73) -> 04023fea3c0b315d",
      "Folded into the unreleased 3.17.0, one fingerprint for three changes, one id taken away and none added: `page.money-plan`'s two lead sentences each wait on two counts held together (`all:` of `plan-parts` and `plan-parts-open`), so `metric.plan-share-left`, which batch 72 added inside this same unreleased step and no released version ever held, is gone; `metric.project-owed` is named Still to come in, where it said Owed to you, its id, source, where, value and target as they were (owed-words-74); and `metric.repeating-overdue` reads no value where it read nought, its value the count per the one state its lines are in, so a record whose lines were never matched is not shown a mark it met, its id, where, name and target as they were -> 14fbef1eab97533e",
      "Folded into the unreleased 3.17.0, one change, no id added or taken away: `register.obligations` gains `chase_draft`, a text labelled Draft to send, not indexed, and `rule.invoice-chased` gains a third step that writes it where it is empty, 'The invoice for {{short:amount}} was due on {{on:due}}. Could you tell me when it will be paid?', so answering Chase it leaves a message ready to send and never writes over words somebody changed (money-chase-draft-75) -> 58f8ae62408fdbb6",
      "Folded into the unreleased 3.17.0, one change, one id added and none taken away: `metric.book-lasts-until`, the day one book's money runs out, walked from book-cash:{{it}} over that book's bills, repeating lines, instalments and money on its way; `page.money-book` gains the cell Money lasts until (book-lasts-until-76). Money's seeds also carry the starter set of eight categories (ruling 341, money-starter-categories-76), which this fingerprint does not read -> 7e2c23ed9096f0f6",
      "Folded into the unreleased 3.17.0, one change, no id added or taken away: `rule.invoice-chased` holds two draft steps where it held one, whose conditions never hold together. An invoice paid in part that says what was paid is drafted for what is left, 'The invoice for {{short:amount}} was due on {{on:due}}, and {{short:amount-paid_so_far}} of it is still to pay. Could you tell me when the rest will be paid?', and every other invoice keeps batch 75's sentence, each written only where Draft to send is empty (chase-part-paid-77) -> 426776efc21d2e82",
      "Folded into the unreleased 3.17.0, one fingerprint for four changes, three ids added and none taken away: `metric.repeating-overdue` keeps live matched lines in its where (`state is live, last_paid is set`) and counts the late with past (`{ past: 'next_due', by: '3d' }`), so matched lines and none late reads 0 and met, and no matched line still reads no value (repeating-overdue-past-78, signs-metric-75-76#1); `page.money` opens on three lead notes where it held two, the line of what there is now waiting on `runway-days` not carrying beyond and the same line ending 'and on what is due it lasts the year.' drawn while it does, and Heads up gives up its note on `categories-against-direction`, whose figure stays declared, so the page still declares 24 blocks (money-lasts-line-78); `page.money-book` gains one note under What is due, 'Its money lasts the year on what is due.', drawn on book-lasts-until carrying beyond (book-lasts-year-78); and a cleared Ledger entry with nothing in Settles finds what it paid, `script.match_payment` started by `rule.payment-matches` on a write to its status or Settles, writing Settles for a bill or Paid by on an instalment, with `rule.instalment-settles` running `settle` once an instalment names its payment (match-payment-78), and the rule hands `asks: 'linked'`, so several things that fit with a repeating line among them is no question, since an answer naming a line would link nothing; `rule.payment-matches`, `rule.instalment-settles` and `script.match_payment` gained -> a133f3e25555de89",
      'Folded into the unreleased 3.17.0: `rule.payment-matches` gains a second step that starts `script.settle_matched_line`, which marks the repeating line a payment paid; one id added and none taken away -> 990763af3a240bcb',
      "Folded into the unreleased 3.17.0, one fingerprint for two changes, one id taken away from an unreleased version and none added: `script.match_payment` catches a fold its host refuses and compares every name plainly for that payment, saying so in its log, where the run failed whole (fold-fallback-82); and `rule.payment-matches` is one step again and `script.settle_matched_line`, which batch 80 added inside this same unreleased step and no released version ever held, is held out of the pack, since it kept a payment on a line whose Next it could not move (repeat-next-80b-82) -> 62831e8550843210",
      "Folded into the unreleased 3.17.0, one fingerprint for two changes, ten ids added and none taken away: the page Filing rules under Money, `page.money-rules`, each rule, how many entries it filed and what it filed lately, over four counts of the Ledger by `filed_by`, `metric.rule-filed`, `metric.filed-by-rule-30d`, `metric.rules-filing-30d` and `metric.rules-filing` (filing-rules-page-91); and a filing rule made, or its text, way of matching, what it reads, way, category, account or status changed while it is on, starts `script.file_back` through `rule.rule-files-back`, which files the Ledger entries of the last 400 days with no category by the category rule's ladder in one batch; a category set by hand on an entry with bank text and no Filed by starts `script.learn_category` through `rule.category-teaches`, which asks once a payee, and `rule.category-taught` runs it again on Yes to make the filing rule; three rules and two scripts added (filing-learns-91) -> b664b1f848d24aa8",
      "Folded into the unreleased 3.17.0, one fingerprint for two changes, two ids added and none taken away: `page.money` takes the walk of the next thirty days off Coming and going, places Every month, what comes in and goes out every month over `metric.every-month-in` and `metric.every-month-out`, after In and out, by month, and that chart reads six months back where it read twelve (money-every-month-92); and a Ledger entry deleted with something in Settles starts `script.unsettle` through `rule.payment-unsettles`, which recounts the bill without it, so a bill it paid reads open again, part paid, or paid by what is left (unsettle-92) -> 432db247bdb67186",
      "Folded into the unreleased 3.17.0, one fingerprint for two changes, one id added and none taken away: `metric.lasts-no-income`, the days Cash now lasts over the walk's legs that take money off, five years at the longest, and Money's three lead notes each end on it as a clause of their own (money-lasts-no-income-95); and `page.money` takes Waiting on you out of the side column, the questions being Decide's, and places Every month, by category, the bar over `metric.every-month-by-category`, straight after Every month in its block, so the page still declares 24 blocks (money-board-place-95) -> aad901acf80b6e8a",
      "Folded into the unreleased 3.17.0: `page.money-book` opens, while a live category is marked the other way from how the Ledger books it, on one line saying how many over `categories-against-direction` with a link to Categories -> bb886a37434f889a",
      "Folded into the unreleased 3.17.0, one fingerprint for four changes, two ids added and none taken away: the side column's tile is Lasts, calm, drawn while there is an account and Cash now is at or above nought, and Runs out, in the danger colour while Cash now is under nought, is declared and not placed yet (money-lasts-tile-100); `page.money`'s and `page.money-book`'s Cash ahead open on ten weeks, `horizon: 70`, offer `horizons: [70, 90, 180, 365, 730, 1825, last]` and declare `axis: fit`, and a book's empty line says Nothing in {{name}} is dated ahead yet. (money-ten-weeks-100); `page.money` ends on Where it went, a folded heading over the split This month, by category (`spent-by-category-month`, unset No category yet) and the bar No category yet, by who was paid (Ledger entries going out with no category in the last 91 days by `payee`, eight bars, drawn while `txn-uncategorised` is more than nought), and gives up This month's spending, Budgets and Last confirmed, which stay declared in their files, so the page still declares 24 blocks (money-where-it-went-100); and `script.settle_matched_line` is back as payment-matches' second step, moving a repeating line's Next by the host's ctx.cycle, and `rule.recurring-went-through` moves Next on when 'It went through' is pressed; settle gains quiet and told (money-next-moves-100) -> e217149ab3abd4e8",
      "Inside the unreleased 3.17.0: `page.money` says its place on the rail, `nav.place` 40, lowest first; no id added or taken away -> db5273f19a418802",
      "Inside the unreleased 3.17.0 (money-days-word): `page.money`'s first line says days after the count of how long the cash lasts with no income, `day(s)`; no id added or taken away -> ce04c1a199af2266",
      "Inside the unreleased 3.17.0 (batch 6, the look of Money): `page.money`'s Ledger line says the day's count alone, `{{filed-today}} filed today.`, where it said it beside a second count of 30 days that read as a contradiction; no id added or taken away -> 432c185b62df186d",
      "Inside the unreleased 3.17.0: `page.money`'s Lasts tile says two cells, With what is due over `runs-out-on` and If nothing comes in over `lasts-no-income`, and the three lead notes no longer end on how long the cash lasts with no income; Heads up's two late lines say `{{bad:late}}` where they said past their due date, and drop still; no id added or taken away -> 66a1947e5a2f77ab",
      "Inside the unreleased 3.17.0: Instalments says what is next under each bar, 'Next £1,875 on 3 Sep', from three figures by plan after its two counts, `metric.installments-next-due-by-plan`, `metric.installments-left-by-plan` and `metric.installments-after-next-by-plan`; and Coming and going's calendar of what falls due names a third column, `amount`, so each line says its figure; three ids added and none taken away -> 7b5fd9f2a5b81a29",
      "Inside the unreleased 3.17.0: `page.money`'s Heads up stands in the side column, its lines ending on See them and Update balances, and the box that took today's balance is off the page, so Runs out is placed beside Lasts; the line says `{{cash-now.moved}}`, and the calendar's amount is signed by `direction`; no id added or taken away -> 8b74fe451270a7dc",
      "Inside the unreleased 3.17.0: `register.obligations` says one of it as `bill or invoice`, where it said `item`, so its button says Add a bill or invoice; no id added or taken away -> b9c49eb41364b180",
    ],
  },
  'money-core@3.18.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.filed-by-rule-30d
      metric.filed-for-you-30d metric.filed-today metric.in-30d metric.in-by-month metric.in-due-by-month
      metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late metric.installments-left
      metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income metric.late-in metric.leaving-30d
      metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month metric.nights-missed-30d
      metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you
      metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts metric.plan-parts-open
      metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.received-7d metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month metric.spent-by-category-month
      metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month metric.statement-oldest-days
      metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-takes-book rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon
      rule.instalment-settles rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payment-matches
      rule.payment-settles rule.payment-unsettles rule.plan-links-parts rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.file_back script.last_day script.learn_category script.match_payment script.plans_from_names
      script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '0f876e822683705b',
    history: [
      "Money 3.18.0: `installments-late` is declared, the parts still open past their day going out, and `page.money` names its first row after the money in the line, says `cash-now` in the line for two books, and says the part first in Heads up's line of bills late -> 0f876e822683705b",
    ],
  },
  /** A VERSION AND NOT A RESET: money-core 3.18.0 is on `origin/master`. */
  'money-core@3.19.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-out metric.filed-by-rule-30d
      metric.filed-for-you-30d metric.filed-today metric.in-30d metric.in-by-month metric.in-due-by-month
      metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late metric.installments-left
      metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income metric.late-in metric.leaving-30d
      metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month metric.nights-missed-30d
      metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you
      metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts metric.plan-parts-open
      metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.received-7d metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month metric.spent-by-category-month
      metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month metric.statement-oldest-days
      metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-takes-book rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon
      rule.instalment-settles rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payment-matches
      rule.payment-settles rule.payment-unsettles rule.plan-links-parts rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.file_back script.last_day script.learn_category script.match_payment script.plans_from_names
      script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
      page.money-account page.money-bill
    `,
    declares: '4e14ca35e97a9289',
    history: [
      'Money 3.19.0 (things, not rows, 24 October): `page.money-account` and `page.money-bill` are declared, a page for each account and each bill or invoice, templates with no nav and fleeting, each drawing its own row by `seq is {{seq}}` -> 4e14ca35e97a9289',
    ],
  },
  /** A VERSION AND NOT A RESET: money-core 3.19.0 is on master. */
  'money-core@3.20.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'e6838ed287542b79',
    history: [
      "Money 3.20.0 (the scope of 24 October, B6, B8, B24): `rule.bill-moves-line` and `script.move_line` ask once to move a paid bill's twin repeating line on, and `script.match_payment` links the bill where a bill and a line share a name; `register.accounts` gains `limit`, `to_pay` and `to_pay_on`, `rule.card-text-owes`, `rule.card-limit-owes` and `script.card_owed` work out what is to pay on a card, `metric.card-to-pay` and `metric.card-to-pay-on` read it, and `page.money`'s lines say it; `page.money-rules` says the entries with no category with File old entries -> 51dc5d1980e22138",
      "Money 3.20.0: `rule.card-limit-owes` drops its `when`, which a record updating from before Accounts had `limit` refuses to plan, so `script.card_owed` alone says which card it works on -> e6838ed287542b79",
    ],
  },
  /** A VERSION AND NOT A RESET: money-core 3.20.0 is on master. */
  'money-core@3.21.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '807ea2251afa9f0b',
    history: [
      "Money 3.21.0: the calendar of what falls due on `page.money` drops its heading and glyph, since it opens Coming and going and two headings stood one over the other -> 5c7ddf99a61e3883",
      "Money 3.21.0: that calendar reads `source: deadlines` with money on it over the next thirty days, as Today's Due soon reads, where it read `register.obligations` alone, and is drawn once there is an account (`cash-accounts`) -> 807ea2251afa9f0b",
    ],
  },
  /** A VERSION AND NOT A RESET: money-core 3.21.0 is on master. */
  'money-core@3.22.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'f5c01b00701245fa',
    history: [
      "Money 3.22.0: `script.plans_from_names` matches a plan's name whatever its capitals, accents and spaces, and asks once about two plans of one name written two ways; `register.plans` gains `one_with` (Made one with), which his yes sets on the second plan, and `rule.plan-made-one` moves that plan's parts to the first -> f5c01b00701245fa",
    ],
  },
  'money-core@3.23.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '5d27fc8216cde28e',
    history: [
      "Money 3.23.0 (the look of 25 October): `page.money`'s Lasts tile labels its two cells plainly, With what is due and expected and If nothing more comes in, so the day it lasts past and the days with nothing coming in no longer read as a contradiction; words only, no id added or taken away -> 5d27fc8216cde28e",
    ],
  },
  /* THE LOOK OF 26 OCTOBER: 3.23.0 IS MASTER'S, so a version of its own. One number changed, no id added. */
  'money-core@3.24.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '68015e24280a4682',
    history: [
      "Money 3.24.0 (the look of 26 October, R4): `page.money`'s Accounts split lists up to twelve accounts, where it listed six beside a line that counted seven; no id added or taken away -> 68015e24280a4682",
    ],
  },
  /* A SCRIPT'S TEXT THAT CALLED A NAME THE BUNDLE HAD CHANGED: 3.24.0 IS MASTER'S, so a version of its own. No id added. */
  'money-core@3.25.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'e10d27debb84d30a',
    history: [
      "Money 3.25.0: `script.settle_matched_line` binds `settle` by name in its own text, so a bundle that renamed the function it took no longer leaves the step calling a name it never defined; no id added or taken away -> e10d27debb84d30a",
    ],
  },
  'money-core@3.26.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '444d3b6dabd36087',
    history: [
      "Money 3.26.0: `script.book_from_account`'s nightly File them carries at most 200 changes, the most one option may carry, where it asked for 900 and every run over 200 entries in no book was refused; no id added or taken away -> 444d3b6dabd36087",
    ],
  },
  'money-core@3.27.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'f622b9b3dad561d4',
    history: [
      "Money 3.27.0: `page.money`'s In and out, by month reads its months ahead off `metric.in-ahead-by-month` and `metric.out-ahead-by-month`, the walk Cash ahead draws, and Cash ahead on `page.money` and `page.money-book` opens on twelve weeks -> 74076d8938aa73b8",
      "Money 3.27.0: Lasts on `page.money` is how long `metric.lasts-no-income` lasts with a sentence of the day it ends on and what falls due then, and the day `metric.runs-out-on` names only while there is one -> b8350a22f5adb3fc",
      "Money 3.27.0: `page.money`'s first line says Cash now in each currency apart and about what that comes to at the day's rate, over the accounts `metric.cash-by-account` lists -> ef720f5f29513147",
      "Money 3.27.0: Every month on `page.money` says `metric.leaving-30d`, what goes out in the next thirty days as Today says it, beside the two repeating figures -> f622b9b3dad561d4",
    ],
  },
  'money-core@3.27.1': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '85dab58aa5bbfc4c',
    history: [
      "Money 3.27.1: `script.book_from_account` and `script.plans_from_names` read each list in row number order, so a list that is not in that order no longer loses rows between pages -> 85dab58aa5bbfc4c",
    ],
  },
  'money-core@3.28.0': {
    holds: `
      metric.account-ages metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-set metric.card-to-pay metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account
      metric.cash-by-book metric.cash-cross-check metric.cash-now metric.categories-against-direction metric.chasing
      metric.currencies-held metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category
      metric.every-month-in metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.lasts-no-income
      metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.net-by-month
      metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-to-you metric.plan-last-due metric.plan-left metric.plan-next-due metric.plan-paid metric.plan-parts
      metric.plan-parts-open metric.plan-parts-paid metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-last-month metric.spent-vs-last-month
      metric.statement-oldest-days metric.txn-uncategorised metric.uncategorised-share-30d
      page.money page.money-account page.money-bill page.money-book page.money-plan page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '400ef4c47b65f74e',
    history: [
      "Money 3.28.0: `script.settle_matched_line` may write Bills and invoices, and \"It went through\" marks the one open bill for the line's money paid; no id added or taken away -> 400ef4c47b65f74e",
    ],
  },
  'money-core@3.29.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash
      metric.book-in-by-month metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month
      metric.book-out-by-month metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held
      metric.budget-passed-on metric.budgets-set metric.budgets-total metric.budgets-unset metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check metric.cash-foreign-share metric.cash-now
      metric.categories-against-direction metric.chasing metric.currencies-held metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-net metric.every-month-out metric.filed-by-rule-30d
      metric.filed-for-you-30d metric.filed-today metric.in-30d metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month
      metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late metric.installments-left
      metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in
      metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month
      metric.lines-by-account metric.net-by-month metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month
      metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you metric.paid-last-by-payee
      metric.paid-times-by-payee-90d metric.payees-paid-90d metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid metric.plan-paid-by-quarter
      metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open metric.plan-parts-paid
      metric.plan-parts-paid-by-plan metric.project-in-by-month
      metric.project-in-month metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed
      metric.received-30d metric.received-7d metric.received-month metric.repeating-in-no-book metric.repeating-overdue
      metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days metric.settled-in-7d
      metric.spent-30d metric.spent-by-category-last-month metric.spent-by-category-month metric.spent-by-category-to-date-last-month
      metric.spent-last-month metric.spent-vs-last-month metric.statement-oldest-days metric.txn-uncategorised
      metric.uncategorised-share-30d metric.unfiled-month metric.unfiled-spent-month
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes rule.category-taught rule.category-teaches
      rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late
      rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.file_back script.last_day script.learn_category script.match_payment
      script.move_line script.offer_budgets script.plans_from_names script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '6fb3fb928ab872c6',
    history: [
      'Money 3.29.0: Money is a section, with `page.money-accounts`, `page.money-ledger`, `page.money-budgets`, `page.money-coming`, `page.money-forecast`, `page.money-reports` and `page.money-payees` under it, each its line alone, and `register.categories` gains `icon`, `colour`, `budget_alert`, `rollover` and `parent` -> cd223ca9d727a38b',
      'Money 3.29.0, the rest of the section: the home leads with one hero and Coming up, the pages are filled, `script.offer_budgets` offers budgets from last month, and `metric.payees-paid-90d`, `metric.account-now` and the other figures the pages read come with it, and Coming up and Forecast draw each list the whole row -> c39958b1099af6a1',
      'Money 3.29.0, polish: Coming up adds what is left every month (`metric.every-month-net`), the home goes red under nothing and says how old its rate is -> 9f6db23eb5f872a2',
      'Money 3.29.0 takes 3.27.1 in: `script.book_from_account` and `script.plans_from_names` read each list in row number order -> fc0797c342345df5',
      'Money 3.29.0, a plan\'s page laid out as Property\'s: where it stands with what is late, one track with the next part under it as Money\'s Instalments tile draws it (five figures of one plan by plan, `metric.plan-parts-paid-by-plan` to `metric.plan-after-next-by-plan`), what was paid in all by each quarter (`metric.plan-paid-by-quarter`, a running line), the next six parts to tick and the parts paid, the rest folded; `metric.plan-late` and `metric.plan-parts-cancelled` added -> cba568698b10ef25',
      'Money 3.29.0, warnings and health: `script.budget_watch` marks a category near or over its budget each month and `rule.budget-near` and `rule.budget-over` say so once, `register.categories` gains `budget_warned` and `warned_month`, and `metric.cash-foreign-share` says how much of Cash now is in other currencies -> c1744441b38109d0',
      'Money 3.29.0, the plan page and the warnings together: `metric.cash-foreign-share` now sits before the plan page figures -> d0a54b82ff5bdaa6',
      'Money 3.29.0, splits: `register.transactions` gains `parts`, one entry split across categories, and what is not filed yet leaves a split entry out -> 56aa38c98745be9d',
      'Money 3.29.0, splits beside the plan page and the warnings: `register.transactions` keeps `parts` -> d2c62503b2757e55',
      'Money 3.29.0, the look: `page.money` draws Accounts a bar a row and Spent this month as the month itself, and `page.money-accounts`, `page.money-budgets`, `page.money-reports`, `page.money-forecast` and `page.money-payees` say plainer notes -> 106013d1342fa382',
      'Money 3.29.0, Where it went: `page.money-reports` ends on the folded Where it went, this month by category and who was paid in what nobody has filed -> 636974d32e90e451',
      'Money 3.29.0, words: `script.book_from_account`, `script.close_account`, `script.file_back`, `script.last_day`, `script.learn_category`, `script.match_payment`, `script.plans_from_names`, `script.settle` and `script.unsettle` say their reasons plainly in their notes -> 6fb3fb928ab872c6',
    ],
  },
  'money-core@3.29.1': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash
      metric.book-in-by-month metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month
      metric.book-out-by-month metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held
      metric.budget-passed-on metric.budgets-set metric.budgets-total metric.budgets-unset metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan
      metric.installments-due-30d metric.installments-late metric.installments-left metric.installments-left-by-plan
      metric.installments-next-due-by-plan metric.installments-paid-by-plan metric.installments-total-by-plan
      metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in metric.leaving-30d
      metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month metric.lines-by-account
      metric.net-by-month metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month metric.out-by-month
      metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you metric.paid-last-by-payee
      metric.paid-times-by-payee-90d metric.payees-paid-90d metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-month metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed
      metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d
      metric.spent-by-category-last-month metric.spent-by-category-month metric.spent-by-category-to-date-last-month
      metric.spent-last-month metric.spent-vs-last-month metric.statement-oldest-days metric.txn-uncategorised
      metric.uncategorised-share-30d metric.unfiled-month metric.unfiled-spent-month
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles
      rule.payment-unsettles rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.file_back script.last_day script.learn_category
      script.match_payment script.move_line script.offer_budgets script.plans_from_names script.settle script.settle_matched_line
      script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'f421f8cad710cab6',
    history: [
      'Money 3.29.1, words: `page.money`, `page.money-accounts`, `page.money-ledger`, `page.money-budgets`, `page.money-coming`, `page.money-forecast`, `page.money-reports`, `page.money-payees`, `page.money-rules`, `page.money-account`, `page.money-book` and `page.money-plan` open on one short line with a figure in it, their figures lose the notes that explained them, and an empty list says one short line; no id added or taken away -> f421f8cad710cab6',
    ],
  },
  'money-core@3.30.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash
      metric.book-in-by-month metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month
      metric.book-out-by-month metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held
      metric.budget-passed-on metric.budgets-set metric.budgets-total metric.budgets-unset metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-after-next-by-plan
      metric.installments-due-30d metric.installments-late metric.installments-left metric.installments-left-by-plan
      metric.installments-next-due-by-plan metric.installments-paid-by-plan metric.installments-total-by-plan
      metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in metric.leaving-30d
      metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month metric.lines-by-account
      metric.net-by-month metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month metric.out-by-month
      metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-to-you metric.paid-last-by-payee
      metric.paid-times-by-payee-90d metric.payees-paid-90d metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-month metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed
      metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d
      metric.spent-by-category-last-month metric.spent-by-category-month metric.spent-by-category-to-date-last-month
      metric.spent-last-month metric.spent-vs-last-month metric.statement-oldest-days metric.txn-uncategorised
      metric.uncategorised-share-30d metric.unfiled-month metric.unfiled-spent-month
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payment-matches rule.payment-settles
      rule.payment-unsettles rule.plan-links-parts rule.plan-made-one rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.file_back script.last_day script.learn_category
      script.match_payment script.move_line script.offer_budgets script.plans_from_names script.settle script.settle_matched_line
      script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '0ed2f801ac71509b',
    history: [
      'Money 3.30.0: `register.categories` gains `transfer` ("Money stays yours") and `register.transactions` reads it as `stays` through the category; every figure, page and walk of spending and income says `stays is not true`; no id added or taken away -> 08f1dd085dc715f7',
      'Money 3.30.0, its lines: `page.money` says how many accounts the money is spread over and not how many books, and its hero notes are one short line; no id added or taken away -> 0ed2f801ac71509b',
    ],
  },
  'money-core@3.31.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.arriving-30d metric.balances-stale metric.bills-in-no-book metric.book-cash
      metric.book-in-by-month metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month
      metric.book-out-by-month metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held
      metric.budget-passed-on metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset
      metric.budgets-weekly metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay
      metric.card-to-pay-on metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month
      metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late
      metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in
      metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month
      metric.lines-by-account metric.net-by-month metric.net-worth metric.nights-missed-30d metric.out-30d metric.out-ahead-by-month
      metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.payees-paid-90d metric.plan-after-next-by-plan
      metric.plan-last-due metric.plan-late metric.plan-left metric.plan-left-by-plan metric.plan-next-due
      metric.plan-next-due-by-plan metric.plan-paid metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan
      metric.plan-parts-cancelled metric.plan-parts-open metric.plan-parts-paid metric.plan-parts-paid-by-plan
      metric.project-in-by-month metric.project-in-month metric.project-kept-month metric.project-out-by-month
      metric.project-out-month metric.project-owed metric.received-30d metric.received-7d metric.received-month
      metric.repeating-in-no-book metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d
      metric.runs-out-on metric.runway-days metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-last-month metric.spent-vs-last-month metric.spoken-for-share
      metric.statement-oldest-days metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d
      metric.unfiled-month metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-stays-asks rule.category-stays-yes rule.category-taught rule.category-teaches rule.entry-takes-book
      rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late rule.part-counts-plan
      rule.part-takes-book rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_stays script.file_back script.last_day
      script.learn_category script.match_payment script.move_line script.offer_budgets script.plans_from_names script.post_due
      script.replace_posted script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '2e7e74ab8c4ba35c',
    history: [
      'Money 3.31.0: `metric.net-worth` with what the add-ons hold (`metric.held-beyond-cash`, `metric.owed-over-time`) and the night in `register.snapshots`; budgets for a week or a year (`budget_period` on `register.categories`, `script.budget_watch`, `page.money-budgets`); a repeating line posts itself (`script.post_due`, `script.replace_posted`, `rule.posted-replaced`); ids added and none taken away -> 19aab533e8a08ab9',
      'Money 3.31.0, carried over: each budget bar on `page.money-budgets` is set against the budget and what carried over (`carried` its fourth column), the Carried over table and `metric.budgets-carried` go; ids taken away before release -> 69332dac5dfed81b',
      'Money 3.31.0, Stripe below zero: `page.money-accounts` says in one line what a Stripe balance below zero is, read by `metric.stripe-below-zero-count`; ids added -> 2e7e74ab8c4ba35c',
    ],
  },
  'money-core@3.32.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-in-no-book metric.book-cash metric.book-in-by-month metric.book-in-month metric.book-lasts-until
      metric.book-net-by-month metric.book-net-month metric.book-out-by-month metric.book-out-month metric.book-owed-by
      metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on metric.budgets-monthly-total
      metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly metric.budgets-weekly-total
      metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check metric.cash-foreign-share metric.cash-now
      metric.categories-against-direction metric.chasing metric.currencies-held metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-net metric.every-month-out
      metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.held-beyond-cash metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-a-month
      metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late metric.installments-left
      metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in
      metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month
      metric.lines-by-account metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d metric.out-30d
      metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-over-time
      metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d
      metric.pending-lines metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due
      metric.plan-late metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-month metric.received-three-months-back metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month metric.spent-by-category-month
      metric.spent-by-category-to-date-last-month metric.spent-by-category-week metric.spent-by-category-year
      metric.spent-in-category-by-week metric.spent-last-month metric.spent-vs-last-month metric.spoken-for-month
      metric.spoken-for-share metric.statement-oldest-days metric.stripe-below-zero-count metric.txn-uncategorised
      metric.uncategorised-share-30d metric.unfiled-month metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-stays-asks rule.category-stays-yes rule.category-taught rule.category-teaches rule.entry-takes-book
      rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late rule.part-counts-plan
      rule.part-takes-book rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_stays script.file_back script.last_day
      script.learn_category script.match_payment script.move_line script.offer_budgets script.plans_from_names script.post_due
      script.replace_posted script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '5c8913a833a3ec55',
    history: [
      'Money 3.32.0: `page.money` lists every open account over `metric.balance-by-account`, and `page.money-budgets` heads each list by its period and takes off the No budget yet table; with the round\'s other Money changes since 3.31.0 -> a226619945134c1a',
      'Pending lines are counted nowhere and said apart: `metric.pending-out-month` on `page.money-budgets`, a waiting block on `page.money-ledger` -> c8169a04219f86fa',
      'The three waiting figures (`metric.pending-lines`, `metric.pending-out-month`, `metric.pending-out-month-count`) take a target, so they read -> 35309e614b4f37fa',
      'Accounts counts the cards it lists (`metric.accounts-open` on `page.money-accounts`), says Out of date, and a card reads Ending in on `page.money-account` too -> e5fd993461b3fe88',
      'Net worth says which nights are cash and bills only (`metric.nights-cash-and-bills`), `register.snapshots` calls its net Cash after bills, `page.money` says every budget as a month and `page.money-account` opens on its name -> 72f61e5fd634216b',
      'Over time on `page.money` draws Cash\'s line until net worth has a week of nights (`metric.net-worth-nights`), and lends net worth no nights of cash and bills -> 4c2327a39c2e2506',
      "`page.money-coming` signs each amount by its direction, and `page.money-payees` says Nothing paid out in 90 days only while no payee and no unnamed line was paid, and counts its Last paid lines out only; no id added or taken away -> 4d6fddf2fb3b9d3a",
      "`page.money-payees` opens on a line when no payment out names anyone (`metric.unnamed-paid-90d`), and Owed over time is called Still to pay over time (`metric.owed-over-time`, the net worth field on `register.snapshots`); no id added or taken away -> b5ebece5d915f8d6",
      "`script.replace_posted` says nothing when no line posted for you could be the charge, so an ordinary cleared payment leaves no note; no id added or taken away -> 5c8913a833a3ec55",
    ],
  },
  'money-core@3.32.1': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-in-no-book metric.book-cash metric.book-in-by-month metric.book-in-month metric.book-lasts-until
      metric.book-net-by-month metric.book-net-month metric.book-out-by-month metric.book-out-month metric.book-owed-by
      metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on metric.budgets-monthly-total
      metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly metric.budgets-weekly-total
      metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check metric.cash-foreign-share metric.cash-now
      metric.categories-against-direction metric.chasing metric.currencies-held metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-net metric.every-month-out
      metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.held-beyond-cash metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-a-month
      metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late metric.installments-left
      metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in
      metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month
      metric.lines-by-account metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d metric.out-30d
      metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-over-time
      metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d
      metric.pending-lines metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due
      metric.plan-late metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-month metric.received-three-months-back metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month metric.spent-by-category-month
      metric.spent-by-category-to-date-last-month metric.spent-by-category-week metric.spent-by-category-year
      metric.spent-in-category-by-week metric.spent-last-month metric.spent-vs-last-month metric.spoken-for-month
      metric.spoken-for-share metric.statement-oldest-days metric.stripe-below-zero-count metric.txn-uncategorised
      metric.uncategorised-share-30d metric.unfiled-month metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-stays-asks rule.category-stays-yes rule.category-taught rule.category-teaches rule.entry-takes-book
      rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late rule.part-counts-plan
      rule.part-takes-book rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles
      rule.plan-links-parts rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_stays script.file_back script.last_day
      script.learn_category script.match_payment script.move_line script.offer_budgets script.plans_from_names script.post_due
      script.replace_posted script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '21c7791ef5ca6739',
    history: [
      '`script.post_due` reads only `no_feed` on an account, which a feed now sets on every account it keeps, where it read Mercury\'s and Stripe\'s own fields; no id added or taken away -> 623dd507e74ef839',
      '`metric.stripe-below-zero-count` asks a balance below zero in any currency, where it listed seven; no id added or taken away -> ff3bf8c8c1a23e75',
      "Money 3.32.1, the live check of 30 October: `metric.net-worth` takes away `metric.property-left` and `metric.debts-left` where it took away `metric.owed-over-time`, Over time on `page.money` says why under its line, `page.money-rules` counts lines filed, and `page.money-account`'s balance box says what to type; no id added or taken away -> 1e6d0d90bb453254",
      'Both 3.32.1 patches of 30 October together: `script.post_due` reads `no_feed` and `metric.net-worth` takes away what is left on counted plans; no id taken away -> 21c7791ef5ca6739',
    ],
  },
  'money-core@3.32.2': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-in-no-book metric.book-cash metric.book-in-by-month metric.book-in-month metric.book-lasts-until
      metric.book-net-by-month metric.book-net-month metric.book-out-by-month metric.book-out-month metric.book-owed-by
      metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on metric.budgets-monthly-total
      metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly metric.budgets-weekly-total
      metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on metric.cash-accounts
      metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check metric.cash-foreign-share metric.cash-now
      metric.categories-against-direction metric.chasing metric.currencies-held metric.days-late-in metric.due-30d
      metric.due-items-30d metric.every-month-by-category metric.every-month-in metric.every-month-net metric.every-month-out
      metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today metric.held-beyond-cash metric.in-30d
      metric.in-ahead-by-month metric.in-by-month metric.in-due-by-month metric.installments-a-month
      metric.installments-after-next-by-plan metric.installments-due-30d metric.installments-late metric.installments-left
      metric.installments-left-by-plan metric.installments-next-due-by-plan metric.installments-paid-by-plan
      metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d metric.lasts-no-income metric.late-in
      metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days metric.ledger-rows-7d metric.left-month
      metric.lines-by-account metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d metric.out-30d
      metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you metric.owed-over-time
      metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d
      metric.pending-lines metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due
      metric.plan-late metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-month metric.received-three-months-back metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.spent-30d metric.spent-by-category-last-month metric.spent-by-category-month
      metric.spent-by-category-to-date-last-month metric.spent-by-category-week metric.spent-by-category-year
      metric.spent-in-category-by-week metric.spent-last-month metric.spent-vs-last-month metric.spoken-for-month
      metric.spoken-for-share metric.statement-oldest-days metric.stripe-below-zero-count metric.txn-uncategorised
      metric.uncategorised-share-30d metric.unfiled-month metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-stays-asks rule.category-stays-yes rule.category-taught rule.category-teaches rule.entry-takes-book
      rule.installment-due-soon rule.instalment-settles rule.invoice-chased rule.invoice-late rule.part-counts-plan
      rule.part-takes-book rule.payment-files-paid rule.payment-matches rule.payment-matches-again rule.payment-settles
      rule.payment-unsettles rule.plan-links-parts rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed
      rule.recurring-stopped rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_stays script.file_back script.file_paid
      script.last_day script.learn_category script.match_payment script.move_line script.offer_budgets script.plans_from_names
      script.post_due script.replace_posted script.settle script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'a58b8d35089d13ad',
    history: [
      'Money 3.32.2, file-paid of 30 October: `rule.payment-files-paid` and `script.file_paid` file a payment that pays a bill under the bill\'s category where it was money that stays yours, `script.settle_matched_line` does the same for a repeating line, and `script.learn_category` offers no filing rule for a category the bill filed; two ids added, none taken away -> a58b8d35089d13ad',
    ],
  },
  'money-core@3.33.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-cash metric.book-in-by-month metric.book-in-month
      metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month metric.book-out-month
      metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-over-time metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week
      metric.payees-paid-90d metric.pending-lines metric.pending-out-month metric.pending-out-month-count
      metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late metric.plan-left metric.plan-left-by-plan
      metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid metric.plan-paid-by-quarter metric.plan-parts
      metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open metric.plan-parts-paid
      metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes rule.category-taught
      rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased
      rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payment-files-paid rule.payment-matches
      rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts rule.plan-made-one
      rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle script.settle_matched_line
      script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'a40750ee487c9f43',
    history: [
      'Money 3.33.0, round 1031 of 30 October: `rule.category-correction-asks`, `script.category_correction` and `script.ledger_twice` added, the figures by range such as `metric.spent-last` added, every spending figure leaves corrections out; sixteen ids added, none taken away -> b6299d6dda85dfdc',
      'Before 3.33.0 shipped, `register.snapshots` says it is kept by automations alone (`kept_by`), so it is offered no page; no id added or taken away -> 8aeb6babb5fcaf3a',
      'Before 3.33.0 shipped, `page.money-forecast` opens on 12 weeks and `metric.moved-since` is added for Reports; one id added, none taken away -> 72b8a0107776271c',
      'Before 3.33.0 shipped, `page.money-payees` and `page.money-budgets` link to their unnamed and unfiled lines with field:is:empty; no id added or taken away -> 3a73960b7bea2133',
      'Before 3.33.0 shipped, `page.money-payees` draws one bar a payee, `page.money-rules` draws its rules as cards, and `metric.filing-rule-filed` and `metric.filing-rules` are added; two ids added, none taken away -> e00c98eb1a5acc2f',
      'Before 3.33.0 shipped, `script.post_due` says what this BrainDog cannot step on in plain words; no id added or taken away -> 149781440f62b820',
      'Before 3.33.0 shipped, `page.money` says the Ledger tile lines came in today, each under its own day; no id added or taken away -> 646e68107905a1c3',
      'Before 3.33.0 shipped, `page.money-payees` names a payee by the bank when nobody did, `metric.unnamed-paid-90d` counts only lines with no name at all, and `metric.account-now` takes a floor; no id added or taken away -> 0874b24fc057b94d',
      'Before 3.33.0 shipped, `page.money` leads with late bills, or the low point when cash goes under within 12 weeks, the card second; no id added or taken away -> c7bebadea464c85a',
      'Before 3.33.0 shipped, `page.money` links the late figure in its first line and its Heads up drops the repeated Bills late line; no id added or taken away -> 6ed7ba30566e892e',
      'Before 3.33.0 shipped, `rule.invoice-chased` notes say "in Needs you", where they said "in Decide"; no id added or taken away -> 25faa3d6f8712d37',
      'Before 3.33.0 shipped, `metric.bills-open` and `metric.repeating-held` are added and `page.money` asks for a bill when nothing is due; two ids added, none taken away -> a04f3a06af13f9d7',
      'Before 3.33.0 shipped, `page.money-plan` names its summary cell "Paid", where it said "Paid in"; no id added or taken away -> 0bc4bf113bd883c0',
      'Before 3.33.0 shipped, `page.money-plan` draws its summary as one tile set at a time, so a plan with nothing late has no "Late £0" and a paid plan no "Left £0"; no id added or taken away -> e6eb76a485ee7c05',
      'Before 3.33.0 shipped, `metric.bills-held` is added, `page.money` opens on an account to add when none is kept and signs its hero tiles by their way, `widget.cash-today` signs the same; one id added, none taken away -> 199f1f241a0a0d26',
      'Before 3.33.0 shipped, `metric.settled-out-7d` is added, money he paid out in the last 7 days; one id added, none taken away -> 786ef33ec53daf88',
      'Before 3.33.0 shipped, `page.money` says only how many Ledger lines came in today, without "each under the day it happened"; no id added or taken away -> 6afb43bbb3cc59e0',
      'Before 3.33.0 shipped, `page.money` says how long the money lasts as one line under Cash now with In and Out beside it, `page.money-coming` lists what is late once, `page.money-reports` drops a share of nothing in other currencies and `page.money-accounts` draws one tile of balances; no id added or taken away -> a40750ee487c9f43',
    ],
  },
  'money-core@3.34.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-cash metric.book-in-by-month metric.book-in-month
      metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month metric.book-out-month
      metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-over-time metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week
      metric.payees-paid-90d metric.pending-lines metric.pending-out-month metric.pending-out-month-count
      metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late metric.plan-left metric.plan-left-by-plan
      metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid metric.plan-paid-by-quarter metric.plan-parts
      metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open metric.plan-parts-paid
      metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes rule.card-text-owes
      rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes rule.category-taught
      rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles rule.invoice-chased
      rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid rule.payment-matches
      rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts rule.plan-made-one
      rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped rule.recurring-went-through
      rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '06948dd74641d43d',
    history: [
      'Money 3.34.0, next-money of 1 November: `register.payee_names` keeps the name read for what a bank writes, and `rule.payee-named-back` and `script.name_payees` put it on the Ledger lines; `page.money` leads with what is late both ways and says what needs a look under its hero, `page.money-coming` is one table grouped by stretch, `page.money-accounts` one card an account with its balance, and the other Money pages say each figure once; three ids added, none taken away -> 06948dd74641d43d',
    ],
  },  'money-core@3.35.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-cash metric.book-in-by-month metric.book-in-month
      metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month metric.book-out-month
      metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-over-time metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week
      metric.payees-paid-90d metric.pending-lines metric.pending-out-month metric.pending-out-month-count
      metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late metric.plan-left metric.plan-left-by-plan
      metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid metric.plan-paid-by-quarter metric.plan-parts
      metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open metric.plan-parts-paid
      metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '06638ef8f6a700e6',
    history: [
      'Money 3.35.0, leftovers of 2 November: `rule.account-files-book` and `script.book_from_account` file what an account already holds into the book it is put in, and the Add an account tile on `page.money-book` sits under Accounts -> 06638ef8f6a700e6',
    ],
  },

  'work@1.17.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-open metric.tasks-after-week-yours
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later metric.tasks-not-this-week
      metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-this-week-yours
      metric.tasks-week-yours metric.tasks-with-agents page.work page.work-board register.tasks register.tracks
      register.updates rule.close_follow_ups rule.start_with_parent script.close_follow_ups script.start_with_parent
    `,
    declares: '80b0e693090139ec',
    history: [
      "A card on `page.work-board`'s board says the day its task is due and who holds it, columns `by` and `owner` after the status and the task, where its third column was the project -> 80b0e693090139ec",
    ],
  },
  'people@3.2.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '5efd4fdc89f4f515',
    history: [
      "`page.people` draws each person once, on Everyone's cards with the day they were last in touch: the two tables over them, Gone quiet and Last in touch, are gone, and `people-in-touch-90d` stays declared and draws nothing -> 5efd4fdc89f4f515",
    ],
  },
  'people@3.3.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.health page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: 'a2e56f28aecca9ca',
    history: [
      "`page.health` is added: the record's vital signs by state, from the kernel's signs source and the figures signs-red and green-days -> d3d856a65e4d2519",
      "`page.health` says nought red as 'No vital sign needs a look.' rather than 'Everything on this record is alive.', since signs-red reads 0 with one sign green and the rest unread -> 12f442c25447cbca",
      "Folded into the unreleased 3.3.0: `page.health` says how many signs are not read yet under its first line, from the new built-in figure signs-unread, and its green-days lines say every watched sign was green, where they said nothing was red -> a2e56f28aecca9ca",
    ],
  },
  /* PEOPLE SAYS WHO MAY BE HELD TWICE (people-held-twice-69). 3.3.0 IS RELEASED (commit 63423720 holds it). The same ids, and
   `page.calendar` since batch 82 (calendar-page-82) and `page.activity` since batch 88 (activity-page-88), each added
   while 3.4.0 is still unreleased. */
  'people@3.4.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.activity page.calendar page.health page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '081821b86f69e21d',
    history: [
      "`page.people` says how many people may be on the record twice, in one note under its two lead notes, from the built-in figure held-twice and drawn only above nought; a note added, nothing taken away -> 3c1698b71103bfe4",
      "Folded into the unreleased 3.4.0: `page.people`'s note of people who may be held twice links the list of everyone in order of name (`/r/people?sort=name`) and says what to look for; no id added or taken away -> 900ff4486ed1626e",
      "Folded into the unreleased 3.4.0: `page.people`'s note of people who may be held twice links the list at those people (`/r/people?twice=1`) and says See them, where it linked everyone by name and said what to look for; no id added or taken away -> 13e503218e568749",
      "Folded into the unreleased 3.4.0: `page.people`'s note of people who may be held twice says the number is how many too many ('Too many: N'), where it read as the number of people the link shows; the link is unchanged; no id added or taken away -> d7d82263a138b702",
      "Folded into the unreleased 3.4.0, one fingerprint for two changes, a page added and nothing taken away: `page.people`'s note of people who may be held twice says the people the link shows and then how many too many ('N people may be on this record twice, M too many'), from the built-in figures held-twice-shown and held-twice, the link and the when unchanged (people-twice-note-82); and `page.calendar`, its line and one calendar over the computed deadlines, this month and the two after it, off the rail (calendar-page-82) -> 69d90b1f513c065d",
      "Folded into the unreleased 3.4.0, a page added and nothing taken away: `page.activity`, off the rail, its one line, a feed over the record's log with a heading a day and one line a run, and beside it Who worked, What changed and Busy hours from the built-in figures activity-by-who, activity-by-kind and activity-by-hour, and a queue of what an agent asked -> 4d18d12f51e37829",
      "Folded into the unreleased 3.4.0: `page.people` draws the questions about somebody as a queue, Waiting on you, gated on `questions-open-in:people`, with a clause in its line saying how many; a block added, nothing taken away, no id added or taken away -> 72cb3cab41d4f86a",
      "Folded into the unreleased 3.4.0 (services-people-five-parts-101, PGS-C18 and PGS-C24; batch 101; commit 63423720, the deployed build, holds 3.3.0): `metric.people-in-touch-30d` is saved each night into series.people-in-touch-30d; `page.people` gains In touch, the figure with its month as a line, and What agents did, an agents block over the log narrowed to people or organisations, and its line no longer says how many were in touch; `page.activity` declares filters on who, kind and list; two blocks and a save added, nothing taken away, no id added or taken away -> 07e8a5aa097e7ca8",
      "Inside the unreleased 3.4.0: `page.people` says its place on the rail, `nav.place` 50, lowest first; no id added or taken away -> fc96cb39590d3016",
      "Inside the unreleased 3.4.0 (batch 6, the look of People): `page.people` draws Everyone and Organisations as lines (a table) and not as little forms of labelled facts, and drops the In touch tile, whose figure and its night's save stay declared; no id added or taken away -> 51200b3a57b454df",
      "Inside the unreleased 3.4.0: `page.people` draws Everyone and Organisations side by side at span 6 each, Everyone's columns are name, role and Last spoke (With is on the person's page) and Organisations' are name and kind (Website is on the organisation's page); no id added or taken away -> 081821b86f69e21d",
    ],
  },
  /* HEALTH IN PLAIN WORDS. The same ids as 3.4.0; only the words of `page.health` moved. */
  'people@3.5.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.activity page.calendar page.health page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '24ab659bc74c166a',
    history: [
      "`page.health` is said in plain words: its lines count checks that have not run yet where they counted signs not read, nought red reads 'Nothing on this record needs a look.', its groups are All good and Not checked yet where they were Alive and Not read yet, and the run of good days says every check passed; no id added or taken away -> 24ab659bc74c166a",
    ],
  },
  /** A VERSION AND NOT A RESET: people 3.5.0 is on `origin/master`. */
  'people@3.6.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.activity page.calendar page.health page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: 'bee224943d7fab5c',
    history: [
      "People 3.6.0 (things, not rows, 24 October): `page.people`'s Everyone is cards with a face, role, organisation and Last spoke, never the owner (`self is not true`), and `people-count` counts the people Everyone draws; no id added or taken away -> bee224943d7fab5c",
    ],
  },
  /* SCRIPTS IS A PAGE (24 October). A VERSION AND NOT A RESET: 3.6.0 is master's. One page added. */
  'people@3.7.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.activity page.calendar page.health page.people page.relation page.scripts page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '1f3c19205d5f6147',
    history: [
      "`page.scripts`, off the rail: its one line and a table of every installed script over the kernel's `scripts` source, its name, what starts it and where it stands; a page added, nothing taken away, over 3.6.0's Everyone as faces -> 1f3c19205d5f6147",
    ],
  },
  /* A VERSION AND NOT A RESET: 3.7.0 is master's. */
  'people@3.8.0': {
    holds: `
      metric.organisations-count metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d
      metric.people-quiet
      page.activity page.calendar page.health page.people page.relation page.scripts page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '4fb781bce8786ad1',
    history: [
      "`register.organisations` gains `retired_on` (Retired on), which its `org:` names as `retired`, and `page.people`'s Organisations and `metric.organisations-count` leave a retired one out (Y2) -> 4fb781bce8786ad1",
    ],
  },
  /* PEOPLE IS ONE LINE A PERSON, WITH THE CARD-TEXT SHOPS APART. */
  'people@3.9.0': {
    holds: `
      metric.organisations-count metric.organisations-from-card-texts metric.people-count metric.people-in-touch-12w
      metric.people-in-touch-30d metric.people-in-touch-90d metric.people-quiet
      page.activity page.calendar page.health page.people page.relation page.scripts page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '45015e6b8ce9d2d4',
    history: [
      "`metric.organisations-from-card-texts` counts the shops a card text named, which `metric.organisations-count` and `page.people`'s Organisations leave out, and a line under it says; and Everyone is one line a person -> 45015e6b8ce9d2d4",
    ],
  },
  /* HEALTH, SCRIPTS, CALENDAR AND ACTIVITY LEAVE FOR `core` (the add-ons proposal, step 2). A page leaves, so a major. */
  'people@4.0.0': {
    holds: `
      metric.organisations-count metric.organisations-from-card-texts metric.people-count metric.people-in-touch-12w
      metric.people-in-touch-30d metric.people-in-touch-90d metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '227130b05c177df0',
    history: [
      '`page.health`, `page.scripts`, `page.calendar` and `page.activity` are no longer declared here: People hands the four to `core` under the same ids, and `page.people` and the rest are as they were -> 227130b05c177df0',
    ],
  },
  /* ONE ORGANISATIONS COUNT EVERYWHERE, AND YOU LEFT OUT OF PEOPLE'S COUNTS (round 1030). 4.0.0 IS MASTER'S. */
  'people@4.2.1': {
    holds: `
      metric.organisations-count metric.organisations-from-card-texts metric.organisations-known metric.people-count
      metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: 'e1e0f171a698aca0',
    history: [
      "People 4.2.1 (round 1030): `metric.organisations-count` counts every organisation not folded into another and not retired, `metric.organisations-known` is added for the ones you work with, the people figures leave you and merged rows out (`metric.people-in-touch-30d`, `metric.people-quiet`), and `page.people` says one organisations line in place of the Organisations table; one id added, none taken away -> e1e0f171a698aca0",
    ],
  },
  'people@4.2.2': {
    holds: `
      metric.organisations-count metric.organisations-from-card-texts metric.organisations-known metric.people-count
      metric.people-in-touch-12w metric.people-in-touch-30d metric.people-in-touch-90d metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '487bd59379f41ec7',
    history: [
      'People 4.2.2 of 30 October: `page.people` says who may be listed twice in plainer words; no id added or taken away -> d1e4904c80834e27',
      'Before 4.2.2 shipped, `page.people` offers "Add a person" in its head; no id added or taken away -> f06ef80069526206',
      'Before 4.2.2 shipped, `page.people` counts contacts besides you; no id added or taken away -> 907bf4230f776598',
      'Before 4.2.2 shipped, `page.people` counts people besides you; no id added or taken away -> 487bd59379f41ec7',
    ],
  },

  /* SCRIPTS' COLUMN OF WHERE EACH STANDS IS CALLED STATUS. core 1.0.0 is on master, so a version of its own. */
  'core@1.1.0': {
    holds: `
      page.activity page.calendar page.health page.scripts
    `,
    declares: 'debc6ef13f7f548d',
    history: [
      '`page.scripts` heads its `last_at` column "Status" where it said "Where it stands"; words on a column, nothing else moved -> debc6ef13f7f548d',
    ],
  },
  /* HEALTH LINKS TO TIDY UP (round 1030). 1.1.0 IS MASTER'S, so a version of its own. */
  'core@1.2.0': {
    holds: `
      page.activity page.calendar page.health page.scripts
    `,
    declares: 'f7944da78d446954',
    history: [
      "`page.health` says what needs a look without \"on this record\", and links to Tidy up for what went stale or is here twice; words and one note added, no id added or taken away -> f7944da78d446954",
    ],
  },
  'core@1.2.1': {
    holds: `
      page.activity page.calendar page.health page.scripts
    `,
    declares: 'b4b0857fc5935c85',
    history: [
      'Core 1.2.1 of 30 October: `page.health` shows every card not checked yet; no id added or taken away -> f519178d239ec8dc',
      'Before 1.2.1 shipped, `page.scripts` says "Every script you have"; no id added or taken away -> 76619a71f70182cd',
      'Before 1.2.1 shipped, `page.health` drops its two "checks have not run yet" lines and the signs read in plain words; no id added or taken away -> b4b0857fc5935c85',
    ],
  },
  /** A VERSION AND NOT A RESET: core's last version is on `origin/master`. */
  'core@1.3.0': {
    holds: `
      page.activity page.calendar page.health page.scripts
    `,
    declares: 'e5b0342f1bc58072',
    history: [
      'Core 1.3.0 of 1 November (lists review, L39): `page.health` folds its Not checked yet group at six where it drew every card; no id added or taken away -> e5b0342f1bc58072',
    ],
  },

  /* A PROJECT OTHERS POINT AT STAYS, AND WHERE IT STANDS IS SAID (batch 46, REC-C08 and REC-C16). 1.15.0 IS RELEASED. */
  'portfolio@1.16.0': {
    holds: `
      metric.project-said
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: 'ae8100fc45762bd5',
    history: [
      "`register.things` declares `delete: refuse_while_referenced`; `page.portfolio` draws a note beside What each one earns, open and folded, counting `projects-earning-said` of `projects-live`; `project-said` counts a project whose health, progress, aim or agent is set -> ae8100fc45762bd5",
    ],
  },
  /* EACH PROJECT'S KEY NUMBERS, AND NUMBERS TAKEN OVER FROM THE FOUNDER USE CASE (the KPI plan of 21 October, K1-A).
     1.18.0 MAY BE RELEASED, so a version of its own. Two lists, a field and two figures added. */
  /* EACH CARD'S LINE IS THE KEY NUMBER ITS PROJECT LEADS WITH (the KPI plan of 21 October, 2.5). 1.19.0 IS RELEASED
     (origin/master holds it), so a version of its own. A key on one column, no id added or taken away. */
  'portfolio@1.20.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-said metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.datapoints register.kpis register.things
      rule.project-past-aim
    `,
    declares: '88ed9a4e174d8bd8',
    history: [
      "`page.portfolio`'s cards in play read each card's line from the key number its project leads with, `kpi: headline` on the trend column over `project-done-by-week`, which a card whose project keeps none still draws; no id added or taken away -> 88ed9a4e174d8bd8",
    ],
  },
  'portfolio@1.21.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-said metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.datapoints register.kpis register.things
      rule.project-past-aim
    `,
    declares: '572c66bf9ad6163e',
    history: [
      "Portfolio 1.21.0 (batch 4's look on his record): `page.portfolio`'s In play cards draw a hundred at most where they drew twelve, so the lane bar over them counts every project in play; no id added or taken away -> 572c66bf9ad6163e",
    ],
  },
  /* NUMBERS HAS A PAGE OF ITS OWN. 1.23.0 is master's and 1.24.0 another lane's, so a version of its own. One page
     added and nothing taken away. */
  /* 1.25.0 IS MASTER'S, so a version of its own. One column changed, no id added. */
  /* AUDIT C OF 25 OCTOBER: 1.26.0 IS MASTER'S, so a version of its own. A block added, no id added. */
  /* THE LOOK OF 25 OCTOBER (P11): 1.27.0 IS MASTER'S, so a version of its own. Words on Numbers and one filter on a figure, no id added. */
  /* A PROJECT'S MARK, HUE AND NOT-KEPT-YET ARE THE LIST'S OWN BOOKKEEPING: 1.28.0 IS MASTER'S, so a version of its own. Three fields flagged, no id added. */
  /* FINISHED READS CLOSED (29 October): 1.30.1, words inside declarations already there, no id added. */
  'portfolio@1.30.1': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: '20ab14ee09c09f5f',
    history: [
      "Portfolio 1.30.1 (his word: say closed, not finished): `register.things`' lane label `retired` reads Closed, and `metric.projects-retired` and `metric.projects-not-in-play` are named Closed and Parked or closed; no id added or taken away -> 20ab14ee09c09f5f",
    ],
  },
  /* THE PROJECTS BOARD: 1.30.0, blocks taken away and one keyed, no id added. */
  'portfolio@1.30.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: '182444007550fda9',
    history: [
      "Portfolio 1.30.0 (the Projects board): `page.portfolio` keys its cards block `board`, which the app draws as the board, and drops the lines read off health, Where they are and What each one earns; no id added or taken away -> 182444007550fda9",
    ],
  },
  'portfolio@1.29.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: 'cc7b75097a35f4bc',
    history: [
      "Portfolio 1.29.0 (the agents' reads): `register.things` flags a project's `mark`, `hue` and `draft` `hidden_from_agents`, so an agent's short answers leave them out and `format: full` and the app keep them; no id added or taken away -> cc7b75097a35f4bc",
    ],
  },
  'portfolio@1.28.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: '624a460124b5bae5',
    history: [
      "Portfolio 1.28.0 (the look of 25 October, P7 and P11): `page.all-numbers` opens on a plain line and its link to every reading says what it opens, and `metric.projects-by-lane` leaves Finished out so Where they are counts what Projects draws; no id added or taken away -> a8ec61d66a02d925",
      "Portfolio 1.28.0 (25 October, still unreleased): the link under `page.all-numbers` describes its target as Every reading on its own line, newest first, instead of One reading a row, newest first; no id added or taken away -> 624a460124b5bae5",
    ],
  },
  'portfolio@1.27.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: 'ecc0db684fe9dcc8',
    history: [
      "Portfolio 1.27.0: `page.portfolio` opens on an Add a project capture over `register.things` while nothing is in play, its line saying none is in play draws only while one is parked, and the one saying nothing needs a push only while one is in play; no id added or taken away -> 02439153f3a25f54",
      "Inside the unreleased 1.27.0 (audit C, X7): `page.portfolio` says one line of its own where the record holds no project at all, over the Add a project box -> ecc0db684fe9dcc8",
    ],
  },
  'portfolio@1.26.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: '940be95b94881f88',
    history: [
      "Portfolio 1.26.0: `page.portfolio`'s In play cards read their when off the record's own `project-worked`, a project's tasks and its runs together, where they read Work's `project-last-worked`, the tasks alone; no id added or taken away -> 940be95b94881f88",
    ],
  },
  'portfolio@1.25.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: 'c269d3aa29ad7555',
    history: [
      "Portfolio 1.25.0 (E26): `page.all-numbers`, Numbers' own page (`list: datapoints`): each kind of number once under its project, with its newest value, unit and age, and the two that moved most this year as lines; one page added -> b81f3e2271681c18",
      "Portfolio 1.25.0 on top of 1.24.0: holds 1.24.0's `rule.kind-offers-kpis` and `script.kind_drafts` too -> c269d3aa29ad7555",
    ],
  },
  /* A PROJECT'S PLAN IS DRAWN, NOT LISTED (the thinking scope of 24 October). 1.22.0 IS MASTER'S (the
     key-numbers backfill), so a version of its own. A list, a field and three figures added. */
  'portfolio@1.23.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.project-past-aim
      script.kpi_backfill
    `,
    declares: '7f2a561af892229d',
    history: [
      "Portfolio 1.23.0 (the thinking scope of 24 October, C18 and C19): `register.stages` added, a list of steps over the projects with its done-when line, `register.things` gains `drawn_as`, and `project-staged`, `project-plan-path` and `project-plan-roadmap` added -> 7f2a561af892229d",
    ],
  },
  /* THE KEY-NUMBERS BACKFILL SHIPS (the alive scope of 24 October). 1.21.0 MAY BE RELEASED, so a version of its
     own. One script added and nothing taken away. */
  'portfolio@1.22.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-said metric.projects-aim-30d metric.projects-aiming metric.projects-by-health
      metric.projects-by-lane metric.projects-earning metric.projects-earning-before metric.projects-earning-change
      metric.projects-earning-said metric.projects-lane-earning metric.projects-live metric.projects-looked-up
      metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked metric.projects-past-aim
      metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.datapoints register.kpis register.things
      rule.project-past-aim
      script.kpi_backfill
    `,
    declares: 'e28e87b9a2383950',
    history: [
      "Portfolio 1.22.0 (B26): `script.kpi_backfill` offers each project its key numbers from Numbers, once a day and once a project, as questions; one script added -> e28e87b9a2383950",
    ],
  },
  /** A VERSION AND NOT A RESET: portfolio 1.23.0 is on master. */
  'portfolio@1.24.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning
      metric.projects-live metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: '15715957db36963f',
    history: [
      "Projects 1.24.0 (the scope of 24 October, B27): `rule.kind-offers-kpis` starts `script.kind_drafts` when a project's kind is set, which offers its kind's four key numbers as drafts in one question -> 15715957db36963f",
    ],
  },
  'portfolio@1.19.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-said
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.datapoints register.kpis register.things
      rule.project-past-aim
    `,
    declares: '06415195032898ca',
    history: [
      "`register.datapoints` is Portfolio's, Numbers taken over from the founder use case under the same id, less the organisation and the service a reading is about, which the founder lays on it; `register.kpis` is added, a project's key numbers (`KPI_LIST`); `register.things` gains `kind`, business, client work, product or content; `kpis-held` and `kpi-stale` are added -> 8e3129d32576b52b",
      "Inside the unreleased 1.19.0 (VERIFY H11): `page.portfolio`'s What each one earns reads `hue` as a third column, so each part is drawn in its project's slot; no id added or taken away -> 06415195032898ca",
    ],
  },
  /* A PROJECT THE RECORD FORMED ITSELF is marked a draft until its owner keeps it (the first project formed from a first session). 1.17.0 IS RELEASED. The same ids: a field of `things`. */
  'portfolio@1.18.0': {
    holds: `
      metric.project-said
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: 'a98b386902474a38',
    history: [
      "`register.things` gains the field `draft` (a yes or no, Not kept yet, no by default), which marks a project the record formed from an agent's first session until its owner keeps it; no id added or taken away -> 174811f66edd1c77",
      "Inside the unreleased 1.18.0 (batch 6, the look of Projects): `page.portfolio` drops the In play and earning strip, which said what the line says, and the note counting how many in play say what they earned, open and folded; their figures stay declared; no id added or taken away -> e732ff9ab12f1828",
      "Inside the unreleased 1.18.0: `page.portfolio` drops the headings Earnings, agents and dates and Parked and finished, open and folded, with With an agent, Coming up and Not in play under them, since every card says its agent, progress, day and lane; In play reads every project not finished (`lane is not retired`), drawn while one is in play or parked, so Parked is a lane of its cards; What each one earns is drawn alone while two or more say what they earn (`gt: 1`); the figures stay declared, no id added or taken away -> a98b386902474a38",
    ],
  },
  /* THE EARNINGS LINE ONLY WHILE ONE SAYS (seed-58, the look of 13 October, fault J). 1.16.0 IS RELEASED. The same ids
     until batch 101 added two figures. */
  'portfolio@1.17.0': {
    holds: `
      metric.project-said
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning metric.projects-live
      metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track metric.projects-parked
      metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.portfolio
      register.things
      rule.project-past-aim
    `,
    declares: 'accdb3abd217d7d7',
    history: [
      "`page.portfolio` draws the note beside What each one earns, open and folded, only while `projects-earning-said` is above nought, where it was drawn while `projects-live` was and read 0 of 11 on a record where nobody had said; the words are the same -> bc4e48dea660614a",
      "`page.portfolio`'s In play cards say `edit: true` on `about`, so a project's one line is typed on its card -> 88eb91d28c23081b",
      "`page.portfolio`'s In play cards draw `project-last-worked` for each card as its when, Worked on 2 days ago or Quiet for 40 days, and nothing for a project with no task (projects-last-worked-96) -> 9ace1e3844609180",
      "Inside the unreleased 1.17.0: `page.portfolio` draws the questions about its own list (`list is things`) as a queue, Waiting on you, gated on `questions-open-in:things`, with a clause in the line saying how many, and the quiet line says Nothing needs a push where it said Nothing needs you; a block added, nothing taken away, no id added or taken away -> 9609a0f244086314",
      "Inside the unreleased 1.17.0: `page.portfolio` draws a strip In play and earning over the nightly saves of `projects-live` and the new `projects-lane-earning`, a split Where they are over `projects-by-lane` past four in play, How they are going only while `projects-with-health` is above nought, and the quiet line leaves In play to the strip; two figures added -> 2e86a79dbf8e0777",
      "Inside the unreleased 1.17.0: `page.portfolio` says its place on the rail, `nav.place` 30, lowest first; no id added or taken away -> accdb3abd217d7d7",
    ],
  },
  'portfolio@1.30.2': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning
      metric.projects-live metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: '9e3c40db2ccbc3c3',
    history: [
      'Portfolio 1.30.2 (audit 31 Oct g, AG22): `register.things` key-number field `headline` reads "Shown first"; no id added or taken away -> 9e3c40db2ccbc3c3',
    ],
  },

  /* WHAT WAS WORKED ON A PROJECT THIS WEEK, a figure over tasks and so Work's (batch 46). 1.17.0 IS RELEASED. */
  'work@1.18.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open metric.tasks-after-week-yours
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-late-yours metric.tasks-later metric.tasks-not-this-week
      metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-this-week-yours
      metric.tasks-week-yours metric.tasks-with-agents page.work page.work-board register.tasks register.tracks
      register.updates rule.close_follow_ups rule.start_with_parent script.close_follow_ups script.start_with_parent
    `,
    declares: 'cf11d8e41eab6029',
    history: [
      "`project-moved-7d` is added: the tasks on a project written in the last seven days, read off `updated_at`, which a project page's Where it stands draws while nobody has said where it stands -> 9f91f6c3ff95d69d",
      "`project-last-worked` is added: the days since a task on a project was last written, read off `updated_at`, which Where it stands draws as Last worked -> cf11d8e41eab6029",
    ],
  },
  /* A THREAD PLANS, AND A FOLLOW-UP FOLLOWS. 1.18.0 IS RELEASED (`fixtures/released/work-1.18.0.json`).
     The ids are 1.18.0's: only `register.tracks` and `script.start_with_parent` changed. */
  'work@1.19.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open metric.tasks-after-week-yours
      metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later metric.tasks-no-project metric.tasks-not-this-week
      metric.tasks-overdue metric.tasks-today-yours metric.tasks-undated-yours metric.tasks-waiting
      metric.tasks-this-week-yours
      metric.tasks-week-yours metric.tasks-with-agents page.roadmap page.work page.work-board register.tasks register.tracks
      register.updates rule.close_follow_ups rule.start_with_parent script.close_follow_ups script.start_with_parent
    `,
    declares: '4909bff066e3b705',
    history: [
      "`register.tracks`: Status has six values (idea and planned before open) with their labels and the declared moves between them, and gains `target`, the day a thread aims for, a deadline reminded on the day; `script.start_with_parent` copies each of project, thread, owner and agent the follow-up left empty, and is titled Start a follow-up where its parent is; no id added or taken away -> 8299f07c756e0e85",
      "Inside the unreleased 1.19.0: on `register.tracks` holding leads to done, and `script.start_with_parent` no longer copies the agent; no id added or taken away -> 424cfe3512924e3b",
      "Inside the unreleased 1.19.0: `script.start_with_parent` copies the parent's agent when the agent holding the parent made the follow-up, read from input.made_by; no id added or taken away -> 061458f472bc1a99",
      "Inside the unreleased 1.19.0 (board-capture-line-83, PGS-C08 job 3; commit 63423720, the deployed build, holds 1.18.0): `page.work-board` gains Work's capture line, What needs doing?, first after its sentence and before the board, adding to `register.tasks`; no id added or taken away -> 6de550d0463bb74b",
      "Inside the unreleased 1.19.0: `project-last-worked` has a target of at most 30 days where it had none, so a project with nothing written on its tasks for longer misses it and is drawn as quiet; no id added or taken away -> e20a7069ac0b3816",
      "Inside the unreleased 1.19.0: `page.work` draws the questions about its own list (`list is tasks`) as a queue, Questions for you, gated on `questions-open-in:tasks`, with a clause in the line; a block added, nothing taken away, no id added or taken away -> a5e781318a2c7ef7",
      "Inside the unreleased 1.19.0 (work-head-and-no-project-101, AGT-D14 job 1 and PGS-A14; batch 101; commit 63423720, the deployed build, holds 1.18.0): `page.work` declares a head (count open-tasks, Add, search q) and lists open tasks with no project under a fold of its own, Needs a project, over a new figure `metric.tasks-no-project`; one figure and two blocks added, nothing taken away -> 98e297748df7a157",
      "Inside the unreleased 1.19.0: `page.work` says its place on the rail, `nav.place` 10, lowest first; no id added or taken away -> cda5ad94ed61f9bc",
      "Inside the unreleased 1.19.0: `page.work` drops its head's search word and At a glance, draws Late and This week as one list a third of the row, Late and this week (`any` of `tasks-late-yours` and `tasks-this-week-yours`), with each task's day and project under it, as With an agent and Waiting on you now do in place of who changed it last, and lays Not this week, Needs a project and Done lately a third of the row each; `register.updates` labels its health On track, At risk and Off track; no id added or taken away -> d6f1ff76bff97f7a",
      "Inside the unreleased 1.19.0: Not this week, Needs a project and Done lately are the page's width again, since a section is a heading across the page and is drawn at twelve whatever it declares, in `page.work` -> 723aa988723465e4",
      "Inside the unreleased 1.19.0 (the screens scope of 24 October, E24): `page.work` draws Late and This week as two bands, in the order Late, Waiting on you, This week, With an agent, half the row each, and its head counts a new figure `metric.tasks-in-play`, every task not done or dropped, which is what the project chips count; one figure and one block added, nothing taken away -> 65b382ee2c8f38ab",
      "Inside the unreleased 1.19.0 (the thinking scope of 24 October, C32, the old Work screen retired): `page.work` filters by whose work it is, Yours where no agent holds a task and Agents where one does, beside its strip of projects, and folds the open work not written in 90 days under Not moved in three months, a table and not a list that ticks; no id added or taken away -> 7b2625ccfea7fed8",
      "Inside the unreleased 1.19.0: `page.work-board`'s board reads by state, then tier, then due day, a hundred at most, so every task in play is read before any done one, its line says how many are kept for later, and its table Everything open is taken away; a block taken away, no id added or taken away -> cce7e1d53c029ee7",
      "Inside the unreleased 1.19.0: `page.roadmap`, titled Timeline, is a page of Work, a line and the dated tasks on one time axis that the Roadmap add-on drew, which hands the page over; a page added, nothing taken away -> 17616de9fbc2bbce",
      "Inside the unreleased 1.19.0: `page.roadmap` drops its line that said what the page is for, so the Timeline is its heading and its tasks; no id added or taken away -> e88ef938c85d76df",
      "Inside the unreleased 1.19.0: `page.work`'s head counts `metric.open-tasks`, kept for later left out, so it says the number the rail says beside it; no id added or taken away -> 675583e78e5a5ff8",
      "Inside the unreleased 1.19.0: `page.roadmap` opens on a line of what is past its date and what falls due in 7 days, `metric.tasks-overdue` and `metric.tasks-due-7d`, where it had no line; no id added or taken away -> 4909bff066e3b705",
    ],
  },
  /* WORK'S CHIPS COUNT WHAT OPEN COUNTS. 1.19.0 IS MASTER'S, so a version of its own. */
  'work@1.20.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later metric.tasks-no-project
      metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '0aef6cf7e6d779f5',
    history: [
      "Work 1.20.0 (Q6 of 29 October): `page.work`'s project chips and Yours and Agents count what Open counts, and its line says none of your tasks is late; no id added or taken away -> 0aef6cf7e6d779f5",
    ],
  },
  'work@1.20.1': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later metric.tasks-no-project
      metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '43e75f17c96ed2fb',
    history: [
      'Work 1.20.1 of 30 October: `page.work` lists No due day newest first; an order, no id added or taken away -> 3a5fc3181fd352f1',
      'Before 1.20.1 shipped, `page.work` lists Later by due day, then newest first; an order, no id added or taken away -> ab20ffa843fb893f',
      'Before 1.20.1 shipped, `page.work` says "Your work this week" and `page.work-timeline` "Tasks by due day", keys kept; no id added or taken away -> 048d50723d738f45',
      'Before 1.20.1 shipped, `page.work` counts its folded groups (Not this week, Needs a project, Not moved in three months, Done lately) from `register.tasks`; no id added or taken away -> 43e75f17c96ed2fb',
    ],
  },
  'work@1.21.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later metric.tasks-no-project
      metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '18fe9a1352449b91',
    history: [
      'Work 1.21.0 (teams, 1 Nov): yours is unassigned or assigned to you, `owner is not someone else` on `metric.tasks-this-week-yours` and every yours figure and on `page.work`, and `register.tasks` says Assigned to; no id added or taken away -> 18fe9a1352449b91',
    ],
  },
  /** A VERSION AND NOT A RESET: work's last version is on `origin/master`. */
  'work@1.22.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later metric.tasks-no-project
      metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: 'f0d268971d9a45aa',
    history: [
      'Work 1.22.0 of 1 November (lists review, L37): `page.roadmap` says what stands on the timeline and how a task gets there where its empty line said only what was missing; no id added or taken away -> f0d268971d9a45aa',
    ],
  },
  /* A VERSION AND NOT A RESET: work's last version is on `origin/master`. */
  'work@1.23.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week metric.tasks-due-7d
      metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later metric.tasks-no-project
      metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours metric.tasks-undated-yours
      metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '3ada74ddfab871db',
    history: [
      'Work 1.23.0 of 2 November (client-link): `register.tasks` gains Client, a link to the organisations; `metric.tasks-no-project` and `page.work`\'s Needs a project leave out a task with a client, and the bands of `page.work` say the client, with Client beside Project in a list of tasks; no id added or taken away -> 3ada74ddfab871db',
    ],
  },
  /* A VERSION AND NOT A RESET: people's last version is on `origin/master`. */
  'people@4.3.0': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '380d19ff5d15f860',
    history: [
      'People 4.3.0 of 2 November (client-link): `page.people` counts people and organisations apart and names the clients while there are few, over `metric.organisations-clients`, `metric.organisations-not-clients`, `metric.people-clients` and `metric.people-not-clients`, four ids added -> 380d19ff5d15f860',
    ],
  },

  'money-core@3.36.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.overdue metric.owed-by-you
      metric.owed-over-time metric.owed-to-you metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week
      metric.payees-paid-90d metric.pending-lines metric.pending-out-month metric.pending-out-month-count
      metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late metric.plan-left metric.plan-left-by-plan
      metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid metric.plan-paid-by-quarter metric.plan-parts
      metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open metric.plan-parts-paid
      metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month metric.project-kept-month
      metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d metric.received-7d
      metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '7b47305053d29617',
    history: [
      'Money 3.36.0, empty states of 2 November: `metric.book-accounts` added, and `page.money-book` waits for an account before its Cash ahead and says what one brings; `page.money-ledger`, `page.money-coming`, `page.money-forecast` and `page.money-reports` say what will be there while empty -> 7b47305053d29617',
    ],
  },

  'money-core@3.37.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'c8b2a237df19f270',
    history: [
      'money-core 3.37.0 of 2 November (leftovers5): Reports says a range that spent more than came in as how much more went out, over `metric.over-month`, `metric.over-last`, `metric.over-three`, `metric.over-year` and `metric.over-all`, five ids added, and `page.money-reports` splits its line into two notes -> c8b2a237df19f270',
    ],
  },

  'money-core@3.37.1': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'ab6426e1d9bb3897',
    history: [
      'money-core 3.37.1 of 2 November (leftovers6): `page.money-reports` says a range with nothing in as what went out and nothing in yet, its line split into three notes -> ab6426e1d9bb3897',
    ],
  },

  'money-core@3.38.0': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '6e593aafb4834883',
    history: [
      'money-core 3.38.0 of 2 November (ui2 money): `metric.plans-paying` added, `page.money-forecast` draws Left to pay by plan from two plans and one as a figure, `page.money-bill` signs its figure, `page.money-book` says Runs out, `page.money-reports` cuts the spending ring to six parts and everything else -> 6e593aafb4834883',
    ],
  },
  'money-core@3.38.1': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: '655003801b9cfa67',
    history: [
      'money-core 3.38.1 of 2 November (verify5): `page.money-reports` draws the spending ring as the six largest categories and everything else, its limit 7 where 6 drew five -> 655003801b9cfa67',
    ],
  },

  'money-core@3.38.2': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'fd7044457cd89d89',
    history: [
      'money-core 3.38.2 again, same day: the Payee column of `register.transactions` reads the bank\'s words and then the description in turn (`table` `or` as a list) -> fd7044457cd89d89',
    ],
  },

  'money-core@3.38.3': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'd6044c02f03ee519',
    history: [
      'money-core 3.38.3 of 2 November (leftovers8): `page.money-bill` heads an invoice owed to you "Still to come in", its open part split from "Still to pay" by which way it is owed -> d6044c02f03ee519',
    ],
  },

  'money-core@3.38.4': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'a64cf58225aa0ade',
    history: [
      'money-core 3.38.4 of 3 November (moneyseed): `page.money-coming` lists what falls due once (no second Bills and invoices) with its next 30 days as a tile, `page.money-accounts` drops its line and its tile of ages, `page.money-reports` says its totals and what is promised each month as tiles, `page.money` drops the card from its line and `page.money-ledger` its count of lines to file -> a64cf58225aa0ade',
    ],
  },

  'work@1.26.1': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-dated metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week
      metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later
      metric.tasks-no-project metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours
      metric.tasks-undated-yours metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '88e7565c2cf3b377',
    history: [
      'work 1.26.1 of 3 November (no briefs): `page.work` drops its line of counts over the bands that count themselves, `page.work-board` its line over the columns, and `page.roadmap` keeps only its line for no dated task -> 88e7565c2cf3b377',
    ],
  },

  'work@1.26.2': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-dated metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week
      metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later
      metric.tasks-no-project metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours
      metric.tasks-undated-yours metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '88e7565c2cf3b377',
    history: [
      'work 1.26.2 of 4 November (test triage): `page.work` declares what 1.26.1 did; on a record with no People its bands reading `owner is not someone else` now stay, with that clause taken out -> 88e7565c2cf3b377',
    ],
  },

  'core@1.3.1': {
    holds: `
      page.activity page.calendar page.health page.scripts
    `,
    declares: 'f584ec433faff34e',
    history: [
      'core 1.3.1 of 3 November (no briefs): `page.health` drops its three lines counting what needs a look, and `page.scripts`, `page.calendar` and `page.activity` the line saying what each page is -> f584ec433faff34e',
    ],
  },

  'portfolio@1.31.2': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning
      metric.projects-live metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      metric.readings-held
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: 'bd1a4374b7547281',
    history: [
      'portfolio 1.31.2 of 4 November (Projects page): `page.portfolio` drops How they are going, the bar of health over the projects -> bd1a4374b7547281',
    ],
  },

  'portfolio@1.31.1': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning
      metric.projects-live metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      metric.readings-held
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: 'ea1dbe7b63157a6a',
    history: [
      'portfolio 1.31.1 of 3 November (no briefs): `page.all-numbers` keeps only its line for no reading -> ea1dbe7b63157a6a',
    ],
  },

  'estate@2.8.1': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate page.service
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: 'd299a8ba6a084e4d',
    history: [
      'estate 2.8.1 of 3 November (no briefs): `page.estate` says only what it costs a month, not the questions Waiting on you counts -> d299a8ba6a084e4d',
    ],
  },

  'money-core@3.38.5': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'f1189d68336e0888',
    history: [
      'money-core 3.38.5 of 3 November (no briefs): `page.money-rules` drops its three lines on what the rules filed, keeping the one for no rule -> f1189d68336e0888',
    ],
  },

  'money-core@3.38.7': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'f9779ce508df97a7',
    history: [
      'money-core 3.38.7 of 5 November (going public): `rule.payment-files-paid` and `script.plans` say an invented bill and an invented plan where they named real ones, and nothing else moved -> f9779ce508df97a7',
    ],
  },
  'money-core@3.38.6': {
    holds: `
      metric.account-ages metric.account-gap metric.account-in-by-month metric.account-lines metric.account-now
      metric.account-out-by-month metric.accounts-open metric.arriving-30d metric.balance-by-account metric.balances-stale
      metric.bills-held metric.bills-in-no-book metric.bills-open metric.book-accounts metric.book-cash metric.book-in-by-month
      metric.book-in-month metric.book-lasts-until metric.book-net-by-month metric.book-net-month metric.book-out-by-month
      metric.book-out-month metric.book-owed-by metric.book-owed-to metric.book-spent-month metric.books-held metric.budget-passed-on
      metric.budgets-monthly-total metric.budgets-set metric.budgets-total metric.budgets-unset metric.budgets-weekly
      metric.budgets-weekly-total metric.budgets-yearly metric.budgets-yearly-total metric.card-to-pay metric.card-to-pay-on
      metric.cash-accounts metric.cash-as-of metric.cash-by-account metric.cash-by-book metric.cash-cross-check
      metric.cash-foreign-share metric.cash-now metric.categories-against-direction metric.chasing metric.currencies-held
      metric.days-late-in metric.due-30d metric.due-items-30d metric.every-month-by-category metric.every-month-in
      metric.every-month-net metric.every-month-out metric.filed-by-rule-30d metric.filed-for-you-30d metric.filed-today
      metric.filing-rule-filed metric.filing-rules metric.held-beyond-cash metric.in-30d metric.in-ahead-by-month metric.in-by-month
      metric.in-due-by-month metric.installments-a-month metric.installments-after-next-by-plan metric.installments-due-30d
      metric.installments-late metric.installments-left metric.installments-left-by-plan metric.installments-next-due-by-plan
      metric.installments-paid-by-plan metric.installments-total-by-plan metric.instalments-in-no-book metric.kept-share-90d
      metric.lasts-no-income metric.late-in metric.leaving-30d metric.ledger-in-no-book metric.ledger-newest-days
      metric.ledger-rows-7d metric.left-all metric.left-last metric.left-month metric.left-three metric.left-year
      metric.lines-by-account metric.moved-since metric.net-by-month metric.net-worth metric.net-worth-nights metric.nights-missed-30d
      metric.out-30d metric.out-ahead-by-month metric.out-by-month metric.out-due-by-month metric.over-all metric.over-last
      metric.over-month metric.over-three metric.over-year metric.overdue metric.owed-by-you metric.owed-over-time metric.owed-to-you
      metric.paid-last-by-payee metric.paid-times-by-payee-90d metric.paid-to-by-week metric.payees-paid-90d metric.pending-lines
      metric.pending-out-month metric.pending-out-month-count metric.plan-after-next-by-plan metric.plan-last-due metric.plan-late
      metric.plan-left metric.plan-left-by-plan metric.plan-next-due metric.plan-next-due-by-plan metric.plan-paid
      metric.plan-paid-by-quarter metric.plan-parts metric.plan-parts-by-plan metric.plan-parts-cancelled metric.plan-parts-open
      metric.plan-parts-paid metric.plan-parts-paid-by-plan metric.plans-paying metric.project-in-by-month metric.project-in-month
      metric.project-kept-month metric.project-out-by-month metric.project-out-month metric.project-owed metric.received-30d
      metric.received-7d metric.received-a-month metric.received-all metric.received-last metric.received-month metric.received-three
      metric.received-three-months-back metric.received-year metric.repeating-held metric.repeating-in-no-book
      metric.repeating-overdue metric.rule-filed metric.rules-filing metric.rules-filing-30d metric.runs-out-on metric.runway-days
      metric.settled-in-7d metric.settled-out-7d metric.spent-30d metric.spent-all metric.spent-by-category-last-month
      metric.spent-by-category-month metric.spent-by-category-to-date-last-month metric.spent-by-category-week
      metric.spent-by-category-year metric.spent-in-category-by-week metric.spent-last metric.spent-last-month metric.spent-three
      metric.spent-vs-last-month metric.spent-year metric.spoken-for-month metric.spoken-for-share metric.statement-oldest-days
      metric.stripe-below-zero-count metric.txn-uncategorised metric.uncategorised-share-30d metric.unfiled-month
      metric.unfiled-spent-month metric.unnamed-paid-90d
      page.money page.money-account page.money-accounts page.money-bill page.money-book page.money-budgets page.money-coming
      page.money-forecast page.money-ledger page.money-payees page.money-plan page.money-reports page.money-rules
      register.accounts register.balances register.books register.categories register.filing_rules register.fx register.installments
      register.obligations register.payee_names register.plans register.recurring register.snapshots register.transactions
      rule.account-files-book rule.bill-moves-line rule.bill-takes-book rule.budget-near rule.budget-over rule.card-limit-owes
      rule.card-text-owes rule.category-correction-asks rule.category-correction-yes rule.category-stays-asks rule.category-stays-yes
      rule.category-taught rule.category-teaches rule.entry-takes-book rule.installment-due-soon rule.instalment-settles
      rule.invoice-chased rule.invoice-late rule.part-counts-plan rule.part-takes-book rule.payee-named-back rule.payment-files-paid
      rule.payment-matches rule.payment-matches-again rule.payment-settles rule.payment-unsettles rule.plan-links-parts
      rule.plan-made-one rule.posted-replaced rule.recurring-ended rule.recurring-missed rule.recurring-stopped
      rule.recurring-went-through rule.repeat-takes-book rule.rule-files-back rule.txn-categorise
      script.book_from_account script.budget_watch script.card_owed script.category_correction script.category_stays script.file_back
      script.file_paid script.last_day script.learn_category script.ledger_twice script.match_payment script.move_line
      script.name_payees script.offer_budgets script.plans_from_names script.post_due script.replace_posted script.settle
      script.settle_matched_line script.unsettle
      setting.home_currency setting.most_days_late setting.most_due_30d setting.most_leaving_30d setting.most_left_in_parts
      setting.most_on_one_category setting.most_out_30d setting.most_out_every_month setting.most_owed_by_you setting.most_owed_to_you
      setting.most_parts_due_30d setting.most_spent_30d setting.most_spent_on_one_category setting.rest_days
    `,
    declares: 'a042ee8f7f2b6ddc',
    history: [
      'money-core 3.38.6 of 4 November (test triage): the `correction` of `register.categories` and `corrects` of `register.transactions` read "A correction and not spending", as a comma ends a clause -> a042ee8f7f2b6ddc',
    ],
  },

  'work@1.24.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-dated metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week
      metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later
      metric.tasks-no-project metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours
      metric.tasks-undated-yours metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '351a66ed8b093930',
    history: [
      'Work 1.24.0, empty states of 2 November: `page.work` leaves its none-late line out while nothing is open, and `page.roadmap` says what will stand on it over `metric.tasks-dated` -> 351a66ed8b093930',
    ],
  },

  'work@1.25.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-dated metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week
      metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later
      metric.tasks-no-project metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours
      metric.tasks-undated-yours metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: 'e559c20bfa7b2dde',
    history: [
      'Work 1.25.0, pages polish of 2 November: `register.tasks` says a task\'s name as Task where it said Description -> e559c20bfa7b2dde',
    ],
  },

  'work@1.26.0': {
    holds: `
      metric.open-tasks metric.project-dated metric.project-done-7d metric.project-done-by-week metric.project-due-soon
      metric.project-held-up metric.project-in-review metric.project-last-worked metric.project-moved-7d metric.project-open
      metric.tasks-after-week-yours metric.tasks-dated metric.tasks-done-7d metric.tasks-done-7d-agents metric.tasks-done-by-week
      metric.tasks-due-7d metric.tasks-due-by-week metric.tasks-in-play metric.tasks-late-yours metric.tasks-later
      metric.tasks-no-project metric.tasks-not-this-week metric.tasks-overdue metric.tasks-this-week-yours metric.tasks-today-yours
      metric.tasks-undated-yours metric.tasks-waiting metric.tasks-week-yours metric.tasks-with-agents
      page.roadmap page.work page.work-board
      register.tasks register.tracks register.updates
      rule.close_follow_ups rule.start_with_parent
      script.close_follow_ups script.start_with_parent
    `,
    declares: '44aaba9f9b720e04',
    history: [
      'Work 1.26.0, pages polish (second pass) of 2 November: `page.work-board` says its line with what needs somebody first and what is kept for later last -> 44aaba9f9b720e04',
    ],
  },

  'people@4.4.0': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: 'dd7cbe4e00dfb34e',
    history: [
      'People 4.4.0, empty states of 2 November: `page.people` says it holds only you while it holds nobody else -> dd7cbe4e00dfb34e',
    ],
  },

  'people@4.4.1': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '8fde6ca9614538af',
    history: [
      'People 4.4.1, empty states of 2 November: `page.people` says how many organisations once, its note under the line is the way to them -> 8fde6ca9614538af',
    ],
  },

  'people@4.5.0': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '1f00311e183ad608',
    history: [
      'People 4.5.0, onboarding9 of 2 November: `register.people` offers `cofounder` and `partner` on `role`, said as Co-founder and Business partner -> 1f00311e183ad608',
    ],
  },

  'people@4.6.0': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders
    `,
    declares: '4ee0ab4f0f32c7ee',
    history: [
      'People 4.6.0, onboarding10 of 2 November: `register.people` offers `staff` on `role`, said as Staff -> 4ee0ab4f0f32c7ee',
    ],
  },

  'people@4.7.0': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders rule.people-fields
      script.people_fields
    `,
    declares: '928a7671f80e8530',
    history: [
      'People 4.7.0, fin-people1104 of 3 November: `register.people` keeps a person\'s facts as fields, `script.people_fields` and `rule.people-fields` offer to move what a note says into them, and `page.people` drops its line of counts -> 928a7671f80e8530',
    ],
  },

  'people@4.7.1': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders rule.people-fields
      script.people_fields
    `,
    declares: '157dbadd3d1ed44a',
    history: [
      'People 4.7.1, fin-notes1104 of 4 November: `script.people_fields` keeps each line of a note it read nothing from as written, and once a row holds every fact its note says, asks to take their name as a heading and a one-line deal out of the note and to keep a short first line as About -> 157dbadd3d1ed44a',
    ],
  },

  'people@4.7.2': {
    holds: `
      metric.organisations-clients metric.organisations-count metric.organisations-from-card-texts metric.organisations-known
      metric.organisations-not-clients metric.people-clients metric.people-count metric.people-in-touch-12w metric.people-in-touch-30d
      metric.people-in-touch-90d metric.people-not-clients metric.people-quiet
      page.people page.relation page.someone
      register.organisations register.people
      rule.meet-payees rule.meet-sender-organisations rule.meet-senders rule.people-fields
      script.people_fields
    `,
    declares: '51a1eb436db60ba7',
    history: [
      'People 4.7.2, rest1104 of 4 November: a comment inside `script.people_fields` named real people and companies, and every install was handed it as source. Invented now; only the source moved. -> 51a1eb436db60ba7',
    ],
  },

  'portfolio@1.31.0': {
    holds: `
      metric.kpi-stale metric.kpis-held metric.project-plan-path metric.project-plan-roadmap metric.project-said metric.project-staged
      metric.projects-aim-30d metric.projects-aiming metric.projects-by-health metric.projects-by-lane metric.projects-earning
      metric.projects-earning-before metric.projects-earning-change metric.projects-earning-said metric.projects-lane-earning
      metric.projects-live metric.projects-looked-up metric.projects-need-you metric.projects-not-in-play metric.projects-on-track
      metric.projects-parked metric.projects-past-aim metric.projects-retired metric.projects-with-agent metric.projects-with-health
      metric.readings-held
      page.all-numbers page.portfolio
      register.datapoints register.kpis register.stages register.things
      rule.kind-offers-kpis rule.project-past-aim
      script.kind_drafts script.kpi_backfill
    `,
    declares: 'ceaee2d1aac29aa2',
    history: [
      'Portfolio 1.31.0, empty states of 2 November: `metric.readings-held` added, and `page.all-numbers` says what it will list while it holds no reading -> ceaee2d1aac29aa2',
    ],
  },

  'estate@2.8.0': {
    holds: `
      metric.domains-held metric.estate-month metric.estate-month-by-kind metric.estate-year metric.lapsing metric.points-nowhere
      metric.project-cost metric.renews-30d metric.renews-90d metric.services-held
      page.estate page.service
      register.services
      rule.renew-soon rule.renewal-cancelled rule.renewal-kept rule.renewal-passed
      setting.most_a_month setting.most_a_year setting.most_a_year_on_a_project setting.most_lapsing setting.most_renewing_30d
    `,
    declares: '6f7225c5c3087f40',
    history: [
      'Estate 2.8.0, empty states of 2 November: `register.services` says what it holds without naming October or the record -> 6f7225c5c3087f40',
    ],
  },
};

/** The shortest a reason may be. The value it justifies is sixteen characters, and a reason has to be worth more room than that. */
const REASON_FLOOR = 40;

/** A history line: what moved, then the value it set. */
const LINE = /^(.+) -> ([0-9a-f]{16})$/u;

/** A reason has to name something the pack declares, in backticks, with or without its kind in front. */
const cites = (why: string, holds: readonly string[]): boolean =>
  holds.some((id) => why.includes(`\`${id}\``) || why.includes(`\`${id.slice(id.indexOf('.') + 1)}\``));

/**
 * WHAT IS WRONG WITH ONE ENTRY, in the words the next person needs, and nothing when nothing is. `current` says whether
 * this is the version the pack is on now: a retired entry is still held to its shape, because its history is the record
 * of what that label meant, but only the current one is held to what the pack declares today.
 *
 * ONE FUNCTION RATHER THAN ASSERTIONS INLINE, so that the second test below can drive every refusal over an entry made
 * up for the purpose. A guard nobody has watched refuse is a guard nobody has tested.
 */
function wrong(key: string, entry: Version | undefined, live: { holds: readonly string[]; declares: string; current: boolean }): string[] {
  const said: string[] = [];
  if (entry === undefined) return [`${key} is not in DECLARED. Add an entry holding '${live.declares}' and the ids the pack provides.`];

  /* WHAT A RECORD HOLDS FIRST, because this is the question the fingerprint answers with the same sentence as a reworded
     heading, and the two want opposite moves. */
  if (entry.holds === undefined) {
    if (live.current) said.push(`${key} records no ids, and the version a pack is on has to: holds: '${live.holds.join(' ')}'`);
  } else if (live.current) {
    const was = new Set(ids(entry.holds));
    const gained = live.holds.filter((i) => !was.has(i));
    const lost = [...was].filter((i) => !live.holds.includes(i)).sort();
    if (gained.length > 0 || lost.length > 0)
      said.push(
        `${key} ${[gained.length > 0 ? `gained ${gained.join(', ')}` : '', lost.length > 0 ? `lost ${lost.join(', ')}` : ''].filter((s) => s !== '').join(' and ')}. That is a declaration a record on ${key} does not have and can never be told about, so there is no fingerprint to set again for it: raise the version in FIRST_PARTY_VERSIONS and give the new one its own entry here.`,
      );
  }

  /* THEN THE HISTORY, whose last line is where the current value has to be said a second time. */
  if (entry.history === undefined || entry.history.length === 0) {
    if (live.current) said.push(`${key} has no history, and the version a pack is on has to: one line saying what set '${entry.declares}', ending in it.`);
  } else {
    const seen = new Set<string>();
    for (const line of entry.history) {
      const parts = LINE.exec(line);
      if (parts === null) {
        said.push(`${key} has a history line that is not "<what moved> -> <fingerprint>": ${JSON.stringify(line)}`);
        continue;
      }
      const why = parts[1]!.trim();
      const set = parts[2]!;
      if (why.length < REASON_FLOOR) said.push(`${key} gives ${why.length} characters of reason for ${set} where ${REASON_FLOOR} is the floor: ${JSON.stringify(why)}. Say which change moved it.`);
      /* THE CITATION IS ASKED OF THE CURRENT ENTRY ONLY, because it is the one live list it can be asked against. A
         retired line citing a declaration a later version drops would start failing years afterwards, in a sentence
         nobody can honestly rewrite: the history of what a label meant is not editable. */
      if (live.current && !cites(why, live.holds))
        said.push(`${key} names nothing the pack declares in its reason for ${set}. Put the id whose words moved in backticks, one of ${live.holds.slice(0, 3).join(', ')} and the rest.`);
      if (seen.has(set)) said.push(`${key} lists ${set} twice. A reset appends a line for a value it has never declared before, and repeating one says nothing.`);
      seen.add(set);
    }
    const last = LINE.exec(entry.history[entry.history.length - 1]!)?.[2];
    if (last !== undefined && last !== entry.declares)
      said.push(`${key} declares ${entry.declares} and its last history line set ${last}. A fingerprint moved with the history left alone is the reset this guard exists to make somebody say out loud.`);
  }

  /* AND WHAT THE DECLARATIONS SAY. */
  if (live.current && entry.declares !== live.declares)
    said.push(
      `${key} declares something else now. If ${key.slice(key.indexOf('@') + 1)} has not been released, set declares to '${live.declares}' and append a history line saying which change moved it, ending in that value; if it has been released, raise the version.`,
    );
  return said;
}

test('EACH FIRST-PARTY PACK DECLARES WHAT ITS VERSION SAYS, and one that changed has a version of its own', () => {
  const said: string[] = [];
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id, { seeds: [] }) as Doc;
    const version = FIRST_PARTY_VERSIONS[id];
    if (doc.version !== version) said.push(`${id}: the document and the manifest disagree`);
    const now = fingerprint(doc);
    if (version === '1.0.0') {
      if (now !== fingerprint(RELEASED_1_0_0[id]!))
        said.push(
          `${id} changed since 1.0.0 and is still 1.0.0, so a record that has it is never offered the change. Raise its version in FIRST_PARTY_VERSIONS and give '${id}@<version>' an entry in DECLARED here.`,
        );
      continue;
    }
    said.push(...wrong(`${id}@${version}`, DECLARED[`${id}@${version}`], { holds: inventory(id, doc), declares: now, current: true }));
    if (now === fingerprint(RELEASED_1_0_0[id]!)) said.push(`${id} is ${version} and declares what 1.0.0 did, so its records would be asked to update for nothing`);
  }

  /* AND EVERY RETIRED ENTRY IS HELD TO THE SAME SHAPE, because its history is the only record left of what that label
     meant on the day a record installed it, and a history with a line nobody wrote is not a record. */
  for (const [key, entry] of Object.entries(DECLARED)) {
    const id = key.slice(0, key.indexOf('@')) as FirstPartyId;
    if (key === `${id}@${FIRST_PARTY_VERSIONS[id]}`) continue;
    said.push(...wrong(key, entry, { holds: inventory(id, firstPartyDocument(id, { seeds: [] }) as Doc), declares: entry.declares, current: false }));
  }
  assert.deepEqual(said, []);
});

/**
 * THE GUARD'S OWN REFUSALS, driven over entries made up for the purpose.
 *
 * WRITTEN BECAUSE THE GUARD THIS REPLACES WAS ANSWERED FIVE TIMES IN SEVEN HOURS AND NEVER ONCE REFUSED ANYTHING a
 * person had to think about. Every rule the comments above claim is enforced is exercised here with the smallest entry
 * that breaks it, so that a rule quietly dropped from `wrong()` takes a test with it rather than going unnoticed until
 * the next review reads the diff.
 */
test('THE GUARD REFUSES AN ENTRY WITH NO REASON BESIDE ITS FINGERPRINT, and names which rule the entry broke', () => {
  const live = { holds: ['page.portfolio', 'register.things'], declares: 'aaaaaaaaaaaaaaaa', current: true };
  const ok = {
    holds: 'page.portfolio register.things',
    declares: 'aaaaaaaaaaaaaaaa',
    history: ['A project says how it is going, which is a field on `things` and a column on `page.portfolio` -> aaaaaaaaaaaaaaaa'],
  } satisfies Version;
  const one = (entry: Version, over: Partial<typeof live> = {}): string => wrong('made-up@1.1.0', entry, { ...live, ...over }).join(' | ');

  assert.deepEqual(wrong('made-up@1.1.0', ok, live), [], 'the entry every case below breaks is itself refused');

  /* THE HALF A HASH COULD NOT SEE. A declaration appearing or vanishing has no reset: it has a version. */
  assert.match(one({ ...ok, holds: 'page.portfolio' }), /register\.things/u);
  assert.match(one({ ...ok, holds: 'page.portfolio register.things rule.made-up' }), /rule\.made-up/u);
  assert.match(one({ ...ok, holds: 'page.portfolio' }), /raise the version/iu);
  assert.match(one({ declares: ok.declares, history: ok.history }), /records no ids/u);

  /* THE RESET THAT COSTS NOTHING. A fingerprint moved with the history left alone is the whole finding. */
  assert.match(one({ ...ok, declares: 'bbbbbbbbbbbbbbbb' }, { declares: 'bbbbbbbbbbbbbbbb' }), /its last history line set aaaaaaaaaaaaaaaa/u);
  assert.match(one({ holds: ok.holds, declares: ok.declares }), /no history/u);
  assert.match(one({ ...ok, history: [] }), /no history/u);

  /* A LINE THAT IS NOT A REASON. Too short, no fingerprint, or a sentence naming nothing the pack declares. */
  assert.match(one({ ...ok, history: ['copy -> aaaaaaaaaaaaaaaa'] }), /characters of reason/u);
  assert.match(one({ ...ok, history: ['aaaaaaaaaaaaaaaa'] }), /not "<what moved> -> <fingerprint>"/u);
  assert.match(one({ ...ok, history: ['Something about the pack that names none of its declarations at all -> aaaaaaaaaaaaaaaa'] }), /names nothing the pack declares/u);

  /* AND THE OBVIOUS WAY ROUND THE LINE: append one that repeats a value already listed. */
  assert.match(
    one({ ...ok, history: [...ok.history, 'A second line saying the same thing about `things` all over again -> aaaaaaaaaaaaaaaa'] }),
    /lists aaaaaaaaaaaaaaaa twice/u,
  );
});

/**
 * AND THE TOOL THAT PRINTS THE ENTRY THIS GUARD IS ABOUT TO DEMAND.
 *
 * WRITTEN BECAUSE THE ENTRY WAS HAND-FED THREE TIMES IN TWO DAYS, most recently `portfolio@1.4.0` in `a89bc072`,
 * every time by somebody reading a fingerprint out of another agent's report. `packages/seed/scripts/fingerprint.mjs`
 * computes it instead, and this test is what keeps the tool and the guard from drifting apart: the ids and the
 * fingerprint it prints have to be the ones the guard computes live, and the entry it prints has to be REFUSED, exactly
 * once, for the one thing a tool cannot supply. The reason is the only field a person still writes, which is the point
 * of the guard.
 *
 * RE-AUTHORED BY THE CALLER after the run that wrote it lost this file to a concurrent restore; the tool itself
 * survived. Both halves were driven by hand here: with the tool's inventory narrowed the ids assertion goes red, and
 * with a citation written into the tool's own placeholder reason the "refused exactly once" assertion goes red.
 */
test('THE FINGERPRINT TOOL PRINTS WHAT THE GUARD DEMANDS, and the guard still refuses it for the reason nobody can compute', () => {
  const printed = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/fingerprint.mjs', import.meta.url))], { encoding: 'utf8' });
  let held = 0;
  for (const id of FIRST_PARTY) {
    const version = FIRST_PARTY_VERSIONS[id];
    if (version === '1.0.0') continue;
    const key = `${id}@${version}`;
    const block = printed.slice(printed.indexOf(`'${key}': {`));
    assert.ok(block !== '' && printed.includes(`'${key}': {`), `${key}: the tool printed no entry for the version the pack is on`);
    const holds = /holds: `([^`]*)`/u.exec(block)?.[1] ?? '';
    const declares = /declares: '([0-9a-f]{16})'/u.exec(block)?.[1] ?? '';
    const history = /history: \[\n\s*'([^']*)',/u.exec(block)?.[1] ?? '';
    const doc = firstPartyDocument(id, { seeds: [] }) as Doc;
    assert.deepEqual(ids(holds), inventory(id, doc), `${key}: the ids the tool printed are not the ids the pack provides`);
    assert.equal(declares, fingerprint(doc), `${key}: the fingerprint the tool printed is not the one the guard computes`);
    const refusals = wrong(key, { holds, declares, history: [history] }, { holds: inventory(id, doc), declares: fingerprint(doc), current: true });
    assert.equal(refusals.length, 1, `${key}: the printed entry should be refused exactly once, for its reason, and it said ${refusals.join(' | ')}`);
    assert.match(refusals[0]!, /names nothing the pack declares|characters of reason/u, `${key}: refused for something other than its unwritten reason`);
    held += 1;
  }
  assert.ok(held >= 3, 'the tool was asked about fewer packs than are off 1.0.0');
});
