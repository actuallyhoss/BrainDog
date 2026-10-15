/**
 * The sources the record hands the page reader (PGS-A11 job 3): a name no registered source answers is asked of
 * `PageDeps.hostSources`, and its rows come back on the one rows path, `columns`, `where` and `order` read against its
 * fields and `limit` passed through. A field it does not hold is refused at read; a registered name and a list are never
 * shadowed by one; a source that reads across the record is named `*`. Invented source and rows throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import { evaluate, type Predicate, type Schema } from '@braindog/where';

import { readPage, registersOf, type HostSource, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { Entry } from '../src/index.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.parse('2026-10-15T12:00:00.000Z');

const SHELVES: Schema = { register: 'shelves', fields: { shelf: { type: 'text' }, name: { type: 'text' }, count: { type: 'int' } } };

const row = (shelf: string, name: string, count: number): Entry => ({
  id: shelf,
  register: 'shelves',
  seq: null,
  fields: { shelf, name, count },
  state: null,
  version: 1,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  deleted_at: null,
});

const ROWS: Entry[] = PROJECTS.map((name, i) => row(`s${i + 1}`, name, (i + 1) * 10));

/** What the stub source was asked, so a test can say what was passed through. */
const asked: { where?: Predicate | undefined; order?: unknown; limit?: number }[] = [];

const SHELVES_SOURCE: HostSource = {
  says: 'Every shelf with how much it holds.',
  schema: SHELVES,
  rows: (q) => {
    asked.push(q);
    let rows = ROWS.filter((r) => q.where === undefined || evaluate(q.where, r.fields, SHELVES));
    for (const o of [...(q.order ?? [])].reverse()) {
      const sign = o.dir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => sign * (Number(a.fields[o.field]) - Number(b.fields[o.field])));
    }
    const matched = rows.length;
    return ok({ rows: rows.slice(0, q.limit ?? 50), matched, next: (q.limit ?? 50) < matched ? 'after' : null });
  },
};

const CENSUS: HostSource = { whole: true, schema: { register: 'census', fields: { slug: { type: 'text' } } }, rows: () => ok({ rows: [] }) };

const named: string[] = [];
const hostSources = (name: string): HostSource | undefined => {
  named.push(name);
  return name === 'shelves' ? SHELVES_SOURCE : name === 'census' ? CENSUS : name === 'activity' ? SHELVES_SOURCE : undefined;
};

function deps(blocks: PageBlock[]): PageDeps {
  return {
    pages: () => [{ page: 'store', title: 'Store', blocks }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    activity: () => ({ events: [], seen: null }),
    hostSources,
  };
}

type Read = { blocks: { rows: Entry[]; matched: number; cursor?: string; refusals: { code: string; at?: string; allowed?: string[] }[]; feed?: unknown }[] };
const read = (blocks: PageBlock[]): Read => {
  const got = readPage(deps(blocks), 'store');
  assert.ok(got.ok, JSON.stringify(got));
  return got.value as unknown as Read;
};

test('A TABLE OVER A HOST SOURCE READS ITS ROWS, with columns, where, order and limit passed through', () => {
  asked.length = 0;
  const r = read([{ kind: 'table', source: 'shelves', columns: [{ field: 'name' }, { field: 'count' }], where: 'name contains e', order: [{ field: 'count', dir: 'desc' }], limit: 2 }]);
  const b = r.blocks[0]!;
  assert.deepEqual(b.refusals, []);
  assert.deepEqual(
    b.rows.map((x) => x.fields.name),
    [PROJECTS[3], PROJECTS[2]],
  );
  assert.equal(b.matched, 4);
  assert.equal(b.cursor, 'after');
  assert.equal(asked[0]!.limit, 2);
  assert.deepEqual(asked[0]!.order, [{ field: 'count', dir: 'desc' }]);
});

test('A COLUMN OR AN ORDER THE SOURCE DOES NOT HOLD IS REFUSED AT READ, with the fields it does', () => {
  const r = read([
    { kind: 'table', source: 'shelves', columns: [{ field: 'name' }, { field: 'weight' }] },
    { kind: 'table', source: 'shelves', order: [{ field: 'weight' }] },
    { kind: 'table', source: 'shelves', where: 'weight > 3' },
  ]);
  const [cols, order, where] = r.blocks;
  assert.equal(cols!.refusals[0]!.code, 'FIELD_UNKNOWN');
  assert.equal(cols!.refusals[0]!.at, 'columns');
  assert.deepEqual(cols!.refusals[0]!.allowed, ['shelf', 'name', 'count']);
  assert.equal(order!.refusals[0]!.at, 'order');
  assert.ok(where!.refusals.length > 0, 'a where over a field the source lacks read');
  assert.deepEqual(cols!.rows, []);
});

test('A HOST SOURCE IS DRAWN AS ROWS, and a kind that draws none is told so', () => {
  const r = read([{ kind: 'timeline', source: 'shelves' }]);
  assert.ok(r.blocks[0]!.refusals.length > 0);
});

test('A REGISTERED NAME AND A LIST ARE NEVER SHADOWED, and a name nobody holds is still unknown', () => {
  named.length = 0;
  const r = read([{ kind: 'feed', source: 'activity' }, { kind: 'table', source: 'register.shelves' }, { kind: 'table', source: 'nowhere' }]);
  /* The log's own feed answered, not the shelves the host would hand under that name. */
  assert.ok(Array.isArray(r.blocks[0]!.feed));
  assert.deepEqual(r.blocks[0]!.rows, []);
  assert.ok(!named.includes('activity') && !named.some((n) => n.startsWith('register.')), `asked the host for ${named.join(', ')}`);
  assert.equal(r.blocks[2]!.refusals[0]!.code, 'SOURCE_UNKNOWN');
});

test('A HOST SOURCE THAT READS ACROSS THE RECORD IS NAMED `*`, and one that does not names nothing', () => {
  const page = (source: string) => ({ page: 'p', title: 'P', blocks: [{ kind: 'table', source }] });
  assert.deepEqual(registersOf(page('census'), undefined, { hostSources }), ['*']);
  assert.deepEqual(registersOf(page('shelves'), undefined, { hostSources }), []);
  assert.deepEqual(registersOf(page('census')), []);
});
