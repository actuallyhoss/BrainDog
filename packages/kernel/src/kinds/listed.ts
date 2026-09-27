/**
 * What the kinds drawn from a list's rows share: a `calendar`, a `link` block and a `gallery` each read one list by
 * `source: register.<id>` and name what each of their cells is with `columns:`, or write their rows out by hand with
 * `authored:`.
 *
 * ONE READ FOR THE THREE, and it is the read a `table` gets in `pages.ts`: the source is a list the record declares,
 * each column names a field of it, the `where:` sentence is read by `metrics.ts`'s own `predicateOf`, and a refusal is
 * the same code and the same sentence. What differs between the three is what each column must be and how many rows
 * they read, which each module says.
 *
 * A LEAF, IMPORTING NOTHING OF THE KERNEL AT RUN TIME. The kind registry (`kinds/index.ts`) is read by `block-keys.ts`
 * and `declare.ts` while they load, and `pages.ts` and `metrics.ts` both reach `declare.ts` through their own imports
 * (`govern.ts` down to `migrate.ts`). A module importing either would, when the registry is the first file loaded (as
 * `test/kinds-registry.test.ts` loads it), load `block-keys.ts` before the registry's table existed. So what a read
 * needs from those files arrives on `deps.kit`, which `readBlock` fills (`KindKit`).
 */

import type { Refusal } from '@braindog/ports';
import { refused } from '@braindog/ports';
import type { Predicate, Schema } from '@braindog/where';

import type { Entry } from '../index.ts';
import type { PageBlock, PageDeps } from '../pages.ts';
import type { KindContext } from './index.ts';
import type { Raw } from './words.ts';

/** A register as a block names its source, `register.<id>`: the shape `declare.ts` installs a source by. */
const REGISTER_SOURCE = /^register\.[a-z][a-z0-9_-]{0,31}$/u;

/**
 * The keys every block may carry (`block-keys.ts` `GENERAL`) that a kind drawn from a list's rows does nothing with.
 *
 * REFUSED RATHER THAN DRAWN WITHOUT. `cells` turns a block into figures and `inherit` reads a project's rows and then
 * the global ones, each in an arm of `pages.ts` a registered kind never reaches, so a calendar carrying either would
 * install and draw as if the key were not there.
 */
const UNREAD_HERE = ['cells', 'inherit', 'working', 'opening', 'from', 'horizon', 'target'] as const;

const ORDINAL = ['first', 'second', 'third'] as const;

export const invalid = (fix: string, at: string, allowed?: readonly string[]): Refusal => ({
  code: 'DECLARATION_INVALID',
  fix,
  at,
  ...(allowed === undefined ? {} : { allowed }),
});

/**
 * The cells of each row a block writes out by hand, or `null` when it writes none.
 *
 * NARROWED, NEVER TRUSTED: at install nothing past the kind and the key names has been checked yet (`kinds/index.ts`),
 * so a row that is not `{ cells: [...] }` is a row of no cells here, and `declare.ts` refuses it in its own sentence.
 */
export function authoredCells(block: Raw): unknown[][] | null {
  const authored = block.authored;
  if (authored === undefined) return null;
  if (!Array.isArray(authored)) return [];
  return authored.map((row: unknown) =>
    row !== null && typeof row === 'object' && Array.isArray((row as { cells?: unknown }).cells) ? (row as { cells: unknown[] }).cells : [],
  );
}

/**
 * Why a block of a kind drawn from a list's rows cannot be read, or `null`: a key it does nothing with, neither a list
 * nor rows of its own, a source that is not a list, or the wrong number of columns over one.
 *
 * `columns` is how many columns it names over a list, fewest and most, and the words that say which, for the sentence.
 *
 * A BLOCK WITH NEITHER A LIST NOR ROWS INSTALLS, AND ITS READ REFUSES IT, as a `capture` with no `register:` does
 * (`declare.ts`): whether a key is required is not decided at install, and `declare.test.ts` holds that by installing
 * every kind bare. So `stage` says which of the two is asking, and only the read is told the block names nothing.
 */
export function listedFault(block: Raw, kind: string, columns: { fewest: number; most: number; said: string }, stage: KindContext['stage']): Refusal | null {
  for (const key of UNREAD_HERE)
    if (Object.hasOwn(block, key) && block[key] !== undefined) return invalid(`A ${kind} block does nothing with ${key}:, so it would be drawn without it. Take it off.`, key);
  const source = block.source;
  if (source === undefined && block.authored === undefined)
    return stage === 'read'
      ? invalid(`A ${kind} reads a list with source: register.<id>, or writes its rows out with authored:, and this one does neither, so it would draw only its empty sentence.`, 'source')
      : null;
  if (source === undefined) return null;
  if (typeof source !== 'string' || !REGISTER_SOURCE.test(source)) return invalid(`A ${kind} reads a list, as source: register.<id>, and ${JSON.stringify(source)} is not one.`, 'source');
  const named = Array.isArray(block.columns) ? (block.columns as unknown[]) : [];
  const fields = named.every((c) => c !== null && typeof c === 'object' && typeof (c as { field?: unknown }).field === 'string');
  if (!fields || named.length < columns.fewest || named.length > columns.most)
    return invalid(`A ${kind} over a list names ${columns.said}, and this one names ${named.length === 0 ? 'none' : named.length}.`, 'columns');
  return null;
}

/** What one column of a kind must be: the field types it may name and the words for them, or `null` for any field. */
export type ColumnRule = { types: readonly string[]; said: string } | null;

/** A list's rows as a kind drawn from them read them. */
export type Listed = { register: string; schema: Schema; rows: Entry[]; matched: number };

/**
 * The rows of the list a block names, or what stops them being read.
 *
 * `within` is the kind's own clauses, added to the block's `where:` and read by the same `predicateOf`, so a calendar's
 * months name local days exactly as a sentence would. `order` is the kind's order when the block writes none. `limit`
 * is how many rows are asked for; `matched` counts every row the clauses admit, so a kind that must see every row
 * compares it with its ceiling.
 */
export function readListed(
  deps: PageDeps,
  block: PageBlock,
  kind: string,
  how: { rules: readonly ColumnRule[]; limit: number; within?: Predicate; order?: { field: string; dir?: 'asc' | 'desc' }[] },
): Listed | { refusals: Refusal[] } {
  const kit = deps.kit;
  if (!kit) return { refusals: [{ code: 'NOT_IN_THIS_BUILD', fix: `This record does not read a ${kind} onto a page yet.`, at: 'kind' }] };
  const register = typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
  const schema = register === null ? null : deps.schemaOf(register);
  if (register === null || !schema) return { refusals: [{ code: 'SOURCE_UNKNOWN', fix: `${String(block.source)} is not a source this record reads.`, at: 'source' }] };

  /* EACH COLUMN NAMES A FIELD OF THE LIST, and the field is one this kind can draw in that place. The sentences are the
     general read's (`pages.ts`), so a calendar's unknown column reads as a table's does. */
  const columns = block.columns ?? [];
  const unknown = columns.map((c) => c.field).filter((f) => !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return { refusals: [{ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }] };
  for (const [i, column] of columns.entries()) {
    const rule = how.rules[i];
    const type = schema.fields[column.field]?.type ?? '';
    if (!rule || rule.types.includes(type)) continue;
    return {
      refusals: [
        invalid(
          `A ${kind}'s ${ORDINAL[i] ?? `column ${i + 1}`} column is ${rule.said}, and ${register}'s ${column.field} is ${type}.`,
          'columns',
          Object.entries(schema.fields)
            .filter(([, spec]) => rule.types.includes(spec.type))
            .map(([field]) => field),
        ),
      ],
    };
  }

  const said = kit.predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { refusals: said.bad };
  const own = how.within === undefined ? undefined : kit.predicateOf(how.within, schema, deps.ctx);
  if (own?.bad.length) return { refusals: own.bad };
  const clauses = [said.predicate, own?.predicate].filter((p): p is Predicate => p !== undefined);
  const where: Predicate | undefined = clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : { all: clauses };
  const order = block.order?.length ? block.order : how.order;
  const read = deps.list({ register, where, limit: how.limit, ...(order?.length ? { order } : {}) });
  /* A LIST CANNOT CONFLICT, nothing was written, so the other arm is the type system agreeing (`pages.ts` says the same). */
  if (!read.ok) return { refusals: refused(read) ? [read.refusal] : [] };
  return { register, schema, rows: read.value.rows, matched: read.value.matched };
}
