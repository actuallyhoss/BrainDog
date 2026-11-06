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

import { scriptRows } from './script-rows.ts';
import type { Clock, Param, Refusal, Result, Row, Scheduler, Sql } from '@braindog/ports';
import { clash, codeOf, fixOf, no, ok, refused } from '@braindog/ports';

import { nameSpokenIn } from './spoken-names.ts';
import { coerce, currencyFixed, isAbsent, instant, measure, parseSpoken, range, rowOverCap, type FieldDecl, type Json } from './coerce.ts';
import { overSplitNow, splitFault, splitOf, splitOfFields } from './row-parts.ts';
import { splitIndex, splitIndexName } from './split-view.ts';
import { attempt } from './tx.ts';
import { misread, sentencesOver, widens } from './widen.ts';
import { ulids, type Mint } from './ids.ts';
import { FORMAT_VERSION, applyMigrations, schemaRefusal, type SchemaState } from './migrate.ts';
import { renameDeclarations } from './migrations/0016_slash.ts';
import { jsonPath, compile, derivedFault, fieldSqlIn, addressable, isColumn, unprivateLine, type Compiled, type Predicate, type Schema } from '@braindog/where';
import {
  disablePack as disableDeclaredPack,
  enablePack as enableDeclaredPack,
  installDeclarations,
  jcs,
  lintBatch,
  lintTable,
  type LintTable,
  liveTarget,
  ownId,
  homeCurrency,
  speakingSettings,
  packSettings as declaredPackSettings,
  chosenSettings,
  REMOVED_WINDOW_DAYS,
  readPackConfig,
  retireDeclarations,
  indexName,
  sourceKnown,
  writePackConfig,
  stageDeclarations,
  type Declaration,
  type Expected,
  type Installed,
  type Known,
  type Owners,
  type PackConfig,
  type PackToggle,
  type PlannedRecord,
} from './declare.ts';
import { commitAuthors } from './commit-authors.ts';
import { commitSubjects, cutLine, mayRefreshNext, readNames, type Named, type Open } from './run-reads.ts';
import { DRAFT_FIELD, firstProjectFields, firstProjectName, nobodysPlace, noPlace, topicName } from './first-project.ts';
import { maskMoneyText } from './mail-read.ts';
import { containsMatched, maskedMatched, project, projectedText, rebuild, search as ftsSearch, searchMatched as ftsSearchMatched, searchWords, type Hit, type Searched } from './fts.ts';
import { withDerived, type DeriveResolve } from './derive-rows.ts';
import { throughOf } from './derive.ts';
import { runsDataSteps } from './migrations/0028_runs.ts';
import { SIGNS_KEY, fileSignReading, nextSignsDue, readSigns, runSignsNight, type SignReading, type VitalSign } from './signs.ts';
import { scanKeys } from './key-scan.ts';
import { carriedIn } from './run-carried.ts';
import { markHand } from './hold.ts';
import { accessNight, countLists, deadPaths } from './night-counts.ts';
import { actionsBlocking } from './signs-actions.ts';
import { DOOR_KINDS, DOOR_WINDOW_DAYS, doorMarks as readDoorMarks, markDoor, sweepDoorMarks, type DoorMark, type DoorSigns } from './door.ts';
import { addressKey, clearFault, MAIL_FAULT, missedCause, missedSaid, openFaults, raiseFault, type Fault } from './fault.ts';
import { copyFacts, copyFailed, copyKept, type CopyFacts } from './copies.ts';
import {
  closePassed as closePassedHandoffs,
  drop as dropHandoff,
  expire as expireHandoffs,
  inPlace,
  openHandoffs,
  runPlace,
  take as takeHandoff,
  type HandoffPlace,
  type HandoffWrite,
  type OpenHandoff,
  type RunRow,
  type Taken,
} from './handoff.ts';
import { checkBrainl, exportBrainl, importBrainl, signBrainl, streamBrainl, tables as fileTables, type ImportReport, type Section, type Signer, type StreamedBrainl } from './brainl.ts';
import { settleSealed } from './sealed.ts';
import {
  drainSchedule,
  due,
  pendingWork,
  reschedule,
  retryFailed,
  retryHandler,
  sweepSessions,
  type Drained,
  type Handler,
  type Remindable,
  type ScheduleKind,
} from './schedule.ts';
import { ack, enqueue, lease, retryDead, unlease, type Ack, type AckDeps, type OutboxKind } from './outbox.ts';
import { embedJob } from './embed.ts';
import { ERASED, eraseSubjects, subjectsOf, type EraseReport, type EraseRequest } from './erase.ts';
import { leasedPushTarget, ownersPushSubs, personPushSubs, pushKindOf, pushOpenOf, pushSubOf, settlePush, type PushSettled, type PushTarget } from './push.ts';
import { access, invite, members, remove, type AccessLens, type Held, type Level as MemberLevel, type Member, type MemberDeps, suspend } from './members.ts';
import { bumpEpoch, catalogOf, epochOf, gateFieldsOf, groupKept, groupShares as groupSharesOf, meOf, saysMe, sharesFor as heldSharesOf, LensCache, newListGrants, putGroup, putShare, retireGroup, revokeShare, setGroupMember, shareKept, sharesKept, sharesWaiting, type GroupKept, type ListLike, type ShareInput, type ShareKept } from './shares.ts';
import { activeAt, shareReach, type Cap as LensCapOf, type Catalog } from './lens.ts';
import { NOBODY, narrowed, ruleOf, scopeFor, viewerOfRead, type Wheres } from './members.ts';
import { accountStop, stopped as stoppedOf, type Suspended } from './members.ts';
import {
  GONE as INVITE_GONE,
  acceptInvitation,
  listInvitations,
  lookInvitation,
  mintInvitation,
  revokeInvitation,
  secretOf as inviteSecret,
  tokenParts as inviteParts,
  type Accepted as InviteAccepted,
  type InvitationRow,
  type InviteArgs,
  type Invited,
} from './invitations.ts';
import {
  SCOPES,
  createToken,
  listTokens,
  mintChild,
  noteTool,
  pruneChildren,
  revokeToken,
  verifyToken,
  type ChildArgs,
  type CreateTokenArgs,
  type Minted,
  type Scope,
  type TokenDeps,
  type TokenRow,
  type TokenUses,
  type Verified,
} from './token.ts';
import {
  decide,
  getGovernance,
  listGovernance,
  handQuestion as handQuestionIn,
  answeredIn as answeredInIn,
  answeredInOf,
  deciderOf as deciderOfIn,
  deciderFault as deciderFaultIn,
  filedBy as filedByIn,
  countGovernance,
  countOpenQuestions,
  sweepStale,
  settleAbout,
  settleOne,
  takeBack,
  PASSED_NOTE,
  apartIds,
  apartJson,
  NOT_APART,
  propose as openSuggestion,
  handledOn,
  settleWaiting,
  HANDLED_RULE,
  COVERED,
  ONE_AT_A_TIME,
  askAgainLetGo,
  reopen,
  withdraw as withdrawSuggestion,
  keepApplied,
  questionOf,
  showsOf,
  type Decided,
  type Filed,
  type GovernDeps,
  type GovernRegister,
  type Proposal,
  type Verdict,
} from './govern.ts';
import { createRecord, purge, recordIdentity, type CreateRecordArgs, type Provisioned } from './provision.ts';
import { dayIn, stampFinished } from './finished.ts';
import type { StepsDecl } from './steps.ts';
import { isMechanism, loadLeg, markPinned, neighboursOf, pairsReads, passOf, settle, windowSql, PAIRS_ACTOR, type Leg as PairLeg, type PairsDecl, type Pairing } from './pairs.ts';
import { COST_SQL, WAIT_SQL, costOf, costRank, costRows, optionCost, waitParams, waitRank, type Cost } from './weigh.ts';
import { recheck } from './cause.ts';
import { drawTraceOf, HELD_SHORT_MS, HeldReadings, notice, noticeDraw, shifted, traceOf, within, withinDraw, type DrawSeen, type DrawTrace, type ReadTrace } from './held-readings.ts';
import { HeldSigns, heldOn, noticeSign, signTraceOf, tablesWritten, wroteNothing, type SignHeldOn, type SignTrace } from './held-signs.ts';
import { localDays, readableZone } from './measures.ts';
import { evaluateMetric, predicateOf, readDeclaredSigns, scorePrediction, snapshot, unaggregatableIn, type EvalContext, type MetricDecl, type ReadMemo, type Reading } from './metrics.ts';
import { ROWS_SAID_MOVES, ROWS_SAID_NAMES, claimRank, fill, readBlock, readPage, registersOf, registersOfBlock, resolvePages, runByOf, staleAt, type ActivityEvent, type BlockResult, type ListsBeside, type PageBlock, type PageDecl, type PageDeps, type PageSees, type LastChange, type PageResult, type QueueCandidate, type QueueOption, type QueueQuestion, type QuestionFacts, type RunBy } from './pages.ts';
import { doesOf } from './does.ts';
import { additionsOf } from './page-adds.ts';
import { SETUP_KIND, setupCollapser, type FeedLine } from './feed.ts';
import {
  carryingOf,
  headline,
  localParts,
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
import { URGENT_NOTE, inQuietHours, quietEnds, quietOf } from './digest.ts';
import { CREATE_CEILING, applyRule, dryRun, marker, runRules, stillMatches, type Applied as RuleApplied, type DryRun, type FlowDecl, type RuleDecl, type RulesDeps } from './rules.ts';
import {
  advance as advanceRun,
  answerStep,
  cancelRun,
  cancelRunsOf,
  clockKey,
  firstDue,
  installed as installedFlows,
  onArrival,
  onClock,
  onWritten,
  pruneRuns,
  retryRun as retryFlowRun,
  startRun,
  startedBy,
  type FlowDeps,
} from './flow.ts';
import { trialTrigger, tryRun, type Tried, type TryOptions, type TrySample } from './flow-try.ts';
import { extension as rehearsal } from './api/rehearse.ts';
import { pathOf, rowRegisterOf, slashAskAt, subjectOf, tagsRefusal, tagsRefusing, tagsShape, triggerOf } from './flow-lint.ts';
import { onDecided, onMetrics, onTime } from './flow.ts';
import { RELATIVE_DAY } from './flow-lint.ts';
import { capability } from './capabilities.ts';
import { carryPins } from './pairs.ts';
import { linkPatternFault, pruneFirings } from './rules.ts';
import { REST_DAYS_SETTING, runway, type Horizon, type Leg, type Runway } from './forecast.ts';
import { WALK_SOURCE } from './money-figures.ts';
import { referencedBy, unlinksOf } from './referenced.ts';
import { createJob, sweepJobs } from './jobs.ts';
import { mailPatterns, openRowset, unfile } from './ingest.ts';
import { answerAsked, arrive, day, exponentOf, fileAsSecond, offerAgain, patternReport, propose, rerunHeld, shapeOf, type Arrival, type Arrived, type IngestDecl, type IngestDeps, type NumberReaders, type PatternReport } from './ingest.ts';
import { analyse, observe, type Analysis, type Observation } from './observe.ts';
import { applyPull, firePull, type PullDecl, type PullDeps } from './pull.ts';
import { firstSlotMs } from './slot.ts';
import { activeScript, clockOfScript, egressChanged, fireScript, firstDueMs, scriptDeps } from './script.ts';
import { binStore, noticesLeft, purgeBinnedStores, restoreStore, storeOf } from './addon-state.ts';
import { finishScript, prepareScript, resumeScript, tryProposal, type ScriptProposal, type ScriptProposed, type ScriptRunDeps, type ScriptRunner } from './script-run.ts';
import { applyPage, writePoints, type MetricPoint, type PageWrote, type PulledPage } from './fetched.ts';
import { extractPull, type ExtractDecl, type ExtractDeps, type Extraction } from './extract.ts';
import {
  ACTION_KINDS,
  egressOf,
  fireAction,
  finishAction,
  approvalLines,
  keyNamed,
  opensNamed,
  keyReady,
  keyOutOfScope,
  keyScopeOf,
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
  answerKeyAsk,
  keyAccessRows,
  keyAsks,
  keyGate,
  lockAfter,
  setKeyAccess,
  setLockAfter,
  type KeyAccessRow,
  type KeyAnswer,
  type KeyAskRow,
  type KeyGate,
  type KeyRule,
  type LockAfter,
  bindGrant,
  getGrant,
  listGrants,
  openGrant,
  recordWrapping,
  revokeGrant,
  rotateDue,
  sealedGrant,
  type BindGrantArgs,
  type GrantRow,
  type LeasedSeal,
  type SealedGrant,
  type KeychainDeps,
} from './keychain.ts';
import { slashMayWrite } from './slash.ts';
import { meetPatternedSender, readMailArrival, tasksList, type MailOutcome } from './mail-arrival.ts';
import { answeredOnly, askOwnRows, askSame, fileVerdicts, joinOrganisation, meet as meetPerson, meetContact as meetCard, resolveJob, type ContactArgs, type ContactMet, type MeetArgs, type Met, type PeopleDeps } from './people.ts';
import { meetsRole, orgRole, ratesRole, type MeetsFields, type OrgFields } from './roles.ts';
import { foldChain, foldEnd, foldedCarry, buried, holderOf, keyLists, keyedLists, mergeFieldOf, rebuildKeys, rekey, rowKeys, type KeyedList } from './entities.ts';
import { clashes, foldPlan as sameFoldPlan, sameDoor, type FoldGroup, type SameGroup } from './same.ts';
import { ROWSET_LIST_SQL, builtInFigure, openSteps, readOpenQuestions } from './built-in-figures.ts';
import { openExceptions } from './exceptions.ts';
import { finders, tidyHour } from './tidy.ts';
import { sourceModule } from './sources/index.ts';
export { SOURCE_MODULES, sourceModule, sourceReadsWhole, wholeSources, type Source } from './sources/index.ts';
export { scriptRows, type ScriptRow } from './script-rows.ts';
import { RESUMED_MS, beatRun, presentRuns, pulseRun, revivedAt, seatRun, workingRuns } from './presence.ts';
/* WHAT HE TELLS AN AGENT AND THE SETTINGS IT WORKS UNDER (migration 42, `instruction.ts`, `agent-profile.ts`). */
import {
  INSTRUCTIONS,
  INSTRUCTION_KERNEL_WRITTEN,
  changedSince as instructionsChangedSince,
  expireInstructions,
  settleEndedJobs,
  settleJobInstructions,
  instruct as instructRun,
  instructionFor as instructionsFor,
  instructionOf,
  keepOrderAnswer,
  keepWordAnswer,
  replyInstruction as replyToInstruction,
  runOf as instructedRun,
  seenBy as instructionSeenBy,
  seenInstruction as sawInstruction,
  stampFor as instructionStamp,
  stopOf as runStopOf,
  takeInstruction as takeInstructionFor,
  withdrawInstruction as withdrawInstructionFor,
  closeInstruction as closeInstructionFor,
  type Delta,
  type InstructInput,
  type InstructionDeps,
  type Instr,
  type ReplyState,
  type RunHints,
  type SeenHow,
  type Stop,
} from './instruction.ts';
import { profileById, profileFor as profileMatching, readProfiles, setProfile as writeProfile, type Profile, type ProfileRow, type ProfileWho } from './agent-profile.ts';
import { agentsDataSteps } from './migrations/0042_agents.ts';
import { ASKED_KEY, agentOf as ladderAgentOf, keysOfStamp, kindOfEvent, kindsOfProposal, madeByIn, ownerIn, personOf, recordReader, shapeIn, tokenOfRun } from './change-kind.ts';
import { undoApply as applyUndo, undoPlan as planUndo, undoStaged as stageUndo, type UndoApplied, type UndoDeclared, type UndoOptions, type UndoPlan, type UndoScope } from './undo.ts';
import { BACKFILL_ACTOR, understandBackfill, undoBackfill, type BackfillDeps, type BackfillOptions, type Backfilled } from './backfill.ts';
import { foldPlan as planFold, isFold as foldMade, type FoldDeps, type FoldPlan } from './undo-fold.ts';
import {
  FINISHED,
  KERNEL_WRITTEN,
  REVIVED,
  RUN_FACTS,
  SESSION,
  agentOf as runAgentOf,
  begun,
  clipTitle,
  findSession,
  isHelper,
  isRunName,
  leftFreshStep,
  learned,
  opening,
  openingStamp,
  othersRun,
  provisionalTitle,
  recordNamed,
  type Found,
  type RunRegister,
  type SessionHints,
} from './session.ts';
import {
  deviceApprove,
  deviceLook,
  deviceList,
  devicePoll,
  deviceRevoke,
  deviceStart,
  deviceSweep,
  operationGrant,
  renameDevice,
  shapeGrant,
  keychainGrant,
  type Approved,
  type Looked,
  type DeviceCode,
  type DeviceRow,
  type Exchanged,
  type OperationGrant,
  type Reach as DeviceReach,
  type ShapeGrant,
  type KeychainGrant,
  type Waiting,
} from './device.ts';
import {
  placeOnce,
  projectSuggestions,
  resolveProject,
  scopeFault,
  scopeFieldOf,
  type ProjectSuggestion,
  type Resolved,
  type ScopeDecl,
  type ScopesDecl,
  type Whereabouts,
} from './scope.ts';
import type { AppendedEvent, KernelParts, ListQuery, Listed } from './parts.ts';
import { extensions } from './api/index.ts';

export { FORMAT_VERSION, KERNEL_MIGRATION, MIGRATIONS, canon, checksum, statements } from './migrate.ts';
export { checkBrainl, keyIdOf, b64url, manifestBytes, signBrainl, type Signature, type Signer } from './brainl.ts';
export { RecordChanged, type StreamedBrainl } from './brainl.ts';
export { SHAPE_MARK, Scrambler, isShape, shapeBrainl, type Published, type ShapeOptions } from './shape.ts';
export { SLASH, SLASH_KINDS, slashMayWrite } from './slash.ts';

/** The `field` of the line `setPrivate` writes on a row, kept private or shared again (leak matrix N1). */
export const PRIVATE_NOTE = 'private';
export { DRAFT_FIELD, TOPIC_MAX, cleanName, firstProjectFields, firstProjectName, noPlace, topicName } from './first-project.ts';
export { DEVICES, KERNEL_WRITTEN, REVIVED, RUN_FACTS, TITLE_MAX, agentOf, clipTitle, isHelper, leftFreshStep, onMachine, plainApp, provisionalTitle, runAge, sessionDeclaration } from './session.ts';
/* A FIELD WORKED OUT FROM OTHER FIELDS: its shapes and refusals, and the rows filled at read. `shapeOf` is the
   ingest's name here, so the derive's is exported as `deriveShapeOf`. */
export { DERIVE_SHAPES, DERIVE_REFUSES, NORMALISE_HOW, deriveFault, derived, isDerived, shapeOf as deriveShapeOf, sourcesOf, type Derive, type DeriveField, type DeriveShape } from './derive.ts';
export { withDerived, oneWithDerived, type DeriveResolve, type DerivableRow } from './derive-rows.ts';
/* THE RECORD'S VITAL SIGNS (`signs.ts`): the closed list, and what a sign and a reading are. */
export { VITAL_SIGNS, quietSign, type SignReading, type VitalSign } from './signs.ts';
/* WHAT IS IN A PROJECT'S WAY (`signs-actions.ts`): its paused, failing or late actions, for a page source. */
export { SIGNS_ACTIONS, actionsBlocking, type ActionBlocking } from './signs-actions.ts';
export { DOOR_KINDS, type DoorMark, type DoorSigns } from './door.ts';
/* A HANDOFF THAT CLOSES (`handoff.ts`): the open steps in a place, and taken, dropped or expired. */
export {
  EARLIER_MS,
  EXPIRE_MS,
  EXPIRED_NOTE,
  HANDOFF_STATES,
  PASSED_ACTIVE_MS,
  passedNote,
  drop as dropHandoff,
  expire as expireHandoffs,
  notOpenSaying,
  openHandoffs,
  take as takeHandoff,
  type HandoffChange,
  type HandoffPlace,
  type HandoffWrite,
  type OpenHandoff,
  type Taken,
} from './handoff.ts';
export { MAIL_FAULT, SAID, clearFault, missedCause, missedSaid, openFaults, raiseFault, type Fault } from './fault.ts';
/* THE RECORD'S COPIES AS THREE FACTS, and the night's two writes (`copies.ts`). */
export { NIGHT_FAULT, NIGHT_KIND, copyFacts, copyFailed, copyKept, failedNote, keptNote, nightWhy, type CopyFacts, type Lifecycle } from './copies.ts';
/* `canon` IS ALSO MIGRATE'S NAME (a script written one way), so a value written one way is `canonValue` out here. */
export { CAUSE, MOOT_GONE, MOOT_HELD, canon as canonValue, causeFault, causeOf, moot, mootWhy, noop, recheck, sha256 } from './cause.ts';
/* THE RECORD'S OWN NAME RULE (`api/person-name.ts`), so the Worker refuses at provision what a rename would refuse. */
export { PERSON_NAME_SUPPORT, personNameOf, placeholderName } from './api/person-name.ts';
export { COMMENT_MOST } from './api/comments.ts';
export {
  PICTURE_NAME,
  VISUAL_FIELD,
  VISUAL_PAGE_MOST,
  VISUAL_PICTURE_TYPES,
  VISUAL_PICTURES_BYTES_MOST,
  VISUAL_PICTURES_MOST,
  VISUAL_RECORD_MOST,
  VISUAL_TITLE_MOST,
  visualPage,
  type VisualBody,
  type VisualPicture,
} from './visual.ts';
export type { VisualHeld, VisualVersion, VisualWhole } from './api/visuals.ts';
export {
  ATTACHED_FIELD,
  ATTACHED_KINDS,
  ATTACHED_MOST,
  ATTACHED_NAME_MOST,
  ATTACHED_ON_MOST,
  ATTACHED_RECORD_MOST,
  ATTACHED_TEXT_MOST,
  attachedKind,
  attachedName,
  attachedSaid,
  attachedText,
  attachedType,
  FILES_KEY,
  filesRoom,
  magicType,
  pageText,
  pdfText,
  roomSaid,
  type AttachedBody,
  type AttachedKind,
  type FilesRoom,
} from './attachment.ts';
export type { AttachedHeld, AttachedVersion, AttachedWhole } from './api/attachments.ts';
export { ACTION_VERBS, ACTION_LEVELS, ACTION_AS, ACTION_KEYS, ACTIONS_MOST, BLOCK_VERBS, actionsBody, cutActions, type ActionVerb, type ActionLevel, type DeclaredAction, type OfferedAction, type VerbName } from './row-actions.ts';
/* THE ONE CLOCK (`presence.ts`): every reader that asks whether a run is working, quiet or gone asks here. */
export {
  ABANDON_MS,
  QUIET_MS,
  STALE_MS,
  WORKING_MS,
  isQuiet,
  isStale,
  liveRuns,
  presenceOf,
  workingRuns,
  type Presence,
  type RunRow,
  type WorkingRun,
} from './presence.ts';
/* LIVE PRESENCE: the finer words for a session open now, read with the bridge's pulse. */
export { CALL_MS, GONE_MS, PULSE_MIN_MS, THINKING_MS, isPresent, liveStateOf, placesHeard, presentRuns, type LiveState } from './presence.ts';
/* INSTRUCTIONS AND SETTINGS ROWS (agents and MCP plan §8.3), the kernel's half of what wave 2 builds on. The functions
   take the record's `Sql` first; the kernel's own methods of the same names (`instructionFor`, `takeInstruction`, …)
   are bound to the record's clock and write path. */
export {
  EXPIRED_NOTE as INSTRUCTION_EXPIRED_NOTE,
  INSTRUCTIONS,
  INSTRUCTION_KERNEL_WRITTEN,
  INSTRUCTION_KINDS,
  INSTRUCTION_PREFIX,
  INSTRUCTION_STATES,
  INSTRUCTION_TO,
  INSTRUCTION_WHEN,
  MACHINE_NAME,
  OPEN_STATES as INSTRUCTION_OPEN_STATES,
  REPLY_STATES,
  ANSWERS_MOST,
  ORDERED_FIELD,
  ON_WORD_FIELD,
  SAID_MOST,
  SEAT_NAME,
  SEEN_HOW,
  ATTACH_MOST,
  ATTACH_REF_MOST,
  WAIT_MS as INSTRUCTION_WAIT_MS,
  instructionOf,
  jobOfRun,
  instructionsTakenBy,
  openInstructions,
  type Delta,
  type InstrAnswer,
  type InstrKind,
  type InstrState,
  type InstrTo,
  type InstrWhen,
  type Instr,
  type InstructInput,
  type ReplyState,
  type RunHints,
  type SeenHow,
  type Stop,
} from './instruction.ts';
export {
  BRIEF_MOST,
  CEILINGS,
  CONTEXT_BUDGETS,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_ID,
  PROFILE_KINDS,
  mayOf,
  toolOn,
  type Ceiling,
  type ContextBudget,
  type Profile,
  type ProfileCaps,
  type ProfileContext,
  type ProfileEnforce,
  type ProfileMatch,
  type ProfileNotify,
  type ProfileQuiet,
  type ProfileRow,
  type ProfileWho,
} from './agent-profile.ts';
export { BODY_BOUND, OPERATION_METHOD, REACHES, UNBOUND_REFUSED, UNBOUND_REFUSED_FROM, boundBody, type Approved, type Looked, type DeviceCode, type DeviceRow, type Exchanged, type Operation, type OperationGrant, type Reach, type ShapeGrant, type KeychainGrant, type Waiting } from './device.ts';
export { shapeGrant };
export type { SessionHints } from './session.ts';
export type { Resolved, ScopeDecl, ScopesDecl, Whereabouts } from './scope.ts';
export { branchName, codeName, placeOnce, projectSuggestions, suggestProjects, remoteKey, SUGGEST_AFTER, type ProjectSuggestion, type SeenRun, type Candidate } from './scope.ts';
export { coerce, FIELD_TYPES, holdsKnownKey, instant, isAbsent, isJsonQuoted, hasEscapedNewline, isRealDay, looksLikeCredential, parseSpoken, spoken } from './coerce.ts';
export type { FieldDecl, FieldType, Json } from './coerce.ts';
export { splitOf, splitOfFields, rowsBySplit, type SplitField } from './row-parts.ts';
export { briefFromNote, cleanImportedNote, noteWithoutLeftovers, type NoteFields } from './note-clean.ts';
export { misread, sentencesOver, widens, type TypeShape } from './widen.ts';
/* FOR `declare`'s PLAN, which asks a widening's readers as `stranded` does and has to place an arrival's rule the same way. */
export { rowRegisterOf } from './flow-lint.ts';
/* FOR THE RECORD'S `holds`, which places a proposal by the same walk the filing check refuses it by, so the two stop being
   copies that disagree. */
export { ACROSS, ANY_LIST, touches, type Resolve as ReachResolve, type Touched } from './reach.ts';
/* FOR THE RECORD'S `answersNot`, which has to know which steps a run waiting on a question can still take. A run keeps
   its place as an index into this flat plan (`automation_run.step`), so reading the declared tree instead counted steps
   the run had already taken and arms it had already left. */
export { plan as runPlan, type Op as RunOp } from './flow.ts';
/* FOR THE RECORD'S `tryAutomation` AND THE AGENT'S `automation_try`, which hand this shape on as it is. */
export type { Tried, TriedStep, TryOptions, TrySample } from './flow-try.ts';
/* FOR THE RECORD'S DRY RUN AND THE GRAMMAR AN AGENT READS, which say what installs and what runs from the rows the lint
   and the runner read (`capabilities.ts`). */
export { CAPABILITIES, capability, notInThisBuild, serves, type Capability, type Hosts } from './capabilities.ts';
export { isUlid, ulids, ulidTime } from './ids.ts';
export { digest, indexesFor, indexName, registerOfIndex, validate as validateDeclaration, BLOCK_KINDS, KINDS, REMOVED_WINDOW_DAYS } from './declare.ts';
export { jcs } from './jcs.ts';
export { ftsQuery, projectedText } from './fts.ts';
export { TRAVELS, decode, encode, projection, tables } from './brainl.ts';
export { BYDAY, REPEAT_READ, atMs, expandRepeat, nextRepeat, offsetMs, remindersFor, shiftFrom } from './schedule.ts';
export type { Remindable, Repeat, Reminder } from './schedule.ts';
export type { ImportReport, Section, TableShape } from './brainl.ts';
export { EVENT_KINDS, isEventKind } from './events.ts';
export type { EventKind } from './events.ts';
export { OUTBOX_KINDS, backoffMs, retryDead, summary } from './outbox.ts';
export type { Ack, OutboxKind, OutboxRow } from './outbox.ts';
export { ERASED, subjectsOf } from './erase.ts';
export type { EraseReport, EraseRequest } from './erase.ts';
export { PUSH_KINDS, PUSH_OFF, PUSH_OPEN, ownersPushSubs, personPushSubs, pushKindOf, pushOpenOf } from './push.ts';
export type { PushJob, PushKind, PushSettled, PushTarget } from './push.ts';
export type { QuietWindow } from './digest.ts';
export { SCHEDULE_KINDS, drainSchedule, retryFailed, retryHandler } from './schedule.ts';
export type { CreateRecordArgs, Provisioned, Purged, WrappedKey } from './provision.ts';
export { GRANT_KINDS, KEY_ANSWERS, KEY_RULES, EVERY_MACHINE, KEY_ASK_LIFE_MS, LOCK_AFTER_MINUTES, LOCK_AFTER_DEFAULT, LOCK_AFTER_MOST_MS, spanMs } from './keychain.ts';
import { GROUP_CAP } from './buckets.ts';
import { convertMinor, RATE_STALE_DAYS, rateFor, ratesFrom } from './fx.ts';
import { MARK_IS_CONTROL, MARK_IS_CONTROL_SAYS, isControlMark, markFrozen } from './marks.ts';
import { laidOf } from './pack-laid.ts';
import { restatedWorth } from './restates.ts';
export { BUCKETS, GROUP_CAP, bucketOf, bucketRun, bucketStart, isBucket, nextBucket, shiftBucket } from './buckets.ts';
export { MEASURES_MOST, MEASURE_BACK, MEASURE_BUCKETS, localDays, measureBucket, measureLines, measurePeriod, measureSeries, measureWindow, readableZone } from './measures.ts';
export type { MeasureBucket, MeasureLatest, MeasureLines, MeasureSeries, RawReading } from './measures.ts';
import type { RawReading } from './measures.ts';
export type { Bucket } from './buckets.ts';
export { TREND_BAND, TREND_CAP, TREND_POINTS, TREND_T_MOST, trendOf } from './trend.ts';
export type { Trend, TrendAhead, TrendBucket, TrendFlat, TrendGrowth, TrendSteady } from './trend.ts';
export { dayIn, stampFinished, type FinishedDecl } from './finished.ts';
export { stepsPercent, tallySteps, type StepsDecl } from './steps.ts';
/* THE COST BAND, exported because `/decide` computes it in the browser off the same raw rows: it
   reads `governance` directly rather than through `governance.open`, and two rankings of one queue
   that disagreed would be worse than no ranking at all. */
export { COSTS, MANY_ROWS, WAITS, WAIT_RANK_SQL, WAIT_SQL, costOf, costRank, costRows, optionCost, optionCosts, pickCost, waitOf, waitParams, waitRank, waitRows, worseCost, type Cost, type CostRows, type Wait } from './weigh.ts';
export { AGGREGATIONS, bucketState, deltaFrom, evaluateMetric, fxOfPair, largestFirst, meets, rateUnit, scorePrediction, snapshot, targetCurrency, targetFor, targetInto, targetOf, windowMs } from './metrics.ts';
export { clockOf, isMoneyFormat, verdictOf } from './metrics.ts';
export { readDeclaredSigns, vitalOf } from './metrics.ts';
export { farRates, pointSaid, RATE_QUIET_DAYS } from './metrics.ts';
/* A DIFFERENCE AGAINST THE WINDOW BEFORE (`diff.before`), for the seed and the browser's reader: the clock moved back a month, the gate a change passes, and the words a declaration may say. */
export { BEFORE, comparisonOf, monthBefore, yearBefore } from './metrics.ts';
export type { Before, Halves } from './metrics.ts';
export { SESSIONS_WORKING, readRunsWorking } from './built-in-figures.ts';
/* The runs list and a run's handle, so the web's literal copies are tested against them (books-kept.test.ts). */
export { SESSION, SESSION_PREFIX } from './session.ts';
export { HANDOFFS_OPEN, openSteps, readHandoffsOpen, type OpenStep } from './built-in-figures.ts';
/* THE TIDY AS FIGURES: the source, its reader, and the id of one finder's own figure. */
export { RECORD_TIDY, readTidy, staleFigureOf, type TidyDecl } from './built-in-figures.ts';
export { ACTIVITY_BY, RECORD_ACTIVITY, readActivity, type ActivityBy, type ActivityDecl } from './built-in-figures.ts';
export { KEYS_IN_TEXT, RECORD_KEY_SCAN, keysInText, placeOf, readKeysInText, scanKeys, type KeyFinding, type KeyScan } from './key-scan.ts';
export { CROSSCHECK_ENTRIES_MOST, CROSSCHECK_NOTHING, CROSSCHECK_TOO_MANY, ROLLED_ACCOUNTS_MOST, ROLLED_CHECKS_MOST, WALKS, WALK_SOURCE, beyondOf, figureLists } from './money-figures.ts';
export type { Beyond, Crosscheck, Rolled, RolledCheck, RolledMoves, Walked, WalkReading } from './money-figures.ts';
export { HOME_CURRENCY_SETTING, across, convertMinor, dayFieldOf, homeFrom, isAtLeast, pairParts, partsOf, rateFor, ratesFrom, reduceOf } from './fx.ts';
export type { Across, Amount, Part, Rate, Reduce } from './fx.ts';
export { RAIL_PAGES, REDUCES, ROW_TEXT_MOST, SEED_ACTOR, WITHHELD_CODES, byOf, fill, pathsOf, railRoom, readBlock, readPage, resolvePages, slugify, whollyWithheld } from './pages.ts';
/* THE PAGES CENSUS (`census.ts`): what one page's answer says about itself, refused blocks, paths that named nothing, dashes. */
export { censusOf, type Census, type CensusAlso, type Held } from './census.ts';
/* WHAT EVERY READER DRAWS (`drawn.ts`), one rule for the record, the web and an agent's read of a page. */
export { KEEP, WHY, arranged, bare, emptyHidden, gone, holdsNothing, keeps, leadOf, markDrawn, says, unsaid, type Drawable, type Why } from './drawn.ts';
/* WHAT A READ ANSWERS ON A BLOCK, which the record takes off a block it holds from a reader (`packages/record` `DRAWN`). */
export { flowGrammar, type FlowGrammar, type GrammarStep, type Arg as FlowGrammarArg } from './flow-grammar.ts';
export { ANSWER_KEYS, BLOCK_INSTALLS, BLOCK_KEY, blockKeyOf, defaultBlockKey, keyedBlocks } from './block-keys.ts';
export { WHEN_READERS, actionsFault, declaredActions, type WhenReader } from './block-keys.ts';
export { BOARD_MOST, boardFault, headOfBoard, widgetFault } from './board.ts';
export { WIDGET_SIZES, isWidgetSize, sizeRead, sizesOf as widgetSizesOf, type WidgetSize } from './kinds/sizes.ts';
/* THE LOOK OVERLAY (`compose.ts`): what Slash and the owner write over a page, and the rules' own look. */
export { applyLook, composeLook, drewNothing, lookOf, lookPlacesFault, mergeLook, questionsLead, queuesKept, LOOK_AREAS, LOOK_BY, LOOK_SPANS, RANK, type ComposeInput, type LookBody, type LookBy, type LookNext } from './compose.ts';
/* A LOOK'S GROUPING (`compose.ts`): which kinds a look may group, how many, and over how many values. */
export { GROUPED_BY_FIELD, GROUP_ROWS_OVER, GROUP_VALUES_LEAST, GROUP_VALUES_MOST, LOOK_GROUPS_MOST, groupsWell, valuesShown } from './compose.ts';
/* THE HOLES IN A LOOK'S HEADLINE (`compose.ts`): a number a line says is a hole the record fills from the page's own figures. */
export { figureSaid, figuresOf, fillHoles, holesIn, withoutHoles } from './compose.ts';
/* WHAT WENT QUIET (`exceptions.ts`): the read, what it answers and the lists a caller hands it to watch. */
export { LISTS_A_READ, openExceptions, type Exception, type Was, type Watched } from './exceptions.ts';
/* THE TIDY (`tidy.ts`): what is stale now and what the record cleared, a finder a line, as the hourly sweep keeps it. */
export { KEEP_DAYS, causeOfFinder, finderOf, finders, registerFinder, staleNow, tidied, tidyDays, tidyHour, type Finder, type Found, type TidyAsk, type TidyDay, type TidyDeps, type TidyLine } from './tidy.ts';
/* WHAT A ROW IS AND WHERE IT WAS SEEN (`about.ts`): the one read of a person, an organisation or a project, and the candidates a text may be about. */
export { CANDIDATES, SEEN_KEPT, SEEN_SHOWN, aboutOf, aboutOfRow, candidatesFor, keysIn } from './about.ts';
export type { About, AboutDeps, AboutKind, AboutLink, AboutSeen, Candidate as AboutCandidate, FoundBy, Handed, HandleRow } from './about.ts';
export { admitHostSources, lookFault } from './declare.ts';
export {
  CHANNELS,
  carryingOf,
  headline,
  heldIn,
  inQuietHours,
  LEVELS,
  levelOf,
  localParts,
  mutedFor,
  nextOccurrence,
  quietOf,
  render,
  runDigest,
  sectionsOf,
  SECTION_LINES,
  sendDigest,
  twoSentences,
  URGENT_NOTE,
  WORDS_MOST,
} from './digest.ts';
export { DIGEST_SOURCES, computedPart } from './digest-sources.ts';
export { parseSentence, TODAY_TONE, type ActionOption, type Part as SentencePart, type SentenceParts, type TriggerOption, type Replay, type Sentenced, type SentenceDoor, type SentenceField, type SentenceList, type SentenceWorld } from './sentence.ts';
export { CREATE_CEILING, applyRule, dryRun, fill as fillTemplate, linkFault, linkPatternFault, marker, order as orderRules, runRules } from './rules.ts';
export { runway } from './forecast.ts';
export { anchorDayOf, cycleAfter, restDaysOf } from './forecast.ts';
export { SERIES_AHEAD, SERIES_BACK, SERIES_LINES, barsOf } from './series.ts';
export { SETUP_KIND, setupCollapser, type FeedLine } from './feed.ts';
export type { Bars, SeriesLine } from './series.ts';
export { LIST_PAGE_COLUMNS, LIST_PAGE_ROWS, listPage, type ListPage, type ListPageBlock, type ListPageColumn, type ListPageFilter, type ListPageSaid, type ListPageShape, type ListPageField } from './default-pages.ts';
/* An arrangement's parts (govern-parts-43), by their ids and needs; `partsOf` is fx.ts's name here, so it goes out as arrangePartsOf. */
export { ANSWERED_IN, CHANGED_NOTE, GONE_NOTE, APART_PREF, apartIds, apartJson, NOT_APART, ARRANGING, BODY_KINDS, COVERED, GOVERNANCE, HANDLED_PREF, apartOn, HANDLED_REASONS, HANDLED_RULE, LADDER_RULE, OPEN_ARRANGEMENTS, PACK_VERBS, handledFault, handledOn, ladderFault, partsOf as arrangePartsOf, pressedOnly, rememberedLine, uniteArrangements } from './govern.ts';
/* THE LADDER OF TRUST'S NAMES (`change-kind.ts`): what kind of change a write or a question is, and which rung an agent
   stands on for it, so the record, the web and the CLI read one table of kinds rather than each keeping a copy. Its
   `agentOf` goes out as `ladderAgentOf`, since `session.ts`'s `agentOf` (the kind of agent a run is) already has the name. */
export {
  ATTACH, ADDONS, AUTOMATION, CALL, FLOORS, KEPT_DAYS, RUNGS, agentOf as ladderAgentOf, dearest, keysOfStamp, kindOfEvent, kindOfAttach, kindOfWrite, kindsOfProposal, kindsOfWrite, madeByIn,
  personOf, JOINED_AT, recordReader, rungOf, seedLadder, shapeIn, stampOf, tokenOfRun, askedKeyOf, ASKED_KEY,
  type ChangeKind, type Floor, type KindReader, type ListShape, type Rung, type WriteSaid,
} from './change-kind.ts';
/* UNDO ON THE SERVER (`undo.ts`) and THE WALK OVER WHAT THE RECORD ALREADY HOLDS (`backfill.ts`), each also a kernel
   method below (`undoPlan`, `undoApply`, `backfill`, `undoBackfill`), which hands them the record's own parts. */
/* WHAT PUTTING A MATCH BACK WOULD DO (`undo-fold.ts`), each also a kernel method below (`foldPlan`, `isFold`). */
export { foldPlan, isFold, type FoldDeps, type FoldList, type FoldPlan, type FoldRow } from './undo-fold.ts';
export { undoApply, undoPlan, undoStaged, type UndoApplied, type UndoDeclared, type UndoDo, type UndoneMark, type UndoOptions, type UndoParts, type UndoPlan, type UndoRow, type UndoScope, type UndoSkip, type UndoStage, type UndoStep } from './undo.ts';
export {
  BACKFILL_ACTOR, BACKFILL_LIMIT, BACKFILL_SOURCE, PAYEE_SEEN, organisationsHolding, tidy as tidyPayee, understandBackfill, undoBackfill,
  type BackfillDeps, type BackfillOptions, type BackfillSuggestion, type Backfilled, type Named as BackfillNamed, type Slice as BackfillSlice, type SliceName as BackfillSliceName,
} from './backfill.ts';
export { MET_CAP, PEOPLE, RESOLVE_PAIRS_NIGHT, pairHash, peopleTwiceIds, peopleTwiceIdsIn } from './people.ts';
export type { ContactArgs, ContactMet, MeetArgs, Met, MetRow, ResolveJob, ResolveSide } from './people.ts';
/* THE BANDS A MODEL'S ANSWER IS SETTLED IN (`people.ts`). Nothing here folds by itself: `settleVerdicts` folds
   only for a caller that hands it the switch, and no caller in this file does. */
export { BAND_ASK, BAND_SURE, corroborated, settleVerdicts, type BandFold, type Settlement, type SettleOpts } from './people.ts';
export { foldFill, identityFloor, type FoldField, type FoldFields, type FoldFilled, type FoldRow as FoldFillRow, type Offered } from './mentions.ts';
/* THE OTHER PAIRS (`resolve.ts`): two organisations or two projects that read as one, and a name seen that no
   row is called. A read that writes nothing and asks nothing. */
export { PAIRS_MOST, evidenceOf, pairsFor, type Pair, type PairHow, type PairRow, type PairSide, type Pairs } from './resolve.ts';
export type { MeetsFields, OrgFields, RatesFields } from './roles.ts';
/* THE LIST HOLDING THE RATES, by its `rates:` key or, on a record older than the key, by the name it had (`roles.ts`):
   exported so a page that draws the rates finds the same list the conversion reads. */
export { meetsRole, ratesRole } from './roles.ts';
/* THE IDENTITY KEYS (`identity-keys.ts`), for every door that reads who something is about: one normaliser, so a key
   the CLI harvests from a commit and one the record holds are the same string. */
export { KEY_KINDS, PUBLIC_MAIL, WEAK_KINDS, bankKey, githubOfAddress, isMachineIdentity, isOrganisationAddress, isPublicMail, isWeakKey, keyFrom, keyOf, keyOfAny, keysOf, kindOfKey, legacyBankKey, legacyKeysOf, nameWords, parseFrom, payeeName, registrable, sameFold, valueOfKey } from './identity-keys.ts';
export type { IdentitySaid, KeyInput, KeyKind, SameFold } from './identity-keys.ts';
export { claimed, entityLists, keyLists, nameKey, noteMention, projectList, sameLists, settledBy } from './entities.ts';
/* `Claimed` is the scheduler's name here already (`schedule.ts`), so the keys' one goes out as `KeyClaimed`. */
export type { Claimed as KeyClaimed, EntityList, KeyList, ProjectList, SameList, SameRule } from './entities.ts';
/* WHAT MAKES TWO ROWS THE SAME: the groups here twice, and the writes that fold them, for a person's press.
   `foldPlan` is already the name of what undoing a match would do (`undo-fold.ts`), so this one goes out as `sameFoldPlan`. */
export { clashes, foldPlan as sameFoldPlan, sameListOf, sameRuleOf } from './same.ts';
export type { FoldGroup, FoldWrite, SameDecl, SameGroup } from './same.ts';
export { isMarkGlyph, isUnknownMark } from './marks.ts';
export { GLYPH_LIST, glyphFault } from './glyph-names.ts';
export { PANEL_TABLE, PANELS } from './kinds/words.ts';
export { CEILING, CLIENT_KINDS, SCOPES, ceilingOf, DEFAULT_DAYS as TOKEN_DAYS } from './token.ts';
export { cutOffReadable, endedByCutOff, isBuild } from './token.ts';
export { AGENTS_KEY, agentCap, agentsFull, liveAgents, type AgentCap } from './token.ts';
export { CHILD_MINUTES_MOST } from './token.ts';
export { LEVELS as MEMBER_LEVELS, RECORD as WHOLE_RECORD } from './members.ts';
export type { DrawSeen } from './held-readings.ts';
export { STOPPED as MEMBER_STOPPED, type Suspended } from './members.ts';
export type { Member, Grant, Held as AccessHeld } from './members.ts';
export { EPOCH as ACCESS_EPOCH, bumpEpoch, epochOf, LensCache, sharesFor, narrowsOf, catalogOf, gateFieldsOf } from './shares.ts';
export { meOf as shareMeOf, type GroupKept, type ShareInput, type ShareKept } from './shares.ts';
export { whereFor, scopeFor, NOBODY, viewerOfPrincipal, viewerOfRead, WHERE_MAX_CHARS, type Wheres } from './members.ts';
/* SHARING (the sharing plan, Slice 1): the lens as pure functions, and nothing wired yet. `Rung` and `Capability` are
   already names here (`change-kind.ts`, `capabilities.ts`), so the share ones go out as `ShareRung` and `LensCap`. */
export {
  activeAt, CAPS as LENS_CAPS, checkShare, fold as foldLens, gateFields, lensOf, nextEdge as shareNextEdge, ONCE_MS as SHARE_ONCE_MS,
  PARAMS_MAX as SHARE_PARAMS_MAX, paramsOf as shareParamsOf, paramsOn as shareParamsOn, ROWS_MAX as SHARE_ROWS_MAX, RUNGS as SHARE_RUNGS,
  schemaOf as lensSchemaOf, shareFault, shareReach, targetReaches as shareTargetReaches, targetWhole as shareTargetWhole, WHERE_MAX_DEPTH as SHARE_WHERE_MAX_DEPTH, WHERE_MAX_LEAVES as SHARE_WHERE_MAX_LEAVES, whereFault as shareWhereFault,
} from './lens.ts';
export type {
  Cap as LensCap, Catalog as LensCatalog, CatalogField as LensCatalogField, CatalogList as LensCatalogList, Caps as ShareCaps,
  CheckOpts as ShareCheckOpts, Expr as LensExpr, HeldShare, Hide as ShareHide, Hours as ShareHours, Lens, LensCtx, LensLevel, LensSources,
  Narrow as TokenNarrow, Pred as LensPred, Rung as ShareRung, Share, Target as ShareTarget, When as ShareWhen, Where as ShareWhere, Who as ShareWho,
} from './lens.ts';
export { ACCESS_ENDED_AT, accessEndedSaid, dayOf as shareDayOf, sentenceOf as shareSentenceOf, sharedWithYou, subjectOf as shareSubjectOf, type ShareNames, type WordsOpts as ShareWordsOpts } from './share-words.ts';
export { SHARE_TEMPLATES, type ShareTemplate, type TemplateAsk as ShareTemplateAsk, type TemplateRow as ShareTemplateRow } from './share-templates.ts';
export { canReadRow, canWriteRow, ROW_GRANT_RUNGS, rowGrantShares, rowGrantsIn, rowGrantsOn, type RowGrant, type RowGrantArgs, type RowGrantBuilt, type RowGrantLines, type RowGrantRung, type RowLike } from './row-grants.ts';
export { isDay, stillShown as blockStillShown, untilFault } from './until.ts';
export { GONE as INVITE_GONE, INVITE_HOURS, tokenParts as inviteTokenParts } from './invitations.ts';
export type { Accepted as InviteAccepted, InvitationRow, InviteArgs, Invited } from './invitations.ts';
export type { ChildArgs, ClientKind, CreateTokenArgs, Minted, Scope, TokenClient, TokenReach, TokenRow, Verified } from './token.ts';
/* THE JOB QUEUE'S NAMES (`jobs.ts`, `kernel.jobs`). Its `Claimed` stays unexported here, because the scheduler's `Claimed`
   already has the name; a caller reads it as `ReturnType` of `kernel.jobs.claim`. */
export { JOB_AGENTS, JOB_EVENT_KINDS, JOB_LEASE_MS, JOB_MCP_PATH, JOB_MCP_PREFIX, JOB_NO_REPO, JOB_PERMISSIONS, JOB_REPO_SLOT, JOB_STATUSES, commandOf, fillPrompt, jobBody } from './jobs.ts';
export type {
  CancelRead,
  Cancelled,
  ClaimedJob,
  CreateJobArgs,
  JobAgent,
  JobBody,
  JobEvent,
  JobEvents,
  JobRow,
  JobRunner,
  JobsPage,
  PostJobEventArgs,
  Posted,
  RunnerHeard,
  RunnerPlace,
} from './jobs.ts';
export type { ArrangePart, Arranging, Decision, Decided, Filed, Proposal, Remembered, Suggestion, Verdict, GovernRegister, BodyKind } from './govern.ts';
export type { Prediction } from './govern.ts';
export { computedSet, computedFor, type Computed } from './computed-set.ts';
export { AUTOMATION_INSIDE, AUTOMATION_REACHES, kindOfAutomationChange, stepsDiff } from './automation-kind.ts';
/* `exponentOf` IS EXPORTED SO THE RECORD'S CURRENCY TABLE IS NOT A SECOND EXPONENT READER. It is
   `Intl`, cached per code; a table built from a copy of it could disagree with the reading. */
export { CHANNELS as INGEST_CHANNELS, CONFIDENCES, PROPOSE_AT, arrive, day as ingestDay, exponentOf, extract as extractField, fileAsSecond, patternReport, resolve as extractOutcome, senderOf, shapeOf, tailCause } from './ingest.ts';
export { OBSERVE_COUNT, OBSERVE_COUNT_WHO, SIGNALS, WINDOWS, analyse, brakeOf, findingsFrom, mayPropose, observe, slashBrake } from './observe.ts';
/* WHAT A CARD SAYS OF AN AMOUNT AND OF WHERE A RUN STANDS: the kernel's own two readings, so the briefing writes neither again. */
export { moneyText } from './ingest.ts';
export { MONEY_MASK, maskMoneyText } from './mail-read.ts';
/* THE SHAPES OWED A PATTERN: which arrivals wait on a draft, and the cause their one question is filed under. */
export { owedShapes, patternCause, UNVERIFIED, type Owed } from './ingest.ts';
export { runPlace } from './handoff.ts';
export { FLOOR_MS, applyPull, checkInterval, firePull, intervalMs, jitterMs } from './pull.ts';
export { applyPage, writePoints } from './fetched.ts';
export { extractPull } from './extract.ts';
/* `43 §4.5`'s coercion. `extract` is rank 9 and this is 7, so that edge points down and the reader of a
   structured row calls this rather than growing a second table (`31 §2`). */
export { MAP_TYPES, mapField, select, type MapDeps, type Mapped, type Mapping } from './map.ts';
export type { ExtractDecl, ExtractDeps } from './extract.ts';
export type { MetricPoint, PageWrote, PulledPage, PulledRow } from './fetched.ts';
export type { Fired as PullFired, PullDecl, PullDeps } from './pull.ts';
/* `scriptBody` IS THE SHAPE CHECK A DRAFT MEETS BEFORE IT IS TRIED, the one install runs, so `scriptTry` in the record refuses
   what an install would and never runs a body the record could not hold. */
export { egressChanged, scriptBody, SCRIPT_MODEL_ASKS_MOST, SCRIPT_NOTICES_PER_DAY, SCRIPT_STORE_BYTES } from './script.ts';
export { DRAWN_ACTION, DRAWN_ACTIONS_MOST, drawnActionsFault, drawnWrites } from './kinds/drawn.ts';
export { binnedStoreHolder, dropStore, noticeOf, noticeSaid, NOTICE_BODY_MOST, NOTICE_TITLE_MOST, scriptOwner, STORE_KEY_MOST, storeAfter, storeHolder, storeKeyFault, type Notice, type Stored } from './addon-state.ts';
export {
  finishScript,
  prepareScript,
  proposalOf,
  PROPOSALS_PER_RUN,
  PROPOSE_CALLS,
  resumeScript,
  REFUSED_IN_A_ROW,
  SCRIPT_PROPOSAL_KINDS,
  type ScriptAnswer,
  type ScriptProposal,
  type ScriptProposalKind,
  type ScriptProposed,
  type ScriptRunner,
  type ScriptRunDeps,
  type ScriptUnrun,
  type Scripted,
} from './script-run.ts';
export { ACTION_KINDS, ACTION_MAX_BYTES, ACTION_TIMEOUT_MS, KEY_OPENED_UNATTENDED, KEY_OPENED_UNATTENDED_PASSPHRASE, RULE_CALLS_PER_DAY, actionJitterMs, answerHash, approvalLines, egressOf, grantChosen, heldHost, hostOpened, keyOutOfScope, keyScopeOf, originsOf, reserveFor, type KeyOutOfScope } from './actions.ts';
export { pinHost } from './keychain.ts';
import { pinHost as holdKeyToHost } from './keychain.ts';
/* RUN NOW (`nudge.ts`): an action's waiting run moved to now, at most once a minute an action and twenty an hour a record. */
export { nudgeAction, nudgeRate, NUDGE_ACTION_MS, NUDGE_RECORD_MOST, NUDGE_RECORD_MS, NUDGE_FIELD, type NudgeDeps, type Nudged } from './nudge.ts';
export type {
  ActionAnswer, ActionDecl, ActionKind, ActionRequest, ActionRow, ActionsRun, CallQueued, Egress, Execute,
  /* The connector runner's half: what a paging job looks like, and what a host wires to run one. */
  Paged, PagedReport, PagedRun, PullHandoff,
  /* What one invocation has left to spend, when the host it runs on counts requests. */
  Budget,
  /* Why a key cannot carry an approval, and what to do about it. */
  KeyNotReady,
  /* A keychain row as far as choosing the newest live one under a name needs it. */
  GrantChoosable,
} from './actions.ts';

/**
 * Several declarations proposed as one change, so one press installs and arms all of them.
 *
 * A PACK UPDATE THAT ADDS TWO ACTIONS IS ONE QUESTION, not two. `install` takes a bundle wherever it takes a declaration.
 */
export type DeclarationBundle = { declarations: Declaration[] };
export type { Analysis, Brake, Counted, Finding, MayPropose, Observation, Signal } from './observe.ts';
export type { Answered, Arrival, Arrived, Confidence, DoorLine, Extracted, Extractor, FieldOutcome, IngestDecl, IngestDeps, NumberReaders, PatternLine, PatternReport, Sender } from './ingest.ts';
export type { CycleLine, ForecastDeps, Horizon, Leg, Runway, Step } from './forecast.ts';
export type { DryRun, Fired, LinkTo, RuleAction, RuleDecl, RulesDeps, RulesOutcome } from './rules.ts';
export type { Assembled, Channel, DigestDecl, DigestDeps, DigestPart, DigestSection, HeldNotice, Level, Sent } from './digest.ts';
export type { BlockResult, DecidedQuestion, FigureFacts, HostSource, PageBlock, PageDecl, PageDeps, PageFilter, PageResult, PageRow, PageSees, LastChange, RowChange, QueueCandidate, QueueOption, QueueQuestion, QuestionFacts } from './pages.ts';
export { doesOf, type DoesNames } from './does.ts';
export type { Aggregation, Crossed, DeclaredSign, EvalContext, FxRead, Group, Lookups, MetricDecl, Reading, Scored, Snapshot, TargetIn, TrendSaid, Value } from './metrics.ts';
export type { BindGrantArgs, GrantKind, GrantRow, KeyAccessRow, KeyAnswer, KeyAskRow, KeyAskStatus, KeyGate, KeyRule, LeasedSeal, LockAfter, SealedGrant } from './keychain.ts';
export type { Claimed, Drained, Handler, ScheduleKind } from './schedule.ts';
export type { Hit } from './fts.ts';
export type { ConfigDecl, ConfigType, Declaration, DeclKind, Expected, Installed, Known, Owners, PackConfig, PackToggle, PlannedRecord } from './declare.ts';
export { CONFIG_TYPES, configReads, configValue, fillConfig, readConfig } from './declare.ts';

/**
 * Who a declaration change is by, for its `declare` event: the person or token that pressed, and on an accepted
 * `change` the suggestion it answers, whose `opened_by` the event's note names as the proposer.
 *
 * OPTIONAL ON `install` BECAUSE THE SEED AND A BARE KERNEL CALL IT TOO, and an install nobody is named for writes no
 * `declare` line: it is setup, not a change somebody made (see `declared`).
 */
export type DeclaredBy = { actor: string; suggestion?: string };

/** One part of an add-on a plan held back, and the lists or roles it waits for the record to hold (`when: { holds }`). */
export type PackWaiting = { at: string; holds: string[] };

/** `pack.waiting` as it was written, and `[]` for anything else that got into the cell. */
function waitingOf(cell: string): PackWaiting[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cell);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PackWaiting[] = [];
  for (const w of parsed as unknown[]) {
    if (w === null || typeof w !== 'object') continue;
    const { at, holds } = w as { at?: unknown; holds?: unknown };
    if (typeof at !== 'string' || !Array.isArray(holds)) continue;
    out.push({ at, holds: holds.filter((h): h is string => typeof h === 'string') });
  }
  return out;
}

/**
 * One pack as `packStates()` reads it. `version` is `null` for a pack the seed owns by its body, which
 * has no `pack` row to carry one; `registers` are the ones it holds while on and the ones it went off with.
 */
export type PackState = {
  id: string;
  version: string | null;
  disabled_at: string | null;
  registers: string[];
  /**
   * Holds declarations another pack handed it, and was never installed: no `pack` row, and live declarations whose
   * `pack_id` names it. Read as on at no version otherwise, which is how `bank-hsbc-eg` looked after money-core handed it
   * a door (`declare`'s `test/plan-handover-shown.test.ts`).
   */
  handed?: true;
};

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

/**
 * THE BAND A QUEUE RANKS AND COUNTS BY IS `costOf`'s, as SQL (`COST_SQL` in `weigh.ts`), and nothing beside it.
 *
 * ONE RULE NOW. It was `COST_SQL` under a clause of this file's own that said a rowset writing a money
 * value is always hard to undo, so such a question never sat in a cheap band where Enter would accept
 * it. That clause is now `costOf`'s own rowset arm, in the same SQL (`MOVES_MONEY_SQL`), and a second copy here could
 * only ever disagree with it. `questionFrom` says the same of the question it draws, and one thing more that no body
 * can say: a money field cleared (`movesMoney` below, read by the field's declared type).
 */
const BAND_SQL = COST_SQL;

/** How many of its writes a dry walk over the past says, in names (`kernel.backfill({ dry: true })`). */
const BACKFILL_PLANNED = 10;

/** One write a dry walk would make: the list's name, the row's title (`null` for a new row), and each field by its label. */
export type BackfillPlanned = { list: string; row: string | null; fields: Record<string, Json> };

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
    /** Worked out at read from the row's other fields, never stored (`derive.ts`). `listsOf` sets `derived` beside it. */
    derive?: Json;
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
    /** On a day: the day a row is due by rather than the day something happened (`isDeadline` in `metrics.ts`). */
    deadline?: boolean;
    /** The list's own bookkeeping: left out of an agent's short answers, kept in `format: full` and the app. */
    hidden_from_agents?: boolean;
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
  /** How two rows are the two legs of one transfer, found by the write path and marked on both (`pairs.ts`). */
  pairs?: PairsDecl;
  /** The order a read that names none comes back in: one field of this list that sorts, no `dir` lowest first, as `declare.ts` admits it. */
  order?: { field: string; dir?: 'asc' | 'desc' };
  /** The columns its table opens on, in order: a field, or one with a field read where it holds nothing and a heading (`42 §4.4`). */
  table?: readonly (string | { field: string; or?: string | readonly string[]; label?: string })[];
  /** A list a record-wide "Adds only" does not reach, as Keys and People are by their roles (`20 §1`). */
  owner_only?: true;
  /** A list only the owner reads and writes: no grant, share, link, child key or "See as" reaches it (`42 §4.4`). */
  personal?: true;
  /** A list the record's own automations write, never typed one by one: offered no page of its own (`42 §4.4`). */
  kept_by?: 'automations';
  /** Who holds a row: a link to the person it is handed to, a text field naming the agent, and a state it moves
   * to when an agent takes it (checked at install by `declare.ts`'s `handFault`). */
  hand?: { person?: string; agent?: string; taken?: string };
  /**
   * The fields an add-on writes once: what it plants on a row it makes, and never patches on a row that is
   * already there. A category's name is the case: the add-on's next version may spell it another way, and the person
   * has renamed theirs since. Read by the write path for a write that says it is the add-on's (`WriteContext.pack`),
   * and by nothing else: a person changes the field as they change any other, which is what `immutable` forbids and
   * this does not.
   */
  once?: readonly string[];
  /** What makes two of its rows the same thing (`declare.ts`'s `sameFault`): read by `same.ts` and `entities.ts`. */
  same?: { fields: readonly string[]; within?: string; fold: 'text' | 'exact'; keep?: 'oldest' | 'latest' | 'sealed' };
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
  /** On a write's answer only: the batch it was written under, which `undoPlan`/`undoApply` take to put it back. */
  batch?: string;
  /** On a write's answer only: true when an op_id replayed a write already made, so nothing new was written. */
  replayed?: true;
  /** On a row `list` or `get` answers a viewer: its maker kept it to themselves (migration 40), so only they are reading it. */
  private?: true;
  /** On a row `get` answers: the viewer made it, so the viewer may keep it private or share it again. */
  mine?: true;
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
  principal?: { kind: 'person' | 'token' | 'system'; token?: string | undefined; widens?: true | undefined } | undefined;
  /** What an agent says about its run. Read for a token's write only. */
  session?: SessionHints | undefined;
  /**
   * Which registers the writer reads, so a ref she writes into one she cannot is not looked up. Absent is all.
   *
   * `list`'s RULE, ON THE WAY IN. The write path resolved a spoken id against the whole record, so the member invited
   * to Jobs alone filed a Job at `clients#1` and was answered `ok`, at `clients#2` "which was deleted", and at
   * `clients#9` "there is no such row": three answers about a list whose `list` refuses her. With this, a ref into a
   * list she cannot read names no row, whether the row is live, deleted or never existed.
   *
   * AND A ROW HOLDING A KEY IS NAMED ONLY WHEN THIS SAYS ITS LIST IS READ: absent, the refusal says "someone on this
   * list" (`mergeDoor`), since a write that does not say who reads it may be answered to anybody.
   */
  reads?: ((register: string) => boolean) | undefined;
  /**
   * The write is an add-on's own: its install or its update planting a row or going over one it planted before.
   *
   * WHAT IT CHANGES IS ONE THING. On a row that already exists, a field the list declares `once` is left as the row
   * holds it, and the rest of the patch is written: no refusal, since the add-on did nothing wrong by carrying the
   * value, and the row's own is the newer word. On a create every field is written, `once` or not. A write without
   * this is a person's or an agent's and is not narrowed at all.
   */
  pack?: true | undefined;
  /**
   * The rows of the written list this writer may write, as the scope a reader hands `list`
   * (`scope(ctx, register)`): the grant's rule and the private rows left out for them. Absent is every row.
   *
   * CHECKED ON BOTH SIDES OF THE WRITE, IN ITS TRANSACTION, by the SQL reads use, so there is no second evaluator. A row
   * it does not admit before the write is answered exactly as a row that is not there; a row it does not admit after
   * the write (a create outside it, an edit that moves the row out) is unwound with a sentence saying so. It holds for
   * the one list the write names, never for what the rules pass writes after it. `null` admits no row already there.
   */
  within?: Json | undefined;
  /**
   * WHO WROTE THIS, FOR THE AUDIT, handed only for a writer who is not an owner: the person, and
   * whether it is their agent. The write keeps one `access_via` row for its batch, IN ITS OWN TRANSACTION, naming the
   * shares whose write predicate admits the row it leaves (one SELECT per covering share), so "Priya changed M14 through
   * the Accountant share" can be said later. Like `within`, it holds for the one list the write names and never for what
   * the rules pass writes after it.
   */
  via?: { who: string; agent?: boolean } | undefined;
  /**
   * For a proposal: whether a row its body names is one the proposer may see. A row it does not
   * admit is answered as a row that is not there. Absent, every row is.
   */
  sees?: ((register: string, id: string) => boolean) | undefined;
};

const RESERVED =new Set(['id', 'seq', 'register', 'created_at', 'updated_at', 'version', 'spoken', 'title']);

/**
 * `tags`, which every list takes whether or not it declared it.
 *
 * THE RECORD'S OWN MARKER FIELD, AND IT DEPENDED ON A SEED. The `example` marker, `formed`, the `tag` and `untag` rule
 * actions and Slash's "not an example" count all read or write `tags` and name no field, and the field existed only
 * because `packages/seed` appends it to its own lists. Measured with a list `jobs` declared without it and a rule
 * `then: [{ tag: late }, { note: 'late one' }]`: the rule installed and fired, its patch was refused `FIELD_UNKNOWN`,
 * the note in the same rule went with it, and the only trace was a `write.refused` counter.
 *
 * ADDED WHERE A VALUE IS WRITTEN AND WHERE A PREDICATE IS READ, AND NOWHERE ELSE. `register(id)` and `registers()` still
 * hand back the body somebody declared, because an agent reading a list's fields to learn what it holds should not find
 * one nobody wrote down, and `declare` diffs that body against the next version. `schemaOf` does carry it: it is the
 * vocabulary a `where:` compiles against, the value sits in `fields` exactly as a declared `list<text>` does, and
 * `tags has late` on a list that never declared it has to read.
 *
 * A LIST THAT DECLARES ITS OWN `tags` KEEPS IT, retired or of another shape, since that is a choice somebody made.
 */
type DeclaredField = RegisterDecl['fields'][number];
const TAGS: DeclaredField = { id: 'tags', type: 'list', of: 'text' };
/** The keychain's index list, which a share reaches only by naming it (`lens.ts`'s `keys` role). */
const KEYCHAIN_LIST = 'credentials';

const withTags = (fields: readonly DeclaredField[]): readonly DeclaredField[] =>
  fields.some((f) => f.id === 'tags') ? fields : [...fields, TAGS];

/**
 * How far an agent's clock may sit from the record's for an `instant` it wrote to still be a stamp of the moment it
 * wrote (`bookkeeping`): ten minutes, more than a scan of a machine's tools spends between reading its clock and
 * writing the last of them.
 */
const STAMP_MS = 10 * 60_000;

/** How many lines a feed walks past the record's own bookkeeping to fill itself, and how many it reads at a time. */
const FEED_WALK = 5_000;
const FEED_BATCH = 500;

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
  /**
   * On a line a run signed, who that run is (as a feed line's `run_by` in `pages.ts`), or `null` for a handle no run
   * holds. Absent where the actor is a person, a rule or anybody else, so a host calls only a run by its agent.
   */
  run_by?: RunBy | null;
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
  state: InboxState;
  reason: string | null;
  /**
   * Who filed or archived it, when a person or an agent's run did (`settledBy`), and the row a filing made. Absent on an
   * arrival that waits, and on one a rule moved: that one has no settlement to take back, so nothing offers Put back.
   */
  settled?: ArrivalSettlement;
  /**
   * The id of the row a skipped arrival repeats, read from the `repeats` mark ingest wrote on its newest `match` line.
   * Absent on any arrival the dedupe did not set aside, a rule's skip among them, so a screen offers
   * "It is a second one" by this mark and never by the reason's words.
   */
  repeats?: string;
};

/**
 * A person's or a run's filing or archiving, as `returnArrival` would take it back: the actor that signed the `state`
 * event, when, and for a filing the row it made with the `version` a return archives it at.
 *
 * THE ROW'S VERSION TRAVELS WITH IT because `returnArrival` archives the row compare-and-set: a reader that puts an
 * arrival back names the version it saw, and a row edited since answers the conflict instead of being buried.
 */
export type ArrivalSettlement = {
  by: string;
  at: string;
  row: { id: string; register: string; seq: number | null; version: number; archived: boolean } | null;
};

/**
 * The states an arrival can be read back in: the DDL's seven, less `erased`.
 *
 * `erased` IS NOT A STATE ANYBODY READS. Its bytes are gone on purpose, so a line for it would be a sender and a subject
 * the person asked to have forgotten. The other six are each an answer somebody wants: `skipped` is the only place a
 * skip pattern that is too wide shows, and `matched` is what the ingest filed.
 */
export const INBOX_STATES = ['untriaged', 'review', 'skipped', 'matched', 'proposed', 'ignored'] as const;
export type InboxState = (typeof INBOX_STATES)[number];
/**
 * What waits on a person, and what the inbox shows when it is asked for nothing in particular.
 *
 * `proposed` WAITS TOO. A pattern that read a message and would not write it without asking holds it as `proposed`. The
 * sign `arrivals-filed` counted those while the inbox listed only the other two and filing refused them ("has already
 * left the inbox, as proposed"), so one whose question had gone read red every day with no screen that showed it and no
 * press that cleared it. Filing or archiving one closes the question about it (`settleAsked`).
 */
export const INBOX_WAITING: readonly InboxState[] = ['untriaged', 'review', 'proposed'];

/**
 * What filing, archiving or returning an arrival did: the arrival, the state it is in now, the row it became when it
 * was filed (or the row a return archived), and whether it was already so, in which case nothing was written.
 *
 * `untriaged` AND `review` ARE HERE FOR `returnArrival`, which puts an arrival back in the one of the two it left from.
 */
export type ArrivalSettled = { id: string; state: 'matched' | 'ignored' | 'untriaged' | 'review'; entry: Entry | null; already: boolean };

/**
 * A page's place in the rail, when its declaration gives one in the shape `{ section, order }`, and `tabs: true` when
 * the page draws its section as a strip of tabs. Only the literal `true` is carried: dropped here, a declared strip
 * installed clean and no host ever drew it.
 */
const navOf = (nav: unknown): { section: string; order: number; place?: number; tabs?: true } | null => {
  if (typeof nav !== 'object' || nav === null) return null;
  const { section, order, place, tabs } = nav as { section?: unknown; order?: unknown; place?: unknown; tabs?: unknown };
  return typeof section === 'string' && section !== ''
    ? { section, order: typeof order === 'number' ? order : 0, ...(typeof place === 'number' ? { place } : {}), ...(tabs === true ? { tabs: true as const } : {}) }
    : null;
};

/**
 * What only the kernel's own paths say about a write, and so is not on `WriteContext`, which a caller
 * fills in.
 *
 *   `decided`  the write carries out an accepted proposal: the one way a field or a move declared
 *              `by: 'decide'` changes. Governance's accept path sets it.
 *   `seal`     the keychain door. `depositGrant` binds the key's grant inside the write, once the run
 *              signing it is known, and points `field` at it. No patch names a secret field.
 *   `merge`    the write is one the record makes to fold a row into another or to undo that: `meet`'s strong
 *              rules, the merge's own carry, and `undoMerge`. With `decided`, the only way `merged_into` is set
 *              or cleared, or a folded row deleted or restored (the merge door, below).
 */
type Door = {
  decided?: boolean;
  merge?: boolean;
  /** The kernel's own instruction path (`instruction.ts`), the one writer of an instruction's delivery fields and state. */
  instructs?: boolean;
  seal?: { field: string; bind: (actor: string, held: string | null) => Result<GrantRow> };
  /** `WriteContext.within`, taken off the context at the door so the rules pass's own writes never carry it. */
  within?: Json;
  /** `WriteContext.via`, taken off the same way. */
  via?: { who: string; agent?: boolean };
};

/* ── the record ──────────────────────────────────────────────────────────── */

export type Kernel = ReturnType<typeof makeKernel>;

/** Who reads a question's facts (`queueQuestion`): whether they may read every list, which the record works out. */
export type QuestionReader = { everyList: boolean };

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
   * no Slash made every subsequent write for the life of the record ring the queue and buy a lease
   * pass that claimed nothing.
   */
  delivers?: readonly OutboxKind[] | undefined;
  /**
   * Whether this host answers an automation's question to Slash: it leases `infer.ask` jobs and runs the pass that
   * answers them (`@braindog/host/slash-answers`). Absent is no.
   *
   * THE HOST'S TO SAY, BECAUSE ONLY THE HOST KNOWS. Whether a model is configured and whether anything leases the job
   * are facts about the deployment, and a record that guessed would install a step whose question waits its day
   * unasked and fails. Off, install refuses `ask_slash` with `NOT_IN_THIS_BUILD` (`unserved`) and the runner fails a
   * run that reaches one before anything is queued.
   */
  answersSlash?: boolean | undefined;
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
  /**
   * `43 §4.5`'s `day`, read by `@braindog/extract`'s `parseDate`, when the caller wired it: the one
   * day a `map:` field holds under its declared `format`.
   *
   * THE EIGHTH VALUE ACROSS THIS SEAM, AND THE ONE `dates` DID NOT COVER. `dates` is the same grammar
   * answering a different question — every day in a slice of an email, so `nth:` has something to
   * count — and a `map:` entry reads one field of a JSON answer that is supposed to be a day. The
   * shapes say so: `string[]` against `string | null`, which is why one could not stand in for the
   * other and why the `map:` path stayed on the kernel's four formats after `dates` landed.
   *
   * THAT GAP HAD STOPPED BEING LOUD, which is what made it worth closing rather than noting. While
   * `declare` answered `NOT_IN_THIS_BUILD` for a format the grammar admits and the build could not
   * read, a `format: DD.MM.YYYY` never installed. That refusal was retired once `dates` was wired,
   * on the reasoning that a record now reaches the grammar — true of the text path and not of this
   * one — so from then until now such a declaration installed clean and read every date as `invalid`.
   *
   * Absent, the kernel's own four-format table, unchanged, so a kernel used bare behaves as it did.
   */
  day?: IngestDeps['day'];
  /**
   * The build this host runs, handed to the figures as `build` so the door's `behind` (`record.door`) can say a session
   * whose marks named another build is behind. The kernel cannot know its host's build. Absent, `behind` says nothing.
   */
  build?: string | null;
  /** A self-host started with --allow-shape: its import takes a shape copy. Absent is no. */
  allowShape?: boolean | undefined;
};

/**
 * What a replacing import throws to roll its clearing back when `importBrainl` refuses the file.
 *
 * `importBrainl` ANSWERS A REFUSAL, IT DOES NOT THROW ONE, and inside the replace's own transaction an answer commits
 * whatever ran before it. So the refusal is carried out by this one value and turned back into the answer outside.
 */
const REPLACE_REFUSED = new Error('the replacing import was refused, and what it cleared is rolled back');

/** The bytes `signingKey` asks the host's signer to sign, to learn its public half. Fixed, so no caller chooses them. */
const KEY_PROBE = new TextEncoder().encode('braindog: which key signs this record');

/**
 * The record id a file says it is: the `id` of its one `record` row, or `null` for a file that carries none.
 *
 * READ BY COLUMN NAME FROM THE FILE'S OWN HEADER LINE, as `importBrainl` reads every table, because a file from an older
 * build may carry fewer columns and a position fixed here would read the wrong one.
 */
function fileRecordId(lines: readonly string[]): string | null {
  const at = lines.findIndex((l) => l.startsWith('#table record '));
  if (at < 0) return null;
  const columns = (lines[at]!.slice('#table record '.length).split(' ')[0] ?? '').split(',');
  const row = lines.slice(at + 1).find((l) => l.trim() !== '');
  if (row === undefined || row.startsWith('#')) return null;
  try {
    const values: unknown = JSON.parse(row);
    const id = Array.isArray(values) ? values[columns.indexOf('id')] : undefined;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/**
 * One column of one table as a file carries it, a value per row, or `null` when the file has no header for that table.
 *
 * BY COLUMN NAME, FOR `fileRecordId`'s REASON. A line that is not a JSON array is skipped rather than refused, because
 * `checkBrainl` has already passed every line against the manifest and this only counts what is there.
 */
/** What a field id or a list id may be: the grammar `declare.ts` holds every installed one to. */
const SOUND_ID = /^(?!.*__)[a-z][a-z0-9_]{0,31}$/;
/** What a field a declaration names elsewhere may be: an id, or ids joined by dots. */
const SOUND_REF = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

/**
 * The first declaration in a file whose ids could not have been installed, as a sentence, or `null`.
 *
 * AN ID BECOMES SQL. A list's id, its title and each field's id are written into JSON paths and index names when the
 * record reads them, and an install refuses any that is not an id; a file's declarations arrived without that check,
 * so a handed-over file could carry a field id that was a piece of SQL, run on every later write. Only the ids are
 * read here, so an older file whose declarations a later build words differently still imports.
 */
function declarationFault(lines: readonly string[]): string | null {
  const kinds = fileColumn(lines, 'declaration', 'kind') ?? [];
  const bodies = fileColumn(lines, 'declaration', 'body') ?? [];
  const ids = fileColumn(lines, 'declaration', 'id') ?? [];
  for (let i = 0; i < bodies.length; i++) {
    const said = String(ids[i] ?? 'A declaration');
    let body: unknown;
    try {
      body = typeof bodies[i] === 'string' ? JSON.parse(bodies[i] as string) : bodies[i];
    } catch {
      return `${said} in this file is not JSON.`;
    }
    if (body === null || typeof body !== 'object') return `${said} in this file has no body.`;
    const b = body as Record<string, unknown>;
    if (kinds[i] === 'register') {
      if (typeof b.id !== 'string' || !SOUND_ID.test(b.id)) return `${said} in this file names its list with something that is not an id.`;
      if (b.title !== undefined && (typeof b.title !== 'string' || !SOUND_ID.test(b.title))) return `${said} in this file names its title with something that is not a field id.`;
      for (const f of Array.isArray(b.fields) ? b.fields : [])
        if (f === null || typeof f !== 'object' || typeof (f as { id?: unknown }).id !== 'string' || !SOUND_ID.test((f as { id: string }).id))
          return `${said} in this file has a field whose id is not one.`;
    }
    const walk = (v: unknown): string | null => {
      if (Array.isArray(v)) {
        for (const x of v) {
          const found = walk(x);
          if (found !== null) return found;
        }
        return null;
      }
      if (v === null || typeof v !== 'object') return null;
      for (const [k, x] of Object.entries(v)) {
        if (k === 'field' && typeof x === 'string' && !SOUND_REF.test(x)) return `${said} in this file names a field with something that is not a field id.`;
        const found = walk(x);
        if (found !== null) return found;
      }
      return null;
    };
    const found = walk(b);
    if (found !== null) return found;
  }
  return null;
}

function fileColumn(lines: readonly string[], table: string, column: string): unknown[] | null {
  const at = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  if (at < 0) return null;
  const index = (lines[at]!.slice(`#table ${table} `.length).split(' ')[0] ?? '').split(',').indexOf(column);
  const out: unknown[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    if (line.trim() === '') continue;
    try {
      const values: unknown = JSON.parse(line);
      if (Array.isArray(values)) out.push(index < 0 ? null : values[index]);
    } catch {
      continue;
    }
  }
  return out;
}

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

/* ── the nightly ledger row ──────────────────────────────────────────────── */

/**
 * money-core's `snapshots`, which the kernel knows by name the way `evalContext` knows `fx` by name.
 *
 * A REGISTER OF ROWS THE RECORD WRITES ITSELF was not something the declaration grammar could express:
 * `04 §5`'s eight kinds were then register, page, block, ingest, rule, metric, theme and digest, and none
 * of them scheduled a write into a register. Without one, the alternative to naming this register here
 * was the Ledger page drawing an empty table for ever, which is what it did.
 */
const NIGHT_REGISTER = 'snapshots';

/**
 * Which figure fills which field. The `net` field is the arithmetic over these three and is below.
 *
 * READ THROUGH THE FIGURES AND NOT OFF THE REGISTERS, deliberately. Every one of these three is a
 * question the record already owns and already answers on the Ledger page, and a second summation
 * here would be a second definition of "still owed" that nobody would notice had drifted until a
 * tile and a chart disagreed about the same night. `owed-by-you` was added for exactly this reason:
 * the payable book previously had only `overdue`, which is the late part of it, so anything filling
 * a snapshot had to add the register up itself.
 */
const NIGHT_FIGURES: Readonly<Record<string, string>> = {
  cash: 'cash-now',
  owed_to_me: 'owed-to-you',
  owed_by_me: 'owed-by-you',
};

/**
 * How late a reading may be taken and still be honest about the night it names.
 *
 * A MACHINE ASLEEP AT MIDNIGHT MISSES THE NIGHT, and that is the whole of the catch-up policy. The
 * other three figures could be backfilled — a predicate can be re-asked as of a past day — but
 * `cash` cannot: the record holds what is in the account NOW, and no history of a balance exists to
 * reconstruct one from. So a reading is a reading of the moment it is taken, and the only question
 * is how far that moment may be from the midnight it is stamped with.
 *
 * SIX HOURS, because nothing moves in those six. A personal ledger changes when its owner is awake
 * and when a bank posts, and the window from five past midnight to six in the morning has neither
 * in it. Past that the day that has begun has had a morning in it, and stamping that morning's
 * figures on last night is the one failure this whole design exists to avoid. The night is skipped,
 * the gap stands in the chart, and the next night is armed as usual.
 */
const NIGHT_LATEST_HOUR = 6;

/** A `money` value as a field holds one: minor units and one three-letter code. */
type NightAmount = { amount: number; currency: string };

const CURRENCY_CODE = /^[A-Z]{3}$/u;

/** The day before a calendar day, done on the date and never on a timestamp, so no zone can shift it. */
const dayBefore = (iso: string): string => new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

const NIGHT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A day as this product prints one: `2026-09-20` becomes `20 Sep 2026`.
 *
 * SPELLED HERE RATHER THAN IMPORTED, and the duplication is deliberate rather than lazy. The
 * register keeps the night twice on purpose — `on` is the ISO day the arithmetic sorts by, and
 * `what` is the title a person types into search, because indexing `on` made a search for what the
 * screen says find nothing. The other two spellings of this line live in `packages/render`, which
 * draws screens, and in `packages/seed`, which depends on this package: the kernel imports neither
 * and cannot, so a third copy is the price of the title being findable.
 */
function nightOf(iso: string): string {
  const [year, month, dayOfMonth] = iso.split('-');
  const name = /^\d{4}-\d{2}-\d{2}$/u.test(iso) ? NIGHT_MONTHS[Number(month) - 1] : undefined;
  return name === undefined || year === undefined || dayOfMonth === undefined ? iso : `${Number(dayOfMonth)} ${name} ${year}`;
}

/**
 * A stored manifest's `requires.packs`, each range a string, or `{}`.
 *
 * NOTHING THAT IS NOT TEXT IS PASSED ON AS A RANGE, because `plan` hands each one to `satisfies`, and `satisfies` once
 * called `.trim()` on a number a pack's `requires.packs` held (`declare`'s `normalise`). A manifest written by hand, or
 * by a build older than the one reading it, is not trusted to have been normalised.
 */
function requiresOf(manifest: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    return {};
  }
  const packs = (parsed as { requires?: { packs?: unknown } } | null)?.requires?.packs;
  if (packs === null || typeof packs !== 'object' || Array.isArray(packs)) return {};
  return Object.fromEntries(Object.entries(packs).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

export async function openRecord(sql: Sql, clock: Clock, opts: RecordOptions = {}): Promise<Kernel> {
  const { state } = await applyMigrations(sql, clock);
  /* MIGRATION 16'S OTHER HALF, the declaration bodies SQL cannot re-checksum. Before `makeKernel`, so the first reload
     already reads them renamed; never over a refused schema, whose tables this build cannot vouch for. */
  if (!state.refusal) await renameDeclarations(sql);
  if (!state.refusal) keepSplitIndexes(sql);
  return makeKernel(sql, clock, state, opts);
}

/**
 * THE INDEX THAT SAYS WHETHER A LIST HOLDS A SPLIT ROW, on each list that can (`split-view.ts`), for a record last opened
 * before there was one. One read when it is there, one index built once when it is not. It only speeds a read: one that
 * cannot be made is a read through the view, as it always was, so nothing here can stop a record opening.
 */
function keepSplitIndexes(sql: Sql): void {
  try {
    const lists = sql.all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND body LIKE '%parts\_of%' ESCAPE '\\'");
    if (lists.length === 0) return;
    const held = new Set(sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry'").map((r) => r.name));
    for (const { body } of lists) {
      const decl = JSON.parse(body) as { id?: unknown; fields?: { id: string; type: string; parts_of?: string; retired?: boolean }[] };
      if (typeof decl.id !== 'string' || !Array.isArray(decl.fields)) continue;
      const split = splitOfFields(decl.fields.filter((f) => f.retired !== true));
      const make = split === null ? null : splitIndex(decl.id, split.field);
      if (split !== null && make !== null && !held.has(splitIndexName(decl.id, split.field))) sql.exec(make);
    }
  } catch {
    /* Read through the view, as it always was. */
  }
}

/** Whether a statement only reads: a `SELECT`. Anything else is taken as a write. */
const reads = (text: string): boolean => /^\s*select\b/iu.test(text);

function makeKernel(raw: Sql, given: Clock, state: SchemaState, opts: RecordOptions) {
  /* WHAT ONE OUTERMOST TRANSACTION HOLDS (one snapshot), dropped by any write inside it: which lists hold rows private
     from a viewer, and a row's spoken name. `boot` and a briefing asked each again a question, a line and a row. */
  let moment: { hidden: Map<string, boolean>; names: Map<string, string>; drop: () => void } | null = null;
  const newMoment = () => {
    const m = { hidden: new Map<string, boolean>(), names: new Map<string, string>(), drop: () => void (m.hidden.clear(), m.names.clear()) };
    return m;
  };
  /* EVERY STATEMENT THAT IS NOT A SELECT DROPS WHAT ONE TRANSACTION HOLDS (`moment`), so a read kept for one snapshot is
     never answered across a write made inside it. */
  /* A ROLLBACK DROPS EVERY READING HELD ACROSS READS (`readingHeld`), since one read inside the write it took back read
     rows that never were. Set once the readings are. */
  let dropHeld = (): void => undefined;
  /* AND EVERY READ IS NOTED BY THE READINGS BEING READ NOW (`holdAcross`), which hold by the lists they read; a write
     made while one is read holds none of them. `muted` while their versions are themselves asked. */
  const traces: ReadTrace[] = [];
  /* AND BY THE SIGNS BEING READ NOW (`signsHeldNow`), which hold by every table they read (`held-signs.ts`). */
  const signTraces: SignTrace[] = [];
  /* AND BY THE DRAWS BEING WATCHED NOW (`drawsOf`), which keep what they read past the lists to ask it again. */
  const drawTraces: DrawTrace[] = [];
  let muted = 0;
  let knownList = (_word: string): boolean => false;
  /* WHETHER AN INSTANT IS A DAY'S EDGE, in the record's zone or in Greenwich, which a draw's read keeps where it is (`noticeDraw`). Set once the zone can be read. */
  let dayEdge = (_ms: number): boolean => false;
  const noted = (text: string, params: readonly Param[]): void => {
    if (muted > 0) return;
    for (const t of traces) notice(t, text, params, knownList);
    for (const t of signTraces) noticeSign(t, text, params, knownList);
    for (const t of drawTraces) noticeDraw(t, text, params, knownList, dayEdge);
  };
  /* EVERY WRITE IS COUNTED BY THE TABLE IT WRITES (`tablesWritten`), and one this cannot read moves every table: a sign
     held over a table is read again once the table has been written (`signsHeldNow`). Counted as it is sent, so a write
     taken back still counts, which only reads a sign again. One whose `RETURNING` answered no row changed none and is not
     counted (`wroteNothing`): the belt's claim of what is due runs every tick and mostly claims nothing. */
  const writes = new Map<string, number>();
  let writesAny = 0;
  const wrote = (text: string, returned?: number): void => {
    if (returned !== undefined && wroteNothing(text, returned)) return;
    const tables = tablesWritten(text);
    if (tables === null) writesAny++;
    else for (const t of tables) writes.set(t, (writes.get(t) ?? 0) + 1);
    if (tables === null || tables.length > 0) for (const t of signTraces) t.wrote = true;
  };
  /* WHETHER THE TRANSACTION OPEN NOW HAS WRITTEN (`transaction`): one that has only read reads what is committed, so what it
     reads may be held (`holdAcross`), as `boot`'s read of its one moment is. */
  let txWrote = false;
  const sql: Sql = {
    exec: (text, ...params) => {
      txWrote = true;
      moment?.drop();
      if (/^\s*ROLLBACK\b/iu.test(text)) dropHeld();
      for (const t of traces) t.whole = true;
      for (const t of drawTraces) t.whole = true;
      wrote(text);
      raw.exec(text, ...params);
    },
    all: <T = Row>(text: string, ...params: Param[]): T[] => {
      if (traces.length > 0 || signTraces.length > 0 || drawTraces.length > 0) noted(text, params);
      if (reads(text)) return raw.all<T>(text, ...params);
      txWrote = true;
      moment?.drop();
      const out = raw.all<T>(text, ...params);
      wrote(text, out.length);
      return out;
    },
    one: <T = Row>(text: string, ...params: Param[]): T | undefined => {
      if (traces.length > 0 || signTraces.length > 0 || drawTraces.length > 0) noted(text, params);
      if (reads(text)) return raw.one<T>(text, ...params);
      txWrote = true;
      moment?.drop();
      const out = raw.one<T>(text, ...params);
      wrote(text, out === undefined ? 0 : 1);
      return out;
    },
    transactionSync: (fn) => {
      try {
        return raw.transactionSync(fn);
      } catch (e) {
        dropHeld();
        throw e;
      }
    },
  };
  /* THE INSTANT `backdate` HOLDS, while a history is being written, and `null` the rest of the time. */
  let held: number | null = null;
  /* THE NEWEST INSTANT `backdate` HAS HELD, which no later one may go behind. */
  let latest = -Infinity;
  const clock: Clock = { now: () => held ?? given.now() };
  /* IDS ARE MINTED ON THE CLOCK THAT RUNS, so a backdated write still sorts after everything written before it. */
  const mint: Mint = ulids(() => given.now());
  /* Bound here because `export`'s own parameter is called `opts` too, and a signer read off the
     wrong one is a file that silently goes out unsigned. */
  const signer = opts.sign;
  /* A SHAPE COPY IS PUT BACK ONLY ON A HOST STARTED TO TAKE ONE (shape-guard-49, `checkBrainl`'s `IMPORT_SHAPE`). */
  const allowShape = opts.allowShape === true;
  let depth = 0;

  /** The active declarations, parsed once. Rebuilt when a declaration changes and never otherwise. */
  let registers = new Map<string, RegisterDecl>();
  /** Each spoken prefix other than `#`, to the register that speaks it. */
  let prefixes = new Map<string, string>();

  /**
   * THE DECLARATION REVISION AND WHAT HANGS OFF IT: the lists as the lens reads them, built once per
   * revision, and the lens cache, keyed on the revision so a list installed or a field retired is never answered from a
   * lens made before it. The cache holds 256 answers, the one used longest ago going first.
   */
  let revision = 0;
  let catalogMemo: Catalog | null = null;
  /** The lists the kernel declares itself (`pack_id` kernel), read once a declaration revision. */
  let kernelMemo: string[] | null = null;
  /** The lists declared `personal: true`, read once a declaration revision. */
  let personalMemo: string[] | null = null;
  const lensCache = new LensCache<Held | null>(256);

  function reload(opts: { copied?: true } = {}): void {
    const had = revision === 0 || opts.copied === true ? null : new Set(registers.keys());
    const before = had === null ? null : [...had].sort().join('\u0000');
    ({ registers, prefixes } = listsOf(
      sql.all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0"),
    ));
    revision++;
    catalogMemo = null;
    kernelMemo = null;
    personalMemo = null;
    lensCache.clear();
    /* THE SET OF LISTS IS PART OF WHO HOLDS WHAT: a list installed falls under somebody's whole-record share. So the epoch
       moves when it changes, as it does for a share, and an open tab re-boots onto the lists it now has. Never on the
       first read, which is the record opening and writes nothing, and never for a file read in (`copied`): an import
       or restore brings its own counter, and a copy that moved it would not export as the file it came from. */
    /* AND A LIST THAT FALLS UNDER SOMEBODY'S WHOLE-RECORD OR MONEY SHARE IS SAID IN THE LEDGER, one grant per share, in
       the same transaction (§2.15): the share widened without anybody touching it. */
    if (before !== null && before !== [...registers.keys()].sort().join('\u0000'))
      transaction(() => {
        bumpEpoch(sql);
        const added = [...registers.keys()].filter((id) => !had!.has(id));
        if (added.length > 0) newListGrants({ sql, at: instant(clock.now()), mint }, catalogNow(), added);
      });
  }

  /** The lists the kernel declares itself, by their declaration's pack and never by a name, for this declaration revision. */
  const kernelListsNow = (): readonly string[] =>
    (kernelMemo ??= sql
      .all<{ id: string }>("SELECT id FROM declaration WHERE kind = 'register' AND pack_id = 'kernel' AND superseded_at IS NULL AND retired = 0")
      .map((r) => r.id.slice('register.'.length)));

  /** The lists declared `personal: true`, the owner's alone, for this declaration revision. */
  const personalListsNow = (): readonly string[] => (personalMemo ??= [...registers.values()].filter((d) => d.personal === true).map((d) => d.id));

  /** The record's lists as the lens reads them (`lens.ts`'s `Catalog`), for this declaration revision. */
  const catalogNow = (): Catalog =>
    (catalogMemo ??= catalogOf(
      [...registers.values()].map((d) => ({ ...d, fields: withTags(d.fields) as unknown as ListLike['fields'] })),
      { keys: KEYCHAIN_LIST, people: meetsRole(registers.values())?.register ?? null, kernel: kernelListsNow() },
    ));

  /** What `access` needs to merge shares, for one call. */
  const accessLens = (): AccessLens => ({
    catalog: catalogNow,
    nowMs: clock.now(),
    tz: () => recordTz(),
    people: () => meetsRole(registers.values())?.register ?? null,
    revision,
    cache: lensCache,
  });

  /** The list cache `reload` keeps, built from register bodies: each list by its id, and each spoken prefix to its list. */
  function listsOf(rows: readonly { body: string }[]): { registers: Map<string, RegisterDecl>; prefixes: Map<string, string> } {
    const registers = new Map<string, RegisterDecl>();
    const prefixes = new Map<string, string>();
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
      /* A FIELD DECLARING `derive` IS WORKED OUT AT READ, so it carries the kernel's own flag from here: the write path
         refuses a write to it (IMMUTABLE_FIELD) and the validation sweep skips it, the two things `derived` already
         does, and nothing downstream needs to know the second spelling. */
      if (decl.fields.some((f) => f.derive !== undefined))
        decl.fields = decl.fields.map((f) => (f.derive !== undefined ? { ...f, derived: true } : f)) as typeof decl.fields;
      registers.set(decl.id, decl);
      if (decl.seq_prefix !== undefined && decl.seq_prefix !== '#') prefixes.set(decl.seq_prefix, decl.id);
    }
    return { registers, prefixes };
  }
  reload();

  /**
   * The record a lint is asking about when it is not the table: set only inside `againstPlan`, and `null` otherwise.
   *
   * THE INSTALL CHECKS READ THE RECORD IN TWO PLACES, the table and the list cache, and the arranger needs them to read a
   * record that is planned and not written. Asking the planned record `validate` alone, through
   * `declare`'s `stagedFault`, because nothing else would take one, let five arrangements the accept then refused be
   * filed (`test/lint-planned.test.ts`, `packages/record/test/arrange-kernel-lint.test.ts`). The checks read the record
   * through `heldRow` and `heldRows`, which answer from here when it is set, and the cache is swapped for the plan's.
   */
  let planned: PlannedRecord | null = null;

  /** A live declaration by id, as the table holds it or as the plan does. A plan's kind is its id's first word. */
  function heldRow(id: string): { kind: string; body: string; pack_id: string | null } | undefined {
    if (planned === null)
      return sql.one<{ kind: string; body: string; pack_id: string | null }>('SELECT kind, body, pack_id FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0', id) ?? undefined;
    const body = planned.known.get(id);
    return body === undefined ? undefined : { kind: id.slice(0, id.indexOf('.')), body: JSON.stringify(body), pack_id: planned.owners.get(id) ?? null };
  }

  /** Every live declaration of these kinds, by id, from the table or the plan. */
  function heldRows(kinds: readonly string[]): { id: string; kind: string; body: string; pack_id: string | null }[] {
    if (planned === null)
      return sql.all<{ id: string; kind: string; body: string; pack_id: string | null }>(
        `SELECT id, kind, body, pack_id FROM declaration WHERE superseded_at IS NULL AND retired = 0 AND kind IN (SELECT value FROM json_each(?)) ORDER BY id`,
        JSON.stringify(kinds),
      );
    return [...planned.known.keys()]
      .filter((id) => kinds.includes(id.slice(0, id.indexOf('.'))))
      .sort()
      .map((id) => ({ id, ...heldRow(id)! }));
  }

  /**
   * `fn` with the checks reading `plan` in place of the record, and the record put back after, whatever `fn` does.
   *
   * THE LIST CACHE IS SWAPPED AND NOT THREADED. `schemaOf`, `evalContext` and every check that reads a list's fields read
   * `registers`, and a parameter through each would have touched every reader of the cache, the write path's included,
   * to change what seven checks see. Everything under it is synchronous, so nothing else runs while the plan is in place.
   */
  function againstPlan<T>(plan: PlannedRecord | undefined, fn: () => T): T {
    if (plan === undefined) return fn();
    const was = { registers, prefixes, planned };
    ({ registers, prefixes } = listsOf(
      [...plan.known]
        .filter(([id, body]) => id.startsWith('register.') && typeof body.id === 'string')
        .map(([, body]) => ({ body: JSON.stringify(body) })),
    ));
    planned = plan;
    try {
      return fn();
    } finally {
      ({ registers, prefixes, planned } = was);
    }
  }

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
      txWrote = false;
      moment = newMoment();
      try {
        return fn();
      } finally {
        depth--;
        moment = null;
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

  /** Indexes `sortIndexOf` named that the record turned out not to hold: not asked for again. */
  const missingSortIndexes = new Set<string>();
  /**
   * The index a sorted list's first page can walk: its first key descending, a field that keeps one (`indexName`) and whose
   * sort key is the indexed expression itself, so no text (sorted without case), enum (by position) or money (by currency
   * first). Only under no filter, or the one that leaves out a finished state: a filter that narrows may have a better index,
   * and naming this one would walk the whole list past it. Ascending keeps empties last by a key no index holds.
   */
  const SORT_INDEX_FILTER = /^[( ]*(?:1 = 1|state IS NULL OR NOT \(state = \?\))[) ]*$/u;
  const SORT_INDEX_TYPES = new Set(['day', 'datetime', 'int', 'number']);
  function sortIndexOf(register: string, first: { field: string; dir?: string } | undefined, filter: string): string | null {
    if (first === undefined || first.dir === 'asc' || !SORT_INDEX_FILTER.test(filter)) return null;
    const field = registers.get(register)?.fields.find((f) => f.id === first.field);
    if (field === undefined || field.retired || (field as { index?: unknown }).index !== true || !SORT_INDEX_TYPES.has(field.type)) return null;
    const name = indexName('i', register, field.id);
    return /^[A-Za-z0-9_]+$/u.test(name) && !missingSortIndexes.has(name) ? name : null;
  }

  /** A live row of one list by its id, the read naming the list, as a walk over that list asks (`ForecastDeps.hydrate`). */
  function rowIn(id: string, register: string): Entry | null {
    const row = sql.one<Record<string, unknown>>(`SELECT ${COLUMNS} FROM entry WHERE register = ? AND id = ?`, register, id);
    if (!row) return null;
    const entry = hydrate(row);
    return entry.deleted_at ? null : entry;
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

  /** A sentence with the spoken ids in it said as the rows' names; one nothing answers to stays as written. */
  const nameSpoken = (text: string): string => nameSpokenIn(text, titleOfRow);

  /**
   * Who a mail address is, for a mail that missed them (`mailMissed`): the person holding it, by their id and name, or
   * a hash of the address where nobody does. The address itself is never the key.
   */
  function mailedKey(address: string): { key: string; name: string | null } {
    const who = sql.one<{ id: string; name: string | null }>(
      'SELECT id, name FROM person WHERE lower(email) = lower(?) ORDER BY suspended_at IS NOT NULL, id LIMIT 1',
      address.trim(),
    );
    return who ? { key: who.id, name: who.name } : { key: addressKey(address), name: null };
  }

  /** What a keychain label's live entry says it opens, for a script's line to name beside the key (`scriptEgress`). */
  function opensOf(label: string): string | null {
    return opensNamed(sql, label);
  }

  /** The lists that hold keys, each with the field that keeps a key to its projects (`keyScopeOf`'s holders). */
  const keyHolders = (): Map<string, string> =>
    new Map(
      [...registers.values()]
        .filter((r) => r.fields.some((f) => f.type === 'secret' && !f.retired))
        .flatMap((r) => {
          const f = scopeFieldOf(r.fields);
          return f ? [[r.id, f.id] as [string, string]] : [];
        }),
    );

  /** The projects a keychain label's key is kept to, read for an action's line (`egressOf`) and its refusal (`keyOutOfScope`). */
  function keyScope(label: string): readonly string[] | null | undefined {
    return keyScopeOf(sql, label, keyHolders());
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
    /* WHAT THE LOG SAYS FIRST, of every live example: whether it arrived as one and has only been linked since. */
    const live: { id: string; clean: boolean }[] = [];
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
      live.push({ id, clean: arrived && onlyLinked });
    }
    /* ASKED LAST, ONLY OF THE ROWS THE LOG HAS NOT ALREADY CALLED TOUCHED, AND IN ONE PASS FOR ALL OF THEM: which of
       them a live row that is not an example names. It was one look through every row of the record for each of them
       (about 40 ms at 20,000 rows on the first boot after a write). Rows planted together were minted together, so
       their ids open with the same few letters: the record is looked through once for those openings, in SQLite, and
       only a row that holds one is read here. Every run of id letters in it is slid over 26 at a time, so an id is
       found wherever `instr` found it: alone, in a handle, in a list, or inside a longer word. An id of any other shape
       is looked for as it is. Examples minted at many times have too many openings to ask for, and every live row is
       read then. The pass stops once every one of them is named. */
    const asked = live.filter((one) => one.clean).map((one) => one.id);
    const shaped = new Set(asked.filter((id) => /^[0-9A-Z]{26}$/u.test(id)));
    const odd = asked.filter((id) => !shaped.has(id));
    const openings = [...new Set(asked.map((id) => id.slice(0, 6)))];
    const holds = openings.length <= 4 ? ` AND (${openings.map(() => 'instr(fields, ?) > 0').join(' OR ')})` : '';
    const named = new Set<string>();
    const PAGE = 500;
    for (let after = 0, more = asked.length > 0; more && named.size < asked.length; ) {
      const page = sql.all<{ at: number; id: string; fields: string | null }>(
        `SELECT rowid AS at, id, fields FROM entry WHERE deleted_at IS NULL AND rowid > ?${holds} ORDER BY rowid LIMIT ?`,
        after,
        ...(holds === '' ? [] : openings),
        PAGE,
      );
      for (const { id, fields } of page) {
        if (examples.has(id) || typeof fields !== 'string') continue;
        if (shaped.size > 0)
          for (const [run] of fields.matchAll(/[0-9A-Z]{26,}/gu))
            for (let at = 0; at + 26 <= run.length; at++) {
              const found = run.slice(at, at + 26);
              if (shaped.has(found)) named.add(found);
            }
        for (const other of odd) if (fields.includes(other)) named.add(other);
      }
      more = page.length === PAGE;
      after = page.at(-1)?.at ?? after;
    }
    const untouched: Entry[] = [];
    let touched = 0;
    for (const { id, clean } of live) {
      const row = clean && !named.has(id) ? byId(id) : null;
      if (row) untouched.push(row);
      else touched++;
    }
    return { untouched, touched };
  }

  /** A row as a person says it, `S42` or `things#3`, or its id when the row is gone. */
  function nameOf(id: string): string {
    /* HELD ONLY AGAINST THE LISTS AS INSTALLED: a plan swaps `registers` (`againstPlan`), and a prefix may differ there. */
    const names = planned === null ? moment?.names : undefined;
    const was = names?.get(id);
    if (was !== undefined) return was;
    const row = byId(id, true);
    const prefix = row ? registers.get(row.register)?.seq_prefix : undefined;
    const name = !row || row.seq === null ? id : prefix && prefix !== '#' ? `${prefix}${row.seq}` : `${row.register}#${row.seq}`;
    names?.set(id, name);
    return name;
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

  /* A ROW ITS MAKER KEPT PRIVATE (migration 40) IS LEFT OUT OF EVERY READ HANDED THE VIEWER, for anybody but that maker.
     No viewer is a read of the whole record (a rule, an import, the system), which is how every reader behaved before. */
  /* `scope` BELOW IS THE ONE READ-SCOPE HELPER; the private clause is part of the rule it hands `list` and `count` (`ruleOf`). */

  /** Whether any row (of one list, when named) is private to somebody other than the viewer, which is when a scope has anything to leave out. */
  const anyHiddenFrom = (viewer: string | undefined, register?: string): boolean => {
    if (viewer === undefined) return false;
    const key = `${viewer}\n${register ?? ''}`;
    const was = moment?.hidden.get(key);
    if (was !== undefined) return was;
    const now =
      (register === undefined
        ? sql.one('SELECT 1 AS y FROM entry_private WHERE person_id <> ? LIMIT 1', viewer)
        : /* FROM THE ROWS KEPT PRIVATE, WHICH ARE FEW (`CROSS JOIN` holds the order). Left to choose, SQLite walked the whole
             list by its index asking each row whether it was kept: 1.5 ms on 20,000 rows, on every read of every list. */
          sql.one('SELECT 1 AS y FROM entry_private p CROSS JOIN entry e ON e.id = p.entry_id WHERE p.person_id <> ? AND e.register = ? LIMIT 1', viewer, register)) !== undefined;
    moment?.hidden.set(key, now);
    return now;
  };

  /**
   * THE ONE READ-SCOPE HELPER every reader asks for a list, in place of `whereFor(ctx.wheres, register)`: the caller's
   * grant rule and the private rows left out for them, as one value `list` and `count` understand (`scopeFor`).
   */
  const scope = (ctx: { wheres?: Readonly<Wheres> | undefined; principal: { kind: string; id: string; person?: string }; outbound?: boolean | undefined; preview?: string | undefined }, register: string): Json | undefined => {
    const viewer = viewerOfRead(ctx);
    return scopeFor(ctx.wheres, register, viewer, anyHiddenFrom(viewer, register));
  };

  /**
   * The rows of a list this caller may change, as `WriteContext.within` takes them: a share's
   * narrower write predicate (`ctx.writes`) where the lens gave one, which already holds read inside it, else the read
   * scope. The private rows left out for the viewer stay out either way.
   */
  const writeScope = (ctx: Parameters<typeof scope>[0] & { writes?: Readonly<Wheres> | undefined }, register: string): Json | undefined => {
    if (ctx.writes === undefined || !Object.hasOwn(ctx.writes, register)) return scope(ctx, register);
    const viewer = viewerOfRead(ctx);
    return scopeFor({ [register]: ctx.writes[register]! }, register, viewer, anyHiddenFrom(viewer, register));
  };

  /**
   * The clause a row of one list meets to be admitted under a grant (`wheres`) for a viewer, or `null` when every row is:
   * `scope`'s rule compiled once, so a reader that writes its own SQL (`inScope`, `backlinks`, a search's count) leaves
   * out what `list` leaves out. A rule that cannot be read admits nothing, as `narrowed` holds it for `list`.
   * Its bare column names resolve to the innermost `entry` of the statement it is put in.
   */
  const admitClause = (register: string, grant: Readonly<Wheres> | undefined, viewer: string | undefined): { sql: string; params: (string | number)[] } | null => {
    const rule = scopeFor(grant, register, viewer, anyHiddenFrom(viewer, register));
    return rule === undefined ? null : scopeClause(register, rule);
  };

  /**
   * ONE COMPILE OF A SCOPE, for reads and writes alike: the clause a row of one list meets to be inside `rule` (a read
   * scope, or `WriteContext.within`). `admitClause` and `admits` both ask it, so what a reader is shown and what a writer
   * may write are the same SQL. A rule that cannot be read, or a list that is not there, admits no row.
   */
  const scopeClause = (register: string, rule: Json): { sql: string; params: (string | number)[] } => {
    if (!registers.has(register)) return { sql: '0', params: [] };
    const c = ruleCompiled(register, rule);
    return c.bad.length ? { sql: '0', params: [] } : { sql: c.sql, params: c.params as (string | number)[] };
  };

  /**
   * A GRANT'S RULE COMPILED ONCE AND KEPT ("compiled conditions are cached"): by the declaration
   * revision, the record's version, the minute, the list and the rule's own text, `RULES_KEPT` of them, the one used
   * longest ago going first. Every read a narrowed caller makes compiles their rule for each list it touches, and a
   * rule written as a sentence looks its names up as it compiles; a page of reads between two writes asks it once.
   *
   * THE VERSION IS IN THE KEY because a sentence's names are read from rows (`thing is Kiln`), and the minute because a
   * relative day (`-30d`) is read from the clock; the revision, because a field retired changes what compiles. Asking
   * the version is one `MAX(rowid)`, which SQLite answers from the end of the index. Always against the list's whole
   * schema, as a read with no hop compiles it (`readerSchemaOf`).
   */
  /**
   * `register = '<id>'`, THE LIST'S ID WRITTEN INTO THE STATEMENT. A field declared `index: true`
   * is indexed only on its own list's live rows (`entry_i_<list>__<field> … WHERE register = '<list>'`), and SQLite uses
   * such a partial index only where it can see the statement holds that list, which a bound `?` does not show it. So a
   * read held to one project by a grant on an indexed field walked every live row of the list. An id is the grammar's
   * (`^[a-z][a-z0-9_]{0,31}$`), checked here before it is written in; anything else is bound as before.
   */
  const LIST_ID = /^[a-z][a-z0-9_]{0,31}$/u;
  const onList = (register: string): { sql: string; params: string[] } =>
    LIST_ID.test(register) ? { sql: `register = '${register}'`, params: [] } : { sql: 'register = ?', params: [register] };

  const RULES_KEPT = 512;
  const rulesKept = new Map<string, Compiled>();
  const ruleCompiled = (register: string, rule: Json): Compiled => {
    const key = [revision, version(), Math.floor(clock.now() / 60_000), register, JSON.stringify(rule)].join('\u0000');
    const hit = rulesKept.get(key);
    if (hit !== undefined) {
      rulesKept.delete(key);
      rulesKept.set(key, hit);
      return hit;
    }
    const c = ruleOf(rule, readerSchemaOf()(register) ?? schemaOf(register), evalContext());
    rulesKept.set(key, c);
    while (rulesKept.size > RULES_KEPT) rulesKept.delete(rulesKept.keys().next().value as string);
    return c;
  };

  /** How many ids `admittedIds` asks about in one statement: the walk's own batch. */
  const ADMIT_BATCH = 500;

  /**
   * Which of these rows of one list a grant admits for a viewer: one statement per 500 ids,
   * in place of one `list` per row. A deleted row is still admitted when its rule admits it, as `get` with
   * `includeDeleted` reads it; an id that is not a row of the list is never admitted.
   */
  const admittedIds = (register: string, ids: readonly string[], grant: Readonly<Wheres> | undefined, viewer: string | undefined): Set<string> => {
    const out = new Set<string>();
    if (ids.length === 0) return out;
    const c = admitClause(register, grant, viewer);
    for (let at = 0; at < ids.length; at += ADMIT_BATCH) {
      const some = JSON.stringify(ids.slice(at, at + ADMIT_BATCH));
      const rows = sql.all<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND id IN (SELECT value FROM json_each(?))${c === null ? '' : ` AND (${c.sql})`}`,
        register,
        some,
        ...(c === null ? [] : c.params),
      );
      for (const r of rows) out.add(r.id);
    }
    return out;
  };

  /** Which of these rows are private, by id, so a list can mark them: a lock beside a row its viewer kept to themselves. */
  const privateAmong = (ids: readonly string[]): Set<string> =>
    ids.length === 0 ? new Set() : new Set(sql.all<{ entry_id: string }>('SELECT entry_id FROM entry_private WHERE entry_id IN (SELECT value FROM json_each(?))', JSON.stringify(ids)).map((r) => r.entry_id));

  /** Whether a row is private to somebody other than the viewer: then it is theirs alone and reads as absent. */
  const hiddenFrom = (id: string, viewer: string | undefined): boolean =>
    viewer !== undefined && sql.one('SELECT 1 AS y FROM entry_private WHERE entry_id = ? AND person_id <> ?', id, viewer) !== undefined;

  /**
   * Whether one row of a list is inside a scope (`scope`, `WriteContext.within`), deleted or not: the clause `list` and
   * `count` run, asked of one id. A scope that cannot be read admits no row, as it reads none, and `null` is a writer
   * who may write no row already there (one who adds to a list she cannot read).
   */
  const admits = (register: string, within: Json, id: string): boolean => {
    if (within === null) return false;
    const c = scopeClause(register, within);
    return sql.one(`SELECT 1 AS y FROM entry WHERE id = ? AND register = ? AND (${c.sql})`, id, register, ...c.params) !== undefined;
  };

  /**
   * WHICH SHARES ADMIT ONE ROW FOR ONE CAPABILITY (`via`): of the live allows a person holds, their
   * own and their groups', the ones whose part of the lens reaches the row, asked by `admits`, one SELECT per covering
   * share and none for a share that reaches the whole list. `id` null asks of the list. An agent carries no allow its
   * person switched agents off for. A role or a member row admits rows too, and is no share: `[]` says so.
   */
  const shareVia = (person: string, register: string, id: string | null, cap: LensCapOf, agent = false): string[] => {
    const held = heldSharesOf(sql, person);
    if (held === null || held.length === 0) return [];
    const l = catalogNow().lists.find((x) => x.id === register);
    if (l === undefined) return [];
    const now = clock.now();
    const tz = recordTz();
    const live = held.filter((s) => s.effect === 'allow' && activeAt(s, now, tz) && (!agent || s.caps?.agents !== false));
    const me = saysMe(live) ? meOf(sql, person, meetsRole(registers.values())?.register ?? null) : [];
    const out: string[] = [];
    for (const s of live) {
      const p = shareReach(s, l, cap, me);
      if (p === false) continue;
      if (id === null || p === true || admits(register, p as Json, id)) out.push(s.id);
    }
    return out.sort();
  };

  /**
   * The audit's line for one write by somebody who is not an owner (§2.10): its batch, who, and which shares' write
   * predicate admits the row it leaves. IN THE WRITE'S TRANSACTION, and once a batch: a replay, or a second write the
   * same batch carries, adds nothing.
   */
  const accessVia = (register: string, row: Entry, by: { who: string; agent?: boolean }): void => {
    const batch = row.batch;
    if (batch === undefined || batch === '' || row.replayed === true) return;
    const via = shareVia(by.who, register, row.id, 'write', by.agent === true);
    sql.exec('INSERT OR IGNORE INTO access_via (batch, who, via, at) VALUES (?, ?, ?, ?)', batch, by.who, JSON.stringify(via), instant(clock.now()));
  };

  /** The name of the person who owns this record, as a refusal tells somebody to ask them, or `null` when it has none. */
  const ownerName = (): string | null => {
    const name = sql.one<{ name: string | null }>(
      `SELECT p.name FROM member m JOIN person p ON p.id = m.person_id
        WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL ORDER BY m.person_id LIMIT 1`,
    )?.name;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
  };
  /** "Ask Mara." with the owner's name, else "Ask the owner." */
  const askOwner = (): string => `Ask ${ownerName() ?? 'the owner'}.`;

  /**
   * The fields of a list a rule names (`row_where`, a share's condition), so a write can tell which fields decide who
   * sees a row (gate fields). A rule that cannot be read names none.
   */
  const ruleFields = (register: string, rule: Json): string[] => {
    if (!registers.has(register)) return [];
    const said = predicateOf(rule as Predicate | string, schemaOf(register), evalContext());
    const out = new Set<string>();
    const walk = (n: unknown): void => {
      if (n === null || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const o = n as Record<string, unknown>;
      if (typeof o.field === 'string') out.add(o.field.split('.')[0]!);
      if (typeof o.via === 'string') out.add(o.via.split('.')[0]!);
      for (const k of ['all', 'any', 'none']) if (Array.isArray(o[k])) walk(o[k]);
    };
    walk(said.predicate);
    return [...out];
  };

  /**
   * Keep a row to its maker, or give it back to the record. Only the person who made it may (`madeByIn`), because a
   * private row an admin could unmark would be a promise nobody could keep. Signed as a note, so history says who did it.
   */
  function setPrivate(actor: string, ref: string, on: boolean): Result<{ id: string; private: boolean }> {
    const row = get(ref);
    if (!row) return no('REF_UNKNOWN', `There is no row called ${ref}.`, { at: 'ref' });
    if (madeByIn(sql, row.id) !== actor)
      return no('FORBIDDEN', 'Only the person who made a row can keep it private or share it again.', { at: 'ref' });
    return transaction(() => {
      if (on) sql.exec('INSERT OR REPLACE INTO entry_private (entry_id, person_id) VALUES (?, ?)', row.id, actor);
      else sql.exec('DELETE FROM entry_private WHERE entry_id = ?', row.id);
      /* THE LINE IS ABOUT THE ROW, `entry:<id>` (leak matrix N1). Written with no target it went to every whole-record
         reader, so everybody's log, catch-up and version poll learnt that a private row was made, and its number. On the
         row, it is shown to whoever is shown the row: its maker while it is private, everybody it reaches once shared.
         `field` says it is this line, so a poll that trusts plain row writes (`versionFor`) does not trust it. */
      slashMayWrite(actor, 'note');
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, note) VALUES (?, ?, ?, 'note', ?, 'entry', ?, ?)",
        mint(),
        instant(clock.now()),
        actor,
        `entry:${row.id}`,
        PRIVATE_NOTE,
        `${on ? 'Kept private' : 'Shared again'}: ${row.register}#${row.seq ?? row.id}`,
      );
      return ok({ id: row.id, private: on });
    });
  }

  /* `grant` IS THE CALLER'S RULE ON THIS LIST (`whereFor(ctx.wheres, register)`), so a narrowed member counts only the
     rows they reach; one that cannot be read counts none (`narrowed` in `members.ts`). Absent, every live row. */
  const count = (register: string, grant?: Json): number => {
    const c = narrowed({ sql: '(1)', params: [], bad: [] }, grant === undefined ? null : ruleCompiled(register, grant));
    const on = onList(register);
    return Number(
      sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${on.sql} AND deleted_at IS NULL AND (${c.sql})`, ...on.params, ...c.params)?.n ?? 0,
    );
  };

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
   *
   * WITH ONE ADDITION, `tags` (`withTags`), which is not a column: it sits in `fields` as any declared
   * `list<text>` does, so the compiler and the evaluator already read it the one way, and it is here
   * rather than in `where` because this is the only place that knows whether the list declared its own.
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
      (registers.has(register) ? withTags(registers.get(register)!.fields) : [])
        .filter((f) => !f.retired)
        /* THE LABEL TRAVELS WITH THE FIELD, because a page prints its own `where:` back to the
           reader using it: `direction is owed_to_me` is shown as `which way is owed to me`. Without
           it here, that sentence fed back to the record was `FIELD_UNKNOWN`, and seven of the eleven
           filters the shipped pages print could not be read by the record printing them. */
        .map((f) => [
          f.id,
          {
            type: f.type,
            /* AND THE ELEMENT TYPE OF A LIST, because `list` is not a type on its own. `where`'s
               `has` and `lacks` carry one element, and without this every list looked like a
               `list<text>` to them: `projects has Kiln` searched a column of row ids for a title. */
            ...(f.of ? { of: f.of } : {}),
            ...(f.values ? { values: f.values } : {}),
            ...(f.to ? { to: f.to } : {}),
            ...(f.label ? { label: f.label } : {}),
            /* AND AN ENUM'S VALUE LABELS, so `direction is money in` reads as the screen says it. */
            ...(f.labels ? { labels: f.labels } : {}),
            /* AND WHETHER A DAY IS A DEADLINE, which decides whether a window read as of a past day
               may count rows dated after it. `isDeadline` in `metrics.ts` reads it, and until this
               line sent it no read through the record ever reached it: over bills due
               2 days before and 3 and 12 after the as-of day, `due after -7d` backfilled 50,000
               where the live read on that day was 350,000 (`test/metrics-asof-forward.test.ts`). */
            ...(f.deadline === true ? { deadline: true } : {}),
            /* AND WHETHER IT IS WORKED OUT AT READ, which `where` refuses a filter or a sort over: nothing is stored
               under it to compare (`derivedFault`). */
            ...(f.derived === true ? { derived: true } : {}),
            /* AND THE LINK IT IS READ THROUGH, when it is read through one, so a filter over it is asked of the linked row
               (`through` in `where`) and a figure over the Ledger can leave out what a category says is no spending. */
            ...(f.derived === true && throughOf(f.derive) ? { through: throughOf(f.derive)! } : {}),
            /* AND WHERE A ROW'S PARTS ARE, so a figure that adds up their money reads a split row as its parts (`row-parts.ts`). */
            ...(typeof (f as { parts_of?: unknown }).parts_of === 'string' ? { parts_of: (f as { parts_of: string }).parts_of } : {}),
          },
        ]),
    ),
  });

  /**
   * A LIST AS A FIGURE OR A READ MAY HOP FROM IT (`pointed`, where-hop-49, hop-figures-50): `schemaOf` with a way into
   * the lists it points at. `reads` holds a hop to the lists the reader may read whole: a list it may not open, or
   * sees narrowed, answers `undefined`, which `where` refuses in the words of a list that is not there, so the hop
   * says nothing of what it holds. NOT ON THE SHARED `schemaOf`, which rules and the record's other reads compile
   * against: a rule is evaluated in memory, where a hop always answers false, so it is refused at install instead.
   */
  const hopSchemaOf = (register: string, reads?: (register: string) => boolean): Schema | undefined =>
    registers.has(register) && (reads?.(register) ?? true) ? { ...schemaOf(register), schemaOf: (r: string) => hopSchemaOf(r, reads) } : undefined;
  /** The list a reader asked about, whole, with its hops held to what `reads` lets through. */
  const readerSchemaOf =
    (reads?: (register: string) => boolean) =>
    (register: string): Schema | null =>
      registers.has(register) ? { ...schemaOf(register), schemaOf: (r: string) => hopSchemaOf(r, reads) } : null;

  /**
   * THE FAR SIDE OF A `via`, held to what the reader may open: the linked rows of one list by id, and the one
   * field read on each. ONE QUERY A CALL, and `withDerived` calls it once per `via` field per page, so fifty rows
   * through one link are one lookup. `reads` is the read path's own sight, the lists the caller reads whole (`hops`,
   * or `reads` without it): a list outside it, or one she sees narrowed, answers nothing, so every link into it derives
   * null rather than a value from a row she cannot open. A deleted row is gone, and derives null too. Absent is the
   * record's own sight, every live row.
   */
  const sightOf =
    (reads?: (register: string) => boolean): DeriveResolve =>
    (register, ids, field) => {
      if (ids.length === 0 || (reads !== undefined && !reads(register))) return new Map();
      /* THE IDS AS ONE JSON ARRAY, read with `json_each`, because a Durable Object refuses a statement past a hundred
         bound values and a page is up to five hundred rows (`param-sweep.test.ts`). */
      const found = sql.all<{ id: string; fields: string }>(
        'SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))',
        register,
        JSON.stringify(ids),
      );
      return new Map(found.map((r) => [r.id, ((JSON.parse(r.fields) as Record<string, Json>)[field] ?? null) as Json]));
    };

  /**
   * One row as it leaves the kernel, with the fields its list works out at read filled (`derive-rows.ts`). Only at the
   * doors out (`get` as the record hands it, a page of `list`), never inside the write path, which reads a row to
   * change it and must see what is stored. A list with no derived field hands the row back as it is.
   */
  const readOut = (entry: Entry | null, reads?: (register: string) => boolean): Entry | null => {
    const decl = entry === null ? undefined : registers.get(entry.register);
    if (entry === null || decl === undefined || !decl.fields.some((f) => f.derived === true && f.derive !== undefined)) return entry;
    return withDerived([entry], decl.fields, sightOf(reads))[0]!;
  };

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
        arm('pull', bare, { ingest: bare }, firstSlotMs(body, tz, clock.now()));
      /* A `call` OR A `poll` IS ARMED THE SAME WAY AND FROM THE SAME MOMENT, for the same reason: the first run
         is the one that says the key and the address are right. */
      if (decl.kind === 'ingest' && (body.channel === 'call' || body.channel === 'poll') && typeof body.every === 'string')
        arm(body.channel as 'call' | 'poll', bare, { ingest: bare }, firstSlotMs(body, tz, clock.now()));
      /* A CALL ONLY A RULE RUNS HAS NO CLOCK, and it still gets its row: the row is what pausing, resuming and the list
         read. Its one scheduled turn finds nothing to send and marks it done. */
      else if (decl.kind === 'ingest' && body.channel === 'call' && body.trigger === 'rule')
        arm('call', bare, { ingest: bare }, clock.now());
      /* A SCRIPT IS ARMED ON ITS OWN CLOCK (`script.ts`). One only a door or a rule starts still gets its row, which
         pausing and the list read, and its one turn ends it. */
      if (decl.kind === 'script') {
        const { every, at } = clockOfScript(body);
        const due = firstDueMs(recordIdentity(sql)?.id ?? 'self', bare, every, clock.now(), { at, tz });
        /* THE ROW KEEPS THE CLOCK IT WAS ARMED FROM, and a pending row whose clock was changed is armed again from the new
           one, as a rule's clock is below: `arm` moves only a row that is done or failed, so a script moved from "every
           day" to "every day at 09:00" would otherwise have run once more at the old hour before it learned the new one.
           A row armed before it kept a clock is moved only when a time of day is now named, so no unpinned script's
           spread is reset by this build. */
        const said = jcs({ every, at } as unknown as Json);
        const held = sql.one<{ state: string; payload: string }>("SELECT state, payload FROM schedule WHERE kind = 'script' AND key = ?", bare);
        if (held?.state === 'pending') {
          let kept: unknown;
          try {
            kept = (JSON.parse(held.payload) as { clock?: unknown }).clock;
          } catch {
            kept = undefined;
          }
          if (typeof kept === 'string' ? kept !== said : at !== null)
            sql.exec(
              "UPDATE schedule SET due_at = ?, payload = ?, attempts = 0 WHERE kind = 'script' AND key = ? AND state = 'pending'",
              instant(due),
              JSON.stringify({ script: bare, clock: said }),
              bare,
            );
        } else arm('script', bare, { script: bare, clock: said }, due);
        /* A REINSTALL UNPAUSES A SCRIPT, and `arm` only moves a row that is `done` or `failed` (the comment
           above), so a script paused for refusing too many times in a row stayed paused after the fix that was
           supposed to end that streak was installed. `pauseAfterRefusals` counts only the installed version's
           refusals, so a new version starts that streak again and the row is due at once. */
        sql.exec(
          "UPDATE schedule SET state = 'pending', due_at = ?, attempts = 0 WHERE kind = 'script' AND key = ? AND state = 'paused'",
          instant(clock.now()),
          bare,
        );
      }

      /* AN AUTOMATION ON A CLOCK IS ARMED AS A CONNECTOR IS, and one interval out rather than now: a connector's first
         fetch proves its key, and an automation's first run proves nothing a person asked for at the moment of
         install. It is a `rule` row keyed `flow.every:<id>`, which `0011_automation_run.ts` says the reason for. */
      /* AND A CLOCK EDITED WHILE ITS TURN IS PENDING IS ARMED AGAIN, from the new clock. `arm` moves only a row that is
         done or failed, for the reason above, so a rule edited from day 1 to day 15 fired once more on the 1st. The row
         keeps the clock it was armed from (`clock`, `late:` left out, since how late a turn may be taken moves no
         turn), and a pending row whose clock differs is re-armed. A row armed before it kept one is re-armed where its
         turn is not a turn of the clock as it now stands, which a clock with a time of day can say and a bare length
         cannot; either way it learns its clock. */
      if (decl.kind === 'rule' && pathOf(body as FlowDecl) === 'run' && triggerOf(body as FlowDecl) === 'every') {
        const at = firstDue(body as FlowDecl, clock.now(), tz);
        const on = (body.on ?? {}) as Record<string, unknown>;
        const said = jcs({ every: on.every ?? null, at: on.at ?? null, day: on.day ?? null, month: on.month ?? null } as unknown as Json);
        const key = clockKey(bare);
        const held = sql.one<{ state: string; payload: string; due_at: string }>("SELECT state, payload, due_at FROM schedule WHERE kind = 'rule' AND key = ?", key);
        if (at !== null && held?.state === 'pending') {
          let kept: unknown;
          try {
            kept = (JSON.parse(held.payload) as { clock?: unknown }).clock;
          } catch {
            kept = undefined;
          }
          const due = Date.parse(held.due_at);
          const moved =
            typeof kept === 'string' ? kept !== said : typeof on.at === 'string' && Number.isFinite(due) && firstDue(body as FlowDecl, due - 1, tz) !== due;
          if (moved)
            sql.exec(
              "UPDATE schedule SET due_at = ?, payload = ?, attempts = 0 WHERE kind = 'rule' AND key = ? AND state = 'pending'",
              instant(at),
              JSON.stringify({ every: bare, clock: said }),
              key,
            );
          else if (typeof kept !== 'string')
            sql.exec("UPDATE schedule SET payload = ? WHERE kind = 'rule' AND key = ? AND state = 'pending'", JSON.stringify({ every: bare, clock: said }), key);
        } else if (at !== null) arm('rule', key, { every: bare, clock: said }, at);
      }

      /* A METRIC WITH `snapshot:`, OR A DECLARED SIGN (`vital: true`), REMEMBERS ITS OWN READINGS. Five past midnight, so the day it is
         about is finished and nothing else is competing for the alarm. */
      if (decl.kind === 'metric' && (body.snapshot || body.vital === true)) {
        const at = nextOccurrence({ at: '00:05' }, clock.now(), tz);
        if (at !== null) arm('snapshot', bare, { metric: typeof body.metric === 'string' ? body.metric : bare }, at);
      }

      /**
       * AND THE LEDGER'S OWN NIGHT, WHICH NOTHING ARMED AND NOTHING WROTE.
       *
       * `register.snapshots` shipped in money-core 1.2.0 and the Ledger page draws "Night by night"
       * from it, and no path in this repository ever wrote a row into it: the eight declaration
       * kinds schedule nothing into a register, a rule's `create:` fills its fields through `fill`,
       * which reads the triggering row's own fields and cannot carry an aggregate, the arm above
       * writes `metric_point`, and a digest writes one event and sends. So the table said *No night
       * has been recorded yet* for as long as the record ran.
       *
       * IT IS A `snapshot` ROW AND NOT A KIND OF ITS OWN, and the reason is a `CHECK` constraint.
       * Migration 5 rewrites `schedule` with `CHECK (kind IN (...))` over twelve names, and a
       * thirteenth needs a migration and an edit to `SCHEDULE_KINDS`. The two rows mean the same
       * thing anyway — a reading taken at five past midnight and written down — and the handler
       * tells them apart by the payload, which says `register` where a metric's says `metric`.
       *
       * THE KEY IS THE BARE REGISTER ID for `forgetPack`'s sake: it deletes pending `snapshot` rows
       * whose key is the bare id of one of the pack's declarations, so this one leaves when
       * money-core does and comes back out of `pack_removed` when money-core does.
       */
      if (decl.kind === 'register' && bare === NIGHT_REGISTER) {
        const at = nextOccurrence({ at: '00:05' }, clock.now(), tz);
        if (at !== null) arm('snapshot', bare, { register: bare }, at);
      }
    }
  }

  function unreadable(batch: readonly Declaration[]): Refusal | null {
    const shape0 = (register: string): Schema | null => {
      const arriving = batch.find((d) => d.kind === 'register' && (d.body as { id?: unknown }).id === register);
      if (arriving) {
        /* WITH `tags` for `schemaOf`'s reason, so a rule over `tags has late` installs beside the list it reads. */
        const fields = withTags(((arriving.body as { fields?: unknown }).fields ?? []) as DeclaredField[]);
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
                  /* The element type too, for `schemaOf`'s reason: a rule installed in this batch
                     is linted against this schema, and a `has` over a `list<ref>` read without it
                     compiles clean and fires on nothing. */
                  ...(f.of ? { of: f.of } : {}),
                  ...(f.values ? { values: f.values } : {}),
                  ...(f.to ? { to: f.to } : {}),
                  ...(f.label ? { label: f.label } : {}),
                  /* AND AN ENUM'S VALUE LABELS, for `schemaOf`'s reason. Left out, a page filtering `lane is Earning`
                     was refused "has no value Earning" beside the list that labels it, and taken once the list was
                     already installed: one sentence, two answers, by the order two declarations arrived in. */
                  ...(f.labels ? { labels: f.labels } : {}),
                },
              ]),
          ),
        };
      }
      return registers.has(register) ? schemaOf(register) : null;
    };
    /* A FIGURE OR A PAGE MAY HOP INTO ANOTHER LIST (`pointed`, where-hop-49 and hop-figures-50), into one installed or
       one arriving in this batch, and reach reads the list it hops to (`figureLists`, `registersOf`). A RULE MAY NOT:
       `flow.ts` evaluates a rule's condition in memory, where a hop always answers false, so a rule's hop would
       install and then never fire. Rules are read against `shape0`, which has no hop, and are refused at install. */
    const shape = (register: string): Schema | null => {
      const got = shape0(register);
      return got ? { ...got, schemaOf: (r: string) => shape(r) ?? undefined } : null;
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
          const block = raw as { kind?: unknown; source?: unknown; register?: unknown; where?: unknown } | null;
          if (!block || block.kind === 'diff') continue;
          /* A SENTENCE OR A TREE ONLY. Anything else is `declare.ts`'s `DECLARATION_INVALID`, and this
             check runs first, so reading `null` here would answer the same mistake with another code. */
          const where = block.where;
          if (typeof where !== 'string' && (where === null || typeof where !== 'object' || Array.isArray(where))) continue;
          /* A CAPTURE NAMES ITS LIST WITH `register:` AND HAS NO SOURCE, and its `where:` is what a new
             row is filled with, so a field the list lacks is the same mistake as in a table's filter.
             Reading only `source` let one install clean and refuse on every open. */
          const list =
            typeof block.source === 'string' && block.source.startsWith('register.')
              ? block.source.slice('register.'.length)
              : block.kind === 'capture' && typeof block.register === 'string'
                ? block.register
                : undefined;
          if (list === undefined) continue;
          if (JSON.stringify(where).includes('{{')) continue;
          const schema = shape(list);
          if (!schema) continue;
          const at = `${decl.id}.blocks[${i}]`;
          const bad = unreadWhere(at, where, schema, batch);
          /* THE BLOCK'S OWN PLACE STAYS IN `at`, WHICH `unreadWhere` LEAVES BARE (a rule's or a metric's `when`
             reads at the field alone). Left unprefixed here, a bundle's repair blamed the whole page for a fault
             one block made, and lost which block to a description mending it (`preview-change.ts`'s `blamed`,
             `test/slash-compose-desk.test.ts`). */
          if (bad) return { ...bad, at: bad.at === undefined || bad.at === '' ? at : `${at}.${bad.at}` };
        }

      /* A COLUMN'S `sign:` IS READ HERE TOO, for the `where`'s reason: the page layer refused it on every open
         (`pages.ts`, "a sign is read from an enum and one of its values") while the page installed clean. And it is
         what lets `stranded` ask a page whose sign reads an enum that a change opens to free text. */
      if (decl.kind === 'page' && Array.isArray(body.blocks))
        for (const [i, raw] of body.blocks.entries()) {
          const block = raw as { source?: unknown; columns?: unknown } | null;
          if (!block || typeof block.source !== 'string' || !block.source.startsWith('register.') || !Array.isArray(block.columns)) continue;
          const list = block.source.slice('register.'.length);
          const schema = shape(list);
          if (!schema) continue;
          for (const column of block.columns as { sign?: { field?: unknown; minus?: unknown } }[]) {
            const sign = column?.sign;
            if (sign === undefined) continue;
            const field = typeof sign?.field === 'string' && Object.hasOwn(schema.fields, sign.field) ? schema.fields[sign.field] : undefined;
            if (field?.type === 'enum' && typeof sign?.minus === 'string' && (field.values ?? []).includes(sign.minus)) continue;
            return {
              code: 'DECLARATION_INVALID',
              fix: `${decl.id}.blocks[${i}]: sign: names an enum field on ${list} and the value that makes the amount go out, such as { field: direction, minus: owed_by_me }.`,
              at: `blocks[${i}].columns`,
            };
          }
        }

      const source = typeof body.source === 'string' ? body.source : '';
      const register =
        decl.kind === 'rule'
          ? body.register
          : decl.kind === 'metric' && source.startsWith('register.')
            ? source.slice('register.'.length)
            : undefined;
      const where = decl.kind === 'rule' ? body.when : decl.kind === 'metric' ? body.where : undefined;

      /* AN AUTOMATION KEEPS ITS REGISTER IN `on.written`, and its `when:` is read by the runner against that register's
         rows. This check keyed on the top-level `register:` alone, so `when: 'due is before today'` over a day field,
         which an inline rule is refused for with VALUE_MALFORMED, installed on `on: { written: … }` and then started no
         run on any write, because `flow.ts`'s `holds` answers false for a condition it cannot read. The register's
         own existence stays the lint's to say, so an unknown one is skipped here rather than refused twice. */
      if (decl.kind === 'rule' && typeof register !== 'string' && where !== undefined) {
        const subject = subjectOf(body as FlowDecl);
        const schema = subject === null ? null : shape0(subject);
        if (schema) {
          const bad = unreadWhere(decl.id, where, schema, batch);
          if (bad) return bad;
        }
      }

      if (decl.kind === 'rule' && Array.isArray(body.steps)) {
        const bad = unreadIf(decl.id, body as FlowDecl, shape0, batch);
        if (bad) return bad;
      }

      /* A FIGURE'S OTHER SENTENCES ARE READ HERE TOO: the `where` of a rolled figure's moves and of each leg a walk reads
         (`money-figures.ts`). `declare.ts` cannot read a sentence against a list, so one naming a field the list lacks
         installed clean and then refused on every read. A list that is not there is `declare.ts`'s to say. */
      if (decl.kind === 'metric') {
        const asked: { register: unknown; where: unknown }[] = [];
        const rolled = body.value !== null && typeof body.value === 'object' ? (body.value as { rolled?: { moves?: { register?: unknown; where?: unknown } } }).rolled : undefined;
        if (rolled?.moves) asked.push({ register: rolled.moves.register, where: rolled.moves.where });
        if (source === WALK_SOURCE && Array.isArray(body.legs))
          for (const leg of body.legs as ({ register?: unknown; where?: unknown } | null)[]) if (leg) asked.push({ register: leg.register, where: leg.where });
        for (const one of asked) {
          if (typeof one.register !== 'string' || one.where === undefined || JSON.stringify(one.where).includes('{{')) continue;
          const schema = shape(one.register);
          if (!schema) continue;
          const bad = unreadWhere(decl.id, one.where, schema, batch);
          if (bad) return bad;
        }
      }
      if (typeof register !== 'string') continue;

      const schema = shape(register);
      if (!schema)
        return { code: 'REGISTER_UNKNOWN', fix: `${decl.id} is about ${register}, and there is no such register.`, at: 'register' };

      /* A MISSING `when` SKIPS THE PREDICATE CHECK AND NOTHING ELSE. It used to skip the whole
         block, so a rule with no `when` — which is a legal rule, meaning "every row" — installed
         with no bound, no `once_per`, three axes and a target register nobody has. */
      if (where !== undefined) {
        const bad = unreadWhere(decl.id, where, decl.kind === 'rule' ? (shape0(register) ?? schema) : schema, batch);
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
        /* AN UPDATE IS NOT REFUSED FOR THE ROWS A PERSON ADDED SINCE (4 Nov). A figure split by a ref to a list is fine at
           install and the list then grows: Money's split by filing rule met a record with 67 rules, so every later Money
           update was refused on that record, each night, for a figure that reads fine (a read cuts to the ceiling and says
           how many more). Only a split this record does not hold yet is asked about the list's size. */
        const heldSplit =
          field?.type === 'ref' &&
          (() => {
            const was = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0', decl.id);
            return was !== undefined && was !== null && (JSON.parse(was.body) as { group_by?: unknown }).group_by === body.group_by;
          })();
        if (n > GROUP_CAP && !heldSplit)
          return {
            code: 'GROUP_BY_CARDINALITY',
            fix: `${decl.id}: group_by ${body.group_by} has ${n} possible values; the ceiling is ${GROUP_CAP}.`,
            at: 'group_by',
          };
      }

      if (decl.kind === 'rule') {
        const bad = undeclarable(decl.id, body as unknown as RuleDecl, shape0);
        if (bad) return bad;
      }
    }
    return null;
  }

  /**
   * A door's body by its ingest id, as the batch would leave the record: the batch's own where it sends one, otherwise
   * the live declaration. What `rowRegisterOf` needs to place an arrival's run on a list.
   */
  function doorsOf(batch: readonly Declaration[]): (door: string) => unknown {
    return (door) => {
      const id = `ingest.${door}`;
      const mine = batch.find((d) => d.id === id);
      if (mine !== undefined) return mine.body;
      const row = heldRow(id);
      try {
        return row ? (JSON.parse(row.body) as unknown) : undefined;
      } catch {
        return undefined;
      }
    };
  }

  /**
   * The first `tag` or `untag`, among the rules as the batch would leave the record, that `tags` would refuse on a row of
   * `register` and `was` would not have: the rule's id, the verb, where it sits and, for an enum, the word. `null` when
   * the change refuses nothing a rule writes that the list took before.
   *
   * EVERY ACTION `actionsOf` FINDS, so `then:` and `steps:` and both arms of every `if` are read, and an arrival's rule
   * counts for the list its door writes, whose row is the one its run is handed. What each one is asked is
   * `tagsRefusing`'s, so an enum holding the word is not refused and a templated tag is not judged.
   *
   * ONLY WHAT THIS CHANGE STARTS REFUSING. Asking a change of shape and nothing else let a
   * `list<enum>` drop the word a rule tags from its values, one shape to the same shape, and every later write that
   * tagged it was `ENUM_VALUE_UNKNOWN`. Asked against `was` as well, the narrowing is refused and a list that already
   * refused a rule's tag before this change is still not blamed for it. A `was` already retired is read the same way,
   * as refusing every tag (`tagsRefusing`), so a list resent with the retired `tags` it held is not blamed either.
   */
  function taggerOf(
    batch: readonly Declaration[],
    register: string,
    tags: { type?: unknown; of?: unknown; values?: unknown },
    was: { type?: unknown; of?: unknown; values?: unknown; retired?: unknown } | undefined,
  ): { rule: string; verb: 'tag' | 'untag'; at: string; word?: string } | null {
    const sent = new Map(batch.filter((d) => d.kind === 'rule').map((d) => [d.id, d.body as unknown]));
    const stored = heldRows(['rule'])
      .filter((row) => !sent.has(row.id))
      .flatMap((row) => {
        try {
          return [[row.id, JSON.parse(row.body) as unknown] as const];
        } catch {
          return [];
        }
      });
    const doorOf = doorsOf(batch);
    for (const [id, body] of [...stored, ...sent]) {
      if (body === null || typeof body !== 'object') continue;
      const rule = body as FlowDecl;
      if (rowRegisterOf(rule, doorOf) !== register) continue;
      const before = new Set(was === undefined ? [] : tagsRefusing(rule, was).map((r) => r.at));
      const found = tagsRefusing(rule, tags).find((r) => !before.has(r.at));
      if (found !== undefined) return { rule: id, ...found };
    }
    return null;
  }

  /**
   * A rule in the batch that tags a list whose `tags` would refuse what it writes, as the refusal the list's own change
   * meets, or `null`.
   *
   * THE CHECK ABOVE RAN ONLY WHEN THE LIST CHANGED, SO THE OTHER ORDER WAS NEVER ASKED. `tags: int` declared first, while
   * no rule tagged Jobs, is the list's own choice; `rule.late` installed alone after it went in, and the next Rent was
   * written without its tag, with no refusal and no event (`test/tags-rule-order.test.ts`, driven before this). A
   * `list<enum>` without `late` did the same. So each rule the batch sends is asked against `tags` as the batch leaves
   * its list, with the list's sentence, and `at` on the rule, which is the declaration this change sent.
   *
   * A RULE RESENT WITH THE SAME BYTES IS NOT ASKED. A pack update sends every declaration it holds, and a rule that
   * installed over the list before this check existed would otherwise block every update of its pack, for a fault
   * that change did not make. A rule sent with any other bytes is new to the record and is asked everything.
   *
   * AND EVERY RULE WHOSE DOOR THE BATCH RE-POINTS, SENT OR NOT. An arrival rule's list is its door's `writes.register`,
   * so a batch holding only the door moved the rule to another list and neither half asked: a change that re-pointed
   * `jobs_in` at a Bills whose `tags` was `list<enum>` of `[chase]` under `rule.arrived` tagging `fresh` was taken,
   * alone and beside the rule resent unchanged, and the next arrival's run failed at its `tag` step. The same-bytes
   * skip is for the rule's own bytes, and here the door moved, so such a rule is asked as a new one, with `at` on the
   * door, which is what the change sent. A door resent writing the list it wrote is no move.
   */
  function taggingRefused(batch: readonly Declaration[]): Refusal | null {
    const doorOf = doorsOf(batch);
    const held = (id: string): unknown => {
      const row = heldRow(id);
      if (row === undefined || row === null) return undefined;
      try {
        return JSON.parse(row.body) as unknown;
      } catch {
        /* AN UNREADABLE STORED BODY IS NOT THE SAME BYTES, so what it held is read as nothing. */
        return null;
      }
    };
    const writesOf = (body: unknown) => (body as { writes?: { register?: unknown } } | null | undefined)?.writes?.register;
    const moved = new Map(
      batch
        .filter((d) => d.kind === 'ingest' && d.id.startsWith('ingest.') && writesOf(d.body) !== writesOf(held(d.id)))
        .map((d) => [d.id.slice('ingest.'.length), d.id] as const),
    );
    const doorMoved = (rule: FlowDecl): string | undefined => {
      const door = triggerOf(rule) === 'arrival' ? (rule.on as { arrival?: { ingest?: unknown } } | undefined)?.arrival?.ingest : undefined;
      return typeof door === 'string' ? moved.get(door) : undefined;
    };
    const sent = new Set(batch.filter((d) => d.kind === 'rule').map((d) => d.id));
    const asked: { id: string; body: unknown }[] = [
      ...batch.filter((d) => d.kind === 'rule').map((d) => ({ id: d.id, body: d.body as unknown })),
      ...(moved.size === 0
        ? []
        : heldRows(['rule'])
            .filter((row) => !sent.has(row.id))
            .flatMap((row) => {
              try {
                return [{ id: row.id, body: JSON.parse(row.body) as unknown }];
              } catch {
                return [];
              }
            })),
    ];
    for (const { id, body } of asked) {
      if (body === null || typeof body !== 'object') continue;
      const rule = body as FlowDecl;
      const door = doorMoved(rule);
      if (door === undefined) {
        if (!sent.has(id)) continue;
        const stored = held(id);
        if (stored !== undefined && stored !== null) {
          try {
            if (jcs(body as Json) === jcs(stored as Json)) continue;
          } catch {
            /* A BODY `jcs` CANNOT CANONICALISE IS NOT THE SAME BYTES, so the rule is asked as a new one. */
          }
        }
      }
      const register = rowRegisterOf(rule, doorOf);
      if (register === null) continue;
      /* THE LIST AS THE BATCH LEAVES IT: its fields as sent, or as held. A list with no declared `tags` takes the
         `list<text>` every list takes (`withTags`). A retired one is asked too, and refuses every tag. */
      const arriving = batch.find((d) => d.kind === 'register' && ownId(d) === register);
      const fields = arriving !== undefined ? (arriving.body as { fields?: unknown }).fields : registers.get(register)?.fields;
      if (!Array.isArray(fields)) continue;
      const tags = (fields as { id?: unknown; type?: unknown; of?: unknown; values?: unknown; retired?: unknown }[]).find((f) => f?.id === 'tags');
      if (tags === undefined) continue;
      const found = tagsRefusing(rule, tags).at(0);
      if (found === undefined) continue;
      return tagsRefusal(register, id, found, tagsShape(tags), door !== undefined && !sent.has(id) ? `${door}.writes.register` : `${id}.${found.at}`);
    }
    return null;
  }

  /**
   * A list in the batch whose `tags` would start refusing what a rule tags it with, as the refusal, or `null`.
   *
   * LIFTED OUT OF `contradicted` SO THAT `stageInstall` ASKS IT TOO. The pack path asked `taggingRefused` (a rule in
   * the batch) and never this (a list in the batch), and `plan`'s own `FIELD_TYPE_CHANGED` asks only about rows written
   * under the old type. A pack's Jobs sent with `tags` as `list<enum>` of `[chase]`, and as `int`, under an installed
   * `rule.late`, each staged, applied, and left the next Rent untagged. A retired `tags` is asked here as well, since
   * the field loop in `contradicted` passes over every retired field.
   */
  function tagsNarrowed(batch: readonly Declaration[]): Refusal | null {
    for (const decl of batch) {
      if (decl.kind !== 'register') continue;
      const fields = (decl.body as { fields?: unknown }).fields;
      if (!Array.isArray(fields)) continue;
      const tags = (fields as { id?: unknown; type?: unknown; of?: unknown; values?: unknown; retired?: unknown }[]).find((f) => f?.id === 'tags');
      if (tags === undefined) continue;
      const register = ownId(decl);
      const was = registers.has(register) ? withTags(registers.get(register)!.fields).find((f) => f.id === 'tags') : undefined;
      const tagging = taggerOf(batch, register, tags, was as { type?: unknown; of?: unknown; values?: unknown; retired?: unknown } | undefined);
      if (tagging !== null) return tagsRefusal(register, tagging.rule, tagging, tagsShape(tags), `${decl.id}.fields.tags.${tags.retired === true ? 'retired' : 'type'}`);
    }
    return null;
  }

  /**
   * A register in the batch that the rows already in it contradict, or a `ref` it points at no list, as a refusal.
   *
   * A CHANGE REACHED `install` WITHOUT THE CHECKS A PACK MEETS. `packages/declare`'s `plan` refuses a type change and a new
   * required field over a populated register (`FIELD_TYPE_CHANGED`, `REQUIRED_ON_POPULATED`, `04 §5`) and a list nothing
   * holds (`REGISTER_UNRESOLVED`), and an accepted `change` and the in-app declare call `install` directly.
   * Four such changes accepted over two open Obligations rows each installed. Driven afterwards:
   *
   *     state narrowed to [paid]      every edit to either row  ENUM_VALUE_UNKNOWN "state has no value open."
   *     what: text -> int             one row edited to 5, the other still "I2": one column, two types
   *     a new required amount_due     both rows edited without it, accepted: required forwards, never backwards
   *     ref to a list called nowhere  installed at v1, pointing at nothing any row could name
   *
   * THE SAME CODES AS THE PACK'S PATH, so one fault says one thing whichever way it arrives, and the narrowed enum takes
   * the write path's own `ENUM_VALUE_UNKNOWN`, which is the refusal those rows would otherwise meet on every edit.
   * A `default` is the answer for rows that have none, so a required field that ships one is not refused; a type
   * change over a field no row holds breaks nothing, so it is not refused either. Live rows only, as the unique check
   * in `applyDeclarations` counts them, except a field left out, where a deleted row counts too (its comment says why).
   */
  function contradicted(batch: readonly Declaration[]): Refusal | null {
    const rows = (n: number) => (n === 1 ? '1 row' : `${n} rows`);
    const arriving = new Set(batch.filter((d) => d.kind === 'register').map((d) => ownId(d)));
    type Field = { id?: unknown; type?: unknown; of?: unknown; to?: unknown; values?: unknown; required?: unknown; default?: unknown; retired?: unknown; derived?: unknown };
    const typeOf = (f: Field) => `${String(f.type)}${f.of === undefined ? '' : `<${String(f.of)}>`}`;

    for (const decl of batch) {
      if (decl.kind !== 'register') continue;
      const register = ownId(decl);
      const fields = (decl.body as { fields?: unknown }).fields;
      if (!Array.isArray(fields)) continue;
      /* WITH THE `tags` EVERY LIST TAKES (`withTags`), as the `list<text>` its rows hold. Read from the declared body
         alone, a list that never declared `tags` had no `was` for one arriving, so `tags` declared as `text`, `int` and
         `bool` over a row holding `["late","example"]` each installed; every `tag` and `untag` on that list was
         `VALUE_MALFORMED` from then on. A list the record does not hold yet has no rows to contradict, and nothing is
         added for it. */
      const before = new Map<string, Field>(
        (registers.has(register) ? withTags(registers.get(register)!.fields) : []).map((f) => [f.id, f as Field]),
      );
      const count = (where: string, ...params: (string | number)[]) =>
        Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND ${where}`, register, ...params)?.n ?? 0);

      /* A FIELD LEFT OUT OVER VALUES THE ROWS STILL HOLD. Two agents each added a field from one reading, the owner
         accepted both, and the second body had no `domain` while a row held one. Every check below walks the ARRIVING
         fields, so a field that was simply absent was never asked about: it installed, the value stayed in the row's
         JSON through every later edit, and no reader could see it. Retiring is the removal that keeps the value and
         says so, and it stays legal; a field already retired may then go, since its values were put away on purpose.

         A DELETED ROW IS COUNTED TOO, alone of the checks here. Measured: `domain` dropped while a row was live
         (refused), the row deleted, `domain` dropped again (installed), and the row restored: its JSON held
         `"domain":"kiln.example"` under a list with no `domain`, the state this check exists to prevent. The other
         checks ask what a reader meets on the next edit, which a deleted row never has; this one asks what the rows
         hold, and a deleted row holds its values until the thirty-day purge, which is exactly as long as a restore can
         bring them back. Refusing the restore instead would leave the person who deleted by mistake unable to undo it
         over a schema change somebody else made, and retiring is one word in the declaration. */
      const named = new Set((fields as Field[]).map((f) => f?.id).filter((id): id is string => typeof id === 'string'));
      for (const [id, was] of before) {
        if (named.has(id) || was.retired === true) continue;
        /* NOR IS A DECLARED `tags` LEFT OUT when the one every list takes (`withTags`) reads what it held: a `list<text>`,
           or a `list<enum>` that widens to one. Refused here, its fix sent the list to retire `tags`, and a retired `tags`
           is a choice the list made, so the next `tag` on that list was `FIELD_UNKNOWN`. */
        if (id === 'tags' && (typeOf(was) === typeOf(TAGS) || widens(was, TAGS))) continue;
        let path: string;
        try {
          path = jsonPath(id);
        } catch {
          continue;
        }
        const held = sql.one<{ n: number; gone: number }>(
          `SELECT count(*) AS n, count(deleted_at) AS gone FROM entry WHERE register = ? AND json_extract(fields, '${path}') IS NOT NULL`,
          register,
        );
        const n = Number(held?.n ?? 0);
        const gone = Number(held?.gone ?? 0);
        if (n > 0)
          return {
            code: 'WOULD_ORPHAN',
            fix: `${rows(n)} ${n === 1 ? 'holds' : 'hold'} ${id}${
              gone === 0 ? '' : n === 1 ? ', a deleted one a restore brings back' : `, ${gone} of them ${gone === 1 ? 'a deleted one' : 'deleted ones'} a restore brings back`
            }. Mark it retired rather than leaving it out.`,
            at: `${decl.id}.fields`,
          };
      }

      for (const f of fields as Field[]) {
        if (typeof f?.id !== 'string' || f.retired === true) continue;
        const at = `${decl.id}.fields.${f.id}`;

        if ((f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && typeof f.to === 'string' && !registers.has(f.to) && !arriving.has(f.to))
          return {
            code: 'REGISTER_UNRESOLVED',
            fix: `${decl.id}.${f.id} points at ${f.to}, and there is no list called ${f.to}. Point it at a list you have, or declare ${f.to} in the same change.`,
            at: `${at}.to`,
          };

        /* A FIELD ID THE GRAMMAR REFUSES IS `validate`'s to say, after this, so it is passed over here rather than
           spliced into a path. */
        let path: string;
        try {
          path = jsonPath(f.id);
        } catch {
          continue;
        }
        const held = `json_extract(fields, '${path}') IS NOT NULL`;
        const was = before.get(f.id);

        /* A WIDENING IS NOT A RETYPE (`widen.ts`): `enum` to `text` over held values was refused here with "retire the
           field and add a new one", though every stored value was already valid text and the fix would have split one
           column into two. */
        if (was !== undefined && was.retired !== true && typeOf(was) !== typeOf(f) && !widens(was, f)) {
          const n = count(held);
          /* NOT "RETIRE IT" FOR `tags`, whose retiring the check above calls a choice that turns every later `tag` on
             the list into `FIELD_UNKNOWN`. The list's tags are a `list<text>` whether or not it wrote one down. */
          if (n > 0 && f.id === 'tags' && typeOf(was) === typeOf(TAGS))
            return {
              code: 'FIELD_TYPE_CHANGED',
              fix: `${decl.id}.tags: every list takes tags as list<text>, and ${rows(n)} ${n === 1 ? 'holds' : 'hold'} some, so ${typeOf(f)} would change the type under them. Leave tags out, or declare it as list<text>.`,
              at: `${at}.type`,
            };
          if (n > 0)
            return {
              code: 'FIELD_TYPE_CHANGED',
              fix: `${decl.id}.${f.id}: ${typeOf(was)} → ${typeOf(f)} changes a type, and ${rows(n)} ${n === 1 ? 'holds' : 'hold'} a value written under the old one. Retire the field and add a new one.`,
              at: `${at}.type`,
            };
        }

        if ((f.type === 'enum' || (f.type === 'list' && f.of === 'enum')) && Array.isArray(f.values)) {
          const values = f.values.map(String);
          /* ONE JSON ARRAY, NEVER A PARAMETER PER VALUE: a Durable Object refuses more than 100, and an enum may hold more.
             An empty list keeps the old `''`, so a row with no value is still not counted. */
          const kept = JSON.stringify(values.length ? values : ['']);
          const out = f.type === 'enum'
            ? sql.all<{ v: string; n: number }>(
                `SELECT json_extract(fields, '${path}') AS v, count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND ${held} AND json_extract(fields, '${path}') NOT IN (SELECT value FROM json_each(?)) GROUP BY v ORDER BY n DESC, v`,
                register,
                kept,
              )
            : sql.all<{ v: string; n: number }>(
                `SELECT j.value AS v, count(DISTINCT entry.id) AS n FROM entry, json_each(entry.fields, '${path}') AS j WHERE entry.register = ? AND entry.deleted_at IS NULL AND j.value NOT IN (SELECT value FROM json_each(?)) GROUP BY v ORDER BY n DESC, v`,
                register,
                kept,
              );
          /* ONLY A VALUE THE LIST TAKES NOW AND WOULD STOP TAKING. Counted against the new list alone, a record the
             narrowing above already reached (`state` at `[paid]` over two `open` rows) refused every later change to
             Obligations, adding an unrelated text field included, with "would no longer take open", which it had not
             taken since. Those rows are refused on every edit already, and this change does not make them so. A field
             that was not an enum of the same shape before is held to every value, since nothing it declared took any of
             them. */
          const took = was !== undefined && was.retired !== true && typeOf(was) === typeOf(f) && Array.isArray(was.values) ? new Set(was.values.map(String)) : null;
          const dropped = took === null ? out : out.filter((o) => took.has(String(o.v)));
          if (dropped.length > 0) {
            const gone = dropped.map((o) => String(o.v));
            /* A ROW, NOT A VALUE: a `list<enum>` row holding two of the dropped values is one row whose edits are refused. */
            const n = f.type === 'enum'
              ? dropped.reduce((sum, o) => sum + Number(o.n), 0)
              : Number(
                  sql.one<{ n: number }>(
                    `SELECT count(DISTINCT entry.id) AS n FROM entry, json_each(entry.fields, '${path}') AS j WHERE entry.register = ? AND entry.deleted_at IS NULL AND j.value IN (SELECT value FROM json_each(?))`,
                    register,
                    JSON.stringify(gone),
                  )?.n ?? 0,
                );
            return {
              code: 'ENUM_VALUE_UNKNOWN',
              fix: `${decl.id}.${f.id} would no longer take ${gone.join(' or ')}, and ${rows(n)} ${n === 1 ? 'holds' : 'hold'} ${gone.length === 1 ? 'it' : 'them'}, so every edit to ${n === 1 ? 'that row' : 'those rows'} would be refused. Keep ${gone.length === 1 ? 'the value' : 'the values'}, or move those rows to another first.`,
              at: `${at}.values`,
              allowed: values,
            };
          }
        }

        if (f.required === true && f.default === undefined && f.derived !== true && was?.required !== true) {
          const n = count(`json_extract(fields, '${path}') IS NULL`);
          if (n > 0)
            return {
              code: 'REQUIRED_ON_POPULATED',
              fix: `${decl.id}.${f.id} is required and ${rows(n)} ${n === 1 ? 'has' : 'have'} none. Give it a default, or fill those rows first.`,
              at: `${at}.required`,
            };
        }
      }
    }
    /* AND NOT OVER A LIST A RULE TAGS, THOUGH NO ROW HOLDS A TAG YET. The choice above is the list's own where nothing
       is stored, and it missed a reader: Bills with no tag on any row and `rule.late` tagging each Rent took `tags:
       int`, and the next Rent went in without its tag, with no refusal and no event, one `write.refused` observation
       the only trace. A rule's `tag` or `untag`, on either path and in either arm, is a reader of the list's tags, so
       it is asked after the rows are. Only what the change starts refusing is asked: a list that already refused a
       rule's tag before it is not this change's fault. */
    return tagsNarrowed(batch) ?? taggingRefused(batch);
  }

  /**
   * A list change that takes away a field a live figure, rule, page or ingest reads, as a refusal naming what reads it.
   *
   * THE FIELD CHECK RAN WHEN THE READER ARRIVED AND NEVER WHEN THE LIST CHANGED UNDER IT. `category` retired on
   * Transactions through the owner's `setDeclaration` was taken, and the seed's `txn-uncategorised` then answered
   * `FIELD_UNKNOWN` on every read; retiring or dropping a field a figure sums, groups by or filters on did the same on
   * a bare kernel. So each live declaration that names the list is asked again, the same questions `unreadable` and
   * `lintBatch` put to it at install, against the list as the change would leave it.
   *
   * ONLY WHAT THIS CHANGE BREAKS. A reader that already fails against the list as it stands is passed over: refusing
   * every later edit to a list because of a figure an earlier path let through would blame the wrong change, and the
   * figure is already saying so on every read. And only a change that takes a field away or widens one is looked at; any
   * other type change over held rows is `contradicted`'s.
   *
   * A WIDENING IS ASKED ABOUT TOO. `contradicted` lets `enum` to `text` through without asking any reader (`widen.ts`),
   * and that left, measured: a rule with `each: [season]` survived `season` opening to text, though the same rule
   * declared fresh is refused, and at run time it crossed the whole free text as one item. A page column whose `sign:`
   * reads the enum is the same kind of reader. Every stored value still reads back; what a widening takes away is the
   * closed list, and these are the readers that needed it.
   *
   * AND A READER THAT STILL COMPILES IS ASKED WHAT IT WOULD NOW MEAN. `lane` opened to text under four figures that all
   * compiled either way, and three changed their answer with nothing refused:
   * `lane is earning money` from 1 to 0, `lane is Building` from 1 to 0, `lane is not Parked` from 2 to 3. `where` reads an
   * enum's word by label, by spaces for underscores and without case, and a text's word exactly as written, so a word that
   * only the closed list turned into a stored value now asks for something no row holds. Each such sentence is parsed
   * against the list as it stands and again with only the opened fields changed (`misread`), and a word that moves is
   * refused with the reader, the word and the stored value it has to be written as.
   *
   * REFUSED RATHER THAN REWRITTEN TO THE STORED VALUE, though the rewrite would have let the widening through in one step.
   * It edits a declaration nobody in this change asked to edit, most often a pack's, whose next update would put the
   * old words back over a text field and bring the wrong answer back with no refusal at all; and it re-prints a sentence
   * somebody wrote. The refusal costs the owner one edit they can see, and the reader's new words then say what it counts.
   *
   * A reader changed in the same batch compiled with the batch, so what it is asked here is its words alone, as sent. One
   * sent again unchanged is the record's, and is asked everything.
   */
  function stranded(batch: readonly Declaration[]): Refusal | null {
    /* A READER RESENT WITH THE SAME BYTES IS NOT THE BATCH'S. A pack update sends every declaration it holds, so its own
       figure arrived beside the widening unchanged, was passed over as "checked with the batch", and `lane is earning
       money` went from 1 to 0 with nothing refused (`test/widen-figures.test.ts`). Compiling it against the arriving list
       says only that it still reads, which is exactly what a widening leaves true. */
    const sent = new Map(batch.map((d) => [d.id, d]));
    const arriving = (id: string, stored: string): boolean => {
      const d = sent.get(id);
      if (d === undefined) return false;
      try {
        return jcs(d.body as unknown as Json) !== jcs(JSON.parse(stored) as Json);
      } catch {
        return true;
      }
    };
    type Field = { id?: unknown; retired?: unknown; type?: unknown; of?: unknown };
    const live = (fields: unknown): Map<string, Field> =>
      new Map(
        (Array.isArray(fields) ? (fields as Field[]) : [])
          .filter((f) => f?.retired !== true && typeof f?.id === 'string')
          .map((f) => [f.id as string, f]),
      );
    /* `rebatched` IS AN INSTALLED READER THE BATCH SENDS WITH OTHER BYTES, carried with the body as sent. */
    let readers: (Declaration & { rebatched: boolean })[] | null = null;

    /* THE LIST A RULE'S RUN READS ITS `if` AGAINST, an arrival's included: the door it waits at, as this batch leaves
       it. An automation on arrivals at a door writing Projects that answered "then" under the enum and "else" under
       text installed, because `subjectOf` gives an arrival no list. */
    const doorOf = doorsOf(batch);
    const listOf = (reader: Declaration): string | null => (reader.kind === 'rule' ? rowRegisterOf(reader.body as unknown as FlowDecl, doorOf) : null);

    /* THE LIST AS IT STANDS AND THE SAME LIST WITH ONLY THE OPENED FIELDS CHANGED, so a word in a reader's sentence that
       moves between the two moved because of the widening and nothing else in the change. */
    const movedWord = (reader: Declaration, register: string, opened: readonly string[], after: ReadonlyMap<string, Field>) => {
      const closed = schemaOf(register);
      const open: Schema = { ...closed, fields: { ...closed.fields } };
      for (const id of opened) {
        const f = after.get(id) as Field & { label?: unknown };
        open.fields[id] = { type: String(f.type), ...(typeof f.of === 'string' ? { of: f.of } : {}), ...(typeof f.label === 'string' ? { label: f.label } : {}) };
      }
      const ctx = evalContext();
      /* `REF_UNKNOWN` IS PASSED OVER as `unreadWhere` passes it: a title no row holds yet is the same either way. */
      const reads = (said: ReturnType<typeof predicateOf>) => said.bad.every((b) => b.code === 'REF_UNKNOWN');
      for (const { at, where } of sentencesOver(reader.kind, reader.body as Record<string, unknown>, register, listOf(reader))) {
        const was = predicateOf(where, closed, ctx);
        const now = predicateOf(where, open, ctx);
        if (!reads(was) || !reads(now)) continue;
        const word = misread(was.predicate, now.predicate, new Set(opened));
        if (word) return { at, where, ...word };
      }
      return null;
    };

    /* How a refusal names the reader and the list: its own words where it has them, and the list by its name. */
    const spoken = (decl: Declaration, register: string, reader: Declaration) => {
      const body = reader.body as { name?: unknown; title?: unknown };
      const called = typeof body.name === 'string' ? body.name : typeof body.title === 'string' ? body.title : reader.id;
      const what = reader.kind === 'metric' ? 'the figure' : reader.kind === 'page' ? 'the page' : `the ${reader.kind}`;
      const list = typeof (decl.body as { name?: unknown }).name === 'string' ? String((decl.body as { name: string }).name) : register;
      return { called, what, list };
    };
    const wordMoved = (decl: Declaration, register: string, reader: Declaration, moved: NonNullable<ReturnType<typeof movedWord>>): Refusal => {
      const { called, what, list } = spoken(decl, register, reader);
      const says = moved.written === '' ? 'reads it differently' : `says ${moved.written}`;
      return {
        code: 'FIELD_TYPE_CHANGED',
        fix: `Opening ${moved.field} on ${list} to free text would quietly change which rows ${what} ${called === reader.id ? reader.id : `${called} (${reader.id})`} reads: its ${moved.at} "${moved.where}" ${says}, which only the closed list read as ${moved.stored}, and free text compares the word as written. Write ${moved.stored} there first, then open ${moved.field}.`,
        at: reader.id,
      };
    };

    for (const [at, decl] of batch.entries()) {
      if (decl.kind !== 'register') continue;
      /* A LIST STAGED AGAIN LATER IN THE BATCH IS ASKED AS ITS LAST BODY, which is the one left live: a rebased list is staged
         as the pack's body and then with the owner's additions over it, and the first lacks what the second lays back. */
      if (batch.some((later, i) => i > at && later.id === decl.id)) continue;
      const register = ownId(decl);
      const was = heldRow(decl.id);
      if (!was) continue;
      let before: Map<string, Field>;
      try {
        before = live((JSON.parse(was.body) as { fields?: unknown }).fields);
      } catch {
        continue;
      }
      const after = live((decl.body as { fields?: unknown }).fields);
      const gone = [...before.keys()].filter((f) => !after.has(f));
      const opened = [...before].filter(([id, f]) => after.has(id) && widens(f, after.get(id)!)).map(([id]) => id);
      if (gone.length === 0 && opened.length === 0) continue;

      readers ??= heldRows(['metric', 'rule', 'page', 'ingest'])
        .flatMap((row): (Declaration & { rebatched: boolean })[] => {
          /* A READER THE BATCH REWRITES IS ASKED IN THE WORDS THE BATCH SENDS. Passed over as "the batch's, and checked
             with it", a figure resent with only its `name` changed kept `lane is earning money` and went from 1 to 0:
             what checked it was `lintBatch`, which asks only whether it compiles, and a widening leaves that true. Read
             off the body as sent, one whose words the batch rewrote to the stored value still installs, and one that
             kept them does not. */
          if (arriving(row.id, row.body)) {
            const mine = sent.get(row.id)!;
            return [{ ...mine, rebatched: true }];
          }
          try {
            return [{ id: row.id, kind: row.kind as Declaration['kind'], body: JSON.parse(row.body) as Record<string, Json>, pack: row.pack_id ?? undefined, rebatched: false }];
          } catch {
            return [];
          }
        });

      /* A CHEAP NARROWING FIRST: a reader that never names the list cannot read its fields. The before-and-after
         question below is what decides; this only keeps it from being asked of every page in the record. An arrival's
         automation names its door and not the list, so the list its run reads is asked of it by name. */
      const names = new RegExp(`"(register\\.)?${register}"`);
      for (const reader of readers) {
        if (!names.test(JSON.stringify(reader.body)) && listOf(reader) !== register) continue;
        /* ONLY THE WORDS OF A REWRITTEN READER, since whether it compiles against the batch was `lintBatch`'s, over the
           whole batch it arrived in. Asked here alone beside this list, one that also reads a list the batch adds would
           be refused for a list it was right to name. */
        if (reader.rebatched) {
          const moved = opened.length === 0 ? null : movedWord(reader, register, opened, after);
          if (moved) return wordMoved(decl, register, reader, moved);
          continue;
        }
        const now = unreadable([reader]) ?? lintBatch(sql, [reader], planned ?? undefined, lintTableNow());
        if (now) continue;
        /* THIS LIST ALONE BESIDE THE READER, not the whole batch. A page over two lists that both change in one batch
           was first blamed on whichever came first in it, and the sentence named the wrong list and every field it
           lost; asked one list at a time, the refusal is about the list that took the field away. */
        const then = unreadable([decl, reader]) ?? lintBatch(sql, [decl, reader], planned ?? undefined, lintTableNow());
        const { called, what, list } = spoken(decl, register, reader);
        if (!then) {
          const moved = opened.length === 0 ? null : movedWord(reader, register, opened, after);
          if (!moved) continue;
          return wordMoved(decl, register, reader, moved);
        }
        /* THE FIELD THE REFUSAL NAMES, by the words both checks use for it. A bare substring match named `what` and
           `kind` out of any sentence that happened to hold them. */
        const named = gone.filter((f) => new RegExp(`\\b(field called|reads|groups by) ${f}\\b`).test(then.fix));
        if (gone.length > 0) {
          const fields = (named.length > 0 ? named : gone).join(' and ');
          return {
            code: then.code,
            fix: `Taking ${fields} out of ${list} would leave ${what} ${called} (${reader.id}) unable to read it: ${then.fix} Change or retire ${reader.id} first, or keep ${fields}.`,
            at: reader.id,
          };
        }
        const widened = opened.filter((f) => then.fix.includes(f));
        const fields = (widened.length > 0 ? widened : opened).join(' and ');
        return {
          code: then.code,
          fix: `Opening ${fields} on ${list} to free text would leave ${what} ${called} (${reader.id}) reading a closed list that is no longer there: ${then.fix} Change or retire ${reader.id} first, or keep ${fields} as it is.`,
          at: reader.id,
        };
      }
    }
    return null;
  }

  /**
   * What `stageInstall` refuses before it stages anything, in its order: every check a pack meets on its path.
   *
   * ONE LIST FOR THE STAGE AND THE LINT, so what an arrangement is filed on and what its accept answers cannot drift. The
   * lint asked three of these six, `unreadable`, `lintBatch` and `unserved`, and the arranger asked none of them of a
   * planned record. `lintBatch` reads the plan when `againstPlan` has set one, and the others read it through the cache
   * and `heldRow`.
   */
  /**
   * The table's declarations as the lint reads them (`lintTable`), kept while they stand: the same revision, and the same
   * rows by count and rowid, live and in all. A staged write the caller has not reloaded yet moves the rows, and a
   * transaction rolled back moves them back, so neither is linted against a table it no longer is.
   */
  let lintKept: { key: string; table: LintTable } | null = null;
  function lintTableNow(): LintTable {
    const at = sql.one<Record<string, unknown>>(
      `SELECT count(*) AS n, max(rowid) AS m, total(rowid) AS t,
              total(CASE WHEN superseded_at IS NULL AND retired = 0 THEN 1 ELSE 0 END) AS ln,
              total(CASE WHEN superseded_at IS NULL AND retired = 0 THEN rowid ELSE 0 END) AS lt FROM declaration`,
    );
    const key = JSON.stringify([revision, at?.n, at?.m, at?.t, at?.ln, at?.lt]);
    if (lintKept === null || lintKept.key !== key) lintKept = { key, table: lintTable(sql) };
    return lintKept.table;
  }

  function stagingFault(batch: readonly Declaration[]): Refusal | null {
    return unreadable(batch) ?? lintBatch(sql, batch, planned ?? undefined, lintTableNow()) ?? unserved(batch) ?? keysKept(batch) ?? stranded(batch) ?? tagsNarrowed(batch) ?? taggingRefused(batch);
  }

  /**
   * A rule in the batch that asks Slash, on a host that has not said it answers one (`RecordOptions.answersSlash`).
   *
   * HERE AND NOT IN THE LINT, for the reason `stranded` is here: `flowFault` is reached only through `declare.ts`'s
   * `validate`, which is context-free, and `stageDeclarations(batch)` stages a pack with no context at all, so a flag
   * threaded down to the lint would have crossed four functions and still left a default of off refusing a pack the lint
   * had passed. Every install path asks this right after `lintBatch`, so a malformed ask is told what is wrong with it
   * first, and only a well-formed one hears that nothing here would answer it.
   */
  /**
   * An action or a script in the batch that names a key kept for another project (`keyOutOfScope`).
   *
   * HERE AND NOT IN `declare.ts`, for the reason `unserved` is: which projects a key is kept to is read off the keychain and
   * the lists that hold keys, which the context-free lint never sees. Asked on every install path right after it.
   */
  function keysKept(batch: readonly Declaration[]): Refusal | null {
    for (const d of batch) {
      if (d.kind !== 'ingest' && d.kind !== 'script') continue;
      const e = egressOf(d.body, titleOfRow);
      const out = e && keyOutOfScope(e, keyScope, titleOfRow);
      if (out) return { code: out.code, fix: out.fix, at: out.at };
    }
    return null;
  }

  function unserved(batch: readonly Declaration[]): Refusal | null {
    if (opts.answersSlash === true) return null;
    /* THE WORDS ARE THE STEP'S ROW IN `capabilities.ts`, which the runner fails a run with and the grammar lists by. */
    const says = capability('ask_slash')!.says;
    for (const d of batch) {
      if (d.kind !== 'rule') continue;
      const at = slashAskAt(d.body as unknown as FlowDecl);
      if (at !== null)
        return {
          code: 'NOT_IN_THIS_BUILD',
          fix: `${d.id} asks Slash at ${at}, and ${says}. Ask a person with ask_person instead.`,
          at: `${at}.ask_slash`,
        };
    }
    return null;
  }

  /**
   * One `declare` event for each declaration a change moved to a new version: who, from which version to which, and for a
   * register the field ids it added or took off.
   *
   * NOTHING WROTE ONE. `declare` has been a declaration event kind since `events.ts` was drawn, and a change that gave
   * Projects a `domain` was measured leaving zero events: the `declaration` table has no actor, so "who added domain to
   * Projects" had no answer at all, and "when" only by diffing version bodies. The feed needs the sentence
   * "agent:claude added domain to Projects", and this is where it comes from.
   *
   * THE DIFF IS AGAINST THE VERSION THIS ONE SUPERSEDED, read after the write inside the same transaction, so it is the
   * body that was actually live and not whatever the caller last read. A retire and a drop are both "took off": either
   * way a reader no longer sees the field. An unchanged declaration answered `changed: false` and gets no line.
   *
   * ONLY WHEN SOMEONE IS NAMED. Signed `system` on every bare install, the seed's own setup put three `declare` lines ahead
   * of the row events `rules.test.ts` asserts and doubled the activity feed `pages-computed.test.ts` draws; a real
   * record's setup declares dozens, and they would open the owner's first feed. An install with no actor is setup, and
   * the pack path writes its own `install` line for that.
   */
  function declared(installed: readonly Installed[], by: DeclaredBy | undefined): void {
    if (by?.actor === undefined) return;
    const liveFields = (body: string | undefined): string[] => {
      if (body === undefined) return [];
      try {
        const fields = (JSON.parse(body) as { fields?: unknown }).fields;
        return Array.isArray(fields)
          ? (fields as { id?: unknown; retired?: unknown }[]).filter((f) => typeof f?.id === 'string' && f.retired !== true).map((f) => f.id as string)
          : [];
      } catch {
        return [];
      }
    };
    const listed = (ids: string[]) => (ids.length <= 1 ? ids.join('') : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`);
    const proposer = by?.suggestion === undefined ? undefined : sql.one<{ by: string }>('SELECT opened_by AS by FROM suggestion WHERE id = ?', by.suggestion)?.by;
    const at = instant(clock.now());

    for (const one of installed) {
      if (!one.changed) continue;
      const now = sql.one<{ kind: string; body: string; pack: string | null }>('SELECT kind, body, pack_id AS pack FROM declaration WHERE id = ? AND version = ?', one.id, one.version);
      /* SLASH SIGNS THE DECLARE OF ITS OWN LOOK AND NO OTHER. Inside the install's transaction, so the throw
         takes the version with it. */
      slashMayWrite(by.actor, 'declare', now);
      const was = sql.one<{ version: number; body: string }>(
        'SELECT version, body FROM declaration WHERE id = ? AND version < ? ORDER BY version DESC LIMIT 1',
        one.id,
        one.version,
      );
      const said: string[] = [];
      if (now?.kind === 'register') {
        const before = liveFields(was?.body);
        const after = liveFields(now.body);
        const added = after.filter((f) => !before.includes(f));
        const off = before.filter((f) => !after.includes(f));
        if (added.length > 0) said.push(`Added ${listed(added)}.`);
        if (off.length > 0) said.push(`Took off ${listed(off)}.`);
      }
      if (proposer !== undefined) said.push(`Proposed by ${proposer} in ${by!.suggestion}.`);
      const note = said.join(' ');
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, note) VALUES (?, ?, ?, 'declare', ?, 'declaration', ?, ?, ?)",
        mint(),
        at,
        by.actor,
        `declaration:${one.id}`,
        was === undefined ? null : String(was.version),
        String(one.version),
        note === '' ? null : note.slice(0, 280),
      );
    }
  }

  /**
   * A run-path `if` the run could not read, whatever its answers held, as the refusal the run would have failed with.
   *
   * THE LINT ASKED ONLY THAT AN `if` WAS A STRING OR A TREE, and this check read a rule's `when:` and not its steps. A
   * rule with `if: 'amount more than 1000'` installed over a Bills with a decimal `amount`, and every run failed at
   * that step: "could not read its condition at step 1: amount more than 1000: more is not something a filter can say".
   * The run reads the sentence against the row's schema with each answer typed by its value (`flow.ts`'s `test`), and
   * the value is not known here, so each answer the rule gives is tried as text, as a decimal and as a bool, which are
   * the three the run can type one as. Only a refusal all three meet, word for word, is the run's certain answer and
   * refused; one that depends on the type is left to the run.
   *
   * A CONDITION HOLDING `{{...}}` IS NOT READ, since the run fills it before reading it, and nor is a tree, which the run
   * evaluates without compiling. A rule whose row is on a list no lint can name (an arrival at no named door) is not
   * read either: a field of that row would be refused by a schema that is not the one the run holds.
   *
   * A RULE STARTED BY AN ANSWER READS THE ROW THE QUESTION WAS ABOUT, on the list of the rule that asked it
   * (`on.decided.about`, in this batch or live). Read against its answers alone, `chase_draft is empty` was refused with
   * "vars has no field called chase_draft" though the run holds the invoice. A decision that names no rule, or a rule
   * this record cannot place on a list, is left to the run, as an arrival at no named door is.
   */
  function unreadIf(id: string, rule: FlowDecl, shape: (register: string) => Schema | null, batch: readonly Declaration[]): Refusal | null {
    const conditions: { cond: string; at: string }[] = [];
    const answers = new Set<string>();
    const walk = (list: unknown, at: string) => {
      if (!Array.isArray(list)) return;
      for (const [i, step] of list.entries()) {
        if (step === null || typeof step !== 'object') continue;
        const here = `${at}[${i}]`;
        const s = step as Record<string, unknown>;
        for (const verb of ['set_var', 'ask_slash', 'ask_person', 'call', 'script', 'run_job']) {
          const spec = s[verb] as { name?: unknown; as?: unknown } | undefined;
          const named = verb === 'set_var' ? spec?.name : spec?.as;
          if (typeof named === 'string') answers.add(named);
        }
        if ('if' in s) {
          if (typeof s.if === 'string' && !s.if.includes('{{')) conditions.push({ cond: s.if, at: here });
          walk(s.then, `${here}.then`);
          walk(s.else, `${here}.else`);
        }
      }
    };
    walk(rule.steps, 'steps');
    if (conditions.length === 0) return null;

    const trigger = triggerOf(rule);
    const register = trigger === 'decided' ? askedOn(rule, batch) : rowRegisterOf(rule, doorsOf(batch));
    if ((trigger === 'written' || trigger === 'arrival' || trigger === 'decided') && register === null) return null;
    const own = register === null ? null : shape(register);
    if (register !== null && own === null) return null;
    const ctx = evalContext(batch);
    const typed = (type: 'text' | 'decimal' | 'bool'): Schema => ({
      ...(own ?? { register: 'vars' }),
      fields: { ...Object.fromEntries([...answers].map((a) => [a, { type }])), ...(own?.fields ?? {}) } as Schema['fields'],
    });
    const schemas = [typed('text'), typed('decimal'), typed('bool')];
    for (const { cond, at } of conditions) {
      const [first, ...rest] = schemas.map((schema) => predicateOf(cond, schema, ctx).bad.filter((b) => b.code !== 'REF_UNKNOWN'));
      const same = (a: Refusal, b: Refusal) => a.code === b.code && a.fix === b.fix && a.at === b.at;
      const certain = first!.find((b) => rest.every((other) => other.some((o) => same(b, o))));
      if (certain) return { ...certain, fix: `${id} cannot read its condition at ${at}: ${certain.fix}`, at: `${at}.if` };
    }
    return null;
  }

  /** The list of the rule a `decided` trigger answers, from the batch or the record, or `null` where it names none. */
  function askedOn(rule: FlowDecl, batch: readonly Declaration[]): string | null {
    const about = (rule.on as { decided?: { about?: unknown } } | undefined)?.decided?.about;
    if (typeof about !== 'string' || !about.startsWith('rule.')) return null;
    const mine = batch.find((d) => d.id === about);
    let asker: unknown = mine?.body;
    if (mine === undefined) {
      const row = heldRow(about);
      try {
        asker = row ? JSON.parse(row.body) : undefined;
      } catch {
        return null;
      }
    }
    return asker !== null && typeof asker === 'object' ? subjectOf(asker as FlowDecl) : null;
  }

  /** A `where` read against the register it filters: `null` when it can be read, the refusal when not. */
  function unreadWhere(id: string, where: unknown, schema: Schema, batch: readonly Declaration[] = []): Refusal | null {
    const said = predicateOf(where as Predicate | string, schema, evalContext(batch));
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
    /* A `steps:` BODY IS THE AUTOMATION LINT'S, WHOLE. This function is reached only for a body with a top-level
       `register:`, and for one with `steps:` it answered first with "does not say what it would then do": a sentence
       about `then:`, which that body was right to leave out, in front of `flow-lint.ts`'s sentence about the
       `register:` it should move into `on:`. Every check below is about `then:`, and the lint walks `steps:` itself. */
    if ((rule as { steps?: unknown }).steps !== undefined) return null;

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
          fix: `${id}: create has no bound. A generator with no ceiling fills your BrainDog.`,
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

  /* THE QUESTION'S SHAPE IS `ListQuery` IN `parts.ts`, with the reasons for each of its keys, so an extension handed
     `list` and this function read one type. */
  /* `hide` IS THE FIELDS OF THIS LIST HIDDEN FROM THE CALLER: her own filter and order are read
     against the list less them, so naming one is `FIELD_UNKNOWN` as a field the list does not have is, and no filter or
     sort can halve its way to a value. The grant's own rule is still read against the whole list. */
  function list(q: ListQuery, grant?: Json, hide?: readonly string[]): Result<Listed> {
    const barred = schemaRefusal(state);
    if (barred) return barred;
    if (!registers.has(q.register))
      return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });
    const hidden = new Set(hide ?? []);
    /* A LIST'S OWN ORDER WHEN THE READ NAMES NONE, so the sorted path below sorts and pages by it and its
       cursor comes back to a read that names no order too. The Ledger by its day, newest first, where it came back by
       last change and opened on 13 July. NOT BY A FIELD HIDDEN FROM HER, whose order would say how its values stand. */
    const own = registers.get(q.register)!.order;
    if (!q.order?.length && own !== undefined && !hidden.has(own.field)) q = { ...q, order: [{ field: own.field, dir: own.dir ?? 'asc' }] };

    /* A HOP FROM A READ GOES ONLY WHERE THE READER MAY READ (`hopSchemaOf`): the record's `reads` says no to a list
       its caller may not open or sees narrowed. A declared page's read passes no `reads`; reach checked its lists. */
    const whole = readerSchemaOf(q.hops ?? q.reads)(q.register)!;
    const schema: Schema = hidden.size === 0 ? whole : { ...whole, fields: Object.fromEntries(Object.entries(whole.fields).filter(([id]) => !hidden.has(id))) };
    const said = predicateOf(q.where, schema, q.reads === undefined ? evalContext([], undefined, q.reader) : { ...evalContext([], undefined, q.reader), reads: q.reads });
    if (said.bad.length) return { ok: false, refusal: said.bad[0]! };

    /* A PREDICATE THAT COULD NOT BE READ RUNS NOTHING. Returning the register would be a list that
       looks filtered and is not, which is the one failure a declarative surface must not have —
       especially when the thing writing most predicates is an agent that cannot see the screen. */
    /* AND THE CALLER'S GRANT, when theirs is narrowed to the rows matching one `where` (`CallContext.wheres`): the page,
       its cursor and `matched` all come from the one clause, so a narrowed member is never told how many rows they
       cannot see. */
    /* THE GRANT FROM THE KEPT COMPILE when it compiles against the list's own schema, as every read with no hop does. */
    const c = narrowed(compile(said.predicate, schema), grant === undefined ? null : q.hops === undefined && q.reads === undefined ? ruleCompiled(q.register, grant) : ruleOf(grant, whole, evalContext()));
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
    /* NEWEST MADE FIRST, A LIST THAT DECLARES NO ORDER, where it was last changed first and an edit moved
       an entry to the top. */
    let sort = 'ORDER BY created_at DESC, id DESC';
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
          'That cursor pages the list newest made first, so it cannot page a sorted list. Start the sorted list from its first page.',
          { at: 'cursor' },
        );
      const parts: string[] = [];
      for (const o of q.order) {
        if (!Object.hasOwn(schema.fields, o.field) && !isColumn(o.field))
          return no('FIELD_UNKNOWN', `${q.register} has no field called ${o.field}.`, {
            at: 'order',
            allowed: addressable(schema),
          });
        /* A FIELD WORKED OUT AT READ HAS NOTHING STORED TO SORT BY, so `where` refuses it in the filter's words. */
        const worked = derivedFault(schema, o.field);
        if (worked) return { ok: false, refusal: worked };
        const dir = o.dir === 'asc' ? 'ASC' : 'DESC';
        /**
         * AN ENUM SORTS BY ITS POSITION IN `values`, THE ORDER IT WAS DECLARED IN, and it sorted A to Z. By the label
         * where it had one and by the stored word where it did not, so `tasks.priority`, declared `urgent, high, normal,
         * low`, answered High, Low, Normal, Urgent ascending, and `tasks.state`, which labels two of its seven values,
         * put Later between Dropped and Open.
         *
         * THIS IS THE OWNER'S CALL, TAKEN AS THE DEFAULT, AND IT IS REVERSIBLE. A to Z matched
         * the words in the column; declared order matches the order the author wrote them in, which for a priority or a
         * lifecycle is the order a reader means. Going back is this one expression and `compareRows` in
         * `apps/web/src/lib/record/api.ts`; nothing stored changes either way, because the column keeps the id.
         *
         * THE LABELS DO NOT ENTER INTO IT, since they are drawn in the same order. A missing value stays `NULL`, so it
         * sorts last as every empty value does below; a word outside `values` sorts after every declared one. The
         * expression is a sort key like any other, so the cursor carries the position and the pages stay gap-free.
         */
        const field = Object.hasOwn(schema.fields, o.field) ? schema.fields[o.field] : undefined;
        const declared = field?.type === 'enum' && field.values?.length ? field.values : null;
        const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;
        const at = fieldSqlIn(schema, o.field);
        const expr = declared
          ? `(CASE WHEN ${at} IS NULL THEN NULL ${declared.map((v, i) => `WHEN ${at} = ${quote(v)} THEN ${i}`).join(' ')} ELSE ${declared.length} END)`
          : at;
        /* ONE RULE IN BOTH ENGINES (`apps/web/src/lib/record/api.ts` `compareRows`). MONEY GROUPS BY CURRENCY, THEN AMOUNT:
           there is no order between two currencies, and by amount alone GBP 50 sat between two dollar figures. TEXT SORTS
           WITHOUT REGARD TO CASE, the stored text breaking a tie, so a mixed-case column reads in one order here and in the
           sample. Every key is also a cursor key, compared with the same collation, so the pages stay gap-free. */
        const type = field?.type;
        /* A POSITION IS A NUMBER, so the enum's case-folded twin key is left off: it would be the same integer twice,
           carried in every cursor. */
        const exprs =
          type === 'money'
            ? [`json_extract(fields, '${jsonPath(o.field)}.currency')`, expr]
            : declared
              ? [expr]
              : type !== undefined && TEXT_SORTED.has(type)
                ? [`(${expr} COLLATE NOCASE)`, expr]
                : [expr];
        for (const e of exprs) {
          /* AN EMPTY VALUE GOES LAST, IN EITHER DIRECTION. SQLite puts `NULL` first ascending, so a table sorted by an optional
             day led with every row that has none; the sample put them last both ways, and last is the one a reader wants.
             DESCENDING IT ALREADY PUTS THEM LAST, so the first key is left off there: it is the same order, and it is what let
             the day index answer a ledger's newest page, which sorted 20,000 rows for fifty (9 ms to under 1). */
          parts.push(dir === 'DESC' ? `${e} DESC` : `${e} IS NULL, ${e} ${dir}`);
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

    /* THE LIST BY ITS ID AS A LITERAL (`onList`), so a partial index on a field of it answers a narrowed read. */
    const on = onList(q.register);
    const [at, afterId] = (sortedCursor ? '' : cursorText).split('|');
    /* A CURSOR THIS RECORD DID NOT MINT IS REFUSED, AS THE SORTED ONE ALREADY WAS. `cursor=junk` compared
       `updated_at < 'junk'`, which every ISO instant is, so the answer was the first page again with a
       cursor of its own: a client paging on it walked the list twice and could not tell. */
    if (!sortedCursor && cursorText !== '' && !(afterId !== undefined && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at ?? '') && afterId !== ''))
      return no('VALUE_MALFORMED', 'A cursor is the one the page above answered with. Start from the first page.', { at: 'cursor' });
    /* THE NEWEST PAGE OF A LONG LIST SORTED BY ITS OWN INDEXED DAY (`sortIndexOf`), from that index and not by sorting every
       row: SQLite has no counts to know it, and on 20,000 rows it searched by list and sorted, 6 ms for fifty against 0.05. The
       order is the `ORDER BY`, whichever way the rows are reached. A filter that may be able to use another index is left to
       choose, and an index that is not there falls back to what was asked. */
    const indexed = !sortedCursor && !at && deleted !== '' ? sortIndexOf(q.register, q.order?.[0], c.sql) : null;
    const firstPage = (from: string) =>
      sql.all<Record<string, unknown>>(`SELECT ${COLUMNS} FROM ${from} WHERE ${on.sql}${deleted} AND (${c.sql}) ${sort} LIMIT ?`, ...on.params, ...c.params, limit + 1);
    const pageFromIndex = (): Record<string, unknown>[] => {
      if (indexed === null) return firstPage('entry');
      try {
        return firstPage(`entry INDEXED BY ${indexed}`);
      } catch {
        missingSortIndexes.add(indexed);
        return firstPage('entry');
      }
    };
    const page = sortedCursor
      ? sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE ${on.sql}${deleted} AND (${c.sql})${after} ${sort} LIMIT ?`,
          ...on.params,
          ...c.params,
          ...afterParams,
          limit + 1,
        )
      : at
      ? sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE ${on.sql}${deleted} AND (${c.sql}) AND (created_at < ? OR (created_at = ? AND id < ?)) ${sort} LIMIT ?`,
          ...on.params,
          ...c.params,
          at,
          at,
          afterId ?? '',
          limit + 1,
        )
      : pageFromIndex();

    /* The MATCHED count is the whole answer, not the page: a reader who cannot see how many rows a
       filter admitted cannot tell a short list from a narrow one. */
    const matched = Number(
      sql.one<{ n: number }>(
        `SELECT count(*) AS n FROM entry WHERE ${on.sql}${deleted} AND (${c.sql})`,
        ...on.params,
        ...c.params,
      )?.n ?? 0,
    );

    const rows = page.slice(0, limit).map(hydrate);
    const more = page.length > limit;
    const last = rows.at(-1);
    /* THE PAGE LEAVES WITH ITS WORKED-OUT FIELDS FILLED, after the cursor's row is chosen, and a `via` read
       through the reader's own sight: the lists she reads whole, as a hop from her filter is held. */
    const decl = registers.get(q.register)!;
    const out = decl.fields.some((f) => f.derived === true && f.derive !== undefined) ? withDerived(rows, decl.fields, sightOf(q.hops ?? q.reads)) : rows;
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
        : `${last.created_at}|${last.id}`;
    return ok({ rows: out, matched, cursor: paging });
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
    /** Who is asking, so rows kept private to somebody else are neither the row asked about nor one that points at it. */
    viewer?: string | undefined;
    /** The caller's grant (`wheres`): a row its rule leaves out is neither the row asked about nor one that points at it. */
    grant?: Readonly<Wheres> | undefined;
    /** The fields hidden from the caller, by list: a ref she cannot see points at nothing she is shown. */
    hide?: Readonly<Record<string, readonly string[]>> | undefined;
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
    /* A PRIVATE ROW READS AS ABSENT, as `get` answers it. */
    if (!row) return ok({ to, from: [], cursor: null });
    /* AND A ROW THE CALLER'S RULE LEAVES OUT IS ANSWERED AS ONE THAT IS NOT THERE (leak matrix G3): it answered its id. */
    if (!admittedIds(q.register, [row.id], q.grant, q.viewer).has(row.id)) return ok({ to: { register: q.register, seq: null, id: null }, from: [], cursor: null });

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
        .filter((f) => f.type === 'ref' && f.to === q.register && !f.retired && named.test(f.id) && !(q.hide?.[decl.id] ?? []).includes(f.id))
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

      /* THE POINTING ROWS UNDER THE SAME GRANT AND THE SAME PRIVATE ROWS, list by list, as `list` would read each. */
      const admit = admitClause(pair.register, q.grant, q.viewer);
      const where = `register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${pair.field}') = ? AND id <> ?${admit === null ? '' : ` AND (${admit.sql})`}`;
      const who = admit === null ? [] : admit.params;
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
            ...who,
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
            ...who,
            want,
          );
      if (page.length === 0) continue;

      const rows = page.slice(0, limit - taken).map(hydrate);
      if (rows.length > 0) {
        const matched = Number(
          sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where}`, pair.register, row.id, row.id, ...who)?.n ?? 0,
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
   * EACH LIST'S OWN VERSION, for a reading held while the lists it read stand (`held-readings.ts`): the newest line of
   * the log about one of its rows, walked once per line as it is written, and what its rows add up to (`listsStamp`).
   * Beside them, what moves every list: the newest line about no row (a pack's settings, the record's zone), the
   * declarations, the add-ons on, the rows kept private and the declaration revision.
   *
   * A LINE THAT IS ONLY A CHANNEL HAVING RUN (`pull` on a declaration) or a question moves no list: what a run wrote has
   * lines of its own, and the questions are read past every list. A log that went back (a write rolled back and another
   * in its place) moves everything, as does the first look.
   */
  type ListsSeen = { head: string; whole: string; top: number; id: string; base: number; other: number; tops: Map<string, number> };
  let listsSeen: ListsSeen | null = null;
  const listsNow = (): ListsSeen => {
    const h = sql.one<{ r: number | null; id: string | null; e: number | null; d: number | null; p: string | null; v: number | null; n: number | null }>(
      `SELECT (SELECT rowid FROM event ORDER BY rowid DESC LIMIT 1) AS r, (SELECT id FROM event ORDER BY rowid DESC LIMIT 1) AS id,
              (SELECT max(rowid) FROM entry) AS e, (SELECT max(rowid) FROM declaration) AS d,
              (SELECT group_concat(id || ':' || coalesce(disabled_at, ''), ',') FROM pack) AS p,
              (SELECT max(rowid) FROM entry_private) AS v, (SELECT count(*) FROM entry_private) AS n`,
    );
    const top = Number(h?.r ?? 0);
    const id = h?.id ?? '';
    const whole = JSON.stringify([h?.d ?? null, h?.p ?? null, h?.v ?? null, h?.n ?? null, revision]);
    const head = JSON.stringify([top, id, h?.e ?? null, whole]);
    const was = listsSeen;
    if (was !== null && was.head === head) return was;
    if (was !== null && was.top === top && was.id === id) return (listsSeen = { ...was, head, whole });
    /* A LOG WHOSE NEWEST LINE WAS WRITTEN AGAIN (a run's steps folded into one line) is walked from the line before it. A
       log that went back, or one never looked at, moves everything. */
    const kept = was === null || was.top === 0 || top < was.top ? null : sql.one<{ id: string }>('SELECT id FROM event WHERE rowid = ?', was.top)?.id === was.id ? was.top : sql.one<{ r: number | null }>('SELECT max(rowid) AS r FROM event WHERE rowid < ?', was.top)?.r ?? null;
    if (was === null || kept === null) return (listsSeen = { head, whole, top, id, base: top, other: top, tops: new Map() });
    const tops = new Map(was.tops);
    let other = was.other;
    for (const line of sql.all<{ r: number; k: string; tk: string | null; g: string | null }>(
      `SELECT e.rowid AS r, e.kind AS k, e.target_kind AS tk, n.register AS g
         FROM event e LEFT JOIN entry n ON e.target_kind = 'entry' AND n.id = substr(e.target, 7)
        WHERE e.rowid > ? ORDER BY e.rowid`,
      kept,
    )) {
      if (line.g !== null) tops.set(line.g, line.r);
      else if (!(line.k === 'pull' && line.tk === 'declaration') && line.tk !== 'suggestion') other = line.r;
    }
    return (listsSeen = { head, whole, top, id, base: was.base, other, tops });
  };
  /**
   * HOW MUCH A LIST'S ROWS WEIGH, so a row put right in place, with no line and its version and time unmoved (a repair),
   * still moves its list: the bytes of every row's fields, which SQLite reads off the row's head without its text.
   * `octet_length` is SQLite 3.43's; an older one counts the characters instead, which reads the text.
   */
  let weight: string | null = null;
  const weighed = (): string => {
    if (weight !== null) return weight;
    try {
      sql.one("SELECT octet_length('') AS w");
      weight = 'total(octet_length(fields))';
    } catch {
      weight = 'total(length(fields))';
    }
    return weight;
  };
  /**
   * The version of the lists named, as a held reading is stamped. `once` is one read's own: within it nothing is
   * written, so the log and each list are asked once for all its figures.
   */
  type Stamps = { seen?: ListsSeen; rows: Map<string, string> };
  const listsStamp = (lists: readonly string[], once: Stamps = { rows: new Map() }): string => {
    const seen = (once.seen ??= listsNow());
    const each = lists.map((list) => {
      let rows = once.rows.get(list);
      if (rows === undefined) {
        rows = JSON.stringify(Object.values(sql.one<Record<string, unknown>>(`SELECT max(rowid) AS r, count(*) AS n, count(deleted_at) AS d, total(version) AS v, max(updated_at) AS u, ${weighed()} AS w FROM entry WHERE register = ?`, list) ?? {}));
        once.rows.set(list, rows);
      }
      return [list, seen.tops.get(list) ?? 0, rows];
    });
    return JSON.stringify([seen.base, seen.other, seen.whole, each]);
  };

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
    opts: { limit?: number; open?: boolean; grant?: Readonly<Wheres> | undefined; viewer?: string | undefined } = {},
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
    /* AND HELD TO THE CALLER'S GRANT AND THE ROWS KEPT PRIVATE FROM THEM (leak matrix G2), as `list` holds a read: the
       brief read every row here, so an agent was told of other people's private rows and of rows outside its rule. */
    const admit = admitClause(register, opts.grant, opts.viewer);
    const read = (where: string, ...params: string[]): Entry[] =>
      sql
        .all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND ${where}${open}${admit === null ? '' : ` AND (${admit.sql})`}
           ORDER BY e.updated_at DESC, e.id DESC LIMIT ?`,
          register,
          ...params,
          ...(open ? done : []),
          ...(admit === null ? [] : admit.params),
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
   * THE KEYCHAIN DOOR, the record's half, and INTERNAL: no route reaches it.
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
    if (!decl) return no('REGISTER_UNKNOWN', `There is no register called ${args.register}.`, { at: 'register', allowed: [...registers.keys()] });
    const sealable = decl.fields.filter((f) => f.type === 'secret' && !f.retired).map((f) => f.id);
    if (!sealable.includes(args.field))
      /* `field` AND NOT THE FIELD'S NAME. `at` addresses a place in what the caller sent, which is
         what lets a screen put the message on the control that carries the bad value. This passed
         the value, so a client had nothing to bind it to and a reader could not tell an address
         from a datum. The name is already in the sentence. */
      return no('FIELD_UNKNOWN', `${args.register} has no secret field called ${args.field}.`, { at: 'field', allowed: sealable });

    let bound: GrantRow | undefined;
    const bind = (actor: string, held: string | null): Result<GrantRow> => {
      const live = held !== null && getGrant(sql, held)?.revoked_at === null;
      const out = bindGrant(sql, keychainDeps(actor), { ...args.grant, ...(live && held !== null ? { id: held } : {}) }, transaction);
      if (out.ok) bound = out.value;
      return out;
    };
    const out = write(args.register, args.ref ?? null, args.fields ?? {}, w, { seal: { field: args.field, bind } });
    if (!out.ok) return out;
    /* A replayed deposit binds nothing again, and answers with the grant the row already names. */
    const grant = bound ?? getGrant(sql, String(out.value.fields[args.field] ?? ''));
    return grant ? ok({ entry: out.value, grant }) : no('OUT_OF_BOUNDS', `There is no grant behind ${args.field}.`, { at: args.field });
  }

  /**
   * A key answers to the name its row has now. In the write's transaction, after the row is stored.
   *
   * THE ROW AND THE GRANT EACH HELD A NAME, and only a deposit wrote the grant's. A key put away as
   * "sketchpad-metrics (vault)" and renamed on the Keys screen to "sketchpad-metrics" listed under the new name
   * everywhere a person looks, while every lookup an action makes (`keyNamed`, by the grant's label) still knew it by
   * the old one: accepting a poll that names the key was refused "Add the key called "sketchpad-metrics" to the
   * keychain", for a key the keychain listed. So whenever a row whose secret field holds a live grant is written, the
   * grant takes the row's title. Any write heals a row renamed before this existed.
   *
   * ONLY THE NAME. What a key opens is the host it is held to, and a row edit never moves that (`pinHost`). A name
   * this write gives is no reach a writer lacked: depositing a key under any label was always theirs. A title the
   * keychain would not take as a label, empty or past its 120 characters, leaves the grant's as it is.
   */
  function keyNamedAsRow(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl || entry.deleted_at !== null) return;
    const title = entry.fields[decl.title];
    const name = typeof title === 'string' ? title.trim() : '';
    if (name === '' || name.length > 120) return;
    for (const f of decl.fields) {
      if (f.type !== 'secret' || f.retired) continue;
      const held = entry.fields[f.id];
      if (typeof held === 'string' && held !== '') sql.exec('UPDATE grant SET label = ? WHERE id = ? AND revoked_at IS NULL AND label <> ?', name, held, name);
    }
  }

  /* ── the write path ──────────────────────────────────────────────────── */

  function write(register: string, ref: string | null, patch: Patch, w: WriteContext, door: Door = {}): Result<Entry> {
    const barred = schemaRefusal(state);
    if (barred) return barred;

    /* THE ROWS THIS WRITER MAY WRITE GO ON THE DOOR AND OFF THE CONTEXT, so the pre-image check below reads them and
       the rules pass's writes, handed `w`, never hold another list's rows to them. */
    const { within, via, ...rest } = w;
    if (within !== undefined || via !== undefined) {
      w = rest;
      door = { ...door, ...(within === undefined ? {} : { within }), ...(via === undefined ? {} : { via }) };
    }
    /* A SEALING WRITE BINDS A GRANT PART-WAY THROUGH ITS PERSIST STEP, so a refusal after that rolls
       back to a savepoint rather than trusting that nothing was written before it. AND A WRITE HELD TO ITS WRITER'S
       ROWS is asked once more before it commits, by the same clause, whether the row it leaves is
       still one of them: a create outside them, or an edit that moves the row out, is unwound whole, the rules pass
       with it. */
    const out =
      door.seal || within !== undefined || via !== undefined
        ? attempt(sql, transaction, () => {
            const made = writing(register, ref, patch, w, door);
            if (made.ok && (within === undefined || admits(register, within, made.value.id))) {
              /* THE AUDIT'S LINE FOR THIS WRITE, in its transaction: which shares admitted the row it leaves (§2.10). */
              if (via !== undefined) accessVia(register, made.value, via);
              return made;
            }
            if (!made.ok) return made;
            return no<Entry>(
              'FORBIDDEN',
              ref === null ? `That would put it outside what you can edit. ${askOwner()}` : `That would move it out of what you can edit. ${askOwner()}`,
              { at: ref === null ? 'fields' : 'patch' },
            );
          })
        : writing(register, ref, patch, w, door);
    /* THE ONE WRITE A REFUSAL MAKES. Ten of the same refusal in a month across three days means the
       DECLARATION is wrong rather than one caller having a bad afternoon — and a record that threw
       its refusals away could never notice the difference. It is outside the transaction the write
       rolled back, or the observation would roll back with it.

       A CONFLICT IS NOT COUNTED. It is not the declaration being wrong; it is two people editing at
       once, and a detector that counted it would propose changing a field because a record is busy. */
    if (refused(out) && out.refusal.at)
      observe(sql, clock.now(), [{ kind: 'write.refused', subject: `${register}.${out.refusal.at}:${out.refusal.code}` }]);
    /* A ROW DELETED, BROUGHT BACK OR MERGED TAKES BACK EVERY OPEN QUESTION ABOUT IT THAT NO LONGER APPLIES (`settleAbout`),
       now, saying why: a "same person?" card about somebody just deleted leaves Needs you at once. */
    if (out.ok && !door.decided && !door.merge && (patch.deleted_at !== undefined || patch.merged_into !== undefined)) {
      const row = out.value;
      const prefix = registers.get(row.register)?.seq_prefix;
      const names = [row.id, ...(row.seq === null ? [] : [`${row.register}#${row.seq}`, ...(prefix && prefix !== '#' ? [`${prefix}${row.seq}`] : [])])];
      settleAbout(governDeps(), names, clock.now());
    } else if (out.ok && ref !== null && !door.decided) settleRuleAsks(out.value);
    return out;
  }

  /**
   * Take back each open question a rule asked about `entry` whose `when` the row no longer meets (`stillMatches`): the
   * reply was sent, the bill was marked paid, the mail is no longer a receipt. Asked on every update of a row a rule
   * asked about, with the line that says why. A rule taken out or one that cannot be read leaves its question alone.
   */
  function settleRuleAsks(entry: Entry): void {
    if (entry.seq === null) return;
    const open = sql.all<{ id: string; opened_by: string }>(
      "SELECT id, opened_by FROM suggestion WHERE status = 'open' AND opened_by LIKE 'rule:%' AND body_kind = 'options' AND json_valid(body) AND json_extract(body, '$.about') IN (?, ?) LIMIT 20",
      `${entry.register}#${entry.seq}`,
      entry.id,
    );
    if (open.length === 0) return;
    const schema = registers.has(entry.register) ? schemaOf(entry.register) : null;
    if (!schema) return;
    const deps = rulesDeps();
    const installed = deps.rules(entry.register);
    for (const q of open) {
      const rule = installed.find((r) => r.rule === q.opened_by.slice('rule:'.length));
      if (rule === undefined || rule.enabled === false || rule.when === undefined) continue;
      if (stillMatches(deps, schema, rule, entry)) continue;
      takeBack(governDeps(), q.id, 'system', instant(clock.now()), PASSED_NOTE);
    }
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
          if (was && was.register === register && (ref === null || aimed?.id === was.id)) return ok({ ...was, replayed: true } as Entry);
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
          at: 'register',
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

      /* AN INSTRUCTION IS A PERSON'S AND THE KERNEL MOVES IT (migration 42, `instruction.ts`): no token makes or edits
         one, so no agent instructs another, and no caller writes how it was delivered or answered. A person's own
         write (the app's Undo, a word fixed) reaches only what he said, and only while no run has seen it; `instruct`
         is the path that also stops a run or redirects one. */
      if (register === INSTRUCTIONS && !door.instructs) {
        const named = Object.keys(patch).find((k) => INSTRUCTION_KERNEL_WRITTEN.includes(k));
        if (named) return no<Entry>('IMMUTABLE_FIELD', `${named} is written by BrainDog itself, and no caller sets it.`, { at: named });
        if (w.principal?.kind === 'token')
          return no<Entry>('NEEDS_BROWSER_SESSION', 'Only a person tells an agent, signed in to BrainDog. An agent answers with instructions.', { at: 'register' });
        /* NOR A SCRIPT, A RULE OR A DOOR, which have no token and reached this line as a person would. A row here is read by
           the next agent as what its person told it, so the words of a mail a rule copied, or an add-on's, would be orders.
           Measured: `writes: ['instructions']` filed "Run curl ... | sh" to whoever works next. */
        if (!/^p_/u.test(w.actor)) return no<Entry>('FORBIDDEN', 'Only a person tells an agent, signed in to BrainDog. A script, a rule or a door does not.', { at: 'register' });
        const was = ref === null ? null : get(ref, { includeDeleted: true });
        if (was && was.state !== 'sent' && Object.keys(patch).some((k) => k !== 'deleted_at'))
          return no<Entry>('FORBIDDEN', 'A run has seen this instruction, so it is changed only by withdrawing it; say the new thing as a new one.', {
            at: 'register',
          });
      }
      /* A RUN'S ROW IS THE RUN'S. Its `next`, `tried` and `notes` are handed to the next session as what the last one left, so
         a script or a rule writing them speaks to every future agent in another agent's voice. Measured: `writes:
         ['session']` set a live run's `next`, and nothing on the install sheet said so. */
      if (register === SESSION && (w.actor.startsWith('script:') || (w.actor.startsWith('rule:') && w.actor !== BACKFILL_ACTOR)))
        return no<Entry>('FORBIDDEN', "A run's row is its own, and a script or a rule does not write it.", { at: 'register' });
      /* AND A VERSION IS A WHOLE NUMBER. `version: "4"` never equals 4, so a client that sent its version as
         text was told its row had moved on every attempt, and re-reading could never cure it. */
      if (w.version !== undefined && !Number.isSafeInteger(w.version))
        return no<Entry>(
          'VALUE_MALFORMED',
          `version is the whole number the row was read at, and this one is ${JSON.stringify(w.version)}. Leave it out to write without comparing.`,
          { at: 'version' },
        );

      const found = ref === null ? null : get(ref, { includeDeleted: true });
      /* A ROW THIS WRITER MAY NOT WRITE IS A ROW THAT IS NOT THERE: the same code and the same
         sentence, at the same step, so no refusal proves a row exists. */
      const current = found !== null && door.within !== undefined && found.register === register && !admits(register, door.within, found.id) ? null : found;
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

      /* `tags` IS WRITABLE ON EVERY LIST (`withTags`), so a rule's `tag:` on a list that never declared it lands, and
         the history below writes it as `tag` and `untag` rows because it reads the type off this map. */
      const known = new Map(withTags(decl.fields).filter((f) => !f.retired).map((f) => [f.id, f]));
      const merged: Record<string, Json> = { ...(current?.fields ?? {}) };
      const touched: string[] = [];

      /* `by: decide` ON A FIELD: once the row is made, only an accepted proposal changes it, from
         every caller, the owner included. `FORBIDDEN` with the remedy in the sentence, as the scope
         rules give it, because the repair is the same: propose it, and the owner's press applies it. */
      const decidedOnly = (key: string): Result<Entry> =>
        no<Entry>('FORBIDDEN', `${key} changes only by an accepted proposal. Propose the change, and it is applied when the owner accepts it.`, {
          at: key,
        });

      const look = {
        refId: (reg: string, seq: number) => bySeq(reg, seq)?.id ?? null,
        prefixed,
        deleted: (reg: string, seq: number) => Boolean(bySeq(reg, seq, true)?.deleted_at),
        grantExists: (id: string) => Boolean(sql.one('SELECT 1 AS x FROM grant WHERE id = ?', id)),
      };
      /**
       * The lookups for one field of the patch: a deleted row this field already points at is still found by its name.
       *
       * A ROW SENT BACK AS IT WAS READ WAS REFUSED FOR A VALUE IT HELD. A task read while its project was live answers
       * `thing: things#5`; the project is deleted, and the same fields back through `update` were refused `thing names
       * things#5, and there is no such row`, the same through a rowset at the owner's accept.
       * The row id for the same target was taken, so the refusal was of the name and not of the ref.
       *
       * ONLY WHAT THE FIELD ALREADY HOLDS, and not every deleted row. A new ref to a deleted row by its name stays
       * refused, now saying it was deleted, because pointing a row at a project somebody removed is a mistake worth a
       * sentence, and a round trip that changes nothing is not.
       */
      /* AND A LIST THE WRITER CANNOT READ HOLDS NO ROW FOR HER, live, deleted or held, so `coerce` gives the one sentence
         it gives for a number nobody was ever issued (`WriteContext.reads`). NOT EVEN WHAT THE FIELD ALREADY HOLDS: her
         reads hand a ref into a hidden list back as the row id (the MCP's `spokenRefs` names only rows she can `get`),
         which `coerce` takes as it is, so the exception above has no round trip to keep here, and kept it would confirm
         the number of the hidden row her own row points at, one guess per write. */
      const hidden = (reg: string): boolean => w.reads !== undefined && !w.reads(reg);
      const lookAt = (key: string) => {
        const held = current?.fields[key];
        const holds = (id: string) => (Array.isArray(held) ? held.includes(id) : held === id);
        return {
          ...look,
          refId: (reg: string, seq: number) => {
            if (hidden(reg)) return null;
            const row = bySeq(reg, seq, true);
            return row && (!row.deleted_at || holds(row.id)) ? row.id : null;
          },
          deleted: (reg: string, seq: number) => !hidden(reg) && look.deleted(reg, seq),
          /* A BARE AMOUNT TAKES ITS ACCOUNT'S CODE (`currency_from`): the link this write sends, else the one
             the row holds, read as the writer may read it. A list she cannot read gives nothing, as `refId` does. */
          currencyOf: (): string | null => {
            const field = known.get(key);
            const [link, target] = String(field?.currency_from ?? '').split('.');
            if (!link || !target) return null;
            /* A FIXED CODE THE ROW ALREADY HOLDS IS THE ONE IT KEEPS: a dollar row on a pound account, its number
               corrected with no code, was refused `CURRENCY_FIXED` for the account's code the write never sent. */
            const own = field?.currency_fixed === true ? (current?.fields[key] as { currency?: unknown } | undefined)?.currency : undefined;
            if (typeof own === 'string') return own;
            const named = patch[link] !== undefined ? patch[link] : current?.fields[link];
            const row = typeof named === 'string' ? get(named) : null;
            if (!row || hidden(row.register)) return null;
            const money = row.fields[target] as { currency?: unknown } | undefined;
            return typeof money?.currency === 'string' ? money.currency : null;
          },
        };
      };

      /* Defaults first, and on a create only: a default is what a row starts as, not what it
         returns to when somebody clears a field.

         AND THROUGH STEP 3, LIKE EVERY OTHER VALUE, which this assigned straight into `merged` and
         did not. A declaration was the one writer in the record that reached `fields` without being
         coerced, so a `url` default of `javascript:` became a link on a page, a `money` default of a
         bare number became an amount with no currency, and `gbp` from a declaration and `GBP` from a
         caller sat in one column as two values that no predicate matched together. None of it was
         reachable from a caller sending the same thing, which is what made it an asymmetry rather
         than a rule: the fix is to delete the asymmetry, not to write the rule down.

         K2 COMES WITH IT, AND IT IS TESTED BEFORE COERCION rather than after, which is where the
         patch loop tests it too: `null` is absent, and every type refuses it as a value. `isAbsent`
         used to live only inside that loop, so clearing a field removed the key and defaulting it to
         the same value added one, and `""` was a fourth state beside the three the kernel says are
         one. A default that is absent leaves the field absent, and a `required` field defaulted to
         nothing is `REQUIRED_MISSING` rather than quietly filled. */
      /* A RUN CARRIED IN KEEPS THE DAY IT WAS LAST SEEN THERE (`run-carried.ts`). Read before the defaults and
         the field loop, which refused its `last_seen` and lost the whole run: on a create or a run never heard from here,
         the time comes out of the patch as `seen_before`, stamped below, and a step left in another session drops. */
      const carried = register === SESSION ? carriedIn(patch, current) : null;
      if (carried && !carried.ok) return carried;
      if (carried) patch = carried.value.patch;
      if (!current)
        for (const f of decl.fields) {
          if (f.default === undefined || patch[f.id] !== undefined || f.derived) continue;
          if (isAbsent(f.default)) continue;
          const out = coerce(f, f.default, look);
          /* THE SENTENCE NAMES THE DECLARATION, because `coerce` writes to whoever sent the value and
             nobody sent this one. It refuses every create that leaves the field out, and the repair
             is in the register rather than in the write. */
          if (!out.ok)
            return no<Entry>(out.refusal.code, `${register}.${f.id} has a default BrainDog cannot store. ${out.refusal.fix}`, { at: f.id });
          if (!isAbsent(out.value)) merged[f.id] = out.value;
        }

      /* WRITTEN ONCE BY THE ADD-ON (`once`): its update leaves the field as the row holds it, set or empty,
         and writes the rest. An existing row only: the row an add-on makes takes every field it was given. */
      const kept = new Set<string>(w.pack === true && current ? (decl.once ?? []) : []);
      /* OUT OF THE PATCH, NOT ONLY PAST THE LOOP: a field read beside another (the account a `currency_from` amount
         takes its code from) is then read from the row, as the value that stands. A derived field stays in, to be
         refused below as it is for anyone. */
      if (kept.size) patch = Object.fromEntries(Object.entries(patch).filter(([key]) => !kept.has(key) || known.get(key)?.derived === true));
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'deleted_at') continue;
        if (RESERVED.has(key) || key.startsWith('_'))
          return no<Entry>('FIELD_UNKNOWN', `${key} is BrainDog's own, not a field you may write.`, { at: key });
        const field = known.get(key);
        if (!field)
          return no<Entry>('FIELD_UNKNOWN', `${register} has no field called ${key}.`, {
            at: key,
            allowed: [...known.keys()],
          });
        if (field.derived)
          return no<Entry>('IMMUTABLE_FIELD', `${key} is derived, so BrainDog works it out.`, { at: key });
        /* THE RECORD'S OWN, on the one register the kernel declares: when a run was last heard from,
           the project it resolved to, and the token that opened it. */
        if (register === SESSION && KERNEL_WRITTEN.includes(key))
          return no<Entry>('IMMUTABLE_FIELD', `${key} is written by BrainDog itself, and no caller sets it.`, { at: key });
        /* WHAT A RUN REPORTED ABOUT ITSELF (`RUN_FACTS`): its agent sets it through a token, and a person never does. */
        if (register === SESSION && RUN_FACTS.includes(key) && w.principal?.kind === 'person')
          return no<Entry>('IMMUTABLE_FIELD', `${key} is what the run reported about itself, and only its agent sets it.`, { at: key });
        /* A SECRET FIELD IS THE KEYCHAIN DOOR'S, from every caller. It names the grant a key was sealed
           into, and `depositGrant` writes it in the transaction that seals the key, so a caller naming
           a grant could only point a row at a key sealed for another. `IMMUTABLE_FIELD`, the answer a
           kernel-written field gives, because the refusal is about the field and not about who asks. */
        if (field.type === 'secret' || field.of === 'secret')
          return no<Entry>(
            'IMMUTABLE_FIELD',
            `${key} says where a key is sealed, and only the keychain writes it. Deposit the key, and BrainDog points this field at it.`,
            { at: key },
          );
        /* A MARK IS A PICTURE, NEVER A CONTROL: a project drawn as the close cross reads as a button. */
        if ((decl as { identity?: { mark?: unknown } }).identity?.mark === key && isControlMark(value))
          return no<Entry>(MARK_IS_CONTROL, MARK_IS_CONTROL_SAYS, { at: key });
        /* AND A PICTURE STAYS ONCE IT IS CHOSEN (`markFrozen`): a mark that names a glyph takes no change, and
           before the `null` branch on purpose, so it is not cleared either. One that names no glyph takes the write. */
        if (current && (decl as { identity?: { mark?: unknown } }).identity?.mark === key) {
          const frozen = markFrozen(current.fields[key], value);
          if (frozen) return no<Entry>(frozen.code, frozen.fix, { at: key });
        }
        touched.push(key);
        if (value === null) {
          if (field.immutable && current && current.fields[key] !== undefined)
            return no<Entry>('IMMUTABLE_FIELD', `${key} is set once, so it cannot be cleared either.`, { at: key });
          if (field.by === 'decide' && current?.fields[key] !== undefined && !door.decided) return decidedOnly(key);
          delete merged[key];
          continue;
        }

        const out = coerce(field, value, lookAt(key));
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
        /* THE CODE IS LOCKED AND THE NUMBER IS NOT (`currency_fixed`): an amount corrected stays in its currency. */
        const fixed = current ? currencyFixed(field, current.fields[key], out.value, key) : null;
        if (fixed) return { ok: false, refusal: fixed };
        /* Compared the way `immutable` is, so re-sending the value a row already holds is no change. */
        if (
          field.by === 'decide' &&
          current &&
          !door.decided &&
          JSON.stringify(current.fields[key] ?? null) !== JSON.stringify(isAbsent(out.value) ? null : out.value)
        )
          return decidedOnly(key);
        // Absent is one thing, not three: null, "" and [] all remove the key.
        if (isAbsent(out.value)) delete merged[key];
        else merged[key] = out.value;
      }

      /* A ROW SPLIT INTO PARTS (`parts_of`, `row-parts.ts`): checked whenever the parts or the amount they add up to is
         written, so a line whose amount changes under its parts is refused with the parts, never left out by some. */
      const split = splitOfFields(decl.fields as unknown as { id: string; type: string; parts_of?: string }[]);
      if (split && (touched.includes(split.field) || touched.includes(split.of))) {
        const parts = splitFault([...known.values()] as unknown as FieldDecl[], split, merged, decl.state, lookAt);
        if (!parts.ok) return parts;
        if (parts.value !== null) merged[split.field] = parts.value;
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
        if (register === SESSION && current && othersRun(sql, current.seq, current.fields.token_id, w.principal.token ?? null))
          return notYours<Entry>(nameOf(current.id));
      }
      const scoped = w.principal?.kind === 'token' ? scopeFieldOf(decl.fields) : undefined;
      if (scoped) {
        const home = locate().project?.id ?? null;
        if (!current && scoped.type === 'ref' && patch[scoped.id] === undefined && home !== null) merged[scoped.id] = home;
        /* AN EDIT BY AN AGENT THE OWNER LETS DO EVERYTHING WITHOUT ASKING (`widens`, set only by the record from its
           `bypassOf`) may move a row out of its project, which is otherwise his: a key kept for one project is made one
           for every project so a script can send it. Only where a row applies; a key's value is the keychain's and no
           token reaches it, switch or not. A create still starts in its run's project. */
        if ((!current || touched.includes(scoped.id)) && !(current && w.principal?.kind === 'token' && w.principal.widens === true && scoped.scope?.widen === 'person')) {
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

        /* A PATTERN A RULE'S LINK WILL RUN IS CHECKED AS IT IS WRITTEN (`rules.ts` `linkPatternFault`). A list
           says how each row matches in `<by>_by` beside `<by>`; one stored as `pattern` is run inside a later write, and
           one that can take for ever was stored and then never run, with nothing said. Asked when either is written. */
        if (value === 'pattern' && f.id.endsWith('_by')) {
          const by = f.id.slice(0, -'_by'.length);
          const said = merged[by];
          if (known.has(by) && typeof said === 'string' && (!current || touched.includes(f.id) || touched.includes(by))) {
            const fault = linkPatternFault(said);
            if (fault !== null) return no<Entry>('VALUE_MALFORMED', `The pattern ${fault}.`, { at: by });
          }
        }

        /* REQUIRED WHILE ANOTHER FIELD SAYS SO, checked when either of the two is written, for the
           reason `required` is: a row is not refused for a rule it predates. */
        const when = f.required_when;
        if (when && value === undefined && (!current || touched.includes(f.id) || touched.includes(when.field))) {
          const target = known.get(when.field);
          const is = target ? coerce(target, when.is) : null;
          if (is?.ok && JSON.stringify(merged[when.field] ?? null) === JSON.stringify(is.value))
            return no<Entry>('REQUIRED_MISSING', `${register} needs ${f.id} when ${when.field} is ${String(when.is)}.`, { at: f.id });
        }

        /* MEMBERSHIP IS THE WRITE PATH'S, AND A `list<enum>` IS STILL AN ENUM. This keyed off the
           field's own type, which is `list` and not `enum` for a `list<enum>`, so not one element
           was ever compared against `values:`. A register declaring the three ways it chases a
           debt stored a fourth, and the row read back clean. Nothing else was going to catch it:
           `coerce` recurses into the list and its `enum` case deliberately skips membership,
           because only here can the refusal carry the values a caller may send instead.

           NAMED BY ELEMENT, the way `coerce` names one, `chased[1]` and not `chased`. A field
           holding five values, one of them wrong, refused by the field's name alone sends a person
           to read all five; and a bracketed `at:` already reaches callers from this same write,
           because a malformed element returns `coerce`'s own refusal untouched.

           ONE BAD ELEMENT REFUSES THE WHOLE WRITE, as every other check in this loop does and as
           `coerce`'s list case already does on the first element it cannot read. A write that
           stored the good half of a list would be a partial write, which this path has no shape
           for: the version, the events and the row all move together or none of them does.

           AN EMPTY LIST NEVER REACHES HERE. K2 (`34 §1.3`) makes it absent, so the loop above
           deleted the key and `value` is `undefined`, which is what the field being unset means. */
        if (value !== undefined && (f.type === 'enum' || (f.type === 'list' && f.of === 'enum'))) {
          const held = Array.isArray(value) ? value : [value];
          const at = held.findIndex((one) => !f.values?.includes(String(one)));
          if (at !== -1)
            return no<Entry>('ENUM_VALUE_UNKNOWN', `${f.id} has no value ${String(held[at])}.`, {
              at: f.type === 'list' ? `${f.id}[${at}]` : f.id,
              allowed: f.values ?? [],
            });
        }

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
            'SELECT seq, id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, ?) = ? AND id <> ?',
            register,
            jsonPath(f.id),
            value as never,
            current?.id ?? '',
          );
          /* A ROW THE WRITER CANNOT READ IS NAMED BY NO COLLISION, so uniqueness is not a way to test
             whether a row exists: a list she cannot read, a row outside what she may write, or a row somebody else
             kept private (audit 31k, RK3). */
          if (clash && (hidden(register) || (door.within !== undefined && !admits(register, door.within, clash.id)) || hiddenFrom(clash.id, writerPerson(w))))
            return no<Entry>('FORBIDDEN', `That can't be added here. ${askOwner()}`, { at: f.id });
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

      /* ── a merge: a row of a list that plays `meets:` or `org:` pointed at the row it is folded into ──
         Every live row that pointed at it is pointed at the survivor, in this write's batch, so the person or the
         organisation keeps every link, the fold's delete is not refused by `delete: refuse_while_referenced` below or in
         the write that follows, and undoing the merge (`undoMerge`) puts each link back. Before the delete check, since a
         caller may fold and delete in one write. */
      const keyedHere = keyedOf(register);
      const foldField = keyedHere === undefined ? undefined : mergeFieldOf(keyedHere);
      const door_ = mergeDoor(register, current, merged, patch, touched, keyedHere, foldField, door, w.reads, writerPerson(w));
      if (door_) return { ok: false, refusal: door_ };
      /* ── somebody the owner deleted, made again (`buried`, `entities.ts`) ──
         A create carrying an address or a handle a deleted person or organisation holds is the owner's alone: he adds
         them by hand or brings the row back with Undo. An agent is refused, saying so. A script, a door or a sync is
         answered with the deleted row and nothing written, since one refusal would take back a script's whole run and
         the next run would only try again. */
      if (current === null && keyedHere !== undefined && !door.decided && !door.merge && !(w.principal?.kind !== 'token' && w.actor.startsWith('p_'))) {
        const gone = buried(sql, keyedHere, rowKeys(keyedHere, merged));
        if (gone !== null) {
          if (w.principal?.kind === 'token')
            return no<Entry>(
              'HUMAN_ONLY',
              `${keyedHere.role === 'meets' ? 'Somebody' : 'An organisation'} with that ${keyedHere.role === 'meets' ? 'address or handle' : 'domain or key'} was deleted by the owner, so only they bring them back (Undo, or adding them by hand). Nothing was written; leave them out.`,
              { at: 'fields' },
            );
          const row = byId(gone.id, true);
          if (row) return ok(row);
        }
      }
      /* ── a second row saying what a first says, on a list declaring `same:` (`same.ts`) ──
         Refused for every write, a rule's, a flow's or an ingest's too, as a second person is; an accepted rowset is the
         owner's own word and the record's merge is its own, so both pass, and an import never comes this way. */
      if (decl.same !== undefined && !door.decided && !door.merge) {
        const twice = sameDoor(sql, decl, {
          current,
          merged,
          sent: patch,
          touched,
          today: dayIn(clock.now(), recordIdentity(sql)?.tz),
          named: w.reads !== undefined && w.reads(register),
        });
        if (twice) return { ok: false, refusal: twice };
      }
      if (current && foldField !== undefined && touched.includes(foldField)) {
        const into = merged[foldField];
        if (typeof into === 'string' && into !== current.id && into !== current.fields[foldField]) {
          const moved = repointRefs(register, current.id, into, w);
          if (!moved.ok) return moved as Result<Entry>;
        }
      }

      /* `delete: refuse_while_referenced` (`referenced.ts`): a live row that other live rows point at is not taken out
         from under them. A restore and a row already deleted are never asked. `parts` is declared below, and read here
         only when a write runs, which is after the record has opened. */
      if (deleting && patch.deleted_at !== null && current !== null && current.deleted_at === null) {
        const held = referencedBy(parts, register, current.id, w.reads);
        if (held) return { ok: false, refusal: held };
        /* AND A LINK THE RECORD DREW ITSELF IS CLEARED (`on_delete: unlink`, `referenced.ts`), in the delete's own batch,
           so Undo puts each one back with the row. */
        const loose = unlinkAll(register, current.id, w);
        if (!loose.ok) return loose as Result<never>;
        w = loose.value;
      }
      /* A ROW COMING BACK TAKES BACK THE LINKS ITS DELETE CLEARED, wherever nobody has filled them since. */
      if (deleting && patch.deleted_at === null && current !== null && current.deleted_at !== null) {
        const relinked = relink(current.id, w);
        if (!relinked.ok) return relinked as Result<Entry>;
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
          /* AND A RUN WRITING ITS OWN ROW NAMES ITSELF AS IT GOES. What it says it is doing is cut to a name's length,
             and while its name is still the record's own, the name follows what this call tells the record, as it does
             for a run's other writes (`learnRun`): in this write, and with no line of its own in the history. */
          if (register === SESSION && current) {
            /* WHEN ITS STEP WAS WRITTEN, so a step left this stretch is told from one handed down from the last
               (`leftFreshStep`). A step cleared is a change of step too. */
            const runs = runRegister();
            if (touched.includes('next') && runs.has('next_at')) merged.next_at = now;
            /* AND THE WRITE COUNTED, as any other write of the run's is (`worked`), unless it is the run's opening or an
               attach, which say who the run is and do no work. */
            if (!/^(opened|attached):/u.test(w.note ?? '')) {
              if (typeof current.fields.wrote === 'number' && runs.has('wrote')) merged.wrote = current.fields.wrote + 1;
              if (typeof current.fields.stretch_at !== 'string' && runs.has('stretch_at')) merged.stretch_at = now;
            }
            if (touched.includes('doing') && typeof merged.doing === 'string') merged.doing = clipTitle(merged.doing);
            Object.assign(merged, learned({ fields: merged, created_at: current.created_at }, w.session ?? {}, projectNamed(merged.project), runRegister(), touched, [], nameTaken));
          }
        }
        w = { ...w, actor: run.actor };
      }

      /* THE KEYCHAIN DOOR'S KEY, bound here and not earlier: after every check, so a refused write seals
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
      /* A STAMPED `null` CLEARS THE FIELD, as K2 reads null everywhere else: absent, never a stored null, which the next
         write's checks would read as a value (an enum "has no value null"). Migration 42's resume clears `stopped` so. */
      if (w.stamp)
        for (const [key, v] of Object.entries(w.stamp)) {
          if (v === null) delete merged[key];
          else merged[key] = v;
        }
      /* A run placed through a stamp writes its move as a line of its own, with `project` from and to, so the server's
         undo can put it back like any other edit. */
      if (register === SESSION && current && w.stamp?.project !== undefined && !touched.includes('project')) touched.push('project');
      /* WHAT A CARRIED RUN BRINGS, after the stamp for the same reason: `seen_before` is the kernel's to write, and a
         `next` from a session that is gone is cleared, the one the row held as well as the one the write sent. */
      if (carried?.ok && carried.value.stamp.seen_before !== undefined) {
        merged.seen_before = carried.value.stamp.seen_before;
        if (current && !touched.includes('seen_before')) touched.push('seen_before');
      }
      if (carried?.ok && carried.value.dropNext && merged.next !== undefined) {
        delete merged.next;
        if (current && !touched.includes('next')) touched.push('next');
      }
      /* A run a key makes by hand is that key's, as one the ladder opens is: otherwise it would be a
         person's, and any key could name it. */
      if (register === SESSION && !current && w.principal?.kind === 'token' && w.principal.token !== undefined)
        merged.token_id = w.principal.token;
      /* AND WHEN IT BEGAN, once, unless the record's own stamp already says (the seed plants its example runs so). */
      if (register === SESSION && !current && merged.started === undefined) Object.assign(merged, begun(now, runRegister()));
      /* A RUN WRITTEN BY HAND IS PLACED BY WHERE IT SAYS IT WORKED, as one the ladder opens is: an import or a person
         carrying a run over from somewhere else names its repository and folder, and the record finds its project. A key's
         run is placed by the ladder, and a stamped project is the ladder's. */
      if (register === SESSION && !current && w.principal?.kind !== 'token' && merged.project === undefined) {
        const said = (k: string) => (typeof merged[k] === 'string' ? (merged[k] as string) : undefined);
        const placed = resolveProject(sql, registers, { remote: said('remote'), repo: said('repo'), cwd: said('cwd') }).project;
        if (placed) merged.project = placed.spoken;
      }

      /* THE ROW AS ONE VALUE, held to what the Cloud takes before a sequence number is spent on it (`rowOverCap`). */
      const stored = JSON.stringify(merged);
      const overCap = rowOverCap(merged, stored, current ? () => JSON.stringify(current.fields) : null);
      if (overCap) return { ok: false, refusal: overCap };

      if (!current) {
        const id = mint();
        const seq = decl.series ? null : allocate(`seq:${register}`);
        sql.exec(
          'INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
          id,
          register,
          seq,
          stored,
          nextState,
          now,
          now,
          deletedAt,
        );
        const entry = byId(id, true)!;
        reproject(entry);
        keyNamedAsRow(entry);
        rekeyEntry(null, entry, w);
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
        const paired = settlePairs(entry, null, decl, w.batch ?? batch, now) ? byId(entry.id, true) : null;
        settleRated(register, [entry], w.batch ?? batch, now);
        const changed = Object.keys(merged);
        if (paired && decl.pairs && !changed.includes(decl.pairs.mark)) changed.push(decl.pairs.mark);
        return ok({ ...rules(paired ?? entry, register, w, batch, { op: 'create', changed }), batch: w.batch ?? batch });
      }

      sql.exec(
        'UPDATE entry SET fields = ?, state = ?, version = version + 1, updated_at = ?, deleted_at = ? WHERE id = ?',
        stored,
        nextState,
        now,
        deletedAt,
        current.id,
      );
      const entry = byId(current.id, true)!;
      reproject(entry);
      keyNamedAsRow(entry);
      rekeyEntry(current, entry, w);
      rediary(entry);

      /* THE GRACE WINDOW: the creator's own edits in a row's first three minutes replace each other in history instead
         of each leaving a line, so a typo fixed a moment after it was typed is not a permanent row on a store that
         cannot forget. The fold rewrites the row's `create` line to the row as it now stands and writes no `edit`, so
         however many times he fixes it in those minutes, the history says it was created as it ended up.

         NOTHING ANOTHER ACTOR READ IS EVER FOLDED, and each check below closes one way somebody else could have read it.
         The row's only line is its `create`, signed by this same actor: a second line means somebody or something has
         already answered the row. Nothing another actor signed shares the create's batch: a rule that acted on what was
         created read it. No other member's read mark has reached the create: `markRead` is how the record knows who
         read how far, and a person who has seen the line keeps seeing the line they saw.

         AND SOME WRITES ARE NEVER FOLDED, whoever makes them. A mechanism's write, because the window is for a person's
         (or his agent's) fiddling and not for a rule's. A move, a delete and a restore, because a move is the one edit a
         register declares rules about and the other two are their own kinds. A write carrying a note, which is something
         said about that write, and one carrying an `op_id`, which lives on the first line of the write a replay finds.
         And any write on a list that pairs, because `pairs.ts`'s `pinnedBy` reads who set a mark from these lines, and
         a fold would turn his `edit` of it into a `create` that holds the default.

         NOR A WRITE THAT TOUCHES A FIELD WHOSE HISTORY IS THE ONLY PLACE THE CHANGE LIVES. A `tags` field changes by
         element (`tag`/`untag`, not `edit`), and folding it into the create's snapshot would answer "when was this
         tagged late" with nothing, not with an earlier answer. A redacted field (`redacts`, secret or money) drops its
         value from the ledger and keeps only who, when and which field; the create line already carries the row's first
         value redacted, and a fold that rewrote it to the row's LATEST value would answer "when was the amount changed"
         with "it wasn't", which is the one thing redaction promises never to hide. A `document` field is the one a
         `diff` block reads version by version (`pages.ts`'s `diffBlock`, `versionsOf`); folding it away is the same
         loss as a `tags` field's, read by a different page. A `file` field's every past name and hash is what holds a
         copy of it back out of a call after the file is replaced (`actions.ts`'s `queueCall`, "a file field's history
         is in the ledger, which keeps a file's value on the create row and on every edit of it"); a fold that rewrote
         the create row on the replacing edit would make that promise false the moment it was tested.

         NOR A WRITE THAT LEAVES A FIELD HOLDING ITS OWN DEFAULT. `pairs.ts`'s `pinnedBy` tells a row he pinned from one
         that only filled a default in by reading the create line back and asking whether the mark's value differs from
         what the field declares now, the only test it has, since a mark can be pinned before the list ever pairs and
         `decl.pairs` is not there yet to except the write the way it excepts one made after. Ticked and then unticked
         is his word twice, and folding the second write into the create would print the same value the row was born
         with, indistinguishable from never having been touched at all.

         NOR A DECISION CARRIED OUT, NOR A MERGE'S OWN WRITE. Their lines are what `undoMerge` and an undone decision read
         back by batch: the owner who added two rows and merged them a minute later had the fold's `merged_into` folded
         into the create line with no batch, and Undo answered that the row was never merged. A meet's plain write passes
         the merge door with no batch, and is folded as any other. */
      const GRACE_MS = 3 * 60_000;
      const foldable = (key: string): boolean => {
        const of = known.get(key);
        if (of?.type === 'list' && of.of === 'text') return false;
        if (of?.type === 'document' || of?.type === 'file') return false;
        if (redacts(register, key)) return false;
        if (of?.default !== undefined && JSON.stringify(merged[key] ?? null) === JSON.stringify(of.default ?? null)) return false;
        return true;
      };
      const lines =
        !deleting &&
        !door.decided &&
        !(door.merge && w.batch !== undefined) &&
        !isMechanism(w.actor) &&
        w.note === undefined &&
        w.opId === undefined &&
        !decl.pairs &&
        (!decl.state || nextState === current.state) &&
        touched.every(foldable) &&
        Date.parse(now) - Date.parse(current.created_at) < GRACE_MS
          ? sql.all<{ id: string; actor: string; kind: string; ts: string; batch: string | null }>(
              'SELECT id, actor, kind, ts, batch FROM event WHERE target = ? ORDER BY rowid LIMIT 2',
              `entry:${current.id}`,
            )
          : [];
      const made = lines.length === 1 ? lines[0] : undefined;
      if (
        made !== undefined &&
        made.kind === 'create' &&
        made.actor === w.actor &&
        !sql.one('SELECT 1 AS n FROM event WHERE ts >= ? AND batch = ? AND actor <> ? LIMIT 1', made.ts, made.batch ?? made.id, w.actor) &&
        !sql.one('SELECT 1 AS n FROM member WHERE person_id <> ? AND seen_at >= ? LIMIT 1', w.actor, made.ts)
      ) {
        /* The same check `appendEvent` makes of every line, since this write's line is the one it would have appended. */
        slashMayWrite(w.actor, 'edit');
        /* ONLY A FIELD THE LIVE DECLARATION STILL KNOWS, never a retired or dropped one that merely rides along in
           `merged` because the row's stored fields still hold it. A field never touched by this write, or any write
           since the row was made, is not "the row as it now stands" by any write this actor made: it is data a
           declaration once described and no longer does, kept on the row on purpose (`declare.ts`'s reasoning for
           `sealedEver`) and never meant to be pulled back into view by a fold that is rewriting a DIFFERENT field. */
        const shape = Object.fromEntries(
          Object.entries(merged)
            .filter(([k]) => known.has(k))
            .map(([k, v]) => [k, shown(register, k, v) ?? null]),
        ) as Json;
        sql.exec('UPDATE event SET rowid = (SELECT MAX(rowid) + 1 FROM event), to_v = ? WHERE id = ?', written(shape), made.id);
        const changed = touched.filter((key) => JSON.stringify(current.fields[key] ?? null) !== JSON.stringify(merged[key] ?? null));
        handedNotice(decl, entry, changed, w.actor, writerPerson(w));
        const folded = w.batch ?? made.batch ?? made.id;
        return ok({ ...rules(entry, register, w, folded, { op: 'update', changed }), batch: folded });
      }

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

      /* A MARK A PERSON SENDS AS IT ALREADY WAS IS STILL HIS SAY, and the loop above writes no row for a value that did
         not move, so nothing would remember it. Measured: the rent created unmarked, `transfer: false` set on it by
         `p_1`, and the next bank line of the same size paired it and wrote `true` over his word. The row is written
         here, signed by him, so `markPinned` finds it. NOT ON A PAIRED ROW, where the only value it can resend is the
         `true` the pair set, and agreeing with a pair is not a reason to break it.

         AND ONLY WHEN THE PATCH NAMES THE MARK ALONE. An agent that reads a row and sends it back whole carries the
         mark along as it was, and that pinned it. Measured: the bank's out leg categorised and returned with
         `moved: false`, the in leg arriving next, `{ pair: null, received: 4000 }`. Sent back with nothing changed at
         all it pinned the same way, and the history cannot tell that write from his lone `{ moved: false }`, since both
         leave one bare event and this one; only the patch can. A person who names the mark beside other fields and
         changes it is still heard, by the loop above, which writes an `edit` for any value that moved. */
      if (decl.pairs && !deleting) {
        const mark = decl.pairs.mark;
        if (
          touched.includes(mark) &&
          Object.keys(patch).every((key) => key === mark) &&
          !isMechanism(w.actor) &&
          current.fields._pair === undefined &&
          JSON.stringify(current.fields[mark] ?? null) === JSON.stringify(merged[mark] ?? null)
        )
          appendEvent({
            kind: 'edit',
            target: current.id,
            register,
            actor: w.actor,
            at: now,
            batch,
            field: mark,
            from: shown(register, mark, current.fields[mark]) ?? null,
            to: shown(register, mark, merged[mark]) ?? null,
          });
      }

      /* SETTLED AGAIN ON AN UPDATE THAT COULD MOVE A PAIR, and on no other. A leg whose day, amount or way was typed wrong
         and then fixed is looked at again, and so are the rows that stood near it before; a delete and a restore always
         are; a note written on a row is not a reason to search the ledger. */
      const paired =
        decl.pairs && (deleting || pairsReads(decl.pairs, decl.fields).some((key) => touched.includes(key))) && settlePairs(entry, current, decl, batch, now)
          ? byId(entry.id, true)
          : null;
      settleRated(register, [current, entry], batch, now);
      const changed = touched.filter((key) => JSON.stringify(current.fields[key] ?? null) !== JSON.stringify(merged[key] ?? null));
      if (paired && decl.pairs && !changed.includes(decl.pairs.mark) && paired.fields[decl.pairs.mark] !== current.fields[decl.pairs.mark])
        changed.push(decl.pairs.mark);
      if (!deleting) handedNotice(decl, paired ?? entry, changed, w.actor, writerPerson(w));
      /* THE ANSWER CARRIES ITS BATCH, so a receipt's Undo can ask the record to put back this write and all it caused. */
      return ok({ ...rules(paired ?? entry, register, w, batch, { op: first === 'delete' ? 'delete' : 'update', changed }), batch });
    });
  }

  /**
   * `hand.person` CHANGED TO A ROW THAT STANDS FOR A MEMBER TELLS THAT MEMBER, through the same path an
   * automation's `ask_person to:` uses (`flow.ts`'s `ask`, `govern.ts`'s `propose`), as a notice rather than a
   * question: no run is waiting on the answer, so nothing reads which option was pressed.
   *
   * MATCHED BY EMAIL, because `hand.person` points at a People row and a member is a `person` row, and the
   * address is the one fact this record has that says they are the same person; a People row with no email, or
   * one nobody signed in with, is handed the row and told nothing, which is no worse than today.
   *
   * `checkBody` REFUSES A CHOICE OF ONE ("A choice is between at least two options."), so a second option rides
   * beside "Seen" rather than the done-means' single button: "Put back" is the done-means' own name for undoing a
   * hand, so it is a real second option and not a formality invented to pass the gate.
   *
   * NOT TO THE PERSON BEHIND THE WRITE, nor to the record's owner when no other person is behind it (2 Nov fix pass).
   * `by` is the writer's person (`writerPerson`): a member is themself, and an agent is the person whose key it runs
   * under. Measured on his record: an agent working for him set 63 tasks' owner to him, and each opened "Someone handed
   * you" for him to tap Seen on. Nobody handed him anything: he made the change, through his agent. A write with no
   * person behind it (a rule, an import, Slash, the system) giving a row to the record's owner is the record's own
   * doing for him, and it applies quietly too. Another member, or another member's agent, handing him a row still tells him.
   */
  function handedNotice(decl: RegisterDecl, entry: Entry, changed: readonly string[], actor: string, by: string | undefined): void {
    const field = decl.hand?.person;
    if (!field || !changed.includes(field)) return;
    const to = entry.fields[field];
    if (typeof to !== 'string' || to === '') return;
    const row = byId(to, true);
    if (!row) return;
    const emailField = registers.get(row.register)?.fields.find((f) => f.type === 'email')?.id;
    const email = emailField === undefined ? undefined : row.fields[emailField];
    if (typeof email !== 'string' || email === '') return;
    const member = sql.one<{ id: string }>(
      "SELECT m.person_id AS id FROM member m JOIN person p ON p.id = m.person_id WHERE p.email = ? AND p.suspended_at IS NULL LIMIT 1",
      email,
    );
    if (!member || member.id === actor || member.id === by) return;
    if (by === undefined && ownerIn(sql, member.id)) return;
    const name = sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', actor)?.name?.trim();
    const title = entry.fields[decl.title];
    const filed = openSuggestion(governDeps(), actor, {
      question: `${name && name !== '' ? name : 'Someone'} handed you ${typeof title === 'string' && title !== '' ? title : 'a row'}`,
      body_kind: 'options',
      body: {
        options: [
          { id: 'o1', label: 'Seen', because: 'handed to you' },
          { id: 'o2', label: 'Put back', because: 'not for you' },
        ],
        to: member.id,
      },
    });
    /* AND THEIR PHONE, if they turned one on (collab pass 2): a tap opens the question, in Decide. */
    if (filed.ok) tellColleague(member.id, { by: actor, cause: `handed.${filed.value.id}`, open: `/decide/${filed.value.id}`, about: entry.id });
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
    const resolve = (where: Whereabouts): Resolved => resolveProject(sql, registers, where);
    if (!found) return { found, place: true, project: resolve(hints).project ?? parentProject(hints) ?? topicProject(hints) };
    /* PLACED ONCE AND NEVER MOVED (`placeOnce`): a run with a project keeps it wherever it is re-attached from, and one
       with none takes the first place a hint settles on, or its parent run's, or the project its topic names. */
    const placed = placeOnce(found.project, hints, resolve) ?? (found.project ? null : (parentProject(hints) ?? topicProject(hints)));
    if (placed) return { found, place: true, project: placed };
    const row = found.project ? get(found.project) : null;
    return { found, place: false, project: row && found.project ? { id: row.id, spoken: found.project } : null };
  }

  /**
   * The project of the run a subagent works for, by the `parent` hint (`S42`), or `null`. A subagent started in a scratch
   * folder is still doing its parent's work, so it is placed where its parent is when nothing else places it.
   */
  function parentProject(hints: SessionHints): { id: string; spoken: string } | null {
    const said = hints.parent?.trim();
    if (!said || !isRunName(said)) return null;
    const run = bySeq(SESSION, Number(said.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)));
    const spoken = run?.fields.project;
    if (typeof spoken !== 'string' || spoken === '') return null;
    const row = get(spoken);
    return row ? { id: row.id, spoken } : null;
  }

  /**
   * The one live project called what a session with no folder says it is working on (`topic`), case and spaces aside,
   * or `null`: none or more than one is. A topic is only ever a name, so a session that says where it is is placed by
   * that and never by its topic.
   */
  function topicProject(hints: SessionHints): { id: string; spoken: string } | null {
    const name = noPlace(hints) ? topicName(hints.topic) : null;
    const list = [...registers.values()].find((r) => r.scopes !== undefined);
    if (name === null || !list) return null;
    const rows = sql.all<{ id: string }>(
      `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND lower(trim(json_extract(fields, ?))) = lower(?) LIMIT 2`,
      list.id,
      `$."${list.title ?? 'name'}"`,
      name,
    );
    const [one] = rows;
    return rows.length === 1 && one ? { id: one.id, spoken: nameOf(one.id) } : null;
  }

  /** The names of every live project, which a run's old record-given names may have been made from. */
  function knownProjects(): string[] {
    const list = [...registers.values()].find((r) => r.scopes !== undefined);
    if (!list) return [];
    return sql
      .all<{ id: string }>('SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL', list.id)
      .map((r) => titleOfRow(r.id))
      .filter((t): t is string => t !== null);
  }

  /**
   * THE FIRST PROJECT, FORMED AS A DRAFT: an agent's run from a place no project holds, on a record with no project yet.
   * On one with projects the place is that project only when it is called exactly what one live project is called, and
   * otherwise nothing is formed (AK7): the person is asked, never handed a project nobody named. The person keeps a draft
   * with one press or says it is not a project. Its spoken id, or `null` for none.
   */
  function formFirstProject(w: WriteContext): string | null {
    const hints = w.session ?? {};
    if (w.principal?.kind !== 'token' || hints.parent !== undefined) return null;
    const list = [...registers.values()].find((r) => r.scopes !== undefined);
    if (!list || !list.fields.some((f) => f.id === DRAFT_FIELD && !f.retired)) return null;
    const name = firstProjectName(hints);
    if (name === null || nobodysPlace(hints)) return null;
    if (sql.one('SELECT 1 AS n FROM entry WHERE register = ? LIMIT 1', list.id)) {
      /* A PLACE CALLED EXACTLY WHAT ONE LIVE PROJECT IS CALLED IS THAT PROJECT, and the run goes there with no draft
         and no question. */
      const same = sql.all<{ id: string }>(
        "SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND lower(trim(json_extract(fields, '$.name'))) = lower(?) LIMIT 2",
        list.id,
        name,
      );
      if (same.length === 1 && same[0]) return nameOf(same[0].id);
      /* AND NOTHING NEW WITHOUT A QUESTION (audit 31 Oct k, AK7): on a record that already has projects, a folder an agent
         or a command was started in is not made a project unasked. A `braindog mcp` started in a checkout put "Braindog"
         in the owner's projects with no question; the run stays in none, and `context` tells its agent to name the
         project or ask. The first project, on a record with none, is still formed as a draft. */
      return null;
    }
    const has = (field: string) => list.fields.some((f) => f.id === field && !f.retired);
    const made = writing(list.id, null, firstProjectFields(hints, name, has), { actor: 'system', note: 'formed from an agent session', cascade: false });
    if (!made.ok || made.value.seq === null) return null;
    const said = list.seq_prefix && list.seq_prefix !== '#' ? list.seq_prefix : `${list.id}#`;
    return `${said}${made.value.seq}`;
  }

  /**
   * WHAT A SESSION WITH NO FOLDER SAYS IT IS WORKING ON (`topic`, on its `context` call), and the run it places. Claude.ai,
   * ChatGPT and any remote client send no repository, remote or folder, and send the topic once, so it is settled here
   * rather than on a later write that will not carry it: the project of that name, or on a record with no project yet
   * the first one formed from it as a draft (`formFirstProject`), and the caller's run placed there, opened when it has
   * none. A run already in a project stays where it is (`placeOnce`).
   *
   * `project: null` when nothing came of it: a caller that is no agent or says where it is, a topic that names nothing,
   * a run another key opened, or a record with projects and none called that, where a topic never forms a draft.
   */
  function topicRun(w: WriteContext): Result<{ project: string | null; run: string | null; formed: boolean }> {
    type Settled = { project: string | null; run: string | null; formed: boolean };
    const barred = schemaRefusal(state);
    if (barred) return barred;
    const hints = w.session ?? {};
    const nothing: Settled = { project: null, run: null, formed: false };
    if (w.principal?.kind !== 'token' || hints.parent !== undefined || !noPlace(hints) || topicName(hints.topic) === null) return ok(nothing);
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    return transaction((): Result<Settled> => {
      const at = locateRun(w);
      if (at.found?.foreign) return ok(nothing);
      const run = at.found ? `${prefix}${String(at.found.seq)}` : null;
      if (at.found?.project) return ok({ project: at.found.project, run, formed: false });
      const found = at.project?.spoken ?? null;
      const project = found ?? formFirstProject(w);
      if (project === null) return ok({ ...nothing, run });
      /* PLACED IN PLACE, as `attribute` places a run it re-attached: where the record found the run is not an edit. */
      if (at.found) {
        sql.exec("UPDATE entry SET fields = json_set(fields, '$.project', ?) WHERE id = ?", project, at.found.id);
        return ok({ project, run, formed: found === null });
      }
      const opened = openRun(w, project, instant(clock.now()), 'opened: said what it works on');
      if (!opened.ok) return opened as Result<never>;
      return ok({ project, run: `${prefix}${String(opened.value.seq)}`, formed: found === null });
    });
  }

  /**
   * WHO THE REPOSITORY'S RECENT COMMITS WERE BY, met once when a run opens: each author whose address no person holds is
   * met as somebody seen in that project's commits, which `meet` holds to a commit's word. Only with a remote reported,
   * and only the address git printed. In a transaction only.
   */
  function meetCommitters(w: WriteContext): void {
    const hints = w.session ?? {};
    if (w.principal?.kind !== 'token' || !hints.remote || !hints.authors) return;
    const people = meetsRole(registers.values());
    if (people === null) return;
    const where = hints.repo ?? (hints.remote.replace(/\/+$/u, '').split('/').pop() ?? hints.remote);
    for (const a of commitAuthors(hints.authors)) {
      if (sql.one('SELECT 1 AS n FROM entry WHERE register = ? AND instr(lower(fields), ?) > 0 LIMIT 1', people.register, a.email)) continue;
      meetPerson(
        peopleDeps({ actor: w.actor }, () => locateRun(w).project?.id ?? null, (p) => openSuggestion(governDeps(), w.actor, p)),
        { email: a.email, ...(a.name === undefined ? {} : { name: a.name }), source: `commit in ${where}`, untrusted: true },
      );
    }
  }

  /**
   * WHAT A RUN SAYS IT FINISHED, AND WHERE ITS PROJECT STANDS (`run-reads.ts`). Read when a run opens, hands off and
   * ends: its own words and the last commit subjects it reported are matched to its project's open tasks. A task the
   * words clearly name is closed by BrainDog with a mark and an undo (Handled); a weaker match asks in To review; and the
   * project's `next` follows the newest step a run left, unless a person wrote it last. A task written is what moves the
   * project's Last worked, which reads the tasks' own stamps. A failure here never stops the run's own write.
   */
  function readRunWork(w: Pick<WriteContext, 'actor' | 'principal' | 'session'>, runId: string): void {
    if (w.principal?.kind !== 'token') return;
    try {
      transaction(() => readRunWorkIn(w, runId));
    } catch {
      /* the run's write stands without it */
    }
  }

  function readRunWorkIn(w: Pick<WriteContext, 'actor' | 'principal' | 'session'>, runId: string): void {
    const run = byId(runId);
    const spokenProject = typeof run?.fields.project === 'string' ? run.fields.project : '';
    const project = run && spokenProject !== '' ? get(spokenProject) : null;
    if (!run || !project) return;
    const asText = (v: Json | undefined): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
    const listText = (v: Json | undefined): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []);
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    const spoken = `${prefix}${String(run.seq)}`;
    const lists = [...registers.values()] as unknown as Parameters<typeof tasksList>[0];
    const tasks = tasksList(lists);
    const at = instant(clock.now());
    const deps = ingestDeps();

    if (tasks) {
      const schema = registers.get(tasks.id) as unknown as { state?: string; done?: readonly string[]; fields: { id: string; values?: readonly string[] }[] } | undefined;
      const stateField = schema?.fields.find((f) => f.id === schema.state);
      const finished = schema?.done ?? ['done', 'dropped'];
      if (stateField?.values?.includes('done')) {
        const stateId = stateField.id;
        const rows = sql.all<{ id: string; version: number; state: string | null; fields: string }>(
          'SELECT id, version, state, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, ?) = ?',
          tasks.id,
          `$.${tasks.thing}`,
          project.id,
        );
        const openRows = rows.filter((r) => !finished.includes(r.state ?? ''));
        const byTask = new Map(openRows.map((r) => [r.id, r]));
        const open: Open[] = openRows
          .map((r) => ({ id: r.id, title: String((JSON.parse(r.fields) as Record<string, unknown>)[tasks.title] ?? '').trim() }))
          .filter((o) => o.title !== '');
        if (open.length > 0) {
          const texts = [asText(run.fields.doing), ...listText(run.fields.tried), ...listText(run.fields.notes)].filter((t): t is string => t !== undefined && t.trim() !== '');
          const who = runAgentOf({ agent: asText(run.fields.agent), client: asText(run.fields.client) }).name;
          const host = asText(run.fields.host);
          const device = host ? ` on ${host}` : '';
          const done = new Set<string>();
          const settle = (n: Named, sure: boolean, mark: string, why: string): void => {
            const row = byTask.get(n.task.id);
            if (!row || done.has(n.task.id)) return;
            done.add(n.task.id);
            const asked = `Mark ${n.task.title} done?`;
            const sureNow = sure && handledOn(sql);
            const id = openRowset(deps, at, {
              ingest: 'session',
              register: tasks.id,
              rows: [{ at: row.id, version: row.version, patch: { [stateId]: 'done' } }],
              question: cutLine(sureNow ? mark : asked),
              context: why,
              ...(sureNow ? {} : { review: true }),
            });
            if (!sureNow) return;
            const settled = deps.settle?.(id);
            if (!settled?.ok) unfile(deps, id, { question: cutLine(asked), context: why });
          };
          const fromRun = readNames(texts, open, true);
          for (const n of fromRun.sure)
            settle(n, true, `Closed by BrainDog: ${who} said it finished this${device}`, `${spoken} wrote "${cutLine(n.said, 120)}", which names ${n.task.title}.`);
          for (const n of fromRun.weak) settle(n, false, '', `${spoken} wrote "${cutLine(n.said, 120)}", which may be ${n.task.title}.`);
          for (const c of commitSubjects(w.session?.authors)) {
            const fromCommit = readNames([c.subject], open, false);
            for (const n of fromCommit.sure)
              settle(n, true, `Closed by BrainDog: a commit${device} says it finished this`, `Commit ${c.hash} "${cutLine(c.subject, 120)}" names ${n.task.title}.`);
            for (const n of fromCommit.weak) settle(n, false, '', `Commit ${c.hash} "${cutLine(c.subject, 120)}" may be ${n.task.title}.`);
          }
        }
      }
    }

    /* THE PROJECT'S NEXT FOLLOWS THE NEWEST STEP A RUN LEFT THERE, unless a person wrote `next` last: the row's own
       history says who did, and a value with no history of its own was set by whoever made the row, so it stays. */
    const projects = lists.find((l) => l.scopes !== undefined);
    if (!projects || !projects.fields.some((f) => f.id === 'next' && !f.retired)) return;
    const newest = sql.one<{ id: string; seq: number; next: string }>(
      `SELECT id, seq, json_extract(fields, '$.next') AS next FROM entry
        WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.project') = ?
          AND trim(coalesce(json_extract(fields, '$.next'), '')) <> '' AND coalesce(json_extract(fields, '$.closed_as'), '') = ''
          AND coalesce(json_extract(fields, '$.parent'), '') = ''
        ORDER BY julianday(coalesce(json_extract(fields, '$.next_at'), json_extract(fields, '$.last_seen'), updated_at)) DESC, seq DESC LIMIT 1`,
      SESSION,
      spokenProject,
    );
    if (!newest) return;
    const now = byId(project.id);
    const text = newest.next.trim();
    if (!now || now.register !== projects.id || now.fields.next === text) return;
    const last = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND field = 'next' ORDER BY rowid DESC LIMIT 1", `entry:${project.id}`);
    if (!mayRefreshNext(now.fields.next, last?.actor ?? null, prefix)) return;
    writing(projects.id, project.id, { next: text }, { actor: `${prefix}${String(newest.seq)}`, cascade: false, note: 'Followed the newest next step a run left here.' });
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
      /* SILENT AN HOUR AND WRITING AGAIN IS COMING BACK TOO (`RESUMED_MS`), as `beatRun` reads it for a call. */
      const was = sql.one<{ at: string | null }>("SELECT json_extract(fields, '$.last_seen') AS at FROM entry WHERE id = ?", found.id)?.at;
      const heard = typeof was === 'string' ? Date.parse(was) : Number.NaN;
      const resumed = Number.isFinite(heard) && heard <= Date.parse(now) - RESUMED_MS;
      if (!back) sql.exec("UPDATE entry SET fields = json_set(fields, '$.last_seen', ?) WHERE id = ?", now, found.id);
      /* AND THE RUN'S WORK COUNTED, in place for the same reason: one more write, and the stretch it began when this is
         the first since the run opened or came back. A run the data steps have not reached has no `wrote` yet, and is
         counted from the log when they do (`runsDataSteps`). */
      worked(found.id, now, back || resumed);
      /* A RE-ATTACHED RUN IS PLACED AGAIN, in place like the heartbeat and for the same reason: a
         run that came back in another folder is in that folder's project, and the record noting
         where it found the run is not an edit anybody made. */
      if (at.place && project !== found.project) {
        if (project === null) sql.exec("UPDATE entry SET fields = json_remove(fields, '$.project') WHERE id = ?", found.id);
        else sql.exec("UPDATE entry SET fields = json_set(fields, '$.project', ?) WHERE id = ?", project, found.id);
      }
      /* AND WHAT THE CALL SAYS OF WHO THE RUN IS, in place for the same reason: the kind of agent a run that said none
         turns out to be, its client, and the name that follows while the record's own name stands (`learned`). NEVER
         FROM ANOTHER KEY: a note or a proposal naming that run is refused (`foreignRun`), and that key's hints would
         otherwise rename the run and say which app it is. */
      if (!found.foreign) learnRun(found.id, w.session ?? {});
      return { actor, own: false };
    }

    const opened = openRun(w, project ?? formFirstProject(w), now, 'opened: auto', true);
    if (opened.ok) meetCommitters(w);
    if (opened.ok) readRunWork(w, opened.value.id);
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
   * One write a run signed, counted on the run in place: `wrote` one more, and `stretch_at` stamped when this write
   * begins a stretch, because it is the first since the run opened or since it came back (`back`). In a transaction
   * only. A run with no `wrote` is one the data steps have not reached, and is left for them.
   */
  function worked(id: string, now: string, back: boolean): void {
    const runs = runRegister();
    /* A REAL IS A COUNT TOO: migration 28 wrote each run's `wrote` through `json_set` with a bound number, which both
       hosts bind as a REAL (the conformance suite's `number-storage-class`), so those runs held 5.0 and were never
       counted again. */
    if (runs.has('wrote'))
      sql.exec(
        "UPDATE entry SET fields = json_set(fields, '$.wrote', json_extract(fields, '$.wrote') + 1) WHERE id = ? AND json_type(fields, '$.wrote') IN ('integer', 'real')",
        id,
      );
    if (runs.has('stretch_at'))
      sql.exec(
        "UPDATE entry SET fields = json_set(fields, '$.stretch_at', ?) WHERE id = ? AND (? OR json_extract(fields, '$.stretch_at') IS NULL)",
        now,
        id,
        back ? 1 : 0,
      );
  }

  /**
   * The run a new run works for, by the `parent` hint (`S42`), when that run is one this key opened; or `null`. A key
   * names only its own runs as parents, so no key can hang its runs under another key's session and end them with it.
   */
  function parentOf(w: WriteContext): string | null {
    const said = w.session?.parent?.trim();
    if (!said || !isRunName(said) || !runRegister().has('parent')) return null;
    const run = bySeq(SESSION, Number(said.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)));
    if (!run || othersRun(sql, run.seq, run.fields.token_id, w.principal?.token ?? null)) return null;
    return said;
  }

  /**
   * A new run, opened under its own name with `note` saying why. In a transaction only.
   *
   * THE NUMBER IS READ BEFORE THE ROW TAKES IT, so the `create` event is signed by the run it creates;
   * nothing else allocates in this transaction in between.
   *
   * `working` is a run opened by a write it signs, which is its first write and begins its first stretch; a run opened
   * for an attach or a handoff has written nothing yet. Either way it is given its `wrote`, so the data steps of
   * migration 28 pass it by.
   */
  function openRun(w: WriteContext, project: string | null, now: string, note: string, working = false): Result<Entry> {
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    const seq = Number(sql.one<{ n: number }>('SELECT next AS n FROM counter WHERE name = ?', `seq:${SESSION}`)?.n ?? 1);
    const runs = runRegister();
    const fields = opening(w.session ?? {}, runs);
    const parent = parentOf(w);
    /* A RUN IS NEVER UNTITLED: until its agent says what it is doing, it is named for the agent and where it opened. A
       project is named by its title and never by its number, which is no name a person reads. */
    if (typeof fields.doing !== 'string') {
      const agent = typeof fields.agent === 'string' ? { agent: fields.agent } : {};
      fields.doing = provisionalTitle({ ...w.session, ...agent }, project === null ? null : titleOfRow(project), runs.kinds, nameTaken);
    }
    const opened = writing(SESSION, null, fields, {
      actor: `${prefix}${seq}`,
      note,
      cascade: false,
      stamp: {
        last_seen: now,
        ...(w.principal?.token === undefined ? {} : { token_id: w.principal.token }),
        ...(project === null ? {} : { project }),
        ...(runs.has('wrote') ? { wrote: working ? 1 : 0 } : {}),
        ...(working && runs.has('stretch_at') ? { stretch_at: now } : {}),
        ...(parent === null ? {} : { parent }),
        /* AND THE WORKTREE IT OPENED IN, the record's to write as `token_id` is (migration 42, `openingStamp`). */
        ...openingStamp(w.session ?? {}, runs),
      },
      ...(w.batch === undefined ? {} : { batch: w.batch }),
    });
    if (opened.ok && opened.value.seq !== seq) throw new TypeError(`${prefix}${seq} was opened as ${prefix}${String(opened.value.seq)}`);
    return opened;
  }

  /**
   * What the live declaration of `session` holds, as the ladder asks it: which fields it keeps, and which kinds of agent
   * its `agent` field takes. A version of the register that declares `client` keeps the client's name from then on,
   * and one that lists `gemini` lets a run be one, with nothing here changed.
   */
  function runRegister(): RunRegister {
    const fields = (registers.get(SESSION)?.fields ?? []).filter((f) => !f.retired);
    return { has: (id) => fields.some((f) => f.id === id), kinds: fields.find((f) => f.id === 'agent')?.values ?? [] };
  }

  /** The name a run's project is called by, or `null` for a run in none or a project with no name. */
  function projectNamed(project: unknown): string | null {
    return typeof project === 'string' && project !== '' ? titleOfRow(project) : null;
  }

  /**
   * Whether a name an app gives itself is somebody's here: a person's name on the record, whole or its first word, or the
   * record's own name (RM8). Such an app is said "An app calling itself Ada", never "Ada" alone (`selfNamed`).
   */
  function nameTaken(name: string): boolean {
    const said = name.trim().toLowerCase();
    if (said === '') return false;
    if (sql.one("SELECT 1 AS y FROM dog_meta WHERE key = 'record_name' AND lower(trim(value)) = ?", said) !== undefined) return true;
    return sql.one("SELECT 1 AS y FROM person WHERE lower(trim(name)) = ? OR lower(trim(name)) LIKE ? || ' %' LIMIT 1", said, said) !== undefined;
  }

  /**
   * What a call made as a run says of who the run is, written onto the run in place (`learned` in `session.ts`). In a
   * transaction only.
   *
   * NO VERSION, NO `updated_at` AND NO EVENT, as the heartbeat and the placing beside it, because the record noting who
   * a run turned out to be is not an edit anybody made. The run's words are indexed again when its name moved, so a
   * search finds a run by the name it now has.
   */
  function learnRun(id: string, hints: SessionHints): void {
    const run = byId(id);
    if (!run) return;
    const said = learned(run, hints, projectNamed(run.fields.project), runRegister(), [], knownProjects(), nameTaken);
    if (Object.keys(said).length === 0) return;
    for (const [key, value] of Object.entries(said)) sql.exec('UPDATE entry SET fields = json_set(fields, ?, ?) WHERE id = ?', `$.${key}`, value, id);
    if (said.doing !== undefined) {
      const now = byId(id);
      if (now) reproject(now);
    }
  }

  /**
   * WHO SIGNED A LINE OF THE LOG, FOR ONE READ OF IT: `run_by` where the actor is a run's handle, ended or removed runs
   * included, and nothing where it is anybody else. EACH RUN IS READ ONCE, since a run that worked for an hour signed
   * most of a page of history, so make one of these for a page and ask it of every line.
   */
  function runsSaid(): (actor: string) => { run_by?: RunBy | null } {
    const read = new Map<string, RunBy | null>();
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    return (actor) => {
      if (!isRunName(actor)) return {};
      if (!read.has(actor)) read.set(actor, runByOf(actor, bySeq(SESSION, Number(actor.slice(prefix.length)), true)));
      return { run_by: read.get(actor) ?? null };
    };
  }

  /**
   * A run's first proposal names it, while the name it has is still the record's own, BY THE TITLE THE AGENT GAVE IT and
   * never by the question's own words: a question such as "Merge Sara into Sarah?" copied into the run's name
   * was readable on the Agents board by anybody who can read runs and not People. In place, as `learnRun` writes. A
   * proposal with no title, from anybody who is not a run, from a run already named, or from a key that named a run
   * another key opened, changes nothing.
   */
  function nameRunBy(suggestion: string, w: WriteContext, title: string | undefined): void {
    const asked = title?.trim();
    if (!asked) return;
    const by = getGovernance(sql, 'suggestion', suggestion)?.opened_by;
    if (typeof by !== 'string' || !isRunName(by)) return;
    const run = bySeq(SESSION, Number(by.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)));
    if (!run || (w.principal?.kind === 'token' && othersRun(sql, run.seq, run.fields.token_id, w.principal.token ?? null))) return;
    if (recordNamed(run, projectNamed(run.fields.project), knownProjects()) === null) return;
    sql.exec("UPDATE entry SET fields = json_set(fields, '$.doing', ?) WHERE id = ?", clipTitle(asked), run.id);
    const now = byId(run.id);
    if (now) reproject(now);
  }

  /**
   * TELLING THE PERSON AN AGENT ASKED THEM SOMETHING. A run's new question, the first of its cause, is an
   * active notice; one that cannot wait (`soon`, read by the queue's own `WAIT_SQL`) is time-sensitive, pushed
   * once for its cause. Before this a question an agent filed reached nobody until Decide was opened.
   *
   * THROUGH `notify` AND NOTHING BESIDE IT, so the record's quiet hours hold it and an active push is one an hour and
   * says how many wait. OFF UNLESS THE RECORD ALREADY PUSHES: where no owner turned a phone on (`ownersPushSubs`) it
   * writes and sends nothing, not even the note. And it never mails (`owners` is handed empty, so a time-sensitive one
   * is the push alone): one question is one notice, on the one channel the owner chose. A person's own question and the
   * record's tell nobody: whoever asked already knows. The line names the agent's project or the agent, never a handle.
   * The notice is about the question (`suggestion:<id>`, as a key's is `grant:<id>`) and not signed by the run, which
   * wrote no note: a run's history and its undo keep only what it did.
   *
   * IT TELLS AND NOTHING MORE: it asks, files and decides nothing, and a notice that cannot be queued never fails the
   * question it is about.
   */
  function tellAsked(suggestion: string): void {
    try {
      const q = sql.one<{ opened_by: string | null; cause: string | null; wait: string | null }>(
        `SELECT opened_by, cause, ${WAIT_SQL} AS wait FROM suggestion WHERE id = ?`,
        ...waitParams(clock.now()),
        suggestion,
      );
      const by = q?.opened_by;
      if (!q || typeof by !== 'string' || !isRunName(by) || ownersPushSubs(sql).length === 0) return;
      const run = bySeq(SESSION, Number(by.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)), true);
      const project = run ? projectNamed(run.fields.project) : null;
      const hints = run
        ? {
            ...(typeof run.fields.agent === 'string' ? { agent: run.fields.agent } : {}),
            ...(typeof run.fields.client === 'string' ? { client: run.fields.client } : {}),
          }
        : {};
      const app = runAgentOf(hints).name;
      const who = project ? `${project}'s agent` : app === 'Agent' ? 'An agent' : app;
      notify({ ...interruptDeps(), owners: () => [] }, {
        actor: `suggestion:${suggestion}`,
        say: `${who} asks you something`,
        level: q.wait === 'soon' ? 'time-sensitive' : 'active',
        cause: `asked.${q.cause ?? suggestion}`,
        url: `/decide/${suggestion}`,
      });
    } catch {
      /* A NOTICE IS NEVER WORTH A QUESTION. Whatever it wrote before it threw stays; the question is filed either way. */
    }
  }

  /**
   * Whether a line of the log is the record keeping its own books, which a feed of what changed leaves out and the log
   * keeps whole: a run's history, `history` and `recentHistory` with `everything` still read every one of them.
   *
   *   - THE SWEEP: a run the record wrote off itself, a `state` line by `system` on a row of `session`. 154 of the newest
   *     200 Activity lines on the owner's record were these, "Nothing heard from this run in twelve hours", one for
   *     every run the twelve-hour sweep closed, burying the changes somebody made.
   *   - A STAMP: an agent's run writing when it last saw something, an `edit` of an `instant` field to the moment of the
   *     write, give or take `STAMP_MS` for the clock of the machine it ran on, over an earlier moment the field already
   *     held. The tools scan's daily `seen` is one: it says the agent looked again, and changes nothing anybody reads a
   *     feed for. A run setting a meeting for next week is a change, so is a run filling "Sent" for the first time on
   *     an invoice it just sent, and an `instant` a person writes is never a stamp.
   *
   * BY THE LINE'S SHAPE AND NOT A LIST OF FIELDS, so a pack's own stamp is quiet the day it ships, with nothing here
   * changed and no pack named.
   */
  /* `listed` IS THE LIST THE LINE'S ROW IS ON WHERE THE CALLER HAS ALREADY READ IT (`null` for a row gone from the table),
     so a feed that read its rows in one query asks no second one a line. */
  function bookkeeping(e: Pick<EventLine, 'actor' | 'kind' | 'target' | 'field' | 'ts' | 'to'> & { from?: Json | null; note?: string | null }, listed?: string | null): boolean {
    /* AN ADD-ON PUT IN AGAIN AT THE VERSION IT HELD, BY THE RECORD AND SAYING NOTHING (audit j, AJ6): Money re-put for
       the lists Certificates brought into Cash ahead. Nothing a person chose changed; the log keeps the line. A part that
       waited and arrived carries its `because` as the note, and a reinstall somebody approved carries the lines, so both
       stay in the feed. A person's own reinstall is signed by them, and a person's re-put whose body changed has no
       `from_v` (`rememberPack`), so both stay too (review i, RI1). The record's own re-put with new legs keeps its
       `from_v` and is left out like any other (review k, RK2). */
    if (e.kind === 'install' && e.target?.startsWith('pack:') && e.actor === 'system' && typeof e.from === 'string' && e.from === e.to && (e.note ?? null) === null) return true;
    /* A SCRIPT'S QUIET RUN (`script-run.ts` stamps `quiet`): it wrote nothing, asked nothing and stopped nothing, so a
       script that runs every night adds no line to a feed on a quiet one. Its history keeps it. */
    if (e.kind === 'pull' && e.target?.startsWith('declaration:script.') && e.to !== null && typeof e.to === 'object' && !Array.isArray(e.to) && e.to.quiet === 1) return true;
    const id = e.target?.startsWith('entry:') ? e.target.slice('entry:'.length) : null;
    if (id === null) return false;
    const listOf = (): string | null => (listed !== undefined ? listed : (sql.one<{ register: string }>('SELECT register FROM entry WHERE id = ?', id)?.register ?? null));
    if (e.kind === 'state') return e.actor === 'system' && listOf() === SESSION;
    if (e.kind !== 'edit' || e.field === null || typeof e.to !== 'string' || typeof e.from !== 'string' || !isRunName(e.actor)) return false;
    const at = Date.parse(e.to);
    if (!Number.isFinite(at) || Math.abs(at - Date.parse(e.ts)) > STAMP_MS || !(Date.parse(e.from) < at)) return false;
    const list = listOf();
    return list !== null && registers.get(list)?.fields.find((f) => f.id === e.field)?.type === 'instant';
  }

  /**
   * Who signs what this context says: a token's run, found or opened with its heartbeat moved, or `actor`. In a
   * transaction only.
   *
   * NEVER ANOTHER KEY'S RUN. A token naming a run another key opened, or holding its client id, signed a note and a
   * question as that run, which a write already refused (`notYours`). The callers refuse first (`foreignRun`); a caller
   * that did not is signed by its own name, never by the run it named.
   */
  function signedBy(w: WriteContext): string {
    if (w.principal?.kind !== 'token') return w.actor;
    const at = locateRun(w);
    return at.found?.foreign ? w.actor : attribute(w, at, null, instant(clock.now())).actor;
  }

  /**
   * A session saying it is still working: its own run's `last_seen` moved to now, in place (`beatRun`).
   *
   * MEANT FOR A LONG STRETCH WITH NO WRITE. A session thinking for twenty minutes wrote nothing, so the Agents page read
   * it as gone quiet while it worked. A beat moves the clock and nothing else: no event, no version, no `updated_at`,
   * and under a minute since the last one it moves nothing at all.
   *
   * IT NEVER OPENS A RUN (`locateRun`, never `openRun`): a session that has not written has no run to keep awake, and a
   * beat that opened one would make the very session it says is working. Only the caller's own run, and only a token's,
   * because a person is never a run. Answers the run's name, or null for no run of its own that is working: nothing to
   * do about it, so not a refusal, since a hook beats on every tool call (record `beat`).
   */
  function heartbeat(w: WriteContext): string | null {
    if (schemaRefusal(state) || w.principal?.kind !== 'token') return null;
    return transaction((): string | null => {
      const at = locateRun(w);
      if (!at.found || at.found.foreign) return null;
      const run = byId(at.found.id);
      /* A RUN THAT STOPPED STAYS STOPPED: one that ended, left a step or was written off is not woken by a beat. */
      if (!run || (run.state !== 'active' && run.state !== 'idle')) return null;
      beatRun(sql, run.id, clock.now());
      return `${registers.get(SESSION)?.seq_prefix ?? 'S'}${String(run.seq)}`;
    });
  }

  /** The refusal for a token whose call names a run another key opened, or `null` when it names its own or none. */
  function foreignRun<T>(w: WriteContext): Result<T> | null {
    if (w.principal?.kind !== 'token') return null;
    const found = locateRun(w).found;
    return found?.foreign ? notYours<T>(`${registers.get(SESSION)?.seq_prefix ?? 'S'}${found.seq}`) : null;
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
   * A session that closed, ending its run once: the end hook's call, through the record's `end`.
   *
   * THE RECORD PICKS THE STATE, NOT THE CALLER. A run that left a fresh next step in this stretch and works for no other
   * run waits as a handoff, its step kept for the next session. Any other is done, its stale step cleared, with the note
   * "Ended at <head> with no next step." Before this the hook wrote idle, and twelve hours later the sweep wrote off
   * every session that had closed normally: about 740 of 752 runs on the owner's record read abandoned.
   *
   * ITS HELPERS END WITH IT. A subagent's run still open when the session that started it closes is done in the same
   * transaction, signed by that session, since nothing of it can still be working.
   *
   * ONCE. A run already done or waiting as a handoff is answered as it stands, `changed: false`, with nothing written,
   * so a hook that fires twice or a retried call changes nothing. A run the sweep wrote off ends as any other: the
   * session closed, which is truer than the sweep's guess. NO RUN IS OPENED TO BE ENDED: a session that never wrote has
   * no run, and is refused.
   */
  function endRun(w: WriteContext, args: { branch?: string; head?: string }): Result<{ run: string; state: 'done' | 'handoff'; changed: boolean }> {
    type Ended = { run: string; state: 'done' | 'handoff'; changed: boolean };
    const barred = schemaRefusal(state);
    if (barred) return barred;
    if (w.principal?.kind !== 'token')
      return no('FORBIDDEN', 'A run belongs to an agent token, and a person is never one.', { at: 'principal' });
    const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
    const { token } = w.principal;
    return transaction((): Result<Ended> => {
      const at = locateRun(w);
      if (at.found?.foreign) return notYours<Ended>(`${prefix}${String(at.found.seq)}`);
      /* A NAMED RUN IS ENDED, NEVER A GUESS. The ladder drops a name whose run is finished, and with no
         client id rung 4 then adopts the caller's newest live run: a retried `end S1` ended S2, which was still working.
         With nothing live to adopt, the same retry was refused as a session that never wrote. A caller that named its
         run is answered for that run. A client id never reaches here, since rung 3 answers it. */
      const said = w.session?.spoken?.trim() ?? '';
      const guessed = at.found === null || at.found.by === 'adopted';
      const named = guessed && isRunName(said) ? bySeq(SESSION, Number(said.slice(prefix.length))) : undefined;
      if (named === null)
        return no<Ended>('ROW_UNKNOWN', `${said} is not a run here, so there is nothing to end. Leave the name out to end this session's own run.`, {
          at: 'session',
        });
      if (named && othersRun(sql, named.seq, named.fields.token_id, token ?? null)) return notYours<Ended>(said);
      const run = named ?? (at.found ? byId(at.found.id) : null);
      if (!run)
        return no<Ended>('ROW_UNKNOWN', 'This session wrote nothing to this BrainDog, so it has no run to end. Ending is for a session that wrote.', {
          at: 'session',
        });
      const spoken = `${prefix}${String(run.seq)}`;
      const was = run.state ?? '';
      if (was === 'done' || was === 'handoff') return ok({ run: spoken, state: was, changed: false });
      const now = instant(clock.now());
      const where: Patch = {};
      if (typeof args.branch === 'string' && args.branch.trim() !== '') where.branch = args.branch.trim();
      if (typeof args.head === 'string' && args.head.trim() !== '') where.head = args.head.trim();
      const head = where.head ?? where.branch;
      const step = !isHelper(run.fields) && leftFreshStep(run.fields);
      const to: 'done' | 'handoff' = step ? 'handoff' : 'done';
      const note = step
        ? `Ended${typeof head === 'string' ? ` at ${head}` : ''} and left a next step.`
        : `Ended${typeof head === 'string' ? ` at ${head}` : ''} with no next step.`;
      const opts = { actor: spoken, cascade: false, stamp: { last_seen: now }, ...(w.batch === undefined ? {} : { batch: w.batch }) };
      /* WHERE IT STOPPED AND THE STEP IT DID NOT LEAVE FIRST, THEN THE END, so the end is the run's newest line and the
         sentence a person reads beside it (a write's note goes on its first line only). */
      const before: Patch = { ...where, ...(step || run.fields.next === undefined ? {} : { next: null }) };
      if (Object.keys(before).length > 0) {
        const placed = writing(SESSION, run.id, before, opts);
        if (!placed.ok) return placed as Result<never>;
      }
      const ended = writing(SESSION, run.id, { state: to }, { ...opts, note });
      if (!ended.ok) return ended as Result<never>;
      /* AND ITS HELPERS STILL OPEN, done with it. */
      const helpers = sql.all<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND state IN ('active', 'idle', 'abandoned')
         AND json_extract(fields, '$.parent') = ?`,
        SESSION,
        spoken,
      );
      for (const h of helpers) {
        const done = writing(SESSION, h.id, { state: 'done' }, { ...opts, stamp: {}, note: 'Ended with the session it worked for.' });
        if (!done.ok) return done as Result<never>;
      }
      readRunWork(w, run.id);
      return ok({ run: spoken, state: to, changed: true });
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

  function rules(
    entry: Entry,
    register: string,
    w: WriteContext,
    batch: string,
    change: { op: 'create' | 'update' | 'delete'; changed: readonly string[] },
  ): Entry {
    const byRule = w.actor.startsWith('rule:');
    if (w.cascade === false && !byRule) return entry;
    if (!sql.one("SELECT 1 AS x FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")) return entry;

    /* AUTOMATIONS FIRST, AND BEFORE THE CASCADE CHECK. A rule's own write carries `cascade: false`, which is what keeps
       the inline pass one step; an automation that says `from_rules: true` asked to see exactly those writes, so it is
       offered them here, at the depth of the run that wrote plus one. Nothing runs yet: `onWritten` records the run
       and arms it, inside this write's transaction, and the drain takes its steps. */
    const flows = installedFlows(sql);
    if (flows.length > 0)
      onWritten(flowDeps(), flows, { entry, register, ...change, byRule, depth: byRule ? flowDepth + 1 : 0, actor: w.actor });
    if (w.cascade === false) return entry;

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
  /**
   * Re-arm the reminders of every row whose repeat moves off a rest day, after the rest days changed. The rows that carry
   * such a field and stand, how many were armed again.
   */
  function rearmRestDays(): number {
    let n = 0;
    transaction(() => {
      for (const [register, decl] of registers) {
        const moves = (decl.fields as readonly Remindable[]).some((f) => f.repeat?.workday !== undefined && f.repeat.workday !== 'none');
        if (!moves) continue;
        for (const row of sql.all<Record<string, unknown>>(`SELECT ${COLUMNS} FROM entry WHERE register = ? AND deleted_at IS NULL`, register)) {
          rediary(hydrate(row));
          n++;
        }
      }
    });
    return n;
  }

  function rediary(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl) return;
    reschedule(
      sql,
      mint,
      { id: entry.id, register: entry.register, fields: entry.fields, deleted: entry.deleted_at !== null },
      decl.fields as readonly Remindable[],
      /* THE CLOCK THAT RUNS, NOT ONE `backdate` HOLDS: a reminder is armed for what is still to come, and a row written
         into a sample's past would otherwise arm every one that came due since, all overdue at once. */
      given.now(),
    );
  }

  /**
   * The matching's view of one register's `pairs:`, WITH THE REGISTER'S `state` AND `done`, which `pairs.ts` needs to
   * tell a row that may still clear from one that never will (`waiting`). A `Pairing` built without them let a client's
   * cleared EGP 20,000.00 that names its party hold a split move back under Money's clause: Spent and Received each EGP
   * 40,000.00 high. Every `Pairing` here comes from this.
   */
  function pairingOf(register: string, decl: RegisterDecl, pairs: PairsDecl): Pairing {
    return { sql, register, pairs, fields: decl.fields, state: decl.state, done: decl.done };
  }

  /**
   * Step 6b of the write path (`41 §5.4`): every pair this write made or broke, written on both rows. True when the
   * written row itself changed, so the caller reads it again.
   *
   * IN THE SAME TRANSACTION AND THE SAME BATCH as the write that moved the pair, so two rows are marked or unmarked
   * together or not at all, and "why is this row marked", or counted again, is answered by the history of the write that
   * caused it. Each leg gets an `edit` on the mark when it moved and one on `_pair`, from the partner it had to the one
   * it has: the mark alone would say the row stopped counting and not which row it was matched to.
   *
   * UNPAIRING IS THE SAME WRITE AS PAIRING, BACKWARDS. Pairing alone, never unpairing, left this, measured: GBP 400.00
   * paired and the out leg corrected to 900.00, Spent 0.00; the in leg retyped as out, Spent 0.00 against 800.00; the
   * in leg deleted, Spent 0.00 against 400.00, and the leg re-imported landed unmarked because its partner still named
   * the deleted row. An unpaired leg's mark goes back to false, and `_pair` leaves the row, so it is a candidate again
   * exactly as a row never paired is.
   *
   * SIGNED BY THE RECORD, NOT BY THE WRITER (`PAIRS_ACTOR`). The pairing ran in `p_1`'s batch and was signed `p_1`, so the
   * history said he had marked both legs, and a mark he really did set could not be told from one the kernel set for
   * him. A mark somebody pinned is never written here: the row is unpaired around it and keeps what he said.
   *
   * THE PARTNER'S VERSION MOVES AND THIS ROW'S DOES NOT. The partner changed under whoever last read it, so a
   * compare-and-set against the old version is refused, as for any other write. This row's change is part of the write
   * that is returning it, and a create answering version 2 would say somebody else had written in between.
   */
  function settlePairs(entry: Entry, before: Entry | null, decl: RegisterDecl, batch: string, now: string): boolean {
    const pairs = decl.pairs;
    if (!pairs) return false;
    const p = pairingOf(entry.register, decl, pairs);
    const seeds = [entry.id, ...neighboursOf(p, entry), ...(before ? [...neighboursOf(p, before), ...(typeof before.fields._pair === 'string' ? [before.fields._pair] : [])] : [])];
    let mine = false;
    for (const { leg, to } of settle(p, seeds)) {
      const fields: Record<string, unknown> = { ...leg.fields };
      if (!markPinned(p, leg.id)) fields[pairs.mark] = to !== null;
      if (to === null) delete fields._pair;
      else fields._pair = to;
      if (leg.id === entry.id) {
        sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify(fields), leg.id);
        mine = true;
      } else sql.exec('UPDATE entry SET fields = ?, version = version + 1, updated_at = ? WHERE id = ?', JSON.stringify(fields), now, leg.id);
      const said = { kind: 'edit', target: leg.id, register: entry.register, actor: PAIRS_ACTOR, at: now, batch };
      const was = leg.fields[pairs.mark] as Json | undefined;
      const is = fields[pairs.mark] as Json | undefined;
      if (JSON.stringify(was ?? null) !== JSON.stringify(is ?? null))
        appendEvent({ ...said, field: pairs.mark, from: shown(entry.register, pairs.mark, was) ?? null, to: shown(entry.register, pairs.mark, is) ?? null });
      if ((leg.fields._pair ?? null) !== to) appendEvent({ ...said, field: '_pair', from: (leg.fields._pair as Json | undefined) ?? null, to });
    }
    return mine;
  }

  /**
   * Step 6b over every row of each list whose `pairs:` an install has just changed: added, changed or taken away.
   *
   * AN INSTALL PAIRED NOTHING. The pairing ran in the write path and nowhere else, only for a write touching a field
   * `pairsReads` names, and an install writes no ledger row. So a record updated from money-core 2.1.0, which had no
   * `pairs:`, to 2.2.0 read Spent EGP 29,500.00 before and after, every mark false, and still after a note was written
   * on one leg; his import does not rewrite a row whose fields did not change, so a move already imported stayed
   * counted until a neighbour arrived within four days. And the 2.1.0 that deployed at 00:22 UTC paired rent with a
   * named client's payment, which 2.2.0 refuses, and both stayed marked after the update: Spent 0.00 and Received 0.00
   * against EGP 15,000.00 each. `test/pairs-on-update.test.ts` holds both, through `install` and through a pack's path.
   *
   * RUN WHERE THE NEW DECLARATION IS IN THE TABLE AND THE OLD ONE STILL IN `registers`: inside `install`'s transaction,
   * and inside the host's around a pack's staged write, before either reloads. That pair of readings is the only place
   * "what did this install change about pairing" can be answered without a diff being handed in, and it is the same
   * transaction as the declaration, so an update that rolls back takes its marks with it.
   *
   * THE OLD DECLARATION UNPAIRS FIRST WHEN THE NEW ONE MARKS ANOTHER FIELD, OR NONE. A `true` the kernel put on `transfer`
   * is the kernel's to take back, and nothing under the new declaration reads that field to do it. A mark a person set,
   * by the old declaration's reading of the history, is his and is left.
   *
   * EVERY LIVE ROW THAT COULD PAIR IS A SEED, IN DAY ORDER, ONE AT A TIME. `settle` stops at `SETTLE_MOST` rows visited
   * and does not say which seeds it reached, so a whole ledger handed to it in one call settled its first 256 rows and
   * dropped the rest without a word. One seed per call is always reached, and a row any call has asked is not a seed
   * again. The ledger this leaves is the one pairing each row as it arrived would have: `test/pairs-on-update.test.ts`
   * writes one stream into a record updated to the new `pairs:` and into one that had it from the start, and the two
   * agree row for row.
   *
   * NOTHING IS CAPPED, because a cap is the same fault again for the rows past it, so the cost is bounded by the
   * ledger. The first attempt took 3.3 s, 7.6 s and 251 s on 10,000 rows of varied amounts, fifty round ones, and fifty
   * packed into one year: each window of 250 rows was read whole and 159,018 windows were asked. The second asked each
   * row's window once per `settle` and only the rows of its size, 1.8 s to 2.9 s on those three, and where most rows
   * share a size it took 80 to 146 s for 10,000 rows of three amounts in one year, and for one amount more than 20
   * minutes, against the 30 s a Durable Object request gets. Every `settle` walked the same rows again for one new seed
   * and read their windows afresh. Now the pass reads the list once, and one answer, one window and one reading of each
   * row serve every `settle` in it (`pairs.ts`, `passOf`): 2.8 s, 1.4 s and 1.4 s for one, three and fifty amounts in
   * one year, measured with other work running, and the same ledger row for row and event for event.
   */
  function settleRedeclared(): void {
    const is = listsOf(sql.all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0")).registers;
    const now = instant(clock.now());
    for (const [id, decl] of is) {
      const was = registers.get(id);
      if (jcs((was?.pairs ?? null) as Json) === jcs((decl.pairs ?? null) as Json)) continue;
      const batch = mint();
      const note = decl.pairs ? `${decl.name} pairs its rows another way from this install.` : `${decl.name} no longer pairs its rows.`;
      if (was?.pairs && was.pairs.mark !== decl.pairs?.mark) {
        const old = pairingOf(id, was, was.pairs);
        /* WHAT A PERSON SAID ON THE OLD MARK IS WRITTEN ON THE NEW ONE FIRST, signed by them (`pairs.ts`'s `carryPins`),
           before the old mark is unpaired, so the pass below reads it as their word. Without it a renamed mark read
           Spent 0.00 against 20,000 (`pairs-followups.test.ts`). */
        if (decl.pairs) {
          const to = decl.pairs.mark;
          const named = (f: string): string => (decl.fields.find((x) => x.id === f) ?? was.fields.find((x) => x.id === f))?.label ?? f.replace(/_/g, ' ');
          const carried = `${decl.name} marks its moves on ${named(to)} from this install, so what was said on ${named(was.pairs.mark)} is carried over.`;
          for (const { leg, value, by } of carryPins(pairingOf(id, decl, decl.pairs), was.pairs.mark, to)) {
            if (leg.fields[to] !== value)
              sql.exec('UPDATE entry SET fields = ?, version = version + 1, updated_at = ? WHERE id = ?', JSON.stringify({ ...leg.fields, [to]: value }), now, leg.id);
            appendEvent({
              kind: 'edit',
              target: leg.id,
              register: id,
              actor: by,
              at: now,
              batch,
              note: carried,
              field: to,
              from: shown(id, to, leg.fields[to] as Json | undefined) ?? null,
              to: shown(id, to, value) ?? null,
            });
          }
        }
        /* A MARK THE NEW DECLARATION RETIRED IS LEFT AS IT STANDS, since no reader counts by it; `_pair` still goes. */
        const live = decl.fields.some((f) => f.id === was.pairs!.mark && f.retired !== true);
        for (const r of sql.all<{ id: string }>("SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$._pair') IS NOT NULL", id))
          writeLeg(old, loadLeg(old, r.id)!, null, live, batch, now, note);
      }
      if (!decl.pairs) continue;
      const p = pairingOf(id, decl, decl.pairs);
      const window = windowSql(p);
      /* ONLY A ROW THAT COULD HAVE A PARTNER, OR HAS ONE, IS ASKED. Two legs of one move are the same size, whatever else
         `on` compares (`mirrors`), so a row whose size no other row shares, and which holds no `_pair`, answers `null`
         now as it did before. On five years of varied amounts this asked 5,112 rows of 10,000 and halved the pass; where
         every amount is shared it asks them all, and costs one read of the list. A declaration with no day to run a
         window over pairs nothing, and only a row holding a `_pair` is asked, to take it back. A LEDGER THAT PAIRS ACROSS
         CURRENCIES (`pairs.across_currency`, pairs-fx-61) ASKS EVERY ROW: the two legs of such a move are never one
         size, so the shortcut would pass over every one of them. */
      const rows = sql.all<{ id: string; size: number | null; paired: number }>(
        `SELECT id, ${window?.size ?? 'NULL'} AS size, json_extract(fields, '$._pair') IS NOT NULL AS paired FROM entry
          WHERE register = ? AND deleted_at IS NULL ORDER BY ${window?.day ?? 'NULL'}, rowid`,
        id,
      );
      const alike = new Map<number, number>();
      for (const r of rows) if (r.size) alike.set(r.size, (alike.get(r.size) ?? 0) + 1);
      /* THE PASS READS THE LIST ONCE and answers each window from it (`pairs.ts`, `passOf`), asking SQL only for a row by
         id and for a row's history. EVERY ROW `settle` ASKED, changed or not, is not a seed again: its answer is written
         (`pass.answered`). */
      const pass = passOf(p);
      /* AN INDEX FOR THE ONE PASS THAT STILL ASKS A QUERY PER WINDOW, a declaration whose own rule reads its mark
         (`passOf` shares nothing with it), on the list, the size and the day, the three things a window is asked by
         (`windowSql`). With no statistics SQLite reads a window of a list through `entry_state` and every row of the list
         with it: 8.5 ms a question on 10,000 rows, against 0.19 ms on the list and the day and 0.03 ms on all three,
         measured. It is dropped in the transaction that made it, and a rollback takes it too. */
      const index = window && pass.windows === undefined ? `entry_settle_${id}` : null;
      if (index && window) sql.exec(`CREATE INDEX IF NOT EXISTS ${index} ON entry (register, ${window.size}, ${window.day}) WHERE deleted_at IS NULL`);
      try {
        for (const r of rows) {
          if (pass.answered.has(r.id) || (!r.paired && p.pairs.across_currency === undefined && (r.size === null || (alike.get(r.size) ?? 0) < 2))) continue;
          for (const { leg, to } of settle(p, [r.id], pass)) writeLeg(p, leg, to, true, batch, now, note);
        }
      } finally {
        if (index) sql.exec(`DROP INDEX IF EXISTS ${index}`);
      }
    }
  }

  /** One leg of `settleRedeclared`'s pass written as `settlePairs` writes a partner: a new version, signed by the record. */
  function writeLeg(p: Pairing, leg: PairLeg, to: string | null, mark: boolean, batch: string, now: string, note: string): void {
    const fields: Record<string, unknown> = { ...leg.fields };
    if (mark && !markPinned(p, leg.id)) fields[p.pairs.mark] = to !== null;
    if (to === null) delete fields._pair;
    else fields._pair = to;
    sql.exec('UPDATE entry SET fields = ?, version = version + 1, updated_at = ? WHERE id = ?', JSON.stringify(fields), now, leg.id);
    const said = { kind: 'edit', target: leg.id, register: p.register, actor: PAIRS_ACTOR, at: now, batch, note };
    const was = leg.fields[p.pairs.mark] as Json | undefined;
    const is = fields[p.pairs.mark] as Json | undefined;
    if (JSON.stringify(was ?? null) !== JSON.stringify(is ?? null))
      appendEvent({ ...said, field: p.pairs.mark, from: shown(p.register, p.pairs.mark, was) ?? null, to: shown(p.register, p.pairs.mark, is) ?? null });
    if ((leg.fields._pair ?? null) !== to) appendEvent({ ...said, field: '_pair', from: (leg.fields._pair as Json | undefined) ?? null, to });
  }

  /**
   * A rate written, changed or deleted settles again every ledger that pairs across currencies (pairs-fx-61).
   *
   * TWO LEGS WRITTEN BEFORE THEIR DAY'S RATE ARRIVED STAYED COUNTED until one of them was written again: the pairing
   * runs on a write to the ledger, and a rate is a row of another list. A record whose rates are fetched at night and
   * whose bank alerts land by day met that on every move between two currencies.
   *
   * THE SEEDS ARE THE ROWS A RATE OF THAT DAY CAN SPEAK FOR: the earlier leg is converted at the rate on or before its
   * own day and no older than `RATE_STALE_DAYS`, so a rate dated D reaches a leg dated D to D plus that many days, and
   * `settle` walks from each to its partner. A rate taken away is the same question asked the other way, and a pair it
   * alone held is taken back. Signed by the record and written as `settleRedeclared` writes a leg.
   */
  function settleRated(register: string, rows: readonly (Entry | null)[], batch: string, now: string): void {
    const held = ratesRole(registers.values());
    if (held === null || held.register !== register) return;
    const days = new Set<string>();
    for (const r of rows) {
      const day = r?.fields[held.fields.as_of];
      if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(day)) days.add(day.slice(0, 10));
    }
    if (days.size === 0) return;
    for (const [id, decl] of registers) {
      if (decl.pairs?.across_currency === undefined) continue;
      const p = pairingOf(id, decl, decl.pairs);
      const window = windowSql(p);
      if (window === null) continue;
      const pass = passOf(p);
      const note = `${decl.name} looked again at its moves between two currencies, since a rate changed.`;
      for (const day of days) {
        const last = new Date(Date.parse(`${day}T00:00:00Z`) + RATE_STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
        const near = sql.all<{ id: string }>(
          `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND substr(${window.day}, 1, 10) BETWEEN ? AND ? ORDER BY ${window.day}, rowid`,
          id,
          day,
          last,
        );
        for (const r of near) {
          if (pass.answered.has(r.id)) continue;
          for (const { leg, to } of settle(p, [r.id], pass)) writeLeg(p, leg, to, true, batch, now, note);
        }
      }
    }
  }

  /** The list whose rows carry identity keys, if `register` is one (`entities.ts`). */
  function keyedOf(register: string): KeyedList | undefined {
    return keyedLists(registers.values()).find((l) => l.register === register);
  }

  /** The person a write is by, as `hiddenFrom` reads a viewer: a token's own person before its run signs, else `personOf`. */
  function writerPerson(w: WriteContext): string | undefined {
    const token = w.principal?.kind === 'token' ? w.principal.token : undefined;
    if (typeof token === 'string') return sql.one<{ p: string }>('SELECT person_id AS p FROM token WHERE id = ?', token)?.p ?? undefined;
    return personOf(sql, w.actor) ?? undefined;
  }

  /**
   * THE MERGE DOOR: what a write that folds a row, unfolds it, or deletes or restores
   * a folded one must pass, and what a restore of a keyed row must not collide with. A refusal, or `null`.
   *
   * ONLY A DECISION OR THE RECORD'S OWN MERGE MOVES `merged_into`. A plain update that set it repointed every link to the
   * row it named and moved every key there, so anybody with write access could fold one person into another, with no
   * question and nothing to undo by. The owner's accept carries `decided`; `meet`'s strong rules and `undoMerge` carry
   * `merge`. A row sent back with the value it already holds changes nothing and passes.
   *
   * AND IT FOLDS INTO A ROW THAT CAN TAKE IT: one that exists, in the same list, standing (not deleted, not itself folded),
   * and neither the row itself nor one folded into it, since a loop hands keys round and never lands them. Never on a
   * create: a row is folded once it exists.
   *
   * A RESTORED ROW DOES NOT COME BACK AS A GHOST. A row deleted while another took one of its keys, restored, answered
   * to nothing its fields said, and the record's door refuses that same pair when both are live. Refused the same way,
   * naming who holds the key; a folded row coming back through `undoMerge` takes its keys back as it unfolds, and is
   * not asked.
   *
   * WHO HOLDS A KEY IS NAMED ONLY TO A WRITER WHO READS THAT LIST: `reads` says so, and a write
   * that does not say what its writer reads (a rule's, a flow's, an ingest's) is told "someone on this list". Naming the
   * holder to a writer held to `append` handed them a row they may not read, one refused create at a time.
   */
  function mergeDoor(
    register: string,
    current: Entry | null,
    merged: Readonly<Record<string, Json>>,
    patch: Patch,
    touched: readonly string[],
    list: KeyedList | undefined,
    field: string | undefined,
    door: Door,
    reads: WriteContext['reads'],
    viewer?: string | undefined,
  ): Refusal | null {
    if (list === undefined) return null;
    const was = field === undefined || current === null ? undefined : current.fields[field];
    const is = field === undefined ? undefined : merged[field];
    const folding = field !== undefined && touched.includes(field) && (is ?? null) !== (was ?? null);
    const turning = patch.deleted_at !== undefined && current !== null && (patch.deleted_at === null) !== (current.deleted_at === null);
    const foldedRow = typeof was === 'string' || typeof is === 'string';
    const named = (id: string): string => titleOfRow(id) ?? 'that one';
    if ((folding || (turning && foldedRow)) && !door.decided && !door.merge)
      return {
        code: 'FORBIDDEN',
        fix: !folding
          ? `${current ? named(current.id) : 'That one'} was merged into ${typeof (is ?? was) === 'string' ? named(String(is ?? was)) : 'another'}. Undo the merge to bring it back; it is not deleted or restored on its own.`
          : typeof is !== 'string' && typeof was === 'string'
            ? `${current ? named(current.id) : 'That one'} comes apart from ${named(was)} only by undoing the merge.`
            : `${current ? named(current.id) : 'A new one'} is merged into another only by an accepted merge. Propose the merge, and it is made when the owner accepts it.`,
        at: folding ? field! : 'deleted_at',
      };
    if (folding && typeof is === 'string') {
      if (current === null)
        return { code: 'VALUE_MALFORMED', fix: 'Nothing is merged as it is added. Add it, then propose the merge.', at: field! };
      const into = byId(is, true);
      if (!into) return { code: 'ROW_UNKNOWN', fix: `${named(current.id)} cannot be merged into one that is not there.`, at: field! };
      if (into.register !== register)
        return { code: 'REF_REGISTER_MISMATCH', fix: `${named(current.id)} is merged only into one of its own list, and ${named(into.id)} is in another.`, at: field! };
      if (into.id === current.id) return { code: 'VALUE_MALFORMED', fix: `${named(current.id)} cannot be merged into itself.`, at: field! };
      if (into.deleted_at !== null)
        return { code: 'VALUE_MALFORMED', fix: `${named(into.id)} was deleted, so nothing can be merged into it. Bring it back first, or merge into the one kept.`, at: field! };
      const onward = foldChain(sql, field!, into.id);
      if (onward.includes(current.id))
        return { code: 'VALUE_MALFORMED', fix: `${named(into.id)} was merged into ${named(current.id)}, so merging back the other way would go round in a circle.`, at: field! };
      if (onward.length > 0)
        return { code: 'VALUE_MALFORMED', fix: `${named(into.id)} was itself merged into ${named(onward.at(-1)!)}. Merge into that one.`, at: field! };
    }
    /* A ROW IS NOT ADDED AS A SECOND OF SOMEBODY ALREADY HERE. A create carrying a key a live row holds made a second
       person who answered to nothing (`claim` keeps the key where it is), so the record held two of one person and an
       agent met both. Refused, naming who holds it to a writer who reads the list (`holder`), in the words the record's
       own door says it in (`keyHeld` in `packages/record`), which only its create and update pass through: this one
       holds for every write, a rule's, a flow's or an ingest's too. `meet` finds that row by the key and adds nothing,
       and an accepted rowset is the owner's own word, so both pass. */
    const holder = (held: { id: string; register: string }): string | null => (reads !== undefined && reads(held.register) ? titleOfRow(held.id) : null);
    if (current === null && !door.decided && !door.merge) {
      const parts = Object.values(list.fields as Readonly<Record<string, string | undefined>>).filter((f): f is string => typeof f === 'string');
      const them = list.role === 'meets' ? 'them' : 'it';
      for (const key of rowKeys(list, merged)) {
        const held = holderOf(sql, key);
        /* A HOLDER KEPT PRIVATE FROM THE WRITER IS NOT THERE FOR THEM (audit 31k, RK3): refused, the write would say the
           row exists. The new row carries the key and the hidden row keeps holding it (`claim`). */
        if (held === null || held.register !== register || hiddenFrom(held.id, viewer)) continue;
        const at = parts.find((f) => merged[f] !== undefined && rowKeys(list, { [f]: merged[f] }).includes(key)) ?? field ?? 'fields';
        const kind = key.slice(0, key.indexOf(':'));
        const said = key.slice(key.indexOf(':') + 1);
        const plain = kind === 'email' || kind === 'domain' ? said : `${said} on ${kind}`;
        return {
          code: 'ALREADY_KNOWN',
          fix: `${holder(held) ?? (list.role === 'meets' ? 'Someone on this list' : 'An organisation on this list')} already has ${plain}. Add what you know to ${them} rather than adding ${them} twice.`,
          at,
        };
      }
    }
    if (patch.deleted_at === null && current !== null && current.deleted_at !== null && typeof (is ?? was) !== 'string') {
      for (const key of rowKeys(list, merged)) {
        const held = holderOf(sql, key);
        if (held === null || held.id === current.id || hiddenFrom(held.id, viewer)) continue;
        const kind = key.slice(0, key.indexOf(':'));
        const said = key.slice(key.indexOf(':') + 1);
        const plain = kind === 'email' || kind === 'domain' ? said : `${said} on ${kind}`;
        return {
          code: 'ALREADY_KNOWN',
          fix: `${holder(held) ?? (list.role === 'meets' ? 'Someone else on this list' : 'Another organisation on this list')} now has ${plain}. Merge the two, or take it off ${named(current.id)} before bringing it back.`,
          at: 'deleted_at',
        };
      }
    }
    return null;
  }

  /**
   * What a merge carried as one batch, finished: for every row this batch folded, what it and the row kept disagree on
   * is kept on the row kept (`entities.ts`'s `foldedCarry`), in the same batch, so `undoMerge` takes it back with the
   * rest. Run once the batch's own writes are done, by `meet` after a strong merge and by `decide` after an accepted
   * one, since the carry the merge was drawn with replaces whole lists and would drop a line written before it.
   */
  function carryFolds(batch: string, w: WriteContext): Result<null> {
    const day = instant(clock.now()).slice(0, 10);
    const lines = sql.all<{ target: string; field: string }>(
      "SELECT DISTINCT target, field FROM event WHERE batch = ? AND kind = 'edit' AND field IS NOT NULL AND to_v IS NOT NULL",
      batch,
    );
    for (const l of lines) {
      const fold = byId(l.target.replace(/^entry:/, ''), true);
      const list = fold === null ? undefined : keyedOf(fold.register);
      const field = list === undefined ? undefined : mergeFieldOf(list);
      if (!fold || !list || field !== l.field || typeof fold.fields[field] !== 'string') continue;
      const keep = byId(foldEnd(sql, field, fold.id));
      if (!keep || keep.id === fold.id) continue;
      const declared = registers.get(fold.register)?.fields ?? [];
      const patch = foldedCarry(list, declared, keep.fields, fold.fields, titleOfRow(fold.id) ?? 'the one merged', day);
      if (Object.keys(patch).length === 0) continue;
      const out = write(
        keep.register,
        keep.id,
        patch as Patch,
        { ...w, cascade: false, batch, note: `Kept what ${titleOfRow(fold.id) ?? 'the one merged'} said differently.` },
        { merge: true },
      );
      if (!out.ok) return out as Result<never>;
    }
    return ok(null);
  }

  /**
   * The batch each of these rows was last written in, for the rows of a keyed list: what an accepted rowset was written
   * as. `carryFolds` acts only on the rows a batch folded, so a batch that folded nothing carries nothing.
   */
  function foldBatches(ids: readonly string[]): string[] {
    const out = new Set<string>();
    for (const id of ids) {
      const row = byId(id, true);
      if (row === null || keyedOf(row.register) === undefined) continue;
      const line = sql.one<{ batch: string | null }>('SELECT batch FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `entry:${id}`);
      if (line?.batch) out.add(line.batch);
    }
    return [...out];
  }

  /**
   * A merge is answered whole. A pick of some rows of a rowset that folds rows of a
   * keyed list must take every fold with the row kept, whose patch carries what they held: a fold taken without it
   * left the folded row's organisation, names and where they were met on a deleted row, and the carry taken without
   * its fold copied a live row's addresses onto another. The web card already answers a merge as one; this is the
   * record agreeing with it. A refusal, or `null`.
   */
  function mergePickFault(id: string, verdict: Verdict): Refusal | null {
    const rows = 'decide' in verdict ? verdict.decide.rows : undefined;
    if (rows === undefined) return null;
    const sg = sql.one<{ body_kind: string; body: string }>('SELECT body_kind, body FROM suggestion WHERE id = ?', id);
    if (sg?.body_kind !== 'rowset') return null;
    let body: { register?: unknown; rows?: unknown };
    try {
      body = JSON.parse(sg.body) as typeof body;
    } catch {
      return null;
    }
    const list = typeof body.register === 'string' ? keyedOf(body.register) : undefined;
    const field = list === undefined ? undefined : mergeFieldOf(list);
    if (field === undefined || !Array.isArray(body.rows)) return null;
    const all = body.rows as { at?: unknown; patch?: Record<string, unknown> }[];
    /* BY THE ROW EACH NAMES, not the spelling: a fold naming the kept one by id and its carry at `people#1` are one merge. */
    const idOf = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? (get(v, { includeDeleted: true })?.id ?? v) : undefined);
    const into = new Set(all.map((r) => idOf(r?.patch?.[field])).filter((v): v is string => v !== undefined));
    if (into.size === 0) return null;
    const part = all.flatMap((r, n) => (idOf(r?.patch?.[field]) !== undefined || into.has(idOf(r?.at) ?? '') ? [n] : []));
    const taken = part.filter((n) => rows.includes(n));
    if (taken.length === 0 || taken.length === part.length) return null;
    return {
      code: 'VALUE_MALFORMED',
      fix: 'A merge is answered whole: accept it to keep one and carry over what the others held, or reject it to keep them apart.',
      at: 'rows',
    };
  }

  /**
   * `entity_key` brought up to one row as it now is, in the write's transaction, the way `reproject` keeps the index.
   * The source is who wrote it; `meet` says where it came from once the write is back (`sourceKeys`).
   */
  function rekeyEntry(before: Entry | null, after: Entry, w: WriteContext): void {
    /* EVERY LIST THAT HOLDS KEYS, a project's among them (entity-keys-59) and a list declaring `same:`:
       `keyedOf` is the merge door's, people and organisations alone, and the door must not see the others. */
    const list = keyLists(registers.values()).find((l) => l.register === after.register);
    if (list) rekey(sql, list, before, after, w.actor, instant(clock.now()));
  }

  /**
   * The links to a row being deleted that its delete clears (`on_delete: unlink`, `referenced.ts`), written in the
   * delete's own batch, minted here when the delete has none, so Undo takes the delete and every clearing back as one.
   * Answers the context the delete goes on with.
   */
  function unlinkAll(register: string, id: string, w: WriteContext): Result<WriteContext> {
    const loose = unlinksOf(parts, register, id);
    if (loose.length === 0) return ok(w);
    const as: WriteContext = w.batch === undefined ? { ...w, batch: mint() } : w;
    const named = titleOfRow(id);
    for (const r of loose) {
      const row = byId(r.id);
      if (!row) continue;
      const cleared: Patch = {};
      for (const f of r.fields) {
        const v = row.fields[f];
        cleared[f] = Array.isArray(v) ? v.filter((x) => x !== id) : null;
      }
      const out = write(r.register, r.id, cleared, { actor: as.actor, cascade: false, note: `Unlinked from ${named ?? 'one deleted'} as it was deleted.`, batch: as.batch! });
      if (!out.ok) return out as Result<never>;
    }
    return ok(as);
  }

  /**
   * The links a row's last delete cleared (`on_delete: unlink`, `referenced.ts`), pointed back at it as it comes back:
   * each one still empty, never one somebody filled since. Read from the delete's own batch in the log.
   */
  function relink(id: string, w: WriteContext): Result<null> {
    const gone = sql.one<{ batch: string | null; id: string }>(
      "SELECT batch, id FROM event WHERE target = ? AND kind = 'delete' ORDER BY rowid DESC LIMIT 1",
      `entry:${id}`,
    );
    if (!gone) return ok(null);
    const lines = sql.all<{ target: string; field: string; from_v: string | null }>(
      "SELECT target, field, from_v FROM event WHERE batch = ? AND kind = 'edit' AND target <> ? AND field IS NOT NULL AND from_v IS NOT NULL AND instr(from_v, ?) > 0",
      gone.batch ?? gone.id,
      `entry:${id}`,
      id,
    );
    for (const line of lines) {
      const row = byId(line.target.replace(/^entry:/u, ''));
      if (!row) continue;
      const decl = registers.get(row.register);
      const field = decl?.fields.find((f) => f.id === line.field && !f.retired && (f as Readonly<Record<string, unknown>>).on_delete === 'unlink');
      if (!field) continue;
      const now = row.fields[field.id];
      let back: Json | undefined;
      if (field.type === 'ref' && (now === undefined || now === null || now === '')) back = id;
      else if (field.type === 'list' && (now === undefined || Array.isArray(now)) && !(Array.isArray(now) && now.includes(id))) back = [...(Array.isArray(now) ? now : []), id] as Json;
      if (back === undefined) continue;
      const out = write(row.register, row.id, { [field.id]: back }, { actor: w.actor, cascade: false, note: 'Linked again as it came back.', ...(w.batch === undefined ? {} : { batch: w.batch }) });
      if (!out.ok) return out as Result<never>;
    }
    return ok(null);
  }

  /**
   * Every live row pointing at `from` through a `ref` or a `list<ref>` to its list, pointed at `to` instead: a merge's
   * second half. Written through the write path, so each move is a line in the history under the merge's batch, and a
   * move the write path refuses refuses the merge.
   */
  function repointRefs(register: string, from: string, to: string, w: WriteContext): Result<null> {
    const named = titleOfRow(to);
    for (const decl of registers.values()) {
      if (decl.series) continue;
      const refs = decl.fields.filter((f) => !f.retired && !f.derived && f.to === register && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')));
      if (refs.length === 0) continue;
      for (const { id } of sql.all<{ id: string }>('SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND id <> ? AND instr(fields, ?) > 0', decl.id, from, from)) {
        const row = byId(id);
        if (!row) continue;
        const patch: Patch = {};
        for (const f of refs) {
          const held = row.fields[f.id];
          if (held === from) patch[f.id] = to;
          else if (Array.isArray(held) && held.includes(from)) patch[f.id] = [...new Set(held.map((v) => (v === from ? to : v)))];
        }
        if (Object.keys(patch).length === 0) continue;
        const out = write(
          decl.id,
          id,
          patch,
          {
            actor: w.actor,
            cascade: false,
            note: `Pointed at ${named ?? 'the one kept'} after a merge.`,
            ...(w.batch === undefined ? {} : { batch: w.batch }),
          },
          /* A HALF-FOLDED ROW OF THE SAME LIST may point at the one folded through its own `merged_into`. */
          { merge: true },
        );
        if (!out.ok) return out as Result<never>;
      }
    }
    return ok(null);
  }

  /**
   * What `people.ts`'s `meet` writes with: the two keyed lists as the record declares them, the caller as the writer,
   * the project the caller is in, and the gate for a question.
   */
  function peopleDeps(as: WriteContext, project: () => string | null, propose: PeopleDeps['propose']): PeopleDeps {
    const people = meetsRole(registers.values());
    const orgs = orgRole(registers.values());
    return {
      sql,
      nowMs: clock.now(),
      mint,
      list: people === null ? undefined : { ...people, declaredFields: registers.get(people.register)?.fields ?? [] },
      orgs: orgs === null || orgs.register === people?.register ? undefined : { ...orgs, declaredFields: registers.get(orgs.register)?.fields ?? [] },
      project,
      nameOf,
      titleOf: titleOfRow,
      /* THROUGH THE MERGE DOOR: `meet`'s strong rules are the record's own merge, made as one batch Undo takes back. */
      write: (register, ref, patch, o = {}) =>
        write(
          register,
          ref,
          patch,
          {
            ...as,
            ...(o.version === undefined ? {} : { version: o.version }),
            ...(o.batch === undefined ? {} : { batch: o.batch }),
            ...(o.note === undefined ? {} : { note: o.note }),
          },
          { merge: true },
        ),
      propose,
      othersRow,
      moneyAt,
      attempt: (fn) => attempt(sql, transaction, fn),
    };
  }

  /**
   * Whether a member other than an owner made this row: then no merge folds it without asking them, and `meet` leaves
   * it out of every question it opens. A row a member's agent made through its run is that member's, as the ladder reads
   * it (`personOf`); a row made by a rule, an import or a run no member's key opened is the record's.
   */
  function othersRow(id: string): boolean {
    const by = madeByIn(sql, id);
    if (by === null) return false;
    const levels = sql.all<{ level: string }>('SELECT level FROM member WHERE person_id = ?', by).map((m) => m.level);
    if (levels.length > 0) return !levels.includes('owner');
    /* AND A GUEST, who holds the record by a share and no member row: their row folded into another person's would move
       their sign-in key there, and `$me` in their share with it. */
    return (
      sql.one(
        `SELECT 1 AS y FROM share s WHERE s.revoked_at IS NULL AND (
           (s.who_kind = 'person' AND s.who = ?)
           OR (s.who_kind = 'group' AND s.who IN (SELECT group_id FROM share_group_member WHERE person_id = ?))
           OR (s.who_kind = 'email' AND lower(s.who) = (SELECT lower(email) FROM person WHERE id = ?)))`,
        by,
        by,
        by,
      ) !== undefined
    );
  }

  /** Whether a live row of a list that holds money points at this one: a merge of two such is always asked. */
  function moneyAt(id: string): boolean {
    for (const decl of registers.values()) {
      if (decl.series || !decl.fields.some((f) => !f.retired && (f.type === 'money' || (f.type === 'list' && f.of === 'money')))) continue;
      if (!decl.fields.some((f) => !f.retired && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')))) continue;
      if (sql.one('SELECT 1 AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND instr(fields, ?) > 0 LIMIT 1', decl.id, id)) return true;
    }
    return false;
  }

  /**
   * Put a merge back (`kernel.undoMerge`). In a transaction only.
   *
   * BY THE MERGE'S OWN LINES, read from the log under its batch: a delete is restored, and a field is put back to what
   * it held before, only while it still holds what the merge wrote. The order is the one that keeps every unique field
   * free: the kept row gives back what it was carried first, then the folded row comes back and unfolds, then every
   * link that moved is pointed back at it.
   */
  function undoMerge(ref: string, w: WriteContext): Result<{ restored: string[] }> {
    const row = get(ref, { includeDeleted: true });
    let batch: string | null = null;
    if (row) {
      const list = keyedOf(row.register);
      const field = list === undefined ? undefined : mergeFieldOf(list);
      const set =
        field === undefined || typeof row.fields[field] !== 'string'
          ? null
          : sql.one<{ id: string; batch: string | null }>(
              'SELECT id, batch FROM event WHERE target = ? AND field = ? AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1',
              `entry:${row.id}`,
              field,
            );
      if (!set) return no('VALUE_MALFORMED', `${titleOfRow(row.id) ?? 'That one'} was not merged into anybody, so there is no merge to undo.`, { at: 'ref' });
      batch = set.batch ?? set.id;
    } else if (sql.one("SELECT 1 AS n FROM event WHERE batch = ? AND kind = 'edit' LIMIT 1", ref)) batch = ref;
    if (batch === null) return no('VALUE_MALFORMED', `Nothing called ${ref} was merged, so there is no merge to undo.`, { at: 'ref' });

    const lines = sql.all<{ target: string; kind: string; field: string | null; from_v: string | null; to_v: string | null; actor: string }>(
      'SELECT target, kind, field, from_v, to_v, actor FROM event WHERE batch = ? OR id = ? ORDER BY rowid',
      batch,
      batch,
    );
    /* THE FOLDED ROWS ARE THE ONES WHOSE `merged_into` THIS BATCH SET. */
    const folded = (l: (typeof lines)[number]): boolean => {
      if (l.field === null || l.to_v === null) return false;
      const list = keyedOf(byId(l.target.replace(/^entry:/, ''), true)?.register ?? '');
      return list !== undefined && mergeFieldOf(list) === l.field;
    };
    const folds = new Set(lines.filter(folded).map((l) => l.target.replace(/^entry:/, '')));
    if (folds.size === 0) return no('VALUE_MALFORMED', 'That change was not a merge, so there is no merge to undo.', { at: 'ref' });
    type Undo = { restore: boolean; from: Map<string, string | null>; to: Map<string, string | null>; tagged: Map<string, unknown[]>; untagged: Map<string, unknown[]> };
    const plan = new Map<string, Undo>();
    for (const l of lines) {
      const id = l.target.replace(/^entry:/, '');
      const p = plan.get(id) ?? { restore: false, from: new Map(), to: new Map(), tagged: new Map(), untagged: new Map() };
      plan.set(id, p);
      if (l.kind === 'delete') p.restore = true;
      else if ((l.kind === 'edit' || l.kind === 'state') && l.field !== null) {
        if (!p.from.has(l.field)) p.from.set(l.field, l.from_v);
        p.to.set(l.field, l.to_v);
      } else if ((l.kind === 'tag' || l.kind === 'untag') && l.field !== null) {
        /* A LIST OF TEXT CHANGES BY ELEMENT, one line per element added or taken away, so it is undone by element. */
        const into = l.kind === 'tag' ? p.tagged : p.untagged;
        const said = l.kind === 'tag' ? l.to_v : l.from_v;
        if (said !== null) into.set(l.field, [...(into.get(l.field) ?? []), JSON.parse(said) as unknown]);
      }
    }
    const parse = (v: string | null): unknown => (v === null ? null : (JSON.parse(v) as unknown));
    const redacted = (v: string | null): boolean => v !== null && v.includes('--redacted--');
    const undone: string[] = [];
    const as: WriteContext = { actor: w.actor, cascade: false, batch: mint(), note: 'Undid a merge.' };
    /* THROUGH THE MERGE DOOR, the only way a folded row comes back and `merged_into` is cleared. */
    const put = (register: string, id: string, patch: Patch): Result<Entry> => write(register, id, patch, as, { merge: true });

    /* A LATER MERGE MOVED THINGS ON. A was folded into B here, and B into C since: a link this merge pointed at B now
       points at C, and the keys and names B was carried went on to C. So a ref is compared by where its chain ends, a
       link moved here goes back to the row it left, and what this merge carried that the later one moved on to C comes
       off C too, but only what a merge put there. */
    const endOf = (id: string): string => {
      const row = byId(id, true);
      const list = row === null ? undefined : keyedOf(row.register);
      const field = list === undefined ? undefined : mergeFieldOf(list);
      return field === undefined ? id : foldEnd(sql, field, id);
    };
    const onward = (v: unknown): unknown =>
      typeof v === 'string' ? endOf(v) : Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === 'string' ? endOf(x) : x)))] : v;
    const backward = (v: unknown): unknown =>
      typeof v === 'string' ? (folds.has(v) ? v : endOf(v)) : Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === 'string' && !folds.has(x) ? endOf(x) : x)))] : v;
    const isRef = (register: string, field: string): boolean => {
      const f = registers.get(register)?.fields.find((x) => x.id === field);
      return f !== undefined && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref'));
    };
    /** What this merge tagged onto `kept` that a later merge carried on to the end of its chain, and the end. */
    const carriedOn = (kept: Entry, p: Undo): { end: string; patch: Patch } | null => {
      const list = keyedOf(kept.register);
      const field = list === undefined ? undefined : mergeFieldOf(list);
      if (field === undefined || p.tagged.size === 0) return null;
      const chain = [kept.id, ...foldChain(sql, field, kept.id)];
      const end = chain.at(-1)!;
      const there = end === kept.id ? null : byId(end);
      if (!there) return null;
      const via = chain.slice(0, -1).map((id) => `entry:${id}`);
      const patch: Patch = {};
      for (const [f, added] of p.tagged) {
        const held = Array.isArray(there.fields[f]) ? (there.fields[f] as unknown[]) : [];
        const gone = added.filter((v) =>
          sql.one(
            `SELECT 1 AS n FROM event t WHERE t.target = ? AND t.kind = 'tag' AND t.field = ? AND t.to_v = ? AND t.batch IN (
               SELECT batch FROM event WHERE field = ? AND to_v IS NOT NULL AND batch IS NOT NULL AND target IN (SELECT value FROM json_each(?))) LIMIT 1`,
            `entry:${end}`,
            f,
            written(v as Json),
            field,
            JSON.stringify(via),
          ),
        );
        const left = held.filter((h) => !gone.some((v) => JSON.stringify(v) === JSON.stringify(h)));
        if (left.length !== held.length) patch[f] = left.length === 0 ? null : (left as Json);
      }
      return Object.keys(patch).length === 0 ? null : { end, patch };
    };

    const revert = (id: string, p: Undo): Result<null> => {
      if (p.restore) {
        const back = put(byId(id, true)!.register, id, { deleted_at: null });
        if (!back.ok) return back as Result<never>;
      }
      const now = byId(id, true);
      if (!now) return ok(null);
      const patch: Patch = {};
      for (const [field, from] of p.from) {
        const to = p.to.get(field) ?? null;
        if (redacted(from) || redacted(to)) continue;
        if (isRef(now.register, field)) {
          if (JSON.stringify(onward(now.fields[field] ?? null)) !== JSON.stringify(onward(parse(to)))) continue;
          const back = backward(parse(from));
          if (JSON.stringify(back) !== JSON.stringify(now.fields[field] ?? null)) patch[field] = back as Json;
          continue;
        }
        if (JSON.stringify(now.fields[field] ?? null) !== JSON.stringify(parse(to))) continue;
        patch[field] = parse(from);
      }
      for (const field of new Set([...p.tagged.keys(), ...p.untagged.keys()])) {
        if (field in patch) continue;
        const held = Array.isArray(now.fields[field]) ? (now.fields[field] as unknown[]) : [];
        const added = (p.tagged.get(field) ?? []).map((v) => JSON.stringify(v));
        const back = (p.untagged.get(field) ?? []).filter((v) => !held.some((h) => JSON.stringify(h) === JSON.stringify(v)));
        const list = [...held.filter((h) => !added.includes(JSON.stringify(h))), ...back];
        if (JSON.stringify(list) !== JSON.stringify(held)) patch[field] = list.length === 0 ? null : list;
      }
      if (Object.keys(patch).length > 0) {
        const out = put(now.register, id, patch);
        if (!out.ok) return out as Result<never>;
      }
      const on = folds.has(id) ? null : carriedOn(now, p);
      if (on) {
        const out = put(now.register, on.end, on.patch);
        if (!out.ok) return out as Result<never>;
      }
      return ok(null);
    };
    const foldRegister = byId([...folds][0]!, true)?.register;
    const ordered = [
      ...[...plan].filter(([id]) => !folds.has(id) && byId(id, true)?.register === foldRegister),
      ...[...plan].filter(([id]) => folds.has(id)),
      ...[...plan].filter(([id]) => !folds.has(id) && byId(id, true)?.register !== foldRegister),
    ];
    for (const [id, p] of ordered) {
      const out = revert(id, p);
      if (!out.ok) return out as Result<never>;
      if (folds.has(id)) undone.push(titleOfRow(id) ?? nameOf(id));
    }
    /* AND THE LADDER IS TOLD, as `undo.ts` tells it: a merge somebody put back is a change of theirs undone, so the agent
       whose meeting folded the two drops back to Ask on that kind (migration 25's `undone`). Once per batch. */
    const by = lines[0]?.actor ?? null;
    const kinds = new Set<string>();
    for (const l of lines) {
      const list = l.target.startsWith('entry:') ? byId(l.target.slice('entry:'.length), true)?.register : undefined;
      const kind = list === undefined ? null : kindOfEvent({ list, kind: l.kind, field: l.field, to_v: l.to_v }, shapeIn(sql, list));
      if (kind) kinds.add(kind.key);
    }
    sql.exec(
      'INSERT OR IGNORE INTO undone (batch, by_batch, actor, agent, kinds, undone_by, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      batch,
      as.batch!,
      by,
      by === null ? null : ladderAgentOf(sql, by),
      JSON.stringify([...kinds].sort()),
      w.actor,
      instant(clock.now()),
    );
    return ok({ restored: undone });
  }

  /** The record's own readers, as `undo-fold.ts` takes them. */
  function foldDeps(): FoldDeps {
    return {
      sql,
      byId,
      titleOf: titleOfRow,
      list: (register) => registers.get(register),
      mergeField: (register) => {
        const list = keyedOf(register);
        return list === undefined ? undefined : mergeFieldOf(list);
      },
    };
  }

  function reproject(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl || decl.series) return;
    const row = sql.one<{ rowid: number }>('SELECT rowid FROM entry WHERE id = ?', entry.id);
    if (!row) return;
    project(
      sql,
      { rowid: row.rowid, id: entry.id, register: entry.register, deleted: entry.deleted_at !== null },
      projectedText(decl.fields, entry.fields, decl.title),
    );
  }

  /**
   * One event per write.
   *
   * `MAX(event.rowid)` is the record's version, so this is not audit theatre: it is how "what
   * changed since I last looked" is a range scan rather than a diff of two snapshots.
   */
  function appendEvent(e: AppendedEvent): string {
    const id = mint();
    /* `30 §3`: a model suggests, proposes and predicts, and writes nothing else into the log. */
    slashMayWrite(e.actor, e.kind);
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
  /**
   * Every field of `register` that ANY VERSION of its declaration has ever marked redacted, retired or dropped
   * ones included, cached by the register's newest declaration version and checksum so a write reads it once.
   *
   * THE DECLARATION'S WHOLE HISTORY AND NOT THE STANDING ONE, the same reasoning `declare.ts`'s `sealedEver` and
   * `rules.ts`'s `sealedOf` give for a secret field's run-time guard: a field retired and dropped from the list
   * leaves the rows written under it holding the value still, and reading only the current declaration answered
   * `false` for it, so a row whose `pin` was secret before it was retired had `hunter2` folded straight into an
   * event's `to_v` the moment the live declaration no longer named `pin` at all.
   *
   * ONCE REDACTED, ALWAYS REDACTED, whatever a later version types the field. The kernel refuses `secret` or
   * `money` retyped to a plain type while a row holds a value, and passes the same change by way of a retire; the
   * rows written under the old type keep what they held, so every version is asked and the first `secret`,
   * `money` or `redact: true` any of them gives the field settles it for good.
   */
  const redactedKept = new Map<string, { key: string; ids: ReadonlySet<string> }>();
  const redactedFields = (register: string): ReadonlySet<string> => {
    const latest = sql.one<{ version: number; checksum: string }>(
      "SELECT version, checksum FROM declaration WHERE id = ? AND kind = 'register' ORDER BY version DESC LIMIT 1",
      `register.${register}`,
    );
    const key = latest === undefined ? '' : `${latest.version}:${latest.checksum}`;
    const kept = redactedKept.get(register);
    if (kept !== undefined && kept.key === key) return kept.ids;
    const ids = new Set<string>();
    for (const { body } of sql.all<{ body: string }>(
      "SELECT body FROM declaration WHERE id = ? AND kind = 'register' ORDER BY version",
      `register.${register}`,
    )) {
      let fields: unknown;
      try {
        fields = (JSON.parse(body) as { fields?: unknown } | null)?.fields;
      } catch {
        continue;
      }
      if (!Array.isArray(fields)) continue;
      for (const f of fields as unknown[]) {
        if (f === null || typeof f !== 'object') continue;
        const { id, type, of, redact } = f as { id?: unknown; type?: unknown; of?: unknown; redact?: unknown };
        if (typeof id !== 'string') continue;
        /* A `list<T>` IS A T FOR THIS, AND THE ELEMENT TYPE IS WHAT IS ASKED. This read the field's own
           type, which is `list` and not `money` for a `list<money>`, so an amount written as a list went
           into the ledger in full while the same amount written as a scalar did not: the disclosure
           above, reached by declaring the field the other way. */
        const kind = type === 'list' ? of : type;
        if (kind === 'secret' || kind === 'money' || redact === true) ids.add(id);
      }
    }
    redactedKept.set(register, { key, ids });
    return ids;
  };
  const redacts = (register: string, field: string): boolean => redactedFields(register).has(field);
  const shown = (register: string, field: string, value: Json | undefined): Json | undefined =>
    value === undefined ? undefined : redacts(register, field) ? REDACTED : value;

  /**
   * What the evaluator needs beyond SQL: the clock, and the shape of a register.
   *
   * `staged` IS A BATCH BEING INSTALLED, whose registers are not in `registers` yet. A rule naming
   * `jobs#1` in a ref to Things installed when Jobs arrived in the same `install` and was refused
   * `REF_REGISTER_MISMATCH` when it came after, because the lookup below read `jobs#1` as a title
   * while Jobs was only staged. The mismatch is a fact about the declarations, the spoken register
   * against the field's `to`, so the staged registers count as registers for it, with no row in any
   * of them yet.
   */
  /**
   * THE READ CONTEXT OF A VIEWER: every list it compiles is held to the rows nobody else kept private (`Schema.except`), so
   * a figure, a forecast or a table read through it cannot count a private row. Unchanged when no row is hidden from them.
   */
  const withViewer = (viewer: string | undefined, c: EvalContext): EvalContext => {
    if (viewer === undefined || !anyHiddenFrom(viewer)) return c;
    const inner = c.schemaOf;
    return { ...c, viewer, schemaOf: (register) => {
      const s = inner(register);
      return s === null ? null : { ...s, except: viewer };
    } };
  };

  /**
   * A FIGURE'S READING HELD ACROSS READS WHILE THE LISTS IT READ STAND (`held-readings.ts`), the day where the record is
   * holds, and for at most an hour: an agent's step on its run moves the runs list and no figure over the ledger.
   * Read through `tracing`, with the context's own reads noted too (a ref by name, the rates, the signs). A figure
   * that read the runs, the log or rows of no list is not held and is read each time, as before: a run's heartbeat
   * moves its row with no line.
   *
   * NEVER A READ AS OF ANOTHER DAY, A KEPT POINT'S, OR ONE HELD TO THE LISTS A MEMBER READS (`reads`): those are read
   * as they come. `how` keeps a read in its home currency apart from one in each currency (`readApart`). Handed out
   * and kept as copies, so a caller that reshapes one reshapes no other.
   */
  const readingsHeld = new HeldReadings<Result<Reading>>();
  const walksHeld = new HeldReadings<Runway | null>();
  const signsHeld = new HeldSigns<SignReading>();
  /** What `heldFacts` holds. */
  const factsHeld = new HeldReadings<unknown>();
  dropHeld = () => {
    readingsHeld.clear();
    walksHeld.clear();
    signsHeld.clear();
    factsHeld.clear();
    listsSeen = null;
  };
  knownList = (word) => registers.has(word);
  dayEdge = (ms) => {
    muted++;
    try {
      const zone = readableZone(recordTz());
      return dayAt(zone, ms) !== dayAt(zone, ms - 1) || dayAt('UTC', ms) !== dayAt('UTC', ms - 1);
    } finally {
      muted--;
    }
  };
  const daysIn = new Map<string, (ms: number) => string>();
  /** The day where the record is, in `tz`, at `now`. */
  const dayAt = (tz: string, now: number): string => {
    let days = daysIn.get(tz);
    if (days === undefined) daysIn.set(tz, (days = localDays(tz)));
    return days(now);
  };
  /**
   * `make` held in `store` under `key` while the lists it read stand and the day holds (`held-readings.ts`), for at most
   * `most`. What it read is noted by the reads of the kernel's own `Sql`, and a reading inside another is read by the
   * outer one too, held or not, so the outer is held by its lists as well. Never inside a write, whose rows may yet be
   * taken back; a transaction that has only read is no write (`txWrote`). A copy is handed out and a copy kept.
   */
  const holdAcross = <T>(store: HeldReadings<T>, key: string, tz: string, now: number, once: Stamps, make: () => T, most?: number): T => {
    if (depth > 0 && txWrote) return make();
    const day = dayAt(tz, now);
    const stampOf = (lists: readonly string[]): string => {
      muted++;
      try {
        return listsStamp(lists, once);
      } finally {
        muted--;
      }
    };
    const held = store.get(key, day, now, stampOf);
    if (held !== undefined) {
      for (const t of traces) within(t, held);
      for (const t of drawTraces) within(t, held);
      return structuredClone(held.value);
    }
    const trace = traceOf();
    traces.push(trace);
    let value: T;
    try {
      value = make();
    } finally {
      traces.pop();
    }
    for (const t of traces) within(t, trace);
    store.set(key, day, now, trace, structuredClone(value), stampOf, (list) => list === SESSION, most);
    return value;
  };
  /**
   * A FACT WORKED OUT FROM THE ROWS, HELD WHILE THE LISTS IT READ STAND (`holdAcross`), for a read that asks several: which
   * currencies a list's money is in, how many rows of a list fill a field. The answer has to be a function of `key` and the
   * lists alone. WHO MAY SEE IT IS NOT IN THE HOLD: `key` names the viewer where the read is held to one, and the caller
   * decides each time which lists to ask about. What a read names past the lists (the log, a kept line) holds it for at most
   * `HELD_SHORT_MS`. One `heldFacts()` a read, since each list's version is asked once for all of them.
   */
  const heldFacts = (): (<T>(key: string, make: () => T) => T) => {
    const once: Stamps = { rows: new Map() };
    let tz: string | undefined;
    return <T>(key: string, make: () => T): T => holdAcross(factsHeld as HeldReadings<T>, key, (tz ??= readableZone(recordTz())), clock.now(), once, make);
  };
  /**
   * A FIGURE'S READING HELD ACROSS READS WHILE THE LISTS IT READ STAND (`holdAcross`), the day where the record is
   * holds, and for at most an hour: an agent's step on its run moves the runs list and no figure over the ledger. A
   * figure that read the runs, the log or rows of no list is not held and is read each time, as before: a run's
   * heartbeat moves its row with no line.
   *
   * NEVER A READ AS OF ANOTHER DAY, A KEPT POINT'S, OR ONE HELD TO THE LISTS A MEMBER READS (`reads`): those are read
   * as they come. `how` keeps a read in its home currency apart from one in each currency (`readApart`).
   */
  /**
   * THE VITAL SIGNS AS A FIGURE AND HEALTH READ THEM (`signs-red`, `unread-now`, `signs`), each held until something it
   * read is written or its answer moves by the clock alone (`held-signs.ts`). Each was held over the lists it read for
   * at most `HELD_SHORT_MS`, and one that read the log, the questions or what arrived was read each time: Today read
   * every sign again on every open, about half of its time on his record (finish S1).
   *
   * THE STAMP: every write of the kernel's own counted by table (`writes`, and `writesAny` for one it could not read),
   * the lists named by their versions (`listsStamp`), and the newest line of the log for a sign that read a table the
   * record writes past the kernel, as the alarm's change marker reads it (`changeStamp`). A sign read inside a write is
   * read now and never held, as every held reading is; an outer reading that asked one reads past the lists.
   */
  const signsHeldNow = (): VitalSign[] => {
    const now = clock.now();
    const tz = recordTz();
    const zone = readableZone(tz);
    const day = dayAt(zone, now);
    const once: Stamps = { rows: new Map() };
    let head: string | undefined;
    const stampOf = (on: SignHeldOn): string => {
      muted++;
      try {
        head ??= on.head ? JSON.stringify(sql.one<{ r: number; id: string }>('SELECT rowid AS r, id FROM event ORDER BY rowid DESC LIMIT 1') ?? null) : undefined;
        return JSON.stringify([writesAny, on.lists.length > 0 ? listsStamp(on.lists, once) : null, on.tables.map((t) => writes.get(t) ?? 0), on.head ? (head ?? null) : null]);
      } finally {
        muted--;
      }
    };
    return readSigns(sql, now, tz, (sign, read) => {
      for (const t of traces) t.whole = true;
      for (const t of drawTraces) t.whole = true;
      if (depth > 0) return read(() => undefined);
      const key = JSON.stringify([sign, zone]);
      const held = signsHeld.get(key, day, now, stampOf);
      if (held !== undefined) return structuredClone(held.value);
      const trace = signTraceOf();
      signTraces.push(trace);
      let until: number | undefined;
      let value: SignReading;
      try {
        value = read((at) => (until = Math.min(until ?? Infinity, at)));
      } finally {
        signTraces.pop();
      }
      /* A READER THAT TOLD NOTHING is held for as long as every sign was (`SignLasts`). */
      const on = heldOn(trace, (list) => list === SESSION);
      signsHeld.set(key, { ...on, day, at: now, until: until ?? now + HELD_SHORT_MS, stamp: stampOf(on), value: structuredClone(value) }, trace);
      return value;
    });
  };
  /**
   * A READ'S OWN MEMO (`EvalContext.walks`) THAT HANDS ON WHAT IT READ. A walk worked out for one figure was handed to
   * the next figure over the same legs with no read of the rows, so the second was held across reads on no list at all
   * (`holdAcross`): on a new record, Today's Out, 30 days kept the nought it read before the first bill while In, 30
   * days beside it, read first, moved. Each value is kept with what making it read, and every reading being read when it
   * is handed out notes that too (`within`), as a held reading's lists are noted by the reading around it.
   */
  /* AND A DRAW BEING WATCHED (`drawsOf`) IS HANDED WHAT MAKING IT READ PAST THE LISTS TOO (`draw`), kept only when a draw
     was watched as it was made: a value made with none watching hands a draw its lists alone, and `whole` if it read past them. */
  const readMemo = (): ReadMemo => {
    const kept = new Map<string, { value: unknown; read: ReadTrace; draw: DrawTrace | null }>();
    return {
      once: <T>(key: string, make: () => T): T => {
        const was = kept.get(key);
        if (was !== undefined) {
          for (const t of traces) within(t, was.read);
          for (const t of drawTraces) if (was.draw === null) within(t, was.read);
          else withinDraw(t, was.draw);
          return was.value as T;
        }
        const read = traceOf();
        const draw = drawTraces.length > 0 ? drawTraceOf() : null;
        traces.push(read);
        if (draw !== null) drawTraces.push(draw);
        let value: T;
        try {
          value = make();
        } finally {
          traces.pop();
          if (draw !== null) drawTraces.pop();
        }
        kept.set(key, { value, read, draw });
        return value;
      },
    };
  };
  const readingHeld = (decl: MetricDecl, ctx: EvalContext, how: string, read: (sql: Sql, ctx: EvalContext) => Result<Reading>, once: Stamps = { rows: new Map() }): Result<Reading> => {
    if (ctx.asOfMs !== undefined || ctx.point === true || ctx.reads !== undefined) return read(sql, ctx);
    const tz = readableZone(ctx.tz);
    /* A FIGURE THAT SAYS `someone else` IS EACH READER'S OWN, and is held for each. */
    const whose = ctx.reader !== undefined && JSON.stringify(decl).toLowerCase().includes(SOMEONE_ELSE) ? ctx.reader : null;
    return holdAcross(readingsHeld, JSON.stringify([how, ctx.viewer ?? null, whose, tz, decl]), tz, ctx.nowMs, once, () => read(sql, ctx));
  };

  /**
   * THE PEOPLE ROWS OF EVERYBODY ON THE RECORD BUT `reader`, for a `where` that says `someone else` (a task's Owner is
   * not someone else: it is unassigned or it is yours). Read through the address each signs in with (`meOf`), so a
   * person nobody invited is nobody's. With no reader, or nobody else, it is a row id no row has, which `is not` passes.
   */
  const SOMEONE_ELSE = 'someone else';
  const NOBODY_ROW = 'e_nobody';
  const othersOf = (reader: string | undefined, people: string): string[] => {
    if (reader === undefined) return [NOBODY_ROW];
    const others = sql
      .all<{ person_id: string }>('SELECT DISTINCT person_id FROM member WHERE person_id <> ?', reader)
      .flatMap((m) => meOf(sql, m.person_id, people));
    return others.length === 0 ? [NOBODY_ROW] : [...new Set(others)];
  };

  const evalContext = (staged: readonly Declaration[] = [], viewer?: string, reader: string | undefined = viewer): EvalContext => withViewer(viewer, {
    nowMs: clock.now(),
    movesAt: (ms) => {
      for (const t of traces) within(t, { lists: [], instant: false, until: ms });
      for (const t of drawTraces) within(t, { lists: [], instant: false, until: ms });
    },
    ...(reader === undefined ? {} : { reader }),
    /* THE RECORD'S ZONE, SO A LIVE READ NAMES THE DAY THE NIGHT POINT WILL BE STORED UNDER. Without it
       `metric`, `list` and every page block dated `today` by UTC while `snapshot` dated it locally: in
       `Asia/Tokyo` at 00:05 on the 6th, `created_at is today` read 1100 live and 110 in the point
       (`test/metrics-live-local-day.test.ts`). A record with no identity yet has no zone and reads UTC,
       as it did. */
    tz: recordIdentity(sql)?.tz,
    /* WITH THE HOP (`hopSchemaOf`), for a declared figure's `pointed`: reach holds the figure to every list it hops to
       (`figureLists` in `money-figures.ts`). A rule compiles against the shared `schemaOf` it is handed, with none. */
    schemaOf: (register) => hopSchemaOf(register) ?? null,
    /* THE FIELD A LIST'S ROWS ARE NAMED BY, so a figure over the walk names the step it goes under on as the forecast does. */
    titleOf: (register) => registers.get(register)?.title ?? null,
    /* A ref is written by NAME in a sentence — `thing is Kiln` — because that is what a person says.
       The title field is the register's own, so the lookup is one indexed read per name.

       EVERY ROW BEARING IT, DELETED ONES TOO. It was `LIMIT 1` with no order, which over two Kilns
       answered whichever SQLite reached first and dropped the other's jobs; `lookupRef` says why both
       are the answer. And a deleted row's jobs still point at it, so its name still finds them, as
       its spoken id and its row id do. */
    refByTitle: (register, title) => {
      const decl = registers.get(register);
      if (!decl) return null;
      if (title.trim().toLowerCase() === SOMEONE_ELSE && register === meetsRole(registers.values())?.register) return othersOf(reader, register);
      /* AND THE NOBODY IT WAS READ AS, READ AGAIN: a page's block parses its sentence once and hands the tree to `list`,
         which looks every ref up a second time. `e_nobody` names no row, so with nobody signed in as a person (a key, an
         open self-host) Today's "Your work this week" was refused "owner is e_nobody: there is no people called e_nobody". */
      if (title.trim() === NOBODY_ROW) return [NOBODY_ROW];
      return sql
        .all<{ id: string }>(`SELECT id FROM entry WHERE register = ? AND json_extract(fields, '$.${decl.title}') = ?`, register, title)
        .map((r) => r.id);
    },
    /* AND BY THE ID AN AGENT IS HANDED, `things#1` or `S6`, read exactly as `get` reads one. A register
       that does not exist makes the words no id at all, so a title holding a `#` is still a title.
       A DELETED ROW ANSWERS, because `nameOf` names it `P6` in every `context` an agent is shown and
       refusing that id while one of its jobs still pointed at it named a row the record handed out. */
    refBySpoken: (said) => {
      const arriving = staged.flatMap((d) => (d.kind === 'register' ? [d.body as { id?: unknown; seq_prefix?: unknown }] : []));
      const stagedPrefix = (): { register: string; seq: number } | null => {
        for (const b of arriving) {
          if (typeof b.id !== 'string' || typeof b.seq_prefix !== 'string' || b.seq_prefix === '#') continue;
          const n = said.trim().startsWith(b.seq_prefix) ? said.trim().slice(b.seq_prefix.length) : '';
          if (/^[1-9][0-9]*$/.test(n)) return { register: b.id, seq: Number(n) };
        }
        return null;
      };
      const at = parseSpoken(said) ?? prefixed(said) ?? stagedPrefix();
      if (!at) return null;
      if (registers.has(at.register)) return { register: at.register, id: bySeq(at.register, at.seq, true)?.id ?? null };
      return arriving.some((b) => b.id === at.register) ? { register: at.register, id: null } : null;
    },
    /* AND BY ITS ROW ID, WHICH WAS TAKEN ON TRUST. An id naming no row, or a row of another list,
       answered `ok 0` in both forms, where the same row named by a spoken id is refused. Deleted rows
       answer, for the spoken id's reason.

       A ROW PURGED PAST RETENTION IS STILL A ROW ITS LEDGER NAMES. `nameOf` hands out the bare id
       for it, since there is no row left to number, so the filter has to take that id too; `purge`
       writes the list the row was on into its `purge` event, and that is where the register is read. */
    refById: (id) => {
      const row = byId(id, true);
      if (row) return row.register;
      const was = sql.one<{ from_v: string | null }>(
        "SELECT from_v FROM event WHERE target = ? AND kind = 'purge' AND field = 'register' LIMIT 1",
        `entry:${id}`,
      )?.from_v;
      const register: unknown = was ? JSON.parse(was) : null;
      return typeof register === 'string' ? register : null;
    },
    /* THE HOME CURRENCY AND THE DATED RATES, read only when a money figure meets a second currency. The rates are the
       rows of the list declaring `rates:`, read by the fields it names, or of `fx` by the old names on a record whose
       money pack is older than the key (`roles.ts`); a record with neither has none. */
    fx: () => {
      const held = ratesRole(registers.values());
      return {
        home: homeCurrency(sql),
        rates: held
          ? ratesFrom(
              sql
                .all<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL', held.register)
                .map((r) => JSON.parse(r.fields) as Record<string, unknown>),
              held.fields,
            )
          : [],
      };
    },
    /* THE VITAL SIGNS NOW, for the built-in `signs-red`, handed in because `metrics.ts` cannot import `signs.ts` without breaking the kernel's load.
       READ ONCE FOR THE CONTEXT, which lasts one read: Today asked them for `signs-red` and again for `unread-now`, every
       sign walked twice. Handed out as copies, so a reader that changed one changes nothing the next is handed. */
    signs: ((): (() => ReturnType<typeof readSigns>) => {
      let read: ReturnType<typeof readSigns> | undefined;
      return () => structuredClone((read ??= signsHeldNow()));
    })(),
    /* THE HOST'S BUILD, for the door's `behind`: handed in by `openRecord`'s caller, null when it said none. */
    build: opts.build ?? null,
  });

  /**
   * THE BUILT-IN SIGNS AND THE RECORD'S OWN, every figure declared `vital: true` read as a sign (`readDeclaredSigns`), so
   * a declared sign over a source it could not read shows as `none` on the page and through `signs`. Nothing had called
   * it, and a declared vital was never listed. `signs-red` still counts the built-in signs alone: a declared figure is
   * read through `evalContext`, and that would read itself.
   */
  /* `built` IS THE BUILT-IN SIGNS ALREADY READ, by a walk that read them for a figure (`pageWalk`), so they are not read twice. */
  /* HELD AS A FIGURE'S ARE (`signsHeldNow`), so Health, the briefing and the alarm's kept reading read a sign once
     between the writes it reads, and the alarm's reading is the one Today's open finds. */
  const everySign = (built: VitalSign[] = signsHeldNow()): VitalSign[] => {
    const ctx = evalContext();
    const decls = sql
      .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
      .map((r) => liveTarget(sql, JSON.parse(r.body) as MetricDecl, ctx));
    const taken = new Set(built.map((s) => s.sign));
    const own = readDeclaredSigns(sql, decls, ctx)
      .filter((d) => !taken.has(d.sign))
      .map((d): VitalSign => ({ sign: d.sign, name: d.name, state: d.state, value: d.value, said: d.said, facts: [], days: [] }));
    return [...built, ...own];
  };

  /** What the page layer reads through. It runs queries it did not write, so it takes callbacks. */
  /**
   * The lists a block reads beside its source, for `registersOf`: the steps under a card grid's `as: next` and `as: ring`,
   * the projects a scope column or an inherited read is drawn from, and the list of projects a live run is named from.
   * DECLARATIONS ONLY, so naming them reads no row.
   */
  const beside = (deps: PageDeps = pageDeps()): ListsBeside => {
    return {
      ...(deps.stepsOf ? { stepsOf: deps.stepsOf } : {}),
      ...(deps.scopeOf ? { scopeOf: deps.scopeOf } : {}),
      ...(deps.lists ? { lists: deps.lists } : {}),
      ...(deps.metrics ? { metrics: deps.metrics } : {}),
      ...(deps.packOf ? { packOf: deps.packOf } : {}),
      /* AND THE SOURCES THE RECORD HANDS IN (`PageDeps.hostSources`), so one that reads across the record is named `*`. */
      ...(deps.hostSources ? { hostSources: deps.hostSources } : {}),
      projects: () => [...registers.values()].find((r) => r.scopes !== undefined)?.id ?? null,
    };
  };

  /** A governance body read back from its column: an object, or nothing when it is not one. */
  const parsedBody = (body: unknown): Record<string, unknown> => {
    let read = body;
    if (typeof read === 'string')
      try {
        read = JSON.parse(read) as unknown;
      } catch {
        read = null;
      }
    return read !== null && typeof read === 'object' && !Array.isArray(read) ? (read as Record<string, unknown>) : {};
  };

  /** A pack named as its manifest names it, for the line saying what accepting a question does. */
  const packName = (id: string): string | null => {
    const row = sql.one<{ manifest: string }>('SELECT manifest FROM pack WHERE id = ?', id);
    if (!row) return null;
    try {
      const name = (JSON.parse(row.manifest) as { name?: unknown }).name;
      return typeof name === 'string' && name.trim() !== '' ? name : null;
    } catch {
      return null;
    }
  };

  /*
   * ONE SUGGESTION AS A QUEUE DRAWS IT, open or put off.
   *
   * THE OPTIONS ARE THE BODY'S OWN AND NOTHING IS INVENTED HERE. A proposal of any other kind is
   * accepted or rejected, and those two words belong to whatever is drawing the screen: the kernel
   * does not know what language the reader has, and a host that filled them in here would have two
   * places saying "Accept". So a question of another kind comes back with no options and the drawer
   * puts its own two there.
   *
   * A BODY IS WHATEVER THE PROPOSER WROTE, so every field is checked on the way out rather than
   * trusted: an option missing its label is left out, not drawn as `undefined`. What accepting does
   * is read off the body here, in the person's own names (`does.ts`), and a queue keeps it on its
   * lead question alone.
   */
  /**
   * How many open questions share the cause of the suggestion `s`, itself included: a column for the query that reads a
   * page's questions, so a family is counted in SQL. A question put off is still open and counts. The unique index of
   * migration 31 keeps one open question a cause, so on a sound record this reads 1: more is the index gone missing.
   */
  const ALIKE_SQL = "(SELECT COUNT(*) FROM suggestion o WHERE o.status = 'open' AND o.cause = s.cause)";

  const questionFrom = (r: Record<string, unknown>): QueueQuestion => {
    const body = parsedBody(r.body);
    const kind = String(r.body_kind ?? '');
    const offered = kind === 'options' && Array.isArray(body.options) ? (body.options as unknown[]) : [];
    const withheld = costRows(sql);
    /* A BANK'S TAIL ASKED ABOUT (`tail:` bodies): the money its waiting messages hold, one value a currency, never added. */
    const tailMoney = tailMoneyOf(body);
    const options = offered.flatMap((o) => {
      if (o === null || typeof o !== 'object' || Array.isArray(o)) return [];
      const one = o as Record<string, unknown>;
      if (typeof one.id !== 'string' || typeof one.label !== 'string') return [];
      /* WHAT THE OPTION IS, checked again on the way out: a body filed before `showsOf` existed holds whatever it was
         sent, and a swatch is the one colour from data a drawer puts on a screen. */
      const shows = showsOf(one.shows);
      /* AN OPTION ITS PROPOSER MARKED HARD SAYS SO ON ITS OWN LINE (`weigh.ts` `optionCost`): the question's band no
         longer rises for one hard option beside a safe one, so the drawer marks the option and keeps a key off it. An
         option that writes money, or patches a field its list's history withholds, is hard by what it writes. */
      const hard = optionCost(one, withheld) === 'undo';
      /* WHAT IT DOES, SAID FOR ITS PICTURE: its own patches in names, and a tail's waiting money on every answer
         that names an account. */
      const said = Array.isArray(one.patches) ? optionSaidOf(one.patches as unknown[]) : null;
      const files = tailMoney !== null && !TAIL_LEAVES.has(one.id) ? tailMoney : null;
      return [
        {
          key: one.id,
          label: one.label,
          because: typeof one.because === 'string' ? one.because : '',
          recommended: one.recommended === true,
          ...(shows ? { shows } : {}),
          ...(hard ? { hard: true as const } : {}),
          ...(said ? { said } : {}),
          ...(files ? { files } : {}),
        },
      ];
    });
    const specOf = (list: string, field: string) => registers.get(list)?.fields.find((f) => f.id === field);
    const does = doesOf(kind, body, {
      list: (id) => registers.get(id)?.name ?? null,
      pack: packName,
      row: titleOfRow,
      /* A FIELD BY THE LABEL THE RECORD SHOWS, so what leaves with a call reads "Due on" from the list and not from its id. */
      field: (list, field) => specOf(list, field)?.label ?? null,
      /* A FIELD THE LIST LACKS IS NOT NAMED: the write refuses it, so the yes changes nothing there (`DoesNames.holds`).
         `tags` is the one field every list takes without declaring it (`withTags`); `deleted_at` never reaches here,
         since a patch holding it is a delete or a bring back and names no field. */
      holds: (list, field) => field === 'tags' || specOf(list, field) !== undefined,
      /* WHAT THE ENTRY HOLDS NOW, for the line of what a change changes, and never a secret or a file (`does.ts`). */
      before: (at, field) => {
        const row = get(at, { includeDeleted: true });
        const spec = row ? specOf(row.register, field) : undefined;
        const type = spec?.type === 'list' ? spec.of : spec?.type;
        return !row || !spec || type === 'secret' || type === 'file' ? undefined : (row.fields[field] ?? null);
      },
      /* A LINK BY THE TITLE OF WHAT IT POINTS AT and a choice by its label, as `cardFacts` reads them; a link that names nothing is not said. */
      value: (list, field, raw) => {
        const spec = specOf(list, field);
        const type = spec?.type === 'list' ? spec.of : spec?.type;
        const one = (v: unknown): unknown => (v === null || v === '' ? null : type === 'ref' ? (typeof v === 'string' ? (titleOfRow(v) ?? undefined) : undefined) : type === 'enum' && typeof v === 'string' ? (spec?.labels?.[v] ?? v) : v);
        return Array.isArray(raw) ? raw.map(one) : one(raw);
      },
    });
    /* THE NAMES A MERGE QUESTION IS ABOUT, each checked on the way out as an option is: a handle, a name, and at most a
       few words of where they were seen. */
    const candidates: QueueCandidate[] = (Array.isArray(body.candidates) ? (body.candidates as unknown[]) : []).flatMap((c) => {
      if (c === null || typeof c !== 'object' || Array.isArray(c)) return [];
      const one = c as Record<string, unknown>;
      if (typeof one.at !== 'string' || typeof one.name !== 'string') return [];
      const seen = Array.isArray(one.seen) ? one.seen.filter((w): w is string => typeof w === 'string').slice(0, 5) : [];
      return [{ at: one.at, name: one.name, seen, ...(one.kept === true ? { kept: true as const } : {}) }];
    });
    const facts = cardFacts(r, kind, body);
    /* WHO WAS HANDED IT TO DECIDE, only when somebody was, so a queue nobody handed reads as it did. */
    const decider = deciderOfIn(sql, String(r.id));
    return {
      id: String(r.id),
      who: String(r.opened_by ?? ''),
      at: String(r.opened_at ?? ''),
      kind,
      question: nameSpoken(questionOf(sql, String(r.id)) ?? ''),
      /* AN AGENT THAT SAYS ITS REASON AS `why` (as an option says its own `because`) is read too, so its card says why. */
      why: typeof body.context === 'string' ? body.context : typeof body.why === 'string' ? body.why : '',
      /* MONEY CHANGED ON A ROW IS ALWAYS HARD TO UNDO, so a card that moves it is never accepted with Enter (`BAND_SQL`
         ranks it so, as `costOf` does). The floor is asked as well, since it reads a money field cleared, which no body
         spells. A new row that records an amount (`records`) moves nothing and is deleted like any row, so it is not. */
      cost: (facts.money !== undefined && facts.records !== true) || movesMoney(r, kind, body) ? 'undo' : costOf(kind, body, costRows(sql)),
      options,
      ...(typeof body.about === 'string' && body.about !== '' ? { about: body.about } : {}),
      /* AND THE LIST A ROWSET ADDS TO OR CHANGES, which a question naming no row of its own is on (`list is people`). */
      ...(kind === 'rowset' && typeof body.register === 'string' && body.register !== '' ? { rows_on: body.register } : {}),
      body_kind: kind,
      ...(does ? { does } : {}),
      ...(kind === 'pack' || kind === 'settings' || kind === 'arrange' ? { arranged: body } : {}),
      /* HOW LONG IT CAN WAIT, read in the queue's own query (`whole`), never once a question. */
      ...(r.wait === 'soon' || r.wait === 'old' || r.wait === 'new' ? { waits: r.wait } : {}),
      ...(candidates.length > 0 ? { candidates } : {}),
      ...(Array.isArray(body.rows) ? { held: body.rows.length } : {}),
      /* WHAT IT IS ABOUT, AS ONE KEY, and how many open questions share it, read in the page's own query
         (`ALIKE_SQL`) and never once per question. Absent from a question the record has no cause for. */
      ...(typeof r.cause === 'string' && r.cause !== '' ? { cause: r.cause, alike: Math.max(1, Number(r.alike ?? 1)) } : {}),
      ...facts,
      ...(decider !== null ? { decider } : {}),
    };
  };

  /**
   * Whether accepting this proposal hits the money floor (`change-kind.ts`), read as the ladder reads it for whoever
   * opened it: a money amount set, changed or cleared. Only a rowset writes rows, so only one is read.
   */
  const movesMoney = (r: Record<string, unknown>, kind: string, body: Record<string, unknown>): boolean =>
    kind === 'rowset' && kindsOfProposal(kind, body, recordReader(sql, String(r.opened_by ?? ''))).some((k) => k.floor === 'money' && k.verb !== 'add');

  /** A value that is money: a whole number of minor units with a three-letter currency. */
  const moneyIn = (v: unknown): { amount: number; currency: string } | null => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
    const m = v as { amount?: unknown; currency?: unknown };
    return typeof m.amount === 'number' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string' && /^[A-Z]{3}$/u.test(m.currency)
      ? { amount: m.amount, currency: m.currency }
      : null;
  };

  /*
   * WHAT THE DECISION CARD SAYS BESIDE THE QUESTION: who asked from which run and app, who drafted it, the money accepting
   * writes, what changes on the row it updates, and the kinds of change it is. Each is left off when the record cannot
   * say it, and none is invented: a run is named only by what it said it was doing, and a value only as the row holds it.
   *
   * THE MONEY IS EACH VALUE AS WRITTEN, one a row, and never two currencies added: the card says one line a currency.
   * THE CHANGES ARE ONE ROW'S, since a field name alone across several rows would not say which row moves, and a secret or
   * a file is never said.
   *
   * THE RUN AND THE CHANGES ONLY TO A READER OF EVERY LIST (`every`): what a run was doing, a row's value now and the
   * title a link points at may sit on lists a member invited to one of them cannot read. The queue is drawn only for a
   * reader of the whole record, so it hands `true`; `queueQuestion` hands what its caller says of the reader.
   */
  const cardFacts = (r: Record<string, unknown>, kind: string, body: Record<string, unknown>, every = true): QuestionFacts => {
    const out: QuestionFacts = {};
    const by = String(r.opened_by ?? '');
    if (every && isRunName(by)) {
      const run = bySeq(SESSION, Number(by.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)), true);
      if (run) {
        const doing = typeof run.fields.doing === 'string' ? run.fields.doing.trim() : '';
        const hints = {
          ...(typeof run.fields.agent === 'string' ? { agent: run.fields.agent } : {}),
          ...(typeof run.fields.client === 'string' ? { client: run.fields.client } : {}),
        };
        out.run = { id: by, ...(doing === '' ? {} : { name: clipTitle(doing) }), app: runAgentOf(hints).name };
      }
    }
    if (typeof r.drafted_by === 'string' && r.drafted_by !== '' && !r.drafted_by.startsWith(ASKED_KEY)) out.drafted_by = r.drafted_by;
    const kinds = keysOfStamp(typeof r.kind === 'string' ? r.kind : null);
    if (kinds.length > 0) out.kinds = kinds;
    if (kind !== 'rowset' || !Array.isArray(body.rows)) return out;
    const register = typeof body.register === 'string' ? body.register : '';
    const rows = (body.rows as unknown[]).filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x));
    const writes = rows.map((x) => ('at' in x ? x.patch : x)).filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x));
    const money = writes.flatMap((w) => Object.values(w).flatMap((v) => moneyIn(v) ?? []));
    if (money.length > 0) out.money = money;
    /* AND WHETHER IT IS ALL ON ROWS ACCEPTING ADDS: an entry that records what the bank already moved, moving nothing. */
    const patched = rows.some((x) => 'at' in x && x.patch !== null && typeof x.patch === 'object' && Object.values(x.patch as Record<string, unknown>).some((v) => moneyIn(v) !== null));
    if (money.length > 0 && !patched) out.records = true;
    const [only] = rows;
    const said = every ? rowsSaidOf(register, rows) : null;
    if (said !== null) out.rows_said = said;
    if (!every || rows.length !== 1 || only === undefined || typeof only.at !== 'string' || writes.length !== 1) return out;
    const row = get(only.at, { includeDeleted: true });
    const list = registers.get(register);
    if (!row || row.register !== register || !list) return out;
    /* A LINK IS SAID BY THE TITLE OF THE ROW IT POINTS AT, and an enum by its label where it has one, since a person reads
       the card and a row id is never shown to one; a link that names no row leaves its change off rather than say an id. */
    const named = (type: string | undefined, labels: Readonly<Record<string, string>> | undefined, v: unknown): Json | null | undefined => {
      if (v === null || v === undefined || v === '') return null;
      if (Array.isArray(v)) {
        const each = v.map((x) => named(type, labels, x));
        return each.includes(undefined) ? undefined : (each as Json[]);
      }
      if (type === 'ref') return typeof v === 'string' ? (titleOfRow(v) ?? undefined) : undefined;
      if (type === 'enum' && typeof v === 'string') return labels?.[v] ?? v;
      return v as Json;
    };
    const changes = Object.entries(writes[0]!).flatMap(([field, after]) => {
      const spec = list.fields.find((f) => f.id === field);
      const type = spec?.type === 'list' ? spec.of : spec?.type;
      if (!spec || type === 'secret' || type === 'file') return [];
      const label = typeof spec.label === 'string' && spec.label.trim() !== '' ? spec.label.trim() : undefined;
      const before = named(type, spec.labels, row.fields[field]);
      const now = named(type, spec.labels, after);
      return before === undefined || now === undefined ? [] : [{ field, ...(label ? { label } : {}), before, after: now }];
    });
    if (changes.length > 0) out.changes = changes;
    return out;
  };

  /**
   * WHAT A ROWSET OF MANY ROWS, OR OF NEW ONES, DOES, IN NAMES (`QueueQuestion.rows_said`): read off the body and the
   * list's own declaration alone, so a card of forty rows reads no row. A choice is said by its label, a word or a number
   * as it is; a link, a secret, a file, money and a long text are left out, which a card says in its other lines.
   */
  const rowsSaidOf = (register: string, rows: readonly Record<string, unknown>[]): NonNullable<QueueQuestion['rows_said']> | null => {
    const list = registers.get(register);
    const adds = rows.filter((x) => !('at' in x));
    if (!list || (rows.length < 2 && adds.length === 0)) return null;
    const titles = adds.map((x) => x[list.title]).filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => clipTitle(t.trim()));
    const counted = new Map<string, { field: string; label?: string; to: Json; n: number }>();
    for (const x of rows) {
      const patch = 'at' in x ? x.patch : null;
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) continue;
      for (const [field, value] of Object.entries(patch as Record<string, unknown>)) {
        const spec = list.fields.find((f) => f.id === field);
        if (!spec || (spec.type !== 'enum' && spec.type !== 'bool' && spec.type !== 'int' && spec.type !== 'day')) continue;
        if (value === null || value === undefined || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) continue;
        const to = spec.type === 'enum' && typeof value === 'string' ? (spec.labels?.[value] ?? value) : value;
        const key = `${field}\n${String(to)}`;
        const label = typeof spec.label === 'string' && spec.label.trim() !== '' ? spec.label.trim() : undefined;
        const was = counted.get(key);
        if (was) was.n += 1;
        else counted.set(key, { field, ...(label ? { label } : {}), to: to as Json, n: 1 });
      }
    }
    const moves = [...counted.values()].sort((a, b) => b.n - a.n).slice(0, ROWS_SAID_MOVES);
    if (titles.length === 0 && moves.length === 0) return null;
    return { list: list.name, rows: rows.length, adds: titles.slice(0, ROWS_SAID_NAMES), more: Math.max(0, titles.length - ROWS_SAID_NAMES), moves };
  };

  /**
   * WHAT AN OPTION'S OWN PATCHES DO, IN NAMES (`QueueOption.said`): the list of the first row, how many rows, and what each
   * field moves them to, most first. A choice by its label, a link by the title of the row it points at (asked once a
   * value), a word, a number or a day as it is; a secret, a file, money and a long text are left out. `null` when it says
   * nothing, or the rows are on more than one list.
   */
  const optionSaidOf = (patches: readonly unknown[]): NonNullable<QueueOption['said']> | null => {
    const rows = patches.filter((x): x is { at: string; patch: Record<string, unknown> } => {
      const r = x as { at?: unknown; patch?: unknown } | null;
      return r !== null && typeof r === 'object' && typeof r.at === 'string' && r.patch !== null && typeof r.patch === 'object' && !Array.isArray(r.patch);
    });
    const first = rows[0] === undefined ? null : get(rows[0].at, { includeDeleted: true });
    const list = first ? registers.get(first.register) : undefined;
    if (!first || !list) return null;
    const handle = rows[0]!.at.split('#')[0];
    if (rows.some((x) => x.at.split('#')[0] !== handle)) return null;
    const titles = new Map<string, string | null>();
    const counted = new Map<string, { field: string; label?: string; to: Json; n: number }>();
    for (const x of rows)
      for (const [field, value] of Object.entries(x.patch)) {
        const spec = list.fields.find((f) => f.id === field);
        if (!spec || value === null || value === undefined || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) continue;
        let to: Json;
        if (spec.type === 'ref' && typeof value === 'string') {
          if (!titles.has(value)) titles.set(value, titles.size < ROWS_SAID_MOVES * 2 ? titleOfRow(value) : null);
          const title = titles.get(value);
          if (title === null || title === undefined) continue;
          to = title;
        } else if (spec.type === 'enum' && typeof value === 'string') to = spec.labels?.[value] ?? value;
        else if (spec.type === 'bool' || spec.type === 'int' || spec.type === 'day') to = value;
        else continue;
        const key = `${field}\n${String(to)}`;
        const label = typeof spec.label === 'string' && spec.label.trim() !== '' ? spec.label.trim() : undefined;
        const was = counted.get(key);
        if (was) was.n += 1;
        else counted.set(key, { field, ...(label ? { label } : {}), to, n: 1 });
      }
    const moves = [...counted.values()].sort((a, b) => b.n - a.n).slice(0, ROWS_SAID_MOVES);
    return moves.length === 0 ? null : { list: list.name, rows: rows.length, moves };
  };

  /** A tail's answers that name no account: the waiting goes on, so no money is filed by them. */
  const TAIL_LEAVES: ReadonlySet<string> = new Set(['none', 'later', 'reject']);

  /** The money a tail question's waiting messages hold (`body.totals`, minor units by currency), or `null`. */
  const tailMoneyOf = (body: Record<string, unknown>): { amount: number; currency: string }[] | null => {
    if (body.tail === null || typeof body.tail !== 'object' || body.totals === null || typeof body.totals !== 'object' || Array.isArray(body.totals)) return null;
    const out = Object.entries(body.totals as Record<string, unknown>).flatMap(([currency, amount]) =>
      /^[A-Z]{3}$/u.test(currency) && typeof amount === 'number' && Number.isSafeInteger(amount) && amount !== 0 ? [{ amount, currency }] : [],
    );
    return out.length === 0 ? null : out;
  };

  /** The lists a read of what went quiet watches: every one this record declares but the kernel's own list of runs. */
  const watchedLists = (): { id: string; name: string }[] => [...registers.values()].filter((r) => r.id !== SESSION).map((r) => ({ id: r.id, name: r.name }));

  /**
   * The page layer's reads with what only the declarations say read once: every figure as the record declares it, and
   * the add-on each declaration came with. ONE SYNCHRONOUS READ ONLY, so nothing is declared under it: `pages` asked
   * both again for every figure-like path on every page (161 figures and a query each, per path), and a walk of the pages
   * asked them for every block it held from a reader.
   */
  const declaredOnce = (deps: PageDeps): PageDeps => {
    const { metrics, packOf } = deps;
    let figures: readonly MetricDecl[] | undefined;
    const packs = new Map<string, string | null>();
    return {
      ...deps,
      ...(metrics ? { metrics: () => (figures ??= metrics()) } : {}),
      ...(packOf
        ? {
            packOf: (id: string) => {
              if (!packs.has(id)) packs.set(id, packOf(id));
              return packs.get(id) ?? null;
            },
          }
        : {}),
    };
  };

  /**
   * A read's questions of the rows and the declarations asked once each (`blocksOf`): a list by the whole question asked
   * of it (its `where`, order, limit and cursor), every page, every figure and one figure by its id. ONLY FOR DEPS THAT
   * LAST ONE READ, as `pageDeps`' own figures and walks are: nothing is written under a synchronous read, so the rows
   * cannot move under it. Each answer is handed out as a copy, so a block that shapes the rows it was handed shapes its
   * own.
   */
  const onceForRead = (deps: PageDeps): Pick<PageDeps, 'list' | 'pages' | 'metric' | 'metrics'> => {
    const lists = new Map<string, ReturnType<PageDeps['list']>>();
    const figures = new Map<string, MetricDecl | null>();
    let pages: PageDecl[] | undefined;
    let every: readonly MetricDecl[] | undefined;
    const { metrics } = deps;
    return {
      list: (q) => {
        const key = JSON.stringify([q.register, q.where ?? null, q.limit ?? null, q.order ?? null, q.cursor ?? null]);
        let got = lists.get(key);
        if (got === undefined) {
          got = deps.list(q);
          lists.set(key, got);
        }
        return structuredClone(got);
      },
      pages: () => structuredClone((pages ??= deps.pages())),
      metric: (id) => {
        if (!figures.has(id)) figures.set(id, deps.metric(id));
        const got = figures.get(id) ?? null;
        return got === null ? null : structuredClone(got);
      },
      ...(metrics ? { metrics: () => structuredClone((every ??= metrics())) } : {}),
    };
  };

  /**
   * `declaredOnce` KEPT ACROSS CALLS, for the one question that is only about declarations: which lists a block reads.
   * A `<module>.<figure>` path asks every figure and the add-on each came with, a query apiece, and the record asks it
   * of every block it holds from a reader, so the Money page read about 1,460 packs for one look. The figures, the packs
   * and the figure behind an id are kept for a declaration revision (an install or a removal reloads it), and a figure
   * is the declaration whole without its live target, since a target names no list.
   */
  let declKept: { revision: number; deps: PageDeps } | null = null;
  /* THE PAGES OF ROWS AS `pages()` LAST FILLED THEM, and the lists each page reads, for the declaration revision they
     were made under (`pages`). */
  let pagesKept: { revision: number; filled: Map<string, PageDecl>; lists: Map<string, string[]> } | null = null;
  const declaredKept = (): PageDeps => {
    if (declKept !== null && declKept.revision === revision) return declKept.deps;
    /* EVERY FIGURE'S BODY AND EVERY DECLARATION'S PACK READ IN ONE QUERY EACH, the first time one is asked: a record that
       woke read them one a query, about 320 of the 800 its first `boot` asked. */
    let bodies: Map<string, string> | undefined;
    let packed: Map<string, string | null> | undefined;
    const base = pageDeps(undefined, undefined, {
      bodies: () =>
        (bodies ??= new Map(
          sql.all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND retired = 0").map((r) => [r.id, r.body]),
        )),
      packs: () =>
        (packed ??= new Map(
          sql
            .all<{ id: string; pack: string | null }>("SELECT id, coalesce(pack_id, json_extract(body, '$.pack')) AS pack FROM declaration WHERE superseded_at IS NULL AND retired = 0")
            .map((r) => [r.id, r.pack]),
        )),
    });
    const { packOf } = base;
    let figures: readonly MetricDecl[] | undefined;
    const packs = new Map<string, string | null>();
    const metrics = new Map<string, MetricDecl | null>();
    const deps: PageDeps = {
      ...base,
      metric: (id) => {
        if (!metrics.has(id)) metrics.set(id, base.metric(id));
        return metrics.get(id) ?? null;
      },
      metrics: () =>
        (figures ??= sql
          .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
          .map((r) => JSON.parse(r.body) as MetricDecl)),
      ...(packOf
        ? {
            packOf: (id: string) => {
              if (!packs.has(id)) packs.set(id, packOf(id));
              return packs.get(id) ?? null;
            },
          }
        : {}),
    };
    declKept = { revision, deps };
    return deps;
  };

  /* `sees` IS THE READER'S LENS OVER WHAT READS ACROSS THE RECORD (`PageSees`): the log's lines, the questions and the
     lists what went quiet is read over, each left out when the host says she is not shown it. */
  /* `held` IS THE FIGURES' AND PACKS' DECLARATIONS ALREADY READ WHOLE, for the deps kept a revision (`declaredKept`), so
     each figure and each declaration's pack asked of them is one lookup and not one query. */
  const pageDeps = (viewer?: string, sees?: PageSees, held?: { bodies: () => ReadonlyMap<string, string>; packs: () => ReadonlyMap<string, string | null> }): PageDeps => {
    /* A WALK AHEAD IS WORKED OUT ONCE FOR A READ: every figure and block over the same legs walked the rows again, one
       row at a time, and a page of figures read the same walk some thirty times. These deps last one read, so the rows
       cannot change under it. */
    const walked = new Map<string, ReturnType<NonNullable<PageDeps['runway']>>>();
    const walks = readMemo();
    const readings = new Map<string, ReturnType<typeof evaluateMetric>>();
    /* AND THE LISTS' VERSIONS ASKED ONCE FOR THE READ (`listsStamp`), which writes nothing. */
    const once: Stamps = { rows: new Map() };
    /* AND THE READ'S CLOCK, ZONE AND RATES BUILT ONCE (each figure read built them again: the record's row and the home
       currency, a query apiece). */
    const here = { ...evalContext([], viewer), walks };
    return {
    pages: () =>
      sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'page' AND superseded_at IS NULL AND retired = 0")
        .map((r) => JSON.parse(r.body) as PageDecl),
    metric: (id) => {
      const row = held
        ? ((body) => (body === undefined ? undefined : { body }))(held.bodies().get(`metric.${id}`))
        : sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${id}`);
      /* A DECLARED FIGURE FIRST, and the record's own figures after (`built-in-figures.ts`), so a page can gate on
         how many questions are waiting without a pack declaring the count. */
      return row ? liveTarget(sql, JSON.parse(row.body) as MetricDecl, here) : builtInFigure(id);
    },
    /* A FIGURE IS READ ONCE FOR A READ, by its declaration whole (a parameter filled in is another figure): a page asks
       the same figure for a cell, a condition and a note, and nothing changes under one read. */
    read: (decl) => {
      const key = JSON.stringify(decl);
      let got = readings.get(key);
      if (got === undefined) {
        got = readingHeld(decl, here, 'read', (s, c) => evaluateMetric(s, decl, c), once);
        readings.set(key, got);
      }
      return structuredClone(got);
    },
    /* WITH NO CURRENCY TO ADD UP IN, so each currency is its own amount: the reader's own rows, as `read` reads them. */
    readApart: (decl) => readingHeld(decl, { ...here, fx: () => ({ home: null, rates: [] }) }, 'apart', (s, c) => evaluateMetric(s, decl, c), once),
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
        ...(viewer === undefined ? {} : { reader: viewer }),
      }, scopeFor(undefined, q.register, viewer, anyHiddenFrom(viewer, q.register)));
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched, cursor: out.value.cursor }) : out;
    },
    /* WITH THE HOP, as a figure has it (`hopSchemaOf`): a block's `where` may read a field through a link (`through`),
       the Ledger's `stays` among them, and a block over the Ledger reads what a figure beside it reads. */
    schemaOf: (register) => hopSchemaOf(register) ?? null,
    titleOf: (register) => registers.get(register)?.title ?? null,
    listName: (register) => registers.get(register)?.name ?? null,
    /* WITHOUT THIS LINE `readPage` NEVER LAYS ANOTHER PACK'S BLOCKS ON A PAGE, because `deps.adds` is
       optional and this is the one host that hands it: `additionsOf` reads every installed pack's manifest for
       what it adds to this page's declaration id. */
    adds: (page) => additionsOf(sql.all<{ id: string; manifest: string }>('SELECT id, manifest FROM pack WHERE disabled_at IS NULL ORDER BY id'), page),
    /* AND THIS LINE TURNS THE ENGINE ON: every page is read under its live `look.<page>`, or the rules'
       look when none is stored (`compose.ts`, `lookedAt` in `pages.ts`). */
    look: (page) => {
      const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'look' AND superseded_at IS NULL AND retired = 0", `look.${page}`);
      return row ? (JSON.parse(row.body) as unknown) : null;
    },
    /* THE RECORD'S VITAL SIGNS, as the record's `signs` reads them (`signs.ts`), so a page block with `source: signs`
       draws them. Without this line the block refuses as not in this build. */
    signs: () => everySign(),
    /* THE STEPS RUNS LEFT AND NOBODY TOOK, in one project or on the whole record (`openSteps`), so a
       `handoffs.open` block draws them on Agents. Without this line the block refuses as not in this build. */
    handoffs: (project) => openSteps(sql, clock.now(), project, viewer),
    /* WHAT WENT QUIET (`openExceptions`), over every list this record declares but the kernel's own list of
       runs, so an `exceptions` block draws them. Without this line the block refuses as not in this build. */
    exceptions: () => openExceptions(sql, clock.now(), watchedLists().filter((l) => !anyHiddenFrom(viewer, l.id) && (sees?.list(l.id) ?? true))),
    /* BLOCKING READS DECLARED ACTIONS AND THEIR SCHEDULE, NOT ROWS: owner-level bookkeeping by design, so no private-row clause. */
    blocking: (project) => actionsBlocking(sql, clock.now(), project, recordTz()),
    /* `into` GOES THROUGH, so a walk opened from one book walks in the book's own currency. Dropped here, the page asked
       for the book's currency and this host walked the home one, drawn once per currency instead. */
    runway: (opening, legs, horizon, only, into) => {
      const key = JSON.stringify([opening, legs, horizon, only, into]);
      if (walked.has(key)) return structuredClone(walked.get(key)!);
      /* AND HELD ACROSS READS WHILE THE LISTS IT WALKED STAND (`holdAcross`), the day holding. */
      const zone = readableZone(recordTz());
      const answer = holdAcross(walksHeld, key, zone, clock.now(), once, () => {
        const out = runway(
          { sql, schemaOf: (r) => hopSchemaOf(r) ?? null, titleOf: (r) => registers.get(r)?.title ?? null, hydrate: rowIn, ctx: { ...evalContext(), walks } },
          opening,
          legs,
          horizon,
          only,
          into,
        );
        return out.ok ? out.value : null;
      });
      walked.set(key, answer);
      return structuredClone(answer);
    },
    ctx: here,
    tz: recordIdentity(sql)?.tz ?? 'UTC',
    /* THE FOUR FIELDS A MEASURE NEEDS AND NOTHING ELSE, by the same expressions an index on them is built from, and the
       newest reading of each measure beside them so a measure that went quiet still says when it last spoke. */
    /* HELD WHILE THE LISTS IT READ STAND (`holdAcross`), by who reads: two scans of a long list of readings for one block. */
    readings: (q) =>
      holdAcross(factsHeld as HeldReadings<ReturnType<NonNullable<PageDeps['readings']>>>, JSON.stringify(['readings', q, viewer ?? null]), readableZone(recordTz()), clock.now(), once, () => {
        if (!registers.has(q.register)) return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });
        const schema = { ...schemaOf(q.register), ...(anyHiddenFrom(viewer, q.register) ? { except: viewer } : {}) };
        const c = compile(q.where, schema);
        if (c.bad.length) return { ok: false, refusal: c.bad[0]! };
        const at = fieldSqlIn(schema, q.when);
        /* AND THE PROJECT EACH WAS REPORTED FOR, when the list says: its scope field, else its one field pointing at the
           projects (the list declaring `scopes:`). Two projects' "Orders" are two measures (`measures.ts`), and the newest
           reading before the period is each one's, not whichever project reported last. Read by the list's declaration,
           never by a field's id, so any list of readings that points at its projects is grouped the same way. */
        const projects = [...registers.values()].find((r) => r.scopes !== undefined)?.id ?? null;
        const fields = registers.get(q.register)?.fields ?? [];
        const aims = (f: (typeof fields)[number] | undefined) => f !== undefined && !f.retired && f.type === 'ref' && 'to' in f && f.to === projects;
        const scoped = scopeFieldOf(fields);
        const pointing = fields.filter(aims);
        const thing = projects === null ? undefined : aims(scoped) ? scoped : pointing.length === 1 ? pointing[0] : undefined;
        /* AND THE READING AS MONEY when the block names a money field: minor units and a code, which `measures.ts`
           reads in place of `value`, so a reading of USD 48.15 is never drawn as 4815. THE WHOLE VALUE, read as text:
           `fieldSqlIn` on a money field reads its number alone (the path a sort uses), and a number with no code is the
           very misreading this stops. */
        const amount = q.amount ? fieldSqlIn(schema, q.amount, 'text') : 'NULL';
        /* AND THE GROUP A MEASURE IS LISTED UNDER, the block's sixth column, said as a person reads it below. */
        const grouped = q.group ? fields.find((f) => f.id === q.group && !f.retired) : undefined;
        const cols = `${at} AS at, ${fieldSqlIn(schema, q.value)} AS value, ${amount} AS amount, ${q.name ? fieldSqlIn(schema, q.name) : 'NULL'} AS name, ${q.unit ? fieldSqlIn(schema, q.unit) : 'NULL'} AS unit, ${thing ? fieldSqlIn(schema, thing.id) : 'NULL'} AS thing, ${grouped ? fieldSqlIn(schema, grouped.id) : 'NULL'} AS grp`;
        const from = `FROM entry WHERE register = ? AND deleted_at IS NULL AND (${c.sql})`;
        type Read = { at: unknown; value: unknown; amount: unknown; name: unknown; unit: unknown; thing: unknown; grp: unknown };
        const titles = new Map<string, string | null>();
        /* A TITLE READ BY THE LIST THE LINK POINTS AT, so this read is held on that list and a project renamed moves it. A row
           that is not on it is looked for anywhere, which reads past the lists and so is not held. */
        const titleIn = (to: unknown, id: string): string | null => {
          const list = typeof to === 'string' ? registers.get(to) : undefined;
          const row = list === undefined ? undefined : sql.one<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND id = ?', list.id, id);
          if (!row) return titleOfRow(id);
          const said = (JSON.parse(row.fields) as Record<string, Json>)[list!.title];
          return typeof said === 'string' && said.trim() !== '' ? said.trim() : null;
        };
        /* THE PROJECT BY ITS NAME, never its id: a reading of a project with no title is of no project a person can name.
           ITS ID STILL KEEPS IT APART (`project`, never drawn): two untitled projects' "Orders" were one line through both
           projects' numbers. */
        /* A GROUP BY A LINK IS ITS ROW'S NAME, by a choice its label, and anything else as it is held. */
        const labels = grouped && 'labels' in grouped && grouped.labels && typeof grouped.labels === 'object' ? (grouped.labels as Record<string, string>) : null;
        const groupOf = (v: unknown): string | null => {
          if (v === null || v === undefined || v === '') return null;
          if (grouped?.type === 'ref' && typeof v === 'string') {
            if (!titles.has(v)) titles.set(v, titleIn(grouped.to, v));
            return titles.get(v) ?? null;
          }
          const said = String(v);
          return labels !== null && Object.hasOwn(labels, said) ? labels[said]! : said;
        };
        const named = ({ thing: of, grp, ...r }: Read): RawReading => {
          const under = grouped ? groupOf(grp) : null;
          const withGroup = under === null ? r : { ...r, group: under };
          if (typeof of !== 'string' || of === '') return withGroup;
          if (!titles.has(of)) titles.set(of, titleIn(thing?.to, of));
          const title = titles.get(of);
          return title ? { ...withGroup, of: title, project: of } : { ...withGroup, project: of };
        };
        const readings = sql.all<Read>(`SELECT ${cols} ${from} AND ${at} >= ?`, q.register, ...c.params, q.since).map(named);
        const latest = sql
          .all<Read>(`SELECT at, value, amount, name, unit, thing, grp FROM (SELECT ${cols}, max(${at}) AS newest ${from} AND ${at} < ? GROUP BY name, thing, grp)`, q.register, ...c.params, q.since)
          .map(named);
        return ok({ readings, latest });
      }),
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
    home: () => homeCurrency(sql),
    /* EVERY LIST AND EVERY LIVE FIGURE, declarations only, which `deadlines`, `figures.home` and a sell knob choose from. */
    lists: () => [...registers.values()],
    metrics: () => {
      const ctx = evalContext();
      return sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
        .map((r) => liveTarget(sql, JSON.parse(r.body) as MetricDecl, ctx));
    },
    packOf: (id) =>
      held
        ? (held.packs().get(id) ?? null)
        : (sql.one<{ pack: string | null }>("SELECT coalesce(pack_id, json_extract(body, '$.pack')) AS pack FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0", id)?.pack ?? null),
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
    /* EACH ROW'S NEWEST LINE IN ONE READ, for a block's bylines: its batch as `undo.ts` keys one (its own id when it was
       given none), and for a run its agent, the app it ran in and the person its key acts for. */
    lastChanges: (ids) => {
      const out = new Map<string, LastChange>();
      if (ids.length === 0) return out;
      const lines = sql.all<{ target: string; actor: string; ts: string; batch: string }>(
        `SELECT target, actor, ts, coalesce(batch, id) AS batch FROM event
         WHERE rowid IN (SELECT MAX(rowid) FROM event WHERE target IN (SELECT 'entry:' || value FROM json_each(?)) GROUP BY target)`,
        JSON.stringify(ids),
      );
      const runs = new Map<string, Pick<LastChange, 'agent' | 'app' | 'for'>>();
      const runOf = (actor: string): Pick<LastChange, 'agent' | 'app' | 'for'> => {
        const known = runs.get(actor);
        if (known) return known;
        const prefix = registers.get(SESSION)?.seq_prefix ?? 'S';
        const run = isRunName(actor) ? bySeq(SESSION, Number(actor.slice(prefix.length)), true) : null;
        const agent = run && typeof run.fields.agent === 'string' && run.fields.agent !== '' ? run.fields.agent : undefined;
        const hints = {
          ...(agent === undefined ? {} : { agent }),
          ...(run && typeof run.fields.client === 'string' ? { client: run.fields.client } : {}),
        };
        const person = run ? personOf(sql, actor) : null;
        const said = { ...(agent === undefined ? {} : { agent }), ...(run ? { app: runAgentOf(hints).name } : {}), ...(person ? { for: person } : {}) };
        runs.set(actor, said);
        return said;
      };
      for (const l of lines) {
        const agent = l.actor.startsWith('agent:') ? { agent: l.actor.slice('agent:'.length) } : {};
        out.set(l.target.slice('entry:'.length), { actor: l.actor, ts: l.ts, batch: l.batch, ...agent, ...(isRunName(l.actor) ? runOf(l.actor) : {}) });
      }
      return out;
    },
    /* A RUN BY ITS HANDLE, ended or removed included, so a feed line a run signed says who that run is (`run_by` in
       `pages.ts`: its agent, the app it ran in and the run it helps). A handle that is no run's reads nothing. */
    runOf: (run) => (isRunName(run) ? bySeq(SESSION, Number(run.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)), true) : null),
    /* THE RUNS NOT FINISHED, the most recently heard from first. The block applies its own `where` and `limit`. */
    /* TWO RUNS SEEN IN THE SAME INSTANT COME THE OLDER FIRST (`id`), said in the query: left to the plan, the order of a
       tie moved when migration 39 gave the list a new index to walk. */
    sessionsLive: () =>
      sql
        .all<{ id: string }>(
          `SELECT id FROM entry WHERE register = '${SESSION}' AND deleted_at IS NULL AND state NOT IN (SELECT value FROM json_each(?))
           ORDER BY json_extract(fields, '$.last_seen') DESC, id`,
          JSON.stringify(FINISHED),
        )
        .map((r) => byId(r.id))
        .filter((e): e is Entry => e !== null),
    /* THE RUNS WORKING NOW, by the one clock (`presence.ts`), each read whole with its helpers counted under it. */
    sessionsWorking: () =>
      workingRuns(sql, clock.now()).flatMap((r) => {
        const run = byId(r.id);
        return run ? [{ run, helpers: r.helpers }] : [];
      }),
    /* THE RECORD'S SCHEDULED ACTIONS, as the `actions` read lists them: keys by label, nothing sealed read. */
    actions: () => listActions(sql, clock.now()),
    /* THE INSTALLED SCRIPTS, as the record's `scripts` read lists them, so a `scripts` block draws `/scripts`. */
    scripts: () => scriptRows(sql, clock.now()),
    /* WHO OPENED A KEY LAST, by the grant its row's secret field names: the newest `grant.read` event, as `keyState`
       reads it. `runs_on` answers who and when, never the grant. */
    keyOpened: (grant) =>
      sql.one<{ actor: string; ts: string }>("SELECT actor, ts FROM event WHERE target = ? AND kind = 'grant.read' ORDER BY rowid DESC LIMIT 1", `grant:${grant}`) ?? null,
    /* EVERY OPEN OF A KEY SINCE AN INSTANT, newest first, as the record's `usedBy` walks them (5000, its `USED_BY_WALK`).
       `runs_on` counts the runs among them and answers no grant. */
    keyUses: (grant, since) =>
      sql.all<{ actor: string; ts: string }>("SELECT actor, ts FROM event WHERE target = ? AND kind = 'grant.read' AND ts >= ? ORDER BY rowid DESC LIMIT 5000", `grant:${grant}`, since),
    /* THE FIELDS A LIST MARKS ITS ROWS BY, its `identity:`, which the chip beside a row's scope is drawn from (`scope_marks`). */
    identityOf: (register) => {
      const decl: Readonly<Record<string, unknown>> | undefined = registers.get(register);
      const said = decl?.identity;
      if (said === null || typeof said !== 'object' || Array.isArray(said)) return null;
      const { mark, accent } = said as { mark?: unknown; accent?: unknown };
      return { ...(typeof mark === 'string' ? { mark } : {}), ...(typeof accent === 'string' ? { accent } : {}) };
    },
    /*
     * THE OPEN QUESTIONS, for a `queue` block: what is waiting on a person, dearest first.
     *
     * FIRST BY HOW LONG IT CAN WAIT (`weigh.ts`): one due inside two days or moving money leads, then one open
     * past three days, then the rest, computed and never stored. Then RANKED BY WHAT IT WOULD COST TO GET EACH ONE WRONG (`weigh.ts`), which is `19 §6`'s fourth
     * countermeasure against the decision gate becoming a rubber stamp. The band is computed here
     * rather than stored, so it needs no migration and no proposer can assert it about their own
     * question. Within a band the OLDEST comes first: once there is a rank, the one worth meeting is
     * the expensive question that has been sitting rather than the expensive question that arrived a
     * minute ago. Each question is read by `questionFrom`, which says why its options are the body's own.
     */
    openQuestions: (limit, keep) => {
      const nowMs = clock.now();
      const now = instant(nowMs);
      const drawn = Math.max(0, Math.floor(limit));
      const OPEN = `status = 'open' AND (defer_until IS NULL OR defer_until <= ?) AND ${NOT_APART}`;
      const apart = apartJson({ sql, nowMs });
      /* ONLY THE QUESTIONS DRAWN ARE READ WHOLE (`questionFrom`). Every other one is ranked and counted by its band in SQL
         (`BAND_SQL`), so no body is read into this process to be counted: before, the newest past two
         thousand were dropped, and the counts beside the queue were counts of the two thousand. */
      const whole = (ids: readonly string[]): Map<string, Record<string, unknown>> =>
        new Map(
          ids.length === 0
            ? []
            : sql
                .all<Record<string, unknown>>(
                  `SELECT id, body_kind, body, opened_by, opened_at, drafted_by, kind, cause, ${ALIKE_SQL} AS alike, ${WAIT_SQL} AS wait FROM suggestion s WHERE id IN (SELECT value FROM json_each(?))`,
                  ...waitParams(nowMs),
                  JSON.stringify(ids),
                )
                .map((r) => [String(r.id), r]),
        );
      const open = countOpenQuestions({ sql, nowMs });
      /* THE FACTS OF EVERY OPEN QUESTION, each read in SQL once: who asked, the kind, the band, how long it can wait and
         what it is about, which a `where:` reads and the order and the counts are taken from. The band is the dear one
         (`BAND_SQL` reads the declarations), and a queue with no `where:` once weighed every question twice, to order
         them and again to count the hard ones. */
      const lean = sql
        .all<{ id: string; body_kind: string | null; opened_by: string | null; opened_at: string | null; cost: string; wait: string; about: string | null; on_list: string | null }>(
          `SELECT id, body_kind, opened_by, opened_at, ${BAND_SQL} AS cost, ${WAIT_SQL} AS wait,
             CASE WHEN json_valid(body) AND json_type(body) = 'object' AND json_type(body, '$.about') = 'text' THEN json_extract(body, '$.about') END AS about,
             ${ROWSET_LIST_SQL} AS on_list
           FROM suggestion WHERE ${OPEN}`,
          ...waitParams(nowMs),
          now,
          apart,
        )
        .map((r) => ({
          id: r.id,
          wait: r.wait,
          at: String(r.opened_at ?? ''),
          facts: { who: String(r.opened_by ?? ''), kind: String(r.body_kind ?? ''), cost: r.cost as Cost, about: r.about !== null && r.about !== '' ? r.about : null, rows_on: r.on_list || null },
        }));
      /* AND ONLY THE QUESTIONS THE READER IS SHOWN (`PageSees`), asked before anything is counted, so every count is hers. */
      const hers = sees ? lean.filter((q) => sees.question('suggestion', q.id)) : lean;
      const kept = keep ? hers.filter((q) => keep(q.facts)) : hers;
      /* A STABLE ORDER: how long it can wait first (`weigh.ts` `waitRank`, AGT-C08: due inside two days or moving money,
         then open past three days, then new), then the band, then the oldest first within it, since the expensive
         question that has been sitting is the one worth meeting, and the id when two were asked in the same millisecond,
         so two reads never swap them. */
      kept.sort((a, b) => waitRank(a.wait) - waitRank(b.wait) || costRank(a.facts.cost) - costRank(b.facts.cost) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      const ids = kept.slice(0, drawn).map((q) => q.id);
      const rows = whole(ids);
      const questions = ids.flatMap((id) => {
        const r = rows.get(id);
        return r ? [questionFrom(r)] : [];
      });
      const stale = kept.filter((q) => staleAt(q.at, nowMs)).length;
      const hardToUndo = kept.filter((q) => q.facts.cost === 'undo').length;
      return { questions, open: sees ? hers.length : open, matched: kept.length, stale, hardToUndo };
    },
    /*
     * THE QUESTIONS PUT OFF, for a page's Later: still open, with a day to come back that has not come, soonest back
     * first. They leave this read on that day and join the open ones, which is the one place they are counted twice
     * nowhere: `countOpenQuestions` reads the same day the other way.
     */
    laterQuestions: (limit) => {
      const now = instant(clock.now());
      const rows = sql.all<Record<string, unknown>>(
        `SELECT id, body_kind, body, status, opened_by, opened_at, defer_until, defer_why, drafted_by, kind, cause, ${ALIKE_SQL} AS alike FROM suggestion s
         WHERE status = 'open' AND defer_until > ? ORDER BY defer_until ASC, rowid ASC LIMIT ?`,
        now,
        sees ? -1 : Math.min(Math.max(1, Math.floor(limit)), 200),
      );
      /* THE READER'S OWN (`PageSees`): every one put off is read, hers kept, then cut, so her count is of hers. */
      const shown = sees ? rows.filter((r) => sees.question('suggestion', String(r.id))) : rows;
      const questions = shown.slice(0, Math.min(Math.max(1, Math.floor(limit)), 200)).map((r) => {
        const one = questionFrom(r);
        return { ...one, until: String(r.defer_until ?? ''), until_why: typeof r.defer_why === 'string' ? r.defer_why : '' };
      });
      const later = sees ? shown.length : (sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND defer_until > ?", now)?.n ?? 0);
      return { questions, later };
    },
    /*
     * AGENTS' SUGGESTIONS, for Decide's shelf beside Needs you (`govern.ts` `apartOf`): open and not counted as needing
     * the person, oldest first, each read whole as an open question is, so one press takes it as it takes any.
     */
    apartQuestions: (limit) => {
      const nowMs = clock.now();
      const ids = apartIds({ sql, nowMs });
      const shown = sees ? ids.filter((id) => sees.question('suggestion', id)) : ids;
      const cut = shown.slice(0, Math.min(Math.max(1, Math.floor(limit)), 200));
      const rows =
        cut.length === 0
          ? []
          : sql.all<Record<string, unknown>>(
              `SELECT id, body_kind, body, opened_by, opened_at, drafted_by, kind, cause, ${ALIKE_SQL} AS alike, ${WAIT_SQL} AS wait FROM suggestion s WHERE id IN (SELECT value FROM json_each(?))`,
              ...waitParams(nowMs),
              JSON.stringify(cut),
            );
      const byId = new Map(rows.map((r) => [String(r.id), r]));
      const questions = cut.flatMap((id) => {
        const r = byId.get(id);
        return r ? [questionFrom(r)] : [];
      });
      return { questions, apart: shown.length };
    },
    /*
     * WHAT WAS DECIDED, latest first, for a page's Decided: the question as it was asked, the option chosen and the
     * reason given. The proposal it answered says what kind of question it was and what it was about, read from the
     * suggestion the decision settled, and a chosen option is named by its own label.
     */
    decisions: (limit) => {
      /* THE READER'S OWN (`PageSees`): every decision is read, hers kept, then cut, so `total` is of hers. */
      const said = listGovernance({ sql, nowMs: clock.now() }, 'decision', sees ? { every: true } : { limit });
      const read = said.ok ? said.value : [];
      const hers = sees ? read.filter((d) => sees.question('decision', String(d.id))) : read;
      const decisions = (sees ? hers.slice(0, Math.max(1, Math.floor(limit))) : hers).map((d) => {
        const settled = typeof d.suggestion === 'string' ? getGovernance(sql, 'suggestion', d.suggestion) : null;
        const body = settled && settled.body !== null && typeof settled.body === 'object' && !Array.isArray(settled.body) ? (settled.body as Record<string, unknown>) : {};
        const answer = String(d.answer ?? '');
        const option = Array.isArray(body.options)
          ? (body.options as unknown[]).find((o) => o !== null && typeof o === 'object' && (o as { id?: unknown }).id === answer)
          : undefined;
        const label = option ? (option as { label?: unknown }).label : undefined;
        return {
          id: String(d.id),
          question: String(d.question ?? ''),
          answer,
          ...(typeof label === 'string' && label !== '' ? { answer_label: label } : {}),
          reason: String(d.reason ?? ''),
          who: String(d.decided_by ?? ''),
          at: String(d.ts ?? ''),
          kind: String(settled?.body_kind ?? ''),
          ...(typeof body.about === 'string' && body.about !== '' ? { about: body.about } : {}),
        };
      });
      return { decisions, total: sees ? hers.length : countGovernance(sql, 'decision') };
    },
    /* HOW MANY ROWS HOLD EACH VALUE OF ONE FIELD, for a page's reader filters, by the expression an index on the field
       is built from and in one query, so a strip of chips over a long list does not read the list. */
    /* AND HELD WHILE THE LISTS IT READ STAND (`holdAcross`), by who reads: each chip a scan of the list, some twelve on the Ledger. */
    tally: (q) =>
      holdAcross(factsHeld as HeldReadings<Result<{ value: Json; n: number }[]>>, JSON.stringify(['tally', q.register, q.field, q.where ?? null, viewer ?? null]), readableZone(recordTz()), clock.now(), once, () => {
        if (!registers.has(q.register)) return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });
        const schema = hopSchemaOf(q.register)!;
        const said = predicateOf(q.where, schema, evalContext());
        if (said.bad.length) return { ok: false, refusal: said.bad[0]! };
        const c = compile(said.predicate, schema);
        if (c.bad.length) return { ok: false, refusal: c.bad[0]! };
        /* AND NOT THE ROWS KEPT PRIVATE FROM THE PAGE'S READER (leak matrix N2), which the table under the chips leaves out
           through `list`: a chip counted them, so a strip over Kiln said one more in Review than the block drew. */
        const kept = admitClause(q.register, undefined, viewer);
        const rows = sql.all<{ value: Json; n: number }>(
          `SELECT ${fieldSqlIn(schema, q.field)} AS value, COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND (${c.sql})${kept === null ? '' : ` AND (${kept.sql})`} GROUP BY 1`,
          q.register,
          ...c.params,
          ...(kept === null ? [] : kept.params),
        );
        return ok(rows);
      }),
    /* A LIST ADDED UP IN ONE GROUPED QUERY, for a block that adds up (`wholeRead`): by each label, by the unit
       of what is added, and by the day a money amount is dated, so the page converts a sum a day and never a row. */
    whole: (q) => {
      if (!registers.has(q.register)) return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });
      /* WITH THE HOP, as every other read of a page has it, so a sum over the Ledger may leave out what stays yours. */
      const schema = hopSchemaOf(q.register)!;
      const c = compile(q.where, schema);
      if (c.bad.length) return { ok: false, refusal: c.bad[0]! };
      const by = q.by.map(({ field, day }) => (day ? `substr(${fieldSqlIn(schema, field)}, 1, 10)` : `NULLIF(${fieldSqlIn(schema, field, 'text')}, '')`));
      const type = q.value === null ? null : (schema.fields[q.value]?.type ?? 'text');
      const amount = q.value === null ? 'NULL' : fieldSqlIn(schema, q.value);
      const unit = type === 'money' ? `json_extract(fields, '${jsonPath(q.value!)}.currency')` : type === 'quantity' ? `json_extract(fields, '${jsonPath(q.value!)}.unit')` : 'NULL';
      const on = q.dated === null || q.value === null ? 'NULL' : `CASE WHEN ${amount} IS NULL THEN NULL ELSE substr(${fieldSqlIn(schema, q.dated)}, 1, 10) END`;
      const cols = [...by.map((e, n) => `${e} AS b${n}`), `${unit} AS unit`, `${on} AS day`, `COALESCE(SUM(${amount}), 0) AS sum`, `COUNT(*) AS n`, `COUNT(${amount}) AS said`, 'COUNT(DISTINCT id) AS entries'];
      const group = Array.from({ length: by.length + 2 }, (_, n) => n + 1).join(', ');
      /* THE SAME ROWS `list` READS FOR THE PAGE'S READER, so a sum is never over a row kept private from them. */
      const kept = admitClause(q.register, undefined, viewer);
      /* A SPLIT ROW IS ADDED UP AS ITS PARTS when the sum is of the money its parts add up to (`row-parts.ts`), so a part is
         counted under its own label and the total stays the row's. */
      const split = splitOf(schema);
      const grouped = `SELECT ${cols.join(', ')} FROM entry WHERE register = ? AND deleted_at IS NULL AND (${c.sql})${kept === null ? '' : ` AND (${kept.sql})`} GROUP BY ${group}`;
      const rows = sql.all<Record<string, unknown>>(
        split && q.value === split.of ? overSplitNow(sql, grouped, q.register, split.field) : grouped,
        q.register,
        ...c.params,
        ...(kept === null ? [] : kept.params),
      );
      /* A LABEL IS HANDED BACK AS THE ROW HOLDS IT, as the walk hands it: SQLite says a yes or no as 1 or 0 and a value
         of several parts (a list, an amount) as its JSON text, and a page would draw `1` and `["home"]` for them. */
      const held = q.by.map(({ field, day }) => (day ? null : (schema.fields[field]?.type ?? null)));
      const label = (v: unknown, type: string | null): Json => {
        if (v === undefined || v === null) return null;
        if (type === 'bool' && (v === 0 || v === 1)) return v === 1;
        if (typeof v !== 'string' || !(type === 'list' || type === 'json' || type === 'money' || type === 'quantity' || type === 'file') || !/^[[{]/.test(v)) return v as Json;
        try {
          return JSON.parse(v) as Json;
        } catch {
          return v;
        }
      };
      return ok(rows.map((r) => ({ by: q.by.map((_, n) => label(r[`b${n}`], held[n]!)), unit: typeof r.unit === 'string' ? r.unit : null, day: typeof r.day === 'string' ? r.day : null, sum: Number(r.sum), rows: Number(r.n), said: Number(r.said), entries: Number(r.entries) })));
    },
    /*
     * THE NEWEST EVENTS, for a `feed` or an `agents` block. A row's event names the row as a page names it,
     * `tickets#3`, with its title beside it, so a reader is never handed an entry id.
     *
     * NOT THE OWNER'S LINES. Keys, access, shares, members and sealed files belong to the owner's own screens (the record's
     * `lineOf` holds them to an owner), and a page is read by whoever may open it, so they are left out here.
     * The read mark is a person's, and the kernel does not know who is reading, so it is `null` here and the record's `page` puts the reader's own in.
     *
     * NOR THE RECORD'S OWN BOOKKEEPING (`bookkeeping`): the sweep writing runs off and an agent's daily stamps. The walk
     * reads on past them, a batch at a time and `FEED_WALK` lines at most, so `limit` lines of what changed come back
     * rather than the sweep's lines standing in their place.
     */
    activity: (limit) => {
      type Raw = { rowid: number; ts: string; actor: string; kind: string; target: string | null; target_kind: string | null; field: string | null; from_v: string | null; to_v: string | null; note: string | null; to_example: number };
      /* WHAT A LINE SAYS OF THE ROW IT IS ABOUT: its list, its number, what it is named by and whether it is an example. */
      type About = { register: string; seq: number | null; named: Json | undefined; example: boolean };
      const lines: Raw[] = [];
      const entryOf = (e: { target: string | null }): string | null => (e.target?.startsWith('entry:') ? e.target.slice('entry:'.length) : null);
      /* EACH ROW A LINE IS ABOUT IS READ ONCE, AND ONLY FOR WHAT THE LINE SAYS OF IT (scope 2026-10-25). Every line read
         its row whole, a query and a parse of every field, and on his record Today's feed was five hundred of them to
         draw eight. Now the rows of a batch's lines are one query, which answers each row's list, number, the field it is
         named by and whether it is tagged an example. A READER SHOWN ONLY SOME LINES (`sees`) is asked with the row
         whole, as `recentHistory` asks her. A row purged from the table is not there, as before. */
      const about = new Map<string, About | null>();
      const whole = new Map<string, Entry | null>();
      const rowOf = (id: string): Entry | null => {
        if (!whole.has(id)) whole.set(id, byId(id, true));
        return whole.get(id)!;
      };
      const titles = JSON.stringify(Object.fromEntries([...registers].flatMap(([id, d]) => (d.title ? [[id, d.title]] : []))));
      const learn = (batch: readonly Raw[]): void => {
        if (sees) return;
        const ids = [...new Set(batch.flatMap((e) => entryOf(e) ?? []))].filter((id) => !about.has(id));
        if (ids.length === 0) return;
        for (const id of ids) about.set(id, null);
        const rows = sql.all<{ id: string; register: string; seq: number | null; named: Json; text: number | null; example: number | null }>(
          `SELECT id, register, seq, json_extract(fields, '$.' || json_extract(?, '$.' || register)) AS named,
                  json_type(fields, '$.' || json_extract(?, '$.' || register)) = 'text' AS text,
                  json_type(fields, '$.tags') = 'array' AND EXISTS (SELECT 1 FROM json_each(fields, '$.tags') WHERE value = 'example') AS example
             FROM entry WHERE id IN (SELECT value FROM json_each(?))`,
          titles,
          titles,
          JSON.stringify(ids),
        );
        for (const r of rows) about.set(r.id, { register: r.register, seq: r.seq === null ? null : Number(r.seq), named: r.text === 1 ? r.named : undefined, example: r.example === 1 });
      };
      const aboutOf = (id: string): About | null => {
        if (!sees) return about.get(id) ?? null;
        const row = rowOf(id);
        if (!row) return null;
        const title = registers.get(row.register)?.title;
        const tags = row.fields.tags;
        return { register: row.register, seq: row.seq, named: title ? row.fields[title] : undefined, example: Array.isArray(tags) && tags.includes('example') };
      };
      /* AND A LINE THE READER IS NOT SHOWN IS NOT IN IT EITHER (`PageSees`), asked with the row it is about, as
         `recentHistory` asks it: a run's or an instruction's line, a personal list's, a question held from her. */
      const seen = (e: Raw): boolean => {
        if (!sees) return true;
        const id = entryOf(e);
        return sees.line({ kind: e.kind, target: e.target, target_kind: e.target_kind, field: e.field, row: id === null ? null : rowOf(id) });
      };
      /* A LINE ABOUT A ROW SOMEBODY ELSE KEPT PRIVATE IS NOT IN THE FEED (migration 40), whoever the feed is drawn for. */
      const kept = viewer === undefined ? '' : ` AND ${unprivateLine()}`;
      let before = Number.MAX_SAFE_INTEGER;
      for (let walked = 0; lines.length < limit && walked < FEED_WALK; ) {
        /* A NEW ROW'S LINE IS ASKED ONLY WHETHER THE ROW WAS AN EXAMPLE, all the feed reads of its fields (`feed.ts`), and
           its fields are left in the log: a project made with its notes carried them all. */
        const batch = sql.all<Raw>(
          `SELECT rowid, ts, actor, kind, target, target_kind, field, from_v, CASE WHEN kind = 'create' THEN NULL ELSE to_v END AS to_v, note,
                  CASE WHEN kind = 'create' AND json_valid(to_v) AND json_type(to_v, '$.tags') = 'array'
                       THEN EXISTS (SELECT 1 FROM json_each(to_v, '$.tags') WHERE value = 'example') ELSE 0 END AS to_example
             FROM event
            WHERE rowid < ? AND kind NOT LIKE 'grant.%' AND kind NOT LIKE 'access.%' AND kind NOT LIKE 'share.%'
              AND COALESCE(target_kind, '') NOT IN ('grant', 'vault_key', 'device_grant', 'member', 'person', 'sealed')${kept}
            ORDER BY rowid DESC LIMIT ?`,
          before,
          ...(viewer === undefined ? [] : [viewer]),
          FEED_BATCH,
        );
        learn(batch);
        for (const e of batch) {
          before = Number(e.rowid);
          walked += 1;
          /* ONLY AN EDIT, A SCRIPT'S RUN AND AN ADD-ON PUT IN ARE BOOKKEEPING BY WHAT THEY HOLD, so only theirs are parsed, and the list a
             line's row is on is the one the batch's query found. */
          const holds = e.kind === 'edit' || e.kind === 'pull' || e.kind === 'install';
          const id = entryOf(e);
          const listed = id === null || sees ? undefined : (about.get(id)?.register ?? null);
          if (!bookkeeping({ ...e, from: holds ? read(e.from_v) : null, to: holds ? read(e.to_v) : null }, listed) && seen(e)) lines.push(e);
          if (lines.length >= limit) break;
        }
        if (batch.length < FEED_BATCH) break;
      }
      type Line = FeedLine & { ts: string; actor: string; note: string | null; about: About | null; example: boolean };
      /* A QUESTION IS NAMED BY WHAT IT ASKS, AS A ROW IS BY ITS TITLE. A feed drew "suggested SG10", the question's
         number, where the line could say what was asked; a decision is the question it answered. Asked once a line,
         and only of a line about a question, so a feed of row edits costs nothing more. */
      const governedThing = (target: string | null): string | null => {
        const sg = target?.startsWith('suggestion:') ? target.slice('suggestion:'.length) : null;
        const d = target?.startsWith('decision:') ? target.slice('decision:'.length) : null;
        const said = sg !== null ? questionOf(sql, sg) : d !== null ? (sql.one<{ q: string }>('SELECT question AS q FROM decision WHERE id = ?', d)?.q ?? null) : null;
        return said === null || said.trim() === '' || said === '--erased--' ? null : nameSpoken(said.trim());
      };
      /* A RECORD SETTING ITSELF UP IS ONE ROW OF A FEED BLOCK TOO, as it is one line of `whatsNew` (`feed.ts`). */
      const setup = setupCollapser<Line>(
        (line) => line.about?.example === true,
        (line) => line.example,
      );
      const said: Line[] = [];
      for (const e of lines) {
        const id = entryOf(e);
        /* A DELETED ROW IS NAMED BY WHAT IT WAS LAST CALLED: its line read `entry:01K…` once the row was gone. A row purged
           from the table has no name left to give, so its line says what was done and to nothing. */
        const row = id === null ? null : aboutOf(id);
        const line: Line = {
          ts: e.ts,
          actor: e.actor,
          kind: e.kind,
          target: e.target,
          target_kind: e.target_kind,
          field: e.field,
          /* AN EDIT'S OLD VALUE, which says whether a link was set where there was none (`feed.ts`); nothing else is read. */
          from: e.kind === 'edit' ? read(e.from_v) : null,
          to: null,
          register: row?.register ?? null,
          seq: row?.seq ?? null,
          title: null,
          note: e.note,
          about: row,
          example: e.to_example === 1,
        };
        said.push(...setup.push(line));
      }
      said.push(...setup.flush());
      /* A RUN'S EVENT SAYS WHO THE RUN IS, as a line of the log does (`eventsBefore`), each run read once for the read. */
      const signed = runsSaid();
      return {
        events: said.map((e): ActivityEvent => {
          if (e.kind === SETUP_KIND) return { ts: e.ts, actor: e.actor, kind: e.kind, target: e.target, note: null, rows: typeof e.to === 'number' ? e.to : 0, ...signed(e.actor) };
          const id = entryOf(e);
          const row = e.about;
          if (!row) {
            const thing = id === null ? governedThing(e.target) : null;
            return { ts: e.ts, actor: e.actor, kind: e.kind, target: id === null ? e.target : null, note: e.note === '--erased--' ? null : e.note, ...(thing ? { thing } : {}), ...signed(e.actor) };
          }
          const named = row.named;
          return {
            ts: e.ts,
            actor: e.actor,
            kind: e.kind,
            target: `${row.register}#${row.seq}`,
            note: e.note === '--erased--' ? null : e.note,
            thing: typeof named === 'string' && named !== '' ? named : `${row.register}#${row.seq}`,
            ...signed(e.actor),
          };
        }),
        seen: null,
      };
    },
    };
  };

  /**
   * What a digest reads through.
   *
   * The same callbacks the page layer takes, plus the two things only a record can answer: who the
   * owners are, and what time it is where the customer is.
   */
  const digestDeps = (sees?: PageSees): DigestDeps => {
    /* A DIGEST GOES BY MAIL AND PUSH TO THE OWNERS, so it is read as NOBODY: no private row of anyone is in it. A digest
       shown on a screen to somebody else is read through her lens too (`sees`), so its feed and queue are hers. */
    const deps = pageDeps(NOBODY, sees);
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
      /* A COMPUTED SECTION'S BLOCK, read the way a page reads it (`digest-sources.ts`). */
      block: (b) => readBlock(deps, b),
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
      phones: () => ownersPushSubs(sql).length,
      /* A PUSH IS ONE JOB PER OWNER SUBSCRIPTION, `{ sub: { id } }` AND NOTHING ELSE (`51 §5`, `push.ts`). One per phone
         because the ack says whether THAT phone is gone; by id because the outbox travels in every `.brain` file and
         `push_sub` does not, so the endpoint comes out only under the lease (`pushTarget` below). And without the title
         and url `digest.ts` hands in: the Worker sends a push with no body (`apps/worker/src/vapid.ts`), so the words
         had nowhere to go but into every backup. A record nobody has subscribed on queues no push at all, where it used
         to queue one row a keyless host would leave `pending` for ever. */
      outbox: (kind, payload) => {
        if (kind !== 'notify.push') return void enqueue(sql, mint, clock.now(), kind, payload);
        /* AND THE CAUSE OF A TIME-SENSITIVE NOTICE THAT NAMES ONE (`notify`), a handle and never a word, so `told`
           below can say it was already told. A push that names no cause is its phone's id and nothing else, as before. */
        const cause = (payload as { cause?: unknown } | null)?.cause;
        /* AND WHERE IT OPENS (E44 of 24 October): the notice's path in this record, a handle and never a word, so a tap
           opens the question that needs him (`pushOpenOf`). A url that is not such a path is left out. */
        const open = pushOpenOf((payload as { url?: unknown } | null)?.url);
        /* AND WHAT KIND OF THING IT IS (`pushKindOf`), one word of a closed list, so an owner who turned that kind off
           (`push.off`) is not rung for it, and the phone can say the kind without saying anything of what. */
        const about = pushKindOf(payload as { cause?: unknown; url?: unknown } | null);
        const marked = { ...(typeof cause === 'string' && cause !== '' ? { cause } : {}), ...(open ? { open } : {}), kind: about };
        for (const id of ownersPushSubs(sql, about)) enqueue(sql, mint, clock.now(), 'notify.push', { sub: { id }, ...marked });
      },
      note: (actor, text, urgent) => noteEvent(sql, mint, clock.now(), actor, text, urgent),
      delivers: opts.delivers ?? [],
      /* ONE INTERRUPT AN HOUR, PER RECORD (09 §4). Counted over the outbox rather than over a
         counter somebody has to reset: the row IS the interrupt, so a push that was queued and never
         sent still counts — which is the conservative direction, and the only one that is honest
         about what the person's phone is going to do when the queue drains.

         AND THE INTERRUPT'S EMAIL COUNTS TOO, BECAUSE A RECORD NOBODY SUBSCRIBED ON QUEUES NO PUSH. Counted over push rows
         alone, the limit read "never interrupted" on every such record the day a push became one job per subscription,
         and `push.test.ts` measured two urgent writes in one minute mailing the owner twice. The email an interrupt
         queues is marked `interrupt` (`interruptDeps` below) so a digest's own email, which is not one, does not hold
         back the notice that a payment failed. */
      interrupted: () =>
        sql.one<{ n: number }>(
          `SELECT count(*) AS n FROM outbox WHERE created > ?
             AND ((kind = 'notify.push' AND json_extract(payload, '$.test') IS NOT 1) OR (kind = 'notify.email' AND json_extract(payload, '$.interrupt') = 1))`,
          instant(clock.now() - 3_600_000),
        )?.n
          ? true
          : false,
      /* THE RECORD'S OWN QUIET HOURS (`record.quiet`): inside them `notify` sounds nothing, and what was held
         leads the next digest (`held` below). Handed together, or a notice is held and then said by nothing. */
      quiet: quietOf(sql.one<{ quiet: string | null }>('SELECT quiet FROM record WHERE singleton = 1')?.quiet),
      /* HOW MANY THINGS WAIT ON THE PERSON: the open questions that are not put off, the number Decide shows. */
      waiting: () => {
        const open = readOpenQuestions(sql, { nowMs: clock.now() });
        return open.ok ? Number(open.value.value ?? 0) : 0;
      },
      /* WHETHER THIS CAUSE WAS ALREADY TOLD, counted over the push and the mail `notify` queued for it. A row stays in
         the outbox after it is sent, so once is once however long ago. */
      told: (cause) => (sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind IN ('notify.push', 'notify.email') AND json_extract(payload, '$.cause') = ?", cause)?.n ?? 0) > 0,
      /* THE TIME-SENSITIVE NOTES SINCE THE LAST DIGEST WENT. `runDigest` keeps the ones said inside quiet hours.

         "WENT" IS READ OFF WHAT A DIGEST LEAVES, ON ANY CHANNEL: its in-app note, or the mail or webhook it queued, which
         carry `because: digest.<id>`. Read off the note alone, a digest that only mails would lead with the same held
         notice every week for ever, since it writes no note. */
      held: () =>
        sql
          .all<{ ts: string; note: string | null }>(
            `SELECT ts, note FROM event WHERE kind = 'note' AND field = ?
               AND ts > max(
                 coalesce((SELECT max(ts) FROM event WHERE kind = 'note' AND actor LIKE 'digest:%'), ''),
                 coalesce((SELECT max(created) FROM outbox WHERE kind IN ('notify.email', 'notify.webhook') AND json_extract(payload, '$.because') LIKE 'digest.%'), '')
               ) ORDER BY ts`,
            URGENT_NOTE,
          )
          .map((e) => ({ at: Date.parse(e.ts), say: e.note ?? '' })),
      mint,
      nowMs: clock.now(),
      tz: recordIdentity(sql)?.tz ?? 'UTC',
    };
  };

  /**
   * What an urgent notice reads through: `digestDeps`, with the email it queues marked as an interrupt.
   *
   * THE MARK IS WHAT THE HOUR'S LIMIT COUNTS WHEN NO PUSH WAS QUEUED (`interrupted` above). An email from a digest and
   * one from an interrupt were otherwise the same row, and counting every email would let Monday's digest silence a
   * failed payment for the hour after it. The Worker's mailer reads `to`, `subject` and `text` and nothing else.
   */
  const interruptDeps = (): DigestDeps => {
    const deps = digestDeps();
    return {
      ...deps,
      outbox: (kind, payload) => deps.outbox(kind, kind === 'notify.email' ? { ...(payload as Record<string, unknown>), interrupt: true } : payload),
    };
  };

  /**
   * What the rules pass reads and writes through.
   *
   * `write` IS THE SAME WRITE PATH, re-entered. That is the whole design: a rule is a caller like
   * any other, wearing its own name, and every check a person's write answers to it answers to too.
   */
  /* ── who a rule acts for ─────────────────────────── */

  /** The person a rule acts for, by their lens, when that is not the record: their name, their lens and its read scope. */
  type Maker = { name: string; held: Held; ctx: { principal: { kind: 'person'; id: string }; wheres?: Readonly<Wheres> | undefined; writes?: Readonly<Wheres> | undefined } };

  /** The rungs that read a list: every one but `append`, which adds to a list it does not read. */
  const READING_RUNGS: ReadonlySet<string> = new Set(['read', 'comment', 'write', 'decide', 'owner']);
  /** The rungs that change a row already there, and those that add one. */
  const CHANGING_RUNGS: ReadonlySet<string> = new Set(['write', 'decide', 'owner']);
  const ADDING_RUNGS: ReadonlySet<string> = new Set(['append', 'write', 'decide', 'owner']);

  /**
   * WHO A RULE ACTS FOR: the person whose `declare` line put its live version in, read from the log as the plan says
   * ("the actor of the decide or install event that put it in force"), so no column is needed. `null` where that is an
   * owner, nobody (setup signs none) or no person (an add-on's install, the record itself); `stop` with the sentence a
   * rule is held by once its maker reaches nothing here (removed, suspended, every share ended); else their lens.
   *
   * ONLY AN OWNER ACCEPTS WHAT RUNS UNATTENDED, so a maker who is not one now is an owner who was moved down, or a
   * colleague whose rule an operation grant let in. Either way the rule runs as far as they reach today, and never as the
   * owner. Asked at every firing and every turn of a run, through the lens cache, so a revoke stops it at its next.
   */
  /* WHO PUT EACH RULE IN, read once a declaration revision (an install reloads it), since the inline pass asks at every
     write: the person and their name, or `null` for nobody a lens is read for. What they hold is asked every time. */
  const makersKept = new Map<string, { revision: number; who: { id: string; name: string } | null }>();
  const makerWho = (rule: string): { id: string; name: string } | null => {
    const kept = makersKept.get(rule);
    if (kept !== undefined && kept.revision === revision) return kept.who;
    const actor = sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'declare' AND target = ? ORDER BY rowid DESC LIMIT 1", `declaration:rule.${rule}`)?.actor;
    const person = actor === undefined ? undefined : sql.one<{ name: string | null; email: string | null }>('SELECT name, email FROM person WHERE id = ?', actor);
    const who = actor === undefined || person === undefined ? null : { id: actor, name: person.name?.trim() || person.email?.trim() || 'The person who turned it on' };
    makersKept.set(rule, { revision, who });
    return who;
  };

  const makerOf = (rule: string): { stop: string } | Maker | null => {
    const who = makerWho(rule);
    if (who === null) return null;
    const { id: actor, name } = who;
    const held = access(sql, actor, null, accessLens());
    if (held === null) return { stop: `Stopped: ${name}, who turned this on, can no longer reach this BrainDog.` };
    if (held.level === 'owner') return null;
    return { name, held, ctx: { principal: { kind: 'person', id: actor }, ...(held.wheres ? { wheres: held.wheres } : {}), ...(held.writes ? { writes: held.writes } : {}) } };
  };

  /** The rung a maker holds on one list: their list's own, else their role, and none past their ceiling or on a personal list. */
  const makerRung = (m: Maker, register: string): string | null => {
    if (personalListsNow().includes(register)) return null;
    if (m.held.registers !== null && !m.held.registers.includes(register)) return null;
    return m.held.levels[register] ?? m.held.level;
  };

  /** Whether a row is one a maker's lens shows them: its list read, and the row inside their scope (private rows left out). */
  const makerSees = (m: Maker, e: Entry): boolean => {
    if (!READING_RUNGS.has(makerRung(m, e.register) ?? '')) return false;
    const within = scope(m.ctx, e.register);
    return within === undefined || admits(e.register, within, e.id);
  };

  /** A row as a maker's lens shows it: the fields hidden from them taken off. */
  const makerMasked = (m: Maker, e: Entry): Entry => {
    const hidden = m.held.hides?.[e.register] ?? [];
    if (hidden.length === 0) return e;
    return { ...e, fields: Object.fromEntries(Object.entries(e.fields).filter(([k]) => !hidden.includes(k))) };
  };

  /** Why a maker may not make this write, or `null`: the list's rung, and a field hidden from them, which does not exist for them. */
  const makerWriteStop = (m: Maker, register: string, ref: string | null, patch: Patch): Refusal | null => {
    const rung = makerRung(m, register) ?? '';
    const listName = registers.get(register)?.name ?? register;
    if (!(ref === null ? ADDING_RUNGS : CHANGING_RUNGS).has(rung))
      return { code: 'FORBIDDEN', fix: `${m.name} cannot ${ref === null ? 'add to' : 'change'} ${listName}, and this automation acts for ${m.name}.`, at: 'register' };
    const hidden = m.held.hides?.[register] ?? [];
    const named = Object.keys(patch).find((k) => hidden.includes(k));
    if (named !== undefined) return { code: 'FIELD_UNKNOWN', fix: `${listName} has no field ${named} that ${m.name} can change.`, at: named };
    return null;
  };

  /** The sentence a step that reaches past a maker's rows is refused in. */
  /**
   * TELLING ONE COLLEAGUE'S PHONE ABOUT SOMETHING THAT IS THEIRS (collab pass 2, 2 Nov): a row handed to them, a comment
   * that names them, somebody joining from their invitation. Before this only an owner's phones ever rang, so a member
   * heard about work given to them when they next opened the app.
   *
   * THE SAME RULES AN OWNER'S PUSH KEEPS: their own `push.off` (kind `people`), the record's quiet hours, once per cause,
   * and the payload `{ sub: { id }, cause, open, kind }` and nothing else, so no words reach the outbox. And more:
   *   - never the person who did it, and never somebody who cannot reach the record any more (`access`);
   *   - with `about`, never somebody whose lens does not show that row, so a push never opens on "not there";
   *   - at most `PERSON_PUSH_HOUR` an hour to one person, counted over their own subscriptions' rows, so a busy
   *     afternoon of comments is a few rings and the rest wait in the bell.
   * It tells and nothing more, and a push that cannot be queued never fails the write it is about.
   */
  const PERSON_PUSH_HOUR = 6;
  function tellColleague(person: string | null | undefined, said: { by: string; cause: string; open: string; about?: string }): void {
    try {
      if (typeof person !== 'string' || person === '' || person === said.by) return;
      const open = pushOpenOf(said.open);
      if (open === null) return;
      const held = access(sql, person, null, accessLens());
      if (held === null) return;
      if (said.about !== undefined && held.level !== 'owner') {
        const row = byId(said.about);
        if (!row) return;
        const m: Maker = { name: '', held, ctx: { principal: { kind: 'person', id: person }, ...(held.wheres ? { wheres: held.wheres } : {}), ...(held.writes ? { writes: held.writes } : {}) } };
        if (!makerSees(m, row)) return;
      }
      const d = digestDeps();
      if (d.quiet !== undefined && inQuietHours(clock.now(), d.tz, d.quiet)) return;
      if ((sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'notify.push' AND json_extract(payload, '$.cause') = ?", said.cause)?.n ?? 0) > 0) return;
      const subs = personPushSubs(sql, person, 'people');
      if (subs.length === 0) return;
      const lately =
        sql.one<{ n: number }>(
          `SELECT count(DISTINCT json_extract(o.payload, '$.cause')) AS n FROM outbox o JOIN push_sub s ON s.id = json_extract(o.payload, '$.sub.id')
            WHERE o.kind = 'notify.push' AND s.person_id = ? AND o.created > ? AND json_extract(o.payload, '$.test') IS NOT 1`,
          person,
          instant(clock.now() - 3_600_000),
        )?.n ?? 0;
      if (lately >= PERSON_PUSH_HOUR) return;
      for (const id of subs) enqueue(sql, mint, clock.now(), 'notify.push', { sub: { id }, cause: said.cause, open, kind: 'people' });
    } catch {
      /* A RING IS NEVER WORTH THE WRITE. */
    }
  }

  const boundSaid = (m: Maker): string => `${m.name} turned this on, so it reads and writes only what ${m.name} can, and does not reach past those rows.`;

  /**
   * The rules pass's dependencies held to a maker's lens: a row they may not see is no row, a field hidden from them is
   * not on it, and every write is checked against the rows they may change on both sides of it (`WriteContext.within`),
   * as a person's own write is. A call out is refused in `boundSaid`'s sentence.
   */
  const boundRules = (base: RulesDeps, m: Maker): RulesDeps => ({
    ...base,
    forRule: undefined,
    bounded: boundSaid(m),
    entry: (id) => {
      const e = base.entry(id);
      return e !== null && makerSees(m, e) ? makerMasked(m, e) : null;
    },
    write: (register, ref, patch, actor, batch) => {
      const stop = makerWriteStop(m, register, ref, patch);
      if (stop) return { ok: false, refusal: stop };
      return write(register, ref, patch, { actor, batch, cascade: false, within: writeScope(m.ctx, register) });
    },
    generate: (register, patch, actor, batch, stamp) => {
      const stop = makerWriteStop(m, register, null, patch);
      if (stop) return { ok: false, refusal: stop };
      return write(register, null, patch, { actor, batch, cascade: false, stamp, within: writeScope(m.ctx, register) });
    },
    note: (entry, actor, text, batch) => {
      if (makerSees(m, entry)) base.note(entry, actor, text, batch);
    },
    call: (ingest) => ({ ingest, outcome: 'unknown', say: boundSaid(m) }),
  });

  /** Whether a rule acts for somebody's lens, for the inline pass (`RulesDeps.forRule`). */
  const ruleFor = (rule: string): ReturnType<NonNullable<RulesDeps['forRule']>> => {
    const m = makerOf(rule);
    if (m === null || 'stop' in m) return m;
    /* THE INLINE PASS WRITES ON THE ROW AS IT CAME, so a list with a field hidden from the maker is not one their rule
       runs on: nothing could keep that field out of what the rule reads. */
    return { deps: boundRules(rulesDeps(), m), sees: (e) => makerSees(m, e) && (m.held.hides?.[e.register] ?? []).length === 0 };
  };

  const rulesDeps = (): RulesDeps => ({
    forRule: ruleFor,
    sql,
    /* THE ONE ROUTER. A rule that declares `urgent` shows in the install diff as "interrupts you",
       and until now that diff was the only reader of the key — 09 §4 is what it should have meant. */
    interrupt: (said) => notify(interruptDeps(), { ...said, level: 'time-sensitive' }),
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
    /* A REF NAMING NO ROW MATCHES NO ROW HERE, AND IS NOT A RULE THAT CANNOT BE READ. The rule was
       allowed to install over a row nobody had written, and `matches` then read the `REF_UNKNOWN` on
       every evaluation as "fires on nothing": `thing is not Launch` tagged no job at all until Launch
       existed, and `thing in [Kiln, Launch]` did not tag the Kiln job it names. The tree form tagged
       that Kiln job before `5fde092b` made it resolve, which is the behaviour this puts back. */
    ctx: { ...evalContext(), absent: 'no-row' },
    /* CASCADE OFF. A rule's write does not run the rules pass again, so one rule cannot trigger
       another and nothing here loops — every product that allowed it grew a depth limit and then a
       graph explorer to explain the depth limit. */
    write: (register, spoken, patch, actor, batch) => write(register, spoken, patch, { actor, batch, cascade: false }),
    /* A GENERATED ROW RE-ENTERS THE WRITE PATH like any other: coerced, validated, transition-checked.
       `cascade: false` is what stops a size run generating a size run. */
    generate: (register, patch, actor, batch, stamp) =>
      write(register, null, patch, { actor, batch, cascade: false, stamp }),
    /* `about` IS THE ROW THE RULE ASKED ABOUT, on the body, where Decide's queue and a `decided` rule's run read it. */
    suggest: (question, options, actor, about) => {
      /* A RULE'S OPTION SAYS WHAT ANSWERING IT STARTS: the names of the automations installed on that answer
         (`startedBy`), since a rule declares no reason of its own. "a rule put this in front of you" sat under every one
         of them once and said how the question arrived, not why to pick the option. Where nothing acts on an answer,
         `because` stays an empty string rather than going, since `govern.ts` refuses an option without one, and Decide
         draws no line for it. */
      const starts = actor.startsWith('rule:') ? startedBy(installedFlows(sql), `rule.${actor.slice('rule:'.length)}`) : () => '';
      return openSuggestion(governDeps(), actor, {
        question,
        body_kind: 'options',
        body: {
          ...(about === undefined ? {} : { about }),
          options: options.map((label, i) => ({ id: `o${i + 1}`, label, because: starts({ id: `o${i + 1}`, label }) })),
          requires_reason: true,
        },
      });
    },
    note: (entry, actor, text, batch) =>
      void appendEvent({ kind: 'note', target: entry.id, register: entry.register, actor, note: text, at: instant(clock.now()), batch }),
    stateOf: (register) => registers.get(register)?.state ?? null,
    doneOf: (register) => registers.get(register)?.done ?? [],
    schedule: (key, payload, pending) => marker(sql, mint, clock.now(), key, payload, pending),
    /* A RULE THAT RUNS A CALL QUEUES IT HERE, inside the write's transaction, so a write that rolls back sends nothing. */
    call: (ingest, f) =>
      queueCall(actionDeps(), { ingest, rule: f.rule, entry: f.entry, typeOf: (field) => f.schema.fields[field]?.type }),
    entry: (id) => byId(id),
    mint,
    nowMs: clock.now(),
    /* FOR THE INLINE PASS'S `project:`, the same reading a run's is (`projectOfRow`). */
    projectOf: projectOfRow,
  });

  /**
   * The depth of the automation run whose steps are being taken right now, or 0 when none is.
   *
   * THE WRITE PATH CANNOT BE TOLD IT DIRECTLY, because a step's write goes through `runRules` and the write context it
   * builds has an actor and a batch and nothing else. Steps are taken synchronously inside one drain turn, so the run
   * being advanced is the only run that can be writing, and a write by `rule:*` while this is 2 was made at depth 2.
   */
  let flowDepth = 0;

  /**
   * The project a row belongs to, by its list's scope field, or `null` for a global row: what a rule's `project:` is
   * compared with, on the run path and inline alike. A declaration so `rulesDeps`, written above it, can name it.
   */
  function projectOfRow(entry: Entry): string | null {
    const f = scopeFieldOf(registers.get(entry.register)?.fields ?? []);
    const value = f ? entry.fields[f.id] : undefined;
    return typeof value === 'string' && value !== '' ? value : null;
  }

  /** What the automation runner reads and writes through: the rule pass's own dependencies, and a row's project. */
  /** The hold the host's ledger last put on this record's automations (`holdRuns`); `null` is none. */
  let runsHeld: { until: number; say: string } | null = null;
  /** Whether a run acts for somebody's lens (`FlowDeps.boundTo`): the run path's dependencies held to it, or why it stops. */
  const runActsFor = (rule: string): ReturnType<NonNullable<FlowDeps['boundTo']>> => {
    const m = makerOf(rule);
    if (m === null || 'stop' in m) return m;
    const rules = boundRules(rulesDeps(), m);
    return {
      deps: { ...flowDeps(), boundTo: undefined, bounded: boundSaid(m), rules: () => rules, entry: rules.entry },
      unseen: `Skipped: the row it started for is not one ${m.name} can see.`,
    };
  };

  const flowDeps = (): FlowDeps => ({
    boundTo: runActsFor,
    sql,
    mint,
    nowMs: clock.now(),
    rules: rulesDeps,
    entry: (id) => byId(id),
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    note: (actor, text) => noteEvent(sql, mint, clock.now(), actor, text),
    projectOf: projectOfRow,
    tz: recordIdentity(sql)?.tz ?? 'UTC',
    /* THE RUN THAT MADE A ROW, by the actor of its `create` line, which a run signs with its handle; anybody else is
       `null`. Read as a feed's `run_by` is (`runByOf`), ended or removed runs included. */
    madeBy: (row) => {
      const actor = sql.one<{ a: string }>("SELECT actor AS a FROM event WHERE target = ? AND kind = 'create' ORDER BY rowid LIMIT 1", `entry:${row.id}`)?.a;
      if (actor === undefined || !isRunName(actor)) return null;
      return runByOf(actor, bySeq(SESSION, Number(actor.slice((registers.get(SESSION)?.seq_prefix ?? 'S').length)), true));
    },
    /* THROUGH THE GATE'S OWN `propose`, as a rule's `suggest` goes, so a run's question is a suggestion like any other:
       the same checks, the same `suggest` event, the same queue. The run and the step ride on the body, which is what
       `decide` below reads to find the run it answers. */
    ask: (question, options, actor, about) =>
      openSuggestion(governDeps(), actor, {
        question,
        body_kind: 'options',
        body: {
          options: options.map((label, i) => ({ id: `o${i + 1}`, label, because: `${actor.replace(/^rule:/, 'rule.')} waits on this answer` })),
          requires_reason: true,
          run: about.run,
          step: about.step,
          /* A TYPED QUESTION'S SHAPE AND CURRENCY, so Decide asks for the amount, number, words or day the step reads. */
          ...(about.shape === undefined ? {} : { shape: about.shape }),
          ...(about.currency === undefined ? {} : { currency: about.currency }),
          /* THE ONE MEMBER THE STEP PUTS IT TO, on the body beside the run, because the body is what `govern.ts`'s
             `decide` and the queue's order both read. */
          ...(about.to === undefined ? {} : { to: about.to }),
        },
      }),
    /* A RUN'S CALL IS QUEUED BY THE SAME `queueCall` A RULE'S IS, with the run and the step on the job, so the ack hands
       the answer back to the step that waits on it (`outbox.ts`'s `ack`). */
    call: (ingest, a) =>
      queueCall(actionDeps(), {
        ingest,
        rule: a.rule,
        entry: a.entry,
        typeOf: (field) => (a.entry !== null && registers.has(a.entry.register) ? schemaOf(a.entry.register).fields[field]?.type : undefined),
        run: { run: a.run, step: a.step },
      }),
    withdraw: (suggestion, actor, why) => void decide(governDeps(), suggestion, { resolved_as: 'wont-fix', reason: why }, actor),
    /* A RUN'S `meet` IS `people.ts`'s `meet`, the one `kernel.meet` calls, as the rule and in the run's project, so a person a rule met is matched, dated and offered for merging as one an agent met. */
    meet: (args, a) => meetPerson(peopleDeps({ actor: a.actor }, () => a.project, (p) => openSuggestion(governDeps(), a.actor, p)), args),
    /* A RUN'S `run_job` IS THE JOBS DOOR'S OWN `createJob` (`api/jobs.ts`), with the same check that `about` is a row. */
    job: (a) => createJob(tokenDeps(), { kind: a.kind, args: a.args, ...(a.about === null ? {} : { about: a.about }) }, (spoken) => get(spoken) !== null),
    answersSlash: opts.answersSlash === true,
    held: runsHeld,
  });

  /**
   * A decision just made on a question an automation asked: hand the pick to the run, or tell it no answer is coming.
   *
   * HERE AND NOT IN `govern.ts`'s `decide`, because this is the one door every decision comes through and the gate is
   * the record's own, knowing nothing of runs; and inside `decide`'s own `attempt`, so a decision that rolls back never
   * moved the run. A put-off question is not an answer and changes nothing.
   *
   * AND A DECISION ON ANY OTHER QUESTION STARTS THE RULES WHOSE `decided` TRIGGER ADMITS IT (`flow.ts`'s `onDecided`), in
   * the same transaction, so a decision that rolls back starts nothing. `about` is the declaration that filed the
   * question (`rule:<id>` or `script:<id>@v<n>` opened it) or that a change proposes, and the run's row is the one the body's `about` names,
   * as a rule's `suggest` writes it.
   */
  const answered = (id: string, verdict: Verdict, actor: string): void => {
    if ('defer' in verdict) return;
    const row = sql.one<{ body: string; opened_by: string }>('SELECT body, opened_by FROM suggestion WHERE id = ?', id);
    const body = row?.body;
    const parsed =
      body === undefined
        ? null
        : (JSON.parse(body) as { run?: unknown; step?: unknown; options?: { id?: unknown; label?: unknown }[]; about?: unknown; declaration_id?: unknown });
    if (typeof parsed?.run !== 'string' || typeof parsed.step !== 'number') {
      if (!('decide' in verdict) || parsed === null || row === undefined) return;
      const flows = installedFlows(sql);
      if (!flows.some((f) => triggerOf(f.body) === 'decided')) return;
      const chosen = verdict.decide.option;
      const label = parsed.options?.find((o) => o.id === chosen)?.label;
      onDecided(flowDeps(), flows, {
        suggestion: id,
        option: { id: chosen, label: typeof label === 'string' ? label : chosen },
        /* A QUESTION A SCRIPT FILED IS ABOUT ITS SCRIPT (`script:close_account@v1` is `script.close_account`), as one a rule
           opened is about its rule, so a `decided` trigger can name it. */
        about:
          typeof parsed.declaration_id === 'string'
            ? parsed.declaration_id
            : row.opened_by.startsWith('rule:')
              ? `rule.${row.opened_by.slice('rule:'.length)}`
              : row.opened_by.startsWith('script:')
                ? `script.${row.opened_by.slice('script:'.length).replace(/@v\d+$/u, '')}`
                : null,
        row: typeof parsed.about === 'string' ? get(parsed.about) : null,
        actor,
      });
      return;
    }
    const at = { run: parsed.run, step: parsed.step, by: id };
    if ('decide' in verdict) {
      const label = parsed.options?.find((o) => o.id === verdict.decide.option)?.label;
      if (typeof label === 'string') void answerStep(flowDeps(), { ...at, answer: label });
      return;
    }
    const how = 'resolved_as' in verdict ? verdict.resolved_as : 'by rule';
    void answerStep(flowDeps(), { ...at, failed: `${id} was closed without an answer (${how}), so the run stopped at step ${parsed.step + 1}.` });
  };

  /** Take a run's steps with its depth set, so a write it makes starts a chained run one deeper. */
  const advanceAt = (run: string): number | null => {
    const depth = sql.one<{ depth: number }>('SELECT depth FROM automation_run WHERE id = ?', run)?.depth ?? 0;
    const was = flowDepth;
    flowDepth = depth;
    try {
      return advanceRun(flowDeps(), run);
    } finally {
      flowDepth = was;
    }
  };

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
    settle: (id) => governDeps().settle!(id),
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
    /* AND `43 §4.5`'s `day` for a `map:` field, when one was wired. Absent is the kernel's own four
       formats, unchanged. */
    day: opts.day,
    /* THE WORDS A PERSON RENAMED A LIST OR A FIELD TO, so a question an arrival leaves for review names them as every
       page does. Without this line `wordsFor` read none and asked in the declaration's own words. */
    words: () => speakingSettings(sql),
  });

  const pullDeps = (): PullDeps => ({
    sql,
    recordId: recordIdentity(sql)?.id ?? 'self',
    nowMs: clock.now(),
    mint,
    outbox: (payload) => enqueue(sql, mint, clock.now(), 'pull.fetch', payload),
    /* THE KEY A CONNECTOR NAMES, BY LABEL OR ID, resolved as a call's is, so the job carries its id (`firePull`). */
    keyOf: (name) => keyNamed(sql, name),
    tz: recordIdentity(sql)?.tz ?? 'UTC',
  });

  /** The connector declaration a `pull` row is about, or `null` when it has been retired. */
  const pullDecl = (ingest: string): PullDecl | null => {
    const row = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE id = ? AND kind = 'ingest' AND superseded_at IS NULL AND retired = 0",
      `ingest.${ingest}`,
    );
    return row ? (JSON.parse(row.body) as PullDecl) : null;
  };

  /** The active body of a script, or `null` when there is none: what its egress was approved as. */
  const scriptDecl = (script: string): unknown => {
    const row = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE id = ? AND kind = 'script' AND superseded_at IS NULL AND retired = 0",
      `script.${script}`,
    );
    return row ? (JSON.parse(row.body) as unknown) : null;
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
    notify: (said) => void notify(interruptDeps(), { ...said, level: 'time-sensitive' }),
    ack: (args) => ack(sql, ackDeps(), args),
    lookup: actionDecl,
    arrive: (decl, body, sha256) =>
      kernel.arrive({ channel: 'pull', body, sha256 }, { ...(decl as unknown as IngestDecl), channel: 'pull' } as IngestDecl),
    /* THE KEYCHAIN DECIDES WHETHER A LEASE IS GOOD ENOUGH, not the runner. The actor is the connector
       rather than a person, which is what the `grant.read` event will say. */
    seal: ({ actor, ...args }) => sealedGrant(sql, keychainDeps(actor), args, transaction),
    tz: recordIdentity(sql)?.tz ?? 'UTC',
  });

  /** What a script's run needs on top of an action's: the savepoint's transaction, the write path, and a spoken id's register. */
  const scriptRunDeps = (): ScriptRunDeps => ({
    ...actionDeps(),
    transaction,
    write: (register, ref, patch, w) => write(register, ref, patch as Patch, w),
    registerOf: (spoken) => get(spoken)?.register ?? null,
    /* THE ONE QUESTION A RUN MAY ASK, filed through the gate's own `propose`: an `options` question whose options
       carry their patches, one open per cause, signed by the run's actor. */
    propose: (p, actor) => openSuggestion(governDeps(), actor, p),
    /* A NOTICE FROM A SCRIPT (`ctx.notify`) IS AN ACTIVE ONE: the note on the bell always, one push an hour, and nothing
       that sounds inside quiet hours, which `digestDeps` hands `notify` as the record's own window. */
    /* AND IT OPENS ITS PLUGIN'S PAGE, `/plugins/<id>`: the note names the add-on (`target_kind: 'pack'`), and the push opens there. */
    tell: (said) => {
      const pack = typeof said.pack === 'string' && said.pack !== '' ? said.pack : null;
      const deps = digestDeps();
      notify(
        pack === null ? deps : { ...deps, note: (actor, text, urgent) => noteEvent(sql, mint, clock.now(), actor, text, urgent, { target: pack, target_kind: 'pack' }) },
        { actor: said.actor, say: said.say, level: 'active', ...(pack === null ? {} : { url: `/plugins/${pack}` }) },
      );
    },
  });

  /**
   * What the gate needs: the counters, and the write path for the rows an accepted `rowset` writes.
   *
   * `cascade: true` ON THOSE ROWS, because a row accepted at the gate is a row like any other — the
   * register's rules apply to it, and a rowset that went in with the rules switched off would be a
   * back door into the record wearing a decision's name.
   */
  /** One answer through the gate, in its own savepoint; `batch` is the one a group answer shares (`decideMany`). */
  function decideOne(id: string, verdict: Verdict, actor: string, batch?: string): Result<Decided> {
    const out = decideAttempt(id, verdict, actor, batch);
    /* A PRESS ON A QUESTION THAT NO LONGER APPLIES CLOSES IT, saying why, instead of leaving it to be pressed again and
       answered VERSION_STALE for ever: its rows were deleted, merged, or already hold what it asked (`staleWhy`). */
    if (!out.ok && !('defer' in verdict)) {
      const why = transaction(() => settleOne(governDeps(), id, clock.now()));
      if (why !== null) return no<Decided>(codeOf(out), `${why} It is off Needs you now.`, { at: 'id' });
    }
    /* AND AN ANSWER THAT DELETED OR MERGED ROWS TAKES BACK THE OTHER OPEN QUESTIONS ABOUT THEM THAT NO LONGER APPLY: a
       second "same person?" card about two people one card already merged. */
    if (out.ok && out.value.wrote.length > 0)
      transaction(() => {
        for (const id of out.value.wrote) {
          const row = byId(id, true);
          if (!row || row.seq === null) continue;
          const prefix = registers.get(row.register)?.seq_prefix;
          settleAbout(governDeps(), [row.id, `${row.register}#${row.seq}`, ...(prefix && prefix !== '#' ? [`${prefix}${row.seq}`] : [])], clock.now());
        }
      });
    return out;
  }

  function decideAttempt(id: string, verdict: Verdict, actor: string, batch?: string): Result<Decided> {
    return attempt(sql, transaction, () => {
      const whole = mergePickFault(id, verdict);
      if (whole) return { ok: false as const, refusal: whole };
      const out = decide(governDeps(), id, verdict, actor, batch === undefined ? {} : { batch });
      if (out.ok) {
        /* AN ACCEPTED 'Add <organisation>?' OR DOMAIN OFFER LINKS EVERYONE AT THAT DOMAIN; any other answer links nobody. */
        const joined = joinOrganisation(peopleDeps({ actor }, () => null, (p) => openSuggestion(governDeps(), actor, p)), id);
        if (!joined.ok) return joined as Result<never>;
        /* AN ACCEPTED MERGE KEEPS WHAT THE TWO DISAGREED ON, in the batch the rows were written in (`carryFolds`). */
        for (const folded of foldBatches(out.value.wrote)) {
          const carried = carryFolds(folded, { actor });
          if (!carried.ok) return carried as Result<never>;
        }
        answered(id, verdict, actor);
        /* AN ANSWER TO A QUESTION THE INBOX ASKED (which account a card's digits are, or moving what a wrong answer filed) IS
           CARRIED OUT HERE, in the decision's transaction and batch, so one Undo puts all of it back. */
        if ('decide' in verdict) {
          const carried = answerAsked(ingestDeps(), { id, option: verdict.decide.option, actor, batch: out.value.batch ?? null });
          if (!carried.ok) return carried as Result<never>;
        }
      }
      return out;
    });
  }

  const governDeps = (): GovernDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    allocate,
    /* BRAINDOG'S OWN ARRANGING, small and reversible: answered as it is filed, in a savepoint so a refusal leaves
       the question open. */
    settle: (id) =>
      handledOn(sql) ? attempt(sql, transaction, () => decide(governDeps(), id, { rule: 'handled' }, HANDLED_RULE)) : no('TRANSITION_ILLEGAL', 'BrainDog is not arranging for itself.', { at: 'rule' }),
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
      const fault = unreadable(batch) ?? lintBatch(sql, batch, undefined, lintTableNow()) ?? unserved(batch) ?? keysKept(batch) ?? contradicted(batch) ?? stranded(batch);
      if (fault) return { ok: false as const, refusal: fault };
      const egress = batch.flatMap((d) => {
        /* A SCRIPT CALLS OUT AS AN ACTION DOES, and its line is how the owner sees where it fetches and with which key. */
        const out = d.kind === 'ingest' || d.kind === 'script' ? egressOf(d.body, titleOfRow, opensOf, keyScope) : null;
        return out === null ? [] : [out];
      });
      if (egress.length === 0) return ok(null);
      const changed = egress.filter((e) => {
        const was = e.channel === 'script' ? scriptDecl(e.ingest) : (actionDecl(e.ingest)?.decl ?? null);
        const before = was === null ? null : egressOf(was, undefined, opensOf);
        return before === null || egressChanged(before, e);
      });
      if (changed.length === 0) return ok(null);
      return ok({ egress: changed, approve: approvalLines(changed, { passphrase: recordWrapping(sql)?.wrapped_by === 'passphrase' }) });
    },
    /* THE ROWS AGAIN AT ACCEPTANCE, and only the rows: `review` linted the declarations when the change was filed, and
       what moves between the two is what was written under the register since. */
    fits: (to) => {
      const bundle = (to as { declarations?: unknown }).declarations;
      return contradicted((Array.isArray(bundle) ? bundle : [to]) as Declaration[]);
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

  /** A change to who holds what moves the access epoch in its own transaction, so a cached lens and an open tab see it. */
  const moved = <T,>(out: Result<T>): Result<T> => {
    if (out.ok) bumpEpoch(sql);
    return out;
  };

  const memberDeps = (): MemberDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    hasRegister: (r) => registers.has(r),
    readsRule: (r, where) => ruleOf(where, schemaOf(r), evalContext()).bad[0] ?? null,
    personal: (r) => (registers.get(r)?.personal === true ? registers.get(r)!.name : null),
  });

  /* WHEN EACH KEY'S USE WAS LAST WRITTEN, for this open record only (`TokenUses`): a key called again inside a minute writes nothing. */
  const tokenUses: TokenUses = new Map();

  /**
   * What a token needs beyond SQL.
   *
   * THE HASH AND THE RANDOMNESS ARE THE HOST'S, injected rather than imported, because the record
   * has no crypto of its own and a fixture has to be deterministic. `crypto` is on the platform in
   * both hosts and in Node, so this is a seam rather than a dependency.
   */
  const tokenDeps = (): TokenDeps => ({
    sql,
    uses: tokenUses,
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
       that writes the `suggest` event, and `slash` as the actor because that is who drafted it. */
    propose: (p, actor) => openSuggestion(governDeps(), actor, p as never),
    /* AND THE OTHER HALF OF `prose: slash`. The digest was assembled inside the alarm's transaction
       and parked on this row; the ack is where it leaves. Two sentences at most, capped here rather
       than trusted from the wire — 45 §5.10. */
    sendDigest: (assembled, prose) => sendDigest(digestDeps(), assembled as Assembled, twoSentences(prose)),
    /* AND AN AUTOMATION'S QUESTION TO SLASH, answered into its run in the ack's transaction. */
    answerRun: (a) => void answerStep(flowDeps(), a),
    /* AND A PAGED CONNECTOR WHOSE KEY WAS REFUSED, told through the one router (`finishPull`, `pull.ts`). */
    notify: (said) => void notify(interruptDeps(), { ...said, level: 'time-sensitive' }),
  });

  /** The same, plus who is asking and which record this is — the two halves of a `grant.read` row. */
  const keychainDeps = (actor: string): KeychainDeps => ({
    mint,
    nowMs: clock.now(),
    actor,
    recordId: recordIdentity(sql)?.id ?? null,
    /* THE ONE ROUTER, HANDED IN. 09 §4's rate limit, 09 §3's split between what a push carries and
       what an email does, and the `note` event, are all one function — and a credential expiring is
       one of the three things 09 §5 makes urgent by default. */
    interrupt: (said) => notify(interruptDeps(), { ...said, level: 'time-sensitive' }),
  });

  async function tail(scheduler: Scheduler): Promise<void> {
    /* WHAT THE TAIL READ, while nothing has awaited since: then the doorbell's question below is already answered. */
    let read: ReturnType<typeof pendingWork> | null = null;
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
        else read = work;
      } else if (armed !== work.nextDueMs) await scheduler.set(work.nextDueMs);
      else read = work;
    } finally {
      /* And the doorbell asks again too: a job queued while this tail was parked is a job the ring
         is about. A tail that set nothing was never parked after its read, so that read still holds. */
      if ((read ?? pendingWork(sql, opts.delivers)).outboxPending) await scheduler.wake();
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
   * A lifecycle event, not about a row: the api's `lifecycle`, and the night's copy kept or failed (`copies.ts`).
   */
  function lifecycleEvent(kind: 'export' | 'import' | 'restore.pitr', actor: string, note: string, to?: string): string {
    slashMayWrite(actor, kind);
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
  }

  /**
   * One close of a handoff (`handoff.ts`) through the write path, as the sweep's `move` is: the move, the fields only
   * the record writes, and the line's note, signed by whoever closed it. The sweep and `takeHandoff`/`dropHandoff`
   * all write through this one function, so the three closes are the same `state` event.
   */
  function handoffWrite(...[id, c]: Parameters<HandoffWrite>): ReturnType<HandoffWrite> {
    return writing(SESSION, id, c.state ? { state: c.state } : {}, {
      actor: c.actor,
      cascade: false,
      stamp: c.stamp,
      ...(c.note === null ? {} : { note: c.note }),
    });
  }

  /**
   * What `instruction.ts` reads and writes through: the record's clock, an instruction's write through the write path
   * with the door only it opens (`Door.instructs`), and a run's own fields stamped in place of a patch. Each is a line
   * in the log, signed as the change says: by him for what he said, by the run for what it saw, took and answered.
   */
  function instructionDeps(): InstructionDeps {
    return {
      sql,
      now: clock.now(),
      write: (id, c) => {
        const done = writing(
          INSTRUCTIONS,
          id,
          c.patch,
          { actor: c.actor, cascade: false, stamp: c.stamp, ...(c.note === null ? {} : { note: c.note }) },
          { instructs: true },
        );
        return done.ok ? ok({ id: done.value.id }) : done;
      },
      runWrite: (id, stamp, actor, note) => writing(SESSION, id, {}, { actor, cascade: false, stamp, ...(note === null ? {} : { note }) }),
      mint,
    };
  }

  /**
   * The hourly sweep: soft-deleted rows past thirty days, runs not heard from in twelve hours, and steps nobody took in
   * thirty days. The `purge` schedule row and the `purge` method both run this one function.
   *
   * A RUN WRITTEN OFF KEEPS ITS LINE IN ITS HISTORY AND IN THE LOG, and no feed shows it (`bookkeeping`): the sweep is
   * the record keeping its books, and its lines were three quarters of the owner's Activity.
   */
  /* THE SWEEP IS THE SYSTEM'S HOUSEKEEPING OVER EVERY ROW, private ones included (it deletes and closes, it shows no one a figure): owner-level by design. */
  function sweepRecord(cutoffMs = clock.now() - 30 * 86_400_000, limit?: number) {
    const out = purge(sql, cutoffMs, clock.now(), transaction, mint, limit);
    /* MIGRATION 28'S DATA STEPS, 200 runs an hour until every run has had them (`runsDataSteps`): the runs the sweep
       wrote off after their sessions closed are ended, and every run's writes and step are counted from the log. */
    transaction(() => runsDataSteps(sql));
    /* MIGRATION 42'S DATA STEP, once a record: a settings row for each kind of agent its runs have used, at the scope
       its newest run's token holds, then Defaults (`agentsDataSteps`). */
    transaction(() => agentsDataSteps(sql, instant(clock.now())));
    /* AN INSTRUCTION NO RUN TOOK IN ITS TIME expires in the same hour, and one sent to a run that ended before it saw it
       goes to the next run of that kind there (`instruction.ts`). */
    transaction(() => expireInstructions(instructionDeps()));
    /* AND ONE A JOB CARRIED, whose job the queue ended by itself, is answered for it (`settleEndedJobs`). */
    transaction(() => settleEndedJobs(instructionDeps()));
    const sessions = transaction(() =>
      sweepSessions(
        sql,
        clock.now(),
        (id, to, note) => writing(SESSION, id, { state: to }, { actor: 'system', cascade: false, note }).ok,
      ),
    );
    /* A STEP NOBODY TOOK IN THIRTY DAYS is closed in the same hour, its words kept on the run (`handoff.ts`). */
    transaction(() => expireHandoffs(sql, clock.now(), handoffWrite));
    /* AND A STEP A LATER RUN HERE PASSED OVER closes too, so it is not handed to every run for thirty days (`closePassed`). */
    transaction(() => closePassedHandoffs(sql, clock.now(), handoffWrite));
    /* A QUESTION THAT IS ALREADY SO is closed as moot in the same hour, with the sentence that says why (`cause.ts`
       `recheck`): the owner answered it by doing it, so it leaves Decide and counts on no brake. */
    transaction(() => recheck(sql, clock.now(), mint));
    /* AND A QUESTION THAT CAN NO LONGER APPLY takes itself back in the same hour (`govern.ts` `sweepStale`): its rows
       changed so no answer could write them, or what it asked about is gone. One line in Handled says which. */
    transaction(() => sweepStale(governDeps(), clock.now()));
    /* AND WHAT STILL WAITS AND IS SMALL SETTLES ITSELF (`settleWaiting`), small and reversible: a question asked again is closed,
       and an arrangement of the owner's own rows that BrainDog or his agent filed is answered as `rule:handled`, one
       line in Handled today with its Undo. Each settle in its own savepoint, so one refusal leaves that question open. */
    if (handledOn(sql))
      transaction(() =>
        settleWaiting(sql, clock.now(), mint, (id) => attempt(sql, transaction, () => decide(governDeps(), id, { rule: 'handled', swept: true }, HANDLED_RULE))),
      );
    /* AND THE TIDY COUNTS WHAT IS LEFT (`tidy.ts` `tidyHour`): one line a finder a day in `tidy_line`, after
       the cleaning above, so a line says what is still stale and what this hour cleared.

       IT COUNTS AND ASKS NOTHING: each finder is run with its question taken off, because no question the record
       signs is wired on. One already open under a finder's cause is named on its line and left as it was filed.

       A FINDER A TRANSACTION, EACH IN ITS OWN TRY, so one that throws loses its own line and never stops the books. */
    for (const finder of finders()) {
      try {
        const counted = { ...finder, find: (s: Sql, at: number) => ({ ...finder.find(s, at), ask: null }) };
        transaction(() => tidyHour({ sql, nowMs: clock.now(), mint, allocate }, [counted]));
      } catch {
        /* Its line is missing for this hour, which is what a reader of the lines sees. */
      }
    }
    /* A DEVICE GRANT past its time, or silent for fourteen days, is let go in the same hour. */
    transaction(() => deviceSweep(tokenDeps()));
    /* AND A CHILD KEY PAST ITS HOUR, which verifies as nothing and only fills the token table (`pruneChildren`). */
    transaction(() => pruneChildren(sql, clock.now()));
    /* A JOB NOBODY TOOK IN A DAY, OR ONE WHOSE MACHINE STOPPED ANSWERING, is let go in the same hour (`jobs.ts`). */
    transaction(() => sweepJobs(tokenDeps()));
    /* AND THE DOOR'S MARKS once thirty days old, which no sign reads any more (`door.ts`). */
    transaction(() => sweepDoorMarks(sql, clock.now()));
    /* AND AN ADD-ON'S STORE REMOVED WITH ITS DATA, once past the window its rows are kept for (`purgeBinnedStores`). */
    transaction(() => purgeBinnedStores(sql, clock.now() - REMOVED_WINDOW_DAYS * 86_400_000));
    rulesAboutTime();
    figuresWatched();
    /* A FINISHED AUTOMATION RUN IS KEPT NINETY DAYS, and its metered event after that: one line per run, as §4.5 asks.
       Here and not in the `purge` handler alone, because this is the one function both the hourly row and `purge()` by
       hand run; the first cut put it in the handler, and a sweep by hand left every old run in place. */
    transaction(() => pruneRuns(sql, clock.now()));
    /* AND AN INLINE RULE'S COUNTED FIRINGS once a day old, which no `runs_per_day` reads any more (`rules.ts`). */
    transaction(() => pruneFirings(sql, clock.now()));
    /* AND THE ROWS WHOSE WORDS CHANGED ARE QUEUED FOR THEIR VECTORS, a hundred at most in one `infer.embed` job, and
       only while no other is out (`embed.ts`). Last, so a row the purge above deleted is never sent to a model. */
    transaction(() => {
      const job = embedJob(sql, clock.now());
      if (job) enqueue(sql, mint, clock.now(), 'infer.embed', job);
    });
    /* AND ONCE A NIGHT, THE PEOPLE, ORGANISATIONS AND PROJECTS THAT MAY BE ONE, twenty pairs at most in one
       `infer.resolve` job, by name and where they were seen and never an address (`people.ts`'s `resolveJob`). The answer comes back through `ackOutbox`. */
    transaction(() => {
      const people = meetsRole(registers.values());
      const job = resolveJob({
        sql,
        nowMs: clock.now(),
        list: people === null ? undefined : { ...people, declaredFields: registers.get(people.register)?.fields ?? [] },
        nameOf,
        titleOf: titleOfRow,
      });
      if (job) enqueue(sql, mint, clock.now(), 'infer.resolve', job);
    });
    return { ...out, sessions };
  }

  /**
   * A RULE ABOUT TIME IS READ AGAIN AS TIME PASSES. `due before -7d` becomes true of an invoice nobody has
   * touched, and a rule that runs only when a row is written would never see it. So each hour every rule whose
   * `when:` names a day relative to today, and which fires once per what it is about (`once_per`), is read
   * over its rows as a bulk apply: its marker keeps it to once, and a bulk apply queues no calls.
   *
   * INLINE RULES BY `applyRule`, AND RUN-PATH ONES BY `flow.ts`'s `onTime`, which starts one run per row and key with
   * the same marker. The run-path ones were handed to `applyRule` too, which finds rows by a top-level `register:` they
   * have none of, so they were refused in silence and the lint refused them at install. One `RELATIVE_DAY` picks both.
   */
  function rulesAboutTime() {
    const rules = sql
      .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")
      .map((r) => JSON.parse(r.body) as RuleDecl)
      .filter((r) => pathOf(r as FlowDecl) === 'inline' && Array.isArray(r.once_per) && r.once_per.length > 0 && RELATIVE_DAY.test(JSON.stringify(r.when ?? '')));
    for (const rule of rules) transaction(() => applyRule(rulesDeps(), rule, { limit: 1000 }));
    transaction(() => onTime(flowDeps(), installedFlows(sql)));
  }

  /**
   * THE HOURLY READ OF EVERY FIGURE A `metric` TRIGGER WATCHES (`flow.ts`'s `onMetrics`): a change of side since the
   * last reading starts one run. In the sweep, as `rulesAboutTime` is, so the hourly row and `purge()` by hand read them
   * alike.
   */
  function figuresWatched() {
    transaction(() => onMetrics(flowDeps(), installedFlows(sql)));
  }

  /**
   * One night of the ledger, written down: four figures across one row.
   *
   * WHAT IT ANSWERS IS "what was the whole position on the 14th", which nothing else in the record
   * can answer. Every figure on the Ledger page is computed fresh, and a figure computed fresh
   * cannot be asked about a day that has passed — `cash-now` reads the balance the account holds
   * now, and there is no history of a balance anywhere in this schema to read instead.
   *
   * ALL FOUR OR NONE, and the register is why the check has to be here: only `cash` is `required:`,
   * so a row carrying three of the four would be accepted, and the chart would draw the fourth as a
   * zero. A hole that reads as a zero is worse than a hole.
   *
   * ONE CURRENCY OR NOTHING, and this is the decision the shape forces. A `money` field holds one
   * amount and one code, so a position held in sterling, dollars and Egyptian pounds has no honest
   * form in this row unless every part of it converts into one currency at a rate the record holds.
   * `evaluateMetric` already does that work and already refuses to do it badly: a figure whose rows
   * it cannot convert comes back with `value: null` and one amount per currency, and that is the
   * signal to skip the night. A screen in that position asks for a rate; a row cannot ask anybody
   * anything, because by the time it is read the night is over and the rates have moved. The gap in
   * the chart is the honest answer, and it is repaired by typing the missing rate, after which
   * every later night converts.
   */
  function writeNight(): void {
    const tz = recordIdentity(sql)?.tz ?? 'UTC';
    const nowMs = clock.now();
    /* PAST THE WINDOW IS A MISSED NIGHT, not a late one. `NIGHT_LATEST_HOUR` has the argument. */
    if (localParts(nowMs, tz).hour >= NIGHT_LATEST_HOUR) return;

    const night = dayBefore(dayIn(nowMs, tz));
    /* ALREADY TAKEN. `on` is unique, so the write below would be refused anyway — but a refusal out
       of a schedule handler walks the retry ladder and raises a fault, and a redelivered alarm
       is not a defect worth telling anybody about.

       AND A DELETED NIGHT COUNTS AS TAKEN, which the unique index would not say: it is partial on
       `deleted_at IS NULL`, so a row somebody removed leaves the day free again. Putting it back is
       the record arguing with a person about their own ledger, over a row they deleted on purpose. */
    if (sql.one(`SELECT 1 AS x FROM entry WHERE register = ? AND json_extract(fields, '$.on') = ?`, NIGHT_REGISTER, night)) return;

    /**
     * THE READINGS, AND A FIGURE THIS RECORD DOES NOT DECLARE ENDS THE NIGHT.
     *
     * A record with `snapshots` installed and `owed-by-you` missing is a record running money-core
     * older than 1.2.0, where the payable book had only `overdue` — the late part of it. Filling
     * `owed_by_me` from that would understate what is owed by however much is not yet due, every
     * night, in a row nobody ever re-reads.
     */
    const ctx = evalContext();
    const read: Record<string, Reading> = {};
    for (const [field, id] of Object.entries(NIGHT_FIGURES)) {
      const figure = pageDeps().metric(id);
      if (!figure) return;
      const out = evaluateMetric(sql, figure, ctx);
      /* A REFUSAL IS A NIGHT THAT CANNOT BE RECORDED, not a failure of the alarm: `MIXED_CURRENCY`
         is the ordinary one, and it is a fact about the rows rather than about this code. */
      if (!out.ok || out.value.value === null) return;
      read[field] = out.value;
    }

    /**
     * A RECORD THAT HOLDS NO ACCOUNT HAS NO CASH POSITION, AND ZERO IS NOT THE SAME ANSWER.
     *
     * `cash-now` over no rows is a sum over nothing, which is `0` — and a night written from it
     * claims this person had nothing in the bank, when the truth is that the record has not been
     * told. That is the whole-row version of the hole the four-figures rule is about. The other two
     * figures are left alone: having no open obligations IS a real state of the books, and a
     * receivable book of nothing is worth a point on the chart.
     */
    if (read.cash!.rows === 0) return;

    /**
     * THE ONE CURRENCY ALL FOUR ARE IN.
     *
     * A ZERO CARRIES NO CURRENCY, and that is a real reading rather than an edge case: a sum over no
     * rows comes back `{ value: 0, unit: null }`, so a person with no receivables has an
     * `owed-to-you` with nothing to say about currency. Those adopt whatever the other figures are
     * in. Two figures that came back in DIFFERENT codes is the case this must not add: it means
     * neither could be converted into the other, which is the same fact the `parts` branch above
     * catches, arriving by a different door.
     */
    const codes = new Set(Object.values(read).map((r) => r.unit).filter((u): u is string => typeof u === 'string' && CURRENCY_CODE.test(u)));
    if (codes.size > 1) return;
    /* EVERY FIGURE ZERO AND NO CODE ANYWHERE is a ledger with nothing in it. The home currency is
       the only thing that could name one, and inventing a code the person never chose would write a
       currency into the record on their behalf. */
    const currency = codes.size === 1 ? [...codes][0]! : homeCurrency(sql);
    if (currency === null) return;

    const amount = (field: string): number => Math.round(read[field]!.value!);
    const money = (value: number): NightAmount => ({ amount: value, currency });
    const net = amount('cash') + amount('owed_to_me') - amount('owed_by_me');

    /* WHAT THE ROW SAYS ABOUT ITSELF WHEN IT IS A CONVERSION. Without it a reader a year later sees
       a figure in Egyptian pounds and cannot tell that a rate moved the line rather than a balance.
       THE OLDEST OF THE THREE `asOf` DAYS, because the row is only as current as its weakest part:
       naming the newest would say the whole night was priced yesterday when one figure was priced
       last month. */
    const asOf = Object.values(read)
      .map((r) => r.fx?.asOf)
      .filter((d): d is string => typeof d === 'string')
      .sort()[0];
    const fields: Record<string, Json> = {
      what: nightOf(night),
      on: night,
      cash: money(amount('cash')),
      owed_to_me: money(amount('owed_to_me')),
      owed_by_me: money(amount('owed_by_me')),
      net: money(net),
      taken: 'nightly',
      ...(asOf === undefined ? {} : { note: `Converted to ${currency} at rates as of ${asOf}.` }),
      ...worthOfNight(ctx, currency, night),
    };

    const wrote = write(NIGHT_REGISTER, null, fields, { actor: 'system', principal: { kind: 'system' } });
    /* A CLASH IS THE NIGHT BEING TAKEN BETWEEN THE READ ABOVE AND THIS WRITE, which is the same
       nothing-to-do as the check at the top. Any other refusal is the register not being the shape
       this code was written against, and that is worth the ladder and the suggestion it ends in. */
    if (!wrote.ok && refused(wrote) && wrote.refusal.code !== 'UNIQUE_VIOLATION' && wrote.refusal.code !== 'ALREADY_KNOWN')
      throw new TypeError(fixOf(wrote));
  }

  /**
   * NET WORTH ON THE NIGHT, SINCE money-core 3.31.0: what is held beyond cash, what is owed over time, and net worth, in
   * the night's one currency, then net worth again in dollars and in whatever units a list of prices declares.
   *
   * ALL OR NOTHING, AND NEVER THE NIGHT ITSELF. A record on an older money-core declares none of these fields, and a row
   * that names a field its list does not hold is refused whole, so they are written only where `snapshots` declares
   * them. A figure that cannot be read, or reads in another currency than the night's, leaves all three out: cash and
   * the bills are still a night worth keeping, and a net worth that adds two currencies is not one.
   *
   * THE STABLE UNITS ARE RESTATEMENTS, each left out on its own when the record holds nothing to restate by. Dollars at
   * the rate the record holds for the night (the same `rateFor` every figure converts with); and by every price a list
   * declares with `restates:` (`restates.ts`), the newest price in use, converted the same way when it is kept in
   * another currency, into the night field that list names.
   */
  function worthOfNight(ctx: EvalContext, currency: string, night: string): Record<string, Json> {
    const declared = new Set((registers.get(NIGHT_REGISTER)?.fields ?? []).map((f) => f.id));
    if (!declared.has('worth')) return {};
    const read: Record<string, number> = {};
    for (const [field, id] of [
      ['held', 'held-beyond-cash'],
      ['owed_later', 'owed-over-time'],
      ['worth', 'net-worth'],
    ] as const) {
      const figure = pageDeps().metric(id);
      if (!figure) return {};
      const out = evaluateMetric(sql, figure, ctx);
      if (!out.ok || out.value.value === null) return {};
      /* A SUM OVER NOTHING HAS NO CURRENCY, and is nought in any of them. */
      if (out.value.unit !== currency && !(out.value.value === 0 && out.value.unit === null)) return {};
      read[field] = Math.round(out.value.value);
    }
    const said: Record<string, Json> = {};
    for (const field of ['held', 'owed_later', 'worth'] as const) if (declared.has(field)) said[field] = { amount: read[field]!, currency };

    const rates = ctx.fx?.().rates ?? [];
    const into = (amount: number, from: string, to: string): number | null => {
      if (from === to) return amount;
      const r = rateFor(rates, from, to, night);
      return r === null ? null : convertMinor(amount, from, to, r.rate);
    };
    if (declared.has('worth_usd')) {
      const usd = into(read.worth!, currency, 'USD');
      if (usd !== null) said.worth_usd = { amount: usd, currency: 'USD' };
    }
    const nightFields = new Map((registers.get(NIGHT_REGISTER)?.fields ?? []).filter((f) => f.retired !== true).map((f) => [f.id, f.type] as const));
    Object.assign(said, restatedWorth(sql, [...registers.values()].map((d) => ({ id: d.id, body: d })), nightFields, read.worth!, currency, into));
    return said;
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
      const tz = recordIdentity(sql)?.tz ?? 'UTC';
      /* INSIDE THE RECORD'S QUIET HOURS THE DIGEST WAITS FOR THE OPENING (`09 §5` rule 3, "moves to the next
         opening"), and is not run and dropped: the row comes due again at the window's end, runs then, and only then
         arms its declared next occurrence. This is the one place the window applies, because a digest is the one
         non-urgent thing that leaves the record; a reminder writes an in-app note, and an urgent notice never waits
         (rule 2). The window is the record's own column, NULL reading as 21:00 to 08:00 (migration 0020 made the column; the default moved in AGT-C19). */
      const quiet = quietOf(sql.one<{ quiet: string | null }>('SELECT quiet FROM record WHERE singleton = 1')?.quiet);
      const now = clock.now();
      if (inQuietHours(now, tz, quiet)) return quietEnds(now, tz, quiet);
      runDigest(digestDeps(), decl);
      /* A SCHEDULE THAT IS NOT A SCHEDULE ENDS THE ROW rather than arming it for an hour nobody
         asked for. `null` is one-shot here, and the declaration is what needs fixing. */
      return nextOccurrence(decl.schedule, clock.now(), tz);
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
      const { metric, register, signs } = JSON.parse(row.payload) as { metric?: string; register?: string; signs?: boolean };
      /* THE RECORD'S VITAL SIGNS, A ROW A SIGN FOR THE DAY THAT ENDED (`signs.ts`), through the same door for the same
         reason as the ledger's night. ARMED AGAIN WHATEVER HAPPENED: a sign that could not be read is a night missing
         from its fourteen, which the sign itself shows, and a check that stopped after one bad night would watch
         nothing. The failure is observed, so the hole has a cause. */
      if (signs === true) {
        const tz = recordTz();
        try {
          runSignsNight(sql, clock.now(), tz);
        } catch (e) {
          observe(sql, clock.now(), [{ kind: 'write.refused', subject: `signs.night:${e instanceof Error ? e.name : 'Error'}` }]);
        }
        /* THE KEY SCAN RIDES THE SAME NIGHT (`key-scan.ts`), a bounded slice of text read for a pasted key, armed again
           whatever happened for the same reason. */
        try {
          transaction(() => scanKeys(sql, clock.now()));
        } catch (e) {
          observe(sql, clock.now(), [{ kind: 'write.refused', subject: `keys.scan:${e instanceof Error ? e.name : 'Error'}` }]);
        }
        /* AND THE NIGHT'S COUNTS (`night-counts.ts`): each list's live and deleted totals as a day's points, so a list that
           shrank with no delete by a person shows, and a bounded walk of documents for placeholders that name nothing.
           Each on its own, so one that throws costs only its own night. */
        try {
          transaction(() => countLists(sql, clock.now(), tz));
        } catch (e) {
          observe(sql, clock.now(), [{ kind: 'write.refused', subject: `night.counts:${e instanceof Error ? e.name : 'Error'}` }]);
        }
        try {
          transaction(() => deadPaths({ sql, nowMs: clock.now(), tz, registers, unnamed: (block) => readBlock(pageDeps(), block).unnamed }));
        } catch (e) {
          observe(sql, clock.now(), [{ kind: 'write.refused', subject: `night.paths:${e instanceof Error ? e.name : 'Error'}` }]);
        }
        /* AND THE AUDIT'S NIGHT: read counters past 400 days pruned, and each share whose
           date passed said once in the ledger. On its own, as the counts are. */
        try {
          transaction(() => accessNight(sql, clock.now(), mint));
        } catch (e) {
          observe(sql, clock.now(), [{ kind: 'write.refused', subject: `night.access:${e instanceof Error ? e.name : 'Error'}` }]);
        }
        return nextSignsDue(clock.now(), tz);
      }
      /* THE LEDGER'S NIGHT COMES THROUGH THE SAME DOOR, and the payload is what tells them apart: a
         metric's row says `metric`, the ledger's says `register`. `armDerived` has the reason a
         thirteenth schedule kind was not worth a migration. It is armed again either way, because a
         night that is skipped is one night and not the end of the history. */
      if (register === NIGHT_REGISTER) {
        /* THE REGISTER IS GONE AND SO IS THE ROW, like a digest whose declaration was retired: the
           thing it was about is not true any more. Every other outcome re-arms, because a night
           that could not be recorded is one night and not the end of the history. */
        if (!registers.has(NIGHT_REGISTER)) return null;
        writeNight();
        return nextOccurrence({ at: '00:05' }, clock.now(), recordIdentity(sql)?.tz ?? 'UTC');
      }
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

    /* A scheduled `call` or `poll`: one request queued, and the next run armed. A
       declaration that is gone, or whose pack is off, ends the row, and a key that is gone pauses it. */
    call: (row) => fireAction(actionDeps(), row),
    poll: (row) => fireAction(actionDeps(), row),
    /* A scheduled `script`: one `script.run` outbox row for a host to run in a sandbox, and the next run armed. */
    script: (row) => fireScript(scriptDeps(sql, { recordId: recordIdentity(sql)?.id ?? 'self', nowMs: clock.now(), tz: recordTz(), mint }), row, activeScript(sql, row.key)),

    /* A credential due for rotation. It says the id and the kind and never the label — a
       notification naming "Stripe, live" tells whoever can see it which one is worth taking. */
    rotate: (row) => rotateDue(sql, keychainDeps('system'), row.payload),

    /**
     * A rule came back to a row it asked to see again. `07 §6`'s `schedule` action.
     *
     * `rule` HAS BEEN ONE OF THE TEN SCHEDULE KINDS WITH NOTHING TO WRITE ONE AND NOTHING TO HANDLE
     * ONE. A row of a kind nothing handles fails once with a sentence naming the kind, which is the
     * right behaviour for a kind that should not exist — and the wrong one for a kind the action
     * grammar has always had a shape for.
     */
    rule: (row) => {
      const p = JSON.parse(row.payload) as { entry?: string; register?: string; rule?: string; note?: string; run?: string; every?: string };
      /* AN AUTOMATION'S TWO ROWS COME THROUGH THIS DOOR, told apart by the payload as `snapshot`'s two are. A run due
         now or waking from a wait answers its next wake or `null`; a clock answers its next turn. */
      if (typeof p.run === 'string') return advanceAt(p.run);
      if (typeof p.every === 'string') return onClock(flowDeps(), p.every, row.due_at);
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
  /**
   * THE SAME SEARCH, ANSWERING HOW MANY MATCHED, which is the half a screen cannot work out for itself.
   *
   * `fts.search` clamps any limit to a hundred, so a hundred hits is character-for-character the answer to a
   * query with exactly a hundred matches. Measured on a record at the owner's size: `revenue` drew 100 where
   * 140 matched, `the` 100 where 304 did, `oxbow` 100 where 577 did, and nothing downstream could tell. The
   * count comes back beside the hits so a clamped read arrives looking like one, the way `list` has always
   * been readable through its cursor and its `matched`.
   *
   * THE EMPTY-SEARCH OBSERVATION IS WRITTEN ONCE, HERE OR THERE AND NOT BOTH: a caller uses one of these two
   * functions for one query, so the record's own count of the searches that found nothing stays a count of
   * searches rather than of code paths.
   */
  function searchMatched(
    q: string,
    opts: {
      registers?: readonly string[] | undefined;
      limit?: number;
      viewer?: string | undefined;
      /** The most hits from any one list, asked as somebody types (`fts.ts`). */
      perList?: number | undefined;
      grant?: Readonly<Wheres> | undefined;
      hide?: Readonly<Record<string, readonly string[]>> | undefined;
      /**
       * Amounts are hidden from the caller: a figure asked for is matched only where it is still in
       * the text once every amount written there is taken out (`maskedMatched`), so a row is never found by an amount
       * she is shown as "£…".
       */
      maskMoney?: boolean | undefined;
    } = {},
  ): Searched {
    /* THE CALLER'S GRANT, LIST BY LIST (leak matrix G5): the hits and `matched` both count the rows its rule admits. The
       private rows are `viewer`'s, already in the query, so only a list with a rule of its own is held here. */
    const { grant, hide, maskMoney, ...asked } = opts;
    const mask = maskMoney === true ? maskMoneyText : undefined;
    const indexed = (q: string, o: Parameters<typeof ftsSearchMatched>[2]): Searched => (mask === undefined ? ftsSearchMatched(sql, q, o) : maskedMatched(sql, q, o ?? {}, mask));
    const admits = Object.keys(grant ?? {}).flatMap((register) => {
      const c = admitClause(register, grant, undefined);
      return c === null ? [] : [{ register, ...c }];
    });
    /* A LIST WITH A SEARCHABLE FIELD HIDDEN FROM HER IS NOT ASKED OF THE INDEX, which holds that
       field's words, so a hit would say what it holds. It is searched by `contains` over the fields she is shown, under
       the same grant and private rows, its hits after the index's. */
    const plain = Object.entries(hide ?? {}).flatMap(([register, hidden]) => {
      const decl = registers.get(register);
      if (!decl || decl.series === true || (asked.registers !== undefined && !asked.registers.includes(register))) return [];
      const indexed = decl.fields.filter((f) => !f.retired && ((f as { search?: boolean }).search === true || (f.id === decl.title && !['money', 'day', 'instant'].includes(f.type))));
      if (!indexed.some((f) => hidden.includes(f.id))) return [];
      return [{ register, fields: indexed.map((f) => f.id).filter((f) => !hidden.includes(f)) }];
    });
    const found =
      plain.length === 0
        ? indexed(q, { ...asked, admits })
        : indexed(q, { ...asked, admits, registers: (asked.registers ?? [...registers.keys()]).filter((r) => !plain.some((p) => p.register === r)) });
    if (plain.length > 0) {
      const most = Math.min(Math.max(1, asked.limit ?? 20), 100);
      const words = searchWords(q);
      for (const p of plain) {
        const got = containsMatched(sql, words, { ...p, admit: admitClause(p.register, grant, asked.viewer) }, most, mask);
        if (got.n > 0) found.matched[p.register] = got.n;
        found.hits.push(...got.hits.slice(0, Math.max(0, most - found.hits.length)));
      }
    }
    if (found.hits.length === 0 && q.trim()) observe(sql, clock.now(), [{ kind: 'search.empty', subject: q.trim().toLowerCase().slice(0, 60) }]);
    return found;
  }

  function search(q: string, opts: { registers?: readonly string[] | undefined; limit?: number; viewer?: string | undefined } = {}): Hit[] {
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
        (register) => {
          const decl = registers.get(register);
          return decl ? { fields: decl.fields, ...(typeof decl.title === 'string' ? { title: decl.title } : {}) } : undefined;
        },
        (register) => Boolean(registers.get(register)?.series),
      ),
    );

  /**
   * One arrival leaves the inbox: its state moves, and a `state` event on `inbox_raw:<id>` says who moved it and to what.
   *
   * THE EVENT IS NOT ABOUT A ROW, so it carries its own target kind rather than `appendEvent`'s `entry:`, the way the
   * ingest's `match` and `extract` events do.
   */
  const settleArrival = (id: string, from: string, to: ArrivalSettled['state'], actor: string, note: string, batch: string): void => {
    slashMayWrite(actor, 'state');
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

  /**
   * The questions the mail door asked about this arrival, settled with it (audit 10k, AK12): filing or setting aside an
   * arrival closes the door's own question about it in the same batch, so Needs you does not keep asking what the inbox
   * already says was done. A question that holds other arrivals too keeps them and lets go of this one, its row with it.
   *
   * CLOSED AS MOOT WITH `COVERED`'S LINE, so an undo of the filing asks it again (`undo.ts`'s `answered`), and a put back
   * reopens it (`reaskArrival`).
   */
  const settleAsked = (id: string, said: string, batch: string): void => {
    const asked = sql.all<{ id: string; body: string }>(
      `SELECT id, body FROM suggestion WHERE status = 'open' AND body_kind = 'rowset'
         AND EXISTS (SELECT 1 FROM json_each(suggestion.body, '$.raws') WHERE value = ?) ORDER BY rowid`,
      id,
    );
    for (const q of asked) {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(q.body) as Record<string, unknown>;
      } catch {
        continue;
      }
      const raws = Array.isArray(body.raws) ? (body.raws as unknown[]) : [];
      const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
      if (raws.length > 1 && rows.length === raws.length) {
        const at = raws.indexOf(id);
        const left = rows.filter((_, n) => n !== at);
        sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, rows: left, raws: raws.filter((_, n) => n !== at), count: left.length }), q.id);
        /* THE ROW IT LET GO OF IS KEPT ON THE LINE, in this batch, so a put back gives it back (RL10). */
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch) VALUES (?, ?, 'system', 'suggest', ?, 'suggestion', 'raws', ?, ?, ?, ?)",
          mint(),
          instant(clock.now()),
          `suggestion:${q.id}`,
          JSON.stringify({ raw: id, row: rows[at] ?? null }),
          String(left.length),
          `One mail in this question was settled, by ${said}`.slice(0, 280),
          batch,
        );
        continue;
      }
      /* ITS ROWS AND ITS MAIL DO NOT LINE UP, so which row was this mail's cannot be said: the question closes, rather
         than stay open with the settled mail in it, where a yes would file it a second time (RL10). AND EACH MAIL LEFT IN
         IT IS ASKED AGAIN ON ITS OWN (RM4), as the mail door asks a mail that arrives, so none of it sits in the inbox
         with nothing asking about it. Closed with `ONE_AT_A_TIME`'s line and not `COVERED`'s, so neither an undo nor a
         put back opens the old question again beside the new ones: a put back asks this mail again on its own too. */
      const left = raws.filter((r): r is string => typeof r === 'string' && r !== id);
      sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ? AND status = 'open'", q.id);
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note, batch) VALUES (?, ?, 'system', 'resolve', ?, 'suggestion', 'moot', ?, ?)",
        mint(),
        instant(clock.now()),
        `suggestion:${q.id}`,
        `${left.length > 0 ? ONE_AT_A_TIME : COVERED} ${said}`.slice(0, 280),
        batch,
      );
      for (const raw of left) askMailAgain(raw);
    }
  };

  /**
   * One mail still in the inbox asked about again, through the path the mail door takes when it arrives (RM4), when no
   * open question holds it. It never files itself from here: what it would have filed waits as a question, since the
   * person is in the middle of settling another mail.
   */
  const askMailAgain = (raw: string): void => {
    const held = sql.one<{ channel: string; headers: string | null; body: string | null; state: string }>('SELECT channel, headers, body, state FROM inbox_raw WHERE id = ?', raw);
    if (!held || held.channel !== 'email' || (held.state !== 'review' && held.state !== 'untriaged')) return;
    const asked = sql.one(
      `SELECT 1 AS x FROM suggestion WHERE status = 'open' AND body_kind = 'rowset'
         AND EXISTS (SELECT 1 FROM json_each(suggestion.body, '$.raws') WHERE value = ?) LIMIT 1`,
      raw,
    );
    if (asked !== undefined) return;
    let headers: Record<string, string> = {};
    try {
      const parsed = JSON.parse(held.headers ?? '{}') as unknown;
      if (parsed !== null && typeof parsed === 'object')
        headers = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'string' ? [[k.toLowerCase(), v]] : [])));
    } catch {
      /* no headers read: the door reads the body alone */
    }
    const lists = [...registers.values()];
    const people = [meetsRole(lists)?.register, orgRole(lists)?.register].filter((r): r is string => r !== undefined);
    const meet = (a: MeetArgs) => meetPerson(peopleDeps({ actor: 'ingest:mail' }, () => null, (p) => openSuggestion(governDeps(), 'ingest:mail', p)), a);
    const { settle: _files, ...ing } = ingestDeps();
    let seen: MailOutcome = { handled: false };
    try {
      seen = readMailArrival({ ing, lists, people, meet }, { raw, headers, body: held.body ?? '' });
    } catch {
      /* left where it is, and the inbox shows it */
    }
    /* A MAIL THE DOOR CAN PLACE NOTHING IN IS UNTRIAGED, where the inbox asks about it, never a review with no question. */
    if (!seen.handled && held.state === 'review') sql.exec("UPDATE inbox_raw SET state = 'untriaged', reason = NULL WHERE id = ?", raw);
  };

  /**
   * The door's questions a settlement closed or let go of the arrival from (`settleAsked`), asked again when the arrival
   * is put back in the inbox: a question that held other mail too takes this one's row back (RL10), and holds only the
   * mail still in the inbox, so a yes never files a mail that was filed meanwhile.
   */
  const reaskArrival = (settled: string | null, raw: string, actor: string, batch: string): void => {
    if (settled === null) return;
    const lines = sql.all<{ kind: string; target: string | null; field: string | null; from_v: string | null }>(
      "SELECT kind, target, field, from_v FROM event WHERE batch = ? AND kind = 'suggest' AND field = 'raws' ORDER BY rowid",
      settled,
    );
    askAgainLetGo(sql, mint, instant(clock.now()), lines, raw, actor, batch);
    const shut = sql.all<{ q: string }>(
      `SELECT substr(e.target, 12) AS q FROM event e JOIN suggestion s ON s.id = substr(e.target, 12)
        WHERE e.batch = ? AND e.kind = 'resolve' AND e.to_v = 'moot' AND e.target LIKE 'suggestion:%' AND e.note LIKE ? || '%'
          AND s.status = 'resolved' AND s.resolved_as = 'moot'`,
      settled,
      COVERED,
    );
    for (const { q } of shut) {
      sql.exec(
        `UPDATE suggestion SET status = 'open', resolved_as = NULL, defer_until = NULL, defer_why = NULL,
           cause = CASE WHEN EXISTS (SELECT 1 FROM suggestion o WHERE o.status = 'open' AND o.cause = suggestion.cause AND o.id <> suggestion.id) THEN NULL ELSE cause END
         WHERE id = ?`,
        q,
      );
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note, batch) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', 'reopened', 'Asked again: the mail is back in the inbox.', ?)",
        mint(),
        instant(clock.now()),
        actor,
        `suggestion:${q}`,
        batch,
      );
    }
    /* A QUESTION WHOSE MAIL WAS ASKED AGAIN ONE AT A TIME (RM4) stays closed, and this mail is asked on its own too. */
    const apart = sql.one(
      "SELECT 1 AS x FROM event WHERE batch = ? AND kind = 'resolve' AND to_v = 'moot' AND target LIKE 'suggestion:%' AND note LIKE ? || '%' LIMIT 1",
      settled,
      ONE_AT_A_TIME,
    );
    if (apart !== undefined) askMailAgain(raw);
  };

  /**
   * The person's settlement that put this arrival in `state`: its NEWEST `state` event, and only when that event's `to_v`
   * is `state`. `undefined` when the arrival is where it is for some other reason.
   *
   * THE NEWEST EVENT AND NOT THE NEWEST ONE ENDING IN `state`, because the ingest moves an arrival without writing one.
   * Its `store` sets the state with an `INSERT`, or an `UPDATE` on a rescue (`ingest.ts:761`), and the rescue runs again
   * on an `untriaged` row whose `reason` is `UNVERIFIED` (`ingest.ts:669-673`), which a return makes possible. So a
   * person filed an unverified arrival, returned it, and a verified redelivery filed it again through the pattern: the
   * newest event ending in `matched` was still the person's old filing, and reading it handed the return a row it had
   * already archived and `fileArrival` that dead row as the "already filed" answer
   * (`test/arrival-return.test.ts`, the last case). An event that did not put the arrival where it is now says nothing
   * about how it got there.
   */
  const settledBy = (id: string, state: string): { from: string; batch: string | null; actor: string; ts: string } | undefined => {
    const last = sql.one<{ from_v: string | null; to_v: string | null; batch: string | null; actor: string; ts: string }>(
      "SELECT from_v, to_v, batch, actor, ts FROM event WHERE target = ? AND kind = 'state' ORDER BY rowid DESC LIMIT 1",
      `inbox_raw:${id}`,
    );
    if (!last || last.to_v !== written(state) || last.from_v === null) return undefined;
    return { from: JSON.parse(last.from_v) as string, batch: last.batch, actor: last.actor, ts: last.ts };
  };

  /**
   * The row a person filed this arrival as, found through the batch its `state` event shares with the row's `create`.
   * Only while that filing is what the arrival is still in (`settledBy`): after a return and a rescue it is `null`.
   */
  const filedAs = (id: string): Entry | null => {
    const settled = settledBy(id, 'matched');
    if (!settled?.batch) return null;
    const made = sql.one<{ target: string }>(
      "SELECT target FROM event WHERE batch = ? AND kind = 'create' AND target LIKE 'entry:%' ORDER BY rowid LIMIT 1",
      settled.batch,
    );
    return made ? byId(made.target.slice('entry:'.length), true) : null;
  };

  /**
   * An arrival's `settled` for `inboxBefore`: who filed or archived it and the row a filing made, or nothing when it
   * waits or a rule moved it. A spread, so a line with no settlement carries no key at all.
   *
   * ONLY THE TWO STATES A PERSON OR A RUN SETTLES INTO ARE ASKED, so a page of what waits reads no events, and a page of
   * what was filed reads two small indexed lookups a line, bounded by the page's own limit.
   */
  const settlementOf = (id: string, state: string): { settled?: ArrivalSettlement } => {
    if (state !== 'matched' && state !== 'ignored') return {};
    const settled = settledBy(id, state);
    if (!settled) return {};
    const row = state === 'matched' ? filedAs(id) : null;
    return {
      settled: {
        by: settled.actor,
        at: settled.ts,
        row: row ? { id: row.id, register: row.register, seq: row.seq, version: row.version, archived: row.deleted_at !== null } : null,
      },
    };
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

  /** The `export` event both exports write before a row is read, whole (`export`) or a piece at a time (`exportStream`). */
  const exportEvent = (opts: { sections?: readonly Section[]; redactGrants?: boolean; actor?: string }): void =>
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'export', NULL, NULL, ?)",
      mint(),
      instant(clock.now()),
      opts.actor ?? 'system',
      `sections ${(opts.sections ?? ['all']).join(', ')}${opts.redactGrants === true ? ', grants redacted' : ''}`,
    );

  const kernel = {
    transaction,
    allocate,
    reload,
    search,
    searchMatched,
    rebuildFts,

    /**
     * Runs `write` with the record's clock reading `atMs`, so what it writes is stamped then: its events, the rows'
     * `created_at` and `updated_at`, and a question's `opened_at`.
     *
     * FOR WRITING A HISTORY IN PROCESS, which is what a sample is. The seed wrote every row, question and rule's work in
     * one instant, so every line of every feed read "just now" and a question raised last night read as one filed with
     * the rest. NO ROUTE REACHES IT, as no route reaches a write's `stamp`: a request's context has no clock to hand in.
     *
     * NEVER AHEAD OF THE CLOCK, because a write stamped in the future is the hazard the read mark already guards against
     * (`markRead`), and NEVER BEHIND AN EARLIER `backdate`, because a feed is read in the order the log was written and a
     * line written later must not say it happened sooner. An instant past either bound is held at it rather than refused,
     * so a sample written against a clock that reads earlier than its own day still goes in, in order. Ids are still
     * minted on the running clock (`mint`), so the log's order is the order of the writes. `write` may be async; the
     * instant is held until it settles.
     */
    backdate<T>(atMs: number, write: () => T): T {
      if (!Number.isFinite(atMs)) throw new Error(`backdate: ${atMs} is not an instant.`);
      const before = held;
      held = latest = Math.max(latest, Math.min(atMs, given.now()));
      let out: T;
      try {
        out = write();
      } catch (e) {
        held = before;
        throw e;
      }
      if (out instanceof Promise) return out.finally(() => (held = before)) as T;
      held = before;
      return out;
    },

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
    /* `reads` AS `list` TAKES IT, and for the same reason: a ref in the figure's `where` was resolved against the whole
       record, so a figure filled with a hidden client's title counted that client's jobs for a member who could not
       list them, and the record's door made up for it with a second `list` and a refusal of its own
       (`test/metric-reads.test.ts`). Handed `reads`, a ref into a list she cannot read names no row, as it does there. */
    metric: (decl: MetricDecl, o: { reads?: (register: string) => boolean; viewer?: string | undefined } = {}): Result<Reading> => {
      const live = liveTarget(sql, decl, evalContext([], o.viewer));
      /* AND A HOP IN IT HELD TO WHAT SHE READS (`readerSchemaOf`), as `list` holds one. */
      /* A READER WHO READS EVERY LIST IS READ AS THE RECORD READS, which is the same reading and one that can be held. */
      const reads = o.reads === undefined || [...registers.keys()].every((list) => o.reads!(list)) ? undefined : o.reads;
      const ctx = reads === undefined ? evalContext([], o.viewer) : withViewer(o.viewer, { ...evalContext(), reads, schemaOf: readerSchemaOf(reads) });
      /* HELD ACROSS READS WHILE ITS LISTS STAND (`readingHeld`), as a page's figure is. */
      return readingHeld(live, ctx, 'read', (s, c) => evaluateMetric(s, live, c));
    },

    /* ── pages ──────────────────────────────────────────────────── */

    /** Every page a person could open, templates expanded into one page per row. */
    /* AND WHICH REGISTERS EACH DRAWS FROM, so the record can scope the list the way `boot` scopes
       its own. It is stripped before it leaves — the caller gets a slug and a title. */
    /* AND THE RESOLVER GOES WITH IT, because a `stat` block names its registers through the metric
       declarations in its `cells` rather than through a `source` of its own. Without it a page made
       of figures named no register, was treated as prose, and was listed to everybody. */
    pages: (opts: { hostSources?: PageDeps['hostSources'] } = {}) => {
      /* ONE READ OF THE DECLARATIONS FOR EVERY PAGE (`declaredOnce`): each page asked every figure again. */
      const deps = declaredOnce({ ...pageDeps(), ...(opts.hostSources ? { hostSources: opts.hostSources } : {}) });
      /* WHICH LISTS A PAGE READS IS DECLARATIONS ONLY, so it is asked of the figures kept for this revision
         (`declaredKept`), as `blockRegisters` asks: each filled page read every figure's row and live target again. */
      const kept = declaredKept();
      const near = { ...beside(kept), ...(opts.hostSources ? { hostSources: opts.hostSources } : {}) };
      /* A ROW'S PAGE IS FILLED AND ITS LISTS NAMED ONCE WHILE THE ROW AND THE DECLARATIONS STAND (`pagesKept`): every
         write moved the record's version and every page of every run, person and skill was filled and read again, most
         of what a `boot` after a write cost. Kept by the declaration revision and, for a row's page, by the template and
         everything the fill reads of the row, so a row that changed is filled again and one that did not is the copy. A
         host's own sources name lists of their own, so a call that hands them keeps nothing. */
      const memo = opts.hostSources ? null : pagesKept?.revision === revision ? pagesKept : (pagesKept = { revision, filled: new Map(), lists: new Map() });
      const filled = new Map<string, PageDecl>();
      const lists = new Map<string, string[]>();
      const keyOf = (decl: PageDecl, row: Entry): string => `${decl.page}\u0000${row.register}#${row.seq ?? ''}\u0000${JSON.stringify(row.fields)}`;
      const fillRow = (decl: PageDecl, row: Entry): PageDecl => {
        if (memo === null) return fill(decl, row) as PageDecl;
        const key = keyOf(decl, row);
        const made = memo.filled.get(key) ?? (fill(decl, row) as PageDecl);
        filled.set(key, made);
        return made;
      };
      const listsOf = (p: { decl: PageDecl; row?: Entry }): string[] => {
        if (memo === null) return registersOf(p.decl, kept.metric, near);
        const key = p.row === undefined ? `\u0001${p.decl.page}` : keyOf(p.decl, p.row);
        const named = memo.lists.get(key) ?? registersOf(p.decl, kept.metric, near);
        lists.set(key, named);
        return named;
      };
      const resolved = resolvePages(deps, fillRow);
      const out = resolved.map((p) => ({
        slug: p.slug,
        title: p.decl.title,
        registers: listsOf(p),
        /* WHERE IT SITS IN THE RAIL, for `boot`. A declaration's `nav` is checked at install, so only its shape is asked here. */
        nav: navOf(p.decl.nav),
        /* AND WHICH ROW IT IS A PAGE OF, which is not one of the registers above: those are the
           lists its blocks READ, and a page per project reads updates, runs and whatever else it
           draws. What it is ABOUT is the one row the template expanded over, and `null` for a page
           somebody wrote. The rail is what needs it: a cap of the form "at most five pages per
           list under one heading" cannot be written against entries that carry no list, so the
           one the sample applies could not be applied to the rail a real record draws. */
        /* AND WHEN THAT ROW LAST CHANGED, because a template's pages now come in a stable order (the order written) and the
           rail's five are the rows touched last, which it can only choose with the time beside each (`boot-live.ts`). */
        about: p.row ? { register: p.row.register, seq: p.row.seq, updated_at: p.row.updated_at } : null,
        /* AND THAT ROW'S ID, which a row with no number (`series: true`) is found by alone: a shared link to its page is
           bound to it (`boundFor` in the record's `methods/shares.ts`). Beside `about` and not in it, because `about` is
           copied whole into `boot`. */
        row: p.row ? p.row.id : null,
        icon: typeof p.decl.icon === 'string' ? p.decl.icon : null,
        /* THE TEMPLATE A PAGE WAS MADE FROM, by its own `page`, and `null` for a page somebody wrote. Its declaration is
           the template's, so a reader of a page's source (`arrangement({ page })`) finds it by this. `fill` leaves
           `page` untouched, so this is the template's own id. */
        template: p.row ? p.decl.page : null,
        /* AND WHETHER ITS ROWS COME AND GO (`claimRank`: the runs, or a template that says `fleeting`), so `boot` can send
           such a page as its address alone: on his record 908 of 990 pages were runs, 207 KB of a 278 KB boot. */
        fleeting: p.row !== undefined && claimRank(p.decl) === 2,
        /* THE LIST THIS PAGE IS THE PAGE OF (`list:`), so `/r/<list>` opens here: only while that list is installed, and
           never on a page a template made, which is one row's. `null` for every other page. */
        opens: !p.row && typeof p.decl.list === 'string' && registers.has(p.decl.list) ? p.decl.list : null,
      }));
      /* ONLY WHAT THIS CALL FILLED IS KEPT, so the rows gone and the versions a row moved past are let go. */
      if (memo !== null) {
        memo.filled = filled;
        memo.lists = lists;
      }
      return out;
    },

    /**
     * One page, with every block run.
     *
     * ONE BLOCK'S REFUSAL IS ONE BLOCK. A page whose third block names a field nobody declared shows
     * the other four and says what happened in the third — a page that fails whole is a page nobody
     * can use to find out what is wrong with it.
     */
    /* `walk` IS A LENGTH A READER PICKED on a forecast's horizon knob, which a forecast offering it walks in full (`walkReach`
       in `pages.ts`); without it a walk reaches past what it opens on to `WALK_UNASKED` at most. `reader` IS WHO IS READING
       (`PageDeps.reader`), so the look is laid over the blocks as this caller is shown them. `level`, `readerIs` and
       `runs` ARE WHAT THE CUT READS (`PageDeps`): the caller's level, who they are to the record, and the verbs that
       run; without them a page reads as level read with no reader. */
    page: (
      slug: string,
      filter?: Readonly<Record<string, string>>,
      opts: {
        walk?: number | 'last';
        reader?: PageDeps['reader'];
        level?: string;
        readerIs?: PageDeps['readerIs'];
        runs?: ReadonlySet<string>;
        hostSources?: PageDeps['hostSources'];
        actorName?: PageDeps['actorName'];
        /** Who is reading, so rows kept private to somebody else are neither drawn nor counted. */
        viewer?: string | undefined;
        /** What of the reads across the record she is shown (`PageSees`), or nothing for the owner. */
        sees?: PageSees | undefined;
        /** The row the host last saw at this address, when it is a page of a row that comes and goes (`rowPageAt`). */
        about?: { register: string; seq: number } | undefined;
        /** `false` draws every card's trend from its own figure, never a key number (`PageDeps.keyNumbers`): a link's read. */
        keyNumbers?: false;
      } = {},
    ): Result<PageResult> =>
      readPage(
        {
          ...pageDeps(opts.viewer, opts.sees),
          ...(opts.keyNumbers === false ? { keyNumbers: false as const } : {}),
          /* WHAT THE RECORD READS THAT THE KERNEL CANNOT (`lists`, `pages`), and the names it holds for the people in the log. */
          ...(opts.hostSources ? { hostSources: opts.hostSources } : {}),
          ...(opts.actorName ? { actorName: opts.actorName } : {}),
          ...(opts.walk === undefined ? {} : { walk: opts.walk }),
          ...(opts.reader ? { reader: opts.reader } : {}),
          ...(opts.level === undefined ? {} : { level: opts.level }),
          ...(opts.readerIs === undefined ? {} : { readerIs: opts.readerIs }),
          ...(opts.runs ? { runs: opts.runs } : {}),
        },
        slug,
        filter,
        opts.about,
      ),

    /**
     * A reader of many pages in one walk, each answered as `page` answers it, the figures they share read once.
     *
     * `page` reads one page as `page` does, `block` one block as `block` does (with no walk or inbox to say), and
     * `blockRegisters` names a block's lists as `blockRegisters` does, each over the walk's one set of reads.
     *
     * A WALK OVER EVERY PAGE READ THE SAME FIGURES ON EACH. Health's notes each asked `signs-red`, which reads every vital
     * sign, and each person's page asked who may be written twice, so the record's check of its own words read the signs
     * ten times and the people once a page, and every page resolved every other: on a lived record of 3,914 rows the walk
     * took 2.7 s, most of it reading what it had read already. Here a figure
     * is read once for the walk, by its declaration whole (a parameter filled in is another figure), and so are the vital
     * signs, the money's rates, each figure's declaration and the pages a template makes; every page is still read whole,
     * block by block.
     *
     * ONLY FOR ONE SYNCHRONOUS WALK THAT WRITES NOTHING, which is the one thing that keeps a kept reading true: nothing can
     * change under it. Each reading is handed out as a copy, so a block that reshapes one never reshapes the next's.
     */
    pageWalk: (
      opts: { hostSources?: PageDeps['hostSources']; actorName?: PageDeps['actorName']; viewer?: string | undefined } = {},
    ): {
      page: (slug: string, filter?: Readonly<Record<string, string>>) => Result<PageResult>;
      block: (decl: PageBlock, opts?: { here?: Entry }) => BlockResult;
      blockRegisters: (block: PageBlock) => string[];
    } => {
      const base = declaredOnce({
        ...pageDeps(opts.viewer),
        ...(opts.hostSources ? { hostSources: opts.hostSources } : {}),
        ...(opts.actorName ? { actorName: opts.actorName } : {}),
      });
      let built: VitalSign[] | undefined;
      let every: VitalSign[] | undefined;
      let rates: ReturnType<NonNullable<EvalContext['fx']>> | undefined;
      const fx = base.ctx.fx;
      const ctx: EvalContext = {
        ...base.ctx,
        signs: () => (built ??= signsHeldNow()),
        ...(fx ? { fx: () => (rates ??= fx()) } : {}),
      };
      const readings = new Map<string, Result<Reading>>();
      const once: Stamps = { rows: new Map() };
      const metrics = new Map<string, MetricDecl | null>();
      const signs = base.signs;
      const activity = base.activity;
      const lines = new Map<number, ReturnType<NonNullable<PageDeps['activity']>>>();
      const deps: PageDeps = {
        ...base,
        ctx,
        metric: (id) => {
          if (!metrics.has(id)) metrics.set(id, base.metric(id));
          return metrics.get(id) ?? null;
        },
        read: (decl) => {
          const key = JSON.stringify(decl);
          let got = readings.get(key);
          if (got === undefined) {
            got = readingHeld(decl, ctx, 'read', (s, c) => evaluateMetric(s, decl, c), once);
            readings.set(key, got);
          }
          return structuredClone(got);
        },
        readApart: (decl) => readingHeld(decl, { ...ctx, fx: () => ({ home: null, rates: [] }) }, 'apart', (s, c) => evaluateMetric(s, decl, c), once),
        /* THE RECORD'S OWN SIGNS ARE READ OVER THE BUILT-IN ONES THE FIGURES READ, never a second read of them. */
        ...(signs ? { signs: () => structuredClone((every ??= everySign(structuredClone(ctx.signs!() as VitalSign[])))) } : {}),
        /* AND THE LOG A FEED IS DRAWN FROM, by how many lines it asks: every feed asks the same, and every look its seen. */
        ...(activity
          ? {
              activity: (limit: number) => {
                if (!lines.has(limit)) lines.set(limit, activity(limit));
                return structuredClone(lines.get(limit)!);
              },
            }
          : {}),
      };
      /* AND THE PAGES ARE RESOLVED ONCE: each read resolved every page, a template's one a row, to find its own. */
      let resolved: ReturnType<typeof resolvePages> | undefined;
      deps.resolved = () => (resolved ??= resolvePages(deps));
      /* AND THE LISTS A BLOCK READS, as `blockRegisters` names them, over the same declarations read once. */
      const near = beside(deps);
      let watched: string[] | undefined;
      return {
        page: (slug, filter) => readPage(deps, slug, filter),
        block: (decl, opts = {}) => readBlock(opts.here === undefined ? deps : { ...deps, here: opts.here }, decl),
        blockRegisters: (block) => [
          ...registersOfBlock(block, deps.metric, near),
          ...(sourceModule(block.source)?.everyList ? (watched ??= watchedLists().map((l) => l.id)) : []),
        ],
      };
    },

    /**
     * WHAT `make` READ, WATCHED SO IT CAN BE TOLD LATER WHETHER IT WOULD READ THE SAME (`DrawTrace`, `held-readings.ts`):
     * the lists its statements bound the list column to, a held reading it was handed counted by the lists that one read,
     * and every read the lists cannot version or that bound an instant, kept as asked, and when. `seen` is `null` for a
     * draw nothing can keep: one that wrote, read a vital sign, was handed a held figure that bound an instant, or asked a
     * statement this cannot read. For a host that keeps what it found from a draw and draws again only once what it read
     * moved (the look's later walks of the pages, `slashHeadlinesAgain`), stamped by `drawStamper`.
     */
    drawsOf: <T,>(make: () => T): { value: T; seen: DrawSeen | null } => {
      const trace = drawTraceOf();
      drawTraces.push(trace);
      let value: T;
      try {
        value = make();
      } finally {
        drawTraces.pop();
      }
      for (const t of drawTraces) withinDraw(t, trace);
      return { value, seen: trace.whole || trace.instant ? null : { lists: [...trace.lists].sort(), reads: [...trace.reads.values()], at: clock.now(), ...(trace.until === undefined ? {} : { until: trace.until }) } };
    },

    /**
     * WHAT A DRAW SEEN BY `drawsOf` WOULD READ NOW, AS ONE STRING: its lists by their versions, as a held reading is
     * stamped (`listsStamp`), and each read it kept asked again, its instants moved on by the time gone since the draw
     * (`shifted`), its answer folded in. Two equal stamps are a draw that would read the same, on the same day. One
     * stamper asks each list once, so it is for stamps with no write between them.
     */
    drawStamper: (): ((seen: DrawSeen, more?: readonly string[]) => string) => {
      const once: Stamps = { rows: new Map() };
      return (seen, more = []) => {
        muted++;
        try {
          const lists = listsStamp([...new Set([...seen.lists, ...more])].sort(), once);
          let hash = 0x811c9dc5;
          let length = 0;
          const gone = clock.now() - seen.at;
          for (const r of seen.reads) {
            let said: string;
            try {
              said = JSON.stringify(sql.all(r.text, ...shifted(r, gone)), (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v instanceof Uint8Array ? [...v] : v));
            } catch (e) {
              said = `!${e instanceof Error ? e.message : String(e)}`;
            }
            for (let i = 0; i < said.length; i++) hash = Math.imul(hash ^ said.charCodeAt(i), 0x01000193) >>> 0;
            hash = Math.imul(hash ^ 0x1f, 0x01000193) >>> 0;
            length += said.length;
          }
          /* FNV-1a over every answer, with how long they ran: a page's reads past the lists are a few dozen small answers. */
          /* AND WHETHER THE CLOCK ALONE HAS MOVED WHAT IT DREW (a walk ahead, `DrawSeen.until`). */
          return JSON.stringify([lists, seen.reads.length, length, hash, seen.until !== undefined && clock.now() >= seen.until]);
        } finally {
          muted--;
        }
      };
    },

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
    /* AND A SOURCE THAT SAYS SOMETHING OF EVERY LIST (`sources/index.ts` `everyList`) NAMES EACH LIST IT WATCHES, so a
       reader held from one of them is held from the block. `*` alone let her through when she had no ceiling. */
    blockRegisters: (block: PageBlock, opts: { hostSources?: PageDeps['hostSources'] } = {}): string[] => [
      ...registersOfBlock(block, declaredKept().metric, { ...beside(declaredKept()), ...(opts.hostSources ? { hostSources: opts.hostSources } : {}) }),
      ...(sourceModule(block.source)?.everyList ? watchedLists().map((l) => l.id) : []),
    ],

    /**
     * Whether a block's `source` is one this build can read: `register.x`, `metric.x`, `block.n`, or a part of the code
     * that answers by name. By its shape and never by the record, so a list or a figure since taken out still reads
     * true: those are asked through `blockRegisters` and the declarations. False is a source from a part of the code
     * since removed, which names no list anybody can check a reader against.
     */
    sourceKnown: (source: string): boolean => sourceKnown(source),

    /**
     * What a rule WOULD do, without doing any of it.
     *
     * THE FEATURE, not a debugging aid. A rule changes rows while nobody is looking, and the honest
     * way to introduce one is to say "this matches 38 rows, wins on 31, loses 7 to `chase-late`"
     * BEFORE it is turned on. Every product that ships rules without this ships a feature people are
     * afraid of.
     *
     * `reads` IS `list`'s, AND FOR THE SAME DOOR. The record guards the list a rule is about and the lists its steps
     * reach, and a `ref` title in the candidate's `when` is looked up in a third list neither names, so the caller that
     * knows who is asking passes it here as it does to `list` (`rules.ts` `dryRun` says what it closed).
     */
    dryRun: (candidate: RuleDecl, limit?: number, o?: { reads?: (register: string) => boolean }): Result<DryRun> =>
      dryRun(rulesDeps(), candidate, limit, o?.reads),

    /**
     * Run one installed rule over the rows that are already there.
     *
     * A RULE FIRES ON A WRITE, so a rule written today has never seen the four hundred rows written
     * before it. Without this, turning one on means editing every one of those rows by hand.
     */
    /* ONE PRESS IS ONE BATCH: `batch` goes through to every write the rule makes, so one undo takes back the lot. */
    applyRule: (id: string, opts: { dry?: boolean; limit?: number; batch?: string } = {}): Result<RuleApplied> => {
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
    runway: (opening: number, legs: readonly Leg[], horizon?: Horizon, into?: string): Result<Runway> =>
      runway(
        { sql, schemaOf: (r) => hopSchemaOf(r) ?? null, titleOf: (r) => registers.get(r)?.title ?? null, hydrate: rowIn, ctx: evalContext() },
        opening,
        legs,
        horizon,
        undefined,
        into,
      ),

    /**
     * The record's mail patterns, for a door that reads mail somewhere other than the forwarding address (`ingest.ts`
     * `mailPatterns`): the words they look for, and which of them would take a mail. A read; nothing is stored.
     */
    mailPatterns: () => mailPatterns(ingestDeps().ingests(), instant(clock.now())),

    /**
     * A payload arrives, and the record fills itself.
     *
     * ONE DETERMINISTIC TRANSACTION with no model call in it: store, match, extract, validate,
     * write. The same payload twice produces the same record twice, and a payload nobody wrote a
     * pattern for is a row somebody can see rather than a silence.
     */
    arrive: (arrival: Arrival, only?: IngestDecl): Result<Arrived> => {
      const arrived = arrive(ingestDeps(only), arrival, transaction);

      /* FORWARDED MAIL NO PATTERN TOOK IS READ FOR WHO AND WHAT (`mail-arrival.ts`), in a transaction of its own after the
         bytes are stored. What it files or asks is the record's; mail it can place nothing in falls through, untriaged. */
      const mailMeet = (a: MeetArgs) => meetPerson(peopleDeps({ actor: 'ingest:mail' }, () => null, (p) => openSuggestion(governDeps(), 'ingest:mail', p)), a);
      /* VERIFIED MAIL A PATTERN TOOK MEETS ITS SENDER, in a transaction of its own after the bytes are stored, so
         a meeting that throws or is refused never costs the arrival. A skip rule's mail meets nobody, and nor does a redelivery. */
      if (arrived.ok && arrival.channel === 'email' && arrival.verified !== false && !arrived.value.redelivered && (arrived.value.state === 'matched' || arrived.value.state === 'review'))
        try {
          const headers = Object.fromEntries(Object.entries(arrival.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
          transaction(() => meetPatternedSender(mailMeet, headers));
        } catch {
          /* the arrival stands; the sender is met by the next one */
        }
      const out: Result<Arrived> = (() => {
        if (!(arrived.ok && arrival.channel === 'email' && arrival.verified !== false && arrival.ingest === undefined && arrived.value.state === 'untriaged' && !arrived.value.redelivered)) return arrived;
        const first = arrived.value;
        const lists = [...registers.values()];
        const people = [meetsRole(lists)?.register, orgRole(lists)?.register].filter((r): r is string => r !== undefined);
        /* A READING THAT FAILS LEAVES THE MAIL STORED AND UNTRIAGED, as it was: the bytes are the record's memory. */
        let seen: MailOutcome = { handled: false };
        try {
          seen = transaction(() =>
            readMailArrival(
              {
                ing: ingestDeps(only),
                lists,
                people,
                meet: mailMeet,
              },
              { raw: first.raw, headers: Object.fromEntries(Object.entries(arrival.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])), body: arrival.body ?? '' },
            ),
          );
        } catch {
          /* left stored and untriaged */
        }
        return seen.handled ? ok<Arrived>({ ...first, state: seen.state, reason: seen.reason, ...(seen.suggestion === undefined ? {} : { suggestion: seen.suggestion }) }) : arrived;
      })();

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
      /* AN AUTOMATION ON ARRIVALS IS STARTED HERE, after the arrival committed and in a transaction of its own, for the
         reason `3′` above gives: the bytes are the record's memory, and nothing an automation does may roll them
         back. Every state starts one, matched or not, and a redelivery starts none (`onArrival`); an arrival nothing
         verified starts one only for a rule that says `unverified: true`. */
      if (out.ok && !out.value.redelivered) {
        const flows = installedFlows(sql);
        if (flows.some((f) => triggerOf(f.body) === 'arrival'))
          transaction(() =>
            onArrival(flowDeps(), flows, {
              raw: out.value.raw,
              channel: arrival.channel,
              ingest: out.value.ingest,
              state: out.value.state,
              wrote: out.value.wrote,
              /* ABSENT IS VERIFIED, as `Arrival.verified` says: only a public door can answer the question at all. */
              verified: arrival.verified !== false,
              ...(out.value.counterparty === undefined ? {} : { counterparty: out.value.counterparty }),
            }),
          );
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
         rank 16 and can reach both, so it hands the reader down beside the currency table. A host
         that does not is answered per page rather than silently. */
      ctx: { maxRows?: number; rows?: ExtractDeps['rows'] } = {},
    ): Extraction =>
      extractPull(
        /* `day` COMES THE SAME WAY `rows` DOES, and for the same reason one rank down: `43 §4.3`'s
           date grammar is a token set this package has no business holding, so a record that has one
           hands it in and a kernel without one keeps its four formats. Without this a connector's
           page read dates by a different grammar than the same record's email did. */
        { schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null), exponent: exponentOf, day: opts.day ?? day, rows: ctx.rows },
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
     * host's executor, finish each, and re-arm.
     *
     * THE EXECUTOR IS AN ARGUMENT, so there is no network in the kernel. Every step is its own transaction and
     * the executor runs between them, outside all of them.
     */
    async runActions(execute: Execute, opts: { limit?: number; scheduler?: Scheduler; page?: PagedRun; budget?: Budget; script?: ScriptRunner } = {}): Promise<ActionsRun> {
      try {
        return await runScheduledActions(
          {
            /* A DUE SCRIPT FIRES IN THIS PASS TOO, so the pass that fires it is the pass that can run it. */
            drain: () => transaction(() => drainSchedule(sql, ackDeps(), HANDLERS, 100, [...ACTION_KINDS, 'script'])),
            lease: (n) => transaction(() => lease(sql, ackDeps(), ['pull.fetch', 'script.run'], n)),
            prepare: (job) => transaction(() => (job.kind === 'script.run' ? prepareScript(scriptRunDeps(), job) : prepareAction(actionDeps(), job))),
            finishScript: (s, a) => transaction(() => finishScript(scriptRunDeps(), s, a)),
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
          opts.script,
        );
      } finally {
        if (opts.scheduler) await tail(opts.scheduler);
      }
    },

    /** Start a paused scheduled action again, now. A refused key pauses one, and nothing else restarts it. */
    resumeAction: (ingest: string, actor: string) =>
      transaction(() => resumeScheduledAction({ sql, mint, nowMs: clock.now() }, ingest, actor)),

    /** Start a script paused by three refused runs again, now. Nothing else restarts it. */
    resumeScript: (script: string, actor: string) => transaction(() => resumeScript({ sql, mint, nowMs: clock.now() }, script, actor)),

    /**
     * One `ctx.propose` from a running script, tried against the gate and filed by nobody yet (`tryProposal` in
     * `script-run.ts`): what the gate would answer, and the proposal to hand back with the run's answer, or `null` when
     * it would file nothing. `run` is the leased run's script, actor and `writes:`, as `prepareScript` read them.
     */
    scriptProposal: (run: { script: string; actor: string; writes: readonly string[] }, p: unknown): Result<{ said: ScriptProposed; queued: ScriptProposal | null }> =>
      tryProposal(scriptRunDeps(), run, p),

    /** How many notices an add-on's scripts may still send today (`ctx.notify`), `owner` as `scriptOwner` names it. A read. */
    scriptNoticesLeft: (owner: string): number => noticesLeft(sql, owner, clock.now()),

    /** An add-on's own store as it stands (`ctx.store`), `owner` as `scriptOwner` names it. A read. */
    scriptStore: (owner: string): Record<string, unknown> => storeOf(sql, owner),

    /** An add-on's store into the bin, removed with its data (`uninstallPack {data: true}`). Answers how many keys went. */
    binAddonStore: (pack: string): number => binStore(sql, pack, clock.now()),

    /** An add-on's binned store back, installed again inside `REMOVED_WINDOW_DAYS`. Answers how many keys came back. */
    restoreAddonStore: (pack: string): number => restoreStore(sql, pack, clock.now(), REMOVED_WINDOW_DAYS * 86_400_000),

    /** Every active scheduled action: its schedule, its key by label, its last run and this month's counts. A read. */
    actions: () => listActions(sql, clock.now()),

    /**
     * Whether a key can carry an approval: held by the keychain, and openable by a scheduled run.
     * `null` for fine, otherwise the code and the sentence. The row is looked at, never its bytes.
     */
    keyReady: (name: string, paged = false): KeyNotReady | null => keyReady(sql, name, paged),
    /** Hold a key whose entry names no host to the host a press just approved, in the caller's transaction (`pinHost`). */
    pinHost: (label: string, host: string, actor: string): Result<{ id: string; host: string; pinned: boolean }> => holdKeyToHost(sql, label, host, clock.now(), actor),

    /** A row by its title, for a row id or spoken id: how a plan names the project an action runs for. */
    titleOfRow: (ref: string): string | null => titleOfRow(ref),

    /**
     * What the live keychain entry a label names says it opens, or `null`: the host a script's install line names beside
     * that key. A plan built outside the kernel hands this to `declare` as `Installed.opensOf`, so a pack's line and a
     * proposal's say the same thing.
     */
    opensOf: (label: string): string | null => opensOf(label),

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
        /* IN PASSES, because an example another example still links to is refused while that one stands: the founder's
           organisation names its account, and the account came first. Each pass clears what it can, and a row still
           refused when a pass clears nothing is kept. */
        let left = [...untouched];
        for (let more = true; more && left.length; ) {
          const refused: typeof left = [];
          for (const row of left) {
            const out = write(row.register, row.id, { deleted_at: true }, { ...w, batch, note: w.note ?? 'Cleared the examples' });
            if (out.ok) cleared++;
            else refused.push(row);
          }
          more = refused.length < left.length;
          left = refused;
        }
        return ok({ cleared, kept: touched + left.length });
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
            "SELECT body FROM declaration WHERE coalesce(pack_id, json_extract(body, '$.pack')) = ? AND kind IN ('ingest', 'script') AND superseded_at IS NULL AND retired = 1 ORDER BY id",
            id,
          )
          .flatMap((r) => {
            const body = JSON.parse(r.body) as { fetch?: { base?: unknown } };
            const e = egressOf(body, titleOfRow, opensOf, keyScope);
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
        { passphrase: recordWrapping(sql)?.wrapped_by === 'passphrase' },
      ),

    actionOrigins: (): string[] =>
      originsOf(
        sql
          .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
          .map((r) => JSON.parse(r.body) as ActionDecl),
      ),

    /** How many entries hold each value of one field, in one query: the page tally, for the record's `countBy`. */
    countBy: (q: { register: string; field: string; where?: Predicate | undefined }) => pageDeps().tally!(q),

    /** One block, without a page around it — what a `draw` tool hands an agent. `inbox` is the reader's reach, so a
        one-block preview tells a `signs` block in the kernel's quiet words to a key the inbox does not reach. */
    block: (
      decl: PageBlock,
      opts: { walk?: number | 'last'; inbox?: boolean; here?: Entry; level?: string; readerIs?: PageDeps['readerIs']; runs?: ReadonlySet<string>; viewer?: string | undefined; sees?: PageSees | undefined } = {},
    ): BlockResult =>
      readBlock(
        {
          ...pageDeps(opts.viewer, opts.sees),
          ...(opts.walk === undefined ? {} : { walk: opts.walk }),
          ...(opts.inbox === undefined ? {} : { reader: { hold: (b: BlockResult) => b, inbox: opts.inbox } }),
          ...(opts.here === undefined ? {} : { here: opts.here }),
          ...(opts.level === undefined ? {} : { level: opts.level }),
          ...(opts.readerIs === undefined ? {} : { readerIs: opts.readerIs }),
          ...(opts.runs ? { runs: opts.runs } : {}),
        },
        decl,
      ),

    /**
     * `block` for every block of one read, over one set of deps, as a page's own read draws its blocks: a figure, a walk
     * and the vital signs are worked out once for the read and not once a block. Today's body is drawn block by block
     * (`previewPage`), and each block worked out its figures again, the signs among them.
     *
     * AND EACH LIST READ ONCE FOR THE READ, by the question asked of it, with the pages and the figures' declarations
     * (`onceForRead`): Today's two blocks over what falls due read every list with a deadline twice, the same rows the
     * same way, and its two key-number blocks and its cards read the projects three times.
     */
    blocksOf: (opts: { inbox?: boolean; viewer?: string | undefined; sees?: PageSees | undefined } = {}): ((decl: PageBlock) => BlockResult) => {
      const own = pageDeps(opts.viewer, opts.sees);
      const deps: PageDeps = { ...own, ...onceForRead(own), ...(opts.inbox === undefined ? {} : { reader: { hold: (b: BlockResult) => b, inbox: opts.inbox } }) };
      return (decl) => readBlock({ ...deps }, decl);
    },

    /* ── the keychain: what a key opens, never the key ───────────────────── */

    /** Every grant, in the order a person reads them. Sealed bytes never leave through here. */
    grants: (): GrantRow[] => listGrants(sql),
    grant: (id: string): GrantRow | null => getGrant(sql, id),

    /** Mint a grant, or rotate one — which differ by one column and a version number. */
    bindGrant: (args: BindGrantArgs, actor: string): Result<GrantRow> =>
      bindGrant(sql, keychainDeps(actor), args, transaction),

    /** Seal a key into a grant and point a row's secret field at it, in one write. INTERNAL: the keychain door's. */
    depositGrant,

    /**
     * Hand the sealed bytes out, and count the reading.
     *
     * THE KERNEL CANNOT OPEN THEM. It assembles the ciphertext, the wrapped record key and the AAD
     * and hands all three to whoever asked — which is what makes "we cannot read your record" a fact
     * about the code rather than a promise about our intentions.
     */
    openGrant: (args: { id: string; kek_id?: string | undefined }, actor: string): Result<SealedGrant> =>
      openGrant(sql, keychainDeps(actor), args, transaction),

    /**
     * Hand a credential to a runner that is holding a live lease on the job needing it.
     *
     * NOT `openGrant` WITH A DIFFERENT ACTOR. What authorises this is the lease, not a person, and
     * it authorises one credential for as long as the lease lasts. The refusals are in `keychain.ts`.
     */
    sealedGrant: (args: { outbox: string; leasedUntil: string; grant: string }, actor: string): Result<LeasedSeal> =>
      sealedGrant(sql, keychainDeps(actor), args, transaction),

    /** Take a grant out of service and destroy the bytes. The row stays: what it opened is a fact. */
    revokeGrant: (id: string, actor: string): Result<null> => revokeGrant(sql, keychainDeps(actor), id, transaction),

    /* ── keychain access (migration 46): which machine may open which key, asked of the owner when he says so ── */

    /** Every rule set, or one key's (`credential` is its row id). Ids and rules only. */
    keyAccess: (credential?: string): KeyAccessRow[] => keyAccessRows(sql, credential),
    /** Set one key's rule for one machine, its default with `*`, or with `null` take the row away. */
    setKeyAccess: (args: { credential: string; machine: string; rule: KeyRule | null }, actor: string): KeyAccessRow | null =>
      transaction(() => setKeyAccess(sql, keychainDeps(actor), args)),
    /** The asks waiting on the owner, or with `recent` the last week's too. */
    keyAsks: (recent = false): KeyAskRow[] => keyAsks(sql, clock.now(), recent),
    /** The owner's answer to one ask. */
    answerKeyAsk: (args: { id: string; answer: KeyAnswer }, actor: string): Result<KeyAskRow> => answerKeyAsk(sql, keychainDeps(actor), args, transaction),
    /** Whether one machine may open one key now, asking the owner first where the key says so. INTERNAL: `openForGrant`'s. */
    keyGate: (args: { credential: string; machine: string; run: string | null; spoken: string; machineName: string | null }, actor: string): KeyGate =>
      keyGate(sql, keychainDeps(actor), args, transaction),
    /** How many minutes a sign-in opens the keychain for: 5, 15 (the default) or 60. */
    lockAfter: (): LockAfter => lockAfter(sql),
    setLockAfter: (minutes: LockAfter): LockAfter => setLockAfter(sql, clock.now(), minutes),

    /**
     * What a digest would say if it went now. It sends nothing.
     *
     * THE SAME ASSEMBLY THE SCHEDULED ONE USES, and it has to be: a "today" screen computed by a
     * second code path is a screen that disagrees with the email on the day one of them is wrong,
     * and the person reading both has no way to tell which. `sectionsOf` is the one assembly, and
     * this is it without the outbox row on the end.
     */
    digestToday: (id?: string, opts: { sees?: PageSees | undefined } = {}) => {
      const deps = digestDeps(opts.sees);
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
        /* EVERY ROW THIS PERSON HAS, AND NOT THE `'*'` ROW ALONE. A colleague invited to one list has
           member rows for that list and no `'*'` row at all, so the mark landed nowhere and the read
           below found nothing: the People screen then told the owner that colleague had never opened
           the record, however much they had read, and `unreadFrom` answered them the first event the
           record ever held. The column is per person and per register; the mark is about the person,
           so it moves on all of their rows and is read back as the furthest of them. */
        sql.exec(
          `UPDATE member SET seen_at = MAX(COALESCE(seen_at, ''), COALESCE((SELECT ts FROM event WHERE rowid = ?), ''))
            WHERE person_id = ?`,
          upTo,
          person,
        );
      });
      return (
        sql.one<{ seen_at: string | null }>('SELECT MAX(seen_at) AS seen_at FROM member WHERE person_id = ?', person)
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
    eventsBefore: (before: number | null, limit: number): EventLine[] => {
      /* A LINE A RUN SIGNED SAYS WHO THE RUN IS, so History names its agent where it drew "An agent" for every run. */
      const said = runsSaid();
      return sql
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
          ...said(e.actor),
        }));
    },

    /**
     * The first event after this person's read mark, or one past the newest when nothing is after it.
     * `45 §5.3` step 1; a person with no mark has read nothing, so it is the first event there is.
     */
    unreadFrom: (person: string | null): number =>
      Number(
        sql.one<{ v: number }>(
          `SELECT COALESCE(MIN(rowid), (SELECT COALESCE(MAX(rowid), 0) + 1 FROM event)) AS v FROM event
            WHERE ts > COALESCE((SELECT MAX(seen_at) FROM member WHERE person_id = ?), '')`,
          person ?? '',
        )?.v ?? 1,
      ),

    /** Arrivals nothing claimed and nobody has dealt with yet: how many the inbox holds. */
    inboxWaiting: (): number =>
      Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE state IN ('untriaged', 'review', 'proposed')")?.n ?? 0),

    /** What each pattern did with the last `days` days of arrivals, door by door. */
    patternReport: (days = 14): PatternReport => patternReport(sql, clock.now(), days),
    /** "It is a second one": a text skipped as a repeat, filed after all. */
    fileAsSecond: (raw: string): Result<Arrived> => attempt(sql, transaction, () => fileAsSecond(ingestDeps(), raw)),
    /**
     * How many arrivals are in each state the inbox can be read in, every one of the six named and zero when none.
     *
     * ONE GROUPED READ AND NOT SIX. A count per state is what tells a person how much was skipped before they open a
     * single arrival, and a state with no row has to say zero rather than be missing, or a caller reading
     * `counts.skipped` gets `undefined` on the day nothing was skipped.
     */
    inboxCounts: (): Record<InboxState, number> => {
      const counts = Object.fromEntries(INBOX_STATES.map((s) => [s, 0])) as Record<InboxState, number>;
      for (const r of sql.all<{ state: string; n: number }>('SELECT state, COUNT(*) AS n FROM inbox_raw GROUP BY state'))
        if ((INBOX_STATES as readonly string[]).includes(r.state)) counts[r.state as InboxState] = Number(r.n);
      return counts;
    },

    /**
     * The arrivals in `states`, below `before`, newest first: what the record's `inbox` pages through. Left out, the
     * states are the two `inboxWaiting` counts.
     *
     * `rowid` AND NOT `ts`, because a burst arrives inside one millisecond and a cursor on `ts` would drop or repeat the
     * rest of it. Rows are only ever inserted, so the order they were stored in is the order they arrived in, and a
     * cursor stays good across a change of state: the row keeps its rowid when it moves.
     *
     * THE STATES ARE BOUND, NEVER SPLICED. Each is checked against `INBOX_STATES` by the caller and again here, since a
     * word from the wire reaches this list, and only the count of placeholders is written into the text.
     */
    inboxBefore: (
      before: number | null,
      limit: number,
      states: readonly InboxState[] = INBOX_WAITING,
      only: { repeats?: boolean } = {},
    ): InboxLine[] => {
      const asked = states.filter((s) => (INBOX_STATES as readonly string[]).includes(s));
      if (asked.length === 0) return [];
      /* THE REPEATS MARK IS READ IN THE PAGE'S OWN QUERY, never once per arrival: the newest `match` line of a skipped
         arrival, kept only when ingest marked it `repeats`. `repeats: true` pages through those alone, so a page full of
         balance alerts set aside by a rule can no longer push a real second charge out of sight. */
      const mark = `CASE WHEN r.state = 'skipped' THEN (SELECT CASE WHEN e.field = 'repeats' THEN e.from_v END FROM event e
          WHERE e.target = 'inbox_raw:' || r.id AND e.kind = 'match' ORDER BY e.rowid DESC LIMIT 1) END`;
      return sql
        .all<{
          rowid: number;
          id: string;
          ts: string;
          channel: string;
          headers: string | null;
          body: string | null;
          state: string;
          reason: string | null;
          repeats: string | null;
        }>(
          `SELECT * FROM (SELECT r.rowid AS rowid, r.id, r.ts, r.channel, r.headers, r.body, r.state, r.reason, ${mark} AS repeats
             FROM inbox_raw r WHERE r.state IN (${asked.map(() => '?').join(', ')}) AND r.rowid < ?)
           ${only.repeats === true ? 'WHERE repeats IS NOT NULL ' : ''}ORDER BY rowid DESC LIMIT ?`,
          ...asked,
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
            /* The row's own state: the query asked only for the ones `asked` names, so this is one of them. It read
               "review, or else untriaged", which was true only while the inbox could be asked for nothing else. */
            state: r.state as InboxState,
            reason: r.reason,
            ...settlementOf(r.id, r.state),
            ...(typeof r.repeats === 'string' && r.repeats !== '' ? { repeats: r.repeats } : {}),
          };
        });
    },

    /**
     * How many arrivals a rule filed since `since`, an instant: `matched` arrivals that arrived then or later and whose
     * newest `state` event did not put them there, which is what `settledBy` reads as a rule's filing.
     *
     * ONE COUNT, NOT A PAGE READ AND COUNTED BY ITS READER, so the Inbox's "Filed by rules this week" is the record's
     * number and not a sum over the page a screen happened to hold.
     */
    inboxRuledSince: (since: string): number =>
      Number(
        sql.one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM inbox_raw r
            WHERE r.state = 'matched' AND r.ts >= ?
              AND COALESCE((SELECT e.to_v FROM event e WHERE e.target = 'inbox_raw:' || r.id AND e.kind = 'state' ORDER BY e.rowid DESC LIMIT 1), '') <> ?`,
          since,
          written('matched'),
        )?.n ?? 0,
      ),

    /**
     * One arrival's settlement, as `inboxBefore` gives it on its line: who filed or archived it and the row a filing
     * made. `null` when there is no such arrival, when it waits, or when a rule moved it.
     *
     * THE RECORD ASKS IT BEFORE A PUT BACK, so the caller's right to archive the filed row is checked against that row's
     * own list before `returnArrival` archives it.
     */
    arrivalSettlement: (id: string): ArrivalSettlement | null => {
      const raw = sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', id);
      return raw ? (settlementOf(id, raw.state).settled ?? null) : null;
    },

    /**
     * File an arrival as a row: the row goes through the ordinary write path, signed like any write, and the arrival is
     * marked `matched` with a `state` event in the same batch, in one transaction.
     *
     * `matched` AND NOT A NEW STATE. The DDL's seven already say what happened: something claimed the arrival and a row
     * came of it. A person claiming it is told apart from an ingest by the `state` event this writes and the ingest never
     * does (`settledBy`), not by a word the ingest does not use. It said "by the event's actor", which would have needed
     * a list of every mechanism's name to read.
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
        if (raw.state !== 'untriaged' && raw.state !== 'review' && raw.state !== 'proposed')
          return no<ArrivalSettled>('OUT_OF_BOUNDS', `This arrival has already left the inbox, as ${raw.state}. Nothing was written.`, {
            at: 'id',
          });
        const title = registers.get(register)?.title;
        const patch: Patch = fields ?? (title ? { [title]: arrivalTitle(raw.headers, raw.body) } : {});
        const batch = w.batch ?? mint();
        const out = write(register, null, patch, { ...w, batch });
        if (!out.ok) return out as unknown as Result<ArrivalSettled>;
        settleArrival(id, raw.state, 'matched', w.actor, `Filed as ${register}#${out.value.seq ?? ''}.`, batch);
        settleAsked(id, `filing the mail in ${registers.get(register)?.name ?? register}.`, batch);
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
        if (raw.state !== 'untriaged' && raw.state !== 'review' && raw.state !== 'proposed')
          return no<ArrivalSettled>('OUT_OF_BOUNDS', `This arrival has already left the inbox, as ${raw.state}. Nothing was changed.`, {
            at: 'id',
          });
        const batch = mint();
        settleArrival(id, raw.state, 'ignored', actor, 'Archived from the inbox.', batch);
        settleAsked(id, 'setting the mail aside.', batch);
        return ok<ArrivalSettled>({ id, state: 'ignored', entry: null, already: false });
      }),

    /**
     * Take back a person's filing or archiving: the arrival goes back to the state its settling `state` event came
     * `from`, with a `state` event of its own, and a filed arrival's row is archived in the same batch, in one
     * transaction.
     *
     * THE ROW IS ARCHIVED THROUGH `write` WITH `version`, the way the app archives any row (`deleted_at`, compare-and-set).
     * A row somebody edited since the filing answers the kernel's conflict, the 409 with the row as it stands, and
     * nothing moves: the edit was somebody's work, and putting the arrival back would bury it in an archived row. An
     * archived arrival has no row, so `version` is not read.
     *
     * ONLY A PERSON'S SETTLEMENT IS TAKEN BACK, which is the one `settledBy` finds. An ingest's filing writes no `state`
     * event, so it is refused rather than undone: its row came from a rule, and it is edited or archived in its list.
     *
     * AGAIN IS THE SAME ANSWER. An arrival already waiting answers as it is and writes nothing, so a retry whose answer
     * was lost does not write a second event.
     */
    returnArrival: (id: string, version: number, w: WriteContext): Result<ArrivalSettled> =>
      transaction(() => {
        const raw = sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', id);
        if (!raw) return no<ArrivalSettled>('OUT_OF_BOUNDS', 'There is no arrival with that id in this inbox.', { at: 'id' });
        if (raw.state === 'untriaged' || raw.state === 'review') return ok<ArrivalSettled>({ id, state: raw.state, entry: null, already: true });
        if (raw.state === 'proposed') return ok<ArrivalSettled>({ id, state: 'review', entry: null, already: true });
        const settled = settledBy(id, raw.state);
        if (raw.state === 'matched' && !settled)
          return no<ArrivalSettled>(
            'OUT_OF_BOUNDS',
            'A rule filed this arrival, not a person, so there is no filing here to take back. Its row is edited or archived in its list. Nothing was changed.',
            { at: 'id' },
          );
        /* ONE TAKEN FROM `proposed` COMES BACK AS `review`: it waits on a person either way, and its question is asked again. */
        const back = settled?.from === 'proposed' ? 'review' : settled?.from;
        if (!settled || (back !== 'untriaged' && back !== 'review'))
          return no<ArrivalSettled>('OUT_OF_BOUNDS', `This arrival left the inbox as ${raw.state} by a rule, not by a person, so it has nowhere to go back to. Nothing was changed.`, {
            at: 'id',
          });
        const batch = w.batch ?? mint();
        let entry: Entry | null = null;
        if (raw.state === 'matched') {
          const filed = filedAs(id);
          if (!filed)
            return no<ArrivalSettled>('OUT_OF_BOUNDS', 'What this arrival was filed as is no longer here, so the filing cannot be taken back. Nothing was changed.', {
              at: 'id',
            });
          const out = write(filed.register, filed.id, { deleted_at: true }, { ...w, version, batch, note: w.note ?? 'Put back in the inbox.' });
          if (!out.ok) return out as unknown as Result<ArrivalSettled>;
          entry = out.value;
        }
        settleArrival(id, raw.state, back, w.actor, raw.state === 'matched' ? 'Filing taken back; in the inbox again.' : 'Archive taken back; in the inbox again.', batch);
        reaskArrival(settled.batch, id, w.actor, batch);
        return ok<ArrivalSettled>({ id, state: back, entry, already: false });
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
    log(register: string, seq: number, held: WriteContext, note: string): Result<{ id: string }> {
      const found = bySeq(register, seq);
      /* A ROW THE WRITER MAY NOT WRITE IS ONE THAT IS NOT THERE (`WriteContext.within`), in the same words. The rows are
         this list's, so they come off the context before the run that signs the note is found or opened. */
      const { within, ...w } = held;
      if (!found || (within !== undefined && !admits(register, within, found.id)))
        return no<{ id: string }>('OUT_OF_BOUNDS', `There is no ${register} #${seq}.`, { at: 'seq' });
      return transaction(() => {
        const theirs = foreignRun<{ id: string }>(w);
        if (theirs) return theirs;
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

    /**
     * What a person holds here, or `null`: their role and member rows merged with their shares and their groups' shares
     * (`members.ts`'s `access`, the lens). `token` is the id of the key they call through, whose narrowing chain is
     * ANDed into everything. Cached per (person, key, epoch, declaration revision) until the lens's next clock edge.
     */
    access: (person: string, token?: string | null): Held | null => access(sql, person, token ?? null, accessLens()),

    /** The access epoch: the `access` counter, which moves with every change to who holds what. */
    accessEpoch: (): number => epochOf(sql),

    /** Move the access epoch on, for a change to who holds what made outside the methods that move it themselves. */
    accessChanged: (): number => transaction(() => bumpEpoch(sql)),

    /** The record's lists as the lens reads them. */
    catalog: (): Catalog => catalogNow(),

    /**
     * Keep one share, new or changed (its `id`), with its `access.grant` event and the access epoch moved, in one
     * transaction. The record has checked it (`checkShare`, who may target whom); this refuses only
     * a share that is not the grammar, or a change to one that is not live.
     */
    shareSave: (by: string, input: ShareInput): Result<{ id: string; version: number }> =>
      transaction(() => {
        const out = putShare({ sql, at: instant(clock.now()), mint }, by, input);
        return 'fault' in out ? no<{ id: string; version: number }>('REF_UNKNOWN', out.fault, { at: 'id' }) : ok(out);
      }),

    /** End one share and every share made onward from it, each with its `access.revoke`, the epoch moved once. The ids ended. */
    shareRevoke: (by: string, id: string, why?: string | null): string[] => transaction(() => revokeShare({ sql, at: instant(clock.now()), mint }, by, id, why ?? null)),

    /** One kept share by id, ended or not. */
    shareKept: (id: string): ShareKept | null => shareKept(sql, id),

    /** Every live share, newest first, and those ended since `since` when it is given. */
    sharesKept: (since?: string): ShareKept[] => sharesKept(sql, since),

    /** The live shares waiting for an address until its person accepts an invitation (slice 8), oldest first. */
    sharesWaiting: (email: string): ShareKept[] => sharesWaiting(sql, email),

    /** One group by id, retired or not, with its people and how many live shares it holds. */
    groupKept: (id: string): GroupKept | null => groupKept(sql, id),
    /** The live shares a group holds, oldest first. */
    groupShares: (id: string): ShareKept[] => groupSharesOf(sql, id),

    /** Make a group, or rename one (`id`). A group holds nothing until a share names it. */
    groupSave: (by: string, args: { id?: string; name: string }): Result<{ id: string }> =>
      transaction(() => {
        const out = putGroup({ sql, at: instant(clock.now()), mint }, by, args);
        return 'fault' in out ? no<{ id: string }>('REF_UNKNOWN', out.fault, { at: 'id' }) : ok(out);
      }),

    /** Retire a group: every share it holds ends, each with its `access.revoke`. The ids ended. */
    groupRetire: (by: string, id: string, why?: string | null): string[] => transaction(() => retireGroup({ sql, at: instant(clock.now()), mint }, by, id, why ?? null)),

    /**
     * Put somebody in a group or take them out, with one `access.grant` or `access.revoke` per share the group holds,
     * the epoch moved. The ids of the shares said, or `null` when nothing changed.
     */
    groupMember: (by: string, group: string, person: string, on: boolean): string[] | null =>
      transaction(() => setGroupMember({ sql, at: instant(clock.now()), mint }, by, group, person, on)),

    /** The gate fields of one list (§2.6): what any active share condition names, and its scope field under a project share. */
    gateFields: (list: string): string[] => gateFieldsOf(sql, catalogNow(), list, clock.now(), recordTz()),

    /**
     * THE AUDIT. `shareVia`: which of a person's live shares admit one row (or, `id` null, reach a
     * list) for one capability. `accessSeen`: one read by somebody who is not an owner, counted on today's row for what
     * they read and through which shares. `accessNight`: the night's pass, the old counters pruned and each share whose
     * date passed said once in the ledger.
     */
    shareVia: (person: string, register: string, id: string | null, cap: LensCapOf = 'read', agent = false): string[] => shareVia(person, register, id, cap, agent),
    accessSeen: (who: string, via: readonly string[], what: string): void => {
      const nowMs = clock.now();
      const day = dayIn(nowMs, recordTz());
      sql.exec(
        `INSERT INTO access_seen (day, who, via, what, n, last_at) VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT (day, who, via, what) DO UPDATE SET n = n + 1, last_at = excluded.last_at`,
        day,
        who,
        JSON.stringify([...via].sort()),
        what,
        instant(nowMs),
      );
    },
    accessNight: (): { pruned: number; ended: string[] } => transaction(() => accessNight(sql, clock.now(), mint)),

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
      args: {
        person: string;
        email?: string;
        name?: string;
        level?: MemberLevel;
        registers?: Record<string, MemberLevel>;
        wheres?: Wheres;
        why?: string;
      },
    ): Result<Member> => transaction(() => moved(invite(memberDeps(), by, args))),

    /** Take somebody off. Never the last owner, and their person row stays. */
    /** Stop somebody without deciding about them, or start them again. */
    suspendMember: (by: string, person: string, on: boolean, why?: string): Result<Suspended> =>
      transaction(() => moved(suspend(memberDeps(), by, person, on, why))),

    /**
     * An account stopped by the operator or closed by its person, carried into this record, and whether anything moved.
     * INTERNAL: the host's RPC, never a route, and it answers the epoch bust `moved` gives any change of who holds what.
     */
    accountStop: (person: string, stamp: string, on: boolean, closing: boolean): Result<boolean> =>
      transaction(() => moved(ok(accountStop(memberDeps(), person, stamp, on, closing)))),

    /** Whether this person is on the record and an owner has stopped them: which sentence a door turns them away with. */
    memberStopped: (person: string): boolean => stoppedOf(sql, person),

    /**
     * Whether this person's access here ended: they hold nothing now, and the record knew them, as a
     * member taken off or a guest whose last share ended. The owner's name rides with it, so a door can say "Ask Ada if
     * you need it back". `null` for anybody who still holds something, or whom the record never knew: a door says its
     * own words to them. A stopped member is the door's to ask first (`memberStopped`).
     */
    accessEnded: (person: string): { owner: string | null } | null => {
      const known =
        sql.one('SELECT 1 AS y FROM person WHERE id = ?', person) !== undefined ||
        sql.one("SELECT 1 AS y FROM share WHERE who_kind = 'person' AND who = ? LIMIT 1", person) !== undefined;
      if (!known) return null;
      if (access(sql, person, null, accessLens()) !== null) return null;
      const owner = sql.one<{ name: string | null; email: string | null }>(
        "SELECT p.name, p.email FROM member m JOIN person p ON p.id = m.person_id WHERE m.level = 'owner' AND m.register = '*' ORDER BY m.person_id LIMIT 1",
      );
      return { owner: owner?.name ?? owner?.email ?? null };
    },

    removeMember: (by: string, person: string, why?: string): Result<null> => transaction(() => moved(remove(memberDeps(), by, person, why))),

    /**
     * HAND THE RECORD OVER (collab pass, 2 Nov): `to` becomes an owner and `by` steps down to `decide`, in ONE transaction,
     * so there is never a moment with no owner and never one where the hand-over half happened. Each half is the same
     * `invite` a level change is, so each writes its own `access.grant` or `access.revoke` with `why`. The record's method
     * checks who may ask; this checks only that `to` is somebody else already on the record and not stopped.
     */
    handOver: (by: string, to: string, why?: string): Result<Member> =>
      transaction(() => {
        if (to === by) return no<Member>('VALUE_MALFORMED', 'You already own it. Pick somebody else.', { at: 'person' });
        const on = sql.one<{ suspended_at: string | null }>('SELECT p.suspended_at FROM member m JOIN person p ON p.id = m.person_id WHERE m.person_id = ? LIMIT 1', to);
        if (on === undefined) return no<Member>('REF_UNKNOWN', 'Only somebody already on this BrainDog can be given it. Invite them first.', { at: 'person' });
        if (on.suspended_at !== null) return no<Member>('FORBIDDEN', 'They are stopped. Let them back in first.', { at: 'person' });
        const raised = invite(memberDeps(), by, { person: to, level: 'owner', ...(why === undefined ? {} : { why }) });
        if (!raised.ok) return raised;
        const lowered = invite(memberDeps(), by, { person: by, level: 'decide', ...(why === undefined ? {} : { why }) });
        if (!lowered.ok) throw new Error('refusal' in lowered ? lowered.refusal.fix : 'The hand-over could not step you down.');
        return moved(raised);
      }),

    /* ── agent tokens ───────────────────────────────────── */

    /** Mint one. The secret exists once, in the answer, and is stored nowhere. */
    createToken: (person: string, args: CreateTokenArgs): Promise<Result<Minted>> =>
      Promise.resolve(tokenDeps()).then((deps) => transaction(() => createToken(deps, person, args))),

    /** Every token, with a revoke button's worth of information and nothing a hash needs. */
    listTokens: (validFrom?: string): TokenRow[] => listTokens(sql, validFrom),

    /** Revoke one, idempotently. */
    revokeToken: (person: string, id: string): Result<TokenRow> => transaction(() => revokeToken(tokenDeps(), person, id)),

    /**
     * A bearer, checked. The one way a token is recognised, and there is no other. `build` is what the command behind it
     * said it was (`x-braindog-cli`), kept on the key in the same statement as its use; a value that is not a
     * build is dropped there.
     */
    verifyToken: (bearer: string, surface?: string, validFrom?: string, build?: string): Promise<Result<Verified>> =>
      verifyToken({ ...tokenDeps(), validFrom }, bearer, surface, build),

    /**
     * A short key under a working one, proved by the parent's bearer (`mintChild` in `token.ts`). HOST-ONLY: the record's
     * own `mintChild` is its one caller, and no route reaches either. `validFrom` is the host's cut-off, as for a verify.
     */
    mintChild: (bearer: string, args: ChildArgs, validFrom?: string): Promise<Result<Minted>> =>
      Promise.resolve({ ...tokenDeps(), validFrom }).then((deps) => transaction(() => mintChild(deps, bearer, args))),

    /** A session on this key called a tool: its `last_tool_at` moves to now, with no event. */
    noteTool: (tokenId: string): void => noteTool(sql, tokenId, instant(clock.now())),

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
    acceptInvitation: async (token: string, person: { person: string; email: string; name?: string; operator?: true }): Promise<Result<InviteAccepted>> => {
      const hash = await inviteHash(token);
      if (hash === null) return no<InviteAccepted>('UNAUTHORIZED', INVITE_GONE, { at: 'token' });
      return attempt(sql, transaction, () => acceptInvitation({ ...memberDeps(), recordId: () => recordIdentity(sql)?.id ?? null }, hash, person));
    },

    /* ── device grants, 12 §6.1 ───────────────────────────── */

    /** A device asks for a code. INTERNAL: the host calls it from `/auth/device`, limited per address. */
    deviceStart: (args: { reach: string; label: string; ua?: string; scope?: string; binds?: string }): Promise<Result<DeviceCode>> =>
      deviceStart(tokenDeps(), args),

    /** The owner types the six digits: what is asking, and nothing approved. A wrong code costs every pending request a try. */
    deviceLook: (args: { user_code: string }, held?: (reach: DeviceReach) => Refusal | null): Promise<Result<Looked>> => deviceLook(tokenDeps(), args, held),

    /** The owner presses Approve on what `deviceLook` showed them. */
    deviceApprove: (person: string, args: { user_code: string; handle?: string }, held?: (reach: DeviceReach) => Refusal | null): Promise<Result<Approved>> =>
      deviceApprove(tokenDeps(), person, args, held),

    /** The device asks again, and after approval gets its bearer once. INTERNAL. */
    devicePoll: (args: { device_code: string }, validFrom?: string): Promise<Result<Waiting | Exchanged>> => devicePoll({ ...tokenDeps(), validFrom }, args),

    /** Every grant by its handle, never by the id a device polls with. */
    deviceList: (validFrom?: string): Promise<DeviceRow[]> => deviceList({ ...tokenDeps(), validFrom }),

    /** Revoke one; a login grant takes its token with it. */
    deviceRevoke: (person: string, handle: string): Promise<Result<DeviceRow>> => deviceRevoke(tokenDeps(), person, handle),

    /** Rename one machine by its handle: its sign-in and its key read the new name. */
    renameDevice: (handle: string, label: string): Promise<Result<DeviceRow>> => renameDevice(tokenDeps(), handle, label),

    /** A keychain bearer, checked. INTERNAL. */
    keychainGrant: (bearer: string, validFrom?: string): Promise<Result<KeychainGrant>> => keychainGrant({ ...tokenDeps(), validFrom }, bearer),
    /** A shape bearer, checked and not spent: who approved it and until when. INTERNAL. */
    shapeGrant: (bearer: string, validFrom?: string): Promise<Result<ShapeGrant>> => shapeGrant({ ...tokenDeps(), validFrom }, bearer),

    /** An operation bearer, checked and spent: the one ADMIN method it opens and who approved it. INTERNAL. */
    operationGrant: (bearer: string, validFrom?: string): Promise<Result<OperationGrant>> => operationGrant({ ...tokenDeps(), validFrom }, bearer),

    /* ── the decision gate ─────────────────────────────────── */

    /**
     * The governance rows, read like a register.
     *
     * THE RECORD OPENS SUGGESTIONS FROM THREE PLACES and until this existed nothing could read one.
     * A proposal nobody can see is a proposal that was never made.
     */
    governance: (register: GovernRegister, opts: { status?: string; limit?: number; every?: boolean; cursor?: string; order?: 'wait'; review?: 'only'; apart?: 'only' | 'with'; weigh?: false } = {}) =>
      listGovernance({ sql, nowMs: clock.now() }, register, opts),

    /** How many rows a governance register holds, all of them. */
    governanceCount: (register: GovernRegister) => countGovernance(sql, register),

    /**
     * Every open suggestion, uncapped, for a count or a list the record filters to its caller before it trims. Agents'
     * suggestions on their shelf are left out, as they are out of Needs you; `apart: 'with'` reads them too, for a
     * reader that means every question still open (who asked what, what an agent may take back).
     */
    openSuggestions: (opts: { apart?: 'with' } = {}) => listGovernance({ sql, nowMs: clock.now() }, 'suggestion', { status: 'open', every: true, ...opts }),

    /** One governance row, or `null` — a missing one is a value, not a refusal. */
    governanceRow: (register: GovernRegister, id: string) => getGovernance(sql, register, id),
    /* WHO DECIDES A QUESTION (`govern.ts`): an owner hands one to a person, or takes it back; `deciderFault` says why a
       caller may not decide one handed to somebody else. */
    handQuestion: (id: string, to: string | null, by: string) => transaction(() => handQuestionIn(governDeps(), id, to, by)),
    deciderOf: (id: string) => deciderOfIn(sql, id),
    /* WHERE A PRESS CAME FROM (`govern.ts` `answeredIn`): the app a card was pressed in, kept on the decision it made. */
    answeredIn: (decision: string, app: string, by: string, batch?: string) => transaction(() => answeredInIn(governDeps(), decision, app, by, batch)),
    answeredInOf: (decision: string) => answeredInOf(sql, decision),
    /** Whether this person filed this question, or a key of theirs did (`filedBy` in `govern.ts`). */
    filedBy: (opener: string, person: string): boolean => filedByIn(sql, opener, person),
    deciderFault: (id: string, actor: string, isOwner: boolean, nameOf?: (person: string) => string) => deciderFaultIn(sql, id, actor, isOwner, nameOf),

    /**
     * Open a suggestion. The body is checked here, so the person answering it never finds it broken.
     *
     * A TOKEN'S PROPOSAL IS SIGNED BY ITS RUN, as its writes are, and the run is found only once the
     * body has passed, so a refused proposal opens none. A bare name signs as itself. `drafted` is who drafted it,
     * Slash's rules or a model, kept on `suggestion.drafted_by`. A run's first question names the run while the
     * record's own name still stands (`nameRunBy`).
     *
     * `cause` RIDES THROUGH IN THE BODY TO govern, which derives one when none is given: a question whose cause
     * is already open answers its id with `joined` and files nothing, so asked twice is asked once.
     */
    propose: (p: Proposal & { title?: string }, w: WriteContext | string, drafted?: string): Result<Filed> =>
      transaction(() => {
        const theirs = typeof w === 'string' ? null : foreignRun<{ id: string }>(w);
        if (theirs) return theirs;
        /* THE TITLE IS THE RUN'S, NOT THE QUESTION'S: taken off before the body is checked, and kept nowhere else. */
        const { title, ...given } = p;
        /* A QUESTION IS WRITTEN WITH NAMES: an agent's ids are turned into the rows' names as it is filed. */
        const asked = typeof given.question === 'string' ? { ...given, question: nameSpoken(given.question) } : given;
        /* A ROW THE BODY NAMES THAT THE PROPOSER MAY NOT SEE IS ONE THAT IS NOT THERE (`WriteContext.sees`), in the words
           a missing one gets. Only at filing: the person who accepts it reads the record whole. */
        const sees = typeof w === 'string' ? undefined : w.sees;
        const base = governDeps();
        const deps: GovernDeps = sees === undefined ? base : { ...base, row: (register, at) => { const row = base.row(register, at); return row && sees(register, row.id) ? row : null; } };
        let signer = '';
        const out = openSuggestion(deps, () => (signer = signedBy(typeof w === 'string' ? { actor: w } : w)), asked, drafted);
        /* THE KEY THAT ASKED, WHERE ITS RUN DOES NOT SAY IT (RM1). A run no key opened is the one a person or an automation
           made, and any key it is shared with signs as it, so the run alone never says who asked. The calling key is kept
           as `drafted_by: token:<id>`, which `askedBy` reads before the run, and which no screen says. */
        const key = typeof w === 'string' || w.principal?.kind !== 'token' ? undefined : w.principal.token;
        if (out.ok && !out.value.joined && drafted === undefined && key !== undefined && isRunName(signer) && tokenOfRun(sql, signer) === null)
          sql.exec('UPDATE suggestion SET drafted_by = ? WHERE id = ? AND drafted_by IS NULL', `${ASKED_KEY}${key}`, out.value.id);
        /* A JOINING RUN IS NOT TITLED after somebody else's question. */
        if (out.ok && !out.value.joined && out.value.answered === undefined) {
          nameRunBy(out.value.id, typeof w === 'string' ? { actor: w } : w, typeof title === 'string' ? title : undefined);
          /* AND A RUN'S NEW QUESTION TELLS THE PERSON, once (`tellAsked`). Joined or answered from memory, nothing new was asked. */
          if (!out.value.handled) tellAsked(out.value.id);
        }
        return out;
      }),

    /** A suggestion's question, which is its `suggest` event and no column: what a person reads it by. */
    question: (id: string): string | null => {
      const said = questionOf(sql, id);
      return said === null ? null : nameSpoken(said);
    },

    /** A sentence with its spoken ids said as names, for a surface that draws a record sentence. */
    nameSpoken,

    /**
     * WHAT THE DECISION CARD SAYS BESIDE ONE SUGGESTION, open or answered: the facts a page's queue puts on its question
     * (`cardFacts`), so `/decide/<id>` and an agent's `propose` say what the queue's card says from the one reading of
     * them, and not from a copy kept beside it. `null` when there is no such suggestion.
     *
     * THE RUN AND THE CHANGES ONLY TO A READER OF EVERY LIST. `reader.everyList` is the caller's word for whether this
     * reader may read every list, which only the record knows; absent, it reads as the record's own reading, as the queue
     * is drawn. Money, who drafted it and its kinds go to anybody the question reaches, since its body and stamp say them.
     */
    queueQuestion: (id: string, reader?: QuestionReader): QuestionFacts | null => {
      const r = sql.one<Record<string, unknown>>('SELECT id, body_kind, body, opened_by, drafted_by, kind FROM suggestion WHERE id = ?', id);
      return r ? cardFacts(r, String(r.body_kind ?? ''), parsedBody(r.body), reader?.everyList ?? true) : null;
    },

    /**
     * Answer one.
     *
     * THE CHANGE AND THE DECISION ARE ONE TRANSACTION, so "undo this decision" is one query. A
     * `pattern` or a `change` comes back with the declaration to install, because installing is
     * asynchronous and a decision that resolved before its change landed would be a lie.
     */
    decide: (id: string, verdict: Verdict, actor: string): Result<Decided> => decideOne(id, verdict, actor),

    /**
     * Answer several the same way in one transaction and one batch, so one Undo puts every one back. Each is
     * its own savepoint: a member the gate refuses writes nothing and the rest stay written. Answers each id in order.
     */
    decideMany: (ids: readonly string[], verdict: Verdict, actor: string): { batch: string; each: { id: string; out: Result<Decided> }[] } =>
      transaction(() => {
        const batch = mint();
        return { batch, each: ids.map((id) => ({ id, out: decideOne(id, verdict, actor, batch) })) };
      }),

    /**
     * THE OWNER HELD TWICE, asked about now: "Are Kas and Karim Assaf both you?" (`people.ts` `askOwnRows`). For a
     * caller that has just marked his row by a write of its own and met nobody, such as the record's `markOwnRow` and a
     * sign-up; a mark accepted on Decide asks it already. Answers the question it opened or joined, or `null`.
     */
    askOwnRows: (actor: string = 'system'): Result<string | null> =>
      attempt(sql, transaction, () => askOwnRows(peopleDeps({ actor }, () => null, (p) => openSuggestion(governDeps(), actor, p)))),

    /**
     * SOMEBODY SAYS THESE PEOPLE MAY BE ONE, asked about now (`people.ts` `askSame`): the cluster question for exactly
     * the rows picked, signed as the caller. Nothing is merged. Answers the question and whether this call opened it or
     * added to it, or `null` when nothing could be asked. For the record's `sameOne`.
     */
    askSame: (w: WriteContext, args: { rows: readonly string[] }): Result<{ id: string; asked: boolean } | null> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const as: WriteContext = {
        actor: w.actor,
        ...(w.principal === undefined ? {} : { principal: w.principal }),
        ...(w.session === undefined ? {} : { session: w.session }),
      };
      const theirs = foreignRun<{ id: string; asked: boolean } | null>(as);
      if (theirs) return theirs;
      return attempt(sql, transaction, () => askSame(peopleDeps(as, () => null, (p) => openSuggestion(governDeps(), () => signedBy(as), p)), args.rows));
    },

    /** Put one back in the queue, for the change the gate accepted and could not land. */
    reopen: (id: string, why?: string, asked?: Record<string, unknown>): Result<null> => transaction(() => reopen(governDeps(), id, why, asked)),

    /** Keep what an accepted arrangement did on its decision, so a reload and every other reader see it. */
    keepApplied: (decision: string, applied: Record<string, unknown>, actor: string): Result<null> =>
      transaction(() => keepApplied(governDeps(), decision, applied, actor)),

    /**
     * Someone or some organisation met in the work: resolved by any key it carries (`entity_key`), added when it
     * carries one nobody holds, kept as a mention when it is only a name, folded by the strong rules or asked about once,
     * and linked to the project of the caller's run (`people.ts`). One transaction, so a refusal anywhere writes nothing,
     * a run included.
     * The caller's `version` and `opId` are not carried, because they describe no row meet writes.
     */
    /**
     * Ring one colleague's phones about something that is theirs (`tellColleague`): a comment naming them, somebody
     * joining from their invitation. Content-free, held by their own settings and the record's quiet hours. Never fails.
     */
    tellColleague: (person: string, said: { by: string; cause: string; open: string; about?: string }): void => tellColleague(person, said),

    meet: (args: MeetArgs, w: WriteContext, o: { viewer?: string | null | undefined } = {}): Result<Met> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const as: WriteContext = {
        actor: w.actor,
        ...(w.principal === undefined ? {} : { principal: w.principal }),
        ...(w.session === undefined ? {} : { session: w.session }),
      };
      /* A KEY MEETS SOMEBODY AS ITS OWN RUN, never as one another key opened, as its writes and notes do (`foreignRun`). */
      const theirs = foreignRun<Met>(as);
      if (theirs) return theirs;
      /* THE LISTS DECLARING meets: AND org:, or `people` and `organisations` on a record older than the keys (`roles.ts`). */
      return attempt(sql, transaction, () => {
        /* ONLY A PERSON AT THEIR OWN KEYBOARD IS BELIEVED whatever the source says; a token or the system is read by it.
           A TOKEN IS NEVER `typed`: not as `kind: 'token'`, and not as a person's principal that carries a token, which
           is an agent writing for that person and so as untrusted as any other agent's word. */
        const met = meetPerson(
          {
            ...peopleDeps(
              as,
              () => (as.principal?.kind === 'token' ? (locateRun(as).project?.id ?? null) : null),
              (p) => openSuggestion(governDeps(), () => signedBy(as), p),
            ),
            typed: as.principal?.kind === 'person' && as.principal.token === undefined,
            /* A ROW KEPT PRIVATE FROM WHOEVER IS MEETING IS NOT THERE FOR THE MEETING (`PeopleDeps.hidden`): the viewer
               the record names (`o.viewer`), else the person the write is by, a run read as the person whose key opened
               it. A rule, an import or the system is nobody and meets every row, as before. `null` says nobody: the person
               meeting themself, on an invitation or at onboarding, is met wherever they are kept (audit 31k, RK3). */
            hidden: ((viewer) => (viewer === null ? undefined : (id: string) => hiddenFrom(id, viewer)))(o.viewer === null ? null : (o.viewer ?? personOf(sql, as.actor))),
            /* AN AGENT'S WORD IS CAPPED AT A COMMIT'S, whatever its source says (`people.ts` `trustOf`). */
            token: as.principal?.kind === 'token' || as.principal?.token !== undefined,
            remote: () => as.session?.remote ?? null,
          },
          args,
        );
        /* A STRONG MERGE KEEPS WHAT THE TWO DISAGREED ON too, in its own batch, so Undo takes it back with the rest. */
        if (!met.ok || met.value.undo === undefined) return met;
        const carried = carryFolds(met.value.undo, as);
        return carried.ok ? met : (carried as Result<never>);
      });
    },

    /**
     * One card of the owner's own address book (`people.ts` `meetContact`): folded into his own person, filled in on
     * somebody kept, added only when they are of use, or left out with nothing kept. For the record's own sync of his
     * account; the record refuses anybody else. Written as `w`, as one transaction, a strong fold's disagreements kept.
     */
    meetContact: (args: ContactArgs, w: WriteContext): Result<ContactMet> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const as: WriteContext = { actor: w.actor, ...(w.principal === undefined ? {} : { principal: w.principal }) };
      return attempt(sql, transaction, () => {
        const met = meetCard(peopleDeps(as, () => null, (p) => openSuggestion(governDeps(), () => signedBy(as), p)), args);
        if (!met.ok || met.value.undo === undefined) return met;
        const carried = carryFolds(met.value.undo, as);
        return carried.ok ? met : (carried as Result<never>);
      });
    },

    /**
     * Undo a merge: the batch a merge was written in, or a row that was folded into another. Every line of that batch is
     * put back where nothing has changed it since: the folded row restored and unfolded (it takes its own keys back),
     * the kept row's carried fields emptied again, and every link that moved pointed back. One transaction; a refusal
     * anywhere puts nothing back. A field changed after the merge is left as it now is.
     */
    undoMerge: (ref: string, w: WriteContext): Result<{ restored: string[] }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return attempt(sql, transaction, () => undoMerge(ref, { actor: w.actor }));
    },

    /**
     * Whether `batch` is a fold the record made by itself (`undo-fold.ts`): it folded a row and holds no decision. Such a
     * batch is put back by `undoMerge`; one somebody said yes to is put back by undoing the decision.
     */
    isFold: (batch: string): boolean => foldMade(foldDeps(), batch),

    /**
     * What `undoMerge(batch)` would do, in names, with the fingerprint to hand back, and nothing written. `null` when
     * the batch folded nobody. Read from the batch's own lines, never by running the undo.
     */
    foldPlan: (batch: string): FoldPlan | null => planFold(foldDeps(), batch),

    /**
     * The rows of `register` here twice, by what its `same:` says makes two of them one (`same.ts`): each group's
     * key, the row its `keep` keeps and the others, by row id. Empty for a list that declares no `same:`. Reads only.
     */
    sameClashes: (register: string): SameGroup[] => {
      const decl = registers.get(register);
      return decl === undefined ? [] : clashes(sql, decl);
    },

    /**
     * For every group of `sameClashes`, the writes that would fold it: every link of every list moved to the row kept,
     * then each other finished with "Folded into <title>", or deleted on a list with no finished state. Writes nothing:
     * a person's press files it as one question, and the owner's accept writes it.
     */
    sameFoldPlan: (register: string): FoldGroup[] => {
      const decl = registers.get(register);
      return decl === undefined ? [] : sameFoldPlan(sql, decl, registers.values());
    },

    /** Every identity key again, from the rows: what an import runs, and a repair. */
    rebuildKeys: (): number => transaction(() => rebuildKeys(sql, instant(clock.now()))),

    /**
     * The list `meet` writes and the field playing each part, or `null` when there is none.
     *
     * FOR THE RECORD, whose `meet` guard asks here instead of repeating the kernel's rule for which list that is
     * (`packages/record/src/index.ts`). Only its members' names gate, `namesFor`, still names `people`.
     */
    meetsList: (): { register: string; fields: MeetsFields } | null => {
      const role = meetsRole(registers.values());
      return role === null ? null : { register: role.register, fields: role.fields };
    },

    /** The list `meet` writes organisations into (`org:`, or `organisations` by name), or `null`: the record's guard for `kind: organisation`. */
    orgsList: (): { register: string; fields: OrgFields } | null => {
      const role = orgRole(registers.values());
      return role === null || role.register === meetsRole(registers.values())?.register ? null : { register: role.register, fields: role.fields };
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
      const made = createRecord(sql, clock.now(), FORMAT_VERSION, args, transaction, mint);
      /* THE SIGNS' NIGHT WAS ARMED AS THE KERNEL OPENED, before this record had a zone, so a new record's first night
         was due at 00:05 UTC. Moved to the record's own night now that it has one, while it still waits. */
      if (made.ok)
        sql.exec(
          "UPDATE schedule SET due_at = ? WHERE kind = 'snapshot' AND key = ? AND state = 'pending'",
          instant(nextSignsDue(clock.now(), recordTz())),
          SIGNS_KEY,
        );
      return made;
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

    /** Whether a job of these kinds waits `pending`, leasing nothing: the host tests a silent model only when one does. */
    outboxWaiting: (kinds: readonly OutboxKind[]): boolean =>
      sql.one("SELECT 1 AS x FROM outbox WHERE state = 'pending' AND kind IN (SELECT value FROM json_each(?)) LIMIT 1", JSON.stringify(kinds)) !== undefined,

    /**
     * Finish one. `failed` walks the ladder; the eighth failure is `dead` and raises a fault for its kind, never a
     * question, and a `done` clears that kind's fault.
     *
     * AND A PUSH'S ANSWER GOES BACK TO ITS SUBSCRIPTION, IN THE SAME TRANSACTION. `51 §5`: a 404 or 410 means the browser
     * threw the subscription away, and the deliverer acks that as `done` with `{ gone: true }`, so the row is deleted and
     * no later push is sent to it; any other `done` marks the row used. Read before `ack` and applied only once it
     * answered `ok`, so an ack refused by the fence (a lease that is over) deletes nothing: a stale host's 410 is about
     * a delivery the record no longer counts. Here and not in `outbox.ts`, which is the queue and knows no table but its
     * own, for the reason `AckDeps` hands `propose` in.
     */
    ackOutbox: (args: Ack) =>
      transaction(() => {
        const push =
          args.state === 'done'
            ? sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE id = ? AND kind = 'notify.push' AND state = 'leased'", args.id)
            : undefined;
        /* AND A MODEL'S ANSWER ABOUT WHO MAY BE ONE PERSON, filed as questions once the ack has passed the fence, so a
           stale lease files nothing (`fileVerdicts`). A model only ever proposes: nothing is merged on its word. A pair
           of organisations or projects files nothing here: its verdict stays in the done job, where `pairsFor` reads
           it. */
        const resolving =
          args.state === 'done'
            ? sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE id = ? AND kind = 'infer.resolve' AND state = 'leased'", args.id)
            : undefined;
        const out = ack(sql, ackDeps(), args);
        if (out.ok && resolving) {
          /* AND A PAIR THE ANSWER LEFT OUT IS ASKED AGAIN ANOTHER NIGHT: the done job keeps only the pairs it was told about.
             FIRST, because the job is done whatever its answer was, as an embedding's is (`outbox.ts`): an answer with no
             verdicts, or none at all, spoke of no pair, and filed after a refusal it left every pair spent unasked. */
          sql.exec('UPDATE outbox SET payload = ? WHERE id = ?', answeredOnly(resolving.payload, args.result), args.id);
          if (args.result !== undefined) {
            const filed = fileVerdicts(peopleDeps({ actor: 'slash' }, () => null, (p) => openSuggestion(governDeps(), 'slash', p, 'slash')), resolving.payload, args.result);
            if (!filed.ok) return filed as Result<never>;
          }
        }
        const sub = out.ok && push ? pushSubOf(push.payload) : null;
        if (sub !== null) {
          const gone = (args.result as { gone?: unknown } | undefined)?.gone === true;
          settlePush(sql, gone ? { gone: [sub] } : { sent: [sub] }, instant(clock.now()));
        }
        return out;
      }),

    /**
     * The address a leased `notify.push` rings, or `null` when its person has since unsubscribed. `push.ts` holds the
     * three lease checks, which are `sealedGrant`'s, and the reason the caller names no subscription.
     */
    pushTarget: (args: { outbox: string; leasedUntil: string }): Result<PushTarget | null> => leasedPushTarget(sql, clock.now(), args),

    /**
     * What a push service said, by subscription id: `sent` marks rows used and `gone` deletes them. `ackOutbox` does this
     * for a host that acks through it; this is the same write for one that learns the answer some other way.
     */
    settlePush: (settled: PushSettled) => transaction(() => settlePush(sql, settled, instant(clock.now()))),

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
     * The id of the key this record's keychain is wrapped by, or `null` when it has no keychain.
     *
     * IT IS NOT THE KEY. `kek_id` is a fingerprint — 12 §6 — and naming it proves nothing except
     * that you know which key you are asking about, which is exactly the bar an export carrying the
     * sealed bytes should clear: a caller holding that key can open them one at a time already, and
     * a caller who is not holding it gains nothing from a file full of ciphertext.
     *
     * A KEY BEHIND A PASSPHRASE NAMES NO ROOT KEY, so it is passed over for the ones that do: otherwise a record whose
     * `record` row came first would read as naming none.
     */
    wrappingKey(): string | null {
      return sql.one<{ kek_id: string | null }>('SELECT kek_id FROM vault_key WHERE kek_id IS NOT NULL ORDER BY purpose LIMIT 1')?.kek_id ?? null;
    },

    /**
     * The connector key as the record keeps it, wrapped, for a host that seals a scheduled connection's own credential
     * under it (`apps/worker/src/google-connect.ts`). Read only, and `null` for a record that has none or whose connector
     * key is not wrapped by a root key. The record never opens it; only the host, which holds the root key, can.
     */
    connectorWrapping(): { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string } | null {
      const row = sql.one<{ wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: string; kek_id: string | null }>(
        "SELECT wrapped, nonce, wrapped_by, kek_id FROM vault_key WHERE purpose = 'connector'",
      );
      if (!row || row.wrapped_by !== 'kek' || !row.kek_id) return null;
      return { wrapped: row.wrapped, nonce: row.nonce, kek_id: row.kek_id };
    },

    export(opts: { sections?: readonly Section[]; redactGrants?: boolean; actor?: string } = {}) {
      const refused = schemaRefusal(state);
      if (refused) return Promise.resolve(refused as Result<string[]>);

      /* AN EXPORT IS AN EVENT, and 45 §5.6 says so. `openGrant` writes `grant.read` for ONE
         credential; `export` copies every one of them and wrote nothing at all — so the one read
         that gets the most out was the one read that could not answer "did anything leave". 12 §6's
         first rule is that a keychain whose reads are not audited cannot answer that question. */
      exportEvent(opts);
      return exportBrainl(sql, transaction, opts)
        .then((lines) => (signer ? signBrainl(lines, signer) : lines))
        .then((lines) => ok(lines));
    },

    /**
     * The same file as `export`, with the same event, read a piece at a time (`streamBrainl`): a copy of a record too
     * large to hold whole, or to hand anywhere as one value, is made from this.
     */
    exportStream(opts: { sections?: readonly Section[]; redactGrants?: boolean; actor?: string } = {}): Promise<Result<StreamedBrainl>> {
      const refused = schemaRefusal(state);
      if (refused) return Promise.resolve(refused as Result<StreamedBrainl>);
      exportEvent(opts);
      return streamBrainl(sql, transaction, { ...opts, sign: signer }).then((file) => ok(file));
    },

    /**
     * A file into an empty record, then the index rebuilt from the rows it now holds.
     *
     * The rebuild is here rather than in the import because it depends on the DECLARATIONS the file
     * just brought — a search index built before them would index nothing and look like it worked.
     *
     * OR, WITH `replace`, THE FILE OVER THE RECORD IT WAS TAKEN FROM.
     *
     * A RECORD `createRecord` MADE IS NEVER EMPTY. It holds two schedule rows, its owner's person and member rows and the
     * `create` event before anybody writes, so a copy of a record could not be put back into that record at all: measured,
     * `IMPORT_NOT_EMPTY` "already holds 2 schedule, 1 person, 1 event, 1 member, 3 vault_key". The Cloud cannot restore
     * into a new record instead, because each `vault_key` row is wrapped with an AAD bound to the record's id and a bearer
     * routes by it (§3.4), so the copy has to come back as itself.
     *
     * SO `replace` CLEARS WHAT TRAVELS AND KEEPS WHAT DOES NOT, IN THE TRANSACTION THAT READS THE FILE. Every table of the
     * `data`, `origin` and `governance` sections is emptied and `importBrainl` then finds the empty record it has always
     * required and fills it; a refusal from it is thrown here so that the clearing rolls back with it rather than leaving
     * a record with nothing in it. `local` is not touched, so a token minted before still verifies and a device grant is
     * still listed. `migration` is left as it is, because the ledger is a fact about these bytes and `importBrainl` never
     * imports it. The header is `importBrainl`'s to replace, as on any import.
     *
     * AND THE ROWS OF A TRAVELLING TABLE THAT DO NOT TRAVEL ARE PUT BACK. An `export` event is written to the record and
     * left out of every file (`brainl.ts`, `LOCAL_ROWS`), so clearing `event` whole would make the record forget every copy
     * that left it, which is the question those rows exist to answer. They are read out first and written back after the
     * file, with their own ids and times; their rowids now follow the file's rows.
     *
     * REFUSED UNLESS THE FILE IS THIS RECORD. Replacing one record with another's rows is the merge the empty rule refuses,
     * made total, and the file's own `record` row is what says which record it is.
     *
     * `before` RUNS ONCE THE FILE HAS PASSED, and before anything is cleared: a host's `before-restore` copy is taken there,
     * so a damaged file or another record's file takes no copy, and the copy is of the record as it was.
     *
     * ONE `import` EVENT IS WRITTEN, AND IT STAYS ON THIS MACHINE (`brainl.ts` `LOCAL_ROWS`, as an export's does). The
     * next export of the record must be the file it came from, manifest for manifest, because that round trip is the
     * only proof the import is complete, so the event is never one row more in a file.
     */
    async import(lines: Iterable<string>, opts: { replace?: boolean; before?: () => Promise<unknown>; by?: string } = {}) {
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
      const sound = await checkBrainl(all, { shape: allowShape });
      if (!sound.ok) return sound;
      const unsound = declarationFault(all);
      if (unsound !== null) return no<ImportReport>('DECLARATION_INVALID', `${unsound} Nothing was imported.`, { at: 'declaration' });

      if (opts.replace !== true) {
        const out = importBrainl(sql, transaction, all, { shape: allowShape });
        if (out.ok) {
          await renameDeclarations(sql);
          reload({ copied: true });
          rebuildFts();
          transaction(() => rebuildKeys(sql, instant(clock.now())));
          /* AND WHICH SEALED FILES ARE WHOLE HERE: the file names them, and only this host's parts make one whole. */
          transaction(() => settleSealed(sql));
          transaction(() => lifecycleEvent('import', 'system', `import ${out.value.rows} rows`));
        }
        return out;
      }

      const mine = recordIdentity(sql)?.id ?? null;
      const theirs = fileRecordId(all);
      if (mine === null || theirs !== mine)
        return no<ImportReport>(
          'OUT_OF_BOUNDS',
          theirs === null
            ? `This file does not say which BrainDog it came from, so it cannot say it is ${mine ?? 'this one'}. A replacing import puts a BrainDog back as itself; import a whole copy, or import this into an empty BrainDog.`
            : `This file is ${theirs}, and this BrainDog is ${mine ?? 'not yet named'}. A replacing import puts a BrainDog back as itself; import the file into an empty BrainDog instead.`,
          { at: 'record.id' },
        );

      const shapes = fileTables(sql).filter((t) => t.section !== 'header' && t.name !== 'migration');

      /* AND THE FILE MUST BE THE WHOLE RECORD, BECAUSE EVERY TABLE IT DOES NOT FILL IS LEFT EMPTY. The header travels
         whatever else does, so a `sections: ['data']` export carries the `record` row the check above asks for, and
         replacing with one answered `ok` with the record's declarations and its owner's `member` row gone, and `list`
         of a register it held answering REGISTER_UNKNOWN (measured, `test/file-doors.test.ts`). A section counts as
         carried when any of its tables has a header in the file, and not only when all of them do, so a copy from an
         older build, which lacks a table added since, can still put the record back. */
      const carried = new Set(all.filter((l) => l.startsWith('#table ')).map((l) => l.slice('#table '.length).split(' ')[0]));
      const leftOut = [...new Set(shapes.map((t) => t.section))].filter((s) => !shapes.some((t) => t.section === s && carried.has(t.name)));
      if (leftOut.length > 0)
        return no<ImportReport>(
          'OUT_OF_BOUNDS',
          `This file leaves out ${leftOut.join(' and ')}, and a replacing import would leave this BrainDog with none of it. Export everything and put that back.`,
          { at: 'sections' },
        );

      /* NOR THE SEALED BYTES. The export door redacts by default, which leaves `vault_key` out of the file and blanks
         every grant's `ciphertext` (`brainl.ts`, `SEALED`), so replacing with the file an export hands out unless told
         otherwise answered `ok` with the record key and the signing key gone, and every credential sealed under them
         with them (measured). Refused while the record holds bytes of either kind and the file holds none; a record
         with no keychain loses nothing to a redacted file, and it is still taken. */
      const keys = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM vault_key')?.n ?? 0);
      const sealed = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM grant WHERE ciphertext IS NOT NULL')?.n ?? 0);
      const fileKeys = fileColumn(all, 'vault_key', 'purpose')?.length ?? 0;
      const fileSealed = (fileColumn(all, 'grant', 'ciphertext') ?? []).filter((v) => v !== null).length;
      if ((keys > 0 && fileKeys === 0) || (sealed > 0 && fileSealed === 0))
        return no<ImportReport>(
          'OUT_OF_BOUNDS',
          'This file was exported without the sealed bytes, and this BrainDog holds its keys and credentials in them, so a replacing import would throw them away. Export with the wrapping key named, which carries them, and put that back.',
          { at: 'vault_key' },
        );

      await opts.before?.();

      let refusal: Refusal | null = null;
      let out: { ok: true; value: ImportReport } | null = null;
      try {
        out = transaction(() => {
          /* A SHARED LINK CLOSED STAYS CLOSED: its `share.close` is read before the tables go and written again after,
             wherever the file still holds the link open. A closure has no inverse, so the live one is the later truth. */
          const closed = sql.all<Record<string, Param>>("SELECT id, ts, actor, target, target_kind, field FROM event WHERE kind = 'share.close'");
          const stays = shapes.flatMap((t) =>
            t.where === undefined ? [] : [{ t, rows: sql.all<Record<string, Param>>(`SELECT ${t.columns.join(', ')} FROM ${t.name} WHERE NOT (${t.where})`) }],
          );
          for (const t of shapes) sql.exec(`DELETE FROM ${t.name}`);
          const done = importBrainl(sql, transaction, all, { shape: allowShape });
          if (!done.ok) {
            refusal = done.refusal;
            throw REPLACE_REFUSED;
          }
          for (const { t, rows } of stays)
            for (const row of rows)
              sql.exec(`INSERT OR IGNORE INTO ${t.name} (${t.columns.join(', ')}) VALUES (${t.columns.map(() => '?').join(', ')})`, ...t.columns.map((c) => row[c] ?? null));
          for (const row of closed) {
            const target = row.target ?? null;
            if (!sql.one("SELECT 1 AS n FROM event WHERE target = ? AND kind = 'share.open'", target)) continue;
            if (sql.one("SELECT 1 AS n FROM event WHERE target = ? AND kind = 'share.close'", target)) continue;
            sql.exec(
              "INSERT OR IGNORE INTO event (id, ts, actor, kind, target, target_kind, field) VALUES (?, ?, ?, 'share.close', ?, ?, ?)",
              row.id ?? null,
              row.ts ?? null,
              row.actor ?? null,
              target,
              row.target_kind ?? null,
              row.field ?? null,
            );
          }
          return done;
        });
      } catch (e) {
        if (e !== REPLACE_REFUSED || refusal === null) throw e;
        return { ok: false as const, refusal: refusal as Refusal };
      }
      await renameDeclarations(sql);
      reload({ copied: true });
      rebuildFts();
      transaction(() => rebuildKeys(sql, instant(clock.now())));
      /* AND WHICH SEALED FILES ARE WHOLE HERE, counted again from the parts this host kept (`sealed.ts`). */
      transaction(() => settleSealed(sql));
      /* A RECORD REPLACED FROM A FILE IS A HAND ON IT (`hold.ts`), marked after the import so the night it
         brought back does not overwrite the mark. */
      transaction(() => markHand(sql, 'This BrainDog was replaced from a file.', opts.by ?? 'an operator', clock.now(), recordTz()));
      transaction(() => lifecycleEvent('import', 'system', `import ${out!.value.rows} rows`));
      return out;
    },

    /**
     * The key this record's exports are signed with, as `dog_sig` carries it, or `null` on a host that holds none.
     *
     * READ BY THE HOSTS' KEY DOORS (`03 §4`'s `/.well-known/braindog-key`), so `braindog verify --key` has somewhere to
     * fetch the key from other than the file it is checking; nothing served it, measured 404 on the self-host.
     *
     * THE `Signer` PORT HANDS OUT THE PUBLIC HALF ONLY BESIDE A SIGNATURE, and the kernel never holds the private one. So
     * the key is read by signing a fixed string no caller supplies and throwing the signature away: nobody can choose the
     * bytes, so this is not a way to have the record sign something.
     */
    async signingKey(): Promise<{ key_id: string; public_key: string } | null> {
      if (!signer) return null;
      const signed = await signer(KEY_PROBE);
      return signed ? { key_id: signed.keyId, public_key: signed.publicKey } : null;
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
    async erase(req: EraseRequest, actor: string, pages: readonly string[] = []): Promise<Result<EraseReport>> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const given: unknown = (req as { subjects?: unknown } | undefined)?.subjects;
      if (!Array.isArray(given) || given.some((s) => typeof s !== 'string'))
        return no('VALUE_MALFORMED', 'subjects is a list of what names the person: a name, an email.', { at: 'subjects' });
      if (given.some((s: string) => s.trim().length < 3))
        return no('VALUE_MALFORMED', 'A subject is three characters or more, so an erasure cannot take half of this BrainDog with it.', { at: 'subjects' });
      const basis = typeof req.basis === 'string' ? req.basis.trim() : '';
      if (!basis) return no('REQUIRED_MISSING', 'Say the legal basis for the erasure. It is kept with the record of it.', { at: 'basis' });

      const subjects: string[] = [...(given as string[])];
      const people: string[] = [];
      if (req.personId !== undefined) {
        if (typeof req.personId !== 'string' || !req.personId) return no('VALUE_MALFORMED', 'personId is the id of a person here.', { at: 'personId' });
        const p = sql.one<{ id: string; email: string | null; name: string | null }>('SELECT id, email, name FROM person WHERE id = ?', req.personId);
        if (!p) return no('OUT_OF_BOUNDS', `${req.personId} is not a person here.`, { at: 'personId' });
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
      slashMayWrite(actor, 'erase');
      const at = instant(clock.now());
      return ok(
        transaction(() =>
          eraseSubjects({ sql, mint, at, actor, pages: new Set(pages), enqueue: (payload) => void enqueue(sql, mint, clock.now(), 'erase.r2', payload) }, matched, people, basis, hashes),
        ),
      );
    },

    /**
     * A lifecycle event the host's own work earns: a snapshot's `export`, a restore's `restore.pitr` (`45 §5.6`).
     *
     * NOT ABOUT A ROW, so no target: the record as a whole is what was copied or put back.
     */
    lifecycle(kind: 'export' | 'import' | 'restore.pitr', actor: string, note: string, to?: string): string {
      /* A RESTORE IS A HAND ON THE RECORD (`hold.ts`): the hold's run of green days ends on the day of it. */
      if (kind === 'restore.pitr') return transaction(() => (markHand(sql, 'This BrainDog was put back to an earlier time.', actor, clock.now(), recordTz()), lifecycleEvent(kind, actor, note, to)));
      return lifecycleEvent(kind, actor, note, to);
    },

    /**
     * The record's copies as three facts (`copies.ts`): when the last copy was kept and its size, and when
     * the record was last exported, each `null` before the first. Reads only, from the local `export` events
     * `lifecycle` writes, so the record's `boot` carries them for Settings.
     */
    copyFacts: (): CopyFacts => copyFacts(sql),
    /** Tonight's copy kept: its `export` event with its name and size, and a failed night's fault cleared. */
    copyKept: (id: string, bytes: number): void => transaction(() => copyKept(sql, lifecycleEvent, id, bytes, clock.now())),
    /** Tonight's copy failed: one `export` event whose note begins `failed:`, and one fault, counted again if open. */
    copyFailed: (why: string): void => transaction(() => copyFailed(sql, lifecycleEvent, why, clock.now())),

    /**
     * Install declarations, then rebuild the cache.
     *
     * The cache is rebuilt HERE and not by the caller, because a declaration installed and not
     * reloaded is a register the write path still refuses — a failure that looks like the install
     * silently not working.
     */
    async install(given: readonly (Declaration | DeclarationBundle)[], expect?: Expected | Expected[], by?: DeclaredBy) {
      /* A BUNDLE IS ITS DECLARATIONS, so an accepted change carrying several installs and arms them in one go. */
      const batch: Declaration[] = given.flatMap((d) =>
        Array.isArray((d as DeclarationBundle).declarations) ? (d as DeclarationBundle).declarations : [d as Declaration],
      );
      const refused = schemaRefusal(state);
      if (refused) return refused;
      /* THE ROWS LAST, after every check about the declarations alone, so a declaration that is wrong in itself is told that
         first rather than how many rows it would also break. */
      const cannot = unreadable(batch) ?? lintBatch(sql, batch, undefined, lintTableNow()) ?? unserved(batch) ?? keysKept(batch) ?? contradicted(batch) ?? stranded(batch);
      if (cannot) return { ok: false as const, refusal: cannot };
      /* THE HISTORY LINE IS WRITTEN IN THE TRANSACTION THAT WRITES THE VERSION, so a change that lands always has one and a
         refused or rolled-back one never does. The wrapper sees only this call's result, which is `Result<Installed[]>`. */
      const recorded = <T,>(fn: () => T): T =>
        transaction(() => {
          const done = fn() as Result<Installed[]>;
          if (done.ok) declared(done.value, by);
          /* AND THE ROWS OF A LIST WHOSE `pairs:` THIS CHANGED, before `reload` below, while `registers` is the old one. */
          if (done.ok) settleRedeclared();
          /* A VERSION THAT SAYS `enabled: false` STOPS THE RUNS ALREADY GOING, in the transaction that installs it. A
             plain edit leaves them on the version they started under. `cancelRunsOf` reads the body now live rather than
             the batch, and an install that rolls back takes its cancellations with it. */
          if (done.ok)
            for (const d of batch)
              if (d.kind === 'rule' && (d.body as { enabled?: unknown }).enabled === false) cancelRunsOf(flowDeps(), d.id.slice('rule.'.length));
          return done as T;
        });
      const out = await installDeclarations(sql, clock.now(), batch, recorded, expect);
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
        /* A PATTERN UPDATED READS WHAT ITS OLDER VERSION HELD, once. */
        const patterns = batch.flatMap((d) => (d.kind === 'ingest' && typeof (d.body as { ingest?: unknown }).ingest === 'string' ? [(d.body as { ingest: string }).ingest] : []));
        if (patterns.length > 0) transaction(() => rerunHeld(ingestDeps(), patterns));
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
      /* THE PACK PATH IS WHERE AN UPGRADE ARRIVES, so a disabled pack is refused here as well as in
         `installDeclarations`; `lintBatch` asks that first.

         AND THE BATCH IS VALIDATED AGAINST THE RECORD, which `stageDeclarations(batch)` alone never did: with no
         `known`, `metricFieldFault` returns before it looks, and a third party's pack whose figure summed `nosuch` was
         measured to plan ok, install ok and read `FIELD_UNKNOWN` on every page, while the same figure through `install`
         was refused. Every `installPack` and every accepted pack proposal comes through here, so a check that only
         `install` ran was a check a pack never met.

         AND `stranded` FOR THE SAME REASON. Without it a pack update that opened `lane` to text staged here with its own
         figure resent beside it unchanged, and `lane is earning money` read 1 before and 0 after with nothing refused
         (`packages/record/test/plan-widen-record.test.ts`); `arriving` already treats a reader sent with the same bytes as
         the record's and not the batch's.

         AND A RULE THAT TAGS A LIST WHOSE `tags` REFUSES IT (`taggingRefused`), which `contradicted` asks on the other paths
         and this one never ran. A pack's `rule.late` staged here over a Jobs whose `tags` was `int` installed, and the
         next Rent went in untagged with nothing refused (`test/tags-rule-order.test.ts`). Only that half of
         `contradicted`: the rows are `packages/declare`'s `plan` to count on this path.

         AND ITS LIST HALF (`tagsNarrowed`), which counts rules and not rows, so it is not `plan`'s to ask. Asked by rule
         alone, a pack that narrowed Jobs' `tags` to `list<enum>` of `[chase]`, or to `int`, under an installed `rule.late`
         staged, applied and left the next Rent untagged. */
      const cannot = stagingFault(batch);
      if (cannot) return { ok: false as const, refusal: cannot };
      const staged = await stageDeclarations(batch);
      if (!staged.ok) return staged;
      return ok(() => {
        const out = staged.value(sql, clock.now(), transaction);
        /* AND THE LEDGER SETTLED UNDER A `pairs:` THE PACK CHANGED, because a pack update is where a new `pairs:` arrives:
           money-core 2.2.0 installed over 2.1.0 paired nothing already there and kept a pair it refuses. Here and not in
           the caller, because only here is the cache still the old declaration; the host's transaction around this
           makes it one install with the declarations, and its own `transaction` here is then a no-op. */
        if (out.ok) transaction(() => settleRedeclared());
        /* AND THE SAME ON A PACK'S PATH, WHEN IT LANDS. `applyDeclarations` refuses and rolls back —
           a clashing unique field, a missing dependency — and this armed the rows anyway: the caller
           got a refusal and the schedule held a `digest` row for a declaration that does not exist.
           It fires once, finds nothing, and goes `done`. */
        if (out.ok) armDerived(batch);
        /* AND A PACK VERSION THAT SAYS `enabled: false` STOPS THE RUNS ALREADY GOING, as `install` does. Every pack
           install and upgrade comes through here and not through `install`, and cancelling only there left a pack's
           switched-off rule showing its run `waiting` for the whole span. AFTER THE WRITE AND NOT AROUND IT: wrapping
           `staged.value` in a transaction would make its own a nested no-op, and a `UniqueClash` it turns into a
           refusal would then keep the rows written before the clash. */
        if (out.ok)
          transaction(() => {
            for (const d of batch)
              if (d.kind === 'rule' && (d.body as { enabled?: unknown }).enabled === false) cancelRunsOf(flowDeps(), d.id.slice('rule.'.length));
          });
        return out;
      });
    },

    /**
     * The checks `stageInstall` runs, and nothing written: what an arrangement is held to when it is filed.
     *
     * THE BATCH OVERLAYS WHAT IS INSTALLED, so a page over a list a pack in the same arrangement declares is
     * linted against that list, and the owner is never the one who finds a page that would not install.
     *
     * `known` AND `owners` ARE THE RECORD TO LAY IT OVER IN PLACE OF THE TABLE, with no batch in them: for the arranger,
     * the record as the packs before this one would leave it (`declare`'s `plannedState`). Absent, the record is the
     * table. Only the rows are always the table's, since a plan writes none: the counts a figure groups by, and whether a
     * pack is off. `owners` left out reads every declaration in `known` as the owner's own.
     */
    lint(batch: readonly Declaration[], known?: Known, owners?: Owners): Refusal | null {
      return againstPlan(known === undefined ? undefined : { known, owners: owners ?? new Map() }, () => stagingFault(batch));
    },

    /**
     * Retire declarations, and with `by` write one `declare` line for each that was live.
     *
     * A RETIRE WROTE NO HISTORY. Measured: `setDeclaration` wrote `Added name.` by `p_1`, `retireDeclaration` then
     * retired Projects, and the `declare` lines were unchanged, so "who took Projects off" had no answer. The line
     * names the version that was retired as both `from_v` and `to_v`, because a retire makes no new version: a `from_v`
     * of null is what `declared` writes for a declaration's first version, and a reader of the feed would have read the
     * retire as an arrival. Unsigned, it writes nothing, for `declared`'s reason: that is setup.
     *
     * THE LIVE VERSIONS ARE READ INSIDE THE SAME TRANSACTION AS THE RETIRE, so a line is written only for what this call
     * actually took off, and a refused retire rolls back with no line.
     */
    retire(ids: readonly string[], by?: DeclaredBy) {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const out = transaction(() => {
        const live = [...new Set(ids)].flatMap((id) => {
          const hit = sql.one<{ version: number; kind: string; body: string; pack: string | null }>(
            'SELECT version, kind, body, pack_id AS pack FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0',
            id,
          );
          /* A RETIRE IS A DECLARE LINE TOO, so Slash takes off its own look and nothing else, before anything is retired. */
          if (hit && by?.actor !== undefined) slashMayWrite(by.actor, 'declare', hit);
          return hit ? [{ id, version: hit.version }] : [];
        });
        const done = retireDeclarations(sql, ids, transaction);
        /* A RETIRED AUTOMATION'S RUNS END WITH IT, in this transaction: a run of the retired rule woke an hour later,
           wrote to its row and notified, because nothing after `startRun` asked. */
        if (done.ok) for (const one of live) if (one.id.startsWith('rule.')) cancelRunsOf(flowDeps(), one.id.slice('rule.'.length));
        /* UNDER A SUGGESTION IT NAMES WHO PROPOSED IT, as `declared` does for an install. */
        const proposer = by?.suggestion === undefined ? undefined : sql.one<{ by: string }>('SELECT opened_by AS by FROM suggestion WHERE id = ?', by.suggestion)?.by;
        const note = proposer === undefined ? 'Retired.' : `Retired. Proposed by ${proposer} in ${by!.suggestion}.`.slice(0, 280);
        if (done.ok && by?.actor !== undefined)
          for (const one of live)
            sql.exec(
              "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, note) VALUES (?, ?, ?, 'declare', ?, 'declaration', ?, ?, ?)",
              mint(),
              instant(clock.now()),
              by.actor,
              `declaration:${one.id}`,
              String(one.version),
              String(one.version),
              note,
            );
        return done;
      });
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
      /* THE PACK'S AUTOMATIONS STOP WITH IT, IN THE SAME TRANSACTION. Left to the wake, a pack turned off and on again
         inside the wait put the rule back live first, and the run then wrote `note: chased` and notified "Chased Rent"
         for an owner who had switched it off. `attempt` and not `transaction`, because the kernel's transaction is
         re-entrant: `declare.ts`'s own would become a no-op inside this one, and a refusal it carried out would commit
         the retires made before it. */
      const out = attempt(sql, transaction, () => {
        const done = disableDeclaredPack(sql, clock.now(), id, opts, transaction, mint);
        if (!done.ok || !done.value.changed) return done;
        const packs = done.value.packs;
        const off = packs.length === 1 ? `pack ${packs[0]} was` : `packs ${packs.join(', ')} were`;
        for (const d of done.value.declarations)
          if (d.startsWith('rule.')) cancelRunsOf(flowDeps(), d.slice('rule.'.length), `${off} turned off, and ${d} with it, so this run stopped before its next step.`);
        return done;
      });
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
      const out = writePackConfig(sql, clock.now(), id, values, opts, transaction, mint);
      if (!out.ok || !out.value.changed.includes(REST_DAYS_SETTING)) return out;
      /* REST DAYS HOLD AT ONCE (2 Nov fix pass). The walk and the reminders read them live (`restDaysOf`), but a reminder
         is armed when its row is written, so a bill's reminder stayed on the day the old rest days gave it until somebody
         touched the row, and the answer here said the change waited for Money's next install. Measured on his record:
         Friday and Saturday saved, and the reminders still kept Saturday and Sunday. So every row with a repeat that moves
         off a rest day has its reminders armed again now, in one transaction, from the setting as it now reads. */
      rearmRestDays();
      const rest = out.value.changed.filter((k) => k !== REST_DAYS_SETTING);
      const said =
        rest.length === 0
          ? `Saved the rest days for ${id}. Due days and reminders follow them now.`
          : `${out.value.said} The rest days hold now.`;
      return ok({ ...out.value, said });
    },

    /** Every pack's setting values, by pack id, as a plan fills `{{config:}}` from them. */
    packSettings: () => declaredPackSettings(sql, removedSince()),

    registers: () => registers,
    register: (id: string) => registers.get(id),
    /**
     * The lists the kernel declares itself (`pack_id` kernel: the runs, and what he told them), by id. On every record
     * and no person's or pack's, so a screen that tells him what he filed leaves them out by this and not by a name.
     */
    kernelLists: (): string[] => [...kernelListsNow()],
    /** Facts held while the lists they read stand: one for each read that asks several. */
    heldFacts,
    /**
     * The lists declared `personal: true`, by id: the owner's alone, which no grant, share, link, child key or "See as"
     * reaches. The record's `guard` refuses anybody else on them, and the lens never covers one.
     */
    personalLists: (): string[] => [...personalListsNow()],
    /**
     * A live list as `@braindog/where` reads it, or `null` for a list this record does not hold.
     *
     * FOR A CALLER THAT PARSES A SENTENCE ITSELF. The record's `list` reads which fields a caller's sentence filters on,
     * to count a scan, and `parseWhere` needs the list's fields, their types and which one the state mirrors to read a
     * sentence at all. Only this closure builds that shape, so it is handed out rather than built a second time.
     */
    schemaOf: (register: string): Schema | null => (registers.has(register) ? schemaOf(register) : null),

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

    /**
     * The live declarations somebody changed in the app that a pack wrote first: `was` is that pack, and `body` is the
     * pack's last version of it, the one the edit started from.
     *
     * THE RECORD KNEW AND NOTHING ASKED IT. `setDeclaration` writes the edit with `pack_id` null and stamps the pack's row
     * `superseded_at`, and that row still says whose it was. `declarations()` reads live rows only, so a plan saw an owner
     * who had moved one block on Money as somebody who had written a page called `money` from nothing, and refused every
     * later money-core update as `PROVIDES_CONFLICT`.
     *
     * THE PACK'S LAST ROW, NOT THE ROW JUST BEFORE. An owner who arranges a page twice has two rows with `pack_id` null
     * above the pack's, and "the latest earlier version" is then their own first edit. A retire between the two means the
     * pack went away and somebody wrote the id again, which is not an edit of the pack's declaration, so it is not counted.
     */
    detached: (): { id: string; was: string; body: string }[] =>
      sql.all<{ id: string; was: string; body: string }>(
        `SELECT d.id AS id, p.pack_id AS was, p.body AS body
           FROM declaration d
           JOIN declaration p ON p.id = d.id
            AND p.version = (SELECT MAX(e.version) FROM declaration e WHERE e.id = d.id AND e.version < d.version AND e.pack_id IS NOT NULL)
          WHERE d.superseded_at IS NULL AND d.retired = 0 AND d.pack_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM declaration r WHERE r.id = d.id AND r.retired = 1 AND r.version >= p.version AND r.version < d.version)
          ORDER BY d.id`,
      ),

    /**
     * WHAT AN ADD-ON REMEMBERS PLANTING (`planted` in its stored manifest, written by `declare` at install): the example
     * rows it made, by seed key, which is how an update finds a row a person has since renamed. `undefined` for an
     * add-on not installed, one that planted nothing, or a manifest that does not read.
     */
    packPlanted: (id: string): unknown => {
      const m = sql.one<{ manifest: string }>('SELECT manifest FROM pack WHERE id = ?', id)?.manifest;
      try {
        return m === undefined ? undefined : (JSON.parse(m) as { planted?: unknown }).planted;
      } catch {
        return undefined;
      }
    },

    /**
     * The `pack` rows: what is installed, at which version, and what each asks of the others (`requires.packs`).
     *
     * `requires` IS READ OFF THE MANIFEST THE ROW STORES, because a plan is built from this and nothing else. It
     * answered an id and a version, so `plan` had no range to read for any held pack and its range refusal never fired
     * where a person installs one: money-core 2.0.0 put over `bank-hsbc-eg` 1.0.0 on `^1.8.0` through `planPack` and
     * `installPack` planned `dependents: []` and installed. A manifest that does not parse, or names no pack, gives
     * `{}`: no range is claimed, and a plan says of that pack what it said before.
     *
     * `laid` IS READ OFF THE SAME MANIFEST (`laidOf`): the fields the pack laid through `extends`, by list id, which is
     * how a plan lets a pack change a field it laid and no other. Absent for a pack that laid none, so a row reads as it
     * did before `extends` existed.
     */
    packs: (): { id: string; version: string; requires: Record<string, string>; laid?: Record<string, string[]> }[] =>
      sql.all<{ id: string; version: string; manifest: string }>('SELECT id, version, manifest FROM pack ORDER BY id').map((p) => {
        const laid = laidOf(p.manifest);
        return {
          id: p.id,
          version: p.version,
          requires: requiresOf(p.manifest),
          ...(Object.keys(laid).length > 0 ? { laid } : {}),
        };
      }),

    /**
     * The add-ons with parts still held back, and what each part waits for (`when: { holds }`).
     *
     * WHAT THE RECORD READS AFTER AN INSTALL OR A SWITCH-ON to know which add-ons to plan again, and what an add-on's
     * page reads to say how many parts wait and for what. Only add-ons with something waiting, in id order, so the
     * second plan runs in the same order every time. One that is switched off is still here: its parts wait all the
     * same, and whether to plan a switched-off add-on again is the caller's to decide.
     *
     * A CELL THAT DOES NOT PARSE, OR A PART WITH NO PLACE, IS LEFT OUT rather than thrown: nothing but `rememberPack`
     * writes the column, and a read that failed here would take the add-ons page down with it.
     */
    packsWaiting: (): { id: string; waiting: PackWaiting[] }[] =>
      sql
        .all<{ id: string; waiting: string }>('SELECT id, waiting FROM pack WHERE waiting IS NOT NULL ORDER BY id')
        .map((p) => ({ id: p.id, waiting: waitingOf(p.waiting) }))
        .filter((p) => p.waiting.length > 0),

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
            /* BY THE TARGET'S INDEX (`event_target`), as every pack line is aimed at `pack:<id>`: the kind alone scanned the
               whole log, three times a `boot` and once after every request (`firstPartyTick`), 60 ms a time at 150k lines. */
            "SELECT target, kind, ts, to_v FROM event WHERE rowid IN (SELECT MAX(rowid) FROM event WHERE target GLOB 'pack:*' AND target_kind = 'pack' AND kind IN ('retire', 'install', 'uninstall') GROUP BY target)",
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
      /* WHO A LIVE DECLARATION'S `pack_id` NAMES. The seed's body-owned packs leave `pack_id` null and the pack path writes
         a `pack` row with it, so a `pack_id` with no row is what a handover leaves and nothing else does. */
      const pinned = new Set(
        sql.all<{ pack_id: string }>('SELECT DISTINCT pack_id FROM declaration WHERE superseded_at IS NULL AND retired = 0 AND pack_id IS NOT NULL').map((r) => r.pack_id),
      );

      const out: PackState[] = [];
      /* `kernel` IS THE RECORD'S OWN and no person may turn it off, so it is not a pack on this list. */
      for (const id of new Set([...rows.keys(), ...live.keys(), ...last.keys()])) {
        if (id === 'kernel') continue;
        const row = rows.get(id);
        const on = live.get(id) ?? [];
        const offAt = row ? row.disabled_at : on.length === 0 && last.get(id)?.kind === 'retire' ? (last.get(id)?.ts ?? null) : null;
        /* A BODY-OWNED PACK WITH NOTHING LIVE AND NO `retire` LAST was uninstalled, or never was. */
        if (!row && on.length === 0 && offAt === null) continue;
        out.push({
          id,
          version: row?.version ?? null,
          disabled_at: offAt,
          registers: registersOf(offAt === null ? on : wentOff(id)),
          ...(!row && offAt === null && pinned.has(id) ? { handed: true as const } : {}),
        });
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
    rememberPack: (row: {
      id: string;
      version: string;
      source: string;
      ref: string | null;
      manifest: string;
      checksum: string;
      approved?: readonly string[];
      by?: string;
      waiting?: readonly PackWaiting[];
      /** Why an install nobody pressed was made (a part that waited arrived): the line's note, signed by `by`. */
      because?: string;
    }) =>
      transaction(() => {
        /* WHAT THE PLAN HELD BACK (`when: { holds }`, migration 38), WRITTEN ON EVERY INSTALL AND NOT ONLY THE FIRST: an
           upgrade or a reinstall whose plan held nothing back writes NULL over what the last one left, so a part that
           has arrived stops being counted as waiting. NULL and never `[]`, which is what `packsWaiting` reads by. */
        const waiting = row.waiting !== undefined && row.waiting.length > 0 ? jcs(row.waiting.map((w) => ({ at: w.at, holds: [...w.holds] })) as unknown as Json) : null;
        /* THE VERSION IT HELD BEFORE, as the line's `from_v`, so a reinstall at the same version is told from a first
           install: Money put in again for Certificates' legs read "Installed the Money add-on" and every list it holds
           as added (audit j, AJ6). `bookkeeping` leaves such a line out of the feed and Activity; the log keeps it.
           ONLY WHEN THE BODY IS THE SAME TOO (review i, RI1): a re-put at the same version whose checksum moved (a fold
           landing after that version is live) changed what the record holds, so its line keeps `from_v` empty and is
           said as an install. BUT NEVER FOR THE RECORD'S OWN RE-PUT (review k, RK2): `legsFollow` puts Money in again at
           the version it holds with the legs another add-on's install brought, which moves the checksum and nothing a
           person chose, so a line signed `system` keeps the version it held and stays out of the feed. Only a person's
           re-put, or a fold they pressed in, can land a new body at a live version. */
        const held = sql.one<{ version: string; checksum: string | null }>('SELECT version, checksum FROM pack WHERE id = ?', row.id);
        const own = (row.by || 'system') === 'system';
        const was = held === undefined ? null : held.version !== row.version || held.checksum === row.checksum || own ? held.version : null;
        sql.exec(
          `INSERT INTO pack (id, version, source, source_ref, manifest, installed_at, checksum, waiting)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET version = excluded.version, source = excluded.source,
             source_ref = excluded.source_ref, manifest = excluded.manifest, checksum = excluded.checksum,
             waiting = excluded.waiting`,
          row.id,
          row.version,
          row.source,
          row.ref,
          row.manifest,
          instant(clock.now()),
          row.checksum,
          waiting,
        );
        const approved = row.approved !== undefined && row.approved.length > 0;
        /* SIGNED BY WHOEVER IT WAS MADE FOR (review i, RI1): a person's own reinstall, with nothing to approve and no
           `because`, was signed `system` and left out of the feed as the record's own. `system` only when no one is
           named, or the record put it in by itself (`legsFollow` names `system`). */
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, note) VALUES (?, ?, ?, 'install', ?, 'pack', ?, ?, ?)",
          mint(),
          instant(clock.now()),
          row.by || 'system',
          `pack:${row.id}`,
          was,
          row.version,
          approved ? row.approved!.join('\n') : (row.because ?? null),
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
          `SELECT kind, key, due_at, payload, state, attempts FROM schedule WHERE state IN ('pending', 'paused') AND kind IN ('digest', 'pull', 'call', 'poll', 'snapshot', 'script')
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
          `DELETE FROM schedule WHERE state IN ('pending', 'paused') AND kind IN ('digest', 'pull', 'call', 'poll', 'snapshot', 'script')
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
    /**
     * A row as the record hands it out, with the fields its list works out at read filled (`readOut`). `reads` is the
     * caller's sight for a `via`, the lists she reads whole; absent is the record's own. The closure's `get`, which the
     * write path reads a row through, stays the stored row.
     */
    get: (ref: string | { register: string; seq: number }, opts: { includeDeleted?: boolean; reads?: (register: string) => boolean } = {}): Entry | null =>
      readOut(get(ref, opts), opts.reads),
    /**
     * Many rows by id at once, each answered as `get` answers it: one statement per 500 ids where `get` asked one a row.
     * A ref that is spoken (`S4`, `tasks#3`) is asked through `get` itself, so it means what it always meant.
     */
    getEach: (refs: readonly string[], opts: { includeDeleted?: boolean } = {}): Map<string, Entry | null> => {
      const out = new Map<string, Entry | null>();
      const ids: string[] = [];
      for (const ref of new Set(refs)) {
        if (parseSpoken(ref) ?? prefixed(ref)) out.set(ref, readOut(get(ref, opts)));
        else ids.push(ref);
      }
      for (let i = 0; i < ids.length; i += 500)
        for (const row of sql.all<Record<string, unknown>>(`SELECT ${COLUMNS} FROM entry WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids.slice(i, i + 500)))) {
          const entry = hydrate(row);
          out.set(entry.id, !opts.includeDeleted && entry.deleted_at ? null : readOut(entry));
        }
      for (const id of ids) if (!out.has(id)) out.set(id, null);
      return out;
    },
    list,
    /** What points at one row, from the `to:` every `ref` field already declares. */
    backlinks,
    count,
    /** Rows a maker kept private (migration 40): `hiddenFrom` for a reader that answers one row, `setPrivate` to mark one. */
    hiddenFrom,
    anyHiddenFrom,
    privateAmong,
    madeBy: (id: string): string | null => madeByIn(sql, id),
    scope,
    writeScope,
    /** Writes held to the row: whether a scope admits one row, the fields a rule names, and who to ask. */
    admits,
    ruleFields,
    ownerName,
    /** Which of these rows of one list a grant admits for a viewer, one statement per 500. */
    admittedIds,
    /** The clause one list's rows meet under a grant for a viewer, for a reader that writes its own count, or `null`. */
    admitClause,
    setPrivate,
    version,
    history,
    /** Which project a run in this place belongs to, and how it was told (`scope.ts`). Reads only. */
    resolveProject: (where: Whereabouts): Resolved => resolveProject(sql, registers, where),
    /** The repositories runs keep turning up in that no project lists, each asked about once by its `key` (`scope.ts`). Reads only. */
    projectSuggestions: (): ProjectSuggestion[] => projectSuggestions(sql, registers),
    inScope,
    runFor,
    /** A session with no folder placed by what it says it is working on, a first project formed from it as a draft. */
    topicRun,
    endRun,
    /** A run's words and commits read against its project's open tasks, and the project's next step followed (`run-reads.ts`). */
    readRunWork,
    /** A token's own run told it is still working, its `last_seen` moved in place with no event. Never opens one. */
    heartbeat,
    /**
     * Every vital sign of the record now, each with its state, its number, its sentence, its facts and its last 14
     * days (`signs.ts`). Reads only. The record's `signs`, the host's route and `braindog signs` all read this answer.
     */
    signs: (): Result<{ signs: VitalSign[] }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return ok({ signs: everySign() });
    },
    /**
     * One reading of a sign the record layer or the host owns, filed for today. Refuses an id outside the list and a
     * sign the kernel reads itself (`fileSignReading`).
     */
    signRead: (id: string, reading: SignReading): Result<{ sign: string; day: string }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return transaction(() => fileSignReading(sql, id, reading, clock.now(), recordTz()));
    },
    /**
     * One mark of how a session met the agent door: it said hello, was given the tools, made calls, waited on a
     * hook. Kept against the caller's run, `S42`, or `token:` and its token when it has none.
     *
     * IT NEVER OPENS A RUN. A mark that opened one would make the very session it counts, and a client that only said
     * hello would read as a session that worked. A run another key opened is not the caller's, so it marks its token.
     * A person or the record's own path marks as itself. A kind off the list is refused, so the surface hears why.
     */
    heard: (w: WriteContext, mark: DoorMark): Result<{ marked: true }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      if (!(DOOR_KINDS as readonly string[]).includes(mark?.kind as string))
        return no('ENUM_VALUE_UNKNOWN', `A mark is one of ${DOOR_KINDS.join(', ')}.`, { at: 'kind', allowed: [...DOOR_KINDS] });
      return transaction(() => {
        const token = w.principal?.kind === 'token' ? (w.principal.token ?? null) : null;
        const run = token === null ? null : findRun(w.session ?? {}, token);
        const who = run ? `${registers.get(SESSION)?.seq_prefix ?? 'S'}${String(run.seq)}` : token !== null ? `token:${token}` : w.actor;
        markDoor(sql, who, mark, clock.now());
        /* A CALL IS A BEAT TOO: a session making calls is working, though it wrote nothing, so its own run's clock moves
           (`heartbeat`, in place, no event). Only a run found; a mark still never opens one. */
        if (run && mark.kind === 'called') heartbeat(w);
        return ok({ marked: true as const });
      });
    },
    /**
     * What the door's marks since `sinceMs` add up to, the last seven days when it names none (`door.ts`). `current` is
     * the build the reader runs, so a session on another counts as behind. Reads only.
     */
    doorMarks: (sinceMs?: number, current?: string): Result<DoorSigns> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const now = clock.now();
      return ok(readDoorMarks(sql, sinceMs ?? now - DOOR_WINDOW_DAYS * 86_400_000, now, current));
    },
    /**
     * What is not working that an operator must fix, open ones only, newest first: each with its plain
     * sentence, how many times and since when. Reads only. The raw error rides along, and the record decides who reads it.
     */
    faults: (): Result<{ faults: Fault[] }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return ok({ faults: openFaults(sql) });
    },
    /**
     * THE HOST'S MAIL, SAID ON HEALTH (PK4): a mail its server refused raises `MAIL_FAULT` with the raw error for the
     * operator, and the next one that goes out clears it. A record this build refuses keeps nothing.
     */
    mailFailed: (error: string): void => {
      if (schemaRefusal(state)) return;
      raiseFault(sql, MAIL_FAULT, 'mail', error, clock.now());
    },
    mailSent: (delivered: readonly string[] = [], what?: string): void => {
      if (schemaRefusal(state)) return;
      clearFault(sql, MAIL_FAULT, clock.now());
      /* AND A PERSON WHO MISSED ONE IS CLEARED BY THE NEXT THAT REACHES THEM (`mailMissed`). */
      for (const address of delivered) clearFault(sql, missedCause(mailedKey(address).key), clock.now());
      /* AND A LINE ABOUT THE LAST RUN OF THIS SUMMARY GOES WITH THE NEXT RUN OF IT (RM9): somebody it no longer names, a
         member taken off or an address on no list, would otherwise be said to have missed it for ever. A run is minutes
         long, so a line raised within the hour is this run's and stays; one still refused is raised again by its send. */
      if (what !== undefined && what.startsWith('the summary '))
        sql.exec(
          "UPDATE fault SET cleared_at = ? WHERE cause LIKE 'mail#missed.%' AND cleared_at IS NULL AND instr(said, ?) > 0 AND last_at < ?",
          new Date(clock.now()).toISOString(),
          `didn't get ${what}:`,
          new Date(clock.now() - 3_600_000).toISOString(),
        );
    },
    /**
     * MEMBERS WHO MISSED A MAIL THE REST GOT (review k, RK5): the server refused their mailbox and took the others, so
     * nothing failed for the server and Health said nothing. Each person is a line of their own on Health, by name
     * (`missedSaid`), cleared when a mail next reaches them (`mailSent`). `what` is what they missed, as the host says it.
     */
    mailMissed: (addresses: readonly string[], what: string): void => {
      if (schemaRefusal(state)) return;
      for (const address of addresses) {
        const who = mailedKey(address);
        raiseFault(sql, missedCause(who.key), 'mail', 'the mail server has no such mailbox at RCPT TO', clock.now(), missedSaid(who.name, what));
      }
    },
    /**
     * Queue the job a fault is about once more: `outbox#<kind>`'s dead letters go back on the outbox with their attempts
     * reset (`retryDead`), and `schedule#<kind>`'s newest failed row goes back on the schedule, due now (`retryFailed`).
     * THE FAULT STAYS OPEN until a job of that kind completes, which clears it, so "Try again" that fails again says so.
     */
    retryFault: (w: WriteContext, args: { cause: string }): Result<{ cause: string; queued: number }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const cause = typeof args?.cause === 'string' ? args.cause.trim() : '';
      if (cause === '') return no('REQUIRED_MISSING', 'Say which fault to try again, by its cause.', { at: 'cause' });
      return transaction(() => {
        if (!openFaults(sql).some((f) => f.cause === cause))
          return no<{ cause: string; queued: number }>('ROW_UNKNOWN', 'Nothing is failing for that cause now, so there is nothing to try again.', { at: 'cause' });
        const queued = cause.startsWith('outbox#')
          ? retryDead(sql, cause.slice('outbox#'.length), clock.now())
          : cause.startsWith('schedule#')
            ? retryFailed(sql, cause.slice('schedule#'.length), clock.now())
            : null;
        if (queued === null) return no<{ cause: string; queued: number }>('VALUE_MALFORMED', 'This one tries again by itself at its next time.', { at: 'cause' });
        /* A JOB REQUEUED BY A HAND ENDS THE HOLD'S RUN OF GREEN DAYS (`hold.ts`): a green day an operator helped
           along is not a day the record ran by itself. The system's own retries are not a hand. */
        if (queued > 0 && w.actor !== 'system') markHand(sql, 'A failed job was tried again by hand.', w.actor, clock.now(), recordTz());
        return ok({ cause, queued });
      });
    },
    /**
     * Take back an open question. Only the run that opened it, or a later run of the same key, may; govern
     * says who and closes it as `withdrawn`. Signed as `propose` signs, so the opener is the one asking.
     */
    withdraw: (w: WriteContext, args: { id: string }): Result<{ id: string; state: 'withdrawn' }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const id = typeof args?.id === 'string' ? args.id.trim() : '';
      if (id === '') return no('REQUIRED_MISSING', 'Say which question to take back.', { at: 'id' });
      return transaction(() => {
        const theirs = foreignRun<{ id: string; state: 'withdrawn' }>(w);
        if (theirs) return theirs;
        /* ANOTHER KEY IS REFUSED BEFORE IT IS SIGNED, since signing opens a run for a token that has none and a refused
           call must leave nothing behind. Govern refuses `token:` as no run, in its own sentence. */
        const token = w.principal?.kind === 'token' ? (w.principal.token ?? null) : null;
        const opener = sql.one<{ opened_by: string }>('SELECT opened_by FROM suggestion WHERE id = ?', id)?.opened_by;
        const mine = token === null || (opener !== undefined && tokenOfRun(sql, opener) === token);
        return withdrawSuggestion(sql, governDeps(), id, mine ? signedBy(w) : `token:${token}`, clock.now());
      });
    },
    /**
     * The steps left open in a place, newest first, each `next` or `earlier`, the caller's own run (`self`, its id)
     * left out (`handoff.ts`). Reads only. What a starting session is handed, and what Agents lists.
     */
    openHandoffs: (place: HandoffPlace, self: string | null = null): Result<{ handoffs: OpenHandoff[] }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return ok({ handoffs: openHandoffs(sql, place ?? {}, self, clock.now()) });
    },
    /**
     * The caller's run picks up the step `left` left (its spoken name, `S12`). Only an agent's key takes, since a step is
     * work for a run; a person is refused, and so is a key naming a run another key opened. The first of two takers
     * wins and the second is told who took it and when (`handoff.ts`). Signed as `propose` signs: by the taker's run.
     * A REFUSAL LEAVES NOTHING BEHIND (`attempt`): not the run opened to sign it, nor a take's first write when its second
     * failed, which `take`'s own transaction cannot undo from inside this one.
     */
    takeHandoff: (held: WriteContext, left: string): Result<Taken> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const said = typeof left === 'string' ? left.trim() : '';
      if (said === '') return no('REQUIRED_MISSING', 'Say which step to take, by the run that left it.', { at: 'left' });
      /* A RUN THE TAKER MAY NOT WRITE (`WriteContext.within`, over the runs) is answered as one that is not there. */
      const { within, ...w } = held;
      return attempt(sql, transaction, () => {
        const taker = runFor(w, 'opened: took a step');
        if (!taker.ok) return taker;
        /* A RUN TAKES ONLY A STEP LEFT IN ITS OWN PLACE (handoff-guard-49), its project or its repository, as
           `openHandoffs` offers it: by its name alone it could take a step it was never shown. */
        const at = runPlace(taker.value.run);
        return takeHandoff(sql, { id: taker.value.run.id, spoken: taker.value.spoken }, said, clock.now(), handoffWrite, (run: RunRow) =>
          inPlace(at, run) && (within === undefined || admits(SESSION, within, run.id)),
        );
      });
    },
    /**
     * Close the step `left` left without taking it, saying `why` in words (`handoff.ts`). An agent drops a step that is
     * no longer true, signed by its run as `propose` signs; a person drops one from the app, signed as themselves.
     */
    dropHandoff: (held: WriteContext, left: string, why: string): Result<{ left: string; next: string }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      const said = typeof left === 'string' ? left.trim() : '';
      if (said === '') return no('REQUIRED_MISSING', 'Say which step to drop, by the run that left it.', { at: 'left' });
      const { within, ...w } = held;
      const seen = (run: RunRow): boolean => within === undefined || admits(SESSION, within, run.id);
      return attempt(sql, transaction, () => {
        const theirs = foreignRun<{ left: string; next: string }>(w);
        if (theirs) return theirs;
        /* AN AGENT DROPS ONLY A STEP IN ITS OWN PLACE, read off its run as a take reads it (its repository from the run,
           and the hint only for a run that has none); a person has no place and drops any step. */
        const located = w.principal?.kind === 'token' ? locateRun(w) : null;
        const repoOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
        const may = located
          ? (run: RunRow) =>
              seen(run) &&
              inPlace(
                { project: located.project?.spoken ?? null, repo: (located.found ? repoOf(byId(located.found.id)?.fields.repo) : null) ?? w.session?.repo ?? null },
                run,
              )
          : seen;
        return dropHandoff(sql, signedBy(w), said, typeof why === 'string' ? why : '', clock.now(), handoffWrite, may);
      });
    },

    /* ── what he tells an agent, and the settings it works under (agents and MCP plan §8.3, migration 42) ──────────

       THE CONTRACT WAVE 2 BUILDS ON. A run is named by its spoken name (`S883`) or its row id, an instruction by `IN4`
       or its row id, and every `Instr` carries both (`id` spoken, `row` the entry's). The record's methods decide WHO
       may call each (a person in a browser for `instruct`, `withdrawInstruction` and `setProfile`; an agent's token,
       resolved to its own run, for the rest) and hand the kernel the run they resolved: the kernel checks only that
       the instruction is that run's. Every write is all or nothing (`attempt`). */

    /** He tells an agent (`instruct`): one instruction made, and a stop, pause, resume or redirect applied at once. */
    instruct: (w: WriteContext, input: InstructInput): Result<Instr> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      if (w.principal?.kind === 'token')
        return no('NEEDS_BROWSER_SESSION', 'Only a person tells an agent, signed in to BrainDog. An agent answers with instructions.', { at: 'principal' });
      return attempt(sql, transaction, () => instructRun(instructionDeps(), w.actor, input));
    },
    /** He takes back an instruction no run has taken yet. */
    withdrawInstruction: (w: WriteContext, id: string): Result<Instr> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      if (w.principal?.kind === 'token')
        return no('NEEDS_BROWSER_SESSION', 'Only the person who told it takes an instruction back, in BrainDog.', { at: 'principal' });
      return attempt(sql, transaction, () => withdrawInstructionFor(instructionDeps(), w.actor, typeof id === 'string' ? id : ''));
    },
    /** He closes a finished instruction, which takes it off his list. */
    closeInstruction: (w: WriteContext, id: string): Result<Instr> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      if (w.principal?.kind === 'token') return no('NEEDS_BROWSER_SESSION', 'Only the person who told it closes an instruction, in BrainDog.', { at: 'principal' });
      return attempt(sql, transaction, () => closeInstructionFor(instructionDeps(), w.actor, typeof id === 'string' ? id : ''));
    },
    /** The open instructions for run `runId`, a stop or pause first: `instructionFor(hints, runId) → Instr[]`. */
    instructionFor: (hints: RunHints, runId: string): Instr[] => instructionsFor(sql, hints ?? {}, runId, clock.now()),
    /** Run `runId` takes instruction `id`, compare and set: `takeInstruction(id, runId) → Result<Instr>`. */
    takeInstruction: (id: string, runId: string): Result<Instr> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return attempt(sql, transaction, () => takeInstructionFor(instructionDeps(), id, runId));
    },
    /** The run that took `id` answers it: `replyInstruction(id, runId, {said, state}) → Result<Instr>`. */
    replyInstruction: (id: string, runId: string, answer: { said: string; state?: ReplyState | undefined }): Result<Instr> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return attempt(sql, transaction, () => replyToInstruction(instructionDeps(), id, runId, answer));
    },
    /** Run `runId` was shown `id`, and how: `seenInstruction(id, runId, how)`. Answers the instruction as it stands. */
    seenInstruction: (id: string, runId: string, how: SeenHow): Result<Instr> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return attempt(sql, transaction, () => sawInstruction(instructionDeps(), id, runId, how));
    },
    /** The runs shown an instruction, and how ("Seen by S883 and S884"). */
    instructionSeen: (id: string) => instructionSeenBy(sql, id),
    /** One instruction by `IN4` or its row id, or null. */
    instruction: (id: string): Instr | null => instructionOf(sql, id),
    /**
     * A job ended: each instruction it carried that is still open is answered for it from how it ended
     * (`settleJobInstructions`). Answers how many moved; never fails the caller.
     */
    settleJob: (job: string): number => {
      if (schemaRefusal(state)) return 0;
      try {
        return transaction(() => settleJobInstructions(instructionDeps(), job));
      } catch {
        return 0;
      }
    },
    /**
     * A question answered on his order: the answer spent on the instruction, by the run, and the decision said as
     * his order's, by him. The record answered the question as him first; this keeps the two lines, in one go.
     */
    keepOrderAnswer: (k: { instruction: Instr; question: string; run: string; decision: string; by: string; byName: string; batch?: string | undefined }): void =>
      transaction(() => keepOrderAnswer({ sql, now: clock.now(), mint }, k)),
    /** A question a run answered on his word (`said`): the decision said as given on it, by him, with his words. */
    keepWordAnswer: (k: { run: string; decision: string; by: string; byName: string; said: string; batch?: string | undefined }): void =>
      transaction(() => keepWordAnswer({ sql, now: clock.now(), mint }, k)),
    /**
     * The bridge says run `runId`'s session is open: `pulseRun(runId, at, seat)`, `at` in milliseconds and the record's
     * clock when left out. Moves `pulse_at` in place, no version and no event; answers whether it moved (`presence.ts`).
     * `seat` is the profile the bridge's headers name (migration 44), written once onto a run that has none.
     */
    pulseRun: (runId: string, at?: number, seat?: string | null): boolean => {
      if (schemaRefusal(state)) return false;
      const run = instructedRun(sql, runId);
      if (run === null) return false;
      if (typeof seat === 'string' && seat.trim() !== '' && runRegister().has('seat')) seatRun(sql, run.id, seat.trim());
      return pulseRun(sql, run.id, at ?? clock.now());
    },
    /** What stops run `runId`, or null: `stopOf(runId) → null | {kind, id, said}`. A helper obeys its parent's. */
    stopOf: (runId: string): Stop | null => runStopOf(sql, runId),
    /** Run `runId`'s version stamp, which moves with anything for it: `stampFor(runId) → string`. */
    stampFor: (runId: string): string => instructionStamp(sql, runId, clock.now()),
    /** What moved for run `runId` since `stamp`: `changedSince(runId, stamp) → Delta`. */
    changedSince: (runId: string, stamp: string): Delta => instructionsChangedSince(sql, runId, typeof stamp === 'string' ? stamp : '', clock.now()),
    /** The sessions open now, for `presence`, newest heard from first. */
    presentRuns: () => presentRuns(sql, clock.now()),
    /** When each of the runs `ids` last came back to `active` from an end or a rest: `revivedAt(ids) → Map<id, iso>`. */
    revivedAt: (ids: readonly string[]): Map<string, string> => revivedAt(sql, ids),
    /** The settings row an agent works under: `profileFor({kind, token, host, seat}) → Profile`. */
    profileFor: (who: ProfileWho): Profile => profileMatching(sql, who ?? {}),
    /** Every live settings row, Defaults first; retired ones too when asked. */
    agentProfiles: (retired = false): Profile[] => readProfiles(sql, retired),
    /** One settings row by id, or null. */
    agentProfile: (id: string): Profile | null => profileById(sql, id),
    /** He makes, changes or retires a settings row: `setProfile(row, by) → Result<Profile>`, `by` a person's id. */
    setProfile: (row: ProfileRow, by: string): Result<Profile> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return writeProfile({ sql, now: instant(clock.now()), mint }, row, by);
    },
    findRun,
    /** Whether a line of the log is the record's own bookkeeping, which a feed leaves out and the log keeps. Reads only. */
    bookkeeping,
    keyState,
    /** A row as a person says it, `S42` or `things#3`, from its id. */
    nameOf,
    create: (register: string, fields: Patch, w: WriteContext) => {
      const made = write(register, null, fields, w);
      /* AN ACCOUNT ADDED IS OFFERED AT ONCE on the open "which account" question over its list. */
      if (made.ok) offerAgain(ingestDeps(), register);
      return made;
    },
    /* AND AN ACCOUNT EDITED IS OFFERED AGAIN AS IT NOW IS: digits put on it by hand were offered as "nothing yet" by a
       question filed before, and the answer was then refused for the digits the option said were not there. */
    update: (register: string, ref: string, patch: Patch, w: WriteContext) => {
      const made = write(register, ref, patch, w);
      if (made.ok) offerAgain(ingestDeps(), register);
      return made;
    },
    /* Four arguments and no fifth: a `Door` is the kernel's own to open. */
    write: (register: string, ref: string | null, patch: Patch, w: WriteContext) => write(register, ref, patch, w),

    /**
     * Run an automation now: the canvas's button, and the `manual` trigger's only door (§4.1).
     *
     * ONLY A RULE THAT SAYS `on: { manual: true }`. A button on a clock rule would be a second clock nobody declared,
     * and one on a write rule would be a run with no row to be about. The run is armed for now and its steps are taken
     * by the next drain, as every other trigger's are. Who may press it is the host's to decide.
     */
    automationRun: (rule: string, actor: string): Result<{ run: string }> =>
      transaction(() => {
        const id = rule.startsWith('rule.') ? rule.slice('rule.'.length) : rule;
        const found = installedFlows(sql).find((r) => r.id === id);
        if (!found) return no<{ run: string }>('DECLARATION_UNKNOWN', `There is no automation called rule.${id}.`, { at: 'rule' });
        if (triggerOf(found.body) !== 'manual')
          return no<{ run: string }>('DECLARATION_INVALID', `rule.${id} is started by ${triggerOf(found.body)}, not by a button. Give it on: { manual: true }.`, { at: 'on' });
        return startRun(flowDeps(), found, { kind: 'manual' }, { actor });
      }),

    /** Stop a run that has not finished. A run cancelled while it waits does not resume. */
    cancelRun: (run: string, actor: string) => transaction(() => cancelRun(flowDeps(), run, actor)),

    /** Start a finished run again, under the rule as installed now, with the trigger the first one had (`flow.ts`). */
    retryRun: (run: string, actor: string) => transaction(() => retryFlowRun(flowDeps(), run, actor)),

    /**
     * The hold the Directory's ledger puts on this record's automations at its monthly allowance, handed in by the host
     * (`@braindog/host/actions` `holdAutomations`); `null` lifts it. Kept in memory only, because the host asks again.
     */
    holdRuns: (hold: { until: number; say: string } | null): void => {
      runsHeld = hold;
    },

    /**
     * Take an automation's steps over a sample, and say what each did, with nothing kept (`flow-try.ts`).
     *
     * INSIDE `rehearse` AND NOWHERE ELSE, so the sample row, the run, its steps and whatever they queued all roll back
     * together. HERE AND NOT UNDER `api/`, because the runner's dependencies are this closure's `flowDeps` and
     * `KernelParts` does not carry them; `parts` is read when this is called, after it is built. The body is linted by
     * the caller first (`checkAutomation`); the runner meets a body it cannot read as a failed step.
     */
    tryAutomation: (body: FlowDecl, sample: TrySample, actor: string, o?: TryOptions): Result<Tried> =>
      rehearsal(parts).rehearse(() => {
        const trial: FlowDeps = { ...flowDeps(), trial: body };
        const io = { get: (ref: string) => get(ref), create: (register: string, fields: Patch, by: string) => write(register, null, fields, { actor: by }) };
        const trigger = trialTrigger(trial, body, sample, io, actor);
        return trigger.ok ? tryRun(trial, body, trigger.value, actor, o) : trigger;
      }),

    /**
     * What undoing one write, one decision or one agent's run would put back, in names, with the hash `undoApply` takes
     * (`undo.ts`). Reads and writes nothing.
     */
    undoPlan: (scope: UndoScope, opts: UndoOptions = {}): Result<UndoPlan> => planUndo(sql, scope, opts),

    /**
     * Make ready the declarations an undo of `scope` would put back (`undoStaged` in `undo.ts`): each earlier body
     * checked and hashed through `stageInstall`, nothing written. Its answer is `undoApply`'s last argument, and the
     * caller calls `reload()` after the transaction when anything was made ready, as after any staged write.
     */
    async undoStage(scope: UndoScope, opts: UndoOptions = {}): Promise<Result<UndoDeclared>> {
      return stageUndo(sql, (batch) => this.stageInstall(batch), scope, opts);
    },

    /**
     * Put back what `undoPlan` showed, as `actor`, while `hash` is still what it would do. One transaction and one batch,
     * through the record's own write path, and the ladder told of every batch put back (`undone`). HERE AND NOT UNDER
     * `api/`, like `tryAutomation`: `parts` is read when this is called, after it is built.
     */
    undoApply: (scope: UndoScope, hash: string, actor: string, opts: UndoOptions = {}, declared?: UndoDeclared): Result<UndoApplied> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      /* A MOVE ONLY A DECISION MAKES, put back by undoing that decision, goes through a decision's door. */
      return applyUndo({ ...parts, decidedWrite: (register, ref, patch, w) => write(register, ref, patch, w, { decided: true }), askMail: askMailAgain }, scope, hash, actor, opts, declared);
    },

    /**
     * One bounded slice of the walk over what the record already holds: payees, runs and services linked (`backfill.ts`).
     * `dry: true` walks the same slice and writes nothing: the counts as the walk would leave them, and its first few
     * writes in names (`BackfillPlanned`), every one rolled back.
     */
    backfill: (opts: BackfillOptions & { dry?: boolean } = {}): Backfilled & { dry?: true; planned?: BackfillPlanned[] } => {
      const { dry, ...walk } = opts;
      return dry === true ? dryBackfill(walk) : understandBackfill(backfillDeps(), walk);
    },

    /** Put back one batch the walk wrote; a second undo of the same batch puts nothing back. */
    undoBackfill: (batch: string, by: string): Result<{ undone: number; batch: string | null }> => {
      const barred = schemaRefusal(state);
      if (barred) return barred;
      return undoBackfill(backfillDeps(), batch, by);
    },
  };

  /** What the walk over the past writes through: this record's parts and its live lists. */
  const backfillDeps = (): BackfillDeps => ({ sql, clock, mint, transaction, write: kernel.write, registers: () => registers });

  /**
   * THE WALK, WRITING NOTHING. It runs whole inside one attempt that then refuses (`tx.ts`), so every write it made to
   * count is rolled back on every host, and the first few are said in names while the rows they made are still there to
   * be named. A batch it minted names nothing once rolled back, so none is answered.
   */
  function dryBackfill(opts: BackfillOptions): Backfilled & { dry: true; planned: BackfillPlanned[] } {
    const deps = backfillDeps();
    const planned: BackfillPlanned[] = [];
    let walked: Backfilled | null = null;
    const write: BackfillDeps['write'] = (register, ref, patch, w) => {
      const was = ref === null ? null : titleOfRow(ref);
      const done = deps.write(register, ref, patch, w);
      if (done.ok && planned.length < BACKFILL_PLANNED) planned.push(plannedOf(register, ref === null ? null : (was ?? titleOfRow(done.value.id)), patch, w.stamp));
      return done;
    };
    attempt(sql, transaction, () => {
      walked = understandBackfill({ ...deps, write }, opts);
      return no('VALUE_MALFORMED', 'A dry walk writes nothing.');
    });
    const out = walked as Backfilled | null;
    if (out === null) throw new TypeError('the dry walk answered nothing');
    const unbatched = <S extends { batch: string | null }>(slice: S): S => ({ ...slice, batch: null });
    return { ...out, ledger: unbatched(out.ledger), runs: unbatched(out.runs), services: unbatched(out.services), dry: true, planned };
  }

  /**
   * One write the walk would make, as a person reads it: the list by its name, the row by its title (`null` for a new
   * one), and each field by its label with a link said as the title of the row it points at. A secret, a file and the
   * identity keys a person or an organisation is joined on (`identity-keys.ts`) are never said.
   *
   * A RUN IS PLACED BY A STAMP AND NOT A PATCH (`project` is the record's own field), so its placement is said from the
   * stamp: the project's name under Project. Without it a dry walk's placement read as a write that changed nothing.
   */
  function plannedOf(register: string, row: string | null, patch: Patch, stamp?: Record<string, Json>): BackfillPlanned {
    const decl = registers.get(register);
    const lists = [...registers.values()];
    const keyed = [meetsRole(lists), orgRole(lists)].flatMap((r) => (r?.register === register && r.fields.keys !== undefined ? [r.fields.keys] : []));
    const fields: Record<string, Json> = {};
    for (const [id, value] of Object.entries(patch)) {
      const spec = decl?.fields.find((f) => f.id === id);
      const type = spec?.type === 'list' ? spec.of : spec?.type;
      if (type === 'secret' || type === 'file' || keyed.includes(id)) continue;
      const label = typeof spec?.label === 'string' && spec.label.trim() !== '' ? spec.label.trim() : id;
      const named = (v: unknown): Json => (type === 'ref' && typeof v === 'string' ? (titleOfRow(v) ?? null) : ((v ?? null) as Json));
      fields[label] = Array.isArray(value) ? value.map(named) : named(value);
    }
    const project = stamp?.project;
    if (typeof project === 'string' && project.trim() !== '') {
      const spec = decl?.fields.find((f) => f.id === 'project');
      fields[typeof spec?.label === 'string' && spec.label.trim() !== '' ? spec.label.trim() : 'Project'] = titleOfRow(project) ?? null;
    }
    return { list: decl?.name ?? register, row, fields };
  }

  /**
   * The closure's own functions, for the methods written under `api/` (`parts.ts` says why each is there).
   *
   * THE SAME FUNCTIONS AND NOT COPIES, so an extension's write is this record's write, with every check, event and rule
   * the kernel's own methods get.
   */
  const parts: KernelParts = {
    sql,
    clock,
    mint,
    transaction,
    write: kernel.write,
    get,
    list,
    register: kernel.register,
    declarations: kernel.declarations,
    evalContext,
    appendEvent,
    observe: kernel.observe,
    reload,
    depth: () => depth,
    heldFacts,
    signedBy,
    foreignRun,
    caches: {
      save: () => ({ registers, prefixes, planned }),
      restore: (saved) => {
        ({ registers, prefixes, planned } = saved as { registers: Map<string, RegisterDecl>; prefixes: Map<string, string>; planned: PlannedRecord | null });
      },
    },
  };

  /**
   * The record's timezone as `Intl` can read it, `UTC` when it cannot: `armDerived`'s guard, for the signs' night.
   */
  function recordTz(): string {
    const tz = recordIdentity(sql)?.tz ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return tz;
    } catch {
      return 'UTC';
    }
  }

  /** The signs' nightly row, armed unless one is already waiting (`armDerived`'s `WHERE`, for the same reason). */
  function armSigns(): void {
    sql.exec(
      `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
       VALUES (?, ?, 'snapshot', ?, ?, 'pending', 0)
       ON CONFLICT (kind, key) DO UPDATE
         SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0
         WHERE schedule.state IN ('done', 'failed')`,
      mint(),
      instant(nextSignsDue(clock.now(), recordTz())),
      SIGNS_KEY,
      JSON.stringify({ signs: true }),
    );
  }

  /* THE RECORD'S VITAL SIGNS ARE READ EVERY NIGHT, armed as the record opens rather than by a declaration, because no
     pack declares them: every record has them (`signs.ts`). One `snapshot` row keyed `SIGNS_KEY`, like the ledger's
     night; armed only when none is waiting, so opening the record a thousand times moves nothing. */
  if (!state.refusal) armSigns();

  /* AN EXTENSION NEVER HIDES A METHOD OF THE KERNEL'S. The spread below lets the later name win without a word, so a
     file under `api/` that reused a name would quietly replace the method every caller already relies on. Asked once per
     record opened, over the handful of names the extensions add. */
  const added = extensions(parts);
  for (const name of Object.keys(added))
    if (Object.hasOwn(kernel, name)) throw new TypeError(`${name} is a kernel method and an extension, and the extension would hide it. Rename the extension.`);
  return { ...kernel, ...added };
}
export { kpisSource, type KpiAnswer, type KpiEvery, type KpiPoint } from './sources/kpis.ts';
export { KPIS_FOR, kpisFault, type KpisFor } from './block-keys.ts';
export { KPI_BIG_CHANGE, KPI_CHART_POINTS, KPI_KINDS, KPI_LATE_PERIODS, KPI_SOURCES, KPI_STALE_DAYS, KPI_TODAY_MOST, KPI_TODAY_PHONE, KPI_TREND_POINTS } from './kpi-rank.ts';
export { isMoneyUnit, kpiChart, kpiFix, kpiHeadline, kpiIsMoney, kpiKind, kpiLive, kpiRanked, kpiScore, kpiStale, kpiVerdict, kpisForToday } from './kpi-rank.ts';
export type { KpiCandidate, KpiChart, KpiChartKind, KpiFix, KpiGood, KpiKind, KpiMoney, KpiNow, KpiPick, KpiRow, KpiSource, KpiStale, KpiState, KpiTargetMark, KpiToday, KpiVerdict, KpiWhy } from './kpi-rank.ts';
