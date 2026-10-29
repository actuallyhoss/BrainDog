/**
 * A budget's warnings: once a day, each category's spending since its period began against its most for that period. A
 * category past the share it warns at (`budget_alert`) is marked `near`, one past its most is marked `over`, each with
 * the period (`warned_month`) and the words it is told in (`warned_for`), and the two rules `budget-near` and
 * `budget-over` (`../rules.ts`) tell of each once a category a period, by that period (`once_per`).
 *
 * A PERIOD IS A MONTH, A WEEK OR A YEAR, SINCE money-core 3.31.0 (`budget_period`). Empty is a month, as every budget set
 * before then was. A week starts on Monday, as `bow` does everywhere else; a year on 1 January. The period key is
 * `2026-10` for a month, the Monday `2026-10-26` for a week, and `2026` for a year, so the three never collide.
 *
 * WHAT CARRIES OVER IS WHAT WAS LEFT OF THE PERIOD BEFORE, on a category that says it carries over (`rollover`): the
 * budget less what that period spent, and nothing when it went over, since nothing was left. It is written as `carried`
 * and this period's most is the budget and it. A category that stops carrying over has `carried` cleared.
 *
 * THE SCRIPT ONLY MARKS; THE RULES TELL. A rule's `when:` reads one row and a period's spending is a sum over many, so
 * the sum is worked out here and written onto the category, where a rule can read it and the record can keep it to
 * once. A mark already made this period is not made again, and `over` is never put back to `near`, so a budget raised
 * after it went over tells nothing more until the next period.
 *
 * NEAR NEEDS A SHARE TO WARN AT; OVER NEEDS ONLY A BUDGET. ONE CURRENCY A BUDGET: only money spent in the budget's own
 * currency counts against it, since two currencies are never added.
 *
 * NOTHING OUTSIDE `budgetWarnings` AND `run` IS READ BY IT: its source is the two (`BUDGET_WATCH_SCRIPT.source`).
 */

/**
 * The marks to make, as writes: `categories` are the live categories with a budget, `entries` the cleared money out
 * that is not a move between accounts since the earliest day any of them needs, and `today` the day (`2026-10-29`).
 */
export function budgetWarnings(categories, entries, today) {
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const at = (day) => Date.parse(`${day}T12:00:00Z`);
  /* THE PERIOD A DAY IS IN, as its first day, the first day after it, its key and the words a warning says it in. */
  const periodOf = (kind, day) => {
    const d = new Date(at(day));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (kind === 'week') {
      const from = iso(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7), 12));
      return { from, to: iso(at(from) + 7 * DAY), key: from, words: 'this week' };
    }
    if (kind === 'year') return { from: `${y}-01-01`, to: `${y + 1}-01-01`, key: String(y), words: 'this year' };
    return { from: iso(Date.UTC(y, m, 1, 12)), to: iso(Date.UTC(y, m + 1, 1, 12)), key: day.slice(0, 7), words: 'this month' };
  };
  const kindOf = (c) => (c.fields.budget_period === 'week' || c.fields.budget_period === 'year' ? c.fields.budget_period : 'month');
  const spentIn = (c, currency, from, to) => {
    let used = 0;
    for (const e of entries) {
      const amount = e.fields.amount;
      const on = e.fields.on;
      if (e.fields.category !== c.id || typeof on !== 'string' || on < from || on >= to) continue;
      if (!amount || typeof amount.amount !== 'number' || amount.currency !== currency) continue;
      used += amount.amount;
    }
    return used;
  };
  const same = (a, b) => (a === null || a === undefined ? b === null : b !== null && typeof a === 'object' && a.amount === b.amount && a.currency === b.currency);

  const writes = [];
  for (const c of categories) {
    const budget = c.fields.budget;
    if (!budget || typeof budget.amount !== 'number' || !(budget.amount > 0) || typeof budget.currency !== 'string') continue;
    const kind = kindOf(c);
    const now = periodOf(kind, today);
    const fields = {};

    let carried = null;
    if (c.fields.rollover === true) {
      const before = periodOf(kind, iso(at(now.from) - DAY));
      const left = budget.amount - spentIn(c, budget.currency, before.from, before.to);
      carried = { amount: Math.max(0, left), currency: budget.currency };
    }
    if (!same(c.fields.carried, carried)) fields.carried = carried;

    const most = budget.amount + (carried ? carried.amount : 0);
    const used = spentIn(c, budget.currency, now.from, now.to);
    const alert = typeof c.fields.budget_alert === 'number' && c.fields.budget_alert >= 1 && c.fields.budget_alert <= 100 ? c.fields.budget_alert : null;
    const level = used > most ? 'over' : alert !== null && used * 100 >= most * alert ? 'near' : null;
    const told = c.fields.warned_month === now.key ? c.fields.budget_warned : null;
    if (level !== null && told !== level && told !== 'over') {
      fields.budget_warned = level;
      fields.warned_month = now.key;
      fields.warned_for = now.words;
    }
    if (Object.keys(fields).length > 0) writes.push({ id: c.spoken, version: c.version, fields });
  }
  return writes;
}

/** The script. Run once a day; it reads the money out each budget's period needs and the categories with a budget. */
export default async function run(ctx) {
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);

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

  /* THE EARLIEST DAY ANY BUDGET NEEDS: the start of its period, or of the one before when it carries over. */
  const [y, m, d] = today.split('-').map(Number);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const monday = Date.UTC(y, m - 1, d - ((new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7), 12);
  const starts = categories.map((c) => {
    const back = c.fields.rollover === true ? 1 : 0;
    if (c.fields.budget_period === 'week') return day(monday - back * 7 * 86400000);
    if (c.fields.budget_period === 'year') return `${y - back}-01-01`;
    return day(Date.UTC(y, m - 1 - back, 1, 12));
  });
  const from = starts.sort()[0];

  const entries = await every('transactions', [
    { field: 'state', is: 'cleared' },
    { field: 'transfer', is: false },
    { field: 'direction', is: 'out' },
    { field: 'on', gte: from },
  ]);
  const writes = budgetWarnings(categories, entries, today);
  for (const w of writes) ctx.update(w.id, w.fields, w.version);
  const marked = writes.filter((w) => w.fields.budget_warned !== undefined).length;
  ctx.log(marked === 0 ? 'No budget passed its warning since the last run.' : `${marked} budget warning(s) marked.`);
  return { marked, written: writes.length };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, reading Categories and the Ledger and writing the
 * warning and what carried over onto Categories. Once a day and when a rule hands it a run.
 */
export const BUDGET_WATCH_SCRIPT = {
  script: 'budget_watch',
  title: 'Mark a budget near or over its most for its week, month or year',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['categories', 'transactions'],
  writes: ['categories'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `${budgetWarnings.toString()}\nexport default ${run.toString()}`,
};
