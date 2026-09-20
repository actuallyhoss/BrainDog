/**
 * Solo founder: one or several organisations, the money across them, and the numbers each project
 * reports or is polled for (`loop/research-spark.md` §4; the owner's own case, brain.example.com).
 *
 * IT BUILDS ON FOUR FIRST-PARTY MODULES. Projects, People, Money and Work are installed first, and this
 * pack adds what they do not hold: the organisations a founder runs, and datapoints, one number from one
 * project at one moment, written by the project itself over the API or by a poll the record runs.
 */

import { projectTemplate } from '../modules/portfolio.ts';

/** The lists a founder's record holds once its four modules and this pack are in: no Estate, so no services. */
const HOLDS = ['things', 'people', 'accounts', 'obligations', 'tasks', 'tracks', 'runs', 'updates', 'organisations', 'datapoints'];

/**
 * THE NUMBERS BLOCKS, ONCE, for the dashboard, an organisation and a project: which field is which, the example left
 * out, and thirty days against the thirty before. The record works the series out (`measures.ts` in the kernel), so a
 * year of hourly polls draws as fast as a week of them.
 */
const numbers = (where: string | null, empty: string, line: string) => {
  const said = ['source is not example', ...(where ? [where] : [])].join(', ');
  const columns = [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }];
  return [
    { kind: 'stat', heading: 'The numbers', span: 12, source: 'register.datapoints', columns, where: said, back: 30, empty },
    { kind: 'lines', heading: 'Thirty days against the thirty before', span: 12, source: 'register.datapoints', columns, where: said, back: 30, empty: line },
  ];
};

export const FOUNDER = {
  usecase: 'founder',
  /* 1.3.2 BECAUSE THE TWO THIRTY-DAY TILES ON BOTH DASHBOARDS ARE RENAMED, and a record is offered a
     use case's change only when its version goes up: 1.3.1 was itself the wording of these same tiles
     (`fbf260e6`), so leaving the number alone would mean every record that took that one keeps the
     words it corrected. Nothing here declares a field or a register, so there is nothing to refuse. */
  version: '1.3.2',
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
          /* WHAT IT HOLDS AND WHAT IT RUNS. Money's accounts and Projects cannot name an organisation, because a use
             case adds no field to another pack's list, so the organisation names them: its balance is the money in the
             accounts it lists, and a project it lists reports its numbers here. */
          { id: 'accounts', label: 'Accounts', type: 'list', of: 'ref', to: 'accounts' },
          { id: 'projects', label: 'Projects', type: 'list', of: 'ref', to: 'things' },
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
            /* `example` IS THE SEED'S, so the dashboards leave it out of every tile and chart while it still shows,
               marked, in the lists of latest numbers. */
            values: ['reported', 'polled', 'typed', 'example'],
            labels: { reported: 'Reported', polled: 'Polled', typed: 'Typed', example: 'Example' },
            index: true,
          },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        metric: 'datapoints-30d',
        name: 'Numbers reported, 30 days',
        source: 'register.datapoints',
        where: 'at after -30d, source is not example',
        value: { count: 'id' },
        format: 'int',
        target: { gte: 1 },
        window: '30d',
        compare: 'none',
      },
      {
        /* HOME, AS THIS USE CASE ANSWERS IT (`loop/research-spark.md` S13): the money across every organisation and
           the numbers the projects sent, in place of the house figures. No `nav`, because Home is on the rail
           already. The first heading reads the voice, so a line changed at `/packs` changes it too. */
        page: 'home-founder',
        title: 'Overview',
        icon: 'home',
        requires: ['register.datapoints', 'register.organisations', 'register.accounts', 'register.obligations'],
        blocks: [
          {
            /**
             * THE TWO THIRTY-DAY TILES CARRY THE FIGURES' OWN NAMES, which is `491e7e05` arriving here.
             *
             * BOTH READ ONE REGISTER AND ONE DIRECTION (`direction is owed by me`, and its opposite), so
             * "Going out, 30 days" claimed a whole they cannot count. Measured where it could be seen: on
             * `/p/money` those words over `out-30d` read GBP 38,880.00 above a walk over three lists
             * reading GBP 42,741.00 of the same thirty days, GBP 3,861.00 apart on one screen.
             *
             * THIS PAGE DRAWS NO WALK, SO NOTHING ON IT CONTRADICTED, which is how the old words survived
             * that rename and is not a reason to keep them. A founder's record installs money-core too,
             * so the same figure is read here and on `/p/money`, and two names for one figure is a
             * question about which of them is the real number.
             */
            kind: 'stat',
            heading: '{{config:voice_right_now}}',
            span: 12,
            cells: [
              { metric: 'cash-now', label: 'Cash now' },
              { metric: 'in-30d', label: 'Owed to you, 30 days' },
              { metric: 'out-30d', label: 'Owed by you, 30 days' },
              { metric: 'datapoints-30d', label: 'Reported, 30 days' },
            ],
          },
          {
            kind: 'table',
            heading: 'Latest numbers',
            span: 12,
            source: 'register.datapoints',
            columns: [
              { field: 'name', label: 'Measure', width: 'minmax(16ch,1fr)' },
              { field: 'value', label: 'Value', width: '12ch', align: 'end' },
              { field: 'unit', label: 'Unit', width: '8ch' },
              { field: 'source', label: 'Source', width: '11ch' },
              { field: 'at', label: 'When', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'at', dir: 'desc' }],
            limit: 6,
            empty: 'No project has reported a number yet.',
          },
          {
            kind: 'table',
            heading: 'Organisations',
            span: 12,
            source: 'register.organisations',
            columns: [
              { field: 'name', label: 'Organisation', width: 'minmax(18ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '12ch' },
              { field: 'country', label: 'Registered in', width: '16ch' },
              { field: 'currency', label: 'Currency', width: '9ch' },
            ],
            limit: 6,
            empty: 'No organisations yet.',
          },
        ],
      },
      {
        /* `Dashboard` AND NOT `Overview`, which is what this use case's voice calls Home: two rail items with one name.

           THE WHOLE PORTFOLIO ON ONE PAGE: the money across every organisation, each organisation's balance, then every
           number a project reported as a tile and as a line over thirty days against the thirty before. A `stat` and a
           `lines` over Datapoints name which field is which (when, value, measure and unit) and draw one tile and one
           chart a measure, so a measure a project starts sending tomorrow is on this page tomorrow without an edit. */
        page: 'dashboard',
        title: 'Dashboard',
        nav: { section: 'Dashboard', order: 10 },
        icon: 'observe',
        requires: ['register.datapoints', 'register.organisations', 'register.accounts', 'register.obligations'],
        blocks: [
          {
            kind: 'stat',
            heading: 'Across your organisations',
            lead: true,
            span: 12,
            /* THE THIRTY-DAY TILES, IN THE FIGURES' OWN WORDS, and the argument is on Overview's stat
               block above: they read one register and one direction, so the bridge's words over them
               were a claim about money they cannot reach. */
            cells: [
              { metric: 'cash-now', label: 'Cash now', trend: '30d' },
              { metric: 'in-30d', label: 'Owed to you, 30 days' },
              { metric: 'out-30d', label: 'Owed by you, 30 days' },
            ],
          },
          {
            kind: 'bar',
            heading: 'Balance by organisation',
            span: 12,
            source: 'register.organisations',
            columns: [{ field: 'name' }, { field: 'accounts' }],
            empty: 'No organisation lists an account yet. Open one and add the accounts it holds.',
          },
          /* WORDED FOR A FIRST DAY WITH AN EXAMPLE BESIDE THEM: the example number shows under Latest numbers and is left out
             here, so "no project has reported a number" read as wrong beside it. */
          ...numbers(null, 'When a project reports a number, it shows here. Examples are left out.', 'Each measure draws a line once a project reports it.'),
          {
            kind: 'table',
            heading: 'Latest numbers',
            span: 12,
            source: 'register.datapoints',
            columns: [
              { field: 'name', label: 'Measure', width: 'minmax(16ch,1fr)' },
              { field: 'value', label: 'Value', width: '14ch', align: 'end' },
              { field: 'unit', label: 'Unit', width: '8ch' },
              { field: 'organisation', label: 'Organisation', width: 'minmax(10ch,18ch)' },
              { field: 'source', label: 'Source', width: '11ch' },
              { field: 'at', label: 'When', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'at', dir: 'desc' }],
            limit: 10,
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
      {
        /* ONE DASHBOARD AN ORGANISATION, from the same declaration, with the organisation's own name in every predicate.
           Its last section is where a project is given a key to send numbers here, which the app draws under it. */
        page: 'organisation',
        title: '{{name}}',
        for: { register: 'organisations' },
        nav: { section: 'Dashboard', order: 20 },
        icon: 'grid',
        requires: ['register.datapoints', 'register.organisations', 'register.accounts'],
        blocks: [
          {
            kind: 'bar',
            heading: 'Balance',
            span: 12,
            source: 'register.organisations',
            where: 'name is {{name}}',
            columns: [{ field: 'name' }, { field: 'accounts' }],
            empty: '{{name}} lists no account yet. Add the accounts it holds and its balance shows here.',
          },
          ...numbers('organisation is {{name}}', 'When a number is reported for {{name}}, it shows here. Examples are left out.', 'Each measure draws a line once it is reported for {{name}}.'),
          {
            kind: 'table',
            heading: 'Latest numbers',
            span: 12,
            source: 'register.datapoints',
            where: 'organisation is {{name}}',
            columns: [
              { field: 'name', label: 'Measure', width: 'minmax(16ch,1fr)' },
              { field: 'value', label: 'Value', width: '14ch', align: 'end' },
              { field: 'unit', label: 'Unit', width: '8ch' },
              { field: 'source', label: 'Source', width: '11ch' },
              { field: 'at', label: 'When', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'at', dir: 'desc' }],
            limit: 10,
            empty: 'Nothing has been reported for {{name}} yet.',
          },
          { kind: 'section', heading: 'Send numbers here', icon: 'observe', span: 12 },
        ],
      },
      {
        /* A PROJECT'S PAGE, WITHOUT ESTATE. Portfolio's template reads what a project runs on from Estate's services,
           which a founder does not install, so it is taken without them (`projectTemplate`), and the numbers the
           project reports and where it sends them are added under it. Same id as the template, so a record never has
           two pages at one project's address. */
        ...projectTemplate(HOLDS),
        requires: [...(projectTemplate(HOLDS).requires as string[]), 'register.datapoints'],
        blocks: [
          ...(projectTemplate(HOLDS).blocks as Record<string, unknown>[]),
          ...numbers('thing is {{name}}', 'When a number is reported for {{name}}, it shows here. Examples are left out.', 'Each measure draws a line once it is reported for {{name}}.'),
          { kind: 'section', heading: 'Send numbers here', icon: 'observe', span: 12 },
        ],
      },
    ],
    seeds: [
      { register: 'organisations', fields: { name: 'Northwind Labs Ltd', kind: 'company', country: 'United Kingdom', currency: 'GBP' } },
      { register: 'datapoints', fields: { name: 'Monthly recurring revenue', value: 4200, unit: 'GBP', source: 'example', at: '-1d' } },
    ],
  },
};

/**
 * THE EXAMPLE ROWS THE FOUR MODULES GET IN A FOUNDER'S RECORD, in place of the sample studio's Kiln, Halden Type Co
 * and brand-system invoice. One per list at most, no refs, and a day written `+5d` is counted from the day the
 * record is made (`install.ts`). People gets none: onboarding writes the founder's own row there.
 */
export const FOUNDER_EXAMPLES = [
  { register: 'things', fields: { name: 'Northwind app', lane: 'earning', since: '-400d' } },
  { register: 'accounts', fields: { name: 'Northwind current account', kind: 'bank', balance: { amount: 2_480_000, currency: 'GBP' }, as_of: '0d', liquid: true } },
  {
    register: 'obligations',
    fields: { what: 'Cloud hosting, Northwind app', direction: 'owed_by_me', amount: { amount: 32_000, currency: 'GBP' }, due: '+9d', state: 'open', category: 'software', repeats: 'monthly' },
  },
  { register: 'tracks', fields: { name: 'Launch the annual plan', state: 'open', opened: '-12d' } },
  { register: 'tasks', fields: { what: 'Write the pricing page copy', state: 'open', by: '+4d' } },
];
