/**
 * Photographer: shoots from the first enquiry to the fee paid, what each one still owes the client, and the gear with the
 * day its cover ends. Written for somebody who photographs weddings and has never seen BrainDog's code, as a file and
 * nothing else: no script, nothing under `packages/` or `apps/`.
 *
 * WHAT THIS HOLDS. A fresh record with People installed from its first-party file, then this file read fresh, planned and
 * installed with exactly what the plan asks to approve. A month of invented work goes in through the record's own API:
 * eight shoots across the five states, ten deliverables and four pieces of gear. Then the Shoots board's lanes, each
 * figure's number, a reminder armed on a deliverable and on a cover's end, a move the states do not allow, and a record
 * without People, which is refused with a sentence that names what is missing.
 *
 * RED FIRST: before the add-on, a record with People has no shoots, no Shoots page and none of the figures (the first
 * test). Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

/* WEDNESDAY 14 OCTOBER 2026 AT EIGHT IN THE MORNING, in a record kept in UTC. */
const NOW = Date.UTC(2026, 9, 14, 8);
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
type Diff = { planHash: string; approve: unknown[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./photographer.pack.json', import.meta.url);
const file = (): Body => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Body;

/** Plan, then install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const plan = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;
  if (!plan.ok) return plan;
  const diff = (plan.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** A fresh record, with People when `people` says so, and this add-on when `withPack` does. */
async function record(opts: { people?: boolean; withPack?: boolean } = {}): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAP',
      slug: 'lens',
      name: 'Lens and Light',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', email: 'mira@example.test', name: 'Mira' },
    }),
  );
  /* PEOPLE AS BRAINDOG MAKES IT points its people at projects, so Portfolio goes in first, as every record has it. */
  said(await put(api, firstPartyDocument('portfolio', { seeds: [] })));
  if (opts.people !== false) said(await put(api, firstPartyDocument('people', { seeds: [] })));
  if (opts.withPack !== false) said(await put(api, file()));
  return { api, sql };
}

const make = (api: Api, register: string, fields: Body): string => said<{ id: string }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).id;
const gbp = (amount: number): Body => ({ amount, currency: 'GBP' });

/** Eight shoots across the five states, each for an invented client. Fees are pence. */
const SHOOTS: [string, string, string | null, string, number][] = [
  ['Ashworth wedding', 'paid', '2026-10-03', 'Ines Ashworth', 180_000],
  ['Brook family portraits', 'delivered', '2026-10-07', 'Tom Brook', 45_000],
  ['Calder engagement', 'shot', '2026-10-10', 'Rhea Calder', 60_000],
  ['Holloway wedding', 'booked', '2026-10-17', 'June Holloway', 240_000],
  ['Dunmore wedding', 'booked', '2026-10-24', 'Owen Dunmore', 220_000],
  ['Fairley christening', 'enquiry', '2026-10-31', 'Lena Fairley', 35_000],
  ['Elm Street bakery launch', 'booked', '2026-11-06', 'Pia Elm', 80_000],
  ['Garnet headshots', 'enquiry', null, 'Max Garnet', 30_000],
];

/** Ten deliverables: what, which shoot, due, and the day it was sent when it was. */
const DELIVERABLES: [string, string, string, string | null][] = [
  ['Edited set', 'Ashworth wedding', '2026-10-10', '2026-10-09'],
  ['Album', 'Ashworth wedding', '2026-11-20', '2026-10-12'],
  ['Edited set', 'Brook family portraits', '2026-10-12', '2026-10-12'],
  ['Prints', 'Brook family portraits', '2026-10-13', null],
  ['Sneak peek', 'Calder engagement', '2026-10-12', null],
  ['Edited set', 'Calder engagement', '2026-10-20', null],
  ['Sneak peek', 'Holloway wedding', '2026-10-19', null],
  ['Edited set', 'Holloway wedding', '2026-11-14', null],
  ['Album', 'Holloway wedding', '2026-12-12', null],
  ['Edited set', 'Dunmore wedding', '2026-11-21', null],
];

/** Four pieces of gear: the item, what it cost, and the day its cover ends. */
const GEAR: [string, number, string][] = [
  ['Main camera body', 210_000, '2026-12-20'],
  ['Wide lens', 95_000, '2027-04-02'],
  ['Flash kit', 38_000, '2026-10-30'],
  ['Spare body', 120_000, '2028-01-15'],
];

/** The month written through the record's API. Answers each row's id by its name. */
function month(api: Api): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const [name, state, day, client, fee] of SHOOTS) {
    const who = make(api, 'people', { name: client });
    /* A DEPOSIT ON THE TWO WEDDINGS STILL TO COME, and the paid one paid in full. */
    const taken = name === 'Ashworth wedding' ? fee : name === 'Holloway wedding' || name === 'Dunmore wedding' ? 50_000 : 0;
    ids[name] = make(api, 'shoots', { name, state, who, fee: gbp(fee), place: 'Riverside', taken: gbp(taken), ...(day ? { day } : {}) });
  }
  for (const [what, shoot, due, sent] of DELIVERABLES)
    ids[`${what} for ${shoot}`] = make(api, 'deliverables', { what, shoot: ids[shoot], due, ...(sent ? { sent } : {}) });
  for (const [item, cost, cover] of GEAR) ids[item] = make(api, 'gear', { item, cost: gbp(cost), cover });
  return ids;
}

type Row = { id: string; fields: Body };
type Block = { kind: string; heading?: string; rows?: Row[]; why?: string; refusal?: Refusal };
type Page = { title: string; blocks: Block[] };
const pageOf = async (api: Api, slug: string): Promise<Page> => said<Page>(await api.page({ slug }, owner));
const blockOf = (page: Page, heading: string): Block => {
  const b = page.blocks.find((x) => x.heading === heading);
  assert.ok(b, `the page has a block called ${heading}`);
  return b;
};
const figure = async (api: Api, metric: string): Promise<{ value: unknown; unit?: string | null }> => said(await api.metric({ metric }, owner));

/** The days a row's reminders are armed for, soonest first, read off the record's own schedule. */
const reminders = (sql: NodeSql, id: string): string[] =>
  sql
    .all<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'reminder' AND state = 'pending' AND key LIKE ? ORDER BY due_at", `${id}:%`)
    .map((r) => r.due_at.slice(0, 10));

const FIGURES = ['shoots-open', 'shoots-booked-month', 'shoot-fees-owed', 'shoot-next-day', 'deliverables-open', 'deliverables-late'];

test('BEFORE THE ADD-ON: a record with People has no shoots, no Shoots page and none of the figures', async () => {
  const { api, sql } = await record({ withPack: false });
  for (const list of ['shoots', 'deliverables', 'gear']) assert.equal(api.kernel.register(list), undefined, `${list} is already on the record`);
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['page.shoots', 'page.shoots-due', 'page.shoot', ...FIGURES.map((m) => `metric.${m}`)]) assert.ok(!ids.includes(id), `${id} is already on the record`);
  sql.close();
});

test('THE FILE IS photographer 1.0.1 on People 3, with three lists, three pages, six figures and no script or seeds', () => {
  const doc = file() as { pack: string; version: string; license: string; requires: { packs: Body }; seeds?: unknown; declarations: Body[] };
  assert.deepEqual([doc.pack, doc.version, doc.license], ['photographer', '1.0.4', 'MIT']);
  assert.deepEqual(doc.requires.packs, { people: '>=3.3.0 <5.0.0' });
  assert.equal(doc.seeds, undefined);
  assert.deepEqual(doc.declarations.filter((d) => d.register).map((d) => d.register), ['shoots', 'deliverables', 'gear']);
  assert.deepEqual(doc.declarations.filter((d) => d.page).map((d) => d.page), ['shoots', 'shoots-due', 'shoot']);
  assert.deepEqual(doc.declarations.filter((d) => d.metric).map((d) => d.metric), FIGURES);
  assert.equal(doc.declarations.filter((d) => d.script || d.rule || d.automation).length, 0, 'no code: the add-on is its file');
});

test('A RECORD WITHOUT PEOPLE IS REFUSED, with a sentence that names People', async () => {
  const { api, sql } = await record({ people: false, withPack: false });
  const out = await put(api, file());
  assert.equal(out.ok, false, 'the add-on went in without People');
  assert.match(out.refusal!.fix, /Install people first/);
  assert.doesNotMatch(out.refusal!.fix, /[0-9A-HJKMNP-TV-Z]{26}/, 'the sentence names no row id');
  assert.equal(api.kernel.register('shoots'), undefined);
  sql.close();
});

test('IT GOES IN ON PEOPLE AS BRAINDOG SHIPS IT, which the range in the file takes', async () => {
  const { api, sql } = await record();
  const held = api.kernel.packs().find((p) => p.id === 'people')!.version;
  assert.match(held, /^4\./, `People ${held} is inside >=3.3.0 <5.0.0`);
  assert.equal(api.kernel.packs().find((p) => p.id === 'photographer')?.version, '1.0.4');
  sql.close();
});

test('THE BOARD HAS A LANE FOR EACH STATUS, in the order a shoot moves through them', async () => {
  const { api, sql } = await record();
  month(api);
  const board = blockOf(await pageOf(api, 'shoots'), 'By status');
  assert.equal(board.kind, 'board');
  const lanes: Record<string, string[]> = {};
  for (const r of board.rows ?? []) (lanes[String(r.fields.state)] ??= []).push(String(r.fields.name));
  for (const names of Object.values(lanes)) names.sort();
  assert.deepEqual(lanes, {
    enquiry: ['Fairley christening', 'Garnet headshots'],
    booked: ['Dunmore wedding', 'Elm Street bakery launch', 'Holloway wedding'],
    shot: ['Calder engagement'],
    delivered: ['Brook family portraits'],
    paid: ['Ashworth wedding'],
  });
  const shoots = (file().declarations as { register?: string; fields?: { id: string; values?: string[] }[] }[]).find((d) => d.register === 'shoots')!;
  const states = shoots.fields!.find((f) => f.id === 'state')!.values;
  assert.deepEqual(states, ['enquiry', 'booked', 'shot', 'delivered', 'paid'], 'the lanes are drawn in the order the list declares');
  sql.close();
});

test('THE FIGURES: five booked this month, 5,450.00 owed after two deposits, the next shoot on 17 October, seven to send and two late', async () => {
  const { api, sql } = await record();
  month(api);
  assert.equal((await figure(api, 'shoots-open')).value, 7);
  assert.equal((await figure(api, 'shoots-booked-month')).value, 5, 'Ashworth, Brook, Calder, Holloway and Dunmore fall in October and are past enquiry');
  const owed = await figure(api, 'shoot-fees-owed');
  assert.deepEqual(
    [owed.value, owed.unit],
    [545_000, 'GBP'],
    'the fees of Brook, Calder, Holloway, Dunmore and Elm Street, 6,450.00, less the two deposits of 500.00; the paid one and the enquiries are not owed',
  );
  /* A DAY FIGURE IS READ AS A DAY NUMBER, days since 1 January 1970, which the page prints as the day. */
  const next = (await figure(api, 'shoot-next-day')).value as number;
  assert.equal(new Date(next * 86_400_000).toISOString().slice(0, 10), '2026-10-17', 'Holloway, the soonest booked shoot from today');
  assert.equal((await figure(api, 'deliverables-open')).value, 7);
  assert.equal((await figure(api, 'deliverables-late')).value, 2, 'the Brook prints and the Calder sneak peek');
  sql.close();
});

test('A REMINDER IS ARMED on a deliverable three days before it is due and on the day, and on gear a month before its cover ends', async () => {
  const { api, sql } = await record();
  const ids = month(api);
  assert.deepEqual(reminders(sql, ids['Edited set for Calder engagement']!), ['2026-10-17', '2026-10-20']);
  assert.deepEqual(reminders(sql, ids['Main camera body']!), ['2026-11-20', '2026-12-20']);
  /* A NEW DUE DAY MOVES THEM: the reminders follow the field, not the day the row was written with. */
  said(api.kernel.update('deliverables', ids['Edited set for Calder engagement']!, { due: '2026-10-27' } as never, { actor: 'p_1' }));
  assert.deepEqual(reminders(sql, ids['Edited set for Calder engagement']!), ['2026-10-24', '2026-10-27']);
  sql.close();
});

test('A SHOOT MOVES ONLY AS THE STATES ALLOW: an enquiry cannot be paid, and a booked shoot can be shot', async () => {
  const { api, sql } = await record();
  const ids = month(api);
  const r = api.kernel.update('shoots', ids['Fairley christening']!, { state: 'paid' } as never, { actor: 'p_1' }) as Out;
  assert.equal(r.ok, false, 'an enquiry went straight to paid');
  assert.equal(r.refusal!.code, 'TRANSITION_ILLEGAL');
  assert.deepEqual((r.refusal as Refusal & { allowed?: string[] }).allowed, ['booked']);
  said(api.kernel.update('shoots', ids['Holloway wedding']!, { state: 'shot' } as never, { actor: 'p_1' }));
  const board = blockOf(await pageOf(api, 'shoots'), 'By status');
  assert.equal(board.rows!.find((x) => x.fields.name === 'Holloway wedding')!.fields.state, 'shot');
  sql.close();
});

test('THE SHOOTS PAGE draws at most six tiles, none of them refused, and no line of the month over them', async () => {
  const { api, sql } = await record();
  month(api);
  const page = await pageOf(api, 'shoots');
  assert.equal(page.title, 'Shoots');
  const drawn = page.blocks.filter((b) => b.why !== 'when');
  assert.ok(drawn.length <= 6, `${drawn.length} tiles`);
  for (const b of page.blocks) assert.equal(b.refusal, undefined, `${b.kind} ${b.heading ?? ''} was refused: ${b.refusal?.fix}`);
  /* NO LINE OF THE MONTH SINCE 1.0.4 (3 Nov, "i dont like those briefs at all, remove them"): "3 shoots booked this
     month, 1 deliverable late" said what the figures under it show. The line for no shoot is left out, since there are. */
  assert.equal(drawn.find((b) => b.kind === 'note'), undefined, 'the page still opens with a sentence');
  assert.equal(page.blocks.some((b) => /booked this month/u.test(String((b as { body?: string }).body ?? ''))), false);
  sql.close();
});

test('THE DUE PAGE lists what is still to send by its day, and the cover that ends in the next 90 days', async () => {
  const { api, sql } = await record();
  month(api);
  const page = await pageOf(api, 'shoots-due');
  for (const b of page.blocks) assert.equal(b.refusal, undefined, `${b.kind} ${b.heading ?? ''} was refused: ${b.refusal?.fix}`);
  const owed = blockOf(page, 'Still to send').rows!.map((r) => [r.fields.what, r.fields.due]);
  assert.deepEqual(owed, [
    ['Sneak peek', '2026-10-12'],
    ['Prints', '2026-10-13'],
    ['Sneak peek', '2026-10-19'],
    ['Edited set', '2026-10-20'],
    ['Edited set', '2026-11-14'],
    ['Edited set', '2026-11-21'],
    ['Album', '2026-12-12'],
  ]);
  assert.deepEqual(
    blockOf(page, 'Cover ending in the next 90 days').rows!.map((r) => r.fields.item),
    ['Flash kit', 'Main camera body'],
  );
  sql.close();
});

test('A PAGE FOR EACH SHOOT, named by the shoot, with what it still owes', async () => {
  const { api, sql } = await record();
  month(api);
  const pages = said<{ slug: string; title: string }[]>(await api.pages(owner));
  const mine = pages.find((p) => p.title === 'Holloway wedding');
  assert.ok(mine, 'Holloway wedding has a page of its own');
  const page = await pageOf(api, mine.slug);
  assert.equal(page.title, 'Holloway wedding');
  for (const b of page.blocks) assert.equal(b.refusal, undefined, `${b.kind} ${b.heading ?? ''} was refused: ${b.refusal?.fix}`);
  assert.deepEqual(
    blockOf(page, 'What it still owes').rows!.map((r) => r.fields.what),
    ['Sneak peek', 'Edited set', 'Album'],
  );
  sql.close();
});

test('A SHOOT WITH NOTHING PAID YET owes its whole fee: an empty Paid so far counts as nothing', async () => {
  const { api, sql } = await record();
  const who = make(api, 'people', { name: 'Noor Vale' });
  make(api, 'shoots', { name: 'Vale wedding', state: 'booked', who, day: '2026-10-28', fee: gbp(150_000) });
  const owed = await figure(api, 'shoot-fees-owed');
  assert.deepEqual([owed.value, owed.unit], [150_000, 'GBP']);
  sql.close();
});
