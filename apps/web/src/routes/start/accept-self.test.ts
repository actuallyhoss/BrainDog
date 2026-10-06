/**
 * The first run meets the owner as themselves: "Make it mine" (and sign-up, which presses it in the page) meets the
 * person the sentence named, with the address they signed in with, and marks that row as them (People's `self`).
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

test('NOBODY IS MET WITHOUT A NAME HEARD, since a person in People needs one', async () => {
  const { client, calls } = record({ created: true, matched_by: 'none' });
  await accept(client, asked("I'm a student", 'sami@example.com'));
  assert.equal(calls.filter((c) => c.name === 'meet' || c.name === 'create').length, 0);
});
