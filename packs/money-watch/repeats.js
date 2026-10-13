/**
 * Looks like it repeats: when one payee has been paid three times about a month apart, for amounts within a tenth of
 * each other, offer once to add it to Repeating.
 *
 * WHAT IT READS. Cleared money out in the Ledger over the last hundred days, never a move between your own accounts,
 * and the lines already in Repeating, so a payee that has a live line is not offered again. The payee is the
 * organisation an entry names, else the words the bank wrote with the card machine's prefix, the reference numbers
 * and a web ending cut off.
 *
 * WHAT IT WRITES. One line in Money watch for each payee it finds, and nothing in Repeating until you answer. "Yes,
 * add it" writes a monthly line with the newest amount, due a month after the newest payment. "No" writes nothing.
 *
 * IT ASKS ONCE A PAYEE. A payee you answered about, yes or no, is never offered again.
 *
 * IT SWITCHES ITSELF OFF. After three answers of "No" in a row it writes one line in Money watch saying so and stops
 * looking. Change that line to "Switched on again" and it starts over.
 *
 * STARTED THREE WAYS, and it tells them apart by what it is handed: a cleared Ledger entry (look at that payee), a new
 * line of its own in Money watch (ask about it), an answer on one (add the line, and count the no's). Once a night it
 * is handed nothing and looks at every payee.
 */

const FLAG = 'repeats';
const NAME = 'Looks like it repeats';
/** "About a month apart": the fewest and the most days between one payment and the next. */
const NEAR = 26;
const FAR = 35;
/** How far back it reads, in days: three payments a month apart and room to spare. */
const BACK = 100;
/** The most new lines one run writes, so a ledger imported whole does not fill Decide in one night. */
const MOST = 3;
/** The most rows one `ctx.record.list` answers, the record's own page. A full page may have left rows out. */
const PAGE = 50;
const EARLIEST = '1900-01-01';
const LATEST = '2999-12-31';

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

/** A name as two spellings of it share: its letters and digits, lower case. */
const plain = (name) => String(name).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The same day a month on, or the month's last day when it has no such day. */
function monthOn(day) {
  const [y, m, d] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

/** A day of the month as it is said: the 1st, the 2nd, the 12th, the 23rd. */
function nth(d) {
  const tail = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th';
  return `${d}${tail}`;
}

/** Whether a live line in Repeating already carries this payee. */
async function carried(ctx, name) {
  const lines = await allInWindow(ctx, 'recurring', 'next_due', EARLIEST, LATEST, [{ field: 'state', is: 'live' }, { field: 'direction', is: 'out' }]);
  return lines.some((l) => plain(fromWords(String(l.fields.what ?? '')).name) === plain(name) || plain(l.fields.what ?? '') === plain(name));
}

/** Look at one payee, or at every payee, and write a line for each that has three payments a month apart. */
async function look(ctx, started) {
  const today = ctx.today();
  const more = [{ field: 'state', is: 'cleared' }, { field: 'direction', is: 'out' }];
  if (started !== null) {
    if (!counts(started.fields)) return;
    /* ONLY THIS PAYEE, by the organisation or by the bank's words exactly. A payee whose words carry a different
       reference each month is read by the nightly look, which reads them all. */
    const f = started.fields;
    if (typeof f.party === 'string' && f.party !== '') more.push({ field: 'party', is: f.party });
    else if (typeof f.counterparty_text === 'string' && f.counterparty_text.trim() !== '') more.push({ field: 'counterparty_text', is: f.counterparty_text });
    else more.push({ field: 'what', is: f.what });
  }
  const names = new Map();
  const groups = new Map();
  for (const row of await allInWindow(ctx, 'transactions', 'on', shift(today, -BACK - 1), today, more)) {
    if (!counts(row.fields)) continue;
    const payee = await payeeOf(ctx, row.fields, names);
    const key = `${payee.key}|${row.fields.amount.currency}`;
    if (!groups.has(key)) groups.set(key, { payee, rows: [] });
    groups.get(key).rows.push(row);
  }
  let written = 0;
  for (const { payee, rows } of groups.values()) {
    rows.sort((a, b) => (a.fields.on < b.fields.on ? -1 : a.fields.on > b.fields.on ? 1 : a.seq - b.seq));
    const newest = rows[rows.length - 1];
    /* STILL GOING: a payee last paid more than a month ago has stopped, and is not offered. */
    if (dayNumber(today) - dayNumber(newest.fields.on) > FAR) continue;
    const amount = newest.fields.amount;
    /* WITHIN A TENTH OF THE NEWEST, in whole minor units, and a month before the one after it. */
    const before = (later) =>
      [...rows].reverse().find((r) => {
        const gap = dayNumber(later.fields.on) - dayNumber(r.fields.on);
        return gap >= NEAR && gap <= FAR && Math.abs(r.fields.amount.amount - amount.amount) * 10 <= amount.amount;
      });
    const second = before(newest);
    if (second === undefined || before(second) === undefined) continue;
    const asked = await ctx.record.list('money_flags', { all: [{ field: 'flag', is: FLAG }, { field: 'payee', is: payee.name }] });
    if (asked.length > 0 || (await carried(ctx, payee.name))) continue;
    if (written === MOST) {
      ctx.log(`More than ${MOST} payees look like they repeat, and the rest wait for the next look.`);
      return;
    }
    const under = typeof newest.fields.category === 'string' && newest.fields.category !== '' ? { under: newest.fields.category } : {};
    ctx.write('money_flags', {
      what: `Add ${payee.name} to Repeating, ${moneyText(amount)} around the ${nth(Number(newest.fields.on.slice(8, 10)))}?`,
      flag: FLAG,
      payee: payee.name,
      amount,
      on: monthOn(newest.fields.on),
      account: newest.fields.account,
      paid: newest.id,
      ...under,
      found: today,
    });
    written += 1;
  }
}

/** Ask about one new line: add it to Repeating, or not. */
function ask(flag) {
  const mine = (answer) => ({ id: `money_flags#${flag.seq}`, version: flag.version, fields: { said: answer } });
  const name = String(flag.fields.payee);
  return {
    ask: {
      /* THE LINE'S OWN NUMBER, since a cause is one short key and a payee's name may hold a space or any script. One
         line is one payee, so one line is one question. */
      cause: `money-watch.repeats:${flag.seq}`,
      question: String(flag.fields.what),
      about: name,
      options: [
        { id: 'yes', label: 'Yes, add it', because: `${name} goes into Repeating at ${moneyText(flag.fields.amount)} every month, next on ${dayText(flag.fields.on)}.`, patches: [mine('yes')] },
        { id: 'no', label: 'No', because: `Nothing is added, and Money watch does not ask about ${name} again.`, patches: [mine('no')] },
      ],
    },
  };
}

/** After a yes: the line in Repeating, monthly, at the newest amount, on the next day it falls due from today. */
async function add(ctx, flag) {
  const name = String(flag.fields.payee);
  if (await carried(ctx, name)) {
    ctx.log(`${name} already has a live line in Repeating, so none was added.`);
    return;
  }
  const today = ctx.today();
  const day = Number(String(flag.fields.on).slice(8, 10));
  let due = String(flag.fields.on);
  while (due < today) due = monthOn(due);
  const also = {};
  if (typeof flag.fields.account === 'string' && flag.fields.account !== '') also.account = flag.fields.account;
  if (typeof flag.fields.under === 'string' && flag.fields.under !== '') also.category = flag.fields.under;
  ctx.write('recurring', {
    what: name,
    direction: 'out',
    amount: flag.fields.amount,
    every: 'monthly',
    next_due: due,
    day_of_month: String(day),
    ...also,
    state: 'live',
    note: 'Added by Money watch from three payments about a month apart.',
  });
}

/** After an answer: three of "No" in a row since it was last switched on switch the flag off, said once. */
async function quiet(ctx) {
  const lines = await flagsSoFar(ctx);
  if (lines.some((l) => l.fields.said === 'off')) return;
  const since = Math.max(0, ...lines.filter((l) => l.fields.said === 'on').map((l) => l.seq));
  const answered = lines
    .filter((l) => l.seq > since && (l.fields.said === 'yes' || l.fields.said === 'no'))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.seq - a.seq));
  if (answered.length < 3 || answered.slice(0, 3).some((l) => l.fields.said !== 'no')) return;
  const said = `${NAME} was switched off after three no's. Switch it on again in Money watch.`;
  ctx.write('money_flags', { what: said, flag: FLAG, said: 'off', found: ctx.today() });
  ctx.log(said);
}

export default async function run(ctx) {
  if (ctx.config.repeats === false) return null;
  const handed = ctx.input !== null && typeof ctx.input === 'object' && typeof ctx.input.id === 'string' ? await ctx.record.get(ctx.input.id) : null;
  if (ctx.input !== null && typeof ctx.input === 'object' && typeof ctx.input.id === 'string' && handed === null) return null;
  if (handed !== null && handed.register === 'money_flags') {
    if (handed.fields.flag !== FLAG) return null;
    const answer = handed.fields.said;
    if (answer === 'yes') await add(ctx, handed);
    if (answer === 'yes' || answer === 'no') await quiet(ctx);
    if (answer !== undefined && answer !== null && answer !== '') return null;
    if ((await flagsSoFar(ctx)).some((l) => l.fields.said === 'off')) return null;
    return ask(handed);
  }
  if ((await flagsSoFar(ctx)).some((l) => l.fields.said === 'off')) return null;
  await look(ctx, handed);
  return null;
}
