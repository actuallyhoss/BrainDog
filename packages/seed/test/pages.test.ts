/**
 * The pages, as documents the record holds.
 *
 * A PAGE IS A DECLARATION, so it travels in a `.brain` file, it versions when it changes, and a person
 * can point at the version that was live when a figure was screenshotted. Nothing here is a
 * component: a block names a kind, a source, a predicate and some columns, and what draws it has
 * never heard of money or of projects.
 *
 * WHAT IS ASSERTED IS THAT EVERY BLOCK IS ABOUT SOMETHING. A predicate that parses and means nothing
 * is the failure this whole layer keeps running into — the block draws the whole register and looks
 * exactly like a block that filtered, and the thing writing most of these declarations is an agent
 * that cannot see the screen. So every `where:` on every block of every page is resolved against
 * the register it names, here, once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { BUILT_IN_FIGURES } from '../../kernel/src/built-in-figures.ts';
import { parseWhere, type Schema } from '@braindog/where';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { AGENTS_METRICS, AGENTS_PAGES, METRICS, NOW, PAGES, REGISTERS, ROWS, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<{ k: Kernel; sql: Sql & { close(): void } }> {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql };
}

type Block = {
  kind?: string;
  heading?: string;
  source?: string;
  where?: string;
  cells?: { metric?: string }[];
  columns?: { field?: string }[];
};
const blocksOf = (page: Record<string, unknown>): Block[] => (page.blocks as Block[] | undefined) ?? [];

/**
 * The sources that are not a register.
 *
 * NAMED, so a new one is a failure rather than a silent skip. `forecast.runway` is the cash walk —
 * a computed source rather than a stored one, which `05` §2 anticipates by deferring a `forecast`
 * KIND and saying the primitive layer exists so it can be drawn without one.
 *
 * THE KERNEL'S OWN LIST (`COMPUTED` in `packages/kernel/src/pages.ts`), written out, since money-core 3.0.0's one
 * `money` page draws `governance.open`, `deadlines` and `activity` beside the walk. A source the kernel does not name
 * is refused there, so one missing from here is still a failure.
 */
/* `signs` SINCE people 3.3.0's Health page: each vital sign with its state and sentence. */
/* `kpis` SINCE the KPI plan of 21 October (K3-C): a project's key numbers on its page (`sources/kpis.ts`). */
const COMPUTED = new Set(['forecast.runway', 'activity', 'sessions.live', 'actions', 'governance.open', 'runs_on', 'deadlines', 'figures.home', 'signs', 'kpis', 'scripts']);

/**
 * The figures the record computes rather than declares.
 *
 * `runway` is the cash walk's own answer — how many days until the balance goes under — and it is
 * not a sum over a register, so there is no metric document that could produce it. Named here for
 * the same reason `forecast.runway` is: a cell naming a figure nobody declared and nobody computes
 * renders as an em dash, and an em dash from a missing metric looks exactly like an em dash from a
 * metric that read nothing. One of those is a bug and the other is Tuesday.
 */
const COMPUTED_FIGURES = new Set(['runway']);

/* THE RECORD'S REGISTERS, NOT THE SEED'S LIST. A page may draw the kernel's own `session`, which the
   seed writes into and does not declare, and a check that skipped what the seed did not declare
   would skip exactly that block. */
const schemaOf = (k: Kernel, register: string): Schema => ({
  register,
  fields: Object.fromEntries((k.register(register)?.fields ?? []).map((f) => [f.id, f as never])),
});

/* ── the record holds them ───────────────────────────────────────────────── */

test('A PAGE IS A DOCUMENT THE RECORD HOLDS, and it travels in the file', async () => {
  const { k, sql } = await seeded();

  const held = sql.all<{ id: string; kind: string }>("SELECT id, kind FROM declaration WHERE kind = 'page' AND superseded_at IS NULL");
  assert.equal(held.length, Object.keys(PAGES).length + Object.keys(AGENTS_PAGES).length, 'a page did not install');
  for (const slug of Object.keys(PAGES)) assert.ok(held.some((d) => d.id === `page.${slug}`), `page.${slug} is missing`);

  // The metrics too — a `stat` block names one, and a page whose figures are not in the record is a
  // page the record cannot answer.
  const metrics = sql.all<{ id: string }>("SELECT id FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL");
  assert.equal(metrics.length, Object.keys(METRICS).length + Object.keys(AGENTS_METRICS).length);

  // And they travel: a customer's copy without its pages is a copy of the rows, not of the record.
  const lines = await k.export();
  assert.ok(lines.ok);
  assert.ok(lines.value.some((l) => l.includes('page.money')), 'the pages did not travel in the file');
  sql.close();
});

/* ── every block is about something ──────────────────────────────────────── */

test('EVERY BLOCK NAMES A SOURCE THE RECORD HAS', async () => {
  const { k, sql } = await seeded();
  const missing: string[] = [];

  for (const [slug, page] of Object.entries(PAGES))
    for (const block of blocksOf(page as Record<string, unknown>)) {
      if (!block.source) continue;
      if (COMPUTED.has(block.source)) continue;
      /* A BAR OR A SPLIT MAY READ A FIGURE, which the record has when it is declared or when the kernel builds it in. */
      if (block.source.startsWith('metric.')) {
        if (!Object.hasOwn(BUILT_IN_FIGURES, block.source.slice('metric.'.length)) && !k.declarations().some((d) => d.id === block.source)) missing.push(`${slug}: ${block.source}`);
        continue;
      }
      const register = block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
      if (!register || !k.register(register)) missing.push(`${slug}: ${block.source}`);
    }

  assert.deepEqual(missing, []);
  sql.close();
});

test('AND EVERY `where:` RESOLVES AGAINST THE REGISTER IT NAMES', async () => {
  /* This is the one that matters. A clause that parses and means nothing draws the whole register
     and looks exactly like a clause that filtered: `state is not done` on a register with no such
     state was true of every row, on a page, for as long as nobody counted. */
  const { k, sql } = await seeded();
  const bad: string[] = [];

  for (const [slug, page] of Object.entries(PAGES)) {
    const template = (page as { for?: { register: string } }).for;
    /* A TEMPLATE'S PREDICATE CARRIES `{{field}}`, filled from one row of the register it is for. It
       is resolved with a real row rather than skipped, because a template nobody checked is four
       pages nobody checked. */
    const first = template ? (ROWS[template.register] ?? [])[0] : undefined;
    /* A TEMPLATE OVER A LIST THE SAMPLE HOLDS NO ROW OF DRAWS NO PAGE, and its holes have nothing to be filled from:
       money-core 3.1.0's `money-book`, over `books`. */
    if (template && first === undefined) continue;

    for (const block of blocksOf(page as Record<string, unknown>)) {
      if (!block.where || !block.source || COMPUTED.has(block.source)) continue;
      const register = block.source.slice('register.'.length);
      if (!k.register(register)) continue;

      /* `{{spoken}}` is the row's spoken id, `things#1` for the first row, rather than a field. A LINK IS THE ID OF THE
         ROW IT NAMES, as the record holds it and fills it (`fill` in `packages/kernel/src/pages.ts`), several joined
         by `or`, where the sample writes the place of that row: an organisation's `projects: [2]` read `id is 2`. */
      const holeOf = (key: string): string => {
        const field = (REGISTERS[template!.register]!.fields as { id: string; type: string; of?: string; to?: string }[]).find((f) => f.id === key);
        const raw = first![key];
        const linked = field && (field.type === 'ref' || field.of === 'ref') && field.to !== undefined;
        if (!linked) return String(raw ?? '');
        return (Array.isArray(raw) ? raw : [raw]).flatMap((n) => (typeof n === 'number' ? [k.get(`${field.to}#${n}`)?.id ?? ''] : [])).join(' or ');
      };
      const said = first && template
        ? block.where.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (key === 'spoken' ? `${template.register}#1` : key === 'seq' ? '1' : holeOf(key)))
        : block.where;

      /* WRITTEN AS A TREE, BY A BAND THAT CANNOT SAY ITS CUT AS ONE SENTENCE (Work's Not this week, work 1.21.0, 4d5f2fe2e): every leaf a field of this list. */
      if (typeof said !== 'string') {
        const leaves = (p: unknown): { field: string }[] => {
          const g = p as { all?: unknown[]; any?: unknown[]; none?: unknown[]; field?: string };
          return g.field !== undefined ? [{ field: g.field }] : [...(g.all ?? []), ...(g.any ?? []), ...(g.none ?? [])].flatMap(leaves);
        };
        assert.ok(leaves(said).length > 0, `${slug} · ${block.heading ?? block.kind} reads no field`);
        for (const l of leaves(said)) if (!Object.hasOwn(schemaOf(k, register).fields, l.field)) bad.push(`${slug} · ${block.heading ?? block.kind}: no field ${l.field}`);
        continue;
      }
      const out = parseWhere(said, schemaOf(k, register), {
        nowMs: NOW,
        refByTitle: (to, title) => {
          /* WHO IS READING, WHICH A PAGE'S READ FILLS IN, as Work's "yours" says it (`othersOf` in the kernel, 4d5f2fe2e). */
          if (title === 'someone else') return 'e_nobody';
          /* A ROW BY ITS SPOKEN ID, `accounts#1`, as a page about it names it (`{{spoken}}`), and the record reads it. */
          if (title === `${to}#1`) return k.get(title)?.id ?? null;
          const seq = (ROWS[to] ?? []).findIndex((r) => r[REGISTERS[to]!.title] === title);
          return seq < 0 ? null : (k.get(`${to}#${seq + 1}`)?.id ?? null);
        },
      });
      for (const r of out.bad) bad.push(`${slug} · ${block.heading ?? block.kind}: ${r.fix}`);
    }
  }

  assert.deepEqual(bad, []);
  sql.close();
});

test('and every column a block draws is a field the register declares', async () => {
  // A column naming a field nobody declared renders as an empty cell under a heading that promises
  // one — which reads as "no value" rather than as "no such thing".
  const { k, sql } = await seeded();
  const missing: string[] = [];
  /* The ones the renderer supplies rather than the register: a row's number, who changed it last, and,
     for the cash walk, its own three. And what a run said it is doing, a column the record works out over the list
     of runs (`withSaid`), no field of it. Named, so another is a failure. */
  const DERIVED = new Set(['seq', 'day', 'what', 'delta', 'balance', 'changed', 'doing_said']);

  for (const [slug, page] of Object.entries(PAGES))
    for (const block of blocksOf(page as Record<string, unknown>)) {
      if (!block.source || COMPUTED.has(block.source)) continue;
      const register = block.source.slice('register.'.length);
      const decl = k.register(register);
      if (!decl) continue;
      for (const c of block.columns ?? []) {
        if (!c.field || DERIVED.has(c.field)) continue;
        if (!decl.fields.some((f) => f.id === c.field)) missing.push(`${slug} · ${block.heading ?? block.kind}: ${register}.${c.field}`);
      }
    }

  assert.deepEqual(missing, []);
  sql.close();
});

test('EVERY `stat` CELL NAMES A METRIC THE RECORD DECLARES', async () => {
  // A tile whose metric does not exist renders as an em dash, which is indistinguishable from a
  // metric that read nothing — and one of those is a bug and the other is Tuesday. A figure the record has of its own
  // (`built-in-figures.ts`), `project-worked`, is declared by the record.
  const { sql } = await seeded();
  const missing: string[] = [];

  for (const [slug, page] of Object.entries(PAGES))
    for (const block of blocksOf(page as Record<string, unknown>))
      for (const cell of block.cells ?? []) {
        if (!cell.metric) continue;
        const id = cell.metric.split(':')[0]!;
        if (!METRICS[id] && !COMPUTED_FIGURES.has(id) && !Object.hasOwn(BUILT_IN_FIGURES, id)) missing.push(`${slug}: ${cell.metric}`);
      }

  assert.deepEqual(missing, []);
  sql.close();
});

test('a page that `requires:` a register names one the seeded record holds', async () => {
  const { k, sql } = await seeded();
  const missing: string[] = [];
  for (const [slug, page] of Object.entries(PAGES))
    for (const need of ((page as { requires?: string[] }).requires ?? [])) {
      const register = need.startsWith('register.') ? need.slice('register.'.length) : null;
      if (!register || !k.register(register)) missing.push(`${slug}: ${need}`);
    }
  assert.deepEqual(missing, []);
  sql.close();
});
