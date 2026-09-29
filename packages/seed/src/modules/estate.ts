/**
 * Services: domains, hosting, subscriptions, memberships, insurance and bills, what they cost to keep, and when each one
 * renews.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { LOOKUPS, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister } from './base.ts';
import { TARGET_NOTE } from './money.ts';

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
    /* WHO A SERVICE IS WITH, AND NOT A REGISTRAR, since estate 1.3.0. A registrar is what a domain is held with, and
       Services holds hosting, subscriptions and certificates as well, so the line named one kind of provider as if it
       were all of them, and `tools/gates/shell-words.mjs` had to exempt it as a use-case word in the core. */
    holds: 'a renewal date, who it is with and a cost, so the record can tell you what is due in October',
    title: 'name',
    mobile: ['name', 'cost', 'renews'],
    state: 'state',
    done: ['cancelled'],
    pack: 'estate',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'provider', type: 'text', index: true, search: true },
      /* A HOUSEHOLD'S THINGS AS WELL AS A STUDIO'S, SINCE estate 2.0.0. The four values a studio keeps closed the list to
         a gym, a car's insurance or the electricity, so a person keeping those had no word for what they were. The ids
         stay and four join them; `saas` is said "Software", because the person reading a list of what they pay for is
         not always somebody who says SaaS. */
      {
        id: 'kind',
        label: 'Type',
        type: 'enum',
        values: ['domain', 'hosting', 'saas', 'certificate', 'subscription', 'membership', 'insurance', 'utility'],
        labels: {
          domain: 'Domain',
          hosting: 'Hosting',
          saas: 'Software',
          certificate: 'Certificate',
          subscription: 'Subscription',
          membership: 'Membership',
          insurance: 'Insurance',
          utility: 'Utility',
        },
        index: true,
        required: true,
      },
      /* NEITHER IS REQUIRED SINCE 1.1.0. A name somebody holds whose renewal day or price nobody has looked up yet is still
         a name they hold, and a guessed day is worse than a blank one: a blank sends somebody to find out, a guess stops them.
         An imported register of 23 domains carried no price at all, and most of its hosting no renewal day, so requiring
         both left the whole estate out of the import. A blank day reminds nobody and a blank cost adds nothing to a sum. */
      { id: 'renews', type: 'day', index: true, deadline: true, remind: ['-30d', '-7d', '0d'] },
      { id: 'cost', type: 'money' },
      /* INDEXED, WHICH IS WHY IT IS ON THE SCREEN. A column of amounts on unstated periods cannot be read:
         `GBP 340.00` beside `GBP 5.00` is not a comparison until one says yearly and the other monthly.
         `columnsFor` draws every indexed field, so the period travels with the amount and neither is a
         guess. Every figure over the cost reads its share of a month or a year by this field too. */
      { id: 'cycle', qualifies: 'cost', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'], index: true, required: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['live', 'lapsing', 'cancelled'], index: true, required: true },
      /* `Points at`, AND IT WAS `Target`. `19 §9` reserves *target* for what good looks like for a
         number, which is what the metric declarations mean by it; here it meant where a domain
         sends its traffic. One word for two unrelated things is the `grant` problem in miniature,
         and `19 §9` closes on exactly that. The id already reads as English with its underscore
         taken out, which is what `labelOf` would have produced with no label here at all. */
      { id: 'points_at', label: 'Points at', type: 'text' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      /* A NOTE, SINCE 1.2.0, AND IT IS NOT `points_at` WITH MORE ROOM. An imported domain register carried prose on most
         of its rows: a standing conflict between two registers, the open task behind a site that resolves nowhere, the
         whole clearance search behind a purchase. With nine fields and none of them prose, the import left every one of
         those in the export, because the only text beside the name says where it sends traffic and filing the reason a
         name is held under "Points at" mislabels it. Same id and type as the note on every Money list, so an importer
         and a form treat it the same way; not indexed and not searched, because it is read on the row and not filtered. */
      { id: 'note', type: 'text' },
    ],
  },
};

/**
 * A MONEY FIGURE IN THE RECORD'S OWN CURRENCY, SINCE estate 2.0.0. `money.GBP` judged every
 * reading in pounds, so a household paying its bills in another currency read its own services as somebody else's money.
 * `money` is added up in the record's home currency when one is set, else in the one currency the rows are in, else one
 * amount per currency, which is the currency somebody chose and never the pack author's.
 */
const MONEY = 'money';

/**
 * EACH CYCLE'S SHARE OF A MONTH. `LOOKUPS.per_month` is Money's, for what repeats, and names no `two_yearly`, which a
 * domain held for two years is; a service on a cycle the table does not name would be left out of the month, so the
 * table is this list's own and names every cycle `cycle` offers.
 */
const PER_MONTH: Record<string, number> = { monthly: 1, yearly: 1 / 12, two_yearly: 1 / 24 };

/** What a service costs a month at its share, in either figure that reads it, so the headline and its parts are one sum. */
const MONTHLY = { sum: { product: ['cost', { lookup: 'per_month', by: 'cycle' }] } } as const;

/**
 * THE TARGETS A PERSON SETS, AS SETTINGS OF THE PACK, SINCE estate 2.0.0. Each one printed a line under its figure that
 * nobody asked for ("Limit 6" under Renews in 30 days, "None expected" under Lapsing), in one studio's sizes and, for the
 * money, one studio's currency. Now each is a setting with no default, so a figure has no verdict until a person types
 * the line they mean; the figure names its setting (`target.setting`) and the record reads it each time the figure is
 * read (`liveTarget` in `packages/kernel/src/declare.ts`).
 *
 * `project-cost` IS HERE BECAUSE IT READS THIS LIST: it is declared with the project's figures in `portfolio.ts`, and the
 * first-party split files a figure with the list it reads (`packs/first-party.ts`), so its setting is this pack's.
 */
export const ESTATE_TARGET_SETTINGS: Readonly<Record<string, { setting: string; type: 'money' | 'number'; label: string }>> = {
  'estate-month': { setting: 'most_a_month', type: 'money', label: 'Most to keep everything running a month' },
  'estate-year': { setting: 'most_a_year', type: 'money', label: 'Most to keep everything running a year' },
  'renews-30d': { setting: 'most_renewing_30d', type: 'number', label: 'Most renewing in 30 days' },
  lapsing: { setting: 'most_lapsing', type: 'number', label: 'Most lapsing at once' },
  'project-cost': { setting: 'most_a_year_on_a_project', type: 'money', label: 'Most a year to keep one project running' },
};

/**
 * The settings Services' figures are held to, for the declarations that name them: every one starts empty, which the
 * record reads as no target. A declaration whose target names another setting, or none, adds nothing.
 */
export function estateTargetConfig(declarations: readonly Record<string, unknown>[]): Record<string, Record<string, unknown>> {
  const config: Record<string, Record<string, unknown>> = {};
  for (const d of declarations) {
    const said = typeof d.metric === 'string' && Object.hasOwn(ESTATE_TARGET_SETTINGS, d.metric) ? ESTATE_TARGET_SETTINGS[d.metric] : undefined;
    const target = d.target as { setting?: unknown } | undefined;
    if (!said || target?.setting !== said.setting) continue;
    config[said.setting] = { type: said.type, label: said.label, note: TARGET_NOTE };
  }
  return config;
}

export const ESTATE_METRICS: Record<string, SeedMetric> = {

  /* ON HOME, THIRD, after what you have and how long it lasts (`home: 3`, `figures.home`): what is about to take money
     for keeping something running is the next thing a person looks for when they open the record. */
  'renews-30d': {
    metric: 'renews-30d',
    name: 'Renews in 30 days',
    source: 'register.services',
    where: 'state is not cancelled, renews after yesterday, renews before +31d',
    value: { count: 'id' },
    format: 'int',
    target: { setting: 'most_renewing_30d' },
    window: '30d',
    home: 3,
  },

  lapsing: {
    metric: 'lapsing',
    name: 'Lapsing',
    source: 'register.services',
    where: 'state is lapsing',
    value: { count: 'id' },
    format: 'int',
    target: { setting: 'most_lapsing' },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT IT COSTS A MONTH TO KEEP EVERYTHING RUNNING, which is what Services leads with: every service not cancelled, at
   * its cycle's share of a month, so a yearly domain is a twelfth of itself and a monthly plan is itself. Cost per year
   * below is the same rows at their share of a year, and neither adds a yearly amount to a monthly one as it stands.
   */
  'estate-month': {
    metric: 'estate-month',
    name: 'Cost per month',
    source: 'register.services',
    where: 'state is not cancelled',
    value: MONTHLY,
    lookups: { per_month: PER_MONTH },
    format: MONEY,
    target: { setting: 'most_a_month' },
    window: '30d',
    compare: 'none',
  },

  /* THE SAME MONTH IN PARTS, ONE A TYPE, over the same rows and the same share, so the parts add up to the figure above.
     HELD TO NOUGHT OR MORE, which every cost is, as Money's figures by month are: the line a person sets is the whole
     month's, which the headline carries. Not an empty target, which names no setting and no bound, so the record refuses
     to read it (`VALUE_MALFORMED`, `evaluateMetric` in `packages/kernel/src/metrics.ts`) and the split under it with it. */
  'estate-month-by-kind': {
    metric: 'estate-month-by-kind',
    name: 'Cost per month, by type',
    source: 'register.services',
    where: 'state is not cancelled',
    value: MONTHLY,
    lookups: { per_month: PER_MONTH },
    group_by: 'kind',
    format: MONEY,
    target: { gte: 0 },
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
   *
   * ITS TARGET STAYS A NUMBER, where the tiles' became settings: no tile draws this figure, only the note's `when:` reads
   * it, so there is no line under a figure for a person to set.
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
    format: MONEY,
    target: { setting: 'most_a_year' },
    window: '90d',
    compare: 'none',
  },
};

/**
 * WHAT SERVICES DOES ON ITS OWN, SINCE estate 2.0.0: two rules over the list and two automations over the answers.
 *
 * - `renewal-passed`: a service still marked live after its renewal day is lapsing, and the record says so once, rather
 *   than counting it as live until somebody notices. `lapsing` was only ever a state a person set.
 * - `renew-soon`: two weeks before a live service renews, Decide asks whether to keep it, with what it costs, while there
 *   is still time to cancel. Once per service and renewal day, so a renewal moved to next year is asked about again.
 * - `renewal-kept` and `renewal-cancelled`: the answer moves the row (`on: decided`, `packages/kernel/src/flow.ts`'s
 *   `onDecided`), each naming the rule that asked and the answer by its words, letter for letter, since a rule's options
 *   are words whose ids are their places.
 *
 * ALL FOUR IN THE PACK DOCUMENT'S OWN FORM (the kind first), and installed with the automations and not with `RULES` in
 * `../index.ts`, so the sample's rows are not read by them on install: the sample's Decide stays the questions it is
 * written with, and a record meets these as time passes, when the hourly re-read finds a day that has come.
 */
export const ESTATE_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'renewal-passed',
    name: 'Mark a service lapsing once its renewal day has passed',
    pack: 'estate',
    register: 'services',
    when: 'state is live, renews before today',
    then: [{ move: 'lapsing' }, { notify: { say: '{{name}} was due to renew {{ago:renews}} and nobody said it did, so it is lapsing.' } }],
    once_per: ['entry', 'renews'],
  },
  {
    rule: 'renew-soon',
    name: 'Ask whether to keep a service before it renews',
    pack: 'estate',
    register: 'services',
    /* `cost is set`, BECAUSE THE QUESTION SAYS WHAT IT COSTS: a service whose price nobody has looked up is asked about
       when somebody has, rather than asked about a price the question would print as a dash. */
    when: 'state is live, cost is set, renews after yesterday, renews before +15d',
    then: [{ suggest: { question: '{{name}} renews {{until:renews}} for {{money:cost}}. Keep it?', options: ['Keep it', 'Cancel it'] } }],
    once_per: ['entry', 'renews'],
  },
  {
    rule: 'renewal-kept',
    name: 'Keep a service somebody chose to keep',
    pack: 'estate',
    on: { decided: { about: 'rule.renew-soon', option: 'Keep it' } },
    /* LIVE, WHICH IT USUALLY STILL IS, and which puts it back when its day passed before the answer and `renewal-passed`
       had already called it lapsing. The note says what is left to do: the day it renews next is the person's to set. */
    steps: [{ move: 'live' }, { note: 'You chose to keep this in Decide. Set the day it renews next once it has.' }],
  },
  {
    rule: 'renewal-cancelled',
    name: 'Cancel a service somebody chose to cancel',
    pack: 'estate',
    on: { decided: { about: 'rule.renew-soon', option: 'Cancel it' } },
    /* CANCELLED, THE STATE EVERY READER OF SERVICES ALREADY LEAVES OUT: the month, the year, the next ninety days and
       Money's cash walk. Cancelling with the provider is still the person's to do, and the note says so. */
    steps: [{ move: 'cancelled' }, { note: 'You chose to cancel this in Decide. Cancel it with the provider too.' }],
  },
];

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
        /* THE ONE SENTENCE THE PAGE OPENS WITH: what it costs a month to keep everything running, every cycle at its
           share of a month (`estate-month`). A record with nothing to pay for has no sentence to say, and the note is
           not drawn rather than drawn at nought. */
        kind: 'note',
        lead: true,
        span: 12,
        body: '{{estate-month}} a month to keep everything running.',
      },
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
        /* WHAT `renew-soon` HAS ASKED ABOUT SERVICES, answered where it is shown, three at a time, and the rest are in
           Decide. No `empty:` of its own: with nothing waiting the queue says its own line. */
        kind: 'queue',
        heading: 'Waiting on you',
        span: 12,
        source: 'governance.open',
        where: 'list is services',
        limit: 3,
      },
      {
        /* THE MONTH IN PARTS, ONE A TYPE, the parts of the figure the page opens with, over the same rows at the same
           share, so a yearly domain is in it at a twelfth and not left out for being on another cycle. */
        kind: 'split',
        heading: 'Each month, by type',
        span: 5,
        source: 'metric.estate-month-by-kind',
        limit: 6,
        empty: 'Nothing to pay for yet.',
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
