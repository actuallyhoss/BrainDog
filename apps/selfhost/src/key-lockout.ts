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

import { BlockList, isIP } from 'node:net';

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

/**
 * THE PROXY ITSELF IS COUNTED TOO (AI16), against a hundred in the same fifteen minutes. With `BRAINDOG_TRUST_PROXY` on,
 * the place counted is the one the proxy wrote; a caller that reached the port past the proxy, from an address that
 * looks like one (the Docker gateway, anybody on the LAN), wrote its own and reset its count with each guess. Every key
 * that came through one peer is now also that peer's, so a forged header buys a hundred guesses and not unlimited ones,
 * and ten strangers behind a real proxy do not lock the key for everybody, which is what one shared count of ten did
 * (RD7).
 */
export const PEER_TRIES = { most: 100, window: 15 * 60_000 } as const;

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

/**
 * WHAT THE OPERATOR IS TOLD WHEN THE LOCKOUT SEES ONE ADDRESS FOR EVERYBODY (RD7). Behind Caddy, nginx or cloudflared
 * without `BRAINDOG_TRUST_PROXY=1`, every request comes from the proxy, so ten wrong keys from anywhere on the internet
 * locked the server key for everyone, again every fifteen minutes, and nothing said why.
 */
export const ONE_PLACE =
  'This looks like it is behind a proxy, and BRAINDOG_TRUST_PROXY is not set, so the sign-in lockout counts every visitor as the proxy: ten wrong keys from anywhere lock the server key for everyone for fifteen minutes. Set BRAINDOG_TRUST_PROXY=1 (or the proxy\'s address) if a proxy you run is the only way in.';

/** An address on this machine or a private network: where a proxy in front of this process stands. */
export function nearPeer(address: string): boolean {
  const a = address.toLowerCase().replace(/^::ffff:/u, '');
  if (a === '::1' || a === 'localhost' || /^127\./u.test(a) || /^10\./u.test(a) || /^192\.168\./u.test(a)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./u.test(a)) return true;
  return /^f[cd][0-9a-f]{0,2}:/u.test(a);
}

/** Whether one request reads as a proxy's: a forwarding header, from a peer on this machine or its network. */
export function proxied(peer: string, headers: Readonly<Record<string, string | string[] | undefined>>): boolean {
  return nearPeer(peer) && ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip'].some((h) => headers[h] !== undefined);
}

/** Whether a direct peer is a proxy whose `X-Forwarded-For` this host reads. */
export type ProxyTrust = (peer: string) => boolean;

/**
 * `BRAINDOG_TRUST_PROXY`: unset or `0` reads no header; `1` trusts a peer on this machine or a private network
 * (`nearPeer`), which is where Caddy, nginx, cloudflared or the Docker gateway stand; anything else is the proxies'
 * own addresses or ranges, comma or space separated (`127.0.0.1, 172.16.0.0/12, fd00::/8`). A value that reads as
 * neither stops the server with `wrong`, rather than a guess at which header to believe.
 */
export function proxyTrustOf(setting: string | undefined): ProxyTrust | null | { wrong: string } {
  const said = setting?.trim() ?? '';
  if (said === '' || /^(0|false|off|no)$/iu.test(said)) return null;
  if (/^(1|true|on|yes)$/iu.test(said)) return nearPeer;
  const list = new BlockList();
  for (const part of said.split(/[\s,]+/u).filter(Boolean)) {
    const [address = '', bits] = part.split('/');
    const plain = address.replace(/^\[|\]$/gu, '').toLowerCase().replace(/^::ffff:(?=\d+\.)/u, '');
    const family = isIP(plain);
    const width = bits === undefined ? (family === 6 ? 128 : 32) : Number(bits);
    if (family === 0 || !Number.isInteger(width) || width < 0 || width > (family === 6 ? 128 : 32))
      return { wrong: `BRAINDOG_TRUST_PROXY takes 1, or the addresses of the proxies in front (such as 127.0.0.1 or 172.16.0.0/12), and "${part}" is neither.` };
    list.addSubnet(plain, width, family === 6 ? 'ipv6' : 'ipv4');
  }
  return (peer) => {
    const a = peer.toLowerCase().replace(/^::ffff:(?=\d+\.)/u, '');
    const family = isIP(a);
    return family !== 0 && list.check(a, family === 6 ? 'ipv6' : 'ipv4');
  };
}

/** Where a request came from: `ip`, the place the lockouts and limits count, and `peer`, the socket that sent it. */
export type Place = { ip: string; peer: string };

/**
 * THE PLACE A REQUEST COMES FROM (AI16). The header is read only when the socket's own peer is a proxy this host trusts;
 * from anybody else it is the caller's own words and ignored, so reaching the port directly no longer lets a caller name
 * a fresh place per guess. Behind the proxy, the entries are read from the right, past every hop that is itself a
 * trusted proxy, and the first one that is not is the caller: the left of the header is whatever the client sent.
 */
export function placeOf(peer: string, forwarded: string | undefined, trusts: ProxyTrust | null): Place {
  if (trusts === null || peer === '' || !trusts(peer)) return { ip: peer, peer };
  const hops = (forwarded ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  let ip = '';
  while (hops.length > 0) {
    ip = hops.pop()!;
    if (!trusts(ip)) break;
  }
  return { ip: ip || peer, peer };
}
