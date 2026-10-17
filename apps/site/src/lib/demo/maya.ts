/**
 * THE MADE-UP RECORD the site draws its product on: Maya Okafor, who runs four projects, and the people she works with.
 * Nobody real. Every drawing on the site imports its names and figures from here and types none of its own, so the
 * desk, Slash and the bands always tell one story (DIRECTION §47, launch call 5: an invented founder, never his record).
 *
 * DATA ONLY. No markup and no components: a figure is a `Figure`, which a drawing shows as a button that opens what
 * it came from, or as a plain span. The words are the prototype's (`loop/site-2026-10-17/src/site.html`, its script),
 * with the words rules applied and every claim made true for launch day: BrainDog moves no money and sends nothing to
 * a client on its own, so a payment is planned for her yes and a reminder is drafted for it.
 *
 * MONEY IS INTEGER CENTS, in `CENTS`, and `usd()` says each figure the way the prototype says it.
 */
import type { IconName } from '../icons.ts';

/** A dollar figure in cents as the page says it: `$8,420`, `$64.20`, or with `pence` always, `$3,200.00`. */
export function usd(cents: number, opts: { pence?: boolean } = {}): string {
  if (!Number.isInteger(cents)) throw new Error(`usd() takes whole cents, and was given ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = abs % 100;
  const tail = opts.pence || rest !== 0 ? `.${String(rest).padStart(2, '0')}` : '';
  return `${sign}$${dollars}${tail}`;
}

/** Every money figure the record holds, in US cents. */
export const CENTS = {
  northboundInvoice: 320_000,
  danaInvoice: 180_000,
  tidepoolPayout: 842_000,
  tidepoolMrrStart: 510_000,
  shopifyPayout: 231_500,
  figmaCard: 6_420,
  awsCard: 52_000,
  cashAhead: 4_821_000,
  billsMonth: 694_000,
  salaries: 440_000,
  googleWorkspace: 15_600,
  figmaBill: 6_400,
} as const;

export const FOUNDER = { name: 'Maya Okafor', short: 'Maya', initials: 'MO', hue: 18 } as const;

export type ProjectId = 'tidepool' | 'ferment' | 'northbound' | 'pocketlab';

export type Project = { name: string; hue: number; icon: IconName; lane: string };

/** Her four projects, in the order the desk draws them. */
export const PROJECTS: Record<ProjectId, Project> = {
  tidepool: { name: 'Tidepool', hue: 198, icon: 'cloud', lane: 'Building' },
  ferment: { name: 'Ferment & Co', hue: 32, icon: 'box', lane: 'Earning' },
  northbound: { name: 'Northbound', hue: 262, icon: 'target', lane: 'Client' },
  pocketlab: { name: 'Pocketlab', hue: 152, icon: 'rocket', lane: 'Building' },
};

export const PROJECT_ORDER: readonly ProjectId[] = ['tidepool', 'ferment', 'northbound', 'pocketlab'];

export type PersonId = 'dana' | 'leo' | 'sam';

export type Person = { name: string; initials: string; role: string; hue: number };

export const PEOPLE: Record<PersonId, Person> = {
  dana: { name: 'Dana Reyes', initials: 'DR', role: 'design', hue: 330 },
  leo: { name: 'Leo Brandt', initials: 'LB', role: 'books', hue: 120 },
  sam: { name: 'Sam Patel', initials: 'SP', role: 'Northbound', hue: 262 },
};

/** The agents the drawings name, by the handle their marks are kept under. */
export type AgentId = 'claude' | 'cursor' | 'chatgpt' | 'codex';

export type EvidenceKey = 'inv' | 'late' | 'dana' | 'payout';

/** A figure in a sentence. With a `key` it opens its evidence; `late` draws it in the deeper red, beside its words. */
export type Figure = { text: string; key?: EvidenceKey; late?: boolean };

/** A sentence with figures in it, in reading order. */
export type Parts = (string | Figure)[];

/** The morning brief, rewritten when something changes. */
export const BRIEF: { date: 'Thursday 19 March'; rewritten: '07:02'; parts: Parts } = {
  date: 'Thursday 19 March',
  rewritten: '07:02',
  parts: [
    "Two things need you today. Northbound's invoice of ",
    { text: usd(CENTS.northboundInvoice), key: 'inv' },
    ' is ',
    { text: '4 days late', key: 'late', late: true },
    ", and Dana's ",
    { text: usd(CENTS.danaInvoice), key: 'dana' },
    " is due Friday. Tidepool's March payout of ",
    { text: usd(CENTS.tidepoolPayout), key: 'payout' },
    ' landed this morning.',
  ],
};

/** What each brief figure opens: a heading and its facts, as label and value. */
export const EVIDENCE: Record<EvidenceKey, { head: string; rows: [string, string][] }> = {
  inv: {
    head: 'Northbound · invoice 1042',
    rows: [
      ['Sent to Sam Patel', '5 Mar'],
      ['Due', '15 Mar'],
      ['Reminder drafted for your yes', '17 Mar'],
      ['Amount', usd(CENTS.northboundInvoice, { pence: true })],
    ],
  },
  late: {
    head: 'How late',
    rows: [
      ['Due', 'Sun 15 Mar'],
      ['Today', 'Thu 19 Mar'],
      ['Northbound usually pays', 'in 9 days'],
    ],
  },
  dana: {
    head: 'Invoice from Dana Reyes',
    rows: [
      ['Arrived by email', 'Mon 16 Mar'],
      ['For', 'Tidepool icons, March'],
      ['Due', 'Fri 20 Mar'],
      ['Amount', usd(CENTS.danaInvoice, { pence: true })],
    ],
  },
  payout: {
    head: 'Stripe payout to Tidepool',
    rows: [
      ['Landed', 'today, 07:02'],
      ['Filed by your rule', 'Stripe payouts'],
      ['Amount', usd(CENTS.tidepoolPayout, { pence: true })],
    ],
  },
};

/** A project's card on Today: its big figure and line, and a spark or a meter when it has one. */
export type Card = {
  big: string;
  sub: string;
  late?: boolean;
  series?: number[];
  meter?: { percent: number; sub: string };
};

/** One thing in the brief that waits on her, with the button that takes her to it. */
export type TodayNeed = { what: string; sub: string; act: string; tone: 'quiet' | 'tint' };

export type Working = { agent: 'claude' | 'cursor' | 'chatgpt'; project: ProjectId; what: string; sub: string; live: boolean };

/** The Today tab. A `series` is a shape for a spark or an area, never read as money. */
export const TODAY: {
  needs: TodayNeed[];
  cash: { head: string; aside: string; amount: string; sub: string; series: number[] };
  cards: Record<ProjectId, Card>;
  working: Working[];
  heads: { working: string; arrivals: string; arrivalsAside: string; done: string };
  hidePhone: ProjectId[];
} = {
  needs: [
    { what: `Chase Northbound for ${usd(CENTS.northboundInvoice)}`, sub: '4 days late · Sam Patel', act: 'Chase it', tone: 'quiet' },
    { what: `Pay Dana Reyes ${usd(CENTS.danaInvoice)}`, sub: 'due Friday · you usually pay her with the salaries', act: 'Plan it', tone: 'tint' },
  ],
  cash: {
    head: 'Cash ahead',
    aside: '2 accounts',
    amount: usd(CENTS.cashAhead),
    sub: 'lasts about 14 months at this pace',
    series: [52, 51, 49.5, 50.8, 48.2, 47.6, 46.9, 49.1, 48.3, 47.2, 46.4, 48.2],
  },
  cards: {
    tidepool: { big: usd(CENTS.tidepoolPayout), sub: 'MRR, up 6%', series: [5.1, 5.4, 5.9, 6.3, 6.8, 7.2, 7.6, 7.9, 8.4] },
    ferment: { big: '128', sub: 'orders this week', series: [90, 96, 104, 99, 112, 118, 121, 128] },
    northbound: {
      big: usd(CENTS.northboundInvoice),
      sub: 'owed, 4 days late',
      late: true,
      meter: { percent: 62, sub: '25 of 40 hours this sprint' },
    },
    pocketlab: { big: '412', sub: 'beta users', series: [80, 120, 170, 220, 260, 310, 355, 412] },
  },
  working: [
    { agent: 'claude', project: 'tidepool', what: 'Claude on Tidepool', sub: 'webhook retries · since 09:12', live: true },
    { agent: 'cursor', project: 'pocketlab', what: 'Cursor on Pocketlab', sub: 'onboarding screens · since 10:40', live: true },
    { agent: 'chatgpt', project: 'northbound', what: 'ChatGPT on Northbound', sub: 'logged call notes with Sam · Tuesday', live: false },
  ],
  heads: { working: 'Working now', arrivals: 'Just in', arrivalsAside: 'files itself', done: 'done' },
  hidePhone: ['tidepool', 'northbound', 'pocketlab', 'ferment'],
};

/** What lands while she watches, and where it was filed. `amount` is null when nothing was paid. */
export type Arrival = { icon: IconName; what: string; amount: string | null; to: string; how: string };

export const ARRIVALS: Arrival[] = [
  { icon: 'download', what: 'Stripe payout', amount: usd(CENTS.tidepoolPayout), to: 'Tidepool', how: 'filed as revenue' },
  { icon: 'card', what: 'Card · Figma', amount: usd(CENTS.figmaCard), to: 'Spending', how: 'filed by your rule' },
  { icon: 'branch', what: 'Commit "retry failed webhooks"', amount: null, to: 'Tidepool', how: 'by Claude' },
  { icon: 'mail', what: 'Invoice from Dana Reyes', amount: usd(CENTS.danaInvoice), to: 'Needs you', how: 'due Friday' },
  { icon: 'download', what: 'Shopify payout', amount: usd(CENTS.shopifyPayout), to: 'Ferment & Co', how: 'filed as revenue' },
  { icon: 'card', what: 'Card · AWS', amount: usd(CENTS.awsCard, { pence: true }), to: 'Tidepool', how: 'filed by your rule' },
];

/** The project tab: Tidepool's page. Month bars are cents, drawn against `max`, labelled in thousands. */
export const PROJECT: {
  id: ProjectId;
  title: string;
  sub: string;
  next: { agent: AgentId; text: string; who: string; when: string };
  brief: { head: string; parts: Parts };
  kpis: { label: string; big: string; delta: string }[];
  months: { head: string; unit: string; max: number; bars: { month: string; cents: number }[] };
  people: { head: string; who: PersonId[] };
  runsOn: { head: string; services: { name: string; ok: boolean; sub?: string }[] };
} = {
  id: 'tidepool',
  title: 'Tidepool',
  sub: 'Building · software you sell monthly · since February',
  next: { agent: 'claude', text: 'Next: ship webhook retries', who: 'Claude', when: 'today' },
  brief: {
    head: 'Where it stands',
    parts: [
      'Monthly revenue is ',
      { text: usd(CENTS.tidepoolPayout) },
      ', up ',
      { text: '6%' },
      " on February. Claude ships the webhook retries today, and the pricing page waits on Dana's icons.",
    ],
  },
  kpis: [
    { label: 'Customers', big: '214', delta: '+9 this month' },
    { label: 'Churn', big: '1.8%', delta: 'down 0.3' },
  ],
  months: {
    head: 'Revenue by month',
    unit: 'thousands',
    max: 900_000,
    bars: [
      { month: 'Oct', cents: 590_000 },
      { month: 'Nov', cents: 640_000 },
      { month: 'Dec', cents: 690_000 },
      { month: 'Jan', cents: 740_000 },
      { month: 'Feb', cents: 790_000 },
      { month: 'Mar', cents: 840_000 },
    ],
  },
  people: { head: 'Who works on it', who: ['dana', 'leo'] },
  runsOn: {
    head: 'Runs on',
    services: [
      { name: 'Stripe', ok: true },
      { name: 'Vercel', ok: true },
      { name: 'GitHub', ok: false, sub: 'key renews in 12 days' },
    ],
  },
};

/** A question only she can answer, with both answers and what the record says once she says yes. */
export type Need = { id: string; kind: string; by: string; ask: string; why: string; yes: string; no: string; done: string };

export const NEEDS: Need[] = [
  {
    id: 'pay',
    kind: 'Money',
    by: 'BrainDog',
    ask: `Dana Reyes sent a ${usd(CENTS.danaInvoice)} invoice, due Friday. Pay it with the salaries?`,
    why: 'Her invoice came in Monday. You paid her last three with the salaries.',
    yes: 'Plan it for Friday',
    no: 'Not now',
    done: "Dana's invoice is planned for Friday, with the salaries",
  },
  {
    id: 'sam',
    kind: 'Person',
    by: 'BrainDog',
    ask: 'Sam P. and Sam Patel look like one person. Merge them?',
    why: "Same email, both on Northbound, both in last week's call notes.",
    yes: 'Merge',
    no: 'Keep both',
    done: 'Sam Patel merged, 14 notes kept',
  },
  {
    id: 'key',
    kind: 'Key',
    by: 'Cursor',
    ask: 'A Stripe key was pasted into a note. Move it to the vault?',
    why: 'Agents can still use it from the vault, without ever seeing it.',
    yes: 'Move it',
    no: 'Not now',
    done: 'Key moved to the vault, note cleaned',
  },
];

/**
 * The chores done on their own, each with the reason it was allowed. Every one is something the inbox rules do on
 * launch day: the prototype's "Named the new repository Pocketlab" and "Put 3 new tasks on Pocketlab" are not, since
 * no connector names a project from a repository or files its tasks, so two filing chores stand in for them.
 */
export const HANDLED: { text: string; why: string }[] = [
  { text: 'Filed 6 card payments into Spending', why: 'your rule for cards' },
  { text: 'Filed 2 receipts from email into Spending', why: 'your rule for receipts' },
  { text: 'Moved the Shopify payout into Ferment & Co', why: 'learned in February' },
  { text: 'Put the AWS bill on Tidepool', why: 'learned in March' },
];

/** The notes agents leave on the record, newest first. */
export const NOTES: { agent: AgentId; text: string; meta: string }[] = [
  { agent: 'claude', text: 'Shipped webhook retries. 18 tests pass.', meta: 'Claude · today 11:02' },
  { agent: 'cursor', text: "Onboarding copy waits on Dana's icons.", meta: 'Cursor · yesterday' },
  { agent: 'chatgpt', text: 'Call with Sam: Northbound wants the April sprint a week later.', meta: 'ChatGPT · Tuesday' },
  { agent: 'codex', text: 'Upgraded the Stripe library. Nothing else changed.', meta: 'Codex · Monday' },
];

/** The agent tab's terminal, line by line. An empty line is a gap; `tone` picks the line's colour. */
export const TERM: { tone: 'dim' | 'bold' | 'good' | 'white' | ''; text: string }[] = [
  { tone: 'dim', text: '~/code/tidepool' },
  { tone: 'white', text: '$ claude' },
  { tone: '', text: '' },
  { tone: 'bold', text: '  braindog · context' },
  { tone: '', text: '  Tidepool, building. Next: ship webhook retries.' },
  { tone: '', text: "  Waiting on Maya: Dana's invoice, due Friday." },
  { tone: '', text: "  Cursor, yesterday: onboarding copy waits on Dana's icons." },
  { tone: '', text: '' },
  { tone: 'white', text: '● Picking up the webhook retries. Reading the failed jobs first.' },
  { tone: 'dim', text: '  3 files changed · 18 tests pass' },
  { tone: '', text: '' },
  { tone: 'bold', text: '  braindog · log' },
  { tone: 'good', text: '  Shipped webhook retries. Left a note on Tidepool.' },
];

/** A button under an answer. `tint` is the one that does the thing; `quiet` keeps or leaves it. */
export type Action = { label: string; tone: 'tint' | 'quiet' };

/**
 * SLASH'S ASK: a question, the answer's lead sentence, then either bars (one per bill, in cents) or a spark, the line
 * that says what it read, and the buttons.
 */
export type Ask = {
  q: string;
  project?: ProjectId;
  lead: Parts;
  bars?: { label: string; cents: number; when: string }[];
  spark?: { head: string; big: string; series: number[] };
  read: string;
  actions: Action[];
};

const KEEP: Action = { label: 'Keep as a page', tone: 'quiet' };

export const ASKS: Ask[] = [
  {
    q: 'What do I owe this month?',
    lead: [{ text: usd(CENTS.billsMonth) }, ' across five bills. Most of it goes on Friday.'],
    bars: [
      { label: 'Salaries', cents: CENTS.salaries, when: 'Fri 20' },
      { label: 'Dana Reyes', cents: CENTS.danaInvoice, when: 'Fri 20' },
      { label: 'AWS', cents: CENTS.awsCard, when: 'Mon 23' },
      { label: 'Google Workspace', cents: CENTS.googleWorkspace, when: 'Tue 24' },
      { label: 'Figma', cents: CENTS.figmaBill, when: 'Wed 25' },
    ],
    read: 'Read 6 bills and the salaries',
    actions: [KEEP],
  },
  {
    q: 'How is Tidepool doing?',
    project: 'tidepool',
    lead: [
      'Revenue is ',
      { text: usd(CENTS.tidepoolPayout) },
      ' a month, up ',
      { text: '6%' },
      '. ',
      { text: '214' },
      ' customers, churn ',
      { text: '1.8%' },
      '. The webhook retries ship today.',
    ],
    spark: {
      head: 'Last nine months',
      big: `${usd(CENTS.tidepoolMrrStart)} → ${usd(CENTS.tidepoolPayout)}`,
      series: [5.1, 5.4, 5.9, 6.3, 6.8, 7.2, 7.6, 7.9, 8.4],
    },
    read: 'Read Tidepool, Stripe and 4 notes',
    actions: [KEEP],
  },
  {
    q: "Who hasn't paid me?",
    lead: [
      'Just Northbound: ',
      { text: usd(CENTS.northboundInvoice), late: true },
      ', four days late. A reminder is drafted and waits for your yes.',
    ],
    read: 'Read 9 invoices',
    actions: [{ label: 'Chase it', tone: 'tint' }, KEEP],
  },
];

/** SLASH'S FIND: every match at once, for no ask. The search word is `q`, which a drawing marks in each title. */
export type Hit = { icon: IconName; title: string; sub: string; kind: string };

export type Find = { q: string; count: number; aside: string; hits: Hit[] };

const FOUND = 'no asks spent';

export const FINDS: Find[] = [
  {
    q: 'dana',
    count: 4,
    aside: FOUND,
    hits: [
      { icon: 'users', title: 'Dana Reyes', sub: 'Designer · Tidepool and Pocketlab', kind: 'Person' },
      { icon: 'cash', title: `Invoice from Dana Reyes · ${usd(CENTS.danaInvoice)}`, sub: 'Due Friday · waits for you', kind: 'Invoice' },
      { icon: 'message', title: "Onboarding copy waits on Dana's icons", sub: 'Note by Cursor · yesterday', kind: 'Note' },
      { icon: 'file', title: "Dana's contract", sub: 'Tidepool · signed in January', kind: 'Page' },
    ],
  },
  {
    q: 'stripe',
    count: 4,
    aside: FOUND,
    hits: [
      { icon: 'key', title: 'Stripe live key', sub: 'In the vault · used by Tidepool', kind: 'Key' },
      { icon: 'download', title: 'Stripe payouts', sub: '38 payouts · Tidepool', kind: 'List' },
      { icon: 'message', title: 'Upgraded the Stripe library', sub: 'Note by Codex · Monday', kind: 'Note' },
      { icon: 'server', title: 'Stripe', sub: 'Tidepool runs on it · working', kind: 'Service' },
    ],
  },
  {
    q: 'northbound',
    count: 4,
    aside: FOUND,
    hits: [
      { icon: PROJECTS.northbound.icon, title: 'Northbound', sub: 'Client · the April sprint', kind: 'Project' },
      {
        icon: 'cash',
        title: `Northbound invoice 1042 · ${usd(CENTS.northboundInvoice)}`,
        sub: '4 days late · reminder drafted',
        kind: 'Invoice',
      },
      { icon: 'users', title: 'Sam Patel', sub: 'Northbound · last call Tuesday', kind: 'Person' },
      { icon: 'message', title: 'Northbound wants the April sprint a week later', sub: 'Note by ChatGPT · Tuesday', kind: 'Note' },
    ],
  },
];

/** A table cell: plain text, or text drawn late in the deeper red, beside its words. */
export type Cell = string | { text: string; late: true };

/** A word in a rule sentence: plain, or `strong` for the parts the rule turns on. */
export type RulePart = string | { text: string; strong: true };

/**
 * SLASH'S MAKE: a draft she can see before it exists, either a new page or list with its table, or a new rule in one
 * sentence. `from` is the line beside the buttons, `yes` the button that adds it, and `where` what "Added to" names.
 */
export type Make = {
  q: string;
  project?: ProjectId;
  draft?: { title: string; sub: string; head: { text: string; numeric?: boolean }[]; cells: Cell[][]; foot: string };
  rule?: { head: string; parts: RulePart[]; sub: string };
  from: string;
  yes: string;
  where: string;
};

const strong = (text: string): RulePart => ({ text, strong: true });

export const MAKES: Make[] = [
  {
    q: "A page for Ferment & Co's wholesale orders",
    project: 'ferment',
    draft: {
      title: 'Wholesale orders',
      sub: 'New page · Ferment & Co',
      head: [{ text: 'Store' }, { text: 'Cases', numeric: true }, { text: 'Total', numeric: true }, { text: 'Paid' }],
      cells: [
        ['Kiln & Crumb', '12', usd(144_000), 'Yes'],
        ['Hart Street Grocer', '8', usd(96_000), 'Due Friday'],
        ['The Pickle Room', '20', usd(240_000), 'Yes'],
        ['Lowtide Café', '6', usd(72_000), { text: '9 days late', late: true }],
      ],
      foot: `4 stores · ${usd(552_000)} in March`,
    },
    from: 'From Slash · reads Orders and Shopify',
    yes: 'Add it',
    where: 'Ferment & Co',
  },
  {
    q: 'Remind me when an invoice is a week late',
    rule: {
      head: 'New rule',
      parts: ['When ', strong('an invoice'), ' is ', strong('7 days late'), ', remind me and ', strong('draft a chase'), ' for my yes.'],
      sub: 'Last month it would have run twice: Northbound and Lowtide Café.',
    },
    from: 'From Slash · reads Invoices',
    yes: 'Turn it on',
    where: 'your rules',
  },
  {
    q: "Track Pocketlab's beta signups",
    project: 'pocketlab',
    draft: {
      title: 'Beta signups',
      sub: 'New list · Pocketlab',
      head: [{ text: 'Name' }, { text: 'Joined' }, { text: 'From' }],
      cells: [
        ['Priya N.', 'today', 'Product Hunt'],
        ['Tomás R.', 'yesterday', 'the waitlist'],
        ['Aiko M.', 'Monday', 'a friend'],
      ],
      foot: 'Fills itself from the signup form · 412 so far',
    },
    from: 'From Slash · reads the signup form',
    yes: 'Add it',
    where: 'Pocketlab',
  },
];
