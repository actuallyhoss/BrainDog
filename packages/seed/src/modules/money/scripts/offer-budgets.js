/**
 * Budgets offered from last month's pace: once a month, one question on Decide that offers a most a month for every
 * live category money goes out on that holds none, each last month's spending on it rounded up. "Use these" writes
 * them; "Not now" writes nothing and is not asked again that month.
 *
 * NEVER SET BY ITSELF. A budget is a person's own line, so the run writes nothing: the limits are the patches of the
 * answer, applied only when that answer is picked (`askOf` in `packages/kernel/src/script-run.ts`).
 *
 * ONE QUESTION A MONTH, EVER. Its cause is the month (`money.budgets.2026-10`), and the record holds one question a
 * cause, so a run the next morning joins the one waiting and a month already answered is not asked again, whichever
 * answer it was. A category given a budget by hand in the meantime is left out of the next run's offer.
 *
 * ONE CURRENCY A BUDGET. A most a month is kept in the record's home currency when one is set, else in the one currency
 * the category was spent in. A category spent in two currencies last month, or in one that is not the home one, is
 * offered nothing, and the question says how many were left out so a person can set those by hand: two currencies
 * are never added into one.
 *
 * ROUNDED UP TO A STEP A PERSON WOULD TYPE: a fifth, a half or a whole of the power of ten under the amount, so
 * EGP 1,330 is offered EGP 1,400, EGP 4,229 is EGP 4,500 and EGP 19,533 is EGP 20,000. Never below what was spent.
 */

/** Whole minor units to the next step a person would type, in a currency of `exp` decimal places. */
export function roundUp(minor, exp) {
  const unit = 10 ** exp;
  const major = minor / unit;
  if (!(major > 0)) return 0;
  const mag = 10 ** Math.floor(Math.log10(major));
  const lead = major / mag;
  const step = Math.max(1, lead <= 2 ? mag / 5 : lead <= 5 ? mag / 2 : mag);
  return Math.round(Math.ceil(major / step - 1e-9) * step * unit);
}

/** How a sum is written in the question: the currency and the whole amount, grouped by thousands. */
export function said(minor, currency, exp) {
  const major = Math.round(minor / 10 ** exp);
  return `${currency} ${String(major).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')}`;
}

/**
 * The question for one month, or `null` when there is nothing to offer: `categories` are the live categories money goes
 * out on that hold no budget, `entries` last month's cleared money out, `home` the record's home currency or `null`,
 * `month` the month the question is for (`2026-10`) and `last` the one the pace is read from.
 */
export function budgetOffer(categories, entries, home, month, last) {
  const EXP = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 0, KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3 };
  const exp = (c) => (Object.hasOwn(EXP, c) ? EXP[c] : 2);
  const spent = new Map();
  for (const e of entries) {
    const by = e.fields.category;
    const amount = e.fields.amount;
    if (typeof by !== 'string' || by === '' || !amount || typeof amount.amount !== 'number' || typeof amount.currency !== 'string') continue;
    const per = spent.get(by) ?? new Map();
    per.set(amount.currency, (per.get(amount.currency) ?? 0) + amount.amount);
    spent.set(by, per);
  }
  const offered = [];
  let apart = 0;
  for (const c of categories) {
    const per = spent.get(c.id);
    if (!per) continue;
    const currencies = [...per.keys()];
    const currency = currencies.length === 1 ? currencies[0] : null;
    if (currency === null || (home && currency !== home)) {
      apart += 1;
      continue;
    }
    const minor = per.get(currency);
    if (!(minor > 0)) continue;
    const limit = roundUp(minor, exp(currency));
    const name = typeof c.fields.name === 'string' && c.fields.name.trim() !== '' ? c.fields.name.trim() : 'A category';
    offered.push({ c, name, limit, currency, minor });
  }
  if (offered.length === 0) return null;
  offered.sort((a, b) => b.minor - a.minor || (a.name < b.name ? -1 : 1));
  const MOST = 20;
  const kept = offered.slice(0, MOST);
  const each = kept.map((o) => `${o.name} ${said(o.limit, o.currency, exp(o.currency))}`);
  const listed = each.length > 4 ? `${each.slice(0, 4).join(', ')} and ${each.length - 4} more` : each.length > 1 ? `${each.slice(0, -1).join(', ')} and ${each.at(-1)}` : each[0];
  const one = kept.length === 1;
  /* HOW MANY AND WHAT THEY COME TO, FIRST, SINCE money-core 3.34.0 (next-money, M21): Budgets drew the question cut short,
     "Use these monthly budgets? Supplies USD 3,500,…" and then "Read all", so the count and the total were never read. They
     lead now, and the list follows. Every offer is in one currency (a category spent in another is left out above). */
  const total = kept.reduce((n, o) => n + o.limit, 0);
  const all = said(total, kept[0].currency, exp(kept[0].currency));
  const left = apart === 0 ? '' : ` ${apart} spent in another currency ${apart === 1 ? 'is' : 'are'} left for you to set.`;
  return {
    cause: `money.budgets.${month}`,
    question: one ? `Give ${kept[0].name} a budget of ${each[0].slice(kept[0].name.length + 1)} a month?` : `Use ${kept.length} monthly budgets, ${all} a month in all? ${listed}.`,
    about: 'Budgets',
    options: [
      {
        id: 'use',
        label: 'Use these',
        because: `Each is what ${one ? 'it' : 'the category'} spent in ${last}, rounded up, and you can change any of them later.${left}`,
        patches: kept.map((o) => ({ id: o.c.spoken, version: o.c.version, fields: { budget: { amount: o.limit, currency: o.currency } } })),
      },
      { id: 'not-now', label: 'Not now', because: 'No budget is set, and this is not offered again this month.' },
    ],
  };
}

/**
 * The script. Run once a day; on any day it reads last calendar month's money out and the categories with no budget,
 * and ends by asking, or by saying why it did not. It writes nothing.
 */
export default async function run(ctx) {
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const [y, m] = today.split('-').map(Number);
  const first = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  const month = today.slice(0, 7);
  const lastY = m === 1 ? y - 1 : y;
  const lastM = m === 1 ? 12 : m - 1;
  const from = first(lastY, lastM);
  const to = first(y, m);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

  const categories = (await every('categories', [{ field: 'state', is: 'live' }, { field: 'direction', is: 'out' }])).filter(
    (c) => c.fields.budget === null || c.fields.budget === undefined || c.fields.budget === '',
  );
  if (categories.length === 0) {
    ctx.log('Every category money goes out on has a budget, so none was offered.');
    return null;
  }
  const entries = await every('transactions', [
    { field: 'state', is: 'cleared' },
    { field: 'transfer', is: false },
    { field: 'direction', is: 'out' },
    { field: 'on', gte: from },
    { field: 'on', lt: to },
  ]);
  const config = ctx.config && typeof ctx.config === 'object' ? ctx.config : {};
  const home = typeof config.home_currency === 'string' && /^[A-Z]{3}$/u.test(config.home_currency.trim()) ? config.home_currency.trim() : null;
  const ask = budgetOffer(categories, entries, home, month, MONTHS[lastM - 1]);
  if (ask === null) {
    ctx.log(`Nothing was spent in ${MONTHS[lastM - 1]} on a category with no budget, so none was offered.`);
    return null;
  }
  ctx.log(`${ask.options[0].patches.length} budget(s) offered from ${MONTHS[lastM - 1]}'s spending, waiting on your answer.`);
  return { offered: ask.options[0].patches.length, ask };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, reading Categories and the Ledger and writing
 * Categories, which only the answer's patches do. Once a day and when a rule hands it a run.
 */
export const OFFER_BUDGETS_SCRIPT = {
  script: 'offer_budgets',
  title: "Offer a budget for each category from last month's spending",
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['categories', 'transactions'],
  writes: ['categories'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `${roundUp.toString()}\n${said.toString()}\n${budgetOffer.toString()}\nexport default ${run.toString()}`,
};
