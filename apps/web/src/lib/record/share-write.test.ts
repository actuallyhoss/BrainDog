/**
 * The read-only link's own reads, held without a browser: whether this BrainDog makes links at all, and the page a link
 * opens as the reader narrows it. The Share sheet draws "Share a read-only link" only on a yes, so a no must carry a
 * sentence; and the page a stranger reads keeps every amount with its own currency and never a `{{path}}`'s braces.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClient } from '@braindog/client';

import { blockShared, filled, readShared, readShareable, SHARES_OFF } from './share-write.ts';

/** A client whose `call` answers one thing, and says which method it was asked. */
const answering = (out: unknown, asked: string[] = []) => ({
  call: async <T,>(name: string) => {
    asked.push(name);
    return out as { ok: true; value: T };
  },
});

test('readShareable asks shareable and draws the press on yes', async () => {
  const asked: string[] = [];
  assert.deepEqual(await readShareable(answering({ ok: true, value: { can: true } }, asked)), { can: true });
  assert.deepEqual(asked, ['shareable']);
});

test('readShareable on no carries the host sentence, or the record sentence when it said none', async () => {
  const said = 'Links are off on this BrainDog until its owner switches them on.';
  assert.deepEqual(await readShareable(answering({ ok: true, value: { can: false, why: said } })), { can: false, why: said });
  assert.deepEqual(await readShareable(answering({ ok: true, value: { can: false } })), { can: false, why: SHARES_OFF });
  assert.deepEqual(await readShareable(answering({ ok: true, value: 'yes' })), { can: false, why: SHARES_OFF });
});

test('readShareable on a refusal is a no in the refusal sentence, and a host with no such method is links off', async () => {
  const member = { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner of Hollow Pine Bakery can do this.' } };
  assert.deepEqual(await readShareable(answering(member)), { can: false, why: 'Only an owner of Hollow Pine Bakery can do this.' });
  const old = { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called shareable.' } };
  assert.deepEqual(await readShareable(answering(old)), { can: false, why: SHARES_OFF });
});

test('readShareable goes through the real client to /api/shareable', async () => {
  const urls: string[] = [];
  const io = async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ ok: true, value: { can: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createClient({ base: 'https://bakery.example', fetch: io as typeof fetch });
  assert.deepEqual(await readShareable(client), { can: true });
  assert.equal(new URL(urls[0]!).pathname, '/api/shareable');
});

test('a token with nothing to fill prints nothing, never its braces', () => {
  assert.equal(filled('Orders for {{ month }}', {}), 'Orders for');
  assert.equal(filled('{{owner}} is away {{ until }} this week', { until: 'Friday' }), 'is away Friday this week');
  assert.equal(filled('{{nothing}}', {}), null);
  assert.equal(filled('{{}} left', {}), 'left');
  assert.equal(filled('Rye  first,\n  then spelt', {}), 'Rye  first,\n  then spelt');
  const b = blockShared({ kind: 'text', heading: 'Bakes for {{ season }}', body: 'Ask {{who}} first.', values: { who: { id: 'x' } } });
  assert.equal(b.heading, 'Bakes for');
  assert.equal(b.body, 'Ask first.');
  assert.ok(!JSON.stringify(b).includes('{{'));
});

test('a money cell keeps its currency, whole, in minor units', () => {
  const b = blockShared({
    kind: 'table',
    columns: [{ field: 'total', label: 'Total', sign: { field: 'way', minus: 'out' } }],
    rows: [
      { cells: { total: { type: 'money', value: { amount: 123450, currency: 'EGP' } }, way: { type: 'enum', value: 'out', label: 'Paid out' } }, fields: {}, state: null },
      { cells: { total: { type: 'money', value: { amount: 999, currency: 'GBP' } } }, state: 'done' },
    ],
  });
  assert.deepEqual(b.rows[0]!.cells.total, { type: 'money', value: { amount: 123450, currency: 'EGP' } });
  assert.deepEqual(b.rows[0]!.cells.way, { type: 'enum', value: 'out', label: 'Paid out' });
  assert.deepEqual(b.rows[1]!.cells.total!.value, { amount: 999, currency: 'GBP' });
  assert.deepEqual(b.columns[0], { field: 'total', label: 'Total', sign: { field: 'way', minus: 'out' } });
});

test('a shared page carries the record language and zone, and an odd one reads as en and UTC', async () => {
  const page = (body: unknown) => async () => new Response(JSON.stringify({ ok: true, value: body }), { status: 200, headers: { 'content-type': 'application/json' } });
  const base = { title: 'Weekly bakes', expires_at: '2026-11-14T00:00:00.000Z', read_at: null, blocks: [] };
  const live = await readShared('https://bakery.example', 'tok', page({ ...base, language: 'fr-FR', zone: 'Europe/Paris', empty: 'This page has nothing a link can show.' }));
  assert.equal(live.from, 'live');
  if (live.from !== 'live') return;
  assert.equal(live.page.language, 'fr-FR');
  assert.equal(live.page.zone, 'Europe/Paris');
  assert.equal(live.page.empty, 'This page has nothing a link can show.');
  const odd = await readShared('https://bakery.example', 'tok', page({ ...base, language: 'not a tag!', zone: 'Mars/Olympus' }));
  assert.ok(odd.from === 'live' && odd.page.language === 'en' && odd.page.zone === 'UTC' && odd.page.empty === null);
});

test('a link that does not open is one answer, shut', async () => {
  const gone = async () => new Response('', { status: 404 });
  assert.deepEqual(await readShared('https://bakery.example', 'tok', gone), { from: 'shut' });
  assert.deepEqual(await readShared('https://bakery.example', '', gone), { from: 'shut' });
});

test('a figure keeps its trend, a point that is not a number a gap, and one with no points none', () => {
  const b = blockShared({
    kind: 'stat',
    readings: [
      { metric: 'cash', label: 'Cash', reading: { value: 8_000_00, unit: 'EGP' }, trend: [7_000_00, null, 7_500_00, 'x', 8_000_00] },
      { metric: 'loaves', label: 'Loaves', reading: { value: 12, unit: null }, trend: [null, null] },
      { metric: 'orders', reading: { value: 3, unit: null } },
    ],
  });
  assert.deepEqual(b.readings[0]?.trend, [7_000_00, null, 7_500_00, null, 8_000_00]);
  assert.equal(b.readings[1]?.trend, undefined);
  assert.equal(b.readings[2]?.trend, undefined);
});

test('A HOST THAT MAKES NO LINKS IS SAID AS COMING, and a sentence for this person is not (AH12)', async () => {
  const { linksOff, words } = await import('./share-write.ts');
  assert.equal(linksOff({ can: false, why: SHARES_OFF }), true);
  assert.equal(linksOff({ can: false }), true);
  assert.equal(linksOff({ can: false, why: 'Only an owner of Hollow Pine Bakery can do this.' }), false);
  assert.equal(linksOff({ can: true }), false);
  assert.equal(words.shareComing, 'Read-only links are coming.');
});
