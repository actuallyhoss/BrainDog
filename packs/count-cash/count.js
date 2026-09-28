/**
 * Count the cash: the count written as a balance check, and the counted amount less what the record rolls the account
 * to on that day written as a dated transaction.
 *
 * STARTED BY THE PACK'S AUTOMATION ON EACH NEW COUNT, which hands it the count's id. A count is a row a person writes,
 * because a question to a person offers a closed list of answers and an amount is not one (`count-cash.test.ts`, the
 * first test, measured).
 *
 * A COUNT IS A BALANCE CHECK, SINCE 1.1.0. It says what the account held on a day, which is what a row of money-core's
 * `balances` is, so it is written there, and Cash now restarts the account from it and adds only what moved after it.
 * Before 1.1.0 it set the account's own balance and day, and the account then said the count and nothing else about
 * what it had held before, while a balance a person typed was written over by a script.
 *
 * THE DIFFERENCE IS AGAINST THE ROLLED FIGURE, NOT THE ACCOUNT'S TYPED BALANCE. The balance on the account is what
 * somebody said on its `as_of`, and every movement after that day has moved the money since. Subtracting the count from
 * the typed balance counted those movements a second time, once in the ledger and once in the difference
 * (`loop/finish/modules.md` MOD-20). So the figure a count is compared with is the one Cash now reads: the newest thing
 * anybody said the account held on or before the count's day (the account's own balance, a balance check, or a bank
 * message's balance after a movement, the account's own winning a tie), plus every cleared movement after it up to
 * that day.
 *
 * THE DIFFERENCE IS STILL A TRANSACTION. A gap nobody can account for is money that went somewhere, and every figure
 * over the ledger (spent this month, in and out) should see it. It is dated the day of the count, and a check on that
 * day already says what the account held after it, so Cash now does not add it a second time.
 *
 * WHICH BOOK. The check and the difference are filed in the account's own book when it has one (money-core 3.1.0), so
 * a book's page shows them beside the account they are about.
 *
 * WHAT IT REFUSES TO GUESS. A count in another currency than the account's is said and nothing is written, because
 * two currencies are never subtracted. A count dated before the day the account's own balance is from is kept and
 * changes nothing, because that balance already says more than an older count can correct. A count that agrees writes
 * no transaction and still writes the check, since the balance was checked on that day.
 */

const WHAT = 'Cash count difference';

/** The most rows one `ctx.record.list` answers, the record's own page. A full page may have left rows out. */
const PAGE = 50;
/** The first day a window reaches back to when nothing stated the account before the count. */
const EARLIEST = '1900-01-01';

const DAY_MS = 86_400_000;
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
const dayOf = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Rows of `register` about one account whose `field` is after `from` and on or before `to`, with `more` leaves. */
const inWindow = (ctx, register, account, field, from, to, more) =>
  ctx.record.list(register, {
    all: [{ field: 'account', is: account }, { field, gt: from }, { field, lte: to }, ...more],
  });

/**
 * Every such row, however many there are. A window whose page comes back full is cut in two by day and each half asked
 * again, so an account with a busy month is read whole rather than as its first page.
 */
async function allInWindow(ctx, register, account, field, from, to, more) {
  const rows = await inWindow(ctx, register, account, field, from, to, more);
  if (rows.length < PAGE) return rows;
  const low = dayNumber(from);
  const high = dayNumber(to);
  if (high - low <= 1) throw new Error(`More than ${PAGE} rows of ${register} fall on ${to} for one account, so the count could not be compared and nothing was written.`);
  const mid = dayOf(Math.floor((low + high) / 2));
  return [...(await allInWindow(ctx, register, account, field, from, mid, more)), ...(await allInWindow(ctx, register, account, field, mid, to, more))];
}

/** The newest statement a list holds about one account after `from` and on or before `to`, or `null`. */
async function newestIn(ctx, register, account, field, balance, from, to) {
  const rows = await allInWindow(ctx, register, account, field, from, to, [{ field: balance, present: true }]);
  let best = null;
  for (const r of rows) {
    const day = String(r.fields[field]).slice(0, 10);
    const money = r.fields[balance];
    if (money === null || typeof money !== 'object') continue;
    if (best === null || day > best.day || (day === best.day && r.seq > best.seq)) best = { day, money, seq: r.seq };
  }
  return best;
}

/**
 * What Cash now would say the account held on `day`: the newest statement on or before it, and every cleared movement
 * after that statement up to the day, in the statement's currency. `null` where a statement is in another currency
 * than `currency`, which the caller says and writes nothing for.
 */
async function rolledOn(ctx, account, day, currency) {
  const own = account.fields.balance;
  const ownDay = typeof account.fields.as_of === 'string' ? account.fields.as_of.slice(0, 10) : null;
  const floor = ownDay ?? EARLIEST;
  /* STRICTLY AFTER THE ACCOUNT'S OWN DAY, because on a tie the account's own statement wins, as it does in Cash now. */
  const checked = await newestIn(ctx, 'balances', account.id, 'as_of', 'balance', floor, day);
  const said = await newestIn(ctx, 'transactions', account.id, 'on', 'balance_after', floor, day);
  let start = own !== null && typeof own === 'object' && ownDay !== null ? { day: ownDay, money: own } : null;
  for (const s of [checked, said]) if (s !== null && (start === null || s.day > start.day)) start = s;
  if (start !== null && start.money.currency !== currency) return { currency: start.money.currency };

  const moves = await allInWindow(ctx, 'transactions', account.id, 'on', start === null ? EARLIEST : start.day, day, [{ field: 'state', is: 'cleared' }]);
  let amount = start === null ? 0 : start.money.amount;
  for (const m of moves) {
    const money = m.fields.amount;
    if (money === null || typeof money !== 'object' || money.currency !== currency) continue;
    amount += m.fields.direction === 'out' ? -money.amount : money.amount;
  }
  return { currency, amount };
}

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

  if (held !== null && typeof held === 'object' && counted.currency !== held.currency) {
    ctx.log(`This count is counted in ${counted.currency} and ${name} is held in ${held.currency}, and two currencies are not subtracted, so nothing was written.`);
    return;
  }
  if (typeof account.fields.as_of === 'string' && account.fields.as_of > day) {
    ctx.log(`${name}'s balance is from ${account.fields.as_of}, after this count of ${day}, so the count is kept and nothing else was written.`);
    return;
  }

  const rolled = await rolledOn(ctx, account, day, counted.currency);
  if (rolled.amount === undefined) {
    ctx.log(`This count is counted in ${counted.currency} and ${name} was last said to hold ${rolled.currency}, and two currencies are not subtracted, so nothing was written.`);
    return;
  }

  const book = typeof account.fields.book === 'string' && account.fields.book !== '' ? { book: account.fields.book } : {};
  const difference = counted.amount - rolled.amount;
  if (difference !== 0)
    ctx.write('transactions', {
      what: WHAT,
      on: day,
      direction: difference > 0 ? 'in' : 'out',
      amount: { amount: Math.abs(difference), currency: counted.currency },
      account: account.id,
      state: 'cleared',
      note: `From the cash count of ${day}.`,
      ...book,
    });
  ctx.write('balances', {
    account: account.id,
    balance: { amount: counted.amount, currency: counted.currency },
    as_of: day,
    source: `Cash count of ${day}`,
    ...book,
  });
  ctx.update(`cash_counts#${count.seq}`, { difference: { amount: difference, currency: counted.currency } }, count.version);
}
