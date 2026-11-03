/**
 * Trips: a trip is a name and the days it ran, the Ledger's lines from those days are filed into it, and its page says
 * what it cost, by category and in each currency.
 *
 * THE LINE'S TRIP IS A REF THAT IS NOT INDEXED. The Ledger already holds the eight indexes a list may (`INDEX_CEILING`),
 * so the pack extends it with one more field and no index, and a page reads a trip's lines by the field all the same.
 *
 * Every name and amount here is invented.
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

const FILE = new URL('./trips.pack.json', import.meta.url);
const shipped = (): Body & { declarations: Body[]; extends: Body } => JSON.parse(readFileSync(FILE, 'utf8')) as never;

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function fresh(withTrips = true): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  if (withTrips) await put(api, shipped());
  return { api, close: () => sql.close() };
}

async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('filing a trip fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'filing was refused or failed ' + JSON.stringify(ran));
  }
}

const make = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const fieldsOf = (api: Api, id: string): Body => api.kernel.get(id as never)!.fields as Body;
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));

/** A current account and two categories, then ten lines: five inside the trip's days, one a move, one void, three outside. */
function ledger(api: Api): { account: string; food: string; hotel: string; lines: Record<string, string> } {
  const account = make(api, 'accounts', { name: 'Current', kind: 'bank', balance: gbp(500_000), as_of: '2026-09-01', liquid: true });
  const food = make(api, 'categories', { name: 'Food', direction: 'out' });
  const hotel = make(api, 'categories', { name: 'Hotel', direction: 'both' });
  const line = (what: string, on: string, amount: number, direction: 'in' | 'out', extra: Body = {}) =>
    make(api, 'transactions', { what, on, direction, amount: gbp(amount), account, state: 'cleared', ...extra });
  const lines = {
    before: line('Airport coffee before', '2026-10-04', 400, 'out', { category: food }),
    hotel: line('Harbour hotel', '2026-10-06', 30_000, 'out', { category: hotel }),
    dinner: line('Dinner by the quay', '2026-10-07', 4_500, 'out', { category: food }),
    lunch: line('Lunch', '2026-10-09', 1_500, 'out', { category: food }),
    refund: line('Hotel refund', '2026-10-10', 2_000, 'in', { category: hotel }),
    void: line('Void booking', '2026-10-08', 9_900, 'out', { state: 'void' }),
    after: line('Taxi home after', '2026-10-12', 2_500, 'out'),
  };
  return { account, food, hotel, lines };
}

test('THE FILE: trips 2.0.0 on money-core, one list, a rule and its script, two pages, and a trip field on the Ledger with no index', () => {
  const doc = shipped();
  assert.deepEqual([doc.pack, doc.version, doc.license], ['trips', '2.1.1', 'Apache-2.0']);
  assert.equal(doc.seeds, undefined, 'no example rows');
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), ['trips']);
  assert.deepEqual(kinds('page'), ['trips', 'trip']);
  assert.deepEqual(kinds('rule'), ['file_trip']);
  assert.deepEqual(kinds('script'), ['file_trip']);
  const added = (doc.extends['register.transactions'] as { fields: Body[] }).fields;
  assert.deepEqual(added.map((f) => [f.id, f.type, f.to, f.index]), [['trip', 'ref', 'trips', undefined]]);
  assert.ok(String(doc.changes).length <= 500);
});

test('BEFORE THE PACK: the Ledger has no trip field and there is no trips list', async () => {
  const { api, close } = await fresh(false);
  assert.equal(api.kernel.register('trips'), undefined);
  assert.ok(!api.kernel.declarations().some((d) => d.id === 'page.trips'));
  close();
});

test('SAVING A TRIP FILES THE LEDGER LINES OF ITS DAYS, and leaves void lines, other days and lines already in another trip alone', async () => {
  const { api, close } = await fresh();
  const { lines, account } = ledger(api);
  /* A LINE IN ANOTHER TRIP ALREADY: the earlier trip keeps it. */
  const earlier = make(api, 'trips', { name: 'Weekend away', from: '2026-10-09', to: '2026-10-09', hue: 'green' });
  const ferry = make(api, 'transactions', { what: 'Ferry', on: '2026-10-09', direction: 'out', amount: gbp(900), account, state: 'cleared', trip: earlier });
  await settle(api);
  const trip = make(api, 'trips', { name: 'Harbour week', from: '2026-10-06', to: '2026-10-10', hue: 'blue' });
  await settle(api);
  const inTrip = (k: string) => fieldsOf(api, lines[k]!).trip ?? null;
  assert.deepEqual(['hotel', 'dinner', 'lunch', 'refund'].map(inTrip), [trip, trip, earlier, trip]); /* the weekend trip, written first, filed the lunch of its one day */
  assert.deepEqual(['before', 'after', 'void'].map(inTrip), [null, null, null]);
  assert.equal(fieldsOf(api, ferry).trip, earlier, 'a line already in a trip stays there');
  close();
});

test('WHEN A TRIP\'S DATES SHRINK, THE LINES IT FILED OUTSIDE THEM COME OUT; a line put in by hand from outside its days stays', async () => {
  const { api, close } = await fresh();
  const { lines, account } = ledger(api);
  const trip = make(api, 'trips', { name: 'Harbour week', from: '2026-10-06', to: '2026-10-10', hue: 'blue' });
  await settle(api);
  const inTrip = (k: string) => fieldsOf(api, lines[k]!).trip ?? null;
  assert.deepEqual(['hotel', 'dinner', 'lunch', 'refund'].map(inTrip), [trip, trip, trip, trip]);
  const kept = make(api, 'transactions', { what: 'Booked ahead', on: '2026-09-20', direction: 'out', amount: gbp(700), account, state: 'cleared', trip });
  said(api.kernel.update('trips', trip, { to: '2026-10-07' } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(['hotel', 'dinner', 'lunch', 'refund'].map(inTrip), [trip, trip, null, null], 'the lines after the new last day are un-filed');
  assert.equal(fieldsOf(api, kept).trip, trip, 'a line outside the days the trip filed stays where it was put');
  close();
});

test('A TRIP WITH MORE THAN FIFTY LINES, EVEN ON ONE DAY, FILES THEM ALL', async () => {
  const { api, close } = await fresh();
  const { account } = ledger(api);
  const ids = Array.from({ length: 130 }, (_, i) => make(api, 'transactions', { what: `Round ${i}`, on: i < 120 ? '2026-10-07' : '2026-10-08', direction: 'out', amount: gbp(100), account, state: 'cleared' }));
  const trip = make(api, 'trips', { name: 'Busy week', from: '2026-10-06', to: '2026-10-10', hue: 'blue' });
  /* 130 new lines start 390 other runs ahead of the trip's, fifty at a time. */
  for (let i = 0; i < 12; i++) await settle(api);
  assert.equal(ids.filter((id) => fieldsOf(api, id).trip === trip).length, 130);
  close();
});

test('THE TRIP PAGE: total, money back and lines filed, by category and by account, with nothing refused', async () => {
  const { api, close } = await fresh();
  ledger(api);
  make(api, 'trips', { name: 'Harbour week', from: '2026-10-06', to: '2026-10-10', hue: 'blue' });
  await settle(api);
  const spent = await metric(api, 'trip-spent:Harbour week');
  assert.deepEqual([spent.value, spent.unit], [30_000 + 4_500 + 1_500, 'GBP']);
  assert.equal((await metric(api, 'trip-back:Harbour week')).value, 2_000);
  assert.equal((await metric(api, 'trip-lines:Harbour week')).value, 4);

  const listed = api.kernel.pages() as unknown as { slug: string; title: string; template: string | null }[];
  const found = listed.find((p) => p.template === 'trip' && p.title === 'Harbour week');
  assert.ok(found, 'the trip has a page of its own');
  const page = said<{ blocks: Block[] }>(api.kernel.page(found.slug));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(page.blocks[0]!.kind, 'note', 'it opens with a lead note');
  const heads = page.blocks.map((b) => b.heading);
  for (const h of ['What it cost', 'Where it went, by category', 'By account, in its own currency', 'Its lines']) assert.ok(heads.includes(h), `${h} is on the page: ${heads.join(', ')}`);
  const lines = page.blocks.find((b) => b.heading === 'Its lines')!;
  assert.equal(lines.rows?.length, 4);

  const list = said<{ blocks: Block[] }>(await api.page({ slug: 'trips' }, owner));
  for (const b of list.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(list.blocks[0]!.kind, 'note');
  close();
});

test('A LINE FILED INTO A TRIP READS THE TRIP BACK BY THE FIELD, though it is not indexed', async () => {
  const { api, close } = await fresh();
  const { account } = ledger(api);
  const trip = make(api, 'trips', { name: 'Harbour week', from: '2026-10-06', to: '2026-10-10' });
  const id = make(api, 'transactions', { what: 'Museum', on: '2026-10-20', direction: 'out', amount: gbp(1_200), account, state: 'cleared', trip });
  const rows = said<{ rows: { id: string }[] }>(api.kernel.list({ register: 'transactions', where: { all: [{ field: 'trip', is: trip }] } } as never));
  assert.deepEqual(rows.rows.map((r) => r.id), [id]);
  close();
});
