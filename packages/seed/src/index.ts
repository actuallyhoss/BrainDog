/**
 * The record the product is shown with: seven registers, the rows in them, the agent runs in the
 * kernel's own `session` register, and the agents pack (`packs/agents.ts`), installed through the pack
 * path with its learnings, skills, keys and tools.
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
import { install, normalise, plan, type Applied, type Installed } from '@braindog/declare';
import { KERNEL_WRITTEN, type Declaration, type FieldDecl, type Json, type Kernel } from '@braindog/kernel';

import { AGENTS_PACK, AGENTS_REGISTERS, RUNS_ON, agentsPackDocument } from './packs/agents.ts';

export { AGENTS_PACK, AGENTS_PAGES, AGENTS_REGISTERS, RUNS_ON, agentsPackDocument, type PackManifest } from './packs/agents.ts';
export { FIRST_PARTY, crossPack, firstPartyDocument, firstPartyManifest, type FirstPartyId } from './packs/first-party.ts';

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
  seq_prefix?: string;
  /** On the one register whose rows are projects: its fields listing repositories and folders. */
  scopes?: { repos?: string; folders?: string };
};

export type SeedField = FieldDecl & {
  label?: string;
  required?: boolean;
  default?: Json;
  /** Where a row applies: a ref to a project, or a list of them. */
  scope?: { widen?: 'any' | 'person'; same?: 'both' | 'nearer'; links?: true };
  min?: number;
  max?: number;
  required_when?: { field: string; is: Json };
  by?: 'decide';
  transitions?: Readonly<Record<string, { to: readonly string[]; requires?: readonly string[]; by?: 'decide' }>>;
  index?: boolean;
  unique?: boolean;
  immutable?: boolean;
  /** The date this row is ABOUT, for tone. Declared, never the first `day` field the register has. */
  deadline?: boolean;
  /**
   * The field this one makes readable, if it makes one readable.
   *
   * A COLUMN OF AMOUNTS ON UNSTATED PERIODS CANNOT BE READ: `GBP 340.00` beside `GBP 5.00` is not a
   * comparison until one says yearly and the other monthly. `cycle` is that field for `cost`, and
   * when the default column set narrowed to what a register nominates, the amounts stayed and the
   * period went. The comment on `cycle` below had already predicted exactly that, which is why the
   * pair is declared here rather than inferred by whatever draws the columns.
   */
  qualifies?: string;
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
    /**
     * `Money`, AND IT WAS `Obligations`.
     *
     * IT IS THE FIRST WORD A STRANGER READS AFTER THEIR FIRST ACTION, and it was a word the
     * product never showed them. The first-run screen offers five cards and the first is **Money**,
     * "What you owe, and what you are owed"; choosing it landed on a screen whose largest type said
     * *Obligations*, defined nowhere. A friction pass measured the whole first run and put this one
     * word above the other twenty-nine together, for that reason: every other tax word is met by
     * somebody already oriented, and this one is met by somebody who has just been told what they
     * were choosing and finds it renamed.
     *
     * THE ID IS UNTOUCHED. `obligations` is what the URL says, what a predicate says, and what an
     * agent writes, and `19 §9`'s rule is the one Slack follows rather than the one Notion follows:
     * the interface says the word a person would say, for life, and the API keeps its own. Renaming
     * the id would be a migration; renaming the label is a label.
     */
    name: 'Money',
    icon: 'obligation',
    /* `item`, because half of these are owed to you and half by you: `bill` is wrong for an invoice
       you sent and `invoice` is wrong for a tax payment. */
    one: 'item',
    holds: 'what you owe and what you are owed, with a date and a currency',
    title: 'what',
    /* WHICH WAY THE MONEY GOES, on the one screen that could not say. A card shows three declared
       fields and these were `what`, `amount`, `due` — so a phone rendered `Corporation tax, payment
       on account · GBP 19,100.00 · 7 Sep 2026` in a card identical to an invoice somebody owes YOU,
       and nothing on it said which. Direction is the fact a reader cannot recover from anything else
       on the card; a due date is one row-tap away, and lateness still reads, because the card wears
       the row's tone. */
    mobile: ['what', 'amount', 'direction'],
    state: 'state',
    done: ['paid', 'written_off'],
    pack: 'money-core',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      /* `Who`, AND IT WAS `Party`. A column header is read at a glance by somebody scanning for a
         name, and `Party` is a legal word for the same thing that reads as a social event. */
      { id: 'party', label: 'Who', type: 'ref', to: 'people', index: true },
      /* `Which way`, AND IT WAS `Direction`. The values already read as English: "owed by me" and
         "owed to me". The header above them was the only abstract word in the pair. */
      { id: 'direction', label: 'Which way', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true, required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
      /* `Status`, AND IT WAS `State` — here and on services, sessions, threads and tasks.
         `columnsFor` draws every indexed field and `labelOf` falls back to the id, so five of the
         six lists that carry this concept headed the column `State` while `things` labelled its
         own `Status` at the declaration two hundred lines down. One concept, two headers, and the
         reader meets both inside a minute: `copy.ts` had already caught the same split from the
         other side, where a hardcoded "Set state" put a field's three names on one screen.
         `Status` is the word every product the reader has already used says, and it is the one the
         record was half saying. The field id stays `state`, which is what a predicate says, what
         `done:` lists and what `05 §254` makes a path a page can hold. */
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], index: true, required: true },
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
    /* THE PROJECTS, for every register with a `scope:` field: a run is placed in the project whose
       repositories or folders it is working in, and is global anywhere else. */
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'lane', label: 'Status', type: 'enum', values: ['building', 'earning', 'parked', 'retired'], index: true, required: true },
      { id: 'revenue', type: 'money' },
      { id: 'since', type: 'day' },
      { id: 'mark', type: 'text' },
      { id: 'hue', type: 'int' },
      { id: 'note', type: 'document' },
      { id: 'repos', label: 'Repositories', type: 'list', of: 'text' },
      { id: 'folders', label: 'Folders', type: 'list', of: 'text' },
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
      /* Optional, because a person an agent meets in a commit has no role until somebody gives one. */
      { id: 'role', type: 'enum', values: ['client', 'contractor', 'accountant', 'registrar', 'collaborator', 'other'], index: true },
      { id: 'rate', type: 'money' },
      /* Unique, because an email is how a person met twice is known to be one person. */
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'note', type: 'text' },
      /* Not `search: true` yet: the search box asks every searchable field `matches`, and the kernel
         refuses that on a list, so People could not be searched at all. */
      { id: 'handles', label: 'Handles', type: 'list', of: 'text' },
      /* A token may add a project here and never remove one. */
      { id: 'projects', label: 'Met in', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      /* Where and when each meeting happened, one dated line each, newest last. */
      { id: 'met', label: 'Met', type: 'list', of: 'text' },
      { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'people' },
    ],
  },
  /* NO `sessions` HERE. Agent runs are the kernel's own `session` register (migration 0002), which
     every agent write lands on. A second copy declared here drew a second "Agent runs" list. */
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
    /* `Threads`, AND IT WAS `Tracks`. It appears in the rail on every screen and as a column on
       Tasks, and it was never explained anywhere: a reader meets it cold and it reads as music or
       as shipping. A thread of work is the thing this holds and it is the word people already use
       for it. The id stays `tracks`, which is what the URL and a predicate say. */
    name: 'Threads',
    one: 'thread',
    holds: 'the lines of work you are in the middle of, and what each one is waiting on',
    title: 'name',
    mobile: ['name', 'thing', 'state'],
    state: 'state',
    done: ['done', 'dropped'],
    pack: 'work',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'holding', 'done', 'dropped'], index: true, required: true },
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
    /* `a thread` AND IT WAS `a track`. `holds` is drawn under the heading of an empty list —
       "Updates holds …" — so this sentence is on a screen, and it was the last one in the
       declarations still saying the word the register above it stopped using. */
    holds: 'what was true about a thread on a date, who said so, and how it was going',
    title: 'body',
    mobile: ['body', 'health', 'at'],
    pack: 'work',
    fields: [
      { id: 'body', label: 'Update', type: 'document', required: true, search: true },
      { id: 'health', type: 'enum', values: ['on_track', 'at_risk', 'off_track'], index: true, required: true },
      { id: 'track', label: 'Thread', type: 'ref', to: 'tracks', index: true, required: true },
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
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'doing', 'blocked', 'done', 'dropped'], index: true, required: true },
      /* A task on no project is global. */
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true, scope: {} },
      { id: 'by', label: 'Due', type: 'day', index: true, deadline: true, remind: ['0d'] },
      /* Usually unset, and the schema has to be the thing that says so — the prose two documents
         away saying "most tasks carry no thread" is what lost last time (10 §7). */
      { id: 'track', label: 'Thread', type: 'ref', to: 'tracks', index: true },
      { id: 'effort', type: 'duration', unit: 'd' },
      { id: 'note', type: 'document' },
    ],
  },
};

/**
 * EVERY REGISTER CARRIES `tags`, added here rather than repeated eight times above.
 *
 * THE `example` MARKER IS A VALUE IN IT. A pack's seeded rows are marked `example` so they can be
 * told from real ones and deleted, and `02-DATA-MODEL` §1 puts that marker in a `list<text>` field
 * inside `fields` rather than in a column — a column would be a thing every register carries for
 * the sake of the few that are seeded. The `tag` and `untag` rule actions name no field for the
 * same reason, so this one conventional field is what both of them mean.
 *
 * IT IS ADDED AT DECLARATION AND NOT IN THE LITERAL, because the literal above is what a person
 * reads to know what a register HOLDS, and `tags` is what the record does to a row rather than
 * something the studio wrote down.
 */
const withTags = (body: SeedRegister): Record<string, unknown> =>
  body.fields.some((f) => f.id === 'tags')
    ? { ...body }
    : { ...body, fields: [...body.fields, { id: 'tags', type: 'list', of: 'text' }] };


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
channel: it is three months of payouts that arrived before the reference field existed, and it
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

- The 61% direct share {estimate}; it excludes the unattributed rows above.
- Whether studio deals renew at all {unknown}

## Log

\`\`\`timeline | Recent
{{ago:2026-08-14}} | Raised the studio tier | first increase since launch | good
{{ago:2026-07-02}} | Shipped the italic | four weights | good
{{ago:2026-05-19}} | Moved off the old CI | Hobnail cancelled
\`\`\`

Settled by research. Do not run it again: the registrar comparison is D41.

\`\`\`stat | This block is wrong on purpose
Too | many | cells | for | a | stat | row
\`\`\``;

export const THINGS: Fields[] = [
  /* GBP 18,400.00, AND THE NOTE FOUR LINES BELOW IT HAS SAID SO ALL ALONG. The field held
     `gbp(184_000)` — GBP 1,840.00, one zero short — while Kiln's own note opens "{{money:1840000
     GBP}} since March 2024" and its revenue chart breaks that down: 11,200 + 5,300 + 1,900 = 18,400,
     with printed shares of 61 / 29 / 10 that are exactly those over that total. Three figures agreed
     and the fourth did not, and the fourth is the one the register sorts, the grid shows and any
     future roll-up reads. */
  /* Where each project's work happens. Kiln is on a Mac and Portage on a Windows desktop, so both
     path shapes are placed; Portage's repository is named bare, as its runs report it. */
  { name: 'Kiln', lane: 'earning', revenue: gbp(1_840_000), since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE, repos: ['git.kiln.example/type/kiln-type', 'git.kiln.example/type/kiln-site'], folders: ['/Users/studio/Code/kiln-type', '/Users/studio/Code/kiln-site'] },
  { name: 'Marlow & Co', lane: 'earning', revenue: gbp(420_000), since: '2023-01-08', mark: '▲', hue: 305, repos: ['git.marlow.example/brand/marlow-site'], folders: ['/Users/studio/Clients/marlow'] },
  { name: 'Portage', lane: 'building', revenue: gbp(0), since: '2026-05-02', mark: '●', hue: 176, repos: ['portage'], folders: ['D:\\Studio\\portage'] },
  { name: 'Tallow', lane: 'parked', revenue: gbp(0), since: '2025-02-20', mark: '◼', hue: 261, repos: ['git.kiln.example/type/tallow'] },
];


/* ── people ───────────────────────────────────────────────────────────────── */

export const PEOPLE: Fields[] = [
  { name: 'Halden Type Co', role: 'client', rate: null, email: 'ap@halden.example', note: 'Pays on 45 days, always' },
  { name: 'Ravensworth Ltd', role: 'client', rate: null, email: 'accounts@ravensworth.example', note: '' },
  { name: 'J. Okonkwo', role: 'contractor', rate: gbp(45_000), email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly', handles: ['git:jokonkwo'], met: ['2026-08-20 · commit 3f2a91c in kiln-site'] },
  { name: 'Pell & Vine', role: 'accountant', rate: null, email: 'hello@pellvine.example', note: 'Year end is 31 March' },
  { name: 'Nordhaven Registry', role: 'registrar', rate: null, email: 'support@nordhaven.example', note: '' },
  { name: 'S. Marchetti', role: 'contractor', rate: gbp(62_000), email: 'sm@marchetti.example', note: 'Backend, two days a week', handles: ['git:smarchetti'], met: ['2026-08-27 · commit 8b1e4d0 in portage', '2026-09-02 · commit c47d19e in portage'] },
];

/* ── obligations ─────────────────────────────────────────────────────────── */

const HAND_OBLIGATIONS: Fields[] = [
  { what: 'Invoice 2026-041: brand system', party: 1, direction: 'owed_to_me', amount: gbp(480_000), due: day(-38), state: 'open', thing: 2, note: 'Chased twice. 45-day terms expired 3 August.' },
  { what: 'Invoice 2026-046: retainer, August', party: 2, direction: 'owed_to_me', amount: gbp(240_000), due: day(-9), state: 'open', thing: 2, note: '' },
  { what: 'Illustration, July set', party: 3, direction: 'owed_by_me', amount: gbp(135_000), due: day(-2), state: 'open', thing: 1, note: '' },
  { what: 'Corporation tax, payment on account', party: null, direction: 'owed_by_me', amount: gbp(1_910_000), due: day(4), state: 'open', thing: null, note: 'HMRC reference on the letter, not here.' },
  { what: 'Invoice 2026-049: type licensing', party: 1, direction: 'owed_to_me', amount: gbp(96_000), due: day(11), state: 'open', thing: 1, note: '' },
  { what: 'Accountant, year-end fee', party: 4, direction: 'owed_by_me', amount: gbp(145_000), due: day(19), state: 'part', thing: null, note: 'Half paid in June.' },
  { what: 'Backend contract, September', party: 6, direction: 'owed_by_me', amount: gbp(496_000), due: day(27), state: 'open', thing: 3, note: '' },
  { what: 'Invoice 2026-038: discovery', party: 2, direction: 'owed_to_me', amount: gbp(180_000), due: day(-71), state: 'paid', thing: 2, note: 'Paid 24 July.' },
  { what: 'Invoice 2026-035: brand refresh', party: 1, direction: 'owed_to_me', amount: gbp(620_000), due: day(-96), state: 'paid', thing: 2, note: '' },
  { what: 'Studio insurance, annual', party: null, direction: 'owed_by_me', amount: gbp(38_400), due: day(41), state: 'open', thing: null, note: '' },
  { what: 'VAT quarter to 31 Aug', party: null, direction: 'owed_by_me', amount: gbp(742_000), due: day(63), state: 'open', thing: null, note: '' },
  { what: 'Conference stand, deposit', party: null, direction: 'owed_by_me', amount: gbp(250_000), due: day(88), state: 'open', thing: 1, note: 'Refundable to 30 days out.' },
  { what: 'Invoice 2026-051: newsletter setup', party: 2, direction: 'owed_to_me', amount: gbp(75_000), due: day(33), state: 'open', thing: 3, note: '' },
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
  /* THE REMEDY, AND IT USED TO BE THE CAUSE. This said "Move kilnfonts.example off auto-renew",
     and the service row two hundred lines down is `lapsing` BECAUSE auto-renew is off: the audit
     note says so in as many words, and the Kiln project's own document says letting it lapse
     breaks links in files that have already been delivered. Three places named the fault and the
     one task tracking it proposed doing the fault again. This record is the product's only worked
     example, and a stranger reads it as what a real record looks like. */
  { what: 'Turn auto-renew back on for kilnfonts.example', state: 'open', thing: 1, by: day(-4), effort: days(0.2), note: '' },
  { what: 'Draft the September issue', state: 'doing', thing: 3, by: day(4), effort: days(2), note: '' },
  /* SEVEN OF THE FOURTEEN NAME A TRACK, and none of them did. `tasks` declares a `track:` ref and
     every row left it null, so the Track column on `/r/tasks` was fourteen dashes and every track
     page reported "Still open · 0 · No open tasks on this track" — an empty state that is correct
     about the data and wrong about the world, on five pages whose whole subject is the work. Two of
     the seven are `done`, so the filtering that heading promises is exercised rather than assumed. */
  { what: 'Wire the sending domain to Ledger Post', state: 'open', thing: 3, track: 4, by: day(9), effort: days(0.5), note: '' },
  { what: 'Year-end pack for Pell & Vine', state: 'open', thing: null, track: 5, by: day(23), effort: days(1.5), note: '' },
  { what: 'Retire the Tallow staging box', state: 'open', thing: 4, by: day(30), effort: days(0.5), note: '' },
  { what: 'Variable axis QA on the new cut', state: 'doing', thing: 1, track: 1, by: day(3), effort: days(3), note: '' },
  { what: 'Rotate the Fenwick deploy key', state: 'open', thing: 1, track: 2, by: day(12), effort: days(0.2), note: '' },
  { what: 'Write the specimen page', state: 'open', thing: 1, track: 3, by: day(18), effort: days(2), note: '' },
  { what: 'Invoice Ravensworth for September', state: 'open', thing: 2, by: day(27), effort: days(0.2), note: '' },
  { what: 'Kerning pass, lowercase', state: 'done', thing: 1, track: 1, by: day(-11), effort: days(4), note: '' },
  { what: 'Set up the newsletter archive', state: 'done', thing: 3, track: 4, by: day(-6), effort: days(1), note: '' },
  { what: 'Cancel the Hobnail plan', state: 'done', thing: 4, by: day(-58), effort: days(0.2), note: '' },
];

/**
 * Agent runs, S1 to S5, in the kernel's `session` register and in its field names.
 *
 * `project` is the spoken id of a project, `things#1`, which is what the ladder writes when it places
 * a run. `last_seen` uses `hours(n)` because a run's age is said in minutes and hours. Both are fields
 * only the record writes, so these rows go in through `openRun` below.
 *
 * A person is never a run, so every run here is an agent's: three are Kiln's, and two are finished.
 */
export const RUNS: Fields[] = [
  { doing: 'Variable axis QA, instances 3 of 9', agent: 'claude', state: 'active', project: 'things#1', repo: 'kiln-type', host: 'kiln-mbp', branch: 'axis-qa', next: 'Sign off instances 4 to 6 once the mastering pass lands.', last_seen: hours(0.05) },
  { doing: 'Drafting the specimen page copy', agent: 'codex', state: 'active', project: 'things#1', repo: 'kiln-site', host: 'kiln-mbp', branch: 'specimen-copy', last_seen: hours(0.2) },
  { doing: 'Reconciling the Fenwick invoice against services', agent: 'claude', state: 'idle', project: 'things#3', repo: 'portage', host: 'studio-desktop', next: 'Propose merging the two Fenwick services, citing the rows read.', tried: ['Matching on the invoice total; two services share it.'], last_seen: hours(2) },
  { doing: 'Drafting the chaser for invoice 2026-041', agent: 'cursor', state: 'done', project: 'things#2', host: 'studio-desktop', last_seen: hours(26) },
  { doing: 'Kerning pass, lowercase', agent: 'claude', state: 'done', project: 'things#1', repo: 'kiln-type', host: 'kiln-mbp', last_seen: hours(34) },
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
  /* `thing: 3` AND IT SAID `2`. Everything else about this thread is Portage: the service it names,
     the domain it names, and both tasks hanging off it all carry `thing: 3`, and `things#2` is
     Marlow & Co. The Project column on the list and on the phone card printed the wrong project for
     it, which is the one kind of mistake a worked example must not make: a stranger reads this
     record as what a real one looks like. */
  { name: 'Move the newsletter off portagemail', state: 'holding', thing: 3, opened: day(-90), note: 'Waiting on the deliverability question, SG29.' },
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

/* ── the agents pack's rows ───────────────────────────────────────────────────
   Spread across Kiln (1), Marlow & Co (2), Portage (3) and everywhere (null), so a project page shows
   its own rows over the global ones it inherits, and a project skill hides the global one it shares
   a name with. A ref is the number a person says, as everywhere in this file. */

export const LEARNINGS: Fields[] = [
  { lesson: 'Run the mastering pass before signing off an axis instance.', because: 'Three instances were signed off before mastering, and two had to be reopened when the outlines changed underneath them.', kind: 'method', project: 1, topic: 'axis-qa', confirmed_on: day(-3) },
  { lesson: 'kilnfonts.example is the address every delivered licence PDF links to.', because: 'A 2024 licence PDF was opened against a staging copy without the domain, and its download link led nowhere.', kind: 'fact', project: 1, topic: 'domains', confirmed_on: day(-26) },
  { lesson: 'Match a Fenwick invoice line to a service by renewal date, not by amount.', because: 'Two Fenwick services share one monthly total, so matching on the amount picked the wrong service in the September reconciliation.', kind: 'method', project: 3, topic: 'reconcile', confirmed_on: day(0) },
  { lesson: 'Attach the rows a proposal read, or the record refuses it.', because: 'A merge of two services was proposed without the rows behind it, was refused, and the run had to list the services again.', kind: 'method', project: null, topic: 'proposals', confirmed_on: day(-1) },
  { lesson: 'Money in this record is an integer in minor units, with its currency beside it.', because: 'A total was once read as pounds when it held pence, and a summary quoted a figure one hundred times too large.', kind: 'fact', project: null, topic: 'money' },
  { lesson: 'Chase an unpaid invoice once it is 30 days past its date.', because: 'Two invoices sat unpaid for a month in the spring, and nobody noticed until the quarter closed.', kind: 'method', project: null, topic: 'invoices', state: 'superseded', why: 'Halden pays on 45-day terms, so a chaser at 30 days arrived before anything was late.' },
  { lesson: 'Chase Halden Type Co only once their 45-day terms have run out.', because: 'The chaser for invoice 2026-041 went out at 30 days, and Halden replied that nothing was due yet.', kind: 'method', project: 2, topic: 'invoices', supersedes: 6, confirmed_on: day(-9) },
];

const REVIEW = `# Review a branch

1. Read the whole diff, not only the files the description names.
2. Look for debugging output, commented-out code and files that were not meant to be committed.
3. Run the tests the change touches, then the full suite.
4. Say what you checked and what you did not.`;

const REVIEW_KILN = `# Review a Kiln branch

1. Everything in the global review.
2. Open every changed instance and check its outlines after the mastering pass.
3. Compare kerning pairs against the last release, lowercase first.
4. Name the instances you did not open.`;

export const SKILLS: Fields[] = [
  { name: 'review-pr', trigger: 'Before merging a branch, to read the whole diff for mistakes and leftover debugging.', what: 'A review checklist for any repository.', kind: 'skill', project: null, body: REVIEW, rev: 3, because: [4] },
  { name: 'review-pr', trigger: 'Before merging a Kiln branch. It adds the outline and kerning checks to the review.', what: 'The review, with the checks a type family needs.', kind: 'skill', project: 1, body: REVIEW_KILN, rev: 2, because: [1] },
  { name: 'log-handoff', trigger: 'At the end of a run, to leave the next step and what was tried for whoever comes next.', kind: 'command', project: null, body: '# Leave a handoff\n\nBefore the run ends, write the next step, what was tried and did not work, and the commit it stopped on.', rev: 1 },
  { name: 'reconcile-invoice', trigger: 'When an invoice arrives, to match each line to a service before proposing any change.', kind: 'skill', project: 3, body: '# Reconcile an invoice\n\n1. List the services from the invoice’s provider.\n2. Match each line by renewal date, then by amount.\n3. Propose any change with the rows you read attached.', rev: 4, because: [3, 4] },
  { name: 'chase-invoice', trigger: 'When an invoice is 30 days past its date.', kind: 'skill', project: null, body: '# Chase an invoice\n\nSend a short reminder once an invoice is 30 days past its date.', rev: 2, because: [6], state: 'retired' },
];

/* INDEX ROWS ONLY. None names `value`: that field is the vault door's, and a create naming it is refused.
   A key in the vault is deposited; one that is not says where it is kept. */
export const CREDENTIALS: Fields[] = [
  { label: 'Fenwick deploy key', opens: 'Workers deploys for kiln.example', provider: 'Fenwick Cloud', kind: 'api_token', project: 1, origin: '.mcp.json on kiln-mbp', verified: day(-2), expires: day(12), state: 'stale' },
  { label: 'Object storage, write', opens: 'The font binaries bucket', provider: 'Fenwick Cloud', kind: 'ssh_key', project: 1, where: 'The studio password manager, in the Kiln folder', state: 'live' },
  { label: 'Ledger Post sending key', opens: 'Newsletter delivery for Portage', provider: 'Ledger Post', kind: 'api_token', project: 3, origin: 'Deposited from studio-desktop', verified: day(-12), state: 'live' },
  { label: 'Nordhaven API', opens: 'DNS for every domain the studio holds', provider: 'Nordhaven Registry', kind: 'api_token', project: null, verified: day(-41), expires: day(49), state: 'live' },
  { label: 'Tallyard bookkeeping', opens: 'Read-only ledger export', provider: 'Tallyard', kind: 'password', project: null, where: 'The studio password manager', verified: day(-88), state: 'invalid' },
  { label: 'Fenwick Cloud recovery codes', opens: 'The Fenwick Cloud account, if its two-factor device is lost', provider: 'Fenwick Cloud', kind: 'recovery_codes', project: null, where: 'Printed, in the studio safe', state: 'live' },
];

/* `needs` names keys by their row, never by their value. Kiln's `fenwick` hides the global one. */
export const TOOLS: Fields[] = [
  { name: 'braindog', kind: 'mcp', transport: 'stdio', command: 'braindog', args: ['mcp'], needs: ['BRAINDOG_TOKEN'], trigger: 'To read and write this record from an agent.', project: null, hosts: ['kiln-mbp', 'studio-desktop'], seen: hours(0.05), origin: '~/.claude.json on kiln-mbp', state: 'active' },
  { name: 'fenwick', kind: 'mcp', transport: 'http', endpoint: 'https://mcp.fenwick.example/v1', trigger: 'To read Fenwick Cloud usage and invoices.', project: null, hosts: ['studio-desktop'], seen: hours(2), state: 'active' },
  { name: 'fenwick', kind: 'mcp', transport: 'http', endpoint: 'https://mcp.fenwick.example/v1', needs: ['header:Authorization=credentials#1'], trigger: 'To deploy kiln.example and read its Workers logs.', project: 1, hosts: ['kiln-mbp'], seen: hours(0.2), origin: '.mcp.json in kiln-site', state: 'active' },
  { name: 'ledger-post', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'ledger-post-mcp'], needs: ['LEDGER_POST_KEY=credentials#3'], trigger: 'To check newsletter delivery and bounces for Portage.', project: 3, hosts: ['studio-desktop'], seen: hours(2), origin: '.mcp.json in portage', state: 'active' },
  { name: 'outline-check', kind: 'cli', command: 'outline-check', args: ['--all-instances'], trigger: 'After the mastering pass, to find outline errors in every instance.', project: 1, hosts: ['kiln-mbp'], seen: hours(34), state: 'active' },
  { name: 'nordhaven-dns', kind: 'integration', endpoint: 'https://api.nordhaven.example/v2', needs: ['header:Authorization=credentials#4'], trigger: 'To change DNS records for any domain the studio holds.', project: null, seen: hours(24 * 20), state: 'stale' },
];

export const ROWS: Record<string, readonly Fields[]> = {
  obligations: OBLIGATIONS,
  services: SERVICES,
  things: THINGS,
  people: PEOPLE,
  tasks: TASKS,
  session: RUNS,
  tracks: TRACKS,
  updates: UPDATES,
  learnings: LEARNINGS,
  skills: SKILLS,
  credentials: CREDENTIALS,
  tools: TOOLS,
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
    /* WHAT THIS ONE IS ABOUT, and the word alone was not it. `direction is owed by me` — this is
       money YOU are late paying, and the saved view called "Overdue" is everything late in both
       directions. Two clicks apart, one word, two sets: a person reading `GBP 10,540` under
       "Overdue" and then opening the view was looking at a different question with no way to know. */
    name: 'Overdue to pay',
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
          { metric: 'overdue', label: 'Overdue to pay' },
          /* `How long the money lasts` AND IT WAS `Runway`. A stat tile carries four words and a
             number, so the label IS the explanation: `Runway` is a startup word for a fact every
             business owner already thinks about in a sentence, and this is that sentence. The
             metric id stays `runway`, which is what a declaration and a predicate say. */
          { metric: 'runway', label: 'How long the money lasts' },
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
        /* WHAT THE WALK READS IS DECLARED, not wired: a forecast that knew the word "obligations"
           would be a forecast that works for one record. `opening` is what is liquid today, and it
           is a number somebody has to supply — a runway seeded from a balance nobody declared is a
           forecast that looks like a fact and is a guess. */
        opening: 500_000,
        from: [
          {
            register: 'obligations',
            on: 'due',
            amount: 'amount',
            where: 'state is open or part',
            incoming: { field: 'direction', is: 'owed_to_me' },
          },
          {
            register: 'services',
            on: 'renews',
            amount: 'cost',
            where: 'state is not cancelled',
            every: { field: 'cycle', months: { monthly: 1, yearly: 12, two_yearly: 24 } },
          },
        ],
        limit: 12,
        empty: 'Nothing dated in the next six months.',
      },
      {
        kind: 'table',
        heading: 'Who owes you',
        span: 12,
        source: 'register.obligations',
        where: 'direction is owed to me, state is open or part',
        /* NO `#` COLUMN, AND THREE PAGE TABLES LED WITH ONE. Nine characters of spoken id, at the
           head of a table whose question is who owes me and how much, repeated once per row: on a
           page a friction pass measured at ninety-three numbers for a question needing two or
           three, the id is the one column that answers none of it. It is what `y` copies, what the
           row's own screen prints and what `/audit` leads with, which are the three places somebody
           wants a number they can say out loud. A block on a page is not one of them. */
        columns: [
        /* THE LABEL THE REGISTER DECLARES. A page column heads itself with `label ?? field`
           and `/r/<id>` heads the same field with the register's own `label`, so a page that
           types its own word makes one field two words. The worst of them was `tasks.by`,
           which the register calls Due and this called By, over a right-aligned column of
           dates on a page whose block two above it already said Due. */
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)', link: true },
          { field: 'party', label: 'Who', width: 'minmax(12ch,20ch)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        /* EACH SIDE OF THE LEDGER SAYS ITS OWN NOTHING. All three blocks on this page read "Nothing
           outstanding.", so on an empty record the identical sentence printed on both sides — what
           you are owed and what you owe, told apart by a heading and nothing else. */
        empty: 'Nobody owes you anything.',
        limit: 50,
      },
      {
        kind: 'note',
        tone: 'bad',
        /* THE HEADING NAMES THE SIDE OF THE LEDGER IT IS ABOUT. "Late" sat immediately below the
           receivables table and above the payables blocks, so reading downwards it attached to the
           table it followed and read as *who is late paying you* — while its body says "Something
           you owe". The same confusion has already bitten this block once: the sentence used to
           interpolate the age of a receivable under a `when:` gated on payables. The figure was
           fixed and the heading was the other half of it. */
        heading: 'Late to pay',
        span: 5,
        /* THE SENTENCE IS ABOUT THE RECORD, not about one studio's counterparty. It named a
           contract the reader has never signed, in the danger colour, on every Money page in every
           record — and when nothing was overdue it degraded to a raw internal path beside that
           claim, because the figure it referred to was empty. */
        /* THE INTERPOLATION CARRIES ITS OWN "ago", so the sentence is written around it rather than into
           it: "Something is 5w ago past its terms" is not English, and it was on the page. */
        /* AND IT QUOTES THE AGE OF THE SET THAT MADE IT APPEAR. It read
           `{{ago:obligations.oldest_overdue}}`, which resolves over money owed TO you, while the
           `when:` below gates on `overdue` — money owed BY you. So the alarm fired because two
           payables were late and then printed the age of a receivable: 5w on screen for a record
           whose oldest overdue payable is nine weeks old. The gate and the figure have to describe
           one set, and the path is named for which one. */
        body: 'Something you owe went past its terms {{ago:obligations.oldest_unpaid}}. Statutory interest may be due; the terms are in the contract.',
        /* AND IT DRAWS ONLY WHEN IT IS TRUE. `when:` was documented and not implemented, so this
           was `drawn: true` — an alarm that is always on, which is an alarm nobody reads. */
        when: { metric: 'overdue', gt: 0 },
      },
      {
        kind: 'bar',
        heading: 'Owed by you, by counterparty',
        span: 7,
        columns: [{ field: 'party' }, { field: 'amount' }],
        source: 'register.obligations',
        /* THE SAME PREDICATE AS "Who you owe" DIRECTLY BELOW IT. This said `state is open` and that
           one says `state is open or part`, so two panels about the same thing, one above the other,
           were about different sets — 63,084 and 82,434. Neither prints a total, so nothing on screen
           was wrong and the two disagreed anyway, which is the shape of a number somebody quotes from
           the wrong panel. A part-paid obligation is money still owed. */
        where: 'direction is owed by me, state is open or part',
        /* ONE FACT, ONE SENTENCE. This block and "Who you owe" below it share a predicate — the
           comment above says so — and said the same nothing two ways: "You owe nobody anything."
           stacked directly over "Nothing outstanding.", with the identical filter printed verbatim
           under both. On a record in its first week that is the first thing on the money page.
           `19 §6` Partial is right that an empty block stays; it does not ask for the same nothing
           said twice. The one below keeps the sentence, because it is the one holding the rows. */
        empty: 'Nothing to break down.',
      },
      {
        kind: 'table',
        heading: 'Who you owe',
        span: 12,
        source: 'register.obligations',
        where: 'direction is owed by me, state is open or part',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)', link: true },
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
          { field: 'name', label: 'Name', width: 'minmax(16ch,1fr)', link: true },
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
  /**
   * A PROJECT PAGE: every block filtered to one thing.
   *
   * This is the shape the whole widget idea was really asking for, and it needs no new machinery —
   * it is an ordinary `page` row whose blocks all carry `where: thing is Kiln`. Open the project and
   * the page is about the project: what is open on it, who is working on it right now, what it is
   * owed, what it costs to keep alive.
   *
   * The AGENTS block is the interesting one. "A Claude Code widget I can code into" cannot be a
   * block that runs code — 04 §7 has no interpreter to reach and 22 §3 names and rejects the three
   * ways people try. It does not need to be. An agent run is a typed row in the kernel's `session`
   * register (02 §1), so the widget is an
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
    requires: ['register.tasks', 'register.session', 'register.obligations', 'register.services'],
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
        /* CARDS, because an agent working on the project is a face and a sentence, not a row in a log.
           Same span as the timeline it replaces: the page pairs its blocks 8 with 4 and 7 with 5. */
        kind: 'cards',
        heading: 'Agents',
        span: 7,
        columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
        source: 'register.session',
        /* BY `project`, WHICH HOLDS THE PROJECT'S SPOKEN ID, `things#1`. `{{spoken}}` is that id for the
           row the template is about. The web's engine fills it; the kernel's `fill` in `pages.ts` does
           not yet, and until it does this block draws nothing on a real record
           (`pages-read.test.ts` holds it as a todo). */
        where: 'project is {{spoken}}',
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
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)', link: true },
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
        /**
         * A `code` block is authored rather than projected: `body` is the whole of it, verbatim. It
         * is on a project page because the question "how do I point an agent at this one" is asked
         * once per project and answered nowhere else.
         *
         * ONLY THE FIRST LINE WAS TEMPLATED, AND THE OTHER TWO INSTRUCTED SOMEBODY TO DAMAGE ROWS
         * THAT ARE NOT THIS PAGE'S. `{{name}}` resolves per page; `tasks#7` and `track 1` did not,
         * so Kiln, Marlow & Co and Portage all printed the same two literals — and `tasks#7` is
         * "Retire the Tallow staging box", a TALLOW task, while `track 1` is "Variable axis QA", a
         * KILN track. A person on their client's page, running the block their own record handed
         * them, would set a third project's task to `doing` and overwrite a fourth's health with a
         * sentence about neither.
         *
         * WHAT IS LEFT IS THE LINE THAT IS TRUE ON EVERY PAGE, and it is a read. The two writes
         * were demonstrating a verb at the cost of being wrong, and a demonstration that is wrong
         * is not a demonstration. A second line naming a row this page can resolve would need the
         * projection a `code` block deliberately does not have.
         */
        kind: 'code',
        heading: 'Work on this from an agent',
        span: 12,
        body: 'braindog.list tasks where thing is {{name}} and state is open',
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
        /* `By status`, for the same reason as the column two blocks down: the field this groups on
           is headed Status everywhere it is drawn. */
        heading: 'By status',
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
          { field: 'what', label: 'Description', width: 'minmax(20ch,1fr)', link: true },
          /* `Project` AND `Status`, AND THEY WERE `Thing` AND `State`. Every one of the five
             registers that carries a `thing` ref labels it Project and `things` labels its own
             lane Status, and this table — authored by hand rather than derived, so no rename
             reaches it — was the last place in the record saying either of the old words. A
             column header a person reads beside four others that say something else is the same
             defect as two names for one screen, one row further down. */
          { field: 'thing', label: 'Project', width: 'minmax(10ch,16ch)' },
          { field: 'state', label: 'Status', width: '12ch' },
          { field: 'by', label: 'Due', width: '15ch', align: 'end' },
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
        /* CARDS, with a face for each person, as the old tool draws people: a table of four columns read
           as a directory. Each card still opens the person's row. Where they were met and in which
           projects, because most people here arrive from an agent's commit rather than by hand, and
           the newest first, because the person met yesterday is the one somebody is asking about. */
        kind: 'cards',
        heading: 'Everyone',
        source: 'register.people',
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'met', label: 'Met', as: 'fact' },
          { field: 'projects', label: 'Met in', as: 'fact' },
          { field: 'role', label: 'Role', as: 'fact' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        empty: 'Nobody yet.',
      },
    ],
  },
};

/* ── installing it ────────────────────────────────────────────────────────── */

/**
 * The seed's registers as kernel declarations. Agent runs are not among them: the kernel declares those.
 *
 * A pass-through, and that is the point: the shape above IS the declaration, so this is a cast plus
 * the two words the kernel needs to file it — not a translation with a chance to be wrong.
 */
export const declarations = (): Declaration[] =>
  Object.values(REGISTERS).map((body) => ({ id: `register.${body.id}`, kind: 'register' as const, body: withTags(body) as never }));

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

/** The project template with the agents pack's "Runs on" after its own blocks, for a record holding that pack. */
export const projectWithRunsOn = (): SeedPage => ({
  ...PAGES.project!,
  requires: [...((PAGES.project!.requires as string[] | undefined) ?? []), ...RUNS_ON.requires],
  blocks: [...((PAGES.project!.blocks as unknown[] | undefined) ?? []), ...RUNS_ON.blocks],
});

export const metricDeclarations = (): Declaration[] =>
  Object.values(METRICS).map((body) => ({ id: `metric.${body.metric}`, kind: 'metric' as const, body: body as never }));

/** Which fields of which register are refs, or lists of them, and to what. Read from the declarations, never listed. */
const refsOf = (register: string): Map<string, string> =>
  new Map(
    ((REGISTERS[register] ?? AGENTS_REGISTERS[register])?.fields ?? [])
      .filter((f) => (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && typeof f.to === 'string')
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
    out[key] =
      to === undefined
        ? value
        : typeof value === 'number'
          ? `${to}#${value}`
          : Array.isArray(value)
            ? value.map((item) => (typeof item === 'number' ? `${to}#${item}` : item))
            : value;
  }
  return out;
}

/**
 * The seed's declarations as a PACK DOCUMENT.
 *
 * THE ONLY CONTENT THIS PRODUCT SHIPS, run through the format it asks everybody else to use. A pack
 * format that works on the fixtures in its own tests and falls over on a register with transitions,
 * a metric with a product and a page with a template is a format nobody finds out about until
 * somebody else writes one — so the differential test is against this, not against a toy.
 *
 * ITS SEEDS ARE ONE ROW EACH, and the demo dataset is not in it. A pack's `seeds:` are examples —
 * one per register, tagged so they can be told from real rows and deleted. Forty cross-linked rows
 * are a demonstration, which is `installSeed`'s job and a different thing.
 */
export function packDocument(): Record<string, unknown> {
  return {
    pack: 'braindog-starter',
    version: '1.0.0',
    summary: 'What a small studio owes, is owed, runs on and is working on.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    /* THE KIND IS THE FIRST KEY. A register stores its name as `id` and a document writes it as
       `register:`, which is the one difference between the two forms of the same declaration. */
    declarations: [
      ...Object.values(REGISTERS).map((body) => {
        const { id, ...rest } = withTags(body) as { id: string } & Record<string, unknown>;
        return { register: id, ...rest };
      }),
      ...Object.values(PAGES),
      ...Object.values(METRICS),
    ],
    /* A REGISTER WHOSE REQUIRED FIELD IS A REF CANNOT BE SEEDED BY A PACK. A pack's seeds are one
       row per register with no order between them, so a `ref` in one would resolve against whatever
       happened to be written first — a different row on a different day. `updates` needs a `track`,
       so it arrives empty and the demonstration is what fills it. */
    /* ONLY WHAT THE PACK DECLARES. Agent runs are the kernel's register, and a run's `last_seen` and
       `project` are fields no seed row may set, so an example run would stop the install halfway. */
    seeds: ORDER.filter((register) => register in REGISTERS && (ROWS[register] ?? []).length > 0 && !needsARef(register)).map((register) => ({
      register,
      fields: forWrite(register, exampleRow(register)),
    })),
  };
}

/**
 * One row of a register, with every ref taken out.
 *
 * A SEED CANNOT POINT AT A ROW THAT DOES NOT EXIST, and a pack's seeds are one row per register
 * with no order between them — so a `ref` in one would resolve against whatever happened to be
 * written first, which is a different row on a different day.
 */
/** Whether a register cannot be filled without pointing at another row. */
const needsARef = (register: string): boolean =>
  (REGISTERS[register]?.fields ?? []).some((f) => f.type === 'ref' && f.required === true);

const exampleRow = (register: string): Fields => {
  const refs = new Set((REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'ref').map((f) => f.id));
  const first = (ROWS[register] ?? [])[0] ?? {};
  return Object.fromEntries(Object.entries(first).filter(([key]) => !refs.has(key)));
};

export type Seeded = { registers: number; rows: number; pages: number; metrics: number; suggestions: number; decisions: number };

/**
 * Install the declarations, then write every row.
 *
 * THE ORDER IS THE REFERENCES. `things` and `people` are written before the rows that point at
 * them, because a `ref` is resolved at write and a row cannot point at one that does not exist
 * yet — which is a property of the record and not a quirk of this file.
 *
 * `session` is the kernel's register, which the seed writes into and does not declare.
 */
export const ORDER = ['things', 'people', 'tracks', 'obligations', 'services', 'tasks', 'session', 'updates'] as const;

/**
 * Writes one agent run: THE ONE PLACE THE SEED SETS A FIELD ONLY THE RECORD WRITES.
 *
 * `last_seen`, `project` and `token_id` are refused `IMMUTABLE_FIELD` to every caller that names them in
 * a patch, a person included, and that refusal stays whole. They go through the kernel's `stamp`, the
 * in-process channel its own callers use for exactly these fields: the ladder, and the record's
 * `attach`. No route can reach it, because a request's context carries no `stamp`. The ladder itself
 * cannot write these rows. It stamps the record's clock, which the seed fixes at `NOW`, so every run
 * would read "just now", and it would place each run by where the seed says it worked rather than by
 * the project the row names.
 */
function openRun(kernel: Kernel, fields: Fields, actor: string): Result<unknown> {
  const patch: Record<string, unknown> = {};
  const stamp: Record<string, Json> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (KERNEL_WRITTEN.includes(key)) stamp[key] = value as Json;
    else patch[key] = value;
  }
  return kernel.create('session', patch as never, { actor, stamp });
}

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
          /* `IMPORT_NOT_EMPTY`, WHICH IS IN THE REGISTRY, AND `RECORD_NOT_EMPTY` IS NOT. This was
             one of six codes `refusals.mjs` counts as drift and holds as a budget that may only go
             down, and it was recorded as blocked on nothing in particular. It is not: the kernel's
             own importer already emits `IMPORT_NOT_EMPTY` for the identical fact at
             `dogl.ts:613`, both map to 422, and nothing in this repository asserts on the old
             spelling. Two codes for one sentence, one of them unpublished. */
          code: 'IMPORT_NOT_EMPTY',
          fix: `This record already holds ${kernel.count(register)} rows in ${register}. The seed opens an empty record.`,
          at: register,
        },
      };

  /* THE PROJECT TEMPLATE WAITS FOR THE AGENTS PACK, because its "Runs on" blocks read the pack's
     registers, and a page requiring a register the record does not hold yet is refused. */
  const installed = await kernel.install([...declarations(), ...pageDeclarations().filter((d) => d.id !== 'page.project'), ...metricDeclarations()]);
  if (!installed.ok) return installed as Result<Seeded>;
  const agents = await installAgentsPack(kernel, actor);
  if (!agents.ok) return agents as unknown as Result<Seeded>;
  const project = await kernel.install([{ id: 'page.project', kind: 'page', body: projectWithRunsOn() as never }]);
  if (!project.ok) return project as Result<Seeded>;

  let rows = 0;
  for (const register of [...ORDER, ...AGENTS_ORDER])
    for (const entry of ROWS[register] ?? []) {
      const out = register === 'session' ? openRun(kernel, entry, actor) : kernel.create(register, forWrite(register, entry), { actor });
      if (!out.ok) return out as unknown as Result<Seeded>;
      rows++;
    }

  /* THE QUESTIONS GO IN LAST, because SG30's rowset names rows of `things` at the version they were
     written at, and a proposal is checked against the rows it names when it is filed. */
  let suggestions = 0;
  let decisions = 0;
  for (const q of governanceSeed(kernel)) {
    const opened = kernel.propose({ question: q.question, body_kind: q.body_kind, body: q.body }, actor);
    if (!opened.ok) return opened as unknown as Result<Seeded>;
    suggestions++;
    if (q.decided === undefined) continue;
    const decided = kernel.decide(opened.value.id, { decide: q.decided }, actor);
    if (!decided.ok) return decided as unknown as Result<Seeded>;
    decisions++;
  }

  return {
    ok: true,
    value: {
      registers: Object.keys(REGISTERS).length + Object.keys(AGENTS_REGISTERS).length,
      rows,
      pages: Object.keys(PAGES).length,
      metrics: Object.keys(METRICS).length,
      suggestions,
      decisions,
    },
  };
}

/** One question the sample's `/decide` shows, as `propose` files it, and its answer if it has one. */
export type SeedQuestion = {
  /** The id the in-browser sample gives it. The record issues its own, in the order they are filed. */
  sample: string;
  question: string;
  body_kind: 'options' | 'rowset';
  body: Record<string, unknown>;
  decided?: { option: string; reason: string };
};

const option = (id: string, label: string, because: string, recommended = false) => ({
  id,
  label,
  because,
  ...(recommended ? { recommended: true } : {}),
});

/**
 * The sample's governance rows: its open questions and the decisions it shows, with the same
 * questions, options, recommended option and reasons as `apps/web/src/lib/record/data.ts`.
 *
 * THE IDS ARE THE RECORD'S, NOT THE SAMPLE'S. `suggestion` and `decision` are counters that start at
 * 1 and move only when `propose` and `decide` allocate from them, so SG27 or D41 could only be
 * reached by filing twenty-six questions and forty decisions the sample never shows. They are filed
 * in the order of the sample's ids instead, with D41's question first because it is the oldest:
 * SG1 (D1), SG2, SG3, SG4, SG5, SG6 (D2), SG7.
 */
export function governanceSeed(kernel: Pick<Kernel, 'get'>): SeedQuestion[] {
  const thing = (name: string) => {
    const seq = (ROWS.things ?? []).findIndex((r) => r.name === name) + 1;
    return seq > 0 ? kernel.get(`things#${seq}`) : null;
  };
  const kiln = thing('Kiln');
  const portage = thing('Portage');
  const note = typeof kiln?.fields.note === 'string' ? kiln.fields.note : '';

  return [
    {
      sample: 'D41',
      question: 'Which registrar holds the Kiln names?',
      body_kind: 'options',
      body: {
        options: [
          option('nordhaven', 'Nordhaven Registry', 'Two-factor by default, and registry lock on the apex.'),
          option('cove', 'Cove Domains', 'Cheaper by about a third, no registry lock.'),
        ],
      },
      decided: {
        option: 'nordhaven',
        reason: 'Registry lock is the only control that survives a compromised account, and the names are the business.',
      },
    },
    {
      sample: 'SG27',
      question: 'Does Tallow get retired, or parked for another year?',
      body_kind: 'options',
      body: {
        options: [
          option('retire', 'Retire it', 'Let the domain lapse, archive the repository, and take the row off every screen. Irreversible after the drop date.'),
          option('park', 'Park it another year', 'Keep the name. The only cost is the renewal and the attention.'),
        ],
      },
    },
    {
      sample: 'SG29',
      question: 'Does Portage keep sending from portagemail.example, or move to the apex?',
      body_kind: 'options',
      body: {
        options: [
          option('stay', 'Keep the subdomain', 'Reputation stays where it is. The apex is free for a marketing site that does not exist yet.', true),
          option('apex', 'Move to the apex', 'One domain to renew instead of two, and the from-address matches the site. Costs six weeks of warm-up now rather than later.'),
        ],
      },
    },
    {
      sample: 'SG30',
      question: 'Update Kiln’s note and move Portage to earning?',
      body_kind: 'rowset',
      body: {
        register: 'things',
        rows: [
          ...(kiln
            ? [{ at: `things#${kiln.seq}`, version: kiln.version, patch: { note: note.split('licensed direct.').join('licensed direct and through two resellers.') } }]
            : []),
          ...(portage ? [{ at: `things#${portage.seq}`, version: portage.version, patch: { lane: 'earning' } }] : []),
        ],
      },
    },
    {
      sample: 'SG31',
      question: 'Does Kiln licence per-seat, per-product, or one flat studio price?',
      body_kind: 'options',
      body: {
        options: [
          option('seat', 'Per seat', 'A price per designer, per year. Predictable for you, and the number every buyer already understands. Enforcement is honour-system, which is what everyone else in type does.'),
          option('product', 'Per product', 'A price per shipped thing. Matches how the fonts are actually used and does not punish a large studio for having a large studio. Harder to quote in one line.', true),
          option('flat', 'One studio price', 'One number, unlimited use, no counting. The simplest sentence on the page and the hardest to raise later.'),
        ],
      },
    },
    {
      sample: 'SG33',
      question: 'Add the two services on the Fenwick invoice?',
      body_kind: 'options',
      body: {
        options: [
          option('accept', 'Add both', 'Object storage and the Workers plan, with the renewal dates from the invoice.', true),
          option('ignore', 'Leave them out', 'The invoice stays in the inbox and the services stay unrecorded.'),
        ],
      },
      decided: {
        option: 'accept',
        reason: 'Both are live and both renew; an invoice line nobody has a row for is the thing this record exists to stop.',
      },
    },
    {
      sample: 'SG34',
      question: `The backup on ${day(0)} did not run`,
      body_kind: 'options',
      body: {
        options: [
          option('run', 'Run it now', 'Take a backup immediately. It counts against the thirty like any other night.', true),
          option('ignore', 'Ignore it', 'Tonight’s run will try again. If the reason has not gone away it will fail again, and ask again.'),
        ],
      },
    },
  ];
}

/**
 * The agents pack's registers, in the order their rows are written: a skill cites learnings.
 *
 * NOT IN `ORDER`, which is the seed's own registers: the web's sample engine is compared against
 * the record register by register over that list, and it declares none of the pack's.
 */
export const AGENTS_ORDER = ['learnings', 'skills', 'credentials', 'tools'] as const;

/**
 * Install the agents pack THROUGH THE PACK PATH: normalised, planned and installed as any pack is,
 * so the record holds a `pack` row for it and uninstalling it keeps its rows.
 *
 * The manifest's registers are checked first, because the document format names only packs it
 * depends on. The refusal is the kernel's for a page whose register never arrived.
 */
export async function installAgentsPack(kernel: Kernel, actor = 'p_seed'): Promise<Result<Applied>> {
  for (const want of AGENTS_PACK.manifest.requires)
    if (!kernel.register(want.replace(/^register\./, '')))
      return {
        ok: false,
        refusal: {
          code: 'DEPENDENCY_UNRESOLVED',
          fix: `${AGENTS_PACK.manifest.id} requires ${want}, and it is not installed. Install the pack that declares it first.`,
          at: 'requires',
        },
      };

  const pack = await normalise(agentsPackDocument(), { kind: 'local' });
  if (!pack.ok) return pack;
  const state: Installed = {
    format: 1,
    primitives: 1,
    record_version: kernel.version(),
    packs: kernel.packs(),
    declarations: kernel.declarations() as Installed['declarations'],
    rows: kernel.census(),
  };
  const diff = await plan(pack.value, state);
  return install(pack.value, diff, {
    count: (register) => kernel.count(register),
    stage: (batch) => kernel.stageInstall(batch as never),
    transaction: (fn) => kernel.transaction(fn),
    reload: () => kernel.reload(),
    retire: (ids) => kernel.retire(ids),
    seed: (register, fields) => kernel.create(register, { ...fields, tags: ['example'] }, { actor, cascade: false } as never) as never,
    remember: (row) => kernel.rememberPack(row),
    forget: (id) => kernel.forgetPack(id),
    claimed: (id) => kernel.packClaims(id),
  }, diff.planHash);
}
