/**
 * A CATEGORY THAT HOLDS MOVES BETWEEN HIS OWN ACCOUNTS ASKS ONCE WHETHER IT IS MONEY THAT STAYS HIS (Q8 of 29 October).
 *
 * Spending leaves out a move the record paired (`transfer`) and anything filed under a category ticked "Money stays
 * yours" (`stays`, money-core 3.30.0). A real ledger files both legs of every move, cash taken out and the card paid
 * off under a category of its own, called Transfers on his, and nobody had ticked it. So every leg the record could
 * not pair, a dollar transfer whose pound side is not in the Ledger, an ATM withdrawal, a card paid off from the bank,
 * was read as spending, and "Spent this month" led with Transfers at EGP 132,558.
 *
 * WHEN A PAIRED MOVE SITS UNDER A CATEGORY THAT IS NOT TICKED, the category is asked about once, by name: "Transfers
 * holds money moved between your own accounts. Leave all of Transfers out of spending?" Yes ticks it, and every entry
 * under it leaves Spent and Received at once. No writes nothing, and the cause, one a category, is what keeps it from
 * being asked again. Nothing reads a category by its name, so this is a question and never a guess.
 */

export function staysAsk(name, n, categoryId, about) {
  const more = n > 1 ? ` ${n} moves between your accounts are filed there.` : '';
  return {
    cause: `money.stays.${categoryId}`,
    question: `${name} holds money moved between your own accounts. Leave all of ${name} out of spending?${more}`,
    about,
    options: [
      { id: 'yes', label: 'Yes', because: `Everything under ${name} stops counting as money spent or received, as a move between your accounts does. You can untick it on the category.` },
      { id: 'no', label: 'No, it is spending', because: `${name} keeps counting as spending, and this is not asked again.` },
    ],
  };
}

export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : typeof input.entry === 'string' ? input.entry : input.id;
  const entry = typeof said === 'string' && said !== '' ? await ctx.record.get(said) : null;
  if (!entry || entry.register !== 'transactions') {
    ctx.log('The script was handed no Ledger entry, so nothing was asked.');
    return null;
  }
  const f = entry.fields;
  if (typeof f.category !== 'string' || f.category === '') {
    ctx.log('The entry has no category, so nothing was asked.');
    return null;
  }
  const category = await ctx.record.get(f.category);
  if (!category || category.register !== 'categories' || category.fields.state !== 'live') {
    ctx.log('The entry is under a category that is gone or retired, so nothing was asked.');
    return null;
  }
  const name = typeof category.fields.name === 'string' && category.fields.name.trim() !== '' ? category.fields.name.trim() : 'This category';
  if (category.fields.transfer === true) {
    ctx.log(`${name} already says its money stays yours, so nothing was asked.`);
    return null;
  }

  /* ANSWERED. Yes ticks the category; any other words write nothing. */
  if (typeof input.answer === 'string') {
    if (input.answer !== 'Yes') {
      ctx.log(`${name} keeps counting as spending.`);
      return null;
    }
    ctx.update(`categories#${category.seq}`, { transfer: true }, category.version);
    ctx.log(`${name} is money that stays yours now, so it is left out of spending and income.`);
    return { stays: `categories#${category.seq}` };
  }

  /* ASKED ONLY OF A MOVE THE RECORD OR A PERSON MARKED, so a category of real spending a single paired leg landed in is
     asked about only when most of what it holds lately is moves. */
  if (f.transfer !== true) {
    ctx.log('The entry is not a move between your accounts, so nothing was asked.');
    return null;
  }
  const rows = await ctx.record.list('transactions', { all: [{ field: 'category', is: category.id }, { field: 'state', is: 'cleared' }] });
  const moves = rows.filter((r) => r.fields.transfer === true).length;
  if (moves * 2 < rows.length) {
    ctx.log(`Most of what ${name} holds is not moves between your accounts, so nothing was asked.`);
    return null;
  }
  ctx.log(`Asked whether ${name} is money that stays yours.`);
  return { ask: staysAsk(name, moves, category.id, `transactions#${entry.seq}`) };
}

export const CATEGORY_STAYS_SCRIPT = {
  script: 'category_stays',
  title: 'Ask whether a category of moves is money that stays yours',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['transactions', 'categories'],
  writes: ['categories'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `${staysAsk.toString()}\nexport default ${run.toString()}`,
};
