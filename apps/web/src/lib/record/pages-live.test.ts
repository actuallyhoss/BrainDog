/**
 * The page declarations a record holds, read back as bodies.
 *
 * THE PROPERTY UNDER TEST IS WHOSE BODY IT IS. The read exists because the only page bodies this app
 * held were the built-in sample's, and a write built on those would have installed a fictional
 * studio's blocks over a real customer's page. So the fixture DISAGREES with the sample everywhere it
 * can, and the assertions are the ones that fail if the sample leaks back in.
 *
 * THE SECOND PROPERTY IS THAT A BODY IS A BODY. What `page` answers is the declaration with the run
 * spread over it, so a reader that hands the answer straight back hands back this morning's rows and
 * a computed `drawn` as though an author had typed them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { PAGES } from './fixtures/sample.ts';
import { declWords, pagesReader, type Fetch } from './pages-live.ts';

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

/**
 * The Money page as this record declares it, and as `page` answers it.
 *
 * THE DECLARATION AND THE RUN ARE INTERLEAVED ON PURPOSE, because that is how the answer arrives: the
 * kernel spreads `rows`, `matched`, `refusals` and a computed `drawn` onto the block the author
 * wrote. Nothing in the answer marks which half is which.
 */
const DECLARED = {
  kind: 'table',
  heading: 'Unpaid, in this record',
  span: 8,
  source: 'register.obligations',
  where: 'state is open',
  limit: 12,
  empty: 'Nothing is unpaid.',
  columns: [
    { field: 'party', label: 'Party' },
    { field: 'amount', label: 'Amount', align: 'end' },
  ],
} as const;

const MONEY = {
  page: 'money',
  title: 'Money, this record',
  requires: ['obligations'],
  blocks: [
    {
      ...DECLARED,
      /* THE RUN. `drawn` is the one that reads like a declared key and is not: it is the kernel's
         verdict on a `when:`, decided against a figure at the moment the page was read. */
      rows: [{ id: '01JOBL000000000000000000A', seq: 1, fields: { party: 'Halden' }, version: 1, created_at: '2026-09-01T09:00:00.000Z' }],
      matched: 3,
      refusals: [],
      drawn: true,
      values: { 'obligations.total': 420000 },
    },
  ],
};

/** A template, as the record answers one: expanded against a row, with every `{{field}}` filled. */
const KILN = {
  page: 'kiln',
  title: 'Kiln',
  for: { register: 'things', where: 'state is open' },
  param: { register: 'things', seq: 4, title: 'Kiln' },
  blocks: [{ kind: 'table', source: 'register.tasks', where: 'thing is Kiln', rows: [], matched: 0, refusals: [] }],
};

/** A page whose one block is over a register this caller may not read. The declaration still stands. */
const PAYROLL = {
  page: 'payroll',
  title: 'Payroll',
  blocks: [
    {
      kind: 'table',
      source: 'register.payroll',
      where: 'month is this',
      empty: 'Nobody is paid yet.',
      rows: [],
      matched: 0,
      refusals: [{ code: 'FORBIDDEN', fix: 'You cannot read payroll.' }],
    },
  ],
};

const HELD: Record<string, unknown> = { money: MONEY, kiln: KILN, payroll: PAYROLL };

const LISTED = [
  { slug: 'money', title: 'Money, this record' },
  { slug: 'kiln', title: 'Kiln' },
  { slug: 'payroll', title: 'Payroll' },
];

const record = (url: URL): Response => {
  if (url.pathname === '/api/pages') return json(200, { ok: true, value: LISTED });
  if (url.pathname === '/api/page') {
    const held = HELD[url.searchParams.get('slug') ?? ''];
    return held
      ? json(200, { ok: true, value: held })
      : json(404, { ok: false, refusal: { code: 'PAGE_UNKNOWN', fix: 'There is no page there.' } });
  }
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
};

test("the bodies are this record's, and not one of them is the sample's", async () => {
  const { io } = host(record);
  const out = await pagesReader(BASE, io).read();
  assert.ok(out.from === 'live');

  const money = out.pages.find((p) => p.slug === 'money');
  assert.ok(money, 'the page the record listed came back');
  assert.equal(money.body.title, 'Money, this record');
  assert.equal(money.body.blocks[0]!.heading, 'Unpaid, in this record');

  /* THE ASSERTION THAT FAILS IF THE SAMPLE LEAKS BACK IN. The sample ships a Money page of its own,
     and the whole reason this read exists is that its blocks are a fictional studio's. No body
     handed back here is any of them. */
  for (const page of out.pages)
    for (const sample of Object.values(PAGES))
      assert.ok(!isDeepStrictEqual(sample.blocks, page.body.blocks), `${page.slug} came back with the sample's blocks`);
});

test('the run comes off, and the declaration survives whole', async () => {
  const { io } = host(record);
  const out = await pagesReader(BASE, io).read();
  assert.ok(out.from === 'live');
  const block = out.pages.find((p) => p.slug === 'money')!.body.blocks[0]!;

  /* WHAT THE KERNEL WROTE ONTO THE BLOCK IS GONE. Any one of these carried into a body would be
     installed as though an author had typed it. */
  for (const key of ['rows', 'matched', 'refusals', 'drawn', 'values', 'readings', 'walk', 'scopes', 'inherited', 'feed', 'seen', 'history'])
    assert.ok(!(key in block), `${key} is the answer and must not reach the body`);

  /* AND WHAT THE AUTHOR WROTE IS UNTOUCHED, key for key. A body that dropped a declared key would
     install a page missing whatever it did not recognise. */
  assert.deepEqual(block, { ...DECLARED });
  assert.equal(out.pages.find((p) => p.slug === 'money')!.body.requires !== undefined, true, 'a page-level declared key survives too');
});

test("a template's expansion is named, and never handed back as a body", async () => {
  const { io } = host(record);
  const out = await pagesReader(BASE, io).read();
  assert.ok(out.from === 'live');

  /* ONE DECLARATION AND ONE PAGE PER ROW. Installing the expansion would replace the template with a
     literal page about one row, and take every other row's page with it. */
  assert.ok(!out.pages.some((p) => p.slug === 'kiln'), 'an expansion is not a stored body');
  assert.deepEqual(out.expanded, [{ slug: 'kiln', title: 'Kiln', why: declWords.expanded }]);
});

test('`param` alone names an expansion, as does `for` alone', async () => {
  for (const extra of [{ param: { register: 'things', seq: 4, title: 'Kiln' } }, { for: { register: 'things' } }]) {
    const one = { page: 'kiln', title: 'Kiln', blocks: [], ...extra };
    const { io } = host((url) =>
      url.pathname === '/api/pages'
        ? json(200, { ok: true, value: [{ slug: 'kiln', title: 'Kiln' }] })
        : json(200, { ok: true, value: one }),
    );
    const out = await pagesReader(BASE, io).read();
    assert.ok(out.from === 'live');
    assert.equal(out.pages.length, 0);
    assert.equal(out.expanded.length, 1);
  }
});

test('a block the caller may not read still gives up its declaration', async () => {
  const { io } = host(record);
  const out = await pagesReader(BASE, io).read();
  assert.ok(out.from === 'live');

  /* THE RECORD BLANKS THE ROWS AND PUTS A REFUSAL ON THE BLOCK, and leaves the declaration alone. A
     body read by somebody held to some of the registers is still the body the record stores, which
     is what makes it safe to write back. */
  const block = out.pages.find((p) => p.slug === 'payroll')!.body.blocks[0]!;
  assert.deepEqual(block, { kind: 'table', source: 'register.payroll', where: 'month is this', empty: 'Nobody is paid yet.' });
});

for (const [what, answer, fix] of [
  ['nothing answers', null, /^BrainDog could not be reached\.$/u],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }), /^Sign in again\.$/u],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 }), /^BrainDog's answer could not be read\.$/u],
] as const)
  test(`the refusal is said in its own words when ${what}, and no sample under it`, async () => {
    const { io } = host(answer);
    /* NOT `from: 'absent'` ANY MORE, WHICH EVERY CALLER TURNED INTO "the record could not be reached". That was
       wrong for a 401: the record was reached and said to sign in. With no sample anywhere there is no
       second meaning for these codes to carry, so they are the record's or the client's sentence like any other. */
    for (const out of [await pagesReader(BASE, io).read(), await pagesReader(BASE, io).readOne('money')]) {
      assert.equal(out.from, 'refused', `answered ${JSON.stringify(out)}`);
      if (out.from === 'refused') assert.match(out.fix, fix);
    }
  });

test("any other refusal is the record's own sentence, on the list and on a page", async () => {
  const fix = 'This record declares no pages. Install a pack to make some.';
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await pagesReader(BASE, io).read(), { from: 'refused', fix });
  assert.deepEqual(await pagesReader(BASE, io).readOne('money'), { from: 'refused', fix });
});

test("a page's refusal stops the read rather than shortening the list", async () => {
  const fix = 'That page was retired while this was being read.';
  const { io } = host((url) =>
    url.pathname === '/api/pages'
      ? json(200, { ok: true, value: LISTED })
      : url.searchParams.get('slug') === 'money'
        ? json(200, { ok: true, value: MONEY })
        : json(404, { ok: false, refusal: { code: 'PAGE_UNKNOWN', fix } }),
  );
  /* A LIST THAT QUIETLY CAME UP SHORT reads as pages that do not exist, to a caller about to write
     one of them back. */
  assert.deepEqual(await pagesReader(BASE, io).read(), { from: 'refused', fix });
});

test('a slug is read once, however it is asked for', async () => {
  const { io, sent } = host(record);
  const reader = pagesReader(BASE, io);
  await reader.read();
  const one = await reader.readOne('money');

  assert.ok(one.from === 'live');
  assert.equal(one.page.body.blocks[0]!.heading, 'Unpaid, in this record');
  const asked = sent.filter((u) => u.pathname === '/api/page' && u.searchParams.get('slug') === 'money');
  assert.equal(asked.length, 1, 'the body read by the list is the one `readOne` answers with');
});

test('one page, read on its own', async () => {
  const { io } = host(record);
  const reader = pagesReader(BASE, io);

  const one = await reader.readOne('money');
  assert.ok(one.from === 'live');
  assert.equal(one.page.slug, 'money');
  assert.deepEqual(one.page.body.blocks, [{ ...DECLARED }]);

  const template = await reader.readOne('kiln');
  assert.ok(template.from === 'expanded');
  assert.equal(template.expanded.why, declWords.expanded);
});
