/**
 * What a property plan comes to: what is paid, what is left, what the property is worth beyond that, and the total
 * of its parts paid so far at each paid part, which the page draws as a line.
 *
 * STARTED WITH A PART OR A PLAN when one is written, and once a day for every plan. For each plan that has a price or
 * a value it works through the parts that are not cancelled, earliest first, in the currency of the plan's value
 * (else its price, else its loan): the paid parts add up to "Paid" and, running, to "Paid in all" on each paid part;
 * the open parts add up to "Left to pay"; and the value less what is left is the "Equity". A part in another
 * currency is left out, since two currencies are never added. A mortgage's monthly amount and the interest over its
 * years are worked out the same way Generate a plan works them.
 *
 * It writes a field only where it would change, so it starts nothing again. Plans and parts are read a page at a time, past fifty.
 */
function mortgage(principal, rate, n) {
  const r = rate / 100 / 12;
  const each = r === 0 ? Math.round(principal / n) : Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
  let left = principal;
  let total = 0;
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(left * r);
    const pay = i === n ? left + interest : each;
    total += pay;
    left = left + interest - pay;
  }
  return { each, total };
}

const money = (m) => m && typeof m === 'object' && typeof m.amount === 'number' && typeof m.currency === 'string';
const same = (a, b) => (a === undefined || a === null ? b === null : money(a) && b !== null && a.amount === b.amount && a.currency === b.currency);

/* A script's list is one page of fifty with no cursor, so each is read a page at a time, each next page asking for numbers below the lowest one read. */
async function every(ctx, register, where) {
  const rows = [];
  let below = null;
  for (let reads = 0; reads < 40; reads++) {
    const asked = below === null ? where : where ? { all: [where, { field: 'seq', lt: below }] } : { field: 'seq', lt: below };
    const page = await ctx.record.list(register, asked);
    rows.push(...page);
    if (page.length < 50) break;
    below = Math.min(...page.map((r) => r.seq));
  }
  return rows;
}

async function work(ctx, plan) {
  const f = plan.fields;
  const mine = new Map();
  for (const p of await every(ctx, 'installments', { all: [{ field: 'plan_row', is: plan.id }] })) mine.set(p.id, p);
  for (const p of await every(ctx, 'installments', { all: [{ field: 'plan', is: f.name }] })) mine.set(p.id, p);
  const parts = [...mine.values()].filter((p) => p.fields.state !== 'cancelled' && money(p.fields.amount));
  const base = [f.value, f.price, f.mortgage_principal].find(money) || (parts[0] && parts[0].fields.amount);
  if (!base) return;
  const currency = base.currency;
  parts.sort((a, b) => (a.fields.due < b.fields.due ? -1 : a.fields.due > b.fields.due ? 1 : (a.fields.number || 0) - (b.fields.number || 0)));
  let paid = 0;
  let left = 0;
  for (const p of parts) {
    if (p.fields.amount.currency !== currency) continue;
    let next = null;
    if (p.fields.state === 'paid') {
      paid += p.fields.amount.amount;
      next = { amount: paid, currency };
    } else left += p.fields.amount.amount;
    if (!same(p.fields.paid_to_date, next)) ctx.update('installments#' + p.seq, { paid_to_date: next }, p.version);
  }
  const patch = {};
  const set = (key, value) => {
    if (!same(f[key], value)) patch[key] = value;
  };
  const any = parts.some((p) => p.fields.amount.currency === currency);
  set('paid', any ? { amount: paid, currency } : null);
  set('left', any ? { amount: left, currency } : null);
  set('equity', money(f.value) && f.value.currency === currency && any ? { amount: f.value.amount - left, currency } : null);
  const loan = f.mortgage_principal;
  if (money(loan) && typeof f.mortgage_rate === 'number' && Number.isInteger(f.mortgage_years) && f.mortgage_years > 0) {
    const m = mortgage(loan.amount, f.mortgage_rate, f.mortgage_years * 12);
    set('mortgage_monthly', { amount: m.each, currency: loan.currency });
    set('mortgage_interest', { amount: m.total - loan.amount, currency: loan.currency });
  } else {
    set('mortgage_monthly', null);
    set('mortgage_interest', null);
  }
  if (Object.keys(patch).length > 0) ctx.update('plans#' + plan.seq, patch, plan.version);
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  let plans;
  if (id) {
    const row = await ctx.record.get(id);
    if (!row) return;
    if (row.register === 'plans') plans = [row];
    else if (row.register === 'installments') {
      const link = row.fields.plan_row;
      const text = row.fields.plan;
      const found = typeof link === 'string' && link !== '' ? [await ctx.record.get(link)] : typeof text === 'string' ? await ctx.record.list('plans', { all: [{ field: 'name', is: text }] }) : [];
      plans = found.filter((p) => p && p.register === 'plans');
    } else return;
  } else plans = await every(ctx, 'plans', null);
  for (const plan of plans) {
    const f = plan.fields;
    if (money(f.value) || money(f.price) || money(f.mortgage_principal)) await work(ctx, plan);
  }
}
