/**
 * The register screens' writes against the record: what goes out in the record's spelling, what comes back in the
 * screen's, and the three ways a write does not land (refused, conflict, unreachable).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { copy } from '../copy.ts';
import { outbound, rowWriter } from './rows-write.ts';
import type { Fetch } from './row-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { url: URL; method: string; body: Record<string, unknown> | null };

function host(answer: ((url: URL, body: Record<string, unknown> | null) => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    sent.push({ url: at, method: init?.method ?? 'GET', body });
    if (!answer) throw new TypeError('fetch failed');
    return answer(at, body);
  }) as Fetch;
  return { io, sent };
}

const PERSON = '01JPERSON00000000000000003';
const THING = '01JTHING000000000000000004';

const row = (over: Record<string, unknown> = {}) => ({
  id: '01JROW0000000000000000000',
  register: 'obligations',
  seq: 2,
  fields: { what: 'Rent', direction: 'owed_to_me', party: PERSON, thing: THING, state: 'open' },
  state: null,
  version: 7,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-10T09:00:00.000Z',
  deleted_at: null,
  ...over,
});

/** The ref walks every write makes first, answered from two tiny registers. */
const refs = (url: URL): Response | null => {
  if (url.pathname !== '/api/list') return null;
  const register = url.searchParams.get('register');
  if (register === 'people') return json(200, { ok: true, value: { rows: [{ id: PERSON, seq: 3 }], cursor: null, matched: 1 } });
  if (register === 'things') return json(200, { ok: true, value: { rows: [{ id: THING, seq: 4 }], cursor: null, matched: 1 } });
  return json(200, { ok: true, value: { rows: [], cursor: null, matched: 0 } });
};

const writes = (sent: Sent[]) => sent.filter((s) => s.method === 'POST');

test('a new row goes out in the record spelling and comes back with its refs as numbers', async () => {
  const { io, sent } = host((url, body) => {
    const walked = refs(url);
    if (walked) return walked;
    const fields = (body?.fields ?? {}) as Record<string, unknown>;
    return json(200, { ok: true, value: row({ seq: 40, version: 1, fields }) });
  });
  const out = await rowWriter(BASE, io).create('obligations', { what: 'Rent', direction: 'owed to me', party: 3, thing: '4' });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.entry.seq, 40);
  assert.equal(out.entry.fields.party, 3);
  assert.equal(out.entry.fields.thing, 4);
  const [sentCreate] = writes(sent);
  assert.equal(sentCreate?.url.pathname, '/api/create');
  assert.deepEqual(sentCreate?.body, {
    register: 'obligations',
    fields: { what: 'Rent', direction: 'owed_to_me', party: PERSON, thing: THING },
  });
});

test('a number the kept map lacks walks that map again, so a row added since goes as its id', async () => {
  const LATER = '01JPERSON00000000000000005';
  const people = [{ id: PERSON, seq: 3 }];
  const { io, sent } = host((url, body) => {
    if (url.pathname === '/api/list' && url.searchParams.get('register') === 'people')
      return json(200, { ok: true, value: { rows: people, cursor: null, matched: people.length } });
    const walked = refs(url);
    if (walked) return walked;
    return json(200, { ok: true, value: row({ seq: 41, version: 1, fields: (body?.fields ?? {}) as Record<string, unknown> }) });
  });
  const writer = rowWriter(BASE, io);
  assert.equal((await writer.create('obligations', { what: 'Rent', party: 3 })).ok, true);
  people.push({ id: LATER, seq: 5 });
  assert.equal((await writer.create('obligations', { what: 'Rates', party: 5 })).ok, true);
  const second = writes(sent)[1];
  assert.equal((second?.body?.fields as Record<string, unknown> | undefined)?.party, LATER);
});

test('a change sends the patch and the version it was read at, and the row comes back as it now stands', async () => {
  const { io, sent } = host((url) => refs(url) ?? json(200, { ok: true, value: row({ version: 8, fields: { ...row().fields, state: 'paid' } }) }));
  const writer = rowWriter(BASE, io);
  const out = await writer.update('obligations', 2, { state: 'paid' }, 7);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.entry.version, 8);
  assert.equal(out.entry.fields.state, 'paid');
  assert.deepEqual(writes(sent)[0]?.body, { register: 'obligations', seq: 2, patch: { state: 'paid' }, version: 7 });

  /* THE REF MAPS ARE KEPT, so a second write walks nothing. */
  const before = sent.length;
  await writer.update('obligations', 2, { what: 'Rent, September' }, 8);
  assert.equal(sent.length, before + 1);
});

test("a refusal is the record's own sentence", async () => {
  const fix = 'An obligation needs a due date.';
  const { io } = host((url) => refs(url) ?? json(422, { ok: false, refusal: { code: 'REQUIRED_MISSING', fix } }));
  assert.deepEqual(await rowWriter(BASE, io).create('obligations', { what: 'Rent' }), { ok: false, why: 'refused', fix });
  assert.deepEqual(await rowWriter(BASE, io).update('obligations', 2, { due: null }, 7), { ok: false, why: 'refused', fix });
});

test('a conflict hands back the row as it now stands, and says so', async () => {
  const { io } = host(
    (url) =>
      refs(url) ??
      json(409, { ok: false, conflict: { version: 9, current: row({ version: 9, fields: { ...row().fields, what: 'Rent, moved' } }), actor: 'p_2' } }),
  );
  const out = await rowWriter(BASE, io).update('obligations', 2, { what: 'Rent, mine' }, 7);
  assert.equal(out.ok, false);
  if (out.ok || out.why !== 'conflict') return assert.fail(`expected a conflict, got ${JSON.stringify(out)}`);
  assert.equal(out.fix, copy.writeConflict('obligations#2'));
  assert.equal(out.entry?.version, 9);
  assert.equal(out.entry?.fields.what, 'Rent, moved');
  assert.equal(out.entry?.fields.party, 3);
});

test('a stale refusal with no row reads the row again', async () => {
  const { io, sent } = host((url) => {
    if (url.pathname === '/api/get') return json(200, { ok: true, value: row({ version: 10 }) });
    return refs(url) ?? json(409, { ok: false, refusal: { code: 'VERSION_STALE', fix: 'The row moved.' } });
  });
  const out = await rowWriter(BASE, io).update('obligations', 2, { state: 'paid' }, 7);
  if (out.ok || out.why !== 'conflict') return assert.fail(`expected a conflict, got ${JSON.stringify(out)}`);
  assert.equal(out.entry?.version, 10);
  assert.ok(sent.some((s) => s.url.pathname === '/api/get'));
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`a write is not reached when ${what}, and says so calmly`, async () => {
    const { io } = host(answer);
    assert.deepEqual(await rowWriter(BASE, io).update('obligations', 2, { state: 'paid' }, 7), {
      ok: false,
      why: 'unreachable',
      fix: copy.writeNotReached,
    });
    assert.deepEqual(await rowWriter(BASE, io).note('obligations', 2, 'Called them.'), { ok: false, why: 'unreachable', fix: copy.writeNotReached });
  });

test('a note is a log against the row, and its refusal is the record sentence', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: null }));
  assert.deepEqual(await rowWriter(BASE, io).note('obligations', 2, 'Called them.'), { ok: true });
  assert.equal(sent[0]?.url.pathname, '/api/log');
  assert.deepEqual(sent[0]?.body, { register: 'obligations', seq: 2, note: 'Called them.' });

  const fix = 'A note is at most 280 characters, and this one is 300.';
  const refused = host(() => json(422, { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix } }));
  assert.deepEqual(await rowWriter(BASE, refused.io).note('obligations', 2, 'x'.repeat(300)), { ok: false, why: 'refused', fix });
});

test('a number typed into a box goes as a number, an emptied box as null, and a ref the map lacks as it was', () => {
  const none = new Map();
  assert.deepEqual(outbound('things', { hue: '271' }, none), { hue: 271 });
  assert.deepEqual(outbound('things', { hue: 'lots' }, none), { hue: 'lots' });
  assert.deepEqual(outbound('obligations', { due: '' }, none), { due: null });
  assert.deepEqual(outbound('obligations', { party: 12 }, none), { party: 12 });
});

test('both register screens write through this module', () => {
  for (const at of ['../../routes/r/[register]/+page.svelte', '../../routes/r/[register]/[seq]/+page.svelte']) {
    const page = readFileSync(new URL(at, import.meta.url), 'utf8');
    assert.match(page, /from '\$lib\/record\/rows-write\.ts'/u, at);
  }
});
