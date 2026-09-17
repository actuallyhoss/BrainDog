/**
 * Services: domains, hosting, subscriptions and certificates, and when each one renews.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { LOOKUPS, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister } from './base.ts';

/* ── services ─────────────────────────────────────────────────────────────── */

export const SERVICES: Fields[] = [
  { name: 'kiln.example', provider: 'Nordhaven Registry', kind: 'domain', renews: day(12), cost: gbp(1_400), cycle: 'yearly', state: 'live', points_at: 'Pages', thing: 1 },
  { name: 'kilnfonts.example', provider: 'Nordhaven Registry', kind: 'domain', renews: day(-4), cost: gbp(1_400), cycle: 'yearly', state: 'lapsing', points_at: 'redirect → kiln.example', thing: 1 },
  { name: 'marlow.example', provider: 'Nordhaven Registry', kind: 'domain', renews: day(84), cost: gbp(1_400), cycle: 'yearly', state: 'live', points_at: 'Pages', thing: 2 },
  { name: 'portage.example', provider: 'Cove Domains', kind: 'domain', renews: day(203), cost: gbp(3_200), cycle: 'yearly', state: 'live', points_at: 'newsletter', thing: 3 },
  { name: 'tallow.example', provider: 'Cove Domains', kind: 'domain', renews: day(41), cost: gbp(1_400), cycle: 'yearly', state: 'live', points_at: 'nothing', thing: 4 },
  { name: 'Object storage', provider: 'Fenwick Cloud', kind: 'hosting', renews: day(21), cost: gbp(4_100), cycle: 'monthly', state: 'live', points_at: 'font binaries', thing: 1 },
  { name: 'Workers plan', provider: 'Fenwick Cloud', kind: 'hosting', renews: day(21), cost: gbp(500), cycle: 'monthly', state: 'live', points_at: 'kiln.example', thing: 1 },
  { name: 'Newsletter sending', provider: 'Ledger Post', kind: 'saas', renews: day(7), cost: gbp(3_900), cycle: 'monthly', state: 'live', points_at: 'portage.example', thing: 3 },
  { name: 'Design suite', provider: 'Aperture', kind: 'saas', renews: day(56), cost: gbp(6_190), cycle: 'monthly', state: 'live', points_at: '', thing: null },
  { name: 'Bookkeeping', provider: 'Tallyard', kind: 'saas', renews: day(119), cost: gbp(34_000), cycle: 'yearly', state: 'live', points_at: '', thing: null },
  { name: 'Wildcard certificate', provider: 'Nordhaven Registry', kind: 'certificate', renews: day(2), cost: gbp(0), cycle: 'yearly', state: 'live', points_at: '*.kiln.example', thing: 1 },
  { name: 'Error tracking', provider: 'Kestrel', kind: 'saas', renews: day(74), cost: gbp(2_600), cycle: 'monthly', state: 'live', points_at: '', thing: 1 },
  { name: 'Staging box', provider: 'Fenwick Cloud', kind: 'hosting', renews: day(21), cost: gbp(1_200), cycle: 'monthly', state: 'live', points_at: 'staging.kiln.example', thing: 1 },
  { name: 'Old CI plan', provider: 'Hobnail', kind: 'saas', renews: day(-61), cost: gbp(2_900), cycle: 'monthly', state: 'cancelled', points_at: '', thing: 4 },
  { name: 'portagemail.example', provider: 'Cove Domains', kind: 'domain', renews: day(150), cost: gbp(3_200), cycle: 'yearly', state: 'live', points_at: 'sending domain', thing: 3 },
  { name: 'Analytics', provider: 'Bellwether', kind: 'saas', renews: day(31), cost: gbp(1_900), cycle: 'monthly', state: 'live', points_at: '', thing: 3 },
];

export const ESTATE_REGISTERS: Record<string, SeedRegister> = {
  services: {
    id: 'services',
    icon: 'service',
    name: 'Services',
    one: 'service',
    holds: 'a renewal date, a registrar and a cost, so the record can tell you what is due in October',
    title: 'name',
    mobile: ['name', 'cost', 'renews'],
    state: 'state',
    done: ['cancelled'],
    pack: 'estate',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'provider', type: 'text', index: true, search: true },
      { id: 'kind', label: 'Type', type: 'enum', values: ['domain', 'hosting', 'saas', 'certificate'], index: true, required: true },
      /* NEITHER IS REQUIRED SINCE 1.1.0. A name somebody holds whose renewal day or price nobody has looked up yet is still
         a name they hold, and a guessed day is worse than a blank one: a blank sends somebody to find out, a guess stops them.
         the old tool's 23 domains carry no price at all, and most of its hosting no renewal day, so requiring both left the
         whole estate out of the import. A blank day reminds nobody and a blank cost adds nothing to a sum. */
      { id: 'renews', type: 'day', index: true, deadline: true, remind: ['-30d', '-7d', '0d'] },
      { id: 'cost', type: 'money' },
      /* INDEXED, WHICH IS WHY IT IS ON THE SCREEN. Two reasons, and both were already true:
         `page.estate` declares a block filtering `state is live, cycle is monthly`, and filtering an
         unindexed field is the thing `query.scan` exists to notice — so the declaration was asking
         for a scan on every render of the estate page. And a column of amounts on unstated periods
         cannot be read: `GBP 340.00` beside `GBP 5.00` is not a comparison until one says yearly and
         the other monthly. `columnsFor` draws every indexed field, so the period travels with the
         amount and neither is a guess. */
      { id: 'cycle', qualifies: 'cost', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'], index: true, required: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['live', 'lapsing', 'cancelled'], index: true, required: true },
      /* `Points at`, AND IT WAS `Target`. `19 §9` reserves *target* for what good looks like for a
         number, which is what the metric declarations mean by it; here it meant where a domain
         sends its traffic. One word for two unrelated things is the `grant` problem in miniature,
         and `19 §9` closes on exactly that. The id already reads as English with its underscore
         taken out, which is what `labelOf` would have produced with no label here at all. */
      { id: 'points_at', label: 'Points at', type: 'text' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
    ],
  },
};

export const ESTATE_METRICS: Record<string, SeedMetric> = {

  'renews-30d': {
    metric: 'renews-30d',
    name: 'Renews in 30 days',
    source: 'register.services',
    where: 'state is not cancelled, renews after yesterday, renews before +31d',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 6 },
    window: '30d',
  },

  lapsing: {
    metric: 'lapsing',
    name: 'Lapsing',
    source: 'register.services',
    where: 'state is lapsing',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THE SET THE ESTATE'S ALARM IS ACTUALLY ABOUT, which until now could not be written down.
   *
   * The note headed "Points at nothing" was gated on `lapsing`, which counts services in the
   * lapsing state: one row, and that row points somewhere. The four that point nowhere are all
   * live. `08 §3`'s rule, and the four paragraphs the Money page's own `Late to pay` block carries
   * about it, is that the gate and the figure have to describe one set, and this was the same
   * defect one page along.
   *
   * IT NEEDED A WORD THE GRAMMAR DID NOT HAVE. The structured form has published `empty` and
   * `present` since it was written and the sentence form had no way to say either, so the set was
   * not expressible in the language every `where:` on every page is written in. It is now.
   */
  'points-nowhere': {
    metric: 'points-nowhere',
    name: 'Points at nothing',
    source: 'register.services',
    where: 'state is live, points_at is empty',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  'estate-year': {
    metric: 'estate-year',
    name: 'Cost per year',
    source: 'register.services',
    where: 'state is not cancelled',
    /* The row-level product 08 §2.5 describes: `cost` is per cycle, and the cycle is the factor. */
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    lookups: { per_year: LOOKUPS.per_year! },
    format: 'money.GBP',
    /* 300_000, not 30_000. The target was once written a zero short, so a GBP 2,906.80 estate was
       measured against GBP 300.00 and the tile read `warn` for a reason nobody could act on. */
    target: { lte: 300_000 },
    window: '90d',
    compare: 'none',
  },
};

export const ESTATE_PAGES: Record<string, SeedPage> = {
  estate: {
    page: 'estate',
    title: 'Renewals',
    /* `Services`, AND THE SECTION WAS `Estate`. One area of this record had four names: the first
       run's second card said *The estate*, this heading said *Estate*, the pack said *Estate*, the
       register said *Services* and the page said *Renewals*. `Services` is the one the register
       already carried, and the rail is where the reader meets the disagreement, because the
       section heading sits directly above a list called Services.

       A SECTION IS KEYED ON ITS HEADING and there is no other handle on one, so a reader who had
       folded this section away gets it back open once, per device. `pref.ts` argues that is the
       right answer anyway: the fold was about a heading that no longer exists. */
    nav: { section: 'Services', order: 10 },
    icon: 'calendar',
    requires: ['register.services'],
    pack: 'estate',
    blocks: [
      {
        kind: 'stat',
        heading: 'At a glance',
        span: 12,
        cells: [
          { metric: 'renews-30d', label: 'Renews in 30 days' },
          { metric: 'estate-year', label: 'Cost per year' },
          { metric: 'lapsing', label: 'Lapsing' },
        ],
      },
      {
        kind: 'gauge',
        heading: 'Monthly spend',
        span: 5,
        /* First column names the thing, second is the one that gets summed.

           `cycle is monthly` is not a nicety. `cost` is per CYCLE, so summing a yearly domain and a
           monthly bucket adds two different units and produces a number that is not about anything.
           A gauge over one cycle is a real figure; a gauge over all of them is arithmetic that
           happens to complete. */
        columns: [{ field: 'name', label: 'Every month' }, { field: 'cost' }],
        source: 'register.services',
        where: 'state is live, cycle is monthly',
        target: 22_000,
        empty: 'Nothing on a monthly plan.',
      },
      {
        kind: 'chips',
        heading: 'What it is made of',
        span: 7,
        /* Grouped and counted by the first column, so this is six chips rather than fifteen. */
        columns: [{ field: 'kind' }],
        source: 'register.services',
        /* THE PHRASE `19 §6` QUOTES AS THE FAILURE, in this record's own first-party pack. "Nothing
           here yet" names nothing, says nothing about what belongs, and reads identically whether a
           filter missed or the list has never held a row — which is the collapse the section is
           about. A block's `empty:` is the one sentence its author gets, so it says what would be
           here. */
        empty: 'Nothing to break down until a service is added.',
      },
      {
        kind: 'timeline',
        heading: 'Next ninety days',
        span: 6,
        /* WRITTEN DOWN, because it used to live in the reader as a filter keyed on
           register-and-kind. The heading says ninety days and now the declaration does too. */
        /* BOUNDED AT BOTH ENDS. A window with an upper bound and no lower one sorts a renewal that
           already lapsed to the top of a list headed "Next ninety days" — the same defect the two
           30-day money tiles were bounded below to fix. `after yesterday` is exclusive, so today
           still counts. */
        where: 'state is not cancelled, renews after yesterday, renews before +90d',
        columns: [{ field: 'renews' }, { field: 'name' }, { field: 'provider' }],
        source: 'register.services',
        order: [{ field: 'renews', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing renews in the next ninety days.',
      },
      {
        kind: 'params',
        heading: 'What each domain points at',
        /* SIX, and it has to be six. `params` is a `rows` primitive, so `floorFor` widens it to two
           twelfths per declared column — three columns is a floor of 6 — and a declaration of 5 was
           silently clamped up. Its row partner was 7, the row came to 13, and the page wrapped into
           two rows with a five-twelfth hole in one and a six-twelfth hole in the other. */
        span: 6,
        columns: [{ field: 'name' }, { field: 'points_at' }, { field: 'provider' }],
        source: 'register.services',
        where: 'kind is domain',
        order: [{ field: 'name', dir: 'asc' }],
        limit: 6,
        empty: 'No domains.',
      },
      {
        kind: 'table',
        heading: 'Everything',
        span: 12,
        source: 'register.services',
        columns: [
          { field: 'name', label: 'Name', width: 'minmax(16ch,1fr)' },
          { field: 'provider', label: 'Provider', width: 'minmax(12ch,18ch)' },
          { field: 'kind', label: 'Type', width: '13ch' },
          { field: 'cost', label: 'Cost', width: '13ch', align: 'end' },
          { field: 'renews', label: 'Renews', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'renews', dir: 'asc' }],
        /* AND IT SAID `the estate`. This is the empty state of the Services list on the page in
           the Services section, and it was the fifth surface still using the fourth name. */
        empty: 'No services yet.',
        limit: 50,
      },
      {
        kind: 'note',
        tone: 'warn',
        heading: 'Points at nothing',
        span: 12,
        body: 'Something here renews and points at nothing. A domain that resolves nowhere still costs what it costs.',
        /* AND THE GATE COUNTS THE SET THE SENTENCE IS ABOUT. It counted `lapsing`, which is one row
           and that row points somewhere, while the services that point nowhere are all live: the
           note drew, truthfully-looking, about rows it was not describing. */
        when: { metric: 'points-nowhere', gt: 0 },
      },
    ],
  },
};
