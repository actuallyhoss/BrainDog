/**
 * People goes in before the lists it links to, so the first run plans it again once they are all in, and installs that
 * plan only when it changes something (`accept.ts` `refreshModule`).
 *
 * A FAKE RECORD, NOT A SOCKET, as `accept-self.test.ts` has it: an empty record that takes People and Money in turn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { propose } from '../../lib/start/propose.ts';
import { accept, fileFor, type Accepting } from './accept.ts';

type Call = { name: string; args: unknown };

/** What a plan of a module the record holds adds and retires, beside its changes. */
type Again = { adds?: readonly { id: string; summary: string; handed?: true }[]; retires?: readonly { id: string; rows: number; to?: string }[] };

/**
 * A record that holds each module once it is installed; a plan of an installed one changes `changes` things, asks for
 * `approve` to be approved, and adds and retires what `again` says. `before` is what it held before the press.
 */
function record(changes: number, before: readonly string[] = [], approve: readonly string[] = [], again: Again = {}) {
  const calls: Call[] = [];
  const held: { id: string; version: string; disabled_at: null; registers: string[] }[] = before.map((id) => ({ id, version: '1.0.0', disabled_at: null, registers: [id] }));
  const ok = (value: unknown) => ({ ok: true, value });
  const client = {
    packs: async () => ok([...held]),
    planPack: async (args: { doc: { pack?: string } }) => {
      calls.push({ name: 'planPack', args });
      const id = args.doc.pack ?? '';
      const was = held.some((p) => p.id === id);
      return ok({
        diff: {
          planHash: `${id}-${held.length}`,
          adds: was ? [...(again.adds ?? [])] : [{ id: `register.${id}`, summary: '' }],
          changes: was ? Array.from({ length: changes }, () => ({ id: 'page.relation' })) : [],
          retires: was ? [...(again.retires ?? [])] : [],
          approve: was ? [...approve] : [],
        },
      });
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

test('A PEOPLE LIST HELD BEFORE IS NOT CHANGED UNDER THE PERSON: the same losses BrainDog\'s own updates check', async () => {
  /* SOMETHING THE PERSON TOOK OFF: a figure People's copy held before Money came, which the record no longer holds. */
  const back = record(1, ['people'], [], { adds: [{ id: 'metric.people-in-touch-30d', summary: '' }] });
  await accept(back.client, asked());
  assert.equal(installs(back.calls, 'people'), 0, 'a figure the person took off came back');
  /* SOMETHING TAKEN AWAY, which was never asked about. */
  const gone = record(1, ['people'], [], { retires: [{ id: 'page.relation', rows: 0 }] });
  await accept(gone.client, asked());
  assert.equal(installs(gone.calls, 'people'), 0, 'a page the person had was taken away');
  /* WHAT THIS PRESS MADE ROOM FOR is new to People's copy, and goes in; so does a declaration handed to another pack. */
  const room = record(1, ['people'], [], { adds: [{ id: 'block.organisation-money', summary: '' }], retires: [{ id: 'page.relation', rows: 0, to: 'money-core' }] });
  await accept(room.client, asked());
  assert.equal(installs(room.calls, 'people'), 1, 'what Money made room for did not go in');
});

/* ── the one answer, and a shop's lists (use case 6, steps 2 and 3) ──────── */

/** A page's cookie jar, for `pref.ts`: what the press writes is what the next read finds. */
function jar(): () => void {
  const was = (globalThis as { document?: unknown }).document;
  let kept = '';
  (globalThis as { document?: unknown }).document = {
    get cookie() {
      return kept;
    },
    set cookie(line: string) {
      kept = line.split(';')[0] ?? '';
    },
  };
  return () => void ((globalThis as { document?: unknown }).document = was);
}

test('THE ONE ANSWER IS KEPT AS PREF arrivesBy, which orders Today’s next steps; none is kept unasked', async () => {
  const done = jar();
  try {
    const { read } = await import('../../lib/pref.ts');
    const a = asked();
    await accept(record(0).client, { ...a, proposal: { ...a.proposal, answers: { arrivesBy: 'messages' } } });
    assert.equal(read().arrivesBy, 'messages', 'the answer to the one question was not kept');
    done();
    const fresh = jar();
    try {
      await accept(record(0).client, asked());
      assert.equal(read().arrivesBy, undefined, 'an answer nobody gave was kept');
    } finally {
      fresh();
    }
  } finally {
    done();
  }
});

test('A SHOP IS MADE WITH ITS ORDERS AND PRODUCTS, and nothing in them that she did not say', async () => {
  const { useCase } = await import('@braindog/seed/usecases');
  const shop = useCase('shop');
  assert.ok(shop, 'there is no shop use case to make');
  const file = await fileFor(shop, ['people', 'money-core'], '2026-10-09', 'I run a small candle shop in Alexandria');
  const pack = (file?.pack ?? {}) as { declarations?: { register?: string }[]; seeds?: unknown[] };
  const lists = (pack.declarations ?? []).flatMap((d) => (typeof d.register === 'string' ? [d.register] : []));
  assert.ok(lists.includes('orders') && lists.includes('products'), `a shop is made without Orders and Products: ${lists.join(', ')}`);
  assert.equal(pack.seeds, undefined, 'a shop is made with entries she did not type');
});
