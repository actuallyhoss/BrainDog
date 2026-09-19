/**
 * A connector's page, read into rows. `43 §4.1`, `47 §5.1` step 6.8.
 *
 * THIS IS `arrive`'s FIELD LOOP OVER A LIST INSTEAD OF OVER ONE BODY, and it is deliberately not a
 * second implementation of it: both call `readRow`, so *what `proposed` means* has one definition
 * (`30 §2`). An email carrying one invoice and page three of a provider's charges differ in how many
 * roots there are and in nothing else.
 *
 * NOTHING HERE THROWS, which `map.ts` already promises and a connector needs more than an email
 * does. A run reaches this with a page it has already paid for; an exception at this point would
 * discard bytes a person could still read, and the ladder would fetch them again in two minutes and
 * discard them again. Every failure is a row at `needs-review` or a page with no rows and a reason.
 *
 * A ROW'S CONFIDENCE IS ITS OWN AND THE PAGE'S IS THE WORST OF THEM. Four hundred clean charges and
 * one with no date is not a clean page, and it is also not four hundred rows withheld: the clean
 * ones write, the one that could not be read is counted, and the page says so.
 *
 * AND THIS LIVES IN THE RECORD RATHER THAN IN `@braindog/extract`, WHICH IS RANK 9 TO THIS FILE'S
 * 7. The mapper, the currency exponents and the register schemas are all here, so a package holding
 * this would have to import the record — the wrong way up `31 §2`'s order. That package is built
 * now and it does hold the four non-JSON readers this one never had, so they arrive the way every
 * other capability this file does not own arrives: as a dependency a host supplies. It is written
 * as a free function over declared dependencies so that moving it is a move and not a rewrite.
 */

import { readPath, type Schema } from '@braindog/where';

import { CONFIDENCES, worse, type Confidence } from './ingest.ts';
import { parseAnswer, readRow, type Mapping } from './map.ts';
import type { Json } from './index.ts';

/**
 * As much of a connector's declaration as reading a page needs.
 *
 * NAMED BY EITHER KEY, because there are two declaration shapes in this repository and neither is
 * wrong: the record's own says `ingest`, and the one `@braindog/connect` narrows to says `id`
 * (`47 §13` D1, which declares it structurally rather than importing the record's). Requiring one
 * of them would make this function fit one caller and need an adapter for the other, and the
 * adapter is where a register name would get the chance to change on the way through.
 *
 * `writes.register` IS `unknown` AND NOT A STRING, because a fanned declaration writes to whichever
 * of several registers a row matches. Reading field types off it is a best effort by design: a fan
 * is read with no schema and the register's own validation is what catches it.
 */
export type ExtractDecl = {
  id?: string;
  ingest?: string;
  map?: Readonly<Record<string, Mapping>> | undefined;
  fetch?: { read?: FetchRead | undefined } | undefined;
  writes: { register?: unknown; confidence?: Confidence | undefined };
};

/**
 * `42 §4.7`'s read row, spelled here rather than imported.
 *
 * `@braindog/extract` OWNS THIS TYPE AND IS RANK 9 TO THIS FILE'S 7, so importing it is the wrong
 * way up `31 §2`'s order. The reader itself arrives the same way the currency exponents do — as a
 * dependency a host supplies — and this is the shape the two ends agree on.
 */
export type FetchRead = { format?: string; rows?: string; delimiter?: string; table?: number };

/** One row, as `43 §4.1` hands it on and `fetched.ts` writes it. */
export type ExtractedRow = { fields: Record<string, Json>; confidence: Confidence; outcome: Record<string, string> };

/** What one page came to. `reason` is for a person and names field ids only. */
export type Extraction = { rows: ExtractedRow[]; confidence: Confidence; reason?: string };

export type ExtractDeps = {
  schemaOf: (register: string) => Schema | null;
  exponent: (currency: string) => number;
  day: (text: string, format: string) => string | null;
  /**
   * A page in one of `42 §4.7`'s four non-JSON formats, read into rows. `null` is a body that is
   * not the format it was declared as.
   *
   * OPTIONAL, BECAUSE A HOST THAT CANNOT READ THEM SHOULD SAY SO RATHER THAN GUESS. Absent, a
   * `format:` other than `json` is refused per page with a sentence naming the format, which is
   * the same answer a person gets today and not a silently empty page.
   */
  rows?: ((body: string, read: FetchRead) => unknown[] | null) | undefined;
};

const nothing = (reason: string): Extraction => ({ rows: [], confidence: 'needs-review', reason });

/**
 * The page's rows, by `read.rows` — the same path `run.ts` validated before calling here.
 *
 * ONE PATH GRAMMAR AND NOT TWO. `readPath` is what the connector used to decide there was a list at
 * all, so reading it again with a different reader is how the two come to disagree about a page and
 * a person comes to see a receipt for rows that were never written.
 */
const rowsOf = (decl: ExtractDecl, root: unknown): unknown[] | null => {
  const path = decl.fetch?.read?.rows;
  const found = path === undefined ? root : readPath(root as never, path);
  return Array.isArray(found) ? (found as unknown[]) : null;
};

/** One page, read. `maxRows` is the run's remaining budget and is applied before any field is. */
export function extractPull(
  deps: ExtractDeps,
  decl: ExtractDecl,
  raw: { ts: string; body: string },
  ctx: { maxRows?: number } = {},
): Extraction {
  const name = decl.ingest ?? decl.id ?? 'this connector';
  const map = decl.map;
  /* A CONNECTOR WITHOUT A `map:` READS NOTHING, and says so rather than writing empty rows. */
  if (map === undefined || Object.keys(map).length === 0)
    return nothing(`${name} declares no map, so this answer was not read.`);

  /* JSON KEEPS ITS OWN READER AND THE OTHER FOUR GET THE INJECTED ONE. `@braindog/extract` reads a
     `rows:` path with its own grammar, and `run.ts` validated this one with `readPath`; routing
     today's JSON through the other reader would change what an installed connector means. So the
     formats that had no reader at all get one, and the format that had one keeps it. */
  const read = decl.fetch?.read ?? {};
  const format = read.format ?? 'json';

  let list: unknown[] | null;
  if (format === 'json') {
    const root = parseAnswer(raw.body);
    if (root === undefined) return nothing(`${name} was answered with something that is not JSON.`);
    list = rowsOf(decl, root);
  } else if (deps.rows === undefined) {
    return nothing(`${name} is declared as ${format}, and this host reads JSON only.`);
  } else {
    list = deps.rows(raw.body, read);
    if (list === null) return nothing(`${name} was answered with something that is not ${format}.`);
  }
  if (list === null) return nothing(`${name} did not find a list of rows where its declaration says one is.`);

  /* THE CEILING IS CHECKED HERE TOO. A declaration can arrive through a `.brain` import as well as
     through the linter, and `43`'s ceiling is a word — one this record does not know is not a
     licence to write at `exact`. */
  const declared = decl.writes.confidence ?? 'exact';
  const ceiling: Confidence = (CONFIDENCES as readonly string[]).includes(declared) ? declared : 'needs-review';

  const register = decl.writes.register;
  const fields = typeof register === 'string' ? (deps.schemaOf(register)?.fields ?? {}) : {};
  const typeOf = (field: string): string | undefined => fields[field]?.type;

  const budget = ctx.maxRows ?? list.length;
  const rows: ExtractedRow[] = [];
  let worst: Confidence = 'exact';

  for (const element of list.slice(0, Math.max(0, budget))) {
    const got = readRow({ exponent: deps.exponent, day: deps.day }, map, element, raw.ts, typeOf);

    /* THE OUTCOME PER FIELD, which is what a person reads when a row is in front of them: not
       *this row is proposed* but *this row is proposed because nobody sent a currency*. */
    const outcome: Record<string, string> = {};
    for (const field of got.missed) outcome[field] = 'missing';
    for (const field of got.soft) outcome[field] = 'defaulted';

    const confidence = worse(
      got.missed.length ? 'needs-review' : got.soft.length ? 'proposed' : 'exact',
      ceiling,
    );
    worst = worse(worst, confidence);
    rows.push({ fields: got.fields, confidence, outcome });
  }

  /* AN EMPTY PAGE IS NOT A FAILED ONE. A window with nothing in it is the ordinary answer to *what
     changed since Tuesday*, and reporting it at `needs-review` would put a person in front of it. */
  return { rows, confidence: rows.length === 0 ? 'exact' : worst };
}
