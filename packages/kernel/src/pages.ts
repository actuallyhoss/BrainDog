/**
 * Reading a page: a document, and the queries its blocks are.
 *
 * NOTHING HERE IS A COMPONENT. A page names blocks; a block names a kind, a source, a predicate and
 * some columns. What this produces is the ROWS and the readings — never the formatting, which is the
 * renderer's and is a different package. The split is what makes a page an agent writes
 * indistinguishable from one that shipped: both are documents, and neither is code.
 *
 * ONE BLOCK'S REFUSAL IS ONE BLOCK. A page whose third block names a field nobody declared shows
 * the other four and says what happened in the third — because a page that fails whole is a page a
 * person cannot use to find out what is wrong with it, and the thing that wrote the block cannot
 * see the screen.
 *
 * A TEMPLATE IS ONE DECLARATION AND ONE PAGE PER ROW. `for: { register, where }` expands into a page
 * per matching row with every `{{field}}` filled from it — so four projects are four pages over one
 * document rather than four documents with the name typed into every predicate, every metric id and
 * every heading. The slug comes from the row's title, so `/p/kiln` survives a re-ordering.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import type { Predicate, Schema } from '@braindog/where';

import type { Entry } from './index.ts';
import { predicateOf, type EvalContext, type MetricDecl, type Reading } from './metrics.ts';

export type PageBlock = {
  kind: string;
  heading?: string;
  span?: number;
  source?: string;
  where?: string;
  columns?: { field: string; label?: string }[];
  cells?: { metric: string; label?: string }[];
  order?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  empty?: string;
  target?: number;
};

export type PageDecl = {
  page: string;
  title: string;
  blocks: PageBlock[];
  /** `for:` makes it a template: one page per row of the register it names. */
  for?: { register: string; where?: string };
  requires?: string[];
  [key: string]: unknown;
};

export type BlockResult = PageBlock & {
  /** The rows the block draws, cut to `limit`. */
  rows: Entry[];
  /** How many the predicate matched, which is what a total is a total OF. */
  matched: number;
  /** A `stat` block's figures, in the order its cells named them. */
  readings?: { metric: string; label?: string; reading: Reading | null; refusal?: Refusal }[];
  /** What this block could not do. Non-empty means the block drew nothing. */
  refusals: Refusal[];
};

export type PageResult = { page: string; title: string; blocks: BlockResult[]; [key: string]: unknown };

export type PageDeps = {
  /** Every live page declaration. */
  pages: () => PageDecl[];
  /** One metric document by its id, or `null`. */
  metric: (id: string) => MetricDecl | null;
  /** One reading. It is a callback rather than SQL because this layer runs queries it did not write. */
  read: (decl: MetricDecl) => Result<Reading>;
  list: (q: { register: string; where?: Predicate | undefined; limit?: number }) => Result<{ rows: Entry[]; matched: number }>;
  schemaOf: (register: string) => Schema | null;
  /** The field that titles a row of this register — what a template's slug is made from. */
  titleOf: (register: string) => string | null;
  ctx: EvalContext;
};

/** The sources a block may name that are not a register. Named, so a new one is a refusal. */
const COMPUTED = new Set(['forecast.runway']);

/**
 * Every page a person could open, templates expanded.
 *
 * The slug of an expanded page is the ROW'S TITLE, lower-cased and hyphenated — not its number.
 * `/p/kiln` is a URL somebody can type and one that survives the row being renumbered; `/p/things-1`
 * is neither.
 */
export function resolvePages(deps: PageDeps): { slug: string; decl: PageDecl; row?: Entry }[] {
  const out: { slug: string; decl: PageDecl; row?: Entry }[] = [];

  for (const decl of deps.pages()) {
    if (!decl.for) {
      out.push({ slug: decl.page, decl });
      continue;
    }
    const schema = deps.schemaOf(decl.for.register);
    if (!schema) continue;
    const said = predicateOf(decl.for.where, schema, deps.ctx);
    if (said.bad.length) continue;
    const listed = deps.list({ register: decl.for.register, where: said.predicate, limit: 200 });
    if (!listed.ok) continue;

    const title = deps.titleOf(decl.for.register);
    if (!title) continue;
    for (const row of listed.value.rows) {
      const name = String(row.fields[title] ?? '');
      if (!name) continue;
      out.push({ slug: slugify(name), decl: fill(decl, row) as PageDecl, row });
    }
  }
  return out;
}

/** One page, with every block run. */
export function readPage(deps: PageDeps, slug: string): Result<PageResult> {
  const found = resolvePages(deps).find((p) => p.slug === slug);
  if (!found)
    return no<PageResult>('PAGE_UNKNOWN', `There is no page at ${slug}.`, {
      at: 'slug',
      allowed: resolvePages(deps).map((p) => p.slug),
    });

  return ok({
    ...found.decl,
    page: found.slug,
    blocks: found.decl.blocks.map((b) => readBlock(deps, b)),
  });
}

/**
 * One block.
 *
 * IT NEVER THROWS. Everything a block can get wrong — a source nobody has, a predicate the register
 * cannot answer, a metric that is not declared — comes back as a refusal ON THE BLOCK, so the page
 * around it still draws.
 */
export function readBlock(deps: PageDeps, block: PageBlock): BlockResult {
  const base: BlockResult = { ...block, rows: [], matched: 0, refusals: [] };

  if (block.kind === 'stat' || block.cells) {
    return {
      ...base,
      readings: (block.cells ?? []).map((cell) => {
        const decl = deps.metric(cell.metric.split(':')[0] ?? '');
        if (!decl)
          return {
            ...cell,
            reading: null,
            refusal: {
              code: 'METRIC_UNKNOWN',
              fix: `There is no metric called ${cell.metric}. A figure this record computes rather than declares is not one either.`,
              at: 'metric',
            },
          };
        /* The declaration with its parameter filled: `project-owed:Kiln` is one document read about
           one project, which is what makes a project page a declaration rather than a case. */
        const param = cell.metric.split(':')[1];
        const read = deps.read(param === undefined ? decl : (fill(decl, null, param) as MetricDecl));
        return read.ok ? { ...cell, reading: read.value } : { ...cell, reading: null, refusal: read.refusal };
      }),
    };
  }

  /* A BLOCK WITH NO SOURCE IS A WRITTEN BLOCK, and the record has nothing to add to it. `05` §1 makes
     `table` the page-only kind that takes `source:` and `columns:`; every other kind draws the rows
     of its own fenced text, so a `note` or a `code` block is held, travels and versions like any
     other declaration and is simply handed back. Refusing it would be the record insisting that a
     paragraph is a query. */
  if (!block.source) return base;
  /* A COMPUTED SOURCE IS NOT REFUSED AND NOT ANSWERED HERE. The cash walk is a reading over two
     registers rather than a query against one, and the block layer's job is to say honestly that it
     did not run it — an empty table that looks like an empty register would be worse. */
  if (COMPUTED.has(block.source))
    return { ...base, refusals: [{ code: 'UNIMPLEMENTED', fix: `${block.source} is computed, and this record does not compute it yet.`, at: 'source' }] };

  const register = block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
  const schema = register ? deps.schemaOf(register) : null;
  if (!register || !schema)
    return { ...base, refusals: [{ code: 'SOURCE_UNKNOWN', fix: `${block.source} is not a source this record reads.`, at: 'source' }] };

  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: said.bad };

  const listed = deps.list({ register, where: said.predicate, limit: Math.max(1, block.limit ?? 50) });
  if (!listed.ok) return { ...base, refusals: [listed.refusal] };

  /* THE COLUMNS ARE CHECKED AGAINST THE REGISTER. A column naming a field nobody declared renders as
     an empty cell under a heading that promises one, which reads as "no value" rather than as "no
     such thing" — and the difference is whether anybody investigates. */
  const unknown = (block.columns ?? [])
    .map((c) => c.field)
    .filter((f) => f !== 'seq' && !Object.hasOwn(schema.fields, f));

  return {
    ...base,
    rows: listed.value.rows,
    matched: listed.value.matched,
    refusals: unknown.length
      ? [{ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }]
      : [],
  };
}

/* ── the small parts ─────────────────────────────────────────────────────── */

/** A title as a slug a person can type: lower-case, hyphens, nothing else. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * `{{field}}` filled from one row, everywhere in the document.
 *
 * A STRING PASS OVER THE WHOLE DOCUMENT, deliberately: the placeholder appears in a title, in a
 * predicate, in a heading, in an empty state and in a metric id, and a substitution that walked only
 * the fields somebody remembered is a substitution that leaves `{{name}}` on a screen.
 */
export function fill(doc: unknown, row: Entry | null, param?: string): unknown {
  const text = JSON.stringify(doc).replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    if (key === 'it') return param ?? whole;
    const value = row?.fields[key];
    return value === null || value === undefined ? whole : String(value).replaceAll('"', '\\"');
  });
  return JSON.parse(text);
}
