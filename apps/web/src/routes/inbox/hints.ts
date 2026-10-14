/**
 * What each waiting arrival is, as the record reads it: the short muted line the Inbox draws under a row's title.
 *
 * THE RECORD WORKS IT OUT, NOT THE SCREEN. `inboxHints({ ids })` answers, for each arrival asked about, `what` it is (a
 * payment, someone writing, or nothing it can say), `who` in the record's own name for the sender, and the `amount` in
 * the record's short money words. This file only reads that answer and says it, so the screen and the record cannot
 * disagree about what came in.
 *
 * ONE CALL FOR THE ROWS DRAWN, NEVER ONE A ROW. The record reads at most `HINTS_MOST` arrivals a call, and the newest
 * are the ones on screen.
 *
 * A HOST THAT DOES NOT ANSWER IS NOT AN ERROR. An older host has no such method (`ROUTE_UNKNOWN`, or `NOT_IN_THIS_BUILD`
 * at its name), and any other refusal is the record's own. Each reads as `null`, and the Inbox draws what it drew
 * before: the title and nothing under it.
 *
 * A ROUTE-ONLY MODULE, loaded by the Inbox once its rows are drawn, like `shapes.ts`.
 */

/** The most arrivals the record reads in one call, as `inboxHints` takes them. */
export const HINTS_MOST = 50;

/** What the record can say an arrival is. */
export type HintWhat = 'payment' | 'someone writing' | null;

/** One arrival's hint, as `inboxHints` answers it. */
export type Hint = { id: string; what: HintWhat; who: string | null; amount: string | null };

/**
 * The one door this reads through: the client's `call`, so a stand-in can answer in a test. A refusal is a value, as
 * everywhere in the client; a door that throws reads as a refusal too.
 */
export type Call = (name: string, args: Record<string, unknown>) => Promise<{ ok: true; value: unknown } | { ok: false }>;

const WHATS: readonly HintWhat[] = ['payment', 'someone writing', null];

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** One answered hint, or `undefined` when it is not one the record would send. */
function hintOf(raw: unknown): Hint | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return undefined;
  const what = (r.what ?? null) as HintWhat;
  if (!WHATS.includes(what)) return undefined;
  return { id: r.id, what, who: text(r.who), amount: text(r.amount) };
}

/**
 * The hints for these arrivals, by id, from one call. The first `HINTS_MOST` distinct ids are asked about, and none is
 * a call of its own. An id the record leaves out (one the reader may not read) has no hint, and an answer for an id
 * that was not asked is dropped.
 *
 * `null` WHEN THE HOST DID NOT ANSWER: an unknown method, a refusal, a door that threw, or an answer of another shape.
 */
export async function readHints(call: Call, ids: readonly string[]): Promise<ReadonlyMap<string, Hint> | null> {
  const asked = [...new Set(ids)].slice(0, HINTS_MOST);
  if (asked.length === 0) return new Map();
  let out: Awaited<ReturnType<Call>>;
  try {
    out = await call('inboxHints', { ids: asked });
  } catch {
    return null;
  }
  if (!out.ok) return null;
  const hints = (out.value as { hints?: unknown } | null)?.hints;
  if (!Array.isArray(hints)) return null;
  const wanted = new Set(asked);
  const by = new Map<string, Hint>();
  for (const raw of hints) {
    const hint = hintOf(raw);
    if (hint && wanted.has(hint.id)) by.set(hint.id, hint);
  }
  return by;
}

/* A NAME, NEVER AN ADDRESS OR AN ID. The record promises a name; a sender's own display name can still be a bare address
   or a handle the record minted, and neither is said on a row. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const sayable = (who: string | null): string | null => {
  if (who === null) return null;
  if (who.includes('@') || /^https?:\/\//i.test(who) || ULID.test(who)) return null;
  return who;
};

/* No em dash in a line a person reads: one inside a display name becomes a comma. */
const plain = (line: string): string => line.replace(/\s*—\s*/g, ', ');

/**
 * The line under an arrival's title: "Payment, EGP 420, Quietcart" (each part the record could not say left out),
 * "From Mara Okafor", or `null` when there is nothing to say.
 */
export function hintLine(hint: Hint | null | undefined): string | null {
  if (!hint) return null;
  const who = sayable(hint.who);
  if (hint.what === 'payment') return plain(['Payment', hint.amount, who].filter((p): p is string => p !== null).join(', '));
  if (hint.what === 'someone writing') return who === null ? null : plain(`From ${who}`);
  return null;
}

/**
 * The lines for these arrivals, by id, through the record at `base`: what the Inbox draws. Only the arrivals with
 * something to say are in it, and `null` is a host that did not answer.
 */
export async function linesFor(base: string, ids: readonly string[]): Promise<ReadonlyMap<string, string> | null> {
  const { createClient } = await import('@braindog/client');
  const read = await readHints(createClient({ base }).call, ids);
  if (read === null) return null;
  const lines = new Map<string, string>();
  for (const [id, hint] of read) {
    const line = hintLine(hint);
    if (line !== null) lines.set(id, line);
  }
  return lines;
}
