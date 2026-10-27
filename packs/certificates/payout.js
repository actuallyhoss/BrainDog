/**
 * Ask to move a certificate's next payout on when its payout is booked. Money in lands on the Ledger, and the certificate
 * still says the payout is due, so Cash ahead walks it a second time and Coming up reads it late.
 *
 * WHAT IT LOOKS FOR. Handed a Ledger line that came in and is cleared, `payoutOf` keeps the live certificates whose
 * payout is that amount in that currency, that pay into that account (or name none), and whose next payout is within
 * five days of the line. EXACTLY ONE IS THE CERTIFICATE; none or several and nothing is asked.
 *
 * IT ASKS, AND WRITES NOTHING BY ITSELF. One question on Decide, "Pay-out of Fenwick Bank is booked. Move its next
 * payout on to 14 December?", whose first answer carries the one write: `next_payout`, one cycle on, the day the host's
 * `ctx.cycle` walks (Cash ahead's own step). When that is past the day it matures, the answer marks it matured instead.
 * "Leave it" writes nothing.
 */

/** WHAT THE WALK READS OF A CERTIFICATE TO STEP IT, Cash ahead's own leg, written into the script as data. */
const LEG = { on: 'next_payout', every: { field: 'every', months: { monthly: 1, quarterly: 3, yearly: 12 } }, ends: 'ends' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

const words = (d) => {
  const m = isDay(d) ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] : String(d);
};

const apart = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000;

export function payoutOf(line, certificates) {
  const f = line.fields;
  if (f.direction !== 'in' || f.state !== 'cleared' || !f.amount || !isDay(f.on)) return { nothing: 'The line is not money in that has cleared, so no certificate was looked for.' };
  const found = certificates.filter((c) => {
    const g = c.fields;
    if (g.state !== 'live' || !g.payout || g.payout.amount !== f.amount.amount || g.payout.currency !== f.amount.currency) return false;
    if (g.account && g.account !== f.account) return false;
    return isDay(g.next_payout) && apart(g.next_payout, f.on) <= 5;
  });
  if (found.length !== 1) return { nothing: found.length === 0 ? 'No certificate pays this amount about now, so nothing was asked.' : 'More than one certificate pays this amount about now, so nothing was asked.' };
  return { certificate: found[0] };
}

export function moveOn(certificate, next) {
  const g = certificate.fields;
  const name = String(g.issuer ?? '').trim() || 'The certificate';
  if (!(isDay(next) && isDay(g.next_payout) && next > g.next_payout)) return { nothing: name + ' has no later payout day to move to, so nothing was asked.' };
  const matured = isDay(g.ends) && next > g.ends;
  return {
    ask: {
      cause: 'certificates.payout.' + certificate.spoken + ':' + g.next_payout,
      question: matured ? 'Its last payout is booked for ' + name + '. Mark the certificate matured?' : 'Payout of ' + name + ' is booked. Move its next payout on to ' + words(next) + '?',
      about: certificate.spoken,
      options: [
        matured
          ? { id: 'move', label: 'Mark it matured', because: 'It is no longer walked, so Cash ahead stops counting its payouts.', patches: [{ id: certificate.spoken, version: certificate.version, fields: { state: 'matured' } }] }
          : { id: 'move', label: 'Move it on', because: 'The next payout becomes ' + words(next) + ', so it is not read late or counted twice.', patches: [{ id: certificate.spoken, version: certificate.version, fields: { next_payout: next } }] },
        { id: 'leave', label: 'Leave it', because: 'The certificate keeps ' + words(g.next_payout) + ' as its next payout.' },
      ],
    },
  };
}

export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = typeof input.line === 'string' ? input.line : '';
  if (!/^transactions#\d+$/.test(said) && !/^[0-9A-Za-z_-]+$/.test(said)) {
    ctx.log('The script was handed no line, so no certificate was looked for.');
    return null;
  }
  const row = await ctx.record.get(said);
  if (!row || row.register !== 'transactions' || !Number.isSafeInteger(row.seq)) return null;
  const rows = await ctx.record.list('certificates', { all: [{ field: 'state', is: 'live' }] });
  const certificates = rows.map((r) => ({ id: r.id, spoken: 'certificates#' + r.seq, version: r.version, fields: r.fields }));
  const found = payoutOf({ fields: row.fields }, certificates);
  if (found.nothing) {
    ctx.log(found.nothing);
    return null;
  }
  if (typeof ctx.cycle !== 'function') {
    ctx.log('The host hands no next day, so nothing was asked.');
    return null;
  }
  let next;
  try {
    next = await ctx.cycle(found.certificate.fields.next_payout, { leg: LEG, fields: found.certificate.fields });
  } catch {
    next = undefined;
  }
  const out = moveOn(found.certificate, next);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  return { ask: out.ask };
}
