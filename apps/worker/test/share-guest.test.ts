/**
 * A guest on the Worker as it ships (sharing plan slice 8): a share to an address, the link accepted by its person
 * signed in, the record in their switcher; then the share stopped, their next call refused, and the Directory's `leave`
 * followed, so the record is gone from their switcher and `reaches` no longer names them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const GUEST = 'bo@example.test';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

test('THE LAST SHARE STOPPED: the guest is refused on the next call and the record leaves their switcher', async () => {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const owner = await c.signIn(OWNER);
  const call = async (cookie: string, method: string, body: object) => {
    const res = await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(body) });
    return { status: res.status, out: (await res.json()) as Out };
  };

  const shared = await call(owner, 'share', { share: { who: { kind: 'email', id: GUEST }, what: { record: true }, can: 'view', when: { until: '2099-01-01T00:00:00.000Z' } } });
  assert.equal(shared.status, 200, JSON.stringify(shared.out));
  const minted = await call(owner, 'invite', { email: GUEST });
  assert.equal(minted.status, 200, JSON.stringify(minted.out));
  const token = minted.out.value?.['token'] as string;

  /* ACCEPTED SIGNED IN, the first of `/auth/invite`'s three ways. */
  const dir = c.directory as unknown as { invitee(e: string): { ok: boolean; value: { id: string } }; reaches(p: string): { record: string }[] | Promise<{ record: string }[]> };
  const bo = dir.invitee(GUEST);
  assert.ok(bo.ok);
  const guest = await c.signIn(GUEST);
  const accepted = await c.ask('/auth/invite', { method: 'POST', cookie: guest, body: JSON.stringify({ inviteToken: token, accept: true }) });
  assert.equal(accepted.status, 200, await accepted.text());

  const records = async () => ((await (await c.ask('/account/records', { cookie: guest })).json()) as { value?: { slug: string }[] }).value ?? [];
  assert.deepEqual((await records()).map((r) => r.slug), ['studio']);
  assert.equal((await call(guest, 'whoami', {})).status, 200);

  const id = String((c.storages.get(REC)?.sql.exec('SELECT id FROM share').toArray()[0] as { id: string } | undefined)?.id);
  const stopped = await call(owner, 'unshare', { id });
  assert.equal(stopped.status, 200, JSON.stringify(stopped.out));
  assert.deepEqual(stopped.out.value?.['left'], [bo.value.id]);

  /* TOLD THEIR ACCESS ENDED, IN THE OWNER'S NAME, at the root and under the record's name, with the header the service
     worker deletes its copy on (sharing plan §2.8). */
  for (const path of ['/api/whoami', '/app/studio/api/whoami']) {
    const res = await c.ask(path, { method: 'POST', cookie: guest, body: '{}' });
    assert.equal(res.status, 403, path);
    assert.equal(res.headers.get('x-braindog-access'), 'ended', path);
    const said = ((await res.json()) as Out).refusal;
    assert.equal(said?.at, 'access', path);
    assert.match(said?.fix ?? '', /^Your access to .+ ended\. Ask .+ if you need it back\.$/u, path);
  }
  assert.deepEqual(await records(), []);
  assert.ok(!(await dir.reaches(bo.value.id)).some((r) => r.record === REC), 'the Directory still names the guest');
});
