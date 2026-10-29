/**
 * The two decisions of a repeating line that posts itself (`../post-due.ts`), pure and written into its scripts whole:
 * whether a line may be posted to an account, and which posted line a real charge stands for.
 */

/** Whether a line may be posted to this account, and if not, why, in words. */
export function postable(account) {
  if (!account) return { ok: false, why: 'it names no account' };
  const f = account.fields;
  const name = typeof f.name === 'string' && f.name.trim() !== '' ? f.name.trim() : 'its account';
  const filled = (v) => v !== undefined && v !== null && v !== '';
  if (f.state === 'closed') return { ok: false, why: `${name} is closed` };
  if (f.no_feed === true) return { ok: true };
  /* AN ACCOUNT A FEED KEEPS SAYS SO HERE, in "No bank feed" set to no: every feed marks the accounts it writes, so this
     never has to know a feed's own fields (Mercury 1.3.0, Stripe 1.5.0). */
  if (f.no_feed === false) return { ok: false, why: `a bank feed keeps ${name}, so the bank writes it` };
  if (filled(f.last4)) return { ok: false, why: `bank messages may write ${name}; mark it "No bank feed" to post to it` };
  return { ok: true };
}

/**
 * The posted line a real charge stands for, or why none: `posted` are the cleared lines the record posted, on the same
 * account and the same way. The same money is the same currency, no more than 2% off, within ten days.
 */
export function postedTwin(charge, posted) {
  const money = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const paid = money(charge.fields.amount);
  /* QUIET WHERE NOTHING COULD BE THIS CHARGE: every ordinary cleared payment asks, and a note on each was noise. */
  if (!paid || typeof charge.fields.on !== 'string') return { none: 'The charge has no amount or no day.', quiet: true };
  const at = (d) => (typeof d === 'string' ? Date.parse(`${d}T00:00:00Z`) : NaN);
  const near = posted.filter((p) => {
    const m = money(p.fields.amount);
    if (p.id === charge.id || !m || m.currency !== paid.currency) return false;
    if (Math.abs(paid.amount - m.amount) * 100 > Math.abs(m.amount) * 2) return false;
    return Math.abs(at(p.fields.on) - at(charge.fields.on)) / 86400000 <= 10;
  });
  if (near.length === 0) return { none: 'No line posted for you is the same money.', quiet: true };
  if (near.length > 1) return { none: `${near.length} lines posted for you could each be this charge, so none was replaced.` };
  return { twin: near[0] };
}
