/**
 * Pay the debts off: how long it takes to be debt-free by the avalanche and by the snowball, with an extra amount a
 * month, and how much interest each saves against paying only the minimums.
 *
 * STARTED BY THE PACK'S AUTOMATION when a debt is written, or when the extra on a plan is changed. It reads every debt
 * that still has a balance and writes the answer on two plans, one for each way, creating them the first time.
 *
 * THE TWO WAYS. Both pay every minimum each month and put everything else on one debt: the extra, and the minimums of
 * the debts already paid off. The avalanche puts it on the debt with the highest yearly rate first, which costs the
 * least interest. The snowball puts it on the smallest balance first, which clears a debt soonest.
 *
 * THE BASELINE is paying the minimums and nothing more, each debt on its own, with nothing passed on when one is
 * paid. What a plan saves is the interest of that less the interest of the plan, and how many months sooner it ends.
 *
 * ONE EXTRA FOR BOTH. A person types the extra on either plan. The one that differs from what the plans were last
 * worked with is taken, the newest edit when both differ, and both plans are worked with it.
 *
 * ONE CURRENCY. Two currencies are never added, so the plan is worked in the currency of the extra when it is set, and
 * otherwise in the currency holding the most debts. A debt in another currency is left out and the plan says so.
 *
 * WHAT IT WILL NOT GUESS. Interest is a twelfth of the yearly rate on the balance each month, rounded to the smallest
 * unit. A debt whose minimum does not cover its interest never ends, and the plan says which one rather than showing
 * a date. A plan that runs past 100 years is called never.
 */

const PLANS = 'payoff_plans';
const DEBTS = 'debts';
const METHODS = ['avalanche', 'snowball'];
const LIMIT = 1200;

const isMoney = (m) => m !== null && typeof m === 'object' && typeof m.amount === 'number' && typeof m.currency === 'string';

/** The months as a sentence: 1 month, 8 months, 2 years 5 months. */
function span(months) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 0 ? '' : `${years} ${years === 1 ? 'year' : 'years'}`;
  const m = rest === 0 ? '' : `${rest} ${rest === 1 ? 'month' : 'months'}`;
  return [y, m].filter((s) => s !== '').join(' ');
}

/** The day `months` months on from `today`, keeping the day of the month or the last day of a shorter one. */
function after(today, months) {
  const [y, m, d] = today.split('-').map(Number);
  const first = Date.UTC(y, m - 1 + months, 1);
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(first + (Math.min(d, last) - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Month by month until nothing is left. `order` is the debts in the order the spare money goes to them, `pass` whether
 * a paid-off minimum is passed on. Returns the months it took (null when it never ends), the interest paid, and the
 * month each debt ended.
 */
function simulate(debts, extra, order, pass) {
  const left = new Map(debts.map((d) => [d.id, d.balance]));
  const ended = new Map();
  const budget = debts.reduce((sum, d) => sum + d.minimum, 0) + extra;
  let interest = 0;
  for (let month = 1; month <= LIMIT; month++) {
    for (const d of debts) {
      const owing = left.get(d.id);
      if (owing === 0) continue;
      const add = Math.round((owing * d.apr) / 1200);
      left.set(d.id, owing + add);
      interest += add;
    }
    let pool = pass ? budget : 0;
    for (const d of debts) {
      const owing = left.get(d.id);
      if (owing === 0) continue;
      const pay = Math.min(d.minimum, owing);
      left.set(d.id, owing - pay);
      pool -= pass ? pay : 0;
    }
    for (const d of order) {
      if (!pass) break;
      const owing = left.get(d.id);
      if (owing === 0 || pool <= 0) continue;
      const pay = Math.min(pool, owing);
      left.set(d.id, owing - pay);
      pool -= pay;
    }
    for (const d of debts) if (left.get(d.id) === 0 && !ended.has(d.id)) ended.set(d.id, month);
    if (debts.every((d) => left.get(d.id) === 0)) return { months: month, interest, ended };
  }
  return { months: null, interest, ended };
}

/** The debts in the order the spare money goes to them. */
const ordered = (debts, method) =>
  [...debts].sort((a, b) =>
    method === 'avalanche' ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance || b.apr - a.apr,
  );

const same = (a, b) => isMoney(a) && isMoney(b) && a.amount === b.amount && a.currency === b.currency;

export default async function run(ctx) {
  const rows = await ctx.record.list(DEBTS, { field: 'balance', present: true });
  const plans = await ctx.record.list(PLANS, { field: 'method', present: true });
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);

  /* THE EXTRA: the plan whose extra differs from what it was last worked with, the newest edit when both do. */
  const edited = plans
    .filter((p) => isMoney(p.fields.extra) && !same(p.fields.extra, p.fields.used))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  const known = plans.find((p) => isMoney(p.fields.extra));
  const set = edited ? edited.fields.extra : known ? known.fields.extra : null;

  const open = rows.filter((r) => isMoney(r.fields.balance) && r.fields.balance.amount > 0);
  if (open.length === 0 && plans.length === 0) {
    ctx.log('There are no debts with a balance, so no plan was made.');
    return;
  }

  /* THE CURRENCY: the extra's, or the one holding the most debts. */
  const counts = new Map();
  for (const r of open) counts.set(r.fields.balance.currency, (counts.get(r.fields.balance.currency) ?? 0) + 1);
  const currency = set ? set.currency : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const extra = set ? set.amount : 0;
  const worked = open.filter((r) => r.fields.balance.currency === currency);
  const left = open.length - worked.length;

  const debts = worked.map((r) => {
    const min = isMoney(r.fields.minimum) && r.fields.minimum.currency === currency ? r.fields.minimum.amount : 0;
    return {
      id: r.id,
      name: String(r.fields.name),
      balance: r.fields.balance.amount,
      minimum: Math.max(0, min),
      apr: Number(r.fields.apr ?? 0) || 0,
    };
  });

  const stuck = debts.filter((d) => d.minimum <= Math.round((d.balance * d.apr) / 1200) && d.minimum < d.balance);
  const base = debts.length === 0 ? null : simulate(debts, 0, debts, false);
  const none = debts.length > 0 && debts.every((d) => d.minimum === 0) && extra === 0;

  for (const method of METHODS) {
    const order = ordered(debts, method);
    const plan = debts.length === 0 ? null : simulate(debts, extra, order, true);
    const money = (n) => (currency === null || n === null ? null : { amount: n, currency });
    const ok = plan !== null && plan.months !== null;
    const said = [];
    if (debts.length === 0) said.push('There are no debts with a balance to pay off.');
    if (none) said.push('No debt has a minimum and there is no extra, so nothing is paid.');
    if (!ok && debts.length > 0 && !none) {
      const names = stuck.map((d) => d.name);
      said.push(names.length > 0 ? `The minimum on ${names.join(', ')} does not cover its interest, so it does not end. Add an extra or raise the minimum.` : 'This does not end within 100 years.');
    }
    if (ok && (base === null || base.months === null)) said.push('Paying only the minimums never ends, so there is nothing to compare with.');
    if (left > 0) said.push(`${left} ${left === 1 ? 'debt' : 'debts'} in another currency than ${currency} ${left === 1 ? 'was' : 'were'} left out.`);

    const comparable = ok && base !== null && base.months !== null;
    const patch = {
      method,
      used: currency === null ? null : { amount: extra, currency },
      months: ok ? plan.months : null,
      takes: ok ? span(plan.months) : null,
      debt_free: ok ? after(today, plan.months) : null,
      interest: ok ? money(plan.interest) : null,
      minimum_interest: comparable ? money(base.interest) : null,
      saved: comparable ? money(base.interest - plan.interest) : null,
      sooner: comparable ? base.months - plan.months : null,
      order: ok ? order.map((d) => `${d.name} (${span(plan.ended.get(d.id))})`).join(', then ') : null,
      said: said.join(' '),
      worked_at: ctx.now(),
    };

    const mine = plans.find((p) => p.fields.method === method);
    if (currency !== null && !(mine && same(mine.fields.extra, patch.used))) patch.extra = patch.used;
    if (mine) ctx.update(`${PLANS}#${mine.seq}`, patch, mine.version);
    else ctx.write(PLANS, patch);
  }
}
