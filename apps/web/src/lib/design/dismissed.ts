/**
 * Whether the design agent's navigation recommendation has already been dismissed, and terminally.
 *
 * `19 §3`: the holding pen's rule is "never applied, one click to accept, Dismiss terminal". A
 * dismissal must survive a reload or it is not terminal, it is a snooze. But this recommendation is
 * not a row in the record: there is no `page` declaration and no `suggestion` register entry to mark
 * dismissed the way a proposed page is, and `50 §10` already carries `navShape` itself as a named
 * deviation in the device cookie rather than the record, for the same reason, "there is no table
 * among 30 §1's thirty-one that could hold a preference and no `setPref` in 45 §5". Adding a new
 * `Pref` key here would also mean a new case in `tools/gates/prefs.mjs` proving it moves the DOM,
 * which a dismissal flag does not: it changes what is NOT drawn.
 *
 * SO THIS IS THE SAME DEVIATION, kept in `localStorage` rather than the `bd_pref` cookie because it
 * never needs to be read before first paint the way scheme or density do. It is keyed by the
 * recommendation's own shape and reason, not by a boolean, so it is honest in both directions: the
 * exact recommendation shown is the one that stays gone, and a record that changes enough to earn a
 * genuinely different recommendation is allowed to say so again rather than staying silent forever
 * about a record nobody who saw the first recommendation has seen.
 */

const KEY = 'bd_design_dismissed';

/** One recommendation, reduced to the string that identifies it as "the same one". */
export const signatureOf = (rec: { shape: string; reason: string }): string => `${rec.shape}:${rec.reason}`;

function readAll(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [record, sig] of Object.entries(parsed as Record<string, unknown>)) if (typeof sig === 'string') out[record] = sig;
    return out;
  } catch {
    /* A dismissal store this build cannot read is not a crash. Reading nothing means the
       recommendation is offered again, which is the safe direction to fail in. */
    return {};
  }
}

/** The signature of the recommendation this record last dismissed, or `null`. */
export function dismissedFor(record: string): string | null {
  return readAll()[record] ?? null;
}

/** Mark one recommendation dismissed for this record. Terminal until a different one is offered. */
export function dismiss(record: string, signature: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = readAll();
    all[record] = signature;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Worst case the recommendation reappears next visit, which is the failure a stray write should
       degrade to rather than an error the settings screen would have to catch. */
  }
}
