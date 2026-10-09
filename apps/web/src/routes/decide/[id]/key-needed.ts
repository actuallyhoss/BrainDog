/**
 * Keeping one key an arrangement needs, from its sitting page (`KeyNeeded.svelte`, REC-A07).
 *
 * THE TYPED KEY OUTLIVES A REFUSAL; THE PASSPHRASE NEVER DOES. The key used to be emptied before the request went out,
 * so a vault behind a passphrase, which refuses the first try for want of one and only then grows the field, threw the
 * key away with it: the person typed the passphrase and had nothing left to send (audit 40-42, finding 8). Now the
 * passphrase goes with the one request and is emptied before it leaves, and the key is emptied only once the record
 * has kept it, as the Keys screen's sheet does (`vault/+page.svelte`, `saveKey`).
 *
 * Kept apart from the component so a test can hold the order without a browser.
 */

import type { createClient } from '@braindog/client';

import { copy } from '../../../lib/copy.ts';
import { wantsPassphrase } from '../../../lib/record/vault.ts';
import type { Need } from './arranged.ts';

export type KeyClient = Pick<ReturnType<typeof createClient>, 'putKey'>;

/** What the person has typed: the key, what it opens when the arrangement could not say, and the vault's passphrase. */
export type KeyForm = { value: string; opens: string; passphrase: string; locked: boolean };

/** What one press came to: kept, or the record's sentence. */
export type Kept = { ok: true } | { ok: false; said: string };

export const blankForm = (): KeyForm => ({ value: '', opens: '', passphrase: '', locked: false });

/**
 * A NEW KEY SAYS WHAT IT OPENS or the record refuses it, so when the arrangement could not say (a script calling several
 * hosts, a call with none declared) the person is asked. A key held only for a person keeps its own.
 */
export const asksOpens = (need: Need): boolean => need.opens === '' && need.held !== 'person';

/** Whether the form holds enough to send: a key, what it opens when that is asked, and the passphrase once it is asked. */
export const ready = (need: Need, form: KeyForm): boolean =>
  form.value !== '' && !(asksOpens(need) && form.opens.trim() === '') && !(form.locked && form.passphrase === '');

/**
 * Sends the typed key once, sealed for scheduled runs, and changes `form` as the answer says: the passphrase is emptied
 * before the request, the key only after the record kept it, and a refusal for want of a passphrase asks for one.
 * `form` is the component's own state, changed in place.
 */
export async function keep(need: Need, form: KeyForm, client: KeyClient): Promise<Kept> {
  const ask = asksOpens(need);
  const args = {
    label: need.label,
    value: form.value,
    /* WHAT IT OPENS is the arrangement's when it said one (`needsOf` gives one host or nothing), else the person's. */
    ...(need.opens !== '' ? { opens: need.opens } : ask ? { opens: form.opens.trim() } : {}),
    sealed_under: 'connector' as const,
    ...(form.locked && form.passphrase !== '' ? { passphrase: form.passphrase } : {}),
  };
  /* THE PASSPHRASE GOES WITH THIS ONE REQUEST and is emptied whatever comes back (`12 §6`). */
  form.passphrase = '';
  const out = await client.putKey(args);
  if (!out.ok) {
    /* A VAULT BEHIND A PASSPHRASE says so on the first try, and the field for it appears; the key stays typed. */
    if (wantsPassphrase(out)) form.locked = true;
    return { ok: false, said: 'refusal' in out ? out.refusal.fix : copy.writeRaced };
  }
  form.value = '';
  form.opens = '';
  return { ok: true };
}
