/**
 * Count the cash: the counted amount less the account's balance, written as a dated transaction, and the account set
 * to what was counted.
 *
 * STARTED BY THE PACK'S AUTOMATION ON EACH NEW COUNT, which hands it the count's id. A count is a row a person writes,
 * because a question to a person offers a closed list of answers and an amount is not one (`count-cash.test.ts`, the
 * first test, measured).
 *
 * THE DIFFERENCE IS A TRANSACTION, NOT AN EDIT TO THE BALANCE ALONE. A balance that jumps from 500.00 to 412.50 with
 * nothing in the ledger is 87.50 nobody can account for, and every figure over the ledger would disagree with the
 * account by that much. So the gap goes in as money out (or in, when there is more than the record thought), dated
 * the day of the count, on that account, and the account's balance and day move to the count.
 *
 * WHAT IT REFUSES TO GUESS. A count in another currency than the account's is said and nothing is written, because
 * two currencies are never subtracted. A count dated before the day the account's balance is from is kept and changes
 * nothing, because a later balance already says more than an older count can correct. A count that agrees writes no
 * transaction and still moves the account's day, since the balance was checked on it.
 */

const WHAT = 'Cash count difference';

export default async function run(ctx) {
  const count = await ctx.record.get(String(ctx.input.id));
  if (count === null) {
    ctx.log('The count that started this run is gone, so nothing was written.');
    return;
  }
  const account = await ctx.record.get(String(count.fields.account));
  if (account === null) {
    ctx.log('The account this count is for is gone, so nothing was written.');
    return;
  }
  const name = String(account.fields.name);
  const counted = count.fields.counted;
  const held = account.fields.balance;
  const day = String(count.fields.on);

  if (counted.currency !== held.currency) {
    ctx.log(`This count is counted in ${counted.currency} and ${name} is held in ${held.currency}, and two currencies are not subtracted, so nothing was written.`);
    return;
  }
  if (typeof account.fields.as_of === 'string' && account.fields.as_of > day) {
    ctx.log(`${name}'s balance is from ${account.fields.as_of}, after this count of ${day}, so the count is kept and nothing else was written.`);
    return;
  }

  const difference = counted.amount - held.amount;
  if (difference !== 0)
    ctx.write('transactions', {
      what: WHAT,
      on: day,
      direction: difference > 0 ? 'in' : 'out',
      amount: { amount: Math.abs(difference), currency: counted.currency },
      account: account.id,
      state: 'cleared',
      note: `From the cash count of ${day}.`,
    });
  ctx.update(`accounts#${account.seq}`, { balance: { amount: counted.amount, currency: counted.currency }, as_of: day }, account.version);
  ctx.update(`cash_counts#${count.seq}`, { difference: { amount: difference, currency: counted.currency } }, count.version);
}
