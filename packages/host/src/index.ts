/**
 * The bit both hosts share: the route table, the status mapping, and the loop that answers.
 *
 * TWO HOSTS EXIST (the Worker and the self-host) and they are the same product. `ADR-064` puts
 * their common half in one platform-neutral package for a reason that is not tidiness: a route that
 * exists in one and not the other is a product that behaves differently depending on where a
 * customer runs it, and nobody finds out until somebody exports a record from one and imports it
 * into the other.
 *
 * STANDARD `Request` AND `Response`, so this file runs in workerd and in Node without a shim. The
 * Worker adds the Durable Object and the self-host adds the filesystem; neither adds a route.
 *
 * THE ROUTE TABLE IS DATA. It is a list of names and what each one needs, so "what can this thing
 * do" is a value the MCP server, the CLI and the docs can all read rather than a switch three of
 * them have to stay in step with.
 */

import type { Conflict, Refusal, Result } from '@braindog/ports';
import { conflicted, nulAt, nulSaid, refused } from '@braindog/ports';

import { FIREWALL_FAULT, firewall } from '@braindog/record/sight';

import { crashed } from './crash.ts';
import { EXTRA_ROUTES } from './routes/index.ts';
import { sendPathOf } from './send-paths.ts';

export { HINTS, hintsOf, sessionOf, withSession, type SessionHints } from './session.ts';
export { serveKeychain, servesKeychain, KEYCHAIN_HEADERS, keychainReply, type KeychainAsk, type KeychainDoor, type KeychainGrantSeen, type KeychainTokenAsk } from './keychain.ts';
export { keysReply, purposeOf, sealedUnderOf, serveKeys, servesKeys, type KeysAsk, type KeysDoor, type SealedUnder } from './keys.ts';
/* THE SHAPE DOOR, for the keychain door's reason: both hosts take the whole surface from this one module. */
export { SHAPE_HEADERS, serveShape, servesShape, type ShapeDoor } from './shape.ts';
/* `POST /api/slash/read` IS A DOOR AND NOT A ROW IN `ROUTES`, and `slash-ask.ts` carries the measurement: `ROUTES` is the
   record's surface, `tools/gates/guards.mjs` looks for every routed name as a method of `packages/record/src/index.ts`, and
   this answer comes out of the engine the HOST built. It is exported from here for the reason the keychain, key, session and
   ingest doors are: both hosts import one module to get the whole surface, and a door one host can find and the other cannot
   is the drift this file's header is about. */
export { serveSlash, servesSlash, slashAskDoor, slashReply, type SlashAskDoor, type SlashAskEngine, type SlashChatInput, type SlashChatTools } from './slash-ask.ts';
/* `slashRecordMeter` IS HERE FOR THE SAME REASON, AND IT WAS ONCE MISSING FROM HERE. `d16d9d35` built the meter
   that holds the record's press and first plan in Slash's ledger and exported it from `slash-ask.ts` alone, which no
   app imports, so both hosts built the record without it and every press stayed unmetered.
   `apps/worker/test/slash-press-metered.test.ts` is the press on the Worker that shows it wired. */
export { slashDayStop, slashRecordMeter, type SlashLedgerDeps, type SlashRecordMeter } from './slash-ask.ts';
/* THE ENGINE'S HEALTH, for the same reason: both hosts build the read and hand it to the record. */
export { engineHealthRead, type EngineFacts, type EngineHealth, type EngineHealthDeps, type EngineHealthFns, type EngineHealthRead, type EngineSaid } from './engine-health.ts';
export { engineProbeOf, probeWireOf, NO_MODEL as ENGINE_PROBE_NO_MODEL, type EngineProbe, type EngineProbeCandidate, type EngineProbeDeps } from './engine-probe.ts';
export { engineLedgerRead, mentionsAttached, type EngineLedger, type EngineLedgerCall, type EngineLedgerDeps } from './engine-ledger.ts';
/* `/in/*` IS NOT IN `ROUTES` AND BELONGS HERE ANYWAY. The table below is the record's methods, every one
   of them behind the auth gate at `/api/<name>`; an arrival is above that gate by design (`33 §4`), takes
   no principal, and answers 202 rather than a `Result`. It is exported from this file for the same reason
   the keychain, key and session doors are: both hosts import one module to get the whole surface, and a door
   one host can find and the other cannot is exactly the drift this file's header is about. */
export { AUTHSERV as MAIL_AUTHSERV, verdict as dkimVerdict, verdictValue, type TxtLookup } from './dkim.ts';
export { EMAIL_LIMIT, FILES_HEADER, messageHeaders, serveIngest, servesIngest, type MailStamp, type IngestArrival, type IngestChannel, type IngestDoor, type IngestFile, type IngestPath, type IngestVerify, type IngestInbound, type IngestTurnedAway } from './ingest.ts';
export { freshNonce, grantAad, grantKey, NONCE_BYTES, openSealed, recordAad, seal, type Bytes, type DerivedKey } from './sealing.ts';
/* `crashed` IS EXPORTED FOR THE OTHER TWO DOORS, the Worker's router and the self-host's outer catch.
   `serveApi` below is the first of three places a crash is answered, and three answers to one crash is the drift this
   file's header is about. */
export { crashed, type CrashLog, type Crashed } from './crash.ts';
/* A SHARED LINK'S DOOR IS NOT A ROW IN `ROUTES` EITHER, for the keychain's reason: its credential is `Authorization: Share
   <token>`, which each host checks before any bearer is read, and it opens `sharedPage` and nothing else. Exported from
   here so both hosts sign and check a link with one function; the owner's methods for links are rows in
   `routes/shares.ts`. */
export {
  deriveShareKey,
  linkOpened,
  NO_SHARE_KEY,
  opensShare,
  readShareToken,
  serveShared,
  servesShared,
  SHARE_INFO,
  SHARE_TOKEN_MOST,
  sharedNone,
  shareOf,
  shareToken,
  withShareLinks,
  type ShareClaim,
  type ShareClosed,
  type ShareContext,
  type SharedDoor,
  type SharedLink,
  type ShareLink,
  type ShareOpened,
  type ShareRow,
  type ShareSigner,
} from './share.ts';
/* A RUNNER'S BEARER IS NOT A ROW IN `ROUTES` EITHER, and its methods are (`routes/agents.ts`): what is shared here
   is how a host turns the bearer into the runner's context, which both hosts ask where a bearer on `/api` is not a
   token's, and the wait a claim may be held for. Exported from here, for the keychain's reason, so neither host can reach
   one without the other. */
export { CLAIM_ASKS_MOST, CLAIM_EVERY_MS, CLAIM_WAIT_MOST_MS, claimIdle, claimWaitMs, holdClaim, runnerContext } from './jobs.ts';
/* THE KEYCHAIN PASSPHRASE'S HOST HALF, for the keychain's reason: both hosts derive the key from a passphrase and wrap the
   record key under it with one function, so a record exported from one opens on the other with the same passphrase.
   Its two methods are rows in `routes/keychain-passphrase.ts`, answered through `withKeychainPassphrase`. */
export {
  openUnderPassphrase,
  PASSPHRASE_ITERATIONS,
  PASSPHRASE_LEAST,
  PASSPHRASE_MOST,
  PASSPHRASE_SALT_BYTES,
  passphraseOf,
  unlockedKey,
  withKeychainPassphrase,
  wrapUnderPassphrase,
  type PassphraseMethods,
  type PassphraseRewrap,
  type PassphraseUnlock,
  type RecordWrapping,
  type RootKeys,
  type KeychainPassphrase,
  type WrappingChange,
} from './passphrase.ts';

/* THE TABLE IS `table.ts`, so the client can take it without this file's doors (see there). */
import { ROUTES } from './table.ts';
export { GROUPS, ROUTES, type ArgType, type Group, type Route } from './table.ts';

/**
 * The two keychain methods that CARRY sealed material are DELIBERATELY NOT HERE.
 *
 * BOTH HOSTS CAN NOW PROVE A SESSION. `withSession` puts `provedAt` on the context from the session
 * row and from nowhere else, so the record's keychain gate refuses every bearer `NEEDS_BROWSER_SESSION`
 * and sends a session older than fifteen minutes back to sign in (`12 §6` rules 2 and 3). That is why
 * `listGrants` and `revokeGrant` are routed: neither carries a byte of a credential in either
 * direction, and `revokeGrant` takes an id and destroys bytes.
 *
 * `openGrant` AND `bindGrant` STILL ARE NOT, and a session is not what they are waiting for. They are
 * the two ends of the sealed shape: `openGrant` answers sealed material a browser cannot open, and
 * `bindGrant` takes sealed material a browser cannot make, because the key store is the host's and the
 * record never sees a plaintext credential (ADR-062). What a screen needs is a host step that seals and
 * opens for a session, and since 2026-09-16 there is one: `/api/keys/put` and `/api/keys/open`, in
 * `keys.ts`, which take a browser session, no bearer of any kind, and an `Origin` this host answers for.
 *
 * THAT IS A SECOND DOOR AND NOT A LOOSENING OF THE FIRST. `/api/vault/deposit` and `/api/vault/open`
 * still take a keychain grant's bearer and still refuse any request carrying an `Origin`, which every page
 * sends (`12 §6` rule 9). The two doors share the host's key step and no credential at all, so neither
 * one is a way round the other.
 */
export const UNROUTED = [
  'openGrant',
  'bindGrant',
  'createRecord',
  'deviceStart',
  'devicePoll',
  /* Whoever calls it with a person puts that person on the record. `/auth/invite` calls it, after a sign-in. */
  'acceptInvite',
  'keychainGrant',
  /* The key doors' record half: `keychain.ts` calls them after `keychainGrant`, with sealed bytes only. */
  'depositGrant',
  'openForGrant',
  /* The shape door's record half: host shape.ts hands it the bearer, and it reads the grant before a row. */
  'shapeGrant',
  'shapeExport',
  /* `operationGrant`, `signingKey`, `restored` AND `mintChild` ARE INTERNAL TOO AND ARE NOT LISTED YET. `router-groups.mjs`
     refuses a name here that `30 §5`'s INTERNAL row does not carry, and that row has not been amended for them. None of
     the four is in `ROUTES`, and `packages/record/test/file-doors.test.ts` fails if one is added. */
] as const;

const BY_NAME = new Map(ROUTES.map((r) => [r.name, r]));

/* A NAME ROUTED TWICE IS ONE ROW HIDING ANOTHER. `BY_NAME` keeps the later row, so with the table in two places now a row
   under `routes/` reusing a name here would publish one group and verb and serve another. Thrown at load, as the
   `UNROUTED` check below is, so neither host starts with it. */
if (BY_NAME.size !== ROUTES.length) {
  const twice = ROUTES.find((r, i) => ROUTES.findIndex((s) => s.name === r.name) !== i)?.name;
  throw new TypeError(`${twice} is in ROUTES twice. Each method is routed once, in this file or under routes/.`);
}

/**
 * The list above is a promise, and this is the thing that keeps it.
 *
 * `UNROUTED` WAS READ BY NOTHING: declared, documented, and enforced by no line in the repository.
 * Adding `openGrant` to `ROUTES` and to the handler map would have passed both of the assertions
 * `handlersFor` makes, and started returning sealed bytes over HTTP to anything holding a token.
 * The comment above it argues exactly why that must not happen; this is the argument in code.
 */
for (const name of UNROUTED)
  if (BY_NAME.has(name))
    throw new TypeError(`${name} is in UNROUTED and in ROUTES. One of the two is wrong, and it is not the keychain.`);

/**
 * The answer's HTTP status, from its SHAPE.
 *
 * `422` FOR ANY REFUSAL AND `409` FOR A CONFLICT, and the distinction is structural rather than a
 * lookup by code (30 §6). This was a table of forty codes, and a table has two failure modes a
 * shape does not: a code nobody remembered to add came back as a 500 (an ordinary "you typed the
 * wrong enum value" arriving as "the server is broken") and a code somebody guessed at got a 409,
 * which tells a client to re-read a row that never moved and retry a write that will be refused
 * again forever.
 *
 * SO ONLY THE EXCEPTIONS ARE ENUMERATED, and each is a different INSTRUCTION to the caller: 401 says
 * the credential is wrong, 403 says it is the wrong kind and retrying will never work, 503 says the
 * build and the schema disagree and a deploy fixes it, 409 says somebody else got there first and a
 * re-read will. Everything else is a value the caller can fix, which is a 422.
 */
const NOT_422: Readonly<Record<string, number>> = {
  UNAUTHORIZED: 401,
  /* A CREDENTIAL PAST ITS BUDGET FOR NOW. Not 422, because nothing about the request is wrong: the same call succeeds
     after `retry_after` seconds, which `serveApi` also sends as `Retry-After`. */
  RATE_LIMITED: 429,
  FORBIDDEN: 403,
  /* A BROWSER SESSION IS NOT A SCOPE PROBLEM. 403 with the envelope, because the sentence is the
     part that tells somebody what to do about it: 30 §6's own row. */
  NEEDS_BROWSER_SESSION: 403,
  /* THE REFINEMENTS OF `FORBIDDEN`, AND THERE WERE THREE. 30 §6 has one code for "a credential
     outside its scope, level or ceiling", and this file answered with which of the three it was,
     because "get a bigger token" and "this belongs to a person and a token is not one" are different
     instructions and a caller that cannot tell them apart retries the one that can never work. They
     are a strict refinement, so they take `FORBIDDEN`'s status.

     THE INSTRUCTION IS RIGHT AND THE REMEDY WAS WRONG, and `PERSON_REQUIRED` has gone because of it.
     `30 §6`'s `FORBIDDEN` row already carries three separate facts (a `slash` principal writing a
     row, a runner posting out of `seq` order, the scope case), each told apart by its SENTENCE. A
     code is what a caller branches on; "ask a person to sign in" is what it acts on, and minting a
     code per remedy grows the vocabulary at the speed of the copywriting (`10 §7`).
     `LEVEL_REQUIRED` is in the registry and stays. `SCOPE_INSUFFICIENT` was the last invention of
     the three and has followed `PERSON_REQUIRED`: `record`'s `allows` answers a token whose scope is
     short with `FORBIDDEN` and the remedy in the sentence, so its row here went with it rather than
     staying on as a status for a code nothing emits. */
  LEVEL_REQUIRED: 403,
  /* A RUN HE STOPPED OR PAUSED: the same call is refused until he resumes it, so retrying is no answer. */
  RUN_STOPPED: 403,
  RUN_PAUSED: 403,
  /* A KEY SET TO ASK FIRST: the owner has been asked, and the same call opens it once he allows the machine. */
  KEY_ASKED: 403,
  SCHEMA_MISMATCH: 503,
  SCHEMA_NEWER: 503,
  /* A RECORD NOBODY MAY ACT ON IS NOT A REFUSAL OF THE CALLER'S INPUT. Every owner suspended is the
     record's problem, at 503, and it answered 422 for as long as its code was outside the registry
     and therefore outside this table: `49 §5.1` step 5.3, and the self-host's `NOBODY`. */
  RECORD_UNAVAILABLE: 503,
  /* The router's own four, which no method returns: `30 §6`'s host and client family, except
     `INTERNAL`, which is a crash rather than a refusal and is discussed at the catch below. */
  ROUTE_UNKNOWN: 404,
  BODY_MALFORMED: 400,
  /* 501 FOR "PUBLISHED, NOT BUILT". A metric declaring `median`, a block naming a computed source,
     an `infer.prose` job on a host that wired no sender: the declaration is right and this build is
     behind, which is what 501 means and what 422 would deny. It was `UNIMPLEMENTED`, a code in no
     registry; `30 §6` now has `NOT_IN_THIS_BUILD` beside `FORMAT_NEWER_THAN_READER`, which is the
     same sentence about a version number. */
  NOT_IN_THIS_BUILD: 501,
  INTERNAL: 500,
};

/**
 * One code's exception, or 422 because there is not one.
 *
 * `Object.hasOwn`, BECAUSE `Refusal.code` IS A `string`. This read `NOT_422[code]` off a bare
 * object literal, so a refusal whose code was an inherited name returned a FUNCTION where a number
 * is declared, and `?? 422` never fired because a function is not nullish: `constructor` gave
 * `Object`, `toString` gave `Object.prototype.toString`. `serveApi` then handed that to `new
 * Response` and got a `RangeError`, thrown from the line after the try whose own comment promises
 * nothing throws across this boundary. Nothing lets a caller choose a code today, so it was latent
 * rather than live, and `packages/record/src/index.ts:358` had already made exactly this repair one
 * layer in for exactly this reason: *"`Object.hasOwn`, BECAUSE THE KEY COMES FROM THE CALLER."*
 * The field is typed `string` until `packages/ports`'s refusal-code budget reaches zero, so this
 * stays true for as long as that does.
 */
const exception = (code: string): number => (Object.hasOwn(NOT_422, code) ? (NOT_422[code] ?? 422) : 422);

export const httpStatus = (r: Result<unknown>): number =>
  r.ok ? 200 : conflicted(r) ? 409 : refused(r) ? exception(r.refusal.code) : 500;

/**
 * A ROUTE WHOSE ONE ASK IS A THING BY NAME answers 404 when that thing is not there, with the same body. `/p/<a slug
 * nobody declared>` asked `page` and got a 422, which every browser logs in red as a broken call; a page that does not
 * exist is not found. Only `page`'s `PAGE_UNKNOWN`: elsewhere that code is a value to fix (a look laid over no page, a
 * link opened onto none) and keeps its 422. The client reads the code, never the status, so both say "missing".
 *
 * AND `metric`'s `METRIC_UNKNOWN` FOR THE FIGURE ASKED FOR (polish-l, PL2), the refusal `at: 'metric'`, which is also
 * what a figure over a list the caller cannot read answers, so the two stay one answer. A figure that is there but walks
 * from one that is not (`at: 'opening'`, `at: 'value'`) is a declaration to fix, and keeps its 422.
 */
const NOT_THERE: Readonly<Record<string, { code: string; at?: string }>> = {
  page: { code: 'PAGE_UNKNOWN' },
  metric: { code: 'METRIC_UNKNOWN', at: 'metric' },
};

/** `httpStatus`, with a route's own not-found (`NOT_THERE`) at 404. */
export const routeStatus = (name: string, r: Result<unknown>): number => {
  if (r.ok || !refused(r) || !Object.hasOwn(NOT_THERE, name)) return httpStatus(r);
  const there = NOT_THERE[name]!;
  return there.code === r.refusal.code && (there.at === undefined || there.at === r.refusal.at) ? 404 : httpStatus(r);
};

export type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Result<unknown>>;

/**
 * Where a handler table built by `handlersFor` says a door's firewall took a hidden field off an answer: the record's
 * `firewalled`, which raises fault `lens.firewall` naming the method. Kept beside the table and not in it, since every
 * key of the table is a route.
 */
const FIREWALLED = new WeakMap<Record<string, Handler>, (method: string, stripped: readonly string[]) => void>();

/**
 * The handlers, built once from the record's surface.
 *
 * THE WIRING IS SHARED, not just the table. A test could assert that two hosts wire the same routes;
 * this makes it impossible for them not to: the Worker and the self-host both call this, so a route
 * cannot exist in one and not the other, and "the product behaves differently depending on where you
 * run it" stops being a thing anybody has to remember.
 *
 * It takes the surface structurally rather than importing `@braindog/record`, so `host` stays under
 * `record` in the package graph (`31-STACK` §2) and the acyclicity argument still holds.
 */
export type RecordSurface = {
  /** Fault `lens.firewall`, raised when a door's firewall took a hidden field off a method's answer (`serveApi`, `serveMcp`). */
  firewalled?(method: string, stripped: readonly string[]): void;
  boot(ctx: never): Promise<Result<unknown>>;
  version(ctx: never, args?: never): Promise<Result<unknown>>;
  schema(args: never, ctx: never): Promise<Result<unknown>>;
  get(args: never, ctx: never): Promise<Result<unknown>>;
  list(args: never, ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `scriptTry` is: a host built over a record without the method answers `NOT_IN_THIS_BUILD`. */
  countBy?(args: never, ctx: never): Promise<Result<unknown>>;
  history(args: never, ctx: never): Promise<Result<unknown>>;
  backlinks(args: never, ctx: never): Promise<Result<unknown>>;
  whatsNew(args: never, ctx: never): Promise<Result<unknown>>;
  recentHistory(args: never, ctx: never): Promise<Result<unknown>>;
  inbox(args: never, ctx: never): Promise<Result<unknown>>;
  search(args: never, ctx: never): Promise<Result<unknown>>;
  pages(ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `scriptTry` is, for the same reason: the routes land before the record registers the methods. */
  pagesCensus?(args: never, ctx: never): Promise<Result<unknown>>;
  checkPaths?(args: never, ctx: never): Promise<Result<unknown>>;
  page(args: never, ctx: never): Promise<Result<unknown>>;
  metric(args: never, ctx: never): Promise<Result<unknown>>;
  figures(ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `scriptTry` is: the agent door's list of resources in one read. */
  offered?(ctx: never): Promise<Result<unknown>>;
  listGrants(ctx: never): Promise<Result<unknown>>;
  revokeGrant(args: never, ctx: never): Promise<Result<unknown>>;
  dryRun(args: never, ctx: never): Promise<Result<unknown>>;
  /**
   * OPTIONAL, as `pagesCensus` and `checkPaths` are. The route lands before the record's method does, and a required member here
   * would stop both hosts compiling until it did; `handlersFor` answers `NOT_IN_THIS_BUILD` meanwhile, which is the
   * truth, where calling a method that is not there would be a 500.
   */
  scriptTry?(args: never, ctx: never): Promise<Result<unknown>>;
  previewPage(args: never, ctx: never): Promise<Result<unknown>>;
  whoami(ctx: never): Promise<Result<unknown>>;
  digestToday(args: never, ctx: never): Promise<Result<unknown>>;
  markRead(args: { upTo?: number | string } | undefined, ctx: never): Promise<Result<unknown>>;
  setPref(args: never, ctx: never): Promise<Result<unknown>>;
  subscribePush(args: never, ctx: never): Promise<Result<unknown>>;
  unsubscribePush(args: never, ctx: never): Promise<Result<unknown>>;
  log(args: never, ctx: never): Promise<Result<unknown>>;
  governance(args: never, ctx: never): Promise<Result<unknown>>;
  propose(args: never, ctx: never): Promise<Result<unknown>>;
  decide(args: never, ctx: never): Promise<Result<unknown>>;
  packs(ctx: never): Promise<Result<unknown>>;
  planPack(args: never, ctx: never): Promise<Result<unknown>>;
  planUseCase(args: never, ctx: never): Promise<Result<unknown>>;
  fetchShared(args: never, ctx: never): Promise<Result<unknown>>;
  fetchUseCase(args: never, ctx: never): Promise<Result<unknown>>;
  exportUseCase(args: never, ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `countBy` is: the route lands in the same wave as the record's method, and both hosts compile either way. */
  setup?(args: never, ctx: never): Promise<Result<unknown>>;
  installPack(args: never, ctx: never): Promise<Result<unknown>>;
  uninstallPack(args: never, ctx: never): Promise<Result<unknown>>;
  disablePack(args: never, ctx: never): Promise<Result<unknown>>;
  enablePack(args: never, ctx: never): Promise<Result<unknown>>;
  resumeAction(args: never, ctx: never): Promise<Result<unknown>>;
  resumeScript(args: never, ctx: never): Promise<Result<unknown>>;
  fileArrival(args: never, ctx: never): Promise<Result<unknown>>;
  archiveArrival(args: never, ctx: never): Promise<Result<unknown>>;
  packConfig(args: never, ctx: never): Promise<Result<unknown>>;
  arrangement(args: never, ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `pagesCensus` is: the route lands with the record's method, and an older record answers it is not in this build. */
  pageVersions?(args: never, ctx: never): Promise<Result<unknown>>;
  slash(args: never, ctx: never): Promise<Result<unknown>>;
  slashPropose(args: never, ctx: never): Promise<Result<unknown>>;
  slashDaily(args: never, ctx: never): Promise<Result<unknown>>;
  slashForm(args: never, ctx: never): Promise<Result<unknown>>;
  actions(ctx: never): Promise<Result<unknown>>;
  automations(args: never, ctx: never): Promise<Result<unknown>>;
  scripts(args: never, ctx: never): Promise<Result<unknown>>;
  automationRun(args: never, ctx: never): Promise<Result<unknown>>;
  cancelRun(args: never, ctx: never): Promise<Result<unknown>>;
  setPackConfig(args: never, ctx: never): Promise<Result<unknown>>;
  setDeclaration(args: never, ctx: never): Promise<Result<unknown>>;
  retireDeclaration(args: never, ctx: never): Promise<Result<unknown>>;
  undoLook(args: never, ctx: never): Promise<Result<unknown>>;
  keepLook(args: never, ctx: never): Promise<Result<unknown>>;
  undo(args: never, ctx: never): Promise<Result<unknown>>;
  undoRun(args: never, ctx: never): Promise<Result<unknown>>;
  ruleApply(args: never, ctx: never): Promise<Result<unknown>>;
  examples(args: never, ctx: never): Promise<Result<unknown>>;
  clearExamples(args: never, ctx: never): Promise<Result<unknown>>;
  members(ctx: never): Promise<Result<unknown>>;
  invite(args: never, ctx: never): Promise<Result<unknown>>;
  invitations(ctx: never): Promise<Result<unknown>>;
  revokeInvite(args: never, ctx: never): Promise<Result<unknown>>;
  removeMember(args: never, ctx: never): Promise<Result<unknown>>;
  listTokens(ctx: never): Promise<Result<unknown>>;
  createToken(args: never, ctx: never): Promise<Result<unknown>>;
  revokeToken(args: never, ctx: never): Promise<Result<unknown>>;
  createReportKey(args: never, ctx: never): Promise<Result<unknown>>;
  reportKeys(ctx: never): Promise<Result<unknown>>;
  deviceApprove(args: never, ctx: never): Promise<Result<unknown>>;
  listDevices(ctx: never): Promise<Result<unknown>>;
  revokeDevice(args: never, ctx: never): Promise<Result<unknown>>;
  ingestMint(args: never, ctx: never): Promise<Result<unknown>>;
  doors(ctx: never): Promise<Result<unknown>>;
  export(args: never, ctx: never): Promise<Result<unknown>>;
  import(args: never, ctx: never): Promise<Result<unknown>>;
  snapshot(args: never, ctx: never): Promise<Result<unknown>>;
  snapshots(ctx: never): Promise<Result<unknown>>;
  restore(args: never, ctx: never): Promise<Result<unknown>>;
  erase(args: never, ctx: never): Promise<Result<unknown>>;
  deleteRecord(args: never, ctx: never): Promise<Result<unknown>>;
  create(args: never, ctx: never): Promise<Result<unknown>>;
  report(args: never, ctx: never): Promise<Result<unknown>>;
  update(args: never, ctx: never): Promise<Result<unknown>>;
  makePrivate(args: never, ctx: never): Promise<Result<unknown>>;
  attach(args: never, ctx: never): Promise<Result<unknown>>;
  handoff(args: never, ctx: never): Promise<Result<unknown>>;
  sessionsLive(args: never, ctx: never): Promise<Result<unknown>>;
  context(args: never, ctx: never): Promise<Result<unknown>>;
  meet(args: never, ctx: never): Promise<Result<unknown>>;
  undoOwn(args: never, ctx: never): Promise<Result<unknown>>;
  views(args: never, ctx: never): Promise<Result<unknown>>;
  view(args: never, ctx: never): Promise<Result<unknown>>;
  saveView(args: never, ctx: never): Promise<Result<unknown>>;
  retireView(args: never, ctx: never): Promise<Result<unknown>>;
};

export function handlersFor(api: RecordSurface): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    boot: (_a, ctx) => api.boot(ctx as never),
    version: (a, ctx) => api.version(ctx as never, a as never),
    schema: (a, ctx) => api.schema(a as never, ctx as never),
    get: (a, ctx) => api.get(a as never, ctx as never),
    list: (a, ctx) => api.list(a as never, ctx as never),
    countBy: async (a, ctx) =>
      api.countBy
        ? api.countBy(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot count a list by a field yet, so nothing was read.' } },
    history: (a, ctx) => api.history(a as never, ctx as never),
    backlinks: (a, ctx) => api.backlinks(a as never, ctx as never),
    whatsNew: (a, ctx) => api.whatsNew(a as never, ctx as never),
    recentHistory: (a, ctx) => api.recentHistory(a as never, ctx as never),
    inbox: (a, ctx) => api.inbox(a as never, ctx as never),
    search: (a, ctx) => api.search(a as never, ctx as never),
    pages: (_a, ctx) => api.pages(ctx as never),
    pagesCensus: async (a, ctx) =>
      api.pagesCensus
        ? api.pagesCensus(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot count its pages yet, so nothing was read.' } },
    checkPaths: async (a, ctx) =>
      api.checkPaths
        ? api.checkPaths(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot check a document’s placeholders yet, so nothing was read.' } },
    page: (a, ctx) => api.page(a as never, ctx as never),
    metric: (a, ctx) => api.metric(a as never, ctx as never),
    figures: (_a, ctx) => api.figures(ctx as never),
    offered: (_a, ctx) => api.offered ? api.offered(ctx as never) : Promise.resolve({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot answer offered yet, so nothing was read or written.' } }),
    listGrants: (_a, ctx) => api.listGrants(ctx as never),
    revokeGrant: (a, ctx) => api.revokeGrant(a as never, ctx as never),
    dryRun: (a, ctx) => api.dryRun(a as never, ctx as never),
    scriptTry: async (a, ctx) =>
      api.scriptTry
        ? api.scriptTry(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot try a script yet, so nothing ran. Propose it, and the owner reads the source in Decide.' } },
    previewPage: (a, ctx) => api.previewPage(a as never, ctx as never),
    whoami: (_a, ctx) => api.whoami(ctx as never),
    digestToday: (a, ctx) => api.digestToday(a as never, ctx as never),
    markRead: (a, ctx) => api.markRead(a as { upTo?: number | string } | undefined, ctx as never),
    setPref: (a, ctx) => api.setPref(a as never, ctx as never),
    subscribePush: (a, ctx) => api.subscribePush(a as never, ctx as never),
    unsubscribePush: (a, ctx) => api.unsubscribePush(a as never, ctx as never),
    log: (a, ctx) => api.log(a as never, ctx as never),
    governance: (a, ctx) => api.governance(a as never, ctx as never),
    propose: (a, ctx) => api.propose(a as never, ctx as never),
    decide: (a, ctx) => api.decide(a as never, ctx as never),
    packs: (_a, ctx) => api.packs(ctx as never),
    planPack: (a, ctx) => api.planPack(a as never, ctx as never),
    planUseCase: (a, ctx) => api.planUseCase(a as never, ctx as never),
    fetchShared: (a, ctx) => api.fetchShared(a as never, ctx as never),
    fetchUseCase: (a, ctx) => api.fetchUseCase(a as never, ctx as never),
    exportUseCase: (a, ctx) => api.exportUseCase(a as never, ctx as never),
    /* `at: 'setup'` IS HOW A CLIENT TELLS THIS FROM THE RECORD'S OWN `NOT_IN_THIS_BUILD` (no backups here, no sign-in
       here), which is an answer about the record and no reason to fall back to the old way. */
    setup: async (a, ctx) =>
      api.setup
        ? api.setup(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This host cannot set a BrainDog up in one call yet, so nothing was written.', at: 'setup' } },
    installPack: (a, ctx) => api.installPack(a as never, ctx as never),
    uninstallPack: (a, ctx) => api.uninstallPack(a as never, ctx as never),
    disablePack: (a, ctx) => api.disablePack(a as never, ctx as never),
    enablePack: (a, ctx) => api.enablePack(a as never, ctx as never),
    resumeAction: (a, ctx) => api.resumeAction(a as never, ctx as never),
    resumeScript: (a, ctx) => api.resumeScript(a as never, ctx as never),
    fileArrival: (a, ctx) => api.fileArrival(a as never, ctx as never),
    archiveArrival: (a, ctx) => api.archiveArrival(a as never, ctx as never),
    packConfig: (a, ctx) => api.packConfig(a as never, ctx as never),
    arrangement: (a, ctx) => api.arrangement(a as never, ctx as never),
    pageVersions: async (a, ctx) =>
      api.pageVersions
        ? api.pageVersions(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: "This BrainDog cannot list a page's versions yet, so nothing was read." } },
    slash: (a, ctx) => api.slash(a as never, ctx as never),
    slashPropose: (a, ctx) => api.slashPropose(a as never, ctx as never),
    slashDaily: (a, ctx) => api.slashDaily(a as never, ctx as never),
    slashForm: (a, ctx) => api.slashForm(a as never, ctx as never),
    actions: (_a, ctx) => api.actions(ctx as never),
    automations: (a, ctx) => api.automations(a as never, ctx as never),
    scripts: (a, ctx) => api.scripts(a as never, ctx as never),
    automationRun: (a, ctx) => api.automationRun(a as never, ctx as never),
    cancelRun: (a, ctx) => api.cancelRun(a as never, ctx as never),
    setPackConfig: (a, ctx) => api.setPackConfig(a as never, ctx as never),
    setDeclaration: (a, ctx) => api.setDeclaration(a as never, ctx as never),
    retireDeclaration: (a, ctx) => api.retireDeclaration(a as never, ctx as never),
    undoLook: (a, ctx) => api.undoLook(a as never, ctx as never),
    keepLook: (a, ctx) => api.keepLook(a as never, ctx as never),
    undo: (a, ctx) => api.undo(a as never, ctx as never),
    undoRun: (a, ctx) => api.undoRun(a as never, ctx as never),
    ruleApply: (a, ctx) => api.ruleApply(a as never, ctx as never),
    examples: (a, ctx) => api.examples(a as never, ctx as never),
    clearExamples: (a, ctx) => api.clearExamples(a as never, ctx as never),
    members: (_a, ctx) => api.members(ctx as never),
    invite: (a, ctx) => api.invite(a as never, ctx as never),
    invitations: (_a, ctx) => api.invitations(ctx as never),
    revokeInvite: (a, ctx) => api.revokeInvite(a as never, ctx as never),
    removeMember: (a, ctx) => api.removeMember(a as never, ctx as never),
    listTokens: (_a, ctx) => api.listTokens(ctx as never),
    createToken: (a, ctx) => api.createToken(a as never, ctx as never),
    revokeToken: (a, ctx) => api.revokeToken(a as never, ctx as never),
    createReportKey: (a, ctx) => api.createReportKey(a as never, ctx as never),
    reportKeys: (_a, ctx) => api.reportKeys(ctx as never),
    deviceApprove: (a, ctx) => api.deviceApprove(a as never, ctx as never),
    listDevices: (_a, ctx) => api.listDevices(ctx as never),
    revokeDevice: (a, ctx) => api.revokeDevice(a as never, ctx as never),
    ingestMint: (a, ctx) => api.ingestMint(a as never, ctx as never),
    doors: (_a, ctx) => api.doors(ctx as never),
    export: (a, ctx) => api.export(a as never, ctx as never),
    import: (a, ctx) => api.import(a as never, ctx as never),
    snapshot: (a, ctx) => api.snapshot(a as never, ctx as never),
    snapshots: (_a, ctx) => api.snapshots(ctx as never),
    restore: (a, ctx) => api.restore(a as never, ctx as never),
    erase: (a, ctx) => api.erase(a as never, ctx as never),
    deleteRecord: (a, ctx) => api.deleteRecord(a as never, ctx as never),
    create: (a, ctx) => api.create(a as never, ctx as never),
    report: (a, ctx) => api.report(a as never, ctx as never),
    update: (a, ctx) => api.update(a as never, ctx as never),
    makePrivate: (a, ctx) => api.makePrivate(a as never, ctx as never),
    attach: (a, ctx) => api.attach(a as never, ctx as never),
    handoff: (a, ctx) => api.handoff(a as never, ctx as never),
    sessionsLive: (a, ctx) => api.sessionsLive(a as never, ctx as never),
    context: (a, ctx) => api.context(a as never, ctx as never),
    meet: (a, ctx) => api.meet(a as never, ctx as never),
    undoOwn: (a, ctx) => api.undoOwn(a as never, ctx as never),
    views: (a, ctx) => api.views(a as never, ctx as never),
    view: (a, ctx) => api.view(a as never, ctx as never),
    saveView: (a, ctx) => api.saveView(a as never, ctx as never),
    retireView: (a, ctx) => api.retireView(a as never, ctx as never),
  };
  /* THE ROWS UNDER `routes/` ARE WIRED BY THEIR NAMES, since each names a record method of the same name
     (`routes/index.ts`), so a unit adding one writes no line here. The surface is structural, so the method is looked up
     when it is called; a record that has not got it answers `NOT_IN_THIS_BUILD`, as `scriptTry` does above, rather than a
     500 from calling a function that is not there. The name comes from the table, never from a caller. */
  for (const route of EXTRA_ROUTES)
    handlers[route.name] ??= async (a, ctx) => {
      const method = (api as unknown as Record<string, unknown>)[route.name];
      return typeof method === 'function'
        ? (method as Handler).call(api, a, ctx)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: `This BrainDog cannot answer ${route.name} yet, so nothing was read or written.` } };
    };
  /* The table and the wiring, checked against each other where they are both in scope, so adding a
     route to one without the other throws at start rather than 404ing in production. */
  for (const route of ROUTES)
    if (!handlers[route.name]) throw new TypeError(`${route.name} is in the route table and has no handler`);
  for (const name of Object.keys(handlers))
    if (!BY_NAME.has(name)) throw new TypeError(`${name} has a handler and is not in the route table`);
  FIREWALLED.set(handlers, (method, stripped) => api.firewalled?.(method, stripped));
  return handlers;
}

/** The person a call is seeing the record as (`CallContext.preview`, set only by a host's See as), or `null`. */
export const previewOf = (ctx: unknown): string | null => {
  const as = typeof ctx === 'object' && ctx !== null ? (ctx as { preview?: unknown }).preview : undefined;
  return typeof as === 'string' && as !== '' ? as : null;
};

/** The one answer to a change asked while seeing as somebody. */
export const PREVIEW_READ_ONLY: Refusal = { code: 'FORBIDDEN', fix: "You're seeing this BrainDog as somebody else. Exit See as to change things.", at: 'preview' };

/**
 * Answer one request against a set of handlers.
 *
 * ONE SHAPE FOR EVERY ANSWER (`{ ok, value }` or `{ ok, refusal }`) because a client that has to
 * branch on shape per route is a client that gets one of them wrong. The status carries the same
 * information for anything that reads status codes; the body carries the sentence.
 */
export async function serveApi(
  request: Request,
  handlers: Record<string, Handler>,
  ctx: unknown,
): Promise<Response> {
  const url = new URL(request.url);
  /* "SEND TO…" IS CALLED BY PATHS (`/api/send/<id>/reply`), each a method of the table under another name
     (`send-paths.ts`); every other path names its method. */
  const pathed = sendPathOf(request.method, url.pathname);
  const name = pathed?.name ?? url.pathname.replace(/^\/+api\/+/, '').replace(/\/+$/, '');

  const route = BY_NAME.get(name);
  const handler = handlers[name];
  if (!route || !handler)
    return json(404, {
      ok: false,
      refusal: {
        code: 'ROUTE_UNKNOWN',
        fix: `There is no method called ${name || '(nothing)'}.`,
        allowed: ROUTES.map((r) => r.name),
      },
    });

  /* A WRITE IS A POST. Not decoration: a GET that changes something is a change a browser can make
     by prefetching a link, and a proxy may retry it. `ROUTE_UNKNOWN` AT 405, as every other door answers a method it
     does not take: nobody is refused here, the address takes another method, and `Allow` names it. */
  if (route.writes && request.method !== 'POST')
    return json(
      405,
      {
        ok: false,
        refusal: { code: 'ROUTE_UNKNOWN', fix: `${name} changes what this BrainDog holds, so it is a POST.` },
      },
      [['allow', 'POST']],
    );

  /* SEEING AS SOMEBODY IS READ-ONLY, AND THE ROUTER IS THE FIRST LOCK (sharing plan T11): every route that writes is
     refused before its handler runs, and the record's `allows` refuses every need above `read` as the second. A read
     sent as a write changes nothing, so it goes on. */
  if (route.writes && route.postRead !== true && previewOf(ctx) !== null)
    return json(403, { ok: false, refusal: PREVIEW_READ_ONLY });

  /* `Object.create(null)`, FOR THE REASON `packages/record/src/index.ts:358` REACHES FOR
     `Object.hasOwn`: every key here is a word the caller chose. `?__proto__={"limit":1}` set the
     prototype of this object rather than an own key, so `args.limit` was 1 and `Object.keys(args)`
     did not say so. Nothing escaped that far, because `Object.prototype` was untouched and the
     caller could have sent `limit` directly, but an argument bag with no inherited names is one
     fewer thing every reader of it has to know. */
  let args: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (request.method === 'POST') {
    /* WEIGHED BEFORE IT IS PARSED, AND BEFORE ANY HANDLER RUNS. This was `request.json()`, which reads to the end
       whatever the end is: on the Cloud the only ceiling was the platform's, and the whole body sat in the record's
       Durable Object before a byte of it was looked at. The method is known by
       now, so the ceiling is chosen per method here, in one place, for both hosts. */
    const cap = name === 'import' ? IMPORT_BODY_MOST_BYTES : name === 'sealedPut' ? SEALED_BODY_MOST_BYTES : API_BODY_MOST_BYTES;
    const text = await textOf(request, cap);
    if (text === null)
      return json(413, {
        ok: false,
        refusal: { code: 'BODY_MALFORMED', fix: `${name} takes a body of at most ${cap} bytes.`, at: 'body' },
      });
    try {
      const body: unknown = JSON.parse(text);
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) args = body as Record<string, unknown>;
      else throw new TypeError('not an object');
    } catch {
      return json(400, {
        ok: false,
        refusal: { code: 'BODY_MALFORMED', fix: `${name} takes a JSON object as its body.` },
      });
    }
    /* A U+0000 ANYWHERE IN IT IS REFUSED HERE, AT ITS PLACE: the port refuses one at the bind (`guard`), which would
       have been a crash, and the self-host's SQLite cut a text at it before that. Only a body whose text spells one is
       walked. */
    const nul = text.includes('\\u0000') ? nulAt(args) : null;
    if (nul !== null) return json(400, { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: nulSaid(nul), at: nul } });
    /* A READ MAY ALSO ARRIVE AS A POST, and a JSON body carries its own types rather than earning
       them. So there is nothing to decode and the type is simply the one the table declares: a
       `POST /api/get` with `{"seq":{"a":1}}` was the same 500 as the GET, on the same line of the
       same driver, and reads are the half of the surface either verb may carry. */
    for (const [key, kind] of Object.entries(route.takes ?? {})) {
      if (!Object.hasOwn(args, key)) continue;
      const value = args[key];
      /* AN ABSENT ARGUMENT AND A NULL ONE ARE THE SAME ARGUMENT. `cursor: null` is how a caller
         says "from the beginning", and every optional read argument reads a missing one the same
         way, so refusing `null` here would refuse a sentence the record already understands. */
      if (value === null || value === undefined) continue;
      if (kind === 'text' && typeof value !== 'string') return json(422, { ok: false, refusal: notText(key, value) });
      if (kind === 'integer' && !Number.isSafeInteger(value)) return json(422, { ok: false, refusal: notWhole(key, value) });
    }
  } else {
    /* A READ MAY BE A GET, and its arguments come from the query string, which carries text and
       nothing else. THIS GUESSED. It tried `JSON.parse` on every value and kept the raw text only
       when the parse threw, so `?seq={"a":1}` reached the SQL driver as an object and `?slug=2026`
       stopped being a slug. The table says which arguments are structured, so only those are
       decoded and the rest are the text they were sent as. */
    for (const [key, raw] of url.searchParams) {
      /* A `%00` IN THE QUERY IS THE SAME CHARACTER, and is refused the same way. */
      if (raw.includes('\u0000') || key.includes('\u0000')) return json(400, { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: nulSaid(key), at: key } });
      /* `Object.hasOwn`, BECAUSE THE KEY IS A WORD THE CALLER CHOSE. It is the same lesson
         `httpStatus` learned above and `packages/record/src/index.ts:358` learned before either:
         `?constructor=x` would otherwise read a kind of `Object` off the prototype and coerce
         against it. */
      const kind = route.takes !== undefined && Object.hasOwn(route.takes, key) ? route.takes[key] : undefined;
      /* AN ARGUMENT THE TABLE DOES NOT DECLARE REACHES NO HANDLER, so there is nothing to guess at
         and guessing could only be wrong. It is kept, as text, because dropping it would make a
         mistyped argument name look like an argument that was never sent. */
      if (kind === undefined || kind === 'text') {
        args[key] = raw;
        continue;
      }
      if (kind === 'integer') {
        const text = raw.trim();
        const whole = WHOLE.test(text) ? Number(text) : Number.NaN;
        if (!Number.isSafeInteger(whole)) return json(422, { ok: false, refusal: notWhole(key, raw) });
        args[key] = whole;
        continue;
      }
      try {
        args[key] = JSON.parse(raw);
      } catch {
        return json(422, {
          ok: false,
          refusal: {
            code: 'VALUE_MALFORMED',
            fix: `${name} reads ${key} as JSON, and this one does not parse.`,
            at: key,
          },
        });
      }
    }
  }

  /* THE ID A PATH NAMES IS PUT OVER THE BODY'S, so a body never points a path at another send. */
  if (pathed !== null) Object.assign(args, pathed.args);

  /* NOTHING THROWS ACROSS THIS BOUNDARY, and this is where that promise is kept. A handler that
     throws (an argument nobody coerced, a driver error, a bug) used to escape here, and the caller
     never wrote a response at all: the socket stayed open, the request hung, and on the self-host
     the SERVER then never closed. A crash is a 500 with a sentence, not a connection nobody ends. */
  /**
   * `INTERNAL` IS LEFT STANDING, DELIBERATELY, AND IT IS NOT A REFUSAL.
   *
   * `30 §6`'s whole shape is *a refusal names the field and what was expected*: a crash names
   * neither, and there is nothing a caller can fix. So the registry should not carry it, and it is
   * the one code in this file that stays outside on purpose rather than by neglect: a 500 body has
   * to say something, the envelope has one shape, and the shape has a `code`.
   *
   * THE REASON IT IS NOT RENAMED HERE IS THAT THERE ARE THREE OF IT. This catch, the self-host's
   * outer `catch` and the Worker's own: one fact, one word, three files, and the first paragraph of
   * this module is about exactly the failure of the two hosts drifting apart. Moving two of the
   * three would buy a lower number in one gate and a product that answers differently depending on
   * where a customer runs it, which is the trade this file exists to refuse.
   */
  /**
   * THE STATUS AND THE BODY ARE INSIDE THE TRY TOO, because the two lines after it threw.
   *
   * The promise above was kept for the handler and for nothing that read its answer. Measured by
   * handing `serveApi` three answers a handler can really produce: `ok(1n)` came out
   * as `TypeError: Do not know how to serialize a BigInt` from `json`, a value holding itself as
   * `TypeError: Converting circular structure to JSON` from the same line, and a handler answering
   * `undefined` as `TypeError: Cannot read properties of undefined (reading 'ok')` from
   * `httpStatus`. All three escaped `serveApi` with no `Response` ever built, which is the hung
   * socket this catch was written to end. A bigint is not a far-fetched value either: `Param`, what
   * `@braindog/ports` says a driver may hand back, lists it.
   */
  /**
   * THE REASON GOES TO THE LOG, AND THE CALLER GETS A REFERENCE TO IT.
   *
   * This catch wrote the thrown message into the `fix`, and logged nothing. Measured:
   * a handler throwing `SQLITE_AUTH: not authorized, row alice@example.com` answered
   * that sentence, row and all, to whoever asked, and neither host's log had a line about it. `crashed` logs the reason
   * under a new reference and answers the reference alone; `test/crash.test.ts` holds the probe's sentence.
   */
  /* SEVERAL READS IN ONE REQUEST (`routes/reads.ts`): the record checks who asks and the list, and each read is then
     answered here by its own route, as it would be asked alone. */
  if (name === READS) return readsAnswer(handler, handlers, args, ctx);
  try {
    const out = await handler(args, ctx);
    /* THE FIREWALL: a field hidden from this caller still on a row of the answer is taken off
       here and raised as fault `lens.firewall` naming the method, so a path that forgot to mask is found, never leaked. */
    const held = firewall(ctx, out);
    if (held.stripped.length > 0) FIREWALLED.get(handlers)?.(name, held.stripped);
    return json(routeStatus(name, held.answer), held.answer);
  } catch (e) {
    return json(500, crashed(`/api/${name}`, e));
  }
}

export { FIREWALL_FAULT };

/**
 * One method of the table, called by its name from a door that is not HTTP: the MCP's `act`, which does what the app
 * does. The same table, the same handlers, the same checks a POST to `/api/<name>` gets (the argument kinds, a U+0000,
 * See as being read-only, the firewall, a crash answered with a reference), and the record decides who may, exactly as
 * it does for the app. `reads` is the one route left out: it answers several HTTP envelopes, and a door that calls by
 * name calls each read itself.
 */
export async function callRoute(handlers: Record<string, Handler>, name: string, args: Record<string, unknown>, ctx: unknown): Promise<Result<unknown>> {
  const route = BY_NAME.get(name);
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
  if (!route || !handler || name === READS) return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${name || '(nothing)'}.` } };
  if (route.writes && route.postRead !== true && previewOf(ctx) !== null) return { ok: false, refusal: PREVIEW_READ_ONLY };
  const bag = Object.create(null) as Record<string, unknown>;
  for (const [k, v] of Object.entries(args)) bag[k] = v;
  for (const [key, kind] of Object.entries(route.takes ?? {})) {
    const value = Object.hasOwn(bag, key) ? bag[key] : undefined;
    if (value === null || value === undefined) continue;
    if (kind === 'text' && typeof value !== 'string') return { ok: false, refusal: notText(key, value) };
    if (kind === 'integer' && !Number.isSafeInteger(value)) return { ok: false, refusal: notWhole(key, value) };
  }
  const nul = JSON.stringify(bag).includes('\\u0000') ? nulAt(bag) : null;
  if (nul !== null) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: nulSaid(nul), at: nul } };
  try {
    const out = await handler(bag, ctx);
    const held = firewall(ctx, out);
    if (held.stripped.length > 0) FIREWALLED.get(handlers)?.(name, held.stripped);
    return held.answer;
  } catch (e) {
    return crashed(`act ${name}`, e);
  }
}

/** The route that carries several reads (`routes/reads.ts`). */
const READS = 'reads';

/** One read inside `reads`, as it went out: its status and the envelope it would have been answered alone. */
export type ReadAnswered = { status: number; body: unknown };

/**
 * `reads`: the record's half first (`methods/reads.ts`, the guard and the list's shape), then each read in order through
 * `oneRead`. One after another, because the record's object answers one at a time whichever way they arrive.
 */
async function readsAnswer(handler: Handler, handlers: Record<string, Handler>, args: Record<string, unknown>, ctx: unknown): Promise<Response> {
  let asked: Result<unknown>;
  try {
    asked = await handler(args, ctx);
  } catch (e) {
    return json(500, crashed(`/api/${READS}`, e));
  }
  if (!asked.ok) return json(httpStatus(asked), asked);
  const calls = (asked.value as { calls: { method: string; args: Record<string, unknown> }[] }).calls;
  const answers: ReadAnswered[] = [];
  for (const one of calls) answers.push(await oneRead(one.method, one.args, handlers, ctx));
  return json(200, { ok: true, value: { answers } });
}

/**
 * One read of a `reads` request, answered as `serveApi` answers it alone: a route nobody routes is `ROUTE_UNKNOWN`, a
 * route that writes is refused (a write is never carried inside a read), its arguments are held to the types its row
 * declares as a POST body's are, a throw is a 500 with a reference, and the answer goes through the firewall.
 */
async function oneRead(name: string, args: Record<string, unknown>, handlers: Record<string, Handler>, ctx: unknown): Promise<ReadAnswered> {
  const route = BY_NAME.get(name);
  const handler = handlers[name];
  if (!route || !handler) return { status: 404, body: { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${name}.` } } };
  if ((route.writes && route.postRead !== true) || name === READS)
    return { status: 403, body: { ok: false, refusal: { code: 'FORBIDDEN', fix: `${name} is not a read, so it is sent by itself and never inside reads.`, at: 'calls' } } };
  for (const [key, kind] of Object.entries(route.takes ?? {})) {
    if (!Object.hasOwn(args, key)) continue;
    const value = args[key];
    if (value === null || value === undefined) continue;
    if (kind === 'text' && typeof value !== 'string') return { status: 422, body: { ok: false, refusal: notText(key, value) } };
    if (kind === 'integer' && !Number.isSafeInteger(value)) return { status: 422, body: { ok: false, refusal: notWhole(key, value) } };
  }
  try {
    const out = await handler(args, ctx);
    const held = firewall(ctx, out);
    if (held.stripped.length > 0) FIREWALLED.get(handlers)?.(name, held.stripped);
    return { status: routeStatus(name, held.answer), body: held.answer };
  } catch (e) {
    return { status: 500, body: crashed(`/api/${name}`, e) };
  }
}

/**
 * The most an `/api` body may weigh, for every method but `import`: a mebibyte.
 *
 * `51-SPEC-WORKER` HAS SAID 1 MB FOR THE API SINCE IT WAS WRITTEN, and `/mcp` holds exactly this number for the same
 * surface reached another way (`packages/mcp/src/http.ts`, `MAX_BODY_BYTES`). A method's arguments are a row, a query
 * or a declaration, and before this ceiling the Cloud read any body to the end, up to the platform's own limit, before
 * finding out.
 */
export const API_BODY_MOST_BYTES = 1_048_576;

/**
 * The most an `import` body may weigh: sixteen mebibytes, about 147,000 rows.
 *
 * `import` IS THE ONE METHOD WHOSE BODY IS A WHOLE FILE, `{ lines, replace }`, and a flat megabyte would have broken
 * it: a real copy measured 94 rows in 8,941 bytes, 95 bytes a row, so 1 MiB is about
 * 11,000 rows, and his own record is larger than that.
 *
 * THE NUMBER IS SET BY THE DURABLE OBJECT, NOT BY A GUESS AT RECORD SIZES. On the Cloud this runs inside the record's
 * object, which has 128 MB (`docs/01-ARCHITECTURE.md`). Measured in Node 24: a body is held three times
 * over at the peak of reading it, its bytes, the text they decode to, and the parsed lines, each about the body's
 * size (a 16 MiB body added 15.8 MiB decoding and 16.5 MiB parsing); the lines alone, about one body's worth, are what
 * the handler keeps. The kernel's import then buffers the whole file again, and `41-SPEC-KERNEL` §10 puts its own
 * ceiling near 50 MB of `.brainl` in the same 128 MB. So 32 MiB would peak at 96 MiB here before the kernel started,
 * and 16 MiB peaks at 48 MiB and leaves the kernel room for its part. A `.brainl` sent as `lines` weighs 1.20 times
 * the file (measured on 6,108 exported lines: 1,277,928 bytes as a file, 1,533,256 as the body), so sixteen mebibytes
 * of body is about 13.3 MiB of file, which at 95 bytes a row is about 147,000 rows.
 *
 * WHAT IT COSTS, ON EACH HOST. On the Cloud, nothing that worked: by the same arithmetic a body past about 40 MiB
 * already held more than the object has before the kernel began, and the kernel's own ceiling was reached soon after.
 * On the self-host, `BODY_MOST_BYTES` in `apps/selfhost/src/server.ts` is 100 MiB, weighed at the socket before this,
 * so an import between 16 and 100 MiB that a Node process with room could have taken is 413 here now. Both hosts
 * answer it alike, which is this file's first rule, and a self-host record past this size is still put back whole by
 * `braindog init <slug> --from <file.brainl>` (`apps/selfhost/src/main.ts`), which opens the file itself and never
 * comes through this door. The number rises when the kernel's two-pass streaming import (`41 §10`) is built.
 */
export const IMPORT_BODY_MOST_BYTES = 16 * 1_048_576;

/**
 * The most a `sealedPut` body may weigh: six mebibytes, the one other method past `API_BODY_MOST_BYTES`.
 *
 * A PART OF A SEALED FILE IS FOUR MEBIBYTES BEFORE BASE64 (`SEALED_PART_MOST` in `@braindog/record`), which is 5,592,408
 * characters after it, and the body around it is a key of at most 200 characters, a hash and three numbers. Six mebibytes
 * is that with room, and no more: the body is held as bytes, as text and as the parsed part at once, so about four times
 * this at the peak, well inside the Durable Object's 128 MB. The Worker's net under every POST holds the same number
 * (`BODY_MOST.sealed` in `abuse.ts`).
 */
export const SEALED_BODY_MOST_BYTES = 6 * 1_048_576;

/**
 * A POST's body as text, or `null` when it weighs more than `cap`.
 *
 * COUNTED AS IT ARRIVES, AS `packages/mcp/src/http.ts`'s `bytesOf` COUNTS IT, because `Content-Length` is a claim and a
 * chunked body makes none. The claim is checked first so a sender announcing ten megabytes is refused before one is
 * read; the count is the check that holds, and reading stops at the first piece over, so the rest is never held.
 *
 * CANCELLED, NOT LEFT UNREAD: a body nobody reads and nobody cancels holds its socket until a timer ends it.
 *
 * DECODED THE WAY `request.json()` DECODED IT, UTF-8 with a leading byte-order mark dropped and a bad sequence replaced
 * rather than refused, so a body that parsed before still parses. The bytes are not returned, so they can be collected
 * while the text is parsed; the peak `IMPORT_BODY_MOST_BYTES` is argued from is this function's.
 */
async function textOf(request: Request, cap: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > cap) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  parts.length = 0;
  return new TextDecoder().decode(bytes);
}

/**
 * A whole number and nothing else: no exponent, no decimal point, no leading `+`.
 *
 * `Number('1.5')` IS A NUMBER AND `Number('')` IS ZERO, which is why the test is the text rather
 * than the parse. `GET /api/search?q=x&limit=1.5` was a 500 saying "datatype mismatch" from inside
 * SQLite, and an empty `?limit=` would have been a silent nothing.
 */
const WHOLE = /^-?\d+$/;

/* The two sentences the table's three kinds can refuse with. `VALUE_MALFORMED` is `30 §6`'s own row
   for a value the caller can see and fix, and it is already in the registry, so nothing here grows
   the vocabulary: a code invented at a boundary is a code no client can look up. */
const notWhole = (key: string, seen: unknown): Refusal => ({
  code: 'VALUE_MALFORMED',
  fix: `${key} is a whole number, and this one is ${JSON.stringify(seen) ?? String(seen)}.`,
  at: key,
});

const notText = (key: string, seen: unknown): Refusal => ({
  code: 'VALUE_MALFORMED',
  fix: `${key} is a piece of text, and this one is ${JSON.stringify(seen) ?? String(seen)}.`,
  at: key,
});

const json = (
  status: number,
  body: { ok: boolean; value?: unknown; refusal?: Refusal; conflict?: Conflict },
  extra: readonly (readonly [string, string])[] = [],
): Response => {
  const wait = body.refusal?.retry_after;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(extra),
      'content-type': 'application/json; charset=utf-8',
      /* A record is never a shared cache's business: one customer's answer must never be another's. */
      'cache-control': 'no-store',
      /* A 429 SAYS WHEN, in the header a client already reads, as well as in the envelope. */
      ...(status === 429 && typeof wait === 'number' && Number.isSafeInteger(wait) && wait > 0 ? { 'retry-after': String(wait) } : {}),
    },
  });
};
