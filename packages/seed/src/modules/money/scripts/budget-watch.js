/**
 * A budget's warnings: once a day, each category's spending since the first of the month against its most a month. A
 * category past the share it warns at (`budget_alert`) is marked `near`, one past its most is marked `over`, each with
 * the month (`warned_month`), and the two rules `budget-near` and `budget-over` (`../rules.ts`) tell of each once a
 * category a month, by that month (`once_per`).
 *
 * THE SCRIPT ONLY MARKS; THE RULES TELL. A rule's `when:` reads one row and a month's spending is a sum over many, so
 * the sum is worked out here and written onto the category, where a rule can read it and the record can keep it to
 * once. A mark already made this month is not made again, and `over` is never put back to `near`, so a budget raised
 * after it went over tells nothing more until next month.
 *
 * NEAR NEEDS A SHARE TO WARN AT; OVER NEEDS ONLY A BUDGET. A category with a most a month and no "Warn at percent" is
 * told when it goes over and not before.
 *
 * ONE CURRENCY A BUDGET. Only money spent in the budget's own currency counts against it: two currencies are never added.
 *
 * NOTHING OUTSIDE `budgetWarnings` AND `run` IS READ BY IT: its source is the two (`BUDGET_WATCH_SCRIPT.source`).
 */

/**
 * The marks to make for one month, as writes: `categories` are the live categories with a budget, `entries` this
 * month's cleared money out that is not a move between accounts, and `month` the month (`2026-10`).
 */
export function budgetWarnings(categories, entries, month) {
  const spent = new Map();
  for (const e of entries) {
    const by = e.fields.category;
    const amount = e.fields.amount;
    if (typeof by !== 'string' || by === '' || !amount || typeof amount.amount !== 'number' || typeof amount.currency !== 'string') continue;
    const per = spent.get(by) ?? new Map();
    per.set(amount.currency, (per.get(amount.currency) ?? 0) + amount.amount);
    spent.set(by, per);
  }
  const writes = [];
  for (const c of categories) {
    const budget = c.fields.budget;
    if (!budget || typeof budget.amount !== 'number' || !(budget.amount > 0) || typeof budget.currency !== 'string') continue;
    const used = spent.get(c.id)?.get(budget.currency) ?? 0;
    const alert = typeof c.fields.budget_alert === 'number' && c.fields.budget_alert >= 1 && c.fields.budget_alert <= 100 ? c.fields.budget_alert : null;
    const level = used > budget.amount ? 'over' : alert !== null && used * 100 >= budget.amount * alert ? 'near' : null;
    if (level === null) continue;
    const told = c.fields.warned_month === month ? c.fields.budget_warned : null;
    if (told === level || told === 'over') continue;
    writes.push({ id: c.spoken, version: c.version, fields: { budget_warned: level, warned_month: month } });
  }
  return writes;
}

/** The script. Run once a day; it reads this month's money out and the categories with a budget, and marks what is due. */
export default async function run(ctx) {
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const [y, m] = today.split('-').map(Number);
  const month = today.slice(0, 7);
  const from = `${month}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const PAGE = 50;
  const every = async (list, tests) => {
    const rows = [];
    let below = null;
    for (;;) {
      const all = [...tests, ...(below === null ? [] : [{ field: 'seq', lt: below }])];
      const page = await ctx.record.list(list, { all });
      for (const r of page) rows.push({ id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
      if (page.length < PAGE) return rows;
      below = Math.min(...page.map((r) => r.seq));
    }
  };

  const categories = await every('categories', [
    { field: 'state', is: 'live' },
    { field: 'budget', present: true },
  ]);
  if (categories.length === 0) {
    ctx.log('No category has a budget, so there is nothing to warn about.');
    return null;
  }
  const entries = await every('transactions', [
    { field: 'state', is: 'cleared' },
    { field: 'transfer', is: false },
    { field: 'direction', is: 'out' },
    { field: 'on', gte: from },
    { field: 'on', lt: to },
  ]);
  const writes = budgetWarnings(categories, entries, month);
  for (const w of writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(writes.length === 0 ? 'No budget passed its warning this month since the last run.' : `${writes.length} budget warning(s) marked for ${month}.`);
  return { marked: writes.length };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, reading Categories and the Ledger and writing two
 * fields of Categories. Once a day and when a rule hands it a run.
 */
export const BUDGET_WATCH_SCRIPT = {
  script: 'budget_watch',
  title: 'Mark a budget near or over its most this month',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['categories', 'transactions'],
  writes: ['categories'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `${budgetWarnings.toString()}\nexport default ${run.toString()}`,
};
