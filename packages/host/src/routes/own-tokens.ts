/**
 * The route rows for a colleague's own agent (`packages/record/src/methods/own-tokens.ts`,
 * `docs/20-COLLABORATION.md` §2, tier 0).
 *
 * DATA, NOT ADMIN, because the point is that a member who is not an owner reaches them. The record holds each to a
 * person in a browser with a credential of their own, so no token mints a token, and minting to a sign-in proved in the
 * last fifteen minutes. The owner's `listTokens` and `revokeToken` stay ADMIN and see and end every one of these.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'createOwnToken', group: 'DATA', writes: true, what: 'Make a key for your own agent, capped by your own levels. The secret is in the answer and is stored nowhere.' },
  { name: 'ownTokens', group: 'DATA', writes: false, what: 'Your own agent keys, with when each was last used. Never the key.' },
  { name: 'revokeOwnToken', group: 'DATA', writes: true, what: 'Revoke one of your own keys. The second call says the same as the first.' },
];
