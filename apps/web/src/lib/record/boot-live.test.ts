/**
 * The shell's read: the record's `boot` drawn in the sample's shape, the sample when there is no record, the record's
 * sentence for any other refusal, and one request for the tab.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forget, layoutOf, newsOf, readBoot, type Fetch } from './boot-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    sent.push(String(url));
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as Fetch;
  return { io, sent };
}

const line = (over: Record<string, unknown>) => ({
  rowid: 1,
  id: 'e1',
  ts: '2026-09-15T09:00:00.000Z',
  actor: 'p_1',
  kind: 'create',
  target: null,
  target_kind: null,
  field: null,
  from: null,
  to: null,
  note: null,
  register: null,
  seq: null,
  title: null,
  ...over,
});

const BOOT = {
  registers: [
    { id: 'obligations', name: 'Obligations', count: 3 },
    { id: 'services', name: 'Services', count: 0 },
  ],
  now: '2026-09-15T12:00:00.000Z',
  waiting: [{ id: 'SG4', body_kind: 'options', opened_by: 'p_2', opened_at: '2026-09-14T08:00:00.000Z', question: 'Renew the domain?' }],
  record: { slug: 'the-studio', name: 'The Studio', locale: 'en' },
  me: { kind: 'person', person: 'p_1', name: 'Ada', level: 'write' },
  pages: [
    { slug: 'money', title: 'Money', nav: { section: 'Work', order: 2 }, icon: 'no-such-icon' },
    { slug: 'loose', title: 'Loose', nav: null, icon: null },
  ],
  counts: { decide: 30, inbox: null },
  whatsNew: {
    events: [
      line({ rowid: 9, actor: 'rule:renewal', register: 'obligations', seq: 3, title: 'Rent', target: 'entry:x', target_kind: 'entry' }),
      line({ rowid: 8, kind: 'suggest', actor: 'p_2', target: 'SG4', target_kind: 'suggestion', title: 'Renew the domain?' }),
    ],
    upTo: 9,
    sinceCapped: true,
  },
};

test("the record's boot is drawn in the shell's shape, with nothing of the sample in it", () => {
  const shell = layoutOf(BOOT as never);
  assert.equal(shell.live, true);
  assert.equal(shell.index.name, 'The Studio');
  assert.deepEqual(
    shell.index.registers.map((r) => [r.id, r.count, r.views.length]),
    [['obligations', 3, 0]],
    'an empty list reached the rail',
  );
  assert.deepEqual(
    shell.lists.map((l) => l.id),
    BOOT.registers.map((r) => r.id),
    'an empty list could not be filed into or given an exception on',
  );
  assert.deepEqual(shell.nav.map((n) => [n.href, n.section, n.icon]), [['/p/money', 'Work', 'doc']]);
  assert.deepEqual(shell.me, { person: 'p_1', level: 'write', owner: false, records: [{ slug: 'the-studio', name: 'The Studio', level: 'write' }] });
  assert.deepEqual(shell.questions.map((q) => [q.id, q.title]), [['SG4', 'Renew the domain?']]);
  assert.equal(shell.inbox, 0, 'a count the record withheld became a number');
  assert.equal(shell.open, 30, 'the rail counted the list boot caps, not the questions the record has open');
  assert.equal(shell.now, Date.parse('2026-09-15T12:00:00.000Z'));
  assert.equal(shell.upTo, 9);
  assert.equal(shell.sinceCapped, true);
  assert.deepEqual(shell.pen, []);
  assert.deepEqual(shell.people, []);
});

test('a line of the log becomes a feed item in words, and the reader is "you"', () => {
  const items = newsOf(BOOT.whatsNew.events as never, 'p_2');
  assert.deepEqual(items[0], { at: '2026-09-15T09:00:00.000Z', by: 'rule.renewal', text: 'Added Rent', href: '/r/obligations/3' });
  assert.deepEqual(items[1], { at: '2026-09-15T09:00:00.000Z', by: 'you', text: 'Asked: Renew the domain?', href: '/decide/SG4' });
  assert.equal(newsOf([line({ kind: 'export', note: null })] as never, null)[0]?.text, 'Export');
  assert.equal(newsOf([line({ kind: 'export' })] as never, null)[0]?.href, '/audit');
});

test('a pack install names the list it brought, not the bare verb', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ actor: 'system', target_kind: 'pack', ...over })] as never, null)[0]?.text;
  assert.equal(at({ kind: 'install', target: 'pack:estate' }), 'Added the Services list');
  assert.equal(at({ kind: 'uninstall', target: 'pack:estate' }), 'Removed the Services list');
  assert.equal(at({ kind: 'install', target: 'pack:nobody-knows' }), 'Added the nobody-knows add-on');
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } })],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const) {
  test(`${what}: the shell draws the sample, and asks once for the tab`, async () => {
    forget();
    const { io, sent } = host(answer);
    assert.deepEqual(await readBoot(BASE, io), { from: 'sample' });
    assert.deepEqual(await readBoot(BASE, io), { from: 'sample' });
    assert.equal(sent.length, 1);
    assert.equal(new URL(sent[0]!).pathname, '/api/boot');
    forget();
  });
}

test("any other refusal is the record's sentence, and is asked again", async () => {
  forget();
  const { io, sent } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner.' } }));
  assert.deepEqual(await readBoot(BASE, io), { from: 'refused', code: 'FORBIDDEN', fix: 'Ask the owner.' });
  await readBoot(BASE, io);
  assert.equal(sent.length, 2, 'a refusal about the record was kept for the tab');
  forget();
});

test('a live boot is kept for the tab until it is forgotten', async () => {
  forget();
  const { io, sent } = host(() => json(200, { ok: true, value: BOOT }));
  const first = await readBoot(BASE, io);
  assert.equal(first.from, 'live');
  await readBoot(BASE, io);
  assert.equal(sent.length, 1, 'every navigation asked the record again');
  forget();
  await readBoot(BASE, io);
  assert.equal(sent.length, 2);
  forget();
});
