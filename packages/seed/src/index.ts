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
import { KERNEL_WRITTEN, type Declaration, type FieldDecl, type IngestDecl, type Json, type Kernel } from '@braindog/kernel';

import { AGENTS_PACK, AGENTS_REGISTERS, agentsPackDocument } from './packs/agents.ts';

export { AGENTS_METRICS, AGENTS_PACK, AGENTS_PAGES, AGENTS_REGISTERS, agentsPackDocument, type PackManifest } from './packs/agents.ts';
export { FIRST_PARTY, FIRST_PARTY_VERSIONS, crossPack, firstPartyDocument, firstPartyManifest, type DocumentOptions, type FirstPartyId } from './packs/first-party.ts';
export * from './modules/base.ts';
export { ACCOUNTS, CATEGORIES, INSTALLMENTS, OBLIGATIONS, RECURRING_ITEMS, SNAPSHOTS, TRANSACTIONS, cashPoints, cashSeries, nightOf, snapshotRows } from './modules/money.ts';
export { SERVICES } from './modules/estate.ts';
export { PROJECTS_SAID, THINGS } from './modules/portfolio.ts';
export { ORGANISATIONS, PEOPLE } from './modules/people.ts';
export { RUNS, TASKS, TRACKS, UPDATES, openTasksSeries } from './modules/work.ts';

import { NOW, day, hours, type Fields, type SeedMetric, type SeedPage, type SeedRegister, type SeedRule } from './modules/base.ts';
import {
  ACCOUNTS,
  CATEGORIES,
  INSTALLMENTS,
  MONEY_AUTOMATIONS,
  MONEY_HOME_SETTING,
  MONEY_METRICS,
  MONEY_PAGES,
  MONEY_REGISTERS,
  MONEY_RULES,
  OBLIGATIONS,
  RECURRING_ITEMS,
  SNAPSHOTS,
  TRANSACTIONS,
  cashPoints,
  targetConfigOf,
} from './modules/money.ts';
import { STARTER_CATEGORIES } from './modules/money/lists/categories.ts';
export { MONEY_HOME_SETTING, MONEY_TARGET_SETTINGS, targetConfigOf } from './modules/money.ts';
import { ESTATE_METRICS, ESTATE_PAGES, ESTATE_REGISTERS, SERVICES } from './modules/estate.ts';
import { ESTATE_AUTOMATIONS, estateTargetConfig } from './modules/estate.ts';
import { PORTFOLIO_PAGES, PORTFOLIO_REGISTERS, PORTFOLIO_RULES, PROJECTS_SAID, PROJECT_METRICS, THINGS } from './modules/portfolio.ts';
import { ORGANISATIONS, PEOPLE, PEOPLE_AUTOMATIONS, PEOPLE_METRICS, PEOPLE_PAGES, PEOPLE_REGISTERS } from './modules/people.ts';
import { RUNS, TASKS, TRACKS, UPDATES, WORK_AUTOMATIONS, WORK_METRICS, WORK_PAGES, WORK_REGISTERS } from './modules/work.ts';
import { HEALTH_PAGES } from './modules/health.ts';

/* ── registers ────────────────────────────────────────────────────────────── */

export const REGISTERS: Record<string, SeedRegister> = { ...MONEY_REGISTERS, ...ESTATE_REGISTERS, ...PORTFOLIO_REGISTERS, ...PEOPLE_REGISTERS, ...WORK_REGISTERS };

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
  { name: 'reconcile-invoice', trigger: 'When an invoice arrives, to match each line to a service before proposing any change.', kind: 'skill', project: 3, body: '# Reconcile an invoice\n\n1. List the services from the invoice’s provider.\n2. Match each line by renewal date, then by amount.\n3. Propose any change with the services you read attached.', rev: 4, because: [3, 4] },
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
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  transactions: TRANSACTIONS,
  recurring: RECURRING_ITEMS,
  installments: INSTALLMENTS,
  snapshots: SNAPSHOTS,
  services: SERVICES,
  things: THINGS,
  organisations: ORGANISATIONS,
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
export const METRICS: Record<string, SeedMetric> = { ...MONEY_METRICS, ...ESTATE_METRICS, ...PROJECT_METRICS, ...WORK_METRICS, ...PEOPLE_METRICS };



/* ── the pages it ships with ────────────────────────────────────── */

export const PAGES: Record<string, SeedPage> = { ...MONEY_PAGES, ...ESTATE_PAGES, ...PORTFOLIO_PAGES, ...WORK_PAGES, ...PEOPLE_PAGES, ...HEALTH_PAGES };

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

/** The rules the modules ship with. */
export const RULES: Record<string, SeedRule> = { ...MONEY_RULES, ...PORTFOLIO_RULES };

export const ruleDeclarations = (): Declaration[] =>
  Object.values(RULES).map((body) => ({ id: `rule.${body.rule}`, kind: 'rule' as const, body: body as never }));

/**
 * The automations the modules ship with: a rule that starts a script, and the script, and the rules that act on an
 * answer given in Decide, as one list (`WORK_AUTOMATIONS`, `MONEY_AUTOMATIONS`, `ESTATE_AUTOMATIONS`).
 *
 * NOT IN `RULES`, because a `SeedRule` is the older `register:` and `then:` form that `applyRule` reads over the rows
 * already written, and these are automations that start on a write (`on: written`) and hand off to a script. And not
 * installed by anything that takes one half without the other: a rule whose script is missing fails every run it
 * starts, so both halves go in one call.
 *
 * THEY ARE IN `packDocument()` AND SO ARE HERE. The Work pack is split out of `packDocument()` (`packs/first-party.ts`),
 * so that is the only place Work can declare them, and `test/pack.test.ts` holds `installSeed` and `packDocument()` to
 * installing the same declarations. Added to the document alone, three of its tests went red: the
 * document held 93 declarations where the seed's own lists count 89, and the record the pack made held
 * `rule.close_follow_ups`, `rule.start_with_parent` and their two scripts where the one the seed made did not.
 */
export const AUTOMATIONS: readonly Record<string, unknown>[] = [...WORK_AUTOMATIONS, ...MONEY_AUTOMATIONS, ...ESTATE_AUTOMATIONS, ...PEOPLE_AUTOMATIONS];

export const automationDeclarations = (): Declaration[] =>
  AUTOMATIONS.map((body) =>
    typeof body.script === 'string'
      ? { id: `script.${body.script}`, kind: 'script' as const, body: body as never }
      : { id: `rule.${String(body.rule)}`, kind: 'rule' as const, body: body as never },
  );

/** A pattern as a first-party module declares one: an ingest, filed under the pack its `pack:` names. */
export type ModuleIngest = IngestDecl & { pack?: string };

/**
 * How a forwarded message becomes a row: the patterns the first-party modules ship with, and today they ship none.
 *
 * THE LAST TWO LEFT AT money-core 3.0.0. money-core carried a card alert's two wordings, `bank-card-out` and
 * `bank-card-in`, and since 1.7.0 their webhook twins `-sms`, and this spread all four into `packDocument()`, every
 * first-party document and the sample. So every record set up with Money held an English bank alert's wording and a
 * text door for it, whether its owner banked by card, by cash or not at all, and a bank SMS pattern is a use case the shell may
 * not carry. They are `packs/card-alerts` now, a file a record
 * installs when it wants them, as one bank's six wordings went to their own add-on under `packs/` at money-core 1.8.0.
 *
 * THE LIST STAYS, AND EMPTY, because it is still the one road from a module into a record for a pattern that names no
 * bank and no country: `packDocument()` spreads it, `installSeed` installs it with the lists it writes into, and
 * `test/pack.test.ts` holds the two to the same count. A module that declares a pattern again puts it here and nowhere
 * else. Typed here rather than by money-core's own name, so that nothing in this file depends on money-core declaring a
 * pattern at all.
 *
 * THE SAMPLE CARRIES NO PATTERN EITHER. A test that forwards a card alert installs `packs/card-alerts` on its record, as
 * the tests that forward the Egyptian bank's lines install that pack's file (`test/pack-files.ts`).
 */
export const INGESTS: Record<string, ModuleIngest> = {};

export const ingestDeclarations = (): Declaration[] =>
  Object.values(INGESTS).map((body) => ({ id: `ingest.${body.ingest}`, kind: 'ingest' as const, body: body as never }));

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
 * ITS SEEDS ARE ONE ROW A LIST, and the demo dataset is not in it. A pack's `seeds:` are examples,
 * tagged so they can be told from real rows and deleted. CATEGORIES ALONE ARRIVE AS A STARTER SET
 * (`STARTER_CATEGORIES`, ruling 341), eight of them, in and out. Forty cross-linked rows are a
 * demonstration, which is `installSeed`'s job and a different thing.
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
      ...Object.values(RULES),
      /* A PATTERN IS SPREAD AS IT STANDS, where a register had to be respelled: `normalise` reads a
         declaration's kind off its FIRST key, and a pattern in `INGESTS` writes `ingest:` first, so
         the document form and the stored form of an ingest are the same object. */
      ...Object.values(INGESTS),
      /* A RULE AND THE SCRIPT IT STARTS, each already in the document form with its kind first. */
      ...AUTOMATIONS,
    ],
    /* THE SETTINGS MONEY'S TARGETS ARE HELD TO, which a person changes later, and the currency it adds up in. */
    config: {
      ...MONEY_HOME_SETTING,
      ...targetConfigOf(Object.values(METRICS) as unknown as Record<string, unknown>[]),
      ...estateTargetConfig(Object.values(METRICS) as unknown as Record<string, unknown>[]),
    },
    /* A REGISTER WHOSE REQUIRED FIELD IS A REF CANNOT BE SEEDED BY A PACK. A pack's seeds are one
       row per register with no order between them, so a `ref` in one would resolve against whatever
       happened to be written first — a different row on a different day. `updates` needs a `track`,
       so it arrives empty and the demonstration is what fills it. */
    /* ONLY WHAT THE PACK DECLARES. Agent runs are the kernel's register, and a run's `last_seen` and
       `project` are fields no seed row may set, so an example run would stop the install halfway. */
    /* CATEGORIES ARE THE STARTER SET (ruling 341), and no row of the sample studio's: a new record's first payment has
       somewhere to go, money in and money out. */
    seeds: ORDER.filter((register) => register in REGISTERS && (ROWS[register] ?? []).length > 0 && !needsARef(register)).flatMap((register) =>
      (register === 'categories' ? STARTER_CATEGORIES : [exampleRow(register)]).map((fields) => ({ register, fields: forWrite(register, fields as Fields) })),
    ),
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
  /* A LIST OF REFS TOO, since an organisation's first row lists the projects it is part of (People 3.0.0). */
  const refs = new Set((REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'ref' || (f.type === 'list' && f.of === 'ref')).map((f) => f.id));
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
 *
 * `categories` BEFORE `transactions`, AND `obligations` BEFORE IT TOO, for the same reason: a ledger
 * row points at the category it is for and at the promise it settled. `snapshots` last of Money's,
 * because nothing points at one.
 *
 * `organisations` BETWEEN THE TWO, SINCE People 3.0.0: an organisation lists the projects it is part of, and a person
 * and a ledger row point at the organisation they are with.
 */
export const ORDER = [
  'things',
  'organisations',
  'people',
  'tracks',
  'obligations',
  'accounts',
  'categories',
  'transactions',
  'recurring',
  'installments',
  'snapshots',
  'services',
  'tasks',
  'session',
  'updates',
] as const;

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

const HOUR_MS = 3_600_000;

/** An instant `days` from the sample's day, at `hh:mm` UTC. */
const at = (days: number, hh: number, mm = 0): number => Date.parse(`${day(days)}T00:00:00.000Z`) + hh * HOUR_MS + mm * 60_000;

/**
 * WHEN THE SAMPLE'S HISTORY HAPPENED, oldest first, which is the order `installSeed` writes it in: overnight and this
 * morning, on the sample's own day.
 *
 * ITS ROWS GO IN JUST AFTER MIDNIGHT AND NOT WEEKS BACK, because the record stamps a day on what a write finishes (a task
 * done with no Done on is done the day it was written, `finished:`) and the agents' figures count rows by when they were
 * written, so a row written into last month moved the sample's own numbers. What a row says about its past is in its
 * own days. Then the questions were asked and two answered, the agents said where their projects stand
 * (`PROJECTS_SAID`), the night's backup failed and asked, and the rules ran their pass this morning, one after another.
 */
export const HISTORY = {
  kept: at(0, 0, 5),
  asked: {
    D41: { opened: at(0, 0, 30), decided: at(0, 0, 45) },
    SG27: { opened: at(0, 1) },
    SG29: { opened: at(0, 1, 30) },
    SG30: { opened: at(0, 2, 35) },
    SG31: { opened: at(0, 2, 50) },
    SG33: { opened: at(0, 3), decided: at(0, 3, 5) },
    SG34: { opened: at(0, 3, 17) },
  } as Record<string, { opened: number; decided?: number }>,
  rules: at(0, 6),
  ruleStep: 35 * 60_000,
} as const;

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
             `brainl.ts:613`, both map to 422, and nothing in this repository asserts on the old
             spelling. Two codes for one sentence, one of them unpublished. */
          code: 'IMPORT_NOT_EMPTY',
          fix: `This record already holds ${kernel.count(register)} rows in ${register}. The seed opens an empty record.`,
          at: register,
        },
      };

  /* THE ARRIVAL PATTERNS GO IN WITH THE LISTS THEY READ AND WRITE. `writes.register` is checked
     for its grammar at install and never resolved, so a pattern installs happily into a record with
     no `transactions` in it and says nothing until the first message lands. Putting it in the batch
     that declares `transactions` and `accounts` is what keeps the first forwarded alert from being
     the test of whether the register was there. */
  /* ON THE RECORD'S OWN CLOCK, NOT BACKDATED: an install arms what runs on a clock, and a pull armed in the night is
     overdue the moment the record opens. The agents pack below arms nothing on a clock, so it goes in with the rows. */
  const installed = await kernel.install([
    ...declarations(),
    ...pageDeclarations(),
    ...metricDeclarations(),
    ...ingestDeclarations(),
  ]);
  if (!installed.ok) return installed as Result<Seeded>;

  /* WHAT THE SAMPLE HOLDS WAS WRITTEN OVER A NIGHT AND A MORNING, NOT IN ONE INSTANT (`HISTORY`), so its feeds read "5h
     ago" and "11h ago" rather than "just now" on every line, and the question the night's backup raised says so. */
  const agents = await kernel.backdate(HISTORY.kept, () => installAgentsPack(kernel, actor));
  if (!agents.ok) return agents as unknown as Result<Seeded>;

  let rows = 0;
  const wrote = kernel.backdate(HISTORY.kept, (): Result<unknown> => {
    for (const register of [...ORDER, ...AGENTS_ORDER])
      for (const [i, entry] of (ROWS[register] ?? []).entries()) {
        /* WHAT AN AGENT SAID ABOUT A PROJECT IS LEFT OUT OF THE ROW, and the agent writes it below, when it said it. */
        const said = register === 'things' ? PROJECTS_SAID.find((s) => s.things === i + 1) : undefined;
        const planted = said ? Object.fromEntries(Object.entries(entry).filter(([k]) => !said.fields.includes(k))) : entry;
        const out = register === 'session' ? openRun(kernel, entry, actor) : kernel.create(register, forWrite(register, planted as Fields), { actor });
        if (!out.ok) return out;
        rows++;
      }
    return { ok: true, value: null };
  });
  if (!wrote.ok) return wrote as unknown as Result<Seeded>;

  /* AND THE NIGHTS BEFORE THIS ONE, FOR CASH (`cashPoints`): a figure remembers its first day the night after it is
     declared, so the sample made a minute ago had no day of cash for Today's line to draw. Written as the nightly
     reading writes them, a day a point, under the sample's name, and the record adds its own from the next night on. */
  const nights = kernel.writePoints('sample', cashPoints());
  if (!nights.ok) return nights as unknown as Result<Seeded>;

  /* THE QUESTIONS GO IN LAST, because SG30's rowset names rows of `things` at the version they were
     written at, and a proposal is checked against the rows it names when it is filed. So what the agents said goes in
     just before SG30, oldest first, and SG30 is read again after it, at the versions their writes left. */
  let suggestions = 0;
  let decisions = 0;
  for (const planned of governanceSeed(kernel)) {
    if (planned.sample === 'SG30')
      for (const said of [...PROJECTS_SAID].sort((a, b) => a.hours - b.hours)) {
        const entry = ROWS.things?.[said.things - 1] ?? {};
        const patch = Object.fromEntries(said.fields.map((k) => [k, entry[k] as Json]));
        const out = kernel.backdate(NOW + said.hours * HOUR_MS, () => kernel.update('things', `things#${said.things}`, patch as never, { actor: `agent:${said.by}` }));
        if (!out.ok) return out as unknown as Result<Seeded>;
      }
    const q = planned.sample === 'SG30' ? (governanceSeed(kernel).find((g) => g.sample === 'SG30') ?? planned) : planned;
    const when = HISTORY.asked[q.sample] ?? { opened: HISTORY.kept };
    /* A QUESTION THE RECORD RAISED ITSELF IS THE RECORD'S, and the night's failed backup is one. */
    const by = q.by ?? actor;
    const opened = kernel.backdate(when.opened, () => kernel.propose({ question: q.question, body_kind: q.body_kind, body: q.body }, by));
    if (!opened.ok) return opened as unknown as Result<Seeded>;
    suggestions++;
    if (q.decided === undefined) continue;
    const decided = kernel.backdate(when.decided ?? when.opened, () => kernel.decide(opened.value.id, { decide: q.decided! }, actor));
    if (!decided.ok) return decided as unknown as Result<Seeded>;
    decisions++;
  }

  /* THE RULES GO IN AFTER THE QUESTIONS, and are read once over the rows already there, so what they ask
     is numbered after the sample's own questions rather than in the middle of the rows being written. */
  /* THE AUTOMATIONS GO IN WITH THEM, after the rows too. Two of the sample's tasks are written with a `parent`, and
     `rule.start_with_parent` installed before them would queue a script run for each while the seed is still writing,
     for rows the sample already places by hand. */
  const ruled = await kernel.install([...ruleDeclarations(), ...automationDeclarations()]);
  if (!ruled.ok) return ruled as Result<Seeded>;
  /* EACH RULE'S PASS AT ITS OWN TIME THIS MORNING, in the order they were declared, so Today's feed reads as a morning. */
  for (const [i, rule] of Object.values(RULES).entries()) {
    const applied = kernel.backdate(HISTORY.rules + i * HISTORY.ruleStep, () => kernel.applyRule(rule.rule));
    if (!applied.ok) return applied as unknown as Result<Seeded>;
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
  /** Who raised it, when it is not the person: the record itself, for what its own nightly work noticed. */
  by?: string;
};

const option = (id: string, label: string, because: string, recommended = false) => ({
  id,
  label,
  because,
  ...(recommended ? { recommended: true } : {}),
});

/**
 * The seed's governance rows: its open questions and the decisions it shows, with the same
 * questions, options, recommended option and reasons as the web's test fixture, which no shipped file imports.
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
      question: 'Which domain host holds the Kiln names?',
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
      question: `The backup on ${Number(day(0).slice(8, 10))} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[Number(day(0).slice(5, 7)) - 1]} did not run`,
      body_kind: 'options',
      body: {
        options: [
          option('run', 'Run it now', 'Take a backup immediately. It counts against the thirty like any other night.', true),
          option('ignore', 'Ignore it', 'Tonight’s run will try again. If the reason has not gone away it will fail again, and ask again.'),
        ],
      },
      by: 'system',
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
    retire: (ids, by) => kernel.retire(ids, by ?? { actor }),
    seed: (register, fields) => kernel.create(register, { ...fields, tags: ['example'] }, { actor, cascade: false } as never) as never,
    remember: (row) => kernel.rememberPack(row),
    forget: (id) => kernel.forgetPack(id),
    claimed: (id) => kernel.packClaims(id),
  }, diff.planHash);
}
