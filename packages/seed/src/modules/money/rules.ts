/**
 * Money's rules, and the automations that act on an answer to one of them.
 *
 * CLOSING AN ACCOUNT IS WRITTEN AND NOT SHIPPED YET (`CLOSE_ACCOUNT_AUTOMATIONS`, in `close-account.ts`). An account closed
 * with money on it drops that money out of Cash now without a word, and `scripts/close-account.js` is the question
 * that stops it. Its script, the rule that starts it and the automation that acts on the answer are all here, in the
 * form the record installs, and `money-close-account-wired.test.ts` installs them and measures how far they reach:
 * closing an account starts the script, and there it stops, for the three reasons that list gives.
 */

import type { SeedRule } from '../base.ts';
import { OBLIGATIONS_REGISTER } from './lists/obligations.ts';
import { BOOK_FROM_ACCOUNT_SCRIPT } from './scripts/book-from-account.js';
import { BUDGET_WATCH_SCRIPT } from './scripts/budget-watch.js';
import { FILE_BACK_SCRIPT } from './scripts/file-back.js';
import { NAME_PAYEES_SCRIPT } from './scripts/name-payees.js';
import { FILE_PAID_RULE, FILE_PAID_SCRIPT } from './scripts/file-paid.js';
import { LAST_DAY_SCRIPT } from './scripts/last-day.js';
import { LEARN_CATEGORY_SCRIPT } from './scripts/learn-category.js';
import { LEDGER_TWICE_SCRIPT } from './scripts/ledger-twice.js';
import { OFFER_BUDGETS_SCRIPT } from './scripts/offer-budgets.js';
import { MATCH_PAYMENT_SCRIPT } from './scripts/match-payment.js';
import { CARD_OWED } from './scripts/card-owed.js';
import { MOVE_LINE } from './scripts/move-line.js';
import { PLANS_FROM_NAMES_SCRIPT } from './scripts/plans-from-names.js';
import { SETTLE_SCRIPT } from './scripts/settle.js';
import { UNSETTLE_RULE, UNSETTLE_SCRIPT } from './scripts/unsettle.js';

export { CLOSE_ACCOUNT_AUTOMATIONS } from './close-account.ts';

/**
 * WHICH FILING RULES MAY FILE AN ENTRY, as `link.to.where` over `filing_rules`, filled from the entry being filed: the
 * rule is on, it goes the entry's way or either way, and it names the entry's account or no account.
 *
 * NOT WHETHER THE RULE'S CATEGORY IS STILL LIVE. That is a question about the row the rule points at, and this filter
 * reads one list. The record leaves out a category that was deleted or retired when it takes it (`take`), and writes
 * no rule into `filed_by` where it took nothing (`also`).
 */
const FILED = (reads: 'payee' | 'description') => ({
  all: [
    { field: 'state', is: 'on' },
    { field: 'reads', is: reads },
    { field: 'direction', in: ['{{direction}}', 'either'] },
    { any: [{ field: 'account', empty: true }, { field: 'account', is: '{{account}}' }] },
  ],
});

/** Which categories may file an entry by their own "Matches": a live one that goes the entry's way or either way. */
const NAMED = { all: [{ field: 'state', is: 'live' }, { field: 'direction', in: ['{{direction}}', 'both'] }] };

/**
 * The one step that files by one text of the entry: the rule's category into `category`, the rule into `filed_by`.
 *
 * ONE LOOKUP THAT WRITES BOTH, OR NEITHER (`also`). It was two, and only the first asked about the category: where
 * that one found a rule and linked nothing, because the rule's category was gone or retired, the second still wrote
 * the rule into `filed_by`, beside whatever category an earlier step filed. Now the rule found is written only where
 * its category is.
 */
const filedBy = (reads: 'payee' | 'description', value: string): Record<string, unknown> => ({
  link: { field: 'category', to: { register: 'filing_rules', by: 'match', value, where: FILED(reads), take: 'category', also: 'filed_by' } },
});

/**
 * The rules Money ships with. A rule asks where a person has a choice to make, and tells or acts where there is none.
 *
 * A QUESTION IN DECIDE ONLY WHERE THERE IS A CHOICE. An invoice more than a week late is a thing somebody chooses to
 * chase or not, and a repeating line whose day has gone either went through or stopped; each is put in front of the
 * owner once, by the row and the day that made it true (`once_per`), and the answer is acted on by
 * `MONEY_AUTOMATIONS` below. The record re-reads a rule about time as time passes, so an invoice that goes late while
 * nobody touches it is asked about too.
 */
export const MONEY_RULES: Record<string, SeedRule> = {
  'invoice-late': {
    rule: 'invoice-late',
    pack: 'money-core',
    register: 'obligations',
    when: 'direction is owed to me, state is open or part, due before -7d',
    then: [{ suggest: { question: '{{what}} was due {{ago:due}}, {{money:amount}}. Chase it?', options: ['Chase it', 'Not yet'] } }],
    once_per: ['entry', 'due'],
  },
  /* A BALANCE MORE THAN A WEEK OLD WAS TOLD BY `cash-stale`, FROM money-core 3.1.0 TO 3.15.0, a note on the account each
     time its typed "As of" passed a week. It read the typed day, which a bank message never writes, so on the owner's
     record it told of every account and would have gone on telling after messages filed. It goes at money-core 3.16.0:
    Money's Heads up names how old the oldest balance is from the roll's own day (`cash-as-of`), its Last
     confirmed tile dates each account by its newest statement (`account-ages`), and `statement-oldest-days` is the sign. */
  /**
   * THE ONE RULE HERE THAT ACTS, and it acts because there is nothing to decide.
   *
   * An entry whose text a filing rule already names has its category filed by the record rather than asked about,
   * which is the difference between a ledger somebody keeps and a ledger somebody abandons: the third time
   * `FENWICK CLOUD` arrives, being asked what it is for is an insult. What the rule cannot reach is what the figure
   * counts, so nothing is hidden by it.
   *
   * IT LINKS THROUGH `filing_rules`, SINCE money-core 3.17.0, AND IT LINKED A CATEGORY BY ITS "Matches".
   * That link read neither which way the category goes nor anything else about it, so a category for money in was put
   * on money going out. Now the rule found is one that is on, goes the entry's way or either, and names the entry's
   * account or none (`FILED`), and the entry is given that rule's category (`take`). Which rule fits is the record's
   * ladder: the whole text, how it starts, anywhere in it, a pattern, and on one rung the longest. Two that fit
   * equally file nothing, because no category is better than a wrong one.
   *
   * ONE STEP FOR EACH TEXT A RULE MAY READ, TWO IN ALL. The description is tried first and "As the bank
   * wrote it" after it, and a later step that finds a rule writes over the earlier one, so a rule on "As the bank wrote
   * it" wins where both fit. An entry with no "As the bank wrote it" is left to the rules that read the description. Each is
   * one lookup that writes the rule's category and, with it, the rule itself into `filed_by` (`filedBy`).
   *
   * AND A CATEGORY'S OWN "Matches" STILL FILES, FOR THE ONE VERSION THAT FIELD STAYS. It is the first step, so any
   * filing rule that fits writes over it, and it now reads the category too (`NAMED`): a live one that goes the entry's
   * way. A record that updates files as it did the day before, less the entries it was filing the wrong way, until each
   * "Matches" has become a rule. An entry filed this way has no `filed_by`.
   *
   * `once_per: [entry]` means once an entry, ever. A category cleared by hand afterwards stays cleared,
   * which is `32-PARITY` §3.2's rule that a field a person set is never overwritten by a rule.
   */
  'txn-categorise': {
    rule: 'txn-categorise',
    pack: 'money-core',
    register: 'transactions',
    when: 'state is cleared, transfer is false, category is empty, parts is empty',
    then: [
      { link: { field: 'category', to: { register: 'categories', by: 'match', value: '{{what}}', where: NAMED } } },
      filedBy('description', '{{what}}'),
      filedBy('payee', '{{counterparty_text}}'),
    ],
    once_per: ['entry'],
  },
  /**
   * AN INSTALMENT IS TOLD, NOT ASKED. `invoice-late` asks because there is a choice in front of
   * the person: chase or wait. A part of a plan already agreed has no choice in
   * it, so a question with two options would be a question whose answer is always the same, and the
   * gate is the one place in this product that must never fill up with those.
   */
  'installment-due-soon': {
    rule: 'installment-due-soon',
    pack: 'money-core',
    register: 'installments',
    when: 'state is open, due before +8d',
    then: [{ notify: { say: '{{what}} is due {{until:due}}: {{money:amount}}.' } }],
    once_per: ['entry', 'due'],
  },
  /**
   * A REPEATING ITEM WHOSE DAY HAS GONE AND WHICH IS STILL LIVE. Either it went through and nobody moved
   * the date, or it has stopped, and those are different problems with one symptom.
   *
   * ASKED, SINCE money-core 3.1.0, AND IT WAS TOLD. The notice said which day it was and left the person to find the
   * row and end it by hand, so a line that had stopped went on walking in Cash ahead until somebody ended it.
   * Now it asks once for each day it was due (`once_per`): "It went through" moves "Next" one cycle on
   * (`recurring-went-through`, since money-next-moves-100), and "It stopped" ends the line (`recurring-stopped`). The
   * words fit money in as well as money out, since pay coming in is a repeating line too.
   */
  'recurring-missed': {
    rule: 'recurring-missed',
    pack: 'money-core',
    register: 'recurring',
    when: 'state is live, next_due before today',
    then: [{ suggest: { question: '{{what}} was due {{ago:next_due}}, {{money:amount}}. Did it go through?', options: ['It went through', 'It stopped'] } }],
    once_per: ['entry', 'next_due'],
  },
  /**
   * A SCHEDULE WHOSE LAST DAY HAS GONE, MOVED AS WELL AS FILTERED AROUND.
   *
   * NOTHING IN THE TREE EVER FLIPPED `state` WHEN `ends` PASSED, and every reader of `recurring`
   * paid for it: a line that stopped in March was counted at its full monthly share for ever by
   * every block and figure that read `state is live`.
   *
   * THE MONTHLY FIGURES FILTER ON `ends` AS WELL, SINCE money-core 3.0.0 (`LIVE_LINES`), in the tree
   * form, because the sentence cannot join a choice to the other clauses. A block or a list a person
   * filters by hand reads the sentence, so the row is moved too: `ends is empty` alone would drop
   * exactly the rows still running, because an importer writes `ends` only when it is ahead.
   *
   * SO THE ROW IS MOVED WHERE IT IS. `rulesAboutTime` (`packages/kernel/src/index.ts`) sweeps
   * hourly every rule whose `when:` names a relative day and which declares `once_per`, so this one
   * is re-read as time passes rather than only when somebody writes the row, and one `move` puts the
   * register page and every other reader right at once.
   *
   * IT ACTS INSTEAD OF ASKING, for the reason `installment-due-soon` tells instead of asking: a
   * schedule that says it stopped in March has nothing left to decide, and a question whose answer
   * is always the same is what must never fill the gate.
   *
   * `once_per: ['entry', 'ends']` IS ONCE A ROW PER END DAY. A person who reopens a schedule by
   * hand and leaves the old `ends` behind it keeps their write, which is `32-PARITY` §3.2; one who
   * moves `ends` forward is out of the filter anyway, and one who moves it to another past day is
   * asking for it to end again and gets that.
   */
  /**
   * A BUDGET PAST ITS WARNING, AND ONE OVER, SINCE money-core 3.29.0: told once a category a month. A month's spending is
   * a sum over the Ledger and a rule reads one row, so `script.budget_watch` works it out once a day and marks the
   * category `near` or `over` with the month; these tell of the mark. `once_per: [entry, warned_month]` is once a
   * category a month for each, so the warning is not said again the next day, and next month's says it afresh. A
   * category that goes over without passing its warning first is told it is over and nothing else.
   *
   * A WEEK OR A YEAR SINCE money-core 3.31.0: the mark carries the period's words (`warned_for`, "this week"), which the
   * warning says where it said "this month", and `warned_month` holds the period's key, so `once_per` is once a period.
   */
  'budget-near': {
    rule: 'budget-near',
    pack: 'money-core',
    register: 'categories',
    when: 'budget_warned is near, warned_month is set, warned_for is set',
    then: [{ notify: { say: '{{name}} is past {{budget_alert}}% of its {{money:budget}} budget {{warned_for}}.' } }],
    once_per: ['entry', 'warned_month'],
  },
  'budget-over': {
    rule: 'budget-over',
    pack: 'money-core',
    register: 'categories',
    when: 'budget_warned is over, warned_month is set, warned_for is set',
    then: [{ notify: { say: '{{name}} is over its {{money:budget}} budget {{warned_for}}.' } }],
    once_per: ['entry', 'warned_month'],
  },
  'recurring-ended': {
    rule: 'recurring-ended',
    pack: 'money-core',
    register: 'recurring',
    when: 'state is live, ends before today',
    then: [{ move: 'ended' }],
    once_per: ['entry', 'ends'],
  },
};

/** What "Chase it" drafts on a late invoice. Both fields are required on an invoice, so neither form writes a dash. */
export const CHASE_DRAFT = 'The invoice for {{short:amount}} was due on {{on:due}}. Could you tell me when it will be paid?';

/** The field the draft is kept in, as Bills and invoices declares it (`lists/obligations.ts`, beside `chased`). */
export const CHASE_DRAFT_FIELD = { id: 'chase_draft', label: 'Draft to send', type: 'text' } as const;

/**
 * WHAT IT DRAFTS ON AN INVOICE PAID IN PART: the same sentence, and what is still to pay beside the whole
 * (`{{short:amount-paid_so_far}}`, the form that takes one money from another). `invoice-late` asks about a part-paid
 * invoice too, and the whole amount alone asked somebody for money they had already sent.
 */
export const CHASE_DRAFT_LEFT =
  'The invoice for {{short:amount}} was due on {{on:due}}, and {{short:amount-paid_so_far}} of it is still to pay. Could you tell me when the rest will be paid?';

/** An invoice the left-to-pay draft can be written for: paid in part, and saying how much. */
const PART_PAID = [{ field: 'state', is: 'part' }, { field: 'paid_so_far', present: true }] as const;

/**
 * The step that writes the draft, and only where there is none.
 *
 * THE CONDITION IS A TREE, NOT THE SENTENCE `chase_draft is empty`. A rule started by an answer names no list, so the
 * install reads a sentence in an `if` against the run's answers alone and refuses a field of the invoice
 * (`unreadIf` in `packages/kernel/src/index.ts`); a tree is left to the run, which holds the invoice.
 *
 * AND ONLY ON AN INVOICE THE STEP BELOW DOES NOT WRITE FOR, said in the condition and not left to the order of the
 * steps. A part-paid invoice with no "Paid so far" has nothing to take away, so it is chased for the whole.
 */
export const CHASE_DRAFT_STEP = {
  if: { all: [{ field: CHASE_DRAFT_FIELD.id, empty: true }, { none: [{ all: PART_PAID }] }] },
  then: [{ set: { field: CHASE_DRAFT_FIELD.id, to: CHASE_DRAFT } }],
} as const;

/** The step for an invoice paid in part: what is left, and again only where there is no draft. */
export const CHASE_DRAFT_LEFT_STEP = {
  if: { all: [{ field: CHASE_DRAFT_FIELD.id, empty: true }, ...PART_PAID] },
  then: [{ set: { field: CHASE_DRAFT_FIELD.id, to: CHASE_DRAFT_LEFT } }],
} as const;

/** Both, as `invoice-chased` takes them. At most one writes: their conditions never hold together. */
export const CHASE_DRAFT_STEPS = [CHASE_DRAFT_LEFT_STEP, CHASE_DRAFT_STEP] as const;

/**
 * WHETHER BILLS AND INVOICES DECLARES THE FIELD, which it does since money-core 3.17.0. A step that writes a field its
 * list does not hold stops the whole add-on from installing, so the steps go only where the field does.
 */
const DRAFT_DECLARED = OBLIGATIONS_REGISTER.fields.some((f) => f.id === CHASE_DRAFT_FIELD.id);

export { SETTLE_LINE_SCRIPT } from './settle-line.ts';
import { SETTLE_LINE_SCRIPT } from './settle-line.ts';
import { POST_DUE_RULES } from './post-due.ts';
import { CATEGORY_STAYS_RULES } from './category-stays.ts';

/**
 * WHAT HAPPENS WHEN A PERSON ANSWERS ONE OF MONEY'S QUESTIONS, SINCE money-core 3.1.0: automations started by a
 * decision in Decide (`on: decided`, `packages/kernel/src/flow.ts`'s `onDecided`), in the pack document's own form.
 *
 * NOT IN `MONEY_RULES`, because a `SeedRule` is the older form the inline pass reads over rows already written, and
 * these start on an answer, act on the row the question names (the question carries it as `about`), and hold no
 * `when:`, which a decision refuses. They go into the pack document and into `installSeed` with Work's, through
 * `AUTOMATIONS` in `../index.ts`.
 *
 * EACH NAMES THE RULE THAT ASKED AND THE ANSWER BY ITS WORDS. A rule's options are words whose ids are their places
 * (`o1`, `o2`), so the words are what an author can write, and a trigger naming words the question does not offer would
 * install and never start: the options here are `invoice-late`'s and `recurring-missed`'s, letter for letter. "Not yet"
 * starts nothing; the question's `once_per` is what decides when it is asked again.
 */
export const MONEY_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'invoice-chased',
    name: 'Mark an invoice as chased',
    pack: 'money-core',
    on: { decided: { about: 'rule.invoice-late', option: 'Chase it' } },
    /* THE DAY IT WAS DECIDED, IN THE RECORD'S OWN ZONE (`{{trigger.day}}`), so the page can say how long it has been
       chased, and a note on the row says why the day is there. */
    steps: [
      { set: { field: 'chased', to: '{{trigger.day}}' } },
      { note: 'You chose to chase this in Needs you.' },
      /* AND A MESSAGE READY TO SEND, in "Draft to send": the invoice's own amount and due day in one
         plain sentence, in the two forms a template writes a message in (`{{short:amount}}`, `{{on:due}}`). It names
         nobody, so it reads whole on an invoice with no person on it. WRITTEN ONLY WHERE THERE IS NONE: an invoice
         asked about again (a new due day) keeps the words somebody changed. AN INVOICE PAID IN PART is drafted for
         what is left of it (`CHASE_DRAFT_LEFT`), since money-core's next version. */
      ...(DRAFT_DECLARED ? CHASE_DRAFT_STEPS : []),
    ],
  },
  {
    rule: 'recurring-stopped',
    name: 'End a repeat that stopped',
    pack: 'money-core',
    on: { decided: { about: 'rule.recurring-missed', option: 'It stopped' } },
    /* ENDED, THE STATE EVERY READER OF `recurring` ALREADY LEAVES OUT: the walk, the monthly figures and the page. */
    steps: [{ move: 'ended' }],
  },
  /* "IT WENT THROUGH" MOVES "NEXT" ONE CYCLE ON AND MARKS ITS BILL PAID (money-next-moves-100), through `settle` told there is
     no payment (`SETTLE_LINE_SCRIPT`), on the line the question names, handed as its list and number. */
  {
    rule: 'recurring-went-through',
    name: 'Move a repeat that went through on to its next day',
    pack: 'money-core',
    on: { decided: { about: 'rule.recurring-missed', option: 'It went through' } },
    steps: [{ script: { id: SETTLE_LINE_SCRIPT.script, as: 'moving', input: { answer: '{{trigger.option}}' } } }],
  },
  /* AND ONE SCRIPT, ONCE A DAY, SINCE money-core 3.16.0: the question about lines on a month's last day (REC-B13,
     `scripts/last-day.js`). A rule cannot ask it, since one question for many lines is no `once_per` of one row; the
     script files it with its cause, and picking an answer writes `day_of_month` on each line through the gate, so no
     automation here acts on it. It fetches nothing, so the record does not count it as a feed (`feedsOn` in
     `packages/kernel/src/signs.ts`). */
  LAST_DAY_SCRIPT,
  /**
   * PAID IS WHAT A PAYMENT DID: a Ledger entry that names a bill in "Settles" starts `script.settle`,
   * which counts every payment naming that bill and writes "Paid so far", part or paid, and the day (`scripts/settle.js`).
   * Until this rule the script was in no pack document, and the four fields it fills were filled by a person.
   *
   * A RULE AND A SCRIPT, NOT A `set`, because the sum is over other entries and the grammar a rule fills a field with has
   * no arithmetic. Both halves arrive together, as Work's do: a rule whose script is missing fails every run it starts.
   *
   * ON A WRITE TO "Settles" OR TO THE STATUS, WHATEVER THE STATUS IS. Any status starts the script, and the script
   * counts cleared money alone: a pending payment pays nothing, and a payment made void, or put back to pending, writes
   * its bill back to what its other cleared payments come to. An edit to an entry's words starts nothing. No
   * `once_per`, since a second run for the same entry writes nothing twice: the script counts, it does not add. THE
   * BILL AN ENTRY LEFT IS NOT COUNTED AGAIN, since a trigger holds no previous value: an entry moved from one bill to
   * another recounts the bill it moved to, and the one it left keeps its sum.
   *
   * BOTH THINGS ARE HANDED BY THEIR IDS, the only name a step can fill in: an entry holds the bill it settles as an id,
   * and nothing a run fills says a handle ("obligations#4").
   *
   * NO `next`, BECAUSE A BILL HAS NONE: "Settles" points at Bills alone. An instalment's "Paid by", and a repeating
   * line's "Next", "Last paid" and "Last amount", are written by `payment-matches` below.
   */
  {
    rule: 'payment-settles',
    name: 'Mark a bill paid by its payment',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['settles', 'state'] } },
    when: 'settles is set',
    steps: [{ script: { id: 'settle', as: 'settling', input: { payment: '{{trigger.entry}}', item: '{{trigger.row.settles}}' } } }],
  },
  SETTLE_SCRIPT,
  /* A DELETED PAYMENT REOPENS WHAT IT PAID (unsettle-92): `payment-unsettles` recounts the bill without it. */
  UNSETTLE_RULE,
  UNSETTLE_SCRIPT,
  /* A PAID BILL IS SPENDING (file-paid, 30 October): its payment filed under Transfers is filed under the bill's category. */
  FILE_PAID_RULE,
  FILE_PAID_SCRIPT,
  ...MOVE_LINE,
  ...CARD_OWED,
  /**
   * A PAYMENT THAT NAMES NOTHING FINDS WHAT IT PAID (match-payment-78): a cleared Ledger entry with
   * nothing in "Settles" starts `script.match_payment`, which looks among the open bills, instalments and repeating
   * lines for the one it paid (`scripts/match-payment.js`). Exactly one for the same money is linked; several, or an
   * amount further off, is a question on Decide whose answers carry the link, so picking one writes it and needs no
   * second rule.
   *
   * THE LINK IS ALL THE SCRIPT WRITES, AND THE TWO RULES ROUND IT DO THE REST. "Settles" written on the payment starts
   * `payment-settles` above, which marks the bill. "Paid by" written on an instalment starts `instalment-settles`
   * below, which marks the instalment. Both are `settle`'s own writes, so the amount is never changed here.
   *
   * ON A WRITE TO THE STATUS OR TO "Settles", as `payment-settles` is, so an edit to an entry's words starts nothing
   * and a payment that clears later is looked for the day it clears. No `once_per`: a second run for an entry already
   * linked finds the link and looks no further, and a question asked again joins the one open by its cause.
   *
   * A REPEATING LINE HOLDS NO LINK, so the search writes nothing for it, and the second step, `script.settle_matched_line`
   * (back since money-next-moves-100), finds it again and moves "Next" with "Last paid" and "Last amount", or writes
   * nothing (said above `SETTLE_LINE_SCRIPT`). SO NO QUESTION IS ASKED WHILE ONE OF ITS ANSWERS WOULD BE A REPEATING
   * LINE (`asks: 'linked'`): an answer naming one would write nothing. Several things that fit with a line among them
   * are left as they are, said in the run; several bills or instalments are still asked.
   */
  {
    rule: 'payment-matches',
    name: 'Find what a payment paid',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['state', 'settles'] } },
    when: 'state is cleared, settles is empty',
    steps: [
      { script: { id: 'match_payment', as: 'matching', input: { payment: '{{trigger.entry}}', asks: 'linked' } } },
      { script: { id: SETTLE_LINE_SCRIPT.script, as: 'moving', input: { payment: '{{trigger.entry}}' } } },
    ],
  },
  /**
   * AND LOOKED FOR AGAIN AS THE DAYS PASS, ONCE AN ENTRY (Q1 of 29 October): a payment written before a bill it pays
   * could be found, or before a match on the money alone was made, is read again by the hourly sweep while it is ten
   * days old or less (`onTime` in `packages/kernel/src/flow.ts` sweeps a run-path rule whose `when:` names a relative
   * day and which says `once_per`). The writes that start it are only an unlinking, so a fresh payment is not looked
   * for twice by this and `payment-matches` at once.
   */
  {
    rule: 'payment-matches-again',
    name: 'Look again for what a recent payment paid',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['update'], fields: ['settles'] } },
    when: 'state is cleared, settles is empty, on after -11d',
    once_per: ['entry'],
    steps: [
      { script: { id: 'match_payment', as: 'matching', input: { payment: '{{trigger.entry}}', asks: 'linked' } } },
      { script: { id: SETTLE_LINE_SCRIPT.script, as: 'moving', input: { payment: '{{trigger.entry}}' } } },
    ],
  },
  MATCH_PAYMENT_SCRIPT,
  SETTLE_LINE_SCRIPT,
  /* A REPEATING LINE THAT POSTS ITSELF, AND THE REAL CHARGE THAT TAKES ITS PLACE, SINCE money-core 3.31.0 (`post-due.ts`). */
  ...POST_DUE_RULES,
  {
    rule: 'instalment-settles',
    name: 'Mark an instalment paid by its payment',
    pack: 'money-core',
    on: { written: { register: 'installments', op: ['create', 'update'], fields: ['paid_by'] } },
    when: 'paid_by is set',
    steps: [{ script: { id: 'settle', as: 'settling', input: { payment: '{{trigger.row.paid_by}}', item: '{{trigger.entry}}' } } }],
  },
  /**
   * A THING ON AN ACCOUNT IS IN THAT ACCOUNT'S BOOK: a Ledger entry, a bill, a repeating line or an instalment
   * written with an account and no book starts `script.book_from_account`, which fills the book from the account
   * (`scripts/book-from-account.js`). Until these rules a book's page counted only what somebody filed by hand, and
   * nothing a bank's text wrote.
   *
   * A RULE AND A SCRIPT, NOT A `set`, because the book is the account's and a fill reads the row that was written alone.
   * ONE RULE FOR EACH LIST, since a trigger names one. BILLS AND INVOICES IS THE FOURTH (`bill-takes-book`): the list
   * held no account until it gained one for this, and `account is set` would have been refused on it before.
   *
   * ON A WRITE TO THE ACCOUNT ALONE. An edit to an entry's words starts nothing, and neither does the write the script
   * makes. So a thing somebody takes out of its book stays out, and one moved to another account keeps the book it
   * has. No `once_per`: a second run finds the book filled and writes nothing. NO `input`: a script a rule starts is
   * handed the row's list and number.
   *
   * WHAT AN ACCOUNT HELD BEFORE IT WAS PUT IN A BOOK starts no rule, since that write is to the account. The script
   * counts those once a day and asks one question that says how many.
   */
  ...(
    [
      ['entry-takes-book', 'File a Ledger entry in its account\'s book', 'transactions'],
      ['bill-takes-book', 'File a bill or an invoice in its account\'s book', 'obligations'],
      ['repeat-takes-book', 'File a repeating line in its account\'s book', 'recurring'],
      ['part-takes-book', 'File an instalment in its account\'s book', 'installments'],
    ] as const
  ).map(([rule, name, register]) => ({
    rule,
    name,
    pack: 'money-core',
    on: { written: { register, op: ['create', 'update'], fields: ['account'] } },
    when: 'account is set, book is empty',
    steps: [{ script: { id: 'book_from_account', as: 'filing', input: {} } }],
  })),
  /**
   * AND WHAT AN ACCOUNT ALREADY HOLDS FOLLOWS IT INTO A BOOK, SINCE money-core 3.35.0 (leftovers 2 Nov, 2). Putting an
   * account in a book wrote only the account, so its Ledger entries, bills, repeating lines and instalments stayed in
   * no book until the night's count asked about them, and the book's page said "$0 this month" over a month the account
   * had spent in. An account written with a book starts the same script handed the account, which files everything on
   * it that is in no book, as one change with one Undo, as a new filing rule files back (`rule-files-back`). A thing
   * that names its own book keeps it. The night's question is still asked of anything left over.
   */
  {
    rule: 'account-files-book',
    name: "File what an account holds in its book",
    pack: 'money-core',
    on: { written: { register: 'accounts', op: ['create', 'update'], fields: ['book'] } },
    when: 'book is set',
    steps: [{ script: { id: 'book_from_account', as: 'filing', input: {} } }],
  },
  BOOK_FROM_ACCOUNT_SCRIPT,
  /**
   * A PLAN IS A ROW OF ITS OWN, AND EACH PART SAYS WHAT IS LEFT AFTER IT: an instalment made, or
   * one whose plan, amount, day, status or number changed, starts `script.plans_from_names` for that part's plan
   * (`scripts/plans-from-names.js`). The script also runs once a day over every plan, which is how a record that held
   * plans only as names gets its rows. A PLAN MADE STARTS THE SCRIPT AGAIN, handed the plan (`plan-links-parts`), so
   * its parts are linked then and not that night. A PLAN MADE ONE WITH ANOTHER (`one_with`, since money-core 3.22.0)
   * starts it too (`plan-made-one`), handed that plan, so its parts move to the first plan on the day of his answer.
   *
   * NOT ON `plan_row` OR `left_after`, the two fields the script itself writes, or the rule would start itself. NO
   * `input`: a script a rule starts is handed the row's list and number, which is how the script finds the part.
   */
  {
    rule: 'part-counts-plan',
    name: 'Count what is left of a plan',
    pack: 'money-core',
    on: { written: { register: 'installments', op: ['create', 'update'], fields: ['plan', 'amount', 'due', 'state', 'number'] } },
    steps: [{ script: { id: 'plans_from_names', as: 'counting', input: {} } }],
  },
  { rule: 'plan-links-parts', name: 'Link the parts of a new plan', pack: 'money-core', on: { written: { register: 'plans', op: ['create'] } },
    steps: [{ script: { id: 'plans_from_names', as: 'linking', input: {} } }] },
  { rule: 'plan-made-one', name: 'Move the parts of a plan made one with another', pack: 'money-core',
    on: { written: { register: 'plans', op: ['update'], fields: ['one_with'] } }, when: 'one_with is set',
    steps: [{ script: { id: 'plans_from_names', as: 'linking', input: {} } }] },
  PLANS_FROM_NAMES_SCRIPT,
  /**
   * A NEW OR CHANGED FILING RULE FILES WHAT IT MATCHES (since money-core 3.17.0): a rule made, or one
   * whose text, way of matching, what it reads, way, category, account or status changed, starts `script.file_back`,
   * which files the Ledger entries of the last 400 days with no category that the rule fits, by the category rule's own
   * ladder, as one change with one Undo (`scripts/file-back.js`). Until this a rule filed only what arrived after it.
   * `when: state is on`, so a rule switched off files nothing, and one switched on again files back. Not on `rank` or
   * `note`, which change nothing it matches. NO `input`: the script is handed the rule's list and number.
   */
  {
    rule: 'rule-files-back',
    name: 'File what a filing rule matches',
    pack: 'money-core',
    on: { written: { register: 'filing_rules', op: ['create', 'update'], fields: ['match', 'match_by', 'reads', 'direction', 'category', 'account', 'state'] } },
    when: 'state is on',
    steps: [{ script: { id: 'file_back', as: 'filing', input: {} } }],
  },
  FILE_BACK_SCRIPT,
  /**
   * PAYEE NAMES, SINCE money-core 3.34.0 (next-money, M9): a payee name written or changed names the Ledger lines of the
   * last 400 days its bank words fit, and the script names the lines that came in once a day (`scripts/name-payees.js`).
   */
  {
    rule: 'payee-named-back',
    name: 'Name the lines a payee name fits',
    pack: 'money-core',
    on: { written: { register: 'payee_names', op: ['create', 'update'], fields: ['name', 'match'] } },
    steps: [{ script: { id: 'name_payees', as: 'naming', input: {} } }],
  },
  NAME_PAYEES_SCRIPT,
  /**
   * A CATEGORY SET BY HAND ASKS ONCE WHETHER THE PAYEE ALWAYS GOES THERE: "File every Talabat under
   * Outing from now on? 14 more like it have no category." (`scripts/learn-category.js`). Yes is `category-taught`,
   * which runs the script again with the answer, and the script makes the rule; making it starts `rule-files-back`.
   * "Only this one" starts nothing, and the question's cause, one a payee, is what stops it being asked again.
   * A PERSON'S EDIT AND NOTHING ELSE, AS FAR AS A TRIGGER CAN SAY. `op: update` leaves out a bank's or an import's new
   * entry. `filed_by is empty` leaves out every write a rule or a script makes of a category, since each writes the rule
   * that filed it too, and that is also what keeps a file-back of 500 entries from starting 500 runs here. A rule's own
   * write starts no rule at all. The bank's text is what the rule Yes makes will match, so an entry without it is not
   * asked about, and nor is a move between two of a person's own accounts.
   * NEVER ON A CLOCK AND NEVER AT NIGHT: only the write of a category starts it, and the question is signed by the
   * script, never by `system`.
   */
  {
    rule: 'category-teaches',
    name: 'Offer a filing rule from a category set by hand',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['update'], fields: ['category'] } },
    when: 'category is set, filed_by is empty, counterparty_text is set, transfer is false',
    steps: [{ script: { id: 'learn_category', as: 'asking', input: {} } }],
  },
  /* YES TO THAT QUESTION MAKES THE RULE: the question is about its entry (`transactions#N`), so the run is on that
     entry, and the script reads the payee, the way and the category from it again at the press. */
  {
    rule: 'category-taught',
    name: 'Make the filing rule a person said yes to',
    pack: 'money-core',
    on: { decided: { about: 'script.learn_category', option: 'Yes' } },
    steps: [{ script: { id: 'learn_category', as: 'making', input: { answer: '{{trigger.option}}' } } }],
  },
  LEARN_CATEGORY_SCRIPT,
  /* A CATEGORY OF MOVES ASKS ONCE WHETHER ITS MONEY STAYS YOURS, SINCE money-core 3.31.0 (`category-stays.ts`). */
  ...CATEGORY_STAYS_RULES,
  OFFER_BUDGETS_SCRIPT,
  /* AND THE DAILY MARK THE TWO BUDGET RULES ABOVE TELL OF (`scripts/budget-watch.js`). */
  BUDGET_WATCH_SCRIPT,
  /* LINES WRITTEN TWICE, ONE QUESTION A NIGHT AT MOST (live check of 30 October, 11): one payment that reached the Ledger
     by an alert and by a statement, or by an alert sent again, is asked about once, and yes archives the copy and moves
     what was set on it to the line kept (`scripts/ledger-twice.js`). Picking the answer is the writes, so no automation
     here acts on it. */
  LEDGER_TWICE_SCRIPT,
];
