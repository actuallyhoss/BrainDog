/**
 * The first run's two asks of Slash, through the host's own Slash doors: `POST /api/slash/setup` for what the person said
 * and `POST /api/slash/mapping` for the first entries of a file they exported elsewhere. Before there is a record,
 * sign-up asks the host's `POST /auth/signup/read` instead (`readAsks`).
 *
 * DOORS, NOT RECORD METHODS, as `/api/slash/pattern` is: the engine is built by the host, holds the month's asks and
 * opens the owner's own key where they chose one, and the record never sees a model (`packages/host/src/slash-ask.ts`).
 * A browser session and this origin; the cookie and the `Origin` are the browser's own and it sends both itself.
 *
 * NEVER A THROW. A host with no model answers 501 `NOT_IN_THIS_BUILD` (a bare 404 or 501 reads the same), a month
 * spent answers `SLASH_BUDGET_SPENT`, and a network that did not answer is `UNREACHABLE` here; every one of them is the
 * first run reading by its own rules instead, so the caller only ever reads a result.
 */

import type { ModelAsk } from '../signup.ts';

export type Refused = { ok: false; refusal: { code: string; fix: string } };
export type Asked<T> = { ok: true; value: T } | Refused;

/** What `proposeSetup` answers (`SetupAnswer` in `@braindog/slash`), restated because the app does not import the engine. */
export type SetupReply = {
  name: string | null;
  summary: string;
  usecase: string | null;
  also: string[];
  modules: string[];
  currency: string | null;
  heard: { phrase: string; became: string }[];
  names: { list: string; name: string }[];
  rows: { list: string; fields: Record<string, unknown> }[];
  draft: string | null;
  by: string;
  /** The one question the reading could not answer, where the read asks one (first-read-setup's answer). */
  ask?: ModelAsk | null;
  /** One turn's quick answer (`quick` on the ask): parts, phrases, a currency and the next question, no names or entries. */
  quick?: true;
};

/** What `proposeMapping` answers (`MappingAnswer` in `@braindog/slash`). */
export type MappingReply = {
  list: string | null;
  fields: { column: string; field: string }[];
  fixed: { field: string; value: string }[];
  summary: string;
  name: string | null;
  by: string;
};

export type SetupOffer = {
  usecases: { id: string; title: string; summary: string }[];
  modules: { id: string; name: string; lists: { id: string; name: string; fields: string[] }[] }[];
};
/** `first`: the owner's sign-up words, read once after the build on the house, never one of the month's asks. */
/** `asked`: the conversation's questions so far, one a line as `about: question` (`lib/start/chat.ts` `askedLines`). */
/** `quick`: one turn of the conversation, read short and fast (`turn`), never the whole reading. */
export type SetupAsked = { said: string; offer: SetupOffer; today: string; first?: boolean; asked?: string; quick?: boolean };
export type MappingAsked = {
  file: string;
  columns: string[];
  sample: Record<string, string>[];
  lists: { id: string; name: string; fields: { id: string; type: string; values?: string[] }[] }[];
};

export type AskSetup = (ask: SetupAsked) => Promise<Asked<SetupReply>>;
export type AskMapping = (ask: MappingAsked) => Promise<Asked<MappingReply>>;

/** How long the first run waits on the model before its own rules answer: a person is watching the screen. */
export const WAIT_MS = 20_000;

const refusedBy = (code: string, fix: string): Refused => ({ ok: false, refusal: { code, fix } });

/** One door, answered as a result whatever happened on the way. */
async function door<T>(send: typeof fetch, url: string, body: unknown, wait: number): Promise<Asked<T>> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), wait);
  try {
    const res = await send(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: stop.signal });
    const out = (await res.json().catch(() => null)) as { ok?: unknown; value?: unknown; refusal?: { code?: unknown; fix?: unknown } } | null;
    if (out?.ok === true) return { ok: true, value: out.value as T };
    const code = typeof out?.refusal?.code === 'string' ? out.refusal.code : res.status === 404 || res.status === 501 ? 'NOT_IN_THIS_BUILD' : 'UNREACHABLE';
    return refusedBy(code, typeof out?.refusal?.fix === 'string' ? out.refusal.fix : `Slash answered ${res.status}.`);
  } catch (e) {
    return refusedBy('UNREACHABLE', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/** The two asks over one record's address (`apiBase()`). `send` is the browser's `fetch`, or a test's. */
export function slashAsks(base: string, send: typeof fetch = (...a) => globalThis.fetch(...a), wait = WAIT_MS): { setup: AskSetup; mapping: AskMapping } {
  return {
    setup: (ask) => door<SetupReply>(send, `${base}/api/slash/setup`, ask, wait),
    mapping: (ask) => door<MappingReply>(send, `${base}/api/slash/mapping`, ask, wait),
  };
}

/** What the sign-up page hands the reading door: what it hands the record's, and where and who is typing. */
export type FirstAsked = SetupAsked & { zone: string; locale: string; turnstile: string };

/**
 * THE READING BEFORE THERE IS AN ACCOUNT, at the host's `POST /auth/signup/read` (`packages/host/src/first-read.ts`).
 * The same reply and the same twenty seconds as the record's door, over the page's own origin and no session.
 *
 * THE HOST BUILDS ITS OWN OFFER from its catalogue, and the door takes exactly `said`, `today`, `zone`, `locale`,
 * `turnstile` and `asked`, refusing any other key by name, so the offer the page holds is never sent. A host with the door switched
 * off, no model or no bot check answers 501 `NOT_IN_THIS_BUILD`, a silence is `UNREACHABLE`, and each is the page's
 * own rules reading instead.
 */
export function readAsks(origin: string, send: typeof fetch = (...a) => globalThis.fetch(...a), wait = WAIT_MS): { setup: (ask: FirstAsked) => Promise<Asked<SetupReply>> } {
  return {
    setup: ({ said, today, zone, locale, turnstile, asked, quick }) =>
      door<SetupReply>(send, `${origin}/auth/signup/read`, { said, today, zone, locale, turnstile, ...(asked === undefined ? {} : { asked }), ...(quick === true ? { quick } : {}) }, wait),
  };
}
