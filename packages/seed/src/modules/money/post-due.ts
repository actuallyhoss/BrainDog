/**
 * A repeating line that posts itself, since money-core 3.31.0 (money parity, "Left": recurring auto-post). Two scripts
 * and their two rules, out of `rules.ts` so that file stays under its size, as `settle-line.ts` is.
 *
 * "POST IT FOR ME" ON A REPEATING LINE (`post` on `recurring`) writes its Ledger line on the day it is due, and moves the
 * line on to its next day, as a payment that matched it would. ONLY ON AN ACCOUNT NO BANK FEEDS, so a bank never writes
 * the same charge a second time:
 *   - an account marked "No bank feed" (`no_feed` on `accounts`) is posted to;
 *   - an account marked as fed (`no_feed` false) never is;
 *   - an account that says neither is posted to only while nothing marks it as a feed's: no Mercury or Stripe account
 *     on it, and no digits a bank message names it by (`last4`, which card and bank texts are filed by).
 * An account a feed marks is never posted to even when it says "No bank feed", and the run says why.
 *
 * A REAL CHARGE THAT COMES LATER TAKES THE POSTED LINE'S PLACE, never stands beside it. A cleared line on the same
 * account, the same way, in the same currency, within ten days of a posted one and no more than 2% off its amount, is
 * the same money: the posted line is voided with a note that says so, and its category passes to the real one when that
 * has none. Two posted lines that could each be it are left as they are, and the run says so. This runs beside
 * `payment-matches` on the same write, and needs nothing of it: the line a posted entry paid has moved on already, so
 * `match_payment` finds nothing for the real charge to settle twice.
 *
 * WHAT IS POSTED SAYS SO (`posted_for` on `transactions`, the repeating line it was posted for), which is how the second
 * script knows a line the record wrote from one a person or a bank did.
 */

import { CASH_LEGS } from './legs.ts';
import { postable, postedTwin } from './scripts/post-due.js';

/** The walk's leg for a repeating line, as `settle-line.ts` hands it to `ctx.cycle`: the day Cash ahead walks next. */
const LINE_LEG = (({ on, every, ends, days, weekend }) => ({ on, every, ends, days, weekend }))(CASH_LEGS.find((l) => l.register === 'recurring')!);

/**
 * POSTS THE REPEATING LINES THAT ARE DUE, once a day. Each line marked "Post it for me", live, due today or before, is
 * written into the Ledger on its due day on its own account, and moved on: "Next" one cycle on by the host's
 * `ctx.cycle`, "Last paid" the day posted and "Last amount" the amount. A line already posted for that day is not posted
 * again. A line whose account a feed keeps, or whose amount is in another currency than its account, is passed over
 * and the run says which and why. A line more than one cycle behind is posted once a day, a cycle a day, so a line left
 * for months does not write a season of entries in one run.
 */
export const POST_DUE_SCRIPT = {
  script: 'post_due',
  title: 'Post the repeating lines you asked for on their day',
  pack: 'money-core',
  runs: { every: '1d' },
  egress: [],
  keys: [],
  reads: ['recurring', 'accounts', 'transactions'],
  writes: ['recurring', 'transactions'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `const postable = ${postable.toString()};
const LEG = ${JSON.stringify(LINE_LEG)};
export default async function run(ctx) {
  const today = typeof ctx.today === 'function' ? await ctx.today() : String(ctx.now()).slice(0, 10);
  const lines = await ctx.record.list('recurring', { all: [{ field: 'state', is: 'live' }, { field: 'post', is: true }, { field: 'next_due', lte: today }] });
  if (lines.length === 0) return (ctx.log('No repeating line marked to post is due.'), null);
  if (typeof ctx.cycle !== 'function') return (ctx.log('This BrainDog cannot step a repeating line on yet, so nothing was posted.'), null);
  const accounts = new Map();
  let posted = 0;
  for (const line of lines) {
    const f = line.fields;
    const name = String(f.what ?? '').trim() || 'A repeating line';
    const amount = f.amount && typeof f.amount === 'object' ? f.amount : null;
    if (!amount || typeof f.next_due !== 'string') continue;
    const accountId = typeof f.account === 'string' && f.account !== '' ? f.account : null;
    if (accountId !== null && !accounts.has(accountId)) accounts.set(accountId, await ctx.record.get(accountId));
    const account = accountId === null ? null : accounts.get(accountId);
    const may = postable(account);
    if (!may.ok) {
      ctx.log(name + ' was not posted: ' + may.why + '.');
      continue;
    }
    const held = account.fields.balance && typeof account.fields.balance === 'object' ? account.fields.balance.currency : null;
    if (held && held !== amount.currency) {
      ctx.log(name + ' was not posted: it is in ' + amount.currency + ' and its account is in ' + held + '.');
      continue;
    }
    const already = await ctx.record.list('transactions', { all: [{ field: 'posted_for', is: line.id }, { field: 'on', is: f.next_due }] });
    const next = await Promise.resolve()
      .then(() => ctx.cycle(f.next_due, { leg: LEG, fields: f }))
      .then((d) => (typeof d === 'string' && d > f.next_due ? d : null), () => null);
    if (already.length === 0) {
      ctx.write('transactions', {
        what: name,
        on: f.next_due,
        direction: f.direction === 'in' ? 'in' : 'out',
        amount,
        account: accountId,
        state: 'cleared',
        posted_for: line.id,
        ...(typeof f.category === 'string' && f.category !== '' ? { category: f.category } : {}),
        ...(typeof f.thing === 'string' && f.thing !== '' ? { thing: f.thing } : {}),
        ...(typeof f.book === 'string' && f.book !== '' ? { book: f.book } : {}),
      });
      posted += 1;
    }
    if (next === null) {
      ctx.log(name + ' was posted for ' + f.next_due + ' and could not be moved on to its next day.');
      continue;
    }
    ctx.update('recurring#' + line.seq, { next_due: next, last_paid: f.next_due, last_amount: amount }, line.version);
  }
  ctx.log(posted === 0 ? 'Nothing was posted.' : posted + ' repeating ' + (posted === 1 ? 'line was' : 'lines were') + ' posted for you.');
  return { posted };
}`,
};

/**
 * A REAL CHARGE TAKES THE PLACE OF THE LINE POSTED FOR IT. Handed a cleared Ledger line the record did not post, it
 * reads the cleared lines posted on the same account, the same way, within ten days of it, and when exactly one is the
 * same money voids that one, says so in its note, and passes its category to the charge when the charge has none.
 */
export const REPLACE_POSTED_SCRIPT = {
  script: 'replace_posted',
  title: 'Let a real charge take the place of the line posted for it',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['transactions'],
  writes: ['transactions'],
  source: `const postedTwin = ${postedTwin.toString()};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = (d) => (typeof d === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(d) ? Number(d.slice(8)) + ' ' + MONTHS[Number(d.slice(5, 7)) - 1] : String(d));
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const at = typeof input.charge === 'string' && input.charge !== '' ? input.charge : null;
  const row = at ? await ctx.record.get(at) : null;
  if (!row || row.register !== 'transactions') return (ctx.log('The run was handed no Ledger line.'), null);
  const f = row.fields;
  if (f.state !== 'cleared' || (typeof f.posted_for === 'string' && f.posted_for !== '')) return null;
  if (typeof f.account !== 'string' || typeof f.on !== 'string') return null;
  const from = (n) => new Date(Date.parse(f.on + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const posted = await ctx.record.list('transactions', {
    all: [
      { field: 'posted_for', present: true },
      { field: 'state', is: 'cleared' },
      { field: 'account', is: f.account },
      { field: 'direction', is: f.direction },
      { field: 'on', between: [from(-10), from(10)] },
    ],
  });
  const found = postedTwin(row, posted);
  if (!found.twin) return (found.quiet ? null : ctx.log(found.none), null);
  const twin = found.twin;
  const note = 'Replaced by the charge on ' + dayWords(f.on) + '.';
  ctx.update('transactions#' + twin.seq, { state: 'void', note }, twin.version);
  const category = twin.fields.category;
  if (typeof category === 'string' && category !== '' && (typeof f.category !== 'string' || f.category === '')) ctx.update('transactions#' + row.seq, { category }, row.version);
  ctx.log('The line posted for you on ' + dayWords(twin.fields.on) + ' is replaced by this charge, so it counts once.');
  return { replaced: 'transactions#' + twin.seq };
}`,
};

/** The two rules: nothing starts the daily post but the clock; a cleared line the record did not post starts the second. */
export const POST_DUE_RULES = [
  POST_DUE_SCRIPT,
  {
    rule: 'posted-replaced',
    name: 'Let a real charge take the place of the line posted for it',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['state', 'amount', 'on'] } },
    when: 'state is cleared, posted_for is empty',
    steps: [{ script: { id: REPLACE_POSTED_SCRIPT.script, as: 'replacing', input: { charge: '{{trigger.entry}}' } } }],
  },
  REPLACE_POSTED_SCRIPT,
] as const;
