import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEEP_MS, cardsFor, cardsOf, forgetCards, mayAskAgain, openedOf, readCards, readOpened, readPictures, settle, stepOf, tagOf, undoAsks, undoOf, visualWords, type Version } from './held.ts';

const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);

/** A host that answers every call with one body, and counts the calls. */
function host(body: unknown, status = 200) {
  const asked: { url: string; body: unknown }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    asked.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { io, asked };
}

test('A CARD IS ITS TITLE, WHO AND WHEN, AND ITS FIRST PICTURE AS A STILL: newest first, and one it cannot read is left out', () => {
  const cards = cardsOf({
    on: 'the task',
    visuals: [
      { id: 'v1', title: 'Upload audit', version: 2, versions: 2, by: 'p_owner', at: '2030-01-02T10:00:00Z', page: { sha256: SHA, bytes: 10 }, pictures: [{ name: 'img/a.png', sha256: SHA2, mime: 'image/png', bytes: 9 }] },
      { id: 'v2', title: 'Plan', version: 1, versions: 1, by: 'S4', at: '2030-01-03T10:00:00Z', page: { sha256: SHA, bytes: 10 }, pictures: [] },
      { id: 'v3', title: '', version: 1 },
      { title: 'No id', version: 1 },
      'nonsense',
    ],
  });
  assert.deepEqual(
    cards.map((c) => [c.id, c.title, c.still]),
    [
      ['v2', 'Plan', null],
      ['v1', 'Upload audit', SHA2],
    ],
  );
  assert.deepEqual(cardsOf(null), []);
  assert.deepEqual(cardsOf({ visuals: 'x' }), []);
});

test('A PICTURE WITH A HASH THE FILE DOOR WOULD NOT TAKE IS NEVER A STILL', () => {
  const [card] = cardsOf({ visuals: [{ id: 'v', title: 'T', version: 1, pictures: [{ name: 'x.png', sha256: '../../api/boot', mime: 'image/png' }] }] });
  assert.equal(card!.still, null);
});

test('OPEN, ITS VERSIONS ARE NEWEST FIRST, each with the write that made it', () => {
  const opened = openedOf({
    id: 'v1',
    on: 'the task',
    title: 'Plan',
    version: 2,
    by: 'p_owner',
    at: '2030-01-02T10:00:00Z',
    page: '<h1>Two</h1>',
    pictures: [{ name: 'img/a.png', sha256: SHA, mime: 'image/png', bytes: 3 }],
    versions: [
      { version: 1, title: 'Plan', by: 'S3', at: '2030-01-01T10:00:00Z', bytes: 10, pictures: 0, batch: 'B1' },
      { version: 2, title: 'Plan', by: 'p_owner', at: '2030-01-02T10:00:00Z', bytes: 12, pictures: 1, batch: 'B2' },
    ],
  })!;
  assert.deepEqual(opened.versions.map((v) => [v.version, v.batch]), [[2, 'B2'], [1, 'B1']]);
  assert.equal(opened.page, '<h1>Two</h1>');
  assert.deepEqual(opened.pictures, [{ name: 'img/a.png', sha256: SHA, mime: 'image/png' }]);
  assert.equal(openedOf({ id: 'v1', version: 1 }), null, 'no page is nothing to draw');
});

test('UNDO IS OFFERED ON THE NEWEST ONLY WHILE IT STANDS THERE: once put back, it is not offered again', () => {
  const versions: Version[] = [
    { version: 3, title: 'P', by: 'a', at: '', batch: 'B3' },
    { version: 2, title: 'P', by: 'a', at: '', batch: 'B2' },
  ];
  assert.equal(undoOf(versions, 3), 'B3');
  assert.equal(undoOf(versions, 2), null, 'it stands at an earlier one');
  assert.equal(undoOf(versions, null), null);
  assert.equal(undoOf([{ version: 1, title: 'P', by: 'a', at: '', batch: null }], 1), null, 'a version with no write named has no Undo');
  assert.equal(undoOf([], 1), null);
  assert.equal(undoOf(versions, 3, 2), null, 'not while an older version is the one on screen');
});

test('THE LIST SAYS WHICH IS NEWEST, and which it stands at once the newest was put back', () => {
  const versions: Version[] = [
    { version: 3, title: 'P', by: 'a', at: '', batch: 'B3' },
    { version: 2, title: 'P', by: 'a', at: '', batch: 'B2' },
    { version: 1, title: 'P', by: 'a', at: '', batch: 'B1' },
  ];
  assert.deepEqual([3, 2, 1].map((v) => tagOf(v, versions, 3)), ['Newest', null, null]);
  assert.deepEqual([3, 2, 1].map((v) => tagOf(v, versions, 2)), ['Newest', 'Current', null]);
});

test('A DRAFT IS MARKED: its card says which version waits and who drew it, and open it shows first beside the kept one', () => {
  const [card] = cardsOf({ visuals: [{ id: 'v', title: 'Plan', version: 1, versions: 2, kept: true, draft: { version: 2, by: 'S4', at: '' } }] });
  assert.deepEqual(card!.draft, { version: 2, by: 'S4' });
  assert.equal(cardsOf({ visuals: [{ id: 'v', title: 'Plan', version: 1 }] })[0]!.draft, null);
  const opened = openedOf({
    id: 'v',
    title: 'Plan',
    version: 3,
    kept: 1,
    draft: 3,
    page: '<h1>Three</h1>',
    versions: [
      { version: 1, by: 'S4', batch: 'B1' },
      { version: 2, by: 'S4', batch: 'B2', draft: true },
      { version: 3, by: 'S4', batch: 'B3', draft: true },
    ],
  })!;
  assert.deepEqual([opened.kept, opened.draft], [1, 3]);
  assert.deepEqual([3, 2, 1].map((v) => tagOf(v, opened.versions, opened.kept, opened.draft)), ['Draft', 'Thrown away', 'Current']);
  assert.equal(undoOf(opened.versions, opened.kept, 3), null, 'a draft is settled by its three presses, not Undo');
  /* A RECORD FROM BEFORE DRAFTS stands at the version it answered. */
  assert.deepEqual(((o) => [o.kept, o.draft])(openedOf({ id: 'v', version: 2, page: '' })!), [2, null]);
});

test('THE ARROWS STEP THE VERSIONS, and Try again is offered only on a version a run drew', () => {
  const versions: Version[] = [3, 2, 1].map((version) => ({ version, title: 'P', by: 'a', at: '', batch: null }));
  assert.deepEqual([stepOf(versions, 3, true), stepOf(versions, 3, false), stepOf(versions, 1, true), stepOf(versions, 2, false), stepOf(versions, 9, true)], [2, null, null, 3, null]);
  assert.equal(mayAskAgain('S12'), true);
  assert.equal(mayAskAgain('p_owner'), false);
  assert.equal(mayAskAgain('S0'), false);
});

test('A PRESS ON A DRAFT IS settleVisual, answered in the record\'s own sentence', async () => {
  const h = host({ ok: true, value: { visual: 'v', kept: 2, batch: 'B', said: 'Kept version 2 of "Plan".' } });
  assert.deepEqual(await settle('https://b.example', 'v', 2, 'keep', h.io), { ok: true, value: { said: 'Kept version 2 of "Plan".', kept: 2 } });
  assert.equal(new URL(h.asked[0]!.url).pathname, '/api/settleVisual');
  assert.deepEqual(h.asked[0]!.body, { id: 'v', version: 2, as: 'keep' });
  const no = host({ ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix: 'Version 2 of "Plan" is not a draft waiting now, so there is nothing to keep.' } }, 409);
  assert.deepEqual(await settle('https://b.example', 'v', 2, 'keep', no.io), { ok: false, fix: 'Version 2 of "Plan" is not a draft waiting now, so there is nothing to keep.' });
});

test('UNDO SAYS FIRST WHAT ELSE IT TAKES BACK only when the write did more than this visual', () => {
  assert.equal(undoAsks(0), false);
  assert.equal(undoAsks(1), false);
  assert.equal(undoAsks(2), true);
  assert.equal(visualWords.undoMore(1), 'This also puts back 1 other change made with it.');
  assert.equal(visualWords.undoMore(3), 'This also puts back 3 other changes made with it.');
});

test('NO RECORD WORDS AND NO LONG DASHES ON SCREEN', () => {
  const said = Object.values(visualWords)
    .map((w) => (typeof w === 'function' ? (w as (...a: unknown[]) => string)(2, 'x') : w))
    .join(' ');
  assert.doesNotMatch(said, /\b(row|rows|list|id|record)\b/iu);
  assert.doesNotMatch(said, /—/u);
});

test('THE READS ASK THE RECORD BY THE THING AND THE VISUAL, and a build without visuals holds none', async () => {
  const cards = host({ ok: true, value: { on: 'x', visuals: [{ id: 'v', title: 'T', version: 1 }] } });
  const got = await readCards('https://b.example', 'tasks#3', cards.io);
  assert.ok(got.ok && got.value.length === 1);
  const asked = new URL(cards.asked[0]!.url);
  assert.equal(asked.pathname, '/api/visuals');
  assert.equal(asked.searchParams.get('on'), 'tasks#3');

  const old = host({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }, 404);
  assert.deepEqual(await readCards('https://b.example', 'SG2', old.io), { ok: true, value: [] });

  const gone = host({ ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'This visual was taken away. Name a version, 1 to 2, to read one.' } }, 422);
  const one = await readOpened('https://b.example', 'v', undefined, gone.io);
  assert.deepEqual(one, { ok: false, fix: 'This visual was taken away. Name a version, 1 to 2, to read one.' });
  await readOpened('https://b.example', 'v', 2, gone.io);
  const second = new URL(gone.asked[1]!.url);
  assert.deepEqual([second.pathname, second.searchParams.get('id'), second.searchParams.get('version')], ['/api/visual', 'v', '2']);
});

test('PICTURES ARE READ THROUGH THE FILE DOOR AND HANDED IN INLINE; one that does not come is counted, not drawn', async () => {
  const urls: string[] = [];
  const io = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return String(url).endsWith(SHA) ? new Response(new Uint8Array([1, 2, 3])) : new Response('', { status: 404 });
  }) as typeof fetch;
  const out = await readPictures('https://b.example/app/kiln', [
    { name: 'img/a.png', sha256: SHA, mime: 'image/png' },
    { name: 'img/b.png', sha256: SHA2, mime: 'image/png' },
  ], io);
  assert.deepEqual(out, { inline: { 'img/a.png': 'data:image/png;base64,AQID' }, missing: 1 });
  assert.ok(urls.includes(`https://b.example/app/kiln/api/files/${SHA}`));
});

test('A PAGE OF STRIPS ASKS ONCE A MINUTE FOR EACH THING, and asks again once told it changed', async () => {
  const h = host({ ok: true, value: { visuals: [] } });
  const at = 1_000_000;
  await cardsFor('https://k.example', 'SG7', at, h.io);
  await cardsFor('https://k.example', 'SG7', at + 10, h.io);
  assert.equal(h.asked.length, 1);
  await cardsFor('https://k.example', 'SG7', at + KEEP_MS + 1, h.io);
  assert.equal(h.asked.length, 2);
  forgetCards('https://k.example', 'SG7');
  await cardsFor('https://k.example', 'SG7', at + KEEP_MS + 2, h.io);
  assert.equal(h.asked.length, 3);
});
