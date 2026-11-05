/**
 * Understanding what the record already holds ("automatically populating people and entities"): the
 * payee each ledger line was with, the project each run worked in, the project each service is for, and the remote a
 * project's bare repository name stands for.
 *
 * WHY A WALK OVER THE PAST. The understanding layer reads what comes in from now on: a bank door fills
 * `counterparty_text` and a rule meets the organisation, a run is placed by the ladder the moment it says where it is.
 * The owner's record was written before any of that. Measured on it: 217 ledger lines and not one with a party (the
 * payee only in `what`, or in a note like "Payee: Amazon."), 743 runs and 2 in a project though 230 name their
 * repository and 12 their remote, 27 projects whose repositories are mostly bare names, and 15 of 35 services in no
 * project. Nothing that arrives later fixes those rows, so this walks them once, a slice a night.
 *
 *   1. A ledger line with no party is read for its payee: the bank's words, else "Payee: X" in its note, else its own
 *      description. The payee is met as an organisation by its `bank:` key (`identity-keys.ts`), or by an organisation
 *      or service whose name folds to the same key, and the line is linked. A payee whose key is a known one with one more
 *      word ("AMAZON PRIME" beside Amazon, "SWIFTCAB RIDE" beside Swiftcab) is that payee too (`baseOf`). A payee the
 *      record does not know yet is made an organisation only when it says it is a business (`soundsLikeBusiness`): a
 *      company suffix, a card processor's prefix or a web address, or a word only a shop or a supplier is called by.
 *      Anything else, a plain "Layla Ahmed" above all, is a question and never an organisation. A payee on one line
 *      alone is left as it is unless the record already knows it; a payee that is a person, or shaped like one, is never
 *      an organisation, nor is the payee of a line that says it is a transfer, nor a word like "Unknown" that names
 *      nobody, nor an account on a payment network.
 *
 *      AN ORGANISATION THE PERSON HOLDS NEVER GAINS A BANK KEY FROM A PAYEE'S NAME ALONE. A
 *      payer's name on a bank line is not under the owner's control, and a key routes every later text by it. So a line
 *      whose payee is a held organisation's name, exactly, is linked and the key is left off; one whose payee only extends
 *      that name is asked about (`held`). Only an organisation the walk or a door made from the bank's own words gains
 *      the key, with Undo.
 *   2. A run with no project is placed only when its place is sure (`placedFor`): a remote a project lists, or a folder
 *      a project lists that the run worked in itself, or one whose project lists the run's repository too, and not
 *      contradicted by the run's own repository. A bare name, a run further down a folder, a broad folder like
 *      `~/Developer`, or a last name is one question per whole place (its remote, else its folder) and guess, a single
 *      guess included ("Is that BrainDog?"), so `sam/lantern` and somebody else's `lantern` are never one question and
 *      one yes. Two places of one name in a walk are each said with their owner or their
 *      folder ("acme/Lantern", "lantern in Code"). A run whose place guesses nothing better, in a repository whose owner
 *      on its host holds the repositories of exactly one project, is one question per owner ("Is that Oxbow.gg?"). Each
 *      question carries `wheres`, the whole place of every run it is about, so a yes places exactly those. Once, and
 *      never a run already placed, nor one still working, which the ladder places itself. A run with no remote whose
 *      own folder is called exactly what one project is called, or a bare repository it lists, case and punctuation
 *      folded, is that project's and is placed (`exactFolder`); a run an import wrote, which no hook heard
 *      (no `last_seen`), is never a question.
 *   3. A service with no project is linked when its name, the first word of its name, its domain, or the label of its
 *      domain matches exactly one project's name (with any domain ending left off) or domain. Linked, a domain of it
 *      that spells the project's name is written into the project's domains, so mail from it is matched later.
 *   4. A project that lists a bare repository name, where runs have worked in exactly one remote of that name, is a
 *      suggestion to list the remote. Never a write: the person says which repository a project is.
 *
 * EVERY WRITE IS THE WRITE PATH'S, signed `rule:backfill` so the feed counts it as the record's own work and folds a
 * night of links into one line, with every check, key and event any write gets. Each slice is one batch, and
 * `undoBackfill` puts a batch back. Rules do not cascade from it: a night walking 200 old payments is not 200 new
 * payments to automations.
 *
 * DOUBT IS A SUGGESTION, NEVER A WRITE. A payee only a description names, a run two projects could hold, a service
 * two projects match: each comes back in `suggestions`, one per `key`, worded for a person, for the caller to ask once.
 *
 * IDEMPOTENT BY CONSTRUCTION. Every slice reads only rows still empty, and every organisation it makes carries the key
 * it was made for, so a second walk finds the first one's work and writes nothing. `next` is where each slice stopped,
 * for the next call to start from, and a caller keeps it: a row the walk cannot settle stays empty, so a caller that
 * starts over each time reads the same first `limit` rows again and never reaches the ones after them.
 */

import type { Clock, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { Json } from './coerce.ts';
import { holderOf, holders, nameKey } from './entities.ts';
import { keyOf, legacyBankKey, mayBeCut, onlyAKind, registrable } from './identity-keys.ts';
import type { Entry, Patch, RegisterDecl, WriteContext } from './index.ts';
import { COUNTERPARTY } from './ingest.ts';
import { instant } from './migrate.ts';
import { meetsRole, orgRole, type OrgFields, type RoleList } from './roles.ts';
import { candidateOf, matchProject, namedAs, remoteKey, type Candidate, type Whereabouts } from './scope.ts';
import { SESSION, isStale } from './session.ts';

/** Who the walk writes as: a mechanism (`pairs.ts`'s `isMechanism`), which the feed files with the rules. */
export const BACKFILL_ACTOR = 'rule:backfill';

/**
 * Where a key the walk gave an organisation came from, on `entity_key.source`: the writer, as the write path stamps every
 * key it claims. Never set beside the write by hand, so the key, and where it came from, go when the write is undone.
 */
export const BACKFILL_SOURCE = BACKFILL_ACTOR;

/** How many rows one slice reads in a call, when the caller says nothing. */
export const BACKFILL_LIMIT = 200;

/** How many lines a payee must be on before it is made an organisation nobody named: once is a visit. */
export const PAYEE_SEEN = 2;

/** What the walk needs of a record: the kernel's own parts (`parts.ts`), and its lists. */
export type BackfillDeps = {
  sql: Sql;
  clock: Clock;
  mint: () => string;
  transaction: <T>(fn: () => T) => T;
  /** The write path, as `KernelParts.write`. */
  write: (register: string, ref: string | null, patch: Patch, w: WriteContext) => Result<Entry>;
  /** The live lists, as `kernel.registers()`. */
  registers: () => ReadonlyMap<string, RegisterDecl>;
};

export type SliceName = 'ledger' | 'runs' | 'services';

export type BackfillOptions = {
  /** How many rows each slice reads. */
  limit?: number;
  /** Where each slice starts: the `next` a previous call handed back. */
  after?: Partial<Record<SliceName, string | null>>;
};

/**
 * One slice of one call. `looked` is the rows read, `wrote` the rows changed, `refused` the writes the record said no
 * to. `batch` is the one batch every write of the slice shares, or `null` when it wrote nothing. `next` is where the
 * next call starts, `null` once the slice has read to the end.
 */
export type Slice = { batch: string | null; looked: number; wrote: number; refused: number; next: string | null };

/** A row as a suggestion names it: its id, a handle for the caller, and its name, which is what a person reads. */
export type Named = { id: string; name: string };

/**
 * What the walk would not do on its own. `key` is what one suggestion is kept by, so the caller asks once; `question`
 * is the sentence a person reads, with names and never an id, a key, a path or a host.
 */
export type BackfillSuggestion =
  | { kind: 'organisation'; key: string; name: string; payments: number; question: string }
  | { kind: 'run-project'; key: string; place: string; runs: number; projects: Named[]; question: string; wheres: string[] }
  | { kind: 'service-project'; key: string; service: Named; projects: Named[]; question: string }
  | { kind: 'project-remote'; key: string; project: Named; repo: string; remote: string; runs: number; question: string };

/**
 * A payee that may be an organisation the person holds, which the walk never gives a key on its own: "Are the 3
 * payments to Amazon Prime with Amazon?". `key` is what the question is kept by; a yes gives the organisation `bank`,
 * the payee's key, and the next walk links every line by it. A no leaves both as they are. Kept apart from
 * `suggestions`, whose every kind the record already files, until the record files this one too.
 */
export type HeldAsk =
  | { kind: 'organisation-key'; key: string; organisation: Named; payee: string; bank: string; payments: number; question: string }
  | CutAsk;

/**
 * THE SHOPS ALREADY MET BY A NAME A CARD TEXT CUT SHORT, asked about once and all together: each that another organisation's whole name begins with is folded into that one (`into`), and each other is
 * retired, kept with its payments and the bank's words, and left off People. Nothing is folded or retired until he says
 * yes, and a no leaves them as they are. `key` is the shops' own ids, so the same shops are asked about once.
 */
export type CutAsk = { kind: 'cut-shops'; key: string; shops: { organisation: Named & { version: number }; into: Named | null }[]; payments: number; question: string };

export type Backfilled = {
  ledger: Slice & { organisations: number };
  runs: Slice;
  services: Slice;
  suggestions: BackfillSuggestion[];
  /** Payees that may be an organisation the person holds, for the person to say (`HeldAsk`). */
  held: HeldAsk[];
};

type Field = RegisterDecl['fields'][number];
type Lists = readonly RegisterDecl[];
type Row = { id: string; register: string; version: number; fields: Record<string, Json>; updated_at: string };

const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const live = (fields: readonly Field[]): Field[] => fields.filter((f) => !f.retired);
const hydrate = (r: { id: string; register: string; version: number; fields: string; updated_at: string }): Row => ({
  ...r,
  fields: JSON.parse(r.fields) as Record<string, Json>,
});

/** The live rows of a list after `after`, by id, at most `limit` of them, with `where` over `fields` in SQL. */
function rowsAfter(sql: Sql, register: string, after: string, limit: number, where = '1 = 1', ...params: (string | number)[]): Row[] {
  return sql
    .all<{ id: string; register: string; version: number; fields: string; updated_at: string }>(
      `SELECT id, register, version, fields, updated_at FROM entry
        WHERE register = ? AND deleted_at IS NULL AND id > ? AND (${where}) ORDER BY id LIMIT ?`,
      register,
      after,
      ...params,
      limit,
    )
    .map(hydrate);
}

/** Every live row of a list. For the lists a walk matches against, which a record keeps in the tens or hundreds. */
const allRows = (sql: Sql, register: string): Row[] => rowsAfter(sql, register, '', 1_000_000);

/** A slice that read nothing, because the record holds nothing it walks. */
const idle = (): Slice => ({ batch: null, looked: 0, wrote: 0, refused: 0, next: null });

/**
 * Walk what the record already holds, one bounded slice of each kind, and say what was linked and what is a question.
 *
 * Each slice runs in one transaction and writes as one batch, so a slice is all there or not at all, and Undo takes a
 * slice back whole (`undoBackfill`).
 */
export function understandBackfill(deps: BackfillDeps, opts: BackfillOptions = {}): Backfilled {
  const limit = Math.max(1, Math.floor(opts.limit ?? BACKFILL_LIMIT));
  const lists: Lists = [...deps.registers().values()];
  const suggestions = new Map<string, BackfillSuggestion>();
  /* EACH RUN QUESTION'S PLACE SAID WITH ITS OWNER OR ITS FOLDER, for when two places of one name are asked about. */
  const longer = new Map<string, string>();
  const suggest = (s: BackfillSuggestion, long?: string): void => {
    if (long !== undefined && !longer.has(s.key)) longer.set(s.key, long);
    const held = suggestions.get(s.key);
    /* THE SAME QUESTION FROM TWO ROWS IS ONE, counting both. */
    if (held?.kind === 'run-project' && s.kind === 'run-project') {
      const runs = held.runs + s.runs;
      const wheres = [...new Set([...held.wheres, ...s.wheres])].sort();
      suggestions.set(s.key, { ...held, runs, wheres, question: s.key.startsWith(OWNER_KEY) ? ownerQuestion(held.place, runs, held.projects) : runQuestion(held.place, runs, held.projects) });
    } else if (!held) suggestions.set(s.key, s);
  };
  const asks = new Map<string, HeldAsk>();
  const ask = (a: HeldAsk): void => void (asks.has(a.key) || asks.set(a.key, a));

  const ledger = deps.transaction(() => ledgerSlice(deps, lists, limit, opts.after?.ledger ?? '', suggest, ask));
  const runs = deps.transaction(() => runsSlice(deps, lists, limit, opts.after?.runs ?? '', suggest));
  const services = deps.transaction(() => servicesSlice(deps, lists, limit, opts.after?.services ?? '', suggest));
  for (const s of remoteSuggestions(deps.sql, lists)) suggest(s);
  /* TWO PLACES OF ONE NAME ARE TWO QUESTIONS THAT WOULD READ ALIKE, so each says whose or where it is. */
  const byName = new Map<string, string[]>();
  for (const s of suggestions.values())
    if (s.kind === 'run-project' && !s.key.startsWith(OWNER_KEY)) byName.set(s.place.toLowerCase(), [...(byName.get(s.place.toLowerCase()) ?? []), s.key]);
  for (const keys of byName.values()) {
    if (keys.length < 2) continue;
    for (const key of keys) {
      const s = suggestions.get(key);
      const place = longer.get(key);
      if (s?.kind === 'run-project' && place !== undefined) suggestions.set(key, { ...s, place, question: runQuestion(place, s.runs, s.projects) });
    }
  }
  return { ledger, runs, services, suggestions: [...suggestions.values()], held: [...asks.values()] };
}

const heldQuestion = (payee: string, payments: number, organisation: string): string =>
  `${payments === 1 ? 'Is the payment' : `Are the ${payments} payments`} to ${payee} with ${organisation}?`;

/* ── a slice's batch ─────────────────────────────────────────────────── */

/** The write context every write of one slice shares, minting the batch on its first write. */
function batcher(deps: BackfillDeps): { w: () => WriteContext; batch: () => string | null } {
  let batch: string | null = null;
  return {
    w: () => {
      batch ??= deps.mint();
      return { actor: BACKFILL_ACTOR, batch, cascade: false };
    },
    batch: () => batch,
  };
}

/* ── 1. ledger lines with no party ───────────────────────────────────── */

/** A list whose lines say who money moved with: a `ref` to the organisations, beside a money field. */
type Ledger = {
  register: string;
  party: string;
  title: string | undefined;
  note: string | undefined;
  payee: string | undefined;
  transfer: string | undefined;
  /** The field its lines are filed under, a link to a list of categories or a choice, read for what a payment was for. */
  category: string | undefined;
  /** Its money fields: a line with none of them filled moved no money, and names no payee. */
  money: readonly string[];
};

/** A LINE IS A PAYMENT ONLY WITH AN AMOUNT ON IT. */
const paid = (ledger: Ledger, fields: Record<string, Json>): boolean => ledger.money.some((id) => fields[id] !== undefined && fields[id] !== null);

function ledgersOf(lists: Lists, orgs: string, people: string | undefined): Ledger[] {
  const out: Ledger[] = [];
  for (const decl of lists) {
    if (decl.id === orgs || decl.id === people || decl.id === SESSION || decl.series) continue;
    const fields = live(decl.fields);
    const refs = fields.filter((f) => f.type === 'ref' && f.to === orgs);
    if (refs.length === 0 || !fields.some((f) => f.type === 'money')) continue;
    /* A LIST THAT HOLDS A PLAIN NUMBER BESIDE MONEY READS MEASURES, NOT PAYMENTS: Numbers has a value or an amount and a
       link to an organisation, and "Daily active players, Bake.gg" on 276 lines was asked about as a company. Missing a
       payee on such a list costs a suggestion; reading a metric as a payee costs the person's trust. */
    if (fields.some((f) => f.type === 'decimal')) continue;
    const party = refs.find((f) => f.id === 'party') ?? refs[0]!;
    const text = (id: string | undefined): string | undefined =>
      id !== undefined && fields.some((f) => f.id === id && (f.type === 'text' || f.type === 'document')) ? id : undefined;
    /* A MOVE BETWEEN THE PERSON'S OWN ACCOUNTS IS NOBODY'S PAYMENT: the list's pair mark, or a `transfer` it keeps by hand. */
    const mark = (decl.pairs as { mark?: string } | undefined)?.mark ?? 'transfer';
    out.push({
      register: decl.id,
      party: party.id,
      title: text(decl.title),
      note: text('note'),
      payee: text(COUNTERPARTY),
      transfer: mark !== undefined && fields.some((f) => f.id === mark && f.type === 'bool') ? mark : undefined,
      category: fields.some((f) => f.id === 'category' && (f.type === 'enum' || (f.type === 'ref' && f.to !== orgs))) ? 'category' : undefined,
      money: fields.filter((f) => f.type === 'money').map((f) => f.id),
    });
  }
  return out.sort((a, b) => a.register.localeCompare(b.register));
}

/**
 * The payee a line names. `sure` is a payee said as one: the bank's own words, a note's "Payee:", or a description that
 * is only a name ("AMAZON MKTPLACE"). A payee cut out of a description that says more is not sure, and makes no
 * organisation on its own: "HALDEN TYPE CO INV 2026-035" finds Halden Type Co when the record knows it, and is a
 * question when it does not.
 */
type Payee = { said: string; key: string; sure: boolean; moved: boolean };

/** A company's legal form, as a word of its name: `Edgewall, Inc.`, `Tarnvale Oy`, `Halden Type Co`, `Lantern AI, PBC`. */
const COMPANY_FORMS = new Set([
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'plc', 'gmbh', 'pbc', 'corp', 'corporation', 'llp', 'pty', 'sarl', 'sae', 'bv', 'oy', 'ab', 'ag', 'nv',
  'srl', 'co', 'company', 'holdings',
]);

/**
 * A legal form of two letters is a person's initials as often as a company's (`AB OKONKWO`, `SAM CO MARCHETTI`), so it
 * says business only as the last word, after a name: `Tarnvale Oy`, `HALDEN TYPE CO`.
 */
const SHORT_FORM = /^\p{L}{2}$/u;

/**
 * A card processor or point of sale before the merchant's name, or the `*` a card text puts between a merchant and what
 * was bought: `GEIDEA*BREEZEWAY`, `PAYMOB-SWIFTCAB`, `POS FRESHBAY 0921`, `RIDEWELL *TRIP`. A bank prints a transfer to a
 * person without one. And a web address, which only a business pays from: `SOWBELL.COM`, `WWW.ORCHARD.COM/BILL`. Its
 * name before the dot is two letters or more, so an initial and a surname (`A.Co`, `J.COM`) is never one.
 */
const MERCHANT_SHAPE = /\*|^(?:pos|paymob|fawry|kashier|paytabs|sumup|paypal|zettle|izettle|sq|tst)\s*[-\s]|(?<![\p{L}\p{N}])[\p{L}\p{N}][\p{L}\p{N}-]*[\p{L}\p{N}]\.(?:com|net|org|io|co|app|ai|eg|uk)\b/iu;

/**
 * A processor or point of sale before the merchant's name, as a name leaves it out: `PAYMOB-SWIFTCAB`, `POS FRESHBAY`.
 * Only after a dash, or `POS` and a space: `PAYPAL EUROPE` is PayPal itself, and never a company called Europe.
 */
const PROCESSOR_PREFIX = /^(?:pos\s+|(?:pos|paymob|fawry|kashier|paytabs|sumup|paypal|zettle|izettle|sq|tst)\s*-\s*)(?=\p{L})/iu;

/**
 * Words only a shop or a supplier is called by, or that say what was bought from one: `BELLWETHER COFFEE`, `NILE
 * MARKET`, `XO TELECOM`, `Sahara Spider Hosting`, `RIDEWELL TRIP`, `VODACELL RECHARGE`, `HARBOUR BANK FEES`. Never a word
 * a transfer to a person is printed with (`wire`, `transfer`, `payroll`), which would make a person a business, nor one
 * a person is named by: `Prime`, `Ride`, `Energy`, `Media`, `Mobile`, `Fee` and `Interest` are each somebody's surname,
 * and "SAM PRIME" on three lines is a question.
 */
/** The word for an insurer in any of its forms, which a business is called by and a person never is. */
const INSURER = /^insur(?:ance|er|ers)$/u;

const MERCHANT_WORDS = new Set([
  'coffee', 'cafe', 'café', 'restaurant', 'kitchen', 'bakery', 'grill', 'pizza', 'burger', 'market', 'supermarket', 'hypermarket', 'mart',
  'marketplace', 'mktplace', 'store', 'stores', 'shop', 'pharmacy', 'hotel', 'hotels', 'telecom', 'cloud', 'hosting', 'online',
  'bank', 'assurance', 'airlines', 'airways', 'travel', 'motors', 'studio', 'studios', 'labs', 'software',
  'systems', 'digital', 'services', 'developments', 'properties', 'trip', 'rides', 'recharge', 'subscription', 'premium',
  'fees', 'payout', 'purchase', 'instalment', 'installment',
]);

/**
 * WHETHER A PAYEE SAYS IT IS A BUSINESS, by its legal form, a merchant's shape, or a merchant's word. A name that says
 * none of them, "LAYLA AHMED" or "Rhea Albany", may be a person paid by transfer, and the walk never decides that a
 * person is a company: it asks.
 */
export function soundsLikeBusiness(said: string): boolean {
  if (MERCHANT_SHAPE.test(said.trim())) return true;
  const words = said.toLowerCase().split(/[\s,]+/u).map((w) => w.replace(/[^\p{L}]/gu, '')).filter((w) => w !== '');
  /* A LEGAL FORM ENDS A NAME, never starts it: `AB OKONKWO` and `AG SMITH` are a person's initials. One of two letters
     only as the very last word. */
  const last = words.length - 1;
  return words.some((w, i) => (i > 0 && COMPANY_FORMS.has(w) && (i === last || !SHORT_FORM.test(w))) || MERCHANT_WORDS.has(w) || INSURER.test(w));
}

/** "Payee: Amazon." in a note, up to the end of its sentence. */
const PAYEE_NOTE = /\bpayee\s*:\s*(.+?)(?:\.(?=\s|$)|[;\n]|$)/iu;

/**
 * Words that say what a payment was for and not whom it was with: "HALDEN TYPE CO INV 2026-035", "TRANSFER TO TAX
 * RESERVE", "PELL & VINE, HALF THE YEAR-END FEE", "J OKONKWO JUNE SET". A description is cut at the first of them, a month
 * among them, and at its first comma. And a description that starts with the name of one of the ledger's own
 * categories or choices says what it was for from its first word (`purposesOf`): the words a record files its money
 * under are its own, read off its lists and its declaration, and never written here.
 */
const ABOUT_A_PAYMENT =
  /^(?:inv|invoice|ref|reference|transfer|payment|paid|purchase|pos|bill|fee|fees|refund|deposit|wages|to|from|for|card|tax|vat|interest|cash|atm|withdrawal|topup|standing|order|direct|debit|dd|so|rent|payout|subscription|renewal|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/iu;

/** The most words a description may be and still be only a name. */
const NAME_WORDS = 4;

/**
 * WORDS THAT NAME NOBODY, as a bank or an import fills a payee it did not know: "Unknown", "Initial" on an opening
 * balance, "Internet Banking", "IPN inward", "TT". A payee made only of them is no payee. Measured on the owner's ledger,
 * where 11 lines say "Unknown" and 5 "Initial", and each became an organisation. A payment network's own name is one
 * too, and is learnt from the ledger rather than written here (`railsOf`).
 */
const NAMES_NOBODY =
  /^(?:unknown|unnamed|initial|opening|balance|misc|miscellaneous|sundry|other|none|na|adjustment|correction|internet|phone|mobile|online|banking|bank|ipn|tt|pos|purchase|inward|outward|incoming|outgoing|credit|debit|cash|card|payment|transfer)$/iu;

/**
 * An account on a payment network, as a bank prints who a transfer came from: `quill.harbour@<network>`, the network's
 * name after the `@` with no dot, which no mail host has. It is a person's or a business's account and names neither,
 * so it is no payee; and the network's name, wherever a line says it alone, is a word that names nobody.
 */
const RAIL_ADDRESS = /[^\s@]+@(\p{L}[\p{L}\p{N}-]*)(?![\p{L}\p{N}.@-])/gu;

/** The payment networks a ledger's lines write accounts on, by name, lower case: what `RAIL_ADDRESS` finds after an `@`. */
function railsOf(texts: Iterable<string | undefined>): Set<string> {
  const out = new Set<string>();
  for (const text of texts) if (text !== undefined) for (const m of text.matchAll(RAIL_ADDRESS)) out.add(m[1]!.toLowerCase());
  return out;
}

/**
 * What a ledger's own lists say about reading its lines: the one-word names of its categories and choices (`purposes`),
 * every word those names are made of (`about`), and its payment networks.
 */
type Reading = { purposes: ReadonlySet<string>; about: ReadonlySet<string>; rails: ReadonlySet<string> };

/**
 * A LINE THAT SAYS IT IS A TRANSFER moved money to or from somebody's account: a person ("IPN inward transfer from
 * LAYLA ...", noted "Payee: Layla."), or the person's own. Its payee may be an organisation the record already holds,
 * and is linked to it then, but it never makes one, counts towards one, or asks about one.
 */
const SAYS_TRANSFER = /\b(?:transfers?|trf|xfer)\b/iu;

/** The name at the start of a description, and whether anything after it was cut off. */
function nameIn(what: string, purposes: ReadonlySet<string>): { said: string; cut: boolean } {
  const first = what.split(/[:,;(]/u)[0] ?? '';
  const words = first.trim().split(/\s+/u).filter((w) => w !== '');
  const bare = (w: string): string => w.replace(/[^\p{L}]/gu, '');
  /* A CATEGORY'S NAME ONLY FIRST: as a later word it is as often a shop's own ("BELLWETHER COFFEE" under Coffee). */
  if (words.length > 0 && purposes.has(bare(words[0]!).toLowerCase())) return { said: '', cut: true };
  const at = words.findIndex((w) => ABOUT_A_PAYMENT.test(bare(w)));
  const kept = at < 0 ? words : words.slice(0, at);
  const said = kept.join(' ');
  return { said, cut: said !== what.trim().replace(/\s+/gu, ' ') };
}

/** The texts of a line a payee is read from: the bank's words, its note, its description. */
const textsOf = (ledger: Ledger, fields: Record<string, Json>): (string | undefined)[] =>
  [ledger.payee, ledger.note, ledger.title].map((id) => (id === undefined ? undefined : textOf(fields[id])));

/** The payee a line names, or `null` for a line that names none, or none the record could key. */
function payeeOf(ledger: Ledger, fields: Record<string, Json>, reading: Reading): Payee | null {
  const bank = ledger.payee === undefined ? undefined : textOf(fields[ledger.payee]);
  const noted = ledger.note === undefined ? undefined : PAYEE_NOTE.exec(textOf(fields[ledger.note]) ?? '')?.[1]?.trim();
  const what = ledger.title === undefined ? undefined : textOf(fields[ledger.title]);
  const moved = what !== undefined && SAYS_TRANSFER.test(what);
  const keyed = (said: string, sure: boolean): Payee | null => {
    if (railsOf([said]).size > 0) return null;
    const nobody = (w: string): boolean => {
      const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
      return bare === '' || NAMES_NOBODY.test(bare) || reading.rails.has(bare.toLowerCase()) || reading.about.has(bare.toLowerCase());
    };
    if (said.split(/\s+/u).every(nobody)) return null;
    const key = keyOf('bank', said);
    return key === null ? null : { said, key, sure, moved };
  };
  if (bank) return keyed(bank, true);
  if (noted) return keyed(noted, true);
  if (what === undefined) return null;
  const { said, cut } = nameIn(what, reading.purposes);
  /* A DESCRIPTION OF MORE WORDS THAN A NAME, with nothing in it to cut at, is a sentence, and names nobody surely. */
  if (said === '' || (!cut && tidy(said).split(' ').length > NAME_WORDS)) return null;
  return keyed(said, !cut);
}

/**
 * A NAME SHAPED LIKE A PERSON'S, an initial and a surname as a bank prints a transfer to one: `J OKONKWO`, `S. Marchetti`.
 * Money paid to a person is not paid to an organisation, and the walk never makes a person, so it is left as it is.
 */
const PERSON_SHAPED = /^\p{L}\.?\s+\p{L}[\p{L}'-]+$/u;

/**
 * A payee as an organisation's name: a card processor's prefix gone (`GEIDEA*`, `SQ *`, `PAYMOB-`, `POS`), any word holding a digit gone,
 * a place or a country on the end gone where the bank's key leaves it out too, and a name the bank wrote in capitals said
 * in title case: `GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB` is `Bridge St Coffee`, and `PELL & VINE` is `Pell & Vine`.
 */
export function tidy(said: string): string {
  const key = keyOf('bank', said);
  const words = said
    .normalize('NFKC')
    .trim()
    .replace(/^[\p{L}\p{N} ]{1,12}\*\s*/u, '')
    .replace(PROCESSOR_PREFIX, '')
    .split(/\s+/u)
    .filter((w) => w !== '' && !/\d/u.test(w))
    /* A WEB ADDRESS IS ITS NAME: `ORCHARD.COM/BILL` is Orchard. */
    .map((w) => w.replace(/^([\p{L}\p{N}-]{2,})\.(?:com|net|org|io|co|app|ai|eg)(?:\.[a-z]{2})?(?:\/\S*)?$/iu, '$1'));
  /* WHAT THE KEY DROPS FROM THE END, THE NAME DROPS: the bank's folding knows its places, and a name is not one. */
  while (words.length > 1 && key !== null && keyOf('bank', words.slice(0, -1).join(' ')) === key) words.pop();
  if (words.length > 1 && /^\p{Lu}{2}$/u.test(words.at(-1)!)) words.pop();
  const name = words.join(' ').replace(/[\s,.;:*#-]+$/u, '').trim();
  return /\p{Ll}/u.test(name) ? name : name.toLowerCase().replace(/(^|[\s&/(-])(\p{L})/gu, (_, before: string, first: string) => `${before}${first.toUpperCase()}`);
}

/**
 * The key a payee's name has one word shorter: its words with the last that changes its key left off, so `SWIFTCAB RIDE
 * 2210` is `bank:swiftcab` and `Edgewall, Inc.` is `bank:edgewall`. `null` for a one-word payee, and for one whose
 * shorter words only say what kind of shop it is (`CAFE NERO`, never under `CAFE`).
 */
function shorterKey(said: string, key: string): string | null {
  const words = said.trim().split(/\s+/u);
  for (let n = words.length - 1; n >= 1; n--) {
    const shorter = keyOf('bank', words.slice(0, n).join(' '));
    if (shorter !== key) return shorter === null || onlyAKind(words.slice(0, n).join(' ')) ? null : shorter;
  }
  return null;
}

/**
 * THE WORDS A LEDGER DESCRIBES ITS OWN LINES BY, lower case, read off its declaration and never written here: the titles
 * of the list its `category` field points at, and the values and labels of every choice it declares (a category, a
 * kind, a direction). `purposes` are the ones that are a single word, which cut a description that starts with one;
 * `about` is every word of every one of them, and a payee made only of those words is the line describing itself and
 * names nobody: "SALARY OCTOBER" on a ledger with a Salary kind, or "UTILITIES" under "Rent and utilities".
 */
function purposesOf(sql: Sql, lists: Lists, ledger: Ledger): Pick<Reading, 'purposes' | 'about'> {
  const purposes = new Set<string>();
  const about = new Set<string>();
  const add = (said: string | undefined): void => {
    const whole = said?.trim().toLowerCase() ?? '';
    if (/^\p{L}+$/u.test(whole)) purposes.add(whole);
    for (const word of whole.split(/[^\p{L}]+/u)) if (word.length > 1) about.add(word);
  };
  const decl = lists.find((l) => l.id === ledger.register);
  for (const field of live(decl?.fields ?? [])) {
    if (field.type !== 'enum') continue;
    const choice = field as { values?: readonly string[]; labels?: Readonly<Record<string, string>> };
    for (const v of choice.values ?? []) add(v);
    for (const v of Object.values(choice.labels ?? {})) add(v);
  }
  const field = ledger.category === undefined ? undefined : decl?.fields.find((f) => f.id === ledger.category);
  if (field?.type === 'ref' && field.to !== undefined) {
    const to = lists.find((l) => l.id === field.to);
    if (to) for (const row of allRows(sql, to.id)) add(textOf(row.fields[to.title]));
  }
  return { purposes, about };
}

function ledgerSlice(
  deps: BackfillDeps,
  lists: Lists,
  limit: number,
  after: string,
  suggest: (s: BackfillSuggestion) => void,
  ask: (a: HeldAsk) => void,
): Backfilled['ledger'] {
  const none = { ...idle(), organisations: 0 };
  const orgRoleOf = orgRole(lists as unknown as RoleList[]);
  const peopleRole = meetsRole(lists as unknown as RoleList[]);
  if (orgRoleOf === null || orgRoleOf.register === peopleRole?.register) return none;
  const orgs = { register: orgRoleOf.register, at: orgRoleOf.fields };
  const ledgers = ledgersOf(lists, orgs.register, peopleRole?.register);
  if (ledgers.length === 0) return none;
  const { sql } = deps;

  /* WHO IS A PERSON: everybody People holds, by their name and every other name they go by, and by the key their name
     folds to as a bank would print it. A payee that is one of them is never made an organisation. */
  const people = new Set<string>();
  if (peopleRole) {
    const { name, aliases } = peopleRole.fields;
    for (const row of allRows(sql, peopleRole.register))
      for (const said of [textOf(row.fields[name]), ...(aliases === undefined ? [] : listOf(row.fields[aliases]))]) {
        if (said === undefined) continue;
        people.add(nameKey(said));
        const key = keyOf('bank', said);
        if (key !== null) people.add(key);
      }
  }
  const isPerson = (p: Payee): boolean => PERSON_SHAPED.test(tidy(p.said)) || people.has(nameKey(p.said)) || people.has(p.key);

  /* THE ORGANISATIONS BY THE KEY THEIR NAME FOLDS TO, so `Fenwick Cloud` answers to `FENWICK CLOUD` before either was
     ever keyed. Folded rows are left out: their keys already point at the row they were folded into. */
  const byName = new Map<string, string[]>();
  const put = (row: Row): boolean =>
    (orgs.at.merged_into !== undefined && textOf(row.fields[orgs.at.merged_into]) !== undefined) || (orgs.at.retired !== undefined && textOf(row.fields[orgs.at.retired]) !== undefined);
  for (const row of allRows(sql, orgs.register)) {
    /* AND RETIRED ROWS, SINCE People 3.8.0: a shop put away is no name a payee is matched to. */
    if (put(row)) continue;
    const key = keyOf('bank', textOf(row.fields[orgs.at.name]) ?? '');
    if (key !== null) byName.set(key, [...(byName.get(key) ?? []), row.id]);
  }

  /* THE SERVICES BY WHO THEY ARE WITH AND WHAT THEY ARE CALLED: a payee that is a service the record holds is an
     organisation the record already knows of, named for who the service is with as the list spells it. */
  const services = new Map<string, string>();
  for (const list of servicesOf(lists, projectsList(lists)?.id))
    for (const row of allRows(sql, list.register)) {
      const provider = list.provider === undefined ? undefined : textOf(row.fields[list.provider]);
      const title = textOf(row.fields[list.title]);
      for (const said of [provider, title]) {
        const key = said === undefined ? null : keyOf('bank', said);
        if (key !== null && !services.has(key)) services.set(key, provider ?? title!);
      }
    }

  /* HOW EACH LEDGER IS READ: the words its categories are named by, and the payment networks its lines write accounts
     on, read off its own lines, so neither is ever a word of the code's. */
  const readings = new Map<string, Reading>();
  for (const ledger of ledgers)
    readings.set(ledger.register, { ...purposesOf(sql, lists, ledger), rails: railsOf(allRows(sql, ledger.register).flatMap((row) => textsOf(ledger, row.fields))) });
  const readingOf = (ledger: Ledger): Reading => readings.get(ledger.register)!;

  /* HOW MANY LINES NAME EACH PAYEE, over the whole ledger and not the slice, and the spelling a name is made from: the
     first said as a payee, else the first description. And the keys one word shorter each payee's spellings have. */
  /* `whole`: one of its lines says its name whole, where a card text may have cut it on every other (`mayBeCut`). */
  type Seen = { lines: number; sure: boolean; business: boolean; whole: boolean; said: string };
  const seen = new Map<string, Seen>();
  /* THE KEY EACH PAYEE HAD BEFORE ITS SHOP NAME WAS READ BY ITSELF, where it differs: `known` tries it second. */
  const oldKeys = new Map<string, string>();
  const shorter = new Map<string, Set<string>>();
  for (const ledger of ledgers)
    for (const row of allRows(sql, ledger.register)) {
      if (!paid(ledger, row.fields)) continue;
      const p = payeeOf(ledger, row.fields, readingOf(ledger));
      if (p === null || p.moved || (ledger.transfer !== undefined && row.fields[ledger.transfer] === true)) continue;
      const old = legacyBankKey(p.said);
      if (old !== null) oldKeys.set(p.key, old);
      const held = seen.get(p.key);
      seen.set(p.key, {
        lines: (held?.lines ?? 0) + 1,
        sure: (held?.sure ?? false) || p.sure,
        business: (held?.business ?? false) || soundsLikeBusiness(p.said),
        whole: (held?.whole ?? false) || !mayBeCut(p.said),
        said: held === undefined || (p.sure && !held.sure) ? p.said : held.said,
      });
      const less = shorterKey(p.said, p.key);
      if (less !== null) shorter.set(p.key, new Set([...(shorter.get(p.key) ?? []), less]));
    }

  /* THE ORGANISATION A KEY IS, or `null`: the one holding the key, else the one whose name folds to it. `undefined` is a
     payee the record does not know. `named` says it was found by its name and holds no such key yet. */
  type Found = { id: string; named: boolean };
  const known = (key: string): Found | null | undefined => {
    /* UNDER ITS OLD KEY TOO (`legacyBankKey`), when the new one is held by nobody. */
    const holder = holderOf(sql, key) ?? (oldKeys.has(key) ? holderOf(sql, oldKeys.get(key)!) : null);
    if (holder !== null) return holder.register === orgs.register ? { id: holder.id, named: false } : null;
    const named = byName.get(key) ?? [];
    if (named.length > 1) return null;
    return named[0] === undefined ? undefined : { id: named[0], named: true };
  };

  /**
   * THE PAYEE A KEY IS ONE WORD LONGER THAN, when there is exactly one: `bank:amazonprime` is Amazon's when the record
   * holds Amazon or another line names it, and `bank:swiftcabride` is Swiftcab's. Never a person's key, and never a key
   * two organisations answer to. Its own key otherwise.
   */
  const baseOf = new Map<string, string>();
  for (const [key, less] of shorter) {
    const [base] = [...less];
    if (less.size !== 1 || base === undefined || base === key || people.has(base)) continue;
    const found = known(base);
    if (found === null || (found === undefined && !seen.has(base) && !services.has(base))) continue;
    baseOf.set(key, base);
  }
  /* THE COUNTS FOLD INTO THE PAYEE A KEY EXTENDS, so two spellings on one line each are one payee on two. */
  const counted = new Map(seen);
  for (const [key, base] of baseOf) {
    const own = seen.get(key);
    if (!own) continue;
    const into = counted.get(base);
    counted.set(base, into === undefined ? own : { lines: into.lines + own.lines, sure: into.sure || own.sure, business: into.business || own.business, whole: into.whole || own.whole, said: into.said });
  }

  const writes = batcher(deps);
  let looked = 0;
  let wrote = 0;
  let refused = 0;
  let made = 0;
  let last = '';

  /* WHETHER THE WALK, OR A DOOR, MADE AN ORGANISATION FROM A BANK'S OWN WORDS: the only kind that gains a bank key from a
     payee's name. One the person or an agent made is held, and keeps the keys it has. */
  const fromWords = new Map<string, boolean>();
  const madeFromWords = (id: string): boolean => {
    let said = fromWords.get(id);
    if (said === undefined) {
      const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND kind = 'create' ORDER BY rowid LIMIT 1", `entry:${id}`)?.actor;
      said = by !== undefined && /^(?:rule|ingest):/u.test(by);
      fromWords.set(id, said);
    }
    return said;
  };

  /* KEYS AN ORGANISATION MADE FROM THE BANK'S WORDS DID NOT HOLD YET, given in the slice's batch so Undo takes them back. */
  const give = (id: string, keys: readonly string[]): void => {
    if (orgs.at.keys === undefined) return;
    const row = sql.one<{ version: number; fields: string }>('SELECT version, fields FROM entry WHERE id = ?', id);
    if (!row) return;
    const held = listOf((JSON.parse(row.fields) as Record<string, Json>)[orgs.at.keys]);
    const more = keys.filter((k) => !held.includes(k) && holderOf(sql, k) === null);
    if (more.length > 0) deps.write(orgs.register, id, { [orgs.at.keys]: [...held, ...more] }, { ...writes.w(), version: row.version });
  };

  /* A NEW ORGANISATION, carrying the keys it was made for, or `null` when the list cannot keep a key. */
  const make = (keys: readonly string[], name: string, vendor: boolean): string | null => {
    if (orgs.at.keys === undefined || name === '') return null;
    const kind = vendor ? kindValue(lists, orgs.register, orgs.at, 'vendor') : undefined;
    const created = deps.write(
      orgs.register,
      null,
      { [orgs.at.name]: name, [orgs.at.keys]: [...new Set(keys)], ...(kind === undefined ? {} : { [orgs.at.kind!]: kind }) },
      writes.w(),
    );
    if (!created.ok) return null;
    byName.set(keyOf('bank', name) ?? keys[0]!, [created.value.id]);
    fromWords.set(created.value.id, true);
    made++;
    return created.value.id;
  };

  const cut = cutAsk(sql, orgs, ledgers, readingOf, put, madeFromWords);
  if (cut !== null) ask(cut);

  const [startList = '', startId = ''] = after === '' ? [] : splitCursor(after);
  let left = limit;
  for (const ledger of ledgers) {
    if (left === 0) break;
    if (startList !== '' && ledger.register < startList) continue;
    const from = ledger.register === startList ? startId : '';
    const rows = rowsAfter(sql, ledger.register, from, left, "coalesce(json_extract(fields, ?), '') = ''", `$.${ledger.party}`);
    for (const row of rows) {
      looked++;
      left--;
      last = `${ledger.register}/${row.id}`;
      if (ledger.transfer !== undefined && row.fields[ledger.transfer] === true) continue;
      if (!paid(ledger, row.fields)) continue;
      const p = payeeOf(ledger, row.fields, readingOf(ledger));
      if (p === null || isPerson(p)) continue;

      /* BY ITS OWN KEY FIRST, then as the payee it is one word longer than. */
      const base = baseOf.get(p.key);
      let found = known(p.key);
      const extended = found === undefined && base !== undefined;
      if (extended) found = known(base);
      const key = extended ? base : p.key;

      let org: string | null | undefined;
      if (found !== null && found !== undefined) {
        if (madeFromWords(found.id)) give(found.id, [...(found.named ? [key] : []), ...(extended ? [p.key] : [])]);
        else if (extended) {
          /* A HELD ORGANISATION A PAYEE ONLY EXTENDS IS ASKED ABOUT, AND THE LINE LEFT AS IT IS. */
          const held = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', found.id);
          const organisation = { id: found.id, name: (held && textOf((JSON.parse(held.fields) as Record<string, Json>)[orgs.at.name])) ?? 'an organisation' };
          const payee = tidy(p.said);
          const payments = seen.get(p.key)?.lines ?? 1;
          if (payee !== '' && !p.moved)
            ask({ kind: 'organisation-key', key: `organisation-key:${p.key}:${found.id}`, organisation, payee, bank: p.key, payments, question: heldQuestion(payee, payments, organisation.name) });
          continue;
        }
        org = found.id;
      } else if (found === undefined && !p.moved) {
        const service = services.get(key);
        const count = counted.get(key);
        const keys = extended ? [key, p.key] : [key];
        /* A SERVICE'S PROVIDER THE RECORD ALREADY HOLDS AS AN ORGANISATION is that one, and never a second of one name. */
        const same = service === undefined ? [] : (byName.get(keyOf('bank', service) ?? '') ?? []);
        if (same.length === 1) org = same[0]!;
        else if (service !== undefined) org = make(keys, service, true);
        /* A NAME NO LINE SAYS WHOLE MAKES NOTHING AND ASKS NOTHING: a card text cut at its
           field's end named "Orbt Speciali" and "Marke" as shops. The lines keep the bank's words, and are linked once
           the record holds the shop by its key. */
        else if (count !== undefined && count.lines >= PAYEE_SEEN && count.whole) {
          /* A PAYEE SAID AS ONE ON ANY OF ITS LINES, THAT SAYS IT IS A BUSINESS ON ANY OF THEM, IS MADE. One only ever
             cut out of a description, or one that could be a person's name, is a question, named the way the walk
             would have named it. */
          if (count.sure && count.business) org = make(keys, tidy(count.said), false);
          else if (tidy(count.said) !== '') {
            const name = tidy(count.said);
            suggest({ kind: 'organisation', key: `organisation:${key}`, name, payments: count.lines, question: `Is ${name} a company you pay or are paid by? ${count.lines} payments name it.` });
          }
        }
      }
      if (org === null || org === undefined) continue;
      const linked = deps.write(ledger.register, row.id, { [ledger.party]: org }, { ...writes.w(), version: row.version });
      if (linked.ok) wrote++;
      else refused++;
    }
  }
  /* WHERE THE NEXT CALL STARTS: after the last line read while the slice was cut short, and the start once it was not. */
  return { batch: writes.batch(), looked, wrote, refused, next: left === 0 && last !== '' ? last : null, organisations: made };
}

/**
 * THE ONE QUESTION ABOUT SHOPS ALREADY MET BY A NAME A CARD TEXT CUT SHORT (`CutAsk`), or `null` when there are none.
 *
 * A SHOP IS ONE WHEN THE BANK'S WORDS MADE IT AND EVERY LINE LINKED TO IT MAY BE CUT (`mayBeCut`): one a person or an
 * agent made, or one a line names whole, is a shop as it stands. ONE IS FOLDED, NOT RETIRED, where exactly one other
 * shop's whole name begins with its letters, the digits left out: the card's `FAWRY*EXPRESS3 MARKE` is the note's
 * Express Market. Every other is retired, on a list that can say so; on one that cannot, it is not asked about.
 */
function cutAsk(
  sql: Sql,
  orgs: { register: string; at: OrgFields },
  ledgers: readonly Ledger[],
  readingOf: (ledger: Ledger) => Reading,
  put: (row: Row) => boolean,
  madeFromWords: (id: string) => boolean,
): CutAsk | null {
  const said = new Map<string, { cut: boolean; lines: number; stems: Set<string> }>();
  const stemOf = (key: string): string => key.slice(key.indexOf(':') + 1).replace(/\d/gu, '');
  for (const ledger of ledgers)
    for (const row of allRows(sql, ledger.register)) {
      const party = textOf(row.fields[ledger.party]);
      if (party === undefined) continue;
      const p = payeeOf(ledger, row.fields, readingOf(ledger));
      const held = said.get(party) ?? { cut: true, lines: 0, stems: new Set<string>() };
      held.lines += 1;
      if (p === null || !mayBeCut(p.said)) held.cut = false;
      else held.stems.add(stemOf(p.key));
      said.set(party, held);
    }
  const live = allRows(sql, orgs.register).filter((row) => !put(row));
  const nameOf = (row: Row): string => textOf(row.fields[orgs.at.name]) ?? 'a shop';
  const isCut = (row: Row): boolean => said.get(row.id)?.cut === true && madeFromWords(row.id);
  const whole = live.filter((row) => !isCut(row)).map((row) => ({ row, stem: stemOf(keyOf('bank', nameOf(row)) ?? ':') }));
  const asked: CutAsk['shops'] = [];
  let payments = 0;
  for (const row of live.filter(isCut)) {
    const stems = [...said.get(row.id)!.stems].filter((s) => s.length >= 3);
    const into = whole.filter((w) => w.stem !== '' && stems.some((s) => w.stem.startsWith(s) && w.stem !== s));
    if (into.length !== 1 && orgs.at.retired === undefined) continue;
    asked.push({ organisation: { id: row.id, name: nameOf(row), version: row.version }, into: into.length === 1 ? { id: into[0]!.row.id, name: nameOf(into[0]!.row) } : null });
    payments += said.get(row.id)!.lines;
  }
  if (asked.length === 0) return null;
  const and = (xs: readonly string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''));
  const folds = asked.filter((a) => a.into !== null).map((a) => `${a.organisation.name} into ${a.into!.name}`);
  const retired = asked.filter((a) => a.into === null).map((a) => a.organisation.name);
  const what =
    folds.length > 0 && retired.length > 0
      ? `Fold ${and(folds)}, and retire ${retired.length === 1 ? retired[0] : `the other ${retired.length}`}`
      : folds.length > 0
        ? `Fold ${and(folds)}`
        : `Retire ${asked.length === 1 ? 'it' : 'them'}`;
  const shops = asked.length === 1 ? `${asked[0]!.organisation.name} is a name a card text cut short` : `${asked.length} shops are names a card text cut short: ${and(asked.map((a) => a.organisation.name))}`;
  return {
    kind: 'cut-shops',
    key: `cut-shops:${asked.map((a) => a.organisation.id).sort().join(',')}`,
    shops: asked,
    payments,
    question: `${shops}. ${what}? Their payments keep the bank's words, and nothing is deleted.`,
  };
}

/** A ledger cursor, `register/id`. */
const splitCursor = (cursor: string): [string, string] => {
  const at = cursor.indexOf('/');
  return at < 0 ? [cursor, ''] : [cursor.slice(0, at), cursor.slice(at + 1)];
};

/** The value the organisations' `kind` takes for `said`, when the list has the field and it takes that value. */
function kindValue(lists: Lists, register: string, at: OrgFields, said: string): string | undefined {
  if (at.kind === undefined) return undefined;
  const field = lists.find((l) => l.id === register)?.fields.find((f) => f.id === at.kind && !f.retired);
  if (!field) return undefined;
  if (field.type === 'enum') return (field as { values?: readonly string[] }).values?.includes(said) ? said : undefined;
  return field.type === 'text' ? said : undefined;
}

/* ── the projects, as a run and a service are matched to them ────────── */

/** The projects, read whole. `domain` is the field a project keeps its domains in, a list or one text, when it has one. */
type ProjectsList = {
  id: string;
  title: string;
  candidates: Candidate[];
  names: Map<string, string>;
  domains: Map<string, string[]>;
  domain: { id: string; many: boolean } | undefined;
};

/** The one list declaring `scopes:`, as `scope.ts` reads it. */
function projectsList(lists: Lists): RegisterDecl | undefined {
  const holders = lists.filter((l) => l.scopes !== undefined);
  return holders.length === 1 ? holders[0] : undefined;
}

/** The projects, read whole: each as `matchProject` takes it, its name, and the domains it lives at. */
function projectsOf(sql: Sql, lists: Lists): ProjectsList | null {
  const home = projectsList(lists);
  if (!home?.scopes) return null;
  const { repos, folders } = home.scopes;
  const said = home.seq_prefix && home.seq_prefix !== '#' ? home.seq_prefix : `${home.id}#`;
  const domainDecl = live(home.fields).find((f) => (f.id === 'domains' && f.type === 'list') || (f.id === 'domain' && f.type === 'text'));
  const domainField = domainDecl?.id;
  const rows = sql
    .all<{ id: string; seq: number; fields: string }>(
      'SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL ORDER BY seq',
      home.id,
    )
    .map((r) => ({ ...r, fields: JSON.parse(r.fields) as Record<string, Json> }));
  const names = new Map<string, string>();
  const domains = new Map<string, string[]>();
  const candidates = rows.map((row) => {
    names.set(row.id, textOf(row.fields[home.title]) ?? 'a project');
    if (domainField !== undefined) {
      const held = row.fields[domainField];
      const said = typeof held === 'string' ? [held] : listOf(held);
      domains.set(row.id, said.map((d) => registrable(d.replace(/^\*\./u, ''))).filter((d): d is string => d !== null));
    }
    /* A FOLDER LISTED AMONG THE REPOSITORIES IS A FOLDER, as `scope.ts` reads one (`candidateOf`). */
    return candidateOf(row.id, `${said}${row.seq}`, repos === undefined ? [] : listOf(row.fields[repos]), folders === undefined ? [] : listOf(row.fields[folders]));
  });
  const domain = domainDecl === undefined ? undefined : { id: domainDecl.id, many: domainDecl.type === 'list' };
  return { id: home.id, title: home.title, candidates, names, domains, domain };
}

const named = (projects: ProjectsList, ids: readonly string[]): Named[] => ids.map((id) => ({ id, name: projects.names.get(id) ?? 'a project' }));

/** A list of names as a sentence says them: `Kiln`, `Kiln or Portage`, `Kiln, Marlow or Portage`. */
const orList = (names: readonly string[]): string => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);

/* ── 2. runs with no project ─────────────────────────────────────────── */

/** The last name of a place, as it was written, with no `.git`: `Lanternfish_PREPROD`. */
const lastSpelled = (said: string): string =>
  said.trim().replace(/[\\/]+$/u, '').replace(/\.git$/iu, '').split(/[\\/:]+/u).filter((part) => part !== '').at(-1) ?? '';

const runQuestion = (place: string, runs: number, projects: readonly Named[]): string =>
  `${runs === 1 ? 'A run' : `${runs} runs`} worked in ${place}. Is that ${orList(projects.map((p) => p.name))}?`;

/** What a question about the runs under one owner is kept by, before the owner and the project. */
const OWNER_KEY = 'run-project:owner:';

const ownerQuestion = (owner: string, runs: number, projects: readonly Named[]): string =>
  `${runs === 1 ? `A run worked in a ${owner} repository` : `${runs} runs worked in ${owner} repositories`}. Is that ${orList(projects.map((p) => p.name))}?`;

/** A remote's host and owner, `github.com/oxbowgame`, and the owner as it was written, `OxbowGame`; `null` for a remote with no owner. */
function ownerOf(remote: string): { key: string; spelled: string } | null {
  const key = remoteKey(remote).split('/');
  if (key.length < 3) return null;
  /* AS WRITTEN: the part before the repository's own name, after a host and any `:` or scheme. */
  const parts = remote.trim().replace(/\.git$/iu, '').replace(/[\\/]+$/u, '').split(/[\\/:]+/u).filter((x) => x !== '');
  return { key: `${key[0]}/${key[1]}`, spelled: parts.at(-2) ?? key[1]! };
}

/** Where a run worked, whole, as one key: its remote, or the folder it ran in when it has none. As the record answers a question by. */
const whereKey = (where: Whereabouts): string | null =>
  (where.remote === undefined ? null : keyOf('remote', where.remote)) ?? (where.cwd === undefined ? null : keyOf('folder', where.cwd));

/** A folder as `scope.ts` compares one: forward slashes, a drive letter in lower case, and no trailing slash. */
const pathOf = (said: string): string =>
  said.trim().replace(/\\/gu, '/').replace(/^([A-Za-z]):/u, (_, drive: string) => `${drive.toLowerCase()}:`).replace(/\/+$/u, '');

/** Whether `inner` is `outer` or inside it, both as `folderOf` leaves them. */
const within = (inner: string, outer: string): boolean => inner === outer || inner.startsWith(`${outer}/`);

/** The home folder a run's own folder is under, `/Users/sam` or `c:/Users/sam`, which a project's `~/` stands for. */
const homeOf = (cwd: string): string | null => /^(?:\/(?:Users|home)\/[^/]+|[a-z]:\/Users\/[^/]+)(?=\/|$)/iu.exec(cwd)?.[0] ?? null;

/**
 * A folder as the walk compares one: `pathOf`'s, with a leading `~` read as `home` (a project listing `~/Developer/kiln`
 * holds the run in `/Users/sam/Developer/kiln`), and in lower case where the machine ignores case: a drive-letter path,
 * as Windows does, and a Mac's own folders (`/Users`, `/Volumes`), whose disk ignores it too, so `~/developer/Kiln` is
 * the folder a run in `/Users/sam/Developer/kiln` worked in. A `~` with no home to read it by stays as written, and
 * matches nothing.
 */
const folderOf = (said: string, home: string | null): string => {
  const path = pathOf(said);
  const homed = home !== null && /^~(?=\/|$)/u.test(path) ? `${home}${path.slice(1)}` : path;
  return /^(?:[a-z]:|\/(?:users|volumes)(?:\/|$))/iu.test(homed) ? homed.toLowerCase() : homed;
};

/**
 * WHERE A RUN IS SURELY IN, or the projects it may be in, by id, for the person to say.
 *
 * Only two places are sure. A remote a project lists, compared whole, is the repository itself.
 * A folder a project lists is sure only when the run worked in that very folder, or the project also lists the run's
 * own repository by its name or its remote, and in neither case when the run's repository is another project's: a
 * project listing `~/Developer` would otherwise claim every checkout under it, the ones no project knows included. A run
 * further down a folder is a question about it ("A run worked in web. Is that Kiln?"), and one under a folder holding
 * another project's guesses by what else its place says. A bare name a project lists (`portage`) is only a name, which
 * any fork or any other `app` shares, and a last name is a guess, so both are questions.
 */
function placedFor(listed: readonly Candidate[], said: Whereabouts): { sure: Candidate | null; guess: string[]; fallback?: true } {
  /* EVERY FOLDER READ ONCE, `~` AND CASE AS THE RUN'S MACHINE READS THEM, before anything compares one. */
  const home = said.cwd === undefined ? null : homeOf(pathOf(said.cwd));
  const projects = listed.map((c) => ({ ...c, folders: c.folders.map((f) => folderOf(f, home)) }));
  const where = said.cwd === undefined ? said : { ...said, cwd: folderOf(said.cwd, home) };
  const found = matchProject(projects, where);
  const byId = new Map(listed.map((c) => [c.id, c]));
  const bySpoken = new Map(projects.map((c) => [c.spoken, c.id]));
  const ids = (spoken: readonly string[]): string[] => spoken.map((s) => bySpoken.get(s)).filter((id): id is string => id !== undefined);
  const hit = found.project === null ? undefined : byId.get(found.project.id);
  if (!hit || !found.project) return { sure: null, guess: ids(found.ambiguous) };
  if (found.project.how === 'remote') return { sure: hit, guess: [] };
  if (found.project.how === 'repo') return { sure: null, guess: [hit.id] };

  const cwd = where.cwd ?? '';
  const mine = projects.find((c) => c.id === hit.id)!.folders;
  const folder = mine.filter((f) => within(cwd, f)).sort((a, b) => b.length - a.length)[0] ?? cwd;
  /* A FOLDER HOLDING ANOTHER PROJECT'S is a parent of projects, `~/Developer`, and says nothing about which one. */
  const broad = projects.some((c) => c.id !== hit.id && c.folders.some((p) => p !== folder && within(p, folder)));
  if (broad) {
    /* SO THE GUESS IS WHAT THE RUN'S PLACE SAYS WITH THAT FOLDER SET ASIDE: a name its repository or a folder up its
       path shares with a project, as `matchProject` guesses one. "Is coinfish Coinfish?", never "Is coinfish
       Workshop?"; the broad project is asked about only when nothing else is a guess. */
    const aside = matchProject(projects.map((c) => (c.id === hit.id ? { ...c, folders: c.folders.filter((f) => f !== folder) } : c)), where);
    const others = [...(aside.project ? [aside.project.id] : []), ...ids(aside.ambiguous)];
    return others.length > 0 ? { sure: null, guess: [...new Set(others)] } : { sure: null, guess: [hit.id], fallback: true };
  }
  /* THE RUN'S OWN REPOSITORY, BY ITS REMOTE OR ITS NAME, as the projects say it without their folders. */
  const own = matchProject(projects.map((c) => ({ ...c, folders: [] })), { remote: where.remote, repo: where.repo });
  const named = [...(own.project ? [own.project.id] : []), ...ids(own.ambiguous)].filter((id) => id !== hit.id);
  /* A NARROW FOLDER ITS REPOSITORY CONTRADICTS IS A CHOICE between the two. */
  if (named.length > 0) return { sure: null, guess: [...new Set([hit.id, ...named])] };
  /* SURE ONLY IN THE FOLDER ITSELF, or where the project names the run's repository too. */
  return cwd === folder || own.project?.id === hit.id ? { sure: hit, guess: [] } : { sure: null, guess: [hit.id] };
}

/**
 * WHICH PROJECT HOLDS THE REPOSITORIES UNDER EACH OWNER ON A HOST, as `github.com/oxbowgame`: by a remote a project lists,
 * by a run already placed in one, and by the one remote runs have worked in under a bare name a project lists, which is
 * how the owner's projects mostly name their repositories. An owner whose repositories two projects hold (a person's own
 * account, as `kasdev` is) settles nothing.
 */
function ownersOf(sql: Sql, projects: ProjectsList): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const hold = (remote: string, project: string): void => {
    const owner = ownerOf(remote);
    if (owner !== null) out.set(owner.key, new Set([...(out.get(owner.key) ?? []), project]));
  };
  const bySpoken = new Map(projects.candidates.map((c) => [c.spoken, c.id]));
  const remotes = new Map<string, Set<string>>();
  for (const r of sql.all<{ remote: string | null; project: string | null }>(
    `SELECT json_extract(fields, '$.remote') AS remote, json_extract(fields, '$.project') AS project FROM entry
      WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.remote') IS NOT NULL`,
    SESSION,
  )) {
    if (typeof r.remote !== 'string' || r.remote.trim() === '') continue;
    const placed = typeof r.project === 'string' ? (bySpoken.get(r.project) ?? (projects.names.has(r.project) ? r.project : undefined)) : undefined;
    if (placed !== undefined) hold(r.remote, placed);
    const name = lastSpelled(remoteKey(r.remote)).toLowerCase();
    remotes.set(name, new Set([...(remotes.get(name) ?? []), remoteKey(r.remote)]));
  }
  for (const c of projects.candidates)
    for (const repo of c.repos) {
      if (/[\\/:]/u.test(repo)) hold(repo, c.id);
      else {
        const seen = remotes.get(repo.trim().replace(/\.git$/iu, '').toLowerCase());
        if (seen?.size === 1) hold([...seen][0]!, c.id);
      }
    }
  return out;
}

/**
 * A place as a person tells it from another of its name: a remote by its owner, `acme/Lantern`, and a folder by the one
 * it sits in, `lantern in Code`. Never a host or a path. `undefined` when the place says nothing more than its name.
 */
function placeAt(where: Whereabouts, place: string): string | undefined {
  if (where.remote !== undefined) {
    const owner = ownerOf(where.remote);
    return owner === null ? undefined : `${owner.spelled}/${lastSpelled(where.remote)}`;
  }
  if (where.cwd === undefined) return undefined;
  const parts = pathOf(where.cwd).split('/').filter((p) => p !== '' && !/^[a-z]:$/iu.test(p));
  const at = parts.findLastIndex((p) => p.toLowerCase() === place.toLowerCase());
  const parent = at > 0 ? parts[at - 1] : at === -1 ? parts.at(-1) : undefined;
  return parent === undefined ? undefined : `${place} in ${parent}`;
}

/** A name with case and punctuation folded away: `Brain-Dog`, `braindog` and `BrainDog` are one. */
const folded = (said: string): string => said.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The one project whose name, or a bare repository it lists, the run's own folder is called, case and punctuation
 * folded and a name's domain ending left off (`namedAs`); `null` when the run says a remote or a repository name of
 * another spelling, or when none or two match. The ladder asks the same of a working run (`folderNamed` in `scope.ts`).
 */
function exactFolder(projects: ProjectsList, where: Whereabouts): Candidate | null {
  if (where.remote !== undefined || where.cwd === undefined) return null;
  const last = folded(lastSpelled(where.cwd));
  if (last === '' || (where.repo !== undefined && folded(where.repo) !== last)) return null;
  const hits = projects.candidates.filter(
    (c) => namedAs(projects.names.get(c.id) ?? '').includes(last) || c.repos.some((r) => !/[\\/:]/u.test(r.trim()) && folded(r.replace(/\.git$/iu, '')) === last),
  );
  return hits.length === 1 ? hits[0]! : null;
}

function runsSlice(deps: BackfillDeps, lists: Lists, limit: number, after: string, suggest: (s: BackfillSuggestion, long?: string) => void): Slice {
  const { sql } = deps;
  const projects = projectsOf(sql, lists);
  if (!projects || projects.candidates.length === 0 || !lists.some((l) => l.id === SESSION)) return idle();
  const owners = ownersOf(sql, projects);
  const now = deps.clock.now();
  const writes = batcher(deps);
  let wrote = 0;
  let refused = 0;

  const rows = rowsAfter(
    sql,
    SESSION,
    after,
    limit,
    `coalesce(json_extract(fields, '$.project'), '') = ''
      AND (json_extract(fields, '$.remote') IS NOT NULL OR json_extract(fields, '$.repo') IS NOT NULL OR json_extract(fields, '$.cwd') IS NOT NULL)`,
  );
  for (const row of rows) {
    /* A RUN STILL WORKING IS THE LADDER'S, which places it on its next call; writing it here would make its next edit
       of its own row a conflict. */
    if (!isStale(row, now)) continue;
    const where = { remote: textOf(row.fields.remote), repo: textOf(row.fields.repo), cwd: textOf(row.fields.cwd) };
    const { sure, guess: ids, fallback } = placedFor(projects.candidates, where);
    if (sure) {
      const placed = deps.write(SESSION, row.id, {}, { ...writes.w(), version: row.version, stamp: { project: sure.spoken } });
      if (placed.ok) wrote++;
      else refused++;
      continue;
    }
    /* A FOLDER CALLED EXACTLY WHAT ONE PROJECT IS CALLED, or a bare repository it lists, is that project's, and no
       operator should be asked "Is braindog BrainDog?". Only for a run with no remote and no other
       repository name, which is where `sam/lantern` and somebody else's `lantern` would part; case and punctuation
       folded, never a part of a name ("brain" beside "The Studio Brain" still asks). */
    const exact = exactFolder(projects, where);
    if (exact !== null && (ids.length === 0 || (ids.length === 1 && ids[0] === exact.id))) {
      const placed = deps.write(SESSION, row.id, {}, { ...writes.w(), version: row.version, stamp: { project: exact.spoken } });
      if (placed.ok) wrote++;
      else refused++;
      continue;
    }
    /* A RUN AN IMPORT WROTE, which never said when it was last seen, is history, never a question for him. */
    if (textOf(row.fields.last_seen) === undefined) continue;
    const at = whereKey(where);
    const wheres = at === null ? [] : [at];
    /* A PLACE THAT GUESSES NOTHING BETTER THAN A BROAD FOLDER, in a repository whose owner's repositories one project
       holds, is that project's question, one for the owner however many of its repositories the runs worked in. */
    const owner = (ids.length === 0 || fallback) && where.remote !== undefined ? ownerOf(where.remote) : null;
    const held = owner === null ? undefined : owners.get(owner.key);
    if (owner !== null && held?.size === 1) {
      const these = named(projects, [...held]);
      suggest({ kind: 'run-project', key: `${OWNER_KEY}${owner.key}:${these[0]!.id}`, place: owner.spelled, runs: 1, projects: these, question: ownerQuestion(owner.spelled, 1, these), wheres });
      continue;
    }
    if (ids.length === 0) continue;
    /* THE PLACE AS A PERSON SAYS IT: the repository's name, never its host or a folder's path. One question for each
       WHOLE place and guess, however many runs worked there, a single guess included: kept by the remote, else the
       folder, and never by the last name alone, which `sam/lantern` shares with every other `lantern`.
       A run that says only a bare name is kept by it, and the record files no question that places nothing. */
    const place = where.repo ?? (where.remote ? lastSpelled(where.remote) : lastSpelled(where.cwd ?? ''));
    if (place === '') continue;
    const key = `run-project:${at ?? place.toLowerCase()}:${[...ids].sort().join(',')}`;
    const these = named(projects, ids);
    suggest({ kind: 'run-project', key, place, runs: 1, projects: these, question: runQuestion(place, 1, these), wheres }, placeAt(where, place));
  }
  return { batch: writes.batch(), looked: rows.length, wrote, refused, next: rows.length === limit ? rows.at(-1)!.id : null };
}

/* ── 3. services with no project ─────────────────────────────────────── */

/** A list of things the record pays to keep running: a `ref` to the projects, and who it is with or where it points. */
type Services = { register: string; title: string; project: string; provider: string | undefined; hosts: string[] };

const HOST_FIELDS = ['points_at', 'host', 'url', 'domain'];

function servicesOf(lists: Lists, projects: string | undefined): Services[] {
  if (projects === undefined) return [];
  const out: Services[] = [];
  for (const decl of lists) {
    if (decl.id === projects || decl.id === SESSION || decl.series) continue;
    const fields = live(decl.fields);
    const ref = fields.find((f) => f.type === 'ref' && f.to === projects);
    const has = (id: string): boolean => fields.some((f) => f.id === id && f.type === 'text');
    const hosts = HOST_FIELDS.filter(has);
    if (!ref || (!has('provider') && hosts.length === 0) || !has(decl.title)) continue;
    out.push({ register: decl.id, title: decl.title, project: ref.id, provider: has('provider') ? 'provider' : undefined, hosts });
  }
  return out.sort((a, b) => a.register.localeCompare(b.register));
}

/** The first label of a registrable domain, the name it spells on the web: `teetime` of `teetime.com`, `oxbow` of `oxbow.gg`. */
const labelOf = (domain: string): string => domain.split('.')[0] ?? '';

function servicesSlice(deps: BackfillDeps, lists: Lists, limit: number, after: string, suggest: (s: BackfillSuggestion) => void): Slice {
  const { sql } = deps;
  const projects = projectsOf(sql, lists);
  const all = servicesOf(lists, projects?.id);
  if (!projects || all.length === 0) return idle();
  /* A NAME IS COMPARED BY ITS LETTERS AND DIGITS, so the domain `fern.ly` is the project Fernly and `otters.gg` is Otters.gg,
     as the owner's own links say: a domain is how a project spells its name on the web. AND A PROJECT NAMED AS A DOMAIN
     IS ITS NAME WITHOUT THE ENDING TOO, so `Oxbow.gg` answers to `oxbow`, the first word of "oxbow VM", and `teetime.com`'s
     label answers to Tee Time. */
  const fold = (said: string): string => nameKey(said).replace(/[\s'.-]+/gu, '');
  const byName = new Map<string, string[]>();
  const named_ = (said: string, id: string): void => {
    const at = fold(said);
    if (at !== '' && !(byName.get(at) ?? []).includes(id)) byName.set(at, [...(byName.get(at) ?? []), id]);
  };
  for (const [id, name] of projects.names) {
    named_(name, id);
    const domain = /\.[\p{L}]{2,}$/u.test(name.trim()) ? registrable(name) : null;
    if (domain !== null) named_(labelOf(domain), id);
  }
  const byDomain = new Map<string, string[]>();
  for (const [id, domains] of projects.domains) for (const d of new Set(domains)) byDomain.set(d, [...(byDomain.get(d) ?? []), id]);

  const writes = batcher(deps);
  let looked = 0;
  let wrote = 0;
  let refused = 0;
  let last = '';
  let left = limit;
  const [startList = '', startId = ''] = after === '' ? [] : splitCursor(after);
  for (const list of all) {
    if (left === 0) break;
    if (startList !== '' && list.register < startList) continue;
    const rows = rowsAfter(sql, list.register, list.register === startList ? startId : '', left, "coalesce(json_extract(fields, ?), '') = ''", `$.${list.project}`);
    for (const row of rows) {
      looked++;
      left--;
      last = `${list.register}/${row.id}`;
      const name = textOf(row.fields[list.title]);
      const hosts = [...new Set([name, ...list.hosts.map((h) => textOf(row.fields[h]))]
        .filter((h): h is string => h !== undefined)
        .map((h) => registrable(h.replace(/^\*\./u, '')))
        .filter((d): d is string => d !== null))];
      /* THE NAMES IT ANSWERS TO: its own, its first word, and the label of each domain it is or points at. */
      const said = [...new Set([...(name === undefined ? [] : [name, name.trim().split(/\s+/u)[0] ?? '']), ...hosts.map(labelOf)].map(fold).filter((n) => n !== ''))];
      const hits = new Set([...said.flatMap((n) => byName.get(n) ?? []), ...hosts.flatMap((d) => byDomain.get(d) ?? [])]);
      if (hits.size === 0) continue;
      if (hits.size > 1) {
        const these = named(projects, [...hits]);
        const service = { id: row.id, name: name ?? 'A service' };
        suggest({ kind: 'service-project', key: `service-project:${row.id}`, service, projects: these, question: `Which project is ${service.name} for: ${orList(these.map((p) => p.name))}?` });
        continue;
      }
      const project = [...hits][0]!;
      const linked = deps.write(list.register, row.id, { [list.project]: project }, { ...writes.w(), version: row.version });
      if (linked.ok) wrote++;
      else refused++;
      /* ONLY A DOMAIN THAT SPELLS THE PROJECT'S NAME is the project's: "oxbow analytics" at `plausible.io` is Oxbow.gg's
         service, and `plausible.io` is somebody else's. */
      if (linked.ok) addDomains(deps, projects, project, hosts.filter((d) => (byName.get(fold(labelOf(d))) ?? []).includes(project)), writes.w);
    }
  }
  return { batch: writes.batch(), looked, wrote, refused, next: left === 0 && last !== '' ? last : null };
}

/**
 * A LINKED SERVICE'S DOMAINS GO ON ITS PROJECT, so mail from them is matched to it from then on: in the slice's batch, so
 * Undo takes them off with the link. Only a domain no row already holds as a key, and only into a field with room: a
 * list gains it, and a single domain field only when empty.
 */
function addDomains(deps: BackfillDeps, projects: ProjectsList, project: string, hosts: readonly string[], w: () => WriteContext): void {
  const field = projects.domain;
  if (field === undefined || hosts.length === 0) return;
  const row = deps.sql.one<{ version: number; fields: string }>('SELECT version, fields FROM entry WHERE id = ? AND deleted_at IS NULL', project);
  if (!row) return;
  const fields = JSON.parse(row.fields) as Record<string, Json>;
  const held = field.many ? listOf(fields[field.id]) : (textOf(fields[field.id]) === undefined ? [] : [textOf(fields[field.id])!]);
  const has = new Set(held.map((d) => registrable(d.replace(/^\*\./u, ''))).filter((d): d is string => d !== null));
  const more = hosts.filter((d) => !has.has(d) && holderOf(deps.sql, `domain:${d}`) === null);
  if (more.length === 0 || (!field.many && held.length > 0)) return;
  const out = deps.write(projects.id, project, { [field.id]: field.many ? [...held, ...more] : more[0]! }, { ...w(), version: row.version });
  if (out.ok) projects.domains.set(project, [...(projects.domains.get(project) ?? []), ...(field.many ? more : [more[0]!])]);
}

/* ── 4. projects whose repositories are bare names ───────────────────── */

/**
 * For each bare repository name a project lists, the one remote runs have worked in under that name, as a suggestion
 * to list it. A name two remotes share, or a remote another project already lists, is no suggestion: which one is the
 * person's to say, and a project the record already places by it needs nothing.
 */
function remoteSuggestions(sql: Sql, lists: Lists): BackfillSuggestion[] {
  const projects = projectsOf(sql, lists);
  if (!projects || !lists.some((l) => l.id === SESSION)) return [];
  const seen = new Map<string, { spelled: string; at: string; runs: number }>();
  for (const r of sql.all<{ remote: string; at: string }>(
    `SELECT json_extract(fields, '$.remote') AS remote, created_at AS at FROM entry
      WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.remote') IS NOT NULL ORDER BY created_at`,
    SESSION,
  )) {
    if (typeof r.remote !== 'string' || r.remote.trim() === '') continue;
    const key = remoteKey(r.remote);
    if (key.split('/').length < 3) continue;
    const held = seen.get(key);
    seen.set(key, { spelled: r.remote.trim(), at: r.at, runs: (held?.runs ?? 0) + 1 });
  }
  const listed = new Set(projects.candidates.flatMap((c) => c.repos.filter((r) => /[\\/:]/u.test(r)).map(remoteKey)));
  const out: BackfillSuggestion[] = [];
  for (const project of projects.candidates)
    for (const repo of project.repos) {
      const bare = repo.trim().replace(/\.git$/iu, '');
      if (bare === '' || /[\\/:]/u.test(bare)) continue;
      const hits = [...seen].filter(([key]) => lastSpelled(key).toLowerCase() === bare.toLowerCase() && !listed.has(key));
      if (hits.length !== 1) continue;
      const [key, remote] = hits[0]!;
      const name = projects.names.get(project.id) ?? 'this project';
      out.push({
        kind: 'project-remote',
        key: `project-remote:${project.id}:${key}`,
        project: { id: project.id, name },
        repo: bare,
        remote: remote.spelled,
        runs: remote.runs,
        question: `${remote.runs === 1 ? 'A run' : `${remote.runs} runs`} worked in a repository called ${lastSpelled(remote.spelled)}. Add it to ${name}, so runs there are placed in it?`,
      });
    }
  return out;
}

/* ── undo ────────────────────────────────────────────────────────────── */

/**
 * Put back one batch the walk wrote: every link it made emptied again, every key it gave an organisation taken back,
 * every organisation it made removed, and every run it placed unplaced. In one transaction, as its own batch; a row
 * changed since by anybody else keeps what they changed, a key somebody took off and put back among them.
 *
 * THE BATCH IS MARKED UNDONE ONLY WHEN THIS PUT SOMETHING BACK AND THE RECORD REFUSED NONE OF IT.
 * A line the write path refused is still the walk's, and a later undo tries it again; one somebody changed since is
 * theirs, and stays theirs. A second undo of a batch marked undone puts nothing back.
 */
export function undoBackfill(deps: BackfillDeps, batch: string, by: string): Result<{ undone: number; batch: string | null }> {
  const { sql } = deps;
  if (sql.one('SELECT 1 AS n FROM undone WHERE batch = ?', batch)) return ok({ undone: 0, batch: null });
  const lines = sql.all<{ at: number; kind: string; target: string; field: string | null; from_v: string | null; to_v: string | null }>(
    "SELECT rowid AS at, kind, target, field, from_v, to_v FROM event WHERE batch = ? AND actor = ? AND target LIKE 'entry:%' ORDER BY rowid DESC",
    batch,
    BACKFILL_ACTOR,
  );
  if (lines.length === 0) return no('VALUE_MALFORMED', 'There is nothing from the overnight tidy-up to put back there.', { at: 'batch' });
  return deps.transaction(() => {
    const writes = batcher(deps);
    let undone = 0;
    let refused = 0;
    const row = (id: string): Row | null => {
      const r = sql.one<{ id: string; register: string; version: number; fields: string; updated_at: string }>(
        'SELECT id, register, version, fields, updated_at FROM entry WHERE id = ? AND deleted_at IS NULL',
        id,
      );
      return r ? hydrate(r) : null;
    };
    const put = (r: Row, patch: Patch, stamp?: Record<string, Json>): void => {
      const out = deps.write(r.register, r.id, patch, { ...writes.w(), version: r.version, ...(stamp === undefined ? {} : { stamp }) });
      if (out.ok) undone++;
      else refused++;
    };
    for (const line of lines) {
      const r = row(line.target.slice('entry:'.length));
      if (!r) continue;
      const to = line.to_v === null ? null : (JSON.parse(line.to_v) as Json);
      /* AN ORGANISATION SOMETHING ELSE HAS LINKED SINCE STAYS, since removing it would leave that link naming nothing. */
      if (line.kind === 'create') {
        if (!sql.one("SELECT 1 AS n FROM entry WHERE deleted_at IS NULL AND id <> ? AND instr(fields, ?) > 0 LIMIT 1", r.id, `"${r.id}"`))
          put(r, { deleted_at: instant(deps.clock.now()) });
      } else if (line.kind === 'edit' && r.register === SESSION && (line.field === null || line.field === 'project')) {
        /* A RUN IS UNPLACED AS IT WAS PLACED, by the kernel's stamp, since `project` is no field a patch may name. Its
           placement line names no field, so a run anybody has written to since keeps where it is now. */
        const since = sql.one('SELECT 1 AS n FROM event WHERE target = ? AND rowid > ? AND (batch IS NULL OR batch <> ?) LIMIT 1', line.target, line.at, batch);
        const ours = line.field === null ? !since : JSON.stringify(r.fields.project ?? null) === JSON.stringify(to);
        if (ours && textOf(r.fields.project) !== undefined) put(r, {}, { project: null });
      } else if (line.kind === 'tag' && line.field !== null) {
        /* A KEY SOMEBODY TOOK OFF AND PUT BACK IS THEIRS NOW, though it reads as it did, and so is every key of a field
           somebody wrote whole since: as the general undo reads a tag (`undo.ts`). */
        const said = JSON.stringify(to);
        const theirs = sql
          .all<{ kind: string; from_v: string | null; to_v: string | null }>(
            "SELECT kind, from_v, to_v FROM event WHERE target = ? AND field = ? AND rowid > ? AND (batch IS NULL OR batch <> ?) AND kind <> 'note'",
            line.target,
            line.field,
            line.at,
            batch,
          )
          .some((e) => (e.kind === 'tag' ? e.to_v === said : e.kind === 'untag' ? e.from_v === said : true));
        const held = listOf(r.fields[line.field]);
        if (!theirs && held.includes(String(to))) put(r, { [line.field]: held.filter((k) => k !== String(to)) });
      } else if (line.kind === 'edit' && line.field !== null) {
        /* WHAT THE FIELD HELD BEFORE COMES BACK, not nothing: an organisation found by its name keeps the keys it had
           before the walk gave it one more. */
        const was = line.from_v === null ? null : (JSON.parse(line.from_v) as Json);
        if (JSON.stringify(r.fields[line.field] ?? null) === JSON.stringify(to)) put(r, { [line.field]: was });
      }
    }
    if (undone > 0 && refused === 0)
      sql.exec(
        'INSERT OR IGNORE INTO undone (batch, by_batch, actor, agent, kinds, undone_by, at) VALUES (?, ?, ?, NULL, NULL, ?, ?)',
        batch,
        writes.batch() ?? batch,
        BACKFILL_ACTOR,
        by,
        instant(deps.clock.now()),
      );
    return ok({ undone, batch: writes.batch() });
  });
}

/** The organisations holding any of `keys`, each with the ones it holds: what a caller reads to name a slice's work. */
export const organisationsHolding = (sql: Sql, register: string, keys: readonly string[]): { id: string; keys: string[] }[] => holders(sql, register, keys);
