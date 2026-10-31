/**
 * WHERE THE PUBLISHER KEY IS KEPT IN THIS BROWSER, named once (`author-key.ts` reads them from here).
 *
 * NOTHING DROPS IT AT SIGN-OUT. His call of 23 Oct was that an explicit sign-out drops the key; the merge reversed it,
 * because the store takes an update to an add-on only when it is signed with the key that signed it first, so a key
 * dropped at sign-out would leave every add-on he published unable to take an update. Each person's key is kept under
 * their own id and is reached only while they are signed in (`author-key.ts` `indexedStore`).
 *
 * THE ONE KEY KEPT BEFORE KEYS WERE PER PERSON (`KEY_LEGACY_SLOT`) is moved into the slot of the first person signed in
 * who asks for a key on this browser, in one transaction, so it is that person's from then on and nobody later can take it.
 */

export const KEY_DB = 'braindog-author-key';
export const KEY_SHELF = 'keys';
export const KEY_LEGACY_SLOT = 'publisher';
export const keySlotOf = (person: string): string => `${KEY_LEGACY_SLOT}:${person}`;
