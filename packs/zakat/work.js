/**
 * Zakat, worked out step by step and written down as rows, so a page can show every step in plain words.
 *
 * THE FIGURES IT WRITES. One row in `zakat_basis` (made the first time this runs, and the oldest one is the one used)
 * holds the nisab, the day the year began and ends, the cash, the metals, the bills due, the total and what 2.5% of it
 * comes to. One row a cash account in `zakat_cash` holds the lowest that account stood at over the last 354 days.
 *
 * WHY A SCRIPT AND NOT A FIGURE. No figure over a list says "the lowest this account stood at over a span": a sum, a
 * count, a first or last day and a rolled balance on one day are what a figure can say. So this walks each cash account
 * back through the ledger itself and writes the answer as a row. A page then reads the rows with ordinary figures.
 *
 * THE NISAB is 85 g of 24k gold at the gold rate in use, or 595 g of silver at the silver price somebody typed when
 * they chose silver. Silver chosen with no price typed is worked out as gold, and the row says it was. A gold rate for
 * some other karat stands in for 24k by purity when there is no 24k rate.
 *
 * THE YEAR. Its first day is the day somebody typed, else the earliest day a gold holding was bought. It is complete
 * 354 days later (a lunar year). It does not stop the 2.5% being worked out: it says whether the year has run.
 *
 * CASH. Each account that counts as cash and is open, and is not a card, at the lowest its balance stood at the end of
 * any day in the last 354 days. A balance on any day is the newest statement on or before it (the balance the account
 * says, a balance check, or a payment that printed its balance after) plus every cleared payment since that statement;
 * a day before every statement is the oldest statement less the payments between. That is how Money's own cash figure
 * rolls a balance, so the two agree on today. A balance below nothing counts as nothing.
 *
 * METALS are the gold and metal holdings at what each is worth now, from Investments and gold.
 *
 * BILLS DUE are the bills that are open or part paid, due on or before today, less what is paid so far, and anything
 * typed as other debts. Money due to the person, typed as "cash due to you", is added.
 *
 * ONE CURRENCY. Everything is added in the gold rate's currency (else the first cash account's). An amount in another
 * currency is left out, and `left_out` counts them so the page can say so rather than add two currencies together.
 *
 * A SCRIPT READS ONE PAGE OF FIFTY OF A LIST, so the ledger is read in slices of days, a slice split in two whenever it
 * comes back full. Nothing is written to a row that already says what this would write.
 */

const YEAR = 354;
const PAGE = 50;
const RATE = 25; /* 2.5%, in thousandths */

const amount = (m) => m !== null && typeof m === 'object' && typeof m.amount === 'number' && typeof m.currency === 'string';
const same = (a, b) => (amount(a) && amount(b) ? a.amount === b.amount && a.currency === b.currency : !amount(a) && !amount(b));
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const num = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;
const day = (n) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const PURITY = { '24k': 24, '22k': 22, '21k': 21, '18k': 18 };

/** Every row of a list that matches `base` and has `field` between two days, a full page split in two until none is full. */
async function slice(ctx, register, base, field, lo, hi, out) {
  const rows = await ctx.record.list(register, { all: [...base, { field, gte: day(lo) }, { field, lte: day(hi) }] });
  if (rows.length < PAGE || lo >= hi) {
    out.rows.push(...rows);
    if (rows.length >= PAGE) out.whole = false;
    return;
  }
  const mid = Math.floor((lo + hi) / 2);
  await slice(ctx, register, base, field, lo, mid, out);
  await slice(ctx, register, base, field, mid + 1, hi, out);
}

async function between(ctx, register, base, field, lo, hi) {
  const out = { rows: [], whole: true };
  await slice(ctx, register, base, field, lo, hi, out);
  return out;
}

/** The lowest an account stood at, and the day, over the 354 days to `today`. */
async function lowest(ctx, account, today) {
  const f = account.fields;
  const end = num(today);
  const start = end - YEAR;
  const checks = [];
  if (amount(f.balance) && isDay(f.as_of)) checks.push({ on: num(f.as_of), balance: f.balance.amount });
  const kept = await between(ctx, 'balances', [{ field: 'account', is: account.id }], 'as_of', 0, end);
  for (const r of kept.rows) if (amount(r.fields.balance) && isDay(r.fields.as_of)) checks.push({ on: num(r.fields.as_of), balance: r.fields.balance.amount });
  /* A STATEMENT AS OLD AS ANY THAT IS NOT AFTER THE WINDOW'S START IS WHERE THE PAYMENTS MUST BE READ FROM. */
  const before = checks.filter((c) => c.on <= start).map((c) => c.on);
  const from = before.length > 0 ? Math.max(...before) : start;
  const read = await between(ctx, 'transactions', [{ field: 'account', is: account.id }, { field: 'state', is: 'cleared' }], 'on', from, end);
  const moves = new Map();
  let whole = kept.whole && read.whole;
  for (const r of read.rows) {
    const t = r.fields;
    if (!isDay(t.on) || !amount(t.amount)) continue;
    const d = num(t.on);
    moves.set(d, (moves.get(d) ?? 0) + (t.direction === 'out' ? -t.amount.amount : t.amount.amount));
    if (amount(t.balance_after)) checks.push({ on: d, balance: t.balance_after.amount });
  }
  if (checks.length === 0) return null;
  checks.sort((a, b) => a.on - b.on);
  const days = [...moves.keys()].sort((a, b) => a - b);
  /* THE RUNNING SUM OF PAYMENTS UP TO AND INCLUDING A DAY. */
  const upTo = (d) => days.reduce((s, x) => (x <= d ? s + moves.get(x) : s), 0);
  const at = (d) => {
    let s = null;
    for (const c of checks) if (c.on <= d) s = c;
    if (s === null) s = checks[0];
    return s.balance + upTo(d) - upTo(s.on);
  };
  const candidates = new Set([start, end]);
  for (const d of days) if (d > start && d <= end) candidates.add(d);
  for (const c of checks) if (c.on > start && c.on <= end) candidates.add(c.on);
  let low = null;
  for (const d of [...candidates].sort((a, b) => a - b)) {
    const b = at(d);
    if (low === null || b < low.balance) low = { balance: b, on: d };
  }
  return { balance: { amount: low.balance, currency: f.balance.currency }, on: day(low.on), from: day(start), moves: read.rows.length, whole };
}

/** The 24k rate in use, or another karat's carried to 24k by purity. */
function pureRate(rates) {
  const best = {};
  for (const r of rates) {
    const k = r.fields.karat;
    if (r.fields.live !== true || !amount(r.fields.per_gram) || PURITY[k] === undefined) continue;
    best[k] = r.fields.per_gram;
  }
  if (best['24k']) return best['24k'];
  for (const k of ['22k', '21k', '18k']) if (best[k]) return { amount: (best[k].amount * 24) / PURITY[k], currency: best[k].currency };
  return null;
}

export default async function run(ctx) {
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);
  const basisRows = await ctx.record.list('zakat_basis');
  const basis = basisRows.slice().sort((a, b) => a.seq - b.seq)[0] ?? null;
  const f = basis ? basis.fields : {};

  const rate = pureRate(await ctx.record.list('gold_rates'));
  const silver = amount(f.silver_rate) ? f.silver_rate : null;
  const useSilver = f.mode === 'silver' && silver !== null;
  const grams = useSilver ? 595 : 85;
  const per = useSilver ? silver : rate;
  const nisab = per ? { amount: Math.round(grams * per.amount), currency: per.currency } : null;

  const accounts = (await ctx.record.list('accounts', { field: 'liquid', is: true })).filter((a) => a.fields.state !== 'closed' && a.fields.kind !== 'card');
  const cur = per ? per.currency : accounts.length > 0 && amount(accounts[0].fields.balance) ? accounts[0].fields.balance.currency : null;
  let left = 0;

  /* CASH: one row an account, its lowest over the year, then the sum of what is not below nothing. */
  const kept = await ctx.record.list('zakat_cash');
  const rowOf = new Map(kept.map((r) => [r.fields.account, r]));
  let cash = 0;
  const live = new Set();
  for (const a of accounts) {
    const got = await lowest(ctx, a, today);
    if (got === null) continue;
    live.add(a.id);
    const next = { account: a.id, low: got.balance, lowest_on: got.on, since: got.from, moves: got.moves, whole: got.whole, taken: got.balance.currency === cur, worked_on: today };
    const row = rowOf.get(a.id);
    if (!row) ctx.write('zakat_cash', next);
    else {
      const patch = {};
      for (const k of Object.keys(next)) if (k === 'low' ? !same(row.fields.low, next.low) : row.fields[k] !== next[k]) patch[k] = next[k];
      if (Object.keys(patch).length > 0) ctx.update('zakat_cash#' + row.seq, patch, row.version);
    }
    if (got.balance.currency === cur) cash += Math.max(0, got.balance.amount);
    else left += 1;
  }
  for (const r of kept) if (!live.has(r.fields.account) && r.fields.taken !== false) ctx.update('zakat_cash#' + r.seq, { taken: false }, r.version);

  /* METALS, from Investments and gold: gold and metal holdings at what each is worth now. */
  let metals = 0;
  let held = 0;
  let first = null;
  const holdings = [...(await ctx.record.list('holdings', { field: 'kind', is: 'gold' })), ...(await ctx.record.list('holdings', { field: 'kind', is: 'commodity' }))];
  for (const h of holdings) {
    const g = h.fields;
    if (amount(g.value)) {
      if (g.value.currency === cur) metals += g.value.amount;
      else left += 1;
    }
    if (g.kind === 'gold') {
      if (typeof g.qty === 'number') held += g.qty;
      if (isDay(g.acquired_on) && (first === null || g.acquired_on < first)) first = g.acquired_on;
    }
  }

  /* THE YEAR: the day typed, else the first gold buy. */
  const hawlFrom = isDay(f.hawl_on) ? f.hawl_on : first;
  const hawlBy = isDay(f.hawl_on) ? 'typed' : first ? 'gold' : 'none';
  const hawlEnds = hawlFrom ? day(num(hawlFrom) + YEAR) : null;
  const hawlDone = hawlEnds !== null && hawlEnds <= today;

  /* BILLS DUE ON OR BEFORE TODAY, open or part paid, less what is paid so far. */
  let bills = 0;
  const due = await between(ctx, 'obligations', [{ field: 'direction', is: 'owed_by_me' }, { field: 'state', in: ['open', 'part'] }], 'due', 0, num(today));
  for (const o of due.rows) {
    const g = o.fields;
    if (!amount(g.amount)) continue;
    if (g.amount.currency !== cur) {
      left += 1;
      continue;
    }
    bills += Math.max(0, g.amount.amount - (amount(g.paid_so_far) && g.paid_so_far.currency === cur ? g.paid_so_far.amount : 0));
  }
  const otherDebts = amount(f.debts_other) && f.debts_other.currency === cur ? f.debts_other.amount : 0;
  if (amount(f.debts_other) && f.debts_other.currency !== cur) left += 1;
  const owedIn = amount(f.lent) && f.lent.currency === cur ? f.lent.amount : 0;
  if (amount(f.lent) && f.lent.currency !== cur) left += 1;

  const money = (n) => (cur === null ? null : { amount: n, currency: cur });
  const total = cash + metals + owedIn - bills - otherDebts;
  const zakatable = Math.max(0, total);
  const met = nisab !== null && cur !== null && zakatable >= nisab.amount && zakatable > 0;
  const out = {
    label: basis ? f.label : 'Zakat working',
    measure_used: useSilver ? 'silver' : 'gold',
    nisab_grams: grams,
    nisab,
    gold_grams: Math.round(held * 1e6) / 1e6,
    hawl_from: hawlFrom,
    hawl_by: hawlBy,
    hawl_ends: hawlEnds,
    hawl_done: hawlDone,
    cash: money(cash),
    metals: money(metals),
    bills_due: money(bills + otherDebts),
    owed_to_you_in: money(owedIn),
    total: money(zakatable),
    due: money(met ? Math.round((zakatable * RATE) / 1000) : 0),
    met,
    left: left,
    worked_on: today,
  };
  if (!basis) {
    ctx.write('zakat_basis', { ...out, mode: 'gold' });
    return;
  }
  const patch = {};
  for (const k of Object.keys(out)) {
    const was = f[k];
    const now = out[k];
    if (now !== null && typeof now === 'object' ? !same(was, now) : (was ?? null) !== now) patch[k] = now;
  }
  if (Object.keys(patch).length > 0) ctx.update('zakat_basis#' + basis.seq, patch, basis.version);
}
