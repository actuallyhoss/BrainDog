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
 * first would hand an answered pair back every night and never reach the second. Holdings and accounts are read past
 * the first page of fifty, by number.
 */
const same = (name) => (typeof name === 'string' ? name.normalize('NFKC').toLowerCase().replace(/\s+/gu, '') : '');

/**
 * Every row of a list that `where` lets through. A script's list is one page of fifty, in the list's own order and with
 * no cursor, so the rows are asked for by number instead: the top number is found by asking above the highest seen,
 * then (0, top] is cut in halves until each half comes back short. At most 60 reads; `short` says some were left.
 */
async function every(ctx, register, where) {
  const PAGE = 50;
  const READS = 60;
  let reads = 0;
  const ask = (above, upto) => {
    reads += 1;
    const parts = [...(where ? [where] : []), ...(above > 0 ? [{ field: 'seq', gt: above }] : []), ...(upto === null ? [] : [{ field: 'seq', lte: upto }])];
    return parts.length === 0 ? ctx.record.list(register) : ctx.record.list(register, parts.length === 1 ? parts[0] : { all: parts });
  };
  const first = await ask(0, null);
  if (first.length < PAGE) return first;
  const seen = new Map(first.map((r) => [r.id, r]));
  let top = Math.max(...first.map((r) => r.seq));
  for (;;) {
    if (reads >= READS) break;
    const above = await ask(top, null);
    for (const r of above) seen.set(r.id, r);
    if (above.length < PAGE) break;
    top = Math.max(...above.map((r) => r.seq));
  }
  const spans = [[0, top]];
  let short = false;
  while (spans.length > 0) {
    if (reads >= READS) {
      short = true;
      break;
    }
    const [a, b] = spans.pop();
    const page = await ask(a, b);
    for (const r of page) seen.set(r.id, r);
    if (page.length >= PAGE && b - a > 1) {
      const mid = Math.floor((a + b) / 2);
      spans.push([a, mid], [mid, b]);
    }
  }
  const rows = [...seen.values()];
  rows.short = short;
  return rows;
}

export default async function run(ctx) {
  const holdings = await every(ctx, 'holdings');
  if (holdings.length === 0) return null;
  const accounts = (await every(ctx, 'accounts', { field: 'liquid', is: true })).filter((a) => a.fields.liquid === true && a.fields.state !== 'closed');
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
