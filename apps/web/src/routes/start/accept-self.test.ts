/**
 * The first run meets the owner as themselves: "Make it mine" (and sign-up, which presses it in the page) meets the
 * person the sentence named (or the name they answered, or the one in their address), with the address they signed in
 * with, and marks that entry as them (People's `self`): the first entry in their People, before any client.
 *
 * A FAKE RECORD, NOT A SOCKET: the client is the handful of calls `accept` makes, each answered as the record answers it
 * for a record that already holds People, so the test is only about who is met and how.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { propose } from '../../lib/start/propose.ts';
import { accept, type Accepting } from './accept.ts';

type Call = { name: string; args: unknown };

/** A record holding People and nothing else, which meets whoever it is told about as `meet` answers. */
function record(met: { created: boolean; matched_by: string; seq?: number | null }) {
  const calls: Call[] = [];
  const said = (name: string, value: unknown) => async (args?: unknown) => {
    calls.push({ name, args });
    return { ok: true, value };
  };
  const client = {
    packs: said('packs', [{ id: 'people', version: '3.0.0', disabled_at: null, registers: ['people'] }]),
    meet: said('meet', { row: { register: 'people', id: 'r1', seq: met.seq === undefined ? 1 : met.seq, name: 'Sami' }, created: met.created, matched_by: met.matched_by }),
    update: said('update', {}),
    create: said('create', { register: 'people', seq: 2 }),
    packConfig: said('packConfig', { config: {} }),
  };
  return { client: client as unknown as Parameters<typeof accept>[0], calls };
}

const asked = (sentence: string, email: string | null): Accepting => {
  const proposal = propose(sentence, { zone: 'Europe/London', locale: 'en-GB' });
  return { sentence, proposal, usecase: null, also: [], modules: ['people'], currency: null, today: '2026-10-06', email, nav: [] };
};

test('THE OWNER IS MET BY NAME AND ADDRESS, AND MARKED AS THEMSELVES', async () => {
  const { client, calls } = record({ created: true, matched_by: 'none' });
  const out = await accept(client, asked("Sami, I'm a student", 'sami@example.com'));
  assert.deepEqual(out.failed, []);
  const meet = calls.find((c) => c.name === 'meet');
  assert.ok(meet, 'the owner was not met');
  assert.equal((meet.args as { name?: string }).name, 'Sami');
  assert.equal((meet.args as { email?: string }).email, 'sami@example.com');
  const self = calls.find((c) => c.name === 'update' && (c.args as { patch?: { self?: unknown } }).patch?.self === true);
  assert.ok(self, 'the row the owner was met as is not marked as them');
  assert.deepEqual((self.args as { register: string; seq: number }).register, 'people');
});

test('A ROW ALREADY KNOWN BY THEIR ADDRESS IS THEM; one matched on a name alone is not marked', async () => {
  const known = record({ created: false, matched_by: 'key' });
  await accept(known.client, asked("Sami, I'm a student", 'sami@example.com'));
  assert.ok(known.calls.some((c) => c.name === 'update' && (c.args as { patch?: { self?: unknown } }).patch?.self === true));

  const namesake = record({ created: false, matched_by: 'strong' });
  await accept(namesake.client, asked("Sami, I'm a student", 'sami@example.com'));
  assert.ok(
    !namesake.calls.some((c) => c.name === 'update' && (c.args as { patch?: { self?: unknown } }).patch?.self === true),
    'a namesake was marked as the owner',
  );
});

test('A NAME WITH NO ROW OF ITS OWN IS WRITTEN AS THEM, marked where the list has the part', async () => {
  const { client, calls } = record({ created: false, matched_by: 'none', seq: null });
  await accept(client, asked("Sami, I'm a student", null));
  const made = calls.filter((c) => c.name === 'create');
  assert.equal(made.length, 1);
  assert.deepEqual((made[0]?.args as { fields: Record<string, unknown> }).fields, { name: 'Sami', note: "I'm a student", self: true });
});

test('WITH NO NAME HEARD, THE PERSON IS STILL THE FIRST IN PEOPLE, by the name in their address (USE-B06)', async () => {
  const { client, calls } = record({ created: true, matched_by: 'none' });
  await accept(client, asked("I'm a student", 'sami@example.com'));
  const meet = calls.find((c) => c.name === 'meet');
  assert.ok(meet, 'a person who gave no name is not in their own People');
  assert.equal((meet.args as { name?: string }).name, 'Sami');
});

test('THE NAME THEY ANSWERED IS THE ONE THEY ARE MET BY, over their address', async () => {
  const { client, calls } = record({ created: true, matched_by: 'none' });
  const a = asked("I'm a student", 'sami.k@example.com');
  await accept(client, { ...a, proposal: { ...a.proposal, answers: { name: 'Layla' } } });
  assert.equal((calls.find((c) => c.name === 'meet')?.args as { name?: string } | undefined)?.name, 'Layla');
});

test('NOBODY IS MET WITH NO NAME AND NO ADDRESS, since a person in People needs one', async () => {
  const { client, calls } = record({ created: true, matched_by: 'none' });
  await accept(client, asked("I'm a student", null));
  assert.equal(calls.filter((c) => c.name === 'meet' || c.name === 'create').length, 0);
});

test('THE PERSON IS PEOPLE’S FIRST ENTRY, before any client the sentence named', async () => {
  const { client, calls } = record({ created: true, matched_by: 'none' });
  await accept(client, asked("I'm Sam, I run Kiln and we bill Fenwick £2,000 a month on the 1st", 'sam@example.com'));
  const meet = calls.findIndex((c) => c.name === 'meet');
  const client1 = calls.findIndex((c) => c.name === 'create' && (c.args as { register?: string }).register === 'people');
  assert.ok(meet >= 0, 'the person was not met');
  assert.ok(client1 > meet, 'a client went into People before the person, or was not written');
});
