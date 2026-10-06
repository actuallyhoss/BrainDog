/**
 * The person's look, as the record keeps it, put on the page once `boot` answers (`35`, "density, theme and accent").
 *
 * THE COOKIE PAINTS FIRST AND THE RECORD WINS. `app.html` reads `bd_pref` before first paint, so a reload on the same
 * device never flashes the wrong scheme; then `boot` answers `me.prefs`, and each `look.*` key it holds is put on the page
 * and written back over the cookie (`pref.adopt`, `accent.adopt`). A new device paints the house look for one answer and
 * is the person's from then on.
 *
 * ADOPTED ONCE PER PERSON AND RECORD IN A TAB, for `nav-prefs.svelte.ts`'s reason: `boot` is kept for the tab, and the
 * root layout's load runs on every navigation, so adopting each time would put back the look as it stood when the tab
 * opened, over whatever was picked in Settings since. A tab that moves to another record, or is signed in to as
 * somebody else, adopts again, because the look is each record's and the cookie is stamped with whose it holds.
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

/** The person a `boot` answer is for, as the cookie's `who` is stamped, or `undefined` when it names nobody. */
export function personOf(boot: unknown): string | undefined {
  const me = boot !== null && typeof boot === 'object' ? (boot as { me?: unknown }).me : undefined;
  const person = me !== null && typeof me === 'object' ? (me as { person?: unknown }).person : undefined;
  return typeof person === 'string' && person !== '' ? person : undefined;
}

/**
 * Which adoption a `boot` answer is: the record it came from and the person in it. The slug is `Shell.index.slug`'s,
 * empty for a record with no name, so a screen handing over `{ me, record: { slug } }` from the shell names the same
 * adoption the layout's whole answer does. `undefined` when the answer names nobody.
 */
export function whoOf(boot: unknown): string | undefined {
  const person = personOf(boot);
  if (person === undefined) return undefined;
  const record = boot !== null && typeof boot === 'object' ? (boot as { record?: unknown }).record : undefined;
  const slug = record !== null && typeof record === 'object' ? (record as { slug?: unknown }).slug : undefined;
  return `${typeof slug === 'string' ? slug : ''}/${person}`;
}

/**
 * The look a cookie from before the stamp holds, as the record's words, for the keys this record has no word for.
 *
 * LOOKS CHOSEN BEFORE THE RECORD KEPT THEM WERE NEVER SENT, and nobody will pick them again to send them. So the first
 * boot that stamps such a cookie sends each one ONCE, and only where the record answers nothing: a word the record holds
 * was chosen since, on some device, and is newer than anything an unstamped cookie can say. A colour no swatch wears has
 * no word on the record and stays on the device.
 */
export function unstampedOf(held: pref.Pref, prefs: Record<string, unknown>): Partial<Record<pref.LookKey, string | boolean>> {
  const out: Partial<Record<pref.LookKey, string | boolean>> = {};
  const open = (key: pref.LookKey): boolean => prefs[key] === undefined;
  if (held.scheme !== undefined && open('look.scheme')) out['look.scheme'] = held.scheme;
  if (held.text !== undefined && open('look.size')) out['look.size'] = held.text;
  if (held.density !== undefined && open('look.density')) out['look.density'] = held.density;
  if (held.contrast === true && open('look.contrast')) out['look.contrast'] = true;
  const swatch = held.theme === undefined ? undefined : accent.nameOf(held.theme);
  if (swatch !== undefined && swatch !== 'House' && open('look.accent')) out['look.accent'] = swatch;
  return out;
}

/* WHOSE LOOK THIS TAB LAST ADOPTED. Once per person and record, not once per tab: the same `boot` kept for the tab must
   not put back the look as it opened, and a tab that moves to another record, or is signed in to as somebody else, is
   a new person's first boot here. */
let adopted: string | null = null;

/**
 * Adopt the person's look from a `boot` answer, once for each person and record, and send their changes to the record
 * from now on.
 *
 * IN THIS ORDER, each step for a reason the audit of batches 11 to 13 found:
 * - A cookie stamped for somebody else is that person's look, so it is taken off before anything is adopted, and this
 *   person starts from the house look and their own record's answer.
 * - THE STAMP IS THE PERSON, NOT THE RECORD. The same person opening another of their records keeps the look on screen
 *   and adopts that record's words over it: taking it off at every switch painted the house look first and then the
 *   record's, a flash on every move, and left their scheme behind in any record that had never been told one.
 * - A cookie with no stamp is owed to the record once, where the record has no word of its own (`unstampedOf`).
 * - What an earlier boot could not send is sent again (`pref.resend`), and the adopt then leaves those keys alone, so a
 *   choice made offline survives the reload instead of losing to the record's older word.
 */
export function follow(boot: unknown, send: pref.Send = sendToRecord): void {
  const prefs = prefsOf(boot);
  if (prefs === undefined) return;
  const who = whoOf(boot);
  const person = personOf(boot);
  if (adopted === (who ?? '')) {
    pref.follow(send);
    return;
  }
  /* A NEW PERSON OR RECORD IN THIS TAB HAS REFUSED NOTHING YET: the last one's host may not be this one's. */
  pref.follow(null);
  pref.follow(send);
  adopted = who ?? '';

  /* AN ANSWER THAT NAMES NOBODY STAMPS NOTHING and takes nothing off: it cannot say whose the cookie is. */
  if (person !== undefined) {
    const held = pref.read();
    if (held.who !== undefined && held.who !== person) {
      pref.forget();
      accent.adopt('House');
    } else if (held.who === undefined) {
      const owed = unstampedOf(held, prefs);
      if (Object.keys(owed).length > 0) pref.write({ unsent: { ...owed, ...held.unsent } });
    }
    pref.write({ who: person });
  }

  pref.resend();
  pref.adopt(prefs);
  if (!Object.hasOwn(pref.unsent(), 'look.accent')) accent.adopt(prefs['look.accent']);
}
