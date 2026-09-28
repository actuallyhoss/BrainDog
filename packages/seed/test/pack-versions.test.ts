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
      /* AN ID GAINED UNDER A LABEL, which the guard answers with "raise the version", and it was not raised. Measured on
         22 September before writing this: `gh run list --workflow deploy.yml` showed every deploy since `aeef01c5`
         introduced 1.6.0 as `skipped`, because no `ci` run on master had completed, so no record anywhere has been
         offered 1.6.0 and there is no record on it to strand. Raising to 1.7.0 would also have put a version nobody
         shipped between 1.5.0 and this one. If a deploy has succeeded by the time this is read, this line is wrong and
         the id belongs to 1.7.0. */
      /* THE LAST SENTENCE ABOVE IS NOT RIGHT, and 1.7.0 was asked for on the strength of it and not raised. Measured
         on 22 September at 07:30 UTC: the last successful deploy is `8bbf469e` at 16:23 UTC on the 21st, before
         `aeef01c5` set 1.6.0, and the one run not yet finished is `ci` on `d9e43931`, which has `3bc64513` behind it. A
         deploy ships a whole commit, so every build that can now reach a record carries `ingest.bank-from-in` under
         1.6.0, and no record can hold a 1.6.0 without it. What a first successful deploy does change is the next line:
         from then on 1.6.0 is released, and any id added under it is a raise to 1.7.0, not a line here. */
      'Still before any release, since every deploy since 1.6.0 was skipped: `ingest.bank-from-in` reads the `From HSBC:` credit off the `+` glued to its figure, and `ingest.bank-from-out` and `ingest.bank-from-unsure` refuse that sign so no line is claimed twice -> 03f76621c84239df',
    ],
  },
  /**
   * A VERSION AND NOT A RESET, AS THE LINE ABOVE ASKS FOR AN ID GAINED. Eight ids arrive, so 1.6.0 cannot be set again
   * whatever its release state. Measured on 22 September with `gh run list --workflow deploy.yml`: every deploy since
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
      'Raised for the eight webhook twins his iOS Shortcut posts a bank SMS to, `ingest.bank-from-out-sms` and the seven beside it, each the reading of its mail pattern behind `verify: { kind: path }`, matching nothing until an owner mints its token -> 9b29858e7ee11345',
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
      '`register.transactions` declares `pairs:`, the move `baf7048a` put under the shipped 2.1.0: both cleared legs of a move between two accounts are marked `transfer`, and a leg naming who it was with (`party`) or the obligation it paid (`settles`) pairs with nothing, so rent and a client paying the same sum a day later stay in Spent and Received (audit sixty-one, M4 and M5) -> 4640c85c0ef44586',
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
      '`register.transactions` keeps a reconciled card bill paired: `pairs.where` reads `settles is empty or transfer is true`, so a leg that settles an obligation stays the leg of a move it already is and still starts none, where at 2.2.0 setting `settles` on the bank leg parted the pair and EGP 9,500.00 read as spent and as received (audit sixty-three, finding 3, F4) -> 8ad733c726f4fd0b',
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
      '`register.obligations` gains `ends`, the last day a repeating row moves money on, and the obligations leg of both walks on `page.money` names it, so a bill the old tool says ends on 10 November stops walking on the 10th where at 2.3.0 it walked every month to the horizon, because the import writes an end only where the list declares one (`5d4bbf8b`) -> 47e60867f14c18d0',
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
      'The installments leg both walks on `page.money` read names `group: plan`, so each part of a plan reaches the chart as that plan and the count control can take the proofing press in or out whole, where every part was its own one-off; Cash ahead\'s knobs add `grow`, `drift` and `count` to horizon, late, spend and leave (brief B6) -> c98b58b3df5eaca1',
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
      /* THE SAME VERSION, BECAUSE 1.6.0 HAS NOT SHIPPED. Measured on 22 September with `gh run list --workflow deploy`:
         the last successful deploy is still `8bbf469e` at 16:23 UTC on the 21st, and `7e796bbe`, which set 1.6.0, is
         not behind it. Every deploy since was skipped. */
      'Still before any release: `page.work` gains a seventh list, No due day, `state is open or doing, agent is empty, by is empty`, because a task of yours with no due day was under none of the six and `by is empty or after +7d` is refused. Done lately goes back to the full width to make room -> bc6a8f4d4c3319ab',
      'Still before any release, since every deploy since 1.6.0 was skipped: Waiting on you on `page.work` declares `what, note, by, changed`, so a todo row carries its due day and who changed it last as the third and fourth cells `c6e2a331` widened the kind to (`loop/research-batch-twenty-eight-audit.md` finding 3) -> 1e1996952c4dce03',
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
      'A task\'s follow-ups close with it and start in its project (W59-1): `rule.close_follow_ups` starts `script.close_follow_ups` when a task moves to done, which closes every step `Part of` it still open, doing or blocked, and `rule.start_with_parent` starts `script.start_with_parent` when a task is created with a parent, which gives it the parent\'s project and thread -> e4126747e977dddd',
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
 * the next audit reads the diff.
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
