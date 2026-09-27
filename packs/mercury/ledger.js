/**
 * Mercury's transactions, every hour, into Money's ledger: one row a transaction, kept in step as it clears.
 *
 * WHY A SCRIPT AND NOT A SECOND PULL. Mercury says which way money moved by the sign of `amount` and nothing else, and
 * a pull's `map:` cannot read a sign (`mercury.test.ts`, "A TRANSACTIONS PULL WRITES NOTHING", measured). The
 * transactions also live under each account's own id, `/api/v1/account/<id>/transactions`, which a pull's fixed path
 * cannot follow. A script asks for the accounts, then for each one's transactions.
 *
 * WHICH ACCOUNT. The balances pull in this same pack writes one `accounts` row a Mercury account, named as Mercury
 * names it, and a transaction's `account` is that row. An account the record does not hold yet is said in the log and
 * skipped, and its transactions arrive the hour after the balances pull has written it.
 *
 * ONE ROW A TRANSACTION, FOUND AGAIN BY MERCURY'S OWN ID. The id goes in `mercury_id`, a field this pack lays on the
 * ledger, and every hour re-reads the last thirty days: a transaction already held is updated in place, never
 * written twice, and a pending one becomes cleared when Mercury says `sent`.
 *
 * ONLY THE BANK'S FACTS ARE UPDATED: the day, the direction, the amount and the state. What a person or a rule set on a
 * row, its category above all, and its description, project, person or note, is never in the patch. So a category
 * somebody pinned stays pinned however many times Mercury restates the transaction, and a row somebody voided stays
 * void. On a new row the category is Mercury's own when the record has a live category of exactly that name facing the
 * same way, and otherwise it is left for the record's own rules to file.
 *
 * A ROW SOMEBODY DELETED STAYS DELETED. The ledger is read with its deleted rows as well (`includeDeleted`, which a
 * script's list takes since `loop/finish/defects.md` DEF-4), for the transactions it holds no live row for, and one
 * whose row a person deleted is left out, where it used to be written anew the next hour because the list read live
 * rows only (M6). Voiding and deleting now both take a Mercury transaction out of the figures for good.
 *
 * A ROW TYPED IN BY HAND BEFORE THE PACK IS TAKEN, NOT COUNTED BESIDE IT. A record kept by hand holds the last month
 * already, and the first run wrote all thirty days again beside it, so every figure counted them twice (M3). So before
 * a transaction it holds no row for is written, the ledger is asked for a live row with no Mercury transaction that is
 * the same money: the same account, the same amount and direction, and a day on the bank's day or either side of it,
 * because a person types the day they paid and the bank posts the day it cleared. Exactly one is taken: it carries the
 * transaction from then on, its day and state move to the bank's, and its category, description, note, project and
 * person are kept. Two or more are not guessed between: the transaction is written as its own row and the log names its
 * day and amount, so a person can void the spare. The log says how many were taken. A void row is not the same money,
 * because voiding took it out of the figures, so it is never taken.
 *
 * A KEY MERCURY REFUSES STOPS THE RUN WITH A SENTENCE, and the record pauses a script after three refused runs.
 */

const API = "https://api.mercury.com";
const KEY = "Mercury (read only)";
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

async function ask(ctx, path) {
  const r = await ctx.fetch(API + path, { key: KEY });
  if (r.status === 401)
    throw new Error(`Mercury refused the key labelled "${KEY}" (401) at ${path}, so nothing was written. Put a working read-only token in the vault under that label.`);
  if (!r.ok) throw new Error(`Mercury answered ${r.status} at ${path}, so nothing was written this hour.`);
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
 * An amount as a person reads it in the log, grouped, with its currency after it. The ledger holds cents, the two
 * decimals `ledgerOf` multiplied Mercury's dollars by, so the same two are put back here.
 */
const shown = (money) => {
  const whole = String(Math.floor(money.amount / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${String(money.amount % 100).padStart(2, '0')} ${money.currency}`;
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
  return patch;
}

/** A Mercury transaction as the ledger's fields, or `null` for a status this pack has not heard of. */
export function ledgerOf(t, account) {
  const state = STATES[t.status];
  if (state === undefined) return null;
  return {
    what: String(t.counterpartyName || t.counterpartyNickname || t.bankDescription || 'Mercury'),
    on: String(t.postedAt || t.createdAt).slice(0, 10),
    direction: t.amount < 0 ? 'out' : 'in',
    amount: { amount: Math.round(Math.abs(t.amount) * 100), currency: 'USD' },
    account,
    state,
    mercury_id: t.id,
  };
}

export default async function run(ctx) {
  const { accounts = [] } = await ask(ctx, '/api/v1/accounts');
  const names = [...new Set(accounts.map((a) => String(a.name)))];
  const rows = new Map();
  for (const chunk of chunks(names))
    for (const r of await ctx.record.list('accounts', { field: 'name', in: chunk })) rows.set(String(r.fields.name), r.id);

  const start = new Date(Date.parse(ctx.now()) - DAYS * DAY_MS).toISOString().slice(0, 10);
  const seen = [];
  let fetched = 1;
  for (const a of accounts) {
    const account = rows.get(String(a.name));
    if (account === undefined) {
      ctx.log(`${a.name} is not in accounts yet, so its transactions wait until the balances pull has written it.`);
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
      const fields = ledgerOf(t, account);
      if (fields === null) ctx.log(`Mercury says ${t.id} is ${JSON.stringify(t.status)}, which this pack does not know, so it is left out.`);
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
    if (rows.length >= PAGE) ctx.log(`${chunk.length} Mercury transactions have ${rows.length} rows or more between them, so a deleted one may be missed and written again.`);
    for (const r of rows) if (r.deleted_at !== null && r.deleted_at !== undefined) gone.add(String(r.fields.mercury_id));
  }

  const wanted = [...new Set(seen.filter((s) => !held.has(s.fields.mercury_id) && !gone.has(s.fields.mercury_id) && s.category !== null).map((s) => s.category))];
  const categories = new Map();
  for (const chunk of chunks(wanted))
    for (const c of await ctx.record.list('categories', { all: [{ field: 'name', in: chunk }, { field: 'state', is: 'live' }] })) categories.set(String(c.fields.name), c);

  let writes = 0;
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
        ctx.update(`transactions#${twin.seq}`, { ...patchOf(twin, fields), mercury_id: fields.mercury_id }, twin.version);
        writes += 1;
        taken += 1;
        continue;
      }
      if (twins.length > 1)
        ctx.log(
          `${twins.length} rows typed in by hand could be Mercury's ${shown(fields.amount)} ${fields.direction === 'in' ? 'in' : 'out'} on ${fields.on}, so none was taken and it is written as its own row: void the one that is the same money.`,
        );
      const c = category === null ? undefined : categories.get(category);
      const fits = c !== undefined && (c.fields.direction === 'both' || c.fields.direction === fields.direction);
      ctx.write('transactions', fits ? { ...fields, category: c.id } : fields);
      writes += 1;
      continue;
    }
    const patch = patchOf(row, fields);
    if (Object.keys(patch).length === 0) continue;
    ctx.update(`transactions#${row.seq}`, patch, row.version);
    writes += 1;
  }
  if (taken > 0)
    ctx.log(`${taken} ${taken === 1 ? 'row' : 'rows'} typed in by hand ${taken === 1 ? 'was' : 'were'} the same money as a Mercury transaction, so ${taken === 1 ? 'it carries' : 'each carries'} it now and nothing was written twice.`);
  if (deleted > 0)
    ctx.log(`${deleted} Mercury ${deleted === 1 ? 'transaction' : 'transactions'} whose row a person deleted ${deleted === 1 ? 'was' : 'were'} left out, as deleted.`);
}
