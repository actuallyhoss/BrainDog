/**
 * A `list<ref>` IS A REF, and `targetsOf` did not say so, which is where a list chip died on a live record.
 *
 * `leafOf` in `remote.ts` was once blamed for turning a `has` chip back into
 * `is`. That was true and is not any more: `leafOf` keeps both words, `whereOf` reads them back and
 * `registerHref` mints them. The chip still answered nothing on a record, and the cause is one line
 * further back.
 *
 * MEASURED ON A SELF-HOST ON 127.0.0.1:5996, seeded, with the register screen's own refs:
 *
 *     /r/skills?f=because:has:4    asked the record {"field":"because","has":"4"}    ->  0 rows, where the sample answers 2
 *
 * THAT IS THE ONLY ADDRESS WORTH QUOTING: `/r/people?f=projects:has:1` answers 0 rows whether the walk
 * is right or wrong, because every seeded person holds `projects: null`. `elementsOn` below reads the
 * elements off the record for the same reason, and skips a field that has none.
 *
 * `valueOf` resolves a ref element to the target row's ULID out of the `RefMap` for the target
 * register, and it had none to read: every live screen builds its maps from `targetsOf`, which walked
 * the fields looking for `type === 'ref'` and a `list<ref>` declares `type: 'list', of: 'ref'`. So the
 * one register a `list<ref>` points at was the one register never loaded, the element went to the
 * record as the characters somebody typed, and `json_each.value = '4'` matched no row. A filter that
 * answers nothing is the answer a filter gives when it is working, which is why this outlived three
 * commits that each fixed a real half of the same feature.
 *
 * BOTH OF THE SEED'S TWO `list<ref>` FIELDS WERE BROKEN AND NEITHER WAS ASKED ABOUT. `remote.test.ts`
 * drives `because:has:4` against a real kernel and passes, because it puts `learnings` into its map by
 * hand (`remote.test.ts:175`) on top of the registers on `ORDER`, which names neither `learnings` nor
 * `skills`: it loaded the one register the screen never asked for. Its sweep over every element of
 * every list walks `ORDER` alone, so it never reached `skills`, and `people.projects` is the only
 * `list<ref>` on `ORDER` and holds no elements in the seed, so that sweep asked about no list of refs
 * at all. Every assertion here goes through `targetsOf`, which is what a screen actually calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { chipsOf, REGISTERS } from './api.ts';
import { list } from './fixtures/readers.ts';
import { entryOf, refMapOf, targetsOf, treeOf, type RecordRow, type Refs } from './remote.ts';
import { registerHref } from './where.ts';

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
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
  return sql as unknown as Parameters<typeof openRecord>[0];
}

const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

function rowsOf(k: Kernel, register: string): RecordRow[] {
  const out = k.list({ register, limit: 500 });
  assert.ok(out.ok, `${register}: ${JSON.stringify(out)}`);
  return out.value.rows as unknown as RecordRow[];
}

/**
 * The refs the register screen builds, and it is `targetsOf` and nothing else.
 *
 * COPIED FROM `apps/web/src/lib/data/record.ts` `refsFor` DELIBERATELY. A test that builds a wider
 * map than the screen does is a test that cannot see this defect, which is exactly what happened.
 */
function screenRefs(k: Kernel, register: string): Refs {
  const refs = new Map<string, ReturnType<typeof refMapOf>>();
  for (const target of targetsOf(register)) refs.set(target, refMapOf(target, rowsOf(k, target)));
  return refs;
}

const bySeq = (a: number, b: number) => a - b;

/**
 * Every row number a register holds, in order.
 *
 * `RecordRow.seq` IS `number | null` AND THE NULL IS ASSERTED AWAY RATHER THAN COERCED, because a row
 * with no number cannot be held against a filter's answer at all: a `?? 0` would compare it against
 * nothing and pass. Every seeded row has one.
 */
function everySeq(k: Kernel, register: string): number[] {
  const rows = rowsOf(k, register);
  const seqs = rows.map((r) => r.seq).filter((n): n is number => n !== null);
  assert.equal(seqs.length, rows.length, `${register}: a row came back with no number, so it cannot be compared`);
  return seqs.sort(bySeq);
}

/** The rows a chip address admits on the record, through the whole path a click takes. */
function fromRecord(k: Kernel, register: string, chip: string): number[] {
  const refs = screenRefs(k, register);
  const filters = chipsOf(new URLSearchParams([['f', chip]]));
  const where = treeOf(register, filters, '', refs);
  const out = k.list({ register, ...(where === undefined ? {} : { where: where as never }), limit: 500 });
  assert.ok(out.ok, `/r/${register}?f=${chip}: the record refused ${JSON.stringify(out)}`);
  return (out.value.rows as unknown as RecordRow[]).map((r) => entryOf(register, r, refs).seq).sort(bySeq);
}

/** The same address, answered by the in-browser sample. */
const fromSample = (register: string, chip: string): number[] =>
  list(register, { filters: chipsOf(new URLSearchParams([['f', chip]])) }).entries.map((e) => e.seq).sort(bySeq);

/** Every `list<ref>` field the built-in declarations carry, with the register it points at. */
const LIST_REFS = Object.entries(REGISTERS).flatMap(([register, decl]) =>
  (decl?.fields ?? []).filter((f) => f.type === 'list' && f.of === 'ref' && f.to).map((f) => ({ register, field: f.id, to: f.to as string })),
);

/**
 * The row numbers the record's own rows hold in one `list<ref>` field, each once.
 *
 * READ OFF THE RECORD RATHER THAN TYPED, so a register a pack adds is asked about here the day its
 * rows arrive. `people.projects` comes back empty, because no seeded person is on a project yet, and a
 * field with no elements is skipped rather than asserted about: there is nothing to hold and nothing to
 * lack, so both answers would be the whole register and the walk would prove neither operator. The
 * count across every field is asserted once instead, which is what would go red if the seed lost the
 * one field that does hold some.
 */
function elementsOn(k: Kernel, register: string, field: string, to: string): number[] {
  const map = refMapOf(to, rowsOf(k, to));
  const held = rowsOf(k, register)
    .flatMap((row) => (Array.isArray(row.fields[field]) ? (row.fields[field] as unknown[]) : []))
    .map((v) => map.seqOf.get(String(v)))
    .filter((n): n is number => n !== undefined);
  return [...new Set(held)];
}

test('A `list<ref>` NAMES A TARGET REGISTER, so the screen loads the map its elements resolve through', () => {
  assert.ok(LIST_REFS.length > 1, `only ${LIST_REFS.length} list<ref> fields declared, so this walks nothing`);
  for (const { register, field, to } of LIST_REFS)
    assert.ok(
      targetsOf(register).includes(to),
      `${register}.${field} points at ${to} and targetsOf('${register}') is ${JSON.stringify(targetsOf(register))}, so every element of it goes to the record as the characters somebody typed`,
    );
});

test('A `has` CHIP ON A `list<ref>` ADMITS THE SAME ROWS FROM THE RECORD AS FROM THE SAMPLE, and a `lacks` chip the rest', async () => {
  const k = await record;
  let asked = 0;
  for (const { register, field, to } of LIST_REFS)
    for (const seq of elementsOn(k, register, field, to)) {
      asked++;
      const has = fromRecord(k, register, `${field}:has:${seq}`);
      assert.deepEqual(has, fromSample(register, `${field}:has:${seq}`), `/r/${register}?f=${field}:has:${seq}`);
      assert.ok(has.length > 0, `/r/${register}?f=${field}:has:${seq} answered no rows, and ${to}#${seq} is an element some row holds`);
      const lacks = fromRecord(k, register, `${field}:lacks:${seq}`);
      assert.deepEqual(lacks, fromSample(register, `${field}:lacks:${seq}`), `/r/${register}?f=${field}:lacks:${seq}`);
      assert.deepEqual([...has, ...lacks].sort(bySeq), everySeq(k, register), `${register}: held and lacked do not make up the register`);
    }
  assert.ok(asked > 2, `only ${asked} list<ref> elements exist on the seeded record, so this walk proves nothing`);
});

/**
 * AND THE ADDRESS A BLOCK MINTS OPENS THOSE ROWS, which is the other half of one loop.
 *
 * `registerHref` mints a `list<ref>` element as the target row's title where the value slot of a chip
 * can carry one, and as its number where it cannot. Both spellings have to come back through
 * `chipsOf` and `treeOf` as the same ULID, or a block draws three rows and links to none.
 */
test('AND THE ADDRESS A PREDICATE MINTS OPENS THE ROWS THE PREDICATE ADMITTED, on the record', async () => {
  const k = await record;
  let minted = 0;
  for (const { register, field, to } of LIST_REFS)
    for (const seq of elementsOn(k, register, field, to))
      for (const op of ['has', 'lacks'] as const) {
        minted++;
        const href = registerHref(register, `${field} ${op} ${seq}`);
        assert.notEqual(href, `/r/${register}`, `"${field} ${op} ${seq}" on ${register} minted the whole register`);
        const chip = new URL(href, 'http://x').searchParams.getAll('f')[0] ?? '';
        assert.deepEqual(fromRecord(k, register, chip), fromSample(register, chip), href);
      }
  assert.ok(minted > 4, `only ${minted} addresses minted, so this walk proves nothing`);
});

/**
 * A LIVE `list<ref>` CELL DRAWS THE NUMBERS A PERSON SAYS, rather than the ULIDs the column holds.
 *
 * `entryOf`'s own header says a ref becomes the number a person says "because every helper that draws
 * one looks its target up by sequence", and it read `f.type === 'ref'` alone, so the half of that rule
 * about a list was never applied: `display` sends an array straight to `listLine`, which joined the
 * raw ULIDs with commas. Four skills on the seeded record drew a cell of 26-character identifiers.
 * The chip the filter bar mints out of a cell's element is the same string, so this and the filter are
 * one defect looked at from two screens.
 */
test('A LIVE `list<ref>` ROW HOLDS THE NUMBERS A PERSON SAYS, as the sample’s row does', async () => {
  const k = await record;
  let drawn = 0;
  for (const { register, field } of LIST_REFS) {
    const refs = screenRefs(k, register);
    for (const v of rowsOf(k, register)
      .map((row) => entryOf(register, row, refs))
      .flatMap((e) => (Array.isArray(e.fields[field]) ? (e.fields[field] as unknown[]) : []))) {
      drawn++;
      assert.equal(typeof v, 'number', `${register}.${field} drew ${JSON.stringify(v)}, so the cell reads as identifiers rather than as rows`);
    }
  }
  assert.ok(drawn > 2, `only ${drawn} list<ref> elements on the seeded record, so no cell was measured`);
});
