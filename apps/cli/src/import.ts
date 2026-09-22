/**
 * `braindog import legacy <export.json>`: move a the old tool record into this BrainDog (`loop/research-switch.md` §4).
 *
 * IT WRITES AS ANY AGENT DOES, over the API, with the token this machine signed in with: `create` and `update` for rows
 * and `propose` for an open question. So it works the same on a self-host and on app.brain.dog, and it can do nothing a
 * signed-in agent could not. Installing Solo founder and Agents is the owner's, in the app; a record without their lists
 * is told which to install, and nothing is written.
 *
 * RE-RUNNING UPDATES, IT NEVER ADDS A SECOND ROW. Every row carries its the old tool key in its tags (an agent run in its
 * `client_id`, a question in its body), each list is read once before writing, and a row found by its key is updated
 * only in the fields that differ. A question already asked is never asked again, answered or not.
 *
 * AND THAT CLAIM IS ONLY AS GOOD AS THOSE TWO READS BEING COMPLETE, so both of them page to the end and neither treats
 * a refusal as an empty answer: a row this import did not see is a row it writes again. See `PartlyRead` and
 * `readDecide`, each of which was measured adding duplicates before it was written.
 *
 * IT SAYS WHAT IT DID. Added, updated and unchanged by list, each row that changes with the fields that change, the
 * questions asked, everything left out with its reason, and every row the record refused with the record's own sentence.
 * `--dry-run` reads and reports and writes nothing.
 *
 * THE OWNER'S SETUP COMES BESIDE THE EXPORT (`--setup`): the organisations he runs and the numbers to poll, which the old tool
 * never kept. Organisations are rows like any other; a poll is filed on Decide as a pack to install, because it sends
 * requests to another server and only the owner approves that. `--draft-setup` prints a first one from the export.
 *
 * AND IT REMEMBERS WHAT EACH RUN CARRIED, so `--since` can say it the next morning. See `Run`.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { satisfies } from '@braindog/declare';
import { coerce, type FieldDecl } from '@braindog/kernel';
import { no, ok, refused, type Result } from '@braindog/ports';

import { budgetOf, hostsPath, target, type Target } from './http.ts';
import { bankHsbcEgPack } from '@braindog/seed';
import { pollPack } from '@braindog/seed/usecases/founder-poll';

import { KEY_PREFIX, OPTIONAL, ORDER, draftSetup, holdsKey, PROVIDED_BY, isRef, planLegacyTool, readLegacyTool, readSetup, type Plan, type PlannedRow, type Setup } from './legacy.ts';
import type { AgentIo } from './skills.ts';

import { createClient } from '@braindog/client';

const USAGE =
  'braindog import takes legacy <export.json> [--setup <setup.json>] [--host <host>] [--dry-run], or legacy <export.json> --draft-setup, or legacy --since <day or last>.';

/** The largest export this reads: the old tool's is about 108 KB of document and an audit of up to 100,000 lines. */
export const IMPORT_MOST_BYTES = 64 * 1024 * 1024;

type Row = { id: string; seq: number | null; version: number; fields: Record<string, unknown> };

/** The part of the client an import uses, so a test can hand it a record of its own. */
export type Door = {
  schema: (register: string) => Promise<Result<unknown>>;
  list: (args: { register: string; limit?: number; cursor?: string | null }) => Promise<Result<{ rows: unknown[]; cursor: string | null }>>;
  create: (args: { register: string; fields: Record<string, unknown>; note?: string }) => Promise<Result<unknown>>;
  update: (args: { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string }) => Promise<Result<unknown>>;
  governance: (args: { register?: string; status?: string; limit?: number; cursor?: string }) => Promise<Result<unknown>>;
  propose: (args: { question: string; body_kind: 'options' | 'pack'; body: Record<string, unknown> }) => Promise<Result<unknown>>;
  /**
   * The packs this record holds and at which version: read only when a bank pack is to be offered (see `banksOf`).
   * OPTIONAL BECAUSE A DOOR WITHOUT IT STILL WORKS. The pack is then proposed unchecked, and a record that cannot take
   * it answers with its own refusal, which lands under "Refused by the record" like any other.
   */
  packs?: () => Promise<Result<{ id: string; version: string | null }[]>>;
};

/**
 * A pack his export shows he uses, to be offered on Decide with its document: see `banksOf`.
 *
 * THE DOCUMENT TRAVELS WITH THE ID because the pack is in no catalogue a record resolves an install id against.
 * `bank-hsbc-eg` is deliberately not in `seedCatalogue`: a pack in the catalogue is a pack every record is offered.
 */
export type PlannedBank = { install: string; name: string; question: string; doc: Record<string, unknown> };

export type Tally = { added: number; updated: number; unchanged: number };

export type Report = {
  missing: string[];
  tally: Record<string, Tally>;
  asked: number;
  alreadyAsked: number;
  /** Polls filed on Decide, and those already filed or installed. */
  polls: { filed: number; before: number };
  /**
   * Bank packs filed on Decide, those filed before, and a sentence for each one held back because the record's Money is
   * too old to take it. Absent when the run was handed no bank to offer.
   */
  banks?: { filed: number; before: number; waiting: string[] };
  /** Each row that changes, with the fields that change. */
  changes: { register: string; label: string; fields: string[] }[];
  refused: { label: string; register: string; fix: string }[];
  /** Each row an earlier import left on a list this one no longer writes to, closed so it is not counted twice. */
  retired: { register: string; label: string; why: string }[];
  /** A category name this record already holds, and how many ledger rows arrived without it as a result. */
  clashes: { label: string; rows: number; fix: string }[];
  /** Example rows setting up planted, found in the lists the import writes to: the report suggests clearing them on Home. */
  examples: number;
  /** What happened to each planned row, by its key: the report lists dates, domains and services one by one. */
  outcomes: Record<string, 'added' | 'updated' | 'unchanged' | 'refused'>;
  plan: Plan;
};

/**
 * The words a report names a list by.
 *
 * THE `satisfies` IS HERE BECAUSE THIS MAP LIVES IN A DIFFERENT FILE FROM THE LIST IT HAS TO COVER, AND THE FALLBACK IS
 * SILENT. Every lookup of it reads `NAMES[register] ?? register`, so a register added to `ORDER` (`src/legacy.ts`)
 * and not named here prints the API's own id at a person rather than refusing. It has happened twice. `installments`
 * printed `installments: 1 added, 0 updated, 0 unchanged.` in the main tally directly beside `Accounts: 1 added`, and
 * `fx` did it again this week. `PROVIDED_BY`, the other map a new register needs a line in, was filled in the same edit,
 * and the only difference between the two is that it sits in `legacy.ts` under `ORDER` and this one is a file away
 * and belongs to a different agent. So the seam is where the maps live, not who was careless. Held as
 * `satisfies`, a register with no name here is a compile error that names it (measured: `Property 'fx' is missing`),
 * which whoever adds one reads before any run of the import does. `satisfies` checks an object literal for excess keys
 * as well, so a name left behind for a register `ORDER` has stopped writing is an error too (measured: `'snapshots'
 * does not exist in type`). `test/import.test.ts` still holds the printed lines to their words, because the one thing
 * the compiler cannot check is that a name is the one the product shows a person.
 */
const NAMES: Readonly<Record<string, string>> = {
  things: 'Projects',
  people: 'People',
  tracks: 'Threads',
  tasks: 'Tasks',
  datapoints: 'Datapoints',
  learnings: 'Learnings',
  skills: 'Skills',
  tools: 'Tools',
  credentials: 'Keys (the index only)',
  /* THE WORDS money-core PUTS OVER THIS LIST (`packages/seed/src/modules/money.ts:506`), not "FX" or "Rates": a person
     reading the report has the same two words over the page the import filled. */
  fx: 'Exchange rates',
  accounts: 'Accounts',
  /* AND THE THIRD TIME THIS FILE HAS BEEN THE ONE A NEW REGISTER FORGOT, which the paragraph above predicted in so many
     words: `ORDER` gained `holdings` in `legacy.ts`, an agent's own file, and this map is a file away and was another
     agent's. `Holdings` is what money-core puts over the list (`packages/seed/src/modules/money.ts:533`), so a person
     reading the report has the same word over the page the import filled. */
  holdings: 'Holdings',
  categories: 'Categories',
  obligations: 'Money in and out',
  /* THE WORDS money-core PUTS OVER THESE FOUR LISTS AND NOTHING ELSE (`packages/seed/src/modules/money.ts`), which is
     the run that put the sentence above here: `installments` was the register with no entry, and the id it fell back to
     was what a person read. */
  transactions: 'Ledger',
  recurring: 'Repeating',
  installments: 'Instalments',
  services: 'Services',
  organisations: 'Organisations',
  session: 'Agent runs',
} satisfies Record<(typeof ORDER)[number], string>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fixOf = (r: Result<unknown>): string => (refused(r) ? `${r.refusal.fix} (${r.refusal.code})` : 'Somebody else changed it at the same moment. Run the import again.');
/** The field types whose values a dry run puts to the kernel's coercion: see `textRefusal` in `applyPlan`. */
const TEXTS = new Set(['text', 'document']);
const unreachable = (r: Result<unknown>) => refused(r) && r.refusal.code === 'UNREACHABLE';

/** JSON with its keys in order, so two values that mean the same compare the same. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The key a row was imported under: in its tags, or in `client_id` for an agent run. */
const keyOf = (register: string, fields: Record<string, unknown>): string | null => {
  if (register === 'session') return typeof fields.client_id === 'string' && fields.client_id.startsWith(KEY_PREFIX) ? fields.client_id : null;
  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  return (tags.find((t) => typeof t === 'string' && t.startsWith(KEY_PREFIX)) as string | undefined) ?? null;
};

class Unreachable extends Error {}

/**
 * A LIST THIS IMPORT COULD NOT READ TO THE END, which is a different thing from a list with nothing in it.
 *
 * `readAll` used to break out of its loop on any refusal but `UNREACHABLE` and hand back the pages it already had.
 * Everything below then read the rows it never saw as absent and wrote them again, and the whole of "re-running
 * updates, it never adds a second row" rests on this one read having seen every row. Measured against the kernel over
 * an in-memory record (`test/import-at-scale.test.ts`): 620 rows imported, the bearer going stale after page one the
 * way a self-host answers a credential it no longer knows, and the second run reported 500 unchanged and 120 added,
 * leaving 740 rows where 620 had been. No refusal was printed, because nothing had refused a write.
 *
 * SO IT IS THROWN, AND IT IS THROWN BEFORE ANY WRITE. Every list is read in full before the first row is sent, so a
 * read that stopped part way ends the run with the record untouched and the person told to run it again.
 */
class PartlyRead extends Error {
  register: string;
  fix: string;
  constructor(register: string, fix: string) {
    super(`${register}: ${fix}`);
    this.register = register;
    this.fix = fix;
  }
}

/**
 * Every row of one list, page by page.
 *
 * THE PAGE BUDGET IS A REFUSAL AND NOT A `break`, for the same reason: the record pages a list at 500 rows, so a
 * thousand pages is half a million rows in one list, and a run that reached it would have been carrying on with an
 * answer that was missing everything past it.
 */
async function readAll(door: Door, register: string): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 1000; pages++) {
    const got = await door.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) {
      if (unreachable(got)) throw new Unreachable();
      throw new PartlyRead(NAMES[register] ?? register, fixOf(got));
    }
    for (const r of got.value.rows) if (isObj(r) && typeof r.id === 'string' && isObj(r.fields)) out.push(r as unknown as Row);
    cursor = got.value.cursor;
    if (cursor === null) return out;
  }
  throw new PartlyRead(NAMES[register] ?? register, `This list is longer than an import reads in one run (${String(out.length)} rows and more).`);
}

/** The keys of every question already asked, and every pack already offered or installed. */
type Decide = { asked: Set<string>; installs: Set<string> };

/** The most rows one governance read answers with: the record clamps it there (`packages/kernel/src/govern.ts`). */
const DECIDE_PAGE = 200;

/**
 * Everything on Decide, A PAGE AT A TIME, because the question this read answers is "has he already been asked this".
 *
 * ONE READ OF 200 WAS THE WHOLE OF IT, AND THE CEILING IS A LIFETIME ONE: every draft Spark filed, every pack offered
 * and every question answered is still a row in the suggestion table, and the read is `status: 'all'` because a
 * question he has ANSWERED is exactly the one that must not come back. His record holds 49 today. Measured against
 * the kernel (`test/import-at-scale.test.ts`): with 200 suggestions in the table a re-import asks nothing, and with
 * 201 the import's own question, which is the oldest row of them, falls off the end of the first page and is asked a
 * second time. So the answer he already gave is thrown away and the question arrives again, on the one screen he is
 * asked to act on.
 *
 * THE CURSOR IS THE ID OF THE LAST ROW OF THE PAGE ABOVE, and a page shorter than the limit is the last one, which is
 * the contract `packages/record/test/paging.test.ts` holds the record to.
 */
async function readDecide(door: Door): Promise<Result<Decide>> {
  const asked = new Set<string>();
  const installs = new Set<string>();
  let cursor: string | undefined;
  for (let pages = 0; pages < 1000; pages++) {
    const got = await door.governance({ register: 'suggestion', status: 'all', limit: DECIDE_PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!got.ok) return got;
    if (!Array.isArray(got.value)) return ok({ asked, installs });
    for (const s of got.value)
      if (isObj(s) && isObj(s.body)) {
        if (typeof s.body.from === 'string') asked.add(s.body.from);
        if (typeof s.body.install === 'string') installs.add(s.body.install);
      }
    if (got.value.length < DECIDE_PAGE) return ok({ asked, installs });
    const last = got.value.at(-1);
    /* A PAGE OF THE LIMIT AND NO ID TO PAGE ON is a read that cannot be finished, and carrying on with what it has is
       the bug this function was written for. */
    if (!isObj(last) || typeof last.id !== 'string') return no('VALUE_MALFORMED', 'A page of Decide came back with no id to read the next page from.', { at: 'cursor' });
    cursor = last.id;
  }
  return no('OUT_OF_BOUNDS', `Decide holds more than ${String(DECIDE_PAGE * 1000)} rows, which is more than an import reads in one run.`);
}

/**
 * The words a ledger row's `source` carries when a bank's own message wrote it. Only `sms` was seen on his live ledger
 * on 22 September (beside `sheet`, his typed rows); the two mail words are here because the pack reads alert mails as
 * well and a row a mail wrote is the same evidence as one a text wrote.
 */
const READ_FROM_A_MESSAGE = new Set(['sms', 'email', 'mail']);

/**
 * THE BANK PACKS HIS EXPORT SHOWS HE USES, AND ONLY THOSE: today one, `bank-hsbc-eg`.
 *
 * money-core 1.8.0 gave HSBC Egypt's wordings to an optional pack (`loop/DIRECTION.md` section 22), so a record set up
 * for him no longer reads his bank's texts until somebody installs it, and the import is the one moment that knows he
 * needs it. It has to know that from his data and not from being his importer, or it is the core assuming one bank
 * again in another file.
 *
 * WHAT COUNTS IS AN HSBC ACCOUNT WITH A ROW ON IT THAT A MESSAGE WROTE, and the export carries nothing better. It holds
 * no pattern and no inbox (`scripts/legacy-export.mjs` asks four routes and none of them is either); what it does
 * hold, measured against his live `/api/money/overview` and `/api/money/txn` on 22 September, is two accounts whose id
 * and name say HSBC and a `source` on every ledger row, `sms` on the rows the bank's texts wrote and `sheet` on the ones
 * he typed in before the texts were wired. Neither alone is enough. An account called HSBC whose every row was typed
 * says he banks there, not that there is anything for the pack to read; a row read from a text on some other account
 * says a bank texts him, not which. the old tool's parser reads only the Egypt wordings the pack carries, so a row it
 * wrote from a text onto an HSBC account is a message in exactly those wordings.
 */
export function banksOf(exp: Record<string, unknown>): PlannedBank[] {
  const money = isObj(exp.money) ? exp.money : null;
  if (!money) return [];
  const hsbc = new Set<string>();
  for (const a of Array.isArray(money.accounts) ? money.accounts : [])
    if (isObj(a) && (typeof a.id === 'string' || typeof a.id === 'number') && /hsbc/iu.test(`${String(a.id)} ${typeof a.name === 'string' ? a.name : ''}`)) hsbc.add(String(a.id).toLowerCase());
  if (hsbc.size === 0) return [];
  /* THE LEDGER IN EVERY SHAPE `legacy.ts` READS IT IN: the route's answer whole, or its rows under one of three names. */
  const ledger = money.ledger;
  const rows: unknown[] = Array.isArray(ledger) ? ledger : isObj(ledger) ? [ledger.txns, ledger.transactions, ledger.rows].find(Array.isArray) ?? [] : [];
  const read = rows.some((t) => isObj(t) && typeof t.source === 'string' && READ_FROM_A_MESSAGE.has(t.source.toLowerCase()) && hsbc.has(String(t.account_id ?? t.account).toLowerCase()));
  return read ? [{ install: 'bank-hsbc-eg', name: 'HSBC Egypt', question: 'Read HSBC Egypt texts and mails into Money?', doc: bankHsbcEgPack() }] : [];
}

/**
 * Apply a plan through a door. Refs are resolved to the id of the row they name once it is written; a ref to a row in
 * the same list written later is set in a second pass.
 */
export async function applyPlan(given: Plan, door: Door, o: { dryRun: boolean; banks?: PlannedBank[] }): Promise<Report> {
  let plan = given;
  const report: Report = { missing: [], tally: {}, asked: 0, alreadyAsked: 0, polls: { filed: 0, before: 0 }, changes: [], refused: [], retired: [], clashes: [], examples: 0, outcomes: {}, plan };
  let registers = ORDER.filter((r) => plan.rows.some((row) => row.register === r));

  /**
   * A LIST WITH NOTHING PLANNED FOR IT IS STILL ASKED ABOUT WHEN A ROW IS TO BE RETIRED OUT OF IT OR INTO IT. An
   * export whose instalment wall has been paid off plans no `installments` rows at all, and the copies the earlier
   * importer left in `obligations` are exactly the rows that then need closing.
   *
   * AND NOT HAVING ONE OF THOSE CANNOT STOP THE IMPORT, which is what asking about them naively did. `obligations` is
   * not optional, so a record without the Money pack answered `REGISTER_UNKNOWN` for a list this run was only ever
   * going to close rows in, and `missing` returned before a single row was written. Measured against a record holding
   * the founder and agents lists and no money at all: the import wrote five projects before, and nothing after.
   * Nothing is planned for these, so not having one means only that there is nothing to close.
   */
  const held = new Set<string>(registers);
  const spare: string[] = [...new Set((plan.retire ?? []).flatMap((r) => [r.register, r.replaces]).filter((r) => !held.has(r)))];

  const absent: string[] = [];
  /** The fields each list declares, where the record's answer says: see `unheld` below. */
  const declared = new Map<string, Set<string>>();
  /** Every list the record answered for, so the sentence about a missing one can tell an old pack from no pack. */
  const answered = new Set<string>();
  /** The text fields each list declares, whole, so a dry run can put a row's texts to the kernel's own coercion. */
  const texts = new Map<string, Map<string, FieldDecl>>();
  for (const register of [...registers, ...spare] as string[]) {
    const has = await door.schema(register);
    if (has.ok) answered.add(register);
    if (!has.ok) {
      if (unreachable(has)) throw new Unreachable();
      if (OPTIONAL.has(register) || spare.includes(register)) absent.push(register);
      else report.missing.push(register);
      continue;
    }
    /* A RETIRED FIELD IS LEFT OUT because the kernel leaves it out of what a write may name (`packages/kernel/src/index.ts`,
       `known`), so counting it here would send a field the record then refuses. An answer with no `fields` is read as
       saying nothing, and every planned field is sent as it always was. */
    const fields = isObj(has.value) && Array.isArray(has.value.fields) ? has.value.fields : null;
    if (fields !== null) {
      declared.set(register, new Set(fields.flatMap((f) => (isObj(f) && typeof f.id === 'string' && f.retired !== true ? [f.id] : []))));
      texts.set(
        register,
        new Map(fields.flatMap((f) => (isObj(f) && typeof f.id === 'string' && TEXTS.has(String(f.type === 'list' ? (f.of ?? 'text') : f.type)) ? [[f.id, f as unknown as FieldDecl]] : []))),
      );
    }
  }

  /**
   * WHAT THE KERNEL'S COERCION WOULD SAY OF A ROW'S TEXTS, ASKED BEFORE A DRY RUN COUNTS IT.
   *
   * Measured on his real export (`loop/research-import-real.md`, finding 3): `--dry-run` ended 0 and printed `Agent runs:
   * 198 would be added` with no refusal block, and the real run added 195 and ended 1, all three refused as
   * `TEXT_ESCAPED_NEWLINE`. A dry run reads the lists and sends nothing, so a refusal the kernel makes on a value never
   * reached it, and the command he is told to run first promised rows the record would not take. So each text a write
   * would carry is put to `coerce` itself, imported from the kernel and not copied, against the field the record's own
   * schema answer declares: the same checks, in the same order, and the same sentence. Only texts, because a ref in a
   * dry run points at a row that was never written, and a lookup the record owns cannot be answered here.
   */
  const textRefusal = (register: string, fields: Record<string, unknown>): string | null => {
    const has = texts.get(register);
    if (has === undefined) return null;
    for (const [id, value] of Object.entries(fields)) {
      const field = has.get(id);
      if (field === undefined || value === null) continue;
      const got = coerce(field, value);
      if (!got.ok) return fixOf({ ok: false, refusal: got.refusal } as Result<unknown>);
    }
    return null;
  };
  if (report.missing.length > 0) return report;
  /* A LIST THIS RECORD DOES NOT HAVE AND DOES NOT NEED: its rows are left out, each named, with what installing adds them. */
  if (absent.length > 0) {
    const out = plan.rows.filter((r) => absent.includes(r.register));
    /**
     * UPDATE WHEN THE PACK IS THERE AT AN OLDER VERSION, INSTALL WHEN IT IS NOT, AND THE SENTENCE SAID INSTALL TO BOTH.
     *
     * `PROVIDED_BY.holdings` names `Money 1.5.0`, and a record on Money 1.4.0 was told "Install Money 1.5.0 beside Solo
     * founder": a pack the catalogue shows it as already holding, where the thing to press is the update. The record
     * does not answer which version it holds, so the question asked is the one it can answer: does it hold any other
     * list the same pack provides. If it does, the pack is installed and older. Only a provider with a version in it
     * is asked about, because "Update Estate" names no version to update to and is not a sentence anybody can act on.
     */
    const lead = new Map<string, string>();
    for (const register of new Set(out.map((r) => r.register))) {
      const by = PROVIDED_BY[register] ?? register;
      const versioned = /^(.+) (\d+\.\d+\.\d+)$/u.exec(by);
      if (!versioned) {
        lead.set(register, `Install ${by} beside Solo founder`);
        continue;
      }
      const pack = versioned[1]!;
      const version = versioned[2]!;
      const siblings = Object.entries(PROVIDED_BY).flatMap(([r, p]) => (r !== register && (p === pack || p.startsWith(`${pack} `)) ? [r] : []));
      let held = siblings.some((r) => answered.has(r));
      for (const r of siblings) {
        if (held) break;
        if (absent.includes(r) || report.missing.includes(r)) continue;
        const has = await door.schema(r);
        if (!has.ok && unreachable(has)) throw new Unreachable();
        held = has.ok;
      }
      lead.set(register, held ? `Update ${pack} to ${version}` : `Install ${by} beside Solo founder`);
    }
    plan = {
      ...plan,
      rows: plan.rows.filter((r) => !absent.includes(r.register)),
      skipped: [
        ...plan.skipped,
        /* A LIST WITH NO ROWS FOR IT IS NOT A SENTENCE: `absent` now holds lists asked about only so that something
           could be retired, and one of those would otherwise print a reason with nothing after it. */
        ...absent
          .filter((register) => out.some((r) => r.register === register))
          .map((register) => ({
            reason: `This BrainDog has no ${NAMES[register] ?? register} list. ${lead.get(register) ?? `Install ${PROVIDED_BY[register] ?? register} beside Solo founder`}, then run the import again to bring these in`,
            items: out.filter((r) => r.register === register).map((r) => r.label),
          })),
      ],
    };
    report.plan = plan;
    registers = registers.filter((r) => !absent.includes(r));
  }

  /**
   * A FIELD THIS RECORD'S LIST DOES NOT DECLARE IS LEFT OFF THE ROW, AND THE ROW STILL ARRIVES.
   *
   * A list a pack declares gains fields as the pack moves on, and a record keeps the version it installed until the
   * owner takes the update. Sent as planned, the one field that record has not got is `FIELD_UNKNOWN`, and the record
   * refuses the WHOLE ROW over it. Measured on 2026-09-22 against the kernel (`test/import-note.test.ts`): a domain row
   * carrying the `note` Estate 1.2.0 declares, sent to a record on 1.1.0, was refused, and its name, registrar and
   * status went with it. `holdings.currency` did the same to fourteen rows at once. So the field is taken off, the rest
   * is written, and every row that lost one is named with the list and the pack whose update brings the field in.
   *
   * ONLY FROM A ROW THAT HAD A VALUE THERE, which is what makes the line worth reading: a domain with no note loses
   * nothing and is not in it.
   */
  const unheld = new Map<string, { register: string; field: string; items: string[] }>();
  plan = {
    ...plan,
    rows: plan.rows.map((row) => {
      const has = declared.get(row.register);
      if (has === undefined) return row;
      const off = Object.keys(row.fields).filter((f) => !has.has(f));
      if (off.length === 0) return row;
      for (const field of off) {
        const at = `${row.register}.${field}`;
        const entry = unheld.get(at) ?? { register: row.register, field, items: [] };
        entry.items.push(row.label);
        unheld.set(at, entry);
      }
      return { ...row, fields: Object.fromEntries(Object.entries(row.fields).filter(([f]) => has.has(f))) };
    }),
  };
  if (unheld.size > 0) {
    plan = {
      ...plan,
      skipped: [
        ...plan.skipped,
        ...[...unheld.values()].map(({ register, field, items }) => ({
          reason: `This BrainDog's ${NAMES[register] ?? register} list has no ${field} field yet, so each of these is sent without its ${field} and with everything else. Update ${(PROVIDED_BY[register] ?? register).replace(/ \d+\.\d+\.\d+$/u, '')}, then run the import again to bring it in`,
          items,
        })),
      ],
    };
    report.plan = plan;
  }

  /**
   * ROWS AN EARLIER IMPORT WROTE UNDER A KEY THIS ONE NO LONGER USES, AND WHY IT IS CONDITIONAL.
   *
   * Nothing is retired unless the list that replaces those rows is one this record actually has. A record still on
   * money-core 1.1.0 has no `installments` list, so the instalment wall stays in `obligations` and closing it there
   * would delete the largest number in his record rather than move it.
   */
  const retiring = (plan.retire ?? []).filter((r) => !absent.includes(r.register) && !absent.includes(r.replaces));

  const ids = new Map<string, string>();
  const existing = new Map<string, Row>();
  /** Which list each already-written row is in: `existing` is keyed by import key alone and a key can change lists. */
  const where = new Map<string, string>();
  /**
   * WHAT EACH NAME IN `categories` IS ALREADY TAKEN BY, because `categories.name` is unique and the record he imports
   * into has nine example categories planted at setup (`packages/seed/src/modules/money.ts`, CATEGORIES: Client work,
   * Licensing, Contractors, Software, Premises, Tax, Professional fees, Production, Travel). Without this the record
   * refuses his own category of that name, every ledger row filed under it arrives with no category at all, and the
   * only thing said is one refusal line that names no ledger row.
   */
  const named = new Map<string, Row>();
  for (const register of [...new Set([...registers, ...retiring.map((r) => r.register)])])
    for (const row of await readAll(door, register)) {
      if (Array.isArray(row.fields.tags) && row.fields.tags.includes('example')) report.examples++;
      if (register === 'categories' && typeof row.fields.name === 'string') named.set(row.fields.name.toLowerCase(), row);
      const key = keyOf(register, row.fields);
      if (key) {
        existing.set(key, row);
        ids.set(key, row.id);
        where.set(key, register);
      }
    }

  const later: { row: PlannedRow; field: string; value: unknown }[] = [];
  /** A planned value with its refs put as ids, or `undefined` when one names a row that is not written yet. */
  const resolveValue = (v: unknown): unknown => {
    if (isRef(v)) return ids.get(v.$ref);
    if (Array.isArray(v) && v.some(isRef)) {
      const got = v.map((x) => (isRef(x) ? ids.get(x.$ref) : x));
      return got.some((x) => x === undefined) ? undefined : got;
    }
    return v;
  };
  const planned = new Set(plan.rows.map((r) => r.key));
  /** Categories this run could not write because the name is taken, and every row that pointed at one. */
  const lost = new Map<string, { label: string; rows: number; fix: string }>();

  for (const row of plan.rows) {
    const tally = (report.tally[row.register] ??= { added: 0, updated: 0, unchanged: 0 });
    const fields: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(row.fields)) {
      const put = resolveValue(value);
      if (put !== undefined) fields[field] = put;
      else {
        const refs = [value].flat().filter(isRef);
        const gone = refs.map((x) => lost.get(x.$ref)).find((x) => x !== undefined);
        /* A ROW WHOSE CATEGORY COULD NOT BE WRITTEN STILL ARRIVES, uncategorised, and the count is what makes that
           visible: a Where it went chart with a slice missing says nothing about itself. */
        if (gone) gone.rows++;
        /* A ref to a row planned in this run and not written yet waits for the second pass; one to a row left out is dropped. */ else if (refs.some((x) => planned.has(x.$ref))) later.push({ row, field, value });
      }
    }
    const found = existing.get(row.key);
    if (holdsKey(fields)) {
      report.refused.push({ label: row.label, register: row.register, fix: 'A field looked like a key itself, so the row was not sent.' });
      continue;
    }

    /**
     * A NAME THIS RECORD ALREADY HOLDS, CAUGHT BEFORE THE WRITE RATHER THAN AFTER THE REFUSAL.
     *
     * `categories.name` is unique, so sending it earns one refusal line naming the category and nothing naming the
     * ledger rows that then arrive with no category. The row is left for a person deliberately: adopting the row
     * already there would carry its example `budget` and `match` onto his category, and a wrong number on the Money
     * page is worse than a category he has to clear and import again.
     */
    const taken = row.register === 'categories' && !found && typeof fields.name === 'string' ? named.get(fields.name.toLowerCase()) : undefined;
    if (taken) {
      const planted = Array.isArray(taken.fields.tags) && taken.fields.tags.includes('example');
      lost.set(row.key, {
        label: row.label,
        rows: 0,
        fix: planted
          ? `This BrainDog already holds a category called ${row.label} from setting up, and one name is one category. Open Home, press Clear the examples, then run the import again.`
          : `This BrainDog already holds a category called ${row.label}, and one name is one category. Rename one of the two, then run the import again.`,
      });
      report.outcomes[row.key] = 'refused';
      continue;
    }

    if (!found) {
      const create = row.register === 'session' ? fields : { ...fields, tags: [row.key] };
      if (o.dryRun) {
        const turned = textRefusal(row.register, create);
        if (turned !== null) {
          report.refused.push({ label: row.label, register: row.register, fix: turned });
          report.outcomes[row.key] = 'refused';
          continue;
        }
        tally.added++;
        report.outcomes[row.key] = 'added';
        ids.set(row.key, `(new ${row.key})`);
        continue;
      }
      const made = await door.create({ register: row.register, fields: create, note: 'Imported from the old tool.' });
      if (!made.ok) {
        if (unreachable(made)) throw new Unreachable();
        report.refused.push({ label: row.label, register: row.register, fix: fixOf(made) });
        report.outcomes[row.key] = 'refused';
        continue;
      }
      const value = made.value as Row;
      ids.set(row.key, value.id);
      existing.set(row.key, value);
      tally.added++;
      report.outcomes[row.key] = 'added';
      continue;
    }

    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(fields)) if (stable(found.fields[field]) !== stable(value)) patch[field] = value;
    if (Object.keys(patch).length === 0) {
      tally.unchanged++;
      report.outcomes[row.key] = 'unchanged';
      continue;
    }
    report.changes.push({ register: row.register, label: row.label, fields: Object.keys(patch) });
    report.outcomes[row.key] = 'updated';
    if (o.dryRun) {
      const turned = textRefusal(row.register, patch);
      if (turned !== null) {
        report.refused.push({ label: row.label, register: row.register, fix: turned });
        report.outcomes[row.key] = 'refused';
        continue;
      }
      tally.updated++;
      continue;
    }
    const done = await door.update({ register: row.register, seq: found.seq as number, patch, version: found.version, note: 'Imported again from the old tool.' });
    if (!done.ok) {
      if (unreachable(done)) throw new Unreachable();
      report.refused.push({ label: row.label, register: row.register, fix: fixOf(done) });
      report.outcomes[row.key] = 'refused';
      continue;
    }
    existing.set(row.key, done.value as Row);
    tally.updated++;
  }

  /* THE SECOND PASS: a learning that replaces one written after it. Counted as part of the row already counted. */
  for (const { row, field, value } of later) {
    const put = resolveValue(value);
    const at = existing.get(row.key);
    if (put === undefined || !at || o.dryRun || stable(at.fields[field]) === stable(put)) continue;
    const done = await door.update({ register: row.register, seq: at.seq as number, patch: { [field]: put }, version: at.version, note: 'Imported from the old tool.' });
    if (done.ok) existing.set(row.key, done.value as Row);
    else if (unreachable(done)) throw new Unreachable();
    else report.refused.push({ label: row.label, register: row.register, fix: fixOf(done) });
  }

  report.clashes = [...lost.values()];

  /**
   * THE ROWS AN EARLIER IMPORT LEFT IN A LIST THIS ONE HAS MOVED OFF, CLOSED SO NOTHING IS COUNTED TWICE.
   *
   * Moving a key is what makes these invisible: `existing` is keyed by import key alone, so a row written under
   * `legacy:instalment:` is never found by a plan that writes `legacy:schedule:`, and the record ends up
   * holding the same instalment in two lists with a wall that is double. Measured on an in-memory record with
   * money-core 1.2.0 installed (`test/legacy.test.ts`): a wall of EGP 5,000,000 imported under the old shape and
   * then under the new read EGP 10,000,000 across the two lists.
   *
   * THE PATCH ONLY EVER CLOSES A ROW, and the reason goes in the write's own note rather than into the row's `note`
   * field: whatever a person wrote on that row is theirs, and the history is where "why did this change" belongs.
   */
  for (const r of retiring)
    for (const [key, register] of where) {
      if (register !== r.register || !key.startsWith(r.prefix) || planned.has(key)) continue;
      const at = existing.get(key);
      if (!at) continue;
      /* A ROW A PERSON HAS ALREADY SETTLED IS LEFT EXACTLY AS IT IS. A part standing at `paid` says money left his
         account; `written_off` says a debt was cancelled, and nothing about a key moving list makes the second one
         true. The export's schedule holds only what is still owed, so such a row has no new row double-counting it. */
      if (Object.entries(r.only).some(([field, value]) => stable(at.fields[field]) !== stable(value))) continue;
      const patch = Object.fromEntries(Object.entries(r.patch).filter(([field, value]) => stable(at.fields[field]) !== stable(value)));
      if (Object.keys(patch).length === 0) continue;
      const names = r.titles.map((f) => at.fields[f]).filter((v): v is string => typeof v === 'string');
      const label = names.length > 0 ? names.join(' ') : key;
      if (o.dryRun) {
        report.retired.push({ register: r.register, label, why: r.why });
        continue;
      }
      const done = await door.update({ register: r.register, seq: at.seq as number, patch, version: at.version, note: r.why });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        report.refused.push({ label, register: r.register, fix: fixOf(done) });
        continue;
      }
      existing.set(key, done.value as Row);
      report.retired.push({ register: r.register, label, why: r.why });
    }
  /* IN A STEADY ORDER, because `where` is in the order the record answered a list in and a run report a person
     compares against yesterday's should not reshuffle itself. */
  report.retired.sort((a, b) => `${a.register} ${a.label}`.localeCompare(`${b.register} ${b.label}`));

  /**
   * WHAT DECIDE ALREADY HOLDS, AND ASKING NOTHING WHEN THAT CANNOT BE READ.
   *
   * A refusal here used to leave both sets empty and carry on, which reads as "nothing has ever been asked" and files
   * the whole plan's questions again. It cannot be thrown the way a partial list read is: the rows are already
   * written by this point, and an exception would take the report with it. Asking again is the harm, so the run
   * stops asking, files no poll, and says which read failed under "Refused by the record".
   */
  let decide: Decide | null = { asked: new Set(), installs: new Set() };
  const banks = o.banks ?? [];
  if (plan.asks.length > 0 || plan.polls.length > 0 || banks.length > 0) {
    const got = await readDecide(door);
    if (got.ok) decide = got.value;
    else if (unreachable(got)) throw new Unreachable();
    else {
      report.refused.push({ label: 'What this record has already been asked', register: 'Decide', fix: fixOf(got) });
      decide = null;
    }
  }
  const asked = decide?.asked ?? new Set<string>();
  const installs = decide?.installs ?? new Set<string>();
  if (decide !== null && plan.asks.length > 0) {
    for (const ask of plan.asks) {
      if (asked.has(ask.key)) {
        report.alreadyAsked++;
        continue;
      }
      if (o.dryRun) {
        report.asked++;
        continue;
      }
      const done = await door.propose({ question: ask.question, body_kind: 'options', body: ask.body });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        report.refused.push({ label: ask.label, register: 'Decide', fix: fixOf(done) });
        continue;
      }
      report.asked++;
    }
  }

  /* A POLL IS A PACK TO INSTALL, filed once. Its project and organisation are the rows this import wrote or found. */
  for (const poll of decide === null ? [] : plan.polls) {
    const pack = `poll-${poll.id}`;
    if (installs.has(pack)) {
      report.polls.before++;
      continue;
    }
    if (o.dryRun) {
      report.polls.filed++;
      continue;
    }
    const project = poll.project ? ids.get(poll.project) : undefined;
    const organisation = poll.organisation ? ids.get(poll.organisation) : undefined;
    const doc = pollPack({
      id: poll.id,
      url: poll.url,
      every: poll.every,
      ...(poll.grant ? { grant: poll.grant } : {}),
      ...(project ? { project } : {}),
      ...(organisation ? { organisation } : {}),
      measures: poll.measures,
    });
    const done = await door.propose({ question: `Poll ${hostOf(poll.url)} every ${poll.every} for ${and(poll.measures.map((m) => m.name))}?`, body_kind: 'pack', body: { install: pack, doc } });
    if (!done.ok) {
      if (unreachable(done)) throw new Unreachable();
      /* ALREADY INSTALLED, AND NOTHING NEWER: the record says so, and that is a poll filed before. */
      if (refused(done) && done.refusal.code === 'TRANSITION_ILLEGAL') report.polls.before++;
      else report.refused.push({ label: poll.label, register: 'Decide', fix: fixOf(done) });
      continue;
    }
    report.polls.filed++;
  }

  /**
   * A BANK PACK HIS DATA SHOWS HE USES, FILED ONCE, THE WAY A POLL IS, AND NOT FILED AT ALL ON A MONEY TOO OLD TO TAKE IT.
   *
   * `bank-hsbc-eg` requires money-core ^1.8.0, and on 1.7.0 the same twelve ids are still money-core's: the pack's own
   * header records that install being refused `PROVIDES_CONFLICT` on all twelve, a sentence about two packs owning one
   * declaration that does not say the step he is missing is Money's update. Filed anyway, it would sit on Decide as a
   * proposal that refuses the moment he presses it. So the version is read first and the report names the update.
   * A door that cannot say which packs it holds files unchecked, and the record's own refusal is then what he reads.
   */
  if (banks.length > 0 && decide !== null) {
    report.banks = { filed: 0, before: 0, waiting: [] };
    const held = door.packs ? await door.packs() : null;
    if (held !== null && !held.ok && unreachable(held)) throw new Unreachable();
    const money = held?.ok ? (held.value.find((p) => p.id === 'money-core') ?? null) : undefined;
    for (const bank of banks) {
      /* HELD IS AS GOOD AS OFFERED. The pack's header says whoever banks with HSBC Egypt may install it by hand, which
         leaves nothing on Decide, and `propose` does not refuse a pack the record already holds: reading Decide alone
         filed a second offer of a pack that was already reading his texts (`test/import-bank-pack.test.ts`). */
      if (installs.has(bank.install) || (held?.ok === true && held.value.some((p) => p.id === bank.install))) {
        report.banks.before++;
        continue;
      }
      const requires = isObj(bank.doc.requires) && isObj(bank.doc.requires.packs) ? bank.doc.requires.packs['money-core'] : undefined;
      if (typeof requires === 'string' && money !== undefined && !satisfies(money?.version ?? null, requires)) {
        report.banks.waiting.push(
          money === null
            ? `Reading ${bank.name} texts and mails (the ${bank.install} pack) was not filed on Decide: it reads messages into Money, and this BrainDog has no Money. Install Money, then run the import again.`
            : `Reading ${bank.name} texts and mails (the ${bank.install} pack) was not filed on Decide: it needs Money ${requires} and this BrainDog has Money ${money.version ?? 'at no version'}. Take the Money update, then run the import again.`,
        );
        continue;
      }
      if (o.dryRun) {
        report.banks.filed++;
        continue;
      }
      const done = await door.propose({ question: bank.question, body_kind: 'pack', body: { install: bank.install, doc: bank.doc } });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        if (refused(done) && done.refusal.code === 'TRANSITION_ILLEGAL') report.banks.before++;
        else report.refused.push({ label: bank.question, register: 'Decide', fix: fixOf(done) });
        continue;
      }
      report.banks.filed++;
    }
  }
  return report;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** A list said the way a sentence says it: `a, b and c`. */
const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${String(items.at(-1))}`);
const few = (items: string[], most = 8) => (items.length <= most ? items.join(', ') : `${items.slice(0, most).join(', ')} and ${String(items.length - most)} more`);

/** The report as the lines a person reads. */
export function said(report: Report, o: { dryRun: boolean; file: string }): string[] {
  const { plan } = report;
  const lines: string[] = [];
  const when = plan.taken ? `, exported ${plan.taken.slice(0, 10)}` : '';
  lines.push(`${o.dryRun || report.missing.length > 0 ? 'Read, and wrote nothing' : 'Imported'}: ${o.file}${when}.`);
  if (report.missing.length > 0) {
    const need = [...new Set(report.missing.map((r) => PROVIDED_BY[r] ?? r))];
    lines.push(`This BrainDog has no ${and(report.missing.map((r) => NAMES[r] ?? r))} lists, so nothing was written. Install ${and(need)} on this BrainDog first, then run the import again.`);
    return lines;
  }
  const verb = o.dryRun ? 'would be ' : '';
  for (const register of ORDER) {
    const t = report.tally[register];
    if (!t) continue;
    lines.push(`${NAMES[register] ?? register}: ${String(t.added)} ${verb}added, ${String(t.updated)} ${verb}updated, ${String(t.unchanged)} unchanged.`);
  }
  if (plan.asks.length > 0) lines.push(`Decide: ${String(report.asked)} ${o.dryRun ? 'would be asked' : 'asked'}, ${String(report.alreadyAsked)} asked before.`);
  if (plan.polls.length > 0)
    lines.push(`Polls: ${String(report.polls.filed)} ${o.dryRun ? 'would be filed' : 'filed'} on Decide for you to approve, ${String(report.polls.before)} filed before.`);
  if (report.banks) {
    lines.push(`Banks: ${String(report.banks.filed)} ${o.dryRun ? 'would be filed' : 'filed'} on Decide for you to approve, ${String(report.banks.before)} filed before.`);
    for (const w of report.banks.waiting) lines.push(`- ${w}`);
  }
  const estate = plan.rows.filter((r) => /^legacy:(date|domain|service):/u.test(r.key));
  if (estate.length > 0) {
    lines.push('', 'Dates, domains and services:');
    const kind = (r: PlannedRow) => (r.key.startsWith(`${KEY_PREFIX}date:`) ? 'Date' : r.key.startsWith(`${KEY_PREFIX}domain:`) ? 'Domain' : 'Service');
    const outcome = (r: PlannedRow) => {
      const was = report.outcomes[r.key];
      if (was === 'added') return o.dryRun ? 'would be added' : 'added';
      if (was === 'updated') return o.dryRun ? 'would be updated' : 'updated';
      if (was === 'refused') return 'refused';
      return 'unchanged';
    };
    for (const r of estate) lines.push(`- ${kind(r)}: ${r.label}, ${outcome(r)} (${NAMES[r.register] ?? r.register}).`);
  }
  if (report.changes.length > 0) {
    lines.push('', o.dryRun ? 'What would change:' : 'What changed:');
    const most = 40;
    for (const c of report.changes.slice(0, most)) lines.push(`- ${NAMES[c.register] ?? c.register}, ${c.label}: ${c.fields.join(', ')}.`);
    if (report.changes.length > most) lines.push(`- and ${String(report.changes.length - most)} more.`);
  }
  if (report.retired.length > 0) {
    const by = new Map<string, string[]>();
    for (const r of report.retired) by.set(r.why, [...(by.get(r.why) ?? []), `${NAMES[r.register] ?? r.register}, ${r.label}`]);
    lines.push('', o.dryRun ? 'What would be closed, and why:' : 'Closed, and why:');
    for (const [why, items] of by) lines.push(`- ${why} ${few(items)}.`);
  }
  if (report.clashes.length > 0) {
    lines.push('', 'Categories this BrainDog already has under that name:');
    for (const c of report.clashes)
      lines.push(`- ${c.label}: ${c.fix} ${c.rows === 0 ? 'No ledger row named it.' : c.rows === 1 ? 'One ledger row arrived without a category.' : `${String(c.rows)} ledger rows arrived without a category.`}`);
  }
  if (report.refused.length > 0) {
    /* A DRY RUN SENT NOTHING, so the record refused nothing yet: these are the rows the kernel's coercion says it will. */
    lines.push('', o.dryRun ? 'Would be refused by the record:' : 'Refused by the record:');
    for (const r of report.refused) lines.push(`- ${r.label} (${NAMES[r.register] ?? r.register}): ${r.fix}`);
  }
  if (plan.changed.length > 0) {
    lines.push('', 'Carried with a change:');
    for (const c of plan.changed) lines.push(`- ${c}`);
  }
  if (plan.skipped.length > 0) {
    lines.push('', 'Left out, and why:');
    for (const s of plan.skipped) lines.push(`- ${s.reason}: ${few(s.items)}.`);
  }
  if (report.examples > 0)
    lines.push(
      '',
      `This BrainDog still holds ${report.examples === 1 ? 'one example row' : `${String(report.examples)} example rows`} from setting up, beside your own. Open Home and press Clear the examples: it deletes only the examples nobody has changed.`,
    );
  lines.push('', 'No key value was read or sent. Keys are indexed by what they open; move a value with braindog keys put.');
  return lines;
}

/**
 * WHAT ONE RUN CARRIED, BY NAME, remembered on the machine that ran it so the next morning can be told.
 *
 * THE SHADOW WEEK IS THE REASON (`loop/research-switch.md` §3): the importer runs every night against a fresh export,
 * the old tool stays the one he works in, and the question each morning is what moved there and whether it arrived.
 * Until this, every answer to that was printed once at three in the morning to a terminal nobody was reading.
 *
 * WHY THIS FILE AND NOT THE RECORD'S OWN LOG, which does hold every write this import makes with its note on it
 * ("Imported from the old tool."). Two things the morning needs are not in it. A log line carries the one write it came
 * from (`batch`) and nothing groups the hundreds of writes of one run, so "since last night" has no edge to stop at.
 * And a row left out or refused was never written, so the log has no line for it at all, while "and was it carried"
 * is half of the question. So the report keeps what it already worked out, and nothing it did not: the rows added,
 * the rows updated with the fields that changed, each refusal with the record's sentence, and what was left out.
 * No value is kept, only names, so the file says nothing a stranger could not read off the report itself.
 */
export type Run = {
  at: string;
  host: string;
  file: string;
  taken: string | null;
  created: { register: string; label: string }[];
  updated: { register: string; label: string; fields: string[] }[];
  refused: { register: string; label: string; fix: string }[];
  skipped: { reason: string; items: string[] }[];
};

/** The run a report describes, as `--since` reads it back. */
export function runOf(report: Report, o: { at: string; host: string; file: string }): Run {
  /* A CHANGE IS RECORDED BEFORE ITS WRITE IS SENT, so an update the record then refused is in `changes` too. It is said
     once, as refused, and not also as carried. */
  const turnedDown = new Set(report.refused.map((r) => `${r.register}\n${r.label}`));
  return {
    at: o.at,
    host: o.host,
    file: o.file,
    taken: report.plan.taken,
    created: report.plan.rows.filter((r) => report.outcomes[r.key] === 'added').map((r) => ({ register: r.register, label: r.label })),
    updated: report.changes.filter((c) => !turnedDown.has(`${c.register}\n${c.label}`)).map((c) => ({ register: c.register, label: c.label, fields: c.fields })),
    refused: [...report.refused, ...report.clashes.map((c) => ({ register: 'categories', label: c.label, fix: c.fix }))],
    skipped: report.plan.skipped,
  };
}

/** Minutes east of UTC on this machine at that instant, so a night in summer time is read at its summer offset. */
const localOffset = (at: Date): number => -at.getTimezoneOffset();

/**
 * A run's instant as the owner's clock showed it: the day, the time and the zone, `UTC` when the offset is nothing.
 *
 * THE DAY `--since` TAKES IS THE MACHINE'S LOCAL DAY, NOT THE UTC DATE OF THE RUN
 * (`loop/research-batch-twenty-four-audit.md` §6). It was the UTC date, and at +03:00 a run at 02:30 on the 22nd is 23:30 UTC on the 21st, so `--since
 * 2026-09-22` read that morning said no run was remembered. The machine's zone and not the record's, because the morning
 * read is made with no host (it is what this machine remembers, and the host may be what failed in the night), and this
 * file knows no zone for the record anyway: the machine that ran the night is the machine being asked about it. The
 * offset is taken at the run's own instant, so a night before a change to or from summer time keeps the offset it had.
 */
function localClock(at: string, offsetOf: (at: Date) => number): { day: string; time: string; zone: string } {
  const instant = new Date(at);
  const offset = offsetOf(instant);
  const shifted = new Date(instant.getTime() + offset * 60_000).toISOString();
  const size = Math.abs(offset);
  const zone = offset === 0 ? 'UTC' : `${offset < 0 ? '-' : '+'}${String(Math.floor(size / 60)).padStart(2, '0')}:${String(size % 60).padStart(2, '0')}`;
  return { day: shifted.slice(0, 10), time: shifted.slice(11, 16), zone };
}

/**
 * The lines `--since` says: every run from `since` on (a day, `2026-09-21`) or the newest one (`last`), oldest first.
 *
 * WHAT WAS LEFT OUT ON THE NIGHT BEFORE AS WELL IS NOT SAID AGAIN. The synthetic export alone leaves out 29 things
 * under 23 reasons every night (measured on `test/legacy-export.ts`), and a morning that repeats them hides the one
 * that is new. So a run says only
 * what it left out that the run before it, into the same host, did not; the first run remembered says all of it.
 */
export function sinceSaid(runs: Run[], since: string, offsetOf: (at: Date) => number = localOffset): { found: number; lines: string[] } {
  if (runs.length === 0) return { found: 0, lines: ['No import run is remembered on this machine yet.'] };
  const local = runs.map((r) => localClock(r.at, offsetOf));
  const shown = since === 'last' ? [runs.length - 1] : runs.flatMap((_, i) => (local[i]!.day >= since ? [i] : []));
  if (shown.length === 0) return { found: 0, lines: [`No import run is remembered on this machine since ${since}.`] };
  const lines: string[] = [];
  for (const i of shown) {
    const run = runs[i]!;
    const before = runs.slice(0, i).findLast((r) => r.host === run.host);
    const had = new Set((before?.skipped ?? []).flatMap((s) => s.items.map((item) => `${s.reason}\n${item}`)));
    if (lines.length > 0) lines.push('');
    /* THE EXPORT'S DAY IN THE SAME ZONE AS THE HEADER IT SITS BESIDE. It was the UTC date, so at +03:00 an export taken
       at 01:30 on the 22nd sat beside a header saying the 22nd and was called an export of the 21st. A `taken` that is
       not an instant is printed as it came, because a guess at its day would be worse than its own words. */
    const taken = run.taken ? (Number.isNaN(Date.parse(run.taken)) ? run.taken.slice(0, 10) : localClock(run.taken, offsetOf).day) : null;
    lines.push(`${local[i]!.day} ${local[i]!.time} ${local[i]!.zone} into ${run.host}${taken ? `, export of ${taken}` : ''}:`);
    const start = lines.length;
    const byList = <T extends { register: string }>(rows: T[], say: (row: T) => string, head: string) => {
      const lists = new Map<string, string[]>();
      for (const row of rows) lists.set(row.register, [...(lists.get(row.register) ?? []), say(row)]);
      for (const [register, items] of lists) lines.push(`- ${head} ${NAMES[register] ?? register}: ${few(items)}.`);
    };
    byList(run.created, (r) => r.label, 'Created in');
    byList(run.updated, (r) => `${r.label} (${r.fields.join(', ')})`, 'Updated in');
    for (const r of run.refused) lines.push(`- Not carried, ${NAMES[r.register] ?? r.register}: ${r.label}. ${r.fix}`);
    for (const s of run.skipped) {
      const fresh = s.items.filter((item) => !had.has(`${s.reason}\n${item}`));
      if (fresh.length > 0) lines.push(`- Newly left out: ${few(fresh)}. ${s.reason}.`);
    }
    if (lines.length === start) lines.push('- Nothing moved in the old tool since the run before.');
  }
  return { found: shown.length, lines };
}

/** A day as `--since` takes one. Compared as text against a run's local day, which is why nothing looser is let in. */
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** Where the runs are remembered: beside the other state this command line keeps for itself. */
const runsFile = (home: string) => join(home, '.braindog', 'imports.jsonl');

/**
 * THE LAST SIXTY RUNS AND NO MORE: two months of nights is the shadow week several times over, and a file that grew
 * by a run a night for as long as the importer was scheduled would be read whole every morning for no reason.
 */
const RUNS_KEPT = 60;

const isText = (v: unknown): v is string => typeof v === 'string';
const isTexts = (v: unknown): boolean => Array.isArray(v) && v.every(isText);
/** Every item of a list is an object whose named keys are text, or lists of text for the keys in `many`. */
const itemsHold = (v: unknown, one: string[], many: string[] = []): boolean =>
  Array.isArray(v) && v.every((item) => isObj(item) && one.every((k) => isText(item[k])) && many.every((k) => isTexts(item[k])));

/**
 * A remembered line is a run only when every value `sinceSaid` reads off it has the shape `runOf` gives it.
 *
 * THE ITEMS ARE CHECKED AS WELL AS THE LISTS (`loop/research-batch-twenty-four-audit.md` §7). The lists alone were
 * checked, after a line with no `updated` had stopped `--since` on "rows is not iterable"; then a line whose `updated`
 * item had no `fields` stopped it again on "Cannot read properties of undefined (reading 'join')", with a good night on
 * the 19th before it unread. Only this code writes the file, so the trigger is a hand edit or a later version's shape,
 * and either one is one night the reader cannot trust, not a reason to read none of them.
 */
function isRun(run: unknown): run is Run {
  return (
    isObj(run) &&
    isText(run.at) &&
    !Number.isNaN(Date.parse(run.at)) &&
    isText(run.host) &&
    (run.taken === null || run.taken === undefined || isText(run.taken)) &&
    itemsHold(run.created, ['register', 'label']) &&
    itemsHold(run.updated, ['register', 'label'], ['fields']) &&
    itemsHold(run.refused, ['register', 'label', 'fix']) &&
    itemsHold(run.skipped, ['reason'], ['items'])
  );
}

/** The runs remembered, and the number in the file of each line that was passed over. */
function readRuns(home: string): { runs: Run[]; passed: number[] } {
  let text: string;
  try {
    text = readFileSync(runsFile(home), 'utf8');
  } catch {
    return { runs: [], passed: [] };
  }
  /* A LINE THAT DOES NOT PARSE OR IS NOT A RUN IS PASSED OVER, not fatal: one bad line should not cost the week before
     it. It is NAMED rather than dropped in silence, because a night missing from the morning with no word about why
     reads as a night that never ran. */
  const runs: Run[] = [];
  const passed: number[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let run: unknown;
    try {
      run = JSON.parse(line);
    } catch {
      run = undefined;
    }
    if (isRun(run)) runs.push(run);
    else passed.push(i + 1);
  });
  return { runs, passed };
}

/** Adds a run to the file, and answers the number of each line the rewrite let go because it could not be read as one. */
function rememberRun(home: string, run: Run): number[] {
  const file = runsFile(home);
  mkdirSync(join(home, '.braindog'), { recursive: true });
  const read = readRuns(home);
  const kept = [...read.runs, run].slice(-RUNS_KEPT);
  writeFileSync(`${file}.tmp`, `${kept.map((r) => JSON.stringify(r)).join('\n')}\n`);
  renameSync(`${file}.tmp`, file);
  return read.passed;
}

/** `braindog import legacy <file>`, and the exit code: 0 done, 1 refused or partly refused, 3 the host did not answer. */
export async function importCommand(args: string[], io: AgentIo, given?: string, now: () => Date = () => new Date(), offsetOf: (at: Date) => number = localOffset): Promise<number> {
  /* THE PLAN'S DAY IS THE OWNER'S LOCAL DAY, NOT THE UTC DATE. It was `toISOString().slice(0, 10)`, so a nightly run at
     22:30 at -03:00 planned on tomorrow's UTC date: a date due today was filed as already done, and a run at 01:30 at
     +03:00 planned on yesterday's. Taken from `now` and `offsetOf`, the same clock `--since` reads a run by. */
  const today = given ?? localClock(now().toISOString(), offsetOf).day;
  let values: { host?: string | undefined; 'dry-run'?: boolean | undefined; setup?: string | undefined; 'draft-setup'?: boolean | undefined; since?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' }, 'dry-run': { type: 'boolean' }, setup: { type: 'string' }, 'draft-setup': { type: 'boolean' }, since: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [source, file, ...more] = positionals;
  /* THE MORNING READ NEEDS NO EXPORT AND NO HOST: it is what this machine remembers of the nights before, and the
     host may be the very thing that did not answer at three in the morning. */
  if (source === 'legacy' && values.since !== undefined && !file) {
    if (values.since !== 'last' && !DAY.test(values.since)) {
      io.say('--since takes a day as 2026-09-21, or last.');
      return 1;
    }
    const read = readRuns(io.home);
    for (const n of read.passed) io.say(`Line ${String(n)} of ${runsFile(io.home)} is not a run as this command writes one, so it was passed over.`);
    const got = sinceSaid(read.runs, values.since, offsetOf);
    if (got.found === 0) {
      io.say(got.lines.join(' '));
      return 1;
    }
    for (const line of got.lines) io.out(line);
    return 0;
  }
  if (source !== 'legacy' || !file || more.length > 0 || values.since !== undefined) {
    io.say(USAGE);
    return 1;
  }
  const path = resolve(io.cwd, file);
  let text: string;
  try {
    if (statSync(path).size > IMPORT_MOST_BYTES) {
      io.say(`${file} is larger than an export this command reads.`);
      return 1;
    }
    text = readFileSync(path, 'utf8');
  } catch {
    io.say(`${file} could not be read.`);
    return 1;
  }
  const read = readLegacyTool(text);
  if (!read.ok) {
    io.say(read.fix);
    return 1;
  }
  if (values['draft-setup'] === true) {
    io.out(JSON.stringify(draftSetup(read.value), null, 2));
    return 0;
  }
  let setup: Setup | undefined;
  if (values.setup !== undefined) {
    let setupText: string;
    try {
      setupText = readFileSync(resolve(io.cwd, values.setup), 'utf8');
    } catch {
      io.say(`${values.setup} could not be read.`);
      return 1;
    }
    const got = readSetup(setupText);
    if (!got.ok) {
      io.say(got.fix);
      return 1;
    }
    setup = got.value;
  }
  const plan = planLegacyTool(read.value, today, setup);

  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const headers = await io.headers(to.key);
  const ms = budgetOf(io.env);
  /* ONE DEADLINE A REQUEST, not one for the run: an import is hundreds of requests, and each is as quick as any other. */
  const client = createClient({
    base: to.base,
    ...(to.token ? { token: to.token } : {}),
    fetch: async (input, init) => {
      const sent = new Headers(init?.headers);
      for (const [name, value] of Object.entries(headers)) sent.set(name, value);
      return fetch(input, { ...init, headers: sent, signal: AbortSignal.timeout(ms), redirect: 'error' });
    },
  });
  const door: Door = {
    schema: (register) => client.schema(register),
    list: (a) => client.list(a),
    create: (a) => client.create(a),
    update: (a) => client.update(a),
    governance: (a) => client.governance(a),
    propose: (a) => client.call('propose', a),
    packs: () => client.packs(),
  };
  let report: Report;
  try {
    report = await applyPlan(plan, door, { dryRun: values['dry-run'] === true, banks: banksOf(read.value) });
  } catch (e) {
    if (e instanceof Unreachable) {
      io.say(`${to.key} stopped answering part way. Run the import again: rows already written are found and not added twice.`);
      return 3;
    }
    /* NOTHING WAS WRITTEN, AND THAT IS THE POINT OF SAYING SO. Every list is read before the first row is sent, so a
       read that stopped part way leaves the record exactly as it was. An import that carried on would be working from
       a list it had only half seen, and would add a second copy of every row it did not reach. */
    if (e instanceof PartlyRead) {
      io.say(`${to.key} answered part of ${e.register} and then refused: ${e.fix}`);
      io.say('Nothing was written. An import that cannot read a list to the end cannot tell what is already there, and would write those rows a second time.');
      return 1;
    }
    throw e;
  }
  for (const line of said(report, { dryRun: values['dry-run'] === true, file })) io.out(line);
  /* A DRY RUN AND A RECORD SHORT OF ITS LISTS WROTE NOTHING, so neither is a night `--since` should report as carried.
     A run the host stopped answering part way returned above, and is not remembered either: what it wrote is found
     again and said as unchanged by the next one, which is the one sentence about it worth reading. */
  if (values['dry-run'] !== true && report.missing.length === 0) {
    let letGo: number[] = [];
    try {
      letGo = rememberRun(io.home, runOf(report, { at: now().toISOString(), host: to.key, file }));
    } catch {
      io.say(`This run was imported but could not be remembered in ${runsFile(io.home)}, so --since will not show it.`);
    }
    /* THE REWRITE KEEPS ONLY WHAT READS AS A RUN, so a line passed over each morning is gone after the next night. It is
       said here too, or a hand-edited line would vanish with nobody told. */
    for (const n of letGo) io.say(`Line ${String(n)} of ${runsFile(io.home)} was not a run as this command writes one, and was let go when this run was remembered.`);
  }
  /* A CLASHING CATEGORY IS AN EXIT 1 LIKE A REFUSAL IS, because something he asked for is not in the record and the
     run's next step is his: clear the examples, or rename, and import again. */
  return report.missing.length > 0 || report.refused.length > 0 || report.clashes.length > 0 ? 1 : 0;
}
