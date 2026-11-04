/**
 * A saved view against the record: the record's own view and rows, a refusal when there is no
 * record, the record's sentence for a view it does not hold and for a filter it cannot read, the
 * URL's extra clauses ANDed on, and no printed predicate where the chips cannot say one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import './fixtures/fill.ts';
import { REGISTERS, columnsFor } from './api.ts';
import { ROWS, VIEWS } from './fixtures/sample.ts';
import { addressOf, clausesOf, keptColumns, viewReader, type Fetch } from './views-live.ts';

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

const THING = '01JTHING000000000000000000';

const row = (seq: number) => ({
  id: `01JROW00000000000000000${seq}`,
  register: 'services',
  seq,
  fields: { ...sampleFields, thing: THING },
  state: null,
  version: 3,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-10T09:00:00.000Z',
  deleted_at: null,
});

/**
 * THE RECORD'S `services.lapsing` IS NOT THE SAMPLE'S, on purpose.
 *
 * The sample calls it Lapsing and filters `state is lapsing`; this record calls it Winding down and
 * filters on two clauses. The only way to see which record a view came from is to make the two
 * records disagree about what the same key holds, which is the trick `row-live.test.ts` plays with
 * Kiln and Tallow.
 */
const SAVED = {
  register: 'services',
  id: 'lapsing',
  name: 'Winding down',
  filter: { all: [{ field: 'state', is: 'lapsing' }, { field: 'cycle', in: ['monthly', 'yearly'] }] },
  search: null,
  order: [{ field: 'renews', dir: 'asc' }],
  columns: [],
  created_by: 'person_1',
  created_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-09-01T09:00:00.000Z',
};

/** The record, with the view, its two rows, the whole list's size, and one named ref. */
const record = (url: URL): Response => {
  if (url.pathname === '/api/view') return json(200, { ok: true, value: SAVED });
  if (url.pathname === '/api/list' && url.searchParams.get('register') === 'things')
    /* `Kiln`, WHERE THE SAMPLE'S `things#4` IS `Tallow`: a ref is drawn as the name of the row it
       points at, and the two records disagree so the wrong source is visible. */
    return json(200, {
      ok: true,
      value: { rows: [{ id: THING, seq: 4, fields: { name: 'Kiln' } }], cursor: null, matched: 1 },
    });
  if (url.pathname === '/api/list' && url.searchParams.get('register') === 'services')
    return url.searchParams.has('where')
      ? json(200, { ok: true, value: { rows: [row(2), row(5)], cursor: null, matched: 2 } })
      : json(200, { ok: true, value: { rows: [row(2)], cursor: null, matched: 9 } });
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
};

test("the record's saved view is drawn, with its own rows and its own predicate", async () => {
  const { io, sent } = host(record);
  const out = await viewReader(BASE, io).read('services.lapsing');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;

  /* THE VIEW IS THE RECORD'S AND NOT THE SAMPLE'S OF THE SAME KEY. */
  assert.equal(out.view.name, 'Winding down');
  assert.notEqual(out.view.name, VIEWS['services.lapsing']!.name);
  assert.deepEqual(out.view.filters, [
    { field: 'state', op: 'is', values: ['lapsing'] },
    { field: 'cycle', op: 'in', values: ['monthly', 'yearly'] },
  ]);
  assert.equal(out.entries.length, 2);
  assert.equal(out.matched, 2);
  /* THE WHOLE LIST'S SIZE IS THE RECORD'S, which is what tells `no-results` from `no-data-yet`. */
  assert.equal(out.total, 9);

  const asked = sent.find((u) => u.pathname === '/api/view')!;
  assert.equal(asked.searchParams.get('register'), 'services');
  assert.equal(asked.searchParams.get('id'), 'lapsing');

  /* THE VIEW'S OWN `where:` AND ORDER GO TO THE RECORD UNCHANGED. */
  const listed = sent.find((u) => u.pathname === '/api/list' && u.searchParams.has('where'))!;
  assert.deepEqual(JSON.parse(listed.searchParams.get('where')!), SAVED.filter);
  assert.deepEqual(JSON.parse(listed.searchParams.get('order')!), SAVED.order);
});

test('a ref is named by THIS record, and never by the sample row of the same number', async () => {
  const { io } = host(record);
  const out = await viewReader(BASE, io).read('services.lapsing');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.entries[0]!.fields.thing, 4);
  assert.equal(out.names.get('things#4'), 'Kiln');
  assert.notEqual(out.names.get('things#4'), ROWS.things!.find((e) => e.seq === 4)!.fields.name);
});

test("the URL's extra clause is ANDed on, never replacing the view's own", async () => {
  const { io, sent } = host(record);
  const out = await viewReader(BASE, io).read('services.lapsing', [{ field: 'cycle', op: 'in', values: ['monthly'] }], '');
  assert.equal(out.from, 'live');
  const listed = sent.find((u) => u.pathname === '/api/list' && u.searchParams.has('where'))!;
  const where = JSON.parse(listed.searchParams.get('where')!) as { all: unknown[] };
  assert.equal(where.all.length, 2, 'the view predicate and the URL clause are both sent');
  assert.deepEqual(where.all[0], SAVED.filter);
});

test("the view's own saved search is ANDed on too, which is the half nothing ever read back", async () => {
  /**
   * THE ONE PART OF A SAVED VIEW THAT WAS WRITTEN AND NEVER READ. `saveView` has stored `search:`
   * since the view table landed, and no reader of a view looked at it, so a view saved with a word
   * in the box reopened over the whole predicate without the word — a narrower question answered
   * with the wider list, silently. Deleting the `search` node from `read` left all fourteen of the
   * other tests in this file green, which is why this one is here.
   */
  const saved = { ...SAVED, search: 'kiln' };
  const { io, sent } = host((url) => (url.pathname === '/api/view' ? json(200, { ok: true, value: saved }) : record(url)));
  const out = await viewReader(BASE, io).read('services.lapsing');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.view.search, 'kiln');
  const listed = sent.find((u) => u.pathname === '/api/list' && u.searchParams.has('where'))!;
  const where = JSON.parse(listed.searchParams.get('where')!) as { all: unknown[] };
  assert.deepEqual(where.all[0], SAVED.filter);
  /* `services` declares `name` and `provider` searchable (`find.test.ts` pins the pair), and the
     box is the same substring test the register's own box is. */
  assert.deepEqual(where.all[1], { any: [{ field: 'name', contains: 'kiln' }, { field: 'provider', contains: 'kiln' }] });
});

test("a view the record does not hold is the record's sentence, with the addresses it does hold", async () => {
  const { io } = host((url) =>
    url.pathname === '/api/view'
      ? json(404, {
          ok: false,
          refusal: { code: 'VIEW_UNKNOWN', fix: 'services has no view called overdue.', at: 'id', allowed: ['lapsing', 'renewing'] },
        })
      : record(url),
  );
  assert.deepEqual(await viewReader(BASE, io).read('services.overdue'), {
    from: 'missing',
    said: 'services has no view called overdue.',
    addresses: ['services.lapsing', 'services.renewing'],
  });
});

test('a key naming no register asks the record what it holds, and sends no view read', async () => {
  const { io, sent } = host((url) =>
    url.pathname === '/api/views' ? json(200, { ok: true, value: [SAVED] }) : record(url),
  );
  assert.deepEqual(await viewReader(BASE, io).read('overdue'), {
    from: 'missing',
    said: 'There is no saved view called overdue.',
    addresses: ['services.lapsing'],
  });
  assert.equal(sent.filter((u) => u.pathname === '/api/view').length, 0);
});

for (const [what, answer, fix] of [
  ['nothing answers', null, /^BrainDog could not be reached\.$/u],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }), /^Sign in again\.$/u],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 }), /^BrainDog's answer could not be read\.$/u],
] as const)
  /* NO RECORD IS A REFUSAL NOW, carrying the sentence the record or the client gave. It answered
     `{ from: 'sample' }` and the route drew the seeded studio's `services.lapsing` over whatever address was open. */
  test(`a view is refused when ${what}, never read from the sample`, async () => {
    const { io } = host(answer);
    const out = await viewReader(BASE, io).read('services.lapsing');
    assert.equal(out.from, 'refused', `answered ${JSON.stringify(out)}`);
    if (out.from !== 'refused') return;
    assert.match(out.fix, fix);
  });

test("any other refusal on the view itself is the record's own sentence", async () => {
  const fix = 'This key may not read services.';
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await viewReader(BASE, io).read('services.lapsing'), { from: 'refused', fix, register: 'services' });
});

test('A FILTER THE RECORD CANNOT READ IS THE RECORD SAYING WHICH FIELD, never a blank screen', async () => {
  /**
   * THE CASE THAT MAKES THIS THE REFUSAL WORTH CARRYING. `saveView` compiles the predicate against
   * the register at the moment it is saved, so a view that cannot run cannot be stored — and a
   * field retired a month later breaks it anyway. The view still reads back fine; it is `list` that
   * refuses, and the record's sentence names the field. Without it the screen is a header, a filter
   * line and nothing at all.
   */
  const fix = 'services has no field called renewal.';
  const { io } = host((url) =>
    url.pathname === '/api/list' && url.searchParams.has('where')
      ? json(422, { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix, at: 'where', allowed: ['state', 'cycle'] } })
      : record(url),
  );
  assert.deepEqual(await viewReader(BASE, io).read('services.lapsing'), { from: 'refused', fix, register: 'services' });
});

test('a view the record holds with no filter is no clauses, and is not a predicate nobody can write', async () => {
  /**
   * THE TWO NOTHINGS A VIEW'S PREDICATE HAS, AND THEY MEAN OPPOSITE THINGS TO THE SCREEN. `null`
   * from `clausesOf` is "the chips cannot say this", and the route prints no Filter line. `[]` is
   * "there is no filter", which the kernel's `ViewRow` header calls a view over the whole register.
   * Reading `filter: null` as the first would hide a line the record can say; reading it as a
   * printable clause list drew the word Filter with nothing after it, which is the state the
   * route's `filters.length + extra.length` guard is now for.
   */
  const saved = { ...SAVED, filter: null };
  const { io } = host((url) => (url.pathname === '/api/view' ? json(200, { ok: true, value: saved }) : record(url)));
  const out = await viewReader(BASE, io).read('services.lapsing');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.view.filters, []);
  assert.notEqual(out.view.filters, null);
});

test('a predicate the chips cannot say is not printed at all', () => {
  /* `19 §1`'s own lesson, and the route's file header records what it cost: a view called Overdue
     printed a two-clause sentence over a list filtered on one, and 24 of the 28 rows under the word
     were not overdue. A shape the chips cannot write is written as nothing. */
  assert.equal(clausesOf({ any: [{ field: 'state', is: 'open' }, { field: 'state', is: 'part' }] }), null);
  assert.equal(clausesOf({ all: [{ field: 'state', is: 'open' }, { field: 'note', contains: 'vat' }] }), null);
  assert.equal(clausesOf({ field: 'owner', via: 'thing', is: 'x' }), null);
  assert.deepEqual(clausesOf({ field: 'due', before: 'today' }), [{ field: 'due', op: 'before', values: ['today'] }]);
  assert.deepEqual(clausesOf({ field: 'paid', empty: true }), [{ field: 'paid', op: 'is', values: ['empty'] }]);
  assert.deepEqual(clausesOf({ field: 'state', not: 'done' }), [{ field: 'state', op: 'not-in', values: ['done'] }]);
});

test('an address is split at the last dot, and a key naming no register is none', () => {
  assert.deepEqual(addressOf('obligations.overdue'), { register: 'obligations', id: 'overdue' });
  assert.deepEqual(addressOf('rl_meetings.this-month'), { register: 'rl_meetings', id: 'this-month' });
  for (const key of ['', 'overdue', '.overdue', 'obligations.']) assert.equal(addressOf(key), null, key);
});

test("the columns a view kept are the ones it kept, in its order, with the spoken id last", () => {
  const all = columnsFor('services', undefined, true);
  const kept = keptColumns(all, ['cost', 'seq', 'state']);
  assert.deepEqual(kept.map((c) => c.field), ['cost', 'state', 'seq']);
  /* A FIELD THE REGISTER NO LONGER DECLARES IS DROPPED rather than drawn as a column of blanks. */
  assert.deepEqual(keptColumns(all, ['cost', 'renewal_window']).map((c) => c.field), ['cost']);
  /* AND A VIEW THAT KEPT NOTHING THE REGISTER STILL DECLARES FALLS BACK TO THE REGISTER'S OWN. */
  assert.deepEqual(keptColumns(all, ['renewal_window']).map((c) => c.field), keptColumns(all, []).map((c) => c.field));
});

test('the view page draws the record’s view, its refusal and the view it does not hold', () => {
  const page = readFileSync(new URL('../../routes/v/[view]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\$lib\/record\/views-live\.ts'/u);
  assert.match(page, /viewReader\(apiBase\(\)\)/u);
  /* THE THREE ANSWERS THE SAMPLE NEVER HAD: bars while it is in flight, the record's sentence when
     it refuses, and the record's own addresses for a view it does not hold. */
  assert.match(page, /<Waiting head/u);
  assert.match(page, /got\?\.from === 'refused'/u);
  assert.match(page, /got\?\.from === 'missing'/u);
  /* AND NO SAMPLE UNDER ANY OF THEM: the seeded studio's `VIEWS` and `PAGES`, and `list` over its rows, were the
     fallback for a record that did not answer, and a person signed out of their own record was shown them. */
  const code = page.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(code, /\bVIEWS\b|\bPAGES\b|'sample'|\blist\(/u);
  /* THE SAVED SEARCH IS ON SCREEN AS WELL AS IN THE `where`: a word narrowing the list with nothing
     saying so is the same unreadable state as a dropped `?q=`, which this route's header is about. */
  assert.match(page, /\{#if live\?\.search\}/u);
  /* AND THE FILTER LINE IS ASKED FOR A LENGTH AND NOT FOR AN ARRAY, so a view the record holds with
     `filter: null` draws no line rather than the label on its own. */
  assert.match(page, /\{#if filters\?\.length \|\| narrowed \|\| live\?\.search\}/u);
  assert.match(page, /\{#if filters && filters\.length \+ extra\.length > 0\}/u);
});

test('nothing stands in front of the route: /v/<key> is drawn on a record, never answered with a redirect', () => {
  /**
   * THE LIVE HALF ABOVE WAS UNREACHABLE AND EVERY TEST IN THIS FILE WAS GREEN.
   *
   * `+page.ts` on this route answered `redirect(307, viewMovedTo(...))` for every key on a live
   * record, so `viewReader` ran here and in no browser. Sixteen passing tests over a module the
   * product could not reach is the shape of failure this tree keeps finding: something
   * complete-looking that reports success and does nothing.
   *
   * THE REDIRECT ALSO COULD NOT WORK, which is what settled it rather than the inconvenience.
   * `viewMovedTo` maps a key to `/p/<key>` unchanged. A saved view's key is `<register>.<id>`
   * (`addressOf` above, and `VIEW_ID` in the kernel); the slug `rows-write.ts` gives a view page is
   * `<register>-<base36 of Date.now()>`. The two shapes never coincide, so every key this route can
   * be handed on a record landed on a page that cannot exist, and `/p/[slug]` answered "There is no
   * page called services.lapsing" with a list of pages: the wrong question answered confidently.
   *
   * The redirect was added to stop `/v/<key>` drawing the sample's fictional views on a real
   * record. That is what `viewReader` does now, and it does it by asking the record; and there is
   * no sample left to draw even when nothing answers, which the three tests above pin.
   */
  const dir = new URL('../../routes/v/[view]/', import.meta.url);
  const files = readdirSync(dir);
  assert.ok(!files.includes('+page.ts'), 'the route has a load again, and a load on this route existed only to redirect away from it');
  /* THE IMPORT AND NOT THE WORD. The first version of this banned `redirect(` anywhere in the
     directory and went red on the paragraph in `+page.svelte` explaining why there is no redirect,
     which is a guard failing on its own documentation. Nothing can send a navigation away from
     here without pulling one of these two in, and neither name can arrive by accident. */
  for (const file of files) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/^\s*import\b[^;]*\bredirect\b/mu.test(src), `${file} imports redirect, and the live half is only reachable when nothing sends /v/<key> away`);
    assert.ok(!/^\s*import\b[^;]*\bviewMovedTo\b/mu.test(src), `${file} asks where /v/<key> moved to, and it has not moved`);
  }
});

test("a view over a list this record will not describe is the record's sentence, not the sample's view names", async () => {
  /**
   * THE SECOND WAY A LIVE VIEW REACHED THE SCREEN AS THE FICTIONAL STUDIO'S.
   *
   * `learn` swallows a refusal on purpose, because a ref map for a list this key may not read is
   * better absent than fatal. A view is different: the register it filters is where the columns,
   * the field labels and the name in the header all come from. Without it the route fell past
   * every branch above into its 404, and drew "There is no saved view called shipments.lapsing"
   * over `theseExist('Saved views', ...)` built from `VIEWS` — the sample's two names, on a record
   * that holds the view and had just answered with it. Both halves of that screen were wrong.
   *
   * The register is not named in the answer, so the route offers Home alone rather than a button
   * spelling a raw id nobody has a word for.
   */
  const saved = { ...SAVED, register: 'shipments' };
  const fix = 'This key may not read shipments.';
  const { io } = host((url) => {
    if (url.pathname === '/api/view') return json(200, { ok: true, value: saved });
    if (url.pathname === '/api/schema') return json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } });
    if (url.pathname === '/api/list' && url.searchParams.get('register') === 'shipments')
      return json(200, { ok: true, value: { rows: [row(2)], cursor: null, matched: 1 } });
    return record(url);
  });
  assert.deepEqual(await viewReader(BASE, io).read('shipments.lapsing'), { from: 'refused', fix });
});

test('and a list only the record declares still draws: the guard above refuses an absence, never an unfamiliar name', async () => {
  /**
   * THE OTHER DIRECTION OF THE SAME GUARD, WHICH NOTHING PINNED.
   *
   * The test above proves a view over an undeclared register stops. Nothing proved it stops ONLY
   * there, and the check it is built on reads `REGISTERS`, which ships the sample's lists: written
   * a line earlier, or against a map this reader does not wait for, the same `if` refuses every
   * register a use case invented and leaves only the fictional studio's five drawable. That is a
   * worse screen than the one being fixed, because it refuses a view the record answered with.
   *
   * `consignments` IS NOT `shipments` ON PURPOSE. This test puts a register into the module-level
   * `REGISTERS` by the only route that does, `learn`, and the test above asserts `shipments` is
   * absent, so sharing one name between them would make the pair pass or fail on their order in
   * this file. It is taken back out at the end for the same reason.
   */
  const decl = {
    id: 'consignments',
    name: 'Consignments',
    one: 'consignment',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', label: 'Name' },
      { id: 'state', type: 'text', label: 'State' },
    ],
  };
  const saved = { ...SAVED, register: 'consignments' };
  const { io } = host((url) => {
    if (url.pathname === '/api/view') return json(200, { ok: true, value: saved });
    if (url.pathname === '/api/schema' && url.searchParams.get('register') === 'consignments')
      return json(200, { ok: true, value: decl });
    if (url.pathname === '/api/list' && url.searchParams.get('register') === 'consignments')
      return json(200, { ok: true, value: { rows: [row(2)], cursor: null, matched: 1 } });
    return record(url);
  });
  try {
    const out = await viewReader(BASE, io).read('consignments.lapsing');
    assert.equal(out.from, 'live', out.from === 'refused' ? out.fix : out.from);
    if (out.from !== 'live') return;
    assert.equal(out.view.register, 'consignments');
    /* AND THE DECLARATION IS THE RECORD'S, which is what the header, the columns and the labels
       are drawn from: a `from: 'live'` with nothing in `REGISTERS` is the state that 404'd. */
    assert.equal(REGISTERS.consignments?.name, 'Consignments');
  } finally {
    delete REGISTERS.consignments;
  }
});
