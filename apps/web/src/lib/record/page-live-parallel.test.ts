/**
 * A PAGE'S READS GO OUT TOGETHER. The reader asked the record about each list a page draws one after
 * another, then walked each linked list one after another, so a page of three lists waited six round trips before its
 * first block. These hold that every list's ask is out before the first one answers, that the page drawn is the page
 * the one-at-a-time reader drew, and that one list the record will not describe is said by its own block alone.
 *
 * The lists are invented: kites, each in a pond, and reeds, which this reader may never describe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { pageReader, type Fetch } from './page-live.ts';

const BASE = 'http://record.test';
const AT = Date.UTC(2026, 8, 15, 12);

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const tick = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));

const row = (register: string, seq: number, fields: Record<string, unknown>) => ({
  id: `01J${register.toUpperCase().padEnd(6, 'X')}${String(seq).padStart(17, '0')}`,
  register,
  seq,
  fields,
  state: null,
  version: 1,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-10T09:00:00.000Z',
  deleted_at: null,
});

const PONDS = [row('ponds', 1, { name: 'Mill pond' }), row('ponds', 2, { name: 'Heron pool' })];
const KITES = [row('kites', 1, { name: 'Red box kite', pond: PONDS[0]!.id }), row('kites', 2, { name: 'Long tail', pond: PONDS[1]!.id })];
const REEDS = [row('reeds', 1, { name: 'Bulrush' })];

const SCHEMAS: Record<string, unknown> = {
  kites: { id: 'kites', name: 'Kites', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'pond', type: 'ref', to: 'ponds' }] },
  ponds: { id: 'ponds', name: 'Ponds', title: 'name', fields: [{ id: 'name', type: 'text' }] },
};

const PAGE = {
  page: 'flying',
  title: 'Flying',
  blocks: [
    { kind: 'table', heading: 'Kites', source: 'register.kites', columns: [{ field: 'name' }, { field: 'pond' }], rows: KITES, matched: 2, refusals: [] },
    { kind: 'table', heading: 'Ponds', source: 'register.ponds', columns: [{ field: 'name' }], rows: PONDS, matched: 2, refusals: [] },
    { kind: 'table', heading: 'Reeds', source: 'register.reeds', columns: [{ field: 'name' }], rows: REEDS, matched: 1, refusals: [] },
  ],
};

/** The record over the three lists. Every answer comes a moment later; `serial` lets one call out at a time, and a list
 *  named in `late` answers last of all, so the answers land in another order than they were asked. */
function host(serial: boolean, late: readonly string[] = []) {
  const sent: string[] = [];
  let out = 0;
  let schemasOut = 0;
  let firstAnswered: number | null = null;
  let line: Promise<void> = Promise.resolve();
  const answer = async (url: URL): Promise<Response> => {
    const method = url.pathname.split('/').pop() ?? '';
    const register = url.searchParams.get('register') ?? '';
    sent.push(register ? `${method} ${register}` : method);
    if (method === 'schema') schemasOut += 1;
    await tick(late.includes(register) ? 20 : 2);
    if (method === 'schema') {
      firstAnswered ??= schemasOut;
      schemasOut -= 1;
      const decl = SCHEMAS[register];
      return decl ? json(200, { ok: true, value: decl }) : json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read reeds.' } });
    }
    if (method === 'page') return json(200, { ok: true, value: PAGE });
    if (method === 'list') return json(200, { ok: true, value: { rows: register === 'ponds' ? PONDS : register === 'kites' ? KITES : [], cursor: null } });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  };
  const io = (async (url: string | URL | Request) => {
    out += 1;
    try {
      if (!serial) return await answer(new URL(String(url)));
      const mine = line.then(() => answer(new URL(String(url))));
      line = mine.then(() => undefined, () => undefined);
      return await mine;
    } finally {
      out -= 1;
    }
  }) as Fetch;
  return { io, sent, inFlightAtFirstAnswer: () => firstAnswered, out: () => out };
}

/* A page reader learns into the tab's one copy of each list, so every test reads through a fresh reader. */
const read = (io: Fetch) => pageReader(BASE, io, () => AT).read('flying');

test('EVERY LIST THE PAGE NAMES IS ASKED ABOUT BEFORE THE FIRST ASK ANSWERS', async () => {
  const rec = host(false);
  const got = await read(rec.io);
  assert.equal(got.from, 'live');
  assert.deepEqual(
    rec.sent.filter((s) => s.startsWith('schema')).sort(),
    ['schema kites', 'schema ponds', 'schema reeds'],
    'each list is asked about once',
  );
  assert.equal(rec.inFlightAtFirstAnswer(), 3, 'all three asks were out when the first came back');
  assert.equal(rec.out(), 0);
});

test('THE PAGE DRAWN TOGETHER IS THE PAGE DRAWN ONE ASK AT A TIME', async () => {
  const one = host(true);
  const serial = await read(one.io);
  assert.equal(one.inFlightAtFirstAnswer(), 1, 'the serial record lets one ask out at a time');
  const together = await read(host(false).io);
  assert.equal(serial.from, 'live');
  assert.deepEqual(together, serial);
});

test('A LIST THE RECORD WILL NOT DESCRIBE IS SAID BY ITS OWN BLOCK, and the others draw with their linked names', async () => {
  const got = await read(host(false).io);
  assert.equal(got.from, 'live');
  if (got.from !== 'live') return;
  const [kites, ponds, reeds] = got.page.blocks;
  assert.equal(kites!.cannot, undefined);
  assert.equal(ponds!.cannot, undefined);
  const cells = kites!.rows.flatMap((r) => r.cells).join(' | ');
  assert.match(cells, /Red box kite/u);
  /* THE LINK WALK RAN: the pond is named, never its id. */
  assert.match(cells, /Mill pond/u);
  assert.doesNotMatch(cells, /01JPONDS/u);
  /* The reeds block says, in its own place, that it cannot be drawn; nothing else on the page is lost to it. */
  assert.equal(typeof reeds!.cannot, 'string');
  assert.equal(got.page.blocks.filter((b) => b.cannot !== undefined).length, 1);
});

test('ANSWERS THAT LAND OUT OF ORDER DRAW THE SAME PAGE, in the order the page names its blocks', async () => {
  const serial = await read(host(true).io);
  const shuffled = await read(host(false, ['kites', 'ponds']).io);
  assert.deepEqual(shuffled, serial);
  if (shuffled.from !== 'live') return;
  assert.deepEqual(shuffled.page.blocks.map((b) => b.heading), ['Kites', 'Ponds', 'Reeds']);
});

/* A LINKED LIST NO BLOCK DRAWS waited a round trip for its declaration and another for its rows. */
test("A LINKED LIST'S ROWS ARE ASKED FOR BESIDE ITS DECLARATION, and its rows are still named by it", async () => {
  const log: string[] = [];
  const page = { page: 'kites', title: 'Kites', blocks: [PAGE.blocks[0]] };
  const io = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    const method = u.pathname.split('/').pop() ?? '';
    const register = u.searchParams.get('register') ?? '';
    log.push(`ask ${method} ${register}`.trim());
    await tick();
    log.push(`answer ${method} ${register}`.trim());
    if (method === 'page') return json(200, { ok: true, value: page });
    if (method === 'schema') return json(200, { ok: true, value: SCHEMAS[register] });
    if (method === 'list') return json(200, { ok: true, value: { rows: register === 'ponds' ? PONDS : KITES, cursor: null } });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  const got = await pageReader(BASE, io, () => AT).read('kites');
  assert.equal(got.from, 'live');
  assert.ok(log.indexOf('ask list ponds') !== -1 && log.indexOf('ask schema ponds') !== -1, log.join(', '));
  assert.ok(log.indexOf('ask list ponds') < log.indexOf('answer schema ponds'), `the walk waited for the declaration: ${log.join(', ')}`);
  if (got.from !== 'live') return;
  assert.match(got.page.blocks[0]!.rows.flatMap((r) => r.cells).join(' | '), /Mill pond/u);
});
