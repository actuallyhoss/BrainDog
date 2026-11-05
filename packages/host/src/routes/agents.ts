/**
 * The route rows for the record's agent methods (`packages/record/src/methods/agents.ts`), and for what he tells them
 * and the settings they work under (`methods/instructions.ts`, `methods/agent-profile.ts`, agents and MCP plan §8.2).
 *
 * `pulse`, `instruct`, `withdrawInstruction` AND `instructionsMine` ARE DATA: `pulse` is `beat`'s sibling, a session
 * saying it is open, and `instructionsMine` an agent reading and answering its own; `instruct` and its withdrawal are a
 * person's, every token refused `NEEDS_BROWSER_SESSION` by the record. `presence`, `instructionList` and `agentProfiles`
 * are READ+, the last two the owner's. `setAgentProfile` is ADMIN: only he changes what an agent may do, in a browser.
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `end` IS A DATA WRITE, as `attach` and `handoff` are in `index.ts`: a token's call needing `propose`, the end hook's
 * one write, and the record picks the state. `beat` IS ONE TOO, in the same group for the same caller, though it changes
 * no version and writes no history: a session saying it is still working moves its run's clock in place.
 *
 * `offered` IS THE AGENT DOOR'S LIST OF RESOURCES IN ONE READ (`packages/record/src/methods/offered.ts`): what
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
  { name: 'pulse', group: 'DATA', writes: true, what: 'Say this agent’s session is open, and hear what is pending for its run and whether it is stopped. Nothing is added to its history. An agent only.' },
  { name: 'presence', group: 'READ+', writes: false, what: 'The sessions open now: each agent, its machine, project, branch, what it is doing, what it holds, and how long since it was heard.',
    takes: { project: 'text', repo: 'text' } },
  { name: 'instruct', group: 'DATA', writes: true, what: 'Tell an agent something: a run, a kind of agent, whoever is next, or a task; or stop, pause, resume or redirect a run. A person only.' },
  { name: 'withdrawInstruction', group: 'DATA', writes: true, what: 'Take back an instruction no run has taken yet. A person only.' },
  { name: 'closeInstruction', group: 'DATA', writes: true, what: 'Close an instruction that is finished, which takes it off the list. A person only.', takes: { id: 'text' } },
  { name: 'instructionList', group: 'READ+', writes: false, what: 'What you told agents, newest first: each with who saw it and how, the reply, and what the run changed. The owner only.',
    takes: { state: 'text', project: 'text', task: 'text', run: 'text', limit: 'integer', cursor: 'text' } },
  { name: 'sendTargets', group: 'READ+', writes: false, what: 'Who you can send a request to from a row now: Slash, Claude on each machine heard from in two minutes, each session open now, and whoever starts next. The owner only.',
    takes: { row: 'text', project: 'text' } },
  { name: 'sendTo', group: 'DATA', writes: true, what: 'Send one request from a row to Slash, Claude on a machine, a session open now or whoever starts next, with the rows it carries and whether it may change files. A person only.' },
  { name: 'sent', group: 'READ+', writes: false, what: 'One request you sent: where it went, its state and reply, who saw it, what it is doing now, and what it changed. The owner only.',
    takes: { id: 'text' } },
  { name: 'sentList', group: 'READ+', writes: false, what: 'What you sent that is still in flight, newest first, or every request about one row from the last week. The owner only.',
    takes: { row: 'text', open: 'text' } },
  { name: 'sendWithdraw', group: 'DATA', writes: true, what: 'Take back a request you sent: one no run has taken is withdrawn, and one a machine is working on is stopped. A person only.' },
  { name: 'sendReply', group: 'DATA', writes: true, what: 'Follow up a request you sent with a few more words, to the same run while it is open, else the same way the first went. A person only.' },
  { name: 'instructionsMine', group: 'DATA', writes: true, what: 'An agent reads what it was told and marks it seen, takes one, or answers one with done, needs_you or declined. An agent only.' },
  { name: 'agentProfiles', group: 'READ+', writes: false, what: 'The settings each kind of agent works under, with what each lets it do and when it was last heard. The owner only.',
    takes: { retired: 'json' } },
  { name: 'setAgentProfile', group: 'ADMIN', writes: true, what: 'Make, change or retire one agent’s settings: how far it may go, where, which tools, its brief. The owner, signed in.' },
  { name: 'createJob', group: 'JOBS', writes: true, what: 'Start one job of a kind the owner approved. It waits in the queue until a runner claims it.' },
  { name: 'cancelJob', group: 'JOBS', writes: true, what: 'Stop one job. A runner working on it reads the stop and ends it.' },
  { name: 'listJobs', group: 'JOBS', writes: false, what: 'The jobs here, newest first, in one state or all of them, a page at a time.',
    takes: { status: 'text', limit: 'integer', cursor: 'text' } },
  { name: 'jobEvents', group: 'JOBS', writes: false, what: 'What one job has done since a step you name, and whether it is still running.',
    takes: { id: 'text', after: 'integer' } },
  { name: 'claimJob', group: 'JOBS', writes: true, what: 'A runner takes the next queued job, with a lease it renews as it reports. A runner only.' },
  { name: 'postJobEvent', group: 'JOBS', writes: true, what: 'A runner reports one step of its job, in order, and learns whether the job was stopped. A runner only.' },
  { name: 'readCancel', group: 'JOBS', writes: true, what: 'A runner asks whether its job was stopped, and renews its lease. A runner only.' },
];
