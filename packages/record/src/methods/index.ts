/**
 * The record's methods written outside `index.ts`: every file under `methods/`, gathered into the record's surface.
 *
 * ONE FILE PER UNIT, AND THIS FILE IS ONLY A LIST. A new record method is `methods/<unit>.ts`, exporting
 * `methods(deps: RecordDeps)` that returns the methods it adds; it is registered here with one import line and one
 * spread line, both inside the `METHODS` block, so two changes adding methods at once touch two lines of this file and
 * no line of `index.ts`.
 *
 * THE SHAPE A METHOD IS WRITTEN IN IS THE SHAPE THE GATES READ. Each is a method of the object its file returns, at four
 * spaces, and its first statement is its group's guard: `admin(ctx` for ADMIN, `vault(ctx` for VAULT, `guard(` or
 * `scoped(ctx` for READ+ and DATA (`tools/gates/guards.mjs`). A routed method's row is in `host/src/routes/<unit>.ts`
 * under the same name. A name `index.ts` or another file here already has is refused by the `guards` gate, because the
 * spread would otherwise let one hide the other.
 */

import type { Clock, Refusal, Sql, no } from '@braindog/ports';
import type { Result } from '@braindog/ports';
import type { Kernel } from '@braindog/kernel';

import type { Directory } from '../directory.ts';
import type { CallContext, Need, Understanding } from '../index.ts';
import type { SlashDrafted, SlashPreviewer } from '../slash.ts';

/* METHODS: the imports, one line per file under this folder, named for the file. */
import { methods as agents } from './agents.ts';
import { methods as keys } from './keys.ts';
import { methods as automations } from './automations.ts';
import { methods as slashDraft } from './slash-draft.ts';
import { methods as comments } from './comments.ts';
import { methods as vaultPassphrase } from './vault-passphrase.ts';
import { methods as shares } from './shares.ts';
import { methods as ownTokens } from './own-tokens.ts';
import { methods as quiet } from './quiet.ts';
import { methods as retype } from './retype.ts';
import { methods as pattern } from './pattern.ts';
import { methods as personName } from './person-name.ts';
import { methods as undo } from './undo.ts';
import { methods as understand } from './understand.ts';
import { methods as signs } from './signs.ts';
import { methods as inboxPatterns } from './inbox-patterns.ts';
import { methods as faults } from './faults.ts';
import { methods as withdraw } from './withdraw.ts';
import { methods as door } from './door.ts';
import { methods as engine } from './engine.ts';
import { methods as engineReadings } from './engine-readings.ts';
import { methods as pagesCensus } from './pages-census.ts';
import { methods as pageVersions } from './page-versions.ts';
import { methods as capture } from './capture.ts';
import { methods as shape } from './shape.ts';
import { methods as countBy } from './count-by.ts';
import { methods as trust } from './trust.ts';
import { methods as importsMethods } from './imports.ts';
import { methods as sameOne } from './same-one.ts';
import { methods as offered } from './offered.ts';
import { methods as heldTwice } from './held-twice.ts';
import { methods as about } from './about.ts';
import { methods as briefing } from './briefing.ts';
import { methods as exceptions } from './exceptions.ts';
import { methods as matched } from './matched.ts';
import { methods as stale } from './stale.ts';
import { methods as learnings } from './learnings.ts';
import { methods as textFaults } from './text-faults.ts';
import { methods as learned } from './learned.ts';
import { methods as inboxHints } from './inbox-hints.ts';
import { methods as skillsBehindMethods } from './skills-behind.ts';
import { methods as toolsSeenMethods } from './tools-seen.ts';
import { methods as namedTwiceMethods } from './named-twice.ts';
import { methods as exportPack } from './export-pack.ts';
/* END METHODS */

/**
 * What a method file is handed: the record's kernel, its guards and its tail, the functions every method in `index.ts`
 * already calls, and never copies of them.
 */
export type RecordDeps = {
  kernel: Kernel;
  /** The record's storage, for a read the kernel has no method for. Every statement goes through it. */
  sql: Sql;
  /** The ladder, then the ceiling, for a need on the record or on one list (`index.ts`, `guard`). */
  guard: (ctx: CallContext, need: Need, asked?: string) => Refusal | null;
  /** The guard for a read that names no list and filters its answer by the caller's ceiling itself. */
  scoped: (ctx: CallContext, need: Need) => Refusal | null;
  /** Whether the caller may read one list's rows: what `list` asks, asked of every list an answer reads. */
  readable: (ctx: CallContext, register: string) => Refusal | null;
  /**
   * What one thing a comment may be on is called to this caller (a row by its spoken id, a question or a decision as
   * `nameOf` hands it), or `null` when she may not see it or it is not there (`index.ts`, `sightOf`).
   */
  sightOf: (ctx: CallContext, target: string) => string | null;
  /** An owner in a browser, and no token of any kind. */
  admin: (ctx: CallContext, reads?: string, method?: string) => Refusal | null;
  /** The vault's gate: an owner in a browser, proved within `FRESH`. */
  vault: (ctx: CallContext) => Refusal | null;
  /** A list named at all, and a row number that is one, before anything is looked up. */
  named: (args: unknown, seq?: boolean) => Refusal | null;
  no: typeof no;
  /** After every write: re-arm the alarm and ring the doorbell, so a method's write arms its reminders. */
  tail: <T>(out: T) => Promise<T>;
  /** The Directory when this host keeps it beside the record, and `null` on a host whose Directory is elsewhere. */
  directory: Directory | null;
  clock: Clock;
  /**
   * Marks the caller's key as having read words anybody could have written (`trust.markUntrusted`), as the Inbox read
   * marks its reader, so the ladder keeps such a run asking. `where` is said to the person. Absent, nothing is marked.
   */
  untrusted?: (ctx: CallContext, where: string) => void;
  /**
   * Slash's described path (`slashDrafted` in `index.ts`), which `slash-draft.ts` answers `slashDraft` with, because the
   * model, the reading of use and Slash's ledger are the record's and a method file is handed none of them. Absent,
   * `slashDraft` answers `NOT_IN_THIS_BUILD`.
   */
  slashDescribed?: (args: { asked: string; page?: string }, ctx: CallContext, preview: SlashPreviewer | null) => Promise<Result<SlashDrafted>>;
  /**
   * The next slice of the walk over what the record holds, looked at (`dry`) or done (`understandNow` in `index.ts`), which
   * `understand.ts` answers `understand` with, because the cursor the night keeps and Slash's filing are the record's.
   * Absent, `understand` answers `NOT_IN_THIS_BUILD` for anything but an undo.
   */
  understood?: (dry: boolean, ctx: CallContext) => Promise<Result<Understanding>>;
  /**
   * The batches the walk wrote, newest walk first, each with when (`walkedBatches` in `index.ts`), which
   * `understand({ undo: 'last' })` puts back. Absent, only an undo by its batch is taken.
   */
  walked?: () => { at: string; batches: string[] }[];
  /**
   * Whether the caller reads every list in the record (`readsEveryList` in `index.ts`), which `understandPlan` asks
   * before it answers in the names of every list. Absent, nobody is answered.
   */
  readsEveryList?: (ctx: CallContext) => boolean;
  /**
   * Which host keeps this record, as `Build.host` in `index.ts` says it, which `faults` asks before it shows the raw error
   * of a fault: only a self-host's owner reads it, because there the owner is the operator. Absent is the Cloud's answer.
   */
  host?: 'cloud' | 'self-host';
  /** Whether Slash's model answers (host `engine-health.ts`). Absent, `engineHealth` answers `null`. */
  engineHealth?: (() => Promise<import('./engine.ts').EngineHealthRead>) | undefined;
  /** Slash's ledger, the mentions and the open questions since an instant (host). Absent, `engineReadings` answers `null`. */
  engineLedger?: import('./engine-readings.ts').EngineLedgerRead | undefined;
  /** The host's own build and MIN_CLI (AGT-A02), which doorHealth answers and reads behind against. Absent, both are null. */
  doorBuild?: import('./door.ts').DoorBuild | (() => import('./door.ts').DoorBuild);
  /** The operator's cut-off (`TOKENS_VALID_FROM`, `53 §5.11`), so doorHealth counts no key or runner it ended. */
  validFrom?: (() => string | undefined) | undefined;
  /** The record's own checks on a new entry that `create` makes (`mergeShaped`, `keyHeld`, `huedOf` in `index.ts`), which `capture` asks of each entry. Absent, `capture` refuses only a merge. */
  createDoor?: import('./capture.ts').CreateDoor | undefined;
  /**
   * Whether every block of one page, drawn for this caller, is held from her (`drawnWithheld` in `index.ts`), which
   * `offered` asks only for somebody who does not read every list. Absent, such a caller is offered no page at all,
   * because a page nobody checked may open onto nothing.
   */
  withheld?: ((ctx: CallContext, slug: string) => boolean) | undefined;
};

export function methods(deps: RecordDeps) {
  return {
    /* METHODS: the spreads, one line per file, in the order of the imports above. */
    ...agents(deps),
    ...keys(deps),
    ...automations(deps),
    ...slashDraft(deps),
    ...comments(deps),
    ...vaultPassphrase(deps),
    ...shares(deps),
    ...ownTokens(deps),
    ...quiet(deps),
    ...retype(deps),
    ...pattern(deps),
    ...personName(deps),
    ...undo(deps),
    ...understand(deps),
    ...signs(deps),
    ...inboxPatterns(deps),
    ...faults(deps),
    ...withdraw(deps),
    ...door(deps),
    ...engine(deps),
    ...engineReadings(deps),
    ...pagesCensus(deps),
    ...pageVersions(deps),
    ...capture(deps),
    ...shape(deps),
    ...countBy(deps),
    ...trust(deps),
    ...importsMethods(deps),
    ...sameOne(deps),
    ...offered(deps),
    ...heldTwice(deps),
    ...about(deps),
    ...briefing(deps),
    ...exceptions(deps),
    ...matched(deps),
    ...stale(deps),
    ...learnings(deps),
    ...textFaults(deps),
    ...learned(deps),
    ...inboxHints(deps),
    ...skillsBehindMethods(deps),
    ...toolsSeenMethods(deps),
    ...namedTwiceMethods(deps),
    ...exportPack(deps),
    /* END METHODS */
  };
}
