/**
 * WHERE A PHONE CAN REACH THIS, which for a self-host on a home network was nowhere it could sign in.
 *
 * MEASURED BEFORE ANY OF THIS WAS WRITTEN, because the recorded blocker turned out to be wider than the
 * defect. Started with `origin: 'https://brain.example.test'`, the way a reverse proxy in front of this
 * process would configure it, `start` already answers `signIn: { ways: ['a passkey'], off: null }` and
 * `/auth/methods` already answers `passkey: true`. So "a self-host on the LAN cannot sign him in from his
 * phone" was true of the DEFAULT and not of the product: the proxy shape worked, untested, undocumented,
 * and with nothing in the boot output that would lead anybody to it.
 *
 * WHAT WAS ACTUALLY MISSING WAS TWO THINGS. This process could not terminate TLS itself, so a certificate
 * the operator already holds could not be used without standing another daemon in front of it. And when the
 * origin was wrong it said nothing useful: `origin: 'https://192.168.1.50:8443'`, which is the obvious thing
 * to type for a machine on a home network, measures as `signIn: { ways: [], off: null }` and
 * `/auth/methods` answering `passkey: false`. Sign-in is nominally on, there is no way in, and the boot line
 * reads "has no way in to offer yet". `relyingParty` refuses an IP literal, which is correct, and nothing
 * anywhere connects that refusal to the empty sign-in screen the operator is looking at.
 *
 * SO THE HOSTNAME IS THE WHOLE PROBLEM, AND THE CERTIFICATE IS WHERE IT IS ALREADY WRITTEN DOWN. A passkey
 * is bound to a relying party id, which is a domain name and never an address, and a browser accepts a
 * certificate only for the names inside it. Those are the same name. Asking the operator to state it twice,
 * once in `BRAINDOG_ORIGIN` and once in the certificate, is asking for a mismatch that shows up as a
 * certificate warning on a phone, so `originFor` takes it from the certificate when it is not told, and
 * refuses a `BRAINDOG_ORIGIN` the certificate does not cover rather than listening and failing later.
 *
 * THE THREE SHAPES, AND THERE ARE ONLY THREE. Terminate TLS here with `BRAINDOG_TLS_CERT` and
 * `BRAINDOG_TLS_KEY`. Terminate it in front, with `BRAINDOG_ORIGIN` naming what the proxy answers at and
 * `BRAINDOG_TRUST_PROXY=1` so the lockout counts the client rather than the proxy. Or stay on loopback,
 * which a browser treats as a secure context and which is why `http://localhost:8080` has always worked.
 *
 * AND A SELF-SIGNED CERTIFICATE IS NOT ONE OF THEM, for the case that matters here. The thing being replaced
 * is an installed PWA on a phone, and a service worker is refused on a page served with a certificate error,
 * so clicking through a warning gives a web page and never the installed app. That is a browser rule this
 * repository cannot measure, so it is stated rather than claimed: what this module does about it is refuse
 * to invent a name the certificate does not carry, which is the part that is checkable here.
 */

import { X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { cookieMode, relyingParty, type CookieMode } from '@braindog/host/auth';

/** What is true about one origin for a browser: whether it can hold a session, and whether it can make a passkey. */
export type Reach = {
  origin: string;
  /** `secure` on https, `local` on http at a loopback name, `null` where no session cookie can be set. */
  cookie: CookieMode | null;
  /** Whether WebAuthn has a relying party here. False at an IP literal even when the cookie is fine. */
  passkeys: boolean;
  /** The one thing wrong with this origin for a phone, or `null` when there is nothing. */
  trouble: 'insecure' | 'no-hostname' | null;
};

/**
 * The hostnames a certificate carries, in the order it carries them.
 *
 * THE SUBJECT ALTERNATIVE NAMES AND NOT THE COMMON NAME. Every browser stopped reading CN for host
 * matching years ago, so a certificate whose only name is in the subject would be accepted here and
 * refused by the phone, which is the one disagreement this function exists to prevent. The IP entries
 * are dropped on the way through: an address is a valid SAN and is never a valid relying party id.
 */
export function certificateNames(certificate: string): readonly string[] {
  const alt = new X509Certificate(certificate).subjectAltName ?? '';
  return alt
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('DNS:'))
    .map((entry) => entry.slice('DNS:'.length).trim().toLowerCase())
    .filter((name) => name.length > 0);
}

/**
 * Whether a certificate name covers a host, by the rule a browser uses.
 *
 * ONE LABEL FOR A WILDCARD, NEVER MORE. `*.home.arpa` is `brain.home.arpa` and is not `a.b.home.arpa`
 * and is not the bare `home.arpa`. A looser test here would pass a certificate the phone then rejects,
 * which is exactly the failure this file is for, so it is the strict rule or no check at all.
 */
function covers(name: string, host: string): boolean {
  if (!name.startsWith('*.')) return name === host;
  const tail = name.slice(1);
  if (!host.endsWith(tail)) return false;
  const head = host.slice(0, host.length - tail.length);
  return head.length > 0 && !head.includes('.');
}

/**
 * The origin this process will serve at over TLS: the one configured, checked, or the certificate's own name.
 *
 * IT REFUSES BEFORE ANYTHING LISTENS, in the shape `start` already uses for a malformed `BRAINDOG_ORIGIN`.
 * A mismatch between the origin and the certificate is not a runtime error anywhere: the server starts, the
 * app is served, and the only report of it is a certificate warning on the one device that was the point of
 * the exercise. A sentence naming both at boot costs a restart, and the other costs an afternoon.
 */
export function originFor(o: { configured?: string | undefined; names: readonly string[]; port: number }): string {
  const named = o.names.join(', ') || 'no hostname at all';
  const at = (host: string): string => (o.port === 443 ? `https://${host}` : `https://${host}:${o.port}`);

  if (o.configured === undefined) {
    const first = o.names[0];
    /* A WILDCARD CANNOT BE THE DEFAULT, because `*.home.arpa` is not a host: picking a label out of it
       would be this file inventing the name the operator has to keep stable for ever. */
    if (first === undefined || first.startsWith('*.'))
      throw new Error(
        `The certificate names ${named}, which is not a hostname this can be served at. Set BRAINDOG_ORIGIN to the https origin a browser will use, and make sure the certificate carries that name.`,
      );
    return at(first);
  }

  let url: URL | null = null;
  try {
    url = new URL(o.configured);
  } catch {
    url = null;
  }
  if (!url || url.origin === 'null')
    throw new Error('BRAINDOG_ORIGIN is an origin, such as https://brain.home.arpa:8443, and this is not one.');
  if (url.protocol !== 'https:')
    throw new Error(
      `BRAINDOG_ORIGIN is ${url.origin} and this host is terminating TLS, so it is served over https. Say the https origin, or unset BRAINDOG_TLS_CERT.`,
    );
  /* AN ADDRESS IS REFUSED FOR WHAT IS WRONG WITH IT, AND NOT AS A CERTIFICATE MISMATCH. MEASURED with the
     test fixture, which carries `IP:127.0.0.1` beside its two names: `BRAINDOG_ORIGIN=https://127.0.0.1:8443`
     was refused with "the certificate names brain.home.arpa, localhost", and that is false about that
     certificate. `certificateNames` drops IP entries on purpose, so the check below can never pass for an
     address whatever the certificate says, and the sentence it produces sends somebody to reissue one that
     was already right. The real trouble is that a passkey has no relying party at an address, which is
     `reachLine`'s sentence, taken from there so the boot line and this refusal cannot come to differ. */
  const trouble = reachLine(reachOf(url.origin));
  if (trouble !== null) throw new Error(trouble);
  if (!o.names.some((name) => covers(name, url.hostname)))
    throw new Error(
      `BRAINDOG_ORIGIN is ${url.origin} and the certificate names ${named}. A browser reaching this at a name the certificate does not carry gets a certificate warning, and an installed app is not offered through one.`,
    );
  return url.origin;
}

/** What is true about an origin for a browser. One function, so the boot line and the checks cannot disagree. */
export function reachOf(origin: string): Reach {
  const cookie = cookieMode(origin);
  const passkeys = relyingParty(origin) !== null;
  return { origin, cookie, passkeys, trouble: cookie === null ? 'insecure' : passkeys ? null : 'no-hostname' };
}

/**
 * The one sentence to say about an origin that will not do what the operator wants, or `null`.
 *
 * IT NAMES WHAT TO SET AND NOT ONLY WHAT IS WRONG. The line this replaces said "Serve it over https, or at
 * localhost", which is a restatement of the refusal: somebody who has just typed their machine's address
 * into `BRAINDOG_ORIGIN` knows it is not localhost, and what they do not know is that this process can hold
 * a certificate itself, or that the proxy shape needs `BRAINDOG_TRUST_PROXY` to count a lockout properly.
 */
export function reachLine(r: Reach): string | null {
  switch (r.trouble) {
    case 'insecure':
      return `${r.origin} is plain http at a name that is not loopback, so no browser will keep a session on it. Either serve https from here with BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY, or terminate TLS in front and set BRAINDOG_ORIGIN to the name that proxy answers at, with BRAINDOG_TRUST_PROXY=1.`;
    case 'no-hostname':
      return `${r.origin} is an address and not a hostname, so nothing can register a passkey here: a passkey is bound to a domain name. Give this machine a name that resolves on your network, put that name in the certificate, and set BRAINDOG_ORIGIN to it.`;
    default:
      return null;
  }
}

/**
 * The name this record was last served at, and one sentence when it has changed.
 *
 * A RENAME IS A MASS UNENROLMENT AND NOTHING SAYS SO ANYWHERE ELSE. The relying party id is the hostname, so
 * moving from `brain.home.arpa` to a tunnel's name does not migrate a single passkey: every device that had
 * one is simply unable to offer it, and the sign-in screen looks identical to a sign-in screen that is
 * working. The operator has to know before they are locked out of the machine holding everything they own,
 * so the old name is kept beside the record and compared on every boot.
 *
 * THE PORT IS NOT PART OF IT, because it is not part of the relying party id: moving from 8443 to 443 keeps
 * every passkey, and a line claiming otherwise would be a warning people learn to ignore.
 */
export function nameChange(file: string, origin: string): string | null {
  const now = new URL(origin).hostname;
  let before = '';
  try {
    before = readFileSync(file, 'utf8').trim();
  } catch {
    /* No file yet: a first boot, or an installation made before this was written. Neither is a change. */
    before = '';
  }
  if (before === now) return null;
  try {
    writeFileSync(file, `${now}\n`, { mode: 0o600 });
  } catch {
    /* A NOTE THAT CANNOT BE WRITTEN DOES NOT STOP THE HOST, which is the rule `serve` already states one
       paragraph further down for the nightly copy. MEASURED before this `try` was here: with `served-at`
       unwritable the process printed its record, its origin and the line about the ways in, having
       already listened, and then died with `EISDIR: illegal operation on a directory` and exit 1. The
       ordinary way into that is a file left by a boot that ran as another user. All the failure costs is
       that the comparison is against a name that did not change, so a real rename is said again next
       boot, and a warning repeated is a better outcome than a host that will not start. */
  }
  if (before === '') return null;
  return `the name changed from ${before} to ${now}: a passkey is bound to the name it was made at, so every passkey registered at ${before} will not answer here and each device has to enrol again.`;
}
