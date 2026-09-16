/**
 * Solo founder: one or several organisations, the money across them, and the numbers each project
 * reports or is polled for (`loop/research-spark.md` §4; the owner's own case, brain.example.com).
 *
 * IT BUILDS ON FOUR FIRST-PARTY MODULES. Projects, People, Money and Work are installed first, and this
 * pack adds what they do not hold: the organisations a founder runs, and datapoints, one number from one
 * project at one moment, written by the project itself over the API or by a poll the record runs.
 */

export const FOUNDER = {
  usecase: 'founder',
  version: '1.0.0',
  title: 'Solo founder',
  summary: 'The organisations you run, the money across them, and the numbers your projects report.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'founder',
  tone: 'direct, and about the numbers',
  signals: [
    'founder', 'founders', 'co-founder', 'cofounder', 'startup', 'startups', 'saas', 'indie hacker', 'bootstrapped',
    'my companies', 'companies', 'organisations', 'organizations', 'several businesses', 'side projects',
    'dashboard', 'dashboards', 'analytics', 'metrics', 'kpis', 'datapoints', 'mrr', 'arr', 'revenue', 'users',
    'signups', 'churn', 'runway', 'balances', 'my apps', 'my products', 'launch', 'launched', 'shipping',
  ],
  modules: ['portfolio', 'people', 'money-core', 'work'],
  voice: {
    home: 'Overview',
    right_now: 'The numbers',
    needs_you: 'Needs your call',
    nothing_needs_you: 'Nothing needs your call.',
    since_away: 'While you were building',
    lists: 'Records',
  },
  skills: [
    { name: 'datapoint-reporter', trigger: 'when a project ships a number worth watching, to post it as a datapoint' },
    { name: 'poll-setup', trigger: 'when a project has an API that answers a number, to declare a poll for it' },
  ],
  pack: {
    pack: 'usecase-founder',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'organisations',
        name: 'Organisations',
        one: 'organisation',
        icon: 'grid',
        holds: 'the companies and ventures you run, where each is registered and the currency it keeps',
        title: 'name',
        mobile: ['name', 'kind', 'currency'],
        fields: [
          { id: 'name', label: 'Organisation', type: 'text', required: true, search: true },
          {
            id: 'kind',
            label: 'Kind',
            type: 'enum',
            values: ['company', 'sole_trader', 'nonprofit', 'venture', 'other'],
            labels: { company: 'Company', sole_trader: 'Sole trader', nonprofit: 'Nonprofit', venture: 'Venture', other: 'Other' },
            index: true,
          },
          { id: 'country', label: 'Registered in', type: 'text' },
          { id: 'currency', label: 'Currency', type: 'text' },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'datapoints',
        name: 'Datapoints',
        one: 'datapoint',
        icon: 'observe',
        holds: 'one number from one project at one moment, reported by the project or polled by the record',
        title: 'name',
        mobile: ['name', 'value', 'at'],
        fields: [
          { id: 'name', label: 'Measure', type: 'text', required: true, index: true, search: true },
          { id: 'value', label: 'Value', type: 'decimal', required: true },
          { id: 'unit', label: 'Unit', type: 'text' },
          { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
          { id: 'organisation', label: 'Organisation', type: 'ref', to: 'organisations', index: true },
          { id: 'at', label: 'When', type: 'instant', index: true },
          {
            id: 'source',
            label: 'Source',
            type: 'enum',
            values: ['reported', 'polled', 'typed'],
            labels: { reported: 'Reported', polled: 'Polled', typed: 'Typed' },
            index: true,
          },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        page: 'overview',
        title: 'Overview',
        nav: { section: 'Overview', order: 10 },
        icon: 'observe',
        requires: ['register.datapoints', 'register.organisations'],
        blocks: [
          {
            kind: 'table',
            heading: 'Latest numbers',
            span: 12,
            source: 'register.datapoints',
            columns: [
              { field: 'name', label: 'Measure', width: 'minmax(16ch,1fr)' },
              { field: 'value', label: 'Value', width: '14ch', align: 'end' },
              { field: 'unit', label: 'Unit', width: '10ch' },
              { field: 'thing', label: 'Project', width: 'minmax(10ch,18ch)' },
              { field: 'source', label: 'Source', width: '12ch' },
            ],
            order: [{ field: 'seq', dir: 'desc' }],
            limit: 20,
            empty: 'No project has reported a number yet.',
          },
          {
            kind: 'table',
            heading: 'Organisations',
            span: 12,
            source: 'register.organisations',
            columns: [
              { field: 'name', label: 'Organisation', width: 'minmax(20ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '14ch' },
              { field: 'country', label: 'Registered in', width: '18ch' },
              { field: 'currency', label: 'Currency', width: '10ch' },
            ],
            empty: 'No organisations yet.',
          },
        ],
      },
    ],
    seeds: [
      { register: 'organisations', fields: { name: 'Northwind Labs Ltd', kind: 'company', country: 'United Kingdom', currency: 'GBP' } },
      { register: 'datapoints', fields: { name: 'Monthly recurring revenue', value: 4200, unit: 'GBP', source: 'reported' } },
    ],
  },
};
