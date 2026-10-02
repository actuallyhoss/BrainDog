/**
 * A page's reader filters, through the record: the choice reaches the kernel, and a filter counted from a list the
 * reader may not read is held back.
 *
 * The kernel counts every list a page's blocks read and names each link by its row's title, and it cannot know who is
 * asking. So a member invited to Jobs alone would have been handed the titles of Clients she may not read, and how many
 * jobs each holds. `page` answers her that filter with no values and nothing chosen, and her choice on it narrows nothing.
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

const PAGE = {
  page: 'jobs',
  title: 'Jobs',
  requires: ['register.jobs'],
  filters: [
    { field: 'client', control: 'chips' },
    { field: 'kind', control: 'segmented' },
  ],
  blocks: [{ kind: 'table', heading: 'Jobs', source: 'register.jobs', columns: [{ field: 'what' }] }],
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Filter = { field: string; chosen: string | null; values: { value: string; label: string; count: number }[]; reads: string[] };
type Page = { filters?: Filter[]; blocks: { rows: { fields?: Record<string, unknown>; cells?: unknown[] }[] }[] };

const value = (r: unknown): Page => {
  assert.ok((r as { ok?: unknown }).ok, JSON.stringify(r));
  return (r as { value: Page }).value;
};
const filterOn = (p: Page, field: string): Filter => p.filters!.find((f) => f.field === field)!;
const drawn = (p: Page): number => p.blocks[0]!.rows.length;

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 9, 2, 12)) });
  assert.ok((await api.kernel.install([CLIENTS, JOBS])).ok);
  const harrow = (await api.create({ register: 'clients', fields: { name: 'Harrow Divorce Case' } } as never, owner)) as { ok: boolean; value: { id: string } };
  assert.ok(harrow.ok);
  for (const [what, kind] of [
    ['Draft the petition', 'paper'],
    ['File at court', 'court'],
  ] as const)
    assert.ok((await api.create({ register: 'jobs', fields: { what, kind, client: harrow.value.id } } as never, owner)).ok);
  assert.ok((await api.create({ register: 'jobs', fields: { what: 'Buy stamps', kind: 'paper' } } as never, owner)).ok);
  const set = await api.setDeclaration({ body: PAGE }, owner);
  assert.ok(set.ok, JSON.stringify(set));
  return api;
}

test("THE READER'S CHOICE REACHES THE KERNEL, and the page is narrowed to it", async () => {
  const api = await record();
  const all = value(await api.page({ slug: 'jobs' }, owner));
  assert.equal(drawn(all), 3);
  assert.deepEqual(filterOn(all, 'client').reads.sort(), ['clients', 'jobs']);
  assert.ok(filterOn(all, 'client').values.some((v) => v.label === 'Harrow Divorce Case'));

  const paper = value(await api.page({ slug: 'jobs', filter: { kind: 'paper' } }, owner));
  assert.equal(drawn(paper), 2);
  assert.equal(filterOn(paper, 'kind').chosen, 'paper');

  /* AND AS JSON TEXT, the way a query string carries it. */
  const court = value(await api.page({ slug: 'jobs', filter: '{"kind":"court"}' }, owner));
  assert.equal(drawn(court), 1);
});

test('A FILTER THAT IS NOT A VALUE BY FIELD IS REFUSED, and names the key', async () => {
  const api = await record();
  for (const filter of [['kind'], { kind: 3 }, 'not json', 7]) {
    const out = (await api.page({ slug: 'jobs', filter }, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.ok, false, JSON.stringify(filter));
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.refusal?.at, 'filter');
  }
});

test('A FILTER COUNTED FROM A LIST SHE CANNOT READ IS HELD BACK, and her choice on it narrows nothing', async () => {
  const api = await record();
  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { jobs: 'read' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  const seen = value(await api.page({ slug: 'jobs' }, wren));
  const client = filterOn(seen, 'client');
  assert.deepEqual([client.chosen, client.values, client.reads], [null, [], []]);
  assert.ok(!JSON.stringify(seen.filters).includes('Harrow'), 'the filter named a client she may not read');
  /* THE ONE SHE CAN READ IS HERS AS IT IS THE OWNER'S. */
  assert.ok(filterOn(seen, 'kind').values.length > 0);

  const owners = value(await api.page({ slug: 'jobs', filter: { client: '1' } }, owner));
  assert.equal(drawn(owners), 2, "the owner's choice narrows the page");
  const hers = value(await api.page({ slug: 'jobs', filter: { client: '1', kind: 'paper' } }, wren));
  assert.equal(filterOn(hers, 'client').chosen, null);
  assert.equal(filterOn(hers, 'kind').chosen, 'paper');
  assert.equal(drawn(hers), 2, 'a client she was never offered narrowed her page');
});
