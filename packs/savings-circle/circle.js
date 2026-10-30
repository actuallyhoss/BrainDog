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
 *
 * A CIRCLE ALREADY UNDER WAY (2.0.0). A first month before today is a circle he joined before he wrote it down, so the
 * months already gone are written paid, and the payout too when his turn has been: written open, each one read as late
 * on Today and the Calendar the moment the circle was saved. The plan says so, so a month he did not pay is one he
 * changes on Instalments. And its days are said as a person says them, "1 Oct", never `2026-10-01`.
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day as a person says it: "1 Oct", with the year when it is not `year`'s. */
export function dayWords(day, year) {
  const said = Number(day.slice(8, 10)) + ' ' + MONTHS[Number(day.slice(5, 7)) - 1];
  return day.slice(0, 4) === year ? said : said + ' ' + day.slice(0, 4);
}

/** What the plan says once its months are made: how many, from when, the payout's day, and what was taken as paid. */
export function madeWords(n, first, payout, today, paid) {
  const year = today.slice(0, 4);
  const made = 'Made ' + n + ' months from ' + dayWords(first, year) + ', and your payout on ' + dayWords(payout, year) + '.';
  if (paid === 0) return made;
  return made + ' ' + (paid === 1 ? 'The month before today is' : 'The ' + paid + ' months before today are') + ' marked paid; change any you did not pay on Instalments.';
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
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);
  const gone = (day) => day < today;
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
      state: gone(p.due) ? 'paid' : 'open',
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
    state: gone(made.payout.due) ? 'paid' : 'open',
    ...account,
  });
  say(madeWords(n, f.circle_first, made.payout.due, today, made.parts.filter((p) => gone(p.due)).length), {
    circle_payout: { amount: made.payout.amount, currency: made.currency },
    circle_payout_on: made.payout.due,
  });
}
