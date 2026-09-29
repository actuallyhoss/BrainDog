/**
 * Whether this host makes forwarding addresses at all: one question, asked before either button.
 *
 * IT BELONGS IN `inbound-write.ts` AND IS A FILE OF ITS OWN ONLY BECAUSE THAT ONE WAS HELD BY
 * ANOTHER HAND while this was written. It is the same surface — the two doors at `/api/inbound/*` —
 * and the next reader who has both files at once should move `mintsMail` beside `mintInbound` and
 * delete this header. Nothing else imports it.
 *
 * THE SCREEN OFFERED TWO CONTROLS THAT NO SELF-HOST CAN HONOUR. `/settings/ingest` drew `Make an address` and
 * `Stop taking forwarded mail` on every
 * host, both presses answered 404 `ROUTE_UNKNOWN`, and the sentence explaining that a self-host
 * keeps its address in the file `inbound.token` arrived only after the press. A reload put both
 * buttons back. Two of the eight controls counted as unable to act on a fresh record
 * were these two.
 *
 * WHY THIS IS A REQUEST AND NOT `DEPLOYMENT.kind`. The sample's `DEPLOYMENT` followed a build flag that every shipped
 * bundle set to nothing, so `DEPLOYMENT.kind` was `'self-host'` on the Cloud build too, and hiding the mint behind it
 * would have taken the feature away from the one host that has it. The seed knew which record it was showing; it did
 * not know which host was answering.
 *
 * WHY A GET, AND WHY IT COSTS NOTHING. `serveInbound` (`apps/worker/src/inbound.ts:177`) refuses a
 * non-POST at its second line with 405 and an `allow: POST` header, ABOVE the bearer, the origin,
 * the level and the fifteen-minute proof, so this asks a door that mints only on a POST and mints
 * nothing here. The self-host routes no `/api/inbound/*` at all: `apps/selfhost/src/server.ts` hands
 * every `/api/*` path to `serveApi`, which answers 404 `ROUTE_UNKNOWN` with `There is no method
 * called inbound/mint.` (`packages/host/src/index.ts:567`).
 *
 * SO ONE ANSWER MEANS THE HOST, AND EVERY OTHER MEANS THE CALLER. 404 with `ROUTE_UNKNOWN` is the
 * host saying it does not serve this door. A 401, a 403, a shell page or no answer at all are about
 * who is asking or about there being no record here, and a control taken away on one of those would
 * teach a signed-out owner that their host cannot forward mail.
 */

import type { Fetch } from './boot-live.ts';

/** What a probe reads off the answer, and only the keys read here. */
type Answered = { refusal?: { code?: unknown } };

/**
 * Does this host mint forwarding addresses?
 *
 * `true` WHEREVER THE HOST HAS NOT SAID OTHERWISE, which is the safe direction for a control: the
 * press then reaches `mintInbound`, whose every arm is already a sentence, rather than the screen
 * deciding on its own that a door is absent because a request went wrong.
 */
export async function mintsMail(base: string, io?: Fetch): Promise<boolean> {
  let res: Response;
  try {
    res = await (io ?? fetch)(`${base.replace(/\/+$/, '')}/api/inbound/mint`, { method: 'GET', credentials: 'same-origin' });
  } catch {
    return true;
  }
  if (res.status !== 404) return true;
  try {
    const body = (await res.json()) as Answered;
    return body.refusal?.code !== 'ROUTE_UNKNOWN';
  } catch {
    /* A 404 THIS SCREEN CANNOT READ IS NOT THE HOST ANSWERING. A proxy's own not-found page, or a
       static host's, says nothing about which doors the record behind it serves. */
    return true;
  }
}
