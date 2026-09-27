/**
 * The record's methods written outside `index.ts`: every file under `methods/`, gathered into the record's surface.
 *
 * ONE FILE PER UNIT, AND THIS FILE IS ONLY A LIST. A new record method is `methods/<unit>.ts`, exporting
 * `methods(deps: RecordDeps)` that returns the methods it adds; it is registered here with one import line and one
 * spread line, both inside the `METHODS` block, so two units adding methods in one workflow touch two lines of this file
 * and no line of `index.ts` (`loop/finish/contracts.md` §0 point 5).
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
import type { CallContext, Need } from '../index.ts';
import type { SlashDrafted, SlashPreviewer } from '../slash.ts';

/* METHODS: the imports, one line per file under this folder, named for the file. */
import { methods as agents } from './agents.ts';
import { methods as keys } from './keys.ts';
import { methods as automations } from './automations.ts';
import { methods as slashDraft } from './slash-draft.ts';
import { methods as comments } from './comments.ts';
import { methods as vaultPassphrase } from './vault-passphrase.ts';
import { methods as shares } from './shares.ts';
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
   * Slash's described path (`slashDrafted` in `index.ts`), which `slash-draft.ts` answers `slashDraft` with, because the
   * model, the reading of use and Slash's ledger are the record's and a method file is handed none of them. Absent,
   * `slashDraft` answers `NOT_IN_THIS_BUILD`.
   */
  slashDescribed?: (args: { asked: string; page?: string }, ctx: CallContext, preview: SlashPreviewer | null) => Promise<Result<SlashDrafted>>;
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
    /* END METHODS */
  };
}
