/**
 * The route rows for the record's agent methods (`packages/record/src/methods/agents.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `end` IS A DATA WRITE, as `attach` and `handoff` are in `index.ts`: a token's call needing `propose`, the end hook's
 * one write, and the record picks the state. `beat` IS ONE TOO, in the same group for the same caller, though it changes
 * no version and writes no history: a session saying it is still working moves its run's clock in place (AGT-C03).
 *
 * `offered` IS THE AGENT DOOR'S LIST OF RESOURCES IN ONE READ (AGT-B04, `packages/record/src/methods/offered.ts`): what
 * an agent may read, decided by the check each address's own reader asks and never by running the read, so a session
 * starting on a large record lists its resources without drawing a page. It writes nothing.
 *
 * THE JOB ROWS ARE HERE, and their methods are in
 * `packages/record/src/jobs.ts`, not beside `triage`. `docs/30-BLUEPRINT.md` §5 has named every one of them since tier C
 * was written; a record without them answers each `NOT_IN_THIS_BUILD` through `handlersFor`, never a 500.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'usedBy', group: 'READ+', writes: false, what: 'Which runs used one key or one tool, the one that used it last first, each with its agent, its machine, when and how often.',
    takes: { spoken: 'text' } },
  { name: 'offered', group: 'READ+', writes: false, what: 'Everything you may read here, in one read: the fixed addresses, the lists, the pages, the figures, and the skills by name with when to use each. It changes nothing.' },
  { name: 'end', group: 'DATA', writes: true, what: 'Say this agent’s session closed. Its run ends as done, or waits for the next session when it left a fresh next step. An agent only.' },
  { name: 'beat', group: 'DATA', writes: true, what: 'Say this agent is still working between writes, so its run reads as working. Nothing is added to its history. An agent only.' },
  { name: 'triage', group: 'DATA', writes: true, what: 'File one arrival from the inbox as a row, set it aside, or put a filed or archived one back.' },
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
