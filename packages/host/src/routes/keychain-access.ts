/**
 * The route rows for keychain access (`packages/record/src/methods/keychain-access.ts`, `docs/12-SECURITY.md` §6.3).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * KEYCHAIN, LIKE `listGrants` AND `revokeGrant`: an owner in a browser, proved within the keychain's lock window, and
 * every token refused. No agent sets its own access or answers its own ask. Lock now is not here: it is the sign-in
 * route `POST /auth/keychain/lock`, because what it changes is the session, which the Directory keeps.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'keyAccess', group: 'KEYCHAIN', writes: false, what: 'How long a sign-in opens the keychain for, and which machine may open which key: always, after asking you, or never.',
    takes: { credential: 'text' } },
  { name: 'keyUses', group: 'KEYCHAIN', writes: false, what: 'Which tools need which key, by name, never a value.' },
  { name: 'setKeyAccess', group: 'KEYCHAIN', writes: true, what: 'Set whether one machine, or every machine, opens one key always, after asking you, or never.' },
  { name: 'keyAsks', group: 'KEYCHAIN', writes: false, what: 'The machines waiting for you to allow a key, newest first, and with recent the last week too.',
    takes: { recent: 'text' } },
  { name: 'answerKeyAsk', group: 'KEYCHAIN', writes: true, what: 'Answer a machine waiting on a key: allow it once, always, or deny it.' },
  { name: 'setLockAfter', group: 'KEYCHAIN', writes: true, what: 'How long a sign-in opens the keychain for: 5, 15 or 60 minutes.' },
];
