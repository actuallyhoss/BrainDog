/**
 * The record the product is shown with — eight registers and the rows in them.
 *
 * THIS IS THE ONE COPY. It was the web app's mock-up, which meant the shape of a register lived in
 * a Svelte app's `lib/` and the backend had nothing to be measured against; every figure the
 * interface showed was a figure about a literal, not about a record. Now the kernel installs these
 * declarations and writes these rows, the interface reads the same constants, and a number on a
 * screen is an assertion that survives being checked.
 *
 * SYNTHETIC BY RULE, the same rule the fixture corpus follows (22 §10): invented names, `.example`
 * hosts, no real person and no real credential. It is a plausible record for the buyer the product
 * is for — one person running several things at once, now using more than one agent, with no shared
 * place to put what all of them need to know.
 *
 * Interesting rows are written by hand; the tail is generated from a fixed seed so a five-hundred
 * row grid has something to be five hundred rows of, and so the same grid appears every time.
 */

import type { Result } from '@braindog/ports';
import type { Declaration, FieldDecl, Json, Kernel } from '@braindog/kernel';

/** What a row holds, before the record has given it a number. */
export type Fields = Record<string, Json | number | null | undefined>;

/**
 * A register, as this record declares one.
 *
 * IT IS A SUPERSET OF WHAT THE KERNEL READS, and deliberately: `icon`, `one`, `holds` and `mobile`
 * are declaration fields in the specification, and the kernel ignores what it does not need. The
 * alternative — a presentation copy beside a storage copy — is two descriptions of one register,
 * and the one that drifts is whichever nobody is testing.
 */
export type SeedRegister = {
  id: string;
  name: string;
  one: string;
  holds: string;
  title: string;
  mobile: readonly [string, string, string];
  state?: string;
  done?: readonly string[];
  fields: readonly SeedField[];
  identity?: { mark: string; accent: string };
  icon?: string;
  pack?: string;
};

export type SeedField = FieldDecl & {
  label?: string;
  required?: boolean;
  index?: boolean;
  unique?: boolean;
  immutable?: boolean;
  /** The date this row is ABOUT, for tone. Declared, never the first `day` field the register has. */
  deadline?: boolean;
  /** In the search index. A register whose title is not searchable is a register nobody can find. */
  search?: boolean;
  /** Lead times. NOBODY SETS A REMINDER: the field declares them and the record derives the rows. */
  remind?: readonly string[];
  /**
   * How a `duration` is SAID, which is not how it is stored. The record holds integer seconds; a
   * task's effort is spoken in days, and the field is what says which.
   */
  unit?: string;
};

/**
 * A money value, which is an integer in minor units WITH ITS OWN CURRENCY.
 *
 * Never a bare number. The record refuses one, and the reason is the whole rule: a figure with no
 * currency beside it is a figure that can be added to another currency, and the sum is not about
 * anything. This record is entirely in sterling, so the helper is short — but the pair is written
 * out on every row rather than assumed once at the top, because the assumption is the bug.
 */
/**
 * A duration, which the record holds as INTEGER SECONDS and a person says in days.
 *
 * `0.2` is not a duration: it is a number of some unit the field forgot to name, and two of them
 * cannot be added without knowing which. Seconds is the one unit, and `2h` and `0.1d` are the same
 * value written two ways rather than two values.
 */
export const days = (n: number): number => Math.round(n * 86_400);

export const gbp = (minor: number): { amount: number; currency: string } => ({ amount: minor, currency: 'GBP' });

/** The record is read as if it were opened on this day, so every relative date is stable. */

export const TODAY = '2026-09-03';
export const NOW = Date.UTC(2026, 8, 3, 12);

export const day = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);

/** An `instant`, not a `day`: a session's age is said in hours and minutes, never in whole days. */
export const hours = (ago: number): string => new Date(NOW - ago * 3_600_000).toISOString();
export const stamp = (offsetHours: number): string => new Date(NOW + offsetHours * 3_600_000).toISOString();

/* ── registers ────────────────────────────────────────────────────────────── */

/**
 * Named factor tables, for the one row-level multiplication a metric needs.
 *
 * 08 §2.5's `lookup` shape, with a literal table instead of an `fx` register — the pattern is the
 * same and so is the reason: a service's `cost` is per CYCLE, so a yearly domain and a monthly
 * bucket are two different units, and adding them gives a number that is not about anything. The
 * factor was written out longhand in one metric and omitted from another, and Kiln's annual cost
 * came out 9.25 times too low. One table, named, read by whatever declares it.
 */
export const LOOKUPS: Record<string, Record<string, number>> = {
  per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 },
};

export const REGISTERS: Record<string, SeedRegister> = {
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
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      { id: 'party', type: 'ref', to: 'people', index: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true, required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], index: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
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
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'provider', type: 'text', index: true, search: true },
      { id: 'kind', label: 'Type', type: 'enum', values: ['domain', 'hosting', 'saas', 'certificate'], index: true, required: true },
      { id: 'renews', type: 'day', index: true, deadline: true, required: true, remind: ['-30d', '-7d', '0d'] },
      { id: 'cost', type: 'money', required: true },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'], required: true },
      { id: 'state', type: 'enum', values: ['live', 'lapsing', 'cancelled'], index: true, required: true },
      { id: 'points_at', label: 'Target', type: 'text' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
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
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'lane', label: 'Status', type: 'enum', values: ['building', 'earning', 'parked', 'retired'], index: true, required: true },
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
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'role', type: 'enum', values: ['client', 'contractor', 'accountant', 'registrar'], index: true, required: true },
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
      { id: 'doing', label: 'Task', type: 'text', required: true, search: true },
      { id: 'agent', type: 'enum', values: ['claude', 'codex', 'cursor', 'you'], index: true, required: true },
      { id: 'state', type: 'enum', values: ['live', 'idle', 'ended'], index: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      /* THE PIN. A session pinned to a track is how context survives the session that made it:
         close the window, come back on Tuesday, open the track, and the thread is all there — what
         each agent was doing, in order, next to the updates that say how it was going. Without it
         an agent session is a thing that happened once and then could not be found again. */
      { id: 'track', type: 'ref', to: 'tracks', index: true },
      { id: 'last_seen', label: 'Last seen', type: 'instant', index: true },
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
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'state', type: 'enum', values: ['open', 'holding', 'done', 'dropped'], index: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'opened', type: 'day', index: true },
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
      { id: 'body', label: 'Update', type: 'document', required: true, search: true },
      { id: 'health', type: 'enum', values: ['on_track', 'at_risk', 'off_track'], index: true, required: true },
      { id: 'track', type: 'ref', to: 'tracks', index: true, required: true },
      { id: 'by', type: 'enum', values: ['claude', 'codex', 'cursor', 'you'], index: true, required: true },
      { id: 'at', label: 'When', type: 'instant', index: true, required: true },
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
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      { id: 'state', type: 'enum', values: ['open', 'doing', 'blocked', 'done', 'dropped'], index: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'by', label: 'Due', type: 'day', index: true, deadline: true, remind: ['0d'] },
      /* Usually unset, and the schema has to be the thing that says so — the prose two documents
         away saying "most tasks carry no track" is what lost last time (10 §7). */
      { id: 'track', type: 'ref', to: 'tracks', index: true },
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

export const THINGS: Fields[] = [
  { name: 'Kiln', lane: 'earning', revenue: gbp(184_000), since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE },
  { name: 'Marlow & Co', lane: 'earning', revenue: gbp(420_000), since: '2023-01-08', mark: '▲', hue: 305 },
  { name: 'Portage', lane: 'building', revenue: gbp(0), since: '2026-05-02', mark: '●', hue: 176 },
  { name: 'Tallow', lane: 'parked', revenue: gbp(0), since: '2025-02-20', mark: '◼', hue: 261 },
];


/* ── people ───────────────────────────────────────────────────────────────── */

export const PEOPLE: Fields[] = [
  { name: 'Halden Type Co', role: 'client', rate: null, email: 'ap@halden.example', note: 'Pays on 45 days, always' },
  { name: 'Ravensworth Ltd', role: 'client', rate: null, email: 'accounts@ravensworth.example', note: '' },
  { name: 'J. Okonkwo', role: 'contractor', rate: gbp(45_000), email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly' },
  { name: 'Pell & Vine', role: 'accountant', rate: null, email: 'hello@pellvine.example', note: 'Year end is 31 March' },
  { name: 'Nordhaven Registry', role: 'registrar', rate: null, email: 'support@nordhaven.example', note: '' },
  { name: 'S. Marchetti', role: 'contractor', rate: gbp(62_000), email: 'sm@marchetti.example', note: 'Backend, two days a week' },
];

/* ── obligations ─────────────────────────────────────────────────────────── */

const HAND_OBLIGATIONS: Fields[] = [
  { what: 'Invoice 2026-041 — brand system', party: 1, direction: 'owed_to_me', amount: gbp(480_000), due: day(-38), state: 'open', thing: 2, note: 'Chased twice. 45-day terms expired 3 August.' },
  { what: 'Invoice 2026-046 — retainer, August', party: 2, direction: 'owed_to_me', amount: gbp(240_000), due: day(-9), state: 'open', thing: 2, note: '' },
  { what: 'Illustration, July set', party: 3, direction: 'owed_by_me', amount: gbp(135_000), due: day(-2), state: 'open', thing: 1, note: '' },
  { what: 'Corporation tax, payment on account', party: null, direction: 'owed_by_me', amount: gbp(1_910_000), due: day(4), state: 'open', thing: null, note: 'HMRC reference on the letter, not here.' },
  { what: 'Invoice 2026-049 — type licensing', party: 1, direction: 'owed_to_me', amount: gbp(96_000), due: day(11), state: 'open', thing: 1, note: '' },
  { what: 'Accountant, year-end fee', party: 4, direction: 'owed_by_me', amount: gbp(145_000), due: day(19), state: 'part', thing: null, note: 'Half paid in June.' },
  { what: 'Backend contract, September', party: 6, direction: 'owed_by_me', amount: gbp(496_000), due: day(27), state: 'open', thing: 3, note: '' },
  { what: 'Invoice 2026-038 — discovery', party: 2, direction: 'owed_to_me', amount: gbp(180_000), due: day(-71), state: 'paid', thing: 2, note: 'Paid 24 July.' },
  { what: 'Invoice 2026-035 — brand refresh', party: 1, direction: 'owed_to_me', amount: gbp(620_000), due: day(-96), state: 'paid', thing: 2, note: '' },
  { what: 'Studio insurance, annual', party: null, direction: 'owed_by_me', amount: gbp(38_400), due: day(41), state: 'open', thing: null, note: '' },
  { what: 'VAT quarter to 31 Aug', party: null, direction: 'owed_by_me', amount: gbp(742_000), due: day(63), state: 'open', thing: null, note: '' },
  { what: 'Conference stand, deposit', party: null, direction: 'owed_by_me', amount: gbp(250_000), due: day(88), state: 'open', thing: 1, note: 'Refundable to 30 days out.' },
  { what: 'Invoice 2026-051 — newsletter setup', party: 2, direction: 'owed_to_me', amount: gbp(75_000), due: day(33), state: 'open', thing: 3, note: '' },
  { what: 'Illustration, August set', party: 3, direction: 'owed_by_me', amount: gbp(118_000), due: day(15), state: 'open', thing: 1, note: '' },
];

/** A fixed-seed LCG, so the generated tail is the same grid every time it is opened. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
}

function generatedObligations(count: number): Fields[] {
  const r = rng(20260903);
  const kinds = ['Hosting, quarterly', 'Font licence renewal', 'Legal review', 'Print run', 'Photography day rate', 'Translation batch', 'Cloud storage, annual', 'Audit fee', 'Courier account', 'Studio rent'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const out: Fields[] = [];
  for (let i = 0; i < count; i++) {
    const owedToMe = r() > 0.62;
    const dueIn = Math.round((r() - 0.35) * 320);
    // A record where half the rows are three months past their date is not a record anybody keeps.
    // The further past a date a row is, the likelier it was settled — which is what makes the few
    // that ARE still open mean something on Home.
    const paid = dueIn < -45 ? r() > 0.08 : dueIn < -10 ? r() > 0.45 : false;
    out.push({
      what: `${kinds[Math.floor(r() * kinds.length)]}, ${months[(i * 5) % 12]}`,
      party: Math.floor(r() * 6) + 1,
      direction: owedToMe ? 'owed_to_me' : 'owed_by_me',
      amount: gbp(Math.round(r() * 900 + 20) * 1000),
      due: day(dueIn),
      state: paid ? 'paid' : r() > 0.9 ? 'part' : 'open',
      thing: Math.floor(r() * 4) + 1,
      note: '',
    });
  }
  return out;
}

export const OBLIGATIONS: Fields[] = [
  ...HAND_OBLIGATIONS,
  ...generatedObligations(24),
];

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

/* ── tasks ────────────────────────────────────────────────────────────────── */

export const TASKS: Fields[] = [
  { what: 'Chase Halden on 2026-041', state: 'open', thing: 2, by: day(1), effort: days(0.2), note: '' },
  { what: 'Decide the licensing tier split', state: 'blocked', thing: 1, by: day(6), effort: days(1), note: 'Waiting on SG31.' },
  { what: 'Move kilnfonts.example off auto-renew', state: 'open', thing: 1, by: day(-4), effort: days(0.2), note: '' },
  { what: 'Draft the September issue', state: 'doing', thing: 3, by: day(4), effort: days(2), note: '' },
  { what: 'Wire the sending domain to Ledger Post', state: 'open', thing: 3, by: day(9), effort: days(0.5), note: '' },
  { what: 'Year-end pack for Pell & Vine', state: 'open', thing: null, by: day(23), effort: days(1.5), note: '' },
  { what: 'Retire the Tallow staging box', state: 'open', thing: 4, by: day(30), effort: days(0.5), note: '' },
  { what: 'Variable axis QA on the new cut', state: 'doing', thing: 1, by: day(3), effort: days(3), note: '' },
  { what: 'Rotate the Fenwick deploy key', state: 'open', thing: 1, by: day(12), effort: days(0.2), note: '' },
  { what: 'Write the specimen page', state: 'open', thing: 1, by: day(18), effort: days(2), note: '' },
  { what: 'Invoice Ravensworth for September', state: 'open', thing: 2, by: day(27), effort: days(0.2), note: '' },
  { what: 'Kerning pass, lowercase', state: 'done', thing: 1, by: day(-11), effort: days(4), note: '' },
  { what: 'Set up the newsletter archive', state: 'done', thing: 3, by: day(-6), effort: days(1), note: '' },
  { what: 'Cancel the Hobnail plan', state: 'done', thing: 4, by: day(-58), effort: days(0.2), note: '' },
];

/**
 * Live agent sessions. `hours(n)` rather than `day(n)`, because a session's age is measured in the
 * unit a person would say it in — "8m ago", not "0d ago".
 */
export const SESSIONS: Fields[] = [
  { doing: 'Variable axis QA — instances 3 of 9', agent: 'claude', state: 'live', thing: 1, track: 1, last_seen: hours(0), wrote: 14, host: 'kiln-mbp' },
  { doing: 'Drafting the specimen page copy', agent: 'codex', state: 'live', thing: 1, track: 3, last_seen: hours(0.1), wrote: 2, host: 'kiln-mbp' },
  { doing: 'Reconciling the Fenwick invoice against services', agent: 'claude', state: 'idle', thing: 3, track: 2, last_seen: hours(3), wrote: 6, host: 'studio-desktop' },
  { doing: 'Chasing Halden on 2026-041', agent: 'you', state: 'ended', thing: 2, last_seen: hours(26), wrote: 1, host: 'studio-desktop' },
  { doing: 'Kerning pass, lowercase', agent: 'claude', state: 'ended', thing: 1, track: 1, last_seen: hours(34), wrote: 41, host: 'kiln-mbp' },
];

/* Five tracks, and the shape of the set is the point.
   Two are open and healthy, one is at risk, one is HOLDING (so no update is expected of it, and it
   must not appear in the missing bucket), and one is open with no update at all — which is the case
   that renders as "Update missing" rather than as blank. A seed where every row is in the happy
   state cannot show you what the mechanism is for. */
export const TRACKS: Fields[] = [
  { name: 'Variable axis QA', state: 'open', thing: 1, opened: day(-38), note: 'Nine instances, three signed off. The rest need the mastering pass first.' },
  { name: 'Get off the Fenwick contract', state: 'open', thing: 3, opened: day(-61), note: 'Notice period is 60 days from the anniversary.' },
  { name: 'Specimen page rebuild', state: 'open', thing: 1, opened: day(-12) },
  { name: 'Move the newsletter off portagemail', state: 'holding', thing: 2, opened: day(-90), note: 'Waiting on the deliverability question, SG29.' },
  { name: 'Year-end filing', state: 'done', opened: day(-210) },
];

/* Updates run oldest to newest per track, because the derivation takes the LAST one and a seed
   ordered the other way would pass every test while showing the wrong health on screen.
   `stamp` counts HOURS, so a figure in days is written as days times 24 rather than left looking
   like a date and behaving like an afternoon. */
export const UPDATES: Fields[] = [
  { body: 'Three instances signed off. Mastering pass is the gate on the other six.', health: 'on_track', track: 1, by: 'you', at: stamp(-20 * 24) },
  { body: 'Mastering pass done. Six instances queued, claude is working through them.', health: 'on_track', track: 1, by: 'claude', at: stamp(-3 * 24) },
  { body: 'Notice window opens on the 12th and closes 60 days later. Nothing to do until then.', health: 'on_track', track: 2, by: 'you', at: stamp(-30 * 24) },
  { body: 'Missed the window last year by four days. Diarised this time, but the renewal auto-charges before the notice lands.', health: 'at_risk', track: 2, by: 'you', at: stamp(-2 * 24) },
  { body: 'Parked behind SG29. Nothing moves until the sending question is decided.', health: 'on_track', track: 4, by: 'you', at: stamp(-45 * 24) },
];

export const ROWS: Record<string, readonly Fields[]> = {
  obligations: OBLIGATIONS,
  services: SERVICES,
  things: THINGS,
  people: PEOPLE,
  tasks: TASKS,
  sessions: SESSIONS,
  tracks: TRACKS,
  updates: UPDATES,
};


/* ── the metrics it ships with ──────────────────────────────────── */

/**
 * The metrics the record ships with, as DOCUMENTS.
 *
 * Every one of these was a `case` in a twelve-branch `switch`. The point of moving them was not
 * tidiness — it is that a page an agent writes can carry a `stat`, because a figure is a row in a
 * table rather than a branch in a function, and a second project page is a second declaration
 * rather than a thirteenth case.
 *
 * TWO SHAPES REPEAT, AND THAT IS THE ARGUMENT. `owed-to-you` and `project-owed` are the same
 * document with one clause added; `estate-year` and `project-cost` likewise. A project page is the
 * register's own numbers with a `thing is Kiln` on the front, and nothing about it is a new kind of
 * thing — which was true in the comment above the old `switch` and false in the code underneath.
 * The three project documents carry `{{it}}` rather than a name, so four projects are four pages
 * over one declaration instead of twelve documents.
 *
 * THE HREF IS NOT HERE. It is derived from `source` and `where`, so a tile and the list it opens
 * cannot disagree — they used to be typed beside each other and drifted twice.
 *
 * They live in the SEED rather than in the app for the reason the registers do: the record is what
 * answers them, and a declaration only the browser could read was a declaration the record could
 * not be measured against.
 */
export type SeedMetric = {
  metric: string;
  name: string;
  source: string;
  where?: string;
  value: unknown;
  format?: string;
  target?: { lte: number } | { gte: number };
  window?: string;
  compare?: 'previous' | 'none';
};

/** Everything not settled, in either direction. The four states a register declares, minus two. */
const OPEN = 'state is open or part';

export const METRICS: Record<string, SeedMetric> = {
  'owed-to-you': {
    metric: 'owed-to-you',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    /* A receivable book is good when it is SMALL, because every pound in it is a pound somebody
       else is holding. The target is the ceiling on that, not a sales goal. */
    target: { lte: 2_000_000 },
    window: '30d',
    compare: 'none',
  },

  'due-30d': {
    metric: 'due-30d',
    name: 'Due in 30 days',
    source: 'register.obligations',
    /* BOUNDED AT BOTH ENDS. `before +31d` alone counted everything already late as well, so an
       overdue bill was in this tile and in Overdue at once and the two could not be added. */
    where: `${OPEN}, direction is owed by me, due after yesterday, due before +31d`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 2_500_000 },
    window: '30d',
  },

  /* ONE DIRECTION, like the two tiles it sits beside. This once added receivables to payables and
     painted the sum in the alarm colour: GBP 17,740.00 was GBP 7,200 you are owed plus GBP 10,540
     you owe. Those are not the same problem, and the sum is not a quantity. */
  overdue: {
    metric: 'overdue',
    name: 'Overdue',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before today`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    /* Zero, and it is the one target in the record that is not a judgement call. */
    target: { lte: 0 },
    window: '30d',
  },

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

  'estate-year': {
    metric: 'estate-year',
    name: 'Cost per year',
    source: 'register.services',
    where: 'state is not cancelled',
    /* The row-level product 08 §2.5 describes: `cost` is per cycle, and the cycle is the factor. */
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    format: 'money.GBP',
    /* 300_000, not 30_000. The target was once written a zero short, so a GBP 2,906.80 estate was
       measured against GBP 300.00 and the tile read `warn` for a reason nobody could act on. */
    target: { lte: 300_000 },
    window: '90d',
    compare: 'none',
  },

  /* ── the same three, narrowed by one ref ──────────────────────────────────
     PARAMETERISED, not copied. These were `kiln-open`, `kiln-owed` and `kiln-cost` with the name
     typed into each predicate, so a second project meant three more documents. `{{it}}` is filled
     from the id — `project-open:Portage` — which is what makes one project page a declaration
     rather than a thirteenth case. */

  'project-open': {
    metric: 'project-open',
    name: 'Open',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is not done or dropped',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 5 },
    window: '30d',
    compare: 'none',
  },

  'project-owed': {
    metric: 'project-owed',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, thing is {{it}}`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 1_000_000 },
    window: '30d',
    compare: 'none',
  },

  'project-cost': {
    metric: 'project-cost',
    name: 'Costs a year',
    source: 'register.services',
    where: 'thing is {{it}}, state is not cancelled',
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    format: 'money.GBP',
    target: { lte: 120_000 },
    window: '90d',
    compare: 'none',
  },
};


/* ── the pages it ships with ────────────────────────────────────── */

/**
 * A page is a DOCUMENT, and its blocks are queries.
 *
 * Nothing here is a component. A page names blocks, a block names a kind, a source, a predicate and
 * some columns, and what draws it is a renderer that has never heard of money or of projects — which
 * is what makes a page an agent writes indistinguishable from one that shipped.
 *
 * ONE DECLARATION, ONE PAGE PER ROW. A page that declares `for:` is a TEMPLATE: every `{{field}}` in
 * it resolves against one row of that register, so four projects are four pages over one document
 * rather than four documents with the name typed into every predicate, every metric id and every
 * heading.
 *
 * They live in the SEED for the reason the registers and the metrics do: a page is a document the
 * RECORD holds — it travels in a `.dog` file, it versions when it changes, and a person can point at
 * the version that was live when a figure was screenshotted. A page only the browser could read was
 * a page the record could not carry.
 */
export type SeedPage = Record<string, unknown> & { page: string };

export const PAGES: Record<string, SeedPage> = {
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

/* ── installing it ────────────────────────────────────────────────────────── */

/**
 * The eight registers as kernel declarations.
 *
 * A pass-through, and that is the point: the shape above IS the declaration, so this is a cast plus
 * the two words the kernel needs to file it — not a translation with a chance to be wrong.
 */
export const declarations = (): Declaration[] =>
  Object.values(REGISTERS).map((body) => ({ id: `register.${body.id}`, kind: 'register' as const, body: body as never }));

/**
 * The pages and the metrics, as declarations.
 *
 * A REGISTER AND A PAGE ARE THE SAME KIND OF THING — a document with an id and a body — and they
 * install through the same call for the same reason a batch is a batch: a page that names a register
 * and the register itself must arrive together, or the record is briefly inconsistent and "briefly"
 * is however long the second call takes to fail.
 */
export const pageDeclarations = (): Declaration[] =>
  Object.values(PAGES).map((body) => ({ id: `page.${body.page}`, kind: 'page' as const, body: body as never }));

export const metricDeclarations = (): Declaration[] =>
  Object.values(METRICS).map((body) => ({ id: `metric.${body.metric}`, kind: 'metric' as const, body: body as never }));

/** Which fields of which register are refs, and to what. Read from the declarations, never listed. */
const refsOf = (register: string): Map<string, string> =>
  new Map(
    (REGISTERS[register]?.fields ?? [])
      .filter((f) => f.type === 'ref' && typeof f.to === 'string')
      .map((f) => [f.id, f.to as string]),
  );

/**
 * One row's fields, ready for the write path.
 *
 * A REF IS WRITTEN AS THE NUMBER A PERSON SAYS. The rows above carry `party: 1`, because that is
 * how somebody reading this file thinks about it; the record wants `people#1` and stores the row's
 * id. Turning one into the other here — from the declaration, not from a list — is what keeps the
 * seed readable without making it lie about what a ref is.
 */
export function forWrite(register: string, fields: Fields): Record<string, unknown> {
  const refs = refsOf(register);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const to = refs.get(key);
    out[key] = to !== undefined && typeof value === 'number' ? `${to}#${value}` : value;
  }
  return out;
}

export type Seeded = { registers: number; rows: number; pages: number; metrics: number };

/**
 * Install the declarations, then write every row.
 *
 * THE ORDER IS THE REFERENCES. `things` and `people` are written before the rows that point at
 * them, because a `ref` is resolved at write and a row cannot point at one that does not exist
 * yet — which is a property of the record and not a quirk of this file.
 */
export const ORDER = ['things', 'people', 'tracks', 'obligations', 'services', 'tasks', 'sessions', 'updates'] as const;

export async function installSeed(kernel: Kernel, actor = 'p_seed'): Promise<Result<Seeded>> {
  /* ONCE, AND THE SECOND TIME SAYS SO. Run twice, this doubled every register — and reported the
     same counts both times, so nothing in the return value said what had happened. Worse, the second
     run's refs resolved to the FIRST run's rows, so the duplicates silently cross-linked to the
     originals and the money figures doubled under an unchanged-looking report. */
  for (const register of ORDER)
    if (kernel.count(register) > 0)
      return {
        ok: false,
        refusal: {
          code: 'RECORD_NOT_EMPTY',
          fix: `This record already holds ${kernel.count(register)} rows in ${register}. The seed opens an empty record.`,
          at: register,
        },
      };

  const installed = await kernel.install([...declarations(), ...pageDeclarations(), ...metricDeclarations()]);
  if (!installed.ok) return installed as Result<Seeded>;

  let rows = 0;
  for (const register of ORDER)
    for (const entry of ROWS[register] ?? []) {
      const out = kernel.create(register, forWrite(register, entry), { actor });
      if (!out.ok) return out as unknown as Result<Seeded>;
      rows++;
    }

  return { ok: true, value: { registers: Object.keys(REGISTERS).length, rows, pages: Object.keys(PAGES).length, metrics: Object.keys(METRICS).length } };
}
