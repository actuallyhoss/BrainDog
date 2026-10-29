/**
 * Tax set aside: the part of each payment you will pay tax on, worked out on its Ledger line, and the tax you paid.
 *
 * A CATEGORY SAYS IT. "Tax to set aside, percent" on a category of money in (client work, freelance, rent you
 * collect) is the share of each payment in it to put aside; "Tax payments" on a category of money out marks what you
 * pay the tax office. Nothing else is read, so a salary taxed before it lands is simply never given a rate.
 *
 * STARTED BY A LEDGER LINE when it is written or its category, amount, way or status changes. A cleared payment in, not
 * a move between your own accounts, in a category with a rate, gets "Tax to set aside" (the amount times the rate,
 * rounded to the smallest unit) and "Set aside at" (the rate). A cleared payment out in a tax-payments category gets
 * "Tax paid", its amount. A line that no longer qualifies loses what it had.
 *
 * STARTED BY A CATEGORY when its rate or its tax-payments mark changes: this year's lines in it are worked out again,
 * fifty at a time and at most a thousand, so a rate you correct in March puts January right.
 *
 * IT WRITES ONLY ITS OWN THREE FIELDS ON THE LEDGER, which the automations do not watch, so it never starts itself again.
 */

const money = (m) => m && typeof m === 'object' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string';
const same = (a, b) => (money(a) && money(b) ? a.amount === b.amount && a.currency === b.currency : !money(a) && !money(b));

/** What a line should hold, given its category: `{ tax_part, tax_rate, tax_paid }`, each null when it holds none. */
export function taxOf(f, category) {
  const c = category ? category.fields : {};
  const moved = f.state === 'cleared' && f.transfer !== true && f.stays !== true && money(f.amount);
  const rate = typeof c.tax_rate === 'number' && c.tax_rate > 0 ? c.tax_rate : null;
  const earns = moved && f.direction === 'in' && rate !== null;
  const pays = moved && f.direction === 'out' && c.tax_paid === true;
  return {
    tax_part: earns ? { amount: Math.round((f.amount.amount * rate) / 100), currency: f.amount.currency } : null,
    tax_rate: earns ? rate : null,
    tax_paid: pays ? f.amount : null,
  };
}

function patchOf(f, want) {
  const patch = {};
  if (!same(f.tax_part, want.tax_part)) patch.tax_part = want.tax_part;
  if ((f.tax_rate ?? null) !== want.tax_rate) patch.tax_rate = want.tax_rate;
  if (!same(f.tax_paid, want.tax_paid)) patch.tax_paid = want.tax_paid;
  return patch;
}

async function line(ctx, row, category) {
  const want = taxOf(row.fields, category);
  const patch = patchOf(row.fields, want);
  if (Object.keys(patch).length === 0) return 0;
  ctx.update('transactions#' + row.seq, patch, row.version);
  return 1;
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (!id) return;
  const row = await ctx.record.get(String(id));
  if (!row) return;
  if (row.register === 'transactions') {
    const cat = typeof row.fields.category === 'string' && row.fields.category !== '' ? await ctx.record.get(row.fields.category) : null;
    await line(ctx, row, cat && cat.register === 'categories' ? cat : null);
    return;
  }
  if (row.register !== 'categories') return;
  const from = ctx.today().slice(0, 4) + '-01-01';
  let above = 0;
  let changed = 0;
  let read = 0;
  for (let i = 0; i < 20; i++) {
    const page = await ctx.record.list('transactions', { all: [{ field: 'category', is: row.id }, { field: 'on', gte: from }, { field: 'seq', gt: above }] }, { order: 'seq' });
    for (const r of page) changed += await line(ctx, r, row);
    read += page.length;
    if (page.length < 50) break;
    above = Math.max(...page.map((r) => r.seq));
  }
  ctx.log('Worked out ' + read + ' of this year\'s lines in ' + String(row.fields.name || 'the category') + ' again, and ' + changed + ' changed.');
}
