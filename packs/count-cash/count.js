/**
 * Count the cash: the count written as a balance check, and the counted amount less what the record rolls the account
 * to on that day written as a dated transaction.
 *
 * STARTED BY THE PACK'S AUTOMATION ON EACH NEW COUNT, which hands it the count's id. A count is a row a person writes,
 * because a question to a person offers a closed list of answers and an amount is not one.
 *
 * A COUNT IS A BALANCE CHECK. It says what the account held on a day, which is what a row of money-core's `balances`
 * is, so it is written there, and Cash now restarts the account from it and adds only what moved after it. The
 * account's own balance is what a person typed, and this script never writes over it.
 *
 * THE DIFFERENCE IS AGAINST THE ROLLED FIGURE, NOT THE ACCOUNT'S TYPED BALANCE. The balance on the account is what
 * somebody said on its `as_of`, and every movement after that day has moved the money since. Subtracting the count from
 * the typed balance would count those movements twice, once in the ledger and once in the difference. So the figure a
 * count is compared with is the one Cash now reads: the newest thing anybody said the account held on or before the
 * count's day (the account's own balance, a balance check, or a bank message's balance after a movement, the account's
 * own winning a tie), plus every cleared movement after it up to that day.
 *
 * THE DIFFERENCE IS STILL A TRANSACTION. A gap nobody can account for is money that went somewhere, and every figure
 * over the ledger (spent this month, in and out) should see it. It is dated the day of the count, and a check on that
 * day already says what the account held after it, so Cash now does not add it a second time.
 *
 * WHICH BOOK. The check and the difference are filed in the account's own book when it has one (money-core 3.1.0), so
 * a book's page shows them beside the account they are about.
 *
 * WHAT IT REFUSES TO GUESS. A count in another currency than the account's is said on the count and nothing else is
 * written, because two currencies are never subtracted. A count dated before the day the account's own balance is from is kept and
 * changes nothing, because that balance already says more than an older count can correct. A count that agrees writes
 * no transaction and still writes the check, since the balance was checked on that day.
 *
 * AN ENTRY IN ANOTHER CURRENCY IS NOT LEFT OUT QUIETLY (1.3.0). This script works the roll out in its own code and
 * cannot convert, where the record's own roll converts a cleared entry in another currency at the day's rate. Leaving
 * such an entry out filed a difference equal to it, money the Ledger already held. So an account that holds one since
 * its last statement is not compared: the count is kept, it says so in What happened, and no check and no
 * difference are written. This lasts until a script can read the record's own figure for a day.
 *
 * THE WAY OUT IS SAID ON THE COUNT (1.3.1). The sentence under What happened ends by naming it: type the account's
 * balance, then count again. Without it a box with one sale in another currency read as uncounted for good.
 *
 * WHICH BALANCE IS SAID TOO (1.3.2). "The account's balance" read as the cash just counted, and a box typed to the
 * count agrees with the next count for good, so the gap the count was for is never written. The sentence now asks for
 * the figure the bank or the statement shows, and says it is not the cash in the box.
 *
 * A COUNT IN ANOTHER CURRENCY SAYS SO ON THE COUNT TOO (1.3.3). Counted in one currency against an account held or
 * last stated in another, the run wrote its reason to its own log and nothing a person reads, so the count stood with
 * no difference and no word. Both of those paths now write What happened, naming the two currencies and the way out:
 * count in the account's currency. Still no check and no difference for such a count.
 *
 * A COUNT THAT FILES SAYS WHERE IT WENT (1.4.0). Money shows the newest count, how far out it was and What happened,
 * so a count whose difference went into the Ledger says so there. A count that agrees files nothing and says nothing.
 *
 * COUNTED BY NOTE AND COIN (2.0.0). A count may carry `denominations`, `{ currency, notes: { "200": 3, "0.25": 4 } }`, the
 * note or coin's face value in the currency's main unit and how many of it were counted. The total is worked out here
 * from the sets below, and a value outside the currency's set is refused in words rather than guessed at. A count that
 * names both a total and notes must agree. A count with no notes is read exactly as before, so every older count stays
 * readable and nothing about it changes.
 *
 * THE DIFFERENCE, RECORDED ONE OF TWO WAYS (2.0.0). `reconcile` is `discrepancy`, the whole difference as one entry
 * under the Discrepancy category, or `lines`, where the person has said what part of it was what in `lines`
 * (`[{ what, amount, category?, note? }]`, amounts in the main unit) and whatever is left becomes one Discrepancy entry.
 * A count that says neither is filed as it always was, as one "Cash count difference" entry.
 */

const WHAT = 'Cash count difference';
/** The name of the category the unexplained part of a difference is filed under. */
const DISCREPANCY = 'Discrepancy';

/**
 * The notes and coins each currency has, by face value in its main unit (2.0.0). A currency not listed is counted by
 * typing its total, as before.
 */
const NOTE_SETS = {
  EGP: ['200', '100', '50', '20', '10', '5', '1', '0.5', '0.25'],
  USD: ['100', '50', '20', '10', '5', '2', '1', '0.5', '0.25', '0.1', '0.05', '0.01'],
  EUR: ['500', '200', '100', '50', '20', '10', '5', '2', '1', '0.5', '0.2', '0.1', '0.05', '0.02', '0.01'],
  GBP: ['50', '20', '10', '5', '2', '1', '0.5', '0.2', '0.1', '0.05', '0.02', '0.01'],
  SAR: ['500', '200', '100', '50', '20', '10', '5', '2', '1', '0.5', '0.25', '0.1', '0.05'],
  AED: ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.5', '0.25'],
};
/** Every currency in the sets counts in hundredths. */
const MINOR = 100;
const minor = (main) => Math.round(Number(main) * MINOR);

/** What a count whose notes cannot be read says under What happened, with the way out. */
const BAD_NOTES = (why) => `The notes and coins could not be read, so nothing was filed: ${why} Count again.`;
const BAD_LINES = (why) => `The lines for the difference could not be used, so nothing was filed: ${why} Count again.`;

/**
 * The total of a count's notes and coins in hundredths, with how it reads, or the reason it cannot be read.
 * `{ total, currency, said }` or `{ why }`.
 */
function totalOf(denominations, fallback) {
  if (denominations === null || typeof denominations !== 'object' || Array.isArray(denominations)) return { why: 'they are not a list of values and numbers.' };
  const currency = typeof denominations.currency === 'string' && denominations.currency !== '' ? denominations.currency : fallback;
  const set = NOTE_SETS[currency];
  const notes = denominations.notes;
  if (notes === null || typeof notes !== 'object' || Array.isArray(notes)) return { why: 'there are no notes in them.' };
  if (set === undefined) return { why: `${currency} has no set of notes here, so type its total.` };
  let total = 0;
  const parts = [];
  for (const key of Object.keys(notes).sort((x, y) => minor(y) - minor(x))) {
    const n = notes[key];
    if (!set.some((v) => minor(v) === minor(key))) return { why: `${key} is not a ${currency} note or coin.` };
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return { why: `${n} of ${key} is not a whole number.` };
    if (n === 0) continue;
    total += n * minor(key);
    parts.push(`${n} × ${Number(key)}`);
  }
  return { total, currency, said: parts.length === 0 ? 'No notes or coins.' : `Counted ${parts.join(', ')}.` };
}

/** The lines of a difference, as entries, and what is left, or the reason they cannot be used. */
function linesOf(lines, difference) {
  if (!Array.isArray(lines)) return { why: 'they are not a list.' };
  const out = [];
  let sum = 0;
  for (const l of lines) {
    if (l === null || typeof l !== 'object' || typeof l.what !== 'string' || l.what.trim() === '') return { why: 'every line needs words for what it was.' };
    const amount = minor(l.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { why: `${l.what} needs an amount above nothing.` };
    sum += amount;
    out.push({ what: l.what.trim(), amount, category: typeof l.category === 'string' ? l.category : '', note: typeof l.note === 'string' ? l.note : '' });
  }
  if (sum > Math.abs(difference)) return { why: 'together they are more than the difference.' };
  return { entries: out, rest: Math.abs(difference) - sum };
}

/** The id of the category with this name, or nothing. */
async function categoryId(ctx, name) {
  if (name === '') return null;
  const rows = await ctx.record.list('categories', { all: [{ field: 'name', is: name }] });
  return rows.length === 0 ? null : rows[0].id;
}
/**
 * What a count says when its account was not compared, and the way out (1.3.1): a balance typed on the account after
 * the entry is a newer statement, so the next count rolls from it and is compared. The balance to type is the one the
 * bank or the statement shows (1.3.2), never the cash just counted, which would hide the gap. The account's name is in
 * the run's log beside it.
 */
const NOT_COMPARED = 'This account holds an entry in another currency, so it was not compared. On the account, type the balance its bank or statement shows, not the cash in the box, then count again.';

/** What a count in another currency than its account says under What happened (1.3.3), with the way out. */
const otherCurrency = (counted, held) => `This count is in ${counted} and the account is in ${held}, so it was not compared. Count in the account's currency.`;

/** What a count whose difference was written into the Ledger says under What happened (1.4.0). */
const FILED = 'Filed as one entry in the Ledger.';

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
 * after that statement up to the day, in the statement's currency. No `amount` where a statement is in another
 * currency than `currency`, and `foreign` where a cleared movement since the statement is, which this script cannot
 * convert: the caller says either and writes no difference.
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
    if (money === null || typeof money !== 'object') continue;
    if (money.currency !== currency) return { currency, foreign: true };
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
  const held = account.fields.balance;
  const day = String(count.fields.on);
  const heldCurrency = held !== null && typeof held === 'object' ? held.currency : 'EGP';

  /* NOTES AND COINS, when the count has them: the total is theirs, and a total typed beside them must agree. */
  let counted = count.fields.counted;
  let breakdown = '';
  const has = count.fields.denominations !== undefined && count.fields.denominations !== null;
  if (has) {
    const read = totalOf(count.fields.denominations, counted !== null && typeof counted === 'object' ? counted.currency : heldCurrency);
    if (read.why !== undefined) {
      ctx.log(`The notes and coins of this count could not be read: ${read.why}`);
      ctx.update(`cash_counts#${count.seq}`, { said: BAD_NOTES(read.why) }, count.version);
      return;
    }
    if (counted !== null && typeof counted === 'object' && (counted.currency !== read.currency || counted.amount !== read.total)) {
      const why = 'the total typed is not what the notes and coins add up to.';
      ctx.log(`The notes and coins of this count do not match its total, so nothing was written.`);
      ctx.update(`cash_counts#${count.seq}`, { said: BAD_NOTES(why) }, count.version);
      return;
    }
    counted = { amount: read.total, currency: read.currency };
    breakdown = read.said;
  }
  if (counted === null || typeof counted !== 'object') {
    ctx.log('This count has neither a total nor notes and coins, so nothing was written.');
    ctx.update(`cash_counts#${count.seq}`, { said: BAD_NOTES('there is no total and no notes.') }, count.version);
    return;
  }
  const countedNow = has ? { counted } : {};
  const say = (text) => (breakdown === '' ? text : text === undefined ? breakdown : `${breakdown} ${text}`);

  if (held !== null && typeof held === 'object' && counted.currency !== held.currency) {
    ctx.log(`This count is counted in ${counted.currency} and ${name} is held in ${held.currency}, and two currencies are not subtracted, so no difference was written.`);
    ctx.update(`cash_counts#${count.seq}`, { ...countedNow, said: say(otherCurrency(counted.currency, held.currency)) }, count.version);
    return;
  }
  if (typeof account.fields.as_of === 'string' && account.fields.as_of > day) {
    ctx.log(`${name}'s balance is from ${account.fields.as_of}, after this count of ${day}, so the count is kept and nothing else was written.`);
    if (has) ctx.update(`cash_counts#${count.seq}`, { ...countedNow, said: say(undefined) }, count.version);
    return;
  }

  const rolled = await rolledOn(ctx, account, day, counted.currency);
  if (rolled.foreign === true) {
    ctx.log(`${name} holds an entry in another currency than ${counted.currency} since it was last stated, so this count was not compared and no difference was written.`);
    ctx.update(`cash_counts#${count.seq}`, { ...countedNow, said: say(NOT_COMPARED) }, count.version);
    return;
  }
  if (rolled.amount === undefined) {
    ctx.log(`This count is counted in ${counted.currency} and ${name} was last said to hold ${rolled.currency}, and two currencies are not subtracted, so no difference was written.`);
    ctx.update(`cash_counts#${count.seq}`, { ...countedNow, said: say(otherCurrency(counted.currency, rolled.currency)) }, count.version);
    return;
  }

  const book = typeof account.fields.book === 'string' && account.fields.book !== '' ? { book: account.fields.book } : {};
  const difference = counted.amount - rolled.amount;
  const direction = difference > 0 ? 'in' : 'out';
  const entry = (what, amount, category, note) => ({
    what,
    on: day,
    direction,
    amount: { amount, currency: counted.currency },
    account: account.id,
    state: 'cleared',
    note,
    ...(category === null ? {} : { category }),
    ...book,
  });
  const fromCount = `From the cash count of ${day}.`;

  /* HOW THE DIFFERENCE IS RECORDED. Unsaid is the single entry an older count always got. */
  let filedAs = FILED;
  if (difference !== 0) {
    if (count.fields.reconcile === 'lines') {
      const split = linesOf(count.fields.lines ?? [], difference);
      if (split.why !== undefined) {
        ctx.log(`The lines for this count's difference could not be used: ${split.why}`);
        ctx.update(`cash_counts#${count.seq}`, { ...countedNow, said: say(BAD_LINES(split.why)) }, count.version);
        return;
      }
      for (const l of split.entries) ctx.write('transactions', entry(l.what, l.amount, await categoryId(ctx, l.category), l.note === '' ? fromCount : l.note));
      if (split.rest > 0) ctx.write('transactions', entry(DISCREPANCY, split.rest, await categoryId(ctx, DISCREPANCY), fromCount));
      const n = split.entries.length;
      filedAs = n === 0 ? 'Filed as Discrepancy in the Ledger.' : split.rest > 0 ? `Filed as ${n} ${n === 1 ? 'line' : 'lines'} and the rest as Discrepancy in the Ledger.` : `Filed as ${n} ${n === 1 ? 'line' : 'lines'} in the Ledger.`;
    } else if (count.fields.reconcile === 'discrepancy') {
      ctx.write('transactions', entry(DISCREPANCY, Math.abs(difference), await categoryId(ctx, DISCREPANCY), fromCount));
      filedAs = 'Filed as Discrepancy in the Ledger.';
    } else {
      ctx.write('transactions', entry(WHAT, Math.abs(difference), null, fromCount));
    }
  }
  ctx.write('balances', {
    account: account.id,
    balance: { amount: counted.amount, currency: counted.currency },
    as_of: day,
    source: `Cash count of ${day}`,
    ...book,
  });
  const filed = difference === 0 ? (breakdown === '' ? {} : { said: breakdown }) : { said: say(filedAs) };
  ctx.update(`cash_counts#${count.seq}`, { ...countedNow, difference: { amount: difference, currency: counted.currency }, ...filed }, count.version);
}
