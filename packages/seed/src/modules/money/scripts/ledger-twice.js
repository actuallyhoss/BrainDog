/**
 * Lines the Ledger holds twice, and the one question that keeps one of each, as the script a host runs and the
 * declaration a pack document carries.
 *
 * ONE PAYMENT CAN REACH THE LEDGER BY TWO ROADS, and each road writes its own line. A bank's alert and its statement,
 * an alert sent again after its add-on learned to read a reference, an agent typing in a statement the alerts already
 * wrote: the descriptions differ ("AHMED EMAD SAIED ABDELAZIZ" and "IPN outward transfer to AHMED EMAD SAIED
 * ABDELAZIZ"), the days differ by the days a bank takes to post, and the Ledger counted both (live check of 30 October,
 * 11: four HSBC payments held twice, archived by hand). The doors now meet the second sighting as the first
 * (`nearMatch` in packages/extract); this finds the pairs already written, whichever road wrote them.
 *
 * TWO LINES ARE ONE PAYMENT WHEN, ALL AT ONCE (`twiceOf`):
 *   - they are in one account, go the same way, and move the same amount in the same currency;
 *   - their days are three apart at most;
 *   - their payee is one, once what a bank wraps it in is taken off (`bankless`): the description, or as the bank wrote
 *     it, or as a person named it;
 *   - nothing either holds tells them apart: a bank's reference, what was available after, or the balance after, held by
 *     both and different, makes them two (ALMOKHTBR, EGP 1,750 twice on 21 October, is two charges, since the limit
 *     left fell by the charge each time);
 *   - and something says two roads wrote them: one holds what the other does not, the same reference, or two different
 *     descriptions. Two lines alike in every word with nothing else said are two coffees on one day, and stay two.
 * Each line is paired once, the nearest days first, so three lines are never two pairs.
 *
 * ONE QUESTION FOR ALL OF THEM, NEVER DELETED. "These 4 lines look imported twice. Keep one of each?" Yes archives the
 * second line of each pair, which takes it out of every figure and keeps it, and moves to the line kept anything the
 * archived one held that it does not (a category, who it was paid to, a note, a project, the bank's words). No leaves
 * every line as it is. Nothing is written until he answers, and a line changed since is left (the gate's own rule).
 *
 * WHICH OF TWO IS KEPT: the one something else leans on (a bill it settles, the other half of a move, its split, the
 * repeating line it was posted for), else the one holding more of what a person set, else more of what the bank said,
 * else the older. Two that are both leaned on are not asked about: which to let go is not a guess.
 *
 * ONE QUESTION A SET OF PAIRS. Its cause is the pairs' own numbers, so a night that finds it waiting or answered asks
 * nothing new; a new pair is a new set, asked once.
 *
 * NOTHING OUTSIDE THIS FILE IS READ BY `run`: its source is `bankless`, `twiceOf`, `twiceAsk` and `run` together
 * (`LEDGER_TWICE_SCRIPT.source`), and a sandbox runs that text alone.
 */

/**
 * A description with what a bank wraps a payee in taken off, for comparison and nothing else: the day stamp a statement
 * line starts with (`05OCT26`), the words before the payee (`IPN outward transfer to`), a processor before its star
 * (`PAYMOB*`), the word `Purchase` at the end, accents, case and every mark. Never empty. As `bankless` in
 * packages/extract, which the doors use.
 */
export function bankless(text) {
  const LEADS = ['ipn outward transfer to', 'ipn inward transfer from', 'ipn purchase to', 'ipn transfer to', 'ipn transfer from', 'card purchase', 'pos purchase', 'purchase at', 'payment to', 'purchase'];
  const folded = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
  let words = folded.replace(/[^\p{L}\p{N}*]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (words.length > 1 && /^\d{1,2}[a-z]{3}(?:\d{2}|\d{4})$/u.test(words[0])) words = words.slice(1);
  for (const lead of LEADS) {
    const said = lead.split(' ');
    if (words.length > said.length && said.every((w, i) => words[i] === w)) {
      words = words.slice(said.length);
      break;
    }
  }
  let said = words.join(' ');
  const star = said.indexOf('*');
  if (star > 0 && star <= 14 && said.slice(0, star).trim().split(' ').length <= 2 && said.slice(star + 1).trim() !== '') said = said.slice(star + 1);
  words = said.replace(/\*/gu, ' ').split(' ').filter(Boolean);
  if (words.length > 1 && words[words.length - 1] === 'purchase') words = words.slice(0, -1);
  return words.join(' ') || folded;
}

/**
 * The pairs of lines that look like one payment written twice, each `{ keep, other, gap }`, from Ledger lines as a
 * script reads them (`{ id, spoken, seq, version, fields }`). Pure, so a test reads it.
 */
export function twiceOf(rows) {
  const DAYS = 3;
  const PREFIX = 12;
  /* WHAT A BANK SAYS ABOUT ONE PAYMENT AND NO OTHER: held by both and different, they are two. */
  const SAID = ['hsbc_reference', 'mercury_id', 'available', 'balance_after'];
  /* WHAT A PERSON SETS ON A LINE, counted to choose the one kept. */
  const SET = ['category', 'party', 'payee', 'note', 'thing'];
  /* WHAT SOMETHING ELSE LEANS ON. */
  const LEANS = ['settles', 'parts', 'posted_for', '_pair'];
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const dayOf = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) : null);
  const has = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const leans = (r) => LEANS.some((f) => has(r.fields[f])) || r.fields.transfer === true;
  const names = (r) => [r.fields.what, r.fields.counterparty_text, r.fields.payee].filter((t) => typeof t === 'string' && t.trim() !== '').map(bankless);
  const onePayee = (a, b) => names(a).some((x) => names(b).some((y) => x.slice(0, PREFIX) === y.slice(0, PREFIX)));

  const groups = new Map();
  for (const r of rows) {
    const f = r.fields ?? {};
    const m = moneyOf(f.amount);
    const day = dayOf(f.on);
    if (!m || day === null || typeof f.account !== 'string' || f.state === 'void') continue;
    const key = `${f.account}|${f.direction}|${m.currency}|${Math.abs(m.amount)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...r, day });
  }

  const found = [];
  for (const lines of groups.values()) {
    if (lines.length < 2) continue;
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const [a, b] = [lines[i], lines[j]];
        const gap = Math.abs(a.day - b.day) / 86_400_000;
        if (gap > DAYS || !onePayee(a, b)) continue;
        let apart = false;
        let agreed = false;
        let oneSided = false;
        for (const f of SAID) {
          const [x, y] = [a.fields[f], b.fields[f]];
          if (has(x) && has(y)) {
            if (same(x, y)) agreed = true;
            else apart = true;
          } else if (has(x) || has(y)) oneSided = true;
        }
        if (apart) continue;
        const worded = String(a.fields.what ?? '').trim() !== String(b.fields.what ?? '').trim();
        if (!agreed && !oneSided && !worded) continue;
        if (leans(a) && leans(b)) continue;
        found.push({ a, b, gap, sure: agreed ? 0 : 1 });
      }
  }

  /* ONE TO ONE, the surest and nearest pairs first. */
  found.sort((x, y) => x.sure - y.sure || x.gap - y.gap || Math.min(x.a.seq, x.b.seq) - Math.min(y.a.seq, y.b.seq));
  const used = new Set();
  const pairs = [];
  for (const p of found) {
    if (used.has(p.a.id) || used.has(p.b.id)) continue;
    used.add(p.a.id);
    used.add(p.b.id);
    const score = (r) => [leans(r) ? 1 : 0, SET.filter((f) => has(r.fields[f])).length, SAID.filter((f) => has(r.fields[f])).length, -r.seq];
    const [sa, sb] = [score(p.a), score(p.b)];
    const first = sa.findIndex((v, k) => v !== sb[k]);
    const aWins = first === -1 ? true : sa[first] > sb[first];
    const { day: _da, ...keep } = aWins ? p.a : p.b;
    const { day: _db, ...other } = aWins ? p.b : p.a;
    pairs.push({ keep, other, gap: p.gap });
  }
  return pairs.sort((x, y) => x.keep.seq - y.keep.seq);
}

/**
 * The one question about the pairs, or `null` for none. Yes moves to each kept line what its twin held that it does
 * not, then archives the twin; no writes nothing. `now` is the instant the archive is stamped with.
 */
export function twiceAsk(pairs, now) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const MOST = 20;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* WHAT MOVES TO THE LINE KEPT, where it holds none: what a person set and what the bank said. A category moves with
     the filing rule that filed it, and only with it. */
  const CARRY = ['category', 'party', 'payee', 'note', 'thing', 'book', 'counterparty_text', 'hsbc_reference', 'available', 'balance_after'];
  const has = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  const asked = pairs.slice(0, MOST);
  const nameOf = (r) => {
    const t = [r.fields.payee, r.fields.what].find((x) => typeof x === 'string' && x.trim() !== '');
    return t === undefined ? 'A line' : t.trim();
  };
  const dayWords = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');
  const said = asked.map((p) => [nameOf(p.keep), dayWords(p.keep.fields.on)].filter(Boolean).join(', '));

  const patches = [];
  for (const p of asked) {
    const moved = {};
    for (const f of CARRY) if (!has(p.keep.fields[f]) && has(p.other.fields[f])) moved[f] = p.other.fields[f];
    if ('category' in moved && has(p.other.fields.filed_by) && !has(p.keep.fields.filed_by)) moved.filed_by = p.other.fields.filed_by;
    if (Object.keys(moved).length > 0) patches.push({ id: p.keep.spoken, version: p.keep.version, fields: moved });
    patches.push({ id: p.other.spoken, version: p.other.version, fields: { deleted_at: now } });
  }

  const n = asked.length;
  const one = asked[0];
  const question =
    n === 1
      ? `${nameOf(one.keep)}${dayWords(one.keep.fields.on) === '' ? '' : ` on ${dayWords(one.keep.fields.on)}`} looks imported twice. Keep one?`
      : `These ${n} lines look imported twice. Keep one of each?`;
  return {
    cause: `money.ledger-twice:${asked.map((p) => `${p.keep.seq}.${p.other.seq}`).join('_')}`,
    question,
    about: aboutOf(said),
    options: [
      {
        id: 'keep-one',
        label: n === 1 ? 'Keep one' : 'Keep one of each',
        because:
          n === 1
            ? 'The copy is archived, so it leaves every total and can be brought back. Anything set on it moves to the line kept.'
            : 'The second copy of each is archived, so it leaves every total and can be brought back. Anything set on a copy moves to the line kept.',
        patches,
      },
      { id: 'all-real', label: n === 1 ? 'Both are real' : 'They are all real', because: 'Every line stays as it is, and this is not asked again.' },
    ],
  };

  /* ONE `about`, AS MANY NAMES AS FIT THE GATE'S 80 BYTES and the rest counted, as `last-day.js` writes it. */
  function aboutOf(names) {
    const MOST_BYTES = 80;
    const bytes = (s) => {
      let k = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        k += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      }
      return k;
    };
    const more = (k) => (k < names.length ? ` and ${names.length - k} more` : '');
    for (let k = names.length; k >= 1; k -= 1) {
      const line = names.slice(0, k).join('; ') + more(k);
      if (bytes(line) <= MOST_BYTES) return line;
    }
    let first = '';
    for (const ch of names[0]) {
      if (bytes(first + ch + '…' + more(1)) > MOST_BYTES) break;
      first += ch;
    }
    return first.trimEnd() + '…' + more(1);
  }
}

/**
 * Once a day: read the Ledger's last four months, a page at a time in row number order, and ask about the pairs.
 */
export default async function run(ctx) {
  const PAGE = 50;
  const BACK = 120;
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const since = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))) - BACK * 86_400_000).toISOString().slice(0, 10);
  const rows = [];
  let after = null;
  for (;;) {
    const tests = [{ field: 'on', gte: since }, ...(after === null ? [] : [{ field: 'seq', gt: after }])];
    const page = await ctx.record.list('transactions', { all: tests }, { order: 'seq' });
    for (const r of page) rows.push({ id: r.id, spoken: `transactions#${r.seq}`, seq: r.seq, version: r.version, fields: r.fields });
    if (page.length < PAGE) break;
    after = Math.max(...page.map((r) => r.seq));
  }
  const pairs = twiceOf(rows);
  const ask = twiceAsk(pairs, String(ctx.now()));
  if (ask === null) return null;
  ctx.log(pairs.length === 1 ? 'Asked about one line that looks imported twice.' : `Asked once about ${pairs.length} lines that look imported twice.`);
  return { pairs: pairs.length, ask };
}

/**
 * The script as Money's pack document writes it: no egress, no keys, reading and writing the Ledger, once a day. The
 * writes are the answer's (an archive and a move a pair), so one question of twenty pairs asks for forty.
 */
export const LEDGER_TWICE_SCRIPT = {
  script: 'ledger_twice',
  title: 'Find lines in the Ledger written twice',
  pack: 'money-core',
  runs: { every: '1d' },
  egress: [],
  keys: [],
  reads: ['transactions'],
  writes: ['transactions'],
  limits: { writes: 100 },
  source: `${bankless.toString()}\n${twiceOf.toString()}\n${twiceAsk.toString()}\nexport default ${run.toString()}`,
};
