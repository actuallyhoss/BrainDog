/**
 * THE MADE-UP RECORD the site draws its product on: Maya Okafor, who runs four projects, and the people she works with.
 * Nobody real. Every drawing on the site imports its names and figures from here and types none of its own, so the
 * desk, Slash and the bands always tell one story (launch call 5: an invented founder, never his record).
 *
 * DATA ONLY. No markup and no components: a figure is a `Figure`, which a drawing shows as a button that opens what
 * it came from, or as a plain span. The words are the prototype's (its script),
 * with the words rules applied and every claim made true for launch day: BrainDog moves no money and sends nothing to
 * a client on its own, so a payment is planned for her yes and a reminder is drafted for it.
 *
 * MONEY IS INTEGER CENTS, in `CENTS`, and `usd()` says each figure the way the prototype says it.
 */
import { CODEX_LISTED, listed } from '../agents.ts';
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
  monthlyBurn: 344_000,
} as const;

/**
 * THE APP'S EIGHT CATEGORY SLOTS (SPEC 1.3): a project's, a person's or the founder's colour is one of them, drawn
 * with the slot's foreground and its tint (`--cat-<slot>`, `--cat-<slot>-tint` in Look B). Never red or orange, so
 * nothing in a category reads as late.
 */
export type Slot = 'blue' | 'violet' | 'pink' | 'teal' | 'sky' | 'amber' | 'lime' | 'slate';

/** The two custom properties a drawing sets to paint something in its slot: `--ph` and `--ph-tint`. */
export const slotVars = (slot: Slot): string => `--ph:var(--cat-${slot});--ph-tint:var(--cat-${slot}-tint)`;

export const FOUNDER = { name: 'Maya Okafor', short: 'Maya', initials: 'M', hue: 18, slot: 'violet' } as const;

export type ProjectId = 'tidepool' | 'ferment' | 'northbound' | 'pocketlab';

export type Project = { name: string; hue: number; slot: Slot; icon: IconName; lane: string };

/** Her four projects, in the order the desk draws them. */
export const PROJECTS: Record<ProjectId, Project> = {
  tidepool: { name: 'Tidepool', hue: 198, slot: 'sky', icon: 'cloud', lane: 'Building' },
  ferment: { name: 'Ferment & Co', hue: 32, slot: 'amber', icon: 'box', lane: 'Earning' },
  northbound: { name: 'Northbound', hue: 262, slot: 'violet', icon: 'target', lane: 'Client' },
  pocketlab: { name: 'Pocketlab', hue: 152, slot: 'teal', icon: 'rocket', lane: 'Building' },
};

export const PROJECT_ORDER: readonly ProjectId[] = ['tidepool', 'ferment', 'northbound', 'pocketlab'];

export type PersonId = 'dana' | 'leo' | 'sam';

export type Person = { name: string; initials: string; role: string; hue: number; slot: Slot };

export const PEOPLE: Record<PersonId, Person> = {
  dana: { name: 'Dana Reyes', initials: 'DR', role: 'design', hue: 330, slot: 'pink' },
  leo: { name: 'Leo Brandt', initials: 'LB', role: 'books', hue: 120, slot: 'lime' },
  sam: { name: 'Sam Patel', initials: 'SP', role: 'Northbound', hue: 262, slot: 'teal' },
};

/** The agents the drawings name, by the handle their marks are kept under. */
export type AgentId = 'claude' | 'cursor' | 'chatgpt' | 'codex';

export type EvidenceKey = 'cash' | 'inv' | 'dana';

/** A figure in a sentence. With a `key` it opens its evidence; `late` draws it in the deeper red, beside its words. */
export type Figure = { text: string; key?: EvidenceKey; late?: boolean };

/** A press in Today's line: it opens one of the desk's places, or the evidence under the line. */
export type Lead = { text: string; go: 'needs' | 'agents' } | { text: string; key: EvidenceKey };

/** A sentence with figures in it, in reading order. */
export type Parts = (string | Figure)[];

/**
 * TODAY'S ONE LINE, as the app's Today says it: the date over the page's name, and one sentence whose first phrase is what needs her, in red. The count is the desk's own (`needs.svelte.ts`), so
 * `NEEDS` here is what it starts at; the other two figures open the Agents place and the cash's evidence.
 *
 * THE DATE IS THE VISITOR'S OWN DAY (`dateSaid`), drawn on their device once the page runs:
 * "Thursday 19 March" was printed into the page in October. With scripting off no date is drawn.
 */
export const BRIEF: { agents: Lead; cash: Lead } = {
  agents: { text: '2 agents', go: 'agents' },
  cash: { text: '14 months', key: 'cash' },
};

/** What a figure opens: a heading and its facts, as label and value ("where it comes from"). */
export const EVIDENCE: Record<EvidenceKey, { head: string; rows: [string, string][] }> = {
  cash: {
    head: 'How long the cash lasts',
    rows: [
      ['In the bank, 2 accounts', usd(CENTS.cashAhead)],
      ['Goes out a month, after what comes in', usd(CENTS.monthlyBurn)],
      ['At this pace it lasts', 'about 14 months'],
    ],
  },
  inv: {
    head: 'Northbound · invoice 1042',
    rows: [
      ['Sent to Sam Patel', '5 Mar'],
      ['Due', '15 Mar'],
      ['Reminder drafted for your yes', '17 Mar'],
      ['Amount', usd(CENTS.northboundInvoice, { pence: true })],
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
};

/**
 * A project's card on Today, the app's card (proj section 4): its figure and label, a spark when it has three points
 * or more, a meter where there is progress, the next step, and who is on it at the foot.
 */
export type Card = {
  big: string;
  label: string;
  late?: string;
  series?: number[];
  meter?: { percent: number; sub: string };
  next: string;
  foot: { agents: AgentId[]; say: string; working: boolean };
};

export type Working = { agent: 'claude' | 'cursor'; project: ProjectId; what: string; sub: string };

/** The Today place: the cash tile, the agents at work, and the four project cards. A `series` is a shape, never money. */
export const TODAY: {
  cash: { head: string; figure: string; say: string; foot: string; series: number[] };
  cards: Record<ProjectId, Card>;
  working: Working[];
  heads: { needs: string; working: string; projects: string; all: string };
  /** WHAT FALLS DUE WITH MONEY ON IT, the next two weeks, as Today's Coming up tile says it (signed by the way it goes). */
  coming: { day: string; date: string; name: string; cents: number }[];
  /** A WIDGET AN AGENT MADE, still a draft: dashed, with who made it and Keep or Throw away (the 30 October board). */
  draft: { title: string; by: AgentId; weeks: { label: string; cents: number }[] };
} = {
  cash: {
    head: 'Cash ahead',
    figure: '14 months',
    say: 'at this pace',
    foot: `${usd(CENTS.cashAhead)} across 2 accounts`,
    series: [52, 51, 49.5, 50.8, 48.2, 47.6, 46.9, 49.1, 48.3, 47.2, 46.4, 48.2],
  },
  cards: {
    tidepool: {
      big: usd(CENTS.tidepoolPayout),
      label: 'a month',
      series: [5.1, 5.4, 5.9, 6.3, 6.8, 7.2, 7.6, 7.9, 8.4],
      next: 'Ship webhook retries',
      foot: { agents: ['claude'], say: 'Claude working', working: true },
    },
    ferment: {
      big: '128',
      label: 'orders this week',
      series: [90, 96, 104, 99, 112, 118, 121, 128],
      next: 'Pack the Hart Street Grocer order',
      foot: { agents: [], say: 'Worked on today', working: false },
    },
    northbound: {
      big: usd(CENTS.northboundInvoice),
      label: 'owed',
      late: '1 late',
      meter: { percent: 62, sub: '25 of 40 hours this sprint' },
      next: 'Move the April sprint a week',
      foot: { agents: ['chatgpt'], say: 'ChatGPT, Tuesday', working: false },
    },
    pocketlab: {
      big: '412',
      label: 'beta users',
      series: [80, 120, 170, 220, 260, 310, 355, 412],
      next: 'Finish the onboarding screens',
      foot: { agents: ['cursor'], say: 'Cursor working', working: true },
    },
  },
  working: [
    { agent: 'claude', project: 'tidepool', what: 'Claude on Tidepool', sub: 'webhook retries · since 09:12' },
    { agent: 'cursor', project: 'pocketlab', what: 'Cursor on Pocketlab', sub: 'onboarding screens · since 10:40' },
  ],
  heads: { needs: 'Needs you', working: 'Working now', projects: 'Projects', all: 'All projects' },
  coming: [
    { day: 'Sat', date: '1', name: 'Rent', cents: -210_000 },
    { day: 'Mon', date: '3', name: 'Tidepool payout', cents: CENTS.tidepoolPayout },
    { day: 'Wed', date: '5', name: 'Figma', cents: -CENTS.figmaBill },
  ],
  draft: {
    title: 'Software, by week',
    by: 'claude',
    weeks: [
      { label: 'W1', cents: 31_200 },
      { label: 'W2', cents: 12_800 },
      { label: 'W3', cents: 45_600 },
      { label: 'W4', cents: 18_400 },
    ],
  },
};

/** The AI tools Maya has connected, as the desk's Agents place lists them. */
export const CONNECTED: { agent: AgentId; name: string; seen: string; live: boolean }[] = [
  { agent: 'claude' as const, name: 'Claude', seen: 'working now', live: true },
  { agent: 'cursor' as const, name: 'Cursor', seen: 'working now', live: true },
  { agent: 'chatgpt' as const, name: 'ChatGPT', seen: 'last seen Tuesday', live: false },
  { agent: 'codex' as const, name: 'Codex', seen: 'last seen Monday', live: false },
].filter((c) => listed(c.agent));

/** The Money place: what goes out in the next days, and what she is owed. */
export const MONEY: {
  owed: { who: string; amount: string; sub: string; late: boolean }[];
  due: { head: string; foot: string };
  owedHead: string;
} = {
  owed: [{ who: 'Northbound, invoice 1042', amount: usd(CENTS.northboundInvoice), sub: '4 days late · Sam Patel', late: true }],
  due: { head: 'Going out this month', foot: `${usd(CENTS.billsMonth)} across five bills` },
  owedHead: 'Owed to you',
};

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

/**
 * WHAT WAITS FOR MAYA ON THE DESK: the two things her Today names, each with its line, its figure and the answer that
 * does it. `ask` and `why` are how the Needs you place says it; `done` is the line once she says yes.
 */
export type Need = {
  id: string;
  what: string;
  sub: string;
  late: boolean;
  amount: string;
  ask: string;
  why: string;
  yes: string;
  no: string;
  done: string;
  evidence: EvidenceKey;
};

export const NEEDS: Need[] = [
  {
    id: 'chase',
    what: 'Northbound invoice',
    sub: '4 days late · Sam Patel',
    late: true,
    amount: usd(CENTS.northboundInvoice),
    ask: `Northbound's ${usd(CENTS.northboundInvoice)} invoice is 4 days late. Chase it?`,
    why: 'A reminder in your words is drafted. Northbound usually pays in 9 days.',
    yes: 'Chase it',
    no: 'Not now',
    done: 'Reminder to Sam Patel drafted in your words',
    evidence: 'inv',
  },
  {
    id: 'pay',
    what: 'Dana Reyes',
    sub: 'due Friday · Tidepool icons',
    late: false,
    amount: usd(CENTS.danaInvoice),
    ask: `Dana Reyes sent a ${usd(CENTS.danaInvoice)} invoice, due Friday. Pay it with the salaries?`,
    why: 'Her invoice came in Monday. You paid her last three with the salaries.',
    yes: 'Plan it for Friday',
    no: 'Not now',
    done: "Dana's invoice is planned for Friday, with the salaries",
    evidence: 'dana',
  },
];

/** A question the chores band shows: something only a person decides, that the desk does not show. */
export type Asked = { id: string; kind: string; by: string; ask: string; why: string; yes: string; no: string; done: string };

export const ASKED: Asked[] = [
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
    /* "SEALED", NOT "THE KEYCHAIN" (3 November): on the site the app's screen name reads as Apple's. */
    ask: 'A Stripe key was pasted into a note. Seal it away?',
    why: 'Agents can still use it by name, without seeing it.',
    yes: 'Seal it',
    no: 'Not now',
    done: 'Key sealed, note cleaned',
  },
];

/**
 * WHERE EACH AGENT STANDS, as Settings says it (`apps/web/src/lib/ui/TrustRows.svelte`): one agent that has earned one
 * kind of change, with "Ask again" beside it, and one still asking about everything. The home page's trust band draws
 * it above what got done on its own.
 */
export const TRUST: { agent: AgentId; say: string; again: boolean }[] = [
  { agent: 'claude', say: 'Claude may add tasks on its own, since 3 Oct', again: true },
  { agent: 'cursor', say: 'Cursor asks before every change', again: false },
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
  { agent: 'claude' as const, text: 'Shipped webhook retries. 18 tests pass.', meta: 'Claude · today 11:02' },
  { agent: 'cursor' as const, text: "Onboarding copy waits on Dana's icons.", meta: 'Cursor · yesterday' },
  { agent: 'chatgpt' as const, text: 'Call with Sam: Northbound wants the April sprint a week later.', meta: 'ChatGPT · Tuesday' },
  { agent: 'codex' as const, text: 'Upgraded the Stripe library. Nothing else changed.', meta: 'Codex · Monday' },
].filter((n) => listed(n.agent));

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
      ', 4 days late. A reminder is drafted and waits for your yes.',
    ],
    read: 'Read 9 invoices',
    actions: [{ label: 'Chase it', tone: 'tint' }, KEEP],
  },
];

/** SLASH'S FIND: every match at once, for no question. The search word is `q`, which a drawing marks in each title. */
export type Hit = { icon: IconName; title: string; sub: string; kind: string };

export type Find = { q: string; count: number; aside: string; hits: Hit[] };

const FOUND = 'no questions spent';

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
    /* Codex's note is a hit only while Codex is named (`CODEX_LISTED` in `lib/agents.ts`). */
    count: CODEX_LISTED ? 4 : 3,
    aside: FOUND,
    hits: [
      { icon: 'key', title: 'Stripe live key', sub: 'In the Keychain · used by Tidepool', kind: 'Key' },
      { icon: 'download', title: 'Stripe payouts', sub: '38 payouts · Tidepool', kind: 'List' },
      ...(CODEX_LISTED ? [{ icon: 'message' as const, title: 'Upgraded the Stripe library', sub: 'Note by Codex · Monday', kind: 'Note' }] : []),
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

/**
 * THE MONEY BAND ON THE HOME PAGE: the business side of Maya's money, as the app's Money home draws it (the 27 October
 * rebuild): the accounts, this month's budgets and what is coming up, in and out. Her own checking sits beside the
 * business, kept apart. The two bank balances add up to the desk's "$48,210 across 2 accounts"; the card is owed, so it
 * is not counted there. COMING UP IS SIGNED AS THE BAND SAYS IT: a positive amount goes out, a negative one comes in.
 */
export const MONEY_BAND: {
  accounts: { name: string; book: string; cents: number; icon: IconName }[];
  /** NET WORTH, week by week: cash and what the add-ons hold, less what is owed. */
  worth: { cents: number; change: string; series: number[]; parts: { name: string; cents: number; icon: IconName }[] };
  budgets: { name: string; spent: number; of: number; icon: IconName; period: string }[];
  coming: { name: string; when: string; cents: number; icon: IconName }[];
} = {
  accounts: [
    { name: 'Business checking', book: 'Ferment & Co', cents: 4_138_000, icon: 'bank' },
    { name: 'Everyday checking', book: 'Maya', cents: 683_000, icon: 'bank' },
    { name: 'Amex', book: 'Maya', cents: -124_000, icon: 'card' },
  ],
  worth: {
    cents: 5_167_000,
    change: 'Up 4% in 12 weeks',
    series: [49.6, 50.0, 49.7, 50.6, 51.0, 50.8, 51.6, 52.0, 51.8, 52.5, 51.2, 51.7],
    parts: [
      { name: 'Cash', cents: 4_821_000, icon: 'cash' },
      { name: 'Index fund', cents: 470_000, icon: 'trend-up' },
      { name: 'Owed on the card', cents: -124_000, icon: 'card' },
    ],
  },
  budgets: [
    { name: 'Software', spent: 41_200, of: 60_000, icon: 'code', period: 'this month' },
    { name: 'Contractors', spent: 523_800, of: 500_000, icon: 'users', period: 'this month' },
    { name: 'Ads', spent: 21_000, of: 35_000, icon: 'tag', period: 'this month' },
  ],
  coming: [
    { name: 'AWS', when: 'Sat 1', cents: CENTS.awsCard, icon: 'cloud' },
    { name: 'Dana Reyes', when: 'Fri 7', cents: CENTS.danaInvoice, icon: 'person' },
    { name: 'Northbound pays', when: 'Wed 12', cents: -CENTS.northboundInvoice, icon: 'cash' },
  ],
};

/** A day as the app's Today says it over its name: "Friday 23 October". */
export const dateSaid = (now: Date): string => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
