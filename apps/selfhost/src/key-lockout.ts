/**
 * The server key's lockout at `/api` and `/mcp`: ten wrong keys from one place in fifteen minutes, and that place is
 * refused for fifteen minutes more (security review of 30 Oct, SEC5).
 *
 * WHAT WAS WRONG. `Authorization: Bearer <guess>` at `GET /api/boot` was compared against the server key and a miss was
 * a 401 with no strike, so anybody who reached the port could guess in a loop, and a hit was the owner. The Directory's
 * own `ip:` lockout guarded only `/auth/token`.
 *
 * THE SAME RULE AS THE DIRECTORY'S (`packages/record/src/identity.ts`, `SIGN_IN`): ten are compared and the eleventh is
 * not; a lock is sticky, so a right key during it is refused like any other and cannot be told apart; a count whose
 * first strike is a window old starts again; and the right key clears the place it came from. AN IPv6 ADDRESS IS ITS
 * /64 (`ipBucket`), what one home or one cheap server is handed, so a fresh address per guess is the same place.
 *
 * IN THIS PROCESS AND NOT THE DIRECTORY, because a self-host with a key may have no Directory, and because the compare
 * is synchronous here (`sameKeyNow` in `server.ts`): the lock is read, the key compared and the strike written with
 * nothing in between, so a thousand guesses sent at once are a thousand strikes in turn and never a thousand compares
 * against a count that has not moved. ONLY A BEARER SHAPED LIKE THE KEY IS COUNTED, one with no `.`: an agent's token
 * is 256 random bits and its own check, and an agent retrying a revoked token never locks the owner out.
 */

import { ipBucket } from '@braindog/record/directory';

export type KeyLockout = {
  /** Seconds until the place `ip` stands for may try again, or `null` while it may. */
  locked(ip: string): number | null;
  /** One wrong key from `ip`. */
  strike(ip: string): void;
  /** The right key from `ip`: its strikes are forgotten. */
  clear(ip: string): void;
};

/** Ten wrong keys in fifteen minutes; the lock lasts fifteen minutes. */
export const KEY_TRIES = { most: 10, window: 15 * 60_000 } as const;

/** The most places remembered at once; the one struck longest ago goes first, so a flood of places costs bounded memory. */
const PLACES_MOST = 50_000;

export function keyLockout(now: () => number, rule: { most: number; window: number } = KEY_TRIES): KeyLockout {
  const places = new Map<string, { n: number; first: number; until: number | null }>();
  const placeOf = (ip: string): string => ipBucket(ip) || '?';
  return {
    locked(ip) {
      const at = places.get(placeOf(ip));
      const t = now();
      return at?.until != null && at.until > t ? Math.ceil((at.until - t) / 1000) : null;
    },
    strike(ip) {
      const place = placeOf(ip);
      const t = now();
      let at = places.get(place);
      if (at === undefined || (at.until !== null && at.until <= t) || (at.until === null && at.first <= t - rule.window)) at = { n: 0, first: t, until: null };
      at.n += 1;
      if (at.n >= rule.most && at.until === null) at.until = t + rule.window;
      places.delete(place);
      places.set(place, at);
      if (places.size > PLACES_MOST) {
        const oldest = places.keys().next().value;
        if (oldest !== undefined) places.delete(oldest);
      }
    },
    clear(ip) {
      places.delete(placeOf(ip));
    },
  };
}
