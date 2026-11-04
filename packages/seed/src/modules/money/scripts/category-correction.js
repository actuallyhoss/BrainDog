/**
 * A CATEGORY OF CORRECTIONS ASKS ONCE WHETHER TO LEAVE IT OUT OF SPENDING (live check of 30 October, 20).
 *
 * A count of the cash files what it cannot explain under Discrepancy (the Count the cash add-on), and an import brings
 * a ledger's own balance fixes under a name like it. Such a line is the gap between what the record thought an account
 * held and what it held, not money spent, and Reports led "Spending by category" with Discrepancy at a tenth of
 * everything. Spending leaves out what is filed under a category ticked "A correction and not spending" (`correction`,
 * read on each line as `corrects`), and nobody had ticked it.
 *
 * WHEN A LINE IS FILED UNDER A CATEGORY WHOSE NAME SAYS IT IS A CORRECTION, the category is asked about once, by name:
 * "Discrepancy holds corrections to what an account holds, not money spent. Leave all of Discrepancy out of spending?"
 * Yes ticks it. No writes nothing. Only a name that says so is asked about, and the answer is the person's, so a
 * category is never left out on a guess.
 */

export function correctionAsk(name, categoryId, about) {
  return {
    cause: `money.correction.${categoryId}`,
    question: `${name} holds corrections to what an account holds, not money spent. Leave all of ${name} out of spending?`,
    about,
    options: [
      { id: 'yes', label: 'Yes', because: `Everything under ${name} stops counting as money spent or received. It still counts in what each account holds. You can untick it on the category.` },
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
  const name = typeof category.fields.name === 'string' && category.fields.name.trim() !== '' ? category.fields.name.trim() : '';
  if (category.fields.correction === true) {
    ctx.log(`${name || 'The category'} already says it holds corrections, so nothing was asked.`);
    return null;
  }

  /* ANSWERED. Yes ticks the category; any other words write nothing. */
  if (typeof input.answer === 'string') {
    if (input.answer !== 'Yes') {
      ctx.log(`${name || 'The category'} keeps counting as spending.`);
      return null;
    }
    ctx.update(`categories#${category.seq}`, { correction: true }, category.version);
    ctx.log(`${name || 'The category'} holds corrections now, so it is left out of spending and income.`);
    return { correction: `categories#${category.seq}` };
  }

  /* THE NAMES A CATEGORY OF CORRECTIONS GOES BY, written here since only `run` is sent: a count's Discrepancy, a ledger's
     balance fixes. */
  if (name === '' || !/\b(discrepanc|adjustment|balance (fix|correction)|reconcil|correction)/iu.test(name)) {
    ctx.log('The category does not say it holds corrections, so nothing was asked.');
    return null;
  }
  ctx.log(`Asked whether ${name} holds corrections.`);
  return { ask: correctionAsk(name, category.id, `transactions#${entry.seq}`) };
}

export const CATEGORY_CORRECTION_SCRIPT = {
  script: 'category_correction',
  title: 'Ask whether a category of corrections is left out of spending',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['transactions', 'categories'],
  writes: ['categories'],
  limits: { cpu_ms: 1000, wall_ms: 30000 },
  source: `${correctionAsk.toString()}\nexport default ${run.toString()}`,
};
