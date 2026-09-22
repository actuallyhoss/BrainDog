/**
 * The record's surface: what a caller may ask, and whether they may.
 *
 * AUTHORISATION IS HERE AND NOT IN THE ROUTER. `30-BLUEPRINT` §10 puts it in one place for a reason
 * a router cannot meet: a check in the Worker is a check the CLI can be pointed around, and the
 * self-host has no Worker at all. Every method takes a `CallContext` and asks the same function.
 *
 * TWO LADDERS, ONE ANSWER. A token carries `read ⊂ propose ⊂ write`; a person carries
 * `read ⊂ append ⊂ write ⊂ decide ⊂ owner`. They are different vocabularies for different things —
 * a token is a capability handed to an agent, a level is what a colleague was invited as — and the
 * effective permission is the INTERSECTION, computed once per call. A caller with a write token and
 * read access to a record may read.
 *
 * NOTHING THROWS ACROSS THIS BOUNDARY. Every method returns a `Result`, because the caller is over
 * an RPC and an exception does not survive the trip with its sentence intact.
 */

import type { Clock, Refusal, Result, Scheduler, Snapshot, Snapshots, Sql } from '@braindog/ports';
import { PRIMITIVES_VERSION } from 'braindog-render';
import {
  install,
  normalise,
  plan,
  uninstall,
  type Host,
  type Installed,
  type PackSource,
  unresolvedFault,
} from '@braindog/declare';
import { isDuplicate, matchLiterals, normalise as normaliseText, parseDate, scanDates, scanDecimals, scanInts, scanMoney, type CurrencyTable } from '@braindog/extract';
import { no, ok } from '@braindog/ports';
import { backfillSpeaks } from './speaks.ts';
import type { EraseReport, EraseRequest } from '@braindog/kernel';
import type { InvitationRow } from '@braindog/kernel';
import type { Backlinks } from '@braindog/kernel';
import type { ViewRow } from '@braindog/kernel';
import {
  fill,
  GRANT_KINDS,
  isStale,
  exponentOf,
  openRecord,
  ulids,
  type GrantKind,
  type SealedGrant,
  sessionDeclaration,
  type BindGrantArgs,
  type CreateRecordArgs,
  type Entry,
  type Kernel,
  FORMAT_VERSION,
  KERNEL_MIGRATION,
  TRAVELS,
  type OutboxKind,
  carryingOf,
  headline,
  type GovernRegister,
  type Patch,
  type Proposal,
  type RegisterDecl,
  type RuleDecl,
  type Signer,
  type Verdict,
  type SessionHints,
  type WriteContext,
  PEOPLE,
  type MeetArgs,
  type Met,
  type Approved,
  type Arrival,
  type Arrived,
  type DeviceCode,
  type DeviceRow,
  type Exchanged,
  type VaultGrant,
  type Waiting as DeviceWaiting,
  type EventLine as LogLine,
  type InboxLine,
  type ArrivalSettled,
  setupCollapser,
  isUlid,
  slugify,
  SPARK,
  looksLikeCredential,
} from '@braindog/kernel';
import type { Predicate } from '@braindog/where';
import type { Json as JsonValue } from '@braindog/kernel';

import { arranger, carryUpdate, speakingNow, writeVoice, type CatalogueEntry } from './arrange.ts';
import { useCases, type ExportArgs } from './usecase.ts';
import { catalogueDrafts, FORM_SAID_MOST, formedRows, fromModel, growsDrafts, noticeUsage, pageShowsAgents, readUsage, SPARK_OPEN_CAP, stableKey, type CatalogueOffer, type Offered, type SparkDraft, type SparkModel } from './spark.ts';
import { grammarOf } from './grammar.ts';
import { historyCursors, type HistoryCursors } from './history-cursor.ts';
import { handleOf, isHandle, spokenOf } from './question-handles.ts';
import { REPORT_BYTES_MOST, REPORT_FIXED_MOST, REPORT_NAME_MOST, REPORT_PREFIX, REPORT_ROWS_MOST, REPORT_ROWS_PER_MINUTE, REPORT_WINDOW_MS, reportBindingOf, reportedFields, reportedRows, reportLabel, type ReportBinding } from './report.ts';

export type { CatalogueEntry, FigureTest, Grows, RowIo } from './arrange.ts';
export { formedRows, fromModel, growsDrafts, noticeUsage, readUsage, FORM_SAID_MOST, SPARK_OPEN_CAP, type CatalogueOffer, type FormField, type FormList, type FormSpec, type NextSpec, type Noticed, type SparkDraft, type SparkFormInput, type SparkModel, type SparkModelInput, type Usage } from './spark.ts';
export type { ExportArgs, PlannedPack } from './usecase.ts';
export { REPORT_BYTES_MOST, REPORT_FIXED_MOST, REPORT_NAME_MOST, REPORT_PREFIX, REPORT_ROWS_MOST, REPORT_ROWS_PER_MINUTE, REPORT_WINDOW_MS, reportBindingOf, reportedFields, reportedRows, reportLabel, type ReportBinding } from './report.ts';

/**
 * What proves a caller is the sender an ingest expects, as the record can answer it today.
 *
 * TWO MEMBERS OF `@braindog/host`'s `IngestVerify`, AND `hmac_sha256` IS NOT ONE OF THEM, because
 * nothing binds a grant's key to an ingest yet and `declare.ts` refuses the spelling. `path` carries
 * the SHA-256 of the token `ingestMint` showed, in hex, and never the token: the door digests the URL's
 * segment and compares the two digests (`packages/host/src/ingest.ts`, `hook`). The record may not
 * import the host's type: the edge points the other way (`31 §2`), so this is structural and the
 * door's parameter is what checks the two agree.
 */
export type IngestVerification = { kind: 'none' } | { kind: 'path'; sha256: string };

/**
 * Where a webhook ingest's token digest is kept: a `dog_meta` row per ingest.
 *
 * `dog_meta` BECAUSE IT NEEDS NO NEW TABLE, and a key-value row is the only shape of existing table
 * that a digest per ingest fits without borrowing somebody else's columns. A table of its own would be
 * the right home and is a kernel migration, which this file does not own; a table created here on
 * first mint would break `apps/selfhost/src/snapshots.ts`, whose restore
 * copies every table of the live database out of the snapshot by name: a snapshot taken before the
 * first mint has no such table, and the whole restore would be refused (read, not run). The cost of the
 * header is that the row travels in every export and a record opened from the file answers the same
 * token, and a digest travelling is the case `apps/worker/src/inbound.ts` already argues is safe: the
 * SHA-256 of 32 random bytes cannot be walked back, so a copy of the file is not a copy of the door.
 */
const ingestTokenKey = (ingest: string): string => `ingest_token.${ingest}`;

/**
 * Thirty-two random bytes, base64url and unpadded: 43 characters.
 *
 * THE FORWARDING ADDRESS'S OWN SHAPE (`secret` in `apps/worker/src/inbound.ts`, and `randomBytes(32)`
 * on the self-host), so a person carries one kind of token between hosts, and it needs no percent
 * escape in the URL his Shortcut posts to. A fifth copy of four lines, for the reason that file gives
 * for its fourth: the exported ones are named for invitations.
 */
const webhookSecret = (): string => {
  let s = '';
  for (const b of crypto.getRandomValues(new Uint8Array(32))) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const sha256Hex = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/* ── who is asking ───────────────────────────────────────────────────────── */

/** What a token may do. Three, and there is deliberately no `admin` — ADR-060. */
export const SCOPES = ['read', 'propose', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

/** What a person was invited as. Five, and only a person ever reaches the top two. */
export const LEVELS = ['read', 'append', 'write', 'decide', 'owner'] as const;
export type Level = (typeof LEVELS)[number];

export type Principal =
  /**
   * `level` IS NULLABLE, and that is a state rather than an absence of information.
   *
   * Somebody invited to one register holds nothing ON THE RECORD: not `owner`, which is what
   * promoting their highest scoped level used to give them, and not `read` either, because `append`
   * is the one rung whose whole point is that it does not read. Every method that names no register
   * asks for `read` with nothing to scope it, so any invented record-wide level was a key to all of
   * them. `null` is the honest value, and the type carrying it is what makes every reader deal with
   * it.
   */
  | { kind: 'person'; id: string; level: Level | null }
  | { kind: 'token'; id: string; scope: Scope; person: string; level: Level | null }
  | { kind: 'system'; id: string };

export type CallContext = {
  principal: Principal;
  /**
   * What this caller holds on named registers, when it differs from their record level.
   *
   * THE OVERRIDE, NOT THE CEILING. `registers` says which registers exist for this caller at all;
   * this says what they may DO with one of them — and the two are separate because "read the record
   * and write this one" and "see only this one" are different invitations.
   */
  levels?: Readonly<Record<string, Level>> | undefined;

  /** Which registers this caller may touch at all. `'*'` is every one the record declares. */
  registers?: readonly string[] | '*';
  /** Groups the events of everything one call causes. */
  batch?: string;

  /**
   * Whether this caller presented a credential of their own.
   *
   * IT IS FALSE FOR EXACTLY ONE THING: a self-host with no `BRAINDOG_TOKEN`, where an
   * unauthenticated request is the owner. That is right for one person on one machine — the process
   * binds loopback, and the machine is the boundary — and it stops being right the moment the call
   * MINTS SOMETHING THAT OUTLIVES THAT BOUNDARY. A bearer works from anywhere, for thirty days,
   * including after the operator later sets a token and the process binds every interface.
   *
   * `49 §5.2` step 7 admits ADMIN from a cookie, from `config.token`, or from an operation grant.
   * A request carrying nothing is none of the three, and this is how a method says so.
   */
  credentialed?: boolean;

  /**
   * When this caller last proved who they are, in epoch milliseconds: a passkey, a link or the server key.
   *
   * SET ONLY BY A HOST, AND ONLY FROM A SESSION ROW'S `authed_at`, which rotation never moves. The vault
   * asks for a proof in the last fifteen minutes (`12 §6`: reveal is deliberate). Absent is a caller with
   * no session at all, a bearer or a self-host's open mode, which the vault answers exactly as before.
   */
  provedAt?: number;

  /**
   * What an agent says about its run: the session headers, or `_meta.session` over MCP, each checked
   * by the host. A token's write hands them to the kernel's ladder; anybody else's call carries them
   * and nothing reads them.
   */
  session?: SessionHints | undefined;
};

/** How recent a session's last proof must be for the vault and for approving a device: `12 §6`, `33 §10`. */
const FRESH = 15 * 60_000;

/**
 * What a host with no store of copies answers (`33 §1` port 9). The Worker is one: its nightly copy is sealed to a key
 * only the operator holds, and going back to a time is not wired there yet. Nothing was changed, and the sentence says
 * what does work.
 */
const NO_SNAPSHOTS: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'This deployment does not keep backups you can take from the app yet. Export a copy from Settings, which works everywhere.',
  at: 'host',
};
const NO_RESTORE: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'Going back to an earlier copy is not available on this deployment yet. Nothing was changed.',
  at: 'host',
};
const NO_DELETE: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'Deleting a record from the app is not available on this deployment yet, so nothing was deleted. Ask support to delete it.',
  at: 'host',
};

/** `restore`: the copy the record went back to, and the copy of what it was just before. */
export type Restored = { bookmark: string; at: string; kept: string | null };

/** Device starts one address may make in fifteen minutes before the next waits (`12 §3`, the `device:` key). */
const STARTS = 10;
const WINDOW = 15 * 60_000;

/** A start refused by the count, with the seconds until the address may try again. The host answers it 429. */
export type Limited = { ok: false; retryAfter: number };

/**
 * What a host's vault door seals a deposited key for: the grant id and version the bytes will belong to, the
 * additional data that binds them there, and the record's wrapped key. The record hands this out and cannot use it.
 */
export type SealTarget = {
  grant: string;
  version: number;
  aad: string;
  key: { wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: string; kek_id: string | null };
};

/** What the host hands back: sealed bytes, and what they are unopened. Never the value. */
export type Sealed = { ciphertext: Uint8Array; nonce: Uint8Array; kdf: string; kek_id: string; bytes: number; hint: string };

/** A deposit, as the door answers it: the row's spoken id and the grant's version, and nothing sealed. */
export type Deposited = { credential: string; label: string; version: number; rotated: boolean };

/** A key's sealed material for the door to open, and the row it belongs to. */
export type OpenedForGrant = SealedGrant & { credential: string; label: string };

/** The register a vault door deposits into and opens from, and its sealed field. */
const KEYS = 'credentials';
const KEY_FIELD = 'value';

/**
 * One start counted against an address, in the record's own `auth_fail` (`30 §1`).
 *
 * THE FIRST START OPENS A FIFTEEN-MINUTE WINDOW AND THE ELEVENTH LOCKS IT for fifteen minutes from then, and the
 * count stops at eleven so a lock cannot be pushed further out. Nothing clears it early, because a start compares
 * no secret and so has no success to reward. `?1` the key, `?2` now plus fifteen minutes, `?3` the ten allowed.
 */
const COUNT_START = `INSERT INTO auth_fail (key, n, until) VALUES (?1, 1, ?2)
ON CONFLICT (key) DO UPDATE SET
  n     = MIN(n + 1, ?3 + 1),
  until = CASE WHEN n = ?3 THEN ?2 ELSE until END
RETURNING n, until`;

/* ── the kernel's `session` register: an agent's runs ─────────────────── */

const RUN = sessionDeclaration().body as unknown as {
  id: string;
  seq_prefix: string;
  state: string;
  done: string[];
  fields: { id: string; values?: string[] }[];
};
const SESSION = RUN.id;
const PREFIX = RUN.seq_prefix;
/** The states a run is live in: every declared one but the finished. */
const LIVE = (RUN.fields.find((f) => f.id === RUN.state)?.values ?? []).filter((v) => !RUN.done.includes(v));
/**
 * The states a run leaves for `active` when it writes again, as the kernel's ladder moves them
 * (`41 §5.4`). `handoff` is not one: it is a request waiting for the next run.
 */
const REVIVED: readonly string[] = ['idle', 'done', 'abandoned'];
/** Where a run is and what it is doing. Re-attaching refreshes these, and never `next`, `tried` or `notes`. */
const POSITION = ['agent', 'host', 'repo', 'remote', 'cwd', 'branch', 'head', 'doing'] as const;
/** Why `attach` was called: the hook that fired, or the command line. */
export const SOURCES = ['startup', 'resume', 'clear', 'compact', 'cli'] as const;
const HANDOFF = ['next', 'tried', 'note', 'doing', 'state', 'branch', 'head', 'session'] as const;
const MEET = ['name', 'email', 'handle', 'where'] as const;
/**
 * A refusal on its way out of a transaction that has already written something.
 *
 * `transactionSync` commits on a returned value and rolls back on a throw (`33-CONTRACTS` §1), so a
 * call that opens a row before it has finished checking has only one way to take that row back.
 * This carries the refusal through the throw so the caller still answers with a sentence rather
 * than a stack trace, which is the whole point of the kernel returning refusals in the first place.
 *
 * IT IS NOT A LICENCE TO CHECK LATE. Nearly every path here checks before it writes and needs none
 * of this; `handoff` is the one that cannot, because the run it writes to is the run it may have to
 * open to find.
 */
class Unwind extends Error {
  /* A FIELD AND AN ASSIGNMENT, not a parameter property: `erasableSyntaxOnly` is on because Node
     strips types rather than compiling them, and a parameter property is syntax that has to run. */
  refusal: Result<never>;
  constructor(refusal: Result<never>) {
    super('refused');
    this.refusal = refusal;
  }
}

/** Runs a transaction that may unwind, and turns the unwinding back into the refusal it carries. */
const unwound = <T>(fn: () => Result<T>): Result<T> => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Unwind) return e.refusal;
    throw e;
  }
};

/** How many entries `tried` and `notes` keep. The oldest goes first. */
const KEPT = 50;
/** The longest line a run carries, which is a note's ceiling. */
const LINE = 280;
/**
 * The next steps that name no step, lower case and with the punctuation gone. `handoff`'s description says "'carry on'
 * is not one": the run that reads it next learns nothing it could not have guessed.
 */
const VAGUE: ReadonlySet<string> = new Set([
  '', 'carry on', 'continue', 'keep going', 'go on', 'resume', 'proceed', 'more', 'more of the same', 'same', 'same as before',
  'as before', 'next', 'next step', 'next steps', 'tbd', 'todo', 'to do', 'n a', 'na', 'none', 'nothing', 'etc', 'finish',
  'finish up', 'finish it', 'keep working', 'continue working', 'work on it', 'pick up where i left off', 'see above', 'wip',
]);
const vague = (next: string): boolean => VAGUE.has(next.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
/** The runtime's own id for a run, in the grammar its header has (`44 §4.2`). */
const CLIENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/* ── what `context` shows (`loop/research-agent-path.md` §6.3) ──────────── */

/** A register's rows `context` shows from the project, and again from everywhere, newest first. */
const SHOWN = 20;
/** The people linked to the project, most recently touched first. */
const MET = 10;
/** The open questions, newest first. */
const ASKED = 8;
/**
 * A register whose rows fade: one with a `confirmed_on` day, as the agents pack's learnings have. A row
 * neither confirmed nor made in the last ninety days is left out of `context` and counted in `faded`.
 */
const FADES = 'confirmed_on';
const FADE_MS = 90 * 86_400_000;
/** What a `Brief` is made of. A field with one of these ids does not overwrite it. */
const BRIEF_KEYS: readonly string[] = ['spoken', 'version', 'scope', 'state'];
/** A spoken id with a prefix, `S42` or `LN7`, as against `tasks#3`. */
const PREFIXED = /^[A-Z][A-Z0-9]{0,3}[1-9][0-9]*$/;

/** What a method needs. The ladder is ordered, and the check is an index comparison. */
export type Need = 'read' | 'propose' | 'append' | 'write' | 'decide' | 'owner';

/** The ladder, in order, so `whoami` can say how far up it the caller reaches. */
export const NEEDS: readonly Need[] = ['read', 'propose', 'append', 'write', 'decide', 'owner'];

const TOKEN_REACH: Record<Scope, Need[]> = {
  read: ['read'],
  propose: ['read', 'propose'],
  write: ['read', 'propose', 'append', 'write'],
};

const LEVEL_REACH: Record<Level, Need[]> = {
  read: ['read'],
  /* AND NO READ, which is the whole of what `append` means. 20 §1: *"`create`, `propose` and `log`
     — and no read. The conservative half: an appender sees nothing, not even what it filed."* This
     included `read`, so a contractor invited to file expenses could list every register inside their
     ceiling. It is not a ladder rung out of order; it is the one level whose point is that it is
     not a prefix of the others. Somebody who needs to see what they filed gets a `read` grant on
     that register, which is the mechanism the sentence above names. */
  append: ['propose', 'append'],
  write: ['read', 'propose', 'append', 'write'],
  decide: ['read', 'propose', 'append', 'write', 'decide'],
  owner: ['read', 'propose', 'append', 'write', 'decide', 'owner'],
};

/**
 * May this caller do this, and if not, why not in one sentence.
 *
 * THE INTERSECTION, not the maximum. A write token held by somebody with read access reads — the
 * token says what the holder may do with their access, never what access they have. Getting this
 * backwards is how a revoked colleague keeps writing through a token they were issued last year.
 */
export function allows(ctx: CallContext, need: Need, nameOf: (list: string) => string = (list) => list): Refusal | null {
  const p = ctx.principal;
  if (p.kind === 'system') return null;

  /* NOTHING ON THE RECORD REACHES NOTHING ON THE RECORD. A caller with only register-scoped rows
     arrives here with `level: null` for anything not scoped to one of them.

     AND IT SAYS WHICH ONES, AND WHAT TO DO. This named no rule, no remedy and no next step, and sent
     `allowed: []` — so an agent an owner had set up ten minutes earlier could not tell whether to
     retry, to ask for something else, or to stop. Naming the registers it DOES hold is the whole of
     the answer: either the call belongs to one of them, or it belongs to the record and this caller
     was never given the record.

     AND A PERSON IS TOLD ABOUT THEIR INVITATION, NOT ABOUT A TOKEN. The sentence was written for an agent, and
     `loop/research-invite-landing.md` finding 6 measured nine methods (`inbox`, `packs`, `planPack`, `decide`
     among them) saying it to a colleague invited to one list, who signed in from a link, holds no token and was
     never offered one. It was the sentence on `/inbox`, `/spark`, `/packs` and every `/start` tile. The token's
     wording stays, because a wider token is exactly what its owner can mint.

     AND THE PERSON IS TOLD THE LISTS' NAMES. This joined the ids, so a member of the seed's Money list read "invited to
     obligations" on the screen whose rail said Money (`loop/research-scoped-leftovers.md` §2). `nameOf` is the record's
     own lookup, passed by `createRecordApi`, since `CallContext` carries ids and this function has no kernel. A token
     keeps the ids, because "Name one of those" asks an agent to send one back, and `allowed` stays ids for the same
     reason. */
  if (p.level === null) {
    const held = ctx.registers && ctx.registers !== '*' && ctx.registers.length > 0 ? [...ctx.registers] : null;
    const lists = held ? held.join(', ') : null;
    const person = p.kind === 'person';
    const named = held ? new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(held.map(nameOf)) : null;
    return {
      code: 'FORBIDDEN',
      fix: held
        ? person
          ? `This belongs to the whole record, and you were invited to ${named}, and to nothing else. Open ${held.length === 1 ? 'it' : 'one of those'}, or ask the owner to invite you to the whole record.`
          : `This call is about the record itself, and you hold ${lists} and nothing else. Name one of those, or ask the owner for a record-wide token.`
        : person
          ? 'This belongs to the whole record, and you have no access to it. Ask the owner to invite you.'
          : 'This call is about the record itself, and you hold no access to it. Ask the owner for a token.',
      allowed: ctx.registers && ctx.registers !== '*' ? [...ctx.registers] : [],
    };
  }

  const level: Level = p.level;
  const reach =
    p.kind === 'person'
      ? LEVEL_REACH[level]
      : TOKEN_REACH[p.scope].filter((n) => LEVEL_REACH[level].includes(n));

  if (reach.includes(need)) return null;

  const has = p.kind === 'person' ? `${level} access` : `a ${p.scope} token on ${level} access`;

  /* NO TOKEN REACHES THE TOP TWO RUNGS — ADR-060, and it is a design decision rather than a gap: a
     decision needs a person, and so does anything at owner. Reporting that as "your scope is too
     small" would send an agent looking for a bigger token, and there is not one. */
  /**
   * `FORBIDDEN`, AND THE SENTENCE IS WHAT TELLS THE TWO CASES APART.
   *
   * This carried `PERSON_REQUIRED` — a code in no registry — on the argument that a caller must be
   * able to tell "your token is too small" from "no token reaches this". The argument is right and
   * the remedy was wrong. `30 §6` writes `FORBIDDEN` as *"a credential outside its scope, level or
   * ceiling — 403"* and then lists three separate facts under it: a row write from a `spark`
   * principal, a runner posting out of `seq` order, and the scope case. One code, several
   * sentences, is how that registry already works — because a code is what a caller BRANCHES on and
   * a `fix` is what it ACTS on, and "ask a person to sign in" is an act, not a branch. A refusal
   * that needed its own code to be readable would be a refusal whose sentence had failed.
   *
   * THE COST OF THE OTHER CHOICE is `10 §7`'s: an agent teaches itself from codes that are stable
   * across versions, and a code minted per remedy makes the vocabulary grow at the speed of the
   * copywriting. `SCOPE_INSUFFICIENT`, twelve lines down, was the same invention and has gone the
   * same way: a read token asking to write was handed a code in no registry, and is handed
   * `FORBIDDEN` now with the same sentence, which already told it to ask for a wider scope.
   */
  if (p.kind === 'token' && (need === 'decide' || need === 'owner'))
    return {
      code: 'FORBIDDEN',
      fix: `This needs ${need}, and no token reaches it. A person has to do it, signed in.`,
      allowed: reach,
    };

  /* AND THE REMEDY, WHICH IS DIFFERENT FOR THE TWO CODES. `This needs write, and you have a propose
     token on read access` was complete about the STATE and silent about what to do next — which is
     half a sentence, and the half a caller does not need. A scope that is too small is a token the
     owner can mint bigger; a `propose` token at its ceiling has another way through, which is to
     propose. The `FORBIDDEN` above already reads like this and is the shape being copied. */
  const short = p.kind === 'token' && !TOKEN_REACH[p.scope].includes(need);
  const next =
    p.kind !== 'token'
      ? ' Ask an owner to raise your access.'
      : short && p.scope === 'propose' && need === 'write'
        ? ' Send it as a proposal, or ask the owner for a write token.'
        : short
          ? ' Ask the owner for a token with a wider scope.'
          : ' Ask the owner to raise the access this token was minted against.';

  /* TWO RETURNS AND NOT ONE, so each code sits as a literal where `refusals.mjs` reads it. This was
     `code: short ? 'SCOPE_INSUFFICIENT' : 'LEVEL_REQUIRED'`, and the first arm was a code in no
     registry, counted by that gate as one of the five outside it. */
  if (short) return { code: 'FORBIDDEN', fix: `This needs ${need}, and you have ${has}.${next}`, allowed: reach };
  return { code: 'LEVEL_REQUIRED', fix: `This needs ${need}, and you have ${has}.${next}`, allowed: reach };
}

/** And may they touch this register? A ceiling is a list, and `'*'` is no ceiling at all. */
export function reaches(ctx: CallContext, register: string): Refusal | null {
  const ceiling = ctx.registers ?? '*';
  if (ceiling === '*' || ceiling.includes(register)) return null;
  /* AND WHAT IT DOES REACH. The list was already in `allowed` for a machine and nowhere in the
     sentence for a person, so a refusal that could have ended the search sent them back to the
     owner to ask what they had. */
  return {
    code: 'FORBIDDEN',
    fix: `This token does not reach ${register}. It reaches ${[...ceiling].join(', ')}.`,
    allowed: [...ceiling],
  };
}

/* ── the surface ─────────────────────────────────────────────────────────── */

export type Page<T> = { rows: T[]; matched: number; cursor: string | null };

/**
 * What `boot` answers, and why the record's own instant is on it.
 *
 * THE CLOCK IS A PROPERTY OF THE ANSWER, not of the reader. A record is opened with an injected
 * `clock` (`33 §2`) so a fixture pins one instant, and the sample record this product demonstrates
 * itself with is exactly such a fixture: its rows are dated relative to a pinned day. A browser that
 * dates them against its own `Date.now()` puts every band, deadline tone and `+30d` window some
 * number of days out, and gets no error while doing it: the dates parse, the arithmetic runs, the
 * screen is confidently wrong. So the record says what day it is answering as of, and the client
 * holds the offset.
 *
 * ON `boot` AND NOT ON `version`, because `boot` is the one call every client makes before it draws
 * anything, and `33 §4` fixes `version`'s six keys, so a seventh there would be this repository
 * disagreeing with its own contract. A long session needs no second read: the offset between the
 * record's instant and the reader's is constant, and the reader's own clock ticks.
 */
/** The keys `setPref` takes. A closed list, so a typo is refused rather than kept for ever. */
export const PREF_KEYS = ['nav.order', 'nav.hidden'] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export type Prefs = { [K in PrefKey]?: string[] };

export type Boot = {
  registers: { id: string; name: string; count: number }[];
  /** ISO 8601, UTC. The instant the record answered as of. */
  now: string;
  /** The runs that are live now, as `sessionsLive` answers. Empty for a caller who may not read them. */
  sessions: LiveRun[];
  /** Open suggestions the caller may see, newest first: what waits on a person. */
  waiting: Waiting[];
  /** The record's own name, which the shell draws above everything else. `null` before it is provisioned. */
  record: { slug: string; name: string; locale: string } | null;
  /** Who is asking: the person behind the call, the name they gave, and what they hold on the record. */
  me: {
    kind: 'person' | 'token' | 'system';
    person: string | null;
    name: string | null;
    level: Level | null;
    /** What this person arranged for themselves (`setPref`): the rail's order and the pages hidden from it. A person only. */
    prefs?: Prefs;
  };
  /** The pages the caller may open, as `pages` lists them, each with its place in the rail when it has one. */
  pages: { slug: string; title: string; nav: { section: string; order: number } | null; icon: string | null; list: string | null }[];
  /**
   * How many questions wait on a person, and how many arrivals wait in the inbox.
   *
   * COUNTS AND NOT LISTS. `waiting` is capped for the first paint and a rail badge is the whole number. The inbox holds
   * whatever was sent in, so only an owner is told how much; anybody else gets `null`, which is not zero.
   */
  counts: { decide: number; inbox: number | null; decided: number };
  /** What changed since the caller last read, exactly as `whatsNew` answers with no cursor. */
  whatsNew: WhatsNew;
  /**
   * Each person on the record by name, by id, for saying who did what, and only for a caller who may read the membership
   * list (the owner) or the People list. Names only: no address, no level. Absent for anybody else.
   */
  names?: Record<string, string>;
  /**
   * Whether anybody signs in on this host.
   *
   * THE HOST KNOWS AND THE APP COULD NOT TELL. A self-host started without a key, or a Worker with no
   * `SESSION_SECRET`, answers `/account/records` 401 on every load, which is exactly what an ended
   * session answers, so the switcher said "Sign in again" where there is nowhere to sign in. Read off
   * the same answer `invitations` gives: an invitation is spent by signing in, so a host that cannot take
   * one has no sign-in. `false` when the host never said, as `invitations` is off when absent.
   */
  signIn: boolean;
};

/** One line of the log as a caller sees it: the event, and what it is about when they may read that. */
export type EventLine = Omit<LogLine, 'rowid'> & {
  /**
   * The event's place in the log. SENT TO A CALLER WHO READS THE WHOLE RECORD, AND TO NOBODY ELSE: between two lines of
   * a member invited to one list it is a count of the events she was not shown (`loop/research-history-cursor.md`).
   */
  rowid?: number;
  /**
   * On a `decide` line, the question it settled (`SG4`), so a screen can fold the `resolve` written beside it into the
   * decision. The screen paired them by `rowid - 1`, which is a number a member held to named lists is no longer sent.
   */
  settles?: string;
  /** The row's register and number, when the event is about a row. */
  register: string | null;
  seq: number | null;
  /** What the thing is called: a row's title, or a question. */
  title: string | null;
};

/**
 * Where a page of the log stops, or what a read mark reaches: the event's rowid for a caller who reads the whole record,
 * and for anybody else `e.<event id>` or `s.<sealed>`, which only this record opens (`history-cursor.ts`).
 */
export type Cursor = number | string;

/** A line inside the record, where the walk and the read mark still need its place in the log. */
type Walked = EventLine & { rowid: number };

/**
 * `whatsNew`: what changed since the read mark, NEWEST FIRST and at most sixty.
 *
 * `upTo` is the newest event in the answer, which is what `markRead` takes to say all of these were seen.
 * `sinceCapped` says there is more between the mark and the oldest line here; the rest is `recentHistory`'s.
 */
export type WhatsNew = { events: EventLine[]; upTo: Cursor | null; sinceCapped: boolean };

/** `recentHistory`: one page of the log, newest first, and the cursor for the page below it. */
export type HistoryPage = { events: EventLine[]; cursor: Cursor | null };

/** `inbox`: one page of what arrived and no rule filed, newest first, and the cursor for the page below it. */
export type InboxPage = { arrivals: InboxLine[]; cursor: number | null };

/** One live run: the row, its spoken id, and what is worked out when it is read. */
export type LiveRun = Entry & {
  spoken: string;
  /** Not heard from in 45 minutes. A run that crashed never says so, so this is never stored. */
  stale: boolean;
  /** Seconds since it was last heard from. */
  age_s: number;
  /** Its repository is the one the caller said it is in: two runs in one working tree overwrite each other. */
  same_repo: boolean;
};

/**
 * One open suggestion, with its question and without its body: a `rowset` can carry two hundred rows,
 * and `boot` is the first paint.
 */
export type Waiting = { id: string; body_kind: string; opened_by: string; opened_at: string; question: string };

/** `attach`: the run this agent is, whether it was already there, and the briefing for where it stands. */
export type Attached = {
  session: Entry;
  spoken: string;
  resumed: boolean;
  /** The project the run is placed in, by spoken id, or `null` for none. */
  project: string | null;
  context: Context;
};

/**
 * One row as `context` shows it: its spoken id, its version for the compare-and-set, whether it is the
 * project's own or applies everywhere, its state, and the register's `mobile` fields and title. A ref
 * is its spoken id. A `secret` field is what is known about its grant, `{ sealed, opened, last_opened,
 * last_by }`, and never the grant or a value.
 */
export type Brief = { spoken: string; version: number; scope: 'project' | 'global'; state: string | null } & Record<string, unknown>;

/** Another run that is live now, as `context` shows it. */
export type LiveBrief = {
  spoken: string;
  state: string | null;
  doing: string | null;
  agent: string | null;
  repo: string | null;
  project: string | null;
  stale: boolean;
  age_s: number;
};

/**
 * `context`: where an agent stands, in one call (`loop/research-agent-path.md` §6.3). It never writes,
 * and it never opens a run.
 */
export type Context = {
  /** The caller's run, when it is a token that has one. */
  session: { spoken: string; state: string | null } | null;
  /** The project the caller stands in, and the rung that placed it. `null` is global. */
  project: { spoken: string; name: string; mark: string | null; hue: number | null; how: 'remote' | 'folder' | 'repo' } | null;
  /** Projects that matched at the same strength, which leaves the caller global. */
  ambiguous: string[];
  /** The newest other run in this project, or this repository, that left a next step. */
  handoff: { from: string; age_s: number; next: string; tried: string[]; head: string | null } | null;
  /** The other runs that are live now. `stale` is worked out at 45 minutes. */
  live: { same_repo: LiveBrief[]; elsewhere: LiveBrief[] };
  /** Open suggestions, newest first, each with the question a person answers. */
  waiting: { id: string; question: string }[];
  /** Every register with a scope field the caller may read: the project's open rows, then the global ones nearer-wins leaves. */
  registers: { id: string; name: string; rows: Brief[]; inherited: Brief[]; truncated: boolean }[];
  /** The people linked to this project, most recently touched first. */
  people: Brief[];
  /** Rows of a fading register left out because nobody confirmed them in ninety days. */
  faded: number;
  /** One sentence: what to call next. */
  next: string;
};

/**
 * `33 §4`, line 356, verbatim: `{ version, format, kernel, primitives, app, spark: boolean }`.
 *
 * IT WAS A BARE NUMBER. `version()` returned `MAX(event.rowid)` and nothing else, so the polling
 * fallback worked and everything else the route is specified to carry was missing: `deploy-parity`
 * (`33 §8`) reads `app` to prove the host is serving the build that was deployed, and `50 §5.13`
 * step 3 reads `spark` to decide whether the Spark surface exists at all. Both read a number.
 */
export type Version = {
  /**
   * `MAX(event.rowid)` to an owner who reads every list, for whom what changed since is a range scan from here. Anybody
   * else is answered a number that changes when a line they may read is written and is not ordered (`versionFor`).
   */
  version: number;
  /** The `.brain` format revision this build reads (`03 §11`). */
  format: number;
  /** How many kernel migrations this build carries. */
  kernel: number;
  /** `PRIMITIVES_VERSION` (`31 §6`): which renderer a pack may require. */
  primitives: number;
  /**
   * `<date>+<sha>`, the deployed build, or `null`.
   *
   * NULL RATHER THAN A PLACEHOLDER. The record cannot know its own build, because it is the same
   * code under a Worker, a test and the CLI, so the host tells it and a host that was not told says
   * nothing. `deploy-parity` comparing a real build against the literal `unknown` would pass on a
   * host that has no idea what it is running, which is the one thing that check exists to catch.
   */
  app: string | null;
  /** Whether `SPARK_ENDPOINT` is set, so `/api/spark/*` is routed at all (`33 §4`). */
  spark: boolean;
};

/**
 * What the host knows about itself and the record does not.
 *
 * Optional, because a test, the CLI and a self-host started by hand all open a record without one,
 * and a required field here would make every one of them invent a value.
 */
export type Build = { app: string; spark: boolean };

export type RecordDeps = {
  sql: Sql;
  clock: Clock;
  /**
   * The alarm. Optional, because the record is testable and readable without one — but a host that
   * omits it has a record whose reminders never fire.
   */
  scheduler?: Scheduler | undefined;
  /** The outbox kinds this deployment can deliver. The doorbell rings for those and no others. */
  delivers?: readonly OutboxKind[] | undefined;
  /**
   * What signs an exported `.brain`, when this host holds the record's signing key.
   *
   * IT IS A CALLBACK AND NOT A KEY, all the way down. `12 §6` puts the key hierarchy in the host;
   * this package and the kernel below it hold sealed bytes they cannot open, and a signer that
   * arrived as a key would be that rule broken at the one boundary it exists to protect.
   */
  sign?: Signer | undefined;
  /**
   * What this host is running, for `version` (`33 §4`).
   *
   * THE HOST TELLS THE RECORD, and never the other way round. The build is a fact about the
   * deployment, and the same record code runs under a Worker, a test and the CLI.
   */
  /**
   * The copies this host keeps of the whole record (`33 §1` port 9). Absent, `snapshot`, `snapshots` and `restore`
   * refuse `NOT_IN_THIS_BUILD`.
   */
  snapshots?: Snapshots | undefined;
  /**
   * Remove this record from the host: its storage, its copies and its name (`53 §5.9`). It runs last, after every
   * check, and the record answers nothing afterwards. Absent, `deleteRecord` refuses `NOT_IN_THIS_BUILD`.
   */
  destroy?: (() => Promise<void>) | undefined;  build?: Build | undefined;
  /**
   * Why this host cannot take an invitation, or `null` when it can.
   *
   * THE HOST KNOWS AND THE RECORD DOES NOT. An invitation is spent by signing in, and only a host knows whether
   * anybody can: a Worker with no `SESSION_SECRET`, or a self-host in open mode, has no sign-in to spend one with.
   * Absent is the same as a host that cannot, so a link is never minted for a door that is not there.
   */
  invitations?: (() => string | null) | undefined;
  /**
   * What this host offers to install: packs, and use cases with the modules they build on.
   *
   * THE HOST'S AND NEVER THE RECORD'S, because the record names no use case. A host with none still takes a
   * pack proposal that carries its own document, and says so when one is asked for by name.
   */
  catalogue?: readonly CatalogueEntry[] | undefined;
  /**
   * Reads a shared use case from an https address a person pasted, on the host rather than in their tab, so a site that
   * sends no CORS header can be read (`@braindog/host/actions` `readPublic`: https, no private address, a size cap and a
   * timeout). Absent, `fetchUseCase` refuses and says to download the file and choose it instead.
   */
  readAddress?: ((address: string) => Promise<{ ok: true; text: string; bytes: number } | { ok: false; fix: string }>) | undefined;
  /**
   * A model Spark may ask to draft arrangement proposals: a person's own key or a self-host's endpoint, built by the host
   * (`spark.ts` `SparkModel`). Absent, Spark's own rules draft them. Either way a draft is filed only through `propose`'s
   * validation, and only an owner's press applies it.
   */
  sparkModel?: SparkModel | undefined;
  /**
   * Newer versions of what this record holds, found in the host's catalogue, verified and read there (`spark.ts`
   * `catalogueDrafts`). Spark asks about each on Decide through the same `prepare`; absent, it asks about none.
   */
  catalogueOffers?: ((held: readonly { id: string; version: string; on: boolean }[]) => Promise<readonly CatalogueOffer[]>) | undefined;
};

/** What `invite` says when the host never said it can take invitations. */
const INVITES_OFF = 'This BrainDog has no sign-in switched on, so an invitation link would lead nowhere. Set up sign-in first.';

/**
 * The currency table `43 §4.3`'s money is read against: the runtime for the codes, the kernel for the
 * exponents.
 *
 * TWO SOURCES, AND THEY ANSWER TWO DIFFERENT QUESTIONS. `Intl.supportedValuesOf('currency')` is ISO
 * 4217's active list as the runtime holds it, which settles whether three letters are a currency at
 * all; `exponentOf` is the kernel's table, which settles how many minor digits it has. It would be
 * tidier to ask one thing twice, and it would be wrong: `Intl`'s exponents are CLDR's, and CLDR gives
 * `IQD` 0 minor digits where ISO gives 3, which is a thousandfold error in a stored amount (`02 §3`
 * rule 1). A record still cannot know that `KWD` has three decimals without knowing `KWD` is a
 * currency, because both answers are reached through this one table.
 * A LIST IS WHAT MAKES THE READING SAFE: without one, `VAT 500` and `EGP 500` are the same three
 * letters beside a number, which is why `ingest.ts` refused to read a currency out of a payload
 * at all until this existed.
 *
 * NO SYMBOLS, DELIBERATELY. `43 §710`'s ponytail already says why — a symbol two rows share
 * resolves to none, and `$` is at least five currencies — so `E£ 450` reads nothing rather than
 * guessing, exactly as an ambiguous one would. Adding them is a data decision with a table behind
 * it; reading an unambiguous code is not.
 */
const CURRENCIES: CurrencyTable = Object.fromEntries(
  Intl.supportedValuesOf('currency').map((code) => [code, { exponent: exponentOf(code) }]),
);

/**
 * `43 §4.5`'s `day`, in the shape the kernel's seam asks for.
 *
 * TWO ADAPTATIONS, AND NEITHER IS A GRAMMAR. `parseDate` answers `undefined` where the seam says
 * `null`, and it THROWS `DATE_FORMAT_INVALID` for a format `§4.3`'s token rules do not admit — no
 * year, two month tokens, a variable-width token run into a digit. `declare` refuses all three at
 * install, which is where an author should hear about them, and the kernel's own contract at this
 * point is that nothing throws: a coercion that raised mid-ingest would take a whole arrival down
 * over one field, where answering `null` costs that field and keeps the message and its bytes.
 */
const readDay = (text: string, format: string): string | null => {
  try {
    return parseDate(text, format) ?? null;
  } catch {
    return null;
  }
};

export async function createRecordApi(deps: RecordDeps) {
  const opened = await openRecord(deps.sql, deps.clock, {
    ...(deps.delivers === undefined ? {} : { delivers: deps.delivers }),
    ...(deps.sign === undefined ? {} : { sign: deps.sign }),
    /* `43 §4.3`'s three number forms, wired where both halves can be reached: the readers are
       rank 9, the record that reads an arrival is rank 7, and this package is 11. Without these
       lines a record reads them the way `ingest.ts` does alone, which is wrong against `§4.3`
       five ways — money three, and `1,250.00` read as an integer and `1.234,56` as 123456. */
    numbers: {
      money: (text, declared) => scanMoney(text, CURRENCIES, declared),
      int: scanInts,
      decimal: scanDecimals,
    },
    /* AND `§4.3`'s LITERAL RULE, which `enum` and `lookup` share: longest whole token wins, equal
       length with different values is ambiguous. Without this line `coin` reads as the literal
       `in` and a lookup reads only the first token of its slice. */
    literals: matchLiterals,
    /* AND `§4.3`'s `date`. Without this line a record reads four formats out of the token set the
       grammar allows, and one date per slice where `§5.4` says every one. */
    dates: scanDates,
    /* AND `§5.7`'s fuzzy dedupe. Without this line a `near` key — the one a bank statement actually
       needs, because the same transaction arrives a day apart with the merchant extended — finds
       nothing to compare and writes the row twice. */
    duplicate: isDuplicate,
    /* AND `§5.1` STEP 4, which is the one of the six that is not a reader. Without this line the
       forms read the body exactly as it arrived, and a zero-width space inside `EGP` walks past
       every anchor while the message still reads correctly on screen (`§8`). */
    normalise: normaliseText,
    /* AND `§4.5`'s `day`, which is the same token grammar as `dates` answering the other question:
       `dates` finds every day in a slice of an email, and this reads the one day a `map:` field of a
       JSON answer holds. Without this line a record reads the four formats `ingest.ts` names out of
       the token set the grammar allows, so a connector's page dated `29.08.2026` — `§9.3`'s own
       worked example — files for review saying it could not make sense of the date. */
    day: readDay,
  });
  /* A use case installed before `speaks` existed reads as declaring it (`speaks.ts`). */
  const kernel = backfillSpeaks(opened, deps.sql);
  /* THE LOG'S CURSORS FOR A CALLER HELD TO NAMED LISTS, with this instance's key (`history-cursor.ts`). */
  const cursors = await historyCursors();
  return { ...api(kernel, deps, cursors), kernel };
}

function api(kernel: Kernel, deps: Pick<RecordDeps, 'sql' | 'clock' | 'scheduler' | 'build' | 'snapshots' | 'destroy' | 'invitations' | 'catalogue' | 'readAddress' | 'sparkModel' | 'catalogueOffers'>, cursors: HistoryCursors) {
  const { sql, clock, scheduler, build, snapshots, destroy, invitations } = deps;
  /**
   * The page declaration served at a slug, and its version: the one named exactly, or else the one whose name slugs to it
   * as the kernel serves it (`pages.ts` `claim`), when exactly one does. A page per row (`for:`) has none of its own slug.
   */
  const pageDeclaredAt = (slug: string): { id: string; version: number } | null => {
    const live = sql.all<{ id: string; version: number }>("SELECT id, version FROM declaration WHERE kind = 'page' AND superseded_at IS NULL AND retired = 0");
    const exact = live.find((d) => d.id === `page.${slug}`);
    if (exact) return exact;
    const slugged = live.filter((d) => slugify(d.id.slice('page.'.length)) === slug);
    return slugged.length === 1 ? slugged[0]! : null;
  };
  /**
   * After every write: re-arm the alarm, then ring the doorbell.
   *
   * HERE AND NOT IN THE HOST. An earlier shape hung this off the HTTP layer, which meant a write
   * that arrived any other way — an MCP tool, a rule, a test, the self-host's own startup — derived
   * its reminders and armed nothing. The alarm is a fact about the record, so it is re-derived where
   * the record is written, and there is exactly one place that does it.
   *
   * It runs whether the write succeeded or was refused: a refusal changed nothing, so the tail is
   * one read and no calls — and a tail that only ran on success is a tail somebody has to remember
   * to think about.
   */
  const tail = async <T>(out: T): Promise<T> => {
    moveOn();
    if (scheduler) await kernel.tail(scheduler);
    return out;
  };

  /**
   * THE NEXT MILESTONE, NEVER BY ITSELF (`CatalogueEntry.next`). After a write, for each use case on that names what moves on:
   * when a row of its list is in a done state, none is in `to`, and a row waits in `from`, the first of those by order is the
   * next. It is asked once on Decide, as Spark's rowset that updates that one row, or, when the owner turned the use case's
   * setting on, marked `to` directly, signed by whoever last changed the row that was reached. Each next row is moved on at most
   * once, so a person who sets it back is not overruled.
   */
  const NEXT_DONE = 'next.done';
  const moveOn = (): void => {
    const specs = (deps.catalogue ?? []).filter((e) => e.next !== undefined);
    if (specs.length === 0 || kernel.refused()) return;
    try {
      for (const e of specs) {
        const n = e.next!;
        if (!kernel.packStates().some((p) => p.id === e.id && p.disabled_at === null)) continue;
        const decl = kernel.register(n.register);
        const done = decl?.done ?? [];
        if (!decl || done.length === 0) continue;
        const rows = sql
          .all<{ id: string; seq: number; version: number; fields: string; updated_at: string }>(
            'SELECT id, seq, version, fields, updated_at FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL',
            n.register,
          )
          .map((r) => ({ ...r, f: JSON.parse(r.fields) as Record<string, unknown> }));
        if (rows.some((r) => r.f[n.field] === n.to)) continue;
        const reached = rows
          .filter((r) => done.includes(String(r.f[n.field])))
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.seq - a.seq))[0];
        const orderOf = (r: { f: Record<string, unknown> }) => (typeof r.f[n.order] === 'number' ? (r.f[n.order] as number) : Number.MAX_SAFE_INTEGER);
        const next = rows.filter((r) => r.f[n.field] === n.from).sort((a, b) => orderOf(a) - orderOf(b) || a.seq - b.seq)[0];
        if (!reached || !next) continue;
        const key = `${n.register}:${next.id}`;
        const prefs = kernel.prefsOf(SPARK);
        const moved = Array.isArray(prefs[NEXT_DONE]) ? (prefs[NEXT_DONE] as unknown[]).map(String) : [];
        if (moved.includes(key)) continue;
        kernel.setPref(SPARK, NEXT_DONE, [...moved, key].slice(-200));
        const title = (r: { f: Record<string, unknown> }) => String(r.f[decl.title] ?? '').slice(0, 100);
        const config = kernel.packConfig(e.id);
        if (config.ok && config.value.values[n.setting] === true) {
          const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND actor != 'spark' ORDER BY rowid DESC LIMIT 1", `entry:${reached.id}`)?.actor;
          if (by) kernel.update(n.register, `${n.register}#${next.seq}`, { [n.field]: n.to }, { actor: by, version: next.version, cascade: false, note: n.note });
          continue;
        }
        const question = n.question.replaceAll('{reached}', title(reached)).replaceAll('{next}', title(next)).slice(0, 280);
        kernel.propose(
          { question, body_kind: 'rowset', body: { register: n.register, rows: [{ at: `${n.register}#${next.seq}`, version: next.version, patch: { [n.field]: n.to } }] } },
          SPARK,
        );
      }
    } catch {
      /* MOVING ON IS A COURTESY, never a reason a write that landed reads as failed. */
    }
  };
  /**
   * The binding a report key carries, or `null` for any other caller (`report.ts`).
   *
   * READ FROM THE TOKEN'S OWN ROW AND NOT FROM THE CONTEXT, so a host cannot forget to say a token is a report
   * key: both hosts build the principal from `verifyToken`, and the record looks the label up itself. Once per
   * context, because one call asks the guard more than once.
   */
  const bindings = new WeakMap<CallContext, ReportBinding | null>();
  const reportKeyOf = (ctx: CallContext): ReportBinding | null => {
    if (ctx.principal.kind !== 'token') return null;
    if (bindings.has(ctx)) return bindings.get(ctx) ?? null;
    const row = sql.one<{ label: string | null }>('SELECT label FROM token WHERE id = ?', ctx.principal.id);
    const binding = reportBindingOf(row?.label ?? null);
    bindings.set(ctx, binding);
    return binding;
  };

  /** What a report key is told by every method but `report`. */
  const reportOnly = (binding: ReportBinding): Refusal => ({
    code: 'FORBIDDEN',
    fix: `This is a report key: it sends rows to ${binding.register || 'one list'} through report, and reads and changes nothing else. Use a token for anything more.`,
    at: 'principal',
    allowed: ['report'],
  });

  /**
   * The register a `report` call is guarded against: the one its key is bound to.
   *
   * A NAME NO REGISTER CAN HAVE, because a register id starts with a letter and holds no space. `guard` reads it
   * as "the register this key is bound to", which is the only register a report ever writes, and refuses it to
   * any caller that is not a report key.
   */
  const BOUND = 'the bound register';

  /** A list as its declaration names it, which is the name `boot` gives the rail, or its id when nothing declares it. */
  const listName = (list: string): string => kernel.register(list)?.name ?? list;

  /** Every method starts here: the ladder, then the ceiling, then the work. */
  const guard = (ctx: CallContext, need: Need, asked?: string): Refusal | null => {
    /* A REPORT KEY REACHES `report` AND NOTHING ELSE. Every DATA and READ+ method asks this function or `scoped`,
       so refusing it here is refusing it everywhere; `admin` and `vault` already refuse every token. */
    const binding = reportKeyOf(ctx);
    if (binding !== null && asked !== BOUND) return reportOnly(binding);
    if (binding === null && asked === BOUND)
      return {
        code: 'FORBIDDEN',
        fix: 'report takes rows from a report key only. To add a row with any other credential, use create.',
        at: 'principal',
        allowed: ['create'],
      };
    if (binding !== null && binding.register === '') return reportOnly(binding);
    const register = binding !== null ? binding.register : asked;
    /* THE REGISTER'S OWN LEVEL WHEN IT HAS ONE, which is what makes a level per register a rule
       rather than a decoration. A bookkeeper with `read` on the record and `write` on one register
       is the point; so is an owner held to `read` on the one that carries the payroll. */
    /* `Object.hasOwn`, BECAUSE THE KEY COMES FROM THE CALLER. `ctx.levels['constructor']` is
       `Object`, not `undefined` — so `GET /api/list?register=constructor` ran the permission check
       with a level of `Object`, `LEVEL_REACH[Object]` was `undefined`, and `.includes` threw a
       `TypeError` out of the one function this package promises never throws over. A 500 from the
       authorisation check is not an escalation and is not a thing that should be possible. */
    const held =
      register !== undefined && Object.hasOwn(ctx.levels ?? {}, register) ? ctx.levels?.[register] : undefined;
    const at: CallContext =
      held === undefined || ctx.principal.kind === 'system'
        ? ctx
        : { ...ctx, principal: { ...ctx.principal, level: held } };

    return allows(at, need, listName) ?? (register ? reaches(ctx, register) : null);
  };

  /**
   * The guard for a read that names no register AND FILTERS BY THE CEILING ITSELF.
   *
   * TWO KINDS OF REGISTER-LESS METHOD, and treating them alike broke one of them. `members` and
   * `whoami` are about the RECORD, and about the other people in it: somebody who holds only named
   * registers holds none of that, and `guard` refusing a `null` level is right. But `boot`, `search`,
   * `page`, `metric`, `governance`, `whatsNew` and `digestToday` are about ROWS, and every one of them
   * already filters what it returns to the caller's ceiling — refusing them outright made a scoped member unable to see even
   * their own registers' figures, and made every one of those filters dead code, which is how a
   * ceiling stops being enforced by being enforced twice.
   *
   * SO A SCOPED MEMBER MAY ASK IF ANY ONE OF THEIR GRANTS REACHES THE QUESTION, and the filter does
   * the rest. That is not a widening: the ladder still refuses `write` to somebody who only holds
   * `read`, and every reader below still drops the registers they may not read. It is the difference
   * between "may you ask this question at all" and "which rows are in the answer".
   */
  const scoped = (ctx: CallContext, need: Need): Refusal | null => {
    const binding = reportKeyOf(ctx);
    if (binding !== null) return reportOnly(binding);
    const p = ctx.principal;
    if (p.kind === 'system' || p.level !== null) return guard(ctx, need);

    /* A LEVEL THIS RECORD DOES NOT PUBLISH IS NOT ONE. Only the index-max grant used to reach
       `allows`, and an unrecognised value sorts below every real one, so it never got there. Every
       grant is asked now, and `LEVEL_REACH[<anything else>]` is `undefined`, whose `.includes`
       throws a TypeError out of the one check this package promises never to throw over. */
    const held = Object.values(ctx.levels ?? {}).filter((level) => LEVELS.includes(level));
    if (held.length === 0) return guard(ctx, need);

    /* DOES ANY GRANT REACH THIS, RATHER THAN DOES THE HIGHEST ONE. This took the index-max level
       across the grants, and `append` sorts above `read` while `LEVEL_REACH.append` deliberately
       excludes `read`, which is what the note nine lines under `LEVELS` says in as many words. So
       adding an `append` grant on a second register TOOK AWAY the reading somebody already held on
       the first: `boot`, `pages`, `page`, `metric`, `search` and `governance` all began refusing
       `LEVEL_REQUIRED` while `list` on their own register still worked, and the sentence named the
       level they had just been given. Giving a contractor the right to file expenses stopped the
       app from starting for them. This question names no register, so the honest form of it is
       whether any one grant reaches the need. */
    if (held.some((level) => allows({ ...ctx, principal: { ...p, level } }, need) === null)) return null;

    /* AND WHEN NONE OF THEM DOES, THE REFUSAL IS THE FURTHEST-REACHING GRANT'S, so the sentence
       names the largest thing they hold rather than whichever register happened to be listed first. */
    const best = held.sort((a, b) => LEVELS.indexOf(b) - LEVELS.indexOf(a))[0]!;
    return allows({ ...ctx, principal: { ...p, level: best } }, need, listName);
  };

  /**
   * Which registers are in a register-less answer, and it is the LEVEL and not only the ceiling.
   *
   * ONLY THE CEILING WAS ASKED. Every reader that names no register filtered with `reaches`, which
   * consults `ctx.registers` and nothing else, so a register somebody may only APPEND to arrived in
   * `boot` with its name and its row count on it, in `search` with a row's title out of it, in the
   * list of pages, on a page block and in a digest section, while `list` on that same register
   * refused them. `append` is the one level whose entire point is that it does not read, and it read
   * everywhere the caller named nothing. `ctx.levels` is documented as the override and not the
   * ceiling, and the readers were consulting the other one.
   *
   * SO THIS ASKS EXACTLY WHAT `list` ASKS, and the two answer the same way about the same register.
   */
  const readable = (ctx: CallContext, register: string): Refusal | null => guard(ctx, 'read', register);

  /**
   * The vault gate: a person at `owner`, and never a bearer of any kind.
   *
   * NO TOKEN REACHES THE VAULT, AND IT IS NOT A SCOPE PROBLEM. An agent holding a write token can do
   * everything else this record does; it cannot read a credential, because a credential read by a
   * process is a credential that has left the room. Saying `SCOPE_INSUFFICIENT` would send somebody
   * looking for a bigger token, and there is not one — so the refusal names the thing that IS
   * missing: a person, in a browser, signed in.
   */
  const vault = (ctx: CallContext): Refusal | null => {
    if (ctx.principal.kind === 'token')
      return {
        code: 'NEEDS_BROWSER_SESSION',
        fix: 'Open this from the app; a token cannot reach the vault.',
        at: 'principal',
      };
    const stop = allows(ctx, 'owner', listName);
    if (stop) return stop;
    /* AND A SESSION WHOSE LAST PROOF IS OLDER THAN FIFTEEN MINUTES IS SENT BACK TO PROVE IT AGAIN. A
       cookie is thirty days of standing access; the vault is the one place a laptop left open on a desk
       should not be enough. After the owner check, so somebody who is not an owner is told that instead. */
    if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
      return { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to open the vault.', at: 'principal' };
    return null;
  };

  /**
   * The ADMIN gate: an owner, in a browser, and no token of any kind.
   *
   * IT IS THE VAULT'S ARGUMENT APPLIED TO SHAPE. A pack changes what the record IS — the registers,
   * the pages, the rules that run while nobody is looking — and ADR-060 says there is no `admin`
   * scope to issue for that. The refusal names the thing that IS missing rather than a bigger token
   * somebody would then go looking for.
   */
  /* `reads` IS WHAT A READING METHOD SAYS INSTEAD. Listing the copies a record keeps changes nothing,
     and telling a token it "cannot change what this record is" named a problem the caller did not have. */
  const admin = (ctx: CallContext, reads?: string): Refusal | null => {
    if (ctx.principal.kind === 'token')
      return {
        code: 'NEEDS_BROWSER_SESSION',
        fix: reads === undefined ? 'Open this from the app; a token cannot change what this record is.' : `Open this from the app; a token cannot ${reads}.`,
        at: 'principal',
      };
    return allows(ctx, 'owner', listName);
  };

  /**
   * The digest `ingestMint` kept for one webhook ingest, while the declaration it was minted for is still the one in
   * force, and nothing once it is not. A digest that is no longer good is deleted here, as it is found.
   *
   * THE ROW OUTLIVED ITS DECLARATION, AND THAT WAS THE CHECKER'S FINDING. Nothing deleted it, so an ingest retired and
   * then declared again under the same id answered the old digest, and the token shown for the first declaration
   * verified the second, which nobody had minted for. Dropping `verify:` and putting it back did the same. Both were
   * measured red in `test/ingest-verify-digest.test.ts` before this was written.
   *
   * READ OFF THE DECLARATION'S OWN HISTORY RATHER THAN DELETED BY EVERY PATH THAT RETIRES ONE, because this file
   * alone has several (`retireDeclaration`, `setDeclaration`, a pack's install, uninstall, disable and enable) and a
   * test or a host may call `kernel.retire` directly, so a delete at each would be one more line somebody forgets.
   * The kernel never deletes a declaration row (`0001_kernel.ts`): a change is a new version, a retire sets
   * `retired` on the row that was live, and a reinstall after one is a new version too. So the mint keeps the
   * version it was shown against, and the digest is good exactly while every version from that one on is
   * unretired, a webhook, and `verify: { kind: path }`. A pack update that keeps `verify:` keeps his Shortcut working; turning money-core off
   * and on again does not, because a disable retires the twin like any other retire.
   */
  const heldDigest = (ingest: string): string | undefined => {
    const key = ingestTokenKey(ingest);
    const value = sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', key)?.value;
    if (value === undefined) return undefined;
    const cut = value.indexOf(':');
    const since = Number(value.slice(0, cut));
    const rows =
      cut > 0 && Number.isInteger(since)
        ? sql.all<{ retired: number; body: string }>('SELECT retired, body FROM declaration WHERE id = ? AND version >= ? ORDER BY version', `ingest.${ingest}`, since)
        : [];
    const unbroken =
      rows.length > 0 &&
      rows.every((r) => {
        const d = JSON.parse(r.body) as { channel?: unknown; verify?: { kind?: unknown } };
        return r.retired === 0 && d.channel === 'webhook' && d.verify?.kind === 'path';
      });
    if (unbroken) return value.slice(cut + 1);
    sql.exec('DELETE FROM dog_meta WHERE key = ?', key);
    return undefined;
  };

  /**
   * Count one device start against `key`: the seconds to wait, or `null` to go on.
   *
   * FAIL CLOSED. A statement that throws or returns no row refuses for the whole window, because a count
   * that stops when its table misbehaves is a limit anybody can switch off. A window that has passed is
   * deleted first, so the insert below starts it again at one.
   */
  const counted = (key: string): number | null => {
    const now = clock.now();
    let row: { n: number; until: string } | undefined;
    try {
      sql.exec("DELETE FROM auth_fail WHERE key LIKE 'device:%' AND until <= ?", new Date(now).toISOString());
      row = sql.one<{ n: number; until: string }>(COUNT_START, key, new Date(now + WINDOW).toISOString(), STARTS);
    } catch {
      row = undefined;
    }
    if (!row) return Math.ceil(WINDOW / 1000);
    return row.n > STARTS ? Math.max(1, Math.ceil((Date.parse(row.until) - now) / 1000)) : null;
  };

  /**
   * Spend `rows` of a report key's budget: the seconds to wait, or `null` when they fit and are now spent.
   *
   * IN `auth_fail`, THE RECORD'S OWN LOCAL TABLE, so it holds on either host and across a restart, and never travels
   * in an export. A window opens with a key's first report and ends a minute later; a report that does not fit is not
   * counted, so it can be sent again whole. FAIL CLOSED, as `counted` is.
   */
  const reportBudget = (token: string, rows: number): number | null => {
    const now = clock.now();
    const key = `report:${token}`;
    try {
      sql.exec("DELETE FROM auth_fail WHERE key LIKE 'report:%' AND until <= ?", new Date(now).toISOString());
      const row = sql.one<{ n: number; until: string }>('SELECT n, until FROM auth_fail WHERE key = ?', key);
      if (row && row.n + rows > REPORT_ROWS_PER_MINUTE) return Math.max(1, Math.ceil((Date.parse(row.until) - now) / 1000));
      if (row) sql.exec('UPDATE auth_fail SET n = n + ? WHERE key = ?', rows, key);
      else sql.exec('INSERT INTO auth_fail (key, n, until) VALUES (?, ?, ?)', key, rows, new Date(now + REPORT_WINDOW_MS).toISOString());
      return null;
    } catch {
      return Math.ceil(REPORT_WINDOW_MS / 1000);
    }
  };

  /* ── the vault doors' half ── */

  const mintGrant = ulids(() => clock.now());

  /**
   * The key a caller may reach, by spoken id or by label, or `null`.
   *
   * A PROJECT GRANT REACHES ITS PROJECT'S KEYS AND A `*` GRANT REACHES THE KEYS OF NO PROJECT, and nothing
   * else. A key outside the scope and a key that is not there are both `null`, so the answer says nothing about
   * another project's keys.
   *
   * A `null` GRANT IS AN OWNER IN A BROWSER, WHO REACHES EVERY KEY THIS RECORD HOLDS. Scope is what an agent is
   * held to, because a grant is issued for one project and lives on a machine; a person who may see the whole
   * record is not narrowed by a credential they were never issued. Who they are was settled by `vault(ctx)`
   * before this is asked.
   */
  const keyFor = (by: { label: string } | { credential: string }, grant: VaultGrant | null): Entry | null => {
    const within = (row: Entry | null): row is Entry => {
      if (!row || row.register !== KEYS || row.deleted_at) return false;
      if (grant === null) return true;
      const project = typeof row.fields.project === 'string' && row.fields.project ? row.fields.project : null;
      return grant.scope === '*' ? project === null : project === grant.scope;
    };
    if ('credential' in by) {
      const row = kernel.get(by.credential);
      return within(row) ? row : null;
    }
    const ids = sql.all<{ id: string }>(
      "SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.label') = ? ORDER BY seq",
      KEYS,
      by.label,
    );
    for (const { id } of ids) {
      const row = kernel.get(id);
      if (within(row)) return row;
    }
    return null;
  };

  /**
   * One sentence for a key the caller does not reach, whether it is elsewhere or nowhere.
   *
   * AN OWNER GETS A DIFFERENT CODE BECAUSE THEY HAVE A DIFFERENT PROBLEM. A grant that cannot reach a key is
   * refused, and the sentence must not say whether the key exists somewhere else. An owner reaches every key
   * there is, so the only way they can miss is by naming one that is not there, which is `REF_UNKNOWN` and a
   * sentence they can act on.
   */
  const unreached = <T>(grant: VaultGrant | null): Result<T> =>
    grant === null
      ? no<T>('REF_UNKNOWN', 'This record holds no key by that name.', { at: 'credential' })
      : no<T>(
          'FORBIDDEN',
          grant.scope === '*'
            ? 'This vault grant opens only the keys that belong to no project, and none of those is that key.'
            : "This vault grant opens only its own project's keys, and none of those is that key.",
          { at: 'credential' },
        );

  /**
   * Who a door's deposit or read is by: the run the caller names, `S12`, while it is live, and otherwise the
   * agent. Never the person who approved the grant, whose name on an agent's act is the attribution a run replaces.
   */
  const vaultActor = (hints: SessionHints): string => {
    const run = hints.spoken ? kernel.findRun({ spoken: hints.spoken }) : null;
    return run && run.seq !== null ? `${PREFIX}${run.seq}` : `agent:${hints.agent ?? 'other'}`;
  };

  /**
   * The declaration state a plan is built against, for `ctx` when a caller will read the plan.
   *
   * `record_version` IS KEYED TO THE CALLER, AS `version()` IS SINCE `83875130`. `declare`'s `plan` writes it in the clear
   * as the integer half of `planHash`, and `planPack` is `admin`, which asks for an owner and nothing about lists: an
   * owner held to `append` on Diary read 4 and then 6 at the head of his plan across two Diary writes he may not read
   * (`installed-state-version.test.ts` (1)), the count `holdsRowids` exists to withhold. So he is given `versionFor`'s
   * number, and `installPack` builds its own plan with the same caller, so the hash he approves is the hash it checks.
   * What he gives up is `PLAN_STALE` for a write he cannot see, which is a write whose count he was not to be told.
   * Without a caller, as the arranger and the use-case planner ask, the plan never leaves the record and keeps the rowid.
   */
  const installedState = (ctx?: CallContext): Installed => ({
    format: FORMAT_VERSION,
    primitives: PRIMITIVES_VERSION,
    record_version: ctx === undefined ? kernel.version() : versionFor(ctx),
    packs: kernel.packs(),
    declarations: kernel.declarations() as Installed['declarations'],
    rows: kernel.census(),
    config: kernel.packSettings(),
    /* WHICH OF THE OWNER'S DECLARATIONS A PACK WROTE FIRST, so a plan keeps an edit of the pack's own declaration rather
       than refusing the whole update as somebody else's (`declare` `plan`). */
    detached: Object.fromEntries(kernel.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
    nameOf: (ref) => kernel.titleOfRow(ref),
  });

  /**
   * The four functions a pack install needs from the record, with the caller bound.
   *
   * THE SEEDS GO THROUGH THE WRITE PATH like every other row — coerced, validated, refused by the
   * register's own rules — and with `cascade: false`, because a pack's example rows firing a
   * customer's notification rules on the day they install it is the worst first impression there is.
   */
  const packHost = (ctx: CallContext): Host => ({
    count: (register) => kernel.count(register),
    stage: (batch) => kernel.stageInstall(batch as never),
    transaction: (fn) => kernel.transaction(fn),
    reload: () => kernel.reload(),
    retire: (ids) => kernel.retire(ids),
    seed: (register, fields, note) =>
      kernel.create(register, { ...fields, tags: exampleTag(fields) }, {
        actor: actorOf(ctx),
        cascade: false,
        ...(note === undefined ? {} : { note }),
      } as never),
    remember: (row) => kernel.rememberPack({ ...row, by: actorOf(ctx) }),
    forget: (id) => kernel.forgetPack(id),
    claimed: (pack) => kernel.packClaims(pack),
    keyReady: (name, paged) => kernel.keyReady(name, paged),
  });

  /* WHAT AN AGENT OR SPARK MAY ASK TO CHANGE ABOUT THIS RECORD, and how the owner's press applies it (`arrange.ts`). */
  const arrangement = arranger({
    kernel,
    catalogue: deps.catalogue ?? [],
    installed: () => installedState(),
    host: (actor) => packHost({ principal: { kind: 'person', id: actor, level: 'owner' } }),
  });

  /**
   * One reading for Spark: how the record is used, what the host offers, what that says, and what Spark has asked already.
   * A catalogue pack is built to see whether its pages show agents only when an agent has written here.
   */
  const sparkReading = () => {
    const catalogue = deps.catalogue ?? [];
    const titled = (e: CatalogueEntry) => (e.title === e.id ? e.id.charAt(0).toUpperCase() + e.id.slice(1) : e.title);
    const usage = readUsage(sql, kernel, clock.now(), new Map(catalogue.map((e) => [e.id, titled(e)])), speakingNow(kernel));
    const busy = usage.agents.length > 0;
    const offered: Offered[] = catalogue.map((e) => {
      let shows = false;
      if (busy && e.kind === 'pack')
        try {
          const doc = e.doc({ holds: [], usecase: null });
          shows = Array.isArray(doc?.declarations) && doc.declarations.some((x) => typeof (x as { page?: unknown })?.page === 'string' && pageShowsAgents(x));
        } catch {
          shows = false;
        }
      return { id: e.id, kind: e.kind, title: titled(e), modules: e.modules, showsAgents: shows, skills: e.skills };
    });
    const seen = noticeUsage(usage, offered);
    /* ASKED: anything Spark filed, in any state, and anything anybody filed that is still open. */
    const asked = new Map<string, { id: string; status: string }>();
    const waiting: { id: string; question: string }[] = [];
    for (const row of sql.all<{ id: string; body: string; status: string; opened_by: string }>(
      "SELECT id, body, status, opened_by FROM suggestion WHERE body_kind IN ('pack', 'settings', 'arrange', 'rowset') AND (opened_by = ? OR status = 'open') ORDER BY opened_at",
      SPARK,
    )) {
      try {
        asked.set(stableKey(JSON.parse(row.body) as Record<string, unknown>), { id: row.id, status: row.status });
      } catch {
        /* a body that will not parse asks nothing */
      }
      if (row.opened_by === SPARK && row.status === 'open') waiting.push({ id: row.id, question: kernel.question(row.id) ?? row.id });
    }
    return { usage, offered, ...seen, asked, waiting };
  };

  /**
   * Spark's proposals filed on Decide: the model's, when one is configured and answers something valid, else the rules'.
   * The one filing path, for the owner's press and for the daily run alike.
   *
   * EVERY ARRANGEMENT GOES THROUGH `prepare`, the door a token's proposal goes through, and a row it offers (a skill) through
   * the kernel's own check of a rowset; all are filed as `spark`, which may suggest and write nothing else (`kernel/spark.ts`).
   * A draft already asked, in any state, is not asked again, so a dismissal holds; no more than `SPARK_OPEN_CAP` wait at once.
   */
  const sparkFile = async () => {
    const r = sparkReading();
    let drafts: SparkDraft[] = r.drafts;
    let by = 'rules';
    const dropped: string[] = [];
    const model = deps.sparkModel;
    if (model && r.quiet === null) {
      try {
        const raw = await model.draft({
          usage: r.usage,
          noticed: r.noticed,
          rules: r.drafts.map(({ question, body_kind, body }) => ({ question, body_kind, body })),
          offered: r.offered.map(({ id, kind, title }) => ({ id, kind, title })),
          kinds: ['pack', 'settings', 'arrange'],
          most: SPARK_OPEN_CAP,
        });
        const got = fromModel(raw, model.name);
        dropped.push(...got.dropped);
        if (got.drafts.length > 0) {
          drafts = got.drafts;
          by = model.name;
        } else dropped.push("The model proposed nothing Spark could use, so Spark's own rules drafted these.");
      } catch {
        dropped.push("The model did not answer, so Spark's own rules drafted these.");
      }
    }
    if (deps.catalogueOffers) {
      try {
        const on = new Map(r.usage.packs.map((p) => [p.id, p.on]));
        drafts = [...drafts, ...catalogueDrafts(await deps.catalogueOffers(kernel.packs().map((p) => ({ ...p, on: on.get(p.id) ?? true }))))];
      } catch {
        dropped.push('The catalogue could not be read, so no update from it was asked about.');
      }
    }
    /* WHAT A USE CASE GROWS INTO, once the figures it names say so: asked whatever the record's age (`growsDrafts`). */
    const usedOn = new Map(r.usage.packs.map((p) => [p.id, p.on]));
    const packsOn = new Set(kernel.packs().filter((p) => usedOn.get(p.id) ?? true).map((p) => p.id));
    drafts = [
      ...drafts,
      ...growsDrafts(deps.catalogue ?? [], (id) => packsOn.has(id), (metric) => {
        const decl = kernel.metricDecl(metric);
        const read = decl ? kernel.metric(decl) : null;
        return read?.ok && typeof read.value.value === 'number' ? read.value.value : null;
      }),
    ];
    const filed: { id: string; question: string; by: string }[] = [];
    const skipped: { question: string; why: string }[] = [];
    for (const d of drafts) {
      if (r.asked.has(d.key)) {
        skipped.push({ question: d.question, why: 'Spark has asked this before.' });
        continue;
      }
      if (r.waiting.length + filed.length >= SPARK_OPEN_CAP) {
        skipped.push({ question: d.question, why: `${SPARK_OPEN_CAP} of Spark's questions are already waiting on Decide.` });
        continue;
      }
      const prepared = d.body_kind === 'rowset' ? ok(d.body) : await arrangement.prepare(d.body_kind, d.body);
      if (!prepared.ok) {
        skipped.push({ question: d.question, why: 'refusal' in prepared ? prepared.refusal.fix : 'It would not apply.' });
        continue;
      }
      const key = stableKey(prepared.value);
      if (r.asked.has(key)) {
        skipped.push({ question: d.question, why: 'Spark has asked this before.' });
        continue;
      }
      const put = kernel.propose({ question: d.question, body_kind: d.body_kind, body: prepared.value }, SPARK);
      if (!put.ok) {
        skipped.push({ question: d.question, why: 'refusal' in put ? put.refusal.fix : 'It would not file.' });
        continue;
      }
      r.asked.set(key, { id: put.value.id, status: 'open' });
      filed.push({ id: put.value.id, question: d.question, by: d.by });
    }
    return { by, filed, skipped, dropped };
  };

  /**
   * WHETHER SPARK RUNS ON ITS OWN, and the day it last did. Kept as Spark's own two prefs (`pref`, person `spark`): the
   * record's, not a person's, local to this copy as every pref is, and no migration. On unless the owner turned it off.
   */
  const SPARK_DAILY = 'spark.daily';
  const SPARK_LAST = 'spark.last';
  const sparkDailyState = () => {
    const prefs = kernel.prefsOf(SPARK);
    return { on: prefs[SPARK_DAILY] !== false, last: typeof prefs[SPARK_LAST] === 'string' ? (prefs[SPARK_LAST] as string) : null };
  };

  /* A USE CASE SHARED AS A FILE, and one planned here (`usecase.ts`). */
  const sharing = useCases({ kernel, catalogue: deps.catalogue ?? [], installed: () => installedState() });

  /**
   * Whether a caller may open one page `kernel.pages()` lists, the one rule `pages`, `boot`, `arrangement` and `page` share.
   *
   * VISIBLE WHEN ANY LIST IT DRAWS FROM IS READABLE, AND NEVER WHEN THE ROW IT IS ABOUT IS NOT. A page made for each diary
   * row takes its title and slug from the row, so a page per row whose blocks read Obligations was listed by the diary
   * entry's title to a member invited to Obligations alone. `about` is the row a template expanded over (`kernel.pages`),
   * and the list that row lives in is asked on its own, whatever the blocks read.
   */
  const seesPage = (ctx: CallContext, p: { registers: string[]; about: { register: string } | null }): boolean =>
    (p.registers.length === 0 || p.registers.some((id) => !readable(ctx, id))) && (p.about === null || !readable(ctx, p.about.register));

  /** The pages a caller may open, as `pages` lists them. */
  const visiblePages = (ctx: CallContext) =>
    kernel
      .pages()
      .filter((p) => seesPage(ctx, p))
      .map((p) => ({ slug: p.slug, title: p.title }));

  /**
   * The computed sources that read across the whole record rather than any one list: the log, the scheduled actions and
   * the open questions. `loop/research-scoped-audit.md` §2 measured the last two on a Desk page handing a member invited
   * to Obligations a diary rowset's question and a bank key's host and label, while `governance` and `actions` both held
   * those back from her. The record asks the source itself rather than waiting for `kernel.blockRegisters` to name
   * something for it, so the block is held whether or not the kernel's answer carries a name for the whole record.
   */
  const ACROSS = new Set(['activity', 'actions', 'governance.open']);

  /**
   * The lists one block reads that `kernel.blockRegisters` may not name: each leg of a cash walk, and `session` for a
   * block that draws the live runs or marks the rows a run is working on. Measured before: a walk over Bills drew
   * *Severance for Sam*, -1,250,000, to a member `list('bills')` refuses, because the kernel named only the list its
   * opening figure counts; and a `sessions.live` block gave her three runs' repo, work and token id, which
   * `sessionsLive` refuses somebody without `read` on `session`. A leg is JSON somebody wrote, so one with no list names
   * nothing here and the walk refuses it when it runs.
   */
  const alsoReads = (b: { source?: unknown; from?: unknown; working?: unknown }): string[] => [
    ...(Array.isArray(b.from)
      ? (b.from as unknown[]).flatMap((leg) => (leg !== null && typeof leg === 'object' && typeof (leg as { register?: unknown }).register === 'string' ? [(leg as { register: string }).register] : []))
      : []),
    ...(b.source === 'sessions.live' || b.working === true ? [SESSION] : []),
  ];

  /**
   * What a refused block drew, taken back. The empties that were blanked before stay as empties, so a host that reads
   * `readings` of a refused `stat` still finds a list; everything else a block computes goes. `walk` did not, so a cash
   * walk refused for its legs would still have carried every step, and `where` is a filter a person wrote with a field
   * value in it (`body is Dinner with the auditor`, measured in §6).
   */
  const DRAWN = ['where', 'fx', 'walk', 'walks', 'walkFx', 'past', 'inherited', 'scopes', 'rings', 'history', 'bars', 'changes', 'working_now', 'lateness', 'late_name', 'seen'] as const;

  /**
   * AND WHAT A REFUSED BLOCK WAS WRITTEN TO READ, which is the names of lists and figures she cannot open.
   * `loop/research-batch-seventeen-audit.md` finding 4 measured a member invited to Obligations reading
   * `cells: [{ metric: 'diary-count' }]` off a refused figures block, and `from: [{ register: 'bills' }]` with
   * `opening: 1000000` off a refused cash walk: two list names `boot` hides from her and, on a hand-written page, an
   * opening balance. The legs and the cells are what `blockRegisters` and `alsoReads` judged the block by, so what is
   * refused is exactly what they name.
   *
   * `source` IS NOT HERE YET. `register.diary` on a refused table is the same kind of name, and
   * `test/scoped-audit.test.ts` finds that block by it; the test has to find it another way before `source` can go.
   */
  const WRITTEN = ['from', 'cells', 'opening'] as const;

  /**
   * The `example` marker, which IS the value `example` in a register's own `tags` field.
   *
   * A SEEDED ROW NOBODY CAN TELL FROM A REAL ONE IS A ROW NOBODY DELETES. The marker is a value in
   * a declared field rather than a column, because a column would be a thing every register carries
   * for the sake of the few that are seeded.
   */
  const exampleTag = (fields: Record<string, unknown>): string[] => {
    const already = Array.isArray(fields.tags) ? (fields.tags as unknown[]).map(String) : [];
    return already.includes('example') ? already : [...already, 'example'];
  };

  /**
   * The fields a predicate filters on that this register has no index for.
   *
   * THE DECLARATION IS THE AUTHORITY, not the SQL plan. `index:` on a field is what puts a partial
   * index on it at install, so a field without it is a scan by construction — no `EXPLAIN` needed,
   * and no dependence on a planner whose choices differ between the two runtimes this ships to.
   */
  const unindexed = (register: string, where: Predicate | undefined): string[] => {
    if (!where) return [];
    const decl = kernel.register(register);
    if (!decl) return [];
    const indexed = new Set(
      decl.fields.filter((f) => (f as { index?: boolean }).index || f.unique).map((f) => f.id),
    );
    const out = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      for (const key of ['all', 'any', 'none'])
        if (Array.isArray(n[key])) {
          for (const child of n[key] as unknown[]) walk(child);
          return;
        }
      if (typeof n.field === 'string' && !indexed.has(n.field)) out.add(n.field);
    };
    walk(where);
    return [...out];
  };

  /**
   * Whether a governance row is about a register this caller cannot reach.
   *
   * ONLY A `rowset` NAMES ONE. An `options` body is a question and its answers, a `pattern` is a
   * declaration, a `change` is a diff — none of them carries somebody's rows. A `rowset` does, up to
   * two hundred of them, with every field value in the body.
   */
  const holds = (ctx: CallContext, row: Record<string, unknown>): boolean => {
    /* A DECISION IS HELD BACK EXACTLY WHEN THE QUESTION IT SETTLED IS. It has no `body_kind`, so every branch below
       answered `false` and a member invited to one list read the question and the reason of every decision on the
       record: batch fourteen's audit listed a diary decision to a colleague who could see only Obligations. It names no
       register itself, and the register it is about is the one its suggestion's body named, so the rule is the
       suggestion's rule, asked of the suggestion (`SETTLED` in the kernel pairs them by adjacent log lines). A decision
       whose question cannot be found is about nothing this caller can be shown to reach, so only somebody who reads the
       whole record sees it, which is the rule `lineOf` keeps for a line about nothing in particular. */
    if (typeof row.decided_by === 'string' && 'answer' in row) {
      const settled = typeof row.suggestion === 'string' ? kernel.governanceRow('suggestion', row.suggestion) : null;
      return settled === null ? !wholeRecord(ctx) : holds(ctx, settled);
    }
    /* A PREDICTION IS ABOUT THE DECLARATION IT NAMES, and it named none this function asked about. It has no `body_kind`,
       so it fell to the last line and went to everyone: `loop/research-scoped-audit.md` §3 read a prediction about the
       diary, its claim, its measure and `baseline: 2`, off `governance` as a member invited to Obligations, while the
       change it grades and that change's decision were held back from her in the same run. `for_decl` is read as the
       `change` branch reads `declaration_id`: a list's declaration asks that list, and anything else (a page, a rule) is
       about the record as a whole. */
    if (typeof row.for_decl === 'string') {
      const list = row.for_decl.startsWith('register.') ? row.for_decl.slice('register.'.length) : '';
      return list === '' ? !wholeRecord(ctx) : readable(ctx, list) !== null;
    }
    const body = row.body as Record<string, unknown> | undefined;
    /* EVERY BODY THAT NAMES A REGISTER, not only a `rowset`. A `pattern` carries a whole ingest
       declaration with `writes.register` on it and a `change` carries a `declaration_id`; both name
       a register and both used to pass unfiltered while the one that carries ROWS was filtered. */
    const named =
      row.body_kind === 'rowset'
        ? body?.register
        : row.body_kind === 'pattern'
          ? ((body?.ingest as { body?: { register?: unknown } } | undefined)?.body?.register ??
            (body?.ingest as { writes?: { register?: unknown } } | undefined)?.writes?.register)
          : row.body_kind === 'change' && String(body?.declaration_id ?? '').startsWith('register.')
            ? String(body?.declaration_id).slice('register.'.length)
            : undefined;
    /* AND IT IS THE LEVEL, NOT ONLY THE CEILING. This asked `reaches`, so a `rowset` over a register
       somebody may only append to came back to them with every field value in it. */
    /* A PLAN'S ROWS name their lists one row at a time, and the whole question is held back when any is out of reach. */
    if (row.body_kind === 'arrange' && Array.isArray(body?.rows) && body.rows.length > 0)
      return (body.rows as { register?: unknown }[]).some((r) => (typeof r?.register === 'string' ? readable(ctx, r.register) !== null : !wholeRecord(ctx)));
    /* A QUESTION THAT NAMES NO LIST IS ABOUT THE WHOLE RECORD, and goes where `lineOf` sends a line about the whole record:
       to somebody who reads all of it. This answered `false` for any body that named no list, so an `options` question,
       its answer and the owner's reason (*The auditor must not see his salary line*) reached a member invited to
       Obligations through `governance`, `whatsNew` and `recentHistory` (§5), and so did the question a missed prediction
       files, whose body carries only its two options (§3). A `pack` or `settings` proposal is about what the record is,
       and a `change` to a page or a rule is about no one list, so each takes the same rule. */
    if (typeof named !== 'string' || named === '') return !wholeRecord(ctx);
    return readable(ctx, named) !== null;
  };

  /**
   * Who signs a call the kernel's ladder does not reach: a decision, an invitation, a pack's seed rows.
   * For a token that is the person who holds it; a token reaches none of these but a read.
   */
  const actorOf = (ctx: CallContext): string =>
    ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id;

  /** `agent:claude`: a token's name, when its write has no run to sign it (`30 §3`). */
  const agentOf = (ctx: CallContext): string => `agent:${ctx.session?.agent ?? 'other'}`;

  /**
   * Who a row write is by, as the kernel's `WriteContext` says it.
   *
   * A TOKEN'S WRITE IS SIGNED BY ITS RUN. The principal and the run's hints go down, and the kernel's
   * ladder finds or opens the run and signs with it, `S42` (`30 §3`). `actor` is then only what the
   * events carry when no run could be opened, `agent:<name>`, and never the person: a person's name on
   * an agent's write is the attribution the ladder replaces. Anybody else signs as themselves, which is
   * how a person in a browser is never a run.
   */
  const writerOf = (ctx: CallContext): Pick<WriteContext, 'actor' | 'principal' | 'session'> =>
    ctx.principal.kind === 'token'
      ? {
          actor: agentOf(ctx),
          principal: { kind: 'token', token: ctx.principal.id },
          ...(ctx.session === undefined ? {} : { session: ctx.session }),
        }
      : { actor: ctx.principal.id };

  /**
   * The run a token's call belongs to, for the calls that must know it before they write: `attach` and
   * `handoff` write the run's own row. The kernel finds it by the ladder, or opens it signed by itself
   * with `note`, and writes nothing to a run it found: the call's own write moves its heartbeat.
   */
  const runFor = (ctx: CallContext, hints: SessionHints, note: string): Result<{ run: Entry; spoken: string; opened: boolean }> =>
    kernel.runFor(writerOf({ ...ctx, session: hints }), note);

  /** Seconds since a run was last heard from, or since its row last changed when it never was. */
  const ageOf = (row: Entry): number => {
    const seen = typeof row.fields.last_seen === 'string' ? row.fields.last_seen : row.updated_at;
    return Math.max(0, Math.floor((clock.now() - Date.parse(seen)) / 1000));
  };

  /**
   * The runs that are live now, newest heard from first, with what is worked out when they are read.
   *
   * STALE IS DERIVED AND NEVER STORED: a run that crashed never says so, so the clock is compared with
   * `last_seen` here. `same_repo` compares with the caller's own hints, and is `false` for a caller that
   * sent none.
   */
  const live = (ctx: CallContext): LiveRun[] => {
    const rows = kernel.list({
      register: SESSION,
      where: { field: RUN.state, in: LIVE },
      order: [{ field: 'last_seen', dir: 'desc' }],
      limit: 50,
    });
    if (!rows.ok) return [];
    const now = clock.now();
    const repo = ctx.session?.repo;
    return rows.value.rows.map((row) => ({
      ...row,
      spoken: `${PREFIX}${String(row.seq)}`,
      stale: isStale(row, now),
      age_s: ageOf(row),
      same_repo: repo !== undefined && row.fields.repo === repo,
    }));
  };

  /**
   * Open suggestions the caller may see, newest first, held to the ceiling `governance` holds them to,
   * each with its question, which is its `suggest` event rather than a column. The body is one
   * `governance({ id })` away.
   */
  const waitingFor = (ctx: CallContext): Waiting[] => {
    /* FILTERED, THEN TRIMMED. Twenty newest and then filtered left a scoped caller nothing when the
       twenty newest were all about registers it cannot see. */
    const rows = kernel.openSuggestions();
    if (!rows.ok) return [];
    return rows.value
      .filter((row) => !holds(ctx, row))
      .flatMap((row) => {
        /* THE QUEUE `boot` AND `context` READ OUT, so its ids go out as `nameOf` hands them. */
        const id = nameOf(ctx, 'suggestion', String(row.id));
        return id === null
          ? []
          : [{ id, body_kind: String(row.body_kind), opened_by: String(row.opened_by), opened_at: String(row.opened_at), question: kernel.question(String(row.id)) ?? '' }];
      })
      .slice(0, 20);
  };

  /**
   * A suggestion with its question, which is its `suggest` event rather than a column.
   *
   * WITHOUT IT A QUEUE IS A LIST OF BODIES NOBODY CAN READ: `governance` answered each open suggestion
   * with its options and not what they were options for, so an agent reading the queue saw "Block it"
   * and "Keep it open" and had to go to `context` to learn what was being asked.
   */
  const asked = <T>(register: string, row: T): T =>
    register === 'suggestion' && row !== null && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string'
      ? ({ ...row, question: kernel.question((row as unknown as { id: string }).id) ?? '' } as T)
      : row;

  /** Whether the caller reads the record as a whole, rather than the registers they were invited to. */
  const wholeRecord = (ctx: CallContext): boolean =>
    ctx.principal.kind === 'system' ||
    (ctx.principal.level !== null && (ctx.registers === undefined || ctx.registers === '*'));

  /**
   * One event as this caller may see it, or `null` when they may not.
   *
   * THE SAME QUESTIONS THE OTHER READS ASK, one event at a time. A row's event goes to whoever may `list` its register,
   * a question's to whoever `governance` shows it to, and a line about keys, access or links to an owner only, because
   * the vault and the members list are theirs. Everything else is about the record as a whole, so somebody invited to
   * named registers does not see it.
   */
  const lineOf = (ctx: CallContext, e: LogLine): Walked | null => {
    const bare: Walked = { ...e, register: null, seq: null, title: null };
    const target = e.target ?? '';
    const colon = target.indexOf(':');
    const kind = e.target_kind ?? (colon > 0 ? target.slice(0, colon) : null);
    const id = colon > 0 ? target.slice(colon + 1) : target;
    if (kind === 'entry') {
      const row = kernel.get(id, { includeDeleted: true });
      if (!row || readable(ctx, row.register)) return null;
      const title = kernel.register(row.register)?.title;
      return { ...bare, register: row.register, seq: row.seq, title: title ? String(row.fields[title] ?? '') || null : null };
    }
    if (kind === 'suggestion' || kind === 'decision') {
      const row = kernel.governanceRow(kind, id);
      if (row && holds(ctx, row)) return null;
      /* A DECISION NAMES THE QUESTION IT ANSWERS, and the words are that question's. */
      const asked = kind === 'suggestion' ? id : typeof row?.question === 'string' ? row.question : null;
      const title = asked === null ? null : (kernel.question(asked) ?? (kind === 'decision' ? asked : null));
      /* AND A `decide` LINE SAYS WHICH QUESTION IT SETTLED. Nothing else on the two lines ties a decision to the
         `resolve` written beside it (the `to` is the question's words, and neither carries a batch), so Home paired them
         by `rowid - 1`. The kernel's `SETTLED` already makes that join in SQL, where the number never leaves the server,
         and `row.suggestion` is its answer. */
      const spokenSettles = e.kind === 'decide' && kind === 'decision' && typeof row?.suggestion === 'string' ? row.suggestion : null;
      /* AND BOTH NUMBERS ARE HANDED AS `nameOf` HANDS THEM, the one in `target` and the one in `settles`: these two
         fields were how the survey's walk found `SG7` and `D4` in a scoped member's `recentHistory` and `whatsNew`. On a
         question's first `suggest` line the handle is `q.` and that line's own `id`, so it tells her nothing twice. */
      const own = nameOf(ctx, kind, id);
      const settles = spokenSettles === null ? null : nameOf(ctx, 'suggestion', spokenSettles);
      if (own === null || (spokenSettles !== null && settles === null)) return null;
      const said = own === id ? bare : { ...bare, target: `${kind}:${own}` };
      return settles === null ? { ...said, title } : { ...said, title, settles };
    }
    if (/^(?:grant|access|share)\./u.test(e.kind) || ['grant', 'vault_key', 'device_grant', 'member', 'person'].includes(kind ?? ''))
      return allows(ctx, 'owner') === null ? bare : null;
    if (id.startsWith('register.')) return readable(ctx, id.slice('register.'.length)) ? null : bare;
    return wholeRecord(ctx) ? bare : null;
  };

  /* A BATCH IS WHAT ONE STATEMENT READS, AND THE CAP IS WHAT ONE CALL WILL WALK. A caller who may see one register of a
     busy record would otherwise walk the whole log to fill a page; past the cap the answer is short and says where it
     stopped, and the next call carries on from there. */
  const BATCH = 500;
  const WALK = 5_000;
  /** How many lines `whatsNew` answers with: a screen's worth, `45 §5.3`. */
  const NEWS = 60;

  /**
   * Walk the log down from `before`, no lower than `floor`, keeping what the caller may see, until `want` are kept.
   * `next` is where a further walk would start, and `null` once nothing is left above the floor.
   */
  const walk = (ctx: CallContext, before: number | null, floor: number, want: number, setups = false): { lines: Walked[]; next: number | null } => {
    const lines: Walked[] = [];
    /* THE FEED SAYS A RECORD SETTING ITSELF UP AS ONE LINE (`kernel/src/feed.ts`); the log keeps every write. */
    const setup = setups
      ? setupCollapser<Walked>((line) => {
          const id = (line.target ?? '').replace(/^entry:/u, '');
          const tags = kernel.get(id, { includeDeleted: true })?.fields.tags;
          return Array.isArray(tags) && tags.includes('example');
        })
      : null;
    const keep = (line: Walked): void => {
      for (const out of setup ? setup.push(line) : [line]) lines.push(out);
    };
    const done = (next: number | null): { lines: Walked[]; next: number | null } => {
      if (setup) lines.push(...setup.flush());
      return { lines, next };
    };
    let at = before;
    let walked = 0;
    while (walked < WALK) {
      const batch = kernel.eventsBefore(at, BATCH);
      for (const e of batch) {
        if (e.rowid < floor) return done(null);
        walked += 1;
        at = e.rowid;
        const line = lineOf(ctx, e);
        if (line) keep(line);
        if (lines.length >= want) return done(at);
      }
      if (batch.length < BATCH) return done(null);
    }
    return done(at);
  };

  /** Where this person last read, or `null` when they never have. `members()` already folds their rows to the furthest. */
  const markOf = (person: string | null): string | null => kernel.members().find((m) => m.person_id === person)?.seen_at ?? null;

  /** Whose read mark a caller reads: a person's own, and a token's person's, the one `whatsNew` answers from. */
  const readerOf = (ctx: CallContext): string | null =>
    ctx.principal.kind === 'person' ? ctx.principal.id : ctx.principal.kind === 'token' ? ctx.principal.person : null;

  /**
   * Whether this caller reads every list, which is who may be handed a question's number and the table's counts.
   *
   * NOT `wholeRecord`, WHICH ASKS ONLY ABOUT THE CEILING. A member invited at `read` with Diary held to `append` has no
   * ceiling, so `wholeRecord` called her whole, and `lineOf` hid Diary from her because `append` does not read: her two
   * lines came back as rowids 10 and 6 with the three Diary writes she cannot see at 7, 8 and 9
   * (`loop/research-batch-nineteen-audit.md` finding 3). So this asks `lineOf`'s own question of every list she holds at
   * a level of its own. A list raised to `write` still reads. Who holds a rowid is `holdsRowids`, which asks this and more.
   */
  const readsEveryList = (ctx: CallContext): boolean =>
    wholeRecord(ctx) && Object.keys(ctx.levels ?? {}).every((list) => readable(ctx, list) === null);

  /**
   * Whether the gap between two of this caller's lines counts nothing they may not read, which is who may hold a rowid.
   *
   * AN OWNER, AND NOBODY ELSE. This was `readsEveryList`, and reading every list is not reading every line: `lineOf`
   * keeps every `grant`, `access.*`, `share.*`, `member`, `person` and `vault_key` line for an owner. A colleague at
   * `read` with no list held apart read two lines at rowids 3 and 7 with the owner's three `access.grant` lines between
   * them, so the gap was a count of the people he had invited (`loop/research-batch-twenty-one-audit.md` finding 4).
   * Everybody else is on the `e.` and `s.` cursors a member invited to one list already pages with. A question's number
   * stays with `readsEveryList`, because `holds` shows her every question and the gap between two numbers counts none.
   *
   * AND AN OWNER WHO READS EVERY LIST, NOT EVERY OWNER. `members.ts` lets one owner hold another to a level on one list,
   * and an owner held to `append` on Diary read his two Obligations lines at rowids 7 and 9 over the Diary write at 8
   * that `lineOf` hid from him (`reader-rowid-gap.test.ts` (3)). `readsEveryList` alone had already kept that from him,
   * so asking only `owner` handed back a gap this function was written to close.
   */
  const holdsRowids = (ctx: CallContext): boolean => allows(ctx, 'owner') === null && readsEveryList(ctx);

  /**
   * A question's or a decision's name as this caller is handed it: `SG6` to whoever reads every list, and `q.<id>` to
   * anybody else, whose gap between two numbers would count the questions about lists they were not shown
   * (`question-handles.ts`). `null` when there is no event to hand, which holds the row back.
   *
   * `readsEveryList`, NOT `wholeRecord`, for the reason the rowid gave: a member at `read` with Diary held to `append`
   * has no ceiling, `holds` hides every Diary question from her, and handed numbers she read `SG1 SG6 SG7` and `D1 D4`
   * over four hidden questions and two hidden decisions, exactly as a member invited to Obligations alone did.
   */
  const nameOf = (ctx: CallContext, register: 'suggestion' | 'decision', spoken: string): string | null =>
    readsEveryList(ctx) ? spoken : handleOf(sql, register, spoken);

  /** A question or decision a caller named, as the kernel keys it: a handle is turned back into its number, anything else goes as it came. */
  const spokenIn = (given: string): string => (isHandle(given) ? (spokenOf(sql, given) ?? given) : given);

  /**
   * What `propose` answers, with the question's name as `nameOf` hands it. THE WORST OF THE TWO LEAKS, because it needs
   * nothing to subtract from: an `append` member who reads no governance at all was told `SG7` by her own proposal,
   * which is every question filed before hers on every list. The kernel writes the `suggest` event in the transaction
   * that allocates the number, so a handle is always found; were it not, she is answered an empty id rather than the
   * number.
   */
  const filedAs = (ctx: CallContext, out: Result<{ id: string }>): Result<{ id: string }> =>
    out.ok && !readsEveryList(ctx) ? ok({ ...out.value, id: nameOf(ctx, 'suggestion', out.value.id) ?? '' }) : out;

  /**
   * Why `decide` refuses a person invited to named lists, said as the rule it is.
   *
   * `allows`'S SENTENCE IS FOR A CALL ABOUT THE RECORD ITSELF, AND A QUESTION IS OFTEN ABOUT HER LIST. A member invited to
   * Tasks at `decide`, answering the owner's question about Tasks, was told "This belongs to the whole record ... Open
   * it", and she was reading it from the list she had open (`loop/research-appender-landing.md` finding 7). What is true
   * is that answering any question is for somebody invited to the whole record, whatever the question is about; whether
   * a list's `decide` should answer that list's questions is the owner's D5 and is not decided here. The sentence is said
   * before the id is read, so a question about a list she cannot see and an id that names nothing get the same words.
   */
  const decidesNot = (ctx: CallContext, stop: Refusal): Refusal => {
    const p = ctx.principal;
    const held = p.kind === 'person' && p.level === null && Array.isArray(ctx.registers) && ctx.registers.length > 0 ? ctx.registers : null;
    if (held === null || stop.code !== 'FORBIDDEN') return stop;
    const named = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(held.map(listName));
    return {
      ...stop,
      fix: `Deciding a question is for somebody invited to the whole record, and you were invited to ${named}, and to nothing else. Ask the owner to answer it, or to invite you to the whole record.`,
    };
  };

  /**
   * What `decide` answers, as `filedAs` answers `propose`. A member at `decide` with Diary held to `append` does not read
   * every list, and her `decide` on the third invoice answered `{ decision: 'D5', suggestion: 'SG7' }`: the three Diary
   * decisions by subtraction from the two she is shown. The kernel's refusal names the question by its number too
   * ("SG7 is resolved"), so that sentence has the number put back as the handle she would be given for it. `spoken` is
   * the number the kernel was asked about, and only that word is rewritten, NOT EVERY NUMBER IN THE SENTENCE.
   */
  const settledAs = <T extends { decision: string | null; suggestion: string }>(ctx: CallContext, spoken: string, out: Result<T>): Result<T> => {
    if (readsEveryList(ctx)) return out;
    if (out.ok)
      return ok({
        ...out.value,
        suggestion: nameOf(ctx, 'suggestion', out.value.suggestion) ?? '',
        decision: out.value.decision === null ? null : (nameOf(ctx, 'decision', out.value.decision) ?? ''),
      });
    const handle = /^SG[1-9][0-9]*$/u.test(spoken) ? nameOf(ctx, 'suggestion', spoken) : null;
    if (handle === null || !('refusal' in out)) return out;
    return { ...out, refusal: { ...out.refusal, fix: out.refusal.fix.replace(new RegExp(`\\b${spoken}\\b`, 'gu'), handle) } };
  };

  /**
   * A governance row as it leaves the record, its own name and the names it carries of the other kind rewritten by
   * `nameOf`. One helper at each exit, NOT A PATTERN OVER THE ANSWER, which would also rewrite an owner's reason that
   * happens to say "D4". A row whose own event cannot be found, or a decision whose question's cannot, is held back from
   * a caller who would be handed a handle, as `holds` holds back a decision whose question cannot be found: none is
   * made in this tree, but an import could make one.
   */
  const handed = <T>(ctx: CallContext, register: string, row: T): T | null => {
    if (row === null || typeof row !== 'object' || readsEveryList(ctx) || (register !== 'suggestion' && register !== 'decision')) return row;
    const r = row as Record<string, unknown>;
    const own = nameOf(ctx, register, String(r.id));
    if (own === null) return null;
    const other = register === 'suggestion' ? 'decision' : 'suggestion';
    const link = typeof r[other] === 'string' ? nameOf(ctx, other, r[other]) : null;
    if (register === 'decision' && typeof r.suggestion === 'string' && link === null) return null;
    const supersedes = typeof r.supersedes === 'string' ? nameOf(ctx, 'decision', r.supersedes) : null;
    return { ...r, id: own, [other]: link, ...('supersedes' in r ? { supersedes } : {}) } as T;
  };

  /**
   * A line as it leaves the record. THE ROWID STAYS BEHIND FOR A CALLER WHO IS NOT AN OWNER (`holdsRowids`), and only at
   * the edge: the walk, `newsFor` and `markRead` all need it, so `lineOf` keeps it and every answer that hands lines out
   * asks this.
   */
  const shown = (ctx: CallContext, line: Walked): EventLine => {
    if (holdsRowids(ctx)) return line;
    const { rowid: _rowid, ...rest } = line;
    return rest;
  };

  /** Where a line sits, said to this caller: its rowid to an owner, and its id to anybody else. */
  const pointAt = (ctx: CallContext, line: Walked): Cursor => (holdsRowids(ctx) ? line.rowid : cursors.mint(line.id));

  /**
   * The rowid a cursor from this caller names, or the one refusal for everything that is not a cursor they were given.
   *
   * AN OWNER SENDS A WHOLE NUMBER, as before, or its digits as text, because the host now hands a GET's `cursor` through
   * as the text it was sent rather than coercing it (a scoped caller's `e.01M...` is not a number).
   *
   * ANYBODY ELSE SENDS WHAT THEY WERE HANDED: `e.<id>` of a line `lineOf` shows them, or an `s.` this instance sealed. A
   * whole number, an id nobody minted, an id of an event they were not shown and a seal that does not open are all the
   * same sentence, because a refusal that differed would say which of them it was, and "that event exists but is not
   * yours" is the fact the cursor exists to withhold (door 7 of `loop/research-scoped-audit.md`).
   */
  const cursorOf = async (ctx: CallContext, given: unknown, at: 'cursor' | 'upTo'): Promise<number | Refusal> => {
    if (holdsRowids(ctx)) {
      const whole = typeof given === 'string' && /^[1-9]\d{0,15}$/u.test(given) ? Number(given) : given;
      if (typeof whole === 'number' && Number.isSafeInteger(whole) && whole >= 1) return whole;
      return {
        code: 'VALUE_MALFORMED',
        fix: at === 'cursor' ? 'A cursor is the number of an event, a whole number from 1.' : 'upTo is the number of an event, a whole number from 1.',
        at,
      };
    }
    const refused: Refusal = {
      code: 'VALUE_MALFORMED',
      fix:
        at === 'cursor'
          ? 'A cursor is one this BrainDog answered with, on a page it showed you. Start again from the newest page.'
          : 'upTo is one this BrainDog answered with, for a line it showed you. Mark from the newest line instead.',
      at,
    };
    const opened = typeof given === 'string' ? await cursors.open(given) : null;
    if (opened === null) return refused;
    if ('rowid' in opened) return opened.rowid;
    const found = sql.one<{ rowid: number }>('SELECT rowid FROM event WHERE id = ?', opened.id);
    if (!found) return refused;
    const rowid = Number(found.rowid);
    const line = kernel.eventsBefore(rowid + 1, 1)[0];
    return line && line.rowid === rowid && lineOf(ctx, line) !== null ? rowid : refused;
  };

  /**
   * The number `version()` answers this caller: `MAX(event.rowid)` to whoever holds rowids, and to anybody else a number
   * drawn from the id of the newest line `lineOf` shows them, or 0 when it shows them none.
   *
   * `MAX(event.rowid)` WENT TO EVERY READER, AFTER `99caef53` TOOK THE ROWID OUT OF THEIR HISTORY. A colleague at `read`
   * polled 4 and then 9 across three invitations she is shown none of and two Diary rows, and a member at `read` with
   * Diary held to `append` polled 9 and then 14 across the same (`loop/research-batch-twenty-four-audit.md` finding 2):
   * the gap was the count `holdsRowids` exists to withhold. So the number is keyed to what she can see. It moves when a
   * line she reads is written and stands still while only lines she cannot read are, and it is a hash of an id she is
   * already handed as an `e.` cursor, so it tells her nothing she could not read off her own history.
   *
   * IT IS NOT ORDERED FOR HER, AND NOTHING READS IT AS ORDERED. Nothing in `apps/web` compares the number: `+layout.ts`
   * and `start` read `spark` off this call and nothing else, and `recentHistory` refuses a whole number as a cursor from
   * anybody `holdsRowids` refuses, so "a range scan from here" was never hers to make. A poller asks whether it changed.
   *
   * THE WALK IS NOT CAPPED AT `WALK`, because a cap that gave up would answer 0 once her newest line sank past it, and the
   * number would change with nothing she can see changing. It stops at her newest line, which is usually near the top.
   */
  const versionFor = (ctx: CallContext): number => {
    if (holdsRowids(ctx)) return kernel.version();
    let before: number | null = null;
    for (;;) {
      const { lines, next } = walk(ctx, before, 0, 1);
      if (lines[0]) return idNumber(lines[0].id);
      if (next === null) return 0;
      before = next;
    }
  };

  /** What changed since `cursor`, or since the caller's read mark. A token reads its person's mark. */
  const newsFor = (ctx: CallContext, cursor?: number): WhatsNew => {
    const { lines, next } = walk(ctx, null, cursor ?? kernel.unreadFrom(readerOf(ctx)), NEWS + 1, true);
    const events = lines.slice(0, NEWS);
    return { events: events.map((line) => shown(ctx, line)), upTo: events[0] ? pointAt(ctx, events[0]) : null, sinceCapped: next !== null };
  };

  /**
   * What the shell draws around every screen, held to the caller as `boot`'s registers are: the record's name, who is
   * asking, the pages they may open, and the two counts on the rail.
   */
  /**
   * WHO DID WHAT, BY NAME, FOR A CALLER WHO MAY ALREADY KNOW WHO IS HERE. A member other than the owner read every colleague
   * as "Someone on this record", because the one read with names in it, `members`, is ADMIN: it carries every address.
   * The owner reads the membership list, and a member who may read People reads the people the record knows, so each of
   * them is told the names and nothing else. Anybody else still reads Someone (`20 §1`, the ceiling; `members`, the addresses).
   *
   * PEOPLE IS THE FIRST-PARTY MODULE, NOT A LIST WITH THAT ID. A shared use case on a record without the module could
   * declare its own `people` and invite somebody to it, so the list must be owned by the `people` pack and that pack on.
   */
  const namesFor = (ctx: CallContext): Record<string, string> | null => {
    const peopleModule = () =>
      kernel.register(PEOPLE) !== undefined && kernel.packStates().some((p) => p.id === PEOPLE && p.disabled_at === null && p.registers.includes(PEOPLE));
    const mayKnow = allows(ctx, 'owner') === null || (readable(ctx, PEOPLE) === null && peopleModule());
    if (!mayKnow) return null;
    return Object.fromEntries(kernel.members().flatMap((m) => (typeof m.name === 'string' && m.name.trim() !== '' ? [[m.person_id, m.name.trim()]] : [])));
  };

  const shellFor = (ctx: CallContext): Pick<Boot, 'record' | 'me' | 'pages' | 'counts' | 'whatsNew' | 'names'> => {
    const p = ctx.principal;
    const person = p.kind === 'person' ? p.id : p.kind === 'token' ? p.person : null;
    const identity = kernel.identity();
    /* EVERY OPEN QUESTION, NOT A PAGE OF THEM: a count read off two hundred rows said 200 to a queue of 206. */
    const open = kernel.openSuggestions();
    return {
      record: identity ? { slug: identity.slug, name: identity.name, locale: identity.locale } : null,
      me: {
        kind: p.kind,
        person,
        name: person === null ? null : (kernel.members().find((m) => m.person_id === person)?.name ?? null),
        level: p.kind === 'system' ? null : p.level,
        ...(p.kind === 'person' ? { prefs: kernel.prefsOf(p.id) as Prefs } : {}),
      },
      /* THE SAME FILTER `pages` RUNS, and the register list stays behind for the same reason. */
      pages: kernel
        .pages()
        .filter((page) => seesPage(ctx, page))
        /* THE ONE LIST A PAGE DRAWS, when it draws one this caller reads, so a saved view sits under its list in the rail.
           A name the kernel gives a read across the whole record is not a list (`*`, a character no register id holds). */
        .map((page) => ({
          slug: page.slug,
          title: page.title,
          nav: page.nav,
          icon: page.icon,
          list: page.registers.length === 1 && /^[a-z]/u.test(page.registers[0]!) && !readable(ctx, page.registers[0]!) ? page.registers[0]! : null,
        })),
      counts: {
        decide: open.ok ? open.value.filter((row) => !holds(ctx, row)).length : 0,
        inbox: allows(ctx, 'owner') === null ? kernel.inboxWaiting() : null,
        /* EVERY DECISION THIS CALLER MAY READ, for a screen that reads them a page at a time. Somebody who reads the whole
           record is held back from none, so theirs is the table's count. A member invited to named lists is held back from
           the decisions `holds` holds, and the table's count told them 2 where the list showed them 1: a number the
           Decisions screen draws, and a count of what was decided about lists they were never shown. */
        /* `readsEveryList` AND NOT `wholeRecord`: a member at `read` with Diary held to `append` was told `decided: 4`
           beside the two decisions her list showed her, which is the count of the Diary ones by subtraction. */
        decided: readsEveryList(ctx)
          ? kernel.governanceCount('decision')
          : ((all) => (all.ok ? all.value.filter((row) => !holds(ctx, row)).length : 0))(kernel.governance('decision', { every: true })),
      },
      whatsNew: newsFor(ctx),
      ...((names) => (names === null ? {} : { names }))(namesFor(ctx)),
    };
  };

  /**
   * One row as `context` shows it. A key's row carries its title and `mobile` fields, and for its secret
   * field only what is known about the grant: whether a value is sealed, and who opened it last.
   */
  const brief = (decl: RegisterDecl, scopeField: string, row: Entry, scope: Brief['scope']): Brief => {
    const shown = new Set([decl.title, ...((decl as { mobile?: readonly string[] }).mobile ?? [])]);
    const out: Brief = { spoken: kernel.nameOf(row.id), version: row.version, scope, state: row.state };
    for (const f of decl.fields) {
      if (f.retired || f.id === scopeField || f.id === decl.state || BRIEF_KEYS.includes(f.id)) continue;
      const value = row.fields[f.id];
      if (f.type === 'secret') {
        out[f.id] = typeof value === 'string' ? kernel.keyState(value) : { sealed: false, opened: 0, last_opened: null, last_by: null };
        continue;
      }
      if (!shown.has(f.id) || value === undefined) continue;
      out[f.id] =
        f.type === 'ref' && typeof value === 'string'
          ? kernel.nameOf(value)
          : f.type === 'list' && f.of === 'ref' && Array.isArray(value)
            ? value.map((id) => kernel.nameOf(String(id)))
            : value;
    }
    return out;
  };

  const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

  /**
   * Where the caller stands, in one read of each thing (`loop/research-agent-path.md` §6.3). It never
   * writes and never opens a run, and every part is held to what the caller may read.
   *
   * THE PLACE IS RESOLVED AS `attach` RESOLVES IT: from the hints the caller sent, or, when it sent none,
   * from where its run was. A caller who may not read the projects register stands nowhere in
   * particular: naming the project would name a row of a register it cannot see.
   */
  const briefing = (ctx: CallContext): Context => {
    const hints = ctx.session ?? {};
    const token = ctx.principal.kind === 'token';
    const run = ctx.principal.kind === 'token' ? kernel.findRun(hints, ctx.principal.id) : null;
    const place = hints.remote || hints.repo || hints.cwd ? hints : run ? { remote: text(run.fields.remote) ?? undefined, repo: text(run.fields.repo) ?? undefined, cwd: text(run.fields.cwd) ?? undefined } : {};
    const repo = hints.repo ?? text(run?.fields.repo) ?? undefined;

    const holder = [...kernel.registers().values()].find((d) => d.scopes !== undefined);
    const resolved = holder && !readable(ctx, holder.id) ? kernel.resolveProject(place) : { project: null, ambiguous: [] };
    const home = resolved.project ? kernel.get(resolved.project.id) : null;
    const identity = (holder as { identity?: { mark?: string; accent?: string } } | undefined)?.identity;
    const mark = identity?.mark === undefined ? undefined : home?.fields[identity.mark];
    const hue = identity?.accent === undefined ? undefined : home?.fields[identity.accent];
    const project: Context['project'] =
      resolved.project && home && holder
        ? {
            spoken: resolved.project.spoken,
            name: text(home.fields[holder.title]) ?? resolved.project.spoken,
            mark: typeof mark === 'string' ? mark : null,
            hue: typeof hue === 'number' ? hue : null,
            how: resolved.project.how,
          }
        : null;

    /* THE RUNS, when the caller may read them: the newest other one here that left a next step, and
       the others live now. Here is the project, or with no project the repository. */
    const runs = !readable(ctx, SESSION);
    const here = project ? { field: 'project', is: project.spoken } : repo ? { field: 'repo', is: repo } : null;
    const left =
      runs && here
        ? kernel.list({
            register: SESSION,
            where: { all: [here, { field: 'next', present: true }] } as Predicate,
            order: [{ field: 'last_seen', dir: 'desc' }],
            limit: 2,
          })
        : null;
    const other = left?.ok ? left.value.rows.find((row) => row.id !== run?.id) : undefined;
    const handoff: Context['handoff'] = other
      ? { from: `${PREFIX}${String(other.seq)}`, age_s: ageOf(other), next: String(other.fields.next), tried: listOf(other.fields.tried), head: text(other.fields.head) }
      : null;
    const others = runs ? live({ ...ctx, session: { ...hints, ...(repo === undefined ? {} : { repo }) } }).filter((r) => r.id !== run?.id) : [];
    const liveBrief = (r: LiveRun): LiveBrief => ({
      spoken: r.spoken,
      state: r.state,
      doing: text(r.fields.doing),
      agent: text(r.fields.agent),
      repo: text(r.fields.repo),
      project: text(r.fields.project),
      stale: r.stale,
      age_s: r.age_s,
    });

    /* THE REGISTERS THAT SAY WHERE A ROW APPLIES, each held to the caller's level. A register whose
       scope links a row to projects, as people are linked, is who is here rather than what applies. */
    const cutoff = new Date(clock.now() - FADE_MS).toISOString().slice(0, 10);
    const registers: Context['registers'] = [];
    let people: Brief[] = [];
    let faded = 0;
    let fading = false;
    for (const [id, decl] of kernel.registers()) {
      const f = decl.fields.find((field) => field.scope !== undefined && !field.retired);
      if (!f || readable(ctx, id)) continue;
      if (f.scope?.links === true) {
        const met = home ? kernel.inScope(id, home.id, { limit: MET }) : null;
        if (met?.ok) people = [...people, ...met.value.rows.map((row) => brief(decl, f.id, row, 'project'))].slice(0, MET);
        continue;
      }
      const fades = decl.fields.some((field) => field.id === FADES && field.type === 'day' && !field.retired);
      const got = kernel.inScope(id, home?.id ?? null, { limit: fades ? 200 : SHOWN + 1, open: true });
      if (!got.ok) continue;
      const fresh = (rows: Entry[]): Entry[] => {
        if (!fades) return rows;
        const kept = rows.filter((row) => String(row.fields[FADES] ?? row.created_at.slice(0, 10)) >= cutoff);
        faded += rows.length - kept.length;
        return kept;
      };
      const rows = fresh(got.value.rows);
      const inherited = fresh(got.value.inherited);
      if (fades && rows.length + inherited.length > 0) fading = true;
      registers.push({
        id,
        name: decl.name,
        rows: rows.slice(0, SHOWN).map((row) => brief(decl, f.id, row, 'project')),
        inherited: inherited.slice(0, SHOWN).map((row) => brief(decl, f.id, row, 'global')),
        truncated: rows.length > SHOWN || inherited.length > SHOWN || (fades && Math.max(got.value.rows.length, got.value.inherited.length) >= 200),
      });
    }

    const next =
      token && !run
        ? 'Your first write opens a session; before you stop, call handoff with the one next step.'
        : handoff
          ? `Start from the handoff ${handoff.from} left, and call handoff with your own next step before you stop.`
          : fading
            ? 'When a learning shown here held, set its confirmed_on to today with update, and call handoff before you stop.'
            : 'Work from what is open here, and call handoff with the one next step before you stop.';

    return {
      session: run ? { spoken: `${PREFIX}${String(run.seq)}`, state: run.state } : null,
      project,
      ambiguous: project || !holder || readable(ctx, holder.id) ? [] : resolved.ambiguous,
      handoff,
      live: { same_repo: others.filter((r) => r.same_repo).map(liveBrief), elsewhere: others.filter((r) => !r.same_repo).map(liveBrief) },
      waiting: waitingFor(ctx).slice(0, ASKED).map(({ id, question }) => ({ id, question })),
      registers,
      people,
      faded,
      next,
    };
  };

  /** An argument that is a line of text, `undefined` when it was not sent, or the refusal saying why not. */
  const line = (args: Record<string, unknown>, key: string): Result<string | undefined> => {
    const value = args[key];
    if (value === undefined || value === null) return ok(undefined);
    if (typeof value !== 'string' || !value.trim())
      return no('VALUE_MALFORMED', `${key} is a line of text, and this one is ${JSON.stringify(value) ?? String(value)}.`, { at: key });
    const said = value.trim();
    if (said.length > LINE) return no('OUT_OF_BOUNDS', `${key} is at most ${LINE} characters, and this one is ${said.length}.`, { at: key });
    return ok(said);
  };

  /** A key this call does not take, named with the ones it does, so a value is never dropped unsaid. */
  /**
   * A REGISTER NAMED AT ALL, and a row number that is one, before anything is looked up.
   *
   * Without it a call with no register was told "There is no register called undefined", and an
   * update with no `seq` "There is no row contacts#undefined", both of which name a value nobody sent.
   */
  const named = (args: unknown, seq = false): Refusal | null => {
    const a = (args ?? {}) as Record<string, unknown>;
    if (typeof a.register !== 'string' || !a.register)
      return { code: 'REQUIRED_MISSING', fix: 'Name the register, such as register: "tasks".', at: 'register' };
    if (seq && (a.seq === undefined || a.seq === null || a.seq === ''))
      return { code: 'REQUIRED_MISSING', fix: `Name the row in ${a.register} by its number, such as seq: 3.`, at: 'seq' };
    if (seq && !(Number.isInteger(Number(a.seq)) && Number(a.seq) >= 1))
      return { code: 'VALUE_MALFORMED', fix: `A row number is a whole number from 1, and ${JSON.stringify(a.seq)} is not one.`, at: 'seq' };
    return null;
  };

  const stray = (args: Record<string, unknown>, takes: readonly string[]): Refusal | null => {
    const key = Object.keys(args).find((k) => !takes.includes(k));
    return key === undefined
      ? null
      : { code: 'FIELD_UNKNOWN', fix: `${key} is not something this call takes. It takes ${takes.join(', ')}.`, at: key, allowed: [...takes] };
  };

  /**
   * A refusal that comes down to a pack being off, said as that and naming the pack.
   *
   * THE KERNEL ANSWERS FROM THE DECLARATIONS' SIDE. A write to a register that went off is
   * `REGISTER_UNKNOWN`, and enabling a pack before one it leans on is a field pointing at nothing. Both
   * are true and neither says what to do; `PACK_DISABLED` with the pack in `allowed` does. Only a
   * register a disabled pack went off with counts, so every other refusal passes through as it was.
   */
  const offPack = <T>(out: Result<T>, names: (register: string) => boolean, besides?: string): Result<T> => {
    if (out.ok || !('refusal' in out)) return out;
    for (const p of kernel.packStates()) {
      if (p.disabled_at === null || p.id === besides) continue;
      const register = p.registers.find(names);
      if (register !== undefined)
        return no<T>('PACK_DISABLED', `${register} belongs to ${p.id}, which is turned off. Enable ${p.id} first.`, {
          at: 'pack',
          allowed: [p.id],
        });
    }
    return out;
  };

  /** A write's refusal, when the register it named went off with its pack. */
  const offRegister = <T>(register: string, out: Result<T>): Result<T> =>
    !out.ok && 'refusal' in out && out.refusal.code === 'REGISTER_UNKNOWN' ? offPack(out, (r) => r === register) : out;

  const listOf = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  const projectOf = (run: Entry): string | null => (typeof run.fields.project === 'string' ? run.fields.project : null);

  return {
    /**
     * What this record is: its registers, and how many rows each holds.
     *
     * The first call any client makes, and it is scoped: a caller sees the registers they may READ
     * and not the ones they may not, because a list of names is itself information.
     */
    async boot(ctx: CallContext): Promise<Result<Boot>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* ONE TRANSACTION, SO ONE MOMENT. A second connection to the same file, a CLI beside a running
         self-host, could commit between the counts and the feed, and the rail said one row beside a
         feed announcing two. SQLite holds a read transaction to the snapshot of its first read. */
      return kernel.transaction(() => {
        const out: { id: string; name: string; count: number }[] = [];
        for (const [id, decl] of kernel.registers()) {
          /* THE FILTER WAS THE CEILING'S, WHICH IS THE WRONG ONE. A register somebody holds `append`
             on is inside their ceiling by construction, so its name and its row count went out to the
             one level whose whole point is that it does not read. */
          if (readable(ctx, id)) continue;
          out.push({ id, name: decl.name, count: kernel.count(id) });
        }
        return ok({
          registers: out,
          now: new Date(clock.now()).toISOString(),
          /* THE FIRST SCREEN IN ONE ROUND TRIP (`32 §3`): who is working, and what waits on a person, each
             held to what the caller may read, as the registers above are. */
          sessions: readable(ctx, SESSION) ? [] : live(ctx),
          waiting: waitingFor(ctx),
          ...shellFor(ctx),
          signIn: invitations !== undefined && invitations() === null,
        });
      });
    },

    /** What a register holds, so a caller can write a correct row on the first try. */
    async schema(args: { register: string }, ctx: CallContext): Promise<Result<RegisterDecl>> {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      const decl = kernel.register(args.register);
      return decl
        ? ok(decl)
        : no('REGISTER_UNKNOWN', `There is no register called ${args.register}.`, {
            allowed: [...kernel.registers().keys()],
          });
    },

    /**
     * One row: by register and number, or as a person says it, `S1` or `tasks#3`.
     *
     * A SPOKEN ID NEEDS NO REGISTER, because the kernel resolves it against the installed prefixes. A row
     * the caller may not read answers as a row that is not there: a refusal naming its register would
     * say which registers exist, one guess at a time.
     *
     * A PREFIX NO REGISTER THE CALLER READS HOLDS is `REGISTER_UNKNOWN`, whether no register has it or
     * the caller cannot read the one that does, so the two cannot be told apart. `SG` and `D` are
     * governance's, which the sentence says, because they are the ones an agent reaches for.
     */
    async get(args: { register?: string; seq?: number; spoken?: string }, ctx: CallContext): Promise<Result<Entry | null>> {
      /* NOTHING ASKED IS NOT A ROW THAT IS NOT THERE. `get({})` answered 200 null, and `get()` threw. */
      if (args?.spoken === undefined && args?.register === undefined && args?.seq === undefined)
        return no('REQUIRED_MISSING', 'Name the row, spoken as S1 or tasks#3, or as a register and a seq.', { at: 'spoken' });
      if (typeof args?.spoken === 'string') {
        const stop = scoped(ctx, 'read');
        if (stop) return { ok: false, refusal: stop };
        const said = args.spoken.trim();
        if (PREFIXED.test(said)) {
          const owner = [...kernel.registers().values()].find(
            (d) => d.seq_prefix && d.seq_prefix !== '#' && said.startsWith(d.seq_prefix) && /^[1-9][0-9]*$/.test(said.slice(d.seq_prefix.length)),
          );
          if (!owner || readable(ctx, owner.id))
            return no(
              'REGISTER_UNKNOWN',
              `No register you can read numbers its rows ${/^[A-Z]+/.exec(said)?.[0] ?? said}. A suggestion (SG) or a decision (D) is read with governance.`,
              { at: 'spoken' },
            );
          return ok(kernel.get(said));
        }
        const row = kernel.get(said);
        return ok(row && !readable(ctx, row.register) ? row : null);
      }
      const missing = named(args, true);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      return ok(kernel.get({ register: args.register as string, seq: args.seq as number }));
    },

    async list(
      args: {
        register: string;
        where?: Predicate;
        limit?: number;
        cursor?: string | null;
        /* THE ORDER REACHES THE KERNEL, and it did not. `kernel.list` grew one; this signature did
           not name it, so the one line below that forwards `args` carried it at runtime and no
           caller could write it without the type complaining. A parameter reachable only by lying
           to the type checker is a parameter nobody uses. */
        order?: { field: string; dir?: 'asc' | 'desc' }[];
      },
      ctx: CallContext,
    ): Promise<Result<Page<Entry>>> {
      const missing = named(args);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      /* A LIMIT BELOW ONE IS REFUSED, NOT READ AS FIFTY OR AS ONE. The kernel coerces what a query
         string cannot parse, and `limit: 0` came back as fifty rows while `limit: -3` came back as
         one. A number that parses and is out of range is a question with an answer, which is
         `02 §5`'s bounds. Above 500 is still capped, which is what the ceiling says. */
      if (args.limit !== undefined && args.limit !== null && Number.isFinite(Number(args.limit)) && Number(args.limit) < 1)
        return no('OUT_OF_BOUNDS', `A list shows from 1 to 500 rows at a time, and ${args.limit} is below 1.`, { at: 'limit' });

      /* A FILTER ON A FIELD WITH NO INDEX IS A SCAN, AND THE RECORD COUNTS IT. `query.scan` is one
         of the four detectors the observe loop ships with — the one with the most carefully derived
         threshold, two hundred in thirty days, from the point where an index stops being a liability
         and starts paying for itself — and nothing in the product emitted the signal, so it could
         never fire. The declaration already knows which fields are indexed; this is the one place
         that knows which fields a caller actually filtered on.

         AFTER THE GUARD, so a refused read is not evidence about anything, and outside the answer,
         so counting never changes what comes back. */
      for (const field of unindexed(args.register, args.where))
        kernel.observe([{ kind: 'query.scan', subject: `${args.register}.${field}` }]);

      /* AND THAT THE REGISTER WAS READ AT ALL. `24 §4.2` lists "register never read, page never
         rendered" as a signal, and a NEVER is only answerable if the reads are counted — the
         absence of a row is the whole finding, so there is nothing to compute at analysis time and
         nothing to infer from anywhere else.

         ONE ROW PER REGISTER PER DAY. `observe` is an upsert on `(kind, subject, day)`, so a
         thousand reads of one register on one day are one row and one increment. It makes a read a
         write, which is the price of the question: a record that cannot say which of its registers
         nobody has opened in six months cannot suggest retiring one. */
      /* A REGISTER THIS RECORD DECLARES, and it was whatever the caller sent. `guard` admits a
         reader with a record-level `read` for any name, so `GET /api/list?register=<anything>`
         inserted an observation row keyed by the caller's own string and kept it for four hundred
         days. The signal is "which of MY registers has nobody opened", and a name that is not one
         of them is not an answer to it. */
      if (kernel.register(args.register)) kernel.observe([{ kind: 'register.read', subject: args.register }]);

      /* A REF INTO A LIST THE CALLER CANNOT READ NAMES NO ROW, WHETHER OR NOT THE ROW EXISTS. The kernel
         resolves refs and only this layer knows who is asking, so without `reads` a member invited to
         Jobs alone read `ok 0` for a hidden client that exists and `REF_UNKNOWN` for one that does not
         (audit twenty-two, finding 1). */
      return kernel.list({ ...args, reads: (register) => readable(ctx, register) === null });
    },

    /**
     * `append` and not `write`, and the difference is the point.
     *
     * A colleague invited to add rows can add rows. Editing what is already there is a different
     * permission, because the risk is different: a wrong new row is visible and a wrong edit to an
     * old one is not.
     */
    async create(args: { register: string; fields: Patch; note?: string; op_id?: string }, ctx: CallContext): Promise<Result<Entry>> {
      const missing = named(args);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'append', args.register);
      if (stop) return { ok: false, refusal: stop };
      /* `deleted_at` IS THE RECORD'S, and a row does not arrive deleted. No register declares it, and
         dropping it quietly would be a write that did less than it was asked. `delete` is how a row goes. */
      if (args.fields && typeof args.fields === 'object' && Object.hasOwn(args.fields, 'deleted_at'))
        return no('FIELD_UNKNOWN', 'deleted_at is kept by the record, and a new row cannot arrive deleted. Create it, then delete it.', { at: 'deleted_at' });
      return tail(
        offRegister(
          args.register,
          kernel.create(args.register, args.fields, {
            ...writerOf(ctx),
            ...(args.note === undefined ? {} : { note: args.note }),
            ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
            /* A RETRY IS ONE ROW. An agent whose answer was lost sends the same request again, and
               without its own id the record has no way to know the second is the first. */
            ...(args.op_id === undefined ? {} : { opId: args.op_id }),
          }),
        ),
      );
    },

    /**
     * Rows a project sends with its report key: one row's fields, or `{ rows: [...] }` up to a hundred.
     *
     * A REPORT KEY'S ONLY METHOD, and nothing else reaches it. Each row goes into the register the key is bound
     * to, with the key's fixed fields over whatever was sent and its stamp filled when nothing was, through the
     * same write path `create` takes, so a register's rules run on a reported row as on any other.
     *
     * ALL OR NOTHING. The rows are written in one transaction, and the first one refused undoes the rest, with
     * `at` naming which row and which field. A project that retries a batch never leaves half of it behind.
     *
     * SIGNED BY THE KEY, NOT BY A RUN. A project posting a number has no session to be part of, so its writes
     * carry `report:<token id>` as the ingest paths carry `ingest:<id>`, and no run is opened for each post.
     */
    async report(args: unknown, ctx: CallContext) {
      const stop = guard(ctx, 'append', BOUND);
      if (stop) return { ok: false as const, refusal: stop };
      const binding = reportKeyOf(ctx)!;
      const rows = reportedRows(args);
      if (rows === null || rows.length === 0)
        return no('VALUE_MALFORMED', 'report takes one row as its fields, or { rows: [ ... ] } with each row an object.', { at: 'rows' });
      if (rows.length > REPORT_ROWS_MOST)
        return no('OUT_OF_BOUNDS', `One report carries at most ${REPORT_ROWS_MOST} rows, and this one has ${rows.length}. Send them in batches.`, { at: 'rows' });
      const weight = new TextEncoder().encode(JSON.stringify(rows)).length;
      if (weight > REPORT_BYTES_MOST)
        return no('OUT_OF_BOUNDS', `One report is at most ${REPORT_BYTES_MOST / 1024} KB, and this one is ${Math.ceil(weight / 1024)} KB. Send shorter rows, or fewer at a time.`, { at: 'rows' });
      const wait = reportBudget(ctx.principal.kind === 'token' ? ctx.principal.id : 'key', rows.length);
      if (wait !== null)
        return {
          ok: false as const,
          refusal: {
            code: 'RATE_LIMITED',
            fix: `This key has sent its ${REPORT_ROWS_PER_MINUTE} rows for this minute. Send these again in ${wait} second${wait === 1 ? '' : 's'}.`,
            at: 'rows',
            retry_after: wait,
          },
        };
      const decl = kernel.register(binding.register);
      if (!decl) return no('REGISTER_UNKNOWN', `This key sends rows to ${binding.register}, and this record has no such list now.`, { at: 'register' });
      const stampType = binding.stamp === undefined ? undefined : decl.fields.find((f) => f.id === binding.stamp)?.type;
      const now = new Date(clock.now()).toISOString();
      const batched = Array.isArray((args as { rows?: unknown }).rows);
      const by = {
        actor: `report:${ctx.principal.kind === 'token' ? ctx.principal.id : 'key'}`,
        ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
      };
      const halted: { refusal: Refusal | null } = { refusal: null };
      const written: { id: string; seq: number | null }[] = [];
      const where = (i: number, at: string | undefined): string => (batched ? `rows[${i}]${at ? `.${at}` : ''}` : (at ?? 'fields'));
      try {
        kernel.transaction(() => {
          for (const [i, sent] of rows.entries()) {
            if (Object.hasOwn(sent, 'deleted_at')) {
              halted.refusal = { code: 'FIELD_UNKNOWN', fix: 'deleted_at is kept by the record, and a reported row cannot arrive deleted.', at: where(i, 'deleted_at') };
              throw halted;
            }
            const out = kernel.create(binding.register, reportedFields(binding, sent, now, stampType) as Patch, by);
            if (!out.ok) {
              const r: Refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record moved while this report was written. Send it again.' };
              halted.refusal = { ...r, at: where(i, r.at) };
              throw halted;
            }
            written.push({ id: out.value.id, seq: out.value.seq });
          }
        });
      } catch (e) {
        if (e !== halted) throw e;
        return tail({ ok: false as const, refusal: halted.refusal! });
      }
      return tail(ok({ register: binding.register, written }));
    },

    async update(
      args: { register: string; seq: number; patch: Patch; version?: number; note?: string; op_id?: string },
      ctx: CallContext,
    ): Promise<Result<Entry>> {
      const missing = named(args, true);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'write', args.register);
      if (stop) return { ok: false, refusal: stop };
      return tail(
        offRegister(
          args.register,
          kernel.update(args.register, `${args.register}#${args.seq}`, args.patch, {
            ...writerOf(ctx),
            ...(args.version === undefined ? {} : { version: args.version }),
            ...(args.note === undefined ? {} : { note: args.note }),
            ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
            ...(args.op_id === undefined ? {} : { opId: args.op_id }),
          }),
        ),
      );
    },

    /* ── pages and figures ─────────────────────────────────────── */

    /** Every page a person could open, templates expanded into one page per row. */
    async pages(ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      /* SCOPED, LIKE `boot` IS. This returned every page a record declares, to anybody with `read` on
         anything — and a page's title is a sentence about what the record holds. "Payroll, monthly"
         tells a bookkeeper invited to one register that there is a payroll register, which is the
         exact inference `boot` filters its own list to prevent: a list of names is itself
         information.

         A PAGE IS VISIBLE IF ANY REGISTER IT DRAWS FROM IS. Not every one — `page()` already refuses
         the blocks a caller cannot reach and draws the rest, so a page they can see three fifths of
         is a page they can use. A page bound to no register at all is prose, and prose is for
         anybody who may read. */
      return ok(
        kernel
          .pages()
          /* A PAGE IS VISIBLE IF ANY REGISTER IT DRAWS FROM IS. `page()` already refuses the blocks a
             caller cannot reach and draws the rest, so a page they can see three fifths of is a page
             they can use. One that names none is prose, and prose is for anybody who may read. */
          /* AND VISIBLE MEANS READABLE. This asked the ceiling, so a page over the payroll register
             was listed by its title to somebody invited to file rows into it and nothing else. */
          /* AND NEVER A PAGE ABOUT A ROW THEY CANNOT READ, which `seesPage` says why. */
          .filter((p) => seesPage(ctx, p))
          /* AND THE REGISTER LIST DOES NOT TRAVEL. It is what the filter is FOR, and shipping it
             would hand back the names the filter exists to withhold. */
          .map((p) => ({ slug: p.slug, title: p.title })),
      );
    },

    /**
     * How this BrainDog is arranged, and what may be proposed about it (`loop/research-spark.md` S12).
     *
     * ONE READ FOR WHAT AN AGENT NEEDS BEFORE IT PROPOSES AN ARRANGEMENT, and compact, because it is read
     * in a turn: the packs and whether each is on, what else the host offers, the voice and other settings,
     * the pages the caller can open and the arrangements already waiting. With `page` it is that page's
     * declaration, the thing a changed layout is written from. With `grammar` it is what a page body or a
     * proposal body may contain, so the lint is no longer the only teacher.
     */
    async arrangement(args: { page?: string; grammar?: string } | undefined, ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['page', 'grammar']);
      if (extra) return { ok: false as const, refusal: extra };
      if (args?.grammar !== undefined) return grammarOf(String(args.grammar));
      if (args?.page !== undefined) {
        if (typeof args.page !== 'string' || !args.page) return no('REQUIRED_MISSING', 'A page is asked for by its slug, such as studies.', { at: 'page' });
        return arrangement.declaration(args.page, visiblePages(ctx));
      }
      return ok(await arrangement.overview(visiblePages(ctx)));
    },

    /**
     * What Spark noticed about how this BrainDog is used, and what it would propose (`spark.ts`, `loop/research-spark.md` S15).
     *
     * AN OWNER'S, IN A BROWSER, because it reads the use of every list, and a token has `arrangement` for what it may propose.
     * It writes nothing and asks no model: each draft says whether it is already a question, and which.
     */
    async spark(args: Record<string, unknown> | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'read how the whole record is used');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, []);
      if (extra) return { ok: false as const, refusal: extra };
      const r = sparkReading();
      return ok({
        model: deps.sparkModel?.name ?? null,
        quiet: r.quiet,
        noticed: r.noticed,
        drafts: r.drafts.map((d) => ({ question: d.question, body_kind: d.body_kind, asked: r.asked.get(d.key) ?? null })),
        waiting: r.waiting,
        cap: SPARK_OPEN_CAP,
        daily: sparkDailyState(),
      });
    },

    /**
     * Put Spark's proposals on Decide now (`sparkFile`): the model's, when one is configured and answers something valid,
     * else the rules'. Never one already asked, and never more than `SPARK_OPEN_CAP` waiting.
     */
    async sparkPropose(args: Record<string, unknown> | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'ask Spark to put questions on Decide');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, []);
      if (extra) return { ok: false as const, refusal: extra };
      return tail(ok(await sparkFile()));
    },

    /**
     * Whether Spark looks once a day on its own and puts what it finds on Decide. On by default; the owner's to turn off.
     *
     * AN OWNER'S, IN A BROWSER, as the press is: turning it on is asking Spark to file questions without a press each time.
     * It is not an event, for the reason a pref is not: it changes when Spark asks, and nothing in the record's history.
     */
    async sparkDaily(args: { on?: unknown } | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'choose whether Spark looks on its own');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['on']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.on !== 'boolean') return no('VALUE_MALFORMED', 'on is true to let Spark look once a day on its own, or false to wait for your press.', { at: 'on' });
      kernel.setPref(SPARK, SPARK_DAILY, args.on ? null : false);
      return ok(sparkDailyState());
    },

    /**
     * A FIRST PLAN FROM WHAT THE OWNER SAID, formed by the model and put on Decide as rows (`CatalogueEntry.forms`).
     *
     * A SEPARATE PATH FROM SPARK'S LOOK AT USE. That waits two weeks before it reads habits; this is the owner asking, at the
     * moment they say what the project is, so it runs on a record of any age. It is asked once per record. Nothing is made: the
     * plan is an arrangement the owner accepts or dismisses. With no model, a model that fails, or an answer that is not a
     * plan inside the use case's limits, nothing is filed and `formed` is false, so the caller keeps the use case's own plan.
     * The model is handed the sentence and the lists' limits, never the record.
     */
    async sparkForm(args: { usecase?: unknown; said?: unknown } | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'ask Spark to form a plan');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['usecase', 'said']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.usecase !== 'string' || args.usecase === '') return no('REQUIRED_MISSING', 'usecase is the use case the plan is for, such as guide.', { at: 'usecase' });
      if (typeof args.said !== 'string' || args.said.trim() === '' || args.said.length > FORM_SAID_MOST)
        return no('VALUE_MALFORMED', `said is what the person said the project is, a sentence of at most ${FORM_SAID_MOST} characters.`, { at: 'said' });
      const id = args.usecase.startsWith('usecase-') ? args.usecase : `usecase-${args.usecase}`;
      const spec = (deps.catalogue ?? []).find((e) => e.id === id)?.forms;
      if (!spec) return no('DECLARATION_UNKNOWN', `${args.usecase} forms no plan here.`, { at: 'usecase' });
      const not = (why: 'no-model' | 'off' | 'asked' | 'failed' | 'invalid', detail?: string) =>
        ok({ formed: false as const, why, ...(detail === undefined ? {} : { detail }) });
      const model = deps.sparkModel;
      if (!model?.form) return not('no-model');
      if (!kernel.packStates().some((p) => p.id === id && p.disabled_at === null) || spec.lists.some((l) => !kernel.register(l.register))) return not('off');
      const key = stableKey({ rows: spec.lists.map((l) => ({ register: l.register })) });
      const asked = sql.all<{ body: string }>("SELECT body FROM suggestion WHERE body_kind = 'arrange' AND opened_by = ?", SPARK).some((r) => {
        try {
          return stableKey(JSON.parse(r.body) as Record<string, unknown>) === key;
        } catch {
          return false;
        }
      });
      if (asked) return not('asked');
      const today = new Date(clock.now()).toISOString().slice(0, 10);
      let raw: unknown;
      try {
        raw = await model.form({ what: spec.what, said: args.said.trim(), today, lists: spec.lists });
      } catch {
        return not('failed');
      }
      const formed = formedRows(raw, spec, today, looksLikeCredential);
      if (!formed.ok) return not('invalid', formed.why);
      const prepared = await arrangement.prepare('arrange', { why: [spec.why], rows: formed.rows });
      if (!prepared.ok) return not('invalid', 'refusal' in prepared ? prepared.refusal.fix : undefined);
      const put = kernel.propose({ question: spec.question.slice(0, 280), body_kind: 'arrange', body: prepared.value }, SPARK);
      if (!put.ok) return not('invalid', 'refusal' in put ? put.refusal.fix : undefined);
      const counts: Record<string, number> = {};
      for (const r of formed.rows) counts[r.register] = (counts[r.register] ?? 0) + 1;
      return tail(ok({ formed: true as const, id: put.value.id, question: spec.question, by: model.name, counts }));
    },

    /**
     * SPARK'S DAILY RUN, for a host's tick and never routed: once a UTC day at most, unless the owner turned it off. The day
     * is kept before the work, so a run that throws or a model that hangs is not retried until tomorrow. Everything after is
     * the press's own path, so the cap of three and a dismissal holding are the same here.
     */
    async sparkTick(): Promise<{ ran: false; why: 'off' | 'today' | 'unopened' } | { ran: true; by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[] }> {
      if (kernel.refused()) return { ran: false, why: 'unopened' };
      const state = sparkDailyState();
      if (!state.on) return { ran: false, why: 'off' };
      const today = new Date(clock.now()).toISOString().slice(0, 10);
      if (state.last === today) return { ran: false, why: 'today' };
      kernel.setPref(SPARK, SPARK_LAST, today);
      const out = await sparkFile();
      if (out.filed.length > 0 && scheduler) await kernel.tail(scheduler);
      return { ran: true, ...out };
    },

    /**
     * This BrainDog's arrangement as a use-case file somebody else can install (`loop/research-spark.md` S14).
     *
     * A READ, like `arrangement`, and for the same callers, so the CLI can save one with its token. It carries the
     * modules, the use case's lists and pages, the pages placed by hand, the voice and the labels, and no row unless
     * `examples` names it; naming rows asks to read the whole record and each list they come from.
     */
    async exportUseCase(args: ExportArgs | undefined, ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      /* THE WHOLE ARRANGEMENT, SO SOMEBODY WHO READS THE WHOLE RECORD. A member invited to People alone was handed every
         list's fields and every page placed by hand, which `schema` and `pages` keep from them. */
      if (!wholeRecord(ctx)) return no('FORBIDDEN', 'A use case is shared by somebody who can read the whole BrainDog.', { at: 'principal' });
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = stray(said, ['usecase', 'title', 'summary', 'version', 'audience', 'author', 'examples', 'step', 'nav', 'signals', 'skills']);
      if (extra) return { ok: false as const, refusal: extra };
      if (said.step !== undefined && said.step !== 'patch' && said.step !== 'minor')
        return no('ENUM_VALUE_UNKNOWN', 'step is patch or minor.', { at: 'step', allowed: ['patch', 'minor'] });
      for (const key of ['nav', 'signals'])
        if (said[key] !== undefined && (!Array.isArray(said[key]) || !(said[key] as unknown[]).every((x) => typeof x === 'string')))
          return no('VALUE_MALFORMED', `${key} is a list of text.`, { at: key });
      if (said.skills !== undefined && (!Array.isArray(said.skills) || !(said.skills as unknown[]).every((x) => Number.isInteger(x))))
        return no('VALUE_MALFORMED', 'skills is a list of row numbers from Skills.', { at: 'skills' });
      if (Array.isArray(said.skills) && said.skills.length > 0 && !wholeRecord(ctx))
        return no('FORBIDDEN', 'Skills are shared by somebody who can read the whole BrainDog.', { at: 'skills' });
      for (const key of ['usecase', 'title', 'summary', 'version', 'audience', 'author'])
        if (said[key] !== undefined && (typeof said[key] !== 'string' || !(said[key] as string).trim()))
          return no('VALUE_MALFORMED', `${key} is a line of text.`, { at: key });
      const examples = said.examples;
      if (examples !== undefined && (typeof examples !== 'object' || examples === null || Array.isArray(examples)))
        return no('VALUE_MALFORMED', 'examples names row numbers by list, such as {"courses":[1,2]}.', { at: 'examples' });
      if (examples !== undefined && Object.keys(examples).length > 0 && !wholeRecord(ctx))
        return no('FORBIDDEN', 'Example rows are shared by somebody who can read the whole BrainDog.', { at: 'examples' });
      return sharing.exportFile(said as ExportArgs, (register) => {
        const denied = readable(ctx, register);
        if (denied) return { ok: false, refusal: denied };
        const read = kernel.list({ register, limit: 500 });
        return read.ok ? ok(read.value.rows as { seq: number | null; fields: Record<string, unknown> }[]) : read;
      });
    },

    /**
     * The text of a shared use-case file at an https address, read by the host (`RecordDeps.readAddress`). It writes
     * nothing and plans nothing: the caller reads the text through `readShared` and `planUseCase`, as it would a file.
     *
     * ADMIN, AS `planUseCase` IS, because it makes this host fetch an address somebody typed, and only the owner who is
     * about to install should be able to ask for that. A private or local address is refused as a scheduled action's is.
     */
    async fetchUseCase(args: { url: string } | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'read a use case from the web');
      if (stop) return { ok: false as const, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = stray(said, ['url']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof said.url !== 'string' || said.url.trim() === '' || said.url.length > 2048)
        return no('REQUIRED_MISSING', 'url is the https address of a .usecase.json file.', { at: 'url' });
      if (!deps.readAddress)
        return no('PULL_ORIGIN_REFUSED', 'This host does not read addresses. Download the file, then choose it as a file.', { at: 'url' });
      const read = await deps.readAddress(said.url);
      if (!read.ok) return no('PULL_ORIGIN_REFUSED', read.fix, { at: 'url' });
      return ok({ url: said.url.trim(), text: read.text, bytes: read.bytes });
    },

    /**
     * What installing a shared use case would do to this record, pack by pack. It writes nothing.
     *
     * ADMIN, AS `planPack` IS, because what it answers is the plan an install approves. The file goes through
     * `declare`'s `readShared` first, so an oversized file, a credential and a block kind nothing draws are refused
     * before anything is planned. Installing is `installPack`, one document at a time, with no door of its own.
     */
    async planUseCase(args: { doc?: unknown; text?: string; source?: PackSource; modules?: Record<string, unknown> } | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'read a plan for a use case');
      if (stop) return { ok: false as const, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = stray(said, ['doc', 'text', 'source', 'modules']);
      if (extra) return { ok: false as const, refusal: extra };
      if (said.text !== undefined && typeof said.text !== 'string') return no('VALUE_MALFORMED', 'text is the file as it was read.', { at: 'text' });
      if (said.modules !== undefined && (typeof said.modules !== 'object' || said.modules === null || Array.isArray(said.modules)))
        return no('VALUE_MALFORMED', 'modules is a pack document by module id.', { at: 'modules' });
      return sharing.planFile(said as never);
    },

    /**
     * One page, with every block run.
     *
     * A PAGE IS SCOPED LIKE ANYTHING ELSE. A block over a register the caller cannot reach comes back
     * refused rather than filled — and the page still draws, because one block's refusal is one
     * block. A caller who can see three of five registers sees three blocks and two sentences.
     */
    async page(args: { slug: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      /* THE OTHER HALF OF "never read, never rendered" (24 §4.2). One row per page per day, and the
         finding is the page that has none — a page nobody opens is a page whose blocks cost a query
         every time the schedule runs and tell nobody anything. */
      /* COERCED AT THE EDGE. These arrive from a query string a stranger wrote, and `.split` on an
         absent one threw a TypeError out of the route — a refusal is a value here, an exception is
         not, and the exception did not even reach the client: the request simply hung. */
      if (typeof args?.slug !== 'string' || !args.slug)
        return no('REQUIRED_MISSING', 'A page is asked for by its slug.', { at: 'slug' });
      /* A PAGE THIS CALLER CANNOT SEE IS A PAGE THAT DOES NOT EXIST, AND `allowed` IS WHAT THEY MAY OPEN.
         `loop/research-scoped-audit.md` §1 and §6: `pages` hid a page and `page` served it by its slug, so a member invited
         to Obligations read a diary entry's full text as the title and body of the page made for its row, and an ordinary
         page's title, prose, a `where` literal and its version off a page over the diary. One wrong slug gave the slugs,
         each a row title, since the kernel's refusal listed every page and cannot tell who is asking. So a caller who
         does not read the whole record is answered the way `pages` lists, with one refusal for both cases, and the sentence
         for a page they cannot see is the sentence for one nobody declared: the kernel's own, asked of a name no slug can
         be (`slugify` leaves no capital and no space) and given back with theirs in it. The owner's answer is the
         kernel's, unchanged: somebody who reads the whole record with no level of their own on any list reads every
         list alike, and `scoped` above already asked that of them, so the list is not built for them. */
      const everyList = wholeRecord(ctx) && Object.keys(ctx.levels ?? {}).length === 0;
      const listed = everyList ? null : kernel.pages();
      const seen = listed?.find((p) => p.slug === args.slug);
      if (listed && (!seen || !seesPage(ctx, seen))) {
        const shown = new Set(listed.filter((p) => seesPage(ctx, p)).map((p) => p.slug));
        const NOWHERE = 'NO SUCH PAGE';
        const nowhere = kernel.page(NOWHERE);
        const said: Refusal =
          !nowhere.ok && 'refusal' in nowhere ? nowhere.refusal : { code: 'PAGE_UNKNOWN', fix: `There is no page at ${NOWHERE}.`, at: 'slug' };
        return {
          ok: false as const,
          refusal: { ...said, fix: said.fix.split(NOWHERE).join(args.slug), ...(said.allowed ? { allowed: said.allowed.filter((slug) => shown.has(slug)) } : {}) },
        };
      }
      const out = kernel.page(args.slug);
      /* AND THE OBSERVATION IS AFTER THE ANSWER, not before it. It ran first, on the caller's raw
         slug, so `GET /api/page?slug=<anything>` inserted a row keyed by whatever a reader typed and
         kept it for four hundred days: a read that writes, with the subject chosen by the reader.
         It is also the wrong signal. "A page nobody opens" (24 §4.2) is a question about the pages
         this record DECLARES, and a row for a page that does not exist answers nothing while
         diluting the count that does. */
      if (out.ok) kernel.observe([{ kind: 'page.render', subject: args.slug }]);
      if (!out.ok) return out;
      /* THE VERSION A WRITE OVER THIS PAGE CARRIES (`setDeclaration`). A page declared `for:` rows has none of its own slug. */
      const declared = pageDeclaredAt(args.slug);
      return ok({
        ...out.value,
        ...(declared ? { declared_version: declared.version } : {}),
        blocks: out.value.blocks.map((b) => {
          /**
           * EVERY REGISTER THE BLOCK DRAWS FROM, AND IT USED TO BE `b.source` ALONE.
           *
           * `05 §1` makes `table` the page-only kind that takes `source:`. A `stat` block has
           * `cells:` instead, and each cell names a metric whose own declaration carries the
           * register, so a block made of figures had no `source`, matched no register, and was
           * handed back to anybody who could open the page. Driven over HTTP with a read token
           * whose ceiling is one register: `list` refuses, `metric` refuses, `boot` shows one
           * register, and then `page` returned `{"value":4200000,"unit":"GBP"}` from another.
           * The shipped seed's Money page is exactly that shape.
           *
           * THE KERNEL RESOLVES THEM, because a metric id is a name and the declaration behind it
           * lives in the record. `readings` is emptied with `rows`, because a `stat` block's
           * content is its readings and blanking the rows of a block that has none is blanking
           * nothing.
           *
           * THE LEVEL AND NOT ONLY THE CEILING, for the reason `readable` gives: a block over a
           * register somebody may only append to used to draw its rows.
           */
          /* WHAT HAPPENED ACROSS THE RECORD IS FOR WHOEVER MAY READ ALL OF IT. A `feed` or `agents` block reads the
             whole log and names rows of every list, so somebody invited to named lists is refused the block, as
             `whatsNew` holds a line about the record as a whole back from them. */
          /* AND THE OPEN QUESTIONS AND THE SCHEDULED ACTIONS ARE THE SAME KIND OF READ (`ACROSS`). */
          const log: Refusal | null =
            typeof b.source === 'string' && ACROSS.has(b.source) && (!wholeRecord(ctx) || allows(ctx, 'read') !== null)
              ? {
                  code: 'FORBIDDEN',
                  fix:
                    b.source === 'activity'
                      ? 'What happened across this BrainDog is shown to people who can read all of it.'
                      : b.source === 'actions'
                        ? 'What this BrainDog does on a schedule is shown to people who can read all of it.'
                        : 'The questions open across this BrainDog are shown to people who can read all of it.',
                  at: 'source',
                }
              : null;
          const beyond =
            log ??
            [...kernel.blockRegisters(b), ...alsoReads(b)]
              .map((register) => readable(ctx, register))
              .find((said) => said !== null);
          /* WHERE THIS READER LAST LOOKED. The kernel does not know who is reading, so a feed that marks what is new came back
             with `seen: null` and drew every line as unread; it is the caller's own read mark, the one Home's list moves.
             AND A TOKEN'S IS ITS PERSON'S. This looked the mark up by `principal.id`, which for a token is the token's
             own id and no member row has it, so a person's agent drew every line as unread however far the person had
             read, while `whatsNew` for the same token read the person's mark. Both now ask `readerOf`. */
          if (!beyond && b.source === 'activity' && 'seen' in b) return { ...b, seen: markOf(readerOf(ctx)) };
          if (!beyond) return b;
          const kept: Record<string, unknown> = { ...b };
          for (const key of [...DRAWN, ...WRITTEN]) delete kept[key];
          /* AND WHAT IT READS, WHEN THAT IS A LIST OR A FIGURE. A refused Diary block still said `source: register.diary`,
             the id `boot` leaves out of her rail, and `columns` with Diary's field ids, which is the schema `schema`
             refuses her; a figure's said `source: metric.diary-count` (`loop/research-scoped-leftovers.md` §1). The web
             reads neither off a refused block: `blockOf` draws the shell, headed from `refusals`, the moment one is
             there. A source that names a view and no list stays, since it says nothing she could not guess: the `log`
             ones, and the two below, which are the kernel's computed sources that `ACROSS` does not hold. */
          if (!log && typeof b.source === 'string' && b.source !== 'forecast.runway' && b.source !== 'sessions.live') {
            delete kept.source;
            delete kept.columns;
          }
          return {
            ...(kept as typeof b),
            rows: [],
            matched: 0,
            ...(b.readings ? { readings: [] } : {}),
            ...(b.measures ? { measures: [] } : {}),
            ...(b.values ? { values: {} } : {}),
            ...(b.feed ? { feed: [] } : {}),
            ...(b.queue ? { queue: [] } : {}),
            refusals: [beyond],
          };
        }),
      });
    },

    /** One figure, by the id a `stat` cell names. */
    async metric(args: { metric: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      if (typeof args?.metric !== 'string' || !args.metric)
        return no('REQUIRED_MISSING', 'A figure is asked for by its id, optionally with a parameter after a colon.', { at: 'metric' });
      /* The FIRST colon separates: a parameter may contain one, and splitting on every colon read
         `project-owed:C:\Repos` as a project called `C`. */
      const at = args.metric.indexOf(':');
      const id = at < 0 ? args.metric : args.metric.slice(0, at);
      const param = at < 0 ? undefined : args.metric.slice(at + 1);
      /* THE CEILING BEFORE THE EXISTENCE CHECK, and the order is the whole point. Answering
         `METRIC_UNKNOWN` for a name that does not exist and `FORBIDDEN` for one that does, over a
         register the caller cannot see, is an enumeration oracle: one probe per guess tells you
         which figures this business keeps. `boot` goes to trouble to hide register names on the
         grounds that a list of names is itself information, and this handed the same list back a
         name at a time.

         SO A METRIC OVER A REGISTER YOU CANNOT REACH IS A METRIC THAT DOES NOT EXIST, said in those
         words. It is the same answer somebody outside the ceiling would get for a name nobody ever
         declared, which is the only shape of answer that leaks nothing. */
      const decl = kernel.metricDecl(id ?? '');
      const filled = decl && param !== undefined ? (fill(decl, null, param) as typeof decl) : decl;
      const register = filled?.source.startsWith('register.') ? filled.source.slice('register.'.length) : null;
      /* AND THE CHECK IS `readable`, not the ceiling. A figure over a register somebody may only
         append to answered with the figure, which is the same leak one number wide. */
      if (!filled || (register && readable(ctx, register)))
        return no('METRIC_UNKNOWN', `There is no metric called ${args.metric}.`, { at: 'metric' });
      return kernel.metric(filled);
    },

    /**
     * What a rule WOULD do, without doing any of it.
     *
     * A READ, and scoped like one: the sample it returns names rows, so a caller who cannot reach
     * the register cannot preview a rule against it. Nothing in it calls the write path — which is
     * what makes it safe to hand to whoever is writing the rule rather than only to an owner.
     */
    async dryRun(args: { rule: RuleDecl; limit?: number }, ctx: CallContext) {
      const stop = guard(ctx, 'read', args?.rule?.register);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.rule?.register || !Array.isArray(args.rule.then))
        return no('VALUE_MALFORMED', 'A rule names a register and what it would then do.', { at: 'rule' });
      return kernel.dryRun(args.rule, args.limit);
    },

    /**
     * Who the caller is, as the record sees them.
     *
     * THE FIRST CALL AN AGENT SHOULD MAKE, and the one every product forgets to ship. An agent that
     * cannot ask what it may do finds out by being refused, one verb at a time, in front of whoever
     * is watching — and the answer it works out that way is a guess it will still be acting on
     * three turns later.
     *
     * IT SAYS THE INTERSECTION, not the token's scope. A write token held by somebody with read
     * access reads, and reporting the scope alone would be reporting the half that is not binding.
     */
    async whoami(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };

      const p = ctx.principal;
      const may = NEEDS.filter((need) => allows(ctx, need) === null);
      return ok({
        kind: p.kind,
        id: p.kind === 'system' ? 'system' : p.id,
        person: p.kind === 'token' ? p.person : p.kind === 'person' ? p.id : null,
        level: p.kind === 'system' ? 'owner' : p.level,
        scope: p.kind === 'token' ? p.scope : null,
        /* WHICH REGISTERS, when the caller is held to some of them. `null` is "all of them", which
           is a different answer from "none" and the two must never be one value. */
        registers: ctx.registers ?? null,
        may,
      });
    },

    /**
     * What a digest would say if it went now. It sends nothing.
     *
     * THE SAME ASSEMBLY THE SCHEDULED ONE USES. A "today" screen computed by a second code path is
     * a screen that disagrees with the email on the day one of them is wrong, and the person
     * reading both has no way to tell which.
     */
    async digestToday(args: { digest?: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };

      /* AND IT IS HELD TO WHAT THE CALLER MAY READ. `boot` hides a register this caller cannot reach
         and `list` refuses it, and then a digest section over it handed the rows across. A section
         is a read of a register like any other, and it answers the same question `list` does. That
         question was the CEILING alone, so a section over a register somebody may only append to
         still went out to them. */
      return ok(
        kernel.digestToday(args?.digest).map((d) => {
          /* A SECTION OVER A FIGURE READS THE FIGURE'S LIST. The kernel reads `metric.<id>` through the metric's own
             declaration (`digest.ts`), and this kept any source that did not start with `register.`, so §4 of
             `loop/research-scoped-audit.md` read `Monday: Diary 2` and a reading of 2 off a figure over the diary, while
             `metric('diary-count')` answered the same member METRIC_UNKNOWN. So the figure's own source is asked, as
             `metric` asks it, and a figure over no list, or one that is not declared, is kept only for somebody who reads
             the whole record. A section the kernel wrote about the digest itself (`Not sent`) names no source. */
          const sections = d.sections.filter((s) => {
            const figure = s.source.startsWith('metric.') ? (kernel.metricDecl(s.source.slice('metric.'.length))?.source ?? '') : s.source;
            const register = figure.startsWith('register.') ? figure.slice('register.'.length) : null;
            if (register !== null) return !readable(ctx, register);
            return !s.source.startsWith('metric.') || wholeRecord(ctx);
          });
          return { ...d, sections, carrying: carryingOf(sections).length, headline: headline(d.name, carryingOf(sections)) };
        }),
      );
    },

    /**
     * How far this person has read.
     *
     * A PERSON, NOT A TOKEN. A read mark is a fact about somebody's attention, and an agent polling
     * a record does not have any — letting a token move it would mean a person coming back to a
     * record their own agent had marked as read.
     *
     * AND IT IS NOT AN EVENT. Every glance at a screen would otherwise be a line in somebody's
     * history, and the history is the thing that has to stay worth reading.
     */
    /* `upTo` IS AN EVENT, and it took none. `45 §5.2` gives the argument and the SQL that reads
       that event's own `ts`; without it the mark was the wall clock at the moment of the call —
       *when you pressed the button*, not *how far you have read*. Omitting it marks everything,
       which is what the button on the home screen means and what the client sent before. */
    /* AND A SCOPED READER MAY MARK, which `guard` refused. `whatsNew` is `scoped`, so a colleague
       invited to one list is shown "since you were away" and could never clear it: the read half
       answered and the write half refused, so their first screen kept the same lines for ever and the
       button under them refused every press. A read mark is about the caller's own attention and
       nobody else's rows, so it asks what `whatsNew` asks — and `append` alone still refuses, because
       somebody who may only file has read nothing to mark. */
    async markRead(args: { upTo?: Cursor } | undefined, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      if (ctx.principal.kind !== 'person')
        /* `FORBIDDEN` with the sentence carrying the reason — the same move as `allows` above. */
        return no('FORBIDDEN', 'A read mark belongs to a person, and a token is not one.', { at: 'principal' });
      /* CHECKED AS `whatsNew` CHECKS ITS CURSOR, because the route hands the body straight through: `{ "upTo": true }`
         reached the SQL binding, which threw, and the caller got a 500 for the mistake `whatsNew` answers with a 422. */
      /* AND FROM A CALLER HELD TO NAMED LISTS IT IS ONE SHE WAS HANDED, never a number: the walk below answered the
         rowid it landed on, so stepping `upTo` through the log said which rowids were hers (`cursorOf`). */
      const asked = args?.upTo === undefined ? null : await cursorOf(ctx, args.upTo, 'upTo');
      if (asked !== null && typeof asked !== 'number') return { ok: false as const, refusal: asked };
      /* AND THE MARK LANDS ON AN EVENT THE CALLER MAY SEE. The answer is that event's own `ts`, so marking a hidden
         event handed a member invited to one list the exact time the owner wrote in another, one rowid per call; the
         audit read a diary write's instant this way. So `upTo` is walked down to the newest event at or below it that
         `lineOf` shows this caller, which is the same sight `whatsNew` answers with, and a caller who can see nothing
         there keeps the mark they had. For an owner the first event walked is the one asked for, so nothing moves. */
      const landed = walk(ctx, (asked ?? kernel.newestEvent()) + 1, 1, 1).lines[0] ?? null;
      const person = ctx.principal.id;
      /* NOTHING TO MARK IS `upTo: 0`, which is what this answered on an empty log before the walk: 0 names no event, so
         it tells a scoped caller nothing about what is hidden. */
      if (landed === null) return ok({ upTo: 0 as Cursor, seen_at: markOf(person) });
      return ok({ upTo: pointAt(ctx, landed), seen_at: kernel.markRead(person, landed.rowid) });
    },

    /**
     * One thing this person arranged for themselves: `nav.order`, the rail's order, or `nav.hidden`, the pages taken
     * out of it. Each is a list of addresses, and `null` takes it away. `boot` answers them on `me.prefs`.
     *
     * A PERSON, NOT A TOKEN, and not an event, for the reasons a read mark is neither: it is about somebody's own
     * screen, and it is not the record's history. Any level may, since it changes nothing anybody else sees.
     */
    async setPref(args: { key: string; value: unknown }, ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      if (ctx.principal.kind !== 'person') return no('FORBIDDEN', 'What a rail shows belongs to a person, and a token is not one.', { at: 'principal' });
      const extra = stray((args ?? {}) as Record<string, unknown>, ['key', 'value']);
      if (extra) return { ok: false as const, refusal: extra };
      if (!PREF_KEYS.includes(args?.key as PrefKey))
        return no('VALUE_MALFORMED', `key is one of ${PREF_KEYS.join(' or ')}.`, { at: 'key', allowed: PREF_KEYS });
      const value = args.value;
      if (value !== null && !(Array.isArray(value) && value.length <= 500 && value.every((v) => typeof v === 'string' && v.startsWith('/') && v.length <= 300)))
        return no('VALUE_MALFORMED', 'value is a list of at most 500 addresses, each starting with /, or null to take it away.', { at: 'value' });
      const kept = value === null ? null : [...new Set(value as string[])];
      kernel.setPref(ctx.principal.id, args.key, kept);
      return ok({ key: args.key, value: kept });
    },

    /**
     * A note against a row.
     *
     * IT CHANGES NOTHING AND IS STILL A WRITE, because it is a thing somebody said and the record
     * keeps what was said. It goes through `update` with an empty patch, so it answers to the same
     * permission, lands in the same history, and cannot become a second way to write a field.
     */
    async log(args: { register: string; seq: number; note?: string }, ctx: CallContext) {
      const note = String(args?.note ?? '').trim();
      if (!note) return no('REQUIRED_MISSING', 'A note is one sentence, and this one is empty.', { at: 'note' });
      /* THE LEDGER'S OWN CEILING. `event.note` is 280 characters because a note nobody reads is a
         note nobody writes; cutting it silently would lose the half somebody meant. */
      if (note.length > 280)
        return no('OUT_OF_BOUNDS', `A note is at most 280 characters, and this one is ${note.length}.`, { at: 'note' });
      /* `append`, NOT `write`. 20 §1 puts `log` in the append half beside `create` and `propose` —
         "the conservative half: an appender sees nothing, not even what it filed" — and 45 §5.1 says
         the same. Demanding `write` meant an agent invited to file notes and nothing else could not
         file one. */
      const stop = guard(ctx, 'append', args.register);
      if (stop) return { ok: false as const, refusal: stop };
      /* AND IT IS A `note` EVENT RATHER THAN AN `edit`. This went through `update` with an empty
         patch, so a log entry bumped the row's VERSION — and anybody holding the version they read
         then got a spurious `VERSION_STALE` on their next real change, for a call that changed no
         field. 30 §2: `note` is "the one row a person or an agent writes on purpose". */
      /* A TOKEN'S NOTE IS SIGNED BY ITS RUN, found or opened as its writes are, and it moves the run's
         heartbeat. The kernel finds the row first, so a note against nothing opens no run. */
      return tail(kernel.log(args.register, args.seq, { ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) }, note));
    },

    /* ── AN AGENT'S RUN ─────────────────────────────── */

    /**
     * Say which run this agent is, and where it stands. A token's call, needing `propose`.
     *
     * THE LADDER DECIDES WHICH RUN, as it does for every token write: the one named, the one holding this
     * client id, a live one on the same host and repository, or a new one. A run already there is
     * resumed, and what it is doing and where are refreshed. `next`, `tried` and `notes` are its handoff
     * and are never touched here, because the start of a run is exactly when they are read.
     */
    async attach(
      args: { client_id?: string; doing?: string; source: (typeof SOURCES)[number]; branch?: string; head?: string },
      ctx: CallContext,
    ): Promise<Result<Attached>> {
      const stop = guard(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'token')
        return no('FORBIDDEN', 'attach is how an agent says which run it is, and a person is never a run.', { at: 'principal' });
      const said = (args ?? {}) as Record<string, unknown>;
      const wrong = stray(said, ['client_id', 'doing', 'source', 'branch', 'head']);
      if (wrong) return { ok: false, refusal: wrong };
      if (!(SOURCES as readonly unknown[]).includes(said.source))
        return no('ENUM_VALUE_UNKNOWN', `source says why this run is attaching: one of ${SOURCES.join(', ')}.`, { at: 'source', allowed: SOURCES });
      if (said.client_id !== undefined && (typeof said.client_id !== 'string' || !CLIENT_ID.test(said.client_id)))
        return no('VALUE_MALFORMED', "client_id is the runtime's own id for this run: letters, digits and . _ : -, at most 128.", { at: 'client_id' });
      const hints: SessionHints = { ...ctx.session, ...(typeof said.client_id === 'string' ? { client_id: said.client_id } : {}) };
      for (const key of ['doing', 'branch', 'head'] as const) {
        const value = line(said, key);
        if (!value.ok) return value as Result<never>;
        if (value.value !== undefined) hints[key] = value.value;
      }
      const source = String(said.source);

      const found = runFor(ctx, hints, `opened: ${source}`);
      if (!found.ok) return tail(found as Result<never>);
      const { run, spoken, opened } = found.value;
      /* THE BRIEFING FOR THE RUN JUST NAMED, so the start hook prints it from this one answer. */
      const briefed = (): Context => briefing({ ...ctx, session: { ...hints, spoken } });
      if (opened) return tail(ok({ session: run, spoken, resumed: false, project: projectOf(run), context: briefed() }));

      /* THE RUN'S OWN ROW, written as the run: the ladder finds it again from the same hints, signs the
         edit with it, moves `last_seen`, and places it again when it came back by its client id. */
      const patch: Patch = {};
      for (const key of POSITION) if (typeof hints[key] === 'string' && hints[key] !== run.fields[key]) patch[key] = hints[key];
      if (hints.client_id !== undefined && run.fields.client_id === undefined) patch.client_id = hints.client_id;
      if (REVIVED.includes(run.state ?? '')) patch.state = 'active';
      const out = kernel.update(SESSION, run.id, patch, { ...writerOf({ ...ctx, session: hints }), note: `attached: ${source}` });
      if (!out.ok) return tail(out as Result<never>);
      return tail(ok({ session: out.value, spoken, resumed: true, project: projectOf(out.value), context: briefed() }));
    },

    /**
     * Keep a run's handoff true: the next step, a dead end, a line of reasoning, what it is doing, its
     * state. Needs `propose`.
     *
     * `tried` AND `note` APPEND AND NEVER OVERWRITE, because a dead end one run recorded is what stops the
     * next from walking into it. Each list keeps its last fifty, and the append is read and written in
     * one transaction so that two handoffs cannot drop each other's line. `state` moves only along the
     * register's declared transitions.
     *
     * A TOKEN HANDS OFF ITS OWN RUN, found by the ladder like any write of its. Naming a run is a
     * person's, from the app: an agent that could name one could rewrite another run's handoff.
     */
    async handoff(
      args: { next?: string; tried?: string; note?: string; doing?: string; state?: string; branch?: string; head?: string; session?: string },
      ctx: CallContext,
    ): Promise<Result<Entry>> {
      const token = ctx.principal.kind === 'token';
      const stop = guard(ctx, 'propose', token ? undefined : SESSION);
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const wrong = stray(said, HANDOFF);
      if (wrong) return { ok: false, refusal: wrong };
      if (token && said.session !== undefined)
        return no('FORBIDDEN', 'A token hands off its own run, so it names none. A person names a run from the app.', { at: 'session' });
      if (!token && typeof said.session !== 'string')
        return no('REQUIRED_MISSING', `Name the run to hand off, such as ${PREFIX}3.`, { at: 'session' });

      const lines: Partial<Record<'next' | 'tried' | 'note' | 'doing' | 'branch' | 'head', string>> = {};
      for (const key of ['next', 'tried', 'note', 'doing', 'branch', 'head'] as const) {
        const value = line(said, key);
        if (!value.ok) return value as Result<never>;
        if (value.value !== undefined) lines[key] = value.value;
      }
      if (lines.next !== undefined && vague(lines.next))
        return no(
          'VALUE_MALFORMED',
          `next is the one concrete step the next run takes, such as "Run the refusal gates after the build", and "${lines.next}" names none.`,
          { at: 'next' },
        );
      if (said.state !== undefined && typeof said.state !== 'string')
        return no('VALUE_MALFORMED', `state is one of the run's states: ${LIVE.join(', ')} or ${RUN.done.join(', ')}.`, { at: 'state' });
      if (Object.keys(lines).length === 0 && said.state === undefined)
        return no('REQUIRED_MISSING', 'A handoff carries at least one of next, tried, note, doing, state, branch or head.', { at: 'next' });

      /**
       * FINDING THE RUN IS PART OF THIS WRITE, NOT A PRELUDE TO IT.
       *
       * `runFor` opens a run when the caller has none, which writes a row, and every check after it
       * belonged to a write that could still refuse. So a handoff the kernel turned down left a run
       * behind: `handoff({ state: 'banana' })` from an agent with no run opened one, `active`, and
       * then refused, and three retries of the one malformed call made three runs, each of them in
       * the next briefing and each governed by the twelve-hour sweep. A bad state is only the
       * cheapest way in; any refusal `update` can raise, a `next` over the field's byte ceiling
       * included, did the same.
       *
       * THE KERNEL'S PROMISE IS THE ONE BEING KEPT HERE: a refusal is "a value returned from a
       * transaction that never began to change anything". This is the one path that opened a row
       * before the checks rather than after them, and the repair is to move the open inside.
       *
       * AND THE REFUSAL TRAVELS AS A THROW, because a throw is what rolls back. `transactionSync`
       * commits on a returned value, so returning the refusal from here would commit the very run
       * it was refusing.
       */
      return tail(unwound<Entry>(() =>
        kernel.transaction(() => {
          let run: Entry;
          let by: Pick<WriteContext, 'actor' | 'principal' | 'session'>;
          if (token) {
            const hints: SessionHints = {
              ...ctx.session,
              ...(lines.doing === undefined ? {} : { doing: lines.doing }),
              ...(lines.branch === undefined ? {} : { branch: lines.branch }),
              ...(lines.head === undefined ? {} : { head: lines.head }),
            };
            const found = runFor(ctx, hints, 'opened: auto');
            if (!found.ok) throw new Unwind(found as Result<never>);
            run = found.value.run;
            /* NAMED, so the write lands on the run it was found as: a run just opened may have no client id
               or place for the ladder to find it by a second time. */
            by = writerOf({ ...ctx, session: { ...hints, spoken: found.value.spoken } });
          } else {
            const named = kernel.get(String(said.session).trim());
            if (!named || named.register !== SESSION)
              throw new Unwind(no('VALUE_MALFORMED', `${String(said.session)} is not a run. Runs are spoken ${PREFIX}1, ${PREFIX}2.`, { at: 'session' }));
            run = named;
            by = writerOf(ctx);
          }

          const now = kernel.get(run.id) ?? run;
          const patch: Patch = {};
          for (const key of ['next', 'doing', 'branch', 'head'] as const) if (lines[key] !== undefined) patch[key] = lines[key];
          if (lines.tried !== undefined) patch.tried = [...listOf(now.fields.tried), lines.tried].slice(-KEPT);
          if (lines.note !== undefined) patch.notes = [...listOf(now.fields.notes), lines.note].slice(-KEPT);
          /* A STATE THE CALLER NAMED IS THE STATE IT GETS. Revival is for the call that names none: a token
             writing a handoff is working again, so a run that had gone quiet comes back, the way an attach
             revives one. A quiet run that asks to hand off must be able to, because `handoff` is exempt from
             the twelve-hour sweep and `idle` is not. */
          if (typeof said.state === 'string') patch.state = said.state;
          else if (token && REVIVED.includes(now.state ?? '')) patch.state = 'active';
          /* A FINISHED RUN LEAVES ITS OLD NEXT STEP BEHIND. The briefing hands the newest next step here to whoever
             starts, and a step the run has since finished sends them after work that is done. A next step named in
             the same call is the one it leaves. */
          if (typeof said.state === 'string' && RUN.done.includes(said.state) && lines.next === undefined && now.fields.next !== undefined)
            patch.next = null;
          const written = kernel.update(SESSION, now.id, patch, by);
          if (!written.ok) throw new Unwind(written as Result<never>);
          return written;
        }),
      ));
    },

    /**
     * The runs that are live now: active, idle, or waiting to be picked up. Each says whether it has gone
     * quiet, how long since it was heard from, and whether it is in the caller's repository.
     *
     * A READ, AND IT OPENS NO RUN: an agent asking who else is working has not started yet.
     */
    async sessionsLive(_args: Record<string, never> | undefined, ctx: CallContext): Promise<Result<LiveRun[]>> {
      const stop = guard(ctx, 'read', SESSION);
      if (stop) return { ok: false, refusal: stop };
      return ok(live(ctx));
    },

    /**
     * Where the caller stands, in one call: its run and project, the last handoff here, who else is
     * live, what waits on a person, and the rows that apply here with the global ones they inherit. A
     * READ, scoped as `boot` is, and it opens no run: an agent asking where it is has not started yet.
     */
    async context(_args: Record<string, never> | undefined, ctx: CallContext): Promise<Result<Context>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      return ok(briefing(ctx));
    },

    /* ── PEOPLE ─────────────────────────────── */

    /**
     * Someone met in the work: matched by email or handle, or added, with where they were met, and linked to
     * the project of the caller's run (`loop/research-agent-path.md` §5.6). Needs `propose` on people.
     *
     * THE KERNEL WRITES AS THE CALLER'S RUN, found by the ladder as every token write is, so the person is
     * signed by the run and placed in its project. A person in the app is never a run, and links none.
     *
     * PEOPLE IS A MODULE THE OWNER MAY SWITCH OFF. Without the register this is `REGISTER_UNKNOWN`, and the
     * kernel writes nothing, a run included.
     */
    async meet(args: MeetArgs, ctx: CallContext): Promise<Result<Met>> {
      const stop = guard(ctx, 'propose', PEOPLE);
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const wrong = stray(said, MEET);
      if (wrong) return { ok: false, refusal: wrong };
      return tail(kernel.meet(said as MeetArgs, writerOf(ctx)));
    },

    /* ── THE DECISION GATE ─────────────────────────── */

    /**
     * The governance rows: what has been proposed, what was decided, what was predicted.
     *
     * A READ, and not scoped by register, because a suggestion is about the record rather than about
     * one register — and one that the person who has to answer it cannot see is a proposal that was
     * never made.
     */
    async governance(args: { register?: string; id?: string; status?: string; limit?: number; cursor?: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      const register = (args?.register ?? 'suggestion') as GovernRegister;
      /* A HANDLE IN IS TURNED BACK INTO ITS NUMBER BEFORE ANY CHECK BELOW, so a hidden question named by handle meets the
         same `holds` and answers the same `null` or the same sentence as one named by number, and a handle naming no
         event goes on as it came and is answered as a number naming no row (`question-handles.ts`). */
      const id = args?.id ? spokenIn(String(args.id)) : undefined;
      const cursor = typeof args?.cursor === 'string' ? spokenIn(args.cursor) : args?.cursor;
      const out = <T>(row: T): T | null => handed(ctx, register, asked(register, row));
      if (id !== undefined) {
        /* AND ONE BY ID ANSWERS TO THE SAME CEILING. The list path was filtered and this was not,
           and the ids are sequential — `SG1`, `SG2` — so one extra query parameter walked the whole
           queue. A row you may not see does not exist, which is the same answer a missing id gets. */
        const row = kernel.governanceRow(register, id);
        return ok(row && holds(ctx, row) ? null : out(row));
      }
      /* A PAGE AT A TIME PAST THE LIMIT: `cursor` is the id of the last row the page above held, and a page shorter than
         the limit is the last one. */
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor === ''))
        return no('VALUE_MALFORMED', 'A cursor is the id of the last row the page above answered with.', { at: 'cursor' });
      /* A CURSOR ON A ROW YOU MAY NOT SEE IS ANSWERED AS ONE ON NO ROW AT ALL. The kernel resolves the cursor over the
         whole table before this ceiling runs, so a member scoped to one list could ask for `SG<n>` a number at a time
         and read which ones exist, which is how many questions and decisions the record holds (research-scoped-audit
         §7). The sentence is the kernel's own, byte for byte, so the two answers cannot be told apart. */
      if (cursor !== undefined) {
        const at = kernel.governanceRow(register, cursor);
        if (at && holds(ctx, at)) return no('VALUE_MALFORMED', 'A cursor is the id of the last row the page above answered with. Start from the first page.', { at: 'cursor' });
      }
      const after = cursor === undefined ? {} : { cursor };
      const rows = kernel.governance(register, {
        ...(args?.status === undefined ? {} : { status: String(args.status) }),
        ...(args?.limit === undefined ? {} : { limit: Number(args.limit) }),
        ...after,
      });
      if (!rows.ok) return rows;

      /* AND IT IS HELD TO THE CALLER'S CEILING, like every other read of rows. A `rowset` body is
         `{ register, rows: […] }` and carries up to two hundred field-value objects verbatim — so
         a bookkeeper scoped to expenses could read every proposed payroll row out of the queue,
         through a method that names no register and therefore ran no ceiling check. `list` refuses
         that register, `boot` hides it, and the digest was taught the same lesson one commit
         earlier; the gate is the last read that had not been. */
      /* A ROW `handed` HOLDS BACK IS HELD BACK HERE, before the page is counted, so the page is filled past it as it is
         past a row `holds` holds back. */
      const shownRows = (all: typeof rows.value) => all.filter((r) => !holds(ctx, r)).flatMap((r) => ((o) => (o === null ? [] : [o]))(out(r)));
      const kept = shownRows(rows.value);
      if (kept.length === rows.value.length) return ok(kept);
      /* AND THE PAGE IS FILLED FROM WHAT IS LEFT. Trimmed to the limit and then filtered, a token
         scoped to one register was handed an empty page whenever the newest fifty were about
         another, with its own questions still open behind them. */
      const every = kernel.governance(register, { ...(args?.status === undefined ? {} : { status: String(args.status) }), every: true, ...after });
      if (!every.ok) return every;
      return ok(shownRows(every.value).slice(0, rows.value.length));
    },

    /**
     * Open one.
     *
     * `propose` IS ITS OWN RUNG, and it is the whole reason the token ladder has three. An agent that
     * can propose and not write is an agent whose mistakes are a queue rather than a diff.
     */
    async propose(args: Proposal, ctx: CallContext) {
      /* THE REGISTER A `rowset` NAMES IS ONE THE CALLER MUST REACH. `propose` took no register, and
         `checkBody` only asks whether the named one EXISTS — so a `propose` token scoped to expenses
         could put payroll rows in the queue an owner reads, and (before the line above) every other
         scoped member could then read them. A proposal is not a write, but it is rows about a
         register, and naming one you cannot see is the same information leak in the other
         direction. */
      const named = args?.body_kind === 'rowset' ? (args.body as { register?: unknown })?.register : undefined;
      const stop = guard(ctx, 'propose', typeof named === 'string' ? named : undefined);
      if (stop) return { ok: false as const, refusal: stop };
      /* AN ARRANGEMENT IS FILED WITH WHAT IT WOULD DO, worked out here from the catalogue and the record, so the
         owner reads the packs, pages, calls out and settings it would change, and nothing the proposer said about them. */
      if (args?.body_kind === 'pack' || args?.body_kind === 'settings' || args?.body_kind === 'arrange') {
        const body = args.body as Record<string, unknown> | undefined;
        if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
          /* ROWS IN AN ARRANGEMENT ARE SPARK'S PLAN, formed from what the owner said (`sparkForm`). Anybody else proposes rows
             as a rowset, which is held to the lists the caller reaches. */
          if (args.body_kind === 'arrange' && body.rows !== undefined)
            return no('FIELD_UNKNOWN', 'An arrangement you propose carries no rows. Propose rows as body_kind rowset, one list at a time.', { at: 'body.rows' });
          const filed = await arrangement.prepare(args.body_kind, body);
          if (!filed.ok) return filed;
          return tail(filedAs(ctx, kernel.propose({ ...args, body: filed.value }, writerOf(ctx))));
        }
      }
      /* A TOKEN'S PROPOSAL IS SIGNED BY ITS RUN, as its writes are. */
      return filedAs(ctx, kernel.propose(args, writerOf(ctx)));
    },

    /**
     * Answer one.
     *
     * `decide` IS A RUNG NO TOKEN REACHES (ADR-060). An agent may put a question in front of a
     * person; it may not answer its own question, and that is not a scope somebody can be issued.
     * An accepted `pattern` or `change` is installed here, after the gate has said yes and before
     * the suggestion is resolved — a decision that resolved before its change landed would be a lie.
     */
    async decide(args: { id: string; decide?: { option: string; reason: string }; defer?: { until: string; why: string }; resolved_as?: 'wont-fix' | 'incorrect'; reason?: string }, ctx: CallContext) {
      const stop = guard(ctx, 'decide');
      if (stop) return { ok: false as const, refusal: decidesNot(ctx, stop) };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which suggestion?', { at: 'id' });
      /* A HANDLE IS TAKEN AS THE NUMBER IT NAMES, before anything reads the id, as `governance` takes one. */
      args = { ...args, id: spokenIn(String(args.id)) };
      /* NO VERDICT IS A MISSING ANSWER, NOT A BAD ONE. With none of the three it fell through to the
         resolve branch and was refused "undefined is not a way to resolve one". */
      if (args.decide === undefined && args.defer === undefined && args.resolved_as === undefined)
        return no(
          'REQUIRED_MISSING',
          'Say what to do with it: decide with an option and a reason, defer with a date and why, or resolved_as wont-fix or incorrect with a reason.',
          { at: 'decide' },
        );

      const verdict = (
        args.decide ? { decide: args.decide } : args.defer ? { defer: args.defer } : { resolved_as: args.resolved_as, reason: args.reason }
      ) as Verdict;
      /* THE TAIL, LIKE EVERY OTHER WRITE PATH. Accepting a `change` that carries a prediction writes
         a `score` row into `schedule`, and this returned bare — so the alarm was never compared
         against it. `setDeclaration` wraps the same `kernel.install` in `tail` twenty lines below,
         which is the proof this was an omission rather than a decision. On a provisioned record the
         hourly purge row re-armed within the hour; on one without an identity row, nothing did. */
      /* ACCEPTING AN ARRANGEMENT IS INSTALLING, so it is held to the install's own door: an owner, and never a token
         (ADR-060). A member who may decide other questions may not change what this record is by accepting one. */
      if (args.decide?.option === 'accept') {
        const asked = kernel.governanceRow('suggestion', String(args.id));
        const kind = asked?.body_kind;
        if (kind === 'pack' || kind === 'settings' || kind === 'arrange') {
          const owner = admin(ctx, 'accept a change to what this record is');
          if (owner) return { ok: false as const, refusal: owner };
        }
      }
      const out = kernel.decide(args.id, verdict, actorOf(ctx));
      if (out.ok && out.value.apply) {
        /* AND IT LANDS BEFORE THE ANSWER IS TRUE. What will not apply reopens the question, with what was kept in its sentence. */
        const applied = await arrangement.apply(out.value.apply.kind, out.value.apply.body, actorOf(ctx));
        if (!applied.ok) {
          kernel.reopen(out.value.suggestion, 'refusal' in applied ? applied.refusal.fix : undefined);
          return tail(applied);
        }
        const { apply: _handed, ...decided } = out.value;
        /* KEPT ON THE DECISION, so what was applied is read back after a reload and by every other member. */
        if (decided.decision !== null) kernel.keepApplied(decided.decision, applied.value as Record<string, unknown>, actorOf(ctx));
        return tail(settledAs(ctx, args.id, ok({ ...decided, applied: applied.value })));
      }
      if (!out.ok || !out.value.install) return tail(settledAs(ctx, args.id, out));

      /* THE DECLARATION LANDS BEFORE THE ANSWER DOES. If it will not install, the gate's own
         transaction has already committed — so the suggestion is reopened rather than left resolved
         with nothing behind it. */
      const decl = out.value.install as { id?: string; kind?: string; body?: unknown };
      /* AND A `to` THAT IS NOT A DECLARATION THROWS RATHER THAN REFUSES. d15066d2 stopped one being filed, but a
         change already in the queue from before it still holds `{ values: [...] }`, and accepting it threw
         `Cannot read properties of undefined (reading 'writes')` out of `install` before the `reopen` below ran:
         the owner saw a crash and the record kept the suggestion resolved with nothing installed
         (`test/decide-install.test.ts`). A throw here is the same answer as a refusal, in the record's words. */
      /* A `TypeError` AND NOTHING ELSE. The bare `catch` answered every throw with this sentence, so a full disk or a
         corrupt page told the owner to propose the change again in a shape that was never wrong, and the driver's own
         message went nowhere (`test/decide-install-throws.test.ts`). Any other throw puts the question back first, so
         the record is not left resolved with nothing installed, and then surfaces as itself: the host answers it 500
         with its message. */
      let put: Awaited<ReturnType<typeof kernel.install>>;
      try {
        put = await kernel.install([decl as never]);
      } catch (thrown) {
        if (!(thrown instanceof TypeError)) {
          kernel.reopen(out.value.suggestion);
          throw thrown;
        }
        put = no(
          'VALUE_MALFORMED',
          'What this change would install is not a declaration, so nothing was changed and the question is open again. Propose it again as {"id":"register.<id>","kind":"register","body":{...}}.',
          { at: 'body.to' },
        );
      }
      if (!put.ok) {
        kernel.reopen(out.value.suggestion, 'refusal' in put ? put.refusal.fix : undefined);
        return tail(put);
      }
      return tail(settledAs(ctx, args.id, out));
    },

    /* ── ADMIN: PACKS ───────────────────────────────── */

    /**
     * What installing this pack would do to this record. It writes nothing.
     *
     * A BROWSER SESSION AND AN OWNER, and no token of any scope (ADR-060). A pack changes what a
     * record IS, and there is no scope that can be issued for that — saying `SCOPE_INSUFFICIENT`
     * would send somebody looking for a bigger token, and there is not one.
     */
    async planPack(args: { doc: unknown; source?: PackSource }, ctx: CallContext) {
      const stop = admin(ctx, 'read a plan for a pack');
      if (stop) return { ok: false as const, refusal: stop };

      const pack = await normalise(args?.doc, args?.source ?? { kind: 'local' });
      if (!pack.ok) return pack;
      const diff = await plan(pack.value, installedState(ctx));
      /* A PACK POINTING AT A LIST NOTHING HOLDS IS REFUSED AT THE PLAN, and not only at the install,
         because the repair is to install something else first and the plan is where a person reads it. */
      const unheld = unresolvedFault(diff);
      if (unheld) return { ok: false as const, refusal: unheld };
      return ok({ diff, pack: pack.value.manifest });
    },

    /**
     * Apply the plan somebody approved, and nothing else.
     *
     * THE HASH IS THE APPROVAL. `planHash` carries the record's version and the pack's checksum, so
     * a record that moved and a pack that was edited between the plan and the install are both
     * `PLAN_STALE` — and the second one is the case no version number can see.
     *
     * AND WHAT IT CALLS OUT IS APPROVED IN THE SAME PRESS (`loop/research-scheduled-actions.md` §5). A plan whose
     * `calls_out` has a `new` or `changed` action carries `approve`, the lines for them, and the install arms them only
     * when `approve` hands back exactly those lines. The same call, not a proposal, because only an owner in a browser
     * reaches here and the install is already one transaction: filing a proposal would half-install a pack whose rules
     * run actions it does not have yet. An agent's way to an action is `propose`, whose acceptance is this same approval.
     */
    async installPack(args: { doc: unknown; source?: PackSource; planHash: string; approve?: readonly string[] }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.planHash) return no('REQUIRED_MISSING', 'Read the plan first; installing is approving one.', { at: 'planHash' });
      const approve: unknown = args.approve;
      if (approve !== undefined && (!Array.isArray(approve) || approve.some((l) => typeof l !== 'string')))
        return no('VALUE_MALFORMED', 'approve is the list of lines the plan calls out, as it printed them.', { at: 'approve' });

      const pack = await normalise(args.doc, args.source ?? { kind: 'local' });
      if (!pack.ok) return pack;
      const state = installedState(ctx);
      const diff = await plan(pack.value, state);
      /* AN UPDATE MOVES WHAT THE OLDER VERSION KEPT TYPED into the rows the newer one reads, here and not in a tab, so every
         caller that updates a use case does it (`arrange.ts` `carryUpdate`). */
      const from = state.packs.find((p) => p.id === pack.value.manifest.pack)?.version ?? null;
      const spoke = speakingNow(kernel);
      const put = await install(pack.value, diff, packHost(ctx), args.planHash, (approve ?? []) as string[]);
      if (put.ok) await carryUpdate(deps.catalogue ?? [], kernel, pack.value.manifest.pack, from, actorOf(ctx));
      /* A USE CASE INSTALLED BESIDE THE ONE SPEAKING NEVER TAKES ITS VOICE (`declare` `voiceWhenAdding`), whichever way the ids
         sort: the answer is written down. A person who chose the new one to speak says so with its setting after. */
      if (put.ok && from === null && spoke !== null && pack.value.manifest.pack.startsWith('usecase-')) writeVoice(kernel, spoke, actorOf(ctx));
      return tail(put);
    },

    /** Take one back out. Its declarations are retired and its rows are kept, which is the point. */
    async uninstallPack(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which pack?', { at: 'id' });
      return tail(uninstall(args.id, packHost(ctx)));
    },

    /**
     * Turn a pack off. Its declarations are retired, its `pack` row stays, and every row under it is kept.
     *
     * NOTHING CASCADES UNASKED. A pack another one leans on is refused `PACK_REQUIRED`, naming them,
     * and `alsoDisable` is the caller choosing to turn those off in the same transaction.
     */
    async disablePack(args: { id: string; alsoDisable?: readonly string[] }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['id', 'alsoDisable']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which pack?', { at: 'id' });
      const also: unknown = args.alsoDisable;
      if (also !== undefined && (!Array.isArray(also) || also.some((p) => typeof p !== 'string' || !p)))
        return no('VALUE_MALFORMED', 'alsoDisable is a list of pack ids.', { at: 'alsoDisable' });
      return tail(
        kernel.disablePack(args.id, { ...(also === undefined ? {} : { alsoDisable: also as string[] }), actor: actorOf(ctx) }),
      );
    },

    /** Turn a disabled pack back on, over the rows it kept. A pack it leans on that is still off is named. */
    async enablePack(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['id']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which pack?', { at: 'id' });
      const out = await kernel.enablePack(args.id, { actor: actorOf(ctx) });
      /* A REGISTER ID IS `[a-z][a-z0-9_]*`, so it goes into the pattern as it is. */
      const fix = !out.ok && 'refusal' in out ? out.refusal.fix : '';
      return tail(offPack(out, (r) => new RegExp(`\\b${r}\\b`).test(fix), args.id));
    },

    /**
     * Start a paused scheduled action again, now: a `pull`, `call` or `poll` (`loop/DIRECTION.md` §0b).
     *
     * THE ONLY WAY ONE STARTS AGAIN. A 401 or a 403 pauses an action rather than retrying it, because retrying
     * a refused key against somebody's auth endpoint is how an account gets locked, and the owner is told when
     * it happens. So resuming is a decision a person makes, in a browser, like turning a pack back on.
     */
    async resumeAction(args: { ingest: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['ingest']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.ingest !== 'string' || !args.ingest) return no('REQUIRED_MISSING', 'Which action?', { at: 'ingest' });
      return tail(kernel.resumeAction(args.ingest, actorOf(ctx)));
    },

    /**
     * Every scheduled action: what it calls and how often, its state, its last run, its next run, and this month's
     * counts from its own `pull` events (`loop/research-scheduled-actions.md` §4.6). READ+.
     *
     * A KEY BY ITS LABEL. The list is built from the schedule, the vault's index and the run events, and nothing
     * sealed is read to build it, so a token that may read the record may read this.
     */
    async actions(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.actions());
    },

    /**
     * The saved ways of looking at a list: one list's, or every one this caller can read.
     *
     * READ+ AND NOT DATA, AND THE TWO ARE NOT SPLIT BY WHO MAY CALL THEM. `30 §5` gives both groups the
     * same reach — *any token, subject to scope* — so the choice is about what the method is ABOUT.
     * DATA's twelve are verbs over ROWS, and MCP exposes them as tools an agent takes actions with. A
     * view holds no rows: it is a saved question about a register, which puts it on the shelf beside
     * `schema` and `page`, things a caller reads to find out HOW to read. Over MCP that makes it a
     * resource, which is also the right shape for an agent — a stable name it can list and reuse.
     *
     * AND IT IS A SCOPED READ. A view names its register's fields and the values somebody filtered on,
     * so handing over the views of a register this caller may not read would hand over the shape of it
     * and a little of its contents. A register out of reach is LEFT OUT rather than refused, for the
     * reason `boot` leaves one out: which registers exist is itself something a caller may not know.
     *
     * ponytail: a saved view is a local table and does not travel in a .brain export; a travelling table
     * is FORMAT_VERSION 2 and every reader of the format. Make it travel when somebody moves a record
     * and asks where their views went.
     */
    async views(args: { register?: string } | undefined, ctx: CallContext): Promise<Result<ViewRow[]>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['register']);
      if (extra) return { ok: false as const, refusal: extra };
      const register = args?.register;
      if (register !== undefined) {
        if (typeof register !== 'string' || register === '')
          return no('VALUE_MALFORMED', 'A list is named by its id.', { at: 'register' });
        const held = guard(ctx, 'read', register);
        if (held) return { ok: false as const, refusal: held };
      }
      return ok(kernel.views(register).filter((v) => readable(ctx, v.register) === null));
    },

    /**
     * One saved view, read back whole: its filter, what was searched for, its order and its columns.
     *
     * READ+ for the reason `views` gives, and held to the register it belongs to. A name this register
     * has no view for answers `VIEW_UNKNOWN` carrying the names it does have, so the answer ends the
     * search rather than starting one — the move `PAGE_UNKNOWN` makes with its slugs.
     */
    async view(args: { register: string; id: string }, ctx: CallContext): Promise<Result<ViewRow>> {
      const stop = guard(ctx, 'read', args?.register);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as unknown as Record<string, unknown>, ['register', 'id']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.register !== 'string' || !args.register) return no('REQUIRED_MISSING', 'Which list?', { at: 'register' });
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which view?', { at: 'id' });
      const found = kernel.view(args.register, args.id);
      return found
        ? ok(found)
        : no('VIEW_UNKNOWN', `${args.register} has no view called ${args.id}.`, {
            at: 'id',
            allowed: kernel.views(args.register).map((v) => v.id),
          });
    },

    /**
     * Save the way a list is being looked at, under a name.
     *
     * ADMIN, WHICH IS THE ARGUMENT `setDeclaration` ALREADY MAKES. A saved view is not one person's
     * bookmark: it goes on the list, and everybody who opens that list sees it. So it changes what the
     * record OFFERS, and `30 §5` puts that behind a browser session and an owner. It is also the door
     * the gesture already goes through — the app saved a view by calling `setDeclaration`, which is
     * ADMIN — so nothing becomes reachable by anything that could not reach it yesterday.
     *
     * SAVING OVER A NAME REPLACES IT, keeping who first saved it and when.
     *
     * AND NO `tail`. A view arms nothing: it earns no schedule row and moves no alarm, so re-deriving
     * the alarm after it would be a read and a write that cannot change their answer.
     */
    async saveView(
      args: {
        register: string;
        id: string;
        name: string;
        filter?: unknown;
        search?: string | null;
        order?: { field: string; dir?: 'asc' | 'desc' }[];
        columns?: string[];
      },
      ctx: CallContext,
    ): Promise<Result<ViewRow>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as unknown as Record<string, unknown>, [
        'register',
        'id',
        'name',
        'filter',
        'search',
        'order',
        'columns',
      ]);
      if (extra) return { ok: false as const, refusal: extra };
      return kernel.saveView((args ?? {}) as never, { actor: actorOf(ctx) });
    },

    /** Take one saved view off a list. ADMIN for the reason `saveView` gives; the list's rows are untouched. */
    async retireView(args: { register: string; id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as unknown as Record<string, unknown>, ['register', 'id']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.register !== 'string' || !args.register) return no('REQUIRED_MISSING', 'Which list?', { at: 'register' });
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which view?', { at: 'id' });
      return kernel.retireView(args.register, args.id);
    },

    /**
     * Every pack, on or off, with the registers each holds. A read, because a list of names is not a change.
     *
     * OFF IS NOT ABSENT. A disabled pack is here with its `disabled_at`, and so is a pack the seed owns
     * by its declarations' bodies, which has no `pack` row and so no version.
     */
    async packs(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.packStates());
    },

    /**
     * One pack's settings: what its manifest declares under `config:`, and the value each holds now.
     *
     * A READ, like `packs`. A pack the seed owns by its bodies declares no settings and answers with
     * empty maps; a pack this record does not have is `DECLARATION_UNKNOWN`.
     */
    async packConfig(args: { id: string }, ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['id']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which pack?', { at: 'id' });
      return kernel.packConfig(args.id);
    },

    /**
     * Set some of a pack's settings, each checked against its declaration, with one event.
     *
     * NOTHING INSTALLED CHANGES HERE. A declaration holds the value it was installed with, and reads
     * the new one the next time the pack is planned and installed. `null` puts a setting back to its
     * default. An owner or admin in a browser session, like every other pack method.
     *
     * `batch`, A ULID, JOINS SEVERAL CALLS INTO ONE CHANGE in the log: the app writes a use case's voice down as one
     * setting per pack, and the feed reads the lines one write made by their batch, never by where they sit.
     */
    async setPackConfig(args: { id: string; values: Record<string, unknown>; batch?: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['id', 'values', 'batch']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which pack?', { at: 'id' });
      if (args.batch !== undefined && (typeof args.batch !== 'string' || !isUlid(args.batch)))
        return no('VALUE_MALFORMED', 'batch is a ULID shared by the calls that make one change, such as 01K5B3M2Q8ZC4XJ7N9TVRHW6YD.', { at: 'batch' });
      return tail(kernel.setPackConfig(args.id, args.values, { actor: actorOf(ctx), ...(args.batch === undefined ? {} : { batch: args.batch }) }));
    },

    /**
     * One declaration, set from the app.
     *
     * THE SAME LINT A PACK GETS. A rule edited in a text box and a rule installed from a file are
     * the same declaration, and letting the in-app path skip the checks would mean the two disagree
     * about what is legal — with the app being the one that lets a broken rule through.
     *
     * IT BELONGS TO NO PACK. `pack_id` is null, so a later `uninstall` of anything cannot take it,
     * and a pack that claims the same id is a `PROVIDES_CONFLICT` rather than a silent overwrite.
     *
     * `version` IS THE ONE THE CALLER READ, and `page` answers it as `declared_version`. Given, the write lands only if the
     * declaration is still at it, and otherwise answers a conflict carrying the body as it now stands, so two people
     * arranging one page no longer each overwrite the other. `0` says there was no such declaration to read.
     */
    async setDeclaration(args: { body: unknown; version?: number }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (args?.version !== undefined && !(Number.isInteger(args.version) && args.version >= 0))
        return no('VALUE_MALFORMED', 'version is the whole number the declaration was read at, or 0 when there was none.', { at: 'version' });

      /* WRAPPED AS A ONE-DECLARATION PACK, because that is where the reading of a document lives.
         A second parser for the in-app form would be a second grammar. */
      const one = await normalise(
        {
          pack: 'in-app',
          version: '0.0.0',
          summary: 'One declaration, set from the app.',
          author: 'this record',
          license: 'none',
          declarations: [args?.body],
        },
        { kind: 'local' },
      );
      if (!one.ok) return one;

      /* A PAGE IS NAMED THE WAY IT IS SERVED. `page` answers a page at its slug, so a page declared `my_plans` is read at
         `my-plans` and written back under that name: held to the declaration served there, it overwrites that one against
         its version rather than landing beside it as a second page with no version to conflict with. */
      let decl = one.value.declarations[0]!;
      if (decl.kind === 'page') {
        const at = pageDeclaredAt(slugify(decl.id.slice('page.'.length)));
        if (at && at.id !== decl.id) decl = { ...decl, id: at.id, body: { ...(decl.body as object), page: at.id.slice('page.'.length) } as never };
      }
      const expect = args.version === undefined ? undefined : { id: decl.id, version: args.version };
      return tail(await kernel.install([{ id: decl.id, kind: decl.kind, body: decl.body as never }], expect));
    },

    /** Retire one. Its rows stay; a declaration is a shape, not the things under it. */
    async retireDeclaration(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which declaration?', { at: 'id' });
      return tail(kernel.retire([args.id]));
    },

    /**
     * Run one installed rule over the rows that are already there.
     *
     * THERE IS NO UNDO, BY DESIGN. Sixty writes is not a thing to reverse from a button — the DRY
     * RUN is the undo, and it is the same walk with nothing written, which is why `dry` is a
     * parameter rather than a second method: two code paths would be two answers.
     *
     * AND IT ONLY FILLS GAPS. A row whose field the rule would set already has a value is left alone
     * and counted, because somebody put it there and the write path says a mechanism does not
     * overwrite what a person set.
     */
    /**
     * The example rows setting up planted that nobody has touched, counted by list, and how many examples somebody has.
     * `admin`, because clearing them is the owner's, and what this counts is what Clear the examples would delete.
     */
    async examples(_args: Record<string, never> | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'clear the examples');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.examples());
    },

    /** Delete every untouched example row, each as a delete the log keeps. A row somebody edited or pointed at stays. */
    async clearExamples(_args: Record<string, never> | undefined, ctx: CallContext) {
      const stop = admin(ctx, 'clear the examples');
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.clearExamples({ ...writerOf(ctx), ...(ctx.batch === undefined ? {} : { batch: ctx.batch }) }));
    },

    async ruleApply(args: { id: string; dry?: boolean; limit?: number }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which rule?', { at: 'id' });
      const out = kernel.applyRule(args.id, { ...(args.dry === undefined ? {} : { dry: args.dry }), ...(args.limit === undefined ? {} : { limit: args.limit }) });
      return args.dry ? out : tail(out);
    },

    /* ── ADMIN: WHO IS ON THE RECORD ───────────────────── */

    /**
     * Everybody on it, with what they hold and where.
     *
     * `admin`, AND IT WAS `guard(ctx, 'read')` ON THE ARGUMENT THAT A COLLEAGUE LIST IS NOT A
     * SECRET. Two things were wrong with that. The list carries every member's EMAIL ADDRESS
     * (`members.ts:159`), which is not the same fact as who is on the record; and `ROUTES` calls
     * this method ADMIN (`host/src/index.ts:79`), which `45 §5.6` defines as an owner in a browser.
     * So the route table published a ceiling that the one place authorisation actually happens did
     * not apply, and a member invited to READ ONE REGISTER could list every colleague's email.
     *
     * IT WAS THE ONLY ONE OF FOURTEEN. Every other ADMIN route calls `admin`; this called `guard`.
     * A lone disagreement with thirteen agreements is not a design, and `router-groups` could not
     * see it because that gate compares the table against `30 §5` and never against the code. The
     * `guards` gate does now, which is the repair that survives the next method somebody adds.
     */
    async members(ctx: CallContext) {
      const stop = admin(ctx, 'see who is on this record');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.members());
    },

    /**
     * Put somebody on the record, or move them.
     *
     * A LEVEL PER REGISTER, because the alternative is a product where inviting a bookkeeper means
     * showing them everything — and what people do then is not invite the bookkeeper.
     *
     * AN INVITATION IS THE WHOLE OF WHAT THEY HOLD, not a patch: a register left out of a second one
     * is a register taken away, revoked out loud rather than left standing.
     */
    async invite(args: { person?: string; email?: string; name?: string; level?: Level; registers?: Record<string, Level>; why?: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      /* AN ADDRESS AND NO PERSON IS AN INVITATION (`30 §5`, `12 §3`): a single-use link for that one address, good
         for 24 hours, handed back once to copy. Nothing is mailed, by this or by anything. */
      if (!args?.person && typeof args?.email === 'string') {
        /* A link somebody spends from anywhere outlives a machine's loopback boundary, as a bearer does. */
        if (ctx.credentialed === false)
          return {
            ok: false as const,
            refusal: {
              code: 'NEEDS_BROWSER_SESSION',
              fix: 'An invitation link works from anywhere, so minting one needs a credential. Sign in, or send BRAINDOG_TOKEN.',
              at: 'principal',
            },
          };
        /* AND ONLY WHERE SOMEBODY CAN SIGN IN TO SPEND IT. A link to a host with sign-in off is a link to a 404. */
        const why = invitations === undefined ? INVITES_OFF : invitations();
        if (why !== null) return no('NOT_IN_THIS_BUILD', why, { at: 'email' });
        return tail(
          await kernel.createInvitation(actorOf(ctx), {
            email: args.email,
            ...(args.level === undefined ? {} : { level: args.level }),
            ...(args.registers === undefined ? {} : { registers: args.registers }),
          }),
        );
      }
      return tail(kernel.invite(actorOf(ctx), (args ?? {}) as never));
    },

    /** Every invitation still waiting to be used, newest first. Never a link: those exist once, when minted. */
    async invitations(ctx: CallContext): Promise<Result<InvitationRow[]>> {
      const stop = admin(ctx, 'see the invitations waiting');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.listInvitations());
    },

    /** Withdraw one. The link stops working at once, and a second call answers as the first did. */
    async revokeInvite(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which invitation?', { at: 'id' });
      return tail(kernel.revokeInvitation(args.id));
    },

    /**
     * The invitation a link names, or, with the person a host has just verified, spend it.
     *
     * INTERNAL, AND NEVER A ROUTE. Whoever calls this with a `person` puts that person on the record, so the only
     * way here is a host's `/auth/invite`, after it has signed that person in. The token is the link's own proof;
     * the address it was minted for must be the address the person signed in with.
     */
    async acceptInvite(args: { token: string; person?: { id: string; email: string; name?: string } }): Promise<Result<unknown>> {
      if (typeof args?.token !== 'string' || !args.token) return no('REQUIRED_MISSING', 'Which invitation?', { at: 'token' });
      if (args.person === undefined) {
        const found = await kernel.lookInvitation(args.token);
        return found.ok ? ok({ email: found.value.email, expires_at: found.value.expires_at }) : found;
      }
      const { id, email, name } = args.person;
      return tail(await kernel.acceptInvitation(args.token, { person: id, email, ...(name ? { name } : {}) }));
    },

    /** Take somebody off. Never the last owner, and every register they held is revoked out loud. */
    async removeMember(args: { person: string; why?: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.person) return no('REQUIRED_MISSING', 'Who?', { at: 'person' });
      return tail(kernel.removeMember(actorOf(ctx), args.person, args.why));
    },

    /**
     * Stop somebody without deciding about them, or start them again.
     *
     * REMOVAL IS THE OTHER VERB AND IT LOSES THINGS. It deletes the membership and every level with
     * it, so restoring somebody means re-inviting them and remembering what they held. Suspension
     * keeps every row and stops all of them working — which is what you reach for when somebody has
     * left for a fortnight, or when you are not yet sure. The alternative to having it is that
     * people use removal for both and lose the second half.
     *
     * AND IT REACHES THEIR AGENTS. A token is a capability handed to an agent BY a person, so the
     * token ladder reads the suspension too; stopping somebody whose agent kept writing would be
     * the shape of half-measure that makes people distrust the whole mechanism.
     */
    async suspendMember(args: { person: string; suspended?: boolean }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.person) return no('REQUIRED_MISSING', 'Who?', { at: 'person' });
      return tail(kernel.suspendMember(actorOf(ctx), args.person, args.suspended !== false));
    },

    /* ── ADMIN: AGENT TOKENS ──────────────────────────── */

    /**
     * Mint one.
     *
     * THE SECRET IS IN THE ANSWER AND NOWHERE ELSE. What the record keeps is its hash, so a copy of
     * the database is a copy of hashes rather than a set of working keys — and nothing in this
     * product can show you a token you made last month, which is the point.
     *
     * A TOKEN IS ALWAYS SOMEBODY'S. It writes as the person who minted it and can never do more
     * than they can; the intersection is checked on every call, so a colleague whose access is
     * removed does not keep writing through a token they were issued last year.
     */
    async createToken(args: { scope: Scope; label?: string; days?: number }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      /* AND MINTING NEEDS A CREDENTIAL OF ITS OWN, which is not true of any other ADMIN method here.
         A self-host with no `BRAINDOG_TOKEN` treats an unauthenticated request as the owner — right
         for one person on one machine, where the process binds loopback and the machine is the
         boundary. This call is the one that hands out something which OUTLIVES that boundary: a
         bearer works from anywhere, for thirty days, including after the operator later sets a token
         and the process binds every interface. Anything that can reach loopback for a moment — a
         postinstall script, a container sharing the namespace, a browser talked into a request —
         walks away with a portable owner credential.

         `49 §5.2` step 7: ADMIN admits a cookie, `config.token`, or an operation grant. A request
         carrying nothing is none of the three, and this is the method where that matters. */
      if (ctx.credentialed === false)
        return {
          ok: false as const,
          refusal: {
            code: 'NEEDS_BROWSER_SESSION',
            fix: 'A bearer works from anywhere, so minting one needs a credential. Set BRAINDOG_TOKEN and send it, or open this from the app.',
            at: 'principal',
          },
        };
      /* A REPORT KEY IS MADE BY `createReportKey` ONLY. Its label is its binding, so a token labelled like one
         here would be a report key nobody chose the register of. */
      if (typeof args?.label === 'string' && args.label.startsWith(REPORT_PREFIX))
        return no('VALUE_MALFORMED', `A label that begins ${REPORT_PREFIX} belongs to a report key. Make one with createReportKey, or choose another label.`, { at: 'label' });
      return tail(await kernel.createToken(actorOf(ctx), args ?? ({} as never)));
    },

    /**
     * Mint a report key: a token that sends rows to one register and does nothing else (`report.ts`).
     *
     * OWNER-ONLY AND CREDENTIALED, for `createToken`'s reasons: it is a bearer that works from anywhere. The
     * register must exist, and every field it fixes or stamps must be one that register declares, so a key is
     * never bound to a name nothing can be written under. Values are checked when a row is written, by the
     * same write path every row takes.
     */
    async createReportKey(
      args: { register: string; fixed?: Record<string, JsonValue>; stamp?: string; name?: string; days?: number },
      ctx: CallContext,
    ) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (ctx.credentialed === false)
        return {
          ok: false as const,
          refusal: {
            code: 'NEEDS_BROWSER_SESSION',
            fix: 'A report key works from anywhere, so minting one needs a credential. Set BRAINDOG_TOKEN and send it, or open this from the app.',
            at: 'principal',
          },
        };
      const missing = named(args);
      if (missing) return { ok: false as const, refusal: missing };
      const decl = kernel.register(args.register);
      if (!decl) return no('REGISTER_UNKNOWN', `There is no list called ${args.register} for a report key to send rows to.`, { at: 'register' });
      const declared = (id: string): boolean => decl.fields.some((f) => f.id === id && f.retired !== true);
      const fixed = args.fixed ?? {};
      if (fixed === null || typeof fixed !== 'object' || Array.isArray(fixed))
        return no('VALUE_MALFORMED', 'fixed is one object: each field the key always sends, and its value.', { at: 'fixed' });
      if (Object.keys(fixed).length > REPORT_FIXED_MOST)
        return no('OUT_OF_BOUNDS', `A report key fixes at most ${REPORT_FIXED_MOST} fields.`, { at: 'fixed' });
      for (const field of Object.keys(fixed))
        if (!declared(field)) return no('FIELD_UNKNOWN', `${args.register} has no field called ${field} for a report key to fix.`, { at: `fixed.${field}` });
      if (args.stamp !== undefined) {
        const type = decl.fields.find((f) => f.id === args.stamp && f.retired !== true)?.type;
        if (typeof args.stamp !== 'string' || type === undefined)
          return no('FIELD_UNKNOWN', `${args.register} has no field called ${String(args.stamp)} to stamp with the moment a row arrives.`, { at: 'stamp' });
        if (type !== 'instant' && type !== 'day')
          return no('VALUE_MALFORMED', `${args.stamp} is a ${type} field, and a stamp is the moment a row arrives: an instant or a day.`, { at: 'stamp' });
      }
      if (args.name !== undefined && (typeof args.name !== 'string' || args.name.length > REPORT_NAME_MOST))
        return no('OUT_OF_BOUNDS', `A report key's name is text of at most ${REPORT_NAME_MOST} characters.`, { at: 'name' });
      const binding: ReportBinding = {
        register: args.register,
        ...(Object.keys(fixed).length === 0 ? {} : { fixed }),
        ...(args.stamp === undefined ? {} : { stamp: args.stamp }),
        ...(args.name === undefined || args.name === '' ? {} : { name: args.name }),
      };
      const minted = await kernel.createToken(actorOf(ctx), {
        scope: 'write',
        label: reportLabel(binding),
        ...(args.days === undefined ? {} : { days: args.days }),
      });
      if (!minted.ok) return tail(minted);
      return tail(ok({ id: minted.value.id, bearer: minted.value.bearer, register: args.register, expires_at: minted.value.expires_at }));
    },

    /** The report keys this record has issued, each with what it is bound to. Never a hash, never a bearer. */
    async reportKeys(ctx: CallContext) {
      const stop = admin(ctx, 'list the report keys this record has issued');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(
        kernel.listTokens().flatMap((t) => {
          const binding = reportBindingOf(t.label);
          return binding === null
            ? []
            : [{ id: t.id, ...binding, created_at: t.created_at, last_used_at: t.last_used_at, expires_at: t.expires_at, revoked_at: t.revoked_at }];
        }),
      );
    },

    /** Every token, with a revoke button's worth of information and never the hash. */
    async listTokens(ctx: CallContext) {
      const stop = admin(ctx, 'list the tokens this record has issued');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.listTokens());
    },

    /** Revoke one. The second call says the same as the first. */
    async revokeToken(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which token?', { at: 'id' });
      return tail(kernel.revokeToken(actorOf(ctx), args.id));
    },

    /* ── ADMIN: DEVICES, 12 §6.1 ──────────────────────── */

    /**
     * Let in the device showing these six digits.
     *
     * AN OWNER, AND NOT ANY PERSON. A login approval mints a ninety-day write token owned by the approver, which
     * is `createToken` by another road, and `createToken` is owner-only; a road with a lower bar would be the
     * easier way to the same bearer.
     *
     * AND A SIGN-IN PROVED IN THE LAST FIFTEEN MINUTES, which the kernel cannot check because only a host knows
     * when somebody proved who they are. A browser left signed in for a month should not be enough to let a
     * machine in. `provedAt` comes only from a session row: the server key carries none, and is proved on the
     * request that presents it.
     */
    async deviceApprove(args: { user_code: string }, ctx: CallContext): Promise<Result<Approved>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      /* Nothing presented is no sign-in at all, for the reason `createToken` gives. */
      if (ctx.credentialed === false)
        return {
          ok: false as const,
          refusal: {
            code: 'NEEDS_BROWSER_SESSION',
            fix: 'Approving a device hands out a bearer that works from anywhere, so it needs a credential. Sign in, or send BRAINDOG_TOKEN.',
            at: 'principal',
          },
        };
      if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
        return { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to approve a device.', at: 'principal' } };
      return tail(await kernel.deviceApprove(actorOf(ctx), args ?? ({} as never)));
    },

    /** Every device grant, named by its handle and never by the id the device polls with. */
    async listDevices(ctx: CallContext): Promise<Result<DeviceRow[]>> {
      const stop = admin(ctx, 'list the devices signed in to this record');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(await kernel.deviceList());
    },

    /** Revoke one by its handle. A login grant takes its token with it; the session that approved it stays. */
    async revokeDevice(args: { handle: string }, ctx: CallContext): Promise<Result<DeviceRow>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (typeof args?.handle !== 'string' || !args.handle) return no('REQUIRED_MISSING', 'Which device? Name it by its handle.', { at: 'handle' });
      return tail(await kernel.deviceRevoke(actorOf(ctx), args.handle));
    },

    /* ── ADMIN: THE RECORD AS A FILE ───────────────────── */

    /**
     * Take your record and go.
     *
     * THE WHOLE PROMISE, IN ONE METHOD. A `.brain` file is the record: line per row, checkable with
     * `sed` and `sha256sum`, and it imports into a fresh record and comes back out identical. A
     * product whose export is a JSON dump nobody can re-import has an export button and not an exit.
     *
     * `local` DOES NOT TRAVEL. Tokens, device grants and failed logins are facts about one
     * installation rather than about the record, and carrying them would move somebody's
     * credentials to a machine they did not authorise.
     */
    async export(args: { sections?: readonly string[]; redactGrants?: boolean; kek_id?: string }, ctx: CallContext) {
      const stop = admin(ctx, 'export this record');
      if (stop) return { ok: false as const, refusal: stop };

      /* A SECTION NOBODY HAS IS NOT AN EMPTY EXPORT. `sections: "data"` — the easy JSON mistake —
         and `sections: []` both used to come back `ok` with a structurally valid `.brain` file
         containing every table header and no rows: a backup of nothing that looks like a backup. */
      if (args?.sections !== undefined) {
        if (!Array.isArray(args.sections) || args.sections.length === 0)
          return no('VALUE_MALFORMED', `Sections are a list, and one of ${TRAVELS.join(', ')}.`, { at: 'sections' });
        const wrong = args.sections.find((x) => !(TRAVELS as readonly unknown[]).includes(x));
        if (wrong !== undefined)
          return no('ENUM_VALUE_UNKNOWN', `${String(wrong)} is not a section of a .brain file.`, {
            at: 'sections',
            allowed: TRAVELS,
          });
      }
      /* THE SEALED BYTES ARE A VAULT READ, WHEREVER THEY LEAVE FROM. `openGrant` is unrouted so a
         credential cannot be reached by anything holding a token, and this method handed out every
         grant's `ciphertext` at once. So the default is redacted.

         AND THE FULL FILE NEEDS THE WRAPPING KEY NAMED. An earlier version of this gated it on
         `vault(ctx)`, which is the SAME PREDICATE as the `admin(ctx)` two lines above — both refuse
         a token and then ask for owner — so it was not a second bar at all: any caller who reached
         this line had already cleared it, and the flag was the whole of the permission. Naming the
         `kek_id` is a bar `admin` cannot clear by definition: the bytes are wrapped by that key, so
         a caller who has it can open them anyway, and one who does not gains nothing from the file.
         It is the same check `openGrant` makes, on the path that copies every grant instead of one.

         The rows still travel under redaction: labels, what each key opens, its kind, its rotation
         dates and its scopes. What is missing is the bytes. */
      if (args?.redactGrants === false) {
        const held = kernel.wrappingKey();
        if (!held || args.kek_id !== held)
          return no(
            'WRONG_KEY',
            held
              ? `The sealed bytes are wrapped by ${held}. An export carrying them names that key.`
              : 'This record has no vault, so there are no sealed bytes to carry.',
            { at: 'kek_id' },
          );
      }

      return kernel.export({
        ...(args?.sections ? { sections: args.sections as never } : {}),
        redactGrants: args?.redactGrants !== false,
        actor: actorOf(ctx),
      });
    },

    /**
     * A file into an empty record.
     *
     * EMPTY, AND THAT IS THE WHOLE OF THE RULE. Importing into a record that already holds rows
     * would merge two businesses by primary key, and there is no answer to what that should do that
     * is better than refusing.
     */
    async import(args: { lines?: readonly string[] }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!Array.isArray(args?.lines)) return no('REQUIRED_MISSING', 'An import is the lines of a .brain file.', { at: 'lines' });
      /* AND EVERY ONE OF THEM IS A LINE. `[null]` cleared the array check and then threw out of the
         reader — across the boundary this package promises nothing throws over. */
      if (!args.lines.every((line) => typeof line === 'string'))
        return no('VALUE_MALFORMED', 'A .brain file is lines of text, and one of these is not.', { at: 'lines' });
      return tail(await kernel.import(args.lines));
    },

    /* ── ADMIN: BACKUPS, ERASURE AND DELETION ──────────── */

    /**
     * A copy of the whole record, now, kept by this host (`53 §5.4`, "snapshot now").
     *
     * AN `export` EVENT SAYS IT HAPPENED, as the Worker's nightly copy does when its upload is acknowledged (`45 §5.9`):
     * a copy of every row left the live file, and the log is where somebody asks whether anything did.
     */
    async snapshot(args: { label?: string } | undefined, ctx: CallContext): Promise<Result<Snapshot>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!snapshots) return { ok: false as const, refusal: NO_SNAPSHOTS };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['label']);
      if (extra) return { ok: false as const, refusal: extra };
      const label: unknown = args?.label ?? 'now';
      if (typeof label !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(label))
        return no('VALUE_MALFORMED', 'A label is one short lower-case word, such as nightly or final.', { at: 'label' });
      const taken = await snapshots.take(label);
      kernel.lifecycle('export', actorOf(ctx), `snapshot ${taken.id} ${taken.bytes} bytes`);
      return tail(ok(taken));
    },

    /** The copies this host keeps, newest first, each with when it was taken and how large it is. */
    async snapshots(ctx: CallContext): Promise<Result<Snapshot[]>> {
      const stop = admin(ctx, 'list the copies this record keeps');
      if (stop) return { ok: false as const, refusal: stop };
      if (!snapshots) return { ok: false as const, refusal: NO_SNAPSHOTS };
      return ok(await snapshots.list());
    },

    /**
     * Put the record back to one of the copies (`33 §9`, one method; the self-host's bookmark is a copy's id).
     *
     * WHAT IT WAS IS KEPT FIRST. A copy named `before-restore` is taken before anything is replaced, so going back is
     * itself undoable from the same list, which is `53 §5.5`'s rollback for a restore in the one form a file host has.
     *
     * A SIGN-IN IN THE LAST FIFTEEN MINUTES where the host knows when that was, because this replaces everything
     * written since the copy. The `restore.pitr` event is written after, into the restored record, or the restore
     * would rewind it too.
     */
    async restore(args: { bookmark: string; at?: string }, ctx: CallContext): Promise<Result<Restored>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!snapshots) return { ok: false as const, refusal: NO_RESTORE };
      if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
        return {
          ok: false as const,
          refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to restore this record. Going back replaces everything written since.', at: 'principal' },
        };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['bookmark', 'at']);
      if (extra) return { ok: false as const, refusal: extra };
      if (args?.bookmark === undefined || args.bookmark === null || (args.bookmark as unknown) === '')
        return no('REQUIRED_MISSING', 'Which copy? Name it as the list of backups does.', { at: 'bookmark' });
      /* A BOOKMARK THAT IS THERE AND IS NOT A STRING WAS SENT, so "which copy?" answered a question nobody asked. */
      if (typeof args.bookmark !== 'string')
        return no('VALUE_MALFORMED', `A bookmark is the id of a copy, as a string, the way snapshots lists them, and this one is not a string.`, { at: 'bookmark' });
      const kept = await snapshots.list();
      const chosen = kept.find((s) => s.id === args.bookmark);
      if (!chosen)
        return no('OUT_OF_BOUNDS', `${args.bookmark} is not one of the copies this record keeps.`, { at: 'bookmark', allowed: kept.map((s) => s.id) });

      const before = await snapshots.take('before-restore');
      try {
        await snapshots.restore(chosen.id);
      } catch (e) {
        return no('OUT_OF_BOUNDS', e instanceof Error ? e.message : String(e), { at: 'bookmark' });
      }
      kernel.reload();
      kernel.rebuildFts();
      const who = actorOf(ctx);
      kernel.lifecycle('restore.pitr', who, `restored to ${chosen.id} by ${who}; the record as it was is kept as ${before.id}`, chosen.id);
      return tail(ok({ bookmark: chosen.id, at: chosen.at, kept: before.id }));
    },

    /**
     * Erase a person (`53 §5.8`, `02 §10`). The kernel does the cascade; this is the owner's door to it.
     *
     * AN OWNER IN A BROWSER, and no token of any kind: an erasure cannot be undone, and PITR must not be used to undo it.
     */
    async erase(args: EraseRequest, ctx: CallContext): Promise<Result<EraseReport>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['subjects', 'personId', 'basis']);
      if (extra) return { ok: false as const, refusal: extra };
      return tail(await kernel.erase(args ?? ({} as EraseRequest), actorOf(ctx)));
    },

    /**
     * Delete this record (`02 §9`, `53 §5.9`): the slug typed, a recent sign-in where the host knows one, then the host.
     *
     * NOTHING RUNS AFTER THE HOST'S PART, not even the alarm's tail, because there is no record left to arm it on.
     */
    async deleteRecord(args: { slug: string }, ctx: CallContext): Promise<Result<{ slug: string; deleted: true }>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!destroy) return { ok: false as const, refusal: NO_DELETE };
      if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
        return { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to delete this record. Nothing was deleted.', at: 'principal' } };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['slug']);
      if (extra) return { ok: false as const, refusal: extra };
      if (typeof args?.slug !== 'string' || !args.slug.trim())
        return no('REQUIRED_MISSING', 'Type the name of this record to delete it.', { at: 'slug' });
      const slug = kernel.identity()?.slug ?? '';
      if (!slug || args.slug.trim() !== slug)
        return no('VALUE_MALFORMED', `Type ${slug || 'the name of this record'} exactly to delete it. Nothing was deleted.`, { at: 'slug' });
      await destroy();
      return ok({ slug, deleted: true as const });
    },
    /* ── VAULT ────────────────────────────────────────────────── */

    /** Every grant, in the order a person reads them. Sealed bytes never leave through here. */
    async listGrants(ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.grants());
    },

    /** Mint a grant, or rotate one. */
    async bindGrant(args: BindGrantArgs, ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.bindGrant(args, actorOf(ctx)));
    },

    /** The sealed bytes, and the reading counted. The record cannot open them. */
    async openGrant(args: { id: string; kek_id?: string | undefined }, ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.openGrant(args, actorOf(ctx));
    },

    /** Out of service, and the bytes destroyed. The row stays: what it opened is a fact. */
    async revokeGrant(args: { id: string }, ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.revokeGrant(args.id, actorOf(ctx)));
    },

    /**
     * Say what this record is. INTERNAL: the host calls it, and it is not in `ROUTES`.
     *
     * IT TAKES NO `CallContext` AND THAT IS THE POINT. It runs before there is anybody to check
     * against — the `member('*', 'owner')` row it writes is the row every later permission check
     * reads — so a ladder here would either refuse the first call or be a ladder with a hole in it.
     * What keeps it safe is that it is unroutable: `handlersFor` builds from the shared table, and
     * this is not in it.
     */
    async createRecord(args: CreateRecordArgs) {
      return tail(kernel.createRecord(args));
    },

    /**
     * A payload arrives at `/in/*`. INTERNAL: a host calls it, and it is not in `ROUTES`.
     *
     * IT TAKES NO `CallContext` BECAUSE THERE IS NOBODY TO BUILD ONE FROM. The caller is a bank's
     * server or a forwarding mail host, which holds no credential this record ever issued, and
     * `30 §5` lists `arrive` as INTERNAL for exactly that reason. What stands in for a principal is
     * `verified`: the host says whether anything proved the sender, and the record decides what an
     * unproved payload is allowed to do, which is to be stored and nothing else (`12 §3`).
     *
     * SO THE HOST MUST NOT BE ABLE TO OMIT THE QUESTION BY ACCIDENT. `Arrival.verified` is optional
     * in the kernel, because `pull`, `paste` and `api` arrive from a caller the record has already
     * authenticated and have no verification to report; the two channels that terminate at a public
     * door do, so this door requires the flag and the type says so. A host that forgot it would
     * otherwise have every forgery matched, which is the failure this whole path is about.
     *
     * AND IT ANSWERS THE RECEIPT, not a sentence for the sender. `serveIngest` turns every outcome
     * into 202 with an empty body: what comes back here is for the host's own logs and for the
     * tests, and a stranger is told nothing about what their bytes did.
     */
    async arrive(args: Omit<Arrival, 'verified'> & { verified: boolean }): Promise<Result<Arrived>> {
      return tail(kernel.arrive(args));
    },

    /**
     * What verifies a webhook ingest, for a host's `/in/*` door. INTERNAL, and no route reaches it.
     *
     * `null` IS "NOBODY DECLARED THIS", WHICH THE DOOR ANSWERS 404 TO, and it is the only thing a
     * stranger can learn here. A declared ingest and an undeclared one are one lookup apart, which
     * is why the door rate-limits on the path before it asks: guessing ids costs 404s and no row.
     *
     * A `pull` OR `call` INGEST IS NOT A WEBHOOK AND ANSWERS `null` TOO. Those ids are a connector's,
     * fetched by the record on a schedule; accepting a POST at one would let a stranger feed a
     * connector's register through a door meant for a bank, which is the same id with none of the
     * checks.
     *
     * `{ kind: 'path', sha256 }` IS THE DIGEST `ingestMint` KEPT, and it is answered only for an
     * ingest that still declares `verify: { kind: path }`. Measured at `15a6aa33`, before this answered
     * one: the right token posted at a twin declaring it was stored `untriaged`, because this said
     * `none` for every webhook and the door compared the segment in the clear against a token no
     * record held. The door now digests the segment first, so what is kept here is never a password:
     * `packages/host/test/ingest-shortcut.test.ts` (4) posts the digest itself as the segment and it
     * is stored `untriaged`.
     *
     * A PATH TOKEN NOBODY HAS MINTED IS ANSWERED `none`, and so is a digest minted for an earlier
     * declaration under the same id: one since retired, or one whose `verify:` was taken out on the way
     * (`heldDigest`, which deletes it). Both store every arrival `untriaged` and match none of them:
     * `12 §3` applied to a verifier nobody can check, which is better than treating the URL as proof.
     */
    async ingestVerify(args: { ingest: string }): Promise<IngestVerification | null> {
      const held = typeof args?.ingest === 'string' ? heldDigest(args.ingest) : undefined;
      const row = kernel.declarations().find((d) => d.kind === 'ingest' && d.id === `ingest.${args.ingest}`);
      if (!row) return null;
      const decl = JSON.parse(row.body) as { channel?: unknown; verify?: { kind?: unknown } };
      if (decl.channel !== 'webhook') return null;
      if (decl.verify?.kind !== 'path') return { kind: 'none' };
      return held === undefined ? { kind: 'none' } : { kind: 'path', sha256: held };
    },

    /**
     * Make the token a webhook ingest's URL carries, and show it once. ADMIN, routed as `/api/ingestMint`.
     *
     * THE SHAPE IS THE FORWARDING ADDRESS'S (`serveInbound` in `apps/worker/src/inbound.ts`), in the same order:
     * who is asking, then what is being minted for, and only then the write. Only the SHA-256 is kept, and nothing
     * here or anywhere reads the token back, so a person who loses it mints another and the new digest replaces the
     * old one in the same statement: rotation is minting again, and the token he lost stops verifying at once.
     *
     * AN OWNER, IN A BROWSER, WITH A CREDENTIAL AND A PROOF IN THE LAST FIFTEEN MINUTES. The token decides which
     * bank messages are written into his ledger at `exact` with nobody looking, so whoever holds it can put a debit
     * of their choosing into the book; that is `deviceApprove`'s reasoning and its four checks, in its order. A token
     * of any kind is refused before the level, because an agent that could mint this would be minting its own door.
     *
     * ONLY FOR A WEBHOOK THAT DECLARES `verify: { kind: path }`. A token minted for anything else is one nothing
     * reads, and the person holding it would believe the ingest was verified: the fault `verifyFault` in
     * `declare.ts` was written to close at install, and this is the same refusal at the mint.
     */
    async ingestMint(args: { ingest: string }, ctx: CallContext): Promise<Result<{ ingest: string; token: string }>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      /* THE FIX NAMES THE SERVER KEY AND NOTHING ELSE THAT IS CALLED A TOKEN. It said "Sign in, or send BRAINDOG_TOKEN"
         until the checker read it against the line above: `credentialed: false` is a self-host started without that
         variable, so there is no value to send and nobody can sign in, and the agent token a client keeps under the
         same name is refused by `admin` before this is reached. `bearerFor` in `apps/selfhost/src/server.ts` maps the
         server key to the owner with `credentialed: true`, which is the one caller this check lets through. */
      if (ctx.credentialed === false)
        return {
          ok: false as const,
          refusal: {
            code: 'NEEDS_BROWSER_SESSION',
            fix: 'A webhook token works from anywhere, and this BrainDog was started without BRAINDOG_TOKEN, so nothing here can prove who is asking. Start it with BRAINDOG_TOKEN set, then sign in from the app or send that same value as the bearer. An agent token is refused either way.',
            at: 'principal',
          },
        };
      if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
        return { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to make a webhook token.', at: 'principal' } };

      const ingest = args?.ingest;
      if (typeof ingest !== 'string' || ingest === '') return no('REQUIRED_MISSING', 'Which ingest is the token for? Name it by its id.', { at: 'ingest' });
      const row = kernel.declarations().find((d) => d.kind === 'ingest' && d.id === `ingest.${ingest}`);
      if (!row) return no('DECLARATION_UNKNOWN', `This record declares no ingest called ${ingest}.`, { at: 'ingest' });
      const decl = JSON.parse(row.body) as { channel?: unknown; verify?: { kind?: unknown } };
      if (decl.channel !== 'webhook')
        return no('VALUE_MALFORMED', `${ingest} arrives by ${String(decl.channel)}, and only a webhook is verified by a token in its URL.`, { at: 'ingest' });
      if (decl.verify?.kind !== 'path')
        return no('VALUE_MALFORMED', `${ingest} declares no verify: { kind: path }, so nothing would read a token. Declare it, then make the token.`, { at: 'ingest' });

      /* THE VERSION IT WAS MINTED AGAINST IS KEPT WITH THE DIGEST, so `heldDigest` can tell the declaration it was
         shown for from a later one under the same id. */
      const since = sql.one<{ version: number }>(
        'SELECT version FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
        row.id,
      )?.version;
      if (since === undefined) return no('DECLARATION_UNKNOWN', `This record declares no ingest called ${ingest}.`, { at: 'ingest' });
      const token = webhookSecret();
      sql.exec(
        'INSERT INTO dog_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ingestTokenKey(ingest),
        `${since}:${await sha256Hex(token)}`,
      );
      return ok({ ingest, token });
    },

    /**
     * A device asks to sign in. INTERNAL: `/auth/device` calls it, and it is not in `ROUTES`.
     *
     * NO `CallContext`, because the device has no credential yet. What stands in for one is the address it came
     * from, counted before anything is written, and the approval a person gives elsewhere.
     */
    async deviceStart(args: { reach: string; label: string; ua?: string; scope?: string }, ip: string): Promise<Result<DeviceCode> | Limited> {
      const wait = counted(`device:${ip}`);
      if (wait !== null) return { ok: false, retryAfter: wait };
      /* A PROJECT IS NAMED THE WAY A PERSON SAYS IT, `things#3`, and the grant holds its row id, which is what a
         key's `project` field holds, so the door compares like with like. */
      const said = args?.scope;
      const scope = typeof said === 'string' && said !== '*' ? (kernel.get(said)?.id ?? said) : said;
      return tail(await kernel.deviceStart({ ...(args ?? ({} as never)), ...(scope === undefined ? {} : { scope }) }));
    },

    /** The device asks again, and once approved takes its bearer, once. INTERNAL, for `/auth/device/token`. */
    async devicePoll(args: { device_code: string }): Promise<Result<DeviceWaiting | Exchanged>> {
      return tail(await kernel.devicePoll(args ?? ({} as never)));
    },

    /** A vault-grant bearer, checked before the host opens a key for an agent. INTERNAL, and no route reaches it. */
    async vaultGrant(bearer: string): Promise<Result<VaultGrant>> {
      return kernel.vaultGrant(bearer);
    },

    /**
     * A key deposited through a host's key door. INTERNAL: a door calls it once it knows who is asking, and no
     * route reaches it.
     *
     * TWO CALLERS AND ONE TRANSACTION. `/api/vault/deposit` calls it with a vault grant an agent holds, after
     * `vaultGrant`; the app's own `/api/keys/put` calls it with a browser session. The session is held to the
     * vault gate here rather than at the door, so the rule is the record's: an owner, no token of any kind, and
     * a proof under fifteen minutes old (`12 §6` rules 2 and 3).
     *
     * THE VALUE NEVER COMES HERE. This names the grant id, version and additional data the bytes must be sealed
     * for; the host seals them with its key store inside `seal`; and only sealed bytes are bound, through the
     * kernel's `depositGrant`, in one transaction with the row. The row keeps the index: its label, what it opens,
     * its kind, and for a new key its project. A key already there, named outright or found by its label within
     * reach, rotates its grant rather than becoming a second row saying the same thing.
     */
    async depositGrant(
      args: { label?: unknown; opens?: unknown; kind?: unknown; project?: unknown; credential?: unknown },
      by: VaultGrant | CallContext,
      hints: SessionHints,
      seal: (target: SealTarget) => Promise<Result<Sealed>>,
    ): Promise<Result<Deposited>> {
      /* WHICH OF THE TWO IS ASKING. A context has a principal and a grant has a scope; nothing else tells them
         apart, and `principal` is the one a grant can never grow. */
      const ctx = 'principal' in by ? by : null;
      const grant = 'principal' in by ? null : by;
      if (ctx) {
        const stop = vault(ctx);
        if (stop) return { ok: false as const, refusal: stop };
      }
      const label = typeof args?.label === 'string' ? args.label.trim() : '';
      if (!label || label.length > 120)
        return no('REQUIRED_MISSING', 'A key has a label a person would say, in 120 characters or fewer.', { at: 'label' });
      const said = typeof args.opens === 'string' ? args.opens.trim() : '';
      if (said.length > 280) return no('OUT_OF_BOUNDS', 'What a key opens is said in 280 characters or fewer.', { at: 'opens' });
      if (args.kind !== undefined && !(GRANT_KINDS as readonly unknown[]).includes(args.kind))
        return no('ENUM_VALUE_UNKNOWN', 'That is not a kind of key.', { at: 'kind', allowed: GRANT_KINDS });

      /* THE ROW THIS IS ABOUT: the one named, or the one of that label within reach. Naming a row is how a screen
         says "replace THIS key's value" without a label being the identity of anything, and a name that is not
         reached is refused rather than quietly creating a second row beside it. */
      const named = typeof args.credential === 'string' ? args.credential.trim() : '';
      const row = named === '' ? keyFor({ label }, grant) : keyFor({ credential: named }, grant);
      if (named !== '' && row === null) return unreached(grant);
      const opens = said || (typeof row?.fields.opens === 'string' ? row.fields.opens : '');
      if (!opens) return no('REQUIRED_MISSING', 'A new key says what it opens, such as a host or an account.', { at: 'opens' });

      const held = typeof row?.fields[KEY_FIELD] === 'string' ? String(row.fields[KEY_FIELD]) : null;
      const live = held === null ? null : sql.one<{ version: number; kind: GrantKind }>('SELECT version, kind FROM grant WHERE id = ? AND revoked_at IS NULL', held);
      const kind = (args.kind as GrantKind | undefined) ?? live?.kind ?? (typeof row?.fields.kind === 'string' ? (row.fields.kind as GrantKind) : 'api_token');
      const id = live && held !== null ? held : `g_${mintGrant()}`;
      const version = live ? live.version + 1 : 1;

      const key = sql.one<{ wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: string; kek_id: string | null }>(
        "SELECT wrapped, nonce, wrapped_by, kek_id FROM vault_key WHERE purpose = 'record'",
      );
      if (!key) return no('NOT_IN_THIS_BUILD', 'This record has no wrapped key, so it cannot hold a sealed value.', { at: 'credential' });

      /* The same additional data `openGrant` hands back, so what is sealed here is what opens there. */
      const sealed = await seal({ grant: id, version, aad: `${kernel.identity()?.id ?? 'self'}\u001f${id}\u001f${version}`, key });
      if (!sealed.ok) return sealed;

      const declares = (field: string) => kernel.register(KEYS)?.fields.some((f) => f.id === field && !f.retired) === true;
      /* WHERE A NEW KEY BELONGS. An agent's key goes in the grant's own project, and a person says which one, by
         spoken id or by row id; either way what is stored is the row id a key's `project` field holds, so the
         door's later scope comparisons are like with like. Neither names a project for a key that already exists. */
      const asked = typeof args.project === 'string' ? args.project.trim() : '';
      const project = grant !== null ? (grant.scope === '*' ? null : grant.scope) : asked === '' ? null : (kernel.get(asked)?.id ?? asked);
      const fields: Patch = {
        label,
        opens,
        ...(declares('kind') ? { kind } : {}),
        ...(row === null && project !== null ? { project } : {}),
      };
      const s = sealed.value;
      const out = kernel.depositGrant(
        {
          register: KEYS,
          ref: row?.id ?? null,
          field: KEY_FIELD,
          fields,
          grant: { label, opens, kind, ciphertext: s.ciphertext, nonce: s.nonce, kdf: s.kdf, wrapped_by: 'kek', kek_id: s.kek_id, bytes: s.bytes, hint: s.hint, sealed_for: { id, version } },
        },
        /* An agent's deposit is signed by its run, and a person's by the person: a person's name on an agent's
           act is the attribution a run replaces, and an agent's name on a person's act is the same mistake back. */
        { actor: ctx ? actorOf(ctx) : vaultActor(hints) },
      );
      if (!out.ok) return tail(out);
      return tail(ok({ credential: kernel.nameOf(out.value.entry.id), label, version: out.value.grant.version, rotated: version > 1 }));
    },

    /**
     * A key's sealed material for a host's key door to open. INTERNAL, like `depositGrant`, and the same two
     * callers: an agent's vault grant, or a person's browser session held to the vault gate.
     *
     * The key must be within reach; then the kernel counts the read and writes `grant.read`, signed by the run an
     * agent names or by the person themselves. The host unwraps and decrypts, and the record never holds what it
     * opens. This is the whole of `12 §6.1`'s "reveal is never a readable address": it is a call that is counted.
     */
    async openForGrant(args: { label?: unknown; credential?: unknown }, by: VaultGrant | CallContext, hints: SessionHints, kek_id: string): Promise<Result<OpenedForGrant>> {
      const ctx = 'principal' in by ? by : null;
      const grant = 'principal' in by ? null : by;
      if (ctx) {
        const stop = vault(ctx);
        if (stop) return { ok: false as const, refusal: stop };
      }
      const label = typeof args?.label === 'string' ? args.label.trim() : '';
      const credential = typeof args?.credential === 'string' ? args.credential.trim() : '';
      if (!label && !credential) return no('REQUIRED_MISSING', 'Name the key by its label, or by its spoken id such as credentials#3.', { at: 'label' });
      const row = keyFor(credential ? { credential } : { label }, grant);
      if (!row) return unreached(grant);
      const held = typeof row.fields[KEY_FIELD] === 'string' ? String(row.fields[KEY_FIELD]) : '';
      if (!held) return no('GRANT_REVOKED', `${kernel.nameOf(row.id)} holds no sealed value.`, { at: 'credential' });
      const out = kernel.openGrant({ id: held, kek_id }, ctx ? actorOf(ctx) : vaultActor(hints));
      if (!out.ok) return out;
      return ok({ ...out.value, credential: kernel.nameOf(row.id), label: typeof row.fields.label === 'string' ? row.fields.label : label });
    },

    /** A row's history: the writes that made it, each with who and when. */
    async history(args: { register: string; seq: number }, ctx: CallContext) {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop } as Result<never>;
      const row = kernel.get({ register: args.register, seq: args.seq });
      return ok(row ? kernel.history(row.id) : []);
    },

    /**
     * What points at one row: the rows of other lists whose `ref` fields name it.
     *
     * THE READ THE RECORD DID NOT HAVE. A `ref` declares `to:` and nothing declared the other
     * direction, so a person's page could show everything about the person and nothing that is
     * theirs — which is the half somebody opens a person for. Nothing is added to the data model:
     * the inverse of every reference is already stated once, on the field that declares it.
     *
     * HELD TO WHAT THE CALLER MAY READ, register by register, by the same question `list` asks. A
     * register this caller cannot read is not asked about at all, so its rows cannot be inferred
     * from a count either — and reading the row itself is the first condition, because what points
     * at a row is a fact about that row.
     */
    async backlinks(
      args: { register: string; seq: number; limit?: number; cursor?: string },
      ctx: CallContext,
    ): Promise<Result<Backlinks>> {
      const stop = guard(ctx, 'read', args?.register);
      if (stop) return { ok: false, refusal: stop };
      const extra = stray((args ?? {}) as Record<string, unknown>, ['register', 'seq', 'limit', 'cursor']);
      if (extra) return { ok: false, refusal: extra };
      /* COERCED AT THE EDGE, like `list`'s own three: these arrive from a query string a stranger
         wrote, and a refusal is a value here where an exception is not. */
      if (!Number.isSafeInteger(args?.seq) || args.seq < 1)
        return no('VALUE_MALFORMED', 'A row is named by its number, a whole number from 1.', { at: 'seq' });
      if (args.limit !== undefined && !Number.isSafeInteger(args.limit))
        return no('VALUE_MALFORMED', 'A limit is a whole number of rows.', { at: 'limit' });
      if (args.cursor !== undefined && typeof args.cursor !== 'string')
        return no('VALUE_MALFORMED', 'A cursor is the one the page above answered with.', { at: 'cursor' });
      const only = [...kernel.registers().keys()].filter((register) => readable(ctx, register) === null);
      return kernel.backlinks({
        register: args.register,
        seq: args.seq,
        only,
        ...(args.limit === undefined ? {} : { limit: args.limit }),
        ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      });
    },

    /**
     * What changed since this person last read: the read half of `markRead`.
     *
     * NEWEST FIRST AND CAPPED, because it is what a first screen draws under "since you were away", and the oldest sixty
     * lines of a month away are the wrong sixty. The whole of it, in order, is `recentHistory`.
     */
    async whatsNew(args: { cursor?: Cursor } | undefined, ctx: CallContext): Promise<Result<WhatsNew>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (args?.cursor === undefined) return ok(newsFor(ctx));
      const cursor = await cursorOf(ctx, args.cursor, 'cursor');
      if (typeof cursor !== 'number') return { ok: false, refusal: cursor };
      return ok(newsFor(ctx, cursor));
    },

    /**
     * The record's whole log, newest first, a page at a time: every change, by whom, held to what the caller may see.
     *
     * `cursor` is the one the page above answered with, and a page is short only where the walk stopped, never because
     * the caller may see less, so a `cursor` of `null` is the one sign there is nothing further down.
     */
    async recentHistory(args: { cursor?: Cursor; limit?: number } | undefined, ctx: CallContext): Promise<Result<HistoryPage>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const cursor = args?.cursor === undefined ? null : await cursorOf(ctx, args.cursor, 'cursor');
      if (cursor !== null && typeof cursor !== 'number') return { ok: false, refusal: cursor };
      const asked = args?.limit;
      if (asked !== undefined && !Number.isSafeInteger(asked))
        return no('VALUE_MALFORMED', 'A limit is a whole number of lines.', { at: 'limit' });
      const limit = Math.min(Math.max(1, asked ?? 50), 200);
      const { lines, next } = walk(ctx, cursor, 1, limit + 1);
      const events = lines.slice(0, limit);
      const last = events.at(-1);
      /* A FULL PAGE ENDS ON A LINE THE CALLER WAS SHOWN, and its cursor names that line. A page the walk cap cut short
         ends on `next`, an event they were not shown: its rowid to whoever `holdsRowids`, as before, and sealed
         for anybody else, since its id would hand them the hidden event's millisecond (`history-cursor.ts`). */
      let below: Cursor | null = null;
      if (lines.length > limit) below = last ? pointAt(ctx, last) : null;
      else if (next !== null) below = holdsRowids(ctx) ? next : await cursors.seal(next);
      return ok({ events: events.map((line) => shown(ctx, line)), cursor: below });
    },

    /**
     * What arrived and no rule filed, newest first, a page at a time: the list `counts.inbox` counts.
     *
     * AN OWNER'S, AND NO TOKEN'S. The inbox holds whatever was sent in, about any register or none, so it cannot be held
     * to a register the way the log is: a caller who may not read the whole record reads none of it. The refusal is
     * `FORBIDDEN` for all of them, and the sentence says which of the three it was.
     */
    async inbox(args: { cursor?: number; limit?: number } | undefined, ctx: CallContext): Promise<Result<InboxPage>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const owner = allows(ctx, 'owner', listName);
      if (owner) return { ok: false, refusal: { ...owner, code: 'FORBIDDEN' } };
      if (!wholeRecord(ctx))
        return no('FORBIDDEN', 'The inbox belongs to the whole record, and this caller is held to part of it.', { at: 'principal' });
      const cursor = args?.cursor;
      if (cursor !== undefined && !(Number.isSafeInteger(cursor) && cursor >= 1))
        return no('VALUE_MALFORMED', 'A cursor is the number of an arrival, a whole number from 1.', { at: 'cursor' });
      const asked = args?.limit;
      if (asked !== undefined && !Number.isSafeInteger(asked))
        return no('VALUE_MALFORMED', 'A limit is a whole number of arrivals.', { at: 'limit' });
      const limit = Math.min(Math.max(1, asked ?? 50), 200);
      const lines = kernel.inboxBefore(cursor ?? null, limit + 1);
      const arrivals = lines.slice(0, limit);
      return ok({ arrivals, cursor: lines.length > limit ? (arrivals.at(-1)?.rowid ?? null) : null });
    },

    /**
     * File one arrival from the inbox as a row in a list, and take it out of the inbox.
     *
     * AN OWNER'S, IN A BROWSER, AS THE INBOX IS. The row is an ordinary write, signed like any other, and the arrival it
     * came from is marked in the same batch. With no `fields`, the row's title is the arrival's subject, or its first line.
     */
    async fileArrival(args: { id: string; register: string; fields?: Patch }, ctx: CallContext): Promise<Result<ArrivalSettled>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      if (!wholeRecord(ctx))
        return no('FORBIDDEN', 'The inbox belongs to the whole record, and this caller is held to part of it.', { at: 'principal' });
      const extra = stray((args ?? {}) as Record<string, unknown>, ['id', 'register', 'fields']);
      if (extra) return { ok: false, refusal: extra };
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which arrival? Name it by its id.', { at: 'id' });
      if (typeof args.register !== 'string' || !args.register)
        return no('REQUIRED_MISSING', 'Which list should this be filed in? Name it by its id.', { at: 'register' });
      const fields: unknown = args.fields;
      if (fields !== undefined && (typeof fields !== 'object' || fields === null || Array.isArray(fields)))
        return no('VALUE_MALFORMED', 'The fields are an object of field names and their values.', { at: 'fields' });
      return tail(
        offRegister(
          args.register,
          kernel.fileArrival(args.id, args.register, (fields as Patch | undefined) ?? null, {
            ...writerOf(ctx),
            ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
          }),
        ),
      );
    },

    /**
     * Take one arrival out of the inbox without filing it. Its bytes are kept, and nothing else changes.
     *
     * The same owner's check as `fileArrival`, and a second call is the same answer with nothing written.
     */
    async archiveArrival(args: { id: string }, ctx: CallContext): Promise<Result<ArrivalSettled>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      if (!wholeRecord(ctx))
        return no('FORBIDDEN', 'The inbox belongs to the whole record, and this caller is held to part of it.', { at: 'principal' });
      const extra = stray((args ?? {}) as Record<string, unknown>, ['id']);
      if (extra) return { ok: false, refusal: extra };
      if (typeof args?.id !== 'string' || !args.id) return no('REQUIRED_MISSING', 'Which arrival? Name it by its id.', { at: 'id' });
      return tail(kernel.archiveArrival(args.id, actorOf(ctx)));
    },

    /**
     * Rows whose text matches, across every register the caller may see.
     *
     * The scope is passed DOWN rather than applied to the answer: a caller filtered afterwards
     * gets a short page whenever the matches were mostly in a register they cannot see, and cannot
     * tell that from there having been no matches.
     */
    async search(args: { q: string; limit?: number }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop } as Result<never>;
      /* WHAT THEY MAY READ, AND NOT WHAT THEIR CEILING REACHES. This handed `ctx.registers` down
         whole, so a search matched inside a register somebody holds `append` on and came back with
         the row's title: `list` refused that register in the same breath, and one of the two was
         wrong. The list is built from the registers this record actually declares and filtered the
         way `list` filters, so the two agree. */
      const every = [...kernel.registers().keys()];
      const registers = every.filter((id) => !readable(ctx, id));
      /* AN EMPTY LIST IS NOT NO LIST. `fts.search` reads an empty `registers` as "do not scope
         this", so handing one down would search EVERY register on behalf of somebody who may read
         none of them. Nothing matches, so nothing is asked, and no `search.empty` observation is
         written about a query that was never the record's to answer. */
      if (registers.length === 0) return ok({ hits: [], matched: {} });
      /**
       * HOW MANY MATCHED COMES BACK WITH THEM, and the answer is an object for that reason alone.
       *
       * `fts` clamps any limit to a hundred, so a hundred hits is character-for-character the answer to a
       * query with exactly a hundred matches, and every caller downstream printed the length it was handed.
       * Measured on a record at the owner's size: `revenue` drew 100 where 140 matched, `the` 100 where 304
       * did, `bake` 100 where 577 did. `list` has never had this problem because its page carries a cursor
       * and a `matched`, which is the shape copied here.
       *
       * THE COUNT IS SCOPED THE WAY THE HITS ARE. `matched` is built inside the same query, under the same
       * register ceiling, so a caller is never told about rows they may not read. A caller that hands the
       * count on as a total is therefore saying something true about what they are allowed to see.
       */
      const found = kernel.searchMatched(String(args.q ?? ''), {
        /* AND A CALLER WHO MAY READ EVERY ONE OF THEM IS NOT SCOPED AT ALL, which is the query this
           always ran for an owner. */
        ...(registers.length === every.length ? {} : { registers }),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
      });
      return ok({
        hits: found.hits.flatMap((hit) => {
          const row = kernel.get(hit.id);
          if (!row) return [];
          const title = kernel.register(row.register)?.title;
          return [{ register: row.register, seq: row.seq, title: title ? String(row.fields[title] ?? '') : '', rank: hit.rank }];
        }),
        matched: found.matched,
      });
    },

    /** What this record is at, and what is reading it. `33 §4`, line 356. */
    async version(ctx: CallContext): Promise<Result<Version>> {
      const stop = guard(ctx, 'read');
      return stop
        ? { ok: false, refusal: stop }
        : ok({
            version: versionFor(ctx),
            format: FORMAT_VERSION,
            kernel: KERNEL_MIGRATION,
            primitives: PRIMITIVES_VERSION,
            /* `||`, so the empty string is `null` too. `BRAINDOG_BUILD` is declared empty in
               `wrangler.jsonc` and overwritten at deploy; a deploy that forgets the flag leaves
               `""`, and answering `app: ""` says "this build is called nothing" rather than "I was
               not told what I am". `deploy-parity` reads the second and cannot read the first. */
            app: build?.app || null,
            spark: build?.spark ?? false,
          });
    },
  };
}

/**
 * An event id as a whole number from 1 to 2^53 - 1, for `versionFor`: two 32-bit FNV-1a passes with different offsets,
 * the first kept to 21 bits so the pair stays a safe integer.
 *
 * A HASH AND NOT A COUNTER, because every counter this record keeps is a count over lines the caller may not read. It
 * is never 0, which `versionFor` keeps for "she is shown no line at all".
 */
function idNumber(id: string): number {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (a >>> 13);
  }
  return ((a >>> 11) * 2 ** 32 + (b >>> 0)) || 1;
}

export type RecordApi = Awaited<ReturnType<typeof createRecordApi>>;
