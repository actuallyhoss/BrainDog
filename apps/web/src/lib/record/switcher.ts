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
 * in `@braindog/record/directory` drops a record that answers with no level, so a person the Directory
 * still lists and a record has since removed is left off this list rather than shown with a level
 * nobody granted. This file only draws what the host already decided.
 *
 * PURE, for the reason `device.ts` gives: `node --test` cannot import a `.svelte.ts` file. The fetch
 * is handed in so a test hands in something that is not a socket.
 */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type Refusal = { code: string; fix: string; at?: string | undefined };
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/** One row: a record this person can reach, the name it calls itself, and the level they actually hold there. */
export type SwitcherRow = { slug: string; name: string; level: string };

const isAnswer = (v: unknown): v is Answer<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && ((v as { ok: unknown }).ok === true ? 'value' in v : 'refusal' in v);

const unreachable = (): Answer<never> => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'This host answered nothing recognisable.' } });

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
