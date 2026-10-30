/**
 * `exceptions`: what went quiet on this record, one row each.
 *
 * A list that took rows most days and then took none, a door that stopped taking messages, a feed whose clock passed
 * with no run, a row older than the window its page declares (`exceptions.ts`). They belong to no list and name every
 * list, so the block is shown to a reader of the whole record who is held from none of them (`whole`, `everyList`).
 *
 * READ THROUGH `deps`, as every block reads the record: the host hands `exceptions`, the read `openExceptions` answers
 * over the lists it watches (`PageDeps.exceptions`); a host that hands none gets the block refused as not in this build.
 *
 * NOTHING A PERSON READS ON A ROW IS A HANDLE. `subject` is the name the record holds, `since` a day and `was` a
 * sentence. The detector's own handle is the row's id, the same on every read while the thing stays quiet.
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Exception, Was } from '../exceptions.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/** The four things that can go quiet, as `exceptions.ts` says them. */
const KINDS: readonly Exception['kind'][] = ['list', 'door', 'schedule', 'stale'];

/**
 * What an `exceptions` block's `where` and columns may name: one row a thing that stopped. `subject` is what a person
 * calls it, `since` the day it was last there, `was` what it was doing before, in words, and `kind` which of the four.
 */
const EXCEPTIONS: Schema = {
  register: 'exceptions',
  fields: {
    kind: { type: 'enum', values: KINDS },
    subject: { type: 'text' },
    since: { type: 'day' },
    was: { type: 'text' },
  },
};

/** What a thing with no name on the record is called, by its kind: a word for it, never its handle. */
const UNNAMED: Record<Exception['kind'], string> = {
  list: 'A list with no name',
  door: 'A door with no name',
  schedule: 'A feed with no name',
  stale: 'A list with no name',
};

const MINUTE_MS = 60_000;
const SPANS: readonly (readonly [number, string])[] = [[86_400_000, 'day'], [3_600_000, 'hour'], [MINUTE_MS, 'minute']];

/** A length of time as a person says it: `day`, `6 hours`, `15 minutes`. The largest unit it is a whole number of. */
function spanSaid(ms: number): string {
  const whole = Math.max(MINUTE_MS, Math.round(ms / MINUTE_MS) * MINUTE_MS);
  const [size, word] = SPANS.find(([s]) => whole % s === 0)!;
  const count = whole / size;
  return count === 1 ? word : `${String(count)} ${word}s`;
}

/** What presence was before it stopped, as a sentence. A shape nobody knows says nothing rather than a guess. */
function wasSaid(kind: Exception['kind'], was: Was): string {
  if ('days' in was) return `${kind === 'door' ? 'Took messages' : 'Written to'} on ${String(was.days)} of ${String(was.of)} days`;
  if ('everyMs' in was) return `Ran every ${spanSaid(was.everyMs)}`;
  if ('afterMs' in was) return `Kept within ${spanSaid(was.afterMs).replace(/^(day|hour|minute)$/u, 'a $1')}`;
  return '';
}

/**
 * One exception as a row a table or cards block draws, keyed by its cause, `seq` `null` because it is no list's row.
 * `row` rides on it for a host to link by, the newest row of a quiet list or the one out of date, and is no field a
 * column may name: it is a handle, and a person reads the name.
 */
function quietEntry(e: Exception, at: string): Entry {
  const kind = KINDS.includes(e.kind) ? e.kind : 'list';
  const subject = typeof e.name === 'string' && e.name.trim() !== '' ? e.name : UNNAMED[kind];
  return {
    id: e.cause,
    register: EXCEPTIONS.register,
    seq: null,
    fields: { kind, subject, since: e.since, was: wasSaid(kind, e.was), row: e.row },
    state: kind,
    version: 1,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  };
}

/**
 * What went quiet, the longest quiet first, which is the read's own order: `order:` is refused rather than ignored,
 * and a page that wants one kind asks for it with `where: kind is list`.
 *
 * NOTHING QUIET IS AN EMPTY BLOCK AND NO REFUSAL. A record that is arriving as it was has nothing to say here, and so
 * has one too new for a silence to mean anything (`exceptions.ts`, the rule about absence).
 */
function exceptionsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  if (!deps.exceptions) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read what went quiet onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'exceptions come the longest quiet first, so it takes no order:. Use where: kind is list for one kind.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(EXCEPTIONS.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `What went quiet has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(EXCEPTIONS.fields) }) };
  const said = kit.predicateOf(block.where, EXCEPTIONS, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const at = new Date(deps.ctx.nowMs).toISOString();
  const kept = deps
    .exceptions()
    .map((e) => quietEntry(e, at))
    .filter((r) => evaluate(said.predicate, r.fields, EXCEPTIONS));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  return { ...base, rows: kept.slice(0, limit), matched: kept.length, types: kit.typesOf(EXCEPTIONS) };
}

/* `everyList`, BECAUSE A ROW HERE IS A LIST'S NAME AND ITS NEWEST ROW. Measured with `whole` alone: a member at `read`
   with one list held to `append` was drawn that list's name and the day it was last written to. */
export const exceptions: Source = { whole: true, everyList: true, read: exceptionsBlock };
