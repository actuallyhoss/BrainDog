/**
 * Student: courses, what is due, and how each piece of work went (`loop/research-spark.md` §4).
 *
 * IT NEEDS NO FIRST-PARTY MODULE. Studying is not a business, so nothing here points at a project, an
 * invoice or a client. Onboarding still installs People for the person's own row, and nothing here leans
 * on it, so a student who switches People off loses nothing this use case holds.
 */

export const STUDENT = {
  usecase: 'student',
  version: '1.0.0',
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
    nothing_needs_you: 'Nothing is due.',
    since_away: 'Since you last looked',
    lists: 'Notebooks',
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
          { id: 'course', label: 'Course', type: 'ref', to: 'courses', index: true },
          { id: 'due', label: 'Due', type: 'day', index: true, deadline: true, remind: ['-2d', '0d'] },
          { id: 'grade', label: 'Grade', type: 'text' },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        page: 'studies',
        title: 'Studies',
        nav: { section: 'Studies', order: 10 },
        icon: 'board',
        requires: ['register.assignments', 'register.courses'],
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
    seeds: [
      { register: 'courses', fields: { name: 'Introduction to statistics', term: 'Autumn', teacher: 'Dr Adeyemi' } },
      { register: 'assignments', fields: { what: 'Problem set 1', state: 'to_do' } },
    ],
  },
};
