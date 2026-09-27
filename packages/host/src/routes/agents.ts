/**
 * The route rows for the record's agent methods (`packages/record/src/methods/agents.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * THE JOB ROWS ARE HERE ON AGT-7'S BEHALF (`loop/finish/contracts.md` §3.1), and their methods are in
 * `packages/record/src/jobs.ts`, not beside `triage`. `docs/30-BLUEPRINT.md` §5 has named every one of them since tier C
 * was written; a record without them answers each `NOT_IN_THIS_BUILD` through `handlersFor`, never a 500.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'usedBy', group: 'READ+', writes: false, what: 'Which runs used one key or one tool, the one that used it last first, each with its agent, its machine, when and how often.',
    takes: { spoken: 'text' } },
  { name: 'triage', group: 'DATA', writes: true, what: 'File one arrival from the inbox as a row, or set it aside.' },
  { name: 'createJob', group: 'JOBS', writes: true, what: 'Start one job of a kind the owner approved. It waits in the queue until a runner claims it.' },
  { name: 'cancelJob', group: 'JOBS', writes: true, what: 'Stop one job. A runner working on it reads the stop and ends it.' },
  { name: 'listJobs', group: 'JOBS', writes: false, what: 'The jobs on this record, newest first, in one state or all of them, a page at a time.',
    takes: { status: 'text', limit: 'integer', cursor: 'text' } },
  { name: 'jobEvents', group: 'JOBS', writes: false, what: 'What one job has done since a step you name, and whether it is still running.',
    takes: { id: 'text', after: 'integer' } },
  { name: 'claimJob', group: 'JOBS', writes: true, what: 'A runner takes the next queued job, with a lease it renews as it reports. A runner only.' },
  { name: 'postJobEvent', group: 'JOBS', writes: true, what: 'A runner reports one step of its job, in order, and learns whether the job was stopped. A runner only.' },
  { name: 'readCancel', group: 'JOBS', writes: true, what: 'A runner asks whether its job was stopped, and renews its lease. A runner only.' },
];
