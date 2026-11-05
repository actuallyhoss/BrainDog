/**
 * `/auth/signup/read`: every way the reading door says no, and the one way it reads.
 *
 * THE READER IS A FAKE THAT COUNTS, and so are the bot check and the meter, so each refusal can be shown to have
 * stopped before the thing after it was asked. No model is called and no network is touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';
import {
  FIRST_READ_ADDRESS_SPENT, FIRST_READ_CATALOGUE_UNREAD, FIRST_READ_DAY_SPENT, FIRST_READ_NO_CATALOGUE, FIRST_READ_NOT_PERSON, FIRST_READ_OFF,
  firstReadCasesRead, firstReadClaims, firstReadOfferFrom, firstReadTold, serveFirstRead, type FirstReadCase, type FirstReadDoor, type FirstReadEntry,
} from '../src/first-read.ts';

const ORIGIN = 'https://braindog.example';
const SAID = `I'm ${PEOPLE[3]!.name} and I run ${PROJECTS[0]}, a small shop, with two people.`;
/* 2026-10-14 at 21:00 UTC, so the day the meter is handed is the UTC one even where it is already tomorrow. */
const NOW = Date.parse('2026-10-14T21:00:00Z');

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

function fakeDoor(over: Partial<FirstReadDoor> = {}, verdict: 'ok' | 'address' | 'day' = 'ok') {
  const seen = { checks: [] as [string, string][], takes: [] as [string, string][], reads: [] as { said: string; offer: unknown; today: string }[] };
  const door: FirstReadDoor = {
    origin: ORIGIN,
    on: true,
    botCheck: async (token, ip) => (seen.checks.push([token, ip]), token === 'good'),
    meter: { take: async (ip, day) => (seen.takes.push([ip, day]), verdict) },
    offer: async () => ({ usecases: [{ id: 'shop', title: 'A shop', summary: 'Orders and stock.' }] }),
    read: async (ask) => (seen.reads.push(ask), { ok: true, value: { usecase: 'shop', heard: ['a small shop'] } }),
    ...over,
  };
  return { door, seen };
}

function ask(body: unknown, init: { method?: string; origin?: string | null; type?: string; ip?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { 'content-type': init.type ?? 'application/json', ...(init.ip ?? { 'cf-connecting-ip': '203.0.113.7' }) };
  if (init.origin !== null) headers['origin'] = init.origin ?? ORIGIN;
  const method = init.method ?? 'POST';
  return new Request(`${ORIGIN}/auth/signup/read`, { method, headers, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}

const good = { said: SAID, today: '2026-10-14', zone: 'Africa/Cairo', locale: 'en-GB', turnstile: 'good' };

async function answer(res: Response): Promise<{ status: number; out: Answer }> {
  return { status: res.status, out: (await res.json()) as Answer };
}

test('a good reading: the reader is handed what she said, the offer and her day, and its value comes back', async () => {
  const { door, seen } = fakeDoor();
  const { status, out } = await answer(await serveFirstRead(ask(good), door, NOW));
  assert.equal(status, 200);
  assert.deepEqual(out, { ok: true, value: { usecase: 'shop', heard: ['a small shop'] } });
  assert.deepEqual(seen.reads, [{ said: SAID, offer: { usecases: [{ id: 'shop', title: 'A shop', summary: 'Orders and stock.' }] }, today: '2026-10-14' }]);
  assert.deepEqual(seen.checks, [['good', '203.0.113.7']]);
});

test('the meter is handed the address and the UTC day, from cf-connecting-ip or else the first forwarded hop', async () => {
  const { door, seen } = fakeDoor();
  await serveFirstRead(ask(good), door, Date.parse('2026-10-14T23:30:00Z'));
  await serveFirstRead(ask(good, { ip: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' } }), door, Date.parse('2026-10-15T00:10:00Z'));
  assert.deepEqual(seen.takes, [['203.0.113.7', '2026-10-14'], ['198.51.100.4', '2026-10-15']]);
});

test('the checks the sign-up doors make: POST, this origin, JSON, 8 KB', async () => {
  const { door, seen } = fakeDoor();
  const get = await serveFirstRead(ask(good, { method: 'GET' }), door, NOW);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal((await answer(await serveFirstRead(ask(good, { origin: 'https://elsewhere.example' }), door, NOW))).status, 403);
  assert.equal((await answer(await serveFirstRead(ask(good, { origin: null }), door, NOW))).status, 403);
  const typed = await answer(await serveFirstRead(ask(good, { type: 'text/plain' }), door, NOW));
  assert.equal(typed.status, 415);
  assert.equal(typed.out.refusal?.code, 'BODY_MALFORMED');
  const big = await answer(await serveFirstRead(ask({ ...good, zone: 'x'.repeat(9 * 1024) }), door, NOW));
  assert.equal(big.status, 413);
  assert.equal((await answer(await serveFirstRead(ask('{not json'), door, NOW))).status, 400);
  assert.equal(seen.reads.length + seen.checks.length + seen.takes.length, 0);
});

test('a key the door does not take is refused by its name', async () => {
  const { door, seen } = fakeDoor();
  const { status, out } = await answer(await serveFirstRead(ask({ ...good, email: 'a@b.example' }), door, NOW));
  assert.equal(status, 400);
  assert.equal(out.refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(out.refusal?.at, 'email');
  assert.match(out.refusal!.fix, /not email/);
  assert.equal(seen.reads.length, 0);
});

test('an empty sentence, a sentence too long and a day that is not a date are refused at their field', async () => {
  const { door } = fakeDoor();
  for (const [body, at] of [[{ ...good, said: '  ' }, 'said'], [{ ...good, said: 'a'.repeat(2001) }, 'said'], [{ ...good, today: 'Tuesday' }, 'today'], [{ ...good, zone: 3 }, 'zone']] as const) {
    const { status, out } = await answer(await serveFirstRead(ask(body), door, NOW));
    assert.equal(status, 400);
    assert.equal(out.refusal?.at, at);
  }
});

test('off, without a reader or without a bot check, the door answers 200 that it is off and simple rules read it', async () => {
  for (const over of [{ on: false }, { read: null }, { botCheck: null }] as Partial<FirstReadDoor>[]) {
    const { door, seen } = fakeDoor(over);
    const { status, out } = await answer(await serveFirstRead(ask(good), door, NOW));
    assert.equal(status, 200);
    assert.deepEqual(out.refusal, { code: 'NOT_IN_THIS_BUILD', fix: FIRST_READ_OFF });
    assert.equal(seen.reads.length + seen.takes.length, 0);
  }
});

test('a failed or missing bot check is a 403 before the meter is spent', async () => {
  for (const turnstile of ['bad', undefined]) {
    const { door, seen } = fakeDoor();
    const { status, out } = await answer(await serveFirstRead(ask({ ...good, turnstile }), door, NOW));
    assert.equal(status, 403);
    assert.equal(out.refusal?.fix, FIRST_READ_NOT_PERSON);
    assert.equal(out.refusal?.at, 'turnstile');
    assert.equal(seen.takes.length, 0);
  }
});

test('the meter says no for one address and for the whole day, with a wait until UTC midnight', async () => {
  for (const [verdict, fix] of [['address', FIRST_READ_ADDRESS_SPENT], ['day', FIRST_READ_DAY_SPENT]] as const) {
    const { door, seen } = fakeDoor({}, verdict);
    const res = await serveFirstRead(ask(good), door, NOW);
    assert.equal(res.headers.get('retry-after'), String(3 * 3600));
    const { status, out } = await answer(res);
    assert.equal(status, 429);
    assert.deepEqual(out.refusal, { code: 'RATE_LIMITED', fix });
    assert.equal(seen.reads.length, 0);
  }
});

test('a meter that cannot answer keeps the reader from being asked', async () => {
  const { door, seen } = fakeDoor({ meter: { take: async () => { throw new Error('down'); } } });
  const { status, out } = await answer(await serveFirstRead(ask(good), door, NOW));
  assert.equal(status, 503);
  assert.equal(out.refusal?.code, 'UNREACHABLE');
  assert.equal(seen.reads.length, 0);
});

test("the reader's own refusal comes back with its code kept, and a reader that throws is UNREACHABLE", async () => {
  for (const code of ['UNREACHABLE', 'PROPOSAL_SCHEMA', 'SLASH_BUDGET_SPENT']) {
    const { door } = fakeDoor({ read: async () => ({ ok: false, refusal: { code, fix: 'The model could not read it.' } }) });
    const { out } = await answer(await serveFirstRead(ask(good), door, NOW));
    assert.deepEqual(out, { ok: false, refusal: { code, fix: 'The model could not read it.' } });
  }
  const { door } = fakeDoor({ read: async (a) => { throw new Error(`could not read ${a.said}`); } });
  const { status, out } = await answer(await serveFirstRead(ask(good), door, NOW));
  assert.equal(status, 503);
  assert.equal(out.refusal?.code, 'UNREACHABLE');
  assert.doesNotMatch(JSON.stringify(out), new RegExp(PROJECTS[0]));
});

test('what she said is never printed and never put in a header', async (t) => {
  const printed: string[] = [];
  for (const name of ['log', 'info', 'warn', 'error', 'debug'] as const)
    t.mock.method(console, name, (...a: unknown[]) => void printed.push(a.map(String).join(' ')));
  const runs: Partial<FirstReadDoor>[] = [{}, { on: false }, { read: async (a) => { throw new Error(a.said); } }, { read: async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'Down.' } }) }];
  for (const over of runs) {
    const { door } = fakeDoor(over);
    const res = await serveFirstRead(ask(good), door, NOW);
    for (const [, v] of res.headers) assert.doesNotMatch(v, new RegExp(PROJECTS[0]));
  }
  assert.ok(printed.every((line) => !line.includes(SAID) && !line.includes(PROJECTS[0])), 'nothing printed carries the sentence');
});

/* ── the offer: the catalogue's use cases over the build's ─────────────────────────────────────────── */

/* Invented use cases, as a build and a catalogue might hold them. */
const BUILT: FirstReadCase[] = [
  { id: 'personal', title: 'Personal', summary: 'Your money and bills.', signals: ['money', 'rent', 'bills'], modules: ['money-core'] },
  { id: 'shop', title: 'Shop', summary: 'Orders and stock.', signals: ['shop', 'orders'], modules: ['people'] },
  { id: 'student', title: 'Student', summary: 'Courses and what is due.', signals: ['exam'], modules: [] },
];
const LANDLORD: FirstReadEntry = {
  kind: 'usecase', id: 'landlord', title: 'Landlord', summary: 'The flats you rent out and who rents each one.',
  signals: ['landlord', 'flats', 'rent out', 'rent', 'tenants'], modules: ['people', 'landlord'],
};
const SHOP_NEWER: FirstReadEntry = { kind: 'usecase', id: 'shop', title: 'Market stall', summary: 'What you sell and to whom.', signals: ['stall', 'shop'], modules: ['people'] };

test('THE MERGE: a catalogue front is offered with its signals, and the catalogue wins over the build by id', () => {
  const { cases, untitled } = firstReadOfferFrom([LANDLORD, SHOP_NEWER, { kind: 'pack', id: 'landlord-pack', title: 'An add-on' }], BUILT);
  assert.deepEqual(untitled, []);
  assert.deepEqual(cases.map((c) => c.id), ['landlord', 'shop', 'personal', 'student'], 'catalogue order, then the build, and no add-on');
  const landlord = cases.find((c) => c.id === 'landlord')!;
  assert.equal(landlord.title, 'Landlord');
  assert.deepEqual(landlord.signals, ['landlord', 'flats', 'rent out', 'rent', 'tenants']);
  assert.deepEqual(landlord.modules, ['people', 'landlord']);
  const shop = cases.find((c) => c.id === 'shop')!;
  assert.equal(shop.title, 'Market stall', "the catalogue's title won");
  assert.deepEqual(shop.signals, ['stall', 'shop']);
});

test('WHAT THE CATALOGUE LEAVES UNSAID IS THE BUILD’S: a summary, signals or modules it does not give', () => {
  const { cases } = firstReadOfferFrom([{ kind: 'usecase', id: 'personal', title: 'Your life' }], BUILT);
  const personal = cases.find((c) => c.id === 'personal')!;
  assert.equal(personal.title, 'Your life');
  assert.equal(personal.summary, 'Your money and bills.');
  assert.deepEqual(personal.signals, ['money', 'rent', 'bills']);
  assert.deepEqual(personal.modules, ['money-core']);
});

test('AN UNLISTED ENTRY IS LEFT OUT, built-in or not; one with no title is left out, said, and the build’s case stands', () => {
  const entries: FirstReadEntry[] = [
    { ...LANDLORD, unlisted: true },
    { kind: 'usecase', id: 'student', title: 'Student', unlisted: true },
    { kind: 'usecase', id: 'shop', title: '  ' },
    { kind: 'usecase', id: 'nameless', summary: 'Something.' },
    { kind: 'usecase', id: 'shop', title: 'A second shop' },
  ];
  const { cases, untitled } = firstReadOfferFrom(entries, BUILT);
  assert.deepEqual(cases.map((c) => c.id), ['personal', 'shop']);
  assert.equal(cases.find((c) => c.id === 'shop')!.title, 'Shop', 'a broken entry took away what the build offered, or a second entry counted');
  assert.deepEqual(untitled, ['shop', 'nameless']);
});

test('THE TIE-BREAK: two cases claiming one word stand in the catalogue’s order, and two reads never flip', () => {
  const entries = [LANDLORD, { kind: 'usecase', id: 'personal', title: 'Personal', signals: ['money', 'rent'] }];
  const first = firstReadOfferFrom(entries, BUILT);
  assert.deepEqual(firstReadClaims(first.cases).get('rent'), ['landlord', 'personal']);
  const flipped = firstReadOfferFrom([...entries].reverse(), BUILT);
  assert.deepEqual(firstReadClaims(flipped.cases).get('rent'), ['personal', 'landlord'], 'the index order is the order');
  for (let i = 0; i < 5; i += 1) assert.deepEqual(firstReadOfferFrom(entries, BUILT), first, 'one input read twice gave two offers');
});

test('WHAT THE MODEL IS TOLD carries the words a case is heard in', () => {
  const told = firstReadTold(firstReadOfferFrom([LANDLORD], []).cases[0]!);
  assert.equal(told.summary, 'The flats you rent out and who rents each one. Heard in: landlord, flats, rent out, rent, tenants.');
  assert.equal(firstReadTold({ ...BUILT[2]!, signals: [] }).summary, 'Courses and what is due.');
});

test('THE FALLBACK: no catalogue, or one that does not read, is the build’s list with one line said, never a throw', async () => {
  const none = await firstReadCasesRead(null, BUILT);
  assert.deepEqual(none.cases.map((c) => c.id), ['personal', 'shop', 'student']);
  assert.equal(none.said, FIRST_READ_NO_CATALOGUE);
  for (const broken of [async () => null, async () => Promise.reject(new Error('unreadable'))]) {
    const out = await firstReadCasesRead(broken, BUILT);
    assert.deepEqual(out.cases, BUILT);
    assert.equal(out.said, FIRST_READ_CATALOGUE_UNREAD);
  }
  const read = await firstReadCasesRead(async () => [LANDLORD, { kind: 'usecase', id: 'nameless' }], BUILT);
  assert.equal(read.cases[0]!.id, 'landlord');
  assert.match(read.said ?? '', /no title.*nameless/u);
  assert.equal((await firstReadCasesRead(async () => [LANDLORD], BUILT)).said, null);
});

test('AN ADDRESS THE HOST WORKED OUT BEATS A HEADER THE CALLER WROTE: a self-host does not count by x-forwarded-for it never trusted', async () => {
  const { door, seen } = fakeDoor();
  await serveFirstRead(ask(good, { ip: { 'x-forwarded-for': '198.51.100.4' } }), { ...door, ip: '203.0.113.9' }, NOW);
  assert.equal(seen.checks.at(-1)?.[1], '203.0.113.9');
});
