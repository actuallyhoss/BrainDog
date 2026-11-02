/**
 * A thing that holds money takes its account's book, as the decision, the script a host runs round
 * it, and the declaration a pack document carries.
 *
 * A BOOK'S PAGE READS THE BOOK ON EACH LIST, because a filter cannot follow an entry to its account's book
 * (`lists/shared.ts`, `BOOK`). Until this script nothing filled that link but a hand or a pack with a book setting, so
 * an entry typed in on Acme's account, and every entry a bank's text wrote, sat in no book and Acme's page left it out.
 *
 * ONLY AN EMPTY BOOK IS FILLED. A thing that names its own book keeps it, whatever book its account is in: a personal
 * card that paid a company bill is in the company's book because somebody said so. An account in no book fills
 * nothing, so a record that keeps one set of money is never written by this.
 *
 * IT RUNS TWO WAYS. Handed one thing by a rule (`entry-takes-book` and its three siblings in `../rules.ts`), it files
 * that one and says so in names. Handed nothing, once a day, it counts what sits in no book on an account that is in
 * one, which is what an account held before it was put in a book, and asks ONE QUESTION THAT SAYS HOW MANY. The
 * answer is the change: "File them" carries each patch at the version the script read, so the gate refuses a pick
 * whose line was edited since.
 *
 * THE QUESTION IS ASKED ONCE FOR THE ACCOUNTS IT IS ABOUT. Its cause names them, and the gate remembers an answer by
 * its cause, so "Leave them" is not asked again the next night, and an account put in a book next year is a new
 * question.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `bookFromAccount`, AND NOTHING BUT `bookFromAccount` BY `run`: the two texts
 * together are the script (`BOOK_FROM_ACCOUNT_SCRIPT.source`).
 */

/**
 * The changes: for each thing with no book whose account is in one (`inBook`, an account's id to its book's id), that
 * book, at the version the thing was read. Asked of any list, so a list that gains an account needs no change here.
 */
export function bookFromAccount(rows, inBook) {
  const held = (v) => typeof v === 'string' && v !== '';
  const out = [];
  for (const r of rows) {
    const f = r.fields;
    if (held(f.book) || !held(f.account)) continue;
    const book = inBook[f.account];
    if (!held(book)) continue;
    out.push({ id: r.spoken, version: r.version, fields: { book } });
  }
  return out;
}

/**
 * The script. A rule hands the thing that was written as its list and number (`input.register`, `input.seq`), and a
 * person may name one (`input.row`, "transactions#12"). With neither it is the daily count and its one question.
 *
 * A SCRIPT'S LIST IS ONE PAGE OF FIFTY, so each is read a page at a time, in row number order (`{ order: 'seq' }`), each next page asking for numbers
 * above the highest one read, as `plans-from-names.js` reads. ASKED BY ACCOUNT, since the account is indexed on all four lists
 * and a Ledger of ten thousand entries in no book, on accounts in no book, is then never read at all.
 *
 * "FILE THEM" CARRIES AT MOST 200 CHANGES, the most one option may carry (the gate's `OPTION_PATCHES`). Past that the
 * answer says so, and the cause carries the count, so what is left is a new question the night after the first is
 * answered. IT WAS 900, over the gate's 200, so a record with more than two hundred entries in no book had every nightly
 * run refused and asked nothing.
 *
 * THE COUNT IS OF WHAT STILL STANDS, AS THE PAGE COUNTS IT (`figures/books.ts`, the figures of what is in no book): a
 * Ledger entry that is not void, a bill open or part paid, a repeating line that has not ended, an instalment still
 * open. So the question and the page say one number, and "File them" writes nothing onto a void entry, a bill paid or
 * written off, an ended line or a cancelled part
 * A thing handed by a rule or by name is filed whatever its status: somebody wrote it just now.
 */
export default async function run(ctx) {
  const PAGE = 50;
  const MOST = 200;
  /* THE LISTS THAT HOLD AN ACCOUNT, and what one thing on each is called. Bills and invoices is among them since it
     gained an account, and is said by the list's own name: half of them are invoices. */
  const LISTS = ['transactions', 'obligations', 'recurring', 'installments'];
  const STANDS = {
    transactions: (s) => s !== 'void',
    obligations: (s) => s === 'open' || s === 'part',
    recurring: (s) => s !== 'ended',
    installments: (s) => s === 'open',
  };
  const CALLED = {
    transactions: ['Ledger entry', 'Ledger entries'],
    obligations: ['bill or invoice', 'bills and invoices'],
    recurring: ['repeating line', 'repeating lines'],
    installments: ['instalment', 'instalments'],
  };
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const held = (v) => typeof v === 'string' && v !== '';
  const every = async (list, where) => {
    const rows = [];
    let after = null;
    for (;;) {
      /* IN ROW NUMBER ORDER, because a list answers in its own (the Ledger by day) and `seq` past the lowest of a page skips rows. */
      const page = await ctx.record.list(list, after === null ? where : { all: [where, { field: 'seq', gt: after }] }, { order: 'seq' });
      for (const r of page) rows.push({ list, id: r.id, seq: r.seq, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
      if (page.length < PAGE) return rows;
      after = Math.max(...page.map((r) => r.seq));
    }
  };
  const nameOf = async (book) => {
    const row = await ctx.record.get(book);
    const name = row && typeof row.fields.name === 'string' ? row.fields.name.trim() : '';
    return name || 'its book';
  };

  const handed =
    typeof input.row === 'string' && /^[a-z_]+#\d+$/.test(input.row) ? input.row : typeof input.register === 'string' && Number.isSafeInteger(input.seq) ? `${input.register}#${input.seq}` : null;
  if (handed) {
    const list = handed.split('#')[0];
    /* AN ACCOUNT PUT IN A BOOK (`account-files-book`): everything on it that is in no book and still stands takes the book. */
    if (list === 'accounts') {
      const account = await ctx.record.get(handed);
      const book = account ? account.fields.book : null;
      if (!account || !held(book)) {
        ctx.log('The account is in no book, so nothing was filed.');
        return null;
      }
      const found = [];
      for (const each of LISTS)
        found.push(...(await every(each, { all: [{ field: 'account', is: account.id }, { field: 'book', empty: true }] })).filter((r) => STANDS[each](r.fields.state)));
      const writes = bookFromAccount(found, { [account.id]: book }).slice(0, 1000);
      for (const w of writes) ctx.update(w.id, w.fields, w.version);
      const name = String(account.fields.name ?? '').trim() || 'The account';
      ctx.log(writes.length === 0 ? `${name} holds nothing in no book.` : `${writes.length} ${writes.length === 1 ? 'thing' : 'things'} on ${name} ${writes.length === 1 ? 'is' : 'are'} in ${await nameOf(book)} now, the book it was put in.`);
      return writes.length === 0 ? null : { filed: writes.length };
    }
    if (!LISTS.includes(list)) {
      ctx.log('The script was handed something that holds no account, so nothing was filed in a book.');
      return null;
    }
    const row = await ctx.record.get(handed);
    if (!row) {
      ctx.log('It is no longer in the record, so nothing was filed in a book.');
      return null;
    }
    const what = String(row.fields.what ?? '').trim() || 'This';
    const account = held(row.fields.account) ? await ctx.record.get(row.fields.account) : null;
    const book = account ? account.fields.book : null;
    const writes = bookFromAccount([{ spoken: handed, version: row.version, fields: row.fields }], held(book) ? { [row.fields.account]: book } : {});
    if (writes.length === 0) {
      ctx.log(held(row.fields.book) ? `${what} names its own book, so it was left there.` : `${what} is on an account that is in no book, so it was filed in none.`);
      return null;
    }
    for (const w of writes) ctx.update(w.id, w.fields, w.version);
    ctx.log(`${what} is in ${await nameOf(book)}, the book its account is in.`);
    return { filed: 1 };
  }

  const accounts = (await every('accounts', { field: 'book', present: true })).filter((a) => held(a.fields.book));
  if (accounts.length === 0) return null;
  const inBook = {};
  for (const a of accounts) inBook[a.id] = a.fields.book;
  const found = [];
  const on = new Set();
  for (const list of LISTS)
    for (const a of accounts) {
      const rows = (await every(list, { all: [{ field: 'account', is: a.id }, { field: 'book', empty: true }] })).filter((r) => STANDS[list](r.fields.state));
      if (rows.length > 0) on.add(a);
      found.push(...rows);
    }
  const all = bookFromAccount(found, inBook);
  if (all.length === 0) return null;
  const patches = all.slice(0, MOST);
  const more = all.length > patches.length;

  /* SAID IN COUNTS AND IN WHAT EACH LIST CALLS ITS OWN: "2 Ledger entries, 1 repeating line and 1 instalment". */
  const counted = LISTS.map((list) => [list, all.filter((w) => w.id.startsWith(`${list}#`)).length])
    .filter(([, n]) => n > 0)
    .map(([list, n]) => `${n} ${CALLED[list][n === 1 ? 0 : 1]}`);
  const listed = counted.length > 1 ? `${counted.slice(0, -1).join(', ')} and ${counted.at(-1)}` : counted[0];
  const one = all.length === 1;
  const question = one
    ? `${listed} is in no book, and its account is in one. File it in its account's book?`
    : `${listed} are in no book, and ${on.size === 1 ? 'their account is' : 'their accounts are'} in one. File each in its account's book?`;
  const options = [
    {
      label: one ? 'File it' : 'File them',
      because: more
        ? `The first ${MOST} take the book their account is in, and you are asked about the other ${all.length - MOST} after.`
        : one
          ? 'It takes the book its account is in, and nothing else about it changes.'
          : 'Each takes the book its account is in, and nothing else about it changes.',
      patches,
    },
    { label: one ? 'Leave it' : 'Leave them', because: one ? 'It stays in no book, and no book counts it.' : 'They stay in no book, and no book counts them.' },
  ];

  /* THE BOOKS, BY NAME. Handed as a list: the gate joins as many as fit its 80 bytes and counts the rest. */
  const about = [];
  for (const book of new Set([...on].map((a) => a.fields.book))) about.push(await nameOf(book));
  about.sort();

  /* THE CAUSE NAMES THE ACCOUNTS BY THEIR NUMBERS, which nobody reads: it is the key the gate remembers an answer by. */
  const seqs = [...on].map((a) => a.seq).sort((x, y) => x - y);
  const key = seqs.join('-').length <= 120 ? seqs.join('-') : `${seqs[0]}-${seqs.at(-1)}.x${seqs.length}`;
  return { ask: { cause: `money.book-from-account.${key}${more ? `.n${all.length}` : ''}`, question, about, options } };
}

/**
 * The script as Money's pack document writes it, as `LAST_DAY_SCRIPT` is: no egress, no keys, once a day and when a
 * rule hands it a thing. It reads accounts and books for the link and the name, and writes the book on the four lists
 * alone. `limits.writes` is the most a script may ask for, since one answer files everything an account already held.
 */
export const BOOK_FROM_ACCOUNT_SCRIPT = {
  script: 'book_from_account',
  title: 'File what an account holds in the account\'s book',
  pack: 'money-core',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['accounts', 'books', 'transactions', 'obligations', 'recurring', 'installments'],
  writes: ['transactions', 'obligations', 'recurring', 'installments'],
  limits: { writes: 1000 },
  source: `${bookFromAccount.toString()}\nexport default ${run.toString()}`,
};
