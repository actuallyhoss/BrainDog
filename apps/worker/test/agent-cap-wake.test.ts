/**
 * The agent cap holds from a wake, not only from a move. The kernel refuses the next key only
 * where `host_meta` holds the plan's count (`plan.agents`), and before this only `planMoved` wrote it, so a record made
 * with no `setPlan`, or one that missed billing's word, minted keys without end on a plan that promises three.
 *
 * THROUGH THE WORKER AS IT SHIPS: `src/index.ts` bundled, a real Directory, real record objects (`cloud-harness.ts`).
 * A wake is a fresh `Record$` over the same storage, as after an eviction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW';
const OWNER = 'ada@example.test';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

/** A record made the way `provision` makes one, its owner signed in, and the Directory told its plan with no `planMoved`. */
async function made(plan: string | null) {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  if (plan !== null) assert.equal((c.directory as unknown as { setPlan(r: string, p: string): unknown }).setPlan(REC, plan), null);
  const mint = async (label: string) => {
    const res = await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope: 'write', label }) });
    return { status: res.status, body: (await res.json()) as Out };
  };
  const held = (): string | null =>
    (c.storages.get(REC)?.sql.exec("SELECT value FROM sqlite_master m, host_meta h WHERE m.name = 'host_meta' AND h.key = 'plan.agents'").toArray()[0] as
      | { value: string }
      | undefined)?.value ?? null;
  return { ...c, cookie, mint, held };
}

test('A FREE RECORD MADE WITH NO setPlan REFUSES ITS FOURTH KEY after one wake', async () => {
  const c = await made('free');
  c.open(REC);
  for (const label of ['laptop', 'phone', 'server']) {
    const out = await c.mint(label);
    assert.equal(out.status, 200, JSON.stringify(out.body));
  }
  assert.equal(c.held(), JSON.stringify({ agents: 3, plan: 'Free', next: 'Cloud' }));
  const fourth = await c.mint('desk');
  assert.equal(fourth.status, 403, JSON.stringify(fourth.body));
  assert.equal(fourth.body.refusal?.code, 'FORBIDDEN');
  assert.equal(fourth.body.refusal?.at, 'plan');
  assert.match(fourth.body.refusal?.fix ?? '', /Free/u, 'the refusal names the plan');
  assert.match(fourth.body.refusal?.fix ?? '', /Cloud/u, 'the refusal offers the way on');
  assert.doesNotMatch(fourth.body.refusal?.fix ?? '', /rec_|—/u, 'an id or an em dash in the refusal');
});

test('A RECORD ON CLOUD BY DEFAULT HOLDS FIFTEEN from its wake', async () => {
  const c = await made(null);
  c.open(REC);
  assert.equal((await c.mint('laptop')).status, 200);
  assert.equal(c.held(), JSON.stringify({ agents: 15, plan: 'Cloud', next: 'Cloud Plus' }));
});
