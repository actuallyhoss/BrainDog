/**
 * The sample record, as tests read it: the seed's lists and rows numbered as a record numbers them, and the questions,
 * inbox, keychain, add-ons, news, audit trail and runs the sample's readers answer with.
 *
 * A TEST IMPORTS THIS AND NOTHING SHIPPED MAY. It was `lib/record/data.ts`, the mock the app was drawn against before a
 * record could answer, and it shipped for as long as a live screen read one of its tables.
 * `tools/gates/no-fixtures.mjs` refuses any file under `apps/web/src` outside a test that
 * imports this directory.
 *
 * IMPORTING IT FILLS NOTHING. Its `REGISTERS` and `PAGES` are its own tables; the helpers read `held.ts`'s, which only a
 * record fills in a shipped tab. A test that wants the helpers to answer about the sample imports `fill.ts` as well,
 * which copies these tables there.
 *
 * THE ROWS ARRIVE AS THE RECORD HOLDS THEM. Money is `{ amount, currency }` and a duration is integer seconds, both the
 * way the write path stores them, so a reader tested over these rows is tested over the shape the client hands it.
 */

import {
  AGENTS_PAGES,
  AGENTS_REGISTERS,
  PAGES as SEED_PAGES,
  ROWS as SEED_ROWS,
  REGISTERS as SEED_REGISTERS,
  METRICS as SEED_METRICS,
  RULES as SEED_RULES,
  HANDLED_FILING,
  MONEY_HOME_SETTING,
  targetConfigOf,
  day,
  PROJECTS_SAID,
  SAMPLE_ROWS,
  stamp,
} from '@braindog/seed';

/* THE SAME FUNCTION THE RECORD RANKS WITH. The sample is the product with the wires showing, so a
   queue ordered here by a number somebody typed would be a demonstration of a rule the product does
   not follow. */
import { costOf, costRank } from '@braindog/kernel';

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
  Token,
  PageDecl,
  Passkey,
  Person,
  Snapshot,
  Source,
  Question,
  RegisterDecl,
} from '../schema.ts';

export { NOW, TODAY } from '@braindog/seed';

/**
 * The sample's daily series, as a record's snapshots would hold them: ninety days of `cash-now`,
 * worked back from the paid rows (`@braindog/seed`'s `cashSeries`), and sixty of `open-tasks`, worked back from the days
 * tasks were finished (`openTasksSeries`).
 */
export const SERIES: Record<string, readonly { at: string; value: number }[]> = { 'cash-now': cashSeries(), 'open-tasks': openTasksSeries() };
import { cashSeries, openTasksSeries } from '@braindog/seed';

/**
 * The pages the record ships with. They live in the seed, because a page is a document it holds.
 *
 * THE AGENTS PACK'S PAGES ARE HERE BECAUSE ITS REGISTERS ARE: `/p/agents`, a page per skill, and the
 * project template already ends with "Runs on" (the seed's own `PAGES.project`), taken from the
 * seed as a record holding the pack installs them.
 */
export const PAGES: Record<string, PageDecl> = { ...SEED_PAGES, ...AGENTS_PAGES } as unknown as Record<string, PageDecl>;
import { NOW, TODAY } from '@braindog/seed';
import { sessionDeclaration, stampFinished, type Counted } from '@braindog/kernel';
/* `find.ts` reads the declarations `fill.ts` puts in `held.ts`; `answers` is only called when a receipt is counted, so
   the receipts count the way the record counts once a test has filled them. */
import { answers } from '../find.ts';

/**
 * The seed's registers, the agents pack's, and the kernel's `session`, as this app types them. The
 * seed's shape is a superset of this one.
 *
 * AGENT RUNS COME FROM THE KERNEL'S OWN DECLARATION, the body migration 0002 seats, because that is
 * what a real record's `boot` lists. A copy written here would be the second "Agent runs" again.
 *
 * THE SAMPLE'S OWN TABLE, NOT `held.ts`'S. Until the sample left the app this was `Object.assign` into the table every shipped reader
 * reads, so importing the fixture for any reason put the seed's declarations where a live tab keeps the record's, and a
 * list the record had not been asked about yet drew the seed's fields. `fill.ts` makes that copy now, and only a test
 * asks it to.
 */
export const REGISTERS: Record<string, RegisterDecl> = { ...SEED_REGISTERS, ...AGENTS_REGISTERS, session: sessionDeclaration().body } as unknown as Record<string, RegisterDecl>;

/**
 * The seed's rows, given the numbers, versions and authors a record would have given them.
 *
 * `seq` IS THE POSITION, because that is what the record does: rows are numbered as they arrive,
 * and the seed writes them in order. Everything in this file that says `party: 1` is saying
 * `people#1`, and it still is.
 *
 * The values themselves are untouched. An `undefined` is dropped, which is what a write path does
 * with an absent field, and a field the row leaves out takes its declared default, as the kernel's
 * create gives it: a skill written without `state` is active in the record, so it is active here.
 */
function entriesOf(register: string): Entry[] {
  const declared = (REGISTERS[register]?.fields ?? []) as readonly { id: string; default?: unknown }[];
  return (SEED_ROWS[register] ?? []).map((raw, i) => {
    const seq = i + 1;
    const fields: Record<string, unknown> = {};
    for (const f of declared) if (f.default !== undefined) fields[f.id] = f.default;
    for (const [key, value] of Object.entries(raw)) if (value !== undefined) fields[key] = value;
    /* AND THE DAY A ROW WAS FINISHED, filled as the record's write path fills it on a create (`@braindog/kernel` `finished.ts`). */
    const decl = REGISTERS[register];
    if (decl) stampFinished(decl, null, fields, Object.keys(raw), TODAY);
    return { seq, fields: fields as Fields, version: 1 + (seq % 4), created: stamp(-seq * 37), by: 'you' };
  });
}

/**
 * The ledger with `txn-categorise` run over it, because the seeded record runs it and the sample did not.
 *
 * TWENTY-SIX OF THE THIRTY-SIX TRANSACTIONS ARRIVE WITHOUT A CATEGORY, on purpose: `money.ts`'s
 * `generatedTransactions` writes a merchant and no category so the record's one acting rule has
 * something to act on. `installSeed` calls `applyRule` over every rule once the rows are in, and
 * seventeen of those rows come back carrying the category whose `match` is the merchant the bank
 * wrote. The sample skipped that pass, so `category:is:empty` answered 29 rows here against the
 * record's 12, and `category:in:2` answered none against the record's three.
 *
 * THE MERCHANTS AND THE NUMBERS ARE NOT TYPED HERE. The link is read out of the rule's own
 * declaration and the lookup is the categories register, so a category renamed or a merchant
 * respelled in the seed moves both sides together, which is the only reason the comparison in
 * `remote.test.ts` is worth anything.
 *
 * WHAT THIS MIRRORS IS THE EFFECT AND NOT THE ENGINE. The condition below is the rule's sentence,
 * `state is cleared, transfer is false, category is empty`, written out: the kernel's own reader
 * needs a schema and a `sql` to answer it, and a second sentence parser in the browser bundle would
 * be a second answer to what a rule matches. If that sentence changes and this does not, the
 * differential goes red on the next run, which is the check that keeps the two honest.
 */
/**
 * AND THE ONE BATCH BRAINDOG FILED ITSELF THIS MORNING (`HANDLED_FILING`), which the seed files through the record and
 * the record settles as it is filed: every uncategorised payment to that merchant, under that category.
 */
function filedItself(rows: Entry[], categories: Entry[]): Entry[] {
  const to = categories.find((c) => c.fields.name === HANDLED_FILING.category)?.seq;
  if (to === undefined) return rows;
  return rows.map((row) => {
    const already = row.fields.category;
    if (row.fields.what !== HANDLED_FILING.merchant || (already !== undefined && already !== null && already !== '')) return row;
    return { ...row, fields: { ...row.fields, category: to } };
  });
}

function categorised(rows: Entry[], categories: Entry[]): Entry[] {
  const step = SEED_RULES['txn-categorise']?.then.find((s) => 'link' in s) as
    | { link: { field: string; to: { register: string; by: string; value: string } } }
    | undefined;
  if (!step) return rows;
  const { field, to } = step.link;
  const from = /\{\{(\w+)\}\}/.exec(to.value)?.[1];
  if (!from) return rows;

  /**
   * EXACTLY ONE BEARER OR NONE, WHICH IS THE ENGINE'S RULE AND WAS NOT THIS MIRROR'S.
   *
   * `rules.ts` selects `LIMIT 2` and writes the link only when it found one row, because a rule that
   * chose between two would choose the other one next week. Keeping the first category seen here
   * disagreed the moment a second one bore a `match` already taken: a tenth category matching
   * `FENWICK CLOUD` had the sample answer `category is empty` with 12 rows against the record's 15,
   * and three of the differential tests went red over transactions #16, #23 and #29 with neither
   * side holding a wrong row. A key bearing two categories is left out of the map entirely.
   */
  const seqOf = new Map<string, number>();
  const contested = new Set<string>();
  for (const c of categories) {
    const key = String(c.fields[to.by] ?? '');
    if (key === '') continue;
    if (seqOf.has(key)) contested.add(key);
    else seqOf.set(key, c.seq);
  }
  /* AND THE RULE THAT FILED IT, SINCE money-core 3.17.0: the steps after a category's own "Matches" find a filing rule
     that is on and goes the line's way, and write its category with the rule itself into `filed_by`. The seed's rules read
     the payee by how it starts, which is all this mirrors; one that fits writes over what the category's "Matches" filed. */
  const filingRule = (row: Entry): Entry | undefined => {
    const payee = row.fields.counterparty_text;
    if (typeof payee !== 'string' || payee === '') return undefined;
    return FILING_RULES.find(
      (r) =>
        r.fields.state === 'on' &&
        r.fields.reads === 'payee' &&
        r.fields.match_by === 'starts' &&
        (r.fields.direction === row.fields.direction || r.fields.direction === 'either') &&
        payee.toLowerCase().startsWith(String(r.fields.match).toLowerCase()),
    );
  };
  return rows.map((row) => {
    const already = row.fields[field];
    if (row.fields.state !== 'cleared' || row.fields.transfer !== false || (already !== undefined && already !== null && already !== '')) return row;
    const rule = filingRule(row);
    if (rule) return { ...row, fields: { ...row.fields, [field]: rule.fields.category as number, filed_by: rule.seq } };
    const key = String(row.fields[from] ?? '');
    const seq = contested.has(key) ? undefined : seqOf.get(key);
    return seq === undefined ? row : { ...row, fields: { ...row.fields, [field]: seq } };
  });
}

export const THINGS: Entry[] = entriesOf('things');
export const PEOPLE: Entry[] = entriesOf('people');
export const OBLIGATIONS: Entry[] = entriesOf('obligations');
export const SERVICES: Entry[] = entriesOf('services');
export const TASKS: Entry[] = entriesOf('tasks');
/* THE CATEGORIES ARE THE LIST THE LEDGER FILES A LINE UNDER, read off the ledger's own link as the app reads it
   (`money/ledger.ts`), so the sample names no list the ledger does not point at. */
const CATEGORIES: Entry[] = entriesOf(String((SEED_REGISTERS.transactions?.fields ?? []).find((f) => f.id === 'category')?.to ?? ''));
const FILING_RULES: Entry[] = entriesOf('filing_rules');

/**
 * MONEY'S LEDGER WAS IN THE SEED AND NOT IN THIS INDEX, which is the whole of the bug.
 *
 * `money-core` landed six registers and the five that hold rows were written into `@braindog/seed`,
 * installed into a real kernel and answered by the record. This map is what the in-browser sample
 * reads, and it listed `obligations` and `accounts` alone — so `list('transactions', …)` returned
 * nothing and the differential in `remote.test.ts`, which drives the same filter through both
 * `where` implementations and compares row numbers, was asking the record about 95 rows and the
 * sample about zero. Six tests reported it as `sample []  record [1,2,…]`, and every money filter
 * the two compilers could have drifted apart on has been unwatched since.
 *
 * NOT A ROW IS WRITTEN HERE. `entriesOf` numbers `SEED_ROWS` by position, and `installSeed` writes
 * the same array in the same order, so `seq` is the same number on both sides and a `party: 1` in a
 * ledger row resolves to the same person. Typing a second ledger into this file is what would have
 * broken the comparison.
 */
export const ROWS: Record<string, Entry[]> = {
  obligations: OBLIGATIONS,
  accounts: entriesOf('accounts'),
  categories: CATEGORIES,
  filing_rules: FILING_RULES,
  transactions: filedItself(categorised(entriesOf('transactions'), CATEGORIES), CATEGORIES),
  recurring: entriesOf('recurring'),
  installments: entriesOf('installments'),
  snapshots: entriesOf('snapshots'),
  services: SERVICES,
  things: THINGS,
  people: PEOPLE,
  organisations: entriesOf('organisations'),
  tasks: TASKS,
  session: entriesOf('session'),
  tracks: entriesOf('tracks'),
  updates: entriesOf('updates'),
  learnings: entriesOf('learnings'),
  skills: entriesOf('skills'),
  credentials: entriesOf('credentials'),
  tools: entriesOf('tools'),
  /* KILN'S KEY NUMBERS AND THEIR READINGS, by the lists the seed names for them, as `installSeed` writes them. */
  ...Object.fromEntries(Object.keys(SAMPLE_ROWS).map((register) => [register, entriesOf(register)])),
};

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
/**
 * WHICH HOST THIS RECORD IS ON — and `as const` made it a compile-time constant.
 *
 * `kind: 'self-host' as const` pins the literal type, so `{#if DEPLOYMENT.kind !== 'self-host'}` is
 * statically false and every Cloud branch on every settings screen is unreachable code that
 * `svelte-check` cannot complain about and `dead-copy` counts as rendered — a grep for
 * `copy.<key>` finds a key inside a dead `{#if}`. Eight sentences shipped to the browser and drew
 * nowhere, including the restore control a commit was named for.
 *
 * The union is the honest type: a record IS on one host or the other, and the screens branch on it.
 * The seed can only be one of them, so the other half is exercised by `deployment.test.ts` rather
 * than by a browser gate — which is the shape the seed-variant harness in the backlog is for.
 *
 * IT IS THE SAMPLE'S HOST AND NO OTHER RECORD'S. It read `self-host` on the Cloud build too, so a screen that
 * branched on it over a live record was branching on the build. Billing did, and told a record provisioned on the Worker "This record runs
 * on your own machine.". A live record's host is asked:
 * `routes/settings/billing.ts` and `inbound-door.ts` say how, and what `boot` does not yet carry.
 */
export const DEPLOYMENT: { kind: 'self-host' | 'cloud'; since: string } = {
  kind: 'self-host',
  since: day(-612),
};

/* ── backups ───────────────────────────────────────────────────────────────── */

/** Four of the thirty kept. `53 §5.4`: nightly at 03:00 local on a self-host, thirty retained. */
/**
 * Four of the thirty kept, DERIVED from the clock and from the record.
 *
 * Both halves were typed and both were wrong. The ids read `2026-09-07 … 2026-09-04` while their
 * own `at` values are `day(0) … day(-3)` — 2026-09-03 back to 08-31 — so each row printed an id
 * four days after the date its own relative phrase resolved to, and all four sat in the future of a
 * record whose today is Thursday 3 September. This is the only screen that says when the last sealed
 * copy was taken and it carries no other absolute date to check against.
 *
 * And the counts said 1,206 rows for a record that holds 93 — the rail's own tallies, 38 + 16 + 4 +
 * 6 + 5 + 5 + 5 + 14 — at 2.1 MB, which is 23 KB a row. The nightly DELTAS were right, which is what
 * made an invented absolute figure read as a derived one.
 *
 * A snapshot is a copy of the record, so its size comes from the record. `bytes` is the one estimate
 * left and it is marked as one: a `.brain` is a SQLite file, so it is rows plus pages plus the schema
 * rather than a sum of field lengths, and this seed has no SQLite to ask.
 */
const snapshotAt = (back: number): Snapshot => {
  const at = day(back);
  const rows = Object.values(ROWS).reduce((n, list) => n + list.length, 0) - back * -2;
  return { id: at, at, bytes: 24_576 + rows * 1_460, rows, failed: null };
};

/**
 * Four nights, and one of them did not run.
 *
 * `12 §8` is the whole argument for this screen: *"A backup that silently gave up is worse than
 * none."* A failed night writes an `export` event with `note: 'failed: <reason>'` and opens a
 * suggestion; a self-host raises it as a QUESTION (`49 §5.13`) rather than a toast nobody was there
 * to see. The list held four identical successes, so the state the feature exists to make visible
 * was the one state it could not draw.
 */
export const SNAPSHOTS: Snapshot[] = [0, -1, -2, -3].map(snapshotAt).map((s, i) =>
  /* LAST NIGHT, not a night two better ones have since replaced.
     It was the third row, which made it a failure the record had already recovered from — and a
     question about a night two later snapshots superseded is a question nobody would leave open.
     `49 §5.13` words it *"Last night's snapshot failed"* because that is when it matters: the newest
     sealed copy is now a day older than it should be, and tonight will fail for the same reason. */
  i === 0 ? { ...s, bytes: 0, rows: 0, failed: 'the record was mid-import and would not hold still' } : s,
);

export const SNAPSHOTS_KEPT = 30;

/**
 * When the nightly runs, which is the host's and not ours.
 *
 * `53 §4` gives Cloud a cron: `17 3 * * *` UTC. `49 §5.13` gives a self-host 02:00 UTC plus
 * `hash(slug) mod 60` minutes, which for this record's slug is 41. They land on opposite sides of a
 * 03:00 write, which is why the ledger below numbers itself from the order rather than carrying a
 * seq typed beside each row: a hand-numbered ladder would have been right on one host.
 */
const NIGHTLY = DEPLOYMENT.kind === 'cloud' ? 'T03:17:00.000Z' : 'T02:41:00.000Z';

/** The nights that produced nothing — the input to both the ledger and the gate. */
const FAILED_NIGHTS = SNAPSHOTS.filter((s) => s.failed !== null);

/**
 * How far back the newest backup now is, said the way this product says durations.
 *
 * NOT "one night". The gap is to the newest night that WORKED, which is not the night before the
 * one that failed whenever two fail in a row — and a queue that ranks by the cost of being wrong
 * cannot state that cost from a constant.
 *
 * AND IT SAID `sealed copy`. Settings settled this word over `snapshot` and `sealed copy` and
 * `copy.ts` records the reason: two words for one idea means a reader who learns one still meets
 * the other. These two sentences are on `/decide` and on Home, which is two of the three spine
 * screens, so they were where the reader met the other one. The copies are still sealed and
 * `copy.ts` still says so on the screen that explains the signing key; that is a fact about how a
 * backup is made rather than a second name for it.
 */
/** A day as a person says it, "3 Sep", never `2026-09-03`. The seed says the same question the same way. */
const spokenDay = (d: string): string => `${Number(d.slice(8, 10))} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[Number(d.slice(5, 7)) - 1]}`;

const nightsSince = (snap: Snapshot): string => {
  const kept = SNAPSHOTS.filter((s) => s.failed === null && s.at < snap.at).map((s) => s.at).sort();
  const newest = kept[kept.length - 1];
  return newest === undefined ? 'No backup has ever been taken' : `The newest backup is from ${spokenDay(newest)}`;
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
    rank: 2,
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
    rank: 3,
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
    cost: 'Parking costs GBP 14.00 a year and one line of attention every time your BrainDog is read.',
    rank: 4,
    opened: stamp(-140),
    entity: 'Tallow',
    options: [
      { key: 'retire', title: 'Retire it', body: 'Let the domain lapse, archive the repository, and take it off every page. Irreversible after the drop date.', hard: true },
      { key: 'park', title: 'Park it another year', body: 'Keep the name. The only cost is the renewal and the attention.' },
    ],
  },
  /**
   * A PROPOSAL THAT CHANGES ROWS THE RECORD ALREADY HAS. Its body is in `ROWSETS` below: Kiln's note
   * gains a line and Portage moves to earning. Answering it would write both, compared against the
   * versions they were read at.
   */
  {
    id: 'SG30',
    title: 'Update Kiln’s note and move Portage to earning?',
    cost: 'Portage sent its first invoice this week, and Home still counts it as building.',
    rank: 5,
    opened: stamp(-20),
    entity: 'Portage',
    options: [
      { key: 'accept', title: 'Make both changes', body: 'Both rows change as shown, and only if neither has changed since it was read.', recommended: true },
      { key: 'ignore', title: 'Leave them', body: 'Nothing changes, and the proposal closes.' },
    ],
  },
  /**
   * THE NIGHT THAT DID NOT RUN, ASKED AS A QUESTION.
   *
   * `12 §8` is the sentence the backups screen was built on — *"a failed night writes an `export`
   * event with `note: 'failed: <reason>'` and **opens a `suggestion`** (re-run the snapshot)"* — and
   * `49 §5.13` says a self-host raises it HERE rather than as a toast: *"Last night's snapshot
   * failed"*, with *Run it now* and *Ignore*. The screen learned to draw the failed row and neither
   * of the two things `12 §8` requires happened: the ledger had no `export` row and the gate had no
   * question. Three surfaces, one night, and only the one you had to go looking for knew about it.
   *
   * `12 §8`'s own argument for why: *"A backup that silently gave up is worse than none."* A
   * failure nobody is shown is a failure that silently gave up, whatever the archive page says.
   *
   * DERIVED FROM THE SNAPSHOT, so a fixture that stops failing cannot leave the question behind.
   */
  ...FAILED_NIGHTS.map((snap, i) => ({
    id: `SG${34 + i}`,
    /* `backup` AND NOT `snapshot`, WHICH IS THE WORD SETTINGS SETTLED. The argument for it beside
       `nightsSince` names `snapshot` as well as `sealed copy`, and this question is on `/decide`
       and on Home: the two screens somebody sees first, carrying the third name for one thing. */
    title: `The backup on ${spokenDay(snap.at)} did not run`,
    /* WHAT IT COSTS, in the terms this queue ranks by — and the cost of a missed night is the
       distance back to the last night that worked. */
    cost: `${nightsSince(snap)}, and the reason has not gone away: ${snap.failed ?? ''}. Tonight will fail the same way.`,
    /* RANKED FIRST. `19 §4` ranks by the cost of being wrong, and everything else in this queue is
       a price or a name; this one is whether the record still exists tomorrow. */
    rank: 1,
    opened: `${snap.at}${NIGHTLY}`,
    entity: 'Your BrainDog',
    options: [
      /* `a backup` AND IT WAS `a sealed copy`. Settings calls this a backup, and an option on the
         one question about whether the record still exists tomorrow is not the place to introduce
         a second name for the thing being offered. */
      { key: 'run', title: 'Run it now', body: 'Take a backup immediately. It counts against the thirty like any other night.', recommended: true },
      { key: 'ignore', title: 'Ignore it', body: 'Tonight’s run will try again. If the reason has not gone away it will fail again, and ask again.' },
    ],
  })),
]
  /**
   * RANKED AT THE SOURCE, because two screens read this list and only one of them sorted.
   *
   * `19 §4`: *"Ranked by the cost of being wrong, never by age."* `/decide` sorts; home renders
   * `boot().questions` in array order, and the array was in the order somebody typed the questions.
   * That was invisible while the ranks happened to be 1, 2, 3 down the file — and the moment a
   * question was appended with rank 1 (the failed backup, which is whether the record still exists
   * tomorrow), the surface a person LANDS on put it fourth of four.
   *
   * A list whose order is a fact about it should arrive ordered, rather than every reader being
   * trusted to remember. `/decide` still sorts, because a screen whose whole subject is the ranking
   * should not depend on somebody else having done it.
   */
  .sort((a, b) => a.rank - b.rank);

export const DECIDED: Question[] = [
  {
    id: 'D41',
    title: 'Which domain host holds the Kiln names?',
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
  /**
   * THE PROPOSAL THAT PUT TWO ROWS IN THE RECORD, and the ledger recorded the rows without it.
   *
   * `45 §5` — `infer.draft` opens a suggestion by `slash` and writes `propose` *"when `payload.raw`
   * names an arrival"*; an accepted `rowset` body *"writes its rows"*. The two `create` events three
   * hours ago are those rows, and until now they arrived out of nowhere: an invoice landed in the
   * inbox, two services appeared, and nothing in between was written down. The one chain in this
   * record that runs arrival → assistant → person → rows had its middle two links missing.
   *
   * It also makes `30 §3`'s invariant testable at all. That section closes the `slash` actor to
   * three kinds and calls it *"an invariant with a test"* — `event WHERE actor='slash' AND kind NOT
   * IN ('suggest','propose','predict')` must always be empty — and a ledger with no `slash` row
   * satisfies it the way an empty list satisfies anything.
   */
  {
    id: 'SG33',
    title: 'Add the two services on the Fenwick invoice?',
    cost: 'The invoice is already paid either way; what is at stake is whether the record knows what it is paying for.',
    rank: 0,
    opened: stamp(-3),
    entity: 'Fenwick Cloud',
    options: [
      { key: 'accept', title: 'Add both', body: 'Object storage and the Workers plan, with the renewal dates from the invoice.', recommended: true },
      { key: 'ignore', title: 'Leave them out', body: 'The invoice stays in the inbox and the services stay unrecorded.' },
    ],
    decided: { option: 'accept', reason: 'Both are live and both renew; an invoice line nobody wrote down is the thing BrainDog is here to stop.', by: 'you', at: stamp(-3) },
  },
]
  /**
   * NEWEST FIRST, because `/decide` reads `DECIDED[0]` as *the last one decided*.
   *
   * Its empty state is `copy.lastDecided` + `since(DECIDED[0]?.decided?.at)` — a sentence about
   * recency taken from a position. That held while the array was one row, and the moment a second
   * decision was appended (the Fenwick proposal, accepted three hours ago) the screen said the last
   * decision was three months old with a nine-hour-old one sitting two lines below it.
   *
   * Same shape as the gate above: a list whose order is a fact about it should arrive ordered,
   * rather than every reader being trusted to remember. `[0]` is a fine way to ask for the newest
   * once the list is sorted, and a bug in every other case.
   */
  .sort((a, b) => (b.decided?.at ?? '').localeCompare(a.decided?.at ?? ''));

/* ── inbox ───────────────────────────────────────────────────────────────── */

export const INBOX: InboxItem[] = [
  { id: 'in_8f21', arrived: stamp(-3), from: 'billing@fenwick.example', subject: 'Your September invoice is ready', body: 'Account 44192. Total GBP 58.00, charged 24 September to the card ending 4417.', suggestion: 'When something arrives from Fenwick Cloud, set the renewal date on the matching service.' },
  { id: 'in_8f19', arrived: stamp(-9), from: 'ap@halden.example', subject: 'RE: Invoice 2026-041', body: 'Apologies for the delay. This is with our finance team and should clear in the next payment run on the 12th.' },
  { id: 'in_8f14', arrived: stamp(-26), from: 'noreply@nordhaven.example', subject: 'Renewal reminder: kilnfonts.example', body: 'kilnfonts.example expires on 30 August 2026. Auto-renew is OFF for this name.', suggestion: 'Take the renewal date from the subject line of emails like this one.' },
  { id: 'in_8f11', arrived: stamp(-31), from: 'sm@marchetti.example', subject: 'September availability', body: 'I can do Tuesdays and Thursdays through September, and the first week of October is free if you want the migration done in one block.' },
  { id: 'in_8f07', arrived: stamp(-48), from: 'hello@pellvine.example', subject: 'Year end: what we need from you', body: 'Bank statements to 31 March, the fixed asset list, and any invoices raised after the year end that relate to work done before it.' },
  { id: 'in_8f02', arrived: stamp(-73), from: 'support@ledgerpost.example', subject: 'Sending domain not verified', body: 'portagemail.example has no DKIM record. Messages are being sent, but a growing share will land in spam until this is fixed.' },
];

/* ── proposals that carry rows ────────────────────────────────────────────
   A `rowset` body, as `propose` files it (`packages/kernel/src/govern.ts`), by the question it asks.
   A row with `at` updates that row at the version it was read at; a row without one creates. */

import type { RowsetBody } from '../governance.ts';
import { firstPartyModules } from '@braindog/seed/packs/modules';

const KILN = THINGS.find((t) => t.fields.name === 'Kiln');
const PORTAGE = THINGS.find((t) => t.fields.name === 'Portage');
const KILN_NOTE = typeof KILN?.fields.note === 'string' ? KILN.fields.note : '';

export const ROWSETS: Record<string, RowsetBody> = {
  SG30: {
    register: 'things',
    rows: [
      ...(KILN
        ? [{ at: `things#${KILN.seq}`, version: KILN.version, patch: { note: KILN_NOTE.split('licensed direct.').join('licensed direct and through two resellers.') } }]
        : []),
      ...(PORTAGE ? [{ at: `things#${PORTAGE.seq}`, version: PORTAGE.version, patch: { lane: 'earning' } }] : []),
    ],
  },
};

/* ── proposals that arrange the record ────────────────────────────────────
   One of each body an agent or Slash files to change what this BrainDog is (`packages/record/src/arrange.ts`): a
   pack with its plan and the calls it would make, a settings change to the voice and the labels, and a whole
   arrangement with its reasons. Each body is as `prepare` files it, the plan and the calls worked out by the record.

   DECIDE'S OWN, NOT THE GATE'S. They are not in `QUESTIONS`, because the seed files those on the gates' record
   (`remote.test.ts` holds the two to each other) and these belong to no seeded record yet. Needs you draws them after
   the sample's questions; Home and the palette do not. */

export type Proposal = { kind: 'pack' | 'settings' | 'arrange'; body: Record<string, unknown>; by: string; pagesNow?: Record<string, Record<string, unknown>> };

export const ARRANGING: Question[] = [
  {
    id: 'SG40',
    title: 'Add Work, and keep its tasks in step with the Kiln tracker?',
    cost: '',
    rank: 6,
    opened: stamp(-5),
    options: [
      { key: 'accept', title: 'Accept', body: '' },
      { key: 'reject', title: 'Reject', body: '' },
    ],
  },
  {
    id: 'SG41',
    title: 'Call Money “Bills”, and Home “Studio”?',
    cost: '',
    rank: 7,
    opened: stamp(-8),
    options: [
      { key: 'accept', title: 'Accept', body: '' },
      { key: 'reject', title: 'Reject', body: '' },
    ],
  },
  {
    id: 'SG42',
    title: 'Arrange this BrainDog around the numbers Kiln and Portage report?',
    cost: '',
    rank: 8,
    opened: stamp(-2),
    options: [
      { key: 'accept', title: 'Accept', body: '' },
      { key: 'reject', title: 'Reject', body: '' },
    ],
  },
];

export const PROPOSALS: Record<string, Proposal> = {
  SG40: {
    kind: 'pack',
    by: 'slash',
    body: {
      install: 'work',
      kind: 'pack',
      title: 'work',
      summary: 'Tasks, who is on them and when they are due.',
      packs: { install: ['work'] },
      plan: [{ pack: 'work', version: '1.0.0', adds: ['register.tasks', 'page.work', 'ingest.tracker-issues'] }],
      approve: ['CALLS OUT tracker.kiln.example · every 1h · grant "Kiln tracker, read only"'],
      doc: {
        pack: 'work',
        declarations: [
          { register: 'tasks', name: 'Tasks' },
          { page: 'work', title: 'Work', nav: { section: 'Studio', order: 20 }, blocks: [{ kind: 'table', heading: 'Open tasks' }, { kind: 'table', heading: 'Due this week' }] },
          { ingest: 'tracker-issues', channel: 'pull', url: 'https://tracker.kiln.example/issues', every: '1h', writes: { register: 'tasks' } },
        ],
      },
    },
  },
  SG41: {
    kind: 'settings',
    by: 'slash',
    body: {
      pack: 'usecase-founder',
      values: { voice_home: 'Studio', voice_needs_you: 'Waiting on you', label_obligations: 'Bills', label_things__lane__earning: 'Paying' },
      before: { voice_home: '', voice_needs_you: '', label_obligations: '', label_things__lane__earning: '' },
    },
  },
  SG42: {
    kind: 'arrange',
    by: 'slash',
    body: {
      usecase: 'founder',
      why: [
        'Kiln and Portage now report their numbers every hour, and nothing on Home draws them.',
        { text: 'Three of the last five questions were about Portage’s subscribers.', at: 'SG29' },
        'Nothing has been added to Estate since March.',
      ],
      packs: { install: ['usecase-founder'], disable: ['estate'] },
      plan: [{ pack: 'usecase-founder', version: '1.0.0', adds: ['register.reports', 'page.dashboards', 'metric.monthly-revenue'] }],
      approve: ['CALLS OUT api.portage.example · every 1h · grant "Portage stats"', 'CALLS OUT kiln.example · every 1d · grant "none"'],
      pages: [
        {
          id: 'page.money',
          kind: 'page',
          body: { title: 'Money', nav: { section: 'Studio', order: 2 }, blocks: [{ kind: 'stat', heading: 'Monthly revenue' }, { kind: 'table', heading: 'Bills due' }] },
          was: 3,
        },
      ],
      settings: [{ pack: 'usecase-founder', values: { voice_home: 'Overview', voice_right_now: 'This week' }, before: { voice_home: 'Overview', voice_right_now: 'This week' } }],
    },
    pagesNow: { 'page.money': { title: 'Money', blocks: [{ kind: 'table', heading: 'Bills due' }] } },
  },
};

/**
 * EVERY QUESTION THE SAMPLE HAS OPEN, in the queue's order: the one count the rail, Home and Decide say.
 * The rail and Home counted `QUESTIONS` and Decide drew `ARRANGING` after them, so the badge said 5
 * over a screen headed Open questions 8.
 *
 * DEAREST TO GET WRONG FIRST, BY THE RECORD'S OWN FUNCTION, which is why it is declared down here
 * rather than beside the questions: the band comes off the proposal attached to a question, and
 * `PROPOSALS` is above. The sample's three arrangements carry bodies, so they band; the five
 * creative questions carry nothing but options, so they are judgements and tie. `rank` breaks the
 * tie, which is the one thing a fixture can say that a record cannot: which of five equally cheap
 * questions its author wanted read first. A live record breaks the same tie by age.
 */
export const QUEUE: Question[] = [...QUESTIONS, ...ARRANGING]
  .map((q) => ({ ...q, band: costOf(PROPOSALS[q.id]?.kind ?? 'options', PROPOSALS[q.id]?.body) }))
  .sort((a, b) => costRank(a.band) - costRank(b.band) || a.rank - b.rank);

/* ── the Keychain ───────────────────────────────────────────────────────────
   The register indexes what a key OPENS, never the key. No agent tool returns a secret, reveal is
   deliberate and audited, and the backup benefit and the exfiltration path are the same object. */

export const KEYCHAIN: Credential[] = [
  { id: 'cr_01', label: 'Fenwick deploy key', opens: 'Workers deploys for kiln.example', kind: 'api_token', rotated: day(-214), stale: true },
  { id: 'cr_02', label: 'Nordhaven API', opens: 'DNS for five domains', kind: 'api_token', rotated: day(-41) },
  { id: 'cr_03', label: 'Ledger Post sending key', opens: 'Newsletter delivery for Portage', kind: 'api_token', rotated: day(-12) },
  { id: 'cr_04', label: 'Tallyard bookkeeping', opens: 'Read-only ledger export', kind: 'password', rotated: day(-88) },
  { id: 'cr_05', label: 'Object storage, write', opens: 'Font binaries bucket', kind: 'ssh_key', rotated: day(-303), stale: true },
  { id: 'cr_06', label: 'Kestrel ingest', opens: 'Error reports from kiln.example', kind: 'api_token', rotated: day(-64) },
];

/**
 * What the sample knows about each key's grant, by credential id: where it applies (a project's name,
 * or null for global), whether a value is sealed, and how often it was opened. Two are index rows.
 */
export const KEYCHAIN_OPENED: Record<string, { project: string | null; sealed: boolean; opened: number; lastOpened: string | null }> = {
  cr_01: { project: 'Kiln', sealed: true, opened: 14, lastOpened: stamp(-5) },
  cr_02: { project: null, sealed: true, opened: 3, lastOpened: stamp(-24 * 9) },
  cr_03: { project: 'Portage', sealed: true, opened: 22, lastOpened: stamp(-26) },
  cr_04: { project: null, sealed: false, opened: 0, lastOpened: null },
  cr_05: { project: 'Kiln', sealed: false, opened: 0, lastOpened: null },
  cr_06: { project: 'Kiln', sealed: true, opened: 0, lastOpened: null },
};

/**
 * The sample's keychain access: one waiting for its six digits, and two machines that may open keys, one
 * for a project and one global.
 */
const ALL_KEYCHAIN_GRANTS: { id: string; name: string; state: 'pending' | 'active'; project: string | null; at: string; lastSeen: string | null }[] = [
  { id: 'vg_01', name: 'Codex, studio desktop', state: 'pending', project: 'Portage', at: stamp(-0.03), lastSeen: null },
  { id: 'vg_02', name: 'braindog CLI, studio desktop', state: 'active', project: 'Kiln', at: stamp(-24 * 4), lastSeen: stamp(-5) },
  { id: 'vg_03', name: 'Claude Code, this laptop', state: 'active', project: null, at: stamp(-24 * 2), lastSeen: stamp(-26) },
];

export const KEYCHAIN_GRANTS = ALL_KEYCHAIN_GRANTS;

/* ── packs ───────────────────────────────────────────────────────────────── */

/* THE SIX THIS BUILD SHIPS ARE THEIR MANIFESTS' (`@braindog/seed/packs/modules`), which live screens read, and the sample holds every one of them. The
   two after them are the sample's picture of a catalogue: nobody wrote them and nothing ships a document for either. */
export const PACKS: PackInfo[] = [
  ...firstPartyModules().map((m) => ({ ...m, installed: true })),
  /* IT WANTS TO SIT ABOVE YOUR MONEY PAGE, AND IT DOES NOT GET TO. `04 §4`'s worked example is this
     pack, and the record had no way to hold the fact — so the diff's `CHANGES` section was behind a
     condition that could never be true and the three sentences about it rendered nowhere. A trust
     screen that structurally cannot show the refusal it makes is a trust screen with a hole. */
  { id: 'freelancer-uk', name: 'Freelancer UK', blurb: 'Invoices with VAT, statutory interest, and the payment terms clause.', version: '2.0.1', installed: false, registers: ['invoices', 'clients'], pages: ['invoicing'], author: 'k.marsh', titles: { invoices: 'Invoices', clients: 'Clients', invoicing: 'Invoicing' }, stars: 214, moves: [{ page: 'money', from: 10, to: 12 }],
    /* ONE OF EACH CHANNEL, so the diff draws the lines and the estimate with no record behind it. */
    calls: [
      { ingest: 'exchange-rates', channel: 'pull', host: 'api.frankfurter.app', every: '1d', key: null, sends: [] },
      { ingest: 'bank-balance', channel: 'poll', host: 'api.starlingbank.com', every: '1h', key: 'Starling read', sends: [] },
      { ingest: 'invoice-sent', channel: 'call', host: 'hooks.kmarsh.example', every: '1h', key: 'Invoice hook', sends: ['invoices.number', 'invoices.amount_due'] },
    ] },
  /* AND THIS ONE COLLIDES. `services` is the `estate` pack's, and two packs owning one name is the
     failure `02 §1` builds the whole additive story on — so it is a CONFLICT rather than a change,
     and the install is refused rather than merged. */
  { id: 'type-foundry', name: 'Type foundry', blurb: 'Licences, cuts, and who is allowed to use what.', version: '0.4.0', installed: false, registers: ['licences', 'cuts', 'services'], pages: ['licensing'], author: 'a.brandt', titles: { licences: 'Licences', cuts: 'Cuts', licensing: 'Licensing' }, stars: 37, conflicts: ['services'] },
];

/**
 * The settings the sample's Money add-on declares, the ones the real pack does, so `/packs/money-core`
 * draws a whole form with no record behind it. Every other sample add-on declares none.
 */
export const PACK_SETTINGS: Readonly<Record<string, Record<string, { type: 'text' | 'enum' | 'bool' | 'money' | 'day' | 'duration' | 'number'; values?: readonly string[]; default?: unknown; label?: string; note?: string }>>> = {
  /* THE SETTINGS MONEY SHIPS WITH, read from the metrics it declares as the record's pack reads them (`targetConfigOf`):
     the home currency, and the six targets a person changes later, each starting at the figure's own target. */
  'money-core': { ...MONEY_HOME_SETTING, ...targetConfigOf(Object.values(SEED_METRICS) as unknown as Record<string, unknown>[]) } as never,
};

/* ── scheduled actions ───────────────────────────────────────────────────── */

import type { ActionRow } from '../actions.ts';

/**
 * The sample's scheduled actions: three for Kiln, one for Portage, one for every project.
 *
 * ONE OF EACH STATE a person reads on "Runs on": live, paused
 * because the provider refused the key, and retrying after a 503. Each day of the month so far carries its
 * runs, so `/usage` draws the same numbers the rows say, and the month is the sum of its days.
 *
 * A FUNCTION, SO NOTHING HERE REACHES THE ENTRY CHUNK. The layout imports this module for everything else,
 * and a function nobody in the entry calls is dropped with its rows.
 */
export const ACTION_SAMPLE = (): ActionRow[] => {
  const month = new Date(NOW).toISOString().slice(0, 7);
  const today = new Date(NOW).getUTCDate();
  const days = (runs: (d: number) => number, requests: number, bytes: number, failures: (d: number) => number = () => 0) =>
    Array.from({ length: today }, (_, i) => {
      const n = runs(i + 1);
      return { day: `${month}-${String(i + 1).padStart(2, '0')}`, runs: n, requests: n * requests, bytes: n * bytes, failures: failures(i + 1) };
    });
  const row = (r: Omit<ActionRow, 'month'>): ActionRow => ({
    ...r,
    month: r.days.reduce(
      (t, d) => ({ runs: t.runs + d.runs, requests: t.requests + d.requests, bytes: t.bytes + d.bytes, failures: t.failures + d.failures, held: 0 }),
      { runs: 0, requests: 0, bytes: 0, failures: 0, held: 0 },
    ),
  });
  return [
    row({
      ingest: 'kiln-stripe-balance',
      channel: 'poll',
      project: 'Kiln',
      host: 'api.stripe.com',
      every: '1h',
      key: 'Stripe read',
      state: 'paused',
      next: null,
      last: { at: stamp(-5), outcome: 'paused', status: 401, note: 'kiln-stripe-balance stopped: api.stripe.com answered 401 to the key "Stripe read".' },
      days: days((d) => (d < today ? 24 : 7), 1, 2_400, (d) => (d === today ? 1 : 0)),
    }),
    row({
      ingest: 'kiln-npm-downloads',
      channel: 'pull',
      project: 'Kiln',
      host: 'api.npmjs.org',
      every: '1d',
      key: 'npm read',
      state: 'pending',
      next: stamp(14),
      last: { at: stamp(-10), outcome: 'ok', status: 200, note: 'kiln-npm-downloads fetched from api.npmjs.org.' },
      days: days(() => 1, 2, 18_000),
    }),
    row({
      ingest: 'kiln-invoice-paid',
      channel: 'call',
      project: 'Kiln',
      host: 'hooks.kiln.example',
      every: '6h',
      key: 'Kiln hook',
      state: 'pending',
      next: stamp(3),
      last: { at: stamp(-3), outcome: 'ok', status: 202, note: 'kiln-invoice-paid called hooks.kiln.example, and it answered 202.' },
      days: days(() => 4, 1, 640),
    }),
    row({
      ingest: 'portage-github-issues',
      channel: 'poll',
      project: 'Portage',
      host: 'api.github.com',
      every: '15m',
      key: 'GitHub read',
      state: 'pending',
      next: stamp(1),
      last: { at: stamp(-1), outcome: 'failed', status: 503, note: 'portage-github-issues failed and will try again later.' },
      days: days(() => 96, 1, 5_200, (d) => (d === today ? 3 : 0)),
    }),
    row({
      ingest: 'exchange-rates',
      channel: 'pull',
      project: null,
      host: 'api.frankfurter.app',
      every: '1d',
      key: 'Rates',
      state: 'pending',
      next: stamp(20),
      last: { at: stamp(-4), outcome: 'ok', status: 200, note: 'exchange-rates fetched from api.frankfurter.app.' },
      days: days(() => 1, 1, 1_100),
    }),
  ];
};

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
  { at: stamp(-5), by: 'claude', text: 'Matched the Fenwick invoice to services and handed it back to check', href: '/r/tasks/17' },
  { at: stamp(-9), by: 'rule.reply', text: 'Halden replied on 2026-041: payment run on the 12th', href: '/r/obligations/1', tone: 'good' },
  { at: stamp(-14), by: 'you', text: 'Marked Kerning pass, lowercase done', href: '/r/tasks/12' },
  { at: stamp(-26), by: 'rule.renewal', text: 'kilnfonts.example moved to lapsing because auto-renew is off', href: '/r/services/2', tone: 'bad' },
  { at: stamp(-28), by: 'cursor', text: 'Drafted the chaser for 2026-041 and handed it back to check', href: '/r/tasks/1' },
  { at: stamp(-31), by: 'codex', text: 'Opened SG31, the Kiln licensing question', href: '/decide/SG31', tone: 'warn' },
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

/**
 * THE RECORD'S OWN LEDGER, IN A VOCABULARY THE RECORD CANNOT WRITE.
 *
 * Every `kind` here was invented: `entry.create`, `entry.update`, `question.open`,
 * `declaration.set`, and three more in `/audit`'s display map — `entry.archive`, `question.decide`,
 * `pack.install`. The forty kinds are `30 §2`, closed by a `CHECK` in migration 0001, and **none of
 * these seven is among them.** All eight rows would have been refused by the database whose contents
 * this claims to be, on the one screen whose entire subject is what the record recorded.
 *
 * `/audit`'s comment called them *"the write path's own vocabulary"*, which is the sentence that
 * kept it — they read like a schema, so nobody checked them against one. The write path's
 * vocabulary is `create` · `edit` · `state` · `suggest` · `declare`, and it is those five here now.
 *
 * `EVENT_KINDS` types the field, so a ninth invented row is a compile error rather than a filter
 * chip; `event-kinds.mjs` reads that array as its sixth source, so the browser's copy cannot drift
 * from the migration's again.
 */
const WRITTEN: AuditEvent[] = [
  /* THE RUN THAT IS GOING RIGHT NOW, ON THE ROW IT IS ON. `session#1` is Claude, active, heard from
     three minutes ago, doing "Variable axis QA, instances 3 of 9" — and until this line nothing in
     the ledger said WHICH row that was, so `working: true` was a dot the demo could never light. A
     demo that ships a feature it cannot show is a feature nobody reviews. */
  { seq: 4193, at: stamp(-0.1), by: 'claude', kind: 'edit', target: 'tasks#8', note: 'instances 3 of 9 checked', version: 4193 },
  { seq: 4192, at: stamp(-3), by: 'claude', kind: 'create', target: 'services#6', note: 'Object storage, from the Fenwick invoice', version: 4192 },
  { seq: 4191, at: stamp(-3), by: 'claude', kind: 'create', target: 'services#7', note: 'Workers plan, from the Fenwick invoice', version: 4191 },
  /* THE ARRIVAL THAT CAUSED THE TWO ROWS ABOVE, and it was the missing half of the story. `45 §5`:
     `infer.draft` opens the suggestion and writes `propose` *"when `payload.raw` names an arrival"*,
     actor `slash`. `30 §3` closes that actor to three kinds and calls the closure *"an invariant
     with a test"* — `event WHERE actor='slash' AND kind NOT IN ('suggest','propose','predict')` must
     always be empty. The ledger had no `slash` row at all, so the invariant held over nothing. */
  { seq: 4190, at: stamp(-3), by: 'slash', kind: 'propose', target: 'suggestion:SG33', note: 'Two services on the Fenwick invoice, from in_8f21', version: 4190 },
  { seq: 4188, at: stamp(-9), by: 'rule.reply', kind: 'edit', target: 'obligations#1', note: 'added a note: “Chased twice. 45-day terms expired 3 August.”', version: 4188 },
  /* `state`, NOT `edit`. `30 §2` keeps them apart in the Rows group deliberately: a state move is
     the change a transition rule can refuse, and it was one word inside a free-text note. */
  { seq: 4181, at: stamp(-14), by: 'you', kind: 'state', target: 'tasks#12', note: 'state from open to done', version: 4181 },
  { seq: 4174, at: stamp(-26), by: 'rule.renewal', kind: 'state', target: 'services#2', note: 'state from live to lapsing', version: 4174 },
  /* `suggest`, and the target grammar `45 §5.1` writes: `suggestion:SG<n>`. A question opening is a
     suggestion opening — there is no `question.*` kind, because a question IS a suggestion with an
     `options` body (`33 §2`). */
  { seq: 4160, at: stamp(-31), by: 'codex', kind: 'suggest', target: 'suggestion:SG31', note: 'Kiln licensing model', version: 4160 },
  { seq: 4102, at: stamp(-49), by: 'claude', kind: 'edit', target: 'people#4', note: 'added a note: “Year end is 31 March”', version: 4102 },
  /* WHAT THE AGENT ON A PROJECT SAID ABOUT WHERE IT STANDS, as the record writes it when the sample is installed, so a
     project's Changed by names the agent and not you. */
  ...PROJECTS_SAID.map((s) => ({ seq: 0, at: stamp(s.hours), by: s.by, kind: 'edit' as const, target: `things#${s.things}`, note: s.note, version: 0 })),
  { seq: 4061, at: stamp(-96), by: 'you', kind: 'declare', target: 'page.money', note: 'Added the Overdue stat cell', version: 4061 },
];

/**
 * WHAT THE NIGHTLY WROTE, WHICH THE LEDGER HAD NEVER HEARD OF.
 *
 * `12 §8` requires two things of a failed night and the record did neither: *"a failed night writes
 * an `export` event with `note: 'failed: <reason>'` and opens a `suggestion`"*. `/settings/backups`
 * drew the failure; `/audit` — the screen whose whole subject is what happened to this record —
 * showed a ledger in which every night ran, because there were no `export` rows in it at all. Two
 * screens, one night, two stories, on the pair whose entire job is that the record is checkable.
 *
 * DERIVED FROM `SNAPSHOTS`, not typed beside it. That was the actual defect: the archive list and
 * the ledger were two hand-written arrays about the same four nights, and two hand-written arrays
 * about one fact is the shape every disagreement in this record has had. There is one array now and
 * the ledger reads it.
 *
 * `note` on a good night is the row count, because `12 §8` says the walk *"records row counts in
 * the object's metadata so 'it is backed up' is checkable"* — a night that says only that it
 * happened is not checkable.
 */
const NIGHTLY_EVENTS: AuditEvent[] = SNAPSHOTS.flatMap((snap) => {
  const at = `${snap.at}${NIGHTLY}`;
  /* THESE TWO NUMBERS ORDER THE PAIR A FAILED NIGHT WRITES, AND NOTHING ELSE. `AUDIT` numbers the
     whole ledger from its own sort, and the tiebreak only fires between two rows at the same
     instant — so a descending ladder across the nights was four numbers nothing read. Two rows one
     night apart are already ordered by the night. */
  const by = 'system';
  if (snap.failed === null)
    /* THE COUNT, AND IT USED TO END `, sealed`. The row this note sits on already carries the
       verb — `export` renders as *Backed up* — so the second half was a word `copy.ts` had
       renamed out of the product saying a thing the line beside it had already said. What `12 §8`
       asks the note to carry is the row count, and that is what is left. */
    return [{ seq: 0, at, by, kind: 'export' as const, note: `${snap.rows} rows`, version: 0 }];
  return [
    { seq: 1, at, by, kind: 'suggest' as const, target: `suggestion:SG${34 + FAILED_NIGHTS.indexOf(snap)}`, note: 'Run the backup again', version: 1 },
    /* `12 §8`'S EXACT STRING. `note: 'failed: <reason>'` — and `30 §2` is explicit that this is
       how a blocked night is recorded: *"`blocker` is not an event kind."* */
    { seq: 0, at, by, kind: 'export' as const, note: `failed: ${snap.failed}`, version: 0 },
  ];
});

/**
 * The ledger, in one order, numbered from it.
 *
 * A `seq` IS A PLACE IN THIS LIST, not a number typed beside a row — which is what `30 §1` makes it
 * (`event.version` is the rowid) and what `/audit`'s footer says out loud: *"a version number is a
 * place in this list."* Typing them worked while every row was hand-written; the nightly's minute is
 * the host's, 03:17 UTC on Cloud and 02:41 here, so the same night falls on either side of a 03:00
 * write depending on which host you are reading — and a typed ladder would have been right on one.
 *
 * Ties keep the order they were written in, which is what makes a write that produced two events
 * (a failed night: the `export` and the `suggest` it opened) read as one thing that happened.
 */
const TOP = 4192;
export const AUDIT: AuditEvent[] = [...WRITTEN, ...NIGHTLY_EVENTS]
  .sort((a, b) => (a.at === b.at ? b.seq - a.seq : a.at < b.at ? 1 : -1))
  .map((e, i) => ({ ...e, seq: TOP - i, version: TOP - i }));

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
for (const event of WRITTEN) {
  if (event.kind !== 'create' || event.target === undefined) continue;
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

/**
 * A search result, counted across every list, the way the record's own `search` counts.
 *
 * THREE LINES IN THESE LOGS WERE TYPED AND ALL THREE CONTRADICTED THE RECORD, sitting beside
 * siblings that were derived — which is exactly what makes an invented figure believable. A run log
 * is a receipt: `10 §7` has the refusal teach, and a receipt that reports a count the record cannot
 * produce is a receipt nobody can check.
 *
 * `search` reads the register's `search:` fields (`find.ts`), which is what an agent's `search` tool
 * does, so this counts the same way rather than a way that flatters the number — and it counts it by
 * CALLING that matcher rather than by carrying a third copy of one.
 *
 * IT HELD ITS OWN `title.includes()`, which stopped agreeing with the record the day the box became
 * `34 §6`'s `matches` operator, and the sentence above is precisely the argument against that: a
 * receipt reporting a count the record cannot produce is a receipt nobody can check.
 */
const searched = (needle: string): string => {
  let rows = 0;
  let lists = 0;
  for (const [id, entries] of Object.entries(ROWS)) {
    const hit = entries.filter((e) => answers(id, e, needle)).length;
    if (hit) {
      rows += hit;
      lists++;
    }
  }
  /* `lists`, NOT `registers`. `19 §9` bans the schema's word from a surface a person reads, and this
     log printed both spellings two lines apart. */
  return `${rows} row${rows === 1 ? '' : 's'} across ${lists} list${lists === 1 ? '' : 's'}`;
};

/**
 * How many arrivals the inbox holds.
 *
 * ALL OF THEM ARE UNMATCHED, and that is what the list IS — `InboxItem`'s own `body` field is "why
 * no pattern matched it". The log said "18 arrivals, 6 unmatched" over a record holding six, whose
 * rail badge says six, and every one of them unclaimed. `07 §2` gives `inbox_raw` seven states and
 * this build seeds one, so a second number here would be a distinction the fixture cannot make.
 */
const arrivals = (): string =>
  `${INBOX.length} arrival${INBOX.length === 1 ? '' : 's'}, all unmatched`;

export const JOBS: Record<string, Job> = {
  j_9K4A: {
    id: 'j_9K4A',
    kind: 'qa',
    status: 'running',
    model: 'your machine · claude-opus-5',
    started: stamp(-0.05),
    run: 'S1',
    events: [
      /* `things` HAS NO `state` FIELD — its state column is `lane`, and its values are
         `building | earning | parked | retired`. So the predicate does not compile, `matches()`
         admits nothing, and the log's "4 rows" was the register's total: the number you get when a
         filter is IGNORED rather than run, which is the one failure a declarative surface must not
         have. The input says what the agent would actually write. */
      { seq: 1, tool: 'list', input: 'things where lane is earning', out: counted('things', (e) => e.fields.lane === 'earning'), ok: true },
      { seq: 2, tool: 'read', input: 'tracks#1', out: 'Variable axis QA, nine instances', ok: true },
      /* A GETTER, so the count is taken when a screen reads it rather than while this module is
         still evaluating. `searched()` now calls the record's own matcher, which lives in `find.ts`,
         which reads `REGISTERS` from here — a deliberate cycle, and an eager call inside it lands in
         the temporal dead zone of whichever module ESM happened to start second. Deferring the call
         to first read is the whole fix, and it is also more honest: a receipt is a thing the screen
         asks for. */
      { seq: 3, tool: 'search', input: 'mastering pass', get out() { return searched('mastering pass'); }, ok: true },
    ],
  },
};


/** The one the reconcile run, S3, is running. Named, because two screens quote it by name. */
export const JOB: Job = {
  id: 'j_7Q2F',
  run: 'S3',
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
    { seq: 3, tool: 'read', input: 'inbox since 2026-08-01', out: arrivals(), ok: true },
    { seq: 4, tool: 'search', input: 'Fenwick', get out() { return searched('Fenwick'); }, ok: true },
    { seq: 5, tool: 'propose', input: 'merge services#6 and services#13: same provider, same renewal', out: 'PROPOSAL_UNCITED: a proposal must attach the rows it read', ok: false },
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

/**
 * The five-person × fourteen-register matrix of `20 §1`, with four people and three exceptions.
 *
 * EVERY ROW HERE IS A SHAPE THE SCREEN COULD NOT DRAW. It held one level each, so the record-wide
 * level was the whole answer and `member.register` — the column the matrix is made of — appeared
 * nowhere. What that cost is not abstract: the one sentence `members.ts` gives as the reason the
 * feature exists could not be expressed on the screen that exists for it.
 */
/**
 * FOUR PEOPLE AND FOUR READ MARKS, and the shape of the set is the point.
 *
 * `20 §6` puts read marks on the *worth building* side of its table — *"who has seen the thing
 * that binds them"* — against live cursors and typing indicators on the other. The one question a
 * record can answer that a chat cannot is whether somebody has looked at the decision they are
 * bound by, and a seed where everybody had looked recently could not show the answer that matters.
 *
 * So: you are current, one person is a week behind the newest event, the bookkeeper has never
 * opened it at all, and the contractor's invitation is still out — which is a different `null` from
 * the bookkeeper's and has to read as one.
 */
export const PEOPLE_ACCESS: Person[] = [
  { id: 'you', name: 'You', level: 'owner', scoped: [], email: 'you@thestudio.example', since: day(-612), suspended: null, seen: stamp(-3) },
  /* AN OWNER HELD TO `read` ON ONE LIST — `members.ts`'s own example, and the direction people
     assume is impossible. A scoped level that could only narrow the record level would make the
     other row below impossible instead. */
  { id: 'sm', name: 'S. Marchetti', level: 'write', scoped: [{ register: 'people', level: 'read' }], email: 's.marchetti@example.com', since: day(-181), suspended: null, seen: stamp(-24 * 8) },
  /* THE BOOKKEEPER, AND `level: null` IS THE POINT OF HER. Nothing on the record itself — not the
     list of lists, not search, not a page — and `read` on the two lists she was asked to reconcile.
     `45 §5.1`: with no `'*'` row the ceiling is exactly the named registers, so a pack that installs
     a fifteenth list tomorrow gives her nothing, which is `20 §1`'s *"private until granted"*. */
  /* ACCEPTED NINETY-SIX DAYS AGO AND HAS NEVER OPENED IT. `null` here is not the contractor's
     `null` below — hers is *the invitation is still out*, this one is *they are in and have not
     looked* — and an owner deciding whether the reconciliation is happening needs those to be two
     sentences on the screen rather than one blank cell. */
  { id: 'pv', name: 'Pell & Vine', level: null, scoped: [{ register: 'obligations', level: 'read' }, { register: 'services', level: 'read' }], email: 'accounts@pellvine.example', since: day(-96), suspended: null, seen: null },
  /* AN INVITATION THAT HAS NOT BEEN ACCEPTED IS A DIFFERENT STATE FROM ACCESS, and the screen had
     no way to hold one — so somebody who had invited a bookkeeper could not tell whether the link
     had been used. `12 §3`: single-use, 24 hours, bound to one email. */
  /* AN EXCEPTION THAT WIDENS, which the seed did not have.
     `sm` narrows (write → read on people) and `pv` holds nothing on the record, so every "widening"
     in the fixture came from `rung(null) = -1` — the test asserting the matrix runs BOTH ways was
     satisfied by the bookkeeper's own absence of a level. A contractor who may file expenses
     everywhere and DECIDE on the one track they run is the shape that makes it real. */
  { id: 'jo', name: 'J. Okonkwo', level: 'append', scoped: [{ register: 'session', level: 'read' }, { register: 'tracks', level: 'decide' }], email: 'j@okonkwo.example', since: null, suspended: null, seen: null },
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



/**
 * The record's own signing key, public half — and it is not a credential.
 *
 * `53 §4` says where it lives: *"generated on first run; the public half in **Settings → export**
 * and, when the hosts serve it, at the well-known URL 03 §4 names"*. `03 §4` says what it is for: *"so a customer can verify a
 * backup they downloaded a year ago against a key they can independently fetch"*, and what the
 * signature claims — *"this file was produced by that instance, and no row has changed since"*.
 * `53 §5.4` has the operator copy it from this screen into
 * `braindog verify latest.brainl --key <…>`, and `48 §5.6` says that without it the answer reads
 * **`unpinned`**: the embedded key proves integrity and origin is `--key`'s job.
 *
 * A PUBLIC KEY IS THE ONE KEY THAT BELONGS ON A SCREEN, and this product's first promise makes that
 * worth saying out loud: the Keychain indexes what a key OPENS and never the key, and the rule is about
 * secrets. Publishing this one is the mechanism, and the design puts it at
 * `GET /.well-known/braindog-key`.
 *
 * NOTHING SERVES THAT PATH TODAY, and this sentence used to say it did. The Worker matches
 * `/.well-known/braindog-build` and nothing else, and `apps/worker/test/build.test.ts` asserts the
 * key path is refused, so the public half reaches a person from this screen and from nowhere on
 * the network. The paragraph above hedges correctly with "when the hosts serve it", and this one
 * contradicted it four lines later, which is worse than either sentence alone: a reader believes
 * whichever they read second.
 *
 * `03 §4`: raw 32-byte Ed25519 in base64url; `key_id` is the first 16 hex characters of SHA-256 over
 * the public key. Both are shown, because `48 §5.6`'s pin check compares `key_id` and that is the
 * half short enough to read down a phone.
 */
export const SIGNING_KEY = {
  /* `03 §4`: *"`key_id` is the first 16 hex characters of SHA-256 over the public key"* — and it was
     sixteen hex characters of nothing in particular. The key was corrected and the fingerprint
     beside it was not, so a person copying both from this screen would have had `braindog verify`
     answer `SIGNATURE_INVALID` and conclude the tool was broken. It is `sha256(raw)[0:16]` now. */
  keyId: 'aebc6474874dc50c',
  /* FORTY-THREE CHARACTERS, which is what 32 bytes of base64url is. It was 48 — 36 bytes of ASCII
     text spelling a sentence — under a test whose own message said "a 32-byte key is ~43 base64url
     characters" and whose range admitted it anyway. A key of the wrong length on the screen a person
     copies it from is a key that fails `braindog verify` and teaches them the tool is broken. */
  publicKey: 'k3Zq7Nl9xBvR2sTfW8yUcAe4Hj1MpDoQzL5aXgVn0iY',
  since: day(-612),
};

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
    error: { code: 'PULL_AUTH_REJECTED', fix: 'Reconnect the credential. The provider rejected it, and the connector is paused until you do.', credential: 'Tallyard bookkeeping', at: day(-4) },
  },
];

/* ── agents ────────────────────────────────────────────────────────────────── */

/** `12 §6.1`. The denied row is kept deliberately — see the type. */
/**
 * `at` IS AN INSTANT AND NOT A DAY, on every one of these.
 *
 * A device code lives ten minutes (`49 §5.9`). A column recorded to the day cannot say whether a
 * pending request is live or four hours dead — `day(0)` parses to midnight, so under the shipped
 * seed's noon every waiting grant was already twelve hours expired while the screen drew it as
 * waiting for you. The one field on this table that a person makes a decision from was stored at a
 * resolution 72 times coarser than the decision.
 */
const ALL_DEVICES: Device[] = [
  { id: 'dg_01', name: 'Claude Code, this laptop', surface: 'mcp', state: 'active', reach: 'login', ua: 'Claude Code 2.4 on macOS', tries: 0, codeHash: '', at: stamp(-24 * 31), lastSeen: stamp(-2) },
  { id: 'dg_02', name: 'braindog CLI, studio desktop', surface: 'cli', state: 'active', reach: 'runner', ua: null, tries: 0, codeHash: '', at: stamp(-24 * 88), lastSeen: stamp(-24 * 2) },
  /* THE PENDING ROW IS THE ONE THE APPROVER READS, so it carries both columns `49 §5.11` names —
     what it would be allowed to do, and what it says it is. `runner` is the heaviest of the six: a
     ninety-day bearer that claims jobs and executes code, which is worth knowing before the click.

     ITS `codeHash` IS EMPTY, WHICH IS THE ONLY HONEST WAY TO SAY WHAT THIS ROW IS. It shipped as a
     real fingerprint under a comment claiming the code behind it "exists nowhere" — and a review
     enumerated all one million six-digit strings in under a second and found the one that matched.
     The mock's hash is djb2 folded to 32 bits; a million guesses is not a search space.
     `fingerprint` cannot return the empty string, so nothing matches this row at all, which is the
     property the paragraph was reaching for and could not have had. The success path is exercised in
     `device.test.ts`, which builds its own rows and knows its own codes. */
  { id: 'dg_03', name: 'Codex, unknown machine', surface: 'mcp', state: 'pending', reach: 'runner', ua: 'codex-cli 0.9 on Linux', tries: 0, codeHash: '', at: stamp(-0.05), lastSeen: null },
  { id: 'dg_04', name: 'Unrecognised request, Frankfurt', surface: 'mcp', state: 'denied', reach: 'login', ua: null, tries: 5, codeHash: '', at: stamp(-24 * 6), lastSeen: null },
  /* AN OPERATION GRANT THAT NOBODY GOT TO IN TIME — `48 §13 D1`'s ten minutes, and the state four of
     these rows end in. `ua` here is the `subject` the command sent: for `export` it is what would
     have been exported, which is the only thing that makes the request decidable. */
  { id: 'dg_05', name: 'braindog export, studio desktop', surface: 'cli', state: 'expired', reach: 'export', ua: 'the whole record', tries: 0, codeHash: '', at: stamp(-3), lastSeen: null },
];

export const DEVICES: Device[] = ALL_DEVICES;

/**
 * The tokens this record has minted — `12 §3`'s list, which no screen had.
 *
 * Two of them are the grants above resolved: `dg_01`'s `login` reach minted a ninety-day write
 * token, and `dg_02`'s `runner` reach is the job bearer itself. The third is an MCP read token
 * nobody has used, which is the row worth having a list for.
 */
const ALL_TOKENS: Token[] = [
  { id: 'tk_01', label: 'Claude Code, this laptop', scope: 'write', surface: 'mcp', created: day(-31), lastUsed: stamp(-2), expires: day(59) },
  /* TWO DAYS LEFT, and the row exists to be the one that says so. A ninety-day token that stops
     working on a Tuesday morning is the most common way an agent quietly falls off a record, and
     the list is where somebody could have seen it coming. */
  { id: 'tk_02', label: 'braindog CLI, studio desktop', scope: 'write', surface: 'cli', created: day(-88), lastUsed: stamp(-24 * 2), expires: day(2) },
  /* NEVER USED. `12 §3`: "A credential you cannot see being used is a credential you cannot know is
     stolen" — and the inverse is this row, a live key nothing has ever presented, which is the one
     worth revoking and the one no screen was showing. */
  { id: 'tk_03', label: 'Reporting, read only', scope: 'read', surface: 'mcp', created: day(-12), lastUsed: null, expires: day(78) },
];

export const TOKENS: Token[] = ALL_TOKENS;
