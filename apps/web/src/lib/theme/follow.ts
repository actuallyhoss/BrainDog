/**
 * The person's look, as the record keeps it, put on the page once `boot` answers (`35`, "density, theme and accent").
 *
 * THE COOKIE PAINTS FIRST AND THE RECORD WINS. `app.html` reads `bd_pref` before first paint, so a reload on the same
 * device never flashes the wrong scheme; then `boot` answers `me.prefs`, and each `look.*` key it holds is put on the page
 * and written back over the cookie (`pref.adopt`, `accent.adopt`). A new device paints the house look for one answer and
 * is the person's from then on.
 *
 * ADOPTED ONCE PER TAB, for `nav-prefs.svelte.ts`'s reason: `boot` is kept for the tab, and the root layout's load runs
 * on every navigation, so adopting each time would put back the look as it stood when the tab opened, over whatever was
 * picked in Settings since.
 *
 * CALLED FROM `draw.ts`, which the root layout's load already hands the whole `boot` answer to, so the look a person
 * chose and the look the record installed arrive on the page together.
 */

import * as accent from '../accent.ts';
import * as pref from '../pref.ts';

/** `me.prefs` out of a `boot` answer, or `undefined` when nobody is signed in to a record (a token, a refusal). */
export function prefsOf(boot: unknown): Record<string, unknown> | undefined {
  const me = boot !== null && typeof boot === 'object' ? (boot as { me?: unknown }).me : undefined;
  const prefs = me !== null && typeof me === 'object' ? (me as { prefs?: unknown }).prefs : undefined;
  return prefs !== null && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : undefined;
}

/**
 * The record's `setPref`, through the client, to the record this page is in. THE ADDRESS IS READ WHEN A CHANGE IS SENT,
 * not when `boot` answered: the layout's load runs for the address being opened, before `location` moves to it.
 */
const sendToRecord: pref.Send = async (key, value) => {
  const [{ createClient }, { apiBase }] = await Promise.all([import('@braindog/client'), import('../at.ts')]);
  /* THE VALUE IS CAST, as `nav-prefs.svelte.ts` casts it: each key's words are checked by the record, which refuses a
     wrong one in that key's own sentence, and the callers here only ever send the words their key takes. */
  const out = await createClient({ base: apiBase() })
    .setPref(key, value as never)
    .catch(() => null);
  if (out?.ok) return { from: 'kept' };
  return out && 'refusal' in out ? { from: 'refused', fix: out.refusal.fix } : { from: 'device' };
};

let adopted = false;

/** Adopt the person's look from a `boot` answer, once, and send their changes to the record from now on. */
export function follow(boot: unknown, send: pref.Send = sendToRecord): void {
  const prefs = prefsOf(boot);
  if (prefs === undefined) return;
  pref.follow(send);
  if (adopted) return;
  adopted = true;
  pref.adopt(prefs);
  accent.adopt(prefs['look.accent']);
}
