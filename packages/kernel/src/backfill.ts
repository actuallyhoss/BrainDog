/**
 * Understanding what the record already holds (DIRECTION §38, "automatically populating people and entities"): the
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
 *      or service whose name folds to the same key, and the line is linked. A payee the record does not know yet is made
 *      an organisation only when it says it is a business (`soundsLikeBusiness`): a company suffix, a card processor's
 *      prefix or a web address, or a word only a shop or a supplier is called by. Anything else, a plain "Layla Ahmed"
 *      above all, is a question and never an organisation. A payee on one line alone is left as it is unless the record
 *      already knows it; a payee that is a person, or shaped like one, is never an organisation, nor is the payee of a
 *      line that says it is a transfer, nor a word like "Unknown" that names nobody.
 *   2. A run with no project is placed only when its place is sure (`placedFor`): a remote a project lists, or a folder
 *      a project lists that holds no other project's folder and is not contradicted by the run's own repository. A bare
 *      name, a broad folder like `~/Developer`, or a last name is one question per place and guess. Once, and never a
 *      run already placed, nor one still working, which the ladder places itself.
 *   3. A service with no project is linked when its name or the host it points at matches exactly one project's name
 *      or domain.
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
import { keyOf, registrable } from './identity-keys.ts';
import type { Entry, Patch, RegisterDecl, WriteContext } from './index.ts';
import { COUNTERPARTY } from './ingest.ts';
import { instant } from './migrate.ts';
import { meetsRole, orgRole, type OrgFields, type RoleList } from './roles.ts';
import { matchProject, remoteKey, type Candidate, type Whereabouts } from './scope.ts';
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
  | { kind: 'run-project'; key: string; place: string; runs: number; projects: Named[]; question: string }
  | { kind: 'service-project'; key: string; service: Named; projects: Named[]; question: string }
  | { kind: 'project-remote'; key: string; project: Named; repo: string; remote: string; runs: number; question: string };

export type Backfilled = {
  ledger: Slice & { organisations: number };
  runs: Slice;
  services: Slice;
  suggestions: BackfillSuggestion[];
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
  const suggest = (s: BackfillSuggestion): void => {
    const held = suggestions.get(s.key);
    /* THE SAME QUESTION FROM TWO ROWS IS ONE, counting both. */
    if (held?.kind === 'run-project' && s.kind === 'run-project') suggestions.set(s.key, { ...held, runs: held.runs + s.runs, question: runQuestion(held.place, held.runs + s.runs, held.projects) });
    else if (!held) suggestions.set(s.key, s);
  };

  const ledger = deps.transaction(() => ledgerSlice(deps, lists, limit, opts.after?.ledger ?? '', suggest));
  const runs = deps.transaction(() => runsSlice(deps, lists, limit, opts.after?.runs ?? '', suggest));
  const services = deps.transaction(() => servicesSlice(deps, lists, limit, opts.after?.services ?? '', suggest));
  for (const s of remoteSuggestions(deps.sql, lists)) suggest(s);
  return { ledger, runs, services, suggestions: [...suggestions.values()] };
}

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
type Ledger = { register: string; party: string; title: string | undefined; note: string | undefined; payee: string | undefined; transfer: string | undefined };

function ledgersOf(lists: Lists, orgs: string, people: string | undefined): Ledger[] {
  const out: Ledger[] = [];
  for (const decl of lists) {
    if (decl.id === orgs || decl.id === people || decl.id === SESSION || decl.series) continue;
    const fields = live(decl.fields);
    const refs = fields.filter((f) => f.type === 'ref' && f.to === orgs);
    if (refs.length === 0 || !fields.some((f) => f.type === 'money')) continue;
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
 * A card processor or point of sale before the merchant's name, or the `*` a card text puts between a merchant and what
 * was bought: `GEIDEA*BREEZEWAY`, `PAYMOB-SWIFTCAB`, `POS FRESHBAY 0921`, `RIDEWELL *TRIP`. A bank prints a transfer to a
 * person without one. And a web address, which only a business pays from: `SOWBELL.COM`, `ORCHARD.COM/BILL`.
 */
const MERCHANT_SHAPE = /\*|^(?:pos|paymob|fawry|kashier|paytabs|sumup|paypal|zettle|izettle|sq|tst)\s*[-\s]|[\p{L}\p{N}]\.(?:com|net|org|io|co|app|ai|eg|uk)\b/iu;

/**
 * A processor or point of sale before the merchant's name, as a name leaves it out: `PAYMOB-SWIFTCAB`, `POS FRESHBAY`.
 * Only after a dash, or `POS` and a space: `PAYPAL EUROPE` is PayPal itself, and never a company called Europe.
 */
const PROCESSOR_PREFIX = /^(?:pos\s+|(?:pos|paymob|fawry|kashier|paytabs|sumup|paypal|zettle|izettle|sq|tst)\s*-\s*)(?=\p{L})/iu;

/**
 * Words only a shop or a supplier is called by, or that say what was bought from one: `BELLWETHER COFFEE`, `NILE
 * MARKET`, `XO TELECOM`, `Sahara Spider Hosting`, `RIDEWELL TRIP`, `VODACELL RECHARGE`, `HARBOUR BANK FEES`. Never a word
 * a transfer to a person is printed with (`wire`, `transfer`, `payroll`), which would make a person a business.
 */
const MERCHANT_WORDS = new Set([
  'coffee', 'cafe', 'café', 'restaurant', 'kitchen', 'bakery', 'grill', 'pizza', 'burger', 'market', 'supermarket', 'hypermarket', 'mart',
  'marketplace', 'mktplace', 'store', 'stores', 'shop', 'pharmacy', 'hotel', 'hotels', 'telecom', 'mobile', 'cloud', 'hosting', 'online',
  'bank', 'insurance', 'assurance', 'airlines', 'airways', 'travel', 'motors', 'energy', 'media', 'studio', 'studios', 'labs', 'software',
  'systems', 'digital', 'services', 'developments', 'properties', 'prime', 'trip', 'ride', 'rides', 'recharge', 'subscription', 'premium',
  'fee', 'fees', 'interest', 'payout', 'purchase', 'instalment', 'installment',
]);

/**
 * WHETHER A PAYEE SAYS IT IS A BUSINESS, by its legal form, a merchant's shape, or a merchant's word. A name that says
 * none of them, "LAYLA AHMED" or "Rhea Albany", may be a person paid by transfer, and the walk never decides that a
 * person is a company: it asks.
 */
export function soundsLikeBusiness(said: string): boolean {
  if (MERCHANT_SHAPE.test(said.trim())) return true;
  const words = said.toLowerCase().split(/[\s,]+/u).map((w) => w.replace(/[^\p{L}]/gu, '')).filter((w) => w !== '');
  /* A LEGAL FORM ENDS A NAME, never starts it: `AB OKONKWO` and `AG SMITH` are a person's initials. */
  return words.some((w, i) => (i > 0 && COMPANY_FORMS.has(w)) || MERCHANT_WORDS.has(w));
}

/** "Payee: Amazon." in a note, up to the end of its sentence. */
const PAYEE_NOTE = /\bpayee\s*:\s*(.+?)(?:\.(?=\s|$)|[;\n]|$)/iu;

/**
 * Words that say what a payment was for and not whom it was with: "HALDEN TYPE CO INV 2026-035", "TRANSFER TO TAX
 * RESERVE", "PELL & VINE, HALF THE YEAR-END FEE", "J OKONKWO JUNE SET". A description is cut at the first of them, a month
 * among them, and at its first comma.
 */
const ABOUT_A_PAYMENT =
  /^(?:inv|invoice|ref|reference|transfer|payment|paid|purchase|pos|bill|fee|fees|refund|deposit|salary|wages|to|from|for|card|tax|vat|interest|cash|atm|withdrawal|topup|standing|order|direct|debit|dd|so|rent|payout|subscription|renewal|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/iu;

/** The most words a description may be and still be only a name. */
const NAME_WORDS = 4;

/**
 * WORDS THAT NAME NOBODY, as a bank or an import fills a payee it did not know: "Unknown", "Initial" on an opening
 * balance, "Internet Banking", "IPN inward", "TT". A payee made only of them is no payee. Measured on the owner's ledger,
 * where 11 lines say "Unknown" and 5 "Initial", and each became an organisation.
 */
const NAMES_NOBODY =
  /^(?:unknown|unnamed|initial|opening|balance|misc|miscellaneous|sundry|other|none|na|adjustment|correction|internet|phone|mobile|online|banking|bank|ipn|instapay|tt|pos|purchase|inward|outward|incoming|outgoing|credit|debit|cash|card|payment|transfer)$/iu;

/**
 * A LINE THAT SAYS IT IS A TRANSFER moved money to or from somebody's account: a person ("IPN inward transfer from
 * LAYLA ...", noted "Payee: Layla."), or the person's own. Its payee may be an organisation the record already holds,
 * and is linked to it then, but it never makes one, counts towards one, or asks about one.
 */
const SAYS_TRANSFER = /\b(?:transfers?|trf|xfer)\b/iu;

/** The name at the start of a description, and whether anything after it was cut off. */
function nameIn(what: string): { said: string; cut: boolean } {
  const first = what.split(/[:,;(]/u)[0] ?? '';
  const words = first.trim().split(/\s+/u).filter((w) => w !== '');
  const at = words.findIndex((w) => ABOUT_A_PAYMENT.test(w.replace(/[^\p{L}]/gu, '')));
  const kept = at < 0 ? words : words.slice(0, at);
  const said = kept.join(' ');
  return { said, cut: said !== what.trim().replace(/\s+/gu, ' ') };
}

/** The payee a line names, or `null` for a line that names none, or none the record could key. */
function payeeOf(ledger: Ledger, fields: Record<string, Json>): Payee | null {
  const bank = ledger.payee === undefined ? undefined : textOf(fields[ledger.payee]);
  const noted = ledger.note === undefined ? undefined : PAYEE_NOTE.exec(textOf(fields[ledger.note]) ?? '')?.[1]?.trim();
  const what = ledger.title === undefined ? undefined : textOf(fields[ledger.title]);
  const moved = what !== undefined && SAYS_TRANSFER.test(what);
  const keyed = (said: string, sure: boolean): Payee | null => {
    if (said.split(/\s+/u).every((w) => { const bare = w.replace(/[^\p{L}\p{N}]/gu, ''); return bare === '' || NAMES_NOBODY.test(bare); })) return null;
    const key = keyOf('bank', said);
    return key === null ? null : { said, key, sure, moved };
  };
  if (bank) return keyed(bank, true);
  if (noted) return keyed(noted, true);
  if (what === undefined) return null;
  const { said, cut } = nameIn(what);
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

function ledgerSlice(deps: BackfillDeps, lists: Lists, limit: number, after: string, suggest: (s: BackfillSuggestion) => void): Backfilled['ledger'] {
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
  for (const row of allRows(sql, orgs.register)) {
    if (orgs.at.merged_into !== undefined && textOf(row.fields[orgs.at.merged_into]) !== undefined) continue;
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

  /* HOW MANY LINES NAME EACH PAYEE, over the whole ledger and not the slice, and the spelling a name is made from: the
     first said as a payee, else the first description. */
  const seen = new Map<string, { lines: number; sure: boolean; business: boolean; said: string }>();
  for (const ledger of ledgers)
    for (const row of allRows(sql, ledger.register)) {
      const p = payeeOf(ledger, row.fields);
      if (p === null || p.moved || (ledger.transfer !== undefined && row.fields[ledger.transfer] === true)) continue;
      const held = seen.get(p.key);
      seen.set(p.key, {
        lines: (held?.lines ?? 0) + 1,
        sure: (held?.sure ?? false) || p.sure,
        business: (held?.business ?? false) || soundsLikeBusiness(p.said),
        said: held === undefined || (p.sure && !held.sure) ? p.said : held.said,
      });
    }

  const writes = batcher(deps);
  let looked = 0;
  let wrote = 0;
  let refused = 0;
  let made = 0;
  let last = '';

  /* THE ORGANISATION A KEY IS, or `null`: the one holding the key, else the one whose name folds to it, which is given
     the key too so the next line finds it the first way. `undefined` is a payee the record does not know. */
  const known = (key: string): string | null | undefined => {
    const holder = holderOf(sql, key);
    if (holder !== null) return holder.register === orgs.register ? holder.id : null;
    const named = byName.get(key) ?? [];
    if (named.length > 1) return null;
    const [id] = named;
    if (id === undefined) return undefined;
    if (orgs.at.keys !== undefined) {
      const row = sql.one<{ version: number; fields: string }>('SELECT version, fields FROM entry WHERE id = ?', id);
      if (row) {
        const keys = listOf((JSON.parse(row.fields) as Record<string, Json>)[orgs.at.keys]);
        deps.write(orgs.register, id, { [orgs.at.keys]: [...keys, key] }, { ...writes.w(), version: row.version });
      }
    }
    return id;
  };

  /* A NEW ORGANISATION, carrying the key it was made for, or `null` when the list cannot keep a key. */
  const make = (key: string, name: string, vendor: boolean): string | null => {
    if (orgs.at.keys === undefined || name === '') return null;
    const kind = vendor ? kindValue(lists, orgs.register, orgs.at, 'vendor') : undefined;
    const created = deps.write(
      orgs.register,
      null,
      { [orgs.at.name]: name, [orgs.at.keys]: [key], ...(kind === undefined ? {} : { [orgs.at.kind!]: kind }) },
      writes.w(),
    );
    if (!created.ok) return null;
    byName.set(keyOf('bank', name) ?? key, [created.value.id]);
    made++;
    return created.value.id;
  };

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
      const p = payeeOf(ledger, row.fields);
      if (p === null || isPerson(p)) continue;

      let org = known(p.key);
      if (org === undefined && !p.moved) {
        const service = services.get(p.key);
        const count = seen.get(p.key);
        /* A SERVICE'S PROVIDER THE RECORD ALREADY HOLDS AS AN ORGANISATION is that one, and never a second of one name. */
        const same = service === undefined ? [] : (byName.get(keyOf('bank', service) ?? '') ?? []);
        if (same.length === 1) org = same[0]!;
        else if (service !== undefined) org = make(p.key, service, true);
        else if (count !== undefined && count.lines >= PAYEE_SEEN) {
          /* A PAYEE SAID AS ONE ON ANY OF ITS LINES, THAT SAYS IT IS A BUSINESS ON ANY OF THEM, IS MADE. One only ever
             cut out of a description, or one that could be a person's name, is a question, named the way the walk
             would have named it. */
          if (count.sure && count.business) org = make(p.key, tidy(count.said), false);
          else if (tidy(count.said) !== '') {
            const name = tidy(count.said);
            suggest({ kind: 'organisation', key: `organisation:${p.key}`, name, payments: count.lines, question: `Is ${name} a company you pay or are paid by? ${count.lines} payments name it.` });
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

type ProjectsList = { id: string; title: string; candidates: Candidate[]; names: Map<string, string>; domains: Map<string, string[]> };

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
  const domainField = live(home.fields).find((f) => (f.id === 'domains' && f.type === 'list') || (f.id === 'domain' && f.type === 'text'))?.id;
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
    /* A FOLDER LISTED AMONG THE REPOSITORIES IS A FOLDER, as the owner's BrainDog lists `/Users/…/braindog`: matched as
       one, it places the runs in that checkout, where as a repository it matches no remote and no name. */
    const listed = repos === undefined ? [] : listOf(row.fields[repos]);
    return {
      id: row.id,
      spoken: `${said}${row.seq}`,
      repos: listed.filter((r) => !isFolder(r)),
      folders: [...(folders === undefined ? [] : listOf(row.fields[folders])), ...listed.filter(isFolder)],
    };
  });
  return { id: home.id, title: home.title, candidates, names, domains };
}

const named = (projects: ProjectsList, ids: readonly string[]): Named[] => ids.map((id) => ({ id, name: projects.names.get(id) ?? 'a project' }));

/** Whether a place a project lists is a folder, though it was listed among its repositories: `/Users/sam/Code/kiln`. */
const isFolder = (said: string): boolean => /^(?:\/|~\/|[A-Za-z]:[\\/])/u.test(said.trim());

/** A list of names as a sentence says them: `Kiln`, `Kiln or Portage`, `Kiln, Marlow or Portage`. */
const orList = (names: readonly string[]): string => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);

/* ── 2. runs with no project ─────────────────────────────────────────── */

/** The last name of a place, as it was written, with no `.git`: `Encore_PREPROD`. */
const lastSpelled = (said: string): string =>
  said.trim().replace(/[\\/]+$/u, '').replace(/\.git$/iu, '').split(/[\\/:]+/u).filter((part) => part !== '').at(-1) ?? '';

const runQuestion = (place: string, runs: number, projects: readonly Named[]): string =>
  `${runs === 1 ? 'A run' : `${runs} runs`} worked in ${place}. Is that ${orList(projects.map((p) => p.name))}?`;

/** A folder as `scope.ts` compares one: forward slashes, a drive letter in lower case, and no trailing slash. */
const pathOf = (said: string): string =>
  said.trim().replace(/\\/gu, '/').replace(/^([A-Za-z]):/u, (_, drive: string) => `${drive.toLowerCase()}:`).replace(/\/+$/u, '');

/** Whether `inner` is `outer` or inside it. Case is ignored on a drive-letter path, as Windows ignores it and `scope.ts` does. */
const within = (inner: string, outer: string): boolean => {
  const [a, b] = /^[a-z]:/u.test(inner) && /^[a-z]:/u.test(outer) ? [inner.toLowerCase(), outer.toLowerCase()] : [inner, outer];
  return a === b || a.startsWith(`${b}/`);
};

/**
 * WHERE A RUN IS SURELY IN, or the projects it may be in, by id, for the person to say.
 *
 * Only two places are sure. A remote a project lists, compared whole, is the repository itself. A folder a project
 * lists is sure only when it holds no other project's folder and the run's own repository is not another project's by
 * its name or its remote: a project listing `~/Developer` would otherwise claim every checkout under it, the Tee Time
 * one included. A bare name a project lists (`portage`) is only a name, which any fork or any other `app` shares, and a
 * last name is a guess, so both are questions.
 */
function placedFor(projects: readonly Candidate[], where: Whereabouts): { sure: Candidate | null; guess: string[] } {
  const found = matchProject(projects, where);
  const byId = new Map(projects.map((c) => [c.id, c]));
  const bySpoken = new Map(projects.map((c) => [c.spoken, c.id]));
  const ids = (spoken: readonly string[]): string[] => spoken.map((s) => bySpoken.get(s)).filter((id): id is string => id !== undefined);
  const hit = found.project === null ? undefined : byId.get(found.project.id);
  if (!hit || !found.project) return { sure: null, guess: ids(found.ambiguous) };
  if (found.project.how === 'remote') return { sure: hit, guess: [] };
  if (found.project.how === 'repo') return { sure: null, guess: [hit.id] };

  const cwd = pathOf(where.cwd ?? '');
  const folder = hit.folders.map(pathOf).filter((f) => within(cwd, f)).sort((a, b) => b.length - a.length)[0] ?? cwd;
  /* A FOLDER HOLDING ANOTHER PROJECT'S is a parent of projects, `~/Developer`, and says nothing about which one. */
  const broad = projects.some((c) => c.id !== hit.id && [...c.folders, ...c.repos.filter(isFolder)].some((f) => { const p = pathOf(f); return p !== folder && within(p, folder); }));
  if (broad) {
    /* SO THE GUESS IS WHAT THE RUN'S PLACE SAYS WITH THAT FOLDER SET ASIDE: a name its repository or a folder up its
       path shares with a project, as `matchProject` guesses one. "Is coinfish Coinfish?", never "Is coinfish
       Workshop?"; the broad project is asked about only when nothing else is a guess. */
    const aside = matchProject(projects.map((c) => (c.id === hit.id ? { ...c, folders: c.folders.filter((f) => pathOf(f) !== folder) } : c)), where);
    const others = [...(aside.project ? [aside.project.id] : []), ...ids(aside.ambiguous)];
    return { sure: null, guess: others.length > 0 ? [...new Set(others)] : [hit.id] };
  }
  /* THE RUN'S OWN REPOSITORY, BY ITS REMOTE OR ITS NAME, as the projects say it without their folders. */
  const own = matchProject(projects.map((c) => ({ ...c, folders: [] })), { remote: where.remote, repo: where.repo });
  const named = [...(own.project ? [own.project.id] : []), ...ids(own.ambiguous)].filter((id) => id !== hit.id);
  if (named.length === 0) return { sure: hit, guess: [] };
  /* A NARROW FOLDER ITS REPOSITORY CONTRADICTS IS A CHOICE between the two. */
  return { sure: null, guess: [...new Set([hit.id, ...named])] };
}

function runsSlice(deps: BackfillDeps, lists: Lists, limit: number, after: string, suggest: (s: BackfillSuggestion) => void): Slice {
  const { sql } = deps;
  const projects = projectsOf(sql, lists);
  if (!projects || projects.candidates.length === 0 || !lists.some((l) => l.id === SESSION)) return idle();
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
    const { sure, guess: ids } = placedFor(projects.candidates, where);
    if (sure) {
      const placed = deps.write(SESSION, row.id, {}, { ...writes.w(), version: row.version, stamp: { project: sure.spoken } });
      if (placed.ok) wrote++;
      else refused++;
      continue;
    }
    if (ids.length === 0) continue;
    /* THE PLACE AS A PERSON SAYS IT: the repository's name, never its host or a folder's path. One question for each
       place and guess, however many runs worked there. */
    const place = where.repo ?? (where.remote ? lastSpelled(where.remote) : lastSpelled(where.cwd ?? ''));
    if (place === '') continue;
    const key = `run-project:${place.toLowerCase()}:${[...ids].sort().join(',')}`;
    const these = named(projects, ids);
    suggest({ kind: 'run-project', key, place, runs: 1, projects: these, question: runQuestion(place, 1, these) });
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

function servicesSlice(deps: BackfillDeps, lists: Lists, limit: number, after: string, suggest: (s: BackfillSuggestion) => void): Slice {
  const { sql } = deps;
  const projects = projectsOf(sql, lists);
  const all = servicesOf(lists, projects?.id);
  if (!projects || all.length === 0) return idle();
  /* A NAME IS COMPARED BY ITS LETTERS AND DIGITS, so the domain `fern.ly` is the project Fernly and `otters.gg` is Otters.gg,
     as the owner's own links say: a domain is how a project spells its name on the web. */
  const fold = (said: string): string => nameKey(said).replace(/[\s'-]+/gu, '');
  const byName = new Map<string, string[]>();
  for (const [id, name] of projects.names) byName.set(fold(name), [...(byName.get(fold(name)) ?? []), id]);
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
      const hosts = [name, ...list.hosts.map((h) => textOf(row.fields[h]))]
        .filter((h): h is string => h !== undefined)
        .map((h) => registrable(h.replace(/^\*\./u, '')))
        .filter((d): d is string => d !== null);
      const hits = new Set([...(name === undefined || fold(name) === '' ? [] : (byName.get(fold(name)) ?? [])), ...hosts.flatMap((d) => byDomain.get(d) ?? [])]);
      if (hits.size === 0) continue;
      if (hits.size > 1) {
        const these = named(projects, [...hits]);
        const service = { id: row.id, name: name ?? 'A service' };
        suggest({ kind: 'service-project', key: `service-project:${row.id}`, service, projects: these, question: `Which project is ${service.name} for: ${orList(these.map((p) => p.name))}?` });
        continue;
      }
      const linked = deps.write(list.register, row.id, { [list.project]: [...hits][0]! }, { ...writes.w(), version: row.version });
      if (linked.ok) wrote++;
      else refused++;
    }
  }
  return { batch: writes.batch(), looked, wrote, refused, next: left === 0 && last !== '' ? last : null };
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
 * changed since by anybody else keeps what they changed. A second undo of the same batch puts nothing back.
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
        const held = listOf(r.fields[line.field]);
        if (held.includes(String(to))) put(r, { [line.field]: held.filter((k) => k !== String(to)) });
      } else if (line.kind === 'edit' && line.field !== null) {
        /* WHAT THE FIELD HELD BEFORE COMES BACK, not nothing: an organisation found by its name keeps the keys it had
           before the walk gave it one more. */
        const was = line.from_v === null ? null : (JSON.parse(line.from_v) as Json);
        if (JSON.stringify(r.fields[line.field] ?? null) === JSON.stringify(to)) put(r, { [line.field]: was });
      }
    }
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
