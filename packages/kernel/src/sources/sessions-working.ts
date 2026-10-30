/**
 * `sessions.working`: the runs working now, each with its helpers folded under it.
 *
 * ITS ROWS ARE ROWS OF THE LIST OF RUNS, as the live runs' are (`sessions-live.ts`). Moved out of `pages.ts` with its
 * answer unchanged (`sources/index.ts`).
 */

import type { Json } from '../coerce.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { recordNamed } from '../session.ts';
import type { Also, Source } from './index.ts';

type Run = BlockResult['rows'][number];

/** `recordNamed` in `session.ts`: whether a run's name is the record's own. Handed in, since a source imports no kernel file. */
export type Named = typeof recordNamed;

/**
 * The kit's reader of a run's name, or `null` on a kit that carries none.
 *
 * READ OFF THE KIT, because a source module is a leaf at run time (`sources/index.ts`) and `recordNamed` is the kernel's.
 */
export function namedOf(kit: SourceKit): Named | null {
  return (kit as SourceKit & { recordNamed?: Named }).recordNamed ?? null;
}

/** The refusal for a block that names `doing_said` on a kit with no reader of a run's name, or `null` when it may be read. */
export function saidRefusal(block: PageBlock, kit: SourceKit): { code: 'NOT_IN_THIS_BUILD'; fix: string; at: string } | null {
  if (namedOf(kit) !== null || !(block.columns ?? []).some((c) => c.field === DOING_SAID)) return null;
  return { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read what a run said it is doing onto a page yet. Use doing.', at: 'columns' };
}

/**
 * The column a card reads for what a run said it is doing: worked out a row when read, and no field of the list.
 * Allowed beside `seq` where the two sources check a block's columns.
 */
export const DOING_SAID = 'doing_said';

/**
 * What no card may print, each read off the words: a file path (a word that starts at a folder, runs through two, or
 * holds a backslash), a host name or a file's name (letters after a dot inside a word), and an id (a spoken one such as
 * `tools#8`, a row's own, a key's, or a prefixed one such as a workflow's).
 */
const UNPRINTABLE: readonly RegExp[] = [
  /(?:^|[\s("'`=:,])(?:~|\.{1,2})?\/\S/u,
  /\S\/\S*\//u,
  /\\/u,
  /[\p{L}\p{N}_-]\.\p{L}{2,}(?!\p{L})/u,
  /[a-z][a-z0-9_]*#[0-9]+/u,
  /\b[0-9A-HJKMNP-TV-Z]{26}\b/u,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/iu,
  /\b[a-z]{1,8}_(?=[0-9A-Za-z]*[0-9])[0-9A-Za-z]+\b/u,
];

/** Whether words may be printed on a card: they hold no file path, host name or id. */
export function printable(words: string): boolean {
  return !UNPRINTABLE.some((shape) => shape.test(words));
}

/**
 * What each run said it is doing, in its own words, aligned with `runs`: `''` while its name is still the record's own
 * (`named`, which is `recordNamed`), for a run with no name, and for words no card may print (`printable`).
 *
 * `projects` is the name of the project each run is placed in, as `projectsOf` answers it, and `known` the names of the
 * record's projects, so a name the record gave in a project the run has since left is still read as the record's.
 *
 * NOTHING, NEVER A PART: words with a path in them are not cut around it, because what is left reads as a sentence the
 * agent did not write.
 */
export function doingSaid(runs: readonly { fields: Record<string, Json>; created_at: string }[], projects: readonly (string | null)[], known: readonly string[], named: Named): string[] {
  return runs.map((run, i) => {
    const doing = run.fields.doing;
    if (typeof doing !== 'string' || named(run, projects[i] ?? null, known) !== null) return '';
    const said = doing.trim();
    return printable(said) ? said : '';
  });
}

/**
 * `rows` with what each run said it is doing added to its fields, for a block that names the column, and `rows` as they
 * came for one that does not. `projects` is `projectsOf`'s `scopes` for the same rows.
 *
 * THE RECORD'S OTHER PROJECTS ARE READ FROM THE LISTS THE RUNS ARE PLACED IN, by their titles, as `projectsOf` names a
 * run's own: no list is named here, so whichever list a record keeps its projects in is the one read.
 *
 * ADDED TO THE ANSWER AND NEVER WRITTEN: each row is a copy, so the list of runs holds no such field and the next read
 * that does not ask for it gets none.
 */
export function withSaid(deps: PageDeps, block: PageBlock, rows: Run[], projects: readonly (string | null)[], kit: SourceKit): Run[] {
  const named = namedOf(kit);
  if (named === null || !(block.columns ?? []).some((c) => c.field === DOING_SAID)) return rows;
  const lists = new Set<string>();
  for (const r of rows) {
    const m = kit.SPOKEN.exec(typeof r.fields.project === 'string' ? r.fields.project : '');
    if (m) lists.add(m[1]!);
  }
  const known: string[] = [];
  for (const register of lists) {
    const title = deps.titleOf(register);
    const listed = title ? deps.list({ register, limit: 200 }) : null;
    if (!listed?.ok) continue;
    for (const r of listed.value.rows) {
      const name = r.fields[title!];
      if (typeof name === 'string' && name.trim() !== '') known.push(name);
    }
  }
  const said = doingSaid(rows, projects, known, named);
  return rows.map((r, i) => ({ ...r, fields: { ...r.fields, [DOING_SAID]: said[i] ?? '' } }));
}

/**
 * The runs working now, as rows of `session`, each with its helpers folded under it, the most recently heard from first.
 *
 * ONE NUMBER FOR EVERY READER. The rail's foot, Today's headline and tile and the Agents headline each counted runs
 * their own way, and on the owner's record they said four while two of the four were last heard from hours before.
 * They all read this now, and this reads `workingRuns` in `presence.ts`, so the count is the clock's and nobody's own.
 *
 * NO `where` AND NO `order`. Which runs are working is the clock's to say and the order is the clock's too; a `where`
 * would let a page count a different "working" under the same name, which is the fault this source closes.
 */
function workingBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { projectsOf, SESSION } = kit;
  if (!deps.sessionsWorking)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read its working runs onto a page yet.', at: 'source' }) };
  const schema = deps.schemaOf(SESSION);
  if (!schema) return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: 'This BrainDog keeps no runs.', at: 'source' }) };
  if (block.where !== undefined)
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.working is every run working now, so it takes no where:. Use sessions.live to choose among runs.', at: 'where' }),
    };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.working comes the most recently heard from first, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => f !== 'seq' && f !== DOING_SAID && !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${SESSION} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
    };
  const unread = saidRefusal(block, kit);
  if (unread) return { ...base, refusals: also(unread) };
  const working = deps.sessionsWorking();
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const kept = working.slice(0, limit);
  const rows = kept.map((w) => w.run);
  const placed = projectsOf(deps, rows);
  return { ...base, rows: withSaid(deps, block, rows, placed.scopes, kit), matched: working.length, ...placed, helpers: kept.map((w) => w.helpers) };
}

export const sessionsWorking: Source = { read: workingBlock };
