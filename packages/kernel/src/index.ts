/**
 * The kernel: the typed record, and the only thing that writes a row.
 *
 * WHAT IT IS FOR. Everything above it — the RPC surface, the MCP tools, the web app — is a way of
 * asking. This is the thing that decides whether the answer changes the record, and it decides in
 * ONE synchronous transaction, because a write that is half applied is a record somebody has to
 * repair by hand and cannot.
 *
 * THE WRITE PATH IS A SEQUENCE AND ITS ORDER IS THE DESIGN. Resolve, coerce, validate, transition,
 * persist, record. Nothing writes a row until every check has passed, so a refusal is a value
 * returned from a transaction that never began to change anything — which is what lets a refusal
 * carry a sentence instead of a stack trace.
 *
 * EVERY WRITE LEAVES AN EVENT. Not for audit theatre: `MAX(event.rowid)` IS the record's version,
 * so "what changed since I last looked" is a range scan rather than a diff, and a row's history is
 * the rows that made it rather than a reconstruction.
 */

import type { Clock, Param, Refusal, Result, Scheduler, Sql } from '@braindog/ports';
import { clash, fixOf, no, ok, refused } from '@braindog/ports';

import { coerce, isAbsent, instant, measure, parseSpoken, range, type FieldDecl, type Json } from './coerce.ts';
import { attempt } from './tx.ts';
import { ulids, type Mint } from './ids.ts';
import { FORMAT_VERSION, applyMigrations, schemaRefusal, type SchemaState } from './migrate.ts';
import { jsonPath, compile, fieldSqlIn, addressable, isColumn, type Predicate, type Schema } from '@braindog/where';
import {
  disablePack as disableDeclaredPack,
  disabledPackFault,
  enablePack as enableDeclaredPack,
  installDeclarations,
  jcs,
  lintBatch,
  liveTarget,
  homeCurrency,
  speakingSettings,
  packSettings as declaredPackSettings,
  chosenSettings,
  REMOVED_WINDOW_DAYS,
  readPackConfig,
  retireDeclarations,
  writePackConfig,
  stageDeclarations,
  type Declaration,
  type Expected,
  type PackConfig,
  type PackToggle,
} from './declare.ts';
import { project, projectedText, rebuild, search as ftsSearch, type Hit } from './fts.ts';
import { checkBrainl, exportBrainl, importBrainl, signBrainl, type Section, type Signer } from './brainl.ts';
import {
  drainSchedule,
  due,
  pendingWork,
  reschedule,
  retryHandler,
  sweepSessions,
  type Drained,
  type Handler,
  type Remindable,
  type ScheduleKind,
} from './schedule.ts';
import { ack, enqueue, lease, unlease, type Ack, type AckDeps, type OutboxKind } from './outbox.ts';
import { ERASED, eraseSubjects, subjectsOf, type EraseReport, type EraseRequest } from './erase.ts';
import { access, invite, members, remove, type Level as MemberLevel, type Member, type MemberDeps, suspend } from './members.ts';
import {
  GONE as INVITE_GONE,
  acceptInvitation,
  listInvitations,
  lookInvitation,
  mintInvitation,
  revokeInvitation,
  secretOf as inviteSecret,
  tokenParts as inviteParts,
  type InvitationRow,
  type InviteArgs,
  type Invited,
} from './invitations.ts';
import {
  SCOPES,
  createToken,
  listTokens,
  revokeToken,
  verifyToken,
  type Minted,
  type Scope,
  type TokenDeps,
  type TokenRow,
  type Verified,
} from './token.ts';
import {
  decide,
  getGovernance,
  listGovernance,
  countGovernance,
  countOpenQuestions,
  propose as openSuggestion,
  reopen,
  keepApplied,
  questionOf,
  type Decided,
  type GovernDeps,
  type GovernRegister,
  type Proposal,
  type Verdict,
} from './govern.ts';
import { createRecord, purge, recordIdentity, type CreateRecordArgs, type Provisioned } from './provision.ts';
import { dayIn, stampFinished } from './finished.ts';
import type { StepsDecl } from './steps.ts';
import { costOf, costRank } from './weigh.ts';
import { evaluateMetric, predicateOf, scorePrediction, snapshot, unaggregatableIn, type EvalContext, type MetricDecl, type Reading } from './metrics.ts';
import { readBlock, readPage, registersOf, registersOfBlock, resolvePages, type ActivityEvent, type BlockResult, type PageBlock, type PageDecl, type PageDeps, type PageResult } from './pages.ts';
import { SETUP_KIND, setupCollapser, type FeedLine } from './feed.ts';
import {
  carryingOf,
  headline,
  nextOccurrence,
  noteEvent,
  notify,
  runDigest,
  sectionsOf,
  sendDigest,
  twoSentences,
  type Assembled,
  type DigestDecl,
  type DigestDeps,
} from './digest.ts';
import { CREATE_CEILING, applyRule, dryRun, marker, runRules, type Applied as RuleApplied, type DryRun, type RuleDecl, type RulesDeps } from './rules.ts';
import { runway, type Leg, type Runway } from './forecast.ts';
import { arrive, day, exponentOf, propose, shapeOf, type Arrival, type Arrived, type IngestDecl, type IngestDeps, type NumberReaders } from './ingest.ts';
import { analyse, observe, type Analysis, type Observation } from './observe.ts';
import { applyPull, firePull, type PullDecl, type PullDeps } from './pull.ts';
import { applyPage, writePoints, type MetricPoint, type PageWrote, type PulledPage } from './fetched.ts';
import { extractPull, type ExtractDecl, type ExtractDeps, type Extraction } from './extract.ts';
import {
  ACTION_KINDS,
  egressOf,
  fireAction,
  finishAction,
  approvalLines,
  keyNamed,
  keyReady,
  listActions,
  originsOf,
  prepareAction,
  queueCall,
  resumeAction as resumeScheduledAction,
  runActions as runScheduledActions,
  type ActionDecl,
  meter,
  type ActionDeps,
  type ActionsRun,
  type Execute,
  type Budget,
  type KeyNotReady,
  type Paged,
  type PagedReport,
  type PagedRun,
  type PullHandoff,
} from './actions.ts';
import {
  bindGrant,
  getGrant,
  listGrants,
  openGrant,
  revokeGrant,
  rotateDue,
  sealedGrant,
  type BindGrantArgs,
  type GrantRow,
  type LeasedSeal,
  type SealedGrant,
  type VaultDeps,
} from './vault.ts';
import { sparkMayWrite } from './spark.ts';
import { PEOPLE, meet as meetPerson, type MeetArgs, type Met } from './people.ts';
import { FINISHED, KERNEL_WRITTEN, REVIVED, SESSION, findSession, opening, owned, provisionalTitle, type Found, type SessionHints } from './session.ts';
import {
  deviceApprove,
  deviceList,
  devicePoll,
  deviceRevoke,
  deviceStart,
  deviceSweep,
  vaultGrant,
  type Approved,
  type DeviceCode,
  type DeviceRow,
  type Exchanged,
  type VaultGrant,
  type Waiting,
} from './device.ts';
import {
  resolveProject,
  scopeFault,
  scopeFieldOf,
  type Resolved,
  type ScopeDecl,
  type ScopesDecl,
  type Whereabouts,
} from './scope.ts';

export { FORMAT_VERSION, KERNEL_MIGRATION, MIGRATIONS, canon, checksum, statements } from './migrate.ts';
export { checkBrainl, keyIdOf, b64url, manifestBytes, signBrainl, type Signature, type Signer } from './brainl.ts';
export { SPARK, SPARK_KINDS, sparkMayWrite } from './spark.ts';
export { KERNEL_WRITTEN, STALE_MS, isStale, provisionalTitle, sessionDeclaration } from './session.ts';
export { REACHES, type Approved, type DeviceCode, type DeviceRow, type Exchanged, type Reach, type VaultGrant, type Waiting } from './device.ts';
export type { SessionHints } from './session.ts';
export type { Resolved, ScopeDecl, ScopesDecl, Whereabouts } from './scope.ts';
export { coerce, FIELD_TYPES, instant, isAbsent, isJsonQuoted, hasEscapedNewline, isRealDay, looksLikeCredential, parseSpoken, spoken } from './coerce.ts';
export type { FieldDecl, FieldType, Json } from './coerce.ts';
export { isUlid, ulids, ulidTime } from './ids.ts';
export { digest, indexesFor, indexName, jcs, registerOfIndex, validate as validateDeclaration, KINDS } from './declare.ts';
export { ftsQuery, projectedText } from './fts.ts';
export { TRAVELS, decode, encode, projection, tables } from './brainl.ts';
export { atMs, expandRepeat, offsetMs, remindersFor, shiftFrom } from './schedule.ts';
export type { Remindable, Repeat, Reminder } from './schedule.ts';
export type { ImportReport, Section, TableShape } from './brainl.ts';
export { EVENT_KINDS, isEventKind } from './events.ts';
export type { EventKind } from './events.ts';
export { OUTBOX_KINDS, backoffMs, summary } from './outbox.ts';
export type { Ack, OutboxKind, OutboxRow } from './outbox.ts';
export { ERASED } from './erase.ts';
export type { EraseReport, EraseRequest } from './erase.ts';
export { SCHEDULE_KINDS, drainSchedule, retryHandler } from './schedule.ts';
export type { CreateRecordArgs, Provisioned, Purged, WrappedKey } from './provision.ts';
export { GRANT_KINDS, spanMs } from './vault.ts';
import { GROUP_CAP } from './buckets.ts';
import { ratesFrom } from './fx.ts';
export { BUCKETS, GROUP_CAP, bucketOf, bucketRun, bucketStart, isBucket, nextBucket, shiftBucket } from './buckets.ts';
export { MEASURES_MOST, MEASURE_BACK, MEASURE_BUCKETS, localDays, measureBucket, measurePeriod, measureSeries, measureWindow, readableZone } from './measures.ts';
export type { MeasureBucket, MeasureSeries, RawReading } from './measures.ts';
export type { Bucket } from './buckets.ts';
export { dayIn, stampFinished, type FinishedDecl } from './finished.ts';
export { stepsPercent, tallySteps, type StepsDecl } from './steps.ts';
/* THE COST BAND, exported because `/decide` computes it in the browser off the same raw rows: it
   reads `governance` directly rather than through `governance.open`, and two rankings of one queue
   that disagreed would be worse than no ranking at all. */
export { COSTS, MANY_ROWS, costOf, costRank, worseCost, type Cost } from './weigh.ts';
export { AGGREGATIONS, bucketState, deltaFrom, evaluateMetric, fxOfPair, largestFirst, meets, rateUnit, scorePrediction, snapshot, targetCurrency, targetFor, targetInto, targetOf, windowMs } from './metrics.ts';
export { HOME_CURRENCY_SETTING, across, convertMinor, dayFieldOf, homeFrom, pairParts, partsOf, rateFor, ratesFrom, reduceOf } from './fx.ts';
export type { Across, Amount, Part, Rate, Reduce } from './fx.ts';
export { fill, readBlock, readPage, resolvePages, slugify } from './pages.ts';
export {
  CHANNELS,
  carryingOf,
  headline,
  inQuietHours,
  localParts,
  nextOccurrence,
  render,
  runDigest,
  sectionsOf,
  sendDigest,
  twoSentences,
} from './digest.ts';
export { CREATE_CEILING, applyRule, dryRun, fill as fillTemplate, marker, order as orderRules, runRules } from './rules.ts';
export { runway } from './forecast.ts';
export { SERIES_AHEAD, SERIES_BACK, SERIES_LINES, barsOf } from './series.ts';
export { SETUP_KIND, setupCollapser, type FeedLine } from './feed.ts';
export type { Bars, SeriesLine } from './series.ts';
export { ARRANGING, BODY_KINDS, GOVERNANCE, OPEN_ARRANGEMENTS, PACK_VERBS } from './govern.ts';
export { MET_CAP, PEOPLE } from './people.ts';
export type { MeetArgs, Met } from './people.ts';
export { SCOPES, DEFAULT_DAYS as TOKEN_DAYS } from './token.ts';
export { LEVELS as MEMBER_LEVELS, RECORD as WHOLE_RECORD } from './members.ts';
export type { Member } from './members.ts';
export { GONE as INVITE_GONE, INVITE_HOURS, tokenParts as inviteTokenParts } from './invitations.ts';
export type { InvitationRow, InviteArgs, Invited } from './invitations.ts';
export type { Minted, Scope, TokenRow, Verified } from './token.ts';
export type { Arranging, Decision, Decided, Proposal, Suggestion, Verdict, GovernRegister, BodyKind } from './govern.ts';
/* `exponentOf` IS EXPORTED SO THE RECORD'S CURRENCY TABLE IS NOT A SECOND EXPONENT READER. It is
   `Intl`, cached per code; a table built from a copy of it could disagree with the reading. */
export { CHANNELS as INGEST_CHANNELS, CONFIDENCES, PROPOSE_AT, arrive, day as ingestDay, exponentOf, extract as extractField, resolve as extractOutcome, shapeOf } from './ingest.ts';
export { SIGNALS, WINDOWS, analyse, findingsFrom, observe } from './observe.ts';
export { FLOOR_MS, applyPull, checkInterval, firePull, intervalMs, jitterMs } from './pull.ts';
export { applyPage, writePoints } from './fetched.ts';
export { extractPull } from './extract.ts';
/* `43 §4.5`'s coercion. `extract` is rank 9 and this is 7, so that edge points down and the reader of a
   structured row calls this rather than growing a second table (`31 §2`). */
export { MAP_TYPES, mapField, select, type MapDeps, type Mapped, type Mapping } from './map.ts';
export type { ExtractDecl, ExtractDeps } from './extract.ts';
export type { MetricPoint, PageWrote, PulledPage, PulledRow } from './fetched.ts';
export type { Fired as PullFired, PullDecl, PullDeps } from './pull.ts';
export { ACTION_KINDS, ACTION_MAX_BYTES, ACTION_TIMEOUT_MS, KEYS_REACH_ALL, RULE_CALLS_PER_DAY, actionJitterMs, answerHash, approvalLines, egressOf, originsOf, reserveFor } from './actions.ts';
export type {
  ActionAnswer, ActionDecl, ActionKind, ActionRequest, ActionRow, ActionsRun, CallQueued, Egress, Execute,
  /* The connector runner's half: what a paging job looks like, and what a host wires to run one. */
  Paged, PagedReport, PagedRun, PullHandoff,
  /* What one invocation has left to spend, when the host it runs on counts requests. */
  Budget,
  /* Why a key cannot carry an approval, and what to do about it. */
  KeyNotReady,
} from './actions.ts';

/**
 * Several declarations proposed as one change, so one press installs and arms all of them.
 *
 * A PACK UPDATE THAT ADDS TWO ACTIONS IS ONE QUESTION, not two. `install` takes a bundle wherever it takes a declaration.
 */
export type DeclarationBundle = { declarations: Declaration[] };
export type { Analysis, Counted, Finding, Observation, Signal } from './observe.ts';
export type { Arrival, Arrived, Confidence, Extracted, Extractor, FieldOutcome, IngestDecl, IngestDeps, NumberReaders } from './ingest.ts';
export type { ForecastDeps, Leg, Runway, Step } from './forecast.ts';
export type { DryRun, Fired, RuleAction, RuleDecl, RulesDeps, RulesOutcome } from './rules.ts';
export type { Assembled, Channel, DigestDecl, DigestDeps, DigestPart, DigestSection, Sent } from './digest.ts';
export type { BlockResult, PageBlock, PageDecl, PageDeps, PageResult, QueueOption, QueueQuestion } from './pages.ts';
export type { Aggregation, EvalContext, FxRead, Group, Lookups, MetricDecl, Reading, Scored, Snapshot, TargetIn, Value } from './metrics.ts';
export type { BindGrantArgs, GrantKind, GrantRow, LeasedSeal, SealedGrant } from './vault.ts';
export type { Claimed, Drained, Handler, ScheduleKind } from './schedule.ts';
export type { Hit } from './fts.ts';
export type { ConfigDecl, ConfigType, Declaration, DeclKind, Expected, Installed, PackConfig, PackToggle } from './declare.ts';
export { CONFIG_TYPES, configReads, configValue, fillConfig, readConfig } from './declare.ts';

/**
 * One pack as `packStates()` reads it. `version` is `null` for a pack the seed owns by its body, which
 * has no `pack` row to carry one; `registers` are the ones it holds while on and the ones it went off with.
 */
export type PackState = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

/**
 * One saved view: a register's way of looking at itself, as `views()` and `view()` read it.
 *
 * `02 §5` calls a saved view a named predicate on the register, and this is that predicate with the
 * three other things a person adjusted beside it. It belongs to a register — that is the first half
 * of its key — so a view can never be read against a register it was not saved on, which is what
 * made the page declaration it replaced ambiguous.
 *
 * `filter` IS `null` FOR NO FILTER AND NEVER `{}`. A view with no filter shows the whole register; a
 * view whose predicate is an empty group shows nothing, and the two must not be one value.
 */
export type ViewRow = {
  register: string;
  id: string;
  name: string;
  filter: Predicate | null;
  search: string | null;
  /** The sort the person was looking at, as `list` takes it. Stored as `sort`: `order` is reserved in SQLite. */
  order: { field: string; dir: 'asc' | 'desc' }[];
  /** The columns kept, in the order they were kept. Empty means the register's own default. */
  columns: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** The columns a view is read back from, in one place, because three statements select them. */
const VIEW_SELECT = 'SELECT register, id, name, filter, search, sort, columns, created_by, created_at, updated_at';

/** A view as the row it is: the four adjustable parts are text in the database and shapes above it. */
type ViewStored = {
  register: string;
  id: string;
  name: string;
  filter: string | null;
  search: string | null;
  sort: string;
  columns: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * A view's name, and the grammar is the register's own: lower-case, and readable in a URL.
 *
 * A PERSON CHOOSES IT, which is why it is checked rather than minted. `views.overdue` is a name
 * somebody types into a link and says out loud, and a minted id would make every saved view a string
 * nobody can remember and every link unreadable.
 */
const VIEW_ID = /^[a-z][a-z0-9-]{0,39}$/;

/** What one register may hold, so a list of views stays a list rather than a second register. */
const VIEWS_PER_REGISTER = 50;
const VIEW_COLUMNS_CAP = 40;

/**
 * A stored list, or an empty one.
 *
 * IT DOES NOT THROW ON DAMAGE, and that is the whole reason it exists. A view whose stored order is
 * not JSON is one broken row, and parsing it inline would take the entire `views` read down with it —
 * so the one thing a person needs to do about a broken view, which is see it and take it off, would be
 * the one thing they could not do.
 */
const parsedList = <T>(text: string): T[] => {
  try {
    const out: unknown = JSON.parse(text);
    return Array.isArray(out) ? (out as T[]) : [];
  } catch {
    return [];
  }
};

/** A stored view, as the shape a caller was handed. A filter that will not parse reads as no filter. */
const viewOf = (r: ViewStored): ViewRow => {
  let filter: Predicate | null = null;
  if (r.filter !== null)
    try {
      filter = JSON.parse(r.filter) as Predicate;
    } catch {
      filter = null;
    }
  return {
    register: r.register,
    id: r.id,
    name: r.name,
    filter,
    search: r.search,
    order: parsedList<{ field: string; dir: 'asc' | 'desc' }>(r.sort),
    columns: parsedList<string>(r.columns),
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
};

/* ── what a register says about itself ───────────────────────────────────── */

export type RegisterDecl = {
  id: string;
  name: string;
  /** The field whose value is the row's title — what a search matches and a `ref` displays. */
  title: string;
  fields: readonly (FieldDecl & {
    required?: boolean;
    unique?: boolean;
    immutable?: boolean;
    derived?: boolean;
    retired?: boolean;
    default?: Json;
    /**
     * Never write this field's VALUES into the ledger, only that it changed.
     *
     * `secret` AND `money` ARE ON THE LIST WITHOUT ASKING. An audit log is read by everybody who
     * can read the record, and a per-field history of what somebody was paid is a salary disclosed
     * to the whole team by the feature that exists to make the record trustworthy.
     */
    redact?: boolean;
    /** Where a row applies: a `ref` to a project, or a list of them. One field per register. */
    scope?: ScopeDecl;
    /** Bounds: UTF-8 bytes on text and documents, the value on numbers (`02 §5`). */
    min?: number;
    max?: number;
    /** Required while another field of the row holds this value. */
    required_when?: { field: string; is: Json };
    /** `decide`: once the row is made, only an accepted proposal changes the field. */
    by?: 'decide';
    /** On an enum: the moves out of each value, what a move needs filled, and `by` for one only a proposal makes. */
    transitions?: Readonly<Record<string, { to: readonly string[]; requires?: readonly string[]; by?: 'decide' }>>;
  })[];
  /** The enum field mirrored onto `entry.state`, when the register has one. */
  state?: string;
  /** The states that mean finished. A row in one is `done` to every reader. */
  done?: readonly string[];
  /** A day field the record fills when a row enters a `done` state and empties when it leaves one (`finished.ts`). */
  finished?: string;
  /** A series has no spoken number: its rows are points, and nobody says a point out loud. */
  series?: boolean;
  /** What a row's spoken id starts with, `S` for `S42`. Absent or `#` is `register#42` only. */
  seq_prefix?: string;
  /** On the one register whose rows are projects: the fields listing each one's repositories and folders. */
  scopes?: ScopesDecl;
  /** Its rows are steps of the row a `ref` field points at, done when a `bool` field is true (`steps.ts`). */
  steps?: StepsDecl;
};

export type Entry = {
  id: string;
  register: string;
  seq: number | null;
  fields: Record<string, Json>;
  state: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Patch = Record<string, unknown>;

/**
 * What points at one row, grouped by the FIELD that points.
 *
 * ONE GROUP PER RELATION AND NOT PER REGISTER, because two fields of one register can name the same
 * row and mean different things: an update's `track` is what it is about and its `supersedes` is what
 * it replaces, and a reader who is shown them in one list is being told they are one thing.
 *
 * `matched` IS THE WHOLE COUNT AND `rows` IS THE PAGE, so a caller can say "All 12" without asking
 * for twelve rows it is not going to draw.
 */
export type BackGroup = { register: string; field: string; matched: number; rows: Entry[] };

/** `backlinks`: the row that was asked about, what points at it, and where the next page starts. */
export type Backlinks = {
  to: { register: string; seq: number | null; id: string | null };
  from: BackGroup[];
  cursor: string | null;
};

export type WriteContext = {
  /**
   * Who. `p_…` for a person, a mechanism name for the record's own paths. On a token's write it is
   * what the events carry only when no run can be opened, which the ladder records as a defect.
   */
  actor: string;
  /** One sentence a person reads in six weeks. Not a commit message. */
  note?: string;
  /** Compare-and-set. A write against a stale version is refused, never merged. */
  version?: number;
  /** Groups the events of one write, and of a rule's re-entry into it. */
  batch?: string;
  /**
   * The caller's own id for this write.
   *
   * A REPLAY RETURNS THE ORIGINAL RESULT rather than writing again. An agent that retries a request
   * whose answer it did not receive is the ordinary case, and without this the retry is a second
   * row — the duplicate-invoice failure, from the client side.
   */
  opId?: string;
  /**
   * Whether the rules pass runs after this write. `false` is what a rule's own write carries.
   *
   * A RULE IS ONE STEP. One rule cannot trigger another, so nothing here loops — every product that
   * allowed it grew a depth limit and then a graph explorer to explain the depth limit.
   */
  cascade?: boolean;
  /**
   * Field ids beginning `_`, written by the kernel and never by a caller.
   *
   * A GENERATED ROW HAS TO SAY WHAT GENERATED IT, or a rule that runs twice makes the size run
   * twice. `_rule`, `_parent` and `_each` are the tuple under `entry_created_by`, and stamping them
   * here rather than letting them through `patch` is what keeps "a caller may not write `_x`" true
   * while the record still can.
   */
  stamp?: Record<string, Json>;
  /**
   * Who is behind the write, when the caller knows. A token's write runs the session ladder and is
   * signed by the run it resolves to, `S42` (`30 §3`). Every other principal keeps `actor` as given,
   * which is how a person in a browser is never a run.
   */
  principal?: { kind: 'person' | 'token' | 'system'; token?: string | undefined } | undefined;
  /** What an agent says about its run. Read for a token's write only. */
  session?: SessionHints | undefined;
};

const RESERVED = new Set(['id', 'seq', 'register', 'created_at', 'updated_at', 'version', 'spoken', 'title']);

/** One line of the log as the record-wide reads scan it: the event, with its values parsed. */
export type EventLine = {
  rowid: number;
  id: string;
  ts: string;
  actor: string;
  kind: string;
  target: string | null;
  target_kind: string | null;
  field: string | null;
  from: Json | null;
  to: Json | null;
  note: string | null;
  /** The write that caused it: every line one write made shares it, and `null` for a line written on its own. */
  batch: string | null;
};

/**
 * One arrival no rule filed, as the inbox shows it: who sent it, what it says, and why it is waiting.
 *
 * NOT THE ROW. `sha256` is the host's fact about the bytes and `headers` is whatever a mail server sent, so the three
 * headers a person reads are taken out of it and the rest stays behind.
 */
export type InboxLine = {
  rowid: number;
  id: string;
  ts: string;
  channel: string;
  from: string;
  to: string;
  subject: string;
  body: string | null;
  state: 'untriaged' | 'review';
  reason: string | null;
};

/**
 * What filing or archiving an arrival did: the arrival, the state it is in now, the row it became when it was filed,
 * and whether it was already so, in which case nothing was written.
 */
export type ArrivalSettled = { id: string; state: 'matched' | 'ignored'; entry: Entry | null; already: boolean };

/** A page's place in the rail, when its declaration gives one in the shape `{ section, order }`. */
const navOf = (nav: unknown): { section: string; order: number } | null => {
  if (typeof nav !== 'object' || nav === null) return null;
  const { section, order } = nav as { section?: unknown; order?: unknown };
  return typeof section === 'string' && section !== '' ? { section, order: typeof order === 'number' ? order : 0 } : null;
};

/**
 * What only the kernel's own paths say about a write, and so is not on `WriteContext`, which a caller
 * fills in.
 *
 *   `decided`  the write carries out an accepted proposal: the one way a field or a move declared
 *              `by: 'decide'` changes. Governance's accept path sets it.
 *   `seal`     the vault door. `depositGrant` binds the key's grant inside the write, once the run
 *              signing it is known, and points `field` at it. No patch names a secret field.
 */
type Door = {
  decided?: boolean;
  seal?: { field: string; bind: (actor: string, held: string | null) => Result<GrantRow> };
};

/* ── the record ──────────────────────────────────────────────────────────── */

export type Kernel = ReturnType<typeof makeKernel>;

/**
 * What a record is opened with, beyond its storage and its clock.
 *
 * NO FACTOR TABLES. They were handed in here, and no host handed one in, so a figure that multiplies
 * by one failed on every real record. A metric carries its own now (`MetricDecl.lookups`).
 */
export type RecordOptions = {
  /**
   * The outbox kinds this deployment can deliver. Absent is all of them.
   *
   * THE DOORBELL RINGS FOR WORK SOMEBODY CAN DO. Without it, one `infer.draft` on a deployment with
   * no Spark made every subsequent write for the life of the record ring the queue and buy a lease
   * pass that claimed nothing.
   */
  delivers?: readonly OutboxKind[] | undefined;
  /**
   * What signs an exported file, when this deployment holds a signing key.
   *
   * IT IS A CALLBACK AND NOT A KEY. `12 §6` puts the key hierarchy in the host and the kernel holds
   * sealed bytes it cannot open, so the shape is: the kernel makes the bytes, something outside
   * signs them, and `signBrainl` joins the two. Nothing in this package can sign anything, and
   * nothing in it can be made to by passing it the wrong argument.
   *
   * ABSENT MEANS THE FILE IS UNSIGNED, and `41 §5.11` step 3 will not import it — which is the
   * honest state of a deployment with no key rather than a special case. A record that cannot sign
   * cannot make a file anybody can verify, and saying so at export is better than at import.
   */
  sign?: Signer | undefined;
  /**
   * `43 §4.3`'s money, int and decimal, read by `@braindog/extract`, when the caller wired them.
   *
   * THEY ARE CALLBACKS FOR THE SAME REASON `sign` IS. Those readers are rank 9 and this package is
   * 7, so the edge would point up `31 §2`'s order; `@braindog/record` is rank 11, may reach both,
   * and is the one production caller of `openRecord`. Nothing in this package can read a currency
   * out of a payload, and nothing in it can be made to by passing it the wrong argument.
   *
   * ONE KEY AND NOT THREE, and all three or none: `NumberReaders`'s own paragraph sets out what a
   * record without them reads, which is wrong against `43 §4.3` in five ways. Money's gap is a
   * currency table — without one, `VAT 500` and `EGP 500` are the same three letters beside a
   * number — and a record that fixed the two it could reach locally would read its integers by
   * one grammar and its amounts by another.
   */
  numbers?: NumberReaders | undefined;
  /**
   * `43 §4.3`'s literal rule for `enum` and `lookup`, read by `@braindog/extract`'s
   * `matchLiterals`, when the caller wired it: the longest literal present as a whole token, and
   * `'ambiguous'` for two of equal length with different values.
   *
   * SAME SEAM AND SAME REASON AS `numbers`. It is rank 9 and the reader of an arrival is rank 7,
   * so it is handed down rather than imported (`31 §2`). Absent is `String.includes` and no
   * ambiguity at all, which read `coin` as the literal `in` and settled two literals both present
   * by the order `Object.keys` gave them.
   */
  literals?: IngestDeps['literals'];
  /**
   * `43 §4.3`'s `date`, read by `@braindog/extract`'s `scanDates`, when the caller wired it.
   *
   * SAME SEAM, DIFFERENT COST. The other readers replace a reading that is wrong; this one
   * replaces one that is behind — `ingest.ts` reads four formats and `43 §9.3`'s table has seven
   * plus an `nth` row. Absent, `declare.ts` refuses the formats it cannot read and says the repair
   * is a deploy, so the gap has never been silent. Wired, it is not a gap.
   */
  dates?: IngestDeps['dates'];
  /**
   * `43 §5.7`'s `isDuplicate`, when the caller wired it: whether two rows are one event.
   *
   * THE SEAM IS HERE BECAUSE THE FOLD IS THE GRAMMAR'S. `existingRow` can narrow on the `on:`
   * fields and the ±1 day window in SQL, and it does; what it cannot do is decide that
   * `CAFÉ NERO` and `cafe nero` are one merchant, which is `§5.7` step 2 and lives at rank 9.
   * Absent, a `near` key finds no existing row and the second copy of a transaction is written —
   * the direction a person can see and undo.
   */
  duplicate?: IngestDeps['duplicate'];
  /**
   * `43 §5.1` step 4, when the caller wired it: the body in the shape every form reads it.
   *
   * THE ONE MEMBER OF THIS SEAM THAT IS NOT A READER, and the one with a security argument under
   * it. Four zero-width code points and sixteen space-like ones are a character set the kernel has
   * no business holding, which is `§14`'s test; and a zero-width space is invisible to the person
   * reading the arrival and visible to `indexOf`, so unwired an amount inside `EGP` walks past an
   * anchor, an `enum` literal and a `match:` while the message reads correctly on screen (`§8`).
   * Absent, the body is read exactly as it arrived.
   */
  normalise?: IngestDeps['normalise'];
};

/* A SORTED PAGE'S CURSOR: `~` then the order it belongs to, the last row's value under each sort key and its id, as
   base64url JSON. The `~` keeps it apart from the record order's `<when>|<id>`, which can never start with one. */
const SORTED_CURSOR = '~';

/** The field types a sorted list orders without regard to case, as the sample does (`compareRows`). */
const TEXT_SORTED = new Set(['text', 'document', 'url', 'email', 'enum']);

function orderKeyOf(order: readonly { field: string; dir?: 'asc' | 'desc' }[]): string {
  return JSON.stringify(order.map((o) => [o.field, o.dir === 'asc' ? 'asc' : 'desc']));
}

function sortCursor(order: string, values: unknown[]): string {
  const k = values.map((v) => (typeof v === 'bigint' ? Number(v) : v));
  let bin = '';
  for (const b of new TextEncoder().encode(JSON.stringify({ o: order, k }))) bin += String.fromCharCode(b);
  return SORTED_CURSOR + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The key values a sorted cursor carries, or `null` for one that is not a cursor for this order. */
function readSortCursor(cursor: string, order: string): Param[] | null {
  try {
    const bin = atob(cursor.slice(SORTED_CURSOR.length).replace(/-/g, '+').replace(/_/g, '/'));
    const said = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as {
      o?: unknown;
      k?: unknown;
    };
    if (said?.o !== order || !Array.isArray(said.k)) return null;
    if (!said.k.every((v) => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) return null;
    return said.k as Param[];
  } catch {
    return null;
  }
}

export async function openRecord(sql: Sql, clock: Clock, opts: RecordOptions = {}): Promise<Kernel> {
  const { state } = await applyMigrations(sql, clock);
  return makeKernel(sql, clock, state, opts);
}

function makeKernel(sql: Sql, clock: Clock, state: SchemaState, opts: RecordOptions) {
  const mint: Mint = ulids(() => clock.now());
  /* Bound here because `export`'s own parameter is called `opts` too, and a signer read off the
     wrong one is a file that silently goes out unsigned. */
  const signer = opts.sign;
  let depth = 0;

  /** The active declarations, parsed once. Rebuilt when a declaration changes and never otherwise. */
  let registers = new Map<string, RegisterDecl>();
  /** Each spoken prefix other than `#`, to the register that speaks it. */
  let prefixes = new Map<string, string>();

  function reload(): void {
    registers = new Map();
    prefixes = new Map();
    const rows = sql.all<{ id: string; body: string }>(
      "SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0",
    );
    for (const row of rows) {
      const decl = JSON.parse(row.body) as RegisterDecl;
      /**
       * TWO SPELLINGS OF ONE FLAG, MADE ONE HERE, and until now only one of them did anything.
       *
       * `02 §1` publishes a register-level `search: [field, field]`, and `declare` validates it
       * carefully: the names must exist and each type must be one the index can take, with its own
       * refusal for a `money` field named there. Then nothing read it. The projection asks each
       * field for its own `search: true` flag, so a register declared the documented way was
       * indexed on nothing and its rows were findable by no text at all, with every check green.
       *
       * NORMALISED WHERE THE DECLARATION BECOMES THE REGISTER, rather than at the two places that
       * project, because a rule applied at some of its readers is the shape this defect already
       * has. Downstream still reads `f.search` and needs to know nothing about the other spelling.
       */
      const said = (decl as unknown as { search?: unknown }).search;
      const named = Array.isArray(said) ? (said as string[]) : null;
      if (named)
        decl.fields = decl.fields.map((f) => (named.includes(f.id) ? { ...f, search: true } : f)) as typeof decl.fields;
      registers.set(decl.id, decl);
      if (decl.seq_prefix !== undefined && decl.seq_prefix !== '#') prefixes.set(decl.seq_prefix, decl.id);
    }
  }
  reload();

  /**
   * One transaction, and a re-entrant call runs inside its caller's.
   *
   * `33-CONTRACTS` §1 says the driver never nests, so the depth counter is here: a rule writing a
   * row from inside a write shares that write's transaction, and its events share the batch.
   */
  const transaction = <T>(fn: () => T): T => {
    if (depth > 0) return fn();
    return sql.transactionSync(() => {
      depth++;
      try {
        return fn();
      } finally {
        depth--;
      }
    });
  };

  /**
   * The next number for a counter.
   *
   * IN A TRANSACTION ONLY, and it throws otherwise: a number allocated in a call that then refuses
   * is a number that is gone, and a register whose numbering has holes is one people stop trusting.
   * A purged row's number is never reissued either — the counter travels in the export.
   */
  function allocate(name: string): number {
    if (depth === 0) throw new TypeError(`allocate(${name}) outside a transaction`);
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    const row = sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name);
    if (!row) throw new TypeError(`counter ${name} vanished mid-transaction`);
    return row.n;
  }

  const hydrate = (row: Record<string, unknown>): Entry => ({
    id: String(row.id),
    register: String(row.register),
    seq: row.seq === null || row.seq === undefined ? null : Number(row.seq),
    fields: JSON.parse(String(row.fields ?? '{}')) as Record<string, Json>,
    state: row.state === null || row.state === undefined ? null : String(row.state),
    version: Number(row.version),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
  });

  const COLUMNS = 'id, register, seq, fields, state, version, created_at, updated_at, deleted_at';

  function byId(id: string, includeDeleted = false): Entry | null {
    const row = sql.one<Record<string, unknown>>(`SELECT ${COLUMNS} FROM entry WHERE id = ?`, id);
    if (!row) return null;
    const entry = hydrate(row);
    return !includeDeleted && entry.deleted_at ? null : entry;
  }

  function bySeq(register: string, seq: number, includeDeleted = false): Entry | null {
    const row = sql.one<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM entry WHERE register = ? AND seq = ?`,
      register,
      seq,
    );
    if (!row) return null;
    const entry = hydrate(row);
    return !includeDeleted && entry.deleted_at ? null : entry;
  }

  /** A row, addressed the way the caller happens to have it. */
  function get(ref: string | { register: string; seq: number }, opts: { includeDeleted?: boolean } = {}): Entry | null {
    /* AN ADDRESS WITH NO REGISTER OR NO NUMBER NAMES NO ROW. `GET /api/get` with neither bound `undefined`
       into SQLite and answered 500 INTERNAL; there is no row at no address, which is the answer. */
    if (typeof ref !== 'string')
      return ref !== null && typeof ref === 'object' && typeof ref.register === 'string' && Number.isSafeInteger(ref.seq)
        ? bySeq(ref.register, ref.seq, opts.includeDeleted)
        : null;
    const said = parseSpoken(ref) ?? prefixed(ref);
    return said ? bySeq(said.register, said.seq, opts.includeDeleted) : byId(ref, opts.includeDeleted);
  }

  /** A row by the words in its title field, for a row id or spoken id a declaration holds; `null` when there is no such row or no title. */
  function titleOfRow(ref: string): string | null {
    const row = get(ref, { includeDeleted: true });
    const field = row ? registers.get(row.register)?.title : undefined;
    const said = row && field ? row.fields[field] : undefined;
    return typeof said === 'string' && said.trim() !== '' ? said.trim() : null;
  }

  /**
   * THE EXAMPLES NOBODY HAS TOUCHED, read from the log rather than from a flag a write could forget to clear.
   *
   * A row is an untouched example when it is live, carries `example` in its tags, ARRIVED with that tag (its `create`
   * event says so, so a real row somebody tagged later is never one), and every later event on it is an edit that only
   * pointed it at another example, which is what setting up a use case does when it links its examples to each other.
   * Any other event (an edited value, a move, a note, a tag, a restore) makes it touched, and so does a live row that is
   * not an example naming it: deleting a project a real task belongs to would take the task's project away.
   *
   * A ROW FORMED AROUND WHAT THE PERSON SAID IS NOT AN EXAMPLE HERE AT ALL. The Guide plants the plan somebody's own words
   * asked for as example rows, tagged `formed` beside `example` (`seed` `carriedDocument`); it is neither cleared nor
   * counted, and it counts as a row of theirs when it names an example.
   */
  function untouchedExamples(): { untouched: Entry[]; touched: number } {
    const tagged = sql.all<{ id: string; deleted_at: string | null }>(
      "SELECT DISTINCT e.id, e.deleted_at FROM entry e, json_each(e.fields, '$.tags') t WHERE json_type(e.fields, '$.tags') = 'array' AND t.value = 'example'" +
        " AND NOT EXISTS (SELECT 1 FROM json_each(e.fields, '$.tags') f WHERE f.value = 'formed')",
    );
    const examples = new Set(tagged.map((r) => r.id));
    const idOf = (raw: string | null): string | null => {
      if (raw === null) return null;
      let v: unknown;
      try {
        v = JSON.parse(raw);
      } catch {
        v = raw;
      }
      return typeof v === 'string' ? v.replace(/^[a-z][a-z0-9_]*#(?=[0-9A-HJKMNP-TV-Z]{26}$)/u, '') : null;
    };
    const untouched: Entry[] = [];
    let touched = 0;
    for (const { id, deleted_at } of tagged) {
      if (deleted_at !== null) continue;
      const events = sql.all<{ kind: string; to_v: string | null }>('SELECT kind, to_v FROM event WHERE target = ? ORDER BY rowid', `entry:${id}`);
      const created = events[0];
      let arrived = false;
      if (created?.kind === 'create' && created.to_v !== null)
        try {
          const tags = (JSON.parse(created.to_v) as { tags?: unknown }).tags;
          arrived = Array.isArray(tags) && tags.includes('example') && !tags.includes('formed');
        } catch {
          arrived = false;
        }
      /* A LIST OF REFS IS LINKED TOO, when every row it names is an example: a founder's organisation holding its account. */
      const linkedTo = (raw: string | null): boolean => {
        let v: unknown = null;
        try {
          v = raw === null ? null : JSON.parse(raw);
        } catch {
          v = null;
        }
        if (Array.isArray(v)) return v.length > 0 && v.every((one) => typeof one === 'string' && examples.has(idOf(JSON.stringify(one)) ?? ''));
        return examples.has(idOf(raw) ?? '');
      };
      const onlyLinked = events.slice(1).every((e) => (e.kind === 'edit' || e.kind === 'link') && linkedTo(e.to_v));
      const named = sql
        .all<{ id: string }>('SELECT id FROM entry WHERE deleted_at IS NULL AND id <> ? AND instr(fields, ?) > 0', id, id)
        .some((r) => !examples.has(r.id));
      const row = arrived && onlyLinked && !named ? byId(id) : null;
      if (row) untouched.push(row);
      else touched++;
    }
    return { untouched, touched };
  }

  /** A row as a person says it, `S42` or `things#3`, or its id when the row is gone. */
  function nameOf(id: string): string {
    const row = byId(id, true);
    if (!row || row.seq === null) return id;
    const prefix = registers.get(row.register)?.seq_prefix;
    return prefix && prefix !== '#' ? `${prefix}${row.seq}` : `${row.register}#${row.seq}`;
  }

  /**
   * `S42` to the register whose prefix is `S`, and its row 42.
   *
   * MATCHED AGAINST THE INSTALLED PREFIXES, not split by `34 §4`'s pattern alone. That pattern is
   * greedy, so on its own it reads `S42` as the prefix `S4` and row 2. `validate` refuses two
   * prefixes one id could belong to, so at most one matches here.
   */
  function prefixed(ref: string): { register: string; seq: number } | null {
    const said = ref.trim();
    for (const [prefix, register] of prefixes) {
      const n = said.startsWith(prefix) ? said.slice(prefix.length) : '';
      if (/^[1-9][0-9]*$/.test(n)) return { register, seq: Number(n) };
    }
    return null;
  }

  /**
   * Who last touched this row.
   *
   * FOR THE ONE ANSWER THAT HAS TO NAME SOMEBODY. A 409 telling a person "this changed" and not who
   * changed it is a dead end — they cannot ask, and they cannot tell a colleague's edit from a
   * rule's. The event log already knows, and this is the only question asked of it on a hot path.
   *
   * `null` WHEN THE LOG CANNOT SAY, which happens for a row written before the per-field history and
   * for an imported record. The caller supplies the honest fallback rather than this inventing one.
   */
  const lastActor = (id: string): string | null =>
    sql.one<{ actor: string }>('SELECT actor FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `entry:${id}`)
      ?.actor ?? null;

  /** The oldest removal a reinstall still puts back (`REMOVED_WINDOW_DAYS`). */
  const removedSince = (): string => instant(clock.now() - REMOVED_WINDOW_DAYS * 86_400_000);

  const count = (register: string): number =>
    Number(
      sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', register)?.n ?? 0,
    );

  /**
   * A page of rows, newest first.
   *
   * The cursor is the last row's `updated_at` and `id` together, and both are needed: a cursor on
   * the timestamp alone loses every row that shares a millisecond with the page boundary, which on
   * an import is most of them.
   */
  /** What a predicate is checked against: the register's own fields, and nothing else. */
  /**
   * The register as a predicate reads it.
   *
   * `to` TRAVELS WITH A REF, because a sentence names one BY NAME — `thing is Kiln` — and the parser
   * needs to know which register to look the name up in. Leaving it out made every ref in a sentence
   * a refusal saying "there is no row called Kiln", which is true of nothing and helpful to nobody.
   *
   * AND IT STILL HANDS OVER THE DECLARED FIELDS ONLY, which is a decision rather than the hole it
   * used to be. `02 §6` makes `id seq state created_at updated_at version` addressable in any
   * `where:` without a register declaring them, and none of them was: this map was the whole
   * vocabulary and `created_at after -7d` was a `FIELD_UNKNOWN`. Adding five keys here would have
   * taught the SQL compiler a name the in-memory evaluator still could not read, and there are
   * seven consumers of that grammar and two renderings of it, so the fallback belongs to `where`
   * and `38 §4.3` item 13 puts it there. What this function knows is what the REGISTER declares;
   * what the RECORD keeps for itself is not a register's business to say.
   */
  const schemaOf = (register: string): Schema => ({
    register,
    /* WHICH FIELD IS MIRRORED TRAVELS WITH THE SCHEMA, and it is the one thing `where` cannot work
       out from a field id. `02 §1` compiles a predicate over the state against the COLUMN, and the
       column holds whatever this key names: one shipped register points it at `lane`, and a
       register may declare an enum called `state` and name no state at all, in which case the
       column is NULL on every row of it. The compiler needs the answer and only the declaration
       has it. */
    ...(registers.get(register)?.state === undefined ? {} : { state: registers.get(register)!.state! }),
    /* AND WHETHER IT IS A SERIES, which `where` refuses every text test over (`02 §5`). The flag was
       read in this file for the spoken number and the rules pass and never sent, so the compiler
       that keeps the rule was never told which registers it was about. */
    ...(registers.get(register)?.series === true ? { series: true } : {}),
    fields: Object.fromEntries(
      (registers.get(register)?.fields ?? [])
        .filter((f) => !f.retired)
        /* THE LABEL TRAVELS WITH THE FIELD, because a page prints its own `where:` back to the
           reader using it: `direction is owed_to_me` is shown as `which way is owed to me`. Without
           it here, that sentence fed back to the record was `FIELD_UNKNOWN`, and seven of the eleven
           filters the shipped pages print could not be read by the record printing them. */
        .map((f) => [
          f.id,
          {
            type: f.type,
            ...(f.values ? { values: f.values } : {}),
            ...(f.to ? { to: f.to } : {}),
            ...(f.label ? { label: f.label } : {}),
            /* AND AN ENUM'S VALUE LABELS, so `direction is money in` reads as the screen says it. */
            ...(f.labels ? { labels: f.labels } : {}),
          },
        ]),
    ),
  });

  /**
   * A rule or a metric whose predicate cannot be read, refused at INSTALL.
   *
   * A RULE THAT CANNOT BE READ FIRES ON NOTHING, deliberately — the other direction, firing on
   * everything, is what a broken predicate does when nobody checks it. But nothing refused the
   * DECLARATION, so `when: 'level gt 40'` installed cleanly and the rule then did nothing for ever,
   * with no event, no refusal and no way to find out short of noticing that rows are not being
   * tagged. Silence is the one failure this record does not accept anywhere else.
   *
   * BEFORE THE INSTALL, AND AGAINST THE BATCH FIRST, because a rule and the register it is about
   * usually arrive together and the cache is only rebuilt afterwards.
   *
   * `REF_UNKNOWN` IS NOT A DECLARATION ERROR. `owner is Kiln` names a row that may be written
   * tomorrow; every other refusal here is about the grammar or the shape, and those are facts about
   * the declaration whenever it is read.
   */
  /**
   * The schedule rows a batch of declarations earns.
   *
   * ONE ROW PER THING THAT RECURS, KEYED BY THE BARE ID. `forgetPack` deletes by
   * `substr(id, instr(id, '.') + 1)` — `brief`, not `digest.brief` — and this wrote the full form,
   * so the two never intersected: uninstalling a pack left every digest it had earned armed, firing
   * every Monday about a declaration that is gone. `(kind, key)` is the unique index, so `digest`
   * and `metric` cannot collide over one bare name.
   *
   * AND `DO UPDATE` RATHER THAN `DO NOTHING`, which 45 §5.9 calls "the one path 09 §1 demands". The
   * difference is a whole class of silence: a row that has already fired is `done`, and
   * `drainSchedule` claims only `pending` — so with `DO NOTHING` a digest whose row went `done` once
   * (because its declaration was momentarily absent, say) could never be armed again by any number
   * of re-installs, and would simply never send, for ever, with nothing anywhere saying so.
   *
   * THE `WHERE` IS WHAT KEEPS IT FROM BEING A RESET. A `pending` row is one somebody is waiting on,
   * and moving its `due_at` because a pack was re-installed is how a Monday brief silently becomes a
   * Thursday one. Only a row that is finished or given up on is re-armed.
   */
  function armDerived(batch: readonly Declaration[]): void {
    const arm = (kind: string, key: string, payload: unknown, at: number): void => {
      sql.exec(
        `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
         VALUES (?, ?, ?, ?, ?, 'pending', 0)
         ON CONFLICT (kind, key) DO UPDATE
           SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0
           WHERE schedule.state IN ('done', 'failed')`,
        mint(),
        instant(at),
        kind,
        key,
        JSON.stringify(payload),
      );
    };

    /* A TIMEZONE THIS RUNTIME CANNOT READ IS `UTC`, not a `RangeError`. `dog_meta.tz` arrives from an
       import or a restore as easily as from `createRecord`, and `Intl` throws on a zone it does not
       know — out of `install`, after the declarations had already committed, so the caller saw a 500
       for a write that succeeded. */
    let tz = recordIdentity(sql)?.tz ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
    } catch {
      tz = 'UTC';
    }

    for (const decl of batch) {
      const body = decl.body as Record<string, unknown>;
      /* The bare id: `digest.brief` is the declaration and `brief` is the key. */
      const bare = decl.id.slice(decl.id.indexOf('.') + 1);
      if (decl.kind === 'digest' && body.schedule && typeof body.schedule === 'object') {
        const at = nextOccurrence(body.schedule as { day?: string; at: string }, clock.now(), tz);
        if (at !== null) arm('digest', bare, { declaration: decl.id }, at);
      }
      /* A CONNECTOR RUNS FROM THE MOMENT IT IS DECLARED. `25 §9`: "its first `due_at` at install is
         `now`". Nothing wrote a `pull` row — anywhere, in any path — so the reader, the handler and
         the drain dispatcher were all complete and all unreachable, and a bank feed installed,
         printed itself in the diff's CALLS OUT line, and never fetched anything. The three kinds
         above were fixed for exactly this; `pull` was left behind.

         `now` AND NOT `now + every`, because a connector nobody has run is a connector nobody knows
         works: the first fetch is the one that tells you the credential is right. */
      if (decl.kind === 'ingest' && body.channel === 'pull' && typeof body.every === 'string')
        arm('pull', bare, { ingest: bare }, clock.now());
      /* A `call` OR A `poll` IS ARMED THE SAME WAY AND FROM THE SAME MOMENT, for the same reason: the first run
         is the one that says the key and the address are right (`loop/DIRECTION.md` §0b). */
      if (decl.kind === 'ingest' && (body.channel === 'call' || body.channel === 'poll') && typeof body.every === 'string')
        arm(body.channel as 'call' | 'poll', bare, { ingest: bare }, clock.now());
      /* A CALL ONLY A RULE RUNS HAS NO CLOCK, and it still gets its row: the row is what pausing, resuming and the list
         read. Its one scheduled turn finds nothing to send and marks it done. */
      else if (decl.kind === 'ingest' && body.channel === 'call' && body.trigger === 'rule')
        arm('call', bare, { ingest: bare }, clock.now());

      /* A METRIC WITH `snapshot:` REMEMBERS ITS OWN READINGS. Five past midnight, so the day it is
         about is finished and nothing else is competing for the alarm. */
      if (decl.kind === 'metric' && body.snapshot) {
        const at = nextOccurrence({ at: '00:05' }, clock.now(), tz);
        if (at !== null) arm('snapshot', bare, { metric: typeof body.metric === 'string' ? body.metric : bare }, at);
      }
    }
  }

  function unreadable(batch: readonly Declaration[]): Refusal | null {
    const shape = (register: string): Schema | null => {
      const arriving = batch.find((d) => d.kind === 'register' && (d.body as { id?: unknown }).id === register);
      if (arriving) {
        const fields = ((arriving.body as { fields?: unknown }).fields ?? []) as (FieldDecl & { retired?: boolean })[];
        return {
          register,
          /* A register arriving in this batch is a series by its own body, for `schemaOf`'s reason. */
          ...((arriving.body as { series?: unknown }).series === true ? { series: true } : {}),
          fields: Object.fromEntries(
            fields
              .filter((f) => !f.retired)
              /* The label too, for the reason `schemaOf` gives: a page prints its filter back with
                 it, and a sentence somebody can be shown and cannot type back is not a sentence. */
              .map((f) => [
                f.id,
                {
                  type: f.type,
                  ...(f.values ? { values: f.values } : {}),
                  ...(f.to ? { to: f.to } : {}),
                  ...(f.label ? { label: f.label } : {}),
                },
              ]),
          ),
        };
      }
      return registers.has(register) ? schemaOf(register) : null;
    };

    for (const decl of batch) {
      const body = decl.body as Record<string, unknown>;

      /* EVERY FIELD ID THAT WILL BECOME A JSON PATH, CHECKED AT INSTALL. `validate` in `declare.ts`
         applies the grammar to register and field ids and returns before every other kind — so an
         `ingest`'s `writes.key` and a `rule`'s `link.to.by` were arbitrary strings that reached
         `json_extract(fields, '$.<id>')`, from a declaration a PACK can supply. `jsonPath` throws on
         one now, which is the backstop; this is the check that means it never gets there, said as a
         refusal at the moment somebody could still fix it. */
      /* A LIST OR NOTHING, and a shape that is neither is a refusal rather than a throw. The first
         version of this check spread `body.writes.key` straight into an array literal — so a `key`
         of `5` threw `not iterable` out of `install`, and a `key` of `"ref"` spread into three
         one-letter ids that all passed the grammar and then threw at `arrive`. Three uncaught
         exceptions out of `install`, in the check whose whole thesis is that a refusal is a value. */
      const listed = (v: unknown, at: string): unknown[] | Refusal =>
        v === undefined || v === null
          ? []
          : Array.isArray(v)
            ? v
            : { code: 'DECLARATION_INVALID', fix: `${decl.id}'s ${at} is a list of field ids.`, at };

      const keys = listed((body.writes as { key?: unknown })?.key, 'writes.key');
      if (!Array.isArray(keys)) return keys;
      const actions = listed(body.then, 'then');
      if (!Array.isArray(actions)) return actions;

      const paths = [
        ...keys,
        ...actions.map((a) => (a as { link?: { to?: { by?: unknown } } })?.link?.to?.by).filter((x) => x !== undefined),
        /* THE LOOKUP PATHS TOO. Each `extract.<field>.lookup.by` becomes a JSON path in the `find`
           the ingest runs, and only two of the three were listed here. */
        ...Object.values((body.extract ?? {}) as Record<string, { lookup?: { by?: unknown } }>)
          .map((f) => f?.lookup?.by)
          .filter((x) => x !== undefined),
      ];
      for (const path of paths)
        if (typeof path !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(path))
          return {
            code: 'DECLARATION_INVALID',
            fix: `${decl.id} names ${JSON.stringify(path)} as a field, and a field id is lowercase letters, digits and underscores.`,
            at: 'field',
          };

      /* A PAGE BLOCK'S `where` IS READ HERE TOO, for the rule's reason: `declare.ts` checks its shape
         only, so a table filtering on a field the register lacks installed and drew its refusal on
         every open instead. Only a `register.<id>` source has a schema to read against; a computed
         source (`forecast.runway`, `activity`, `sessions.live`, `actions`) is left to the page layer,
         and so is a diff, which reads one row's history and never its `where`. A source naming no
         register is the page layer's `SOURCE_UNKNOWN` at render, not a refusal this check invents.

         A `where` HOLDING A `{{...}}` IS SKIPPED, not filled. It is a template's (`for:`) or a
         parameterised page's, and it becomes a sentence only when its row fills it. No one stand-in
         value is right for every field it could sit against: a word is refused by an int, an enum and
         a date alike, so filling one in would refuse correct templates by the type of the field. */
      if (decl.kind === 'page' && Array.isArray(body.blocks))
        for (const [i, raw] of body.blocks.entries()) {
          const block = raw as { kind?: unknown; source?: unknown; where?: unknown } | null;
          if (!block || block.kind === 'diff') continue;
          /* A SENTENCE OR A TREE ONLY. Anything else is `declare.ts`'s `DECLARATION_INVALID`, and this
             check runs first, so reading `null` here would answer the same mistake with another code. */
          const where = block.where;
          if (typeof where !== 'string' && (where === null || typeof where !== 'object' || Array.isArray(where))) continue;
          if (typeof block.source !== 'string' || !block.source.startsWith('register.')) continue;
          if (JSON.stringify(where).includes('{{')) continue;
          const schema = shape(block.source.slice('register.'.length));
          if (!schema) continue;
          const bad = unreadWhere(`${decl.id}.blocks[${i}]`, where, schema);
          if (bad) return bad;
        }

      const source = typeof body.source === 'string' ? body.source : '';
      const register =
        decl.kind === 'rule'
          ? body.register
          : decl.kind === 'metric' && source.startsWith('register.')
            ? source.slice('register.'.length)
            : undefined;
      const where = decl.kind === 'rule' ? body.when : decl.kind === 'metric' ? body.where : undefined;
      if (typeof register !== 'string') continue;

      const schema = shape(register);
      if (!schema)
        return { code: 'REGISTER_UNKNOWN', fix: `${decl.id} is about ${register}, and there is no such register.`, at: 'register' };

      /* A MISSING `when` SKIPS THE PREDICATE CHECK AND NOTHING ELSE. It used to skip the whole
         block, so a rule with no `when` — which is a legal rule, meaning "every row" — installed
         with no bound, no `once_per`, three axes and a target register nobody has. */
      if (where !== undefined) {
        const bad = unreadWhere(decl.id, where, schema);
        if (bad) return bad;
      }

      /* A METRIC THAT SUMS A DAY INSTALLED, and then answered 4052 or a blank on every page it sat on. */
      if (decl.kind === 'metric' && body.value !== null && typeof body.value === 'object') {
        const said = unaggregatableIn(body.value as MetricDecl['value'], schema);
        if (said) return { code: 'VALUE_MALFORMED', fix: `${decl.id}: ${said}`, at: 'value' };
      }

      /* A GROUPING WITH MORE PARTS THAN A CHART CAN DRAW IS REFUSED AT INSTALL (`42 §5.3` 18): an enum declaring more
         than fifty values, or a ref to a list already holding more than fifty rows. A word is unbounded and is cut
         when it is drawn, and a date is cut into buckets, so neither is counted here. */
      if (decl.kind === 'metric' && typeof body.group_by === 'string' && body.bucket === undefined) {
        const field = Object.hasOwn(schema.fields, body.group_by) ? (schema.fields[body.group_by] as { type: string; values?: readonly string[]; to?: string }) : undefined;
        const n =
          field?.type === 'enum'
            ? (field.values?.length ?? 0)
            : field?.type === 'ref' && typeof field.to === 'string'
              ? Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', field.to)?.n ?? 0)
              : 0;
        if (n > GROUP_CAP)
          return {
            code: 'GROUP_BY_CARDINALITY',
            fix: `${decl.id}: group_by ${body.group_by} has ${n} possible values; the ceiling is ${GROUP_CAP}.`,
            at: 'group_by',
          };
      }

      if (decl.kind === 'rule') {
        const bad = undeclarable(decl.id, body as unknown as RuleDecl, shape);
        if (bad) return bad;
      }
    }
    return null;
  }

  /** A `where` read against the register it filters: `null` when it can be read, the refusal when not. */
  function unreadWhere(id: string, where: unknown, schema: Schema): Refusal | null {
    const said = predicateOf(where as Predicate | string, schema, evalContext());
    const stop = said.bad.find((b) => b.code !== 'REF_UNKNOWN');
    if (stop) return { ...stop, fix: `${id} cannot be read: ${stop.fix}` };

        /**
         * AND THEN COMPILED, BECAUSE THAT IS WHAT "CAN BE READ" MEANS.
         *
         * `predicateOf` parses a SENTENCE against the schema and, for the tree form, only resolves
         * its relative dates, so the same mistake was refused written one way and installed written
         * the other. `evaluate` answers `false` for anything `compile` refuses, by construction, so
         * every one of these rules installed and then never fired. Driven:
         *
         *     tree: gt on a text field                   INSTALLED -> row tags null
         *     tree: an undeclared field                  INSTALLED -> row tags null
         *     tree: contains on an int                   INSTALLED -> row tags null
         *     sentence: an undeclared field (control)    REFUSED FIELD_UNKNOWN
         *     tree: a readable predicate (control)       INSTALLED -> row tags ["flagged"]
         *
         * Found by the series rule, `02 §5`'s *"refused at install: a series has no text"*: the
         * compiler learned to refuse `contains` over a series and a rule saying it still installed,
         * now to fire on nothing where it used to fire correctly. `compile` raises no `REF_UNKNOWN`,
         * so nothing a row written tomorrow could satisfy is refused here.
         */
    const unread = compile(said.predicate, schema).bad[0];
    return unread ? { ...unread, fix: `${id} cannot be read: ${unread.fix}` } : null;
  }

  /**
   * What a rule may not declare, refused where a sentence fits.
   *
   * A GENERATOR WITH NO CEILING is how a rules engine fills a ten-gigabyte object overnight, and a
   * `create` that runs on every write of its parent is that failure once a day for ever. Both are
   * facts about the declaration, so both belong here rather than at the thousandth row.
   */
  function undeclarable(id: string, rule: RuleDecl, shape: (register: string) => Schema | null): Refusal | null {
    /* A RULE WITH NO `then` DOES NOTHING, and the pass then read `.some` of `undefined` and threw
       the TRIGGERING WRITE out of the record — across a boundary this package promises nothing
       throws over. Refused where a sentence fits. */
    if (!Array.isArray(rule.then) || rule.then.length === 0)
      return { code: 'REQUIRED_MISSING', fix: `${id} says when, and does not say what it would then do.`, at: 'then' };

    const risky = rule.then.some((a) => 'notify' in a || 'create' in a || 'suggest' in a);
    if (risky && !rule.once_per?.length)
      return {
        code: 'REQUIRED_MISSING',
        fix: `${id} notifies, creates or suggests, and declares no once_per, so it would fire on every write of the row.`,
        at: 'once_per',
      };

    for (const action of rule.then ?? []) {
      if (!('create' in action)) continue;
      const spec = action.create;

      /* AND A `create` THAT IS NOT AN OBJECT REACHED `.register` AND THREW. A declaration arrives as
         JSON from a pack somebody else wrote, so the type is not there at the moment it is read:
         `create: null` was a `TypeError` out of `install`, which is a 500 answering a preview, and
         `create: "obligations"` walked on to look up a register called `undefined`. A refusal is a
         value here as everywhere else, and `declare.ts` raises the same one a few lines later for
         callers that reach it first. */
      if (spec === null || typeof spec !== 'object')
        return {
          code: 'DECLARATION_INVALID',
          fix: `${id} declares a create of ${JSON.stringify(spec)}, and a create names a register and what goes in it.`,
          at: 'then.create',
        };

      const target = shape(spec.register);
      if (!target)
        return { code: 'REGISTER_UNKNOWN', fix: `${id} creates rows in ${spec.register}, and there is no such register.`, at: 'register' };

      /* `04 §5` HAS A CODE FOR THIS AND THIS DID NOT USE IT.
         The table names three: `CREATE_UNBOUNDED` for a `create` with no `bound:`,
         `CREATE_OVER_BOUND` for a declared cardinality past it, and `CREATE_FOREIGN_REGISTER`.
         `declare.ts`'s `createFault` raises the first two under their own names, correctly — and
         this function runs FIRST at install and refused the same two declarations as
         `OUT_OF_BOUNDS`, which is the write path's code for a VALUE outside a field's range. So the
         registry said the code was emitted, `createFault` said the code was emitted, and no caller
         could ever have seen either of them: two correctly-coded checks shadowed by one that was
         not, in the file that runs first.

         AN ABSENT BOUND AND A BOUND OF `"lots"` ARE DIFFERENT FACTS. `42 §4` step 13 puts
         `CREATE_UNBOUNDED` on absence, "before the generic missing-key mapping" — so a bound that
         is present and unusable keeps `OUT_OF_BOUNDS`, which is what it is. */
      if (spec.bound === undefined)
        return {
          code: 'CREATE_UNBOUNDED',
          fix: `${id}: create has no bound. A generator with no ceiling fills the record.`,
          at: 'bound',
        };

      const bound = Math.floor(Number(spec.bound));
      if (!Number.isFinite(bound) || bound < 1 || bound > CREATE_CEILING)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `${id} declares a bound of ${String(spec.bound)}, and a bound is between 1 and ${CREATE_CEILING}.`,
          at: 'bound',
        };

      const each = spec.each ?? [];
      /* TWO IS A MATRIX. Three is a cube, and nobody has ever wanted a cube. */
      if (each.length > 2)
        return { code: 'OUT_OF_BOUNDS', fix: `${id} crosses ${each.length} fields, and two is the most a matrix can be.`, at: 'each' };

      const from = shape(rule.register);
      let cardinality = 1;
      let knowable = each.length > 0;
      const counted: string[] = [];
      for (const field of each) {
        const kind = from?.fields[field] as { type?: string; values?: readonly string[] } | undefined;
        if (!kind)
          return { code: 'FIELD_UNKNOWN', fix: `${id} crosses ${field}, and ${rule.register} has no such field.`, at: 'each' };
        if (kind.type !== 'list' && kind.type !== 'enum')
          /* `MATCH_OP_UNSUPPORTED`, WHICH IS A CODE `30 §6` PUBLISHES, and this said
             `WHERE_OPERATOR_UNSUPPORTED`, which it does not. `refusals.mjs` counts a code the
             registry has not got and holds the total as a budget that may only go down; its own
             notes name this site and the replacement, and call it one line. An `each:` is an
             operator applied to a field whose type does not admit it, which is what
             `MATCH_OP_UNSUPPORTED` is for, and it was never about a `where` operator. */
          return {
            code: 'MATCH_OP_UNSUPPORTED',
            fix: `${id} crosses ${field}, which is a ${String(kind.type)}. Only a list or an enum has values to cross.`,
            at: 'each',
          };
        /* AGAINST THE DECLARED CARDINALITY WHERE IT IS KNOWABLE. An enum's values are in the
           declaration, so a bound that its own axes can exceed is a bound that is wrong today
           rather than at the thousandth row.

           A `list` HAS NO DECLARED LENGTH, and multiplying by zero for it turned the whole check
           off — including for `enum × list`, where half of it was knowable. Unknown means the
           check does not apply, not that the product is nothing. */
        if (kind.values?.length) {
          cardinality *= kind.values.length;
          counted.push(`${field} (${kind.values.length})`);
        } else knowable = false;
      }
      if (knowable && cardinality > bound)
        return {
          /* `04 §5`'s own code and its own sentence shape: *"sizes (8) × colours (12) = 96 exceeds
             bound 60"*. This said `OUT_OF_BOUNDS` and read like a field range. */
          code: 'CREATE_OVER_BOUND',
          fix: `${id}: ${counted.join(' × ')} = ${cardinality} exceeds bound ${bound}.`,
          at: 'bound',
        };
    }
    return null;
  }

  function list(q: {
    register: string;
    /**
     * Structured, or as the sentence a person and an agent write.
     *
     * BOTH FORMS OR IT IS TWO LANGUAGES. `direction is owed to me, state is open` is what goes in a
     * declaration; the tree is what the compiler reads. One accepted here and the other not would
     * make a block's `where:` and a caller's `where:` different things with the same name.
     */
    where?: Predicate | string;
    /**
     * What to sort by, and it had no way to be said.
     *
     * `list` ordered by `updated_at DESC, id DESC` and took no order at all, so a page block
     * declaring `order:` was sorted by whatever read it afterwards, over the page it had already
     * been handed. That is a different answer from the one it asked for: "the five largest" is not
     * "five arbitrary rows, sorted". The register grid has the same hole one level up.
     *
     * THE SQL COMES FROM `where`, not from a path built here. `31 §2` is explicit that this package
     * imports `jsonPath` so the index and the predicate are the same string; an `ORDER BY` is the
     * third place that has to hold, and `fieldSql` is now exported for it.
     */
    order?: { field: string; dir?: 'asc' | 'desc' }[];
    limit?: number;
    cursor?: string | null;
    includeDeleted?: boolean;
  }): Result<{ rows: Entry[]; cursor: string | null; matched: number }> {
    const barred = schemaRefusal(state);
    if (barred) return barred;
    if (!registers.has(q.register))
      return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });

    const schema = schemaOf(q.register);
    const said = predicateOf(q.where, schema, evalContext());
    if (said.bad.length) return { ok: false, refusal: said.bad[0]! };

    /* A PREDICATE THAT COULD NOT BE READ RUNS NOTHING. Returning the register would be a list that
       looks filtered and is not, which is the one failure a declarative surface must not have —
       especially when the thing writing most predicates is an agent that cannot see the screen. */
    const c = compile(said.predicate, schema);
    if (c.bad.length) return { ok: false, refusal: c.bad[0]! };

    /* COERCED AT THE EDGE. These arrive from a query string a stranger wrote: `cursor=5` is a number
       by the time `serveApi` has JSON-decoded it, and `.split` on a number threw a TypeError out of
       the route — as did `limit=abc`, which bound NaN to a LIMIT. A refusal is a value here; an
       exception is not. */
    const limit = Math.min(Math.max(1, Math.floor(Number(q.limit)) || 50), 500);
    const deleted = q.includeDeleted === true ? '' : ' AND deleted_at IS NULL';

    /**
     * THE ORDER, AND THE TWO THINGS IT IS REFUSED FOR.
     *
     * A CURSOR AND AN ORDER ARE ONE QUERY OR THE OTHER. The cursor is keyset pagination on
     * `updated_at|id` — that is what the `WHERE (updated_at < ? OR …)` clause below IS — and a
     * different sort key makes the clause select the wrong rows rather than fewer of them. Silently
     * ignoring one of the two would hand back a page that is neither what was asked for nor
     * detectably wrong, which is worse than saying so.
     *
     * AND A FIELD THE REGISTER DOES NOT DECLARE IS NOT A SORT. `json_extract` on an absent key is
     * `NULL` for every row, so an unknown field sorts by nothing at all and looks like the default
     * order with extra steps.
     *
     * `seq` WAS ADMITTED BY NAME HERE, AND IT WAS ONE OF SIX. This branch carried its own
     * exception, spelt twice, for the one kernel-owned name somebody had needed: `o.field !==
     * 'seq'` in the check and `o.field === 'seq' ? 'seq' : fieldSql(…)` in the clause. `02 §6`
     * makes six of them addressable without a declaration, so `order: created_at` was a
     * `FIELD_UNKNOWN` from a register that keeps a `created_at` column on every row. The exception
     * is `where`'s now, in `fieldSqlIn`, which is where `31 §2` says a field expression is spelt
     * so that the sort and the filter cannot disagree, and it returns for `seq` the same string
     * this branch used to write by hand. It also gets the register's mirrored state right, which
     * a name spelt here could not: one shipped register calls that field `lane`.
     */
    let sort = 'ORDER BY updated_at DESC, id DESC';
    /**
     * COERCED AT THE EDGE, LIKE `limit` AND `cursor` ABOVE, and it was not.
     *
     * `q.order` arrives from a query string: `packages/host` JSON-decodes every value, so the caller
     * chooses the shape as well as the contents. This gated on `q.order?.length` and then iterated,
     * so `?order={"length":1}` passed the gate, threw inside the loop and answered **500**. The
     * argument for coercing the other two is written four lines up and applies here word for word:
     * a refusal is a value at this boundary and an exception is not.
     *
     * AND A DIRECTION THAT IS NOT ONE IS REFUSED RATHER THAN READ AS DESCENDING. `o.dir === 'asc'
     * ? 'ASC' : 'DESC'` takes `descnding`, `1`, `null` and `{}` and sorts the other way: a typo
     * that answers with a correct-looking list in the wrong order, which is the one kind of wrong
     * answer a reader cannot see.
     */
    if (q.order !== undefined && !Array.isArray(q.order))
      return no('VALUE_MALFORMED', 'An order is a list of { field, dir }.', { at: 'order' });
    for (const o of q.order ?? []) {
      if (typeof o !== 'object' || o === null || typeof (o as { field?: unknown }).field !== 'string')
        return no('VALUE_MALFORMED', 'Each part of an order names a field.', { at: 'order' });
      const dir = (o as { dir?: unknown }).dir;
      if (dir !== undefined && dir !== 'asc' && dir !== 'desc')
        return no('ENUM_VALUE_UNKNOWN', `An order is asc or desc, and this one is ${JSON.stringify(dir)}.`, {
          at: 'order',
          allowed: ['asc', 'desc'],
        });
    }
    const cursorText = typeof q.cursor === 'string' ? q.cursor : '';
    const sortedCursor = cursorText.startsWith(SORTED_CURSOR);
    if (sortedCursor && !q.order?.length)
      return no('VALUE_MALFORMED', 'That cursor pages a sorted list. Ask with the order it came from.', { at: 'cursor' });
    /* THE SORT KEYS, KEPT APART, because a sorted page's cursor is the last row's value under each of them. */
    const keys: { expr: string; asc: boolean }[] = [];
    let after = '';
    const afterParams: Param[] = [];
    if (q.order?.length) {
      if (cursorText !== '' && !sortedCursor)
        /* `VALUE_MALFORMED` AT `cursor`, AND IT SAID `WHERE_OPERATOR_UNSUPPORTED` AT `order`, which
           is wrong twice. There is no `where` operator anywhere in this refusal, and the argument
           that cannot be honoured is the CURSOR: a position in the record's order is not a position
           in a sorted one. The code was also outside `30 §6`'s registry, which `refusals.mjs` counts
           as drift. */
        return no(
          'VALUE_MALFORMED',
          'That cursor pages by when a row last changed, so it cannot page a sorted list. Start the sorted list from its first page.',
          { at: 'cursor' },
        );
      const parts: string[] = [];
      for (const o of q.order) {
        if (!Object.hasOwn(schema.fields, o.field) && !isColumn(o.field))
          return no('FIELD_UNKNOWN', `${q.register} has no field called ${o.field}.`, {
            at: 'order',
            allowed: addressable(schema),
          });
        const dir = o.dir === 'asc' ? 'ASC' : 'DESC';
        /* AN ENUM WITH LABELS SORTS BY THE LABEL, which is what the column shows: `owed_by_me` is Money out,
           and ordered by the stored word it came before Money in. The browser's list sorts the same way. */
        const labels = Object.hasOwn(schema.fields, o.field) ? schema.fields[o.field]?.labels : undefined;
        const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;
        const expr = labels && Object.keys(labels).length
          ? `(CASE ${fieldSqlIn(schema, o.field)} ${Object.entries(labels).map(([v, l]) => `WHEN ${quote(v)} THEN ${quote(l)}`).join(' ')} ELSE ${fieldSqlIn(schema, o.field)} END)`
          : fieldSqlIn(schema, o.field);
        /* ONE RULE IN BOTH ENGINES (`apps/web/src/lib/record/api.ts` `compareRows`). MONEY GROUPS BY CURRENCY, THEN AMOUNT:
           there is no order between two currencies, and by amount alone GBP 50 sat between two dollar figures. TEXT SORTS
           WITHOUT REGARD TO CASE, the stored text breaking a tie, so a mixed-case column reads in one order here and in the
           sample. Every key is also a cursor key, compared with the same collation, so the pages stay gap-free. */
        const type = Object.hasOwn(schema.fields, o.field) ? schema.fields[o.field]?.type : undefined;
        const exprs =
          type === 'money'
            ? [`json_extract(fields, '${jsonPath(o.field)}.currency')`, expr]
            : type !== undefined && TEXT_SORTED.has(type)
              ? [`(${expr} COLLATE NOCASE)`, expr]
              : [expr];
        for (const e of exprs) {
          /* AN EMPTY VALUE GOES LAST, IN EITHER DIRECTION. SQLite puts `NULL` first ascending, so a table sorted by an optional
             day led with every row that has none; the sample put them last both ways, and last is the one a reader wants. */
          parts.push(`${e} IS NULL, ${e} ${dir}`);
          keys.push({ expr: e, asc: dir === 'ASC' });
        }
      }
      keys.push({ expr: 'id', asc: false });

      /**
       * A SORTED LIST PAGES, AND IT DID NOT. It answered one page and no cursor, so past the limit a sorted list
       * simply stopped. The cursor is the last row's value under every sort key, its id last, and the next page is
       * every row that sorts after it: equal on the keys before one, and past it on that one. An empty value sorts
       * last in either direction, and the comparison below is written to agree with that, so a field some rows leave
       * empty neither loses them nor repeats them.
       */
      if (sortedCursor) {
        const said = readSortCursor(cursorText, orderKeyOf(q.order));
        if (!said || said.length !== keys.length)
          return no('VALUE_MALFORMED', 'A cursor is the one the page above answered with, for the same order.', { at: 'cursor' });
        const ors: string[] = [];
        keys.forEach((key, i) => {
          const v = said[i]!;
          const past = v === null ? null : `(${key.expr} ${key.asc ? '>' : '<'} ? OR ${key.expr} IS NULL)`;
          if (past === null) return;
          const same = keys.slice(0, i).map((k) => `${k.expr} IS ?`);
          ors.push(`(${[...same, past].join(' AND ')})`);
          afterParams.push(...said.slice(0, i), ...(v === null ? [] : [v]));
        });
        after = ` AND (${ors.length ? ors.join(' OR ') : '0'})`;
      }
      /* `id` LAST, ALWAYS. Two rows with the same value have no order otherwise, so the same query
         can return them in two orders on two runs and a reader watching a list re-render sees rows
         swap places for no reason. */
      sort = `ORDER BY ${parts.join(', ')}, id DESC`;
    }

    const [at, afterId] = (sortedCursor ? '' : cursorText).split('|');
    /* A CURSOR THIS RECORD DID NOT MINT IS REFUSED, AS THE SORTED ONE ALREADY WAS. `cursor=junk` compared
       `updated_at < 'junk'`, which every ISO instant is, so the answer was the first page again with a
       cursor of its own: a client paging on it walked the list twice and could not tell. */
    if (!sortedCursor && cursorText !== '' && !(afterId !== undefined && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at ?? '') && afterId !== ''))
      return no('VALUE_MALFORMED', 'A cursor is the one the page above answered with. Start from the first page.', { at: 'cursor' });
    const page = sortedCursor
      ? sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql})${after} ${sort} LIMIT ?`,
          q.register,
          ...c.params,
          ...afterParams,
          limit + 1,
        )
      : at
      ? sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql}) AND (updated_at < ? OR (updated_at = ? AND id < ?)) ${sort} LIMIT ?`,
          q.register,
          ...c.params,
          at,
          at,
          afterId ?? '',
          limit + 1,
        )
      : sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql}) ${sort} LIMIT ?`,
          q.register,
          ...c.params,
          limit + 1,
        );

    /* The MATCHED count is the whole answer, not the page: a reader who cannot see how many rows a
       filter admitted cannot tell a short list from a narrow one. */
    const matched = Number(
      sql.one<{ n: number }>(
        `SELECT count(*) AS n FROM entry WHERE register = ?${deleted} AND (${c.sql})`,
        q.register,
        ...c.params,
      )?.n ?? 0,
    );

    const rows = page.slice(0, limit).map(hydrate);
    const more = page.length > limit;
    const last = rows.at(-1);
    /* AND A SORTED ANSWER HANDS BACK ITS OWN KIND OF CURSOR: the last row's value under each sort key, read by the
       same expressions the ORDER BY used, so the next page compares like with like. */
    const paging = !(more && last)
      ? null
      : q.order?.length
        ? sortCursor(
            orderKeyOf(q.order),
            Object.values(
              sql.one<Record<string, Param>>(`SELECT ${keys.map((k, i) => `${k.expr} AS k${i}`).join(', ')} FROM entry WHERE id = ?`, last.id) ?? {},
            ),
          )
        : `${last.updated_at}|${last.id}`;
    return ok({ rows, matched, cursor: paging });
  }

  /**
   * What points at one row: the rows of other registers whose `ref` fields hold this row's id.
   *
   * NOTHING WAS ADDED TO THE DATA MODEL. A `ref` declares `to:`, so the inverse of every reference is
   * already stated once, on the field that declares it; this reads that declaration backwards and asks
   * the rows. The record had no way to answer "what is this person's" at all, which is the half
   * somebody opens a person for.
   *
   * `only` IS WHAT THE CALLER MAY READ, and it is the caller's business to work out: a register left
   * out of it is not asked about, so a row in a list somebody cannot open cannot be inferred from the
   * shape of the answer either. `undefined` asks every register, which is the host's own read.
   *
   * ONE `ref` FIELD AND NOT A `list<ref>`. A list of references is stored as a JSON array, so
   * answering it is a scan with `json_each` per register rather than an equality one index can serve.
   * It is left out rather than half-done, and a caller that needs it still has `list` with a `where`.
   *
   * PAGED ACROSS THE GROUPS IN ONE ORDER: relations by register then field, rows newest first, and the
   * cursor names the relation it stopped in as well as the position — `<register>.<field>|<when>|<id>`.
   */
  function backlinks(q: {
    register: string;
    seq: number;
    only?: readonly string[];
    limit?: number;
    cursor?: string | null;
  }): Result<Backlinks> {
    const barred = schemaRefusal(state);
    if (barred) return barred;
    if (!registers.has(q.register))
      return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });

    const limit = Math.min(Math.max(1, Math.floor(Number(q.limit)) || 20), 200);
    const row = bySeq(q.register, q.seq);
    const to = { register: q.register, seq: row?.seq ?? null, id: row?.id ?? null };
    /* A ROW THAT IS NOT THERE HAS NOTHING POINTING AT IT, and saying so is not a refusal: `get`
       answers `null` for the same row, and two reads of one row disagreeing about whether it exists
       is worse than an empty answer. */
    if (!row) return ok({ to, from: [], cursor: null });

    const parts = typeof q.cursor === 'string' && q.cursor !== '' ? q.cursor.split('|') : null;
    if (parts !== null && (parts.length !== 3 || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(parts[0] ?? '')))
      return no('VALUE_MALFORMED', 'A cursor is the one the page above answered with.', { at: 'cursor' });

    /* THE FIELD ID GOES INTO SQL, so it comes from the declaration and is checked against the grammar
       anyway (34 §4). A name this pattern does not admit is left out rather than quoted into a path. */
    const named = /^[a-z][a-z0-9_]{0,31}$/;
    const allowed = q.only === undefined ? null : new Set(q.only);
    const pairs: { register: string; field: string }[] = [];
    for (const decl of [...registers.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (allowed !== null && !allowed.has(decl.id)) continue;
      const fields = [...decl.fields]
        .filter((f) => f.type === 'ref' && f.to === q.register && !f.retired && named.test(f.id))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const f of fields) pairs.push({ register: decl.id, field: f.id });
    }

    const from: BackGroup[] = [];
    let at = parts === null ? null : parts[0]!;
    let taken = 0;
    let last: { key: string; row: Entry } | null = null;
    let more = false;

    for (const pair of pairs) {
      const key = `${pair.register}.${pair.field}`;
      /* EVERY RELATION BEFORE THE ONE THE CURSOR STOPPED IN IS BEHIND US. The order is the same on
         every call, so skipping to it is the same walk rather than a second one. */
      if (at !== null && key !== at) continue;
      const resuming = at !== null;
      at = null;

      const where = `register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${pair.field}') = ? AND id <> ?`;
      /* ONE MORE THAN THERE IS ROOM FOR, which is how the walk learns there is a next page without
         asking a second question, and how a relation whose rows are all drawn still notices the next
         relation has some. */
      const want = limit - taken + 1;
      const page = resuming
        ? sql.all<Record<string, unknown>>(
            `SELECT ${COLUMNS} FROM entry WHERE ${where} AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?`,
            pair.register,
            row.id,
            row.id,
            parts![1]!,
            parts![1]!,
            parts![2]!,
            want,
          )
        : sql.all<Record<string, unknown>>(
            `SELECT ${COLUMNS} FROM entry WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT ?`,
            pair.register,
            row.id,
            row.id,
            want,
          );
      if (page.length === 0) continue;

      const rows = page.slice(0, limit - taken).map(hydrate);
      if (rows.length > 0) {
        const matched = Number(
          sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where}`, pair.register, row.id, row.id)?.n ?? 0,
        );
        from.push({ register: pair.register, field: pair.field, matched, rows });
        taken += rows.length;
        last = { key, row: rows.at(-1)! };
      }
      if (page.length > rows.length) {
        more = true;
        break;
      }
    }

    return ok({ to, from, cursor: more && last ? `${last.key}|${last.row.updated_at}|${last.row.id}` : null });
  }

  /** `MAX(event.rowid)`, which is the record's version: what changed since is a range scan. */
  const version = (): number =>
    Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0);

  /**
   * A register's rows as a run in one project sees them: the project's own, and the global rows it
   * inherits. On a field declared `same: 'nearer'` a project row hides a global row with the same
   * title, so a project's own skill replaces the one of that name that applies everywhere. A
   * finished project row hides nothing, because it applies nowhere.
   *
   * THE ONE READ `context` AND A PAGE'S `inherit:` ARE BUILT ON, so nearer-wins is decided in one
   * place. `project` is a spoken id or a row id; `null` is a global run, which inherits all. `open`
   * leaves out finished rows, before the limit rather than after it, so a register with a long history
   * still shows what is open.
   */
  function inScope(
    register: string,
    project: string | null,
    opts: { limit?: number; open?: boolean } = {},
  ): Result<{ rows: Entry[]; inherited: Entry[] }> {
    const barred = schemaRefusal(state);
    if (barred) return barred;
    const decl = registers.get(register);
    if (!decl) return no('REGISTER_UNKNOWN', `There is no register called ${register}.`, { allowed: [...registers.keys()] });
    const f = scopeFieldOf(decl.fields);
    if (!f) return no('FIELD_UNKNOWN', `${register} has no field that says where its rows apply.`, { at: 'scope' });
    const home = project === null ? null : get(project);
    if (project !== null && (!home || home.register !== f.to))
      return no('VALUE_MALFORMED', `${project} is not a row of ${String(f.to)}, so it is not a project.`, { at: 'project' });

    const limit = Math.min(Math.max(1, Math.floor(Number(opts.limit)) || 50), 200);
    const at = `'$.${f.id}'`;
    const done = decl.done ?? [];
    const open = opts.open && done.length ? ` AND coalesce(e.state, '') NOT IN (${done.map(() => '?').join(', ')})` : '';
    const read = (where: string, ...params: string[]): Entry[] =>
      sql
        .all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND ${where}${open}
           ORDER BY e.updated_at DESC, e.id DESC LIMIT ?`,
          register,
          ...params,
          ...(open ? done : []),
          limit,
        )
        .map(hydrate);

    const rows = !home
      ? []
      : f.type === 'list'
        ? read(`EXISTS (SELECT 1 FROM json_each(e.fields, ${at}) WHERE value = ?)`, home.id)
        : read(`json_extract(e.fields, ${at}) = ?`, home.id);
    const hide = home && f.scope?.same === 'nearer' ? home.id : null;
    const inherited = hide
      ? read(
          `json_extract(e.fields, ${at}) IS NULL AND NOT EXISTS (SELECT 1 FROM entry p WHERE p.register = e.register
           AND p.deleted_at IS NULL AND json_extract(p.fields, ${at}) = ?
           AND json_extract(p.fields, '$.${decl.title}') = json_extract(e.fields, '$.${decl.title}')
           ${done.length ? `AND coalesce(p.state, '') NOT IN (${done.map(() => '?').join(', ')})` : ''})`,
          hide,
          ...done,
        )
      : read(`json_extract(e.fields, ${at}) IS NULL`);
    return ok({ rows, inherited });
  }

  /**
   * THE VAULT DOOR, the record's half, and INTERNAL: no route reaches it.
   *
   * A host's door seals a key with the record's key store and drops the value; this binds the sealed
   * bytes into a grant and points one row's `secret` field at it, in one transaction, through the
   * write path and every check it has. `ref` names the row to update, and without it one is created.
   * A row whose field names a live grant rotates that grant, keeping one prior version, and a revoked
   * one is replaced. It is the one write that sets a secret field.
   */
  function depositGrant(
    args: { register: string; ref?: string | null; field: string; fields?: Patch; grant: Omit<BindGrantArgs, 'id'> },
    w: WriteContext,
  ): Result<{ entry: Entry; grant: GrantRow }> {
    const decl = registers.get(args.register);
    if (!decl) return no('REGISTER_UNKNOWN', `There is no register called ${args.register}.`, { allowed: [...registers.keys()] });
    const sealable = decl.fields.filter((f) => f.type === 'secret' && !f.retired).map((f) => f.id);
    if (!sealable.includes(args.field))
      return no('FIELD_UNKNOWN', `${args.register} has no secret field called ${args.field}.`, { at: args.field, allowed: sealable });

    let bound: GrantRow | undefined;
    const bind = (actor: string, held: string | null): Result<GrantRow> => {
      const live = held !== null && getGrant(sql, held)?.revoked_at === null;
      const out = bindGrant(sql, vaultDeps(actor), { ...args.grant, ...(live && held !== null ? { id: held } : {}) }, transaction);
      if (out.ok) bound = out.value;
      return out;
    };
    const out = write(args.register, args.ref ?? null, args.fields ?? {}, w, { seal: { field: args.field, bind } });
    if (!out.ok) return out;
    /* A replayed deposit binds nothing again, and answers with the grant the row already names. */
    const grant = bound ?? getGrant(sql, String(out.value.fields[args.field] ?? ''));
    return grant ? ok({ entry: out.value, grant }) : no('OUT_OF_BOUNDS', `There is no grant behind ${args.field}.`, { at: args.field });
  }

  /* ── the write path ──────────────────────────────────────────────────── */

  function write(register: string, ref: string | null, patch: Patch, w: WriteContext, door: Door = {}): Result<Entry> {
    const barred = schemaRefusal(state);
    if (barred) return barred;

    /* A SEALING WRITE BINDS A GRANT PART-WAY THROUGH ITS PERSIST STEP, so a refusal after that rolls
       back to a savepoint rather than trusting that nothing was written before it. */
    const out = door.seal
      ? attempt(sql, transaction, () => writing(register, ref, patch, w, door))
      : writing(register, ref, patch, w, door);
    /* THE ONE WRITE A REFUSAL MAKES. Ten of the same refusal in a month across three days means the
       DECLARATION is wrong rather than one caller having a bad afternoon — and a record that threw
       its refusals away could never notice the difference. It is outside the transaction the write
       rolled back, or the observation would roll back with it.

       A CONFLICT IS NOT COUNTED. It is not the declaration being wrong; it is two people editing at
       once, and a detector that counted it would propose changing a field because a record is busy. */
    if (refused(out) && out.refusal.at)
      observe(sql, clock.now(), [{ kind: 'write.refused', subject: `${register}.${out.refusal.at}:${out.refusal.code}` }]);
    return out;
  }

  function writing(register: string, ref: string | null, patch: Patch, w: WriteContext, door: Door = {}): Result<Entry> {
    return transaction(() => {
      /* STEP ZERO: A REPLAY RETURNS WHAT THE FIRST ATTEMPT RETURNED.
       *
       * An agent that retries a request whose answer it did not receive is the ORDINARY case — a
       * dropped socket, a timeout, a queue redelivery — and without this the retry is a second row.
       * That is the duplicate-invoice failure from the client's side, and `sha256` on the bytes
       * cannot catch it because the second attempt is a different request with the same intent.
       *
       * The id is the caller's, written on the FIRST event row of a write and held unique there, so
       * the replay is one indexed read and the answer is the row as it is now. */
      if (w.opId !== undefined) {
        const already = sql.one<{ target: string }>('SELECT target FROM event WHERE op_id = ?', w.opId);
        if (already) {
          /* A REPLAY IS THE SAME WRITE, AND THE KEY ALONE DID NOT SAY SO. This returned whatever row the id
             had first touched, from any register and for any write: a `create` in `tasks` carrying an id
             somebody had used in `payroll` answered with the payroll row, past a guard that had only checked
             `tasks`, and an `update` reusing a `create`'s id answered with the created row and applied
             nothing. The key replays only the write it was minted for: the same register, and for an update
             the same row. Anything else is a different write wearing a used key, which is refused rather
             than answered with somebody else's row or silently dropped. */
          const was = byId(already.target.replace(/^entry:/, ''), true);
          const aimed = ref === null ? null : get(ref, { includeDeleted: true });
          if (was && was.register === register && (ref === null || aimed?.id === was.id)) return ok(was);
          return no<Entry>(
            'VALUE_MALFORMED',
            `op_id ${w.opId} was already used for a different write. A retry sends the same write again; a new write needs a new op_id.`,
            { at: 'op_id' },
          );
        }
      }
      const decl = registers.get(register);
      if (!decl)
        return no<Entry>('REGISTER_UNKNOWN', `There is no register called ${register}.`, {
          allowed: [...registers.keys()],
        });

      /* THE PATCH IS AN OBJECT, and nothing said so. `create` with no `fields`, or `update` with `patch: null`,
         reached `patch.deleted_at` below and answered 500 INTERNAL, "Cannot read properties of null". An array
         was read key by key, so `fields: [1]` was refused as a field called `0`. */
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch))
        return no<Entry>(
          'VALUE_MALFORMED',
          `A write takes its values as an object of field names, and this one is ${JSON.stringify(patch) ?? 'missing'}.`,
          { at: ref === null ? 'fields' : 'patch' },
        );
      /* AND A VERSION IS A WHOLE NUMBER. `version: "4"` never equals 4, so a client that sent its version as
         text was told its row had moved on every attempt, and re-reading could never cure it. */
      if (w.version !== undefined && !Number.isSafeInteger(w.version))
        return no<Entry>(
          'VALUE_MALFORMED',
          `version is the whole number the row was read at, and this one is ${JSON.stringify(w.version)}. Leave it out to write without comparing.`,
          { at: 'version' },
        );

      const current = ref === null ? null : get(ref, { includeDeleted: true });
      if (ref !== null && !current)
        return no<Entry>('VALUE_MALFORMED', `There is no row ${ref} in ${register}.`, { at: 'id' });
      if (current && current.register !== register)
        return no<Entry>('VALUE_MALFORMED', `${ref} is a row of ${current.register}, not ${register}.`, { at: 'id' });

      /* THE COMPARE-AND-SET, before anything is computed. Last-writer-wins is wrong for money: two
         people editing one invoice must not silently produce one of the two amounts.

         AND IT IS A CONFLICT, NOT A REFUSAL, which is the difference between an answer a caller can
         act on and a sentence it can only show. A refusal says the write was WRONG; this write was
         fine and arrived second. Recovering means re-reading the row and re-applying the patch, and
         as a refusal it carried neither the row nor the name of whoever moved it — so every client
         could do was print a sentence and lose the edit. The body is what makes the 409 a
         instruction: `current` is the row as it now stands, `actor` is who put it there, and a
         caller resends once when their change was disjoint from it (22 §5, 50 §5.3). */
      if (w.version !== undefined && current && w.version !== current.version)
        return clash<Entry>(current.version, current, lastActor(current.id) ?? 'someone else');

      /* Read before the checks, because uniqueness on a restore depends on it. */
      const deleting = patch.deleted_at !== undefined;

      const known = new Map(decl.fields.filter((f) => !f.retired).map((f) => [f.id, f]));
      const merged: Record<string, Json> = { ...(current?.fields ?? {}) };
      const touched: string[] = [];

      /* `by: decide` ON A FIELD: once the row is made, only an accepted proposal changes it, from
         every caller, the owner included. `FORBIDDEN` with the remedy in the sentence, as the scope
         rules give it, because the repair is the same: propose it, and the owner's press applies it. */
      const decidedOnly = (key: string): Result<Entry> =>
        no<Entry>('FORBIDDEN', `${key} changes only by an accepted proposal. Propose the change, and it is applied when the owner accepts it.`, {
          at: key,
        });

      /* Defaults first, and on a create only: a default is what a row starts as, not what it
         returns to when somebody clears a field. */
      if (!current)
        for (const f of decl.fields)
          if (f.default !== undefined && patch[f.id] === undefined && !f.derived) merged[f.id] = f.default;

      for (const [key, value] of Object.entries(patch)) {
        if (key === 'deleted_at') continue;
        if (RESERVED.has(key) || key.startsWith('_'))
          return no<Entry>('FIELD_UNKNOWN', `${key} is the record's, not a field you may write.`, { at: key });
        const field = known.get(key);
        if (!field)
          return no<Entry>('FIELD_UNKNOWN', `${register} has no field called ${key}.`, {
            at: key,
            allowed: [...known.keys()],
          });
        if (field.derived)
          return no<Entry>('IMMUTABLE_FIELD', `${key} is derived, so the record computes it.`, { at: key });
        /* THE RECORD'S OWN, on the one register the kernel declares: when a run was last heard from,
           the project it resolved to, and the token that opened it. */
        if (register === SESSION && KERNEL_WRITTEN.includes(key))
          return no<Entry>('IMMUTABLE_FIELD', `${key} is written by the record itself, and no caller sets it.`, { at: key });
        /* A SECRET FIELD IS THE VAULT DOOR'S, from every caller. It names the grant a key was sealed
           into, and `depositGrant` writes it in the transaction that seals the key, so a caller naming
           a grant could only point a row at a key sealed for another. `IMMUTABLE_FIELD`, the answer a
           kernel-written field gives, because the refusal is about the field and not about who asks. */
        if (field.type === 'secret' || field.of === 'secret')
          return no<Entry>(
            'IMMUTABLE_FIELD',
            `${key} says where a key is sealed, and only the vault writes it. Deposit the key, and the record points this field at it.`,
            { at: key },
          );
        touched.push(key);
        if (value === null) {
          if (field.immutable && current && current.fields[key] !== undefined)
            return no<Entry>('IMMUTABLE_FIELD', `${key} is set once, so it cannot be cleared either.`, { at: key });
          if (field.by === 'decide' && current?.fields[key] !== undefined && !door.decided) return decidedOnly(key);
          delete merged[key];
          continue;
        }

        const out = coerce(field, value, {
          refId: (reg, seq) => bySeq(reg, seq)?.id ?? null,
          grantExists: (id) => Boolean(sql.one('SELECT 1 AS x FROM grant WHERE id = ?', id)),
        });
        if (!out.ok) return { ok: false, refusal: out.refusal };

        /* AFTER COERCION, AND STRUCTURALLY. This compared the RAW patch value against the STORED
           coerced one by identity, so an immutable `money` could never be re-sent — an object is
           never `===` another object — and any client doing a read-modify-write of the whole field
           set was permanently locked out of the row. `'5'` against a stored `5` had the same
           problem in the other direction. */
        if (
          field.immutable &&
          current &&
          current.fields[key] !== undefined &&
          JSON.stringify(current.fields[key]) !== JSON.stringify(out.value)
        )
          return no<Entry>('IMMUTABLE_FIELD', `${key} is set once and cannot be changed.`, { at: key });
        /* Compared the way `immutable` is, so re-sending the value a row already holds is no change. */
        if (
          field.by === 'decide' &&
          current &&
          !door.decided &&
          JSON.stringify(current.fields[key] ?? null) !== JSON.stringify(isAbsent(out.value) ? null : out.value)
        )
          return decidedOnly(key);
        // Absent is one thing, not three: null, "" and [] all remove the key (K2).
        if (isAbsent(out.value)) delete merged[key];
        else merged[key] = out.value;
      }

      /* ── where the row applies, on a token's write ──
         The run is found here, before the checks, so its project can be the default and the limit;
         it is opened or re-attached only at persist, so a refused write still opens no run. */
      let located: Located | undefined;
      const locate = (): Located => (located ??= locateRun(w));
      /* A RUN BELONGS TO THE TOKEN THAT OPENED IT: a key that names another key's run, or holds its
         client id, is refused rather than signed as it, and so is a key writing that run's row. */
      if (w.principal?.kind === 'token') {
        const foreign = locate().found;
        if (foreign?.foreign) return notYours<Entry>(`${registers.get(SESSION)?.seq_prefix ?? 'S'}${foreign.seq}`);
        if (register === SESSION && current && owned(current.fields.token_id, w.principal.token ?? null))
          return notYours<Entry>(nameOf(current.id));
      }
      const scoped = w.principal?.kind === 'token' ? scopeFieldOf(decl.fields) : undefined;
      if (scoped) {
        const home = locate().project?.id ?? null;
        if (!current && scoped.type === 'ref' && patch[scoped.id] === undefined && home !== null) merged[scoped.id] = home;
        if (!current || touched.includes(scoped.id)) {
          const why = scopeFault(scoped, current?.fields[scoped.id], merged[scoped.id], !current, home, nameOf);
          if (why) return no<Entry>('FORBIDDEN', why, { at: scoped.id });
        }
      }

      /* ── the day a row was finished (`finished.ts`) ──
         Filled when the row enters a done state and emptied when it leaves one, in the write itself, so the history
         names whoever moved the row and not a mechanism after them. Today is the day in the record's timezone, where a
         person finished it, and the UTC day on a record that names none. */
      if (!deleting && decl.finished && stampFinished(decl, current ? { state: current.state } : null, merged, touched, dayIn(clock.now(), recordIdentity(sql)?.tz)) !== null)
        touched.push(decl.finished);

      /* ── validate ── */
      for (const f of decl.fields) {
        if (f.retired || f.derived) continue;
        const value = merged[f.id];

        if (f.required && value === undefined && (!current || touched.includes(f.id)))
          return no<Entry>('REQUIRED_MISSING', `${register} needs ${f.id}.`, { at: f.id });

        /* REQUIRED WHILE ANOTHER FIELD SAYS SO, checked when either of the two is written, for the
           reason `required` is: a row is not refused for a rule it predates. */
        const when = f.required_when;
        if (when && value === undefined && (!current || touched.includes(f.id) || touched.includes(when.field))) {
          const target = known.get(when.field);
          const is = target ? coerce(target, when.is) : null;
          if (is?.ok && JSON.stringify(merged[when.field] ?? null) === JSON.stringify(is.value))
            return no<Entry>('REQUIRED_MISSING', `${register} needs ${f.id} when ${when.field} is ${String(when.is)}.`, { at: f.id });
        }

        if (value !== undefined && f.type === 'enum' && !f.values?.includes(String(value)))
          return no<Entry>('ENUM_VALUE_UNKNOWN', `${f.id} has no value ${String(value)}.`, {
            at: f.id,
            allowed: f.values ?? [],
          });

        /* THE BOUNDS, on what this write set: the bytes of a text, the value of a number. */
        if (value !== undefined && (f.min !== undefined || f.max !== undefined) && (!current || touched.includes(f.id))) {
          const size = measure(f.type, value);
          const bytes = f.type === 'text' || f.type === 'document' ? ' bytes' : '';
          if (size !== null && ((f.min !== undefined && size < f.min) || (f.max !== undefined && size > f.max)))
            return no<Entry>('OUT_OF_BOUNDS', `${f.id} is ${size}${bytes}, and takes ${range(f.min, f.max)}${bytes}.`, { at: f.id });
        }

        /* A RESTORE TOUCHES NOTHING AND CHANGES EVERYTHING. The row was invisible to the partial
           unique index while it was deleted, so another row may have taken its value — and bringing
           it back raised a raw SQLite constraint error out of the write path and out of `serveApi`,
           which is a promise this package makes in bold two files away. */
        const restoring = deleting && patch.deleted_at === null && current?.deleted_at !== null;
        if (value !== undefined && f.unique && (touched.includes(f.id) || restoring)) {
          const clash = sql.one<{ seq: number | null; id: string }>(
            `SELECT seq, id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${f.id}') = ? AND id <> ?`,
            register,
            value as never,
            current?.id ?? '',
          );
          if (clash)
            return no<Entry>(
              clash.seq === null ? 'UNIQUE_VIOLATION' : 'ALREADY_KNOWN',
              clash.seq === null
                ? `${f.id} is already held by another row.`
                : /* Named as a person says it: `S1` on a register with a prefix, `tasks#1` otherwise. */
                  `${decl.seq_prefix && decl.seq_prefix !== '#' ? decl.seq_prefix : `${register}#`}${clash.seq} already has that ${f.id}.`,
              { at: f.id },
            );
        }
      }

      /* ── the state transition, which is the one rule about MOVES ── */
      const nextState = decl.state ? (merged[decl.state] as string | undefined) ?? null : null;
      if (decl.state && current && nextState !== current.state) {
        const field = known.get(decl.state);
        const from = current.state ?? '';
        const legal = field?.transitions?.[from];
        /* CLEARING THE STATE IS A MOVE, and skipping the check for it was a two-step way around
           every transition the register declares: clear it, and the next write starts from `''`,
           for which no transition is declared, so anything is legal. A row cannot leave a state it
           is not allowed to leave by passing through nothing. */
        if (legal && !legal.to.includes(nextState ?? ''))
          return no<Entry>(
            'TRANSITION_ILLEGAL',
            nextState === null
              ? `${register}#${current.seq} is ${from}, and clearing a state is a move like any other.`
              : `${register}#${current.seq} cannot go from ${from} to ${nextState}.`,
            { at: decl.state, allowed: legal.to },
          );
        /* A MOVE ONLY A DECISION MAKES, as a superseded learning coming back is: it is proposed. */
        if (legal?.by === 'decide' && !door.decided)
          return no<Entry>(
            'FORBIDDEN',
            `${nameOf(current.id)} leaves ${from} only by an accepted proposal. Propose the move, and it is made when the owner accepts it.`,
            { at: decl.state },
          );
        /* AND WHAT A MOVE OUT NEEDS FILLED, as the reason a learning was superseded. */
        const missing = legal?.requires?.find((need) => merged[need] === undefined);
        if (missing !== undefined)
          return no<Entry>('REQUIRED_MISSING', `${nameOf(current.id)} leaves ${from} only with ${missing} filled.`, { at: missing });
      }

      /* ── persist ── */
      const now = instant(clock.now());
      const deletedAt = deleting ? (patch.deleted_at === null ? null : now) : (current?.deleted_at ?? null);

      /* THE LADDER, for a token's write and nothing else: a person in a browser is never a run
         (`32 §2.1`). It runs here, after every check, so a refused write opens no run and moves no
         heartbeat. From here on `w.actor` is the run, which signs every event below and the rules
         pass. */
      if (w.principal?.kind === 'token') {
        const run = attribute(w, locate(), current?.id ?? null, now);
        if (run.own) {
          merged.last_seen = now;
          const { place, project } = locate();
          if (place && project) merged.project = project.spoken;
          else if (place) delete merged.project;
        }
        w = { ...w, actor: run.actor };
      }

      /* THE VAULT DOOR'S KEY, bound here and not earlier: after every check, so a refused write seals
         nothing, and after the ladder, so `grant.add` is signed by the run that deposited it. */
      if (door.seal) {
        const held = current?.fields[door.seal.field];
        const bound = door.seal.bind(w.actor, typeof held === 'string' ? held : null);
        if (!bound.ok) return bound;
        merged[door.seal.field] = bound.value.id;
        if (!touched.includes(door.seal.field)) touched.push(door.seal.field);
      }

      /* STAMPED AFTER VALIDATION, because these are the kernel's own fields and no declaration
         describes them — running them through the field loop would refuse every one. */
      if (w.stamp) Object.assign(merged, w.stamp);
      /* A run a key makes by hand is that key's, as one the ladder opens is: otherwise it would be a
         person's, and any key could name it. */
      if (register === SESSION && !current && w.principal?.kind === 'token' && w.principal.token !== undefined)
        merged.token_id = w.principal.token;
      /* A RUN WRITTEN BY HAND IS PLACED BY WHERE IT SAYS IT WORKED, as one the ladder opens is: an import or a person
         carrying a run over from somewhere else names its repository and folder, and the record finds its project. A key's
         run is placed by the ladder, and a stamped project is the ladder's. */
      if (register === SESSION && !current && w.principal?.kind !== 'token' && merged.project === undefined) {
        const said = (k: string) => (typeof merged[k] === 'string' ? (merged[k] as string) : undefined);
        const placed = resolveProject(sql, registers, { remote: said('remote'), repo: said('repo'), cwd: said('cwd') }).project;
        if (placed) merged.project = placed.spoken;
      }

      if (!current) {
        const id = mint();
        const seq = decl.series ? null : allocate(`seq:${register}`);
        sql.exec(
          'INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
          id,
          register,
          seq,
          JSON.stringify(merged),
          nextState,
          now,
          now,
          deletedAt,
        );
        const entry = byId(id, true)!;
        reproject(entry);
        rediary(entry);
        /* A `create` ROW CARRIES THE WHOLE SHAPE, with `field` null and `to_v` the row as JCS — so
           a replay reconstructs what was written without joining anything, and the redacted fields
           are the string `--redacted--` INSIDE that JSON rather than absent from it. */
        const batch = appendEvent({
          kind: 'create',
          target: id,
          register,
          actor: w.actor,
          note: w.note,
          at: now,
          batch: w.batch,
          field: null,
          to: Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, shown(register, k, v) ?? null])) as Json,
          ...(w.opId === undefined ? {} : { opId: w.opId }),
        });
        return ok(rules(entry, register, w, batch));
      }

      sql.exec(
        'UPDATE entry SET fields = ?, state = ?, version = version + 1, updated_at = ?, deleted_at = ? WHERE id = ?',
        JSON.stringify(merged),
        nextState,
        now,
        deletedAt,
        current.id,
      );
      const entry = byId(current.id, true)!;
      reproject(entry);
      rediary(entry);

      /* ONE ROW PER CHANGED FIELD, and this is the difference between a history and an activity
         feed. A ledger that says a row was edited and not WHAT changed cannot answer the only
         question anybody asks of it — and "append-only" is worth nothing if what was appended is
         "something happened". `state` is its own kind because a move is the one edit a register
         declares rules about; `tag` and `untag` are their own because a list changes by element. */
      const first = deleting
        ? deletedAt
          ? 'delete'
          : 'restore'
        : nextState !== current.state && decl.state
          ? 'state'
          : 'edit';

      let batch = '';
      const write = (kind: string, field: string | null, from: Json | undefined, to: Json | undefined): void => {
        const id = appendEvent({
          kind,
          target: current.id,
          register,
          actor: w.actor,
          at: now,
          /* THE NOTE GOES ON THE FIRST ROW ONLY. It is one thing somebody said about one write, not
             a thing they said about each field. */
          ...(batch === '' && w.note !== undefined ? { note: w.note } : {}),
          batch: w.batch ?? (batch === '' ? undefined : batch),
          field,
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
          ...(batch === '' && w.opId !== undefined ? { opId: w.opId } : {}),
        });
        if (batch === '') batch = w.batch ?? id;
      };

      if (deleting) write(first, null, undefined, undefined);
      else {
        for (const key of touched) {
          const was = current.fields[key];
          const is = merged[key];
          if (JSON.stringify(was ?? null) === JSON.stringify(is ?? null)) continue;

          /* A LIST CHANGES BY ELEMENT. `tags` going from two to three is one `tag` row naming the
             one that arrived, not an `edit` naming both arrays — which is what makes "when was this
             tagged late" a question with an answer.

             AND IT IS THE TYPE THAT DECIDES, NOT THE NAME. This read `key === 'tags' ||` first, so a
             register declaring a `tags` field of any other type took this branch: both sets came out
             empty, neither loop wrote a row, and the `continue` skipped the `edit`. Changing a text
             `tags` from "draft" to "final" alongside another field left the history saying only the
             other field had moved, which is the ledger quietly losing a write. Nothing enforces that
             a field called `tags` is a list, so the name was never a safe stand-in for the type. */
          const of = known.get(key);
          if (of?.type === 'list' && of.of === 'text') {
            const before = new Set(Array.isArray(was) ? was.map(String) : []);
            const after = new Set(Array.isArray(is) ? is.map(String) : []);
            for (const value of after) if (!before.has(value)) write('tag', key, undefined, value);
            for (const value of before) if (!after.has(value)) write('untag', key, value, undefined);
            continue;
          }

          const kind = decl.state && key === decl.state ? 'state' : 'edit';
          write(kind, key, shown(register, key, was) ?? null, shown(register, key, is) ?? null);
        }
        /* A WRITE THAT CHANGED NOTHING IS STILL A WRITE somebody made — a note against a row, or a
           re-send of the same values — and the ledger says so rather than swallowing it. */
        if (batch === '') write(first, null, undefined, undefined);
      }

      return ok(rules(entry, register, w, batch));
    });
  }

  /**
   * Step nine of the write path: the rules pass.
   *
   * INSIDE THE SAME TRANSACTION, so a rule's write and the write that triggered it commit together
   * or neither does — a row tagged `late` by a rule whose own write then failed would be a row
   * carrying a fact about a write that did not happen.
   *
   * The BATCH is the triggering write's event id, shared by everything it caused, so "undo this
   * expansion" is one query rather than an archaeology of timestamps.
   */
  /**
   * The run a token's write belongs to, found or opened, with its heartbeat moved.
   *
   * `findSession` holds the rungs and only reads; this is the half that writes, called from the
   * persist step of the write it serves. `own` means that write is to the run's own row, which then
   * carries `last_seen` itself: a heartbeat written beside it would be overwritten by it.
   */
  type Located = { found: Found | null; place: boolean; project: { id: string; spoken: string } | null };

  /**
   * The run a token's write belongs to, and the project it is in, found without writing anything.
   *
   * A run about to be opened, or re-attached by its client id from a place it names, is placed by
   * `resolveProject` (`scope.ts`). Any other run keeps the project it was placed in, so an agent's
   * later writes cannot move it by sending other hints.
   */
  function locateRun(w: WriteContext): Located {
    const hints = w.session ?? {};
    const found = findSession(sql, hints, clock.now(), w.principal?.token ?? null);
    if (found?.foreign) return { found, place: false, project: null };
    if (!found || (found.by === 'client' && Boolean(hints.remote || hints.repo || hints.cwd)))
      return { found, place: true, project: resolveProject(sql, registers, hints).project };
    const row = found.project ? get(found.project) : null;
    return { found, place: false, project: row && found.project ? { id: row.id, spoken: found.project } : null };
  }

  function attribute(w: WriteContext, at: Located, target: string | null, now: string): { actor: string; own: boolean } {
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    const batch = w.batch === undefined ? {} : { batch: w.batch };
    const { found } = at;
    const project = at.project?.spoken ?? null;

    if (found) {
      const actor = `${prefix}${found.seq}`;
      if (found.id === target) return { actor, own: true };
      const back =
        REVIVED.includes(found.state ?? '') &&
        writing(SESSION, found.id, { state: 'active' }, { actor, cascade: false, stamp: { last_seen: now }, ...batch }).ok;
      /* THE HEARTBEAT IS NOT A WRITE: no version, no `updated_at`, no event (`41 §13` #6). As a
         write, every agent write would turn the next edit of its run's row into a conflict. */
      if (!back) sql.exec("UPDATE entry SET fields = json_set(fields, '$.last_seen', ?) WHERE id = ?", now, found.id);
      /* A RE-ATTACHED RUN IS PLACED AGAIN, in place like the heartbeat and for the same reason: a
         run that came back in another folder is in that folder's project, and the record noting
         where it found the run is not an edit anybody made. */
      if (at.place && project !== found.project) {
        if (project === null) sql.exec("UPDATE entry SET fields = json_remove(fields, '$.project') WHERE id = ?", found.id);
        else sql.exec("UPDATE entry SET fields = json_set(fields, '$.project', ?) WHERE id = ?", project, found.id);
      }
      return { actor, own: false };
    }

    const opened = openRun(w, project, now, 'opened: auto');
    if (opened.ok) return { actor: `${prefix}${String(opened.value.seq)}`, own: false };
    /* A RUN THAT CANNOT BE OPENED IS A DEFECT, NOT A REFUSAL. The write it serves has passed every
       check and still goes in, under the caller's own name, and this observation is how anybody finds
       out that an agent's write went unattributed. */
    if (refused(opened))
      observe(sql, clock.now(), [
        { kind: 'write.refused', subject: `${SESSION}.${opened.refusal.at ?? '-'}:${opened.refusal.code}` },
      ]);
    return { actor: w.actor, own: false };
  }

  /**
   * A new run, opened under its own name with `note` saying why. In a transaction only.
   *
   * THE NUMBER IS READ BEFORE THE ROW TAKES IT, so the `create` event is signed by the run it creates;
   * nothing else allocates in this transaction in between.
   */
  function openRun(w: WriteContext, project: string | null, now: string, note: string): Result<Entry> {
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    const seq = Number(sql.one<{ n: number }>('SELECT next AS n FROM counter WHERE name = ?', `seq:${SESSION}`)?.n ?? 1);
    const fields = opening(w.session ?? {});
    /* A RUN IS NEVER UNTITLED: until its agent says what it is doing, it is named from where it opened. */
    if (typeof fields.doing !== 'string') fields.doing = provisionalTitle(w.session ?? {}, project === null ? null : (titleOfRow(project) ?? project), now);
    const opened = writing(SESSION, null, fields, {
      actor: `${prefix}${seq}`,
      note,
      cascade: false,
      stamp: {
        last_seen: now,
        ...(w.principal?.token === undefined ? {} : { token_id: w.principal.token }),
        ...(project === null ? {} : { project }),
      },
      ...(w.batch === undefined ? {} : { batch: w.batch }),
    });
    if (opened.ok && opened.value.seq !== seq) throw new TypeError(`${prefix}${seq} was opened as ${prefix}${String(opened.value.seq)}`);
    return opened;
  }

  /** Who signs what this context says: a token's run, found or opened with its heartbeat moved, or `actor`. In a transaction only. */
  function signedBy(w: WriteContext): string {
    return w.principal?.kind === 'token' ? attribute(w, locateRun(w), null, instant(clock.now())).actor : w.actor;
  }

  /**
   * The run a token's call belongs to, for a call that must know it before it writes: `attach` and
   * `handoff`, which write the run's own row.
   *
   * A FOUND RUN IS NOT WRITTEN, not even its heartbeat, because the caller's next write goes through the
   * ladder, which finds the same run and moves it. A run the ladder would open is opened here, signed by
   * itself, with `note` saying why. A person is refused, because a person is never a run.
   */
  function runFor(w: WriteContext, note = 'opened: auto'): Result<{ run: Entry; spoken: string; opened: boolean }> {
    const barred = schemaRefusal(state);
    if (barred) return barred;
    if (w.principal?.kind !== 'token')
      return no('FORBIDDEN', 'A run belongs to an agent token, and a person is never one.', { at: 'principal' });
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    return transaction(() => {
      const at = locateRun(w);
      if (at.found?.foreign) return notYours<{ run: Entry; spoken: string; opened: boolean }>(`${prefix}${String(at.found.seq)}`);
      const found = at.found ? byId(at.found.id) : null;
      if (found) return ok({ run: found, spoken: `${prefix}${String(found.seq)}`, opened: false });
      const opened = openRun(w, at.project?.spoken ?? null, instant(clock.now()), note);
      if (!opened.ok) return opened as Result<never>;
      return ok({ run: opened.value, spoken: `${prefix}${String(opened.value.seq)}`, opened: true });
    });
  }

  /**
   * The run these hints name, by the ladder's first four rungs, or `null`. It only reads. Given the
   * caller's `token`, a run another token opened is not its run, and is `null` too.
   */
  function findRun(hints: SessionHints, token?: string | null): Entry | null {
    const found = findSession(sql, hints, clock.now(), token);
    return found && !found.foreign ? byId(found.id) : null;
  }

  /** The refusal for a key reaching a run another key opened: `FORBIDDEN` at `session`, `30 §6`. */
  function notYours<T>(spoken: string): Result<T> {
    return no<T>(
      'FORBIDDEN',
      `${spoken} is a run another key opened, and a key works only as the runs it opened. Leave the run's name and client id out to open your own.`,
      { at: 'session' },
    );
  }

  /**
   * What a key's row may say about its grant, and never the key: whether a value is sealed, how often
   * it was opened, and when and by whom last. Who is the latest `grant.read` event, never a column.
   */
  function keyState(id: string): { sealed: boolean; opened: number; last_opened: string | null; last_by: string | null } {
    const grant = getGrant(sql, id);
    const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND kind = 'grant.read' ORDER BY rowid DESC LIMIT 1", `grant:${id}`);
    return {
      sealed: Boolean(grant && grant.revoked_at === null),
      opened: grant?.opened ?? 0,
      last_opened: grant?.last_opened ?? null,
      last_by: by?.actor ?? null,
    };
  }

  function rules(entry: Entry, register: string, w: WriteContext, batch: string): Entry {
    if (w.cascade === false) return entry;
    if (!sql.one("SELECT 1 AS x FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")) return entry;
    runRules(rulesDeps(), { entry, register, batch, actor: w.actor });
    /* The row as the rules left it. A caller that wrote `state: open` and got back a row a rule
       moved to `late` is being told the truth about what is in the record. */
    return byId(entry.id, true) ?? entry;
  }

  /**
   * Put a row's searchable line in step with the row, IN THE SAME TRANSACTION.
   *
   * An index updated afterwards is wrong for however long "afterwards" takes, and the window is
   * exactly when somebody is looking for the thing they just wrote.
   */
  /**
   * Reminders in step with the row, in the same transaction, on every write.
   *
   * Nobody sets a reminder: a field declares `remind:` and the record derives the rows, so a due date
   * that moves takes its reminders with it. Every product where the reminder is a separate object
   * has the same failure — the invoice slips a week, the reminder does not, and it fires about a
   * date that is no longer true.
   */
  function rediary(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl) return;
    reschedule(
      sql,
      mint,
      { id: entry.id, register: entry.register, fields: entry.fields, deleted: entry.deleted_at !== null },
      decl.fields as readonly Remindable[],
      clock.now(),
    );
  }

  function reproject(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl || decl.series) return;
    const row = sql.one<{ rowid: number }>('SELECT rowid FROM entry WHERE id = ?', entry.id);
    if (!row) return;
    project(
      sql,
      { rowid: row.rowid, id: entry.id, register: entry.register, deleted: entry.deleted_at !== null },
      projectedText(decl.fields, entry.fields),
    );
  }

  /**
   * One event per write.
   *
   * `MAX(event.rowid)` is the record's version, so this is not audit theatre: it is how "what
   * changed since I last looked" is a range scan rather than a diff of two snapshots.
   */
  function appendEvent(e: {
    kind: string;
    target: string;
    register: string;
    actor: string;
    note?: string | undefined;
    at: string;
    batch?: string | undefined;
    field?: string | null | undefined;
    from?: Json | undefined;
    to?: Json | undefined;
    opId?: string | undefined;
  }): string {
    const id = mint();
    /* `30 §3`: a model suggests, proposes and predicts, and writes nothing else into the log. */
    sparkMayWrite(e.actor, e.kind);
    /* `target` carries its KIND — `entry:01J…` — because an event is about a row, a decision, a pack
       or a declaration, and a bare id would make "everything about this" a search of four tables. */
    sql.exec(
      'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch, op_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      e.at,
      e.actor,
      e.kind,
      `entry:${e.target}`,
      'entry',
      e.field ?? null,
      e.from === undefined ? null : written(e.from),
      e.to === undefined ? null : written(e.to),
      e.note ?? null,
      e.batch ?? null,
      e.opId ?? null,
    );
    return id;
  }

  /** A value as the ledger stores it. `null` is "there was no prior value" and is not a string. */
  const written = (value: Json): string | null => (value === null ? null : jcs(value));

  /**
   * Which fields never have their VALUES written down, only the fact that they changed.
   *
   * `secret` AND `money` ALWAYS. An audit log is read by everybody who can read the record, and a
   * per-field history of what somebody was paid is a salary disclosed to the whole team by the
   * feature that exists to make the record trustworthy. Any other field joins the list with
   * `redact: true` on its declaration.
   *
   * WHAT IS KEPT IS WHO, WHEN AND WHICH FIELD — fully auditable — and what is dropped is only the
   * number. `--redacted--` rather than an absent row, so the difference between "not recorded" and
   * "recorded and withheld" is visible.
   */
  const REDACTED = '--redacted--';
  const redacts = (register: string, field: string): boolean => {
    const decl = registers.get(register)?.fields.find((f) => f.id === field);
    return decl ? decl.type === 'secret' || decl.type === 'money' || decl.redact === true : false;
  };
  const shown = (register: string, field: string, value: Json | undefined): Json | undefined =>
    value === undefined ? undefined : redacts(register, field) ? REDACTED : value;

  /** What the evaluator needs beyond SQL: the clock, and the shape of a register. */
  const evalContext = (): EvalContext => ({
    nowMs: clock.now(),
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    /* A ref is written by NAME in a sentence — `thing is Kiln` — because that is what a person says.
       The title field is the register's own, so the lookup is one indexed read per name. */
    refByTitle: (register, title) => {
      const decl = registers.get(register);
      if (!decl) return null;
      const row = sql.one<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${decl.title}') = ? LIMIT 1`,
        register,
        title,
      );
      return row?.id ?? null;
    },
    /* THE HOME CURRENCY AND THE DATED RATES, read only when a money figure meets a second currency. The rates are the
       rows of the `fx` list when a pack declares one (`08 §2.5`); a record without it has none. */
    fx: () => ({
      home: homeCurrency(sql),
      rates: registers.has('fx')
        ? ratesFrom(sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'fx' AND deleted_at IS NULL").map((r) => JSON.parse(r.fields) as Record<string, unknown>))
        : [],
    }),
  });

  /** What the page layer reads through. It runs queries it did not write, so it takes callbacks. */
  const pageDeps = (): PageDeps => ({
    pages: () =>
      sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'page' AND superseded_at IS NULL AND retired = 0")
        .map((r) => JSON.parse(r.body) as PageDecl),
    metric: (id) => {
      const row = sql.one<{ body: string }>(
        "SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0",
        `metric.${id}`,
      );
      return row ? liveTarget(sql, JSON.parse(row.body) as MetricDecl) : null;
    },
    read: (decl) => evaluateMetric(sql, decl, evalContext()),
    list: (q) => {
      /* AND THE ORDER GOES THROUGH. It was dropped here, silently, which is the one place a
         forwarded query can be wrong without anybody seeing it: the block asked, `list` could
         answer, and this wrapper rebuilt the query without the key. */
      const out = list({
        register: q.register,
        ...(q.where ? { where: q.where } : {}),
        ...(q.limit ? { limit: q.limit } : {}),
        ...(q.order?.length ? { order: q.order } : {}),
        ...(q.cursor ? { cursor: q.cursor } : {}),
      });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched, cursor: out.value.cursor }) : out;
    },
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    titleOf: (register) => registers.get(register)?.title ?? null,
    runway: (opening, legs, horizon, only) => {
      const out = runway(
        { sql, schemaOf: (r) => (registers.has(r) ? schemaOf(r) : null), titleOf: (r) => registers.get(r)?.title ?? null, hydrate: (id) => byId(id), ctx: evalContext() },
        opening,
        legs,
        horizon,
        only,
      );
      return out.ok ? out.value : null;
    },
    ctx: evalContext(),
    tz: recordIdentity(sql)?.tz ?? 'UTC',
    /* THE FOUR FIELDS A MEASURE NEEDS AND NOTHING ELSE, by the same expressions an index on them is built from, and the
       newest reading of each measure beside them so a measure that went quiet still says when it last spoke. */
    readings: (q) => {
      if (!registers.has(q.register)) return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });
      const schema = schemaOf(q.register);
      const c = compile(q.where, schema);
      if (c.bad.length) return { ok: false, refusal: c.bad[0]! };
      const at = fieldSqlIn(schema, q.when);
      const cols = `${at} AS at, ${fieldSqlIn(schema, q.value)} AS value, ${q.name ? fieldSqlIn(schema, q.name) : 'NULL'} AS name, ${q.unit ? fieldSqlIn(schema, q.unit) : 'NULL'} AS unit`;
      const from = `FROM entry WHERE register = ? AND deleted_at IS NULL AND (${c.sql})`;
      const readings = sql.all<{ at: unknown; value: unknown; name: unknown; unit: unknown }>(`SELECT ${cols} ${from} AND ${at} >= ?`, q.register, ...c.params, q.since);
      const latest = sql.all<{ at: unknown; value: unknown; name: unknown; unit: unknown }>(
        `SELECT at, value, name, unit FROM (SELECT ${cols}, max(${at}) AS newest ${from} AND ${at} < ? GROUP BY name)`,
        q.register,
        ...c.params,
        q.since,
      );
      return ok({ readings, latest });
    },
    points: (series, from, to) =>
      sql.all<{ at: string; value: number; unit: string | null }>(
        "SELECT at, value, unit FROM metric_point WHERE series = ? AND grain = 'day' AND at >= ? AND at <= ? ORDER BY at",
        series,
        from,
        to,
      ),
    scopeOf: (register) => {
      const f = scopeFieldOf(registers.get(register)?.fields ?? []);
      return f && 'to' in f && typeof f.to === 'string' ? { field: f.id, to: f.to } : null;
    },
    inScope: (register, project, opts) => inScope(register, project, opts),
    stepsOf: (register) =>
      [...registers.values()].flatMap((r) => {
        const to = r.steps ? r.fields.find((f) => f.id === r.steps!.of) : undefined;
        return r.steps && to && 'to' in to && to.to === register ? [{ register: r.id, ...r.steps }] : [];
      }),
    /* A ROW NAMED THE WAY A PAGE NAMES IT, `skills#3`, and only in the register the block reads. */
    history: (register, row) => {
      const m = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/.exec(row);
      const entry = m && m[1] === register ? bySeq(register, Number(m[2])) : null;
      if (!entry) return no('VALUE_MALFORMED', `${row} is not a row of ${register}.`, { at: 'row' });
      return ok(history(entry.id).map((e) => ({ ts: e.ts, actor: e.actor, kind: e.kind, field: e.field, to: e.to })));
    },
    /* THE RUNS NOT FINISHED, the most recently heard from first. The block applies its own `where` and `limit`. */
    sessionsLive: () =>
      sql
        .all<{ id: string }>(
          `SELECT id FROM entry WHERE register = '${SESSION}' AND deleted_at IS NULL AND state NOT IN (SELECT value FROM json_each(?))
           ORDER BY json_extract(fields, '$.last_seen') DESC`,
          JSON.stringify(FINISHED),
        )
        .map((r) => byId(r.id))
        .filter((e): e is Entry => e !== null),
    /* THE RECORD'S SCHEDULED ACTIONS, as the `actions` read lists them: keys by label, nothing sealed read. */
    actions: () => listActions(sql, clock.now()),
    /*
     * THE OPEN QUESTIONS, for a `queue` block: what is waiting on a person, dearest first.
     *
     * RANKED BY WHAT IT WOULD COST TO GET EACH ONE WRONG (`weigh.ts`), which is `19 §6`'s fourth
     * countermeasure against the decision gate becoming a rubber stamp. The band is computed here
     * rather than stored, so it needs no migration and no proposer can assert it about their own
     * question. Within a band the OLDEST comes first, and that is the opposite of the SQL underneath:
     * `listGovernance` reads newest first because a queue nobody has answered is read from the top,
     * and once there is a rank, the one worth meeting is the expensive question that has been sitting
     * rather than the expensive question that arrived a minute ago.
     *
     * THE OPTIONS ARE THE BODY'S OWN AND NOTHING IS INVENTED HERE. A proposal of any other kind is
     * accepted or rejected, and those two words belong to whatever is drawing the screen: the kernel
     * does not know what language the reader has, and a host that filled them in here would have two
     * places saying "Accept". So a question of another kind comes back with no options and the drawer
     * puts its own two there.
     *
     * A BODY IS WHATEVER THE PROPOSER WROTE, so every field is checked on the way out rather than
     * trusted: an option missing its label is left out, not drawn as `undefined`.
     */
    openQuestions: (limit) => {
      const nowMs = clock.now();
      const said = listGovernance({ sql, nowMs }, 'suggestion', { status: 'open', limit });
      const rows = said.ok ? said.value : [];
      const questions = rows.map((r) => {
        const body = r.body !== null && typeof r.body === 'object' && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : {};
        const offered = r.body_kind === 'options' && Array.isArray(body.options) ? (body.options as unknown[]) : [];
        const options = offered.flatMap((o) => {
          if (o === null || typeof o !== 'object' || Array.isArray(o)) return [];
          const one = o as Record<string, unknown>;
          if (typeof one.id !== 'string' || typeof one.label !== 'string') return [];
          return [{ key: one.id, label: one.label, because: typeof one.because === 'string' ? one.because : '', recommended: one.recommended === true }];
        });
        return {
          id: String(r.id),
          who: String(r.opened_by ?? ''),
          at: String(r.opened_at ?? ''),
          kind: String(r.body_kind ?? ''),
          question: questionOf(sql, String(r.id)) ?? '',
          why: typeof body.context === 'string' ? body.context : '',
          cost: costOf(String(r.body_kind ?? ''), r.body),
          options,
        };
      });
      /* A STABLE SORT, and `opened_at` is the tie-break the band needs: two questions in one band
         come back in the order they were asked, oldest first. `id` settles a tie on the instant,
         because two proposals written in the same millisecond must not swap places between reads. */
      questions.sort((a, b) => costRank(a.cost) - costRank(b.cost) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      return { questions, open: countOpenQuestions({ sql, nowMs }) };
    },
    /*
     * THE NEWEST EVENTS, for a `feed` or an `agents` block. A row's event names the row as a page names it,
     * `tickets#3`, with its title beside it, so a reader is never handed an entry id.
     *
     * NOT THE OWNER'S LINES. Keys, access, shares and members belong to the owner's own screens (the record's
     * `lineOf` holds them to an owner), and a page is read by whoever may open it, so they are left out here.
     * The read mark is a person's, and the kernel does not know who is reading, so it is `null` here and the record's `page` puts the reader's own in.
     */
    activity: (limit) => {
      const lines = sql.all<{ rowid: number; ts: string; actor: string; kind: string; target: string | null; target_kind: string | null; field: string | null; from_v: string | null; to_v: string | null; note: string | null }>(
        `SELECT rowid, ts, actor, kind, target, target_kind, field, from_v, to_v, note FROM event
          WHERE kind NOT LIKE 'grant.%' AND kind NOT LIKE 'access.%' AND kind NOT LIKE 'share.%'
            AND COALESCE(target_kind, '') NOT IN ('grant', 'vault_key', 'device_grant', 'member', 'person')
          ORDER BY rowid DESC LIMIT ?`,
        limit,
      );
      type Line = FeedLine & { ts: string; actor: string; note: string | null; row: Entry | null };
      /* A RECORD SETTING ITSELF UP IS ONE ROW OF A FEED BLOCK TOO, as it is one line of `whatsNew` (`feed.ts`). */
      const setup = setupCollapser<Line>((line) => {
        const tags = line.row?.fields.tags;
        return Array.isArray(tags) && tags.includes('example');
      });
      const said: Line[] = [];
      for (const e of lines) {
        const id = e.target?.startsWith('entry:') ? e.target.slice('entry:'.length) : null;
        /* A DELETED ROW IS NAMED BY WHAT IT WAS LAST CALLED: its line read `entry:01K…` once the row was gone. A row purged
           from the table has no name left to give, so its line says what was done and to nothing. */
        const row = id === null ? null : byId(id, true);
        const line: Line = {
          ts: e.ts,
          actor: e.actor,
          kind: e.kind,
          target: e.target,
          target_kind: e.target_kind,
          field: e.field,
          from: read(e.from_v),
          to: read(e.to_v),
          register: row?.register ?? null,
          seq: row?.seq ?? null,
          title: null,
          note: e.note,
          row,
        };
        said.push(...setup.push(line));
      }
      said.push(...setup.flush());
      return {
        events: said.map((e): ActivityEvent => {
          if (e.kind === SETUP_KIND) return { ts: e.ts, actor: e.actor, kind: e.kind, target: e.target, note: null, rows: typeof e.to === 'number' ? e.to : 0 };
          const id = e.target?.startsWith('entry:') ? e.target.slice('entry:'.length) : null;
          const row = e.row;
          if (!row) return { ts: e.ts, actor: e.actor, kind: e.kind, target: id === null ? e.target : null, note: e.note === '--erased--' ? null : e.note };
          const title = registers.get(row.register)?.title;
          const named = title ? row.fields[title] : undefined;
          return {
            ts: e.ts,
            actor: e.actor,
            kind: e.kind,
            target: `${row.register}#${row.seq}`,
            note: e.note === '--erased--' ? null : e.note,
            thing: typeof named === 'string' && named !== '' ? named : `${row.register}#${row.seq}`,
          };
        }),
        seen: null,
      };
    },
  });

  /**
   * What a digest reads through.
   *
   * The same callbacks the page layer takes, plus the two things only a record can answer: who the
   * owners are, and what time it is where the customer is.
   */
  const digestDeps = (): DigestDeps => {
    const deps = pageDeps();
    return {
      metric: deps.metric,
      read: deps.read,
      list: deps.list,
      schemaOf: deps.schemaOf,
      listOf: (register) => {
        const decl = registers.get(register) as (RegisterDecl & { one?: unknown }) | undefined;
        if (!decl) return null;
        /* WHAT ONE ROW IS CALLED AS THE RECORD SPEAKS IT: the use case's `one_<list>`, else the list's own word. */
        const said = speakingSettings(sql)[`one_${register}`];
        const one = typeof said === 'string' && said.trim() !== '' ? said : decl.one;
        return { title: decl.title, ...(typeof one === 'string' ? { one } : {}) };
      },
      ctx: deps.ctx,
      /* THE OWNERS, BY ADDRESS. A digest with nowhere to go is not sent rather than sent to the
         first person the record can name — which on a shared record would be somebody else. */
      owners: () =>
        sql
          .all<{ email: string | null }>(
            "SELECT p.email FROM member m JOIN person p ON p.id = m.person_id WHERE m.register = '*' AND m.level = 'owner' AND p.email IS NOT NULL AND p.suspended_at IS NULL",
          )
          .map((r) => String(r.email))
          .filter(Boolean),
      outbox: (kind, payload) => void enqueue(sql, mint, clock.now(), kind, payload),
      note: (actor, text) => noteEvent(sql, mint, clock.now(), actor, text),
      delivers: opts.delivers ?? [],
      /* ONE INTERRUPT AN HOUR, PER RECORD (09 §4). Counted over the outbox rather than over a
         counter somebody has to reset: the row IS the interrupt, so a push that was queued and never
         sent still counts — which is the conservative direction, and the only one that is honest
         about what the person's phone is going to do when the queue drains. */
      interrupted: () =>
        sql.one<{ n: number }>(
          "SELECT count(*) AS n FROM outbox WHERE kind = 'notify.push' AND created > ?",
          instant(clock.now() - 3_600_000),
        )?.n
          ? true
          : false,
      mint,
      nowMs: clock.now(),
      tz: recordIdentity(sql)?.tz ?? 'UTC',
    };
  };

  /**
   * What the rules pass reads and writes through.
   *
   * `write` IS THE SAME WRITE PATH, re-entered. That is the whole design: a rule is a caller like
   * any other, wearing its own name, and every check a person's write answers to it answers to too.
   */
  const rulesDeps = (): RulesDeps => ({
    sql,
    /* THE ONE ROUTER. A rule that declares `urgent` shows in the install diff as "interrupts you",
       and until now that diff was the only reader of the key — 09 §4 is what it should have meant. */
    interrupt: (said) => notify(digestDeps(), { ...said, urgent: true }),
    /* AND THE ONE ACTION THAT REACHES FORWARD IN TIME. `ON CONFLICT (kind, key) DO UPDATE` so a rule
       that fires twice on one row moves the date rather than arming a second reminder — the same
       idempotence `once_per` gives the firing, applied to what the firing arms. */
    later: (key, atMs, payload) =>
      sql.exec(
        `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'rule', ?, ?, 'pending', 0)
         ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
        mint(),
        instant(atMs),
        key,
        JSON.stringify(payload),
      ),
    rules: (register) =>
      sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")
        .map((r) => JSON.parse(r.body) as RuleDecl)
        .filter((r) => r.register === register),
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    ctx: evalContext(),
    /* CASCADE OFF. A rule's write does not run the rules pass again, so one rule cannot trigger
       another and nothing here loops — every product that allowed it grew a depth limit and then a
       graph explorer to explain the depth limit. */
    write: (register, spoken, patch, actor, batch) => write(register, spoken, patch, { actor, batch, cascade: false }),
    /* A GENERATED ROW RE-ENTERS THE WRITE PATH like any other: coerced, validated, transition-checked.
       `cascade: false` is what stops a size run generating a size run. */
    generate: (register, patch, actor, batch, stamp) =>
      write(register, null, patch, { actor, batch, cascade: false, stamp }),
    suggest: (question, options, actor) =>
      openSuggestion(governDeps(), actor, {
        question,
        body_kind: 'options',
        body: {
          options: options.map((label, i) => ({ id: `o${i + 1}`, label, because: 'a rule put this in front of you' })),
          requires_reason: true,
        },
      }),
    note: (entry, actor, text, batch) =>
      void appendEvent({ kind: 'note', target: entry.id, register: entry.register, actor, note: text, at: instant(clock.now()), batch }),
    stateOf: (register) => registers.get(register)?.state ?? null,
    schedule: (key, payload, pending) => marker(sql, mint, clock.now(), key, payload, pending),
    /* A RULE THAT RUNS A CALL QUEUES IT HERE, inside the write's transaction, so a write that rolls back sends nothing. */
    call: (ingest, f) =>
      queueCall(actionDeps(), { ingest, rule: f.rule, entry: f.entry, typeOf: (field) => f.schema.fields[field]?.type }),
    entry: (id) => byId(id),
    mint,
    nowMs: clock.now(),
  });

  /** The weekly look at what the record has noticed. One draft at most, and the governors first. */
  const analyseNow = (): Analysis =>
    analyse({
      sql,
      nowMs: clock.now(),
      mint,
      allocate,
      /* THE DRAFT RIDES THE OUTBOX like everything else that needs a model: the analyser's job ends
         at "this crossed a threshold", and what to propose about it is somebody else's turn. */
      outbox: (payload) => void enqueue(sql, mint, clock.now(), 'infer.draft', payload),
    });

  /** What a connector needs beyond SQL: who this record is, and the one insertion path to the outbox. */
  /**
   * What the ingest path is given. One factory, because `arrive` and `applyPage` write through the
   * same register with the same dedupe key — and two of these would be two answers to *is this row
   * already here*, one for an email and one for a connector.
   */
  const ingestDeps = (only?: IngestDecl): IngestDeps => ({
    sql,
    /* `only` IS A SCHEDULED ACTION'S ANSWER, offered to the declaration that fetched it and to no other. */
    ingests: () =>
      only
        ? [only]
        : sql
            .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
            .map((r) => JSON.parse(r.body) as IngestDecl),
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    write: (register, spoken, patch, actor) => write(register, spoken, patch, { actor }),
    /* THE LOOKUP PATH, which is the third of the three and the one that was still open — named
       in a commit message as fixed and not touched. `by` is `extract.<field>.lookup.by` from an
       ingest declaration, so a pack could point a `ref` at whatever row it liked and the row
       looked ordinary afterwards; `jsonPath` is still the one place that decides whether an
       identifier may become SQL.

       ONE SELECT OF EVERY LIVE ROW'S `by` VALUE, which is `43 §2`'s own description of what the
       record does here. It used to be one SELECT for one value with `= ?` and `LIMIT 1`, and that
       shape cannot answer the row `§4.3` actually specifies: the id whose value occurs as a whole
       token in the slice, longest wins, equal length with different ids ambiguous. None of those
       three is a question about one value.

       THE ROWS ARE BOUNDED BY THE REGISTER AND BY NOTHING ELSE, which `43 §7` costs as *r*
       `indexOf` scans and `§10` leaves to the caller. A lookup over a register with a hundred
       thousand rows is a hundred thousand rows read per arrival, and the honest place to cap that
       is a cap somebody has measured a need for rather than a number invented here. */
    rows: (register: string, by: string) =>
      sql
        .all<{ id: string; value: unknown }>(
          `SELECT id, json_extract(fields, '${jsonPath(by)}') AS value FROM entry WHERE register = ? AND deleted_at IS NULL`,
          register,
        )
        .flatMap((r) => (r.value === null || r.value === undefined ? [] : [{ id: r.id, value: String(r.value) }])),
    mint,
    allocate,
    nowMs: clock.now(),
    /* THE RECORD'S READERS FOR `43 §4.3`'s THREE NUMBER FORMS, WHEN THEY WERE WIRED. Absent is
       the old reading of all three, unchanged. */
    numbers: opts.numbers,
    /* AND `43 §4.3`'s LITERAL RULE FOR `enum` AND `lookup`, when one was wired. Absent is
       `String.includes` and no ambiguity, unchanged. */
    literals: opts.literals,
    dates: opts.dates,
    duplicate: opts.duplicate,
    normalise: opts.normalise,
  });

  const pullDeps = (): PullDeps => ({
    sql,
    recordId: recordIdentity(sql)?.id ?? 'self',
    nowMs: clock.now(),
    mint,
    outbox: (payload) => enqueue(sql, mint, clock.now(), 'pull.fetch', payload),
  });

  /** The connector declaration a `pull` row is about, or `null` when it has been retired. */
  const pullDecl = (ingest: string): PullDecl | null => {
    const row = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE id = ? AND kind = 'ingest' AND superseded_at IS NULL AND retired = 0",
      `ingest.${ingest}`,
    );
    return row ? (JSON.parse(row.body) as PullDecl) : null;
  };

  /** The active declaration a scheduled action runs from, and its pack, or `null` when it is retired or its pack is off. */
  const actionDecl = (ingest: string): { decl: ActionDecl; pack: string | null } | null => {
    const row = sql.one<{ body: string; pack_id: string | null }>(
      "SELECT body, pack_id FROM declaration WHERE id = ? AND kind = 'ingest' AND superseded_at IS NULL AND retired = 0",
      `ingest.${ingest}`,
    );
    return row ? { decl: JSON.parse(row.body) as ActionDecl, pack: row.pack_id } : null;
  };

  /**
   * What the scheduled actions' runner needs (`actions.ts`).
   *
   * AN ANSWER ARRIVES THROUGH THE ONE INGEST PATH, offered to the one declaration that asked for it, so what it
   * writes is written by `write` and its rules cascade like any other row's. The channel is `pull` because
   * `inbox_raw` knows five channels, and a poll's answer is a fetch of something the record already owns.
   */
  const actionDeps = (): ActionDeps => ({
    sql,
    recordId: recordIdentity(sql)?.id ?? 'self',
    nowMs: clock.now(),
    mint,
    enqueue: (payload) => enqueue(sql, mint, clock.now(), 'pull.fetch', payload),
    notify: (said) => void notify(digestDeps(), { ...said, urgent: true }),
    ack: (args) => ack(sql, ackDeps(), args),
    lookup: actionDecl,
    arrive: (decl, body, sha256) =>
      kernel.arrive({ channel: 'pull', body, sha256 }, { ...(decl as unknown as IngestDecl), channel: 'pull' } as IngestDecl),
    /* THE VAULT DECIDES WHETHER A LEASE IS GOOD ENOUGH, not the runner. The actor is the connector
       rather than a person, which is what the `grant.read` event will say. */
    seal: ({ actor, ...args }) => sealedGrant(sql, vaultDeps(actor), args, transaction),
    tz: recordIdentity(sql)?.tz ?? 'UTC',
  });

  /**
   * What the gate needs: the counters, and the write path for the rows an accepted `rowset` writes.
   *
   * `cascade: true` ON THOSE ROWS, because a row accepted at the gate is a row like any other — the
   * register's rules apply to it, and a rowset that went in with the rules switched off would be a
   * back door into the record wearing a decision's name.
   */
  const governDeps = (): GovernDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    allocate,
    hasRegister: (register) => registers.has(register),
    /* WHAT A CHANGE SENDS OUT, read from its declarations and nothing the proposer wrote about them. Only an action that
       is new, or whose host, key or fields differ from the one installed, needs the owner's press. */
    review: (to) => {
      const listed: unknown[] = Array.isArray((to as { declarations?: unknown }).declarations) ? ((to as { declarations: unknown[] }).declarations) : [to];
      const batch = listed.filter(
        (d): d is Declaration =>
          d !== null && typeof d === 'object' && typeof (d as Declaration).id === 'string' && typeof (d as Declaration).kind === 'string' && (d as Declaration).body !== null && typeof (d as Declaration).body === 'object',
      );
      if (batch.length === 0 || batch.length !== listed.length) return ok(null);
      /* EVERY CHANGE IS LINTED WHEN IT IS FILED, with the checks the install runs on acceptance, and not only one that
         sends something out: a page proposed with no blocks was found by the owner who pressed accept. */
      const fault = unreadable(batch) ?? lintBatch(sql, batch);
      if (fault) return { ok: false as const, refusal: fault };
      const egress = batch.flatMap((d) => {
        const out = d.kind === 'ingest' ? egressOf(d.body, titleOfRow) : null;
        return out === null ? [] : [out];
      });
      if (egress.length === 0) return ok(null);
      const changed = egress.filter((e) => {
        const was = actionDecl(e.ingest);
        const before = was === null ? null : egressOf(was.decl);
        return before === null || before.host !== e.host || before.key !== e.key || before.sends.join('\n') !== e.sends.join('\n');
      });
      if (changed.length === 0) return ok(null);
      return ok({ egress: changed, approve: approvalLines(changed) });
    },
    row: (register, at) => {
      const found = get(at, { includeDeleted: true });
      return found && found.register === register ? { id: found.id, deleted: found.deleted_at !== null } : null;
    },
    /* `decided`, because a row an accepted proposal writes is a decision carried out: the one way a
       field or a move declared `by: 'decide'` changes. An update carries its version, so a row
       changed since the proposal answers the house conflict. */
    write: (register, patch, actor, batch, update) =>
      write(
        register,
        update?.id ?? null,
        patch,
        { actor, batch, ...(update === undefined ? {} : { version: update.version }) },
        { decided: true },
      ),
    /* THE FROZEN BASELINE, read through the one evaluator every figure in this record goes through.
       A prediction's measure is a metric body without a target or a window (24 §4.6) — both are
       supplied here from the prediction's own, which is what makes it gradeable at all. */
    measure: (m, window) =>
      evaluateMetric(
        sql,
        {
          metric: 'prediction',
          name: 'baseline',
          source: m.source,
          ...(m.where === undefined ? {} : { where: m.where as never }),
          value: m.value as never,
          target: { gte: 0 },
          window,
          compare: 'none',
        },
        evalContext(),
      ),
  });

  const memberDeps = (): MemberDeps => ({ sql, nowMs: clock.now(), mint, hasRegister: (r) => registers.has(r) });

  /**
   * What a token needs beyond SQL.
   *
   * THE HASH AND THE RANDOMNESS ARE THE HOST'S, injected rather than imported, because the record
   * has no crypto of its own and a fixture has to be deterministic. `crypto` is on the platform in
   * both hosts and in Node, so this is a seam rather than a dependency.
   */
  const tokenDeps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    recordId: () => recordIdentity(sql)?.id ?? null,
    digest: async (text: string) => {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    random: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
  });

  /**
   * The stored hash for an invitation link's token, or `null` when the token is not one, or names another record.
   *
   * THE SAME SHA-256 A TOKEN IS STORED UNDER, from the same seam, so there is one digest in the kernel and not two.
   */
  const inviteHash = async (token: string): Promise<string | null> => {
    const parts = inviteParts(token);
    if (!parts || parts.record !== recordIdentity(sql)?.id) return null;
    return tokenDeps().digest(parts.secret);
  };

  /** What the two ladders need beyond SQL: an id, the suggestion counter, and one instant. */
  const ackDeps = (): AckDeps => ({
    mint,
    allocate,
    nowMs: clock.now(),
    /* FOR THE RETRY LADDER'S JITTER, which is arithmetic over the record, the kind and the job. */
    recordId: recordIdentity(sql)?.id ?? 'self',
    /* THE GATE, HANDED IN. An `infer.draft` that came back with a question files it through the same
       `propose` a person or a rule uses — one place that decides what a body must contain, one place
       that writes the `suggest` event, and `spark` as the actor because that is who drafted it. */
    propose: (p, actor) => openSuggestion(governDeps(), actor, p as never),
    /* AND THE OTHER HALF OF `prose: spark`. The digest was assembled inside the alarm's transaction
       and parked on this row; the ack is where it leaves. Two sentences at most, capped here rather
       than trusted from the wire — 45 §5.10. */
    sendDigest: (assembled, prose) => sendDigest(digestDeps(), assembled as Assembled, twoSentences(prose)),
  });

  /** The same, plus who is asking and which record this is — the two halves of a `grant.read` row. */
  const vaultDeps = (actor: string): VaultDeps => ({
    mint,
    nowMs: clock.now(),
    actor,
    recordId: recordIdentity(sql)?.id ?? null,
    /* THE ONE ROUTER, HANDED IN. 09 §4's rate limit, 09 §3's split between what a push carries and
       what an email does, and the `note` event, are all one function — and a credential expiring is
       one of the three things 09 §5 makes urgent by default. */
    interrupt: (said) => notify(digestDeps(), { ...said, urgent: true }),
  });

  async function tail(scheduler: Scheduler): Promise<void> {
    try {
      const armed = await scheduler.get();
      /* READ AFTER THE AWAIT, not before it. Reading the minimum first and then awaiting meant two
         overlapping tails — a drain's `finally` and a request's write, which on a Durable Object is
         an ordinary pair — each wrote the minimum it had seen BEFORE the other's rows existed.
         Whichever resumed last won, and in the probe that wrote an alarm four months later than the
         earliest pending row. The alarm was then simply late, by however long the gap was. */
      const work = pendingWork(sql, opts.delivers);
      if (work.nextDueMs === null) {
        if (armed !== null) await scheduler.clear();
      } else if (armed !== work.nextDueMs) await scheduler.set(work.nextDueMs);
    } finally {
      /* And the doorbell asks again too: a job queued while this tail was parked is a job the ring
         is about. */
      if (pendingWork(sql, opts.delivers).outboxPending) await scheduler.wake();
    }
  }

  /**
   * What each kind of schedule row does when its time comes.
   *
   * The one that is not here — `pull` — waits on a subsystem
   * this record does not have yet. A row of one of those kinds fails ONCE with a sentence naming the
   * kind rather than walking eight hours of a ladder, which is the honest behaviour: it says the
   * record cannot do this, instead of looking like it is trying.
   */
  /**
   * The hourly sweep: soft-deleted rows past thirty days, and runs not heard from in twelve hours.
   * The `purge` schedule row and the `purge` method both run this one function.
   */
  function sweepRecord(cutoffMs = clock.now() - 30 * 86_400_000, limit?: number) {
    const out = purge(sql, cutoffMs, clock.now(), transaction, mint, limit);
    const sessions = transaction(() =>
      sweepSessions(
        sql,
        clock.now(),
        (id, to) =>
          writing(SESSION, id, { state: to }, { actor: 'system', cascade: false, note: 'Nothing heard from this run in twelve hours.' })
            .ok,
      ),
    );
    /* A DEVICE GRANT past its time, or silent for fourteen days, is let go in the same hour. */
    transaction(() => deviceSweep(tokenDeps()));
    rulesAboutTime();
    return { ...out, sessions };
  }

  /**
   * A RULE ABOUT TIME IS READ AGAIN AS TIME PASSES. `due before -7d` becomes true of an invoice nobody has
   * touched, and a rule that runs only when a row is written would never see it. So each hour every rule whose
   * `when:` names a day relative to today, and which fires once per what it is about (`once_per`), is read
   * over its rows as a bulk apply: its marker keeps it to once, and a bulk apply queues no calls.
   */
  function rulesAboutTime() {
    const RELATIVE = /\b(?:today|yesterday|tomorrow)\b|[+-]\d+[dwmy]\b/u;
    const rules = sql
      .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")
      .map((r) => JSON.parse(r.body) as RuleDecl)
      .filter((r) => Array.isArray(r.once_per) && r.once_per.length > 0 && RELATIVE.test(JSON.stringify(r.when ?? '')));
    for (const rule of rules) transaction(() => applyRule(rulesDeps(), rule, { limit: 1000 }));
  }

  const HANDLERS: Partial<Record<ScheduleKind, Handler>> = {
    retry: retryHandler(sql),

    /* THE HOURLY SWEEP. A hundred rows at a time, and the next hour takes the next hundred — so a
       record that deleted ten thousand rows in one afternoon is swept without holding a write lock
       on the one thread it has. */
    purge: () => {
      sweepRecord();
      return clock.now() + 3_600_000;
    },

    /**
     * A prediction comes due.
     *
     * A DECISION THAT PREDICTED NOTHING CANNOT BE WRONG. The claim is checked against the measure it
     * named, once — `scored_at` is what makes a re-entered alarm find nothing to do rather than
     * overwrite a verdict with a later reading.
     */
    score: (row) => {
      const { prediction } = JSON.parse(row.payload) as { prediction?: string };
      if (!prediction) return null;
      const out = scorePrediction(sql, prediction, evalContext(), {
        mint,
        nowAt: instant(clock.now()),
        propose: (p, actor) => openSuggestion(governDeps(), actor, p as never),
      });
      if (!out.ok) throw new TypeError(fixOf(out));
      return null;
    },

    /**
     * The digest comes due: assemble it, queue it, and set the next one.
     *
     * BATCH BY DEFAULT. Almost nothing needs to reach somebody the moment it happens, and a product
     * that pushes each fact as it arrives is a product people mute.
     */
    digest: (row) => {
      const { declaration } = JSON.parse(row.payload) as { declaration?: string };
      const found = declaration
        ? sql.one<{ body: string }>(
            "SELECT body FROM declaration WHERE id = ? AND kind = 'digest' AND superseded_at IS NULL AND retired = 0",
            declaration,
          )
        : null;
      /* A DIGEST WHOSE DECLARATION IS GONE IS DROPPED, like a reminder whose row was deleted: the
         thing it was about is not true any more, and firing it anyway is the failure the whole
         derived-schedule design exists to avoid. */
      if (!found) return null;

      const decl = JSON.parse(found.body) as DigestDecl;
      runDigest(digestDeps(), decl);
      /* A SCHEDULE THAT IS NOT A SCHEDULE ENDS THE ROW rather than arming it for an hour nobody
         asked for. `null` is one-shot here, and the declaration is what needs fixing. */
      return nextOccurrence(decl.schedule, clock.now(), recordIdentity(sql)?.tz ?? 'UTC');
    },

    /**
     * The weekly analysis.
     *
     * A LOOP THAT CANNOT RUN AWAY. The governors are why this is safe to run every week: a record
     * too new or too quiet says nothing, one with three unanswered proposals does not add a fourth,
     * and one whose recent predictions were mostly wrong stops proposing until somebody has looked.
     */
    analyse: () => {
      analyseNow();
      return clock.now() + 7 * 86_400_000;
    },

    /**
     * Yesterday's reading, written down.
     *
     * A METRIC IS A QUESTION AND A SERIES IS ITS ANSWERS. Everything else the record computes is
     * computed fresh; this is the one thing it remembers, because "is this getting better" cannot
     * be asked of a number that only exists now.
     */
    snapshot: (row) => {
      const { metric } = JSON.parse(row.payload) as { metric?: string };
      const decl = metric ? pageDeps().metric(metric) : null;
      if (!decl) return null;
      snapshot(sql, decl, evalContext(), { nowAt: instant(clock.now()), tz: recordIdentity(sql)?.tz ?? 'UTC' });
      /* NEXT AT FIVE PAST MIDNIGHT, so the day it is about is finished and nothing else is competing
         for the alarm. */
      return nextOccurrence({ at: '00:05' }, clock.now(), recordIdentity(sql)?.tz ?? 'UTC');
    },

    /**
     * A connector's turn comes round.
     *
     * THE RECORD NEVER MAKES THE CALL. One outbox row carrying the ingest, its cursor and the id of
     * the grant the runner should open — and nothing else. The runner fetches, unwraps the
     * credential somewhere the record cannot reach, and hands each page back.
     */
    pull: (row) => {
      const { ingest } = JSON.parse(row.payload) as { ingest?: string };
      /* A CONNECTOR WHOSE DECLARATION IS GONE IS DROPPED, like every other derived row: the thing it
         was about is not true any more. */
      const decl = ingest ? pullDecl(ingest) : null;
      if (!decl) return null;
      const out = firePull(pullDeps(), row, decl);
      /* `kept` when it paused itself: the drain writing `done` over that pause would quietly resume a
         connector whose credential is gone. */
      return out.paused ? 'kept' : out.nextMs;
    },

    /* A scheduled `call` or `poll` (`loop/DIRECTION.md` §0b): one request queued, and the next run armed. A
       declaration that is gone, or whose pack is off, ends the row, and a key that is gone pauses it. */
    call: (row) => fireAction(actionDeps(), row),
    poll: (row) => fireAction(actionDeps(), row),

    /* A credential due for rotation. It says the id and the kind and never the label — a
       notification naming "Stripe, live" tells whoever can see it which one is worth taking. */
    rotate: (row) => rotateDue(sql, vaultDeps('system'), row.payload),

    /**
     * A rule came back to a row it asked to see again. `07 §6`'s `schedule` action.
     *
     * `rule` HAS BEEN ONE OF THE TEN SCHEDULE KINDS WITH NOTHING TO WRITE ONE AND NOTHING TO HANDLE
     * ONE. A row of a kind nothing handles fails once with a sentence naming the kind, which is the
     * right behaviour for a kind that should not exist — and the wrong one for a kind the action
     * grammar has always had a shape for.
     */
    rule: (row) => {
      const p = JSON.parse(row.payload) as { entry?: string; register?: string; rule?: string; note?: string };
      const entry = p.entry ? byId(p.entry) : null;
      /* THE ROW MOVED ON. Same rule as a reminder whose row was deleted: the thing it is about is not
         true any more, and firing it anyway is the failure the derived-schedule design exists to
         avoid. `once_per` markers land here too, and they name no entry — they are a marker rather
         than a reminder, so there is nothing to say and nothing to fail about. */
      if (!entry || !p.note) return null;
      appendEvent({
        kind: 'note',
        target: entry.id,
        register: entry.register,
        actor: `rule:${p.rule ?? 'unknown'}`,
        note: p.note.slice(0, 280),
        at: instant(clock.now()),
      });
      return null;
    },

    reminder: (row) => {
      const p = JSON.parse(row.payload) as { entry?: string; register?: string; field?: string; at?: string };
      const entry = p.entry ? byId(p.entry) : null;
      /* THE ROW MOVED ON. A reminder is derived from a date, and the date is gone or the row is — so
         the reminder is about nothing. Dropping it is right; firing it is the failure this whole
         design exists to avoid. */
      if (!entry || !p.field || entry.fields[p.field] === undefined) return null;

      const decl = registers.get(entry.register);
      const title = decl ? String(entry.fields[decl.title] ?? entry.id) : entry.id;
      const say = `${title} · ${p.field} ${String(entry.fields[p.field])}`.slice(0, 120);
      appendEvent({
        kind: 'note',
        target: entry.id,
        register: entry.register,
        actor: 'system',
        note: say,
        at: instant(clock.now()),
      });
      return null;
    },
  };

  /**
   * Every event about one row, oldest first: the row's history is the rows that made it.
   *
   * AND IT SAYS WHAT CHANGED. `field`, `from_v` and `to_v` are what make this a history rather than
   * an activity feed — "edited" is not an answer to any question anybody asks of an audit log, and
   * "append-only" is worth nothing if what was appended is that something happened.
   */
  const history = (target: string) =>
    sql
      .all<{
        id: string;
        ts: string;
        actor: string;
        kind: string;
        field: string | null;
        from_v: string | null;
        to_v: string | null;
        note: string | null;
        batch: string | null;
      }>(
        'SELECT id, ts, actor, kind, field, from_v, to_v, note, batch FROM event WHERE target = ? ORDER BY rowid',
        `entry:${target}`,
      )
      .map((e) => ({
        id: e.id,
        ts: e.ts,
        actor: e.actor,
        kind: e.kind,
        field: e.field,
        /* PARSED, because a caller reading a history should not have to know it is stored as JCS —
           and a value that will not parse comes back as the text it is rather than as a throw. */
        from: read(e.from_v),
        to: read(e.to_v),
        note: e.note,
        batch: e.batch,
      }));

  const read = (value: string | null): Json | null => {
    if (value === null) return null;
    try {
      return JSON.parse(value) as Json;
    } catch {
      return value;
    }
  };

  /**
   * Rows whose text matches, best first.
   *
   * The register ceiling is applied inside the query, not to its results: filtering afterwards gives
   * a caller a short page whenever the matches were mostly in a register they cannot see, and they
   * cannot tell that from there having been no matches.
   */
  function search(q: string, opts: { registers?: readonly string[] | undefined; limit?: number } = {}): Hit[] {
    const hits = ftsSearch(sql, q, opts);
    /* A SEARCH THAT FOUND NOTHING IS THE ONE OBSERVATION WORTH MAKING ABOUT READING. It is the
       record failing at the thing it exists for, in a way nobody reports — people try one more
       phrasing and give up. Five of them over ninety days on three separate days is a register
       somebody expected to exist. */
    if (hits.length === 0 && q.trim()) observe(sql, clock.now(), [{ kind: 'search.empty', subject: q.trim().toLowerCase().slice(0, 60) }]);
    return hits;
  }

  /** Every live row's line, from nothing. What an import runs once at the end. */
  const rebuildFts = (): number =>
    transaction(() =>
      rebuild(
        sql,
        (register) => registers.get(register)?.fields,
        (register) => Boolean(registers.get(register)?.series),
      ),
    );

  /**
   * One arrival leaves the inbox: its state moves, and a `state` event on `inbox_raw:<id>` says who moved it and to what.
   *
   * THE EVENT IS NOT ABOUT A ROW, so it carries its own target kind rather than `appendEvent`'s `entry:`, the way the
   * ingest's `match` and `extract` events do.
   */
  const settleArrival = (id: string, from: string, to: 'matched' | 'ignored', actor: string, note: string, batch: string): void => {
    sparkMayWrite(actor, 'state');
    sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', to, id);
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch) VALUES (?, ?, ?, 'state', ?, 'inbox_raw', 'state', ?, ?, ?, ?)",
      mint(),
      instant(clock.now()),
      actor,
      `inbox_raw:${id}`,
      written(from),
      written(to),
      note,
      batch,
    );
  };

  /** The row a person filed this arrival as, found through the batch its `state` event shares with the row's `create`. */
  const filedAs = (id: string): Entry | null => {
    const settled = sql.one<{ batch: string | null }>(
      "SELECT batch FROM event WHERE target = ? AND kind = 'state' AND to_v = ? ORDER BY rowid DESC LIMIT 1",
      `inbox_raw:${id}`,
      written('matched'),
    );
    if (!settled?.batch) return null;
    const made = sql.one<{ target: string }>(
      "SELECT target FROM event WHERE batch = ? AND kind = 'create' AND target LIKE 'entry:%' ORDER BY rowid LIMIT 1",
      settled.batch,
    );
    return made ? byId(made.target.slice('entry:'.length), true) : null;
  };

  /**
   * What a filed arrival's row is titled when the caller names no fields: its subject, or the first line of what it said.
   * A header that is not text is not one, as `inboxBefore` reads it.
   */
  const arrivalTitle = (headers: string | null, body: string | null): string => {
    let subject = '';
    try {
      const parsed: unknown = JSON.parse(headers ?? '{}');
      const said = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).subject : undefined;
      subject = typeof said === 'string' ? said.trim() : '';
    } catch {
      subject = '';
    }
    const line = (body ?? '').split('\n', 1)[0]?.trim() ?? '';
    return (subject || line || 'An arrival from the inbox').slice(0, 200);
  };

  const kernel = {
    transaction,
    allocate,
    reload,
    search,
    rebuildFts,

    /**
     * When the record next has something to do. ONE ALARM PER CUSTOMER, which is what an object per
     * customer buys: the alternative is a cron worker fanning out across every tenant, waking
     * records that have nothing to do in order to ask them.
     */
    pending: () => pendingWork(sql, opts.delivers),

    /** The reminders that are due, oldest first. What the alarm hands to whatever sends them. */
    due: (limit?: number) => due(sql, clock.now(), limit),

    /**
     * One number, with its target and its comparison.
     *
     * The predicate is compiled to SQL by the same function a `list` uses, so a tile and the page it
     * links to read the same rows — the alternative is two definitions of "overdue" that agree until
     * somebody edits one.
     */
    metric: (decl: MetricDecl): Result<Reading> => evaluateMetric(sql, liveTarget(sql, decl), evalContext()),

    /* ── pages ──────────────────────────────────────────────────── */

    /** Every page a person could open, templates expanded into one page per row. */
    /* AND WHICH REGISTERS EACH DRAWS FROM, so the record can scope the list the way `boot` scopes
       its own. It is stripped before it leaves — the caller gets a slug and a title. */
    /* AND THE RESOLVER GOES WITH IT, because a `stat` block names its registers through the metric
       declarations in its `cells` rather than through a `source` of its own. Without it a page made
       of figures named no register, was treated as prose, and was listed to everybody. */
    pages: () =>
      resolvePages(pageDeps()).map((p) => ({
        slug: p.slug,
        title: p.decl.title,
        registers: registersOf(p.decl, pageDeps().metric),
        /* WHERE IT SITS IN THE RAIL, for `boot`. A declaration's `nav` is checked at install, so only its shape is asked here. */
        nav: navOf(p.decl.nav),
        icon: typeof p.decl.icon === 'string' ? p.decl.icon : null,
      })),

    /**
     * One page, with every block run.
     *
     * ONE BLOCK'S REFUSAL IS ONE BLOCK. A page whose third block names a field nobody declared shows
     * the other four and says what happened in the third — a page that fails whole is a page nobody
     * can use to find out what is wrong with it.
     */
    page: (slug: string): Result<PageResult> => readPage(pageDeps(), slug),

    /** One metric document by its id, so a caller can fill a parameter and read it. */
    metricDecl: (id: string): MetricDecl | null => pageDeps().metric(id),

    /**
     * Which registers ONE block draws from, so the record can blank it for a caller who may not
     * read them.
     *
     * IT WAS `block.source` AT THE CALL SITE, AND A `stat` BLOCK HAS NONE. Its registers are named
     * through the metric declarations in its `cells`, which live in the record and which the
     * caller has no way to resolve, so the check simply did not apply to a page made of figures and
     * its readings were handed to anybody who could open the page.
     */
    blockRegisters: (block: PageBlock): string[] => registersOfBlock(block, pageDeps().metric),

    /**
     * What a rule WOULD do, without doing any of it.
     *
     * THE FEATURE, not a debugging aid. A rule changes rows while nobody is looking, and the honest
     * way to introduce one is to say "this matches 38 rows, wins on 31, loses 7 to `chase-late`"
     * BEFORE it is turned on. Every product that ships rules without this ships a feature people are
     * afraid of.
     */
    dryRun: (candidate: RuleDecl, limit?: number): Result<DryRun> => dryRun(rulesDeps(), candidate, limit),

    /**
     * Run one installed rule over the rows that are already there.
     *
     * A RULE FIRES ON A WRITE, so a rule written today has never seen the four hundred rows written
     * before it. Without this, turning one on means editing every one of those rows by hand.
     */
    applyRule: (id: string, opts: { dry?: boolean; limit?: number } = {}): Result<RuleApplied> => {
      const row = sql.one<{ body: string }>(
        "SELECT body FROM declaration WHERE id = ? AND kind = 'rule' AND superseded_at IS NULL AND retired = 0",
        id.startsWith('rule.') ? id : `rule.${id}`,
      );
      if (!row) return no<RuleApplied>('OUT_OF_BOUNDS', `There is no rule called ${id}.`, { at: 'id' });
      const rule = JSON.parse(row.body) as RuleDecl;
      return opts.dry ? applyRule(rulesDeps(), rule, opts) : transaction(() => applyRule(rulesDeps(), rule, opts));
    },

    /**
     * The cash walk: what is liquid now, then every dated movement in order, until it goes under.
     *
     * What it reads is DECLARED rather than wired: a forecast that knew the word "obligations" would
     * be a forecast that works for one record.
     */
    runway: (opening: number, legs: readonly Leg[], horizon?: number): Result<Runway> =>
      runway(
        { sql, schemaOf: (r) => (registers.has(r) ? schemaOf(r) : null), titleOf: (r) => registers.get(r)?.title ?? null, hydrate: (id) => byId(id), ctx: evalContext() },
        opening,
        legs,
        horizon,
      ),

    /**
     * A payload arrives, and the record fills itself.
     *
     * ONE DETERMINISTIC TRANSACTION with no model call in it: store, match, extract, validate,
     * write. The same payload twice produces the same record twice, and a payload nobody wrote a
     * pattern for is a row somebody can see rather than a silence.
     */
    arrive: (arrival: Arrival, only?: IngestDecl): Result<Arrived> => {
      const out = arrive(ingestDeps(only), arrival, transaction);

      /* 3′ — OUTSIDE THE ARRIVAL'S TRANSACTION, and deliberately. What is queued here is a model
         call somebody will pay for; the payload is already stored, and a draft that could roll the
         bytes back would make the record's memory depend on whether a proposal was worth making. */
      /* A REDELIVERY IS NOT AN ARRIVAL. Every webhook sender retries and most mail servers do too,
         and the redelivery branch returns the state it had the first time — so reading the state
         alone re-observed the payload and re-queued the draft, once per retry, which is exactly the
         bill `3′` exists to ration. */
      if (out.ok && out.value.state === 'untriaged' && !out.value.redelivered) {
        const headers = arrival.headers ?? {};
        transaction(() => {
          observe(sql, clock.now(), [{ kind: 'ingest.unmatched', subject: shapeOf(arrival.channel, headers) }]);
          propose(
            { sql, nowMs: clock.now(), outbox: (payload) => enqueue(sql, mint, clock.now(), 'infer.draft', payload) },
            arrival.channel,
            headers,
          );
        });
      }
      return out;
    },

    /**
     * Record what happened, pre-aggregated by day.
     *
     * NONE OF IT LEAVES THE OBJECT. Observations live in the customer's own record, which is why a
     * search term is fine here — that wall is what keeps this from being surveillance with a
     * dashboard.
     */
    observe: (batch: readonly Observation[]): Result<number> => transaction(() => observe(sql, clock.now(), batch)),

    /** Look at what the record has noticed, and propose at most one thing. */
    analyse: (): Analysis => analyseNow(),

    /**
     * A connector run comes back.
     *
     * `paused` IS A STATE, NOT A FAILURE. A 401 is a fact about the key rather than a transient
     * error, and eight exponential retries against a bank's auth endpoint is how an account gets
     * locked.
     */
    applyPull: (finish: { ingest: string; outcome: 'ok' | 'paused'; cursor?: string; dueAtMs?: number; error?: string }) =>
      transaction(() => applyPull(pullDeps(), finish)),

    /**
     * One page of a connector run, written. `47 §5.1` step 6.9.
     *
     * THE RUNNER NAMES THE RUN AND THE RECORD NAMES EVERYTHING ELSE. It hands over an outbox id
     * and rows; which connector that is, which register it writes to and who the rows are written
     * as are all read here, off this record's own declaration. A runner that could name the
     * register would be a stranger's API deciding where its answer lands.
     */
    applyPage: (page: PulledPage): Result<PageWrote> => applyPage(ingestDeps(), page, transaction),

    /**
     * A connector's page, read into rows. Handed to `@braindog/connect` as its `extract`, so the
     * only thing that ever turns a stranger's JSON into fields is the one the record already uses
     * for an email.
     */
    extract: (
      decl: ExtractDecl,
      raw: { ts: string; body: string },
      /* `rows` COMES THROUGH THE CONTEXT BECAUSE IT CANNOT COME THROUGH AN IMPORT. `42 §4.7`'s four
         non-JSON formats are read by `@braindog/extract`, rank 9 to this package's 7; the host is
         rank 15 and can reach both, so it hands the reader down beside the currency table. A host
         that does not is answered per page rather than silently. */
      ctx: { maxRows?: number; rows?: ExtractDeps['rows'] } = {},
    ): Extraction =>
      extractPull(
        { schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null), exponent: exponentOf, day, rows: ctx.rows },
        decl,
        raw,
        ctx,
      ),

    /**
     * A completed window's figures, upserted (`47 §5.1` step 10, `08 §3`).
     *
     * A CORRECTED DAY REPLACES THE DAY IT CORRECTS, because the key is the series, the grain and
     * the instant. A run that read the same window twice writes the same rows twice and the record
     * holds one of each.
     */
    writePoints: (ingest: string, points: readonly MetricPoint[]): Result<number> =>
      transaction(() => ok(writePoints(sql, `ingest:${ingest}`, clock.now(), points))),

    /**
     * One pass of the scheduled actions: claim the due `pull`, `call` and `poll` rows, send each job through the
     * host's executor, finish each, and re-arm (`loop/DIRECTION.md` §0b).
     *
     * THE EXECUTOR IS AN ARGUMENT, so there is no network in the kernel. Every step is its own transaction and
     * the executor runs between them, outside all of them.
     */
    async runActions(execute: Execute, opts: { limit?: number; scheduler?: Scheduler; page?: PagedRun; budget?: Budget } = {}): Promise<ActionsRun> {
      try {
        return await runScheduledActions(
          {
            drain: () => transaction(() => drainSchedule(sql, ackDeps(), HANDLERS, 100, ACTION_KINDS)),
            lease: (n) => transaction(() => lease(sql, ackDeps(), ['pull.fetch'], n)),
            prepare: (job) => transaction(() => prepareAction(actionDeps(), job)),
            finish: (ready, answer, hash) => transaction(() => finishAction(actionDeps(), ready, answer, hash)),
            release: (paged) =>
              void transaction(() => ack(sql, ackDeps(), { id: paged.job.id, state: 'done', leasedUntil: paged.job.leasedUntil })),
            /* NOT AN ACK: this row was never attempted, so it goes back on the shelf rather than down
               the retry ladder. `unlease` is fenced on the lease for the reason `ack` is. */
            releaseJob: (job) => void transaction(() => unlease(sql, { id: job.id, leasedUntil: job.leasedUntil })),
            dropPaged: (paged, why) =>
              transaction(() =>
                meter(
                  actionDeps(),
                  { ingest: paged.paged.ingest, channel: 'pull', host: paged.host, project: paged.decl.project, status: null, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 },
                  why,
                ),
              ),
            /* THE RECORD METERS THE RUN AND THE HOST ONLY REPORTS IT. What the host holds is what it
               spent; what the account owes is `meter`'s to decide, and it is decided in one place for
               all three channels rather than once here and once in whatever host is wired next. */
            meterPaged: (paged, report) =>
              transaction(() =>
                meter(
                  actionDeps(),
                  {
                    ingest: paged.paged.ingest,
                    channel: 'pull',
                    host: paged.host,
                    project: paged.decl.project,
                    status: report.status ?? null,
                    outcome: report.outcome,
                    requests: report.requests,
                    bytes: report.bytes,
                    ms: report.ms,
                    failures: report.failures,
                  },
                  report.say,
                ),
              ),
          },
          execute,
          opts.limit ?? 5,
          opts.page,
          opts.budget,
        );
      } finally {
        if (opts.scheduler) await tail(opts.scheduler);
      }
    },

    /** Start a paused scheduled action again, now. A refused key pauses one, and nothing else restarts it. */
    resumeAction: (ingest: string, actor: string) =>
      transaction(() => resumeScheduledAction({ sql, mint, nowMs: clock.now() }, ingest, actor)),

    /** Every active scheduled action: its schedule, its key by label, its last run and this month's counts. A read. */
    actions: () => listActions(sql, clock.now()),

    /**
     * Whether a key can carry an approval: held by the vault, and openable by a scheduled run.
     * `null` for fine, otherwise the code and the sentence. The row is looked at, never its bytes.
     */
    keyReady: (name: string, paged = false): KeyNotReady | null => keyReady(sql, name, paged),

    /** A row by its title, for a row id or spoken id: how a plan names the project an action runs for. */
    titleOfRow: (ref: string): string | null => titleOfRow(ref),

    /** The example rows a use case planted that nobody has touched, and how many examples somebody has (`untouchedExamples`). */
    examples: (): { untouched: number; touched: number; registers: Record<string, number>; others: number } => {
      const { untouched, touched } = untouchedExamples();
      const registers: Record<string, number> = {};
      for (const row of untouched) registers[row.register] = (registers[row.register] ?? 0) + 1;
      /* THE ROWS OF THEIR OWN BESIDE THEM, in the same lists: above zero once somebody has imported or typed their own, which is
         when the examples stop explaining and start getting in the way. */
      const others = Object.keys(registers).reduce(
        (n, register) =>
          n +
          (sql.one<{ n: number }>(
            "SELECT count(*) AS n FROM entry e WHERE register = ? AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM json_each(CASE json_type(e.fields, '$.tags') WHEN 'array' THEN json_extract(e.fields, '$.tags') ELSE '[]' END) WHERE value = 'example')",
            register,
          )?.n ?? 0),
        0,
      );
      return { untouched: untouched.length, touched, registers, others };
    },

    /**
     * Delete every untouched example row, in one transaction and one batch, through the write path, so each is a `delete`
     * the log keeps and a restore can undo. A row somebody edited, noted, tagged, restored or pointed a row of their own
     * at is kept. Answers how many went and how many examples were kept.
     */
    clearExamples: (w: WriteContext): Result<{ cleared: number; kept: number }> =>
      transaction(() => {
        const { untouched, touched } = untouchedExamples();
        const batch = w.batch ?? mint();
        let cleared = 0;
        let kept = touched;
        for (const row of untouched) {
          const out = write(row.register, row.id, { deleted_at: true }, { ...w, batch, note: w.note ?? 'Cleared the examples' });
          if (out.ok) cleared++;
          else kept++;
        }
        return ok({ cleared, kept });
      }),

    /** Every https origin an active `pull`, `call` or `poll` names. A host's executor sends to these and nothing else. */
    /**
     * What a pack that is off would call out once it is on again: each retired action's `CALLS OUT` line, and its key line,
     * as a plan says them. Turning a pack on re-arms what it retired, so a proposal to do it shows these, as an install does.
     */
    callsWhenEnabled: (id: string): string[] =>
      approvalLines(
        sql
          .all<{ body: string }>(
            "SELECT body FROM declaration WHERE coalesce(pack_id, json_extract(body, '$.pack')) = ? AND kind = 'ingest' AND superseded_at IS NULL AND retired = 1 ORDER BY id",
            id,
          )
          .flatMap((r) => {
            const body = JSON.parse(r.body) as { fetch?: { base?: unknown } };
            const e = egressOf(body, titleOfRow);
            if (e === null) return [];
            const base = e.host === null && typeof body.fetch?.base === 'string' ? body.fetch.base : null;
            let host: string | null = null;
            try {
              host = base === null ? null : new URL(base).host;
            } catch {
              host = null;
            }
            /* THE HOST IS REWRITTEN INTO THE LINE BEFORE THE LIST IS ASSEMBLED, because a `pull`
               says `fetch.base` where the other two say `url`, and the line is built from `url`. */
            return [{ ...e, line: host === null ? e.line : e.line.replace('CALLS OUT no host declared', `CALLS OUT ${host}`) }];
          }),
      ),

    actionOrigins: (): string[] =>
      originsOf(
        sql
          .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
          .map((r) => JSON.parse(r.body) as ActionDecl),
      ),

    /** One block, without a page around it — what a `draw` tool hands an agent. */
    block: (decl: PageBlock): BlockResult => readBlock(pageDeps(), decl),

    /* ── the vault: what a key opens, never the key ───────────────────── */

    /** Every grant, in the order a person reads them. Sealed bytes never leave through here. */
    grants: (): GrantRow[] => listGrants(sql),
    grant: (id: string): GrantRow | null => getGrant(sql, id),

    /** Mint a grant, or rotate one — which differ by one column and a version number. */
    bindGrant: (args: BindGrantArgs, actor: string): Result<GrantRow> =>
      bindGrant(sql, vaultDeps(actor), args, transaction),

    /** Seal a key into a grant and point a row's secret field at it, in one write. INTERNAL: the vault door's. */
    depositGrant,

    /**
     * Hand the sealed bytes out, and count the reading.
     *
     * THE KERNEL CANNOT OPEN THEM. It assembles the ciphertext, the wrapped record key and the AAD
     * and hands all three to whoever asked — which is what makes "we cannot read your record" a fact
     * about the code rather than a promise about our intentions.
     */
    openGrant: (args: { id: string; kek_id?: string | undefined }, actor: string): Result<SealedGrant> =>
      openGrant(sql, vaultDeps(actor), args, transaction),

    /**
     * Hand a credential to a runner that is holding a live lease on the job needing it.
     *
     * NOT `openGrant` WITH A DIFFERENT ACTOR. What authorises this is the lease, not a person, and
     * it authorises one credential for as long as the lease lasts. The refusals are in `vault.ts`.
     */
    sealedGrant: (args: { outbox: string; leasedUntil: string; grant: string }, actor: string): Result<LeasedSeal> =>
      sealedGrant(sql, vaultDeps(actor), args, transaction),

    /** Take a grant out of service and destroy the bytes. The row stays: what it opened is a fact. */
    revokeGrant: (id: string, actor: string): Result<null> => revokeGrant(sql, vaultDeps(actor), id, transaction),

    /**
     * What a digest would say if it went now. It sends nothing.
     *
     * THE SAME ASSEMBLY THE SCHEDULED ONE USES, and it has to be: a "today" screen computed by a
     * second code path is a screen that disagrees with the email on the day one of them is wrong,
     * and the person reading both has no way to tell which. `sectionsOf` is the one assembly, and
     * this is it without the outbox row on the end.
     */
    digestToday: (id?: string) => {
      const deps = digestDeps();
      const decls = sql
        .all<{ id: string; body: string }>(
          "SELECT id, body FROM declaration WHERE kind = 'digest' AND superseded_at IS NULL AND retired = 0 ORDER BY id",
        )
        .map((r) => JSON.parse(r.body) as DigestDecl)
        .filter((d) => id === undefined || d.digest === id);

      return decls.map((decl) => {
        const sections = sectionsOf(deps, decl);
        /* THE SAME FILTER THE SCHEDULED DIGEST USES, and the headline is over the SAME list. A
           second copy of it made the screen say the digest was carrying nothing on the morning the
           digest went out, with a headline the email did not have. */
        const carrying = carryingOf(sections);
        return {
          digest: decl.digest,
          name: decl.name ?? decl.digest,
          headline: headline(decl.name ?? decl.digest, carrying),
          sections,
          carrying: carrying.length,
        };
      });
    },

    /**
     * The read mark: how far this person has read — measured in EVENTS, not in clock time.
     *
     * `45 §5.2` passes `upTo`, an event rowid, and takes the mark from that event's own `ts`:
     * `MAX(COALESCE(seen_at, ''), (SELECT ts FROM event WHERE rowid = ?))`. This took no argument
     * and stamped `clock.now()` instead, which is a different fact — *when you last pressed the
     * button* rather than *how far you have read* — and it made the whole method unreplayable: the
     * same call twice gives two answers, and a client that knows it has read to event 40 has no way
     * to say so.
     *
     * AND THE `MAX()` GUARD WAS THEN AGAINST A WALL CLOCK. The old comment here described the
     * hazard it had just created — *"a value stamped from a wall clock ahead of the record's is a
     * mark no later read can ever move, pinned in the future for as long as the record lags"* — and
     * that hazard does not exist in the specified form, because an event's `ts` IS the record's
     * clock. `45 §5`'s own regression case is `upTo: 40` then `upTo: 30`, and it could not be
     * written against a method with no `upTo`.
     *
     * `MAX()` ONLY, so a phone that was asleep for a week cannot move the mark backwards when it
     * wakes up and reports where it had got to. And it is NOT an event: a read is not a write to
     * the record, or every glance at a screen would be a line in somebody's history.
     *
     * ONE DEVIATION FROM `45 §5.2`'s SQL, and it is the guard failing on its own terms. SQLite's
     * scalar `max()` returns NULL if any argument is NULL, so an `upTo` naming an event that is not
     * there — a replayed call after a restore, a client one migration behind — sets `seen_at` to
     * NULL and **erases the mark entirely**. Measured: `MAX(COALESCE(seen_at,''), (SELECT ts FROM e
     * WHERE rowid = 999))` is `null`. The subselect gets its own `COALESCE`, so an unknown id leaves
     * the mark exactly where it was, which is what "never moves it back" has to mean — and
     * **`45 §5.2` is amended to carry it**, in the same revision, rather than left disagreeing.
     */
    markRead: (person: string, upTo: number): string | null => {
      transaction(() => {
        sql.exec(
          `UPDATE member SET seen_at = MAX(COALESCE(seen_at, ''), COALESCE((SELECT ts FROM event WHERE rowid = ?), ''))
            WHERE person_id = ? AND register = '*'`,
          upTo,
          person,
        );
      });
      return (
        sql.one<{ seen_at: string | null }>("SELECT seen_at FROM member WHERE person_id = ? AND register = '*'", person)
          ?.seen_at ?? null
      );
    },

    /**
     * What one person arranged for themselves, key by key (`pref`, migration 9). Not an event, for the reason a read
     * mark is not one.
     */
    prefsOf: (person: string): Record<string, unknown> =>
      Object.fromEntries(
        sql.all<{ key: string; value: string }>('SELECT key, value FROM pref WHERE person_id = ? ORDER BY key', person).map((r) => [r.key, JSON.parse(r.value)]),
      ),

    /** Set one, or with `null` take it away. The value is checked by the record before it reaches here. */
    setPref: (person: string, key: string, value: unknown): void => {
      if (value === null) sql.exec('DELETE FROM pref WHERE person_id = ? AND key = ?', person, key);
      else
        sql.exec(
          `INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (person_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          person,
          key,
          JSON.stringify(value),
          instant(clock.now()),
        );
    },

    /** The newest event, which is what a client that has read everything passes as `upTo`. */
    newestEvent: (): number => Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0),

    /**
     * Events below `before`, newest first, a batch at a time: what `whatsNew` and `recentHistory` scan.
     *
     * UNFILTERED ON PURPOSE. Which of these a caller may see is the record's question, and it is asked
     * of each row there, so the kernel hands over the log in order and nothing else.
     */
    eventsBefore: (before: number | null, limit: number): EventLine[] =>
      sql
        .all<{
          rowid: number;
          id: string;
          ts: string;
          actor: string;
          kind: string;
          target: string | null;
          target_kind: string | null;
          field: string | null;
          from_v: string | null;
          to_v: string | null;
          note: string | null;
          batch: string | null;
        }>(
          'SELECT rowid, id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch FROM event WHERE rowid < ? ORDER BY rowid DESC LIMIT ?',
          before ?? Number.MAX_SAFE_INTEGER,
          limit,
        )
        .map((e) => ({
          rowid: Number(e.rowid),
          id: e.id,
          ts: e.ts,
          actor: e.actor,
          kind: e.kind,
          target: e.target,
          target_kind: e.target_kind,
          field: e.field,
          from: read(e.from_v),
          to: read(e.to_v),
          note: e.note,
          batch: e.batch,
        })),

    /**
     * The first event after this person's read mark, or one past the newest when nothing is after it.
     * `45 §5.3` step 1; a person with no mark has read nothing, so it is the first event there is.
     */
    unreadFrom: (person: string | null): number =>
      Number(
        sql.one<{ v: number }>(
          `SELECT COALESCE(MIN(rowid), (SELECT COALESCE(MAX(rowid), 0) + 1 FROM event)) AS v FROM event
            WHERE ts > COALESCE((SELECT seen_at FROM member WHERE person_id = ? AND register = '*'), '')`,
          person ?? '',
        )?.v ?? 1,
      ),

    /** Arrivals nothing claimed and nobody has dealt with yet: how many the inbox holds. */
    inboxWaiting: (): number =>
      Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE state IN ('untriaged', 'review')")?.n ?? 0),

    /**
     * The arrivals `inboxWaiting` counts, below `before`, newest first: what the record's `inbox` pages through.
     *
     * `rowid` AND NOT `ts`, because a burst arrives inside one millisecond and a cursor on `ts` would drop or repeat the
     * rest of it. Rows are only ever inserted, so the order they were stored in is the order they arrived in.
     */
    inboxBefore: (before: number | null, limit: number): InboxLine[] =>
      sql
        .all<{ rowid: number; id: string; ts: string; channel: string; headers: string | null; body: string | null; state: string; reason: string | null }>(
          "SELECT rowid, id, ts, channel, headers, body, state, reason FROM inbox_raw WHERE state IN ('untriaged', 'review') AND rowid < ? ORDER BY rowid DESC LIMIT ?",
          before ?? Number.MAX_SAFE_INTEGER,
          limit,
        )
        .map((r) => {
          /* A HEADER THAT IS NOT TEXT IS NOT ONE. `headers` was written by `arrive` as JSON, and a row restored from
             somewhere else is still read without throwing. */
          let headers: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(r.headers ?? '{}');
            if (parsed && typeof parsed === 'object') headers = parsed as Record<string, unknown>;
          } catch {
            headers = {};
          }
          const text = (key: string): string => (typeof headers[key] === 'string' ? (headers[key] as string) : '');
          return {
            rowid: Number(r.rowid),
            id: r.id,
            ts: r.ts,
            channel: r.channel,
            from: text('from'),
            to: text('to'),
            subject: text('subject'),
            body: r.body,
            state: r.state === 'review' ? 'review' : 'untriaged',
            reason: r.reason,
          };
        }),

    /**
     * File an arrival as a row: the row goes through the ordinary write path, signed like any write, and the arrival is
     * marked `matched` with a `state` event in the same batch, in one transaction.
     *
     * `matched` AND NOT A NEW STATE. The DDL's seven already say what happened: something claimed the arrival and a row
     * came of it. A person claiming it is told apart from an ingest by the event's actor, not by a word the ingest does
     * not use.
     *
     * AGAIN IS THE SAME ANSWER. An arrival a person already filed answers with the row it became and writes nothing, so a
     * retry whose answer was lost is one row and not two. An arrival in any state the inbox does not show is refused.
     */
    fileArrival: (id: string, register: string, fields: Patch | null, w: WriteContext): Result<ArrivalSettled> =>
      transaction(() => {
        const raw = sql.one<{ state: string; headers: string | null; body: string | null }>(
          'SELECT state, headers, body FROM inbox_raw WHERE id = ?',
          id,
        );
        if (!raw) return no<ArrivalSettled>('OUT_OF_BOUNDS', 'There is no arrival with that id in this inbox.', { at: 'id' });
        if (raw.state === 'matched') {
          const filed = filedAs(id);
          if (filed) return ok<ArrivalSettled>({ id, state: 'matched', entry: filed, already: true });
        }
        if (raw.state !== 'untriaged' && raw.state !== 'review')
          return no<ArrivalSettled>('OUT_OF_BOUNDS', `This arrival has already left the inbox, as ${raw.state}. Nothing was written.`, {
            at: 'id',
          });
        const title = registers.get(register)?.title;
        const patch: Patch = fields ?? (title ? { [title]: arrivalTitle(raw.headers, raw.body) } : {});
        const batch = w.batch ?? mint();
        const out = write(register, null, patch, { ...w, batch });
        if (!out.ok) return out as unknown as Result<ArrivalSettled>;
        settleArrival(id, raw.state, 'matched', w.actor, `Filed as ${register}#${out.value.seq ?? ''}.`, batch);
        return ok<ArrivalSettled>({ id, state: 'matched', entry: out.value, already: false });
      }),

    /**
     * Archive an arrival: marked `ignored`, with a `state` event, and its bytes kept. Nothing is filed.
     *
     * An arrival already archived is the same answer with nothing written; one in any other state the inbox does not show
     * is refused, because it has already left the inbox some other way.
     */
    archiveArrival: (id: string, actor: string): Result<ArrivalSettled> =>
      transaction(() => {
        const raw = sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', id);
        if (!raw) return no<ArrivalSettled>('OUT_OF_BOUNDS', 'There is no arrival with that id in this inbox.', { at: 'id' });
        if (raw.state === 'ignored') return ok<ArrivalSettled>({ id, state: 'ignored', entry: null, already: true });
        if (raw.state !== 'untriaged' && raw.state !== 'review')
          return no<ArrivalSettled>('OUT_OF_BOUNDS', `This arrival has already left the inbox, as ${raw.state}. Nothing was changed.`, {
            at: 'id',
          });
        settleArrival(id, raw.state, 'ignored', actor, 'Archived from the inbox.', mint());
        return ok<ArrivalSettled>({ id, state: 'ignored', entry: null, already: false });
      }),

    /* `seenAt()` WAS HERE AND IS GONE. Its only caller was `markRead`'s own return — it wrote the
       mark, then read it back through a second method — and `markRead` returns the mark now, which
       is what `45 §5.2`'s SQL leaves in the row. `members()` carries `seen_at` per person for
       everything else, so a third way to ask the same column would be a third way to drift. */

    /* ── who is on the record ────────────────────────────── */

    /** Everybody on it, with what they hold and where. */
    members: (): Member[] => members(sql),

    /**
     * What one person may do inside this record, or `null` if they are not on it.
     *
     * THE ONE THING A HOST ASKS BEFORE IT LETS ANYBODY IN. It is the record's own table rather than
     * the Directory's, because that is the table `invite` writes and the one that travels in a
     * `.brain` file — and reading the level from anywhere else made removing somebody a change that
     * did not stop them writing.
     */
    /**
     * One note against one row — `30 §2`'s `note` kind, "the one row a person or an agent writes on
     * purpose".
     *
     * NOT AN `edit`. This went through `update` with an empty patch and a note, so a log entry was a
     * WRITE: it bumped the row's version, which means anybody holding the version they read got a
     * spurious `VERSION_STALE` on their next real change, for a call that changed no field. `20 §1`
     * puts `log` in the `append` half beside `create` and `propose`, and `45 §5.1` says the same —
     * so it must not need `write` either.
     *
     * A TOKEN'S NOTE IS SIGNED BY ITS RUN, found or opened as its writes are, and it moves the run's
     * heartbeat: an agent that only reads and notes is still working. The row is found first, so a note
     * against nothing opens no run.
     */
    log(register: string, seq: number, w: WriteContext, note: string): Result<{ id: string }> {
      const found = bySeq(register, seq);
      if (!found) return no<{ id: string }>('OUT_OF_BOUNDS', `There is no ${register} #${seq}.`, { at: 'seq' });
      return transaction(() => {
        appendEvent({
          kind: 'note',
          target: found.id,
          register: found.register,
          actor: signedBy(w),
          note,
          at: instant(clock.now()),
          ...(w.batch === undefined ? {} : { batch: w.batch }),
        });
        return ok({ id: found.id });
      });
    },

    access: (person: string) => access(sql, person),

    /**
     * Who owns this record, by id.
     *
     * FOR THE ONE CALLER THAT HAS NO OTHER WAY TO ASK: a self-host with no bearer, which is one
     * person on one machine and needs to know which person. It was a constant, `p_self`, which was
     * correct while nothing could create a record and quietly wrong the moment `init` could — a
     * token minted under that constant names a person with no `member` row, and is refused by the
     * server that issued it.
     *
     * BY `person_id`, NOT BY `rowid`. "The founding owner is first" was wrong three ways: this
     * record's own `createRecord` uses `INSERT OR REPLACE`, which deletes and re-inserts at a fresh
     * max rowid; an export and import reorders every table; and neither is visible from here. An
     * alphabetical order is not the founder either, but it is the same answer before and after a
     * restore, which is the property a caller actually needs.
     *
     * AND A SUSPENDED OWNER IS NOT AN OWNER. `owners()` counts rows without excluding them, so two
     * owners can both be suspended — and the caller that falls back to a constant on `null` then
     * hands out `owner` to somebody no `member` row names, on a record whose own tables say nobody
     * may act.
     */
    ownerId: (): string | null =>
      sql.one<{ person_id: string }>(
        `SELECT m.person_id FROM member m JOIN person p ON p.id = m.person_id
          WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL ORDER BY m.person_id LIMIT 1`,
      )?.person_id ?? null,

    /** Whether this object has been created at all, which is a different question from who owns it. */
    created: (): boolean => recordIdentity(sql) !== null,

    /** Put somebody on, or move them. An invitation is the whole of what they hold, not a patch. */
    /* `why` REACHES THE LEDGER OR IT IS NOT WRITTEN. `45 §5.6` gives the access event `note = why`,
       `members.ts` writes it, and these three facades took no `why` at all — so `note` was `NULL` on
       every access event in the product and the column was plumbing that never carried anything. An
       audit that says who was granted what and never why is half an audit, on the one table whose
       entries are decisions about other people. */
    invite: (
      by: string,
      args: { person: string; email?: string; name?: string; level?: MemberLevel; registers?: Record<string, MemberLevel>; why?: string },
    ): Result<Member> => transaction(() => invite(memberDeps(), by, args)),

    /** Take somebody off. Never the last owner, and their person row stays. */
    /** Stop somebody without deciding about them, or start them again. */
    suspendMember: (by: string, person: string, on: boolean, why?: string): Result<null> =>
      transaction(() => suspend(memberDeps(), by, person, on, why)),

    removeMember: (by: string, person: string, why?: string): Result<null> => transaction(() => remove(memberDeps(), by, person, why)),

    /* ── agent tokens ───────────────────────────────────── */

    /** Mint one. The secret exists once, in the answer, and is stored nowhere. */
    createToken: (person: string, args: { scope: Scope; label?: string; days?: number }): Promise<Result<Minted>> =>
      Promise.resolve(tokenDeps()).then((deps) => transaction(() => createToken(deps, person, args))),

    /** Every token, with a revoke button's worth of information and nothing a hash needs. */
    listTokens: (): TokenRow[] => listTokens(sql),

    /** Revoke one, idempotently. */
    revokeToken: (person: string, id: string): Result<TokenRow> => transaction(() => revokeToken(tokenDeps(), person, id)),

    /** A bearer, checked. The one way a token is recognised, and there is no other. */
    verifyToken: (bearer: string, surface?: string): Promise<Result<Verified>> =>
      verifyToken(tokenDeps(), bearer, surface),

    /* ── invitations, 12 §3 ───────────────────────────────── */

    /** Mint one for an address. The link's token is in the answer once, and only its hash is kept. */
    createInvitation: async (by: string, args: InviteArgs): Promise<Result<Invited>> => {
      const deps = tokenDeps();
      const secret = inviteSecret(deps.random(32));
      const hash = await deps.digest(secret);
      return attempt(sql, transaction, () => mintInvitation({ ...memberDeps(), recordId: deps.recordId }, by, args, secret, hash));
    },

    /** Every invitation still waiting. Never the hash. */
    listInvitations: (): InvitationRow[] => listInvitations(sql, clock.now()),

    /** Withdraw one, idempotently. */
    revokeInvitation: (id: string): Result<{ id: string; revoked_at: string }> =>
      transaction(() => revokeInvitation(sql, clock.now(), id)),

    /**
     * The live invitation a link's token names, or `accept` it for a person the host has verified.
     *
     * A TOKEN FOR ANOTHER RECORD IS A DEAD LINK HERE, answered in the same words as a spent one.
     */
    lookInvitation: async (token: string): Promise<Result<InvitationRow>> => {
      const hash = await inviteHash(token);
      return hash === null ? no<InvitationRow>('UNAUTHORIZED', INVITE_GONE, { at: 'token' }) : lookInvitation(sql, clock.now(), hash);
    },
    acceptInvitation: async (token: string, person: { person: string; email: string; name?: string }): Promise<Result<Member>> => {
      const hash = await inviteHash(token);
      if (hash === null) return no<Member>('UNAUTHORIZED', INVITE_GONE, { at: 'token' });
      return attempt(sql, transaction, () => acceptInvitation({ ...memberDeps(), recordId: () => recordIdentity(sql)?.id ?? null }, hash, person));
    },

    /* ── device grants, 12 §6.1 ───────────────────────────── */

    /** A device asks for a code. INTERNAL: the host calls it from `/auth/device`, limited per address. */
    deviceStart: (args: { reach: string; label: string; ua?: string; scope?: string }): Promise<Result<DeviceCode>> =>
      deviceStart(tokenDeps(), args),

    /** The owner types the six digits. A wrong code costs every pending request a try. */
    deviceApprove: (person: string, args: { user_code: string }): Promise<Result<Approved>> => deviceApprove(tokenDeps(), person, args),

    /** The device asks again, and after approval gets its bearer once. INTERNAL. */
    devicePoll: (args: { device_code: string }): Promise<Result<Waiting | Exchanged>> => devicePoll(tokenDeps(), args),

    /** Every grant by its handle, never by the id a device polls with. */
    deviceList: (): Promise<DeviceRow[]> => deviceList(tokenDeps()),

    /** Revoke one; a login grant takes its token with it. */
    deviceRevoke: (person: string, handle: string): Promise<Result<DeviceRow>> => deviceRevoke(tokenDeps(), person, handle),

    /** A vault bearer, checked. INTERNAL. */
    vaultGrant: (bearer: string): Promise<Result<VaultGrant>> => vaultGrant(tokenDeps(), bearer),

    /* ── the decision gate ─────────────────────────────────── */

    /**
     * The governance rows, read like a register.
     *
     * THE RECORD OPENS SUGGESTIONS FROM THREE PLACES and until this existed nothing could read one.
     * A proposal nobody can see is a proposal that was never made.
     */
    governance: (register: GovernRegister, opts: { status?: string; limit?: number; every?: boolean; cursor?: string } = {}) =>
      listGovernance({ sql, nowMs: clock.now() }, register, opts),

    /** How many rows a governance register holds, all of them. */
    governanceCount: (register: GovernRegister) => countGovernance(sql, register),

    /** Every open suggestion, uncapped, for a count or a list the record filters to its caller before it trims. */
    openSuggestions: () => listGovernance({ sql, nowMs: clock.now() }, 'suggestion', { status: 'open', every: true }),

    /** One governance row, or `null` — a missing one is a value, not a refusal. */
    governanceRow: (register: GovernRegister, id: string) => getGovernance(sql, register, id),

    /**
     * Open a suggestion. The body is checked here, so the person answering it never finds it broken.
     *
     * A TOKEN'S PROPOSAL IS SIGNED BY ITS RUN, as its writes are, and the run is found only once the
     * body has passed, so a refused proposal opens none. A bare name signs as itself.
     */
    propose: (p: Proposal, w: WriteContext | string): Result<{ id: string }> =>
      transaction(() => openSuggestion(governDeps(), () => signedBy(typeof w === 'string' ? { actor: w } : w), p)),

    /** A suggestion's question, which is its `suggest` event and no column: what a person reads it by. */
    question: (id: string): string | null => questionOf(sql, id),

    /**
     * Answer one.
     *
     * THE CHANGE AND THE DECISION ARE ONE TRANSACTION, so "undo this decision" is one query. A
     * `pattern` or a `change` comes back with the declaration to install, because installing is
     * asynchronous and a decision that resolved before its change landed would be a lie.
     */
    decide: (id: string, verdict: Verdict, actor: string): Result<Decided> =>
      attempt(sql, transaction, () => decide(governDeps(), id, verdict, actor)),

    /** Put one back in the queue, for the change the gate accepted and could not land. */
    reopen: (id: string, why?: string): Result<null> => transaction(() => reopen(governDeps(), id, why)),

    /** Keep what an accepted arrangement did on its decision, so a reload and every other reader see it. */
    keepApplied: (decision: string, applied: Record<string, unknown>, actor: string): Result<null> =>
      transaction(() => keepApplied(governDeps(), decision, applied, actor)),

    /**
     * Someone met in the work: matched by email or handle, or added, and linked to the project of the
     * caller's run (`people.ts`). One transaction, so a refusal anywhere writes nothing, a run included.
     * The caller's `version` and `opId` are not carried, because they describe no row meet writes.
     */
    meet: (args: MeetArgs, w: WriteContext): Result<Met> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const as: WriteContext = {
        actor: w.actor,
        ...(w.principal === undefined ? {} : { principal: w.principal }),
        ...(w.session === undefined ? {} : { session: w.session }),
      };
      return attempt(sql, transaction, () =>
        meetPerson(
          {
            sql,
            nowMs: clock.now(),
            fields: registers.get(PEOPLE)?.fields,
            project: () => (as.principal?.kind === 'token' ? (locateRun(as).project?.id ?? null) : null),
            nameOf,
            write: (ref, patch, version) => write(PEOPLE, ref, patch, version === undefined ? as : { ...as, version }),
            propose: (p) => openSuggestion(governDeps(), () => signedBy(as), p),
          },
          args,
        ),
      );
    },

    /* ── the outbox: work that must leave the record ────────────────── */

    /**
     * Queue one job, in the caller's transaction.
     *
     * THE RECORD MAKES NO OUTBOUND CALL — that is the rule the object model rests on. A write that
     * needs the world to hear about it inserts a row here and commits; something else delivers it.
     */
    outbox: (kind: OutboxKind, payload: unknown) => transaction(() => enqueue(sql, mint, clock.now(), kind, payload)),

    /* ── provisioning ────────────────────────────────────────── */

    /**
     * Say what this record is: its name, its owner, its timezone, and the header a file carries.
     *
     * NAMING IS PROVISIONING — the object already exists the moment it is addressed. This is the
     * four rows that say WHICH record it is, in one transaction, because a record with an owner and
     * no timezone renders every digest in the wrong day.
     */
    createRecord(args: CreateRecordArgs): Result<Provisioned> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      return createRecord(sql, clock.now(), FORMAT_VERSION, args, transaction, mint);
    },

    /** What this record calls itself, or `null` before anybody has said. */
    identity: () => recordIdentity(sql),

    /**
     * The sweep, by hand. The hourly `purge` row calls the same function.
     *
     * A soft delete is not a delete and is not forever either: thirty days is the window in which
     * "undo" is a real word, and after it a record that only grows makes every scan pay.
     */
    purge: (opts: { cutoffMs?: number; limit?: number } = {}) => sweepRecord(opts.cutoffMs, opts.limit),

    /** Claim up to `n` jobs of these kinds. One statement, so a double drain finds nothing. */
    leaseOutbox: (kinds: readonly OutboxKind[], n = 10) => transaction(() => lease(sql, ackDeps(), kinds, n)),

    /** Finish one. `failed` walks the ladder; the eighth failure is `dead` and opens an item. */
    ackOutbox: (args: Ack) => transaction(() => ack(sql, ackDeps(), args)),

    /**
     * Fire everything that is due, once.
     *
     * The scheduler is optional because the kernel is testable without one, and it is passed rather
     * than held because arming an alarm is an async storage operation on a Durable Object — it
     * cannot sit inside `transactionSync`, so it runs after the transaction commits.
     */
    async drain(scheduler?: Scheduler, limit = 100): Promise<Drained> {
      try {
        return transaction(() => drainSchedule(sql, ackDeps(), HANDLERS, limit));
      } finally {
        /* IN A `finally`, ALWAYS. A handler that throws before re-arming stops the customer's entire
           schedule forever, which is the single worst bug this subsystem can have. */
        if (scheduler) await tail(scheduler);
      }
    },

    /**
     * Re-arm the alarm to the earliest pending row, then ring the doorbell.
     *
     * IDEMPOTENT, and in this order. The alarm is read before it is set, so a tail that changed
     * nothing costs one read; the doorbell is last because it is the only I/O the record performs.
     */
    tail,

    /**
     * The record as a file: `.brainl` lines, header first, `local` left behind.
     *
     * Gated on the schema refusal like every other method, which it was not: a record whose schema
     * disagrees with the code was still exportable, and the export rewrote its manifest — putting a
     * hash of rows nobody can safely read into the file a customer keeps.
     */
    /**
     * The id of the key this record's vault is wrapped by, or `null` when it has no vault.
     *
     * IT IS NOT THE KEY. `kek_id` is a fingerprint — 12 §6 — and naming it proves nothing except
     * that you know which key you are asking about, which is exactly the bar an export carrying the
     * sealed bytes should clear: a caller holding that key can open them one at a time already, and
     * a caller who is not holding it gains nothing from a file full of ciphertext.
     */
    wrappingKey(): string | null {
      return sql.one<{ kek_id: string | null }>('SELECT kek_id FROM vault_key LIMIT 1')?.kek_id ?? null;
    },

    export(opts: { sections?: readonly Section[]; redactGrants?: boolean; actor?: string } = {}) {
      const refused = schemaRefusal(state);
      if (refused) return Promise.resolve(refused as Result<string[]>);

      /* AN EXPORT IS AN EVENT, and 45 §5.6 says so. `openGrant` writes `grant.read` for ONE
         credential; `export` copies every one of them and wrote nothing at all — so the one read
         that gets the most out was the one read that could not answer "did anything leave". 12 §6's
         first rule is that a vault whose reads are not audited cannot answer that question. */
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'export', NULL, NULL, ?)",
        mint(),
        instant(clock.now()),
        opts.actor ?? 'system',
        `sections ${(opts.sections ?? ['all']).join(', ')}${opts.redactGrants === true ? ', grants redacted' : ''}`,
      );
      return exportBrainl(sql, transaction, opts)
        .then((lines) => (signer ? signBrainl(lines, signer) : lines))
        .then((lines) => ok(lines));
    },

    /**
     * A file into an empty record, then the index rebuilt from the rows it now holds.
     *
     * The rebuild is here rather than in the import because it depends on the DECLARATIONS the file
     * just brought — a search index built before them would index nothing and look like it worked.
     */
    async import(lines: Iterable<string>) {
      /* The one destructive path that was not gated. `migrate.ts` says in bold that the refusal is
         sticky and every `Result`-returning method short-circuits on it; this one wrote seven rows
         into a record whose schema the code cannot read. */
      const refused = schemaRefusal(state);
      if (refused) return refused;

      /* THE FILE IS CHECKED AGAINST ITSELF BEFORE ONE ROW IS WRITTEN. `41 §5.11` step 2, and the
         reason this method is `async`: SHA-256 is, and a checksum computed after the transaction
         opened would be a checksum of a record that already exists. `lines` is an `Iterable` and a
         generator read twice is empty the second time, so it is materialised here — once, for both
         readers. */
      const all = [...lines];
      const sound = await checkBrainl(all);
      if (!sound.ok) return sound;

      const out = importBrainl(sql, transaction, all);
      if (out.ok) {
        reload();
        rebuildFts();
      }
      return out;
    },

    /**
     * Erase a person: `02 §10`'s cascade in one transaction, and one `erase` event naming them only as a hash.
     *
     * THE REFUSALS COME FIRST AND WRITE NOTHING. A subject under three characters would take half the record with it;
     * a basis that names the person would write them again into the one row an erasure keeps; and an owner is not
     * erased, because a record whose owner is gone is a record nobody can act on.
     *
     * `personId` ADDS THE PERSON'S OWN EMAIL AND NAME to the subjects, and removes their `member` rows.
     */
    async erase(req: EraseRequest, actor: string): Promise<Result<EraseReport>> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const given: unknown = (req as { subjects?: unknown } | undefined)?.subjects;
      if (!Array.isArray(given) || given.some((s) => typeof s !== 'string'))
        return no('VALUE_MALFORMED', 'subjects is a list of what names the person: a name, an email.', { at: 'subjects' });
      if (given.some((s: string) => s.trim().length < 3))
        return no('VALUE_MALFORMED', 'A subject is three characters or more, so an erasure cannot take half the record with it.', { at: 'subjects' });
      const basis = typeof req.basis === 'string' ? req.basis.trim() : '';
      if (!basis) return no('REQUIRED_MISSING', 'Say the legal basis for the erasure. It is kept with the record of it.', { at: 'basis' });

      const subjects: string[] = [...(given as string[])];
      const people: string[] = [];
      if (req.personId !== undefined) {
        if (typeof req.personId !== 'string' || !req.personId) return no('VALUE_MALFORMED', 'personId is the id of a person on this record.', { at: 'personId' });
        const p = sql.one<{ id: string; email: string | null; name: string | null }>('SELECT id, email, name FROM person WHERE id = ?', req.personId);
        if (!p) return no('OUT_OF_BOUNDS', `${req.personId} is not a person on this record.`, { at: 'personId' });
        people.push(p.id);
        for (const v of [p.email, p.name]) if (v && v !== ERASED && v.trim().length >= 3) subjects.push(v);
      }
      const matched = subjectsOf(subjects);
      if (matched.length === 0) return no('REQUIRED_MISSING', 'Name the person: a name or an email, three characters or more.', { at: 'subjects' });
      if (matched.some((s) => basis.toLowerCase().includes(s)))
        return no('VALUE_MALFORMED', 'The basis names the person, and the basis is the one thing an erasure keeps. Say it without them.', { at: 'basis' });

      for (const p of sql.all<{ id: string; email: string | null; name: string | null }>('SELECT id, email, name FROM person'))
        if (!people.includes(p.id) && matched.some((s) => s === (p.email ?? '').trim().toLowerCase() || s === (p.name ?? '').trim().toLowerCase()))
          people.push(p.id);
      const owner = people.find((p) => sql.one("SELECT 1 AS x FROM member WHERE person_id = ? AND register = '*' AND level = 'owner'", p));
      if (owner) return no('LEVEL_REQUIRED', 'An owner cannot be erased. Move them to another level first, from People.', { at: 'personId' });

      const hashes: string[] = [];
      for (const s of matched) {
        const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
        hashes.push([...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''));
      }
      sparkMayWrite(actor, 'erase');
      const at = instant(clock.now());
      return ok(
        transaction(() =>
          eraseSubjects({ sql, mint, at, actor, enqueue: (payload) => void enqueue(sql, mint, clock.now(), 'erase.r2', payload) }, matched, people, basis, hashes),
        ),
      );
    },

    /**
     * A lifecycle event the host's own work earns: a snapshot's `export`, a restore's `restore.pitr` (`45 §5.6`).
     *
     * NOT ABOUT A ROW, so no target: the record as a whole is what was copied or put back.
     */
    lifecycle(kind: 'export' | 'restore.pitr', actor: string, note: string, to?: string): string {
      sparkMayWrite(actor, kind);
      const id = mint();
      sql.exec(
        'INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)',
        id,
        instant(clock.now()),
        actor,
        kind,
        to === undefined ? null : jcs(to),
        note.slice(0, 280),
      );
      return id;
    },

    /**
     * Install declarations, then rebuild the cache.
     *
     * The cache is rebuilt HERE and not by the caller, because a declaration installed and not
     * reloaded is a register the write path still refuses — a failure that looks like the install
     * silently not working.
     */
    async install(given: readonly (Declaration | DeclarationBundle)[], expect?: Expected) {
      /* A BUNDLE IS ITS DECLARATIONS, so an accepted change carrying several installs and arms them in one go. */
      const batch: Declaration[] = given.flatMap((d) =>
        Array.isArray((d as DeclarationBundle).declarations) ? (d as DeclarationBundle).declarations : [d as Declaration],
      );
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const cannot = unreadable(batch);
      if (cannot) return { ok: false as const, refusal: cannot };
      const out = await installDeclarations(sql, clock.now(), batch, transaction, expect);
      if (out.ok) {
        reload();
        /* AND THE ROWS THE DECLARATIONS EARN. `digest`, `snapshot` and `analyse` have complete
           handlers and NOTHING EVER ARMED THEM — an exhaustive search of every `INSERT INTO
           schedule` in this repository found six sites and none of those kinds. So a declared Monday
           brief never sent, a metric's series never snapshotted, and the weekly analysis, which is
           the whole observe loop, never ran, with no error anywhere. A handler nothing schedules is
           a feature that exists in the code and not in the product.

           AFTER `reload`, so the identity's timezone is the one just installed. */
        armDerived(batch);
      }
      return out;
    },

    /**
     * Validate and hash a batch, and hand back the write as a SYNCHRONOUS function.
     *
     * FOR A CALLER THAT NEEDS THE WRITE INSIDE A TRANSACTION IT OWNS. A pack install writes
     * declarations, retires the ones the pack dropped, plants its seeds and records the pack row —
     * and half of that is a record whose pages name registers it does not have. Hashing is the only
     * asynchronous part, so it happens here and the write happens where the caller says.
     *
     * The cache is rebuilt by the caller through `reload()`; a staged write that is not reloaded is
     * a register the write path still refuses.
     */
    async stageInstall(batch: readonly Declaration[]) {
      const refused = schemaRefusal(state);
      if (refused) return refused as Result<() => Result<unknown>>;
      const cannot = unreadable(batch);
      if (cannot) return { ok: false as const, refusal: cannot };
      /* THE PACK PATH IS WHERE AN UPGRADE ARRIVES, so a disabled pack is refused here as well as in
         `installDeclarations`. */
      const off = disabledPackFault(sql, batch);
      if (off) return { ok: false as const, refusal: off };
      const staged = await stageDeclarations(batch);
      if (!staged.ok) return staged;
      return ok(() => {
        const out = staged.value(sql, clock.now(), transaction);
        /* AND THE SAME ON A PACK'S PATH, WHEN IT LANDS. `applyDeclarations` refuses and rolls back —
           a clashing unique field, a missing dependency — and this armed the rows anyway: the caller
           got a refusal and the schedule held a `digest` row for a declaration that does not exist.
           It fires once, finds nothing, and goes `done`. */
        if (out.ok) armDerived(batch);
        return out;
      });
    },

    /**
     * The checks an install runs, and nothing written: what an arrangement is held to when it is filed.
     *
     * THE BATCH OVERLAYS WHAT IS INSTALLED, so a page over a list a pack in the same arrangement declares is
     * linted against that list, and the owner is never the one who finds a page that would not install.
     */
    lint(batch: readonly Declaration[]): Refusal | null {
      return unreadable(batch) ?? lintBatch(sql, batch);
    },

    retire(ids: readonly string[]) {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const out = retireDeclarations(sql, ids, transaction);
      if (out.ok) reload();
      return out;
    },

    /**
     * Turn a pack off, keeping its `pack` row and every row under its registers (`declare.ts`).
     * `alsoDisable` names the dependents to turn off in the same transaction.
     */
    disablePack(id: string, opts: { alsoDisable?: readonly string[]; actor?: string } = {}): Result<PackToggle> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const out = disableDeclaredPack(sql, clock.now(), id, opts, transaction, mint);
      if (out.ok && out.value.changed) reload();
      return out;
    },

    /** Turn a disabled pack back on over the declarations it went off with, and re-arm what they earn. */
    async enablePack(id: string, opts: { actor?: string } = {}): Promise<Result<PackToggle>> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const out = await enableDeclaredPack(sql, clock.now(), id, opts, transaction, mint);
      if (!out.ok) return out;
      const { batch, ...toggle } = out.value;
      if (toggle.changed) {
        reload();
        armDerived(batch);
      }
      return ok(toggle);
    },

    /** One pack's settings: what its manifest declares under `config:`, and the value each holds now. */
    packConfig(id: string): Result<PackConfig> {
      return readPackConfig(sql, id);
    },

    /**
     * Set some of a pack's settings, checked against the manifest, with one `edit` event.
     * Nothing installed changes: a declaration reads a setting when its pack is next planned and installed.
     */
    setPackConfig(id: string, values: unknown, opts: { actor?: string; batch?: string } = {}) {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      return writePackConfig(sql, clock.now(), id, values, opts, transaction, mint);
    },

    /** Every pack's setting values, by pack id, as a plan fills `{{config:}}` from them. */
    packSettings: () => declaredPackSettings(sql, removedSince()),

    registers: () => registers,
    register: (id: string) => registers.get(id),

    /**
     * The declaration state, as a plan is built from it.
     *
     * ACTIVE ROWS ONLY, and `body` as the JCS text it was stored as — a plan compares checksums and
     * bodies, and re-serialising an object to compare it is how two identical declarations come out
     * different because one was parsed by a different build.
     */
    declarations: () =>
      sql.all<{ id: string; version: number; kind: string; pack_id: string | null; body: string; checksum: string }>(
        'SELECT id, version, kind, pack_id, body, checksum FROM declaration WHERE superseded_at IS NULL AND retired = 0 ORDER BY id',
      ),

    /** The `pack` rows: what is installed, and at which version. */
    packs: () => sql.all<{ id: string; version: string }>('SELECT id, version FROM pack ORDER BY id'),

    /**
     * Every pack this record has, on or off, with the registers each one holds.
     *
     * BESIDE `packs()` AND NOT INSTEAD OF IT, because a plan compares `pack` rows and nothing else.
     * The seed installs its first-party packs with no `pack` row, owned only by `pack:` in the body,
     * so a pack like People is found by its declarations while on, and by its last `retire` event
     * while off, which is the only record that it went off (`declare.ts`, `packStanding`).
     */
    packStates: (): PackState[] => {
      const owner = "coalesce(pack_id, json_extract(body, '$.pack'))";
      const live = new Map<string, string[]>();
      for (const r of sql.all<{ owner: string; id: string }>(
        `SELECT ${owner} AS owner, id FROM declaration WHERE superseded_at IS NULL AND retired = 0 AND ${owner} IS NOT NULL ORDER BY id`,
      ))
        live.set(r.owner, [...(live.get(r.owner) ?? []), r.id]);
      const last = new Map(
        sql
          .all<{ target: string; kind: string; ts: string; to_v: string | null }>(
            "SELECT target, kind, ts, to_v FROM event WHERE rowid IN (SELECT MAX(rowid) FROM event WHERE target_kind = 'pack' AND kind IN ('retire', 'install', 'uninstall') GROUP BY target)",
          )
          .map((e) => [e.target.slice('pack:'.length), e]),
      );
      const rows = new Map(sql.all<{ id: string; version: string; disabled_at: string | null }>('SELECT id, version, disabled_at FROM pack').map((r) => [r.id, r]));
      const wentOff = (id: string): string[] => {
        const e = last.get(id);
        if (e?.kind !== 'retire' || !e.to_v) return [];
        try {
          return (JSON.parse(e.to_v) as unknown[]).filter((x): x is string => typeof x === 'string');
        } catch {
          return [];
        }
      };
      const registersOf = (ids: readonly string[]) => ids.filter((d) => d.startsWith('register.')).map((d) => d.slice('register.'.length));

      const out: PackState[] = [];
      /* `kernel` IS THE RECORD'S OWN and no person may turn it off, so it is not a pack on this list. */
      for (const id of new Set([...rows.keys(), ...live.keys(), ...last.keys()])) {
        if (id === 'kernel') continue;
        const row = rows.get(id);
        const on = live.get(id) ?? [];
        const offAt = row ? row.disabled_at : on.length === 0 && last.get(id)?.kind === 'retire' ? (last.get(id)?.ts ?? null) : null;
        /* A BODY-OWNED PACK WITH NOTHING LIVE AND NO `retire` LAST was uninstalled, or never was. */
        if (!row && on.length === 0 && offAt === null) continue;
        out.push({ id, version: row?.version ?? null, disabled_at: offAt, registers: registersOf(offAt === null ? on : wentOff(id)) });
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },

    /**
     * The saved views, one register's or every one of them, by name.
     *
     * `02 §5` MAKES A SAVED VIEW A NAMED PREDICATE ON ITS REGISTER, and this is where the record keeps
     * one. It is a read of a small table and nothing else: no declaration is parsed and no predicate is
     * compiled, so a view whose register was retired under it is still listed, which is what lets a
     * person see the thing they saved and take it off.
     */
    views: (register?: string): ViewRow[] =>
      (register === undefined
        ? sql.all<ViewStored>(`${VIEW_SELECT} FROM view ORDER BY register, name`)
        : sql.all<ViewStored>(`${VIEW_SELECT} FROM view WHERE register = ? ORDER BY name`, register)
      ).map(viewOf),

    /** One saved view, or `null` where that register has no view by that name. */
    view: (register: string, id: string): ViewRow | null => {
      const row = sql.one<ViewStored>(`${VIEW_SELECT} FROM view WHERE register = ? AND id = ?`, register, id);
      return row ? viewOf(row) : null;
    },

    /**
     * Save one view on a register, or replace the one already saved under that name.
     *
     * THE FILTER IS COMPILED BEFORE IT IS STORED, against the register it names, so a view that cannot
     * be run is refused at the moment somebody saves it rather than at the moment somebody else opens
     * it. That is the same check `list` makes of the same predicate through the same function, which is
     * what stops the two disagreeing about what a filter means.
     *
     * AND THE ORDER AND THE COLUMNS ARE HELD TO THE REGISTER'S FIELDS, for the same reason and with the
     * same test `list` uses for its own order: a column naming a field that is not there draws an empty
     * column for ever, and nothing about the view says why.
     *
     * REPLACING KEEPS WHO FIRST SAVED IT AND WHEN. A person refining a view is refining one question,
     * not asking a second, and re-dating it would lose the only fact the row carries about its age.
     */
    saveView(
      v: {
        register: string;
        id: string;
        name: string;
        filter?: Predicate | null;
        search?: string | null;
        order?: readonly { field: string; dir?: 'asc' | 'desc' }[];
        columns?: readonly string[];
      },
      opts: { actor: string },
    ): Result<ViewRow> {
      const refused = schemaRefusal(state);
      if (refused) return refused;

      const register = v?.register ?? '';
      if (!registers.has(register))
        return no('REGISTER_UNKNOWN', `There is no list called ${register}.`, {
          at: 'register',
          allowed: [...registers.keys()],
        });

      const id = v?.id ?? '';
      if (!VIEW_ID.test(id))
        return no('VALUE_MALFORMED', `A view is named in lower case, ${VIEW_ID.source}, and this one is ${JSON.stringify(v?.id) ?? 'nothing'}.`, { at: 'id' });

      const name = String(v?.name ?? '').trim();
      if (!name) return no('REQUIRED_MISSING', 'A view is called something a person would recognise.', { at: 'name' });
      if (name.length > 80) return no('OUT_OF_BOUNDS', `A view's name is at most 80 characters, and this one is ${name.length}.`, { at: 'name' });

      const schema = schemaOf(register);
      const filter = v?.filter ?? null;
      if (filter !== null) {
        const compiled = compile(filter, schema);
        const first = compiled.bad[0];
        if (first) return { ok: false as const, refusal: first };
      }

      const search = typeof v?.search === 'string' && v.search !== '' ? v.search : null;
      if (search !== null && search.length > 200)
        return no('OUT_OF_BOUNDS', `A view remembers at most 200 characters of what was searched for, and this is ${search.length}.`, { at: 'search' });

      const order: { field: string; dir: 'asc' | 'desc' }[] = [];
      for (const o of v?.order ?? []) {
        if (!Object.hasOwn(schema.fields, o.field) && !isColumn(o.field))
          return no('FIELD_UNKNOWN', `${register} has no field called ${o.field}.`, { at: 'order', allowed: addressable(schema) });
        if (o.dir !== undefined && o.dir !== 'asc' && o.dir !== 'desc')
          return no('ENUM_VALUE_UNKNOWN', `An order is asc or desc, and this one is ${JSON.stringify(o.dir)}.`, { at: 'order', allowed: ['asc', 'desc'] });
        order.push({ field: o.field, dir: o.dir === 'asc' ? 'asc' : 'desc' });
      }

      const columns = [...(v?.columns ?? [])];
      if (columns.length > VIEW_COLUMNS_CAP)
        return no('OUT_OF_BOUNDS', `A view keeps at most ${VIEW_COLUMNS_CAP} columns, and this one keeps ${columns.length}.`, { at: 'columns' });
      for (const column of columns)
        if (!Object.hasOwn(schema.fields, column) && !isColumn(column))
          return no('FIELD_UNKNOWN', `${register} has no field called ${column}.`, { at: 'columns', allowed: addressable(schema) });

      const now = instant(clock.now());
      return transaction(() => {
        const was = sql.one<{ created_by: string; created_at: string }>(
          'SELECT created_by, created_at FROM view WHERE register = ? AND id = ?',
          register,
          id,
        );
        /* THE CAP IS COUNTED ONLY WHEN THIS IS A NEW NAME, so somebody who has reached it can still
           edit the views they have — a limit that locks the way out of itself is a trap. */
        if (!was) {
          const held = sql.one<{ n: number }>('SELECT count(*) AS n FROM view WHERE register = ?', register)?.n ?? 0;
          if (held >= VIEWS_PER_REGISTER)
            return no<ViewRow>('OUT_OF_BOUNDS', `${register} already holds ${VIEWS_PER_REGISTER} views. Take one off first.`, { at: 'id' });
        }
        sql.exec(
          `INSERT INTO view (register, id, name, filter, search, sort, columns, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (register, id) DO UPDATE SET name = excluded.name, filter = excluded.filter,
             search = excluded.search, sort = excluded.sort, columns = excluded.columns, updated_at = excluded.updated_at`,
          register,
          id,
          name,
          /* `JSON.stringify` AND NOT `jcs`. Nothing checksums this row and nothing compares two of
             them; canonical form buys a guarantee that is not being asked for here. */
          filter === null ? null : JSON.stringify(filter),
          search,
          JSON.stringify(order),
          JSON.stringify(columns),
          was?.created_by ?? opts.actor,
          was?.created_at ?? now,
          now,
        );
        const row = sql.one<ViewStored>(`${VIEW_SELECT} FROM view WHERE register = ? AND id = ?`, register, id);
        return row ? ok(viewOf(row)) : no<ViewRow>('VIEW_UNKNOWN', `${register} has no view called ${id}.`, { at: 'id' });
      });
    },

    /**
     * Take one saved view off a register.
     *
     * NOT A ROW AND NOT A RETIREMENT. A declaration is retired because rows were written under it and
     * the shape has to stay readable; a view is a question nobody wrote anything under, so it is
     * deleted and there is nothing left to keep. A name this register has no view for is `VIEW_UNKNOWN`
     * with the names it does have, which ends the search rather than starting one.
     */
    retireView(register: string, id: string): Result<{ register: string; id: string; retired: true }> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const gone = transaction(() => {
        if (!sql.one<{ id: string }>('SELECT id FROM view WHERE register = ? AND id = ?', register, id)) return false;
        sql.exec('DELETE FROM view WHERE register = ? AND id = ?', register, id);
        return true;
      });
      return gone
        ? ok({ register, id, retired: true as const })
        : no('VIEW_UNKNOWN', `${register} has no view called ${id}.`, {
            at: 'id',
            allowed: sql.all<{ id: string }>('SELECT id FROM view WHERE register = ? ORDER BY id', register).map((r) => r.id),
          });
    },

    /** Live rows per register, which is what makes an orphan countable before it is one. */
    census: (): Record<string, number> =>
      Object.fromEntries(
        sql
          .all<{ register: string; n: number }>(
            'SELECT register, count(*) AS n FROM entry WHERE deleted_at IS NULL GROUP BY register',
          )
          .map((r) => [r.register, Number(r.n)]),
      ),

    /**
     * A `pack` row, written when its declarations have landed.
     *
     * AND THE CALLS-OUT LINES THE OWNER APPROVED WITH IT, word for word, in the `install` event's note and signed by
     * whoever approved them, so "what did I agree to send" has an answer that does not depend on the pack staying as it was.
     */
    rememberPack: (row: { id: string; version: string; source: string; ref: string | null; manifest: string; checksum: string; approved?: readonly string[]; by?: string }) =>
      transaction(() => {
        sql.exec(
          `INSERT INTO pack (id, version, source, source_ref, manifest, installed_at, checksum)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET version = excluded.version, source = excluded.source,
             source_ref = excluded.source_ref, manifest = excluded.manifest, checksum = excluded.checksum`,
          row.id,
          row.version,
          row.source,
          row.ref,
          row.manifest,
          instant(clock.now()),
          row.checksum,
        );
        const approved = row.approved !== undefined && row.approved.length > 0;
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'install', ?, 'pack', ?, ?)",
          mint(),
          instant(clock.now()),
          approved && row.by ? row.by : 'system',
          `pack:${row.id}`,
          row.version,
          approved ? row.approved!.join('\n') : null,
        );
        /* WHAT AN UNINSTALL TOOK, PUT BACK. The settings came in through the plan (`packSettings`); the schedules come back
           here, each as it was when the pack went, over the row the install just armed, and only for a declaration the
           pack has live again. The stash is spent either way, so a later uninstall keeps its own. */
        const stash = sql.one<{ schedules: string }>('SELECT schedules FROM pack_removed WHERE pack = ? AND removed_at >= ?', row.id, removedSince());
        if (stash) {
          const live = new Set(
            sql
              .all<{ id: string }>('SELECT id FROM declaration WHERE pack_id = ? AND superseded_at IS NULL AND retired = 0', row.id)
              .map((d) => d.id.slice(d.id.indexOf('.') + 1)),
          );
          for (const k of JSON.parse(stash.schedules) as { kind: string; key: string; due_at: string; payload: string; state: string; attempts: number }[]) {
            if (!live.has(k.key)) continue;
            sql.exec(
              `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = excluded.state, attempts = excluded.attempts`,
              mint(),
              k.due_at,
              k.kind,
              k.key,
              k.payload,
              k.state,
              k.attempts,
            );
          }
        }
        sql.exec('DELETE FROM pack_removed WHERE pack = ?', row.id);
      }),

    /** And the row goes when the pack does. The declarations are retired; the rows are not. */
    forgetPack: (id: string) =>
      transaction(() => {
        /* KEPT FOR A REINSTALL: the settings chosen for it and its pending schedules, as they are now (`pack_removed`). */
        const version = sql.one<{ version: string }>('SELECT version FROM pack WHERE id = ?', id)?.version;
        const pending = sql.all<{ kind: string; key: string; due_at: string; payload: string; state: string; attempts: number }>(
          `SELECT kind, key, due_at, payload, state, attempts FROM schedule WHERE state IN ('pending', 'paused') AND kind IN ('digest', 'pull', 'call', 'poll', 'snapshot')
           AND key IN (SELECT substr(id, instr(id, '.') + 1) FROM declaration WHERE pack_id = ?) ORDER BY kind, key`,
          id,
        );
        if (version !== undefined)
          sql.exec(
            `INSERT INTO pack_removed (pack, version, removed_at, settings, schedules) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (pack) DO UPDATE SET version = excluded.version, removed_at = excluded.removed_at, settings = excluded.settings, schedules = excluded.schedules`,
            id,
            version,
            instant(clock.now()),
            JSON.stringify(chosenSettings(sql, id)),
            JSON.stringify(pending),
          );
        sql.exec('DELETE FROM pack WHERE id = ?', id);
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'system', 'uninstall', ?, 'pack', NULL)",
          mint(),
          instant(clock.now()),
          `pack:${id}`,
        );
        /* ITS SCHEDULE ROWS GO WITH IT. A digest for a page nobody has any more is a notification
           about nothing, arriving every Monday for ever. */
        sql.exec(
          `DELETE FROM schedule WHERE state IN ('pending', 'paused') AND kind IN ('digest', 'pull', 'call', 'poll', 'snapshot')
           AND key IN (SELECT substr(id, instr(id, '.') + 1) FROM declaration WHERE pack_id = ?)`,
          id,
        );
      }),

    /** Which declarations a pack claims. Read before it is taken out. */
    packClaims: (id: string) =>
      sql
        .all<{ id: string }>(
          'SELECT id FROM declaration WHERE pack_id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY id',
          id,
        )
        .map((r) => r.id),
    refused: () => state.refusal,
    get,
    list,
    /** What points at one row, from the `to:` every `ref` field already declares. */
    backlinks,
    count,
    version,
    history,
    /** Which project a run in this place belongs to, and how it was told (`scope.ts`). Reads only. */
    resolveProject: (where: Whereabouts): Resolved => resolveProject(sql, registers, where),
    inScope,
    runFor,
    findRun,
    keyState,
    /** A row as a person says it, `S42` or `things#3`, from its id. */
    nameOf,
    create: (register: string, fields: Patch, w: WriteContext) => write(register, null, fields, w),
    update: (register: string, ref: string, patch: Patch, w: WriteContext) => write(register, ref, patch, w),
    /* Four arguments and no fifth: a `Door` is the kernel's own to open. */
    write: (register: string, ref: string | null, patch: Patch, w: WriteContext) => write(register, ref, patch, w),
  };
  return kernel;
}
