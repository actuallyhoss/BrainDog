/**
 * The register screens' writes against the record: what goes out in the record's spelling, what comes back in the
 * screen's, and the three ways a write does not land (refused, conflict, unreachable).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { capturedFields, holdInPlace, outbound, rowSaid, rowWriter } from './rows-write.ts';
import { TITLES } from './held.ts';
import type { Fetch } from './row-live.ts';
import type { Entry } from './schema.ts';

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
  /* NAMED AS IT NOW STANDS, never by its handle. */
  assert.equal(out.fix, copy.writeConflict('“Rent, moved”'));
  assert.doesNotMatch(out.fix, /#/u);
  assert.equal(out.entry?.version, 9);
  assert.equal(out.entry?.fields.what, 'Rent, moved');
  assert.equal(out.entry?.fields.party, 3);
});

test('A WRITE SENTENCE NAMES THE ROW AS A PERSON READS IT: its title now, the name last walked, else "This bill or invoice", never its id', () => {
  assert.equal(rowSaid('obligations', 2, row({ fields: { what: '  Rent  ' } })), '“Rent”');
  /* NO ROW IN HAND: the name this tab walked for that number. */
  const had = TITLES.get('obligations');
  TITLES.set('obligations', new Map([[5, 'Insurance']]));
  try {
    assert.equal(rowSaid('obligations', 5), '“Insurance”');
    /* A ROW NOBODY NAMED is "This" and the list's own singular. */
    assert.equal(rowSaid('obligations', 2, row({ fields: { what: '' } })), 'This bill or invoice');
    assert.equal(rowSaid('obligations', 9), 'This bill or invoice');
  } finally {
    if (had === undefined) TITLES.delete('obligations');
    else TITLES.set('obligations', had);
  }
  /* A LIST THIS BUILD DOES NOT DECLARE says its id made singular, and a write with no row yet names the list. */
  assert.equal(rowSaid('course_notes', 3), 'This course note');
  assert.equal(rowSaid('obligations', null), 'Bills and invoices');
  for (const said of [rowSaid('obligations', 2), rowSaid('course_notes', 3), rowSaid('tasks', 9999)]) assert.doesNotMatch(said, /#|_/u);
});

test('a note the record raced names its row, not its handle', async () => {
  const { io } = host((url) => refs(url) ?? json(409, { ok: false, conflict: { version: 9, current: row({ version: 9 }), actor: 'p_2' } }));
  const out = await rowWriter(BASE, io).note('tasks', 9999, 'Rang them.');
  assert.deepEqual(out, { ok: false, why: 'refused', fix: copy.writeConflict('This task') });
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

/* A READ-SIDE REPAIR LANDED AND THE WRITE SIDE DID NOT KNOW ABOUT IT, so every edit of a `list<ref>`
   cell on a live row page came back `VALUE_MALFORMED: because[0] takes a row id or a spoken id`. The
   assertion is over a list because a single ref was already covered above: the pair is the point. */
test('a LIST of refs resolves element by element, exactly as a single ref does', () => {
  const idOf = new Map([
    [3, '01JBQ0000000000000000003'],
    [4, '01JBQ0000000000000000004'],
  ]);
  const refs = new Map([['things', { idOf, seqOf: new Map(), labelOf: new Map() }]]) as never;

  assert.deepEqual(outbound('people', { projects: [3, 4] }, refs), {
    projects: ['01JBQ0000000000000000003', '01JBQ0000000000000000004'],
  });
  assert.deepEqual(outbound('people', { projects: ['4'] }, refs), { projects: ['01JBQ0000000000000000004'] });
  /* One the map does not hold goes as it was, which is the single ref's own rule: the record names it
     rather than the browser guessing at it. */
  assert.deepEqual(outbound('people', { projects: [3, 9] }, refs), { projects: ['01JBQ0000000000000000003', 9] });
  assert.deepEqual(outbound('people', { projects: [] }, refs), { projects: [] });
});

test('archiving sets deleted_at at the version read, and restoring sends it back as null', async () => {
  const { io, sent } = host((url, body) => {
    const walked = refs(url);
    if (walked) return walked;
    const patch = (body?.patch ?? {}) as Record<string, unknown>;
    const version = Number(body?.version ?? 0) + 1;
    return json(200, { ok: true, value: row({ version, deleted_at: patch.deleted_at === null ? null : '2026-09-16T10:00:00.000Z' }) });
  });
  const writer = rowWriter(BASE, io);
  const gone = await writer.archive('obligations', 2, 7);
  assert.equal(gone.ok, true);
  if (!gone.ok) return;
  const [archived] = writes(sent);
  assert.equal(archived?.url.pathname, '/api/update');
  assert.equal(archived?.body?.version, 7);
  const patch = archived?.body?.patch as Record<string, unknown>;
  assert.deepEqual(Object.keys(patch), ['deleted_at']);
  assert.equal(typeof patch.deleted_at, 'string', 'an archive sends a deleted_at that is not null');
  assert.equal(gone.entry.version, 8);

  const back = await writer.restore('obligations', 2, gone.entry.version);
  assert.equal(back.ok, true);
  assert.deepEqual(writes(sent)[1]?.body, { register: 'obligations', seq: 2, patch: { deleted_at: null }, version: 8 });
});

test("an archive the record refuses is its own sentence, and a moved row comes back as it stands", async () => {
  const fix = 'Only somebody who can write to obligations can archive its rows.';
  const refused = host((url) => refs(url) ?? json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await rowWriter(BASE, refused.io).archive('obligations', 2, 7), { ok: false, why: 'refused', fix });

  const moved = host((url) => refs(url) ?? json(409, { ok: false, conflict: { version: 9, current: row({ version: 9 }), actor: 'p_2' } }));
  const out = await rowWriter(BASE, moved.io).restore('obligations', 2, 7);
  if (out.ok || out.why !== 'conflict') return assert.fail(`expected a conflict, got ${JSON.stringify(out)}`);
  assert.equal(out.entry?.version, 9);
});

test('a saved view is one page declaration over the list, with its filter, order and columns', async () => {
  const { io, sent } = host((url) => refs(url) ?? json(200, { ok: true, value: { id: 'page.x', version: 1 } }));
  const writer = rowWriter(BASE, io);
  const address = { filters: [{ field: 'state', op: 'in', values: ['open', 'part'] }, { field: 'party', op: 'in', values: ['3'] }], q: '', sort: { field: 'due', dir: 'asc' as const } };
  const out = await writer.saveView('obligations', 'Obligations: Status is open or part', address, ['what', 'due']);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.match(out.slug, /^obligations-[a-z0-9]+$/u);
  assert.equal(out.id, `page.${out.slug}`);
  const [saved] = writes(sent);
  assert.equal(saved?.url.pathname, '/api/setDeclaration');
  const body = saved?.body?.body as Record<string, unknown>;
  assert.equal(body.page, out.slug);
  assert.deepEqual(body.nav, { section: copy.viewsSection, order: 900 });
  assert.deepEqual(body.requires, ['register.obligations']);
  assert.deepEqual(body.blocks, [
    {
      kind: 'table',
      span: 12,
      source: 'register.obligations',
      where: { all: [{ field: 'state', in: ['open', 'part'] }, { field: 'party', is: PERSON }] },
      order: [{ field: 'due', dir: 'asc' }],
      columns: [{ field: 'what' }, { field: 'due' }],
      empty: copy.viewEmpty,
    },
  ]);

  assert.deepEqual(await writer.dropView(out.id), { ok: true });
  assert.equal(writes(sent)[1]?.url.pathname, '/api/retireDeclaration');
  assert.deepEqual(writes(sent)[1]?.body, { id: out.id });

  const fix = 'Only an owner can change what this record declares.';
  const refused = host((url) => refs(url) ?? json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await rowWriter(BASE, refused.io).saveView('obligations', 'x', address, []), { ok: false, why: 'refused', fix });
});

const entry = (seq: number, fields: Record<string, unknown> = {}): Entry => ({ seq, version: 1, created: '2026-09-01T09:00:00.000Z', by: 'you', fields: fields as Entry['fields'] });

test('a held row is drawn where it was, not where the answer now puts it', () => {
  const answer = [entry(9), entry(1), entry(2), entry(3)];
  /* The row was read at index 2 and the record has since moved it to the head. */
  const held = new Map([[3, { at: 2, entry: entry(3, { state: 'open' }) }]]);
  assert.deepEqual(holdInPlace(answer, held).map((e) => e.seq), [9, 1, 3, 2]);

  /* AND IT IS DRAWN FROM THE ANSWER, so a second write to a held row still shows. */
  const moved = [entry(3, { state: 'paid' }), entry(9), entry(1), entry(2)];
  const out = holdInPlace(moved, held);
  assert.deepEqual(out.map((e) => e.seq), [9, 1, 3, 2]);
  assert.equal(out[2]?.fields.state, 'paid');
});

test('a held row the answer has dropped comes back at its place, as it was', () => {
  /* THE FOLD CASE: reopened under `state is paid`, so the list it is in no longer matches it. */
  const held = new Map([[3, { at: 1, entry: entry(3, { state: 'open' }) }]]);
  const out = holdInPlace([entry(1), entry(2)], held);
  assert.deepEqual(out.map((e) => e.seq), [1, 3, 2]);
  assert.equal(out[1]?.fields.state, 'open');

  /* A hold taken past the end of a shorter answer is clamped rather than dropped. */
  assert.deepEqual(holdInPlace([], new Map([[3, { at: 40, entry: entry(3) }]])).map((e) => e.seq), [3]);
  /* Nothing held is the answer itself. */
  assert.deepEqual(holdInPlace([entry(1)], new Map()).map((e) => e.seq), [1]);
});

test('a typed line becomes a row the record accepts, and says what it filled in', () => {
  const at = Date.UTC(2026, 8, 3, 12);
  const out = capturedFields('obligations', 'Rent, September', [], at);
  /* Every required field the declaration names, and the title as typed. */
  assert.deepEqual(out.fields, {
    what: 'Rent, September',
    direction: 'owed_by_me',
    amount: { amount: 0, currency: 'GBP' },
    due: '2026-09-03',
    state: 'open',
  });
  /* SAID IN THE READER'S SPELLING, never the record's: `owed_by_me` is "owed by me". */
  /* AND AN AMOUNT AS A PERSON WRITES IT, never "amount GBP 0.00": with no home currency known here it is said by its own sign. */
  assert.deepEqual(out.filled, ['which way Money out', 'amount £0', 'due 3 Sep', 'status Open']);
});

test('the address answers what it already says, and is never guessed at from a set', () => {
  const at = Date.UTC(2026, 8, 3, 12);
  /* The bar writes `in`, a hand-written URL writes `is`, and both are one answer on screen. */
  for (const op of ['in', 'is']) {
    const out = capturedFields('obligations', 'Rent', [{ field: 'direction', op, values: ['owed to me'] }], at);
    assert.equal(out.fields.direction, 'owed_to_me', op);
    /* Inherited, so it is not in what the screen filled in on its own. */
    assert.ok(!out.filled.some((s) => s.startsWith('which way')), op);
  }
  /* TWO VALUES NAME A SET, and picking one of them would store a guess as if it had been said. */
  const set = capturedFields('obligations', 'Rent', [{ field: 'direction', op: 'in', values: ['owed to me', 'owed by me'] }], at);
  assert.equal(set.fields.direction, 'owed_by_me', 'the declaration answers it, not the chip');
  assert.ok(set.filled.some((s) => s.startsWith('which way')));
  /* The title is what the reader is typing, so a filter on it is never inherited. */
  assert.equal(capturedFields('obligations', 'Rent', [{ field: 'what', op: 'is', values: ['Rates'] }], at).fields.what, 'Rent');
});

test('what cannot be inferred is left for the record to refuse in its own words', () => {
  const at = Date.UTC(2026, 8, 3, 12);
  /* `updates` requires a ref and a document: there is no emptiest row in another register, and no emptiest prose. */
  const out = capturedFields('updates', 'Mastering pass landed', [], at);
  assert.ok(!('track' in out.fields), 'a required ref is not invented');
  assert.equal(out.fields.health, 'on_track');
  assert.equal(out.fields.at, new Date(at).toISOString());
  assert.ok(!out.filled.some((s) => s.startsWith('thread')));

  /* A register with one required enum beyond its title fills that and nothing else. */
  const task = capturedFields('tasks', 'Chase Halden', [], at);
  assert.deepEqual(task.fields, { what: 'Chase Halden', state: 'open' });
  assert.deepEqual(task.filled, ['status Open']);
});

test('the currency comes from the rows on screen, never from a guess', () => {
  const at = Date.UTC(2026, 8, 3, 12);
  const seen = [entry(1, { amount: { amount: 480_000, currency: 'EUR' } })];
  const out = capturedFields('obligations', 'Rent', [], at, seen);
  assert.deepEqual(out.fields.amount, { amount: 0, currency: 'EUR' });
  assert.ok(out.filled.includes('amount €0'), out.filled.join(', '));
});

test('both register screens write through this module', () => {
  for (const at of ['../../routes/r/[register]/+page.svelte', '../../routes/r/[register]/[seq]/+page.svelte']) {
    const page = readFileSync(new URL(at, import.meta.url), 'utf8');
    assert.match(page, /from '\$lib\/record\/rows-write\.ts'/u, at);
  }
});
