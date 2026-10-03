/**
 * What the client is told about runs, and what it may ask of the log, through the real wiring.
 *
 * `sessionsLive` ANSWERS `quiet` AND `ran_s` BESIDE `stale`, and the client's `LiveRun` did not name them, so a screen
 * reading a run's state through the client read `undefined` where the record had said a run had gone quiet. And
 * `recentHistory` takes `everything`, the record's bookkeeping as well as its changes, which the client's arguments
 * could not say.
 *
 * NOT A STAND-IN FETCH: `serveApi` over a real record, as `list-include-deleted.test.ts` drives it, so the query string
 * the client writes is the one the host decodes and the record reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '@braindog/host';

import { createClient, type LiveRun } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 9);
const MIN = 60_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'mbp', repo: 'braindog', client: 'claude-code', client_version: '2.1.4' },
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'checked', type: 'instant' },
    ],
  } as never,
};

async function wired() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  const handlers = handlersFor(api);
  const sent: string[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push(`${url.pathname}${url.search}`);
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  return { sql, clock, api, sent, client: createClient({ base: 'https://braindog.example', fetch }) };
}

/** What a live run says of itself that this file is about. */
const pick = (run: LiveRun | undefined) =>
  run === undefined ? undefined : { spoken: run.spoken, stale: run.stale, quiet: run.quiet, ran_s: run.ran_s, client: run.fields.client };

test('A LIVE RUN SAYS IT HAS GONE QUIET, and how long it ran before it did', async () => {
  const { sql, clock, api, client } = await wired();
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Open the run' } }, agent)).ok);
  clock.advance(10 * MIN);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Still at it' } }, agent)).ok);

  const working = await client.sessionsLive();
  assert.ok(working.ok, JSON.stringify(working));
  const [run] = working.value;
  assert.deepEqual(pick(run), { spoken: 'S1', stale: false, quiet: false, ran_s: 600, client: 'claude-code' });

  /* Thirty-one minutes of silence: open is not working, and the run's age stops where it was last heard from. */
  clock.advance(31 * MIN);
  const quiet = await client.sessionsLive();
  assert.ok(quiet.ok, JSON.stringify(quiet));
  assert.deepEqual(pick(quiet.value[0]), { spoken: 'S1', stale: false, quiet: true, ran_s: 600, client: 'claude-code' });
  sql.close();
});

test('THE LOG IS ASKED FOR ITS BOOKKEEPING ONLY WITH everything, as the word the record reads', async () => {
  const { sql, clock, api, sent, client } = await wired();
  /* A STAMP, which is bookkeeping: the agent's run moving an instant it wrote an hour ago to the moment it writes. */
  const made = await api.create({ register: 'tasks', fields: { what: 'Look at the tools', checked: new Date(NOW).toISOString() } }, agent);
  assert.ok(made.ok, JSON.stringify(made));
  clock.advance(60 * MIN);
  const stamped = await api.update({ register: 'tasks', seq: made.value.seq!, patch: { checked: new Date(NOW + 60 * MIN).toISOString() } }, agent);
  assert.ok(stamped.ok, JSON.stringify(stamped));

  const changes = await client.recentHistory({ limit: 5 });
  const all = await client.recentHistory({ limit: 5, everything: true });
  assert.ok(changes.ok, JSON.stringify(changes));
  assert.ok(all.ok, JSON.stringify(all));
  assert.deepEqual(sent, ['/api/recentHistory?limit=5', '/api/recentHistory?limit=5&everything=true']);
  const stamps = (lines: readonly { kind: string; field: string | null }[]) => lines.filter((e) => e.kind === 'edit' && e.field === 'checked').length;
  assert.equal(stamps(changes.value.events), 0, 'the stamp is in the log of changes');
  assert.equal(stamps(all.value.events), 1, 'everything did not bring the stamp back');
  sql.close();
});
