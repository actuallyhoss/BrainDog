/**
 * The one send loop for scheduled actions (`pull`, `call` and `poll`), shared by both hosts.
 *
 * THE RECORD BUILDS THE REQUEST AND THIS FILE SENDS IT. The kernel's `runActions` hands over a method, an address,
 * the origin the declaration names and the key it wants by reference. This file decides whether the request may
 * leave at all, opens the key through the host, and answers with a status, a body and what the run cost.
 *
 * WHAT IT ALLOWS OUT, and nothing else:
 *
 *   · https only, and only to an origin an installed, active declaration names, read fresh on every run;
 *   · never to a host written as a literal private or local address, `localhost` or `.internal`;
 *   · a redirect only to the same origin, three at most, each hop checked again;
 *   · ten seconds for the whole run, the body included;
 *   · two megabytes of answer, counted as it streams, so a lying `Content-Length` is still a cap.
 *
 * WHAT EACH HOST PASSES IN is only what differs. The self-host passes `pin`, which resolves a name, refuses it when
 * any address is private, and hands `send` the address it checked so the socket connects to nothing else. The Worker
 * passes no `pin`: Cloudflare does not route a Worker's `fetch` to a private address. Each passes its own `send`
 * and its own key opener, or `null` for a host with no key store.
 *
 * THE KEY IS OPENED FOR ONE REQUEST, only once every check has passed, and sent to the origin that named it the way
 * its declaration says: a bearer, a header, a query parameter or a basic pair, built by `@braindog/connect`'s auth
 * builder (`authoriseCall`). Its value, and every value the builder put on the request, is scrubbed from everything
 * this file returns, the provider's answer included, in every spelling `spellingsOf` names, so a provider that echoes
 * the header back does not put the key in the record.
 *
 * A PROVIDER'S `Retry-After` on a 429 or a 5xx goes back as the instant it names (`notBefore`), and the record arms the
 * retry no sooner.
 *
 * NO RUNTIME HERE. No `node:` import and no bare `fetch`, so both hosts import it and the stack gate holds.
 */

import { authoriseCall, PullError, retryAfterMs } from '@braindog/connect';
import { hostOpened, reserveFor, type Budget, type PagedRun } from '@braindog/kernel';
import type { RecordApi } from '@braindog/record';
import { METER_MANY_MAX, type COUNTED_ONLY } from '@braindog/record/directory';

type Kernel = RecordApi['kernel'];

/** A name prefix the Directory counts and never limits, so a prefix it drops fails here rather than counting a delivery as a run. */
type CountedPrefix = (typeof COUNTED_ONLY)[number];

/** The executor `runActions` is handed. */
export type Execute = Parameters<Kernel['runActions']>[0];
/** One request, as the record builds it: no key in it, only the name of one. */
export type ActionRequest = Parameters<Execute>[0];
/** What an executor answers: a status and a body, or why nothing was sent. */
export type ActionAnswer = Awaited<ReturnType<Execute>>;
/** One run a pass metered, as the kernel hands it over. */
export type Metered = Awaited<ReturnType<Kernel['runActions']>>['usage'][number];

type RefusedCode = Extract<ActionAnswer, { refused: unknown }>['refused']['code'];

/** Opens the key a request names, by reference, or answers `null` when this host cannot. */
export type OpenKey = (grant: { id: string; label: string }) => Promise<string | null>;

/**
 * Checks where one hop goes, and answers what `send` connects to, or the sentence a refusal carries. A throw is the
 * network: a name that resolved to nothing is tried again later, not refused.
 */
export type Pin<P> = (at: URL, signal: AbortSignal) => Promise<P | string>;

/** Sends one request. `pinned` is what `pin` answered, or `undefined` on a host that passes no `pin`. */
export type Send<P> = (input: URL, init: RequestInit, pinned: P) => Promise<Response>;

/** Same-origin redirects followed before the run is refused. */
export const REDIRECT_HOPS = 3;

/** What stands in a returned text where a key's value was. The record's own word for a withheld value. */
export const REDACTED = '--redacted--';

/** The sentence an action that names a key gets on a host with no key store. */
export const NO_KEY_STORE = 'This host holds no key store yet, so the key';

/** A derived spelling shorter than this is not scrubbed: see `spellingsOf`. */
const SHORTEST_SPELLING = 8;

/** One spelling of a key: its exact text, or a pattern for a spelling that may be written more than one way, such as one a line break may fall anywhere inside. */
export type Spelling = string | RegExp;

/** A pattern source for `text` exactly, every character a regular expression gives a meaning taken literally. */
const literally = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The tokens, each a pattern source, in order with `gap` allowed, and not required, between any two: a spelling a wrap can fall inside. */
const wrappable = (tokens: readonly string[], gap: string): RegExp => new RegExp(tokens.join(`(?:${gap})?`), 'g');

/** A pattern source for hex digits in either case, `3d` or `3D`, and not a flag: the key's own letters keep their case. */
const eitherCase = (hex: string): string => hex.replace(/[a-f]/gi, (d) => `[${d.toLowerCase()}${d.toUpperCase()}]`);

/** Every byte as two hex digits, lower-case. */
const hexOf = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * A pattern source for one character of a key as a JSON string or an HTML page may write it: itself, as `JSON.stringify`
 * writes it, as `\/`, as `\uXXXX` (a pair of them past the BMP), as `&#NN;` or as `&#xNN;`, the hex in either case and
 * leading zeros allowed in a reference. A character in `[A-Za-z0-9_-]` is only itself, which no encoder measured escapes by default.
 */
function escapable(char: string): string {
  if (/^[A-Za-z0-9_-]$/.test(char)) return char;
  const point = char.codePointAt(0) ?? 0;
  const units = [...Array(char.length).keys()].map((i) => `\\\\u${eitherCase(char.charCodeAt(i).toString(16).padStart(4, '0'))}`).join('');
  const ways = new Set([literally(char), literally(JSON.stringify(char).slice(1, -1)), units, `&#0*${point};`, `&#[xX]0*${eitherCase(point.toString(16))};`]);
  if (char === '/') ways.add('\\\\/');
  return `(?:${[...ways].join('|')})`;
}

/**
 * The spellings of an opened key that `sendAction` takes out of what it returns: the patterns first, then the exact
 * texts longest first, so no shorter spelling is struck out of a longer one before the longer is found.
 *
 * THE EXACT BYTES WERE THE ONLY SPELLING, AND A PROVIDER THAT ECHOES THE HEADER NEED NOT ECHO THOSE. Measured in
 * workerd, through the real gateway, with a key holding a `/`: a provider that answered the
 * authorization header JSON-escaped the PHP way (`\/`), base64-encoded whole, or URL-encoded put all three into the
 * sandbox intact, and from there `ctx.log(await r.text())` carried the key onto the run's event.
 *
 * THE SPELLINGS, and no others:
 *
 *   · the bytes as sent;
 *   · JSON-escaped, both as `JSON.stringify` writes a string (a `"`, a `\` or a control character escaped) and with every
 *     `/` escaped as well, which is PHP's `json_encode` default;
 *   · each character outside `[A-Za-z0-9_-]` written as itself or escaped, each independently of the others: as
 *     `JSON.stringify` writes it, as `\/`, as `\uXXXX`, as `&#NN;` or as `&#xNN;`, the hex in either case. That is
 *     System.Text.Json's default (`+` as `+`), Go's `html/template` (`+` as `&#43;`), and an encoder that escapes
 *     every such character, in JSON or in HTML;
 *   · URL-encoded as `encodeURIComponent` writes it, and the same with lower-case hex (`%2f`), which other encoders write;
 *     each of those URL-encoded a second time (`%252F`), which is a URL carried inside another's query; and every byte
 *     percent-encoded, the letters and digits too, in either case of hex;
 *   · hex, every byte as two digits, in either case;
 *   · base64, standard and URL-safe, at each of the three byte offsets the key can start at inside a longer encoded
 *     run, so `btoa('Bearer ' + key)` is caught as well as `btoa(key)`. Only the characters every bit of which is the
 *     key's are replaced; the one or two at either end also carry the bytes beside the key, which differ echo to echo;
 *   · that standard base64 again with a line break (`\n` or `\r\n`, and then a space or a tab or neither) allowed
 *     between any two characters, which is MIME base64 wrapped at 76 columns or at any other width, and a long header
 *     folded as RFC 5322 folds one;
 *   · quoted-printable as RFC 2045 writes it (`=XX` for `=` and every byte outside printable ASCII, the hex in either
 *     case, every other byte as itself) with a soft break (`=\n` or `=\r\n`) allowed between any two tokens;
 *   · UTF-16 in both byte orders, as the scrub sees it, which is those bytes read as UTF-8: every character of the key
 *     with a NUL after it (little-endian) or before it (big-endian). Only for a key that is all ASCII, whose code units
 *     each read back as one character and a NUL; a key with any other character is not caught in UTF-16.
 *
 * WRAPPED BASE64, QUOTED-PRINTABLE AND UTF-16 WERE MEASURED GETTING THROUGH with a
 * 64-character key and a provider that echoed the authorization header: each reached the script with no other spelling
 * intact, and one line of the script's own put the key back together (removing the breaks, or the NULs). A second
 * probe measured nine more the same way, with the same key: hex in either case, every byte percent-
 * encoded, URL-encoded twice, quoted-printable in lower-case hex, System.Text.Json's `+`, Go's `&#43;`, hex
 * character references for `=`, `/` and `+`, and base64 folded with a CRLF and a space. `test/actions.test.ts` holds
 * every one, and each spelling above that was added for them turns a case red when it is taken out.
 *
 * WHAT IT COSTS: every pattern and every text is one pass over the body, and none of them backtracks further than the
 * key's own length from any position, so the scrub is linear in the body. Measured over the scrub alone
 * with that key, before these nine and after: 1 MB of JSON rows holding the key once took 0.75 ms and then 1.06 ms; the
 * worst body tried, the key's folded base64 less its last character repeated to 1 MB, took 0.57 ms and then 6.39 ms,
 * and 3.07 ms at 512 KB. Through the whole `sendAction`, reading the body included, 1 MB went from 2.6 ms to 2.9 ms.
 *
 * NOT CAUGHT, AND SAID SO: a key re-encoded any other way, and these by name. Base32, which no HTTP stack writes by
 * default and which would need its own five offsets as base64 needs three. RFC 2047 encoded-words (`=?utf-8?B?...?=`),
 * which cut the key into separately encoded chunks at whatever width the writer picks, so no one spelling spans the
 * cut. UTF-32, which the WHATWG Encoding Standard does not define, so no web stack labels a body with it and
 * `new TextDecoder('utf-32')` throws in Node; it would be two more texts beside UTF-16's (each character and three NULs)
 * and is left out only because nothing that answers HTTP was found writing it. Beside those: a `\u` escape or a character reference of a letter, digit,
 * `_` or `-`; a named HTML entity (`&plus;`, `&amp;`); a hash of the key; URL-safe base64 with line breaks in it; any of
 * the spellings above inside another, such as base64 of the JSON-escaped key; and any derived spelling shorter than
 * eight characters, which only a key of five bytes or fewer has and which would otherwise be struck out of ordinary
 * text by chance. The bytes as sent are always scrubbed, however short. No list is every spelling: a provider that
 * reverses the string defeats any of them.
 */
export function spellingsOf(secret: string): Spelling[] {
  const json = JSON.stringify(secret).slice(1, -1);
  const url = encodeURIComponent(secret);
  const urlLower = url.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase());
  const bytes = new TextEncoder().encode(secret);
  const hex = hexOf(bytes);
  const everyByte = hex.replace(/../g, '%$&');
  const derived = new Set<string>([
    json,
    json.replaceAll('/', '\\/'),
    url,
    urlLower,
    encodeURIComponent(url),
    encodeURIComponent(urlLower),
    hex,
    hex.toUpperCase(),
    everyByte,
    everyByte.toUpperCase(),
  ]);
  const patterns: RegExp[] = [];
  /* ONE PATTERN FOR THE JSON AND THE HTML ESCAPES, since a character may be escaped or not independently of its
     neighbours: System.Text.Json escapes this `+` and not this `=`. The shortest thing it matches is the key itself. */
  if (secret.length >= SHORTEST_SPELLING) patterns.push(new RegExp([...secret].map(escapable).join(''), 'g'));
  for (const lead of [0, 1, 2]) {
    const padded = new Uint8Array(lead + bytes.length);
    padded.set(bytes, lead);
    let binary = '';
    for (const byte of padded) binary += String.fromCharCode(byte);
    /* A CHARACTER IS SIX BITS, so the first `ceil(8 * lead / 6)` hold some of the lead's and everything from
       `floor(8 * (lead + n) / 6)` on holds some of whatever follows the key. What lies between is the key's alone. */
    const core = btoa(binary).slice(Math.ceil((8 * lead) / 6), Math.floor((8 * (lead + bytes.length)) / 6));
    derived.add(core);
    derived.add(core.replaceAll('+', '-').replaceAll('/', '_'));
    if (core.length >= SHORTEST_SPELLING) patterns.push(wrappable([...core].map(literally), '\\r?\\n[ \\t]?'));
  }
  const printable = (byte: number): boolean => byte >= 0x20 && byte <= 0x7e && byte !== 0x3d;
  const qp = [...bytes].map((byte) => (printable(byte) ? literally(String.fromCharCode(byte)) : `=${eitherCase(byte.toString(16).padStart(2, '0'))}`));
  /* THE LENGTH OF THE SPELLING, not of the pattern: an `=XX` token is three characters however its hex is written. */
  const qpLength = [...bytes].reduce((n, byte) => n + (printable(byte) ? 1 : 3), 0);
  if (qpLength >= SHORTEST_SPELLING) patterns.push(wrappable(qp, '=\\r?\\n'));
  /* ALL ASCII, or the key has a code unit whose two bytes do not read back as one character and a NUL. */
  if ([...secret].every((c) => c.charCodeAt(0) < 0x80)) {
    derived.add([...secret].map((c) => `${c}\u0000`).join(''));
    derived.add([...secret].map((c) => `\u0000${c}`).join(''));
  }
  const texts = [secret, ...[...derived].filter((s) => s !== secret && s.length >= SHORTEST_SPELLING)];
  return [...patterns, ...texts.sort((a, b) => b.length - a.length)];
}

/* ── the ledger ─────────────────────────────────────────────────────────── */

/** Why a run waits: until when, and the one sentence its event says. `null` is run. */
export type Hold = { until: number; say: string } | null;

/** The Directory's half of a pass: whether a record's action may run, and counting what one did. */
export type Ledger = {
  /** `pending` is how many runs this pass has already let through, which the ledger has not been told of yet. */
  mayRun: (record: string, action: string, pending?: number) => Hold | Promise<Hold>;
  meter: (record: string, run: Metered) => unknown;
  /** The note the owner is owed about the month, once (`noticePass`). Absent from a host that tells nobody. */
  notice?: (record: string) => UsageNotice | null | Promise<UsageNotice | null>;
};

/**
 * An executor that asks the ledger before each run.
 *
 * ASKED BEFORE ANYTHING IS RESOLVED, OPENED OR SENT. A held run answers `{ held }` with every count at zero, and the
 * kernel writes its event and moves the action to the day it may run again.
 */
export function holding(execute: Execute, record: string, mayRun: Ledger['mayRun'], admissions: Admissions = pass()): Execute {
  return async (request) => {
    const hold = await admissions.ask(record, request.ingest, mayRun);
    if (hold) return { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: hold };
    return execute(request);
  };
}

/**
 * The same question, asked of a connector.
 *
 * WITHOUT THIS THE ALLOWANCE HAD A HOLE THE SIZE OF THE EXPENSIVE KIND. `holding` wraps the
 * executor, and the connector runner is not the executor: the pass hands a `Paged` straight to it.
 * So a record at its monthly limit was held for `call`, `poll` and a one-request `pull`, and its
 * paging connectors ran on, which are the runs that make the most requests of anybody.
 *
 * A HELD RUN NEVER ACKS, so the pass releases the row. That is the difference from a held
 * single-request action, where the kernel moves the schedule to the day it may run again: here the
 * row goes back and the connector's own interval decides when it is offered next.
 */
export function holdingPaged(page: PagedRun, record: string, mayRun: Ledger['mayRun'], admissions: Admissions = pass()): PagedRun {
  return async (paged) => {
    const hold = await admissions.ask(record, paged.paged.ingest, mayRun);
    if (hold) return { outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0, say: hold.say };
    return page(paged);
  };
}

/**
 * The runs one pass has let through, shared by both wrappers.
 *
 * ONE COUNT AND NOT TWO. The ledger is told of a run only after the pass, so each wrapper has to
 * carry what it has already admitted. Two counts would each start at zero, and a record with one
 * run left would be allowed one request AND one connector, which is the allowance overrun this
 * count exists to prevent, arriving by a different door.
 */
export type Admissions = { ask: (record: string, action: string, mayRun: Ledger['mayRun']) => Promise<Hold> };

/**
 * The runs let through on a record and not yet metered, across every pass and trial that shares it.
 *
 * `take` reserves one place and answers how many were reserved before it, which is the `pending` to ask the ledger
 * with; `release` gives the place back, once, and a second call does nothing. `count` reads without reserving.
 *
 * A PASS'S OWN COUNT DIES WITH THE PASS, AND A TRIAL HAS NO PASS. `pass()` holds its admissions in a closure, which is
 * right for the runs of one pass and blind to anything else spending the same month. Measured over a real
 * Directory: five trials at once with one run left all ran, and the month closed at 15,004 of 15,000
 * (`test/script-try-spend.test.ts`). This is the count that outlives one pass, keyed by record, so the trials a host
 * runs between passes, and a pass running beside them, ask the ledger with each other's runs in hand.
 */
export type InFlight = {
  take: (record: string) => { pending: number; release: () => void };
  count: (record: string) => number;
};

/** A fresh in-flight count, for a host to build once beside its ledger and hand every pass and every trial. */
export function inFlight(): InFlight {
  const held = new Map<string, number>();
  return {
    count: (record) => held.get(record) ?? 0,
    take: (record) => {
      const pending = held.get(record) ?? 0;
      held.set(record, pending + 1);
      let given = false;
      return {
        pending,
        release: () => {
          if (given) return;
          given = true;
          const left = (held.get(record) ?? 1) - 1;
          if (left > 0) held.set(record, left);
          else held.delete(record);
        },
      };
    },
  };
}

/**
 * The count every trial on this runtime shares when its host hands `scriptTrial` none.
 *
 * ONE PER RUNTIME AND NOT ONE PER CALL, because both hosts build a `scriptTrial` per request: a count made inside it
 * would start at zero every time and be the hole it closes. The self-host serves its records from one process, and a
 * Durable Object is one instance per record, so keying by record id is what makes a module's count the record's count.
 */
export const IN_FLIGHT: InFlight = inFlight();

/**
 * A fresh admission count. One per pass; passed to both wrappers so they share it.
 *
 * WITH `flight`, THE PASS ALSO RESERVES EACH RUN IT LETS THROUGH THERE, and sees what trials hold, so a trial and a pass
 * cannot each spend the last run. Those places are held until `settle`, which the host calls once the pass is metered,
 * in a `finally`: a pass that never settles holds its record's runs for the life of the runtime. Without `flight`,
 * `settle` does nothing and the pass counts only itself, as it always has.
 */
export function pass(flight?: InFlight): Admissions & { settle: () => void } {
  let admitted = 0;
  const places: (() => void)[] = [];
  return {
    /* TAKEN BEFORE THE AWAIT, so two runs asked at once cannot both be told there is room for one. */
    ask: async (record, action, mayRun) => {
      const place = flight?.take(record);
      /* THE SHARED COUNT ALREADY HOLDS THIS PASS'S OWN PLACES, so it replaces `admitted` rather than adding to it. */
      const own = admitted++;
      /* A QUESTION THAT THROWS GIVES THE PLACE BACK. Neither released nor handed to `settle`, it stayed in the shared
         count after the pass had gone, one run short on the record for the life of the runtime per failed RPC. */
      let hold: Hold;
      try {
        hold = await mayRun(record, action, place === undefined ? own : place.pending);
      } catch (error) {
        admitted--;
        place?.release();
        throw error;
      }
      if (hold) {
        admitted--;
        place?.release();
      } else if (place) places.push(place.release);
      return hold;
    },
    settle: () => {
      for (const release of places.splice(0)) release();
    },
  };
}

/** How many times one write to the ledger is tried before the count is left to the nightly replay. */
export const METER_TRIES = 3;

/**
 * Whether the ledger said no: a `Result` refusal (the Directory in this process) or a bare `Refusal` (the Worker's
 * `Directory$`, which answers `null` for counted). Anything else, `undefined` included, is a write that landed.
 */
const refusedBy = (answer: unknown): boolean =>
  typeof answer === 'object' &&
  answer !== null &&
  (('ok' in answer && answer.ok === false) || (!('ok' in answer) && 'code' in answer && typeof answer.code === 'string'));

/** The ledger's answer to one write, tried up to `METER_TRIES` times, or `undefined` when every try threw or was refused. */
async function tried<T>(write: () => T | Promise<T>): Promise<{ answer: T } | undefined> {
  for (let n = 0; n < METER_TRIES; n++) {
    try {
      const answer = await write();
      if (!refusedBy(answer)) return { answer };
    } catch {
      /* A THROW IS THE NETWORK OR A DIRECTORY RESTARTING, and the next try is the whole of the answer to it. */
    }
  }
  return undefined;
}

/**
 * Every run a pass metered, into the ledger, in order, answering how many the ledger would not take.
 *
 * A REFUSED OR THROWN WRITE IS TRIED AGAIN, and one that still fails does not stop the runs after it. Before this, the
 * answer was ignored and the first throw left the pass, so one bad moment of the Directory's lost every run behind it,
 * and nothing counted them again. A run the ledger already holds adds nothing there, which is what makes a second try
 * safe; one that is still not counted after its tries is the nightly replay's (`replayUsage`), and the caller says so.
 */
export async function meterPass(meter: Ledger['meter'], record: string, usage: readonly Metered[]): Promise<number> {
  let lost = 0;
  for (const run of usage) if ((await tried(() => meter(record, run))) === undefined) lost++;
  return lost;
}

/* ── telling the owner ──────────────────────────────────────────────────── */

/**
 * The note a record's owner is owed about its month, as the Directory's `notice` answers it: `near` at `NOTICE_AT` of
 * the allowance, `held` when a run first waited. Said here again, as `Hold` is, because a host reaches the Directory
 * over RPC and imports none of it.
 */
export type UsageNotice = { kind: 'near' | 'held'; record: string; slug: string | null; person: string; email: string | null; say: string };

/**
 * After a pass is metered, asks the ledger whether the owner is owed a note, and hands it to `tell` once.
 *
 * AFTER THE METER AND NEVER BEFORE, because the note is about what the month now holds, and a pass that held its first
 * run has only said so once that run is counted. THE DIRECTORY REMEMBERS IT WAS ASKED (`notice` writes its row in the
 * answer's transaction), so a host that asks after every pass tells the owner at most twice a month.
 *
 * NOTHING HERE STOPS A PASS. A ledger that cannot be asked, or a `tell` that throws, is logged by the caller from the
 * answer and the pass has already run: `'unasked'` when there was nothing to ask or the question failed, `'none'` when
 * nothing is owed, `'told'` and `'untold'` when a note was owed and `tell` did or did not take it. An untold note is not
 * asked for again this month, which is the price of never telling it twice; the page at `/usage` says the same thing.
 */
export async function noticePass(
  notice: ((record: string) => UsageNotice | null | Promise<UsageNotice | null>) | undefined,
  record: string,
  tell: (note: UsageNotice) => unknown,
): Promise<'unasked' | 'none' | 'told' | 'untold'> {
  if (notice === undefined) return 'unasked';
  let note: UsageNotice | null;
  try {
    note = await notice(record);
  } catch {
    return 'unasked';
  }
  if (note === null) return 'none';
  try {
    await tell(note);
    return 'told';
  } catch {
    return 'untold';
  }
}

/* ── counting what the record did not choose to run ─────────────────────── */

/**
 * A delivery or an arrival as a row the Directory counts and never limits: an action named with one of the Directory's
 * `COUNTED_ONLY` prefixes (`deliver:notify.email`, `in:webhook`).
 *
 * `event` IS WHAT MAKES IT COUNT ONCE: the outbox job's id for a delivery, the stored arrival's for an arrival, each
 * prefixed like the action so neither can meet a run's event id in `dir_usage_run`. A job sent again after a lost ack
 * is counted once, and so is an arrival the record answers with the stored row it already held.
 */
function countedRun(o: { prefix: CountedPrefix; id: string; name: string; at: number; requests: number; bytes: number }): Metered {
  return {
    event: `${o.prefix}${o.id}`,
    at: new Date(o.at).toISOString(),
    ingest: `${o.prefix}${o.name}`,
    channel: o.prefix.slice(0, -1),
    scope: 'global',
    outcome: 'ok',
    usage: { runs: 1, requests: o.requests, bytes: o.bytes, ms: 0, failures: 0, held: 0, cpu_ms: 0 },
  };
}

/** One outbox job the host sent, to count: one request, by its kind. */
export function deliveryRun(job: { id: string; kind: string }, at: number): Metered {
  return countedRun({ prefix: 'deliver:', id: job.id, name: job.kind, at, requests: 1, bytes: 0 });
}

/**
 * One arrival at an `/in` door, to count: its bytes, by its channel. `null` when the record's answer stored nothing,
 * which is a refusal, and a refusal is not an arrival.
 */
export function arrivalRun(answer: unknown, arrival: { channel: string; body: string }, at: number): Metered | null {
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) return null;
  const value = answer.value;
  const raw = typeof value === 'object' && value !== null && 'raw' in value && typeof value.raw === 'string' ? value.raw : '';
  if (raw === '') return null;
  return countedRun({ prefix: 'in:', id: raw, name: arrival.channel, at, requests: 0, bytes: new TextEncoder().encode(arrival.body).length });
}

/* ── the replay ─────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** How far back the replay reads: the forty days the Directory keeps a counted run's id, and so the most it can count. */
export const REPLAY_WINDOW_MS = 40 * DAY_MS;

/** Events read from the log at once. */
const REPLAY_READ = 500;

/**
 * The most events one replay walks, of every kind, newest first.
 *
 * A CEILING ON THE NIGHT'S WORK FOR ONE RECORD. The log holds every write, not only runs, so a busy record's forty days
 * can be far more events than runs; past this the older runs are left uncounted and the answer says `ceiling`.
 */
export const REPLAY_EVENTS_MAX = 200_000;

/** What one replay came to: events read, runs found, runs the ledger counted new, runs it would not take, and where it stopped. */
export type Replayed = { walked: number; runs: number; counted: number; lost: number; reached: 'start' | 'window' | 'ceiling' };

/** One line of the record's log, as `eventsBefore` hands it over. */
type LogLine = ReturnType<Kernel['eventsBefore']>[number];

/**
 * The declarations a metered run's event targets, and how the ledger names each: an action by its ingest, a script by
 * its id, and a rule's run as `rule:<id>`, which is the name `flow.ts` gives the run it meters.
 */
const METERED_TARGETS = [
  { target: 'declaration:ingest.', name: '' },
  { target: 'declaration:script.', name: '' },
  { target: 'declaration:rule.', name: 'rule:' },
] as const;

const USAGE_KEYS = ['runs', 'requests', 'bytes', 'ms', 'failures', 'held', 'cpu_ms'] as const;

/**
 * A metered run's `pull` event as the row the pass would have handed the ledger, or `null` for any other line.
 *
 * THE SAME EVENT ID, so a run the pass already counted is `already counted` and the replay adds nothing for it. A usage
 * number an older build did not write is `0`; one that is there and is not a whole number leaves the line out.
 */
function meteredOf(line: LogLine): Metered | null {
  if (line.kind !== 'pull' || line.target === null) return null;
  const to = line.to;
  if (typeof to !== 'object' || to === null || Array.isArray(to)) return null;
  const spec = METERED_TARGETS.find((t) => line.target?.startsWith(t.target));
  const id = spec === undefined ? '' : line.target.slice(spec.target.length);
  if (spec === undefined || id === '') return null;
  const said = to.usage;
  if (typeof said !== 'object' || said === null || Array.isArray(said) || typeof to.outcome !== 'string') return null;
  const usage = { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0, cpu_ms: 0 };
  for (const key of USAGE_KEYS) {
    const n = said[key];
    if (n === undefined) continue;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return null;
    usage[key] = n;
  }
  return {
    event: line.id,
    at: line.ts,
    ingest: `${spec.name}${id}`,
    channel: typeof to.channel === 'string' ? to.channel : '',
    scope: typeof to.scope === 'string' && to.scope !== '' ? to.scope : 'global',
    /* THE KERNEL'S OWN WORD, written by `meter` from its closed list; the ledger does not read it. */
    outcome: to.outcome as Metered['outcome'],
    usage,
  };
}

/**
 * The last forty days of a record's metered runs, read from its own log and handed to the Directory's ledger again.
 *
 * WHAT MAKES A LOST COUNT A LATE ONE. A pass killed between its runs and its meter, a ledger write that failed all its
 * tries, and every automation run (whose `pull` event `flow.ts` writes and no pass hands on) are all events in the
 * record, so reading them back is the whole repair. The Directory keeps every counted run's id for the same forty days,
 * so a run already counted adds nothing, and the replay can run every night, or twice, and leave the ledger equal to
 * the events.
 *
 * NEWEST FIRST, a read at a time, stopping at the first read whose every line is older than the window rather than at
 * the first old line, because the log's order is the order lines were written and nothing makes that the order of their
 * times. `meter` is the Directory's `meterMany`, and each batch is tried as a pass's write is.
 */
export async function replayUsage(o: {
  record: string;
  read: Kernel['eventsBefore'];
  meter: (record: string, runs: readonly Metered[]) => unknown;
  now: number;
}): Promise<Replayed> {
  const since = o.now - REPLAY_WINDOW_MS;
  const out: Replayed = { walked: 0, runs: 0, counted: 0, lost: 0, reached: 'start' };
  let batch: Metered[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const runs = batch;
    batch = [];
    const said = await tried(() => o.meter(o.record, runs));
    if (said === undefined) out.lost += runs.length;
    else out.counted += countedIn(said.answer);
  };

  let before: number | null = null;
  walk: for (;;) {
    const lines = o.read(before, REPLAY_READ);
    let recent = false;
    for (const line of lines) {
      if (out.walked >= REPLAY_EVENTS_MAX) {
        out.reached = 'ceiling';
        break walk;
      }
      out.walked++;
      const at = Date.parse(line.ts);
      if (Number.isFinite(at) && at < since) continue;
      recent = true;
      const run = meteredOf(line);
      if (run === null) continue;
      out.runs++;
      batch.push(run);
      if (batch.length >= METER_MANY_MAX) await flush();
    }
    const last = lines.at(-1);
    if (last === undefined || lines.length < REPLAY_READ) break;
    if (!recent) {
      out.reached = 'window';
      break;
    }
    before = last.rowid;
  }
  await flush();
  return out;
}

/** How many runs a `meterMany` answer says it counted new: its tally's `counted`, whether it came as a `Result` or bare. */
function countedIn(answer: unknown): number {
  if (typeof answer !== 'object' || answer === null) return 0;
  const tally: unknown = 'ok' in answer && 'value' in answer ? answer.value : answer;
  return typeof tally === 'object' && tally !== null && 'counted' in tally && typeof tally.counted === 'number' ? tally.counted : 0;
}

/* ── automations at the allowance ───────────────────────────────────────── */

/**
 * The name an automation's hold is asked under, which is the subject of the sentence its runs carry: "This automation is
 * waiting until" the first of next month, then what the record used up, both as the Directory's `mayRun` words them.
 */
export const AUTOMATION_HELD = 'This automation';

/**
 * How long one answer about automations is kept before the Directory is asked again.
 *
 * ONE DIRECTORY FOR EVERY RECORD, and a record's alarm fires on every write it drains, so asking at every alarm would put
 * each busy record's every write on the one object all of them share. A record that reaches its allowance is held
 * within this long of the replay that counts it; one that is let off at the turn of the month is let off within it too.
 */
export const RUNS_HOLD_EVERY_MS = 15 * 60_000;

/**
 * An automation's hold, asked of the same ledger and in the same words an action's pass asks, kept for `RUNS_HOLD_EVERY_MS`. One per record's runtime, like `IN_FLIGHT`.
 *
 * A QUESTION THAT THROWS HOLDS NOTHING and is asked again the next time: a Directory that cannot be reached never stops
 * a record's automations on its own say-so.
 */
export function runsHold(every = RUNS_HOLD_EVERY_MS): (record: string, mayRun: Ledger['mayRun'], now: number) => Promise<Hold> {
  let asked: { at: number; hold: Hold } | null = null;
  return async (record, mayRun, now) => {
    if (asked === null || now - asked.at >= every) {
      try {
        asked = { at: now, hold: await mayRun(record, AUTOMATION_HELD, 0) };
      } catch {
        asked = null;
      }
    }
    return asked !== null && asked.hold !== null && asked.hold.until > now ? asked.hold : null;
  };
}

/**
 * Hands the kernel the hold its automation runs wait under: a pending run is not started while `until` is ahead, and
 * its row says why, which is the kernel's `holdRuns`.
 *
 * THROUGH AN OPTIONAL METHOD, so a kernel that has no `holdRuns` yet runs every automation as it always has, and this
 * line needs no change on the day it gains one.
 */
export function holdAutomations(kernel: Kernel, hold: Hold): void {
  (kernel as unknown as { holdRuns?: ((hold: Hold) => void) | undefined }).holdRuns?.(hold);
}

/* ── which addresses are refused ────────────────────────────────────────── */

/* NODE'S OWN GRAMMAR FOR `net.isIP`, written out because this package may not import `node:net`. */
const V4_SEG = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])';
const V4_STR = `(?:${V4_SEG}\\.){3}${V4_SEG}`;
const V4 = new RegExp(`^${V4_STR}$`);
const V6_SEG = '(?:[0-9a-fA-F]{1,4})';
const V6 = new RegExp(
  '^(?:' +
    `(?:${V6_SEG}:){7}(?:${V6_SEG}|:)|` +
    `(?:${V6_SEG}:){6}(?:${V4_STR}|:${V6_SEG}|:)|` +
    `(?:${V6_SEG}:){5}(?::${V4_STR}|(?::${V6_SEG}){1,2}|:)|` +
    `(?:${V6_SEG}:){4}(?:(?::${V6_SEG}){0,1}:${V4_STR}|(?::${V6_SEG}){1,3}|:)|` +
    `(?:${V6_SEG}:){3}(?:(?::${V6_SEG}){0,2}:${V4_STR}|(?::${V6_SEG}){1,4}|:)|` +
    `(?:${V6_SEG}:){2}(?:(?::${V6_SEG}){0,3}:${V4_STR}|(?::${V6_SEG}){1,5}|:)|` +
    `(?:${V6_SEG}:){1}(?:(?::${V6_SEG}){0,4}:${V4_STR}|(?::${V6_SEG}){1,6}|:)|` +
    `(?::(?:(?::${V6_SEG}){0,5}:${V4_STR}|(?::${V6_SEG}){1,7}|:))` +
    ')(?:%[0-9a-zA-Z-.:]{1,})?$',
);

/** `4` for a dotted IPv4 address, `6` for an IPv6 one (a zone allowed), `0` for anything else. `net.isIP`'s answer. */
export function ipFamily(text: string): 0 | 4 | 6 {
  if (V4.test(text)) return 4;
  if (V6.test(text)) return 6;
  return 0;
}

/** Four octets, or `null` when the text is not a dotted IPv4 address. */
function octets(text: string): number[] | null {
  if (ipFamily(text) !== 4) return null;
  return text.split('.').map(Number);
}

/** Sixteen bytes, or `null` when the text is not an IPv6 address. A zone (`%eth0`) is dropped first. */
function bytes16(text: string): number[] | null {
  const bare = text.split('%')[0] ?? '';
  if (ipFamily(bare) !== 6) return null;
  let head = bare;
  let tail: number[] = [];
  if (bare.includes('.')) {
    const cut = bare.lastIndexOf(':');
    tail = octets(bare.slice(cut + 1)) ?? [];
    head = `${bare.slice(0, cut + 1)}0:0`;
  }
  const [left = '', right] = head.split('::');
  const l = left === '' ? [] : left.split(':');
  const r = right === undefined ? null : right === '' ? [] : right.split(':');
  const groups = r === null ? l : [...l, ...Array<string>(8 - l.length - r.length).fill('0'), ...r];
  const out = groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 255];
  });
  if (tail.length === 4) out.splice(12, 4, ...tail);
  return out;
}

function refusedV4([a = 0, b = 0, c = 0]: number[]): string | null {
  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT';
  if (a >= 224 && a <= 239) return 'multicast';
  /* `198.18/15` is for benchmarking a network and `192.0.0/24` for protocol assignments: nothing public answers at either. */
  if ((a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0)) return 'reserved';
  if (a >= 240) return 'reserved';
  return null;
}

/**
 * Why an address may not be called, in a word or two, or `null` when it is public.
 *
 * REFUSED: unspecified (`0/8`, `::`), loopback (`127/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`,
 * NAT64's local-use `64:ff9b:1::/48`), link-local (`169.254/16`, `fe80::/10`), site-local (`fec0::/10`), unique-local (`fc00::/7`), carrier-grade
 * NAT (`100.64/10`), multicast (`224/4`, `ff00::/8`) and reserved (`240/4`, which holds the broadcast address,
 * `198.18/15`, `192.0.0/24` and the discard-only `100::/64`). An IPv6 address that carries an IPv4 one (mapped
 * `::ffff:0:0/96`, translated `::ffff:0:0:0/96`, compatible `::/96`, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`) is judged
 * by the IPv4 inside it, so `::ffff:127.0.0.1` is loopback. Text that is not an address at all is refused as unreadable.
 */
export function refusedAddress(address: string): string | null {
  const v4 = octets(address);
  if (v4) return refusedV4(v4);
  const b = bytes16(address);
  if (!b) return 'unreadable';
  const zeros = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zeros(16)) return 'unspecified';
  if (zeros(15) && b[15] === 1) return 'loopback';
  const inner = b.slice(12);
  if (zeros(10) && b[10] === 0xff && b[11] === 0xff) return refusedV4(inner);
  if (zeros(12)) return refusedV4(inner);
  /* SIIT's translated `::ffff:0:0/96` carries one in its last 32 bits as mapped does, and 6to4's `2002::/16` in its next 32. */
  if (zeros(8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return refusedV4(inner);
  if (b[0] === 0x20 && b[1] === 0x02) return refusedV4(b.slice(2, 6));
  /* NAT64's local-use `64:ff9b:1::/48` is a network's own, and `100::/64` discards what it is sent. */
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b[4] === 0x00 && b[5] === 0x01) return 'private';
  if (b[0] === 0x01 && b.slice(1, 8).every((x) => x === 0)) return 'reserved';
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return refusedV4(inner);
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0x80) return 'link-local';
  /* `fec0::/10` was site-local until RFC 3879 retired it; a network that still routes it routes it inside. */
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0xc0) return 'site-local';
  if (((b[0] ?? 0) & 0xfe) === 0xfc) return 'unique-local';
  if (b[0] === 0xff) return 'multicast';
  return null;
}

/**
 * Why a host, as the address writes it, may not be called, or `null` when nothing about how it is written says so.
 *
 * `localhost`, a name under it and a name under `.internal` are local by name, with or without the trailing dot. An
 * address written literally is judged by `refusedAddress`. A name that only RESOLVES to a private address is not
 * caught here and cannot be: that is the self-host's `pin`, and the platform's routing on the Worker.
 */
export function refusedHost(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return 'local';
  const bare = host.replace(/^\[|\]$/g, '');
  return ipFamily(bare) === 0 ? null : refusedAddress(bare);
}

/* ── the loop ───────────────────────────────────────────────────────────── */

/** A promise that gives up when the run's signal does. */
function within<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** An answer's bytes, read until the cap and no further. `null` when it ran over. */
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** What a host hands the loop. */
export type SendOptions<P> = {
  /** The origins the record's active declarations name, asked on every run. */
  origins: () => Iterable<string>;
  /** `null` on a host with no key store: an action that names a key sends nothing and says why. */
  openKey: OpenKey | null;
  send: Send<P>;
  /** Absent on a host whose network does not route to a private address. */
  pin?: Pin<P> | undefined;
};

/**
 * The executor `runActions` is handed, on either host.
 *
 * IN THIS ORDER, so nothing is opened for a request that will not leave: the origin, the host as written, the host the
 * key opens, `pin`, the key, and then the request. A refused address ends the run as `PULL_ORIGIN_REFUSED` with one sentence, which the
 * kernel writes on the run's event as a failure that pauses nothing and is not retried.
 */
/** The headers that say how a request travels, which only the transport sets. */
const WIRE_HEADERS = ['host', 'connection', 'keep-alive', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length'] as const;

export function sendAction<P extends object | undefined = undefined>(options: SendOptions<P>): Execute {
  const pinOf = async (at: URL, signal: AbortSignal): Promise<P | string> =>
    options.pin ? within(options.pin(at, signal), signal) : (undefined as P);

  return async (request: ActionRequest): Promise<ActionAnswer> => {
    const started = Date.now();
    let requests = 0;
    let bytes = 0;
    /* EVERY SPELLING OF THE KEY, NOT ONLY ITS BYTES (`spellingsOf` says which). Empty until a key is opened, AND THE
       TEXTS THE CALLER NAMED (`scrub`) FROM THE START: a key used as the address was opened before this was asked, and
       goes out with no grant, so nothing here would otherwise know to strike it from the answer. */
    const secret: Spelling[] = (request.scrub ?? []).filter((t) => typeof t === 'string' && t.length >= SHORTEST_SPELLING).flatMap((t) => spellingsOf(t));
    const scrub = (text: string): string =>
      secret.reduce<string>((out, spelling) => (typeof spelling === 'string' ? out.split(spelling).join(REDACTED) : out.replace(spelling, REDACTED)), text);
    const refuse = (code: RefusedCode, fix: string): ActionAnswer => ({
      refused: { code, fix: scrub(fix) },
      bytes,
      ms: Date.now() - started,
      requests,
    });

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return refuse('PULL_ORIGIN_REFUSED', 'The address this action names is not one this host can read, so nothing was sent.');
    }
    const allowed = new Set(options.origins());
    if (url.protocol !== 'https:' || url.origin !== request.origin || !allowed.has(url.origin))
      return refuse('PULL_ORIGIN_REFUSED', `${url.host} is not an origin an installed declaration names, so nothing was sent.`);
    if (refusedHost(url) !== null) return refuse('PULL_ORIGIN_REFUSED', `${url.host} is a private or local address, so nothing was sent.`);
    /* A KEY GOES ONLY TO ITS OWN HOST, checked BEFORE the key is opened or anything resolved. A declaration
       that names a person's Oxbow key and another host passes the origin check, since the origin is its own; what it may
       not do is carry that key there. `opens` is the keychain entry's words, read as a host the one way the kernel reads
       them (`hostOpened`); an entry that names no host is held to nothing here, and its first approval pins one
       (`pinHost`). Only the label and `opens` are read, never the value. */
    const parsed = request.grant ? hostOpened(request.opens) : null;
    /* ONE WORD IS A NAME, NOT A HOST ("Stripe" parses as `stripe`), so it holds the key to nothing (kernel `heldHost`). */
    const own = parsed !== null && /[.:]/.test(parsed) ? parsed : null;
    if (own !== null && own !== url.hostname.toLowerCase().replace(/\.$/, '')) return refuse('WRONG_KEY', `This key opens ${own} only.`);

    const signal = AbortSignal.timeout(request.timeoutMs);
    let method: string = request.method;
    let body = request.body;
    try {
      let pinned = await pinOf(url, signal);
      if (typeof pinned === 'string') return refuse('PULL_ORIGIN_REFUSED', pinned);

      const headers = new Headers(request.headers);
      /* THE WIRE REQUEST IS THE CHECKED URL'S, WHATEVER THE CALLER WROTE. A `Host` a script supplies reached the socket
         in place of the URL's authority, so a request checked against one origin, and a key bound to that host, could be
         read by another site behind the same address. These are the transport's to set, never a caller's. */
      for (const name of WIRE_HEADERS) headers.delete(name);
      if (request.grant) {
        if (!options.openKey) return refuse('WRONG_KEY', `${NO_KEY_STORE} "${request.grant.label}" was not opened and nothing was sent.`);
        const opened = await options.openKey(request.grant);
        if (opened === null) return refuse('WRONG_KEY', `The key "${request.grant.label}" could not be opened on this host, so nothing was sent.`);
        if (opened !== '') secret.push(...spellingsOf(opened));
        /* THROUGH CONNECT'S AUTH BUILDER, the one place in the tree a credential meets a request. It is handed no other
           header, so what it answers is the key's own headers and nothing the record sent. */
        let signed: Awaited<ReturnType<typeof authoriseCall>>;
        try {
          signed = await authoriseCall(request.auth ?? { kind: 'bearer' }, opened, { url, method: request.method, headers: {} }, Date.now());
        } catch (e) {
          if (!(e instanceof PullError)) throw e;
          /* A KEY THAT DOES NOT HOLD WHAT ITS KIND SENDS is a key to add again, so the action pauses the way a key the
             host cannot open does. A header the request may not carry is a declaration to change, and is not retried. */
          return e.code === 'PULL_AUTH_REJECTED'
            ? refuse('WRONG_KEY', `The key "${request.grant.label}" does not hold what ${request.auth?.kind ?? 'bearer'} sends, so nothing was sent.`)
            : refuse('PULL_REQUEST_REFUSED', `The key "${request.grant.label}" was not sent: ${e.fix}`);
        }
        /* EVERY VALUE THE BUILDER PLACED IS SCRUBBED TOO, and the credential inside a scheme word as well as with it: a
           basic pair is sent as base64, and a key opened as a grant's fields is sent as one field of it. Longest first,
           so no shorter text is struck out of a longer one before the longer is found. */
        const placed = new Set<string>();
        for (const [name, value] of Object.entries(signed.headers)) {
          headers.set(name, value);
          placed.add(value);
          placed.add(value.replace(/^(?:Bearer|Basic) /u, ''));
        }
        const before = url;
        signed.url.searchParams.forEach((value, name) => {
          if (!before.searchParams.getAll(name).includes(value)) placed.add(value);
        });
        for (const text of [...placed].filter((t) => t !== '' && t !== opened).sort((a, b) => b.length - a.length)) secret.push(...spellingsOf(text));
        url = signed.url;
      }

      for (let hop = 0; ; hop++) {
        requests++;
        bytes += body === undefined ? 0 : utf8(body).length;
        const response = await options.send(url, { method, headers, redirect: 'manual', signal, ...(body === undefined ? {} : { body }) }, pinned);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await response.body?.cancel().catch(() => undefined);
          let next: URL | null = null;
          try {
            next = location === null ? null : new URL(location, url);
          } catch {
            next = null;
          }
          /* NEVER TO ANOTHER HOST. The origin is what the owner approved in the install diff, and a redirect is the
             provider naming a different one after the fact. */
          if (next === null || next.origin !== request.origin)
            return refuse('PULL_ORIGIN_REFUSED', `${url.host} redirected to ${next?.host ?? 'nowhere'}, and a scheduled action does not follow a redirect to another host.`);
          if (hop >= REDIRECT_HOPS) return refuse('PULL_REQUEST_REFUSED', `${url.host} redirected more than ${REDIRECT_HOPS} times.`);
          /* EVERY HOP IS CHECKED AGAIN, and pinned to its own answer. The origin is the same, and the address behind
             it need not be. */
          const again = await pinOf(next, signal);
          if (typeof again === 'string') return refuse('PULL_ORIGIN_REFUSED', again);
          pinned = again;
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
            method = 'GET';
            body = undefined;
            headers.delete('content-type');
          }
          url = next;
          continue;
        }

        const declared = Number(response.headers.get('content-length') ?? Number.NaN);
        if (Number.isFinite(declared) && declared > request.maxBytes) {
          await response.body?.cancel().catch(() => undefined);
          return refuse('PULL_REQUEST_REFUSED', `${url.host} answered with more than ${request.maxBytes} bytes, which is this action's cap.`);
        }
        const read = await readCapped(response, request.maxBytes);
        if (read === null) {
          bytes += request.maxBytes;
          return refuse('PULL_REQUEST_REFUSED', `${url.host} answered with more than ${request.maxBytes} bytes, which is this action's cap.`);
        }
        bytes += read.length;
        /* A PROVIDER THAT SAYS WHEN TO COME BACK is read the way a connector reads it (`retryAfterMs`: seconds or a
           date, a past date is now, at most six hours), and only on the answers the record retries. */
        const now = Date.now();
        const wait = response.status === 429 || response.status >= 500 ? retryAfterMs(response.headers.get('retry-after'), now) : null;
        return {
          status: response.status,
          body: scrub(new TextDecoder().decode(read)),
          bytes,
          ms: now - started,
          requests,
          ...(wait === null ? {} : { notBefore: now + wait }),
        };
      }
    } catch (e) {
      const late = signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));
      return refuse(
        'PULL_PROVIDER_UNAVAILABLE',
        late ? `${url.host} did not answer within ${Math.round(request.timeoutMs / 1000)} seconds.` : `${url.host} could not be reached.`,
      );
    }
  };
}

/* ── a retry that is not a second call ──────────────────────────────────── */

/**
 * The header a `call` carries so that a retry of it is not a second call.
 *
 * ONE COPY, HERE, beside the loop it wraps. It was written twice, once in each host, with a note in both saying
 * the two must not drift: a call that is safe to retry on one host and not on the other is the worst of both.
 * Both hosts now import it from here, and `actionExecutor` on either side wraps the same function. Moving it
 * changed no behaviour.
 */
export const IDEMPOTENCY_KEY = 'idempotency-key';

/**
 * The sentence a call adds when nothing came back, so the record says what it does not know.
 *
 * A TIMEOUT OR A DROPPED CONNECTION ON A POST IS THE ONE CASE WHERE THE RECORD CANNOT TELL whether the request
 * landed. The ladder will try it again, which is right, and the run event should not pretend that trying again is
 * free. It says what was done about it instead.
 */
export const MAY_HAVE_LANDED = 'It carried an idempotency key, so a retry is not a second call unless the provider ignores that header.';

/**
 * Every `call` carries the outbox id as its idempotency key, and says so when the answer never came.
 *
 * THE OUTBOX ID IS THE RIGHT VALUE because it is stable across exactly the events that would otherwise double
 * write: a rung of the retry ladder re-leases the same row, and so does a lease abandoned by a process or an alarm
 * that stopped mid-run. Both come back with the same `job`, so the provider sees one key for one intended call,
 * however many times it is sent. A new interval is a new row and a new key, which is a new call and should be.
 *
 * THE HEADER IS A REQUEST AND NOT A GUARANTEE. Delivery is at least once: a provider that ignores the header can
 * be called twice for one intended call, and nothing here can tell that it was. `25-CONNECTORS` §3.3 says so in
 * the same words.
 *
 * ONLY A `call`. A `poll` and a `pull` are GETs with nothing to duplicate, and a header a provider did not expect
 * is a header that can be rejected.
 */
export function idempotentCalls(execute: Execute): Execute {
  return async (request) => {
    if (request.channel !== 'call') return execute(request);
    const answer = await execute({ ...request, headers: { ...request.headers, [IDEMPOTENCY_KEY]: request.job } });
    if ('refused' in answer && answer.refused.code === 'PULL_PROVIDER_UNAVAILABLE')
      return { ...answer, refused: { ...answer.refused, fix: `${answer.refused.fix} ${MAY_HAVE_LANDED}` } };
    return answer;
  };
}

/* ── reading a shared file from an address ──────────────────────────────── */

/** The most a shared file is read to, a little over what a shared use case may weigh, so `readShared`'s refusal is the one said. */
export const PUBLIC_MOST_BYTES = 300 * 1024;
/** How long reading a shared file may take, the body included. */
export const PUBLIC_TIMEOUT_MS = 10_000;

/** What reading an address answers: the text, or one sentence saying why nothing was read. */
export type PublicRead = { ok: true; text: string; bytes: number } | { ok: false; fix: string };

/**
 * Reads one https address a person pasted to install a use case from, on the host, so a site that sends no CORS
 * header can still be read.
 *
 * THE SAME FENCE AS A SCHEDULED ACTION, without the declared origin: https only; never a host written as a private or
 * local address, and on the self-host never a name that resolves to one (`pin`); redirects three at most, each hop
 * checked again, to any public host; ten seconds; 300 KB counted as it streams. NOTHING IS SENT WITH IT: no cookie, no
 * key, no header of the record's. A plain `user-agent` goes, since GitHub's API refuses a request without one. The text goes back to the caller, which reads it through `readShared` like a file.
 */
export function readPublic<P extends object | undefined = undefined>(options: { send: Send<P>; pin?: Pin<P> | undefined }): (address: string) => Promise<PublicRead> {
  return async (address) => {
    let url: URL;
    try {
      url = new URL(address.trim());
    } catch {
      return { ok: false, fix: 'That is not a web address. Paste the whole address, starting https://.' };
    }
    if (url.protocol !== 'https:') return { ok: false, fix: `${url.host || address} is not an https address, and a shared file is only read over https.` };
    const signal = AbortSignal.timeout(PUBLIC_TIMEOUT_MS);
    try {
      for (let hop = 0; ; hop++) {
        if (url.protocol !== 'https:') return { ok: false, fix: `The address redirected to ${url.host} without https, so it was not followed.` };
        if (refusedHost(url) !== null) return { ok: false, fix: `${url.host} is a private or local address, so nothing was read from it.` };
        const pinned = options.pin ? await within(options.pin(url, signal), signal) : (undefined as P);
        if (typeof pinned === 'string') return { ok: false, fix: pinned };
        const response = await options.send(url, { method: 'GET', headers: { accept: 'application/json', 'user-agent': 'BrainDog' }, redirect: 'manual', signal }, pinned);
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await response.body?.cancel().catch(() => undefined);
          if (hop >= REDIRECT_HOPS || location === null) return { ok: false, fix: `${url.host} redirected more than ${REDIRECT_HOPS} times, so nothing was read.` };
          try {
            url = new URL(location, url);
          } catch {
            return { ok: false, fix: `${url.host} redirected to an address that is not one, so nothing was read.` };
          }
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, fix: `${url.host} answered ${response.status}, so there was no file to read.` };
        }
        const said = Number(response.headers.get('content-length') ?? '0');
        const body = said > PUBLIC_MOST_BYTES ? null : await within(readCapped(response, PUBLIC_MOST_BYTES), signal);
        if (body === null) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, fix: `The file at ${url.host} is larger than a shared use case may be, so it was not read.` };
        }
        return { ok: true, text: new TextDecoder().decode(body), bytes: body.length };
      }
    } catch {
      return { ok: false, fix: signal.aborted ? `${url.host} took longer than ten seconds, so nothing was read.` : `${url.host} could not be reached.` };
    }
  };
}


/* ── what one invocation may spend ───────────────────────────────────────── */

/**
 * Requests one Cloudflare invocation may make.
 *
 * EIGHT HUNDRED AND NOT A THOUSAND, which is what the Paid plan actually allows. The two hundred is
 * for everything this file cannot see: the object's own reads, a Directory call, a queue send. A
 * ceiling set at the real one is a ceiling the run reaches by surprise.
 *
 * IT LIVES HERE, in the one file both hosts import, because the self-host needs the same arithmetic
 * to behave the same way and not the same limit: a Node process has no such ceiling, so it passes
 * no budget and the kernel skips the check entirely.
 */
export const SUBREQUESTS = 800;

/**
 * A budget for one invocation, to be shared by every record it touches.
 *
 * ONE PER INVOCATION AND NOT ONE PER RECORD. The point of counting is that the platform counts the
 * invocation, so two records that each stay under the limit can still take the invocation down
 * between them. Whoever begins the invocation makes one of these and hands the same object down.
 *
 * `spent` IS FOR REPORTING and nothing reads it to decide: the decision is `left`, and `left` is
 * the kernel's to spend. A caller that adjusted it would be a second opinion on one number.
 */
export function invocation(of = SUBREQUESTS): Budget {
  return { left: of, total: of };
}

/** What an invocation has used so far, for a log line or a test. */
export const spent = (budget: Budget): number => budget.total - budget.left;

/** What `runActions` will reserve for a job of this shape, re-exported so a host can size a budget. */
export { reserveFor };
