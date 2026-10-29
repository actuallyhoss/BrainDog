/**
 * Splits: what one shared cost leaves with each side, and where each person stands once every cost and every
 * settle-up is counted.
 *
 * STARTED TWO WAYS, and it tells them apart by the list of the row it is handed.
 *
 * A LEDGER LINE MARKED "SHARED WITH". Money out is a cost you paid and share; money in is that person settling up
 * with you. The line's split is written, or brought up to date when the line changes: the same words, day and amount,
 * your share (half unless the line's "My share" says), and a link back to the line. Taking the name off the line leaves its split
 * as it was, for you to remove.
 *
 * A SPLIT. What it leaves to settle is worked out: of a cost you paid, their share (the amount less yours), which comes
 * back to you; of a cost they paid, your share, which goes back to them; of a settle-up, the whole amount, back to you
 * when you handed it over and back to them when they did. Then everything still open with that person, in that currency, is added up
 * and written on their line in Where each person stands. When it comes to nothing they are square: their open rows in
 * that currency are marked settled, and their line says Square.
 *
 * NAMES ARE MATCHED AS WRITTEN, with spaces at either end and capitals aside, so "Sam" and "sam " are one person.
 * Open rows are read fifty at a time, at most twenty pages, and the people's lines one page of fifty.
 *
 * IT WRITES THE PARTS, THE WAY, THE STATE AND THE PERSON'S LINE, none of which the automations watch, so it never
 * starts itself again; the split it writes from a Ledger line starts it once more, for that split.
 */

const money = (m) => m && typeof m === 'object' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string';
const key = (s) => String(s || '').trim().toLowerCase();
const shareOf = (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : 50);

/** Every open split with one person, in pages of fifty read by `seq`. */
async function openWith(ctx, name) {
  const rows = [];
  let above = 0;
  for (let i = 0; i < 20; i++) {
    const page = await ctx.record.list('splits', { all: [{ field: 'state', is: 'open' }, { field: 'seq', gt: above }] }, { order: 'seq' });
    for (const r of page) if (key(r.fields.with) === key(name)) rows.push(r);
    if (page.length < 50) break;
    above = Math.max(...page.map((r) => r.seq));
  }
  return rows;
}

/** What a split leaves to settle, and which way it goes. */
export function partOf(f) {
  if (!money(f.amount)) return null;
  const them = f.paid_by === 'them';
  const share = shareOf(f.my_share);
  const amount = f.kind === 'settle' ? f.amount.amount : Math.round((f.amount.amount * (them ? share : 100 - share)) / 100);
  return { part: { amount, currency: f.amount.currency }, way: them ? 'to_them' : 'to_me' };
}

/** Where one person stands in one currency: positive comes back to you, negative goes back to them. */
export function standOf(rows, currency) {
  let net = 0;
  let since = null;
  let open = 0;
  for (const r of rows) {
    const p = partOf(r.fields);
    if (!p || p.part.currency !== currency) continue;
    net += p.way === 'to_me' ? p.part.amount : -p.part.amount;
    open += 1;
    const on = typeof r.fields.on === 'string' ? r.fields.on.slice(0, 10) : null;
    if (on && (since === null || on < since)) since = on;
  }
  return { net, since, open };
}

async function fromLine(ctx, line) {
  const f = line.fields;
  const name = String(f.shared_with || '').trim();
  if (name === '' || !money(f.amount) || f.state === 'void') return;
  const settle = f.direction === 'in';
  const fields = {
    what: String(f.what || 'Shared'),
    on: typeof f.on === 'string' ? f.on.slice(0, 10) : ctx.today(),
    with: name,
    kind: settle ? 'settle' : 'cost',
    paid_by: settle ? 'them' : 'me',
    amount: f.amount,
    my_share: shareOf(f.split_share),
    line: line.id,
  };
  const held = await ctx.record.list('splits', { all: [{ field: 'line', is: line.id }] });
  if (held.length === 0) {
    ctx.write('splits', { ...fields, state: 'open' });
    ctx.log('Wrote the split of ' + fields.what + ' with ' + name + '.');
    return;
  }
  const s = held[0];
  const g = s.fields;
  const same = g.what === fields.what && g.on === fields.on && key(g.with) === key(name) && g.kind === fields.kind && g.paid_by === fields.paid_by && money(g.amount) && g.amount.amount === fields.amount.amount && g.amount.currency === fields.amount.currency && shareOf(g.my_share) === fields.my_share;
  if (!same) ctx.update('splits#' + s.seq, fields, s.version);
}

async function fromSplit(ctx, split) {
  const f = split.fields;
  const p = partOf(f);
  if (!p) return;
  const name = String(f.with || '').trim();
  if (name === '') return;
  const patch = {};
  if (!money(f.part) || f.part.amount !== p.part.amount || f.part.currency !== p.part.currency || f.way !== p.way) {
    patch.part = p.part;
    patch.way = p.way;
  }
  const rows = await openWith(ctx, name);
  if (f.state === 'open' && !rows.some((r) => r.id === split.id)) rows.push(split);
  const currency = p.part.currency;
  const stand = standOf(rows, currency);
  /* EVERY PERSON'S LINE IS READ AND MATCHED HERE, because the record compares a name with its capitals. */
  const people = (await ctx.record.list('split_people', null, { order: 'seq' })).filter((r) => key(r.fields.name) === key(name));
  const mine = people.find((r) => money(r.fields.stands) && r.fields.stands.currency === currency) || people.find((r) => !money(r.fields.stands));
  const line = {
    name: mine ? mine.fields.name : name,
    stands: { amount: Math.abs(stand.net), currency },
    way: stand.net > 0 ? 'to_me' : stand.net < 0 ? 'to_them' : 'square',
    open: stand.net === 0 ? 0 : stand.open,
    since: stand.net === 0 ? null : stand.since,
  };
  if (mine) ctx.update('split_people#' + mine.seq, line, mine.version);
  else ctx.write('split_people', line);
  if (stand.net === 0 && rows.length > 0) {
    for (const r of rows) {
      const q = partOf(r.fields);
      if (q && q.part.currency === currency && r.id !== split.id) ctx.update('splits#' + r.seq, { state: 'settled' }, r.version);
    }
    if (f.state === 'open') patch.state = 'settled';
    ctx.log(name + ' and you are square in ' + currency + '.');
  }
  if (Object.keys(patch).length > 0) ctx.update('splits#' + split.seq, patch, split.version);
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (!id) return;
  const row = await ctx.record.get(String(id));
  if (!row) return;
  if (row.register === 'transactions') return fromLine(ctx, row);
  if (row.register === 'splits') return fromSplit(ctx, row);
}
