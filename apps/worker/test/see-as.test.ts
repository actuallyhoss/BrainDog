/**
 * See as at the Worker's door: `x-braindog-as` is read only by the API door, only for an owner's
 * or an Admin's cookie, never as an owner, and the context it makes is the person's own, marked `preview`. The router
 * then refuses every route that writes under it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult, Who } from '@braindog/ports';
import { ROUTES, serveApi } from '@braindog/host';

import { doorOf, type Deps, type Held } from '../src/session.ts';

const SID = 'S'.repeat(43);
const ORIGIN = 'https://brain.dog';

const HELD: Record<string, Held> = {
  p_own: { level: 'owner', registers: null, levels: {} },
  p_own2: { level: 'owner', registers: null, levels: {} },
  p_adm: { level: 'decide', registers: null, levels: {} },
  p_mem: { level: 'write', registers: null, levels: {} },
  p_pri: { level: null, registers: ['tasks'], levels: { tasks: 'write' }, wheres: { tasks: { field: 'stage', is: 'Review' } } },
  /* AN ADMIN HELD OFF PAYROLL (adds only, which reads nothing), shown some of the tasks, and kept from the deals' value. */
  p_held: { level: 'decide', registers: null, levels: { payroll: 'append' }, wheres: { tasks: { field: 'team', is: 'Ops' } }, hides: { deals: ['value'] } },
  /* AN ADMIN WHO REACHES ONLY TWO LISTS. */
  p_two: { level: 'decide', registers: ['tasks', 'deals'], levels: {} },
  /* THE BOOKKEEPER, who reads payroll. */
  p_book: { level: 'write', registers: null, levels: {} },
};

const deps = (person: string, seeAs?: true): Deps => ({
  origin: ORIGIN,
  session: async () => ({ status: 200, body: { person, email: `${person}@example.test`, record: 'rec_1', provedAt: 1, passkey: true } }) as AuthResult<Who>,
  access: async (_record, p) => HELD[p] ?? null,
  ...(seeAs === undefined ? {} : { seeAs }),
});

const asked = (as?: string, method = 'GET', path = '/api/list'): Request =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { cookie: `__Host-bd_s=${SID}`, origin: ORIGIN, ...(as === undefined ? {} : { 'x-braindog-as': as }) },
  });

test('an owner or an Admin sees as somebody, as their own context marked preview', async () => {
  for (const viewer of ['p_own', 'p_adm']) {
    const door = await doorOf(asked('p_pri'), deps(viewer, true));
    assert.equal(door.door, 'session');
    if (door.door !== 'session') return;
    assert.equal(door.ctx.preview, 'p_pri');
    assert.deepEqual(door.ctx.principal, { kind: 'person', id: 'p_pri', level: null });
    assert.deepEqual(door.ctx.wheres, { tasks: { field: 'stage', is: 'Review' } });
    assert.equal(door.ctx.confirmable, false);
  }
  /* WITHOUT THE HEADER, the viewer's own context, and it says whether they can confirm with a passkey. */
  const plain = await doorOf(asked(), deps('p_own', true));
  assert.ok(plain.door === 'session' && plain.ctx.preview === undefined && plain.ctx.confirmable === true);
});

test('never as an owner, never by a member, never somebody not on the record, never at another door', async () => {
  for (const [viewer, as] of [['p_adm', 'p_own'], ['p_own', 'p_own2'], ['p_mem', 'p_pri'], ['p_own', 'p_gone']] as const) {
    const door = await doorOf(asked(as), deps(viewer, true));
    assert.equal(door.door, 'refused', `${viewer} as ${as}`);
    if (door.door === 'refused') assert.equal(door.status, 403);
  }
  /* A DOOR THAT DID NOT ASK FOR IT (a file, an OAuth consent) never reads the header. */
  const other = await doorOf(asked('p_pri'), deps('p_own'));
  assert.ok(other.door === 'session' && other.ctx.preview === undefined && other.ctx.principal.id === 'p_own');
});

test('every route that writes is refused under preview before its handler runs, and a read is answered', async () => {
  const door = await doorOf(asked('p_pri', 'POST'), deps('p_own', true));
  assert.ok(door.door === 'session');
  if (door.door !== 'session') return;
  let ran = 0;
  const handlers = Object.fromEntries(ROUTES.map((r) => [r.name, async () => (ran++, { ok: true as const, value: null })]));
  const writes = ROUTES.filter((r) => r.writes && r.postRead !== true);
  assert.ok(writes.length > 50);
  for (const r of writes) {
    const res = await serveApi(new Request(`${ORIGIN}/api/${r.name}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), handlers, door.ctx);
    assert.equal(res.status, 403, r.name);
    const body = (await res.json()) as { refusal: { code: string; at: string } };
    assert.deepEqual([body.refusal.code, body.refusal.at], ['FORBIDDEN', 'preview'], r.name);
  }
  assert.equal(ran, 0, 'no handler ran');
  const read = await serveApi(new Request(`${ORIGIN}/api/list?register=tasks`), handlers, door.ctx);
  assert.equal(read.status, 200);
  assert.equal(ran, 1);
});

/* SEE AS IS NO WIDER THAN THE VIEWER. It read only the person's lens, so an Admin held off payroll read Sam's salary by
   seeing as the bookkeeper who holds it. Now the preview is the person's lens held inside the viewer's. */
test('an Admin held off a list does not read it by seeing as somebody who holds it', async () => {
  const door = await doorOf(asked('p_book'), deps('p_held', true));
  assert.equal(door.door, 'session');
  if (door.door !== 'session') return;
  assert.equal(door.ctx.preview, 'p_book');
  assert.equal(door.ctx.wheres?.payroll, null, 'payroll was open to the preview');
  assert.deepEqual(door.ctx.wheres?.tasks, { field: 'team', is: 'Ops' });
  assert.deepEqual(door.ctx.hides, { deals: ['value'] });

  /* BOTH RULES ON A LIST BOTH NARROW. */
  const both = await doorOf(asked('p_pri'), deps('p_held', true));
  assert.ok(both.door === 'session');
  if (both.door !== 'session') return;
  assert.deepEqual(both.ctx.wheres?.tasks, { all: [{ field: 'stage', is: 'Review' }, { field: 'team', is: 'Ops' }] });
  assert.deepEqual(both.ctx.registers, ['tasks']);
});

test('an Admin who reaches some lists sees only those of the person, and cannot see as somebody who reaches every list', async () => {
  const some = await doorOf(asked('p_pri'), deps('p_two', true));
  assert.ok(some.door === 'session');
  if (some.door === 'session') assert.deepEqual(some.ctx.registers, ['tasks']);
  const all = await doorOf(asked('p_book'), deps('p_two', true));
  assert.equal(all.door, 'refused');
  if (all.door === 'refused') assert.equal(all.status, 403);
});
