/**
 * Mercury, every hour: each account's balance into Money's accounts, then its transactions into the ledger, one row a
 * transaction, kept in step as it clears.
 *
 * WHY A SCRIPT AND NOT A PULL. Mercury says which way money moved by the sign of `amount` and nothing else, and a
 * pull's `map:` cannot read a sign (`mercury.test.ts`, "A TRANSACTIONS PULL WRITES NOTHING", measured). The
 * transactions also live under each account's own id, `/api/v1/account/<id>/transactions`, which a pull's fixed path
 * cannot follow. A script asks for the accounts, then for each one's transactions.
 *
 * THE BALANCES ARE THIS SCRIPT'S TOO, SINCE 1.2.0, and run first. Before it a pull beside this script wrote them, found
 * an account again by its name only, and wrote one beside every account a person had typed under another name, so the
 * company's cash counted twice. The pull is gone: one key path, one order, balances then transactions.
 *
 * AN ACCOUNT MERCURY HAS ARCHIVED IS NOT NEW MONEY, SINCE 1.3.2. Mercury goes on listing an account it archived, and a real
 * organisation holds several, listed before the live ones. Each was written as a $0 row of its own, and each spent one of
 * the run's fetches, so a live account listed past them never had its transactions read. One no row holds is passed over;
 * one a row holds still has its balance kept. Neither has its transactions asked for.
 *
 * AN ACCOUNT IS FOUND BY MERCURY'S OWN ID, in `mercury_account`, a field this pack lays on Accounts, and never by its
 * name. A person may rename the row and it is still Mercury's. Every read and write of an account goes by it. A held
 * account's balance and day move each hour; its name, whether it counts as cash and its book (once filed) are a
 * person's and are left alone. An account Mercury stops listing keeps its last balance, since an answer that left one
 * out is not one that closed it.
 *
 * A ROW WHOSE TAGS HOLD MERCURY'S ID IS THAT ACCOUNT, SINCE 1.3.2, whatever its name: a record brought from elsewhere keeps
 * the bank's id in a tag, and an id is proof where a name is a guess. It is taken first, like a row typed under Mercury's name.
 *
 * FIRST CONTACT, FOR A MERCURY ACCOUNT NO ROW HOLDS THE ID OF. The candidates are the live bank accounts that no feed
 * keeps (no `mercury_account`, no `stripe_kind`), in the same currency, whose name, case folded, is Mercury's name or
 * nickname for it. Exactly one is adopted, and only when no other Mercury account met this hour names it too: the id
 * is written on it, its balance moves to Mercury's, and its name, its cash and its book are kept. So a row the 1.1.0
 * pull wrote, under Mercury's name, is adopted the first hour and nothing is written twice. None or several: the account is written as its own row, and when the record holds any bank account
 * in that currency that no feed keeps, which could be the same money under another name, that row does not count as
 * cash and carries the note "Not yet matched to an account you typed", and the log says how many. A person answers by
 * saying which row it is, or that it is new; one who sets it to count as cash has answered, and the note goes. A record
 * that holds no such account cannot count the money twice, so there the row counts as cash from the first hour.
 *
 * THE CURRENCY IS MERCURY'S FOR THE ACCOUNT: its `currency` when it names one, and otherwise dollars, the only
 * currency a Mercury account has held. Mercury's amounts are in whole units with decimals, and are moved to the
 * currency's minor units, cents for dollars, as integers. A transaction takes its account's currency.
 *
 * ONE ROW A TRANSACTION, FOUND AGAIN BY MERCURY'S OWN ID. The id goes in `mercury_id`, a field this pack lays on the
 * ledger, and every hour re-reads the last thirty days: a transaction already held is updated in place, never
 * written twice, and a pending one becomes cleared when Mercury says `sent`.
 *
 * THE PAYEE AS MERCURY NAMES IT, SINCE 1.1.0, in `counterparty_text`: `counterpartyName` as it came, and nothing when
 * Mercury names nobody, never the nickname or the bank's own line, which are a person's words and the bank's. It is the
 * text the record turns into a payee key (`bank:`, prefixes and case folded by the kernel, not here), so the same shop
 * is one organisation however it is spelled, and linking the row to that organisation is the record's rule, not this
 * script's. A row held before 1.1.0 gains it the next hour; one that has it already keeps it, whoever wrote it.
 *
 * ONLY THE BANK'S FACTS ARE UPDATED: the day, the direction, the amount and the state. What a person or a rule set on a
 * row, its category above all, and its description, project, person or note, is never in the patch. So a category
 * somebody pinned stays pinned however many times Mercury restates the transaction, and a row somebody voided stays
 * void. On a new row the category is Mercury's own when the record has a live category of exactly that name facing the
 * same way, and otherwise it is left for the record's own rules to file.
 *
 * A ROW SOMEBODY DELETED STAYS DELETED. The ledger is read with its deleted rows as well (`includeDeleted`, which a
 * script's list takes), for the transactions it holds no live row for, and one
 * whose row a person deleted is left out, where it used to be written anew the next hour because the list read live
 * rows only. Voiding and deleting now both take a Mercury transaction out of the figures for good.
 *
 * A ROW TYPED IN BY HAND BEFORE THE PACK IS TAKEN, NOT COUNTED BESIDE IT. A record kept by hand holds the last month
 * already, and the first run wrote all thirty days again beside it, so every figure counted them twice. So before
 * a transaction it holds no row for is written, the ledger is asked for a live row with no Mercury transaction that is
 * the same money: the same account, the same amount and direction, and a day on the bank's day or either side of it,
 * because a person types the day they paid and the bank posts the day it cleared. Exactly one is taken: it carries the
 * transaction from then on, its day and state move to the bank's, and its category, description, note, project and
 * person are kept. Two or more are not guessed between: the transaction is written as its own row and the log names its
 * day and amount, so a person can void the spare. The log says how many were taken. A void row is not the same money,
 * because voiding took it out of the figures, so it is never taken.
 *
 * EVERY ROW IN ONE BOOK, WHEN THE PACK IS TOLD WHICH. The `book` setting files each account and transaction this
 * script writes in that book of money-core's. The book is the one thing past the bank's facts this script adds to a row
 * it already holds, and only to a row in no book yet, because a person may have moved a row on purpose. Left at 0 the
 * setting files nothing.
 *
 * THE KEY IS THE `grant` SETTING, the label of a key in the vault and never the key itself, read from `ctx.config` on
 * every run. The pack declares the same setting as the key this script sends. A key Mercury refuses stops the run with
 * a sentence and writes nothing, so the last balances and transactions stand as they were, and the record pauses a
 * script after three refused runs.
 */

const API = "https://api.mercury.com";
const DAYS = 30;
/* THE MOST ROWS ONE LIST ANSWERS, since a script's list names no limit and the record's default is this (`list` in
   `packages/kernel/src/index.ts`). So a list asks about at most this many names or ids at once, and each comes back
   whole. */
const PAGE = 50;
/* THE IDS ONE READ OF DELETED ROWS ASKS ABOUT: half a page, because an id can have two deleted rows, the one a person
   deleted and the copy this script wrote again before 1.2.0 that a person deleted as well, and both have to fit in the
   answer. */
const GONE = PAGE / 2;
/* HOW FAR A ROW TYPED BY HAND MAY BE FROM THE BANK'S DAY AND STILL BE THE SAME MONEY, in days either side. */
const NEAR = 1;
const DAY_MS = 86400000;
/* THE DECLARED `limits.writes`. Past it the run would be refused whole, so the script stops queuing one short of it
   and the rest arrive the next hour, which finds what this hour wrote. */
const WRITES = 1000;
/* THE DECLARED `limits.fetches`, the accounts list and one a Mercury account. The same reason: a fetch past it refuses
   the run whole, so an account past it is said and not asked about. */
const FETCHES = 12;
const STATES = { pending: 'pending', sent: 'cleared', cancelled: 'void', failed: 'void' };
/* THE NOTE ON AN ACCOUNT FIRST CONTACT COULD NOT PAIR WITH ONE A PERSON TYPED, which is why it does not count as cash. */
export const NOT_MATCHED = 'Not yet matched to an account you typed';
/* THE FIELDS A FEED MARKS ITS OWN ACCOUNTS BY. An account carrying one is that feed's, never a candidate here. */
const FEED_MARKS = ['mercury_account', 'stripe_kind'];
/* WHAT MERCURY CALLS AN ACCOUNT THAT IS SHUT. It keeps listing them. */
const SHUT = new Set(['archived', 'deleted']);
const shut = (a) => SHUT.has(a?.status);
/**
 * THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, with the decimals the record keeps (`EXPONENT` in
 * `packages/kernel/src/ingest.ts`). Mercury sends whole units with decimals, so an amount is multiplied by ten to these
 * and rounded, and a currency not named here takes two.
 */
const DECIMALS = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};
const decimalsOf = (currency) => DECIMALS[currency] ?? 2;

/** An amount Mercury sends in whole units, in the record's minor units for `currency`, an integer. */
export const minorOf = (amount, currency) => Math.round(Number(amount) * 10 ** decimalsOf(currency));

/** The currency Mercury gives for an account: its `currency` when it is a three-letter code, and else dollars. */
export const currencyOf = (account) => {
  const said = typeof account?.currency === 'string' ? account.currency.trim() : '';
  return /^[A-Za-z]{3}$/.test(said) ? said.toUpperCase() : 'USD';
};

/** A name as first contact compares it: spaces trimmed and run together, case folded. */
export const fold = (name) => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '');

/**
 * AN ACCOUNT THIS PACK KEEPS SAYS SO IN MONEY'S OWN WORDS, SINCE 1.3.0: `no_feed` false, "fed by the bank", which is what
 * Money reads before it posts a repeating line to an account itself (`post-due` in money-core). Written on every account
 * the pack writes or takes over, and on one it already held the next hour, so Money never has to know this pack's field.
 */
const FED = (row) => (row.fields.no_feed === false ? {} : { no_feed: false });

const unmarked = (row) => FEED_MARKS.every((f) => row.fields[f] === undefined || row.fields[f] === null || row.fields[f] === '');
/* THE BOOK THIS PACK FILES ITS ROWS IN: the `book` setting, the number of a row of money-core's `books` (books#2), so
   the company's Mercury money sits on the company's book page and not in the household's. Anything but a whole number
   above 0 files nothing. */
const bookOf = (config) => {
  const book = Number(config?.book);
  return Number.isInteger(book) && book > 0 ? { book: `books#${book}` } : {};
};

/** The label of the key both halves of the pack send, from the `grant` setting, or a sentence when none is set. */
const keyOf = (config) => {
  const key = typeof config?.grant === 'string' ? config.grant.trim() : '';
  if (key === '') throw new Error(`No key is set, so Mercury was not asked. Set the label of a read-only Mercury key on this pack's page.`);
  return key;
};

async function ask(ctx, path) {
  const key = keyOf(ctx.config);
  const r = await ctx.fetch(API + path, { key });
  if (r.status === 401)
    throw new Error(`Mercury refused the key labelled "${key}" (401), so nothing was written. Put a working read-only token in the vault under that label.`);
  if (!r.ok) throw new Error(`Mercury answered ${r.status}, so nothing was written this hour.`);
  return r.json();
}

const chunks = (list, size = PAGE) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** A day, `n` days on (or back, when `n` is negative). */
const dayFrom = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * An amount as a person reads it in the log, grouped, with its currency after it. The ledger holds minor units, the
 * decimals `minorOf` multiplied Mercury's amount by, so the same decimals are put back here.
 */
const shown = (money) => {
  const places = decimalsOf(money.currency);
  const unit = 10 ** places;
  const whole = String(Math.floor(money.amount / unit)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return places === 0 ? `${whole} ${money.currency}` : `${whole}.${String(money.amount % unit).padStart(places, '0')} ${money.currency}`;
};

/** A few names in a sentence: "A" and "B", or "A", "B" and "C". */
const namesOf = (names) => {
  const quoted = names.map((n) => `"${n}"`);
  return quoted.length < 2 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
};

/**
 * The live rows typed in by hand that could be this transaction: the same account, amount and direction, a day near
 * the bank's, no Mercury transaction of their own yet, and not void.
 */
const twinsOf = (fields) => ({
  all: [
    { field: 'account', is: fields.account },
    { field: 'direction', is: fields.direction },
    { field: 'amount', is: fields.amount },
    { field: 'on', between: [dayFrom(fields.on, -NEAR), dayFrom(fields.on, NEAR)] },
    { field: 'mercury_id', empty: true },
    { field: 'state', in: ['pending', 'cleared'] },
  ],
});

/** What moves on a row that already stands for this transaction: the bank's facts where they differ, and nothing else. */
function patchOf(row, fields) {
  const patch = {};
  /* A HELD ROW THAT IS VOID STAYS VOID. Mercury never sends a transaction it cancelled or failed, so a void row
     Mercury calls `sent` was voided by a person, most often as the copy of one typed in by hand, and restating it
     counted the duplicate again every hour for thirty days (`mercury.test.ts`, "A TRANSACTION A PERSON VOIDED"). */
  if (row.fields.state !== fields.state && row.fields.state !== 'void') patch.state = fields.state;
  if (row.fields.on !== fields.on) patch.on = fields.on;
  if (row.fields.direction !== fields.direction) patch.direction = fields.direction;
  const was = row.fields.amount;
  if (was === null || typeof was !== 'object' || was.amount !== fields.amount.amount || was.currency !== fields.amount.currency) patch.amount = fields.amount;
  /* THE PAYEE ONLY WHERE THE ROW HAS NONE: a row from before 1.1.0, or one typed in by hand, gains it, and one a person
     corrected is left as they wrote it. */
  const payee = row.fields.counterparty_text;
  if (fields.counterparty_text !== undefined && (payee === undefined || payee === null || payee === '')) patch.counterparty_text = fields.counterparty_text;
  return patch;
}

/**
 * A Mercury transaction as the ledger's fields, in its account's currency, or `null` for a status this pack has not
 * heard of.
 */
export function ledgerOf(t, account, currency = 'USD') {
  const state = STATES[t.status];
  if (state === undefined) return null;
  const payee = typeof t.counterpartyName === 'string' ? t.counterpartyName.trim() : '';
  return {
    what: String(t.counterpartyName || t.counterpartyNickname || t.bankDescription || 'Mercury'),
    on: String(t.postedAt || t.createdAt).slice(0, 10),
    direction: t.amount < 0 ? 'out' : 'in',
    amount: { amount: minorOf(Math.abs(t.amount), currency), currency },
    account,
    state,
    ...(payee === '' ? {} : { counterparty_text: payee }),
    mercury_id: t.id,
  };
}

/**
 * The balances: each Mercury account kept on the row that holds its id, or met for the first time and adopted or
 * written. Answers the record's id of each account's row, by Mercury's id, for the rows that stood before this run, and
 * how many writes it queued. An account written this run has no id until the run ends, so it is not in the answer.
 */
async function keepAccounts(ctx, accounts, inBook, bookFor) {
  const today = ctx.now().slice(0, 10);
  const held = new Map();
  for (const chunk of chunks(accounts.map((a) => a.id)))
    for (const r of (await ctx.record.list('accounts', { field: 'mercury_account', in: chunk })).sort((x, y) => x.seq - y.seq)) {
      const id = String(r.fields.mercury_account);
      const first = held.get(id);
      if (first === undefined) held.set(id, r);
      else ctx.log(`"${r.fields.name}" is a second account for the same Mercury account as "${first.fields.name}", so it is left as it is: delete it if it is the same money.`);
    }

  /* THE BANK ACCOUNTS NO FEED KEEPS, read once and only when an account is met for the first time. A full answer may
     leave one out, which is said; a row written then does not count as cash, so it is never counted twice. */
  const met = accounts.filter((a) => held.has(a.id) || !shut(a));
  const loose = [];
  if (met.some((a) => !held.has(a.id))) {
    const rows = await ctx.record.list('accounts', { all: [{ field: 'kind', is: 'bank' }, { field: 'mercury_account', empty: true }] });
    if (rows.length >= PAGE) ctx.log(`The record holds ${PAGE} bank accounts or more, so a Mercury account may have been compared with only some of them.`);
    for (const r of rows.sort((x, y) => x.seq - y.seq)) if (unmarked(r)) loose.push(r);
  }

  /* A TYPED ACCOUNT TWO NEW MERCURY ACCOUNTS BOTH NAME COULD BE EITHER ONE'S MONEY, so neither takes it: taking it for
     the first one listed would be a guess at which, the pairing the scope warns joins the wrong two. */
  const namesFor = (a) => new Set([fold(a.name), fold(a.nickname)].filter((n) => n !== ''));
  const fresh = met.filter((a) => !held.has(a.id));
  const shared = new Set(
    loose.filter((r) => fresh.filter((a) => currencyOf(a) === r.fields.balance?.currency && namesFor(a).has(fold(r.fields.name))).length > 1).map((r) => r.id),
  );
  const said = new Set();

  const rowOf = new Map();
  const claimed = new Set();
  /* THE TAGGED ROWS ARE CLAIMED BEFORE ANY NAME IS COMPARED, so an account listed earlier cannot take one by its name. */
  const tagged = new Map();
  for (const a of fresh) {
    const row = loose.find((r) => !claimed.has(r.id) && r.fields.balance?.currency === currencyOf(a) && Array.isArray(r.fields.tags) && r.fields.tags.some((t) => typeof t === 'string' && t.includes(a.id)));
    if (row === undefined) continue;
    claimed.add(row.id);
    tagged.set(a.id, row);
  }
  let writes = 0;
  let unmatched = 0;
  for (const a of met) {
    const currency = currencyOf(a);
    const balance = { amount: minorOf(a.currentBalance, currency), currency };
    const row = held.get(a.id);
    if (row !== undefined) {
      rowOf.set(a.id, row.id);
      const was = row.fields.balance;
      const moved = was === null || typeof was !== 'object' || was.amount !== balance.amount || was.currency !== balance.currency || row.fields.as_of !== today;
      /* A PERSON WHO SETS IT TO COUNT AS CASH HAS SAID IT IS NEW, so the note that asked is taken off. */
      const answered = row.fields.mercury_note === NOT_MATCHED && row.fields.liquid === true;
      const patch = { ...(moved ? { balance, as_of: today } : {}), ...(answered ? { mercury_note: null } : {}), ...FED(row), ...bookFor(row) };
      if (Object.keys(patch).length === 0) continue;
      ctx.update(`accounts#${row.seq}`, patch, row.version);
      writes += 1;
      continue;
    }
    const byTag = tagged.get(a.id);
    if (byTag !== undefined) {
      rowOf.set(a.id, byTag.id);
      ctx.update(`accounts#${byTag.seq}`, { mercury_account: a.id, balance, as_of: today, no_feed: false, ...bookFor(byTag) }, byTag.version);
      writes += 1;
      ctx.log(`Took over "${byTag.fields.name}": its tag names "${a.name}" at Mercury, kept from Mercury every hour from now on, so the money counts once.`);
      continue;
    }
    const names = namesFor(a);
    const same = loose.filter((r) => !claimed.has(r.id) && r.fields.balance?.currency === currency);
    const named = same.filter((r) => names.has(fold(r.fields.name)));
    if (named.length === 1 && shared.has(named[0].id)) {
      if (!said.has(named[0].id)) ctx.log(`"${named[0].fields.name}" could be more than one Mercury account of that name, so none was taken.`);
      said.add(named[0].id);
    } else if (named.length === 1) {
      const typed = named[0];
      claimed.add(typed.id);
      rowOf.set(a.id, typed.id);
      ctx.update(`accounts#${typed.seq}`, { mercury_account: a.id, balance, as_of: today, no_feed: false, ...bookFor(typed) }, typed.version);
      writes += 1;
      ctx.log(`Took over "${typed.fields.name}": it is "${a.name}" at Mercury, kept from Mercury every hour from now on, so the money counts once.`);
      continue;
    }
    if (named.length > 1) ctx.log(`${namesOf(named.map((r) => String(r.fields.name)))} could each be "${a.name}" at Mercury, so none was taken.`);
    /* A BANK ACCOUNT NO FEED KEEPS, IN THIS CURRENCY, COULD BE THE SAME MONEY under a name of its own, so the row waits
       for a person to say which, and counts for nothing until they do. */
    const doubt = same.length > 0;
    if (doubt) unmatched += 1;
    ctx.write('accounts', {
      name: String(a.name),
      kind: 'bank',
      balance,
      as_of: today,
      liquid: !doubt,
      mercury_account: a.id,
      no_feed: false,
      ...(doubt ? { mercury_note: NOT_MATCHED } : {}),
      ...inBook,
    });
    writes += 1;
  }
  if (unmatched > 0)
    ctx.log(
      `${unmatched} Mercury ${unmatched === 1 ? 'account is' : 'accounts are'} not yet matched to an account you typed, so ${unmatched === 1 ? 'it does' : 'they do'} not count as cash until you say which ${unmatched === 1 ? 'one it is' : 'ones they are'}, or that ${unmatched === 1 ? 'it is' : 'they are'} new.`,
    );
  return { rowOf, writes };
}

export default async function run(ctx) {
  const inBook = bookOf(ctx.config);
  /** The book to add to a row the record already holds: the setting's, when the row is in no book yet, and else none. */
  const bookFor = (row) => (row.fields.book === undefined || row.fields.book === null ? inBook : {});
  const answered = await ask(ctx, '/api/v1/accounts');
  /* ONE ENTRY A MERCURY ID, its id a string, so a repeated account is one account and not two rows. */
  const accounts = [];
  const ids = new Set();
  for (const a of answered.accounts ?? []) {
    const id = String(a.id);
    if (ids.has(id)) continue;
    ids.add(id);
    accounts.push({ ...a, id });
  }
  const kept = await keepAccounts(ctx, accounts, inBook, bookFor);
  let writes = kept.writes;

  const start = new Date(Date.parse(ctx.now()) - DAYS * DAY_MS).toISOString().slice(0, 10);
  const seen = [];
  let fetched = 1;
  for (const a of accounts) {
    if (shut(a)) continue;
    const account = kept.rowOf.get(a.id);
    if (account === undefined) {
      ctx.log(`"${a.name}" is new to the record this hour, so its transactions arrive next hour, once its account is written.`);
      continue;
    }
    if (fetched >= FETCHES) {
      ctx.log(`${a.name} is past the ${FETCHES - 1} accounts one run reads, so its transactions are not read.`);
      continue;
    }
    fetched += 1;
    const page = await ask(ctx, `/api/v1/account/${encodeURIComponent(a.id)}/transactions?limit=500&start=${start}`);
    const listed = page.transactions ?? [];
    if (typeof page.total === 'number' && page.total > listed.length)
      ctx.log(`${a.name} has ${page.total} transactions since ${start}, and the first ${listed.length} were read.`);
    for (const t of listed) {
      const fields = ledgerOf(t, account, currencyOf(a));
      if (fields === null) ctx.log(`Mercury calls a transaction of ${String(t.postedAt || t.createdAt).slice(0, 10)} on "${a.name}" ${JSON.stringify(t.status)}, which this pack does not know, so it is left out.`);
      else seen.push({ fields, category: typeof t.mercuryCategory === 'string' ? t.mercuryCategory : null });
    }
  }

  const held = new Map();
  for (const chunk of chunks(seen.map((s) => s.fields.mercury_id)))
    for (const r of await ctx.record.list('transactions', { field: 'mercury_id', in: chunk })) held.set(String(r.fields.mercury_id), r);

  /* THE TRANSACTIONS HELD BY NO LIVE ROW, ASKED ABOUT AGAIN WITH THE DELETED ROWS, so one a person deleted is known. A
     full answer may have left a deleted row out, which is said, and that transaction is written again as it was
     before 1.2.0. A void one is not asked about, since it is not written either way. The reads are bounded as the
     held read above is, by what Mercury answered: 500 transactions an account at most, from the accounts `FETCHES`
     lets one run read. */
  const gone = new Set();
  const unheld = [...new Set(seen.filter((s) => !held.has(s.fields.mercury_id) && s.fields.state !== 'void').map((s) => s.fields.mercury_id))];
  for (const chunk of chunks(unheld, GONE)) {
    const rows = await ctx.record.list('transactions', { field: 'mercury_id', in: chunk }, { includeDeleted: true });
    if (rows.length >= PAGE) ctx.log(`The record answered ${rows.length} entries or more for ${chunk.length} Mercury transactions, so one a person deleted may be missed and written again.`);
    for (const r of rows) if (r.deleted_at !== null && r.deleted_at !== undefined) gone.add(String(r.fields.mercury_id));
  }

  const wanted = [...new Set(seen.filter((s) => !held.has(s.fields.mercury_id) && !gone.has(s.fields.mercury_id) && s.category !== null).map((s) => s.category))];
  const categories = new Map();
  for (const chunk of chunks(wanted))
    for (const c of await ctx.record.list('categories', { all: [{ field: 'name', in: chunk }, { field: 'state', is: 'live' }] })) categories.set(String(c.fields.name), c);

  let deleted = 0;
  let taken = 0;
  /* A ROW TAKEN THIS RUN IS NOT TAKEN AGAIN: the update is queued, so the ledger still answers it as a row with no
     Mercury transaction until the run ends. */
  const claimed = new Set();
  for (const { fields, category } of seen) {
    if (writes >= WRITES) {
      ctx.log(`${WRITES} writes queued, which is this script's limit, so the rest arrive next hour.`);
      break;
    }
    const row = held.get(fields.mercury_id);
    if (row === undefined) {
      if (gone.has(fields.mercury_id)) {
        deleted += 1;
        continue;
      }
      /* A TRANSACTION THAT NEVER WENT THROUGH AND WAS NEVER HELD IS NOT WORTH A ROW. */
      if (fields.state === 'void') continue;
      /* ONE READ A TRANSACTION HELD BY NO ROW, AND EACH ENDS IN ONE WRITE, a row taken or a row written, so `WRITES`
         bounds these reads as it bounds the writes. */
      const twins = (await ctx.record.list('transactions', twinsOf(fields))).filter((r) => !claimed.has(r.id));
      if (twins.length === 1) {
        const twin = twins[0];
        claimed.add(twin.id);
        ctx.update(`transactions#${twin.seq}`, { ...patchOf(twin, fields), mercury_id: fields.mercury_id, ...bookFor(twin) }, twin.version);
        writes += 1;
        taken += 1;
        continue;
      }
      if (twins.length > 1)
        ctx.log(
          `${twins.length} transactions typed in by hand could be Mercury's ${shown(fields.amount)} ${fields.direction === 'in' ? 'in' : 'out'} on ${fields.on}, so none was taken and Mercury's is written as well: void the one that is the same money.`,
        );
      const c = category === null ? undefined : categories.get(category);
      const fits = c !== undefined && (c.fields.direction === 'both' || c.fields.direction === fields.direction);
      ctx.write('transactions', { ...fields, ...(fits ? { category: c.id } : {}), ...inBook });
      writes += 1;
      continue;
    }
    const patch = { ...patchOf(row, fields), ...bookFor(row) };
    if (Object.keys(patch).length === 0) continue;
    ctx.update(`transactions#${row.seq}`, patch, row.version);
    writes += 1;
  }
  if (taken > 0)
    ctx.log(`${taken} ${taken === 1 ? 'transaction' : 'transactions'} typed in by hand ${taken === 1 ? 'was' : 'were'} the same money as a Mercury transaction, so ${taken === 1 ? 'it carries' : 'each carries'} it now and nothing was written twice.`);
  if (deleted > 0)
    ctx.log(`${deleted} Mercury ${deleted === 1 ? 'transaction' : 'transactions'} that a person deleted ${deleted === 1 ? 'was' : 'were'} left out, as deleted.`);
}
