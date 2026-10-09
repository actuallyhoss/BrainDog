/**
 * The week offer: a list with a day on its entries, four of them in this week, read on three different weeks and with no
 * page that reads it by the week, is offered a page of its week (`emergent.ts`, `weeksOffered`).
 *
 * WHAT IS HELD: a record 13 days old is offered nothing drawn from use, however much it is used (ENG-B17); at 15 days
 * Orders, with four due this week and read on three weeks, is offered one week page, whose sentence says what was seen
 * in the list's own words, which passes the lint keeping it meets and which keeping makes; Not now holds; a list read on
 * two weeks is not offered; a list a page already draws by the week is not offered a second; and on a record made the
 * way onboarding makes Mariam's, the Shop's Orders read through its own page is offered a week with what is running low
 * in Products. And: Not now holds into the next week; the fortnight is the record's age, not the list's; this week ends
 * on Sunday; Owed asks for a done state; and Running low is never drawn from a list of dated entries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import type { Declaration, Kernel } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { PEN_YOUNG_DAYS, penFor, type PenItem } from '../src/emergent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { firstPartyManifest } from '../../seed/src/index.ts';
import { modulesFor, useCase } from '../../seed/src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../../seed/src/usecases/install.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
/** A Tuesday. The record is made on it, so day 13 is a Monday and day 15 the Wednesday of that week. */
const BORN = Date.parse('2026-09-01T09:00:00Z');

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const ORDERS = {
  id: 'register.orders',
  kind: 'register',
  body: {
    id: 'orders',
    name: 'Orders',
    title: 'what',
    fields: [
      { id: 'what', label: 'What', type: 'text', required: true },
      { id: 'how_many', label: 'How many', type: 'int' },
      { id: 'due', label: 'Due', type: 'day', index: true, deadline: true },
      { id: 'paid', label: 'Paid', type: 'money' },
      { id: 'state', label: 'Status', type: 'enum', values: ['new', 'sent', 'paid'], default: 'new', required: true, index: true },
    ],
    state: 'state',
    done: ['paid'],
  },
} as unknown as Declaration;

/** Four orders due in the week of day 13 (a Monday) to day 19 (a Sunday). */
const THIS_WEEK = ['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18'];
/** Four orders due in the week after it, day 20 to day 26. */
const NEXT_WEEK = ['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25'];

/**
 * A record made on `BORN` holding Orders, with four orders due in the week of day 13 to day 19, and Orders read on day 0,
 * 7 and 13, three different weeks. `weeks: 2` leaves the first read out; `o` moves the day Orders is made, its reads,
 * its days due, or makes it a list with no done state.
 */
async function shop(weeks = 3, o: { madeOn?: number; reads?: number[]; due?: string[]; plain?: boolean } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-shop', name: 'The Shop', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const fields = (ORDERS.body as { fields: { id: string }[] }).fields;
  const orders = o.plain ? ({ ...ORDERS, body: { ...ORDERS.body, fields: fields.filter((f) => f.id !== 'state'), state: undefined, done: undefined } } as unknown as Declaration) : ORDERS;
  clock.set(BORN + (o.madeOn ?? 0) * DAY);
  value(await api.kernel.install([orders]));
  for (const day of o.reads ?? [0, 7, 13].slice(3 - weeks)) {
    clock.set(BORN + day * DAY);
    value(api.kernel.observe([{ kind: 'register.read', subject: 'orders' }]));
  }
  for (const [i, due] of (o.due ?? THIS_WEEK).entries()) value(api.kernel.create('orders', { what: `Order ${i + 1}`, due }, { actor: 'p_owner' }));
  value(api.kernel.create('orders', { what: 'Old order', due: '2026-08-20', paid: { amount: 90000, currency: 'EGP' } }, { actor: 'p_owner' }));

  /** Four more orders due on `days`. */
  const add = (days: readonly string[]): void => {
    for (const [i, due] of days.entries()) value(api.kernel.create('orders', { what: `Later order ${i + 1}`, due }, { actor: 'p_owner' }));
  };

  /** The pen on day `day`, as `boot` asks it of the owner. */
  const penOn = (day: number, dismissed: readonly string[] = []): PenItem[] => {
    const nowMs = BORN + day * DAY;
    clock.set(nowMs);
    return penFor({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(dismissed), use: { sql, nowMs } });
  };
  return { api, penOn, add };
}

const weekly = (pen: readonly PenItem[]): PenItem[] => pen.filter((i) => i.id.startsWith('week:'));

test('A RECORD 13 DAYS OLD IS OFFERED NOTHING DRAWN FROM USE, with four due this week and three weeks read', async () => {
  const { penOn } = await shop();
  assert.equal(PEN_YOUNG_DAYS, 14);
  assert.deepEqual(weekly(penOn(13)), [], 'a week page was offered in the first fortnight');
});

test('AT 15 DAYS ORDERS IS OFFERED ONE WEEK PAGE, said in its own words, and keeping it makes the page', async () => {
  const { api, penOn } = await shop();
  const pen = penOn(15);
  const weeks = weekly(pen);
  assert.equal(weeks.length, 1, 'Orders was not offered its week, or was offered it twice');
  const offer = weeks[0]!;
  assert.equal(offer.id, 'week:orders');
  assert.equal(offer.kind, 'page');
  assert.equal(offer.list, 'orders');
  assert.equal(offer.register, 'orders');
  assert.equal(offer.why, 'Orders has 4 due this week. Give them a page of their own?');
  assert.doesNotMatch(`${offer.title} ${offer.why}`, /\u2014|\brows?\b|ULID|#/u);
  assert.deepEqual(offer.draft, offer.change.to, 'the draft the card draws is not the page keeping writes');
  assert.ok(!pen.some((i) => i.id === 'page:orders'), 'Orders was offered a plain page beside its week');

  const body = offer.change.to.body as { page: string; title: string; blocks: { kind: string; heading?: string }[] };
  assert.equal(body.page, 'orders-week');
  assert.equal(body.title, 'Orders this week');
  assert.deepEqual(body.blocks.map((b) => b.heading), ['Due this week', 'Owed']);
  assert.equal(api.kernel.lint([{ id: offer.change.to.id, kind: 'page', body: offer.change.to.body } as never]), null);

  /* KEEP IS T1'S KEEP: the owner's `setDeclaration` of the whole body, as `keep.ts` writes it. */
  value(await api.setDeclaration({ body: offer.change.to.body, version: 0 }, owner));
  assert.ok(api.kernel.pages().some((p) => p.slug === 'orders-week'), 'keeping the offer did not make the page');
  assert.deepEqual(weekly(penOn(16)), [], 'a list whose week page was kept was offered it again');
});

test('NOT NOW HOLDS: a dismissed week offer is never answered again, that week or the next', async () => {
  const { penOn, add } = await shop();
  assert.equal(weekly(penOn(15)).length, 1);
  assert.deepEqual(weekly(penOn(15, ['week:orders'])), []);
  assert.deepEqual(weekly(penOn(18, ['week:orders'])), [], 'Not now came back days later');

  /* A NEW WEEK IS NOT A NEW OFFER: the next week has its own four due and Orders is still read, and Not now still holds. */
  add(NEXT_WEEK);
  assert.equal(weekly(penOn(22)).length, 1, 'the next week, undismissed, was not offered, so the line below proves nothing');
  assert.deepEqual(weekly(penOn(22, ['week:orders'])), [], 'Not now came back the next week');
});

test('THE FORTNIGHT IS THE RECORD\'S, NOT THE LIST\'S: Orders made on day 10 of an older record is offered on day 22', async () => {
  const { penOn } = await shop(3, { madeOn: 10, reads: [10, 14, 21], due: NEXT_WEEK });
  assert.equal(weekly(penOn(22)).length, 1, 'a list 12 days old on a record 22 days old was held to the list\'s own age');
});

test('THIS WEEK IS MONDAY TO SUNDAY: on a Sunday, four due the week after are not four due this week', async () => {
  const { penOn } = await shop(3, { due: NEXT_WEEK });
  assert.deepEqual(weekly(penOn(19)), [], 'a Sunday counted next week as this week');
});

test('OWED ASKS FOR A LIST THAT SAYS WHEN AN ENTRY IS FINISHED: with no done state, an empty sum is not drawn as owed', async () => {
  const { penOn } = await shop(3, { plain: true });
  const offer = weekly(penOn(15))[0];
  assert.ok(offer, 'Orders with no state was not offered its week');
  assert.deepEqual((offer.change.to.body as { blocks: { heading?: string }[] }).blocks.map((b) => b.heading), ['Due this week']);
});

test('A LIST READ ON TWO WEEKS IS NOT OFFERED ITS WEEK, since two weeks are not yet a habit', async () => {
  const { penOn } = await shop(2);
  assert.deepEqual(weekly(penOn(15)), []);
});

test('A LIST A PAGE ALREADY DRAWS BY THE WEEK IS NOT OFFERED ITS WEEK', async () => {
  const { api, penOn } = await shop();
  const page = {
    page: 'order-days',
    title: 'Order days',
    requires: ['register.orders'],
    blocks: [{ kind: 'calendar', heading: 'Orders', source: 'register.orders', columns: [{ field: 'what' }, { field: 'due' }], empty: 'No orders.' }],
  };
  value(await api.setDeclaration({ body: page, version: 0 }, owner));
  assert.deepEqual(weekly(penOn(15)), [], 'a list a calendar draws was offered a week page');
});

/* ── Mariam's shop, installed as onboarding installs it (`seed/test/shop-usecase.test.ts`) ─────────────────────────── */

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const state: Installed = {
    format: 1,
    primitives: 1,
    record_version: k.version(),
    packs: k.packs(),
    declarations: k.declarations() as Installed['declarations'],
    rows: k.census(),
    config: k.packSettings(),
  };
  const diff = await plan(pack, state);
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

test('MARIAM: HER SHOP\'S ORDERS, READ THROUGH ITS OWN PAGE ON THREE WEEKS, is offered its week with what runs low in Products', async () => {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const api = await createRecordApi({ sql, clock });
  const k = api.kernel as unknown as Kernel;
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'candles', name: 'Candles', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const shop = useCase('shop')!;
  const today = dayOf(BORN);
  for (const m of modulesFor(shop, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set(firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : [])));
    await put(k, moduleDocument(shop, m, { today, holds, examples: false }));
  }
  await put(k, carriedDocument(shop, today, 'I run a small candle shop.', { examples: false }));
  value(api.kernel.create('products', { name: 'Wax', left: 2 }, { actor: 'p_owner' }));
  for (const day of [0, 7, 13]) {
    clock.set(BORN + day * DAY);
    value(api.kernel.observe([{ kind: 'page.render', subject: 'orders' }]));
  }
  for (const [what, due] of [['3 vanilla jars', '2026-09-14'], ['6 amber jars', '2026-09-15'], ['Gift box', '2026-09-17'], ['Fig candle', '2026-09-18']])
    value(api.kernel.create('orders', { what, due }, { actor: 'p_owner' }));

  const nowMs = BORN + 15 * DAY;
  clock.set(nowMs);
  const pen = penFor({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(), use: { sql, nowMs } });
  const offer = weekly(pen)[0];
  assert.ok(offer, `Orders was not offered its week: ${JSON.stringify(pen.map((i) => i.id))}`);
  assert.equal(offer.why, 'Orders has 4 due this week. Give them a page of their own?');
  const body = offer.change.to.body as { nav: { section: string }; blocks: { kind: string; heading?: string; source?: string }[] };
  assert.equal(body.nav.section, 'Shop', 'the week page was not offered beside the Orders page');
  assert.deepEqual(body.blocks.map((b) => b.heading ?? b.kind), ['stat', 'Due this week', 'Owed', 'Running low']);
  assert.equal(body.blocks.at(-1)!.source, 'register.products');
});

test('RUNNING LOW IS NEVER DRAWN FROM A DATED LIST: a student\'s Assignments week holds no Study sessions by minutes', async () => {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const api = await createRecordApi({ sql, clock });
  const k = api.kernel as unknown as Kernel;
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'study', name: 'Study', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const student = useCase('student')!;
  const today = dayOf(BORN);
  for (const m of modulesFor(student, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set(firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : [])));
    await put(k, moduleDocument(student, m, { today, holds, examples: false }));
  }
  await put(k, carriedDocument(student, today, 'I study history.', { examples: false }));
  value(api.kernel.create('study_sessions', { what: 'Reading', on: '2026-09-02', minutes: 5 }, { actor: 'p_owner' }));
  for (const day of [0, 7, 13]) {
    clock.set(BORN + day * DAY);
    value(api.kernel.observe([{ kind: 'register.read', subject: 'assignments' }]));
  }
  for (const [i, due] of THIS_WEEK.entries()) value(api.kernel.create('assignments', { what: `Essay ${i + 1}`, due }, { actor: 'p_owner' }));

  const nowMs = BORN + 15 * DAY;
  clock.set(nowMs);
  const pen = penFor({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(), use: { sql, nowMs } });
  const offer = pen.find((i) => i.id === 'week:assignments');
  assert.ok(offer, `Assignments was not offered its week: ${JSON.stringify(pen.map((i) => i.id))}`);
  assert.equal(offer.why, 'Assignments has 4 due this week. Give them a page of their own?');
  const headings = (offer.change.to.body as { blocks: { heading?: string }[] }).blocks.map((b) => b.heading);
  assert.ok(!headings.includes('Running low'), `minutes were drawn as running low: ${JSON.stringify(headings)}`);
});
