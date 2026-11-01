/**
 * The forwarding address: `POST /api/inbound/mint` and `POST /api/inbound/revoke`, the half a person presses.
 *
 * IT EXISTED WITH NO CALLER, WHICH IS WHY THIS FILE EXISTS. `apps/worker/src/inbound.ts` mints an address, writes
 * only its SHA-256 to the Directory's `dir_inbound` and answers the token once. Measured by grepping `apps/web` for
 * `api/inbound`: nothing in the app called either door, so the Cloud could take a bank's forwarded mail at an address
 * no owner had any way to obtain.
 *
 * NOT THROUGH THE CLIENT, FOR `downloadSnapshot`'s REASON AND ONE MORE. `/api/inbound/*` is not a record method:
 * it writes the DIRECTORY's tenant map, not the record, so it is not in the client's route table and a name in
 * `NAMES` would be a name the record's router had to answer. And the client sends its bearer where it holds one,
 * which is the one header this door refuses outright, before it looks at who is behind it.
 *
 * THERE IS NO READ HERE BECAUSE THERE IS NO READ TO MAKE. `servesInbound` answers `mint` or `revoke` and nothing
 * else, on purpose: a route that said "what is my address" would have to keep the token to answer with. So this
 * module cannot tell a screen whether a record already holds an address, and the screen says so out loud rather
 * than drawing a blank where a value would go. A lost address is replaced by minting again, which is also the
 * self-host's vocabulary: there the token is a file, writing it registers, writing it again replaces, `rm` revokes.
 *
 * NOTHING HERE LOGS AND NOTHING HERE KEEPS. The answer to a mint carries the only copy of a credential there will
 * ever be; `inbound-write.test.ts` asserts this file holds no `console.` and no browser storage, because the rule
 * is easier to state than to keep.
 */

import type { Fetch } from './boot-live.ts';
import { copy } from '../copy.ts';
import { wroteOutside } from '@braindog/client';
import { isProof, NOT_CONFIRMED, provingFetch } from '../reauth/ask.ts';

/**
 * Where a forwarded message is posted, built from the token the door answered.
 *
 * THE SCREEN BUILDS THE ADDRESS AND THE DOOR DOES NOT ANSWER IT. `serveInbound` answers the token alone, because a
 * second field holding the same secret spelled differently is a second thing to keep out of a log, and the page
 * that shows it is served from the very origin the address names.
 *
 * THE TRAILING SLASH IS TAKEN OFF because `location.origin` carries none and a host typed by hand carries one, and
 * `//in/email/...` is a second empty segment for the mail door to forgive rather than a URL to hand to a bank.
 */
export const mailUrl = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}/in/email/${token}`;

/**
 * THE ONE COMMAND THAT PRINTS A SELF-HOST'S MAIL ADDRESS, run on the machine BrainDog runs on.
 *
 * A self-host has no door that reads an address back, and none is wanted: the token is a file, `<data>/<slug>/
 * inbound.token`, that `braindog init` wrote (`apps/selfhost/src/main.ts`). So the address is this origin's mail door
 * with that file's contents after it, and the command says exactly that. The data folder is `BRAINDOG_DATA`, `/data`
 * where it is not set, as the host reads it.
 */
export const addressCommand = (origin: string, slug: string): string =>
  `echo "${mailUrl(origin, `$(cat \${BRAINDOG_DATA:-/data}/${slug}/${words.tokenFile})`)}"`;

/**
 * THE SAME COMMAND ON DOCKER (AI21): the file is inside the container's volume, so `cat` on the machine found no `/data`.
 * It runs in the container, where the data folder is.
 */
export const dockerAddressCommand = (origin: string, slug: string): string =>
  `docker compose exec braindog sh -c 'echo "${mailUrl(origin, `$(cat \${BRAINDOG_DATA:-/data}/${slug}/${words.tokenFile})`)}"'`;

/**
 * WHETHER A MAIL PROVIDER COULD POST TO THIS ORIGIN AT ALL (AI21): a forwarder on the internet reaches neither
 * `localhost` nor a private name over plain http, so the address printed would never take a message.
 */
export const reachableForMail = (origin: string): boolean => {
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && !/^(localhost|127\.|\[?::1\]?$)/u.test(u.hostname) && !u.hostname.endsWith('.localhost');
  } catch {
    return false;
  }
};

/**
 * What the screen shows after a press, and every arm is a sentence rather than a failure.
 *
 * `signin` IS ITS OWN KIND, for the reason `device.ts` gives it one: the door wants an owner whose last sign-in is
 * under fifteen minutes old, and that is the single refusal on this screen whose remedy is an action rather than a
 * correction. A toast would take the way forward off the screen before the person had read it. A 401 is the same
 * state with no sign-in at all behind it.
 *
 * `unrouted` IS A HOST WITHOUT THE DOOR, which today is every self-host: there the token is a file and no HTTP
 * route mints one. Reported as a refusal it would read as forwarding being broken rather than spelled differently.
 *
 * THERE WAS A `sample` KIND, for a screen with no record behind it, and the caller answered it with the demo's sentence
 * about having no account. There is no sample now: a 401 is `signin`, and a host that answered
 * nothing a record says is `refused` with `recordNotReached`, the sentence every other Settings write says for it.
 */
export type Said =
  | { kind: 'minted'; token: string }
  | { kind: 'revoked' }
  | { kind: 'signin'; fix: string }
  | { kind: 'unrouted' }
  | { kind: 'refused'; fix: string };

/** No record answered, however the host failed to: a thrown fetch, the static shell, or JSON with no refusal in it. */
const notReached: Said = { kind: 'refused', fix: copy.recordNotReached };

type Refusal = { code: string; fix: string };

/** What the door answers, and only the parts read here. */
type Answered = { ok?: unknown; value?: unknown; refusal?: Refusal };

/**
 * One press, at one of the two doors.
 *
 * NO BODY AT ALL, WHICH IS THE DOOR'S OWN SHAPE. The record it acts on is the one the session names, so there is no
 * argument to get wrong and no way to name somebody else's record. A `content-type` on a request with nothing in it
 * would be a header describing a body that is not there.
 *
 * `credentials: 'same-origin'` IS WRITTEN OUT although it is the default: the cookie is the whole of what this door
 * authenticates with, so a reader changing this call should see what would break.
 */
async function press(which: 'mint' | 'revoke', base: string, io?: Fetch): Promise<Said> {
  let res: Response;
  try {
    /* A STALE SIGN-IN IS ASKED FOR IN PLACE AND THE PRESS SENT AGAIN (`provingFetch`), as the client does for its calls. */
    res = await provingFetch(() => (io ?? fetch)(`${base.replace(/\/+$/, '')}/api/inbound/${which}`, { method: 'POST', credentials: 'same-origin' }));
  } catch {
    return notReached;
  }
  /* A WRITE PAST THE CLIENT: the reads it kept go (`wroteOutside`). */
  wroteOutside();

  /* `null` IS JSON TOO, and `body.ok` on it threw out of `press`, so the button stayed pressed and no sentence came:
     measured against a host answering the four bytes `null` with a 200. It is a record not reached like any other. */
  let body: Answered | null;
  try {
    body = (await res.json()) as Answered | null;
  } catch {
    /* A STATIC HOST ANSWERS THE SHELL, not JSON, to a POST it does not route. No record read the press, so nothing
       was saved, which is what `recordNotReached` says. */
    return notReached;
  }

  if (body?.ok === true) {
    if (which === 'revoke') return { kind: 'revoked' };
    const token = (body.value as { token?: unknown } | null)?.token;
    /* THE TOKEN IS ANSWERED ONLY WHERE THE DIGEST REACHED THE INDEX, so a success with nothing in it is a host
       this screen does not recognise. Printing `undefined` into an address is worse than saying so. */
    return typeof token === 'string' && token !== '' ? { kind: 'minted', token } : { kind: 'refused', fix: NO_TOKEN };
  }

  const refusal = body?.refusal;
  if (!refusal) return notReached;
  if (refusal.code === 'ROUTE_UNKNOWN') return { kind: 'unrouted' };
  /* THE DOOR'S OWN SENTENCE, VERBATIM (`13 §6`), for the proof as well as for everything else: it says whether the
     sign-in is stale or missing, and this screen would only paraphrase it worse. */
  /* A STALE SIGN-IN WAS ASKED FOR IN PLACE ALREADY (`lib/reauth`); what comes back is the plain line for a Cancel. */
  if (isProof(refusal)) return { kind: 'refused', fix: NOT_CONFIRMED.write };
  if (refusal.code === 'UNAUTHORIZED' || refusal.code === 'NEEDS_BROWSER_SESSION') return { kind: 'signin', fix: refusal.fix };
  return { kind: 'refused', fix: refusal.fix };
}

/** The one sentence this module writes itself, for an answer that is neither a refusal nor a token. */
const NO_TOKEN = 'This host answered the mint without an address in it, so nothing was shown. Try again, and if it happens twice nothing has been changed.';

/** Mint this record's forwarding address. It replaces whatever the record held, and the token is answered once. */
export const mintInbound = (base: string, io?: Fetch): Promise<Said> => press('mint', base, io);

/** Take the record's forwarding address away. Nothing is answered: the record then takes no forwarded mail at all. */
export const revokeInbound = (base: string, io?: Fetch): Promise<Said> => press('revoke', base, io);

/**
 * The words the Ingest area reads.
 *
 * HERE AND NOT IN `copy.ts`, for the reason `keychain.ts` states about its own: `copy.ts` is in the entry chunk every
 * screen waits for, and these are read by one area of one route that is not the home page. The sentences shared
 * with the rest of Settings are still `copy.ts`'s, and this object does not repeat them.
 */
export const words = {
  title: 'Forwarded mail',
  /* WHAT IT IS, IN THE ORDER A PERSON NEEDS IT: what they get, what they do with it, and what it costs them. */
  how: 'Forward mail to one address and it lands in the Inbox.',
  /**
   * THE FACT THIS SCREEN CANNOT HIDE. There is no route that reads an address back, because a route that answered
   * one would have to keep the token to answer with. So a screen that drew "your address is ..." would be drawing
   * something nothing on this host knows, and a screen that drew nothing would read as "you have none".
   */
  unknown: 'An address is shown only when made. Lost it? Make a new one; the old one stops.',
  mint: 'Make an address',
  minting: 'Making',
  once: 'Shown once. Copy it now.',
  copyAddress: 'Copy the address',
  addressCopied: 'Address copied',
  forwardHow: 'Forward the whole message. Mail that fails sender checks waits in the Inbox, unfiled.',
  lost: 'Made. A new one replaces it.',
  /* REVOKING IS THE QUIETER ACT AND THE MORE DAMAGING ONE: a bank's mail silently not arriving. It says what
     stops, in the present tense, rather than congratulating anybody. */
  revoke: 'Stop taking forwarded mail',
  revoking: 'Stopping',
  revoked: 'Stopped. The old address is refused.',
  freshWhy: 'Needs a sign-in from the last 15 minutes.',
  /* THE FILE'S NAME ON A LINE OF ITS OWN: in the middle of the sentence it read as a name from the code (the printed
     gate's `dev-name`), and set apart it is the thing a person types. */
  unrouted: 'On a self-host the address is a file beside your BrainDog:',
  onDocker: 'On Docker:',
  noDocker: 'Without Docker:',
  /* SAID OVER THE COMMAND, NOT INSTEAD OF IT: the address is still the one to use once the name is public. */
  notReachable: (origin: string) =>
    `${origin} is not a public https address, so no mail provider can deliver to it. Serve BrainDog at one and set BRAINDOG_ORIGIN to it first.`,
  tokenFile: 'inbound.token',
} as const;
