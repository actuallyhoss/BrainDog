/** Money's rules, and the automations that act on an answer to one of them. */

import type { SeedRule } from '../base.ts';

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
  /**
   * A BALANCE MORE THAN A WEEK OLD IS TOLD, SINCE money-core 3.1.0, AND IT WAS A QUESTION IN DECIDE.
   *
   * The question's only useful answer was typing a number, which Decide has no box for: "Update it" closed the question
   * and left the balance as old as it was. The number is typed where the account is, and the Money page already says a
   * balance is out of date (its "Out of date" note over `balances-stale` since 3.3.0, and a book's Accounts cards,
   * `stale:`). So this tells instead of asking: a notification that is not urgent is a note on the account signed by the
   * rule and nothing else (`packages/kernel/src/rules.ts`), which History reads, once for each day a balance was set
   * (`once_per`). NO DIGEST READS
   * IT: a digest reads the lists and figures its declaration names (`sectionsOf` in `packages/kernel/src/digest.ts`),
   * and money-core declares none.
   */
  'cash-stale': {
    rule: 'cash-stale',
    pack: 'money-core',
    register: 'accounts',
    when: 'as_of before -7d',
    then: [{ notify: { say: 'The balance of {{name}} was last set {{ago:as_of}}.' } }],
    once_per: ['entry', 'as_of'],
  },
  /**
   * THE ONE RULE HERE THAT ACTS, and it acts because there is nothing to decide.
   *
   * A row whose description is a merchant a category already names has its category filed by the
   * record rather than asked about, which is the difference between a ledger somebody keeps and a
   * ledger somebody abandons: the third time `FENWICK CLOUD` arrives, being asked what it is for is an
   * insult. What the rule cannot reach is what the figure counts, so nothing is hidden by it.
   *
   * IT MATCHES THE WHOLE DESCRIPTION, EXACTLY, until `link:` reads how each category asks to be matched.
   * `link:` is an equality against one stored value, so a category's `match` is the counterparty as the
   * bank writes it, and a merchant that arrives under two spellings needs two categories or a person.
   * `categories.match_by` (since money-core 3.0.0) is where a category says "how it starts" or "anywhere
   * in it", and a rule that files by it reads it there; until then every category is matched whole,
   * which is what `exact`, its default, says.
   *
   * `once_per: [entry]` means once a row, ever. A category cleared by hand afterwards stays cleared,
   * which is `32-PARITY` §3.2's rule that a field a person set is never overwritten by a rule.
   */
  'txn-categorise': {
    rule: 'txn-categorise',
    pack: 'money-core',
    register: 'transactions',
    when: 'state is cleared, transfer is false, category is empty',
    then: [{ link: { field: 'category', to: { register: 'categories', by: 'match', value: '{{what}}' } } }],
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
    steps: [{ set: { field: 'chased', to: '{{trigger.day}}' } }, { note: 'You chose to chase this in Decide.' }],
  },
  {
    rule: 'recurring-stopped',
    name: 'End a repeat that stopped',
    pack: 'money-core',
    on: { decided: { about: 'rule.recurring-missed', option: 'It stopped' } },
    /* ENDED, THE STATE EVERY READER OF `recurring` ALREADY LEAVES OUT: the walk, the monthly figures and the page. */
    steps: [{ move: 'ended' }],
  },
];
