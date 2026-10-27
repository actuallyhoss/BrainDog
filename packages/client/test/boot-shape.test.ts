/**
 * What the client is told by `boot` about the shell's one round trip: its shape, what waits, who is working,
 * the voice and Slash, named by the client's `Boot` so a screen reading them through the client reads what the record
 * said rather than `undefined`.
 *
 * THROUGH THE REAL WIRING, as `runs-read.test.ts` drives it: `serveApi` over a real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '@braindog/host';

import { createClient, type Boot, type BootWaits, type BootWorking } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'mbp', repo: 'braindog', agent: 'claude', client_id: 'c-1', doing: 'Wiring the rail' },
};

async function wired() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), build: { app: 'test', slash: true } });
  const handlers = handlersFor(api);
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => serveApi(new Request(new URL(String(input)), init), handlers, owner)) as typeof globalThis.fetch;
  return { sql, api, client: createClient({ base: 'https://braindog.example', fetch }) };
}

test('BOOT SAYS ITS SHAPE, WHAT WAITS, WHO IS WORKING, THE VOICE AND SLASH, as the client names them', async () => {
  const { sql, api, client } = await wired();
  assert.ok((await api.attach({ source: 'startup' }, agent)).ok);
  assert.ok((await api.propose({ question: 'Pay it?', body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'Due.' }, { id: 'no', label: 'No', because: 'Not yet.' }] } } as never, owner)).ok);
  const out = await client.boot();
  assert.ok(out.ok);
  const boot: Boot = out.value;
  assert.equal(typeof boot.shape, 'number');
  const waits: BootWaits | undefined = boot.waits;
  assert.deepEqual(waits, { questions: 1, late: 0, hard: 0, inbox: 0, working: 1 });
  const working: BootWorking[] | undefined = boot.working;
  assert.deepEqual(
    working?.map((w) => [w.agent, w.doing]),
    [['claude', 'Wiring the rail']],
  );
  assert.deepEqual(boot.voice, { pack: null, values: {}, labels: {} });
  assert.equal(boot.slash, true);
  assert.equal(boot.lateDays, 14);
  /* AND THE RUN IT LISTS LIVE SAYS WHERE IT STANDS. */
  assert.equal(boot.sessions?.[0]?.presence, 'working');
  sql.close();
});
