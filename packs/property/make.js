/**
 * Generate a plan: a property plan says how it is paid, and this writes its parts on Instalments.
 *
 * WHAT A PERSON FILLS ON THE PLAN. "Make the parts" (equal parts, a down payment then equal parts, or a mortgage paid
 * monthly) and "First part on". For equal parts it also takes "Parts" and "How often"; with a down payment it takes
 * "Down payment" as well, and "Parts" then counts the parts after it. The price comes from the plan's Price, and a
 * mortgage from its Loan, Yearly rate and Years. Nothing is written until the way and the first day are both there.
 *
 * WHAT IT WRITES. One part for each date, on Instalments, linked to this plan, money out, open, from the plan's
 * account when it has one. Rounding goes to the last part, so the parts always add up to the price. A mortgage is
 * paid in equal monthly amounts, the last one taking what rounding left. The plan then loses the choices it was made
 * from, and says what happened in "What happened".
 *
 * IT NEVER ADDS TO A PLAN THAT HAS PARTS. Two runs would make the plan twice, so a plan with any part says so and is
 * left as it is. At most 120 parts.
 */
const every = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const money = (m) => m && typeof m === 'object' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string' && m.amount > 0;

function addMonths(day, k) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1;
  const d = Number(day.slice(8, 10));
  const at = m + k;
  const y2 = y + Math.floor(at / 12);
  const m2 = ((at % 12) + 12) % 12;
  const last = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
  return String(y2).padStart(4, '0') + '-' + String(m2 + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
}

/** What each of `n` equal monthly payments is, and what is paid in all, for a loan at a yearly rate in percent. */
function mortgage(principal, rate, n) {
  const r = rate / 100 / 12;
  const each = r === 0 ? Math.round(principal / n) : Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
  const parts = [];
  let left = principal;
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(left * r);
    const pay = i === n ? left + interest : each;
    parts.push(pay);
    left = left + interest - pay;
  }
  return parts;
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (!id) return;
  const plan = await ctx.record.get(id);
  if (!plan || plan.register !== 'plans') return;
  const f = plan.fields;
  const how = f.make_how;
  const first = f.make_first;
  if (!how || !isDay(first)) return;
  const say = (said) => ctx.update('plans#' + plan.seq, { make_how: null, make_first: null, make_parts: null, make_every: null, make_down: null, plan_said: said }, plan.version);

  const named = await ctx.record.list('installments', { all: [{ field: 'plan', is: f.name }] });
  const linked = await ctx.record.list('installments', { all: [{ field: 'plan_row', is: plan.id }] });
  if (named.length + linked.length > 0) return say('This plan already has parts, so none were made. Remove them first, or add the missing ones on Instalments.');

  let amounts = [];
  let currency = null;
  let step = every[f.make_every] || 1;
  const count = Number.isInteger(f.make_parts) ? f.make_parts : 0;
  let monthly = null;
  if (how === 'mortgage') {
    const loan = f.mortgage_principal;
    const years = f.mortgage_years;
    if (!money(loan) || !Number.isInteger(years) || years < 1 || typeof f.mortgage_rate !== 'number') return say('A mortgage needs the loan, the yearly rate and the years on the plan.');
    currency = loan.currency;
    step = 1;
    amounts = mortgage(loan.amount, f.mortgage_rate, years * 12);
    monthly = { amount: amounts[0], currency };
  } else {
    const price = f.price;
    if (!money(price)) return say('Say the price on the plan first.');
    currency = price.currency;
    const down = how === 'down_equal' ? f.make_down : null;
    if (how === 'down_equal' && (!money(down) || down.currency !== currency || down.amount >= price.amount)) return say('The down payment must be in the price currency and less than the price.');
    if (count < 1) return say('Say how many parts.');
    const rest = how === 'down_equal' ? price.amount - down.amount : price.amount;
    const base = Math.floor(rest / count);
    const equal = [];
    for (let i = 1; i <= count; i++) equal.push(i === count ? rest - base * (count - 1) : base);
    amounts = how === 'down_equal' ? [down.amount].concat(equal) : equal;
  }
  if (amounts.length > 120) return say('That is more than 120 parts. Make fewer, or paste the plan.');

  const account = typeof f.account === 'string' && f.account !== '' ? { account: f.account } : {};
  amounts.forEach((amount, i) => {
    /* A down payment falls on the first day and the equal parts follow it one step apart. */
    const k = how === 'down_equal' ? (i === 0 ? 0 : i * step) : i * step;
    ctx.write('installments', {
      what: f.name + ', part ' + (i + 1) + ' of ' + amounts.length,
      plan: f.name,
      plan_row: plan.id,
      number: i + 1,
      parts: amounts.length,
      direction: 'out',
      amount: { amount, currency },
      due: addMonths(first, k),
      state: 'open',
      ...account,
    });
  });
  const patch = { make_how: null, make_first: null, make_parts: null, make_every: null, make_down: null, plan_said: 'Made ' + amounts.length + ' parts from ' + first + '.' };
  if (monthly) {
    patch.mortgage_monthly = monthly;
    patch.mortgage_interest = { amount: amounts.reduce((a, b) => a + b, 0) - f.mortgage_principal.amount, currency };
  }
  ctx.update('plans#' + plan.seq, patch, plan.version);
}
