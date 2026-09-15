/**
 * One row against the record: the live row drawn with its refs as numbers, the sample when there is
 * no record, the record's sentence for any other refusal, a row the record does not hold as no row,
 * and nothing sent for a pending one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ROWS } from './api.ts';
import { rowReader, type Fetch } from './row-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that answers by path, and remembers what it was sent. */
function host(answer: ((url: URL) => Response) | null): { io: Fetch; sent: URL[] } {
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    sent.push(at);
    if (!answer) throw new TypeError('fetch failed');
    return answer(at);
  }) as Fetch;
  return { io, sent };
}

const sampleFields = ROWS.services!.find((e) => e.seq === 2)!.fields;

const record = (url: URL): Response => {
  if (url.pathname === '/api/get')
    return json(200, {
      ok: true,
      value:
        url.searchParams.get('seq') === '99'
          ? null
          : {
              id: '01JROW0000000000000000000',
              register: 'services',
              seq: Number(url.searchParams.get('seq')),
              fields: { ...sampleFields, thing: '01JTHING000000000000000000' },
              state: null,
              version: 7,
              created_at: '2026-09-01T09:00:00.000Z',
              updated_at: '2026-09-10T09:00:00.000Z',
              deleted_at: null,
            },
    });
  if (url.pathname === '/api/list' && url.searchParams.get('register') === 'things')
    return json(200, { ok: true, value: { rows: [{ id: '01JTHING000000000000000000', seq: 4 }], cursor: null, matched: 1 } });
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
};

test("the record's row is drawn, with a ref as the number a person says", async () => {
  const { io, sent } = host(record);
  const reader = rowReader(BASE, io);
  const out = await reader.read('services', 2);
  assert.equal(out.from, 'live');
  assert.ok(out.entry);
  assert.equal(out.entry.seq, 2);
  assert.equal(out.entry.version, 7);
  assert.equal(out.entry.created, '2026-09-01T09:00:00.000Z');
  assert.equal(out.entry.fields.thing, 4);
  assert.equal(sent[0]!.pathname, '/api/get');
  assert.equal(sent[0]!.searchParams.get('register'), 'services');
  assert.equal(sent[0]!.searchParams.get('seq'), '2');

  /* THE REF MAP IS KEPT, so a second row asks for itself and nothing more. */
  const before = sent.length;
  await reader.read('services', 3);
  assert.equal(sent.length, before + 1);
});

test('a row the record does not hold is no row, not the sample row of that number', async () => {
  const { io } = host(record);
  assert.deepEqual(await rowReader(BASE, io).read('services', 99), { from: 'live', entry: null });
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } })],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`the sample is read when ${what}`, async () => {
    const { io } = host(answer);
    assert.deepEqual(await rowReader(BASE, io).read('services', 2), { from: 'sample' });
  });

test("any other refusal is the record's own sentence", async () => {
  const fix = 'This key may not read services.';
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await rowReader(BASE, io).read('services', 2), { from: 'refused', fix });
});

test('a pending row sends nothing', async () => {
  const { io, sent } = host(record);
  for (const seq of [-1, 0, Number.NaN]) assert.deepEqual(await rowReader(BASE, io).read('services', seq), { from: 'sample' });
  assert.equal(sent.length, 0);
});

test('the row page draws the live row, its refusal, and no sample backlinks when live', () => {
  const page = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\$lib\/record\/row-live\.ts'/u);
  /* THE SAMPLE'S BACKLINKS ARE STILL THE SAMPLE'S, and a live row now draws the record's own. The
     live groups win where there are any, because on a record the sample's would be another record's
     rows pointing at this one. */
  assert.match(page, /const incoming = \$derived\(\s*linked\?\.from === 'live' \? linked\.groups : row && !live \? backlinks\(id, seq\) : \[\],?\s*\)/u);
  assert.match(page, /\{:else if got\?\.from === 'refused'\}/u);
  assert.match(page, /title=\{got\.fix\}/u);
  assert.match(page, /got\?\.from === 'live' \? \(got\.entry \?\? undefined\)/u, 'a live row that is not there falls back to the sample again');
});
