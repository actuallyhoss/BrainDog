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
 * void. A row somebody DELETED is not found again and is written anew the next hour, because a script's list reads
 * live rows only; voiding is how a person takes a Mercury transaction out of the figures. On a new row the category is
 * Mercury's own when the record has a live category of exactly that name facing the same way, and otherwise it is
 * left for the record's own rules to file.
 *
 * A KEY MERCURY REFUSES STOPS THE RUN WITH A SENTENCE, and the record pauses a script after three refused runs.
 */

const API = "https://api.mercury.com";
const KEY = "Mercury (read only)";
const DAYS = 30;
const PAGE = 50;
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

const chunks = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += PAGE) out.push(list.slice(i, i + PAGE));
  return out;
};

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

  const start = new Date(Date.parse(ctx.now()) - DAYS * 86400000).toISOString().slice(0, 10);
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

  const wanted = [...new Set(seen.filter((s) => !held.has(s.fields.mercury_id) && s.category !== null).map((s) => s.category))];
  const categories = new Map();
  for (const chunk of chunks(wanted))
    for (const c of await ctx.record.list('categories', { all: [{ field: 'name', in: chunk }, { field: 'state', is: 'live' }] })) categories.set(String(c.fields.name), c);

  let writes = 0;
  for (const { fields, category } of seen) {
    if (writes >= WRITES) {
      ctx.log(`${WRITES} writes queued, which is this script's limit, so the rest arrive next hour.`);
      break;
    }
    const row = held.get(fields.mercury_id);
    if (row === undefined) {
      /* A TRANSACTION THAT NEVER WENT THROUGH AND WAS NEVER HELD IS NOT WORTH A ROW. */
      if (fields.state === 'void') continue;
      const c = category === null ? undefined : categories.get(category);
      const fits = c !== undefined && (c.fields.direction === 'both' || c.fields.direction === fields.direction);
      ctx.write('transactions', fits ? { ...fields, category: c.id } : fields);
      writes += 1;
      continue;
    }
    const patch = {};
    /* A HELD ROW THAT IS VOID STAYS VOID. Mercury never sends a transaction it cancelled or failed, so a void row
       Mercury calls `sent` was voided by a person, most often as the copy of one typed in by hand, and restating it
       counted the duplicate again every hour for thirty days (`mercury.test.ts`, "A TRANSACTION A PERSON VOIDED"). */
    if (row.fields.state !== fields.state && row.fields.state !== 'void') patch.state = fields.state;
    if (row.fields.on !== fields.on) patch.on = fields.on;
    if (row.fields.direction !== fields.direction) patch.direction = fields.direction;
    const was = row.fields.amount;
    if (was === null || typeof was !== 'object' || was.amount !== fields.amount.amount || was.currency !== fields.amount.currency) patch.amount = fields.amount;
    if (Object.keys(patch).length === 0) continue;
    ctx.update(`transactions#${row.seq}`, patch, row.version);
    writes += 1;
  }
}
