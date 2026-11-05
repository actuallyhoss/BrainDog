/**
 * Every limit a stranger could hit once sign-up opens, in one table, each with the one line of why.
 *
 * NO IMPORTS AT RUNTIME, so the Worker, the self-host, the Directory and a test can all read the numbers from here
 * without pulling a door in. `limits.ts` keeps the older per-minute pair (`READ_PER_MINUTE`, `WRITE_PER_MINUTE`,
 * `POLL_PER_MINUTE`) beside its binding; this file holds everything added on top of them.
 *
 * A COUNT HERE IS A FIXED WINDOW KEPT IN THE DIRECTORY (`abuseHit`), keyed `rl:<name>:<who>`. The owner's own agent
 * is never limited by anything below its plan's cap: the per-record rows are far above what one person works at.
 */

/** The line a person reads on every 429 here. Whole seconds; "1 second" when it is one. */
export const tooManyLine = (seconds: number): string => {
  const n = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60;
  return `Too many requests just now. Try again in ${n} ${n === 1 ? 'second' : 'seconds'}.`;
};

/** One counted limit: how many in how many seconds, who it counts, and why that number. */
export type AbuseRule = { readonly most: number; readonly seconds: number; readonly by: 'ip' | 'record'; readonly why: string };

/** The MCP door's minute for one token, `RL_MCP` when bound. Above any one person's agent, below a loop. */
export const MCP_PER_MINUTE = 300;

export const ABUSE = {
  /* PER ADDRESS: the doors a stranger reaches with no credential. */
  signinLink: { most: 6, seconds: 600, by: 'ip', why: 'Each request mails a sign-in link; six in ten minutes covers a person who lost the first.' },
  apply: { most: 5, seconds: 3600, by: 'ip', why: 'An application goes to the owner to read; five an hour is a person who mistyped.' },
  signup: { most: 10, seconds: 3600, by: 'ip', why: 'A start and a verify per try, with a bot check each; ten an hour is a shared office.' },
  seen: { most: 120, seconds: 60, by: 'ip', why: 'A page view beacon; two a second is a fast reader, more is a script padding the funnel.' },
  operatorKey: { most: 10, seconds: 900, by: 'ip', why: 'Each wrong operator key costs one, and the right key clears them: ten in fifteen minutes is a script with a stale key, more is a guess.' },
  kennelKey: { most: 20, seconds: 86_400, by: 'ip', why: 'A signed submission from nobody signed in; a key is free to make, and twenty a day is an author with two packs and a bad afternoon.' },
  oauthToken: { most: 60, seconds: 900, by: 'ip', why: 'One exchange per connected app; sixty in fifteen minutes is a team connecting at once.' },
  /* `/oauth/register` and `/oauth/authorize` keep the Directory count in `packages/record/src/oauth.ts` (ten in fifteen minutes). */

  /* PER RECORD: what one account can do to the host, whoever holds the token. */
  inboxHour: { most: 1500, seconds: 3600, by: 'record', why: 'Arrivals stored per hour for one record; a busy shop is a few hundred, a loop is thousands.' },
  inboxStrangerHour: { most: 300, seconds: 3600, by: 'record', why: 'Arrivals nothing verified, kept apart so a stranger who knows the address cannot spend the hour its real senders need.' },
  uploadDay: { most: 200 * 1024 * 1024, seconds: 86_400, by: 'record', why: 'File bytes kept per day for one record, counted in bytes; the bucket is paid for per byte.' },
  slashDay: { most: 200, seconds: 86_400, by: 'record', why: 'Slash asks per day on the included model, on top of the plan month; stops a day spending a month.' },
} as const satisfies Record<string, AbuseRule>;

export type AbuseName = keyof typeof ABUSE;

/**
 * The most a POST body may be, by door, in bytes. A door with its own tighter cap keeps it; this is the net under all of
 * them so no door is left with none, and a body over it is a 413 before a byte is parsed.
 */
export const BODY_MOST = {
  api: { bytes: 1_048_576, why: 'A record call, as the API door already caps it (`API_BODY_MOST_BYTES`).' },
  import: { bytes: 16 * 1_048_576, why: 'A whole-record import is the one call that is allowed to be large.' },
  sealed: { bytes: 6 * 1_048_576, why: 'One part of a sealed file, four mebibytes before base64, as the API door caps it (`SEALED_BODY_MOST_BYTES`).' },
  auth: { bytes: 65_536, why: 'A passkey ceremony is a few kilobytes; nothing at sign-in is larger.' },
  oauth: { bytes: 16_384, why: 'A registration, a consent and a token form are a few hundred bytes.' },
  account: { bytes: 1_048_576, why: 'Billing and the operator doors; a payment event is the largest at one megabyte.' },
  keychain: { bytes: 65_536, why: 'A key and its label.' },
  mcp: { bytes: 1_048_576, why: 'A tool call carries what an API call does, so it is capped the same.' },
  seen: { bytes: 2_048, why: 'A path and a referrer host.' },
} as const satisfies Record<string, { bytes: number; why: string }>;

/** The plain line a 413 carries. */
export const tooLargeLine = (bytes: number): string => `That request is too large. The most this door takes is ${bytes >= 1_048_576 ? `${Math.round(bytes / 1_048_576)} MB` : `${Math.ceil(bytes / 1024)} KB`}.`;
