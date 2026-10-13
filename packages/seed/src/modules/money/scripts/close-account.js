/**
 * Closing an account (REC-B15 step 3), as the decision, the script a host runs round it, and the declaration a pack
 * document carries.
 *
 * AN ACCOUNT MONEY MOVED THROUGH IS CLOSED, NOT DELETED (`lists/accounts.ts`), and closing one that still holds money
 * would drop that money out of Cash now without a word. So an account at nought is closed, and one the record still
 * rolls to an amount asks once: "HSBC (USD) still holds $1,200.00. Move it to another account, or close it as it
 * stands?" Moving writes the two legs of one move, out of this account and into the other on the same day, both marked
 * as between your own accounts, so no figure of spending or income counts either.
 *
 * TWO CURRENCIES ARE NEVER ADDED. Money moves only to an open account whose balance is in the same currency; each such
 * account is an answer of its own, by name, and with none the question is whether to close it as it stands.
 *
 * WHAT IT STILL HOLDS IS HANDED IN, as `holds`, in minor units of the account's own currency, because it is the roll's
 * own arithmetic (`ROLLED` in `../legs.ts`, read by the kernel) and a sandbox runs this file's text alone: a second
 * copy of the roll here would be a second Cash now. Handed none, the balance somebody typed is what it holds.
 *
 * AN ANSWER'S PATCHES CHANGE WHAT IS THERE AND ADD NOTHING (`askOf` in `packages/kernel/src/script-run.ts`), so
 * "Close it as it stands" carries its one change and the gate makes it on the pick, while a move carries none: a pick
 * that closed the account at the gate and wrote no legs would lose the money. The move's legs and its close are made
 * together by the run handed the answer as `input.answer`, by an automation started on the decision, as
 * `last-day.js` takes its own.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `closeAccount`, AND NOTHING BUT `closeAccount` BY `run`: the two texts together are
 * the script (`CLOSE_ACCOUNT_SCRIPT.source`).
 */

export function closeAccount(account, opts) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, and the three written with a sign, for the words of a question
     only: no figure is computed from either table, and a code neither holds reads to two places behind its code. */
  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };
  const SIGNS = { USD: '$', GBP: '£', EUR: '€' };
  /* HOW MANY ACCOUNTS ONE QUESTION OFFERS: more answers than this is a list to read, not a question. */
  const MOST = 4;
  const STAND = 'Close it as it stands';
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  /* TO THE LAST MINOR UNIT, since this is the amount a movement is written for: "$1,200.00", "EGP 1,200.50". */
  const words = (m) => {
    const places = PLACES[m.currency] ?? 2;
    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');
    const whole = digits.slice(0, digits.length - places).replace(/\B(?=(\d{3})+$)/g, ',');
    const sign = SIGNS[m.currency];
    return `${sign ?? `${m.currency} `}${whole}${places === 0 ? '' : `.${digits.slice(-places)}`}`;
  };
  const dayWords = (d) => {
    const m = typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);
  };
  const nameOf = (a) => String(a.fields.name ?? '').trim();

  const f = account.fields;
  const name = nameOf(account) || 'This account';
  const shut = f.state === 'closed';
  const close = shut ? [] : [{ id: account.spoken, version: account.version, fields: { state: 'closed' } }];
  const typed = moneyOf(f.balance);
  const rolled = opts && Number.isSafeInteger(opts.holds) ? opts.holds : typed ? typed.amount : 0;
  const answer = opts && typeof opts.answer === 'string' ? opts.answer : null;

  /* AT NOUGHT, or with no balance to say a currency in, there is nothing to ask about. */
  if (!typed || rolled === 0) return shut ? { nothing: `${name} is already closed.` } : { writes: close, legs: [], said: `${name} is closed.` };

  const held = { amount: Math.abs(rolled), currency: typed.currency };
  const on = opts && typeof opts.on === 'string' ? opts.on : '';
  /* OPEN, ANOTHER ACCOUNT, THE SAME CURRENCY, AND A NAME TO SAY: an account with no name could not be an answer. */
  const others = (opts && Array.isArray(opts.others) ? opts.others : [])
    .filter((o) => o && o.id !== account.id && o.fields && o.fields.state !== 'closed' && nameOf(o) !== '' && moneyOf(o.fields.balance)?.currency === typed.currency)
    .slice(0, MOST);
  /* THE TWO LEGS OF ONE MOVE, the leg out first: the same amount, the same day, each naming the other account in its
     description. Money owed runs the other way, out of the account that covers it. */
  const leg = (what, direction, at) => ({ what, on, direction, amount: held, account: at.id, transfer: true, state: 'cleared' });
  const legsTo = (other) =>
    rolled > 0
      ? [leg(`To ${nameOf(other)}`, 'out', account), leg(`From ${name}`, 'in', other)]
      : [leg(`To ${name}`, 'out', other), leg(`From ${nameOf(other)}`, 'in', account)];
  const moves = on === '' ? [] : others.map((other) => ({
    label: `Move it to ${nameOf(other)}`,
    because:
      rolled > 0
        ? `${words(held)} goes to ${nameOf(other)} on ${dayWords(on)} as one move, and ${name} is closed.`
        : `${words(held)} comes from ${nameOf(other)} on ${dayWords(on)} as one move, and ${name} is closed.`,
    legs: legsTo(other),
    then: close,
    said: rolled > 0 ? `${words(held)} moved from ${name} to ${nameOf(other)}, and ${name} is closed.` : `${words(held)} moved from ${nameOf(other)} to ${name}, and ${name} is closed.`,
  }));
  const still = rolled > 0 ? `still holds ${words(held)}` : `still owes ${words(held)}`;
  const on_it = rolled > 0 ? `with ${words(held)} still on it` : `still owing ${words(held)}`;

  if (answer !== null) {
    const move = moves.find((o) => o.label === answer);
    if (move) return { writes: move.then, legs: move.legs, said: move.said };
    if (answer === STAND && !shut) return { writes: close, legs: [], said: `${name} is closed as it stands, ${on_it}.` };
    if (answer === STAND) return { nothing: `${name} is already closed.` };
    return { nothing: `"${answer}" is not one of the answers, so ${name} stays as it was.` };
  }

  const stand = { label: STAND, because: `It is closed ${on_it}, and nothing is moved.`, ...(shut ? {} : { patches: close }) };
  const ask = (question, options) => ({ ask: { cause: `money.close-account.${account.spoken}`, question, about: name, options } });
  if (moves.length === 0)
    return ask(`${name} ${still}, and no other open account is in ${typed.currency}. Close it as it stands?`, [
      stand,
      { label: 'Leave it open', because: 'Nothing changes, and it stays in Cash now.' },
    ]);
  return ask(`${name} ${still}. Move it to another account, or close it as it stands?`, [
    ...moves.map((o) => ({ label: o.label, because: o.because, legs: o.legs, then: o.then })),
    stand,
  ]);
}

/**
 * The script: `input.account` is the account as a rule names it ("accounts#3"), `input.holds` what the record rolls it
 * to, `input.to` one account the money may go to where the caller already knows, `input.answer` the words of the
 * answer picked, and `input.on` the day of the move, today in the record's own zone when none is handed. It reads the
 * account and the others it could move to, asks `closeAccount`, and either makes the writes or ends its run with the
 * one question.
 *
 * A MOVE IS WRITTEN ONCE. Before the legs go in, the account's own movements between accounts are read, and one that
 * is this leg already (a movement between accounts, the day, the description, the way, the amount) means an earlier
 * run moved the money: this run writes no second pair, and only closes the account if it is still open. THE DAY IS
 * PART OF IT, since "To Savings" for the same amount on another day is a move somebody made before, not this one.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const named = (spoken) => (typeof spoken === 'string' && /^accounts#\d+$/.test(spoken) ? spoken : null);
  /* A RULE HANDS THE ACCOUNT AS ITS LIST AND ITS NUMBER (`{ id, register: 'accounts', seq }`), never as "accounts#3". */
  const at = named(input.account) ?? (input.register === 'accounts' && Number.isSafeInteger(input.seq) ? `accounts#${input.seq}` : null);
  if (!at) {
    ctx.log('The script was handed no account, so nothing was closed.');
    return null;
  }
  const row = await ctx.record.get(at);
  if (!row) {
    ctx.log('The account is no longer in the record, so nothing was closed.');
    return null;
  }
  const account = { id: row.id, spoken: at, version: row.version, fields: row.fields };

  /* THE ONE ACCOUNT HANDED, or every account there is: which of them are open and in the same currency is the
     decision's to say. NO FILTER ON STATUS HERE, since an account typed before the field was there holds none and is
     open (`lists/accounts.ts`), and a filter that read a missing status as no match would hide it. Accounts are few,
     and a script's list is one page. */
  const to = named(input.to);
  const one = to ? await ctx.record.get(to) : null;
  const others = to ? (one ? [one] : []) : await ctx.record.list('accounts');

  /* TODAY, IN THE RECORD'S OWN ZONE, so a move made late in the evening is not dated tomorrow. */
  const today = () => {
    const now = new Date(ctx.now());
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    } catch {
      return now.toISOString().slice(0, 10);
    }
  };
  const on = typeof input.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.on) ? input.on : today();

  const opts = { on, others: others.map((o) => ({ id: o.id, fields: o.fields })) };
  if (Number.isSafeInteger(input.holds)) opts.holds = input.holds;
  if (typeof input.answer === 'string') opts.answer = input.answer;

  const out = closeAccount(account, opts);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  /* WHAT THE GATE READS OF AN ANSWER, and no more: its words and the changes it can make itself. */
  if (out.ask) return { ask: { ...out.ask, options: out.ask.options.map((o) => ({ label: o.label, because: o.because, ...(o.patches && o.patches.length > 0 ? { patches: o.patches } : {}) })) } };

  let legs = out.legs;
  if (legs.length > 0) {
    const mine = legs.find((l) => l.account === account.id);
    const moved = await ctx.record.list('transactions', { all: [{ field: 'account', is: account.id }, { field: 'transfer', is: true }] });
    const same = (m) => m && m.amount === mine.amount.amount && m.currency === mine.amount.currency;
    const leg = (f) => f.transfer === true && f.on === mine.on && f.what === mine.what && f.direction === mine.direction && f.state !== 'void' && same(f.amount);
    if (moved.some((t) => leg(t.fields))) legs = [];
  }
  if (legs.length === 0 && out.legs.length > 0 && out.writes.length === 0) {
    ctx.log(`${account.fields.name} was already moved and closed, so nothing changed.`);
    return null;
  }
  for (const l of legs) ctx.write('transactions', l);
  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(legs.length === 0 && out.legs.length > 0 ? `${account.fields.name} was already moved, and is closed now.` : out.said);
  return { closed: account.spoken, moved: legs.length };
}

/**
 * The script as Money's pack document writes it, as `SETTLE_SCRIPT` is: no egress, no keys, started by a rule and never
 * by the clock, reading Accounts and the Ledger and writing the account's status and the two legs of a move.
 */
export const CLOSE_ACCOUNT_SCRIPT = {
  script: 'close_account',
  title: 'Close an account, and ask about what it still holds',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['accounts', 'transactions'],
  writes: ['accounts', 'transactions'],
  source: `${closeAccount.toString()}\nexport default ${run.toString()}`,
};
