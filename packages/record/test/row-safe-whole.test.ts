/**
 * A block that adds up, read under a grant narrowed to some of a list's things (`wheres`), PGS-B05.
 *
 * A bar, a split or a heat answers `wholeRead`: its parts and its total over every row. A block over a list a grant
 * narrows is drawn again over her rows alone (`ownRows`), so that whole read is her rows added up and she is handed it.
 * Before `ROW_SAFE` listed `wholeRead`, a reader held to part of a list was held from every block that adds up, the
 * ones whose sum was hers alone among them.
 *
 * Two things read past her rows and stay held: a heat's `of:`, which is each day's whole list, and `inherit: true`,
 * which adds the rows that apply everywhere. The first is measured here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/* A WEDNESDAY, so every row dated in the last ten days falls inside the twelve weeks a heat draws. */
const NOW = Date.UTC(2026, 8, 9, 12);
const day = (back: number) => new Date(NOW - back * 86_400_000).toISOString().slice(0, 10);

const JOBS = {
  id: 'register.jobs',
  kind: 'register' as const,
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['court', 'paper'] },
      { id: 'stage', type: 'text' },
      { id: 'on', type: 'day', index: true },
      { id: 'cost', type: 'money' },
      { id: 'done', type: 'bool' },
    ],
  } as never,
};

/** Three court jobs and two paper ones. The paper jobs cost GBP 7.00 between them, and all five GBP 607.00. */
const ROWS = [
  { what: 'File at court', kind: 'court', stage: 'Filing', on: day(1), cost: { amount: 10000, currency: 'GBP' }, done: true },
  { what: 'Draft the petition', kind: 'paper', stage: 'Drafting', on: day(2), cost: { amount: 500, currency: 'GBP' }, done: true },
  { what: 'Attend the hearing', kind: 'court', stage: 'Hearing', on: day(2), cost: { amount: 20000, currency: 'GBP' }, done: false },
  { what: 'Buy stamps', kind: 'paper', stage: 'Posting', on: day(3), cost: { amount: 200, currency: 'GBP' }, done: false },
  { what: 'Serve the papers', kind: 'court', stage: 'Serving', on: day(3), cost: { amount: 30000, currency: 'GBP' }, done: true },
];
const HERS = 700;
const EVERY = 60700;

const BAR = { kind: 'bar', key: 'cost', heading: 'What it cost', source: 'register.jobs', columns: [{ field: 'stage' }, { field: 'cost' }] };
const SPLIT = { ...BAR, kind: 'split', key: 'share' };
const HEAT = { kind: 'heat', key: 'days', heading: 'Jobs on the day', source: 'register.jobs', columns: [{ field: 'on' }] };
const HEAT_OF = { ...HEAT, key: 'done', heading: 'Done on the day', where: 'done is true', of: 'on is not empty' };

const PAGE = { page: 'jobs', title: 'Jobs', requires: ['register.jobs'], blocks: [BAR, SPLIT, HEAT, HEAT_OF] };

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

/** A reader at `read` on the whole record, held to the paper jobs. */
const narrowed: CallContext = {
  principal: { kind: 'token', id: 't_narrow', scope: 'read', person: 'p_1', level: 'owner' },
  wheres: { jobs: { field: 'kind', is: 'paper' } } as never,
  credentialed: true,
};

type Part = { currency: string; amount: number };
type Whole = { rows: { label: unknown; rows: number; value: number | null; of?: number | null }[]; total: number | null; unit?: string | null; parts?: Part[]; of?: number | null };
type Block = { key?: string; rows: { fields: Record<string, unknown> }[]; matched: number; wholeRead?: Whole; refusals?: { code: string; fix: string; at?: string }[] };
type Page = { blocks: Block[] };

const value = <T>(r: unknown): T => {
  assert.ok((r as { ok?: unknown }).ok, JSON.stringify(r));
  return (r as { value: T }).value;
};
/** What a whole read adds up to in minor units, whether it says one figure or the amount first in `parts`. */
const sum = (w: Whole | undefined): number | null | undefined => (w === undefined ? undefined : (w.total ?? w.parts?.[0]?.amount ?? null));
const counted = (w: Whole | undefined): number => (w?.rows ?? []).reduce((n, r) => n + r.rows, 0);
const HIDDEN = /File at court|Attend the hearing|Serve the papers|Filing|Hearing|Serving|court/u;

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  value(await api.kernel.install([JOBS]));
  for (const fields of ROWS) value(await api.create({ register: 'jobs', fields } as never, owner));
  value(await api.setDeclaration({ body: PAGE }, owner));
  return api;
}

test('A READER HELD TO PART OF A LIST IS DRAWN A BLOCK THAT ADDS UP, over her rows and no others', async () => {
  const api = await record();
  const page = value<Page>(await api.page({ slug: 'jobs' }, narrowed));
  const [bar, split, heat] = page.blocks as [Block, Block, Block, Block];

  for (const b of [bar, split]) {
    assert.equal(b.refusals?.length ?? 0, 0, `${b.key} was held: ${JSON.stringify(b.refusals)}`);
    assert.equal(b.matched, 2);
    assert.ok(b.wholeRead, `${b.key} answered no whole read`);
    /* HER TWO PAPER JOBS ADDED UP, GBP 7.00, and not the GBP 607.00 of all five. */
    assert.equal(sum(b.wholeRead), HERS);
    assert.deepEqual(b.wholeRead.rows.map((r) => r.label).sort(), ['Drafting', 'Posting']);
  }

  /* A HEAT WITH NO `of:` COUNTS HER ROWS BY THE DAY. */
  assert.equal(heat.refusals?.length ?? 0, 0, JSON.stringify(heat.refusals));
  assert.ok(heat.wholeRead, 'the heat answered no whole read');
  assert.equal(counted(heat.wholeRead), 2);
});

test('A HEAT WITH of: READS EACH DAY WHOLE, so she is held from it and told why in plain words', async () => {
  const api = await record();
  const page = value<Page>(await api.page({ slug: 'jobs' }, narrowed));
  const share = page.blocks[3]!;

  assert.equal(share.wholeRead, undefined, 'a share of days she is not shown was handed to her');
  assert.equal(share.refusals?.[0]?.code, 'FORBIDDEN');
  assert.match(share.refusals?.[0]?.fix ?? '', /whole list/u, 'held for some other reason than the whole read');
  assert.doesNotMatch(share.refusals?.[0]?.fix ?? '', /jobs|court|#\d|—/u);

  /* AND NOTHING ON THE PAGE NAMES A JOB SHE IS NOT SHOWN, or a sum they are part of. */
  const said = JSON.stringify(page);
  assert.doesNotMatch(said, HIDDEN);
  assert.doesNotMatch(said, new RegExp(String(EVERY), 'u'));
});

test('THE OWNER IS DRAWN EVERY BLOCK OVER EVERY ROW, as before', async () => {
  const api = await record();
  const page = value<Page>(await api.page({ slug: 'jobs' }, owner));
  const [bar, split, heat, share] = page.blocks as [Block, Block, Block, Block];

  for (const b of page.blocks) assert.equal(b.refusals?.length ?? 0, 0, `${b.key}: ${JSON.stringify(b.refusals)}`);
  assert.equal(sum(bar.wholeRead), EVERY);
  assert.equal(sum(split.wholeRead), EVERY);
  assert.equal(bar.wholeRead?.rows.length, 5);
  assert.equal(counted(heat.wholeRead), 5);
  /* THREE DONE OF THE FIVE THAT HOLD A DAY. */
  assert.equal(counted(share.wholeRead), 3);
  assert.equal(share.wholeRead?.of, 5);
});
