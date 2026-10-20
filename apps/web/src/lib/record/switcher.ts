/**
 * The record switcher's rows: every open record the signed-in person can reach, from `GET
 * /account/records` (`docs/33-CONTRACTS.md` §4).
 *
 * THE DIRECTORY'S, LIKE `/account/usage` in `actions.ts`, and never `@braindog/client`'s: that
 * client is scoped to one record and answers what a PERSON may do ON it, and there is no such
 * question to ask about a record this tab is not even open on. This is the account's own read,
 * asked once for every record a person can reach at all, for the same reason `actions.ts` reads
 * `/account/usage` by hand rather than through the record's client.
 *
 * NAMED AND LEVELLED BY EACH RECORD ITSELF, never a guess built from the Directory alone: `switcherRows`
 * in `@braindog/record/directory` drops a record that answers with no level and no lists, so a person the
 * Directory still lists and a record has since removed is left off this list rather than shown with a level
 * nobody granted. This file only draws what the host already decided.
 *
 * PURE, for the reason `device.ts` gives: `node --test` cannot import a `.svelte.ts` file. The fetch
 * is handed in so a test hands in something that is not a socket.
 */

import { BASE } from '../at.ts';
import { copy } from '../copy/frame.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type Refusal = { code: string; fix: string; at?: string | undefined };
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/**
 * One row: a record this person can reach, the name it calls itself, and the level they actually hold there.
 *
 * A PERSON WHO HOLDS LISTS AND NOT THE RECORD ARRIVES WITH `level: null`, from both hosts, plus the list ids and a
 * word for the row in `held` (`SwitcherRow` in `@braindog/record/directory`, which this mirrors because the web does
 * not depend on that package). This type said `level: string` after the hosts stopped dropping that row, so nothing
 * checked the one place that drew it: the rail printed `{r.level}` into an empty span beside the one record a
 * bookkeeper invited to Expenses was on.
 */
export type SwitcherRow =
  | { slug: string; name: string; level: string }
  | { slug: string; name: string; level: null; lists: string[]; names?: string[] | undefined; words?: string | undefined; held: string };

/**
 * The word a row wears beside its name: nothing for an owner, the level for anybody else who holds the record, and
 * for somebody who holds lists only the host's `words`, which name them ("Some lists: Tickets"), never their ids.
 *
 * THE HOST WRITES THOSE WORDS (`heldSaid` in `@braindog/record/directory`) and this draws them, because this file is
 * in the script every screen loads and a copy of the rule here cost more bytes than that script has left. A row from a
 * host with no `words` wears its `held` word, as it always did.
 */
export const levelWord = (row: SwitcherRow): string | null => (row.level === null ? (row.words ?? row.held) : row.level === 'owner' ? null : row.level);

const isAnswer = (v: unknown): v is Answer<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && ((v as { ok: unknown }).ok === true ? 'value' in v : 'refusal' in v);

/* ONE SENTENCE FOR EVERY TRANSPORT FAILURE, THE SAME ONE A SCREEN SAYS. This said "This host answered
   nothing recognisable.", which is the transport's view of the fault and nothing a person can act on; it was drawn as
   content wherever the list of records is shown. */
const unreachable = (): Answer<never> => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: copy.readOffline } });

/**
 * `GET /account/records`, read as the host's envelope.
 *
 * A 401 IS "SIGN IN AGAIN" and never a record's own refusal: the account route reads the session
 * cookie and nothing else, so an ended session is the one shape of "no" it ever says by itself.
 */
export async function readRecordsForSwitcher(io: Fetch, base = ''): Promise<Answer<SwitcherRow[]>> {
  let res: Response;
  try {
    res = await io(`${base}/account/records`, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return unreachable();
  }
  if (res.status === 401) return { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again to see the records you can reach.' } };
  const said: unknown = await res.json().catch(() => undefined);
  return (isAnswer(said) ? said : unreachable()) as Answer<SwitcherRow[]>;
}

/** What pressing another record's row came to: it is open now, this host has no second record to open, or the host's sentence. */
export type Opened = { from: 'opened'; to: string } | { from: 'absent' } | { from: 'refused'; fix: string };

/**
 * `POST /auth/switch`: open another record this person is on, in this browser.
 *
 * THE SESSION ROW MOVES AND THE COOKIE DOES NOT, and the answer says where to go: `/app/<slug>/`, which names the record
 * opened in the address. The caller used to reload the page it was on, whose address named no record, so a second tab
 * on the first record silently began reading and writing the second one. The switch
 * still happens, because it is what `/app` with no slug opens next time.
 *
 * `/auth/switch` AND `/account/records` ARE AT THE ROOT, under no slug: they are the person's, not a record's.
 *
 * `absent` IS A HOST WITH NO SUCH DOOR: the sample on a static host answers its 404 page, and a host where nobody signs in
 * answers `ROUTE_UNKNOWN`. Neither holds a second record, so the switcher says what would have opened, as it always did.
 */
export async function openRecord(io: Fetch, slug: string, base = ''): Promise<Opened> {
  let res: Response;
  try {
    res = await io(`${base}/auth/switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ slug }),
    });
  } catch {
    return { from: 'refused', fix: copy.recordNotOpened };
  }
  const said: unknown = await res.json().catch(() => undefined);
  if (!isAnswer(said)) return { from: 'absent' };
  if (said.ok) return { from: 'opened', to: `${BASE}/${slug}/` };
  if (said.refusal.code === 'ROUTE_UNKNOWN') return { from: 'absent' };
  if (res.status === 401) return { from: 'refused', fix: copy.recordOpenSignIn };
  return { from: 'refused', fix: said.refusal.fix };
}
