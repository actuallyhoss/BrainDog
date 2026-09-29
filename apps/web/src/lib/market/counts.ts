/**
 * How many records hold each listing, as the Kennel counts them (`GET /api/kennel/v1/counts.json`):
 * `{ at, counts: Record<'<kind>:<id>', number> }`.
 *
 * ROUNDED HERE, ONCE, BEFORE ANY SCREEN SEES A NUMBER. Every reader says a count at 10, 50, 100, 500 or 1000 and says
 * nothing below ten (`roundCount`), so a count cannot be read back into which records installed what, and a new add-on
 * is not drawn as "3 installs" beside one with thousands. A count under ten is left out of the answer altogether.
 *
 * NONE IS NOT AN ERROR: a host whose Kennel has no counts yet, a network that fails, or a file in another shape all
 * answer `null`, and browse draws every card without a count.
 */

/* AT THE ORIGIN, NOT UNDER THE APP'S BASE: every host answers the Kennel at `/api/kennel/v1/` (`KENNEL_BASE` in
   `@braindog/declare/kennel`), and the marketing site forwards `/api/*` to the app. Written out rather than imported, so
   a screen's first chunk does not carry the declare package and the kernel for one string. */
export const KENNEL_AT = '/api/kennel/v1/';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** The Kennel's counts, rounded, with those under ten left out; `null` when there are none to read. */
export async function readCounts(fetcher: Fetcher): Promise<Record<string, number> | null> {
  let doc: unknown;
  try {
    const res = await fetcher(`${KENNEL_AT}counts.json`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    doc = await res.json();
  } catch {
    return null;
  }
  const raw = typeof doc === 'object' && doc !== null ? (doc as { counts?: unknown }).counts : undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { roundCount } = await import('@braindog/declare/kennel');
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(raw)) {
    const said = typeof n === 'number' ? roundCount(n) : null;
    if (said !== null) out[key] = said;
  }
  return out;
}
