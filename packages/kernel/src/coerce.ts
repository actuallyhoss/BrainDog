/**
 * The sixteen types, in and out.
 *
 * ONE JOB: turn what a caller sent into the canonical form the record stores, or refuse it with a
 * sentence. Every value that reaches a row goes through here, which is why the refusals are specific
 * rather than a single VALUE_MALFORMED — a caller told "not a valid money" learns nothing, and a
 * caller told "amount is a float; money is an integer in minor units" fixes it on the next call.
 *
 * THE TWO TEXT REFUSALS ARE HERE BECAUSE THEY ARE REAL BUGS, NOT PEDANTRY. `TEXT_JSON_QUOTED` is a
 * client that stringified a string and sent `"\"hello\""`; the value looks right in a log and wrong
 * on a screen, for ever. `TEXT_ESCAPED_NEWLINE` is a note containing the two characters backslash
 * and `n` where a line break was meant — written once by an agent, read a hundred times by a person.
 * Both are silent, both survive a round trip, and neither is detectable later.
 *
 * MONEY IS AN INTEGER IN MINOR UNITS, and a float `amount` is refused rather than rounded. Rounding
 * is how a record ends up 1p out on a figure somebody is about to act on, and the rounding is
 * invisible at the moment it happens.
 */

import { DO_LIMITS, type Refusal } from '@braindog/ports';
import type { Json } from '@braindog/where';

/** Canonical JSON: what a field holds once it is in the record. */
/**
 * ONE `Json`, RE-EXPORTED RATHER THAN DECLARED AGAIN. It was written out here and in `where/src/path.ts`,
 * structurally identically, so TypeScript accepted one wherever the other was wanted and nothing ever
 * complained: the surest way for a duplicate to survive. `kernel` already depends on `where` (`31 §2`:
 * 7 to 3, pointing down), so the edge costs nothing that is not already paid.
 */
export type { Json };

/**
 * The sixteen, plus the two containers. `list<T>` carries its element type in `of`.
 *
 * AN ARRAY, BECAUSE A UNION CHECKS NOTHING AT INSTALL. This was a TypeScript type and only that, so
 * the list existed at compile time in a package whose whole job is admitting declarations written
 * somewhere else — and `type: 'currency'` installed clean, which is `04 §5`'s own worked example of
 * `FIELD_TYPE_UNKNOWN` (*"did you mean 'money'?"*). A pack is untyped text from another author; a
 * union cannot see it.
 *
 * `02 §1` is the authority for the members and calls the cost of a new one out loud: *"a
 * seventeenth is five pieces of work and a new way to be wrong"* — a validator, a form control, a
 * renderer, a `where:` compilation and a line in the MCP schema. A list a person can count is what
 * makes that sentence checkable.
 */
export const FIELD_TYPES = [
  'text', 'document', 'int', 'duration', 'decimal', 'money', 'quantity', 'day', 'instant', 'bool',
  'enum', 'ref', 'file', 'url', 'email', 'secret', 'list', 'json',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldDecl = {
  id: string;
  type: FieldType;
  /** `list<T>`'s element type. */
  of?: Exclude<FieldType, 'list'>;
  values?: readonly string[];
  /**
   * `enum` only: the words a person reads for some of its values, `{ owed_to_me: 'Money in' }`. The
   * column still holds the id; the screen says the label, and a predicate may say either.
   */
  labels?: Readonly<Record<string, string>>;
  to?: string;
  /**
   * The name a person reads. Absent means the id with `_` as a space.
   *
   * IT IS NOT USED BY COERCION AND IT IS CARRIED ANYWAY, because the query grammar needs it: a page
   * prints its own `where:` back to the reader using the label, so `direction is owed_to_me` is
   * shown as `which way is owed to me`, and that sentence fed back to the record was
   * `FIELD_UNKNOWN` until the schema handed the grammar the same word the screen shows.
   */
  label?: string;
  /**
   * `money` only: `'<link>.<money field>'`, a ref of this list and a money field of the list it points at. An amount
   * written with no code takes the code that field holds on the linked row (`Lookups.currencyOf`), so a bare amount
   * filed against an account is in the account's currency rather than refused or guessed.
   */
  currency_from?: string;
  /** `money` only: once a row holds a code here, a write that would change it is `CURRENCY_FIXED` (`currencyFixed`). */
  currency_fixed?: boolean;
  /** `json` only: the money field of this list its parts add up to, each part a patch over its row (`row-parts.ts`). */
  parts_of?: string;
};

export type Coerced = { ok: true; value: Json } | { ok: false; refusal: Refusal };

const bad = (code: string, fix: string, at: string, extra: Omit<Refusal, 'code' | 'fix' | 'at'> = {}): Coerced => ({
  ok: false,
  refusal: { code, fix, at, ...extra },
});

const good = (value: Json): Coerced => ({ ok: true, value });

/** 2^53 − 1: past it, an integer is no longer exactly itself, and money stops being money. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * THE DEFAULT CAPS, in UTF-8 bytes (`02 §5`, `41 §5.4`): what a field of each type holds when its declaration says no
 * `max`, and what a `max` may lower and never raise. Without them any writer could put a field of any length in a
 * row, and a write token could fill a record a row at a time. `json` and a `list`'s length are not capped field by
 * field; they are held by the row's whole `fields` (`ROW_CAP`).
 */
export const TEXT_CAPS: Readonly<Record<'text' | 'document' | 'url' | 'email', number>> = { text: 16_384, document: 524_288, url: 2_048, email: 2_048 };

/** `OUT_OF_BOUNDS` for a string past its type's cap, or `null`. Counted without encoding a string that cannot be under. */
function overCap(type: keyof typeof TEXT_CAPS, value: string, at: string): Coerced | null {
  const cap = TEXT_CAPS[type];
  /* A UTF-16 unit is at most three UTF-8 bytes, so most text is known to be under without being encoded. */
  if (value.length * 3 <= cap) return null;
  const bytes = new TextEncoder().encode(value).length;
  if (bytes <= cap) return null;
  return bad('OUT_OF_BOUNDS', `${at} is ${bytes} bytes, and ${type === 'email' ? 'an email address' : type === 'url' ? 'a URL' : `a ${type}`} takes at most ${cap} bytes.`, at);
}

/**
 * `VALUE_MALFORMED` for a text holding U+0000, or `null`.
 *
 * REFUSED, NOT CLEANED, as a name with a hidden character is (`host/src/invite.ts`): the self-host's SQLite cut such a
 * text at the NUL without a word, and the Cloud kept a character its own text functions read as the end. The port
 * refuses it as well (`guard`, `@braindog/ports`), and this is the sentence a person reads first, at the field.
 */
function nulRefused(value: string, at: string): Coerced | null {
  if (!value.includes('\u0000')) return null;
  return bad('VALUE_MALFORMED', `${at} has a hidden character in it (U+0000, the null character), which BrainDog cannot keep in text. Send it again without that character.`, at);
}

/**
 * A row's whole `fields` as stored, in UTF-8 bytes: the Durable Object's documented ceiling on one value
 * (`DO_LIMITS.length`, 2 MB). The row is bound as one text, and past what the Cloud takes (4 MB, `DO_MEASURED.length`)
 * the write was a driver's throw on the Cloud and a row the self-host kept and the Cloud could never take in.
 */
export const ROW_CAP = DO_LIMITS.length;

/**
 * `OUT_OF_BOUNDS` at the row's largest field when a write makes its `fields` larger than `ROW_CAP`, or `null`.
 *
 * ONLY A WRITE THAT GROWS THE ROW IS REFUSED. A row already past the cap was written when nothing held it, and an edit
 * that leaves it no larger (a state moved, a field cleared) goes through, so no row a record holds becomes one it cannot
 * write. `before` is read only when the row is over, which a row almost never is.
 */
export function rowOverCap(fields: Readonly<Record<string, Json>>, stored: string, before: (() => string) | null): Refusal | null {
  if (stored.length * 3 <= ROW_CAP) return null;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(stored).length;
  if (bytes <= ROW_CAP) return null;
  if (before !== null && bytes <= encoder.encode(before()).length) return null;
  let at = '';
  let largest = -1;
  for (const [key, value] of Object.entries(fields)) {
    const n = JSON.stringify(value)?.length ?? 0;
    if (n > largest) [at, largest] = [key, n];
  }
  return {
    code: 'OUT_OF_BOUNDS',
    fix: `${at} makes this row ${bytes} bytes, and a row holds at most ${ROW_CAP} bytes. Keep the large part in a file and store a link to it, or split it across rows.`,
    at,
  };
}

const INT_STRING = /^-?\d+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Za-z]{3}$/;

/**
 * ISO 4217'S ACTIVE LIST, AS THE RUNTIME HOLDS IT, READ ONCE.
 *
 * `34 §3` writes the money literal as `currency ":" iso4217`, not as three letters, and three
 * letters was the whole test until this existed. So `GPB` — one transposition away from `GBP` —
 * coerced, wrote and stored, and so did `XYZ` and `VAT`. A bad currency does not break the row it
 * is on; it breaks every FIGURE over that register, permanently, because `sum` cannot add two
 * currencies and no FX rate can ever be found for a currency that does not exist. The reading
 * comes back `met: null`, which is a target that has quietly stopped being evaluated, and nothing
 * on the screen says why.
 *
 * THE RUNTIME'S LIST, NOT A LIST THIS REPOSITORY MAINTAINS. `Intl.supportedValuesOf('currency')` is
 * ISO 4217's active tender as the runtime holds it, so the set grows and shrinks with the platform
 * rather than with whoever last remembered to edit an array.
 *
 * IT IS NOT THE SAME LIST THE EXPONENT COMES FROM, AND THAT IS DELIBERATE (`02 §3` rule 1). This
 * settles whether three letters are a currency; `exponentOf` settles how many minor digits it has,
 * from a table at ISO's values, because `Intl`'s exponents are CLDR's and CLDR gives `IQD` 0 where
 * ISO gives 3. The two lists differ at three codes, `CLF`, `UYI` and `UYW`, which are index and fund
 * units rather than tender: the table knows how to DRAW them, because the renderer is public API and
 * is handed codes nobody validated, and this refuses to STORE them. Narrow at the door, complete at
 * the pen.
 * `packages/record/src/index.ts` already builds its table from `Intl.supportedValuesOf` at
 * module scope in a package the Worker imports, which is the standing proof the API is available
 * under workerd. Cached here for the same reason it is cached there: it is called once per money
 * value written.
 */
const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/**
 * Whether an UPPER-CASE three-letter code is one ISO 4217 actually assigns.
 *
 * The case matters to every caller: `gbp` is a real currency sent in the wrong case, and the
 * record's promise is to store it as `GBP`. So membership is tested on the upper-cased code, never
 * on what arrived. `declare.ts`'s `isCur` upper-cases by grammar instead, requiring `[A-Z]{3}` of a
 * declaration's own text, and then asks this.
 */
export const isCurrencyCode = (code: string): boolean => CURRENCIES.has(code);
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const GRANT = /^g_[0-9A-HJKMNP-TV-Z]{26}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SPOKEN = /^([a-z][a-z0-9_]{0,31})#(\d+)$/;

/** A string that is a JSON-quoted string: a client that stringified a value it already had. */
export function isJsonQuoted(s: string): boolean {
  if (s.length < 2 || s[0] !== '"' || s.at(-1) !== '"') return false;
  try {
    return typeof JSON.parse(s) === 'string';
  } catch {
    return false;
  }
}

/** The two characters backslash and `n`, with no real newline anywhere in the string. */
export const hasEscapedNewline = (s: string): boolean => s.includes('\\n') && !s.includes('\n');

/**
 * A whole value that reads as a Windows path: anchored at a drive (`C:\`, `C:/`), a UNC share (`\\host\`), the long-path
 * prefix (`\\?\C:\`) or `.\` and `..\`, and holding nothing a Windows filename cannot hold after that.
 *
 * WHY IT EXISTS. A real export was refused on two agent runs' `cwd`: both were drive-letter paths with a folder
 * starting with `n`, which is backslash and `n` with no line break, so `hasEscapedNewline` fired on a value that was
 * never text. 186 of that export's 198 `cwd` values were Windows paths, and the refusal's repair, "send a real
 * newline", cannot be applied to one.
 *
 * WHY THE ANCHOR AND NOT ANY BACKSLASH. `Work\notes` and `first\nsecond` are the same shape, and a bare word pair is
 * exactly what a double-encoded two-line text looks like, so an unanchored relative path is still refused. A text
 * that was encoded once too often almost never opens with `C:\` or `\\`, and when it carries a quote (`\"`), a pipe,
 * a tab or a colon past the drive (a time, a label) it is not a filename and the refusal stands.
 */
/* THE SHARE NEEDS A HOST, WITH NO SPACE IN IT, AND THE SEPARATOR AFTER IT. With `\\` alone as the anchor, a value
   that opens with an escaped backslash and then carries escaped newlines (`\\nfirst line\nsecond line`) was
   measured accepted as a share; a host name cannot hold a space, and a line of prose almost always does. And the
   long-path form of a share, `\\?\UNC\host\share`, was measured refused, because only the drive form was listed. */
const WINDOWS_PATH =
  /^(?:\\\\\?\\(?:[A-Za-z]:|UNC)\\|[A-Za-z]:[\\/]|\\\\[^\\\s:*?"<>|\u0000-\u001f]+\\|\.{1,2}\\)[^:*?"<>|\u0000-\u001f]*$/u;
export const readsAsWindowsPath = (s: string): boolean => WINDOWS_PATH.test(s);

/**
 * The shapes a published key takes, by its issuer's own prefix: a private key's PEM header, Stripe,
 * GitHub, GitLab, Slack, AWS, Google, Anthropic and OpenAI, npm, 25 §7's own `phx_` and `vcp_`, a
 * JWT, the two webhook addresses that are their own secret, and a password written into a URL.
 */
const KEY_SHAPES: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/u,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/u,
  /\bgh[opsur]_[A-Za-z0-9]{30,}/u,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/u,
  /\bglpat-[A-Za-z0-9_-]{20,}/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{35}/u,
  /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{20,}/u,
  /\bsk-[A-Za-z0-9]{32,}/u,
  /\bnpm_[A-Za-z0-9]{36}/u,
  /\b(?:phx|vcp)_[A-Za-z0-9]{20,}/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u,
  /hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/u,
  /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/u,
  /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/:@]+:[^\s/@]+@/iu,
  /* A TELEGRAM BOT'S TOKEN IS ITS URL'S PATH, `api.telegram.org/bot<id>:<35>/sendMessage`, so the path exemption below
     let the whole token through. The `bot` prefix is what makes it a shape. */
  /\bbot\d{5,}:[A-Za-z0-9_-]{30,}/u,
  /* HEX, WHICH THE RANDOM-RUN TEST NEVER READS because a key made of it has no capitals. A digest is hex too and is
     let through, so what makes one of these a key is its issuer's prefix (DigitalOcean, Mailgun) or a name in front
     of it that says so: `api_key=`, `AUTH_TOKEN=`, `"secret": "`. Measured stored before this: twenty hex after
     `?api_key=`, a DigitalOcean `dop_v1_` token and a Mailgun `key-` token. */
  /\bdo[opr]_v1_[0-9a-f]{64}/u,
  /\bkey-[0-9a-f]{32}\b/u,
  /(?:key|token|secret|passw(?:or)?d|auth)["']?\s*[:=]\s*["']?[0-9a-f]{20,}(?![0-9a-z])/iu,
  /* A BARE 32-HEX STRING STAYS ALLOWED, with no name or prefix in front of it. An MD5 checksum, a Notion page's id and
     a Loom share are exactly that shape, and a key written alone that way cannot be told apart from them, so refusing
     it would refuse every one of those; the named and prefixed shapes above are what a key pasted from a config
     carries. */
  /* A BEARER TOKEN IS A KEY WHATEVER ITS ALPHABET, because the word in front of it says what it is, as
     `@braindog/declare`'s `credentials.ts` already reads it. Twenty or more of RFC 6750's token characters, so the
     placeholder `Bearer <token>` and the prose "a Bearer token" pass. A Basic header is read by `basicCredential`. */
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,4096}/iu,
];

/**
 * An `Authorization: Basic` header's credentials: base64 that decodes to `user:password`.
 *
 * DECODED, NOT MATCHED BY LENGTH, because the header's value can be as short as `YTpi` (`a:b`) and the prose after
 * the same two words ("Authorization: Basic auth is off") is as short. What only a credential does is decode to a
 * pair joined by a colon.
 */
const BASIC = /\bauthorization["']?\s*[:=]\s*["']?basic\s+([A-Za-z0-9+/]{4,4096}={0,2})(?![A-Za-z0-9+/=])/giu;

function basicCredential(text: string): boolean {
  for (const [, b64] of text.matchAll(BASIC)) {
    try {
      if (atob(b64!).includes(':')) return true;
    } catch {
      /* Not base64 after all, so not a header's credentials: the next one is read. */
    }
  }
  return false;
}

/**
 * What a text looks like once the characters nobody can see are gone.
 *
 * ONE ZERO-WIDTH SPACE IN THE MIDDLE OF A KEY BROKE EVERY SHAPE ABOVE IN TWO, and the key was stored with it
 * (`ghp_...<U+200B>...`). A key copied out of a chat or a document picks these up without anyone seeing them, and a key
 * with one in it still works once it is cleaned. Unicode's default-ignorable set is exactly the characters a renderer
 * draws as nothing: zero-width spaces and joiners, the soft hyphen, the word joiner, the byte-order mark, direction
 * marks and variation selectors. Removing them only joins what sits either side, so Arabic with a direction mark in it
 * and an emoji family joined by ZWJ still read as what they are.
 */
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * A run a key could be written as: the base64 and base64url alphabets, thirty-two or longer.
 *
 * BOUNDED, so a long run is judged a piece at a time: an unbounded match over a text of tens of
 * megabytes in one run overflows the stack, and the write answered 500. No key is 4096 long.
 */
const KEY_RUN = /[A-Za-z0-9+/=_-]{32,4096}/gu;

/**
 * A URL's origin, its path and its query, where a document's own id lives. A link to a document is not a key to it.
 *
 * THE SCHEME IS BOUNDED AT 32. Unbounded, every word boundary in `a.a.a.a...` started a scan to the end of the text for a
 * `://` that never came: 16 KB of it took half a second here and in the password-in-a-URL shape above, and a 512 KB
 * document took 288 seconds (measured). A link's scheme is `https`, `mailto` or a word like them; one past
 * 32 is not read as a link, and its path is judged as plain text, which is the stricter reading.
 */
const URL_PARTS = /\b([a-z][a-z0-9+.-]{0,31}:\/\/([^\s/?#]*))([^\s?#]*)(\?[^\s#]*)?/giu;

/**
 * The words that make a URL an endpoint rather than a link, as its host's first label or one of its path's segments.
 *
 * AN ENDPOINT'S PATH IS WHERE AN INTEGRATION PUTS ITS SECRET, and the exemption for links let it through: Zapier's
 * MCP address is `mcp.zapier.com/api/mcp/s/<secret>/mcp`, and a probe's `https://mcp.example.com/api/mcp/s/<48>/sse`
 * was stored in every text field it tried. A Google Doc, a Drive file, a SharePoint share and a Figma file carry none
 * of these words, so their ids stay links.
 */
const ENDPOINT = /^(?:api|mcp|hooks?|webhooks?|keys?|tokens?|secrets?)$/iu;

/**
 * THE LONGEST DOCUMENT ID MEASURED IS 58, a Teams meeting's; SharePoint's share is 46, Google's 44, Drive's 33 and
 * Figma's 22. A random run of 64 or more in a link is past every one of them, so it is judged as a key on any host.
 *
 * THE RUN, NOT THE SEGMENT, is what is measured. A Teams link's segment is `19%3ameeting_<48>%40thread.v2`, 73 long,
 * and measured whole it was judged, its 58-long run read as random and an ordinary meeting link was refused
 * (measured). What could be a key is a run, so a run is what has to reach 64.
 */
const LONGEST_ID = 64;

/**
 * The words that make a query parameter's value a secret whatever its length: `?token=`, `?api_key=`, `?sig=`,
 * `?client_secret=`, `?code=`, `?password=`. A parameter with any other name holds an id, like a path does, and is
 * judged only past 64: YouTube's `list=` is 34 long and random by every measure here.
 *
 * `pwd` IS LEFT OFF ON PURPOSE. It is the passcode of a Zoom meeting link, which the invitation carries so that anyone
 * invited can join with one press; refusing it refuses every Zoom link pasted from a calendar.
 */
const SECRET_NAME = /key|token|secret|sig|pass|auth|cred|session|code|jwt/iu;

/** The runs in a piece of a link that are long enough to be judged anyway. */
const longRuns = (piece: string): string[] => [...piece.matchAll(KEY_RUN)].map(([run]) => run).filter((run) => run.length >= LONGEST_ID);

/** A value from a query, decoded, or as it stands when it is not valid percent-encoding. */
const decoded = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * A text with each link cut to what could still be a key: all of an endpoint's path and query, a link's named secrets,
 * and a link's runs of 64 or more. The origin stays, and so does a fragment, where an OAuth token travels.
 *
 * A LINK INSIDE A QUERY IS JUDGED AS A LINK, a level down (`depth`): a redirect or a safe-links wrapper around an MCP
 * endpoint carries the endpoint's secret percent-encoded, and under a neutral name like `url=` it would otherwise be
 * judged only past 64. Two levels is every wrapper seen, and the bound keeps a value nested a thousand deep from
 * becoming a thousand calls.
 */
function unlinked(text: string, depth = 0): string {
  return text.replace(URL_PARTS, (_whole, origin: string, authority: string, path: string, query: string | undefined) => {
    /* Segment by segment, because `/` is in the base64 alphabet and a whole path would be read as one run. */
    const segments = path.split('/');
    const host = authority.slice(authority.lastIndexOf('@') + 1).split(/[.:]/u)[0] ?? '';
    const endpoint = ENDPOINT.test(host) || segments.some((s) => ENDPOINT.test(s));
    const kept = endpoint ? [...segments] : segments.flatMap(longRuns);
    for (const param of (query ?? '').slice(1).split('&')) {
      const eq = param.indexOf('=');
      const value = param.slice(eq + 1);
      const inner = decoded(value);
      /* A value with no name has nothing to say it is an id, and is judged whole. Decoded, because an Azure `sig=`
         spells its base64 `+`, `/` and `=` as `%2B`, `%2F` and `%3D`, which cut it into runs too short to read. */
      if (endpoint || eq < 0 || SECRET_NAME.test(param.slice(0, eq))) kept.push(value, inner);
      else if (depth < 2 && inner.includes('://')) kept.push(unlinked(inner, depth + 1));
      else kept.push(...longRuns(value));
    }
    return `${origin} ${kept.join(' ')}`;
  });
}

const classOf = (c: string): number => (c >= 'a' && c <= 'z' ? 0 : c >= 'A' && c <= 'Z' ? 1 : c >= '0' && c <= '9' ? 2 : 3);

/**
 * Whether one run reads as random rather than as words.
 *
 * ENTROPY ALONE DOES NOT TELL THEM APART: a long camel-case name scores what a 32-character key
 * scores. What does is how a key is made. It mixes lower case, capitals and digits, changes class at
 * two characters in five or more, has few separators, and holds few runs of three lower-case letters,
 * which is what a word is made of. Measured over random keys of 32 to 64 characters this misses
 * between one in forty and one in a thousand, and passes the long names, slugs and paths tried.
 */
function random(run: string): boolean {
  if (!/[a-z]/u.test(run) || !/[A-Z]/u.test(run) || !/[0-9]/u.test(run)) return false;
  if (run.replace(/[A-Za-z0-9]/gu, '').length > run.length / 10) return false;
  let turns = 0;
  for (let i = 1; i < run.length; i++) if (classOf(run[i]!) !== classOf(run[i - 1]!)) turns++;
  if (turns < 0.4 * (run.length - 1)) return false;
  let words = 0;
  for (const [w] of run.matchAll(/[a-z]{3,}/gu)) words += w.length;
  if (words >= 0.45 * run.length) return false;
  const counts = new Map<string, number>();
  for (const c of run) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / run.length) * Math.log2(n / run.length);
  return bits >= 3.5;
}

/**
 * A Google file's id: `1` and then base64url, 33 long for a Drive file or folder and 44 for a Doc, a Sheet, a Slides
 * deck or a Form, standing as a word of its own (nothing of a key's alphabet either side of it).
 */
const GOOGLE_ID = /(?<![A-Za-z0-9+/=_-])1(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]{32})(?![A-Za-z0-9+/=_-])/gu;
const GOOGLE_ALONE = /^1(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]{32})$/u;

/** The words that say a text is about a Google file, read with `_` and `-` as spaces so `sheet_id` says it. */
const GOOGLE_SAID = /\b(?:google|g?sheets?|spreadsheets?|gdocs?|drive|slides)\b/iu;

/**
 * A text with the Google file ids in it taken out, where a key's random run would otherwise read one: the whole text
 * when it is one id alone, or each id in a text that says it is about a Google file. Anything else as it came.
 *
 * A SHEET'S ID WAS REFUSED AS A KEY (27 Oct): its 44 characters mix cases and digits as a key's do, and only inside a
 * link (`unlinked`) was it let through. Alone, or in "the roster is Google Sheet <id>", it is the id a person copies out
 * of the address bar, as a bare 32-hex string is a Notion page's (`KEY_SHAPES`). Every issuer's shape above is still
 * read first, so this lets through no key that names its kind, only a run of exactly this shape where a Google file is
 * what the words are about.
 */
function googleless(text: string): string {
  if (GOOGLE_ALONE.test(text.trim())) return '';
  return GOOGLE_SAID.test(text.replace(/[_-]+/gu, ' ')) ? text.replace(GOOGLE_ID, ' ') : text;
}

/**
 * Whether a text holds what looks like a key: a known issuer's shape, or a long random token.
 *
 * LET THROUGH ON PURPOSE: a hex digest or a git hash of any length, a ULID, a UUID and the record's
 * own ids, none of which mixes cases; a run under 64 characters in a link's path, or in a query value
 * whose name does not say secret, which is a document's id; a Google file's id alone or where the text says it is one
 * (`googleless`); and anything under 32 characters. A long base64 value that is not secret, such as a
 * public key or a wallet address, is refused with the keys, because it cannot be told apart from one.
 */
export function looksLikeCredential(text: string): boolean {
  const seen = text.replace(INVISIBLE, '');
  if (KEY_SHAPES.some((shape) => shape.test(seen))) return true;
  if (basicCredential(seen)) return true;
  for (const [run] of unlinked(googleless(seen)).matchAll(KEY_RUN)) if (random(run)) return true;
  return false;
}

/**
 * Whether a text holds a key in a known issuer's shape, and only that: `looksLikeCredential` without its long-random-run
 * test. For a whole file (an attachment's words), where minified script and inline pictures are long random runs that
 * are not keys, the shapes alone are what can be told apart.
 */
export function holdsKnownKey(text: string): boolean {
  const seen = text.replace(INVISIBLE, '');
  return KEY_SHAPES.some((shape) => shape.test(seen)) || basicCredential(seen);
}

/**
 * Whether any string in a JSON value, a key of one of its objects included, looks like a key.
 *
 * A WALK WITH ITS OWN STACK, NOT A RECURSION. Recursing a call per level, a document about 3,500 levels deep threw
 * `RangeError` out of `coerce`, which the write path answers as a failure of its own rather than a refusal the caller
 * can read (measured). An array's indexes are not read as names: they are numbers.
 */
function holdsKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const one = stack.pop();
    if (typeof one === 'string') {
      if (looksLikeCredential(one)) return true;
      continue;
    }
    if (typeof one !== 'object' || one === null || seen.has(one)) continue;
    seen.add(one);
    /* One at a time: spreading a list of a million into one call is a RangeError of its own. */
    if (Array.isArray(one)) for (const inner of one) stack.push(inner);
    else
      for (const [name, inner] of Object.entries(one)) {
        if (looksLikeCredential(name)) return true;
        stack.push(inner);
      }
  }
  return false;
}

/**
 * The one refusal for a key, in every type that can hold text. No `found`, because the value may be the key.
 *
 * `url`, `email` AND `json` HAD NO CHECK AT ALL, and `https://admin:<password>@git.example.com/skills.git` and
 * `ghp_<36>@example.com` were both stored through the kernel. The import checks first, so it could not reach them, and
 * an agent over MCP or a caller of the API could.
 */
const keyRefused = (at: string): Coerced =>
  bad('VALUE_MALFORMED', `${at} holds what looks like a key, and a key never goes in a row. Deposit it in the keychain, and write here what it opens.`, at);

/**
 * What `min:` and `max:` measure (`02 §5`): the UTF-8 bytes of a text or a document, the value of a
 * number, a money's amount in minor units and a quantity's value. `null` for anything else.
 */
export function measure(type: string, value: Json): number | null {
  if (type === 'text' || type === 'document') return typeof value === 'string' ? new TextEncoder().encode(value).length : null;
  if ((type === 'money' || type === 'quantity') && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const n = type === 'money' ? value.amount : value.value;
    return typeof n === 'number' ? n : null;
  }
  return typeof value === 'number' ? value : null;
}

/** A field's bounds in words, as a refusal names them: `12 to 400`, `at least 12`, `at most 400`. */
export const range = (lo: number | undefined, hi: number | undefined): string =>
  lo !== undefined && hi !== undefined ? `${lo} to ${hi}` : lo !== undefined ? `at least ${lo}` : `at most ${String(hi)}`;

/** A day that exists. `2026-02-30` matches the shape and is not a date. */
export function isRealDay(s: string): boolean {
  const m = DAY.exec(s);
  if (!m) return false;
  const [y, mo, d] = s.split('-').map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
}

/** `YYYY-MM-DDTHH:MM:SS.mmmZ`, which is the only instant shape the record stores. */
export const instant = (ms: number): string => new Date(ms).toISOString();

/** `obligations#41` — the id a person says out loud. */
export const spoken = (register: string, seq: number): string => `${register}#${seq}`;

export function parseSpoken(s: string): { register: string; seq: number } | null {
  const m = SPOKEN.exec(s.trim());
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
}

/**
 * Turn one value into what the record stores, or refuse it.
 *
 * `resolve` is how a `ref` given as a spoken id becomes a row id, and a `secret` is checked against
 * the grants that exist. Both are lookups the caller owns, because this module may not touch SQL.
 */
export type Lookups = {
  /** `obligations#41` to the row's 26-character id, or `null` when there is no such row. */
  refId?: (register: string, seq: number) => string | null;
  /**
   * `LN8` to `learnings` and 8, by the prefixes the record has installed, or `null` when no register owns the prefix.
   *
   * A PREFIX IS THE RECORD'S OWN WORD FOR A ROW, and this case read only `register#number`. Every answer an agent reads
   * names a learning `LN8`, so the MCP package qualified a prefix on the way into `create` and `update`, and
   * `propose`'s `rowset` went round it: filed, then refused `because[0] takes a row id or a spoken id` at the owner's
   * accept. Read here, every writer of a row reads a prefix, the accept among them.
   */
  prefixed?: (said: string) => { register: string; seq: number } | null;
  /** Whether `obligations#41` is a row that was deleted, so a refusal says that rather than that it never existed. */
  deleted?: (register: string, seq: number) => boolean;
  /** Does a grant with this id exist? */
  grantExists?: (id: string) => boolean;
  /**
   * A `currency_from` field's code: the one the linked row's money field holds, or `null` when the row names no
   * account or the account holds no value. The caller owns it, because which row the link names is in the patch and
   * the stored row together, and reading that row is SQL.
   */
  currencyOf?: () => string | null;
};

/** The sentence an amount gets when it has no code and nothing it is filed against has one to give. */
export const NO_CURRENCY_TO_GIVE = 'This amount has no currency, and its account has none to give.';

/** The sentence a later write gets when it would change a `currency_fixed` field's code. */
export const CURRENCY_FIXED_SENTENCE =
  "A row keeps its currency, so delete this row and add it again in the other currency.";

/**
 * `CURRENCY_FIXED` when a write would change the code a `currency_fixed` field already holds, or `null`.
 *
 * THE CODE IS LOCKED AND THE NUMBER IS NOT. `immutable` locks a whole field, and the Ledger's amount is corrected often
 * and never moves between currencies: a transaction's currency is one of the things he listed as never changing,
 * and a row whose code changed in place would carry a history in which one amount was two kinds of money.
 * `next` is the coerced value, so `egp` and `EGP` are one code. Clearing the field is not a change of code.
 */
export function currencyFixed(field: FieldDecl, stored: unknown, next: unknown, at = field.id): Refusal | null {
  if (field.type !== 'money' || field.currency_fixed !== true) return null;
  const was = codeOf(stored);
  const now = codeOf(next);
  if (was === null || now === null || was === now) return null;
  return { code: 'CURRENCY_FIXED', fix: CURRENCY_FIXED_SENTENCE, at, allowed: [was], detail: `The row holds ${was}, and the write sent ${now}.` };
}

const codeOf = (v: unknown): string | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && typeof (v as { currency?: unknown }).currency === 'string'
    ? ((v as { currency: string }).currency).toUpperCase()
    : null;

export function coerce(field: FieldDecl, value: unknown, look: Lookups = {}, at = field.id): Coerced {
  const malformed = (fix: string, extra?: Omit<Refusal, 'code' | 'fix' | 'at'>) =>
    bad('VALUE_MALFORMED', fix, at, extra ?? {});

  switch (field.type) {
    case 'text':
    case 'document': {
      if (typeof value !== 'string') return malformed(`${at} takes a string.`);
      /* THE CAP FIRST, so a text of megabytes is refused before the credential check reads it. */
      const over = overCap(field.type, value, at);
      if (over) return over;
      const nul = nulRefused(value, at);
      if (nul) return nul;
      /* A CREDENTIAL NEVER GOES IN A ROW IN PLAIN TEXT, and this is the check that keeps it out of
         every text a register holds, from every caller. First, so a key sent JSON-quoted is still
         answered with where keys go.

         `VALUE_MALFORMED`, AND THE `secret` ARM BELOW IS WHY. The record already answers a key sent
         where no row keeps one with this code and no `found`: a secret field takes a grant id and
         never the key. This is the same fact at a text field, and one fact keeps one code.
         `SECRET_IN_PACK` says it about a pack, and its repair is an edit to a pack file that a caller
         writing a learning has not got. `FORBIDDEN` is about who asks, and a person is refused this
         as surely as an agent. No `found`, because the value may be the key. */
      if (looksLikeCredential(value)) return keyRefused(at);
      /* In this order: a JSON-quoted string also contains no newline, and reporting the second would
         send the caller looking for a line break that was never the problem. */
      if (isJsonQuoted(value))
        return bad(
          'TEXT_JSON_QUOTED',
          `${at} arrived as a JSON-quoted string. Send the text itself, not the result of stringifying it.`,
          at,
        );
      /* A PATH IS EXEMPT HERE, NOT INSIDE `hasEscapedNewline`, because that helper is exported and its own test
         pins it as a textual rule (`C:\next` is true there, on purpose); the decision about what to refuse is
         this one, and it is the one a real import tripped on. */
      if (hasEscapedNewline(value) && !readsAsWindowsPath(value))
        return bad(
          'TEXT_ESCAPED_NEWLINE',
          `${at} contains the two characters backslash and n, and no line break anywhere. Send a real newline; or, if those two characters are meant literally, a value with a real line break in it as well.`,
          at,
        );
      // A `document` is the dialect, and the dialect is line-based: CRLF would put a stray CR in
      // every fence. Text is left exactly as it arrived.
      return good(field.type === 'document' ? value.replace(/\r\n/g, '\n') : value);
    }

    case 'int':
    case 'duration': {
      const n = typeof value === 'string' && INT_STRING.test(value.trim()) ? Number(value.trim()) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return malformed(`${at} takes a whole number.`);
      if (!Number.isInteger(n)) return malformed(`${at} takes a whole number; ${n} has a fraction.`);
      if (Math.abs(n) > MAX_SAFE)
        return bad('INT_OUT_OF_RANGE', `${at} is past 2^53 − 1, where a number stops being exactly itself.`, at);
      return good(n);
    }

    case 'decimal': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return malformed(`${at} takes a number.`);
      const digits = String(Math.abs(n)).replace(/[-.eE+]/g, '').replace(/^0+/, '').length;
      if (digits > 15)
        return malformed(`${at} has more than fifteen significant digits, which a double cannot hold exactly.`);
      return good(n);
    }

    case 'money': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return malformed(`${at} takes { amount, currency }, where amount is an integer in minor units.`);
      const raw = value as Record<string, unknown>;
      if ('minor' in raw && !('amount' in raw))
        return malformed(`${at} has a key called minor; a money value's number is called amount.`);
      const amountIn = raw.amount;
      const amount =
        typeof amountIn === 'string' && INT_STRING.test(amountIn.trim()) ? Number(amountIn.trim()) : amountIn;
      if (typeof amount !== 'number' || !Number.isFinite(amount))
        return malformed(`${at}.amount takes an integer in minor units: 4800 is GBP 48.00.`);
      /* A FLOAT IS THE EXACT BUG MINOR UNITS EXIST TO STOP, so it is refused rather than rounded:
         rounding is how a record ends up a penny out on a figure somebody is about to act on. */
      if (!Number.isInteger(amount))
        return malformed(`${at}.amount is ${amount}; money is an integer in minor units, so 48.00 is 4800.`);
      if (Math.abs(amount) > MAX_SAFE)
        return bad('INT_OUT_OF_RANGE', `${at}.amount is past 2^53 − 1.`, at);
      /* AN AMOUNT WITH NO CODE, ON A FIELD THAT SAYS WHERE ITS CODE COMES FROM, takes the account's. Only absent:
         a code that was sent is kept as written, and a wrong one is still refused below. Nothing to give is refused
         rather than guessed, because a guessed currency is the sterling a bank in Egypt was filed in 22 times. */
      const unsaid = raw.currency === undefined || raw.currency === null || raw.currency === '';
      const given = unsaid && typeof field.currency_from === 'string' ? (look.currencyOf?.() ?? null) : undefined;
      if (given === null) return malformed(NO_CURRENCY_TO_GIVE);
      const currency = given ?? raw.currency;
      if (typeof currency !== 'string' || !CURRENCY.test(currency))
        return malformed(`${at}.currency takes a three-letter code, and every money value carries its own.`);
      /* THE MEMBERSHIP TEST RUNS ON THE UPPER-CASED CODE, and the order is the whole subtlety: a
         caller sending `gbp` is sending a real currency in the wrong case, and this path has always
         stored it as `GBP`. Testing membership before normalising would refuse them. */
      const code = currency.toUpperCase();
      /* A SEPARATE SENTENCE FROM THE SHAPE REFUSAL ABOVE, because they send the caller to different
         places: `POUNDS` is not a code at all, and `GPB` is a code for nothing. Telling the second
         caller to send three letters would be telling them they already did. */
      if (!isCurrencyCode(code))
        return bad('CURRENCY_UNKNOWN', `${at}.currency is ${code}, and ISO 4217 assigns no such currency. Money in a currency that does not exist can never be added up or converted, so the figure over it stops being a number.`, at);
      return good({ amount, currency: code });
    }

    case 'quantity': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return malformed(`${at} takes { value, unit }.`);
      const raw = value as Record<string, unknown>;
      const n = typeof raw.value === 'string' && raw.value.trim() !== '' ? Number(raw.value) : raw.value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return malformed(`${at}.value takes a number.`);
      if (typeof raw.unit !== 'string' || raw.unit.trim() === '')
        return malformed(`${at}.unit names what the number counts, and a quantity without one is a number.`);
      return good({ value: n, unit: raw.unit.trim() });
    }

    case 'day': {
      if (typeof value !== 'string') return malformed(`${at} takes a day, as YYYY-MM-DD.`);
      const s = value.trim();
      if (!DAY.test(s)) return malformed(`${at} takes a day, as YYYY-MM-DD. An instant is a different type.`);
      /* THE SHAPE IS NOT THE CHECK: `Date.UTC` normalises, so 2026-02-30 would become 2 March — a
         date that is not the one that was sent, stored without a word about it. */
      if (!isRealDay(s)) return malformed(`${at} is ${s}, which is not a day that exists.`);
      return good(s);
    }

    case 'instant': {
      if (typeof value !== 'string') return malformed(`${at} takes an instant.`);
      const said = value.trim();
      /* AN INSTANT CARRIES ITS ZONE, and this took `Date.parse` at its word. `2026-09-05T02:00:00`
         with no offset is read as LOCAL time by the ECMAScript grammar, and `instant()` then
         restamps it as UTC — so on a self-host at UTC+3 that value was stored as
         `2026-09-04T23:00:00Z`: the PREVIOUS DAY for every `slice(0, 10)` reader, every digest
         window and every `before today`. The same host in another timezone stores a different
         moment for the same string, which is the one thing a record that syncs cannot do.

         And it is inconsistent with itself: a bare `YYYY-MM-DD` is parsed as UTC by the same
         function, so the identical day with and without a time landed on different days.

         The `day` type next door checks its shape rather than trusting the parse, for the same
         reason. This is that check for an instant: a zone, or a sentence saying so. */
      /* A BARE DAY IS ALLOWED, because it is not ambiguous: `Date.parse('2026-09-05')` is UTC
         midnight by the ECMAScript grammar, in every engine. What is ambiguous is a date WITH a time
         and no offset, which the same grammar reads as local. Refusing the bare form as well would
         be a narrowing nothing asked for, and it is the form an extracted date arrives in.

         `±hh` IS ALSO A ZONE. ISO 8601 admits the hour-only offset and rejecting it would refuse a
         value that says exactly what it means. */
      const zoned = /^\d{4}-\d{2}-\d{2}$/.test(said) || /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(said);
      if (!zoned)
        return malformed(`${at} is ${said}, which names no timezone. Write 2026-09-05T02:00:00Z, or the offset it was recorded in.`);
      const ms = Date.parse(said);
      if (!Number.isFinite(ms)) return malformed(`${at} is not an instant BrainDog can read.`);
      return good(instant(ms));
    }

    case 'bool': {
      if (typeof value === 'boolean') return good(value);
      if (value === 'true') return good(true);
      if (value === 'false') return good(false);
      return malformed(`${at} takes true or false.`);
    }

    case 'enum': {
      // Membership is the write path's, because the refusal there can list the values.
      if (typeof value !== 'string') return malformed(`${at} takes one of its declared values.`);
      return good(value);
    }

    case 'ref': {
      if (typeof value !== 'string') return malformed(`${at} takes a row id or a spoken id.`);
      const s = value.trim();
      if (ULID.test(s)) return good(s);
      const said = parseSpoken(s) ?? look.prefixed?.(s) ?? null;
      if (!said) return malformed(`${at} takes a row id or a spoken id like ${field.to ?? 'register'}#41.`);

      /**
       * THE REGISTER THE FIELD DECLARES, AND IT WAS NEVER COMPARED.
       *
       * `field.to` was read in this case for exactly one thing: building the sentence in the line
       * above. So `invoices#3` written into a field declared `to: contacts` resolved the INVOICES
       * row and stored its id, and every read afterwards followed the reference into the wrong
       * register and found a row that is a real row. Nothing is malformed, nothing is missing,
       * nothing refuses, and the answer is wrong: the shape this repository keeps finding, in the
       * one place where the record's own referential integrity lives.
       *
       * `REF_REGISTER_MISMATCH` AND NOT `REF_UNKNOWN`, and `30 §6` line 774 draws the line in as
       * many words: `REF_UNKNOWN` has nothing to point at, and this one points at the wrong thing.
       * The repairs differ, so the codes do: repoint this one, write the missing row for that one.
       *
       * `field.to` UNSET IS NOT A MISMATCH. A `ref` with no declared target accepts any register,
       * which is what `41 §4`'s own optionality means, and inventing a refusal for it here would
       * refuse a declaration `declare` accepts.
       */
      if (field.to !== undefined && said.register !== field.to)
        return bad(
          'REF_REGISTER_MISMATCH',
          `${at} points at ${field.to}, and ${s} is a ${said.register} row. Name a ${field.to} row, or change what this field points at.`,
          at,
          /* `allowed`, WHICH IS THE ONE SHAPE `Refusal` HAS FOR "SEND THIS INSTEAD". `50 §2.5`
             types the browser's own `Refusal` with `found` and `wanted`; `packages/ports` has
             neither, and inventing them at one call site would be a second refusal shape reaching a
             caller that reads the first. One register, because a field points at one. */
          { allowed: [field.to] },
        );

      const id = look.refId?.(said.register, said.seq) ?? null;
      if (!id)
        return malformed(
          look.deleted?.(said.register, said.seq)
            ? `${at} names ${s}, which was deleted. Name a live row, or restore ${s} first.`
            : `${at} names ${s}, and there is no such row.`,
        );
      return good(id);
    }

    case 'file': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return malformed(`${at} takes { sha256, mime, bytes, name }.`);
      const raw = value as Record<string, unknown>;
      if (typeof raw.sha256 !== 'string' || !SHA256.test(raw.sha256))
        return malformed(`${at}.sha256 takes sixty-four lower-case hex characters.`);
      if (typeof raw.mime !== 'string' || raw.mime === '') return malformed(`${at}.mime is missing.`);
      if (typeof raw.bytes !== 'number' || !Number.isInteger(raw.bytes) || raw.bytes < 0)
        return malformed(`${at}.bytes takes a whole number of bytes.`);
      if (typeof raw.name !== 'string' || raw.name === '') return malformed(`${at}.name is missing.`);
      return good({ sha256: raw.sha256, mime: raw.mime, bytes: raw.bytes, name: raw.name });
    }

    case 'url': {
      if (typeof value !== 'string') return malformed(`${at} takes a URL.`);
      const over = overCap('url', value, at);
      if (over) return over;
      if (looksLikeCredential(value)) return keyRefused(at);
      let url: URL;
      try {
        url = new URL(value.trim());
      } catch {
        return malformed(`${at} is not a URL.`);
      }
      /* TWO SCHEMES. Anything else in a record is a link somebody will eventually click out of a
         page the record rendered, and `javascript:` and `data:` are the two that matter. */
      if (url.protocol !== 'https:' && url.protocol !== 'mailto:')
        return malformed(`${at} is ${url.protocol.replace(':', '')}; BrainDog keeps https and mailto links.`);
      return good(url.href);
    }

    case 'email': {
      if (typeof value !== 'string') return malformed(`${at} takes an email address.`);
      const over = overCap('email', value, at);
      if (over) return over;
      if (looksLikeCredential(value)) return keyRefused(at);
      const s = value.trim();
      const parts = s.split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1] || /[\s\u0000]/.test(s))
        return malformed(`${at} takes one address, as name@example.com.`);
      return good(`${parts[0]}@${parts[1]!.toLowerCase()}`);
    }

    case 'secret': {
      /* THE REFUSAL CARRIES NO `found`, and that is the whole rule: the value might be the
         credential itself, and a refusal is logged. A register indexes what a key OPENS, never the
         key — this field holds the id of a grant and nothing else, ever. */
      if (typeof value !== 'string' || !GRANT.test(value.trim()))
        return bad('VALUE_MALFORMED', `${at} takes the id of a grant, and never a credential.`, at);
      const id = value.trim();
      if (look.grantExists && !look.grantExists(id))
        return bad('VALUE_MALFORMED', `${at} names a grant that does not exist.`, at);
      return good(id);
    }

    case 'list': {
      if (!Array.isArray(value)) return malformed(`${at} takes a list.`);
      const of = field.of ?? 'text';
      const out: Json[] = [];
      for (const [i, element] of value.entries()) {
        const one = coerce({ ...field, type: of, of: undefined as never }, element, look, `${at}[${i}]`);
        if (!one.ok) return one;
        out.push(one.value);
      }
      return good(out);
    }

    case 'json':
      return holdsKey(value) ? keyRefused(at) : good(value as Json);

    default:
      return malformed(`${at} has a type this build does not read.`);
  }
}

/**
 * Does this coerced value count as MISSING?
 *
 * `34-GRAMMARS` §1.3 makes JSON null, the empty string and the empty list all the same thing —
 * absent — so none of them is stored. A field holding `""` and a field holding nothing would be two
 * states with one meaning, and every reader would have to know both.
 */
export const isAbsent = (v: Json): boolean => v === null || v === '' || (Array.isArray(v) && v.length === 0);
