/**
 * One thing written down twice: an account that counts as cash and a holding with the same name. The account's balance
 * is in the cash and the holding's worth is in Holdings value, so the same thing may be counted twice. Asked once:
 * stop counting the account as cash, or keep counting it.
 *
 * WHAT IT READS. Once a day, the accounts that count as cash and are not closed, and the holdings. Two names are the
 * same when their letters are, whatever the capitals and wherever the spaces. A blank name matches nothing.
 *
 * WHAT IT WRITES. Nothing. The one change rides on the answer "Stop counting it" and is made by whoever picks it: the
 * account stops counting as cash and keeps its balance. "Keep counting it" changes nothing.
 *
 * ONE QUESTION TO A PAIR, EVER. The cause is the pair, by the two lines' own numbers, and the record holds one question
 * to a cause: a run that finds it waiting adds none, and a run that finds it answered asks nothing. So this keeps no
 * memory of its own. An account taken out of cash is no longer read, so it is not asked about either.
 *
 * ONE RUN ASKS ONE QUESTION, so with several pairs the one asked about turns with the day. Always asking about the
 * first would hand an answered pair back every night and never reach the second. A script reads one page of fifty of
 * each list, so a record with more of either is matched on its first fifty.
 */
const same = (name) => (typeof name === 'string' ? name.normalize('NFKC').toLowerCase().replace(/\s+/gu, '') : '');

export default async function run(ctx) {
  const holdings = await ctx.record.list('holdings');
  if (holdings.length === 0) return null;
  const accounts = (await ctx.record.list('accounts', { field: 'liquid', is: true })).filter((a) => a.fields.liquid === true && a.fields.state !== 'closed');
  const pairs = [];
  for (const account of accounts) {
    const name = same(account.fields.name);
    if (name === '') continue;
    for (const holding of holdings) if (same(holding.fields.label) === name) pairs.push({ account, holding });
  }
  if (pairs.length === 0) return null;
  const day = Math.round(Date.parse(`${ctx.today()}T00:00:00Z`) / 86_400_000);
  const { account, holding } = pairs[day % pairs.length];
  const name = String(account.fields.name).trim().replace(/\s+/gu, ' ');
  return {
    ask: {
      cause: `holdings.twin:${account.seq}:${holding.seq}`,
      question: `${name} is an account and a holding. It may be counted twice. Stop counting the account as cash?`,
      about: name,
      options: [
        {
          id: 'stop',
          label: 'Stop counting it',
          because: 'The account keeps its balance and is left out of your cash. The holding is counted as it is.',
          patches: [{ id: `accounts#${account.seq}`, version: account.version, fields: { liquid: false } }],
        },
        { id: 'keep', label: 'Keep counting it', because: 'Both are counted as they are, and this is not asked again.' },
      ],
    },
  };
}
