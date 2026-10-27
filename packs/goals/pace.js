/**
 * How far each goal has come and what it takes each month: what is held toward it, the share of the target that is, the
 * amount to put by each month from now to its day, and whether that is on track.
 *
 * WHAT IS HELD. A goal kept in an account holds that account's balance. A goal kept in a currency holds the balances of
 * every open account that counts as cash and is in the currency of its target. A goal kept as a value holds what a
 * person last typed, and the script never writes over it. A goal with sub-goals holds what its sub-goals hold, added
 * up, since the parts are where the money is. Two currencies are never added or compared: an account in another
 * currency than the target is left out of a currency goal, and an account goal in another currency holds nothing.
 *
 * WHAT IT TAKES EACH MONTH. What is left to the target, over the months from today to the day, rounded up. A day that has
 * come with the target not met asks for all that is left. A goal with sub-goals asks nothing itself, so the same money
 * is not asked twice; its sub-goals ask it. A goal with no day, a paused goal and a goal that is met ask nothing.
 *
 * ON TRACK OR BEHIND. The first time a goal is seen, what it held and the day are kept (`from_amount`, `started_on`).
 * From there the goal is on track when it holds at least the share of the way a straight line from that start to the
 * target has reached today, and behind when it holds less. A goal met is reached, and its status says so.
 *
 * STARTED WITH NOTHING, once a day and whenever a goal, an account or a balance is written, it works every goal out. A
 * goal whose answer is already written is left alone, so the host coming round again writes nothing.
 */
const DAY = 86_400_000;
const MONTH = 30.4375;

const money = (m) => m && typeof m.amount === 'number' && typeof m.currency === 'string';
const same = (a, b) => (a === undefined || a === null ? b === undefined || b === null : money(a) ? money(b) && a.amount === b.amount && a.currency === b.currency : a === b);
const day = (s) => Math.round(Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`) / DAY);

export default async function run(ctx) {
  const goals = await ctx.record.list('money_goals');
  if (goals.length === 0) return null;
  const accounts = await ctx.record.list('accounts');
  const open = accounts.filter((a) => a.fields.state !== 'closed' && money(a.fields.balance));
  const today = ctx.today();
  const now = day(today);
  const key = (g) => `money_goals#${g.seq}`;
  const is = (ref, row, register) => ref === row.id || ref === `${register}#${row.seq}`;
  const childOf = (s, g) => typeof s.fields.parent === 'string' && s.fields.parent !== '' && is(s.fields.parent, g, 'money_goals');
  const held = new Map();

  const own = (g) => {
    const target = g.fields.target;
    if (!money(target)) return null;
    const kind = g.fields.kind;
    if (kind === 'account') {
      const a = accounts.find((x) => is(g.fields.account, x, 'accounts'));
      return a && money(a.fields.balance) && a.fields.balance.currency === target.currency ? a.fields.balance : null;
    }
    if (kind === 'currency') {
      const mine = open.filter((a) => a.fields.liquid !== false && a.fields.balance.currency === target.currency);
      return { amount: mine.reduce((sum, a) => sum + a.fields.balance.amount, 0), currency: target.currency };
    }
    return money(g.fields.have) && g.fields.have.currency === target.currency ? g.fields.have : null;
  };

  for (const g of goals) {
    const subs = goals.filter((s) => childOf(s, g));
    if (subs.length > 0) {
      const t = g.fields.target;
      const parts = subs.map(own).filter((m) => m && money(t) && m.currency === t.currency);
      held.set(key(g), money(t) ? { amount: parts.reduce((sum, m) => sum + m.amount, 0), currency: t.currency } : null);
    } else held.set(key(g), own(g));
  }

  for (const g of goals) {
    const f = g.fields;
    const target = f.target;
    const have = held.get(key(g));
    const subs = goals.some((s) => childOf(s, g));
    const next = {};
    if (have && f.kind !== 'value' && !same(f.have, have)) next.have = have;
    if (subs && have && !same(f.have, have)) next.have = have;
    if (!money(target) || !have) {
      for (const id of ['need', 'pace']) if (f[id] !== undefined && f[id] !== null) next[id] = null;
    } else {
      const startedOn = typeof f.started_on === 'string' ? f.started_on.slice(0, 10) : null;
      const from = money(f.from_amount) && f.from_amount.currency === target.currency ? f.from_amount : null;
      if (!startedOn || !from) {
        next.started_on = today;
        next.from_amount = have;
      }
      const start = startedOn && from ? { on: day(startedOn), amount: from.amount } : { on: now, amount: have.amount };
      const left = Math.max(0, target.amount - have.amount);
      let pace = null;
      let need = null;
      if (have.amount >= target.amount) pace = 'reached';
      else if (f.state === 'paused') pace = null;
      else if (typeof f.by === 'string' && f.by !== '') {
        const by = day(f.by);
        const months = (by - now) / MONTH;
        if (!subs) need = { amount: months <= 1 ? left : Math.ceil(left / months), currency: target.currency };
        const span = by - start.on;
        const expected = span <= 0 ? target.amount : start.amount + ((target.amount - start.amount) * Math.max(0, now - start.on)) / span;
        pace = by <= now ? 'behind' : have.amount >= Math.floor(expected) ? 'on_track' : 'behind';
      } else pace = 'no_day';
      if (!same(f.need, need)) next.need = need;
      if ((f.pace ?? null) !== pace) next.pace = pace;
      if (pace === 'reached' && f.state !== 'reached') next.state = 'reached';
    }
    if (Object.keys(next).length > 0) ctx.update(key(g), next, g.version);
  }
  return null;
}
