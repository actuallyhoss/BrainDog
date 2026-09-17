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
 */

type Body = Record<string, unknown>;

const TICKET = { field: 'what', label: 'Ticket', width: 'minmax(20ch,1fr)' } as const;

export const TEAM = {
  usecase: 'team',
  version: '2.0.0',
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
    nothing_needs_you: 'No call is waiting on you.',
    since_away: 'What the team and its agents did',
    lists: 'Team lists',
  },
  /* SETTINGS A TEAM CAN CHANGE (S8): call Tickets "Issues" (and one of them is then an issue), or a teammate a "Member", at
     /packs/usecase-team. Work's tasks are the team's tickets, and their statuses are said as a team says them. */
  labels: {
    tasks: 'Tickets',
    'tasks:one': 'ticket',
    'tasks:holds': 'every piece of work the team has, who owns it, how urgent it is and whether an agent took it',
    'tasks.state.open': 'To do',
    'tasks.state.doing': 'In progress',
    'tasks.state.review': 'In review',
    cycles: 'Cycles',
    cycle_plan: 'Cycle plan',
    people: 'Teammates',
    'people:holds': 'everyone on the team, the part each one plays and how to reach them',
    'people.role.collaborator': 'Teammate',
  },
  skills: [
    { name: 'task-triage', trigger: 'when a ticket is opened, to set its priority, suggest an owner and say whether an agent can take it' },
    { name: 'standup-digest', trigger: 'each morning, to say what moved yesterday, what is blocked and what agents finished' },
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
        mobile: ['what', 'cycle', 'points'],
        fields: [
          { id: 'what', label: 'Planned', type: 'text', required: true, search: true },
          { id: 'task', label: 'Ticket', type: 'ref', to: 'tasks', index: true },
          { id: 'cycle', label: 'Cycle', type: 'ref', to: 'cycles', index: true },
          { id: 'points', label: 'Points', type: 'int', min: 0 },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* HOME, AS A TEAM ANSWERS IT (S13): what is moving, what is stuck and what is due, with no place on the rail. */
        page: 'home-team',
        title: 'Team',
        icon: 'home',
        requires: ['register.tasks'],
        blocks: [
          {
            kind: 'table',
            heading: '{{config:voice_right_now}}',
            span: 12,
            source: 'register.tasks',
            where: 'state is doing or review',
            columns: [
              TICKET,
              { field: 'owner', label: 'Owner', width: 'minmax(10ch,16ch)' },
              { field: 'agent', label: 'Agent', width: '10ch' },
              { field: 'state', label: 'Status', width: '12ch', align: 'end' },
            ],
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
            heading: 'Due this week',
            span: 12,
            source: 'register.tasks',
            where: 'state is not done or dropped, by before +8d',
            columns: [TICKET, { field: 'priority', label: 'Priority', width: '10ch' }, { field: 'state', label: 'Status', width: '12ch' }, { field: 'by', label: 'Due', width: '13ch', align: 'end' }],
            order: [{ field: 'by', dir: 'asc' }],
            limit: 8,
            empty: 'Nothing is due this week.',
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
        page: 'agent-work',
        title: 'Agent work',
        nav: { section: 'Team', order: 20 },
        icon: 'session',
        requires: ['register.tasks', 'register.session'],
        blocks: [
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
            kind: 'cards',
            heading: 'Runs',
            span: 12,
            source: 'register.session',
            columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
            order: [{ field: 'last_seen', dir: 'desc' }],
            limit: 12,
            empty: 'No agent has started a run here yet.',
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
      { register: 'cycle_plan', fields: { what: 'Write the release notes', points: 2 } },
      { register: 'cycle_plan', fields: { what: 'Agree what goes in the next cycle', points: 1 } },
      { register: 'cycle_plan', fields: { what: 'Fix the sign-in link that expires too soon', points: 3 } },
      { register: 'cycle_plan', fields: { what: 'Wait on the design for the settings screen', points: 5 } },
    ],
  },
};

/** The tickets a team's record starts with, on Work's tasks (`install.ts` gives them to Work for this use case). */
export const TEAM_EXAMPLES: readonly Body[] = [
  { register: 'tasks', fields: { what: 'Write the release notes', state: 'doing', priority: 'normal', agent: 'claude' } },
  { register: 'tasks', fields: { what: 'Agree what goes in the next cycle', state: 'open', priority: 'high', by: '+3d' } },
  { register: 'tasks', fields: { what: 'Fix the sign-in link that expires too soon', state: 'review', priority: 'urgent', agent: 'claude' } },
  { register: 'tasks', fields: { what: 'Wait on the design for the settings screen', state: 'blocked', priority: 'normal', by: '+5d' } },
  { register: 'tasks', fields: { what: 'Tidy the backlog labels', state: 'done', priority: 'low', agent: 'claude' } },
];

/** The planned tickets linked to their ticket and to the example cycle once both are in (`links.ts`). */
export const TEAM_PLAN_LINKS = (TEAM.pack.seeds as { register: string; fields: Body }[])
  .filter((s) => s.register === 'cycle_plan')
  .flatMap((s) => [
    { register: 'cycle_plan', title: String(s.fields.what), field: 'task', to: 'tasks', target: String(s.fields.what) },
    { register: 'cycle_plan', title: String(s.fields.what), field: 'cycle', to: 'cycles', target: 'Cycle 1' },
  ]);

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

/**
 * HOW EACH OLD STATUS READS ON A TASK. A backlog ticket and one to do are both To do: what tells them apart on a team's
 * board now is whether a cycle has planned it.
 */
export const TICKET_STATES: Readonly<Record<string, string>> = {
  backlog: 'open',
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

/**
 * Copy each ticket of Team 1.x to a task, with its cycle and points on the cycle plan. Answers how many tickets were
 * copied. The tickets stay where they are, under Earlier tickets. A ticket whose title a task already has is taken as
 * copied, so running it twice copies nothing twice; a refused write is skipped.
 */
export async function moveTickets(io: TicketIo): Promise<number> {
  const tickets = (await io.rows('tickets').catch(() => null)) ?? [];
  if (tickets.length === 0) return 0;
  const titles = async (): Promise<readonly { seq: number | null; fields: Record<string, unknown> }[]> => (await io.rows('tasks').catch(() => null)) ?? [];
  const had = new Set((await titles()).map((t) => String(t.fields.what)));
  let moved = 0;
  for (const ticket of [...tickets].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const f = ticket.fields;
    const what = String(f.what ?? '');
    if (what === '' || had.has(what)) continue;
    const state = TICKET_STATES[String(f.state)] ?? 'open';
    const fields: Record<string, unknown> = { what, state };
    if (set(f.priority)) fields.priority = f.priority;
    if (set(f.owner)) fields.owner = f.owner;
    if (set(f.agent)) fields.agent = f.agent;
    if (set(f.due)) fields.by = f.due;
    if (set(f.note)) fields.note = f.note;
    if (Array.isArray(f.tags) && f.tags.length > 0) fields.tags = f.tags;
    /* A FINISHED TICKET KEEPS THE DAY IT WAS LAST CHANGED as the day it was done, rather than the day of the update. */
    if ((state === 'done' || state === 'dropped') && typeof ticket.updated_at === 'string') fields.done_on = ticket.updated_at.slice(0, 10);
    if (!(await io.create('tasks', fields).catch(() => false))) continue;
    had.add(what);
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
