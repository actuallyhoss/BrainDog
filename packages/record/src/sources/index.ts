/**
 * The sources the record hands the page reader (PGS-A11 job 3): what a page may draw that the kernel cannot read by
 * itself, because only the record knows who is reading and what it holds. Each is a `HostSource` (`PageDeps.hostSources`
 * in `kernel/src/pages.ts`), its rows read on the kernel's one rows path, so a page or an agent writes
 * `{ kind: table, source: lists }` and draws every list with its count, with nothing hardcoded.
 *
 * A PLAIN TABLE, AS THE KERNEL'S OWN IS (`kernel/src/sources/index.ts`), looked up with `Object.hasOwn`, so a page naming
 * `constructor` finds nothing. The kernel asks it only for a name no registered source answers, so one here never
 * shadows the kernel's, and never for a list.
 */

import type { Entry, Kernel, PageDeps } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { evaluate, type Schema } from '@braindog/where';

import type { CallContext } from '../index.ts';
import { lists } from './lists.ts';
import { pages } from './pages.ts';

/** One source the record hands the page reader: its fields, and its rows read as a list's are. */
export type HostSource = NonNullable<ReturnType<NonNullable<PageDeps['hostSources']>>>;

/** What a source reads with: the kernel, who is reading, and whether they may read one list, as `list` asks it. */
export type SourceDeps = {
  kernel: Pick<Kernel, 'registers' | 'count' | 'list' | 'pages' | 'page' | 'scope'>;
  ctx: CallContext;
  readable: (ctx: CallContext, register: string) => Refusal | null;
};

/** One source, made for one read by one reader. */
export type SourceMaker = (deps: SourceDeps) => HostSource;

/**
 * The record's sources, by the name a page's `source:` says. One line a source.
 *
 * EACH IS REACHED WHEN IT IS ASKED, NOT WHEN THIS FILE LOADS: each source imports this file's row makers, so a test that
 * loads one source first would find this table built over a name not yet set.
 */
export const HOST_SOURCES: Record<string, SourceMaker> = {
  lists: (deps) => lists(deps),
  pages: (deps) => pages(deps),
};

/** The page reader's `hostSources` for one reader: the source a name says, made once a read, or `undefined`. */
export function hostSourcesOf(deps: SourceDeps): (name: string) => HostSource | undefined {
  const made = new Map<string, HostSource>();
  return (name) => {
    if (!Object.hasOwn(HOST_SOURCES, name)) return undefined;
    if (!made.has(name)) made.set(name, HOST_SOURCES[name]!(deps));
    return made.get(name);
  };
}

/** A row of a source as the page reader takes one: an entry of no list, its id its handle, its stamp its newest change. */
export function sourceRow(register: string, id: string, fields: Entry['fields'], at: string | null): Entry {
  return { id, register, seq: null, fields, state: null, version: 1, created_at: at ?? '', updated_at: at ?? '', deleted_at: null };
}

/** The most rows one read of a source answers, as a list's own read is capped. */
const ROWS_MOST = 500;

/**
 * A source's rows asked as a list's are, over rows it holds in hand: `where` read by `evaluate`, the one reading a
 * predicate has away from the database, `order` field by field (nothing last), `limit` cut, and `cursor` the place the
 * page before ended, which the answer's `next` says while more remain.
 */
export function answerRows(all: readonly Entry[], schema: Schema, q: Parameters<HostSource['rows']>[0]): Result<{ rows: Entry[]; next: string | null; matched: number }> {
  let rows = q.where === undefined ? [...all] : all.filter((r) => evaluate(q.where!, r.fields, schema));
  for (const o of [...(q.order ?? [])].reverse()) {
    const sign = o.dir === 'desc' ? -1 : 1;
    rows = rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const x = a.r.fields[o.field] ?? null;
        const y = b.r.fields[o.field] ?? null;
        if (x === y) return a.i - b.i;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x < y ? -1 : 1) * sign;
      })
      .map(({ r }) => r);
  }
  const from = q.cursor !== undefined && /^[0-9]+$/u.test(q.cursor) ? Number(q.cursor) : 0;
  const most = Math.min(ROWS_MOST, Math.max(0, Math.floor(q.limit ?? 50)));
  const page = rows.slice(from, from + most);
  const end = from + page.length;
  return { ok: true, value: { rows: page, next: end < rows.length ? String(end) : null, matched: rows.length } };
}
