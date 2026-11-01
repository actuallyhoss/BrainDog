/**
 * `/api/inbound/*`: the forwarding address itself, minted once and shown once. `49 §5.22`, `91cda54d`.
 *
 * ITS OWN FILE, AND FREE OF `cloudflare:`, for the reason `route.ts` and `session.ts` are: what this
 * decides is who may put a digest in the tenant map, and what the only copy of a credential is
 * handed to. A decision that can only run inside workerd is a decision nobody tests.
 *
 * THE ADDRESS HAD NO ORIGIN ON THIS HOST, WHICH IS WHY THIS FILE EXISTS. `feefa3f4` gave the
 * Directory `dir_inbound`, a reader, a writer, and gave the mail door its lookup, so
 * `/in/email/<token>` answers the moment a digest is in that index. Grepped across
 * `apps/` and `packages/`: every caller of `inbound$` was a test in `apps/worker/test/route.test.ts`,
 * so the index held nothing on the hosted Worker and every forwarded message was a 404 with both
 * halves of the surface finished and green. This is the half that mints.
 *
 * THE TOKEN IS NEVER STORED AND CANNOT BE ANSWERED TWICE, and the shape of this module is what makes
 * that a property rather than a promise. Only the SHA-256 crosses to the Directory, and there is no
 * route here that reads anything back, so nothing on this Worker could answer the token a second time
 * even if somebody asked it to. A person who loses the address mints another, and that write is what
 * revokes the one they lost.
 *
 * ROTATION IS MINTING AGAIN AND REVOCATION IS WRITING `null`, which is the self-host's vocabulary
 * rather than a shortcut taken here. There a record's token is a file: writing it registers, writing
 * it again rotates, and `rm` revokes, with no command to learn (`91cda54d`). `inbound$` deletes the
 * asking record's row before it inserts, so one record holds one address here too and a rotation
 * cannot leave two live ones. A forwarding address is handed to third parties by definition, so a new
 * one is the whole answer to a leaked one and it must not be a different route from the first.
 *
 * NOTHING HERE LOGS. The answer carries the only copy of a credential there will ever be, and it is
 * the one value in this Worker that must never reach an operator's tail.
 */

import { httpStatus } from '@braindog/host';
import type { Refusal, Result } from '@braindog/ports';
import type { CallContext } from '@braindog/record';

/**
 * Which of the two doors a path is, or `null`.
 *
 * `servesKeys`'s SHAPE, AND IT FORGIVES THE SAME SLASHES, because a path a page builds by joining a
 * base and a route is a path with `//` in it. There is deliberately no third door: a route that
 * answered "what is my address" would have to hold the token to answer with, which is the one thing
 * this surface is built not to keep.
 */
export function servesInbound(pathname: string): 'mint' | 'revoke' | null {
  const hit = /^\/+api\/+inbound\/+(mint|revoke)\/*$/.exec(pathname)?.[1];
  return hit === 'mint' || hit === 'revoke' ? hit : null;
}

/** A host's half: the origins it answers for, and the one write. */
export type InboundDoor = {
  /**
   * The origins this deployment answers for, and an empty set closes the door: a host that cannot say
   * what its own address is cannot tell a page of its own from a page somewhere else.
   */
  origins: ReadonlySet<string>;
  /**
   * The asking record's row in `dir_inbound`: a digest registers or rotates it, `null` takes it away.
   *
   * ONE VERB FOR ALL THREE, BECAUSE BOTH HOSTS HAVE ONE. `inbound$` in
   * `packages/record/src/directory.ts` spends a paragraph on why, and the self-host's one verb is a
   * file. A second method for revocation would be a second place for the rule "one record holds one
   * address" to be got wrong.
   *
   * IT IS NEVER HANDED THE TOKEN. The digest is the whole of what leaves this file, so a copy of the
   * Directory's storage is not a set of mailbox keys, and `inbound$` refuses anything that is not 64
   * lower-case hex characters for the same reason.
   */
  registers(tokenHash: string | null): Promise<Result<null>>;
};

type Header = readonly [string, string];

/* One caller's answer and never a cache's, which matters more here than on any other route: the body
   below carries a live credential, and a shared cache keyed on a path that names no record would hand
   one person's address to the next. */
const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/**
 * The one sentence every caller that is not a browser session gets at `/api/inbound/*`.
 *
 * ONE COPY, AND IT IS EXPORTED FOR THE OTHER PLACE THAT REFUSES. This door refuses the
 * `Authorization` header it can see; `index.ts` refuses the bearer door, which reaches the router
 * without one and never reaches this function. Two spellings of one refusal is how a caller
 * learns which branch refused them, and the answer to "which branch" is none of their business.
 */
export const NO_MINT_SESSION: Refusal = {
  code: 'NEEDS_BROWSER_SESSION',
  fix: 'Open the app and sign in as an owner of this BrainDog to change where its mail arrives.',
  at: 'principal',
};

/**
 * Thirty-two random bytes as a URL carries them: base64url, no padding, 43 characters.
 *
 * THE SELF-HOST'S OWN VALUE, SO THE TWO HOSTS MINT THE SAME KIND OF ADDRESS. `init` writes
 * `randomBytes(32).toString('base64url')` into `<slug>/inbound.token` at mode 0600
 * (`apps/selfhost/src/main.ts:333`), and a person moving a record between hosts must not find that
 * their bank's forwarding settings hold a shape the other host cannot serve. Forty-three base64url
 * characters need no percent escape and are far inside `servesIngest`'s 256-character segment
 * ceiling, so the token survives being typed into somebody else's settings screen.
 *
 * IT IS FOUR LINES THIS TREE ALREADY HOLDS THREE COPIES OF (`kernel/src/token.ts`,
 * `invitations.ts`, `device.ts`), AND THIS IS THE FOURTH RATHER THAN AN IMPORT OF ONE. The exported
 * name is `inviteSecret`, and a mail token minted through a function called that is a line the next
 * reader has to stop at.
 */
const secret = (): string => {
  let s = '';
  for (const b of crypto.getRandomValues(new Uint8Array(32))) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * How recent an owner's last sign-in must be to move where a record's mail arrives: `12 §6`.
 *
 * THE KERNEL'S OWN FIFTEEN MINUTES, TO THE MILLISECOND. `FRESH` in `packages/record/src/index.ts` guards
 * the four doors whose answer the browser that asked cannot take back: the keychain gate and `deviceApprove`
 * hand out something that then works from anywhere, and `restore` and `deleteRecord` throw away what
 * nobody can put back. A forwarding address is both at once. `FRESH` is not exported, and exporting it to
 * be read once here would put a number the kernel decides into this file's import list; the value is in
 * `12 §6` and both copies cite it. If the two ever disagree, the kernel is right.
 *
 * AND THE CLOCK IS THE WALL CLOCK, not an injected one. `provedAt` is epoch milliseconds stamped on a
 * session row by the Directory's own `Date.now()` (`sessionContext` in `packages/host/src/auth.ts`), so
 * the only clock that can be compared with it is the same one; a fifth key on `InboundDoor` that no
 * deployment would ever set differently is a seam for a test and not for a caller.
 */
const FRESH = 15 * 60_000;

/** The SHA-256 of a token, in hex: the only half of it that ever leaves this file. */
const digest = async (token: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Mint the record's forwarding address, or take it away.
 *
 * THE ORDER: the path, the method, a bearer, the page, the level, the proof, and only then the write. It
 * is `serveKeys`'s order for `serveKeys`'s reasons, and the two share nothing else: this door takes no
 * body at all, and the record it acts on is the one the session named, so there is no argument here
 * to get wrong and no way to name somebody else's record. The proof is last of the six because it is the
 * only one whose remedy is an action rather than a correction: `FRESH` above says what it costs.
 *
 * AN OWNER AND NOTHING BELOW IT. The address is where a bank's mail lands, so whoever can change it
 * can redirect a record's incoming statements: that is the owner's decision in the same way the
 * keychain's is (`12 §6`). A colleague at `decide` is refused with the sentence that says so, because
 * "ask an owner" is the remedy and a caller that cannot read it retries forever.
 *
 * WHAT IT ANSWERS IS THE TOKEN AND NOT THE ADDRESS. The address is
 * `https://<this host>/in/email/<token>` (`49 §5.16` step 2), and the page that shows it once is
 * served from this very origin, so it can build that URL itself. A second field holding the same
 * secret spelled differently is a second thing to keep out of a log.
 *
 * AND A CREDENTIAL THAT OUTLIVES THE MACHINE NEEDS A CREDENTIAL TO MINT. `createToken` and `invite`
 * in `packages/record/src/index.ts` both refuse `credentialed === false` and say why at length: a
 * self-host with no `BRAINDOG_TOKEN` makes an unauthenticated request the owner, which is right for
 * one person on loopback and stops being right the moment the call mints something that works from
 * anywhere. A forwarding address is exactly that, and it is handed to third parties on purpose. This
 * Worker has no uncredentialed principal now its public demo is gone;
 * the check is here because the rule belongs to the door and not to the deployment.
 */
export async function serveInbound(request: Request, door: InboundDoor, ctx: CallContext): Promise<Response> {
  const which = servesInbound(new URL(request.url).pathname);
  if (which === null)
    return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'A forwarding address is minted at /api/inbound/mint and taken away at /api/inbound/revoke.' });
  if (request.method !== 'POST') return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `/api/inbound/${which} takes a POST.` }, [['allow', 'POST']]);

  /* A BEARER OF ANY KIND, BEFORE THE PRINCIPAL BEHIND IT, which is `serveKeys`'s rule and its
     measurement: the server key makes the owner on a self-host and would pass every check below. What
     is missing is a person in a browser rather than a wider token, so the header is what is refused. */
  if (request.headers.get('authorization') !== null) return refusal(403, NO_MINT_SESSION);

  /* AND THE PAGE HAS TO BE THIS HOST'S. Every browser sends `Origin` on a POST, so a request with
     none is not a page, and a page somewhere else is the thing a session cookie cannot be allowed to
     serve (`12 §8`). `doorOf` checks the same thing for every cookie write; this door checks it again
     because the rule is the door's own and a host that wired it wrongly would otherwise mint from a
     page anywhere on the internet. */
  const origin = request.headers.get('origin');
  if (origin === null || !door.origins.has(origin))
    return refusal(403, { code: 'FORBIDDEN', fix: 'A forwarding address is minted from this app, in a browser, on this address.', at: 'origin' });

  if (ctx.principal.kind !== 'person' || ctx.principal.level !== 'owner')
    return refusal(403, { code: 'LEVEL_REQUIRED', fix: 'Only an owner of this BrainDog can change where its mail arrives.', at: 'principal' });
  if (ctx.credentialed === false) return refusal(403, NO_MINT_SESSION);

  /* AND A PROOF IN THE LAST FIFTEEN MINUTES, WHICH IS THE RUNG THIS DOOR WAS MISSING. Every other
     owner-only door in this tree that hands out something working from anywhere asks for one, in the same
     words and the same order: the keychain gate, `deviceApprove`, `restore` and `deleteRecord`, all in
     `packages/record/src/index.ts`. A cookie is thirty days of standing access, and this door hands out a
     live credential and revokes the previous one in the same call, so without this a stranger at an open
     laptop takes a record's bank mail and stops it arriving without proving they are anybody.

     BOTH DOORS, BECAUSE BOTH ARE LOSSES, and the revocation is the worse of the two: it is a bank's mail
     silently not arriving. Asking for a proof to mint and not to revoke would make the damaging call the
     cheap one.

     AND ABSENT IS NOT STALE. `provedAt` reaches a context only from a session row, so undefined is a
     caller with no session at all, which `credentialed` a line above has already had its say about. */
  if (ctx.provedAt !== undefined && Date.now() - ctx.provedAt > FRESH)
    return refusal(403, { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to change where this BrainDog takes its mail.', at: 'proof' });

  /* REVOCATION IS THE SAME WRITE WITH NOTHING IN IT, and it answers no value: there is nothing to
     show, and the record now takes no forwarded mail at all until somebody mints again. */
  if (which === 'revoke') {
    const gone = await door.registers(null);
    return reply(httpStatus(gone), gone);
  }

  const token = secret();
  const written = await door.registers(await digest(token));
  /* THE TOKEN IS ANSWERED ONLY WHERE THE DIGEST REACHED THE INDEX, and a refusal is answered with the
     Directory's own sentence at the status every other route gives it. Handing back a token whose
     digest was refused would be an address a person pastes into their bank and a door that answers
     404 for ever after. */
  return written.ok ? reply(200, { ok: true, value: { token } }) : reply(httpStatus(written), written);
}
