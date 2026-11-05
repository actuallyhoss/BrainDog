/**
 * The floor under every log line: nothing shaped like a key, an address or a query string reaches a log, whoever wrote it.
 *
 * A KEY'S BYTES ONCE WENT TO THE LOGS THROUGH AN ERROR NOBODY WROTE. A scrub's pattern overflowed the regular expression
 * stack, the runtime's sentence quoted the pattern, and the pattern held the key in base64. `secret-grep` could not see
 * it: the line named no secret, it named `e.message`. So a rule about what callers name is not enough, because the
 * sentence that leaks is the runtime's or a driver's, and any `e.message` can carry whatever the thrown code was holding.
 * This is the one place that holds, under every caller, for every sentence.
 *
 * A FALSE MATCH COSTS A WORD IN A LOG LINE, A MISS COSTS A KEY IN EVERY COPY OF THE LOGS. So it is wide. What it keeps on
 * purpose: a UUID, which is how a crash's reference finds its line, and a run of letters and dashes with no digit, which
 * is a path or a name and is what a long key never is.
 *
 * IT IS NOT A REASON TO LOG A VALUE. `53 §2.3` still says a line carries a code, an id and a shape. No list of shapes is
 * every key, and this list is a floor rather than a licence.
 *
 * LINEAR ON PURPOSE. A line is cut at `LINE_MOST` before any pattern reads it, every pattern is a run of one class or a
 * literal, and nothing here is built from what it reads, because a pattern built from a key is what started this.
 *
 * NO IMPORT AT ALL and no `node:`, so both hosts and a bare Node test load it. It never throws: a line is written inside
 * a catch, and a log that could fail would turn what it reports into a second failure.
 */

/** The most characters one written argument keeps. A long sentence is a thrown message holding a body. */
export const LINE_MOST = 2_000;

/** What stands where a key was, and where a line that could not be read was. */
const STRUCK = '[struck]';

/* A RUNTIME THAT QUOTES ITS OWN PATTERN IS QUOTING WHATEVER THE PATTERN WAS BUILT FROM, which is the leak this file exists for. */
const BAD_PATTERN = /Invalid regular expression:[\s\S]*/gu;
const PEM = /-----BEGIN [A-Z0-9 ]{0,40}-----[\s\S]*?(?:-----END [A-Z0-9 ]{0,40}-----|$)/gu;
/* WHO SIGNED IN TO AN ADDRESS, AND WHAT IT WAS ASKED. A key in a query string is how a provider that takes one in the
   address gets it, and a thrown fetch names the whole address. */
const USERINFO = /(\b[a-z][a-z0-9+.-]{0,20}:\/\/)[^\s/?#"'@]{1,200}@/giu;
const QUERY = /(\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s?#"']{1,500})\?[^\s"']*/giu;
/* A SCHEME WORD AND WHAT IT CARRIES. `token` is not one of them: "token expired" is a sentence. */
const SCHEME = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu;
/* A NAME SAYING WHAT THE NEXT THING IS, in a header, a form, JSON or a sentence. */
const NAMED =
  /(\b(?:api[_-]?key|apikey|x-api-key|access[_-]?token|refresh[_-]?token|auth[_-]?token|id[_-]?token|client[_-]?secret|private[_-]?key|secret|password|passwd|passphrase|token|authorization)\b["']?\s{0,3}[:=]\s{0,3}["']?)[^\s"',;&)}\]]{6,}/giu;
/* A PROVIDER'S OWN PREFIX: these say they are keys however short the rest is. */
const PREFIXED =
  /\b(?:(?:sk|rk|pk|whsec|ghp|gho|ghu|ghs|ghr|github_pat|glpat|gsk|hf|sntrys|sntryu|phx|phc|phs|cfut|cfat|cfk|npm|pypi|dop_v1|shpat|xapp|re)[-_][A-Za-z0-9_.-]{10,}|xox[abeprs]-[A-Za-z0-9-]{10,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|GOCSPX-[A-Za-z0-9_-]{16,}|AGE-SECRET-KEY-[A-Z0-9]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/gu;
const JWT = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]*)?/gu;
/* A BEARER ON THE WIRE IS `<rec_id>.<secret>`. The record's id stays, because it is what a line is about. */
const WIRE_BEARER = /\b(rec_[0-9A-Za-z]{4,})\.[A-Za-z0-9_-]{12,}/gu;
/* ANY LONG RUN THAT MIXES LETTERS AND DIGITS, which is what a key, a hash and base64 all are. */
const LONG_RUN = /[A-Za-z0-9+/_=-]{28,}/gu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/* AN ADDRESS, BY ITS SHAPE, as `oplog.ts` has it. */
const ADDRESS = /[^\s@<>"'`,;:()[\]]+@[^\s@<>"'`,;:()[\]]+\.[^\s@<>"'`,;:()[\]]+/gu;

/* AN ID OF OURS, `rec_` AND A ULID: 26 of Crockford's capitals, which no provider's key is. It is what a line is about. */
const OUR_ID = /^[a-z]{1,8}_[0-9A-HJKMNP-TV-Z]{26}$/u;

const longRun = (run: string): string => (UUID.test(run) || OUR_ID.test(run) || !/[0-9]/u.test(run) || !/[A-Za-z]/u.test(run) ? run : STRUCK);

/**
 * One line of text as a log may keep it. Cut first, so every pattern below reads a bounded text.
 */
export function floored(text: string): string {
  try {
    const cut = text.length > LINE_MOST;
    /* WHAT THE CUT WENT THROUGH GOES WITH IT: the piece of a key left at the end is short enough to pass as a word. */
    let line = cut ? text.slice(0, LINE_MOST).replace(/\S*$/u, '') : text;
    line = line.replace(BAD_PATTERN, `Invalid regular expression: ${STRUCK}`);
    line = line.replace(PEM, STRUCK);
    line = line.replace(USERINFO, `$1${STRUCK}@`);
    line = line.replace(QUERY, `$1?${STRUCK}`);
    line = line.replace(SCHEME, `$1 ${STRUCK}`);
    line = line.replace(NAMED, `$1${STRUCK}`);
    line = line.replace(PREFIXED, STRUCK);
    line = line.replace(JWT, STRUCK);
    line = line.replace(WIRE_BEARER, `$1.${STRUCK}`);
    line = line.replace(LONG_RUN, longRun);
    if (line.includes('@')) line = line.replace(ADDRESS, '[an address]');
    return cut ? `${line}...` : line;
  } catch {
    return STRUCK;
  }
}

/**
 * The thrown thing as a sentence a log may keep, and never a throw of its own: `String(e)` can throw, and this runs
 * inside catches.
 */
export function reasonOf(e: unknown): string {
  try {
    return floored(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  } catch {
    return `a thrown ${typeof e} that could not be turned into text`;
  }
}

/**
 * The thrown thing with its sentence floored, to throw on.
 *
 * WHAT ESCAPES AN ENTRY POINT THE PLATFORM WRITES DOWN ITSELF, past the console, message and stack: an alarm that throws
 * is retried, and its sentence is in the logs however the code above it logs. So the same error goes on, with whatever
 * flags say it may be retried, and only its words change.
 */
export function flooredError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(reasonOf(e));
  try {
    e.message = floored(e.message);
    if (typeof e.stack === 'string') e.stack = floored(e.stack);
    return e;
  } catch {
    return new Error(reasonOf(e));
  }
}

/** One argument of a console call. A number and a flag cannot hold a key; everything else is read as text first. */
function argument(said: unknown): unknown {
  try {
    if (typeof said === 'string') return floored(said);
    if (said === null || typeof said !== 'object') return said;
    if (said instanceof Error) return floored(said.stack ?? `${said.name}: ${said.message}`);
    return floored(JSON.stringify(said));
  } catch {
    return STRUCK;
  }
}

/** The methods a host writes its lines through. */
const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

/** The console, or a test's stand-in for it. */
export type LogTarget = Partial<Record<(typeof METHODS)[number], (...said: unknown[]) => void>>;

const FLOORED: unique symbol = Symbol.for('braindog.log-floor');

/**
 * Put the floor under every line this isolate writes, from a host's own code, a package's or a library's.
 *
 * AT THE CONSOLE AND NOT AT EACH CALL, because the fault is the call nobody thought about: forty-odd lines hand over
 * `e.message`, and the next one will too. Twice is once, because a host's entry can be loaded by more than one door.
 */
export function installLogFloor(target: LogTarget = console as unknown as LogTarget): void {
  const held = target as LogTarget & { [FLOORED]?: true };
  if (held[FLOORED] === true) return;
  held[FLOORED] = true;
  for (const method of METHODS) {
    const write = target[method];
    if (typeof write !== 'function') continue;
    target[method] = (...said: unknown[]): void => {
      write.apply(target, said.map(argument));
    };
  }
}
