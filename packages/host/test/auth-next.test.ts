/**
 * Where a mailed sign-in link sends him once he is in: the page he was sent from, carried in the link's query.
 *
 * MEASURED FIRST (`loop/research-batch-forty-six-audit.md`, "Found on the way"). `linkOf` wrote
 * `/app/signin#magic=<token>` with no query whatever the sign-in page had been handed, so a link opened from the mail
 * landed on a page whose `onward()` read an empty search and sent him to `/app/`, not to the record that asked him to
 * sign in. The link carries `?next=` now, and only a path under `/app` on this origin: a `next` is typed by whoever
 * wrote the link that reached the sign-in page, so anything else would make the mail an open redirect with our name on it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';

import { serveAuth, type AuthDoor } from '../src/auth.ts';
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
  const link = await mailed('/app/the-studio/r/tasks?where=open');
  const m = /^https:\/\/studio\.example\/app\/signin\?next=([^#]+)#magic=([A-Za-z0-9_-]{43})$/.exec(link);
  assert.ok(m, `the link is ${link}`);
  assert.equal(new URLSearchParams(`next=${m[1]}`).get('next'), '/app/the-studio/r/tasks?where=open');
  /* The token is where it always was, so the landing and `takeLink` are unchanged. */
  assert.equal((await call('/auth/magic/redeem', { linkToken: m[2] })).status, 200);
});

/* A DIRECTORY FOR EACH, because the first run of this test shared one and answered 429 partway down the list: the
   send lockout reserves per asking address and per address asked about, and fifteen links to Ada from one IP inside
   its window is exactly what it exists to refuse. */
test('A NEXT THAT COULD LEAVE THE APP IS DROPPED, and the link is the bare one', async () => {
  const bare = /^https:\/\/studio\.example\/app\/signin#magic=[A-Za-z0-9_-]{43}$/;
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
    /* Outside the app: `onward()` on the page would drop it too, so the link does not carry it. */
    '/r/tasks',
    '/',
    '/apple',
    ['/app/the-studio'],
    42,
  ]) {
    const link = await setup().mailed(next);
    assert.match(link, bare, `${JSON.stringify(next)} made ${link}`);
  }
});

test('THE ANSWER SAYS NOTHING OF THE NEXT: a known address and an unknown one still read the same', async () => {
  const { call } = setup();
  const next = '/app/the-studio/r/tasks';
  const known = await call('/auth/magic/start', { email: 'ada@example.com', next });
  const unknown = await call('/auth/magic/start', { email: 'nobody@example.com', next });
  assert.deepEqual([known.status, known.raw], [unknown.status, unknown.raw]);
  assert.ok(!known.raw.includes('the-studio'), 'the answer echoed the next');
});
