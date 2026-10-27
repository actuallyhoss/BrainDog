/**
 * A page read under a grant narrowed to some of a list's things (`wheres`).
 *
 * `list` hands the grant's `where` to the kernel, and a page's blocks were held by list alone: a reader held to one
 * client's jobs opened the Jobs page and was drawn every job, a count of all of them, and a filter naming every client.
 * A block over the narrowed list is now drawn from the rows the `where` admits and no others, so its order, its cut and
 * its count are hers, and a figure the kernel still makes over the whole list is held, since a sum over rows she is not
 * shown is those rows in other words. Nothing she is answered moves when a row she is not shown does, which is what
 * the last test here holds a preview to: a preview is open at `read` and takes any `where` she cares to write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const CLIENTS = {
  id: 'register.clients',
  kind: 'register' as const,
  body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const JOBS = {
  id: 'register.jobs',
  kind: 'register' as const,
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'client', type: 'ref', to: 'clients' },
      { id: 'kind', type: 'enum', values: ['court', 'paper'] },
    ],
  } as never,
};

const COUNT = {
  id: 'metric.jobs-count',
  kind: 'metric' as const,
  body: { metric: 'jobs-count', name: 'Jobs', source: 'register.jobs', value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' } as never,
};

const PAGE = {
  page: 'jobs',
  title: 'Jobs',
  requires: ['register.jobs', 'register.clients'],
  filters: [{ field: 'kind', control: 'segmented' }],
  blocks: [
    { kind: 'table', key: 'all', heading: 'Jobs', source: 'register.jobs', columns: [{ field: 'what' }] },
    { kind: 'table', key: 'first', heading: 'First', source: 'register.jobs', limit: 1, columns: [{ field: 'what' }] },
    { kind: 'stat', key: 'count', cells: [{ metric: 'jobs-count' }] },
    { kind: 'table', key: 'clients', heading: 'Clients', source: 'register.clients', columns: [{ field: 'name' }] },
  ],
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

/** A token of the owner's at `read` on the whole record, held to the paper jobs. */
const narrowed: CallContext = {
  principal: { kind: 'token', id: 't_narrow', scope: 'read', person: 'p_1', level: 'owner' },
  wheres: { jobs: { field: 'kind', is: 'paper' } } as never,
  credentialed: true,
};

type Block = {
  key?: string;
  source?: string;
  rows: { fields: Record<string, unknown> }[];
  matched: number;
  readings?: unknown[];
  refusals?: { code: string; fix: string }[];
};
type Page = { filters?: { field: string; values: unknown[]; reads: string[] }[]; blocks: Block[] };

const value = <T>(r: unknown): T => {
  assert.ok((r as { ok?: unknown }).ok, JSON.stringify(r));
  return (r as { value: T }).value;
};
const titles = (b: Block): string[] => b.rows.map((r) => String(r.fields.what ?? r.fields.name)).sort();

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 9, 7, 12)) });
  value(await api.kernel.install([CLIENTS, JOBS, COUNT]));
  value(await api.create({ register: 'clients', fields: { name: 'Harrow' } } as never, owner));
  for (const [what, kind] of [
    ['File at court', 'court'],
    ['Draft the petition', 'paper'],
    ['Attend the hearing', 'court'],
    ['Buy stamps', 'paper'],
    ['Serve the papers', 'court'],
  ] as const)
    value(await api.create({ register: 'jobs', fields: { what, kind } } as never, owner));
  value(await api.setDeclaration({ body: PAGE }, owner));
  return api;
}

test('A PAGE BLOCK OVER A LIST A GRANT NARROWS DRAWS THE ROWS ITS where ADMITS, and no others', async () => {
  const api = await record();

  /* WHAT `list` ANSWERS HER IS THE MEASURE: the two paper jobs. */
  const listed = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'jobs' } as never, narrowed));
  assert.deepEqual(listed.rows.map((r) => r.fields.what).sort(), ['Buy stamps', 'Draft the petition']);

  /* THE OWNER READS EVERY JOB, the count and the filter. */
  const whole = value<Page>(await api.page({ slug: 'jobs' }, owner));
  assert.equal(whole.blocks[0]!.rows.length, 5);
  assert.equal(whole.blocks[0]!.matched, 5);
  assert.deepEqual(titles(whole.blocks[1]!), ['Serve the papers']);
  assert.equal(whole.blocks[2]!.readings?.length, 1);

  const page = value<Page>(await api.page({ slug: 'jobs' }, narrowed));
  const [all, first, count, clients] = page.blocks as [Block, Block, Block, Block];

  /* THE TABLE IS HER ROWS, counted as her rows. */
  assert.deepEqual(titles(all), ['Buy stamps', 'Draft the petition']);
  assert.equal(all.matched, 2);
  assert.equal(all.refusals?.length ?? 0, 0);

  /* A TABLE CUT TO ONE ROW DRAWS THE NEWEST OF HERS, not nothing because a court job is newer, and counts hers. */
  assert.deepEqual(titles(first), ['Buy stamps']);
  assert.equal(first.matched, 2);

  /* A FIGURE OVER THE WHOLE LIST IS HELD, since five is a fact about the three she is not shown. */
  assert.deepEqual(count.readings, []);
  assert.equal(count.refusals?.[0]?.code, 'FORBIDDEN');
  assert.doesNotMatch(count.refusals?.[0]?.fix ?? '', /jobs|court|#\d/u);

  /* A LIST HER GRANT DOES NOT NARROW IS DRAWN WHOLE. */
  assert.deepEqual(titles(clients), ['Harrow']);

  /* AND NOTHING ON THE PAGE NAMES A JOB SHE IS NOT SHOWN, the filter's values among it. */
  assert.doesNotMatch(JSON.stringify(page), /File at court|Attend the hearing|Serve the papers|court/u);
  assert.deepEqual(page.filters?.find((f) => f.field === 'kind')?.values, []);
});

test('A BLOCK NOBODY HAS INSTALLED IS NARROWED THE SAME WAY IN A PREVIEW', async () => {
  const api = await record();
  const seen = value<Page>(
    await api.previewPage({ body: { page: 'draft', title: 'Draft', blocks: [PAGE.blocks[0], PAGE.blocks[2]] } } as never, { ...narrowed, principal: { ...narrowed.principal, scope: 'write' } } as never),
  );
  assert.deepEqual(titles(seen.blocks[0]!), ['Buy stamps', 'Draft the petition']);
  assert.doesNotMatch(JSON.stringify(seen), /File at court|Attend the hearing|Serve the papers/u);
});

test('WHAT HAPPENED ACROSS THE RECORD NAMES NO ROW THE where DOES NOT ADMIT, on a feed block or in whatsNew', async () => {
  const api = await record();
  const feed = { kind: 'feed', source: 'activity' };
  const whole = value<Page>(await api.previewPage({ body: { page: 'draft', title: 'Draft', blocks: [feed] } } as never, owner));
  assert.match(JSON.stringify(whole), /File at court/u);

  /* THE FEED IS FOR WHOEVER READS ALL OF THE RECORD, and a grant held to some rows does not. */
  const held = value<Page>(await api.previewPage({ body: { page: 'draft', title: 'Draft', blocks: [feed] } } as never, narrowed));
  assert.equal(held.blocks[0]!.refusals?.[0]?.code, 'FORBIDDEN');
  assert.doesNotMatch(JSON.stringify(held), /File at court|Buy stamps/u);

  /* AND THE LOG ANSWERS HER THE LINES ABOUT HER ROWS. */
  const news = value<{ events: { title: string | null }[] }>(await api.whatsNew(undefined, narrowed));
  const said = news.events.map((e) => e.title).filter((t) => t !== null);
  assert.ok(said.includes('Buy stamps') && said.includes('Draft the petition'), JSON.stringify(said));
  assert.doesNotMatch(JSON.stringify(news), /File at court|Attend the hearing|Serve the papers/u);
  const log = value<{ events: unknown[] }>(await api.recentHistory(undefined, narrowed));
  assert.doesNotMatch(JSON.stringify(log), /File at court|Attend the hearing|Serve the papers/u);
});

test('NOTHING A NARROWED READER IS ANSWERED MOVES WITH A ROW SHE IS NOT SHOWN, whatever where, order or cut she writes', async () => {
  const api = await record();
  const draw = async (block: Record<string, unknown>, ctx: CallContext): Promise<Block> =>
    value<Page>(await api.previewPage({ body: { page: 'draft', title: 'Draft', blocks: [{ source: 'register.jobs', ...block }] } } as never, ctx)).blocks[0]!;
  /* What she is answered, less the `where` she wrote herself. */
  const said = (b: Block): string => JSON.stringify({ ...b, where: undefined });

  /* A SECTION COUNTS HER JOBS. It draws no row, so cut down after the drawing it could only be held or handed whole. */
  const counted = await draw({ kind: 'section', heading: 'Jobs' }, narrowed);
  assert.equal(counted.matched, 2);
  assert.equal(counted.refusals?.length ?? 0, 0);
  assert.equal((await draw({ kind: 'section', heading: 'Jobs' }, owner)).matched, 5);

  /* A where ONLY A COURT JOB MEETS ANSWERS AS ONE NO JOB MEETS: read a letter at a time, this was a hidden title. */
  for (const kind of ['section', 'table']) {
    const shape = kind === 'table' ? { kind, columns: [{ field: 'what' }] } : { kind, heading: 'Jobs' };
    const hidden = await draw({ ...shape, where: { field: 'what', contains: 'File at' } }, narrowed);
    const nobody = await draw({ ...shape, where: { field: 'what', contains: 'Zebra' } }, narrowed);
    assert.equal(said(hidden), said(nobody), kind);
    assert.equal(hidden.matched, 0);
    assert.equal(hidden.refusals?.length ?? 0, 0);
  }

  /* A CUT TO THE FIRST ROW IS HER FIRST, wherever the court jobs sort: `kind` puts every one of them ahead of hers. */
  const top = await draw({ kind: 'table', limit: 1, order: [{ field: 'kind', dir: 'asc' }], columns: [{ field: 'what' }] }, narrowed);
  assert.equal(top.rows.length, 1);
  assert.ok(['Buy stamps', 'Draft the petition'].includes(titles(top)[0]!), titles(top)[0]);
  assert.equal(top.matched, 2);
  assert.equal(titles(await draw({ kind: 'table', limit: 1, order: [{ field: 'kind', dir: 'asc' }], columns: [{ field: 'what' }] }, owner))[0], 'Serve the papers');

  /* AND THE where SHE WROTE COMES BACK AS SHE WROTE IT, not as the rows it was drawn from. */
  const own = await draw({ kind: 'table', where: 'what contains stamps', columns: [{ field: 'what' }] }, narrowed);
  assert.deepEqual(titles(own), ['Buy stamps']);
  assert.equal((own as { where?: unknown }).where, 'what contains stamps');

  /* THE SAME ON AN INSTALLED PAGE, when a court job is written after she first read it: nothing of hers changes. */
  const before = JSON.stringify(value<Page>(await api.page({ slug: 'jobs' }, narrowed)).blocks);
  value(await api.create({ register: 'jobs', fields: { what: 'Swear the affidavit', kind: 'court' } } as never, owner));
  assert.equal(JSON.stringify(value<Page>(await api.page({ slug: 'jobs' }, narrowed)).blocks), before);
});
