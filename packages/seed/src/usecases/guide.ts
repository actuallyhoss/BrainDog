/**
 * New project guide: someone starting something who wants to be walked through it.
 *
 * IT NEEDS NO FIRST-PARTY MODULE. Work's tasks point at Projects and carry no order or milestone, and a
 * person starting a podcast has no portfolio yet, so the guide carries its own four lists: the milestones
 * a project passes, the steps that reach each one, the choices still to make, and what helps along the way.
 * IT CARRIES NO EXAMPLE ROWS, SINCE USE-A09. What onboarding heard forms the first plan (`guide-kinds.ts`): that kind of
 * project's, or for a project of no known kind the general plan, the six milestones a project passes from an idea to
 * keeping it going, the first three steps, a first choice and a first resource. They were this pack's example rows,
 * which a record is never given, so a boat or a thesis opened on empty lists. Now they are formed and the person's plan.
 *
 * WHERE YOU ARE, WHAT IS NEXT, WHAT IS STUCK AND WHAT WAITS ON YOU (1.1.0). A step can be blocked and say what it waits
 * on, and taken by an agent; a step, a milestone and a choice each keep the day they were finished, which the record
 * fills, so the Guide draws progress over time from rows alone. The milestone underway has a page of its own with its
 * steps, choices and what helps. Blocks about something that has not happened yet (a blocked step, an agent's work)
 * appear when it does.
 *
 * THE NEXT MILESTONE IS ASKED ABOUT, NOT TAKEN (1.2.0). When a milestone is reached and none is underway, Decide asks once
 * whether to start the next one in order; the setting `start_next_milestone` starts it instead (`GUIDE_NEXT`). Where a model
 * is configured, onboarding asks it for a first plan made for what was said, which waits on Decide as rows (`GUIDE_FORMS`).
 *
 * IT GROWS INTO A RUNNING PROJECT. Once every milestone of the idea stage is reached, Slash asks on Decide whether to add
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
  /* 1.2.1 BECAUSE HOME'S EMPTY TITLE LOSES ITS FULL STOP. A title ends without one everywhere else, and a record is
     offered the words only when the version goes up. */
  /* 1.3.0: Home draws the milestones as a path, done, next and later, with the decision waiting and its suggestion
     beside it, the next three steps to tick and what helps. A milestone says whether it is passed, which the record
     keeps in step with its status, and what it comes after.
     1.4.0: the voice says more of the record its own way, Home's empty lines, the add verb and the pen's line among
     them. Each is a new setting a person can change at /packs, so a minor step.
     1.5.0: calmer. Home and the Guide open on one line said from the guide's figures, where the Guide
     had a tile of four; every heading wears a glyph; each list is drawn only while it holds something; the Guide folds
     what is done and kept under Everything so far; and a milestone's page draws its steps, choices and what helps only
     while it has them. Only counts are added, so a minor step.
     1.6.1: the settings that hold each list's name and one of it are titled by what the list is called ("Name of
     the Steps list"), not by its id ("Label: steps"), and every list's name is declared before any
     singular, so the 64-setting ceiling costs a singular first. Titles and order only, so a patch step.
     1.7.1: the card's summary is one short line. Words only, so a patch step.
     1.8.0 (no briefs, 3 Nov): Your project and the Guide no longer open on a line counting milestones, steps and choices, which
     the path and the lists under it show. Two blocks taken away and none added, so a minor step; 1.7.1 is published. */
  version: '1.8.0',
  title: 'New project guide',
  summary: 'Milestones and next steps for a new project.',
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
    nothing_needs_you: 'Nothing is waiting on you',
    since_away: 'What you have done so far',
    lists: 'Your notes',
    /* THE REST OF THE LINES, patient and one step at a time: a step, a milestone, the project taking shape. */
    coming_up: 'Next steps',
    overdue: 'Running late',
    nothing_now: 'Nothing is waiting on you. Take the next step when you are ready.',
    nothing_due: 'No step has a day in the next two weeks.',
    fills_with: 'Your milestones, the next step and what you have done so far show up here as your project takes shape.',
    record_empty: 'Your project starts here',
    no_questions: 'Nothing to decide yet',
    new_row: 'Add',
    add_first: 'Write the first one',
    pen_waits: 'When there is a way to help this project along, it waits here until you keep it or say no.',
  },
  /* SETTINGS A PERSON CAN CHANGE: a writer may call Milestones "Drafts", a band may call Steps "Rehearsals". */
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
        /* THE MILESTONES ARE A PATH (1.3.0), and a path is a list that says which of its rows are done, in a yes or no,
           and what each belongs to. `passed` is the yes or no, kept in step with the status by the two rules below, and
           `after` is the milestone this one follows, usually left empty: a path is drawn in `order` whatever it says. */
        steps: { of: 'after', done: 'passed', order: 'order' },
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
          { id: 'passed', label: 'Passed', type: 'bool', default: false, index: true },
          { id: 'after', label: 'Comes after', type: 'ref', to: 'milestones', index: true },
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
          { id: 'why', label: 'Why', type: 'text' },
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
      /* WHAT THE PAGES' TILES ARE DRAWN ON, SINCE 1.5.0, each over its tile's own clauses. `{{it}}` is a milestone's
         own `what`, filled from the milestone's page. */
      count('guide-milestones-underway', 'Milestones underway', 'register.milestones', 'state is underway'),
      count('guide-resources', 'What helps', 'register.resources'),
      count('milestone-steps', 'Steps of a milestone', 'register.steps', 'milestone is {{it}}'),
      count('milestone-choices', 'Choices on a milestone', 'register.choices', 'milestone is {{it}}'),
      count('milestone-resources', 'What helps with a milestone', 'register.resources', 'milestone is {{it}}'),
      {
        /* PROGRESS OVER TIME: steps done by the week they were done, from the day the record fills. */
        ...count('guide-steps-done-by-week', 'Steps done, by week', 'register.steps', 'state is done, done_on after -63d'),
        group_by: 'done_on',
        bucket: 'week',
      },
      /* A MILESTONE IS PASSED WHEN IT IS REACHED, and no longer when it is moved back, so the path's marks and the status
         never disagree. The status is what a person moves; the yes or no is only what the path reads. */
      {
        rule: 'guide_milestone_passed',
        name: 'Mark a milestone passed on the path once it is reached',
        on: { written: { register: 'milestones', op: ['create', 'update'], fields: ['state'] } },
        when: 'state is reached',
        steps: [{ set: { field: 'passed', to: 'true' } }],
      },
      {
        rule: 'guide_milestone_open',
        name: 'Take a milestone off the path as passed when it is moved back',
        on: { written: { register: 'milestones', op: ['update'], fields: ['state'] } },
        when: 'state is not reached',
        steps: [{ set: { field: 'passed', to: 'false' } }],
      },
      {
        /* HOME, AS THE GUIDE ANSWERS IT: the way from the idea to keeping it going with where you are on it, the
           decision waiting on you and what is suggested, the next three steps, what is stuck and what helps. */
        page: 'home-guide',
        title: 'Your project',
        icon: 'home',
        requires: ['register.milestones', 'register.steps', 'register.choices', 'register.resources'],
        blocks: [
          {
            /* THE MILESTONES AS A PATH, top to bottom in their order: the ones passed are done, the first not passed is
               next, and the rest are later. The record marks them from `passed`, so the path and the status agree. THE
               WHOLE WIDTH SINCE 1.5.0, as every tile on this page is, so none leaves a half row when it is not drawn. */
            kind: 'steps',
            heading: '{{config:voice_right_now}}',
            icon: 'milestone',
            span: 12,
            source: 'register.milestones',
            columns: [{ field: 'what' }, { field: 'stage' }],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 8,
            empty: 'No milestones yet. Add the first point your project should reach.',
          },
          {
            /* ONE DECISION AT A TIME, with the option suggested drawn as the answer to take: whether to start the next
               milestone, or a choice an agent has weighed up. Answered here, never by opening Decide. */
            kind: 'queue',
            heading: 'A decision waiting',
            icon: 'ask',
            span: 12,
            source: 'governance.open',
            where: 'list is choices or milestones',
            tiles: true,
            limit: 1,
            when: { metric: 'questions-open', gt: 0 },
            empty: 'No decision is waiting on you.',
          },
          {
            /* THREE, AND EACH ONE TICKED WHERE IT IS: a step ticked here is done, and the next one moves up. */
            kind: 'todo',
            heading: 'Next three steps',
            icon: 'list-todo',
            span: 12,
            when: { metric: 'guide-steps-open', gt: 0 },
            source: 'register.steps',
            where: 'state is to_do or doing',
            columns: [{ field: 'what' }, { field: 'by' }],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 3,
            empty: 'No step is waiting. Add the next small thing to do.',
          },
          {
            kind: 'table',
            heading: 'Blocked',
            icon: 'octagon-alert',
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
            icon: 'scale',
            span: 12,
            source: 'register.choices',
            where: 'state is open',
            when: { metric: 'guide-choices-open', gt: 0 },
            columns: [
              { field: 'question', label: 'Question', width: 'minmax(20ch,1fr)' },
              { field: 'milestone', label: 'Milestone', width: 'minmax(10ch,20ch)' },
            ],
            limit: 5,
            empty: '{{config:voice_nothing_needs_you}}',
          },
          {
            /* WHAT HELPS, last, because it is what a person reaches for once they know the step they are taking. */
            kind: 'table',
            heading: 'Resources',
            icon: 'book-open',
            span: 12,
            when: { metric: 'guide-resources', gt: 0 },
            source: 'register.resources',
            columns: [
              { field: 'name', label: 'Resource', width: 'minmax(18ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '10ch' },
              { field: 'link', label: 'Link', width: 'minmax(12ch,24ch)' },
            ],
            limit: 5,
            empty: 'Nothing saved yet. Keep the guides and tools that help here.',
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
            kind: 'table',
            heading: '{{config:voice_right_now}}',
            icon: 'flag',
            span: 12,
            source: 'register.milestones',
            where: 'state is underway',
            when: { metric: 'guide-milestones-underway', gt: 0 },
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
            icon: 'list-todo',
            span: 12,
            when: { metric: 'guide-steps-open', gt: 0 },
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
            icon: 'octagon-alert',
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
            icon: 'scale',
            span: 12,
            source: 'register.choices',
            where: 'state is open',
            when: { metric: 'guide-choices-open', gt: 0 },
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
            icon: 'gauge',
            span: 12,
            source: 'register.steps',
            columns: [{ field: 'milestone' }, { field: 'state' }],
            /* IN THE ORDER THE STEPS ARE TAKEN, so the milestone you are on comes first. */
            order: [{ field: 'order', dir: 'asc' }],
            limit: 6,
            empty: 'Give a milestone its steps and how far it is shows here.',
          },
          {
            /* WHAT IS DONE AND KEPT, FOLDED SHUT, SINCE 1.5.0: above it the page is what to do next. */
            kind: 'section',
            heading: 'Everything so far',
            icon: 'history',
            span: 12,
            fold: true,
          },
          {
            kind: 'series',
            heading: 'Steps done, by week',
            icon: 'chart-column',
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
            icon: 'milestone',
            span: 12,
            source: 'register.milestones',
            when: { metric: 'guide-milestones', gt: 0 },
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
            icon: 'book-open',
            span: 12,
            source: 'register.resources',
            when: { metric: 'guide-resources', gt: 0 },
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
            icon: 'bot',
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
            icon: 'circle-check',
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
            icon: 'check',
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
            icon: 'gauge',
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
            icon: 'list-todo',
            span: 12,
            source: 'register.steps',
            where: 'milestone is {{what}}',
            /* ONLY ONCE IT HAS ONE, SINCE 1.5.0: with none, Progress above says so, and the two said it twice. */
            when: { metric: 'milestone-steps:{{what}}', gt: 0 },
            columns: [{ field: 'what' }, { field: 'by' }, { field: 'state' }],
            order: [{ field: 'order', dir: 'asc' }],
            limit: 12,
            empty: 'This milestone has no steps yet. Add the first small thing to do.',
          },
          {
            kind: 'table',
            heading: 'Choices',
            icon: 'scale',
            span: 12,
            source: 'register.choices',
            where: 'milestone is {{what}}',
            when: { metric: 'milestone-choices:{{what}}', gt: 0 },
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
            icon: 'book-open',
            span: 12,
            source: 'register.resources',
            where: 'milestone is {{what}}',
            when: { metric: 'milestone-resources:{{what}}', gt: 0 },
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
  },
};

/** The guide's own setting, beside its voice and labels: off, so reaching a milestone asks before the next one starts. */
export const GUIDE_SETTINGS = {
  start_next_milestone: { type: 'bool', label: 'Start the next milestone when one is reached, without asking', default: false },
} as const;

/**
 * WHAT MOVES ON WHEN A MILESTONE IS REACHED: the first milestone not started, by order, once none is underway. Asked once on
 * Decide, or started directly when `start_next_milestone` is on (`@braindog/record` `NextSpec`).
 */
export const GUIDE_NEXT = {
  register: 'milestones',
  field: 'state',
  from: 'not_started',
  to: 'underway',
  order: 'order',
  setting: 'start_next_milestone',
  question: 'You reached "{reached}". Start "{next}" next?',
  note: 'Started the next milestone, as the guide is set to.',
} as const;

const STAGES = ['idea', 'plan', 'build', 'launch', 'grow'] as const;

/**
 * THE PLAN A MODEL MAY FORM for what somebody said they are starting (`@braindog/record` `FormSpec`): the guide's four lists,
 * the fields a model may fill in each, how many rows, and how long each text may be. Links point only at milestones in the
 * same plan. A resource carries no link field here: an address a model wrote is not one anybody checked.
 */
export const GUIDE_FORMS = {
  what: 'A first plan for a new project: the milestones it passes in order from the idea to keeping it going (each at a stage: idea, plan, build, launch or grow), the first small steps toward them, the choices it has to make, and what helps along the way.',
  question: 'Slash drafted a first plan for your project from what you said. Add its milestones, steps, choices and what helps?',
  why: 'Drafted by Slash from what you said the project is.',
  lists: [
    {
      register: 'milestones',
      least: 3,
      most: 8,
      fields: { what: { text: 80, required: true }, stage: { one: STAGES, required: true }, why: { text: 280 } },
      first: { state: 'underway' },
      rest: { state: 'not_started' },
      position: 'order',
    },
    {
      register: 'steps',
      least: 1,
      most: 12,
      fields: { what: { text: 120, required: true }, milestone: { link: 'milestones', required: true }, by: { days: 90 }, how: { text: 400 } },
      first: { state: 'to_do' },
      rest: { state: 'to_do' },
      position: 'order',
    },
    {
      register: 'choices',
      least: 0,
      most: 6,
      fields: { question: { text: 120, required: true }, options: { text: 300 }, milestone: { link: 'milestones' } },
      first: { state: 'open' },
      rest: { state: 'open' },
    },
    {
      register: 'resources',
      least: 0,
      most: 8,
      fields: { name: { text: 100, required: true }, kind: { one: ['guide', 'tool', 'person', 'example', 'other'] }, milestone: { link: 'milestones' }, note: { text: 280 } },
    },
  ],
} as const;

/**
 * WHAT THE GUIDE GROWS INTO: once the idea stage is over, Projects and Work, so the project can be run as well as guided.
 * Slash reads the two figures and asks on Decide; accepting installs the two modules beside the guide and keeps every row.
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

/**
 * WHAT THE MODULES SAY TO SOMEBODY STARTING A PROJECT, by module and then by the module's own words (`MODULE_NAMES` in
 * `install.ts`), laid over the plain words every use case but a business's gets. Work is what `GUIDE_GROWS` adds once
 * the idea stage is done, and to somebody who has never run a project it is their to-do list, not a workplace.
 */
export const GUIDE_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  work: {
    Work: 'To do',
  },
};
