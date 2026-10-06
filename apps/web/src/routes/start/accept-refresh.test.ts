/**
 * People goes in before the lists it links to, so the first run plans it again once they are all in, and installs that
 * plan only when it changes something (`accept.ts` `refreshModule`).
 *
 * A FAKE RECORD, NOT A SOCKET, as `accept-self.test.ts` has it: an empty record that takes People and Money in turn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { propose } from '../../lib/start/propose.ts';
import { accept, type Accepting } from './accept.ts';

type Call = { name: string; args: unknown };

/**
 * A record that holds each module once it is installed; a plan of an installed one changes `changes` things, and asks
 * for `approve` to be approved. `before` is what it held before the press.
 */
function record(changes: number, before: readonly string[] = [], approve: readonly string[] = []) {
  const calls: Call[] = [];
  const held: { id: string; version: string; disabled_at: null; registers: string[] }[] = before.map((id) => ({ id, version: '1.0.0', disabled_at: null, registers: [id] }));
  const ok = (value: unknown) => ({ ok: true, value });
  const client = {
    packs: async () => ok([...held]),
    planPack: async (args: { doc: { pack?: string } }) => {
      calls.push({ name: 'planPack', args });
      const id = args.doc.pack ?? '';
      const again = held.some((p) => p.id === id);
      return ok({ diff: { planHash: `${id}-${held.length}`, adds: again ? [] : [{ id: `register.${id}`, summary: '' }], changes: again ? Array.from({ length: changes }, () => ({ id: 'page.relation' })) : [], retires: [], approve: again ? [...approve] : [] } });
    },
    installPack: async (args: { doc: { pack?: string } }) => {
      calls.push({ name: 'installPack', args });
      const id = args.doc.pack ?? '';
      if (!held.some((p) => p.id === id)) held.push({ id, version: '1.0.0', disabled_at: null, registers: [id] });
      return ok({});
    },
    meet: async () => ok({ row: null, created: false }),
    create: async () => ok({ register: 'people', seq: 1 }),
    update: async () => ok({}),
    packConfig: async () => ok({ config: {} }),
  };
  return { client: client as unknown as Parameters<typeof accept>[0], calls };
}

const asked = (): Accepting => {
  const sentence = "I'm a student";
  const proposal = propose(sentence, { zone: 'Europe/London', locale: 'en-GB' });
  return { sentence, proposal, usecase: null, also: [], modules: ['people', 'money-core'], currency: null, today: '2026-10-06', email: null, nav: [] };
};

const installs = (calls: Call[], id: string) => calls.filter((c) => c.name === 'installPack' && (c.args as { doc: { pack?: string } }).doc.pack === id).length;

test('PEOPLE IS PLANNED AGAIN ONCE MONEY IS IN, and that plan installed when it changes something', async () => {
  const { client, calls } = record(1);
  const out = await accept(client, asked());
  assert.deepEqual(out.failed, []);
  assert.equal(installs(calls, 'money-core'), 1);
  assert.equal(installs(calls, 'people'), 2, 'People was not put in again with the lists after it');
  const last = calls.filter((c) => c.name === 'installPack').at(-1);
  assert.equal((last?.args as { doc: { pack?: string } }).doc.pack, 'people');
});

test('A PLAN THAT CHANGES NOTHING IS NOT INSTALLED', async () => {
  const { client, calls } = record(0);
  await accept(client, asked());
  assert.equal(installs(calls, 'people'), 1);
});

test('A PEOPLE LIST HELD BEFORE IS PLANNED AGAIN ONCE MONEY GOES IN, and goes in only when it asks nothing to approve', async () => {
  const quiet = record(1, ['people']);
  assert.deepEqual((await accept(quiet.client, asked())).failed, []);
  assert.equal(installs(quiet.calls, 'money-core'), 1);
  assert.equal(installs(quiet.calls, 'people'), 1, 'the held People list did not gain what Money brings');
  /* ONE THAT ASKS FOR APPROVAL IS THE PERSON'S TO SEE, at People's own update, and not approved for them here. */
  const asks = record(1, ['people'], ['page.relation']);
  await accept(asks.client, asked());
  assert.equal(installs(asks.calls, 'people'), 0);
  /* NOTHING ADDED, NOTHING PLANNED: a press on a record that holds every list already leaves People as it is. */
  const full = record(1, ['people', 'money-core']);
  await accept(full.client, asked());
  assert.equal(full.calls.filter((c) => c.name === 'planPack').length, 0);
});
