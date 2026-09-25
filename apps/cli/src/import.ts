/**
 * `braindog import <adapter> <export.json>`: move another tool's record into this BrainDog (`loop/research-switch.md`
 * §4, and brief B2 of the parity survey under `loop/`).
 *
 * THE ADAPTER IS NAMED ON THE LINE AND IS NOT THIS FILE (`adapter.ts` says what one is). It reads its tool's export
 * and plans the rows; this file applies the plan, and holds nothing about any one tool. A pack id names a folder in
 * `packs/` with an `adapter.ts` and a `map.json` in it, and a path names a module anywhere.
 *
 * IT WRITES AS ANY AGENT DOES, over the API, with the token this machine signed in with: `create` and `update` for rows
 * and `propose` for an open question. So it works the same on a self-host and on brain.dog, and it can do nothing a
 * signed-in agent could not. Installing the lists a plan writes into is the owner's, in the app; a record without them
 * is told which to install, and nothing is written. It writes as ONE RUN OF ITS OWN, never the folder's, and ends that
 * run `done` once the last write has answered: see the headers in `importCommand`.
 *
 * RE-RUNNING UPDATES, IT NEVER ADDS A SECOND ROW. Every row carries its adapter key in its tags (an agent run in its
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
 * THE OWNER'S SETUP COMES BESIDE THE EXPORT (`--setup`), for what the old tool never kept, such as the organisations he
 * runs and the numbers to poll. What it may hold is the adapter's to read. A poll is filed on Decide as a pack to
 * install, because it sends requests to another server and only the owner approves that. `--draft-setup` prints a
 * first one from the export, when the adapter can draft one.
 *
 * AND IT REMEMBERS WHAT EACH RUN CARRIED, so `--since` can say it the next morning. See `Run`.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { satisfies } from '@braindog/declare';
import type { KnownKeys } from '@braindog/declare/catalogue';
import { coerce, type FieldDecl } from '@braindog/kernel';
import { no, ok, refused, type Result } from '@braindog/ports';

import { budgetOf, hostsPath, target, type Target } from './http.ts';
import { pollPack } from '@braindog/seed/usecases/founder-poll';

import { TOOLS, folderCatalogue, holdsKey, isRef, loadAdapter, packFrom, type CatalogueRead, type ImportMap, type Offer, type Plan, type PlannedRow, type Settled, type Skipped } from './adapter.ts';
import { knownKeys } from './catalogue.ts';
import type { AgentIo } from './skills.ts';
import { readSource } from './usecase.ts';

import { createClient } from '@braindog/client';

const USAGE =
  'braindog import takes <adapter> <export.json> [--setup <setup.json>] [--map <map.json>] [--catalogue <folder or address>] [--host <host>] [--dry-run], or <adapter> <export.json> --draft-setup, or <adapter> --since <day or last>. The adapter is a pack in packs/ by its id, or the path of an adapter module.';

/** The options only an adapter import takes, which is how `main.ts` tells one from putting a .brainl file back. */
export const ADAPTER_OPTIONS = ['setup', 'map', 'catalogue', 'dry-run', 'draft-setup', 'since', 'bin-emptied'] as const;

/**
 * Whether a line after `braindog import` is an adapter import rather than a .brainl put back: two words before any
 * option, or any option only an adapter import takes. `braindog import <file.brainl>` takes one word and `--key` and
 * `--host`, so the two never meet.
 */
export function isAdapterImport(args: string[]): boolean {
  let words = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const name = arg.slice(2).split('=')[0]!;
      if ((ADAPTER_OPTIONS as readonly string[]).includes(name)) return true;
      if (!arg.includes('=') && (name === 'host' || name === 'key')) i++;
      continue;
    }
    words++;
  }
  return words >= 2;
}

/** The largest export this reads: the first one it read is about 108 KB of document and an audit of up to 100,000 lines. */
export const IMPORT_MOST_BYTES = 64 * 1024 * 1024;

type Row = { id: string; seq: number | null; version: number; fields: Record<string, unknown>; deleted_at?: string | null };

/** The part of the client an import uses, so a test can hand it a record of its own. */
export type Door = {
  schema: (register: string) => Promise<Result<unknown>>;
  /**
   * `deleted: true` ASKS FOR THE ROWS HE DELETED AS WELL AS THE LIVE ONES, each with its `deleted_at`, which is how the
   * import tells a row he threw away from a row nobody has written yet: see `gone` in `applyPlan`.
   *
   * A DOOR THAT ANSWERS LIVE ROWS ONLY IS NOT SAFE, and this sentence used to say it was. Nothing is read as deleted,
   * so nothing is held back, and every row he deleted is planned again as new: measured against a host at `19d4c785`
   * (the adapter's `test/import-deleted-skew.test.ts`), task 101 and ledger row T1 came back, `Tasks: 1 added` and `Ledger: 1 added`,
   * exit 0. So the importer's door asks as a POST, which every host decodes (`listWithDeleted`), and `applyPlan`
   * refuses an answer that holds nothing in the bin when the run before saw rows there that cannot have left it
   * (`BinUnread`).
   */
  list: (args: { register: string; limit?: number; cursor?: string | null; deleted?: boolean }) => Promise<Result<{ rows: unknown[]; cursor: string | null }>>;
  create: (args: { register: string; fields: Record<string, unknown>; note?: string }) => Promise<Result<unknown>>;
  update: (args: { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string }) => Promise<Result<unknown>>;
  governance: (args: { register?: string; status?: string; limit?: number; cursor?: string }) => Promise<Result<unknown>>;
  propose: (args: { question: string; body_kind: 'options' | 'pack' | 'change'; body: Record<string, unknown> }) => Promise<Result<unknown>>;
  /**
   * The packs this record holds and at which version: read only when a pack is to be offered (see `offer` in `applyPlan`).
   * OPTIONAL BECAUSE A DOOR WITHOUT IT STILL WORKS. The pack is then proposed unchecked, and a record that cannot take
   * it answers with its own refusal, which lands under "Refused by the record" like any other.
   */
  packs?: () => Promise<Result<{ id: string; version: string | null; disabled_at?: string | null }[]>>;
};

/**
 * A pack the adapter says the export shows he uses (`Offer`), with the document the host's catalogue holds for it, or
 * `null` and the sentence saying why the catalogue could not give it (`unfound`), which the report says in its place.
 */
export type PlannedPack = Offer & { doc: Record<string, unknown> | null; unfound?: string };
export type PlannedBank = PlannedPack;

export type Tally = { added: number; updated: number; unchanged: number };

/**
 * A ROW THE IMPORT'S OWN RETIRE PASS PUT IN THE BIN, BY ITS ID AND THE VERSION THE DELETE LEFT IT AT.
 *
 * The holdings retire deletes, because Holdings has no state to close a row with, and a deleted row is what `gone` in
 * `applyPlan` reads as his. Measured before this (the adapter's `test/import-own-deletes.test.ts`): a gold lot corrected 5 to 6 and
 * back to 5 in the old tool left no lot here, and the report said he had deleted it. The row itself does not say who
 * deleted it, so the run remembers it (`Run.binned`), and a row still in the bin at the version the import's delete
 * gave it is the import's. A row he put back and deleted again is at a later version, and is his.
 *
 * THE ID AND NOT THE KEY, because a holding's key is its kind, label, day, cost and quantity, and `imports.jsonl` keeps
 * names and never a value (`Run`).
 */
export type Binned = { id: string; version: number };

/**
 * A ROW ONE NIGHT'S READ SAW IN THE BIN, whoever put it there: its id, its list and when it was deleted.
 *
 * KEPT SO THE NEXT NIGHT CAN TELL AN EMPTY BIN FROM A BIN LEFT OUT OF THE ANSWER, which one answer cannot: a list with
 * no deleted row in it reads the same whether nothing is deleted or the host dropped `includeDeleted`, and the second
 * is every row he deleted added back as new (`BinUnread`). A row leaves the bin three ways the import can see or
 * reckon: put back, and it is live in the answer; deleted again, and it is still there; or swept by the record's purge,
 * which takes a row thirty days after `since` (`packages/kernel/src/index.ts`, `sweepRecord`). An id and a time name
 * nothing a stranger could read off him, which is the rule `Run` keeps.
 */
export type InBin = { id: string; register: string; since: string };

/** The record's sweep takes a deleted row thirty days on; a day less, so a clock a little apart never refuses a swept bin. */
const SWEPT_AFTER_MS = 29 * 86_400_000;

/** A row written without the row it names, as both reports say it: see `Report.unfiled`. */
export type Unfiled = { register: string; label: string; names: { register: string; label: string }[] };

/** A question settled in the old tool and still open on Decide here, as both reports say it: see the adapter's `settled`. */
export type Waiting = { label: string; question: string | null; answer: string };

export type Report = {
  missing: string[];
  tally: Record<string, Tally>;
  asked: number;
  alreadyAsked: number;
  /**
   * Each question this run asked on Decide (or, on a dry run, would ask), by its the old tool id and its words.
   *
   * KEPT BY NAME AND NOT ONLY COUNTED, because the morning read is made from what a run remembers and a count says
   * nothing he can act on: over the shadow week's seven made-up nights a question asked on night 3 was on Decide and
   * not in `--since last` at all (`loop/research-shadow-week.md` §2 night 3).
   *
   * THIS AND `waiting` ARE OPTIONAL ONLY FOR A REPORT WRITTEN OUT BY HAND, which `test/import.test.ts` does to test
   * `said`; `applyPlan` always sets both, and every reader takes a missing one as empty.
   */
  questions?: { label: string; question: string }[];
  /**
   * Each question the old tool has answered or put away that an earlier run asked here and nobody has answered on Decide:
   * `answer` is what the old tool did with it, `decided there as D5` or `dismissed there`. See `Settled`.
   */
  waiting?: Waiting[];
  /** Polls filed on Decide, and those already filed or installed. */
  polls: { filed: number; before: number };
  /**
   * Bank packs filed on Decide, those filed before, and a sentence for each one held back because the record's Money is
   * too old to take it. Absent when the run was handed no bank to offer.
   */
  banks?: { filed: number; before: number; waiting: string[] };
  /** The same for every other pack the export shows he needs (`Offer`), counted apart so Banks stays about banks. */
  packs?: { filed: number; before: number; waiting: string[] };
  /**
   * The words the old tool used that a closed list here did not hold (`PlannedRow.own`), each said as `crypto as a kind in
   * Holdings`: added to its list by this run, filed on Decide and waiting, or asked about before. Absent when there were
   * none.
   */
  values?: { added: string[]; filed: string[]; before: string[] };
  /** Each row that changes, with the fields that change. */
  changes: { register: string; label: string; fields: string[] }[];
  refused: { label: string; register: string; fix: string }[];
  /** Each row an earlier import left on a list this one no longer writes to, closed so it is not counted twice. */
  retired: { register: string; label: string; why: string }[];
  /** A category name this record already holds, and how many ledger rows arrived without it as a result. */
  clashes: { label: string; rows: number; fix: string }[];
  /** Example rows setting up planted, found in the lists the import writes to: the report suggests clearing them on Home. */
  examples: number;
  /**
   * Each planned row he deleted in this BrainDog, held back rather than written again: see `gone` in `applyPlan`.
   * OPTIONAL FOR THE SAME REASON AS `questions`: `applyPlan` always sets it, and a report written by hand may not.
   */
  deleted?: { register: string; label: string }[];
  /**
   * Each row the retire pass left in the bin, tonight or on an earlier night, and still in it: see `Binned`.
   * OPTIONAL FOR THE SAME REASON AS `questions`.
   */
  binned?: Binned[];
  /** Every row tonight's read saw in the bin (`InBin`). Optional for the same reason as `questions`. */
  bin?: InBin[];
  /**
   * Each row written without a row it names, because the row named is one he deleted here (`deleted`): the task a new
   * export files under a project he threw away. Optional for the same reason.
   */
  unfiled?: Unfiled[];
  /** What happened to each planned row, by its key: the report lists the kinds the mapping names one by one. */
  outcomes: Record<string, 'added' | 'updated' | 'unchanged' | 'refused' | 'deleted'>;
  plan: Plan;
  /** What the report is said in (`Words`). Optional for a report written by hand, which is then said by the plan's ids. */
  words?: Words;
};

/**
 * WHAT A RUN SAYS THINGS IN: the tool the export came from, and the mapping's lists, their names and what installs each.
 *
 * THE NAMES ARE THE MAPPING'S AND NOT THIS FILE'S, and a list the mapping writes is named there or the mapping is
 * refused (`readMap`). They were a table here, a file away from the list of lists it had to cover, and three times a
 * list was added to the one and not the other, so the report printed `installments: 1 added` and then `fx` at a person
 * where the page says Instalments and Exchange rates. Held to each other where they are read, a list with no name is a
 * sentence before the first row is sent rather than an id in the report.
 *
 * A PLAN APPLIED WITHOUT A MAPPING, as a test that writes its own plan does, writes its lists in the order its rows
 * first name them and names each by its id.
 */
export type Words = { source: string; map: ImportMap };

/** The words a plan is said in when nobody gave any: see `Words`. */
export const plainWords = (plan: Plan): Words => ({
  source: 'the export',
  map: { targets: { order: [...new Set(plan.rows.map((r) => r.register))], optional: [], providedBy: {}, names: {} }, usecase: null, listed: null, raw: {} },
});

/** What the report calls a list: the mapping's name for it, or its id. */
const nameIn = (w: Words, register: string): string => w.map.targets.names[register] ?? register;

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

/** The key a row was imported under, by the plan's prefix: in its tags, or in `client_id` for an agent run. */
const keyOf = (prefix: string, register: string, fields: Record<string, unknown>): string | null => {
  if (register === 'session') return typeof fields.client_id === 'string' && fields.client_id.startsWith(prefix) ? fields.client_id : null;
  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  return (tags.find((t) => typeof t === 'string' && t.startsWith(prefix)) as string | undefined) ?? null;
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
 * AN ANSWER THAT HELD NOTHING IN THE BIN WHEN THE RUN BEFORE SAW ROWS THERE THAT COULD NOT HAVE LEFT IT (`InBin`).
 *
 * The read that asks for deleted rows cannot show by itself that the host honoured the ask. A host at `19d4c785`
 * answered the GET `dc9ec9e4` sent with live rows alone, 200 (`loop/research-batch-fifty-five-audit.md` section 1),
 * and the import took that as a bin with nothing in it and planned every row he had deleted as new. So the answer is
 * held to what the run before saw: when it holds no deleted row at all, and a row the run before saw in the bin is
 * neither in tonight's answer nor old enough for the sweep to have taken, the host left the bin out. Thrown before any
 * write, like `PartlyRead`, and for the same reason: every write after it would be working from the wrong list.
 */
class BinUnread extends Error {
  lists: string[];
  rows: number;
  constructor(lists: string[], rows: number) {
    super(`${String(rows)} rows missing from the bin of ${lists.join(', ')}`);
    this.lists = lists;
    this.rows = rows;
  }
}

/**
 * Every row of one list, page by page, the rows he deleted included (`Door.list`, `deleted`).
 *
 * THE PAGE BUDGET IS A REFUSAL AND NOT A `break`, for the same reason: the record pages a list at 500 rows, so a
 * thousand pages is half a million rows in one list, and a run that reached it would have been carrying on with an
 * answer that was missing everything past it.
 */
async function readAll(door: Door, register: string, name: string): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 1000; pages++) {
    const got = await door.list({ register, limit: 500, deleted: true, ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) {
      if (unreachable(got)) throw new Unreachable();
      throw new PartlyRead(name, fixOf(got));
    }
    for (const r of got.value.rows) if (isObj(r) && typeof r.id === 'string' && isObj(r.fields)) out.push(r as unknown as Row);
    cursor = got.value.cursor;
    if (cursor === null) return out;
  }
  throw new PartlyRead(name, `This list is longer than an import reads in one run (${String(out.length)} rows and more).`);
}

/**
 * The keys of every question already asked, every pack already offered or installed, and every value already proposed
 * to a closed list, as `valueKey` spells one.
 */
type Decide = { asked: Set<string>; open: Set<string>; installs: Set<string>; values: Set<string> };

/** One value proposed to one closed list, as `Decide.values` holds it. */
const valueKey = (register: string, field: string, value: string) => `${register}\n${field}\n${value}`;

/** The most rows one governance read answers with: the record clamps it there (`packages/kernel/src/govern.ts`). */
const DECIDE_PAGE = 200;

/**
 * HOW MANY WRITES OF ONE LIST ARE IN FLIGHT AT ONCE, AND WHY EIGHT.
 *
 * His first run is one write per row, about 3,315 of them, and it is the run the freeze waits on. Sent one at a time,
 * each write waited out its own round trip before the next was sent. Measured on 23 September through the Worker in
 * workerd with a fixed delay put on every request (the adapter's `test/import-throughput.test.ts` has the method), for the 44-row
 * fixture grown by 320 tasks, 400 requests in all:
 *
 *   at a time:   1        4        8        16
 *   0 ms       6.0 s    3.2 s    2.7 s
 *   50 ms     31.8 s   12.9 s    9.5 s
 *   150 ms    74.4 s   28.3 s   18.8 s   15.1 s
 *
 * A Durable Object serialises its writes, so what this buys is the network's wait and not the record's. The 0 ms row is
 * what is left with no network, the record's work and the client's, and eight at once takes it from 6.0 s to 2.7 s.
 * Eight is where the curve bends: sixteen took another 3.7 s off at 150 ms, and doubles what one importer
 * holds open against one record. What none of this shortens is the 33 requests a run makes around its writes (each
 * list's schema and rows, Decide, the packs), which stay one at a time, and a second run is nothing but those: 5.9 s at
 * 150 ms whatever this number is.
 */
const WRITES_AT_ONCE = 8;

/**
 * Everything on Decide, A PAGE AT A TIME, because the question this read answers is "has he already been asked this".
 *
 * ONE READ OF 200 WAS THE WHOLE OF IT, AND THE CEILING IS A LIFETIME ONE: every draft Slash filed, every pack offered
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
  const open = new Set<string>();
  const installs = new Set<string>();
  const values = new Set<string>();
  let cursor: string | undefined;
  for (let pages = 0; pages < 1000; pages++) {
    const got = await door.governance({ register: 'suggestion', status: 'all', limit: DECIDE_PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!got.ok) return got;
    if (!Array.isArray(got.value)) return ok({ asked, open, installs, values });
    for (const s of got.value)
      if (isObj(s) && isObj(s.body)) {
        if (typeof s.body.from === 'string') asked.add(s.body.from);
        /* WHICH OF THOSE NOBODY HAS ANSWERED HERE, so a question the old tool has settled since can be said as still
           waiting on Decide: see `Settled`. */
        if (typeof s.body.from === 'string' && s.status === 'open') open.add(s.body.from);
        if (typeof s.body.install === 'string') installs.add(s.body.install);
        /* A VALUE PROPOSED BY ANYBODY, IN ANY STATE. An open one is waiting on him, and one he turned down is an answer:
           proposing it again every night is asking a question he has already answered. The record stores an addition as
           it was asked (`packages/record/test/schema-add.test.ts`, B3), so the words are here as they were filed. */
        const add = isObj(s.body.to) && isObj(s.body.to.add) ? s.body.to.add : null;
        if (add && typeof add.register === 'string' && isObj(add.values))
          for (const [field, more] of Object.entries(add.values))
            for (const value of Array.isArray(more) ? more : []) if (typeof value === 'string') values.add(valueKey(add.register, field, value));
      }
    if (got.value.length < DECIDE_PAGE) return ok({ asked, open, installs, values });
    const last = got.value.at(-1);
    /* A PAGE OF THE LIMIT AND NO ID TO PAGE ON is a read that cannot be finished, and carrying on with what it has is
       the bug this function was written for. */
    if (!isObj(last) || typeof last.id !== 'string') return no('VALUE_MALFORMED', 'A page of Decide came back with no id to read the next page from.', { at: 'cursor' });
    cursor = last.id;
  }
  return no('OUT_OF_BOUNDS', `Decide holds more than ${String(DECIDE_PAGE * 1000)} rows, which is more than an import reads in one run.`);
}

export type { Settled };

/**
 * A range as a sentence says it: `>=2.0.0` is "2.0.0 or later" and `>=1.8.0 <3.0.0` is "1.8.0 or later, before 3.0.0".
 * A person reads these lines, and `>=1.8.0 <3.0.0` is the grammar's spelling and not an English one. Any other range is
 * printed as it is written, which is at least exact.
 */
const rangeWords = (range: string): string => {
  const both = /^>=\s*(\S+)\s+<\s*(\S+)$/u.exec(range.trim());
  if (both) return `${both[1]!} or later, before ${both[2]!}`;
  const floor = /^>=\s*(\S+)$/u.exec(range.trim());
  return floor ? `${floor[1]!} or later` : range;
};

/**
 * Apply a plan through a door. Refs are resolved to the id of the row they name once it is written; a ref to a row in
 * the same list written later is set in a second pass.
 */
export async function applyPlan(
  given: Plan,
  door: Door,
  o: {
    dryRun: boolean;
    /** What the run is said in: the tool the export came from, and the mapping. Without it, `plainWords`. */
    words?: Words;
    banks?: PlannedPack[];
    packs?: PlannedPack[];
    settled?: Settled[];
    /** The rows earlier runs into this record put in the bin themselves (`Binned`), as `imports.jsonl` remembers them. */
    binned?: readonly Binned[];
    /** The newest `taken` of an export an earlier run carried into this record: see `older` below. */
    newest?: string | null;
    /**
     * What the last run into this record that kept one saw in the bin (`InBin`), and the instant of tonight's run, which
     * the sweep's thirty days are counted back from. Without `bin` the answer is taken as it comes (`BinUnread`).
     */
    bin?: readonly InBin[];
    now?: number;
    /** He says the bin was emptied some way the import cannot see, so an answer with nothing in it is believed. */
    binEmptied?: boolean;
    /**
     * Handed the report as soon as it exists, so a run the host stops answering part way still has what it did by then:
     * see `Unreachable` in `importCommand`.
     */
    progress?: { report: Report | null };
  },
): Promise<Report> {
  let plan = given;
  const words = o.words ?? plainWords(given);
  const { order, providedBy } = words.map.targets;
  const optional = new Set(words.map.targets.optional);
  const name = (register: string) => nameIn(words, register);
  /* WHAT A MISSING LIST IS INSTALLED BESIDE, when the mapping says: the use case the rest of the lists came with. */
  const beside = words.map.usecase ? ` beside ${words.map.usecase}` : '';
  const questions: NonNullable<Report['questions']> = [];
  const waiting: Waiting[] = [];
  const deleted: NonNullable<Report['deleted']> = [];
  const binned: Binned[] = [];
  const bin: InBin[] = [];
  const unfiled: Unfiled[] = [];
  const report: Report = {
    missing: [],
    tally: {},
    asked: 0,
    alreadyAsked: 0,
    questions,
    waiting,
    polls: { filed: 0, before: 0 },
    changes: [],
    refused: [],
    retired: [],
    clashes: [],
    examples: 0,
    deleted,
    binned,
    bin,
    unfiled,
    outcomes: {},
    plan,
    words,
  };
  if (o.progress) o.progress.report = report;
  let registers = order.filter((r) => plan.rows.some((row) => row.register === r));

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
  /** The "Left out" line for each list the record has not got, by list, so the pack offers below can reword it. */
  const leftOut = new Map<string, Skipped>();
  /** The fields each list declares, where the record's answer says: see `unheld` below. */
  const declared = new Map<string, Set<string>>();
  /** Every list the record answered for, so the sentence about a missing one can tell an old pack from no pack. */
  const answered = new Set<string>();
  /** The text fields each list declares, whole, so a dry run can put a row's texts to the kernel's own coercion. */
  const texts = new Map<string, Map<string, FieldDecl>>();
  /** Each closed list's values as the record states them, by list and field: see `own` below. */
  const closed = new Map<string, Map<string, Set<string>>>();
  for (const register of [...registers, ...spare] as string[]) {
    const has = await door.schema(register);
    if (has.ok) answered.add(register);
    if (!has.ok) {
      if (unreachable(has)) throw new Unreachable();
      if (optional.has(register) || spare.includes(register)) absent.push(register);
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
      closed.set(
        register,
        new Map(fields.flatMap((f) => (isObj(f) && typeof f.id === 'string' && f.type === 'enum' && Array.isArray(f.values) ? [[f.id, new Set(f.values.filter((v): v is string => typeof v === 'string'))]] : []))),
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
     * `PROVIDED_BY.holdings` named `Money 1.5.0` then, and a record on Money 1.4.0 was told "Install Money 1.5.0 beside
     * Solo founder": a pack the catalogue shows it as already holding, where the thing to press is the update. (Since
     * money-core 2.0.0 that line names the Holdings pack, with no version, so it takes the install branch.) The record
     * does not answer which version it holds, so the question asked is the one it can answer: does it hold any other
     * list the same pack provides. If it does, the pack is installed and older. Only a provider with a version in it
     * is asked about, because "Update Estate" names no version to update to and is not a sentence anybody can act on.
     */
    const lead = new Map<string, string>();
    for (const register of new Set(out.map((r) => r.register))) {
      const by = providedBy[register] ?? register;
      const versioned = /^(.+) (\d+\.\d+\.\d+)$/u.exec(by);
      if (!versioned) {
        lead.set(register, `Install ${by}${beside}`);
        continue;
      }
      const pack = versioned[1]!;
      const version = versioned[2]!;
      const siblings = Object.entries(providedBy).flatMap(([r, p]) => (r !== register && (p === pack || p.startsWith(`${pack} `)) ? [r] : []));
      let held = siblings.some((r) => answered.has(r));
      for (const r of siblings) {
        if (held) break;
        if (absent.includes(r) || report.missing.includes(r)) continue;
        const has = await door.schema(r);
        if (!has.ok && unreachable(has)) throw new Unreachable();
        held = has.ok;
      }
      lead.set(register, held ? `Update ${pack} to ${version}` : `Install ${by}${beside}`);
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
          .map((register) => {
            const line = {
              reason: `This BrainDog has no ${name(register)} list. ${lead.get(register) ?? `Install ${providedBy[register] ?? register}${beside}`}, then run the import again to bring these in`,
              items: out.filter((r) => r.register === register).map((r) => r.label),
            };
            leftOut.set(register, line);
            return line;
          }),
      ],
    };
    report.plan = plan;
    registers = registers.filter((r) => !absent.includes(r));
  }
  /* A ROW WITH ANOTHER SHAPE FOR A RECORD THAT DECLARES MORE (`PlannedRow.ifDeclared`): a project brief lands in the
     project brief pack's own fields where the record has them, and as note prose where it does not (`packs/project-brief`).
     WHERE THE ROW NAMES THE PACK, THE PACK IS ASKED FOR TOO, because its fields stay declared after it is uninstalled
     and nothing draws them then (`ifDeclared.pack`). Off counts as not held: its pages are gone as well. A door that
     cannot answer, answers with a refusal, or answers something other than a list leaves the fields alone to decide, as
     they did before: the stub host in `test/import.test.ts` answers `{}` to every route it does not know, and reading
     that as a list threw and ended three runs. */
  let on: Set<string> | null = null;
  if (door.packs && plan.rows.some((r) => r.ifDeclared?.pack !== undefined)) {
    const got = await door.packs();
    if (!got.ok && unreachable(got)) throw new Unreachable();
    if (got.ok && Array.isArray(got.value)) on = new Set(got.value.filter((p) => isObj(p) && typeof p.id === 'string' && !p.disabled_at).map((p) => p.id));
  }
  plan = {
    ...plan,
    rows: plan.rows.map((r) =>
      r.ifDeclared !== undefined && (r.ifDeclared.pack === undefined || on === null || on.has(r.ifDeclared.pack)) && r.ifDeclared.needs.every((f) => declared.get(r.register)?.has(f))
        ? (({ lacking: _dropped, ...rest }) => ({ ...rest, fields: { ...r.fields, ...r.ifDeclared!.fields }, ...(r.ifDeclared!.lacking === undefined ? {} : { lacking: r.ifDeclared!.lacking }) }))(r)
        : r,
    ),
  };
  report.plan = plan;
  /* WHAT A ROW CARRIES ON A RECORD WITHOUT A LIST IT LEANS ON (`PlannedRow.lacking`): a project's note keeps the domains
     that would otherwise have arrived as Services rows, because on this record they arrive as nothing. */
  if (plan.rows.some((r) => r.lacking !== undefined && absent.includes(r.lacking.register))) {
    plan = { ...plan, rows: plan.rows.map((r) => (r.lacking !== undefined && absent.includes(r.lacking.register) ? { ...r, fields: { ...r.fields, ...r.lacking.fields } } : r)) };
    report.plan = plan;
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
          reason: `This BrainDog's ${name(register)} list has no ${field} field yet, so each of these is sent without its ${field} and with everything else. Update ${(providedBy[register] ?? register).replace(/ \d+\.\d+\.\d+$/u, '')}, then run the import again to bring it in`,
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
  /**
   * DECIDE, READ ONCE FOR THE WHOLE RUN, and `null` when it could not be read, with the refusal said once. The values below
   * need it before the first row is written and the questions and packs need it after the last one; two reads would be
   * two refusal lines for one failure. Why a failed read asks nothing rather than asking everything is said above
   * `decide`, further down.
   */
  let decideRead: Decide | null | undefined;
  const readDecideOnce = async (): Promise<Decide | null> => {
    if (decideRead !== undefined) return decideRead;
    const got = await readDecide(door);
    if (got.ok) return (decideRead = got.value);
    if (unreachable(got)) throw new Unreachable();
    report.refused.push({ label: 'What this record has already been asked', register: 'Decide', fix: fixOf(got) });
    return (decideRead = null);
  };

  /**
   * A WORD THE OLD TOOL USED THAT A CLOSED LIST HERE HAS NOT GOT IS PROPOSED TO THE LIST, BEFORE ANY ROW IS WRITTEN.
   *
   * Measured before this (the adapter's `test/import-values.test.ts`): a `crypto` holding arrived as `other`, a `registrar` service as
   * `hosting` and an `investor` as `collaborator`, and two of the three said nothing. The record grows a closed list at
   * run time: an `add` of values is answered by rule and lands at once when the owner's own key files it, and waits on
   * Decide when anybody else does (DIRECTION §22). So each list gets ONE `add` carrying every word it is missing, and a
   * row carries its word only once the list holds it. Written before that, the row is `ENUM_VALUE_UNKNOWN` whole, and a
   * question nobody has answered yet would cost him the row; written with the fallback, the next import after he
   * approves moves it, because `applyPlan` patches a field whose planned value differs.
   *
   * ONLY AGAINST A SCHEMA ANSWER THAT STATES ITS VALUES. A door answering `{ register }` alone says nothing about any
   * list, and proposing every word to it every night, with no way to tell whether one had landed, would be a question
   * a night on Decide.
   */
  const wanted = new Map<string, Map<string, string[]>>();
  for (const row of plan.rows)
    for (const [field, word] of Object.entries(row.own ?? {})) {
      const has = closed.get(row.register)?.get(field);
      if (has === undefined || typeof word !== 'string' || has.has(word)) continue;
      const fields = wanted.get(row.register) ?? new Map<string, string[]>();
      const words = fields.get(field) ?? [];
      if (!words.includes(word)) words.push(word);
      wanted.set(row.register, fields.set(field, words));
    }
  if (wanted.size > 0) {
    const values: NonNullable<Report['values']> = { added: [], filed: [], before: [] };
    report.values = values;
    const decided = await readDecideOnce();
    for (const [register, fields] of decided === null ? [] : wanted) {
      const put = (field: string, word: string) => `${word} as a ${field} in ${name(register)}`;
      const fresh: Record<string, string[]> = {};
      for (const [field, words] of fields)
        for (const word of words)
          if (decided!.values.has(valueKey(register, field, word))) values.before.push(put(field, word));
          else (fresh[field] ??= []).push(word);
      const named = Object.entries(fresh).flatMap(([field, words]) => words.map((word) => put(field, word)));
      if (named.length === 0) continue;
      if (o.dryRun) {
        values.filed.push(...named);
        continue;
      }
      const done = await door.propose({ question: `Add ${and(named)}?`, body_kind: 'change', body: { declaration_id: `register.${register}`, to: { add: { register, values: fresh } } } });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        report.refused.push({ label: `Add ${and(named)}`, register: 'Decide', fix: fixOf(done) });
        continue;
      }
      /* `landed` IS THE RECORD SAYING THE LIST HOLDS THE WORDS NOW (`packages/record/src/index.ts`, `additive`). Without
         it the addition is an open question, whatever the reason, and the rows keep the list's own word. */
      if (!(isObj(done.value) && isObj(done.value.landed))) {
        values.filed.push(...named);
        continue;
      }
      for (const [field, words] of Object.entries(fresh)) for (const word of words) closed.get(register)?.get(field)?.add(word);
      values.added.push(...named);
    }
  }
  if (plan.rows.some((r) => r.own !== undefined)) {
    plan = {
      ...plan,
      rows: plan.rows.map((r) => {
        const put = Object.entries(r.own ?? {}).filter(([field, word]) => typeof word === 'string' && closed.get(r.register)?.get(field)?.has(word) === true);
        return put.length > 0 ? { ...r, fields: { ...r.fields, ...Object.fromEntries(put) } } : r;
      }),
    };
    report.plan = plan;
  }

  let retiring = (plan.retire ?? []).filter((r) => !absent.includes(r.register) && !absent.includes(r.replaces));
  /**
   * AN EXPORT TAKEN BEFORE ONE AN EARLIER RUN CARRIED INTO THIS RECORD CLOSES NOTHING.
   *
   * Every retire reads tonight's export against itself, so a row only a newer export held reads as gone from the old
   * tool. Measured before this (the adapter's `test/import-older-export.test.ts`, `loop/research-batch-fifty-three-audit.md` section
   * 3): an export of 2026-09-16 and then a saved one of 2026-09-09 dropped the newer one's task, voided its ledger row
   * dated inside the older ledger's days, and deleted its gold lot, each said as gone from the old tool. The ledger's own
   * window (`Retire.inside`) spares only a row dated after the older export's newest day. So the whole pass is skipped,
   * with one line naming both days, and the rows the older export holds are written as they stand in it.
   *
   * COMPARED AS INSTANTS, and only when both are one: a `taken` that is not a date cannot be said to be older than
   * anything, and a night that cannot say so closes as it did before.
   */
  const newest = o.newest ?? null;
  if (retiring.length > 0 && newest !== null && plan.taken !== null && Date.parse(plan.taken) < Date.parse(newest)) {
    const sameDay = plan.taken.slice(0, 10) === newest.slice(0, 10);
    const when = (taken: string) => (sameDay ? `${taken.slice(0, 16).replace('T', ' ')} UTC` : taken.slice(0, 10));
    plan = {
      ...plan,
      skipped: [
        ...plan.skipped,
        {
          reason: `Nothing an earlier import carried was closed tonight in these lists, because this export was taken on ${when(plan.taken)} and an earlier import into this BrainDog carried one taken on ${when(newest)}: a row this one does not hold may only be newer than it. Every row it does hold was written as it stands in this export, so a row changed since reads as it did then until the newest export is imported again`,
          items: [...new Set(retiring.map((r) => name(r.register)))],
        },
      ],
    };
    report.plan = plan;
    retiring = [];
  }

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
  /**
   * EVERY KEY A ROW HE DELETED HERE STILL HOLDS, AND THE PLAN DOES NOT WRITE ONE OF THEM AGAIN.
   *
   * `readAll` listed live rows only, and a planned key no live row holds is a row to create, so a task or a ledger row
   * he deleted in BrainDog was added back by the next night's import, which is every night of the shadow week: the old
   * tool is still where he works, and its export still holds the row (the adapter's `test/import-deleted-stays.test.ts`, measured
   * before this: `Tasks: 1 added` and `Ledger: 1 added` for the two rows deleted). A deleted row is still a row in the
   * record until it is purged, with its tags, so its key is read with the live ones and set aside here.
   *
   * A LIVE ROW UNDER THE SAME KEY WINS. A record the import ran on before this holds, for each row he deleted, the
   * deleted one and the copy the next night added back; that copy is his now, and it is updated as any live row is.
   * And a deleted row takes no example count and no category name, because the record's unique index on a name is on
   * live rows alone (`packages/kernel/src/declare.ts`, `deleted_at IS NULL`).
   *
   * AND A ROW THE IMPORT PUT IN THE BIN ITSELF IS NOT ONE HE DELETED (`Binned`): its key is written again the night the old
   * tool holds it again, and the row is remembered once more for as long as it stays in the bin, so a memory older
   * than the sixty runs `imports.jsonl` keeps does not turn it into his.
   */
  const gone = new Set<string>();
  const ours = new Map((o.binned ?? []).map((b) => [b.id, b.version]));
  const read = [...new Set([...registers, ...retiring.map((r) => r.register)])];
  /** Every id tonight's answer holds, live or deleted, which is how a row the run before saw in the bin is accounted for. */
  const inAnswer = new Set<string>();
  for (const register of read)
    for (const row of await readAll(door, register, name(register))) {
      inAnswer.add(row.id);
      if (typeof row.deleted_at === 'string' && row.deleted_at !== '') {
        bin.push({ id: row.id, register, since: row.deleted_at });
        if (ours.get(row.id) === row.version) {
          binned.push({ id: row.id, version: row.version });
          continue;
        }
        const key = keyOf(plan.key, register, row.fields);
        if (key) gone.add(key);
        continue;
      }
      if (Array.isArray(row.fields.tags) && row.fields.tags.includes('example')) report.examples++;
      if (register === 'categories' && typeof row.fields.name === 'string') named.set(row.fields.name.toLowerCase(), row);
      const key = keyOf(plan.key, register, row.fields);
      if (key) {
        existing.set(key, row);
        ids.set(key, row.id);
        where.set(key, register);
      }
    }
  /* NOTHING IN THE BIN IS BELIEVED ONLY WHEN IT CAN BE (`BinUnread`): a row the run before saw there is put back and
     so in the answer, or old enough for the sweep. A row whose list is not read tonight says nothing either way. Only
     a whole answer with no deleted row in it is held to this, because a host that drops the argument drops it for
     every list, and one row he put back beside another still deleted is an answer that plainly holds the bin. */
  if (bin.length === 0 && o.bin !== undefined && o.binEmptied !== true) {
    const now = o.now ?? Date.now();
    const lists = new Set(read);
    const unread = o.bin.filter((b) => lists.has(b.register) && !inAnswer.has(b.id) && !(Date.parse(b.since) <= now - SWEPT_AFTER_MS));
    if (unread.length > 0) throw new BinUnread([...new Set(unread.map((b) => name(b.register)))], unread.length);
  }

  const later: { row: PlannedRow; field: string; value: unknown }[] = [];
  /**
   * A planned value with its refs put as ids, or `undefined` when one names a row that is not written yet. `known` is
   * the keys a row may resolve against, taken when its write started: see `writeRow`.
   */
  const resolveValue = (v: unknown, known?: ReadonlySet<string>): unknown => {
    const idOf = (key: string) => (known === undefined || known.has(key) ? ids.get(key) : undefined);
    if (isRef(v)) return idOf(v.$ref);
    if (Array.isArray(v) && v.some(isRef)) {
      const got = v.map((x) => (isRef(x) ? idOf(x.$ref) : x));
      return got.some((x) => x === undefined) ? undefined : got;
    }
    return v;
  };
  const planned = new Set(plan.rows.map((r) => r.key));
  /** Categories this run could not write because the name is taken, and every row that pointed at one. */
  const lost = new Map<string, { label: string; rows: number; fix: string }>();
  /** Each row whose write has started, by key, and settled once the record has answered it. */
  const settled = new Map<string, Promise<void>>();
  /** Set by the first write the host did not answer, or the first that threw: nothing further is sent. */
  let stopped = false;

  /**
   * What one row's write says, held until every row of its list has answered and then added to the report in plan
   * order: see the loop over `lists` below.
   */
  type Said = { changes: Report['changes']; refused: Report['refused']; later: typeof later; deleted: NonNullable<Report['deleted']> };

  /** One planned row, written or found and patched, with what it says put in `said`. */
  const writeRow = async (row: PlannedRow, said: Said): Promise<void> => {
    /**
     * WHAT THIS ROW MAY LEAN ON IS FIXED AT THE MOMENT IT STARTS, which is the moment a one-at-a-time run would have
     * reached it. Every row planned before it has started by then and none planned after it has, so a ref to an
     * earlier row in the same list waits for that row's answer and is sent resolved, as it was when the rows went one
     * by one (task 102 names task 101 as its parent). A ref to a later row is still left for the second pass, even when
     * that row answers first, so which rows are patched afterwards does not depend on which answer came back first.
     * The row's own key is waited on too: a plan naming one key twice updates the row the first one wrote rather than
     * racing it to a second create.
     */
    const refs = Object.values(row.fields).flatMap((v) => [v].flat().filter(isRef).map((x) => x.$ref));
    const known = new Set(refs.filter((k) => ids.has(k) || settled.has(k)));
    const waits = [...new Set([...refs, row.key])].map((k) => settled.get(k)).filter((p) => p !== undefined);
    let done!: () => void;
    settled.set(row.key, new Promise<void>((resolve) => (done = resolve)));
    try {
      await Promise.all(waits);
      if (stopped) return;
      await writeOne(row, known, said);
    } finally {
      done();
    }
  };

  /** The write itself, the same for every row as when rows were sent one at a time. */
  const writeOne = async (row: PlannedRow, known: ReadonlySet<string>, said: Said): Promise<void> => {
    const tally = (report.tally[row.register] ??= { added: 0, updated: 0, unchanged: 0 });
    const fields: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(row.fields)) {
      const put = resolveValue(value, known);
      if (put !== undefined) fields[field] = put;
      else {
        const refs = [value].flat().filter(isRef);
        const gone = refs.map((x) => lost.get(x.$ref)).find((x) => x !== undefined);
        /* A ROW WHOSE CATEGORY COULD NOT BE WRITTEN STILL ARRIVES, uncategorised, and the count is what makes that
           visible: a Where it went chart with a slice missing says nothing about itself. */
        if (gone) gone.rows++;
        /* A ref to a row planned in this run and not written yet waits for the second pass; one to a row left out is dropped. */ else if (refs.some((x) => planned.has(x.$ref))) said.later.push({ row, field, value });
      }
    }
    const found = existing.get(row.key);
    /* HE DELETED IT HERE, SO IT IS NOT CREATED AGAIN: see `gone`. First, so a deleted category is not also reported as
       a name taken. Said once under its list and not tallied, because nothing was added, updated or found unchanged. */
    if (!found && gone.has(row.key)) {
      said.deleted.push({ register: row.register, label: row.label });
      report.outcomes[row.key] = 'deleted';
      return;
    }
    if (holdsKey(fields)) {
      said.refused.push({ label: row.label, register: row.register, fix: 'A field looked like a key itself, so the row was not sent.' });
      return;
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
      return;
    }

    if (!found) {
      const create = row.register === 'session' ? fields : { ...fields, tags: [row.key] };
      if (o.dryRun) {
        const turned = textRefusal(row.register, create);
        if (turned !== null) {
          said.refused.push({ label: row.label, register: row.register, fix: turned });
          report.outcomes[row.key] = 'refused';
          return;
        }
        tally.added++;
        report.outcomes[row.key] = 'added';
        ids.set(row.key, `(new ${row.key})`);
        return;
      }
      const made = await door.create({ register: row.register, fields: create, note: `Imported from ${words.source}.` });
      if (!made.ok) {
        if (unreachable(made)) {
          stopped = true;
          return;
        }
        said.refused.push({ label: row.label, register: row.register, fix: fixOf(made) });
        report.outcomes[row.key] = 'refused';
        return;
      }
      const value = made.value as Row;
      ids.set(row.key, value.id);
      existing.set(row.key, value);
      tally.added++;
      report.outcomes[row.key] = 'added';
      return;
    }

    /* A FIELD THE ROW NAMES IN `onCreate` WAS ITS FIRST VALUE ONLY (`PlannedRow.onCreate`), and a person may have changed
       it since: patched, a one-off date he closed early was reopened by the next night's import. */
    const mine = new Set(row.onCreate ?? []);
    /**
     * A PLANNED `null` AND A FIELD THE ROW DOES NOT HOLD ARE ONE VALUE, so nothing is sent between them.
     *
     * The kernel leaves a field with no value off the row, so compared as JSON a planned `null` read `null` against
     * `undefined` and differed every night: measured in `test/import-null-clears.test.ts`, a steady export patched
     * `ends` on every repeating Money row with no end, night after night. That is why the planner sent an end only when
     * the old tool had one, and so an end the old tool later took away stayed on the row and stopped the forecast early. A
     * planned `null` over a field the row does hold still differs, and is the patch that clears it.
     */
    const differs = (field: string): boolean => stable(found.fields[field] ?? null) !== stable(fields[field] ?? null);
    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(fields)) if (!mine.has(field) && differs(field)) patch[field] = value;
    /**
     * UNLESS THE DAY THOSE FIELDS WERE READ FROM HAS MOVED, and then they are the planner's again.
     *
     * A one-off's `state` and `done_on` are the planner's reading of its day against the day of the import, so kept
     * past a change of day they describe a day that is gone. Measured before this (`loop/research-batch-fifty-one-audit.md`
     * finding 5, the adapter's `test/import-moved-oneoff.test.ts`): a return dated 2026-09-01 arrived done on the 17th, was moved in
     * the old tool to 2026-10-15, and the next night patched `by` alone, leaving a task done six weeks before its day and
     * in no list of what is due. A night on which the day did not move sends none of them, so a state he set holds
     * until the old tool moves the day it was set against.
     */
    if (Object.hasOwn(patch, 'by') || Object.hasOwn(patch, 'due')) for (const field of mine) if (Object.hasOwn(fields, field) && differs(field)) patch[field] = fields[field];
    if (Object.keys(patch).length === 0) {
      tally.unchanged++;
      report.outcomes[row.key] = 'unchanged';
      return;
    }
    said.changes.push({ register: row.register, label: row.label, fields: Object.keys(patch) });
    report.outcomes[row.key] = 'updated';
    if (o.dryRun) {
      const turned = textRefusal(row.register, patch);
      if (turned !== null) {
        said.refused.push({ label: row.label, register: row.register, fix: turned });
        report.outcomes[row.key] = 'refused';
        return;
      }
      tally.updated++;
      return;
    }
    const done = await door.update({ register: row.register, seq: found.seq as number, patch, version: found.version, note: `Imported again from ${words.source}.` });
    if (!done.ok) {
      if (unreachable(done)) {
        stopped = true;
        return;
      }
      said.refused.push({ label: row.label, register: row.register, fix: fixOf(done) });
      report.outcomes[row.key] = 'refused';
      return;
    }
    existing.set(row.key, done.value as Row);
    tally.updated++;
  };

  /**
   * ONE LIST AT A TIME, IN `targets.order`, AND UP TO `WRITES_AT_ONCE` OF ITS ROWS IN FLIGHT. A list starts only once every
   * write of the one before it has answered, so rates are in before the first account and every project before the
   * task that names it, exactly as when rows went one by one. Within a list the lanes take rows in plan order, and
   * each row's report lines wait in its slot so the report reads in plan order whatever order the answers came in.
   *
   * A HOST THAT STOPS ANSWERING STOPS THE RUN, AND THE RUN WAITS FOR WHAT IS ALREADY OUT. No lane takes another row once
   * one write has come back `UNREACHABLE`, and the throw waits for the writes already sent, so none of them lands after
   * the command has said it stopped. They are not reported: the next run finds each one that landed by its key.
   */
  const lists: PlannedRow[][] = [];
  for (const row of plan.rows) {
    const last = lists.at(-1);
    if (last !== undefined && last[0]!.register === row.register) last.push(row);
    else lists.push([row]);
  }
  for (const list of lists) {
    const said: Said[] = list.map(() => ({ changes: [], refused: [], later: [], deleted: [] }));
    let next = 0;
    let failed: { error: unknown } | null = null;
    const lane = async () => {
      while (!stopped && failed === null && next < list.length) {
        const at = next++;
        try {
          await writeRow(list[at]!, said[at]!);
        } catch (error) {
          /* A THROW STOPS THE SENDING TOO, not only the taking. Measured before this line (the adapter's `test/import-throughput.test.ts`):
             with task 101's create throwing, task 102, already in a lane and waiting on its parent's answer, was sent
             afterwards, a write made after the run had failed. */
          failed ??= { error };
          stopped = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(WRITES_AT_ONCE, list.length) }, lane));
    if (failed !== null) throw (failed as { error: unknown }).error;
    if (stopped) throw new Unreachable();
    for (const s of said) {
      report.changes.push(...s.changes);
      report.refused.push(...s.refused);
      deleted.push(...s.deleted);
      later.push(...s.later);
    }
  }

  /* THE SECOND PASS: a learning that replaces one written after it. Counted as part of the row already counted. */
  const byKey = new Map(plan.rows.map((r) => [r.key, r]));
  for (const { row, field, value } of later) {
    const put = resolveValue(value);
    const at = existing.get(row.key);
    /**
     * A REF TO A ROW HE DELETED HERE IS NEVER RESOLVED, AND THAT WAS SAID OF THE ROW HE DELETED ONLY.
     *
     * Measured before this (the adapter's `test/import-own-deletes.test.ts`, `loop/research-batch-fifty-four-audit.md` section 6): the
     * project `lanternly` deleted here, and the next export filing a new task 106 under it. Task 106 arrived with no
     * project, and the one line was the project's. So the row is named with what it names, and only when the field is
     * empty on the row as it now stands: task 101, written before the delete, still points at the project's id and lost
     * nothing. Putting the project back mends it, because the next night resolves the ref and patches the field.
     *
     * ONLY A ROW THAT WAS WRITTEN OR FOUND. A row held back or refused still leaves its refs for this pass, and measured
     * by the checker (the last test there): task 101 deleted here with its project was named as held back and as
     * "Written without lanternly" on the same night.
     */
    const held = [value].flat().filter(isRef).filter((x) => report.outcomes[x.$ref] === 'deleted');
    const wrote = ['added', 'updated', 'unchanged'].includes(report.outcomes[row.key] ?? '');
    if (put === undefined && wrote && held.length > 0 && (at?.fields[field] ?? null) === null)
      unfiled.push({ register: row.register, label: row.label, names: held.map((x) => ({ register: byKey.get(x.$ref)?.register ?? row.register, label: byKey.get(x.$ref)?.label ?? x.$ref })) });
    if (put === undefined || !at || o.dryRun || stable(at.fields[field]) === stable(put)) continue;
    const done = await door.update({ register: row.register, seq: at.seq as number, patch: { [field]: put }, version: at.version, note: `Imported from ${words.source}.` });
    if (done.ok) existing.set(row.key, done.value as Row);
    else if (unreachable(done)) throw new Unreachable();
    else report.refused.push({ label: row.label, register: row.register, fix: fixOf(done) });
  }

  report.clashes = [...lost.values()];

  /**
   * THE ROWS AN EARLIER IMPORT LEFT IN A LIST THIS ONE HAS MOVED OFF, CLOSED SO NOTHING IS COUNTED TWICE.
   *
   * Moving a key is what makes these invisible: `existing` is keyed by import key alone, so a row written under
   * `<key>instalment:` is never found by a plan that writes `<key>schedule:`, and the record ends up
   * holding the same instalment in two lists with a wall that is double. Measured on an in-memory record with
   * money-core 1.2.0 installed (the adapter's `test/plan.test.ts`): a wall of EGP 5,000,000 imported under the old shape and
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
      /* A ROW DATED OUTSIDE THE DAYS THE EXPORT SPOKE ABOUT IS NOT ONE IT DROPPED (`Retire.inside`): an opening balance
         older than a windowed ledger answer was voided here, and so was a row only a newer export carried when an
         older one was imported after it (the adapter's `test/import-ledger-window.test.ts`). A row with no day is outside too. */
      if (r.inside && !(r.spoken ?? []).some((p) => key.startsWith(p))) {
        const day = at.fields[r.inside.field];
        if (typeof day !== 'string' || day.slice(0, 10) <= r.inside.after || day.slice(0, 10) >= r.inside.before) continue;
      }
      const patch = Object.fromEntries(Object.entries(r.patch).filter(([field, value]) => stable(at.fields[field]) !== stable(value)));
      if (Object.keys(patch).length === 0) continue;
      const names = r.titles.map((f) => at.fields[f]).filter((v): v is string => typeof v === 'string');
      const label = names.length > 0 ? names.join(' ') : key;
      if (o.dryRun) {
        report.retired.push({ register: r.register, label, why: r.why });
        /* A DRY RUN READS ON AS THE REAL ONE WOULD: a later pass sees the row as this pass leaves it, so a half kept
           owed by one pass is not then listed as written off by the next (the adapter's `test/part.test.ts`). */
        existing.set(key, { ...at, fields: { ...at.fields, ...patch } } as Row);
        continue;
      }
      const done = await door.update({ register: r.register, seq: at.seq as number, patch, version: at.version, note: r.why });
      if (!done.ok) {
        /* A DELETE WHOSE ANSWER NEVER CAME MAY HAVE LANDED, and if it did the row is in the bin at the next version,
           because every write moves a row one version on (`packages/kernel/src/index.ts`, `version = version + 1`).
           Remembered at that version it is the import's if it landed, and matches nothing if it did not. Measured
           before this (the adapter's `test/import-own-deletes.test.ts`, DURING): the delete landed, the run stopped, and the next
           night read the lot as his delete. A row he deletes himself at exactly that version before the next night is
           read as the import's, which costs one row the old tool still holds coming back; the other way lost it. */
        if (unreachable(done)) {
          if (Object.hasOwn(patch, 'deleted_at') && typeof at.version === 'number') binned.push({ id: at.id, version: at.version + 1 });
          throw new Unreachable();
        }
        report.refused.push({ label, register: r.register, fix: fixOf(done) });
        continue;
      }
      existing.set(key, done.value as Row);
      /* A DELETE THIS PASS MADE IS REMEMBERED AS THE IMPORT'S (`Binned`), at the version the record says it left. */
      const left = done.value as Row;
      if (typeof left.deleted_at === 'string' && left.deleted_at !== '' && typeof left.version === 'number') binned.push({ id: left.id, version: left.version });
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
  let decide: Decide | null = { asked: new Set(), open: new Set(), installs: new Set(), values: new Set() };
  const banks = o.banks ?? [];
  const packs = o.packs ?? [];
  const settledThere = o.settled ?? [];
  if (plan.asks.length > 0 || plan.polls.length > 0 || banks.length > 0 || packs.length > 0 || settledThere.length > 0) decide = await readDecideOnce();
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
        questions.push({ label: ask.label, question: ask.question });
        continue;
      }
      const done = await door.propose({ question: ask.question, body_kind: ask.kind ?? 'options', body: ask.body });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        report.refused.push({ label: ask.label, register: 'Decide', fix: fixOf(done) });
        continue;
      }
      report.asked++;
      questions.push({ label: ask.label, question: ask.question });
    }
  }
  /* A QUESTION SETTLED IN THE OLD TOOL THAT IS STILL OPEN HERE, said with what to do: see the adapter's `settled`. Only one this
     record was asked, because one it never was has no twin here to answer. */
  if (decide !== null)
    for (const s of settledThere)
      if (decide.open.has(s.key)) waiting.push({ label: s.label, question: s.question, answer: s.status === 'decided' ? `decided there${s.decision ? ` as ${s.decision}` : ''}` : 'dismissed there' });

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
   * A PACK HIS DATA SHOWS HE USES, FILED ONCE, THE WAY A POLL IS, AND NOT FILED AT ALL ON A MONEY TOO OLD TO TAKE IT.
   *
   * A bank pack that took its wordings over from money-core 1.8.0 requires 1.8.0 or later, and on 1.7.0 the same ids are
   * still money-core's: that install is refused `PROVIDES_CONFLICT` on every one, a sentence about two packs owning one
   * declaration that does not say the step he is missing is Money's update. `holdings` is the same shape a major later:
   * up to 1.8.0 the list is money-core's, and the pack asks for 2.0.0. Filed anyway, either would sit on Decide as a
   * proposal that refuses the moment he presses it. So the version is read first and the report names the update. A
   * door that cannot say which packs it holds files unchecked, and the record's own refusal is then what he reads.
   *
   * ONE LOOP FOR BOTH, COUNTED APART. The bank's line in the report reads `Banks:`, and a list for what he holds is not a
   * bank, so each kind keeps its own tally and its own line.
   */
  const holding = (banks.length > 0 || packs.length > 0) && decide !== null && door.packs ? await door.packs() : null;
  if (holding !== null && !holding.ok && unreachable(holding)) throw new Unreachable();
  const money = holding?.ok ? (holding.value.find((p) => p.id === 'money-core') ?? null) : undefined;
  /** The packs that are on Decide once the offers are made, filed by this run or by an earlier one: see `leftOut` below. */
  const onDecide = new Set<string>();
  const offer = async (list: readonly PlannedPack[]): Promise<{ filed: number; before: number; waiting: string[] }> => {
    const tally = { filed: 0, before: 0, waiting: [] as string[] };
    for (const pack of list) {
      /* HELD IS AS GOOD AS OFFERED. A bank pack may be installed by hand by whoever banks there, which leaves nothing on
         Decide, and `propose` does not refuse a pack the record already holds: reading Decide alone filed a second offer
         of a pack that was already reading his texts (the adapter's `test/import-bank-pack.test.ts`). */
      if (installs.has(pack.install) || (holding?.ok === true && holding.value.some((p) => p.id === pack.install))) {
        if (installs.has(pack.install)) onDecide.add(pack.install);
        tally.before++;
        continue;
      }
      /* A PACK THE CATALOGUE COULD NOT GIVE IS SAID WITH WHY, and nothing is filed: an offer with no document behind it is
         a question whose yes installs nothing. */
      if (pack.doc === null) {
        tally.waiting.push(`${pack.says} (the ${pack.install} pack) was not filed on Decide: ${pack.unfound ?? 'no catalogue gave it'}. Install it with braindog pack install ${pack.install}, or run the import again once the catalogue holds it.`);
        continue;
      }
      const requires = isObj(pack.doc.requires) && isObj(pack.doc.requires.packs) ? pack.doc.requires.packs['money-core'] : undefined;
      if (typeof requires === 'string' && money !== undefined && !satisfies(money?.version ?? null, requires)) {
        tally.waiting.push(
          money === null
            ? `${pack.says} (the ${pack.install} pack) was not filed on Decide: it needs Money ${rangeWords(requires)}, and this BrainDog has no Money. Install Money, then run the import again.`
            : `${pack.says} (the ${pack.install} pack) was not filed on Decide: it needs Money ${rangeWords(requires)}, and this BrainDog has Money ${money.version ?? 'at no version'}. Take the Money update, then run the import again.`,
        );
        continue;
      }
      if (o.dryRun) {
        tally.filed++;
        continue;
      }
      const done = await door.propose({ question: pack.question, body_kind: 'pack', body: { install: pack.install, doc: pack.doc } });
      if (!done.ok) {
        if (unreachable(done)) throw new Unreachable();
        if (refused(done) && done.refusal.code === 'TRANSITION_ILLEGAL') tally.before++;
        else report.refused.push({ label: pack.question, register: 'Decide', fix: fixOf(done) });
        continue;
      }
      onDecide.add(pack.install);
      tally.filed++;
    }
    return tally;
  };
  if (banks.length > 0 && decide !== null) report.banks = await offer(banks);
  if (packs.length > 0 && decide !== null) report.packs = await offer(packs);
  /**
   * A LIST WHOSE PACK IS WAITING ON DECIDE IS APPROVED THERE, NOT INSTALLED. The "Left out" line is written before the
   * packs are offered, so the first run's report said "Packs: 1 filed on Decide for you to approve" and, under it, "This
   * BrainDog has no Holdings list. Install Holdings beside Solo founder": two instructions for one step, and the second
   * is not the one he should take (`loop/research-switch-today.md` brief 50-B, the adapter's `test/import-holdings-lead.test.ts`).
   * A dry run files nothing and a Money too old holds the offer back, so neither is on Decide and both keep the install.
   */
  for (const [register, line] of leftOut) {
    const pack = [...banks, ...packs].find((p) => p.name === providedBy[register] && onDecide.has(p.install));
    if (pack) line.reason = `This BrainDog has no ${name(register)} list. Approve "${pack.question}" on Decide, then run the import again to bring these in`;
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

/** The rows held back because he deleted them here, as both reports name them: each one's label and its list. */
const deletedSaid = (rows: { register: string; label: string }[], name: (register: string) => string): string => few(rows.map((r) => `${r.label} (${name(r.register)})`));

/**
 * The rows written without a row he deleted here, as both reports say them: one sentence for each row he deleted, naming
 * every row that went without it. BY THE ROW DELETED AND NOT BY THE ROW WRITTEN, because one deleted project is named by
 * its new task and by each of its readings, and said row by row the project was named five times in one line.
 */
const unfiledSaid = (rows: Unfiled[], name: (register: string) => string, dryRun = false): string[] => {
  const by = new Map<string, string[]>();
  for (const r of rows) {
    const names = and(r.names.map((n) => `${n.label} (${name(n.register)})`));
    by.set(names, [...(by.get(names) ?? []), `${r.label} (${name(r.register)})`]);
  }
  return [...by].map(
    ([names, items]) => `${dryRun ? 'Would be written' : 'Written'} without ${names}, which is deleted in this BrainDog: ${few(items)}. Put it back here and the next import files them under it.`,
  );
};

/** A question waiting on Decide as both reports name it: its id in the old tool, its words, and what the old tool did with it. */
const waitingSaid = (w: Waiting): string => `${w.label}${w.question ? `, ${w.question}` : ''}, ${w.answer}.`;

/** The report as the lines a person reads. */
export function said(report: Report, o: { dryRun: boolean; file: string }): string[] {
  const { plan } = report;
  const words = report.words ?? plainWords(plan);
  const name = (register: string) => nameIn(words, register);
  const { source } = words;
  const lines: string[] = [];
  const when = plan.taken ? `, exported ${plan.taken.slice(0, 10)}` : '';
  lines.push(`${o.dryRun || report.missing.length > 0 ? 'Read, and wrote nothing' : 'Imported'}: ${o.file}${when}.`);
  if (report.missing.length > 0) {
    const need = [...new Set(report.missing.map((r) => words.map.targets.providedBy[r] ?? r))];
    lines.push(`This BrainDog has no ${and(report.missing.map(name))} lists, so nothing was written. Install ${and(need)} on this BrainDog first, then run the import again.`);
    return lines;
  }
  const verb = o.dryRun ? 'would be ' : '';
  for (const register of words.map.targets.order) {
    const t = report.tally[register];
    if (!t) continue;
    lines.push(`${name(register)}: ${String(t.added)} ${verb}added, ${String(t.updated)} ${verb}updated, ${String(t.unchanged)} unchanged.`);
  }
  if (plan.asks.length > 0) lines.push(`Decide: ${String(report.asked)} ${o.dryRun ? 'would be asked' : 'asked'}, ${String(report.alreadyAsked)} asked before.`);
  if (plan.polls.length > 0)
    lines.push(`Polls: ${String(report.polls.filed)} ${o.dryRun ? 'would be filed' : 'filed'} on Decide for you to approve, ${String(report.polls.before)} filed before.`);
  if (report.banks) {
    lines.push(`Banks: ${String(report.banks.filed)} ${o.dryRun ? 'would be filed' : 'filed'} on Decide for you to approve, ${String(report.banks.before)} filed before.`);
    for (const w of report.banks.waiting) lines.push(`- ${w}`);
  }
  if (report.packs) {
    lines.push(`Packs: ${String(report.packs.filed)} ${o.dryRun ? 'would be filed' : 'filed'} on Decide for you to approve, ${String(report.packs.before)} filed before.`);
    for (const w of report.packs.waiting) lines.push(`- ${w}`);
  }
  if (report.values) {
    const { added, filed, before } = report.values;
    if (added.length > 0) lines.push(`Added to your lists, so those rows carry the word ${source} used: ${and(added)}.`);
    /* A DRY RUN CANNOT SAY WHICH OF THE TWO IT WOULD BE: whether an addition lands is the record's answer to the key
       that files it, and a dry run files nothing. */
    if (filed.length > 0)
      lines.push(
        o.dryRun
          ? `Would be proposed, so those rows can carry the word ${source} used: ${and(filed)}. From your own key it lands at once; otherwise it waits on Decide.`
          : `Filed on Decide for you to approve: ${and(filed)}. Until you do, those rows carry the word the list already had, and the next import after you approve moves them.`,
      );
    if (before.length > 0)
      lines.push(`Proposed before and not in your lists: ${and(before)}. It waits on Decide or was turned down there, so those rows carry the word the list already had.`);
  }
  /* THE ROWS THE MAPPING NAMES ONE BY ONE (`listed`), by the kind that follows the plan's prefix in their key. */
  const listed = words.map.listed;
  const kind = (r: PlannedRow): string | null => (listed === null || !r.key.startsWith(plan.key) ? null : (listed.kinds[r.key.slice(plan.key.length).split(':')[0] ?? ''] ?? null));
  const estate = plan.rows.filter((r) => kind(r) !== null);
  if (listed !== null && estate.length > 0) {
    lines.push('', `${listed.heading}:`);
    const outcome = (r: PlannedRow) => {
      const was = report.outcomes[r.key];
      if (was === 'added') return o.dryRun ? 'would be added' : 'added';
      if (was === 'updated') return o.dryRun ? 'would be updated' : 'updated';
      if (was === 'refused') return 'refused';
      /* A ROW HE DELETED HERE IS NOT "UNCHANGED". It fell through to that word, so the same night's report called
         lanternly.example unchanged on Estate two lines above saying it was deleted and not added again (measured on
         the synthetic export with the domain deleted, the adapter's `test/import-deleted-stays.test.ts`). */
      if (was === 'deleted') return o.dryRun ? 'deleted here, so it would not be added again' : 'deleted here, so not added again';
      return 'unchanged';
    };
    for (const r of estate) lines.push(`- ${String(kind(r))}: ${r.label}, ${outcome(r)} (${name(r.register)}).`);
  }
  if (report.changes.length > 0) {
    lines.push('', o.dryRun ? 'What would change:' : 'What changed:');
    const most = 40;
    for (const c of report.changes.slice(0, most)) lines.push(`- ${name(c.register)}, ${c.label}: ${c.fields.join(', ')}.`);
    if (report.changes.length > most) lines.push(`- and ${String(report.changes.length - most)} more.`);
  }
  if (report.retired.length > 0) {
    const by = new Map<string, string[]>();
    for (const r of report.retired) by.set(r.why, [...(by.get(r.why) ?? []), `${name(r.register)}, ${r.label}`]);
    lines.push('', o.dryRun ? 'What would be closed, and why:' : 'Closed, and why:');
    for (const [why, items] of by) lines.push(`- ${why} ${few(items)}.`);
  }
  if ((report.waiting ?? []).length > 0) {
    lines.push('', `Answered in ${source} and still open on Decide here:`);
    for (const w of report.waiting ?? []) lines.push(`- ${waitingSaid(w)} ${w.answer.startsWith('decided') ? `Answer it on Decide the way you answered it in ${source}, or dismiss it.` : 'Dismiss it on Decide too.'}`);
  }
  if (report.clashes.length > 0) {
    lines.push('', 'Categories this BrainDog already has under that name:');
    for (const c of report.clashes)
      lines.push(`- ${c.label}: ${c.fix} ${c.rows === 0 ? 'No ledger row named it.' : c.rows === 1 ? 'One ledger row arrived without a category.' : `${String(c.rows)} ledger rows arrived without a category.`}`);
  }
  /* ONE LINE FOR EVERY ROW HELD BACK, because the rows are in every export until the old tool closes and a line a row would
     be the same list every night. What to do is the second sentence: put back here, a row is his again and the next
     import updates it. */
  if ((report.deleted ?? []).length > 0)
    lines.push('', `Deleted in this BrainDog, so ${o.dryRun ? 'it would not be' : 'not'} added again: ${deletedSaid(report.deleted ?? [], name)}. To have one back, put it back here; the import then keeps it up to date.`);
  if ((report.unfiled ?? []).length > 0) lines.push('', ...unfiledSaid(report.unfiled ?? [], name, o.dryRun));
  if (report.refused.length > 0) {
    /* A DRY RUN SENT NOTHING, so the record refused nothing yet: these are the rows the kernel's coercion says it will. */
    lines.push('', o.dryRun ? 'Would be refused by the record:' : 'Refused by the record:');
    for (const r of report.refused) lines.push(`- ${r.label} (${name(r.register)}): ${r.fix}`);
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
 * ("Imported from" and the tool's name). Two things the morning needs are not in it. A log line carries the one write it came
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
  /**
   * WHAT IT ASKED, WHAT IT CLOSED AND WHAT STILL WAITS ON DECIDE, AND ALL THREE OPTIONAL, because a line written before
   * they were kept is still a night he ran (`isRun`). Kept because the shadow week's morning read left out Decide
   * entirely: a question asked in the night was not said, and one answered in the old tool was said only as the planner's
   * skip line, "Already decided, and carried with its decision", which reads as done while it waited on Decide here
   * (`loop/research-shadow-week.md` §3).
   */
  asked?: { label: string; question: string }[];
  retired?: { register: string; label: string; why: string }[];
  waiting?: Waiting[];
  /** The rows held back because he deleted them here (`Report.deleted`). Optional for the reason the three above are. */
  deleted?: { register: string; label: string }[];
  /**
   * The rows this run's retire pass left in the bin, by id and version (`Binned`), read by the next night so it does not
   * take them for his. Optional for the reason the four above are: a line written before it binned nothing it knows of.
   */
  binned?: Binned[];
  /** Every row this run's read saw in the bin (`InBin`), read by the next night to hold its answer to. Optional likewise. */
  bin?: InBin[];
  /** The rows written without a row he deleted here (`Report.unfiled`). Optional for the same reason. */
  unfiled?: Unfiled[];
  /**
   * THE HOST STOPPED ANSWERING PART WAY, and what this line holds is what had answered by then. Such a run used to be
   * forgotten, which lost the rows its retire pass had put in the bin, and the next night read them as his deletes
   * (the adapter's `test/import-own-deletes.test.ts`, the checker's gap on `48858b72`). Optional: a line without it ran
   * to the end.
   */
  stopped?: boolean;
  /**
   * THE TOOL THE EXPORT CAME FROM, as its adapter names itself, so a morning read of one adapter's nights is not handed
   * another's. Optional: a line written before adapters were named on the line was a night of the one importer there was.
   */
  source?: string;
};

/** The run a report describes, as `--since` reads it back. */
export function runOf(report: Report, o: { at: string; host: string; file: string; source?: string }): Run {
  /* A CHANGE IS RECORDED BEFORE ITS WRITE IS SENT, so an update the record then refused is in `changes` too. It is said
     once, as refused, and not also as carried. */
  const turnedDown = new Set(report.refused.map((r) => `${r.register}\n${r.label}`));
  return {
    at: o.at,
    host: o.host,
    file: o.file,
    ...(o.source === undefined ? {} : { source: o.source }),
    taken: report.plan.taken,
    created: report.plan.rows.filter((r) => report.outcomes[r.key] === 'added').map((r) => ({ register: r.register, label: r.label })),
    updated: report.changes.filter((c) => !turnedDown.has(`${c.register}\n${c.label}`)).map((c) => ({ register: c.register, label: c.label, fields: c.fields })),
    refused: [...report.refused, ...report.clashes.map((c) => ({ register: 'categories', label: c.label, fix: c.fix }))],
    skipped: report.plan.skipped,
    asked: report.questions ?? [],
    retired: report.retired,
    waiting: report.waiting ?? [],
    deleted: report.deleted ?? [],
    binned: report.binned ?? [],
    bin: report.bin ?? [],
    unfiled: report.unfiled ?? [],
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
 * WHAT WAS LEFT OUT ON THE NIGHT BEFORE AS WELL IS NOT SAID AGAIN. The adapter's synthetic export alone leaves out 29
 * things under 23 reasons every night, and a morning that repeats them hides the one that is new. So a run says only
 * what it left out that the run before it, into the same host, did not; the first run remembered says all of it.
 *
 * `words` names the lists and the tool, as the night's own report did; without it each list is named by its id.
 */
export function sinceSaid(runs: Run[], since: string, offsetOf: (at: Date) => number = localOffset, words?: Words): { found: number; lines: string[] } {
  const name = (register: string) => (words ? nameIn(words, register) : register);
  const source = words?.source ?? 'the old tool';
  if (runs.length === 0) return { found: 0, lines: ['No import run is remembered on this machine yet.'] };
  const local = runs.map((r) => localClock(r.at, offsetOf));
  const shown = since === 'last' ? [runs.length - 1] : runs.flatMap((_, i) => (local[i]!.day >= since ? [i] : []));
  if (shown.length === 0) return { found: 0, lines: [`No import run is remembered on this machine since ${since}.`] };
  const lines: string[] = [];
  for (const i of shown) {
    const run = runs[i]!;
    const before = runs.slice(0, i).findLast((r) => r.host === run.host);
    /* BY THE ITEM ALONE, NOT THE ITEM WITH ITS REASON. A reason is a sentence this code writes, and the first morning
       after wave fifty-two reworded three of them said every decided and dismissed question and every deleted task once
       more as "Newly left out" (the adapter's `test/import-left-out.test.ts`). The item is what the old tool holds, so a new wording is
       not news and a new item is. An item several reasons used to share, `the ledger`, was split so this holds. */
    const had = new Set((before?.skipped ?? []).flatMap((s) => s.items));
    if (lines.length > 0) lines.push('');
    /* THE EXPORT'S DAY IN THE SAME ZONE AS THE HEADER IT SITS BESIDE. It was the UTC date, so at +03:00 an export taken
       at 01:30 on the 22nd sat beside a header saying the 22nd and was called an export of the 21st. A `taken` that is
       not an instant is printed as it came, because a guess at its day would be worse than its own words. */
    const taken = run.taken ? (Number.isNaN(Date.parse(run.taken)) ? run.taken.slice(0, 10) : localClock(run.taken, offsetOf).day) : null;
    lines.push(`${local[i]!.day} ${local[i]!.time} ${local[i]!.zone} into ${run.host}${taken ? `, export of ${taken}` : ''}:`);
    const start = lines.length;
    /* SAID FIRST, because every line under it is only what had answered before the host stopped: a write in flight at
       that moment may have landed and is in none of them, and the next run finds it by its key. */
    if (run.stopped === true) lines.push(`- Stopped part way: ${run.host} stopped answering, so this is what it had answered by then; a write that landed after that is found by its key the next night.`);
    const byList = <T extends { register: string }>(rows: T[], say: (row: T) => string, head: string) => {
      const lists = new Map<string, string[]>();
      for (const row of rows) lists.set(row.register, [...(lists.get(row.register) ?? []), say(row)]);
      for (const [register, items] of lists) lines.push(`- ${head} ${name(register)}: ${few(items)}.`);
    };
    byList(run.created, (r) => r.label, 'Created in');
    byList(run.updated, (r) => `${r.label} (${r.fields.join(', ')})`, 'Updated in');
    /* CLOSED BY REASON, AS THE NIGHT'S OWN REPORT SAYS IT, each row under the list it was closed in. */
    const closed = new Map<string, string[]>();
    for (const r of run.retired ?? []) closed.set(r.why, [...(closed.get(r.why) ?? []), `${name(r.register)}, ${r.label}`]);
    for (const [why, items] of closed) lines.push(`- Closed: ${why} ${few(items)}.`);
    for (const q of run.asked ?? []) lines.push(`- Asked on Decide: ${q.label}, ${q.question}`);
    for (const w of run.waiting ?? [])
      lines.push(`- Still open on Decide here, answered in ${source}: ${waitingSaid(w)} ${w.answer.startsWith('decided') ? 'Answer it on Decide the same way, or dismiss it.' : 'Dismiss it on Decide too.'}`);
    for (const r of run.refused) lines.push(`- Not carried, ${name(r.register)}: ${r.label}. ${r.fix}`);
    /* A ROW HELD BACK THE NIGHT BEFORE AS WELL IS NOT SAID AGAIN, for the reason the skips below are not: the export
       holds a row he deleted here every night until the old tool closes, and the morning is for what is new. */
    const heldBefore = new Set((before?.deleted ?? []).map((r) => `${r.register}\n${r.label}`));
    const newlyHeld = (run.deleted ?? []).filter((r) => !heldBefore.has(`${r.register}\n${r.label}`));
    if (newlyHeld.length > 0) lines.push(`- Deleted in this BrainDog, so not added again: ${deletedSaid(newlyHeld, name)}.`);
    /* THE SAME FOR A ROW FILED WITHOUT ONE OF THOSE: said the first morning, and again only once it is a different row. */
    const looseBefore = new Set((before?.unfiled ?? []).map((r) => `${r.register}\n${r.label}`));
    const newlyLoose = (run.unfiled ?? []).filter((r) => !looseBefore.has(`${r.register}\n${r.label}`));
    for (const line of unfiledSaid(newlyLoose, name)) lines.push(`- ${line}`);
    for (const s of run.skipped) {
      const fresh = s.items.filter((item) => !had.has(item));
      if (fresh.length > 0) lines.push(`- Newly left out: ${few(fresh)}. ${s.reason}.`);
    }
    if (lines.length === start) lines.push(`- Nothing moved in ${source} since the run before.`);
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
    itemsHold(run.skipped, ['reason'], ['items']) &&
    (run.asked === undefined || itemsHold(run.asked, ['label', 'question'])) &&
    (run.retired === undefined || itemsHold(run.retired, ['register', 'label', 'why'])) &&
    (run.deleted === undefined || itemsHold(run.deleted, ['register', 'label'])) &&
    (run.binned === undefined || (Array.isArray(run.binned) && run.binned.every((b) => isObj(b) && isText(b.id) && typeof b.version === 'number'))) &&
    (run.bin === undefined || (itemsHold(run.bin, ['id', 'register', 'since']) && (run.bin as { since: string }[]).every((b) => !Number.isNaN(Date.parse(b.since))))) &&
    (run.stopped === undefined || typeof run.stopped === 'boolean') &&
    (run.source === undefined || isText(run.source)) &&
    (run.unfiled === undefined || (itemsHold(run.unfiled, ['register', 'label']) && (run.unfiled as { names?: unknown }[]).every((u) => itemsHold(u.names, ['register', 'label'])))) &&
    (run.waiting === undefined || (itemsHold(run.waiting, ['label', 'answer']) && (run.waiting as { question?: unknown }[]).every((w) => w.question === null || isText(w.question))))
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

/** Whether a run sent anything that changed the record: a row, a question, a close, a pack or a value. */
const wroteAny = (report: Report): boolean =>
  Object.values(report.tally).some((t) => t.added + t.updated > 0) ||
  report.asked > 0 ||
  report.retired.length > 0 ||
  report.polls.filed > 0 ||
  (report.banks?.filed ?? 0) > 0 ||
  (report.packs?.filed ?? 0) > 0 ||
  (report.values?.added.length ?? 0) + (report.values?.filed.length ?? 0) > 0;

/**
 * One page of a list with the rows he deleted in it, AS A POST, and why it is not `client.list`.
 *
 * `client.list` SENDS A READ AS A GET, and a GET's `includeDeleted` is decoded only by a host at `dc9ec9e4` or later,
 * where `ROUTES` declares it. Wave fifty-four moved this read onto that GET, and against a host at `19d4c785`, the
 * build production answered on 23 September, it came back with live rows alone, 200, and every row he had deleted
 * was added back (`loop/research-batch-fifty-five-audit.md` section 1, the adapter's `test/import-deleted-skew.test.ts`). A POST's
 * body keeps its JSON types, and the record hands `includeDeleted: true` to the kernel on every host from before
 * `19d4c785` on, which the audit measured on both builds. So this is the door the import keeps whichever build the
 * host is at, and it carries the headers, the bearer and the deadline every other request of the run carries.
 */
async function listWithDeleted(send: typeof fetch, to: Target, args: { register: string; limit?: number; cursor?: string | null }): Promise<Result<{ rows: unknown[]; cursor: string | null }>> {
  const lost = (why: string) => no<never>('UNREACHABLE', `The record could not be reached: ${why}`);
  let res: Response;
  try {
    res = await send(`${to.base.replace(/\/+$/u, '')}/api/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(to.token ? { authorization: `Bearer ${to.token}` } : {}) },
      body: JSON.stringify({ ...args, includeDeleted: true }),
    });
  } catch (e) {
    return lost(e instanceof Error ? e.message : String(e));
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return lost(`${String(res.status)} with a body that is not JSON`);
  }
  /* THE SHAPE IS CHECKED THE WAY THE CLIENT CHECKS IT (`packages/client/src/index.ts`, `answered`): a gateway's own
     JSON with `ok: 1` read as a success would be a list with no rows, which is the one answer this read must not give. */
  if (isObj(body) && body.ok === true && isObj(body.value) && Array.isArray(body.value.rows))
    return ok({ rows: body.value.rows, cursor: typeof body.value.cursor === 'string' ? body.value.cursor : null });
  if (isObj(body) && body.ok === false && isObj(body.refusal) && typeof body.refusal.code === 'string' && typeof body.refusal.fix === 'string')
    return no(body.refusal.code, body.refusal.fix);
  return lost(`${String(res.status)} with an answer this import does not recognise`);
}

/**
 * A plan as an adapter handed it back, held to the shape `applyPlan` reads, or the sentence saying which part is not.
 *
 * AN ADAPTER IS CODE SOMEBODY ELSE WROTE, and `applyPlan` reads a plan without checking it, because the planner that
 * wrote plans used to be this file's own. A plan whose rows are not a list, or whose keys do not start with the key the
 * adapter names, would be read as far as it went and then throw with the rows before it written, or write rows no
 * second run finds again. So the shape is held here, once, before anything is read from the record.
 */
function planFault(plan: unknown, key: string): string | null {
  if (!isObj(plan)) return 'its plan is not an object';
  if (plan.key !== key) return `its plan's key is ${JSON.stringify(plan.key)}, and the adapter names ${JSON.stringify(key)}`;
  for (const list of ['rows', 'asks', 'polls', 'skipped', 'changed'] as const) if (!Array.isArray(plan[list])) return `its plan has no list of ${list}`;
  const rows = plan.rows as unknown[];
  const bad = rows.find((r) => !isObj(r) || typeof r.register !== 'string' || typeof r.key !== 'string' || !r.key.startsWith(key) || typeof r.label !== 'string' || !isObj(r.fields));
  if (bad !== undefined) return `a row of its plan is not { register, key, label, fields } under its key: ${JSON.stringify(bad).slice(0, 120)}`;
  const asks = plan.asks as unknown[];
  if (asks.some((a) => !isObj(a) || typeof a.key !== 'string' || !a.key.startsWith(key) || typeof a.question !== 'string' || !isObj(a.body))) return 'a question in its plan is not { key, label, question, body } under its key';
  return null;
}

/**
 * The document of each pack the adapter offers, from the catalogue: `--catalogue` when it is named, and the host's own
 * (`/app/catalogue/`) when not, the one the app's Browse lists and `pack install <id>` reads. An offer the catalogue
 * cannot give keeps its place with the reason, so the report says it rather than leaving it out.
 */
async function resolveOffers(offers: readonly Offer[], catalogue: CatalogueRead, known: KnownKeys): Promise<PlannedPack[]> {
  if (offers.length === 0) return [];
  const index = catalogue.read('index.json');
  const out: PlannedPack[] = [];
  for (const offer of offers) {
    const got = await packFrom(catalogue, offer.install, index, known);
    out.push(got.ok ? { ...offer, doc: got.doc } : { ...offer, doc: null, unfound: got.fix });
  }
  return out;
}

/**
 * A catalogue at an address, read as a host serves one: no token goes with it, because a catalogue is public.
 *
 * THROUGH `readSource`, THE READ `pack install` MAKES OF THE SAME FILES, and within the import's own budget. It was a
 * bare `fetch`: no deadline, a redirect followed anywhere, no cap on the answer and http to any machine. Measured on
 * 25 September (`test/import-adapter.test.ts`), a catalogue that took the connection and never answered held the
 * import on its first read of `index.json` until the test's ten seconds ran out, where the host's own requests give up
 * at the budget.
 */
const addressCatalogue = (base: string, io: AgentIo, ms: number): CatalogueRead => ({
  where: base,
  read: async (path) => {
    const got = await readSource(new URL(path, base.endsWith('/') ? base : `${base}/`).href, io, ms);
    return got.ok ? got.text : null;
  },
});

/** `braindog import <adapter> <file>`, and the exit code: 0 done, 1 refused or partly refused, 3 the host did not answer. */
export async function importCommand(args: string[], io: AgentIo, given?: string, now: () => Date = () => new Date(), offsetOf: (at: Date) => number = localOffset): Promise<number> {
  /* THE PLAN'S DAY IS THE OWNER'S LOCAL DAY, NOT THE UTC DATE. It was `toISOString().slice(0, 10)`, so a nightly run at
     22:30 at -03:00 planned on tomorrow's UTC date: a date due today was filed as already done, and a run at 01:30 at
     +03:00 planned on yesterday's. Taken from `now` and `offsetOf`, the same clock `--since` reads a run by. */
  const today = given ?? localClock(now().toISOString(), offsetOf).day;
  let values: {
    host?: string | undefined;
    'dry-run'?: boolean | undefined;
    setup?: string | undefined;
    map?: string | undefined;
    catalogue?: string | undefined;
    'draft-setup'?: boolean | undefined;
    since?: string | undefined;
    'bin-emptied'?: boolean | undefined;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        host: { type: 'string' },
        'dry-run': { type: 'boolean' },
        setup: { type: 'string' },
        map: { type: 'string' },
        catalogue: { type: 'string' },
        'draft-setup': { type: 'boolean' },
        since: { type: 'string' },
        'bin-emptied': { type: 'boolean' },
      },
    }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [spec, file, ...more] = positionals;
  if (!spec || more.length > 0 || (values.since === undefined && !file) || (values.since !== undefined && file)) {
    io.say(USAGE);
    return 1;
  }
  const loaded = await loadAdapter(spec, { cwd: io.cwd, map: values.map });
  if (!loaded.ok) {
    io.say(loaded.fix);
    return 1;
  }
  const { adapter, map } = loaded;
  const words: Words = { source: adapter.source, map };
  /** Only this adapter's nights: another tool's say nothing about this one's export or its keys. A night with no source
      was written before runs named one, by the one importer there was, and is the adapter's that says `unsourced`. */
  const mine = (r: Run) => (r.source === undefined ? adapter.unsourced === true : r.source === adapter.source);
  /**
   * AN ADAPTER IS SOMEBODY ELSE'S CODE, SO WHAT IT THROWS IS SAID AS ITS REFUSAL, NAMING IT, and the run stops before
   * anything is sent. `plan` was wrapped this way and the rest were not, so an adapter whose `read` threw on a file it
   * did not expect ended the command in a bare stack that named neither the adapter nor the file.
   */
  const ask = <T>(what: string, fn: () => T): { ok: true; value: T } | { ok: false } => {
    try {
      return { ok: true, value: fn() };
    } catch (e) {
      io.say(`The ${adapter.source} adapter could not ${what}: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false };
    }
  };
  /* THE MORNING READ NEEDS NO EXPORT AND NO HOST: it is what this machine remembers of the nights before, and the
     host may be the very thing that did not answer at three in the morning. */
  if (values.since !== undefined) {
    if (values.since !== 'last' && !DAY.test(values.since)) {
      io.say('--since takes a day as 2026-09-21, or last.');
      return 1;
    }
    const read = readRuns(io.home);
    for (const n of read.passed) io.say(`Line ${String(n)} of ${runsFile(io.home)} is not a run as this command writes one, so it was passed over.`);
    const got = sinceSaid(read.runs.filter(mine), values.since, offsetOf, words);
    if (got.found === 0) {
      io.say(got.lines.join(' '));
      return 1;
    }
    for (const line of got.lines) io.out(line);
    return 0;
  }
  if (file === undefined) return 1;
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
  const reading = ask(`read ${file}`, () => adapter.read(text));
  if (!reading.ok) return 1;
  const read = reading.value;
  if (!read.ok) {
    io.say(read.fix);
    return 1;
  }
  if (values['draft-setup'] === true) {
    if (!adapter.draftSetup) {
      io.say(`The ${adapter.source} adapter drafts no setup file.`);
      return 1;
    }
    const draft = ask(`draft a setup file from ${file}`, () => adapter.draftSetup?.(read.value));
    if (!draft.ok) return 1;
    io.out(JSON.stringify(draft.value, null, 2));
    return 0;
  }
  let setup: unknown;
  if (values.setup !== undefined) {
    if (!adapter.readSetup) {
      io.say(`The ${adapter.source} adapter reads no setup file.`);
      return 1;
    }
    let setupText: string;
    try {
      setupText = readFileSync(resolve(io.cwd, values.setup), 'utf8');
    } catch {
      io.say(`${values.setup} could not be read.`);
      return 1;
    }
    const asked = ask(`read ${values.setup}`, () => adapter.readSetup?.(setupText, TOOLS));
    if (!asked.ok) return 1;
    const got = asked.value;
    if (got === undefined) return 1;
    if (!got.ok) {
      io.say(got.fix);
      return 1;
    }
    setup = got.value;
  }
  const planned = ask(`plan ${file}`, () => adapter.plan(read.value, { today, ...(setup === undefined ? {} : { setup }), map: map.raw, tools: TOOLS }));
  if (!planned.ok) return 1;
  const plan: Plan = planned.value;
  const fault = planFault(plan, adapter.key);
  if (fault !== null) {
    io.say(`The ${adapter.source} adapter is not one this command can apply: ${fault}. Nothing was read from the record or sent to it.`);
    return 1;
  }
  /* WHAT IT OFFERS AND WHAT IT SAYS IS SETTLED ARE ASKED HERE, BEFORE THE HOST IS, so a throw from either stops the run
     with nothing sent, as a throw from `plan` does. */
  const offering = ask(`say which packs ${file} offers`, () => adapter.offers?.(read.value, map.raw) ?? []);
  if (!offering.ok) return 1;
  const settling = ask(`say which questions ${file} has settled`, () => adapter.settled?.(read.value) ?? []);
  if (!settling.ok) return 1;
  /* A ROW HOLDING A VALUE SHAPED LIKE A KEY IS NEVER SENT, WHOEVER PLANNED IT. The planner this file used to hold left
     such a row out itself; an adapter somebody else wrote may not, and the write is refused row by row in `writeOne`. */

  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  /**
   * THE IMPORT WRITES AS A RUN OF ITS OWN, ONE A NIGHT, AND SENDS NOTHING OF THE FOLDER IT WAS STARTED IN BUT THE
   * MACHINE'S NAME (`loop/research-shadow-week.md` §4 option A, and the checker's note under it).
   *
   * It sent `io.headers(to.key)`, the folder's position and the run its session file names, and measured through this
   * command on a host over the record (the adapter's `test/import-own-run.test.ts`) that was 44 runs for the fixture's
   * 44 writes from a folder with no repository, every one left `active`, and from a folder an agent was working in, the
   * agent's own run signing every write. A client id of its own is what the ladder finds the same run by on every write,
   * whatever the folder. And the folder's repository, remote and path go with the run it names, not only the session
   * headers: sent beside the new client id they placed the import's run in that folder's project, because a run
   * re-attached by its client id from a place it names is placed there (`packages/kernel/src/index.ts`, `locateRun`),
   * and the skill and the key belonging to other projects were refused `FORBIDDEN`, exit 1. The import writes to every
   * project at once, so it has no folder to be placed by. The host is kept because it names the machine the night ran
   * on, and that alone places nothing.
   */
  const folder = await io.headers(to.key);
  const headers: Record<string, string> = {
    ...(folder['x-braindog-host'] === undefined ? {} : { 'x-braindog-host': folder['x-braindog-host'] }),
    'x-braindog-client': `braindog-import-${crypto.randomUUID()}`,
    'x-braindog-agent': 'other',
  };
  const ms = budgetOf(io.env);
  /* ONE DEADLINE A REQUEST, not one for the run: an import is hundreds of requests, and each is as quick as any other. */
  const send: typeof fetch = async (input, init) => {
    const sent = new Headers(init?.headers);
    for (const [name, value] of Object.entries(headers)) sent.set(name, value);
    return fetch(input, { ...init, headers: sent, signal: AbortSignal.timeout(ms), redirect: 'error' });
  };
  const client = createClient({ base: to.base, ...(to.token ? { token: to.token } : {}), fetch: send });
  const door: Door = {
    schema: (register) => client.schema(register),
    list: ({ deleted, ...a }) => (deleted === true ? listWithDeleted(send, to, a) : client.list(a)),
    create: (a) => client.create(a),
    update: (a) => client.update(a),
    governance: (a) => client.governance(a),
    propose: (a) => client.call('propose', a),
    packs: () => client.packs(),
  };
  /* THE CATALOGUE THE OFFERS ARE RESOLVED IN: a folder or an address named with `--catalogue`, else the host's own. */
  const named = values.catalogue;
  const catalogue: CatalogueRead =
    named === undefined
      ? addressCatalogue(new URL('/app/catalogue/', to.base).href, io, ms)
      : /^[a-z][a-z0-9+.-]*:\/\//iu.test(named)
        ? addressCatalogue(named, io, ms)
        : folderCatalogue(resolve(io.cwd, named));
  const offered = await resolveOffers(offering.value, catalogue, knownKeys(io));
  /**
   * WHAT THE NIGHTS BEFORE LEFT IN THIS RECORD, AS THIS MACHINE REMEMBERS THEM: the rows their retire passes put in the
   * bin (`Binned`), and the newest export they carried, which an older one tonight is measured against (`newest` in
   * `applyPlan`). Only runs into the same host and from the same tool, because another record's bin and another tool's
   * exports say nothing about this one. A machine with no memory of a night reads the record as it did before: a row in
   * the bin is his, and an export is closed against itself.
   */
  const before = readRuns(io.home).runs.filter((r) => r.host === to.key && mine(r));
  const newest = before.reduce<string | null>((a, r) => (r.taken && !Number.isNaN(Date.parse(r.taken)) && (a === null || Date.parse(r.taken) > Date.parse(a)) ? r.taken : a), null);
  /* THE LAST RUN THAT KEPT WHAT IT SAW IN THE BIN, and only the last: an older night's bin has had more time to empty
     in ways the newer night already saw. */
  const lastBin = before.findLast((r) => r.bin !== undefined);
  const dryRun = values['dry-run'] === true;
  /** Adds the run to `imports.jsonl`, and says so when it cannot or when the rewrite let a line go. */
  const remember = (report: Report, stopped: boolean) => {
    let letGo: number[] = [];
    try {
      letGo = rememberRun(io.home, { ...runOf(report, { at: now().toISOString(), host: to.key, file, source: adapter.source }), ...(stopped ? { stopped: true } : {}) });
    } catch {
      io.say(`This run was imported but could not be remembered in ${runsFile(io.home)}, so --since will not show it.`);
    }
    /* THE REWRITE KEEPS ONLY WHAT READS AS A RUN, so a line passed over each morning is gone after the next night. It is
       said here too, or a hand-edited line would vanish with nobody told. */
    for (const n of letGo) io.say(`Line ${String(n)} of ${runsFile(io.home)} was not a run as this command writes one, and was let go when this run was remembered.`);
  };
  const progress: { report: Report | null } = { report: null };
  let report: Report;
  try {
    report = await applyPlan(plan, door, {
      dryRun,
      words,
      banks: offered.filter((p) => p.kind === 'bank'),
      packs: offered.filter((p) => p.kind !== 'bank'),
      settled: settling.value,
      binned: before.flatMap((r) => r.binned ?? []),
      newest,
      ...(lastBin?.bin === undefined ? {} : { bin: lastBin.bin }),
      now: now().getTime(),
      binEmptied: values['bin-emptied'] === true,
      progress,
    });
  } catch (e) {
    if (e instanceof Unreachable) {
      io.say(`${to.key} stopped answering part way. Run the import again: rows already written are found and not added twice.`);
      /* AND WHAT IT DID BEFORE THAT IS REMEMBERED, which it was not. The rows the retire pass put in the bin were then in
         no run's `binned`, and the next night held back every one of them as a row he had deleted: the lot of 5 that the
         old tool held again the night after stayed in the bin (the adapter's `test/import-own-deletes.test.ts`, measured
         before this). Only a run that wrote or binned something, because one that stopped while reading changed nothing. */
      const got = progress.report;
      if (!dryRun && got !== null && got.missing.length === 0 && (wroteAny(got) || (got.binned ?? []).length > 0)) {
        remember(got, true);
        io.say(`What it did before it stopped is remembered, and braindog import ${spec} --since last says it.`);
      }
      return 3;
    }
    /* NOTHING WAS WRITTEN, FOR THE REASON `PartlyRead` BELOW GIVES, and the one way past it is his to take. */
    if (e instanceof BinUnread) {
      const day = lastBin ? localClock(lastBin.at, offsetOf).day : 'the run before';
      io.say(
        `${to.key} answered ${e.lists.join(' and ')} with nothing in the bin, and the run on ${day} saw ${e.rows === 1 ? 'a row' : `${String(e.rows)} rows`} deleted there too recently for the record's sweep to have taken ${e.rows === 1 ? 'it' : 'them'}. A host that leaves deleted rows out of its answer would have every row you deleted added back as new, so nothing was written.`,
      );
      io.say('If the bin really was emptied, because this BrainDog was put back from a copy or is a new one at the same address, run the import again with --bin-emptied.');
      return 1;
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
  /**
   * AND ONCE ITS LAST WRITE HAS ANSWERED, THE RUN IS ENDED `done`, named by the export it carried.
   *
   * Left alone it stayed `active`, read as live beside the agents actually working until the twelve-hour sweep
   * abandoned it (`loop/research-shadow-week.md` §1, 8 runs for 8 nights each abandoned the day after). Ending it is
   * safe only because the run is this command's own: sent with the folder's headers, the same handoff would have ended
   * the agent's. Only when something was written, because a night that wrote nothing opened no run, and a handoff would
   * open one only to end it. A refusal or no answer is said and changes nothing else: the rows are in, and the exit is
   * about the rows.
   */
  if (!dryRun && report.missing.length === 0 && wroteAny(report)) {
    const t = Object.values(report.tally).reduce((a, b) => ({ added: a.added + b.added, updated: a.updated + b.updated, unchanged: a.unchanged + b.unchanged }), { added: 0, updated: 0, unchanged: 0 });
    const taken = plan.taken ? (Number.isNaN(Date.parse(plan.taken)) ? plan.taken.slice(0, 10) : localClock(plan.taken, offsetOf).day) : null;
    const ended = await client.handoff({
      state: 'done',
      doing: taken ? `${adapter.source} import, export of ${taken}` : `${adapter.source} import on ${today}`,
      note: `${String(t.added)} added, ${String(t.updated)} updated, ${String(t.unchanged)} unchanged, ${String(report.asked)} asked on Decide, ${String(report.refused.length)} refused.`,
    });
    if (!ended.ok) io.say(`The import's own run could not be ended (${fixOf(ended)}), so it reads as live until the record sweeps it.`);
  }
  /* A DRY RUN AND A RECORD SHORT OF ITS LISTS WROTE NOTHING, so neither is a night `--since` should report as carried.
     A run the host stopped answering part way is remembered above, marked `stopped`. */
  if (!dryRun && report.missing.length === 0) remember(report, false);
  /* A CLASHING CATEGORY IS AN EXIT 1 LIKE A REFUSAL IS, because something he asked for is not in the record and the
     run's next step is his: clear the examples, or rename, and import again. */
  return report.missing.length > 0 || report.refused.length > 0 || report.clashes.length > 0 ? 1 : 0;
}
