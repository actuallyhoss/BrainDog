/**
 * The record this mock-up shows.
 *
 * Synthetic by rule, the same rule the fixture corpus follows (22 §10): invented names, `.example`
 * hosts, no real person and no real credential. It is a plausible record for the buyer the product
 * is for — one person running several things at once, now using more than one agent, with no shared
 * place to put what all of them need to know.
 *
 * Interesting rows are written by hand; the tail is generated from a fixed seed so a five-hundred
 * row grid has something to be five hundred rows of, and so the same grid appears every time.
 */

import type {
  AuditEvent,
  Credential,
  Entry,
  Fields,
  InboxItem,
  Job,
  NewsItem,
  PackInfo,
  PageDecl,
  Person,
  Question,
  RegisterDecl,
} from './schema.ts';

/** The record is read as if it were opened on this day, so every relative date is stable. */
export const TODAY = '2026-09-03';
export const NOW = Date.UTC(2026, 8, 3, 12);

const day = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const stamp = (offsetHours: number): string => new Date(NOW + offsetHours * 3_600_000).toISOString();

/* ── registers ────────────────────────────────────────────────────────────── */

export const REGISTERS: Record<string, RegisterDecl> = {
  obligations: {
    id: 'obligations',
    name: 'Obligations',
    icon: 'obligation',
    one: 'obligation',
    holds: 'what you owe and what you are owed, with a date and a currency',
    title: 'what',
    mobile: ['what', 'amount', 'due'],
    state: 'state',
    done: ['paid', 'written_off'],
    pack: 'money-core',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'ref', to: 'people', indexed: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], indexed: true, required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', indexed: true, required: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], indexed: true, required: true },
      { id: 'thing', type: 'ref', to: 'things', indexed: true },
      { id: 'note', type: 'text' },
    ],
  },
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
      { id: 'name', type: 'text', required: true },
      { id: 'provider', type: 'text', indexed: true },
      { id: 'kind', type: 'enum', values: ['domain', 'hosting', 'saas', 'certificate'], indexed: true, required: true },
      { id: 'renews', type: 'day', indexed: true, required: true },
      { id: 'cost', type: 'money', required: true },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'], required: true },
      { id: 'state', type: 'enum', values: ['live', 'lapsing', 'cancelled'], indexed: true, required: true },
      { id: 'points_at', type: 'text' },
      { id: 'thing', type: 'ref', to: 'things', indexed: true },
    ],
  },
  things: {
    id: 'things',
    icon: 'thing',
    name: 'Things',
    one: 'thing',
    holds: 'the things you run, and the plan for each',
    title: 'name',
    mobile: ['name', 'lane', 'revenue'],
    state: 'lane',
    pack: 'portfolio',
    // Rows of this register HAVE an identity: one mark and one accent each, chosen at create and
    // frozen, never hand-picked and never the only signal (13 §2.1b).
    identity: { mark: 'mark', accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked', 'retired'], indexed: true, required: true },
      { id: 'revenue', type: 'money' },
      { id: 'since', type: 'day' },
      { id: 'mark', type: 'text' },
      { id: 'hue', type: 'int' },
      { id: 'note', type: 'document' },
    ],
  },
  people: {
    id: 'people',
    name: 'People',
    icon: 'people',
    one: 'person',
    holds: 'collaborators, contractors and accountants, and what each one is for',
    title: 'name',
    mobile: ['name', 'role', 'rate'],
    pack: 'people',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'role', type: 'enum', values: ['client', 'contractor', 'accountant', 'registrar'], indexed: true, required: true },
      { id: 'rate', type: 'money' },
      { id: 'email', type: 'text' },
      { id: 'note', type: 'text' },
    ],
  },
  tasks: {
    id: 'tasks',
    icon: 'task',
    name: 'Tasks',
    one: 'task',
    holds: 'work with a state and a date, so nothing is carried in your head',
    title: 'what',
    mobile: ['what', 'thing', 'state'],
    state: 'state',
    done: ['done', 'dropped'],
    pack: 'work',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'doing', 'blocked', 'done', 'dropped'], indexed: true, required: true },
      { id: 'thing', type: 'ref', to: 'things', indexed: true },
      { id: 'by', type: 'day', indexed: true },
      { id: 'effort', type: 'duration', unit: 'd' },
      { id: 'note', type: 'document' },
    ],
  },
};

/* ── things, and their frozen identity hues ───────────────────────────────
   The hue is chosen at create by the theme's `nextAccentHue` and written once. The kernel never
   computes it: a hue seven degrees from `earn` is an intent, not a mark. */

/**
 * The write-up shape a month of real use settled into (05 §7.6). Nobody designed it; it is worth
 * writing down so an agent does not rediscover it:
 *
 *   1. a `chips` line at the very top, with `{{path}}` values, so the page answers itself before
 *      anyone scrolls
 *   2. `# Name`, then a status line
 *   3. numbered `## N · Title` sections, EACH OPENING WITH A BLOCK AND THEN PROSE
 *   4. for research: `## What is not verified` and `## Sources`
 *   5. a `## Log` of dated one-liners — the document's own history
 *   6. settled things marked so nobody re-runs them
 *
 * The last block is malformed on purpose. It is the visible fence, and it is the only feedback
 * channel an agent has.
 */
const KILN_NOTE = `\`\`\`chips
● | 3 | cuts
● | 2 | clients | good
● | 1 | open question | warn
\`\`\`

# Kiln

Earning · a variable type family, licensed direct. {{money:1840000 GBP}} since March 2024.

## 1 · Where the money comes from

\`\`\`bar | Revenue by channel, twelve months
Direct licences | 11200 | 61%
Studio deals | 5300 | 29%
Specimen prints | 1900 | 10%
Unattributed | 3400 | | hole
\`\`\`

Direct licensing carries it, and that is the thing to protect. The unattributed row is not a
channel — it is three months of payouts that arrived before the reference field existed, and it
sits outside the scale because a hole that sets the bar makes every real category a stub.

## 2 · The licensing question

\`\`\`spec | What each model costs to run
Per seat | Honour system | every foundry does this
Per product | One number per shipped thing | needs a definition of "shipped"
Flat studio | One price, no counting | hardest to raise later
\`\`\`

Open as SG31 and it blocks two quotes. The September issue announces whichever wins, so it is not
deferrable past {{date:2026-09-20}}.

## 3 · What is on the roadmap

\`\`\`steps | Next three
Variable axis QA | the new cut, all weights | doing
Specimen page | one screen, no marketing | open
Licence generator | reads the tier, emits the PDF | blocked
\`\`\`

## 4 · The estate underneath it

\`\`\`spec | Domains and hosting
kiln.example | renews {{until:2026-09-15}} | the apex
kilnfonts.example | lapsing {verified: registrar email, 8 Aug} | auto-renew is off
Object storage | {{money:4100 GBP}} a month | the binaries
\`\`\`

\`\`\`note | Watch this | warn
\`kilnfonts.example\` is the redirect every old licence PDF points at. Letting it lapse breaks
links in files that have already been delivered, which is not a thing an apology fixes. Tracked
as {{ref:tasks#3}}.
\`\`\`

## What is not verified

- The 61% direct share {estimate} — it excludes the unattributed rows above.
- Whether studio deals renew at all {unknown}

## Log

\`\`\`timeline | Recent
{{ago:2026-08-14}} | Raised the studio tier | first increase since launch | good
{{ago:2026-07-02}} | Shipped the italic | four weights | good
{{ago:2026-05-19}} | Moved off the old CI | Hobnail cancelled
\`\`\`

Settled by research — do not run it again: the registrar comparison is D41.

\`\`\`stat | This block is wrong on purpose
Too | many | cells | for | a | stat | row
\`\`\``;

export const THINGS: Entry[] = [
  row(1, { name: 'Kiln', lane: 'earning', revenue: 184_000, since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE }),
  row(2, { name: 'Marlow & Co', lane: 'earning', revenue: 420_000, since: '2023-01-08', mark: '▲', hue: 305 }),
  row(3, { name: 'Portage', lane: 'building', revenue: 0, since: '2026-05-02', mark: '●', hue: 176 }),
  row(4, { name: 'Tallow', lane: 'parked', revenue: 0, since: '2025-02-20', mark: '◼', hue: 261 }),
];

function row(seq: number, fields: Fields, by = 'you', ago = -seq * 37): Entry {
  return { seq, fields, version: 1 + (seq % 4), created: stamp(ago), by };
}

/* ── people ───────────────────────────────────────────────────────────────── */

export const PEOPLE: Entry[] = [
  row(1, { name: 'Halden Type Co', role: 'client', rate: null, email: 'ap@halden.example', note: 'Pays on 45 days, always' }),
  row(2, { name: 'Ravensworth Ltd', role: 'client', rate: null, email: 'accounts@ravensworth.example', note: '' }),
  row(3, { name: 'J. Okonkwo', role: 'contractor', rate: 45_000, email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly' }),
  row(4, { name: 'Pell & Vine', role: 'accountant', rate: null, email: 'hello@pellvine.example', note: 'Year end is 31 March' }),
  row(5, { name: 'Nordhaven Registry', role: 'registrar', rate: null, email: 'support@nordhaven.example', note: '' }),
  row(6, { name: 'S. Marchetti', role: 'contractor', rate: 62_000, email: 'sm@marchetti.example', note: 'Backend, two days a week' }),
];

/* ── obligations ─────────────────────────────────────────────────────────── */

const HAND_OBLIGATIONS: Fields[] = [
  { what: 'Invoice 2026-041 — brand system', party: 1, direction: 'owed_to_me', amount: 480_000, due: day(-38), state: 'open', thing: 2, note: 'Chased twice. 45-day terms expired 3 August.' },
  { what: 'Invoice 2026-046 — retainer, August', party: 2, direction: 'owed_to_me', amount: 240_000, due: day(-9), state: 'open', thing: 2, note: '' },
  { what: 'Illustration, July set', party: 3, direction: 'owed_by_me', amount: 135_000, due: day(-2), state: 'open', thing: 1, note: '' },
  { what: 'Corporation tax, payment on account', party: null, direction: 'owed_by_me', amount: 1_910_000, due: day(4), state: 'open', thing: null, note: 'HMRC reference on the letter, not here.' },
  { what: 'Invoice 2026-049 — type licensing', party: 1, direction: 'owed_to_me', amount: 96_000, due: day(11), state: 'open', thing: 1, note: '' },
  { what: 'Accountant, year-end fee', party: 4, direction: 'owed_by_me', amount: 145_000, due: day(19), state: 'part', thing: null, note: 'Half paid in June.' },
  { what: 'Backend contract, September', party: 6, direction: 'owed_by_me', amount: 496_000, due: day(27), state: 'open', thing: 3, note: '' },
  { what: 'Invoice 2026-038 — discovery', party: 2, direction: 'owed_to_me', amount: 180_000, due: day(-71), state: 'paid', thing: 2, note: 'Paid 24 July.' },
  { what: 'Invoice 2026-035 — brand refresh', party: 1, direction: 'owed_to_me', amount: 620_000, due: day(-96), state: 'paid', thing: 2, note: '' },
  { what: 'Studio insurance, annual', party: null, direction: 'owed_by_me', amount: 38_400, due: day(41), state: 'open', thing: null, note: '' },
  { what: 'VAT quarter to 31 Aug', party: null, direction: 'owed_by_me', amount: 742_000, due: day(63), state: 'open', thing: null, note: '' },
  { what: 'Conference stand, deposit', party: null, direction: 'owed_by_me', amount: 250_000, due: day(88), state: 'open', thing: 1, note: 'Refundable to 30 days out.' },
  { what: 'Invoice 2026-051 — newsletter setup', party: 2, direction: 'owed_to_me', amount: 75_000, due: day(33), state: 'open', thing: 3, note: '' },
  { what: 'Illustration, August set', party: 3, direction: 'owed_by_me', amount: 118_000, due: day(15), state: 'open', thing: 1, note: '' },
];

/** A fixed-seed LCG, so the generated tail is the same grid every time it is opened. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
}

function generatedObligations(from: number, count: number): Entry[] {
  const r = rng(20260903);
  const kinds = ['Hosting, quarterly', 'Font licence renewal', 'Legal review', 'Print run', 'Photography day rate', 'Translation batch', 'Cloud storage, annual', 'Audit fee', 'Courier account', 'Studio rent'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const owedToMe = r() > 0.62;
    const dueIn = Math.round((r() - 0.35) * 320);
    // A record where half the rows are three months past their date is not a record anybody keeps.
    // The further past a date a row is, the likelier it was settled — which is what makes the few
    // that ARE still open mean something on Home.
    const paid = dueIn < -45 ? r() > 0.08 : dueIn < -10 ? r() > 0.45 : false;
    out.push(
      row(from + i, {
        what: `${kinds[Math.floor(r() * kinds.length)]}, ${months[(i * 5) % 12]}`,
        party: Math.floor(r() * 6) + 1,
        direction: owedToMe ? 'owed_to_me' : 'owed_by_me',
        amount: Math.round((r() * 900 + 20)) * 1000,
        due: day(dueIn),
        state: paid ? 'paid' : r() > 0.9 ? 'part' : 'open',
        thing: Math.floor(r() * 4) + 1,
        note: '',
      }),
    );
  }
  return out;
}

export const OBLIGATIONS: Entry[] = [
  ...HAND_OBLIGATIONS.map((f, i) => row(i + 1, f)),
  ...generatedObligations(HAND_OBLIGATIONS.length + 1, 24),
];

/* ── services ─────────────────────────────────────────────────────────────── */

export const SERVICES: Entry[] = [
  { name: 'kiln.example', provider: 'Nordhaven Registry', kind: 'domain', renews: day(12), cost: 1_400, cycle: 'yearly', state: 'live', points_at: 'Pages', thing: 1 },
  { name: 'kilnfonts.example', provider: 'Nordhaven Registry', kind: 'domain', renews: day(-4), cost: 1_400, cycle: 'yearly', state: 'lapsing', points_at: 'redirect → kiln.example', thing: 1 },
  { name: 'marlow.example', provider: 'Nordhaven Registry', kind: 'domain', renews: day(84), cost: 1_400, cycle: 'yearly', state: 'live', points_at: 'Pages', thing: 2 },
  { name: 'portage.example', provider: 'Cove Domains', kind: 'domain', renews: day(203), cost: 3_200, cycle: 'yearly', state: 'live', points_at: 'newsletter', thing: 3 },
  { name: 'tallow.example', provider: 'Cove Domains', kind: 'domain', renews: day(41), cost: 1_400, cycle: 'yearly', state: 'live', points_at: 'nothing', thing: 4 },
  { name: 'Object storage', provider: 'Fenwick Cloud', kind: 'hosting', renews: day(21), cost: 4_100, cycle: 'monthly', state: 'live', points_at: 'font binaries', thing: 1 },
  { name: 'Workers plan', provider: 'Fenwick Cloud', kind: 'hosting', renews: day(21), cost: 500, cycle: 'monthly', state: 'live', points_at: 'kiln.example', thing: 1 },
  { name: 'Newsletter sending', provider: 'Ledger Post', kind: 'saas', renews: day(7), cost: 3_900, cycle: 'monthly', state: 'live', points_at: 'portage.example', thing: 3 },
  { name: 'Design suite', provider: 'Aperture', kind: 'saas', renews: day(56), cost: 6_190, cycle: 'monthly', state: 'live', points_at: '', thing: null },
  { name: 'Bookkeeping', provider: 'Tallyard', kind: 'saas', renews: day(119), cost: 34_000, cycle: 'yearly', state: 'live', points_at: '', thing: null },
  { name: 'Wildcard certificate', provider: 'Nordhaven Registry', kind: 'certificate', renews: day(2), cost: 0, cycle: 'yearly', state: 'live', points_at: '*.kiln.example', thing: 1 },
  { name: 'Error tracking', provider: 'Kestrel', kind: 'saas', renews: day(74), cost: 2_600, cycle: 'monthly', state: 'live', points_at: '', thing: 1 },
  { name: 'Staging box', provider: 'Fenwick Cloud', kind: 'hosting', renews: day(21), cost: 1_200, cycle: 'monthly', state: 'live', points_at: 'staging.kiln.example', thing: 1 },
  { name: 'Old CI plan', provider: 'Hobnail', kind: 'saas', renews: day(-61), cost: 2_900, cycle: 'monthly', state: 'cancelled', points_at: '', thing: 4 },
  { name: 'portagemail.example', provider: 'Cove Domains', kind: 'domain', renews: day(150), cost: 3_200, cycle: 'yearly', state: 'live', points_at: 'sending domain', thing: 3 },
  { name: 'Analytics', provider: 'Bellwether', kind: 'saas', renews: day(31), cost: 1_900, cycle: 'monthly', state: 'live', points_at: '', thing: 3 },
].map((f, i) => row(i + 1, f as Fields));

/* ── tasks ────────────────────────────────────────────────────────────────── */

export const TASKS: Entry[] = [
  { what: 'Chase Halden on 2026-041', state: 'open', thing: 2, by: day(1), effort: 0.2, note: '' },
  { what: 'Decide the licensing tier split', state: 'blocked', thing: 1, by: day(6), effort: 1, note: 'Waiting on SG31.' },
  { what: 'Move kilnfonts.example off auto-renew', state: 'open', thing: 1, by: day(-4), effort: 0.2, note: '' },
  { what: 'Draft the September issue', state: 'doing', thing: 3, by: day(4), effort: 2, note: '' },
  { what: 'Wire the sending domain to Ledger Post', state: 'open', thing: 3, by: day(9), effort: 0.5, note: '' },
  { what: 'Year-end pack for Pell & Vine', state: 'open', thing: null, by: day(23), effort: 1.5, note: '' },
  { what: 'Retire the Tallow staging box', state: 'open', thing: 4, by: day(30), effort: 0.5, note: '' },
  { what: 'Variable axis QA on the new cut', state: 'doing', thing: 1, by: day(3), effort: 3, note: '' },
  { what: 'Rotate the Fenwick deploy key', state: 'open', thing: 1, by: day(12), effort: 0.2, note: '' },
  { what: 'Write the specimen page', state: 'open', thing: 1, by: day(18), effort: 2, note: '' },
  { what: 'Invoice Ravensworth for September', state: 'open', thing: 2, by: day(27), effort: 0.2, note: '' },
  { what: 'Kerning pass, lowercase', state: 'done', thing: 1, by: day(-11), effort: 4, note: '' },
  { what: 'Set up the newsletter archive', state: 'done', thing: 3, by: day(-6), effort: 1, note: '' },
  { what: 'Cancel the Hobnail plan', state: 'done', thing: 4, by: day(-58), effort: 0.2, note: '' },
].map((f, i) => row(i + 1, f as Fields));

export const ROWS: Record<string, Entry[]> = {
  obligations: OBLIGATIONS,
  services: SERVICES,
  things: THINGS,
  people: PEOPLE,
  tasks: TASKS,
};

/* ── declared pages ───────────────────────────────────────────────────────── */

export const PAGES: Record<string, PageDecl> = {
  money: {
    page: 'money',
    title: 'Overview',
    nav: { section: 'Money', order: 10 },
    icon: 'money',
    requires: ['register.obligations', 'register.people'],
    pack: 'money-core',
    blocks: [
      {
        kind: 'stat',
        heading: 'Right now',
        cells: [
          { metric: 'owed-to-you', label: 'Owed to you' },
          { metric: 'due-30d', label: 'Due in 30 days' },
          { metric: 'overdue', label: 'Overdue' },
        ],
      },
      {
        kind: 'table',
        heading: 'Owed to you',
        source: 'register.obligations',
        where: 'direction is owed to me, state is open or part',
        columns: [
          { field: 'seq', label: '#', width: '9ch', align: 'end' },
          { field: 'what', label: 'What', width: 'minmax(18ch,1fr)', link: true },
          { field: 'party', label: 'Party', width: 'minmax(12ch,20ch)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        empty: 'Nothing outstanding.',
        limit: 50,
      },
      {
        kind: 'note',
        tone: 'bad',
        heading: 'Late',
        body: 'One invoice is {{ago:obligations.oldest_overdue}} past its terms. UK statutory interest is 8% above base, and the clause is in the Halden contract.',
        drawn: true,
      },
      {
        kind: 'bar',
        heading: 'Owed by you, by counterparty',
        source: 'register.obligations',
        where: 'direction is owed by me, state is open',
        empty: 'You owe nobody anything.',
      },
      {
        kind: 'table',
        heading: 'Owed by you',
        source: 'register.obligations',
        where: 'direction is owed by me, state is open or part',
        columns: [
          { field: 'seq', label: '#', width: '9ch', align: 'end' },
          { field: 'what', label: 'What', width: 'minmax(18ch,1fr)', link: true },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        empty: 'Nothing outstanding.',
        limit: 50,
      },
    ],
  },
  estate: {
    page: 'estate',
    title: 'Renewals',
    nav: { section: 'Estate', order: 10 },
    icon: 'calendar',
    requires: ['register.services'],
    pack: 'estate',
    blocks: [
      {
        kind: 'stat',
        heading: 'Renewals',
        cells: [
          { metric: 'renews-30d', label: 'Renews in 30 days' },
          { metric: 'estate-year', label: 'Cost per year' },
          { metric: 'lapsing', label: 'Lapsing' },
        ],
      },
      {
        kind: 'timeline',
        heading: 'Next ninety days',
        source: 'register.services',
        empty: 'Nothing renews in the next ninety days.',
      },
      {
        kind: 'table',
        heading: 'Everything',
        source: 'register.services',
        columns: [
          { field: 'name', label: 'Name', width: 'minmax(16ch,1fr)', link: true },
          { field: 'provider', label: 'Provider', width: 'minmax(12ch,18ch)' },
          { field: 'kind', label: 'Kind', width: '13ch' },
          { field: 'cost', label: 'Cost', width: '13ch', align: 'end' },
          { field: 'renews', label: 'Renews', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'renews', dir: 'asc' }],
        empty: 'Nothing here yet.',
        limit: 50,
      },
      {
        kind: 'note',
        tone: 'warn',
        heading: 'Points at nothing',
        body: 'Two domains resolve to nothing and still renew. `tallow.example` costs {{money:1400 GBP}} a year to point at an empty page.',
        drawn: true,
      },
    ],
  },
  work: {
    page: 'work',
    title: 'Board',
    nav: { section: 'Work', order: 10 },
    icon: 'board',
    requires: ['register.tasks'],
    pack: 'work',
    blocks: [
      {
        kind: 'board',
        heading: 'By state',
        source: 'register.tasks',
        empty: 'Nothing open.',
      },
      {
        kind: 'table',
        heading: 'Everything open',
        source: 'register.tasks',
        columns: [
          { field: 'seq', label: '#', width: '9ch', align: 'end' },
          { field: 'what', label: 'What', width: 'minmax(20ch,1fr)', link: true },
          { field: 'thing', label: 'Thing', width: 'minmax(10ch,16ch)' },
          { field: 'state', label: 'State', width: '12ch' },
          { field: 'by', label: 'By', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        empty: 'Nothing open.',
        limit: 50,
      },
    ],
  },
  /** Emerged from the data and NOT placed: it sits in the holding pen until a person moves it. The
      system never writes nav order after first install (06 §3, 29 §3). */
  people: {
    page: 'people',
    title: 'People',
    icon: 'people',
    requires: ['register.people'],
    origin: 'derived',
    placed: false,
    blocks: [
      {
        kind: 'table',
        heading: 'Everyone',
        source: 'register.people',
        columns: [
          { field: 'name', label: 'Name', width: 'minmax(16ch,1fr)', link: true },
          { field: 'role', label: 'Role', width: '14ch' },
          { field: 'rate', label: 'Day rate', width: '14ch', align: 'end' },
          { field: 'email', label: 'Email', width: 'minmax(16ch,1fr)' },
        ],
        empty: 'Nobody yet.',
      },
    ],
  },
};

/* ── the gate ─────────────────────────────────────────────────────────────
   Ranked by the cost of being wrong, never by age. The recommendation is displayed and NEVER
   pre-selected: if it were highlighted on open, three keystrokes would rubber-stamp the machine's
   answer with a reason typed under its influence (19 §4). */

export const QUESTIONS: Question[] = [
  {
    id: 'SG31',
    title: 'Does Kiln licence per-seat, per-product, or one flat studio price?',
    cost: 'Two clients are waiting on a quote, and the September issue announces the pricing.',
    rank: 1,
    opened: stamp(-96),
    entity: 'Kiln',
    options: [
      { key: 'seat', title: 'Per seat', body: 'A price per designer, per year. Predictable for you, and the number every buyer already understands. Enforcement is honour-system, which is what everyone else in type does.' },
      { key: 'product', title: 'Per product', body: 'A price per shipped thing. Matches how the fonts are actually used and does not punish a large studio for having a large studio. Harder to quote in one line.', recommended: true },
      { key: 'flat', title: 'One studio price', body: 'One number, unlimited use, no counting. The simplest sentence on the page and the hardest to raise later.' },
    ],
  },
  {
    id: 'SG29',
    title: 'Does Portage keep sending from portagemail.example, or move to the apex?',
    cost: 'The sending reputation takes about six weeks to rebuild, so a move made after the list doubles is a move made twice.',
    rank: 2,
    opened: stamp(-51),
    entity: 'Portage',
    options: [
      { key: 'stay', title: 'Keep the subdomain', body: 'Reputation stays where it is. The apex is free for a marketing site that does not exist yet.', recommended: true },
      { key: 'apex', title: 'Move to the apex', body: 'One domain to renew instead of two, and the from-address matches the site. Costs six weeks of warm-up now rather than later.' },
    ],
  },
  {
    id: 'SG27',
    title: 'Does Tallow get retired, or parked for another year?',
    cost: 'Parking costs GBP 14.00 a year and one line of attention every time this record is read.',
    rank: 3,
    opened: stamp(-140),
    entity: 'Tallow',
    options: [
      { key: 'retire', title: 'Retire it', body: 'Let the domain lapse, archive the repository, and take the row off every screen. Irreversible after the drop date.' },
      { key: 'park', title: 'Park it another year', body: 'Keep the name. The only cost is the renewal and the attention.' },
    ],
  },
];

export const DECIDED: Question[] = [
  {
    id: 'D41',
    title: 'Which registrar holds the Kiln names?',
    cost: 'A transfer takes five days and a locked domain cannot be moved during a dispute.',
    rank: 0,
    opened: stamp(-2200),
    entity: 'Kiln',
    options: [
      { key: 'nordhaven', title: 'Nordhaven Registry', body: 'Two-factor by default, and registry lock on the apex.' },
      { key: 'cove', title: 'Cove Domains', body: 'Cheaper by about a third, no registry lock.' },
    ],
    decided: {
      option: 'nordhaven',
      reason: 'Registry lock is the only control that survives a compromised account, and the names are the business.',
      by: 'you',
      at: stamp(-2180),
    },
  },
];

/* ── inbox ───────────────────────────────────────────────────────────────── */

export const INBOX: InboxItem[] = [
  { id: 'in_8f21', arrived: stamp(-3), from: 'billing@fenwick.example', subject: 'Your September invoice is ready', body: 'Account 44192. Total GBP 58.00, charged 24 September to the card ending 4417.', suggestion: 'services where provider is Fenwick Cloud → set renews' },
  { id: 'in_8f19', arrived: stamp(-9), from: 'ap@halden.example', subject: 'RE: Invoice 2026-041', body: 'Apologies for the delay. This is with our finance team and should clear in the next payment run on the 12th.' },
  { id: 'in_8f14', arrived: stamp(-26), from: 'noreply@nordhaven.example', subject: 'Renewal reminder: kilnfonts.example', body: 'kilnfonts.example expires on 30 August 2026. Auto-renew is OFF for this name.', suggestion: 'services.renews from the subject line' },
  { id: 'in_8f11', arrived: stamp(-31), from: 'sm@marchetti.example', subject: 'September availability', body: 'I can do Tuesdays and Thursdays through September, and the first week of October is free if you want the migration done in one block.' },
  { id: 'in_8f07', arrived: stamp(-48), from: 'hello@pellvine.example', subject: 'Year end — what we need from you', body: 'Bank statements to 31 March, the fixed asset list, and any invoices raised after the year end that relate to work done before it.' },
  { id: 'in_8f02', arrived: stamp(-73), from: 'support@ledgerpost.example', subject: 'Sending domain not verified', body: 'portagemail.example has no DKIM record. Messages are being sent, but a growing share will land in spam until this is fixed.' },
];

/* ── the vault ───────────────────────────────────────────────────────────
   The register indexes what a key OPENS, never the key. No agent tool returns a secret, reveal is
   deliberate and audited, and the backup benefit and the exfiltration path are the same object. */

export const VAULT: Credential[] = [
  { id: 'cr_01', label: 'Fenwick deploy key', opens: 'Workers deploys for kiln.example', kind: 'api key', rotated: day(-214), stale: true },
  { id: 'cr_02', label: 'Nordhaven API', opens: 'DNS for five domains', kind: 'api key', rotated: day(-41) },
  { id: 'cr_03', label: 'Ledger Post sending key', opens: 'Newsletter delivery for Portage', kind: 'api key', rotated: day(-12) },
  { id: 'cr_04', label: 'Tallyard bookkeeping', opens: 'Read-only ledger export', kind: 'oauth', rotated: day(-88) },
  { id: 'cr_05', label: 'Object storage, write', opens: 'Font binaries bucket', kind: 'api key', rotated: day(-303), stale: true },
  { id: 'cr_06', label: 'Kestrel ingest', opens: 'Error reports from kiln.example', kind: 'token', rotated: day(-64) },
];

/* ── packs ───────────────────────────────────────────────────────────────── */

export const PACKS: PackInfo[] = [
  { id: 'money-core', name: 'Money', blurb: 'What you owe, what you are owed, and installments.', version: '1.4.0', installed: true, registers: ['obligations'], pages: ['money'], author: 'braindog' },
  { id: 'estate', name: 'Estate', blurb: 'Domains, hosting, subscriptions, renewals.', version: '1.2.1', installed: true, registers: ['services'], pages: ['estate'], author: 'braindog' },
  { id: 'people', name: 'People', blurb: 'Collaborators, contractors, accountants.', version: '1.0.3', installed: true, registers: ['people'], pages: [], author: 'braindog' },
  { id: 'work', name: 'Work', blurb: 'Tasks, tracks, dates.', version: '1.1.0', installed: true, registers: ['tasks'], pages: ['work'], author: 'braindog' },
  { id: 'portfolio', name: 'Portfolio', blurb: 'The things you run, and the plan for each.', version: '1.0.0', installed: true, registers: ['things'], pages: [], author: 'braindog' },
  { id: 'agents', name: 'Agents', blurb: 'Learnings, skills, credentials — what each tool is for, and what it opens.', version: '0.9.2', installed: false, registers: ['learnings', 'skills', 'credentials'], pages: ['agents'], author: 'braindog' },
  { id: 'freelancer-uk', name: 'Freelancer UK', blurb: 'Invoices with VAT, statutory interest, and the payment terms clause.', version: '2.0.1', installed: false, registers: ['invoices', 'clients'], pages: ['invoicing'], author: 'k.marsh', stars: 214 },
  { id: 'type-foundry', name: 'Type foundry', blurb: 'Licences, cuts, and who is allowed to use what.', version: '0.4.0', installed: false, registers: ['licences', 'cuts'], pages: ['licensing'], author: 'a.brandt', stars: 37 },
];

/* ── what happened while you were away ───────────────────────────────────
   The read mark advances when the person LEAVES the screen, never when it opens: the predecessor
   shipped the other way round and found that For You had never once drawn its second half, because
   the screen advanced the mark on open and then asked for everything since it (19 §6). */

export const NEWS: NewsItem[] = [
  { at: stamp(-3), by: 'claude', text: 'Added 4 services from the Fenwick invoice', href: '/r/services', tone: 'info' },
  { at: stamp(-9), by: 'rule.reply', text: 'Halden replied on 2026-041 — payment run on the 12th', href: '/r/obligations/1', tone: 'good' },
  { at: stamp(-14), by: 'you', text: 'Marked Kerning pass, lowercase done', href: '/r/tasks/12' },
  { at: stamp(-26), by: 'rule.renewal', text: 'kilnfonts.example moved to lapsing — auto-renew is off', href: '/r/services/2', tone: 'bad' },
  { at: stamp(-31), by: 'codex', text: 'Opened SG31 — the Kiln licensing question', href: '/decide/SG31', tone: 'warn' },
  { at: stamp(-49), by: 'claude', text: 'Set the year-end date on Pell & Vine', href: '/r/people/4' },
];

/* ── the audit log ───────────────────────────────────────────────────────── */

export const AUDIT: AuditEvent[] = [
  { seq: 4192, at: stamp(-3), by: 'claude', kind: 'entry.create', target: 'services#6', note: 'Object storage, from the Fenwick invoice', version: 4192 },
  { seq: 4191, at: stamp(-3), by: 'claude', kind: 'entry.create', target: 'services#7', note: 'Workers plan, from the Fenwick invoice', version: 4191 },
  { seq: 4188, at: stamp(-9), by: 'rule.reply', kind: 'entry.update', target: 'obligations#1', note: 'note ← "Chased twice. 45-day terms expired 3 August."', version: 4188 },
  { seq: 4181, at: stamp(-14), by: 'you', kind: 'entry.update', target: 'tasks#12', note: 'state open → done', version: 4181 },
  { seq: 4174, at: stamp(-26), by: 'rule.renewal', kind: 'entry.update', target: 'services#2', note: 'state live → lapsing', version: 4174 },
  { seq: 4160, at: stamp(-31), by: 'codex', kind: 'question.open', target: 'SG31', note: 'Kiln licensing model', version: 4160 },
  { seq: 4102, at: stamp(-49), by: 'claude', kind: 'entry.update', target: 'people#4', note: 'note ← "Year end is 31 March"', version: 4102 },
  { seq: 4061, at: stamp(-96), by: 'you', kind: 'declaration.set', target: 'page.money', note: 'Added the Overdue stat cell', version: 4061 },
];

/* ── a tier-C run ────────────────────────────────────────────────────────── */

export const JOB: Job = {
  id: 'j_7Q2F',
  kind: 'reconcile',
  status: 'running',
  model: 'your machine · claude-opus-5',
  started: stamp(-0.2),
  events: [
    { seq: 1, tool: 'list', input: 'obligations where state is open', out: '31 rows', ok: true },
    { seq: 2, tool: 'list', input: 'services where renews before 2026-10-03', out: '6 rows', ok: true },
    { seq: 3, tool: 'read', input: 'inbox since 2026-08-01', out: '18 arrivals, 6 unmatched', ok: true },
    { seq: 4, tool: 'search', input: 'Fenwick', out: '4 rows across 2 registers', ok: true },
    { seq: 5, tool: 'propose', input: 'merge services#6 and services#13 — same provider, same renewal', out: 'PROPOSAL_UNCITED — a proposal must attach the rows it read', ok: false },
    { seq: 6, tool: 'list', input: 'services where provider is Fenwick Cloud', out: '3 rows', ok: true },
  ],
};

export const PEOPLE_ACCESS: Person[] = [
  { id: 'you', name: 'You', level: 'owner', hue: 214 },
  { id: 'sm', name: 'S. Marchetti', level: 'write', hue: 305 },
  { id: 'pv', name: 'Pell & Vine', level: 'read', hue: 176 },
];
