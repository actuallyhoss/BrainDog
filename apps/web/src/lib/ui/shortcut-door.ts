/**
 * The Shortcut door's screen: one press at `POST /api/ingestMint`, and the address an iPhone Shortcut posts a bank's
 * text to, built from what that press answers.
 *
 * IT EXISTED WITH NO CALLER, WHICH IS WHY THIS FILE EXISTS. `e20ed683` taught both hosts to take an SMS at
 * `/in/webhook/<rec>/bank-from-out-sms/<token>` and routed the mint as an ADMIN write, and grepped the same day nothing
 * in `apps/web` called `ingestMint`: the only way to get a token was a test or a POST typed by hand.
 *
 * THROUGH THE CLIENT, UNLIKE `inbound-write.ts`. The forwarding address is a Directory door and not a record method,
 * which is why that file calls `fetch` itself. `ingestMint` IS a record method, in `ROUTES`, so `client.call` sends it
 * the way every other write is sent and the verb comes from the same table the server reads.
 *
 * NOTHING HERE LOGS AND NOTHING HERE KEEPS. The answer carries the only copy of a credential there will ever be (the
 * record keeps its SHA-256 and nothing reads it back), and `shortcut-door.test.ts` asserts this file and the component
 * hold no logging call and no browser storage. It failed once on this very sentence, which named the call it forbids.
 */

import { createClient } from '@braindog/client';
import type { Fetch } from '../record/boot-live.ts';
import { noRecord } from '../record/device.ts';
import { copy } from '../copy.ts';

/** The ingest the money pack declares for a bank text, with `verify: { kind: path }`. */
export const SHORTCUT_INGEST = 'bank-from-out-sms';

/**
 * Where the Shortcut posts, in the Cloud's five-segment shape.
 *
 * THE ONE SHAPE BOTH HOSTS READ A TOKEN FROM. The self-host also serves `/in/webhook/<ingest>`, but that path has no
 * segment for a token, so a text posted there is stored `untriaged` however right the token was
 * (`apps/selfhost/test/shortcut-arrival.test.ts`). THE TRAILING SLASH IS TAKEN OFF for `mailUrl`'s reason: a host typed
 * by hand carries one, and `//in/webhook` is a path neither door parses.
 */
export const shortcutUrl = (base: string, rec: string, token: string): string =>
  `${base.replace(/\/+$/, '')}/in/webhook/${rec}/${SHORTCUT_INGEST}/${token}`;

/**
 * What the screen shows after a press. Every arm is a sentence rather than a failure.
 *
 * `url` IS `null` WHEN THE ANSWER CARRIES NO RECORD ID, and today it never does: `ingestMint` answers `{ ingest, token }`,
 * and neither `boot` (slug, name, locale) nor `whoami` sends the id either. Both doors compare that segment against the
 * record's own id and answer 404 to anything else, so an address built from the slug or a guess would be a URL that
 * never matches. The screen shows the token and says what is missing instead.
 */
export type Said =
  | { kind: 'minted'; token: string; url: string | null }
  | { kind: 'signin'; fix: string }
  | { kind: 'sample' }
  | { kind: 'refused'; fix: string };

type Refusal = { code: string; fix: string };
type Answered = { ok: true; value: unknown } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** One answer from the record, as the screen says it. */
export function saidOf(out: Answered, base: string): Said {
  if (out.ok) {
    const v = (out.value ?? {}) as { token?: unknown; rec?: unknown };
    /* A SUCCESS WITH NOTHING IN IT IS A HOST THIS SCREEN DOES NOT RECOGNISE. Printing `undefined` into an address is
       worse than saying so. */
    if (typeof v.token !== 'string' || v.token === '') return { kind: 'refused', fix: copy.shortcutNoToken };
    const rec = typeof v.rec === 'string' && v.rec !== '' ? v.rec : null;
    return { kind: 'minted', token: v.token, url: rec === null ? null : shortcutUrl(base, rec, v.token) };
  }
  /* A conflict cannot come back from a mint, which reads no row; it is here so the type is whole. */
  const refusal: Refusal = 'refusal' in out ? out.refusal : { code: 'CONFLICT', fix: copy.shortcutNoToken };
  /* NO RECORD BEHIND THE PAGE, the demo and a static host's SPA fallback, is the sample and not a failure. */
  if (noRecord(refusal.code)) return { kind: 'sample' };
  /* THE RECORD'S OWN SENTENCE, VERBATIM (`13 §6`). It says whether the sign-in is stale or the host was started without
     `BRAINDOG_TOKEN`, and a paraphrase here would say that worse. */
  if (refusal.code === 'NEEDS_BROWSER_SESSION') return { kind: 'signin', fix: refusal.fix };
  return { kind: 'refused', fix: refusal.fix };
}

/**
 * Mint the token. It replaces whatever the record held, and the token is answered once.
 *
 * NO BEARER, because the client is built without one: `ingestMint` refuses a token of any kind before it looks at the
 * level, so the cookie is the whole of what this press authenticates with.
 */
export async function mintShortcut(base: string, io?: Fetch): Promise<Said> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  return saidOf(await client.call('ingestMint', { ingest: SHORTCUT_INGEST }), base);
}
