/**
 * A paid bill is spending: a payment linked to the bill it paid is filed under that bill's category, as the decision,
 * the script a host runs round it, the rule that starts it and the declaration a pack document carries (file-paid, his
 * word of 30 October, "File paid bills as spending").
 *
 * WHY. A bank writes a premium paid by transfer as "Internet Banking Transfer", a filing rule files every such line under
 * Transfers, and Transfers says "Money stays yours", so the Northwind premium was linked to its bill and counted in no
 * spending at all. Once a line pays a bill, it is what the bill is for.
 *
 * WHAT `fileUnder` DOES. Handed a Ledger entry, the bill or repeating line it pays, and the categories, it answers the
 * one change to the entry: the bill's category in "Category", and "Filed by" emptied, since the rule that filed it there
 * no longer did. A repeating line names its category; a bill holds a kind ("Insurance"), so the category is the live one
 * of that name. NOTHING CHANGES:
 *   - on an entry filed under a category that counts as spending, by a person or a rule: that was somebody's word;
 *   - on a move the record paired between two of his own accounts (`transfer`): a card bill paid from the bank is one,
 *     and the card's own purchases are already the spending;
 *   - on an entry split into parts, or whose bill names no category that is live, goes its way and counts as spending.
 * AN ENTRY WITH NO CATEGORY IS FILED TOO where the decision is asked (a repeating line's payment, in the line's own write),
 * so a filing rule that would have filed it under Transfers finds it filed. The rule below starts only on one filed.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `fileUnder` OR `categoriesFor`, AND NOTHING BUT THEM BY `run`: the texts together
 * are the script, and `settle_matched_line` carries the same two (`../settle-line.ts`).
 */

import { OBLIGATIONS_REGISTER } from '../lists/obligations.ts';

/** A BILL'S KINDS IN WORDS, as Bills and invoices says them ("professional" is "Professional fees"), written into the
 * scripts as data since a sandbox imports nothing. */
const KINDS = OBLIGATIONS_REGISTER.fields.find((f) => f.id === 'category')?.labels ?? {};
export const BILL_KINDS = KINDS;

export function fileUnder(payment, item, categories, kinds) {
  const plain = (t) => (typeof t === 'string' ? t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '');
  const p = payment.fields;
  const f = item.fields;
  if (item.list !== 'obligations' && item.list !== 'recurring') return { nothing: 'Only a bill or a repeating line files the payment that pays it.' };
  if (p.state !== 'cleared') return { nothing: 'The payment has not cleared, so it was left where it is filed.' };
  if (p.transfer === true) return { nothing: 'The payment is a move between your own accounts, so it was left where it is filed.' };
  if (Array.isArray(p.parts) && p.parts.length > 0) return { nothing: 'The payment is split into parts, so it was left as it is.' };
  const byId = (id) => (typeof id === 'string' && id !== '' ? categories.find((c) => c.id === id) ?? null : null);
  const now = byId(p.category);
  if (typeof p.category === 'string' && p.category !== '' && !(now && now.fields.transfer === true))
    return { nothing: 'The payment is filed under a category that counts as spending, so it was left there.' };
  /* THE BILL'S CATEGORY: a repeating line's own, or for a bill the live category named as its kind is. */
  const names = item.list === 'obligations' && typeof f.category === 'string' && f.category !== '' ? [plain(f.category), plain(kinds && kinds[f.category])].filter((n) => n !== '') : [];
  const to = item.list === 'recurring' ? byId(f.category) : categories.find((c) => names.includes(plain(c.fields.name))) ?? null;
  const bill = String(f.what ?? '').trim() || 'The bill';
  if (!to) return { nothing: `${bill} names no category of yours, so its payment was left where it is filed.` };
  if (to.fields.state !== 'live' || to.fields.transfer === true || (to.fields.direction !== p.direction && to.fields.direction !== 'both'))
    return { nothing: `${bill}'s category is retired, goes the other way or is money that stays yours, so its payment was left where it is filed.` };
  if (to.id === p.category) return { nothing: `The payment is already filed under ${bill}'s category.` };
  const fields = { category: to.id, ...(typeof p.filed_by === 'string' && p.filed_by !== '' ? { filed_by: null } : {}) };
  const under = String(to.fields.name ?? '').trim() || 'its category';
  return { writes: [{ id: payment.spoken, version: payment.version, fields }], said: `The payment for ${bill} is filed under ${under}, as spending.` };
}

/**
 * THE CATEGORIES `fileUnder` READS, and none where nothing can change: the live ones, and the entry's own when it is not
 * among them. Read only for an entry with no category or one under a category whose money stays yours.
 */
export async function categoriesFor(ctx, fields) {
  const own = typeof fields.category === 'string' && fields.category !== '' ? await ctx.record.get(fields.category) : null;
  if (own && own.fields.transfer !== true) return null;
  const live = await ctx.record.list('categories', { field: 'state', is: 'live' });
  return own && !live.some((c) => c.id === own.id) ? [...live, own] : live;
}

/**
 * The script: `input.payment` is the Ledger entry, by id as a rule hands it or as a person names it
 * ("transactions#348"). It reads the entry, the bill it settles and the categories, and writes what `fileUnder` answers.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = typeof input.payment === 'string' && input.payment !== '' ? input.payment : input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : null;
  const row = said ? await ctx.record.get(said) : null;
  if (!row || row.register !== 'transactions' || !Number.isSafeInteger(row.seq)) {
    ctx.log('The script was handed no Ledger entry, so nothing was filed.');
    return null;
  }
  const bill = typeof row.fields.settles === 'string' && row.fields.settles !== '' ? await ctx.record.get(row.fields.settles) : null;
  if (!bill || !Number.isSafeInteger(bill.seq)) {
    ctx.log('The entry pays no bill in the record, so nothing was filed.');
    return null;
  }
  const categories = await categoriesFor(ctx, row.fields);
  if (!categories) {
    ctx.log('The entry is filed under a category that counts as spending, so it was left there.');
    return null;
  }
  const payment = { list: 'transactions', id: row.id, spoken: `transactions#${row.seq}`, version: row.version, fields: row.fields };
  const item = { list: 'obligations', id: bill.id, spoken: `obligations#${bill.seq}`, version: bill.version, fields: bill.fields };
  const out = fileUnder(payment, item, categories, KINDS);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(out.said);
  return { filed: payment.spoken };
}

/**
 * The script as Money's pack document writes it, as `SETTLE_SCRIPT` is: no egress, no keys, started by a rule and the
 * hourly sweep and never by the clock alone, reading the Ledger, Bills and Categories and writing the Ledger alone.
 */
export const FILE_PAID_SCRIPT = {
  script: 'file_paid',
  title: 'File a paid bill as spending',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['categories', 'obligations', 'transactions'],
  writes: ['transactions'],
  source: `${fileUnder.toString()}\n${categoriesFor.toString()}\nconst KINDS = ${JSON.stringify(KINDS)};\nexport default ${run.toString()}`,
};

/**
 * A LEDGER ENTRY THAT PAYS A BILL AND IS FILED UNDER A CATEGORY starts `script.file_paid`, which files it under the bill's
 * category where the one it is under is money that stays yours: on the link, on a category written after it (a filing
 * rule's own, so the link wins), and through the hourly sweep for an entry linked before this or cleared since, while it
 * is ninety days old or less (`onTime` in `packages/kernel/src/flow.ts`). `stays` is not read here: a rule's `when:` reads
 * the entry's own list and never through a link, so the script reads the category. ONCE AN ENTRY AND A CATEGORY
 * (`once_per`), so a person who files it back under Transfers by hand is not filed over again.
 */
export const FILE_PAID_RULE = {
  rule: 'payment-files-paid',
  name: 'File a paid bill as spending',
  pack: 'money-core',
  on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['settles', 'category'] } },
  when: 'state is cleared, settles is set, transfer is false, category is set, on after -90d',
  once_per: ['entry', 'category'],
  steps: [{ script: { id: 'file_paid', as: 'filing', input: { payment: '{{trigger.entry}}' } } }],
};
