/**
 * The record this app shows, as the app needs it.
 *
 * THE REGISTERS AND THE ROWS ARE NOT HERE ANY MORE. They are `@braindog/seed`, which the kernel
 * installs and writes through the real write path — so the figures below are assertions about a
 * record that exists rather than sums over a literal. What stays here is everything the interface
 * has and the record does not yet: the declared pages, the open questions, the inbox, the vault
 * index, the packs, the news, the audit trail and the job.
 *
 * THE ROWS ARRIVE AS THE RECORD HOLDS THEM. Money is `{ amount, currency }` and a duration is
 * integer seconds, both the way the write path stores them — so what this file hands the app is the
 * shape the client will hand it later, and swapping one for the other changes no reader.
 */

import { PAGES as SEED_PAGES, ROWS as SEED_ROWS, REGISTERS as SEED_REGISTERS, day, stamp } from '@braindog/seed';

import type {
  AuditEvent,
  Credential,
  Entry,
  Fields,
  Filter,
  InboxItem,
  Job,
  NewsItem,
  PackInfo,
  Device,
  PageDecl,
  Passkey,
  Person,
  Snapshot,
  Source,
  Question,
  RegisterDecl,
} from './schema.ts';

export { LOOKUPS, NOW, TODAY } from '@braindog/seed';

/** The pages the record ships with. They live in the seed, because a page is a document it holds. */
export const PAGES = SEED_PAGES as unknown as Record<string, PageDecl>;
import { NOW } from '@braindog/seed';
import type { Counted } from '@braindog/kernel';

/** The eight registers, as this app types them. The seed's shape is a superset of this one. */
export const REGISTERS = SEED_REGISTERS as unknown as Record<string, RegisterDecl>;

/**
 * The seed's rows, given the numbers, versions and authors a record would have given them.
 *
 * `seq` IS THE POSITION, because that is what the record does: rows are numbered as they arrive,
 * and the seed writes them in order. Everything in this file that says `party: 1` is saying
 * `people#1`, and it still is.
 *
 * The values themselves are untouched — an `undefined` is dropped, which is what a write path does
 * with an absent field, and nothing else is converted.
 */
function entriesOf(register: string): Entry[] {
  return (SEED_ROWS[register] ?? []).map((raw, i) => {
    const seq = i + 1;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) if (value !== undefined) fields[key] = value;
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
  { id: 'in_8f21', arrived: stamp(-3), from: 'billing@fenwick.example', subject: 'Your September invoice is ready', body: 'Account 44192. Total GBP 58.00, charged 24 September to the card ending 4417.', suggestion: 'When something arrives from Fenwick Cloud, set the renewal date on the matching service.' },
  { id: 'in_8f19', arrived: stamp(-9), from: 'ap@halden.example', subject: 'RE: Invoice 2026-041', body: 'Apologies for the delay. This is with our finance team and should clear in the next payment run on the 12th.' },
  { id: 'in_8f14', arrived: stamp(-26), from: 'noreply@nordhaven.example', subject: 'Renewal reminder: kilnfonts.example', body: 'kilnfonts.example expires on 30 August 2026. Auto-renew is OFF for this name.', suggestion: 'Take the renewal date from the subject line of arrivals like this one.' },
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
  { id: 'agents', name: 'Agents', blurb: 'Learnings, skills, credentials — what each tool is for, and what it opens.', version: '0.9.2', installed: false, registers: ['learnings', 'skills', 'credentials'], pages: ['agents'], author: 'braindog', titles: { learnings: 'Learnings', skills: 'Skills', credentials: 'Credentials', agents: 'Agents' } },
  /* IT WANTS TO SIT ABOVE YOUR MONEY PAGE, AND IT DOES NOT GET TO. `04 §4`'s worked example is this
     pack, and the record had no way to hold the fact — so the diff's `CHANGES` section was behind a
     condition that could never be true and the three sentences about it rendered nowhere. A trust
     screen that structurally cannot show the refusal it makes is a trust screen with a hole. */
  { id: 'freelancer-uk', name: 'Freelancer UK', blurb: 'Invoices with VAT, statutory interest, and the payment terms clause.', version: '2.0.1', installed: false, registers: ['invoices', 'clients'], pages: ['invoicing'], author: 'k.marsh', titles: { invoices: 'Invoices', clients: 'Clients', invoicing: 'Invoicing' }, stars: 214, moves: [{ page: 'money', from: 10, to: 12 }] },
  /* AND THIS ONE COLLIDES. `services` is the Estate pack's, and two packs owning one name is the
     failure `02 §1` builds the whole additive story on — so it is a CONFLICT rather than a change,
     and the install is refused rather than merged. */
  { id: 'type-foundry', name: 'Type foundry', blurb: 'Licences, cuts, and who is allowed to use what.', version: '0.4.0', installed: false, registers: ['licences', 'cuts', 'services'], pages: ['licensing'], author: 'a.brandt', titles: { licences: 'Licences', cuts: 'Cuts', licensing: 'Licensing' }, stars: 37, conflicts: ['services'] },
];

/* ── what happened while you were away ───────────────────────────────────
   The read mark advances when the person LEAVES the screen, never when it opens: the predecessor
   shipped the other way round and found that For You had never once drawn its second half, because
   the screen advanced the mark on open and then asked for everything since it (19 §6). */

export const NEWS: NewsItem[] = [
  /* TWO, WHICH IS WHAT THE AUDIT RECORDS. This said four, and `/audit` holds `entry.create` for
     `services#6` and `services#7` and no others — so the one screen a person checks a claim against
     contradicted the claim, on the surface whose whole job is telling you what happened while you
     were not looking. The audit is the source: everything else quotes it. */
  { at: stamp(-3), by: 'claude', text: 'Added 2 services from the Fenwick invoice', href: '/r/services', tone: 'info' },
  { at: stamp(-9), by: 'rule.reply', text: 'Halden replied on 2026-041 — payment run on the 12th', href: '/r/obligations/1', tone: 'good' },
  { at: stamp(-14), by: 'you', text: 'Marked Kerning pass, lowercase done', href: '/r/tasks/12' },
  { at: stamp(-26), by: 'rule.renewal', text: 'kilnfonts.example moved to lapsing — auto-renew is off', href: '/r/services/2', tone: 'bad' },
  { at: stamp(-31), by: 'codex', text: 'Opened SG31 — the Kiln licensing question', href: '/decide/SG31', tone: 'warn' },
  { at: stamp(-49), by: 'claude', text: 'Set the year-end date on Pell & Vine', href: '/r/people/4' },
];

/**
 * Saved views: a register, a predicate, and the name a person gave the pair.
 *
 * OUT OF THE ROUTE AND INTO THE RECORD, because the route was the only thing that knew they
 * existed — and nothing in the app produced a `/v/<key>` address, so 356 lines and eight copy
 * keys sat behind a door with no handle. A view is a named list; the palette is where named
 * things are found; the two could not meet while this lived inside the screen that draws one.
 *
 * THE SENTENCE IS DERIVED, NOT TYPED. It used to be a `says:` string beside the filters, and the
 * two disagreed: Overdue printed "state is open or part, and due is before today" above a list
 * that only filtered on state, so 28 rows were drawn under the word Overdue and 24 of them were
 * not overdue. A printed predicate that is not the predicate is worse than none, because it is
 * checkable and wrong.
 */
export const VIEWS: Record<string, { register: string; name: string; filters: Filter[] }> = {
  'obligations.overdue': {
    register: 'obligations',
    /* EVERYTHING LATE, IN BOTH DIRECTIONS — which is what its predicate says and what the name has to
       say too. The money tile called "Overdue" is `direction is owed by me` alone, and one word over
       two different sets, two clicks apart, is how somebody quotes the wrong figure. */
    name: 'Overdue, both ways',
    filters: [
      { field: 'state', op: 'in', values: ['open', 'part'] },
      { field: 'due', op: 'before', values: ['today'] },
    ],
  },
  'services.lapsing': {
    register: 'services',
    name: 'Lapsing',
    filters: [{ field: 'state', op: 'in', values: ['lapsing'] }],
  },
};

/* ── what the record has noticed about itself ──────────────────── */

/**
 * The observations a record of this age would actually be holding.
 *
 * NINE SIGNALS, PRE-AGGREGATED BY DAY, and these are the two the interface can do something with:
 * a write the register kept refusing, and a search that kept finding nothing. Both carry a subject
 * that IS a place on screen, which is the whole reason they are the two worth surfacing first.
 *
 * The thresholds are NOT here. They are `findingsFrom` in the kernel, applied in one place, because
 * a screen that says a pattern has been reached and an analyser that never proposes anything read
 * as the product being wrong about itself.
 */
export const OBSERVED: Counted[] = [
  /* Twelve refusals across four days: somebody keeps writing a direction the field does not
     declare, and the record has been refusing them without anybody drawing the conclusion. */
  { signal: 'write.refused', subject: 'obligations.direction:ENUM_VALUE_UNKNOWN', total: 12, days: 4 },
  /* Under the count on purpose — nine over three days is a bad fortnight, not a pattern. It is here
     so the screen can be seen NOT drawing something, which is the harder half to check. */
  { signal: 'write.refused', subject: 'tasks.by:REQUIRED_MISSING', total: 9, days: 3 },
  { signal: 'search.empty', subject: 'retainer', total: 6, days: 4 },
];

/**
 * Why the analyser is not proposing anything, if it is not.
 *
 * IT IS THE GOVERNORS' ANSWER, NOT A SECOND OPINION. `analyse()` returns `suspended` — a record too
 * new, three questions already open, a proposal already drafted this week, a class the owner has
 * called wrong three times, or the brake — and a screen that announced a crossed threshold while
 * that sentence was non-null would be promising a proposal the record has already decided not to
 * make. `null` here is a record whose loop is running, which is what this fixture is.
 */
export const SUSPENDED: string | null = null;

/* ── the audit log ───────────────────────────────────────────────────────── */

export const AUDIT: AuditEvent[] = [
  { seq: 4192, at: stamp(-3), by: 'claude', kind: 'entry.create', target: 'services#6', note: 'Object storage, from the Fenwick invoice', version: 4192 },
  { seq: 4191, at: stamp(-3), by: 'claude', kind: 'entry.create', target: 'services#7', note: 'Workers plan, from the Fenwick invoice', version: 4191 },
  { seq: 4188, at: stamp(-9), by: 'rule.reply', kind: 'entry.update', target: 'obligations#1', note: 'added a note: “Chased twice. 45-day terms expired 3 August.”', version: 4188 },
  { seq: 4181, at: stamp(-14), by: 'you', kind: 'entry.update', target: 'tasks#12', note: 'state from open to done', version: 4181 },
  { seq: 4174, at: stamp(-26), by: 'rule.renewal', kind: 'entry.update', target: 'services#2', note: 'state from live to lapsing', version: 4174 },
  { seq: 4160, at: stamp(-31), by: 'codex', kind: 'question.open', target: 'SG31', note: 'Kiln licensing model', version: 4160 },
  { seq: 4102, at: stamp(-49), by: 'claude', kind: 'entry.update', target: 'people#4', note: 'added a note: “Year end is 31 March”', version: 4102 },
  { seq: 4061, at: stamp(-96), by: 'you', kind: 'declaration.set', target: 'page.money', note: 'Added the Overdue stat cell', version: 4061 },
];

/**
 * THE AUDIT IS THE SOURCE, and every other surface quotes it.
 *
 * Rows get a mechanical `created` and `by` — every one "by you", spaced 37 hours apart — because a
 * fixture has to say something. Then the audit says claude created `services#6` three days ago, and
 * the row's own detail said "Added 9d ago by you". Two screens, one event, two stories, on the pair
 * whose whole job is that a row's history is checkable.
 *
 * SO THE AUDIT WINS, and the rows are moved to agree with it. A record whose provenance disagrees
 * with its own ledger has no provenance — the ledger is what makes "who put this here" answerable at
 * all, and 20 §8 is the reason there is one.
 */
for (const event of AUDIT) {
  if (event.kind !== 'entry.create') continue;
  const [register, seq] = event.target.split('#');
  const row = (ROWS[register ?? ''] ?? []).find((e) => e.seq === Number(seq));
  if (row) {
    row.created = event.at;
    row.by = event.by;
  }
}

/* ── a tier-C run ────────────────────────────────────────────────────────── */

/**
 * The runs behind the live sessions, by id.
 *
 * KEYED, BECAUSE THE ROUTE IS `/jobs/[id]` AND IT USED TO IGNORE ITS OWN PARAMETER — `/jobs/9` and
 * `/jobs/anything` were the same screen, showing the same single fixture, under a header printing
 * that fixture's id. A route whose segment means nothing is a route that will be linked wrongly the
 * first time somebody links it.
 */
export const JOBS: Record<string, Job> = {
  j_9K4A: {
    id: 'j_9K4A',
    kind: 'qa',
    status: 'running',
    model: 'your machine · claude-opus-5',
    started: stamp(-0.05),
    events: [
      { seq: 1, tool: 'list', input: 'things where state is live', out: '4 rows', ok: true },
      { seq: 2, tool: 'read', input: 'tracks#1', out: 'Variable axis QA — nine instances', ok: true },
      { seq: 3, tool: 'search', input: 'mastering pass', out: '2 rows across 1 register', ok: true },
    ],
  },
};

/**
 * A row count a reader can reproduce.
 *
 * THE RUN LOG QUOTED `31 rows` FOR `obligations where state is open`, and the register holds 22 —
 * not open, not open+part, not not-paid. A number nobody can get back to is the one thing a record
 * about being checkable must not print, and a job's log is where somebody goes to find out what an
 * agent actually did.
 *
 * DERIVED, so it cannot drift again: a row added to the fixture moves the log with it.
 */
const counted = (register: string, keep: (e: Entry) => boolean): string => {
  const n = (ROWS[register] ?? []).filter(keep).length;
  return `${n} row${n === 1 ? '' : 's'}`;
};

/** The one the reconcile session is running. Named, because two screens quote it by name. */
export const JOB: Job = {
  id: 'j_7Q2F',
  kind: 'reconcile',
  status: 'running',
  model: 'your machine · claude-opus-5',
  started: stamp(-0.2),
  events: [
    { seq: 1, tool: 'list', input: 'obligations where state is open', out: counted('obligations', (e) => e.fields.state === 'open'), ok: true },
    {
      seq: 2,
      tool: 'list',
      input: 'services where renews before 2026-10-03',
      out: counted('services', (e) => String(e.fields.renews ?? '') < '2026-10-03'),
      ok: true,
    },
    { seq: 3, tool: 'read', input: 'inbox since 2026-08-01', out: '18 arrivals, 6 unmatched', ok: true },
    { seq: 4, tool: 'search', input: 'Fenwick', out: '4 rows across 2 lists', ok: true },
    { seq: 5, tool: 'propose', input: 'merge services#6 and services#13 — same provider, same renewal', out: 'PROPOSAL_UNCITED — a proposal must attach the rows it read', ok: false },
    {
      seq: 6,
      tool: 'list',
      input: 'services where provider is Fenwick Cloud',
      out: counted('services', (e) => String(e.fields.provider ?? '').includes('Fenwick')),
      ok: true,
    },
  ],
};

JOBS[JOB.id] = JOB;

export const PEOPLE_ACCESS: Person[] = [
  { id: 'you', name: 'You', level: 'owner', email: 'you@thestudio.example', since: day(-612) },
  { id: 'sm', name: 'S. Marchetti', level: 'write', email: 's.marchetti@example.com', since: day(-181) },
  { id: 'pv', name: 'Pell & Vine', level: 'read', email: 'accounts@pellvine.example', since: day(-96) },
  /* AN INVITATION THAT HAS NOT BEEN ACCEPTED IS A DIFFERENT STATE FROM ACCESS, and the screen had
     no way to hold one — so somebody who had invited a bookkeeper could not tell whether the link
     had been used. `12 §3`: single-use, 24 hours, bound to one email. */
  { id: 'jo', name: 'J. Okonkwo', level: 'append', email: 'j@okonkwo.example', since: null },
];

/* ── the way back in ──────────────────────────────────────────────────────────── */

export const PASSKEYS: Passkey[] = [
  { id: 'pk_01', label: 'This laptop', added: day(-612), lastUsed: day(0) },
  { id: 'pk_02', label: 'Phone', added: day(-410), lastUsed: day(-3) },
];

/**
 * WHICH WAYS IN THIS DEPLOYMENT ACTUALLY HAS. `GET /auth/methods` (`49 §5.6`), and the reason it
 * exists: on a self-host with no SMTP the answer is `magic: false` "so the screen never offers it".
 * A recovery screen offering a link that cannot be sent is worse than one offering nothing.
 */
export const AUTH_METHODS = { passkey: true, magic: true } as const;

/* ── where this record runs ───────────────────────────────────────────────────── */

/**
 * SELF-HOST OR CLOUD, and three areas answer differently.
 *
 * `33 §9`: "A self-host has no PITR and does not serve `restore`", and `Snapshots.restore(id)`
 * throws there. `53 §5.10` puts the whole billing ladder "in the Worker and nothing in the record,
 * so the record package stays billing-agnostic" — which means a self-hosted record has nothing to
 * bill and no state to show.
 *
 * `03 §6` on exactly this case: "PITR is Cloud-only and this is documented, NOT HIDDEN." So the
 * areas stay and say which deployment they are on, rather than vanishing — `50 §2.2` admits all
 * twelve with no per-deployment conditional, and `ADR-024` found that hiding items to reduce
 * clutter made feature discovery worse.
 */
export const DEPLOYMENT = { kind: 'self-host' as const, since: day(-612) };

/* ── backups ───────────────────────────────────────────────────────────────── */

/** Four of the thirty kept. `53 §5.4`: nightly at 03:00 local on a self-host, thirty retained. */
export const SNAPSHOTS: Snapshot[] = [
  { id: '2026-09-07', at: day(0), bytes: 2_140_992, rows: 1_206 },
  { id: '2026-09-06', at: day(-1), bytes: 2_138_112, rows: 1_204 },
  { id: '2026-09-05', at: day(-2), bytes: 2_131_968, rows: 1_199 },
  { id: '2026-09-04', at: day(-3), bytes: 2_129_920, rows: 1_197 },
];

export const SNAPSHOTS_KEPT = 30;

/* ── ingest ────────────────────────────────────────────────────────────────── */

/**
 * `25 §9`'s three rows, in its own shape: one `ok`, one `failing`, one `paused` on a credential.
 *
 * The failure sentence is `47 §6`'s `PULL_AUTH_REJECTED` fix, verbatim, because `13 §6` says the
 * app renders the server's `fix` and does not write its own.
 */
export const SOURCES: Source[] = [
  { id: 'ledger-post', name: 'Ledger Post deliveries', state: 'ok', lastAt: day(0), nextAt: day(1), points: 7 },
  {
    id: 'kestrel',
    name: 'Kestrel error reports',
    state: 'failing',
    lastAt: day(0),
    nextAt: day(0),
    points: 0,
    error: { code: 'PULL_PROVIDER_UNAVAILABLE', fix: 'The provider answered 429 three times. It retries on its own.', credential: 'Kestrel ingest', at: day(0) },
  },
  {
    id: 'tallyard',
    name: 'Tallyard ledger export',
    state: 'paused',
    lastAt: day(-4),
    nextAt: null,
    points: 0,
    error: { code: 'PULL_AUTH_REJECTED', fix: 'Reconnect the credential — the provider rejected it; the connector is paused until you do.', credential: 'Tallyard bookkeeping', at: day(-4) },
  },
];

/* ── agents ────────────────────────────────────────────────────────────────── */

/** `12 §6.1`. The denied row is kept deliberately — see the type. */
export const DEVICES: Device[] = [
  { id: 'dg_01', name: 'Claude Code, this laptop', surface: 'mcp', state: 'active', at: day(-31), lastSeen: day(0) },
  { id: 'dg_02', name: 'braindog CLI, studio desktop', surface: 'cli', state: 'active', at: day(-88), lastSeen: day(-2) },
  { id: 'dg_03', name: 'Codex, unknown machine', surface: 'mcp', state: 'pending', at: day(0), lastSeen: null },
  { id: 'dg_04', name: 'Unrecognised request, Frankfurt', surface: 'mcp', state: 'denied', at: day(-6), lastSeen: null },
];
