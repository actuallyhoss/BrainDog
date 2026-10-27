/**
 * The walk and the roll every Money figure and page reads, each written once: the lists that hold a dated amount, the
 * repeating lines a monthly figure counts, and Cash now's arithmetic. Cut out of `money.ts` with no change (REC-B01 job 1).
 */

import type { Leg } from '@braindog/kernel';
import type { Predicate } from '@braindog/where';

import { LOOKUPS, OPEN } from '../base.ts';

/**
 * EVERY LIST ON THIS RECORD THAT HOLDS A DATED AMOUNT, WRITTEN ONCE, and walked by everything that walks: Cash ahead,
 * the next thirty days under it, and the figures that read a walk (`runway-days`, `arriving-30d`, `leaving-30d`). One
 * array cannot drift from itself, so the chart, the bridge and the tiles over it cross zero on the same day.
 *
 * IN A FILE OF ITS OWN AND NOT BESIDE THE PAGE, because the figures and the pages both name it (REC-B01).
 *
 * REPEATING MONEY IS WALKED FROM `recurring` ALONE, SINCE money-core 3.0.0. The obligations leg walked `repeats` while
 * `recurring` sat out, and each was right about half the record: the sample wrote its streams as bills, and an
 * import could write each stream twice, as a bill that repeats monthly and as a line in `recurring`. Walking both counts every stream twice on that record; walking only bills left a
 * salary typed into `recurring` out of every walk. So a bill is walked once, on its day, and a stream is walked where it
 * is a stream.
 */
const DATED: Leg[] = [
  {
    register: 'obligations',
    on: 'due',
    amount: 'amount',
    /* ONE-OFFS ONLY: a bill that says it repeats is walked as its line in `recurring`, and walking the bill as well
       would spend it twice. And what falls due reads this leg too (`walkedOf` in the kernel's `deadlines`), so Due soon
       names the money once, on its line, where it named the bill and the line side by side. */
    where: `${OPEN}, repeats is not monthly or quarterly or yearly`,
    incoming: { field: 'direction', is: 'owed_to_me' },
  },
  {
    register: 'recurring',
    on: 'next_due',
    amount: 'amount',
    where: 'state is live',
    incoming: { field: 'direction', is: 'in' },
    /* EVERY CADENCE THE LIST OFFERS, SO NONE MOVES ONCE AND STOPS. Twice a month is the first and the fifteenth, the days
       a pay run of that kind keeps. */
    every: {
      field: 'every',
      months: { monthly: 1, quarterly: 3, yearly: 12 },
      weeks: { weekly: 1, fortnightly: 2 },
      twice: { twice_monthly: [1, 15] },
    },
    /* THE ROW'S OWN END, SO THE WALK STOPS WHERE THE LINE DOES: the kernel stops on `ends` only when the leg names it. */
    ends: 'ends',
    /* THE ROW'S OWN DAYS AND ITS RULE FOR A REST DAY, SINCE money-core 3.16.0 (REC-B13). Set, `day_of_month` puts a line
       on its days of every month its cycle lands in, and the table above is what an empty one falls back to; `weekend`
       moves a day off Money's `rest_days`, which the walk reads by that setting's name (`restDaysOf`), so the leg does
       not name it. Empty is a line as imported: its days as `every` says, kept where they fall. */
    days: 'day_of_month',
    weekend: 'weekend',
  },
  {
    register: 'installments',
    on: 'due',
    amount: 'amount',
    /* `state is open` AND THE PAID PARTS STAY OUT, the way a settled bill does: the money
       already moved and Cash now is standing on the far side of it. */
    where: 'state is open',
    incoming: { field: 'direction', is: 'in' },
    /* EACH PART SAYS WHICH PLAN IT IS IN, so Cash ahead can count a plan in or out whole. Its parts are titled
       `Proofing press, 3 of 8`, a different label every part, and the count control offers only what moves more than
       once (`streamsOf` in `packages/render/src/forecast.ts`), so without this no plan was offered at all. */
    group: 'plan',
    /* NO `every:`, AND THAT IS THE WHOLE TRAP OF THIS REGISTER. An instalment row is already one
       dated part, so a frequency over the top of it would charge the proofing press eight times
       eight. `INSTALLMENTS` in this file is `[1..8].map`, one row a payment, for exactly this
       reason. */
  },
  {
    /* MONEY ON ITS WAY, LANDING ON THE DAY THE ACCOUNT SAYS (`accounts.arrives`). Such an account does not count as cash
       yet, so Cash now leaves it out and this leg brings it in on its day. BANK ACCOUNTS ONLY, because a leg says money
       in by one field equalling one word, and a card's balance on its way is a debt, not a payout. */
    register: 'accounts',
    on: 'arrives',
    amount: 'balance',
    where: 'liquid is false, arrives is set, kind is bank',
    incoming: { field: 'kind', is: 'bank' },
  },
  {
    /* A SUBSCRIPTION IS WALKED FROM THE LIST THAT HOLDS IT, where a record holds one; a record without it installs Money
       with this leg left out (`firstPartyDocument`). */
    register: 'services',
    on: 'renews',
    amount: 'cost',
    where: 'state is not cancelled',
    every: { field: 'cycle', months: { monthly: 1, yearly: 12, two_yearly: 24 } },
  },
  {
    /* A CERTIFICATE'S PAYOUTS, WALKED FROM THE ADD-ON THAT HOLDS THEM (Certificates), and left out of a record without it
       the way the subscriptions leg is (`installSeed`, `firstPartyDocument` and an install all drop a leg over a list the
       record does not hold). Money in on each payout day, every month, quarter or year, until the day it matures. */
    register: 'certificates',
    on: 'next_payout',
    amount: 'payout',
    where: 'state is live',
    incoming: { field: 'direction', is: 'in' },
    every: { field: 'every', months: { monthly: 1, quarterly: 3, yearly: 12 } },
    ends: 'ends',
  },
  {
    /* AND THE VALUE COMING BACK (the principal, grown when it compounds), once, on the day it matures. No `every`: the row has one maturity day. */
    register: 'certificates',
    on: 'ends',
    amount: 'at_maturity',
    where: 'state is live, ends is set',
    incoming: { field: 'direction', is: 'in' },
  },
];

/**
 * EVERYDAY SPENDING, SINCE money-core 3.17.0: the money that went out through the accounts in the last three full
 * months, a week's share of it moved every week to the horizon (`Leg.everyday` in `packages/kernel/src/forecast.ts`).
 *
 * THE WALK HELD ONLY WHAT HAS A DAY AHEAD OF IT, so a record with a salary line and a card it lives on climbed by the
 * salary for ever, and the days its money lasts read longer than they are. Food and fuel have no row ahead of them.
 *
 * CLEARED AND NOT A TRANSFER, as every figure of spending says it: money moved between two of the person's own accounts
 * was not spent, and a card's bill paid from the bank is such a move, so what the card bought is counted once, where it
 * was bought.
 *
 * WHAT IS ALREADY WALKED IS THE BILLS LEGS ABOVE, so rent written as a repeating line and also paid through the bank is
 * not walked twice: the monthly worth of what those legs hold comes off what was measured, and only the rest is moved.
 * THEY ARE NOT WRITTEN OUT AGAIN UNDER `already`, AND THAT IS ON PURPOSE. Left unsaid it is every other leg of the walk
 * the leg is in, which is the same legs: bills, repeating lines, a plan's parts and subscriptions take money off, and
 * money on its way into an account is money in and takes nothing off. Written out, the subscriptions leg would ride
 * inside this one onto a record that holds no such list, where `firstPartyDocument` leaves a leg out by the top of the
 * array and does not look inside a leg, and every figure over the walk was then refused: "There is no register called
 * services". Unsaid, a walk that lost a leg measures against the legs it kept.
 *
 * NOT IN A BOOK'S WALK (`BOOK_LEGS`), because the leg is over the moves and `BOOKED` does not list them.
 */
const EVERYDAY: Leg = {
  register: 'transactions',
  on: 'on',
  amount: 'amount',
  where: 'state is cleared, transfer is false',
  incoming: { field: 'direction', is: 'in' },
  everyday: { months: 3 },
};

/** THE ONE ARRAY EVERYTHING WALKS: the lists that hold a dated amount, and after them what is spent with no day ahead of it. */
export const CASH_LEGS: Leg[] = [...DATED, EVERYDAY];

/** What narrows each dated leg to the money that goes out: a condition added to the leg's own `where`. */
const GOING_OUT: Record<string, string> = {
  obligations: 'direction is owed by me',
  recurring: 'direction is out',
  installments: 'direction is out',
};

/**
 * THE SAME WALK WITH NOTHING COMING IN, SINCE money-core 3.17.0, for how long the cash lasts with no income
 * (`lasts-no-income`): every dated leg narrowed to the money it takes off, then everyday spending as Cash ahead walks it.
 *
 * MONEY ON ITS WAY INTO AN ACCOUNT, AND A CERTIFICATE'S PAYOUTS, ARE LEFT OUT WHOLE, because those legs are only ever money in. A subscription is only ever
 * money out, so its leg stays as it is. Everyday spending measures what went out and walks it out, and what it counts as
 * already walked is the legs beside it, which are now the money-out legs alone. `CASH_LEGS` does not change: Cash ahead
 * and every figure over it still walk both ways.
 */
export const OUT_LEGS: Leg[] = [
  ...DATED.flatMap((leg): Leg[] => {
    if (leg.register === 'accounts' || leg.register === 'certificates') return [];
    const out = GOING_OUT[leg.register];
    return [out === undefined ? leg : { ...leg, where: `${leg.where}, ${out}` }];
  }),
  EVERYDAY,
];

/**
 * THE REPEATING LINES A MONTHLY FIGURE COUNTS: live, going the one way, and not past their last day.
 *
 * `ends` EMPTY, OR ON OR AFTER TODAY, which is the other side of `recurring-ended`'s `ends before today`. That rule moves
 * a line that has ended to `ended` on the hourly sweep, and until it has, `state is live` alone counted the line at its
 * full monthly share. A line's last day is its own, so a line ending today still counts.
 *
 * THE TREE AND NOT THE SENTENCE, because the sentence joins its conditions with a comma or with a comma and `or`, never
 * both (`packages/where/src/sentence.ts`, `conditionsOf`), and this is two conditions and a choice between two more. The
 * kernel reads the tree for a figure as it reads a sentence, a relative day included (`metrics.ts` `resolveRelative`).
 */
export const LIVE_LINES = (direction: 'in' | 'out'): Predicate => ({
  all: [
    { field: 'state', is: 'live' },
    { field: 'direction', is: direction },
    { any: [{ field: 'ends', empty: true }, { field: 'ends', after: 'yesterday' }] },
  ],
});

/**
 * CASH NOW'S ARITHMETIC, WRITTEN ONCE, SINCE money-core 3.1.0 READS IT THREE WAYS: over every account, grouped by book,
 * and over one book's accounts. Three copies could come to disagree about which balance restarts an account, and the
 * per-book figures would then not add up to the whole.
 */
export const ROLLED = {
  rolled: {
    balance: 'balance',
    as_of: 'as_of',
    checks: [
      { register: 'balances', by: 'account', balance: 'balance', on: 'as_of' },
      { register: 'transactions', by: 'account', balance: 'balance_after', on: 'on' },
    ],
    moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out', where: 'state is cleared' },
  },
} as const;
