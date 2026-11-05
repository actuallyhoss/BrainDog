/**
 * The server key's lockout at `/api` and `/mcp`: ten wrong keys from one place in fifteen minutes, and that place is
 * refused for fifteen minutes more (security review of 30 Oct, SEC5).
 *
 * WHAT WAS WRONG. `Authorization: Bearer <guess>` at `GET /api/boot` was compared against the server key and a miss was
 * a 401 with no strike, so anybody who reached the port could guess in a loop, and a hit was the owner. The Directory's
 * own `ip:` lockout guarded only `/auth/token`.
 *
 * THE RULE: ten wrong keys from one place in a window lock it; a count whose first strike is a window old starts
 * again; and the right key clears the place it came from. AN IPv6 ADDRESS IS ITS /64 (`ipBucket`), what one home or one
 * cheap server is handed, so a fresh address per guess is the same place.
 *
 * THE LOCK HOLDS WRONG KEYS ONLY, AND THE RIGHT KEY ALWAYS GETS IN (RG14). It used to be sticky, as the Directory's
 * `SIGN_IN` is: a locked place was refused before anything was compared, the right key too. Under
 * `BRAINDOG_TRUST_PROXY=1` or a trusted range the place is a header, and a header is words, so anybody on the LAN could
 * name the owner's own address with ten wrong keys and lock the owner out for fifteen minutes, again and again. Now the
 * key is compared first, in constant time, and a match is the owner wherever it came from. `/auth/token` does the same
 * (`key.exchange` in `packages/record/src/identity.ts`). A wrong key from a locked
 * place is a 429, held to one answer per `wait` (`turn`): one more may wait for the next turn and the rest are refused
 * at once, so a guesser who waits for answers gets one every two seconds and a flood holds no sockets. That the right
 * key answers differently during a lock costs no secret: a server key is at least 128 bits (`weakKey` in `main.ts`).
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
  /**
   * The turn of one wrong key from `ip`, taken after its compare: `{ wait: 0 }` while the place is not locked; locked,
   * the milliseconds until its answer (and the turn is taken), or `full` when one already waits for the next turn.
   */
  turn(ip: string): PeerTurn;
  /** One wrong key from `ip`. */
  strike(ip: string): void;
  /** The right key from `ip`: its strikes are forgotten. */
  clear(ip: string): void;
};

/** Ten wrong keys in fifteen minutes; the lock lasts fifteen minutes, and holds a locked place's wrong keys to one answer per `wait`. */
export const KEY_TRIES = { most: 10, window: 15 * 60_000, wait: 2_000 } as const;

/** The most places remembered at once; the one struck longest ago goes first, so a flood of places costs bounded memory. */
const PLACES_MOST = 50_000;

/**
 * THE PROXY ITSELF IS COUNTED TOO, AND HELD TO A RATE, NEVER LOCKED (AI16, RG3, RH7, RH10). When a peer this host
 * trusts may be more than one machine (`1`, which believes the whole LAN, or a list holding a range such as
 * `172.16.0.0/12`, every Docker network), anybody who reaches the port past the proxy can write a fresh place into the
 * header with each guess (RG14), and the place lock never trips. So the wrong keys through one peer are counted too,
 * BY THE PEER'S OWN PLACE (`ipBucket`): an IPv6 caller on the LAN may take any address in its /64 without asking anybody,
 * so a fresh source address per hundred guesses was a fresh peer.
 * LOCKING THAT PEER WAS THE OLD FAULT AGAIN: every caller behind Caddy or cloudflared has the proxy as its peer, so a
 * hundred wrong keys from anywhere on the internet locked the owner out with everybody else.
 *
 * WHAT IT IS NOW: A RATE LIMIT ON WRONG KEYS. Over the ceiling, ONE wrong key through that peer is answered per `wait`,
 * in turn. One more may wait for the next turn (at most `wait`); any beyond that is answered 429 at once with the
 * seconds to the next free turn, so nothing piles up sockets and timers. THE RIGHT KEY NEVER TAKES A TURN (RJ2): it is
 * compared first and let in at once. Under RH7 it queued with the guesses, so a stranger sending a hundred a second
 * took nearly every turn and the owner's agents were a 429 ninety-nine times in a hundred. The compare is constant time
 * and a server key is at least 128 bits (`weakKey` in `main.ts`), so letting every compare happen costs no secret; the
 * turns slow a guesser who waits for answers and keep a flood from holding sockets. With a list of exact proxy
 * addresses nobody can pass as one, and nothing is counted against the peer at all (`peerSlowFor`).
 */
export const PEER_CEILING = { most: 200, window: 15 * 60_000, wait: 2_000 } as const;

/** What `turn` hands back: wait this long and then compare, or refuse with `retryAfter` seconds. */
export type PeerTurn = { wait: number } | { full: true; retryAfter: number };

export type PeerSlow = {
  /**
   * The turn of one wrong key through `peer`, taken after its compare: `{ wait: 0 }` under the ceiling; over it, the
   * milliseconds until its answer (and the turn is taken), or `full` when one already waits for the next turn.
   */
  turn(peer: string): PeerTurn;
  /** One wrong key through `peer`; `true` the once its count reaches the ceiling in a window, to say so. */
  strike(peer: string): boolean;
};

/**
 * One turn on a queue whose next free turn is `at.next`: now or the next turn while it is at most `wait` away (and taken),
 * else `full` with the seconds to it. Shared by the peer's rate and a locked place's.
 */
function takeTurn(at: { next: number }, t: number, wait: number): PeerTurn {
  const slot = Math.max(t, at.next);
  if (slot - t > wait) return { full: true, retryAfter: Math.max(1, Math.ceil((slot - t) / 1000)) };
  at.next = slot + wait;
  return { wait: slot - t };
}

export function peerSlow(now: () => number, rule: { most: number; window: number; wait: number } = PEER_CEILING): PeerSlow {
  /* `next` is when the next turn is free, once the peer is over the ceiling. */
  const peers = new Map<string, { n: number; first: number; next: number }>();
  const placeOfPeer = (peer: string): string => ipBucket(peer) || peer;
  const live = (place: string, t: number) => {
    const at = peers.get(place);
    return at !== undefined && at.first > t - rule.window ? at : undefined;
  };
  return {
    turn(peer) {
      const t = now();
      const at = live(placeOfPeer(peer), t);
      if (at === undefined || at.n < rule.most) return { wait: 0 };
      return takeTurn(at, t, rule.wait);
    },
    strike(peer) {
      const place = placeOfPeer(peer);
      const t = now();
      const at = live(place, t) ?? { n: 0, first: t, next: 0 };
      at.n += 1;
      peers.delete(place);
      peers.set(place, at);
      if (peers.size > PLACES_MOST) {
        const oldest = peers.keys().next().value;
        if (oldest !== undefined) peers.delete(oldest);
      }
      return at.n === rule.most;
    },
  };
}

/* THE ADDRESS LISTS THAT HOLD A RANGE WIDER THAN ONE ADDRESS (RH10), marked by `proxyTrustOf` as it builds them. */
const wideLists = new WeakSet<ProxyTrust>();

/**
 * The peer count a trust setting needs: wherever a trusted peer may be more than one machine, so that a machine which is
 * not the proxy may forge a place: `1`'s loose `nearPeer`, or a list holding a range (RH10). Exact addresses need none.
 */
export function peerSlowFor(trusts: ProxyTrust | null, now: () => number): PeerSlow | null {
  return trusts !== null && (trusts === nearPeer || wideLists.has(trusts)) ? peerSlow(now) : null;
}

/** What the operator is told the first time one peer passes the ceiling (RG3). */
export function slowedLine(peer: string): string {
  return `${String(PEER_CEILING.most)} wrong server keys came through ${peer} in fifteen minutes, so wrong keys through it are now answered one at a time, one every ${String(PEER_CEILING.wait / 1000)} seconds, and the rest are told to try again later. The right key still gets in at once. If ${peer} is your proxy, set BRAINDOG_TRUST_PROXY to its exact address instead of 1 or a range, so each caller is counted on its own.`;
}

export function keyLockout(now: () => number, rule: { most: number; window: number; wait: number } = KEY_TRIES): KeyLockout {
  /* `next` is when a locked place's next wrong key may be answered. */
  const places = new Map<string, { n: number; first: number; until: number | null; next: number }>();
  const placeOf = (ip: string): string => ipBucket(ip) || '?';
  const lockOf = (ip: string, t: number) => {
    const at = places.get(placeOf(ip));
    return at?.until != null && at.until > t ? at : undefined;
  };
  return {
    locked(ip) {
      const t = now();
      const at = lockOf(ip, t);
      return at?.until != null ? Math.ceil((at.until - t) / 1000) : null;
    },
    turn(ip) {
      const t = now();
      const at = lockOf(ip, t);
      return at === undefined ? { wait: 0 } : takeTurn(at, t, rule.wait);
    },
    strike(ip) {
      const place = placeOf(ip);
      const t = now();
      let at = places.get(place);
      if (at === undefined || (at.until !== null && at.until <= t) || (at.until === null && at.first <= t - rule.window)) at = { n: 0, first: t, until: null, next: 0 };
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
  'This looks like it is behind a proxy, and BRAINDOG_TRUST_PROXY is not set, so the sign-in lockout counts every visitor as the proxy: after ten wrong keys from anywhere, every wrong key from anybody is answered slowly for fifteen minutes. The right key still gets in. Set BRAINDOG_TRUST_PROXY to the proxy\'s address (or 1) if a proxy you run is the only way in.';

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
 * (`nearPeer`), which is where Caddy, nginx, cloudflared or the Docker gateway stand, AND SO THE WHOLE LAN IS A PROXY
 * (RG14): anybody on it who reaches the port can name a place, which is why `1`, and a list holding a range, also
 * count by peer (`peerSlowFor`), and why the exact addresses are the setting to give; anything else is the proxies'
 * own addresses or ranges, comma or space separated (`127.0.0.1, 172.16.0.0/12, fd00::/8`). A value that reads as
 * neither stops the server with `wrong`, rather than a guess at which header to believe.
 */
export function proxyTrustOf(setting: string | undefined): ProxyTrust | null | { wrong: string } {
  const said = setting?.trim() ?? '';
  if (said === '' || /^(0|false|off|no)$/iu.test(said)) return null;
  if (/^(1|true|on|yes)$/iu.test(said)) return nearPeer;
  const list = new BlockList();
  let wide = false;
  for (const part of said.split(/[\s,]+/u).filter(Boolean)) {
    const [address = '', bits] = part.split('/');
    const plain = address.replace(/^\[|\]$/gu, '').toLowerCase().replace(/^::ffff:(?=\d+\.)/u, '');
    const family = isIP(plain);
    const width = bits === undefined ? (family === 6 ? 128 : 32) : Number(bits);
    if (family === 0 || !Number.isInteger(width) || width < 0 || width > (family === 6 ? 128 : 32))
      return { wrong: `BRAINDOG_TRUST_PROXY takes 1, or the addresses of the proxies in front (such as 127.0.0.1 or 172.16.0.0/12), and "${part}" is neither.` };
    list.addSubnet(plain, width, family === 6 ? 'ipv6' : 'ipv4');
    if (width < (family === 6 ? 128 : 32)) wide = true;
  }
  const trusts: ProxyTrust = (peer) => {
    const a = peer.toLowerCase().replace(/^::ffff:(?=\d+\.)/u, '');
    const family = isIP(a);
    return family !== 0 && list.check(a, family === 6 ? 'ipv6' : 'ipv4');
  };
  if (wide) wideLists.add(trusts);
  return trusts;
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
