/**
 * Charged twice: when the same payee takes the same amount from the same account twice within two days, ask once
 * whether both are real.
 *
 * WHAT IT READS. Cleared money out in the Ledger, never a move between your own accounts. The payee is the
 * organisation an entry names, else the words the bank wrote with the card machine's prefix, the reference numbers
 * and a web ending cut off.
 *
 * WHAT IT WRITES. One line in Money watch for each pair it finds, and nothing in the Ledger until you answer. "Both
 * real" changes nothing. "One is a mistake" marks the newer of the two void, so it is no longer counted.
 *
 * IT ASKS ONCE. A third charge of the same amount a day later belongs to the pair already asked about, so it adds no
 * second question, and a pair you answered is never asked about again.
 *
 * IT SWITCHES ITSELF OFF. After three answers of "Both real" in a row it writes one line in Money watch saying so and
 * stops looking. Change that line to "Switched on again" and it starts over.
 *
 * STARTED THREE WAYS, and it tells them apart by what it is handed: a cleared Ledger entry (look around that entry), a
 * new line of its own in Money watch (ask about it), an answer on one (count the no's). Once a night it is handed
 * nothing and looks at the last two weeks.
 */

const FLAG = 'twice';
const NAME = 'Charged twice';
/** How far apart two charges may be and still be one charge made twice, in days. */
const APART = 2;
/** How far back the nightly look reaches, in days. */
const BACK = 14;
/** The most new lines one run writes, so a ledger imported whole does not fill Decide in one night. */
const MOST = 3;
/** The most rows one `ctx.record.list` answers, the record's own page. A full page may have left rows out. */
const PAGE = 50;
const EARLIEST = '1900-01-01';

const DAY_MS = 86_400_000;
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
const dayOf = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const shift = (day, by) => dayOf(dayNumber(day) + by);

/**
 * Every row of `register` whose `field` is after `from` and on or before `to`, with `more` leaves, however many there
 * are. A window whose page comes back full is cut in two by day and each half asked again.
 */
async function allInWindow(ctx, register, field, from, to, more) {
  const rows = await ctx.record.list(register, { all: [{ field, gt: from }, { field, lte: to }, ...more] });
  if (rows.length < PAGE) return rows;
  const low = dayNumber(from);
  const high = dayNumber(to);
  if (high - low <= 1) throw new Error(`More than ${PAGE} lines fall on ${to}, so Money watch could not read that day and wrote nothing.`);
  const mid = dayOf(Math.floor((low + high) / 2));
  return [...(await allInWindow(ctx, register, field, from, mid, more)), ...(await allInWindow(ctx, register, field, mid, to, more))];
}

const SIGNS = { EGP: 'E£', USD: '$', GBP: '£', EUR: '€' };
const PLACES = { CLF: 4, UYW: 4, BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3, BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0 };

/** An amount as a question says it: `E£979.99`, `E£219`, `SEK 1,200`. By the digits, never by division. */
function moneyText(money) {
  const code = String(money.currency).toUpperCase();
  const places = PLACES[code] ?? 2;
  const digits = String(Math.abs(money.amount)).padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const part = places === 0 ? '' : digits.slice(digits.length - places);
  const head = whole.length % 3 || 3;
  const groups = [whole.slice(0, head)];
  for (let i = head; i < whole.length; i += 3) groups.push(whole.slice(i, i + 3));
  const body = `${groups.join(',')}${/^0*$/.test(part) ? '' : `.${part}`}`;
  return SIGNS[code] ? `${SIGNS[code]}${body}` : `${code} ${body}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (day) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** A payee from the bank's words: `GEIDEA*CHILLOUT 0418 CAIRO` reads Chillout, and `NETFLIX.COM` reads Netflix. */
function fromWords(text) {
  const said = text.trim();
  const words = (said.includes('*') ? said.slice(said.indexOf('*') + 1) : said).split(/\s+/).filter(Boolean);
  const kept = [];
  for (const w of words) {
    if (/\d/.test(w) && kept.length > 0) break;
    kept.push(w);
  }
  let cut = kept.join(' ').replace(/\.(?:com|net|org|io|co|app|eg)\b.*$/i, '').replace(/^[\s,;:._\-/]+|[\s,;:._\-/]+$/g, '');
  if (!/[\p{L}\p{N}]/u.test(cut)) cut = said;
  const mixed = /\p{Lu}/u.test(cut) && /\p{Ll}/u.test(cut);
  const name = mixed ? cut : cut.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_all, before, letter) => `${before}${letter.toUpperCase()}`);
  return { key: `words:${cut.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}`, name };
}

/** Who an entry paid: the organisation it names, by its name, else the bank's words. `names` remembers each one read. */
async function payeeOf(ctx, f, names) {
  if (typeof f.party === 'string' && f.party !== '') {
    if (!names.has(f.party)) {
      const who = await ctx.record.get(f.party);
      names.set(f.party, who !== null && typeof who.fields.name === 'string' ? who.fields.name.trim() : '');
    }
    if (names.get(f.party) !== '') return { key: `who:${f.party}`, name: names.get(f.party) };
  }
  const words = typeof f.counterparty_text === 'string' && f.counterparty_text.trim() !== '' ? f.counterparty_text : String(f.what ?? '');
  return fromWords(words);
}

/** Whether an entry is a charge this flag reads: cleared money out with an amount, and no move between own accounts. */
const counts = (f) => f.state === 'cleared' && f.direction === 'out' && f.transfer !== true && f.amount !== null && typeof f.amount === 'object' && typeof f.on === 'string';

/** Every line of this flag in Money watch. */
const flagsSoFar = (ctx) => allInWindow(ctx, 'money_flags', 'found', EARLIEST, shift(ctx.today(), 1), [{ field: 'flag', is: FLAG }]);

/** Look for pairs around one entry, or over the last two weeks, and write a line for each one not written before. */
async function look(ctx, started) {
  const today = ctx.today();
  let from = shift(today, -BACK - 1);
  let to = today;
  const more = [{ field: 'state', is: 'cleared' }, { field: 'direction', is: 'out' }];
  if (started !== null) {
    if (!counts(started.fields)) return;
    from = shift(started.fields.on, -APART - 1);
    to = shift(started.fields.on, APART);
    more.push({ field: 'account', is: started.fields.account });
  }
  const names = new Map();
  const groups = new Map();
  for (const row of await allInWindow(ctx, 'transactions', 'on', from, to, more)) {
    if (!counts(row.fields)) continue;
    const payee = await payeeOf(ctx, row.fields, names);
    const key = [row.fields.account, payee.key, row.fields.amount.amount, row.fields.amount.currency].join('|');
    if (!groups.has(key)) groups.set(key, { payee, rows: [] });
    groups.get(key).rows.push(row);
  }
  let written = 0;
  for (const { payee, rows } of groups.values()) {
    rows.sort((a, b) => (a.fields.on < b.fields.on ? -1 : a.fields.on > b.fields.on ? 1 : a.seq - b.seq));
    for (let i = 0; i < rows.length; ) {
      /* ONE RUN OF CHARGES, each within two days of the one before it. */
      let end = i;
      while (end + 1 < rows.length && dayNumber(rows[end + 1].fields.on) - dayNumber(rows[end].fields.on) <= APART) end += 1;
      const run = rows.slice(i, end + 1);
      i = end + 1;
      if (run.length < 2) continue;
      const [first, newer] = run;
      const last = run[run.length - 1];
      /* ASKED ABOUT ALREADY, when a line for this payee, account and amount sits within two days of the run. */
      const before = await allInWindow(ctx, 'money_flags', 'on', shift(first.fields.on, -APART - 1), shift(last.fields.on, APART), [
        { field: 'flag', is: FLAG },
        { field: 'payee', is: payee.name },
      ]);
      const amount = newer.fields.amount;
      if (before.some((b) => b.fields.account === newer.fields.account && b.fields.amount && b.fields.amount.amount === amount.amount && b.fields.amount.currency === amount.currency)) continue;
      if (written === MOST) {
        ctx.log(`More than ${MOST} pairs were found, and the rest wait for the next look.`);
        return;
      }
      const days = first.fields.on === newer.fields.on ? `twice on ${dayText(newer.fields.on)}` : `on ${dayText(first.fields.on)} and again on ${dayText(newer.fields.on)}`;
      ctx.write('money_flags', {
        what: `${payee.name} ${moneyText(amount)} ${days}`,
        flag: FLAG,
        payee: payee.name,
        amount,
        on: newer.fields.on,
        account: newer.fields.account,
        paid: newer.id,
        found: today,
      });
      written += 1;
    }
  }
}

/** Ask about one new line: both real, or the newer one is a mistake. */
async function ask(ctx, flag) {
  const newer = typeof flag.fields.paid === 'string' ? await ctx.record.get(flag.fields.paid) : null;
  if (newer === null || newer.fields.state !== 'cleared') {
    ctx.log(`${flag.fields.what}: the newer of the two is no longer a cleared entry, so nothing was asked.`);
    return null;
  }
  const mine = (answer) => ({ id: `money_flags#${flag.seq}`, version: flag.version, fields: { said: answer } });
  return {
    ask: {
      /* THE LINE'S OWN NUMBER, since a cause is one short key and a payee's name may hold a space or any script. One
         line is one pair, so one line is one question. */
      cause: `money-watch.twice:${flag.seq}`,
      question: `${flag.fields.what}. Both real?`,
      about: String(flag.fields.payee),
      options: [
        { id: 'real', label: 'Both real', because: 'Both stay in the Ledger as they are.', patches: [mine('real')] },
        {
          id: 'mistake',
          label: 'One is a mistake',
          because: 'The newer of the two is marked void, so it is no longer counted.',
          patches: [mine('mistake'), { id: `transactions#${newer.seq}`, version: newer.version, fields: { state: 'void' } }],
        },
      ],
    },
  };
}

/** After an answer: three of "Both real" in a row since it was last switched on switch the flag off, said once. */
async function quiet(ctx) {
  const lines = await flagsSoFar(ctx);
  if (lines.some((l) => l.fields.said === 'off')) return;
  const since = Math.max(0, ...lines.filter((l) => l.fields.said === 'on').map((l) => l.seq));
  const answered = lines
    .filter((l) => l.seq > since && (l.fields.said === 'real' || l.fields.said === 'mistake'))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.seq - a.seq));
  if (answered.length < 3 || answered.slice(0, 3).some((l) => l.fields.said !== 'real')) return;
  const said = `${NAME} was switched off after three no's. Switch it on again in Money watch.`;
  ctx.write('money_flags', { what: said, flag: FLAG, said: 'off', found: ctx.today() });
  ctx.log(said);
}

export default async function run(ctx) {
  if (ctx.config.twice === false) return null;
  const handed = ctx.input !== null && typeof ctx.input === 'object' && typeof ctx.input.id === 'string' ? await ctx.record.get(ctx.input.id) : null;
  if (ctx.input !== null && typeof ctx.input === 'object' && typeof ctx.input.id === 'string' && handed === null) return null;
  if (handed !== null && handed.register === 'money_flags') {
    if (handed.fields.flag !== FLAG) return null;
    const answer = handed.fields.said;
    if (answer === 'real' || answer === 'mistake') await quiet(ctx);
    if (answer !== undefined && answer !== null && answer !== '') return null;
    if ((await flagsSoFar(ctx)).some((l) => l.fields.said === 'off')) return null;
    return ask(ctx, handed);
  }
  if ((await flagsSoFar(ctx)).some((l) => l.fields.said === 'off')) return null;
  await look(ctx, handed);
  return null;
}
