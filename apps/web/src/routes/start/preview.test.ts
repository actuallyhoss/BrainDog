/**
 * The first run's preview draws only what the person gave it (`preview.ts`, USE-B07): the record is asked for no
 * examples, the rows laid over a page are the person's name, the entries their sentence filled and their file's first
 * entries, and a page none of those reaches is its name and one line of what it will hold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { USE_CASES } from '@braindog/seed/usecases';

import { changesAsked, draftAsked, mappedOf, ownRows, pageShown, readsOf, withOwn } from './preview.ts';

const today = '2026-10-15';

test('changesAsked asks the record for no examples, for any use case or module', () => {
  for (const u of USE_CASES) {
    for (const a of changesAsked([u], u.modules, today)) assert.deepEqual(a.rows, {}, `${u.usecase} asks no rows`);
  }
  for (const a of changesAsked([], ['people', 'money'], today)) assert.deepEqual(a.rows, {});
});

test('a drafted change carries its lists and pages and never the sample rows Slash wrote', () => {
  const to = { declarations: [{ id: 'register.kilns', kind: 'register', body: { register: 'kilns' } }] };
  assert.deepEqual(draftAsked({ change: { to }, rows: { kilns: [{ name: 'Invented kiln' }] } } as never), { to });
});

test('ownRows answers the name, the typed entries and the mapped file entries, and nothing else', () => {
  const typed = [{ register: 'invoices', fields: { what: 'Monthly invoice to Quillby Studio', amount: { minor: 200000, currency: 'GBP' } } }];
  const mapped = { tasks: [{ title: 'Glaze the Tuesday batch' }, { title: 'Order more clay' }] };
  const out = ownRows(typed, mapped, 'Wren Ashdown');
  assert.deepEqual(out, {
    people: [{ name: 'Wren Ashdown' }],
    invoices: [typed[0]?.fields],
    tasks: mapped.tasks,
  });
});

test('ownRows answers nothing for a build with nothing typed, no file and no name', () => {
  assert.deepEqual(ownRows([], {}, null), {});
  assert.deepEqual(ownRows([{ register: 'tasks', fields: {} }], {}, '  '), {});
});

test('the name is not drawn twice when the sentence already made their People entry', () => {
  const out = ownRows([{ register: 'people', fields: { name: 'Odile Brannock', role: 'potter' } }], {}, 'Odile Brannock');
  assert.deepEqual(out.people, [{ name: 'Odile Brannock', role: 'potter' }]);
});

test('ownRows keeps within a list\'s ceiling', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `Step ${i + 1}` }));
  assert.equal(ownRows([], { tasks: many }, null).tasks?.length, 20);
});

test('every call drawn over a use case carries only the person\'s own rows', () => {
  const u = USE_CASES.find((c) => c.modules.includes('people'));
  assert.ok(u);
  const asked = changesAsked([u], u.modules, today);
  const own = ownRows([], mappedOf(asked), 'Tamsin Holloway');
  assert.deepEqual(own, { people: [{ name: 'Tamsin Holloway' }] });
  const sent = withOwn(asked, own);
  for (const call of sent) {
    for (const [list, rows] of Object.entries(call.rows as Record<string, unknown[]>)) {
      assert.equal(list, 'people');
      assert.deepEqual(rows, [{ name: 'Tamsin Holloway' }]);
    }
  }
  const withPeople = sent.find((c) => readsOf(c, 'people').length > 0);
  assert.ok(withPeople, 'the People page is asked for');
  const shown = pageShown('People', readsOf(withPeople, 'people'), own);
  assert.deepEqual(shown, { drawn: true, title: 'People', rows: { people: [{ name: 'Tamsin Holloway' }] } });
});

test('an empty build answers each page as its name and one line of what it will hold', () => {
  const u = USE_CASES.find((c) => c.modules.includes('people'));
  assert.ok(u);
  const asked = withOwn(changesAsked([u], u.modules, today), ownRows([], {}, null));
  const call = asked.find((c) => readsOf(c, 'people').length > 0);
  assert.ok(call);
  const shown = pageShown('People', readsOf(call, 'people'), {});
  assert.equal(shown.drawn, false);
  assert.equal(shown.title, 'People');
  assert.ok(!shown.drawn && /^It will hold .+\.$/u.test(shown.line), 'one line in the list\'s own words');
  assert.ok(!shown.drawn && !shown.line.includes('—'), 'no em dash');
  assert.deepEqual(pageShown('Calendar', [], {}), { drawn: false, title: 'Calendar', line: 'Empty until you add to it.' });
});

test('the preview no longer reads the examples line', () => {
  const svelte = readFileSync(new URL('./PagesPreview.svelte', import.meta.url), 'utf8');
  assert.ok(!svelte.includes('mineExamples'));
  const ts = readFileSync(new URL('./preview.ts', import.meta.url), 'utf8');
  assert.ok(!/examples:\s*true/u.test(ts));
});
