/**
 * Run one scheduled action now: `actionRun({ ingest })`, the Run now on a `pull`, `call` or `poll`.
 *
 * THE PRESS MAKES NO REQUEST. The kernel's `nudgeAction` moves the action's pending schedule row to now and writes one
 * event naming the action and who pressed; `tail`, which follows every write here, re-arms the alarm from the schedule,
 * so the alarm rings at once and fires the row like any other due run. That run is metered, held at the plan's limit and
 * paused on a refused key by the runner, as a scheduled one is, because it is one.
 *
 * WHO MAY PRESS. An owner in a browser, as `resumeAction` and `automationRun` are (ADMIN in what they ask), or a token
 * whose agent may write in the action's project: `write` on the list the project row lives in, and on that row when the
 * grant is narrowed to some rows. An action for every project asks `write` on the record. A token never reaches a paused
 * action through this: a pause is answered in its own sentence and only `resumeAction` starts it again.
 *
 * THE RATE IS THE KERNEL'S (`nudgeRate`), one press an action a minute and twenty a record an hour, answered
 * `RATE_LIMITED` with `retry_after`, which the host sends as a 429 with `Retry-After`.
 *
 * `nudgeAction` IS HANDED IN until `@braindog/kernel` exports it; a record built without it answers `NOT_IN_THIS_BUILD`.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { ulids } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What a press answers: the action, and the instant its run is now due. */
export type ActionRan = { ingest: string; due_at: string };

/** The kernel's press (`packages/kernel/src/nudge.ts`), by its signature. */
export type NudgeAction = (deps: { sql: Sql; nowMs: number; mint: () => string }, ingest: string, actor: string) => Result<ActionRan>;

const TAKES = ['ingest'] as const;

export function methods(deps: RecordDeps & { nudgeAction?: NudgeAction | undefined }) {
  const { kernel, sql, guard, scoped, admin, no, tail, clock } = deps;
  const mint = ulids(() => clock.now());

  /** Who a press is signed by: the person, or the person a token was minted for (`actorOf` in `index.ts`). */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /** The project an action's declaration names, or `null` for one that runs for every project or names none. */
  const projectOf = (ingest: string): string | null => {
    const body = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE kind = 'ingest' AND id = ? AND superseded_at IS NULL AND retired = 0",
      `ingest.${ingest}`,
    )?.body;
    const project = body === undefined ? undefined : (JSON.parse(body) as { project?: unknown }).project;
    return typeof project === 'string' && project !== '' && project !== 'global' ? project : null;
  };

  /**
   * Whether this token may write in the action's project: the project row's list at `write`, and the row itself when the
   * grant names only some rows, asked as `get` asks it. A project that names no row, and an action for every project,
   * ask `write` on the record.
   */
  const reaches = (ctx: CallContext, ingest: string): Refusal | null => {
    /* AND THE LIST THE ACTION WRITES, which the project's list alone never asked: a key that writes Projects ran an action
       that writes the Ledger. */
    const body = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE kind = 'ingest' AND id = ? AND superseded_at IS NULL AND retired = 0",
      `ingest.${ingest}`,
    )?.body;
    const writes = body === undefined ? undefined : (JSON.parse(body) as { writes?: { register?: unknown } }).writes?.register;
    if (typeof writes === 'string') {
      const held = guard(ctx, 'write', writes);
      if (held) return held;
    }
    const project = projectOf(ingest);
    const row = project === null ? null : kernel.get(project);
    if (row === null) return guard(ctx, 'write');
    const stop = guard(ctx, 'write', row.register);
    if (stop) return stop;
    const rule = kernel.scope(ctx, row.register);
    if (rule === undefined || row.seq === null) return null;
    const found = kernel.list({ register: row.register, where: { field: 'seq', is: row.seq }, includeDeleted: true, limit: 1 }, rule);
    return found.ok && found.value.rows.length > 0
      ? null
      : { code: 'FORBIDDEN', fix: `This key may not write in the project ${ingest} runs for, so it cannot run it now.`, at: 'ingest' };
  };

  return {
    async actionRun(args: { ingest?: unknown } | undefined, ctx: CallContext): Promise<Result<ActionRan>> {
      const stop = scoped(ctx, 'write') ?? (ctx.principal.kind === 'token' ? null : admin(ctx, 'run an action now'));
      if (stop) return { ok: false as const, refusal: stop };
      const extra = Object.keys(args ?? {}).find((k) => !(TAKES as readonly string[]).includes(k));
      if (extra !== undefined)
        return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes ${TAKES.join(', ')}.`, { at: extra, allowed: [...TAKES] });
      if (typeof args?.ingest !== 'string' || args.ingest === '') return no('REQUIRED_MISSING', 'Which action? Name it as Scheduled does.', { at: 'ingest' });
      const ingest = args.ingest;
      if (ctx.principal.kind === 'token') {
        const far = reaches(ctx, ingest);
        if (far) return { ok: false as const, refusal: far };
      }
      if (deps.nudgeAction === undefined) return no('NOT_IN_THIS_BUILD', 'Run now is not in this build yet. The action still runs on its own schedule.', { at: 'host' });
      return tail(deps.nudgeAction({ sql, nowMs: clock.now(), mint }, ingest, actorOf(ctx)));
    },
  };
}
