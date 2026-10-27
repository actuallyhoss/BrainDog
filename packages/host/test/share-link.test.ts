/**
 * A read-only link's door and its shape: what a stranger holding a link learns, and what the owner is handed.
 *
 * EVERY LINK THAT DOES NOT OPEN IS ONE 404 WITH NO BODY. A forged token, a good token moved under another record's
 * name, and a good token for a record this host does not hold all answer the same, and none of them wakes the record.
 * The link itself is `<origin>/app/s#<token>`: the token rides in the fragment, which no browser sends to a server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveShareKey, linkOpened, serveShared, shareToken, withShareLinks, NO_SHARE_KEY, type SharedDoor, type ShareContext } from '../src/share.ts';
import { ROUTES as SHARE_ROUTES } from '../src/routes/shares.ts';

const NOW = Date.parse('2026-10-14T09:00:00Z');
const EXP = Math.floor(NOW / 1000) + 30 * 86_400;
const HELD = 'rec_lanternfish';
const OTHER = 'rec_copperleaf';
const key = await deriveShareKey(new TextEncoder().encode('share-link-test-material-not-a-secret'));
const claim = { id: 'shr_01', slug: 'brightwell-site', exp: EXP };

/** A door over one held record that counts how often the record was asked, answering `status` when it is. */
function door(status = 200, k: Uint8Array | null = key) {
  const asked: { record: string; ctx: ShareContext }[] = [];
  const d: SharedDoor = {
    key: async () => k,
    knows: async (record) => record === HELD,
    spend: async () => null,
    now: () => NOW,
    answer: async (record, ctx) => {
      asked.push({ record, ctx });
      return new Response(status === 200 ? '{"title":"Brightwell site"}' : null, { status });
    },
  };
  return { d, asked };
}

const read = (token: string, d: SharedDoor) =>
  serveShared(new Request('https://app.example.test/api/sharedPage', { headers: { authorization: `Share ${token}` } }), token, d);

/** The one refusal: 404, no body, `no-store`. */
async function isNone(out: Response) {
  assert.equal(out.status, 404);
  assert.equal(await out.text(), '');
  assert.equal(out.headers.get('cache-control'), 'no-store');
}

test('a good link opens the page as the share principal, and nothing else', async () => {
  const { d, asked } = door();
  const out = await read(await shareToken(key, HELD, claim), d);
  assert.equal(out.status, 200);
  assert.deepEqual(asked, [{ record: HELD, ctx: { principal: { kind: 'share', id: 'shr_01', slug: 'brightwell-site' } } }]);
});

test('a forged token is one 404 with no body, and the record is never asked', async () => {
  const { d, asked } = door();
  const good = await shareToken(key, HELD, claim);
  const other = await deriveShareKey(new TextEncoder().encode('a-key-this-host-never-held'));
  const flipped = good.slice(0, -2) + (good.at(-2) === 'A' ? 'B' : 'A') + good.at(-1);
  const forged = [
    'not-a-token',
    `${HELD}.e30.AAAA`,
    flipped,
    await shareToken(other, HELD, claim),
    await shareToken(key, HELD, { ...claim, exp: Math.floor(NOW / 1000) - 1 }),
    'x'.repeat(2000),
  ];
  for (const token of forged) await isNone(await read(token, d));
  assert.equal(asked.length, 0);
});

test('a good token moved under another record\'s name is one 404, and neither record is asked', async () => {
  const { d, asked } = door();
  const good = await shareToken(key, OTHER, claim);
  await isNone(await read(HELD + good.slice(OTHER.length), d));
  assert.equal(asked.length, 0);
});

test('a token signed for a record this host does not hold is one 404, and nothing is woken', async () => {
  const { d, asked } = door();
  await isNone(await read(await shareToken(key, OTHER, claim), d));
  assert.equal(asked.length, 0);
});

test('a closed link the record refuses, and a host with no key, are the same 404', async () => {
  for (const status of [403, 404, 410, 500]) await isNone(await read(await shareToken(key, HELD, claim), door(status).d));
  await isNone(await read(await shareToken(key, HELD, claim), door(200, null).d));
});

test('a link is the token in the fragment, never in the path', async () => {
  const opened = { ok: true as const, value: { id: 'shr_01', slug: 'brightwell-site', expires_at: new Date(EXP * 1000).toISOString() } };
  const made = await linkOpened(opened, { key, record: HELD, origin: 'https://app.example.test' });
  assert.ok(made.ok);
  const { token, url } = made.value;
  assert.equal(url, `https://app.example.test/app/s#${token}`);
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/app/s');
  assert.equal(parsed.hash, `#${token}`);
  assert.ok(!parsed.pathname.includes(token), 'the secret is in no path a server logs');
  const fromRoot = await linkOpened(opened, { key, record: HELD, origin: '' });
  assert.ok(fromRoot.ok);
  assert.equal(fromRoot.value.url, `/app/s#${fromRoot.value.token}`);
  assert.equal((await read(token, door().d)).status, 200, 'the link the owner is handed is one this host opens');
});

test('a refusal passes through unsigned, and a host with no key refuses before the record writes', async () => {
  const refused = { ok: false as const, refusal: { code: 'PAGE_UNKNOWN', fix: 'There is no such page to share.', at: 'record' } };
  assert.deepEqual(await linkOpened(refused as never, { key, record: HELD, origin: '' }), refused);
  let wrote = 0;
  const handlers = withShareLinks({ openShare: async () => (wrote++, { ok: true, value: {} }) } as never, async () => null);
  assert.deepEqual(await handlers.openShare!({}, {} as never), { ok: false, refusal: NO_SHARE_KEY });
  assert.equal(wrote, 0);
});

test('shareable is the owner\'s read beside the four share rows', () => {
  const row = SHARE_ROUTES.find((r) => r.name === 'shareable');
  assert.ok(row);
  assert.equal(row.group, 'ADMIN');
  assert.equal(row.writes, false);
  assert.deepEqual(SHARE_ROUTES.map((r) => r.name), ['openShare', 'closeShare', 'shares', 'sharedPage', 'shareable']);
});
