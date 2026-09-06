/**
 * Which record a request is for.
 *
 * ITS OWN FILE, and free of `cloudflare:`, because what it returns is the argument to `idFromName` —
 * and that string IS the tenant boundary. A request that resolves to the wrong record is one
 * customer reading another's, which is not a thing to leave untested because the file it would
 * otherwise live in cannot be loaded outside workerd.
 *
 * THE BEARER NAMES THE RECORD, AND THE PATH DOES NOT. This claimed `/r/<slug>/api/<method>` as the
 * tenant prefix — a shape no document describes, sitting exactly on top of one that four of them do:
 * `/r/<register>` is the register list (19 §2), `/r/<register>/<seq>` is an entry, `{{ref:tasks#125}}`
 * renders `/r/tasks/125` (36), and `apps/web/src/routes/r/[register]/` is the page that draws it. Put
 * the Worker in front of the app as 33 §4's `run_worker_first` describes and every register link in
 * the product answers "There is no record called obligations."
 *
 * 33 §4 says it plainly: the surface is `/api/<method>`, and "a request names its record by the
 * `rec` cookie (browser), by the bearer's hash, or by its own path". A bearer is `<rec_id>.<secret>`
 * — the record id is the half in front of the dot, which is why `verifyToken` can refuse a bearer
 * minted for another record. Reading it here costs no hop and claims no URL.
 */

/** The address half of a bearer. Checked as a shape, never as a credential — that is the record's. */
const REC_ID = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The record a bearer says it is for, or `null`.
 *
 * IT IS A CLAIM AND NOT A FACT. Everything this establishes is which object to ask; the object then
 * compares the secret's hash against its own table and refuses a bearer it does not know. The two
 * halves are deliberately in different places: only the object holding the table can say whether the
 * hash is in it, and asking anywhere else would be a search across every customer.
 *
 * THE SHAPE IS CHECKED BEFORE THE STRING IS USED AS AN ADDRESS, because `idFromName` on a name
 * nobody has CREATES an object rather than failing — so an unchecked id is an attacker minting empty
 * records, and the caller asks the Directory whether this one is ours before addressing it at all.
 */
export function recordOf(authorization: string | null): string | null {
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
  if (!bearer) return null;
  const cut = bearer.indexOf('.');
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  return REC_ID.test(record) ? record : null;
}

/**
 * Whether this Worker answers for this path at all.
 *
 * 33 §4'S OWN LIST, AND ONLY THE PART THAT IS BUILT. Everything else that belongs to this Worker in
 * the document — `/mcp`, `/a/*`, `/s/*`, `/in/*`, `/auth/*`, `/ws` — does not exist yet, and a router
 * claiming them now would answer 401 for routes whose whole point is being reachable without one.
 * Everything outside the list is the app's: that is what `run_worker_first` means.
 */
export const servesApi = (pathname: string): boolean => /^\/+api\/+[^/]/.test(pathname);
