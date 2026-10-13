/**
 * Money's rules, and the automations that act on an answer to one of them.
 *
 * CLOSING AN ACCOUNT IS WRITTEN HERE AND NOT SHIPPED YET (`CLOSE_ACCOUNT_AUTOMATIONS`, at the foot). An account closed
 * with money on it drops that money out of Cash now without a word, and `scripts/close-account.js` is the question
 * that stops it. Its script, the rule that starts it and the automation that acts on the answer are all here, in the
 * form the record installs, and `money-close-account-wired.test.ts` installs them and measures how far they reach:
 * closing an account starts the script, and there it stops, for the three reasons that list gives.
 */

import type { SeedRule } from '../base.ts';
import { OBLIGATIONS_REGISTER } from './lists/obligations.ts';
import { BOOK_FROM_ACCOUNT_SCRIPT } from './scripts/book-from-account.js';
import { CLOSE_ACCOUNT_SCRIPT } from './scripts/close-account.js';
import { LAST_DAY_SCRIPT } from './scripts/last-day.js';
import { PLANS_FROM_NAMES_SCRIPT } from './scripts/plans-from-names.js';
import { SETTLE_SCRIPT } from './scripts/settle.js';

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
     record it told of every account and would have gone on telling after messages filed. It goes at money-core 3.16.0
     (REC-B03): Money's Heads up names how old the oldest balance is from the roll's own day (`cash-as-of`), its Last
     confirmed tile dates each account by its newest statement (`account-ages`), and `statement-oldest-days` is the sign. */
  /**
   * THE ONE RULE HERE THAT ACTS, and it acts because there is nothing to decide.
   *
   * An entry whose text a filing rule already names has its category filed by the record rather than asked about,
   * which is the difference between a ledger somebody keeps and a ledger somebody abandons: the third time
   * `FENWICK CLOUD` arrives, being asked what it is for is an insult. What the rule cannot reach is what the figure
   * counts, so nothing is hidden by it.
   *
   * IT LINKS THROUGH `filing_rules`, SINCE money-core 3.17.0 (REC-B10), AND IT LINKED A CATEGORY BY ITS "Matches".
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
    when: 'state is cleared, transfer is false, category is empty',
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
   * Now it asks once for each day it was due (`once_per`): "It went through" is recorded and asks nothing more this
   * cycle, and "It stopped" ends the line (`recurring-stopped` in `MONEY_AUTOMATIONS`). The words fit money in as well as
   * money out, since pay coming in is a repeating line too. Moving `next_due` on by one cycle is not offered, because the
   * grammar a rule fills a field with has no arithmetic on a day.
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
 * The step that writes the draft, and only where there is none.
 *
 * THE CONDITION IS A TREE, NOT THE SENTENCE `chase_draft is empty`. A rule started by an answer names no list, so the
 * install reads a sentence in an `if` against the run's answers alone and refuses a field of the invoice
 * (`unreadIf` in `packages/kernel/src/index.ts`); a tree is left to the run, which holds the invoice.
 */
export const CHASE_DRAFT_STEP = {
  if: { field: CHASE_DRAFT_FIELD.id, empty: true },
  then: [{ set: { field: CHASE_DRAFT_FIELD.id, to: CHASE_DRAFT } }],
} as const;

/**
 * WHETHER BILLS AND INVOICES DECLARES THE FIELD, which it does since money-core 3.17.0. A step that writes a field its
 * list does not hold stops the whole add-on from installing, so the step goes only where the field does.
 */
const DRAFT_DECLARED = OBLIGATIONS_REGISTER.fields.some((f) => f.id === CHASE_DRAFT_FIELD.id);

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
 * and "It went through" start nothing; the question's `once_per` is what decides when it is asked again.
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
      { note: 'You chose to chase this in Decide.' },
      /* AND A MESSAGE READY TO SEND (REC-B22 step 1), in "Draft to send": the invoice's own amount and due day in one
         plain sentence, in the two forms a template writes a message in (`{{short:amount}}`, `{{on:due}}`). It names
         nobody, so it reads whole on an invoice with no person on it. WRITTEN ONLY WHERE THERE IS NONE: an invoice
         asked about again (a new due day) keeps the words somebody changed. */
      ...(DRAFT_DECLARED ? [CHASE_DRAFT_STEP] : []),
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
  /* AND ONE SCRIPT, ONCE A DAY, SINCE money-core 3.16.0: the question about lines on a month's last day (REC-B13,
     `scripts/last-day.js`). A rule cannot ask it, since one question for many lines is no `once_per` of one row; the
     script files it with its cause, and picking an answer writes `day_of_month` on each line through the gate, so no
     automation here acts on it. It fetches nothing, so the record does not count it as a feed (`feedsOn` in
     `packages/kernel/src/signs.ts`). */
  LAST_DAY_SCRIPT,
  /**
   * PAID IS WHAT A PAYMENT DID (REC-B11 step 4): a Ledger entry that names a bill in "Settles" starts `script.settle`,
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
   * NO `next`, BECAUSE A BILL HAS NONE. It is the day a repeating line moves to, and nothing links a payment to a
   * repeating line or an instalment yet: "Settles" points at Bills alone. So "Paid by", "Last paid" and "Last amount"
   * are still filled by nobody, and when a link to a repeating line lands its rule hands `next` from the walk.
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
  /**
   * A THING ON AN ACCOUNT IS IN THAT ACCOUNT'S BOOK (REC-A09 job 1): a Ledger entry, a bill, a repeating line or an instalment
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
  BOOK_FROM_ACCOUNT_SCRIPT,
  /**
   * A PLAN IS A ROW OF ITS OWN, AND EACH PART SAYS WHAT IS LEFT AFTER IT (REC-B12 jobs 1 and 2): an instalment made, or
   * one whose plan, amount, day, status or number changed, starts `script.plans_from_names` for that part's plan
   * (`scripts/plans-from-names.js`). The script also runs once a day over every plan, which is how a record that held
   * plans only as names gets its rows. A PLAN MADE STARTS THE SCRIPT AGAIN, handed the plan (`plan-links-parts`), so
   * its parts are linked then and not that night.
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
  {
    rule: 'plan-links-parts',
    name: 'Link the parts of a new plan',
    pack: 'money-core',
    on: { written: { register: 'plans', op: ['create'] } },
    steps: [{ script: { id: 'plans_from_names', as: 'linking', input: {} } }],
  },
  PLANS_FROM_NAMES_SCRIPT,
];

/**
 * CLOSING AN ACCOUNT THAT STILL HOLDS MONEY (REC-B15 step 3): the script, the rule that starts it when an account's
 * status becomes Closed, and the automation that runs it again with the answer, so "Move it to Savings" writes the two
 * legs of the move. Both halves and the script together, as `payment-settles` and `SETTLE_SCRIPT` arrive.
 *
 * HELD BESIDE `MONEY_AUTOMATIONS` AND IN NO PACK DOCUMENT, because today the chain stops after its first link, and a
 * question whose answer to move does nothing is worse than no question: it would say "$1,200.00 goes to Savings as one
 * move" and move nothing. Measured on a record with these three installed:
 *   - THE SCRIPT IS STARTED AND READS NO ACCOUNT. A script step hands the row's `id`, `register` and `seq`, and fills
 *     `input:` from the run alone, so `account: '{{id}}'` arrives as those braces. The script reads `input.account` as
 *     "accounts#3" and nothing else, so it ends with "handed no account". It has to read the identity it is handed.
 *   - AN ANSWER STARTS NOTHING. The record tells `onDecided` what a question is about only for one a rule opened or a
 *     change proposes. A script's question arrives with no `about`, so `about: script.close_account` never matches, and
 *     with no row, since the question names its account by name. With no `about` here the automation would start on
 *     every decision in the record, so it names one and waits.
 *   - WHAT THE ACCOUNT ROLLS TO CANNOT BE HANDED. A fill is always text and `holds` is a whole number, and nothing a
 *     run fills is one account's rolled amount. So the question would be about the balance somebody typed.
 * When the first two are mended these three join `MONEY_AUTOMATIONS` with a new version of the pack, and the third
 * decides whether the amount asked about is the roll's or the typed one.
 *
 * ON A CHANGE OF STATUS ALONE (`op: update`, `fields: state`), so an edit to an account's name starts nothing and an
 * account typed in already closed asks nothing. No `once_per`: an account reopened and closed again is asked about
 * again, and a second run for the same closing joins the open question by its cause.
 *
 * THE ANSWER IS HANDED BY ITS WORDS AND THE DAY IT WAS GIVEN, and no `option:` narrows the trigger, since an answer to
 * move is named after the account it moves to. The day is the decision's (`{{trigger.day}}`), which a retried run
 * keeps, so the script finds its own leg on that day and writes no second pair. "Close it as it stands" runs too and
 * changes nothing: the account is closed already.
 */
export const CLOSE_ACCOUNT_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'account-closed',
    name: 'Ask where a closed account\'s money goes',
    pack: 'money-core',
    on: { written: { register: 'accounts', op: ['update'], fields: ['state'] } },
    when: 'state is closed',
    steps: [{ script: { id: 'close_account', as: 'closing', input: {} } }],
  },
  {
    rule: 'account-moved',
    name: 'Move what a closed account holds',
    pack: 'money-core',
    on: { decided: { about: 'script.close_account' } },
    steps: [{ script: { id: 'close_account', as: 'moving', input: { answer: '{{trigger.option}}', on: '{{trigger.day}}' } } }],
  },
  CLOSE_ACCOUNT_SCRIPT,
];
