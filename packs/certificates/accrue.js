/**
 * What each certificate has earned and when it pays: the interest so far written into `accrued`, the interest over the
 * whole term into `interest`, and whatever the row left empty and could be worked out from the rest.
 *
 * STARTED WITH A ROW'S ID when a certificate is added or its principal, rate, term, start, cadence or maturity changes;
 * started with no id, once a day, it brings every live certificate up to today. Interest is the rate a year on the
 * principal: simple unless the certificate compounds, when it is added to the principal every month. It is counted from
 * the start to today, and never past the day it matures.
 *
 * `at_maturity` is the value the certificate has on the day it matures: the principal, grown at its rate over the whole
 * term when it compounds. It is always written, because Cash ahead walks it as the money coming back.
 *
 * WHAT IS WORKED OUT ONLY WHEN IT IS EMPTY, so a person's own word always wins. `ends` is the start and the term in
 * months. `payout` is one cycle's interest on a certificate that pays it out (not one that compounds). `next_payout` is
 * one cycle after the start, and never after the day it matures. Each amount is in the principal's currency.
 */
const DAY = 86_400_000;

const dayOf = (text) => {
  const m = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const written = (ms) => new Date(ms).toISOString().slice(0, 10);

const monthsOn = (text, n) => {
  const at = dayOf(text);
  if (at === null) return null;
  const d = new Date(at);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0)).getUTCDate();
  return written(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(d.getUTCDate(), last)));
};

const CYCLE = { monthly: 1, quarterly: 3, yearly: 12 };

/** Interest on `principal` (minor units) over `days`, at `rate` percent a year; compounded monthly when asked. */
export function interestOver(principal, rate, days, compound) {
  if (!(days > 0) || !(rate > 0)) return 0;
  if (!compound) return Math.round((principal * rate * days) / 36_500);
  const months = days / 30.4375;
  return Math.round(principal * (Math.pow(1 + rate / 1200, months) - 1));
}

/** What to write onto one certificate to bring it level, as a patch; empty when it is level already. */
export function levelled(fields, today) {
  const money = (m) => m && typeof m.amount === 'number' && typeof m.currency === 'string';
  const same = (a, b) => money(a) && a.amount === b.amount && a.currency === b.currency;
  const out = {};
  const principal = fields.amount;
  if (!money(principal) || typeof fields.rate !== 'number') return out;
  const start = dayOf(fields.start);
  if (start === null) return out;
  let ends = fields.ends;
  if (!dayOf(ends) && typeof fields.term === 'number' && fields.term > 0) {
    ends = monthsOn(fields.start, Math.round(fields.term));
    out.ends = ends;
  }
  const compound = fields.roll === true;
  const step = CYCLE[fields.every];
  if (!money(fields.pays) && !compound && step) out.pays = { amount: interestOver(principal.amount, fields.rate, (step * 365) / 12, false), currency: principal.currency };
  if (!dayOf(fields.next_payout) && step) {
    const first = monthsOn(fields.start, step);
    out.next_payout = dayOf(ends) !== null && dayOf(first) > dayOf(ends) ? ends : first;
  }
  const stop = dayOf(ends);
  const until = Math.max(start, Math.min(dayOf(today), stop === null ? Infinity : stop));
  const accrued = { amount: interestOver(principal.amount, fields.rate, (until - start) / DAY, compound), currency: principal.currency };
  if (!same(fields.accrued, accrued)) out.accrued = accrued;
  if (stop !== null) {
    const whole = { amount: interestOver(principal.amount, fields.rate, (stop - start) / DAY, compound), currency: principal.currency };
    if (!same(fields.interest, whole)) out.interest = whole;
    /* WHAT COMES BACK ON THE DAY IT MATURES: the principal, and for one that compounds the interest grown into it. */
    const back = { amount: principal.amount + (compound ? whole.amount : 0), currency: principal.currency };
    if (!same(fields.at_maturity, back)) out.at_maturity = back;
  }
  return out;
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  const rows = id ? [await ctx.record.get(id)] : await ctx.record.list('certificates', { field: 'state', is: 'live' });
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);
  for (const row of rows) {
    if (!row) continue;
    const next = levelled(row.fields, today);
    if (Object.keys(next).length === 0) continue;
    ctx.update('certificates#' + row.seq, next, row.version);
  }
}
