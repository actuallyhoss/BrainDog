/**
 * Where a mailed sign-in link sends him once he is in: the page he was sent from, carried in the link's query.
 *
 * MEASURED FIRST. `linkOf` wrote
 * `/app/signin#magic=<token>` with no query whatever the sign-in page had been handed, so a link opened from the mail
 * landed on a page whose `onward()` read an empty search and sent him to `/app/`, not to the record that asked him to
 * sign in. The link carries `?next=` now, and only a page of the app on this origin (`appNext`): a `next` is typed by
 * whoever wrote the link that reached the sign-in page, so anything else would make the mail an open redirect with our
 * name on it. The app is at the root since 29 Oct, so a page is any path that is not one of the host's own doors.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';

import { appNext, serveAuth, type AuthDoor } from '../src/auth.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const ORIGIN = 'https://studio.example';

function setup() {
  const d = createDirectory(openSqlite(), fixedClock(NOW), {
    mac: new Uint8Array(32).fill(7),
    rp: { id: 'studio.example', origin: ORIGIN },
    magic: true,
  });
  assert.ok(d.person$('ada@example.com', 'Ada').ok);
  assert.ok(d.provision({ slug: 'the-studio', email: 'ada@example.com' }).ok);
  const sent: string[] = [];
  const door: AuthDoor = { on: 'worker', origin: ORIGIN, auth: d.auth, ip: '203.0.113.9', mail: (_to, link) => void sent.push(link) };
  const call = async (path: string, body: unknown) => {
    const res = await serveAuth(
      new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      door,
    );
    return { status: res.status, raw: await res.text() };
  };
  /* One send, and the link it mailed. */
  const mailed = async (next: unknown): Promise<string> => {
    const before = sent.length;
    const out = await call('/auth/magic/start', { email: 'ada@example.com', next });
    assert.equal(out.status, 200);
    assert.equal(sent.length, before + 1, 'no link was mailed');
    return sent[sent.length - 1] ?? '';
  };
  return { call, mailed };
}

test('THE MAILED LINK CARRIES THE PAGE HE WAS SENT FROM, and still spends by its fragment', async () => {
  const { call, mailed } = setup();
  const link = await mailed('/the-studio/r/tasks?where=open');
  const m = /^https:\/\/studio\.example\/signin\?next=([^#]+)#magic=([A-Za-z0-9_-]{43})$/.exec(link);
  assert.ok(m, `the link is ${link}`);
  assert.equal(new URLSearchParams(`next=${m[1]}`).get('next'), '/the-studio/r/tasks?where=open');
  /* The token is where it always was, so the landing and `takeLink` are unchanged. */
  assert.equal((await call('/auth/magic/redeem', { linkToken: m[2] })).status, 200);
});

/* A DIRECTORY FOR EACH, because the first run of this test shared one and answered 429 partway down the list: the
   send lockout reserves per asking address and per address asked about, and fifteen links to Ada from one IP inside
   its window is exactly what it exists to refuse. */
test('A NEXT FROM BEFORE THE MOVE IS MAILED AS THE ADDRESS IT NAMES NOW', async () => {
  const link = await setup().mailed('/app/the-studio/r/tasks');
  const m = /^https:\/\/studio\.example\/signin\?next=([^#]+)#magic=[A-Za-z0-9_-]{43}$/.exec(link);
  assert.ok(m, `the link is ${link}`);
  assert.equal(new URLSearchParams(`next=${m[1]}`).get('next'), '/the-studio/r/tasks');
});

test('A NEXT THAT COULD LEAVE THE APP IS DROPPED, and the link is the bare one', async () => {
  const bare = /^https:\/\/studio\.example\/signin#magic=[A-Za-z0-9_-]{43}$/;
  for (const next of [
    undefined,
    '',
    '//evil.example/app/x',
    '/\\evil.example',
    '/app\\..\\evil',
    '/app/%5C%5Cevil.example',
    'https://evil.example/app/',
    `${ORIGIN}/app/the-studio`,
    'javascript:alert(1)',
    '/app/\n/x',
    /* One of the host's doors and not a page: `onward()` on the page would drop it too, so the link does not carry it. */
    '/auth/session',
    '/api/export',
    '/app/../auth/session',
    '/in/webhook/x',
    '/mcp',
    '/.well-known/braindog-build',
    /* The front door, which is where the bare link lands anyway. */
    '/',
    '/app',
    ['/the-studio'],
    42,
  ]) {
    const link = await setup().mailed(next);
    assert.match(link, bare, `${JSON.stringify(next)} made ${link}`);
  }
});

test('THE ANSWER SAYS NOTHING OF THE NEXT: a known address and an unknown one still read the same', async () => {
  const { call } = setup();
  const next = '/the-studio/r/tasks';
  const known = await call('/auth/magic/start', { email: 'ada@example.com', next });
  const unknown = await call('/auth/magic/start', { email: 'nobody@example.com', next });
  assert.deepEqual([known.status, known.raw], [unknown.status, unknown.raw]);
  assert.ok(!known.raw.includes('the-studio'), 'the answer echoed the next');
});

test('appNext IS A PAGE OF THE APP OR NOTHING: a door is refused, and an address from under `/app` is read as the new one', () => {
  for (const door of ['/auth/session', '/api/x', '/app/../auth/x', '/app/api/boot', '/account/close', '/oauth/authorize', '/in/x', '/mcp', '/healthz', '/_app/version.json', '/drawn-frame', '/.well-known/oauth-authorization-server'])
    assert.equal(appNext(door), null, door);
  assert.equal(appNext('/app/acme/r'), '/acme/r');
  assert.equal(appNext('/app/acme/r?f=x#b-2'), '/acme/r?f=x#b-2');
  assert.equal(appNext('/app'), '/');
  assert.equal(appNext('/app/'), '/');
  assert.equal(appNext('/acme/r/tasks'), '/acme/r/tasks');
  assert.equal(appNext('/r/tasks'), '/r/tasks');
  assert.equal(appNext('/apple'), '/apple', 'only the whole segment is the old prefix');
  /* What `safeNext` refuses is the front door, and the front door is a page. */
  assert.equal(appNext('//evil.example/x'), '/');
  assert.equal(appNext('https://evil.example/'), '/');
});

/* SEC4 (security review of 30 Oct): `/app` WAS TAKEN OFF AFTER `safeNext`, AND ONE SLASH WITH IT, so `/app//evil.example/x`
   came back `//evil.example/x` and was mailed and followed as another host. */
test('SEC4: appNext NEVER ANSWERS ANOTHER HOST, HOWEVER THE /app IN FRONT OF IT IS SPELLED', () => {
  for (const next of ['/app//evil.example/x', '/app///evil.example', '/app/%2F/x', '/app/%2F%2Fevil.example', '/app//%2Fevil.example']) {
    const to = appNext(next);
    if (to === null) continue;
    assert.ok(to.startsWith('/') && !to.startsWith('//'), `${next} came back ${to}`);
    assert.ok(!decodeURIComponent(to).startsWith('//'), `${next} decodes to another host: ${to}`);
  }
  assert.equal(appNext('/app//evil.example/x'), '/evil.example/x');
});
