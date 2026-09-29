/**
 * Team board: a product team's tickets, who holds each one, the cycle it is in, and the work agents took
 * (`loop/research-spark.md` §4).
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

type Body = Record<string, unknown>;

/** The lists a team's record holds, so the project page leaves out what reads money and services. */
const HOLDS = ['things', 'people', 'tasks', 'tracks', 'updates', 'cycles', 'cycle_plan', 'cycle_days'];

/*
 * THE TWO DOORS A NEW TEAM NEEDS, both into Settings: People sends the invitation, and Agents shows the line to paste
 * into Claude Code for this record, the real one worked out there for this record and this machine, so Home never
 * prints a line that goes stale.
 */
const INVITE = '/settings/people';
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
     column, and one sentence said from its figures first (PGS-22, through `projectTemplate` in `../modules/
     portfolio.ts`, which this page's `page.project` already calls). And the voice says more of the record its own
     way, Home's empty lines, the Inbox's and the pen's line among them (PGS-24). Each is a new setting a person can
     change at /packs, so a minor step.
     2.8.0: a project's page takes Portfolio 1.6.0's template, built to the new look: the open tickets tallied by
     priority above the list of them, their dates as weeks above the plan, and the questions about it as tiles. A team
     keeps no money or services, so the month's money and what it runs on are left off as before. 2.7.0 is on
     `origin/master`, so the change is a version and not a reset. */
  version: '2.8.0',
  title: 'Team board',
  summary: 'Tickets with an owner and a status, the cycle each is in, and the work your agents took on.',
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
    lists: 'Team lists',
    /* THE REST OF THE LINES, brisk and shared (PGS-24): a ticket, a call, the team and its agents. */
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
  /* SETTINGS A TEAM CAN CHANGE (S8): call Tickets "Issues" (and one of them is then an issue), or a teammate a "Member", at
     /packs/usecase-team. Work's tasks are the team's tickets, and their statuses are said as a team says them. */
  labels: {
    tasks: 'Tickets',
    'tasks:one': 'ticket',
    'tasks:holds': 'every piece of work the team has, who owns it, how urgent it is and whether an agent took it',
    'tasks.state.backlog': 'Backlog',
    'tasks.state.open': 'To do',
    'tasks.state.doing': 'In progress',
    'tasks.state.review': 'In review',
    cycles: 'Cycles',
    cycle_plan: 'Cycle plan',
    people: 'Teammates',
    'people:holds': 'everyone on the team, the part each one plays and how to reach them',
    'people.role.collaborator': 'Teammate',
    cycle_days: 'Cycle days',
  },
  skills: [
    { name: 'task-triage', trigger: 'when a ticket is opened, to set its priority, suggest an owner and say whether an agent can take it' },
    {
      name: 'standup-digest',
      trigger:
        'each morning, to say what moved yesterday, what is blocked and what agents finished, tick the planned tickets that are done, and add a cycle day with how many tickets are still open',
    },
  ],
  pack: {
    pack: 'usecase-team',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'cycles',
        name: 'Cycles',
        one: 'cycle',
        icon: 'rows',
        holds: 'the sprints or cycles the team works in, with the dates each runs and what it is for',
        title: 'name',
        mobile: ['name', 'state', 'ends'],
        state: 'state',
        done: ['done'],
        fields: [
          { id: 'name', label: 'Cycle', type: 'text', required: true, search: true },
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
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* WHAT WORK'S TASKS DO NOT HOLD: the cycle a ticket is planned in and its points, one line per ticket per cycle, so a
           ticket carried into the next cycle keeps what it was worth in the last one. */
        register: 'cycle_plan',
        name: 'Cycle plan',
        one: 'planned ticket',
        icon: 'rows',
        holds: 'which tickets each cycle takes on, and how many points each one is worth',
        title: 'what',
        /* A PLANNED TICKET IS A STEP OF ITS CYCLE (2.6.0), so a cycle knows how much of what it took on is done: Home's
           progress counts the lines ticked against the lines planned, and a cycle's card fills the same way. A line
           keeps its own tick rather than reading its ticket's status, because a page reads one list at a time. */
        steps: { of: 'cycle', done: 'done' },
        mobile: ['what', 'cycle', 'done'],
        fields: [
          { id: 'what', label: 'Planned', type: 'text', required: true, search: true },
          { id: 'task', label: 'Ticket', type: 'ref', to: 'tasks', index: true },
          { id: 'cycle', label: 'Cycle', type: 'ref', to: 'cycles', index: true },
          { id: 'points', label: 'Points', type: 'int', min: 0 },
          { id: 'done', label: 'Done', type: 'bool', default: false, index: true },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* HOW MANY TICKETS WERE STILL OPEN, ONE ROW A MORNING (2.6.0), which is what the burndown on Home draws. The
           record keeps no history of a count, so the count is written down: by the standup agent each morning, or by
           a person, the same way a founder's numbers are. */
        register: 'cycle_days',
        name: 'Cycle days',
        one: 'cycle day',
        icon: 'rows',
        holds: 'how many tickets were still open on each day of a cycle, one row a morning',
        title: 'day',
        mobile: ['day', 'open', 'cycle'],
        fields: [
          { id: 'day', label: 'Day', type: 'day', required: true, index: true },
          { id: 'open', label: 'Open tickets', type: 'int', min: 0, required: true },
          { id: 'cycle', label: 'Cycle', type: 'ref', to: 'cycles', index: true },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* HOME, AS A TEAM ANSWERS IT (S13): what agents suggest, what is moving and who is on it, what is stuck, what is
           due, and how far the cycle has come, with no place on the rail. */
        page: 'home-team',
        title: 'Team',
        icon: 'home',
        requires: ['register.tasks', 'register.cycle_plan', 'register.cycle_days'],
        blocks: [
          {
            /* FIRST, BECAUSE AN AGENTIC TASK LIST IS ONE WHERE THE AGENTS PROPOSE: a ticket to open, a priority to
               change, an owner to set, each answered here with Keep or No thanks and never by opening Decide. */
            kind: 'queue',
            heading: 'Agents suggest',
            span: 12,
            source: 'governance.open',
            where: 'list is tasks',
            limit: 3,
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
            span: 12,
            source: 'register.tasks',
            where: IN_FLIGHT,
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
            span: 12,
            source: 'register.tasks',
            where: 'state is blocked',
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
               move on the Work pack's Overview, and `loop/research-usability-2026-09-21.md` finding 15 says what the
               overlap costs: the first reading is that the board is double-counting. */
            heading: 'Due this week',
            span: 12,
            source: 'register.tasks',
            where: `${LIVE}, state is not doing or review or blocked, by before +8d`,
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
            /* HOW FAR THE CYCLE HAS COME: the planned tickets ticked done against every ticket planned, one track a
               cycle. The newest cycle first, since the one a team is in is the one it asks about. */
            kind: 'progress',
            heading: 'This cycle',
            span: 6,
            source: 'register.cycle_plan',
            columns: [{ field: 'cycle' }, { field: 'done' }],
            order: [{ field: 'cycle', dir: 'desc' }],
            limit: 3,
            empty: 'Plan tickets into a cycle and how far it has come shows here.',
          },
          {
            /* BESIDE IT, THE BURNDOWN: how many tickets were open each morning of the last two weeks, against the two
               weeks before, from the Cycle days the standup agent or a teammate writes. */
            kind: 'lines',
            heading: 'Open tickets, each morning',
            span: 6,
            source: 'register.cycle_days',
            columns: [{ field: 'day' }, { field: 'open' }],
            back: 14,
            bucket: 'day',
            empty: 'No cycle day is written yet. The standup agent adds one each morning, or add today by hand.',
          },
          {
            kind: 'link',
            heading: 'Bring the team in',
            span: 12,
            authored: [
              { cells: ['Invite your team', INVITE, 'Send each teammate a link to this board'] },
              { cells: ['Connect an agent', CONNECT, 'The line to paste into Claude Code so an agent can take tickets'] },
            ],
          },
        ],
      },
      {
        /* CYCLES BESIDE WORK'S OWN BOARD. Tickets move on Work's Board, so this page is what Work does not hold: the cycles,
           what each one takes on, and what is stuck. It was called Board when tickets were this pack's own, and two pages
           called Board on one rail said nothing about which was which. */
        page: 'cycles',
        title: 'Cycles',
        nav: { section: 'Team', order: 10 },
        icon: 'rows',
        requires: ['register.tasks', 'register.cycles', 'register.cycle_plan'],
        blocks: [
          {
            kind: 'table',
            heading: 'Cycles',
            span: 12,
            source: 'register.cycles',
            columns: [
              { field: 'name', label: 'Cycle', width: 'minmax(16ch,1fr)' },
              { field: 'state', label: 'Status', width: '12ch' },
              { field: 'starts', label: 'Starts', width: '15ch' },
              { field: 'ends', label: 'Ends', width: '15ch', align: 'end' },
            ],
            order: [{ field: 'starts', dir: 'desc' }],
            empty: 'No cycles yet.',
          },
          {
            kind: 'table',
            heading: 'Cycle plan',
            span: 12,
            source: 'register.cycle_plan',
            columns: [
              { field: 'task', label: 'Ticket', width: 'minmax(20ch,1fr)' },
              { field: 'cycle', label: 'Cycle', width: 'minmax(10ch,16ch)' },
              { field: 'points', label: 'Points', width: '8ch', align: 'end' },
            ],
            limit: 30,
            empty: 'No ticket is planned into a cycle yet.',
          },
          {
            kind: 'table',
            heading: 'Blocked',
            span: 12,
            source: 'register.tasks',
            where: 'state is blocked',
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
        nav: { section: 'Team', order: 20 },
        icon: 'session',
        requires: ['register.tasks'],
        blocks: [
          {
            /* THE RUNS THE RECORD KNOWS ARE GOING (2.6.0), each with the agent's face and what it says it is doing, read
               from `sessions.live` as Home's own runs are. This page listed the `session` list by hand, and drew an
               empty list on a record whose agents were working. */
            kind: 'cards',
            heading: 'Working now',
            span: 12,
            source: 'sessions.live',
            columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
            limit: 12,
            empty: 'No agent is working here right now. Connect one in Settings, under Agents.',
          },
          {
            kind: 'table',
            heading: 'Taken by agents',
            span: 12,
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
            span: 12,
            source: 'activity',
            first: 5,
            empty: 'No agent has changed anything here yet.',
          },
          {
            kind: 'table',
            heading: 'Finished by agents',
            span: 12,
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
      { register: 'cycles', fields: { name: 'Cycle 1', state: 'active', goal: 'Ship the first version of the board' } },
      { register: 'cycle_plan', fields: { what: 'Write the release notes', points: 2, done: false } },
      { register: 'cycle_plan', fields: { what: 'Agree what goes in the next cycle', points: 1, done: false } },
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
  { register: 'things', fields: { name: TEAM_PROJECT, lane: 'building', health: 'on_track', next: 'Agree what goes in the next cycle', since: '-60d' } },
  { register: 'tasks', fields: { what: 'Write the release notes', state: 'doing', priority: 'normal', agent: 'claude' } },
  { register: 'tasks', fields: { what: 'Agree what goes in the next cycle', state: 'open', priority: 'high', by: '+3d' } },
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
      { register: 'cycle_plan', title: String(s.fields.what), field: 'cycle', to: 'cycles', target: 'Cycle 1' },
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
  holds: 'the tickets this record kept before the board moved onto Tickets; each one was copied there when Team was updated',
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
 * the page that holds them, its place on the rail and its sentences about a task say ticket too.
 */
export const TEAM_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  work: {
    Work: 'Tickets',
    'Open work by project': 'Open tickets by project',
    'No agent holds a task. An agent takes one by setting itself as its agent.': 'No agent holds a ticket. An agent takes one by setting itself as its agent.',
  },
};
