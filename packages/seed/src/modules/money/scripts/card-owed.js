/**
 * WHAT A CARD OWES, FROM THE BANK'S OWN TEXT (B8 of the 24 October scope). A card text says what is left of the limit
 * ("your available limit is EGP 24,670.91"), and Money kept it on the Ledger row and read it nowhere, so the card was on
 * no tile and its typed balance stood at 28 September.
 *
 * OWED IS THE LIMIT LESS THE NEWEST AVAILABLE, in one currency and never across two. `cardOwed` is handed the card
 * account and the newest Ledger row on it that says what is available, and answers the one write: "Card owes" and the
 * day it was true. Nothing is written for an account that is not a card, has no limit, or has a newer day already.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `cardOwed`, AND NOTHING BUT IT BY `run`: the two texts are the script.
 */

export function cardOwed(account, entry) {
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const a = account.fields;
  const name = String(a.name ?? '').trim() || 'The card';
  if (a.kind !== 'card') return { nothing: `${name} is not a card, so nothing was worked out.` };
  const limit = moneyOf(a.limit);
  if (!limit) return { nothing: `${name} has no credit limit, so what it owes was not worked out.` };
  const left = entry ? moneyOf(entry.fields.available) : null;
  const on = entry && typeof entry.fields.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.fields.on) ? entry.fields.on : null;
  if (!left || !on) return { nothing: `No text on ${name} says what is available, so what it owes was not worked out.` };
  if (left.currency !== limit.currency) return { nothing: `${name}'s limit is in ${limit.currency} and the text says ${left.currency}, so nothing was worked out.` };
  if (typeof a.to_pay_on === 'string' && a.to_pay_on > on) return { nothing: `${name} already says what it owed on a later day, so nothing changed.` };
  const owed = { amount: Math.max(0, limit.amount - left.amount), currency: limit.currency };
  const held = moneyOf(a.to_pay);
  if (held && held.amount === owed.amount && held.currency === owed.currency && a.to_pay_on === on) return { nothing: `${name} already says this, so nothing changed.` };
  return { writes: [{ id: account.spoken, version: account.version, fields: { to_pay: owed, to_pay_on: on } }], said: `What ${name} owes is worked out from its text of ${on}.` };
}

/**
 * The script: `input.entry` is a Ledger row that says what is available, or `input.account` a card whose limit was
 * typed. It reads the card and its newest such row, and writes what `cardOwed` answers.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const ok = (said) => typeof said === 'string' && (/^[a-z_]+#\d+$/.test(said) || /^[0-9A-Za-z_-]+$/.test(said));
  const shaped = (list, r) => ({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
  let entry = null;
  let accountId = ok(input.account) ? input.account : null;
  if (ok(input.entry)) {
    const row = await ctx.record.get(input.entry);
    if (!row || row.register !== 'transactions') return null;
    entry = shaped('transactions', row);
    accountId = typeof row.fields.account === 'string' ? row.fields.account : null;
  }
  if (!accountId) {
    ctx.log('The script was handed no card, so nothing was worked out.');
    return null;
  }
  const accountRow = await ctx.record.get(accountId);
  if (!accountRow || accountRow.register !== 'accounts' || !Number.isSafeInteger(accountRow.seq)) return null;
  const account = shaped('accounts', accountRow);
  if (account.fields.kind !== 'card') return null;
  /* THE NEWEST TEXT ON THE CARD, from the day it last said what it owed: a row older than that has nothing to add. */
  const since = typeof account.fields.to_pay_on === 'string' ? [{ field: 'on', gte: account.fields.to_pay_on }] : [];
  const rows = await ctx.record.list('transactions', { all: [{ field: 'account', is: account.id }, { field: 'available', present: true }, ...since] });
  for (const r of rows) {
    const day = r.fields.on;
    if (typeof day === 'string' && (!entry || day > entry.fields.on)) entry = shaped('transactions', r);
  }
  const out = cardOwed(account, entry);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(out.said);
  return { owed: account.spoken };
}

/** The script as Money's pack document writes it: no egress, no keys, started by the two rules below. */
export const CARD_OWED_SCRIPT = {
  script: 'card_owed',
  title: 'Work out what a card owes from its texts',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['accounts', 'transactions'],
  writes: ['accounts'],
  source: `${cardOwed.toString()}\nexport default ${run.toString()}`,
};

/** A LEDGER ROW THAT SAYS WHAT IS AVAILABLE, AND A CARD WHOSE LIMIT IS TYPED, each start `script.card_owed`. */
export const CARD_OWED_RULES = [
  {
    rule: 'card-text-owes',
    name: 'Work out what a card owes from its text',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['available'] } },
    steps: [{ script: { id: 'card_owed', as: 'owing', input: { entry: '{{trigger.entry}}' } } }],
  },
  {
    rule: 'card-limit-owes',
    name: 'Work out what a card owes once its limit is typed',
    pack: 'money-core',
    on: { written: { register: 'accounts', op: ['create', 'update'], fields: ['limit'] } },
    when: 'limit is set, kind is card',
    steps: [{ script: { id: 'card_owed', as: 'owing', input: { account: '{{trigger.entry}}' } } }],
  },
];

/** Both rules and the script, as Money's automations spread them. */
export const CARD_OWED = [...CARD_OWED_RULES, CARD_OWED_SCRIPT];
