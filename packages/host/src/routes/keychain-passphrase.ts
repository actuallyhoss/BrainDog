/**
 * The route rows for the keychain password (`packages/record/src/methods/keychain-passphrase.ts`,
 * `docs/12-SECURITY.md` §6).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * KEYCHAIN, LIKE `listGrants` AND `revokeGrant`: an owner in a browser, proved within fifteen minutes, and every token
 * refused. Each takes `{ passphrase }` in a POST body and never in a query string, so no `takes` is declared: a
 * passphrase in an address is a passphrase in every log that address passes through. Each host answers both through
 * `withKeychainPassphrase` (`packages/host/src/passphrase.ts`), which takes the passphrase off before the record is called.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'setKeychainPassphrase', group: 'KEYCHAIN', writes: true, what: 'Put the keychain behind a passphrase only its owner knows. Forgotten, no key in it can be opened again, by anybody.' },
  { name: 'clearKeychainPassphrase', group: 'KEYCHAIN', writes: true, what: 'Take the passphrase off the keychain, with that passphrase, so its keys open under the host key again.' },
  /* The old names, to the same handlers: installed clients and older hosts still send them. */
  { name: 'setVaultPassphrase', group: 'KEYCHAIN', writes: true, what: 'The old name of setKeychainPassphrase.' },
  { name: 'clearVaultPassphrase', group: 'KEYCHAIN', writes: true, what: 'The old name of clearKeychainPassphrase.' },
];
