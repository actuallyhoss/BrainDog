/**
 * The widget sheet's one read and the widgets offered from use (`methods/widgets.ts`, `design-agent.ts` widget tier).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { widgetOffers, widgetsPaused, type WidgetSignal } from '../src/design-agent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';
import { existsSync, readFileSync } from 'node:fs';
import { shelfFromCatalogue } from '../src/catalogue-offers.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** The catalogue the web app ships, as a host hands it in: where an add-on not held yet says what it would bring. */
const CATALOGUE = new URL('../../../apps/web/static/catalogue/', import.meta.url);
const shelf = shelfFromCatalogue((path) => {
  const at = new URL(path, CATALOGUE);
  return existsSync(at) ? readFileSync(at, 'utf8') : null;
});

async function seeded() {
  const api = (await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW), catalogueShelf: shelf })) as unknown as Record<string, (a: unknown, c: CallContext) => Promise<{ ok: boolean; value: never }>> & { kernel: never };
  assert.ok((await installSeed(api.kernel)).ok);
  return api;
}

test('the gallery draws every widget the record can fill on its own data, and says what fills the rest', async () => {
  const api = await seeded();
  const out = await api.widgetGallery!({}, owner);
  assert.ok(out.ok);
  const widgets = (out.value as { widgets: { id: string; ready: boolean; need: string | null; reading: { figures?: { value: number | null }[] } | null }[] }).widgets;
  const cash = widgets.find((w) => w.id === 'cash-today')!;
  assert.equal(cash.ready, true);
  assert.equal(typeof cash.reading?.figures?.[0]?.value, 'number');
  const gold = widgets.find((w) => w.id === 'gold-price')!;
  assert.equal(gold.ready, false);
  assert.match(gold.need ?? '', /Investments/u);
});

test('a search narrows the gallery', async () => {
  const api = await seeded();
  const out = await api.widgetGallery!({ q: 'gold' }, owner);
  assert.deepEqual((out.value as { widgets: { id: string }[] }).widgets.map((w) => w.id), ['gold-price']);
});

test('Today carries the one widget offer, and none once one was answered today', async () => {
  const api = await seeded();
  const body = { page: 'today', title: 'Today', blocks: [{ kind: 'queue', key: 'needs-you', source: 'governance.open', limit: 5 }] };
  const first = await api.today!({ body, fresh: true }, owner);
  assert.ok(first.ok);
  assert.ok((first.value as { widget?: unknown }).widget !== undefined);
  const today = new Date(NOW).toISOString().slice(0, 10);
  await api.setPref!({ key: 'widgets.held', value: { notNow: [], last: today } }, owner);
  const cell = await api.widgetSuggest!({ cell: true }, owner);
  assert.deepEqual((cell.value as { offers: unknown[] }).offers, []);
});

const sig = (widget: string, signal: WidgetSignal['signal'], seen: string): WidgetSignal => ({ signal, widget, why: 'Because.', seen, draws: true });

test('a question asked again outranks a page opened often, and freshness halves a week on', () => {
  const held = { notNow: [], never: new Set<string>() };
  const ranked = widgetOffers([sig('cash-today', 'S2', '2026-10-29'), sig('spending', 'S1', '2026-10-29'), sig('net-worth', 'S1', '2026-10-15')], held, '2026-10-29', () => false);
  assert.deepEqual(ranked.map((r) => r.widget), ['spending', 'cash-today', 'net-worth']);
});

test('two Not nows inside a week pause offers for two weeks, and Never is final', () => {
  assert.equal(widgetsPaused({ notNow: ['widget:a@2026-10-20', 'widget:b@2026-10-24'] }, '2026-10-29'), true);
  assert.equal(widgetsPaused({ notNow: ['widget:a@2026-10-01', 'widget:b@2026-10-05'] }, '2026-10-29'), false);
  const never = widgetOffers([sig('cash-today', 'S1', '2026-10-29')], { notNow: [], never: new Set(['widget:cash-today']) }, '2026-10-29', () => false);
  assert.deepEqual(never, []);
});

test('a widget reading what Today already reads is on the board: the same list and filter, a figure, a tile it is alike', async () => {
  const { readsAsOnBoard } = await import('../src/methods/widgets.ts');
  const comingUp = { key: 'coming-up', source: 'deadlines', where: 'amount is set, day after -1d', empty: false };
  const bills = { kind: 'timeline', source: 'deadlines', where: 'day after -1d, day before +15d, direction is out' };
  /* The same list with another filter is another widget, unless the catalogue says it is alike. */
  assert.equal(readsAsOnBoard(bills, [comingUp]), false);
  assert.equal(readsAsOnBoard(bills, [comingUp], ['coming-up']), true);
  assert.equal(readsAsOnBoard({ kind: 'table', source: 'deadlines', where: 'day after -1d, amount is set' }, [comingUp]), true);
  const people = { kind: 'cards', source: 'register.people', where: 'in_touch before -90d' };
  assert.equal(readsAsOnBoard(people, [{ key: 'faces', source: 'register.people', where: 'self is not true', empty: false }]), false);
  assert.equal(readsAsOnBoard({ kind: 'stat', cells: [{ metric: 'spent-30d' }, { metric: 'cash-now' }] }, [{ key: 'c', metric: 'cash-now', empty: false }]), true);
});

test('one widget per thing: no two titles alike, the folded ones gone, and the sample rate in the record’s own money', async () => {
  const { exampleMoney } = await import('braindog-render');
  const api = await seeded();
  const out = await api.widgetGallery!({}, owner);
  const titles = (out.value as { widgets: { title: string }[] }).widgets.map((w) => w.title);
  assert.equal(new Set(titles).size, titles.length);
  /* 40, THE OWNER'S CALL OF 4 NOV: the sheet holds 34, 17 core and 17 from add-ons not held (Calendar, Gmail, Sentry, Weather
     and others), so it grows with the add-ons and not with core. Past 40 it wants folding, not a bigger number. */
  assert.ok(titles.length <= 40, `${titles.length} widgets`);
  for (const gone of ['Bills coming up', 'Cash today', 'Runway', 'Days in a row', 'Next trip']) assert.ok(!titles.includes(gone), gone);
  assert.ok(titles.includes('Cash ahead') && titles.includes('Coming up'));
  assert.equal(exampleMoney('¤fx', 'GBP'), '£1 = $1.27');
  assert.match(exampleMoney('¤fx', 'EGP'), /^\$1 = /u);
});

test('THE CORE OFFERS ONLY WHAT IT KEEPS ITSELF, and every other widget comes from where it is declared (SHL-A22)', async () => {
  const { WIDGETS } = await import('braindog-render');
  assert.deepEqual(WIDGETS.map((w) => w.id), ['needs-you', 'since-last', 'agents-working']);
  const api = await seeded();
  const out = await api.widgetGallery!({}, owner);
  const widgets = (out.value as { widgets: { id: string; addon: { id: string; name: string } | null; need: string | null; ready: boolean }[] }).widgets;
  const by = (id: string) => widgets.find((w) => w.id === id)!;
  /* MONEY'S, FROM THE BUILD: nobody's to add, so no add-on is named. */
  assert.equal(by('cash-today').addon, null);
  /* AN ADD-ON NOT HELD, FROM THE CATALOGUE: "Comes with" its catalogue name. */
  for (const [id, name] of [['savings-goal', 'Goals'], ['trip-countdown', 'Trips'], ['subscriptions', 'Subscriptions'], ['tax-aside', 'Tax set aside'], ['weather-today', 'Weather'], ['calendar-next', 'Calendar']] as const) {
    assert.equal(by(id).ready, false, id);
    assert.equal(by(id).need, `Comes with ${name}.`, id);
  }
  /* AND WITH NO CATALOGUE HANDED IN, an add-on not held brings nothing to the sheet, and the build's own are all there. */
  const bare = (await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) })) as unknown as Record<string, (a: unknown, c: CallContext) => Promise<{ ok: boolean; value: never }>> & { kernel: never };
  assert.ok((await installSeed(bare.kernel)).ok);
  const ids = ((await bare.widgetGallery!({}, owner)).value as { widgets: { id: string }[] }).widgets.map((w) => w.id);
  assert.ok(ids.includes('cash-today') && ids.includes('people-back') && ids.includes('next-up'));
  assert.ok(!ids.includes('gold-price'));
});

test('a question is matched to the widget whose declaration answers it, narrow words first', async () => {
  const { askedWidget, withShipped } = await import('braindog-render');
  const { SEED_WIDGETS } = await import('../../seed/src/index.ts');
  const all = withShipped(SEED_WIDGETS.map((s) => ({ by: { id: s.pack ?? s.usecase!, title: s.title }, widgets: s.widgets })));
  assert.equal(askedWidget('how long will my cash last', all), 'cash-today');
  assert.equal(askedWidget('what is my net worth', all), 'net-worth');
  assert.equal(askedWidget('how much did I spend', all), 'spending');
  assert.equal(askedWidget('what are the agents working on', all), 'agents-working');
  assert.equal(askedWidget('the moon', all), null);
});

test("Today's one cell is never a widget that would draw nothing: a blank reading passes to the next", async () => {
  const { blankReading } = await import('../src/methods/widgets.ts');
  assert.equal(blankReading({ count: 0, empty: 'Nothing yet.' }), true);
  assert.equal(blankReading({ figures: [], rows: [], count: 0, empty: null }), true);
  assert.equal(blankReading(undefined), false);
  assert.equal(blankReading({ rows: [{ title: 'Rent' } as never], count: 1, empty: null }), false);
  const api = await seeded();
  const cell = await api.widgetSuggest!({ cell: true }, owner);
  assert.ok(cell.ok);
  const offers = (cell.value as { offers: { remove?: unknown; reading?: never }[] }).offers;
  assert.ok(offers.length <= 1);
  for (const o of offers) assert.ok(o.remove !== undefined || !blankReading(o.reading));
});
