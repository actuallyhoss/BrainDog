/**
 * The record this app shows, as the app needs it.
 *
 * THE REGISTERS AND THE ROWS ARE NOT HERE ANY MORE. They are `@braindog/seed`, which the kernel
 * installs and writes through the real write path — so the figures below are assertions about a
 * record that exists rather than sums over a literal. What stays here is everything the interface
 * has and the record does not yet: the declared pages, the open questions, the inbox, the vault
 * index, the packs, the news, the audit trail and the job.
 *
 * TWO SHAPES ARE ADAPTED ON THE WAY IN, and both are debts rather than designs:
 *
 *   - MONEY. The record holds `{ amount, currency }`; this app holds a bare integer and pairs it
 *     with one `CURRENCY` constant at render. That constant is exactly the assumption the rule
 *     forbids — two currencies are never added, and a global default is how they get added — so it
 *     goes when the app reads the record instead of this file.
 *   - DURATION. The record holds integer seconds; this app holds days as a decimal, which is why
 *     `0.2 + 3 + 0.2` needed a rounding rule in `display`. Seconds would not have.
 *
 * Both are named in `loop/BACKLOG.md` under the item that swaps `api.ts` for the client.
 */

import { ROWS as SEED_ROWS, REGISTERS as SEED_REGISTERS, day, stamp } from '@braindog/seed';

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

export { LOOKUPS, NOW, TODAY } from '@braindog/seed';
import { NOW } from '@braindog/seed';

/** The eight registers, as this app types them. The seed's shape is a superset of this one. */
export const REGISTERS = SEED_REGISTERS as unknown as Record<string, RegisterDecl>;

/**
 * The seed's rows, given the numbers, versions and authors a record would have given them.
 *
 * `seq` IS THE POSITION, because that is what the record does: rows are numbered as they arrive,
 * and the seed writes them in order. Everything in this file that says `party: 1` is saying
 * `people#1`, and it still is.
 */
function entriesOf(register: string): Entry[] {
  const money = new Set(
    (SEED_REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'money').map((f) => f.id),
  );
  const durations = new Set(
    (SEED_REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'duration').map((f) => f.id),
  );

  return (SEED_ROWS[register] ?? []).map((raw, i) => {
    const seq = i + 1;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === undefined) continue;
      if (money.has(key) && value !== null) fields[key] = (value as { amount: number }).amount;
      else if (durations.has(key) && typeof value === 'number') fields[key] = value / 86_400;
      else fields[key] = value;
    }
    return { seq, fields: fields as Fields, version: 1 + (seq % 4), created: stamp(-seq * 37), by: 'you' };
  });
}

export const THINGS: Entry[] = entriesOf('things');
export const PEOPLE: Entry[] = entriesOf('people');
export const OBLIGATIONS: Entry[] = entriesOf('obligations');
export const SERVICES: Entry[] = entriesOf('services');
export const TASKS: Entry[] = entriesOf('tasks');

export const ROWS: Record<string, Entry[]> = {
  obligations: OBLIGATIONS,
  services: SERVICES,
  things: THINGS,
  people: PEOPLE,
  tasks: TASKS,
  sessions: entriesOf('sessions'),
  tracks: entriesOf('tracks'),
  updates: entriesOf('updates'),
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
        span: 12,
        cells: [
          { metric: 'owed-to-you', label: 'Owed to you' },
          { metric: 'due-30d', label: 'Due in 30 days' },
          { metric: 'overdue', label: 'Overdue' },
          { metric: 'runway', label: 'Runway' },
        ],
      },
      {
        /* Where the money sits, in one line. Grouped and counted, so this is four chips whatever
           the register grows to — the shape stays readable at thirty-eight rows and at three
           thousand, which a table of them does not. */
        kind: 'chips',
        heading: 'Where it sits',
        span: 12,
        columns: [{ field: 'state' }],
        source: 'register.obligations',
        empty: 'Nothing owed either way.',
      },
      /* THE ONLY BLOCK ON ANY PAGE THAT IS ABOUT THE FUTURE. Sourced from the walk rather than from
         a register (08 §2.3's `running`): what is liquid, then every dated movement in order, and
         the balance after each. 05 §2 defers a `forecast` KIND to post-v1 and says the primitive
         layer exists so it can be drawn without one, so this is an ordinary table over a different
         source. The day the kind ships, the kind changes and the query does not. */
      {
        kind: 'table',
        heading: 'What is coming',
        span: 12,
        columns: [{ field: 'day' }, { field: 'what' }, { field: 'delta' }, { field: 'balance' }],
        source: 'forecast.runway',
        limit: 12,
        empty: 'Nothing dated in the next six months.',
      },
      {
        kind: 'table',
        heading: 'Who owes you',
        span: 12,
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
        span: 5,
        body: 'One invoice is {{ago:obligations.oldest_overdue}} past its terms. UK statutory interest is 8% above base, and the clause is in the Halden contract.',
        drawn: true,
      },
      {
        kind: 'bar',
        heading: 'Owed by you, by counterparty',
        span: 7,
        columns: [{ field: 'party' }, { field: 'amount' }],
        source: 'register.obligations',
        where: 'direction is owed by me, state is open',
        empty: 'You owe nobody anything.',
      },
      {
        kind: 'table',
        heading: 'Who you owe',
        span: 12,
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
        empty: 'Nothing here yet.',
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
        span: 12,
        body: 'Two domains resolve to nothing and still renew. `tallow.example` costs {{money:1400 GBP}} a year to point at an empty page.',
        drawn: true,
      },
    ],
  },
  /**
   * A PROJECT PAGE: every block filtered to one thing.
   *
   * This is the shape the whole widget idea was really asking for, and it needs no new machinery —
   * it is an ordinary `page` row whose blocks all carry `where: thing is Kiln`. Open the project and
   * the page is about the project: what is open on it, who is working on it right now, what it is
   * owed, what it costs to keep alive.
   *
   * The SESSIONS block is the interesting one. "A Claude Code widget I can code into" cannot be a
   * block that runs code — 04 §7 has no interpreter to reach and 22 §3 names and rejects the three
   * ways people try. It does not need to be. A session is a typed row (02 §1), so the widget is an
   * ordinary register-bound block, and the instruction you type is an ordinary WRITE — which is the
   * product's own thesis stated back at it: the record is the coordinator, and it is better than a
   * model because it cannot be persuaded (23 §12).
   *
   * Spans read left to right: the stat takes the row, then work and agents sit side by side,
   * then money and the estate.
   */
  /**
   * ONE DECLARATION, FOUR PAGES. This was `kiln:`, with the name typed into six predicates, three
   * metric ids and five sentences — and a second project meant a second copy of all of it. The
   * `{{name}}` is the row's own field, resolved once per project the `for:` predicate admits, and
   * the slug comes from the row's title so `/p/kiln` is still `/p/kiln`.
   *
   * `parked` and `retired` projects get no page. A rail with a page for something nobody is working
   * on is a rail you stop reading.
   */
  project: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things', where: 'lane is building or earning' },
    nav: { section: 'Projects', order: 10 },
    icon: 'thing',
    requires: ['register.tasks', 'register.sessions', 'register.obligations', 'register.services'],
    blocks: [
      {
        kind: 'stat',
        heading: 'At a glance',
        span: 12,
        cells: [
          { metric: 'project-open:{{name}}', label: 'Open' },
          { metric: 'project-owed:{{name}}', label: 'Owed to you' },
          { metric: 'project-cost:{{name}}', label: 'Costs a year' },
        ],
      },
      {
        kind: 'todo',
        heading: 'What is open',
        span: 5,
        columns: [{ field: 'what' }, { field: 'by' }],
        source: 'register.tasks',
        where: 'thing is {{name}}, state is open or doing',
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing open on {{name}}.',
      },
      {
        kind: 'timeline',
        heading: 'Agents',
        span: 7,
        columns: [{ field: 'last_seen' }, { field: 'doing' }, { field: 'agent' }],
        source: 'register.sessions',
        where: 'thing is {{name}}',
        order: [{ field: 'last_seen', dir: 'desc' }],
        limit: 6,
        empty: 'No agent has touched {{name}}.',
      },
      {
        kind: 'table',
        heading: 'Money',
        /* EIGHT, which is what four columns of a `table` need. Declared at 6 it was clamped up
           anyway — `floorFor` gives a table two twelfths a column so its cells do not truncate — so
           the declaration was a number that never reached the screen. Its row partner is the 4. */
        span: 8,
        source: 'register.obligations',
        where: 'thing is {{name}}',
        /* THE DIRECTION IS A COLUMN, because this block holds both and its own `empty:` says so.
           Four columns of `# | What | Amount | Due` drew a receivable and seven payables in one
           unsigned column: read down it and Kiln looks like GBP 25,530.00 of something, where the
           net is minus GBP 23,610.00. Nothing else in the row carried the sign — the tone comes from
           state and date, which are the same for both directions. */
        /* Four columns, so the block still fits beside the 4 next to it. `#` is the one that goes:
           `what` already links to the row, and a direction the reader cannot see is worse than a
           number they cannot say out loud. */
        columns: [
          { field: 'what', label: 'What', width: 'minmax(18ch,1fr)', link: true },
          { field: 'direction', label: 'Which way', width: '13ch' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing owed either way on {{name}}.',
      },
      {
        kind: 'spec',
        heading: 'Keeping it alive',
        /* Two cells, not three. A third column pushes this block's own floor to six, and six beside
           the eight the money table needs is fourteen of twelve — the row would wrap and leave a
           gap. The renewal date is what the Renewals page is for. */
        span: 4,
        columns: [{ field: 'name' }, { field: 'cost' }],
        source: 'register.services',
        where: 'thing is {{name}}',
        limit: 6,
        empty: '{{name}} runs on nothing you pay for.',
      },
      {
        /* A `code` block is authored rather than projected: `body` is the whole of it, verbatim.
           It is on a project page because the question "how do I point an agent at this one" is
           asked once per project and answered nowhere else. */
        kind: 'code',
        heading: 'Work on this from an agent',
        span: 12,
        body:
          'braindog.list tasks where thing is {{name}} and state is open\n' +
          'braindog.set tasks#7 state: doing\n' +
          'braindog.update track 1 health: on_track body: "Six instances queued."',
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
        span: 12,
        columns: [{ field: 'state' }, { field: 'what' }, { field: 'thing' }],
        source: 'register.tasks',
        empty: 'Nothing open.',
      },
      {
        kind: 'steps',
        heading: 'What has to happen first',
        /* Twelve, because there is nothing beside it. A five-twelfth block between two full-width
           ones is not a narrow card, it is a row that is seven twelfths empty. */
        span: 12,
        columns: [{ field: 'what' }, { field: 'by' }, { field: 'thing' }],
        source: 'register.tasks',
        where: 'state is open',
        order: [{ field: 'by', dir: 'asc' }],
        limit: 5,
        empty: 'Nothing waiting.',
      },
      {
        kind: 'table',
        heading: 'Everything open',
        span: 12,
        source: 'register.tasks',
        /* The heading says open. It used to be the only place that said so — the filter was keyed on
           register-and-kind inside the reader, and a heading is not evaluated. */
        where: 'state is not done or dropped',
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
