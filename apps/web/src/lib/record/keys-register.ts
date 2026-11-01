/**
 * The list the Keys index reads, which `usedBy` names a key's row in. Its own file so the app's frame, which leaves it
 * out of the side's lists on every screen, does not carry `keychain.ts` onto the first load for one word.
 */
export const KEYS_REGISTER = 'credentials';
