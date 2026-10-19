/**
 * Your submissions as the store tells them: each state said in words, the decline's reason beside it, and the version
 * a fix goes out as. The store is a function standing in for the network; the add-ons are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSubmissions, stateLine, stateWords, submissionsOf, versionAfter } from './submissions.ts';

const ROWS = [
  { kind: 'pack', id: 'tide-table', title: 'Tide table', version: '1.2.0', state: 'declined', reason: 'The page reads a list it never makes.', at: '2026-10-05' },
  { kind: 'pack', id: 'tide-table', title: 'Tide table', version: '1.1.0', state: 'listed', at: '2026-10-01' },
  { kind: 'pack', id: 'rota', title: 'Rota', version: '1.0.0', state: 'waiting', at: '2026-10-06' },
  { kind: 'pack', id: 'old', title: 'Old', version: '1.0.0', state: 'unpublished', reason: 'Taken back by the person who published it.', at: '2026-09-01' },
  { kind: 'usecase', id: 'a-way', title: 'A way', version: '1.0.0', state: 'listed', at: '2026-09-01' },
  { kind: 'pack', id: 'odd', title: 'Odd', version: '1.0.0', state: 'bounced', at: '2026-09-01' },
];

test('the rows are read as this build knows them, and the ones it does not are left out', () => {
  const rows = submissionsOf({ ok: true, value: { rows: ROWS } });
  assert.deepEqual(
    rows?.map((r) => [r.id, r.version, r.state]),
    [
      ['tide-table', '1.2.0', 'declined'],
      ['tide-table', '1.1.0', 'listed'],
      ['rota', '1.0.0', 'waiting'],
      ['old', '1.0.0', 'unpublished'],
    ],
  );
  assert.equal(submissionsOf({ ok: false }), null);
  assert.equal(submissionsOf('no'), null);
});

test('a decline says the operator\'s words, and says so when there are none', () => {
  assert.equal(stateLine({ state: 'declined', reason: 'Too much.' }), `${stateWords.declined}. ${stateWords.why('Too much.')}`);
  assert.equal(stateLine({ state: 'declined', reason: null }), `${stateWords.declined}. ${stateWords.noReason}`);
  assert.equal(stateLine({ state: 'waiting', reason: null }), stateWords.waiting);
  assert.equal(stateLine({ state: 'listed', reason: null }), stateWords.listed);
});

test('a fix goes out one patch after the newest version of that add-on in any state', () => {
  const rows = submissionsOf({ ok: true, value: { rows: ROWS } }) ?? [];
  assert.equal(versionAfter(rows, 'tide-table'), '1.2.1');
  assert.equal(versionAfter(rows, 'rota'), '1.0.1');
  assert.equal(versionAfter(rows, 'never-sent'), '1.0.0');
  assert.equal(versionAfter([{ id: 'x', version: '1.9.9' }, { id: 'x', version: '1.10.0' }], 'x'), '1.10.1');
});

test('asking sends the key\'s signature when there is one, and says nothing when the store cannot be reached', async () => {
  const sent: string[] = [];
  const store = async (_url: string, init?: RequestInit): Promise<Response> => {
    sent.push(String(init?.body));
    return new Response(JSON.stringify({ ok: true, value: { rows: [ROWS[2]] } }));
  };
  const signature = { alg: 'ed25519', key_id: 'k1', public_key: 'p', sig: 's', signed_at: 't' } as never;
  assert.equal((await readSubmissions(store, async () => signature))?.length, 1);
  assert.equal((await readSubmissions(store, async () => null))?.length, 1);
  assert.match(sent[0] ?? '', /"key_id":"k1"/u);
  assert.equal(sent[1], '{}');
  const down = async (): Promise<Response> => {
    throw new Error('offline');
  };
  assert.equal(await readSubmissions(down, async () => null), null);
});
