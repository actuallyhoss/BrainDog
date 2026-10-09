/**
 * The line an add-on's page says about its parts that wait (SHL-A08 job 5): "1 part waits for People."
 *
 * BEFORE: an add-on whose field waited for People installed without it and said nothing anywhere, so a person could not
 * tell a part that waits from a part that is missing. Now the page reads the add-on's own file, lays it over what the
 * record holds, and says how many parts wait and for what, in the names a person knows the lists by.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heldNames, holdName, waitingIn, waitingLine } from './waiting.ts';

const FILE = JSON.stringify({
  pack: 'client-book',
  version: '1.0.0',
  summary: 'A made-up client book for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    {
      register: 'clients',
      name: 'Clients',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'contact', type: 'ref', to: 'people', when: { holds: ['people'] } },
      ],
    },
  ],
});

test('ON A RECORD WITH NO PEOPLE the page says one part waits for People, and nothing once it has them', async () => {
  const none = await heldNames([{ disabled_at: null, registers: ['tasks'] }]);
  assert.equal(waitingLine(await waitingIn(FILE, none)), '1 part waits for People.');
  const some = await heldNames([{ disabled_at: null, registers: ['tasks', 'people'] }]);
  assert.equal(waitingLine(await waitingIn(FILE, some)), null);
});

test('AN ADD-ON THAT IS OFF HOLDS NOTHING, and a list the record has told the screen about counts with its roles', async () => {
  assert.deepEqual([...(await heldNames([{ disabled_at: '2026-10-09T12:00:00Z', registers: ['people'] }]))], []);
  assert.deepEqual([...(await heldNames([], { people: {} }))].sort(), ['meets', 'people']);
  assert.deepEqual([...(await heldNames([], { contacts: { meets: { name: 'name' } } }))].sort(), ['contacts', 'meets']);
});

test('PARTS ARE COUNTED BY WHAT THEY WAIT FOR, in the names a person knows', () => {
  const at = (holds: string[]) => ({ at: 'register.clients.fields[1]', holds });
  assert.equal(waitingLine([at(['people']), at(['people'])]), '2 parts wait for People.');
  assert.equal(waitingLine([at(['people']), at(['projects']), at(['projects'])]), '1 part waits for People, and 2 for Projects.');
  assert.equal(waitingLine([at(['people', 'org'])]), '1 part waits for People and Organisations.');
  assert.equal(waitingLine([]), null);
  assert.equal(holdName('client_visits'), 'Client visits');
  assert.equal(holdName('crm', { crm: 'Contacts' }), 'Contacts');
  /* NO ID, NO EM DASH, NO "ROW" in what a person reads. */
  const line = waitingLine([at(['people']), at(['client_visits'])])!;
  assert.doesNotMatch(line, /—|\brow\b|_/u);
});

test('A FILE THAT CANNOT BE READ SAYS NOTHING WAITS, rather than a count it cannot stand behind', async () => {
  assert.deepEqual(await waitingIn('not a file', new Set()), []);
});
