/**
 * The widget sheet's one read and the widgets offered from use (`methods/widgets.ts`, `design-agent.ts` widget tier).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { widgetOffers, widgetsPaused, type WidgetSignal } from '../src/design-agent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

async function seeded() {
  const api = (await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) })) as unknown as Record<string, (a: unknown, c: CallContext) => Promise<{ ok: boolean; value: never }>> & { kernel: never };
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
  const { WIDGETS, exampleMoney } = await import('braindog-render');
  const titles = WIDGETS.map((w) => w.title);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(WIDGETS.length <= 27, `${WIDGETS.length} widgets`);
  for (const gone of ['Bills coming up', 'Cash today', 'Runway', 'Days in a row', 'Next trip']) assert.ok(!titles.includes(gone), gone);
  assert.ok(titles.includes('Cash ahead') && titles.includes('Coming up'));
  assert.equal(exampleMoney('¤fx', 'GBP'), '£1 = $1.27');
  assert.match(exampleMoney('¤fx', 'EGP'), /^\$1 = /u);
});
