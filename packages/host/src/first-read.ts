/**
 * `/auth/signup/read`: a model reads a stranger's first sentence before there is an account.
 *
 * ONE DOOR BOTH HOSTS MOUNT. The Worker and the self-host each build a `FirstReadDoor` from what they have (a bot
 * check, a meter, the use cases on offer, a reader bound to their model) and hand the request here, so the checks and
 * the sentences are the same on both. The reader is a port: this package does not depend on `@braindog/slash`.
 *
 * THE SAME CHECKS THE SIGN-UP DOORS MAKE, in their order: a POST, from a page on this origin, as JSON, of 8 KB at most.
 * Then the body's keys, exactly `said`, `today`, `zone`, `locale`, `turnstile` and `asked` (what BrainDog asked her so
 * far, in the conversation of 1 Nov), and `quick` (one turn of it, read short and fast); another is refused by name.
 *
 * SWITCHED OFF UNLESS ALL THREE ARE THERE. A model reads a stranger's words only when the owner turned it `on`, a
 * reader is bound, and a bot check is keyed; otherwise a 200 saying so, which the page reads as "simple rules read it". Then the bot
 * check, then the meter (eighteen readings for one address a day, three conversations, and one ceiling for all strangers), and only then the
 * reader, whose own refusal comes back with its code kept (`UNREACHABLE`, `PROPOSAL_SCHEMA`, `SLASH_BUDGET_SPENT`).
 *
 * WHAT SHE SAID IS NEVER KEPT. It is handed to the reader and nowhere else: not logged, not put in a header, not
 * written down. Nothing in this file prints at all, so an error from the reader, which may quote her, stays unsaid.
 */

import type { RefusalCode } from '@braindog/ports';

import { sameOrigin } from './auth.ts';

/** What a host hands the door. `read` and `botCheck` are null where that host has no model or no bot check keyed. */
export type FirstReadDoor = {
  /** The address to count by, where the host has worked it out itself. On a self-host `x-forwarded-for` is the caller's to write until a proxy is trusted. */
  ip?: string | undefined;
  /** This BrainDog's own origin, `https://` and the host: the only page whose sentence is read. */
  origin: string;
  /** The owner's yes to a model reading a stranger's words. Off by default on every host. */
  on: boolean;
  botCheck: ((token: string, ip: string) => Promise<boolean>) | null;
  /** One reading spent for this address on this UTC day, or which limit stopped it. */
  meter: { take(ip: string, day: string): Promise<'ok' | 'address' | 'day'> };
  /** What is on offer to be read into: the host's use cases and modules, as the reader takes them. */
  offer(): Promise<unknown>;
  read: ((ask: { said: string; offer: unknown; today: string; asked?: string; quick?: boolean }) => Promise<{ ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string } }>) | null;
};

/** The most a body may be, as the sign-up doors hold it (`SIGNUP_BODY_MAX` in the Worker). */
export const FIRST_READ_BODY_MAX = 8_192;

/**
 * The most of what she said that is read, in characters. A conversation's answers together (1 Nov), so twice what the
 * mailed link carries (`SIGNUP_SAID_MOST`): the link carries the start, and this device keeps the whole.
 */
export const FIRST_READ_SAID_MOST = 2_000;

/** What BrainDog asked her so far (`asked`, one question a line), in characters at most. */
export const FIRST_READ_ASKED_MOST = 1_200;

const KEYS = ['said', 'today', 'zone', 'locale', 'turnstile', 'asked'] as const;
/** `quick`, a turn of the conversation and not the whole reading (`turn` in `@braindog/slash`): the one key that is not text. */
const QUICK = 'quick';

export const FIRST_READ_OFF = 'This BrainDog does not read a sign-up with a model, so simple rules read it.';
export const FIRST_READ_NOT_PERSON = 'The check that you are a person did not pass.';
export const FIRST_READ_ADDRESS_SPENT = 'Eighteen readings a day is the most for one address. Simple rules read it now.';
export const FIRST_READ_DAY_SPENT = 'Today’s readings for new people are all used. Simple rules read it now.';
const UNANSWERED = 'The reader did not answer. Simple rules read it now.';
const UNCOUNTED = 'Readings cannot be counted just now. Simple rules read it now.';

/* One browser's answer, never a cache's, as every `/auth` answer is. Not the sniffing header the sign-up doors also
   send: core-names reads its last word as a guide's field, and its held list only shrinks (see the report). */
function reply(status: number, payload: object, extra: readonly [string, string][] = []): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...extra],
  });
}

const refused = (status: number, code: RefusalCode, fix: string, at?: string, extra: readonly [string, string][] = []): Response =>
  reply(status, { ok: false, refusal: { code, fix, ...(at === undefined ? {} : { at }) } }, extra);

/** The address the sign-up doors count by, where the host hands none (`FirstReadDoor.ip`): what Cloudflare wrote, or a proxy's first hop. */
export function firstReadIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf !== null && cf.trim() !== '') return cf.trim();
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim();
}

/* A model's refusal keeps its code; the status only tells a proxy what kind of no it was. */
const statusOf = (code: string): number => (code === 'UNREACHABLE' ? 503 : code === 'SLASH_BUDGET_SPENT' || code === 'RATE_LIMITED' ? 429 : 422);

export async function serveFirstRead(request: Request, door: FirstReadDoor, now = Date.now()): Promise<Response> {
  if (request.method !== 'POST') return refused(405, 'ROUTE_UNKNOWN', 'This door takes a POST.', undefined, [['allow', 'POST']]);
  if (!sameOrigin(request, door.origin)) return refused(403, 'FORBIDDEN', `A sign-up is read only for pages on ${door.origin}.`, 'origin');
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return refused(415, 'BODY_MALFORMED', 'This door takes a JSON object, sent as application/json.');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > FIRST_READ_BODY_MAX) return refused(413, 'BODY_MALFORMED', `This door takes at most ${FIRST_READ_BODY_MAX} bytes.`);
  const raw = await request.text().catch(() => '');
  if (new TextEncoder().encode(raw).length > FIRST_READ_BODY_MAX) return refused(413, 'BODY_MALFORMED', `This door takes at most ${FIRST_READ_BODY_MAX} bytes.`);

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refused(400, 'BODY_MALFORMED', 'This door takes a JSON object, sent as application/json.');
  const body = parsed as Record<string, unknown>;
  const extra = Object.keys(body).find((k) => k !== QUICK && !(KEYS as readonly string[]).includes(k));
  if (extra !== undefined) return refused(400, 'FIELD_UNKNOWN', `This door takes ${KEYS.join(', ')} and ${QUICK}, and not ${extra.slice(0, 40)}.`, extra.slice(0, 40));
  for (const k of KEYS) {
    if (body[k] !== undefined && typeof body[k] !== 'string') return refused(400, 'BODY_MALFORMED', `${k} is sent as text.`, k);
  }
  if (body[QUICK] !== undefined && typeof body[QUICK] !== 'boolean') return refused(400, 'BODY_MALFORMED', `${QUICK} is true or false.`, QUICK);
  const quick = body[QUICK] === true;
  const said = typeof body['said'] === 'string' ? body['said'] : '';
  const today = typeof body['today'] === 'string' ? body['today'] : '';
  if (said.trim() === '') return refused(400, 'BODY_MALFORMED', 'Say a sentence first, then it can be read.', 'said');
  if (said.length > FIRST_READ_SAID_MOST) return refused(400, 'BODY_MALFORMED', 'At most 2,000 characters are read. Shorten it, or leave the rest for later.', 'said');
  const asked = typeof body['asked'] === 'string' ? body['asked'].slice(0, FIRST_READ_ASKED_MOST) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return refused(400, 'BODY_MALFORMED', 'today is the date where you are, written as 2026-10-14.', 'today');

  const read = door.read;
  /* OFF IS AN ANSWER, NOT A FAILURE (onboarding audit AP31): a 200 that says no model reads here, which the page reads as
     the rules reading, where a 501 put a red line in every stranger's console on every sign-up. */
  if (!door.on || read === null || door.botCheck === null) return refused(200, 'NOT_IN_THIS_BUILD', FIRST_READ_OFF);

  const ip = door.ip ?? firstReadIp(request);
  const token = typeof body['turnstile'] === 'string' ? body['turnstile'] : '';
  const person = token !== '' && (await door.botCheck(token, ip).catch(() => false));
  if (!person) return refused(403, 'FORBIDDEN', FIRST_READ_NOT_PERSON, 'turnstile');

  const day = new Date(now).toISOString().slice(0, 10);
  /* A meter that cannot answer holds the door shut: nothing is read uncounted. */
  const held = await door.meter.take(ip, day).catch(() => null);
  if (held === null) return refused(503, 'UNREACHABLE', UNCOUNTED);
  if (held !== 'ok') {
    const midnight = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
    const wait = String(Math.max(1, Math.ceil((midnight - now) / 1000)));
    return refused(429, 'RATE_LIMITED', held === 'address' ? FIRST_READ_ADDRESS_SPENT : FIRST_READ_DAY_SPENT, undefined, [['retry-after', wait]]);
  }

  try {
    const out = await read({ said, offer: await door.offer(), today, ...(asked.trim() === '' ? {} : { asked }), ...(quick ? { quick } : {}) });
    if (out.ok) return reply(200, { ok: true, value: out.value });
    return reply(statusOf(out.refusal.code), { ok: false, refusal: { code: out.refusal.code, fix: out.refusal.fix } });
  } catch {
    return refused(503, 'UNREACHABLE', UNANSWERED);
  }
}

/* ── what is on offer: the catalogue's use cases over the build's ─────────────────────────────────────── */

/** One use case the reader may read a sentence into: what the model is told, the words it is heard in, the modules it stands on. */
export type FirstReadCase = { id: string; title: string; summary: string; signals: readonly string[]; modules: readonly string[] };

/** One entry of a catalogue's index, as far as this door reads it (`CatalogueEntry` in `@braindog/declare/catalogue`). */
export type FirstReadEntry = {
  kind: string;
  id: string;
  title?: unknown;
  summary?: unknown;
  unlisted?: unknown;
  signals?: unknown;
  modules?: unknown;
};

/** The merged offer, and the ids of entries left out for having no title, for the host to say once in its log. */
export type FirstReadMerged = { cases: FirstReadCase[]; untitled: string[] };

/* Words kept only as words: each a string with something in it, trimmed, the first of any repeat kept. */
const wordsOf = (x: unknown): string[] | null => {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const w of x) if (typeof w === 'string' && w.trim() !== '' && !out.includes(w.trim())) out.push(w.trim());
  return out;
};

const textOf = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');

/**
 * THE CATALOGUE'S USE CASES MERGED OVER THE BUILD'S, BY ID. A front published as a file is offered with no code change:
 * the landlord who types "I rent out six flats" can be read into Landlord because the catalogue lists it.
 *
 * THE CATALOGUE'S WINS where both name one id, and what it leaves unsaid (a summary, its signals, its modules) is the
 * build's. An entry whose latest file says `unlisted` is left out, built-in or not, as every listing leaves it out. An
 * entry with no title is left out and its id handed back to be said, and the build's case of that id, if any, stands:
 * a broken entry never takes away what the build already offered. Only the first entry for an id counts.
 *
 * THE ORDER IS THE CATALOGUE'S, THEN THE BUILD'S, AND NOTHING ELSE. Two cases claiming one word ("rent" is Landlord's
 * and Personal's) stand in the order the index lists them, every read, since nothing here sorts by anything but where an
 * entry stood: one sentence is never proposed two use cases on two nights (the unit's risk). The build's cases the
 * catalogue does not list follow, in their compiled order. Pure: it reads nothing and says nothing.
 */
export function firstReadOfferFrom(entries: readonly FirstReadEntry[], builtIns: readonly FirstReadCase[]): FirstReadMerged {
  const built = new Map(builtIns.map((b) => [b.id, b] as const));
  const seen = new Set<string>();
  const settled = new Set<string>();
  const cases: FirstReadCase[] = [];
  const untitled: string[] = [];
  for (const e of entries) {
    if (e.kind !== 'usecase' || typeof e.id !== 'string' || e.id === '' || seen.has(e.id)) continue;
    seen.add(e.id);
    const title = textOf(e.title);
    if (title === '') {
      untitled.push(e.id);
      continue;
    }
    settled.add(e.id);
    if (e.unlisted === true) continue;
    const was = built.get(e.id);
    cases.push({
      id: e.id,
      title,
      summary: textOf(e.summary) || (was?.summary ?? ''),
      signals: wordsOf(e.signals) ?? [...(was?.signals ?? [])],
      modules: wordsOf(e.modules) ?? [...(was?.modules ?? [])],
    });
  }
  for (const b of builtIns) if (!settled.has(b.id)) cases.push({ ...b, signals: [...b.signals], modules: [...b.modules] });
  return { cases, untitled };
}

/** Each word on offer and the cases that claim it, in offer order: the first is the one a tie goes to, every read. */
export function firstReadClaims(cases: readonly FirstReadCase[]): Map<string, string[]> {
  const claims = new Map<string, string[]>();
  for (const c of cases)
    for (const w of c.signals) {
      const key = w.toLowerCase();
      const by = claims.get(key) ?? [];
      if (!by.includes(c.id)) by.push(c.id);
      claims.set(key, by);
    }
  return claims;
}

/** The most of a case's words the model is told, so one case with a long list cannot crowd the others out of the prompt. */
export const FIRST_READ_SIGNALS_TOLD = 48;

/**
 * What the model is told of a case: its summary and the words it is heard in. The reader's prompt prints an id, a title
 * and a summary (`caseLines` in `@braindog/slash`), so the words ride in the summary until it prints them itself.
 */
export function firstReadTold(c: FirstReadCase): { id: string; title: string; summary: string; signals: readonly string[]; modules: readonly string[] } {
  const words = c.signals.slice(0, FIRST_READ_SIGNALS_TOLD);
  const summary = words.length === 0 ? c.summary : `${c.summary}${c.summary === '' || /[.!?]$/u.test(c.summary) ? '' : '.'} Heard in: ${words.join(', ')}.`.trim();
  return { id: c.id, title: c.title, summary, signals: c.signals, modules: c.modules };
}

/** What a host's log says when the catalogue could not be read: the build's own use cases are what is offered. */
export const FIRST_READ_CATALOGUE_UNREAD = "first read: this host's catalogue did not read, so a sign-up is read against the use cases built in.";

/** What a host's log says when it has no catalogue to read at all. */
export const FIRST_READ_NO_CATALOGUE = 'first read: this host has no catalogue, so a sign-up is read against the use cases built in.';

/**
 * The cases on offer, read from a catalogue: its index's entries over the build's, or the build's alone where there is
 * no catalogue or it does not read, never a refusal, since a stranger's sentence can always be read against what was
 * built. `said` is the one log line the host writes, or null when all of it read; it names ids only, never a sentence.
 */
export async function firstReadCasesRead(
  readEntries: (() => Promise<readonly FirstReadEntry[] | null>) | null,
  builtIns: readonly FirstReadCase[],
): Promise<{ cases: FirstReadCase[]; said: string | null }> {
  const entries = readEntries === null ? null : await readEntries().catch(() => null);
  if (entries === null) return { cases: firstReadOfferFrom([], builtIns).cases, said: readEntries === null ? FIRST_READ_NO_CATALOGUE : FIRST_READ_CATALOGUE_UNREAD };
  const merged = firstReadOfferFrom(entries, builtIns);
  const said = merged.untitled.length === 0 ? null : `first read: the catalogue lists use cases with no title, so they are not offered: ${merged.untitled.join(', ')}.`;
  return { cases: merged.cases, said };
}
