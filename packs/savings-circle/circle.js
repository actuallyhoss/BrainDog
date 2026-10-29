/**
 * Savings circle: a group that each puts the same part in every month, and each month one of them takes the whole
 * pot, until everyone has had a turn (a gam'eya, a tontine, a ROSCA). This writes the circle's months on Instalments.
 *
 * WHAT A PERSON FILLS ON THE PLAN. "People in the circle", "Each month's part", "Your turn" (the month you take the
 * pot, counted from one) and "First month". Nothing is written until all four are there and the turn is one of the
 * months.
 *
 * WHAT IT WRITES. One part a month for as many months as there are people, money out, open, linked to this plan and
 * from its account when it has one; and on your month the payout, money in, the part times the people. So Cash ahead
 * walks the months out and the pot coming in, and Coming up says each one on its day. The plan then says what was made,
 * the payout and its day.
 *
 * IT NEVER ADDS TO A PLAN THAT HAS PARTS, so saving the plan twice does not make the circle twice. At most 60 months.
 */

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

/** The circle's months: `{ parts: [{ due, amount }], payout: { due, amount } }`, or `{ why }` when it cannot be made. */
export function monthsOf(f) {
  const n = f.circle_members;
  if (!Number.isInteger(n) || n < 2 || n > 60) return { why: 'Say how many people are in the circle, from 2 to 60.' };
  if (!money(f.circle_part)) return { why: "Say each month's part." };
  if (!Number.isInteger(f.circle_turn) || f.circle_turn < 1 || f.circle_turn > n) return { why: 'Your turn is a month from 1 to ' + n + '.' };
  if (!isDay(f.circle_first)) return { why: 'Say the first month.' };
  const parts = [];
  for (let k = 0; k < n; k++) parts.push({ due: addMonths(f.circle_first, k), amount: f.circle_part.amount });
  return { parts, payout: { due: addMonths(f.circle_first, f.circle_turn - 1), amount: f.circle_part.amount * n }, currency: f.circle_part.currency };
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (!id) return;
  const plan = await ctx.record.get(String(id));
  if (!plan || plan.register !== 'plans') return;
  const f = plan.fields;
  const made = monthsOf(f);
  const say = (said, more) => ctx.update('plans#' + plan.seq, { circle_said: said, ...(more || {}) }, plan.version);
  if (made.why) {
    if (f.circle_said !== made.why) say(made.why);
    return;
  }
  const named = await ctx.record.list('installments', { all: [{ field: 'plan', is: f.name }] });
  const linked = await ctx.record.list('installments', { all: [{ field: 'plan_row', is: plan.id }] });
  if (named.length + linked.length > 0) {
    const why = 'This circle already has its months, so none were made. Remove them on Instalments to make them again.';
    if (f.circle_said !== why) say(why);
    return;
  }
  const account = typeof f.account === 'string' && f.account !== '' ? { account: f.account } : {};
  const n = made.parts.length;
  made.parts.forEach((p, i) => {
    ctx.write('installments', {
      what: f.name + ', month ' + (i + 1) + ' of ' + n,
      plan: f.name,
      plan_row: plan.id,
      number: i + 1,
      parts: n,
      direction: 'out',
      amount: { amount: p.amount, currency: made.currency },
      due: p.due,
      state: 'open',
      ...account,
    });
  });
  ctx.write('installments', {
    what: f.name + ', your payout',
    plan: f.name,
    plan_row: plan.id,
    direction: 'in',
    amount: { amount: made.payout.amount, currency: made.currency },
    due: made.payout.due,
    state: 'open',
    ...account,
  });
  say('Made ' + n + ' months from ' + f.circle_first + ', and your payout on ' + made.payout.due + '.', {
    circle_payout: { amount: made.payout.amount, currency: made.currency },
    circle_payout_on: made.payout.due,
  });
}
