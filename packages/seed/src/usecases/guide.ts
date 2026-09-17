/**
 * New project guide: someone starting something who wants to be walked through it
 * (`loop/research-spark.md` §4).
 *
 * IT NEEDS NO FIRST-PARTY MODULE. Work's tasks point at Projects and carry no order or milestone, and a
 * person starting a podcast has no portfolio yet, so the guide carries its own four lists: the milestones
 * a project passes, the steps that reach each one, the choices still to make, and what helps along the way.
 * The example rows are the six milestones a project passes, from an idea to keeping it going, the first three steps,
 * a first choice and a first resource, so the guide opens already guiding. When onboarding heard what the project is,
 * the examples are that kind of project's plan instead (`guide-kinds.ts`).
 *
 * WHERE YOU ARE, WHAT IS NEXT, WHAT IS STUCK AND WHAT WAITS ON YOU (1.1.0). A step can be blocked and say what it waits
 * on, and taken by an agent; a step, a milestone and a choice each keep the day they were finished, which the record
 * fills, so the Guide draws progress over time from rows alone. The milestone underway has a page of its own with its
 * steps, choices and what helps. Blocks about something that has not happened yet (a blocked step, an agent's work)
 * appear when it does.
 *
 * IT GROWS INTO A RUNNING PROJECT. Once every milestone of the idea stage is reached, Spark asks on Decide whether to add
 * Projects and Work beside the guide (`GUIDE_GROWS`). Nothing is taken away and no row moves.
 */

const STEP = { field: 'what', label: 'Step', width: 'minmax(18ch,1fr)' } as const;
const MILESTONE = { field: 'milestone', label: 'Milestone', width: 'minmax(10ch,22ch)' } as const;
const CHANGED = { field: 'changed', label: 'Changed by', width: '16ch' } as const;

/** A count of rows, as the guide's figures are. */
const count = (metric: string, name: string, source: string, where?: string) => ({
  metric,
  name,
  source,
  ...(where === undefined ? {} : { where }),
  value: { count: 'id' },
  format: 'int',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
});

export const GUIDE = {
  usecase: 'guide',
  version: '1.1.0',
  title: 'New project guide',
  summary: 'The milestones of your project, the next step to take, the choices to make and what helps along the way.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'starter',
  tone: 'patient, one step at a time',
  signals: [
    'new project', 'a new project', 'start a', 'starting a', 'start something', 'starting something', 'something new',
    'get started', 'getting started', 'where to begin', 'where to start', "don't know where", 'from scratch',
    'first time', 'beginner', 'guide', 'step by step', 'checklist', 'milestones', 'an idea', 'my idea',
    'podcast', 'youtube channel', 'newsletter', 'blog', 'book', 'novel', 'album', 'band', 'charity', 'event',
    'community', 'course of my own', 'passion project',
  ],
  modules: [],
  voice: {
    home: 'Your project',
    right_now: 'Where you are',
    needs_you: 'Waiting on you',
    nothing_needs_you: 'Nothing is waiting on you.',
    since_away: 'What you have done so far',
    lists: 'Your notes',
  },
  /* SETTINGS A PERSON CAN CHANGE (S8): a writer may call Milestones "Drafts", a band may call Steps "Rehearsals". */
  labels: {
    milestones: 'Milestones',
    steps: 'Steps',
    choices: 'Choices',
    resources: 'Resources',
  },
  skills: [
    { name: 'project-coach', trigger: 'when a milestone is reached or a step has sat still for a week, to suggest the next small step' },
    { name: 'step-taker', trigger: 'when a step is one an agent can do, to take it, say so in Taken by, and mark it done or blocked with what it waits on' },
    { name: 'choice-recorder', trigger: 'when a choice is made in conversation, to record what was picked and why, and add anything that helped as a resource' },
  ],
  pack: {
    pack: 'usecase-guide',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'milestones',
        name: 'Milestones',
        one: 'milestone',
        icon: 'star',
        holds: 'the points your project passes on the way, from an idea to something people use',
        title: 'what',
        mobile: ['what', 'stage', 'state'],
        state: 'state',
        done: ['reached'],
        finished: 'reached_on',
        fields: [
          { id: 'what', label: 'Milestone', type: 'text', required: true, search: true },
          {
            id: 'stage',
            label: 'Stage',
            type: 'enum',
            values: ['idea', 'plan', 'build', 'launch', 'grow'],
            labels: { idea: 'Idea', plan: 'Plan', build: 'Build', launch: 'Launch', grow: 'Grow' },
            index: true,
          },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['not_started', 'underway', 'reached'],
            labels: { not_started: 'Not started', underway: 'Underway', reached: 'Reached' },
            default: 'not_started',
            required: true,
            index: true,
          },
          { id: 'order', label: 'Order', type: 'int', index: true },
          { id: 'target', label: 'Aim for', type: 'day', index: true },
          { id: 'reached_on', label: 'Reached on', type: 'day', index: true },
          { id: 'why', label: 'Why it matters', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* `choices` AND NOT `decisions`, because Decide is on every rail and two things called decisions would read as one. */
        register: 'choices',
        name: 'Choices',
        one: 'choice',
        icon: 'decide',
        holds: 'the questions your project has to answer, the options for each, what you picked and why',
        title: 'question',
        mobile: ['question', 'state', 'picked'],
        state: 'state',
        done: ['made'],
        finished: 'made_on',
        fields: [
          { id: 'question', label: 'Question', type: 'text', required: true, search: true },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['open', 'made'],
            labels: { open: 'To make', made: 'Made' },
            default: 'open',
            required: true,
            index: true,
          },
          { id: 'options', label: 'Options', type: 'document' },
          { id: 'picked', label: 'Picked', type: 'text' },
          { id: 'why', label: 'Why', type: 'document' },
          { id: 'milestone', label: 'Milestone', type: 'ref', to: 'milestones', index: true },
          { id: 'made_on', label: 'Made on', type: 'day', index: true },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'resources',
        name: 'Resources',
        one: 'resource',
        icon: 'link',
        holds: 'the guides, tools, people and examples that help, and the milestone each one helps with',
        title: 'name',
        mobile: ['name', 'kind', 'milestone'],
        fields: [
          { id: 'name', label: 'Resource', type: 'text', required: true, search: true },
          {
            id: 'kind',
            label: 'Kind',
            type: 'enum',
            values: ['guide', 'tool', 'person', 'example', 'other'],
            labels: { guide: 'Guide', tool: 'Tool', person: 'Person', example: 'Example', other: 'Other' },
            index: true,
          },
          { id: 'link', label: 'Link', type: 'url' },
          { id: 'milestone', label: 'Milestone', type: 'ref', to: 'milestones', index: true },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      /* STEPS LAST OF THE LISTS, so a guide just made opens on its steps (onboarding's way onward is a use case's last list). */
      {
        register: 'steps',
        name: 'Steps',
        one: 'step',
        icon: 'task',
        holds: 'the small things to do next, each towards a milestone, in the order to do them, and who took each one',
        title: 'what',
        mobile: ['what', 'milestone', 'state'],
        state: 'state',
        done: ['done', 'skipped'],
        finished: 'done_on',
        fields: [
          { id: 'what', label: 'Step', type: 'text', required: true, search: true },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['to_do', 'doing', 'blocked', 'done', 'skipped'],
            labels: { to_do: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done', skipped: 'Skipped' },
            default: 'to_do',
            required: true,
            index: true,
          },
          { id: 'milestone', label: 'Milestone', type: 'ref', to: 'milestones', index: true },
          { id: 'order', label: 'Order', type: 'int', index: true },
          { id: 'by', label: 'By', type: 'day', index: true, deadline: true, remind: ['0d'] },
          { id: 'waiting_on', label: 'Waiting on', type: 'text' },
          /* AN AGENT THAT TAKES A STEP SAYS SO HERE, as a team's ticket does, so Taken by agents lists it. */
          { id: 'agent', label: 'Taken by', type: 'text', index: true },
          { id: 'done_on', label: 'Done on', type: 'day', index: true },
          { id: 'how', label: 'How', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      /* THE FIGURES: counts of rows, so a record and the sample read them the same way. */
      count('guide-milestones', 'Milestones', 'register.milestones'),
      count('guide-milestones-reached', 'Milestones reached', 'register.milestones', 'state is reached'),
      count('guide-steps-open', 'Steps to take', 'register.steps', 'state is to_do or doing'),
      count('guide-steps-blocked', 'Steps blocked', 'register.steps', 'state is blocked'),
      count('guide-steps-agents', 'Steps an agent has taken', 'register.steps', 'agent is set, state is not done or skipped'),
      count('guide-steps-done', 'Steps done', 'register.steps', 'state is done'),
      count('guide-steps-done-7d', 'Steps done in 7 days', 'register.steps', 'state is done, done_on after -8d'),
      count('guide-choices-open', 'Choices to make', 'register.choices', 'state is open'),
      count('guide-choices-made', 'Choices made', 'register.choices', 'state is made'),
      /* WHETHER THE IDEA STAGE HAS ENDED, which is when the guide asks about running the project (`GUIDE_GROWS`). */
      count('guide-idea-left', 'Idea milestones still to reach', 'register.milestones', 'stage is idea, state is not reached'),
      count('guide-idea-reached', 'Idea milestones reached', 'register.milestones', 'stage is idea, state is reached'),
      {
        /* PROGRESS OVER TIME: steps done by the week they were done, from the day the record fills. */
        ...count('guide-steps-done-by-week', 'Steps done, by week', 'register.steps', 'state is done, done_on after -63d'),
        group_by: 'done_on',
        bucket: 'week',
      },
      {
        /* HOME, AS THE GUIDE ANSWERS IT (S13): the milestone you are on, the next steps, what is stuck and the choices waiting on you. */
        page: 'home-guide',
        title: 'Your project',
        icon: 'home',
        requires: ['register.milestones', 'register.steps', 'register.choices'],
        blocks: [
          {
            kind: 'table',
            heading: '{{config:voice_right_now}}',
            span: 12,
            source: 'register.milestones',
            where: 'state is underway',
            columns: [
              { field: 'what', label: 'Milestone', width: 'minmax(20ch,1fr)' },
              { field: 'stage', label: 'Stage', width: '10ch' },
              { field: 'target', label: 'Aim for', width: '13ch', align: 'end' },
            ],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 3,
            empty: 'No milestone is underway. Pick the next one on the Guide.',
          },
          {
            kind: 'steps',
            heading: 'Your next steps',
            span: 12,
            source: 'register.steps',
            where: 'state is to_do or doing',
            columns: [{ field: 'what' }, { field: 'by' }, { field: 'milestone' }],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 3,
            empty: 'No step is waiting. Add the next small thing to do.',
          },
          {
            kind: 'table',
            heading: 'Blocked',
            span: 12,
            when: { metric: 'guide-steps-blocked', gt: 0 },
            source: 'register.steps',
            where: 'state is blocked',
            columns: [STEP, { field: 'waiting_on', label: 'Waiting on', width: 'minmax(12ch,24ch)' }],
            limit: 5,
            empty: 'Nothing is blocked.',
          },
          {
            kind: 'table',
            heading: '{{config:voice_needs_you}}',
            span: 12,
            source: 'register.choices',
            where: 'state is open',
            columns: [
              { field: 'question', label: 'Question', width: 'minmax(20ch,1fr)' },
              { field: 'milestone', label: 'Milestone', width: 'minmax(10ch,20ch)' },
            ],
            limit: 5,
            empty: '{{config:voice_nothing_needs_you}}',
          },
        ],
      },
      {
        /* `Guide` AND NOT `Your project`, which is what this use case's voice calls Home: two rail items with one name. */
        page: 'guide',
        title: 'Guide',
        nav: { section: 'Guide', order: 10 },
        icon: 'star',
        requires: ['register.milestones', 'register.steps', 'register.choices', 'register.resources'],
        blocks: [
          {
            kind: 'stat',
            lead: true,
            heading: 'So far',
            span: 12,
            cells: [
              { metric: 'guide-milestones-reached', label: 'Milestones reached', note: 'of {{guide-milestones}}' },
              /* NO NOTE THAT WOULD SAY NOUGHT ON THE FIRST DAY: what is blocked, done or made has a block of its own once it is. */
              { metric: 'guide-steps-open', label: 'Steps to take' },
              { metric: 'guide-steps-done-7d', label: 'Done in 7 days' },
              { metric: 'guide-choices-open', label: 'Choices to make' },
            ],
          },
          {
            kind: 'table',
            heading: '{{config:voice_right_now}}',
            span: 12,
            source: 'register.milestones',
            where: 'state is underway',
            columns: [
              { field: 'what', label: 'Milestone', width: 'minmax(20ch,1fr)' },
              { field: 'stage', label: 'Stage', width: '10ch' },
              { field: 'target', label: 'Aim for', width: '13ch', align: 'end' },
            ],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 3,
            empty: 'No milestone is underway. Mark the next one Underway below.',
          },
          {
            kind: 'steps',
            heading: 'Your next steps',
            span: 12,
            source: 'register.steps',
            where: 'state is to_do or doing',
            columns: [{ field: 'what' }, { field: 'by' }, { field: 'milestone' }],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 5,
            empty: 'No step is waiting. Add the next small thing to do.',
          },
          {
            kind: 'table',
            heading: 'Blocked',
            span: 12,
            when: { metric: 'guide-steps-blocked', gt: 0 },
            source: 'register.steps',
            where: 'state is blocked',
            columns: [STEP, { field: 'waiting_on', label: 'Waiting on', width: 'minmax(12ch,24ch)' }, MILESTONE, CHANGED],
            empty: 'Nothing is blocked.',
          },
          {
            kind: 'table',
            heading: 'Choices to make',
            span: 12,
            source: 'register.choices',
            where: 'state is open',
            columns: [
              { field: 'question', label: 'Question', width: 'minmax(20ch,1fr)' },
              MILESTONE,
            ],
            empty: 'No choice is waiting on you.',
          },
          {
            /* HOW FAR EACH MILESTONE IS, by its steps done: a milestone with no steps yet has nothing to fill. */
            kind: 'progress',
            heading: 'How far each milestone is',
            span: 12,
            source: 'register.steps',
            columns: [{ field: 'milestone' }, { field: 'state' }],
            /* IN THE ORDER THE STEPS ARE TAKEN, so the milestone you are on comes first. */
            order: [{ field: 'order', dir: 'asc' }],
            limit: 6,
            empty: 'Give a milestone its steps and how far it is shows here.',
          },
          {
            kind: 'series',
            heading: 'Steps done, by week',
            span: 12,
            when: { metric: 'guide-steps-done', gt: 0 },
            series: [{ metric: 'guide-steps-done-by-week', label: 'Done' }],
            back: 8,
            ahead: 0,
            empty: 'No step was done in these weeks.',
          },
          {
            kind: 'table',
            heading: 'Milestones',
            span: 12,
            source: 'register.milestones',
            columns: [
              { field: 'what', label: 'Milestone', width: 'minmax(20ch,1fr)' },
              { field: 'stage', label: 'Stage', width: '10ch' },
              { field: 'state', label: 'Status', width: '14ch' },
              { field: 'target', label: 'Aim for', width: '15ch', align: 'end' },
            ],
            order: [{ field: 'order', dir: 'asc' }],
            empty: 'No milestones yet.',
          },
          {
            kind: 'table',
            heading: 'What helps',
            span: 12,
            source: 'register.resources',
            columns: [
              { field: 'name', label: 'Resource', width: 'minmax(20ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '10ch' },
              MILESTONE,
              { field: 'link', label: 'Link', width: 'minmax(12ch,24ch)' },
            ],
            empty: 'Nothing saved yet. Keep the guides and tools that help here.',
          },
          {
            /* WHO DID WHAT: a step an agent holds, and the choices and steps finished, each with who changed it last. */
            kind: 'table',
            heading: 'Taken by agents',
            span: 12,
            when: { metric: 'guide-steps-agents', gt: 0 },
            source: 'register.steps',
            where: 'agent is set, state is not done or skipped',
            columns: [STEP, { field: 'agent', label: 'Taken by', width: '12ch' }, { field: 'state', label: 'Status', width: '12ch' }, CHANGED],
            empty: 'No agent has taken a step.',
          },
          {
            kind: 'table',
            heading: 'Choices made',
            span: 12,
            when: { metric: 'guide-choices-made', gt: 0 },
            source: 'register.choices',
            where: 'state is made',
            columns: [
              { field: 'question', label: 'Question', width: 'minmax(16ch,1fr)' },
              { field: 'picked', label: 'Picked', width: 'minmax(10ch,20ch)' },
              { field: 'why', label: 'Why', width: 'minmax(14ch,1fr)' },
              CHANGED,
            ],
            order: [{ field: 'made_on', dir: 'desc' }],
            limit: 8,
            empty: 'No choice has been made yet.',
          },
          {
            kind: 'table',
            heading: 'Done lately',
            span: 12,
            when: { metric: 'guide-steps-done', gt: 0 },
            source: 'register.steps',
            where: 'state is done',
            columns: [STEP, MILESTONE, { field: 'done_on', label: 'Done on', width: '13ch', align: 'end' }, CHANGED],
            order: [{ field: 'done_on', dir: 'desc' }],
            limit: 8,
            empty: 'No step is done yet.',
          },
        ],
      },
      {
        /* THE MILESTONE UNDERWAY, ON A PAGE OF ITS OWN: its steps, its choices and what helps with it. A milestone not started
           or reached has none, so the rail grows by the one you are on. */
        page: 'milestone',
        title: '{{what}}',
        for: { register: 'milestones', where: 'state is underway' },
        nav: { section: 'Guide', order: 20 },
        icon: 'star',
        requires: ['register.milestones', 'register.steps', 'register.choices', 'register.resources'],
        blocks: [
          {
            kind: 'progress',
            heading: 'Progress',
            span: 12,
            source: 'register.steps',
            where: 'milestone is {{what}}',
            columns: [{ field: 'milestone' }, { field: 'state' }],
            empty: 'This milestone has no steps yet. Add the first and its progress shows here.',
          },
          {
            /* EVERY STEP OF IT IN ORDER, with its status, so what is done stays beside what is left. */
            kind: 'steps',
            heading: 'Steps',
            span: 12,
            source: 'register.steps',
            where: 'milestone is {{what}}',
            columns: [{ field: 'what' }, { field: 'by' }, { field: 'state' }],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 12,
            empty: 'This milestone has no steps yet. Add the first small thing to do.',
          },
          {
            kind: 'table',
            heading: 'Choices',
            span: 12,
            source: 'register.choices',
            where: 'milestone is {{what}}',
            columns: [
              { field: 'question', label: 'Question', width: 'minmax(16ch,1fr)' },
              { field: 'state', label: 'Status', width: '10ch' },
              { field: 'picked', label: 'Picked', width: 'minmax(10ch,20ch)' },
              CHANGED,
            ],
            empty: 'No choice to make on this milestone.',
          },
          {
            kind: 'table',
            heading: 'What helps',
            span: 12,
            source: 'register.resources',
            where: 'milestone is {{what}}',
            columns: [
              { field: 'name', label: 'Resource', width: 'minmax(18ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '10ch' },
              { field: 'link', label: 'Link', width: 'minmax(12ch,24ch)' },
              CHANGED,
            ],
            empty: 'Nothing saved for this milestone yet.',
          },
        ],
      },
    ],
    seeds: [
      { register: 'milestones', fields: { what: 'Say what it is and who it is for', stage: 'idea', state: 'underway', order: 1 } },
      { register: 'milestones', fields: { what: 'Find the people who want it', stage: 'idea', state: 'not_started', order: 2 } },
      { register: 'milestones', fields: { what: 'Plan the smallest first version', stage: 'plan', state: 'not_started', order: 3 } },
      { register: 'milestones', fields: { what: 'Make the first version', stage: 'build', state: 'not_started', order: 4 } },
      { register: 'milestones', fields: { what: 'Share it with the first people', stage: 'launch', state: 'not_started', order: 5 } },
      { register: 'milestones', fields: { what: 'Keep it going and learn from it', stage: 'grow', state: 'not_started', order: 6 } },
      { register: 'steps', fields: { what: 'Write one sentence about what this is and who it is for', state: 'to_do', order: 1, by: '+2d' } },
      { register: 'steps', fields: { what: 'Name three people who would use it', state: 'to_do', order: 2, by: '+5d' } },
      { register: 'steps', fields: { what: 'Ask one of them what they would want first', state: 'to_do', order: 3, by: '+9d' } },
      { register: 'choices', fields: { question: 'What will it be called?', state: 'open' } },
      { register: 'resources', fields: { name: 'Three projects like yours to learn from', kind: 'example' } },
    ],
  },
};

/**
 * WHAT THE GUIDE GROWS INTO: once the idea stage is over, Projects and Work, so the project can be run as well as guided.
 * Spark reads the two figures and asks on Decide; accepting installs the two modules beside the guide and keeps every row.
 */
export const GUIDE_GROWS = {
  when: [
    { metric: 'guide-idea-left', is: 0 },
    { metric: 'guide-idea-reached', gt: 0 },
  ],
  install: ['portfolio', 'work'],
  why: 'Every milestone of the idea stage is reached.',
  /* NO PACK IS NAMED HERE: one may be on already, and Decide lists what the answer installs. */
  question: 'Your idea stage is done. Add what it takes to run the project as well as guide it? Your milestones, steps and choices stay as they are.',
} as const;
