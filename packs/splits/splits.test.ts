/**
 * Splits: shared costs and settle-ups, where each person stands, square marked by itself, and a Ledger line marked
 * shared writing its own split. Every name and amount here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 26, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Body = Record<string, unknown>;
type Reading = { value: number | null; unit?: string | null; refusals: unknown[] };
type Block = { kind: string; heading?: string; refusals: unknown[]; rows?: { fields: Body }[] };

const FILE = new URL('./splits.pack.json', import.meta.url);
const shipped = (): Body & { declarations: Body[]; extends: Body } => JSON.parse(readFileSync(FILE, 'utf8')) as never;

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function fresh(withPack = true): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  if (withPack) await put(api, shipped());
  return { api, close: () => sql.close() };
}

async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('splits fetch nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 4; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'a run was refused or failed ' + JSON.stringify(ran));
  }
}

const make = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const fieldsOf = (api: Api, id: string): Body => api.kernel.get(id as never)!.fields as Body;
const rowsOf = (api: Api, register: string, where?: unknown): { id: string; fields: Body }[] =>
  said<{ rows: { id: string; fields: Body }[] }>(api.kernel.list({ register, ...(where ? { where } : {}) } as never)).rows;
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));

test('THE FILE: splits 1.0.0 on money-core, two lists, one script for two rules, two pages, two fields on the Ledger', () => {
  const doc = shipped();
  assert.deepEqual([doc.pack, doc.version, doc.license], ['splits', '1.3.1', 'Apache-2.0']);
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), ['splits', 'split_people']);
  assert.deepEqual(kinds('page'), ['splits', 'split-person']);
  assert.deepEqual(kinds('rule'), ['splits_from_line', 'splits_stand']);
  const script = doc.declarations.find((d) => d.script === 'splits')!;
  assert.equal(script.source, readFileSync(new URL('./splits.js', import.meta.url), 'utf8'), 'the pack file and splits.js disagree');
  const added = (doc.extends['register.transactions'] as { fields: Body[] }).fields;
  assert.deepEqual(added.map((f) => [f.id, f.index]), [['shared_with', undefined], ['split_share', undefined]]);
  /* WHO OWES WHOM IS SAID IN PLAIN WORDS SINCE 1.2.0 (f3806b918), where it said comes back and goes back. Held here so the
     words do not drift back to the stored ones. */
  const ways = (doc.declarations.find((d) => d.register === 'split_people')!.fields as Body[]).find((f) => f.id === 'way')!;
  assert.deepEqual(ways.labels, { to_me: 'Owes you', to_them: 'You owe them', square: 'Square' });
});

test('BEFORE THE PACK: there is no splits list', async () => {
  const { api, close } = await fresh(false);
  assert.equal(api.kernel.register('splits'), undefined);
  close();
});

test('TWO SHARED COSTS AND A SETTLE-UP: the parts, where the person stands, then square and settled', async () => {
  const { api, close } = await fresh();
  const dinner = make(api, 'splits', { what: 'Dinner', on: '2026-10-20', with: 'Sam', kind: 'cost', paid_by: 'me', amount: gbp(6_000), my_share: 50 });
  const shop = make(api, 'splits', { what: 'Groceries', on: '2026-10-22', with: 'sam ', kind: "cost", paid_by: "them", amount: gbp(4_000), my_share: 75 });
  await settle(api);
  assert.deepEqual([fieldsOf(api, dinner).part, fieldsOf(api, dinner).way], [gbp(3_000), 'to_me']);
  assert.deepEqual([fieldsOf(api, shop).part, fieldsOf(api, shop).way], [gbp(3_000), 'to_them']);
  let people = rowsOf(api, 'split_people');
  assert.equal(people.length, 1, 'one person, whatever the capitals');
  assert.equal(people[0]!.fields.way, 'square');

  const lunch = make(api, 'splits', { what: 'Lunch', on: '2026-10-24', with: 'Sam', kind: 'cost', paid_by: 'me', amount: gbp(2_000), my_share: 50 });
  await settle(api);
  people = rowsOf(api, 'split_people');
  assert.deepEqual([people[0]!.fields.stands, people[0]!.fields.way], [gbp(1_000), 'to_me']);
  assert.equal((await metric(api, 'splits-to-me')).value, 1_000);

  const back = make(api, 'splits', { what: 'Sam settles up', on: '2026-10-25', with: 'Sam', kind: 'settle', paid_by: 'them', amount: gbp(1_000) });
  await settle(api);
  people = rowsOf(api, 'split_people');
  assert.equal(people[0]!.fields.way, 'square');
  for (const id of [lunch, back]) assert.equal(fieldsOf(api, id).state, 'settled');
  assert.equal((await metric(api, 'splits-open')).value, 0);
  close();
});

test('A LEDGER LINE MARKED SHARED WRITES ITS SPLIT, and money in from that person is a settle-up', async () => {
  const { api, close } = await fresh();
  const account = make(api, 'accounts', { name: 'Current', kind: 'bank', balance: gbp(500_000), as_of: '2026-09-01', liquid: true });
  const line = make(api, 'transactions', { what: 'Cabin booking', on: '2026-10-21', direction: 'out', amount: gbp(30_000), account, state: 'cleared', shared_with: 'Robin', split_share: 40 });
  await settle(api);
  const split = rowsOf(api, 'splits', { all: [{ field: 'line', is: line }] });
  assert.equal(split.length, 1);
  assert.deepEqual([split[0]!.fields.with, split[0]!.fields.kind, split[0]!.fields.paid_by, split[0]!.fields.part], ['Robin', 'cost', 'me', gbp(18_000)]);
  make(api, 'transactions', { what: 'From Robin', on: '2026-10-23', direction: 'in', amount: gbp(18_000), account, state: 'cleared', shared_with: 'Robin' });
  await settle(api);
  assert.equal(rowsOf(api, 'split_people')[0]!.fields.way, 'square');
  close();
});

test('THE PAGES draw with nothing refused', async () => {
  const { api, close } = await fresh();
  const empty = said<{ blocks: Block[] }>(await api.page({ slug: 'splits' }, owner));
  for (const b of empty.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  make(api, 'splits', { what: 'Taxi', on: '2026-10-20', with: 'Alex', kind: 'cost', paid_by: 'me', amount: gbp(3_000) });
  await settle(api);
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'splits' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(page.blocks[0]!.kind, 'note');
  const listed = api.kernel.pages() as unknown as { slug: string; title: string; template: string | null }[];
  const found = listed.find((p) => p.template === 'split-person' && p.title === 'Alex');
  assert.ok(found, 'the person has a page of their own');
  const theirs = said<{ blocks: Block[] }>(api.kernel.page(found.slug));
  for (const b of theirs.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  /* WHERE THEY STAND IS A CARD OVER THEIR ROW: a note filled from the row printed "to_me: [object Object]." */
  assert.equal(theirs.blocks[0]!.kind, 'cards');
  assert.ok(!theirs.blocks.some((b) => b.kind === 'note' && /\{\{(?:stands|way)\}\}/u.test(String((b as { body?: unknown }).body ?? ''))), 'a note fills a money field from the row');
  close();
});
