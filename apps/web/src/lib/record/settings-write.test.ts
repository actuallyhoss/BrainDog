/**
 * Settings' writes against the record: what each gesture sends, and the three answers the screen can get back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import type { Fetch } from './boot-live.ts';
import type { Person } from './schema.ts';
import { addException, dropException, exportFile, moveLevel, readPeople, removeAccess, wrote } from './settings-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { path: string; method: string; body: unknown };

function host(answer: ((path: string) => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    sent.push({ path, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    if (!answer) throw new TypeError('fetch failed');
    return answer(path);
  }) as Fetch;
  return { io, sent };
}

const bo: Person = {
  id: 'p_bo',
  name: 'Bo',
  level: 'read',
  scoped: [{ register: 'obligations', level: 'write' }],
  email: 'bo@example.test',
  since: null,
  suspended: null,
  seen: null,
};

const member = { person_id: 'p_bo', email: 'bo@example.test', name: 'Bo', level: 'write', scoped: [], seen_at: null, suspended_at: null };

test("the people are the record's members, drawn as the screen's persons", async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: [member, { ...member, person_id: 'p_x', name: null, level: null }] }));
  const out = await readPeople(BASE, io);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.people.map((p) => [p.id, p.name, p.level]), [
    ['p_bo', 'Bo', 'write'],
    ['p_x', 'bo@example.test', null],
  ]);
  assert.deepEqual(sent.map((s) => [s.path, s.method]), [['/api/members', 'GET']]);

  assert.deepEqual(await readPeople(BASE, host(null).io), { from: 'sample' });
  assert.deepEqual(await readPeople(BASE, host(() => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'x' } })).io), { from: 'unrouted' });
  assert.deepEqual(
    await readPeople(BASE, host(() => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app.' } })).io),
    { from: 'refused', fix: 'Open this from the app.' },
  );
});

test('a level change sends the whole of what they would hold, exceptions included', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: member }));
  const out = await moveLevel(BASE, bo, 'write', io);
  assert.ok(out.ok);
  assert.deepEqual(sent, [{ path: '/api/invite', method: 'POST', body: { person: 'p_bo', level: 'write', registers: { obligations: 'write' } } }]);

  /* NO RECORD LEVEL IS THE KEY LEFT OFF, which is how `invite` takes one away. */
  await moveLevel(BASE, bo, null, io);
  assert.deepEqual(sent[1]?.body, { person: 'p_bo', registers: { obligations: 'write' } });
});

test('an exception is added or taken back inside the same invitation', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: member }));
  await addException(BASE, bo, 'payroll', 'read', io);
  await addException(BASE, bo, 'obligations', 'owner', io);
  await dropException(BASE, bo, 'obligations', io);
  assert.deepEqual(
    sent.map((s) => s.body),
    [
      { person: 'p_bo', level: 'read', registers: { obligations: 'write', payroll: 'read' } },
      { person: 'p_bo', level: 'read', registers: { obligations: 'owner' } },
      { person: 'p_bo', level: 'read', registers: {} },
    ],
  );
});

test("a refusal is the record's sentence, a race says so, and no record is the sample", async () => {
  const refused = await removeAccess(BASE, bo, host(() => json(422, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'A record keeps one owner.' } })).io);
  assert.deepEqual(refused, { ok: false, from: 'refused', code: 'LEVEL_REQUIRED', fix: 'A record keeps one owner.', raced: false });

  const forbidden = await removeAccess(BASE, bo, host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner can do this.' } })).io);
  assert.equal(forbidden.ok ? '' : forbidden.fix, 'Only an owner can do this.');

  const unreachable = await removeAccess(BASE, bo, host(null).io);
  assert.equal(unreachable.ok ? '' : unreachable.from, 'sample');
  assert.match(unreachable.ok ? '' : unreachable.fix, /could not be reached/);

  assert.deepEqual(wrote({ ok: false, conflict: {} }), { ok: false, from: 'refused', code: 'VERSION_STALE', fix: copy.writeRaced, raced: true });
});

test('an export is the record as a .dogl file, cut to the sections each copy carries', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: ['#dogl 1', '{"t":"header"}'] }));
  const whole = await exportFile(BASE, 'record', 'studio', io);
  assert.deepEqual(whole, { ok: true, value: { name: 'studio.dogl', text: '#dogl 1\n{"t":"header"}\n' } });
  const pack = await exportFile(BASE, 'pack', 'studio', io);
  assert.equal(pack.ok ? pack.value.name : '', 'studio-pack.dogl');
  await exportFile(BASE, 'rows', 'studio', io);
  assert.deepEqual(
    sent.map((s) => [s.path, s.method, s.body]),
    [
      ['/api/export', 'POST', {}],
      ['/api/export', 'POST', { sections: ['header', 'governance'] }],
      ['/api/export', 'POST', { sections: ['header', 'data'] }],
    ],
  );
  const none = await exportFile(BASE, 'record', 'studio', host(() => new Response('<html>', { status: 404 })).io);
  assert.equal(none.ok ? '' : none.from, 'sample');
});
