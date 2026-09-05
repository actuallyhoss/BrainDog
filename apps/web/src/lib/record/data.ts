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

/** An `instant`, not a `day`: a session's age is said in hours and minutes, never in whole days. */
const hours = (ago: number): string => new Date(NOW - ago * 3_600_000).toISOString();
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
      { id: 'what', label: 'Description', type: 'text', required: true },
      { id: 'party', type: 'ref', to: 'people', indexed: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], indexed: true, required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', indexed: true, deadline: true, required: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], indexed: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', indexed: true },
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
      { id: 'kind', label: 'Type', type: 'enum', values: ['domain', 'hosting', 'saas', 'certificate'], indexed: true, required: true },
      { id: 'renews', type: 'day', indexed: true, deadline: true, required: true },
      { id: 'cost', type: 'money', required: true },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'], required: true },
      { id: 'state', type: 'enum', values: ['live', 'lapsing', 'cancelled'], indexed: true, required: true },
      { id: 'points_at', label: 'Target', type: 'text' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', indexed: true },
    ],
  },
  things: {
    id: 'things',
    icon: 'thing',
    name: 'Projects',
    one: 'project',
    holds: 'what you are building, and the plan for each',
    title: 'name',
    mobile: ['name', 'lane', 'revenue'],
    state: 'lane',
    pack: 'portfolio',
    // Rows of this register HAVE an identity: one mark and one accent each, chosen at create and
    // frozen, never hand-picked and never the only signal (13 §2.1b).
    identity: { mark: 'mark', accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'lane', label: 'Status', type: 'enum', values: ['building', 'earning', 'parked', 'retired'], indexed: true, required: true },
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
  /**
   * AGENT SESSIONS ARE A REGISTER, and 02 §1 already made them the one register the kernel itself
   * declares. That is the whole answer to "a Claude Code widget on my project page": there is no
   * new machinery, no embedded runtime and no code in a block. A session is a typed row like an
   * invoice is, so it can be listed, filtered, referenced by a `thing`, and drawn by any block kind
   * that draws rows.
   *
   * `last_seen` is written by the kernel on every write from that session and is NOT a derivation
   * (02 §5) — the heartbeat sets it in place with no version bump and no event, because a session
   * saying "still here" is not a fact about the business.
   */
  sessions: {
    id: 'sessions',
    icon: 'session',
    name: 'Sessions',
    one: 'session',
    holds: 'what each agent is doing in this record, and what it has touched',
    title: 'doing',
    mobile: ['doing', 'agent', 'state'],
    state: 'state',
    done: ['ended'],
    fields: [
      { id: 'doing', label: 'Task', type: 'text', required: true },
      { id: 'agent', type: 'enum', values: ['claude', 'codex', 'cursor', 'you'], indexed: true, required: true },
      { id: 'state', type: 'enum', values: ['live', 'idle', 'ended'], indexed: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', indexed: true },
      /* THE PIN. A session pinned to a track is how context survives the session that made it:
         close the window, come back on Tuesday, open the track, and the thread is all there — what
         each agent was doing, in order, next to the updates that say how it was going. Without it
         an agent session is a thing that happened once and then could not be found again. */
      { id: 'track', type: 'ref', to: 'tracks', indexed: true },
      { id: 'last_seen', label: 'Last seen', type: 'instant', indexed: true },
      { id: 'wrote', label: 'Writes', type: 'int' },
      { id: 'host', type: 'text' },
    ],
  },
  /**
   * A TRACK IS A LINE OF WORK THAT OUTLIVES THE THINGS ON IT.
   *
   * "Rebuild the specimen page", "get off the Fenwick contract", "variable axis QA" — the thread a
   * person is actually pursuing, which is bigger than a task and smaller than a project. A project
   * is a thing you own; a track is something you are in the middle of, and it ends.
   *
   * IT IS OPTIONAL EVERYWHERE, and that is the single most important property. The prior system
   * traced in 10 §7 put 105 of its 123 tasks into a group, and 61% of those groups held fewer than
   * two items — a grouping field that everything carries is a column of noise that has stopped
   * telling you anything. So `track` is absent from every register's `mobile` list, absent from the
   * default columns, and its field description leads with the normal case. Most rows carry no
   * track. That is not a gap to be filled in.
   *
   * There is NO health field here on purpose. Health exists only as a property of an `updates` row,
   * because a mutable string with no author and no date cannot tell you whether a track was
   * verified healthy on Friday or has said the same thing since March (20 §9). The current value is
   * derived from the newest update, never stored beside it — a column plus a trail of changes to
   * that column is two systems that can disagree.
   */
  tracks: {
    id: 'tracks',
    icon: 'rows',
    name: 'Tracks',
    one: 'track',
    holds: 'the lines of work you are in the middle of, and what each one is waiting on',
    title: 'name',
    mobile: ['name', 'thing', 'state'],
    state: 'state',
    done: ['done', 'dropped'],
    pack: 'work',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'holding', 'done', 'dropped'], indexed: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', indexed: true },
      { id: 'opened', type: 'day', indexed: true },
      { id: 'note', type: 'document' },
    ],
  },

  /**
   * An update: prose, a health, an author and a date, appended and never edited.
   *
   * FOUR PARTS, AND THE FOURTH IS THE ONE EVERYBODY OMITS (20 §9). Health is never a standalone
   * field — you cannot post prose without a health and cannot have a health without prose, an
   * author and a date. The current health is the newest row's, derived. Absence renders as its own
   * value rather than as nothing. And "no update expected" is a SEPARATE value from "update
   * missing", driven by the track's own state — without that, every finished and dormant track
   * piles into the missing bucket, the bucket becomes noise, and the reminder is dead inside a
   * month.
   *
   * Corrections are new rows carrying `supersedes`. There is no edit and no delete, because the
   * append-only log IS the storage for state here rather than an audit artefact bolted beside it.
   */
  updates: {
    id: 'updates',
    icon: 'doc',
    name: 'Updates',
    one: 'update',
    holds: 'what was true about a track on a date, who said so, and how it was going',
    title: 'body',
    mobile: ['body', 'health', 'at'],
    pack: 'work',
    fields: [
      { id: 'body', label: 'Update', type: 'document', required: true },
      { id: 'health', type: 'enum', values: ['on_track', 'at_risk', 'off_track'], indexed: true, required: true },
      { id: 'track', type: 'ref', to: 'tracks', indexed: true, required: true },
      { id: 'by', type: 'enum', values: ['claude', 'codex', 'cursor', 'you'], indexed: true, required: true },
      { id: 'at', label: 'When', type: 'instant', indexed: true, required: true },
      { id: 'supersedes', label: 'Replaces', type: 'ref', to: 'updates' },
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
      { id: 'what', label: 'Description', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'doing', 'blocked', 'done', 'dropped'], indexed: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', indexed: true },
      { id: 'by', label: 'Due', type: 'day', indexed: true, deadline: true },
      /* Usually unset, and the schema has to be the thing that says so — the prose two documents
         away saying "most tasks carry no track" is what lost last time (10 §7). */
      { id: 'track', type: 'ref', to: 'tracks', indexed: true },
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

/**
 * Live agent sessions. `hours(n)` rather than `day(n)`, because a session's age is measured in the
 * unit a person would say it in — "8m ago", not "0d ago".
 */
const SESSIONS: Entry[] = [
  { doing: 'Variable axis QA — instances 3 of 9', agent: 'claude', state: 'live', thing: 1, track: 1, last_seen: hours(0), wrote: 14, host: 'kiln-mbp' },
  { doing: 'Drafting the specimen page copy', agent: 'codex', state: 'live', thing: 1, track: 3, last_seen: hours(0.1), wrote: 2, host: 'kiln-mbp' },
  { doing: 'Reconciling the Fenwick invoice against services', agent: 'claude', state: 'idle', thing: 3, track: 2, last_seen: hours(3), wrote: 6, host: 'studio-desktop' },
  { doing: 'Chasing Halden on 2026-041', agent: 'you', state: 'ended', thing: 2, last_seen: hours(26), wrote: 1, host: 'studio-desktop' },
  { doing: 'Kerning pass, lowercase', agent: 'claude', state: 'ended', thing: 1, track: 1, last_seen: hours(34), wrote: 41, host: 'kiln-mbp' },
].map((f, i) => row(i + 1, f as Fields));

/* Five tracks, and the shape of the set is the point.
   Two are open and healthy, one is at risk, one is HOLDING (so no update is expected of it, and it
   must not appear in the missing bucket), and one is open with no update at all — which is the case
   that renders as "Update missing" rather than as blank. A seed where every row is in the happy
   state cannot show you what the mechanism is for. */
const TRACKS: Entry[] = [
  { name: 'Variable axis QA', state: 'open', thing: 1, opened: day(-38), note: 'Nine instances, three signed off. The rest need the mastering pass first.' },
  { name: 'Get off the Fenwick contract', state: 'open', thing: 3, opened: day(-61), note: 'Notice period is 60 days from the anniversary.' },
  { name: 'Specimen page rebuild', state: 'open', thing: 1, opened: day(-12) },
  { name: 'Move the newsletter off portagemail', state: 'holding', thing: 2, opened: day(-90), note: 'Waiting on the deliverability question, SG29.' },
  { name: 'Year-end filing', state: 'done', opened: day(-210) },
].map((f, i) => row(i + 1, f as Fields));

/* Updates run oldest to newest per track, because the derivation takes the LAST one and a seed
   ordered the other way would pass every test while showing the wrong health on screen.
   `stamp` counts HOURS, so a figure in days is written as days times 24 rather than left looking
   like a date and behaving like an afternoon. */
const UPDATES: Entry[] = [
  { body: 'Three instances signed off. Mastering pass is the gate on the other six.', health: 'on_track', track: 1, by: 'you', at: stamp(-20 * 24) },
  { body: 'Mastering pass done. Six instances queued, claude is working through them.', health: 'on_track', track: 1, by: 'claude', at: stamp(-3 * 24) },
  { body: 'Notice window opens on the 12th and closes 60 days later. Nothing to do until then.', health: 'on_track', track: 2, by: 'you', at: stamp(-30 * 24) },
  { body: 'Missed the window last year by four days. Diarised this time, but the renewal auto-charges before the notice lands.', health: 'at_risk', track: 2, by: 'you', at: stamp(-2 * 24) },
  { body: 'Parked behind SG29. Nothing moves until the sending question is decided.', health: 'on_track', track: 4, by: 'you', at: stamp(-45 * 24) },
].map((f, i) => row(i + 1, f as Fields));

export const ROWS: Record<string, Entry[]> = {
  obligations: OBLIGATIONS,
  services: SERVICES,
  things: THINGS,
  people: PEOPLE,
  tasks: TASKS,
  sessions: SESSIONS,
  tracks: TRACKS,
  updates: UPDATES,
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
  kiln: {
    page: 'kiln',
    title: 'Kiln',
    identity: { register: 'things', seq: 1 },
    nav: { section: 'Projects', order: 10 },
    icon: 'thing',
    requires: ['register.tasks', 'register.sessions', 'register.obligations', 'register.services'],
    blocks: [
      {
        kind: 'stat',
        heading: 'At a glance',
        span: 12,
        cells: [
          { metric: 'kiln-open', label: 'Open' },
          { metric: 'kiln-owed', label: 'Owed to you' },
          { metric: 'kiln-cost', label: 'Costs a year' },
        ],
      },
      {
        kind: 'todo',
        heading: 'What is open',
        span: 5,
        columns: [{ field: 'what' }, { field: 'by' }],
        source: 'register.tasks',
        where: 'thing is Kiln, state is open or doing',
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing open on Kiln.',
      },
      {
        kind: 'timeline',
        heading: 'Agents',
        span: 7,
        columns: [{ field: 'last_seen' }, { field: 'doing' }, { field: 'agent' }],
        source: 'register.sessions',
        where: 'thing is Kiln',
        order: [{ field: 'last_seen', dir: 'desc' }],
        limit: 6,
        empty: 'No agent has touched Kiln.',
      },
      {
        kind: 'table',
        heading: 'Money',
        /* EIGHT, which is what four columns of a `table` need. Declared at 6 it was clamped up
           anyway — `floorFor` gives a table two twelfths a column so its cells do not truncate — so
           the declaration was a number that never reached the screen. Its row partner is the 4. */
        span: 8,
        source: 'register.obligations',
        where: 'thing is Kiln',
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
        empty: 'Nothing owed either way on Kiln.',
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
        where: 'thing is Kiln',
        limit: 6,
        empty: 'Kiln runs on nothing you pay for.',
      },
      {
        /* A `code` block is authored rather than projected: `body` is the whole of it, verbatim.
           It is on a project page because the question "how do I point an agent at this one" is
           asked once per project and answered nowhere else. */
        kind: 'code',
        heading: 'Work on this from an agent',
        span: 12,
        body:
          'braindog.list tasks where thing is Kiln and state is open\n' +
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
