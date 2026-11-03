/**
 * Landlord: the flats a stranger rents out, their tenancies, the rent that came in and the repairs, as a file with no
 * code. The test is the stranger's Monday: a fresh record with People, the file installed exactly as it ships, a month
 * of rows written through the record's own door, and what Lettings and each property's page then say.
 *
 * THE CLOCK IS FIXED ON MONDAY 19 OCTOBER 2026, in a record kept in UTC, so "this month" is October and "this year"
 * is 2026 on every run.
 *
 * Every property, tenant and repair here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 9, 19, 8);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Body = Record<string, unknown>;
type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; adds: { id: string }[]; conflicts: unknown[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./landlord.pack.json', import.meta.url);
const file = (): Body & { declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Body & { declarations: Body[] };

const planOf = async (api: Api, doc: unknown): Promise<Out> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await planOf(api, doc)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A fresh record with People, and this file on it when `withPack` says so. */
async function record(withPeople = true, withPack = true): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE',
      slug: 'lettings-desk',
      name: 'Lettings desk',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', email: 'lena@example.test', name: 'Lena' },
    }),
  );
  /* PEOPLE ON ITS OWN, as a stranger's record has it: no Projects and no Money, so the parts of People that wait on them wait. */
  if (withPeople) await put(api, firstPartyDocument('people', { seeds: [], holds: ['people', 'organisations'] }));
  if (withPack) await put(api, file());
  return { api, sql };
}

const write = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const gbp = (pounds: number) => ({ amount: pounds * 100, currency: 'GBP' });

/* ── A month of a stranger's lettings ─────────────────────────────────────────────────────────────────────────────── */

const PROPERTIES = [
  { name: 'Elm Court 1', street: '4 Elm Court, Haddon', kind: 'flat' },
  { name: 'Elm Court 2', street: '6 Elm Court, Haddon', kind: 'flat' },
  { name: 'Harbour View', street: '12 Quay Row, Pellbridge', kind: 'flat', note: 'Top floor, no lift.' },
  { name: 'Quarry Cottage', street: '2 Quarry Lane, Fenmoor', kind: 'house' },
  { name: 'Mill Loft', street: 'Unit 3, The Old Mill, Haddon', kind: 'flat' },
  { name: 'Station Rooms', street: '1 Station Yard, Pellbridge', kind: 'room' },
] as const;

/** Six tenancies, one a property: five in force, one under notice among them, and one that ended in September. */
const TENANCIES = [
  { at: 'Elm Court 1', name: 'Elm Court 1 to Ines Marlow', tenant: 'Ines Marlow', rent: 950, day: 1, from: '2026-01-01', until: '2026-12-31', deposit: 1100, state: 'live' },
  { at: 'Elm Court 2', name: 'Elm Court 2 to Teo Brandt', tenant: 'Teo Brandt', rent: 925, day: 5, from: '2025-04-01', until: '2027-03-31', deposit: 1050, state: 'live' },
  { at: 'Harbour View', name: 'Harbour View to Rhea Okafor', tenant: 'Rhea Okafor', rent: 1400, day: 15, from: '2025-03-01', until: '2027-02-28', deposit: 1600, state: 'notice' },
  { at: 'Quarry Cottage', name: 'Quarry Cottage to Joss Penhale', tenant: 'Joss Penhale', rent: 1100, day: 20, from: '2024-07-01', until: '2027-06-30', deposit: 1250, state: 'live' },
  { at: 'Mill Loft', name: 'Mill Loft to Mara Quint', tenant: 'Mara Quint', rent: 800, day: 28, from: '2026-02-01', until: '2027-01-31', deposit: 900, state: 'live' },
  { at: 'Station Rooms', name: 'Station Rooms to Ollie Fenwick', tenant: 'Ollie Fenwick', rent: 700, day: 1, from: '2025-10-01', until: '2026-09-30', deposit: 800, state: 'ended' },
] as const;

/** Twelve payments: two in August, all six in September, and four of the five in force so far in October. */
const RENT: readonly [string, string, string][] = [
  ['Mill Loft to Mara Quint', 'August rent', '2026-08-28'],
  ['Station Rooms to Ollie Fenwick', 'August rent', '2026-08-01'],
  ['Elm Court 1 to Ines Marlow', 'September rent', '2026-09-01'],
  ['Elm Court 2 to Teo Brandt', 'September rent', '2026-09-05'],
  ['Harbour View to Rhea Okafor', 'September rent', '2026-09-15'],
  ['Quarry Cottage to Joss Penhale', 'September rent', '2026-09-21'],
  ['Mill Loft to Mara Quint', 'September rent', '2026-09-30'],
  ['Station Rooms to Ollie Fenwick', 'September rent', '2026-09-01'],
  ['Elm Court 1 to Ines Marlow', 'October rent', '2026-10-01'],
  ['Elm Court 2 to Teo Brandt', 'October rent', '2026-10-05'],
  ['Harbour View to Rhea Okafor', 'October rent', '2026-10-15'],
  ['Quarry Cottage to Joss Penhale', 'October rent', '2026-10-19'],
];

/** Three repairs: one open this month, one done in February, and one done last December, which is not this year's. */
const REPAIRS = [
  { at: 'Elm Court 1', what: 'Boiler pressure keeps dropping', cost: 180, raised: '2026-10-12' },
  { at: 'Harbour View', what: 'Window latch in the bedroom', cost: 45, raised: '2026-02-03', done: '2026-02-05' },
  { at: 'Quarry Cottage', what: 'Gutter over the back door', cost: 320, raised: '2025-12-10', done: '2025-12-20' },
] as const;

/** The month written through the record's own door, as a person adding each row would. The ids by name. */
function month(api: Api): { rentals: Map<string, string>; tenancies: Map<string, string> } {
  const rentals = new Map<string, string>();
  for (const p of PROPERTIES) rentals.set(p.name, write(api, 'rentals', { ...p }));
  const tenancies = new Map<string, string>();
  for (const t of TENANCIES) {
    const tenant = write(api, 'people', { name: t.tenant });
    const fields = { name: t.name, rental: rentals.get(t.at), tenant, rent: gbp(t.rent), rent_day: t.day, moved_in: t.from, let_until: t.until, deposit_held: gbp(t.deposit), state: t.state };
    tenancies.set(t.name, write(api, 'tenancies', fields));
  }
  /* A PAYMENT NAMES NO CURRENCY, only its amount: it takes the tenancy's, as a person typing 950 would expect. */
  for (const [tenancy, what, on] of RENT) {
    const rent = TENANCIES.find((t) => t.name === tenancy)!.rent;
    write(api, 'rent_in', { what, tenancy: tenancies.get(tenancy), amount: { amount: rent * 100 }, on });
  }
  for (const r of REPAIRS)
    write(api, 'repairs', { what: r.what, rental: rentals.get(r.at), cost: gbp(r.cost), raised_on: r.raised, ...('done' in r ? { fixed_on: r.done } : {}) });
  return { rentals, tenancies };
}

type Reading = { metric: string; reading: { rows?: number; value: number | null; unit?: string | null; parts?: { amount: number; currency: string }[] } };
type Block = { kind?: string; heading?: string; why?: string; body?: string; values?: Body; rows?: { id?: string; fields: Body }[]; readings?: Reading[]; refusals: Refusal[] };
type Page = { title: string; blocks: Block[] };

const pageOf = async (api: Api, slug: string): Promise<Page> => said<Page>(await api.page({ slug }, owner));
/** The block a person sees under a heading: the one drawn, where a page declares two and draws the one whose when holds. */
const under = (page: Page, heading: string): Block => {
  const b = page.blocks.find((x) => x.heading === heading && x.why !== 'when');
  assert.ok(b, `${page.title} draws nothing under ${heading}`);
  return b;
};
/** A figure's amount in pence, read as the page reads it: one currency here, so one amount. */
const pence = (r: Reading['reading'] | undefined): number | null => r?.value ?? (r?.parts?.length === 1 ? r.parts[0]!.amount : null);
const cell = (b: Block, metric: string): Reading['reading'] | undefined => b.readings?.find((r) => r.metric === metric)?.reading;
const figure = (api: Api, id: string): Out => api.kernel.metric(file().declarations.find((d) => d.metric === id) as never) as Out;

/* ── Before the add-on, and the file ─────────────────────────────────────────────────────────────────────────────── */

test('BEFORE THE ADD-ON: a record with People has no properties, no tenancies and no Lettings page', async () => {
  const { api, sql } = await record(true, false);
  for (const list of ['rentals', 'tenancies', 'rent_in', 'repairs']) assert.equal(api.kernel.register(list), undefined, `${list} is already on the record`);
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'lettings'));
  sql.close();
});

test('THE FILE IS landlord 1.0.1 on People, data only: four lists, two pages, ten figures, no script and no example rows', () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version, doc.author, doc.license], ['landlord', '1.0.4', 'BrainDog', 'MIT']);
  assert.deepEqual((doc.requires as Body).packs, { people: '>=3.3.0 <5.0.0' });
  const kinds = (key: string) => doc.declarations.filter((d) => key in d).map((d) => d[key]);
  assert.deepEqual(kinds('register'), ['rentals', 'tenancies', 'rent_in', 'repairs']);
  assert.deepEqual(kinds('page'), ['lettings', 'rental']);
  assert.equal(kinds('metric').length, 10);
  assert.deepEqual([kinds('script'), kinds('rule'), doc.seeds, doc.extends], [[], [], undefined, undefined]);
  assert.doesNotMatch(readFileSync(PACK_FILE, 'utf8'), /—/u, 'an em dash in words a person reads');
});

test('INSTALLED FROM THE FILE on a fresh record with People, with nothing refused', async () => {
  const { api, sql } = await record(true, false);
  const diff = said<{ diff: Diff }>(await planOf(api, file())).diff;
  assert.deepEqual(diff.conflicts, []);
  assert.ok(diff.adds.some((a) => a.id === 'page.lettings'));
  await put(api, file());
  assert.equal(api.kernel.packs().find((p) => p.id === 'landlord')?.version, '1.0.4');
  sql.close();
});

test('WITHOUT PEOPLE IT DOES NOT GO IN, and says so in a sentence', async () => {
  const { api, sql } = await record(false, false);
  const planned = await planOf(api, file());
  const diff = planned.ok ? (planned.value as { diff: Diff & { needs?: { id: string; ok: boolean }[] } }).diff : null;
  const tried = diff
    ? ((await api.installPack({ doc: file(), source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out)
    : planned;
  assert.equal(tried.ok, false, 'Landlord went in on a record with no People');
  assert.match(tried.refusal!.fix, /Install people first/u, 'the refusal does not say what to do');
  assert.match(tried.refusal!.fix, /[.]$/u, 'the refusal is not a sentence');
  assert.equal(api.kernel.register('tenancies'), undefined);
  sql.close();
});

/* ── Monday ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Rent due is the rent roll: the five tenancies in force, the one under notice among them, and not the one that ended. */
const DUE = (950 + 925 + 1400 + 1100 + 800) * 100;
/** Received is October's four payments, and not September's on the 30th. */
const RECEIVED = (950 + 925 + 1400 + 1100) * 100;

test('EACH FIGURE SAYS ITS NUMBER over the month: rent roll, received, unpaid, empty, open repairs, repairs this year, deposits', async () => {
  const { api, sql } = await record();
  month(api);
  const money = (id: string): number | null => pence(said<Reading['reading']>(figure(api, id)));
  const count = (id: string): unknown => said<{ value: unknown }>(figure(api, id)).value;
  assert.equal(money('rent-roll'), DUE);
  assert.equal(money('rent-in-month'), RECEIVED);
  assert.equal(count('unpaid-month'), 1, 'Mill Loft has not paid in October, and the tenancy that ended is not asked to');
  assert.equal(count('rentals-empty'), 1, 'Station Rooms has nobody in it since September');
  assert.equal(count('repairs-open'), 1);
  assert.equal(money('repair-cost-year'), (180 + 45) * 100, 'the gutter was last December');
  assert.equal(money('deposits-held'), (1100 + 1050 + 1600 + 1250 + 900) * 100);
  assert.equal(count('rentals-held'), 6);
  sql.close();
});

test('A PAYMENT TYPED WITH NO CURRENCY TAKES ITS TENANCY\'S', async () => {
  const { api, sql } = await record();
  month(api);
  const rows = said<{ rows: { fields: Body }[] }>(api.kernel.list({ register: 'rent_in', limit: 50 })).rows;
  assert.equal(rows.length, 12);
  assert.ok(rows.every((r) => (r.fields.amount as { currency: string }).currency === 'GBP'));
  sql.close();
});

test('LETTINGS ANSWERS MONDAY: the month\'s rent due and received, who has not paid, and which tenancy ends next', async () => {
  const { api, sql } = await record();
  month(api);
  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'lettings'));
  const page = await pageOf(api, 'lettings');
  assert.equal(page.title, 'Lettings');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);

  /* THE HEADLINE SENTENCE: the two numbers a landlord opens the page for. */
  const lead = page.blocks.find((b) => b.kind === 'note' && b.why !== 'when')!;
  assert.match(lead.body!, /rent due this month, and .* received so far/u);
  assert.equal(pence(lead.values?.['rent-roll'] as never) ?? (lead.values?.['rent-roll'] as { amount?: number })?.amount, DUE);

  const tiles = under(page, 'This month');
  assert.equal(pence(cell(tiles, 'rent-roll')), DUE);
  assert.equal(pence(cell(tiles, 'rent-in-month')), RECEIVED);
  assert.equal(cell(tiles, 'rentals-empty')?.value, 1);
  assert.equal(cell(tiles, 'repairs-open')?.value, 1);

  const unpaid = under(page, 'Not paid this month');
  assert.deepEqual((unpaid.rows ?? []).map((r) => r.fields.name), ['Mill Loft to Mara Quint']);

  const ending = under(page, 'Ending next');
  assert.equal(ending.rows?.[0]?.fields.name, 'Elm Court 1 to Ines Marlow', 'the tenancy that ends soonest is first');
  assert.ok(!(ending.rows ?? []).some((r) => r.fields.name === 'Station Rooms to Ollie Fenwick'), 'a tenancy that has ended is not ending');

  const cards = under(page, 'Properties');
  assert.equal(cards.rows?.length, 6);
  sql.close();
});

/** The days a row's reminders are armed for, soonest first, read off the record's own schedule. */
const reminders = (sql: NodeSql, id: string): string[] =>
  sql
    .all<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'reminder' AND state = 'pending' AND key LIKE ? ORDER BY due_at", `${id}:%`)
    .map((r) => r.due_at.slice(0, 10));

test('A TENANCY\'S END ARMS A REMINDER 60 DAYS BEFORE IT, the day the end is written, and moves with the end', async () => {
  const { api, sql } = await record();
  const { tenancies } = month(api);
  const elm = tenancies.get('Elm Court 1 to Ines Marlow')!;
  assert.deepEqual(reminders(sql, elm), ['2026-11-01'], 'sixty days before 31 December');
  assert.deepEqual(reminders(sql, tenancies.get('Mill Loft to Mara Quint')!), ['2026-12-02']);
  /* RENEWED FOR A YEAR: the warning moves with the end day. */
  said(api.kernel.update('tenancies', elm, { let_until: '2027-12-31' } as never, { actor: 'p_1' }));
  assert.deepEqual(reminders(sql, elm), ['2027-11-01']);
  sql.close();
});

test('EACH PROPERTY HAS A PAGE UNDER PROPERTIES IN THE RAIL: its rent due, its tenancies, who has not paid there and its repairs', async () => {
  const { api, sql } = await record();
  month(api);
  const listed = said<{ slug: string; title?: string; about?: { register: string } | null }[]>(await api.pages(owner));
  const own = listed.filter((p) => p.about?.register === 'rentals');
  assert.deepEqual(own.map((p) => p.title).sort(), PROPERTIES.map((p) => p.name).sort(), 'one page per property, named by it');
  /* THE RAIL SECTION IS THE INSTALLED PAGE'S OWN, as the record holds it: Properties, beside Lettings'. */
  const nav = (id: string): unknown => {
    const d = api.kernel.declarations().find((x) => x.id === id) as { body: unknown } | undefined;
    const body = (typeof d?.body === 'string' ? JSON.parse(d.body) : d?.body) as { nav?: { section?: string } } | undefined;
    return body?.nav?.section;
  };
  assert.deepEqual([nav('page.rental'), nav('page.lettings')], ['Properties', 'Lettings']);

  const elm = await pageOf(api, own.find((p) => p.title === 'Elm Court 1')!.slug);
  for (const b of elm.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const here = under(elm, 'Here');
  assert.equal(pence(cell(here, 'rent-due-at:Elm Court 1')), 950 * 100);
  assert.equal(cell(here, 'repairs-open-at:Elm Court 1')?.value, 1);
  assert.deepEqual((under(elm, 'Tenancies').rows ?? []).map((r) => r.fields.name), ['Elm Court 1 to Ines Marlow']);
  /* NOBODY UNPAID IS NOTHING DRAWN, as every empty part of a page is. */
  const paid = elm.blocks.find((b) => b.heading === 'Not paid this month')!;
  assert.deepEqual([paid.rows ?? [], paid.why], [[], 'when'], 'Ines paid on the 1st');
  assert.deepEqual((under(elm, 'Repairs').rows ?? []).map((r) => r.fields.what), ['Boiler pressure keeps dropping']);

  const loft = await pageOf(api, own.find((p) => p.title === 'Mill Loft')!.slug);
  assert.deepEqual((under(loft, 'Not paid this month').rows ?? []).map((r) => r.fields.name), ['Mill Loft to Mara Quint']);
  assert.deepEqual(loft.blocks.find((b) => b.heading === 'Repairs')!.rows ?? [], []);
  sql.close();
});
