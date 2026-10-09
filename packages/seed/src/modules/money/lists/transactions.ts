/** The ledger: money that has actually moved. */

import { AVAILABLE, BOOK, type MoneyRegister } from './shared.ts';

/**
 * MONEY THAT HAS ACTUALLY MOVED, which is the register this module was missing and the reason none
 * of its figures could be checked against anything. An obligation is a promise with a date; a
 * transaction is a fact with a day, an account and a direction, and `settles` is the one field that
 * joins them, so "paid" stops being a status somebody remembered to set.
 *
 * THE AMOUNT IS POSITIVE AND `direction` CARRIES THE SIGN, as it does on `obligations`: a column of
 * signed amounts cannot be summed without knowing which way each one goes, and a table draws the
 * sign from the field (`sign: { field: direction, minus: out }`) rather than from the column it is in.
 */
export const TRANSACTIONS_REGISTER: MoneyRegister = {
  id: 'transactions',
  name: 'Ledger',
  icon: 'rows',
  one: 'transaction',
  holds: 'money that has moved, with the day it moved, the account it moved through and what it was for',
  title: 'what',
  /* THE DAY IT MOVED BESIDE THE AMOUNT. A card holds three fields (`RowCards`, and `declOf` in `remote.ts` draws its
     own three in place of any other count), and a payment's card without its amount is a list nobody can read, so the
     account it moved through is one tap away on the row rather than on the card. */
  mobile: ['what', 'amount', 'on'],
  state: 'state',
  done: ['cleared', 'void'],
  pack: 'money-core',
  /**
   * THE TWO LEGS OF A TRANSFER ARE FOUND BY THE RECORD (`packages/kernel/src/pairs.ts`, `02 §5`): the same amount in the
   * same currency, one leg out and one in, two different accounts, within four days. Both are marked `transfer` and
   * each names the other in `_pair`, so a person sees why a row stopped counting and can undo it. An import writes a
   * move between one person's accounts as two ordinary rows, and until this a person marked both or every figure over
   * the ledger counted the move once as spend and once as income (`test/money-pairs.test.ts`: GBP 4,000.00 spent, before).
   *
   * `abs(amount)` AND NO `currency` ENTRY, because the currency is inside the money and this register has no field of
   * that name: `abs()` on a money compares its size and its currency together.
   *
   * `where: state is cleared`, THE SAME CLAUSE EVERY LEDGER FIGURE COUNTS BY, because a row the figures never count
   * cannot be the other half of a move they do. Without it a void or pending credit paired with the cleared payment
   * beside it and hid that payment: measured, Spent read GBP 0.00 against 250.00 for both, and a pending row is what a bank alert writes first.
   * `done:` is not the answer, since it holds `void` too. THE TREE AND NOT THE SENTENCE, because the kernel matches it
   * on every write and takes it only in that form (`pairs.ts`, `pairsFault`). When a pending credit clears, the update
   * is looked at again and it pairs then.
   *
   * `party is empty` AND `settles is empty`, BECAUSE A MOVE BETWEEN YOUR OWN ACCOUNTS HAS NOBODY ON THE OTHER SIDE AND
   * DISCHARGES NO PROMISE. Without them a coincidence of amount was a transfer: rent out of one account and a client
   * paying the same 15,000.00 into another a day later both left Spent and Received, and so did a friend's instant
   * transfer repaying a dinner and a refund landing on another account. A row that names who it was with, or the obligation it paid, is a payment to or from
   * somebody, and one such leg keeps the pair apart. Both are fields the kernel reads again on an update, so naming
   * Omar on a repayment the record had paired undoes the pair (`test/money-pairs.test.ts`).
   *
   * `settles is empty` OR `transfer is true`, SINCE 2.3.0, BECAUSE A CARD BILL IS A PROMISE AND A MOVE AT ONCE. A founder
   * keeps the bill in Obligations so the forecast holds it, the import writes its two legs bare and the record pairs
   * them, and then Reconcile sets `settles` on the bank leg. At 2.2.0 that one field parted the pair: Spent and
   * Received each read 9,500.00 high, on top of the purchases the bill paid, already in Spent on the card
   * (`test/money-card-bill.test.ts`). So a leg that settles
   * something is still a leg while the record holds it as one. `transfer` is read on the stored row, the mark the
   * pairing itself wrote, so the clause keeps a pair and never starts one.
   *
   * WHY NOT THE CARD ITSELF. The bank leg of a card bill and a rent payment that settles its obligation are the same row
   * field for field, and so are their partners; what differs is the obligation's payee or the kind of the account the
   * money went to, and both are a hop through a ref that `where` here cannot take (`pairs.ts`, `pairsFault`). Dropping
   * `settles` from the clause altogether would pair a rent written already reconciled with the client beside
   * it (`test/money-pairs.test.ts`).
   *
   * WHAT THE CLAUSE COSTS, measured and held in `test/money-card-bill.test.ts`: which was written first
   * decides. A bank leg reconciled while it holds no pair never gains one, as at 2.2.0: reconciled before the card's
   * leg arrives, reconciled on the bank alert while still pending and cleared afterwards, or reconciled and then parted
   * for a moment by a mistyped amount on the card's leg or a third row of the same sum, and each leaves the bill counted
   * both ways after the ledger is back as it was. And two bare rows
   * the record paired by coincidence, rent and a client's payment of the same sum, no longer part when the rent is
   * reconciled; naming the client still parts them, as it parts the dinner and the repayment.
   *
   * NOT `category is empty`, the obvious repair. A real ledger, read through the route the
   * import reads, files both legs of both its moves since 13 July under a category called Transfers, and the import
   * carries the category over, so that clause would have unpaired every move in it. "A category whose direction is
   * `both`" is what a category could say, and it needs a hop through the ref that `where` refuses (`via`,
   * `packages/where/src/index.ts`). On that ledger the declaration as it was paired those two moves and nothing else,
   * so what this adds is a way for a person to say no, not a change to what an import pairs tonight.
   *
   * WHAT STILL PAIRS WRONGLY: two rows that name nobody, whose amounts agree. The import never writes `party` (the payee
   * goes into the note) and a bank text never does, and on that ledger a move between two of one's own accounts and a
   * friend's repayment carry descriptions that differ only in the word for which way the money went, so no field this
   * register holds, the description included, tells the rent and the client from a move until a person names one
   * side. That is the rent-and-client and dinner rows in `test/money-pairs.test.ts`, and the dinner test holds the bare dinner and repayment
   * paired on purpose, so the day that changes is seen. `within` stays 4d: the coincidences measured sit one and two
   * days apart, the card on that ledger is paid off with the card's leg a day before the bank's, and a window short
   * enough to part the rent and the client would lose that move and any sent before a weekend.
   *
   * WHAT CANNOT PAIR: a move between currencies, the most common one on that ledger (dollars out of one account and
   * another currency into a second). `abs(amount)` compares the currency as well as the size, and
   * nothing in `pairs:` can say "the same value at the day's rate", so both legs are counted until a person marks them.
   */
  pairs: {
    on: ['abs(amount)'],
    opposite: 'direction',
    across: 'account',
    within: '4d',
    mark: 'transfer',
    where: {
      all: [
        { field: 'state', is: 'cleared' },
        { field: 'party', empty: true },
        { any: [{ field: 'settles', empty: true }, { field: 'transfer', is: true }] },
      ],
    },
  },
  fields: [
    { id: 'what', label: 'Description', type: 'text', required: true, search: true },
    /* `Date` OVER THE COLUMN AND `on` IN A PREDICATE. A transaction has one day and it is never a
       deadline, so this field wears no `deadline:`: nothing here can be late. */
    { id: 'on', label: 'Date', type: 'day', index: true, required: true },
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['in', 'out'],
      labels: { in: 'Money in', out: 'Money out' },
      index: true,
      required: true,
    },
    /**
     * A ROW'S CURRENCY COMES FROM ITS ACCOUNT, AND STAYS, SINCE money-core 3.16.0 (REC-B04). "`currency` from the
     * account" and "a transaction's currency" among the things that never change (the owner's words). An amount written
     * with no code takes the code of its account's balance (`currency_from`), so a bank text or an agent that sends
     * 97999 on an account kept in EGP files EGP 979.99, and an account with no balance to give refuses it in one
     * sentence. An amount sent with its own code is kept as written. Once held, the code is never changed by a write
     * (`currency_fixed`, refused as `CURRENCY_FIXED`): a row in the wrong currency is deleted and added again.
     */
    { id: 'amount', type: 'money', required: true, currency_from: 'account.balance', currency_fixed: true },
    /* WHAT THE BANK SAID WAS LEFT, AND THE BALANCE AFTER BELOW, TAKE THE ACCOUNT'S CODE when none is printed, as the
       amount does, but may be corrected: neither is the row's own money. */
    { ...AVAILABLE, currency_from: 'account.balance' },
    /**
     * WHAT THE BANK SAID THE ACCOUNT HELD AFTER THIS MOVED, SINCE money-core 3.0.0: the balance a statement line or a
     * bank message prints beside a movement. Not `available`, which is a card's limit left, not what an account holds.
     *
     * IT RESTARTS CASH NOW FOR ITS ACCOUNT. `cash-now` rolls each account forward from the newest thing anybody said
     * it held, and a movement that says the balance after it is one of those statements, so a bank pack that reads it
     * keeps the figure true without anybody typing a balance. Optional, because most ways a row arrives never say.
     */
    { id: 'balance_after', label: 'Balance after', type: 'money', currency_from: 'account.balance' },
    /* REQUIRED, because a movement with no account is a number nobody can reconcile. */
    { id: 'account', type: 'ref', to: 'accounts', index: true, required: true },
    { id: 'category', type: 'ref', to: 'categories', index: true },
    /* Not indexed, and this register is at the ceiling. `declare.ts`'s `INDEX_CEILING` is 8 and
       counts `index: true` and `unique: true` alike; the eight spent here are `on`, `direction`,
       `account`, `category`, `thing`, `state`, `transfer` and `settles`, which are the eight every
       page and every figure below filters on. `party` is the one nothing filters on, so it pays
       no write cost. A ninth would come back as INDEXES_OVER_CAP at the door.

       AN ORGANISATION, SINCE money-core 3.10.0, AND IT WAS A PERSON. Money moves through a company far more often than
       through a person: a shop, a supplier, a client's accounts, a bank. With `party` a person, a card payment could
       only name nobody or file a coffee shop as somebody met, so it named nobody, and none of a real ledger's 217 rows
       carried one. Still a link (`LINKS` in `packs/first-party.ts`), so Money installs with People off. */
    { id: 'party', label: 'Who', type: 'ref', to: 'organisations' },
    /* THE PAYEE AS THE BANK WROTE IT, SINCE money-core 3.10.0 (`loop/contract-17.md`): `GEIDEA*BRIDGE ST COFFEE`,
       which a bank door fills and the record resolves to an organisation by its `bank:` key, kept beside `party` so
       the words a match was made on are never lost. MONEY'S AND NOT EACH BANK'S: three bank add-ons laying a field of
       this one id on this one list (`extends`) is `PROVIDES_CONFLICT` for the second of them on any record that keeps
       two banks, so the list declares it once and every door writes it. Searchable, because it is what a person
       remembers off a statement. */
    { id: 'counterparty_text', label: 'Paid to or from', type: 'text', search: true },
    { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
    /* NOT INDEXED, FOR THE REASON `party` IS NOT: the list's eight are spent, and a ninth is refused at the door. A
       book's page reads it with the day and the state beside it. */
    { ...BOOK },
    { id: 'state', label: 'Status', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', index: true, required: true },
    /**
     * MOVING MONEY BETWEEN YOUR OWN ACCOUNTS IS NOT SPENDING IT, and a ledger that counts it as
     * spending reports the same month twice. The mark is a field rather than a category, because a
     * transfer has no category: it is not for anything. Every figure of spending and income says
     * `transfer is false`, and the default is false so a row nobody marks is counted.
     *
     * THE RECORD SETS IT ON BOTH LEGS OF A MOVE IT CAN SEE, through `pairs:` above, and a person sets
     * it on the rest: a card bill whose other leg is the card's own statement is one leg in this
     * ledger, and no pair can be found for it.
     */
    { id: 'transfer', label: 'Between your own accounts', type: 'bool', default: false, index: true },
    /* THE PROMISE THIS PAYMENT DISCHARGED. Reconcile is this field and nothing else. */
    { id: 'settles', label: 'Settles', type: 'ref', to: 'obligations', index: true },
    { id: 'note', type: 'text' },
  ],
};
