/**
 * Student: courses, what is due, and how each piece of work went (`loop/research-spark.md` §4).
 *
 * IT NEEDS NO FIRST-PARTY MODULE. Studying is not a business, so nothing here points at a project, an
 * invoice or a client. Onboarding still installs People for the person's own row, and nothing here leans
 * on it, so a student who switches People off loses nothing this use case holds.
 */

export const STUDENT = {
  usecase: 'student',
  /* 1.2.1 BECAUSE HOME'S EMPTY TITLE LOSES ITS FULL STOP. A title ends without one everywhere else, and a record is
     offered the words only when the version goes up. */
  version: '1.2.1',
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
    lists: 'Notebooks',
  },
  /* THE LISTS' OWN WORDS, SO A STUDENT CAN CALL THEM WHAT THEIR SCHOOL DOES: Modules, Coursework, Revision. Kept as the
     pack's settings (S8), so they are renamed at /packs/usecase-student and travel with a shared copy. */
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
        /* HOME, AS THIS USE CASE ANSWERS IT (`loop/research-spark.md` S13). No `nav`, because Home is already on the
           rail: the display draws the page called `home-<use case>` there in place of the house figures. Its
           headings read the voice, so a line changed at `/packs` changes the heading with it. */
        page: 'home-student',
        title: 'Today',
        icon: 'home',
        requires: ['register.assignments', 'register.study_sessions'],
        blocks: [
          {
            kind: 'table',
            heading: '{{config:voice_right_now}}',
            span: 12,
            source: 'register.assignments',
            where: 'state is not handed_in or marked, due before +8d',
            columns: [
              { field: 'what', label: 'Assignment', width: 'minmax(18ch,1fr)' },
              { field: 'course', label: 'Course', width: 'minmax(10ch,18ch)' },
              { field: 'state', label: 'Status', width: '12ch' },
              { field: 'due', label: 'Due', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 8,
            empty: '{{config:voice_nothing_needs_you}}',
          },
          {
            kind: 'table',
            heading: 'Study sessions',
            span: 12,
            source: 'register.study_sessions',
            where: 'on after yesterday, on before +8d',
            columns: [
              { field: 'what', label: 'Session', width: 'minmax(18ch,1fr)' },
              { field: 'course', label: 'Course', width: 'minmax(10ch,18ch)' },
              { field: 'minutes', label: 'Minutes', width: '10ch', align: 'end' },
              { field: 'on', label: 'Day', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'on', dir: 'asc' }],
            limit: 8,
            empty: 'No study time planned this week.',
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
    /* A DAY WRITTEN `+3d` IS COUNTED FROM THE DAY THE RECORD IS MADE (`install.ts` `dated`), so the example is due
       this week on whichever day somebody starts, and Home has something to show. */
    seeds: [
      { register: 'courses', fields: { name: 'Introduction to statistics', term: 'Autumn', teacher: 'Dr Adeyemi' } },
      { register: 'assignments', fields: { what: 'Problem set 1: probability', state: 'doing', due: '+3d' } },
      { register: 'study_sessions', fields: { what: 'Go over the lecture on conditional probability', on: '+1d', minutes: 90, done: false } },
    ],
  },
};
