/**
 * Student: courses, what is due, and how each piece of work went.
 *
 * IT NEEDS NO FIRST-PARTY MODULE. Studying is not a business, so nothing here points at a project, an
 * invoice or a client. Onboarding still installs People for the person's own row, and nothing here leans
 * on it, so a student who switches People off loses nothing this use case holds.
 */

export const STUDENT = {
  usecase: 'student',
  /* 1.2.1 BECAUSE HOME'S EMPTY TITLE LOSES ITS FULL STOP. A title ends without one everywhere else, and a record is
     offered the words only when the version goes up.
     1.3.0: Home leads with Add homework, then what is due this week, the week's study as a strip and the study streak;
     the lists are "My lists", not "Notebooks"; and the pack plants no example course.
     1.4.0: the voice says more of the record the way a student hears it, Home's empty lines, the add verb and the
     pen's line among them. Each is a new setting a person can change at /packs, so a minor step. */
  version: '1.4.0',
  title: 'Student',
  summary: 'Your courses, what is due and when, and how each piece of work went.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain and encouraging',
  signals: [
    'student', 'students', 'study', 'studies', 'studying', 'homework', 'exam', 'exams', 'revision', 'revising',
    'course', 'courses', 'coursework', 'class', 'classes', 'lecture', 'lectures', 'assignment', 'assignments',
    'essay', 'essays', 'thesis', 'dissertation', 'degree', 'university', 'uni', 'college', 'school', 'semester',
    'grades', 'phd', 'masters', 'undergraduate', 'a levels', 'gcse', 'gcses', 'teacher', 'teachers', 'tutor',
  ],
  modules: [],
  voice: {
    home: 'Today',
    right_now: 'This week',
    needs_you: 'Coming up',
    nothing_needs_you: 'Nothing is due',
    since_away: 'Since you last looked',
    /* "My lists", AND IT WAS "Notebooks": a notebook is a thing a student writes in, and the rail's word is for the
       lists the record keeps, so it read as though the record held their notes. */
    lists: 'My lists',
    /* THE REST OF WHAT A STUDENT READS, SAID AS A STUDENT HEARS IT: what is due, work, a course. Nothing here
       names an invoice, a payment or a balance, and nothing is "overdue". */
    coming_up: 'Due soon',
    overdue: 'Late',
    nothing_now: 'Nothing is due right now.',
    nothing_due: 'Nothing is due in the next two weeks. A good time to get ahead.',
    fills_with: 'What is due, what you are working on and how each piece of work went show up here as you add your courses.',
    record_empty: 'Nothing here yet',
    no_questions: 'Nothing to decide',
    inbox_clear: 'Nothing new has come in',
    new_row: 'Add',
    add_first: 'Add the first one',
    pen_waits: 'When there is a way to fit this to how you study, it waits here until you keep it or say no.',
  },
  /* THE LISTS' OWN WORDS, SO A STUDENT CAN CALL THEM WHAT THEIR SCHOOL DOES: Modules, Coursework, Revision. Kept as the
     pack's settings, so they are renamed at /packs/usecase-student and travel with a shared copy. */
  labels: {
    courses: 'Courses',
    'courses:one': 'course',
    assignments: 'Assignments',
    'assignments:one': 'assignment',
    study_sessions: 'Study sessions',
    'study_sessions:one': 'study session',
  },
  skills: [{ name: 'study-planner', trigger: 'when an assignment is added or its due date moves, to plan the days before it' }],
  pack: {
    pack: 'usecase-student',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'courses',
        name: 'Courses',
        one: 'course',
        icon: 'doc',
        holds: 'the courses you are taking, the term each runs in and who teaches it',
        title: 'name',
        mobile: ['name', 'term', 'teacher'],
        fields: [
          { id: 'name', label: 'Course', type: 'text', required: true, search: true },
          { id: 'term', label: 'Term', type: 'text', index: true },
          { id: 'teacher', label: 'Teacher', type: 'text' },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'assignments',
        name: 'Assignments',
        one: 'assignment',
        icon: 'task',
        holds: 'every piece of work with its course, its due date and how it went',
        title: 'what',
        mobile: ['what', 'due', 'state'],
        state: 'state',
        done: ['handed_in', 'marked'],
        fields: [
          { id: 'what', label: 'Assignment', type: 'text', required: true, search: true },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['to_do', 'doing', 'handed_in', 'marked'],
            labels: { to_do: 'To do', doing: 'Doing', handed_in: 'Handed in', marked: 'Marked' },
            default: 'to_do',
            required: true,
            index: true,
          },
          /* THE COURSE MAKES AN ASSIGNMENT READABLE: "Problem set 1" is nobody's until it says whose, so the list shows it. */
          { id: 'course', label: 'Course', type: 'ref', to: 'courses', index: true, qualifies: 'what' },
          { id: 'due', label: 'Due', type: 'day', index: true, deadline: true, remind: ['-2d', '0d'] },
          { id: 'grade', label: 'Grade', type: 'text' },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'study_sessions',
        name: 'Study sessions',
        one: 'study session',
        icon: 'calendar',
        holds: 'the time you set aside to study, what for and how long',
        title: 'what',
        mobile: ['what', 'on', 'minutes'],
        fields: [
          { id: 'what', label: 'Session', type: 'text', required: true, search: true },
          /* THE COURSE MAKES AN ASSIGNMENT READABLE: "Problem set 1" is nobody's until it says whose, so the list shows it. */
          { id: 'course', label: 'Course', type: 'ref', to: 'courses', index: true, qualifies: 'what' },
          { id: 'on', label: 'Day', type: 'day', required: true, index: true },
          { id: 'minutes', label: 'Minutes', type: 'int' },
          { id: 'done', label: 'Done', type: 'bool', index: true },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* HOME, AS THIS USE CASE ANSWERS IT: Add homework first, because a piece of
           work not written down the moment it is set is the one forgotten; then what is due this week, the week's
           study as a strip, the study streak, and what is due after. No `nav`, because Home is already on the rail: the
           display draws the page called `home-<use case>` there in place of the house figures. Every block is a whole
           row, so at 390 the page stacks in this order, the capture first. */
        page: 'home-student',
        title: 'Today',
        icon: 'home',
        requires: ['register.assignments', 'register.study_sessions'],
        blocks: [
          {
            /* THE HEADING IS THE PROMPT (`render/src/capture.ts`), and a piece of work added here is To do with no day
               until the student gives it one. */
            kind: 'capture',
            heading: 'Add homework',
            span: 12,
            register: 'assignments',
          },
          {
            /* WHAT FALLS DUE IN SEVEN DAYS, overdue first, as the record reads every day declared `deadline: true`; an
               assignment's `due` is one, so this is the same row its reminders ring for. */
            kind: 'timeline',
            heading: 'Due this week',
            span: 12,
            source: 'deadlines',
            horizon: 7,
            where: 'list is assignments',
            columns: [{ field: 'day' }, { field: 'title' }],
            limit: 8,
            empty: '{{config:voice_nothing_needs_you}}',
          },
          {
            /* THE WEEK'S STUDY ON ITS DAYS. Below 640px a calendar is a strip of days with a dot, then the days that hold
               anything (`kernel/src/kinds/calendar.ts`), which is the week strip; on a desk it is this month. */
            kind: 'calendar',
            heading: '{{config:voice_right_now}}',
            span: 12,
            source: 'register.study_sessions',
            columns: [{ field: 'what' }, { field: 'on' }],
            back: 0,
            ahead: 0,
            empty: 'No study time planned this week.',
          },
          {
            /* THE STUDY STREAK: every session done in the last twelve weeks on its day, each day washed by the minutes
               studied, so a run of days reads as a run and a day off is left pale rather than counted against anybody. */
            kind: 'heat',
            heading: 'Study streak',
            span: 12,
            source: 'register.study_sessions',
            where: 'done is true, on after -84d',
            columns: [{ field: 'on' }, { field: 'minutes' }],
            empty: 'No study done yet. Tick a session done and your streak starts here.',
          },
          {
            kind: 'table',
            heading: '{{config:voice_needs_you}}',
            span: 12,
            source: 'register.assignments',
            where: 'state is not handed_in or marked, due after +7d',
            columns: [
              { field: 'what', label: 'Assignment', width: 'minmax(18ch,1fr)' },
              { field: 'course', label: 'Course', width: 'minmax(10ch,18ch)' },
              { field: 'due', label: 'Due', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 8,
            empty: 'Nothing due after this week yet.',
          },
        ],
      },
      {
        page: 'studies',
        title: 'Studies',
        nav: { section: 'Studies', order: 10 },
        icon: 'board',
        requires: ['register.assignments', 'register.courses', 'register.study_sessions'],
        blocks: [
          {
            kind: 'table',
            heading: 'Due next',
            span: 12,
            source: 'register.assignments',
            where: 'state is not handed_in or marked',
            columns: [
              { field: 'what', label: 'Assignment', width: 'minmax(20ch,1fr)' },
              { field: 'course', label: 'Course', width: 'minmax(10ch,18ch)' },
              { field: 'due', label: 'Due', width: '15ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 20,
            empty: 'Nothing is due.',
          },
          {
            kind: 'board',
            heading: 'By status',
            span: 12,
            source: 'register.assignments',
            columns: [{ field: 'state' }, { field: 'what' }, { field: 'due' }],
            empty: 'No assignments yet.',
          },
          {
            kind: 'table',
            heading: 'Study sessions',
            span: 12,
            source: 'register.study_sessions',
            columns: [
              { field: 'what', label: 'Session', width: 'minmax(20ch,1fr)' },
              { field: 'course', label: 'Course', width: 'minmax(10ch,18ch)' },
              { field: 'minutes', label: 'Minutes', width: '10ch', align: 'end' },
              { field: 'on', label: 'Day', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'on', dir: 'desc' }],
            limit: 20,
            empty: 'No study sessions yet.',
          },
          {
            kind: 'table',
            heading: 'Courses',
            span: 12,
            source: 'register.courses',
            columns: [
              { field: 'name', label: 'Course', width: 'minmax(20ch,1fr)' },
              { field: 'term', label: 'Term', width: '16ch' },
              { field: 'teacher', label: 'Teacher', width: 'minmax(10ch,20ch)' },
            ],
            empty: 'No courses yet.',
          },
        ],
      },
    ],
    /* NO `seeds` SINCE 1.3.0: a student's record holds only what the student wrote, and
       an example course was one more thing to find and clear. */
  },
};

/**
 * WHAT THE MODULES SAY TO A STUDENT, by module and then by the module's own words (`MODULE_NAMES` in `install.ts`),
 * laid over the plain words every use case but a business's gets. A student who adds Work is keeping their homework,
 * so the page and its place on the rail say so.
 */
export const STUDENT_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  work: {
    Work: 'Homework',
  },
};
