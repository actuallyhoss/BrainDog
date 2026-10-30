/**
 * Settings' writes against the record: what each gesture sends, and the answers the screen can get back.
 *
 * NO RECORD IS A REFUSAL, AND NOT THE SAMPLE. Every expectation here that read `from: 'sample'` for a host with no
 * record behind it (`UNREACHABLE`, `UNAUTHORIZED`) now reads the refusal that sample stood in for, carrying the
 * sentence the client wrote for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import type { Fetch } from './boot-live.ts';
import type { Member } from '@braindog/client';
import type { Person } from './schema.ts';
import {
  addException,
  alsoKnown,
  backUpNow,
  deleteRecordNow,
  downloadSnapshot,
  dropException,
  erasePerson,
  exportFile,
  inviteEmail,
  inviteLink,
  mintAgent,
  moveLevel,
  personOf,
  readInvites,
  readPeople,
  readSnapshots,
  removeAccess,
  restoreSnapshot,
  ruleRead,
  ruleValue,
  withdrawInvite,
  wrote,
} from './settings-write.ts';

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

  const off = await readPeople(BASE, host(null).io);
  assert.equal(off.from, 'refused', 'a host with no record behind it is drawn the sample');
  assert.match(off.from === 'refused' ? off.fix : '', /could not be reached/u);
  assert.deepEqual(
    await readPeople(BASE, host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in first.' } })).io),
    { from: 'refused', fix: 'Sign in first.' },
  );
  assert.deepEqual(await readPeople(BASE, host(() => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'x' } })).io), { from: 'unrouted' });
  assert.deepEqual(
    await readPeople(BASE, host(() => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app.' } })).io),
    { from: 'refused', fix: 'Open this from the app.' },
  );
});

test('THE SECOND NAME IS ONLY THERE WHEN IT IS A SECOND NAME, and the email was printed twice in two lines', () => {
  /* `personOf` FALLS BACK TO THE EMAIL FOR THE NAME, so a colleague the record holds no name for was
     drawn with the same address in the name slot and again in the line under it, where the email is
     supposed to be the thing that tells two people with one name apart. */
  assert.equal(alsoKnown(bo), 'bo@example.test', 'somebody with a name of their own is told apart by their address');
  assert.equal(alsoKnown({ ...bo, name: 'bo@example.test' }), '', 'the address was printed twice in two lines');
  /* AND A RECORD WITH NEITHER SAYS THE ID ONCE. */
  assert.equal(alsoKnown({ ...bo, email: '', name: 'p_bo' }), '', 'the id was printed twice in two lines');
  assert.equal(alsoKnown({ ...bo, email: '', name: 'Bo' }), 'p_bo');
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
  await addException(BASE, bo, 'payroll', 'read', null, io);
  await addException(BASE, bo, 'obligations', 'owner', null, io);
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

/* A LIST SENT WITHOUT ITS RULE IS EVERY ROW OF IT AGAIN (`members.ts`, `invite`), so every write that sends somebody's
   whole invitation carries the rules that stay, and only the lists still given keep theirs. */
test('a narrowed grant is sent with its rule, and every other write keeps it', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: member }));
  await addException(BASE, bo, 'payroll', 'read', { field: 'owner', value: 'Ben' }, io);
  /* THE RECORD'S ANSWER CARRIES `wheres` (`members.ts`), which the client's `Member` does not name yet. */
  const answered: Member & { wheres: Record<string, unknown> } = {
    person_id: 'p_bo',
    email: 'bo@example.test',
    name: 'Bo',
    level: 'read',
    scoped: [{ register: 'obligations', level: 'write' }, { register: 'payroll', level: 'read' }],
    seen_at: null,
    suspended_at: null,
    wheres: { payroll: { field: 'owner', is: 'Ben' } },
  };
  const narrowed = personOf(answered);
  await moveLevel(BASE, narrowed, 'write', io);
  await addException(BASE, narrowed, 'payroll', 'write', null, io);
  await dropException(BASE, narrowed, 'payroll', io);
  assert.deepEqual(
    sent.map((s) => s.body),
    [
      { person: 'p_bo', level: 'read', registers: { obligations: 'write', payroll: 'read' }, wheres: { payroll: { field: 'owner', is: 'Ben' } } },
      { person: 'p_bo', level: 'write', registers: { obligations: 'write', payroll: 'read' }, wheres: { payroll: { field: 'owner', is: 'Ben' } } },
      { person: 'p_bo', level: 'read', registers: { obligations: 'write', payroll: 'write' } },
      { person: 'p_bo', level: 'read', registers: { obligations: 'write' } },
    ],
  );
  assert.deepEqual(ruleRead({ field: 'owner', is: 'Ben' }), { kind: 'one', field: 'owner', value: 'Ben' });
  assert.deepEqual(ruleRead('owner is Ben'), { kind: 'words', words: 'owner is Ben' });
  assert.deepEqual(ruleRead({ any: [] }), { kind: 'other' });
  assert.deepEqual(ruleRead(null), { kind: 'unread' });
  assert.equal(ruleValue('int', '12'), 12);
  assert.equal(ruleValue('int', '1.5'), null);
  assert.equal(ruleValue('bool', 'false'), false);
  assert.equal(ruleValue('text', '  '), null);
});

test("a refusal is the record's sentence, a race says so, and no record is a refusal too", async () => {
  const refused = await removeAccess(BASE, bo, host(() => json(422, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'A record keeps one owner.' } })).io);
  assert.deepEqual(refused, { ok: false, from: 'refused', code: 'LEVEL_REQUIRED', fix: 'A record keeps one owner.', raced: false });

  const forbidden = await removeAccess(BASE, bo, host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner can do this.' } })).io);
  assert.equal(forbidden.ok ? '' : forbidden.fix, 'Only an owner can do this.');

  const unreachable = await removeAccess(BASE, bo, host(null).io);
  assert.equal(unreachable.ok ? '' : unreachable.from, 'refused');
  assert.equal(!unreachable.ok && unreachable.from === 'refused' && unreachable.code, 'UNREACHABLE');
  assert.match(unreachable.ok ? '' : unreachable.fix, /could not be reached/);

  const signedOut = await removeAccess(BASE, bo, host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in first.' } })).io);
  assert.deepEqual(signedOut, { ok: false, from: 'refused', code: 'UNAUTHORIZED', fix: 'Sign in first.', raced: false });

  assert.deepEqual(wrote({ ok: false, conflict: {} }), { ok: false, from: 'refused', code: 'VERSION_STALE', fix: copy.writeRaced, raced: true });
});

test('an export is the record as a .brainl file, cut to the sections each copy carries', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: ['#dogl 1', '{"t":"header"}'] }));
  const whole = await exportFile(BASE, 'record', 'studio', io);
  assert.deepEqual(whole, { ok: true, value: { name: 'studio.brainl', text: '#dogl 1\n{"t":"header"}\n' } });
  const pack = await exportFile(BASE, 'pack', 'studio', io);
  assert.equal(pack.ok ? pack.value.name : '', 'studio-pack.brainl');
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
  assert.equal(none.ok ? '' : none.from, 'refused');
});

test('backups, erasure and deletion send what each gesture names, and read the three answers', async () => {
  const snap = { id: '2026-09-16T12-00-00Z-now', at: '2026-09-16T12:00:00.000Z', bytes: 4096 };
  const { io, sent } = host((path) => json(200, { ok: true, value: path === '/api/snapshots' ? [snap] : path === '/api/snapshot' ? snap : null }));
  assert.deepEqual(await readSnapshots(BASE, io), { from: 'live', snapshots: [snap] });
  assert.deepEqual(await backUpNow(BASE, io), { ok: true, value: snap });
  await restoreSnapshot(BASE, snap.id, io);
  await erasePerson(BASE, { subjects: ['Mara Quill'], personId: 'p_bo', basis: 'Article 17 request' }, io);
  await deleteRecordNow(BASE, 'the-studio', io);
  assert.deepEqual(sent.map((s) => [s.path, s.method, s.body]), [
    ['/api/snapshots', 'GET', null],
    ['/api/snapshot', 'POST', {}],
    ['/api/restore', 'POST', { bookmark: snap.id }],
    ['/api/erase', 'POST', { subjects: ['Mara Quill'], personId: 'p_bo', basis: 'Article 17 request' }],
    ['/api/deleteRecord', 'POST', { slug: 'the-studio' }],
  ]);

  const unread = await readSnapshots(BASE, host(null).io);
  assert.equal(unread.from, 'refused', "a host with no record behind it is drawn the sample's copies");
  assert.equal(unread.from === 'refused' && unread.code, 'UNREACHABLE');
  const worker = host(() => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Export a copy from Settings.' } })).io;
  assert.deepEqual(await readSnapshots(BASE, worker), { from: 'refused', code: 'NOT_IN_THIS_BUILD', fix: 'Export a copy from Settings.' });
  assert.deepEqual(await backUpNow(BASE, worker), { ok: false, from: 'refused', code: 'NOT_IN_THIS_BUILD', fix: 'Export a copy from Settings.', raced: false });
  const gone = await deleteRecordNow(BASE, 'the-studio', host(null).io);
  assert.equal(!gone.ok && gone.from, 'refused');
});

test('a kept copy downloads as the file the host named, and a refusal is read the one way', async () => {
  const file = host(() => new Response(new Uint8Array([83, 81, 76]), { status: 200, headers: { 'content-disposition': 'attachment; filename="the-studio-x.dog"' } }));
  const got = await downloadSnapshot(BASE, 'x', file.io);
  assert.ok(got.ok);
  if (got.ok) {
    assert.equal(got.value.name, 'the-studio-x.dog');
    assert.equal(got.value.blob.size, 3);
  }
  assert.deepEqual(file.sent.map((s) => [s.path, s.method]), [['/api/snapshots/x', 'GET']]);

  const refused = await downloadSnapshot(BASE, 'x', host(() => json(422, { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'x is not one of the copies kept here.' } })).io);
  assert.deepEqual(refused, { ok: false, from: 'refused', code: 'OUT_OF_BOUNDS', fix: 'x is not one of the copies kept here.', raced: false });
  const off = await downloadSnapshot(BASE, 'x', host(null).io);
  assert.equal(!off.ok && off.from, 'refused');
  /* AND IT SAYS SO. This arm handed the screen an empty sentence, which only the sample's toast ever covered. */
  assert.equal(!off.ok && off.fix, copy.recordNotReached);
  const html = await downloadSnapshot(BASE, 'x', host(() => new Response('<html>', { status: 404 })).io);
  assert.equal(!html.ok && html.from, 'refused');
  assert.equal(!html.ok && html.fix, copy.recordNotReached);
});

test('an invitation is minted for one address, handed back once as a link, listed and withdrawn', async () => {
  const invitation = {
    id: 'inv_1', email: 'bo@example.com', level: 'write' as const, registers: {}, invited_by: 'p_ada',
    created_at: '2026-09-16T12:00:00.000Z', expires_at: '2026-09-17T12:00:00.000Z', expired: false,
  };
  const made = { invitation, token: 'rec_1.thesecret' };
  const { io, sent } = host((path) =>
    json(200, {
      ok: true,
      value: path === '/api/invitations' ? [invitation] : path === '/api/revokeInvite' ? { id: 'inv_1', revoked_at: '2026-09-16T13:00:00.000Z' } : made,
    }),
  );
  assert.deepEqual(await inviteEmail(BASE, '  bo@example.com ', { level: 'write' }, io), { ok: true, value: made });
  assert.deepEqual(await readInvites(BASE, io), { from: 'live', invites: [invitation] });
  assert.ok((await withdrawInvite(BASE, 'inv_1', io)).ok);
  assert.deepEqual(sent.map((s) => [s.path, s.method, s.body]), [
    ['/api/invite', 'POST', { email: 'bo@example.com', level: 'write' }],
    ['/api/invitations', 'GET', null],
    ['/api/revokeInvite', 'POST', { id: 'inv_1' }],
  ]);

  /* THE LINK IS THIS ORIGIN AND THE TOKEN IN THE FRAGMENT, whatever trailing slashes the origin arrived with. */
  /* UNDER THE APP, AND WITH NO SLUG: the token names its record, and the person opening it may be on no record yet. */
  assert.equal(inviteLink('http://record.test/', made.token), 'http://record.test/invite#rec_1.thesecret');

  /* A HOST OLDER THAN INVITATIONS LISTS NONE rather than draw a refusal: it is a record, with no such list to read. */
  const old = host(() => json(422, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This record has no such method.' } })).io;
  assert.deepEqual(await readInvites(BASE, old), { from: 'unrouted' });
  /* AND ONE WITH NO RECORD BEHIND IT IS A REFUSAL. Both read `sample`, so a signed-out reader and a host older than the
     method were answered alike, and neither answer was true. */
  const signedOut = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in first.' } })).io;
  assert.deepEqual(await readInvites(BASE, signedOut), { from: 'refused', fix: 'Sign in first.' });
  const unreached = await readInvites(BASE, host(null).io);
  assert.equal(unreached.from, 'refused');
  const said = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner sees invitations.' } })).io;
  assert.deepEqual(await readInvites(BASE, said), { from: 'refused', fix: 'Only an owner sees invitations.' });
});

test('CONNECT AN AGENT SENDS THE INBOX ONLY WHEN IT WAS CHOSEN, and an ordinary agent is sent what it always was', async () => {
  /* MEASURED BEFORE THIS: the screen minted `{ scope: 'write', label, days }` whatever the owner wanted, so no token made
     in Settings could carry the reach the record's inbox gate reads. */
  const minted = { id: 't_1', bearer: 'rec_1.thesecret', scope: 'write', reach: ['inbox'], expires_at: '2026-12-24T09:00:00.000Z' };
  const { io, sent } = host(() => json(200, { ok: true, value: minted }));
  assert.deepEqual(await mintAgent(BASE, { label: 'triage', inbox: true, days: 90 }, io), { ok: true, value: minted });
  assert.ok((await mintAgent(BASE, { label: 'laptop', inbox: false, days: 90 }, io)).ok);
  assert.deepEqual(sent.map((s) => [s.path, s.method, s.body]), [
    ['/api/createToken', 'POST', { scope: 'write', label: 'triage', days: 90, reach: ['inbox'] }],
    ['/api/createToken', 'POST', { scope: 'write', label: 'laptop', days: 90 }],
  ]);

  /* THE RECORD'S REFUSAL IS WHAT THE OWNER READS, as it is for every other write here. */
  const refused = host(() => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app.' } })).io;
  assert.deepEqual(await mintAgent(BASE, { label: 'x', inbox: true, days: 90 }, refused), {
    ok: false,
    from: 'refused',
    code: 'NEEDS_BROWSER_SESSION',
    fix: 'Open this from the app.',
    raced: false,
  });
});
