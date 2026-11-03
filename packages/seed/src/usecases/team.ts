/**
 * Team board: a product team's tickets, who holds each one, the cycle it is in, and the work agents took.
 *
 * THE TICKETS ARE WORK'S TASKS. Since tasks carry an owner, an agent, a priority, a status to check and a done day, a
 * team's board is Work's list in a team's words: Tasks is called Tickets, and Open, Doing and To check read To do, In
 * progress and In review. What Work does not hold is this pack's: the cycles a team plans in, and a cycle plan saying
 * which tickets each cycle takes on and how many points each is worth. What agents did is read from the record's own
 * log, and their runs from the kernel's `session` list.
 *
 * A RECORD THAT HAD TEAM BEFORE 2.0.0 KEPT ITS OWN TICKETS LIST, and keeps it: the update installs it again under the
 * name Earlier tickets, so nothing it holds is lost, and copies each ticket to Tickets with its cycle and points on the
 * cycle plan (`moveTickets`).
 *
 * BACKLOG IS WORK'S OWN STATUS since 2.1.0, called Later on a record without Team, so a backlog ticket stays in the backlog.
 * A record that took 2.0.0 had its backlog tickets made To do, and the update puts them back (`backlogAgain`).
 */

import { projectTemplate } from '../modules/portfolio.ts';
import { counted } from './counted.ts';

type Body = Record<string, unknown>;

/** The lists a team's record holds, so the project page leaves out what reads money and services. */
const HOLDS = ['things', 'stages', 'people', 'tasks', 'tracks', 'updates', 'cycles', 'cycle_plan', 'cycle_days'];

/*
 * THE DOOR A NEW TEAM NEEDS, into Settings, Agents: the line to paste into Claude Code for this record, the real one
 * worked out there for this record and this machine, so Home never prints a line that goes stale.
 *
 * NO INVITATION ROW SINCE 2.21.0. It opened Settings, People, where a free record's invitation is refused, so every
 * fresh team record had a button on Home that ended in a refusal. Only the host knows whether this record takes a
 * second person (the record's `invitations`), and a block's `when:` reads a figure or the reader, never the host, so
 * the row cannot be drawn only where it works. The one row left says that a team of agents works on any record, and
 * nothing of people, since 2.22.0: "a team of people needs Cloud" sold what brain.dog does not.
 */
const CONNECT = '/settings/agents';

/* NO LABEL: the column over a ticket's title is headed by what one ticket is called, so a team that calls them Issues reads Issue. */
const TICKET = { field: 'what', width: 'minmax(20ch,1fr)' } as const;

/** A ticket still in play: not finished and not dropped. What Home's Due this week counts before it takes anything out. */
const LIVE = 'state is not done or dropped';

/**
 * A TICKET SOMEBODY IS ACTUALLY ON: in progress, or handed back to be checked.
 *
 * NAMED RATHER THAN SPELT, because Home's Due this week now says it is what is due and NOT this, and the two sentences
 * have to stay each other's opposite. They were one copy of one clause and a second copy each; a third drifting would
 * put a ticket back under two headings on this page without either heading changing.
 */
const IN_FLIGHT = 'state is doing or review';

/**
 * The script that keeps a planned ticket's tick the same as its ticket: every line of the cycle plan that names the
 * ticket is ticked when the ticket is done and unticked when it is not.
 *
 * THE TICKET IS READ AGAIN BEFORE ANYTHING MOVES, as Work's `close_follow_ups` reads its parent: the rule queues the
 * run and a host runs it later, so a ticket finished and reopened in between is open by the time this reads it, and
 * the line follows what the ticket is now. A line already right is left alone, so a run writes nothing twice.
 */
const PLAN_FOLLOWS_TICKET = `export default async function run(ctx) {
  const ticket = await ctx.record.get(ctx.input.id);
  if (!ticket) return;
  const done = ticket.fields.state === 'done';
  const lines = await ctx.record.list('cycle_plan', { all: [{ field: 'task', is: ticket.id }] });
  for (const line of lines)
    if ((line.fields.done === true) !== done) ctx.update('cycle_plan#' + line.seq, { done }, line.version);
}`;

/**
 * The script that writes the morning's cycle day: for each active cycle, how many of its planned lines are not ticked,
 * on the day it is where the record is (`ctx.today()`).
 *
 * ONE A DAY, WHOEVER WROTE IT. A cycle that already has a day for today, from this script or from a person, takes no
 * second one, and nor does a day somebody wrote with no cycle, so a second run the same morning writes nothing and a
 * host back from a night off writes today once rather than once for every night it missed. A missed morning stays
 * missed: the record keeps no history of the count, and writing today's count under yesterday's day would draw a line
 * that never happened.
 *
 * A LINE WHOSE TICKET IS ALREADY DONE IS TICKED HERE, AND NOT COUNTED. The ticket rules miss two: a ticket planned
 * after it was finished (no rule watches a line being written), and a ticket finished after rules have started
 * `plan_follows_ticket` its hundred times that day (`RULE_CALLS_PER_DAY`), which a busy team of agents reaches. The
 * morning only ticks: a line ticked by hand while its ticket is still open is somebody's call and is left alone.
 *
 * AT MOST FIFTY LINES ARE READ (a script's list is one page of the record's own), so a cycle with more than fifty
 * planned lines not ticked is counted as fifty.
 */
const CYCLE_DAY = `export default async function run(ctx) {
  const today = ctx.today();
  const cycles = await ctx.record.list('cycles', { all: [{ field: 'state', is: 'active' }] });
  if (cycles.length === 0) return;
  const written = await ctx.record.list('cycle_days', { all: [{ field: 'day', is: today }] });
  if (written.some((d) => !d.fields.cycle)) return;
  for (const cycle of cycles) {
    if (written.some((d) => d.fields.cycle === cycle.id)) continue;
    const lines = await ctx.record.list('cycle_plan', { all: [{ field: 'cycle', is: cycle.id }, { field: 'done', is: false }] });
    let open = 0;
    for (const line of lines) {
      const ticket = line.fields.task ? await ctx.record.get(line.fields.task) : null;
      if (ticket && ticket.fields.state === 'done') ctx.update('cycle_plan#' + line.seq, { done: true }, line.version);
      else open++;
    }
    ctx.write('cycle_days', { day: today, open, cycle: cycle.id });
  }
}`;

/** A script of the team's, as a pack document writes it: no egress, no keys, started by a rule. */
const teamScript = (script: string, title: string, reads: string[], writes: string[], source: string): Record<string, unknown> => ({
  script,
  title,
  pack: 'usecase-team',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads,
  writes,
  source,
});

/**
 * THE TEAM'S AUTOMATIONS, IN 2.21.0: the burn-down fills itself. Three rules and the two scripts they start, in the
 * pack document's own form (the kind first), as Work's are (`WORK_AUTOMATIONS` in `../modules/work.ts`), so a record
 * with no agent at all keeps its cycle's progress and its morning count.
 *
 * A TICKET IS ONE OF WORK'S TASKS (`TICKETS_MOVED_IN`), so the two rules on a ticket are rules on `tasks`, and both ask
 * for `op: [update]` and `fields: [state]`, so an edit to a ticket's words starts nothing. Finishing a ticket ticks the
 * lines that plan it; moving it anywhere else unticks them, which is what reopening is, and a run that finds nothing
 * ticked writes nothing. Both start the same script, since ticking and unticking are one question: is the ticket done.
 *
 * THE MORNING IS A CLOCK RULE (`on: { every: '1d', at: '06:00' }`, `firstDue` and `onClock` in
 * `packages/kernel/src/flow.ts`), at six where the record is. It asks nothing and sends nothing: it writes one row.
 */
export const TEAM_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'ticket_done_ticks_plan',
    pack: 'usecase-team',
    on: { written: { register: 'tasks', op: ['update'], fields: ['state'] } },
    when: 'state is done',
    steps: [{ script: { id: 'plan_follows_ticket', as: 'ticking' } }],
  },
  {
    rule: 'ticket_reopened_unticks_plan',
    pack: 'usecase-team',
    on: { written: { register: 'tasks', op: ['update'], fields: ['state'] } },
    when: 'state is not done',
    steps: [{ script: { id: 'plan_follows_ticket', as: 'unticking' } }],
  },
  {
    rule: 'cycle_day_each_morning',
    pack: 'usecase-team',
    on: { every: '1d', at: '06:00' },
    steps: [{ script: { id: 'cycle_day', as: 'counting' } }],
  },
  teamScript('plan_follows_ticket', 'Tick a planned ticket when its ticket is done', ['tasks', 'cycle_plan'], ['cycle_plan'], PLAN_FOLLOWS_TICKET),
  teamScript('cycle_day', "Count the sprint's open tickets each morning", ['cycles', 'cycle_plan', 'cycle_days', 'tasks'], ['cycle_plan', 'cycle_days'], CYCLE_DAY),
];

export const TEAM = {
  usecase: 'team',
  /* 2.2.0: a page for each product or project in play, from Projects' template. */
  /* 2.4.0: Home's three headings stop drawing one ticket twice, and In flight says when each of its tickets is due. */
  /* 2.4.1: Home's empty title loses its full stop, as every other title already has. */
  /* 2.5.0: the project page takes Portfolio 1.5.0's project template: the questions waiting on a project, what
     changed on it, its plan and its money by month. */
  /* 2.6.0: Home leads with what agents suggest, draws who is on each ticket in flight and whether an agent is working
     on it now, the cycle's progress beside its burndown, and the two ways into Settings a new team needs. A planned
     ticket can be ticked done, and a new list, Cycle days, holds how many tickets were open each morning. Agent work
     reads the runs the record knows are live rather than the `session` list.
     2.7.0: a project's page takes Projects' new layout, its figures and what it runs on in a rail beside the main
     column, and one sentence said from its figures first (through `projectTemplate` in `../modules/
     portfolio.ts`, which this page's `page.project` already calls). And the voice says more of the record its own
     way, Home's empty lines, the Inbox's and the pen's line among them. Each is a new setting a person can
     change at /packs, so a minor step.
     2.8.0: a project's page takes Portfolio 1.6.0's template, built to the new look: the open tickets tallied by
     priority above the list of them, their dates as weeks above the plan, and the questions about it as tiles. A team
     keeps no money or services, so the month's money and what it runs on are left off as before. 2.7.0 is on
     `origin/master`, so the change is a version and not a reset.
     2.9.0: a project's page draws what was finished on it each week in place of the tickets tallied by priority, and
     Work's page says "No agent holds a ticket." in the short line it now has. 2.8.0 is on `origin/master`.
     2.10.0: calmer. Home, Cycles and Agent work open on one line said from new counts of tickets,
     every heading wears a glyph, each list is drawn only while it holds a ticket, and Home folds how the cycle is
     going under what needs the team. A project's page takes portfolio 1.8.0's template. 2.9.0 is on `origin/master`.
     2.11.0: a project's page takes portfolio 1.9.0's template, which always opens on a line, the tickets handed back
     when there are any and otherwise the project's next step, said once. 2.10.0 is live.
     2.12.0: a project's page takes portfolio 1.10.0's template: where it stands and the tickets handed back sit in the
     rail beside the chart, What is open goes since the plan draws the same tickets, and what is handed back is drawn
     only while it lists one. 2.11.0 is live.
     2.13.0: a project's page takes portfolio 1.12.0's template: its line is the next step alone, Where it stands is
     headed by how it is going with the agent last, and the tickets handed back are a to-do with no Changed by. 2.12.0
     is live.
     2.15.0: Agent work's Working now reads the runs active and heard from today (the Agents add-on's clause, §37). It
     read every run the record had not closed, so a run that stopped a minute ago, or one waiting for a pickup, was
     drawn as working, and its empty line no longer tells a team whose agents stopped to connect one. A clause added,
     so a minor step. 2.14.0 is live.
     2.15.1: the settings that hold each list's name and one of it are titled by what the list is called ("Name
     of the Tickets list"), not by its id ("Label: tasks"), and every list's name is declared before any
     singular, so the 64-setting ceiling costs a singular first. Titles and order only, so a patch step.
     2.16.0: a project's page takes the project template of work 1.15.0: what changed, who worked on it, its notes and what it
     runs on are one More about tile where they were folded sections. Blocks moved, so a minor step. 2.15.1 is live.
     2.17.0: Where it stands on a project's page draws At risk in the warning colour and Off track in the danger colour,
     by the template's `tones:`. On track wears no mark. A key added to a block that is already there, so a minor
     step. 2.16.0 is live.
     2.18.0: a project's page takes the template without Done, by week: what was finished this week is the last figure of
     At a glance, after Due soon and In review, asking for its four weeks as a line. A block gone and a cell kept, so a
     minor step. 2.17.0 is live.
     2.19.0: Agent work's Working now reads the record's working runs (`sessions.working`, agents 1.9.0), heard from in
     the last fifteen minutes with a helper folded under its run, where its own clause said today and a run quiet for
     hours was drawn as working. A source changed under a block that is already there, so a minor step. 2.18.0 is
     live.
     2.20.0: the project page it embeds takes portfolio 1.16.0's Where it stands (the typed card only while
     `project-said` counts one, else a stat of `project-moved-7d` under the same heading), and Where it stands takes Last
     worked (`project-last-worked`). 2.19.0 is live.
     2.21.0: the project page it embeds lists a project's own tools alone under Tools and servers (`kind is tool, scope
     is project`, pinwheel-60), where it listed everybody's. Batch 60 wrote this into 2.20.0, which commit 63423720
     had already deployed, so it is a version of its own. One `where` narrowed on a block that is there, nothing added
     or taken away, so a minor step. 2.20.0 IS LIVE. Still unreleased (commit 63423720 holds 2.20.0), it takes batch
     88's block with no version of its own: Home draws Gone quiet, what stopped reporting, straight under its line
     (founder-home-quiet-88), a sixth tile on a page held to six. A block added, nothing taken away. And batch 100's
     burn-down that fills itself: `TEAM_AUTOMATIONS`, three rules and two scripts added, so finishing a
     ticket ticks its planned line, reopening it unticks it, and each morning the record writes the cycle day; the
     standup skill stops saying it does either; Bring the team in loses Invite your team, which ended in a refusal on
     a free record. A row and two words changed, declarations added, so still the minor step 2.21.0 is. And the KPI
     plan's K3-C: the project page it embeds draws Key numbers, the project's own key numbers (`kpis`, `for: project`),
     the whole width under Waiting on you. A block added, nothing taken away.
     2.22.0: Bring the team in says only that a team of agents works on any record, and no longer that a team of people
     needs Cloud, which brain.dog does not sell and where inviting people is held. One
     line's words, so a patch would do; a minor step, since 2.21.0 is live on brain.dog.
     2.23.0 (things, not rows, 24 October): the project page it embeds is drawn for every project, parked and finished
     ones too, so a parked project's row opens its page. One `for:` widened; a minor step, since 2.22.0 is released.

     2.24.0, PORTFOLIO 1.23.0 (the thinking scope of 24 October): the project page it embeds draws the
     project's stages as its road in the rail, keeps its plan as its road or its roadmap alone once a shape is kept,
     and opens on one note of two sentences where it was two notes. A block added, nothing taken away, and 2.23.0 is
     published, so a minor step of its own.

     2.25.0, THE PROJECT'S SHAPE AS BLOCKS (the thinking scope of 24 October): the project page it embeds
     declares the hero with Path and Money, and Work and Who is on it with Runs on and the agents on it, as two
     `project` blocks where they were drawn by hand over the page; Handed back or blocked, which the page drew only
     where the shape was not, went for them, and More about is declared folded, as it was drawn. No id added or taken
     away, and 2.24.0 is live, so a minor step of its own.

     2.26.0: the project page's Where it stands says Last worked from the record's own
     `project-worked`, its tasks and its runs together, the figure its card on Projects and Today reads. No id added or
     taken away, and 2.25.0 is master's, so a minor step of its own.

     2.27.0, AUDIT C OF 25 OCTOBER: Projects, which this use case brings, opens a record with no project in play on
     a box to add one under one line (portfolio 1.27.0). Nothing of its own changed, and 2.26.0 is master's, so a minor
     step of its own.

     2.28.0, THE PROJECT PAGE OF 27 OCTOBER: the project page it embeds draws the project's own parts in three blocks,
     the hero beside its lane's tile, its numbers beside its work, then its dates, who is on it, what it runs on, the
     agents, what was decided and what happened; the plan and Key numbers move under More about, and What changed goes
     for those parts. Projects 1.30.0 leads with its board. No id added or taken away, so a minor step.

     2.29.0: Team task list is part of Team board now. A cycle carries a retro, a document for how it went. One field
     added and nothing taken away, so a minor step.
     2.29.1: the card's summary is one short line. Words only, so a patch step.
     2.29.2: the project page's And from everywhere cards say "What it is", not "Kind". Words only, so a patch step.
     2.30.0 (audit 31 Oct h, AH4): Cycles is on the rail from the first minute (its place, after Work), and opens on a box
     to add a cycle, where a new team found it inside More lists. A block added and nothing taken away, so a minor
     step; 2.29.2 is published.
     2.30.1 (audit 31 Oct h, AH21): cycles are said as sprints, as a team says them (Sprints, Sprint plan), and Cycle
     days is called Open each morning. The lists' ids and the page's address stay. Words only, so a patch step; 2.30.0
     is published.
     2.30.2 (UP2): the rail's section says what it holds: Sprints, not Team, and Agent work sits under Agents beside the
     agents it is about. Names on the rail only, so a patch step; 2.30.1 is in the catalogue.
     2.30.3 (audit 31 Oct l, AL11): Open each morning is called Sprint days, a noun beside Sprints and Sprint plan where
     an instruction read as half a sentence. The list's id stays. Words only, so a patch step; 2.30.2 is published.
     2.30.4 (audit 31 Oct m, AM17): People is called People, as the rail, Today and the People page say it, where the
     list was Teammates and sat apart under More lists; a team keeps clients and people it met there too. The setting
     stays. Words only, so a patch step; 2.30.3 is published.
     2.30.5 (audit 31 Oct o, AO14): Sprints draws its own glyph, where it drew Menu's three lines on the phone bar. The
     look only, so a patch step; 2.30.4 is published.
     2.31.0 (no briefs, 3 Nov): Team, Sprints and Agent work no longer open on a line counting tickets, which the lists and
     boards under them show. Three blocks taken away and none added, so a minor step; 2.30.5 is published. */
  version: '2.31.0',
  title: 'Team board',
  summary: 'Tickets, sprints and the agents on them.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'team',
  tone: 'brisk and shared',
  signals: [
    'team', 'teams', 'my team', 'our team', 'product team', 'engineering team', 'product manager', 'product managers',
    'project manager', 'pm', 'squad', 'squads', 'enterprise', 'department', 'colleagues', 'teammates', 'staff',
    'sprint', 'sprints', 'cycle', 'cycles', 'backlog', 'ticket', 'tickets', 'issues', 'jira', 'linear', 'kanban',
    'scrum', 'standup', 'standups', 'roadmap', 'task list', 'assignees', 'agents', 'our agents', 'agentic',
  ],
  modules: ['portfolio', 'people', 'work'],
  voice: {
    home: 'Team',
    right_now: 'In flight',
    needs_you: 'Waiting on a call',
    nothing_needs_you: 'No call is waiting on you',
    since_away: 'What the team and its agents did',
    /* "Our things", AND IT WAS "Team lists": shared, as the team says it, and a list is only how the record keeps the tickets. */
    lists: 'Our things',
    /* THE REST OF THE LINES, brisk and shared: a ticket, a call, the team and its agents. */
    working_now: 'On it now',
    coming_up: 'Due soon',
    overdue: 'Slipping',
    nothing_now: 'No call is waiting on you right now.',
    nothing_waiting: 'No call is waiting on you.',
    fills_with: 'Tickets in flight, calls waiting on you and what the team and its agents did show up here as work moves.',
    no_questions: 'No call waiting',
    inbox_clear: 'Triage is clear',
    add_first: 'File the first one',
    pen_waits: 'When there is a way to fit this to how the team works, it waits here until you keep it or say no.',
  },
  /* SETTINGS A TEAM CAN CHANGE: call Tickets "Issues" (and one of them is then an issue), or a teammate a "Member", at
     /packs/usecase-team. Work's tasks are the team's tickets, and their statuses are said as a team says them. */
  labels: {
    tasks: 'Tickets',
    'tasks:one': 'ticket',
    'tasks:holds': 'every piece of work the team has, who owns it, how urgent it is and whether an agent took it',
    'tasks.state.backlog': 'Backlog',
    'tasks.state.open': 'To do',
    'tasks.state.doing': 'In progress',
    'tasks.state.review': 'In review',
    cycles: 'Sprints',
    cycle_plan: 'Sprint plan',
    /* PEOPLE, ONE WORD ON EVERY SCREEN (AM17): Teammates was a fourth name for the one list. */
    people: 'People',
    'people:holds': 'everyone on the team and everyone it works with, the part each one plays and how to reach them',
    'people.role.collaborator': 'Teammate',
    cycle_days: 'Sprint days',
  },
  skills: [
    { name: 'task-triage', trigger: 'when a ticket is opened, to set its priority, suggest an owner and say whether an agent can take it' },
    {
      name: 'standup-digest',
      trigger:
        'each morning, to say what moved yesterday, what is blocked and what agents finished',
    },
  ],
  pack: {
    pack: 'usecase-team',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'cycles',
        name: 'Sprints',
        one: 'sprint',
        icon: 'rows',
        holds: 'the sprints the team works in, with the dates each runs and what it is for',
        title: 'name',
        mobile: ['name', 'state', 'ends'],
        state: 'state',
        done: ['done'],
        fields: [
          { id: 'name', label: 'Sprint', type: 'text', required: true, search: true },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['planned', 'active', 'done'],
            labels: { planned: 'Planned', active: 'Active', done: 'Done' },
            default: 'planned',
            required: true,
            index: true,
          },
          { id: 'starts', label: 'Starts', type: 'day', index: true },
          { id: 'ends', label: 'Ends', type: 'day', index: true },
          { id: 'goal', label: 'Goal', type: 'text' },
          { id: 'retro', label: 'How it went', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* WHAT WORK'S TASKS DO NOT HOLD: the cycle a ticket is planned in and its points, one line per ticket per cycle, so a
           ticket carried into the next cycle keeps what it was worth in the last one. */
        register: 'cycle_plan',
        name: 'Sprint plan',
        one: 'planned ticket',
        icon: 'rows',
        holds: 'which tickets each sprint takes on, and how many points each one is worth',
        title: 'what',
        /* A PLANNED TICKET IS A STEP OF ITS CYCLE (2.6.0), so a cycle knows how much of what it took on is done: Home's
           progress counts the lines ticked against the lines planned, and a cycle's card fills the same way. A line
           keeps its own tick rather than reading its ticket's status, because a page reads one list at a time. */
        steps: { of: 'cycle', done: 'done' },
        mobile: ['what', 'cycle', 'done'],
        fields: [
          { id: 'what', label: 'Planned', type: 'text', required: true, search: true },
          { id: 'task', label: 'Ticket', type: 'ref', to: 'tasks', index: true },
          { id: 'cycle', label: 'Sprint', type: 'ref', to: 'cycles', index: true },
          { id: 'points', label: 'Points', type: 'int', min: 0 },
          { id: 'done', label: 'Done', type: 'bool', default: false, index: true },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* HOW MANY TICKETS WERE STILL OPEN, ONE ROW A MORNING (2.6.0), which is what the burndown on Home draws. The
           record keeps no history of a count, so the count is written down, and since 2.21.0 the record writes it
           itself each morning: the planned lines of the active cycle not ticked (`cycle_day` in `TEAM_AUTOMATIONS`).
           A person can still write a day, and the record then writes none for it. */
        register: 'cycle_days',
        name: 'Sprint days',
        one: 'morning count',
        icon: 'rows',
        holds: 'how many tickets were still open on each day of a sprint, one row a morning',
        title: 'day',
        mobile: ['day', 'open', 'cycle'],
        fields: [
          { id: 'day', label: 'Day', type: 'day', required: true, index: true },
          { id: 'open', label: 'Open tickets', type: 'int', min: 0, required: true },
          { id: 'cycle', label: 'Sprint', type: 'ref', to: 'cycles', index: true },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      /* WHAT THE TEAM'S PAGES ARE DRAWN ON, SINCE 2.10.0, each over its list's own clauses. */
      counted('tickets-in-flight', 'In flight', 'register.tasks', IN_FLIGHT),
      counted('tickets-blocked', 'Blocked', 'register.tasks', 'state is blocked'),
      counted('tickets-due-else', 'Else due this week', 'register.tasks', `${LIVE}, state is not doing or review or blocked, by before +8d`),
      counted('tickets-planned', 'Planned into a sprint', 'register.cycle_plan'),
      counted('tickets-taken', 'Taken by agents', 'register.tasks', 'agent is set, state is not done or dropped'),
      counted('tickets-done-by-agents', 'Finished by agents', 'register.tasks', 'agent is set, state is done'),
      /* THE RULES THAT KEEP THE CYCLE'S PROGRESS AND ITS MORNING COUNT, AND THEIR SCRIPTS, SINCE 2.21.0. */
      ...TEAM_AUTOMATIONS,
      {
        /* HOME, AS A TEAM ANSWERS IT: what agents suggest, what is moving and who is on it, what is stuck, what is
           due, and how far the cycle has come, with no place on the rail. */
        page: 'home-team',
        title: 'Team',
        icon: 'home',
        requires: ['register.tasks', 'register.cycle_plan', 'register.cycle_days'],
        blocks: [
          {
            /* WHAT STOPPED REPORTING, STRAIGHT UNDER THE LINE, INSIDE 2.21.0 (batch 88): the table a founder's Home draws
               since 2.6.0 and the browser draws on the Today it builds, word for word, over the record's own read of
               what went quiet. No `when:` and no `empty:`: the record leaves it out while nothing is quiet. */
            kind: 'table',
            heading: 'Gone quiet',
            icon: 'history',
            span: 12,
            source: 'exceptions',
            columns: [
              { field: 'subject', label: 'What' },
              { field: 'since', label: 'Last seen' },
              { field: 'was', label: 'Before' },
            ],
            limit: 6,
          },
          {
            /* FIRST, BECAUSE AN AGENTIC TASK LIST IS ONE WHERE THE AGENTS PROPOSE: a ticket to open, a priority to
               change, an owner to set, each answered here with Keep or No thanks and never by opening Decide. */
            kind: 'queue',
            heading: 'Agents suggest',
            icon: 'ask',
            span: 12,
            source: 'governance.open',
            where: 'list is tasks',
            limit: 3,
            when: { metric: 'questions-open', gt: 0 },
            empty: 'No agent is suggesting anything right now.',
          },
          {
            /* AND WHEN EACH ONE IS DUE, because Due this week below no longer draws these rows a second time and nothing
               else on this page carries their date. Without this column a ticket in progress and due tomorrow said
               neither, which is what the third test in `test/team-home-twice.test.ts` watched happen.
               CARDS, SO WHO IS ON IT IS A FACE: only a card reads a column's role, and a table would draw the owner as
               a name among the other cells. The agent is a fact beside the status, and the working dot marks a ticket
               whose agent has a run going now, so a lead sees at a glance which tickets are moving this minute. */
            kind: 'cards',
            heading: '{{config:voice_right_now}}',
            icon: 'activity',
            span: 12,
            source: 'register.tasks',
            where: IN_FLIGHT,
            when: { metric: 'tickets-in-flight', gt: 0 },
            columns: [
              { field: 'what', as: 'title' },
              { field: 'owner', label: 'Owner', as: 'who' },
              { field: 'agent', label: 'Agent', as: 'fact' },
              { field: 'state', label: 'Status', as: 'fact' },
              { field: 'by', label: 'Due', as: 'when' },
            ],
            working: true,
            limit: 8,
            empty: 'Nothing is in flight.',
          },
          {
            kind: 'table',
            heading: 'Blocked',
            icon: 'octagon-alert',
            span: 12,
            source: 'register.tasks',
            where: 'state is blocked',
            when: { metric: 'tickets-blocked', gt: 0 },
            columns: [TICKET, { field: 'owner', label: 'Owner', width: 'minmax(10ch,16ch)' }, { field: 'by', label: 'Due', width: '13ch', align: 'end' }],
            limit: 8,
            empty: 'Nobody is blocked.',
          },
          {
            kind: 'table',
            /* WHAT IS DUE THAT THE TWO HEADINGS ABOVE HAVE NOT ALREADY DRAWN. `state is not doing or review or blocked`
               is the whole of the difference, and it is three states rather than one because Home asks the same
               tickets three questions in a row: driven on a record made the way onboarding makes one, Home drew five
               rows and `Wait on the design for the settings screen` was two of them, under Blocked and again here.
               `In flight` overlaps by exactly the same construction and did not show it, because both example tickets
               that are doing or in review carry no due day at all, so every screenshot of this page was clean. Giving
               the in-progress ticket a date three days out draws `Write the release notes` twice as well, which is
               what `test/team-home-twice.test.ts` plants rather than trusting the sample. `79f17031` made the same
               move on the Work pack's Overview, and a usability pass said what the
               overlap costs: the first reading is that the board is double-counting. */
            heading: 'Due this week',
            icon: 'calendar-clock',
            span: 12,
            source: 'register.tasks',
            where: `${LIVE}, state is not doing or review or blocked, by before +8d`,
            when: { metric: 'tickets-due-else', gt: 0 },
            columns: [TICKET, { field: 'priority', label: 'Priority', width: '10ch' }, { field: 'state', label: 'Status', width: '12ch' }, { field: 'by', label: 'Due', width: '13ch', align: 'end' }],
            order: [{ field: 'by', dir: 'asc' }],
            limit: 8,
            /* "ELSE", BECAUSE THE BLOCK CAN NOW BE EMPTY WHILE WORK IS DUE and the old line said the opposite. With the
               blocked example ticket due in five days and the in-progress one given a date, this block draws one row
               where it drew two, and on a board where everything due is in flight or blocked it draws none at all
               directly under two headings full of dates. */
            empty: 'Nothing else is due this week.',
          },
          {
            kind: 'link',
            heading: 'Bring the team in',
            icon: 'user-plus',
            span: 12,
            authored: [
              { cells: ['Connect an agent', CONNECT, 'A team of agents works on any record.'] },
            ],
          },
          {
            /* HOW THE CYCLE IS GOING, FOLDED SHUT, SINCE 2.10.0: above it Home is what needs the team this week. */
            kind: 'section',
            heading: 'How the sprint is going',
            icon: 'gauge',
            span: 12,
            fold: true,
          },
          {
            /* HOW FAR THE CYCLE HAS COME: the planned tickets ticked done against every ticket planned, one track a
               cycle. The newest cycle first, since the one a team is in is the one it asks about. */
            kind: 'progress',
            heading: 'This sprint',
            icon: 'goal',
            span: 6,
            source: 'register.cycle_plan',
            columns: [{ field: 'cycle' }, { field: 'done' }],
            order: [{ field: 'cycle', dir: 'desc' }],
            limit: 3,
            empty: 'Plan tickets into a sprint and how far it has come shows here.',
          },
          {
            /* BESIDE IT, THE BURNDOWN: how many tickets were open each morning of the last two weeks, against the two
               weeks before, from the Cycle days the record writes each morning (`cycle_day`), or a teammate does. */
            kind: 'lines',
            heading: 'Open tickets, each morning',
            icon: 'chart-line',
            span: 6,
            source: 'register.cycle_days',
            columns: [{ field: 'day' }, { field: 'open' }],
            back: 14,
            bucket: 'day',
            empty: 'Nothing counted yet. Once a sprint is active, the open tickets are counted each morning.',
          },
        ],
      },
      {
        /* CYCLES BESIDE WORK'S OWN BOARD. Tickets move on Work's Board, so this page is what Work does not hold: the cycles,
           what each one takes on, and what is stuck. It was called Board when tickets were this pack's own, and two pages
           called Board on one rail said nothing about which was which. */
        page: 'cycles',
        title: 'Sprints',
        /* ITS PLACE ON THE RAIL, SINCE 2.30.0 (AH4): a starter's own page is a place from the first minute, even while
           its lists hold only what the starter planted. */
        /* THE SECTION IS CALLED BY WHAT IT HOLDS, SINCE 2.30.2 (UP2): it was "Team", which read as the people on it. */
        nav: { section: 'Sprints', order: 10, place: 20 },
        /* ITS OWN GLYPH, SINCE 2.30.5 (audit 31 Oct o, AO14): it was `rows`, the three lines the phone bar's Menu draws,
           so Team's bar showed Sprints and Menu alike. A sprint comes round again. */
        icon: 'refresh',
        requires: ['register.tasks', 'register.cycles', 'register.cycle_plan'],
        blocks: [
          /* A BOX TO ADD A CYCLE, SINCE 2.30.0 (AH4). */
          { kind: 'capture', heading: 'Add a sprint', icon: 'plus', span: 12, register: 'cycles' },
          {
            kind: 'table',
            heading: 'Sprints',
            icon: 'repeat',
            span: 12,
            source: 'register.cycles',
            columns: [
              { field: 'name', label: 'Sprint', width: 'minmax(16ch,1fr)' },
              { field: 'state', label: 'Status', width: '12ch' },
              { field: 'starts', label: 'Starts', width: '15ch' },
              { field: 'ends', label: 'Ends', width: '15ch', align: 'end' },
            ],
            order: [{ field: 'starts', dir: 'desc' }],
            empty: 'No sprints yet.',
          },
          {
            kind: 'table',
            heading: 'Sprint plan',
            icon: 'list-checks',
            span: 12,
            when: { metric: 'tickets-planned', gt: 0 },
            source: 'register.cycle_plan',
            columns: [
              { field: 'task', label: 'Ticket', width: 'minmax(20ch,1fr)' },
              { field: 'cycle', label: 'Sprint', width: 'minmax(10ch,16ch)' },
              { field: 'points', label: 'Points', width: '8ch', align: 'end' },
            ],
            limit: 30,
            empty: 'No ticket is planned into a sprint yet.',
          },
          {
            kind: 'table',
            heading: 'Blocked',
            icon: 'octagon-alert',
            span: 12,
            source: 'register.tasks',
            where: 'state is blocked',
            when: { metric: 'tickets-blocked', gt: 0 },
            columns: [
              TICKET,
              { field: 'owner', label: 'Owner', width: 'minmax(10ch,18ch)' },
              { field: 'agent', label: 'Agent', width: '12ch' },
              { field: 'by', label: 'Due', width: '15ch', align: 'end' },
            ],
            limit: 20,
            empty: 'Nobody is blocked.',
          },
        ],
      },
      {
        /* A PAGE FOR EACH PROJECT IN PLAY: where it stands, the tickets on it waiting on a call, what is open, and the agents
           on it. Projects' template, without what reads money and services, which a team's record does not hold. Same id as
           the template, so a record never has two pages at one project's address. */
        ...projectTemplate(HOLDS),
      },
      {
        page: 'agent-work',
        title: 'Agent work',
        /* UNDER AGENTS SINCE 2.30.2 (UP2): the tickets agents are on, beside the agents themselves. */
        nav: { section: 'Agents', order: 20 },
        icon: 'session',
        requires: ['register.tasks'],
        blocks: [
          {
            /* THE RUNS THE RECORD KNOWS ARE GOING (2.6.0), each with the agent's face and what it says it is doing, read
               from `sessions.live` as Home's own runs are. This page listed the `session` list by hand, and drew an
               empty list on a record whose agents were working. ONLY THE ONES WORKING, SINCE 2.15.0, and since 2.19.0
               the record's own working runs (`sessions.working`), heard from in the last fifteen minutes, the runs the
               Agents page and the rail count. Its empty line said to connect an agent, which a team whose agents
               stopped yesterday has done, so it says where agents are connected without saying none is. */
            kind: 'cards',
            heading: 'Working now',
            icon: 'session',
            span: 12,
            source: 'sessions.working',
            columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
            limit: 12,
            empty: 'No agent is working here right now. Agents you connect in Settings show here while they work.',
          },
          {
            kind: 'table',
            heading: 'Taken by agents',
            icon: 'bot',
            span: 12,
            when: { metric: 'tickets-taken', gt: 0 },
            source: 'register.tasks',
            where: 'agent is set, state is not done or dropped',
            columns: [
              TICKET,
              { field: 'agent', label: 'Agent', width: '12ch' },
              { field: 'state', label: 'Status', width: '14ch' },
              { field: 'owner', label: 'Owner', width: 'minmax(10ch,18ch)' },
            ],
            limit: 30,
            empty: 'No agent holds a ticket.',
          },
          {
            /* WHAT EACH AGENT DID, from the record's own log, one group per agent: the changes, not only the runs. */
            kind: 'agents',
            heading: 'What agents did',
            icon: 'activity',
            span: 12,
            source: 'activity',
            first: 5,
            empty: 'No agent has changed anything here yet.',
          },
          {
            kind: 'table',
            heading: 'Finished by agents',
            icon: 'circle-check',
            span: 12,
            when: { metric: 'tickets-done-by-agents', gt: 0 },
            source: 'register.tasks',
            where: 'agent is set, state is done',
            columns: [TICKET, { field: 'agent', label: 'Agent', width: '12ch' }, { field: 'done_on', label: 'Done on', width: '13ch', align: 'end' }],
            order: [{ field: 'done_on', dir: 'desc' }],
            limit: 30,
            empty: 'No agent has finished a ticket yet.',
          },
        ],
      },
    ],
    seeds: [
      { register: 'cycles', fields: { name: 'Sprint 1', state: 'active', goal: 'Ship the first version of the board' } },
      { register: 'cycle_plan', fields: { what: 'Write the release notes', points: 2, done: false } },
      { register: 'cycle_plan', fields: { what: 'Agree what goes in the next sprint', points: 1, done: false } },
      { register: 'cycle_plan', fields: { what: 'Fix the sign-in link that expires too soon', points: 3, done: false } },
      { register: 'cycle_plan', fields: { what: 'Wait on the design for the settings screen', points: 5, done: false } },
      { register: 'cycle_plan', fields: { what: 'Tidy the backlog labels', points: 1, done: true } },
      /* FIVE MORNINGS OF THE EXAMPLE CYCLE, so the burndown has a line to draw on the first day. */
      { register: 'cycle_days', fields: { day: '-4d', open: 6 } },
      { register: 'cycle_days', fields: { day: '-3d', open: 6 } },
      { register: 'cycle_days', fields: { day: '-2d', open: 5 } },
      { register: 'cycle_days', fields: { day: '-1d', open: 5 } },
      { register: 'cycle_days', fields: { day: '0d', open: 4 } },
    ],
  },
};

/** The tickets a team's record starts with, on Work's tasks (`install.ts` gives them to Work for this use case). */
/** The project the example tickets are for, so Projects and every Project column has something to say on the first day. */
const TEAM_PROJECT = 'The customer app';

export const TEAM_EXAMPLES: readonly Body[] = [
  { register: 'things', fields: { name: TEAM_PROJECT, lane: 'building', health: 'on_track', next: 'Agree what goes in the next sprint', since: '-60d' } },
  { register: 'tasks', fields: { what: 'Write the release notes', state: 'doing', priority: 'normal', agent: 'claude' } },
  { register: 'tasks', fields: { what: 'Agree what goes in the next sprint', state: 'open', priority: 'high', by: '+3d' } },
  { register: 'tasks', fields: { what: 'Fix the sign-in link that expires too soon', state: 'review', priority: 'urgent', agent: 'claude' } },
  { register: 'tasks', fields: { what: 'Wait on the design for the settings screen', state: 'blocked', priority: 'normal', by: '+5d' } },
  { register: 'tasks', fields: { what: 'Tidy the backlog labels', state: 'done', priority: 'low', agent: 'claude' } },
  { register: 'tasks', fields: { what: 'Let a teammate export the board as a spreadsheet', state: 'backlog', priority: 'low' } },
];

/** The planned tickets linked to their ticket and to the example cycle once both are in, and each ticket to the project (`links.ts`). */
export const TEAM_PLAN_LINKS = [
  ...(TEAM.pack.seeds as { register: string; fields: Body }[])
    .filter((s) => s.register === 'cycle_plan')
    .flatMap((s) => [
      { register: 'cycle_plan', title: String(s.fields.what), field: 'task', to: 'tasks', target: String(s.fields.what) },
      { register: 'cycle_plan', title: String(s.fields.what), field: 'cycle', to: 'cycles', target: 'Sprint 1' },
    ]),
  ...TEAM_EXAMPLES.filter((s) => s.register === 'tasks').map((s) => ({
    register: 'tasks',
    title: String((s.fields as Body).what),
    field: 'thing',
    to: 'things',
    target: TEAM_PROJECT,
  })),
];

/* ── a record that had Team before 2.0.0 ─────────────────────────────────── */

/** The version Team's tickets became Work's tasks. */
export const TICKETS_MOVED_IN = '2.0.0';

/**
 * TEAM'S OWN TICKETS LIST, as 1.x declared it, kept for a record that holds it. Only the name and the line under it
 * changed, so an update installs it over the old one with every row readable, and nothing reads it but its own list.
 */
export const EARLIER_TICKETS: Body = {
  register: 'tickets',
  name: 'Earlier tickets',
  one: 'earlier ticket',
  icon: 'task',
  holds: 'the tickets you kept before the board moved onto Tickets; each one was copied there when Team was updated',
  title: 'what',
  mobile: ['what', 'state', 'owner'],
  state: 'state',
  done: ['done', 'dropped'],
  fields: [
    { id: 'what', label: 'Ticket', type: 'text', required: true, search: true },
    {
      id: 'state',
      label: 'Status',
      type: 'enum',
      values: ['backlog', 'to_do', 'in_progress', 'in_review', 'blocked', 'done', 'dropped'],
      labels: { backlog: 'Backlog', to_do: 'To do', in_progress: 'In progress', in_review: 'In review', blocked: 'Blocked', done: 'Done', dropped: 'Dropped' },
      default: 'backlog',
      required: true,
      index: true,
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'enum',
      values: ['urgent', 'high', 'normal', 'low'],
      labels: { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' },
      default: 'normal',
      index: true,
    },
    { id: 'owner', label: 'Owner', type: 'ref', to: 'people', index: true },
    { id: 'agent', label: 'Agent', type: 'text', index: true },
    { id: 'cycle', label: 'Cycle', type: 'ref', to: 'cycles', index: true },
    { id: 'due', label: 'Due', type: 'day', index: true, deadline: true },
    { id: 'points', label: 'Points', type: 'int' },
    { id: 'note', label: 'Notes', type: 'document' },
    { id: 'tags', type: 'list', of: 'text' },
  ],
};

/** The version a backlog ticket stayed in the backlog, on Work's own Backlog status. */
export const BACKLOG_KEPT_IN = '2.1.0';

/** HOW EACH OLD STATUS READS ON A TASK: each one has its own, and a backlog ticket is in the backlog. */
export const TICKET_STATES: Readonly<Record<string, string>> = {
  backlog: 'backlog',
  to_do: 'open',
  in_progress: 'doing',
  in_review: 'review',
  blocked: 'blocked',
  done: 'done',
  dropped: 'dropped',
};

/** What moving the tickets needs: a list's rows, and a row written as the owner who accepted the update. */
export type TicketIo = {
  rows: (register: string) => Promise<readonly { seq: number | null; fields: Record<string, unknown>; updated_at?: string }[] | null>;
  create: (register: string, fields: Record<string, unknown>) => Promise<boolean>;
};

const set = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

/** What a task copied from a ticket says, and what a task has to say to be taken as that copy: title, state, priority and note. */
const copyShape = (f: Record<string, unknown>): string => JSON.stringify([String(f.what ?? ''), String(f.state ?? ''), String(f.priority ?? ''), String(f.note ?? '')]);

/**
 * Copy each ticket of Team 1.x to a task, with its cycle and points on the cycle plan. Answers how many tickets were
 * copied. The tickets stay where they are, under Earlier tickets. A ticket is taken as copied only when a task already
 * says what its copy would say (title, state, priority and note), one task for one ticket, so running it twice copies
 * nothing twice, and neither a second ticket with the same title nor a task somebody typed with it stands in for a
 * ticket. A refused write is skipped.
 */
export async function moveTickets(io: TicketIo): Promise<number> {
  const tickets = (await io.rows('tickets').catch(() => null)) ?? [];
  if (tickets.length === 0) return 0;
  const titles = async (): Promise<readonly { seq: number | null; fields: Record<string, unknown> }[]> => (await io.rows('tasks').catch(() => null)) ?? [];
  /* WHAT A COPY SAYS, as a count per shape, so each task already there answers for one ticket and no more. */
  const shape = copyShape;
  const had = new Map<string, number>();
  for (const t of await titles()) had.set(shape(t.fields), (had.get(shape(t.fields)) ?? 0) + 1);
  let moved = 0;
  for (const ticket of [...tickets].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const f = ticket.fields;
    const what = String(f.what ?? '');
    if (what === '') continue;
    const state = TICKET_STATES[String(f.state)] ?? 'open';
    const fields: Record<string, unknown> = { what, state };
    if (set(f.priority)) fields.priority = f.priority;
    if (set(f.note)) fields.note = f.note;
    const copied = had.get(shape(fields)) ?? 0;
    if (copied > 0) {
      had.set(shape(fields), copied - 1);
      continue;
    }
    if (set(f.owner)) fields.owner = f.owner;
    if (set(f.agent)) fields.agent = f.agent;
    if (set(f.due)) fields.by = f.due;
    if (Array.isArray(f.tags) && f.tags.length > 0) fields.tags = f.tags;
    /* A FINISHED TICKET KEEPS THE DAY IT WAS LAST CHANGED as the day it was done, rather than the day of the update. */
    if ((state === 'done' || state === 'dropped') && typeof ticket.updated_at === 'string') fields.done_on = ticket.updated_at.slice(0, 10);
    if (!(await io.create('tasks', fields).catch(() => false))) continue;
    moved += 1;
    if (!set(f.cycle) && !set(f.points)) continue;
    const task = (await titles()).filter((t) => t.fields.what === what && t.seq !== null).sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0];
    const line: Record<string, unknown> = { what };
    if (task) line.task = `tasks#${task.seq}`;
    if (set(f.cycle)) line.cycle = f.cycle;
    if (set(f.points)) line.points = f.points;
    if (Array.isArray(f.tags) && f.tags.length > 0) line.tags = f.tags;
    await io.create('cycle_plan', line).catch(() => false);
  }
  return moved;
}

/**
 * A RECORD THAT TOOK TEAM 2.0.0 copied its backlog tickets as To do. Each task copied from a ticket still in the backlog,
 * and still To do, goes back to the backlog; one somebody has moved since is left where they put it. Answers how many.
 *
 * A TASK IS TAKEN AS A COPY THE WAY `moveTickets` TAKES ONE: it says what the copy said (title, To do, priority and note),
 * one task for one ticket, earliest first. A task somebody typed with a backlog ticket's title alone is left alone.
 */
export async function backlogAgain(io: { rows: TicketIo['rows']; link: (register: string, seq: number, field: string, spoken: string) => Promise<boolean> }): Promise<number> {
  const waiting = new Map<string, number>();
  for (const t of (await io.rows('tickets').catch(() => null)) ?? []) {
    if (t.fields.state !== 'backlog' || String(t.fields.what ?? '') === '') continue;
    const copy = copyShape({ what: t.fields.what, state: 'open', priority: set(t.fields.priority) ? t.fields.priority : '', note: set(t.fields.note) ? t.fields.note : '' });
    waiting.set(copy, (waiting.get(copy) ?? 0) + 1);
  }
  if (waiting.size === 0) return 0;
  let moved = 0;
  const tasks = [...((await io.rows('tasks').catch(() => null)) ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  for (const task of tasks) {
    if (task.seq === null || task.fields.state !== 'open') continue;
    const left = waiting.get(copyShape(task.fields)) ?? 0;
    if (left === 0) continue;
    waiting.set(copyShape(task.fields), left - 1);
    if (await io.link('tasks', task.seq, 'state', 'backlog').catch(() => false)) moved += 1;
  }
  return moved;
}

/**
 * WHAT THE MODULES SAY TO A TEAM, by module and then by the module's own words (`MODULE_NAMES` in `install.ts`), laid
 * over the plain words every use case but a business's gets. Work's tasks are the team's tickets (`labels.tasks`), so
 * the page that holds them, its place on the rail and its sentences about a task say ticket too. "No agent holds a
 * task." left with work 1.14.0, when Work's bands stopped saying they are empty, and its ticket went with it.
 */
export const TEAM_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  work: {
    Work: 'Tickets',
    /* THE LIST'S OWN WORD ON ITS FIRST LINE (AH28): Tickets read "None of your tasks is late". */
    'None of your tasks is late, {{questions-open-in:tasks}} question(s) for you, {{tasks-waiting}} waiting on you':
      'None of your tickets is late, {{questions-open-in:tasks}} question(s) for you, {{tasks-waiting}} waiting on you',
    '{{tasks-late-yours.first}} is late, and {{tasks-late-yours.more}} more task(s) are too':
      '{{tasks-late-yours.first}} is late, and {{tasks-late-yours.more}} more ticket(s) are too',
    '{{open-tasks}} open task(s), {{tasks-waiting}} waiting on you': '{{open-tasks}} open ticket(s), {{tasks-waiting}} waiting on you',
    '{{open-tasks}} open task(s), {{tasks-waiting}} to check or blocked, {{tasks-with-agents}} with an agent':
      '{{open-tasks}} open ticket(s), {{tasks-waiting}} to check or blocked, {{tasks-with-agents}} with an agent',
  },
};
