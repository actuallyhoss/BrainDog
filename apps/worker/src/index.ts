/**
 * The Worker, and the Durable Object a record lives in.
 *
 * NAMING IS PROVISIONING. `01-ARCHITECTURE` §2's whole argument in one line:
 * `env.RECORD.idFromName(slug)` and the object exists. There is no control-plane call to make, no
 * id to store, no half-created tenant to clean up after a signup that failed at the wrong moment —
 * which is what a database per customer costs, and it costs it at the worst time.
 *
 * ONE OBJECT PER CUSTOMER, and the two properties that follow are the reason the whole design
 * hangs off it. Writes are serialised by construction, because an object is single-threaded — so
 * the kernel's `transactionSync` is genuinely atomic rather than optimistically so. And the numbers
 * a person says out loud stay small: in a shared database the second customer's first task is
 * #4,732.
 *
 * THE WORKER ITSELF IS A ROUTER AND NOTHING ELSE. It resolves a slug to an object and forwards. It
 * holds no record logic, because a check in the router is a check the CLI can be pointed around
 * (`30-BLUEPRINT` §10) — and every route it serves comes from `handlersFor`, shared with the
 * self-host, so the two cannot drift.
 */

import { DurableObject } from 'cloudflare:workers';

import { callRoute, ROUTES, engineHealthRead, engineLedgerRead, engineProbeOf, probeWireOf, handlersFor, mentionsAttached, hintsOf, httpStatus, serveApi, serveSlash, servesSlash, withSession, type EngineHealthRead, type SessionHints, type SlashAskDoor, type KeychainGrantSeen } from '@braindog/host';
import { deriveSessionKey, relyingParty, serveAccount, serveAuth, type DeviceDoor, type EmailDoor, type InviteDoor, type Provisioned } from '@braindog/host/auth';
/* SIGN-UP: its three routes are answered in `signIn()` before `serveAuth`. */
import { accessHeaders, clearCookie, cookieMode, mirrorEverywhere, readSid, renameAsked, renamedName, sameKey, sameOrigin, sessionCookie } from '@braindog/host/auth';
import type { AccountCall, SignupCall } from '@braindog/ports';
/* GOOGLE: its two routes are answered in `signIn()` before `serveAuth`, as sign-up's are. */
import { GOOGLE_ROUTES, googleOn, serveGoogle } from './google.ts';
import { DESKTOP_ROUTES, serveDesktop } from './desktop-signin.ts';
import { appleAssociation } from './apple.ts';
/* CLOSING AN ACCOUNT: the door is the host package's, and `account()` hands it this Worker's halves. */
import { CLOSE_RECORDS_MOST, closeDoor } from '@braindog/host/auth';
import type { AccountClosed } from '@braindog/ports';
import { gate, serveMcp as answerMcp, unauthorized as unknownAgent } from '@braindog/mcp/http';
import { withCalls } from '@braindog/mcp';
/* The oldest command this door still works with, one day for both hosts, answered at the build address. */
import { MIN_CLI } from '@braindog/mcp/build';
import { slashTools } from '@braindog/mcp/slash-tools';
import { INVITE_GONE, mayPropose, placeholderName as recordPlaceholder, ulids, type Arrival, type Arrived, type CreateRecordArgs, type DeviceCode, type Exchanged, type LeasedSeal, type OperationGrant, type OutboxRow, type KeychainGrant, type Waiting } from '@braindog/kernel';
import { createRecordApi, tickBudget, type CallContext, type Deposited, type IngestVerification, type Limited, type OpenedForGrant, type RecordApi, type SealTarget, type Sealed } from '@braindog/record';
import { fixOf, ok, refused } from '@braindog/ports';
import type { Auth, AuthCall, AuthResult, Param, Refusal, Result, Row, Scheduler, Snapshots, Sql, Who } from '@braindog/ports';

import { teamsOn } from '@braindog/record/plans';
import { TEAMS_HELD_SAID, FREE_JOIN_REFUSED, FREE_ONE_PERSON, createDirectory, leavesAsked, leftBy, switcherAsk, type AccountUsage, type Directory as Dir, type RunUsage, type SessionAsk, type SwitcherAsk, type SwitcherRow } from '@braindog/record/directory';
import type { ApplyAnswers, ApplyCall, InviteAnswers, InviteCall, SeenAnswers, SeenCall, SignupNeeds, SignupStart } from '@braindog/record/directory';
import type { BillingAnswers, BillingCall } from '@braindog/record/directory';
import type { MeterTally, Person, SlashDay, SlashTally, UsageNotice } from '@braindog/record/directory';
import type { Plan } from '@braindog/record/directory';
import type { DrillCall, HostDrill } from '@braindog/record/directory';
import { answerOAuth, type OAuthAnswers, type OAuthCall } from '@braindog/record/oauth';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';

import { ALARM_RUNS, IN_FLIGHT, actionExecutor, holding, holdingPaged, invocation, keyOpener, meterPass, pass, sharedReader, type Admissions, type Ledger, type OpenKey } from './actions.ts';
import { deliveryRun, holdAutomations, noticePass, replayUsage, runsHold, type Replayed } from '@braindog/host/actions';
import { arrivalRun } from '@braindog/host/actions';
import { runScript, ScriptRuns, type ScriptCall, type ScriptExports, type ScriptReply } from './script.ts';
import { grantNamed, holdingScript, readOnlyExecute, scriptProposals, scriptReads } from '@braindog/host/script';
import { askerOf, scriptTrial } from '@braindog/host/script-try';
import { serveFirstRead } from '@braindog/host/first-read';
import { pagedRunner } from '@braindog/host/connector';
import { drawnFrame, isDrawnFrame } from '@braindog/host/drawn-frame';
import { serveAsks, type ModelJobInference, type SlashAnswer } from '@braindog/host/slash-answers';
import { backgroundMeter, serveModelJobs, type ModelJobMeter } from '@braindog/host/model-jobs';

import { alarmScheduler } from './alarm.ts';
import { fileModelSign } from '@braindog/host/sign-model';
import { slashDue, slashLook, workerSlashAnswers, workerSlashDoor, workerSlashModel, type ModelFail } from './slash.ts';
import { PLAN_AGENTS, planAgents, slashErasing, slashPlanMoved } from './slash.ts';
import { fallbackWire, includedCandidates, includedInference } from './slash.ts';
import { slashReplay, workerSlashMeter } from './slash-meter.ts';
import { workerMeaning, workerModelJobs } from './slash-jobs.ts';
import { workerCatalogueOffers, workerCatalogueShelf } from './catalogue.ts';
import { kennelRequired, kennelVitals, serveKennel, servesKennel, writeCounts } from './kennel.ts';
import { recordScratch } from './kennel-scratch.ts';
/* MAIL ON THE CLOUD: Email Routing's messages into the same door as a forwarder's post. */
import { fileKeeper, isSupportMail, takeMail } from './email.ts';
import { fileKey, serveFiles, servesFiles } from './files.ts';
import { cloudSnapshots, type Pitr } from './copies.ts';
import { readAsk as readRestorePoint, restorePoint, sayTally, type PointAnswer } from './restore-point.ts';
import { drillAnswer, drillNote, olderDrill, readDrill } from './drill-door.ts';
import { DELETED, destroyRecord, expireFinal } from './destroy.ts';
import { cloudSealed } from './sealed.ts';
import { cloudVisuals, pagesPrefix } from './visuals.ts';
import { directoryCopies } from './directory-copy.ts';
import { CUT_HOLD_MS, CUTS_TO_HOLD, cutAgain, cutsOf, heldUntil, resetSaid, type Cuts } from './alarm-cuts.ts';
import { isHeld, redeliver, serveHeld, sweepHeld, type HeldDeps, type HeldMessage } from './held.ts';
import { isMailKind, isWaitedOn, mailOutcome, opsAlert, sendMail, type MailKind, type MailVars } from './mail.ts';
import { delivers, leasedOpener, leasedTarget, makeDeliver, recordDelivers, type Mail, type PushAddress } from './deliver.ts';
import { fetchPush, pushKeyOf, servesPushKey, vapidKeys } from './vapid.ts';
import { NO_SHARE_KEY, linkOpened, opensShare, serveShared, sharedNone, type SharedDoor } from '@braindog/host';
/* NAMED APART FOR THE LINK'S DOOR, so the front doors' own limiter can import the same two functions under their own
   names without this file binding one name twice. */
import { bindingLimiter as linkLimiter, refusedFor as linkRefused } from '@braindog/host/limits';
import { shareKeyOf, sharesOf } from './share.ts';
import { firstReadDoorOf } from './first-read.ts';
import { consume, pump } from './pump.ts';
import { afterRestore, appPath, pollAsked, recoverRestore, restoredOf, asPage, atRoot, cloudIngest, copyAsked, copyRefusal, CTX_HEADER, ctxOversize, drained, ingestBudget, inward, isRecordId, legacyAnswer, legacyRedirect, legacyRequest, mcpMetadataAt, restoreAsked, servesAccount, servesApi, servesAppleAssociation, servesAuth, servesBuild, servesIn, servesKey, servesMcp, type AppPath, type CloudIngestDeps, type Restored, type Stranded } from './route.ts';
import { HEALTHZ, healthz, type Night } from './health.ts';
import { CODE_NEEDED, SIGNUP_CLOSED, botCheckKeyed, launchState, signupMode } from './launch.ts';
import { NOT_A_PERSON, turnstilePassed, turnstileSiteKey } from './turnstile.ts';
import { cookieDomain, withSignedIn } from './signed-in.ts';
import { isAdminHost, serveAdmin } from './admin.ts';
import { applyDoor, opsApplications, opsInvite, type OpsApplyDeps } from './apply.ts';
import { seenDoor, servesSeen } from './seen.ts';
import { stepDoor, servesStep } from './step.ts';
import { opsFunnel } from './funnel.ts';
import { NO_MINT_SESSION, serveInbound, servesInbound } from './inbound.ts';
import { appEntry, bearerOf, doorOf, withCookie, type BearerDeps } from './session.ts';
import { LAPSED_FIX, lapseDrops } from './lapse.ts';
import type { OutboxKind, ScriptAnswer, Scripted } from '@braindog/kernel';
import { httpFor } from './http.ts';
import { isBound, keyStoreOf, recordKeys, type KekBinding } from './keys.ts';
import { keylessRefusal } from './keyless.ts';
import { ERASE_CHECK_MS, ERASE_ROWS_MOST, fleetFailure, nightlyWalk, reconcileErase, type EraseRow } from './nightly.ts';
import { ladder } from './ladder.ts';
import { rewrapRecord } from './rewrap.ts';
import { workerSigner } from './sign.ts';
import { prefixOf, r2Snapshots, steady, streamDumpOf, type Kept } from './snapshots.ts';
import { serveWorkerKeys, serveWorkerKeychain, servesKeys, servesKeychain, type KeyDeps } from './keychain.ts';
import type { GrantDeps } from './keychain.ts';
import { passphraseRoot } from './keychain.ts';
import { withKeychainPassphrase, type PassphraseUnlock, type KeychainPassphrase } from '@braindog/host';
import type { HeldKeys, RewrapArgs, Rewrapped } from './rewrap.ts';
import { serveOAuth } from './oauth.ts';
import { servesOAuth, servesOAuthMeta } from './route.ts';
import { fetchThroughReset } from './reset-retry.ts';
import { claimIdle, holdClaim, runnerContext } from '@braindog/host';
import { recordOf } from './route.ts';
import { validFromOf } from './cut-off.ts';
import type { ChildArgs, Minted as ChildMinted, Verified } from '@braindog/kernel';
/* THE FRONT DOORS: a crash answered by reference, the limiter, the guard in front of every
   statement, and the JSON lines. */
import { crashed } from '@braindog/host';
import { PREVIEW_READ_ONLY } from '@braindog/host';
import { bindingLimiter, classOf, limitKey, refusedFor, type LimitClass, type LimitDoor, type RateLimitBinding } from '@braindog/host/limits';
import { ABUSE, tooManyLine, type AbuseName } from '@braindog/host/abuse';
import { guardBody } from './body-cap.ts';
import { codeOf, guarded } from '@braindog/ports';
import { KERNEL_MIGRATION, type Ack } from '@braindog/kernel';
import { doorPath, op, outboxFields, type AckedRow } from './oplog.ts';
/* BILLING: the account's four billing doors, and the Stripe client they call through. */
import { billingDoors, endForDeleted, reportExtra, sells, type BillingDeps } from './billing.ts';
import { opsPlan, type OpsPlanDeps } from './ops-plan.ts';
import { stripeOf } from './stripe.ts';
/* TELEMETRY: one Analytics Engine point per request, when `TELEMETRY` is bound. */
import { telemetry } from './telemetry.ts';
import { readSetup } from '@braindog/slash/propose';

/** What a record answers between arming a restore and being reset: the gap between `51 D15`'s two calls. */
const RESTORING: Refusal = { code: 'RECORD_UNAVAILABLE', fix: 'BrainDog is restoring a copy. Try again in a minute.', at: 'record' };
/** What a record answers while its object's queue is full: a moment's wait, never a crash to quote (23 Oct, 80 at once). */
const BUSY: Refusal = { code: 'RECORD_UNAVAILABLE', fix: 'BrainDog is busy for a moment. Try again in a few seconds.', at: 'record', retry_after: 1 };

/** The copies port `Record$` hands its record, which is `copies.ts`'s own and says it `reopens`. */
type CloudPort = ReturnType<typeof cloudSnapshots>;

/**
 * The copies port, built the first time it is used.
 *
 * LAZY BECAUSE THE PORT NAMES THE RECORD AND THE RECORD IS NAMED LATER. `createRecordApi` takes `snapshots` when the
 * object opens, and the record's id is its identity row, which exists only once `createRecord` has run: an object the
 * operator is provisioning opens with none. The prefix every copy lives under is that id (`prefixOf`), so the port is
 * made on the first `take`, `list` or `restore`, by which time there is an id, and kept, because `copies.ts` remembers
 * the `before-restore` copy between the two calls a restore makes.
 */
function lazily(build: () => CloudPort): Snapshots & { readonly reopens: true } {
  let port: CloudPort | undefined;
  const get = (): CloudPort => (port ??= build());
  return {
    reopens: true as const,
    take: (label) => get().take(label),
    list: () => get().list(),
    restore: (id) => get().restore(id),
    prune: (keep) => get().prune(keep),
  };
}

/**
 * The key a copy the port took was written under, found by listing its id.
 *
 * LISTED AND NOT BUILT. `take` answers the copy's id, `final-2026-09-23`, and `destroyRecord` wants the key, because
 * the sweep keeps exactly that key and a record whose id stood in for it would have its final copy refused before
 * anything was deleted (`destroy.ts`, which checks the key against its first listing). Which extension the key has is
 * the seal's to decide (`snapshots.ts`), and asking the bucket keeps that in one place. The dot keeps a second final
 * copy the same day, `final-2026-09-23-2`, out of the listing for the first.
 */
async function keyOf(blobs: R2Bucket, record: string, id: string): Promise<string> {
  const page = await blobs.list({ prefix: `${prefixOf(record)}${id}.` });
  const key = page.objects.map((o) => o.key).find((k) => /\.brainl(?:\.age)?$/u.test(k));
  if (key === undefined) throw new Error(`The final copy ${id} is not in the bucket after it was taken, so nothing was deleted. Run the delete again.`);
  return key;
}

/** Who a restore was asked by, as the record writes it: the person, or the person behind a token. */
const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

/** Why an owner cannot invite anybody here: an invitation is spent by signing in, and sign-in needs its secret. */
const INVITES_OFF = 'Sign-in is off on this host until SESSION_SECRET is set, so an invitation link would lead nowhere.';

/**
 * How many questions to Slash one alarm asks: `serveAsks`'s own default, written here because `#ask` compares against it.
 * A pass that leased this many may have left more behind, and `alarm()` then sets the next alarm for now.
 */
const ASKS_PER_PASS = 5;

/** An address that can already sign in: a person with a passkey, or with a record. */
const KNOWN_ADDRESS = `SELECT 1 AS x FROM dir_person p WHERE lower(p.email) = lower(?)
  AND (EXISTS (SELECT 1 FROM dir_passkey k WHERE k.person = p.id) OR EXISTS (SELECT 1 FROM dir_member m WHERE m.person = p.id))`;

/**
 * Cloudflare's `send_email` binding. `from` is the sender Email Service needs and refuses a message without; sign-in
 * mail sets it from `AUTH_MAIL_FROM`, and the outbox's `notify.email` from `MAIL_FROM`, falling back to the same.
 * `to` is one address or up to fifty, because a digest goes to every owner of the record at once.
 */
type EmailBinding = { send(message: Mail): Promise<void> };

type Env = {
  RECORD: DurableObjectNamespace<Record$>;
  DIRECTORY: DurableObjectNamespace<Directory$>;
  /**
   * The doorbell. Its message is `{ record }` and never a payload — 51 §13 D16. AND A KEPT ARRIVAL'S RING, `{ held, tries }`,
   * which names a sealed object in `BLOBS` and not a payload either (`held.ts`).
   */
  INGRESS: Queue<{ record: string } | HeldMessage>;
  EMAIL?: EmailBinding;
  /**
   * `<date>+<sha>`, overwritten at deploy time by `--var`, declared empty in `wrangler.jsonc`.
   *
   * IT IS DECLARED SO THE FAILURE IS `""`. An undefined binding is a crash at cold start on a
   * deploy that forgot the flag; an empty string is a value `deploy-parity` reads and rejects
   * (`52 §13 #17`), which is a red gate rather than a dead record.
   */
  BRAINDOG_BUILD?: string;
  /** Read by `deploy-parity` and `apps/site`'s claims only: this Worker no longer reads it. Slash is his own key or the included model (`slash.ts`). */
  SLASH_ENDPOINT?: string;
  /** Unread by this Worker for the same reason as `SLASH_ENDPOINT`. */
  SLASH_MODEL?: string;
  /**
   * The Directory's MAC key: a secret, `wrangler secret put SESSION_SECRET --env <environment>`, 32 random
   * bytes or more and a different value per environment. Unset or shorter, and sign-in is off:
   * `/auth/methods` says `not-configured` and every other `/auth` route is 404. Changing it signs everybody out.
   */
  SESSION_SECRET?: string;
  /**
   * The operator's fleet-wide cut-off, a secret: an ISO instant such as 2026-09-25T12:00:00Z before which every agent
   * token and device grant is refused (53 §5.11). Unset is the epoch; unreadable refuses every bearer (`cut-off.ts`).
   */
  TOKENS_VALID_FROM?: string;
  /** The operator's bearer for `/auth/provision` and `/auth/claim/mint`, a secret too. Unset: both are 404. */
  PROVISION_KEY?: string;
  /**
   * `yes` to allow a record to be provisioned on a deployment with no `KEK` bound. Anything else, including
   * unset, and `/auth/provision` refuses while the key store is missing (`keyless.ts` holds the argument).
   *
   * A VAR AND NOT A SECRET, because it is a statement about what this host is for rather than a value anybody
   * could use. It exists for a test host that seals nothing; on a host that ever will, the record it makes is
   * keyless for as long as it exists.
   */
  PROVISION_WITHOUT_KEYS?: string;
  /** `"1"` holds teams: nobody who is not already a member can be invited or join. Self-host leaves it unset. */
  TEAMS_HELD?: string;
  /**
   * The root key agents' keys are wrapped under, `12 §6`: 32 bytes written as 64 hex characters or base64url, put with
   * `wrangler secret put KEK --env <environment>`, or a Secrets Store binding of the same name. A different value per
   * environment. Unset, and the key doors answer `NOT_IN_THIS_BUILD` and provisioning REFUSES rather than making a
   * record that can never be given keys (`keyless.ts`, and `PROVISION_WITHOUT_KEYS` for a host that means it). Set,
   * and every record provisioned from then on is made with its three keys wrapped under it. `keys.ts` is the only
   * reader.
   */
  KEK?: KekBinding;
  /** `on` makes read-only links to a page (`sharesOf` in `share.ts`); unset, or anything else, makes none. Unset in production until the owner says yes. */
  SHARE_LINKS?: string;
  /** The operator's own record id, where the nightly walk writes its summary as one note (`53 §5.1`). Unset or empty, no note. */
  OPS_RECORD?: string;
  /** The sender for sign-in links, on a domain Email Service sends for. Empty, or no `EMAIL`, and there are no links. */
  AUTH_MAIL_FROM?: string;
  /**
   * The sender for notification mail, a digest or an urgent notice, on a domain Email Service sends for.
   *
   * EMPTY OR UNSET FALLS BACK TO `AUTH_MAIL_FROM`, because the one address this deployment already sends from is the
   * one Email Service is known to accept, and a second var nobody set should not be the reason a digest never arrives.
   * Neither set, and each `notify.email` dead-letters with a sentence naming this var rather than going out with no
   * sender, which Email Service refuses as `E_FIELD_MISSING` (`deliver.ts`).
   */
  MAIL_FROM?: string;
  /** Where a reader of any mail may write with a question, named in its footer. Empty, and the footer names none. */
  SUPPORT_ADDRESS?: string;
  /** Where mail to `SUPPORT_ADDRESS` is forwarded; a destination verified in Email Routing. */
  SUPPORT_FORWARD?: string;
  /** Where a `crash`, `refuse`, `model` or `night` line is mailed, at most once a kind in 15 minutes (`opsAlert`). Unset, and none is. */
  OPS_ALERT_TO?: string;
  /** The app's host name: the cookie's origin, the passkeys' relying party, and what a cookie write must come from. */
  PUBLIC_HOST?: string;
  /** `yes` counts the site's visits by day, page and where they came from (`seen.ts`). Unset, and `/api/seen` counts nothing. His to set. */
  COUNT_VISITS?: string;
  /**
   * The passkeys' relying party, when it is a parent of `PUBLIC_HOST` rather than the host itself: `brain.dog` in
   * production and `alpha.brain.dog` in alpha. Unset or empty, and it is `PUBLIC_HOST`. A name `PUBLIC_HOST` is not
   * under switches passkeys off (`relyingParty`), which is a refusal an operator can read and not a broken button.
   */
  RP_ID?: string;
  /** The owner's Apple Developer team, which `/.well-known/apple-app-site-association` names the Mac app under (`apple.ts`). */
  APPLE_TEAM_ID?: string;
  /**
   * The names this Worker answered as before the app moved to `PUBLIC_HOST`, comma-separated: `brain.dog`.
   *
   * A PAGE LOAD ON ONE IS A 308 TO `https://<PUBLIC_HOST><path>`, with any `/app` in front taken off, and `/api/*`,
   * `/mcp` and `/in/*` on it are served where they stand and never redirected (`legacyRedirect` in `route.ts`). Unset
   * or empty, and nothing is a legacy host, which is exactly the Worker before the move.
   */
  LEGACY_HOSTS?: string;
  /** The built web shell, `wrangler.jsonc`'s `assets`, which holds the bundled catalogue Slash reads (`catalogue.ts`). */
  ASSETS?: Fetcher;
  /**
   * Where the nightly copies go: `<record>/snapshots/nightly-<date>.brainl` and `latest.brainl` (`51 §5.12`).
   *
   * OPTIONAL, AND AN ABSENT BINDING IS A LOUD CRON RATHER THAN A QUIET ONE. A deployment without the
   * bucket keeps no copies, which is a fact the operator has to be able to read: `scheduled()` throws
   * one sentence, the cron invocation is marked failed, and nothing pretends a backup happened.
   */
  BLOBS?: R2Bucket;
  /**
   * The age recipient the cloud copy is sealed to (`12 §8`, `53 §5.4`). Named and unusable is a refusal:
   * `snapshots.ts` will not write a plaintext copy for a deployment that believes its copies are sealed.
   */
  AGE_RECIPIENT?: string;
  /**
   * The Worker Loader a person's script runs in (`script.ts`), `worker_loaders` in `wrangler.jsonc`. Workers Paid only.
   *
   * OPTIONAL, AND ABSENT IS A SCRIPT THAT SAYS SO. With no loader the pass hands a `script.run` no runner, and the kernel
   * meters it `dropped` with the sentence that this host has no sandbox, rather than the alarm failing on a binding.
   */
  LOADER?: WorkerLoader;
  /**
   * Web Push's public key, base64url, declared empty in `wrangler.jsonc`: a var because the app hands it to every browser
   * that subscribes. With `VAPID_PRIVATE` it is the switch for `notify.push` (`delivers` in `deliver.ts`), and it is what
   * `GET /api/push/key` answers. Neither is generated by anything in this repository.
   */
  VAPID_PUBLIC?: string;
  /** Web Push's private key, a secret put with `wrangler secret put VAPID_PRIVATE`. Unset, and no push is leased. */
  VAPID_PRIVATE?: string;
  /**
   * The front doors' two budgets, `ratelimits` in `wrangler.jsonc`: 600 reads and 120 writes a minute for one caller,
   * keyed by `limitKey` (the token, the person, or for `/auth/*` the address) and spent by `ROUTES`' `writes`.
   *
   * OPTIONAL, AND AN UNBOUND ONE LIMITS NOTHING (`bindingLimiter`). Production binds both; `alpha` and every test's
   * bundle bind neither, and answer as they did before there was a limit.
   */
  RL_READ?: RateLimitBinding;
  RL_WRITE?: RateLimitBinding;
  /** The version poll's own budget, 240 a minute (`POLL_PER_MINUTE`). Unbound, the poll spends `RL_READ`. */
  RL_POLL?: RateLimitBinding;
  /** The MCP door's own minute for one token, 300 (`MCP_PER_MINUTE`). Unbound, /mcp spends `RL_READ` as it always did. */
  RL_MCP?: RateLimitBinding;
  /**
   * Who may make an account here (`launch.ts`): `open`, `invite` (a new address needs a code from `/account/ops/invite`),
   * and anything else, unset included, is closed. A var in each environment, beside `BILLING`.
   */
  SIGNUP?: string;
  /**
   * Cloudflare Turnstile on the sign-up page: the site key a var the page is handed, the
   * secret a secret `signIn()` checks each answer with. Either unset, and sign-up runs on the Directory's lockouts alone,
   * which are tightened while the secret is unset (`SIGNUP_UNCHECKED`).
   */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** The day's ceiling of sign-up readings by the included model for all strangers (`first-read.ts`), and the operator's yes to them. Unset is off. */
  FIRST_READ_DAILY?: string;
  /**
   * The Google OAuth client sign-in with Google runs as (`google.ts`), both put with `wrangler secret put`. The id is
   * not a secret, and is one here so that it is set beside the half that is. Either unset, and both routes are 404
   * and `/auth/methods` offers no Google.
   */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * The Analytics Engine dataset one point per request goes to (`telemetry.ts`, `51 §5.18`). Drafted and commented in
   * `wrangler.jsonc` until the owner decides, and unbound is no point written; with it bound, a point also needs `SESSION_SECRET`.
   */
  TELEMETRY?: AnalyticsEngineDataset;
};

/** A `Result`'s refusal, for an RPC that hands back only the part a caller acts on. */
const refusalOf = (r: Result<unknown>): Refusal => (refused(r) ? r.refusal : { code: 'RECORD_UNAVAILABLE', fix: fixOf(r) });

/** The `Sql` port over the Durable Object's own SQLite. Storage in the same thread as the code. */
function storageSql(storage: DurableObjectStorage): Sql {
  const sql = storage.sql;
  let depth = 0;
  /**
   * A row with each BLOB as a `Uint8Array`, a view over the `ArrayBuffer` the Durable Object hands back and not a copy.
   *
   * THE ONE PLACE A BLOB CHANGES SHAPE, BECAUSE EVERY READER IN THE KERNEL TESTS FOR A `Uint8Array`, which is what
   * `node:sqlite` returns to the self-host. Without it `encode` in `packages/kernel/src/brainl.ts` wrote each
   * `ArrayBuffer` as `{}`, so every export and every nightly copy this Worker made held the rows and none of the keychain:
   * signed, its manifest hashing the `{}`, and restored into another object as the text `[object Object]` with `ok`.
   * `base64` in `keychain.ts` read `length` off the same buffer and handed a leased connector `""`.
   * THE R2 COPIES MADE BEFORE THIS LINE CARRY NO KEYCHAIN, and `decode`
   * now refuses them at import with `FILE_MALFORMED` at the column, rather than restoring them in silence.
   */
  const bytesIn = (row: Record<string, unknown>): Row => {
    for (const key of Object.keys(row)) {
      const value = row[key];
      if (value instanceof ArrayBuffer) row[key] = new Uint8Array(value);
    }
    return row as Row;
  };
  return {
    exec: (text: string, ...params: Param[]) => void sql.exec(text, ...(params as never[])),
    all: <T = Row>(text: string, ...params: Param[]) => sql.exec(text, ...(params as never[])).toArray().map(bytesIn) as T[],
    one: <T = Row>(text: string, ...params: Param[]) =>
      (sql.exec(text, ...(params as never[])).toArray().map(bytesIn) as T[])[0],
    /**
     * `transactionSync`, and a NESTED call goes to the storage's own `transactionSync` too, because
     * on a Durable Object that IS a savepoint: measured on workerd 1.20260903.1, an inner throw undid
     * only the inner row. The kernel flattens its own nesting before it gets here, so the one caller
     * that nests is `attempt()` in `packages/kernel/src/tx.ts`, which cannot issue a raw SAVEPOINT
     * on this host and needs its refusal to roll back its own writes and nothing else. Answering it
     * with `fn()` kept those writes (`test/kernel-in-do.test.ts`, the delegating case).
     */
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return storage.transactionSync(fn);
      depth++;
      try {
        return storage.transactionSync(fn);
      } finally {
        depth--;
      }
    },
  };
}

/** A statement that opens, ends or names a transaction, as `guard` in `@braindog/ports` reads one. */
const TRANSACTION = /^\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * `storageSql` with `guarded` in front of it (`@braindog/ports`): every statement is held to the Durable Object's
 * measured ceilings before it is sent, and a driver's refusal comes back as a named `SqlError`. Every port this Worker
 * builds over an object's storage is this one, the record's, Slash's and the Directory's alike.
 *
 * BESIDE `storageSql` AND NOT INSIDE IT, because `test/kernel-in-do.test.ts` cuts `storageSql` out of this file as text
 * and runs it on workerd: its text is what that test measures, so it does not change.
 *
 * A TRANSACTION STATEMENT GOES TO THE STORAGE AS IT CAME, AND ONLY THAT. The kernel's `attempt()` (`kernel/src/tx.ts`)
 * asks each port once whether it takes a `SAVEPOINT`, and knows the answer by the Durable Object's own sentence, which
 * names `storage.transaction`. The guard refuses the same statement first, in its own words, which `attempt()` does not
 * know, so every refusal inside an attempt would have become a throw. Sent through, the object refuses it as it always
 * has and `attempt()` moves to `transactionSync`, which is where this host keeps its savepoints.
 */
function guardedSql(storage: DurableObjectStorage): Sql {
  const raw = storageSql(storage);
  const checked = guarded(raw);
  return {
    ...checked,
    exec: (text: string, ...params: Param[]) => (params.length === 0 && TRANSACTION.test(text) ? raw.exec(text) : checked.exec(text, ...params)),
  };
}

/** Where an object keeps the build it last opened as, in its own storage and outside the record (`Record$` `#booted`). */
const BOOTED = 'braindog.booted';
/** Where the record's answers kept beside it go in this object's store (`RecordDeps.kept`). */
const KEPT_PREFIX = 'braindog.kept.';

/**
 * Where an object keeps that its webhook doors are still to be told to the Directory (`#doors`, DR1): set by the first
 * open of a build and by a mint, cleared by the alarm that tells them.
 */
const DOORS_DUE = 'braindog.doors-due';

/** The door that mints a webhook token (`ingestMint`): a mint answered well makes the doors due again (`#doors`). */
const MINT_PATH = /^\/+api\/+ingestMint\/*$/u;

/** Where an object keeps the alarm step it is in, so an alarm cut off by the runtime is named by the next one (`#step`). */
const ALARM_STEP = 'braindog.alarm-step';

/** Where an object keeps how many alarms in a row were cut in one step (`alarm-cuts.ts`). */
const ALARM_CUTS = 'braindog.alarm-cuts';

/**
 * EACH OF THE ALARM'S PAGE-DRAWING STEPS (the look, the lint) GETS ABOUT THIS MUCH OF ONE ALARM, and stops after the page
 * that spends it (`TickBudget`). The pages are the bound that holds here: the object's clock stands still while a page
 * draws, so the milliseconds cut only where a step waited on the network.
 */
const ALARM_STEP_MS = 5_000;
const ALARM_STEP_PAGES = 10;

/** A step slower than this writes an `alarm-step` line with its time. */
const SLOW_STEP_MS = 5_000;

/** Where an object keeps whether its record's billing has lapsed, beside `BOOTED` and outside the record (`setLapsed`). */
const LAPSED = 'braindog.lapsed';

/**
 * The jobs a lapsed record's alarm acks as done and unsent, and the most it acks in one pass (`lapse.ts`'s `lapseDrops`
 * holds the notifications, which the queue's pump leases and not the alarm).
 */
const UNSENT_KINDS: readonly OutboxKind[] = ['pull.fetch', 'infer.embed', 'infer.prose', 'infer.draft', 'infer.ask'];
const UNSENT_MOST = 50;

/**
 * How long a lapsed record holds an automation run that has not started before asking again. The run's own schedule
 * row wakes it then, so a lapse ended a minute ago holds a run for at most this long.
 */
const LAPSE_HOLD_MS = 15 * 60_000;

/** Schema breaks in a row on one model before the operator is mailed (`#modelFailed`). */
const SCHEMA_STREAK = 3;

/** This record's id for a log line, or `null` for a record not yet made, or one whose identity cannot be read. */
const recOf = (api: RecordApi): string | null => {
  try {
    return api.kernel.identity()?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Every ack of this record's outbox writes its `outbox` line (`53 §2.3`, `outboxFields` in `oplog.ts`), which the
 * dead-outbox and connector-paused alerts are queries over.
 *
 * AT THE KERNEL'S OWN DOOR, BECAUSE THE ACKS COME FROM SEVERAL PLACES: the pump's `ack` RPC, a connector's run in `#act`
 * (`pagedRunner`), and Slash's answers in `#ask` (`serveAsks`), and each reads `api.kernel.ackOutbox` when it acks.
 * Wrapped once where the object opens, no pass on this host can ack without its line, and none of those passes changes.
 * No method of `@braindog/record` calls it, so an ack is always a host's.
 *
 * THE ROW IS READ AFTER THE ACK, so the line says where the ladder left it: `done`, `failed` with its count, or `dead`.
 * A LINE THAT CANNOT BE READ IS NOT WRITTEN, and the ack's own answer goes back either way.
 */
function loggingAcks(api: RecordApi, sql: Sql): void {
  const ack = api.kernel.ackOutbox;
  api.kernel.ackOutbox = (args: Ack) => {
    const out = ack(args);
    try {
      const row = sql.one<AckedRow>('SELECT kind, state, attempts, payload FROM outbox WHERE id = ?', args.id);
      if (row !== undefined)
        op(outboxFields(recOf(api), row, out.ok ? { ok: true } : { ok: false, code: codeOf(out) }, args.result), row.state === 'dead' ? 'error' : 'info');
    } catch {
      /* See above: the ack stands without its line. */
    }
    return out;
  };
}

/**
 * The record's `/mcp`, with `_meta.session` checked as the session headers were and put on the context
 * over them, key by key. The headers' hints are already on `ctx`: `inward` put them there.
 */
/* `origin` IS WHERE THIS HOST SERVES THE APP, the start of a filed question's `decide` link: the configured `PUBLIC_HOST` and never the request's own URL. Unset, it is left out, and so is the link. */
/* `build` IS THIS DEPLOY'S BUILD (`BRAINDOG_BUILD`), sent on every answer as `braindog-build` so the bridge sees a deploy mid-session. */
/* `caller` IS THE KEY'S OWN ID, because the bearer is taken off the request before the record's object sees it: without
   it every key on a record read as one caller, and a second machine's first call in a minute went uncounted. */
/* AND THE CALLS `act` MAKES, through the same handlers `/api` serves (`callRoute`), built once for each record's api and
   kept with it by `withCalls`, so the door's state for a caller outlives one request as it did. */
const serveMcp = (request: Request, api: RecordApi, ctx: CallContext, origin?: string, build?: string): Promise<Response> =>
  answerMcp(request, withCalls(api, actCalls(api), () => ROUTES), ctx, {
    session: (c, said) => withSession(c, hintsOf(said)),
    caller: (c) => (c.principal.kind === 'token' ? c.principal.id : undefined),
    ...(origin ? { origin } : {}),
    ...(build ? { build } : {}),
  });

/** One record's calls by name for `act`, over the handler table `/api` serves, built on the first call. */
function actCalls(api: RecordApi): (name: string, args: Record<string, unknown>, ctx: never) => Promise<Result<unknown>> {
  let handlers: ReturnType<typeof handlersFor> | null = null;
  return (name, args, ctx) => callRoute((handlers ??= handlersFor(api)), name, args, ctx);
}

/** Built once a Worker isolate, not once a record: every record on it is offered the same packs and use cases. */
const CATALOGUE = seedCatalogue();

/**
 * THE SCRIPT SANDBOX'S TWO DOORS AND ITS TAIL, EXPORTED FROM THE MAIN MODULE BECAUSE THAT IS WHAT `ctx.exports` IS MADE
 * OF. A class that is only imported here has no loopback binding, and `this.ctx.exports.ScriptOutbound` would be
 * `undefined` at the first run (`script.ts`). Without `ScriptTail` a run is loaded with no tail and reports no CPU time.
 */
export { ScriptOutbound, ScriptRecord, ScriptTail } from './script.ts';

/** One customer's record. The class name is `Record$` because `Record` is a TypeScript builtin. */
export class Record$ extends DurableObject<Env> {
  #api: Promise<RecordApi> | null = null;
  /**
   * Set by `deleteRecord` once the bytes are being deleted, and never cleared: every door this object has answers as a
   * deleted record from then on.
   *
   * AT `deleteAll` AND NOT BEFORE THE FINAL COPY. It was set first, so a delete whose sweep failed, which `destroy.ts`
   * throws before touching the bytes so the owner can ask again, left an object whole and answering DELETED to every
   * door until it was evicted (`test/restore-in-do.test.ts`, the refused sweep).
   */
  #gone = false;

  /**
   * Set when a restore has armed this object to come back at a copy, and never cleared: the object ends at the
   * Worker's `reopen`, and the one that starts is new.
   *
   * WHAT IT STOPS IS A WRITE THE REWIND WOULD TAKE. `onNextSessionRestoreBookmark` restores at the next start, so between
   * the arm and `ctx.abort()` anything written here is thrown away, and a person told "saved" in that gap would be told
   * something false. Every door answers `RESTORING` instead, and the alarm does nothing.
   *
   * SET AT THE ARM, BY `#arming`, AND NOT WHEN `restore` ANSWERS. It was set on the answer, and `copies.ts` puts its
   * receipt to R2 after arming: an input gate stays shut for this object's storage and not for a bucket, so a request
   * can arrive inside that put. Measured: a `setPref` sent from inside it was answered 200
   * (`test/restore-in-do.test.ts`, the receipt being put).
   */
  #armed = false;

  /**
   * How many `/api/restore` requests this object is answering right now, and what the last one that armed it said.
   *
   * TOGETHER THEY TELL A RESTORE STILL RUNNING FROM ONE LEFT BEHIND. Armed with a restore in flight is the gap between
   * the arm and the answer, and the object must stay as it is. Armed with none in flight is an object whose Worker never
   * made `51 D15`'s second call, and before these two fields nothing could tell it apart: measured in
   * `test/restore-armed.test.ts`, it answered every door 500 until an eviction rewound it, and `restore.pitr` was never
   * written. `stranded` answers the next request's Worker with `#left`, which is how the event gets written anyway.
   */
  #restoring = 0;
  #left: Restored | null = null;

  /**
   * This object's two PITR methods for `copies.ts`, with `#armed` set before the bookmark is armed. An arm that throws
   * put nothing in place, so the flag goes back to what it was; a second arm, the undo bookmark a called-off restore
   * sets, leaves it set, because the object is still going back at its next start.
   */
  #arming(): Pitr {
    const storage = this.ctx.storage;
    return {
      getCurrentBookmark: () => storage.getCurrentBookmark(),
      onNextSessionRestoreBookmark: async (bookmark) => {
        const was = this.#armed;
        this.#armed = true;
        try {
          return await storage.onNextSessionRestoreBookmark(bookmark);
        } catch (e) {
          this.#armed = was;
          throw e;
        }
      },
    };
  }

  /** The copies port, or `undefined` on a deployment with no `BLOBS`, where the record says it keeps none. */
  #copies: (Snapshots & { readonly reopens: true }) | undefined;

  /** The record's own deletion, as `#open` hands it to the record, or `null` before the record is opened. */
  #destroy: (() => Promise<{ kept: string; removed: number } | void>) | null = null;

  /**
   * The `Scheduler` port over this object's own alarm. One per customer, and this is the one.
   *
   * AND ITS DOORBELL RINGS THE QUEUE. `wake()` is the one piece of I/O a record performs, and it
   * carries the object's own id and nothing else: a message that copied a notification would be a
   * second copy of something that may have changed by the time it is read. A lost message costs
   * latency and never a notification, because the row is still `pending` and the next wake drains
   * it — the outbox is the source of truth and the queue is a doorbell.
   */
  #alarm: Scheduler = alarmScheduler(this.ctx.storage, () =>
    this.env.INGRESS.send({ record: this.ctx.id.toString() }),
  );

  /**
   * The migration runs under `blockConcurrencyWhile`, which is the platform's word for "no request
   * is answered until this finishes". A record that answers a read while its schema is half applied
   * is a record that returns rows nobody can interpret.
   */
  /** Slash's door, built on the first ask and kept, because the engine it holds writes its own tables. */
  #slash: SlashAskDoor<CallContext> | undefined;

  /**
   * What answers an automation's question to Slash from this object's alarm, or `undefined` where there is no model.
   *
   * SET IN `#open` AND NOT LAZILY, unlike `#slash` above, because the record's `answersSlash` is decided when
   * `createRecordApi` runs and a rule that asks Slash is filed or refused on it. What is lazy is the engine inside
   * (`workerSlashAnswers`).
   */
  #answers: SlashAnswer | undefined;

  /**
   * What answers the record's model jobs from this object's alarm, a pattern's draft and a digest's prose, or `undefined`
   * where there is no model, and the background allowance they are spent from. Set in `#open` beside `#answers`, because
   * the record's `delivers` names `infer.prose` only where this answers it.
   */
  #jobs: ModelJobInference | undefined;
  #jobsMeter: ModelJobMeter | undefined;
  /** This object's Slash storage, where who is who keeps the verdicts it was given and the notes it read (`understand.ts`). */
  #jobsStore: Sql | undefined;
  /**
   * Whether Slash's model answers, read from this object's Slash ledger: the record's `engineHealth` and the
   * door's `GET /api/slash/health` both answer it. Set in `#open` beside `#answers`, from the same `slashModel`.
   */
  #engineHealth: (() => Promise<EngineHealthRead>) | undefined;

  /** The scripts running from this object's alarm, and the rules each is held to (`script.ts`). */
  #scripts = new ScriptRuns();

  /**
   * The record's own switch, set by the account door over RPC: while it is on, the
   * record's alarm runs the drain and nothing else, and the queue's pump sends no digest. The doors cap callers from
   * the Directory's row (`session.ts`), so this is the object's half and not a second answer to who may write.
   *
   * IN THE OBJECT'S OWN STORAGE AND NOT IN MEMORY, because an evicted object forgot a flag held in a field and the next
   * alarm ran every connector of a record nobody was paying for. `undefined` is not read yet.
   */
  #lapsed: boolean | undefined;

  /**
   * The plan the Directory meters this record under, as it last said, or `undefined` before it was asked.
   *
   * IN MEMORY AND NOT IN STORAGE, unlike `#lapsed`, because the Directory is where the plan is kept and an evicted object
   * asks it again (`#planOf`). Billing tells this object when it moves (`planMoved`), so a cached plan is never stale
   * for longer than a failed RPC, and the next wake reads it fresh.
   */
  #plan: string | undefined;

  /**
   * The plan, asked of the Directory once a wake, or `null` where it could not be asked. Not cached when it fails.
   *
   * AND THE PLAN'S COUNT OF AGENTS IS WRITTEN FROM IT (`planAgents`), so a record that missed billing's
   * word, or was made with no `setPlan` at all, holds the cap the pricing page promises from its next wake and not only
   * from its next move. A row that could not be written is the next wake's to write; the plan read still stands.
   */
  async #planOf(api: RecordApi): Promise<string | null> {
    if (this.#plan !== undefined) return this.#plan;
    const record = api.kernel.identity()?.id;
    if (!record) return null;
    let plan: string | null;
    try {
      plan = await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory')).planFor(record);
    } catch {
      return null;
    }
    if (plan === null) return null;
    try {
      planAgents(guardedSql(this.ctx.storage), plan);
    } catch (e) {
      op({ op: 'plan', did: 'agents', ok: false, rec: record, error: e instanceof Error ? e.message : String(e) }, 'error');
      return plan;
    }
    this.#plan = plan;
    return plan;
  }

  /** Whether this object holds the plan's count of agents yet (`PLAN_AGENTS`), which the kernel reads at every mint. */
  #agentsHeld(sql: Sql): boolean {
    if (!sql.one("SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = 'host_meta'")) return false;
    return Boolean(sql.one('SELECT 1 AS hit FROM host_meta WHERE key = ?', PLAN_AGENTS));
  }

  /**
   * This record's plan has moved: billing's free door, a payment, or Stripe saying the subscription changed
   * (`BillingDeps.setPlan` in `account`). Free's Slash asks and its one person follow (`slashPlanMoved`, `#oneOnly`).
   * AN RPC AND NEVER A ROUTE: only billing, after the Directory has taken the plan, says it.
   */
  async planMoved(plan: string): Promise<void> {
    this.#plan = plan;
    await slashPlanMoved(guardedSql(this.ctx.storage), plan);
  }

  /**
   * Free's one person, at the record's own `invite`, which every door reaches it through: the app's call,
   * an agent's tool and the CLI alike. A free record takes an invitation to nobody, and a change to somebody already on
   * it is let through, since that is its owner. The sentence offers the way on, which is Cloud.
   *
   * WRAPPED HERE AND NOT IN THE RECORD, because the record does not know its plan: the Directory does, and this object
   * asks it (`#planOf`) only when somebody is being invited. The Directory refuses the join as well (`joinable`), so a
   * link minted before this check is refused when it is spent.
   */
  #oneOnly(api: RecordApi): void {
    const invite = api.invite.bind(api);
    api.invite = async (args, ctx) => {
      const member = typeof args?.person === 'string' && api.kernel.members().some((m) => m.person_id === args.person);
      if (!member) {
        const stop = await this.#outsiders(api);
        if (stop) return { ok: false as const, refusal: stop };
      }
      return invite(args, ctx);
    };
  }

  /**
   * Whether this record's plan takes somebody not on it yet, asked by `invite` above and by `share` to an outsider (the
   * record's `plus` hook): `null` is yes. THE ONE RULE FOR BOTH, so a person kept out of `invite` is not let in by a
   * share to their address: held while TEAMS_HELD is set (invites wait until sharing ships), off while the host sells
   * nothing, and on Free and Cloud the one-person refusal.
   */
  async #outsiders(api: RecordApi): Promise<Refusal | null> {
    if (this.env.TEAMS_HELD === '1') return { code: 'FORBIDDEN', fix: TEAMS_HELD_SAID, at: 'plan' };
    return teamsStop(this.env, await this.#planOf(api), FREE_ONE_PERSON);
  }

  /** Set or clear this record's lapse: billing's webhook, when a payment moves it into or out of one. */
  async setLapsed(on: boolean): Promise<void> {
    await this.ctx.storage.put(LAPSED, on);
    this.#lapsed = on;
    /* A LAPSE ENDED RESUMES ON THE NEXT ALARM, and this sets one for now, so a record that queued work while it was
       held does not wait for its next write to ring. A lapse begun needs none: the next alarm reads the flag. */
    if (!on && !this.#gone) await this.#alarm.set(Date.now());
  }

  /** Whether this record's billing has lapsed, for the queue's pump (`drainOutbox`). */
  async lapsed(): Promise<boolean> {
    if (this.#lapsed === undefined) {
      try {
        this.#lapsed = (await this.ctx.storage.get(LAPSED)) === true;
      } catch {
        /* A READ THAT FAILED IS NOT A LAPSE, and is asked again next time: a record is never held on a storage fault. */
        return false;
      }
    }
    return this.#lapsed;
  }

  /**
   * One call a running script made, from `ScriptOutbound` or `ScriptRecord`: a fetch, a list or a get.
   *
   * AN RPC INTO THE OBJECT THE RUN STARTED IN, which is still awaiting it in `#act`. The key store, the keychain and the
   * record live here and nowhere the sandbox can reach, and a run id this object did not open answers with a refusal.
   */
  async script(run: string, call: ScriptCall): Promise<ScriptReply> {
    return this.#scripts.answer(run, call);
  }

  #record(): Promise<RecordApi> {
    if (this.#gone) return Promise.reject(new Error(DELETED.fix));
    if (this.#armed) return Promise.reject(new Error(RESTORING.fix));
    /* AND A REJECTED PROMISE IS NOT A CACHED ANSWER. `??=` stored whatever the opener returned,
       including a rejection — so one transient failure at cold start (a queue hiccup in the tail, a
       storage read that timed out) was remembered as this record's permanent state, and every
       request until the object was evicted got the same stale error for a condition that had
       passed. Forgetting a failure is what makes the next request a retry rather than an echo. */
    this.#api ??= this.#open().catch((e: unknown) => {
      this.#api = null;
      throw e;
    });
    return this.#api;
  }

  /** Migrate, then arm. Both before any request is answered, which is what the block is for. */
  async #open(): Promise<RecordApi> {
    let api!: RecordApi;
    /* SLASH'S MODEL: his own key where he chose it in Settings, read from Slash's store on each press, or the
       included model (`slash.ts`). */
    /* A MODEL THAT DID NOT ANSWER IS THE OPERATOR'S, told by every one of the three below: the record's own
       model, its automations' answers and its model jobs. `api` is read when a call fails, by which time it is made. */
    const onFail = (fail: ModelFail) => this.#modelFailed(api, fail);
    const slashModel = workerSlashModel(this.env, () => api, { store: () => sql, onFail });
    const sql = guardedSql(this.ctx.storage);
    /* WHAT ANSWERS AN AUTOMATION'S QUESTION TO SLASH, off the same endpoint and the same key path as `slashModel`, so
       `answersSlash` below and `/api/version`'s `slash` are one fact. The storage is this object's own, the one the door's
       engine is handed, so the two engines count one `ask_cap`. Before this line a Worker with a model said `slash: true`
       and refused `ask_slash` at propose as if it had none (`test/slash-answers.test.ts`). */
    this.#answers = workerSlashAnswers(this.env, () => api, { sql, clock: { now: () => Date.now() }, plan: () => this.#planOf(api), onFail });
    /* AND WHAT ANSWERS ITS MODEL JOBS, over the same storage, so a job's ledger row sits beside every ask's and the
       background allowance is counted out of the one `slash_call` table (`@braindog/host/model-jobs`). */
    this.#jobs = workerModelJobs(this.env, () => api, { sql, clock: { now: () => Date.now() }, onFail });
    this.#jobsMeter = backgroundMeter(sql);
    this.#jobsStore = sql;
    /* THE ENGINE'S HEALTH, FROM ITS OWN LEDGER AND NOT FROM THE SETTINGS: `/api/version`'s `slash` below says a
       model is configured, and this says whether it answers. The same storage the asks, the answers and the jobs settle
       in, so every model call is in what it reads; the package is loaded only where there is a model. */
    const engineHealth = engineHealthRead({
      sql,
      clock: { now: () => Date.now() },
      model: slashModel !== undefined,
      load: () => import('@braindog/slash'),
      grants: () => api.kernel.grants(),
    });
    this.#engineHealth = engineHealth;
    /* AND THE PROBE: one press asks each model of the answer route whether it answers now, through the wires
       the asks already use (the included model, the operator's provider), settling in the same ledger, loaded on the
       press only. Held to his switch for Slash reading, as a background ask is. */
    const engineProbe = engineProbeOf({
      facts: () => includedCandidates(this.env),
      clock: { now: () => Date.now() },
      ledger: async () => {
        const s = await import('@braindog/slash');
        s.openLedger(sql, { now: Date.now() });
        const c = s.ledgerCore(sql, { now: () => Date.now() }, { complete: () => Promise.reject(new Error('unused')), embed: () => Promise.reject(new Error('unused')) });
        return { reserve: c.reserve, account: c.account, release: c.release, last: () => [] };
      },
      complete: probeWireOf((c) => (c.id === 'provider' ? fallbackWire(this.env) : includedInference(this.env))),
      reads: () => api.kernel.prefsOf('slash')['slash.reads'] !== false,
    });
    /* AND WHAT THAT LEDGER HOLDS, for the record's `engineReadings`: the same storage again, so the calls it
       counts are the ones the health above was read from, beside the questions still open, each by its cause. Handed
       whether or not a model is set, since the open questions are the record's own. The mentions are the record's own,
       each attached or not. */
    const engineLedger = engineLedgerRead({
      sql,
      mentions: mentionsAttached(sql),
      questions: () => {
        const open = api.kernel.openSuggestions();
        return open.ok ? open.value : [];
      },
    });
    /* THE RECORD'S COPIES, IN THE BUCKET THE NIGHT WRITES TO (`copies.ts`). Taken, listed and gone back to from inside
       this object, because `onNextSessionRestoreBookmark` is this storage's and nothing outside the object can call it.
       No `BLOBS` and there is no port, so the record answers `NOT_IN_THIS_BUILD` as it always did. */
    const blobs = this.env.BLOBS;
    this.#copies = blobs
      ? lazily(() => {
          const record = api.kernel.identity()?.id;
          if (!record) throw new Error('This BrainDog has not been made yet, so it keeps no copies.');
          return cloudSnapshots(blobs, this.#arming(), (at, bookmark) => streamDumpOf(api, at, bookmark), {
            record,
            now: () => Date.now(),
            recipient: this.env.AGE_RECIPIENT ?? '',
          });
        })
      : undefined;
    const copies = this.#copies;
    await this.ctx.blockConcurrencyWhile(async () => {
      api = await createRecordApi({
        sql,
        clock: { now: () => Date.now() },
        scheduler: this.#alarm,
        /* A FEW ANSWERS BESIDE THE RECORD, IN THIS OBJECT'S OWN STORE AND NEVER IN ITS TABLES (`RecordDeps.kept`), as the
           build it last opened as is (`BOOTED`): Today as it was last drawn, so the first open after a deploy is answered
           at once and drawn again behind it. `deleteAll` takes them with everything else. */
        kept: {
          get: (key) => this.ctx.storage.get(`${KEPT_PREFIX}${key}`),
          put: (key, value) => this.ctx.storage.put(`${KEPT_PREFIX}${key}`, value),
          delete: (key) => this.ctx.storage.delete(`${KEPT_PREFIX}${key}`),
        },
        /**
         * WHAT SIGNS AN EXPORTED `.brain`, AND IT WAS MISSING. Measured before this line existed: a
         * hosted export carried the `dog_sig` header with no row under it, and `checkBrainl` refuses
         * an unsigned file outright, so every file this Worker wrote was one nothing would import.
         * The self-host has passed a signer since `49 §5.22`; the Worker never did.
         */
        sign: workerSigner(sql, () => keyStoreOf(this.env.KEK), () => api.kernel.identity()?.id ?? null),
        /* THE OPERATOR'S `TOKENS_VALID_FROM`, READ AT EACH CALL (`cut-off.ts`), so the grant readers and the owner's two
           listings hold to the instant as it stands, and a secret put in an incident reaches an object already open. */
        validFrom: () => validFromOf(this.env),
        /* WHAT THIS DEPLOYMENT IS, because the record cannot know. `/api/version` answers `33 §4`'s
           six keys and two of them are facts about the host: which build is serving, and whether
           there is a Slash behind it. An empty `BRAINDOG_BUILD` becomes `null` rather than `""` —
           the record says "I was not told" and `deploy-parity` reads a missing build instead of
           comparing against the empty string and finding it merely unequal. */
        build: {
          app: this.env.BRAINDOG_BUILD ?? '',
          slash: slashModel !== undefined,
          /* `boot` SAYS WHICH HOST THIS IS, because billing told the Cloud from a self-host by whether
             `/api/inbound/mint` answered 404. This Worker is
             the Cloud and nothing else, so it is a constant and not a binding. */
          host: 'cloud',
          /* The oldest command this door still works with, which `doorHealth` reads `behind` against. */
          min_cli: MIN_CLI,
        },
        slashModel,
        /* AND THE LEDGER ITS PRESS AND FIRST PLAN ARE SPENT FROM, the one a read at the palette and an automation's question
           are, under the owner's `ask_cap` and the operator's ceiling alike (`slash-meter.ts`). Without it the record asks
           `slashModel` unmetered: 5 presses and the daily look were 6 binding calls under a ceiling of three, and no row. */
        slashMeter: workerSlashMeter(this.env, () => api, { sql, clock: { now: () => Date.now() } }),
        /* A SEARCH'S OWN WORDS AS A VECTOR, only while his switch for Slash reading is on and the month's background
           allowance has room, and never on the ask ceiling (`workerMeaning`). Absent where this Worker cannot embed. */
        meaning: workerMeaning(this.#jobs, sql, () => api.kernel.prefsOf('slash')['slash.reads'] !== false),
        /* AND WHETHER THAT MODEL ANSWERS, for a read token, the command line and the daily vital sign (`engineHealth`). */
        engineHealth,
        engineProbe,
        /* AND WHAT IT WAS ASKED AND ANSWERED THIS MONTH, with what the record still does not understand (`engineReadings`). */
        engineLedger,
        /* WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER, so the doorbell rings for work somebody can
           do. A kind with no deliverer sits `pending` for ever — which is honest — and without
           this every write afterwards rang the queue about it. `notify.push` is among them only where both VAPID halves
           are set, so a record on an unkeyed deployment rings for a push no more than it did before push existed. */
        /* AND `infer.prose` WHERE THE ALARM'S MODEL PASS ANSWERS IT (`recordDelivers`), so a digest declaring
           `prose: slash` queues its two sentences here and goes as figures where no model could write them. The pump
           still leases `delivers(this.env)`, which never names it. */
        delivers: recordDelivers(this.env, this.#jobs !== undefined),
        /* THE SWITCH THAT FILES `ask_slash`, ON WHERE `alarm()` HAS A PASS TO ASK IT. `infer.ask` is not among what
           `delivers` answers: `makeDeliver` has no branch that asks Slash, so a question the pump leased would come back
           "nothing in this deployment delivers a infer.ask" and every run would end on that. */
        answersSlash: this.#answers !== undefined,
        /* A SHARED FILE AT AN ADDRESS IS READ HERE, not in the tab, so a site with no CORS header still installs. */
        readAddress: sharedReader(),
        /* A DRAFT SCRIPT RUN NOW, WRITING NOTHING (`@braindog/host/script-try`), in the sandbox a scheduled run gets:
           `runScript`, a fresh Worker from `env.LOADER.load`, with this caller's reads and, for the owner only, the
           keychain by label. Asked of the Directory's allowance and counted on its ledger like a run, because it is one.
           No `LOADER` is a deployment with no sandbox, which says so and runs nothing. The key is opened in the asker's
           name (`askerOf`), not as `system`, which is the alarm's because a scheduled run has nobody behind it. */
        tryScript: (d) => {
          const loader = this.env.LOADER;
          if (!loader) return Promise.resolve({ refused: { code: null, why: 'This deployment has no sandbox, so nothing ran.' }, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 } });
          const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
          const openKey = this.#openKey(api, askerOf(d));
          return scriptTrial({
            sandbox: (s, t) =>
              runScript(
                {
                  loader,
                  exports: this.ctx.exports as unknown as ScriptExports,
                  object: this.ctx.id.toString(),
                  runs: this.#scripts,
                  /* AN AGENT'S TRIAL ONLY READS (`readOnlyExecute`): a GET or a HEAD without a body, as on a self-host. */
                  send: (egress) => (t.readOnly ? readOnlyExecute(actionExecutor(() => egress, { openKey })) : actionExecutor(() => egress, { openKey })),
                  grant: t.grantOf,
                  openKey: t.readOnly ? null : openKey,
                  read: t.reads,
                  now: () => Date.now(),
                },
                s,
              ),
            ledger: { mayRun: (r, a, p) => directory.mayRun(r, a, p), meter: (r, run) => directory.meter(r, run) },
          })({ record: d.record, body: d.body as never, input: d.input as never, reads: d.reads as never, grantOf: d.owner ? grantNamed(() => api.kernel.grants()) : null, stale: d.stale });
        },
        /* WHAT AN AGENT MAY PROPOSE INSTALLING, and the carry step an update from an older use case runs. The same list the
           self-host hands in (`@braindog/seed/usecases/catalogue`): without it a hosted Personal 1.0.0 record updated and
           left what it kept typed where nothing reads it. */
        catalogue: CATALOGUE,
        /* NEWER VERSIONS IN THE KENNEL AND THE CATALOGUE BUNDLED WITH THE SHELL, for Slash to ask about on Decide, as a self-host's folder gives. */
        catalogueOffers: workerCatalogueOffers(this.env.ASSETS, this.env.BLOBS),
        catalogueShelf: workerCatalogueShelf(this.env.ASSETS, this.env.BLOBS),
        /* AN INVITATION IS SPENT BY SIGNING IN, and nobody signs in here without the Directory's key. */
        invitations: () => ((this.env.SESSION_SECRET ?? '').length >= 32 ? null : INVITES_OFF),
        /* WHETHER THIS WORKER MAKES READ-ONLY LINKS (`sharesOf`): `KEK` bound and `SHARE_LINKS` on, and the owner's sentence when not. */
        shares: () => sharesOf(this.env),
        /* THE PLUS GATE ON A SHARE TO SOMEBODY NOT ON THE RECORD YET, the same rule and the same
           sentence as `#oneOnly`'s on `invite` beside it: off while this host sells nothing, and on Free or Cloud a
           share to an outsider is a second person, which is Cloud Plus's. A share to somebody already here passes. */
        plus: () => this.#outsiders(api),
        /* AN AGENT'S TRIALS TODAY, from the Directory's ledger, which every metered trial already writes to (`script-try-cap.ts`). */
        trialsToday: (r) => this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory')).trialsToday(r, Date.now()) as unknown as Promise<number>,
        ...(copies === undefined ? {} : { snapshots: copies }),
        /* SEALED FILES' BYTES, IN THE BUCKET THE FILES ARE IN AND UNDER THE RECORD'S OWN ID (`sealed.ts`), each new part
           counted against the record's day of bytes as a file is. No `BLOBS` and the record keeps none, and says so. */
        ...(blobs === undefined
          ? {}
          : {
              sealed: cloudSealed(
                blobs,
                () => {
                  const record = api.kernel.identity()?.id;
                  if (!record) throw new Error('This BrainDog has not been made yet, so it keeps no sealed files.');
                  return record;
                },
                (bytes) => abuseWait(this.env, 'uploadDay', api.kernel.identity()?.id ?? '', bytes),
              ),
              /* VISUALS' PAGES BESIDE THE RECORD'S FILES, and its pictures looked up where the file door put them (`visuals.ts`). */
              visuals: cloudVisuals(blobs, () => {
                const record = api.kernel.identity()?.id;
                if (!record) throw new Error('This BrainDog has not been made yet, so it keeps no visuals.');
                return record;
              }),
            }),
        /* DELETION, `51 §5.13`, in this order: a final copy, every other object under the
           record's prefix, the alarm, the bytes, the names. The record has checked the owner, the sign-in and the typed
           name, and no request is answered in between. Measured before the bucket was passed: 2 objects under the prefix
           before and 2 after, for good, because the walk lists open records only. KEPT ON THE OBJECT TOO, so the nightly
           ladder's day-90 deletion (`lapseDelete`) is this same deletion and not a second one. */
        destroy: (this.#destroy = async () => {
          const id = api.kernel.identity()?.id ?? null;
          const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
          const storage = this.ctx.storage;
          const wipe = {
            deleteAlarm: () => storage.deleteAlarm(),
            deleteAll: async () => {
              this.#gone = true;
              this.#api = null;
              await storage.deleteAll();
            },
          };
          const swept = blobs && copies ? { blobs, final: async (record: string) => keyOf(blobs, record, (await copies.take('final')).id) } : undefined;
          /* WHAT THE SWEEP KEPT AND REMOVED GOES BACK ON THE ANSWER, so `deleteRecord` can say where the final copy is. */
          let answer: Awaited<ReturnType<typeof destroyRecord>> = undefined;
          /* A PAID RECORD'S SUBSCRIPTION ENDS WITH IT, before the wipe, so nobody is charged for a record that is gone. */
          if (id !== null)
            await endForDeleted(this.env, { billing: ((call: BillingCall) => directory.billing(call)) as unknown as BillingDeps['billing'], stripe: (key) => stripeOf(key, () => Date.now()) }, id);
          await this.ctx.blockConcurrencyWhile(async () => {
            answer = await destroyRecord(wipe, (record) => directory.close(record), id, swept);
          });
          return answer;
        }),
      });

      /* ARM FROM WHAT THE RECORD ALREADY HOLDS, INSIDE THE BLOCK. An object is evicted between
         requests and its alarm survives that — but a record restored from a backup, or one whose
         alarm a `deleteAll` took with it, would otherwise wait for a write it may never get. It sat
         outside, so a request could be answered by a record whose schedule was not yet armed.

         AND ITS FAILURE IS NOT THE RECORD'S. The tail is belt-and-braces — every write arms the
         alarm on its way out — so a doorbell that would not ring is a late notification, and
         letting it through here would have been a record that refuses to open at all. */
      if (!api.kernel.refused())
        try {
          await api.kernel.tail(this.#alarm);
        } catch (e) {
          op({ op: 'tail', rec: recOf(api), ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
        }
      /* EVERY ACK FROM HERE ON WRITES ITS `outbox` LINE, and the first open of this build says so once (`#booted`). */
      loggingAcks(api, sql);
      /* FREE IS ONE PERSON: an invitation to anybody not already on it is refused, in the owner's own sentence. */
      this.#oneOnly(api);
      /* AN ERASURE REACHES SLASH'S LEDGER TOO, in this same storage (`slashErasing`). */
      slashErasing(api, sql);
      /* THE PLAN'S COUNT OF AGENTS, ON WAKE: a record with no `plan.agents` row asks its plan once
         (`#planOf`), which writes it, so the fourth key on Free is refused though no `setPlan` ever reached this object.
         Inside the block, so no mint is answered before the row is there. A plan with no count leaves no row and is
         asked once a wake, which is one Directory read; a Directory that does not answer is asked again next wake. */
      if (!api.kernel.refused() && !this.#agentsHeld(sql)) await this.#planOf(api);
      await this.#booted(api);
    });
    return api;
  }

  /**
   * The `boot` line (`53 §2.3`): the first open of this record by this build writes `rec`, `app`, `kernel` and `fts5`, so
   * a deploy is seen reaching each record, and a record this build refuses is seen with the reason's module.
   *
   * ONCE A BUILD AND NOT ONCE AN OPEN. An object is evicted between requests and opens again all day; the build it last
   * opened as is kept in the object's own storage under `BOOTED`, beside the record and never in it, so the kernel's
   * tables and every copy of them hold nothing of it. A storage that cannot say, or an empty `BRAINDOG_BUILD`, writes the
   * line at every open: a line too many is the failure this chooses over a deploy nobody saw arrive.
   *
   * `fts5` IS WHETHER THE KERNEL OPENED WITH SEARCH, read from its refusal (`sqlite.fts5`, `kernel/src/migrate.ts`), and
   * `kernel` is the migration count this build carries, the number `/healthz` answers.
   */
  async #booted(api: RecordApi): Promise<void> {
    const app = this.env.BRAINDOG_BUILD ?? '';
    let last: unknown;
    try {
      /* AND WHETHER THE DOORS ARE STILL TO BE TOLD, in the same read, so a request to an object evicted before its alarm
         still asks for that alarm (`#doors`). */
      const got = await this.ctx.storage.get([BOOTED, DOORS_DUE]);
      last = got.get(BOOTED);
      this.#doorsDue ??= got.get(DOORS_DUE) === true;
    } catch {
      last = undefined;
    }
    if (app !== '' && last === app) return;
    /* A NEW BUILD TELLS THE DIRECTORY ITS DOORS ONCE (DR1): the hold's table was learned only from arrivals, so right
       after the deploy that brought it a bank's text in an outage was refused until that door's next arrival. Not with
       no build named (a dev run), where every open would be a new one. */
    if (app !== '') await this.#doorsMark(false);
    const refusal = api.kernel.refused();
    op({ op: 'boot', rec: recOf(api), app: app || null, kernel: KERNEL_MIGRATION, fts5: refusal?.at !== 'sqlite.fts5' }, refusal ? 'error' : 'info');
    if (app === '') return;
    try {
      await this.ctx.storage.put(BOOTED, app);
    } catch {
      /* The next open says it again. */
    }
  }

  /**
   * The alarm fired: drain everything due, then re-arm.
   *
   * RE-ARMING IS IN A `finally` INSIDE `drain`, and that is the single most important line in this
   * subsystem: a handler that throws before re-arming stops the customer's entire schedule forever,
   * and nothing anywhere says so. A hundred claimed rows leave the minimum still in the past, so the
   * alarm is set to now and the next fire drains the rest.
   */
  override async alarm(): Promise<void> {
    if (this.#gone || this.#armed) return;
    const api = await this.#record();
    /* THE DOORS FIRST, AND ON A LAPSED RECORD TOO: a step that waited behind the lapse would keep asking for the alarm. */
    await this.#doors(api);
    /* A LAPSED RECORD RUNS THE DRAIN AND NOTHING ELSE: its reminders still land, and no
       connector, call, poll, script, automation or Slash ask starts. An automation run that has not started waits under
       the lapse's sentence, which is the record's one message about it; no run writes a held event of its own. The
       hold is handed in before the drain, which is where a run starts, and on the first alarm after the lapse ends
       `#act` hands the ledger's own hold in its place. */
    if (await this.lapsed()) {
      holdAutomations(api.kernel, { until: Date.now() + LAPSE_HOLD_MS, say: LAPSED_FIX });
      await api.kernel.drain(this.#alarm);
      /* THE TAIL AFTER THE ACKS, because a digest's prose answered with nothing queues the digest itself, and the tail is
         what rings the queue for it. Work left for another pass sets the alarm for now, last, for the reason below. */
      const more = this.#unsent(api);
      await api.kernel.tail(this.#alarm);
      if (more) await this.#alarm.set(Date.now());
      return;
    }
    await this.#cutOff(api);
    /* A STEP THAT THREW WAS NOT CUT (review of 30 October, R4): the step written down is cleared before the throw goes on, so
       the platform's own retry of this alarm does not read it as a reset, count a cut, and after two hold the step for six
       hours with a mail that says it was cut. Only an object reset mid-step leaves it written. */
    let more: boolean;
    let asked: boolean;
    let modelled: boolean;
    let looked: boolean;
    let linted: boolean;
    try {
      await this.#step(api, 'drain', () => api.kernel.drain(this.#alarm));
      /* EVERY STEP BUT THE DRAIN MAY BE HELD after two alarms in a row were cut in it (`alarm-cuts.ts`), and then answers
         what a pass with nothing to do answers. */
      more = await this.#step(api, 'act', () => this.#act(api), false);
      asked = await this.#step(api, 'ask', () => this.#ask(api), false);
      modelled = await this.#step(api, 'model', () => this.#model(api), false);
      /* THE LOOK AND THE LINT, EACH A SHARE OF THIS ALARM (`ALARM_STEP_MS`, `ALARM_STEP_PAGES`). Each drew every page it
         read in one go, the look up to 49 s and the lint up to 27 s, and the platform reset the object. Now each stops
         when its share is spent, keeps where it stopped, and answers `more`, and the alarm is set for now below, so the
         rest is the next alarm's and requests are answered in between. */
      looked = await this.#step(api, 'look', () => slashLook(api, { sql: this.#jobsStore, budget: tickBudget(() => Date.now(), ALARM_STEP_MS, ALARM_STEP_PAGES) }), false);
      /* AND THE RECORD LINTS ITS OWN PAGES, at most once a UTC day: `lintTick` keeps the day itself, so each alarm asks only a pref. */
      linted = await this.#step(
        api,
        'lint',
        () =>
          api
            .lintTick({ budget: tickBudget(() => Date.now(), ALARM_STEP_MS, ALARM_STEP_PAGES) })
            .then((out) => out.ran === false && out.more === true)
            .catch((e: unknown) => {
              console.error('lint:', e instanceof Error ? e.message : String(e));
              return false;
            }),
        false,
      );
      /* AND WHETHER THE MODEL ANSWERS (`model-answers`), from this object's Slash ledger. A later filing the same day
         replaces the earlier one, so each alarm may file it; the provider's last words ride along from `#modelFailed`. */
      await this.#step(api, 'signs', (): void => {
        try {
          fileModelSign(api.kernel, guardedSql(this.ctx.storage), Date.now());
        } catch (e) {
          console.error('signs:', e instanceof Error ? e.message : String(e));
        }
      });
    } catch (e) {
      const said = e instanceof Error ? e.message : String(e);
      op({ op: 'alarm-step', rec: recOf(api), threw: true, error: said }, 'error');
      /* NOT WHEN THE PLATFORM SAYS IT RESET THE OBJECT ("... caused object to be reset"): that is a cut, said as a throw. */
      if (!resetSaid(said)) await this.#stepDone();
      throw e;
    }
    await this.#stepDone();
    /* WORK LEFT FOR THE NEXT INVOCATION SETS THE ALARM FOR NOW, AND IT IS SET LAST. `kernel.tail` sets the alarm from the
       `schedule` table alone, and both the ask pass and the daily look tail it, so a `set(now)` made inside `#act`
       before either of them could be moved out to the next schedule row, or cleared, by a pass that answered one
       question. Neither jobs `#act` released nor questions left in the outbox are schedule rows, so nothing else here
       would set it back. */
    if (more || asked || modelled || looked || linted) await this.#alarm.set(Date.now());
  }

  /** Whether this object's doors are still to be told (`DOORS_DUE`), read from storage once an object's life. */
  #doorsDue: boolean | undefined;

  /**
   * The doors are to be told again: written down, so an object evicted before its alarm still tells them, and with
   * `arm` the alarm asked for now. The first open of a build does not arm it, because that open may be the alarm's own,
   * which tells them in the same pass; a request after it does (`#answer`). A storage that cannot write keeps it in
   * memory for this object's life.
   */
  async #doorsMark(arm: boolean): Promise<void> {
    this.#doorsDue = true;
    try {
      await this.ctx.storage.put(DOORS_DUE, true);
    } catch {
      /* Kept in memory; the next build's first open marks it again. */
    }
    if (arm) await this.#soon();
  }

  /**
   * Tell the Directory every webhook door this record has (DR1, `doors$`), when they are due and never otherwise, so
   * the held store keeps a bank's text from the first outage after a deploy or a mint, and not only after that door's
   * next arrival taught it (`learning` in `held.ts`, which still follows a door between). One read of the record's
   * ingest declarations and one Directory call, once a deploy; an alarm with nothing due reads one boolean in memory.
   *
   * A TELL THAT FAILS IS LOGGED AND LEFT DUE, and is tried at the next alarm; it never stops the alarm's own work.
   */
  async #doors(api: RecordApi): Promise<void> {
    if (this.#doorsDue === undefined) {
      try {
        this.#doorsDue = (await this.ctx.storage.get(DOORS_DUE)) === true;
      } catch {
        return;
      }
    }
    if (!this.#doorsDue || api.kernel.refused()) return;
    const rec = recOf(api);
    if (rec === null) return;
    try {
      const refused = await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory')).doors$(rec, api.webhookSigns());
      if (refused !== null) {
        op({ op: 'door', told: false, rec, code: refused.code }, 'error');
        /* A REFUSAL IS NOT A FAULT A RETRY MENDS (a closed record, a door the Directory will not take), so it is not
           asked again until the next build or mint, and the doors are learned from arrivals as before. */
      }
      this.#doorsDue = false;
      await this.ctx.storage.delete(DOORS_DUE);
    } catch (e) {
      op({ op: 'door', told: false, rec, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
  }

  /** The alarm, set for now unless it is already set sooner. */
  async #soon(): Promise<void> {
    try {
      const at = await this.#alarm.get();
      if (at === null || at > Date.now()) await this.#alarm.set(Date.now());
    } catch (e) {
      console.error('the alarm could not be set:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * The look due after a request, handed to the alarm: set for now when anything is due (`slashDue`), and never run here.
   * An alarm already set for sooner is left as it is.
   */
  async #lookSoon(api: RecordApi): Promise<void> {
    if (!(await slashDue(api))) return;
    try {
      const at = await this.#alarm.get();
      if (at === null || at > Date.now()) await this.#alarm.set(Date.now());
    } catch (e) {
      console.error('slash: the alarm could not be set for the look:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * One step of the alarm, with its name kept in the object's storage while it runs.
   *
   * THE RUNTIME RESETS AN OBJECT THAT RUNS PAST ITS CPU LIMIT, and nothing of the alarm runs after that, its own catch
   * included, so the only way to learn which step it was is to have written it down first. The next alarm reads it back
   * (`#cutOff`). A slow step says so too, from wall time, which counts what the step waited on and not its pure CPU.
   */
  async #step<T>(api: RecordApi, step: string, run: () => T | Promise<T>, ...held: [] | [T]): Promise<T> {
    /* A STEP CUT IN TWO ALARMS IN A ROW IS SKIPPED UNTIL ITS HOLD ENDS, with a line each time (`alarm-cuts.ts`). */
    if (held.length === 1) {
      const until = heldUntil(await this.#cutsRead(), step, Date.now());
      if (until !== null) {
        op({ op: 'alarm-step', rec: recOf(api), step, held: true, until: new Date(until).toISOString() }, 'error');
        return held[0];
      }
    }
    await this.#stepNote(step);
    const started = Date.now();
    const out = await run();
    const ms = Date.now() - started;
    if (ms >= SLOW_STEP_MS) op({ op: 'alarm-step', rec: recOf(api), step, ms });
    /* A STEP THAT FINISHED CLEARS ITS COUNT: the next cut in it starts again at one. */
    const cuts = await this.#cutsRead();
    if (cuts !== null && cuts.step === step) await this.#cutsKeep(null);
    return out;
  }

  /** Write down the step running now, or `act:<script>` while a script runs in `act`, so a cut names it. */
  async #stepNote(step: string): Promise<void> {
    try {
      await this.ctx.storage.put(ALARM_STEP, step);
    } catch {
      /* A step not written down still runs. */
    }
  }

  /** The object's count of alarms cut in one step, read once per object and kept beside the storage. */
  #cuts: Cuts | null | undefined;
  async #cutsRead(): Promise<Cuts | null> {
    if (this.#cuts === undefined) {
      try {
        this.#cuts = cutsOf(await this.ctx.storage.get(ALARM_CUTS));
      } catch {
        /* A COUNT THAT CANNOT BE READ HOLDS NOTHING, and is asked again next time. */
        return null;
      }
    }
    return this.#cuts;
  }
  async #cutsKeep(cuts: Cuts | null): Promise<void> {
    this.#cuts = cuts;
    try {
      if (cuts === null) await this.ctx.storage.delete(ALARM_CUTS);
      else await this.ctx.storage.put(ALARM_CUTS, cuts);
    } catch {
      /* Kept in memory for this object's life; the next one counts from what storage has. */
    }
  }

  /** The alarm finished: no step is left running. */
  async #stepDone(): Promise<void> {
    try {
      await this.ctx.storage.delete(ALARM_STEP);
    } catch {
      /* The next alarm would name a step that finished; it says so only once, then this clears it. */
    }
  }

  /**
   * A step left written down by an alarm that never finished: the line that names it, once, and the count of alarms in a
   * row cut in that step. The count reaching `CUTS_TO_HOLD` holds the step and mails the operator, once.
   */
  async #cutOff(api: RecordApi): Promise<void> {
    let left: unknown;
    try {
      left = await this.ctx.storage.get(ALARM_STEP);
    } catch {
      return;
    }
    if (typeof left !== 'string') return;
    const now = Date.now();
    const cuts = cutAgain(await this.#cutsRead(), left, now);
    await this.#cutsKeep(cuts);
    /* AND THE STEP IS CLEARED, so an alarm that is held in it and finishes cleanly does not count it again. */
    await this.#stepDone();
    const rec = recOf(api);
    op({ op: 'alarm-step', rec, step: left, cut: true, times: cuts.times }, 'error');
    if (cuts.times === CUTS_TO_HOLD)
      this.ctx.waitUntil(opsAlert(this.env, { op: 'step', rec, why: `${left} cut ${String(cuts.times)} alarms in a row, held ${String(CUT_HOLD_MS / 3_600_000)} h` }, alertClaim(this.env)));
  }

  /**
   * A lapsed record's calls, polls and model jobs, acked as done and unsent: `true` when the pass took its full
   * `UNSENT_MOST` and more may be waiting.
   *
   * DONE AND NOT LEFT `pending`, because the work was for a month nobody paid for, and a lapse ended in May must not
   * post April's calls. A call or question a run waits on is answered with the lapse's sentence, so the run stops on it
   * rather than waiting out its day; a digest's prose is answered with nothing, so the digest goes as figures and the
   * pump drops it as a digest (`lapseDrops`). A draft is answered with nothing too, so nothing is proposed.
   *
   * AN ACK THE KERNEL REFUSES IS LEFT, with its `outbox` line saying why (`loggingAcks`), and its lease expires into the
   * next pass, as a delivery's would.
   */
  #unsent(api: RecordApi): boolean {
    if (api.kernel.refused()) return false;
    const jobs = api.kernel.leaseOutbox(UNSENT_KINDS, UNSENT_MOST);
    for (const job of jobs) {
      const answered = job.kind === 'infer.ask' || job.kind === 'pull.fetch' ? { result: { failed: LAPSED_FIX } } : {};
      api.kernel.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, ...answered });
    }
    return jobs.length === UNSENT_MOST;
  }

  /**
   * One model call that did not answer: an `op: 'model'` line at error level with the provider's own words, and
   * the operator mailed "BrainDog model" through the Directory's window, as a crash is, one a quarter hour for the fleet.
   *
   * NOT MAILED: a call on the owner's own key (`whose: 'owner'`), which is his provider's to mend, and a reply that broke
   * its schema until `SCHEMA_STREAK` in a row, because one odd answer is the model's and three are a prompt or a model
   * that changed. Logged every time, so the line is there to read when the mail comes.
   */
  #modelFailed(api: RecordApi | undefined, fail: ModelFail): void {
    const rec = api === undefined ? null : recOf(api);
    op(
      {
        op: 'model',
        rec,
        model: fail.model,
        provider: fail.provider || null,
        why: fail.why,
        raw: fail.raw || null,
        sent: fail.sent,
        whose: fail.whose,
        ...(fail.streak > 0 ? { streak: fail.streak } : {}),
      },
      'error',
    );
    if (fail.whose === 'owner' || (fail.why === 'schema' && fail.streak < SCHEMA_STREAK)) return;
    this.ctx.waitUntil(opsAlert(this.env, { op: 'model', rec, model: fail.model, why: fail.why }, alertClaim(this.env)));
  }

  /**
   * The record's model jobs, a pattern's draft and a digest's two sentences, served after the questions.
   *
   * AFTER `#ask`, because an automation's question is a run waiting and a draft is a proposal nobody is waiting on. The
   * pass is `@braindog/host`'s `serveModelJobs`, the one the self-host's `poll` calls too, spent from the background
   * allowance and never from his asks; a spent month leases nothing, so the jobs stay `pending` and the line says why.
   * A PASS THAT LEASED ITS FULL FIVE ANSWERS `true`, `#ask`'s rule and for its reason: five model calls fit in what this
   * invocation has left, a queue's worth may not, so `alarm()` sets the next alarm for now.
   *
   * A PASS THAT THROWS IS LOGGED AND NOT RETHROWN, `#act`'s rule. The message only, because a draft carries a stranger's text.
   */
  async #model(api: RecordApi): Promise<boolean> {
    if (this.#jobs === undefined || this.#jobsMeter === undefined || api.kernel.refused()) return false;
    const rec = recOf(api);
    try {
      return await serveModelJobs(api, {
        inference: this.#jobs,
        meter: this.#jobsMeter,
        now: () => Date.now(),
        scheduler: this.#alarm,
        /* WHERE WHO IS WHO KEEPS THE VERDICTS IT WAS GIVEN AND THE NOTES IT READ. `infer.resolve` is on no deliverer's
           list, as `infer.draft` and `infer.prose` are not: only this pass leases it. */
        store: this.#jobsStore,
        /* WHETHER SLASH'S MODEL ANSWERS: while it does not, the jobs wait with their attempts kept (`model-jobs.ts`). */
        health: this.#engineHealth,
        /* HIS SWITCH FOR SLASH READING ON ITS OWN: off, nothing is leased and no model is asked or tested. */
        reads: () => api.kernel.prefsOf('slash')['slash.reads'] !== false,
        /* THE KERNEL'S GOVERNOR: a pattern draft is held, never filed, while the floor or the brake says no. */
        mayPropose: this.#jobsStore ? (at) => mayPropose(this.#jobsStore!, at) : undefined,
        log: (line) => op({ op: 'slash.jobs', rec, ok: false, error: line }),
      });
    } catch (e) {
      op({ op: 'slash.jobs', rec, ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
      return false;
    }
  }

  /**
   * The questions to Slash this record's rules have queued, answered after `#act` (the self-host's `poll` order).
   *
   * NO DOORBELL IS NEEDED FOR THE FIRST FIVE AND NOTHING RINGS FOR THE SIXTH. Every `infer.ask` row is queued by a drain,
   * and the only drain on this host is the alarm's own, just above, so a question is asked in the invocation that
   * queued it. But `serveAsks` leases five, `infer.ask` is not in `delivers` so the tail rings nobody, and its tail arms
   * the alarm from `schedule` alone. Seven questions and a one-shot pass, measured in `test/slash-answers.test.ts`
   * case 10: five runs ended, two questions left `pending`, and the alarm armed an hour out for the record's `purge`
   * sweep, the next row in `schedule`, and not for them; with no such row it is the parked runs' day. So a pass that
   * leased its full five answers `true`, and `alarm()` sets the next alarm for now. That, and not a loop here, because
   * each question is a POST and a keychain opening, and `#act` has already spent up to 800 of this invocation's 1,000
   * subrequests (`invocation()`): five more fit in the 200 it leaves, a queue's worth may not.
   *
   * A PASS THAT THROWS IS LOGGED AND NOT RETHROWN, `#act`'s rule. `serveAsks` catches what `answer` throws itself; this
   * `try` is for the lease and the tail. The message only, because a question carries a row's values.
   */
  async #ask(api: RecordApi): Promise<boolean> {
    if (this.#answers === undefined || api.kernel.refused()) return false;
    try {
      const out = await serveAsks(api.kernel, this.#answers, this.#alarm, ASKS_PER_PASS);
      return out.answered + out.failed + out.refused + out.unacked >= ASKS_PER_PASS;
    } catch (e) {
      op({ op: 'slash.answers', rec: recOf(api), ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
      return false;
    }
  }

  /**
   * The scheduled actions due on this record: `pull`, `call` and `poll`, sent from this alarm (`09 §1`).
   *
   * AFTER THE DRAIN, so a row the drain just fired is a job this pass leases, and a retry the drain just released is
   * one too. `ALARM_RUNS` keeps one alarm inside the platform's ceilings, and `runActions` tails
   * the alarm when it is done, so work left over sets the next one.
   *
   * THE KEY STORE ONLY WHEN `KEK` IS BOUND. Unbound, an action that names a key sends nothing and its run event says
   * why in one sentence (`actions.ts`).
   *
   * A PASS THAT THROWS IS LOGGED AND NOT RETHROWN. The drain has already re-armed, and a throwing `alarm()` is
   * retried by the platform, which would run the drain again for a failure that was the network's.
   *
   * IT ANSWERS WHETHER ROWS WERE LEFT FOR LACK OF BUDGET, and `alarm()` sets the alarm for them again after every other
   * pass has tailed it.
   */
  async #act(api: RecordApi): Promise<boolean> {
    if (api.kernel.refused()) return false;
    const record = api.kernel.identity()?.id;
    if (!record) return false;
    try {
      /* THE DIRECTORY'S LEDGER, OVER RPC: asked before each run, and told every run the pass metered. A record on the
         hosted plan at its monthly allowance answers `held`, sends nothing, and waits for the first of next month. */
      const ledger = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
      /* AND THE RECORD'S AUTOMATIONS WAIT AT THE SAME ALLOWANCE, asked of the same ledger
         at most every `RUNS_HOLD_EVERY_MS` and handed to the kernel, which leaves a run it would start `pending` with the
         sentence on it. For the drain of the next alarm, because this one's has already run. A question that cannot be
         asked holds nothing, and a hold the kernel will not take is logged, so the actions below run either way. */
      try {
        holdAutomations(api.kernel, await this.#runsHold(record, (r, action, pending) => ledger.mayRun(r, action, pending), Date.now()));
      } catch (e) {
        console.error('automations hold:', e instanceof Error ? e.message : String(e));
      }
      /* ONE OPENER FOR THE ALARM, handed to the scripts' sends below as well, so KEK has one reader here and not two. */
      const openKey = this.#openKey(api);
      const inner = actionExecutor(() => api.kernel.actionOrigins(), { openKey });
      /* ONE ADMISSION COUNT FOR BOTH, so a record with one run left cannot spend it twice, and it is the runtime's
         count, so a trial in its sandbox and this pass cannot each spend the last run either. */
      const admissions = pass(IN_FLIGHT);
      const execute = holding(inner, record, (r, action, pending) => ledger.mayRun(r, action, pending), admissions);
      /* A CONNECTOR PAGES AND THE EXECUTOR ABOVE CANNOT. Without a runner the kernel finishes the
         row and meters it `dropped`, which is honest and means the hosted runtime never runs one.
         The store may be absent — `KEK` unbound is a deployment without hosted keys — and that is
         a refusal the run reports rather than a reason not to offer the runner at all. */
      const keys = (await keyStoreOf(this.env.KEK)) ?? undefined;
      const page = pagedRunner(api, { http: httpFor(), clock: { now: () => Date.now() }, keys });
      /* THE INVOCATION'S REQUESTS, RESERVED BEFORE EACH RUN RATHER THAN COUNTED AFTER IT. Cloudflare
         does not refuse the request that passes the ceiling, it ends the whole invocation — so a
         pass that checked afterwards would learn it was over from the run that was already gone,
         along with every other run in the same alarm. A connector at forty pages reserves eighty-six.

         ONE BUDGET FOR THIS ALARM, which is one invocation and one record. §2.3 puts it in `consume`
         instead, on the reading that one invocation drains every record; that is true of the outbox
         pump and not of this path, where the alarm is per object and each object is billed its own. */
      const budget = invocation();
      /* A SCRIPT ASKS THE SAME LEDGER ON THE SAME ADMISSION COUNT, so a record with one run left spends it once. */
      const script = this.#scriptRunner(api, record, openKey, (r, action, pending) => ledger.mayRun(r, action, pending), admissions);
      let out;
      try {
        out = await api.kernel.runActions(execute, {
          limit: ALARM_RUNS,
          scheduler: this.#alarm,
          page: holdingPaged(page, record, (r, action, pending) => ledger.mayRun(r, action, pending), admissions),
          budget,
          ...(script === undefined ? {} : { script }),
        });
        /* EACH WRITE IS TRIED AGAIN AND NONE STOPS THE REST; what the ledger still would not take is said here and
           counted by the nightly walk from the record's own events (`meterPass`, `meterReplay`). */
        const lost = await meterPass((r, run) => ledger.meter(r, run), record, out.usage);
        if (lost > 0) console.error(`actions: ${String(lost)} of ${String(out.usage.length)} runs were not counted; the nightly walk counts them from this record's events.`);
        /* THE OWNER'S ONE NOTE AT 80% AND ONE WHEN FIRST HELD: asked after this pass is metered, so the note is
           about what the month now holds. The Directory decides and deduplicates; only the Worker can reach the owner. */
        const told = await noticePass(
          (r) => ledger.notice(r),
          record,
          (note) => (note.email ? sendMail(this.env, 'usage.notice', note.email, { record: note.slug ?? '', say: note.say }) : undefined),
        );
        if (told === 'untold') console.error(`usage: a note for ${record} was owed and the owner was not told.`);
      } finally {
        /* A PASS THAT NEVER SETTLES HOLDS ITS RECORD'S RUNS FOR THE LIFE OF THE RUNTIME, so this is in a finally. */
        admissions.settle();
      }
      /* ROWS LEFT BECAUSE THE BUDGET RAN OUT, NOT BECAUSE THEY ARE NOT DUE. They are `pending` again
         and their schedule has not moved, so nothing re-arms them: this alarm has to. Now, because
         the work was due before the budget was the reason it did not happen. AND ANSWERED UPWARD TOO,
         because the ask pass and the daily look after this one tail the alarm from `schedule` and can
         move this setting out again; `alarm()` sets it once more after both (`test/budget.test.ts`
         reads this line). */
      if (out.more) await this.#alarm.set(Date.now());
      return out.more;
    } catch (e) {
      console.error('actions:', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /** The hold this record's automations wait under, as the Directory last said it: one per object, as the object is one record. */
  #runsHold = runsHold();

  /**
   * The last forty days of this record's metered runs, handed to the Directory's ledger again: the nightly walk's call
   * for each record, after every copy (`nightly.ts`). AN RPC AND NEVER A ROUTE. `null` for a record with nothing to
   * replay: deleted, refused by this build, or not yet made.
   *
   * THE READ IS THE RECORD'S OWN LOG (`eventsBefore`) AND THE WRITE IS THE DIRECTORY'S `meterMany`, a batch at a time,
   * so a pass killed before it metered, a ledger write that failed every try, and every automation run are counted by
   * morning, and a run already counted adds nothing (`replayUsage`).
   */
  async meterReplay(): Promise<Replayed | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    if (api.kernel.refused()) return null;
    const record = api.kernel.identity()?.id;
    if (!record) return null;
    const ledger = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
    /* AND SLASH'S ASKS BY DAY INTO THE ACCOUNT'S LEDGER (`slashReplay`), from this object's own `slash_call`. It logs what it could not hand across and never throws, so the runs below are replayed whatever it answered. */
    await slashReplay(guardedSql(this.ctx.storage), record, (r, days) => ledger.meterSlash(r, days), Date.now());
    return replayUsage({
      record,
      read: (before, limit) => api.kernel.eventsBefore(before, limit),
      meter: (r, runs) => ledger.meterMany(r, runs),
      now: Date.now(),
    });
  }

  /**
   * The packs this record has on, by the id it holds each under: the nightly walk's install counts (`nightly.ts`).
   * AN RPC AND NEVER A ROUTE. `null` for a record deleted, refused by this build, or not yet made. A pack another pack
   * handed declarations to was never installed, so it is not counted.
   */
  async packsOn(): Promise<string[] | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    if (api.kernel.refused()) return null;
    return api.kernel.packStates().filter((p) => p.disabled_at === null && p.handed !== true).map((p) => p.id);
  }

  /* ── the nightly walk's calls (`nightly.ts`, `ladder.ts`) ─────────────────
     EACH AN RPC AND NEVER A ROUTE: the cron is their one caller, and every one of them answers for the record as the
     system and not as any person. */

  /**
   * The addresses of this record's owners, for a lapse letter: the payer is not always the person who would lose it.
   * Empty for a record that is deleted, refused by this build, or not yet made.
   */
  async walkOwners(): Promise<string[]> {
    if (this.#gone) return [];
    const api = await this.#record();
    if (api.kernel.refused()) return [];
    return api.kernel
      .members()
      .filter((m) => m.level === 'owner' && m.suspended_at === null && m.email !== null && m.email !== '')
      .map((m) => m.email ?? '');
  }

  /**
   * When this record first met an agent and first had a briefing, each epoch ms or `null`, for the operator's funnel
   * (`funnel.ts`): the record's own `firsts`, asked as the host. `null` for a record deleted or refused by this build,
   * which the funnel counts as one it could not ask.
   */
  async firsts(): Promise<{ agent: number | null; brief: number | null } | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    if (api.kernel.refused()) return null;
    const out = await api.firsts(undefined, { principal: { kind: 'system', id: 'funnel' } });
    return out.ok ? out.value : null;
  }

  /** How many people are on this record, suspended ones left out: whether a cancelled plan fits Free (billing.ts fitsFree). `null` for a record deleted or refused by this build. */
  async walkPeople(): Promise<number | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    if (api.kernel.refused()) return null;
    return api.kernel.members().filter((m) => m.suspended_at === null).length;
  }

  /**
   * This record's `erase.r2` rows the walk checks (`53 §5.1` step 3d): every one not yet `done`, whatever its age, and
   * every `done` one queued since `since`. At most `ERASE_ROWS_MOST`, oldest first.
   *
   * READ FROM THE OUTBOX ITSELF, because the kernel keeps no second list of erasures: the outbox row is the promise
   * that an object goes, and its state is how far that promise has got.
   */
  async eraseRows(since: string): Promise<EraseRow[]> {
    if (this.#gone) return [];
    const api = await this.#record();
    if (api.kernel.refused()) return [];
    const rows = guardedSql(this.ctx.storage).all<{ id: string; state: string; created: string; payload: string }>(
      "SELECT id, state, created, payload FROM outbox WHERE kind = 'erase.r2' AND (state <> 'done' OR created >= ?) ORDER BY created LIMIT ?",
      since,
      ERASE_ROWS_MOST,
    );
    const out: EraseRow[] = [];
    for (const row of rows) {
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        payload = null;
      }
      const p = payload !== null && typeof payload === 'object' ? (payload as { erase?: unknown; key?: unknown }) : {};
      if (typeof p.key !== 'string') continue;
      out.push({ id: row.id, state: row.state, created: row.created, erase: typeof p.erase === 'string' ? p.erase : '', key: p.key });
    }
    return out;
  }

  /**
   * The erasures whose object the bucket still held, put back on the outbox (`53 §5.1` step 3d: "a hit re-enqueues the
   * deletion"). Through the kernel's one insertion path, and the doorbell rung after, as every write here rings it.
   */
  async eraseAgain(rows: { erase: string; key: string }[]): Promise<number> {
    if (this.#gone) return 0;
    const api = await this.#record();
    if (api.kernel.refused()) return 0;
    for (const row of rows.slice(0, ERASE_ROWS_MOST)) api.kernel.outbox('erase.r2', { erase: row.erase, key: row.key });
    await api.kernel.tail(this.#alarm);
    return Math.min(rows.length, ERASE_ROWS_MOST);
  }

  /**
   * The billing ladder's day-90 deletion (`ladder.ts`): the same deletion an owner's `deleteRecord` runs, final copy
   * first. `record` must be this object's own id, so a walk that addressed the wrong object deletes nothing.
   *
   * IT THROWS RATHER THAN ANSWERS `false`, so the walk's line carries the reason.
   */
  async lapseDelete(record: string): Promise<void> {
    if (this.#gone) throw new Error(DELETED.fix);
    const api = await this.#record();
    if (api.kernel.refused()) throw new Error('This build cannot open the record, so it did not delete it.');
    if (api.kernel.identity()?.id !== record) throw new Error(`This object is not ${record}, so nothing was deleted.`);
    if (!this.#destroy) throw new Error('The record has no deletion wired, so nothing was deleted.');
    await this.#destroy();
  }

  /**
   * One `note` event in the operator's own record, written as the system: the nightly summary (`53 §5.1` step 4). The
   * event's own shape (`noteEvent` in the kernel), at most 280 characters as a `note` row requires. `false` for a
   * record that is deleted, refused by this build, or not yet made.
   */
  async opsNote(text: string): Promise<boolean> {
    if (this.#gone) return false;
    const api = await this.#record();
    if (api.kernel.refused() || !api.kernel.identity()) return false;
    guardedSql(this.ctx.storage).exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, 'system', 'note', NULL, NULL, ?)",
      ulids(() => Date.now())(),
      new Date().toISOString(),
      text.slice(0, 280),
    );
    return true;
  }

  /**
   * The nightly walk telling this record what its copy came to: kept, with the copy's name and size, or failed,
   * with the reason (`copyKept` and `copyFailed` in the kernel). Both write a local `export` event, which no copy carries,
   * so telling after the dump leaves tomorrow's bytes as they were. A failure is one fault, counted again on the next
   * failed night rather than opened twice, and never a question. A LAPSED RECORD IS TOLD AS ANY OTHER: its copy is kept.
   *
   * IT THROWS RATHER THAN ANSWERS `false`, as `lapseDelete` does, so the walk's line carries the reason.
   */
  async nightCopy(outcome: { kept: { key: string; bytes: number } } | { failed: string }): Promise<void> {
    if (this.#gone) throw new Error(DELETED.fix);
    const api = await this.#record();
    if (api.kernel.refused() || !api.kernel.identity()) throw new Error('This build cannot open the record, so it was not told about its copy.');
    /* THE COPY'S OWN NAME, the last part of its key: the record's prefix is this record, and a path is not a name. */
    if ('kept' in outcome) api.kernel.copyKept(outcome.kept.key.split('/').at(-1) ?? outcome.kept.key, outcome.kept.bytes);
    else api.kernel.copyFailed(outcome.failed);
  }

  /**
   * A deploy's restore point, for this record (`restore-point.ts`): whether somebody wrote here since `since`,
   * and in a real run a copy under `label`, through the same port the record's own copies go through (`copies.ts`).
   * `check` opens the record with this build and copies nothing. AN RPC AND NEVER A ROUTE: the operator's door is its
   * one caller.
   *
   * WRITTEN BY SOMEBODY, NOT BY `system`: the night tells every record about its copy with a system `export` event, and
   * counting that would call every record in use. `event_ts` answers the question from the newest rows without a scan.
   *
   * IT THROWS RATHER THAN ANSWERS, as `nightCopy` does, so a record this build refuses is a `failed` with its reason.
   */
  async restorePoint(ask: { since: string; label: string; check: boolean }): Promise<PointAnswer> {
    if (this.#gone) return { written: false };
    const api = await this.#record();
    if (api.kernel.refused()) throw new Error('This build cannot open the record.');
    if (!api.kernel.identity()) return { written: false };
    const used = guardedSql(this.ctx.storage).all<{ one: number }>("SELECT 1 AS one FROM event WHERE ts >= ? AND actor <> 'system' LIMIT 1", ask.since);
    if (used.length === 0) return { written: false };
    if (ask.check) return { written: true };
    if (!this.#copies) throw new Error('This deployment has no bucket, so there is nowhere to put a copy.');
    const copy = await this.#copies.take(ask.label);
    return { written: true, copied: copy.id };
  }

  /**
   * One outbox job this Worker sent, counted in the Directory's ledger and never limited (`deliveryRun`). AN RPC AND
   * NEVER A ROUTE: `drainOutbox` calls it through `deliver.ts`'s `counted`, and only after the send succeeded.
   *
   * IN THE OBJECT AND NOT IN THE PASS, because the pass knows the object and not the record id the ledger is keyed by.
   * A write that fails its tries is logged by kind and id alone; a delivery leaves no event behind, so no replay finds it.
   */
  async countDelivery(job: { id: string; kind: string }): Promise<void> {
    if (this.#gone) return;
    const api = await this.#record();
    const record = api.kernel.refused() ? undefined : api.kernel.identity()?.id;
    if (!record) return;
    const ledger = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
    const lost = await meterPass((r, run) => ledger.meter(r, run), record, [deliveryRun(job, Date.now())]);
    if (lost > 0) console.error(`deliveries: ${job.kind} ${job.id} was sent and not counted.`);
  }

  /**
   * This record's own id (`rec_<ulid>`), for a transport that is handed only the Durable Object's hex id.
   *
   * AN RPC AND NEVER A ROUTE: `drainOutbox`'s `erase` transport keys `BLOBS` by the record id (`fileKey`), and
   * the queue's doorbell and the object's own storage address both carry the hex id, never this one.
   */
  async recId(): Promise<string | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    return api.kernel.refused() ? null : (api.kernel.identity()?.id ?? null);
  }

  /**
   * The one opener over `KEK` for a single-request send: the alarm's actions and scripts, and a script's trial. One
   * place, so `KEK` keeps the readers `test/keychain.test.ts` names and a trial adds none. `actor` is whoever asked, and
   * absent for the alarm, where `keyOpener` signs `system`.
   */
  #openKey(api: RecordApi, actor?: string): OpenKey | null {
    return keyOpener(api, this.env.KEK, actor);
  }

  /**
   * The sandbox a `script.run` goes to, or `undefined` on a deployment with no `LOADER`, where the kernel meters the
   * run `dropped` and says this host has no sandbox.
   *
   * THE SEND IS THE SAME `actionExecutor` A `call` GETS, over the script's own declared origins rather than the
   * record's ingest origins (`actionOrigins` reads only `ingest` declarations). The key is opened by `keyOpener` in this
   * object, for one request, as `system`: a scheduled script has no asker, which is `keyOpener`'s own default.
   *
   * READS ARE THE RECORD'S OWN `list` AND `get`, asked as the script's actor with its `reads` as the ceiling, so the
   * record's `reaches` is what keeps a `get` of a spoken id inside the registers the owner approved.
   *
   * THE READS, THE KEY LOOKUP AND THE HOLD ARE `@braindog/host/script`'s, THE SELF-HOST'S OWN. This object had copies of
   * all three, and they had drifted: the self-host had no reads at all, and this lookup matched a label only and sorted
   * two grants made in the same millisecond by a comparator that answered -1 both ways round, so which key a script
   * opened rested on the order the rows came back in. `grantNamed` breaks the tie on the id, as `keyNamed` does for a
   * `call`, and `scriptReads` takes secret fields off every row before the sandbox sees it.
   */
  #scriptRunner(api: RecordApi, record: string, openKey: OpenKey | null, mayRun: Ledger['mayRun'], admissions: Admissions) {
    const loader = this.env.LOADER;
    if (!loader) return undefined;
    /* EACH RUN WRITES ITS SCRIPT'S NAME AS THE STEP, `act:<script>`, and `act` again after it, so an object reset while
       a script's calls run in it names that script on the next alarm's cut line, not the whole of `act`. */
    const noted = async (s: Scripted): Promise<ScriptAnswer> => {
      await this.#stepNote(`act:${s.scripted.script}`);
      try {
        return await run(s);
      } finally {
        await this.#stepNote('act');
      }
    };
    const run = (s: Scripted): Promise<ScriptAnswer> =>
        runScript(
          {
            loader,
            exports: this.ctx.exports as unknown as ScriptExports,
            object: this.ctx.id.toString(),
            runs: this.#scripts,
            send: (egress) => actionExecutor(() => egress, { openKey }),
            grant: grantNamed(() => api.kernel.grants()),
            openKey,
            read: scriptReads(api),
            /* `ctx.propose`, as on the self-host: tried against the gate now, filed with the run's writes. */
            propose: scriptProposals(api),
            now: () => Date.now(),
          },
          s,
        );
    return holdingScript(noted, record, mayRun, admissions);
  }

  /**
   * Claim outbox jobs for the Worker to deliver.
   *
   * THE LEASE IS THE RECORD'S AND THE DELIVERY IS THE HOST'S, and the seam is exactly here. The
   * record holds the ladder, the attempt count and the dead letter; the Worker holds the network
   * and the credentials. Doing the I/O inside the object would give the record a reason to hold a
   * key, and `ADR-062` is the argument for why it must not.
   */
  async lease(n = 10): Promise<OutboxRow[]> {
    if (this.#gone) return [];
    const api = await this.#record();
    return api.kernel.leaseOutbox(delivers(this.env), n);
  }

  /**
   * The night's copy of this record, put in the bucket by this object, for the nightly walk. `51 §5.12` steps 3 to 6.
   *
   * THE OBJECT WRITES IT AND HANDS BACK ONLY WHAT IT CAME TO. It handed the whole file back as one RPC value, and on
   * 22 Oct a 39.7 MB record was refused at 32 MiB, every night. So the file streams out of this object's own SQLite
   * through the `r2Snapshots` the walk wrote with, to the same keys and recipient, and only `{ key, bytes, rows }` crosses.
   *
   * THE BOOKMARK IS TAKEN IN THE SAME CALL as the dump rather than before it, so the point-in-time
   * the copy is paired with is a moment this object was already at, and not one a round trip ago.
   * A deployment whose storage has no bookmarks answers `null`, and the copy is still a copy.
   */
  async snapshot(record: string, at: string): Promise<Kept> {
    if (this.#gone) throw new Error(DELETED.fix);
    const blobs = this.env.BLOBS;
    if (!blobs) throw new Error('This deployment has no bucket, so there is nowhere to put a copy.');
    const api = await this.#record();
    const copies = r2Snapshots(blobs, { recipient: this.env.AGE_RECIPIENT ?? '' });
    return steady(async () => {
      let bookmark: string | undefined;
      try {
        bookmark = await this.ctx.storage.getCurrentBookmark();
      } catch {
        /* PITR is not on every deployment, and a copy without a bookmark is still a copy. */
      }
      return copies.take(record, await streamDumpOf(api, at, bookmark));
    });
  }

  /**
   * `51 D15`'s reset: `ctx.abort()` on an object a restore has armed, so it starts again at the copy. `false` when
   * nothing is armed, and then nothing happens. AN RPC AND NEVER A ROUTE: the Worker calls it straight after the
   * record's `restore` has answered, and a caller who could reset any object at will could drop its in-flight work.
   *
   * IT DOES NOT RETURN WHEN IT WORKS. The platform ends the object inside this call, so the Worker's promise rejects, and
   * that rejection is the answer `afterRestore` in `route.ts` waits for.
   */
  async reopen(): Promise<boolean> {
    if (!this.#armed) return false;
    this.ctx.abort('This BrainDog was put back to a copy, and starts again from it.');
    return true;
  }

  /**
   * An object armed by a restore that has already answered, and what that restore restored: `recoverRestore` in
   * `route.ts` asks this before it resets anything. `null` when nothing is armed, or while a restore is still running
   * and the arm is the one it is in the middle of. AN RPC AND NEVER A ROUTE, like `reopen`, and for its reason.
   *
   * NOT THROUGH `#record()`, which rejects on `#armed`, and armed is the one state this is asked about.
   */
  async stranded(): Promise<Stranded | null> {
    return this.#armed && this.#restoring === 0 ? { restored: this.#left } : null;
  }

  /**
   * `51 D15`'s second call, on the object that started after the reset: `restore.pitr`, written where the rewind cannot
   * take it. AN RPC AND NEVER A ROUTE: `restored` is INTERNAL, and the Worker says who asked and what was kept.
   */
  async restored(args: Restored): Promise<Result<{ event: string }>> {
    if (this.#gone) return { ok: false, refusal: DELETED };
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.restored(args);
  }

  /**
   * An operation bearer, checked and spent, for the bearer path in `session.ts`. AN RPC AND NEVER A ROUTE: INTERNAL.
   *
   * `TOKENS_VALID_FROM` HOLDS HERE TOO, through the record `#open` built (its `validFrom`): a grant approved before
   * it is refused unspent, and `session.ts` answers that 401 as it answers every bearer it does not know.
   */
  async operationGrant(bearer: string): Promise<Result<OperationGrant>> {
    if (this.#gone) return { ok: false, refusal: DELETED };
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.operationGrant(bearer);
  }

  /**
   * The key this record's exports are signed with, `{ key_id, public_key }`, or `null` for a record that signs nothing.
   * AN RPC AND NEVER A ROUTE: `signingKey` is INTERNAL, and `/<slug>/.well-known/braindog-key` is its one caller.
   */
  async signingKey(): Promise<{ key_id: string; public_key: string } | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    return api.kernel.refused() ? null : api.signingKey();
  }

  /**
   * A bearer, checked against this record's own table.
   *
   * THE RECORD VERIFIES AND THE WORKER ROUTES, and the split is the whole of why the bearer carries
   * the record id: only the object holding that table can say whether the hash is in it, and asking
   * anywhere else would be a search across every customer.
   *
   * THE ANSWER IS THE KERNEL'S `Verified`, `reach` INCLUDED, so the inbox reach `session.ts` puts on the principal is
   * named by the type it crosses the RPC in, not only by the row it came from. And the operator's `TOKENS_VALID_FROM`
   * goes down with the bearer: a token made before it answers `null`, which is the 401 every unknown bearer gets.
   * `build` is the command's `x-braindog-cli` (`bearerOf`), kept on the key as its `last_build`.
   */
  async verify(bearer: string, surface: string, build?: string): Promise<Verified | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    const out = await api.kernel.verifyToken(bearer, surface, validFromOf(this.env), build);
    return out.ok ? out.value : null;
  }

  /**
   * `verify` and then `access` for the key it found, in one call: the bearer path's whole question of this record
   * (`bearerOf`'s `admit`), or `null` for a bearer it does not know. `held` is `null` for a person not on the record.
   *
   * ONE TURN IN THIS OBJECT'S QUEUE AND NOT TWO. The Worker asked `verify`, waited, then asked `access`, so on a busy
   * record every bearer call queued here twice before its own request was even sent: production's `/api/boot` spent
   * four to six seconds in those two turns while the answer itself took a fifth of one (`Server-Timing`, 2026-10-26).
   * The two run back to back in one event, so no other request lands between the secret and what it holds.
   */
  async admit(
    bearer: string,
    surface: string,
    build?: string,
  ): Promise<{ verified: Verified; held: { level: string | null; registers: string[] | null; levels: Record<string, string> } | null } | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    const out = await api.kernel.verifyToken(bearer, surface, validFromOf(this.env), build);
    if (!out.ok) return null;
    const seen = out.value;
    return { verified: seen, held: api.kernel.access(seen.person_id, seen.child?.id ?? seen.id) };
  }

  /**
   * A one-hour key under an app's sealed parent, for the OAuth door (`oauth.ts`'s `child`). AN RPC AND NEVER A ROUTE:
   * the record's `mintChild` is host-only, and the parent is proved by its bearer. The operator's `TOKENS_VALID_FROM`
   * holds here through the record `#open` built, so a parent made before it mints nothing.
   */
  async mintChild(parent: string, args: ChildArgs): Promise<Result<ChildMinted>> {
    if (this.#gone) return { ok: false, refusal: DELETED };
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.mintChild(parent, args);
  }

  /**
   * What this person may do inside this record, or `null` if they are not on it.
   *
   * THE RECORD'S OWN `member` TABLE, which is the table `invite` writes and the one that travels in
   * a `.brain` file, MERGED WITH THEIR SHARES through the lens (`kernel.access`). `registers` is the ceiling and `null`
   * is all of them. `token` is the key a bearer is, whose narrowing is ANDed into everything. The answer is computed in
   * this object on every call and cached here, never in the Worker, so a revoke reaches the next call.
   *
   * THE DECLARED TYPE IS THE OLD THREE KEYS, as it was when `wheres` joined them: the answer crosses the RPC whole
   * (`wheres`, `writes`, `hides`, `nots`, `grant` included) and `session.ts` reads it as `HeldAccess`, while a JSON tree
   * named in an RPC signature is a type the stub's mapping cannot finish instantiating.
   */
  async access(person: string, token?: string): Promise<{ level: string | null; registers: string[] | null; levels: Record<string, string> } | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    return api.kernel.access(person, token ?? null);
  }

  /**
   * Whether the files door keeps a file from this caller, named only on rows they cannot read (`fileHeld`). A deleted
   * record gives no file to anybody.
   */
  async fileHeld(sha256: string, ctx: CallContext): Promise<boolean> {
    if (this.#gone) return true;
    const api = await this.#record();
    return api.fileHeld(sha256, ctx);
  }

  /** Whether this person is on the record and an owner has stopped them, so a door can say so rather than "not on this record". */
  async memberStopped(person: string): Promise<boolean> {
    if (this.#gone) return false;
    const api = await this.#record();
    return api.kernel.memberStopped(person);
  }

  /** Whether this person's access here ended, and whose record it is, so a door can tell them so. */
  async accessEnded(person: string): Promise<{ owner: string | null } | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    return api.kernel.accessEnded(person);
  }

  /**
   * The switcher's `ask`: what this person may do here, and what this record calls itself.
   *
   * BOTH FROM THIS RECORD'S OWN TABLES, and neither is a second copy of a fact held elsewhere:
   * `access` above is the same `member` table read the same way, and `kernel.identity()` is what
   * `boot` names the record by. The Directory cannot answer either question about a record that is
   * not itself.
   *
   * AND THE LISTS, WHEN THERE IS NO LEVEL. This answered `access(person)?.level ?? null`, which is
   * `null` for a colleague invited to one list, so `switcherRows` dropped the record that had just
   * admitted them. `switcherAsk` is shared with the self-host
   * so the two cannot drift back apart.
   */
  async switcherRow(person: string): Promise<SwitcherAsk> {
    if (this.#gone) return { level: null, name: null };
    const api = await this.#record();
    return switcherAsk(api.kernel, person);
  }

  /**
   * A name or address the Directory has already moved, carried into this record's own mirror of the person.
   * `renamedEverywhere` and the account's email doors reach every record a person belongs to over this RPC, because on
   * the Worker the record method has no Directory to ask for the other records itself (`deps.directory` is `null`).
   */
  async mirrorPerson(person: string, change: { name?: string | undefined; email?: string | undefined }): Promise<Result<unknown>> {
    if (this.#gone) return { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'This BrainDog is closed.' } };
    const api = await this.#record();
    return api.kernel.mirrorPerson(person, change);
  }

  /**
   * Make this record: its identity, its owner and the owner's membership. The operator's provisioning only.
   *
   * AN RPC AND NEVER A ROUTE. `createRecord` is INTERNAL, because whoever calls it becomes the owner, and the
   * only way here is `/auth/provision`, behind the operator key. `null` is made.
   */
  /** One call of the Kennel's scratch install (kennel-scratch.ts), on an object under a kennel-scratch: name nobody signs in to, as its owner. */
  async scratchCall(method: 'planPack' | 'installPack' | 'pages' | 'page', args: unknown): Promise<unknown> {
    const api = await this.#record();
    const owner: CallContext = { principal: { kind: 'person', id: 'kennel-scratch', level: 'owner' } };
    return method === 'pages' ? api.pages(owner) : (api[method] as (a: unknown, c: CallContext) => Promise<unknown>).call(api, args, owner);
  }

  /** The scratch emptied whole once its answer is known, so nothing of a submission is kept. */
  async scratchDrop(): Promise<void> {
    this.#api = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async create(args: CreateRecordArgs): Promise<Refusal | null> {
    const api = await this.#record();
    const made = await api.createRecord(args);
    return made.ok ? null : refusalOf(made);
  }

  /**
   * A device asks to sign in to this record, counted against its address. `/auth/device` is the only way here.
   *
   * AN RPC AND NEVER A ROUTE, like `create`: `deviceStart` and `devicePoll` are INTERNAL, because the device has
   * no credential to check yet.
   */
  async deviceStart(args: { reach: string; label: string; ua?: string; scope?: string; binds?: string }, ip: string): Promise<Result<DeviceCode> | Limited> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.deviceStart(args, ip);
  }

  /** The device asks again, and once approved takes its bearer, once. `/auth/device/token` only. */
  async devicePoll(args: { device_code: string }): Promise<Result<Waiting | Exchanged>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.devicePoll(args);
  }

  /**
   * A payload arrived at `/in/*` for this record. `/in/webhook/<rec>/<ingest>/<token>` is the only way here.
   *
   * AN RPC AND NEVER A ROUTE, and this is the one of the four where that matters most: `arrive` performs no
   * authorisation of its own, because there is nobody to authorise. The caller is a bank's server holding no
   * credential this record ever issued, and what stands in for a principal is `verified` (`30 §5`, `12 §3`).
   * `router-groups` is what keeps it off the table.
   *
   * A SUSPENDED RECORD REFUSES AND THE SENDER IS TOLD TO COME BACK, which is what the neighbours above do and
   * is right for a different reason here: the door turns every refusal into 503 with a sentence of its own, so
   * a bank retries and nothing about this record's state crosses to whoever is holding the URL.
   */
  async arrive(args: Omit<Arrival, 'verified'> & { verified: boolean }): Promise<Result<Arrived>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.arrive(args);
  }

  /**
   * What verifies one webhook ingest on this record, for the `/in/*` door. AN RPC AND NEVER A ROUTE.
   *
   * A RECORD THAT CANNOT ANSWER RIGHT NOW MUST NOT ANSWER `null`, WHICH IS WHY THIS THROWS. `null` is the
   * door's 404, and a 404 is what every webhook provider treats as "this endpoint is gone": GitHub, Stripe and
   * Twilio all disable or back off a hook that answers one. A record suspended for an afternoon would come
   * back to a sender that had stopped sending. Throwing reaches `serveIngest`'s own catch, which answers 503
   * and the word retry, and that is the difference between an outage and a disconnection.
   */
  async ingestVerify(args: { ingest: string }): Promise<IngestVerification | null> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    if (broken) throw new Error(broken.fix);
    return api.ingestVerify(args, this.#openKey(api) ?? undefined);
  }

  /** Count one arrival a door switched off turned away. AN RPC AND NEVER A ROUTE, as `ingestVerify` is. */
  async doorTurnedAway(args: { ingest: string }): Promise<void> {
    (await this.#record()).doorTurnedAway(args);
  }

  /** A keychain grant's bearer, checked for the key doors. AN RPC AND NEVER A ROUTE: `keychainGrant` is INTERNAL. */
  async keychainGrant(bearer: string): Promise<Result<KeychainGrant>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.keychainGrant(bearer);
  }

  /** The fingerprint this record's keychain is wrapped by, or `null` for a record made before the key store was bound. */
/**
   * An invitation link: looked at with a token alone, or spent for the person `/auth/invite` has just made or signed in.
   *
   * AN RPC AND NEVER A ROUTE, like `create`: whoever calls it with a person puts that person on this record.
   */
  async acceptInvite(args: { token: string; person?: { id: string; email: string; name?: string } }): Promise<Result<unknown>> {
    const api = await this.#record();
    return api.acceptInvite(args);
  }

    async wrappingKey(): Promise<string | null> {
    const api = await this.#record();
    return api.kernel.refused() ? null : api.kernel.wrappingKey();
  }

  /** This record's keys under a root key, for the nightly re-wrap (`src/rewrap.ts`), or `null` for a record this build refuses. AN RPC AND NEVER A ROUTE. */
  async keysHeld(): Promise<HeldKeys | null> {
    const api = await this.#record();
    return api.kernel.refused() ? null : { record: api.kernel.identity()?.id ?? null, rows: api.kernel.wrappedKeys() };
  }

  /** The re-wrap's swap, compare-and-set on `vault_key.kek_id` (`kernel/src/api/keys.ts`). AN RPC AND NEVER A ROUTE: `rewrapKeys` is INTERNAL. */
  async rewrapKeys(args: RewrapArgs): Promise<Result<Rewrapped>> {
    const api = await this.#record();
    return api.rewrapKeys(args);
  }

  /**
   * A key deposited through a key door. AN RPC AND NEVER A ROUTE: `depositGrant` is INTERNAL.
   *
   * `by` IS A KEYCHAIN GRANT OR A BROWSER SESSION, and which one it is decides what the record allows. The Worker
   * checked one or the other before calling; the gate itself is the record's, in `depositGrant`.
   *
   * `seal` IS THE WORKER'S, CALLED BACK OVER RPC. The value stays in the Worker's closure and this object receives
   * only the sealed bytes `seal` returns, which is ADR-062 across the RPC boundary.
   *
   * `opts.agentDeposit` IS SET BY THE WORKER'S DEPOSIT DOOR ALONE, for a login token it checked itself, and never read
   * from a request. The record then adds a new key in the token's run's project and
   * refuses to replace one.
   */
  async depositGrant(
    args: { label?: unknown; opens?: unknown; kind?: unknown; project?: unknown; credential?: unknown },
    by: KeychainGrant | CallContext,
    hints: SessionHints,
    seal: (target: SealTarget) => Promise<Result<Sealed>>,
    opts?: { agentDeposit?: true | undefined },
  ): Promise<Result<Deposited>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.depositGrant(args, by, hints, seal, opts);
  }

  /**
   * A runner's bearer, checked against this record's own device grants: the context of the machine it names, or
   * `null` when it is not a runner's. AN RPC AND NEVER A ROUTE, like `verify`, and for
   * its reason: only the object holding the grant table can say whether the bearer is in it. THE CUT-OFF TOO, as
   * `operationGrant` and `verify` take it: a machine enrolled before `TOKENS_VALID_FROM` is one nobody enrolled.
   */
  async runner(bearer: string): Promise<CallContext | null> {
    if (this.#gone) return null;
    const api = await this.#record();
    return api.kernel.refused() ? null : runnerContext(api, bearer, validFromOf(this.env));
  }

  /** A key's sealed material, for the Worker to open. AN RPC AND NEVER A ROUTE: `openForGrant` is INTERNAL. */
  async openForGrant(args: { label?: unknown; credential?: unknown }, by: KeychainGrant | CallContext, hints: SessionHints, kekId: string): Promise<Result<OpenedForGrant>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.openForGrant(args, by, hints, kekId);
  }

  /**
   * Whether the record key opens for one key door's request. AN RPC AND NEVER A ROUTE: `unlockKeychain` is INTERNAL.
   * `unlock` IS THE WORKER'S, CALLED BACK OVER RPC, as `seal` is for `depositGrant`: the passphrase and the key it opens
   * stay in the Worker, and this object is told only whether it opened.
   */
  async unlockKeychain(by: KeychainGrant | CallContext, unlock: PassphraseUnlock): Promise<Result<KeychainPassphrase>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.unlockKeychain(unlock, by);
  }

  /**
   * The key a leased `notify.webhook` names, sealed, for the Worker to sign the post with. AN RPC AND NEVER A ROUTE.
   *
   * THE LEASE IS THE AUTHORITY, AND THE RECORD CHECKS IT. `sealedGrant` refuses a job that is no longer leased to the
   * caller, one whose lease has lapsed, and a key the job's payload does not name, so the Worker holding this stub can
   * open the one key that one post asked for and nothing else in the keychain. The record's id comes back beside the seal
   * because the Worker addresses this object by its Durable Object id, and the AAD and the KEK wrap both name the
   * record's own. `system` signs the `grant.read`, as it does for the alarm's scheduled calls: nobody asked.
   */
  async sealFor(args: { outbox: string; leasedUntil: string; grant: string }): Promise<Result<{ record: string; seal: LeasedSeal }>> {
    if (this.#gone) return { ok: false, refusal: DELETED };
    const api = await this.#record();
    const broken = api.kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    const record = api.kernel.identity()?.id;
    if (!record) return { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'This BrainDog has not been made, so it holds no key.' } };
    const out = api.kernel.sealedGrant(args, 'system');
    return out.ok ? ok({ record, seal: out.value }) : out;
  }

  /**
   * The endpoint a leased `notify.push` rings, or `null` when its person has since unsubscribed. AN RPC AND NEVER A ROUTE.
   *
   * `sealFor`'S SHAPE FOR AN ADDRESS. The job names a subscription by id because the outbox travels in every `.brain`
   * file, so the endpoint stays in `push_sub` and comes out here, to the Worker holding the job's lease and to nobody
   * else, under the same three lease checks (`packages/kernel/src/push.ts`).
   */
  async pushTargetFor(args: { outbox: string; leasedUntil: string }): Promise<Result<PushAddress | null>> {
    if (this.#gone) return { ok: false, refusal: DELETED };
    const api = await this.#record();
    const broken = api.kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    const out = api.kernel.pushTarget(args);
    /* WHERE A TAP OPENS IS UNDER THIS RECORD'S NAME: `/<slug>` before the record's own path. A record whose
       name cannot be read rings with no body, as every push did before. */
    if (!out.ok || out.value === null || out.value.open === undefined) return out;
    const { open, keys, ...bare } = out.value;
    const record = api.kernel.identity()?.id;
    let slug: string | null = null;
    try {
      slug = record ? await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory')).slugOf(record) : null;
    } catch {
      slug = null;
    }
    return { ok: true, value: slug && keys ? { ...bare, keys, open: `/${slug}${open}` } : bare };
  }

  /** How it went. The ladder walks from here, and a failed ack arms the `retry` row that tails. */
  /**
   * How it went, and which lease it is about.
   *
   * `leasedUntil` IS THE FENCE. Without it a stale ack completes somebody else's lease and one
   * delivery becomes eight; the record refuses one that names a lease it no longer holds.
   *
   * `result` IS WHAT THE DELIVERY SAID, carried to `ackOutbox` unchanged: a push the service called gone is
   * `{ gone: true }`, and the record deletes that subscription in the ack's transaction (`51 §5`).
   */
  async ack(done: { id: string; state: 'done' | 'failed'; error?: string; leasedUntil?: string; result?: unknown }): Promise<void> {
    const api = await this.#record();
    api.kernel.ackOutbox(done);
    /* THE TAIL, because a failed ack writes a `retry` row and nothing else here would notice it —
       on an idle record `pendingWork()` would say there is work and the alarm would say `null`. */
    await api.kernel.tail(this.#alarm);
  }

  /**
   * THESE TWO GO THROUGH `json()` LIKE EVERY OTHER ANSWER THIS FILE WRITES.
   *
   * They were built by hand with a content-type and nothing else, and `route()` returns what this
   * object hands back unchanged, so they were the only two answers on the whole surface without
   * `no-store` on them: every other one either comes out of `serveApi`, which sets it, or out of
   * the helper below, which was written for exactly this rule and which these two predate. The
   * blast radius is smaller than for the router's 401, because neither 401 nor 503 is
   * heuristically cacheable and it takes an intermediary configured to store them. It is still the
   * rule stated 130 lines down, broken in the two places the sentence did not reach.
   */
  override async fetch(request: Request): Promise<Response> {
    /* NOTHING THROWS OUT OF THE OBJECT (1 Nov): a call that threw past `serveApi`'s own catch, in the object's doors
       before it, left the runtime to log the fetch as an exception (`Record$ fetch /api/pulse error`) and the front door
       to make the 500. It is answered here with the same reference and plain sentence (`crashAnswer`). A restore still
       being armed and an object too busy are the front door's to answer, 503 each, so they go on up as they were. */
    let out: Response;
    try {
      out = await this.#answer(request);
    } catch (e) {
      if (restoring(e) || overloaded(e)) throw e;
      out = crashAnswer(request, e, (fields) => this.ctx.waitUntil(opsAlert(this.env, fields, alertClaim(this.env))));
    }
    /* A BODY NOBODY READ IS READ TO ITS END BEFORE THE ANSWER GOES. Every early answer here, and `serveApi`'s 404
       and 405, returned without touching the body the router was still streaming in, and the runtime then threw
       "Can't read from request stream after response has been sent" out of the request: `POST /api/<a typo>` with
       a body, or a `PUT` to a write, broke the object and the next request to the record answered 500
       "Network connection lost". */
    return drained(request, out);
  }

  async #answer(request: Request): Promise<Response> {
    if (this.#gone) return json({ ok: false, refusal: DELETED }, 503);
    if (this.#armed) return json({ ok: false, refusal: RESTORING }, 503);
    const api = await this.#record();

    const refused = api.kernel.refused();
    /* EVERY 503 FOR A RECORD THIS BUILD REFUSES WRITES ITS `refuse` LINE (`53 §2.3`), which the migration-refusal alert
       counts: the code says which way the record and the build disagree, and the id says which record. */
    if (refused) {
      op({ op: 'refuse', rec: recOf(api), code: refused.code }, 'error');
      this.ctx.waitUntil(opsAlert(this.env, { op: 'refuse', rec: recOf(api), code: refused.code }, alertClaim(this.env)));
      return json({ ok: false, refusal: refused }, 503);
    }

    /* The context arrives from the Worker, which did the authentication. The record does the
       AUTHORISATION — every permission check is inside `createRecordApi`, one place, so the CLI and
       the MCP server answer to the same ladder as the browser. */
    /* A CONTEXT PAST THE CAP IS REFUSED IN ITS OWN SENTENCE BEFORE ANYTHING PARSES IT (`ctxOversize`). */
    const over = ctxOversize(request.headers);
    if (over) {
      const out = { ok: false as const, refusal: over };
      return json(out, httpStatus(out));
    }
    const ctx = JSON.parse(request.headers.get(CTX_HEADER) ?? 'null') as CallContext | null;
    if (!ctx) return saidUnauthorized('record', 'This BrainDog needs a caller.');

    /* `/mcp` READS ITS BODY HERE. The router checked the bearer from the headers alone, so nothing a stranger
       sent is parsed, and the tools reach this record through the same methods `/api` calls. */
    if (servesMcp(new URL(request.url).pathname)) return serveMcp(request, api, ctx, this.env.PUBLIC_HOST ? `https://${this.env.PUBLIC_HOST}` : undefined, this.env.BRAINDOG_BUILD || undefined);

    /* A KEPT COPY'S DOOR ANSWERS AS THE LIST DOES, and not `ROUTE_UNKNOWN`. See `copyAsked`. */
    const copy = copyAsked(request.method, new URL(request.url).pathname);
    if (copy !== null) {
      const out = await copyRefusal(copy, () => api.snapshots(ctx));
      return json(out, httpStatus(out));
    }

    /**
     * SLASH'S ASK, AND THIS BRANCH IS THE WHOLE OF WHAT WAS MISSING. The dependency, the builder and the door
     * were each added without it, and driving the door found the only callers were the tests naming them. `slash.ts` says where the mount belongs
     * in its own words, and this is that place: beside `servesMcp`'s branch and before `serveApi`, because
     * `servesApi` is a prefix test and `/api/slash/read` reaches this object already, where `serveApi` would
     * answer it `ROUTE_UNKNOWN: There is no method called slash/read.`
     *
     * A FIELD AND NOT A LOCAL, for the reason `slashAskDoor` caches on the door it returns: a door built per
     * request runs `createSlash`'s two `CREATE TABLE IF NOT EXISTS` and its settings insert on every question.
     */
    if (servesSlash(new URL(request.url).pathname)) {
      /* A PERSON AND NOBODY ELSE, AS THE SECOND LOCK. The router refuses a bearer at this path, but the context is
         the only thing this object is told about the caller, and `inward()` has already taken the header the door
         would look for, so a token context forwarded here by any other branch would be answered as a person. */
      if (ctx.principal.kind !== 'person') return json({ ok: false, refusal: NO_SLASH_TOKEN }, 403);
      /* AND A SIGNED-IN PERSON, NOT MERELY A PERSON. The public demo's context was a person too, `p_demo` at `read`,
         and this lock answered it 200 with one model call, which on a live host opens the owner's `slash` key and
         spends the record's `ask_cap` for somebody who never signed in (`test/slash-demo.test.ts`). The demo is gone and the lock stays: the object is where the record
         decides who is asking, and a session's context says `credentialed: true`, so anything short of it is not one. */
      if (ctx.credentialed !== true) return json({ ok: false, refusal: NO_SLASH_UNSIGNED }, 403);
      this.#slash ??= workerSlashDoor(
        this.env,
        () => api,
        { sql: guardedSql(this.ctx.storage), clock: { now: () => Date.now() }, plan: () => this.#planOf(api), onFail: (fail) => this.#modelFailed(api, fail) },
        new Set([`https://${this.env.PUBLIC_HOST ?? ''}`]),
        /* A CONVERSATION'S TOOLS, over this record as the asker, the ladder's reading of a write asked of the record's own
           SQLite, which is this object's storage. */
        (asker) => slashTools(api, asker, { sql: guardedSql(this.ctx.storage), person: asker.principal.kind === 'person' ? asker.principal.id : null }),
      );
      /* `GET /api/slash/health` READS THE SAME LEDGER THE RECORD'S `engineHealth` DOES, so Settings and a read token are
         told one thing. Handed per request, since `#open` sets it and the door is built before it may be read. */
      return serveSlash(request, { ...this.#slash, health: this.#engineHealth }, ctx);
    }

    /* SLASH'S DAILY LOOK, beside the answer and not in its way: the record says whether it is due, at most once a UTC day.
       NEVER WHILE LAPSED: no Slash ask starts on a lapsed record, and the alarm already
       skips this call for the same reason, so a read must skip it too. */
    /* BUT NEVER FOR THE VERSION POLL. An open tab asks `/api/version` every 1.5 s while it has focus
       (`apps/web/src/lib/data/live.ts`), and the poll is the one call that must stay one `MAX(rowid)`: a daily look
       woken by it would put Slash's model calls behind a question that only asks whether anything changed. The alarm
       and every other read still start it. NOR FOR `boot`, the first call of every open: the look's first run of the day
       landed on it, and every call after waited. */
    const path = new URL(request.url).pathname;
    /* AND THE LOOK IS ONLY ASKED HERE, NEVER RUN (`slashDue`): work due wakes the alarm now, which does it in slices. */
    if (!pollAsked(request.method, path) && !/^\/+api\/+boot\/*$/u.test(path) && !(await this.lapsed())) this.ctx.waitUntil(this.#lookSoon(api));
    /* AND DOORS STILL TO BE TOLD ASK FOR THE ALARM THAT TELLS THEM (`#doors`): one boolean in memory once they are told. */
    if (this.#doorsDue === true) this.ctx.waitUntil(this.#soon());
    /* THE METHOD ROUTER'S HANDLERS, WITH THE KEYCHAIN PASSPHRASE'S TWO ROUTES ANSWERED THROUGH THE ROOT KEY INSIDE THIS OBJECT
       (`withKeychainPassphrase`), which takes the passphrase off before the record is called. Built once, so both calls
       below serve the same table. */
    const handlers = withKeychainPassphrase(handlersFor(api), api, passphraseRoot(this.env.KEK, () => api.kernel.identity()?.id ?? null));
    /* A RESTORE THE PORT HAS ARMED ENDS THIS OBJECT, and nothing is written here from the arm on: `#arming` sets `#armed`
       as the bookmark is armed, which is before `restore` answers, and the Worker's `reopen` ends the object after. */
    /* A WEBHOOK TOKEN MINTED AGAIN IS A DOOR CHANGED, told to the Directory by the alarm it asks for (DR1, `#doors`). */
    if (request.method === 'POST' && MINT_PATH.test(path)) {
      const out = await serveApi(request, handlers, ctx);
      if (out.ok) this.ctx.waitUntil(this.#doorsMark(true));
      return out;
    }
    if (!restoreAsked(request.method, new URL(request.url).pathname)) return serveApi(request, handlers, ctx);
    /* AND THE OBJECT KEEPS WHAT ITS RESTORE SAID, in case the Worker never comes back to say it (`#left`). Counted in
       flight until the answer is read, so `stranded` cannot hand the next request an object this restore is still in. */
    this.#restoring++;
    try {
      const out = await serveApi(request, handlers, ctx);
      if (this.#armed) this.#left = await restoredOf(out, actorOf(ctx));
      return out;
    } finally {
      this.#restoring--;
    }
  }
}

/**
 * The Directory: one object for the whole installation.
 *
 * ONE INSTANCE, ALWAYS `idFromName('directory')`. It is the tenant map — which name means which
 * record, and which records a person reaches — and two of them would be two maps that disagree.
 * The throughput of a single writer is the documented ceiling (ADR-061); sharding by email prefix
 * is the documented next step, and neither is a thing to build before the first customer.
 *
 * IT HOLDS NO RECORD LOGIC, and its schema is `@braindog/record/directory` so the self-host runs
 * the same file over `directory.sqlite`.
 */
export class Directory$ extends DurableObject<Env> {
  #dir: Dir | null = null;
  /** The MAC key, derived before any call is answered, or `null` when sign-in is off. */
  #mac: Uint8Array | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    /* DERIVED UNDER THE BLOCK, so the first call already has the key it is checked with: HKDF is
       asynchronous and `createDirectory` is not. Shorter than 32 characters is off, like unset, because
       every session is an HMAC under it and a short secret is a guessable one. */
    void ctx.blockConcurrencyWhile(async () => {
      const secret = env.SESSION_SECRET ?? '';
      this.#mac = secret.length >= 32 ? await deriveSessionKey(new TextEncoder().encode(secret)) : null;
    });
  }

  #directory(): Dir {
    if (this.#dir) return this.#dir;
    const mac = this.#mac;
    const host = this.env.PUBLIC_HOST ?? '';
    /* `RP_ID` NAMES A PARENT OF THE HOST, so a passkey made at `app.brain.dog` is still offered at `brain.dog` once the
       app moves there. A name the host is not under is no passkeys at all rather
       than a ceremony every browser fails, and unset is the exact host, which is what this was. */
    const rp = host ? relyingParty(`https://${host}`, this.env.RP_ID) : null;
    this.#dir = createDirectory(
      guardedSql(this.ctx.storage),
      { now: () => Date.now() },
      mac
        ? {
            mac,
            ...(rp ? { rp } : {}),
            magic: Boolean(this.env.AUTH_MAIL_FROM && this.env.EMAIL),
            /* The reason a sign-in failed, for the operator's tail. A flow and a word, never who or with what. */
            log: (line) => op({ op: 'auth', flow: line.flow, ok: false, why: line.reason }, 'error'),
            /* A SWITCH ASKS THE RECORD ITSELF, over RPC to its own object by id: `dir_member` still lists somebody
               `removeMember` took off it, and moving their browser there would answer "opened" to a record that
               refuses every read. */
            admits: async (record, person) => (await this.env.RECORD.get(this.env.RECORD.idFromName(record)).access(person)) !== null,
          }
        : undefined,
      /* WHETHER A REFUSAL ON FREE MAY NAME A PLAN TO MOVE TO, the answer `/account/billing` gives as `open`. */
      { sells: sells(this.env), teamsHeld: this.env.TEAMS_HELD === '1' },
    );
    /* `createDirectory` imported its own copy, so this was the last one held as bytes. */
    mac?.fill(0);
    this.#mac = null;
    return this.#dir;
  }

  /**
   * Sign-in, whole: `/auth/*` arrives as an `AuthCall` and leaves as an `AuthResult`. And `session` with a `slug`, which
   * is how a request under `/<slug>` learns whether that name is this person's before any record is addressed.
   */
  auth(call: AuthCall | SessionAsk | SignupCall | AccountCall): Promise<AuthResult> {
    return this.#directory().auth(call);
  }

  /** The sign-up codes, minted, listed and ended: the operator's door only (`/account/ops/invite`). */
  invites<C extends InviteCall>(call: C): Promise<InviteAnswers[C['flow']]> {
    return this.#directory().invites(call);
  }

  /** Asking for an invitation: `apply.submit` from `/auth/apply`, the rest from `/account/ops/applications` and `/account/ops/invite`. */
  applications<C extends ApplyCall>(call: C): Promise<ApplyAnswers[C['flow']]> {
    return this.#directory().applications(call);
  }

  /** A visit counted (`seen.count`, from `/api/seen`) and the operator's week totals (`funnel.read`, from `/account/ops/funnel`). */
  seen<C extends SeenCall>(call: C): SeenAnswers[C['flow']] {
    return this.#directory().seen(call);
  }

  /** The host's last restore drill: `put` by the operator's door only (`/account/ops/drill`), `read` for `GET /account/drill`. */
  drill(call: DrillCall): HostDrill | null {
    const drill = this.#directory().drill;
    if (call.op === 'read') return drill.read();
    /* THE NEWEST BY WHEN IT RAN IS KEPT, and the check and the write are one step in here, so two posts out of order
       cannot both find nothing newer (`olderDrill`). */
    if (!olderDrill(call.drill, drill.read())) drill.put(call.drill);
    return drill.read();
  }

  /** When a person's account was made, in epoch milliseconds, or `null` for nobody: a new account may Allow without a second sign-in. */
  madeAt(person: string): number | null {
    const at = Date.parse(this.#directory().person(person)?.created_at ?? '');
    return Number.isNaN(at) ? null : at;
  }

  /** The live name of a record, or `null` for one with none: where `GET /` sends a session back to. */
  slugOf(record: string): string | null {
    return this.#directory().slugOf(record);
  }

  /**
   * The operator's first half: the name and the person, checked and made, before any record exists. A
   * refusal when the name cannot be had, and nothing has been written then.
   */
  prepare(slug: string, email: string, name: string | null): { person?: { id: string; email: string; name: string | null }; refusal?: Refusal } {
    const d = this.#directory();
    const wrong = d.bad(slug);
    if (wrong) return { refusal: { code: 'VALUE_MALFORMED', fix: wrong, at: 'slug' } };
    const held = d.claimed(slug);
    if (held === 'taken') return { refusal: { code: 'ALREADY_KNOWN', fix: `${slug} is already somebody's BrainDog here.`, at: 'slug' } };
    if (held === 'released')
      return { refusal: { code: 'ALREADY_KNOWN', fix: `${slug} was the name of another BrainDog and is never given out again.`, at: 'slug' } };
    const person = d.person$(email, name ?? undefined);
    if (!person.ok) return { refusal: refusalOf(person) };
    return { person: { id: person.value.id, email: person.value.email, name: person.value.name } };
  }

  /**
   * The operator's second half, once the record exists: the name now points at it. `null` is named.
   *
   * NOT `name`, WHICH IS THE STUB'S OWN. A Durable Object stub carries `name` as a property, the name its id
   * came from, so calling it through the stub read that and threw "is not a function": every `/auth/provision` made
   * a record, answered 500, and left the Directory naming nothing.
   */
  nameRecord(slug: string, email: string, record: string): Refusal | null {
    const named = this.#directory().provision({ slug, email, record });
    return named.ok ? null : refusalOf(named);
  }

  /** A deleted record's names, released. `null` is released; a refusal is a record the Directory does not hold. */
  close(record: string): Refusal | null {
    const out = this.#directory().close(record);
    return out.ok ? null : refusalOf(out);
  }

  /** Whether a record's scheduled action may run now: `null`, or until when it waits and why. A record's alarm asks before each run. */
  mayRun(record: string, action: string, pending = 0): { until: number; say: string } | null {
    return this.#directory().mayRun(record, action, pending);
  }

  /**
   * The note this record's owner is owed about its month, once, or `null` when nothing is owed. A record's
   * alarm asks after each pass it meters (`noticePass` in `@braindog/host/actions`), which decides who is told.
   */
  notice(record: string): UsageNotice | null {
    return this.#directory().notice(record);
  }

  /** Count one run a record's alarm metered. `null` is counted, already counted or too old to count; a refusal is a row that is not a run. */
  meter(record: string, run: RunUsage): Refusal | null {
    const out = this.#directory().meter(record, run);
    return out.ok ? null : refusalOf(out);
  }

  /** Count a batch of one record's runs, at most `METER_MANY_MAX`: the nightly replay's call (`Record$.meterReplay`). */
  meterMany(record: string, runs: readonly RunUsage[]): Result<MeterTally> {
    return this.#directory().meterMany(record, runs);
  }

  /** A record's Slash asks by UTC day, at most `SLASH_DAYS` of them: the nightly walk's call through `Record$.meterReplay`. */
  meterSlash(record: string, days: readonly SlashDay[]): Result<SlashTally> {
    return this.#directory().meterSlash(record, days);
  }

  /** One more sign-up reading today under `key`, and whether it is within `most` (`first-read.ts`'s `MeterStore`). */
  firstReadHit(key: string, day: string, most: number): boolean {
    return this.#directory().firstReadHit(key, day, most);
  }

  /** One more hit in a counted window, and whether it is within `most` (`abuseHit` in the Directory; the table is `@braindog/host/abuse`). */
  abuseHit(key: string, seconds: number, most: number, cost: number): { ok: boolean; retryAfter: number } {
    return this.#directory().abuseHit(key, seconds, most, cost);
  }

  /** How many trials agents ran on `record` since midnight UTC of `at`: the record's daily cap of twenty (`script-try-cap.ts`). */
  trialsToday(record: string, at: number): number {
    return this.#directory().trialsToday(record, at);
  }

  /** `GET /account/usage`: what the records this person owns used between two days. */
  usage(person: string, range: { from: string; to: string }): Result<AccountUsage> {
    return this.#directory().usage(person, range);
  }

  /**
   * Who pays for which record, and whether it has lapsed: `createDirectory`'s `billing` group, one RPC for all of it,
   * as `auth` is for sign-in.
   *
   * THE WEBHOOK AND THE NIGHT WRITE THROUGH IT AND NOTHING ELSE DOES. Only a verified Stripe event may move a record
   * into or out of a lapse, so a route never hands a caller's body to this method; the doors that only read ask `of`,
   * `for` and `lapsed`.
   */
  billing<C extends BillingCall>(call: C): BillingAnswers[C['op']] {
    return this.#directory().billing(call);
  }

  /** Put a record on a plan: billing's webhook, when a payment moves a record to Cloud or Cloud Plus (`billing.ts`). `null` is set. */
  setPlan(record: string, plan: Plan): Refusal | null {
    const out = this.#directory().setPlan(record, plan);
    return out.ok ? null : refusalOf(out);
  }

  /**
   * OAuth's store, one RPC for all of it, as `billing` is (`answerOAuth` in `@braindog/record/oauth`).
   * `serveOAuth` in `oauth.ts` calls it and nothing else does.
   *
   * ON THIS OBJECT'S STORAGE AND OUTSIDE `createDirectory`, because the store's tables are its own and made on first use:
   * the Directory never names them. Synchronous, so a `take` or a `redeem` reads and deletes its row with no yield
   * between, and a code is spent once however many requests race for it. `#directory()` FIRST, so the lockout's
   * `dir_fail` exists on a Directory that has never been opened, since the per-address count writes to it.
   */
  oauth<C extends OAuthCall>(call: C): OAuthAnswers[C['op']] {
    this.#directory();
    return answerOAuth(guardedSql(this.ctx.storage), { now: () => Date.now() }, call);
  }

  /**
   * Whether this address is a record this installation created, and has not closed.
   *
   * IT IS ASKED ABOUT AN ID RATHER THAN A NAME, which is why answering is safe: a slug is a word
   * somebody chose and an id is 26 random characters, so this tells a caller nothing they did not
   * already have. What it prevents is the router addressing an object that does not exist — and on
   * this platform, addressing one is creating one.
   */
  knows(record: string): boolean {
    return this.#directory().knows(record);
  }

  /**
   * The record a forwarded message's token names, by the token's SHA-256 in hex, or `null`.
   *
   * `/in/email/<token>` IS THE ONE ARRIVAL WHOSE PATH NAMES NO RECORD, so this is the whole of the
   * routing for it: `arrivals` hands what comes back through the same two refusals a webhook's path
   * segment goes through before it can become an argument to `idFromName`.
   *
   * IT IS ASKED WITH A DIGEST AND NEVER WITH THE TOKEN, and that is not a courtesy to the Directory.
   * The digest is what `serveIngest` computes from the path, so the tenant map stores and is queried
   * with 64 hex characters that open nothing: a copy of the Directory's storage is not a set of
   * mailbox keys. Answering is not an oracle either, for `knows`'s reason above: the answer is 26
   * random characters, and whoever asked already had the token that produced it.
   */
  recordFor(tokenHash: string): string | null {
    return this.#directory().recordFor(tokenHash);
  }

  /**
   * A record's forwarding address, registered, rotated or taken away: a digest writes it, `null` empties it.
   * `null` back is written, and a `Refusal` is a write that did not happen.
   *
   * THE OTHER HALF OF `recordFor`, AND IT WAS MISSING FOR A DAY. `feefa3f4` put the reader above on this object
   * and left the writer off it, so the index this Worker reads on every forwarded message was one nothing in
   * the deployment could write: measured by grepping `apps/` and `packages/` for `inbound$`, whose
   * only callers were tests. `/api/inbound/mint` is the caller that needed it (`inbound.ts`).
   *
   * IT TAKES THE DIGEST AND CANNOT BE HANDED A TOKEN, which `inbound$` refuses with a sentence rather than
   * trusting its callers. So the tenant map holds 64 hex characters that open nothing, and this RPC hop carries
   * nothing that would open a door if it were logged at either end.
   */
  inbound$(record: string, tokenHash: string | null): Refusal | null {
    const out = this.#directory().inbound$(record, tokenHash);
    return out.ok ? null : refusalOf(out);
  }

  /**
   * What verifies one webhook door of a record, as the record just answered it: a token's digest, `'signed'`, or `null`
   * to forget the door (RD1). Never handed a token, which `door$` refuses. The arrival door's hold teaches it.
   */
  door$(record: string, ingest: string, sign: string | null): Refusal | null {
    const out = this.#directory().door$(record, ingest, sign);
    return out.ok ? null : refusalOf(out);
  }

  /**
   * Every webhook door of a record, as the record reads them itself (DR1): told from its alarm once a deploy and after a
   * mint (`Record$` `#doors`), so the hold knows a door before its first arrival. Digests and `'signed'` only.
   */
  doors$(record: string, doors: { ingest: string; sign: string }[]): Refusal | null {
    const out = this.#directory().doors$(record, doors);
    return out.ok ? null : refusalOf(out);
  }

  /** Whether an open record's door is verified by `sign`: what the hold asks before it keeps an arrival (RD1). */
  doorHolds(record: string, ingest: string, sign: string): boolean {
    return this.#directory().doorHolds(record, ingest, sign);
  }

  /**
   * Every record on this deployment that is still open, a page at a time. `51 §5.12` step 1.
   *
   * THE CURSOR IS THE LAST ID AND NOT AN OFFSET. A keyset page is stable while the walk runs: a
   * record provisioned at 03:18 shifts every offset after it by one, and an `OFFSET` walk would
   * skip the record that moved across the page boundary and never say which one.
   *
   * IT READS `dir_record` DIRECTLY, AND THAT IS A SEAM THIS FILE SHOULD NOT HOLD FOR LONG.
   * `createDirectory` in `packages/record/src/directory.ts` owns every other query against these
   * tables and has no `listRecords`; adding one there was not possible in the change that needed it.
   * The SQL below is the whole of the duplication, it is over the same storage the Directory writes,
   * and it belongs in `createDirectory` the moment that file can be edited.
   */
  listRecords(cursor?: string, limit = 500): { ids: string[]; cursor?: string } {
    /* THE MIGRATION FIRST. `dir_record` is made by `createDirectory`, so a Directory object whose
       first ever call was this one would read a table that does not exist yet. */
    this.#directory();
    const rows = guardedSql(this.ctx.storage).all<{ id: string }>(
      'SELECT id FROM dir_record WHERE closed_at IS NULL AND id > ? ORDER BY id LIMIT ?',
      cursor ?? '',
      limit,
    );
    const ids = rows.map((r) => r.id);
    /* A FULL PAGE MEANS THERE MAY BE MORE, and a short one means there is not. Asking for one extra
       row to be sure would be a second answer to "how big is a page" for one saved round trip a night. */
    return ids.length === limit ? { ids, cursor: ids[ids.length - 1] ?? '' } : { ids };
  }

  /**
   * The records closed before `cutoff` (epoch milliseconds), a page at a time: the night's list of prefixes whose final
   * copies have been kept as long as `FINAL_KEPT_DAYS` promises (`nightly.ts`). The query is `createDirectory`'s own.
   */
  closedBefore(cutoff: number, cursor?: string): { ids: string[]; cursor?: string } {
    return this.#directory().closedBefore(cutoff, cursor);
  }

  /**
   * The Directory's carried tables as lines, for the night's sealed copy (`directory-copy.ts`).
   * Sessions, links, challenges and strikes are left out by `createDirectory`, so a copy signs nobody in.
   */
  dump(): string[] {
    return this.#directory().dump();
  }

  /**
   * A copy's lines, into this Directory, which must be empty: the one way back from losing it. AN RPC AND NEVER A ROUTE.
   *
   * NOTHING CALLS IT YET BUT A TEST, AND THAT IS SAID RATHER THAN HIDDEN. The operator's path to it, a copy opened with
   * the backup identity and handed to a Directory that has just been emptied, is a script nobody has written, and a
   * route would be a door that replaces the tenant map. `load` refuses a Directory anybody has used, so an RPC here
   * cannot merge two maps whoever calls it.
   */
  load(lines: string[]): Result<{ tables: number; rows: number }> {
    return this.#directory().load(lines);
  }

  /** Which record this name means, or `null` if it means none. The hop, and the whole of it. */
  resolve(slug: string): { record: string; slug: string } | null {
    return this.#directory().resolve(slug);
  }

  /** Who owns a record this installation holds open, or `null`: the operator's gift door asks it (`ops-plan.ts`). */
  ownerOf(record: string): string | null {
    return this.#directory().ownerOf(record);
  }

  /**
   * Whether a name is free, a live record's or a released one's: what billing's checkout asks before anybody pays
   * (`billing.ts`).
   *
   * NOT NAMED `claimed`, WHICH IS THE DIRECTORY'S OWN METHOD AND NOT THIS CLASS'S TO EXPOSE UNDER THE SAME WORD:
   * `route.test.ts`'s `stubSurface` reads the class body and asserts `person$`, `provision`, `claimed` and `bad` never
   * appear there, each one a real method of `createDirectory` this class keeps to itself and reaches only from inside
   * `prepare` and `nameRecord`. A method here named `claimed` would be the wrong object read by that guard, worthless
   * from then on, so checkout's own need for the same check is answered under a name the Directory does not use.
   */
  slugClaimed(slug: string): 'free' | 'taken' | 'released' {
    return this.#directory().claimed(slug);
  }

  /** An address that can already sign in: a person with a passkey or a record. `/auth/invite` sends them to sign in first. */
  inviteKnown(email: string): boolean {
    this.#directory();
    return Boolean(guardedSql(this.ctx.storage).one(KNOWN_ADDRESS, email));
  }

  /**
   * The person an invitation makes, found or made by address, under the name the page sent if the row is new.
   *
   * THE NAME GOES IN AND COMES BACK OUT. This called `person$(email)` with one argument and answered `{ id, email }`,
   * so a name typed on the invitation page never reached the Directory and could not reach the record's mirror,
   * which is the row People draws. `serveInvite` has already refused or cleared a hostile name before this runs.
   */
  invitee(email: string, name?: string): Result<{ id: string; email: string; name: string | null }> {
    const made = this.#directory().person$(email, name);
    return made.ok ? { ok: true, value: { id: made.value.id, email: made.value.email, name: made.value.name } } : made;
  }

  /** The record an accepted invitation names, reachable by its new member. */
  joinRecord(record: string, person: string): Result<null> {
    return this.#directory().join(record, person);
  }

  /** Whether a person may join a record as its plan has it, asked before an invitation is spent: `null` is yes (`joinable`). */
  joinable(record: string, person: string): Refusal | null {
    return this.#directory().joinable(record, person);
  }

  /** The plan a record is metered under, for the record's own object (`Record$.#planOf`), or `null` for one not held here. */
  planFor(record: string): Plan | null {
    return this.#directory().planFor(record);
  }

  /**
   * The record a removal named, no longer reached by the person removed. `forward()` calls it once the record has
   * accepted the removal.
   *
   * THE OWNER IS REFUSED AND STAYS: the Directory's `leave` will not take a record's owner off it, and `forward`'s
   * `leftDirectory` ignores that refusal because the record has already answered the removal.
   */
  leaveRecord(record: string, person: string): Result<null> {
    return this.#directory().leave(record, person);
  }

  /**
   * A person's own name, moved here after one of their records has accepted a rename. `forward()`'s
   * `renamedEverywhere` calls it once the record has said the new name was good, then carries it into every other
   * record this person reaches (`mirrorPerson`, `mirrorEverywhere`).
   */
  renamePerson(id: string, name: string): Result<Person> {
    return this.#directory().renamePerson(id, name);
  }

  /**
   * `POST /account/email`: a link good for a day, minted for a person's new sign-in address and not yet moved.
   * `packages/host/src/auth.ts`'s `EmailDoor.ask`, reached over RPC because only the Directory holds the address book.
   */
  emailAsk(person: string, email: string): Promise<Result<{ to: string; token: string | null }>> {
    return this.#directory().emailAsk(person, email);
  }

  /**
   * `POST /account/email/confirm`: the link spent, and the address moved in the Directory for every record this
   * person belongs to. `EmailDoor.move` (`packages/host/src/auth.ts`), which then mirrors the change into each record.
   */
  emailMove(person: string, token: string): Promise<Result<{ from: string; to: string; records: string[] }>> {
    return this.#directory().emailMove(person, token);
  }

  /**
   * Which records this person can reach at all. The switcher's index, and not an authorisation.
   *
   * WHAT THEY MAY DO INSIDE ONE IS THE RECORD'S OWN TABLE. Reading the level from here made `invite`
   * and `remove` write a table no authorisation path read — so removing somebody did not stop them
   * writing, and a bookkeeper given `read` on the payroll register wrote to it.
   */
  reaches(person: string): { record: string; slug: string | null }[] {
    /* AND IT NO LONGER RETURNS A LEVEL, because there is nothing keeping that level true. `invite`
       and `removeMember` write the RECORD's `member` table; `join` and `leave` write the Directory's
       `dir_member`. Nothing writes both. So the level here is whatever it was when somebody was
       first put on the record — a person removed a year ago still reads as `write`, and the field
       reads as an authorisation to anyone who finds it, which is precisely what the paragraph above
       spends four lines saying it is not. A type that cannot lie is better than a comment that says
       it does. */
    return this.#directory()
      .recordsOf(person)
      .filter((m) => !m.closed)
      .map((m) => ({ record: m.record, slug: m.slug }));
  }

  /**
   * The switcher's rows, finished: every open record this person can reach, each with its name and
   * the level they actually hold there. `GET /account/records`.
   *
   * `reaches` ABOVE STOPS AT WHICH; this asks each one what, over RPC to that record's own object,
   * through `idFromName(rec_id)` and never the slug, so a rename never changes which object answers
   * (ADR-061). `switcherRows` is `@braindog/record/directory`'s: it drops a record that answers with
   * no level and no lists, which is a person the Directory still lists and the record has since
   * removed, and keeps a one-list member with `level: null` and the lists they hold.
   */
  async recordsFor(person: string): Promise<SwitcherRow[]> {
    return this.#directory().switcherRows(person, (record) => this.env.RECORD.get(this.env.RECORD.idFromName(record)).switcherRow(person));
  }

  /**
   * Whether an ops mail of this kind may go now, and if so the window starts over (`opsAlert`, `alertClaim`).
   *
   * HERE BECAUSE THE DIRECTORY IS THE ONE OBJECT EVERY ISOLATE REACHES, and this Worker binds no KV. One key a kind in
   * the object's own storage, outside the tables the Directory's copy is made of.
   */
  async alertDue(kind: string, quietMs: number): Promise<boolean> {
    const key = `ops-alert:${kind}`;
    const now = Date.now();
    const last = await this.ctx.storage.get<number>(key);
    if (typeof last === 'number' && now - last < quietMs) return false;
    await this.ctx.storage.put(key, now);
    return true;
  }

  /**
   * The night's tally, kept by `nightly()` after the walk, for `/healthz` to say. One key, beside the alert
   * windows and outside the tables the Directory's copy is made of: a restore must not bring back an old night.
   */
  async nightDone(night: Night): Promise<void> {
    await this.ctx.storage.put(NIGHT_KEY, night);
  }

  /** The last night `nightDone` kept, or `null` before the first. */
  async night(): Promise<Night | null> {
    return (await this.ctx.storage.get<Night>(NIGHT_KEY)) ?? null;
  }

  /**
   * One sign-in letter's send, counted: `true` went, `false` met a fault of this host's. The last
   * `LETTERS_KEPT` are kept, newest last. An address's own fault never arrives here (`mailOutcome`), so the count says
   * nothing about who has an account.
   */
  async letterSent(went: boolean): Promise<void> {
    const kept = (await this.ctx.storage.get<boolean[]>(LETTERS_KEY)) ?? [];
    await this.ctx.storage.put(LETTERS_KEY, [...kept, went].slice(-LETTERS_KEPT));
    await this.ctx.storage.put(LETTERS_AT_KEY, Date.now());
  }

  /**
   * Whether sign-in mail is down: the last `LETTERS_DOWN_AFTER` sends all failed, the newest inside `LETTERS_FRESH_MS`.
   * What `/auth/methods` says as `magic: 'down'`. FRESH, OR IT NEVER COMES BACK UP: the page offers no link while mail is
   * down, so no send would ever succeed to clear it: a quarter hour after the last send, the link is offered again.
   */
  async lettersDown(): Promise<boolean> {
    const kept = (await this.ctx.storage.get<boolean[]>(LETTERS_KEY)) ?? [];
    const at = (await this.ctx.storage.get<number>(LETTERS_AT_KEY)) ?? 0;
    const last = kept.slice(-LETTERS_DOWN_AFTER);
    return last.length === LETTERS_DOWN_AFTER && last.every((went) => !went) && Date.now() - at < LETTERS_FRESH_MS;
  }
}

/** Where the Directory keeps the last night (`nightDone`), and the last sign-in sends (`letterSent`). */
const NIGHT_KEY = 'ops-night';
const LETTERS_KEY = 'ops-letters';
/** When the last sign-in letter was sent, so a run of failures stops saying mail is down once it is old. */
const LETTERS_AT_KEY = 'ops-letters-at';
const LETTERS_FRESH_MS = 15 * 60_000;
const LETTERS_KEPT = 20;
const LETTERS_DOWN_AFTER = 5;

/**
 * The last night for `/healthz`, from one Directory call, or `null` where the Directory did not answer.
 *
 * NEVER A THROW AND NEVER A 5xx: the probe's first question is whether this Worker answers, and it does. A Directory that
 * is down is `null` here and every other door's problem, said by them. NOT CACHED: one storage read on the one object
 * every isolate already wakes, and a watch that asks hourly, or a monitor a minute, costs a request each.
 */
async function nightOf(env: Env): Promise<Night | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    /* A DIRECTORY THAT IS SLOW IS ONE THAT DID NOT ANSWER: a probe that hung on it would read this Worker as down. */
    const late = new Promise<null>((done) => (timer = setTimeout(() => done(null), NIGHT_WAIT_MS)));
    return await Promise.race([env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).night(), late]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** How long `/healthz` waits on the Directory for the night before it answers `night: null`. */
const NIGHT_WAIT_MS = 1500;

/** The Directory's window over every isolate's ops mail, for `opsAlert`. */
const alertClaim =
  (env: Env) =>
  (slot: string, quietMs: number): Promise<boolean> =>
    env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).alertDue(slot, quietMs);

/**
 * One pass over one record’s outbox, with this deployment’s bindings behind it.
 *
 * THE BUILDING IS HERE AND THE PASS IS IN `pump.ts`. What this function contributes is two
 * transports out of `env` — which is the only part that needs the platform — and everything that
 * can go wrong in the pass itself is a plain function a bare Node process can run.
 */
async function drainOutbox(env: Env, id: string): Promise<void> {
  const record = env.RECORD.get(env.RECORD.idFromString(id));
  /* WEB PUSH ONLY WHERE BOTH HALVES ARE SET, which is where `delivers` leases one; nowhere else is a `notify.push` handed
     to this pass, so an unkeyed deployment reads neither var and signs nothing. The pair is proved once per pass, and
     a pair that is not one reaches every push as `vapidKeys`' sentence rather than as a 403 from each service. The
     contact address a push service writes to is the one this deployment already sends mail from. */
  const keyed = delivers(env).includes('notify.push');
  const deliver = makeDeliver({
    ...(keyed
      ? {
          push: {
            vapid: await vapidKeys(env.VAPID_PUBLIC ?? '', env.VAPID_PRIVATE ?? ''),
            subject: `mailto:${env.MAIL_FROM || env.AUTH_MAIL_FROM || ''}`,
            send: fetchPush,
            target: leasedTarget(async (args) => (await record.pushTargetFor(args)) as unknown as Result<PushAddress | null>),
          },
        }
      : {}),
    ...(env.EMAIL === undefined ? {} : { email: (m: Mail) => env.EMAIL!.send(m) }),
    from: env.MAIL_FROM || env.AUTH_MAIL_FROM,
    support: env.SUPPORT_ADDRESS,
    /* EVERY JOB THAT WAS SENT, COUNTED IN THE ACCOUNT'S LEDGER AND NEVER LIMITED, by the record's own object, which knows
       the record id the ledger is keyed by. The kind and the id cross the RPC and nothing of the payload does. */
    counted: (job) => record.countDelivery({ id: job.id, kind: job.kind }),
    /* A FILE DELETED FROM `BLOBS`, FOR AN `erase.r2` JOB. `id` here is the Durable Object's own hex id, and the
       bytes live at `rec_<id>/a/<sha256>`, so the record's own id is asked of the object once, over the same RPC as
       `counted` and `pushTargetFor` above. Absent when this deployment has no bucket, or the object could not say its
       id, and then an erasure dead-letters saying so rather than doing nothing silently. */
    ...(env.BLOBS === undefined
      ? {}
      : {
          erase: async (sha256: string, page?: boolean) => {
            const recId = await record.recId();
            if (recId === null) throw new Error('This BrainDog could not say its own id, so nothing was deleted.');
            await env.BLOBS!.delete(page === true ? `${pagesPrefix(recId)}${sha256}` : fileKey(recId, sha256));
          },
        }),
    /* THE KEY A POST NAMES, OPENED UNDER ITS LEASE BY THE RECORD AND UNWRAPPED HERE. `KEK` is read only when a post
       names a key, so a deployment with a malformed one still sends its email. */
    open: leasedOpener(
      async (args) => (await record.sealFor(args)) as unknown as Result<{ record: string; seal: LeasedSeal }>,
      () => keyStoreOf(env.KEK),
    ),
    /* `redirect: 'manual'` AND A TIMEOUT, and both are the difference between a validated URL and a
       validated request. `postable()` checks the address it is handed and `fetch` followed a 302
       wherever it pointed — so a webhook that answers `302 -> http://169.254.169.254/…` reached
       the metadata service, and a 307 replayed the POST BODY at it. The check would have refused
       that address; the redirect walked round the check.

       AND A REQUEST THAT NEVER RETURNS IS A LEASE THAT EXPIRES UNDER SOMEBODY. Twenty seconds is
       well inside the sixty-second notify lease, so a slow endpoint fails and retries rather than
       being delivered twice by two workers who both think they hold it. */
    post: async (url: string, body: string, headers: Record<string, string>) => {
      const out = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });
      /* A 3xx IS A FAILURE, not a success with an unread body: the endpoint that was declared is not
         the endpoint that answered. */
      return { ok: out.status >= 200 && out.status < 300, status: out.status };
    },
  });

  /* AND AN ACK THAT WOULD NOT LAND RINGS AGAIN. `pump` leaves such a job `leased` and moves on,
     because "the lease expires and the job is reclaimed" — which is true on the self-host, where a
     fifteen-second poller reclaims it. This Worker has no poller: reclaiming needs a `lease()`, which
     needs the doorbell, which `tail()` rings only when `pendingWork().outboxPending` is true — and
     that counts `pending` rows, not `leased` ones. So the job waited for the record's NEXT
     deliverable row to ring for it, which on a quiet record is indefinitely.

     ONE RING, NOT A LOOP. The lease is still held when this fires; the redelivery arrives after
     Cloudflare's own delay, by which time it has expired and `leaseOutbox` reclaims it. */
  /* A LAPSED RECORD'S DIGESTS ARE ACKED DONE AND UNSENT, and its other notifications go (`lapseDrops`): a reminder is
     a date the lapse is no reason to miss. Asked once a pass, of the object's own flag. Nothing is counted for a job
     that was not sent, because `counted` is `deliver`'s and runs only after a send. */
  const lapsed = await record.lapsed();
  const pass = await pump(record, lapsed ? async (job) => (lapseDrops(job) ? undefined : deliver(job)) : deliver);
  if (pass.unacked > 0) await env.INGRESS.send({ record: id });
}

/**
 * The bearer path's three calls, over this deployment's objects.
 *
 * WHERE A CALL CAME FROM IS THE BRANCH THE ROUTER TOOK, never the path read again. A path is the caller's
 * to write, and `includes('/mcp')` once made `POST /api/list/mcp` record `mcp` on a token: a forgeable line
 * in the one place a person decides what to revoke.
 */
function bearerDeps(env: Env): BearerDeps {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return {
    knows: (id) => directory.knows(id),
    /* THE DIRECTORY'S ROW AND NOT THE OBJECT'S FLAG, as the session's `lapsed` is, so both doors cap on one fact. A record
       with no billing row answers `false` and is never capped. */
    lapsed: async (id) => ((await directory.billing({ op: 'lapsed', record: id })) as unknown) === true,
    verify: (id, bearer, surface, build) => held(env, id, (record) => record.verify(bearer, surface, build)),
    access: (id, person, token) => held(env, id, (record) => (token === undefined ? record.access(person) : record.access(person, token))),
    /* THE TWO ABOVE IN ONE TRIP TO THE RECORD, which is what the bearer path asks (`Record$.admit`). */
    admit: (id, bearer, surface, build) =>
      held(env, id, (record) => record.admit(bearer, surface, build)) as ReturnType<NonNullable<BearerDeps['admit']>>,
    /* ASKED ONLY UNDER `/<slug>`, to hold the path to the record the bearer names. */
    named: async (slug) => (await directory.resolve(slug))?.record ?? null,
    /* ASKED ONLY AT THE FOUR PATHS AN OPERATION OPENS, because asking spends it (`session.ts`). An armed record rejects
       before its grant is read, so the ask again after a reset spends it once, and a 503 spends nothing. */
    operation: async (id, bearer) => {
      const out = (await held<unknown>(env, id, (record) => record.operationGrant(bearer))) as Result<OperationGrant>;
      return out.ok ? { method: out.value.method, person: out.value.person, binds: out.value.binds ?? null } : null;
    },
  };
}

/** The methods a runner calls, and the only paths `runnerOf` reads a bearer at. */
const RUNNER_METHODS: ReadonlySet<string> = new Set(['claimJob', 'postJobEvent', 'readCancel']);

/**
 * A runner's bearer on `/api`: the record it names and the context the record built from its own device grant, or
 * `null` for anything else.
 *
 * ONLY A POST TO ONE OF `RUNNER_METHODS`, for `operationAsked`'s reason in `session.ts`: a bearer sent anywhere else is
 * not asked about as a runner's, so a CLI's login token at `/api/boot` is never read twice. THE DIRECTORY FIRST, AS
 * `bearerOf` ASKS IT, because naming an object nobody holds creates it; and under `/<slug>` the name must be the
 * record the bearer names, or nothing is asked of any record.
 */
async function runnerOf(request: Request, env: Env, slug: string | null): Promise<{ record: string; ctx: CallContext } | null> {
  if (request.method !== 'POST') return null;
  const name = /^\/+api\/+([^/]+)\/*$/.exec(new URL(request.url).pathname)?.[1] ?? '';
  if (!RUNNER_METHODS.has(name)) return null;
  const authorization = request.headers.get('authorization');
  const record = recordOf(authorization);
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '')?.[1];
  if (record === null || bearer === undefined) return null;
  const deps = bearerDeps(env);
  if (!(await deps.knows(record))) return null;
  if (slug !== null && (deps.named === undefined || (await deps.named(slug)) !== record)) return null;
  /* `.runner`'S TYPE IS A CAST, not `object`'s: the stub's own RPC typing recurses through `CallContext`'s union
   * past TypeScript's instantiation depth, so the one property read that reaches it is pinned to the signature
   * `runner` is declared with above, and every other call through `object` stays checked as it was. */
  const runner = (object: DurableObjectStub<Record$>) => (object as unknown as { runner: (bearer: string) => Promise<CallContext | null> }).runner(bearer);
  const ctx = await held(env, record, runner);
  return ctx === null ? null : { record, ctx };
}

/** A rejection that is `Record$`'s armed refusal, `RESTORING`, and not a fault. Its sentence is the one thing that crosses. */
const restoring = (e: unknown): boolean => e instanceof Error && e.message.includes(RESTORING.fix);
/** The platform's "Durable Object is overloaded" rejection: the object's queue was full, so asking again soon is right. */
const overloaded = (e: unknown): boolean => e instanceof Error && ((e as { overloaded?: unknown }).overloaded === true || /Durable Object is overloaded/u.test(e.message));

/**
 * One call into a record, from a door that checks a credential there before anything is forwarded: `access`, `verify`,
 * `operationGrant` and `signingKey`.
 *
 * A RECORD LEFT ARMED IS FINISHED HERE, AND THEN ASKED AGAIN. These doors are what every request meets first, so they
 * are where a restore whose Worker never came back is found (`recoverRestore` in `route.ts`). The ask after the reset
 * reaches the object that came back and is answered as if nothing had been armed, which is what the caller wanted.
 * Measured in `test/restore-armed.test.ts`: without this, each of the four answered 500 until an eviction.
 *
 * A RECORD ARMED BY A RESTORE STILL RUNNING IS LEFT ALONE, and the rejection goes up to `fetch`, which answers it 503.
 * A REQUEST THAT LOST THE RACE TO THE RESET asks the object that came back once more, since it is no longer stranded.
 */
async function held<T>(env: Env, id: string, call: (record: DurableObjectStub<Record$>) => Promise<T>): Promise<T> {
  const stub = () => env.RECORD.get(env.RECORD.idFromName(id));
  try {
    return await call(stub());
  } catch (e) {
    if (!restoring(e)) throw e;
    const reset = await recoverRestore({
      stranded: async () => (await stub().stranded()) as Stranded | null,
      reset: () => stub().reopen(),
      restored: async (args) => (await stub().restored(args)) as unknown as Result<unknown>,
    });
    if (reset) return call(stub());
    /* NOT STRANDED ANY MORE: a request that found it first has reset it since this one was refused, so the object that
       came back is asked once, and a restore still running refuses this ask again and goes up as it did. */
    try {
      return await call(stub());
    } catch (again) {
      throw restoring(again) ? e : again;
    }
  }
}

/**
 * `no-store`, ON THE ROUTER'S OWN ANSWERS TOO.
 *
 * 33 §4 asks for it on all of `/api/*`, and `serveApi` sets it — but the 401, 403, 404 and 500 this
 * file writes never reach `serveApi`. A cached 401 is a person who signs in and still cannot get in;
 * a cached 403 is a person invited to a record who is told for an hour that they are not on it.
 *
 * AND ON THE OBJECT'S OWN TWO, WHICH THAT SENTENCE DID NOT REACH. `Record$.fetch` refuses before
 * `serveApi` in two places, a 503 for a kernel that is refused and a 401 for a request carrying no
 * context, and both were written by hand with a content-type and nothing else. `route()` ends with
 * `return record.fetch(inner)`, so what the object writes is what the client gets: those two were
 * the only answers on the whole surface without `no-store`. They call this from above it, which is
 * where the class is; a `const` at module scope is in scope for a method body that runs long after
 * this line is evaluated.
 */
const json = (body: unknown, status: number, extra: [string, string][] = []): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...extra],
  });

/**
 * `GET /.well-known/braindog-build`: which build this Worker version is, to anybody who asks.
 *
 * A DEPLOYMENT IS NOT A RECORD, and that distinction is the whole of why this route exists. The
 * `app` tuple also rides on `/api/version`, which is `READ+` and rightly so: that route answers what
 * changed in one customer's record, and it takes a bearer. `deploy-parity` was reading the build
 * through it, so the first production deploy that ran end to end went red with a 401 at the step
 * whose job is to prove the deploy landed. The two obvious repairs were both wrong: making a record
 * route public widens a boundary to answer a question that is not about records, and teaching the
 * check to shrug at a 401 makes a check that cannot see indistinguishable from one that found
 * nothing. So the fact moved to where it belongs instead.
 *
 * AN UNSET BUILD ANSWERS `null` AND NEVER `""`. `BRAINDOG_BUILD` is declared empty in
 * `wrangler.jsonc` so a deploy that forgot `--var` leaves an empty string rather than a missing
 * binding, and saying that out loud as `null` is what the record already does at `/api/version`. A
 * gate handed `""` reads a tuple that is merely unequal; handed `null` it reads a deployment that
 * was never told which build it is, which is the true thing.
 *
 * THROUGH `json()`, LIKE EVERY OTHER ANSWER THIS FILE WRITES, so it carries `no-store`. A cached
 * build id is a gate measuring an edge rather than the deploy, on the one request where that is the
 * entire question being asked.
 */
const buildId = (env: Env): Response => json({ app: env.BRAINDOG_BUILD || null, min_cli: MIN_CLI }, 200);

/**
 * The one answer to every way of not being let in.
 *
 * ONE SENTENCE FOR ALL THREE: no bearer, a bearer this record does not know, and a name no record
 * has. They were three different answers, and the difference between the third and the other two is
 * readable without any credential at all, because it said which names exist.
 *
 * AND THE SENTENCE SAID SOMETHING NOBODY COULD DO. `Mint one from the app` was measured against the
 * live host by reading it as a stranger would: whoever hits this IS at the app, there is
 * no sign-up on it, and the product's own changelog says so in as many words. So the one refusal
 * every agent and every developer meets first pointed them at a door that is not there.
 *
 * `10 §7` MAKES THE REFUSAL THE TEACHER, and what this one has to teach is which of the two
 * situations somebody is in: a token they can mint, on a record that has been provisioned, or a
 * host that is not open yet. It cannot tell them apart, because saying which record exists is the
 * thing the single sentence exists to avoid. So it says what is true of both, and names the one
 * place that is honest about which: the changelog, on the marketing site, with no credential
 * needed to read it.
 */
/* AND NOW IT SAYS ONLY `unauthorized`: the sentence and whether sign-in is on go to the log, and the
   body is the one 401 every door of this Worker answers, so nothing is taught to a stranger that the owner's log does not
   already hold. */
const unauthorized = (env: Env): Response =>
  saidUnauthorized('bearer', (env.SESSION_SECRET ?? '').length >= 32 ? 'a bearer this record does not know, sign-in on' : 'a bearer this record does not know, sign-in off');

/**
 * THE ONE 401 BODY (the rule "A `401` says only `unauthorized`."): every 401 this Worker answers
 * itself carries `{ code: 'UNAUTHORIZED', fix: 'unauthorized' }` and nothing else, and the reason goes to one
 * `op: 'unauthorized'` line, so a stranger learns nothing of which door or why (`scripts/fence.mjs` checks it).
 */
function saidUnauthorized(door: string, why: string): Response {
  op({ op: 'unauthorized', door, why });
  return json({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'unauthorized' } }, 401);
}

/**
 * A crash at the front door: a reference and no reason, through `crashed` (`@braindog/host`), the one function every
 * door answers a crash with.
 *
 * THE REASON USED TO GO TO WHOEVER ASKED. This answered `This request could not be answered: <what was thrown>.`, and a
 * Directory's driver sentence can name a row, which can hold an address, so a stranger who made the router throw read
 * it back. The caller now gets a reference; the reason goes to one `op: 'crash'` line under
 * the same reference, which names the door and never the whole path (`doorPath`), since a path can carry a token.
 *
 * THE LINE IS WRITTEN THROUGH `op` (`oplog.ts`), as every Worker line is, so an address the thrown sentence quoted is
 * replaced in the log as well as kept out of the answer, and the sentence is cut at the length every field is.
 *
 * `/mcp` ANSWERS IN JSON-RPC, `-32603` with the reference in `data`, as `packages/mcp/src/rpc.ts` answers a throw one
 * layer down: an MCP client reads an `error` object, and the `/api` envelope is a body it cannot place. The reference is
 * read back off the line `crashed` wrote, so the answer and the log cannot name two different ones.
 *
 * `alert` MAILS THE OPERATOR the same line's ref and door (`opsAlert`), throttled, inside the caller's `waitUntil`.
 */
function crashAnswer(request: Request, e: unknown, alert: (fields: { op: 'crash' } & Record<string, string>) => void): Response {
  let path = '/';
  try {
    path = new URL(request.url).pathname;
  } catch {
    /* A request whose URL does not parse crashed before any door, and `/` is the door it is logged under. */
  }
  let ref: unknown = null;
  const out = crashed(doorPath(path), e, (line) => {
    const said = JSON.parse(line) as Record<string, string>;
    ref = said['ref'] ?? null;
    op({ ...said, op: 'crash' }, 'error');
    alert({ ...said, op: 'crash' });
  });
  return servesMcp(path) ? json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'internal', data: { ref } } }, 500) : json(out, 500);
}

/**
 * A record too busy to take one more request: 503 with `Retry-After`, a line and no alert mail. A full queue is load,
 * not a fault; the client asks a read again after a short wait (`@braindog/client`, `call`).
 */
function busyAnswer(request: Request): Response {
  let path = '/';
  try {
    path = new URL(request.url).pathname;
  } catch {
    /* As `crashAnswer`: a URL that does not parse is logged under `/`. */
  }
  op({ op: 'busy', where: doorPath(path) });
  const wait: [string, string][] = [['retry-after', String(BUSY.retry_after)]];
  return servesMcp(path) ? json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'busy', data: { retry_after: BUSY.retry_after } } }, 503, wait) : json({ ok: false, refusal: BUSY }, 503, wait);
}

/** The methods that read, for a door with no route table to ask: `/auth/*`. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/** Which budget a record's call spends: `ROUTES`' `writes` for `/api/<method>` (`classOf`), and a read for anything else. */
const classAt = (pathname: string): LimitClass => classOf(/^\/+api\/+([^/]+)\/*$/.exec(pathname)?.[1]);

/**
 * The front doors' limit (`@braindog/host/limits`): `null` to go on, or the 429 `RATE_LIMITED` with `Retry-After`.
 *
 * ASKED ONCE THE DOOR IS KNOWN AND BEFORE THE REQUEST IS FORWARDED, so the key is who is asking (`limitKey`: the token,
 * the person, or the address where nobody has said) and the record's own work is never started for a caller over their
 * minute. Knowing a session or a bearer takes the Directory and the record's credential check, which are the price of
 * knowing whose minute it is; everything after them is what the limit saves.
 *
 * `RL_READ` AND `RL_WRITE` WHEN BOUND, AND NOTHING WHEN NOT (`Env`). A BINDING THAT THROWS OPENS THE DOOR and writes an
 * `op: 'limit'` line: a limiter that is down is not a reason to refuse every record, and each record still checks what
 * its caller may do.
 */
async function overLimit(env: Env, door: LimitDoor | null, request: Request, cls: LimitClass): Promise<Response | null> {
  const key = limitKey(door, request.headers.get('cf-connecting-ip') ?? '');
  try {
    const said = await bindingLimiter({ read: env.RL_READ, write: env.RL_WRITE, poll: env.RL_POLL, mcp: env.RL_MCP }).limit(key, cls);
    return said.ok ? null : refusedFor(said.retryAfter);
  } catch (e) {
    op({ op: 'limit', ok: false, class: cls, error: e instanceof Error ? e.message : String(e) }, 'error');
    return null;
  }
}

/**
 * One hit against a named abuse limit (`ABUSE`), counted in the Directory: `null` to go on, or the 429 with `retry_after`
 * and the plain line. `who` is the address or the record id the rule counts (`by`). `cost` is how much this hit weighs
 * (a file's bytes). A Directory that throws opens the door and writes an `op: 'limit'` line, as `overLimit` does: a counter
 * that is down is no reason to turn every stranger and every record away.
 */
async function abusive(env: Env, name: AbuseName, who: string, cost = 1): Promise<Response | null> {
  const wait = await abuseWait(env, name, who, cost);
  return wait === null ? null : refusedFor(wait);
}

/** The same count as the seconds to wait, or `null` to go on, for a door that answers in its own shape. */
async function abuseWait(env: Env, name: AbuseName, who: string, cost = 1): Promise<number | null> {
  const rule = ABUSE[name];
  try {
    const said = await env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).abuseHit(`rl:${name}:${who}`, rule.seconds, rule.most, cost);
    return said.ok ? null : said.retryAfter;
  } catch (e) {
    op({ op: 'limit', ok: false, class: name, error: e instanceof Error ? e.message : String(e) }, 'error');
    return null;
  }
}

/** The address Cloudflare wrote, which a caller cannot choose. */
const addressOf = (request: Request): string => request.headers.get('cf-connecting-ip') ?? '';

/**
 * The `/auth/*` doors a stranger can spend mail or a bot check on, by address, on top of the write budget and the
 * Directory's own lockouts. Only a POST is counted; a GET of the sign-up form is the read budget's.
 */
async function authAbuse(env: Env, request: Request): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const path = new URL(request.url).pathname.replace(/\/+/g, '/').replace(/(.)\/+$/, '$1');
  const name: AbuseName | null =
    path === '/auth/magic/start' ? 'signinLink' : path === '/auth/apply' ? 'apply' : path === '/auth/signup/start' || path === '/auth/signup/verify' ? 'signup' : null;
  return name === null ? null : abusive(env, name, addressOf(request));
}

/**
 * The Worker resolves WHO is asking, and the record decides what they may do.
 *
 * `idFromName(rec_id)` AND NEVER `idFromName(slug)` (ADR-061). The address is the record id, so
 * renaming is one row in the Directory and nothing else — no migration, no copy, and no window in
 * which half the writes go to the old object. Addressing the storage by the name would make a rename
 * a data migration, which is why nobody who does it ever renames anything.
 */
export default {
  /**
   * AND NOTHING A REQUEST CAN DO ESCAPES AS A BARE 500. 33 §4: "both hosts return the `Result`
   * envelope unchanged" — and this had no guard at all, so a Directory storage error, a malformed
   * URL or an RPC that failed mid-deploy came back as workerd's own 500 with an HTML-ish body, while
   * the self-host answered the same fact as `{ ok: false, refusal }`. A client cannot have one
   * branch for a refusal when one of its two hosts sometimes speaks a different language.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const began = Date.now();
    /* NO SESSION COOKIE IS TAKEN ON A LEGACY HOST, and one sent there is cleared (`legacyRequest`). */
    const old = legacyRequest(request, env.LEGACY_HOSTS);
    request = old.request;
    let answer: Response;
    try {
      answer = await route(request, env, ctx);
    } catch (e) {
      /* AN ARMED RECORD IS NOT A FAULT, AND 500 TOLD THE CLIENT IT WAS. Every door that checks a credential by RPC reaches
         `#record()` first, which rejects while a restore is armed, and this answered that 500 `INTERNAL` with the refusal's
         own sentence inside it (`test/restore-armed.test.ts`). The object's comments promise 503 `RECORD_UNAVAILABLE`,
         and 503 is what a client waits on and asks again. */
      answer = restoring(e)
        ? json({ ok: false, refusal: RESTORING }, 503)
        : overloaded(e)
          ? busyAnswer(request)
          : crashAnswer(request, e, (fields) => ctx.waitUntil(opsAlert(env, fields, alertClaim(env))));
    }
    /* SIGNED IN, THE SITE SAYS SO: the readable `bd_in` cookie follows the session (`signed-in.ts`). */
    answer = withSignedIn(old.legacy ? legacyAnswer(answer, false) : answer, request, cookieDomain(env.PUBLIC_HOST, env.RP_ID));
    /* AND THE OLD COOKIE IS CLEARED AFTER THE SITE'S MARK IS SET, so clearing it on the old name never reads as a sign-out
       of the app, whose own session is untouched. */
    if (old.carried) answer = legacyAnswer(answer, true);
    /* ONE POINT PER REQUEST, CRASHES INCLUDED, AFTER THE ANSWER (`51 §5.18`, `telemetry.ts`). Inside `waitUntil` so the
       caller never waits on a count, and it does nothing at all while `TELEMETRY` is unbound. */
    ctx.waitUntil(telemetry(env, request, answer, Date.now() - began));
    return answer;
  },

  /**
   * The doorbell rang.
   *
   * THE MESSAGE IS A NAME AND NOT A JOB. It says which record has something to send; the outbox
   * says what. A message delivered twice does one pass over a lease that is already taken and
   * finds nothing — which is why the queue can be at-least-once and the notification is still
   * sent once.
   */
  async queue(batch: MessageBatch<{ record: string } | HeldMessage>, env: Env): Promise<void> {
    /* A KEPT ARRIVAL'S RING IS TRIED HERE, one at a time; every other message is a doorbell, as before. A try that could
       not queue its next one is retried by the queue, and past its retries the nightly sweep finds the object. */
    const rings: Message<{ record: string }>[] = [];
    for (const m of batch.messages) {
      if (!isHeld(m.body)) {
        rings.push(m as Message<{ record: string }>);
        continue;
      }
      try {
        await redeliver(m.body, heldDeps(env));
        m.ack();
      } catch (e) {
        op({ op: 'door', redelivered: false, error: e instanceof Error ? e.message : String(e) }, 'error');
        m.retry({ delaySeconds: 300 });
      }
    }
    await consume(rings, (id) => drainOutbox(env, id));
  },

  /**
   * The cron fired: the nightly walk, one copy per record. `53 §5.1`, `51 §5.12`.
   *
   * AN ABSENT BUCKET THROWS RATHER THAN RETURNS. A `scheduled()` that quietly did nothing on a
   * deployment with no `BLOBS` binding is the exact failure this whole path exists to prevent: the
   * cron shows green every night, and the absence of copies is found by the person who needed one.
   * Throwing marks the invocation failed, which is a red row in the dashboard and a line in the tail.
   *
   * AND THE REST OF 53 §5.1 RIDES THE SAME WALK: each record's keys re-wrapped and its erasures checked against the
   * bucket beside its copy, the billing ladder once after them (`ladder.ts`), and the night's summary as one note in
   * the operator's record when `OPS_RECORD` is set.
   */
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    /* FIRST, AND NEVER IN THE WAY OF THE WALK: arrivals kept at the door and not yet landed are rung again (`held.ts`). */
    try {
      await sweepHeld(heldDeps(env));
    } catch (e) {
      op({ op: 'door', swept: false, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
    await nightly(env);
  },

  /**
   * Mail to a record's mailbox, from Email Routing (`email.ts`).
   *
   * THE SAME DOOR AS `POST /in/email/<token>`, WITH THE FILE STORE ADDED. `arrivals` is the Directory, the object and the
   * brake the HTTP door uses, so a message is budgeted, looked up and stored exactly as a forwarder's post is, and
   * `fileKeeper` puts its attachments in `BLOBS` under the record's prefix, as `PUT /api/files` does. Nothing reaches
   * this until his Email Routing rule sends a domain's mail here; until then it is an export nothing calls.
   */
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    /* THE SUPPORT ADDRESS GOES TO A PERSON, NOT TO A RECORD. Forwarded to `SUPPORT_FORWARD` (his own inbox, from config,
       never in code) when both are set; with no forward target the message is refused so the sender is told. */
    if (isSupportMail(message.to, env.SUPPORT_ADDRESS)) {
      const target = env.SUPPORT_FORWARD?.trim() ?? '';
      if (target === '') return message.setReject('support mail is not set up yet');
      await message.forward(target);
      return;
    }
    await takeMail(message, { ...cloudIngest(arrivals(env)), keep: fileKeeper(env.BLOBS, (record, n) => abusive(env, 'uploadDay', record, n)) });
  },
};

/**
 * The `/in/*` door with its hold (`held.ts`): this deployment's bucket, secret and queue, and the door `serveIngest` was
 * handed before the hold, built fresh for each ask.
 */
function heldDeps(env: Env, ctx?: ExecutionContext): HeldDeps {
  return {
    ...(ctx === undefined ? {} : { later: (work: Promise<unknown>) => ctx.waitUntil(work) }),
    holds: (rec, ingest, sign) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).doorHolds(rec, ingest, sign),
    learn: (rec, ingest, sign) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).door$(rec, ingest, sign),
    bucket: env.BLOBS,
    secret: env.SESSION_SECRET,
    queue: env.INGRESS,
    door: () => ({ ...cloudIngest(arrivals(env)), keep: fileKeeper(env.BLOBS, (record, n) => abusive(env, 'uploadDay', record, n)) }),
    tell: (fields) => opsAlert(env, { op: 'door', ...fields }, alertClaim(env)),
  };
}

/** The walk, wired to the Directory, the objects and the bucket. Exported from nowhere: the cron is its one caller. */
async function nightly(env: Env): Promise<void> {
  if (!env.BLOBS) {
    await keepNight(env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')), stoppedNight());
    await opsAlert(env, { op: 'night', why: 'no BLOBS binding' }, alertClaim(env));
    throw new Error('The nightly copy did not run: this deployment has no BLOBS binding, so there is nowhere to put one.');
  }
  const blobs = env.BLOBS;
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  /* BUILT FOR ITS REFUSAL ONLY: a recipient that will not do stops the walk here, once. Each record puts its own copy
     with the same recipient (`Record$.snapshot`). */
  r2Snapshots(blobs, { recipient: env.AGE_RECIPIENT ?? '' });
  /* ONE INSTANT FOR THE WHOLE WALK, so every copy taken tonight is filed under tonight's date even
     when the walk crosses midnight UTC. Two dates in one run would leave a day with two copies and
     the next with none, and the retention count would be counting nights that are not nights. */
  const at = new Date().toISOString();
  /* THE DIRECTORY FIRST, BECAUSE IT IS ONE OBJECT AND EVERY RECORD DEPENDS ON IT. Lose it and every record survives with
     nobody able to reach one, and nothing copied it before this line. Before the walk, so
     a fleet slow enough to run the invocation out of time costs a record its night and never the tenant map its copy.
     A failure is said at once and makes the invocation red below, after the records have had their turn. */
  let directoryFailed: string | null = null;
  try {
    const began = Date.now();
    const kept = await directoryCopies(blobs, { recipient: env.AGE_RECIPIENT ?? '' }).take(await directory.dump(), at);
    op({ op: 'walk', rec: 'directory', backup: 'ok', rows: kept.rows, bytes: kept.bytes, backup_ms: Date.now() - began });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    directoryFailed = `The Directory's nightly copy was not written: ${why}`;
    op({ op: 'walk', rec: 'directory', backup: 'failed', why }, 'error');
  }
  const stub = (record: string) => env.RECORD.get(env.RECORD.idFromName(record));
  /* THE DIRECTORY'S BILLING GROUP, TYPED BY ITS `op` as the billing doors type it (`BillingDeps`), because the RPC stub
     answers the union of every op's answer. */
  const billing = ((call: BillingCall) => directory.billing(call)) as unknown as BillingDeps['billing'];
  const origin = (env.PUBLIC_HOST ?? '').trim();
  const opsRecord = (env.OPS_RECORD ?? '').trim();
  /* THE WALK'S ONE CLOCK FOR THE LADDER, read once. Day 90 is a deletion, and a deletion decided against one instant
     and checked against another is the mistake `ladder.ts` exists to rule out. */
  const tonight = Date.now();
  /* THE TALLY IS SAID AND NOT RETURNED. `53 §5.1` step 5 is a person reading the closing line the
     morning after, and the ops record's note when `OPS_RECORD` names one. */
  const walked = await nightlyWalk({
    records: async (cursor) => directory.listRecords(cursor),
    snapshot: async (record) => stub(record).snapshot(record, at),
    /* AND THE RECORD TOLD WHAT ITS COPY CAME TO, so its Settings can say when and how large, and a failed night reaches
       the person whose copy it was as one fault. */
    kept: async (record, copy) => stub(record).nightCopy({ kept: copy }),
    failed: async (record, why) => stub(record).nightCopy({ failed: why }),
    /* THE KEYS BEFORE THE COPY, so tonight's copy holds them under tonight's root key (`rewrap.ts`). */
    rewrap: (record) => rewrapRecord(env, record),
    /* THE ERASURES AGAINST THE BUCKET ITSELF: every `done` one from the last thirty days whose object is still there is
       put back on the record's outbox (`53 §5.1` step 3d). `head` and not `get`, because only whether it is there
       matters and the bytes are somebody's erased file. */
    erase: async (record) => {
      const object = stub(record);
      const rows = (await object.eraseRows(new Date(tonight - ERASE_CHECK_MS).toISOString())) as EraseRow[];
      return reconcileErase(
        rows,
        /* `key` IS THE BARE SHA-256 (`erase.r2`'s payload), and the object lives at `rec_<id>/a/<sha256>` (`fileKey`),
           so the head must ask for that address and not the hash alone. */
        async (key) => (await blobs.head(fileKey(record, key))) !== null,
        async (again) => {
          await object.eraseAgain(again);
        },
        tonight,
      );
    },
    ladder: () =>
      ladder({
        due: (now) => billing({ op: 'due', now }),
        owners: async (record) => stub(record).walkOwners(),
        mail: (kind, to, vars) => sendMail(env, kind, to, vars),
        told: async (record, day) => (await billing({ op: 'told', record, day })).ok,
        lapsed: (record) => billing({ op: 'lapsed', record }),
        destroy: (record) => stub(record).lapseDelete(record),
        link: (slug) => (origin === '' ? undefined : `https://${origin}/${slug}`),
        speak: op,
        now: tonight,
      }),
    ...(opsRecord === ''
      ? {}
      : {
          note: async (text: string) => {
            if (!(await stub(opsRecord).opsNote(text))) throw new Error(`The ops record ${opsRecord} did not take the night's note: it is deleted, not made, or refused by this build.`);
          },
        }),
    /* WHAT DELETED RECORDS LEFT: every record closed longer ago than a final copy is kept, and its prefix emptied. */
    closed: async (cutoff, cursor) => directory.closedBefore(cutoff, cursor),
    expire: (record) => expireFinal(blobs, record),
    /* AND EACH RECORD'S LAST FORTY DAYS OF RUNS INTO THE LEDGER AGAIN, by its own object (`Record$.meterReplay`), so a
       count a pass lost and every automation run are in the account by morning. */
    replay: (record) => stub(record).meterReplay(),
    /* AND WHAT EACH RECORD HAS ON, TALLIED INTO THE KENNEL'S PUBLIC INSTALL COUNTS (`writeCounts`). */
    installed: (record) => stub(record).packsOn(),
    counts: (held) => writeCounts({ blobs, assets: env.ASSETS }, held, new Date(tonight)),
    kennel: () => kennelVitals({ blobs, assets: env.ASSETS }, new Date(tonight)),
    speak: op,
    now: () => Date.now(),
  }).catch(async (e: unknown) => {
    /* A WALK THAT THREW IS A NIGHT THAT DID NOT RUN, kept as one so last night's `ran` does not stand for a day more
      , and mailed before the throw makes the invocation red. */
    await keepNight(directory, stoppedNight(directoryFailed));
    await opsAlert(env, { op: 'night', why: 'the walk stopped' }, alertClaim(env));
    throw e;
  });
  /* AND EACH MONTH'S EXTRA USAGE REPORTED TO STRIPE, after the replay has counted every run (`reportExtra`). Nothing
     while extra usage is not sold, and never a stop: a month that failed is reported again tomorrow. */
  await reportExtra(env, { billing, clock: () => Date.now(), stripe: (key) => stripeOf(key, () => Date.now()) }).catch((e: unknown) => {
    op({ op: 'walk', rec: 'directory', extra: 'failed', why: e instanceof Error ? e.message : String(e) }, 'error');
  });
  /* AND A NIGHT THAT COPIED NOTHING MAKES THE INVOCATION ITSELF RED. Every per-record failure is
     already in the tail, but a tail is read by somebody who is already worried; a failed cron run
     is what tells them to be. */
  const red = [fleetFailure(walked), directoryFailed].filter((line): line is string => line !== null);
  /* AND THE NIGHT IS KEPT FOR `/healthz`, so a watch from outside can say a night did not run, and a night with
     a failure in it mails the operator before the invocation goes red, because a red cron row is read by somebody
     already looking. Counts only: which record failed is in the walk's own lines. */
  const night: Night = {
    at: new Date().toISOString(),
    records: walked.records,
    backups: walked.backups,
    backups_failed: walked.failed,
    directory: directoryFailed === null ? 'ok' : 'failed',
    /* AND EVERY OTHER JOB OF THE NIGHT BY ITS FAILURES, so `ran` is not said over expiries, re-wraps, erasures or counts
       that did not finish. */
    expiry_failed: walked.expiryFailed,
    stragglers: walked.stragglers,
    erase_open: walked.eraseOpen,
    ...(walked.counts === undefined ? {} : { counts_written: walked.counts.written }),
  };
  await keepNight(directory, night);
  if (walked.failed > 0 || directoryFailed !== null) await opsAlert(env, { op: 'night', ...night }, alertClaim(env));
  if (red.length > 0) throw new Error(red.join(' '));
}

/**
 * A night that did not run: the walk threw, or it could not start. Nothing reached and nothing copied, so `/healthz` reads
 * `ran: false` from the moment it is kept, and not 26 hours later when the night before it goes stale.
 */
function stoppedNight(directoryFailed: string | null = null): Night {
  return { at: new Date().toISOString(), records: 0, backups: 0, backups_failed: 0, directory: directoryFailed === null ? 'ok' : 'failed', stopped: true };
}

/** The night handed to the Directory for `/healthz`. One that could not be kept is a line, and the night still happened. */
async function keepNight(directory: { nightDone(night: Night): Promise<void> }, night: Night): Promise<void> {
  try {
    await directory.nightDone(night);
  } catch (e) {
    op({ op: 'walk', rec: 'directory', night: 'unkept', why: e instanceof Error ? e.message : String(e) }, 'error');
  }
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    /* LIVENESS BEFORE EVERYTHING, THE OLD HOST'S REDIRECT INCLUDED. Measured at afb3b1b2 `/healthz` was the router's 404
       on `PUBLIC_HOST` and a 308 into the app on a legacy host for a caller sending `accept: text/html`, so a monitor
       either read the Worker as down or followed the redirect to the app shell and read somebody else's 200. */
    if (HEALTHZ.test(url.pathname)) return healthz(request, env.BRAINDOG_BUILD, launchState(env), request.method === 'GET' ? await nightOf(env) : undefined);
    /* NO POST BODY OVER ITS DOOR'S CEILING IS READ BY ANYTHING BELOW (`body-cap.ts`): a 413 with the plain line, here, before
       sign-in, a record or a model is asked. A door with a tighter cap of its own keeps it. */
    const sized = await guardBody(request);
    if (sized instanceof Response) return sized;
    request = sized;
    if (isAdminHost(request, env.PUBLIC_HOST)) {
      const page = serveAdmin(request);
      if (page) return page;
    }
    /* THE OLD HOST FIRST, AND ONLY FOR A PAGE LOAD. `legacyRedirect` answers
       `null` for every path this Worker serves itself, the build id and sign-in included, so an agent, a webhook
       sender and a stale tab on `app.brain.dog` are served where they stand. Unset `LEGACY_HOSTS` is no host at all. */
    const moved = legacyRedirect(request, env.LEGACY_HOSTS, env.PUBLIC_HOST);
    if (moved) return moved;
    /* THE DEPLOYMENT'S OWN BUILD ID, BEFORE ANYTHING ELSE, because it asks nothing of the Directory,
       of a record or of whoever is calling. */
    if (servesBuild(url.pathname)) return buildId(env);
    /* WHICH APPLE APP MAY USE THIS NAME'S PASSKEYS (`apple.ts`): asks nothing of anybody, like the build id. */
    if (servesAppleAssociation(url.pathname)) return appleAssociation(env.APPLE_TEAM_ID);
    /* SIGN-IN FIRST, AND IT IS THE DIRECTORY'S: nothing under `/auth/` reaches a record. LIMITED BY ADDRESS BEFORE THE
       DIRECTORY IS ASKED, on top of its own lockouts, because nobody at this door has proved who they are yet: the
       address is the one thing a caller cannot choose here (`cf-connecting-ip`). */
    if (servesAuth(url.pathname))
      return (await authAbuse(env, request)) ?? (await overLimit(env, null, request, SAFE_METHODS.has(request.method) ? 'read' : 'write')) ?? signIn(request, env, ctx);
    if (servesAccount(url.pathname)) return account(request, env, ctx);
    /* OAUTH 2.1, WITH BRAINDOG AS ITS OWN AUTHORIZATION SERVER: the metadata an MCP client
       discovers from `/mcp`'s 401, and the endpoints it signs in by. Before `/mcp` and every record door, because none
       of it reaches a record until a person approves in the app. Only the names it owns are handed over (`servesOAuth`,
       `servesOAuthMeta`), and `serveOAuth` answers `null` for a path under them it does not serve, which falls through
       to the 404 below. */
    if (servesOAuth(url.pathname) || servesOAuthMeta(url.pathname)) {
      const answered = await serveOAuth(request, env);
      if (answered !== null) return answered;
    }
    /* AN AGENT'S MCP CLIENT, BEFORE ANY DOOR IS ASKED, so the cookie is never read for it. */
    if (servesMcp(url.pathname)) return agent(request, env);
    /* `/in/*`: SOMETHING ARRIVES FROM OUTSIDE AND NOBODY IS ASKED WHO IT IS (`33 §4`, `51 §5.4`, `12 §3`).
       BEFORE EVERY DOOR, so the cookie is never read for it: an arrival is above the
       auth gate by design, and what stands in for a principal is whether the payload was verified, which
       decides only whether the stored row may match. It is also before `servesApi`'s `ROUTE_UNKNOWN`, which
       returns for everything it does not recognise, and before the app shell, which would answer a bank's
       webhook with `index.html` and a 200 that its retry logic reads as delivered. `serveIngest` holds the
       whole order from here, including the 404 for the shape this host does not serve. */
    if (servesIn(url.pathname)) return serveHeld(request, heldDeps(env, ctx));
    /* THE KEY DOORS, before any door is asked: their bearer is a keychain grant, no cookie may reach them, and a login
       token reaches only the deposit door, to add a new key (`keyDoor`). */
    if (servesKeychain(url.pathname)) return keyDoor(request, env);
    /* THE KENNEL, THE REGISTRY EVERY HOST READS ADD-ONS FROM (`kennel.ts`), before any record door because it is nobody's
       record: its reads are public, and a write names who asks by an author's key, a bearer, or this host's session. */
    if (servesKennel(url.pathname))
      return serveKennel(request, {
        blobs: env.BLOBS,
        assets: env.ASSETS,
        operator: env.PROVISION_KEY,
        origin: `https://${env.PUBLIC_HOST ?? ''}`,
        session: (sid) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).auth({ flow: 'session', sid }) as unknown as Promise<AuthResult<Who>>,
        bearer: bearerDeps(env),
        spend: (asked) => overLimit(env, null, asked, 'write'),
        scratch: {
          open: () => {
            const scratch = env.RECORD.get(env.RECORD.idFromName(`kennel-scratch:${crypto.randomUUID()}`));
            return recordScratch(
              {
                planPack: (args) => scratch.scratchCall('planPack', args),
                installPack: (args) => scratch.scratchCall('installPack', args),
                pages: () => scratch.scratchCall('pages', null),
                page: (args) => scratch.scratchCall('page', args),
              },
              () => scratch.scratchDrop(),
            );
          },
          required: (ids) => kennelRequired({ blobs: env.BLOBS, assets: env.ASSETS }, ids, new Date()),
        },
      });
    /* A RECORD'S FILES, AT EITHER ADDRESS (`files.ts`): the bytes go to `BLOBS` and never through the record's
       object, and who may is asked of the same session and bearer doors `recordApi` asks, in its order. */
    if (servesFiles(url.pathname))
      return serveFiles(request, {
        blobs: env.BLOBS,
        session: {
          origin: `https://${env.PUBLIC_HOST ?? ''}`,
          session: (sid, slug) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).auth({ flow: 'session', sid, ...(slug === undefined ? {} : { slug }) }) as unknown as Promise<AuthResult<Who>>,
          access: (record, person) => held(env, record, (object) => object.access(person)),
          stopped: (record, person) => held(env, record, (object) => object.memberStopped(person)),
        },
        bearer: bearerDeps(env),
        limit: (who, cls) => overLimit(env, who, request, cls),
        bytes: (record, n) => abusive(env, 'uploadDay', record, n),
        held: (record, sha256, ctx) => held(env, record, (object) => object.fileHeld(sha256, ctx)),
      });
    /* EVERY OTHER PATH IS THE APP, AND `/<slug>/api/*` IS THAT RECORD'S API (§2.4). The slug is stripped here, because
       no route pattern can pick it out, and handed to the door, which has the Directory check it before anything is
       addressed. AFTER THE ROOT'S OWN DOORS, which no slug can shadow: every door's word is one the Directory refuses as
       a name (`packages/record/src/directory.ts`). The old `/app/<slug>/api/*` is read the same way, for a CLI whose
       hosts file was written before the app moved to the root; a page load there was sent on by `legacyRedirect`. */
    /* THE FRAME A DRAWN BLOCK IS DRAWN IN, before `appPath`, which would read `drawn-frame` as a record's name. It is
       answered from code under its own policy and never through `asPage` (`@braindog/host/drawn-frame`). */
    if (isDrawnFrame(url.pathname)) return drawnFrame(request.method);
    const app = appPath(url.pathname);
    /* A RECORD'S PUBLIC KEY, UNDER ITS NAME, before the page and the API are told apart: it is neither. */
    if (app !== null && app.slug !== null && servesKey(app.rest)) return recordKey(request, env, app.slug);
    if (app !== null) return servesApi(app.rest) ? timedApi(atRoot(request, app.rest), env, app.slug) : appPage(request, env, app);
    if (!servesApi(url.pathname))
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }, 404);
    return timedApi(request, env, null);
}

/**
 * `recordApi`, with how long the answer took said on it (`Server-Timing`, scope 2026-10-24 A1): `rec` is the trip to the
 * record's object and its answer, as this Worker waited for it (`forward` puts it on the answer), and `door` is the rest, the doors,
 * the Directory and the limits asked before it. A browser's tools and the night's speed measure read the split from the
 * answer itself rather than piecing it together from logs.
 *
 * THE RECORD'S OWN CLOCK IS NOT ASKED: inside an object time moves only across I/O, so the work it does in its own thread
 * reads as nothing. What the record costs is read from `rec` against a call that does no work (`version`).
 */
async function timedApi(request: Request, env: Env, slug: string | null): Promise<Response> {
  const t0 = Date.now();
  const out = await recordApi(request, env, slug);
  if (out.status === 101 || out.webSocket) return out;
  const said = /(?:^|,)\s*rec;dur=(\d+)/.exec(out.headers.get('server-timing') ?? '');
  const rec = said === null ? undefined : Number(said[1]);
  const total = Date.now() - t0;
  return withServerTiming(out, rec === undefined ? `door;dur=${total}` : `rec;dur=${rec}, door;dur=${Math.max(0, total - rec)}`);
}

/** An answer with `Server-Timing` set to `value`, its body, status and other headers as they were. */
export function withServerTiming(out: Response, value: string): Response {
  const timed = new Response(out.body, out);
  timed.headers.set('server-timing', value);
  return timed;
}

/**
 * A record method, at `/api/<method>` with `slug` null, or at `/<slug>/api/<method>` with the request already moved
 * to the root path by `atRoot`.
 *
 * ONE BODY FOR BOTH ADDRESSES, so the slug is one more argument to the same doors rather than a second router that
 * could drift from the first. Under a slug a cookie means that record once the Directory says it is theirs, a bearer
 * must name the same record, and nothing presented is 401 at either.
 */
async function recordApi(request: Request, env: Env, slug: string | null): Promise<Response> {
    const url = new URL(request.url);
    /* THE KEY A BROWSER SUBSCRIBES WITH IS THE DEPLOYMENT'S, NOT A RECORD'S, so it is answered before any door is asked
       and at either address: the app calls it under its slug and an agent at the root, and neither needs a session to
       learn what every subscribing browser is handed anyway. `{ key: null }` is "no push here", and the web toggle then
       draws nothing (`apps/web/src/lib/ui/push.ts`). Here and not in `route()`, because it is one more `/api/` path
       and the site already forwards `/api/*` (`test/site-binding.test.ts`). */
    if (servesPushKey(url.pathname)) {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/api/push/key takes a GET.' } }, 405, [['allow', 'GET, HEAD']]);
      return json({ key: await pushKeyOf(env) }, 200);
    }
    /* A VISIT TO A PAGE OF THE SITE (`seen.ts`), AT THE ROOT ONLY, answered as the push key is, before any door: it is
       nobody's and carries no cookie. Always 204, and counted only with `COUNT_VISITS` on, from the public host's own
       pages, under the write limit. */
    if (slug === null && servesSeen(url.pathname))
      return seenDoor(request, {
        on: (env.COUNT_VISITS ?? '').trim() === 'yes',
        host: env.PUBLIC_HOST ?? '',
        limit: async (r) => (await overLimit(env, null, r, 'write')) ?? (await abusive(env, 'seen', addressOf(r))),
        count: (call) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).seen(call),
      });
    /* THE KEY DOORS NAME THEIR RECORD BY THE GRANT, AND ONLY AT THE ROOT. A grant under a slug would be a second way to
       say which record, and the keychain is the last place to accept two answers to that. */
    if (slug !== null && servesKeychain(url.pathname))
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'The key doors are at /api/keychain/ (and /api/vault/), and a grant names its own record.' } }, 404);

    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));

    /* WHICH DOOR, in `session.ts`'s order and nowhere else: a link, a bearer, the session cookie, or none. A cookie that
       names no session is a 401 that clears it. */
    const door = await doorOf(request, {
      origin: `https://${env.PUBLIC_HOST ?? ''}`,
      session: (sid, slug) => directory.auth({ flow: 'session', sid, ...(slug === undefined ? {} : { slug }) }) as unknown as Promise<AuthResult<Who>>,
      access: (record, person) => held(env, record, (object) => object.access(person)),
      stopped: (record, person) => held(env, record, (object) => object.memberStopped(person)),
      ended: (record, person) => held(env, record, (object) => object.accessEnded(person)),
      /* SEE AS is this door's alone; the record counts each read made so as `preview:<person>` (`previewBy`). */
      seeAs: true,
    }, slug);

    /* A LINK TO ONE PAGE, `Authorization: Share <token>`, WHICH `doorOf` HANDS ON UNCHECKED. It opens `/api/sharedPage`
       at the root and nothing else, and every way it does not open is one 404 with no body (`@braindog/host`'s
       `share.ts`). Under a slug it is that 404 too: the link names its own record, and a name in the path would be a
       second answer to which one. */
    if (door.door === 'share') return slug === null ? serveShared(request, door.token, sharedDoor(env)) : sharedNone();

    /* A PERSON'S MINUTE, ONCE THE SESSION SAYS WHO THEY ARE AND BEFORE ANY OF THE SESSION'S DOORS BELOW IS ANSWERED
       (`overLimit`). A cookie rotated on the way in rides back on the 429, as it does on every answer here. */
    if (door.door === 'session') {
      const over = await overLimit(env, { door: 'session', ctx: door.ctx }, request, classAt(url.pathname));
      if (over !== null) return withCookie(over, door.cookie);
    }
    /* A FIRST-RUN STEP (`step.ts`): a signed-in browser's, counted once a record, on the same `COUNT_VISITS` switch as the
       visit counter. Always 204. */
    if (servesStep(url.pathname))
      return withCookie(
        await stepDoor(request, {
          on: (env.COUNT_VISITS ?? '').trim() === 'yes',
          record: door.door === 'session' ? door.record : null,
          mark: (call) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).seen(call),
        }),
        door.door === 'session' ? door.cookie : undefined,
      );

    /* THE APP'S OWN KEY DOORS ARE A BROWSER SESSION'S AND NOBODY ELSE'S. `/api/keys/*` is not a record method, so
       it is answered here rather than forwarded; every other door reaching it is refused with the record's own
       sentence rather than with a route that does not exist. */
    const keysAsked = servesKeys(url.pathname) !== null;

    /* AND THE FORWARDING ADDRESS IS THE OTHER ONE, for the same reason and with the opposite half of the
       platform behind it: `/api/inbound/*` writes the DIRECTORY's `dir_inbound`, not the record, so it cannot
       be a record method however much its path looks like one. It is here rather than above `doorOf` because
       a mint needs to know who is asking, which is precisely what `/in/*` three branches up does not. */
    const mintAsked = servesInbound(url.pathname) !== null;

    /* SEEING AS SOMEBODY NEITHER OPENS THE KEYS NOR MINTS AN ADDRESS: both are answered here, outside the router's
       read-only lock, so they are refused here in its sentence. */
    if (door.door === 'session' && door.ctx.preview !== undefined && (keysAsked || mintAsked))
      return withCookie(json({ ok: false, refusal: PREVIEW_READ_ONLY }, 403), door.cookie);

    /* AND THE OWNER OPENING A LINK IS THE SESSION'S DOOR WITH ONE STEP AFTER IT: the record answers inside its object,
       where the key is not, so the link is signed here (`openShare` below). A bearer asking it reaches the record through
       its own line and is refused there, because the method is ADMIN. */
    if (door.door === 'session' && opensShare(request.method, url.pathname))
      return withCookie(await openShare(inward(request, door.ctx), env, door.record, door.ctx), door.cookie);

    /* A PERSON, on the record their session names, and a rotation rides back on the record's answer. The
       record authorises exactly as it does for a bearer: every check is inside `createRecordApi`. */
    if (door.door === 'session')
      return withCookie(
        keysAsked
          ? await appKeys(request, env, door.record, door.ctx)
          : mintAsked
            ? await mailAddress(request, env, door.record, door.ctx)
            : await forward(inward(request, door.ctx), env, door.record, door.ctx),
        door.cookie,
      );

    if (door.door === 'refused') {
      if (door.status === 401 && door.refusal === undefined) return unauthorized(env);
      /* AND A PERSON WHOSE ACCESS ENDED IS TOLD SO IN A HEADER TOO, which the service worker deletes its copy on. */
      const extra: [string, string][] = [...(door.retryAfter === undefined ? [] : [['retry-after', String(door.retryAfter)] as [string, string]]), ...accessHeaders(door.refusal)];
      const body = door.refusal !== undefined ? { ok: false, refusal: door.refusal } : door.retryAfter === undefined ? { ok: false } : { ok: false, retryAfter: door.retryAfter };
      return withCookie(json(body, door.status, extra), door.cookie);
    }

    /* AND WHAT IS LEFT AT `/api/keys/*` IS A BEARER OR NOTHING, which is the one thing those doors do not take. */
    if (keysAsked) return noSession();

    /* NOR SLASH'S ASK, FOR THE SAME REASON AND BECAUSE THE DOOR CANNOT SAY IT HERE. `serveSlash` refuses any
       `authorization` header, but `inward()` below deletes that header, so on this host the door never saw one and
       the `Origin` check was all that stood: a read token sending the app's own origin by hand was answered 200 with a
       Reading, and each ask opened the person's own keychain key and spent the month's `ask_cap` (`46 §5.2`, measured
       in `test/slash.test.ts`). A cookie reaches it above; a bearer is refused here, in the door's own words. */
    if (servesSlash(url.pathname) !== null) return json({ ok: false, refusal: NO_SLASH_TOKEN }, 403);

    /* NOR MAY AN AGENT MOVE A RECORD'S MAIL. A bearer works from anywhere for thirty days, so a token that could
       rotate the forwarding address could take over a record's incoming statements without anybody signing in,
       and a token that could revoke one could stop them arriving silently. `serveInbound` refuses the header
       itself for a host that wires it differently; this is the branch that never reaches it. */
    if (mintAsked) return json({ ok: false, refusal: NO_MINT_SESSION }, 403);

    /* A BEARER. This Worker serves MANY records, and a request that says who it is by nothing but the
       header it carries says so here, or not at all. `session.ts` holds the path, and `/mcp` takes the same one. */
    const found = await bearerOf(request, 'api', bearerDeps(env), slug);
    /* AND A BEARER NO TOKEN ROW KNOWS MAY BE A RUNNER'S, AT THE THREE PATHS A RUNNER CALLS AND NOWHERE ELSE.
       It is the same door, a bearer on `/api`, so it reaches the record through the same
       line below; the record builds the runner's context from its own device grants, and every method but the JOBS
       ones refuses it. */
    const caller = 'status' in found && found.status === 401 ? ((await runnerOf(request, env, slug)) ?? found) : found;
    if ('status' in caller) return caller.status === 403 ? json({ ok: false, refusal: caller.refusal }, 403) : unauthorized(env);

    /* AND A BEARER'S MINUTE, THE TOKEN'S OWN AND NOT ITS RECORD'S, before the record is asked (`overLimit`). */
    const over = await overLimit(env, { door: 'bearer', ctx: caller.ctx }, request, classAt(url.pathname));
    if (over !== null) return over;

    /* THE WORKER AUTHENTICATES AND THE RECORD AUTHORISES, and neither does the other's half. Every check about
       what a caller may do is inside `createRecordApi`, so the CLI and the MCP server answer to the same ladder
       as the browser. `inward` writes the context over whatever the caller sent and drops the bearer. */
    const inner = inward(request, caller.ctx);
    /* A RUNNER'S CLAIM IS HELD HERE UNTIL A JOB IS QUEUED OR ITS WAIT RUNS OUT (`holdClaim`), and every other call is
       forwarded once. Only the runner's own principal is held, so a person or a token asking `claimJob` is answered
       at once with the record's refusal. */
    return caller.ctx.principal.kind === 'runner' && claimAsked(inner.method, url.pathname)
      ? heldClaim(inner, env, caller.record, caller.ctx)
      : forward(inner, env, caller.record, caller.ctx);
}

/** Whether a request is the record's `claimJob`, under either base, as `removalAsked` reads its own method. */
const claimAsked = (method: string, pathname: string): boolean => method === 'POST' && /\/api\/+claimJob\/*$/.test(pathname);

/**
 * A runner's `claimJob`, asked of its record again every `CLAIM_EVERY_MS` until a job is handed over or the wait the
 * runner sent has passed (`holdClaim` in `@braindog/host`): the last answer either way.
 *
 * THE WAIT IS HELD IN THIS WORKER AND NEVER IN THE RECORD'S OBJECT, so the record's single thread answers each ask at
 * once and serves everyone else between them. `inner` is never read itself: each ask forwards a copy, because the
 * record consumes the body it is handed. An answer that is not a 200 is a refusal, which `claimIdle` does not wait past.
 */
async function heldClaim(inner: Request, env: Env, record: string, ctx: CallContext): Promise<Response> {
  const sent = (await inner.clone().json().catch(() => null)) as { wait?: unknown } | null;
  const ask = async (): Promise<{ out: Response; said: { ok: boolean; value?: unknown } | null }> => {
    const answered = await forward(inner.clone(), env, record, ctx);
    const body = await answered.text();
    const out = new Response(body, { status: answered.status, headers: answered.headers });
    if (answered.status !== 200) return { out, said: null };
    try {
      return { out, said: JSON.parse(body) as { ok: boolean; value?: unknown } };
    } catch {
      return { out, said: null };
    }
  };
  const last = await holdClaim(ask, sent?.wait, {
    idle: (answer) => answer.said !== null && claimIdle(answer.said),
    now: () => Date.now(),
    sleep: (ms) => new Promise<void>((done) => setTimeout(done, ms)),
  });
  return last.out;
}

/**
 * The key a link to one page is signed and checked with (`share.ts`), or `null` when `KEK` is not bound.
 *
 * ONE READER OF `KEK` FOR BOTH HALVES, so the door that checks a link and the step that makes one cannot be keyed apart.
 */
const shareKey = (env: Env): Promise<Uint8Array | null> => shareKeyOf(env.KEK);

/**
 * The Cloud's half of a link's door: the key, the Directory, the read budget and the record's object.
 *
 * THE DIRECTORY IS ASKED AFTER THE MAC AND BEFORE ANY OBJECT, as `bearerOf` asks it, because `idFromName` on a name
 * nobody holds creates the object. A closed record is not one it knows, so a deleted record's links wake nothing.
 *
 * THE READ BUDGET IS `RL_READ` WHEN IT IS BOUND AND NOTHING WHEN IT IS NOT, as `bindingLimiter` says, keyed by the link.
 * A binding that throws opens the door, as `overLimit` does for every other caller: the record still decides whether the
 * link opens anything, and a throw here would be a 500 where every other way a link fails is the one 404.
 *
 * THE CONTEXT IS THE LINK'S AND NO PERSON'S, and `inward` writes it over anything the caller sent, as it does for every
 * door. `ShareContext` is written structurally in `@braindog/host`, so it is handed on as the record's `CallContext`.
 */
function sharedDoor(env: Env): SharedDoor {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const limits = linkLimiter({ read: env.RL_READ });
  return {
    /* SWITCHING `SHARE_LINKS` OFF CLOSES EVERY OPEN LINK: with no key, no link checks. */
    key: async () => (sharesOf(env).can ? shareKey(env) : null),
    knows: (record) => directory.knows(record),
    spend: async (key) => {
      try {
        const said = await limits.limit(key, 'read');
        return said.ok ? null : linkRefused(said.retryAfter);
      } catch (e) {
        op({ op: 'limit', ok: false, class: 'read', error: e instanceof Error ? e.message : String(e) }, 'error');
        return null;
      }
    },
    now: () => Date.now(),
    answer: (record, link, request) => {
      const ctx = link as unknown as CallContext;
      return forward(inward(request, ctx), env, record, ctx);
    },
  };
}

/**
 * `POST /api/openShare` from the owner's session: the record opens the link and this Worker signs it.
 *
 * REFUSED BEFORE THE RECORD WRITES WHEN LINKS ARE OFF OR THERE IS NO KEY (`sharesOf`), so no `share.open` is written for
 * a link nobody could be handed: off, the record itself refuses in the host's sentence once it knows who asked.
 * A refusal from the record passes through as the record sent it, and a link it opened comes back with `token` and
 * `url` (`linkOpened`), whose address is this deployment's own public host.
 */
async function openShare(inner: Request, env: Env, record: string, ctx: CallContext): Promise<Response> {
  /* LINKS SWITCHED OFF ARE THE RECORD'S TO SAY, after it has asked who is asking: it reads the same `sharesOf` (its
     `shares` dependency) and refuses NOT_IN_THIS_BUILD at `host` before it writes anything. */
  if (!sharesOf(env).can) return forward(inner, env, record, ctx);
  const key = await shareKey(env);
  if (key === null) return json({ ok: false, refusal: NO_SHARE_KEY }, 501);
  const out = await forward(inner, env, record, ctx);
  if (out.status !== 200) return out;
  const linked = await linkOpened((await out.json()) as Result<unknown>, { key, record, origin: env.PUBLIC_HOST ? `https://${env.PUBLIC_HOST}` : '' });
  return json(linked, httpStatus(linked));
}

/**
 * A request into the record it names, with `51 D15`'s second half after a restore (`afterRestore` in `route.ts`).
 *
 * EVERY CALL IS A NEW STUB, AND THAT IS THE POINT OF THE SECOND ONE. `ctx.abort()` breaks the stub it was reached
 * through, so `restored` has to be asked of a stub made after the reset, which reaches the object PITR started. Only a
 * signed-in owner gets this far with a restore today, since the record refuses it to a token, and the bearer branch
 * comes here too so the rule does not depend on which door a restore arrived by.
 *
 * `inner` IS ALREADY `inward`'s, and the caller makes it: the context is set in each door's own line, which is where
 * `test/route.test.ts` counts them. `ctx` comes along for the one thing the second call needs, who asked.
 *
 * AND A REMOVAL THE RECORD ACCEPTED IS FOLLOWED BY THE DIRECTORY'S `leave`, which nothing called before: the record's
 * `member` table and the Directory's `dir_member` live in two databases, `removeMember` wrote only the first, and the
 * person removed stayed on the Directory's list of who reaches the record for as long as the record lived.
 */
async function forward(inner: Request, env: Env, record: string, ctx: CallContext): Promise<Response> {
  const stub = () => env.RECORD.get(env.RECORD.idFromName(record));
  /* A REMOVAL'S BODY IS READ AFTER THE RECORD HAS ANSWERED IT, and the record consumes the request, so the copy is
     taken first. Only this one method is copied: every other request goes through untouched. */
  const removal = removalAsked(inner.method, new URL(inner.url).pathname) ? inner.clone() : null;
  const renaming = renameAsked(inner.method, new URL(inner.url).pathname);
  const leaving = leavesAsked(inner.method, new URL(inner.url).pathname);
  const t0 = Date.now();
  /* A RESET UNDER A READ OR A PULSE IS ASKED ONCE MORE through a new stub (`reset-retry.ts`). */
  const out = await fetchThroughReset(stub, inner);
  const spent = Date.now() - t0;
  if (removal !== null && out.status === 200) await leftDirectory(removal, env, record);
  if (leaving && out.status === 200) await leftWithNothing(out.clone(), env, record);
  if (renaming && out.status === 200) await renamedEverywhere(out.clone(), env, ctx);
  if (!restoreAsked(inner.method, new URL(inner.url).pathname)) {
    /* THE WAIT ON THE RECORD rides on its answer as `rec`, for `timedApi` to add the doors' share beside it. */
    return out.status === 101 || out.webSocket ? out : withServerTiming(out, `rec;dur=${spent}`);
  }
  return afterRestore(out, actorOf(ctx), {
    reset: () => stub().reopen(),
    restored: async (args) => (await stub().restored(args)) as unknown as Result<unknown>,
  });
}

/** Whether a request is the record's `removeMember`, under either base: `/api/...` or `/<slug>/api/...`. */
const removalAsked = (method: string, pathname: string): boolean => method === 'POST' && /\/api\/+removeMember\/*$/.test(pathname);

/**
 * The Directory's `leave` for a removal the record has already accepted.
 *
 * THE RECORD'S ANSWER STANDS WHATEVER THIS DOES. The removal is done and said, and the record's own table is what
 * every door asks before it admits anybody (`admits` in the switch, the record's access on every call), so a Directory
 * that did not follow only leaves the record listed for somebody the record itself refuses, which is where this stood
 * before. The Directory refuses to remove the record's owner, and that refusal is right here too: nothing is thrown
 * past it.
 */
async function leftDirectory(asked: Request, env: Env, record: string): Promise<void> {
  try {
    const body = (await asked.json()) as { person?: unknown } | null;
    const person = typeof body?.person === 'string' ? body.person : '';
    if (person === '') return;
    await env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).leaveRecord(record, person);
  } catch {
    /* A Directory that did not answer leaves the list as it was, and the record has already said who is on it. */
  }
}

/**
 * The Directory's `leave` for each person a sharing answer left holding nothing (`leftBy`): their last share ended,
 * or the group that held it let them go, so the record drops from their switcher.
 *
 * THE RECORD'S ANSWER STANDS WHATEVER THIS DOES, as `leftDirectory`'s does: the record already refuses them, and a
 * Directory that did not follow only leaves the record listed where `switcherRows` leaves it out anyway.
 */
async function leftWithNothing(answer: Response, env: Env, record: string): Promise<void> {
  try {
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    for (const person of leftBy(await answer.json())) await directory.leaveRecord(record, person);
  } catch {
    /* A Directory that did not answer leaves the list as it was, and the record has already said who holds what. */
  }
}

/**
 * The Directory's `renamePerson` and `mirrorEverywhere`, for a rename the record has already accepted.
 *
 * THE RECORD'S ANSWER STANDS WHATEVER THIS DOES, as `leftDirectory`'s removal does: the name is already the new one
 * where it was asked, and this only moves it in the Directory and carries it, with the address as the Directory holds
 * it (`PersonChange`), into every other record the person reaches. A record `mirrorEverywhere` could not reach keeps
 * its old mirror until the next rename or address change carries the Directory's value in again.
 */
async function renamedEverywhere(answer: Response, env: Env, ctx: CallContext): Promise<void> {
  try {
    const name = await renamedName(answer);
    if (name === null) return;
    const person = ctx.principal.id;
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    const kept = await directory.renamePerson(person, name);
    if (!kept.ok) return;
    const records = (await directory.reaches(person)).map((r) => r.record);
    await mirrorEverywhere(records, (r) => env.RECORD.get(env.RECORD.idFromName(r)).mirrorPerson(person, { name, email: kept.value.email }));
  } catch {
    /* A Directory that did not answer leaves the mirror as it was, and the record has already accepted the new name. */
  }
}

/**
 * `GET /<slug>/.well-known/braindog-key`: `{ key_id, public_key }`, the key the record's exports are signed with
 * (`03 §4`), to anybody, so `braindog verify --key <url>` pins a file to a key it did not come with.
 *
 * THE DIRECTORY FIRST, AND A NAME IT DOES NOT HOLD WAKES NOTHING. `idFromName` on an id nobody has creates the object,
 * so the record is addressed by the id `resolve` answers and never by the name. A released name and one never given
 * answer the same 404 as a record that signs nothing, one sentence for the three.
 *
 * WHAT IT DOES TELL A STRANGER IS THAT A LIVE NAME EXISTS, which no other door here does without a credential: every
 * other answer under a slug is the shell or one 401. A key published per name cannot avoid it, and it is recorded
 * rather than decided here. The id-shaped alternative,
 * `/.well-known/braindog-key/<rec_id>`, would say nothing a caller did not already hold.
 */
async function recordKey(request: Request, env: Env, slug: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record\'s key is read with GET.' } }, 405, [['allow', 'GET, HEAD']]);
  const none = json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `No record here publishes a key as ${slug}.`, at: 'slug' } }, 404);
  const found = await env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).resolve(slug);
  if (!found) return none;
  const key = await held(env, found.record, (record) => record.signingKey());
  if (!key) return none;
  const out = json({ key_id: key.key_id, public_key: key.public_key }, 200);
  return request.method === 'HEAD' ? new Response(null, { status: out.status, headers: out.headers }) : out;
}

/**
 * A page of the app: bare `/` goes back to the last record, a file beside the pages is that file, and everything else
 * is the shell, which reads the path itself.
 *
 * THE WORKER DRAWS THE SHELL BECAUSE THE ASSETS DO NOT. With `/*` in `run_worker_first` and
 * `not_found_handling: none`, an app navigation reaches this function and not a
 * fallback, so `/acme/r/tasks` has to be answered with `/`'s bytes here. Under a slug no file is looked for:
 * a record's page is always the shell, and the shell's `boot` under that slug is where a stranger meets sign-in.
 *
 * A FILE MISSING IS A 404, AND ONLY A PAGE IS THE SHELL. A path whose last segment has an extension is a file, and
 * answering a missing one with `index.html` and a 200 is the fault the self-host already refuses for `/_app/`.
 */
async function appPage(request: Request, env: Env, app: AppPath): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A page of the app is read; a record method is at /<slug>/api/<method>.' } }, 405, [['allow', 'GET, HEAD']]);
  const assets = env.ASSETS;
  if (!assets) return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This deployment serves no app, only its API.' } }, 404);
  /* EVERY ANSWER THE ASSETS GIVE HERE IS A PAGE OF THE APP, OR A FILE BESIDE ONE, and leaves with `asPage`'s four
     headers: measured on production, the shell and the sign-in page carried none.
     The 302 `appEntry` answers for bare `/` is not wrapped, because a frame follows it to the shell. */
  const shell = async () => asPage(await assets.fetch(new Request(new URL('/', request.url), { method: request.method })), new URL(request.url).pathname);
  if (app.slug === null && app.rest === '/') {
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    return appEntry(request, {
      session: (sid) => directory.auth({ flow: 'session', sid }) as unknown as Promise<AuthResult<Who>>,
      slugOf: async (record) => directory.slugOf(record),
      shell,
    });
  }
  if (app.slug === null) {
    const file = await assets.fetch(request);
    if (file.status !== 404 || /\.[A-Za-z0-9]+$/.test(app.rest)) return asPage(file, new URL(request.url).pathname);
  }
  return shell();
}

/**
 * What every `/in/*` arrival on this isolate is counted against.
 *
 * AT MODULE SCOPE ON PURPOSE, AND IT IS THE ONLY MUTABLE STATE THIS FILE KEEPS THERE. A counter built per
 * request counts to one and refuses nothing; the budget has to outlive the request to be a budget at all.
 * What it holds is a count and a deadline per path, so an evicted isolate loses a brake and never a row,
 * and nothing about one record is readable from it by another. `route.ts`'s own header says plainly what
 * this does and does not promise: it is per isolate, which makes it a brake on a loop and not a quota.
 */
const spendArrival = ingestBudget(() => Date.now());

/**
 * The Cloud's half of the arrival door: the Directory, the object, and the brake above.
 *
 * THE DIRECTORY ANSWERS FIRST AND IT IS NOT A FORMALITY. `idFromName` on a name nobody has CREATES the
 * object, and this is the one surface reached with no credential, so an unchecked id in the path is a
 * stranger minting empty records until the account's storage runs out. `knows` also excludes a closed
 * record, so a deleted record's old webhook URL answers 404 without waking anything.
 */
function arrivals(env: Env): CloudIngestDeps {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return {
    knows: (rec) => directory.knows(rec),
    verifies: (rec, ingest) => env.RECORD.get(env.RECORD.idFromName(rec)).ingestVerify({ ingest }),
    turnsAway: (rec, ingest) => env.RECORD.get(env.RECORD.idFromName(rec)).doorTurnedAway({ ingest }),
    /* THE BYTES, THE FLAG AND THE INGEST, AND NOTHING ELSE OF THE URL. The record id was the address and
       the token was the proof; the ingest is what the token was checked against, and without it the
       record offered a verified webhook to every webhook pattern in declaration order
       (test/arrive-ingest.test.ts). Mail names none. */
    arrives: async (rec, arrival) => {
      /* AN HOUR OF ARRIVALS PER RECORD (`ABUSE.inboxHour`), counted here and not at the door because only a known record
         reaches this line. AN ARRIVAL NOTHING VERIFIED SPENDS ITS OWN, SMALLER HOUR (`inboxStrangerHour`): a stranger who
         knows the address but not its token stores at most that many, and never spends the hour the record's real
         senders need. */
      const held = await abuseWait(env, arrival.verified ? 'inboxHour' : 'inboxStrangerHour', rec);
      if (held !== null) return { ok: false, refusal: { code: 'RATE_LIMITED', fix: tooManyLine(held), retry_after: held } };
      const out = await env.RECORD.get(env.RECORD.idFromName(rec)).arrive({
        channel: arrival.channel,
        headers: arrival.headers,
        body: arrival.body,
        sha256: arrival.sha256,
        verified: arrival.verified,
        ...(arrival.ingest === undefined ? {} : { ingest: arrival.ingest }),
      });
      /* AN ARRIVAL THE RECORD STORED IS COUNTED IN THE ACCOUNT'S LEDGER AND NEVER LIMITED (`arrivalRun`): by the stored
         arrival's id, so a sender retrying the same bytes is counted once, and never a refusal. AFTER THE RECORD HAS
         ANSWERED AND NEVER IN ITS PLACE: a count that fails its tries is a line in the tail, and the sender still hears
         that its message landed, because it did. The line is the operator's JSON line (`oplog.ts`), because this is
         outside the alarm's region and every log line there goes through `op`. */
      const run = arrivalRun(out, arrival, Date.now());
      if (run !== null && (await meterPass((r, m) => directory.meter(r, m), rec, [run])) > 0)
        op({ op: 'usage', door: 'in', channel: arrival.channel, counted: false }, 'error');
      return out;
    },
    spends: async (ask) => spendArrival(`${ask.channel}:${ask.key}`),
    /* AND THE MAIL DOOR, WHICH WAS THE ONE KEY MISSING AND THEREFORE THE WHOLE SURFACE. `cloudIngest`
       spreads no `inbound` when this object has none, and `serveIngest` then answers 404 for all of
       `/in/email/*`, the way `/auth/provision` answers `off()` with no operator key set. That is what
       the hosted Worker gave every forwarded message until 2026-09-21, measured against it: four keys
       were written here where five were needed, with the dispatch, the parse, the budget and the
       record's own `arrive` finished and green above them. `route.test.ts` now reads this file for the
       key, because the fault was invisible to every test that supplied an index of its own. */
    inbound: { recordFor: (h) => directory.recordFor(h) },
  };
}

/**
 * `/api/vault/*`: the grant is checked by the record its bearer names, and then `keychain.ts` answers.
 *
 * THE DOORS GET KEYS ONLY WHEN `KEK` IS BOUND, and the store is opened inside them, after the grant, so a key store
 * that will not open says so only to a grant holder.
 *
 * AND THE DEPOSIT DOOR TAKES AN AGENT'S LOGIN TOKEN, checked as `/api` checks any bearer, by `bearerOf` in
 * `session.ts` and nothing else, so the record the key is sealed for is the one whose token table knew it.
 * `keychain.ts` asks it only for a bearer that is not a keychain grant, and only at
 * `/api/vault/deposit`; the record then adds the key as new, in the token's run's project, or refuses.
 */
async function keyDoor(request: Request, env: Env): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  /* A LOGIN TOKEN SPENDS ITS OWN WRITE MINUTE HERE, as the same token does at `/api/create` (`overLimit`). A keychain grant
     never reached this line before and still does not; a login token is the credential every agent holds, so without
     this one that leaked could add key rows with no cap. `serveKeychain` answers a refused token with the grant's sentence
     and reads no body, so nothing is deposited, and the 429 is put back in its place below. */
  const spent: { over: Response | null } = { over: null };
  const deps: GrantDeps = {
    knows: (id) => directory.knows(id),
    keychainGrant: async (id, bearer) => (await recordKeyHalf(env).keychainGrant(id, bearer)),
    token: async (asked) => {
      const found = await bearerOf(asked, 'api', bearerDeps(env));
      if ('status' in found)
        return found.status === 403
          ? { ok: false, refusal: found.refusal }
          : { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'That bearer is neither a keychain grant nor a login this BrainDog knows.', at: 'authorization' } };
      spent.over = await overLimit(env, { door: 'bearer', ctx: found.ctx }, asked, 'write');
      if (spent.over !== null) return { ok: false, refusal: { code: 'RATE_LIMITED', fix: 'This login has used its writes for this minute.', at: 'authorization' } };
      return ok({ record: found.record, ctx: found.ctx });
    },
    keys: isBound(env.KEK) ? keyHalf(env) : undefined,
  };
  const out = await serveWorkerKeychain(request, deps);
  return spent.over ?? out;
}

/** The record's half of both doors, over RPC. One shape, so the two doors cannot drift into different calls. */
function keyHalf(env: Env): KeyDeps {
  const record = (id: string) => env.RECORD.get(env.RECORD.idFromName(id));
  return {
    store: () => keyStoreOf(env.KEK),
    wrappingKey: (id) => record(id).wrappingKey(),
    /* `opts` IS `keychain.ts`'s, set on the login-token deposit alone, and handed on as it came. */
    depositGrant: async (id, args, by, hints, seal, opts?: { agentDeposit?: true | undefined }) =>
      (await record(id).depositGrant(args, by as unknown as KeychainGrant, hints, seal, opts)) as unknown as Result<Deposited>,
    openForGrant: async (id, args, by, hints, kekId) =>
      (await record(id).openForGrant(args, by as unknown as KeychainGrant, hints, kekId)) as unknown as Result<OpenedForGrant>,
    /* THE PASSPHRASE'S UNLOCK, over RPC: `unlock` is the Worker's, called back by the record after its keychain gate. */
    unlockKeychain: async (id, by, unlock) =>
      (await record(id).unlockKeychain(by as unknown as KeychainGrant, unlock)) as unknown as Result<KeychainPassphrase>,
  };
}

/** `keychainGrant` over RPC, which the keychain door needs and the app's doors do not: a session is not a grant. */
const recordKeyHalf = (env: Env) => ({
  keychainGrant: async (id: string, bearer: string) =>
    (await env.RECORD.get(env.RECORD.idFromName(id)).keychainGrant(bearer)) as unknown as Result<KeychainGrantSeen>,
});

/** The one sentence every caller that is not a browser session gets at `/api/keys/*`. It is the record's own. */
const noSession = (): Response =>
  json({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot reach the keychain.', at: 'principal' } }, 403);

/** What a token gets at `/api/slash/read`, from the router and from the object. The sentence is `serveSlash`'s own. */
const NO_SLASH_TOKEN: Refusal = { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this in the app; a token cannot ask Slash about this BrainDog.', at: 'principal' };
/** What any context that is not a signed-in session gets at `/api/slash/*` from the object. */
const NO_SLASH_UNSIGNED: Refusal = { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in to ask Slash about a record.', at: 'principal' };

/**
 * `/api/keys/*`: the app's own key doors, for the browser session `doorOf` has already resolved.
 *
 * THE RECORD IS THE SESSION'S. Nothing in the body names one, and the host step seals for the record whose cookie
 * this is. `serveKeys` has already refused a bearer and any origin this Worker does not answer for; what is left
 * for the record to decide is whether this person may reach the keychain at all, which is `keychain(ctx)`.
 */
function appKeys(request: Request, env: Env, id: string, ctx: CallContext): Promise<Response> {
  return serveWorkerKeys(request, ctx, {
    origins: new Set([`https://${env.PUBLIC_HOST ?? ''}`]),
    record: id,
    keys: isBound(env.KEK) ? keyHalf(env) : undefined,
  });
}

/**
 * `/api/inbound/*`: the record's forwarding address, for the browser session `doorOf` has already resolved.
 *
 * THE RECORD IS THE SESSION'S, as it is at `/api/keys/*`. Nothing in the request names a record, so there is no
 * way for one owner to mint an address onto somebody else's: what `inbound$` is handed is the id the cookie
 * resolved to. Which is also why this passes `id` and not a slug, since `dir_inbound.record` joins `dir_record`.
 *
 * THE DIRECTORY IS THE ONLY THING ASKED, and the record's own object is never woken. A forwarding address is a
 * fact about the tenant map rather than about the record's contents, which is what makes `/in/email/<token>`
 * resolvable before any object is addressed at all.
 */
function mailAddress(request: Request, env: Env, id: string, ctx: CallContext): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return serveInbound(
    request,
    {
      origins: new Set([`https://${env.PUBLIC_HOST ?? ''}`]),
      registers: async (hash) => {
        const stop = await directory.inbound$(id, hash);
        return stop === null ? { ok: true, value: null } : { ok: false, refusal: stop };
      },
    },
    ctx,
  );
}

/**
 * `POST /mcp`: what the headers can refuse, then the bearer, then the record's object reads the body.
 *
 * A BEARER AND NOTHING ELSE. This is reached before `doorOf`, so a session cookie is never read: an agent carries its
 * own credential, and a person in a browser has the app. `gate` is the transport's own, so the order is the
 * self-host's: 405, 403, 415, then 401.
 *
 * EVERY EARLY ANSWER READS THE BODY FIRST (`drained`), as the record's object does (1 Nov). `brain.dog/mcp` comes through
 * the site's service binding, which streams the body across as it arrives; answered unread (the watchdog's unsigned POST
 * every five minutes, a 401), the site logged "Can't read from request stream after response has been sent". The body
 * is at most `/mcp`'s ceiling by now (`guardBody`).
 */
async function agent(request: Request, env: Env): Promise<Response> {
  const early = gate(request);
  if (early) return drained(request, early);
  const found = await bearerOf(request, 'mcp', bearerDeps(env));
  /* THE 401 NAMES WHERE TO SIGN IN, so an MCP client that holds no token starts OAuth from it (RFC 9728).
     On the name it reached, so a client set up with `brain.dog/mcp` reads `brain.dog/mcp` as the resource
     (`mcpMetadataAt`). Without a public host there is no address to name, and the 401 is as it was. */
  const metadata = mcpMetadataAt(request, env.PUBLIC_HOST, env.LEGACY_HOSTS);
  if ('status' in found) return drained(request, found.status === 403 ? json({ ok: false, refusal: found.refusal }, 403) : unknownAgent(metadata));
  /* THE TOKEN'S MINUTE BEFORE THE RECORD READS THE BODY, and always the MCP budget (`RL_MCP`, else the read one): which tool is called is inside a
     body nobody has parsed yet (`classOf`), and the record still decides whether a write is allowed. */
  const over = await overLimit(env, { door: 'bearer', ctx: found.ctx }, request, 'mcp');
  if (over !== null) return drained(request, over);
  return env.RECORD.get(env.RECORD.idFromName(found.record)).fetch(inward(request, found.ctx));
}

/**
 * `/account/*`, through the same `serveAccount` the self-host runs: the Directory's usage ledger, for the session
 * cookie, and on this host billing's four doors (`billing.ts`). Without `SESSION_SECRET` nobody signs in, so every
 * account route but the webhook is 401; the webhook is Stripe's, has no cookie, and checks its own signature.
 *
 * A POST IS LIMITED BY ADDRESS BEFORE ANYTHING IS READ, on the write budget, as `/auth/*` is: a checkout and a portal
 * each spend a Stripe call, and the webhook is a public door. The address is
 * `cf-connecting-ip`, which Cloudflare writes and a caller cannot.
 *
 * THE BILLING DOORS ARE HANDED IN WHATEVER THE SETTINGS SAY: while billing is off the list says so and every other
 * door answers `NOT_IN_THIS_BUILD` with the sentence naming the setting (`billingKey`), so the rows are never a 404
 * that reads as a missing route.
 */
async function account(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === 'POST') {
    const over = await overLimit(env, null, request, 'write');
    if (over !== null) return over;
  }
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  /* THE ALLOWANCE FOLLOWS THE PLAN: the Directory meters the record under the plan it now pays for. AND SO DO ITS SLASH
     ASKS AND WHO MAY JOIN IT, AND ITS COUNT OF AGENTS, which are the record's own object's to keep (`Record$.planMoved`).
     A record that misses the word reads the plan from the Directory the next time it asks for it (`#planOf`: on a wake
     that finds no count of agents, at an invitation, at Slash), and writes the count of agents from it, so a failed
     RPC is logged and the plan still stands. Billing and the operator's gift door share it. */
  const setPlan: BillingDeps['setPlan'] = async (record, plan) => {
    const refused = await directory.setPlan(record, plan);
    if (refused !== null) return refused;
    try {
      await env.RECORD.get(env.RECORD.idFromName(record)).planMoved(plan);
    } catch (e) {
      op({ op: 'billing', did: 'plan.record', ok: false, rec: record, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
    return null;
  };
  if (OPS_INVITE.test(new URL(request.url).pathname)) return opsInvite(request, opsApplyDeps(env));
  if (OPS_APPLICATIONS.test(new URL(request.url).pathname)) return opsApplications(request, opsApplyDeps(env));
  /* THE OPERATOR'S FUNNEL (`funnel.ts`): the Directory's week totals and each open record's firsts, as counts only. */
  if (OPS_FUNNEL.test(new URL(request.url).pathname))
    return opsFunnel(request, {
      key: (env.PROVISION_KEY ?? '').trim(),
      readLimit: (r) => overLimit(env, null, r, 'read'),
      unauthorized: () => saidUnauthorized('operator', 'This route takes the operator key.'),
      read: (since) => directory.seen({ flow: 'funnel.read', since }),
      records: async (cursor) => directory.listRecords(cursor),
      firsts: (record) => env.RECORD.get(env.RECORD.idFromName(record)).firsts(),
      now: () => Date.now(),
    });
  /* THE OPERATOR'S GIFT OF A PLAN (`ops-plan.ts`): a record found by its name or id with who owns it, and the plan set
     through the same `setPlan` billing uses, so the record's own object hears of it. */
  if (OPS_PLAN.test(new URL(request.url).pathname))
    return opsPlan(request, env, {
      find: async (name) => {
        const named = await directory.resolve(name);
        const owner = named ? await directory.ownerOf(named.record) : null;
        return named && owner ? { record: named.record, owner } : null;
      },
      billing: ((call: BillingCall) => directory.billing(call)) as unknown as OpsPlanDeps['billing'],
      setPlan,
      people: (record) => env.RECORD.get(env.RECORD.idFromName(record)).walkPeople(),
      owned: async (person) => {
        const today = new Date().toISOString().slice(0, 10);
        const u = (await directory.usage(person, { from: today, to: today })) as unknown as Result<AccountUsage>;
        return u.ok ? { ok: true, value: u.value.records.filter((r) => !r.closed) } : u;
      },
    });
  if (OPS_ALERT.test(new URL(request.url).pathname)) return opsAlertDoor(request, env);
  if (OPS_RESTORE_POINT.test(new URL(request.url).pathname)) return opsRestorePoint(request, env);
  if (OPS_DRILL.test(new URL(request.url).pathname)) return opsDrill(request, env);
  if (DRILL.test(new URL(request.url).pathname)) return drillRead(request, env);
  const billing: BillingDeps = {
    clock: () => Date.now(),
    billing: ((call: BillingCall) => directory.billing(call)) as unknown as BillingDeps['billing'],
    usage: (person, range) => directory.usage(person, range) as unknown as Promise<Result<AccountUsage>>,
    /* FREE, TAKEN OR RELEASED, as `prepare` asks it, so checkout refuses a name the payment could not then be made under. */
    claimed: async (slug) => directory.slugClaimed(slug),
    provisionable,
    provision: (args) => provision(env, args),
    setPlan,
    /* THE RECORD'S OWN SWITCH, over RPC to its object by id: while it is on, the record
       answers reads and refuses writes, and its alarm runs the drain and nothing else. */
    setLapsed: (record, on) => env.RECORD.get(env.RECORD.idFromName(record)).setLapsed(on),
    /* WHO IS ON IT, from the record's own member table: a cancelled plan goes back to Free only for one person. */
    people: (record) => env.RECORD.get(env.RECORD.idFromName(record)).walkPeople(),
    stripe: (key) => stripeOf(key, () => Date.now()),
  };
  return serveAccount(request, {
    origin: `https://${env.PUBLIC_HOST ?? ''}`,
    auth: (env.SESSION_SECRET ?? '').length >= 32 ? (((call: AuthCall) => directory.auth(call)) as unknown as Auth) : null,
    usage: (person, range) => directory.usage(person, range) as unknown as Promise<Result<AccountUsage>>,
    records: async (person) => ({ ok: true as const, value: await directory.recordsFor(person) }),
    /* THE WAY BACK FROM A LOST MAILBOX, and only while this deployment can prove an address and sign somebody
       in: unset, both `/account/email` rows stay 404 `ROUTE_UNKNOWN`, as `ACCOUNT_ROUTES` promises a host that hands in
       no door. `mirror` reaches a record's own object over RPC, because the host holds no record here to call into. */
    ...(env.AUTH_MAIL_FROM && env.EMAIL && (env.SESSION_SECRET ?? '').length >= 32
      ? {
          email: {
            ask: (p: string, e: string) => directory.emailAsk(p, e) as unknown as Promise<Result<{ to: string; token: string | null }>>,
            move: (p: string, t: string) => directory.emailMove(p, t) as unknown as Promise<Result<{ from: string; to: string; records: string[] }>>,
            mirror: (record: string, person: string, change: { name?: string | undefined; email?: string | undefined }) =>
              env.RECORD.get(env.RECORD.idFromName(record)).mirrorPerson(person, change) as unknown as Promise<Result<unknown>>,
            mail: (kind: 'email.change' | 'email.changed', to: string, link?: string) => ctx.waitUntil(sendMail(env, kind, to, link ? { link } : {})),
          } satisfies EmailDoor,
        }
      : {}),
    /* CLOSING AN ACCOUNT, only where somebody can sign in: unset, the row stays 404 as `ACCOUNT_ROUTES`
       promises. Who owns a record is each record's own table, so every record this person holds at `owner` is asked
       for its owners over RPC, at most `CLOSE_RECORDS_MOST`; the rest are named back, and the door refuses. The
       Directory's half rides on `auth`, the one RPC it already answers for a person's way in, whose parameter does
       not name `AccountCall` yet: `Directory$.auth` hands it to `signInMarked`, which does. */
    ...((env.SESSION_SECRET ?? '').length >= 32
      ? {
          close: closeDoor({
            alone: async (who) => {
              const me = who.email.trim().toLowerCase();
              const owned = (await directory.recordsFor(who.person)).filter((r) => r.level === 'owner').map((r) => r.slug);
              const alone = owned.slice(CLOSE_RECORDS_MOST);
              for (const slug of owned.slice(0, CLOSE_RECORDS_MOST)) {
                const named = await directory.resolve(slug);
                if (!named) continue;
                const owners = await env.RECORD.get(env.RECORD.idFromName(named.record)).walkOwners();
                if (!owners.some((email) => email.trim().toLowerCase() !== me)) alone.push(slug);
              }
              return alone;
            },
            close: (call) => directory.auth(call) as unknown as Promise<AuthResult<AccountClosed>>,
            mail: (to) => ctx.waitUntil(sendMail(env, 'sessions.ended', to)),
            now: () => Date.now(),
          }),
        }
      : {}),
    ...billingDoors(env, billing),
  });
}

/** The operator's door to the sign-up codes, with the slashes every other door here forgives. */
const OPS_INVITE = /^\/+account\/+ops\/+invite\/*$/;

/** The operator's door to a plan given as a gift (`ops-plan.ts`), with the same forgiveness. */
const OPS_PLAN = /^\/+account\/+ops\/+plan\/*$/;

/** The operator's door to the applications (`apply.ts`), with the same forgiveness. */
const OPS_APPLICATIONS = /^\/+account\/+ops\/+applications\/*$/;

/** The operator's funnel (`funnel.ts`), with the same forgiveness. */
const OPS_FUNNEL = /^\/+account\/+ops\/+funnel\/*$/;

/**
 * What `/account/ops/invite` and `/account/ops/applications` are handed (`apply.ts`): the provision key, a GET's count by
 * address (a POST is already counted in `account()`), the one 401, the Directory's two groups, and the `invite.ready`
 * letter, sent from `AUTH_MAIL_FROM` and awaited, so the answer can say whether it went.
 */
function opsApplyDeps(env: Env): OpsApplyDeps {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return {
    key: (env.PROVISION_KEY ?? '').trim(),
    origin: `https://${env.PUBLIC_HOST ?? ''}`,
    readLimit: (request) => overLimit(env, null, request, 'read'),
    unauthorized: () => saidUnauthorized('operator', 'This route takes the operator key.'),
    invites: (call) => directory.invites(call) as never,
    applications: (call) => directory.applications(call) as never,
    mail: (to, vars) => sendMail(env, 'invite.ready', to, vars),
    now: () => Date.now(),
  };
}

/** The operator's door to the `model` mail, with the slashes every other door here forgives. */
const OPS_ALERT = /^\/+account\/+ops\/+alert\/*$/;

/**
 * `/account/ops/alert`: the `model-checks` workflow's way to send the `model` operator mail, so a red night is mailed and
 * not only a red run on GitHub. `POST { op: 'model', model?, why? }`, each string cut to 200 characters, and nothing but
 * `model` is taken. Guarded as `/account/ops/invite` is: 404 with no `PROVISION_KEY`, 401 on a wrong key. The mail goes
 * at most once in its quiet window (`alertClaim`), and `sent` says whether this call sent it.
 */
async function opsAlertDoor(request: Request, env: Env): Promise<Response> {
  const key = (env.PROVISION_KEY ?? '').trim();
  if (key === '') return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog has no operator key, so it has no operator doors.' } }, 404);
  if (request.method !== 'POST')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/ops/alert is written with POST.' } }, 405, [['allow', 'POST']]);
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' || !(await sameKey(bearer, key)))
    return saidUnauthorized('operator', 'This route takes the operator key.');
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, SIGNUP_BODY_MAX));
  } catch {
    body = null;
  }
  const said = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (said === null || said['op'] !== 'model')
    return json({ ok: false, refusal: { code: 'BODY_MALFORMED', fix: "/account/ops/alert takes { op: 'model', model?, why? } as JSON.", at: 'op', allowed: ['model'] } }, 400);
  const cut = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v.slice(0, 200) : undefined);
  const model = cut(said['model']);
  const why = cut(said['why']);
  const sent = await opsAlert(env, { op: 'model', ...(model ? { model } : {}), ...(why ? { why } : {}) }, alertClaim(env));
  return json({ ok: true, value: { sent } }, 200);
}

/** The operator's door to a deploy's restore point, with the slashes every other door here forgives. */
const OPS_RESTORE_POINT = /^\/+account\/+ops\/+restore-point\/*$/;

/**
 * `/account/ops/restore-point`: the deploy workflow's restore point (`restore-point.ts`). `POST { commit?,
 * check?, cursor?, open? }`. With `check: true` it opens every record written in the last seven days once and copies nothing,
 * which is what the workflow asks on every deploy; without it each of those records takes a `before-deploy-<commit>`
 * copy, which the workflow asks only when a migration changed. It answers counts, never a record's name, and `cursor`
 * while there is more to walk. ANY `failed` IS A 500, so the step that asked turns red. `open: true` is the caller
 * saying this host holds a record: a whole walk that then asked nobody is counted in `failed`, and so is a 500 too.
 *
 * Guarded as `/account/ops/invite` is: 404 with no `PROVISION_KEY`, 401 on a wrong key or none, a session cookie
 * included, because the operator key is the one thing it reads. A copy needs `BLOBS`; check mode does not.
 */
async function opsRestorePoint(request: Request, env: Env): Promise<Response> {
  const key = (env.PROVISION_KEY ?? '').trim();
  if (key === '') return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog has no operator key, so it has no operator doors.' } }, 404);
  if (request.method !== 'POST')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/ops/restore-point is asked with POST.' } }, 405, [['allow', 'POST']]);
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' || !(await sameKey(bearer, key)))
    return saidUnauthorized('operator', 'This route takes the operator key.');
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, SIGNUP_BODY_MAX));
  } catch {
    body = null;
  }
  const ask = readRestorePoint(body);
  if (!ask.ok) return json({ ok: false, refusal: { code: 'BODY_MALFORMED', fix: ask.fix, at: ask.at } }, 400);
  if (!ask.value.check && !env.BLOBS)
    return json({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This deployment has no bucket, so there is nowhere to put a restore point. Check mode still runs.' } }, 503);
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const tally = await restorePoint(
    {
      records: async (cursor) => directory.listRecords(cursor, 60),
      point: async (record, asked) => (await env.RECORD.get(env.RECORD.idFromName(record)).restorePoint(asked)) as PointAnswer,
      failed: (record, why) => op({ op: 'restore-point', rec: record, check: ask.value.check, why }, 'error'),
      now: () => Date.now(),
    },
    ask.value,
  );
  op({ op: 'restore-point', mode: tally.mode, label: tally.label, asked: tally.asked, records: tally.records, copied: tally.copied, failed: tally.failed, more: tally.cursor !== undefined });
  return json({ ok: tally.failed === 0, value: { ...tally, said: sayTally(tally) } }, tally.failed === 0 ? 200 : 500);
}

/** The operator's door to the restore drill's report, and a signed-in person's read of the host's last drill. */
const OPS_DRILL = /^\/+account\/+ops\/+drill\/*$/;
const DRILL = /^\/+account\/+drill\/*$/;

/**
 * `/account/ops/drill`: the restore drill's counts (`restore-drill.mjs --report`). `POST { at, pass, copies,
 * rows, lists, people, records }`, read by `readDrill` and kept as the host's last drill in the Directory. When
 * `OPS_RECORD` names the operator's record it also takes the note `drill <date> · pass · <n> records` (`· directory only` where no record's copy was opened), as the walk's
 * summary does; a note that could not be written is a line, and the drill is still kept.
 *
 * Guarded as `/account/ops/restore-point` is: 404 with no `PROVISION_KEY`, 401 on a wrong key or none, a session cookie
 * included, because the operator key is the one thing it reads.
 */
async function opsDrill(request: Request, env: Env): Promise<Response> {
  const key = (env.PROVISION_KEY ?? '').trim();
  if (key === '') return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog has no operator key, so it has no operator doors.' } }, 404);
  if (request.method !== 'POST')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/ops/drill is told with POST.' } }, 405, [['allow', 'POST']]);
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' || !(await sameKey(bearer, key)))
    return saidUnauthorized('operator', 'This route takes the operator key.');
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, SIGNUP_BODY_MAX));
  } catch {
    body = null;
  }
  const told = readDrill(body);
  if (!told.ok) return json({ ok: false, refusal: { code: 'BODY_MALFORMED', fix: told.fix, at: told.at } }, 400);
  const drill = told.value;
  const kept = await env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).drill({ op: 'put', drill });
  /* AN OLDER DRILL THAN THE ONE KEPT IS IGNORED: no note is written, and the answer is the drill the host keeps. */
  if (olderDrill(drill, kept)) {
    op({ op: 'drill', ignored: 'older', at: drill.at });
    return json({ ok: true, value: drillAnswer(kept) }, 200);
  }
  op({ op: 'drill', pass: drill.pass, copies: drill.copies, rows: drill.rows, lists: drill.lists, people: drill.people, records: drill.records });
  const opsRecord = (env.OPS_RECORD ?? '').trim();
  if (opsRecord !== '') {
    let noted = false;
    let why = 'the record is deleted, not made, or refused by this build';
    try {
      noted = await env.RECORD.get(env.RECORD.idFromName(opsRecord)).opsNote(drillNote(drill));
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
    }
    if (!noted) op({ op: 'drill', rec: opsRecord, note: 'failed', why }, 'error');
  }
  return json({ ok: true, value: drillAnswer(drill) }, 200);
}

/**
 * `GET /account/drill`: the host's last restore drill for anyone signed in, `{ at, pass, record_copies, directory_only }` or `{ at: null }`
 * before the first. THE SAME ANSWER FOR EVERY PERSON, because it is a fact about the host and never about one record
 * (the scope's critic), and it holds counts only. Without sign-in on this host, or without a session, it is 401.
 */
async function drillRead(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/drill is read with GET.' } }, 405, [['allow', 'GET, HEAD']]);
  const mode = cookieMode(`https://${env.PUBLIC_HOST ?? ''}`);
  const sid = mode === null || (env.SESSION_SECRET ?? '').length < 32 ? undefined : readSid(request, mode);
  const refused = () => saidUnauthorized('drill', 'Sign in to read when this host last tested its backups.');
  if (mode === null || sid === undefined) return refused();
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const out = (await directory.auth({ flow: 'session', sid })) as unknown as AuthResult<Who>;
  if (out.status !== 200) return refused();
  const cookie = out.session === undefined ? undefined : out.session === 'clear' ? clearCookie(mode) : sessionCookie(out.session.sid, mode);
  return withCookie(json({ ok: true, value: drillAnswer(await directory.drill({ op: 'read' })) }, 200), cookie);
}

/**
 * `/auth/*`, through the same `serveAuth` the self-host runs, and shipped switched off.
 *
 * WITHOUT `SESSION_SECRET` THE DIRECTORY HOLDS NO KEY, so `/auth/methods` says `not-configured` and every
 * other route is 404; without `PROVISION_KEY` the two operator routes are 404 as well. The address the
 * lockout counts is `cf-connecting-ip`, which Cloudflare writes and a caller cannot.
 */
async function signIn(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const url = new URL(request.url);
  /* SIGN-UP IS ANSWERED HERE AND NOT BY `serveAuth`, which declares its three rows and answers each as a way in this
     host does not offer until a host serves them (`packages/host/src/auth.ts`). Only the Worker ever will: a self-host
     is made by its operator. */
  const signupPath = url.pathname.replace(/\/+$/, '');
  /* A STRANGER'S FIRST SENTENCE READ BY THE INCLUDED MODEL (`first-read.ts`), off until `FIRST_READ_DAILY` is set, and
     read by `readSetup`: the model call and the reading, with no record, owner or ledger. */
  if (signupPath === '/auth/signup/read')
    return serveFirstRead(
      request,
      firstReadDoorOf(env, {
        origin: `https://${env.PUBLIC_HOST ?? ''}`,
        readSetup,
        store: { hit: (key, day, most) => directory.firstReadHit(key, day, most) as unknown as Promise<boolean> },
      }),
    );
  if (Object.hasOwn(SIGNUP_ROUTES, signupPath)) return signUp(request, env, ctx, signupPath as keyof typeof SIGNUP_ROUTES);
  /* ASKING FOR AN INVITATION (`apply.ts`), answered only while sign-up is by invitation, in the order `signUp` keeps. */
  if (signupPath === '/auth/apply') {
    const origin = `https://${env.PUBLIC_HOST ?? ''}`;
    return applyDoor(request, {
      mode: signupMode(env),
      on: (env.SESSION_SECRET ?? '').length >= 32 && cookieMode(origin) !== null,
      origin,
      sameOrigin: (asked) => sameOrigin(asked, origin),
      checked: botCheckKeyed(env),
      turnstile: (answer, ip) => turnstilePassed(env, answer, ip, 'apply'),
      apply: (call) => directory.applications(call) as never,
    });
  }
  /* GOOGLE IS ANSWERED HERE FOR THE SAME REASON, and only where sign-in is on and a client is set. Without one the
     rows fall through to `serveAuth`, which answers each as a way in this host does not offer. */
  const origin = `https://${env.PUBLIC_HOST ?? ''}`;
  const mode = cookieMode(origin);
  const google = googleOn(env) && (env.SESSION_SECRET ?? '').length >= 32 && mode !== null;
  if (google && Object.hasOwn(GOOGLE_ROUTES, signupPath))
    return serveGoogle(request, signupPath as keyof typeof GOOGLE_ROUTES, {
      origin,
      mode,
      clientId: (env.GOOGLE_CLIENT_ID ?? '').trim(),
      clientSecret: (env.GOOGLE_CLIENT_SECRET ?? '').trim(),
      secret: env.SESSION_SECRET ?? '',
      ip: request.headers.get('cf-connecting-ip') ?? '',
      ask: (call) => directory.auth(call) as unknown as Promise<AuthResult>,
    });
  /* THE MAC APP'S WAY BACK FROM A BROWSER (`desktop-signin.ts`): an emailed link handed back as a one-time code, and the
     code swapped in the app's window. Wherever sign-in is on, whatever Google says; off, the rows fall through to
     `serveAuth`, which answers each as a way in this host does not offer. */
  if ((env.SESSION_SECRET ?? '').length >= 32 && mode !== null && Object.hasOwn(DESKTOP_ROUTES, signupPath))
    return serveDesktop(request, signupPath as keyof typeof DESKTOP_ROUTES, {
      origin,
      mode,
      secret: env.SESSION_SECRET ?? '',
      ip: request.headers.get('cf-connecting-ip') ?? '',
      ask: (call) => directory.auth(call) as unknown as Promise<AuthResult>,
    });
  /* THE ZONE IS READ FROM A COPY OF THE BODY, because `operated()` in `packages/host/src/auth.ts` hands `provision`
     the slug, the email and the name and drops every other field, so a `tz` in the body never arrived here and every
     record was made in `UTC`. The copy is read only inside the
     `provision` callback, which `operated()` calls after it has checked the operator key and parsed the same bytes as
     a JSON object, so an unauthenticated POST never has its copy read. When `operated()` forwards `tz` itself, this
     copy and `askedZone` go. */
  const copy = request.method === 'POST' && url.pathname.replace(/\/+$/, '') === '/auth/provision' ? request.clone() : null;
  /* SIGN-IN LINK REQUESTS ARE CHECKED TOO (`turnstile.ts`): on with both keys, off with either missing, so a half-keyed
     host never locks its own sign-in. The same fail-closed check sign-up uses. */
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  if (request.method === 'POST' && signupPath === '/auth/magic/start') {
    const body = botCheckKeyed(env) ? ((await request.clone().json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (!(await turnstilePassed(env, body?.['turnstile'], ip, 'magic')))
      return signupRefused(403, { code: 'FORBIDDEN', fix: NOT_A_PERSON, at: 'turnstile' });
  }
  const served = await serveAuth(request, {
    on: 'worker',
    origin,
    google,
    /* WHETHER SIGN-IN MAIL IS DOWN: the last five letters all failed, the newest inside the quarter hour
       (`Directory$.lettersDown`), so `/auth/methods` answers `magic: 'down'` and the page says so. */
    mailDown: () => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).lettersDown(),
    auth: ((call: AuthCall) => directory.auth(call)) as unknown as Auth,
    ip: request.headers.get('cf-connecting-ip') ?? '',
    /* MAIL ONLY WHEN BOTH ARE SET, so a host that cannot send says so by offering no `mail` at all. THE ANSWER NEVER
       WAITS FOR IT: the send is awaited inside `waitUntil`, which keeps it alive after the answer has gone, so a known
       address and an unknown one answer in the same time. Every mail a flow returns goes through `sendMail`
       (`mail.ts`), which never throws and writes its own `op: 'mail'` line with the kind and the outcome, never the
       address or the link. THE KIND IS THE ONE THE DOOR HANDS ON when it names a letter (a passkey notice, an
       invitation's proof), and a sign-in link otherwise, which is what a door that hands on no kind is sending. */
    ...(env.AUTH_MAIL_FROM && env.EMAIL
      ? {
          mail: (to: string, link: string, kind?: string) =>
            ctx.waitUntil(signInLetter(env, isMailKind(kind) ? kind : 'signin', to, { link })),
        }
      : {}),
    operator: { key: env.PROVISION_KEY, provision: async (args) => provision(env, { ...args, tz: await askedZone(copy) }) },
    /* THE NAME THE REQUEST CAME BY, so a device that reached this Worker at another address is not sent to
       `PUBLIC_HOST` to be approved. Devices sign in only where sign-in is on, because approving needs a session. */
    reached: url.host,
    ...((env.SESSION_SECRET ?? '').length >= 32 ? { device: devices(env), invite: invites(env) } : {}),
  });
  /* THE SIGN-IN PAGE LEARNS THE SITE KEY FROM `/auth/methods`, which it already asks, and only when the check is on. */
  const signinKey = turnstileSiteKey(env);
  if (signinKey !== null && request.method === 'GET' && signupPath === '/auth/methods' && served.status === 200) {
    const out = (await served.clone().json().catch(() => null)) as { ok?: unknown; value?: object } | null;
    if (out?.ok === true && out.value) {
      const headers = new Headers(served.headers);
      headers.delete('content-length');
      return new Response(JSON.stringify({ ...out, value: { ...out.value, turnstile: signinKey } }), { status: 200, headers });
    }
  }
  return served;
}

/**
 * A letter a person waits on at sign-in or sign-up, sent, and whether it went told to the Directory, so
 * sign-in can say "mail is not going out" when the last five did not (`Directory$.lettersDown`).
 *
 * STILL INSIDE `waitUntil`, AFTER THE ANSWER: a known and an unknown address answer in the same time, as they always did.
 * AN ADDRESS'S OWN FAULT IS NOT COUNTED (`mailOutcome`), so the count is the host's and says nothing about who is signed
 * up. A Directory that does not take the count is a line, and the letter's outcome stands.
 */
async function signInLetter(env: Env, kind: MailKind, to: string, vars: MailVars): Promise<boolean> {
  const outcome = await mailOutcome(env, kind, to, vars);
  if (outcome !== 'address' && isWaitedOn(kind)) {
    try {
      await env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).letterSent(outcome === 'sent');
    } catch (e) {
      op({ op: 'mail', kind, counted: false, why: e instanceof Error ? e.message : String(e) }, 'error');
    }
  }
  return outcome === 'sent';
}

/** The three sign-up routes and the one method each answers, as `AUTH_ROUTES` declares them. */
const SIGNUP_ROUTES = { '/auth/signup/start': 'POST', '/auth/signup/verify': 'POST', '/auth/signup/name': 'GET' } as const;

/** The most a sign-up body may be: an address, a name, a person's name, a zone and a Turnstile answer fit many times over. */
const SIGNUP_BODY_MAX = 8_192;

/**
 * The most of what a person said that a sign-up carries (`said`), in characters: the sentence and its one answer, as the
 * page packs them, so a link opened on another device keeps it. The Directory's own rule (`SAID_IN_LINK` in
 * `packages/record/src/identity.ts`) says the same number and is the one that also refuses an address in it; this is the
 * door's, so a longer one is refused before the Directory is asked or anything is mailed. Inside that number the
 * Directory also fits it to `SAID_LINK_BYTES` (2,000 bytes as the link writes it), and there it cuts, never refuses.
 */
const SIGNUP_SAID_MOST = 1_000;


/* A sign-up answer is one browser's and never a cache's, as every `/auth` answer is. */
const signupReply = (status: number, payload: object, extra: readonly (readonly [string, string])[] = []): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ['x-content-type-options', 'nosniff'], ...extra.map(([k, v]): [string, string] => [k, v])],
  });

const signupRefused = (status: number, refusal: Refusal, extra: readonly (readonly [string, string])[] = []): Response =>
  signupReply(status, { ok: false, refusal }, extra);

/**
 * `/auth/signup/*`: a stranger asking for a record of their own.
 *
 * THE SAME ORDER `serveAuth` KEEPS. The method first; then whether sign-in is on at all (a `SESSION_SECRET` and an
 * origin a cookie can be set on); then, on a POST, the origin and the content type before the body is read, so a page
 * elsewhere gets a 403 and the Directory never hears of it; and only then the Directory. The answers are the `/auth`
 * envelope, so the page reads them as it reads every sign-in answer.
 *
 * `/auth/signup/name` ALSO SAYS WHO MAY SIGN UP, as `mode` (`launch.ts`), and the Turnstile site key when anybody may,
 * because the page is a stranger's and has no other door that answers without a session. `SIGNUP` alone decides it,
 * billing on or off, because the record a stranger makes first is a free one. `open` beside `mode` is `mode` is not
 * `closed`, KEPT FOR ONE RELEASE so a tab loaded before this one still reads it. Closed, the page asks nothing and
 * `start` refuses with the sentence. A proof already in a mailbox is still spent by `verify`, which makes a person and
 * no record.
 *
 * BY INVITATION, `start` CARRIES THE PAGE'S `code` TO THE DIRECTORY, which holds it for the proof it mails or answers
 * `needs: 'code'`, said here as a 403 at `code`. A known address is mailed its sign-in link either way, and gets the
 * same 403, so the refusal tells nobody who is here.
 *
 * TURNSTILE IS CHECKED ON `start` WHEN BOTH ITS KEYS ARE SET (`turnstile.ts`), in `invite` as in `open`, against the address
 * Cloudflare wrote (`cf-connecting-ip`, as `remoteip`), and a failed or missing answer is a 403 with a sentence. Unset,
 * the Directory's lockouts (`signup:<ip>`, `signup-email:<address>`, `email:<address>`) are the whole of the brake, and
 * the Directory is told so (`checked`), which tightens the first two to `SIGNUP_UNCHECKED`.
 *
 * THE MAIL GOES OUT WITHOUT BEING WAITED FOR, through `sendMail` inside `waitUntil`, as every `/auth` letter does, so an
 * address that already has an account answers in the time a new one does. A known address is sent a sign-in link
 * (`/signin#magic=`), which the sign-in page already spends; a new one the proof (`/signup#verify=`).
 */
async function signUp(request: Request, env: Env, ctx: ExecutionContext, path: keyof typeof SIGNUP_ROUTES): Promise<Response> {
  const method = SIGNUP_ROUTES[path];
  if (request.method !== method) return signupRefused(405, { code: 'FORBIDDEN', fix: `${path} is a ${method}.` }, [['allow', method]]);

  const origin = `https://${env.PUBLIC_HOST ?? ''}`;
  const mode = cookieMode(origin);
  if ((env.SESSION_SECRET ?? '').length < 32 || mode === null)
    return signupRefused(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' });

  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  /* THE RPC STUB'S TYPE IS A CAST, as `serveAuth`'s door is: the Directory answers `AuthResult` over the wire. */
  const ask = ((call: SignupCall) => directory.auth(call)) as unknown as (call: SignupCall) => Promise<AuthResult>;
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  /* ONE SWITCH, `SIGNUP` (`launch.ts`). Free needs no payment, so a record is made at no
     charge wherever sign-up is not closed, and the paid plans are offered where billing is on. */
  const allowed = signupMode(env);
  const open = allowed !== 'closed';

  if (method === 'GET') {
    const slug = new URL(request.url).searchParams.get('slug') ?? '';
    const out = await ask({ flow: 'signup.name', slug: slug.slice(0, 256) });
    if (out.status !== 200) return signupAnswer(out, mode);
    const siteKey = turnstileSiteKey(env);
    return signupReply(200, { ok: true, value: { ...(out.body as object), mode: allowed, open, ...(open && siteKey !== null ? { turnstile: siteKey } : {}) } });
  }

  if (!sameOrigin(request, origin))
    return signupRefused(403, { code: 'FORBIDDEN', fix: `Sign-up is answered only for pages on ${origin}.`, at: 'origin' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return signupRefused(400, { code: 'BODY_MALFORMED', fix: `${path} takes a JSON object, sent as application/json.` });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > SIGNUP_BODY_MAX)
    return signupRefused(413, { code: 'BODY_MALFORMED', fix: `${path} takes at most ${SIGNUP_BODY_MAX} bytes.` });
  const raw = await request.text().catch(() => '');
  if (raw.length > SIGNUP_BODY_MAX) return signupRefused(413, { code: 'BODY_MALFORMED', fix: `${path} takes at most ${SIGNUP_BODY_MAX} bytes.` });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return signupRefused(400, { code: 'BODY_MALFORMED', fix: `${path} takes a JSON object, sent as application/json.` });
  const body = parsed as Record<string, unknown>;
  const said = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string) : '');

  let call: SignupCall | SignupStart;
  if (path === '/auth/signup/start') {
    if (!open) return signupRefused(403, { code: 'NOT_IN_THIS_BUILD', fix: SIGNUP_CLOSED });
    /* WHAT SHE SAID GOES THROUGH UNTOUCHED, not trimmed and not read: the Directory puts it in the mailed link's
       fragment and nowhere else (link-carry-45). Only its type and its length are the door's to refuse, and before the
       Turnstile answer is spent, so a sentence too long costs her no second check. */
    const sentence = body['said'];
    if (sentence !== undefined && typeof sentence !== 'string')
      return signupRefused(400, { code: 'BODY_MALFORMED', fix: 'What you said is sent as text.', at: 'said' });
    if (typeof sentence === 'string' && sentence.length > SIGNUP_SAID_MOST)
      return signupRefused(400, { code: 'BODY_MALFORMED', fix: 'The link carries at most 1,000 characters of what you said. Shorten it, or leave the rest for later.', at: 'said' });
    if (!(await turnstilePassed(env, body['turnstile'], ip, 'signup')))
      return signupRefused(403, { code: 'FORBIDDEN', fix: NOT_A_PERSON, at: 'turnstile' });
    const name = said('name').trim();
    const tz = said('tz').trim();
    const code = said('code').trim();
    call = {
      flow: 'signup.start',
      email: said('email'),
      slug: said('slug'),
      ip,
      checked: botCheckKeyed(env),
      ...(allowed === 'invite' ? { invite: true, ...(code !== '' ? { code } : {}) } : {}),
      ...(name !== '' ? { name } : {}),
      ...(tz !== '' ? { tz } : {}),
      ...(typeof sentence === 'string' && sentence !== '' ? { said: sentence } : {}),
    };
  } else {
    const presented = readSid(request, mode);
    call = { flow: 'signup.verify', token: said('token'), ip, ...(presented === undefined ? {} : { sid: presented }) };
  }

  const out = await ask(call);
  const mail = out.status === 200 ? out.mail : undefined;
  if (mail && 'kind' in mail && (mail.kind === 'signup.verify' || mail.kind === 'signup.known') && env.AUTH_MAIL_FROM && env.EMAIL) {
    const link = mail.kind === 'signup.known' ? `${origin}/signin#magic=${mail.link}` : `${origin}/signup#verify=${mail.link}`;
    ctx.waitUntil(signInLetter(env, mail.kind, mail.to, { link }));
  }
  /* AFTER THE MAIL, so a known address is still sent its sign-in link, and the 403 is the one every address gets. */
  if (out.status === 200 && (out.body as Partial<SignupNeeds> | undefined)?.needs === 'code')
    return signupRefused(403, { code: 'FORBIDDEN', fix: CODE_NEEDED, at: 'code' });
  return signupAnswer(out, mode);
}

/** The Directory's answer as the `/auth` envelope: the status, the cookie, and `Retry-After` on a 429. Never the mail. */
function signupAnswer(out: AuthResult, mode: NonNullable<ReturnType<typeof cookieMode>>): Response {
  const extra: (readonly [string, string])[] = [];
  if (out.session === 'clear') extra.push(['set-cookie', clearCookie(mode)]);
  else if (out.session !== undefined) extra.push(['set-cookie', sessionCookie(out.session.sid, mode)]);
  switch (out.status) {
    case 200:
      return signupReply(200, { ok: true, value: out.body }, extra);
    case 429:
      extra.push(['retry-after', String(out.retryAfter)]);
      return signupReply(429, { ok: false, retryAfter: out.retryAfter }, extra);
    case 503:
      return signupReply(503, { ok: false }, extra);
    default:
      return signupRefused(out.status, out.refusal, extra);
  }
}

/**
/**
 * WHETHER A RECORD'S PLAN TAKES A SECOND PERSON, and the one place the Cloud reads it (`teamsOn`, the plan table's
 * `teams`): an invitation, a share to an address and a link opened all ask here, so a plan's people limit, when billing
 * adds one, is read in one line. No refusal while this host sells no plan; the sentence names the move to Cloud Plus only
 * where it is sold.
 */
function teamsStop(env: Env, plan: string | null, said: string): Refusal | null {
  if (!sells(env) || teamsOn(plan)) return null;
  return { code: 'FORBIDDEN', fix: said, at: 'plan' };
}

/**
 * An invitation link's two halves, over RPC: the record its token names, and the Directory.
 *
 * THE TOKEN CARRIES ITS RECORD ID, as a bearer does, so the object is found without a search. A token naming no
 * record this Directory holds is a dead link, in the same words as a spent one.
 */
function invites(env: Env): InviteDoor {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const recordOf = async (inviteToken: string) => {
    const id = inviteToken.slice(0, Math.max(0, inviteToken.indexOf('.')));
    return isRecordId(id) && (await directory.knows(id)) ? { id, stub: env.RECORD.get(env.RECORD.idFromName(id)) } : null;
  };
  const gone = { ok: false as const, refusal: { code: 'UNAUTHORIZED', fix: INVITE_GONE, at: 'token' } };
  return {
    /* THE RECORD'S LOOK, WHOLE: the address, the date, and what the link opens (`record`, `level`, `lists`). The RPC's
       type is a cast, so it is cast to the door's own answer, which `serveInvite` reads field by field. */
    look: async (inviteToken) => {
      const found = await recordOf(inviteToken);
      if (!found) return gone;
      /* A FREE RECORD IS ONE PERSON, SAID WHEN THE LINK IS OPENED, before a new address is sent a proof it cannot use. */
      if (env.TEAMS_HELD === '1') return { ok: false, refusal: { code: 'FORBIDDEN', fix: TEAMS_HELD_SAID, at: 'plan' } };
      const plan = sells(env) ? teamsStop(env, await directory.planFor(found.id), FREE_JOIN_REFUSED) : null;
      if (plan !== null) return { ok: false, refusal: plan };
      return (await found.stub.acceptInvite({ token: inviteToken })) as unknown as Awaited<ReturnType<InviteDoor['look']>>;
    },
    accept: async (inviteToken, person) => {
      const found = await recordOf(inviteToken);
      if (!found) return gone;
      /* FREE IS ONE PERSON, ASKED BEFORE THE RECORD SPENDS THE LINK, so a refused join leaves no member row behind in the
         record for the Directory to disagree with, and the link still works once the record is on Cloud. */
      const stop = (await directory.joinable(found.id, person.id)) as Refusal | null;
      if (stop !== null) return { ok: false, refusal: stop };
      const out = (await found.stub.acceptInvite({ token: inviteToken, person })) as unknown as Result<unknown>;
      if (!out.ok) return out;
      const joined = (await directory.joinRecord(found.id, person.id)) as unknown as Result<null>;
      if (!joined.ok) return joined;
      /* THE SLUG OF THE RECORD JUST JOINED, so `serveInvite` can move a signed-in person's session onto it. This
         answered the join's `null`, and a colleague who owns a record of their own was told they were on the invited
         one while their cookie still opened theirs (`test/invite-accept.test.ts`). `reaches` and not `resolve`, because the token names an id and the name is
         the Directory's to say. A record with no live name answers `null`, and the session stays where it was. */
      const slug = (await directory.reaches(person.id)).find((r) => r.record === found.id)?.slug ?? null;
      return { ok: true, value: { slug } };
    },
    known: async (email) => Boolean(await directory.inviteKnown(email)),
    person: async (email, name) => (await directory.invitee(email, name)) as unknown as Result<{ id: string; email: string; name: string | null }>,
  };
}

/**
 * The device grant's record half, over RPC: the record the slug names, or one refusal when it names none.
 *
 * THE SLUG TRAVELS ON BOTH CALLS, because a poll id says nothing about which record issued it and this Worker
 * holds many.
 */
function devices(env: Env): DeviceDoor {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const recordOf = async (slug: string | undefined) => {
    const found = slug ? await directory.resolve(slug) : null;
    return found ? env.RECORD.get(env.RECORD.idFromName(found.record)) : null;
  };
  const nowhere = {
    ok: false as const,
    refusal: { code: 'FORBIDDEN', fix: 'Name a record this BrainDog holds, as in braindog login https://<host>/<slug>.', at: 'slug' },
  };
  return {
    start: async ({ slug, ip, ...ask }) => {
      const record = await recordOf(slug);
      return record ? ((await record.deviceStart(ask, ip)) as unknown as Result<DeviceCode> | Limited) : nowhere;
    },
    poll: async ({ slug, device_code }) => {
      const record = await recordOf(slug);
      return record ? ((await record.devicePoll({ device_code })) as unknown as Result<Waiting | Exchanged>) : nowhere;
    },
  };
}

/** What a provision body said at `tz`, or nothing: the copy is the request `signIn` cloned, and `null` off that route. */
async function askedZone(copy: Request | null): Promise<unknown> {
  if (!copy) return undefined;
  try {
    return (JSON.parse(await copy.text()) as { tz?: unknown } | null)?.tz;
  } catch {
    return undefined;
  }
}

/**
 * A provision body's zone in the runtime's own spelling, `UTC` when it named none, and `null` when it is not a zone.
 *
 * CHECKED BY `Intl` AND NOT BY A LIST, for the reason `createRecord` gives: a table of zones is wrong the next time a
 * government moves one. `resolvedOptions` answers the canonical name, so `europe/london` is stored as `Europe/London`
 * and `GB` as `Europe/London` too, measured on Node 24.13.
 *
 * AN OFFSET IS NOT A ZONE. `Intl` accepts `+01:00` and answers it back unchanged, and a record in `+01:00` is an hour
 * out for the half of the year London is not on summer time. It is refused here rather than stored.
 *
 * AND AN OFFSET SPELLED AS A ZONE IS AN OFFSET, SO THE SPELLING TYPED IS READ AS WELL AS THE ONE `Intl` ANSWERS.
 * Measured on Node 24.13 (ICU 77.1, tz 2025b) and in workerd: `Etc/GMT-3`
 * is answered back as itself and is `+03:00` under a zone's name, and `EST` is answered as `America/Panama`, which reads
 * like any region's zone and has no summer time, so a record typed `EST` from New York is an hour out from March to
 * November. The answer cannot tell `EST` from somebody who meant Panama, which is why the typed word is the test, and
 * `EST` is one of twenty-eight: see `LEGACY_IDS`.
 * `Etc/UTC` and `Etc/GMT` stay, because UTC is not an offset from anywhere; `Intl` answers both `UTC`.
 * `SystemV/` goes whole: ICU still knows its twelve names though the tz database dropped them, answers each back as
 * itself, and `SystemV/EST5` was stored as a fixed -05:00 after the `Etc/` rule went in. The six with a summer rule are
 * not places either, and a reader outside ICU need not know them.
 */
function zoneOf(asked: unknown): string | null {
  if (asked === undefined || asked === null) return 'UTC';
  if (typeof asked !== 'string') return null;
  const typed = asked.trim().toUpperCase();
  if (LEGACY_IDS.has(typed)) return null;
  if (typed.startsWith('ETC/') && typed !== 'ETC/UTC' && typed !== 'ETC/GMT') return null;
  if (typed.startsWith('SYSTEMV/')) return null;
  try {
    const zone = new Intl.DateTimeFormat('en', { timeZone: asked.trim() }).resolvedOptions().timeZone;
    return /^[+-]/.test(zone) ? null : zone;
  } catch {
    return null;
  }
}

/**
 * ICU's legacy three-letter time zone IDs, in upper case: the twenty-five Java's `TimeZone` kept from JDK 1.1, which the
 * tz database does not hold, and `EST`, `MST` and `HST`, which it held as fixed offsets.
 *
 * EACH IS A CLOCK'S ABBREVIATION THAT `Intl` ANSWERS AS ONE PLACE, AND OFTEN NOT THE PLACE THE TYPIST MEANT. Only
 * `EST`, `MST` and `HST` were refused at first, and the other twenty-five were stored
 * for good (Node 24.13 and workerd alike):
 * `BST` as `Asia/Dhaka`, five hours ahead of London in the summer and six in the winter; `IST` as
 * `Asia/Calcutta` for somebody in Dublin; `CST` as `America/Chicago` for somebody in Shanghai; `NST` as
 * `Pacific/Auckland` and not Newfoundland; `ECT` as `Europe/Paris` and not Ecuador. Some land where the typist meant,
 * `JST` as `Asia/Tokyo`, and are refused all the same, because the answer cannot tell which typist it has.
 *
 * A LIST IS RIGHT HERE, WHERE `createRecord`'S REASON AGAINST ONE IS NOT. A table of zones is wrong the next time a
 * government moves one; this is a frozen compatibility table no government moves. It is also not written from memory:
 * `test/provision-tz.test.ts` asks the runtime about every three-letter word, all 17,576 of them, and requires each one
 * it takes as a zone to be refused here but the ten that stay, and those ten taken. On Node 24.13 (ICU 77.1) it takes
 * thirty-eight, and the ten kept are `UTC`, `UCT` and `GMT`, which are UTC; `CET`, `EET`, `MET` and `WET`, the tz
 * database's own names, which carry a summer rule and are answered as a place that keeps it; and `PRC`, `ROC` and
 * `ROK`, country links like `GB` and `NZ` that name the place they are answered as. `EST5EDT` and its kind stay for the
 * reason `CET` does.
 */
const LEGACY_IDS: ReadonlySet<string> = new Set([
  ...['ACT', 'AET', 'AGT', 'ART', 'AST', 'BET', 'BST', 'CAT', 'CNT', 'CST', 'CTT', 'EAT', 'ECT', 'IET', 'IST', 'JST', 'MIT', 'NET', 'NST', 'PLT', 'PNT', 'PRT', 'PST', 'SST', 'VST'],
  ...['EST', 'MST', 'HST'],
]);

/**
 * What a refused zone's fix says. For one of `LEGACY_IDS` it names the word and the place the runtime would have
 * filed it under, because `BST` refused as "an abbreviation" leaves somebody in London to guess what was wrong with it.
 */
function zoneFix(asked: unknown): string {
  const place = 'Type a zone that is a place, such as Europe/London for British time or America/New_York for Eastern time, or leave tz out for UTC.';
  const typed = typeof asked === 'string' ? asked.trim().toUpperCase() : '';
  if (!LEGACY_IDS.has(typed)) return 'tz takes a time zone that is a place, such as Europe/London or America/New_York, and not an offset or an abbreviation such as EST, or is left out for UTC.';
  /* ASKED UNDER `try` BECAUSE `zoneOf` REFUSES THESE BY THE WORD BEFORE IT ASKS `Intl`, so a runtime that did not know
     one would still arrive here, and a refusal that throws is a 500 on the one night he provisions. */
  let filed = '';
  try {
    filed = ` and the runtime files it under ${new Intl.DateTimeFormat('en', { timeZone: typed }).resolvedOptions().timeZone}`;
  } catch {
    /* the sentence stands without the place */
  }
  return `${typed} is an abbreviation, which names a clock and not a place,${filed}. ${place}`;
}

/**
 * Whether a provision's name is a placeholder nobody edited, which would be the owner's name for good.
 *
 * A NAME HOLDING `<` OR `>` WAS THE FIRST RULE, AND IT HELD ONE SPELLING. `provision-check.mjs` printed
 * `name = '<your name>'` to be changed by hand, the slug and the email each refused their placeholder, and this one was
 * taken: `personName` in `packages/host/src/invite.ts` allows brackets, so the owner's `me` and his passkey's display
 * name said `<your name>`. The rule was `/[<>]/`, and on a local Worker
 * `＜your name＞`, `‹your name›`, `[your name]`, `{your name}`, `&lt;your name&gt;`, `YOUR NAME` and `Your Name` were
 * each 200 and stored. The form no longer prints a placeholder at all,
 * so the rule is for one copied from anywhere else, an older copy of the form among them.
 *
 * SO A NAME IS REFUSED WHEN IT OPENS WITH AN OPENING BRACKET AND CLOSES WITH A CLOSING ONE: Unicode's own open and
 * close punctuation (`\p{Ps}`, `\p{Pe}`), which holds `[]`, `{}`, `()`, `〈〉`, `⟨⟩` and the full-width forms, and the
 * four angle pairs that are not in it, `<>`, `＜＞`, `‹›` and `«»`. The last two are quotation marks to Unicode, and
 * `«»` was left out at first, so `‹Name›` was refused and `«Name»` stored. The two need not be a pair, since `(Sam]`
 * is no more a name than `(Sam)`. BOTH ENDS AND NOT EITHER, so `Sam (work)`, which tells two of his own passkeys
 * apart, is a name, and so is `Zoë [Z] O’Brien`. And a name holding `<` or `>` anywhere, the entities `&lt;` or
 * `&gt;`, or the words `your name` in any case. `personName` has trimmed the edges by now; this trims again so the
 * rule does not lean on it.
 *
 * AND THE TWO ENDS HAVE TO BE ONE SPAN. Tested only at its ends, the rule refused `(ex-Acme) Sam (work)` and
 * `(Sam) [work]` at name through this Worker, which are `Sam (work)` said at both ends and a name with a note.
 * So a name is refused for its brackets when it is a run of opening
 * brackets, then no closing bracket at all, then a run of closing ones. THE RUNS ARE WHAT KEEPS `{{name}}` REFUSED:
 * with one bracket allowed at each end, `{{name}}`, `[[Name]]`, `{{ owner }}` and `((Name))` each have a closing
 * brace between their ends and would have been stored. Both forms were run over the spellings in
 * `test/provision-tz.test.ts` and those four, and the one-bracket form got 4 wrong where the runs got none.
 *
 * `“` `”` AND `‘` CLOSE A NAME AND DO NOT OPEN ONE, because `„` and `‚`, the German and Polish opening quotes, are
 * already opening brackets to Unicode and these are what close them. Without them `„Anita“` was stored where
 * `«Anita»` was refused, the same nickname decided two ways by which country typed it. They open nothing here so
 * that `“Name”` stays what it was, a spelling the rule does not chase: the form prints no placeholder any more, and a
 * list of spellings has no end. `’` is left out of the closers, since it is the apostrophe in `O’Brien`, and every
 * closer is also a bracket that breaks the span: with `’` among them `[O’Brien]` was stored where `[Sam]` is refused.
 */
function placeholderName(name: string): boolean {
  const trimmed = name.trim();
  if (/[<>]/u.test(trimmed) || /&[lg]t;/iu.test(trimmed) || /\byour\s+name\b/iu.test(trimmed)) return true;
  if (mergeField(trimmed)) return true;
  return /^[\p{Ps}<＜‹«]+[^\p{Pe}>＞›»“”‘]*[\p{Pe}>＞›»“”‘]+$/u.test(trimmed);
}

/**
 * Whether a name holds a mail-merge field nobody filled, anywhere in it.
 *
 * ONE SPAN AT BOTH ENDS WAS NOT THE WHOLE CLASS. A form filled from a template stored
 * `{{first_name}} {{last_name}}` as an owner's name: two spans, so neither end-to-end rule above matched it, and every
 * place the name is drawn said it for good. A merge field is a doubled bracket around a word (`{{first}}`, `[[Name]]`),
 * or the other spellings template tools print: `${first}`, `*|FNAME|*` and `%FIRST_NAME%`. A single bracket inside a
 * name stays a name (`Bo {B} Tanner`, `Ada (work)`), because only the doubled one is a template's.
 */
function mergeField(name: string): boolean {
  return (
    /[\p{Ps}]{2}[^\p{Ps}\p{Pe}]*[\p{Pe}]{2}/u.test(name) ||
    /\$\{[^}]*\}/u.test(name) ||
    /\*\|[^|]*\|\*/u.test(name) ||
    /%[\p{L}_]+%/u.test(name)
  );
}

/**
 * The checks a provision makes before anything is written: the zone, in the runtime's own spelling, or why the zone or
 * the owner's name cannot be had.
 *
 * REFUSED BEFORE `prepare` WRITES A PERSON, so the retry with his name is still a first provision. AND ASKED AT
 * CHECKOUT TOO (`billing.ts`), before anybody pays, because a record paid for is made only once the payment is in, and
 * a name or a zone refused then would be a payment with nothing to show for it.
 */
function provisionable(args: { name?: string; tz?: unknown }): Result<string> {
  const tz = zoneOf(args.tz);
  if (tz === null) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: zoneFix(args.tz), at: 'tz' } };
  if (args.name !== undefined && (placeholderName(args.name) || recordPlaceholder(args.name)))
    return {
      ok: false,
      refusal: {
        code: 'VALUE_MALFORMED',
        fix: 'name is the owner’s name as the passkey will show it, and this one reads as a placeholder: a word in brackets, a < or a >, a template field, or the words your name. Type the name itself. If it really is your name, write to support@brain.dog.',
        at: 'name',
      },
    };
  return ok(tz);
}

/**
 * The operator's record: the name and the person, then the record, then the Directory row that names it.
 *
 * THE RECORD BEFORE THE NAME, `51 §13 D21`: a Directory row never points at a record that failed to be made.
 *
 * WITH ITS THREE KEYS WRAPPED WHEN `KEK` IS BOUND, and refused when it is not. `createRecord` takes the keys
 * wrapped, and absent until there is something to wrap them with. A record made without them reads, writes and signs
 * people in; it cannot seal a grant or sign an export, and binding `KEK` later does not give it keys. That is the one
 * provisioning mistake with no repair short of throwing the record away, and the Directory never reissues its name,
 * so `keylessRefusal` answers for it here instead of letting it through in silence.
 *
 * THE STORE IS OPENED FIRST, so a bound value that is not a key refuses before the Directory writes anything, and so
 * the keyless guard decides before `prepare` has minted a person and claimed a slug.
 *
 * AND THE ZONE BEFORE EITHER. `createRecord` refuses a zone it cannot read, but it runs inside the record, after
 * `prepare` has written the owner as a `dir_person` row, so a mistyped zone refused there would leave a person in the
 * Directory with no record behind them. Measured by moving this check after `prepare`: `test/provision-tz.test.ts`
 * counted one more `dir_person` on `Mars/Olympus` and failed.
 */
async function provision(env: Env, args: { slug: string; email: string; name?: string; tz?: unknown }): Promise<Result<Provisioned>> {
  const checked = provisionable(args);
  if (!checked.ok) return checked;
  const tz = checked.value;
  const store = await keyStoreOf(env.KEK);
  const keyless = keylessRefusal(store, env.PROVISION_WITHOUT_KEYS);
  if (keyless) return { ok: false, refusal: keyless };
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const ready = await directory.prepare(args.slug, args.email, args.name ?? null);
  if (ready.refusal) return { ok: false, refusal: ready.refusal };
  const owner = ready.person;
  if (!owner) return { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'The Directory made no person for that address.' } };
  const id = `rec_${ulids(() => Date.now())()}`;
  const made = await env.RECORD.get(env.RECORD.idFromName(id)).create({
    id,
    slug: args.slug,
    name: args.name ?? args.slug,
    tz,
    locale: 'en',
    owner: { id: owner.id, email: owner.email, name: owner.name },
    ...(store ? { keys: await recordKeys(store, id) } : {}),
  });
  if (made) return { ok: false, refusal: made };
  const unnamed = await directory.nameRecord(args.slug, args.email, id);
  if (unnamed) return { ok: false, refusal: unnamed };
  return ok({ record: id, slug: args.slug, person: owner.id });
}
