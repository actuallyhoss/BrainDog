/**
 * The record's job methods (`docs/30-BLUEPRINT.md` §5 JOBS): the owner's, in a browser,
 * and a runner's, for a machine enrolled as one.
 *
 * THE QUEUE IS THE KERNEL'S (`kernel.jobs`, `packages/kernel/src/jobs.ts`), and each method here is its door: the guard
 * its half of JOBS asks, and then the kernel's answer. Their route rows are in `packages/host/src/routes/agents.ts`.
 *
 * TWO HALVES, TWO GUARDS. `createJob`, `cancelJob`, `listJobs` and `jobEvents` are an owner's in a browser, as ADMIN is,
 * because starting a job starts a model run on the owner's own machine: `admin` refuses every token, so no agent starts
 * one over MCP, and the MCP tool list does not grow. An automation's step (the record's own `system` caller) passes the
 * same gate. `claimJob`, `postJobEvent` and `readCancel` are a runner's alone, which `runner` asks by the principal's
 * kind: a host builds that principal from the record's own device grant (`runnerContext` in `@braindog/host`) and never
 * from anything the caller sent, and every other guard in the record refuses it (`allows` in `index.ts`).
 *
 * THE LONG WAIT IS THE HOST'S. `claimJob` answers at once, a job or how long to wait; a host that holds the runner's
 * request open asks again until one arrives (`holdClaim` in `@braindog/host`), so no wait is ever held inside the record.
 */

import type { Refusal, Result } from '@braindog/ports';
import type { CancelRead, Cancelled, CreateJobArgs, JobEvents, JobRunner, JobsPage, PostJobEventArgs, Posted } from '@braindog/kernel';

import type { CallContext } from './index.ts';
import type { RecordDeps } from './methods/index.ts';

/** What every caller that is not an enrolled machine is told at the runner's three doors. */
const NOT_A_RUNNER: Refusal = {
  code: 'FORBIDDEN',
  fix: 'Only a machine enrolled as a runner claims and reports on jobs. Enrol one with braindog runner enrol.',
  at: 'principal',
};

export function methods(deps: RecordDeps) {
  const { kernel, admin, tail } = deps;

  /** The runner's guard: the machine a runner principal names, or the refusal every other caller gets. */
  const runner = (ctx: CallContext): Refusal | JobRunner => {
    const p = ctx.principal;
    return p.kind === 'runner' ? { id: p.id, name: p.name } : NOT_A_RUNNER;
  };
  const refused = (r: Refusal | JobRunner): r is Refusal => 'code' in r;

  return {
    /**
     * Start one job of a kind the owner approved. It waits for a machine, and is cancelled with a note if none takes it
     * in a day. `about` names the row it is about, by its spoken id; `machine` the machine it must run on and `seat` the
     * Claude Code profile it must run under, each by name (migration 44).
     */
    async createJob(args: CreateJobArgs, ctx: CallContext): Promise<Result<{ id: string }>> {
      const stop = admin(ctx, 'start a job');
      if (stop) return { ok: false, refusal: stop };
      return tail(kernel.jobs.create(args ?? {}));
    },

    /** Stop one job: at once while it waits, and by a flag its runner reads while a machine runs it. */
    async cancelJob(args: { id?: unknown }, ctx: CallContext): Promise<Result<Cancelled>> {
      const stop = admin(ctx, 'stop a job');
      if (stop) return { ok: false, refusal: stop };
      const out = kernel.jobs.cancel(args ?? {});
      /* A JOB STOPPED BEFORE A MACHINE TOOK IT answers what it carried at once (`settleJob`); one running is answered
         when its runner ends it. */
      if (out.ok && out.value.status === 'cancelled') kernel.settleJob(out.value.id);
      return tail(out);
    },

    /** The jobs on this record, newest first, in one state or all of them, a page at a time. */
    async listJobs(args: { status?: unknown; limit?: unknown; cursor?: unknown }, ctx: CallContext): Promise<Result<JobsPage>> {
      const stop = admin(ctx, 'read the jobs');
      if (stop) return { ok: false, refusal: stop };
      return kernel.jobs.list(args ?? {});
    },

    /** What one job has done since a line you name, and whether it is still running: the job view's poll. */
    async jobEvents(args: { id?: unknown; after?: unknown }, ctx: CallContext): Promise<Result<JobEvents>> {
      const stop = admin(ctx, "read a job's transcript");
      if (stop) return { ok: false, refusal: stop };
      return kernel.jobs.events(args ?? {});
    },

    /**
     * A runner takes the oldest queued job it can run where it is, with a lease it renews as it reports and a bearer for
     * the record's MCP door, or is told how long to wait before asking again. `wait` is the host's to hold, and this
     * answers at once. `host` is the machine the runner is on, as runs name it, and `seats` the Claude Code profiles it
     * can start a run under, by name: a job placed on a machine or a profile goes only to a runner that says it.
     */
    /* THE ANSWER IS TYPED FROM `kernel.jobs.claim` AND NOT BY NAME, because `@braindog/kernel` already exports a
       `Claimed` (the scheduler's, `schedule.ts`), so the job's own `Claimed` cannot be exported under that name too. */
    async claimJob(
      args: { wait?: unknown; host?: unknown; seats?: unknown; repos?: unknown } | undefined,
      ctx: CallContext,
    ): Promise<Awaited<ReturnType<RecordDeps['kernel']['jobs']['claim']>>> {
      const machine = runner(ctx);
      if (refused(machine)) return { ok: false, refusal: machine };
      return tail(await kernel.jobs.claim(machine, { host: args?.host, seats: args?.seats, repos: args?.repos }));
    },

    /** A runner reports the next line of the job it holds, and learns whether it was stopped. */
    async postJobEvent(args: PostJobEventArgs, ctx: CallContext): Promise<Result<Posted>> {
      const machine = runner(ctx);
      if (refused(machine)) return { ok: false, refusal: machine };
      const out = kernel.jobs.post(machine, args ?? {});
      /* ITS END ANSWERS WHAT IT CARRIED that its run left open, from what the run said last (`settleJob`). */
      if (out.ok && args?.kind === 'end' && typeof args.job_id === 'string') kernel.settleJob(args.job_id);
      return tail(out);
    },

    /** A runner asks whether its job was stopped, and renews its lease by asking. */
    async readCancel(args: { job_id?: unknown }, ctx: CallContext): Promise<Result<CancelRead>> {
      const machine = runner(ctx);
      if (refused(machine)) return { ok: false, refusal: machine };
      return kernel.jobs.readCancel(machine, args ?? {});
    },
  };
}
